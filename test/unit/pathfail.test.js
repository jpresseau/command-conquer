/* A UNIT THAT CANNOT GET THERE STOPS ASKING (core/harvest.js, core/units.js), headless:

     THE DOCK      walled in with its refinery out of reach, it asks the pathfinder a handful of
                   times in five seconds - its 1.5 s re-plan - not every tick
     THE FIELD     walled in with the ore out of reach, one failed search writes off every ore tile
                   it cannot reach, so it does not try them one a tick
     THE CHASE     a tank ordered at a building it cannot reach re-plans on its 0.9 s timer, not
                   every tick

   Measured before, in a four-seat battle on the large map: one harvester asked 1,587 times in
   twenty seconds, every search failing and covering the whole map - 16 ms of every tick; and in an
   ordinary 1v1, two units chasing a walled-in yard, 5 ms of every tick. */

var { Suite } = require('../lib/assert.js');
var { loadFast } = require('../lib/sandbox.js');

var S = new Suite('pathfail');
var g = loadFast(['src/rules', 'src/core', 'src/sprites/props.js']);

/* a ring of rock round a cell: what stands inside cannot walk out */
function ring(G, cx, cz) {
  for (var dx = -3; dx <= 3; dx++) for (var dz = -3; dz <= 3; dz++) {
    if (Math.max(Math.abs(dx), Math.abs(dz)) !== 3) continue;
    var i = g._rtsIdx(cx + dx, cz + dz); G.terrain[i] = g.RTS_T_ROCK; G.blocked[i] = 2; G.scrap[i] = 0;
  }
}
function countCalls(secs) {
  var n = 0, fails = 0, P = g._rtsPathFor;
  g._rtsPathFor = function () { n++; var r = P.apply(this, arguments); if (!r) fails++; return r; };
  for (var i = 0; i < 60 * secs; i++) g._rtsTick(1 / 60);
  g._rtsPathFor = P;
  return { calls: n, fails: fails };
}

/* the opening's harvester: a player who builds a refinery gets one; give one directly */
g._rtsNewGame(7, 'normal');
var G = g._rtsG, P = G.starts.player;
var ref = g._rtsPlaceStruct('player', 'refinery', P.tx + 8, P.tz + 8, true);
var hx = P.tx - 12, hz = P.tz;
var h = g._rtsSpawnUnit('player', 'harvester', g._rtsWX(hx), g._rtsWX(hz));
S.ok('the population: a refinery and a harvester, the harvester walled in by rock', !!ref && !!h, '');
ring(G, hx, hz);
h.hstate = 'toRef'; h.carry = 100; h.carryVal = 100; h.ref = ref; h.path = null;
var dock = countCalls(5);
S.ok('a harvester that cannot reach its refinery asks a handful of times in five seconds (it was 308), not every tick', dock.calls > 0 && dock.calls <= 20,
     JSON.stringify(dock));

/* the field: a fresh battle, the harvester fenced, sent for ore */
g._rtsNewGame(7, 'normal');
G = g._rtsG; P = G.starts.player;
var h2 = g._rtsSpawnUnit('player', 'harvester', g._rtsWX(P.tx - 12), g._rtsWX(P.tz));
ring(G, P.tx - 12, P.tz);
h2.hstate = 'toField'; h2.htile = null; h2.path = null; h2.carry = 0;
var ore = 0; for (var i = 0; i < G.scrap.length; i++) if (G.scrap[i] > 0) ore++;
var field = countCalls(5);
var off = Object.keys(h2.noGo || {}).length;
S.ok('a harvester that cannot reach the ore writes the whole field off after a few searches (it was 307, one tile each)', ore > 50 && field.calls <= 20 && off >= ore * 0.9,
     JSON.stringify({ ore: ore, calls: field.calls, writtenOff: off }));

/* the chase: a tank fenced in, ordered at the enemy's yard */
g._rtsNewGame(7, 'normal');
G = g._rtsG; P = G.starts.player;
var t = g._rtsSpawnUnit('player', 'tank', g._rtsWX(P.tx - 12), g._rtsWX(P.tz));
ring(G, P.tx - 12, P.tz);
g._rtsOrderAttack(t, g._rtsHas('enemy', 'yard'));
var chase = countCalls(5);
S.ok('a tank ordered at a building it cannot reach re-plans on its timer (it was 307 in five seconds), not every tick', t.order === 'attack' && chase.calls > 0 && chase.calls <= 20,
     JSON.stringify({ order: t.order, calls: chase.calls, fails: chase.fails }));

require('../lib/report.js')(S);
