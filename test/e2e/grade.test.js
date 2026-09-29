/* THE 3D FRAME IS GRADED - render3d/resolve3d.js, _grade.

   The last thing done to the picture: warm in the highlights and cool in the shade, a little
   more colour, a gentle S-curve, and the top of the frame - the far side of the battlefield
   under this camera - hazed toward a pale sky. Each is measured here as an A/B on one frame of
   one page, R3.gradeAmt 0 against 1, so nothing but the grade differs between the two:

     WARMTH       where the frame is bright, red gains on blue
     SHADE        where it is dark, blue gains on red
     CONTRAST     the spread of brightness across the frame widens
     DISTANCE     the top of the frame loses colour toward the sky, the middle does not
     THE SWITCH   RTS_POST_ON, the light pass's switch, takes the grade out with the bloom */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('grade');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 900, height: 760, dpr: 1 });
  await g.start(7, 1);

  var out = await g.page.evaluate(function () {
    var o = {}, R = _rtsR, G = window._rtsG, i;
    for (i = 0; i < RTS_N * RTS_N; i++) { G.mapped[i] = 1; G.vis[i] = 1; }
    G.visDirty = 1;
    rts3dSet(true);
    var R3 = window._R3D;
    o.on = !!(R3 && R3.on);
    if (!o.on) return o;
    o.post = !!R3.postReady;
    /* the middle of the map, so the whole frame is land and sea - the top of a frame near the
       edge is off the map, black, and a haze laid over black measures nothing about distance */
    R.focus.x = 0; R.focus.z = 0; R.zi = RTS_ZOOM_2D_STEPS - 2; _rtsApplyCam();
    G.fx.length = 0;
    var gl = R3.gl, CW = R3.cv.width, CH = R3.cv.height;
    function shot() {
      _rtsRFrame(0); _rtsRFrame(0);
      var b = new Uint8Array(CW * CH * 4);
      gl.readPixels(0, 0, CW, CH, gl.RGBA, gl.UNSIGNED_BYTE, b);
      return b;
    }
    R3.gradeAmt = 0; var A = shot();
    R3.gradeAmt = 1; var B = shot();
    window.RTS_POST_ON = false; var Boff = shot(); R3.gradeAmt = 0; var Aoff = shot();
    window.RTS_POST_ON = true; R3.gradeAmt = undefined;

    function lum(b, q) { return b[q] * 0.299 + b[q + 1] * 0.587 + b[q + 2] * 0.114; }
    function sat(b, q) { return Math.max(b[q], b[q + 1], b[q + 2]) - Math.min(b[q], b[q + 1], b[q + 2]); }
    var hi = { n: 0, a: 0, b: 0 }, lo = { n: 0, a: 0, b: 0 }, sA = 0, sB = 0, s2A = 0, s2B = 0, n = 0;
    var topA = 0, topB = 0, topN = 0, topL = 0, midA = 0, midB = 0, midN = 0, q;
    for (var y = 0; y < CH; y += 2) for (var x = 0; x < CW; x += 2) {
      q = (y * CW + x) * 4;
      var la = lum(A, q), lb = lum(B, q);
      /* the spread is taken across the middle of the frame, where the haze does not reach */
      if (y > CH * 0.2 && y < CH * 0.6) { n++; sA += la; sB += lb; s2A += la * la; s2B += lb * lb; }
      if (la > 150) { hi.n++; hi.a += A[q] - A[q + 2]; hi.b += B[q] - B[q + 2]; }
      if (la < 70 && la > 8) { lo.n++; lo.a += A[q + 2] - A[q]; lo.b += B[q + 2] - B[q]; }
      /* readPixels counts rows from the bottom: the top of the screen is the far side */
      if (y > CH * 0.92) { topN++; topA += sat(A, q); topB += sat(B, q); topL += la; }
      if (y > CH * 0.4 && y < CH * 0.6) { midN++; midA += sat(A, q); midB += sat(B, q); }
    }
    o.hiN = hi.n; o.warmA = +(hi.a / hi.n).toFixed(2); o.warmB = +(hi.b / hi.n).toFixed(2);
    o.loN = lo.n; o.coolA = +(lo.a / lo.n).toFixed(2); o.coolB = +(lo.b / lo.n).toFixed(2);
    o.sdA = +Math.sqrt(s2A / n - (sA / n) * (sA / n)).toFixed(2);
    o.sdB = +Math.sqrt(s2B / n - (sB / n) * (sB / n)).toFixed(2);
    o.topA = +(topA / topN).toFixed(2); o.topB = +(topB / topN).toFixed(2); o.topLum = +(topL / topN).toFixed(1);
    o.midA = +(midA / midN).toFixed(2); o.midB = +(midB / midN).toFixed(2);
    var same = 0;
    for (q = 0; q < Aoff.length; q += 4) if (Aoff[q] === Boff[q] && Aoff[q + 1] === Boff[q + 1] && Aoff[q + 2] === Boff[q + 2]) same++;
    o.offSame = +(same / (Aoff.length / 4) * 100).toFixed(2);
    var moved = 0;
    for (q = 0; q < A.length; q += 4) if (Math.abs(A[q] - B[q]) + Math.abs(A[q + 1] - B[q + 1]) + Math.abs(A[q + 2] - B[q + 2]) > 6) moved++;
    o.moved = +(moved / (A.length / 4) * 100).toFixed(1);
    return o;
  });

  S.ok('the 3D mode is available to check', out.on, out.on ? 'on' : 'no WebGL');
  if (!out.on || !out.post) {
    S.ok('the frame goes through the composite that grades it', out.post, String(out.post));
    await g.close(); await browser.close();
    return require('../lib/report.js')(S);
  }
  S.ok('the grade changes the picture', out.moved > 30, out.moved + '% of the frame moves by more than 6 levels');
  S.ok('where the frame is bright, it is warmer: red gains on blue',
       out.hiN > 500 && out.warmB > out.warmA + 3,
       'red over blue ' + out.warmA + ' -> ' + out.warmB + ' across ' + out.hiN + ' bright samples');
  S.ok('...and where it is dark, cooler: blue gains on red',
       out.loN > 200 && out.coolB > out.coolA + 1,
       'blue over red ' + out.coolA + ' -> ' + out.coolB + ' across ' + out.loN + ' dark samples');
  S.ok('the spread of brightness widens - the S-curve', out.sdB > out.sdA + 1,
       'standard deviation of luma ' + out.sdA + ' -> ' + out.sdB);
  S.ok('the top of the frame is the far side of the field, not the edge of the map', out.topLum > 40,
       'mean brightness along the top ' + out.topLum);
  S.ok('...and it is hazed toward the sky: it loses colour',
       out.topB < out.topA - 2,
       'saturation along the top ' + out.topA + ' -> ' + out.topB);
  S.ok('...where the middle of the frame does not', out.midB > out.midA - 1,
       'saturation across the middle ' + out.midA + ' -> ' + out.midB);
  S.ok('the light pass\'s switch takes the grade out with the bloom', out.offSame === 100,
       out.offSame + '% of pixels identical with RTS_POST_ON off, grade asked for and not');
  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
