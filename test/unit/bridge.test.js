/* BRIDGES AND ROADS - core/bridge.js, the centrelines core/terrain.js keeps, and the road field
   render3d/road3d.js bakes from them. On real generated maps, without a page:

     POPULATION   bridges are laid across a dozen seeds, every one a real crossing - three cells
                  or more, the middle of it with water both sides
     BOTH WAYS    every deck cell is open to a tank AND to a ship: still water, blocked 0
     ENDS         each bridge lands on dry, open ground at both ends
     ONE SEA      the sea is still one body on every seed
     BUILD        nothing can be built on a deck
     STREAM       laying bridges draws nothing from the game's random stream: a map generated
                  with the span set to 0 is the same map - same starts, same terrain, the same
                  first units in the same places - apart from the decks and the ore
     ORE          ...and a bridge only ever gives ore back: never less on any seed, more on some
     DECK         a land unit on a deck stands above the water, highest mid-span, and comes down
                  to the shore's own height at the ends
     ROADS        the kept centrelines run down the road cells
     FIELD        the road field is asphalt along the roads, and nowhere far from one - a signed
                  distance in its first channel drew a phantom road between two roads */

var { Suite } = require('../lib/assert.js');
var { load } = require('../lib/sandbox.js');

var S = new Suite('bridge');
var g = load(['src/rules', 'src/core', 'src/render3d/road3d.js']);
var N = g.RTS_N, SPAN = g.RTS_BRIDGE_SPAN;
var SEEDS = [4242, 77, 1913, 31337, 600, 1, 2, 3, 12345, 999, 5150, 8080];

function game(seed, span) { g.RTS_BRIDGE_SPAN = span === undefined ? SPAN : span; g._rtsNewGame(seed, 'easy'); g.RTS_BRIDGE_SPAN = SPAN; return g.window._rtsG; }
function I(x, z) { return z * N + x; }
function oreOf(G) { var n = 0; for (var i = 0; i < N * N; i++) if (G.scrap[i] > 0) n++; return n; }
function bodies(G) {
  var seen = new Uint8Array(N * N), n = 0;
  for (var i = 0; i < N * N; i++) {
    if (seen[i] || G.terrain[i] !== g.RTS_T_WATER) continue;
    n++; var st = [i]; seen[i] = 1;
    while (st.length) {
      var c = st.pop(), x = c % N, z = (c / N) | 0;
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
        var a = x + d[0], b = z + d[1];
        if (a < 0 || b < 0 || a >= N || b >= N) return;
        var k = I(a, b);
        if (!seen[k] && G.terrain[k] === g.RTS_T_WATER) { seen[k] = 1; st.push(k); }
      });
    }
  }
  return n;
}

var total = 0, bad = [], seas = [], oreLost = [], oreGained = 0, decks = 0;
SEEDS.forEach(function (seed) {
  var G = game(seed), L = G.bridges, T = G.terrain, B = G.blocked;
  total += L.length;
  L.forEach(function (b) {
    var tag = seed + ' ' + b.tx + ',' + b.tz + ': ';
    if (b.len < g.RTS_BRIDGE_MIN || b.len > SPAN) bad.push(tag + 'a span of ' + b.len);
    g._rtsBridgeCells(b).forEach(function (k) {
      var x = k % N, z = (k / N) | 0;
      if (T[k] !== g.RTS_T_WATER) return;                   /* the far shore under a slanting lane */
      decks++;
      if (B[k] !== 0 || g._rtsBlocked(x, z) || g._rtsBlocked(x, z, 'sea')) bad.push(tag + 'deck cell ' + x + ',' + z + ' is not open both ways');
    });
    [[b.tx - b.dx, b.tz - b.dz], [b.tx + b.dx * b.len, b.tz + b.dz * b.len]].forEach(function (e) {
      if (T[I(e[0], e[1])] === g.RTS_T_WATER || B[I(e[0], e[1])] !== 0) bad.push(tag + 'an end at ' + e + ' is not dry open ground');
    });
    var mid = Math.floor(b.len / 2), mx = b.tx + b.dx * mid, mz = b.tz + b.dz * mid;
    if (T[I(mx - b.px * 2, mz - b.pz * 2)] !== g.RTS_T_WATER || T[I(mx + b.px * (b.w + 1), mz + b.pz * (b.w + 1))] !== g.RTS_T_WATER)
      bad.push(tag + 'runs along the water, not across it');
  });
  seas.push(bodies(G));
  var G0 = game(seed, 0), o1 = oreOf(game(seed)), o0 = oreOf(G0);
  if (o1 < o0) oreLost.push(seed + ': ' + o0 + ' -> ' + o1);
  if (o1 > o0) oreGained++;
});
S.ok('bridges are laid across ' + SEEDS.length + ' seeds', total >= 8, total + ' bridges, ' + decks + ' deck cells over water');
S.ok('...every one a crossing, open to tanks and ships alike, landing on dry ground at both ends', bad.length === 0, bad.slice(0, 5).join('; ') || 'clean');
S.ok('the sea is still one body on every seed', seas.every(function (n) { return n === 1; }), seas.join(','));
S.ok('a bridge only gives ore back - never less on any seed', oreLost.length === 0, oreLost.join('; ') || 'none lost');
S.ok('...and more on some, where it reaches what the sea had cut off', oreGained > 0, oreGained + ' seeds of ' + SEEDS.length);

/* BUILD: a one-cell turret on a deck cell, anywhere - the footprint test alone */
var Gb = game(4242), bb = Gb.bridges[0], bk = g._rtsBridgeCells(bb).filter(function (k) { return Gb.terrain[k] === g.RTS_T_WATER; })[0];
var bx = bk % N, bz = (bk / N) | 0, shore = [bb.tx - bb.dx * 3, bb.tz - bb.dz * 3];
S.ok('nothing can be built on a deck - while the same turret goes down on the shore', g._rtsCanPlace('player', 'turret', bx, bz, true) === false &&
     g._rtsCanPlace('player', 'turret', shore[0], shore[1], true) === true, 'deck ' + bx + ',' + bz + ', shore ' + shore);

/* STREAM: the same map but for the decks and the ore */
var Ga = game(4242), Gz = game(4242, 0), tdiff = 0, bdiff = [], ents = [];
for (var i = 0; i < N * N; i++) {
  if (Ga.terrain[i] !== Gz.terrain[i]) tdiff++;
  if (Ga.blocked[i] !== Gz.blocked[i] && !(Ga.terrain[i] === g.RTS_T_WATER && Ga.blocked[i] === 0)) bdiff.push(i);
}
Ga.ents.forEach(function (e, k) { var f = Gz.ents[k]; if (!f || f.def !== e.def || f.x !== e.x || f.z !== e.z) ents.push(e.def); });
S.ok('laying bridges draws nothing from the random stream: the same starts, terrain and first units', tdiff === 0 && bdiff.length === 0 &&
     ents.length === 0 && JSON.stringify(Ga.starts) === JSON.stringify(Gz.starts) && Ga.ents.length === Gz.ents.length && Ga.bridges.length > 0 && Gz.bridges.length === 0,
     tdiff + ' terrain cells, ' + bdiff.length + ' blocked cells off the decks, ' + ents.length + ' units moved, ' + Ga.bridges.length + ' bridges');

/* DECK */
g.window._rtsG = Ga;
var dk = Ga.bridges.slice().sort(function (a, b) { return b.len - a.len; })[0], W = function (c) { return g._rtsWX(c); };
var ys = [], els = [];
for (var t = 0; t <= dk.len; t++) {
  var x = W(dk.tx) + dk.dx * (t - 0.5) * g.RTS_TILE + dk.px * (dk.w - 1) * g.RTS_TILE / 2, z = W(dk.tz) + dk.dz * (t - 0.5) * g.RTS_TILE + dk.pz * (dk.w - 1) * g.RTS_TILE / 2;
  ys.push(+g._rtsStandY(x + dk.dx * 0.01, z + dk.dz * 0.01).toFixed(2)); els.push(+g._rtsElev(x, z).toFixed(2));
}
var midY = ys[Math.floor(ys.length / 2)];
var A0 = g._rtsBridgeEnd(dk, 0), A1 = g._rtsBridgeEnd(dk, 1), h0 = g._rtsElev(A0[0], A0[1]), e0 = g._rtsBridgeDeckY(dk, 0), e1 = g._rtsBridgeDeckY(dk, 1), h1 = g._rtsElev(A1[0], A1[1]);
S.ok('a land unit mid-span stands on the deck, well over the water', midY > els[Math.floor(els.length / 2)] + 1.2 && midY === Math.max.apply(null, ys),
     'stand ' + ys.join(' ') + ' over ground ' + els.join(' '));
S.ok('...and meets the ground exactly where it starts and ends - no step to drive up', Math.abs(e0 - h0) < 1e-9 && Math.abs(e1 - h1) < 1e-9, [e0, h0, e1, h1].map(function (v) { return v.toFixed(2); }).join(' '));
S.ok('off every deck a unit stands on the ground', g._rtsStandY(W(30), W(30)) === g._rtsElev(W(30), W(30)) && g._rtsBridgeAt(W(30), W(30)) === null);

/* ROADS */
var on = 0, all = 0;
Ga.roads.forEach(function (L) {
  for (var q = 0; q < L.length; q += 2) {
    var a = Math.round(L[q]), b = Math.round(L[q + 1]);
    if (a < 0 || b < 0 || a >= N || b >= N || Ga.terrain[I(a, b)] === g.RTS_T_WATER || Ga.scrap[I(a, b)] > 0) continue;
    all++;
    var near = false;
    for (var dz = -1; dz <= 1 && !near; dz++) for (var dx = -1; dx <= 1; dx++) if (Ga.terrain[I(Math.min(N - 1, Math.max(0, a + dx)), Math.min(N - 1, Math.max(0, b + dz)))] === g.RTS_T_ROAD) near = true;
    if (near) on++;
  }
});
S.ok('every carved road keeps its centreline', Ga.roads.length >= 3 && all > 300, Ga.roads.length + ' roads, ' + all + ' points on land');
S.ok('...and it runs down the road cells', on / all > 0.97, (100 * on / all).toFixed(1) + '% of points within a cell of road');

/* FIELD. Decoded as the shader decodes it, at the texels AND halfway between them, where the GPU
   interpolates - which is where a field that jumps between two roads drew a phantom one - and
   held against the true distance to the nearest stretch of centreline the field was built from. */
var F = g._r3dRoadField(Ga), FS = F.S, TX = g.R3D_ROAD_TEXEL, half = N * g.RTS_TILE / 2, RR = g.R3D_ROAD_RANGE;
var segs = [];
Ga.roads.forEach(function (L) {
  for (var q = 0; q + 3 < L.length; q += 2) {
    var a = Math.round((L[q] + L[q + 2]) / 2), b = Math.round((L[q + 1] + L[q + 3]) / 2);
    if (a < 0 || b < 0 || a >= N || b >= N || Ga.terrain[I(a, b)] !== g.RTS_T_ROAD) continue;
    segs.push([(L[q] - N / 2 + 0.5) * g.RTS_TILE, (L[q + 1] - N / 2 + 0.5) * g.RTS_TILE, (L[q + 2] - N / 2 + 0.5) * g.RTS_TILE, (L[q + 3] - N / 2 + 0.5) * g.RTS_TILE]);
  }
});
function trueDist(x, z) {
  var best = 1e9;
  for (var q = 0; q < segs.length; q++) {
    var s2 = segs[q], vx = s2[2] - s2[0], vz = s2[3] - s2[1], l2 = vx * vx + vz * vz || 1e-9;
    var t2 = Math.max(0, Math.min(1, ((x - s2[0]) * vx + (z - s2[1]) * vz) / l2));
    best = Math.min(best, Math.hypot(x - s2[0] - vx * t2, z - s2[1] - vz * t2));
  }
  return best;
}
function rAt(i, j) { return F.px[(Math.max(0, Math.min(FS - 1, j)) * FS + Math.max(0, Math.min(FS - 1, i))) * 4]; }
var asph = 0, centre = 0, stray = [], worst = 0;
for (var j = 0; j < FS; j++) for (var i2 = 0; i2 < FS; i2++) {
  /* the texel, and the point halfway to the next texel along and down */
  [[0, 0], [0.5, 0], [0, 0.5], [0.5, 0.5]].forEach(function (o) {
    var r = o[0] || o[1] ? (rAt(i2, j) + rAt(i2 + (o[0] ? 1 : 0), j + (o[1] ? 1 : 0)) + (o[0] && o[1] ? rAt(i2 + 1, j) + rAt(i2, j + 1) : 0)) / (o[0] && o[1] ? 4 : 2) : rAt(i2, j);
    var dist = r / 255 * RR;
    if (dist > 3.05) return;
    var wx = (i2 + 0.5 + o[0]) * TX - half, wz = (j + 0.5 + o[1]) * TX - half, td = trueDist(wx, wz);
    if (!o[0] && !o[1]) { asph++; if (dist < 0.5) centre++; }
    worst = Math.max(worst, td);
    if (td > 3.05 + TX) stray.push(Math.round(wx) + ',' + Math.round(wz) + ' (' + td.toFixed(1) + ')');
  });
}
S.ok('the road field paints asphalt along the roads', asph > 1000 && centre > 150, asph + ' asphalt texels, ' + centre + ' on a centre line');
/* on the centre lines - the only place a dash is drawn - some are shared and most are not */
var shared = 0, lone = 0;
for (var k = 0; k < FS * FS; k++) if (F.px[k * 4 + 3] && F.px[k * 4] / 255 * RR < 0.6) { if (F.px[k * 4 + 3] === 128) shared++; else lone++; }
S.ok('where the generator laid two roads down one route the field marks it, so no centre line is drawn there', shared > 20 && lone > shared,
     shared + ' centre-line texels shared, ' + lone + ' a road\'s own');
S.ok('...and nowhere is asphalt, at a texel or between two, further from a road\'s line than the carriageway reaches - no phantom road between two',
     stray.length === 0, stray.length + ' strays, the furthest ' + worst.toFixed(2) + ' units' + (stray.length ? ', e.g. ' + stray.slice(0, 4).join(' ') : ''));

require('../lib/report.js')(S);
