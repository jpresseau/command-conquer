/* EXPLOSIVES (rules `sapper` / `zealot` / `wrecker` / `frogman`, weapons `satchel` / `limpet` /
   `zealblast` / `wreckblast` / `frogmg`, core/blast.js and its hooks in core/combat.js,
   core/capture.js and core/tick.js), on the real simulation:

     WHOSE        the Sapper, the Zealot and the Wrecker are the Dominion's; the Frogman the Compact's
     THE CHARGE   a Sapper's shot leaves a charge and does no damage; nothing happens until the fuse
                  runs out, then the tank takes it and what stands round it - its own side's too -
                  takes half; one charge to a target, so a charged one is not worth another
     ON A BUILDING  a satchel brings down a power plant
     IT FELL FIRST  a charged tank destroyed before the fuse: the charge goes off where it fell
     SAVED        a save keeps a ticking charge
     THE LIMPET   only on a ship or a building, never a tank; a Frogman answers infantry with his
                  pistol and a ship with the limpet
     HE SWIMS     a Frogman has a way across water where a rifleman has none
     THE BOMB     a Zealot's shot is itself going off: it is gone, and so is the tank's health, and
                  its own side's men beside it are hurt too
     KILLED, IT GOES OFF  a Zealot shot dead goes off where it falls; a Wrecker, further; and once only
     NOTHING LEFT  no crew climbs out of a Wrecker that has gone off
     THE OPPONENT does not buy them: that waits for a plan for where to send them (batch 12) */

var { Suite } = require('../lib/assert.js');
var { loadFast } = require('../lib/sandbox.js');

var S = new Suite('blast');
var g = loadFast(['src/rules', 'src/core', 'src/sprites/props.js', 'src/rts.save.js']);
var G, M, T = g.RTS_TILE;

function fresh(army) {
  g.window._RTS_ARMY = army || 'soviet';
  g._rtsNewGame(7, 'normal');
  G = g._rtsG; G.over = null;
  G.ents.forEach(function (e) { if (e.type === 'unit') e.dead = true; });
  g._rtsTick(1 / 30);
  var a = g._rtsHas('player', 'yard'), b = g._rtsHas('enemy', 'yard');
  M = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
}
function at(side, key, dx, dz) { return g._rtsSpawnUnit(side, key, M.x + dx * T, M.z + dz * T); }
/* everything holds still and holds its fire: the test fires the shots */
var still = [];
function hold(list) { still = list; }
function step(secs) { for (var t = 0; t < secs * 30; t++) { still.forEach(function (o) { o.cool = 99; o.path = null; o.target = null; o.order = 'hold'; }); g._rtsTick(1 / 30); } }
function fire(e, tgt, w) { e.cool = 0; g._rtsFire(e, tgt, w || g._rtsPickWeapon(e, tgt)); }
var W = function (k) { return g.RTS_WEAPONS[k]; };

/* ---------------------------------------------------------------- whose ---- */
fresh();
S.ok('the Sapper, the Zealot and the Wrecker are the Dominion\'s; the Frogman is the Compact\'s',
     ['sapper', 'zealot', 'wrecker'].every(function (k) { return g.rtsUnitDef(k).side === 'soviet'; }) && g.rtsUnitDef('frogman').side === 'allied', '');

/* ------------------------------------------------------------- the charge ---- */
var sp = at('player', 'sapper', 0, 0), tk = at('enemy', 'tank', 0.6, 0), nb = at('enemy', 'rifle', 1.2, 0.4), own = at('player', 'rifle', 0.6, 0.8);
hold([sp, tk, nb, own]);
var hp0 = tk.hp, nb0 = nb.hp, own0 = own.hp;
fire(sp, tk, W('satchel'));
S.ok('A SAPPER\'S SHOT LEAVES A CHARGE, and does no damage', !!tk.bomb && tk.hp === hp0, JSON.stringify(tk.bomb));
S.ok('...one to a target: a charged tank is not worth another', !g._rtsWeaponReaches(W('satchel'), tk) && g._rtsWeaponReaches(W('satchel'), nb), '');
step(W('satchel').plant.fuse - 0.5);
S.ok('...and nothing happens until the fuse runs out', tk.hp === hp0 && nb.hp === nb0 && !!tk.bomb, 'fuse left ' + (tk.bomb && tk.bomb.t.toFixed(2)));
step(1);
S.ok('THEN IT GOES OFF: the tank takes it', !tk.bomb && (tk.dead || hp0 - tk.hp >= 300), 'took ' + (hp0 - Math.max(0, tk.hp)).toFixed(0) + (tk.dead ? ', destroyed' : ''));
S.ok('...and what stands round it takes half - its own side\'s men too', nb0 - nb.hp >= 20 && own0 - own.hp >= 20, 'enemy ' + nb.hp.toFixed(0) + '/' + nb0 + ', own ' + own.hp.toFixed(0) + '/' + own0);

/* ----------------------------------------------------------- on a building ---- */
fresh();
var yd = g._rtsHas('enemy', 'yard'), pw = g._rtsPlaceStruct('enemy', 'power', yd.tx - 4, yd.tz + 4, true);
pw.building = 0;
var sp2 = g._rtsSpawnUnit('player', 'sapper', pw.x + 3 * T, pw.z);
hold([sp2]);
fire(sp2, pw, W('satchel'));
step(W('satchel').plant.fuse + 0.5);
S.ok('ON A BUILDING: a satchel brings down a power plant', pw.dead, 'hp ' + pw.hp.toFixed(0) + '/' + pw.maxHp);

/* ----------------------------------------------------------- it fell first ---- */
fresh();
var sp3 = at('player', 'sapper', 0, 0), tk3 = at('enemy', 'tank', 0.6, 0), nb3 = at('enemy', 'rifle', 1.2, 0.4);
hold([sp3, tk3, nb3]);
fire(sp3, tk3, W('satchel'));
var n30 = nb3.hp;
g._rtsKill(tk3);
S.ok('IT FELL FIRST: a charged tank destroyed before the fuse - the charge goes off where it fell, at once', nb3.hp < n30, nb3.hp.toFixed(0) + '/' + n30);

/* ------------------------------------------------------------------ saved ---- */
fresh();
var sp4 = at('player', 'sapper', 0, 0), tk4 = at('enemy', 'tank', 0.6, 0);
fire(sp4, tk4, W('satchel'));
var body = JSON.parse(JSON.stringify(g._rtsSaveState(G)));
g._rtsNewGame(7, 'normal'); g._rtsApplyState(g._rtsG, body); G = g._rtsG;
var tk4b = G.byId[tk4.id], h4 = tk4b && tk4b.hp;
hold([G.byId[sp4.id], tk4b]);
step(W('satchel').plant.fuse + 0.5);
S.ok('SAVED: a save keeps a ticking charge, and it still goes off', tk4b && (tk4b.dead || tk4b.hp < h4 - 300), tk4b ? 'hp ' + tk4b.hp.toFixed(0) : 'lost');

/* --------------------------------------------------------------- the limpet ---- */
fresh('allied');
var fm = at('player', 'frogman', 0, 0), tk5 = at('enemy', 'tank', 0.6, 0), rf5 = at('enemy', 'rifle', 2, 2);
var boat = at('enemy', 'gunboat', 4, 4), b5 = g._rtsPlaceStruct('enemy', 'power', 0, 0, true);
var L = W('limpet');
S.ok('THE LIMPET goes on a ship or a building, never a tank or a man', g._rtsWeaponReaches(L, boat) && g._rtsWeaponReaches(L, b5) && !g._rtsWeaponReaches(L, tk5) && !g._rtsWeaponReaches(L, rf5), '');
S.ok('...so a Frogman answers infantry with his pistol, a ship with the limpet - and a tank with the pistol, since the limpet cannot go on it', g._rtsPickWeapon(fm, rf5) === W('frogmg') && g._rtsPickWeapon(fm, boat) === L && g._rtsPickWeapon(fm, tk5) === W('frogmg'),
     (g._rtsPickWeapon(fm, rf5) === L ? 'limpet' : 'pistol') + ' / ' + (g._rtsPickWeapon(fm, boat) === L ? 'limpet' : 'pistol'));
hold([fm, boat]);
var bh = boat.hp;
fire(fm, boat, L);
step(L.plant.fuse + 0.5);
S.ok('...and a ship with a limpet on it is sunk', boat.dead || boat.hp < bh - 300, 'hp ' + boat.hp.toFixed(0) + '/' + bh);

/* --------------------------------------------------------------- he swims ---- */
var wc = null;
for (var i = 0; i < g.RTS_N * g.RTS_N && !wc; i++) if (G.terrain[i] === g.RTS_T_WATER) wc = [i % g.RTS_N, (i / g.RTS_N) | 0];
var fm2 = at('player', 'frogman', 0, 0), rf6 = at('player', 'rifle', 0, 0);
S.ok('(the map has water)', !!wc, '');
S.ok('HE SWIMS: a Frogman has a way onto the water, where a rifleman has none',
     g._rtsDomainOf(fm2) === 'hover' && !g._rtsBlocked(wc[0], wc[1], 'hover') && g._rtsBlocked(wc[0], wc[1], g._rtsDomainOf(rf6)), '');

/* ----------------------------------------------------------------- the bomb ---- */
fresh();
var zl = at('player', 'zealot', 0, 0), tk7 = at('enemy', 'tank', 0.5, 0), own7 = at('player', 'rifle', -0.5, 0.5), far7 = at('enemy', 'rifle', 6, 6);
hold([zl, tk7, own7, far7]);
var t70 = tk7.hp, o70 = own7.hp, f70 = far7.hp;
fire(zl, tk7, W('zealblast'));
S.ok('THE BOMB: a Zealot\'s shot is itself going off - it is gone', zl.dead && zl.blasted === 1, '');
S.ok('...and the tank it ran at is badly hurt', t70 - tk7.hp > 150, 'took ' + (t70 - tk7.hp).toFixed(0));
S.ok('...and its own men beside it are hurt too, but not one six cells off', own7.hp < o70 && far7.hp === f70, 'own ' + own7.hp.toFixed(0) + ', far ' + far7.hp);

/* ------------------------------------------------------ killed, it goes off ---- */
fresh();
var zl2 = at('enemy', 'zealot', 0, 0), rf8 = at('player', 'rifle', 0.6, 0.3);
hold([zl2, rf8]);
var r80 = rf8.hp;
g._rtsDamage(zl2, 999, null);
S.ok('KILLED, IT GOES OFF: a Zealot shot dead goes off where it falls', zl2.dead && rf8.hp < r80, rf8.hp.toFixed(0) + '/' + r80);
var wk = at('enemy', 'wrecker', 8, 0), pb = at('player', 'tank', 8 + g.RTS_WEAPONS.zealblast.self.rad / T + 0.5, 0);
hold([wk, pb]);
var pb0 = pb.hp;
g._rtsDamage(wk, 9999, null);
S.ok('...a Wrecker, further than a Zealot reaches', wk.dead && pb.hp < pb0, 'tank at ' + ((pb.x - wk.x) / T).toFixed(1) + ' cells: ' + pb.hp.toFixed(0) + '/' + pb0);
/* half the time a crew bails out of a wreck, so ten of each: the Wrecker against a plain truck-sized Light Tank */
function crews(key) {
  G.ents.forEach(function (o) { if (o.def === 'rifle' && o.side === 'enemy') o.dead = true; });
  var before = 0;
  var n = 0, live = function () { return G.ents.filter(function (o) { return !o.dead && o.def === 'rifle' && o.side === 'enemy'; }); };
  /* one at a time, and the crew counted and cleared before the next, or the next one's blast kills them */
  for (var k = 0; k < 10; k++) {
    var v = at('enemy', key, -14, 8); g._rtsDamage(v, 9999, null);
    var c = live(); n += c.length - before; c.forEach(function (o) { o.dead = true; });
  }
  return n;
}
var cw = crews('wrecker'), cl = crews('light');
S.ok('NOTHING LEFT: no crew climbs out of a Wrecker that has gone off (out of ten; ten Light Tanks lose some)', cw === 0 && cl > 0, 'wrecker ' + cw + ', light ' + cl);
var z3 = at('enemy', 'zealot', -8, 0), z4 = at('enemy', 'zealot', -8.3, 0), vic = at('player', 'heavy', -7.4, 0.4);
hold([z3, z4, vic]);
var v0 = vic.hp;
g._rtsDamage(z3, 999, null);
var once = v0 - vic.hp, z4b = z4.blasted;
g._rtsBlastGo(z4);
S.ok('...and once only: the second Zealot, set off by the first, does not go off again', z4.dead && z4b === 1 && vic.hp === v0 - once, 'took ' + once.toFixed(0) + ', then ' + (v0 - vic.hp).toFixed(0));

/* ------------------------------------------------------------- opponent ---- */
var A = g.RTS_AI;
/* not until it has a plan for them: see the comment on RTS_AI.mix.infantry, and batch 12 */
S.ok('the opponent does not buy the explosives', !['sapper', 'zealot', 'frogman', 'wrecker'].some(function (k) {
       return Object.keys(A.mix).some(function (c) { return A.mix[c].some(function (m) { return m.key === k; }); }); }), '');

require('../lib/report.js')(S);
