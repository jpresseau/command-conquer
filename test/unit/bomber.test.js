/* THE HEAVY BOMBER (rules/units.js `bomber`, core/bomber.js), on the real simulation:

     THE CARPET    sent at a building fifteen cells off or more, it lays eight bombs in one pass - a
                   cell apart, in a straight line along its course, centred on the building -
                   without coming down; each falls for most of a second before it bursts, and the
                   building is hit
     EVERYONE      a tank of its own side parked under the line is hurt too
     HOME          the load gone, it flies to an air pad, loads again, and can make another run
     CALLED OFF    sent somewhere else mid-run, it stops laying bombs
     NEVER A SHOT  loaded and idle right over an enemy tank, it does not fire on it as a gun
                   would: it keeps its load for a run
     BOTH ARMIES   either builds one, behind its own air pad - a Helipad or an Airfield
     THE OPPONENT  buys one (after its Paradrop Plane) once the player has dug in and its own base
                   is defended, not before;
                   and sends it at the most crowded corner of the player's base */

var { Suite } = require('../lib/assert.js');
var { load } = require('../lib/sandbox.js');

var S = new Suite('bomber');
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
function middle() {
  var c = g._rtsNearestOpen(g.RTS_N >> 1, g.RTS_N >> 1, 20, null);
  return { tx: c[0], tz: c[1], x: g._rtsWX(c[0]), z: g._rtsWX(c[1]) };
}
function place(side, k, near, from) {
  var yd = near || g._rtsHas(side, 'yard');
  for (var r = from || 4; r < 30; r++) for (var a = 0; a < 8; a++) {
    var sp = g._rtsNearestOpen(yd.tx + Math.round(Math.cos(a) * r), yd.tz + Math.round(Math.sin(a) * r), 3, null);
    if (sp && g._rtsCanPlace(side, k, sp[0], sp[1], true)) { var b = g._rtsPlaceStruct(side, k, sp[0], sp[1], true); if (b) b.building = 0; return b; }
  }
  return null;
}
var cells = function (a, b) { return Math.hypot(a.x - b.x, a.z - b.z) / g.RTS_TILE; };

/* ---------------- the carpet ---------------- */
var G = fresh(), pad = place('player', 'helipad'), py = g._rtsHas('player', 'yard');
var ey = g._rtsHas('enemy', 'yard');
/* the building it is sent at: twenty-odd cells from where the bomber starts */
var bm = g._rtsSpawnUnit('player', 'bomber', ey.x + (py.x - ey.x) * 0.45, ey.z + (py.z - ey.z) * 0.45);
var aim = ey, start = cells(bm, aim), hp0 = aim.hp;
/* a tank of the bomber's own side parked a cell off the building, under the line */
var dir = { x: (aim.x - bm.x) / (start * g.RTS_TILE), z: (aim.z - bm.z) / (start * g.RTS_TILE) };
var w = g.rtsStructDef(aim.def).w, own = g._rtsSpawnUnit('player', 'tank', aim.x - dir.x * (w / 2 + 1) * g.RTS_TILE, aim.z - dir.z * (w / 2 + 1) * g.RTS_TILE);
var ownHp = own.hp;
g._rtsOrderAttack(bm, aim);
var seen = [], bursts = [], low = 99;
run(20, function () {
  own.order = 'hold'; own.path = null; own.target = null; own.cool = 9;
  (G.bombs || []).forEach(function (b) { if (seen.indexOf(b) < 0) { seen.push(b); b.at = G.t; } });
  seen.forEach(function (b) { if (!b.gone && (G.bombs || []).indexOf(b) < 0) { b.gone = G.t; bursts.push(b); } });
  low = Math.min(low, g._rtsAirLift(bm));
});
S.ok('the staging: well off', start >= 15, start.toFixed(1) + ' cells');
S.ok('sent at a building, it lays eight bombs in one pass', seen.length === 8, seen.length + ' bombs');
/* the line: spacing, straightness, centre */
var gaps = [], off = 0, c = { x: 0, z: 0 };
seen.forEach(function (b, i) {
  c.x += b.x / seen.length; c.z += b.z / seen.length;
  if (i) gaps.push(cells(b, seen[i - 1]));
  var rx = b.x - seen[0].x, rz = b.z - seen[0].z;                    /* off the line from first to last */
  var L = seen[seen.length - 1], lx = L.x - seen[0].x, lz = L.z - seen[0].z, LL = Math.hypot(lx, lz) || 1;
  off = Math.max(off, Math.abs(rx * lz - rz * lx) / LL / g.RTS_TILE);
});
var gmin = Math.min.apply(null, gaps), gmax = Math.max.apply(null, gaps);
S.ok('...a cell apart, in a straight line', seen.length === 8 && gmin > 0.9 && gmax < 1.1 && off < 0.1,
     'gaps ' + gmin.toFixed(2) + '-' + gmax.toFixed(2) + ' cells; ' + off.toFixed(2) + ' off the line');
var along = seen.length === 8 ? Math.abs(((seen[7].x - seen[0].x) * dir.x + (seen[7].z - seen[0].z) * dir.z) / (cells(seen[7], seen[0]) * g.RTS_TILE)) : 0;
S.ok('...along its course, centred on the building', along > 0.99 && cells(c, aim) < 0.6,
     'line ' + (along * 100).toFixed(0) + '% along the course; centre ' + cells(c, aim).toFixed(2) + ' cells from the building');
S.ok('...without coming down', low >= 12, 'at least ' + low.toFixed(1) + ' up');
var falls = bursts.map(function (b) { return b.gone - b.at; });
S.ok('...each falls for most of a second before it bursts', bursts.length === 8 && Math.min.apply(null, falls) >= 0.6 && Math.max.apply(null, falls) <= 0.8,
     falls.map(function (f) { return f.toFixed(2); }).join(' '));
S.ok('...and the building is hit', aim.hp < hp0 - 100, hp0 + ' -> ' + aim.hp.toFixed(0));
S.ok('a tank of its own side parked under the line is hurt too', own.hp < ownHp, ownHp + ' -> ' + own.hp.toFixed(0));

/* ---------------- home ---------------- */
var emptied = bm.ammo, homeBy = null, loaded = null;
run(60, function () {
  if (homeBy === null && cells(bm, pad) < 2) homeBy = G.t;
  if (homeBy !== null && loaded === null && bm.ammo > 0) loaded = G.t;
});
S.ok('the load gone, it flies home to an air pad and loads again', emptied === 0 && homeBy !== null && loaded !== null,
     'ammo ' + emptied + ' after the run; home ' + (homeBy !== null) + '; loaded ' + (loaded !== null));
var before = seen.length;
g._rtsOrderAttack(bm, aim);
run(25, function () { (G.bombs || []).forEach(function (b) { if (seen.indexOf(b) < 0) seen.push(b); }); });
S.ok('...and can make another run', seen.length - before === 8, (seen.length - before) + ' bombs on the second');

/* ---------------- never a shot ---------------- */
G = fresh();
var m = middle(), et = g._rtsSpawnUnit('enemy', 'tank', m.x, m.z), b2 = g._rtsSpawnUnit('player', 'bomber', m.x, m.z);
var etHp = et.hp;
g._rtsTick(1 / 30);
S.ok('loaded and idle right over an enemy tank, it does not fire on it as a gun would', b2.ammo === 1 && et.hp === etHp, 'ammo ' + b2.ammo + '; tank ' + etHp + ' -> ' + et.hp);
g._rtsTick(1 / 30);
S.ok('...it keeps its load for a run', !!b2.run && b2.order === 'attack', 'run ' + !!b2.run + ', order ' + b2.order);

/* ---------------- called off ---------------- */
G = fresh();
var b3 = g._rtsSpawnUnit('player', 'bomber', m.x - 14 * g.RTS_TILE, m.z), tk3 = g._rtsSpawnUnit('enemy', 'tank', m.x, m.z), drops = [];
g._rtsOrderAttack(b3, tk3);
var moved = false;
run(12, function () {
  tk3.order = 'hold'; tk3.path = null; tk3.target = null; tk3.cool = 9;
  (G.bombs || []).forEach(function (b) { if (drops.indexOf(b) < 0) drops.push(b); });
  if (!moved && drops.length >= 2) { moved = true; g._rtsOrderMove(b3, m.x, m.z + 20 * g.RTS_TILE, false); }
});
S.ok('sent somewhere else mid-run, it stops laying its carpet', moved && drops.length >= 2 && drops.length <= 3 && !b3.run, drops.length + ' bombs; run ' + !!b3.run);

/* ---------------- both armies ---------------- */
function canBuild(army, padKey) {
  fresh(army);
  ['power', 'power', 'refinery', 'radar'].forEach(function (k) { place('player', k); });
  g._rtsRecalcPower('player');
  var before = !!g._rtsCanQueue('player', 'bomber');
  place('player', padKey); g._rtsRecalcPower('player');
  return !before && !!g._rtsCanQueue('player', 'bomber');
}
S.ok('either army builds one, behind its own air pad - a Helipad or an Airfield', canBuild('allied', 'helipad') && canBuild('soviet', 'afld'), '');

/* ---------------- the opponent ---------------- */
G = fresh();
['factory', 'radar', 'depot', 'apower', 'apower', 'apower', 'afld'].forEach(function (k) { if (!g._rtsHas('enemy', k) || /power/.test(k)) place('enemy', k); });
ey = g._rtsHas('enemy', 'yard');
for (var hv = 0; hv < 3; hv++) g._rtsSpawnUnit('enemy', 'harvester', ey.x + hv * 4, ey.z + 30);
g._rtsSpawnUnit('enemy', 'minelayer', ey.x, ey.z + 24);
g._rtsRecalcPower('enemy');
G.ai.hovQ = { t: 1e9, v: null };
function buys(n) {
  var S2 = G.sides.enemy, got = 0;
  for (var r = 0; r < n; r++) { S2.q = {}; S2.credits = 1e6; S2.ore = 0; g._rtsAIUnits(S2); if (S2.q.air && S2.q.air.key === 'bomber') got++; }
  return got;
}
/* the Dominion's Paradrop Plane comes first on the same terms (core/aimines.js); it has one */
var para = g._rtsSpawnUnit('enemy', 'paraplane', ey.x, ey.z + 12);
var towers = [];
for (var df = 0; df < 4; df++) towers.push(place('enemy', 'flametower'));
var notDug = buys(20);                                               /* its own base defended, the player not dug in */
['pillbox', 'pillbox'].forEach(function (k) { place('player', k); });
var both = buys(20);
towers.forEach(function (t) { if (t) t.dead = true; });
g._rtsTick(1 / 30);
var undefended = buys(20);                                           /* the player dug in, its own base not defended */
for (var df2 = 0; df2 < 4; df2++) place('enemy', 'flametower');
para.dead = true;
S.ok('the opponent buys one once the player has dug in and its own base is defended', both > 3, both + ' of 20');
S.ok('...not before the player has dug in', notDug === 0, notDug + ' of 20');
S.ok('...nor while its own base is undefended', undefended === 0, undefended + ' of 20');
/* the player's base: its yard's cluster, and one building alone far out */
py = g._rtsHas('player', 'yard');
['power', 'refinery', 'power'].forEach(function (k) { place('player', k); });
var lone = place('player', 'power', { tx: py.tx, tz: py.tz }, 14);
function round(b) { return G.ents.filter(function (o) { return !o.dead && o.side === 'player' && o.type === 'struct' && cells(o, b) <= g.RTS_BOMB.crowd; }).length; }
var most = Math.max.apply(null, G.ents.filter(function (o) { return !o.dead && o.side === 'player' && o.type === 'struct'; }).map(round));
var eb = g._rtsSpawnUnit('enemy', 'bomber', ey.x, ey.z), sent = null, dropped = 0;
run(40, function () { if (!sent && eb.target) sent = eb.target; if (G.bombs) dropped = Math.max(dropped, G.bombs.length); });
S.ok('...and sends it at the most crowded corner of the player\'s base', !!lone && round(lone) < most && !!sent && sent !== lone && round(sent) === most && dropped > 0,
     sent ? 'sent at a ' + sent.def + ' with ' + round(sent) + ' buildings round it, of ' + most + ' at most; the lone one has ' + (lone ? round(lone) : '-') + '; ' + dropped + ' bombs in the air at once' : 'never sent');

require('../lib/report.js')(S);
