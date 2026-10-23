/* ALOFT ON THE PAGE (core/aloft.js, sprites/aloft.js):

     DRAWN        the Leviathan, the Falcon, the Jetpack Trooper, the Carrier and a launched Hornet
                  are drawn: the picture round each, at the height it flies, differs with it hidden
                  (R3.hideId)
     ALOFT        a Jetpack Trooper is drawn in the air, not on the ground under it
     THE BOMB     a Leviathan's bomb, falling, is on the screen (R3.bombsOff), and a square nine
                  cells off is not changed
   The loop frozen, the staging asserted first. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('aloft');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 1000, height: 700 });
  await g.start(7, 1, { freeze: true });
  var o = await g.page.evaluate(function () {
    var G = window._rtsG, R = _rtsR, R3 = window._R3D, gl = R3.gl, yd = _rtsHas('player', 'yard'), out = {}, T = RTS_TILE;
    for (var i = 0; i < RTS_N * RTS_N; i++) { G.mapped[i] = 1; G.vis[i] = 1; }
    function look(x, z) { R.focus.x = x; R.focus.z = z; R.zi = RTS_ZOOMS.length - 2; _rtsApplyCam(); }
    function grab(x, y, z, n) {
      var s = _rtsWorldToScreen(x, y, z), k = R3.cv.width / R.W, H = R3.cv.height, px = new Uint8Array(4 * n * n), h = (n - 1) / 2;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.readPixels(Math.round(s.x * k) - h, H - Math.round(s.y * k) - h, n, n, gl.RGBA, gl.UNSIGNED_BYTE, px);
      return px;
    }
    function frame() { _rtsRFrame(0); _rtsRFrame(0); }
    function differ(a, b, cut) { var d = 0; for (var q = 0; q < a.length; q += 4) if (Math.abs(a[q] - b[q]) + Math.abs(a[q + 1] - b[q + 1]) + Math.abs(a[q + 2] - b[q + 2]) > (cut || 30)) d++; return d; }
    function at(dx, dz) { var q = _rtsNearestOpen(yd.tx + dx, yd.tz + dz, 8, null); return [_rtsWX(q[0]), _rtsWX(q[1])]; }
    /* where it is drawn: its altitude above the ground it is over (render/camera.js) */
    function ay(e) { return (e.air ? _rtsElev(e.x, e.z) : _rtsStandY(e.x, e.z)) + _rtsAirLift(e) * RTS_AIR_ALT_K + 1; }
    function drawn(e, y) {
      y = y == null ? ay(e) : y;
      look(e.x, e.z); frame(); var a = grab(e.x, y, e.z, 25);
      R3.hideId = e.id; frame(); var b = grab(e.x, y, e.z, 25); R3.hideId = null;
      return differ(a, b);
    }
    var p = at(6, 8);
    var lv = _rtsSpawnUnit('player', 'leviathan', p[0], p[1]);
    var fc = _rtsSpawnUnit('player', 'falcon', p[0] + T * 8, p[1]);
    var jp = _rtsSpawnUnit('player', 'jetpack', p[0] - T * 6, p[1] + T * 4);
    out.drawn = { leviathan: drawn(lv), falcon: drawn(fc), jetpack: drawn(jp) };
    /* aloft: at its own height it is there; on the ground under it, hiding it changes little */
    out.jpAir = out.drawn.jetpack; out.jpGround = drawn(jp, _rtsElev(jp.x, jp.z) + 0.5);
    var sea = null;
    for (var j = 0; j < RTS_N * RTS_N && !sea; j++) { var tx = j % RTS_N, tz = (j / RTS_N) | 0; if (G.terrain[j] === RTS_T_WATER && !_rtsBlocked(tx, tz, 'sea') && !_rtsBlocked(tx + 3, tz, 'sea') && !_rtsBlocked(tx, tz + 3, 'sea')) sea = [tx + 1, tz + 1]; }
    out.sea = !!sea;
    if (sea) {
      var cv = _rtsSpawnUnit('player', 'carrier', _rtsWX(sea[0]), _rtsWX(sea[1]));
      out.drawn.carrier = drawn(cv, _rtsElev(cv.x, cv.z) + 2);
      var tgt = _rtsSpawnUnit('enemy', 'tank', cv.x + T * 8, cv.z + T * 3);
      cv.cool = 0; _rtsFire(cv, tgt, RTS_WEAPONS.hornets);
      var hn = G.ents.filter(function (x) { return x.mother === cv.id; })[0];
      out.launched = !!hn;
      if (hn) { hn.x = cv.x + T * 4; hn.z = cv.z + T * 2; out.drawn.hornet = drawn(hn); }
      tgt.dead = true;
    }
    /* ---- the Leviathan's bomb, falling ---- */
    var tk = _rtsSpawnUnit('enemy', 'tank', lv.x, lv.z), n0 = (G.bombs || []).length;
    lv.cool = 0; _rtsFire(lv, tk, RTS_WEAPONS.levbomb);
    var b = (G.bombs || [])[n0];
    out.bomb = !!b;
    if (b) {
      b.t = 0.6; b.y = 8;                                /* part way down */
      var by = _rtsElev(b.x, b.z) + b.y * RTS_AIR_ALT_K, cx = b.x + T * 9, cz = b.z + T * 5, cy = _rtsElev(cx, cz);
      R3.hideId = lv.id;                                  /* the airship itself out of the way */
      look(b.x, b.z);
      frame(); var a2 = grab(b.x, by, b.z, 21), ca = grab(cx, cy, cz, 21);
      R3.bombsOff = true; frame(); var b2 = grab(b.x, by, b.z, 21), cb = grab(cx, cy, cz, 21); R3.bombsOff = false;
      R3.hideId = null;
      out.bombPx = differ(a2, b2, 20); out.ctl = differ(ca, cb, 20);
    }
    return out;
  });
  S.ok('the staging: open sea for the Carrier, a Hornet launched, a bomb away', o.sea && o.launched && o.bomb, JSON.stringify({ sea: o.sea, launched: o.launched, bomb: o.bomb }));
  S.ok('the Leviathan, the Falcon, the Jetpack Trooper, the Carrier and a Hornet are drawn', ['leviathan', 'falcon', 'jetpack', 'carrier', 'hornet'].every(function (k) { return o.drawn[k] > 20; }), JSON.stringify(o.drawn));
  S.ok('ALOFT: a Jetpack Trooper is drawn in the air, not on the ground under it', o.jpAir > 20 && o.jpGround < o.jpAir / 2, 'at its height ' + o.jpAir + ' px, on the ground under it ' + o.jpGround);
  S.ok('THE BOMB: a Leviathan\'s bomb, falling, is on the screen', o.bombPx > 4, o.bombPx + ' px');
  S.eq('...and nowhere else (control)', o.ctl, 0);
  var errs = g.errors.filter(function (e) { return !/ServiceWorker/.test(e); });
  S.ok('no page errors', !errs.length, errs.join(' | ') || 'none');
  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})();
