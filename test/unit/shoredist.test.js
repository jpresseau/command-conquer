/* How far out from the land - render3d/shelf3d.js _r3dShoreDist.

   The sea's shallows are coloured by how far each water cell lies from the nearest land, a field
   worked out whenever the mask is (a new map, the tide turning): a two-pass chamfer over the grid,
   1 along a row and root 2 across, capped. e2e/shallows checks the picture it makes; this checks
   the numbers.

     ALONG      off a straight shore the cells count out 1, 2, 3... to the cap
     ACROSS     off a corner the diagonal is root 2, root 8
     LAND       a land cell is 0
     OPEN SEA   off the map is not land: a sea with no shore in it is all the cap
     NEAR ROUND within three cells, against the true distance on a ragged coast, the chamfer is
                never short and never more than a quarter of a cell long
     THE MASK   the shallows' weight is 1 at the waterline, falls with the distance out, and is 0
                from R3D_SHELF_W cells out */

var { Suite } = require('../lib/assert.js');
var { load } = require('../lib/sandbox.js');

var S = new Suite('shoredist');
var g = load(['src/render3d/shelf3d.js']);
var CAP = g.R3D_SHELF_CAP;

function grid(N, landAt) {
  var w = new Uint8Array(N * N);
  for (var z = 0; z < N; z++) for (var x = 0; x < N; x++) w[z * N + x] = landAt(x, z) ? 0 : 1;
  return w;
}

/* ALONG: land down the left-hand column */
var N = 12, D = g._r3dShoreDist(N, grid(N, function (x) { return x === 0; }), CAP), row = [];
for (var x = 0; x < N; x++) row.push(+D[5 * N + x].toFixed(3));
var want = row.map(function (v, i) { return Math.min(i, CAP); });
S.ok('ALONG: off a straight shore the cells count out one by one, to the cap',
     row.join() === want.join(), row.join(' '));

/* ACROSS: one land cell in a corner */
D = g._r3dShoreDist(N, grid(N, function (x, z) { return x === 0 && z === 0; }), CAP);
S.ok('ACROSS: off a corner the diagonal is root 2, then root 8',
     Math.abs(D[1 * N + 1] - Math.SQRT2) < 1e-6 && Math.abs(D[2 * N + 2] - 2 * Math.SQRT2) < 1e-6,
     D[1 * N + 1].toFixed(4) + ', ' + D[2 * N + 2].toFixed(4));
S.ok('LAND: a land cell is 0', D[0] === 0, String(D[0]));

/* OPEN SEA */
D = g._r3dShoreDist(N, grid(N, function () { return false; }), CAP);
var all = true;
for (var i = 0; i < N * N; i++) if (D[i] !== CAP) all = false;
S.ok('OPEN SEA: off the map is not land - a sea with no shore in it is all the cap', all, 'cap ' + CAP);

/* NEAR ROUND: a ragged coast, hashed so it is the same every run */
function h(x, z) { var s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return s - Math.floor(s); }
N = 48;
var wet = grid(N, function (x, z) { return z < 10 + 6 * Math.sin(x * 0.35) + (h(x, z) < 0.2 ? 2 : 0) || h(x, z) < 0.03; });
D = g._r3dShoreDist(N, wet, CAP);
var short = 0, worst = 0, n = 0;
for (var z = 0; z < N; z++) for (x = 0; x < N; x++) {
  if (!wet[z * N + x]) continue;
  var b = 99;
  for (var bz = 0; bz < N; bz++) for (var bx = 0; bx < N; bx++) if (!wet[bz * N + bx]) b = Math.min(b, Math.hypot(bx - x, bz - z));
  if (b > 3) continue;
  n++;
  if (D[z * N + x] < b - 1e-6) short++;
  worst = Math.max(worst, D[z * N + x] - b);
}
S.ok('NEAR ROUND: within three cells the chamfer is never short of the true distance, and never a quarter of a cell long',
     n > 300 && short === 0 && worst < 0.25, n + ' cells, ' + short + ' short, longest by ' + worst.toFixed(3));

/* THE MASK: the GLSL's _shelfK, evaluated here from the same constants */
function K(gv) {
  var d = Math.max(gv * CAP - 0.5, 0), t = Math.min(Math.max(d / g.R3D_SHELF_W, 0), 1), k = 1 - t * t * (3 - 2 * t);
  return k * k;
}
S.ok('THE MASK: the shallows weigh 1 at the waterline, less a cell out, 0 from R3D_SHELF_W out',
     K(0.5 / CAP) === 1 && K(1.5 / CAP) < 1 && K(1.5 / CAP) > 0 && K((g.R3D_SHELF_W + 0.5) / CAP) === 0 &&
     /float _shoreD\(float g\)\{ return max\(g \* [\d.]+ - 0\.5, 0\.0\); \}/.test(g.R3D_SHELF_K_GLSL) &&
     /float k = 1\.0 - smoothstep\(0\.0, [\d.]+, _shoreD\(g\)\); return k \* k;/.test(g.R3D_SHELF_K_GLSL),
     'at the waterline ' + K(0.5 / CAP) + ', a cell out ' + K(1.5 / CAP).toFixed(3) + ', ' + g.R3D_SHELF_W + ' out ' +
     K((g.R3D_SHELF_W + 0.5) / CAP));

require('../lib/report.js')(S);
