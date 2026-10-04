/* THE HOVERCRAFT (rules/units.js `hovercraft`, the 'hover' domain in core/grid.js). Its verb is
   the BEACH: land and open water alike, staged on a real generated map at a real gap - the one
   the map makes a tank drive furthest round:

     THE DOMAIN  open water and open land are both its ground; a structure, a shipyard's water,
                 rock and trees are not
     THE SHORT   its path from bank to bank goes straight over the water, where a tank's goes the
     WAY         long way round or nowhere - and it really drives it
     FIVE MEN    a squad boards on one bank, rides across and is put down on the far one
     AFLOAT      killed over the water it goes down - no wreckage thrown up, no fire on the
                 waves - and on land it burns like any vehicle
     UNDER IT    a torpedo cannot reach it */

var { Suite } = require('../lib/assert.js');
var { load } = require('../lib/sandbox.js');

var S = new Suite('hovercraft');
var g = load(['src/rules', 'src/core', 'src/sprites/props.js']);
var T, B;

function fresh() {
  g._rtsNewGame(4242, 'easy');
  var G = g.window._rtsG;
  G.over = null;
  G.ents.forEach(function (e) { if (e.type === 'unit') e.dead = true; });
  g._rtsTick(1 / 30);
  G.teams = {};
  T = G.terrain; B = G.blocked;
  return G;
}
function pathLen(sx, sz, gx, gz, dom) {
  var p = g._rtsPath(sx, sz, gx, gz, dom);
  if (!p || !p.length) return Infinity;
  var L = 0, x = sx, z = sz;
  p.forEach(function (q) { L += Math.hypot(q.x - x, q.z - z); x = q.x; z = q.z; });
  return L;
}
function run(G, secs, stop) {
  for (var t = 0; t < secs * 30; t++) { g._rtsTick(1 / 30); if (stop && stop()) return true; }
  return false;
}

/* ---------------- the roster ---------------- */
var d = g.rtsUnitDef('hovercraft');
S.ok('the Hovercraft is in the roster: both armies, a machine gun, five men aboard',
     !!(d && d.hover && d.carries === 5 && d.weapon === 'mg' && !d.side), d ? JSON.stringify({ hover: d.hover, carries: d.carries, weapon: d.weapon }) : 'missing');

/* ---------------- the domain ---------------- */
var G = fresh(), N = g.RTS_N, W = g.RTS_T_WATER, kinds = { sea: null, land: null, rock: null, struct: null, yard: null };
for (var i = 0; i < N * N; i++) {
  var x = i % N, z = (i / N) | 0;
  if (T[i] === W && B[i] === 2 && !kinds.sea) kinds.sea = [x, z];
  else if (T[i] !== W && B[i] === 0 && !kinds.land) kinds.land = [x, z];
  else if (T[i] !== W && B[i] === 2 && !kinds.rock) kinds.rock = [x, z];
  else if (T[i] !== W && B[i] === 1 && !kinds.struct) kinds.struct = [x, z];
}
function bl(k) { return g._rtsBlocked(kinds[k][0], kinds[k][1], 'hover'); }
S.ok('the map offers every kind of ground to ask about', !!(kinds.sea && kinds.land && kinds.rock && kinds.struct), JSON.stringify(kinds));
S.ok('open water and open land are both its ground', !bl('sea') && !bl('land'), '');
S.ok('...a building, rock and trees are not', bl('struct') && bl('rock'), '');
var yi = kinds.sea[1] * N + kinds.sea[0], keep = B[yi];
B[yi] = 1;                                                /* water a shipyard stands in */
S.ok('...nor a shipyard\'s water', g._rtsBlocked(kinds.sea[0], kinds.sea[1], 'hover'), '');
B[yi] = keep;
S.eq('it moves in the hover domain', g._rtsDomainOf({ type: 'unit', def: 'hovercraft' }), 'hover');

/* ---------------- the short way ---------------- */
var best = null, seen = {};
for (var tz = 2; tz < N - 2; tz++) for (var tx = 2; tx < N - 2; tx++) {
  if (T[g._rtsIdx(tx, tz)] === W || B[g._rtsIdx(tx, tz)] !== 0) continue;
  for (var f = 0; f < 4; f++) {
    var gp = g._rtsBridgeGap({ x: g._rtsWX(tx), z: g._rtsWX(tz), rot: f * Math.PI / 2 });
    if (!gp || gp.len < 3) continue;
    var key = gp.tx + ',' + gp.tz + ',' + gp.dx + ',' + gp.dz;
    if (seen[key]) continue;
    seen[key] = 1;
    var ex = gp.tx + gp.dx * gp.len, ez = gp.tz + gp.dz * gp.len;
    var a = { x: g._rtsWX(tx), z: g._rtsWX(tz) }, b = { x: g._rtsWX(ex), z: g._rtsWX(ez) };
    var walk = pathLen(a.x, a.z, b.x, b.z, null), straight = Math.hypot(b.x - a.x, b.z - a.z);
    var det = walk === Infinity ? 1e9 : walk / straight;
    if (!best || det > best.det) best = { a: a, b: b, d: [gp.dx, gp.dz], walk: walk, straight: straight, det: det };
  }
}
S.ok('the map has a gap a tank goes the long way round', !!best && best.det > 3,
     best ? (best.walk === Infinity ? 'no way round at all' : best.walk.toFixed(0) + ' driven for ' + best.straight.toFixed(0) + ' across') : 'none');
var hov = pathLen(best.a.x, best.a.z, best.b.x, best.b.z, 'hover');
S.ok('its own path goes straight over the water', hov < best.straight * 1.4,
     hov.toFixed(0) + ' for ' + best.straight.toFixed(0) + ' straight; a tank ' + (best.walk === Infinity ? 'cannot' : best.walk.toFixed(0)));

/* ...and a run across open water at a slant is one straight leg, not a staircase of cells: the
   path is pulled against its own domain */
var slant = null;
for (var si = 0; si < N * N && !slant; si += 7) {
  var sx0 = si % N, sz0 = (si / N) | 0;
  if (T[si] !== W || B[si] !== 2) continue;
  var sx1 = sx0 + 14, sz1 = sz0 + 8;
  if (!g._rtsInB(sx1, sz1)) continue;
  if (g._rtsClearLine(g._rtsWX(sx0), g._rtsWX(sz0), g._rtsWX(sx1), g._rtsWX(sz1), 'hover')) slant = [sx0, sz0, sx1, sz1];
}
S.ok('the case: open water with a clear slanting run across it', !!slant, JSON.stringify(slant));
if (slant) {
  var sp = g._rtsPath(g._rtsWX(slant[0]), g._rtsWX(slant[1]), g._rtsWX(slant[2]), g._rtsWX(slant[3]), 'hover');
  S.ok('...which its path takes as one straight leg', !!sp && sp.length <= 2, sp ? sp.length + ' waypoints' : 'no path');
}

/* ---------------- five men ---------------- */
G = fresh();
var hc = g._rtsSpawnUnit('player', 'hovercraft', best.a.x, best.a.z), men = [];
for (var m = 0; m < 5; m++) {
  var sq = g._rtsSpawnUnit('player', 'rifle', best.a.x - best.d[0] * g.RTS_TILE * 2 + (m - 2) * best.d[1] * 2, best.a.z - best.d[1] * g.RTS_TILE * 2 + (m - 2) * best.d[0] * 2);
  g._rtsOrderBoard(sq, hc); men.push(sq);
}
run(G, 20, function () { return g._rtsCargoCount(hc) === 5; });
S.eq('a squad of five boards it on the near bank', g._rtsCargoCount(hc), 5);
var far = { x: best.b.x + best.d[0] * g.RTS_TILE, z: best.b.z + best.d[1] * g.RTS_TILE };
var wet = false;
g._rtsOrderUnloadAt(hc, far.x, far.z);
run(G, 40, function () {
  if (T[g._rtsIdx(g._rtsTX(hc.x), g._rtsTX(hc.z))] === W) wet = true;
  return g._rtsCargoCount(hc) === 0 && men.every(function (u) { return !u.inside; });
});
var ashore = men.filter(function (u) {
  return !u.dead && !u.inside && T[g._rtsIdx(g._rtsTX(u.x), g._rtsTX(u.z))] !== W &&
         pathLen(u.x, u.z, best.b.x, best.b.z, null) < best.straight;           /* the FAR bank's side */
}).length;
S.ok('...rides across the water', wet, wet ? 'it was over the water' : 'it never left the land');
S.eq('...and all five are put down on the far bank', ashore, 5);

/* ---------------- afloat ---------------- */
function wreck(onWater) {
  var G2 = fresh(), c = onWater ? kinds.sea : kinds.land;
  var h = g._rtsSpawnUnit('enemy', 'hovercraft', g._rtsWX(c[0]), g._rtsWX(c[1]));
  h.x = g._rtsWX(c[0]); h.z = g._rtsWX(c[1]);
  var n0 = G2.fx.length;
  g._rtsDamage(h, 1e6, null);
  var made = G2.fx.slice(n0).map(function (fx) { return fx.kind; });
  return { debris: made.filter(function (k) { return k === 'debris'; }).length, fire: made.filter(function (k) { return /^fire/.test(k); }).length, dead: h.dead };
}
var sea = wreck(true), land = wreck(false);
S.ok('killed over the water it goes down: nothing thrown up, no fire on the waves', sea.dead && sea.debris === 0 && sea.fire === 0, JSON.stringify(sea));
S.ok('...on land it comes apart and burns like any vehicle', land.dead && land.debris > 0 && land.fire > 0, JSON.stringify(land));

/* ---------------- under it ---------------- */
var torp = g.RTS_WEAPONS[g.rtsUnitDef('sub').weapon];
S.ok('a torpedo cannot reach it', !!torp.seaOnly && !g._rtsWeaponReaches(torp, { type: 'unit', def: 'hovercraft' }), '');

require('../lib/report.js')(S);
