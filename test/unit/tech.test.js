/* TECH BUILDINGS (rules `derrick` / `hospital` / `mshop` / `airstrip`, the setup's TOWNS + TECH,
   core/tech.js and its hooks in core/garrison.js, core/orders.js, core/units.js, core/supers.js and
   core/tick.js), on the real simulation:

     LAID         TOWNS + TECH lays one of each, no one's; TOWNS alone lays none
     CLAIMABLE    an Engineer may be sent at one no one holds, though it is no one's enemy - and not
                  at a town's house; a rifleman takes nothing
     TAKEN        the Engineer walks in and it is the player's
     THE DERRICK  pays its owner every ten seconds
     THE HOSPITAL heals its owner's infantry near it, not a tank, not the enemy's
     THE SHOP     repairs its owner's vehicles near it, not a man
     THE AIRSTRIP gives its owner Paratroopers: four rifle squads in a plane, sent to the cell chosen
     NO ONE'S     held by no one, none of them works for anybody */

var { Suite } = require('../lib/assert.js');
var { loadFast } = require('../lib/sandbox.js');

var S = new Suite('tech');
var g = loadFast(['src/rules', 'src/core', 'src/sprites/props.js']);
var T = g.RTS_TILE, G;

function make(sk) { g.window._RTS_ARMY = 'allied'; g._rtsNewGame(7, 'normal', { skirmish: sk }); G = g._rtsG; G.over = null; return G; }
function tech(key) { return G.ents.filter(function (e) { return !e.dead && e.def === key; })[0]; }
function step(secs, each) { for (var t = 0; t < secs * 30; t++) { if (each) each(); g._rtsTick(1 / 30); } }

/* ---------------------------------------------------------------- laid ---- */
make({ town: 'towns' });
S.ok('TOWNS alone lays no tech', !['derrick', 'hospital', 'mshop', 'airstrip'].some(tech), '');
make({ town: 'tech' });
var keys = ['derrick', 'hospital', 'mshop', 'airstrip'];
S.ok('TOWNS + TECH lays one of each, no one\'s', keys.every(function (k) { var b = tech(k); return b && b.side === 'civ'; }), keys.map(function (k) { return k + ':' + (tech(k) ? tech(k).side : 'none'); }).join(' '));
/* nothing laid, nothing below has anything to look at: the red above is the verdict */
if (!keys.every(tech)) { require('../lib/report.js')(S); return; }

/* ---------------------------------------------------------------- no one's ---- */
var drk = tech('derrick'), c0 = G.sides.player.credits, e0 = G.sides.enemy.credits;
step(12);
S.ok('NO ONE\'S: held by no one, the derrick pays nobody - its clock never starts', drk.oilT === undefined, 'oilT ' + drk.oilT);

/* ---------------------------------------------------------------- claimable ---- */
var eng = g._rtsSpawnUnit('player', 'engineer', drk.x + 4 * T, drk.z), man = g._rtsSpawnUnit('player', 'rifle', drk.x + 4 * T, drk.z + T);
var house = G.ents.filter(function (e) { return !e.dead && e.def === 'cottage'; })[0];
S.ok('CLAIMABLE: an Engineer may be sent at a tech building no one holds, though it is no one\'s enemy', !g._rtsHostile('civ', 'player') && g._rtsOrderCapture(eng, drk), '');
S.ok('...and not at a town\'s house', !!house && !g._rtsOrderCapture(g._rtsSpawnUnit('player', 'engineer', house.x + 4 * T, house.z), house), '');
S.ok('...and a rifleman takes nothing', !g._rtsOrderCapture(man, drk) || !g.rtsUnitDef('rifle').capture, '');

/* ---------------------------------------------------------------- taken ---- */
step(20, function () { });
S.ok('TAKEN: the Engineer walks in and it is the player\'s', drk.side === 'player' && eng.dead, 'derrick ' + drk.side);

/* ---------------------------------------------------------------- the derrick ---- */
var cr = G.sides.player.credits;
step(g.RTS_TECH.oil.every + 0.6);
S.ok('THE DERRICK pays its owner every ten seconds', G.sides.player.credits - cr >= g.RTS_TECH.oil.pay, 'paid ' + (G.sides.player.credits - cr));

/* ------------------------------------------------- the hospital and the shop ---- */
var hos = tech('hospital'), shop = tech('mshop'), yd = g._rtsHas('player', 'yard');
/* at home, out of the fighting, one at a time on the same open ground: what each does is read from
   where it stands (b.x, b.z) */
var spotX = yd.x, spotZ = yd.z + 7 * T;
function trial(b) {
  b.side = 'player'; b.x = spotX; b.z = spotZ;
  /* each on its own cell: a tank stood on a man crushes him */
  var mk = function (side, key, n) { var u = g._rtsSpawnUnit(side, key, spotX + (2 + n) * T, spotZ + (1 + n) * T); u.hp = u.maxHp * 0.5; return u; };
  var out = [];
  var us = [mk('player', 'rifle', 0), mk('player', 'tank', 1), mk('enemy', 'rifle', 2)], h0 = us.map(function (u) { return u.hp; });
  /* everyone holds fire, the base's guns too: an enemy man shot dead heals by nothing, and proves nothing */
  step(3, function () {
    G.ents.forEach(function (o) { o.cool = 99; o.target = null; });
    us.forEach(function (u) { u.path = null; u.order = 'hold'; });
  });
  out.alive = us.every(function (u) { return !u.dead && Math.hypot(u.x - b.x, u.z - b.z) < g.RTS_TECH.heal.r; });
  b.side = 'civ';
  us.forEach(function (u, k) { out.push(u.hp - h0[k]); });
  us.forEach(function (u) { u.dead = true; });
  return out;
}
var hu = trial(hos), su = trial(shop);
S.ok('(the staging: all three of each trial alive at the end of it, and within its reach)', hu.alive && su.alive, '');
S.ok('THE HOSPITAL heals its owner\'s infantry near it', hu[0] > 10, '+' + hu[0].toFixed(0));
S.ok('...not a tank beside it, not the enemy\'s men', hu[1] <= 0 && hu[2] <= 0, 'tank ' + hu[1].toFixed(0) + ', enemy ' + hu[2].toFixed(0));
S.ok('THE SHOP repairs its owner\'s vehicles near it, not a man', su[1] > 10 && su[0] <= 0, 'tank +' + su[1].toFixed(0) + ', man ' + su[0].toFixed(0));

/* ---------------------------------------------------------------- the airstrip ---- */
var air = tech('airstrip');
air.side = 'player';
step(1);
var st = G.sides.player.supers && G.sides.player.supers.paradrop;
S.ok('THE AIRSTRIP gives its owner Paratroopers (charging)', !!st, JSON.stringify(st));
if (st) { st.t = 9999; st.ready = true; }
var tx = g._rtsTX(air.x) + 10, tz = g._rtsTX(air.z);
var ok = g._rtsSuperFire('player', 'paradrop', tx, tz);
var plane = G.ents.filter(function (e) { return !e.dead && e.def === 'paraplane' && e.side === 'player'; })[0];
S.ok('...a plane with four rifle squads aboard, sent to the cell chosen', ok && !!plane && (plane.cargo || []).length === 4 && plane.order !== null,
     plane ? (plane.cargo || []).length + ' aboard, order ' + plane.order : 'no plane');

require('../lib/report.js')(S);
