/* THE DEEP (rules `dolphin` / `kraken` / `seahornet` / `bombard`, weapons `sonic` / `tentacles` /
   `scorpflak` / `bombmissile`, core/deep.js and its hooks in core/combat.js and core/tick.js), on
   the real simulation:

     WHOSE        the Sonar Dolphin is the Compact's; the Kraken, the Sea Hornet and the Bombard the
                  Dominion's
     THE GRIP     a Kraken's shot takes hold of a ship: it surfaces, and the ship does not move or
                  fire, and is crushed; it never takes hold of anything ashore
     LET GO       the ship gone, the Kraken lets go; the Kraken killed, the ship is free and moves
     SAVED        a save keeps the hold
     SONAR        a Dolphin hears a submerged Kraken near it - and its burst reaches it
     THE HORNET   the Sea Hornet's flak reaches an aircraft, and infantry ashore
     THE BOMBARD  outranges the Cruiser
     THE OPPONENT does not buy them: that is batch 12 */

var { Suite } = require('../lib/assert.js');
var { loadFast } = require('../lib/sandbox.js');

var S = new Suite('deep');
var g = loadFast(['src/rules', 'src/core', 'src/sprites/props.js', 'src/rts.save.js']);
var G, T = g.RTS_TILE, SEA;

function fresh(army) {
  g.window._RTS_ARMY = army || 'soviet';
  g._rtsNewGame(7, 'normal');
  G = g._rtsG; G.over = null;
  G.ents.forEach(function (e) { if (e.type === 'unit') e.dead = true; });
  g._rtsTick(1 / 30);
  /* open water, with room round it */
  SEA = null;
  for (var j = 0; j < g.RTS_N * g.RTS_N && !SEA; j++) {
    var tx = j % g.RTS_N, tz = (j / g.RTS_N) | 0, ok = true;
    for (var dx = -4; dx <= 4 && ok; dx++) for (var dz = -4; dz <= 4 && ok; dz++) if (g._rtsBlocked(tx + dx, tz + dz, 'sea')) ok = false;
    if (ok) SEA = { x: g._rtsWX(tx), z: g._rtsWX(tz) };
  }
}
function at(side, key, dx, dz) { return g._rtsSpawnUnit(side, key, SEA.x + dx * T, SEA.z + dz * T); }
function step(secs, each) { for (var t = 0; t < secs * 30; t++) { if (each) each(); g._rtsTick(1 / 30); } }
var W = function (k) { return g.RTS_WEAPONS[k]; };
function fire(e, tgt, w) { e.cool = 0; g._rtsFire(e, tgt, w); }

/* ---------------------------------------------------------------- whose ---- */
fresh();
var U = function (k) { return g.rtsUnitDef(k); };
S.ok('(open water on the map)', !!SEA, '');
S.ok('the Sonar Dolphin is the Compact\'s; the Kraken, the Sea Hornet and the Bombard the Dominion\'s',
     U('dolphin').side === 'allied' && ['kraken', 'seahornet', 'bombard'].every(function (k) { return U(k).side === 'soviet'; }), '');

/* ---------------------------------------------------------------- the grip ---- */
var kr = at('player', 'kraken', 0, 0), dd = at('enemy', 'destroyer', 0.5, 0), free = at('enemy', 'destroyer', 0.5, 3);
var x0 = dd.x, z0 = dd.z, hp0 = dd.hp, fx0 = free.x, fz0 = free.z;
g._rtsOrderMove(dd, dd.x + 10 * T, dd.z, false);
g._rtsOrderMove(free, free.x + 10 * T, free.z, false);   /* the control: the same order, nothing holding it */
fire(kr, dd, W('tentacles'));
S.ok('THE GRIP: a Kraken\'s shot takes hold of a ship', kr.grip === dd.id && dd.gripBy === kr.id, 'grip ' + kr.grip);
/* bait in its guns' reach: held, it does not fire on it */
var bait = at('player', 'gunboat', 2.5, -1.5), bh = bait.hp;
step(5, function () { kr.cool = 99; free.cool = 99; bait.cool = 99; dd.target = bait; dd.order = 'attack'; });
S.ok('...or fire, on a gunboat in its reach', bait.hp === bh, 'gunboat ' + bait.hp + '/' + bh);
bait.dead = true;
S.ok('...it surfaces to do it', kr.decloak > 0, 'decloak ' + kr.decloak);
var moved = Math.hypot(dd.x - x0, dd.z - z0) / T, fmoved = Math.hypot(free.x - fx0, free.z - fz0) / T;
S.ok('...and the ship does not move, where its consort under the same order does', moved < 0.01 && fmoved > 2, 'held ' + moved.toFixed(2) + ' cells, free ' + fmoved.toFixed(1));
S.ok('...and is crushed', hp0 - dd.hp > 80, 'lost ' + (hp0 - dd.hp).toFixed(0));
var tk = g._rtsSpawnUnit('enemy', 'tank', SEA.x, SEA.z);
S.ok('...and it never takes hold of anything ashore', !g._rtsWeaponReaches(W('tentacles'), tk) && !g._rtsGrip(at('player', 'kraken', 2, 2), { dead: false, type: 'struct', def: 'power' }), '');
tk.dead = true;

/* ---------------------------------------------------------------- saved ---- */
var body = JSON.parse(JSON.stringify(g._rtsSaveState(G)));
g._rtsNewGame(7, 'normal'); g._rtsApplyState(g._rtsG, body); G = g._rtsG;
var kr2 = G.byId[kr.id], dd2 = G.byId[dd.id];
S.ok('SAVED: a save keeps the hold', kr2 && dd2 && kr2.grip === dd2.id && g._rtsGripped(dd2), '');

/* ---------------------------------------------------------------- let go ---- */
g._rtsKill(kr2);
g._rtsOrderMove(dd2, dd2.x + 10 * T, dd2.z, false);
var x1 = dd2.x, z1 = dd2.z;
step(5);
S.ok('LET GO: the Kraken killed, the ship is free and moves', !g._rtsGripped(dd2) && Math.hypot(dd2.x - x1, dd2.z - z1) > 2 * T, 'moved ' + (Math.hypot(dd2.x - x1, dd2.z - z1) / T).toFixed(1) + ' cells');
fresh();
var kr3 = at('player', 'kraken', 0, 0), gb = at('enemy', 'gunboat', 0.5, 0);
fire(kr3, gb, W('tentacles'));
step(12, function () { kr3.cool = 99; gb.cool = 99; });
S.ok('...the ship gone, the Kraken lets go', gb.dead && kr3.grip == null, 'gunboat ' + (gb.dead ? 'sunk' : gb.hp.toFixed(0)) + ', grip ' + kr3.grip);

/* ---------------------------------------------------------------- sonar ---- */
fresh('allied');
var dol = at('player', 'dolphin', 0, 0), kq = at('enemy', 'kraken', 4, 0);
kq.decloak = 0;
step(1, function () { kq.cool = 99; dol.cool = 99; kq.path = null; });
S.ok('SONAR: a Dolphin hears a submerged Kraken near it', g._rtsEntSeen(kq) || g._rtsCanEngage(dol, kq), '');
S.ok('...and its burst reaches it', g._rtsWeaponReaches(W('sonic'), kq), '');

/* ---------------------------------------------------------------- the hornet ---- */
var sh = at('enemy', 'seahornet', 0, 2), heli = at('player', 'heli', 1, 2), man = g._rtsSpawnUnit('player', 'rifle', SEA.x, SEA.z);
S.ok('THE HORNET: the Sea Hornet\'s flak reaches an aircraft, and infantry', g._rtsGunEngages(W('scorpflak'), heli) && g._rtsGunEngages(W('scorpflak'), man), '');

/* ---------------------------------------------------------------- the bombard ---- */
S.ok('THE BOMBARD outranges the Cruiser', W('bombmissile').range > W(U('cruiser').weapon).range, W('bombmissile').range + ' against ' + W(U('cruiser').weapon).range);

/* ------------------------------------------------------------- opponent ---- */
var A = g.RTS_AI, inMix = function (k) { return Object.keys(A.mix).some(function (c) { return A.mix[c].some(function (m) { return m.key === k; }); }); };
S.ok('the opponent does not buy them', !['dolphin', 'kraken', 'seahornet', 'bombard'].some(inMix), '');

require('../lib/report.js')(S);
