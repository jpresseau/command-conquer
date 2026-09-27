/* The grass tuft - src/r3d/tuft.js.

   It was _r3Cone: five sides and a point, dark green, under a unit tall. On a map that also
   grows conifers that is a conifer, and a lawn came out as a nursery of pine saplings. Grass is
   blades, so a tuft is a ring of single leaning triangles. Each claim below is a way to undo it:
   stand the blades up straight and it is a fence post; let a blade's normal face sideways and
   half the clump draws black from behind; share a corner and lifting the cell tears it. */

var { Suite } = require('../lib/assert.js');
var { load } = require('../lib/sandbox.js');

var S = new Suite('tuft');
var g = load(['src/rules', 'src/r3d', 'src/sprites']);

var COLS = ['#4e6b3a', '#6a8a4a'];

(function () {
  var out = [];
  g._r3Tuft(out, 3, 0, -2, 1, COLS, 41);
  S.eq('a tuft is a ring of blades', out.length, g.R3_TUFT_BLADES);
  S.ok('...each a single triangle, so the clump costs less than the ten-triangle cone it replaced',
       out.every(function (f) { return f.v.length === 3; }), out.length + ' triangles');

  /* every blade rises from the ground to a point above it */
  var grounded = out.every(function (f) { return f.v[0][1] === 0 && f.v[1][1] === 0 && f.v[2][1] > 0.4; });
  S.ok('every blade stands on the ground and rises to a point', grounded, '');

  /* AND LEANS OUT, away from the clump - an upright blade ring is a fence post */
  var out2 = 0, lean = 0;
  out.forEach(function (f) {
    var bx = (f.v[0][0] + f.v[1][0]) / 2 - 3, bz = (f.v[0][2] + f.v[1][2]) / 2 + 2;
    var tx = f.v[2][0] - 3 - bx, tz = f.v[2][2] + 2 - bz;
    if (tx * bx + tz * bz > 0) out2++;
    lean += Math.hypot(tx, tz) / f.v[2][1];
  });
  S.eq('every blade leans away from the clump\'s centre', out2, out.length);
  S.ok('...visibly', lean / out.length > 0.25, 'mean lean ' + (lean / out.length).toFixed(2) + ' across per unit up');

  /* LIT LIKE THE GROUND. No culling, one flat normal: every blade facing away from the sun would
     draw black. So each corner's normal is turned most of the way up. */
  var minUp = 1;
  out.forEach(function (f) {
    (f.n || []).forEach(function (n) { minUp = Math.min(minUp, n[1] / Math.hypot(n[0], n[1], n[2])); });
  });
  S.ok('every blade carries per-corner normals', out.every(function (f) { return f.n && f.n.length === 3; }), '');
  S.ok('...turned toward the sky, so no blade draws black from behind', minUp > 0.7,
       'least upward normal ' + minUp.toFixed(2));

  var seen = new Set(), shared = 0;
  out.forEach(function (f) {
    f.v.forEach(function (p) { if (seen.has(p)) shared++; seen.add(p); });
  });
  S.eq('no corner array is shared, so lifting a cell cannot tear one', shared, 0);

  var cols = {};
  out.forEach(function (f) { cols[f.c.join(',')] = 1; });
  S.eq('two greens, so a clump is not one flat colour', Object.keys(cols).length, 2);

  var again = [];
  g._r3Tuft(again, 3, 0, -2, 1, COLS, 41);
  S.eq('the same seed grows the same tuft', JSON.stringify(again), JSON.stringify(out));
  var other = [];
  g._r3Tuft(other, 3, 0, -2, 1, COLS, 42);
  S.ok('...and another seed a different one', JSON.stringify(other) !== JSON.stringify(out), '');

  /* it stays over its own patch of ground - the scatter places it within the cell */
  var reach = 0;
  out.forEach(function (f) { f.v.forEach(function (p) { reach = Math.max(reach, Math.hypot(p[0] - 3, p[2] + 2)); }); });
  S.ok('a tuft stays within a unit of where it was planted', reach < 1, reach.toFixed(2));
})();

require('../lib/report.js')(S);
