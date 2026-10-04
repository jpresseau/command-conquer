/* THE OPPONENT'S SEA RAID (core/aihover.js), staged on a real generated map:

     THE TARGET   a player harvester working by the water is a target, with a beach to land on
                  near it; one whose nearest beach is beyond reach is not, though the craft could
                  sail to it; of two by the water, the one with no guard
     BOUGHT       the buy loop takes a Hovercraft when there is something to raid - outside the
                  roll, after the Mine Layer - and not when there is nothing, and never a second
     THE CREW     armed infantry from home that no team has, rocket squads first - ahead of rifle
                  squads standing nearer - flagged so no team can take them; a squad already in
                  a team is left alone
     THE RAID     the craft takes them aboard, sails the WATER all the way down the coast - not
                  the land route a hovercraft could drive - lands them by the harvester, and the
                  harvester dies, not the power plant beside the beach; ashore no team can take
                  them, and one found shooting anything else is put back on a harvester; the craft
                  goes home to its own water
     RELEASED     with nothing left to raid, the raiders are the army's again */

var { Suite } = require('../lib/assert.js');
var { load } = require('../lib/sandbox.js');

var S = new Suite('aihover');
var g = load(['src/rules', 'src/core', 'src/sprites/props.js']);

function fresh() {
  g._rtsNewGame(776, 'normal');
  var G = g.window._rtsG;
  G.over = null;
  G.ents.forEach(function (e) { if (e.type === 'unit') e.dead = true; });
  g._rtsTick(1 / 30);
  G.teams = {};
  return G;
}
function run(secs, each) { for (var t = 0; t < secs * 30; t++) { if (each) each(); g._rtsTick(1 / 30); } }
var cell = function (e) { return [g._rtsTX(e.x), g._rtsTX(e.z)]; };
var cells = function (a, b) { return Math.hypot(a.x - b.x, a.z - b.z) / g.RTS_TILE; };
function place(side, k) {
  var yd = g._rtsHas(side, 'yard');
  for (var r = 4; r < 30; r++) for (var a = 0; a < 8; a++) {
    var sp = g._rtsNearestOpen(yd.tx + Math.round(Math.cos(a) * r), yd.tz + Math.round(Math.sin(a) * r), 3, null);
    if (sp && g._rtsCanPlace(side, k, sp[0], sp[1], true)) return g._rtsPlaceStruct(side, k, sp[0], sp[1], true);
  }
  return null;
}
/* Open shore on the player's half: land cells beside water, 8 to 30 cells from the player's yard. */
function shores(G) {
  var py = g._rtsHas('player', 'yard'), out = [];
  for (var tz = 2; tz < g.RTS_N - 2; tz++) for (var tx = 2; tx < g.RTS_N - 2; tx++) {
    if (g._rtsBlocked(tx, tz, null) || G.terrain[g._rtsIdx(tx, tz)] === g.RTS_T_WATER) continue;
    var d = Math.hypot(tx - py.tx, tz - py.tz);
    if (d < 8 || d > 30) continue;
    if (!g._rtsNearestOpen(tx, tz, 1, 'sea')) continue;
    out.push([tx, tz]);
  }
  return out;
}
/* a player harvester parked at a cell, held there */
function harvAt(c) {
  var h = g._rtsSpawnUnit('player', 'harvester', g._rtsWX(c[0]), g._rtsWX(c[1]));
  h.order = 'hold'; h.hstate = null;
  return h;
}
/* every player unit pinned where it stands - the player is a statue in these stagings */
function pin() {
  g.window._rtsG.ents.forEach(function (e) {
    if (e.side === 'player' && e.type === 'unit' && !e.dead) { e.order = 'hold'; e.path = null; e.hstate = null; }
  });
}

/* ---------------- the target ---------------- */
var G = fresh(), shore = shores(G);
S.ok('the staging: open shore on the player\'s half of the map', shore.length > 20, shore.length + ' cells');
/* two harvesters by the water, far apart; tanks beside the first */
var a = shore[0], b = null;
for (var i = 1; i < shore.length && !b; i++) if (Math.hypot(shore[i][0] - a[0], shore[i][1] - a[1]) > 14) b = shore[i];
var hA = harvAt(a), hB = harvAt(b);
for (var k = 0; k < 3; k++) g._rtsSpawnUnit('player', 'tank', hA.x + (k - 1) * 6, hA.z + 6);
G.ai.hovQ = null;
var q = g._rtsAIHoverTarget();
S.ok('a harvester by the water is a target, with a beach near it', !!q && cells(q.beach, q.h) <= g.RTS_AI_HOVER.near, q ? cells(q.beach, q.h).toFixed(1) + ' cells' : 'none');
S.ok('...and of two by the water, the one with no guard', !!q && q.h === hB, q ? (q.h === hA ? 'the guarded one' : 'the unguarded one') : 'none');
/* inland: a harvester whose nearest beach - one the craft can sail to - is a few cells too far */
G = fresh();
var py = g._rtsHas('player', 'yard'), far = null, farD = 0, NEAR = g.RTS_AI_HOVER.near;
for (var tz = 2; tz < g.RTS_N - 2 && !far; tz++) for (var tx = 2; tx < g.RTS_N - 2 && !far; tx++) {
  if (Math.hypot(tx - py.tx, tz - py.tz) > 40 || g._rtsBlocked(tx, tz, null)) continue;
  if (g._rtsNearestOpen(tx, tz, NEAR + 3, 'sea') || !g._rtsNearestOpen(tx, tz, NEAR + 8, 'sea')) continue;
  var spot = { x: g._rtsWX(tx), z: g._rtsWX(tz) }, bch = g._rtsLandingSpot(spot);
  if (!bch || cells(bch, spot) <= NEAR + 1) continue;
  var bw = g._rtsNearestOpen(g._rtsTX(bch.x), g._rtsTX(bch.z), g.RTS_UNLOAD_REACH, 'sea');
  if (bw && g._rtsAIHoverSails(G, bw)) { far = [tx, tz]; farD = cells(bch, spot); }
}
harvAt(far);
G.ai.hovQ = null;
S.ok('one whose nearest beach is beyond reach is not, though the craft could sail there', !!far && !g._rtsAIHoverTarget(),
     far ? 'beach ' + farD.toFixed(1) + ' cells off, against ' + NEAR : 'no such cell found');

/* ---------------- bought ---------------- */
function buys(n) {
  var S2 = G.sides.enemy, got = 0;
  for (var r = 0; r < n; r++) { S2.q = {}; S2.credits = 1e6; S2.ore = 0; g._rtsAIUnits(S2); if (S2.q.vehicle && S2.q.vehicle.key === 'hovercraft') got++; }
  return got;
}
['factory', 'radar', 'depot', 'apower', 'apower', 'apower'].forEach(function (k) { if (!g._rtsHas('enemy', k) || /power/.test(k)) place('enemy', k); });
var ey = g._rtsHas('enemy', 'yard');
for (var hv = 0; hv < 3; hv++) g._rtsSpawnUnit('enemy', 'harvester', ey.x + hv * 4, ey.z + 30);
g._rtsSpawnUnit('enemy', 'minelayer', ey.x, ey.z + 24);           /* the Mine Layer comes first */
g._rtsRecalcPower('enemy');
G.ai.hovQ = null;
var nothing = buys(50);
G = g.window._rtsG;
harvAt(shore[0]);
G.ai.hovQ = null;
var some = buys(50);
g._rtsSpawnUnit('enemy', 'hovercraft', ey.x, ey.z + 20);
var second = buys(50);
S.ok('nothing to raid: no Hovercraft bought', nothing === 0, nothing + ' of 50');
S.ok('something to raid: the buy loop takes one', some > 5, some + ' of 50');
S.ok('...and never a second', second === 0, second + ' of 50');

/* ---------------- the crew and the raid ---------------- */
G = fresh();
ey = g._rtsHas('enemy', 'yard');
var prey = harvAt(b);
/* a power plant beside it, nearer the beach: the raid came for the harvester */
var plant = null;
for (var pr = 2; pr < 8 && !plant; pr++) for (var pa = 0; pa < 8 && !plant; pa++) {
  var px = b[0] + Math.round(Math.cos(pa * Math.PI / 4) * pr), pz = b[1] + Math.round(Math.sin(pa * Math.PI / 4) * pr);
  if (g._rtsCanPlace('player', 'power', px, pz, true)) plant = g._rtsPlaceStruct('player', 'power', px, pz, true);
}
var hc = g._rtsSpawnUnit('enemy', 'hovercraft', ey.x + g.RTS_TILE * 3, ey.z);
/* four rifle squads nearest the craft, and the rocket squads furthest from it */
var crewKeys = ['rifle', 'rifle', 'rifle', 'rifle', 'rocket', 'rocket'], inf = crewKeys.map(function (kk, n) {
  return g._rtsSpawnUnit('enemy', kk, ey.x + g.RTS_TILE * (2 + n % 3), ey.z + g.RTS_TILE * (2 + (n / 3 | 0)));
});
/* one rocket squad already in a team: not the raid's to take */
var team = g._rtsTeamMake(g.RTS_TEAM_TYPES[0]); g._rtsTeamAdd(team, inf[4]);
G.ai.hov = { s: 'rest', t: -1e3, crew: [] };
var ashoreShut = null, sailCells = [], landed = null, lastS = null, L = null, atLaunch = null, raiders = [];
run(150, function () {
  pin();
  var s = G.ai.hov.s;
  /* who went aboard, read as the craft leaves */
  if (s === 'launch' && lastS === 'crew') atLaunch = { keys: (hc.cargo || []).map(function (u) { return u.def; }), teamed: inf[4].sqd === team.id && (hc.cargo || []).indexOf(inf[4]) < 0,
    shut: (hc.cargo || []).every(function (u) { return u.raid && !g._rtsTeamCanAdd(team, u); }), n: (hc.cargo || []).length };
  if (landed && !raiders.length && G.t > landed.t + 1) {
    raiders = G.ents.filter(function (e) { return !e.dead && e.raid; });
    /* ashore, a team that wants exactly these squads still cannot have them */
    var sk = g._rtsTeamMake(g.RTS_TEAM_TYPES.filter(function (ty) { return ty.name === 'Skirmish'; })[0]);
    ashoreShut = raiders.every(function (u) { return !u.inside && !g._rtsTeamCanAdd(sk, u); });
    g._rtsTeamDisband(sk);
  }
  if (s === 'sail') sailCells.push(cell(hc));
  if (lastS === 'sail' && s === 'rest' && !landed) landed = { t: G.t, x: hc.x, z: hc.z };
  lastS = s;
});
L = G.ai.hovLaunch;
S.ok('the crew: four aboard, the rocket squad no team has among them though it stood furthest off', !!atLaunch && atLaunch.n === 4 &&
     atLaunch.keys.filter(function (kk) { return kk === 'rocket'; }).length === 1 && atLaunch.keys.indexOf('rocket') >= 0, atLaunch ? atLaunch.keys.join(', ') : 'never launched');
S.ok('...and the squad in a team left alone', !!atLaunch && atLaunch.teamed, '');
S.ok('...and no team can take a raider', !!atLaunch && atLaunch.shut, '');
var wet = sailCells.filter(function (c) { return G.terrain[g._rtsIdx(c[0], c[1])] === g.RTS_T_WATER; }).length;
S.ok('the craft sails the water down the coast, not the land route', sailCells.length > 30 && wet >= sailCells.length * 0.85,
     wet + ' of ' + sailCells.length + ' sailing samples on water');
S.ok('...lands the crew by the harvester', !!landed && cells(landed, prey) <= g.RTS_AI_HOVER.near + 2, landed ? cells(landed, prey).toFixed(1) + ' cells from it' : 'never landed');
S.ok('...and the harvester dies - not the power plant beside the beach', prey.dead && !!plant && !plant.dead && plant.hp === plant.maxHp,
     (prey.dead ? 'harvester dead' : prey.hp + ' hp left') + ', plant ' + (plant ? plant.hp + ' of ' + plant.maxHp : 'not placed'));
S.ok('...and ashore, no team can take a raider', raiders.length > 0 && ashoreShut === true, raiders.length + ' raiders');
S.ok('...and the craft goes home to its own water', !!L && cells(hc, L) < 4, L ? cells(hc, L).toFixed(1) + ' cells from home' : '');

/* a raider found shooting something else - the plant - is put back on a harvester */
var prey2 = harvAt(b), stray = g._rtsSpawnUnit('enemy', 'rocket', prey2.x + g.RTS_TILE * 2, prey2.z);
stray.raid = 1; G.ai.hov.crew.push(stray.id);
g._rtsOrderAttack(stray, plant);
run(1.5, pin);
S.ok('a raider found shooting anything else is put back on a harvester', stray.target === prey2, 'on ' + (stray.target ? stray.target.def : 'nothing'));

/* ---------------- released ---------------- */
G.ents.forEach(function (e) { if (e.side === 'player' && (e.def === 'refinery' || (g.rtsUnitDef(e.def) || {}).harvest)) e.dead = true; });
run(3, pin);
var still = G.ents.filter(function (e) { return !e.dead && e.raid; }).length;
S.ok('with nothing left to raid, the raiders are the army\'s again', raiders.length > 0 && still === 0, raiders.length + ' raided, ' + still + ' still flagged');

require('../lib/report.js')(S);
