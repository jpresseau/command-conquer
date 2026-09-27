/* r3d/crystal.js - the ore field's crystals, as geometry. Part of the r3d model kit.

   WHY A PRIMITIVE OF ITS OWN. The field used to stand on _r3Cone: seven sides, a point on
   top, and one normal PER CORNER, which is what a cone is for - the fragment stage
   interpolates them into a smooth curve. That is exactly wrong for a mineral. A field of
   five hundred smooth tan cones read as wheat stubble, or as a car park of traffic cones,
   and never once as ore: what makes a crystal read is the FACET, a flat plane that is
   bright on one side of an edge and dark on the other.

   So a crystal here is a prism with a pyramid on it, flat-shaded (no `n` on any face, so
   _r3dBuildMesh gives each face its own normal), leaning off vertical, with its ring of
   corners jittered so no two facets are the same width. The sides alternate between two
   palette tones and the tip takes the light one, which keeps the facets distinct even
   where the light alone would not.

   EVERY CORNER IS ITS OWN ARRAY. _r3dLiftFrom stands a cell on its terrain by adding the
   elevation to every vertex of every face in place; a vertex array shared by two faces is
   lifted twice. _r3Cone gets away with sharing only because it never emits the cap that
   would share them. The unit test holds this. */

/* The pieces, in one place.
     SIDES      six, as a quartz prism has. Five read as a pencil, eight as a drum.
     TAPER      the shoulder ring as a fraction of the base ring. Uniform about the axis, so
                each side stays a planar trapezoid - _r3dBuildMesh takes one normal from the
                first three corners and a warped quad would light as a fold.
     JITTER     how far a corner's radius and angle wander, as fractions. */
var R3_CRYSTAL_SIDES = 6;
var R3_CRYSTAL_TAPER = 0.9;
var R3_CRYSTAL_JITTER_R = 0.35;
var R3_CRYSTAL_JITTER_A = 0.28;

/* A crystal standing at (x, y, z), `h` long, `r` across, its axis leaning (lx, 1, lz).
   cols = [side, side2, tip]. `tip` is the pyramid's share of the length. `seed` makes
   the corners' wander repeatable, so a rebuild of an unchanged cell is the same cell.

   THE BASE IS SUNK. A crystal that leans lifts one side of its base ring off the ground by
   r times the sine of its lean, and it floats. The whole ring goes down by that much, so
   the high side meets the ground and the low side is buried, which is how a crystal grows
   out of rock. */
function _r3Crystal(out, x, y, z, r, h, lx, lz, cols, n, tip, seed) {
  n = Math.max(3, (n || R3_CRYSTAL_SIDES) | 0);
  tip = Math.min(0.9, Math.max(0.05, tip || 0.3));
  seed = seed | 0;
  var dl = Math.hypot(lx, 1, lz), dx = lx / dl, dy = 1 / dl, dz = lz / dl;
  /* a basis around the axis: u = d x Z, w = u x d. With d straight up that is (1,0,0) and
     (0,0,1), the same handedness _r3Cone walks its ring in, so the faces below wind the
     way the cone's do and their normals point out. */
  var ul = Math.hypot(dy, dx), ux = dy / ul, uy = -dx / ul;
  var wx = uy * dz, wy = -ux * dz, wz = ux * dy - uy * dx;
  var sink = r * (1 + R3_CRYSTAL_JITTER_R) * Math.hypot(dx, dz) + 0.02;
  var bx = x, by = y - sink, bz = z;
  var sl = h * (1 - tip);                                   /* shoulder, along the axis */
  var ring = [], i;
  for (i = 0; i < n; i++) {
    var a = (i + (_sprHash(seed, i, 601) - 0.5) * R3_CRYSTAL_JITTER_A) / n * Math.PI * 2;
    var ri = r * (1 + (_sprHash(seed, i, 607) - 0.5) * 2 * R3_CRYSTAL_JITTER_R);
    var c = Math.cos(a) * ri, s = Math.sin(a) * ri;
    ring.push([c * ux + s * wx, c * uy + s * wy, s * wz]);
  }
  function B(o) { return [bx + o[0], by + o[1], bz + o[2]]; }
  function S(o) {
    return [bx + dx * sl + o[0] * R3_CRYSTAL_TAPER, by + dy * sl + o[1] * R3_CRYSTAL_TAPER,
            bz + dz * sl + o[2] * R3_CRYSTAL_TAPER];
  }
  function A() { return [bx + dx * h, by + dy * h, bz + dz * h]; }
  for (i = 0; i < n; i++) {
    var p = ring[i], q = ring[(i + 1) % n];
    _r3F(out, [B(q), B(p), S(p), S(q)], cols[i & 1]);
    _r3F(out, [S(q), S(p), A()], cols[2]);
  }
}

/* ONE CELL OF A FIELD: a cluster, not a scatter. Crystals grow from a seam, so each cell
   carries one or two clusters - a tall central crystal and a ring of shorter ones leaning
   OUT from it - and a few squat shards lying almost flat between them, which is the rubble
   a harvester leaves. Emitted at (cx, 0, cz); the caller stands the cell on its terrain.

   `frac` is what is left of the cell, 0..1. It scales height and not girth, so a worked
   field is a field of stumps rather than of smaller crystals, and a fresh one stands tall.

   GEMS ARE A DIFFERENT MINERAL, and have to read as one from the shape as well as the
   colour: slender and sharp against gold's stubby, blunt habit. The colour test in
   e2e/ore3d measures the palette; this is the part a colour-blind player can see.

   Everything stays inside the cell, give or take the lean, so a chunk's cull box built
   from its cells holds its crystals. */
function _r3OreCell(out, cx, cz, tx, tz, frac, gem, P) {
  var T = RTS_TILE, grow = 0.35 + 0.65 * Math.max(0, Math.min(1, frac));
  var nc = _sprHash(tx, tz, 613) < 0.5 ? 2 : 1;
  for (var k = 0; k < nc; k++) {
    var sd = (tx * 131 + tz) * 7 + k;
    var ox = cx + (_sprHash(sd, 1, 617) - 0.5) * T * (nc > 1 ? 0.62 : 0.3);
    var oz = cz + (_sprHash(sd, 2, 619) - 0.5) * T * (nc > 1 ? 0.62 : 0.3);
    var big = (nc > 1 ? 0.78 : 1) * (0.8 + _sprHash(sd, 3, 631) * 0.45);
    /* the central crystal, near upright */
    var r0 = (gem ? 0.22 : 0.34) * big, h0 = (gem ? 2.6 : 1.7) * big * grow;
    _r3Crystal(out, ox, 0, oz, r0, h0,
               (_sprHash(sd, 4, 641) - 0.5) * 0.3, (_sprHash(sd, 5, 643) - 0.5) * 0.3,
               [P[1], P[0], P[2]], R3_CRYSTAL_SIDES, gem ? 0.38 : 0.26, sd * 13);
    /* its satellites, leaning out from it */
    var ns = 3 + (_sprHash(sd, 6, 647) * 3 | 0), a0 = _sprHash(sd, 7, 653) * Math.PI * 2;
    for (var j = 0; j < ns; j++) {
      var a = a0 + (j + (_sprHash(sd, j, 659) - 0.5) * 0.5) / ns * Math.PI * 2;
      var ca = Math.cos(a), sa = Math.sin(a);
      var d = r0 * (1.2 + _sprHash(sd, j, 661) * 1.3);
      var lean = 0.35 + _sprHash(sd, j, 673) * 0.55;
      var sz = 0.45 + _sprHash(sd, j, 677) * 0.4;
      _r3Crystal(out, ox + ca * d, 0, oz + sa * d, r0 * (0.55 + sz * 0.45), h0 * sz,
                 ca * lean, sa * lean,
                 [j & 1 ? P[0] : P[1], P[4], P[2]], R3_CRYSTAL_SIDES - (j & 1),
                 gem ? 0.4 : 0.3, sd * 13 + j + 1);
    }
  }
  /* the rubble: squat, five-sided, lying nearly flat in the dark tones */
  var nr = 2 + (_sprHash(tx, tz, 683) * 2 | 0);
  for (var m = 0; m < nr; m++) {
    var ra = _sprHash(tx * 17 + m, tz, 691) * Math.PI * 2;
    _r3Crystal(out, cx + (_sprHash(tx * 17 + m, tz, 701) - 0.5) * T * 0.8, 0,
               cz + (_sprHash(tz * 17 + m, tx, 709) - 0.5) * T * 0.8,
               0.16 + _sprHash(tx, tz * 17 + m, 719) * 0.1, (0.4 + 0.3 * grow) * 0.7,
               Math.cos(ra) * 1.6, Math.sin(ra) * 1.6,
               [P[3], P[4], P[0]], 5, 0.4, (tx * 977 + tz) * 5 + m);
  }
}
