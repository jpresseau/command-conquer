/* THE DEEP ON THE PAGE (core/deep.js, sprites/deep.js):

     DRAWN        the Sonar Dolphin, the Kraken, the Sea Hornet and the Bombard are drawn: the picture
                  round each differs with it hidden (R3.hideId)
     UNSEEN       an enemy Kraken running submerged is not drawn for the player - and once it has
                  taken hold of a ship, it is
   The loop frozen, the staging asserted first. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('deep');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 1000, height: 700 });
  await g.start(7, 1, { freeze: true });
  var o = await g.page.evaluate(function () {
    var G = window._rtsG, R = _rtsR, R3 = window._R3D, gl = R3.gl, out = {}, T = RTS_TILE;
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
    function drawn(e) {
      var y = _rtsElev(e.x, e.z) + 1.5;
      look(e.x, e.z); frame(); var a = grab(e.x, y, e.z, 25);
      R3.hideId = e.id; frame(); var b = grab(e.x, y, e.z, 25); R3.hideId = null;
      return differ(a, b);
    }
    var sea = null;
    for (var j = 0; j < RTS_N * RTS_N && !sea; j++) {
      var tx = j % RTS_N, tz = (j / RTS_N) | 0, ok = true;
      for (var dx = -4; dx <= 4 && ok; dx++) for (var dz = -4; dz <= 4 && ok; dz++) if (_rtsBlocked(tx + dx, tz + dz, 'sea')) ok = false;
      if (ok) sea = [_rtsWX(tx), _rtsWX(tz)];
    }
    out.sea = !!sea;
    if (!sea) return out;
    var dol = _rtsSpawnUnit('player', 'dolphin', sea[0] - T * 3, sea[1] - T * 3);
    var kr = _rtsSpawnUnit('player', 'kraken', sea[0] + T * 3, sea[1] - T * 3);
    var sh = _rtsSpawnUnit('player', 'seahornet', sea[0] - T * 3, sea[1] + T * 3);
    var bb = _rtsSpawnUnit('player', 'bombard', sea[0] + T * 3, sea[1] + T * 3);
    out.drawn = { dolphin: drawn(dol), kraken: drawn(kr), seahornet: drawn(sh), bombard: drawn(bb) };
    [dol, kr, sh, bb].forEach(function (u) { u.dead = true; });
    /* ---- an enemy Kraken, submerged, then holding the player's gunboat ---- */
    var ek = _rtsSpawnUnit('enemy', 'kraken', sea[0], sea[1]), gb = _rtsSpawnUnit('player', 'gunboat', sea[0] + T * 3, sea[1]);
    ek.decloak = 0;
    _rtsTick(1 / 30); ek.decloak = 0;
    out.hiddenStaging = !_rtsEntSeen(ek);
    R3.fadeOff = true;                                  /* seen or not at once, without the fade (shroud3d.js) */
    out.under = drawn(ek);
    ek.cool = 0; _rtsFire(ek, gb, RTS_WEAPONS.tentacles);
    out.holds = ek.grip === gb.id;
    _rtsTick(1 / 30);
    out.seenNow = _rtsEntSeen(ek);
    out.surfaced = drawn(ek);
    R3.fadeOff = false;
    return out;
  });
  S.ok('the staging: open sea', o.sea, '');
  S.ok('the Sonar Dolphin, the Kraken, the Sea Hornet and the Bombard are drawn', o.drawn && Object.keys(o.drawn).every(function (k) { return o.drawn[k] > 20; }), JSON.stringify(o.drawn));
  S.ok('the staging: an enemy Kraken the player cannot see, which then takes hold of a gunboat', o.hiddenStaging && o.holds, JSON.stringify({ hidden: o.hiddenStaging, holds: o.holds }));
  S.ok('UNSEEN: running submerged, it is not drawn', o.under <= 2, o.under + ' px');
  S.ok('...and holding on, surfaced, it is', o.seenNow && o.surfaced > 20, o.surfaced + ' px, seen ' + o.seenNow);
  var errs = g.errors.filter(function (e) { return !/ServiceWorker/.test(e); });
  S.ok('no page errors', !errs.length, errs.join(' | ') || 'none');
  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})();
