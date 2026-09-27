/* The ore field's crystals - src/r3d/crystal.js.

   The field stood on _r3Cone: seven sides, a point, and a normal per corner so the fragment
   stage shades it as a smooth curve. Five hundred smooth tan cones read as wheat stubble, never
   as ore. A crystal reads by its FACETS - flat planes, bright one side of an edge and dark the
   other - so the crystal is a flat-shaded, leaning, jittered prism with a pyramid on it, grown
   in clusters. Each of those words is a claim below, because each can be quietly undone: give
   the faces normals and it is a cone again; drop the lean and it is a picket fence; share a
   vertex and _r3dLiftFrom lifts it twice. */

var { Suite } = require('../lib/assert.js');
var { load } = require('../lib/sandbox.js');

var fs = require('fs');
var path = require('path');
var S = new Suite('crystal');
/* the world batch's cull margin, read from its source rather than copied here */
var YMAX = +/var R3D_WORLD_YMAX = (\d+)/.exec(fs.readFileSync(
  path.join(__dirname, '..', '..', 'src', 'render3d', 'world3d.js'), 'utf8'))[1];
var g = load(['src/rules', 'src/r3d', 'src/sprites']);

function tris(faces) {
  var t = 0;
  for (var i = 0; i < faces.length; i++) t += Math.max(0, faces[i].v.length - 2);
  return t;
}
function bounds(faces) {
  var lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  faces.forEach(function (f) {
    f.v.forEach(function (v) {
      for (var k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], v[k]); hi[k] = Math.max(hi[k], v[k]); }
    });
  });
  return { lo: lo, hi: hi };
}
/* the normal _r3dBuildMesh gives a face with no `n`: from its first three corners */
function faceN(v) {
  var ax = v[1][0] - v[0][0], ay = v[1][1] - v[0][1], az = v[1][2] - v[0][2];
  var bx = v[2][0] - v[0][0], by = v[2][1] - v[0][1], bz = v[2][2] - v[0][2];
  return [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
}
function centroid(v) {
  var c = [0, 0, 0];
  v.forEach(function (p) { for (var k = 0; k < 3; k++) c[k] += p[k] / v.length; });
  return c;
}
var COLS = ['#aa8822', '#cc9933', '#eecc66'];

/* ----------------------------------------------------------------- one crystal ------ */
(function () {
  var LX = 0.5, LZ = -0.3, R = 0.3, H = 2;
  var out = [];
  g._r3Crystal(out, 10, 0, 20, R, H, LX, LZ, COLS, 6, 0.3, 17);

  S.eq('a six-sided crystal is six sides and six tip facets', out.length, 12);
  S.eq('...eighteen triangles, where the cone it replaced spent fourteen on a smooth point',
       tris(out), 18);

  /* THE WHOLE POINT. A face with `n` is shaded as a curve by the fragment stage. */
  var curved = out.filter(function (f) { return !!f.n; }).length;
  S.eq('no face carries per-corner normals, so every facet shades flat', curved, 0);

  /* No culling in this renderer, so a face turned inward would not vanish - it would light
     from the wrong side, and a crystal would glow where it should be in shade. Measured
     against the AXIS rather than the centre, which a tall thin prism's side faces sit close
     to along their own length. */
  var dl = Math.hypot(LX, 1, LZ), d = [LX / dl, 1 / dl, LZ / dl];
  var apex = out[1].v[2];
  var base = [apex[0] - d[0] * H, apex[1] - d[1] * H, apex[2] - d[2] * H];
  var inward = out.filter(function (f) {
    var c = centroid(f.v), n = faceN(f.v);
    var t = (c[0] - base[0]) * d[0] + (c[1] - base[1]) * d[1] + (c[2] - base[2]) * d[2];
    var r = [c[0] - base[0] - d[0] * t, c[1] - base[1] - d[1] * t, c[2] - base[2] - d[2] * t];
    return n[0] * r[0] + n[1] * r[1] + n[2] * r[2] <= 0;
  }).length;
  S.eq('every facet faces out', inward, 0);

  /* the sides are planar - _r3dBuildMesh takes one normal from the first three corners, and
     a warped quad would light as a fold along its diagonal */
  var worst = 0;
  out.forEach(function (f) {
    if (f.v.length < 4) return;
    var n = faceN(f.v), nl = Math.hypot(n[0], n[1], n[2]);
    var p = f.v[3], o = f.v[0];
    worst = Math.max(worst, Math.abs(((p[0] - o[0]) * n[0] + (p[1] - o[1]) * n[1] +
                                      (p[2] - o[2]) * n[2]) / nl));
  });
  S.ok('every side is a flat trapezoid', worst < 1e-9, 'furthest corner off its plane: ' + worst);

  /* IT LEANS the way it was told to: the apex sits along (lx, 1, lz) from the base centre */
  var ax = apex[0] - 10, az = apex[2] - 20;
  S.near('it leans the way it was asked, in x', ax / (apex[1] - base[1]), LX, 1e-9);
  S.near('...and in z', az / (apex[1] - base[1]), LZ, 1e-9);

  /* AND DOES NOT FLOAT. Leaning lifts one side of the base ring; the ring is sunk to meet it. */
  var ringTop = -1e9;
  out.forEach(function (f) { if (f.v.length === 4) ringTop = Math.max(ringTop, f.v[0][1], f.v[1][1]); });
  S.ok('the high side of its base still meets the ground', ringTop <= 0,
       'highest base corner at y = ' + ringTop.toFixed(3));

  /* the tip takes the light tone, the sides alternate - the colours carry the facets where
     the light alone would not separate them */
  var tipHex = g._r3Hex(COLS[2]).join(','), sideHex = {};
  var tipsOk = out.filter(function (f) { return f.v.length === 3; })
                  .every(function (f) { return f.c.join(',') === tipHex; });
  out.forEach(function (f) { if (f.v.length === 4) sideHex[f.c.join(',')] = 1; });
  S.ok('the tip facets take the tip tone', tipsOk, tipHex);
  S.eq('...and the sides alternate between two', Object.keys(sideHex).length, 2);

  /* EVERY CORNER ITS OWN ARRAY. _r3dLiftFrom adds the cell's elevation to each vertex in place;
     a vertex shared by two faces goes up twice and tears the crystal. */
  var seen = new Set(), shared = 0;
  out.forEach(function (f) { f.v.forEach(function (p) { if (seen.has(p)) shared++; seen.add(p); }); });
  S.eq('no vertex array is shared between faces, so lifting a cell cannot tear one', shared, 0);

  /* hash-placed, never random: the same map must grow the same field on every machine */
  var again = [];
  g._r3Crystal(again, 10, 0, 20, R, H, LX, LZ, COLS, 6, 0.3, 17);
  S.eq('the same seed grows the same crystal', JSON.stringify(again), JSON.stringify(out));
  var other = [];
  g._r3Crystal(other, 10, 0, 20, R, H, LX, LZ, COLS, 6, 0.3, 18);
  S.ok('...and another seed a different one - no two facets on the field the same width',
       JSON.stringify(other) !== JSON.stringify(out), 'seeds 17 and 18');
})();

/* ------------------------------------------------------------------ one cell ------- */
(function () {
  var T = g.RTS_TILE, PO = g.RTS_PAL.ore, PG = g.RTS_PAL.gem;
  var n = 0, triTot = 0, escaped = 0, maxH = 0, nonflat = 0, faces = 0;
  var goldAspect = 0, gemAspect = 0, goldH = 0, gemH = 0, lowH = 0;
  for (var tx = 0; tx < 32; tx++) {
    for (var tz = 0; tz < 32; tz++) {
      var o = [];
      g._r3OreCell(o, 0, 0, tx, tz, 1, false, PO);
      triTot += tris(o); n++;
      faces += o.length;
      nonflat += o.filter(function (f) { return !!f.n; }).length;
      var b = bounds(o);
      /* inside the cell, give or take a tile for the lean - what the chunk's cull box allows */
      if (Math.max(-b.lo[0], b.hi[0], -b.lo[2], b.hi[2]) > T / 2 + T) escaped++;
      maxH = Math.max(maxH, b.hi[1]);
      goldH += b.hi[1];
      goldAspect += b.hi[1] / Math.max(b.hi[0] - b.lo[0], b.hi[2] - b.lo[2]);
      var og = [];
      g._r3OreCell(og, 0, 0, tx, tz, 1, true, PG);
      var bg = bounds(og);
      gemH += bg.hi[1];
      gemAspect += bg.hi[1] / Math.max(bg.hi[0] - bg.lo[0], bg.hi[2] - bg.lo[2]);
      var ol = [];
      g._r3OreCell(ol, 0, 0, tx, tz, 0.05, false, PO);
      lowH += bounds(ol).hi[1];
    }
  }
  var per = triTot / n;
  S.ok('a cell is a cluster of crystals worth real geometry', per > 120 && per < 220,
       per.toFixed(1) + ' triangles a cell; the five cones it replaced were 70');
  S.eq('...and every one of its facets is flat', nonflat, 0);
  S.eq('every cell keeps its crystals over its own ground, give or take the lean', escaped, 0);
  S.ok('nothing stands taller than the world cull margin allows', maxH < YMAX,
       'tallest ' + maxH.toFixed(2) + ' against R3D_WORLD_YMAX = ' + YMAX);
  S.ok('a worked-out cell is a field of stumps, not a field of the same crystals',
       lowH < goldH * 0.55, (lowH / n).toFixed(2) + ' tall at 5% against ' +
       (goldH / n).toFixed(2) + ' at full');

  /* GEMS ARE A DIFFERENT MINERAL BY SHAPE, not only by colour - the part a colour-blind player
     can see. Slender and tall against gold's stubby habit. */
  S.ok('a gem cell grows taller than a gold one', gemH > goldH * 1.25,
       (gemH / n).toFixed(2) + ' against ' + (goldH / n).toFixed(2));
  S.ok('...and more slender', gemAspect > goldAspect * 1.2,
       'height over width ' + (gemAspect / n).toFixed(2) + ' against ' + (goldAspect / n).toFixed(2));

  /* one or two clusters a cell, so the field is not a grid of identical tufts */
  var counts = {};
  for (var i = 0; i < 64; i++) {
    var oc = [];
    g._r3OreCell(oc, 0, 0, i, 3 * i + 1, 1, false, PO);
    counts[oc.length] = 1;
  }
  S.ok('cells differ from one another', Object.keys(counts).length >= 8,
       Object.keys(counts).length + ' distinct face counts over 64 cells');
})();

/* ---------------------------------------------------------- a cluster, not a fence ---
   Upright crystals on a jittered grid read as a picket fence. A cluster grows from a seam: a
   near-upright crystal in the middle and the rest LEANING OUT from it. Recorded by standing in
   for _r3Crystal - the cell calls it by its global name - so the claim is about the layout the
   cell asked for, not about a reconstruction of it from the faces. */
(function () {
  var real = g._r3Crystal, calls = [];
  g._r3Crystal = function (out, x, y, z, r, h, lx, lz) {
    calls.push({ x: x, z: z, lean: Math.hypot(lx, lz), lx: lx, lz: lz });
    return real.apply(null, arguments);
  };
  try {
    for (var tx = 0; tx < 24; tx++)
      for (var tz = 0; tz < 24; tz++) g._r3OreCell([], 0, 0, tx, tz, 1, false, g.RTS_PAL.ore);
  } finally { g._r3Crystal = real; }
  var cx = 0, cz = 0, sat = 0, out = 0, centres = 0;
  calls.forEach(function (c) {
    if (c.lean < 0.3) { cx = c.x; cz = c.z; centres++; return; }
    if (c.lean >= 1) return;                       /* rubble, lying down */
    sat++;
    if ((c.x - cx) * c.lx + (c.z - cz) * c.lz > 0) out++;
  });
  S.ok('each cluster has a near-upright crystal at its heart', centres >= 24 * 24,
       centres + ' centres over ' + 24 * 24 + ' cells');
  S.ok('...and most of its crystals lean', sat > centres * 2.5,
       sat + ' leaning satellites to ' + centres + ' centres');
  S.eq('...every one of them away from the heart, as a cluster grows', out, sat);
})();

require('../lib/report.js')(S);
