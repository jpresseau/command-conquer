/* THE CHINOOK (rules/units.js 'tran'), played out on the real simulation without a screen.

     THE VERB      five riflemen board it, it flies them to ground no squad can walk to from
                   where they stood, and puts all five down there - alive, out of the hold, on
                   their feet on open ground
     NOTHING TO    it carries no weapon, so it never flies home to reload: idle beside a pad it
     RELOAD        stays where it is, and with every pad gone it does not crash
     THE BEACH     hovering two tiles off a shore, where it cannot set down, it is boarded from
                   the sand
     IT SETS DOWN  idle over open ground it eases down to RTS_AIR_SET, and lifts again the moment
                   it is sent somewhere; over water it hovers; a gunship waiting never lands
     HOW IT SOUNDS a rotor, not a jet (rts.ambience.js reads the model's parts) */

var { Suite } = require('../lib/assert.js');
var { load } = require('../lib/sandbox.js');

var S = new Suite('chinook');
var SRC = ['src/rules', 'src/core', 'src/sprites/unit-airsea.js', 'src/rts.ambience.js'];
function fresh(seed) {
  var g = load(SRC);
  g._rtsNewGame(seed, 'easy');
  g.window._rtsG.over = null;
  /* the opponent stays home: this is about the lift, not about who shoots it down */
  g.window._rtsG.ents.forEach(function (e) { if (e.side === 'enemy' && e.type === 'unit') e.dead = true; });
  return g;
}
function run(g, sec, until) {
  for (var t = 0; t < sec * 30; t++) { g._rtsTick(1 / 30); if (until && until()) return t / 30; }
  return sec;
}

/* ---- THE VERB ---- */
var g = fresh(7), G = g.window._rtsG, yd = g._rtsHas('player', 'yard');
var st = g._rtsNearestOpen(yd.tx + 4, yd.tz + 4, 10, null), sx = g._rtsWX(st[0]), sz = g._rtsWX(st[1]);
/* the far side: open land the pathfinder cannot reach on foot from the start - found, not assumed */
var far = null;
for (var r = 6; r < 40 && !far; r += 2) for (var a = 0; a < 24 && !far; a++) {
  var tx = Math.round(st[0] + Math.cos(a / 24 * 6.283) * r), tz = Math.round(st[1] + Math.sin(a / 24 * 6.283) * r);
  if (g._rtsInB(tx, tz) && !g._rtsBlocked(tx, tz) && !g._rtsPath(sx, sz, g._rtsWX(tx), g._rtsWX(tz), null)) far = [tx, tz];
}
S.ok('there is open ground a squad cannot walk to from the start, or the lift proves nothing', !!far, far ? 'cell ' + far.join(',') : 'none on seed 7');
var ch = g._rtsSpawnUnit('player', 'tran', sx, sz), men = [];
var ms = g._rtsNearestOpen(st[0] - 8, st[1] + 6, 10, null);
for (var i = 0; i < 5; i++) men.push(g._rtsSpawnUnit('player', 'rifle', g._rtsWX(ms[0]) + (i - 2) * 3, g._rtsWX(ms[1])));
var walk0 = Math.min.apply(null, men.map(function (m) { return Math.hypot(m.x - sx, m.z - sz); }));
men.forEach(function (m) { g._rtsOrderBoard(m, ch); });
var boardT = run(g, 30, function () { return g._rtsCargoCount(ch) === 5; });
S.ok('five riflemen ordered aboard are in the hold', g._rtsCargoCount(ch) === 5 && men.every(function (m) { return m.inside === ch; }),
     g._rtsCargoCount(ch) + ' of 5 aboard after ' + boardT.toFixed(1) + ' s, walking from ' + (walk0 / g.RTS_TILE).toFixed(1) + ' tiles out');
S.ok('...walking to it from further off than a squad can climb in from', walk0 > g.RTS_TILE * 3, (walk0 / g.RTS_TILE).toFixed(1) + ' tiles');
var fx = g._rtsWX(far[0]), fz = g._rtsWX(far[1]);
var sent = g._rtsOrderUnloadAt(ch, fx, fz);
var flyT = run(g, 60, function () { return !g._rtsCargoCount(ch); });
var out = men.filter(function (m) { return !m.dead && !m.inside; });
var onFar = out.filter(function (m) {
  var mx = g._rtsTX(m.x), mz = g._rtsTX(m.z);
  return Math.hypot(m.x - fx, m.z - fz) < g.RTS_TILE * 4 && !g._rtsBlocked(mx, mz) && !g._rtsPath(sx, sz, m.x, m.z, null);
});
S.ok('...it flies them there and all five are put down across the water, on open ground', sent && onFar.length === 5,
     onFar.length + ' of 5 on the far side, ' + out.length + ' out, after ' + flyT.toFixed(1) + ' s');
S.ok('...and they walk from there: a squad set down on the far side can be ordered about on it', (function () {
  g._rtsOrderMove(out[0], fx + g.RTS_TILE, fz, false);
  return !!out[0].path;
})(), '');

/* ---- BOARDED FROM THE BEACH ----
   Left hovering just off a shore, where it cannot set down, it is boarded from the sand: the
   squad's path ends at the water's edge, two tiles short of it. */
var g4 = fresh(7), G4 = g4.window._rtsG, T4 = g4.RTS_TILE, off = null;
for (var wi4 = 0; wi4 < G4.terrain.length && !off; wi4++) {
  if (G4.terrain[wi4] !== g4.RTS_T_WATER) continue;
  var wx4 = wi4 % g4.RTS_N, wz4 = (wi4 / g4.RTS_N) | 0, ln = g4._rtsNearestOpen(wx4, wz4, 3, null);
  if (ln && Math.hypot(ln[0] - wx4, ln[1] - wz4) >= 2 && Math.hypot(ln[0] - wx4, ln[1] - wz4) <= 2.5) off = { w: [wx4, wz4], l: ln };
}
S.ok('there is water two tiles off a beach to hover over, or this proves nothing', !!off, off ? 'water ' + off.w + ', sand ' + off.l : 'none');
var c4 = g4._rtsSpawnUnit('player', 'tran', g4._rtsWX(off.w[0]), g4._rtsWX(off.w[1])), sq = [];
for (i = 0; i < 3; i++) sq.push(g4._rtsSpawnUnit('player', 'rifle', g4._rtsWX(off.l[0]), g4._rtsWX(off.l[1])));
sq.forEach(function (m) { g4._rtsOrderBoard(m, c4); });
run(g4, 20, function () { return g4._rtsCargoCount(c4) === 3; });
S.ok('...a squad on the sand climbs aboard a Chinook hovering two tiles out over the water', g4._rtsCargoCount(c4) === 3 && !c4.land,
     g4._rtsCargoCount(c4) + ' of 3 aboard, land ' + (c4.land || 0));

/* ---- NOTHING TO RELOAD ---- */
var g2 = fresh(4242), G2 = g2.window._rtsG, y2 = g2._rtsHas('player', 'yard');
var sp = g2._rtsNearestOpen(y2.tx + 6, y2.tz + 6, 14, null), pad = g2._rtsPlaceStruct('player', 'helipad', sp[0], sp[1], true);
var c2 = g2._rtsSpawnUnit('player', 'tran', pad.x + 60, pad.z + 30), x2 = c2.x, z2 = c2.z;
run(g2, 20);
S.ok('unarmed, it never flies home to reload: idle beside a pad it stays where it was', Math.hypot(c2.x - x2, c2.z - z2) < g2.RTS_TILE && c2.order !== 'rearm',
     'moved ' + Math.hypot(c2.x - x2, c2.z - z2).toFixed(1) + ', order ' + c2.order);
pad.dead = true;
G2.ents.forEach(function (e) { if (e.type === 'struct' && (g2.rtsStructDef(e.def) || {}).rearm) e.dead = true; });
run(g2, 5);
S.ok('...and with every pad gone it does not crash', !c2.dead && c2.hp === c2.maxHp, 'hp ' + c2.hp + ' of ' + c2.maxHp);

/* ---- IT SETS DOWN ---- */
var hi = g2._rtsAirLift(c2);
S.ok('idle over open ground it has set down', c2.land === 1 && Math.abs(hi - g2.RTS_AIR_SET) < 1e-9, 'land ' + c2.land + ', drawn ' + hi + ' up');
g2._rtsOrderMove(c2, c2.x + 80, c2.z, false);
run(g2, 1);
S.ok('...and lifts again the moment it is sent somewhere', c2.land < 0.5 && g2._rtsAirLift(c2) > hi + 4, 'land ' + (c2.land || 0).toFixed(2) + ', drawn ' + g2._rtsAirLift(c2).toFixed(1) + ' up');
var wet = null;
for (var wi = 0; wi < G2.terrain.length && !wet; wi++) if (G2.terrain[wi] === g2.RTS_T_WATER) wet = [wi % g2.RTS_N, (wi / g2.RTS_N) | 0];
var c3 = g2._rtsSpawnUnit('player', 'tran', g2._rtsWX(wet[0]), g2._rtsWX(wet[1]));
c3.x = g2._rtsWX(wet[0]); c3.z = g2._rtsWX(wet[1]);
for (var k = 0; k < 90; k++) { g2._rtsAirSettle(c3, 1 / 30); }
S.ok('over water it hovers: there is nothing to set down on', G2.terrain[g2._rtsIdx(g2._rtsTX(c3.x), g2._rtsTX(c3.z))] === g2.RTS_T_WATER && !c3.land, 'land ' + c3.land);
var gun = g2._rtsSpawnUnit('player', 'heli', c2.x + 30, c2.z + 30);
for (k = 0; k < 90; k++) g2._rtsAirSettle(gun, 1 / 30);
S.ok('...and a gunship waiting for a target stays in the air', !gun.land && g2._rtsAirLift(gun) === gun.alt, 'drawn ' + g2._rtsAirLift(gun) + ' up');

/* ---- HOW IT SOUNDS ---- */
S.ok('it beats the air like a helicopter, not a jet - and a MiG is still a jet', g2._rtsAmbRotor('tran') && g2._rtsAmbRotor('heli') && !g2._rtsAmbRotor('mig'),
     'Chinook ' + g2._rtsAmbRotor('tran') + ', Attack Heli ' + g2._rtsAmbRotor('heli') + ', MiG ' + g2._rtsAmbRotor('mig'));

require('../lib/report.js')(S);
