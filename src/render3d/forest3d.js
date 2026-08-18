/* render3d/forest3d.js - the trees, and only the trees. Part of rts.render3d.

   Split out of world3d.js, which was near this project's per-file limit before any of this
   existed. The rest of that file walks the terrain grid and batches chunks; this is the shape
   of one tree, which is a different concern and now a much longer one.

   WHY THE FOREST IS WORTH ITS OWN FILE. Measured on seed 4242 with the real builder, the map
   was 1,049,608 static triangles and the forest was 773,848 of them - 74% of the entire world,
   spread over 7,639 trees at 101 triangles each. Screenshot the densest wood at max zoom and
   what 74% of the budget bought was a field of smooth green spikes: identical, axially
   symmetric, no trunk visible anywhere, and - the part that actually stung - the three or four
   stacked _r3Cone tiers were INVISIBLE. Each cone's base sat inside the flare of the one below
   it, so seventy-odd triangles of tier structure per tree resolved to one smooth cone. The
   forest was paying for detail it was not drawing.

   THE TRADE THIS FILE MAKES: fewer trees, each worth looking at. Trees per forest cell go from
   2.50 to 1.57 and a tree from 101 triangles to 175, which lands the same map at 1,049,100
   against 1,049,608 - flat to within a rounding error, and measured rather than reasoned about
   (e2e/canopy prints all three numbers). The freed density is half the point on its own: at
   2-3 trees a cell a wood was a solid wall of canopy with no ground and no trunk anywhere in
   it, and the tilted camera's whole reason for existing is seeing INTO the edge of a forest.

   The last 60k of it came from world3d.js's grass tufts, which were a quarter of the entire
   world's geometry at four a cell. See the note over R3D_TUFTS_PER_CELL there.

   FOUR THINGS MAKE A TREE READ, AND NONE OF THEM IS SEGMENT COUNT:

   - A RAGGED SILHOUETTE. _r3Cone emits one radius for the whole ring, so its outline is a
     perfect circle from above and two straight lines from the side, and no amount of sides
     fixes that - a 64-sided cone is still a cone. Every canopy ring here jitters its radius
     per segment, which costs nothing at all: the same triangles, at different radii.
   - WHORLS THAT OVERHANG. A conifer tier attaches to the trunk and falls outward and DOWN,
     ending below the attachment of the tier beneath it. That overlap is what separates the
     layers into distinct lit and shaded bands; the old stacked cones met base-to-base and
     shaded as one surface.
   - A VISIBLE TRUNK. The old canopy started at 18% of the tree's height and the trunk was
     buried from the first tier up. Here the lowest whorl's tips stop a tenth to a fifth of the
     way up and the whorls above are scalloped, so a wood has bare stems under it and light
     between them.
   - MORE THAN ONE SILHOUETTE. Two species, not one: a whorled conifer and a broadleaf with a
     bare stem, three limbs and a lumpy crown. Ten thousand copies of one outline is what makes
     a forest read as texture, and that is a fault no triangle budget can buy its way out of.

   SEGMENT COUNTS ARE SPENT WHERE ROUNDNESS SHOWS. Canopy rings get 16 sides, because the
   canopy is the round thing the player looks at and a coarse ring reads as a faceted lampshade
   under the tight specular. Trunks get 8 and the apex spire 10 - a stem two art-pixels wide
   cannot show more, and this is a batch of thousands, not a baked structure where sides are
   free. That is the same reasoning the rock crags are seven-sided for.

   EVERYTHING IS HASH-PLACED, INCLUDING THE JITTER, and every hash takes both cell coordinates,
   the tree's index within the cell AND the ring and segment index - see the note at the top of
   world3d.js for what separable hashing did to the last scatter. Segment index goes in the
   SALT rather than being folded into a coordinate, and the two salt ranges here (457+i and
   601+i) are disjoint, so a segment's radius jitter and its droop jitter are independent. */

var R3D_TREE_SEG = 16;         /* sides on a canopy ring - the round thing that is looked at */
var R3D_TRUNK_SEG = 8;         /* and on a stem, which at any zoom is a few pixels wide */

/* Bark, needles and leaves. Six needle tones rather than the two the old tree alternated
   between, for the same reason the rock got six greys: a wood built from one hue is a
   silhouette with nothing inside it. Tiers alternate within a tree so the whorls separate, and
   the tree's own base index shifts the whole palette so neighbours differ as well.

   The leaves are deliberately WARMER and lighter than the needles and still clearly darker and
   more saturated than the grass underneath - the canopy tones that sit within a few points of
   the ground are the ones that make a forest vanish into texture. */
var R3D_BARK = ['#4e3d29', '#5a4630', '#453520', '#63503a'];
var R3D_NEEDLE = ['#2f4a24', '#3d5b2e', '#456936', '#35512c', '#4a7040', '#2a4422'];
var R3D_LEAF = ['#46652e', '#527437', '#3c5726', '#5b7d3f', '#354d21'];

/* A TAPERED TUBE BETWEEN TWO ARBITRARY POINTS - a limb that actually reaches somewhere.

   Every other primitive in this renderer is upright: _r3Cyl and _r3Cone stand on y, _r3Box and
   _r3dSlab are axis-aligned or yawed about y. A branch is none of those, and a tree built only
   from upright parts is a stack of hats however good each hat is - the off-axis element is
   most of what says "grown" rather than "assembled".

   The ring basis is built from the axis by two cross products, with the reference vector
   swapped when the limb is close to vertical, because crossing y with y is zero and the whole
   ring would collapse to a line. Normals are the ring directions themselves, which is right
   for a near-cylinder and is what keeps a limb from lighting as flat strips. */
function _r3dLimb(out, x0, y0, z0, x1, y1, z1, r0, r1, seg, col) {
  var ax = x1 - x0, ay = y1 - y0, az = z1 - z0;
  var L = Math.hypot(ax, ay, az) || 1;
  ax /= L; ay /= L; az /= L;
  var rx = 0, ry = 1, rz = 0;
  if (Math.abs(ay) > 0.9) { rx = 1; ry = 0; }
  var ux = ry * az - rz * ay, uy = rz * ax - rx * az, uz = rx * ay - ry * ax;
  var ul = Math.hypot(ux, uy, uz) || 1; ux /= ul; uy /= ul; uz /= ul;
  var vx = ay * uz - az * uy, vy = az * ux - ax * uz, vz = ax * uy - ay * ux;
  var ring = [], i;
  for (i = 0; i < seg; i++) {
    var t = (i / seg) * Math.PI * 2, C = Math.cos(t), S = Math.sin(t);
    ring.push([ux * C + vx * S, uy * C + vy * S, uz * C + vz * S]);
  }
  for (i = 0; i < seg; i++) {
    var nA = ring[i], nB = ring[(i + 1) % seg];
    /* B before A, as _r3Cyl winds its sides - the other order points every normal into the
       limb and backface culling then shows the inside of its far wall */
    _r3F(out, [[x0 + nB[0] * r0, y0 + nB[1] * r0, z0 + nB[2] * r0],
               [x0 + nA[0] * r0, y0 + nA[1] * r0, z0 + nA[2] * r0],
               [x1 + nA[0] * r1, y1 + nA[1] * r1, z1 + nA[2] * r1],
               [x1 + nB[0] * r1, y1 + nB[1] * r1, z1 + nB[2] * r1]], col, [nB, nA, nA, nB]);
  }
}

/* ONE WHORL OF A CONIFER: a skirt that leaves the trunk at `y` with radius `rIn` and falls
   OUTWARD AND DOWN to `rOut`, hanging `drop` below the attachment - with both the radius and
   the drop jittered per segment.

   This is the same triangle count as the _r3Cone tier it replaces (16 quads) and it is a
   different object for two reasons. The cone's ring is one radius, so its outline is a circle;
   this one's is ragged. And the cone's base was its widest point at its LOWEST point, which
   put it flush against the top of the tier below - two cones meeting rim to rim shade as one
   continuous surface. A skirt that overhangs the tier under it casts its own edge across it,
   which is what makes a conifer read as layers instead of as a smooth spike.

   Only the outer surface is emitted. Under this camera the underside of a whorl is never
   toward the viewer, and the tier below fills the annulus a viewer could otherwise see through.

   The ring is carried as RADII, and the points are built inside the face loop, for the reason
   spelled out over _r3dCrown: two adjacent quads share an edge, so a ring of point arrays gets
   every one of its points into two faces, and _r3dLiftFrom adds the cell's elevation once per
   face it can reach a vertex through. Relief runs to five world units on a tree five to nine
   tall, so that is not a rounding error - it is a whorl hanging in the air above its own tree,
   on high ground only, which is the sort of thing that ships. Normals ARE shared, and safely:
   the lift touches positions and nothing else, and _r3Cyl shares its ring the same way. */
function _r3dSkirt(out, x, y, z, rIn, rOut, drop, col, tx, tz, tn, ti) {
  var seg = R3D_TREE_SEG, i, rad = [], dip = [], nrm = [], cs = [], sn = [];
  var a = tx * 31 + tn, b = tz * 31 + tn, c = a * 7 + ti, d = b * 7 + ti;
  for (i = 0; i < seg; i++) {
    var t = (i / seg) * Math.PI * 2, C = Math.cos(t), S = Math.sin(t);
    /* ALTERNATING, then jittered. Pure per-segment noise gives a finely serrated circle,
       which at any real zoom is still a circle; pulling every other segment in AND up by a
       third turns the ring into an eight-armed star whose arms hang lower than the gaps
       between them. That is what a whorl of branches looks like from above and from the side,
       and it costs the same sixteen quads either way. */
    var lo = (i & 1) ? 1 : 0.62;
    var rr = rOut * lo * (0.82 + _sprHash(c, d, 457 + i) * 0.34);
    var dd = drop * lo * (0.78 + _sprHash(d, c, 601 + i) * 0.42);
    cs.push(C); sn.push(S); rad.push(rr); dip.push(dd);
    /* the slant's own normal, as _r3Cone builds it: radial scaled by the drop, tilted out by
       how fast the radius grows on the way down */
    nrm.push(_r3Norm([C * dd, rr - rIn, S * dd]));
  }
  for (i = 0; i < seg; i++) {
    var j = (i + 1) % seg;
    _r3F(out, [[x + cs[j] * rad[j], y - dip[j], z + sn[j] * rad[j]],
               [x + cs[i] * rad[i], y - dip[i], z + sn[i] * rad[i]],
               [x + cs[i] * rIn, y, z + sn[i] * rIn],
               [x + cs[j] * rIn, y, z + sn[j] * rIn]],
         col, [nrm[j], nrm[i], nrm[i], nrm[j]]);
  }
}

/* THE BROADLEAF'S CROWN: a lathe of jittered rings, closed at both ends.

   A sphere would be wrong twice over - too regular, and too obviously a primitive - so the
   profile is squat and off-centre (widest above the middle, tucked in sharply at the top, and
   narrower at the bottom than in the middle) and every ring carries the same per-segment
   radius jitter the whorls do. What comes out is a lumpy mass rather than a ball.

   CLOSED AT THE BOTTOM, unlike the whorls. A whorl has the next tier under it; a crown has
   nothing but air, and an open one is a bag whose far inside wall faces away from the viewer
   and is therefore culled - the tree would have a hole through it wherever the underside came
   into view over a rise.

   EVERY FACE GETS ITS OWN COPY OF EVERY VERTEX, and that is not an oversight to be tidied up.
   A lathe naturally wants to share a ring point between the band below it and the band above,
   and the apex between all sixteen fan triangles - and _r3dLiftFrom, which stands a cell's
   geometry on the terrain, walks the faces and adds the cell's elevation to each vertex it
   finds. A vertex reachable from four faces is therefore lifted four times, and an apex shared
   by sixteen is lifted sixteen. It fails exactly as loudly as that sounds: the first cut of
   this crown grew green spires several map-heights tall out of every broadleaf on the map.
   Every other primitive in this renderer emits fresh arrays per face - _r3Cyl and _r3Cone
   included - and that is the invariant the lift relies on, so this one does too.

   TWO PROFILES, because one is a species and two is a wood. The spreading one is widest just
   over half way up and tucks in hard at the top; the upright one carries its width higher and
   is nearly as tall as it is wide. Both cost the same four rings. */
var R3D_CROWN = [[[0.00, 0.40], [0.30, 0.92], [0.62, 1.00], [0.86, 0.64]],
                 [[0.00, 0.52], [0.34, 0.86], [0.68, 0.96], [0.90, 0.58]]];

function _r3dCrown(out, x, y, z, R, H, col, tx, tz, tn, ci) {
  var P = R3D_CROWN[ci], seg = R3D_TREE_SEG, nr = P.length, i, ri;
  var a = tx * 31 + tn, b = tz * 31 + tn;
  var rad = [], cs = [], sn = [];
  for (i = 0; i < seg; i++) {
    var t = (i / seg) * Math.PI * 2;
    cs.push(Math.cos(t)); sn.push(Math.sin(t));
  }
  for (ri = 0; ri < nr; ri++) {
    var rb = R * P[ri][1], row = [];
    for (i = 0; i < seg; i++) {
      row.push(rb * (0.68 + _sprHash(a * 7 + ri, b * 7 + ri, 457 + i) * 0.54));
    }
    rad.push(row);
  }
  function pt(ri2, i2) {
    return [x + cs[i2] * rad[ri2][i2], y + H * P[ri2][0], z + sn[i2] * rad[ri2][i2]];
  }
  /* the bands, wound like a cylinder's sides. The normal is the outward direction from the
     crown's own middle, which for a mass this lumpy is close enough to the surface normal and
     is what keeps it shading as one round body rather than as a stack of rings. */
  function nrm(ri2, i2) {
    return _r3Norm([cs[i2] * rad[ri2][i2], (P[ri2][0] - 0.5) * H, sn[i2] * rad[ri2][i2]]);
  }
  for (ri = 0; ri < nr - 1; ri++) {
    for (i = 0; i < seg; i++) {
      var j2 = (i + 1) % seg;
      var nA = nrm(ri, i), nB = nrm(ri, j2);
      _r3F(out, [pt(ri, j2), pt(ri, i), pt(ri + 1, i), pt(ri + 1, j2)], col, [nB, nA, nA, nB]);
    }
  }
  /* apex and floor: fans to a point, flat-shaded, which is what a tuft of leaves at the top of
     a tree looks like anyway */
  for (i = 0; i < seg; i++) {
    var j3 = (i + 1) % seg;
    _r3F(out, [pt(nr - 1, i), [x, y + H, z], pt(nr - 1, j3)], col);
    _r3F(out, [pt(0, j3), [x, y - H * 0.14, z], pt(0, i)], col);
  }
}

/* A CONIFER. Height 5-9.2 world units - a cell and a bit to two and a bit, which is the
   reference's tree-to-tank proportion and is unchanged from the version this replaces.

   THE LAYOUT IS DRIVEN FROM THE TIPS, NOT FROM THE ATTACHMENTS, which is the difference
   between three whorls and one smooth cone. Whorl i attaches `drop` above where its tips end,
   and `drop` is 1.7 times the spacing between attachments - so every whorl's tips hang seven
   tenths of a spacing BELOW the attachment of the whorl beneath it, and each one throws its
   own shaded edge across the one under it. Deriving the tips from the attachments instead is
   what put the lowest whorl's fringe underground on short trees the first time round, and
   dropping to a flush 1.0 puts the smooth cone straight back.

   WHORL COUNT COMES OFF THE HEIGHT, NOT OFF A HASH OF ITS OWN. Five tiers on a five-unit tree
   are half a unit apart, which is smaller than the jitter on their own edges - they cannot
   separate at any zoom this game has, and the triangles are spent drawing a cone again. The
   same five on a nine-unit tree are a unit apart and read. So a short tree gets three and a
   tall one gets five, which is both where the detail is affordable and what a tree does. */
function _r3dConifer(out, x, z, tx, tz, tn, h1, h2, h3) {
  var th = 5 + h1 * 4.2;
  var R = 1.3 + h2 * 0.9;
  var n = th > 7.6 ? 5 : (th > 6.2 ? 4 : 3);
  var tr = 0.20 + h2 * 0.14;
  var ci = ((h3 * 89) | 0) % 3;
  var tipY = th * (0.15 + h3 * 0.09);      /* where the lowest branches end - clear trunk below */
  var topY = th * 0.74;                    /* where the highest whorl attaches */
  var step = (topY - tipY) / (n + 0.7), drop = step * 1.7;
  /* the trunk runs the whole way up behind the canopy: a cylinder costs the same however tall
     it is, and a short one shows daylight through the gaps between whorls */
  _r3Cyl(out, x, 0, z, tr, topY, R3D_BARK[((h2 * 97) | 0) & 3], R3D_BARK[2], R3D_TRUNK_SEG);
  for (var i = 0; i < n; i++) {
    _r3dSkirt(out, x, tipY + drop + step * i, z, tr * 1.6, R * (1 - (i / n) * 0.66),
              drop, R3D_NEEDLE[(ci * 2 + (i & 1)) % 6], tx, tz, tn, i);
  }
  _r3Cone(out, x, topY, z, R * 0.34, 0.02, th - topY, R3D_NEEDLE[(ci * 2) % 6], 10);
}

/* A BROADLEAF, and the reason there are two species at all: it is a different SILHOUETTE, not
   a differently-coloured conifer. Nearly half its height is bare stem, three limbs reach out
   of the top of that stem into the crown, and the crown is a lumpy mass rather than a spire.

   The limbs are the one part that is pure profile: they are inside the crown for most of their
   length and only the elbow shows. That elbow is what stops the crown reading as a ball
   balanced on a pole. */
function _r3dBroadleaf(out, x, z, tx, tz, tn, h1, h2, h3) {
  var th = 5.2 + h1 * 3.6;
  var R = 1.35 + h2 * 0.8;
  var trunkH = th * (0.36 + h3 * 0.12);
  var tr = 0.22 + h2 * 0.16;
  var bark = R3D_BARK[((h1 * 97) | 0) & 3];
  /* all five leaf tones, not every other one: `% 3` here indexed 0, 2 and 4 and quietly threw
     away the two lightest of them, which are the ones that separate a broadleaf from the
     needles beside it */
  var li = ((h3 * 83) | 0) % 5;
  _r3Cyl(out, x, 0, z, tr, trunkH, bark, R3D_BARK[2], R3D_TRUNK_SEG);
  for (var b = 0; b < 3; b++) {
    var ang = (b / 3) * Math.PI * 2 + _sprHash(tx * 31 + tn, tz * 31 + b, 467) * 2.1;
    var reach = R * (0.55 + _sprHash(tz * 31 + tn, tx * 31 + b, 479) * 0.45);
    _r3dLimb(out, x, trunkH * 0.72, z,
             x + Math.cos(ang) * reach, trunkH + th * 0.16, z + Math.sin(ang) * reach,
             tr * 0.72, tr * 0.34, 5, bark);
  }
  _r3dCrown(out, x, trunkH * 0.9, z, R, th - trunkH * 0.9,
            R3D_LEAF[li], tx, tz, tn, h2 > 0.5 ? 1 : 0);
}

/* ONE TREE. Roughly one in four is a broadleaf: the generator lays down conifer GROVES (see
   _rtsGenTerrain), so the conifer has to stay the character of a wood - a half-and-half mix
   read as parkland rather than as the forest the map is describing.

   The three shape hashes are drawn here rather than passed in, because the tree now needs its
   cell and its index within the cell anyway - for the per-segment jitter - and threading five
   arguments where three of them are derivable from the other two is how the last set of
   separable hashes got in. */
function _r3dTree(out, x, z, tx, tz, tn) {
  var h1 = _sprHash(tx * 31 + tn, tz, 419);
  var h2 = _sprHash(tz * 31 + tn, tx, 421);
  var h3 = _sprHash(tx * 31 + tn, tz * 31 + tn, 431);
  if (_sprHash(tz * 31 + tn, tx * 31 + tn, 439) > 0.74) {
    _r3dBroadleaf(out, x, z, tx, tz, tn, h1, h2, h3);
  } else {
    _r3dConifer(out, x, z, tx, tz, tn, h1, h2, h3);
  }
}
