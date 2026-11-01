/* EVERY FACE OF EVERY MODEL HAS A NORMAL - render3d/mesh3d.js _r3dFaceNormal.

   The 3D view builds its models richer than the sprites (_r3DetailHigh): every box's flat
   chamfer becomes a rounded edge (r3d/curves.js _r3RoundBox), whose cap is a polygon that
   starts with three points in a line - two ends of a corner arc and the straight run between.
   The mesh builder took a face's normal from its first three corners, so that cap got a zero
   normal, the shader normalised it into NaN, and every rounded box at the high and medium tiers
   had a black lid: barrel tops, fenders, hull plates, roof parts, on every unit and building.

   The normal is now the sum over all the polygon's edges (Newell's method). Held from both ends:
   the old way really does find zero-normal faces in these models (the population), and the new
   one finds none in any unit or building of either side, built the way the 3D view builds it. */

var vm = require('vm');
var { Suite } = require('../lib/assert.js');
var { loadFast } = require('../lib/sandbox.js');

var S = new Suite('lids');
var g = loadFast(['src/rules', 'src/r3d', 'src/sprites', 'src/render3d/mesh3d.js']);

function firstThree(v) {
  var ax = v[1][0] - v[0][0], ay = v[1][1] - v[0][1], az = v[1][2] - v[0][2];
  var bx = v[2][0] - v[0][0], by = v[2][1] - v[0][1], bz = v[2][2] - v[0][2];
  return [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
}
function zero(n) { return !(Math.hypot(n[0], n[1], n[2]) > 1e-9); }
/* the polygon's true area, by a fan of triangles - independent of the function under test */
function area(v) {
  var a = 0;
  for (var k = 2; k < v.length; k++) {
    var ux = v[k - 1][0] - v[0][0], uy = v[k - 1][1] - v[0][1], uz = v[k - 1][2] - v[0][2];
    var wx = v[k][0] - v[0][0], wy = v[k][1] - v[0][1], wz = v[k][2] - v[0][2];
    a += Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx) / 2;
  }
  return a;
}

/* as the 3D view builds them: _r3DetailHigh at the detail level the high tier uses */
vm.runInContext('_r3dDetailLevel = function () { return R3_DETAIL_3D; };', g);
var models = [], oldZero = 0, newZero = 0, faces = 0, bad = [];
['player', 'enemy'].forEach(function (side) {
  g.RTS_UNITS.forEach(function (u) {
    var parts = [null];
    if (u.weapon && /tank|heavy|light|prism|arc/.test(u.key)) parts = ['hull', 'turret'];
    parts.forEach(function (part) {
      try { models.push({ name: u.key + (part ? ':' + part : ''), f: g._r3DetailHigh(function () { return g._sprUnitModel(u.key, side, false, part); }) }); } catch (e) {}
    });
  });
  g.RTS_STRUCTS.forEach(function (b) {
    try { models.push({ name: b.key, f: g._r3DetailHigh(function () { return g._sprBuildingModel(b.key, side); }) }); } catch (e) {}
  });
});
models.forEach(function (m) {
  (m.f || []).forEach(function (f) {
    if (!f.v || f.v.length < 3 || f.n) return;          /* a face with normals of its own carries them */
    if (!(area(f.v) > 1e-6)) return;                    /* no area, no pixels */
    faces++;
    if (zero(firstThree(f.v))) oldZero++;
    if (zero(g._r3dFaceNormal(f.v))) { newZero++; if (bad.length < 4) bad.push(m.name); }
  });
});

S.ok('(the population: the units and buildings of both sides, built as the 3D view builds them)', models.length > 150 && faces > 10000,
     models.length + ' models, ' + faces + ' flat faces');
S.ok('(...and the old way, the first three corners, finds faces with no normal among them - the black lids)', oldZero > 50,
     oldZero + ' faces');
S.ok('EVERY FACE HAS A NORMAL: no face with area gets a zero one', newZero === 0, newZero + ' faces' + (bad.length ? ', in ' + bad.join(' ') : ''));
var sq = [[0, 0, 0], [0, 0, 2], [2, 0, 2], [2, 0, 0]], up = g._r3dFaceNormal(sq);
S.ok('...and it points out of the face the way the corners wind: a square wound as a roof faces up', up[1] > 0 && Math.abs(up[0]) < 1e-9 && Math.abs(up[2]) < 1e-9, JSON.stringify(up));

require('../lib/report.js')(S);
