/* THE SEAT-FAIR MAP (core/mirror.js, rules/skirmish.js `layout`):

     REFLECTED      on every axis the ring can roll (straight and both diagonals), each cell of the
                    player's half - ground, block, height, ore, gems - is the same as its reflection
                    on the opponent's, bases laid included, and the player's start reflects onto the
                    opponent's
     THE BASES      with both seats opening alike, every building of one base stands on the
                    reflection of the other's footprint, and every unit on the reflection of its
                    counterpart
     A RANDOM MAP   is not: the default leaves the generator's own lean in place
     WHOLE          the two bases are joined by land, and the sea is still one body of water
     SEATS          an ally's start reflects onto the second foe's
     THE OPTION     MIRRORED is a GROUND choice in the setup, and RANDOM the default */

var { Suite } = require('../lib/assert.js');
var { loadFast } = require('../lib/sandbox.js');

var S = new Suite('mirror');
var g = loadFast(['src/rules', 'src/core', 'src/sprites/props.js']);
/* both seats the computer's, as self-play plays it - the human's opening is its own by design */
function make(seed, sk) { g._rtsNewGame(seed, 'normal', { skirmish: sk, player: { ctl: 'ai', diff: 'normal' } }); return g._rtsG; }
function frame(G) {
  var p = G.starts.player, e = G.starts.enemy, ax = Math.sign(e.tx - p.tx), az = Math.sign(e.tz - p.tz);
  return { c: g.RTS_N / 2, ax: ax, az: az, k: (ax && az) ? 2 : 1 };
}
function refl(F, x, z) { var d = (x - F.c) * F.ax + (z - F.c) * F.az; return { d: d, x: x - 2 * d * F.ax / F.k, z: z - 2 * d * F.az / F.k }; }
/* cells of the player's half whose reflection differs, over every array the map is made of */
function mismatches(G) {
  var F = frame(G), N = g.RTS_N, bad = 0, n = 0, A = [G.terrain, G.height, G.scrap, G.gems];
  for (var z = 0; z < N; z++) for (var x = 0; x < N; x++) {
    var r = refl(F, x, z);
    if (r.d >= 0 || !g._rtsInB(r.x, r.z)) continue;
    n++;
    var a = g._rtsIdx(x, z), b = g._rtsIdx(r.x, r.z);
    if (A.some(function (arr) { return arr[a] !== arr[b]; }) || ((G.blocked[a] === 2) !== (G.blocked[b] === 2))) bad++;
  }
  return { n: n, bad: bad };
}
/* flood a domain from one cell; returns the visited mask */
function flood(G, s, ok) {
  var N = g.RTS_N, seen = new Uint8Array(N * N), q = [s], h = 0; seen[s] = 1;
  while (h < q.length) {
    var c = q[h++], x = c % N, z = (c / N) | 0;
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
      var nx = x + d[0], nz = z + d[1], k = nx + nz * N;
      if (!g._rtsInB(nx, nz) || seen[k] || !ok(k)) return;
      seen[k] = 1; q.push(k);
    });
  }
  return seen;
}

/* ---------------- reflected, on every axis ---------------- */
var axes = {};
[7, 12345, 31, 9003, 9017, 4242].forEach(function (seed) {
  var G = make(seed, { layout: 'mirror' }), F = frame(G), m = mismatches(G), p = G.starts.player, e = G.starts.enemy, rp = refl(F, p.tx, p.tz);
  axes[F.ax + ',' + F.az] = 1;
  S.ok('seed ' + seed + ' (axis ' + F.ax + ',' + F.az + '): every cell of the player\'s half matches its reflection, and the starts reflect onto each other',
       m.n > 7000 && m.bad === 0 && rp.x === e.tx && rp.z === e.tz, JSON.stringify({ cells: m.n, differ: m.bad, start: [p.tx, p.tz], reflected: [rp.x, rp.z], foe: [e.tx, e.tz] }));

  /* whole: land from base to base, and one sea */
  var land = flood(G, g._rtsIdx(p.tx, p.tz), function (k) { return G.blocked[k] !== 2 && G.terrain[k] !== g.RTS_T_WATER; });
  var wet = [], N = g.RTS_N;
  for (var i = 0; i < N * N; i++) if (G.terrain[i] === g.RTS_T_WATER) wet.push(i);
  var sea = wet.length ? flood(G, wet[0], function (k) { return G.terrain[k] === g.RTS_T_WATER; }) : null;
  var biggest = sea ? wet.filter(function (k) { return sea[k]; }).length : 0;
  S.ok('...joined by land base to base, and its sea mostly one body', land[g._rtsIdx(e.tx, e.tz)] === 1 && biggest >= wet.length * 0.8,
       JSON.stringify({ landToFoe: !!land[g._rtsIdx(e.tx, e.tz)], water: wet.length, oneBody: biggest }));
});
/* Two things cannot be reflected and are left out: a refinery's free harvester comes out at the
   refinery's own offset, not as a laid slot; and on a DIAGONAL axis the reflection turns a 3x2
   footprint into 2x3, which a building cannot do, so a non-square building there lands within a
   cell of it. Seed 7 rolls a straight axis, where every other footprint reflects exactly. */
var GB = make(7, { layout: 'mirror' }), FB = frame(GB), pairs = 0, unmatched = [];
GB.ents.filter(function (e) { return e.side === 'player' && e.def !== 'harvester'; }).forEach(function (pe) {
  var hit = GB.ents.some(function (ee) {
    if (ee.side !== 'enemy' || ee.type !== pe.type) return false;
    var r = refl(FB, pe.x / g.RTS_TILE + g.RTS_N / 2 - 0.5, pe.z / g.RTS_TILE + g.RTS_N / 2 - 0.5);
    return Math.abs(ee.x / g.RTS_TILE + g.RTS_N / 2 - 0.5 - r.x) < 0.01 && Math.abs(ee.z / g.RTS_TILE + g.RTS_N / 2 - 0.5 - r.z) < 0.01;
  });
  if (hit) pairs++; else unmatched.push(pe.def);
});
S.ok('with both seats opening alike, each building and unit of one base stands on the reflection of its counterpart', pairs >= 9 && !unmatched.length,
     pairs + ' matched' + (unmatched.length ? ', unmatched ' + unmatched.join(',') : ''));
S.ok('...over straight and both diagonal axes', Object.keys(axes).length >= 4, Object.keys(axes).join(' '));

/* ---------------- a random map is not ---------------- */
var r = mismatches(make(7, null));
S.ok('a RANDOM map keeps the generator\'s own lean', r.bad > 1000, r.bad + ' of ' + r.n + ' cells differ from their reflection');

/* ---------------- seats ---------------- */
var G4 = make(7, { layout: 'mirror', foes: 'team' }), F4 = frame(G4), ra = refl(F4, G4.starts.ally.tx, G4.starts.ally.tz);
S.ok('an ally\'s start reflects onto the second foe\'s', ra.x === G4.starts.enemy2.tx && ra.z === G4.starts.enemy2.tz,
     JSON.stringify({ ally: G4.starts.ally, reflected: [ra.x, ra.z], enemy2: G4.starts.enemy2 }));

/* ---------------- the option ---------------- */
S.ok('MIRRORED is a GROUND choice, and RANDOM the default', !!g.RTS_SKIRMISH.layout.mirror.mirror && g.RTS_SKIRMISH_DEFAULT.layout === 'random', '');

require('../lib/report.js')(S);
