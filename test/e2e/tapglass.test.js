/* A TAP STILL PRESSES WITH ANOTHER TOUCH ON THE GLASS, AFTER THE PHONE IS TURNED (ui/tap.js).

   Reported from the installed iPhone app: after turning the phone, either way, the build buttons
   did nothing and stayed that way until a relaunch, while the screen looked right. ui/tap.js
   asked for exactly one touch on the glass (`touches.length === 1`), so a touch that was already
   there - a palm on the edge, a thumb resting on the screen as the phone turned, a touch iOS
   stranded across the rotation - refused every tap after it, and Safari withheld the click as it
   does on this page. The battlefield counts only the touches that began on it, so it went on.

   As in e2e/tap, the browser's own (trusted) clicks are taken away, the way Safari withholds
   them, so a button is pressed only if ui/tap.js presses it. The touches are Chromium's own,
   through the DevTools protocol: a finger is put down on the credits and held, and the build tile
   is tapped with a second. On a phone turned landscape -> portrait -> landscape, with
   RTS_TAP_STRICT (the old rule) as the before-picture:

     THE STAGING      the tile's touch begins with another on the glass, and with clicks taken
                      away a click alone builds nothing
     BEFORE           under the old rule that tap builds nothing
     ON THE GLASS     now it starts the job, in portrait after the turn and in landscape after
                      the turn back - and the other finger lifting first does not cancel it
     STILL A PINCH    a second finger that lands while the tap is down: no press
     STILL A SLIDE    a finger that slides off: no press
     NEVER ENDED      a tap whose touchend never reached the page does not block the next tap
     THE READOUT      the GFX readout's tap line says what became of the tap */

var { chromium, devices } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('tapglass');

(async function () {
  var browser = await chromium.launch();
  var dev = devices['iPhone 13'], W = dev.viewport.width, H = dev.viewport.height;
  var g = await openPage(browser, { device: Object.assign({}, dev, { viewport: { width: H, height: W } }) });
  var p = g.page;
  await g.start(7, 10, { freeze: true });
  var cdp = await g.ctx.newCDPSession(p);
  var nextId = 1;
  function pt(c, id) { return { x: c[0], y: c[1], radiusX: 8, radiusY: 8, force: 1, id: id }; }
  function send(type, pts) { return cdp.send('Input.dispatchTouchEvent', { type: type, touchPoints: pts }); }
  async function settle() { await p.waitForTimeout(90); }

  await p.evaluate(function () {
    window.__drop = true; window.__dropped = 0; window.__starts = [];
    window.addEventListener('click', function (e) {
      if (window.__drop && e.isTrusted) { e.stopImmediatePropagation(); e.preventDefault(); window.__dropped++; }
    }, true);
    /* how many touches were on the glass when each touch began on a build tile - the staging */
    window.addEventListener('touchstart', function (e) {
      if (e.target.closest && e.target.closest('.rts-tile')) window.__starts.push(e.touches.length);
    }, true);
    /* NEVER ENDED: swallow the next touchend before the page sees it, when asked */
    window.__eatEnd = 0;
    window.addEventListener('touchend', function (e) { if (window.__eatEnd > 0) { window.__eatEnd--; e.stopPropagation(); } }, true);
  });
  function spots() {
    return p.evaluate(function () {
      function c(el) { var r = el.getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]; }
      var st = document.querySelector('#rcgRts .rts-stage').getBoundingClientRect();
      return { cred: c(document.querySelector('#rcgRts .rts-credits')), tile: c(document.querySelector('#rtsList .rts-tile')),
               stage: [Math.round(st.left + st.width * 0.6), Math.round(st.top + st.height * 0.4)], vw: innerWidth, vh: innerHeight };
    });
  }
  /* what the first tile (the Power Plant) has started, then put back to nothing */
  function job() {
    return p.evaluate(function () {
      var S = window._rtsG.sides.player, k = S.q.struct ? S.q.struct.key : null;
      if (S.q.struct) _rtsCancel('player', 'struct');
      return k;
    });
  }
  /* the readout as it paints, held open: its last line is the tap's */
  function note() {
    return p.evaluate(function () {
      _RTS_GFX.on = true; _RTS_GFX.paint = 0; _rtsGfxFrame();
      var el = document.getElementById('rtsGfxOut'), s = el ? el.textContent : '';
      return s.split('\n').pop();
    });
  }
  /* a finger held on the credits while another taps the tile; the protocol lifts the held one
     first, so the tap also has to survive another finger's touchend */
  async function glassTap(sp) {
    var a = nextId++, b = nextId++;
    await send('touchStart', [pt(sp.cred, a)]); await settle();
    await send('touchStart', [pt(sp.cred, a), pt(sp.tile, b)]); await settle();
    await send('touchMove', [pt(sp.tile, b)]); await settle();
    await send('touchEnd', []); await settle();
    return job();
  }
  async function plainTap(c) {
    await send('touchStart', [pt(c, nextId++)]); await settle();
    await send('touchEnd', []); await settle();
  }

  /* ---- the control and the staging, in landscape ---- */
  var sp = await spots();
  var mc = sp.tile;
  await p.mouse.click(mc[0], mc[1]); await settle();
  var ctl = await job(), dropped = await p.evaluate(function () { return window.__dropped; });
  S.ok('with the browser\'s clicks taken away, a click alone builds nothing (control)', ctl === null && dropped >= 1,
       dropped + ' clicks dropped, job ' + ctl);
  await plainTap(sp.tile);
  S.eq('a plain tap on the tile starts its job', await job(), 'power');

  /* ---- turned to portrait ---- */
  await p.setViewportSize({ width: W, height: H });
  await p.waitForFunction(function (w) { return _rtsR.W === w; }, W, { timeout: 15000 }).catch(function () {});
  sp = await spots();
  await p.evaluate(function () { window.RTS_TAP_STRICT = true; window.__starts.length = 0; });
  var before = await glassTap(sp);
  var starts = await p.evaluate(function () { return window.__starts.slice(); });
  await p.evaluate(function () { window.RTS_TAP_STRICT = false; window.__starts.length = 0; });
  S.ok('(the staging: turned to portrait, the tile\'s touch begins with another on the glass)',
       sp.vw === W && sp.vh === H && starts.length === 1 && starts[0] === 2, sp.vw + 'x' + sp.vh + ', touches on the glass at the tap: ' + starts.join(','));
  S.ok('BEFORE: under the old rule (one touch on the glass) that tap builds nothing', before === null, 'job ' + before);
  var port = await glassTap(sp), portNote = await note();
  S.eq('ON THE GLASS: in portrait after the turn, the tap starts the job', port, 'power');
  S.ok('THE READOUT: its tap line says the tile was pressed, with two touches on the glass', /^tap: pressed Power Plant \(2 touches/.test(portNote),
       portNote.trim());

  /* ---- a second finger during the tap is still a pinch ---- */
  var a = nextId++, b = nextId++;
  await send('touchStart', [pt(sp.tile, a)]); await settle();
  await send('touchStart', [pt(sp.tile, a), pt(sp.stage, b)]); await settle();
  await send('touchEnd', []); await settle();
  var pinch = await job(), pinchNote = await note();
  S.ok('STILL A PINCH: a second finger landing while the tap is down - no press', pinch === null && /second finger/.test(pinchNote),
       'job ' + pinch + '; ' + pinchNote.trim());

  /* ---- a slide is still a slide ---- */
  var s1 = nextId++;
  await send('touchStart', [pt(sp.tile, s1)]); await settle();
  await send('touchMove', [pt([sp.tile[0], sp.tile[1] + 24], s1)]); await settle();
  await send('touchEnd', []); await settle();
  var slid = await job();
  S.ok('STILL A SLIDE: a finger that slides off the tile does not press it', slid === null, 'job ' + slid);

  /* ---- a tap whose end never came ---- */
  await p.evaluate(function () { window.__eatEnd = 1; });
  await plainTap(sp.tile);
  var lost = await job();
  var stale = await p.evaluate(function () { return RTS_TAP_STALE; });
  await p.waitForTimeout(stale + 150);
  await plainTap(sp.tile);
  var next = await job();
  S.ok('NEVER ENDED: a tap whose touchend never reached the page does not block the next one',
       lost === null && next === 'power', 'the lost tap: ' + lost + '; the next, ' + stale + 'ms on: ' + next);

  /* ---- turned back to landscape ---- */
  await p.setViewportSize({ width: H, height: W });
  await p.waitForFunction(function (w) { return _rtsR.W > w; }, W, { timeout: 15000 }).catch(function () {});
  sp = await spots();
  var land = await glassTap(sp);
  S.ok('ON THE GLASS: in landscape after the turn back, the tap starts the job', sp.vw === H && land === 'power',
       sp.vw + 'x' + sp.vh + ', job ' + land);

  var errs = g.errors.filter(function (e) { return !/ServiceWorker/.test(e); });
  S.ok('no page errors', !errs.length, errs.join(' | ') || 'none');
  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
