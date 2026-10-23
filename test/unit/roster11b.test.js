/* BATCH 11b (rules/roster11.js, core/ifv.js, core/marshal.js, core/leech.js, core/gate.js), on the
   real simulation:

     THE CARRIER   empty it fires its missiles; a rifleman aboard makes it a machine gun, a Rocket
                   Squad its rockets, a Marksman his rifle, and unloaded it has its missiles back;
                   an Engineer aboard mends its side's vehicles near it, a Field Medic its men
     THE MARSHAL   lases a building and two Strike Jets come in, bomb it hard, and are gone off the
                   map; not at an aircraft; left alone by an enemy building he calls them himself
     THE LEECH     climbs into an enemy tank and eats it; nothing can shoot it in there; not into a
                   man; the tank dead - eaten, or killed by anything else - it climbs out alive; a
                   Repair Truck of the tank's side gets it out, and it dies
     THE GATE      shut to everyone but its own side; a walled pen with a gate in it lets its own
                   men in and keeps the enemy's out; it stands open while one of its own is by it
     SAVED         a latched drone stays latched across a save */

var { Suite } = require('../lib/assert.js');
var { loadFast } = require('../lib/sandbox.js');

var S = new Suite('roster11b');
var g = loadFast(['src/rules', 'src/core', 'src/sprites/props.js', 'src/rts.save.js']);
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
function step(secs) { for (var t = 0; t < secs * 30; t++) { still.forEach(function (o) { o.path = null; o.order = 'hold'; o.target = null; o.cool = 99; }); g._rtsTick(1 / 30); } }
function gun(e) { var w = g._rtsGuns(e)[0]; for (var k in g.RTS_WEAPONS) if (g.RTS_WEAPONS[k] === w) return k; return null; }

/* ------------------------------------------------------------- the carrier ---- */
fresh();
var c = at('player', 'ifv', 0, 0);
var guns = { empty: gun(c) };
['rifle', 'rocket', 'marksman'].forEach(function (k) {
  var p = at('player', k, 1, 0);
  g._rtsBoard(p, c); guns[k] = gun(c);
  c.cargo.length = 0; p.inside = null; p.dead = true;
});
var r2 = at('player', 'rifle', 1, 0); g._rtsBoard(r2, c);
var unl = g._rtsUnloadAll ? 'fn' : 'none';
c.cargo.length = 0; r2.inside = null; r2.dead = true;
guns.after = gun(c);
S.ok('THE CARRIER: empty, its missiles; a rifleman makes it a machine gun, a Rocket Squad its rockets, a Marksman his rifle; empty again, its missiles',
     guns.empty === 'ifvmissile' && guns.rifle === 'mg' && guns.rocket === 'rocket' && guns.marksman === 'marksgun' && guns.after === 'ifvmissile', JSON.stringify(guns));

fresh();
var cf = at('player', 'ifv', 0, 0), en = at('player', 'engineer', 1, 0), tk = at('player', 'tank', 2, 0), rf = at('player', 'rifle', 0, 2);
var ch = at('player', 'ifv', 8, 0), md = at('player', 'medic', 9, 0), rf2 = at('player', 'rifle', 8, 2), tk2 = at('player', 'tank', 10, 0);
still = [cf, tk, rf, ch, rf2, tk2];
S.ok('(the staging: an Engineer in one carrier, a Field Medic in the other)', g._rtsBoard(en, cf) && g._rtsBoard(md, ch), '');
[tk, rf, rf2, tk2].forEach(function (u) { u.hp = u.maxHp * 0.5; });
var h0 = [tk, rf, rf2, tk2].map(function (u) { return u.hp; });
step(3);
var up = [tk, rf, rf2, tk2].map(function (u, k) { return u.hp - h0[k]; });
S.ok('...the Engineer\'s mends the tank by it, not the man; the Medic\'s heals the man by it, not the tank', up[0] > 10 && up[1] === 0 && up[2] > 5 && up[3] === 0,
     up.map(function (v) { return v.toFixed(0); }).join(' '));
S.eq('...and both still fire their missiles', [gun(cf), gun(ch)].join(), 'ifvmissile,ifvmissile');

/* -------------------------------------------------------------- the marshal ---- */
fresh('soviet');
var ms = at('player', 'marshal', 0, 0), pw = null;
for (var r = 0; r < 10 && !pw; r++) for (var a = 0; a < 8 && !pw; a++)
  pw = g._rtsPlaceStruct('enemy', 'power', g._rtsTX(M.x) + 4 + Math.round(Math.cos(a * 0.785) * r), g._rtsTX(M.z) + Math.round(Math.sin(a * 0.785) * r), true);
pw.building = 0;
still = [ms];
var ph = pw.hp, n0 = G.ents.length, jets = [];
ms.cool = 0; g._rtsFire(ms, pw, g.RTS_WEAPONS.lase);
var cm = ms.cool, laseNext = g._rtsPickWeapon(ms, pw);
for (var i = n0; i < G.ents.length; i++) if (G.ents[i].def === 'strikejet') jets.push(G.ents[i]);
var lased = G.fx.some(function (f) { return f.kind === 'beam' && f.lase; });
S.ok('THE MARSHAL lases a building - a red beam on it - and two Strike Jets come in', jets.length === 2 && lased && jets.every(function (j) { return j.side === 'player' && j.air; }),
     jets.length + ' jets, beam ' + lased);
var bombs = 0;
for (var t = 0; t < 30 * 30 && jets.some(function (j) { return !j.dead; }); t++) { bombs = Math.max(bombs, (G.bombs || []).length); g._rtsTick(1 / 30); }
step(2);
S.ok('...they bomb it hard', ph - Math.max(0, pw.hp) > 300, 'the power plant lost ' + (ph - Math.max(0, pw.hp)).toFixed(0) + ' of ' + ph);
S.ok('...and are gone off the map, leaving no wreck', jets.every(function (j) { return j.dead && !j.crashed; }) && !G.ents.some(function (e) { return !e.dead && e.def === 'strikejet'; }), JSON.stringify(jets.map(function (j) { return [j.dead, j.crashed, g._rtsTX(j.x), g._rtsTX(j.z), j.hp]; })));
S.ok('...and his rifle is not held up by it: ready again at once, and the lase not offered until it is recharged', cm <= g.RTS_WEAPONS.marshalgun.cool && laseNext !== g.RTS_WEAPONS.lase,
     'cool ' + cm.toFixed(2));
var heli = at('enemy', 'heli', 2, 0);
S.ok('...not at an aircraft', !g._rtsWeaponReaches(g.RTS_WEAPONS.lase, heli) && g._rtsWeaponReaches(g.RTS_WEAPONS.lase, pw), '');
heli.dead = true;

fresh('soviet');
var ms2 = at('player', 'marshal', 0, 0), pw2 = null;
for (r = 0; r < 10 && !pw2; r++) for (a = 0; a < 8 && !pw2; a++)
  pw2 = g._rtsPlaceStruct('enemy', 'power', g._rtsTX(M.x) + 3 + Math.round(Math.cos(a * 0.785) * r), g._rtsTX(M.z) + Math.round(Math.sin(a * 0.785) * r), true);
pw2.building = 0;
var called = false;
for (t = 0; t < 8 * 30 && !called; t++) { ms2.path = null; ms2.order = ms2.order === 'move' ? null : ms2.order; g._rtsTick(1 / 30); called = G.ents.some(function (e) { return !e.dead && e.def === 'strikejet'; }); }
S.ok('...left alone by an enemy building, he calls them himself', called, 'range ' + g._rtsRangeTo(ms2, pw2).toFixed(1));
S.eq('...and he is one at a time', g.rtsUnitDef('marshal').only, 1);

/* ---------------------------------------------------------------- the leech ---- */
fresh('soviet');
var lc = at('player', 'leech', 0, 0), et = at('enemy', 'tank', 0.5, 0), er = at('enemy', 'rifle', 3, 0);
still = [et, er];
lc.cool = 0; g._rtsFire(lc, et, g.RTS_WEAPONS.leechbite);
S.ok('THE LEECH climbs into an enemy tank', !!lc.latch && lc.inside === et && et.leeched === lc.id, '');
var e0 = et.hp; er.cool = 0;
var seen = g._rtsFindTarget(er, 40);
step(2);
S.ok('...and eats it', e0 - et.hp > 30, (e0 - et.hp).toFixed(0) + ' in two seconds');
S.ok('...and nothing can shoot it in there', seen !== lc, seen ? seen.def : 'none');
var man = at('enemy', 'rifle', 0, 1);
S.ok('...not into a man', !g._rtsWeaponReaches(g.RTS_WEAPONS.leechbite, man), '');
step(30);
S.ok('...the tank dead, it climbs out alive', et.dead && !lc.dead && !lc.inside && !lc.latch, 'tank ' + (et.dead ? 'dead' : et.hp.toFixed(0)) + ', drone ' + (lc.dead ? 'dead' : 'alive'));

fresh('soviet');
var lc4 = at('player', 'leech', 0, 0), et4 = at('enemy', 'tank', 0.5, 0);
still = [et4];
lc4.cool = 0; g._rtsFire(lc4, et4, g.RTS_WEAPONS.leechbite);
step(0.5);
g._rtsKill(et4);                                   /* shot dead by someone else */
step(0.5);
S.ok('...and if something else kills the tank, it climbs out alive too', et4.dead && !lc4.dead && !lc4.inside && !lc4.latch, 'drone ' + (lc4.dead ? 'dead' : lc4.inside ? 'still inside' : 'out'));

fresh('soviet');
var lc2 = at('player', 'leech', 0, 0), et2 = at('enemy', 'tank', 0.5, 0);
still = [et2];
lc2.cool = 0; g._rtsFire(lc2, et2, g.RTS_WEAPONS.leechbite);
step(1);
var rt = at('enemy', 'repairtruck', 2, 0);
still = [et2, rt];
step(1);
S.ok('...a Repair Truck of the tank\'s side gets it out, and it dies', lc2.dead && !et2.dead && !et2.leeched, 'drone ' + (lc2.dead ? 'dead' : 'alive') + ', tank leeched ' + et2.leeched);

/* ---------------------------------------------------------- saved (leech) ---- */
fresh('soviet');
var lc3 = at('player', 'leech', 0, 0), et3 = at('enemy', 'tank', 0.5, 0);
lc3.cool = 0; g._rtsFire(lc3, et3, g.RTS_WEAPONS.leechbite);
var body = JSON.parse(JSON.stringify(g._rtsSaveState(G)));
g._rtsNewGame(7, 'normal'); g._rtsApplyState(g._rtsG, body); G = g._rtsG;
var L3 = G.byId[lc3.id], H3 = G.byId[et3.id];
S.ok('SAVED: a latched drone stays latched across a save', !!(L3 && H3 && L3.latch && L3.inside === H3 && H3.leeched === L3.id), '');

/* ----------------------------------------------------------------- the gate ---- */
fresh();
/* a pen: a ring of the player's walls round one open cell, one of them a gate */
var cx = g._rtsTX(M.x), cz = g._rtsTX(M.z), ring = [], gate = null;
for (var dz = -2; dz <= 2; dz++) for (var dx = -2; dx <= 2; dx++) {
  if (Math.max(Math.abs(dx), Math.abs(dz)) !== 2) continue;
  var key = (dx === 2 && dz === 0) ? 'gate' : 'wall', b = g._rtsPlaceStruct('player', key, cx + dx, cz + dz, true);
  if (b) { b.building = 0; ring.push(b); if (key === 'gate') gate = b; }
}
S.ok('(the staging: a pen of sixteen, one of them a gate)', ring.length === 16 && !!gate, ring.length + ' placed');
var gi = g._rtsIdx(gate.tx, gate.tz);
var shut = g._rtsBlocked(gate.tx, gate.tz, null);
var own = g._rtsAsSide('player', function () { return g._rtsBlocked(gate.tx, gate.tz, null); });
var foe = g._rtsAsSide('enemy', function () { return g._rtsBlocked(gate.tx, gate.tz, null); });
S.ok('THE GATE is shut to everyone but its own side', shut && !own && foe, 'nobody ' + shut + ', own ' + own + ', enemy ' + foe);
var mine = g._rtsSpawnUnit('player', 'rifle', g._rtsWX(cx + 5), g._rtsWX(cz)), theirs = g._rtsSpawnUnit('enemy', 'rifle', g._rtsWX(cx + 5), g._rtsWX(cz + 1));
still = [];
g._rtsOrderMove(mine, g._rtsWX(cx), g._rtsWX(cz), false);
g._rtsOrderMove(theirs, g._rtsWX(cx), g._rtsWX(cz), false);
var openSeen = 0;
for (t = 0; t < 15 * 30; t++) { mine.cool = theirs.cool = 99; mine.target = theirs.target = null; g._rtsTick(1 / 30); if (gate.open) openSeen = 1; }
function inPen(u) { return Math.abs(g._rtsTX(u.x) - cx) <= 1 && Math.abs(g._rtsTX(u.z) - cz) <= 1; }
S.ok('...a walled pen with a gate lets its own men in', inPen(mine), 'at ' + (g._rtsTX(mine.x) - cx) + ',' + (g._rtsTX(mine.z) - cz));
S.ok('...and keeps the enemy\'s out', !inPen(theirs), 'at ' + (g._rtsTX(theirs.x) - cx) + ',' + (g._rtsTX(theirs.z) - cz));
S.ok('...and it stood open as its own went through', openSeen === 1, '');

require('../lib/report.js')(S);
