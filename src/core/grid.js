/* RED ALERT - the simulation core. src/core is pure game state + logic; there is no rendering
   anywhere in it. src/render owns every pixel, src/ui owns the DOM. Keeping the sim
   renderer-free means the whole battle can be stepped headlessly (which is how it gets
   verified) - and it is what allowed the renderer to be swapped from three.js to canvas 2D
   without touching a line of it.

   core/grid.js, the first of the twenty: the world grid - tile <-> world maths, passability,
   A*, and the game-state and treasury accessors everything else reads.

   The world is a fixed grid (RTS_N x RTS_N). Structures occupy whole tiles and block
   them; units move continuously and avoid each other with soft separation rather than
   tile reservation, so a traffic jam resolves itself instead of deadlocking. */

window._rtsG = null;

/* What the ground at a tile IS. The sim only cares whether a tile is blocked; this second
   layer tells the renderer what to draw there, and is why the map can read as a forest with
   cliffs and a shoreline rather than an empty field. */
var RTS_T_GRASS = 0, RTS_T_TREE = 1, RTS_T_ROCK = 2, RTS_T_WATER = 3,
    RTS_T_ROAD  = 4, RTS_T_SAND = 5, RTS_T_WALL = 6;
/* Ground[land].Build - which land types ore is allowed to appear on at all. Sand counts;
   roads, water, rock and forest do not. */
var RTS_ORE_GROUND = [true, false, false, false, false, true, false];

/* ------------------------------------------------------------- grid helpers */
function _rtsIdx(tx, tz) { return tz * RTS_N + tx; }
function _rtsInB(tx, tz) { return tx >= 0 && tz >= 0 && tx < RTS_N && tz < RTS_N; }
function _rtsWX(tx) { return (tx - RTS_N / 2 + 0.5) * RTS_TILE; }          /* tile -> world centre */
function _rtsTX(x)  { return Math.floor(x / RTS_TILE + RTS_N / 2); }        /* world -> tile */
/* ------------------------------------------------------------ passability --
   Two domains, and they are near-inverses of each other. A tank is stopped by water; a
   gunboat is stopped by everything that is NOT water. Until there were ships this was one
   global question with one answer, which is why `blocked` is a single byte per cell: 0 open,
   1 a structure, 2 the terrain itself.

   `dom` is 'sea' or absent. Absent means land, so every existing caller keeps its meaning
   without being touched - there are sixteen of them and they are all about land units.

   A structure still blocks a ship: a Naval Yard juts into the water and a boat cannot sail
   through it. That is why the sea test checks `blocked === 1` as well as the terrain. */
function _rtsBlocked(tx, tz, dom) {
  var G = window._rtsG;
  if (!_rtsInB(tx, tz)) return true;
  var i = _rtsIdx(tx, tz);
  if (dom === 'sea') return G.terrain[i] !== RTS_T_WATER || G.blocked[i] === 1;
  return G.blocked[i] !== 0;
}
/* The domain a unit moves in, from its def. Anything not marked `sea` walks. */
function _rtsDomainOf(e) {
  if (!e) return null;
  var d = (e.type === 'unit') ? rtsUnitDef(e.def) : null;
  return (d && d.sea) ? 'sea' : null;
}

/* Deterministic PRNG so a given seed always lays out the same battlefield. */
function _rtsRngMake(seed) {
  var s = (seed || 1) >>> 0;
  /* Scramble and warm up before handing the stream out. A bare xorshift started from a small
     integer returns a tiny first value - seed 1 gives about 0.00006 - so any `(rnd()*n)|0`
     off the first call lands on 0 for every low seed. That is not theoretical: it made all
     24 test maps roll the same start position. */
  s = (Math.imul(s ^ 0x9e3779b9, 2654435761) ^ 0x85ebca6b) >>> 0;
  if (!s) s = 1;
  for (var w = 0; w < 8; w++) { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; }
  var f = function () { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  /* The stream's position has to be readable and settable or a saved game resumes on a
     different roll sequence than the one it was saved from - the whole match diverges from
     the first shot. Accessors rather than a property updated per call: this is the hottest
     function in the simulation and it should stay a closure variable. */
  f.get = function () { return s; };
  f.set = function (v) { s = (v || 1) >>> 0; };
  return f;
}

/* Gameplay randomness runs off the SCENARIO SEED, never off bare Math.random.

   This is not tidiness - it is what makes a balance claim checkable. With Math.random the
   same build run twice gave a mean idle-player survival of 315s and then 502s on easy, and a
   single seed fell at 318s in one run and survived the full ten minutes in the next. Any A/B
   between two builds was measuring the generator, not the change. Seeded, a seed replays
   exactly and a comparison is a comparison.

   Three independent streams off the same seed, so that consuming a number in one cannot
   shift another: the map generator (raw seed), ore growth (^0x5eed), and this, the gameplay
   stream (^0x9e3779b9) - attack intervals, team choice, scatter, survivors, accuracy. */
function _rtsRnd() {
  var G = window._rtsG;
  if (!G) return Math.random();
  if (!G.rnd) G.rnd = _rtsRngMake((G.seed ^ 0x9e3779b9) >>> 0);
  return G.rnd();
}

/* --------------------------------------------------------------------- A* --
   8-way octile A* over the blocked grid. Diagonals are refused when they would cut
   a blocked corner, so units never clip through a building corner. Returns an array
   of world-space waypoints, string-pulled so the path reads as straight runs rather
   than a staircase. */
var _rtsPF = null;
function _rtsPathfindInit() {
  var n = RTS_N * RTS_N;
  _rtsPF = { g:new Float32Array(n), f:new Float32Array(n), came:new Int32Array(n), state:new Uint8Array(n), stamp:new Int32Array(n), run:0, heap:new Int32Array(n + 1), hn:0 };
}
function _rtsHeapPush(i) {
  var P = _rtsPF, h = P.heap, k = ++P.hn; h[k] = i;
  while (k > 1) { var p = k >> 1; if (P.f[h[p]] <= P.f[h[k]]) break; var t = h[p]; h[p] = h[k]; h[k] = t; k = p; }
}
function _rtsHeapPop() {
  var P = _rtsPF, h = P.heap, top = h[1]; h[1] = h[P.hn--]; var k = 1;
  for (;;) { var l = k << 1, r = l + 1, m = k;
    if (l <= P.hn && P.f[h[l]] < P.f[h[m]]) m = l;
    if (r <= P.hn && P.f[h[r]] < P.f[h[m]]) m = r;
    if (m === k) break; var t = h[m]; h[m] = h[k]; h[k] = t; k = m; }
  return top;
}
/* Nearest tile that is not blocked, searched as expanding rings. */
function _rtsNearestOpen(tx, tz, maxR, dom) {
  if (!_rtsBlocked(tx, tz, dom)) return [tx, tz];
  for (var r = 1; r <= (maxR || 8); r++) {
    var best = null, bd = 1e9;
    for (var ox = -r; ox <= r; ox++) for (var oz = -r; oz <= r; oz++) {
      if (Math.max(Math.abs(ox), Math.abs(oz)) !== r) continue;
      var cx = tx + ox, cz = tz + oz;
      if (_rtsBlocked(cx, cz, dom)) continue;
      var d = ox * ox + oz * oz;
      if (d < bd) { bd = d; best = [cx, cz]; }
    }
    if (best) return best;
  }
  return null;
}
function _rtsPath(sx, sz, gx, gz, dom) {
  if (!_rtsPF) _rtsPathfindInit();
  var P = _rtsPF, run = ++P.run;
  var stx = _rtsTX(sx), stz = _rtsTX(sz), gtx = _rtsTX(gx), gtz = _rtsTX(gz);
  if (!_rtsInB(stx, stz)) return null;
  /* A unit can legitimately be standing on a blocked tile - it spawned inside its own
     factory's footprint, or a building went up over it. A* from a blocked start dead-ends
     immediately (every neighbour is inside the same footprint), which used to strand the
     unit permanently. Step it out to the nearest open tile first, then path from there. */
  if (_rtsBlocked(stx, stz, dom)) {
    var esc = _rtsNearestOpen(stx, stz, 10, dom);
    if (!esc) return null;
    var ex = _rtsWX(esc[0]), ez = _rtsWX(esc[1]);
    var rest = _rtsPath(ex, ez, gx, gz, dom);
    return [{ x:ex, z:ez }].concat(rest || []);
  }
  /* If the goal tile is blocked (ordered onto a building), walk outwards to the nearest
     open tile so "attack that refinery" still produces a path that arrives beside it. */
  if (!_rtsInB(gtx, gtz) || _rtsBlocked(gtx, gtz, dom)) {
    var best = null, bd = 1e9;
    for (var rr = 1; rr <= 6 && !best; rr++) {
      for (var ox = -rr; ox <= rr; ox++) for (var oz = -rr; oz <= rr; oz++) {
        if (Math.max(Math.abs(ox), Math.abs(oz)) !== rr) continue;
        var cx = gtx + ox, cz = gtz + oz; if (_rtsBlocked(cx, cz, dom)) continue;
        var d = (cx - gtx) * (cx - gtx) + (cz - gtz) * (cz - gtz);
        if (d < bd) { bd = d; best = [cx, cz]; }
      }
    }
    if (!best) return null;
    gtx = best[0]; gtz = best[1];
  }
  var start = _rtsIdx(stx, stz), goal = _rtsIdx(gtx, gtz);
  if (start === goal) return [{ x:gx, z:gz }];
  P.hn = 0;
  function H(i) { var ax = Math.abs((i % RTS_N) - gtx), az = Math.abs(((i / RTS_N) | 0) - gtz);
    return (ax > az) ? (ax - az) + 1.41421 * az : (az - ax) + 1.41421 * ax; }
  P.g[start] = 0; P.f[start] = H(start); P.stamp[start] = run; P.state[start] = 1; _rtsHeapPush(start);
  var found = false, guard = 0;
  while (P.hn > 0 && guard++ < 60000) {
    var cur = _rtsHeapPop();
    if (P.state[cur] === 2) continue;
    P.state[cur] = 2;
    if (cur === goal) { found = true; break; }
    var cx2 = cur % RTS_N, cz2 = (cur / RTS_N) | 0;
    for (var dx = -1; dx <= 1; dx++) for (var dz = -1; dz <= 1; dz++) {
      if (!dx && !dz) continue;
      var nx = cx2 + dx, nz = cz2 + dz;
      if (_rtsBlocked(nx, nz, dom)) continue;
      if (dx && dz && (_rtsBlocked(cx2 + dx, cz2, dom) ||
                       _rtsBlocked(cx2, cz2 + dz, dom))) continue;   /* no corner cutting */
      var ni = _rtsIdx(nx, nz);
      if (P.stamp[ni] === run && P.state[ni] === 2) continue;
      var ng = P.g[cur] + ((dx && dz) ? 1.41421 : 1);
      if (P.stamp[ni] !== run) { P.stamp[ni] = run; P.state[ni] = 0; P.g[ni] = 1e9; }
      if (ng < P.g[ni]) { P.g[ni] = ng; P.f[ni] = ng + H(ni); P.came[ni] = cur; P.state[ni] = 1; _rtsHeapPush(ni); }
    }
  }
  if (!found) return null;
  var tiles = [], c = goal, safety = 0;
  while (c !== start && safety++ < 20000) { tiles.push(c); c = P.came[c]; }
  tiles.reverse();
  /* string-pull: drop a waypoint whenever the line to the next-but-one is clear */
  var pts = [];
  for (var i = 0; i < tiles.length; i++) pts.push({ x:_rtsWX(tiles[i] % RTS_N), z:_rtsWX((tiles[i] / RTS_N) | 0) });
  if (pts.length) { pts[pts.length - 1] = { x:gx, z:gz }; }
  var out = [], px = sx, pz = sz, j = 0;
  while (j < pts.length) {
    var far = j;
    for (var k = pts.length - 1; k > j; k--) { if (_rtsClearLine(px, pz, pts[k].x, pts[k].z)) { far = k; break; } }
    out.push(pts[far]); px = pts[far].x; pz = pts[far].z; j = far + 1;
  }
  return out;
}
/* SUPERCOVER, NOT A SAMPLER. This walks every cell the segment actually touches. It used to
   sample the segment every 0.4 of a tile, which is a different thing, and one that quietly lies.

   A segment can cross the CORNER of a blocked cell and spend less than 0.4 tiles inside it, so
   both neighbouring samples land outside and the line is certified clear. The string-puller then
   collapses the route to one straight waypoint through that corner - and _rtsSteer, which tests
   each step against the same grid, can never traverse it. The unit stops dead and stays stopped.
   Measured on seed 42: the free Harvester wedged at t=8s and was at the same position to three
   decimals at t=240, zero deliveries, its side's credits never leaving 1000 while 189,397 ore
   sat on the map. About 7 in 7500 obstacle-adjacent orders - rare, and permanent.

   Amanatides & Woo's grid traversal, in world units. The one addition is the exact-corner case:
   when the next x boundary and the next z boundary fall at the same t the segment passes through
   a lattice point, and a diagonal slip between two blocked shoulders is not a route anything can
   walk - so both shoulders have to be open for the line to count as clear. */
function _rtsClearLine(x0, z0, x1, z1, dom) {
  var tx = _rtsTX(x0), tz = _rtsTX(z0);
  if (_rtsBlocked(tx, tz, dom)) return false;
  var tx1 = _rtsTX(x1), tz1 = _rtsTX(z1);
  if (tx === tx1 && tz === tz1) return true;

  var dx = x1 - x0, dz = z1 - z0;
  var sx = dx > 0 ? 1 : (dx < 0 ? -1 : 0);
  var sz = dz > 0 ? 1 : (dz < 0 ? -1 : 0);
  /* the world coordinate of tile boundary `t` - the inverse of _rtsTX */
  var half = RTS_N / 2;
  var tMaxX = sx ? ((tx + (sx > 0 ? 1 : 0) - half) * RTS_TILE - x0) / dx : Infinity;
  var tMaxZ = sz ? ((tz + (sz > 0 ? 1 : 0) - half) * RTS_TILE - z0) / dz : Infinity;
  var tDX = sx ? Math.abs(RTS_TILE / dx) : Infinity;
  var tDZ = sz ? Math.abs(RTS_TILE / dz) : Infinity;

  for (var guard = 0; guard < 4096; guard++) {
    if (tx === tx1 && tz === tz1) return true;
    if (tMaxX > 1 && tMaxZ > 1) return true;              /* past the far end */
    if (Math.abs(tMaxX - tMaxZ) < 1e-9) {
      /* straight through the corner: the two cells it slips between must BOTH be open */
      if (_rtsBlocked(tx + sx, tz, dom) || _rtsBlocked(tx, tz + sz, dom)) return false;
      tx += sx; tz += sz; tMaxX += tDX; tMaxZ += tDZ;
    } else if (tMaxX < tMaxZ) { tx += sx; tMaxX += tDX; }
    else { tz += sz; tMaxZ += tDZ; }
    if (_rtsBlocked(tx, tz, dom)) return false;
  }
  return false;                                            /* absurdly long: refuse to certify */
}

/* ------------------------------------------------------------------ state */
function _rtsSideNew(key) {
  return { key:key, credits:RTS_START_CREDITS, ore:0, powerMade:0, powerUsed:0,
    q:{ struct:null, infantry:null, vehicle:null },   /* one build line per category, like the classic sidebar */
    ready:null, readyTry:0,                            /* finished structure awaiting placement */
    spill:0, spillSaid:0,                              /* scrap lost to a full store, and the warning cooldown */
    /* superweapon charge, keyed by super key. Held on the SIDE rather than on the building so
       that selling the silo and rebuilding it does not hand you a fresh missile - the charge
       belongs to the house, which is also how the original's SuperClass works. */
    supers:{},
    lost:false };
}
/* --------------------------------------------------------------- the treasury --
   HOUSE.CPP keeps TWO pools, not one, and BDATA.CPP's `Capacity` is the reason:

     Credits  - money you were GIVEN. Starting cash, a sale, a cancelled order, a thief's
                haul. Uncapped: nothing physical is holding it.
     Tiberium - harvested ore SITTING IN YOUR BUILDINGS. Capped by the sum of every
                structure's Storage, and a harvester that unloads above that cap loses the
                difference on the dock.

   Available_Money() is the sum of the two and is what everything asks about; Spend_Money()
   drains the stored ore first, so the cap keeps biting until you have actually spent down.
   Keeping them as one number would make the cap meaningless: you would start the match
   already over capacity and never earn a credit.

   Call rtsMoney() to ask, _rtsSpend/_rtsGrant/_rtsHarvested to change. Assigning to
   `S.credits` directly still works and still means "given money", but it will not be capped
   and will not warn - which is right for a refund and wrong for income. */
function rtsMoney(S) { return S.credits + S.ore; }
/* Sum of Storage over this side's finished, living structures. Rebuilt on demand rather than
   cached: a capacity that goes stale when a silo is shot is a capacity that silently keeps
   accepting scrap into a building that is no longer there. */
function rtsCapacity(side) {
  var G = window._rtsG, cap = 0;
  for (var i = 0; i < G.ents.length; i++) {
    var e = G.ents[i];
    if (e.dead || e.type !== 'struct' || e.side !== side || e.building) continue;
    var d = rtsStructDef(e.def);
    if (d && d.storage) cap += d.storage;
  }
  return cap;
}
/* The original nags you about this once and then shuts up for a while - a message that fires
   on every unload tick would be the only thing on screen. */
var RTS_SILO_WARN_DELAY = 25;
function _rtsSiloWarn(S) {
  var G = window._rtsG;
  if (S.spillSaid && G.t - S.spillSaid < RTS_SILO_WARN_DELAY) return;
  S.spillSaid = G.t || 0.0001;
  _rtsSay('Silos needed - scrap is being lost.');
  if (typeof _rtsSfx === 'function') _rtsSfx('deny');
}
function _rtsSpend(S, n) {
  if (n <= 0) return 0;
  var paid = Math.min(n, rtsMoney(S));
  if (S.ore >= paid) { S.ore -= paid; }
  else { var rest = paid - S.ore; S.ore = 0; S.credits -= rest; }
  return paid;
}
/* Money handed over rather than mined: never capped, never spilled. */
function _rtsGrant(S, n) { if (n > 0) S.credits += n; }
/* Harvested_Money: into the store, clamped, and the remainder is gone. Returns what was lost
   so the caller can complain about it. */
function _rtsHarvested(S, n) {
  if (n <= 0) return 0;
  var cap = rtsCapacity(S.key), room = Math.max(0, cap - S.ore);
  var kept = Math.min(n, room);
  S.ore += kept;
  var lost = n - kept;
  if (lost > 0) S.spill += lost;
  return lost;
}
