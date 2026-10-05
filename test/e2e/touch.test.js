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
    /* THE FRAME LOOP IS STOPPED, because this is a spec about the INPUT layer: whether a finger
       drag pans, a tap selects, a hold orders and two fingers zoom. The renderer is not the
       subject, and at iPhone resolution a software rasteriser takes longer than the 350 ms hold
       over one frame - so the hold timer fired between a drag's touchstart and its first
       touchmove, the drag became a long-press, and it came back as "drag 0.0 world units", on
       some runs and not others. Every handler here acts synchronously except the zoom's glide,
       which the spec steps itself. */
    try { window.localStorage.setItem('rtsGfxQ', 'low'); } catch (e) {}
    rtsOpen(7);
    for (var i = 0; i < 60 * 25; i++) _rtsTick(1 / 60);
    if (window._rtsUI) window._rtsUI.dead = true;
    _rtsRFrame(0);
  });

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
    /* where it is DRAWN: the camera leans, so a unit stands up the screen from its ground point */
    var s = _rtsScreenOf(mine);
    return { before: G.sel.length, unit: mine.def, sx: s.x, sy: s.y };
  });
  var f2 = await focus();
  var tx = sel.error ? cx : Math.round(box.x + sel.sx), ty = sel.error ? cy : Math.round(box.y + sel.sy);
  await touch('touchStart', [pt(tx, ty)]);
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

  /* ---- 3b. a long-press on an aircraft orders on the aircraft, not where it has flown from ----
     The hold fires 350ms after the finger lands; picked then, a gunship in flight had left the
     spot and a Flak Track held on it got a move to the ground (ui/input.js picks at touchstart).
     The gunship is moved twelve cells between the press and the hold, as flight would. */
  var air = await page.evaluate(function () {
    var G = window._rtsG, c = _rtsNearestOpen(_rtsTX(_rtsR.focus.x), _rtsTX(_rtsR.focus.z), 10, null);
    var ft = _rtsSpawnUnit('player', 'flaktrack', _rtsWX(c[0]) - 6 * RTS_TILE, _rtsWX(c[1]));
    var hl = _rtsSpawnUnit('enemy', 'heli', _rtsWX(c[0]), _rtsWX(c[1]));
    hl.order = 'hold'; hl.path = null;
    G.sel = [ft];
    window._rtsHeliT = hl; window._rtsFlakT = ft;
    var s = _rtsScreenOf(hl), r = document.getElementById('rtsCv').getBoundingClientRect();
    var p0 = _rtsPickAt(s.x, s.y);
    return { x: s.x + r.left, y: s.y + r.top, picked: !!(p0 && p0.ent === hl) };
  });
  await touch('touchStart', [pt(air.x, air.y)]);
  await page.evaluate(function () { window._rtsHeliT.x += 12 * RTS_TILE; });
  await page.waitForTimeout(500);
  await touch('touchEnd', []);
  await page.waitForTimeout(150);
  var airOrd = await page.evaluate(function () {
    var f = window._rtsFlakT;
    return { order: f.order, onHeli: f.target === window._rtsHeliT };
  });

  /* ---- 3c. a steady finger with a weapon armed fires it, and orders nobody ----
     The hold used to give the selection a context order to the spot meant for the fog, and the
     weapon stayed armed (ui/input.js leaves an armed weapon's press to touchend, as placement). */
  var armS = await page.evaluate(function () {
    var G = window._rtsG, yd = _rtsHas('player', 'yard'), b = null;
    for (var r = 4; r < 30 && !b; r++) for (var a = 0; a < 8 && !b; a++) {
      var sp = _rtsNearestOpen(yd.tx + Math.round(Math.cos(a) * r), yd.tz + Math.round(Math.sin(a) * r), 3, null);
      if (sp && _rtsCanPlace('player', 'mist', sp[0], sp[1], true)) { b = _rtsPlaceStruct('player', 'mist', sp[0], sp[1], true); if (b) b.building = 0; }
    }
    var S2 = G.sides.player; S2.supers = S2.supers || {}; S2.supers.fogbank = { t: 1e3, ready: true, said: true };
    window._rtsUI.superArm = 'fogbank';
    var u = window._rtsFlakT; G.sel = [u]; u.order = null; u.path = null; u.target = null; u.goal = null;
    return { tower: !!b, wx0: (G.wx || []).length };
  });
  await touch('touchStart', [pt(cx - 60, cy + 40)]);
  await page.waitForTimeout(500);                 /* past the 350ms hold */
  await touch('touchEnd', []);
  await page.waitForTimeout(150);
  var armE = await page.evaluate(function () {
    var G = window._rtsG, u = window._rtsFlakT;
    return { wx1: (G.wx || []).filter(function (c) { return c.kind === 'fog'; }).length, armed: window._rtsUI.superArm, order: u.order, goal: !!u.goal };
  });

  /* ---- 4. pinch zooms ---- */
  var z0 = await page.evaluate(function () { return _rtsZoom(); });
  await touch('touchStart', [pt(cx - 40, cy), pt(cx + 40, cy)]);
  await page.waitForTimeout(30);
  await touch('touchMove', [pt(cx - 110, cy), pt(cx + 110, cy)]);
  await page.waitForTimeout(60);
  await touch('touchEnd', []);
  await page.waitForTimeout(120);
  var z1 = await page.evaluate(function () {
    for (var i = 0; i < 90; i++) _rtsZoomTick(1 / 30);       /* the glide the loop would run */
    return _rtsZoom();
  });

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
  console.log('long-press on a gunship that flies on: picked under the finger ' + air.picked + ', order ' + airOrd.order + ', on the gunship ' + airOrd.onHeli);
  console.log('steady finger with the Fog Bank armed: fog cells ' + armS.wx0 + ' -> ' + armE.wx1 + ', armed ' + armE.armed + ', the selection\'s order ' + armE.order);
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
  if (!air.picked) fails.push('the staging: the gunship is not under the finger');
  else if (!(airOrd.order === 'attack' && airOrd.onHeli)) fails.push('a long-press on a gunship that flew on gave the Flak Track "' + airOrd.order + '", not an attack on it');
  if (!armS.tower) fails.push('the staging: no Mist Tower could be placed');
  else if (!(armE.wx1 === armS.wx0 + 1 && !armE.armed && !armE.order && !armE.goal)) fails.push('a steady finger with the Fog Bank armed did not fire it, or ordered the selection (' + JSON.stringify(armE) + ')');
  if (z1 <= z0)   fails.push('pinching out did not zoom in (' + z0 + ' -> ' + z1 + ')');
  if (!hint.touch) fails.push('the touch hint line is not shown on a touch device');
  if (hint.desk)  fails.push('the mouse hint line is still shown on a touch device');
  if (errs.length) fails.push('page errors: ' + errs.join(' | '));
  console.log(fails.length ? 'FAIL\n  ' + fails.join('\n  ') : 'PASS');

  await browser.close();
  srv.close();
  process.exit(fails.length ? 1 : 0);
})();
