/* QUEUED ORDERS (core/orders.js _rtsWayNext, core/units.js), headless, in a real battle:

     IN ORDER     a tank moving to one stop with two more queued reaches all three, in the order
                  given, and is idle with nothing queued after the last
     A BAD STOP   a stop with no route is dropped and the one after it is taken
     AN ATTACK    a queued attack-move stop is walked as an attack-move
     HOLD         hold clears what is queued
     A SAVE       queued stops survive a save, resumed in a fresh world, and are walked after */

var { Suite } = require('../lib/assert.js');
var { loadFast } = require('../lib/sandbox.js');

var S = new Suite('waypoints');
function world() {
  var g = loadFast(['src/rules', 'src/core', 'src/sprites/props.js', 'src/rts.save.js']);
  g._rtsNewGame(7, 'normal'); g.window._rtsUI = {};
  g._rtsG.sides.enemy.ctl = 'none';                     /* nobody comes: this is about walking */
  return g;
}
var g = world(), G = g._rtsG, T = g.RTS_TILE;
var y = g._rtsHas('player', 'yard');
function cell(dx, dz) { var c = g._rtsNearestOpen(g._rtsTX(y.x) + dx, g._rtsTX(y.z) + dz, 8, null); return { x: g._rtsWX(c[0]), z: g._rtsWX(c[1]) }; }
function tank(g) { var yy = g._rtsHas('player', 'yard'), c = g._rtsNearestOpen(g._rtsTX(yy.x) + 4, g._rtsTX(yy.z) + 4, 8, null); return g._rtsSpawnUnit('player', 'tank', g._rtsWX(c[0]), g._rtsWX(c[1])); }
/* run until idle or `secs`, noting each stop the first time the unit is within 1.5 tiles of it */
function walk(g, u, stops, secs) {
  var seen = [], orders = {};
  for (var i = 0; i < 60 * secs; i++) {
    g._rtsTick(1 / 60);
    if (u.order) orders[u.order] = true;
    stops.forEach(function (p, k) { if (seen.indexOf(k) < 0 && Math.hypot(u.x - p.x, u.z - p.z) < 1.5 * T) seen.push(k); });
    if (!u.order && !u.path && !u.wq && i > 30) break;
  }
  return { seen: seen, order: u.order, wq: u.wq, orders: Object.keys(orders).sort().join() };
}
var A = cell(10, 0), B = cell(10, 10), C = cell(0, 10);
S.ok('the three stops are apart and on open ground', Math.hypot(A.x - B.x, A.z - B.z) > 6 * T && Math.hypot(B.x - C.x, B.z - C.z) > 6 * T, JSON.stringify([A, B, C]));

/* ---------------- in order ---------------- */
var u = tank(g);
g._rtsOrderMove(u, A.x, A.z, false); u.wq = [{ x: B.x, z: B.z }, { x: C.x, z: C.z }];
var r = walk(g, u, [A, B, C], 90);
S.ok('IN ORDER: all three stops, in the order given, and idle with nothing queued after', r.seen.join() === '0,1,2' && !r.order && r.wq == null, JSON.stringify(r));

/* ---------------- a bad stop ---------------- */
u = tank(g);
var BAD = { x: A.x + 0.123, z: A.z + 0.456 }, path0 = g._rtsPathFor;
g._rtsPathFor = function (e, x, z) { return x === BAD.x && z === BAD.z ? null : path0(e, x, z); };   /* that one point, and only it, has no route */
g._rtsOrderMove(u, C.x, C.z, false); u.wq = [{ x: BAD.x, z: BAD.z }, { x: B.x, z: B.z }];
r = walk(g, u, [C, B], 90);
g._rtsPathFor = path0;
S.ok('A BAD STOP: a stop with no route is dropped and the one after it is taken', r.seen.join() === '0,1' && !r.order && r.wq == null, JSON.stringify(r));

/* ---------------- an attack-move stop ---------------- */
u = tank(g);
g._rtsOrderMove(u, B.x, B.z, false); u.wq = [{ x: A.x, z: A.z, am: true }];
r = walk(g, u, [B, A], 90);
S.ok('AN ATTACK: a queued attack-move stop is walked as an attack-move', r.seen.join() === '0,1' && r.orders === 'amove,move', JSON.stringify(r));

/* ---------------- hold ---------------- */
u = tank(g);
g._rtsOrderMove(u, A.x, A.z, false); u.wq = [{ x: B.x, z: B.z }];
G.sel = [u];
var held = g._rtsHoldSelected();
S.ok('HOLD: clears what is queued', held === 1 && u.order === 'hold' && u.wq == null, JSON.stringify({ order: u.order, wq: u.wq }));

/* ---------------- a save ---------------- */
u = tank(g);
g._rtsOrderMove(u, A.x, A.z, false); u.wq = [{ x: B.x, z: B.z }, { x: C.x, z: C.z, am: true }];
for (var i = 0; i < 60; i++) g._rtsTick(1 / 60);
var body = JSON.parse(JSON.stringify(g._rtsSaveState(G)));
var g2 = world(); g2._rtsApplyState(g2._rtsG, body);
var u2 = g2._rtsG.ents.filter(function (e) { return e.id === u.id; })[0];
S.ok('A SAVE: the queued stops come back in a fresh world', !!u2 && JSON.stringify(u2.wq) === JSON.stringify(u.wq) && u2.order === 'move', JSON.stringify(u2 && { wq: u2.wq, order: u2.order }));
r = u2 ? walk(g2, u2, [A, B, C], 90) : { seen: [] };
S.ok('...and are walked after', r.seen.join() === '0,1,2' && r.wq == null, JSON.stringify(r));

require('../lib/report.js')(S);
