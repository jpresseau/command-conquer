/* What happens when the game throws mid-match.

   It used to be: nothing you could see, forever. _rtsTick shared one try with the renderer, the
   HUD and the sidebar, so everything that could have TOLD the player sat after the throw and was
   skipped with it. The catch called _rtsSay, which only writes G.msg - and G.msg is painted by
   _rtsSyncSidebar, three lines below the thing that threw.

   Measured before the fix, seed 7, by giving one live unit a `def` that is not in the roster:

     canvas          identical toDataURL over 1.2s - frozen
     #rtsMsg         "" - empty, while G.msg held the whole error
     exceptions      58 per second, for as long as the tab stayed open
     pageerror       0 - nothing outside the page could see it either

   That last line is why this spec is worth its runtime beyond the player-facing part: a silent
   infinite throw is indistinguishable from a hang, and it is exactly what two agents auditing
   this codebase hit when their headless matches "hung with no error".

   The fix is three separate claims, and they are asserted separately because they fail for
   different reasons: the simulation dies without taking the picture with it; the explanation
   reaches the screen even when the half that paints is the half that broke; and a loop that
   cannot recover stops rather than pinning a core. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('crash');

/* A cheap hash of the canvas. Comparing whole data URLs is the same test with more bytes. */
function shotFn() {
  var c = _rtsR.cv, d = c.toDataURL(), h = 0;
  for (var i = 0; i < d.length; i += 97) h = (Math.imul(h, 31) + d.charCodeAt(i)) | 0;
  var el = document.getElementById('rtsMsg');
  return { hash: h, msg: el ? el.textContent : null,
           errs: window._rtsUI.errs || 0, raf: window._rtsUI.raf || 0,
           simDead: !!window._rtsUI.simDead, drawDead: !!window._rtsUI.drawDead,
           lastErr: window._rtsUI.lastErr || null };
}

(async function () {
  var browser = await chromium.launch();

  /* IS THE PICTURE MOVING? Not "did two frames differ" - the battlefield animates on a cycle,
     and two samples an arbitrary interval apart land on the same phase often enough to make
     that a coin toss. Measured: frames 800ms apart hashed identically twice in eight samples on
     a perfectly healthy match. Take several and ask whether they are ALL the same, which is
     what "frozen" actually means. */
  async function moving(g, n, ms) {
    var seen = {};
    for (var i = 0; i < n; i++) {
      var r = await g.page.evaluate(shotFn);
      seen[r.hash] = 1;
      if (i < n - 1) await g.page.waitForTimeout(ms);
    }
    return Object.keys(seen).length;
  }

  async function fresh() {
    var g = await openPage(browser, { width: 900, height: 700 });
    /* NOT frozen. Everything here is about the real requestAnimationFrame loop - a spec that
       drove _rtsTick by hand would never enter the code under test. */
    await g.start(7, 12);
    return g;
  }

  /* ---------------- 1. a control: a healthy match paints and throws nothing ------------- */
  var g = await fresh();
  var errors = [];
  g.page.on('pageerror', function (e) { errors.push(String(e.message || e)); });
  var distinct = await moving(g, 5, 220);
  var b = await g.page.evaluate(shotFn);
  S.ok('a healthy match keeps painting new frames', distinct > 1,
       distinct + ' distinct frames out of 5');
  S.eq('...and throws nothing', b.errs, 0);
  S.eq('...and shows no error line', b.msg, '');

  /* ---------------- 2. the simulation dies; the picture does not ------------------------ */
  var sim = await g.page.evaluate(function () {
    /* _rtsUpdateAI is reached from _rtsTick and from nothing the renderer touches, so this
       breaks exactly one half. If it were not on the tick path the counters below would stay
       at zero and this spec would fail rather than quietly proving nothing. */
    window._rtsUpdateAI = function () { throw new Error('SIM ONLY'); };
    return true;
  });
  S.ok('a sim-only fault is armed', sim, '');
  await g.page.waitForTimeout(1600);
  var liveFrames = await moving(g, 5, 220);
  var d = await g.page.evaluate(shotFn);
  S.ok('the picture goes on moving with the simulation dead', liveFrames > 1,
       liveFrames + ' distinct frames out of 5, simDead=' + d.simDead);
  S.ok('the simulation is given up on rather than retried forever', d.simDead, '');
  S.ok('...and the error text reaches the screen', /SIM ONLY/.test(d.msg || ''),
       JSON.stringify(d.msg));
  S.ok('...saying the battle stopped, not just naming the exception',
       /battle has stopped/.test(d.msg || ''), JSON.stringify(d.msg));

  /* Bounded: the whole point is that it stops throwing. */
  var e1 = await g.page.evaluate(function () { return window._rtsUI.errs; });
  await g.page.waitForTimeout(1000);
  var e2 = await g.page.evaluate(function () { return window._rtsUI.errs; });
  S.eq('it stops throwing once it has given up', e2 - e1, 0);
  S.ok('...having given up inside about a second, not immediately and not never',
       e2 >= 30 && e2 <= 200, e2 + ' frames tried');
  S.ok('...and the render loop is still running, so the sidebar and menu still work',
       !d.drawDead && d.raf !== 0, 'raf ' + d.raf);
  S.eq('none of this reached the console as an uncaught error', errors.length, 0);
  await g.close();

  /* ---------------- 3. a single bad frame is ridden out --------------------------------- */
  g = await fresh();
  var once = await g.page.evaluate(function () {
    var real = window._rtsUpdateAI, done = false;
    window._rtsUpdateAI = function (dt) {
      if (!done) { done = true; throw new Error('ONE BAD FRAME'); }
      return real(dt);
    };
    return true;
  });
  S.ok('a one-off fault is armed', once, '');
  await g.page.waitForTimeout(1200);
  var one = await g.page.evaluate(shotFn);
  S.ok('one bad frame does not end the match', !one.simDead,
       'errs ' + one.errs + ', simDead ' + one.simDead);
  S.eq('...and exactly one error was counted', one.errs, 1);
  S.ok('...but the player is still told about it', /ONE BAD FRAME/.test(one.msg || ''),
       JSON.stringify(one.msg));

  /* A SECOND, DIFFERENT fault must also be reported. The old guard was a single `errShown`
     flag set on the first error ever, so a match that survived one fault swallowed every
     later one for good. */
  await g.page.evaluate(function () {
    window._rtsUpdateAI = function () { throw new Error('A DIFFERENT FAULT'); };
  });
  await g.page.waitForTimeout(300);
  var two = await g.page.evaluate(shotFn);
  S.ok('a later, different fault is reported rather than swallowed',
       /A DIFFERENT FAULT/.test(two.lastErr || '') || /A DIFFERENT FAULT/.test(two.msg || ''),
       JSON.stringify(two.lastErr) + ' / ' + JSON.stringify(two.msg));
  await g.close();

  /* ---------------- 4. both halves broken: the loop stops, and says so ------------------ */
  g = await fresh();
  var errors2 = [];
  g.page.on('pageerror', function (e) { errors2.push(String(e.message || e)); });
  await g.page.evaluate(function () {
    /* A def outside the roster breaks the simulation AND the renderer, which both look the
       unit's definition up. This is the original reproduction. */
    var u = window._rtsG.ents.filter(function (x) {
      return !x.dead && x.type === 'unit' && x.side === 'player'; })[0];
    u.def = 'notarealunitkey';
  });
  await g.page.waitForTimeout(2000);
  var f1 = await g.page.evaluate(shotFn);
  await g.page.waitForTimeout(1000);
  var f2 = await g.page.evaluate(shotFn);
  S.ok('with the renderer broken too, the loop is stopped rather than left spinning',
       f2.drawDead && f2.raf === 0, 'drawDead ' + f2.drawDead + ', raf ' + f2.raf);
  S.eq('...so it stops throwing', f2.errs - f1.errs, 0);
  S.ok('...and the player is told, by writing the element rather than going through the game',
       /has stopped/.test(f2.msg || ''), JSON.stringify(f2.msg));
  S.ok('...naming the actual error', (f2.msg || '').length > 30, JSON.stringify(f2.msg));
  S.eq('still nothing uncaught on the console', errors2.length, 0);
  await g.close();

  await browser.close();
  require('../lib/report.js')(S);
})();
