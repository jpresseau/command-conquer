/* r3d/tuft.js - a clump of grass, as blades. Part of the r3d model kit.

   The grass tuft was _r3Cone: five sides, a point, a dark green, a little under a unit tall.
   On a map that also grows conifers, that is a conifer. From the game's camera a lawn came out
   as a nursery of pine saplings, three to a cell, and nothing about them said "grass".

   Grass is BLADES: thin, pointed, leaning out from the clump in every direction, with light
   passing between them. So a tuft is a ring of single triangles, each a blade rising from a
   narrow base to a point, leaning away from the clump's centre, in two greens. A blade is one
   triangle where a cone side was two, so the clump costs LESS than the cone it replaces while
   carrying more shape.

   ONE TRIANGLE IS SEEN FROM BOTH SIDES AND LIT FROM ONE. This renderer does not cull, so a
   blade shows from behind - but its flat normal points one way, and every blade facing away
   from the sun would draw as a black sliver. Each corner therefore carries a normal tilted up
   from the blade's own facing, the standard trick for grass: the clump lights like the ground
   it grows from, with a little shading across it from the lean. The unit test holds the tilt.

   EVERY CORNER IS ITS OWN ARRAY, for the reason crystal.js gives: _r3dLiftFrom lifts the cell
   in place, and a shared vertex goes up twice. */

var R3_TUFT_BLADES = 7;
var R3_TUFT_UP = 0.8;          /* how far a blade's normal is turned toward straight up */

/* A tuft at (x, y, z), `h` tall, in cols = [blade, blade2]. `seed` makes it repeatable. */
function _r3Tuft(out, x, y, z, h, cols, seed) {
  seed = seed | 0;
  var n = R3_TUFT_BLADES, a0 = _sprHash(seed, 0, 811) * Math.PI * 2;
  for (var i = 0; i < n; i++) {
    var a = a0 + (i + (_sprHash(seed, i, 821) - 0.5) * 0.6) / n * Math.PI * 2;
    var ca = Math.cos(a), sa = Math.sin(a);
    var bh = h * (0.55 + _sprHash(seed, i, 823) * 0.6);
    var lean = bh * (0.25 + _sprHash(seed, i, 827) * 0.45);
    var r = 0.05 + _sprHash(seed, i, 829) * 0.1;          /* where the blade leaves the clump */
    var w = 0.08 + _sprHash(seed, i, 839) * 0.06;         /* half its width at the base */
    var bx = x + ca * r, bz = z + sa * r;
    /* the base runs ACROSS the lean, so the blade presents its face to the way it leans */
    var p = [bx - sa * w, y, bz + ca * w], q = [bx + sa * w, y, bz - ca * w];
    var t = [bx + ca * lean, y + bh, bz + sa * lean];
    /* its facing, tilted up: the outward lean direction, blended toward +y */
    var nx = ca * (1 - R3_TUFT_UP), nz = sa * (1 - R3_TUFT_UP);
    var nn = [nx, R3_TUFT_UP, nz];
    _r3F(out, [p, q, t], cols[i & 1], [nn.slice(), nn.slice(), nn.slice()]);
  }
}
