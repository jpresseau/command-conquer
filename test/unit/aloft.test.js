/* ALOFT (rules `leviathan` / `falcon` / `jetpack` / `carrier` / `hornet`, weapons `levbomb` /
   `eaglebomb` / `jetgun` / `hornets` / `hornetgun`, core/aloft.js and its hooks in core/combat.js,
   core/move.js, core/bomber.js, core/units.js and core/production.js), on the real simulation:

     WHOSE        the Leviathan is the Dominion's; the Falcon, the Jetpack Trooper and the Carrier the
                  Compact's; a Hornet is never built
     ENDLESS      a Leviathan with no airfield flies on and keeps bombing, where a Kestrel with an
                  empty rack and no pad falls out of the sky
     THE DROP     its bomb falls from where it is and bursts under it: the tank below is hurt, its
                  own side's men below too, and nothing four cells off
     THE FALCON   two bombs, then home to a pad
     THE JETPACK  it flies over water; a rifle cannot touch it, a rocket can; a tank cannot run it
                  down, where it runs a rifleman down; it never goes home to reload
     THE CARRIER  its shot is a Hornet sent at the target - three in the air at most; a Hornet out
                  of rounds goes home and lands, and is counted back in; the Carrier sunk, its
                  Hornets fall
     THE OPPONENT buys the Falcon and the Leviathan and flies each at buildings (batch 12d) */

var { Suite } = require('../lib/assert.js');
var { loadFast } = require('../lib/sandbox.js');

var S = new Suite('aloft');
var g = loadFast(['src/rules', 'src/core', 'src/sprites/props.js']);
var G, M, T = g.RTS_TILE;

function fresh(army) {
  g.window._RTS_ARMY = army || 'allied';
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
function step(secs, each) { for (var t = 0; t < secs * 30; t++) { still.forEach(function (o) { o.cool = 99; o.path = null; o.target = null; o.order = 'hold'; }); if (each) each(); g._rtsTick(1 / 30); } }
var W = function (k) { return g.RTS_WEAPONS[k]; };
function fire(e, tgt, w) { e.cool = 0; g._rtsFire(e, tgt, w); }

/* ---------------------------------------------------------------- whose ---- */
fresh();
var U = function (k) { return g.rtsUnitDef(k); };
S.ok('the Leviathan is the Dominion\'s; the Falcon, the Jetpack Trooper and the Carrier the Compact\'s',
     U('leviathan').side === 'soviet' && ['falcon', 'jetpack', 'carrier'].every(function (k) { return U(k).side === 'allied'; }), '');
S.ok('...and a Hornet is never built: no production line takes one', g._rtsQueueCat('hornet') === null && g._rtsQueueCat('falcon') === 'air', String(g._rtsQueueCat('hornet')));

/* ---------------------------------------------------------------- endless ---- */
var lv = at('player', 'leviathan', 0, 0), mg = at('player', 'mig', 0, 4);
mg.ammo = 0;
var far = at('enemy', 'tank', 14, 0);
g._rtsOrderAttack(lv, far);
S.ok('(the player has no air pad)', !G.ents.some(function (o) { return !o.dead && o.side === 'player' && o.type === 'struct' && (g.rtsStructDef(o.def) || {}).rearm; }), '');
step(4, function () { far.cool = 99; });
S.ok('ENDLESS: a Leviathan with no airfield flies on', !lv.dead && lv.order !== 'rearm', 'order ' + lv.order);
S.ok('...where a Kestrel with an empty rack and no pad falls out of the sky', mg.dead, '');
var n0 = (G.bombs || []).length;
for (var k = 0; k < 6; k++) fire(lv, far, W('levbomb'));
S.eq('...and it keeps bombing: six bombs, six away', (G.bombs || []).length - n0, 6);

/* ---------------------------------------------------------------- the drop ---- */
fresh();
var lv2 = at('player', 'leviathan', 0, 0), tk = at('enemy', 'tank', 0.3, 0), own = at('player', 'rifle', -0.3, 0.3), off = at('enemy', 'tank', 4, 0);
hold([lv2, tk, own, off]);
var h = { tk: tk.hp, own: own.hp, off: off.hp };
fire(lv2, tk, W('levbomb'));
var bomb = (G.bombs || [])[0];
S.ok('THE DROP: the bomb falls from where it is', !!bomb && Math.hypot(bomb.x - lv2.x, bomb.z - lv2.z) < 0.01 && bomb.y > 5, JSON.stringify(bomb));
step(W('levbomb').drop.fall + 0.3);
S.ok('...and bursts under it: the tank below is hurt', h.tk - tk.hp > 100, 'took ' + (h.tk - tk.hp).toFixed(0));
S.ok('...its own side\'s men below too', own.hp < h.own, own.hp + '/' + h.own);
S.eq('...and nothing four cells off', off.hp, h.off);

/* ...AND IT GETS OVER WHAT IT IS SENT AT. A building's range is to its edge, and at a reach of 3
   the airship hovered 3 outside the edge and every bomb burst off the building at two-thirds
   strength: a Refinery bombed for a minute stood at 700 of 950, repaired as fast as it was hit.
   Sent at one from ten tiles off, the first bomb now bursts over it, nearly whole. */
fresh('soviet');
var ref = g._rtsHas('enemy', 'refinery'), lv3 = g._rtsSpawnUnit('player', 'leviathan', ref.x - 10 * T, ref.z);
g._rtsOrderAttack(lv3, ref);
var burst = 0, dmg0 = g._rtsDamage;
g._rtsDamage = function (tgt, n) { if (tgt === ref && !burst) burst = n; return dmg0.apply(this, arguments); };
for (var w3 = 0; w3 < 30 * 30 && !burst; w3++) g._rtsTick(1 / 30);
g._rtsDamage = dmg0;
S.ok('...and sent at a building, it floats over it: the first bomb bursts on it at nearly full weight',
     burst >= 0.85 * W('levbomb').dmg, (burst ? burst.toFixed(0) + ' of ' + W('levbomb').dmg : 'no bomb on it') + ' after ' + (w3 / 30).toFixed(1) + ' s');

/* ---------------------------------------------------------------- the falcon ---- */
fresh();
var yd = g._rtsHas('player', 'yard'), pad = g._rtsPlaceStruct('player', 'helipad', yd.tx + 5, yd.tz + 5, true);
pad.building = 0;
var fc = at('player', 'falcon', 0, 0), tf = at('enemy', 'tank', 2, 0);
fire(fc, tf, W('eaglebomb')); fire(fc, tf, W('eaglebomb'));
S.eq('THE FALCON: two bombs', fc.ammo, 0);
step(0.5, function () { tf.cool = 99; });
S.ok('...then home to a pad', fc.order === 'rearm' || fc.rearming > 0, 'order ' + fc.order);

/* --------------------------------------------------------------- the jetpack ---- */
fresh();
var jp = at('player', 'jetpack', 0, 0);
var wc = null;
for (var i = 0; i < g.RTS_N * g.RTS_N && !wc; i++) if (G.terrain[i] === g.RTS_T_WATER) wc = [i % g.RTS_N, (i / g.RTS_N) | 0];
var pth = g._rtsPathFor(jp, g._rtsWX(wc[0]), g._rtsWX(wc[1]));
S.ok('THE JETPACK: it flies, straight over water', jp.air && !!pth && pth.length === 1, pth ? pth.length + ' waypoint(s)' : 'no path');
S.ok('...a rifle cannot touch it, a rocket can', !g._rtsGunEngages(W('rifle'), jp) && g._rtsGunEngages(W('rocket'), jp), '');
var crusher = at('enemy', 'tank', 6, 6), man = at('player', 'rifle', 6, 6), jp2 = at('player', 'jetpack', 6, 6);
man.x = jp2.x = crusher.x; man.z = jp2.z = crusher.z;
g._rtsOverrun(crusher);
S.ok('...a tank cannot run it down, where it runs a rifleman down', man.dead && !jp2.dead, 'rifle ' + (man.dead ? 'dead' : 'alive') + ', jetpack ' + (jp2.dead ? 'dead' : 'alive'));
S.ok('...and it never goes home to reload', !g._rtsAirHeld(jp, U('jetpack')), '');

/* --------------------------------------------------------------- the carrier ---- */
fresh();
var sea = null;
for (var j = 0; j < g.RTS_N * g.RTS_N && !sea; j++) {
  var tx = j % g.RTS_N, tz = (j / g.RTS_N) | 0;
  if (G.terrain[j] === g.RTS_T_WATER && !g._rtsBlocked(tx, tz, 'sea')) sea = [tx, tz];
}
var cv = g._rtsSpawnUnit('player', 'carrier', g._rtsWX(sea[0]), g._rtsWX(sea[1]));
var tc = g._rtsSpawnUnit('enemy', 'tank', cv.x + 6 * T, cv.z);
fire(cv, tc, W('hornets'));
var hs = function () { return G.ents.filter(function (o) { return !o.dead && o.mother === cv.id; }); };
S.ok('THE CARRIER: its shot is a Hornet sent at the target', hs().length === 1 && hs()[0].def === 'hornet' && hs()[0].target === tc, hs().length + ' hornets');
for (var q = 0; q < 5; q++) fire(cv, tc, W('hornets'));
S.eq('...three in the air at most', hs().length, g.RTS_ALOFT.hornets);
var out = hs();
g._rtsKill(cv);
step(0.2);
S.ok('the Carrier sunk, its Hornets fall', out.length === g.RTS_ALOFT.hornets && out.every(function (o) { return o.dead; }), out.length + ' were out');
/* a second Carrier, for the way home */
var cv2 = g._rtsSpawnUnit('player', 'carrier', g._rtsWX(sea[0]), g._rtsWX(sea[1]));
fire(cv2, tc, W('hornets'));
var hn = G.ents.filter(function (o) { return !o.dead && o.mother === cv2.id; })[0];
if (hn) hn.ammo = 0;
step(8, function () { tc.cool = 99; cv2.cool = 99; });
S.ok('a Hornet out of rounds goes home and lands - and is counted back in', !!hn && hn.dead && g._rtsHornetsOf(cv2) === 0 && !cv2.dead, 'hornet ' + (!hn ? 'never launched' : hn.dead ? 'aboard' : 'still out') + ', ' + g._rtsHornetsOf(cv2) + ' out');

/* ------------------------------------------------------------- opponent ---- */
var A = g.RTS_AI, inMix = function (k) { return Object.keys(A.mix).some(function (c) { return A.mix[c].some(function (m) { return m.key === k; }); }); };
/* Batch 12d: the Falcon and the Leviathan, each flown by a one-plane team; not the Jetpack Trooper
   (in its infantry it ran a mission past its par, unit/campaign-levels4) or the Carrier */
var flies = function (k) { return g.RTS_TEAM_TYPES.some(function (t) { return t.members[k] && Object.keys(t.members).length === 1; }); };
S.ok('THE OPPONENT buys the Falcon and the Leviathan, and a team of one flies each',
     ['falcon', 'leviathan'].every(function (k) { return inMix(k) && flies(k); }), '');
S.ok('...not the Jetpack Trooper, the Carrier or a Hornet', !['jetpack', 'carrier', 'hornet'].some(inMix), '');
/* ...and in a match: rich, with an Airfield and a Research Lab, the Dominion opponent buys a
   Leviathan and its team sends it at the player's base. An A/B in one sandbox: without the
   Zeppelin team the same airship stays at home. */
function zeppelin(secs) {
  fresh('allied');
  var y = g._rtsHas('enemy', 'yard'), put = 0;
  ['afld', 'lab'].forEach(function (k) {
    var b = null;
    for (var r = 3; r < 14 && !b; r++) for (var dz = -r; dz <= r && !b; dz++) for (var dx = -r; dx <= r && !b; dx++)
      b = g._rtsPlaceStruct('enemy', k, y.tx + dx, y.tz + dz, false);
    if (b) { b.building = 0; put++; }
  });
  g._rtsRecalcPower('enemy');
  var lev = null, sent = null;
  for (var t = 0; t < secs * 30 && !G.over && !sent; t++) {
    if (t % 300 === 0) G.sides.enemy.credits = Math.max(G.sides.enemy.credits, 8000);
    g._rtsTick(1 / 30);
    if (!lev) lev = G.ents.filter(function (o) { return !o.dead && o.side === 'enemy' && o.def === 'leviathan'; })[0] || null;
    if (lev && lev.target && lev.target.side === 'player' && lev.target.type === 'struct') sent = lev.target.def;
  }
  return { put: put, lev: !!lev, sent: sent, t: Math.round(G.t) };
}
var zp = zeppelin(300);
S.ok('...and in a match, rich with an Airfield and a Lab, it buys a Leviathan and sends it at the player\'s base',
     zp.put === 2 && zp.lev && !!zp.sent, (zp.put === 2 ? '' : 'placed ' + zp.put + ' of 2; ') + (zp.lev ? 'bought' : 'none bought') + ', ' + (zp.sent ? 'sent at a ' + zp.sent : 'not sent') + ' by ' + zp.t + ' s');
var TT = g.RTS_TEAM_TYPES, zi = TT.findIndex(function (t) { return t.name === 'Zeppelin'; }), zt = TT.splice(zi, 1)[0];
var zn = zeppelin(zp.t + 30);
TT.splice(zi, 0, zt);
S.ok('...and without the Zeppelin team, the same airship stays at home', zn.lev && !zn.sent, (zn.lev ? 'bought' : 'none bought') + ', ' + (zn.sent ? 'sent at a ' + zn.sent : 'not sent') + ' by ' + zn.t + ' s');

require('../lib/report.js')(S);
