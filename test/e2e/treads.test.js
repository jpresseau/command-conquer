/* WHAT DROVE HERE - render3d/tread3d.js.

   A tank and a scout buggy are driven across the widest stretch of sand on the map, and the
   ground behind them is measured as an A/B on one frame, R3.treadAmt 0 against 1, so nothing but
   the marks differs:

     TRACKS     the tank's two tracks darken the sand along its path, either side of it
     TWO, NOT A SMEAR  the sand between the tracks is left alone
     ONLY THERE  the sand beside the path is left alone
     TYRES      the buggy leaves its lines too
     FADING     a little while after they were laid they are all still there, later they are
                fading, and half a minute on they are gone */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('treads');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 900, height: 760, dpr: 1 });
  await g.start(7, 1);

  var out = await g.page.evaluate(function () {
    var o = {}, R = _rtsR, G = window._rtsG, i;
    for (i = 0; i < RTS_N * RTS_N; i++) { G.mapped[i] = 1; G.vis[i] = 1; }
    G.visDirty = 1;
    var R3 = window._R3D;
    o.on = !!(R3 && R3.on);
    if (!o.on) return o;
    window.RTS_POST_ON = false;
    R3.cloudAmt = 0;
    /* the widest stretch of open sand */
    var best = null, bs = -1;
    for (var tz = 8; tz < RTS_N - 8; tz++) for (var tx = 8; tx < RTS_N - 8; tx++) {
      var n = 0;
      for (var dz = -4; dz <= 4; dz++) for (var dx = -4; dx <= 4; dx++) if (G.terrain[_rtsIdx(tx + dx, tz + dz)] === RTS_T_SAND) n++;
      if (n > bs) { bs = n; best = [tx, tz]; }
    }
    o.sand = bs;
    var cx = _rtsWX(best[0]), cz = _rtsWX(best[1]);
    var tank = _rtsSpawnUnit('player', 'tank', cx - 12, cz - 5);
    var bug = _rtsSpawnUnit('player', 'buggy', cx - 12, cz + 5);
    _rtsOrderMove(tank, cx + 12, cz - 3);
    _rtsOrderMove(bug, cx + 12, cz + 7);
    R.focus.x = cx; R.focus.z = cz; R.zi = RTS_ZOOMS.length - 2; _rtsApplyCam();
    /* marks are laid as the frame is drawn, so draw as the sim runs; the route each took is kept
       to measure along */
    var routeT = [], routeB = [];
    _rtsRFrame(0);
    for (var f = 0; f < 200; f++) {
      _rtsTick(1 / 20);
      if (f % 3 === 0) { _rtsRFrame(0); routeT.push([tank.x, tank.z]); routeB.push([bug.x, bug.z]); }
    }
    _rtsRFrame(0);
    o.marks = R3.treadN;
    var gl = R3.gl, CW = R3.cv.width, CH = R3.cv.height;
    function shot(amt) {
      R3.treadAmt = amt;
      _rtsRFrame(0);
      var b = new Uint8Array(CW * CH * 4);
      gl.readPixels(0, 0, CW, CH, gl.RGBA, gl.UNSIGNED_BYTE, b);
      return b;
    }
    function lum(b, q) { return b[q] * 0.299 + b[q + 1] * 0.587 + b[q + 2] * 0.114; }
    function drop() {
      var A = shot(0), B = shot(1);
      return function (wx, wz) {
        var p = _rtsWorldToScreen(wx, _rtsElev(wx, wz), wz), x = Math.round(p.x * R.dpr), y = Math.round(p.y * R.dpr);
        if (x < 1 || y < 1 || x >= CW - 1 || y >= CH - 1) return null;
        var q = ((CH - 1 - y) * CW + x) * 4;
        return lum(A, q) - lum(B, q);
      };
    }
    /* points along a route: on each track, between them, and well off to the side - only over
       sand, and clear of where the vehicles stand now */
    function along(route, e, off) {
      var P = { trk: [], mid: [], side: [] };
      for (var k = 1; k < route.length; k++) {
        var a = route[k - 1], b = route[k], dx = b[0] - a[0], dz = b[1] - a[1], m = Math.hypot(dx, dz);
        if (m < 0.2) continue;
        var mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2, px = -dz / m, pz = dx / m;
        if (Math.hypot(mx - e.x, mz - e.z) < 4) continue;
        if (G.terrain[_rtsIdx(_rtsTX(mx), _rtsTX(mz))] !== RTS_T_SAND) continue;
        P.trk.push([mx + px * off, mz + pz * off], [mx - px * off, mz - pz * off]);
        P.mid.push([mx, mz]);
        P.side.push([mx + px * 8, mz + pz * 8]);
      }
      return P;
    }
    var PT = along(routeT, tank, rtsUnitDef('tank').r * 0.55), PB = along(routeB, bug, rtsUnitDef('buggy').r * 0.5);
    function measure(D, pts, lim) {
      var s = 0, n = 0, hit = 0;
      pts.forEach(function (w) { var v = D(w[0], w[1]); if (v === null) return; n++; s += v; if (v > lim) hit++; });
      return { n: n, mean: n ? +(s / n).toFixed(2) : 0, hit: n ? +(hit / n * 100).toFixed(1) : 0 };
    }
    var D = drop();
    o.trk = measure(D, PT.trk, 3); o.mid = measure(D, PT.mid, 3); o.side = measure(D, PT.side, 3);
    o.tyre = measure(D, PB.trk, 2);
    /* the clock moved on: a while after, and past the marks' life */
    var t0 = G.t;
    G.t = t0 + 2;
    o.later = measure(drop(), PT.trk, 3);
    G.t = t0 + R3D_TREAD_LIFE * 0.4;
    o.half = measure(drop(), PT.trk, 3);
    G.t = t0 + R3D_TREAD_LIFE + 1;
    o.gone = measure(drop(), PT.trk, 3);
    G.t = t0;

    gl.getError();
    window.RTS_POST_ON = true;
    shot(1);
    o.glErr = gl.getError();
    R3.treadAmt = undefined; R3.cloudAmt = undefined;
    return o;
  });

  S.ok('the 3D mode is available to check', out.on, out.on ? 'on' : 'no WebGL');
  if (!out.on) { await g.close(); await browser.close(); return require('../lib/report.js')(S); }
  S.ok('the map has open sand to drive across', out.sand > 25, out.sand + ' of 81 cells round the widest spot');
  S.ok('the drive laid marks', out.marks > 20, out.marks + ' marks');
  S.ok('the tank\'s two tracks darken the sand along its path',
       out.trk.n > 12 && out.trk.hit > 60 && out.trk.mean > 5,
       out.trk.hit + '% of ' + out.trk.n + ' points on its tracks darken by over 3 levels, ' + out.trk.mean + ' on average');
  S.ok('...two tracks, not a smear: the sand between them is left alone', out.mid.mean < out.trk.mean * 0.3,
       'between the tracks ' + out.mid.mean + ' levels, on them ' + out.trk.mean);
  S.ok('...and the sand beside the path is left alone', Math.abs(out.side.mean) < 0.5 && out.side.hit < 5,
       'eight units to the side ' + out.side.mean + ' levels, ' + out.side.hit + '% over 3');
  S.ok('the buggy leaves its tyre lines too', out.tyre.n >= 8 && out.tyre.hit > 40,
       out.tyre.hit + '% of ' + out.tyre.n + ' points on its tyre lines darken by over 2 levels, ' + out.tyre.mean + ' on average');
  S.ok('a little while after they were laid, the marks are all still there', out.later.mean > out.trk.mean * 0.85,
       out.later.mean + ' levels on the tracks two seconds on, against ' + out.trk.mean + ' when fresh');
  S.ok('...then they fade, rather than blink out', out.half.mean > out.trk.mean * 0.1 && out.half.mean < out.trk.mean * 0.8,
       out.half.mean + ' levels on the tracks ' + Math.round(0.4 * 32) + ' seconds on, against ' + out.trk.mean + ' when fresh');
  S.ok('...and half a minute on, they are gone', Math.abs(out.gone.mean) < 0.3 && out.gone.hit === 0,
       out.gone.mean + ' levels on the tracks, ' + out.gone.hit + '% over 3');
  S.eq('no draw is refused with the marks and the post buffer on', out.glErr, 0);
  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
