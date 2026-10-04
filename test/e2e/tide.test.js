/* THE TIDE, ON THE SCREEN (core/tide.js, render3d/world3d.js _r3dSeaMask, ui/hud.js):

     THE COAST WALKS  at low water the 3D view shows ground where the sea was over the flats - the
                      picture over an outermost flat goes from blue water to sand-brown - and at
                      high water it is sea again
     THE RADAR        paints the dry flats as sand, and the same cells as water at high tide
     SAID             the message line says the tide is going out */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('tide');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 1000, height: 700 });
  await g.start(7, 1, { freeze: true });
  var p = g.page;

  var out = await p.evaluate(function () {
    var G = window._rtsG, R = _rtsR, R3 = window._R3D, gl = R3.gl, N = RTS_N, P = RTS_TIDE.period, flat = -1;
    for (var i = 0; i < N * N; i++) { G.mapped[i] = 1; G.vis[i] = 1; }
    G.visDirty = 1;
    /* a lit radar to read: a Radar Post and the power for it */
    var yd = _rtsHas('player', 'yard');
    ['radar', 'apower'].forEach(function (k, n) {
      for (var r = 4; r < 30; r++) { var sp = _rtsNearestOpen(yd.tx + r, yd.tz + n * 4, 4, null); if (sp && _rtsCanPlace('player', k, sp[0], sp[1], true)) { _rtsPlaceStruct('player', k, sp[0], sp[1], true); break; } }
    });
    _rtsRecalcPower('player');
    G.t = 0; _rtsTideTick(0);
    /* an outermost flat with others round it, away from the map's edge */
    for (i = 0; i < N * N && flat < 0; i++) {
      var x = i % N, z = (i / N) | 0;
      if (G.tideD[i] !== RTS_TIDE.reach || x < 8 || z < 8 || x > N - 9 || z > N - 9) continue;
      flat = i;
    }
    if (flat < 0) return null;
    var fx = flat % N, fz = (flat / N) | 0;
    R.focus.x = _rtsWX(fx); R.focus.z = _rtsWX(fz); R.zi = RTS_ZOOMS.length - 2; _rtsApplyCam();
    function look() {
      _rtsRFrame(0); _rtsRFrame(0);
      var s = _rtsGroundToScreen(_rtsWX(fx), _rtsWX(fz)), k = R3.cv.width / R.W, W = R3.cv.width, H = R3.cv.height;
      var px = new Uint8Array(4 * 9 * 9);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.readPixels(Math.round(s.x * k) - 4, H - Math.round(s.y * k) - 4, 9, 9, gl.RGBA, gl.UNSIGNED_BYTE, px);
      var r = 0, b = 0;
      for (var q = 0; q < px.length; q += 4) { r += px[q]; b += px[q + 2]; }
      _rtsDrawMini();
      var mini = document.getElementById('rtsMini'), mg = mini.getContext('2d');
      var mp = mg.getImageData(Math.floor((fx + 0.5) * mini.width / N), Math.floor((fz + 0.5) * mini.height / N), 1, 1).data;
      return { r: Math.round(r / 81), b: Math.round(b / 81), radar: [mp[0], mp[1], mp[2]] };
    }
    var said = [], say = window._rtsSay;
    window._rtsSay = function (m) { said.push(m); return say.apply(this, arguments); };
    var high = look();
    for (var t = 1; t <= P / 2; t += 2) { G.t = t; _rtsTideTick(0); }
    var low = look();
    G.t = P; _rtsTideTick(0);
    var back = look();
    window._rtsSay = say;
    return { high: high, low: low, back: back, dry: G.tideDry[flat], said: said, cell: [fx, fz], lit: _rtsRadarLit() };
  });
  S.ok('the case: an outermost flat, in view, and a lit radar', !!out && out.lit, out ? JSON.stringify(out.cell) + ', radar ' + out.lit : 'no flats on this map');
  if (out) {
    S.ok('at high water the picture over it is sea - bluer than it is red', out.high.b > out.high.r, JSON.stringify(out.high));
    S.ok('...at low water it is ground - redder than blue, as sand is', out.low.r > out.low.b, JSON.stringify(out.low));
    S.ok('...and at high water again, sea', out.back.b > out.back.r, JSON.stringify(out.back));
    function sandy(c) { return c[0] > c[2]; }
    S.ok('the radar paints the dry flat as sand, and the same cell as water at high tide', sandy(out.low.radar) && !sandy(out.high.radar),
         'high ' + out.high.radar + ', low ' + out.low.radar);
    S.ok('the message line says the tide is going out', out.said.some(function (m) { return /going out/.test(m); }), JSON.stringify(out.said));
  }
  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');
  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
