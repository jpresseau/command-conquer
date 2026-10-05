/* THE REPAIR TENDER (rules/units.js `tender`, core/repairtruck.js with `healKind:'ship'`):

     IT MENDS      a damaged gunboat beside it is brought back up; a damaged tank on the shore
                   just as near is not - and a Repair Truck on that shore does not mend the
                   gunboat
     IT SEEKS      left idle, it sails down the channel to a damaged gunboat eight cells off and
                   mends it
     BOTH ARMIES   either builds one from its yard
     THE OPPONENT  buys one once it has three armed hulls, not with two; and keeps it a few cells
                   behind its fleet on the march */

var { Suite } = require('../lib/assert.js');
var { load } = require('../lib/sandbox.js');

var S = new Suite('tender');
var g = load(['src/rules', 'src/core', 'src/sprites/props.js']);

function fresh(army) {
  g.window._RTS_ARMY = army || 'allied';
  g._rtsNewGame(4242, 'easy');
  var G = g.window._rtsG;
  G.over = null;
  G.ents.forEach(function (e) { if (e.type === 'unit') e.dead = true; });
  g._rtsTick(1 / 30);
  G.teams = {};
  return G;
}
function run(secs, each) { for (var t = 0; t < secs * 30; t++) { if (each) each(); g._rtsTick(1 / 30); } }
function W(tx, tz) { return { tx: tx, tz: tz, x: g._rtsWX(tx), z: g._rtsWX(tz) }; }
function openAt(tx, tz, R) {
  for (var dz = -R; dz <= R; dz++) for (var dx = -R; dx <= R; dx++) if (g._rtsBlocked(tx + dx, tz + dz, 'sea')) return false;
  return true;
}
function seaRun(p) { var r = 0; for (var i = 1; i < p.length; i++) r += Math.hypot(p[i].x - p[i - 1].x, p[i].z - p[i - 1].z); return r / g.RTS_TILE; }
/* eight cells of channel (the maps' seas are at most five cells wide) */
function channel(len) {
  var N = g.RTS_N, open = [];
  for (var tz = 4; tz < N - 4; tz += 2) for (var tx = 4; tx < N - 4; tx += 2) if (openAt(tx, tz, 1)) open.push([tx, tz]);
  for (var i = 0; i < open.length; i++) for (var j = 0; j < open.length; j++) {
    var a = open[i], b = open[j], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
    if (d < len - 1 || d > len + 1) continue;
    var A = W(a[0], a[1]), B = W(b[0], b[1]), p = g._rtsPath(A.x, A.z, B.x, B.z, 'sea');
    if (p && p.length && seaRun(p) < d * 1.3) return { A: A, B: B };
  }
  return null;
}
function yard(side, key) {
  var yd = g._rtsHas(side, 'yard'), best = null, bd = 1e9;
  for (var tz = 2; tz < g.RTS_N - 2; tz++) for (var tx = 2; tx < g.RTS_N - 2; tx++) {
    var d = Math.hypot(tx - yd.tx, tz - yd.tz);
    if (d < bd && g._rtsCanPlace(side, key, tx, tz, true)) { bd = d; best = [tx, tz]; }
  }
  if (!best) return null;
  var y = g._rtsPlaceStruct(side, key, best[0], best[1], true); if (y) y.building = 0;
  return y;
}
function sit(list) { list.forEach(function (u) { if (u && !u.dead) { u.order = 'hold'; u.path = null; u.goal = null; u.target = null; u.cool = 9; } }); }
var cells = function (a, b) { return Math.hypot(a.x - b.x, a.z - b.z) / g.RTS_TILE; };

var G = fresh(), CH = channel(8);
S.ok('the staging: eight cells of channel', !!CH, CH ? CH.A.tx + ',' + CH.A.tz + ' to ' + CH.B.tx + ',' + CH.B.tz : 'none');
/* the water's edge: a sea cell with ground beside it */
var edge = null;
for (var tz = 3; tz < g.RTS_N - 3 && !edge; tz++) for (var tx = 3; tx < g.RTS_N - 3 && !edge; tx++) {
  if (!openAt(tx, tz, 0) || !openAt(tx + 1, tz, 0)) continue;
  var land = g._rtsBlocked(tx - 1, tz, null) ? null : [tx - 1, tz];
  if (land && G.terrain[g._rtsIdx(tx - 1, tz)] !== g.RTS_T_WATER) edge = { sea: W(tx, tz), sea2: W(tx + 1, tz), land: W(tx - 1, tz) };
}

/* ---------------- it mends ---------------- */
G = fresh();
var tn = g._rtsSpawnUnit('player', 'tender', edge.sea.x, edge.sea.z), gb = g._rtsSpawnUnit('player', 'gunboat', edge.sea2.x, edge.sea2.z);
var tk = g._rtsSpawnUnit('player', 'tank', edge.land.x, edge.land.z);
gb.hp = gb.maxHp * 0.4; tk.hp = tk.maxHp * 0.4;
var gb0 = gb.hp, tk0 = tk.hp;
run(8, function () { sit([tn, gb, tk]); });
S.ok('a damaged gunboat beside it is brought back up', gb.hp - gb0 >= 100, gb0.toFixed(0) + ' -> ' + gb.hp.toFixed(0));
S.ok('...a damaged tank on the shore just as near is not', tk.hp === tk0 && cells(tk, tn) <= cells(gb, tn) + 0.1,
     tk0.toFixed(0) + ' -> ' + tk.hp.toFixed(0) + ', ' + cells(tk, tn).toFixed(1) + ' cells off against the gunboat\'s ' + cells(gb, tn).toFixed(1));
G = fresh();
var rt = g._rtsSpawnUnit('player', 'repairtruck', edge.land.x, edge.land.z), gb2 = g._rtsSpawnUnit('player', 'gunboat', edge.sea.x, edge.sea.z);
gb2.hp = gb2.maxHp * 0.4; var g20 = gb2.hp;
run(8, function () { sit([rt, gb2]); });
S.ok('...and a Repair Truck on that shore does not mend the gunboat', gb2.hp === g20, g20.toFixed(0) + ' -> ' + gb2.hp.toFixed(0));

/* ---------------- it seeks ---------------- */
G = fresh();
var tn2 = g._rtsSpawnUnit('player', 'tender', CH.A.x, CH.A.z), hurt = g._rtsSpawnUnit('player', 'gunboat', CH.B.x, CH.B.z);
hurt.hp = hurt.maxHp * 0.3; var h0 = hurt.hp;
run(20, function () { sit([hurt]); });
S.ok('left idle, it sails down the channel to a damaged gunboat eight cells off', cells(tn2, hurt) <= 3, cells(tn2, hurt).toFixed(1) + ' cells from it');
S.ok('...and mends it', hurt.hp - h0 >= 100, h0.toFixed(0) + ' -> ' + hurt.hp.toFixed(0));

/* a damaged Monitor out on a flat the tide has dried, four cells from any water a Tender can sail,
   and a damaged gunboat further off in open water: the Tender goes to the one it can reach */
G = fresh(); G.t = 180; g._rtsTideTick(0);
var flatM = null;
for (var fi = 0; fi < g.RTS_N * g.RTS_N && !flatM; fi++) {
  if (G.tideD[fi] !== 1 || !G.tideDry[fi]) continue;
  var fx = fi % g.RTS_N, fz = (fi / g.RTS_N) | 0, nearSea = g._rtsNearestOpen(fx, fz, 3, 'sea');
  if (nearSea) continue;
  var deepM = g._rtsNearestOpen(fx, fz, 9, 'sea');
  if (deepM && Math.hypot(deepM[0] - fx, deepM[1] - fz) >= 4) flatM = { f: W(fx, fz), d: W(deepM[0], deepM[1]) };
}
var mon = flatM && g._rtsSpawnUnit('enemy', 'monitor', flatM.f.x, flatM.f.z), gbT = flatM && g._rtsSpawnUnit('enemy', 'gunboat', flatM.d.x, flatM.d.z);
var tnT = flatM && g._rtsSpawnUnit('enemy', 'tender', flatM.d.x, flatM.d.z);
if (flatM) {
  /* the gunboat sails off a few cells so the Tender has somewhere to go, then everything holds */
  var gc = g._rtsNearestOpen(flatM.d.tx, flatM.d.tz, 8, 'sea'); mon.hp = mon.maxHp * 0.3; gbT.hp = gbT.maxHp * 0.3;
  var far8 = null;
  for (var r8 = 6; r8 <= 10 && !far8; r8++) for (var a8 = 0; a8 < 16 && !far8; a8++) { var qx = Math.round(flatM.d.tx + Math.cos(a8 * Math.PI / 8) * r8), qz = Math.round(flatM.d.tz + Math.sin(a8 * Math.PI / 8) * r8); if (g._rtsInB(qx, qz) && !g._rtsBlocked(qx, qz, 'sea') && g._rtsPath(flatM.d.x, flatM.d.z, g._rtsWX(qx), g._rtsWX(qz), 'sea')) far8 = W(qx, qz); }
  if (far8) { gbT.x = far8.x; gbT.z = far8.z; }
  run(25, function () { G.t = 180; g._rtsTideTick(0); sit([mon, gbT]); G.sides.enemy.q = {}; });
}
var want = flatM && g._rtsFixWants(tnT);
S.ok('it passes over a damaged Monitor on a flat it cannot reach for a damaged gunboat it can', !!flatM && !!gbT && want !== mon && cells(tnT, gbT) <= 3 && gbT.hp > gbT.maxHp * 0.3,
     flatM ? 'went to the ' + (want === mon ? 'Monitor' : cells(tnT, gbT) <= 3 ? 'gunboat' : 'neither') + ', ' + cells(tnT, gbT).toFixed(1) + ' cells from the gunboat, ' + cells(tnT, mon).toFixed(1) + ' from the Monitor' : 'no dried flat four cells from open water on this map');

/* ---------------- both armies ---------------- */
function canBuild(army, key) {
  fresh(army);
  var before = !!g._rtsCanQueue('player', 'tender');
  yard('player', 'refinery'); g._rtsRecalcPower('player');
  var y = yard('player', key); g._rtsRecalcPower('player');
  return !before && !!y && !!g._rtsCanQueue('player', 'tender');
}
S.ok('either army builds one from its yard', canBuild('allied', 'navalyard') && canBuild('soviet', 'subpen'), '');

/* ---------------- the opponent ---------------- */
G = fresh();
yard('enemy', 'refinery');
var ey = yard('enemy', 'subpen'), eyd = g._rtsHas('enemy', 'yard');
for (var hv = 0; hv < 3; hv++) g._rtsSpawnUnit('enemy', 'harvester', eyd.x + hv * 4, eyd.z + 30);
g._rtsSpawnUnit('enemy', 'minelayer', eyd.x, eyd.z + 24);
g._rtsRecalcPower('enemy');
G.ai.hovQ = { t: 1e9, v: null };
function buys(n) {
  var S2 = G.sides.enemy, got = 0;
  for (var r = 0; r < n; r++) { S2.q = {}; S2.credits = 1e6; S2.ore = 0; g._rtsAIUnits(S2); if (S2.q.ship && S2.q.ship.key === 'tender') got++; }
  return got;
}
/* the fleet out on the channel, and a Mine Boat already owned so the opponent's other support
   purchase does not come first */
var fleet = [];
g._rtsSpawnUnit('enemy', 'mineboat', CH.B.x, CH.B.z);
fleet.push(g._rtsSpawnUnit('enemy', 'sub', CH.A.x, CH.A.z), g._rtsSpawnUnit('enemy', 'sub', CH.B.x, CH.B.z));
var two = buys(20);
fleet.push(g._rtsSpawnUnit('enemy', 'missilesub', CH.A.x, CH.A.z));
var three = buys(20);
S.ok('the opponent buys one once it has three armed hulls', !!ey && three > 3, three + ' of 20');
S.ok('...not with two', two === 0, two + ' of 20');
/* its fleet on the march down the channel: the tender stays a few cells behind */
var team = g._rtsTeamMake(g.RTS_TEAM_TYPES.filter(function (t) { return t.name === 'Wolfpack'; })[0]);
fleet.forEach(function (u) { g._rtsTeamAdd(team, u); u.init = true; });
team.moving = true; team.hasBeen = true;
var et = g._rtsSpawnUnit('enemy', 'tender', ey.x, ey.z), dk = g._rtsNearestOpen(ey.tx + 1, ey.tz + 1, 8, 'sea');
et.x = g._rtsWX(dk[0]); et.z = g._rtsWX(dk[1]);
var start = cells(et, g._rtsTeamCentre(team));
run(60, function () { G.sides.enemy.q = {}; sit(fleet); });
var off = cells(et, g._rtsTeamCentre(team));
S.ok('...and keeps it a few cells behind its fleet on the march', off <= 7 && start > off + 3, 'from ' + start.toFixed(1) + ' to ' + off.toFixed(1) + ' cells off its centre');

require('../lib/report.js')(S);
