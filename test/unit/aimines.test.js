/* THE OPPONENT'S MINE LAYER (core/aimines.js), staged on a real generated map:

     THE FIELD     it is planned on the land route between the two yards, nine to eighteen cells
                   out from the opponent's, and every cell of it is open ground
     LAID          given a layer, the opponent drives it out and lays its mines on that field -
                   five, the whole load, and none anywhere else
     KEPT BACK     an attack the opponent launches never takes the layer along
     RELOADED      run dry, it goes home to its Repair Bay, loads, and goes back to finish the field
     ONE           the buy loop takes a Mine Layer while it has none - even with its army full, as
                   a layer is support, not army - and never a second */

var { Suite } = require('../lib/assert.js');
var { load } = require('../lib/sandbox.js');

var S = new Suite('aimines');
var g = load(['src/rules', 'src/core', 'src/sprites/props.js']);

function fresh() {
  g._rtsNewGame(9001, 'normal');
  var G = g.window._rtsG;
  G.over = null;
  G.ents.forEach(function (e) { if (e.type === 'unit') e.dead = true; });
  g._rtsTick(1 / 30);
  G.teams = {};
  return G;
}
function place(side, k) {
  var yd = g._rtsHas(side, 'yard');
  for (var r = 4; r < 30; r++) for (var a = 0; a < 8; a++) {
    var sp = g._rtsNearestOpen(yd.tx + Math.round(Math.cos(a) * r), yd.tz + Math.round(Math.sin(a) * r), 3, null);
    if (sp && g._rtsCanPlace(side, k, sp[0], sp[1], true)) return g._rtsPlaceStruct(side, k, sp[0], sp[1], true);
  }
  return null;
}
function run(secs, each) { for (var t = 0; t < secs * 30; t++) { if (each) each(); g._rtsTick(1 / 30); } }

/* ---------------- the field ---------------- */
var G = fresh(), ey = g._rtsHas('enemy', 'yard');
var spots = g._rtsAIMineSpots(G);
var out = spots.map(function (s) { return Math.hypot(g._rtsWX(s[0]) - ey.x, g._rtsWX(s[1]) - ey.z) / g.RTS_TILE; });
S.ok('the field is planned, on the route out from the opponent\'s yard', spots.length >= 10, spots.length + ' cells');
S.ok('...nine to eighteen cells out, a cell of slack either side', out.every(function (d) { return d >= g.RTS_AI_MINES.from - 2 && d <= g.RTS_AI_MINES.to + 2; }),
     Math.min.apply(null, out).toFixed(1) + ' to ' + Math.max.apply(null, out).toFixed(1));
S.ok('...and every cell of it open ground', spots.every(function (s) { return !g._rtsBlocked(s[0], s[1], null) && G.terrain[g._rtsIdx(s[0], s[1])] !== g.RTS_T_WATER; }), '');
/* asked while a yard is down, the plan is not cached empty for the rest of the match */
G.ai.mineSpots = null;
var py0 = g._rtsHas('player', 'yard'); py0.dead = true;
var noYard = g._rtsAIMineSpots(G).length; py0.dead = false;
var yardBack = g._rtsAIMineSpots(G).length;
S.ok('asked while the player\'s yard is down it plans nothing, and plans the field once the yard stands again', noYard === 0 && yardBack >= 10, noYard + ' then ' + yardBack);

/* ---------------- laid, and kept back ---------------- */
var bay = place('enemy', 'depot');
['apower', 'apower'].forEach(function (k) { place('enemy', k); });
g._rtsRecalcPower('enemy');
var ly = g._rtsSpawnUnit('enemy', 'minelayer', ey.x + g.RTS_TILE * 3, ey.z);
/* teams raised while it works - the opponent's attacks - must never take it */
G.ai.wave = 1;
var drafted = false;
run(90, function () {
  if (((G.t * 30) | 0) % 300 === 0) g._rtsAIAttack(1);
  if (ly.sqd != null) drafted = true;
});
function onField(m) { return spots.some(function (s) { return s[0] === m.tx && s[1] === m.tz; }); }
var mine = G.mines.filter(function (m) { return m.side === 'enemy'; });
S.ok('given a layer, the opponent lays its whole load', mine.length >= 5, mine.length + ' mines down');
S.ok('...on the field and nowhere else', mine.every(onField), mine.filter(function (m) { return !onField(m); }).length + ' off it');
var raisedTeams = Object.keys(G.teams || {}).length;
S.ok('the teams the opponent raises while it works never take the layer', raisedTeams > 0 && !drafted, raisedTeams + ' teams raised; layer ' + (drafted ? 'drafted' : 'never in one'));
/* ...and why: teams recruit by composition, and no composition the opponent can raise has a layer
   in it - asked of every type rather than of the three this run happened to raise */
var withLayer = g.RTS_TEAM_TYPES.filter(function (t) { return Object.keys(t.members).some(function (k) { return (g.rtsUnitDef(k) || {}).mines; }); });
S.ok('...because no team the opponent can raise has a layer in it', withLayer.length === 0, withLayer.map(function (t) { return t.name; }).join(', ') || 'none of ' + g.RTS_TEAM_TYPES.length);

/* ---------------- reloaded ---------------- */
var spotsLeft = spots.filter(function (s) { return !g._rtsMineAt(s[0], s[1]); }).length;
S.ok('...and with field still to lay, a second load goes down after the Repair Bay', spotsLeft > 0 && mine.length > 5,
     mine.length + ' mines, ' + spotsLeft + ' cells left, the bay ' + (bay ? 'standing' : 'missing'));

/* ---------------- no way there ---------------- */
/* a cell of the plan the layer cannot get to - walled in since the plan was made - is set aside
   for RTS_AI_MINES.retry and the rest of the field laid, where it once asked for that one route
   every second and laid nothing else for the rest of the match */
G = fresh(); ey = g._rtsHas('enemy', 'yard');
var sp3 = g._rtsAIMineSpots(G), shut = sp3[0];
for (var wz = -1; wz <= 1; wz++) for (var wx = -1; wx <= 1; wx++) if (wx || wz) G.blocked[g._rtsIdx(shut[0] + wx, shut[1] + wz)] = 1;
var ly3 = g._rtsSpawnUnit('enemy', 'minelayer', ey.x + g.RTS_TILE * 3, ey.z), asks = 0, path0 = g._rtsPath;
g._rtsPath = function (sx, sz, gx, gz) { if (g._rtsTX(gx) === shut[0] && g._rtsTX(gz) === shut[1]) asks++; return path0.apply(this, arguments); };
run(60);
g._rtsPath = path0;
var laid3 = G.mines.filter(function (mm) { return mm.side === 'enemy'; }).length;
S.ok('a cell of the plan walled in is asked for once and set aside, and the rest of the load goes down',
     sp3.length >= 5 && asks >= 1 && asks <= Math.ceil(60 / g.RTS_AI_MINES.retry) + 1 && laid3 >= 4 && !g._rtsMineAt(shut[0], shut[1]),
     asks + ' asks in 60 s, ' + laid3 + ' mines down, the walled cell ' + (g._rtsMineAt(shut[0], shut[1]) ? 'mined' : 'bare'));

/* ---------------- one ---------------- */
G = fresh();
['factory', 'radar', 'depot', 'apower', 'apower', 'apower'].forEach(function (k) { if (!g._rtsHas('enemy', k) || /power/.test(k)) place('enemy', k); });
for (var h = 0; h < 3; h++) g._rtsSpawnUnit('enemy', 'harvester', ey.x + h * 4, ey.z + 30);
g._rtsRecalcPower('enemy');
function buys(n) {
  var S2 = G.sides.enemy, got = 0;
  for (var r = 0; r < n; r++) { S2.q = {}; S2.credits = 1e6; S2.ore = 0; g._rtsAIUnits(S2); if (S2.q.vehicle && S2.q.vehicle.key === 'minelayer') got++; }
  return got;
}
/* an army at its size cap: everything but support is off the table */
var cap = g._rtsBias('enemy').army || 0;
for (var f = 0; f < cap + 2; f++) g._rtsSpawnUnit('enemy', 'tank', ey.x + (f % 8) * 3, ey.z + 34 + ((f / 8) | 0) * 3);
var none = buys(200);
/* ...out of surplus only: a credit short of what the plan is saving for plus its price, it waits */
var S3 = G.sides.enemy, need = g._rtsAISpare(S3) + g._rtsCostOf('enemy', g.rtsUnitDef('minelayer'));
S3.q = {}; S3.credits = need - 1; S3.ore = 0; g._rtsAIUnits(S3);
var shortBuy = !!(S3.q.vehicle && S3.q.vehicle.key === 'minelayer');
S.ok('...out of surplus only: a credit short of the plan\'s money and its price, it waits', !shortBuy, 'needs ' + need);
g._rtsSpawnUnit('enemy', 'minelayer', ey.x, ey.z + 20);
var one = buys(200);
S.ok('the buy loop takes a Mine Layer while it has none - with its army already full', cap > 0 && none > 5, none + ' of 200 rolls, the army at ' + (cap + 2) + ' against a cap of ' + cap);
S.ok('...and never a second', one === 0, one + ' of 200 rolls');
/* the cap counts fighters (core/ai.js): unarmed support bought outside the roll does not fill a
   fighter's place - with the layer in hand and the tanks at the cap, nothing is queued... */
var S4 = G.sides.enemy;
S4.q = {}; S4.credits = 1e6; S4.ore = 0; g._rtsAIUnits(S4);
var cappedQueue = Object.keys(S4.q).filter(function (k) { return k === 'vehicle' || k === 'infantry'; });
/* ...and with the tanks gone and as many sweepers in their place, the army is bought again */
G.ents.forEach(function (e) { if (!e.dead && e.side === 'enemy' && e.def === 'tank') e.dead = true; });
for (var sw = 0; sw < cap + 2; sw++) g._rtsSpawnUnit('enemy', 'sweeper', ey.x + (sw % 8) * 3, ey.z + 34 + ((sw / 8) | 0) * 3);
S4.q = {}; S4.credits = 1e6; S4.ore = 0; g._rtsAIUnits(S4);
var supportQueue = Object.keys(S4.q).filter(function (k) { return k === 'vehicle' || k === 'infantry'; });
S.ok('the army cap counts fighters: tanks at the cap stop the buying, as many unarmed sweepers do not', cappedQueue.length === 0 && supportQueue.length > 0,
     'at the cap: ' + (cappedQueue.join(',') || 'nothing') + '; sweepers instead: ' + (supportQueue.join(',') || 'nothing'));

require('../lib/report.js')(S);
