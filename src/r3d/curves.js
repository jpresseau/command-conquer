/* r3d/curves.js - the primitives that are genuinely round, and the detail level that decides
   how round. Part of rts.r3d, the model kit; r3d/primitives.js is the rest of it.

   Split out because primitives.js went over this project's 500-line limit the moment boxes
   learned to round their edges. What is here is the geometry whose whole point is curvature:
   the wheel, the rounded box, and the knob that says how many segments to spend on them. */

/* HOW FINELY A MODEL IS TESSELLATED, and the whole reason this is a knob rather than a
   constant: the 3D view and the sprite baker share these primitives on purpose - there is one
   copy of every shape in this game and that is worth keeping - but they do completely different
   things with the result.

   The BAKER rasterises 1,296 facings at load into sprites 22 to 44 art pixels across. Geometry
   finer than that cannot appear in the output and is paid for in start-up time; measured, the
   bake is already the dominant cost of opening the game.

   The 3D VIEW draws the same models at 100 to 200 pixels, and since render3d/inst3d.js it draws
   all the copies of one in a single call. The vertex stage is the part that is idle.

   So the shape is one shape and the tessellation is two. _r3dMesh raises this while it builds
   the 3D buffers and drops it again; everything else - the baker included - sees exactly the
   geometry it saw before, which is why the sprite specs do not move. Extents are identical at
   every level: a rounder edge is cut from the same box, never a bigger or smaller one. */
/* SET FROM A BUDGET, not from taste. The static world batch is about 1,049,000 triangles and
   is drawn every frame and again from the sun; entity geometry should cost about what the
   ground it stands on costs, which at a 160-unit battle - roughly 200 instances a pass, hull
   and turret - is around 5,000 triangles a model. At 1 the models carry about 2,000. Two is
   what lands on the budget: every box goes from a 30-triangle chamfer to a 74-triangle rounded
   edge, and every round thing doubles its segments.

   e2e/instanced holds the resulting per-frame vertex count under a ceiling, the way e2e/canopy
   holds the world batch under one - so raising this is not a decision anyone can make quietly. */
var R3_DETAIL_3D = 2;
var _R3_DETAIL = 1;
/* THE SEGMENT MULTIPLIER IS NOT THE DETAIL LEVEL, and separating them is worth a third of the
   cost. Doubling _r3Seg puts 48 sides on every cylinder in the game, and a 24-sided one is
   already past the point where the silhouette reads as round - the segments go somewhere no
   pixel can show them. The rounded EDGE is the part that pays: a flat chamfer holds one tone
   and a rounded one carries a highlight that moves as the model turns. So the box rounds and
   the drums stay as they are. */
var R3_DETAIL_SEG = 1;
function _r3DetailHigh(fn) {
  var keep = _R3_DETAIL;
  _R3_DETAIL = R3_DETAIL_3D;
  try { return fn(); } finally { _R3_DETAIL = keep; }
}


/* A WHEEL - a cylinder lying on its side, which _r3Cyl cannot be: it is upright by
   construction, so every road wheel, drive sprocket, idler and roadwheel hub in the game was a
   BOX. That is the single most conspicuous thing left after the chamfer: a tank rolling on
   eight cubes.

   `axis` is 'x' or 'z' - the direction the axle points. The rim carries per-corner radial
   normals for the same reason _r3Cyl's sides do, so it shades as a curve rather than as a ring
   of flat strips; the two faces do not, because a wheel face meets its rim at a right angle and
   should look it. */
function _r3Wheel(out, x, y, z, r, thick, axis, col, faceCol, seg) {
  seg = _r3Seg(seg);
  var alongX = (axis === 'x'), h = thick / 2, i, a, b;
  var A = [], B = [], ring = [];
  for (i = 0; i < seg; i++) {
    a = (i / seg) * Math.PI * 2;
    var ca = Math.cos(a), sa = Math.sin(a);
    ring.push(alongX ? [0, sa, ca] : [ca, sa, 0]);
    A.push(alongX ? [x - h, y + sa * r, z + ca * r] : [x + ca * r, y + sa * r, z - h]);
    B.push(alongX ? [x + h, y + sa * r, z + ca * r] : [x + ca * r, y + sa * r, z + h]);
  }
  for (i = 0; i < seg; i++) {
    b = (i + 1) % seg;
    var na = ring[i], nb = ring[b];
    _r3F(out, [A[i], A[b], B[b], B[i]], col, [na, nb, nb, na]);
  }
  /* the two faces, wound opposite ways so both point outward */
  _r3F(out, A.slice().reverse(), faceCol || col);
  _r3F(out, B.slice(), faceCol || col);
}

/* THE SAME BOX, ROUNDED RATHER THAN CUT, for the 3D view - see _R3_DETAIL above.

   A flat chamfer turns each edge into one extra plane, and one plane holds one tone: it reads
   as a bevel, which is what it is. A rounded edge is a quarter-cylinder carrying a normal per
   corner, so the highlight MOVES along it as the model turns, and that is the difference
   between a shape that looks machined and a shape that looks moulded. It is also what a
   sixteen-fold rise in triangles actually buys - the segments are spent on curvature the
   shading can use, not on subdividing flat faces, which no amount of would change a pixel.

   Built from one horizontal outline swept upward. The outline is the box's own footprint with
   its four corners replaced by quarter-arcs of radius b, carried as a point plus its outward
   normal; the sweep then walks that outline up the wall and over the top rounding, insetting
   by b(1-cos) and lifting by b·sin. Extents are exact at every segment count, which is the
   property everything from the sprite footprint to the tile alignment depends on.

   THE BOTTOM IS NEITHER ROUNDED NOR DRAWN, as before: the camera is 49 degrees off vertical
   and never sees under anything. */
function _r3RoundBox(out, x0, x1, y0, y1, z0, z1, b, col, topCol) {
  var S = Math.max(2, Math.round(_R3_DETAIL));
  var cx = [x1 - b, x0 + b, x0 + b, x1 - b];      /* corner arc centres, counter-clockwise */
  var cz = [z1 - b, z1 - b, z0 + b, z0 + b];      /* from the +x/+z corner */
  var a0 = [0, Math.PI / 2, Math.PI, Math.PI * 1.5];
  var px = [], pz = [], nx = [], nz = [], i, j, k;
  for (i = 0; i < 4; i++) {
    for (j = 0; j <= S; j++) {
      /* EVERY POINT OF EVERY ARC IS KEPT, and none of them coincide. The first draft dropped
         each arc's final point on the theory that it was shared with the next arc's first -
         it is not: arc 0 ends at (x1-b, z1) and arc 1 begins at (x0+b, z1), which are the two
         ENDS of the +z wall. Dropping one merged that wall with the last segment of the corner
         into a single quad, so every corner came out flattened by one segment and the normals
         across it were an average of two directions that are not adjacent. */
      var a = a0[i] + (j / S) * (Math.PI / 2);
      var ca = Math.cos(a), sa = Math.sin(a);
      px.push(cx[i] + ca * b); pz.push(cz[i] + sa * b);
      nx.push(ca); nz.push(sa);
    }
  }
  var N = px.length, yw = y1 - b;

  /* the walls, straight from the ground to where the top rounding begins */
  for (i = 0; i < N; i++) {
    j = (i + 1) % N;
    var na = [nx[i], 0, nz[i]], nb = [nx[j], 0, nz[j]];
    _r3F(out, [[px[j], y0, pz[j]], [px[i], y0, pz[i]], [px[i], yw, pz[i]], [px[j], yw, pz[j]]],
         col, [nb, na, na, nb]);
  }

  /* the top rounding, ring by ring, and the cap it closes on */
  var ring = [], norm = [], prev = null, prevN = null;
  for (k = 0; k <= S; k++) {
    var ph = (k / S) * (Math.PI / 2), cp = Math.cos(ph), sp = Math.sin(ph);
    ring = []; norm = [];
    for (i = 0; i < N; i++) {
      ring.push([px[i] - nx[i] * b * (1 - cp), yw + b * sp, pz[i] - nz[i] * b * (1 - cp)]);
      norm.push([nx[i] * cp, sp, nz[i] * cp]);
    }
    if (prev) {
      for (i = 0; i < N; i++) {
        j = (i + 1) % N;
        _r3F(out, [prev[j], prev[i], ring[i], ring[j]], col,
             [prevN[j], prevN[i], norm[i], norm[j]]);
      }
    }
    prev = ring; prevN = norm;
  }
  _r3F(out, ring, topCol || col);
}
