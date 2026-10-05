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
var g = load(['src/rules', 'src/core', 'src/sprites/props.js', 'src/ui']);
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

/* ---------------- three cells out ---------------- */
/* afloat, it boards as the craft does (core/units.js): a squad sent aboard one three cells off
   the beach walks to the shore and climbs in, where the APC's reach left it standing there */
G = fresh();
var pair = null;
for (var pz = 2; pz < g.RTS_N - 2 && !pair; pz++) for (var px = 2; px < g.RTS_N - 2 && !pair; px++) {
  if (T[g._rtsIdx(px, pz)] !== W || g._rtsBlocked(px, pz, 'sea')) continue;
  for (var dz2 = -3; dz2 <= 3 && !pair; dz2++) for (var dx2 = -3; dx2 <= 3 && !pair; dx2++) {
    var d2 = Math.hypot(dx2, dz2);
    if (d2 < 2.6 || d2 > 3.2) continue;
    var lx = px + dx2, lz = pz + dz2;
    if (!g._rtsInB(lx, lz) || T[g._rtsIdx(lx, lz)] === W || g._rtsBlocked(lx, lz, null)) continue;
    pair = { sea: [px, pz], land: [lx, lz], d: +d2.toFixed(2) };
  }
}
S.ok('the case: open water three cells off a shore a squad can stand on', !!pair, pair ? JSON.stringify(pair) : 'none');
var hc3 = g._rtsSpawnUnit('player', 'hovercraft', g._rtsWX(pair.sea[0]), g._rtsWX(pair.sea[1]));
var sq3 = g._rtsSpawnUnit('player', 'rifle', g._rtsWX(pair.land[0]), g._rtsWX(pair.land[1]));
var took = g._rtsOrderBoard(sq3, hc3);
run(G, 25, function () { hc3.order = 'hold'; hc3.path = null; return g._rtsCargoCount(hc3) === 1; });
S.ok('a squad sent aboard a hovercraft three cells off the beach gets in', took && g._rtsCargoCount(hc3) === 1 && sq3.inside === hc3, 'order taken ' + took + ', aboard ' + g._rtsCargoCount(hc3));
/* ...from the nearest ground there is, which the APC's reach would not have allowed: the shore
   dug back so that no standable cell is within two and a half of the craft, the squad walks to
   the water's edge - two and a half cells and more from the hull - and still climbs in */
G = fresh();
var dug = 0;
for (var dz3 = -2; dz3 <= 2; dz3++) for (var dx3 = -2; dx3 <= 2; dx3++) {
  var cx3 = pair.sea[0] + dx3, cz3 = pair.sea[1] + dz3, ci3 = g._rtsIdx(cx3, cz3);
  if (Math.hypot(dx3, dz3) < 2.5 && g._rtsInB(cx3, cz3) && T[ci3] !== W) { T[ci3] = W; B[ci3] = 2; dug++; }
}
var nearestLand = 1e9;
for (var lz = -4; lz <= 4; lz++) for (var lx = -4; lx <= 4; lx++) {
  var lc = [pair.sea[0] + lx, pair.sea[1] + lz];
  if (g._rtsInB(lc[0], lc[1]) && T[g._rtsIdx(lc[0], lc[1])] !== W && !g._rtsBlocked(lc[0], lc[1], null)) nearestLand = Math.min(nearestLand, Math.hypot(lx, lz));
}
var hc4 = g._rtsSpawnUnit('player', 'hovercraft', g._rtsWX(pair.sea[0]), g._rtsWX(pair.sea[1]));
hc4.x = g._rtsWX(pair.sea[0]); hc4.z = g._rtsWX(pair.sea[1]);
var sq4 = g._rtsSpawnUnit('player', 'rifle', g._rtsWX(pair.land[0]), g._rtsWX(pair.land[1]));
var took4 = g._rtsOrderBoard(sq4, hc4);
run(G, 25, function () { hc4.order = 'hold'; hc4.path = null; hc4.x = g._rtsWX(pair.sea[0]); hc4.z = g._rtsWX(pair.sea[1]); return g._rtsCargoCount(hc4) === 1; });
S.ok('...and with the shore dug back to two and a half cells and more from the hull, the squad still boards from the water\'s edge', dug > 0 && nearestLand >= 2.5 && nearestLand <= 3.2 && took4 && g._rtsCargoCount(hc4) === 1,
     dug + ' cells dug; nearest ground ' + nearestLand.toFixed(2) + ' cells from the hull; aboard ' + g._rtsCargoCount(hc4) + (sq4.inside ? '' : ', squad ' + (Math.hypot(sq4.x - hc4.x, sq4.z - hc4.z) / g.RTS_TILE).toFixed(2) + ' cells off'));

/* ---------------- the pointer ---------------- */
/* the cursor asks each selected unit's own domain (ui/hud.js _rtsActionAt): open water is a move
   for a hovercraft and a refusal for a tank; and an enemy is the reticle only for a gun that bears */
g.window._rtsUI = { place: null, mode: null, attackMove: false };
var pick = null;
g._rtsPickAt = function () { return pick; };
pick = { ent: null, x: g._rtsWX(kinds.sea[0]), z: g._rtsWX(kinds.sea[1]) };
G.sel = [hc3]; var curHover = g._rtsActionAt(0, 0);
var tk3 = g._rtsSpawnUnit('player', 'tank', g._rtsWX(kinds.land[0]), g._rtsWX(kinds.land[1]));
G.sel = [tk3]; var curTank = g._rtsActionAt(0, 0);
S.ok('over open water the pointer offers a hovercraft a move, and a tank a refusal', curHover === 'move' && curTank === 'no', curHover + ' / ' + curTank);
var ft = g._rtsSpawnUnit('player', 'flaktrack', g._rtsWX(kinds.land[0]), g._rtsWX(kinds.land[1]));
var et3 = g._rtsSpawnUnit('enemy', 'tank', g._rtsWX(kinds.land[0]) + 12, g._rtsWX(kinds.land[1])), eh3 = g._rtsSpawnUnit('enemy', 'heli', g._rtsWX(kinds.land[0]), g._rtsWX(kinds.land[1]) + 12);
G.sel = [ft];
pick = { ent: et3, x: et3.x, z: et3.z }; var onTank = g._rtsActionAt(0, 0);
pick = { ent: eh3, x: eh3.x, z: eh3.z }; var onHeli = g._rtsActionAt(0, 0);
S.ok('a Flak Track gets the reticle over a gunship, and a refusal over a tank its gun cannot bear on', onHeli === 'attack' && onTank === 'no', 'gunship ' + onHeli + ', tank ' + onTank);
var said3 = [], say3 = g._rtsSay; g._rtsSay = function (m) { said3.push(m); };
g._rtsRightClick(0, 0, { ent: et3, x: et3.x, z: et3.z });
g._rtsSay = say3;
S.ok('...and right-clicked onto the tank anyway, it is told', said3.some(function (m) { return /cannot engage/.test(m); }), said3.join(' | ') || 'nothing said');

/* ---------------- unload, by button ---------------- */
/* U and the sidebar's UNLOAD give one order (core/transport.js _rtsUnloadSelected): a finger has no U,
   and a phone could board five men on a hovercraft and never put them down */
var can0 = g._rtsCanUnload(hc3);
hc3.x = g._rtsWX(kinds.land[0]) + 4; hc3.z = g._rtsWX(kinds.land[1]) + 4; hc3.order = null; hc3.path = null;
G.sel = [hc3];
var ur = g._rtsUnloadSelected();
S.ok('UNLOAD shows for a loaded transport, and puts the men down where it stands', can0 && ur.out === 1 && !sq3.inside && !g._rtsCanUnload(hc3), 'shown ' + can0 + ', ' + JSON.stringify(ur));
var deep = null;
for (var qz = 3; qz < g.RTS_N - 3 && !deep; qz += 2) for (var qx = 3; qx < g.RTS_N - 3 && !deep; qx += 2)
  if (T[g._rtsIdx(qx, qz)] === W && !g._rtsBlocked(qx, qz, 'sea') && !g._rtsNearestOpen(qx, qz, 4, null)) deep = [qx, qz];
var lst = deep ? g._rtsSpawnUnit('player', 'lst', g._rtsWX(deep[0]), g._rtsWX(deep[1])) : null;
if (lst) g._rtsBoard(g._rtsSpawnUnit('player', 'rifle', lst.x, lst.z), lst);
var said4 = [], say4 = g._rtsSay; g._rtsSay = function (m) { said4.push(m); };
G.sel = lst ? [lst] : []; var ur2 = g._rtsUnloadSelected();
g._rtsSay = say4;
S.ok('...and a craft in open water keeps its men and says so', !!deep && ur2.out === 0 && ur2.held === 1 && said4.some(function (m) { return /Nowhere to unload/.test(m); }), (deep ? JSON.stringify(ur2) : 'no open water four cells from land') + ' ' + said4.join(' | '));

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

/* ---------------- crowded ---------------- */
/* it crowds with whatever shares the ground under it (core/move.js): in a bucket of its own it
   was never pushed off anyone, and a craft driven into a parked column stopped inside a tank */
function apart(other, c) {
  fresh();
  var a = g._rtsSpawnUnit('player', other, g._rtsWX(c[0]), g._rtsWX(c[1])), h = g._rtsSpawnUnit('player', 'hovercraft', g._rtsWX(c[0]) + 0.3, g._rtsWX(c[1]));
  for (var t = 0; t < 90; t++) { [a, h].forEach(function (u) { u.order = 'hold'; u.path = null; }); g._rtsTick(1 / 30); }
  return { d: Math.hypot(a.x - h.x, a.z - h.z), r: a.r + h.r };
}
var onLand = apart('tank', kinds.land), onSea = apart('gunboat', kinds.sea);
S.ok('set down on a parked tank it is pushed clear, as a tank would be', onLand.d >= onLand.r * 0.9, onLand.d.toFixed(2) + ' apart, radii ' + onLand.r.toFixed(2));
S.ok('...and off a gunboat on the water', onSea.d >= onSea.r * 0.9, onSea.d.toFixed(2) + ' apart, radii ' + onSea.r.toFixed(2));

/* ---------------- under it ---------------- */
var torp = g.RTS_WEAPONS[g.rtsUnitDef('sub').weapon];
S.ok('a torpedo cannot reach it', !!torp.seaOnly && !g._rtsWeaponReaches(torp, { type: 'unit', def: 'hovercraft' }), '');

require('../lib/report.js')(S);
