/* CLOUDS PASS OVER THE BATTLEFIELD - render3d/cloud3d.js.

   Soft cloud shadows drifting across the map, a term in the sun's own shadow so that the ground,
   the forests, the buildings and the sea all pass under them alike. Measured as an A/B on one
   frame of one page, R3.cloudAmt 0 against 1, so nothing but the clouds differs:

     SHADE      some of the ground darkens and some does not: clouds, not a dimmer sun
     DEPTH      under the thick of one, a good part of the sunlight is gone
     ONLY DARK  nothing is brightened by a cloud
     MESHES     the forests and rock under a cloud darken with the ground behind them
     DRIFT      a minute later, they have moved
     PINNED     a pan of the camera does not drag them along: a point on the ground is under the
                same cloud whichever way the camera looks at it */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('clouds');

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
    /* the light pass's bloom and grade are left out, so the picture is the light itself */
    window.RTS_POST_ON = false;
    G.fx.length = 0;
    var gl = R3.gl, CW = R3.cv.width, CH = R3.cv.height;
    function look(x, z) { R.focus.x = x; R.focus.z = z; R.zi = 1; _rtsApplyCam(); }
    function shot(amt) {
      R3.cloudAmt = amt;
      _rtsRFrame(0);
      var b = new Uint8Array(CW * CH * 4);
      gl.readPixels(0, 0, CW, CH, gl.RGBA, gl.UNSIGNED_BYTE, b);
      return b;
    }
    function lum(b, q) { return b[q] * 0.299 + b[q + 1] * 0.587 + b[q + 2] * 0.114; }
    /* how much darker each pixel is under the clouds than without them, clouds 0 against 1 */
    function drop() {
      var A = shot(0), B = shot(1), d = new Float32Array(CW * CH);
      for (var p = 0; p < CW * CH; p++) d[p] = lum(A, p * 4) - lum(B, p * 4);
      d.A = A;
      return d;
    }
    function at(d, wx, wy, wz) {
      var s = _rtsWorldToScreen(wx, wy, wz), x = Math.round(s.x * R.dpr), y = Math.round(s.y * R.dpr);
      if (x < 2 || y < 2 || x >= CW - 2 || y >= CH - 2) return null;
      return (CH - 1 - y) * CW + x;
    }

    look(0, 0);
    var t0 = G.t, D = drop(), n = CW * CH, dark = 0, bright = 0, rel = [], sun = 0, clear = 0;
    for (var p = 0; p < n; p++) {
      if (D[p] > 6) dark++;
      if (D[p] < -3) bright++;
      var l = lum(D.A, p * 4);
      if (l > 40) rel.push(D[p] / l);
      /* sunlit ground between the clouds keeps every bit of its light: a dimmer sun would not */
      if (l > 110) { sun++; if (Math.abs(D[p]) < 2) clear++; }
    }
    o.clear = +(clear / Math.max(1, sun) * 100).toFixed(1);
    rel.sort(function (a, b) { return a - b; });
    o.dark = +(dark / n * 100).toFixed(1); o.bright = +(bright / n * 100).toFixed(2);
    o.deep = +(rel[Math.floor(rel.length * 0.97)] * 100).toFixed(1);

    /* MESHES. Which pixels are the world's geometry - forests, rock, tufts - is found by taking it
       away: every pixel that changes when R3.world is emptied was one of its meshes. The same
       A/B with it gone says where the clouds lie on the ground behind them, so the meshes are
       asked about only where there is a cloud to be under. */
    /* The sun's shadow map and the occlusion are off for this, or taking the forest away would
       also take its shadows and its occlusion off the ground round it, and those pixels would
       count as the forest. The clouds are the whole of the sun's shade then: _shadowAt. */
    var keep = R3.world, sr = R3.shadowReady;
    R3.shadowReady = false; R3.aoAmt = 0;
    var DM = drop();
    R3.world = [];
    var D0 = drop();
    R3.world = keep; R3.shadowReady = sr; R3.aoAmt = undefined;
    var mesh = 0, under = 0, mt = 0, mg = 0;
    for (p = 0; p < n; p++) {
      var q = p * 4, A = DM.A, A0 = D0.A;
      if (Math.abs(A[q] - A0[q]) + Math.abs(A[q + 1] - A0[q + 1]) + Math.abs(A[q + 2] - A0[q + 2]) < 30) continue;
      mesh++;
      if (D0[p] > 14) { under++; mt += DM[p]; mg += D0[p]; }
    }
    o.meshPx = +(mesh / n * 100).toFixed(1); o.meshUnder = +(under / n * 100).toFixed(1);
    o.meshDrop = under ? +(mt / under).toFixed(2) : 0; o.gndDrop = under ? +(mg / under).toFixed(2) : 0;

    /* DRIFT: the same view a minute of game time later */
    G.t = t0 + 60;
    var D2 = drop(), both = 0, either = 0;
    for (p = 0; p < n; p++) {
      var a1 = D[p] > 6, a2 = D2[p] > 6;
      if (a1 && a2) both++;
      if (a1 || a2) either++;
    }
    o.overlap = +(both / Math.max(1, either) * 100).toFixed(1);
    G.t = t0;

    /* PINNED: a grid of points on the ground, seen from two camera positions eight cells apart */
    var pts = [];
    for (var gz = -60; gz <= 60; gz += 6) for (var gx = -24; gx <= 24; gx += 6) pts.push([gx, gz]);
    function sample(d) {
      return pts.map(function (w) {
        var q = at(d, w[0], _rtsElev(w[0], w[1]), w[1]);
        return q === null ? null : d[q];
      });
    }
    look(-16, 0); var P1 = sample(drop());
    look(16, 0); var P2 = sample(drop());
    var m = 0, diff = 0, k = 0;
    for (i = 0; i < pts.length; i++) {
      if (P1[i] === null || P2[i] === null) continue;
      k++; m += (P1[i] + P2[i]) / 2; diff += Math.abs(P1[i] - P2[i]);
    }
    o.pinN = k; o.pinMean = +(m / Math.max(1, k)).toFixed(2); o.pinDiff = +(diff / Math.max(1, k)).toFixed(2);

    gl.getError();
    window.RTS_POST_ON = true;
    shot(1);
    o.glErr = gl.getError();
    R3.cloudAmt = undefined;
    return o;
  });

  S.ok('the 3D mode is available to check', out.on, out.on ? 'on' : 'no WebGL');
  if (!out.on) { await g.close(); await browser.close(); return require('../lib/report.js')(S); }
  S.ok('clouds shade some of the frame and not all of it: clouds, not a dimmer sun',
       out.dark > 8 && out.dark < 75, out.dark + '% of the frame darkens by more than 6 levels');
  S.ok('...with sunlit ground between them that keeps all of its light', out.clear > 15,
       out.clear + '% of the sunlit pixels change by under 2 levels');
  S.ok('...and under the thick of one, a good part of the sunlight is gone', out.deep > 15,
       'the darkest 3% lose ' + out.deep + '% of their brightness or more');
  S.ok('nothing is brightened by a cloud', out.bright < 0.5, out.bright + '% of the frame brightens');
  S.ok('the forests and rock in the frame stand partly under a cloud', out.meshPx > 5 && out.meshUnder > 1,
       out.meshPx + '% of the frame is the world\'s geometry, and ' + out.meshUnder + '% is that geometry with a cloud on the ground behind');
  S.ok('...and they darken under it with the ground', out.meshDrop > out.gndDrop * 0.3,
       'they lose ' + out.meshDrop + ' levels where the ground behind them loses ' + out.gndDrop);
  S.ok('a minute later, the clouds have moved', out.overlap < 75,
       out.overlap + '% of what was shaded then is still shaded, of what is shaded at either time');
  S.ok('the ground sampled from both camera positions is under clouds to compare', out.pinN > 40 && out.pinMean > 2,
       out.pinN + ' points in both views, darkened ' + out.pinMean + ' levels on average');
  S.ok('...and a pan of the camera does not drag the clouds along with it', out.pinDiff < out.pinMean * 0.35,
       'a point differs by ' + out.pinDiff + ' levels between the two views, against ' + out.pinMean + ' on average');
  S.eq('no draw is refused with the clouds and the post buffer on', out.glErr, 0);
  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
