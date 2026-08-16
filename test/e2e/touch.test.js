/* Can the map be moved with a finger?

   Reported from an iPhone: it could not. Every way of moving the camera needed hardware a
   phone does not have - WASD, the arrow keys, hovering against a screen edge, the wheel, the
   right button - so there was no path at all.

   Driven through Playwright's real touchscreen (CDP Input.dispatchTouchEvent), not by
   dispatching synthetic TouchEvents from inside the page: a hand-made event would test our
   listeners against our own idea of what Safari sends, which is exactly the assumption worth
   checking. Each gesture is asserted on its OUTCOME - where the camera ended up, what is
   selected, what zoom level - rather than on any handler being called. */

var { chromium, devices } = require('playwright');
var { serve } = require('../lib/game.js');

(async function () {
  var s = await serve();
  var srv = s.srv, PAGE = s.url;
var browser = await chromium.launch();
  /* A real iPhone profile: touch on, no hover, coarse pointer, 3x DPR. */
  var ctx = await browser.newContext(Object.assign({}, devices['iPhone 13'], { isMobile: true }));
  var page = await ctx.newPage();
  var errs = [];
  page.on('pageerror', function (e) { errs.push(String(e)); });
  await page.goto(PAGE, { waitUntil: 'load' });
  await page.waitForFunction(function () { return typeof window.rtsOpen === 'function'; });

  await page.evaluate(function () {
    /* PINNED TO 2D, like every other spec - and this file has to do it by hand because it is
       the one that never took the shared harness (it keeps its own page setup for the iPhone
       profile and only borrows `serve`), so test/lib/game.js's pin never reaches it.

       This is a spec about the INPUT layer: whether a finger drag pans, a tap selects, a hold
       orders and two fingers zoom. The renderer under it is not the subject, and e2e/pan
       already grades dragging in 3D, where the vertical component carries a cos(tilt) the flat
       camera does not.

       Left unpinned it did not fail honestly, either - it failed by being SLOW. When 3D became
       the default this ran the whole GL renderer at iPhone 13 resolution and 3x DPR through a
       software rasteriser: the spec went from 10.8s to 37.9s, and every single-finger gesture
       came back dead - drag 0.0 world units, tap selected nothing, hold issued no order -
       while the pinch, which needs no frames in between, still worked. That is a starved rAF
       loop reported as broken input. */
    try { window.localStorage.setItem(RTS_3D_LS, '0'); } catch (e) {}
    rtsOpen(7);
    for (var i = 0; i < 60 * 25; i++) _rtsTick(1 / 60);
  });
  await page.waitForTimeout(400);

  var cdp = await ctx.newCDPSession(page);
  function pt(x, y) { return { x: x, y: y, radiusX: 12, radiusY: 12, force: 1 }; }
  async function touch(type, points) {
    await cdp.send('Input.dispatchTouchEvent', { type: type, touchPoints: points });
  }
  async function drag(x0, y0, x1, y1, steps) {
    await touch('touchStart', [pt(x0, y0)]);
    for (var s = 1; s <= steps; s++) {
      await touch('touchMove', [pt(x0 + (x1 - x0) * s / steps, y0 + (y1 - y0) * s / steps)]);
      await page.waitForTimeout(16);
    }
    await touch('touchEnd', []);
  }

  var box = await page.evaluate(function () {
    var r = document.getElementById('rtsCv').getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  });
  var cx = Math.round(box.x + box.w / 2), cy = Math.round(box.y + box.h / 2);

  function focus() { return page.evaluate(function () { return { x: _rtsR.focus.x, z: _rtsR.focus.z }; }); }

  /* ---- 1. one-finger drag pans ---- */
  var f0 = await focus();
  await drag(cx + 70, cy + 70, cx - 70, cy - 70, 8);
  await page.waitForTimeout(120);
  var f1 = await focus();
  var moved = Math.hypot(f1.x - f0.x, f1.z - f0.z);

  /* ---- 2. a tap selects, and does NOT pan ---- */
  var sel = await page.evaluate(async function () {
    var G = window._rtsG;
    G.sel.length = 0;
    /* put one of our own units dead centre so a tap has something to hit */
    var mine = G.ents.filter(function (e) { return !e.dead && e.type === 'unit' && e.side === 'player'; })[0];
    if (!mine) return { error: 'no player unit' };
    mine.x = _rtsR.focus.x; mine.z = _rtsR.focus.z;
    _rtsRFrame(0);
    return { before: G.sel.length, unit: mine.def };
  });
  var f2 = await focus();
  await touch('touchStart', [pt(cx, cy)]);
  await page.waitForTimeout(60);
  await touch('touchEnd', []);
  await page.waitForTimeout(120);
  var afterTap = await page.evaluate(function () { return window._rtsG.sel.length; });
  var f3 = await focus();
  var tapDrift = Math.hypot(f3.x - f2.x, f3.z - f2.z);

  /* ---- 3. long-press issues the context order ---- */
  var order = await page.evaluate(function () {
    var G = window._rtsG;
    var u = G.sel[0];
    if (!u) return { error: 'nothing selected to order' };
    u.order = null; u.path = null;
    return { def: u.def };
  });
  await touch('touchStart', [pt(cx + 90, cy + 60)]);
  await page.waitForTimeout(500);                 /* past the 350ms hold */
  await touch('touchEnd', []);
  await page.waitForTimeout(150);
  var ordered = await page.evaluate(function () {
    var u = window._rtsG.sel[0];
    return !!(u && (u.path || u.goal || u.order));
  });

  /* ---- 4. pinch zooms ---- */
  var z0 = await page.evaluate(function () { return _rtsZoom(); });
  await touch('touchStart', [pt(cx - 40, cy), pt(cx + 40, cy)]);
  await page.waitForTimeout(30);
  await touch('touchMove', [pt(cx - 110, cy), pt(cx + 110, cy)]);
  await page.waitForTimeout(60);
  await touch('touchEnd', []);
  await page.waitForTimeout(120);
  var z1 = await page.evaluate(function () { return _rtsZoom(); });

  /* ---- 5. the hint line says touch verbs, not mouse ones ---- */
  var hint = await page.evaluate(function () {
    var d = document.querySelector('#rcgRts .rts-help.desk');
    var t = document.querySelector('#rcgRts .rts-help.touch');
    function vis(el) { return !!(el && getComputedStyle(el).display !== 'none'); }
    return { desk: vis(d), touch: vis(t), text: t ? t.textContent : '' };
  });

  console.log('one-finger drag: camera moved ' + moved.toFixed(1) + ' world units');
  console.log('tap: selected ' + afterTap + ' (was ' + sel.before + ')   camera drift ' +
              tapDrift.toFixed(2));
  console.log('long-press: order issued ' + ordered);
  console.log('pinch out: zoom ' + z0.toFixed(2) + ' -> ' + z1.toFixed(2));
  console.log('hint line: touch shown ' + hint.touch + ', desktop hidden ' + !hint.desk);
  console.log('  "' + hint.text + '"');

  var fails = [];
  if (sel.error)  fails.push(sel.error);
  if (moved < 20) fails.push('a one-finger drag moved the camera ' + moved.toFixed(1) +
                             ' - the map still cannot be moved');
  if (!afterTap)  fails.push('a tap selected nothing');
  if (tapDrift > 1) fails.push('a tap moved the camera by ' + tapDrift.toFixed(2) + ' - taps are panning');
  if (!ordered)   fails.push('a long-press issued no order');
  if (z1 <= z0)   fails.push('pinching out did not zoom in (' + z0 + ' -> ' + z1 + ')');
  if (!hint.touch) fails.push('the touch hint line is not shown on a touch device');
  if (hint.desk)  fails.push('the mouse hint line is still shown on a touch device');
  if (errs.length) fails.push('page errors: ' + errs.join(' | '));
  console.log(fails.length ? 'FAIL\n  ' + fails.join('\n  ') : 'PASS');

  await browser.close();
  srv.close();
  process.exit(fails.length ? 1 : 0);
})();
