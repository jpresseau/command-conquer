/* The marks vehicles leave - render3d/tread3d.js.

   The one part of the effects that keeps state: a ring of marks laid as vehicles drive, each
   stamped with the moment it was laid so the shader can fade it. What gets laid, where, how wide
   and how deep is all decided here, in _r3dTreadTick, and is checked against it directly;
   e2e/treads checks the marks on the ground. */

var { Suite } = require('../lib/assert.js');
var { load } = require('../lib/sandbox.js');

var S = new Suite('treads');
var g = load(['src/rules', 'src/core', 'src/render3d/tread3d.js']);
var F = g.R3D_TREAD_F, N = g.RTS_N;

/* a flat map of one kind of ground, and a fresh renderer state */
function world(kind) {
  var G = { t: 10, ents: [], terrain: new Uint8Array(N * N).fill(kind === undefined ? g.RTS_T_SAND : kind), height: null };
  g.window._rtsG = G;
  return G;
}
function unit(G, def, x, z) {
  var e = { id: G.ents.length + 1, type: 'unit', def: def, x: x, z: z, dead: false, air: false };
  G.ents.push(e);
  return e;
}
/* drive e from where it is to (x, z) in steps of `step`, ticking the marks each step */
function drive(G, R3, e, x, z, step) {
  var dx = x - e.x, dz = z - e.z, m = Math.hypot(dx, dz), n = Math.ceil(m / step);
  for (var i = 1; i <= n; i++) { e.x += dx / n; e.z += dz / n; g._r3dTreadTick(G, R3); }
}
/* mark q's six vertices as { x, y, z, u, v, born, s, k } */
function mark(R3, q) {
  var out = [];
  for (var v = 0; v < 6; v++) {
    var o = (q * 6 + v) * F, a = R3.treadA;
    out.push({ x: a[o], y: a[o + 1], z: a[o + 2], u: a[o + 3], v: a[o + 4], born: a[o + 5], s: a[o + 6], k: a[o + 7] });
  }
  return out;
}

/* ---- a tank across open sand ---- */
var G = world(), R3 = {}, tank = unit(G, 'tank', 0, 0), r = g.rtsUnitDef('tank').r;
g._r3dTreadTick(G, R3);
S.ok('nothing is laid where a vehicle has not yet moved', R3.treadN === 0, R3.treadN + ' marks');
drive(G, R3, tank, 0.5, 0, 0.5);
S.ok('...nor before it has driven a step', R3.treadN === 0, R3.treadN + ' marks after 0.5 of a ' + g.R3D_TREAD_STEP + ' step');
drive(G, R3, tank, 20, 0, 0.5);
var pairs = R3.treadN / 2;
S.ok('driving on lays marks in pairs, about one pair a step',
     R3.treadN % 2 === 0 && pairs >= 20 / g.R3D_TREAD_STEP * 0.4 && pairs <= 20 / g.R3D_TREAD_STEP + 1,
     R3.treadN + ' marks over 20 world units');
var m0 = mark(R3, 0), m1 = mark(R3, 1), m2 = mark(R3, 2);
var zs = m0.map(function (p) { return p.z; }).concat(m1.map(function (p) { return p.z; }));
S.ok('a tank\'s pair is its two tracks, either side of its path',
     Math.abs(Math.max.apply(null, zs) - r * (0.55 + 0.16)) < 1e-4 && Math.abs(Math.min.apply(null, zs) + r * (0.55 + 0.16)) < 1e-4,
     'from ' + Math.min.apply(null, zs).toFixed(3) + ' to ' + Math.max.apply(null, zs).toFixed(3) + ' across a path along x, r ' + r);
S.ok('...cleated, and laid on the clock', m0[0].k === 1 && m0[0].born === G.t && m0[0].s === 1,
     'tracked ' + m0[0].k + ', laid at ' + m0[0].born + ' (clock ' + G.t + '), depth ' + m0[0].s + ' in sand');
S.ok('...and each mark begins where the last ended, so a track is unbroken',
     Math.abs(m2[0].x - m0[1].x) < 1e-6 && Math.abs(m2[0].u - m0[1].u) < 1e-6 && m2[0].u > m0[0].u,
     'mark 0 ends at x ' + m0[1].x.toFixed(3) + ' (u ' + m0[1].u.toFixed(3) + '), mark 2 begins at x ' + m2[0].x.toFixed(3) + ' (u ' + m2[0].u.toFixed(3) + ')');
/* an upload clears the range (_r3dTreadDraw); what is laid after it is all the next one sends */
R3.treadLo = 1e9; R3.treadHi = -1;
var n0 = R3.treadN;
drive(G, R3, tank, 25, 0, 0.5);
S.ok('only the marks laid since the last upload are handed to the GPU',
     R3.treadN > n0 && R3.treadLo === n0 && R3.treadHi === R3.treadN - 1,
     'marks ' + n0 + '..' + (R3.treadN - 1) + ' are new; the range to send is ' + R3.treadLo + '..' + R3.treadHi);

/* ---- a buggy's tyres ---- */
G = world(); R3 = {};
var bug = unit(G, 'buggy', 0, 0), rb = g.rtsUnitDef('buggy').r;
g._r3dTreadTick(G, R3); drive(G, R3, bug, 10, 0, 0.5);
var b0 = mark(R3, 0), bz = b0.map(function (p) { return p.z; });
S.ok('a wheeled vehicle lays two thin tyre lines instead, without cleats',
     R3.treadN > 0 && b0[0].k === 0 && Math.abs(Math.max.apply(null, bz) - Math.min.apply(null, bz) - rb * 0.14) < 1e-4,
     R3.treadN + ' marks, tracked ' + b0[0].k + ', a line ' + (Math.max.apply(null, bz) - Math.min.apply(null, bz)).toFixed(3) + ' wide');

/* ---- what lays nothing ---- */
var aKey = g.RTS_UNITS.filter(function (u) { return u.kind === 'air'; })[0].key;
var sKey = g.RTS_UNITS.filter(function (u) { return u.sea; })[0].key;
['rifle', aKey, sKey].forEach(function (key) {
    var G2 = world(), R = {}, e = unit(G2, key, 0, 0);
    if (g.rtsUnitDef(key).kind === 'air') e.air = true;
    g._r3dTreadTick(G2, R); drive(G2, R, e, 10, 0, 0.5);
    S.ok(key + ' lays no marks', R.treadN === 0, R.treadN + ' marks');
});
G = world(); R3 = {}; tank = unit(G, 'tank', 0, 0);
g._r3dTreadTick(G, R3); tank.x = 30; g._r3dTreadTick(G, R3);
S.ok('a jump longer than any drive lays nothing, and starts again from where it landed',
     R3.treadN === 0 && R3.treadLast[tank.id][0] === 30, R3.treadN + ' marks, restarted at x ' + R3.treadLast[tank.id][0]);

/* ---- how deep, by ground ---- */
function depthOn(kind, pave) {
  var G2 = world(kind), R = {};
  if (pave) { R.treadPave = new Uint8Array(N * N).fill(1); R.groundMapKey = 1; R.treadPaveKey = 1; }
  var e = unit(G2, 'tank', 0, 0);
  g._r3dTreadTick(G2, R); drive(G2, R, e, 10, 0, 0.5);
  return R.treadN ? mark(R, 0)[0].s : 0;
}
var deep = { sand: depthOn(g.RTS_T_SAND), road: depthOn(g.RTS_T_ROAD), grass: depthOn(g.RTS_T_GRASS),
             rock: depthOn(g.RTS_T_ROCK), water: depthOn(g.RTS_T_WATER), paved: depthOn(g.RTS_T_SAND, true) };
S.ok('loose ground takes the deepest marks, grass a faint one',
     deep.sand === 1 && deep.road > 0.5 && deep.road < 1 && deep.grass > 0.2 && deep.grass < deep.road,
     JSON.stringify(deep));
S.ok('...and rock, water and the base\'s paving take none', deep.rock === 0 && deep.water === 0 && deep.paved === 0,
     'rock ' + deep.rock + ', water ' + deep.water + ', paved ' + deep.paved);

/* ---- the ring ---- */
G = world(); R3 = {}; tank = unit(G, 'tank', 0, 0);
g._r3dTreadTick(G, R3);
for (var lap = 0; R3.treadHead < 6 || lap < 1; ) {
  var before = R3.treadHead;
  tank.x += g.R3D_TREAD_STEP + 0.01; if (tank.x > 150) tank.x = -150;
  g._r3dTreadTick(G, R3);
  if (R3.treadHead < before) lap++;
  if (lap > 2) break;
}
S.ok('the ring holds R3D_TREAD_MAX marks and lays the next over the oldest',
     R3.treadN === g.R3D_TREAD_MAX && R3.treadHead >= 6 && R3.treadHead < g.R3D_TREAD_MAX,
     R3.treadN + ' held of ' + g.R3D_TREAD_MAX + ', the next goes in at ' + R3.treadHead);
var G3 = world(); g._r3dTreadTick(G3, R3);
S.ok('a new game starts on clean ground', R3.treadN === 0 && R3.treadHead === 0, R3.treadN + ' marks');

require('../lib/report.js')(S);
