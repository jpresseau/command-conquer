/* THE SAME ANSWERS, FOR LESS (rules/teams.js, core/basezone.js, core/ai.js, core/grid.js,
   render3d/fxemit3d.js). Each of these was made cheaper; none may answer differently.

     THE TABLES    rtsUnitDef and rtsStructDef through an index: every key gives the table's own
                   row, as a walk of the table gives it; a miss is null; the first of two rows
                   with one key wins; a table that grows, shrinks or has a row changed under the
                   index is still answered from the table as it stands
     THE CENTRE    the opponent's think asks whether each of a side's buildings is in its base;
                   it finds that side's centre once, not once a building, and counts the same
     THE HEIGHT    _rtsElev with no closure made a call: the same height as the function it
                   replaced, at four thousand points on and off the map
     THE QUADS     the effects' four corners a quad, copied without a view a corner: the same
                   floats as the subarrays gave */

var { Suite } = require('../lib/assert.js');
var { loadFast } = require('../lib/sandbox.js');

var S = new Suite('perfsim');
var g = loadFast(['src/rules', 'src/core', 'src/sprites/props.js', 'src/render3d/fxemit3d.js', 'src/render3d/upload3d.js']);
function walk(arr, k) { for (var i = 0; i < arr.length; i++) if (arr[i].key === k) return arr[i]; return null; }

/* ---------------- the tables ---------------- */
var U = g.RTS_UNITS, B = g.RTS_STRUCTS, wrong = [];
U.forEach(function (d) { if (g.rtsUnitDef(d.key) !== walk(U, d.key)) wrong.push(d.key); });
B.forEach(function (d) { if (g.rtsStructDef(d.key) !== walk(B, d.key)) wrong.push(d.key); });
S.ok('the rosters are there to ask (population)', U.length > 50 && B.length > 30, U.length + ' units, ' + B.length + ' structures');
S.ok('THE TABLES: every key gives the table\'s own row', !wrong.length, wrong.join(' ') || 'all');
S.ok('a key the table has not is null, and so is nothing at all', g.rtsUnitDef('nosuch') === null && g.rtsStructDef('tank') === null && g.rtsUnitDef(undefined) === null && g.rtsUnitDef(null) === null, '');
S.ok('a unit is not a structure, nor the other way', g.rtsUnitDef('yard') === null && g.rtsStructDef('yard') === walk(B, 'yard'), '');
/* the table grows: a row pushed after the index was built is found, and gone when popped */
var extra = { key: 'zz_probe', name: 'Probe' };
U.push(extra);
S.ok('a row added to the table is found', g.rtsUnitDef('zz_probe') === extra, '');
U.pop();
S.eq('...and not found once it is taken off', g.rtsUnitDef('zz_probe'), null);
/* two rows with one key: the first wins, as the walk had it */
var dupe = { key: U[3].key, name: 'Second' };
U.push(dupe);
S.ok('of two rows with one key the first wins', g.rtsUnitDef(U[3].key) === U[3], '');
U.pop();
/* a row changed under the index, the table the same length */
var keep = U[5], swap = { key: 'zz_swapped', name: 'Swapped' };
g.rtsUnitDef(keep.key);                       /* the index is built and warm */
U[5] = swap;
S.eq('a row replaced under the index: its old key answers with no row - never the wrong one', g.rtsUnitDef(keep.key), null);
g._rtsDefReset();
S.ok('...and once the index is reset the new key is found', g.rtsUnitDef('zz_swapped') === swap && g.rtsUnitDef(keep.key) === null, '');
U[5] = keep; g._rtsDefReset();
S.ok('...and put back, found again', g.rtsUnitDef(keep.key) === keep && g.rtsUnitDef('zz_swapped') === null, '');
var renamed = U[7], was = renamed.key;
g.rtsUnitDef(was); renamed.key = 'zz_renamed';
S.eq('a row whose own key is changed no longer answers to the old one', g.rtsUnitDef(was), null);
g._rtsDefReset();
S.ok('...and after a reset answers to the new', g.rtsUnitDef('zz_renamed') === renamed, '');
renamed.key = was; g._rtsDefReset();
S.ok('...and to the old one again when it is changed back', g.rtsUnitDef(was) === renamed, '');
/* every other row still answers after all of that */
var after = [];
U.forEach(function (d) { if (g.rtsUnitDef(d.key) !== walk(U, d.key)) after.push(d.key); });
S.ok('...and every row still gives itself', !after.length, after.join(' ') || 'all');

/* ---------------- the centre ---------------- */
g._rtsNewGame(9001, 'hard');
var G = g._rtsG;
for (var i = 0; i < 60 * 240; i++) g._rtsTick(1 / 60);
var mine = G.ents.filter(function (e) { return e.type === 'struct' && !e.dead && !e.selling && e.side === 'enemy'; });
S.ok('four minutes in the opponent has a base to count (population)', mine.length >= 8, mine.length + ' structures');
var seeds = 0, realSeed = g._rtsBaseSeed, fast, ref;
g._rtsBaseSeed = function (side) { seeds++; return realSeed(side); };
g._rtsAIAs('enemy', function () { fast = JSON.stringify(g._rtsAIWants(G.sides.enemy)); });
var askedOnce = seeds;
/* the reference: the centre asked for once a building, as it was */
var realOf = g._rtsInBaseOf, calls = 0;
g._rtsInBaseOf = function (c, x, z) { calls++; return realOf(g._rtsHomeCentre('enemy'), x, z); };
seeds = 0;
g._rtsAIAs('enemy', function () { ref = JSON.stringify(g._rtsAIWants(G.sides.enemy)); });
g._rtsInBaseOf = realOf; g._rtsBaseSeed = realSeed;
S.ok('THE CENTRE: the think finds a side\'s centre once', askedOnce === 1, askedOnce + ' searches for ' + mine.length + ' buildings');
S.ok('...where asking once a building searched once a building (the reference)', calls >= mine.length && seeds >= mine.length, seeds + ' searches, ' + calls + ' buildings asked');
S.eq('...and what it wants is the same, word for word', fast, ref);
S.ok('...and it wants something (population)', fast && fast.length > 2, fast);
var c0 = g._rtsHomeCentre('enemy'), y0 = g._rtsHas('enemy', 'yard') || mine[0];
S.ok('in its base, and not across the map', g._rtsInBaseOf(c0, y0.x, y0.z) === true && g._rtsInBaseOf(c0, y0.x + 4000, y0.z) === false && g._rtsInBaseOf(null, 0, 0) === false &&
     g._rtsInBase('enemy', y0.x, y0.z) === true, '');

/* ---------------- the height ---------------- */
function elevRef(x, z) {
  if (!G || !G.height) return 0;
  var fx = x / g.RTS_TILE + g.RTS_N / 2 - 0.5, fz = z / g.RTS_TILE + g.RTS_N / 2 - 0.5;
  var x0 = Math.floor(fx), z0 = Math.floor(fz);
  var ax = fx - x0, az = fz - z0;
  function at(a, b) {
    if (a < 0) a = 0; else if (a > g.RTS_N - 1) a = g.RTS_N - 1;
    if (b < 0) b = 0; else if (b > g.RTS_N - 1) b = g.RTS_N - 1;
    return G.height[b * g.RTS_N + a];
  }
  var h = (at(x0, z0) * (1 - ax) + at(x0 + 1, z0) * ax) * (1 - az) +
          (at(x0, z0 + 1) * (1 - ax) + at(x0 + 1, z0 + 1) * ax) * az;
  return h / 255 * g.RTS_ELEV_MAX;
}
var half = g.RTS_N * g.RTS_TILE / 2, seed = 12345, differ = 0, high = 0, off = 0;
function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
for (i = 0; i < 4000; i++) {
  var x = (rnd() * 2.4 - 1.2) * half, z = (rnd() * 2.4 - 1.2) * half;
  if (Math.abs(x) > half || Math.abs(z) > half) off++;
  var a = g._rtsElev(x, z), b = elevRef(x, z);
  if (a !== b) differ++;
  if (b > 0.5) high++;
}
[[-half, -half], [half, half], [half - 0.001, -half + 0.001], [0, 0], [half * 5, -half * 5]].forEach(function (p) { if (g._rtsElev(p[0], p[1]) !== elevRef(p[0], p[1])) differ++; });
S.ok('the map has hills, and some of the points are off it (population)', high > 100 && off > 300, high + ' on high ground, ' + off + ' off the map');
S.eq('THE HEIGHT: the same at every point, on the map, at its corners and off it', differ, 0);

/* ---------------- the quads ---------------- */
var Bq = g._r3dFxBatch(), V = { sp: 0.6, cp: 0.8, cy: 1, sy: 0, out: null, outL: null };
for (i = 0; i < 90; i++) g._r3dFxBill(Bq, V, i * 1.3, 2 + i % 5, -i * 0.7, 1 + i % 3, 2, 0.5, 1 + (i % 4), i / 90, i * 0.37, 0.9, i % 2, [0.1 * (i % 9), 0.5, 0.2]);
var ord = []; for (i = 0; i < Bq.n; i++) ord.push((i * 37) % Bq.n);
function packRef(Bb, o2) {
  var St = g.R3D_FX_STRIDE, Q4 = 4 * St, n = Bb.n, out = new Float32Array(n * Q4);
  for (var k = 0; k < n; k++) {
    var q = (o2 ? o2[k] : k) * g.R3D_FX_QUAD;
    for (var c = 0; c < 4; c++) out.set(Bb.a.subarray(q + g.R3D_FX_CORNER4[c] * St, q + (g.R3D_FX_CORNER4[c] + 1) * St), k * Q4 + c * St);
  }
  return out;
}
function sameF(p, q) { if (p.length !== q.length) return false; for (var k = 0; k < p.length; k++) if (p[k] !== q[k]) return false; return true; }
var p1 = g._r3dFxPack(Bq, ord, V, 'out'), p2 = g._r3dFxPack(Bq, null, V, 'outL');
S.ok('ninety quads to pack, more than the batch began with room for (population)', Bq.n === 90 && p1.length === 90 * 4 * g.R3D_FX_STRIDE, Bq.n + ' quads');
S.ok('THE QUADS: packed in a given order, the same floats', sameF(p1, packRef(Bq, ord)), '');
S.ok('...and in their own order', sameF(p2, packRef(Bq, null)), '');

require('../lib/report.js')(S);
