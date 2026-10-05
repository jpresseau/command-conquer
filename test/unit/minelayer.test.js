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
var g = load(['src/rules', 'src/core', 'src/sprites/props.js', 'src/rts.save.js']);

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
var early = run(g.RTS_MINE.arm * 0.9, function () { return !G.mines.length; });
under.x = c.x; under.z = c.z;                               /* still standing there */
var later = run(g.RTS_MINE.arm * 0.1 + 0.2, function () { return !G.mines.length; });
S.ok('a mine laid under an enemy waits out its arming before it goes off - the whole of RTS_MINE.arm, and no longer', !early && later,
     'went off ' + (early ? 'before ' + (g.RTS_MINE.arm * 0.9).toFixed(2) + ' s' : later ? 'between ' + (g.RTS_MINE.arm * 0.9).toFixed(2) + ' and ' + (g.RTS_MINE.arm + 0.2).toFixed(2) + ' s' : 'never'));

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
/* the blast round it is a splash: an enemy tank in the next cell is hurt, and a fraction of what
   the one that trod on it takes (the blast is no respecter of sides - a tank of the layer's own
   beside it takes the same splash) */
G = fresh();
var bp = open(), by = g._rtsSpawnUnit('player', 'minelayer', bp.x, bp.z);
g._rtsLayMine(by); by.x = open(12).x;
run(g.RTS_MINE.arm + 0.5);
var tread = g._rtsSpawnUnit('enemy', 'tank', bp.x, bp.z), side = g._rtsSpawnUnit('enemy', 'tank', bp.x + g.RTS_TILE, bp.z);
G.ents.forEach(function (u) { if (u.type === 'unit' && u.side === 'player' && u !== by) u.dead = true; });   /* nothing to shoot at: the blast alone */
[tread, side].forEach(function (u) { u.order = 'hold'; u.path = null; });
var sideHp = side.hp, treadHp = tread.hp;
run(1, function () { return !G.mines.length; });
run(0.5);
S.ok('an enemy tank in the next cell takes the splash - a fraction of what the one that trod on it takes',
     !G.mines.length && side.hp < sideHp && (sideHp - side.hp) < (treadHp - (tread.dead ? 0 : tread.hp)) * 0.25,
     'beside: ' + (sideHp - side.hp).toFixed(0) + ' of ' + sideHp + '; on it: ' + (treadHp - (tread.dead ? 0 : tread.hp)).toFixed(0));
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
run(g.RTS_MINE.restock * 1.5);
var oneSoFar = ly.mines;
run(g.RTS_MINE.restock * 4);
S.eq('parked on it, the layer is loaded back to five', ly.mines, 5);
S.ok('...one mine every RTS_MINE.restock seconds, not all at once', oneSoFar === 1, oneSoFar + ' after ' + (g.RTS_MINE.restock * 1.5) + ' s');
/* browned out, the bay loads nothing - the depot's repairs stop with the power, and the rack with them */
ly.mines = 0;
var pf0 = g._rtsPowerFactor; g._rtsPowerFactor = function () { return 0.5; };
run(g.RTS_MINE.restock * 2.5);
g._rtsPowerFactor = pf0;
S.eq('...and none while the base is browned out', ly.mines, 0);
ly.mines = 5;

/* ---------------- saved ---------------- */
/* the real round trip (rts.save.js), not a look for the key: through JSON and back, with a field
   of three laid first */
for (var lm = 0; lm < 3; lm++) { var lc = open(lm * 2 - 2); ly.x = lc.x; ly.z = lc.z; g._rtsLayMine(ly); }
var snap = JSON.parse(JSON.stringify(g._rtsSaveState(G))), laid = G.mines.length, hits0 = (G.mineHits || []).length, mines0 = G.mines.map(function (m) { return m.tx + ',' + m.tz + ',' + m.side; });
var G2 = fresh();
g._rtsApplyState(G2, snap);
S.ok('the mines are part of the state a save carries: a round trip brings every one back, cell and side', laid > 0 && G2.mines.length === laid &&
     G2.mines.every(function (m, i) { return m.tx + ',' + m.tz + ',' + m.side === mines0[i]; }) && (G2.mineHits || []).length === hits0,
     laid + ' mines before, ' + G2.mines.length + ' after');
var t2 = G2.t; run(1);
S.ok('...and the game ticks on from it', G2.t > t2 && G2.mines.length === laid, '');

/* ---------------- told why ---------------- */
G = fresh();
var said = [], say0 = g._rtsSay; g._rtsSay = function (m) { said.push(m); };
var deck = (G.bridges || []).length ? g._rtsBridgeCells(G.bridges[0]).filter(function (i) { return G.terrain[i] === g.RTS_T_WATER; })[0] : null;
S.ok('the case: the map has a bridge deck to drive onto', deck != null, (G.bridges || []).length + ' bridges');
var onDeck = deck != null ? g._rtsSpawnUnit('player', 'minelayer', g._rtsWX(deck % g.RTS_N), g._rtsWX((deck / g.RTS_N) | 0)) : null;
var laidOnDeck = onDeck ? g._rtsLayMine(onDeck) : null;
g._rtsSay = say0;
S.ok('on a deck, DEPLOY lays nothing and says why, where it used to say nothing', laidOnDeck === false && !!onDeck && onDeck.mines === 5 && said.length === 1 && /deck/.test(said[0]), said.join(' | ') || 'silent');
/* and on a flat the tide has dried - the causeway the tide opens, the most natural place to deny */
G.t = g.RTS_TIDE.period / 2; g._rtsTideTick(0);
var flatI = -1;
for (var fi3 = 0; fi3 < G.tideDry.length && flatI < 0; fi3++) if (G.tideDry[fi3]) flatI = fi3;
said = []; g._rtsSay = function (m) { said.push(m); };
var onFlat = flatI >= 0 ? g._rtsSpawnUnit('player', 'minelayer', g._rtsWX(flatI % g.RTS_N), g._rtsWX((flatI / g.RTS_N) | 0)) : null;
if (onFlat) { onFlat.x = g._rtsWX(flatI % g.RTS_N); onFlat.z = g._rtsWX((flatI / g.RTS_N) | 0); }
var laidOnFlat = onFlat ? g._rtsLayMine(onFlat) : null;
g._rtsSay = say0;
S.ok('...and on a flat the tide has dried, likewise', flatI >= 0 && laidOnFlat === false && said.length === 1 && /flats/.test(said[0]), said.join(' | ') || 'silent');

require('../lib/report.js')(S);
