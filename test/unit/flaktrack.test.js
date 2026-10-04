/* THE FLAK TRACK (rules/units.js `flaktrack`, weapon `trackflak`): anti-aircraft cover that
   keeps up with the armour. Its verb is ESCORT, staged on the real simulation:

     COVER       a gunship sent at a lone tank in open country kills it, or nearly; the same
                 gunship sent at the same tank with a Flak Track beside it is shot down, and
                 the tank comes through
     SPECIALIST  it never fires at anything on the ground - an enemy tank parked beside it is
                 left alone, and goes on untouched
     BOUGHT FOR  the opponent wants none while the player flies nothing, and one for every two
     A REASON    aircraft the player puts up (core/ai.js _rtsAIWantsVsAir)
     BOTH ARMIES either army can build it, once it has a Radar Post
     THE CONTRACT nothing shoots an aircraft without an anti-air gun - not a tank that was hit
                 by one (core/response.js), ordered onto one (core/orders.js) or handed one as a
                 target any other way (core/units.js) - and a unit with one acquires aircraft
                 by itself (core/combat.js _rtsFindTarget), which no unit used to */

var { Suite } = require('../lib/assert.js');
var { load } = require('../lib/sandbox.js');

var S = new Suite('flaktrack');
var g = load(['src/rules', 'src/core', 'src/sprites/props.js']);

function fresh() {
  g._rtsNewGame(4242, 'easy');
  var G = g.window._rtsG;
  G.over = null;
  /* the field cleared to the two sides' structures, so nothing else joins the fight */
  G.ents.forEach(function (e) { if (e.type === 'unit') e.dead = true; });
  g._rtsTick(1 / 30);
  G.teams = {};
  return G;
}
/* open ground far from either base: the middle of the map, nearest open cell */
function middle() {
  var c = g._rtsNearestOpen(g.RTS_N >> 1, g.RTS_N >> 1, 20, null);
  return { x: g._rtsWX(c[0]), z: g._rtsWX(c[1]) };
}
function run(G, secs, stop) {
  for (var t = 0; t < secs * 30; t++) { g._rtsTick(1 / 30); if (stop && stop()) break; }
}
/* A gunship sent at a tank from a little way off, with or without a Flak Track at the tank's side. */
function raid(withFlak) {
  var G = fresh(), c = middle();
  var tank = g._rtsSpawnUnit('player', 'tank', c.x, c.z);
  var flak = withFlak ? g._rtsSpawnUnit('player', 'flaktrack', c.x + 3, c.z) : null;
  var heli = g._rtsSpawnUnit('enemy', 'heli', c.x - 30, c.z - 30);
  heli.alt = heli.alt || 12;
  g._rtsOrderAttack(heli, tank);
  run(G, 40, function () { return heli.dead || tank.dead || (heli.ammo === 0 && !heli.target); });
  return { tank: tank, heli: heli, flak: flak, hp: tank.dead ? 0 : tank.hp / tank.maxHp };
}

/* ---------------- the roster ---------------- */
var d = g.rtsUnitDef('flaktrack'), w = d && g.RTS_WEAPONS[d.weapon];
S.ok('the Flak Track is in the roster, on a weapon that reaches aircraft and only aircraft',
     !!(d && w && w.aa && w.aaOnly), d ? d.weapon + ' aa ' + (w && w.aa) + ' aaOnly ' + (w && w.aaOnly) : 'missing');
S.ok('either army builds it, from the Radar Post up', !d.side && d.needs.indexOf('radar') >= 0 && d.kind === 'vehicle',
     'side ' + d.side + ', needs ' + d.needs);

/* ---------------- cover ---------------- */
var bare = raid(false), covered = raid(true);
S.ok('a gunship sent at a lone tank does it real harm', bare.hp < 0.6,
     'the tank is left at ' + Math.round(bare.hp * 100) + '%');
S.ok('...and with a Flak Track beside it, the gunship is shot down', covered.heli.dead,
     'gunship ' + (covered.heli.dead ? 'down' : 'still flying at ' + Math.round(covered.heli.hp / covered.heli.maxHp * 100) + '%'));
S.ok('...and the tank comes through in far better shape', covered.hp > bare.hp + 0.2,
     Math.round(covered.hp * 100) + '% against ' + Math.round(bare.hp * 100) + '% alone');

/* ---------------- a specialist ---------------- */
var G = fresh(), c = middle();
var mine = g._rtsSpawnUnit('player', 'flaktrack', c.x, c.z);
/* an unarmed enemy told to stand still, so the Flak Track lives through the eight seconds and
   the question is fair */
var foe = g._rtsSpawnUnit('enemy', 'engineer', c.x + 8, c.z);
foe.order = 'hold';
var hp0 = foe.hp, aimed = false;
for (var t = 0; t < 30 * 8; t++) { g._rtsTick(1 / 30); if (mine.target === foe) aimed = true; }
S.ok('the case: an enemy on the ground within its guns\' reach, and it alive throughout',
     !mine.dead && !foe.dead && Math.hypot(foe.x - mine.x, foe.z - mine.z) < g.RTS_WEAPONS.trackflak.range,
     Math.hypot(foe.x - mine.x, foe.z - mine.z).toFixed(1) + ' apart, reach ' + g.RTS_WEAPONS.trackflak.range);
S.ok('it never takes aim at an enemy on the ground', !aimed && foe.hp === hp0,
     'target ' + (mine.target ? mine.target.def : 'none') + ', the engineer at ' + foe.hp + ' of ' + hp0);

/* ---------------- the air/ground contract, wherever a target comes from ----------------
   Found while staging the fight above: the contract was enforced only where a unit picked its
   own target with a weapon in hand, and no unit ever did. */
G = fresh(); c = middle();
var rk = g._rtsSpawnUnit('player', 'rocket', c.x, c.z);
var gs = g._rtsSpawnUnit('enemy', 'heli', c.x + 10, c.z);
gs.ammo = 0;                                               /* overhead, and no threat to anything */
run(G, 4, function () { return rk.target === gs; });
S.ok('a Rocket Squad takes aim at a gunship overhead unprompted', rk.target === gs,
     'target ' + (rk.target ? rk.target.def : 'none'));

G = fresh(); c = middle();
/* an unarmed Skylift: it neither attacks nor flies home, so whatever happens to it is the tank */
var tk = g._rtsSpawnUnit('player', 'tank', c.x, c.z), hv = g._rtsSpawnUnit('enemy', 'tran', c.x + 10, c.z);
g._rtsOrderAttack(tk, hv);
S.ok('a tank ordered onto an aircraft takes it as a move: it has nothing to shoot it with', tk.order !== 'attack' && tk.target !== hv,
     'order ' + tk.order + ', target ' + (tk.target ? tk.target.def : 'none'));
var hvHp = hv.hp;
tk.order = 'attack'; tk.target = hv;                       /* however it got there - a team, a script */
run(G, 4);
S.ok('...and an aircraft put in its sights by any other road is let go, not shot at', hv.hp === hvHp && tk.target !== hv,
     'aircraft ' + hv.hp + ' of ' + hvHp + ', target ' + (tk.target ? tk.target.def : 'none'));

G = fresh(); c = middle();
var mover = g._rtsSpawnUnit('player', 'tank', c.x, c.z), raider = g._rtsSpawnUnit('enemy', 'heli', c.x - 18, c.z);
var far = g._rtsNearestOpen(g._rtsTX(c.x) + 30, g._rtsTX(c.z), 10, null);
g._rtsOrderMove(mover, g._rtsWX(far[0]), g._rtsWX(far[1]), false);
g._rtsOrderAttack(raider, mover);
var hit = false;
run(G, 6, function () { if (mover.hp < mover.maxHp) hit = true; return hit && mover.order !== 'move'; });
S.ok('a tank on the move, hit by a gunship, keeps going: there is nothing to turn and fight with', hit && mover.order === 'move',
     'hit ' + hit + ', order ' + mover.order);

/* ---------------- bought for a reason ---------------- */
G = fresh();
var entry = g.RTS_AI.mix.vehicle.filter(function (e) { return e.key === 'flaktrack'; })[0];
S.ok('the opponent has it in its vehicle mix, answered to the sky', !!(entry && entry.vsAir), JSON.stringify(entry));
S.ok('...and wants none while the player flies nothing', !g._rtsAIWantsVsAir('flaktrack', entry.vsAir), '');
var p = middle(), flyers = [];
for (var k = 0; k < 4; k++) flyers.push(g._rtsSpawnUnit('player', 'heli', p.x + k * 4, p.z));
S.ok('...one once the player puts aircraft up', g._rtsAIWantsVsAir('flaktrack', entry.vsAir), '4 aircraft, none owned');
g._rtsSpawnUnit('enemy', 'flaktrack', p.x, p.z + 20);
S.ok('...still a second against four aircraft', g._rtsAIWantsVsAir('flaktrack', entry.vsAir), '4 aircraft, one owned');
g._rtsSpawnUnit('enemy', 'flaktrack', p.x + 4, p.z + 20);
S.ok('...and no third: one for every two', !g._rtsAIWantsVsAir('flaktrack', entry.vsAir), '4 aircraft, two owned');
/* ...and asked in the opponent's own buy loop, not only of the helper: a rich opponent with a
   Vehicle Works and a Radar Post, rolled two hundred times, with the sky full and then empty */
function buys(n) {
  var S2 = G.sides.enemy, got = 0;
  for (var r = 0; r < n; r++) {
    S2.q = {}; S2.credits = 1e6; S2.ore = 0;
    g._rtsAIUnits(S2);
    if (S2.q.vehicle && S2.q.vehicle.key === 'flaktrack') got++;
  }
  return got;
}
['factory', 'radar', 'power', 'power', 'power'].forEach(function (k, n) {
  if (!g._rtsHas('enemy', k) || k === 'power') {
    var yd = g._rtsHas('enemy', 'yard');
    for (var rr = 4; rr < 30; rr++) { var sp = g._rtsNearestOpen(yd.tx + rr, yd.tz - n * 4, 6, null); if (sp && g._rtsCanPlace('enemy', k, sp[0], sp[1], true)) { g._rtsPlaceStruct('enemy', k, sp[0], sp[1], true); break; } }
  }
});
/* the two owned above go, and the harvesters it would otherwise buy first are already there */
G.ents.forEach(function (e) { if (e.side === 'enemy' && e.def === 'flaktrack') e.dead = true; });
for (var hv2 = 0; hv2 < 3; hv2++) g._rtsSpawnUnit('enemy', 'harvester', p.x + hv2 * 4, p.z + 40);
var crowded = buys(200);
flyers.forEach(function (f) { f.dead = true; });
var clear = buys(200);
S.ok('the opponent\'s buy loop picks Flak Tracks while the player flies', crowded > 10, crowded + ' of 200 rolls');
S.ok('...and never once the sky is empty', clear === 0, clear + ' of 200 rolls');
S.ok('...and none wanted once the sky is clear again', !g._rtsAIWantsVsAir('flaktrack', entry.vsAir), '0 aircraft, two owned');

require('../lib/report.js')(S);
