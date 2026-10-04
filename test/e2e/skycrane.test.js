/* WHAT A TRANSPORT CARRIES, ON THE SCREEN (render3d/scene3d.js, render3d/unit3d.js):

     NOT DRAWN    a squad riding in a Skylift and a tank riding in a Sky Crane are not drawn as
                  units of their own - a passenger used to be drawn where it was dragged along,
                  squads standing on the ground under a Skylift in flight
     SLUNG        the Sky Crane's tank is drawn hanging under it: the picture round the crane
                  differs with the slung load drawn and not (R3.slingOff), at the same moment */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('skycrane');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 1000, height: 700 });
  await g.start(7, 1, { freeze: true });
  var p = g.page;

  var o = await p.evaluate(function () {
    var G = window._rtsG, R = _rtsR, R3 = window._R3D, gl = R3.gl, yd = _rtsHas('player', 'yard');
    for (var i = 0; i < RTS_N * RTS_N; i++) { G.mapped[i] = 1; G.vis[i] = 1; }
    var c = _rtsNearestOpen(yd.tx + 10, yd.tz + 10, 8, null), x = _rtsWX(c[0]), z = _rtsWX(c[1]);
    var lift = _rtsSpawnUnit('player', 'tran', x - 12, z), sq = _rtsSpawnUnit('player', 'rifle', x - 12, z);
    var cr = _rtsSpawnUnit('player', 'skycrane', x + 6, z), tk = _rtsSpawnUnit('player', 'tank', x + 6, z);
    _rtsBoard(sq, lift); _rtsBoard(tk, cr);
    R.focus.x = x; R.focus.z = z; R.zi = RTS_ZOOMS.length - 2; _rtsApplyCam();
    var painted = [], paint = window._r3dPaintUnit;
    window._r3dPaintUnit = function (C, e) { painted.push(e); return paint.apply(this, arguments); };
    _rtsRFrame(0); _rtsRFrame(0);
    window._r3dPaintUnit = paint;
    /* the two pictures differ only by the load: no rotor turning, the clock held */
    R3.rotorOff = true;
    _rtsTick(1 / 60);
    function patch() {
      _rtsRFrame(0); _rtsRFrame(0);
      /* where it is drawn, at its altitude - not the ground under it */
      var s = _rtsScreenOf(cr), k = R3.cv.width / R.W, H = R3.cv.height, n = 61, px = new Uint8Array(4 * n * n);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.readPixels(Math.round(s.x * k) - 30, H - Math.round(s.y * k) - 30, n, n, gl.RGBA, gl.UNSIGNED_BYTE, px);
      return px;
    }
    var loaded = patch();
    R3.slingOff = true;                       /* the same moment, the slung load not drawn */
    var empty = patch(), diff = 0;
    R3.slingOff = false;
    for (var q = 0; q < loaded.length; q += 4) if (Math.abs(loaded[q] - empty[q]) + Math.abs(loaded[q + 1] - empty[q + 1]) + Math.abs(loaded[q + 2] - empty[q + 2]) > 30) diff++;
    return { pax: painted.indexOf(sq) >= 0, load: painted.indexOf(tk) >= 0, lift: painted.indexOf(lift) >= 0, crane: painted.indexOf(cr) >= 0, diff: diff };
  });
  S.ok('the staging: both transports are drawn', o.lift && o.crane, JSON.stringify(o));
  S.ok('a squad riding in a Skylift is not drawn as a unit of its own', !o.pax, '');
  S.ok('...nor a tank riding in a Sky Crane', !o.load, '');
  S.ok('...which is drawn hanging under the crane: the picture round it differs, the load drawn and not', o.diff > 40, o.diff + ' of 3721 pixels');

  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');
  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
