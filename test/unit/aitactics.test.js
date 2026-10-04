/* THE OPPONENT'S NEW HABITS - the SYNC mission (core/missions.js), the trip to the depot
   (core/aimend.js) and the raiders' choice of harvester (core/teams.js). On a real generated
   battle, the teams built by hand so each case is the case it claims to be:

     SYNC     a team at its staging point holds while another team is still on its way to its
              own, both go in on the same tick once it arrives, a team with no partner on the
              way does not wait at all, and none waits longer than RTS_SYNC_WAIT
     SCRIPT   the front and the flank both carry the sync, before they attack
     MEND     a battered tank with a powered depot to go to leaves its team for the pad, is not
              recruited on the way, and is sent back out once mended; a suicide team's tank
              does not turn round; no depot, or no power, no trip - and losing the depot calls
              a trip off
     RAID     of two harvesters the raiders go for the one left alone, not the one beside the
              player's tanks - even when the guarded one is nearer */

var { Suite } = require('../lib/assert.js');
var { load } = require('../lib/sandbox.js');

var S = new Suite('aitactics');
var g = load(['src/rules', 'src/core', 'src/sprites/props.js']);

function fresh() {
  g._rtsNewGame(4242, 'easy');
  var G = g.window._rtsG;
  G.teams = {}; G.teamSeq = 0; G.teamHold = {};
  return G;
}
function type(name) { return g.RTS_TEAM_TYPES.filter(function (t) { return t.name === name; })[0]; }
function team(G, name, def, n, x, z) {
  var t = g._rtsTeamMake(type(name));
  for (var i = 0; i < n; i++) { var u = g._rtsSpawnUnit('enemy', def, x + i * 3, z); g._rtsTeamAdd(t, u); u.init = true; }
  t.hasBeen = true; t.zone = { x: x, z: z };
  return t;
}
function syncIndex(t) { return t.type.missions.map(function (m) { return m[0]; }).indexOf('sync'); }

/* SCRIPT */
var A = type('Assault'), SP = type('Sappers');
var sa = A.missions.map(function (m) { return m[0]; }), ss = SP.missions.map(function (m) { return m[0]; });
S.ok('the front and the flank both stage and sync before they attack', sa.indexOf('sync') === 1 && sa.indexOf('attack') === 2 &&
     ss.indexOf('sync') === 1 && ss.indexOf('attack') === 2, sa.join(',') + ' | ' + ss.join(','));
S.ok('...and the sync is at the waypoint each one stages at', A.missions[1][1] === A.missions[0][1] && SP.missions[1][1] === SP.missions[0][1]);

/* SYNC */
var G = fresh();
var front = team(G, 'Assault', 'tank', 3, 0, 0), flank = team(G, 'Sappers', 'rocket', 3, 40, 40);
front.cur = syncIndex(front); flank.cur = 0;               /* the flank is still on its way */
var t0 = G.t, held = 0;
for (var s = 0; s < 10; s++) { G.t += 0.5; g._rtsTeamDoMission(front, 0.5); if (front.cur === syncIndex(front)) held++; }
S.ok('at its staging point the front holds while the flank is still on its way', held === 10, held + ' of 10 ticks held');
flank.cur = syncIndex(flank);                                /* the flank arrives */
g._rtsTeamDoMission(front, 0.5); g._rtsTeamDoMission(flank, 0.5);
S.ok('...and once the flank is in place both go in on the same tick', front.cur > syncIndex(front) && flank.cur > syncIndex(flank) && front.synced === flank.synced,
     'front at ' + front.cur + ', flank at ' + flank.cur);

G = fresh();
var lone = team(G, 'Assault', 'tank', 3, 0, 0);
lone.cur = syncIndex(lone);
g._rtsTeamDoMission(lone, 0.5);
S.ok('a team with no partner on the way does not wait at all', lone.cur > syncIndex(lone), 'at ' + lone.cur);

G = fresh();
var waiter = team(G, 'Assault', 'tank', 3, 0, 0), slow = team(G, 'Sappers', 'rocket', 3, 40, 40);
waiter.cur = syncIndex(waiter); slow.cur = 0;
var waited = 0;
while (waiter.cur === syncIndex(waiter) && waited < 200) { G.t += 1; waited++; g._rtsTeamDoMission(waiter, 1); }
S.ok('...and none waits longer than RTS_SYNC_WAIT for a partner that never comes', waited > g.RTS_SYNC_WAIT - 2 && waited <= g.RTS_SYNC_WAIT + 2,
     'waited ' + waited + 's of ' + g.RTS_SYNC_WAIT);
/* a partner that has not filled yet is not marching, and is not waited for */
G = fresh();
var ready = team(G, 'Assault', 'tank', 3, 0, 0), forming = team(G, 'Sappers', 'rocket', 1, 40, 40);
forming.hasBeen = false; ready.cur = syncIndex(ready);
g._rtsTeamDoMission(ready, 0.5);
S.ok('...nor for a team still forming at home', ready.cur > syncIndex(ready));

/* ...AND IN A MATCH: the opponent left to raise its own teams, nothing hand-fed - the front
   and the flank are released together */
G = fresh();
var released = {};
for (var tk = 0; tk < 15 * 60 * 6 && !(released.Assault && released.Sappers); tk++) {
  g._rtsTick(1 / 15);
  for (var tid in G.teams) { var tt = G.teams[tid]; if (tt.synced && !released[tt.type.name]) released[tt.type.name] = tt.synced; }
}
S.ok('in a match the opponent sends its front and its flank in together', !!released.Assault && released.Assault === released.Sappers,
     JSON.stringify(released) + ' at ' + Math.round(G.t) + 's');

/* MEND */
function withDepot(G) {
  var home = G.ents.filter(function (e) { return e.side === 'enemy' && e.type === 'struct' && !e.dead; })[0];
  var d = { id: G.nextId++, type: 'struct', side: 'enemy', def: 'depot', tx: home.tx + 6, tz: home.tz + (home.tz > g.RTS_N / 2 ? -8 : 8), hp: 700, maxHp: 700, dead: false, building: false };
  d.x = g._rtsWX(d.tx) + g.RTS_TILE / 2; d.z = g._rtsWX(d.tz) + g.RTS_TILE / 2;
  G.ents.push(d); G.byId[d.id] = d;
  return d;
}
G = fresh();
var dep = withDepot(G);
g._rtsPowerFactor = function () { return 1; };
/* out in the open, on ground the pathfinder can route from */
var open = g._rtsNearestOpen(dep.tx + 4, dep.tz + (dep.tz > g.RTS_N / 2 ? -22 : 22), 20), ox = g._rtsWX(open[0]), oz = g._rtsWX(open[1]);
var sq = team(G, 'Sappers', 'tank', 2, ox, oz), hurt = sq.members[0], fine = sq.members[1];
hurt.hp = hurt.maxHp * 0.2;
G.mendT = 0; g._rtsAIMendTick(1);
S.ok('a battered tank with a depot to go to leaves its team for the pad', hurt.mend === dep.id && hurt.sqd == null && sq.members.indexOf(hurt) < 0 &&
     hurt.order === 'move' && !!hurt.goal, 'mend ' + hurt.mend + ', team ' + hurt.sqd + ', order ' + hurt.order);
S.ok('...heading for the depot', !!hurt.goal && Math.hypot(hurt.goal.x - dep.x, hurt.goal.z - dep.z) < Math.hypot(hurt.x - dep.x, hurt.z - dep.z) / 3,
     hurt.goal ? Math.round(Math.hypot(hurt.goal.x - dep.x, hurt.goal.z - dep.z)) + ' from the depot, the tank ' + Math.round(Math.hypot(hurt.x - dep.x, hurt.z - dep.z)) : 'no goal');
S.ok('...while the sound one stays where it is', fine.mend == null && fine.sqd === sq.id);
/* an Assault team wants tanks - so it is the trip, and nothing else, that keeps this one out */
var t2 = g._rtsTeamMake(type('Assault'));
var wouldTake = (function () { var m = hurt.mend; hurt.mend = null; var r = g._rtsTeamCanAdd(t2, hurt); hurt.mend = m; return r; })();
S.ok('...and nobody recruits it on the way - a team that wants tanks would take it otherwise', wouldTake === true &&
     g._rtsTeamCanAdd(t2, hurt) === false && g._rtsEscortable(hurt) === false);
hurt.hp = hurt.maxHp * 0.97; G.mendT = 0; g._rtsAIMendTick(1);
S.ok('once mended it is sent back out, free to be recruited again', hurt.mend == null && hurt.order == null && g._rtsTeamCanAdd(t2, hurt) === true);
/* a suicide team's tank, and no depot */
var sui = team(G, 'Assault', 'tank', 1, ox + 8, oz + 8);
sui.members[0].hp = sui.members[0].maxHp * 0.1; G.mendT = 0; g._rtsAIMendTick(1);
S.ok('a suicide team\'s tank does not turn round', sui.members.length === 1 && sui.members[0].mend == null);
hurt.hp = hurt.maxHp * 0.2; G.mendT = 0; g._rtsAIMendTick(1);
var onTrip = hurt.mend === dep.id;
dep.dead = true; G.mendT = 0; g._rtsAIMendTick(1);
S.ok('losing the depot calls a trip off', onTrip && hurt.mend == null, 'on the trip ' + onTrip + ', after ' + hurt.mend);
G = fresh();
var nod = team(G, 'Sappers', 'tank', 1, 30, 30), nodU = nod.members[0];
nodU.hp = nodU.maxHp * 0.1; G.mendT = 0; g._rtsAIMendTick(1);
S.ok('with no depot there is no trip', nodU.mend == null && nod.members.length === 1);
var dep2 = withDepot(G);
g._rtsPowerFactor = function () { return 0.5; };
G.mendT = 0; g._rtsAIMendTick(1);
S.ok('...nor with a depot that has no power', nodU.mend == null && nodU.sqd === nod.id, 'mend ' + nodU.mend + ' at depot ' + dep2.id);
g._rtsPowerFactor = function () { return 1; };

/* THE WHOLE TRIP, on the clock: a real depot, placed as the opponent would place it, and a
   battered tank left to the simulation - it drives over, is mended by the depot itself
   (core/units.js), and comes back free. Nothing hand-fed but the damage. */
G = fresh();
g._rtsPowerFactor = function () { return 1; };
var yard = G.ents.filter(function (e) { return e.side === 'enemy' && e.type === 'struct' && !e.dead; })[0], spot = null;
for (var r = 3; r < 14 && !spot; r++) for (var a2 = 0; a2 < 16 && !spot; a2++) {
  var px = Math.round(yard.tx + Math.cos(a2 / 16 * 6.283) * r), pz = Math.round(yard.tz + Math.sin(a2 / 16 * 6.283) * r);
  if (g._rtsCanPlace('enemy', 'depot', px, pz, true)) spot = [px, pz];
}
var realDep = spot ? g._rtsPlaceStruct('enemy', 'depot', spot[0], spot[1], true) : null;
var near = realDep ? g._rtsNearestOpen(realDep.tx + 2, realDep.tz + (realDep.tz > g.RTS_N / 2 ? -16 : 16), 20) : null;
var runner = near ? g._rtsSpawnUnit('enemy', 'tank', g._rtsWX(near[0]), g._rtsWX(near[1])) : null, lowest = 1, mended = false, freeAgain = false, went = false;
if (runner) {
  runner.hp = runner.maxHp * 0.25;
  for (var st = 0; st < 15 * 120 && !freeAgain; st++) {
    G.mendT = Math.min(G.mendT || 0, 1);
    g._rtsTick(1 / 15);
    if (runner.mend != null) went = true;
    lowest = Math.min(lowest, runner.hp / runner.maxHp);
    if (runner.hp >= runner.maxHp * g.RTS_MEND_DONE) mended = true;
    if (went && mended && runner.mend == null) freeAgain = true;
  }
}
S.ok('on the clock: a battered tank drives to a real depot, is mended there and is free again',
     !!realDep && went && mended && freeAgain && !runner.dead,
     (realDep ? 'depot at ' + spot : 'no room for a depot') + ', went ' + went + ', mended ' + mended + ', free ' + freeAgain + (runner ? ', armour ' + Math.round(100 * runner.hp / runner.maxHp) + '%' : ''));

/* RAID */
G = fresh();
var harv = G.ents.filter(function (e) { return e.side === 'player' && e.type === 'unit' && g.rtsUnitDef(e.def).harvest; });
var h1 = harv[0] || g._rtsSpawnUnit('player', 'harvester', 0, 0), h2 = g._rtsSpawnUnit('player', 'harvester', 0, 0);
var raid = team(G, 'Raiders', 'buggy', 3, 0, 0);
h1.x = raid.members[0].x + 30; h1.z = raid.members[0].z;              /* near the raiders - and guarded */
h2.x = raid.members[0].x + 90; h2.z = raid.members[0].z + 20;         /* further, alone */
G.ents.filter(function (e) { return e.side === 'player' && e.type === 'unit' && !g.rtsUnitDef(e.def).harvest; }).forEach(function (e) { e.x = 9999; e.z = 9999; });
var bare = g._rtsTeamTarget(raid, 'harvester');
for (var k = 0; k < 4; k++) g._rtsSpawnUnit('player', 'tank', h1.x + 6 + k * 3, h1.z + 4);
var picked = g._rtsTeamTarget(raid, 'harvester');
S.ok('with neither guarded the raiders go for the nearer harvester', bare === h1, bare ? 'harvester ' + bare.id : 'none');
S.ok('...but with tanks beside it they go for the one left alone', picked === h2, picked ? 'harvester ' + picked.id + ' (alone is ' + h2.id + ')' : 'none');
S.ok('...and the guard is what is counted', g._rtsGuardsNear(h1, g.RTS_RAID_GUARD_R) >= 4 && g._rtsGuardsNear(h2, g.RTS_RAID_GUARD_R) === 0,
     g._rtsGuardsNear(h1, g.RTS_RAID_GUARD_R) + ' round the near one, ' + g._rtsGuardsNear(h2, g.RTS_RAID_GUARD_R) + ' round the far one');

require('../lib/report.js')(S);
