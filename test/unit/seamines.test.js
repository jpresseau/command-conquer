/* THE MINE BOAT (rules/units.js `mineboat`, core/seamines.js, the mines core/mines.js):

     LAID AT SEA   it lays a mine in the water where it stands; a Mine Layer on the shore cannot
                   lay one in the water
     SET OFF       an enemy gunboat sailing down the channel over it is hit and the mine is spent;
                   a gunboat of the layer's own side sails over unharmed, and so does a
                   helicopter of the enemy's; an enemy hovercraft is hit
     HIDDEN        the enemy does not see it - until a Destroyer of theirs comes within sonar
                   reach; a Gunboat, with no sonar, finds nothing
     RESTOCKED     alongside its own yard it loads again; out at sea it does not
     THE SWEEPER   a Mine Sweeper on the shore sees a sea mine in its reach, but does not drive
                   into the water after it
     BOTH ARMIES   either builds one from its yard
     THE OPPONENT  buys one once the player has a yard, not before; and lays its mines in the
                   water of the channel between the two yards, a few cells out from its own -
                   never sent after a cell on land - and the plan keeps to its band */

var { Suite } = require('../lib/assert.js');
var { load } = require('../lib/sandbox.js');

var S = new Suite('seamines');
var g = load(['src/rules', 'src/core', 'src/sprites/props.js']);

function fresh(army) {
  g.window._RTS_ARMY = army || 'allied';
  g._rtsNewGame(4242, 'easy');
  var G = g.window._rtsG;
  G.over = null;
  G.ents.forEach(function (e) { if (e.type === 'unit') e.dead = true; });
  g._rtsTick(1 / 30);
  G.teams = {};
  G.mines = [];
  return G;
}
function run(secs, each) { for (var t = 0; t < secs * 30; t++) { if (each) each(); g._rtsTick(1 / 30); } }
function W(tx, tz) { return { tx: tx, tz: tz, x: g._rtsWX(tx), z: g._rtsWX(tz) }; }
function openAt(tx, tz, R) {
  for (var dz = -R; dz <= R; dz++) for (var dx = -R; dx <= R; dx++) if (g._rtsBlocked(tx + dx, tz + dz, 'sea')) return false;
  return true;
}
function seaRun(p) { var r = 0; for (var i = 1; i < p.length; i++) r += Math.hypot(p[i].x - p[i - 1].x, p[i].z - p[i - 1].z); return r / g.RTS_TILE; }
/* a fourteen-cell stretch of channel (the maps' seas are at most five cells wide) */
function channel() {
  var N = g.RTS_N, open = [];
  for (var tz = 4; tz < N - 4; tz += 2) for (var tx = 4; tx < N - 4; tx += 2) if (openAt(tx, tz, 2)) open.push([tx, tz]);
  for (var i = 0; i < open.length; i++) for (var j = 0; j < open.length; j++) {
    var a = open[i], b = open[j], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
    if (d < 13 || d > 15) continue;
    var A = W(a[0], a[1]), B = W(b[0], b[1]), p = g._rtsPath(A.x, A.z, B.x, B.z, 'sea');
    if (p && p.length && seaRun(p) < d * 1.3) return { A: A, B: B, p: p };
  }
  return null;
}
/* a yard of `key` for `side`, as near its Command Yard as one will go */
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
var cells = function (a, b) { return Math.hypot(a.x - b.x, a.z - b.z) / g.RTS_TILE; };

var G = fresh(), CH = channel();
S.ok('the staging: a stretch of channel fourteen cells long', !!CH, CH ? CH.A.tx + ',' + CH.A.tz + ' to ' + CH.B.tx + ',' + CH.B.tz : 'none');
/* the cell the mine goes in: half way down the channel, on the way a ship sails it */
var mid = CH.p[Math.floor(CH.p.length / 2)], MC = W(g._rtsTX(mid.x), g._rtsTX(mid.z));
function mined(side) {
  var G = fresh(), b = g._rtsSpawnUnit(side || 'player', 'mineboat', MC.x, MC.z), ok = g._rtsLayMine(b);
  b.dead = true;
  run(2);
  return { G: G, ok: ok, m: G.mines[0] };
}

/* ---------------- laid at sea ---------------- */
var L = mined();
S.ok('it lays a mine in the water where it stands', L.ok && L.G.mines.length === 1 && L.G.terrain[g._rtsIdx(L.m.tx, L.m.tz)] === g.RTS_T_WATER, L.G.mines.length + ' mines');
/* a Mine Layer on the nearest ground to the mine, asked for the water beside it */
G = fresh();
var shore = g._rtsNearestOpen(MC.tx, MC.tz, 8, null), ml = g._rtsSpawnUnit('player', 'minelayer', g._rtsWX(shore[0]), g._rtsWX(shore[1]));
var wet = null;
for (var dz = -1; dz <= 1 && !wet; dz++) for (var dx = -1; dx <= 1 && !wet; dx++) if (G.terrain[g._rtsIdx(shore[0] + dx, shore[1] + dz)] === g.RTS_T_WATER) wet = [shore[0] + dx, shore[1] + dz];
S.ok('a Mine Layer on the shore cannot lay one in the water', !!wet && !g._rtsLayMine(ml, wet[0], wet[1]) && !G.mines.length, wet ? 'beside ' + wet : 'no water beside the shore cell');

/* ---------------- set off ---------------- */
/* down the channel - or, for a hovercraft, which goes its own way over land and water alike,
   along the few cells of it either side of the mine */
function sail(side, key, from, to) {
  from = from || CH.A; to = to || CH.B;
  var M = mined('player'), u = g._rtsSpawnUnit(side, key, from.x, from.z), hp = u.hp, over = false;
  g._rtsOrderMove(u, to.x, to.z, false);
  run(20, function () { if (g._rtsTX(u.x) === MC.tx && g._rtsTX(u.z) === MC.tz) over = true; if (u.air) { u.target = null; } });
  return { hurt: hp - (u.dead ? 0 : u.hp), spent: !M.G.mines.length, over: over || u.dead };
}
var foe = sail('enemy', 'gunboat'), own = sail('player', 'gunboat'), heli = sail('enemy', 'heli'), hov = sail('enemy', 'hovercraft', CH.p[Math.floor(CH.p.length / 2) - 3], CH.p[Math.floor(CH.p.length / 2) + 3]);
S.ok('an enemy gunboat sailing down the channel over it is hit, and the mine is spent', foe.over && foe.hurt >= 300 && foe.spent, foe.hurt.toFixed(0) + ' hp; spent ' + foe.spent);
S.ok('...a gunboat of the layer\'s own side sails over unharmed', own.over && own.hurt === 0 && !own.spent, 'over ' + own.over + ', ' + own.hurt + ' hp');
S.ok('...and so does a helicopter of the enemy\'s', heli.over && heli.hurt === 0 && !heli.spent, 'over ' + heli.over + ', ' + heli.hurt + ' hp');
S.ok('...and an enemy hovercraft is hit', hov.over && hov.hurt > 0 && hov.spent, 'over ' + hov.over + ', ' + hov.hurt.toFixed(0) + ' hp');

/* ---------------- hidden ---------------- */
function found(key) {
  var M = mined('player'), m = M.m;
  if (!m) return { before: null, after: null, d: 0 };
  var wasShown = g._rtsMineShown(m, 'enemy');
  var at = g._rtsNearestOpen(MC.tx + 6, MC.tz, 6, 'sea'), u = g._rtsSpawnUnit('enemy', key, g._rtsWX(at[0]), g._rtsWX(at[1]));
  run(1, function () { u.order = 'hold'; u.path = null; });
  return { before: wasShown, after: g._rtsMineShown(m, 'enemy'), d: cells(u, MC) };
}
var dd = found('destroyer'), gb = found('gunboat');
S.ok('the enemy does not see it - until a Destroyer of theirs comes within sonar reach', !dd.before && dd.after, dd.d.toFixed(1) + ' cells off');
S.ok('...a Gunboat, with no sonar, finds nothing', !gb.before && !gb.after, gb.d.toFixed(1) + ' cells off');

/* ---------------- restocked ---------------- */
G = fresh();
var ny = yard('player', 'navalyard'), dock = g._rtsNearestOpen(ny.tx + 1, ny.tz + 1, 6, 'sea');
var b1 = g._rtsSpawnUnit('player', 'mineboat', g._rtsWX(dock[0]), g._rtsWX(dock[1]));
var b2 = g._rtsSpawnUnit('player', 'mineboat', CH.A.x, CH.A.z);
b1.mines = 0; b2.mines = 0;
run(10, function () { [b1, b2].forEach(function (b) { b.order = 'hold'; b.path = null; }); });
S.ok('alongside its own yard it loads again', b1.mines >= 2, b1.mines + ' mines after ten seconds');
S.ok('...out at sea it does not', b2.mines === 0 && cells(b2, ny) > 6, b2.mines + ' mines, ' + cells(b2, ny).toFixed(1) + ' cells from the yard');

/* ---------------- the sweeper ---------------- */
var SW = mined('enemy'), swc = g._rtsNearestOpen(MC.tx, MC.tz, 8, null), sw = g._rtsSpawnUnit('player', 'sweeper', g._rtsWX(swc[0]), g._rtsWX(swc[1]));
var sx = sw.x, sz = sw.z;
run(6);
S.ok('a Mine Sweeper on the shore sees a sea mine in its reach', SW.G.mines.length === 1 && g._rtsMineShown(SW.G.mines[0], 'player'), cells(sw, MC).toFixed(1) + ' cells off');
S.ok('...but does not drive into the water after it', Math.hypot(sw.x - sx, sw.z - sz) < 1 && !sw.path, 'moved ' + (Math.hypot(sw.x - sx, sw.z - sz) / g.RTS_TILE).toFixed(2) + ' cells');

/* ---------------- both armies ---------------- */
function canBuild(army, key) {
  fresh(army);
  var before = !!g._rtsCanQueue('player', 'mineboat');
  yard('player', 'refinery'); g._rtsRecalcPower('player');
  var y = yard('player', key); g._rtsRecalcPower('player');
  return !before && !!y && !!g._rtsCanQueue('player', 'mineboat');
}
S.ok('either army builds one from its yard', canBuild('allied', 'navalyard') && canBuild('soviet', 'subpen'), '');

/* ---------------- the opponent ---------------- */
G = fresh();
yard('enemy', 'refinery');
var ey = yard('enemy', 'subpen');
var eyd = g._rtsHas('enemy', 'yard');
for (var hv = 0; hv < 3; hv++) g._rtsSpawnUnit('enemy', 'harvester', eyd.x + hv * 4, eyd.z + 30);
var eml = g._rtsSpawnUnit('enemy', 'minelayer', eyd.x, eyd.z + 24);   /* or the opponent buys one of those first */
g._rtsRecalcPower('enemy');
G.ai.hovQ = { t: 1e9, v: null };
function buys(n) {
  var S2 = G.sides.enemy, got = 0;
  for (var r = 0; r < n; r++) { S2.q = {}; S2.credits = 1e6; S2.ore = 0; g._rtsAIUnits(S2); if (S2.q.ship && S2.q.ship.key === 'mineboat') got++; }
  return got;
}
var before = buys(20);
var py = yard('player', 'navalyard');
var after = buys(20);
var spots = g._rtsAISeaMineSpots(G);
S.ok('the opponent buys one once the player has a yard', !!ey && !!py && after > 3 && spots.length > 0, after + ' of 20; ' + spots.length + ' cells planned');
S.ok('...not before', before === 0, before + ' of 20');
eml.dead = true;                                                    /* its mines would be on land */
var eb = g._rtsSpawnUnit('enemy', 'mineboat', ey.x, ey.z);
var dk = g._rtsNearestOpen(ey.tx + 1, ey.tz + 1, 6, 'sea'); eb.x = g._rtsWX(dk[0]); eb.z = g._rtsWX(dk[1]);
var landGoal = 0;
run(60, function () {
  G.sides.enemy.q = {};
  if (eb.goal && G.terrain[g._rtsIdx(g._rtsTX(eb.goal.x), g._rtsTX(eb.goal.z))] !== g.RTS_T_WATER) landGoal++;
});
var laid = G.mines.filter(function (m) { return m.side === 'enemy'; });
var wetAll = laid.every(function (m) { return G.terrain[g._rtsIdx(m.tx, m.tz)] === g.RTS_T_WATER; });
var outs = laid.map(function (m) { return cells(W(m.tx, m.tz), ey); });
var inPlan = laid.every(function (m) { return spots.some(function (s) { return s[0] === m.tx && s[1] === m.tz; }); });
S.ok('...and lays its mines in the water of the channel between the two yards, a few cells out from its own',
     laid.length >= 8 && wetAll && inPlan && Math.min.apply(null, outs) >= g.RTS_SEAMINE.from - 1 && Math.max.apply(null, outs) <= g.RTS_SEAMINE.to + 2,
     laid.length + ' laid; ' + (laid.length ? Math.min.apply(null, outs).toFixed(1) + '-' + Math.max.apply(null, outs).toFixed(1) + ' cells out' : ''));
S.ok('...never once sent for a cell on land (the Mine Layer\'s field is not its own)', landGoal === 0, landGoal + ' ticks with a goal on land');
/* the plan keeps to its band: moved out to 8-12 cells, every planned cell lies in it */
var keep = { from: g.RTS_SEAMINE.from, to: g.RTS_SEAMINE.to };
g.RTS_SEAMINE.from = 8; G.ai.seaMines = null;
var far = g._rtsAISeaMineSpots(G).map(function (s) { return cells(W(s[0], s[1]), ey); });
g.RTS_SEAMINE.from = keep.from; G.ai.seaMines = null;
S.ok('...and the plan keeps to its band of cells out from the yard', far.length > 0 && Math.min.apply(null, far) >= 7 && Math.max.apply(null, far) <= g.RTS_SEAMINE.to + 1.5,
     far.length ? far.length + ' cells, ' + Math.min.apply(null, far).toFixed(1) + '-' + Math.max.apply(null, far).toFixed(1) + ' out with the band at 8-' + g.RTS_SEAMINE.to : 'none');

require('../lib/report.js')(S);
