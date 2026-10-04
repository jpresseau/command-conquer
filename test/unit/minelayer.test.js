/* THE MINE LAYER (rules/units.js `minelayer`, core/mines.js). Its verb is DENIAL, staged on the
   real simulation:

     LAYING      DEPLOY lays one where it stands, five to a load; not two on one cell, not in
                 the water, and not once the rack is empty
     ARMING      a fresh mine does not go off under the layer that dropped it, nor under anything
                 of its own side once armed; laid under an enemy, it waits out its arming first
     THE BLAST   an enemy tank driving across an armed mine is wrecked and the mine is spent; an
                 enemy squad is killed outright; an aircraft passes over it
     HIDDEN      a side sees its own mines and no one else's
     RESTOCK     parked on a powered Repair Bay, an empty layer is loaded back to five
     SAVED       the mines are part of the game state a save carries */

var { Suite } = require('../lib/assert.js');
var { load } = require('../lib/sandbox.js');

var S = new Suite('minelayer');
var g = load(['src/rules', 'src/core', 'src/sprites/props.js']);

function fresh() {
  g._rtsNewGame(4242, 'easy');
  var G = g.window._rtsG;
  G.over = null;
  G.ents.forEach(function (e) { if (e.type === 'unit') e.dead = true; });
  g._rtsTick(1 / 30);
  G.teams = {};
  return G;
}
function open(dx) {
  var c = g._rtsNearestOpen((g.RTS_N >> 1) + (dx || 0), g.RTS_N >> 1, 20, null);
  return { tx: c[0], tz: c[1], x: g._rtsWX(c[0]), z: g._rtsWX(c[1]) };
}
function run(secs, stop) {
  for (var t = 0; t < secs * 30; t++) { g._rtsTick(1 / 30); if (stop && stop()) return true; }
  return false;
}

/* ---------------- the roster ---------------- */
var d = g.rtsUnitDef('minelayer');
S.ok('the Mine Layer is in the roster: unarmed, five mines, from the Repair Bay up',
     !!(d && !d.weapon && d.mines === 5 && d.needs.indexOf('depot') >= 0 && !d.side),
     d ? 'mines ' + d.mines + ', needs ' + d.needs + ', side ' + d.side : 'missing');

/* ---------------- laying ---------------- */
var G = fresh(), c = open(), ly = g._rtsSpawnUnit('player', 'minelayer', c.x, c.z);
S.ok('it offers the DEPLOY order', g._rtsCanDeploy(ly), '');
G.sel = [ly];
S.eq('DEPLOY lays one where it stands', g._rtsDeploySelected(), 1);
S.ok('...on its own cell, with four left', G.mines.length === 1 && G.mines[0].tx === g._rtsTX(ly.x) && ly.mines === 4,
     G.mines.length + ' mines, ' + ly.mines + ' left');
S.eq('...and not a second on the same cell', g._rtsDeploySelected(), 0);
var laid = 1;
for (var k = 1; k < 7; k++) { ly.x += g.RTS_TILE; if (g._rtsLayMine(ly)) laid++; }
S.ok('five to a load, and none once the rack is empty', laid === 5 && ly.mines === 0 && G.mines.length === 5,
     laid + ' laid, ' + ly.mines + ' left');

/* ---------------- arming, and its own side ---------------- */
G = fresh(); c = open();
ly = g._rtsSpawnUnit('player', 'minelayer', c.x, c.z);
g._rtsLayMine(ly);
var hp0 = ly.hp;
run(3);
S.ok('a mine does not go off under the layer that dropped it', G.mines.length === 1 && ly.hp === hp0,
     G.mines.length + ' mines, layer at ' + ly.hp + ' of ' + hp0);
var own = g._rtsSpawnUnit('player', 'tank', c.x, c.z);
run(1);
S.ok('...nor under anything of its own side, armed', G.mines.length === 1 && own.hp === own.maxHp,
     G.mines.length + ' mines, tank at ' + own.hp);

/* ...and not a weapon to drop under the enemy's feet: a mine laid with an enemy squad standing
   on its cell waits out its arming before it will go off */
G = fresh(); c = open();
ly = g._rtsSpawnUnit('player', 'minelayer', c.x, c.z);
var under = g._rtsSpawnUnit('enemy', 'rifle', c.x, c.z);
under.order = 'hold';
g._rtsLayMine(ly);
ly.x += 6 * g.RTS_TILE;
var early = run(g.RTS_MINE.arm * 0.6, function () { return !G.mines.length; });
under.x = c.x; under.z = c.z;                               /* still standing there */
var later = run(g.RTS_MINE.arm + 1, function () { return !G.mines.length; });
S.ok('a mine laid under an enemy waits out its arming before it goes off', !early && later,
     'went off ' + (early ? 'at once' : later ? 'once armed' : 'never'));

/* ---------------- the blast ---------------- */
function crossing(def, air) {
  var G2 = fresh(), p = open(), q = open(12);
  var lay = g._rtsSpawnUnit('player', 'minelayer', p.x, p.z);
  g._rtsLayMine(lay);
  lay.x = q.x; lay.z = q.z;                             /* out of the blast */
  run(2);
  var foe = g._rtsSpawnUnit('enemy', def, p.x - 4 * g.RTS_TILE, p.z);
  if (air) foe.alt = foe.alt || 12;
  g._rtsOrderMove(foe, p.x + 4 * g.RTS_TILE, p.z, false);
  var gone = run(12, function () { return !G2.mines.length || foe.dead; });
  return { foe: foe, mines: G2.mines.length, crossed: Math.abs(foe.x - p.x) < 2 * g.RTS_TILE || foe.x > p.x };
}
var tk = crossing('tank');
S.ok('an enemy tank driving across an armed mine is wrecked, and the mine is spent',
     tk.mines === 0 && (tk.foe.dead || tk.foe.hp < tk.foe.maxHp * 0.6),
     'tank ' + (tk.foe.dead ? 'destroyed' : 'at ' + Math.round(tk.foe.hp / tk.foe.maxHp * 100) + '%') + ', ' + tk.mines + ' mines left');
var sq = crossing('rifle');
S.ok('...an enemy squad is killed outright', sq.mines === 0 && sq.foe.dead, sq.foe.dead ? 'dead' : 'alive at ' + sq.foe.hp);
var fl = crossing('heli', true);
S.ok('...and an aircraft passes over it', fl.mines === 1 && !fl.foe.dead && fl.foe.hp === fl.foe.maxHp && fl.crossed,
     fl.mines + ' mines, aircraft at ' + fl.foe.hp + (fl.crossed ? ', crossed' : ', never got there'));

/* ---------------- hidden ---------------- */
G = fresh();
G.mines = [{ tx: 1, tz: 1, side: 'player', arm: 0 }, { tx: 2, tz: 2, side: 'enemy', arm: 0 }];
S.ok('a side sees its own mines and no one else\'s',
     g._rtsMineShown(G.mines[0], 'player') && !g._rtsMineShown(G.mines[1], 'player') &&
     g._rtsMineShown(G.mines[1], 'enemy') && !g._rtsMineShown(G.mines[0], 'enemy'), '');

/* ---------------- restock ---------------- */
G = fresh();
var bay = g._rtsHas('player', 'depot');
if (!bay) {
  var yd = g._rtsHas('player', 'yard');
  for (var r = 4; r < 20 && !bay; r++) {
    var sp = g._rtsNearestOpen(yd.tx + r, yd.tz, 4, null);
    if (sp && g._rtsCanPlace('player', 'depot', sp[0], sp[1], true)) bay = g._rtsPlaceStruct('player', 'depot', sp[0], sp[1], true);
  }
}
['apower', 'apower'].forEach(function (k) {
  var yd2 = g._rtsHas('player', 'yard');
  for (var r2 = 4; r2 < 30; r2++) { var s2 = g._rtsNearestOpen(yd2.tx - r2, yd2.tz + 3, 4, null); if (s2 && g._rtsCanPlace('player', k, s2[0], s2[1], true)) { g._rtsPlaceStruct('player', k, s2[0], s2[1], true); break; } }
});
g._rtsRecalcPower('player');
ly = g._rtsSpawnUnit('player', 'minelayer', bay.x, bay.z);
ly.mines = 0; ly.path = null; ly.order = 'hold';
S.ok('the case: a powered Repair Bay with an empty layer parked on it',
     !!bay && g._rtsPowerFactor('player') >= 0.999 && g._rtsAtStruct(ly, bay, g.rtsStructDef('depot').repairs), '');
run(6 * 4 + 1);
S.eq('parked on it, the layer is loaded back to five', ly.mines, 5);

/* ---------------- saved ---------------- */
var keys = Object.keys(G);
S.ok('the mines are part of the state a save carries', keys.indexOf('mines') >= 0 && Array.isArray(G.mines), keys.length + ' keys');

require('../lib/report.js')(S);
