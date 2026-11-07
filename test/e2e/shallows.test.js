/* THE SEA IS SHALLOW AT ITS SHORE - render3d/shelf3d.js.

   The sea was one deep blue from the foam line out: the shore's own look lived inside the first
   fifth of a cell. Now the mask the sea is cut from carries how far out each cell lies from the
   land, and the water is coloured by it - turquoise at the beach, fading to the deep over
   R3D_SHELF_W cells - with the caustics netting the sand up close. Read off the GL canvas over the
   real shore nearest the player's yard, the swell held flat so a sample lands where it is aimed,
   with R3.shelfAmt = 0 as the before-picture:

     THE SHORE     there is one in view: water a cell, two cells and four or more out from land
     SHALLOWS      a cell out, the sea is lighter and greener than it was
     GRADED        ...less so two cells out; four or more out it is exactly as it was
     NOT THE LAND  land two cells from the water is untouched
     CAUSTICS      up close the caustics alone (R3.causticAmt = 0) brighten the shallows - a
                   net of thin lines, so a twelfth of the samples - and never the deep...
     NOT FAR       ...and at the widest zoom there are none: fine lines would only shimmer
     THE APRON     the sea painted past the map's edge is shallow at its mirrored shore too, and
                   deep out from it
     FROZEN        under snow the water a cell out is ice - pale, its blue gone - by the same
                   distance out; four or more out it is open water */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('shallows');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 900, height: 700, dpr: 1 });
  await g.start(7, 1, { freeze: true });

  var out = await g.page.evaluate(function () {
    var o = {}, R = _rtsR, G = window._rtsG, R3 = window._R3D, N = RTS_N, i;
    o.on = !!(R3 && R3.on);
    if (!o.on) return o;
    for (i = 0; i < N * N; i++) { G.mapped[i] = 1; G.vis[i] = 1; } G.visDirty = 1;
    window.RTS_SKY_FORCE = 'day';
    var keepAmp = window.R3D_WAVE_AMP; window.R3D_WAVE_AMP = 0;
    var gl = R3.gl, CW = R3.cv.width, CH = R3.cv.height, EXT = N * RTS_TILE / 2;
    function shot() {
      _rtsRFrame(0); _rtsRFrame(0);
      var b = new Uint8Array(CW * CH * 4);
      gl.readPixels(0, 0, CW, CH, gl.RGBA, gl.UNSIGNED_BYTE, b);
      return b;
    }
    function wet(x, z) { return x >= 0 && z >= 0 && x < N && z < N && G.terrain[z * N + x] === RTS_T_WATER; }
    /* how far a cell (water: kind true) lies from the nearest cell of the other kind, centre to
       centre - worked out here by brute force, not by the field under test */
    function far(x, z, kind) {
      var b = 99;
      for (var dz = -6; dz <= 6; dz++) for (var dx = -6; dx <= 6; dx++) {
        var ax = x + dx, az = z + dz;
        if (ax < 0 || az < 0 || ax >= N || az >= N) continue;
        if (wet(ax, az) !== kind) b = Math.min(b, Math.hypot(dx, dz));
      }
      return b;
    }
    /* the pixel a world point lands on, or -1 off the canvas */
    function px(x, y, z) {
      var s = _rtsWorldToScreen(x, y, z), qx = Math.round(s.x * R.dpr), qy = Math.round(s.y * R.dpr);
      if (s.behind || qx < 2 || qy < 2 || qx >= CW - 2 || qy >= CH - 2) return -1;
      return ((CH - 1 - qy) * CW + qx) * 4;
    }
    function lum(b, p) { return 0.3 * b[p] + 0.59 * b[p + 1] + 0.11 * b[p + 2]; }
    function diff(A, B, p) { return Math.abs(A[p] - B[p]) + Math.abs(A[p + 1] - B[p + 1]) + Math.abs(A[p + 2] - B[p + 2]); }

    /* THE SHORE: the deep water nearest the yard, looked at from close enough to see its beach */
    var yd = _rtsHas('player', 'yard'), ax = _rtsTX(yd.x), az = _rtsTX(yd.z), deep = null, bd = 1e9, x, z;
    for (z = 0; z < N; z++) for (x = 0; x < N; x++) {
      if (!wet(x, z)) continue;
      var dd = (x - ax) * (x - ax) + (z - az) * (z - az);
      if (dd < bd && far(x, z, true) >= 4) { bd = dd; deep = [x, z]; }
    }
    if (!deep) return o;
    o.deep = deep;
    R.focus.x = _rtsWX(deep[0]); R.focus.z = _rtsWX(deep[1]); R.zi = 1; _rtsApplyCam();
    /* the cells in view, by how far they lie from the other kind */
    var cells = [];
    for (z = deep[1] - 14; z <= deep[1] + 14; z++) for (x = deep[0] - 14; x <= deep[0] + 14; x++) {
      if (x < 0 || z < 0 || x >= N || z >= N) continue;
      var w = wet(x, z), d = far(x, z, w);
      var p = w ? px(_rtsWX(x), R3D_WATER_Y, _rtsWX(z)) : px(_rtsWX(x), _rtsElev(_rtsWX(x), _rtsWX(z)), _rtsWX(z));
      if (p >= 0) cells.push({ w: w, d: d, p: p });
    }
    function bucket(test) { return cells.filter(function (c) { return test(c); }); }
    var one = bucket(function (c) { return c.w && c.d < 1.01; });
    var two = bucket(function (c) { return c.w && c.d > 1.9 && c.d < 2.3; });
    var four = bucket(function (c) { return c.w && c.d >= 4; });
    var land = bucket(function (c) { return !c.w && c.d >= 2; });
    o.counts = [one.length, two.length, four.length, land.length];

    /* the shelf by itself: the caustics out of both pictures */
    R3.causticAmt = 0;
    R3.shelfAmt = undefined; var A = shot();
    R3.shelfAmt = 0; var B = shot();
    R3.shelfAmt = undefined;
    function gain(set) {
      var s = { g: 0, l: 0, greener: 0, same: 0, n: set.length };
      set.forEach(function (c) {
        var dg = A[c.p + 1] - B[c.p + 1];
        s.g += dg; s.l += lum(A, c.p) - lum(B, c.p);
        if (dg > 6 && A[c.p + 1] - A[c.p + 2] > B[c.p + 1] - B[c.p + 2]) s.greener++;
        if (diff(A, B, c.p) <= 3) s.same++;
      });
      if (s.n) { s.g /= s.n; s.l /= s.n; }
      return s;
    }
    o.one = gain(one); o.two = gain(two); o.four = gain(four); o.land = gain(land);

    /* FROZEN: the same view under snow, without the falling flakes */
    window.RTS_SKY_FORCE = 'snow'; R3.snowAmt = 0;
    var SN = shot();
    window.RTS_SKY_FORCE = 'day'; R3.snowAmt = undefined;
    function pale(set) {
      var s = 0, n = 0;
      set.forEach(function (c) {
        var mx = Math.max(SN[c.p], SN[c.p + 1], SN[c.p + 2]), mn = Math.min(SN[c.p], SN[c.p + 1], SN[c.p + 2]);
        s += (mx - mn) / Math.max(mx, 1); n++;
      });
      return n ? s / n : 0;
    }
    o.ice = [+pale(one).toFixed(3), +pale(four).toFixed(3)];

    /* CAUSTICS, up close, over the same shore */
    R.zi = RTS_ZOOMS.length - 2; _rtsApplyCam();
    var near = [], deepNear = [];
    for (z = deep[1] - 10; z <= deep[1] + 10; z++) for (x = deep[0] - 10; x <= deep[0] + 10; x++) {
      if (!wet(x, z)) continue;
      var dn = far(x, z, true);
      for (var sz = 0; sz < 4; sz++) for (var sx = 0; sx < 4; sx++) {
        var q = px(_rtsWX(x) + (sx / 4 - 0.375) * RTS_TILE, R3D_WATER_Y, _rtsWX(z) + (sz / 4 - 0.375) * RTS_TILE);
        if (q < 0) continue;
        if (dn < 2.3) near.push(q); else if (dn >= 4) deepNear.push(q);
      }
    }
    R3.causticAmt = undefined; var C = shot();
    R3.causticAmt = 0; var D = shot();
    var cn = 0, cb = 0;
    near.forEach(function (q) { if (diff(C, D, q) > 6) { cn++; if (lum(C, q) >= lum(D, q)) cb++; } });
    var cd = 0;
    deepNear.forEach(function (q) { if (diff(C, D, q) > 3) cd++; });
    o.caustic = { n: near.length, changed: cn, brighter: cb, deep: deepNear.length, deepChanged: cd, zoom: _rtsZoom() };
    /* NOT FAR: the widest zoom */
    R.zi = 0; _rtsApplyCam();
    R3.causticAmt = undefined; var E = shot();
    R3.causticAmt = 0; var F = shot();
    R3.causticAmt = undefined;
    var fn = 0;
    for (i = 0; i < E.length; i += 4) if (diff(E, F, i) > 6) fn++;
    o.far = { changed: fn, zoom: _rtsZoom() };

    /* THE APRON: the edge with the most water near it, and its mirror past the edge */
    var edges = [0, 0, 0, 0];               /* -x, +x, -z, +z */
    for (z = 0; z < N; z++) for (x = 0; x < N; x++) {
      if (!wet(x, z)) continue;
      if (x < 20) edges[0]++; if (x >= N - 20) edges[1]++; if (z < 20) edges[2]++; if (z >= N - 20) edges[3]++;
    }
    var e = edges.indexOf(Math.max.apply(null, edges));
    o.edgeWater = edges[e];
    function mirror(wx, wz) {
      if (e === 0) return [-2 * EXT - wx, wz];
      if (e === 1) return [2 * EXT - wx, wz];
      if (e === 2) return [wx, -2 * EXT - wz];
      return [wx, 2 * EXT - wz];
    }
    var ap = [], sx0 = 0, sz0 = 0;
    for (z = 0; z < N; z++) for (x = 0; x < N; x++) {
      var inBand = e === 0 ? x < 20 : e === 1 ? x >= N - 20 : e === 2 ? z < 20 : z >= N - 20;
      if (!inBand || !wet(x, z)) continue;
      ap.push({ x: x, z: z, d: far(x, z, true) });
      sx0 += x; sz0 += z;
    }
    o.apron = { shore: 0, shoreChanged: 0, deep: 0, deepSame: 0 };
    if (ap.length) {
      var m0 = mirror(_rtsWX(Math.round(sx0 / ap.length)), _rtsWX(Math.round(sz0 / ap.length)));
      R.focus.x = m0[0]; R.focus.z = m0[1]; R.zi = 1; _rtsApplyCam();
      R3.shelfAmt = undefined; var H = shot();
      R3.shelfAmt = 0; var J = shot();
      R3.shelfAmt = undefined;
      ap.forEach(function (c) {
        var m = mirror(_rtsWX(c.x), _rtsWX(c.z)), q = px(m[0], 0, m[1]);
        if (q < 0) return;
        if (c.d < 1.01) { o.apron.shore++; if (H[q + 1] - J[q + 1] > 4) o.apron.shoreChanged++; }
        else if (c.d >= 4) { o.apron.deep++; if (diff(H, J, q) <= 3) o.apron.deepSame++; }
      });
    }
    o.err = gl.getError();
    window.R3D_WAVE_AMP = keepAmp;
    window.RTS_SKY_FORCE = undefined;
    R3.causticAmt = undefined;
    return o;
  });

  S.ok('the 3D view is on', out.on, '');
  if (out.on) {
    var c = out.counts || [0, 0, 0, 0];
    S.ok('THE SHORE: water a cell, two cells and four or more out from land, and land, all in view',
         c[0] > 20 && c[1] > 10 && c[2] > 20 && c[3] > 20,
         c[0] + ' a cell out, ' + c[1] + ' two, ' + c[2] + ' four or more; ' + c[3] + ' land cells');
  }
  if (out.on && out.one) {
    S.ok('SHALLOWS: a cell out the sea is lighter and greener than it was',
         out.one.g > 15 && out.one.l > 8 && out.one.greener > out.one.n * 0.6,
         '+' + out.one.g.toFixed(1) + ' green, +' + out.one.l.toFixed(1) + ' brighter; ' + out.one.greener + ' of ' +
         out.one.n + ' turned toward green');
    S.ok('GRADED: two cells out less so, and four or more out exactly as it was',
         out.two.g > 3 && out.two.g < out.one.g * 0.8 && out.four.same === out.four.n,
         'green +' + out.one.g.toFixed(1) + ' a cell out, +' + out.two.g.toFixed(1) + ' two out; ' +
         out.four.same + ' of ' + out.four.n + ' four or more out untouched');
    S.ok('NOT THE LAND: land two cells from the water is untouched', out.land.same === out.land.n,
         out.land.same + ' of ' + out.land.n);
    var k = out.caustic;
    S.ok('CAUSTICS: up close the caustics brighten the shallows, never the deep',
         k.n > 200 && k.changed > k.n * 0.04 && k.brighter > k.changed * 0.95 && k.deep > 50 && k.deepChanged === 0,
         k.changed + ' of ' + k.n + ' shallow samples changed (' + k.brighter + ' brighter) at ' + k.zoom +
         ' px a unit; ' + k.deepChanged + ' of ' + k.deep + ' deep ones');
    S.ok('NOT FAR: at the widest zoom there are no caustics', out.far.changed === 0,
         out.far.changed + ' pixels at ' + out.far.zoom + ' px a unit');
    var a = out.apron;
    S.ok('THE APRON: past the edge the sea is shallow at its mirrored shore, and deep out from it',
         a.shore > 10 && a.shoreChanged > a.shore * 0.6 && a.deep > 10 && a.deepSame === a.deep,
         a.shoreChanged + ' of ' + a.shore + ' shore samples lighter; ' + a.deepSame + ' of ' + a.deep +
         ' deep ones untouched (' + out.edgeWater + ' water cells by that edge)');
    S.ok('FROZEN: under snow the water a cell out is ice, pale; four or more out it is open water',
         out.ice[0] < 0.35 && out.ice[0] < out.ice[1] * 0.5,
         'saturation ' + out.ice[0] + ' a cell out, ' + out.ice[1] + ' four or more out');
    S.ok('no GL error', out.err === 0, 'error ' + out.err);
  }
  S.ok('the page logged no errors', !g.errors.length, g.errors.slice(0, 2).join(' | ') || 'clean');
  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
