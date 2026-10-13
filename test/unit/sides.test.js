/* AN ALLY AND A SECOND FOE (rules/skirmish.js foes, core/seats.js, scenario.js, terrain.js, tick.js):

     THE LINE-UPS   1 FOE is the two seats that always play; 2 FOES adds a second opponent, FOE +
                    ALLY a computer ally, 2 V 2 both - each with its own base, yard and brain
     WHERE          an extra base stands beside the seat it sides with, clear of water, on ground a
                    tank can drive from there to its partner's yard
     WHOSE ARMY     an ally fields the player's army, a second foe the first foe's
     WHO FIGHTS     sides on one team are never hostile, sides on two always are; a computer seat
                    fights the seat across the map, then the nearest one left
     FREE-FOR-ALL   three or four seats, each its own team, spread round the map, every base reached
                    by land, and each fighting the next round the ring
     MINES          every computer seat but the player's own learns where its units hit mines
     THE BRAINS     in three minutes of a 2 V 2 every seat has built on its opening, and nobody's
                    guns have hit a teammate
     A SAVE         a 2 V 2 saved and loaded comes back with its seats, brains and entities
     THE RESULT     the battle is won when every foe's last building is gone, not before; an ally
                    still standing does not save a player whose own base is gone */

var { Suite } = require('../lib/assert.js');
var { loadFast } = require('../lib/sandbox.js');

var S = new Suite('sides');
var g = loadFast(['src/rules', 'src/core', 'src/sprites/props.js', 'src/rts.save.js']);
function make(foes, seed, ai) {
  g._rtsNewGame(seed || 7, 'normal', { skirmish: { foes: foes }, player: ai ? { ctl: 'ai', diff: 'normal' } : undefined });
  return g._rtsG;
}
/* land a tank can cross from one cell to another */
function landPath(G, a, b) {
  var N = g.RTS_N, seen = new Uint8Array(N * N), q = [a.tx + a.tz * N]; seen[q[0]] = 1;
  while (q.length) {
    var c = q.shift(), x = c % N, z = (c / N) | 0;
    if (Math.abs(x - b.tx) <= 2 && Math.abs(z - b.tz) <= 2) return true;
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
      var nx = x + d[0], nz = z + d[1], k = nx + nz * N;
      if (!g._rtsInB(nx, nz) || seen[k]) return;
      seen[k] = 1;
      if (G.blocked[k] === 2) return;   /* ground a tank crosses: a bridge is water with no block (core/bridge.js); buildings pass here, we ask about the ground */
      q.push(k);
    });
  }
  return false;
}

/* ---------------- the line-ups ---------------- */
[['one', 'player,enemy'], ['two', 'player,enemy,enemy2'], ['ally', 'player,enemy,ally'], ['team', 'player,enemy,ally,enemy2']].forEach(function (c) {
  var G = make(c[0]);
  var yards = G.order.filter(function (k) { return !!g._rtsHas(k, 'yard'); });
  var brains = G.order.filter(function (k) { return k === 'player' || (G.sides[k].ctl === 'ai' && !!G.sides[k].ai); });
  S.ok(c[0] + ': seats ' + c[1] + ', each with its yard and (but the human) its brain', G.order.join() === c[1] && yards.length === G.order.length && brains.length === G.order.length,
       JSON.stringify({ order: G.order, yards: yards, brains: brains }));
});

/* ---------------- where ---------------- */
[7, 12345, 31, 4242].forEach(function (seed) {
  var G = make('team', seed), bad = [];
  ['ally', 'enemy2'].forEach(function (k) {
    var s = G.starts[k], near = G.starts[g.RTS_SEATS[k].near], wet = 0;
    for (var dx = -7; dx <= 7; dx++) for (var dz = -7; dz <= 7; dz++) {
      if (dx * dx + dz * dz > 49 || !g._rtsInB(s.tx + dx, s.tz + dz)) continue;
      if (G.terrain[g._rtsIdx(s.tx + dx, s.tz + dz)] === g.RTS_T_WATER) wet++;
    }
    var dn = Math.hypot(s.tx - near.tx, s.tz - near.tz), dfar = Math.min.apply(null, G.order.filter(function (o) { return o !== k && o !== g.RTS_SEATS[k].near; })
      .map(function (o) { return Math.hypot(s.tx - G.starts[o].tx, s.tz - G.starts[o].tz); }));
    /* on the flank away from the inlet: no water on the straight line to its partner */
    for (var t = 0, across = 0; t <= 60; t++) if (G.terrain[g._rtsIdx(Math.round(s.tx + (near.tx - s.tx) * t / 60), Math.round(s.tz + (near.tz - s.tz) * t / 60))] === g.RTS_T_WATER) across++;
    if (wet || across || dn >= dfar || dn < 20 || !landPath(G, s, near)) bad.push('across ' + across + ' ' + k + ' wet ' + wet + ' near ' + dn.toFixed(0) + ' other ' + dfar.toFixed(0) + ' path ' + landPath(G, s, near));
  });
  S.ok('seed ' + seed + ': each extra base is beside its partner, dry, with no water between them, and joined to it by land', !bad.length, bad.join('; ') || 'ok');
  var ore = ['ally', 'enemy2'].map(function (k) {
    var st = G.starts[k], n = 0;
    for (var dx = -14; dx <= 14; dx++) for (var dz = -14; dz <= 14; dz++) if (g._rtsInB(st.tx + dx, st.tz + dz) && G.scrap[g._rtsIdx(st.tx + dx, st.tz + dz)] > 0) n++;
    return n;
  });
  S.ok('...and each has a home ore field', ore[0] > 20 && ore[1] > 20, 'ore cells within 14: ' + ore.join(', '));
});

/* ---------------- whose army, who fights ---------------- */
make('team');
S.ok('an ally fields the player\'s army, a second foe the first foe\'s', g.rtsHouseSide('ally') === g.rtsHouseSide('player') && g.rtsHouseSide('enemy2') === g.rtsHouseSide('enemy') &&
     g.rtsHouseSide('player') !== g.rtsHouseSide('enemy'), ['player', 'ally', 'enemy', 'enemy2'].map(g.rtsHouseSide).join());
var H = g._rtsHostile;
S.ok('one team is never hostile, two always are', !H('player', 'ally') && !H('enemy', 'enemy2') && H('player', 'enemy') && H('player', 'enemy2') && H('ally', 'enemy') && H('ally', 'enemy2') && !H('player', 'player') && !H('player', undefined), '');
var G4 = g._rtsG, foeOf = {};
G4.order.forEach(function (k) { foeOf[k] = g._rtsAIFoe(k); });
S.ok('...and in a 2 V 2 each seat fights the seat across, so no base has two attackers', foeOf.player === 'enemy' && foeOf.enemy === 'player' &&
     foeOf.ally === 'enemy2' && foeOf.enemy2 === 'ally', JSON.stringify(foeOf));
G4.sides.enemy2.lost = true;
var fb = g._rtsAIFoe('ally');
S.ok('...and with that seat out, the nearest foe left', fb === 'enemy', 'ally now fights ' + fb);
G4.sides.enemy2.lost = false;

/* ---------------- a free-for-all ---------------- */
[['ffa3', 3], ['ffa4', 4]].forEach(function (c) {
  var G = make(c[0]), teams = {}, seen = {}, ring = {};
  G.order.forEach(function (k) { teams[G.sides[k].team] = 1; ring[k] = g._rtsAIFoe(k); seen[ring[k]] = (seen[ring[k]] || 0) + 1; });
  var spread = 1e9;
  G.order.forEach(function (a) { G.order.forEach(function (b) { if (a < b) spread = Math.min(spread, Math.hypot(G.starts[a].tx - G.starts[b].tx, G.starts[a].tz - G.starts[b].tz)); }); });
  var reach = G.order.every(function (k) { return landPath(G, G.starts.player, G.starts[k]); });
  S.ok(c[0] + ': ' + c[1] + ' seats, every one its own team, spread round the map and joined by land', G.order.length === c[1] && Object.keys(teams).length === c[1] &&
       spread > 55 && reach, JSON.stringify({ order: G.order, teams: Object.keys(teams).length, spread: spread.toFixed(0), reach: reach }));
  S.ok('...each seat fights the next round the ring, so every seat has exactly one attacker', G.order.every(function (k) { return seen[k] === 1 && ring[k] !== k; }),
       JSON.stringify(ring));
});
/* a free-for-all base on the inlet's far flank is reached on every water and size: round the inlet's
   ends, or where a lagoon closes them, over the bridge core/bridge.js lays where its road meets the water */
var cut = [];
[7, 12345, 9003].forEach(function (seed) { [['lagoon', 'standard'], ['coast', 'small'], ['lagoon', 'small'], ['lagoon', 'large']].forEach(function (w) {
  var G = make('ffa4', seed);
  g._rtsNewGame(seed, 'normal', { skirmish: { foes: 'ffa4', water: w[0], size: w[1] } }); G = g._rtsG;
  G.order.forEach(function (k) { if (!landPath(G, G.starts.player, G.starts[k])) cut.push(seed + '/' + w.join('/') + ':' + k); });
}); });
S.ok('...and on every water and size each free-for-all base is reached by land', !cut.length, cut.join(' ') || 'all reached');
make('ffa4');
S.ok('a third foe fields the player\'s army', g.rtsHouseSide('enemy3') === g.rtsHouseSide('player'), g.rtsHouseSide('enemy3'));

/* ---------------- mines: every computer seat but the player's own learns ---------------- */
var GM = make('team', 7, true), wx = g._rtsWX(GM.starts.enemy2.tx + 6), wz = g._rtsWX(GM.starts.enemy2.tz);
var memo = {};
['enemy2', 'player'].forEach(function (k) {
  var u = g._rtsSpawnUnit(k, 'tank', wx, wz), foe = k === 'player' ? 'enemy' : 'ally';
  GM.mines = GM.mines || [];
  GM.mines.push({ side: foe, tx: g._rtsTX(u.x), tz: g._rtsTX(u.z), arm: 0, sea: false });
  for (var t = 0; t < 30; t++) g._rtsTick(1 / 60);
  memo[k] = g._rtsAIAs(k, function () { return (GM.mineHits || []).length; });
});
S.ok('a second foe\'s brain remembers where its tank hit a mine; the player\'s seat, played by the computer, keeps nothing', memo.enemy2 > 0 && memo.player === 0, JSON.stringify(memo));

/* a gun picks a foe, never a teammate parked beside it: an ally's tank next to the player's and the
   second foe's, with nothing else in reach */
G = make('team');
var ax = g._rtsWX(64), az = g._rtsWX(64);
var at = g._rtsSpawnUnit('ally', 'tank', ax, az), pt = g._rtsSpawnUnit('player', 'tank', ax + 2, az);
var pick0 = g._rtsFindTarget(at, 40);
var et = g._rtsSpawnUnit('enemy2', 'tank', ax - 3, az), pick1 = g._rtsFindTarget(at, 40);
S.ok('an ally\'s gun does not pick the player\'s tank beside it, and does pick a foe\'s', !!at && !!pt && !!et && !pick0 && pick1 === et,
     JSON.stringify({ alone: pick0 && pick0.side, withFoe: pick1 && pick1.side }));

/* ---------------- the brains ---------------- */
var G = make('team', 7, true), built0 = {}, built = {}, friendly = 0, hostile = 0;
G.order.forEach(function (k) { built0[k] = G.ents.filter(function (e) { return !e.dead && e.side === k && e.type === 'struct'; }).length; });
var dmg = g._rtsDamage;
g._rtsDamage = function (tgt, n, from, floor) {
  if (from && from.side && tgt && tgt.side && from.side !== tgt.side) { if (H(from.side, tgt.side)) hostile++; else friendly++; }
  return dmg.apply(this, arguments);
};
for (var i = 0; i < 60 * 180 && !G.over; i++) g._rtsTick(1 / 60);
g._rtsDamage = dmg;
G.order.forEach(function (k) { built[k] = G.ents.filter(function (e) { return !e.dead && e.side === k && e.type === 'struct'; }).length; });
S.ok('in three minutes of a 2 V 2 every seat has built on its opening', G.order.every(function (k) { return built[k] > built0[k] + 2; }), JSON.stringify({ from: built0, to: built }));
S.ok('...and no seat\'s guns have hit a teammate', friendly === 0, friendly + ' hits on a teammate, ' + hostile + ' on foes');

/* ---------------- the result ---------------- */
function razed(G, side) { G.ents.forEach(function (e) { if (!e.dead && e.side === side && e.type === 'struct') { g._rtsFootprint(e, false); g._rtsKillQuiet(e); } }); }
G = make('two'); razed(G, 'enemy'); g._rtsTick(1 / 60);
var mid = { over: G.over, lost: G.sides.enemy.lost };
razed(G, 'enemy2'); g._rtsTick(1 / 60);
S.ok('one foe razed is not a win; both razed is', mid.over === null && mid.lost === true && G.over === 'win', JSON.stringify({ mid: mid, over: G.over }));
G = make('ally'); razed(G, 'player'); g._rtsTick(1 / 60);
S.eq('an ally still standing does not save a player whose own base is gone', G.over, 'lose');

/* ---------------- a save ---------------- */
G = make('team', 7, true);
for (i = 0; i < 60 * 30; i++) g._rtsTick(1 / 60);
var body = JSON.parse(JSON.stringify(g._rtsSaveState(G))), n0 = G.ents.filter(function (e) { return !e.dead; }).length;
g._rtsNewGame(body.seed, body.diff, { skirmish: body.skirmish });
g._rtsApplyState(g._rtsG, body);
var L = g._rtsG, n1 = L.ents.filter(function (e) { return !e.dead; }).length;
for (i = 0; i < 60 * 5; i++) g._rtsTick(1 / 60);
S.ok('a 2 V 2 saved and loaded has its four seats, their brains and every entity, and plays on', L.order.join() === 'player,enemy,ally,enemy2' && n1 === n0 &&
     !!L.sides.ally.ai && !!L.sides.enemy2.ai && L.sides.ally.team === 0 && L.sides.enemy2.team === 1 && !L.over, JSON.stringify({ order: L.order, n0: n0, n1: n1 }));

require('../lib/report.js')(S);
