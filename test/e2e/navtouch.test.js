/* GETTING AROUND THE MAP WITH FINGERS - the touch half of ui/navigate.js; e2e/navigate is the
   mouse and the keys, e2e/touch the one-finger basics on a phone.

   Real touch, through CDP's Input.dispatchTouchEvent in a touch-enabled context - not TouchEvents
   built in the page, which would test the listeners against this project's own idea of what a
   browser sends. Graded on where the ground ended up:

     A PINCH IN 3D      follows the fingers - twice the spread is a rung in - about their
                        midpoint, and moving both fingers together pans
     A RESTING FINGER   one on the sidebar does not turn a one-finger drag on the battlefield into
                        a pinch against a finger that never moves */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('navtouch');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { device: { viewport: { width: 900, height: 640 }, deviceScaleFactor: 1 } });
  await g.start(7, 20, { freeze: true });
  var P = g.page, cdp = (await g.touch()).cdp;
  /* points carry ids, so a finger that stays down is the same finger from one event to the next */
  function touch(type, pts) {
    return cdp.send('Input.dispatchTouchEvent', { type: type, touchPoints: pts.map(function (p) {
      return { x: p[0], y: p[1], id: p[2], radiusX: 10, radiusY: 10, force: 1 };
    }) });
  }
  var box = await P.evaluate(function () { var r = document.getElementById('rtsCv').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  function park(zi) {
    return P.evaluate(function (zi) {
      var R = _rtsR, U = window._rtsUI;
      U.keys = {}; U.zAcc = 0; window._rtsG.sel.length = 0;
      R.focus.x = _rtsWX(RTS_N / 2); R.focus.z = _rtsWX(RTS_N / 2);
      R.zi = zi; _rtsApplyCam(); _rtsClampFocus();
    }, zi);
  }
  /* page coordinates <-> the canvas's own, which the camera speaks */
  function ground(x, y) { return P.evaluate(function (a) { var w = _rtsGroundAt(a[0], a[1]); return w && { x: w.x, z: w.z }; }, [x - box.x, y - box.y]); }
  function slip(w, x, y) {
    return P.evaluate(function (a) {
      var s = _rtsGroundToScreen(a[0].x, a[0].z);
      return +Math.hypot(s.x - a[1], s.y - a[2]).toFixed(2);
    }, [w, x - box.x, y - box.y]);
  }
  function cam() { return P.evaluate(function () { var R = _rtsR; return { zi: R.zi, zf: R.zf, zt: R.zt, fx: R.focus.x, fz: R.focus.z }; }); }
  function glide() { return P.evaluate(function () { for (var i = 0; i < 90; i++) { _rtsZoomTick(1 / 60); _rtsClampFocus(); } }); }

  var on = await P.evaluate(function () { return !!(window._R3D && window._R3D.on); });
  S.ok('the 3D mode is available to check', on, on ? 'on' : 'no WebGL');
  S.ok('the battlefield is big enough to pinch on', box.w > 400 && box.h > 400, box.w + 'x' + box.h);

  var mx = box.x + box.w * 0.62, my = box.y + box.h * 0.4;
  if (on) {
    await park(2);
    var c0 = await cam(), w0 = await ground(mx, my);
    await touch('touchStart', [[mx - 50, my, 1], [mx + 50, my, 2]]);
    for (var i = 1; i <= 6; i++) { var h = 50 + 50 * i / 6; await touch('touchMove', [[mx - h, my, 1], [mx + h, my, 2]]); }
    await glide();
    var c1 = await cam(), s1 = await slip(w0, mx, my);
    S.ok('a pinch in 3D follows the fingers: twice the spread, a rung in', Math.abs(c1.zf - c0.zf - 1) < 0.02,
         'rung ' + c0.zf + ' -> ' + c1.zf.toFixed(3));
    S.ok('...about their midpoint', s1 < 2, s1 + ' px from it');
    /* both fingers moved together, apart no further */
    var w1 = await ground(mx, my);
    for (i = 1; i <= 6; i++) await touch('touchMove', [[mx - 100 - 20 * i, my + 15 * i, 1], [mx + 100 - 20 * i, my + 15 * i, 2]]);
    var zt = (await cam()).zt;
    await glide();
    var c2 = await cam(), s2 = await slip(w1, mx - 120, my + 90);
    await touch('touchEnd', []);
    S.ok('...and moving both fingers pans, the ground under their midpoint going with them', s2 < 2,
         s2 + ' px from the fingers\' midpoint');
    S.ok('...without zooming', Math.abs(zt - c1.zt) < 0.02 && Math.abs(c2.zf - c1.zf) < 0.02,
         'target rung ' + c1.zt.toFixed(3) + ' -> ' + zt.toFixed(3) + ', rung ' + c2.zf.toFixed(3));
  }

  if (on) {
    /* a pinch, then one finger lifted and the other dragging on while the zoom still glides: it
       pivots on the finger left, and the ground under it stays */
    /* CDP cannot lift ONE finger of two - leaving a point out keeps it down, and a touchEnd lifts
       them all - so this case alone is TouchEvents made in the page, one finger lifted as a
       browser lifts it: a touchend for it, the other still in targetTouches. */
    await park(2);
    var res = await P.evaluate(function () {
      var cv = document.getElementById('rtsCv'), r = cv.getBoundingClientRect(), cx = r.width / 2, cy = r.height / 2;
      function T(id, x, y) { return new Touch({ identifier: id, target: cv, clientX: r.left + x, clientY: r.top + y }); }
      function fire(type, touches, changed) {
        cv.dispatchEvent(new TouchEvent(type, { touches: touches, targetTouches: touches, changedTouches: changed,
                                                bubbles: true, cancelable: true, view: window }));
      }
      var a = T(1, cx - 40, cy), b = T(2, cx + 40, cy);
      fire('touchstart', [a, b], [a, b]);
      a = T(1, cx - 80, cy); b = T(2, cx + 80, cy);
      fire('touchmove', [a, b], [a, b]);
      fire('touchend', [a], [b]);                          /* finger 2 lifts */
      var fx = cx - 80, w = _rtsGroundAt(fx, cy);
      for (var i = 1; i <= 6; i++) {
        a = T(1, fx - 12 * i, cy + 9 * i);
        fire('touchmove', [a], [a]);
        for (var k = 0; k < 3; k++) { _rtsZoomTick(1 / 60); _rtsClampFocus(); }
      }
      for (k = 0; k < 90; k++) { _rtsZoomTick(1 / 60); _rtsClampFocus(); }
      fire('touchend', [], [a]);
      var s = _rtsGroundToScreen(w.x, w.z);
      return { zf: _rtsR.zf, slip: +Math.hypot(s.x - (fx - 72), s.y - (cy + 54)).toFixed(2) };
    });
    var c5 = { zf: res.zf }, s5 = res.slip;
    S.ok('after a pinch, the finger left drags on while the zoom glides, the ground staying under it',
         Math.abs(c5.zf - 3) < 0.02 && s5 < 2, 'rung ' + c5.zf.toFixed(3) + ', ' + s5 + ' px from the finger');
  }

  if (on) {
    /* A TWIST turns the 3D camera about the fingers - once past a small threshold, so a pinch
       that turns a little by accident does not */
    await park(2);
    var tx0 = box.x + box.w * 0.55, ty0 = box.y + box.h * 0.45, rr = 70;
    function fingers(a) { return [[tx0 - rr * Math.cos(a), ty0 - rr * Math.sin(a), 1], [tx0 + rr * Math.cos(a), ty0 + rr * Math.sin(a), 2]]; }
    var wt = await ground(tx0, ty0), wr = await ground(tx0 + 90, ty0);   /* and a point to the right of them */
    await touch('touchStart', fingers(0));
    for (i = 1; i <= 2; i++) await touch('touchMove', fingers(0.03 * i));
    var small = await P.evaluate(function () { return window._R3D.yaw; });
    for (i = 1; i <= 8; i++) await touch('touchMove', fingers(0.06 + 0.6 * i / 8));
    var tw = await P.evaluate(function () { return window._R3D.yaw; }), st = await slip(wt, tx0, ty0);
    var turned = await P.evaluate(function (a) {
      var s = _rtsGroundToScreen(a[0].x, a[0].z);
      return Math.atan2(s.y - a[2], s.x - a[1]);                    /* screen y runs down: + is clockwise */
    }, [wr, tx0 - box.x, ty0 - box.y]);
    await touch('touchEnd', []);
    S.ok('a small twist does not turn the camera', small === 0, 'yaw ' + small);
    S.ok('a twist turns it with the fingers: clockwise on the screen turns the map clockwise', Math.abs(tw + 0.66) < 0.01,
         'fingers turned 0.66 rad clockwise, yaw ' + tw.toFixed(3));
    S.ok('...about the fingers, the ground between them staying put', st < 2, st + ' px');
    S.ok('...and the ground beside them goes round clockwise with them', turned > 0.2 && turned < 0.9,
         'a point right of the fingers is now ' + turned.toFixed(3) + ' rad round, clockwise');
    await P.evaluate(function () { _r3dCamSet(0, R3D_TILT); });
  }

  /* A RESTING FINGER on the sidebar, on something that does nothing with it, and another
     dragging the battlefield, where any change in the fingers' spread moves the zoom. */
  await park(1);
  var rest = await P.evaluate(function (b) {
    var d = document.createElement('div');
    d.style.cssText = 'position:fixed;left:' + (b.x + b.w + 10) + 'px;top:' + (b.y + 40) + 'px;width:60px;height:60px;z-index:99999';
    d.id = 'restHere';
    document.body.appendChild(d);
    var r = d.getBoundingClientRect();
    return { x: r.left + 30, y: r.top + 30, inside: r.right <= window.innerWidth };
  }, box);
  S.ok('a place off the battlefield to rest a finger', rest.inside, JSON.stringify(rest));
  var ax = box.x + box.w * 0.5, ay = box.y + box.h * 0.5, bx = ax - 110, by = ay - 70;
  var c3 = await cam(), wr = await ground(ax, ay);
  await touch('touchStart', [[rest.x, rest.y, 1]]);
  await touch('touchStart', [[rest.x, rest.y, 1], [ax, ay, 2]]);
  for (i = 1; i <= 8; i++) await touch('touchMove', [[rest.x, rest.y, 1], [ax + (bx - ax) * i / 8, ay + (by - ay) * i / 8, 2]]);
  var c4 = await cam(), sr = await slip(wr, bx, by);
  await touch('touchEnd', []);
  S.ok('with a finger resting on the sidebar, a drag on the battlefield is still a drag', sr < 2,
       'the ground ' + sr + ' px from the dragging finger');
  S.ok('...not a pinch', c4.zt === c3.zt, 'target rung ' + c3.zt + ' -> ' + c4.zt);

  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');
  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
