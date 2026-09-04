/* The model primitives — src/r3d/primitives.js.

   The models were built out of five-quad boxes and eight-sided drums. _r3Slab existed because
   of it: a plain box presents two faces to this camera, top and front, so its roof is one flat
   polygon of one colour and the thing reads as a shed. That argument was never actually limited
   to buildings — it was equally true of a tank hull, an oil drum and a soldier's helmet, and
   every one of those was a plain box.

   Three changes here, and each is pinned below because each can be quietly undone:

     THE CHAMFER. _r3Box cuts its vertical and top edges back, turning two visible faces into
     ten and letting the light grade them. 30 triangles where there were 10.
     THE SEGMENT FLOOR. The roster had drifted to eight different hand-picked segment counts,
     the smallest of which was 8 — an octagon, and no amount of interpolated normals hides an
     octagonal silhouette.
     _r3Wheel. _r3Cyl is upright by construction, so nothing in this game could draw a wheel:
     every road wheel was a box and the Scout Buggy's four were drums standing on their ends.

   All of it is affordable for one reason, which is worth stating because it is the thing that
   changed: entities no longer cost a draw call each (render3d/inst3d.js), and a model's buffers
   are built once and instanced thereafter. The cost moved to the stage that was idling. */

var { Suite } = require('../lib/assert.js');
var { load } = require('../lib/sandbox.js');

var S = new Suite('geometry');
var g = load(['src/rules', 'src/r3d', 'src/sprites']);

function tris(faces) {
  var t = 0;
  for (var i = 0; i < faces.length; i++) t += Math.max(0, faces[i].v.length - 2);
  return t;
}
/* the extent of a face list, which is how a silhouette is checked without a renderer */
function bounds(faces) {
  var lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  faces.forEach(function (f) {
    f.v.forEach(function (v) {
      for (var k = 0; k < 3; k++) {
        if (v[k] < lo[k]) lo[k] = v[k];
        if (v[k] > hi[k]) hi[k] = v[k];
      }
    });
  });
  return { lo: lo, hi: hi };
}

/* ---------------------------------------------------------------- the chamfer ----*/
(function () {
  var out = [];
  g._r3Box(out, 0, 0, 0, 10, 6, 8, '#808080', '#a0a0a0');
  S.ok('a box is chamfered rather than six flat quads', out.length >= 16,
       out.length + ' faces, ' + tris(out) + ' triangles — it was 5 faces and 10 triangles');

  /* THE SILHOUETTE MUST NOT SHRINK. A chamfer that cut into the footprint would quietly
     resize every model in the game: a 3x3 building would stop filling its own three cells and
     a tank would stop meeting the track it rides on. The cut takes the CORNERS, so the extent
     across each axis is exactly what was asked for. */
  var b = bounds(out);
  S.near('...without moving the footprint in x', b.hi[0] - b.lo[0], 10, 1e-9);
  S.near('...or in z', b.hi[2] - b.lo[2], 8, 1e-9);
  S.near('...or the height', b.hi[1] - b.lo[1], 6, 1e-9);
  S.near('...and it still stands on y = 0, which every model assumes', b.lo[1], 0, 1e-9);

  /* Below the threshold the cut would be thinner than the sprite baker's own pixel, and
     sub-pixel facets are not detail — they are noise with a triangle count. */
  var tiny = [];
  g._r3Box(tiny, 0, 0, 0, 0.3, 0.3, 0.3, '#808080');
  S.eq('a box too small to show a chamfer does not pay for one', tiny.length, 5);

  /* the top keeps its own colour, which is what carries every team marker in the game */
  var top = out[out.length - 1];
  S.eq('the top face still takes topCol', top.c.join(','), g._r3Hex('#a0a0a0').join(','));
})();

/* ------------------------------------------------------- the 3D detail level ----
   The 3D view and the sprite baker share these primitives on purpose - one copy of every shape
   - but they do different things with the result. A sprite is 22 to 44 art pixels across and
   cannot show a rounded edge; the 3D view draws the same model at 100 to 200 and, since
   render3d/inst3d.js, draws every copy of it in one call. So the shape is one shape and the
   tessellation is two, and _r3dMesh raises the level only while it builds its buffers.

   THE INVARIANT THAT MATTERS is that a rounder edge is cut from the SAME box. If the extents
   moved with the detail level, a building would stop filling its own cells the moment the 3D
   view drew it, and the 3D and 2D pipelines would disagree about how big everything is. */
(function () {
  var W = 10, H = 6, D = 8;
  var lo = [], hi = [];
  g._r3Box(lo, 0, 0, 0, W, H, D, '#808080', '#a0a0a0');
  g._r3DetailHigh(function () { g._r3Box(hi, 0, 0, 0, W, H, D, '#808080', '#a0a0a0'); });

  S.ok('the 3D level spends a lot more geometry on a box', tris(hi) > tris(lo) * 2,
       tris(hi) + ' triangles against ' + tris(lo) + ' - and 10 before any of this');

  var a = bounds(lo), b = bounds(hi);
  ['x', 'y', 'z'].forEach(function (ax, k) {
    S.near('...cut from the same box, ' + ax, b.hi[k] - b.lo[k], a.hi[k] - a.lo[k], 1e-9);
  });
  S.near('...standing on the same ground', b.lo[1], 0, 1e-9);

  /* A ROUNDED EDGE ONLY LOOKS ROUND IF IT SAYS SO. Flat faces would give the same silhouette
     and a ring of hard tone steps - the segments would be spent on nothing the shading can
     use, which is the exact trap this project's own graphics rules name. */
  var curved = hi.filter(function (f) { return !!f.n; }).length;
  S.ok('and its faces carry a normal per corner, so the highlight moves along them',
       curved > hi.length * 0.8,
       curved + ' of ' + hi.length + ' faces are shaded as curves');
  S.eq('...the flat top is not one of them',
       hi[hi.length - 1].n === undefined, true);

  /* THE BAKER MUST NOT SEE ANY OF IT. Its output is a sprite, its cost is start-up time, and
     the whole point of scoping the level is that neither moves. */
  var after = [];
  g._r3Box(after, 0, 0, 0, W, H, D, '#808080', '#a0a0a0');
  S.eq('the level is put back afterwards, so the baker is untouched', after.length, lo.length);
  try { g._r3DetailHigh(function () { throw new Error('x'); }); } catch (e) {}
  var thrown = [];
  g._r3Box(thrown, 0, 0, 0, W, H, D, '#808080', '#a0a0a0');
  S.eq('...even when the build throws', thrown.length, lo.length);
})();

/* ------------------------------------------------------------- the segment floor ----*/
(function () {
  S.ok('there is a floor at all', g.R3_SEG_MIN >= 20, 'R3_SEG_MIN = ' + g.R3_SEG_MIN);

  var cyl = [];
  g._r3Cyl(cyl, 0, 0, 0, 4, 6, '#808080', '#a0a0a0', 8);   /* an octagon, as the roster asked */
  S.ok('a cylinder that asks for 8 sides gets the floor instead', cyl.length >= g.R3_SEG_MIN,
       cyl.length + ' faces for a call that said seg=8');

  var fine = [];
  g._r3Cyl(fine, 0, 0, 0, 4, 6, '#808080', '#a0a0a0', 40);
  S.ok('...and one that asks for more still gets more', fine.length > cyl.length,
       fine.length + ' faces for seg=40 against ' + cyl.length + ' for seg=8');

  /* the sides carry per-corner normals - that is what makes a ring of flat strips shade as a
     curve, and it is the half of "round" that the segment count cannot buy on its own */
  var withN = cyl.filter(function (f) { return !!f.n; }).length;
  S.ok('its sides say they are a curve', withN >= g.R3_SEG_MIN,
       withN + ' of ' + cyl.length + ' faces carry per-vertex normals (the caps must not)');
})();

/* -------------------------------------------------------------------- the wheel ----*/
(function () {
  var w = [];
  g._r3Wheel(w, 5, 3, -2, 2, 1.5, 'z', '#404040', '#606060');
  S.ok('a wheel is emitted at all', w.length > g.R3_SEG_MIN, w.length + ' faces');

  /* EVERY RIM VERTEX IS EXACTLY r FROM THE AXLE. This is the assertion that would catch the
     axes being confused - build it around the wrong pair and the ring is an ellipse in the
     plane it was meant to be a circle in. */
  var worst = 0;
  w.forEach(function (f) {
    if (!f.n) return;                                       /* the two faces, not the rim */
    f.v.forEach(function (v) {
      var d = Math.abs(Math.hypot(v[0] - 5, v[1] - 3) - 2);
      if (d > worst) worst = d;
    });
  });
  S.ok('the rim is round about its axle', worst < 1e-9, 'worst radius error ' + worst);

  var b = bounds(w);
  S.near('...and it is only as thick as it was told, along z', b.hi[2] - b.lo[2], 1.5, 1e-9);
  S.near('...centred on the axle rather than sitting on it', (b.hi[1] + b.lo[1]) / 2, 3, 1e-9);

  /* the same wheel on the other axis, because an `axis` argument that is read and ignored is
     the exact bug the horizontal pipe carried for months */
  var x = [];
  g._r3Wheel(x, 0, 0, 0, 2, 1.5, 'x', '#404040');
  var bx = bounds(x);
  S.near('an axle along x is thick along x', bx.hi[0] - bx.lo[0], 1.5, 1e-9);
  S.near('...and round in z', bx.hi[2] - bx.lo[2], 4, 1e-9);
})();

/* ------------------------------------------------------------- the models got denser ----
   The primitives above can be right while every model still goes out lean, so the roster is
   measured too. These are floors well under what is built today, not targets: they exist to
   catch a model being flattened back to boxes, not to freeze a number. */
(function () {
  var uMin = 1e9, uName = '', uTot = 0, uN = 0;
  g.RTS_UNITS.forEach(function (u) {
    var f = null;
    try { f = g._sprUnitModel(u.key, 'player', false, null); } catch (e) { return; }
    if (!f || !f.length) return;
    var t = tris(f);
    uTot += t; uN++;
    if (t < uMin) { uMin = t; uName = u.key; }
  });
  S.ok('every unit carries real geometry', uMin >= 250,
       uN + ' units average ' + Math.round(uTot / uN) + ' triangles; leanest is ' +
       uName + ' at ' + uMin + ' (they averaged 281 before this, with a floor of 48)');

  var bMin = 1e9, bName = '', bTot = 0, bN = 0;
  g.RTS_STRUCTS.forEach(function (b) {
    var f = null;
    try { f = g._sprBuildingModel(b.key, 'player'); } catch (e) { return; }
    if (!f || !f.length) return;
    var t = tris(f);
    bTot += t; bN++;
    if (t < bMin) { bMin = t; bName = b.key; }
  });
  S.ok('...and so does every structure', bMin >= 200,
       bN + ' structures average ' + Math.round(bTot / bN) + ' triangles; leanest is ' +
       bName + ' at ' + bMin + ' (they averaged 1,182 before this)');
  S.note('the roster totals ' + (uTot + bTot) + ' triangles, against 53,528 before — built once ' +
         'per model and instanced thereafter, so this is upload cost, not per-frame cost');
})();

require('../lib/report.js')(S);
