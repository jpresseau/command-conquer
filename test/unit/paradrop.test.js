/* THE PARADROP PLANE (rules/units.js `paraplane`, core/paradrop.js):

     IN THE AIR    left idle it never sets down, where a Skylift does; squads board it as it waits
     THE DROP      sent twenty cells off, it puts its squads down within a few cells of the drop
                   zone without landing; each comes down under a canopy and does nothing until it
                   is down - not move, not fire - and then fights; the plane goes home to its
                   Airfield
     ON THE WAY DOWN a move clicked while a man falls is followed once he lands; U (unload here
                   and now) puts the men out under canopies and sends the plane home, and so does
                   the opponent's timed-out drop; a loaded plane right-clicked onto an enemy
                   building is sent to drop there, not to hover over it
     WHOSE         the Dominion builds it, behind an Airfield; the Compact does not
     THE OPPONENT  buys one once the player has dug in and its own base is defended, not before;
                   crews it, aims it at the player's least-guarded power plant, drops the squads
                   beside it, and they go for it */

var { Suite } = require('../lib/assert.js');
var { load } = require('../lib/sandbox.js');

var S = new Suite('paradrop');
var g = load(['src/rules', 'src/ui', 'src/core', 'src/sprites/props.js']);

function fresh(army) {
  g.window._RTS_ARMY = army || 'soviet';
  g._rtsNewGame(4242, 'easy');
  var G = g.window._rtsG;
  G.over = null;
  G.ents.forEach(function (e) { if (e.type === 'unit') e.dead = true; });
  g._rtsTick(1 / 30);
  G.teams = {};
  return G;
}
function run(secs, each) { for (var t = 0; t < secs * 30; t++) { if (each) each(); g._rtsTick(1 / 30); } }
function place(side, k) {
  var yd = g._rtsHas(side, 'yard');
  for (var r = 4; r < 30; r++) for (var a = 0; a < 8; a++) {
    var sp = g._rtsNearestOpen(yd.tx + Math.round(Math.cos(a) * r), yd.tz + Math.round(Math.sin(a) * r), 3, null);
    if (sp && g._rtsCanPlace(side, k, sp[0], sp[1], true)) { var b = g._rtsPlaceStruct(side, k, sp[0], sp[1], true); if (b) b.building = 0; return b; }
  }
  return null;
}
var cells = function (a, b) { return Math.hypot(a.x - b.x, a.z - b.z) / g.RTS_TILE; };

/* ---------------- in the air ---------------- */
var G = fresh(), pad = place('player', 'afld'), yd = g._rtsHas('player', 'yard');
/* both over open ground - over a building anything hovers */
var og = g._rtsNearestOpen(g._rtsTX(pad.x) + 6, g._rtsTX(pad.z) + 6, 6, null), og2 = g._rtsNearestOpen(g._rtsTX(pad.x) + 12, g._rtsTX(pad.z) - 6, 6, null);
var pl = g._rtsSpawnUnit('player', 'paraplane', g._rtsWX(og[0]), g._rtsWX(og[1])), lift = g._rtsSpawnUnit('player', 'tran', g._rtsWX(og2[0]), g._rtsWX(og2[1]));
var men = [0, 1, 2, 3].map(function (i) { return g._rtsSpawnUnit('player', i % 2 ? 'rocket' : 'rifle', pl.x - 6 + i * 2, pl.z + 6); });
men.forEach(function (u) { g._rtsOrderBoard(u, pl); });
var lowest = 99;
run(15, function () { lowest = Math.min(lowest, g._rtsAirLift(pl)); });
S.ok('left idle it never sets down, where a Skylift does', lowest >= 10 && (lift.land || 0) > 0.9, 'plane at least ' + lowest.toFixed(1) + ' up; Skylift down ' + ((lift.land || 0) * 100).toFixed(0) + '%');
S.ok('...and squads board it as it waits', pl.cargo && pl.cargo.length === 4, (pl.cargo || []).length + ' aboard');

/* ---------------- the drop ---------------- */
var dz = g._rtsNearestOpen(g._rtsTX(pl.x) + 20, g._rtsTX(pl.z), 6, null), DZ = { x: g._rtsWX(dz[0]), z: g._rtsWX(dz[1]) };
g._rtsOrderUnloadAt(pl, DZ.x, DZ.z);
var bait = null, jumped = null, lowAtDrop = 99, chuted = 0, movedFalling = 0, firedFalling = 0, at = {}, fell = {};
run(20, function () {
  if (!jumped && pl.cargo && !pl.cargo.length) {
    jumped = G.t; lowAtDrop = g._rtsAirLift(pl);
    men.forEach(function (u) { if (u.chute > 0) chuted++; at[u.id] = { x: u.x, z: u.z }; });
    /* an enemy tank right beside them, to tempt a falling man */
    var c = men[0]; bait = g._rtsSpawnUnit('enemy', 'light', c.x + 6, c.z);
  } else if (jumped) men.forEach(function (u) {
    if (u.chute > 0) { fell[u.id] = (fell[u.id] || 0) + 1; if (at[u.id] && Math.hypot(u.x - at[u.id].x, u.z - at[u.id].z) > 0.01) movedFalling++; if (u.fire > 0) firedFalling++; }
  });
});
var spread = Math.max.apply(null, men.map(function (u) { return cells(u, DZ); }));
S.ok('sent twenty cells off, it puts its squads down within a few cells of the drop zone', !!jumped && men.every(function (u) { return !u.inside; }) && spread <= 4,
     jumped ? 'farthest ' + spread.toFixed(1) + ' cells from the drop zone' : 'never dropped');
S.ok('...without landing', lowAtDrop >= 10, lowAtDrop.toFixed(1) + ' up at the drop');
var shortest = Math.min.apply(null, men.map(function (u) { return fell[u.id] || 0; }));
S.ok('...each comes down under a canopy for about a second, and neither moves nor fires on the way', chuted === 4 && shortest >= 30 && movedFalling === 0 && firedFalling === 0,
     chuted + ' canopies, the shortest ' + shortest + ' frames; moved ' + movedFalling + ', fired ' + firedFalling);
S.ok('...and then fights: the tank beside them is hit', !!bait && (bait.dead || bait.hp < bait.maxHp), bait ? (bait.dead ? 'destroyed' : bait.hp + ' of ' + bait.maxHp) : 'no tank');
S.ok('...and the plane goes home to its Airfield', cells(pl, pad) < 3, cells(pl, pad).toFixed(1) + ' cells from it');

/* ---------------- on the way down ---------------- */
G = fresh(); pad = place('player', 'afld');
var og3 = g._rtsNearestOpen(g._rtsTX(pad.x) + 6, g._rtsTX(pad.z) + 6, 6, null);
var pl3 = g._rtsSpawnUnit('player', 'paraplane', g._rtsWX(og3[0]), g._rtsWX(og3[1]));
var men3 = [0, 1].map(function (i) { return g._rtsSpawnUnit('player', 'rifle', pl3.x - 4 + i * 2, pl3.z + 6); });
men3.forEach(function (u) { g._rtsBoard(u, pl3); });
var dz3 = g._rtsNearestOpen(g._rtsTX(pl3.x) + 16, g._rtsTX(pl3.z), 6, null), DZ3 = { x: g._rtsWX(dz3[0]), z: g._rtsWX(dz3[1]) };
var far3 = g._rtsNearestOpen(dz3[0] + 8, dz3[1], 6, null), FAR = { x: g._rtsWX(far3[0]), z: g._rtsWX(far3[1]) };
g._rtsOrderUnloadAt(pl3, DZ3.x, DZ3.z);
var clicked = false, landedAt = null;
run(30, function () {
  var m0 = men3[0];
  if (!clicked && m0.chute > 0) { clicked = true; g._rtsOrderMove(m0, FAR.x, FAR.z, false); }
  if (clicked && landedAt === null && !(m0.chute > 0)) landedAt = { x: m0.x, z: m0.z };
});
S.ok('a move clicked while a man falls is followed once he lands', clicked && landedAt && cells(men3[0], FAR) < 2 && cells(landedAt, FAR) > 4,
     clicked ? 'landed ' + (landedAt ? cells(landedAt, FAR).toFixed(1) : '-') + ' cells from the spot, ended ' + cells(men3[0], FAR).toFixed(1) : 'never saw him under the canopy');
/* U: here and now */
G = fresh(); pad = place('player', 'afld');
var og4 = g._rtsNearestOpen(g._rtsTX(pad.x) + 14, g._rtsTX(pad.z) + 6, 6, null);
var pl4 = g._rtsSpawnUnit('player', 'paraplane', g._rtsWX(og4[0]), g._rtsWX(og4[1]));
var men4 = [0, 1, 2].map(function (i) { return g._rtsSpawnUnit('player', 'rifle', pl4.x - 4 + i * 2, pl4.z + 6); });
men4.forEach(function (u) { g._rtsBoard(u, pl4); });
run(6, function () { pl4.order = null; pl4.path = null; });
var out4 = g._rtsUnloadNow(pl4), chutes4 = men4.filter(function (u) { return u.chute > 0; }).length;
run(8);
S.ok('U puts the men out under canopies and sends the plane home', out4 === 3 && chutes4 === 3 && cells(pl4, pad) < 3, out4 + ' out, ' + chutes4 + ' canopies; the plane ' + cells(pl4, pad).toFixed(1) + ' cells from its field');
var keysSrc = require('fs').readFileSync(require('path').join(__dirname, '../../src/ui/keys.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
S.ok('...and the U key goes through it', /_rtsUnloadNow\(t\)/.test(keysSrc) && !/out \+= _rtsUnload\(t\)/.test(keysSrc), '');
/* the opponent's timed-out drop */
G = fresh('allied');
var ey4 = g._rtsHas('enemy', 'yard'), epl4 = g._rtsSpawnUnit('enemy', 'paraplane', ey4.x, ey4.z + 30);
var emen = [0, 1].map(function (i) { return g._rtsSpawnUnit('enemy', 'rifle', epl4.x + i * 2, epl4.z + 4); });
emen.forEach(function (u) { g._rtsBoard(u, epl4); });
G.ai.para = { s: 'fly', t: G.t - g.RTS_PARA.fly - 1, crew: [], aim: null };
G.ai.paraT = g.RTS_PARA.every;
g._rtsAIParaTick(1 / 30);
S.ok('...and so does the opponent\'s timed-out drop', emen.every(function (u) { return !u.inside && u.chute > 0; }) && G.ai.para.s === 'rest', emen.map(function (u) { return (u.inside ? 'aboard' : 'out') + '/' + (u.chute > 0 ? 'canopy' : 'no canopy'); }).join(' '));
/* right-clicked onto an enemy building */
G = fresh(); pad = place('player', 'afld');
var og5 = g._rtsNearestOpen(g._rtsTX(pad.x) + 6, g._rtsTX(pad.z) + 6, 6, null);
var pl5 = g._rtsSpawnUnit('player', 'paraplane', g._rtsWX(og5[0]), g._rtsWX(og5[1]));
g._rtsBoard(g._rtsSpawnUnit('player', 'rifle', pl5.x, pl5.z + 6), pl5);
var eyd5 = g._rtsHas('enemy', 'yard');
G.sel = [pl5]; g.window._rtsUI = g.window._rtsUI || {}; g.window._rtsUI.place = null;
g._rtsRightClick(0, 0, { ent: eyd5, x: eyd5.x, z: eyd5.z });
S.ok('a loaded plane right-clicked onto an enemy building is sent to drop there, not to hover over it', pl5.order === 'unload' && pl5.goal && cells(pl5.goal, eyd5) < 4,
     'order ' + pl5.order + (pl5.goal ? ', goal ' + cells(pl5.goal, eyd5).toFixed(1) + ' cells from the building' : ''));

/* ---------------- whose ---------------- */
function canBuild(army) {
  fresh(army);
  ['power', 'power', 'refinery', 'radar', 'afld'].forEach(function (k) { place('player', k); });
  g._rtsRecalcPower('player');
  return !!g._rtsCanQueue('player', 'paraplane');
}
S.ok('the Dominion builds it behind an Airfield; the Compact does not', canBuild('soviet') && !canBuild('allied'), '');

/* ---------------- the opponent ---------------- */
G = fresh('allied');                                                /* the opponent is the Dominion */
['factory', 'radar', 'depot', 'apower', 'apower', 'apower', 'afld'].forEach(function (k) { if (!g._rtsHas('enemy', k) || /power/.test(k)) place('enemy', k); });
var ey = g._rtsHas('enemy', 'yard');
for (var hv = 0; hv < 3; hv++) g._rtsSpawnUnit('enemy', 'harvester', ey.x + hv * 4, ey.z + 30);
g._rtsSpawnUnit('enemy', 'minelayer', ey.x, ey.z + 24);
g._rtsRecalcPower('enemy');
G.ai.hovQ = { t: 1e9, v: null };
function buys(n) {
  var S2 = G.sides.enemy, got = 0;
  for (var r = 0; r < n; r++) { S2.q = {}; S2.credits = 1e6; S2.ore = 0; g._rtsAIUnits(S2); if (S2.q.air && S2.q.air.key === 'paraplane') got++; }
  return got;
}
place('player', 'power');                                           /* a second plant to choose between */
var towers = [];
for (var df = 0; df < 4; df++) towers.push(place('enemy', 'flametower'));
var notDug = buys(20);                                               /* its own base defended, the player not dug in */
['pillbox', 'pillbox'].forEach(function (k) { place('player', k); });
var both = buys(20);
towers.forEach(function (t) { if (t) t.dead = true; });
g._rtsTick(1 / 30);
var undefended = buys(20);                                           /* the player dug in, its own base not defended */
for (var df2 = 0; df2 < 4; df2++) place('enemy', 'flametower');
S.ok('the opponent buys none before the player has dug in', notDug === 0, notDug + ' of 20');
S.ok('...nor while its own base is undefended', undefended === 0, undefended + ' of 20');
S.ok('...and one once both', both > 3, both + ' of 20');
/* one plant ringed with guns: the other is the least guarded */
var plants = G.ents.filter(function (b) { return !b.dead && b.side === 'player' && b.type === 'struct' && (g.rtsStructDef(b.def) || {}).power > 0; });
var guarded = plants[plants.length - 1];
for (var gq = 0; gq < 3; gq++) {
  var gc = g._rtsNearestOpen(guarded.tx + 3 + gq, guarded.tz - 2 + gq * 2, 4, null);
  if (gc && g._rtsCanPlace('player', 'pillbox', gc[0], gc[1], true)) { var pb = g._rtsPlaceStruct('player', 'pillbox', gc[0], gc[1], true); if (pb) pb.building = 0; }
}
/* the drop itself */
var epl = g._rtsSpawnUnit('enemy', 'paraplane', ey.x, ey.z);
for (var k2 = 0; k2 < 5; k2++) g._rtsSpawnUnit('enemy', k2 % 2 ? 'rifle' : 'rocket', ey.x + 6 + k2 * 2, ey.z + 6);
G.ai.para = { s: 'rest', t: -1e3, crew: [] };
/* the first drop: where it lands against what it was aimed at, and what that did */
var landed = null, aim = null, aim0 = 0, guardOk = null, lastS = 'rest';
run(150, function () {
  G.ents.forEach(function (e) { if (e.side === 'player' && e.type === 'unit') e.dead = true; });
  var st = G.ai.para;
  if (st.s === 'fly' && lastS !== 'fly' && !aim) {
    aim = st.aim; aim0 = aim.hp;
    /* the least guarded of the player's power plants, asked the moment it chose */
    var plants = G.ents.filter(function (b) { return !b.dead && b.side === 'player' && b.type === 'struct' && (g.rtsStructDef(b.def) || {}).power > 0; });
    var least = Math.min.apply(null, plants.map(function (b) { return g._rtsGuardsNear(b, g.RTS_RAID_GUARD_R); }));
    guardOk = plants.length > 1 && aim !== guarded && g._rtsGuardsNear(aim, g.RTS_RAID_GUARD_R) === least && g._rtsGuardsNear(guarded, g.RTS_RAID_GUARD_R) > least;
  }
  if (aim && landed === null && st.s === 'rest') {
    var on = st.crew.map(function (id) { return G.byId[id]; }).filter(function (u) { return u && !u.inside; });
    if (on.length) landed = Math.min.apply(null, on.map(function (u) { return cells(u, aim); }));
  }
  lastS = st.s;
});
S.ok('...crews it and aims it at the player\'s least-guarded power plant', guardOk === true, String(guardOk));
S.ok('...drops the squads beside it', landed !== null && landed <= 5, landed !== null ? 'nearest ' + landed.toFixed(1) + ' cells from it' : 'never dropped');
S.ok('...and they go for it', !!aim && (aim.dead || aim.hp < aim0), aim ? (aim.dead ? 'destroyed' : aim.hp + ' of ' + aim0) : 'no aim');

require('../lib/report.js')(S);
