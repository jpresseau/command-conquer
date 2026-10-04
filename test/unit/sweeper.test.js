/* THE MINE SWEEPER (rules/units.js `sweeper`, core/sweeper.js), on the real simulation:

     IT FINDS     an enemy mine three cells from it is shown to its side from then on; one six
                  cells off is not; a tank of the same side finds nothing
     IT CLEARS    sent at a field of three, it clears all three - beating each out once in reach -
                  and nothing goes off
     IT IS SAFE   driven straight over an armed enemy mine it sets nothing off and loses no
                  armour, where a tank on the same mine is blown up
     BOTH ARMIES  either side can build one, behind a Vehicle Works
     THE OPPONENT buys one once a player mine has cost it a unit, and not before; its sweeper
                  goes to where that happened and clears the mine still lying beside it */

var { Suite } = require('../lib/assert.js');
var { load } = require('../lib/sandbox.js');

var S = new Suite('sweeper');
var g = load(['src/rules', 'src/core', 'src/sprites/props.js']);

function fresh(army) {
  g.window._RTS_ARMY = army || 'allied';
  g._rtsNewGame(4242, 'easy');
  var G = g.window._rtsG;
  G.over = null;
  G.ents.forEach(function (e) { if (e.type === 'unit') e.dead = true; });
  g._rtsTick(1 / 30);
  G.teams = {}; G.mines = []; G.mineHits = [];
  return G;
}
function run(secs, each) { for (var t = 0; t < secs * 30; t++) { if (each) each(); g._rtsTick(1 / 30); } }
function middle() {
  var c = g._rtsNearestOpen(g.RTS_N >> 1, g.RTS_N >> 1, 20, null);
  return { tx: c[0], tz: c[1], x: g._rtsWX(c[0]), z: g._rtsWX(c[1]) };
}
/* an armed mine of `side` on the open cell nearest (tx, tz) */
function mine(side, tx, tz) {
  var c = g._rtsNearestOpen(tx, tz, 3, null), m = { tx: c[0], tz: c[1], side: side, arm: 0 };
  g.window._rtsG.mines.push(m);
  return m;
}
function place(side, k) {
  var yd = g._rtsHas(side, 'yard');
  for (var r = 4; r < 30; r++) for (var a = 0; a < 8; a++) {
    var sp = g._rtsNearestOpen(yd.tx + Math.round(Math.cos(a) * r), yd.tz + Math.round(Math.sin(a) * r), 3, null);
    if (sp && g._rtsCanPlace(side, k, sp[0], sp[1], true)) return g._rtsPlaceStruct(side, k, sp[0], sp[1], true);
  }
  return null;
}
var booms = 0, mineDmg = g.RTS_MINE.dmg, dmg0 = g._rtsDamage;
g._rtsDamage = function (t, d, from) { if (!from && d === mineDmg) booms++; return dmg0.apply(this, arguments); };

/* ---------------- it finds ---------------- */
var G = fresh(), m = middle();
var sw = g._rtsSpawnUnit('player', 'sweeper', m.x, m.z); sw.order = 'hold';
var near = mine('enemy', m.tx + 3, m.tz), far = mine('enemy', m.tx - 6, m.tz);
g._rtsTick(1 / 30);
S.ok('an enemy mine three cells off is shown to the sweeper\'s side', g._rtsMineShown(near, 'player'), '');
S.ok('...and one six cells off is not', !g._rtsMineShown(far, 'player'), '');
G = fresh(); m = middle();
var tk = g._rtsSpawnUnit('player', 'tank', m.x, m.z); tk.order = 'hold';
var near2 = mine('enemy', m.tx + 3, m.tz);
run(1);
S.ok('...and a tank of the same side finds nothing', !g._rtsMineShown(near2, 'player'), '');

/* ---------------- it clears ---------------- */
G = fresh(); m = middle();
sw = g._rtsSpawnUnit('player', 'sweeper', m.x, m.z);
var field = [mine('enemy', m.tx + 6, m.tz), mine('enemy', m.tx + 7, m.tz + 2), mine('enemy', m.tx + 8, m.tz - 1)];
booms = 0;
g._rtsOrderMove(sw, g._rtsWX(m.tx + 5), m.z, false);
var hp0 = sw.hp;
run(40, function () { if (!G.mines.length) return; });
S.ok('sent at a field of three, it clears all three', G.mines.length === 0, G.mines.length + ' left');
S.ok('...and nothing goes off', booms === 0 && sw.hp === hp0, booms + ' blasts, ' + sw.hp + ' of ' + hp0);

/* ---------------- it is safe ---------------- */
function overMine(key) {
  var G = fresh(), m = middle();
  var u = g._rtsSpawnUnit('player', key, g._rtsWX(m.tx - 4), m.z);
  var mn = mine('enemy', m.tx, m.tz);
  booms = 0;
  var h0 = u.hp;
  g._rtsOrderMove(u, g._rtsWX(m.tx + 4), m.z, false);
  var crossed = false;
  run(12, function () { if (Math.abs(g._rtsTX(u.x) - mn.tx) <= 0 && Math.abs(g._rtsTX(u.z) - mn.tz) <= 0) crossed = true; });
  return { booms: booms, hurt: h0 - (u.dead ? 0 : u.hp), crossed: crossed || u.dead };
}
var swOver = overMine('sweeper'), tkOver = overMine('tank');
S.ok('a tank driven over an armed enemy mine is blown up', tkOver.booms === 1 && tkOver.hurt > 0, JSON.stringify(tkOver));
S.ok('...and the sweeper driven the same way sets nothing off and loses nothing', swOver.booms === 0 && swOver.hurt === 0, JSON.stringify(swOver));

/* ---------------- both armies ---------------- */
function canBuild(army) {
  fresh(army);
  ['power', 'power', 'refinery', 'factory'].forEach(function (k) { place('player', k); });
  g._rtsRecalcPower('player');
  return !!g._rtsCanQueue('player', 'sweeper');
}
S.ok('either army can build one, behind a Vehicle Works', canBuild('allied') && canBuild('soviet'), '');

/* ---------------- the opponent ---------------- */
G = fresh('allied');
['factory', 'radar', 'depot', 'apower', 'apower', 'apower'].forEach(function (k) { if (!g._rtsHas('enemy', k) || /power/.test(k)) place('enemy', k); });
var ey = g._rtsHas('enemy', 'yard');
for (var hv = 0; hv < 3; hv++) g._rtsSpawnUnit('enemy', 'harvester', ey.x + hv * 4, ey.z + 30);
g._rtsSpawnUnit('enemy', 'minelayer', ey.x, ey.z + 24);
g._rtsRecalcPower('enemy');
G.ai.hovQ = { t: 1e9, v: null };                                    /* no sea raid in the way */
function buys(n) {
  var S2 = G.sides.enemy, got = 0;
  for (var r = 0; r < n; r++) { S2.q = {}; S2.credits = 1e6; S2.ore = 0; g._rtsAIUnits(S2); if (S2.q.vehicle && S2.q.vehicle.key === 'sweeper') got++; }
  return got;
}
var before = buys(30);
/* a player minefield on open ground; an enemy tank driven onto the first mine of it */
m = middle();
var pm = [mine('player', m.tx, m.tz), mine('player', m.tx + 1, m.tz + 2)];
var victim = g._rtsSpawnUnit('enemy', 'tank', g._rtsWX(pm[0].tx), g._rtsWX(pm[0].tz));
g._rtsTick(1 / 30);
var after = buys(30);
S.ok('the opponent buys none before a player mine has cost it a unit', before === 0 && G.mineHits.length === 1, before + ' of 30; hits ' + G.mineHits.length);
S.ok('...and buys one once one has', after > 5, after + ' of 30');
/* its sweeper, from home, goes to where it happened and clears the mine still lying beside it */
var esw = g._rtsSpawnUnit('enemy', 'sweeper', ey.x + g.RTS_TILE * 4, ey.z);
var left = pm[1];
run(150, function () { G.ents.forEach(function (e) { if (e.side === 'player' && e.type === 'unit') e.dead = true; }); });
S.ok('...and its sweeper goes there and clears the mine still lying beside it', G.mines.indexOf(left) < 0 && !esw.dead,
     (G.mines.indexOf(left) < 0 ? 'cleared' : 'still there') + ', sweeper ' + Math.round(Math.hypot(esw.x - g._rtsWX(left.tx), esw.z - g._rtsWX(left.tz)) / g.RTS_TILE) + ' cells from it');

g._rtsDamage = dmg0;
require('../lib/report.js')(S);
