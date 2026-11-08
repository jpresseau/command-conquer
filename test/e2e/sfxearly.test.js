/* THE BATTLE'S SOUNDS ARE READY BEFORE THE BATTLE - audio/bank.js, _rtsBankEarly.

   Every effect was rendered the first time it was heard, on the frame that wanted it, until the
   bank's idle filling caught up - which on a phone in a battle took minutes. Measured in the
   harness: the first cannon of a fight 41 ms, the first kill 25 ms, one stall each, and a big
   fight is where they all come at once. The title screen renders every effect's first take now.

     ON THE TITLE   every effect's first take is rendered before any battle, with no sound
                    unlocked yet, and the battle's own sounds lead the queue
     IN THE BATTLE  every one of them plays without a single take rendered on the frame
     THE CONTROL    a take the title did not render IS counted when it is rendered on demand,
                    and costs the frame what the early render saves it */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('sfxearly');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 900, height: 700, dpr: 1 });

  /* the title alone: no battle, no sound unlocked */
  await g.page.waitForFunction(function () {
    var E = window._rtsBankEarlyQ;
    return E && E.q && E.q.length === 0;
  }, null, { timeout: 120000, polling: 250 }).catch(function () {});
  var title = await g.page.evaluate(function () {
    var E = _rtsBankEarlyQ, names = rtsSfxNames(), gap = Object.keys(_RTS_SFX_GAP);
    var order = _rtsBankQueue().slice(0, gap.length).map(function (w) { return w[0]; });
    return { left: E.q ? E.q.length : -1, have: Object.keys(E.x).length, names: names.length,
             missing: names.filter(function (n) { return !E.x[n + '#0']; }),
             audio: !!window._rtsA, gap: gap.length, gapKnown: gap.filter(function (n) { return names.indexOf(n) >= 0; }).length,
             leads: order.every(function (n) { return _RTS_SFX_GAP[n]; }) };
  });
  S.ok('on the title no sound has been unlocked yet', !title.audio, String(title.audio));
  S.ok('the title renders every effect\'s first take', title.left === 0 && title.have === title.names && !title.missing.length,
       title.have + ' of ' + title.names + (title.missing.length ? ', missing ' + title.missing.join(' ') : ''));
  S.ok('the battle\'s frequent sounds are effects the bank knows', title.gapKnown === title.gap && title.gap > 5, title.gapKnown + ' of ' + title.gap);
  S.ok('...and they lead the queue', title.leads, '');

  await g.start(7, 1);
  var fight = await g.page.evaluate(function () {
    var A = window._rtsA, E = _rtsBankEarlyQ, o = { audio: !!(A && A.ctx) };
    if (!o.audio) return o;
    /* E.live counts from the page's load: every take rendered on demand since, in the battle's
       opening as well as in these plays */
    var gap = Object.keys(_RTS_SFX_GAP), worst = 0;
    o.before = gap.filter(function (n) { return !!_rtsBank(A).take[n + '#0']; }).length;
    gap.forEach(function (n) {
      var t = performance.now(); _rtsSfxPlay(n, A.ctx.currentTime, null); worst = Math.max(worst, performance.now() - t);
    });
    o.live = E.live; o.worst = +worst.toFixed(2);
    o.built = gap.filter(function (n) { return !!_rtsBank(A).take[n + '#0']; }).length; o.gap = gap.length;
    o.rate = _rtsBank(A).take['boom#0'] ? _rtsBank(A).take['boom#0'].sampleRate : 0;
    /* the control: a take nobody rendered early - a second take - costs the frame its render */
    var k = 'boom#1', had = !!_rtsBank(A).take[k], live1 = E.live, t1 = performance.now();
    if (!had) _rtsBankBuf(A, 'boom', 1, true);
    o.ctlHad = had; o.ctlLive = E.live - live1; o.ctlMs = +(performance.now() - t1).toFixed(2);
    return o;
  });
  S.ok('the battle has sound to play', fight.audio, String(fight.audio));
  if (fight.audio) {
    S.eq('no play has waited on a render since the page loaded, every frequent battle sound played', fight.live, 0);
    S.note('    ' + fight.before + ' of ' + fight.gap + ' already in the bank when the plays began; the slowest play ' + fight.worst + ' ms');
    S.eq('...and every one of them is in the bank after playing', fight.built, fight.gap);
    S.eq('...as a buffer at the early render\'s own rate', fight.rate, 48000);
    S.ok('control: a take the title did not render is still to render', !fight.ctlHad, String(fight.ctlHad));
    S.eq('...and rendering it on demand is counted', fight.ctlLive, 1);
    S.ok('...and costs the frame more than all the early ones together', fight.ctlMs > Math.max(fight.worst * 3, 1),
         'one on demand ' + fight.ctlMs + ' ms; the slowest early play ' + fight.worst + ' ms');
  }
  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
