/* THE MAP MOVES A LITTLE ON ITS OWN - the surf and the wind (R3D_MESH_FS, R3D_MESH_VS in
   render3d/gl3d.js).

   SURF       lines of foam roll in to the shore, R3.surfAmt 0 against 1 on one frame: they
              brighten the water near the beach and leave the open sea alone, and a moment
              later they have rolled on (nothing else about them moves: where a line breaks
              along its length is fixed, as over a bar)
   WIND       over the densest wood at the closest zoom, the canopies move from one moment to
              the next - and with R3.swayAmt 0 nothing does, so the movement is the wind's and
              nothing else's
   BUILDINGS  do not sway: the wind is the world batch's, not every mesh's */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('ambient');

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
    G.fx.length = 0;
    var gl = R3.gl, CW = R3.cv.width, CH = R3.cv.height, t0 = G.t;
    function shot() {
      _rtsRFrame(0);
      var b = new Uint8Array(CW * CH * 4);
      gl.readPixels(0, 0, CW, CH, gl.RGBA, gl.UNSIGNED_BYTE, b);
      return b;
    }
    function lum(b, q) { return b[q] * 0.299 + b[q + 1] * 0.587 + b[q + 2] * 0.114; }
    function kindNear(tx, tz, r, k) {
      for (var dz = -r; dz <= r; dz++) for (var dx = -r; dx <= r; dx++) {
        if (_rtsInB(tx + dx, tz + dz) && G.terrain[_rtsIdx(tx + dx, tz + dz)] === k) return true;
      }
      return false;
    }
    function best(score) {
      var b = null, bs = -1;
      for (var tz = 8; tz < RTS_N - 8; tz++) for (var tx = 8; tx < RTS_N - 8; tx++) {
        var s = score(tx, tz);
        if (s > bs) { bs = s; b = [tx, tz]; }
      }
      return b;
    }

    /* ---- SURF: the beach with the most sand and sea round it ---- */
    var beach = best(function (tx, tz) {
      var s = 0, w = 0;
      for (var dz = -3; dz <= 3; dz++) for (var dx = -3; dx <= 3; dx++) {
        var k = G.terrain[_rtsIdx(tx + dx, tz + dz)];
        if (k === RTS_T_SAND) s++; if (k === RTS_T_WATER) w++;
      }
      return Math.min(s, w);
    });
    R.focus.x = _rtsWX(beach[0]); R.focus.z = _rtsWX(beach[1]); R.zi = RTS_ZOOMS.length - 2; _rtsApplyCam();
    function surf(t) {
      G.t = t;
      R3.surfAmt = 0; var A = shot();
      R3.surfAmt = 1; var B = shot();
      R3.surfAmt = undefined;
      var m = new Uint8Array(CW * CH), n = 0, up = 0, near = 0, far = 0, farN = 0;
      for (var y = 0; y < CH; y += 2) for (var x = 0; x < CW; x += 2) {
        var p = (CH - 1 - y) * CW + x, q = p * 4, d = lum(B, q) - lum(A, q);
        /* how much foam is mixed in here, whatever the water under it: B = A + f (foam - A) */
        var den = 0.96 * 255 - A[q + 1];
        if (den > 25 && (B[q + 1] - A[q + 1]) / den > 0.06) m[p] = 1;
        var w = _rtsGroundAt(x / R.dpr, y / R.dpr), tx = w ? _rtsTX(w.x) : -1, tz = w ? _rtsTX(w.z) : -1;
        var sea = w && _rtsInB(tx, tz) && G.terrain[_rtsIdx(tx, tz)] === RTS_T_WATER;
        var open = sea && !kindNear(tx, tz, 3, RTS_T_SAND) && !kindNear(tx, tz, 3, RTS_T_GRASS) && !kindNear(tx, tz, 3, RTS_T_ROCK);
        if (open) { farN++; if (Math.abs(d) > 2) far++; }
        if (Math.abs(d) <= 6) continue;
        n++;
        if (d > 0) up++;
        if (sea && !open) near++;
      }
      return { n: n, up: up, near: near, far: far, farN: farN, m: m };
    }
    /* the swell and the chop held still, so the one thing that moves the foam is the surf */
    var amp = window.R3D_WAVE_AMP;
    window.R3D_WAVE_AMP = 1e-4; R3.rippleAmt = 0;
    var s0 = surf(t0 + 3), s1 = surf(t0 + 4.2);
    window.R3D_WAVE_AMP = amp; R3.rippleAmt = undefined;
    var both = 0, either = 0;
    for (i = 0; i < CW * CH; i++) { if (s0.m[i] && s1.m[i]) both++; if (s0.m[i] || s1.m[i]) either++; }
    o.surf = { n: s0.n, up: s0.up, near: s0.near, far: s0.far, farN: s0.farN,
               overlap: +(both / Math.max(1, either) * 100).toFixed(1) };

    /* ---- WIND: the densest wood, with no water in sight of it, at the closest zoom ---- */
    var wood = best(function (tx, tz) {
      if (kindNear(tx, tz, 8, RTS_T_WATER)) return -1;
      var n = 0;
      for (var dz = -3; dz <= 3; dz++) for (var dx = -3; dx <= 3; dx++) if (G.terrain[_rtsIdx(tx + dx, tz + dz)] === RTS_T_TREE) n++;
      return n;
    });
    o.wood = !!wood;
    R.focus.x = _rtsWX(wood[0]); R.focus.z = _rtsWX(wood[1]); R.zi = RTS_ZOOMS.length - 1; _rtsApplyCam();
    function moved(amt) {
      R3.swayAmt = amt;
      G.t = t0 + 5; var A = shot();
      G.t = t0 + 5.7; var B = shot();
      var n = 0;
      for (var q = 0; q < A.length; q += 4) if (Math.abs(A[q] - B[q]) + Math.abs(A[q + 1] - B[q + 1]) + Math.abs(A[q + 2] - B[q + 2]) > 12) n++;
      return +(n / (A.length / 4) * 100).toFixed(2);
    }
    o.sway = moved(1); o.still = moved(0);

    /* ---- BUILDINGS: the player's yard, with the wind on ---- */
    var yd = _rtsHas('player', 'yard');
    R.focus.x = yd.x; R.focus.z = yd.z; R.zi = RTS_ZOOMS.length - 1; _rtsApplyCam();
    R3.swayAmt = 1;
    G.t = t0 + 5; var Y0 = shot();
    G.t = t0 + 5.7; var Y1 = shot();
    var yc = 0, yn = 0;
    var c = _rtsWorldToScreen(yd.x, _rtsElev(yd.x, yd.z) + 2, yd.z), cx = Math.round(c.x * R.dpr), cy = Math.round(c.y * R.dpr);
    for (var yy = cy - 40; yy <= cy + 40; yy++) for (var xx = cx - 40; xx <= cx + 40; xx++) {
      if (xx < 0 || yy < 0 || xx >= CW || yy >= CH) continue;
      var qq = ((CH - 1 - yy) * CW + xx) * 4; yn++;
      if (Math.abs(Y0[qq] - Y1[qq]) + Math.abs(Y0[qq + 1] - Y1[qq + 1]) + Math.abs(Y0[qq + 2] - Y1[qq + 2]) > 12) yc++;
    }
    o.yard = { n: yn, moved: yc };
    /* and the wind is off again for everything drawn after the world batch - a building or a
       unit painted green would otherwise sway with the trees */
    var sw = gl.getUniform(R3.meshP, gl.getUniformLocation(R3.meshP, 'uSway'));
    o.swayAfter = [sw[0], sw[1]];

    G.t = t0;
    gl.getError();
    window.RTS_POST_ON = true;
    shot();
    o.glErr = gl.getError();
    R3.swayAmt = undefined; R3.cloudAmt = undefined;
    return o;
  });

  S.ok('the 3D mode is available to check', out.on, out.on ? 'on' : 'no WebGL');
  if (!out.on) { await g.close(); await browser.close(); return require('../lib/report.js')(S); }
  var s = out.surf;
  S.ok('the surf changes the water by the beach', s.n > 150, s.n + ' sampled pixels change by more than 6 levels');
  S.ok('...brightening it, as foam', s.up > s.n * 0.9, s.up + ' of ' + s.n + ' of them brighten');
  S.ok('...where the sea is near the shore', s.near > s.n * 0.6, s.near + ' of ' + s.n + ' are sea within three cells of land');
  S.ok('...and not out in the open sea', s.farN > 50 && s.far < s.farN * 0.01,
       s.far + ' of ' + s.farN + ' sampled pixels of open sea change');
  S.ok('a moment later the lines have rolled on', s.overlap < 60, s.overlap + '% of the foam is where it was 1.2 seconds earlier');
  S.ok('there is a wood to watch', out.wood, String(out.wood));
  S.ok('the wind moves the wood from one moment to the next', out.sway > 1,
       out.sway + '% of the frame changes in 0.7 seconds');
  S.ok('...and with it stilled, nothing there moves at all', out.still === 0, out.still + '% of the frame changes');
  S.ok('the buildings do not sway in it', out.yard.n > 2000 && out.yard.moved < out.yard.n * 0.02,
       out.yard.moved + ' of ' + out.yard.n + ' pixels round the yard change in 0.7 seconds');
  S.ok('...and the wind is off for everything drawn after the world batch', out.swayAfter[0] === 0 && out.swayAfter[1] === 0,
       'uSway left at ' + out.swayAfter.join(', '));
  S.eq('no draw is refused with the surf, the wind and the post buffer on', out.glErr, 0);
  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
