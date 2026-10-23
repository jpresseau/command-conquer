/* RADIATION (rules `blight` / `reactor`, weapon `blightgun`, core/rad.js and its hooks in
   core/combat.js, core/capture.js, core/tick.js and core/dig.js), on the real simulation:

     WHOSE        the Blight Trooper and the Fission Reactor are the Dominion's, after a Research Lab
     THE RAY      a Blight Trooper's shot hurts, and leaves a pool of poison where it lands
     THE POOL     infantry standing in it burn; a tank burns far less; its own side's men burn too;
                  a Blight Trooper, a building and an aircraft do not
     ONE POOL     five shots at one spot make one pool, not five
     IT FADES     the pool is gone after its life, and the man standing there stops burning
     DEPLOYED     DEPLOY and the ground round it burns - two cells off, not four - for as long as it
                  stands; a move order stops it
     MELTDOWN     a Fission Reactor destroyed leaves the widest pool of all; one sold leaves none
     SAVED        a save keeps a pool
     THE OPPONENT builds the reactor; the trooper waits for batch 12, as the explosives do */

var { Suite } = require('../lib/assert.js');
var { loadFast } = require('../lib/sandbox.js');

var S = new Suite('rad');
var g = loadFast(['src/rules', 'src/core', 'src/sprites/props.js', 'src/rts.save.js']);
var G, M, T = g.RTS_TILE;

function fresh() {
  g.window._RTS_ARMY = 'soviet';
  g._rtsNewGame(7, 'normal');
  G = g._rtsG; G.over = null;
  G.ents.forEach(function (e) { if (e.type === 'unit') e.dead = true; });
  g._rtsTick(1 / 30);
  var a = g._rtsHas('player', 'yard'), b = g._rtsHas('enemy', 'yard');
  M = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
}
function at(side, key, dx, dz) { return g._rtsSpawnUnit(side, key, M.x + dx * T, M.z + dz * T); }
var still = [];
function hold(list) { still = list; }
var quiet = [];                                  /* free to move, but holding their fire */
function step(secs) { for (var t = 0; t < secs * 30; t++) { still.forEach(function (o) { o.cool = 99; o.path = null; o.target = null; o.order = 'hold'; }); quiet.forEach(function (o) { o.cool = 99; o.target = null; }); g._rtsTick(1 / 30); } }
var W = function () { return g.RTS_WEAPONS.blightgun; };
function fire(e, tgt) { e.cool = 0; g._rtsFire(e, tgt, W()); }
var lost = function (o, h) { return h - Math.max(0, o.hp); };

/* ---------------------------------------------------------------- whose ---- */
fresh();
var bd = g.rtsUnitDef('blight'), rd = g.rtsStructDef('reactor');
S.ok('the Blight Trooper and the Fission Reactor are the Dominion\'s, after a Research Lab',
     bd.side === 'soviet' && bd.needs.indexOf('lab') >= 0 && rd.side === 'soviet' && rd.needs.indexOf('lab') >= 0 && rd.power > 0, '');

/* ----------------------------------------------------------------- the ray ---- */
var bl = at('player', 'blight', 0, 0), vic = at('enemy', 'rifle', 2, 0);
hold([bl, vic]);
var v0 = vic.hp;
fire(bl, vic);
S.ok('THE RAY hurts, and leaves a pool of poison where it lands', vic.hp < v0 && (G.rads || []).length === 1 && Math.hypot(G.rads[0].x - vic.x, G.rads[0].z - vic.z) < 0.01,
     'hp ' + vic.hp + ', pools ' + (G.rads || []).length);

/* ---------------------------------------------------------------- the pool ---- */
fresh();
var src = at('player', 'blight', -6, 0), spot = { x: M.x, z: M.z };
var rf = at('enemy', 'rifle', 0, 0), tk = at('enemy', 'tank', 0.3, 0.3), own = at('player', 'rifle', -0.3, 0.2), b2 = at('player', 'blight', 0.2, -0.3);
var heli = at('enemy', 'heli', 0.1, 0.1), bld = g._rtsPlaceStruct('enemy', 'power', 0, 0, true);
bld.x = M.x + 0.5 * T; bld.z = M.z - 0.5 * T; bld.building = 0;
hold([src, rf, tk, own, b2, heli]);
heli.x = M.x; heli.z = M.z;
g._rtsRadPool(spot.x, spot.z, W().rad, 'player');
var h = { rf: rf.hp, tk: tk.hp, own: own.hp, b2: b2.hp, heli: heli.hp, bld: bld.hp };
step(2);
heli.x = M.x; heli.z = M.z;
S.ok('THE POOL: infantry standing in it burn', lost(rf, h.rf) > 10, 'rifle lost ' + lost(rf, h.rf).toFixed(1));
S.ok('...a tank far less', lost(tk, h.tk) > 0 && lost(tk, h.tk) < lost(rf, h.rf) * 0.5, 'tank ' + lost(tk, h.tk).toFixed(1) + ' to the rifle\'s ' + lost(rf, h.rf).toFixed(1));
S.ok('...its own side\'s men burn too', lost(own, h.own) > 5, lost(own, h.own).toFixed(1));
S.ok('...and a Blight Trooper, a building and an aircraft do not', b2.hp === h.b2 && bld.hp === h.bld && heli.hp === h.heli, 'blight ' + b2.hp + '/' + h.b2 + ', building ' + bld.hp + '/' + h.bld + ', heli ' + heli.hp + '/' + h.heli);

/* ---------------------------------------------------------------- one pool ---- */
fresh();
var bl3 = at('player', 'blight', 0, 0), dummy = at('enemy', 'heavy', 2, 0);
hold([bl3, dummy]);
for (var k = 0; k < 5; k++) fire(bl3, dummy);
S.eq('ONE POOL: five shots at one spot make one pool, not five', (G.rads || []).length, 1);

/* ---------------------------------------------------------------- it fades ---- */
step(W().rad.life + 1);
S.eq('IT FADES: the pool is gone after its life', (G.rads || []).length, 0);
var dh = dummy.hp;
step(2);
S.eq('...and the tank standing there stops burning', dummy.hp, dh);

/* --------------------------------------------------------------- deployed ---- */
fresh();
/* tanks, so nothing dies and stops counting: a rifleman two cells off is dead in two seconds */
var bl4 = at('player', 'blight', 0, 0), near = at('enemy', 'heavy', 2, 0), far = at('enemy', 'heavy', 4, 0);
hold([near, far]); quiet = [bl4];
var n0 = near.hp, f0 = far.hp;
S.ok('(a Blight Trooper can deploy)', g._rtsCanDig(bl4) && g._rtsDigToggle(bl4) && bl4.dug, '');
step(2);
S.ok('DEPLOYED, the ground round it burns: two cells off', lost(near, n0) > 5 && !near.dead, lost(near, n0).toFixed(1));
S.eq('...but not four', far.hp, f0);
g._rtsOrderMove(bl4, bl4.x - 8 * T, bl4.z, false);
var n1 = near.hp;
step(1.5);
S.ok('a move order stops it', !bl4.dug && !near.dead && near.hp === n1, 'dug ' + bl4.dug + ', lost ' + lost(near, n1).toFixed(1));

/* --------------------------------------------------------------- meltdown ---- */
fresh();
var yd = g._rtsHas('player', 'yard'), rc = g._rtsPlaceStruct('player', 'reactor', yd.tx + 6, yd.tz + 6, true);
rc.building = 0;
var mx = rc.x, mz = rc.z;
g._rtsKill(rc);
var pool = (G.rads || [])[0];
S.ok('MELTDOWN: a Fission Reactor destroyed leaves the widest pool of all', !!pool && pool.r === rd.meltdown.r && pool.r > W().rad.r * 3 && Math.hypot(pool.x - mx, pool.z - mz) < 0.01,
     pool ? (pool.r / T).toFixed(1) + ' cells' : 'none');
fresh();
yd = g._rtsHas('player', 'yard');
var rc2 = g._rtsPlaceStruct('player', 'reactor', yd.tx + 6, yd.tz + 6, true);
rc2.building = 0; rc2.selling = true;
g._rtsKill(rc2);
S.eq('...one sold leaves none', (G.rads || []).length, 0);

/* ------------------------------------------------------------------ saved ---- */
g._rtsRadPool(M.x, M.z, rd.meltdown, 'player');
var body = JSON.parse(JSON.stringify(g._rtsSaveState(G)));
g._rtsNewGame(7, 'normal'); g._rtsApplyState(g._rtsG, body); G = g._rtsG;
S.ok('SAVED: a save keeps a pool', (G.rads || []).length === 1 && G.rads[0].r === rd.meltdown.r, JSON.stringify(G.rads));

/* ------------------------------------------------------------- opponent ---- */
var A = g.RTS_AI;
/* the trooper burns its own side's men too, so it waits, as the explosives do, for batch 12 */
S.ok('the opponent builds the reactor, and does not buy the Blight Trooper',
     A.buildOrder.indexOf('reactor') >= 0 && !A.mix.infantry.some(function (m) { return m.key === 'blight'; }), '');

require('../lib/report.js')(S);
