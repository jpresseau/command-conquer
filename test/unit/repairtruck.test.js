/* THE REPAIR TRUCK (rules/units.js `repairtruck`, core/repairtruck.js, the aura in core/units.js):

     IT MENDS     a damaged tank in its reach comes back up at twelve a second, for free; one out of
                  its reach does not; a damaged squad beside it does not - it mends vehicles - and
                  it does not mend itself; the Field Medic still mends the squad and not the tank
     IT GOES      left idle, it drives to a damaged tank seven cells off and puts it right; one
                  fourteen cells off it leaves alone
     BOTH ARMIES  either can build one, once it has a Repair Bay
     THE OPPONENT buys one once its field army has six armed vehicles and its own base has four
                  defences, not before either; and its truck,
                  with nothing to mend, follows the team on the march, a few cells behind it */

var { Suite } = require('../lib/assert.js');
var { load } = require('../lib/sandbox.js');

var S = new Suite('repairtruck');
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
function at(side, key, tx, tz) { var c = g._rtsNearestOpen(tx, tz, 3, null); var u = g._rtsSpawnUnit(side, key, g._rtsWX(c[0]), g._rtsWX(c[1])); return u; }
function place(side, k) {
  var yd = g._rtsHas(side, 'yard');
  for (var r = 4; r < 30; r++) for (var a = 0; a < 8; a++) {
    var sp = g._rtsNearestOpen(yd.tx + Math.round(Math.cos(a) * r), yd.tz + Math.round(Math.sin(a) * r), 3, null);
    if (sp && g._rtsCanPlace(side, k, sp[0], sp[1], true)) return g._rtsPlaceStruct(side, k, sp[0], sp[1], true);
  }
  return null;
}
function hold(list) { list.forEach(function (u) { u.order = 'hold'; u.path = null; }); }
var D = g.rtsUnitDef('repairtruck');

/* ---------------- it mends ---------------- */
var G = fresh(), m = middle();
var tr = at('player', 'repairtruck', m.tx, m.tz);
var inR = at('player', 'tank', m.tx + 1, m.tz + 1), outR = at('player', 'tank', m.tx + 8, m.tz);
var sq = at('player', 'rifle', m.tx - 1, m.tz + 1);
[inR, outR, sq, tr].forEach(function (u) { u.hp = Math.round(u.maxHp / 2); });
var h0 = { inR: inR.hp, outR: outR.hp, sq: sq.hp, tr: tr.hp };
run(5, function () { hold([tr, inR, outR, sq]); });
var gain = inR.hp - h0.inR;
S.ok('a damaged tank in its reach comes back up at twelve a second', Math.abs(gain - 12 * 5) < 12, gain.toFixed(0) + ' hp in 5 s');
S.ok('...one out of its reach does not', outR.hp === h0.outR, outR.hp + ' of ' + h0.outR);
S.ok('...nor a damaged squad beside it - it mends vehicles', sq.hp === h0.sq, sq.hp + ' of ' + h0.sq);
S.ok('...nor itself', tr.hp === h0.tr, tr.hp + ' of ' + h0.tr);
/* the medic, after the aura was generalised */
G = fresh(); m = middle();
var md = at('player', 'medic', m.tx, m.tz), sq2 = at('player', 'rifle', m.tx + 1, m.tz), tk2 = at('player', 'tank', m.tx - 1, m.tz + 1);
sq2.hp = Math.round(sq2.maxHp / 2); tk2.hp = Math.round(tk2.maxHp / 2);
var s0 = sq2.hp, t0 = tk2.hp;
run(3, function () { hold([md, sq2, tk2]); });
S.ok('the Field Medic still mends the squad, and not the tank', sq2.hp > s0 && tk2.hp === t0, 'squad ' + s0 + ' -> ' + sq2.hp + ', tank ' + t0 + ' -> ' + tk2.hp);

/* ---------------- it goes ---------------- */
G = fresh(); m = middle();
tr = at('player', 'repairtruck', m.tx, m.tz);
var near = at('player', 'tank', m.tx + 7, m.tz);
near.hp = 100;
run(40, function () { hold([near]); });
S.ok('left idle, it drives to a damaged tank seven cells off and puts it right', near.hp === near.maxHp, near.hp + ' of ' + near.maxHp);
G = fresh(); m = middle();
tr = at('player', 'repairtruck', m.tx, m.tz);
var far = at('player', 'tank', m.tx - 14, m.tz);
far.hp = 100;
run(20, function () { hold([far]); });
S.ok('...and leaves one fourteen cells off alone', far.hp === 100 && Math.hypot(tr.x - g._rtsWX(m.tx), tr.z - g._rtsWX(m.tz)) < g.RTS_TILE * 2, far.hp + ' hp');

/* ---------------- no way there ---------------- */
/* a damaged tank it cannot get to - walled in, five cells off - is asked for once and then passed
   over for the next, nine cells off, rather than asked for again every second while that one waits */
G = fresh(); m = middle();
var tr2 = at('player', 'repairtruck', m.tx, m.tz);
var walled = at('player', 'tank', m.tx + 5, m.tz), beyond = at('player', 'tank', m.tx - 9, m.tz);
walled.hp = 50; beyond.hp = 50;
var wtx = g._rtsTX(walled.x), wtz = g._rtsTX(walled.z);
for (var wz = -1; wz <= 1; wz++) for (var wx = -1; wx <= 1; wx++) if (wx || wz) G.blocked[g._rtsIdx(wtx + wx, wtz + wz)] = 1;
hold([walled, beyond]);
var asks = 0, path0 = g._rtsPath;
g._rtsPath = function (sx, sz, gx, gz) { if (Math.hypot(gx - walled.x, gz - walled.z) < g.RTS_TILE * 2) asks++; return path0.apply(this, arguments); };
run(12, function () { hold([walled, beyond]); });
g._rtsPath = path0;
S.ok('a damaged tank walled in five cells off is asked for a route once, then passed over for the one nine cells off',
     asks === 1 && beyond.hp > 50 && Math.hypot(tr2.x - beyond.x, tr2.z - beyond.z) <= D.heals,
     asks + ' asks in 12 s; the far tank ' + beyond.hp + ' hp, the truck ' + (Math.hypot(tr2.x - beyond.x, tr2.z - beyond.z) / g.RTS_TILE).toFixed(1) + ' cells from it');

/* ---------------- both armies ---------------- */
function canBuild(army) {
  fresh(army);
  ['power', 'power', 'refinery', 'factory'].forEach(function (k) { place('player', k); });
  g._rtsRecalcPower('player');
  var before = !!g._rtsCanQueue('player', 'repairtruck');
  place('player', 'depot'); g._rtsRecalcPower('player');
  return !before && !!g._rtsCanQueue('player', 'repairtruck');
}
S.ok('either army can build one, once it has a Repair Bay', canBuild('allied') && canBuild('soviet'), '');

/* ---------------- the opponent ---------------- */
G = fresh();
['factory', 'radar', 'depot', 'apower', 'apower', 'apower'].forEach(function (k) { if (!g._rtsHas('enemy', k) || /power/.test(k)) place('enemy', k); });
var ey = g._rtsHas('enemy', 'yard');
for (var hv = 0; hv < 3; hv++) g._rtsSpawnUnit('enemy', 'harvester', ey.x + hv * 4, ey.z + 30);
g._rtsSpawnUnit('enemy', 'minelayer', ey.x, ey.z + 24);
g._rtsRecalcPower('enemy');
G.ai.hovQ = { t: 1e9, v: null };
function buys(n) {
  var S2 = G.sides.enemy, got = 0;
  for (var r = 0; r < n; r++) { S2.q = {}; S2.credits = 1e6; S2.ore = 0; g._rtsAIUnits(S2); if (S2.q.vehicle && S2.q.vehicle.key === 'repairtruck') got++; }
  return got;
}
var tanks = [];
for (var k = 0; k < 5; k++) tanks.push(g._rtsSpawnUnit('enemy', 'tank', ey.x + 8 + k * 3, ey.z + 8));
var five = buys(30);
tanks.push(g._rtsSpawnUnit('enemy', 'tank', ey.x + 8, ey.z + 12));
var undefended = buys(30);
/* its own base defended first: four armed buildings of its own */
for (var df = 0; df < 4; df++) { var tw = place('enemy', 'flametower'); if (tw) tw.building = 0; }
var six = buys(30);
S.ok('the opponent buys none with five armed vehicles', five === 0, five + ' of 30');
S.ok('...nor with six while its own base is undefended', undefended === 0, undefended + ' of 30');
S.ok('...and buys one with six once it has four defences of its own', six > 5 && g._rtsAIDefended(), six + ' of 30');
/* a team on the march, and the truck at home with nothing to mend */
var team = g._rtsTeamMake(g.RTS_TEAM_TYPES.filter(function (t) { return t.name === 'Skirmish'; })[0]);   /* a type the house raises before it is alerted, so it is not disbanded */
tanks.forEach(function (u) { g._rtsTeamAdd(team, u); u.init = true; });
team.moving = true; team.hasBeen = true;
var py = g._rtsHas('player', 'yard');
tanks.forEach(function (u) { u.x += (py.x - u.x) * 0.4; u.z += (py.z - u.z) * 0.4; u.order = 'hold'; u.path = null; });
var et = g._rtsSpawnUnit('enemy', 'repairtruck', ey.x, ey.z + 10);
run(60, function () { tanks.forEach(function (u) { u.order = 'hold'; u.path = null; u.hp = u.maxHp; }); });
var c = g._rtsTeamCentre(team), toHome = Math.hypot(ey.x - c.x, ey.z - c.z);
var off = Math.hypot(et.x - c.x, et.z - c.z) / g.RTS_TILE, behind = Math.hypot(ey.x - et.x, ey.z - et.z) < toHome;
S.ok('...and its truck, with nothing to mend, follows the team on the march, a few cells behind it', off < 8 && behind,
     off.toFixed(1) + ' cells from the team\'s centre, ' + (behind ? 'behind' : 'ahead of') + ' it');

require('../lib/report.js')(S);
