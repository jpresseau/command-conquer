/* RC COMMAND - simulation core. Pure game state + logic; no rendering in this file.
   rts.render.js owns every pixel, rts.ui.js owns the DOM. Keeping the sim renderer-free
   means the whole battle can be stepped headlessly (which is how it gets verified) - and it
   is what allowed the renderer to be swapped from three.js to canvas 2D without touching a
   line of this file.

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
function _rtsBlocked(tx, tz) { var G = window._rtsG; return !_rtsInB(tx, tz) || G.blocked[_rtsIdx(tx, tz)] !== 0; }

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
function _rtsNearestOpen(tx, tz, maxR) {
  if (!_rtsBlocked(tx, tz)) return [tx, tz];
  for (var r = 1; r <= (maxR || 8); r++) {
    var best = null, bd = 1e9;
    for (var ox = -r; ox <= r; ox++) for (var oz = -r; oz <= r; oz++) {
      if (Math.max(Math.abs(ox), Math.abs(oz)) !== r) continue;
      var cx = tx + ox, cz = tz + oz;
      if (_rtsBlocked(cx, cz)) continue;
      var d = ox * ox + oz * oz;
      if (d < bd) { bd = d; best = [cx, cz]; }
    }
    if (best) return best;
  }
  return null;
}
function _rtsPath(sx, sz, gx, gz) {
  if (!_rtsPF) _rtsPathfindInit();
  var P = _rtsPF, run = ++P.run;
  var stx = _rtsTX(sx), stz = _rtsTX(sz), gtx = _rtsTX(gx), gtz = _rtsTX(gz);
  if (!_rtsInB(stx, stz)) return null;
  /* A unit can legitimately be standing on a blocked tile - it spawned inside its own
     factory's footprint, or a building went up over it. A* from a blocked start dead-ends
     immediately (every neighbour is inside the same footprint), which used to strand the
     unit permanently. Step it out to the nearest open tile first, then path from there. */
  if (_rtsBlocked(stx, stz)) {
    var esc = _rtsNearestOpen(stx, stz, 10);
    if (!esc) return null;
    var ex = _rtsWX(esc[0]), ez = _rtsWX(esc[1]);
    var rest = _rtsPath(ex, ez, gx, gz);
    return [{ x:ex, z:ez }].concat(rest || []);
  }
  /* If the goal tile is blocked (ordered onto a building), walk outwards to the nearest
     open tile so "attack that refinery" still produces a path that arrives beside it. */
  if (!_rtsInB(gtx, gtz) || _rtsBlocked(gtx, gtz)) {
    var best = null, bd = 1e9;
    for (var rr = 1; rr <= 6 && !best; rr++) {
      for (var ox = -rr; ox <= rr; ox++) for (var oz = -rr; oz <= rr; oz++) {
        if (Math.max(Math.abs(ox), Math.abs(oz)) !== rr) continue;
        var cx = gtx + ox, cz = gtz + oz; if (_rtsBlocked(cx, cz)) continue;
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
      if (_rtsBlocked(nx, nz)) continue;
      if (dx && dz && (_rtsBlocked(cx2 + dx, cz2) || _rtsBlocked(cx2, cz2 + dz))) continue; /* no corner cutting */
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
/* Bresenham-ish sample along the segment; true when no blocked tile is crossed. */
function _rtsClearLine(x0, z0, x1, z1) {
  var d = Math.hypot(x1 - x0, z1 - z0), steps = Math.ceil(d / (RTS_TILE * 0.4));
  if (steps <= 0) return true;
  for (var i = 0; i <= steps; i++) {
    var t = i / steps;
    if (_rtsBlocked(_rtsTX(x0 + (x1 - x0) * t), _rtsTX(z0 + (z1 - z0) * t))) return false;
  }
  return true;
}

/* ------------------------------------------------------------------ state */
function _rtsSideNew(key) {
  return { key:key, credits:RTS_START_CREDITS, ore:0, powerMade:0, powerUsed:0,
    q:{ struct:null, infantry:null, vehicle:null },   /* one build line per category, like the classic sidebar */
    ready:null, readyTry:0,                            /* finished structure awaiting placement */
    spill:0, spillSaid:0,                              /* scrap lost to a full store, and the warning cooldown */
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
/* ------------------------------------------------------------------ terrain --
   An earlier map was 62 random 1-3 tile rock rectangles on otherwise empty ground, and it
   looked like a field with gravel on it. The games this is modelled on put a *landscape*
   under the battle: dense conifer forest, rock ridges, a shoreline, and dirt roads cutting
   through it all. That is what this builds.

   Everything here is clustered noise rather than scattered singles - a grove of twenty
   trees reads as forest, twenty lone trees read as litter. Roads are carved LAST and are
   what guarantees the two bases can still reach each other; see _rtsCarveRoad. */
function _rtsGenTerrain(G, rnd, starts) {
  var N = RTS_N, i, tx, tz;
  var seed = G.seed | 0;
  function nz(x, y, sc, s) {                       /* smooth value noise, tile units */
    var fx = x / sc, fy = y / sc, x0 = Math.floor(fx), y0 = Math.floor(fy);
    var ax = fx - x0, ay = fy - y0;
    ax = ax * ax * (3 - 2 * ax); ay = ay * ay * (3 - 2 * ay);
    function h(a, b) {
      var v = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(s | 0, 1442695041);
      v = Math.imul(v ^ (v >>> 13), 1274126177); v ^= v >>> 16;
      return (v >>> 0) / 4294967296;
    }
    var p = h(x0, y0), q = h(x0 + 1, y0), r = h(x0, y0 + 1), t = h(x0 + 1, y0 + 1);
    return (p + (q - p) * ax) * (1 - ay) + (r + (t - r) * ax) * ay;
  }
  /* Base areas and ore stay clear of everything. */
  function nearBase(x, z) {
    return Math.hypot(x - 20, z - 90) < 17 || Math.hypot(x - 92, z - 22) < 17;
  }
  function free(x, z) {
    return _rtsInB(x, z) && G.scrap[_rtsIdx(x, z)] <= 0 && !nearBase(x, z);
  }
  function set(x, z, terr, block) {
    var k = _rtsIdx(x, z);
    G.terrain[k] = terr;
    G.blocked[k] = block ? 2 : 0;
  }

  /* --- water: one lake, pushed into a corner away from both starts --- */
  var lx = 88, lz = 88, lr = 13;
  for (tx = lx - lr - 4; tx <= lx + lr + 4; tx++) {
    for (tz = lz - lr - 4; tz <= lz + lr + 4; tz++) {
      if (!free(tx, tz)) continue;
      var wob = nz(tx, tz, 9, seed + 3) * 7 - 3.5;
      var dd = Math.hypot(tx - lx, tz - lz) + wob;
      if (dd < lr) set(tx, tz, RTS_T_WATER, true);
      else if (dd < lr + 2.2) set(tx, tz, RTS_T_SAND, false);   /* beach */
    }
  }

  /* --- rock ridges: high-contrast bands of a low-frequency noise field, which gives
         long connected walls rather than the confetti a per-tile threshold produces --- */
  for (tx = 0; tx < N; tx++) {
    for (tz = 0; tz < N; tz++) {
      if (!free(tx, tz) || G.terrain[_rtsIdx(tx, tz)] !== RTS_T_GRASS) continue;
      /* A narrow band either side of a noise contour gives long thin walls. Widening this
         even slightly turns the ridges into one huge mesa, because the field is smooth and
         the region near the contour grows fast. */
      var ridge = Math.abs(nz(tx, tz, 19, seed + 11) - 0.5);
      if (ridge < 0.016 && nz(tx, tz, 6, seed + 13) > 0.42) set(tx, tz, RTS_T_ROCK, true);
    }
  }

  /* --- forest: groves where a low-frequency mask is high, thinned by a high-frequency
         one so a grove has gaps in it and units can thread through --- */
  for (tx = 0; tx < N; tx++) {
    for (tz = 0; tz < N; tz++) {
      if (!free(tx, tz) || G.terrain[_rtsIdx(tx, tz)] !== RTS_T_GRASS) continue;
      var grove = nz(tx, tz, 17, seed + 21);
      var thin = nz(tx, tz, 3.1, seed + 23);
      if (grove > 0.55 && thin > 0.38) set(tx, tz, RTS_T_TREE, true);
      else if (grove > 0.46 && thin > 0.76) set(tx, tz, RTS_T_TREE, true);   /* stragglers */
    }
  }

  /* --- roads. Carved last, straight through whatever is in the way, so they double as
         the guarantee that the map stays connected: every road links the two start
         corners, so a unit can always get from one base to the other. --- */
  /* Clear a build area at each start FIRST. Terrain is generated before the bases are placed,
     so a start can land inside a forest or a lake; the base then gets scan-placed as much as
     32 rings away while the roads still meet at the original point, and the map comes apart -
     one seed in twenty-four had a player base with no route to anything, ore included. */
  function _clearStart(b) {
    for (var ox = -5; ox <= 5; ox++) for (var oz = -5; oz <= 5; oz++) {
      if (ox * ox + oz * oz > 30) continue;
      var cx = b.tx + ox, cz = b.tz + oz;
      if (!_rtsInB(cx, cz)) continue;
      var ci = _rtsIdx(cx, cz);
      if (G.blocked[ci] === 1) continue;               /* never bulldoze a structure */
      G.blocked[ci] = 0;
      if (G.terrain[ci] !== RTS_T_ROAD) G.terrain[ci] = RTS_T_GRASS;
    }
  }

  /* Every road still links the two STARTS, which is what guarantees the map stays passable -
     they are just no longer two fixed corners. The branches are expressed in the same local
     frame as the bases so they fan out sideways from the main route whatever axis it runs on. */
  var _sp = starts.player, _se = starts.enemy;
  var _dx = _se.tx - _sp.tx, _dz = _se.tz - _sp.tz, _L = Math.hypot(_dx, _dz) || 1;
  var _ux = _dx / _L, _uz = _dz / _L, _px = -_uz, _pz = _ux;
  function _off(b, along, across) {
    return [Math.max(2, Math.min(N - 3, Math.round(b.tx + _ux * along + _px * across))),
            Math.max(2, Math.min(N - 3, Math.round(b.tz + _uz * along + _pz * across)))];
  }
  _clearStart(_sp); _clearStart(_se);
  var _b1 = _off(_sp, _L * 0.55,  30), _b2 = _off(_se, -_L * 0.55, -30);
  _rtsCarveRoad(G, _sp.tx, _sp.tz, _se.tx, _se.tz, rnd);      /* the main route, base to base */
  _rtsCarveRoad(G, _sp.tx, _sp.tz, _b1[0], _b1[1], rnd);      /* one branch out to each flank */
  _rtsCarveRoad(G, _se.tx, _se.tz, _b2[0], _b2[1], rnd);

  /* --- sandbag emplacements. Short dog-legged chains of old fortification, left over from
         whoever fought here last. They are scattered all over the reference material and are
         most of why those maps read as contested ground rather than open country. Blocking,
         but short enough to go around. --- */
  for (var wc = 0; wc < 70; wc++) {
    var wx = 8 + ((rnd() * (N - 16)) | 0), wz = 8 + ((rnd() * (N - 16)) | 0);
    if (!free(wx, wz) || G.terrain[_rtsIdx(wx, wz)] !== RTS_T_GRASS) continue;
    var dir = (rnd() * 4) | 0, len = 4 + ((rnd() * 6) | 0);
    var DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
    for (var ws = 0; ws < len; ws++) {
      if (ws === (len >> 1)) dir = (dir + (rnd() < 0.5 ? 1 : 3)) % 4;   /* one dog-leg */
      if (!free(wx, wz) || G.terrain[_rtsIdx(wx, wz)] !== RTS_T_GRASS) break;
      set(wx, wz, RTS_T_WALL, true);
      wx += DIRS[dir][0]; wz += DIRS[dir][1];
    }
  }

  /* --- connectivity guarantee for ore ---
     Roads link the two bases, but a forest can still ring an ore field completely and leave
     it unharvestable. Roughly one map in three did. Flood fill from the player start and
     carve a track out to any ore that the fill could not reach. --- */
  var reach = new Uint8Array(N * N), stack = [_rtsIdx(_sp.tx, _sp.tz)];
  reach[stack[0]] = 1;
  while (stack.length) {
    var ci = stack.pop(), cxr = ci % N, czr = (ci / N) | 0;
    for (var dq = 0; dq < 4; dq++) {
      var nxr = cxr + [1, -1, 0, 0][dq], nzr = czr + [0, 0, 1, -1][dq];
      if (!_rtsInB(nxr, nzr)) continue;
      var nir = _rtsIdx(nxr, nzr);
      if (reach[nir] || G.blocked[nir] === 2) continue;
      reach[nir] = 1; stack.push(nir);
    }
  }
  for (tx = 0; tx < N; tx++) {
    for (tz = 0; tz < N; tz++) {
      i = _rtsIdx(tx, tz);
      if (G.scrap[i] <= 0 || reach[i]) continue;
      _rtsCarveRoad(G, tx, tz, _sp.tx, _sp.tz, rnd, true);   /* cut through to the player start */
      /* One carve reconnects the whole blob, so re-run the fill rather than carving per tile. */
      reach.fill(0); stack = [_rtsIdx(_sp.tx, _sp.tz)]; reach[stack[0]] = 1;
      while (stack.length) {
        var c2 = stack.pop(), cx2r = c2 % N, cz2r = (c2 / N) | 0;
        for (var d2 = 0; d2 < 4; d2++) {
          var nx2 = cx2r + [1, -1, 0, 0][d2], nz2 = cz2r + [0, 0, 1, -1][d2];
          if (!_rtsInB(nx2, nz2)) continue;
          var ni2 = _rtsIdx(nx2, nz2);
          if (reach[ni2] || G.blocked[ni2] === 2) continue;
          reach[ni2] = 1; stack.push(ni2);
        }
      }
    }
  }

  /* Trees never grow right up against ore, so a field has a little clearing around it. */
  for (tx = 1; tx < N - 1; tx++) {
    for (tz = 1; tz < N - 1; tz++) {
      i = _rtsIdx(tx, tz);
      if (G.terrain[i] !== RTS_T_TREE) continue;
      if (G.scrap[_rtsIdx(tx + 1, tz)] > 0 || G.scrap[_rtsIdx(tx - 1, tz)] > 0 ||
          G.scrap[_rtsIdx(tx, tz + 1)] > 0 || G.scrap[_rtsIdx(tx, tz - 1)] > 0) {
        G.terrain[i] = RTS_T_GRASS; G.blocked[i] = 0;
      }
    }
  }
}

/* A wandering 3-tile-wide track between two points. Clears obstacles as it goes. */
function _rtsCarveRoad(G, x0, z0, x1, z1, rnd, force) {
  var steps = Math.ceil(Math.hypot(x1 - x0, z1 - z0)) * 2;
  var sway = force ? 0 : (rnd() - 0.5) * 26;
  for (var s = 0; s <= steps; s++) {
    var t = s / steps;
    /* a sine bulge perpendicular to the line, so roads bend instead of ruling a diagonal */
    var px = x0 + (x1 - x0) * t, pz = z0 + (z1 - z0) * t;
    var dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz) || 1;
    var off = Math.sin(t * Math.PI) * sway;
    px += (-dz / L) * off; pz += (dx / L) * off;
    /* Two tiles wide. Three read as a runway rather than a track. */
    for (var ox = 0; ox <= 1; ox++) {
      for (var oz = 0; oz <= 1; oz++) {
        var tx = Math.round(px) + ox, tz = Math.round(pz) + oz;
        if (!_rtsInB(tx, tz)) continue;
        var i = _rtsIdx(tx, tz);
        if (G.scrap[i] > 0) continue;
        /* Normally a road stops at the shore. The connectivity pass passes force, and then
           it lays a causeway instead - an ore field on an island is unharvestable, and the
           lake is generated after the ore, so islands do happen. */
        if (G.terrain[i] === RTS_T_WATER && !force) continue;
        if (G.blocked[i] === 1) continue;                 /* never bulldoze a structure */
        G.blocked[i] = 0;
        G.terrain[i] = RTS_T_ROAD;
      }
    }
  }
}


/* ------------------------------------------------ start positions (SCENARIO.CPP) --
   Create_Units picks the first house's start AT RANDOM from the waypoint list, then gives
   every later house the waypoint with the highest SUM OF DISTANCES to all already-taken
   starts - "the waypoint with the largest score is the one that is furthest from all other
   taken waypoints". For two houses that means: roll the axis, then take the far end of it.

   In RA the candidate list is authored per scenario. This map is generated, so the candidates
   are a ring inset from the edge; the roll therefore chooses which diagonal the match is
   fought along, and the whole map - ore, roads, connectivity, waypoints - follows from it
   instead of being pinned to one corner every game. */
function _rtsStartCandidates() {
  var c = [], n = 8, R = RTS_N * 0.36, mid = RTS_N / 2;
  for (var i = 0; i < n; i++) {
    var a = (i / n) * Math.PI * 2;
    c.push({ tx:Math.round(mid + Math.cos(a) * R), tz:Math.round(mid + Math.sin(a) * R) });
  }
  return c;
}
function _rtsPickStarts(rnd) {
  var cand = _rtsStartCandidates(), taken = [], i, j;
  /* "int pick = Random_Pick(0, num_waypts-1)" - the first is simply chosen. */
  taken.push(cand.splice((rnd() * cand.length) | 0, 1)[0]);
  /* ...every later one maximises the summed distance to those already taken. */
  while (taken.length < 2) {
    var best = 0, bestScore = -1;
    for (i = 0; i < cand.length; i++) {
      var score = 0;
      for (j = 0; j < taken.length; j++) score += Math.hypot(cand[i].tx - taken[j].tx, cand[i].tz - taken[j].tz);
      if (score > bestScore) { bestScore = score; best = i; }
    }
    taken.push(cand.splice(best, 1)[0]);
  }
  return { player:taken[0], enemy:taken[1] };
}
/* The ore layout is expressed RELATIVE to the two starts rather than as fixed cells: a home
   field beside each base, matched pairs out along the line between them, and the gems in
   contested ground at the midpoint. Mirroring it about the midpoint is what keeps the map
   fair whichever axis the roll produced. */
function _rtsOreFields(S) {
  var p = S.player, e = S.enemy;
  var mx = (p.tx + e.tx) / 2, mz = (p.tz + e.tz) / 2;
  var dx = e.tx - p.tx, dz = e.tz - p.tz, L = Math.hypot(dx, dz) || 1;
  var ux = dx / L, uz = dz / L, px = -uz, pz = ux;
  function at(base, along, across, rad, gem) {
    return [Math.round(base.tx + ux * along + px * across),
            Math.round(base.tz + uz * along + pz * across), rad, gem];
  }
  return [
    /* home fields: close enough to mine from the start, offset so they are not underfoot */
    at(p,  9,  -7, 7, 0), at(e, -9,   7, 7, 0),
    /* a second field each, on the other flank, to give the base two directions to work */
    at(p, 14,  10, 5, 0), at(e, -14, -10, 5, 0),
    /* the big contested field in the middle */
    [Math.round(mx), Math.round(mz), 10, 0],
    /* matched mid-field pairs either side of the centre line */
    at(p, L * 0.42,  18, 6, 0), at(e, -L * 0.42, -18, 6, 0),
    /* gems: small, unmirrored pair straddling the midpoint, in the most contested ground */
    [Math.round(mx + px * 14), Math.round(mz + pz * 14), 3, 1],
    [Math.round(mx - px * 14), Math.round(mz - pz * 14), 3, 1]
  ];
}


/* Scan_Place_Object: "loop through distances from the given center cell; skip the center
   cell. For each distance, try placing the object along each rotational direction; if none
   are available, try each direction with a random scatter value." The second pass exists
   because otherwise everything lines up along eight spokes out of the centre.

   Returns the cell used, or null if 32 rings found nothing. */
var _RTS_FACING8 = [[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1]];
function _rtsScanPlace(tx, tz, fits, rnd) {
  if (fits(tx, tz)) return { tx:tx, tz:tz };
  for (var dist = 1; dist < 32; dist++) {
    var rot = ((rnd ? rnd() : 0) * 8) | 0;                 /* "Pick a random starting direction" */
    for (var tryval = 0; tryval < 2; tryval++) {
      for (var f = 0; f < 8; f++) {
        var d = _RTS_FACING8[(rot + f) % 8];
        var cx = tx + d[0] * dist, cz = tz + d[1] * dist;
        if (tryval > 0 && rnd) {                            /* Clip_Scatter, second pass only */
          cx += ((rnd() * 3) | 0) - 1; cz += ((rnd() * 3) | 0) - 1;
        }
        if (cx === tx && cz === tz) continue;
        if (fits(cx, cz)) return { tx:cx, tz:cz };
      }
    }
  }
  return null;
}
/* Lay out a base in its own local frame: `along` points at the opponent, `across` to the
   side. The same table then produces the same arrangement whichever axis the start roll
   picked, instead of the layout only making sense on one diagonal. */
function _rtsLayBase(start, foe, list, side) {
  var G = window._rtsG;
  var dx = foe.tx - start.tx, dz = foe.tz - start.tz, L = Math.hypot(dx, dz) || 1;
  var ux = dx / L, uz = dz / L, px = -uz, pz = ux;
  for (var i = 0; i < list.length; i++) {
    var kind = list[i][0], key = list[i][1], along = list[i][2], across = list[i][3];
    var tx = Math.round(start.tx + ux * along + px * across);
    var tz = Math.round(start.tz + uz * along + pz * across);
    if (kind === 'unit') {
      var open = _rtsScanPlace(tx, tz, function (x, z) { return _rtsInB(x, z) && !_rtsBlocked(x, z); }, _rtsRnd);
      if (open) _rtsSpawnUnit(side, key, _rtsWX(open.tx), _rtsWX(open.tz));
      continue;
    }
    var d = rtsStructDef(key);
    var spot = _rtsScanPlace(tx, tz, function (x, z) {
      for (var ox = 0; ox < d.w; ox++) for (var oz = 0; oz < d.h; oz++) {
        if (!_rtsInB(x + ox, z + oz) || _rtsBlocked(x + ox, z + oz)) return false;
      }
      return true;
    }, _rtsRnd);
    if (spot) _rtsPlaceStruct(side, key, spot.tx, spot.tz, true);
  }
}

/* ------------------------------------------------------------- BASE.CPP: the base blueprint

   A base in the originals is not "n refineries and m turrets somewhere near the yard" - it is
   an ORDERED LIST OF NODES, each one a (building type, cell) pair. `Get_Building` looks at the
   node's cell and returns the building only if a building OF THAT TYPE is standing exactly
   there; `Is_Built` is that test as a bool; `Next_Buildable` walks the list in order and hands
   back the first HOLE, optionally filtered to a type. Order is priority, and the cell is part
   of the plan rather than something to work out later.

   The consequence that matters is rebuilding. Blow up an enemy refinery and the node it
   occupied becomes a hole; the next refinery the AI builds goes back in that hole - the same
   cell it was lost from. The base repairs to its plan instead of being reshaped by whatever
   was destroyed.

   The adaptation: RA reads its nodes from the scenario INI, where a designer placed them.
   There are no scenario files here, so the blueprint is SEEDED from the opening layout
   `_rtsLayBase` produces and GROWN by recording every position the AI scan-places into. So the
   first raid is repaired against the designed opening, and later expansion becomes part of the
   plan the moment it is built. */
function _rtsBaseAdd(side, key, tx, tz) {
  var G = window._rtsG;
  if (!G.base) G.base = {};
  if (!G.base[side]) G.base[side] = [];
  G.base[side].push({ key:key, tx:tx, tz:tz });
}
/* Get_Building: type AND cell must both match, which is what makes a node a plan rather than
   a hint. A power plant sitting where the refinery node is does not fill that node. */
function _rtsBaseGetBuilding(side, node) {
  var G = window._rtsG;
  for (var i = 0; i < G.ents.length; i++) {
    var e = G.ents[i];
    if (e.dead || e.selling || e.type !== 'struct' || e.side !== side) continue;
    if (e.def === node.key && e.tx === node.tx && e.tz === node.tz) return e;
  }
  return null;
}
/* Next_Buildable: the first hole, in list order. A null type means "any hole".

   One addition to the original: a hole whose cell can no longer be built on is skipped rather
   than returned. RA checks placement separately; doing it inside the walk matters here because
   returning only the FIRST hole means one permanently blocked node - the player walled over it,
   ore crept in - would shadow every later hole of the same type and the plan would stop
   repairing itself from that point on. A hole you cannot build in is not a hole you can fill. */
function _rtsNextBuildable(side, key) {
  var G = window._rtsG, list = (G.base && G.base[side]) || [];
  for (var i = 0; i < list.length; i++) {
    var n = list[i];
    if (key && n.key !== key) continue;
    if (_rtsBaseGetBuilding(side, n)) continue;
    if (!_rtsCanPlace(side, n.key, n.tx, n.tz)) continue;
    return n;
  }
  return null;
}
/* Is_Node: is this building part of the plan? Used to keep _rtsPlaceStruct from adding a
   second node every time a hole is filled by the building it was a hole for. */
function _rtsBaseIsNode(e) {
  if (!e || e.type !== 'struct') return false;
  var G = window._rtsG, list = (G.base && G.base[e.side]) || [];
  for (var i = 0; i < list.length; i++)
    if (list[i].key === e.def && list[i].tx === e.tx && list[i].tz === e.tz) return true;
  return false;
}
/* Selling is a decision NOT to have the building - the AI sells for cash or to shed power
   load. Leaving the node behind would make it a hole, the AI would rebuild it, and the pair
   would oscillate forever. Destruction leaves the node; a sale removes it. */
function _rtsBaseDropNode(e) {
  var G = window._rtsG;
  if (!G.base || !G.base[e.side]) return;
  var list = G.base[e.side];
  for (var i = 0; i < list.length; i++)
    if (list[i].key === e.def && list[i].tx === e.tx && list[i].tz === e.tz) { list.splice(i, 1); return; }
}

function _rtsNewGame(seed, diff) {
  var G = {
    t:0, seed:seed || 12345, over:null, msg:null, msgT:0, shake:0,
    /* the whole difficulty system is this one string plus RTS_DIFF; see _rtsBias */
    diff:(RTS_DIFF[diff] ? diff : (RTS_DIFF[window._RTS_DIFF] ? window._RTS_DIFF : RTS_DIFF_DEFAULT)),
    blocked:new Uint8Array(RTS_N * RTS_N),
    terrain:new Uint8Array(RTS_N * RTS_N),  /* RTS_T_* - what the ground IS, for the renderer */
    scorch:new Uint8Array(RTS_N * RTS_N),   /* 0 none, 1-6 scorch variant, +8 bit = crater */
    /* BASE.CPP's node list, per side: the ordered (type, cell) plan a base is rebuilt against */
    base:{ player:[], enemy:[] },
    corpses:[],                             /* {x,z,v} the renderer has yet to stamp */
    newScorch:[],                           /* cells the renderer has yet to stamp */
    scrap:new Float32Array(RTS_N * RTS_N),
    /* GoldValue 35 / GemValue 110: a flag per tile, not a second resource. Same mining, same
       refinery, ~3x the credits - so a gem field is worth crossing the map for. */
    gems:new Uint8Array(RTS_N * RTS_N),
    /* MAP.CPP's IsMapped / IsVisible, one byte each. These are the PLAYER's knowledge of the
       map - the AI is not fogged, exactly as the original's computer opponent is not. */
    mapped:new Uint8Array(RTS_N * RTS_N),
    vis:new Uint8Array(RTS_N * RTS_N),
    owner:new Int32Array(RTS_N * RTS_N),   /* entity id occupying the tile, 0 = none */
    ents:[], byId:{}, nextId:1,
    sel:[], proj:[], fx:[],
    sides:{ player:_rtsSideNew('player'), enemy:_rtsSideNew('enemy') },
    rnd:null,                              /* seeded on first use; see _rtsRnd */
    ai:{ next:0, wave:0, build:6, place:0, state:0, lastHit:-999, want:null },
    teams:{}, teamSeq:0, teamHold:{},
    stats:{ killed:0, lostU:0 }
  };
  window._rtsG = G;
  /* AttackDelay: how long you get before the first wave, stretched on the easy setting. */
  G.ai.next = RTS_WAVE_FIRST * _rtsBias('enemy').build;
  _rtsPathfindInit();
  var rnd = _rtsRngMake(G.seed);

  /* --- ore fields: a few blobs, biggest ones out in the contested middle --- */
  /* The fourth number is the gem flag. The gem patches sit out in contested ground, never in
     either starting corner - a high-value deposit you can mine in total safety is not a
     decision, and both bases are meant to want the middle.

     Gem patches are SMALL, and have to be. A gem step is priced at four times GemValue while
     _adjgem caps a gem cell at three steps, so a harvester bay filled with gems is worth an
     order of magnitude more than the same bay filled with gold. Fields sized for the old
     flat 3x multiplier left the AI sitting on 90k credits it could not spend by the four
     minute mark. Small patch, no regrowth, enormous payout: that is the whole point of the
     deposit in the middle of the map. */
  /* The two starts are rolled BEFORE anything else is laid down, because the ore, the roads,
     the connectivity fill and the team waypoints are all expressed relative to them. */
  G.starts = _rtsPickStarts(rnd);
  var fields = _rtsOreFields(G.starts);
  for (var f = 0; f < fields.length; f++) {
    var cx = fields[f][0], cz = fields[f][1], rad = fields[f][2], isGem = fields[f][3];
    for (var tx = cx - rad; tx <= cx + rad; tx++) for (var tz = cz - rad; tz <= cz + rad; tz++) {
      if (!_rtsInB(tx, tz)) continue;
      var d = Math.hypot(tx - cx, tz - cz);
      if (d > rad * (0.72 + rnd() * 0.42)) continue;    /* ragged edge rather than a disc */
      G.scrap[_rtsIdx(tx, tz)] = 1;                     /* shape only; density set below */
      if (isGem) G.gems[_rtsIdx(tx, tz)] = 1;
    }
  }
  _rtsGenTerrain(G, rnd, G.starts);

  /* --- the two bases: player bottom-left, Redline top-right.
     Footprints are small (Command Yard 3x3) so a base is a cluster of compact structures
     on a large map, the way the originals laid out - not a few slabs filling the screen. --- */
  /* Each base is laid out in its own local frame - `along` toward the opponent, `across` to
     the side - so the same arrangement works whichever axis the roll produced. Scan_Place_Object
     is what fills in when a slot is blocked: it walks outward through distances, trying every
     facing at each, rather than giving up on the exact cell. */
  _rtsLayBase(G.starts.player, G.starts.enemy, [
    ['struct','yard',    0,  0], ['struct','power',   1,  5],
    ['unit',  'rifle',   3, -3], ['unit',  'rifle',   4, -1], ['unit', 'buggy', 1, -4]
  ], 'player');
  _rtsLayBase(G.starts.enemy, G.starts.player, [
    ['struct','yard',    0,  0], ['struct','power',  -1, -5],
    ['struct','refinery',5,  0], ['struct','barracks',4, -5],
    ['struct','factory', 4,  5], ['struct','turret',  9, -2], ['struct','turret', 9, 3],
    ['unit',  'harvester',11, 1], ['unit','rifle',   10, -2], ['unit','tank',   11, 3]
  ], 'enemy');

  /* Density LAST. Terrain generation and the two bases both erase ore, and a cell's level is
     a function of how many neighbours still have some - so running the adjust before those
     passes bakes in counts that no longer describe the field. */
  _rtsTiberiumAdjust(G);

  /* Waypoints last as well, for the same reason: they are snapped to open ground and named
     after ore fields, so they have to be derived from the finished map, not the blank one. */
  _rtsBuildWaypoints(G);
  _rtsTrigInit(G);
  _rtsCrateInit(G);           /* after the map is finished: a crate needs clear ground */

  _rtsRecalcPower('player'); _rtsRecalcPower('enemy');
  return G;
}

/* ----------------------------------------------------------------- crates --
   CRATE.CPP. Each crate is a slot with a cell and a timer, and the set of slots is fixed:
   `Create_Crate` removes whatever the slot was tracking before it places a new one, so
   crates relocate rather than accumulate. Everything below follows that file except what is
   inside a crate, which that file does not say - see RTS_CRATES.

   Held as a small array rather than a per-cell overlay byte. The original needs an overlay
   because its cell already carries one; here nothing else wants that storage, and a list of
   three is cheaper to scan than 12,544 cells are to search. */
/* Crates draw from their OWN generator, the way ore growth already does, and that is not a
   tidiness point - it is the difference between a comparable measurement and a meaningless
   one. Placing three crates off the main stream at map setup shifts every subsequent roll in
   the match, so every seeded scenario in the repository becomes a different battle and the
   ladder can no longer be compared against the run before. Measured: crates moved `hard` from
   174 s to 183 s while the logs showed ZERO crates being picked up in the seed that moved
   most. That was not balance, it was a reseed. */
function _rtsCrateRnd(G) {
  if (!G.crateRnd) G.crateRnd = _rtsRngMake((G.seed ^ 0xc4a7e) >>> 0);
  return G.crateRnd;
}
function _rtsCrateInit(G) {
  G.crates = [];
  _rtsCrateRnd(G);
  for (var i = 0; i < RTS_CRATE_MAX; i++) _rtsCrateNew(G);
}
/* Put_Crate: re-roll a random location until the cell is clear. The original loops forever
   until it finds one; this gives up after RTS_CRATE_TRIES, because a map that somehow had no
   clear ground left would hang the tick rather than skip a crate. */
function _rtsCrateSpot(G) {
  var rnd = _rtsCrateRnd(G);
  for (var t = 0; t < RTS_CRATE_TRIES; t++) {
    var tx = (rnd() * RTS_N) | 0, tz = (rnd() * RTS_N) | 0;
    if (!_rtsInB(tx, tz)) continue;
    var i = _rtsIdx(tx, tz);
    if (G.blocked[i] !== 0) continue;                  /* Is_Clear_To_Build */
    if (G.scrap[i] > 0) continue;                      /* not buried in an ore field */
    /* one crate per cell */
    var clash = false;
    for (var c = 0; c < G.crates.length; c++) if (G.crates[c].tx === tx && G.crates[c].tz === tz) clash = true;
    if (clash) continue;
    return { tx:tx, tz:tz };
  }
  return null;
}
/* Weighted pick over RTS_CRATES. */
function _rtsCratePick(G) {
  var total = 0, i;
  for (i = 0; i < RTS_CRATES.length; i++) total += RTS_CRATES[i].w;
  var r = _rtsCrateRnd(G)() * total;
  for (i = 0; i < RTS_CRATES.length; i++) { r -= RTS_CRATES[i].w; if (r <= 0) return RTS_CRATES[i]; }
  return RTS_CRATES[0];
}
function _rtsCrateNew(G) {
  var spot = _rtsCrateSpot(G);
  if (!spot) return null;
  /* Random_Pick(CrateTime * TICKS_PER_MINUTE/2, CrateTime * TICKS_PER_MINUTE*2): a crate
     lives between HALF and TWICE CrateTime, expressed here in seconds. */
  var lo = RTS_CRATE_TIME * 30, hi = RTS_CRATE_TIME * 120;
  var cr = { tx:spot.tx, tz:spot.tz, kind:_rtsCratePick(G).key,
    t:lo + _rtsCrateRnd(G)() * (hi - lo) };
  G.crates.push(cr);
  return cr;
}
/* A crate that times out is not simply deleted - Create_Crate removes the old one and places
   a new one, so the count on the map is constant for the whole match. */
function _rtsCrateAI(dt) {
  var G = window._rtsG;
  if (!G.crates) return;
  for (var i = G.crates.length - 1; i >= 0; i--) {
    G.crates[i].t -= dt;
    if (G.crates[i].t <= 0) { G.crates.splice(i, 1); _rtsCrateNew(G); G.crateDirty = 1; }
  }
  /* Anything standing on one picks it up. Both sides: a crate does not know whose army it
     is under, and an opponent that drives over free money should get it. */
  for (var e = 0; e < G.ents.length; e++) {
    var u = G.ents[e];
    if (u.dead || u.type !== 'unit') continue;
    var tx = _rtsTX(u.x), tz = _rtsTX(u.z);
    for (var c = G.crates.length - 1; c >= 0; c--) {
      var cr = G.crates[c];
      if (cr.tx !== tx || cr.tz !== tz) continue;
      G.crates.splice(c, 1);                            /* Get_Crate */
      _rtsCrateOpen(cr, u);
      _rtsCrateNew(G); G.crateDirty = 1;
      break;
    }
  }
}
/* What is in the box. The effect list is ours; see the note on RTS_CRATES. */
function _rtsCrateOpen(cr, u) {
  var G = window._rtsG, S = G.sides[u.side], mine = u.side === 'player';
  var def = null, i;
  for (i = 0; i < RTS_CRATES.length; i++) if (RTS_CRATES[i].key === cr.kind) def = RTS_CRATES[i];
  if (!def) return null;
  var say = function (m) { if (mine) _rtsSay(m); };
  var ping = function (n) { if (typeof _rtsSfx === 'function') _rtsSfx(n, u.x, u.z); };

  if (def.mult) {
    /* A bonus multiplies whatever the unit already had, capped so a unit that has hoovered
       up six firepower crates is still a unit rather than a boss. `rof` is the odd one out:
       lower is faster, so its cap is a FLOOR. */
    u.cr = u.cr || {};
    for (var k in def.mult) {
      var v = (u.cr[k] || 1) * def.mult[k], cap = RTS_CRATE_CAP[k];
      u.cr[k] = (k === 'rof') ? Math.max(cap, v) : Math.min(cap, v);
    }
    say(def.name + '!');
    ping('place');
    return def.key;
  }
  if (cr.kind === 'money') {
    var amt = Math.round(RTS_CRATE_MONEY[0]
      + _rtsCrateRnd(G)() * (RTS_CRATE_MONEY[1] - RTS_CRATE_MONEY[0]));
    /* A GRANT, not harvest: crate money is found money and the storage cap must not eat it. */
    _rtsGrant(S, amt);
    say('Found ' + amt + ' credits.');
    ping('place');
  } else if (cr.kind === 'heal') {
    u.hp = u.maxHp;
    say('Repair kit.');
    ping('place');
  } else if (cr.kind === 'reveal') {
    if (mine) { for (i = 0; i < G.mapped.length; i++) G.mapped[i] = 1; G.visDirty = 1; }
    say('Map data recovered.');
    ping('place');
  } else if (cr.kind === 'unit') {
    var key = RTS_CRATE_UNITS[(_rtsCrateRnd(G)() * RTS_CRATE_UNITS.length) | 0];
    var got = _rtsSpawnUnit(u.side, key, _rtsWX(cr.tx), _rtsWX(cr.tz));
    say('Abandoned ' + rtsUnitDef(key).name + ' recovered.');
    ping('unitready');
    return got ? 'unit' : null;
  } else if (cr.kind === 'mine') {
    /* The reason a crate is a decision. Damage comes from the crate itself rather than from
       a side, so it is nobody's kill and cannot be farmed for credit. */
    _rtsSplash(_rtsWX(cr.tx), _rtsWX(cr.tz), RTS_CRATE_MINE_RADIUS, RTS_CRATE_MINE_DMG, null, 2, null);
    G.fx.push({ kind:'boom', x:_rtsWX(cr.tx), y:1, z:_rtsWX(cr.tz), t:0, big:1.5 });
    say('It was a trap!');
    ping('deny');
  }
  return cr.kind;
}

/* ----------------------------------------------------------------- shroud --
   MAP.CPP builds RadiusOffset[] once - a flat list of cell offsets ordered by ring, with
   RadiusCount[r] giving how many entries cover a radius of r. Sight_From then walks the
   first RadiusCount[range] entries, which is why revealing a ten-cell disc costs one pass
   over 309 precomputed offsets rather than a 21x21 box scan with a distance test in it.

   The ring ordering is what makes the original's incremental scan possible: a unit that has
   moved one cell only needs its outer rings refreshed. Built here rather than typed out. */
var _RTS_RAD = null;
function _rtsRadiusTable() {
  if (_RTS_RAD) return _RTS_RAD;
  var rings = [], r, dx, dz;
  for (r = 0; r <= RTS_SIGHT_MAX; r++) rings.push([]);
  for (dz = -RTS_SIGHT_MAX; dz <= RTS_SIGHT_MAX; dz++) {
    for (dx = -RTS_SIGHT_MAX; dx <= RTS_SIGHT_MAX; dx++) {
      var d = Math.sqrt(dx * dx + dz * dz);
      if (d > RTS_SIGHT_MAX + 0.5) continue;
      rings[Math.max(0, Math.min(RTS_SIGHT_MAX, Math.round(d)))].push(dx, dz);
    }
  }
  var off = [], count = [];
  for (r = 0; r <= RTS_SIGHT_MAX; r++) {
    for (var i = 0; i < rings[r].length; i++) off.push(rings[r][i]);
    count.push(off.length >> 1);
  }
  _RTS_RAD = { off:off, count:count };
  return _RTS_RAD;
}
/* Sight_From: mark everything within `range` cells as seen now and explored forever. */
function _rtsSightFrom(tx, tz, range) {
  var G = window._rtsG, T = _rtsRadiusTable();
  range = Math.max(0, Math.min(RTS_SIGHT_MAX, range | 0));
  var n = T.count[range] * 2, off = T.off, rr = range * range;
  for (var i = 0; i < n; i += 2) {
    var dx = off[i], dz = off[i + 1];
    /* Sight_From filters the ring list by TRUE distance as well - the offset table is a
       superset, and this is what makes the revealed area an exact circle. */
    if (dx * dx + dz * dz > rr) continue;
    var x = tx + dx, z = tz + dz;
    if (x < 0 || z < 0 || x >= RTS_N || z >= RTS_N) continue;
    var c = z * RTS_N + x;
    G.vis[c] = 1; G.mapped[c] = 1;
  }
}
/* Rebuilt on the 15 Hz clock rather than per frame: everything the player owns looks, and
   what nothing is looking at falls back to explored-but-dim. */
function _rtsVisTick(dt) {
  var G = window._rtsG;
  G.visT = (G.visT || 0) + dt;
  if (G.visT < 1 / RTS_VIS_HZ) return;
  G.visT = 0;
  G.vis.fill(0);
  for (var i = 0; i < G.ents.length; i++) {
    var e = G.ents[i];
    if (e.dead || e.side !== 'player') continue;
    var def = e.type === 'struct' ? rtsStructDef(e.def) : rtsUnitDef(e.def);
    if (!def) continue;
    _rtsSightFrom(_rtsTX(e.x), _rtsTX(e.z), rtsSightTiles(def));
  }
  G.visDirty = 1;                 /* the renderer only re-bakes the shroud when this is set */
}
function _rtsSeen(tx, tz) {
  var G = window._rtsG;
  if (!G.mapped || !_rtsInB(tx, tz)) return true;
  return !!G.mapped[_rtsIdx(tx, tz)];
}
function _rtsVisible(tx, tz) {
  var G = window._rtsG;
  if (!G.vis || !_rtsInB(tx, tz)) return true;
  return !!G.vis[_rtsIdx(tx, tz)];
}
/* Can the player see this entity at all? A unit vanishes the moment it leaves your sight;
   a building you have already scouted stays on the map, because it is part of what you know
   about the ground rather than something that moves. */
function _rtsEntSeen(e) {
  if (!e) return false;
  if (e.side === 'player') return true;
  /* Fire_At reveals a shooter that was hidden in the darkness. The visibility grid is
     rebuilt from scratch every sweep, so the reveal lives on the shooter as a short timer
     rather than as a mark on the grid that the next sweep would wipe. */
  if (e.spot > 0) return true;
  var tx = _rtsTX(e.x), tz = _rtsTX(e.z);
  return e.type === 'struct' ? _rtsSeen(tx, tz) : _rtsVisible(tx, tz);
}

/* ------------------------------------------------------------- entities */
function _rtsFootprint(e, on) {
  var G = window._rtsG, d = rtsStructDef(e.def);
  for (var tx = e.tx; tx < e.tx + d.w; tx++) for (var tz = e.tz; tz < e.tz + d.h; tz++) {
    if (!_rtsInB(tx, tz)) continue;
    var i = _rtsIdx(tx, tz);
    if (on) {
      G.blocked[i] = 1; G.owner[i] = e.id;
      /* the ground under a structure is cleared - otherwise the starting bases (which are
         placed without the player's build check) end up with crystals poking through them */
      if (G.scrap[i] > 0) { G.scrap[i] = 0; G.gems[i] = 0; G.scrapDirty = true; }
    }
    else if (G.owner[i] === e.id) { G.blocked[i] = 0; G.owner[i] = 0; }
  }
}
/* BUILDING.H Flush_For_Placement: units do not block a structure going up, so anything
   standing on the new footprint has to be shoved clear. Without it a unit ends up embedded
   in a wall - which happened once the AI started building enough to land on its own army. */
function _rtsFlushForPlacement(e) {
  var G = window._rtsG, d = rtsStructDef(e.def);
  for (var i = 0; i < G.ents.length; i++) {
    var u = G.ents[i];
    if (u.dead || u.type !== 'unit') continue;
    var tx = _rtsTX(u.x), tz = _rtsTX(u.z);
    if (tx < e.tx || tx >= e.tx + d.w || tz < e.tz || tz >= e.tz + d.h) continue;
    var cell = _rtsExitCell(e, u.x - e.x, u.z - e.z);
    if (cell) { u.x = _rtsWX(cell[0]); u.z = _rtsWX(cell[1]); u.path = null; }
  }
}
function _rtsCanPlace(side, key, tx, tz, anywhere) {
  var G = window._rtsG, d = rtsStructDef(key);
  if (!d) return false;
  for (var ax = tx; ax < tx + d.w; ax++) for (var az = tz; az < tz + d.h; az++) {
    if (!_rtsInB(ax, az)) return false;
    if (G.blocked[_rtsIdx(ax, az)] !== 0) return false;
    if (G.scrap[_rtsIdx(ax, az)] > 0) return false;
  }
  /* Must be within build radius of one of your own structures (classic base-creep rule).
     `anywhere` skips it: BuildingTypeClass::Legal_Placement, which is what an MCV deploy is
     checked against, tests terrain and occupancy only. A vehicle whose entire purpose is to
     found a base somewhere you have nothing cannot be held to a rule about being near
     something you own. */
  if (anywhere) return true;
  var cx = tx + d.w / 2, cz = tz + d.h / 2, near = false;
  for (var i = 0; i < G.ents.length; i++) {
    var o = G.ents[i];
    if (o.type !== 'struct' || o.side !== side || o.dead || o.building) continue;
    var od = rtsStructDef(o.def);
    if (Math.hypot(cx - (o.tx + od.w / 2), cz - (o.tz + od.h / 2)) <= RTS_BUILD_RADIUS) { near = true; break; }
  }
  return near;
}
function _rtsPlaceStruct(side, key, tx, tz, instant, paid) {
  var G = window._rtsG, d = rtsStructDef(key);
  var e = { id:G.nextId++, type:'struct', side:side, def:key, tx:tx, tz:tz,
    x:_rtsWX(tx) + (d.w - 1) * RTS_TILE / 2, z:_rtsWX(tz) + (d.h - 1) * RTS_TILE / 2,
    hp:instant ? d.hp : d.hp * 0.15, maxHp:d.hp, rot:0, cool:0, target:null,
    building:instant ? 0 : 1, bprog:instant ? 1 : 0, dead:false, mesh:null,
    /* PurchasePrice. A structure placed straight onto the map at match start was never
       bought, so it is worth what it would have cost this side to buy. */
    paid:paid == null ? _rtsCostOf(side, d) : paid };
  G.ents.push(e); G.byId[e.id] = e;
  _rtsFootprint(e, true);
  _rtsFlushForPlacement(e);
  _rtsRecalcPower(side);
  /* Only a pre-placed (instant) structure hands over its free unit here. A structure that
     has to be built delivers it in _rtsUpdateStruct when construction finishes - granting
     it in both places gave every constructed refinery two harvesters for the price of one. */
  if (instant) _rtsGrandOpening(e);
  /* Every structure placed becomes a node in its side's blueprint, unless it is filling a hole
     that is already one. Recording it here rather than at each call site is what keeps the
     invariant simple: a node exists for every building that has ever stood, until it is sold. */
  if (!_rtsBaseIsNode(e)) _rtsBaseAdd(side, key, tx, tz);
  return e;
}
/* BUILDING.CPP Find_Exit_Cell(): a new unit does not appear inside the building, it walks
   out of it. Walk the ring of cells around the footprint and take the clear one nearest the
   building's exit side, widening the ring until something is free. `prefX/prefZ` is that
   exit direction - the war factory's door faces the camera, and a refinery backs its
   harvester out to the south-west, both as in the original. */
function _rtsExitCell(src, prefX, prefZ) {
  var d = rtsStructDef(src.def);
  var cx = src.tx + (d.w - 1) / 2, cz = src.tz + (d.h - 1) / 2;
  var pl = Math.hypot(prefX, prefZ) || 1;
  prefX /= pl; prefZ /= pl;
  for (var ring = 1; ring <= 6; ring++) {
    var x0 = src.tx - ring, x1 = src.tx + d.w - 1 + ring;
    var z0 = src.tz - ring, z1 = src.tz + d.h - 1 + ring;
    var best = null, bs = 1e9;
    for (var tx = x0; tx <= x1; tx++) for (var tz = z0; tz <= z1; tz++) {
      if (tx !== x0 && tx !== x1 && tz !== z0 && tz !== z1) continue;   /* border cells only */
      if (!_rtsInB(tx, tz) || _rtsBlocked(tx, tz)) continue;
      var dx = tx - cx, dz = tz - cz, len = Math.hypot(dx, dz) || 1;
      /* nearest first, then whichever of those best matches the exit direction */
      var score = len - (dx / len * prefX + dz / len * prefZ) * 1.6;
      if (score < bs) { bs = score; best = [tx, tz]; }
    }
    if (best) return best;
  }
  return _rtsNearestOpen(_rtsTX(src.x), _rtsTX(src.z), 14);
}
/* Grand_Opening, guarded by HasOpened. BUILDING.H keeps that flag precisely so that "multiple
   inadvertant calls to Grand_Opening won't cause problems" - which is the exact bug that once
   gave every constructed refinery two harvesters, because the free unit was handed out at
   placement AND again when construction finished. The flag makes that impossible rather than
   merely fixed. */
function _rtsGrandOpening(e) {
  if (e.opened) return;
  e.opened = 1;
  var d = rtsStructDef(e.def);
  if (d.freeUnit) _rtsSpawnAt(e.side, d.freeUnit, e);
}
/* Exit_Object: put the unit on a clear exit cell, and give a harvester leaving a refinery
   its harvest order straight away rather than leaving it parked by the door. */
function _rtsSpawnAt(side, key, src) {
  var u = rtsUnitDef(key), harv = !!(u && u.harvest);
  var cell = _rtsExitCell(src, harv ? -0.7 : 0, harv ? 0.7 : 1);
  if (!cell) return null;
  var e = _rtsSpawnUnit(side, key, _rtsWX(cell[0]), _rtsWX(cell[1]));
  if (e && harv) _rtsOrderHarvest(e, null, null);
  return e;
}
function _rtsSpawnUnit(side, key, x, z) {
  /* team: Handle_Team's Group. -1 = unassigned. */
  var G = window._rtsG, d = rtsUnitDef(key);
  if (!d) return null;
  var e = { id:G.nextId++, type:'unit', side:side, def:key, x:x, z:z, rot:side === 'player' ? 0 : Math.PI,
    hp:d.hp, maxHp:d.hp, r:d.r, cool:0, path:null, pi:0, order:null, target:null,
    carry:0, carryVal:0, hstate:null, htile:null, dead:false, mesh:null, turret:0, fire:0, team:-1,
    fear:0, prone:0,
    /* MasterDoControls marks DO_WALK and DO_CRAWL 'randomstart'. That is why a squad does
       not march in lockstep - each soldier's walk cycle begins on a different frame. */
    gait:(G.nextId * 7) % 8 };
  G.ents.push(e); G.byId[e.id] = e;
  return e;
}
/* ------------------------------------------------------------ capture — MISSION_CAPTURE

   An engineer walks into an enemy building and the building changes hands. The unit is spent
   doing it, which is what keeps the whole thing from being free: 600 credits and a walk across
   the map buys you one structure, and the structure keeps whatever damage it already had.

   Everything derived from ownership has to move with it. Power is a per-side sum, so both
   sides recalculate. The footprint's `owner` map is keyed by entity id rather than side, so it
   needs no change - which is exactly why it was built that way. And the blueprint node moves
   too, or the previous owner would keep trying to rebuild a building that is standing right
   there in someone else's colours. */
function _rtsCapture(eng, b) {
  var G = window._rtsG, from = b.side;
  if (!b || b.dead || b.type !== 'struct' || b.side === eng.side) return false;
  if (!rtsCapturable(b.def)) return false;
  _rtsBaseDropNode(b);                       /* off the old owner's plan... */
  b.side = eng.side;
  _rtsBaseAdd(b.side, b.def, b.tx, b.tz);    /* ...and onto the new one's */
  b.target = null; b.cool = 0; b.repair = 0;
  /* Taking a building does not repair it, and a captured shell is a liability. A floor stops
     the pathological case of capturing something with 3 hp that dies before it is any use. */
  b.hp = Math.max(b.hp, b.maxHp * 0.25);
  _rtsRecalcPower(from); _rtsRecalcPower(b.side);
  /* Anything that was shooting at it, or was ordered onto it, is now aiming at a friend. */
  for (var i = 0; i < G.ents.length; i++) {
    var o = G.ents[i];
    if (!o.dead && o.target === b && o.side === b.side) { o.target = null; if (o.order === 'attack') o.order = null; }
  }
  if (G.sel.indexOf(b) >= 0 && b.side !== 'player') G.sel.splice(G.sel.indexOf(b), 1);
  _rtsKill(eng);                              /* spent */
  var nm = rtsStructDef(b.def).name;
  if (b.side === 'player') { _rtsSay(nm + ' captured.'); if (typeof _rtsSfx === 'function') _rtsSfx('place'); }
  else _rtsSay('They have taken your ' + nm + '!');
  return true;
}
/* Thief: "any Thief that enters an enemy Ore Refinery will steal half the credits in that
   structure". This game keeps credits on the side rather than in the building, so the fraction
   comes off the treasury - same effect, and it still takes walking into a defended base. */
function _rtsSteal(th, b) {
  var G = window._rtsG, from = G.sides[b.side];
  /* Available_Money, so the store counts: a house sitting on full silos is exactly the house
     worth robbing, and taking only the loose change would make the thief useless against it. */
  var take = Math.floor(rtsMoney(from) * rtsUnitDef(th.def).steal);
  _rtsSpend(from, take);
  _rtsGrant(G.sides[th.side], take);
  _rtsKill(th);
  if (th.side === 'player') _rtsSay('Stole ' + take + ' credits.');
  else _rtsSay('They stole ' + take + ' credits from you!');
  if (typeof _rtsSfx === 'function') _rtsSfx(th.side === 'player' ? 'place' : 'deny');
  return take;
}
/* C4. "Can destroy buildings instantly if she is able to get adjacent to them." Instantly means
   instantly - no damage roll, no armour table. She survives, unlike the engineer and the thief,
   which is why she costs 1200 and is limited to one at a time. */
function _rtsDemo(c, b) {
  var nm = rtsStructDef(b.def).name;
  _rtsKill(b);
  c.order = null; c.target = null; c.path = null;
  if (c.side === 'player') _rtsSay(nm + ' demolished.');
  else _rtsSay('Your ' + nm + ' has been demolished!');
  if (typeof _rtsSfx === 'function') _rtsSfx('boom', b.x, b.z);
  return true;
}
/* How close an engineer has to get: just outside the footprint, measured from the nearest
   edge rather than the centre, or a 3x3 building would need the engineer to stand inside it. */
function _rtsAtStruct(u, b, slack) {
  var d = rtsStructDef(b.def);
  var cx = Math.min(Math.max(u.x, _rtsWX(b.tx)), _rtsWX(b.tx + d.w - 1));
  var cz = Math.min(Math.max(u.z, _rtsWX(b.tz)), _rtsWX(b.tz + d.h - 1));
  return Math.hypot(u.x - cx, u.z - cz) <= (slack || RTS_TILE * 1.3);
}
/* Where a walk-in unit should actually path to. NOT the building's centre: a footprint is
   blocked ground, so asking the pathfinder for the middle of a barracks returns a route to
   somewhere near it and the unit orbits the building forever without ever arriving. Measured:
   a commando ordered onto a 2x2 barracks from three tiles out held station at 12-14 units for
   the whole test and never triggered.

   This returns a point one tile OUTSIDE the nearest footprint edge, on the side the unit is
   already on - open ground, close enough to satisfy _rtsAtStruct on arrival. */
function _rtsApproach(u, b) {
  var d = rtsStructDef(b.def);
  var cx = Math.min(Math.max(u.x, _rtsWX(b.tx)), _rtsWX(b.tx + d.w - 1));
  var cz = Math.min(Math.max(u.z, _rtsWX(b.tz)), _rtsWX(b.tz + d.h - 1));
  var dx = u.x - cx, dz = u.z - cz, L = Math.hypot(dx, dz);
  if (L < 0.001) return { x:cx, z:cz };
  /* 0.85 of a tile, not a whole one. _rtsWX returns cell CENTRES, so a full tile out from the
     last cell centre lands ~1.3 units beyond the arrival threshold - and steering stops a
     little short of any waypoint on top of that. Measured, a whole tile left the commando
     parked 5.3 units from the clamped edge against a 5.2 threshold: stuck by a tenth of a unit. */
  return { x:cx + dx / L * RTS_TILE * 0.85, z:cz + dz / L * RTS_TILE * 0.85 };
}
function _rtsKill(e) {
  var G = window._rtsG;
  if (e.dead) return;
  e.dead = true;
  if (e.cargo && e.cargo.length) _rtsSpillCargo(e);   /* the passengers walk away from it */
  if (e.type === 'struct') { _rtsFootprint(e, false); _rtsRecalcPower(e.side); }
  if (e.type === 'struct' && e.selling) {
    /* Sold, not destroyed: a puff of dust where it stood, and no fireworks. */
    G.fx.push({ kind:'pop', x:e.x, y:1, z:e.z, t:0, big:1.6 });
    _rtsBaseDropNode(e);          /* a sale is a decision not to have it - see _rtsBaseDropNode */
  }
  else if (e.type === 'struct') {
    var sd = rtsStructDef(e.def);
    /* "Since there are volatile fuels used in the Flame Tower, it damages nearby units and
       structures if destroyed." Friendly fire included - that is the whole drawback, and it is
       why you do not build a row of them through the middle of your own base. */
    if (sd.deathBlast) {
      for (var bi = 0; bi < G.ents.length; bi++) {
        var bt = G.ents[bi];
        if (bt === e || bt.dead) continue;
        var bd = Math.hypot(bt.x - e.x, bt.z - e.z);
        if (bd > sd.deathBlast.radius) continue;
        _rtsDamage(bt, sd.deathBlast.dmg * (1 - bd / sd.deathBlast.radius), null);
      }
      G.fx.push({ kind:'boom', x:e.x, y:1, z:e.z, t:0, big:3.4 });
    }
    G.fx.push({ kind:'boom', x:e.x, y:1, z:e.z, t:0, big:Math.max(2, sd.w * 0.7) });
    /* Secondary blasts walking across the footprint on a delay, then debris thrown clear.
       A structure going down should be an event; one puff was not. */
    var rn = _rtsRngMake((e.id * 7919) >>> 0);
    for (var b = 0; b < 3 + sd.w; b++) {
      G.fx.push({ kind:'boom', t:-0.10 - rn() * 0.5, big:0.8 + rn() * 0.9,
        x:e.x + (rn() - 0.5) * sd.w * RTS_TILE, y:1, z:e.z + (rn() - 0.5) * sd.h * RTS_TILE });
    }
    /* BUILDING.CPP Take_Damage: shakes = Class->Cost_Of() / 400, then Shake_The_Screen.
       So a cheap power plant going up does not move the camera at all and the war factory
       rattles the whole screen - the shake reports what you just lost. */
    G.shake = Math.min(1, G.shake + ((rtsStructDef(e.def).cost / 400) | 0) * 0.12);
    e.wreck = RTS_WRECK_TIME;      /* CountDown: burn on the map before being removed */
    /* Drop_Debris marks every cell the building stood on: mostly craters, some scorch. */
    _rtsWreckGround(e);
    _rtsDropDebris(e);
    for (var k = 0; k < 9 + sd.w * 3; k++) {
      var a = rn() * 6.283, sp = 4 + rn() * 15;
      G.fx.push({ kind:'debris', x:e.x, y:2 + rn() * 3, z:e.z, t:0,
        vx:Math.cos(a) * sp, vz:Math.sin(a) * sp, vy:7 + rn() * 11, big:0.6 + rn() * 0.8 });
    }
  } else {
    G.fx.push({ kind:'pop', x:e.x, y:1, z:e.z, t:0, big:1 });
    var ud = rtsUnitDef(e.def);
    if (ud.kind === 'infantry') {
      G.corpses.push({ x:e.x, z:e.z, v:(e.id * 5) % 3 });
      if (G.corpses.length > 220) G.corpses.shift();
    } else {
      /* Take_Damage: half the time a crew member bails out of a wrecked vehicle, wounded and
         running. Not from one that was crushed - there is nobody left to climb out. */
      if (!e.crushed && _rtsRnd() < RTS_CREW_CHANCE) {
        var cell = _rtsNearestOpen(_rtsTX(e.x), _rtsTX(e.z), 4);
        if (cell) {
          var crew = _rtsSpawnUnit(e.side, 'rifle', _rtsWX(cell[0]), _rtsWX(cell[1]));
          if (crew) {
            crew.hp = Math.max(5, Math.round(crew.maxHp * (0.15 + _rtsRnd() * 0.35)));
            crew.fear = RTS_FEAR.PANIC;
            _rtsScatter(crew, e.x, e.z);
          }
        }
      }
      /* "Very strong units that have an explosion will also rock the screen." */
      if (ud.hp > 400) G.shake = Math.min(1, G.shake + 0.12);
    }
  }
  if (typeof _rtsSfx === 'function')
    _rtsSfx(e.selling ? 'place' : (e.type === 'struct' ? 'boom' : 'pop'), e.x, e.z);
  if (e.side === 'player' && e.type === 'unit') G.stats.lostU++;
  /* HouseClass::UnitsLost / BuildingsLost, which TEVENT's N*_DESTROYED events read. A sold
     building is not a loss - only something that was actually destroyed counts. */
  if (G.lost && G.lost[e.side] && !e.selling) {
    if (e.type === 'unit') G.lost[e.side].units++; else G.lost[e.side].structs++;
  }
  _rtsTrigNotify('destroyed', e, null);
  /* WhoLastHurtMe: a thing that burns to death is still someone's kill. Scoring it off the
     victim's side alone credited the player for units the AI's own fires finished off. */
  if (e.side === 'enemy' && (!e.hurtBy || e.hurtBy === 'player')) G.stats.killed++;
  var si = G.sel.indexOf(e); if (si >= 0) G.sel.splice(si, 1);
  /* SIDEBAR.CPP Recalc is only called when a FACTORY is destroyed - it is an exhaustive
     sweep and the comment is explicit that it should not run for every casualty. */
  if (e.type === 'struct') {
    var gone = _rtsProdRecalc(e.side);
    if (gone.length && e.side === 'player') {
      var gd = rtsStructDef(gone[0]) || rtsUnitDef(gone[0]);
      _rtsSay('Construction halted — ' + (gd ? gd.name : gone[0]) + ' abandoned.');
    }
  }
}

/* ------------------------------------------------- wrecks and survivors --
   BUILDING.CPP Drop_Debris(): every cell the building covered is marked - a quarter of them
   scorched, the rest cratered - and some of the crew stumble out of the ruin. */
function _rtsWreckGround(e) {
  var G = window._rtsG, d = rtsStructDef(e.def);
  for (var tx = e.tx; tx < e.tx + d.w; tx++) for (var tz = e.tz; tz < e.tz + d.h; tz++) {
    if (!_rtsInB(tx, tz)) continue;
    var i = _rtsIdx(tx, tz);
    if (G.terrain[i] === RTS_T_WATER) continue;
    var r = ((tx * 73856093) ^ (tz * 19349663) ^ (e.id * 83492791)) >>> 0;
    if ((r % 4) === 0) {                       /* 25% scorch ... */
      if (!(G.scorch[i] & 7)) { G.scorch[i] = (G.scorch[i] & 8) | (1 + (r >>> 8) % 6); G.newScorch.push(i); }
    } else if (!(G.scorch[i] & 8)) {           /* ... else a crater */
      G.scorch[i] = (G.scorch[i] & 7) | 8; G.newScorch.push(i);
    }
  }
}
/* How_Many_Survivors(): (Raw_Cost * SurvivorFraction) / cost of a rifle squad, bounded 1..5.
   A big expensive building holds more people than a generator shed. */
function _rtsSurvivorCount(e) {
  var d = rtsStructDef(e.def), e1 = rtsUnitDef('rifle');
  var n = Math.floor((d.cost * RTS_SURVIVOR_FRACTION) / Math.max(1, e1.cost));
  return Math.max(1, Math.min(5, n));
}
/* Put `n` survivors out of the wreck. They come out terrified, which is what makes a
   building falling over read as people dying rather than a prop being removed. */
function _rtsEvacuate(e, n, scared) {
  var out = [];
  for (var i = 0; i < n; i++) {
    var cell = _rtsExitCell(e, Math.cos(i * 1.9), Math.sin(i * 1.9));
    if (!cell) break;
    var u = _rtsSpawnUnit(e.side, 'rifle', _rtsWX(cell[0]), _rtsWX(cell[1]));
    if (!u) break;
    if (scared) { u.fear = RTS_FEAR.PANIC; _rtsScatter(u, e.x, e.z); }
    out.push(u);
  }
  return out;
}
function _rtsDropDebris(e) {
  /* IsSurvivorless: "destroyed by some method that would prevent survivors". A building that
     burned down has no crew left to run out of it. */
  if (e.burned) return;
  var n = 0, want = _rtsSurvivorCount(e);
  for (var i = 0; i < want; i++) if (_rtsRnd() < RTS_SURVIVOR_ODDS) n++;
  if (n) _rtsEvacuate(e, n, true);
}

/* --------------------------------------------------------- repair / sell --
   Repair_AI + Sell_Back + Mission_Deconstruction. Repair is a toggle on the building (the
   blinking wrench), not a one-shot: it eats credits a step at a time and gives up on its
   own when the money runs out. */
function _rtsToggleRepair(e) {
  if (!e || e.dead || e.type !== 'struct' || e.building || e.selling) return false;
  if (e.hp >= e.maxHp && !e.repair) return false;
  e.repair = e.repair ? 0 : 1; e.rtimer = 0;
  return true;
}
function _rtsRepairCost(e) {
  return rtsStructDef(e.def).cost * RTS_REPAIR_STEP * RTS_REPAIR_PCT;
}
function _rtsRepairAI(e, dt) {
  var G = window._rtsG, S = G.sides[e.side];
  if (e.hp >= e.maxHp) { e.hp = e.maxHp; e.repair = 0; return; }
  e.rtimer = (e.rtimer || 0) + dt;
  if (e.rtimer < RTS_REPAIR_RATE) return;
  e.rtimer = 0;
  var cost = _rtsRepairCost(e);
  if (rtsMoney(S) < cost) {
    /* Repair_AI gives up when it cannot pay, and the AI sells rather than sit on a wreck. */
    e.repair = 0;
    if (e.side === 'player') _rtsSay('Not enough credits to keep repairing.');
    else if (e.hp < e.maxHp * RTS_COND_RED) _rtsSell(e);
    return;
  }
  _rtsSpend(S, cost);
  e.hp = Math.min(e.maxHp, e.hp + e.maxHp * RTS_REPAIR_STEP);
}
/* Sell_Back: half the RAW price back straight away - see rtsRawCost, which subtracts the free
   unit the building shipped with - then the building deconstructs (the build-up animation
   played backwards) and its crew walks out. */
function _rtsSell(e) {
  var G = window._rtsG;
  if (!e || e.dead || e.type !== 'struct' || e.selling) return false;
  if (e.def === 'yard') return false;           /* selling the Command Yard is suicide, not a sale */
  e.selling = 1; e.repair = 0; e.building = 1; e.bprog = 1;
  /* Refund_Money against the PurchasePrice the object carries, not against the sticker
     price. `paid` is absent only on a save written before this existed. */
  var price = (e.paid == null) ? rtsStructDef(e.def).cost : e.paid;
  /* Raw_Cost is taken off what was actually PAID, not off the sticker, so a building bought at
     a discount cannot be sold back at a profit either. */
  var fd = rtsStructDef(e.def), fu = fd && fd.freeUnit ? rtsUnitDef(fd.freeUnit) : null;
  var raw = Math.max(0, price - (fu ? fu.cost : 0));
  _rtsGrant(G.sides[e.side], Math.round(raw * RTS_REFUND_PCT
    * (e.hp / e.maxHp * 0.5 + 0.5)));          /* a wreck is worth less than a clean building */
  if (e.side === 'player' && typeof _rtsSfx === 'function') _rtsSfx('build');
  return true;
}
/* ------------------------------------------------------------------ transport --
   UNIT.CPP's passenger rules. A boarded passenger stays in G.ents - it is NOT spliced out -
   and carries `inside`, a reference to its transport. Keeping it in the entity list is what
   makes saving work for nothing: the save encoder walks G.ents and turns entity references
   into ids, so a passenger that had been lifted out of the list would round-trip as an inline
   copy and come back as something that merely looked like a unit. The cost is that every place
   which treats a unit as being ON THE MAP has to say so, and there are only four: the tick, the
   draw list, target acquisition and selection. */
function _rtsAboard(e) { return !!(e && e.inside); }
function _rtsCargoCount(t) { return t && t.cargo ? t.cargo.length : 0; }
function _rtsCanBoard(inf, t) {
  if (!inf || !t || inf.dead || t.dead || inf === t) return false;
  if (inf.side !== t.side || inf.inside) return false;
  if ((rtsUnitDef(inf.def) || {}).kind !== 'infantry') return false;
  var cap = (rtsUnitDef(t.def) || {}).carries || 0;
  return cap > 0 && _rtsCargoCount(t) < cap;
}
function _rtsBoard(inf, t) {
  if (!_rtsCanBoard(inf, t)) return false;
  var G = window._rtsG;
  if (!t.cargo) t.cargo = [];
  t.cargo.push(inf);
  inf.inside = t; inf.order = null; inf.target = null; inf.path = null; inf.prone = 0;
  var si = G.sel.indexOf(inf); if (si >= 0) G.sel.splice(si, 1);
  return true;
}
/* Detach_Object + Unlimbo + Scatter: passengers step out around the transport, one per free
   spot, and are given the guard/hunt behaviour of a unit that has just arrived. */
function _rtsUnload(t, force) {
  /* `force` is not a nicety. _rtsKill sets dead BEFORE it spills the cargo, so a plain
     "is it alive" guard here rejected the one call this rule exists for and every passenger
     stayed sealed in the wreck. The suite caught it; reading the code did not. */
  if (!t || (t.dead && !force) || !t.cargo || !t.cargo.length) return 0;
  var G = window._rtsG, n = 0;
  while (t.cargo.length) {
    var inf = t.cargo.pop();
    inf.inside = null;
    if (inf.dead) continue;
    var a = (n / 8) * Math.PI * 2 + t.rot, r = RTS_TILE * 1.1;
    inf.x = t.x + Math.cos(a) * r; inf.z = t.z + Math.sin(a) * r;
    inf.order = null; inf.path = null; inf.target = null;
    _rtsScatter(inf);
    n++;
  }
  return n;
}
/* UnitClass::Death, the transport half of the branch: infantry passengers survive and scatter,
   anything else is recorded as a kill and deleted. Ours can only carry infantry, so in practice
   everyone walks - which is the point of the unit. */
function _rtsSpillCargo(t) {
  if (!t || !t.cargo || !t.cargo.length) return 0;
  return _rtsUnload(t, true);
}

/* UNIT.CPP Try_To_Deploy. An MCV becomes a Command Yard, and three details from the original
   are worth having exactly:

   - the yard lands on the cell ADJACENT to the vehicle, not under it (`Adjacent_Cell(Coord,
     FACING_NW)`), so the footprint grows away from where the vehicle was standing;
   - placement is checked with Legal_Placement, which does NOT apply the build-radius rule -
     see the `anywhere` argument to _rtsCanPlace;
   - `building->Strength = Health_Ratio() * building->Class->MaxStrength`, so a wreck of an MCV
     deploys a wreck of a yard rather than a fresh one. That is the detail that stops a damaged
     MCV being a full repair.

   Returns false and leaves the vehicle alone when there is no room, which is what the original
   does before it says "cannot deploy here". */
function _rtsDeploy(e) {
  var G = window._rtsG;
  if (!e || e.dead || e.type !== 'unit') return false;
  var d = rtsUnitDef(e.def);
  if (!d || !d.deploy) return false;
  var sd = rtsStructDef(d.deploy);
  if (!sd) return false;
  var tx = _rtsTX(e.x) - (sd.w - 1), tz = _rtsTX(e.z) - (sd.h - 1);
  if (!_rtsCanPlace(e.side, d.deploy, tx, tz, true)) {
    if (e.side === 'player') _rtsSay('Cannot deploy here.');
    return false;
  }
  var ratio = Math.max(0.01, Math.min(1, e.hp / e.maxHp));
  _rtsKillQuiet(e);
  var b = _rtsPlaceStruct(e.side, d.deploy, tx, tz, true, d.cost);
  b.hp = Math.max(1, Math.round(sd.hp * ratio));
  _rtsRecalcPower(e.side);
  if (e.side === 'player' && typeof _rtsSfx === 'function') _rtsSfx('place', b.x, b.z);
  return true;
}
/* Removing the vehicle without the wreck, the explosion or the kill credit - it was not
   destroyed, it turned into something. */
function _rtsKillQuiet(e) {
  var G = window._rtsG;
  e.dead = true;
  if (G.sel) { var i = G.sel.indexOf(e); if (i >= 0) G.sel.splice(i, 1); }
}

/* ANIM.CPP's AI + Middle + ChainTo, for the effect list.

   The ordering here is the point: Middle fires when the animation reaches its BIGGEST stage,
   so the scorch or crater is laid down while the fireball is at full size and covering it.
   Placing it at the start makes the mark visibly pop into existence next to the explosion. */
function _rtsAnimAI(dt) {
  var G = window._rtsG, i;
  for (i = G.fx.length - 1; i >= 0; i--) {
    var f = G.fx[i];
    var def = RTS_ANIMS[f.kind];
    if (!def || f.t < 0) continue;

    /* An attached animation rides its object and burns it down. */
    if (f.att) {
      var host = G.byId[f.att];
      if (!host || host.dead) { if (host && !f.stick) host.burning = 0; f.att = 0; }
      else {
        f.x = host.x; f.z = host.z;
        if (def.damage) {
          f.acc = (f.acc || 0) + def.damage * dt;
          if (f.acc >= 1) {
            var dmg = Math.floor(f.acc); f.acc -= dmg;
            host.hp -= dmg;
            if (host.hp <= 0) { host.burned = 1; _rtsKill(host); f.att = 0; }
          }
        }
      }
    }

    if (!f.mid && f.t >= def.dur * def.biggest) {
      f.mid = 1;
      _rtsAnimMiddle(f, def);
    }
    if (f.t >= def.dur) {
      if (f.loops === undefined) f.loops = def.loops || 1;
      if (f.loops > 1) { f.loops--; f.t = 0; f.mid = 0; continue; }
      var nx = def.chain ? RTS_ANIMS[def.chain] : null;
      /* A chain naming an animation that does not exist used to throw here, mid-tick, and
         take the whole match with it - which is exactly what happened when the burn ladder
         replaced the old single `fire` and left `boom` pointing at a dead key. A typo in a
         data table should drop the effect, not stop the game. */
      if (def.chain && !nx) { G.fx.splice(i, 1); continue; }
      if (nx) {
        /* ChainTo: it does not end, it metamorphoses. */
        f.kind = def.chain; f.t = 0; f.mid = 0;
        f.loops = nx.loops || 1;
        /* Each rung of the burn ladder has its OWN drawn size in ADATA (23/14/11 px), so the
           step down is that ratio against the host's base scale - not a blind taper applied
           to whatever the previous stage happened to be. `f.base` is the host's scale; a
           chain on something with no base (a fireball guttering out) keeps the old rule. */
        if (nx.size && f.base) f.big = f.base * nx.size;
        else f.big = (f.big || 1) * 0.6;
        continue;
      }
      /* The flame is out. Clear the flag or the object can never catch fire again - it
         would sit permanently "burning" with nothing burning it. A sticky IMPACT anim is
         attached to the same object but is not its fire, so it must not put the fire out. */
      if (f.att && !f.stick) { var hz = G.byId[f.att]; if (hz) hz.burning = 0; }
      G.fx.splice(i, 1);
    }
  }
}
/* COMBAT.CPP Combat_Anim. */
function _rtsCombatAnim(dmg, x, z, big, stick) {
  var G = window._rtsG;
  if (!(dmg > 0)) return null;
  var tx = _rtsTX(x), tz = _rtsTX(z);
  var water = _rtsInB(tx, tz) && G.terrain[_rtsIdx(tx, tz)] === RTS_T_WATER;
  var kind = water ? 'splash' : (dmg < RTS_ANIM_PIFF ? 'piff' : (dmg < RTS_ANIM_BOOM ? 'hit' : 'boom'));
  /* scale with damage the way the original steps through its list, rather than one fixed size */
  var scale = (big || 1) * (0.7 + Math.min(1, dmg / 90) * 0.7);
  var fx = { kind:kind, x:x, y:1, z:z, t:0, big:scale };
  /* ADATA.CPP IsSticky - "sticks to unit in square". VehHit1/2/3 and Frag1 carry it; FBall1
     and ArtExp1 do not. The distinction is physical: a spark struck OFF something rides that
     thing, while a shell's fireball belongs to the ground where it went off. Without this a
     tank crossing the map at seven units a second leaves its own impact sparks hanging in
     mid-air behind it, which is what was happening to every moving target in the game.

     Only for the smaller kinds. A `boom` is a fireball, and RA does not stick those. */
  if (stick && !stick.dead && stick.type === 'unit' && kind !== 'boom' && kind !== 'splash') {
    fx.att = stick.id; fx.stick = 1;
  }
  G.fx.push(fx);
  return kind;
}
function _rtsAnimMiddle(f, def) {
  var G = window._rtsG;
  var tx = _rtsTX(f.x), tz = _rtsTX(f.z);
  if (!_rtsInB(tx, tz)) return;
  var i = _rtsIdx(tx, tz);
  if (G.terrain[i] === RTS_T_WATER) return;
  if (def.crater) {
    /* Reduce_Tiberium(6): a crater eats the ore it lands in. */
    if (G.scrap[i] > 0) {
      G.scrap[i] = Math.max(0, G.scrap[i] - RTS_CRATER_ORE * 10);
      if (G.scrap[i] <= 0) { G.gems[i] = 0; G.scrapDirty = true; }
    }
    if (!(G.scorch[i] & 8)) { G.scorch[i] = (G.scorch[i] & 7) | 8; G.newScorch.push(i); }
    return;
  }
  if (def.scorch && !(G.scorch[i] & 7)) {
    G.scorch[i] |= 1 + (((tx * 7 + tz * 13 + G.fx.length) % 6) | 0);
    G.newScorch.push(i);
  }
}

/* BUILDING.CPP Power_Output(): Class->Power * fixed(LastStrength, Class->MaxStrength).
   A power plant that has been shot up supplies proportionally less - so a raid on the
   generators browns out the base without having to level them. Drain is NOT scaled: a
   half-wrecked refinery still eats its full draw. Because output now moves with hit points
   this has to be recomputed every tick, not just when something is built or dies. */
function _rtsRecalcPower(side) {
  var G = window._rtsG, made = 0, used = 0;
  for (var i = 0; i < G.ents.length; i++) {
    var e = G.ents[i];
    if (e.type !== 'struct' || e.side !== side || e.dead || e.building) continue;
    var d = rtsStructDef(e.def);
    if (d.power > 0) made += d.power * Math.max(0, Math.min(1, e.hp / e.maxHp));
    else used += -d.power;
  }
  G.sides[side].powerMade = Math.round(made); G.sides[side].powerUsed = used;
}
function _rtsPowerFactor(side) {
  var s = window._rtsG.sides[side];
  var p = s.powerUsed <= 0 ? 1 : s.powerMade / s.powerUsed;
  if (p > 1) p = 1;
  if (p < 1 && p > RTS_POWER_BAND) p = RTS_POWER_BAND;   /* the dead zone - see RTS_POWER_BAND */
  if (p < RTS_POWER_MIN) p = RTS_POWER_MIN;
  return p;
}
function _rtsHas(side, key) {
  var G = window._rtsG;
  for (var i = 0; i < G.ents.length; i++) {
    var e = G.ents[i];
    if (e.type === 'struct' && e.side === side && e.def === key && !e.dead && !e.building) return e;
  }
  return null;
}
function _rtsAvailable(side, def) {
  if (!def.needs) return true;
  for (var i = 0; i < def.needs.length; i++) if (!_rtsHas(side, def.needs[i])) return false;
  return true;
}

/* --------------------------------------------------------- production */
function _rtsQueueCat(key) {
  var s = rtsStructDef(key); if (s) return 'struct';
  var u = rtsUnitDef(key); return u ? u.kind : null;
}
function _rtsCanQueue(side, key) {
  var G = window._rtsG, S = G.sides[side];
  var cat = _rtsQueueCat(key); if (!cat) return false;
  if (S.q[cat]) return false;
  if (cat === 'struct' && S.ready) return false;
  var def = rtsStructDef(key) || rtsUnitDef(key);
  if (!_rtsAvailable(side, def)) return false;
  /* `only` is a hard cap on how many of a type may exist at once - the Commando is one at a
     time, as in the reference. Counts what is standing AND what is on the way, or the queue
     lets you stack three of them before the first one appears. */
  if (def.only) {
    var have = 0;
    for (var oi = 0; oi < G.ents.length; oi++) {
      var oe = G.ents[oi];
      if (!oe.dead && oe.side === side && oe.type === 'unit' && oe.def === key) have++;
    }
    for (var qc in S.q) if (S.q[qc] && S.q[qc].key === key) have++;
    if (have >= def.only) return false;
  }
  if (cat === 'infantry' && !_rtsHas(side, 'barracks')) return false;
  if (cat === 'vehicle' && !_rtsHas(side, 'factory')) return false;
  if (rtsMoney(S) < _rtsCostOf(side, def)) return false;
  return true;
}
/* Can this side produce `key` at all - ignoring money and ignoring whether the line is
   already busy? This is SIDEBAR.CPP's `Who_Can_Build_Me`: the question Recalc asks of every
   cameo when a factory is lost. */
function _rtsCanProduce(side, key) {
  var def = rtsStructDef(key) || rtsUnitDef(key);
  if (!def) return false;
  var cat = _rtsQueueCat(key);
  if (!_rtsAvailable(side, def)) return false;
  if (cat === 'struct') return !!_rtsHas(side, 'yard');
  if (cat === 'infantry') return !!_rtsHas(side, 'barracks');
  if (cat === 'vehicle') return !!_rtsHas(side, 'factory');
  return true;
}
function _rtsQueue(side, key) {
  if (!_rtsCanQueue(side, key)) return false;
  var S = window._rtsG.sides[side], def = rtsStructDef(key) || rtsUnitDef(key);
  /* FactoryClass::Set: `Balance = Cost_Of() * CostBias`, and the job is driven by that
     outstanding balance rather than by re-deriving a charge from the price each tick. */
  var price = _rtsCostOf(side, def);
  S.q[_rtsQueueCat(key)] = { key:key, prog:0, total:_rtsBuildTimeOf(side, def),
    cost:price, bal:price, paid:0, hold:0 };
  return true;
}
/* SIDEBAR.CPP SelectClass::Action, RIGHTPRESS: "If production is in progress, put it on
   hold. If production is already on hold, then abandon it." Two distinct presses, and the
   distinction matters - a single click should never be able to destroy a nearly-finished
   war factory. Suspending keeps the money already spent tied up in the job; abandoning
   refunds it. */
function _rtsSuspend(side, cat) {
  var S = window._rtsG.sides[side], q = S.q[cat];
  if (!q || q.hold) return false;
  q.hold = 1;
  return true;
}
function _rtsResume(side, cat) {
  var S = window._rtsG.sides[side], q = S.q[cat];
  if (!q || !q.hold) return false;
  q.hold = 0;
  return true;
}
function _rtsCancel(side, cat) {
  var S = window._rtsG.sides[side], q = S.q[cat];
  if (!q) return;
  _rtsGrant(S, q.paid);        /* refund what was actually spent */
  S.q[cat] = null;
}
/* SIDEBAR.CPP Recalc: called when a factory is destroyed. Anything that can no longer be
   built by anybody is dropped, and its production abandoned. Without this, blowing up a
   barracks left the rifle squad inside it still ticking toward completion and then walking
   out of a building that no longer exists. Returns what it had to abandon. */
function _rtsProdRecalc(side) {
  var G = window._rtsG, S = G.sides[side], lost = [], cat;
  for (cat in S.q) {
    var q = S.q[cat];
    if (q && !_rtsCanProduce(side, q.key)) { lost.push(q.key); _rtsCancel(side, cat); }
  }
  /* A finished building still waiting to be placed needs a yard to come out of. */
  if (S.ready && !_rtsHas(side, 'yard')) {
    var rd = rtsStructDef(S.ready);
    if (rd) _rtsGrant(S, S.readyPaid == null ? _rtsCostOf(side, rd) : S.readyPaid);
    S.readyPaid = null;
    lost.push(S.ready);
    S.ready = null; S.readyTry = 0;
  }
  return lost;
}
/* How many buildings are actually producing this category. In RA a FactoryClass belongs to
   a BUILDING, so a house with two war factories genuinely builds two things at once; here
   there is one queue per category, which is right for the PLAYER - the classic sidebar works
   exactly that way - but for the opponent it meant a second war factory and a second barracks
   did nothing whatsoever.

   That is not a cosmetic waste. Measured on hard at five minutes, the opponent sits at every
   structure limit (refinery 4, barracks 2, factory 2, turret 12), so _rtsAIWants returns null
   and the structure line is permanently idle, while the unit lines run at 0% idle and cannot
   absorb the income. The result was 28,576 banked credits it had no way to spend.

   Scaling the build RATE by the number of producing buildings keeps the single queue - and
   therefore the whole sidebar model - while making the second factory mean something. Cost
   scales with rate automatically, so the money is genuinely spent rather than conjured. */
function _rtsLines(side, cat) {
  if (side === 'player') return 1;               /* the sidebar is one line per category */
  var G = window._rtsG, key = cat === 'infantry' ? 'barracks' : (cat === 'vehicle' ? 'factory' : null);
  if (!key) return 1;
  var n = 0;
  for (var i = 0; i < G.ents.length; i++) {
    var e = G.ents[i];
    if (!e.dead && !e.building && !e.selling && e.side === side && e.def === key) n++;
  }
  /* Patch 3.03 capped this at two: "speeding production by building multiple factories of the
     same type has been limited to only 2 factories". RTS_AI_MAX_LINES was already 2, picked
     independently - which is a pleasant confirmation rather than a change. */
  return Math.max(1, Math.min(RTS_AI_MAX_LINES, n));
}
function _rtsTickProduction(side, dt) {
  var G = window._rtsG, S = G.sides[side], pf = _rtsPowerFactor(side), cat;
  for (cat in S.q) {
    var q = S.q[cat]; if (!q || q.hold) continue;  /* a suspended line spends nothing */
    var rate = dt / q.total * pf * _rtsLines(side, cat);   /* fraction of the job done this step */
    /* Cost_Per_Tick(): `min(cost, Balance)`. Charging `cost * rate` without that clamp
       systematically OVERCHARGES, because the final tick's rate overshoots the job - measured
       at up to 1.21 credits on an 800-credit tank, always over and never under. Driving the
       charge off the outstanding balance is both the original's rule and the only way the
       total can come out exactly equal to the price. */
    if (q.bal === undefined) q.bal = Math.max(0, q.cost - q.paid);   /* a save from before this */
    var want = Math.min(q.bal, q.cost * rate);
    var purse = rtsMoney(S);
    /* The stall is for being BROKE, and only for being broke. Testing `want <= 0` instead
       deadlocks the line the moment the balance is paid off: rounding lets `bal` reach zero a
       tick before `prog` reaches one, `want` becomes zero, and the `continue` skips the
       completion check below - forever. Measured: the opponent sat on a finished harvester at
       `prog=1.000, bal=0.0, paid=1400.0` for the whole match and never built anything again.
       The unit suite missed it completely, because it asserted on money paid and never on the
       unit arriving. */
    if (want > purse) {
      want = purse;
      rate = q.cost > 0 ? want / q.cost : rate;
      if (want <= 0) continue;                      /* nothing at all in the treasury */
    }
    _rtsSpend(S, want); q.paid += want; q.bal = Math.max(0, q.bal - want); q.prog += rate;
    if (q.prog >= 1) {
      /* "If the production has completed... House->Spend_Money(Balance); Balance = 0" - the
         rounding residue is settled at the end so the job costs exactly what it was priced
         at, however the rate wandered on the way. */
      if (q.bal > 0) { var last = _rtsSpend(S, q.bal); q.paid += last; q.bal = 0; }
      S.q[cat] = null;
      /* PurchasePrice: what was ACTUALLY paid follows the building, so a refund later is not
         computed from a sticker price the buyer never paid. It matters because CostBias is
         real - an opponent on `hard` pays 0.8x - and refunding half of full price handed it a
         62% return on every sale while the player got 50%. */
      if (cat === 'struct') { S.ready = q.key; S.readyPaid = q.paid; }
      else _rtsDeliverUnit(side, q.key);
      if (side === 'player' && typeof _rtsSfx === 'function') _rtsSfx(cat === 'struct' ? 'ready' : 'unitready');
    }
  }
}
function _rtsDeliverUnit(side, key) {
  var G = window._rtsG, u = rtsUnitDef(key);
  if (G.justBuilt) G.justBuilt[side].unit = key;   /* HouseClass::JustBuiltUnit */
  var src = _rtsHas(side, u.kind === 'infantry' ? 'barracks' : 'factory') || _rtsHas(side, 'yard');
  if (!src) return null;
  return _rtsSpawnAt(side, key, src);
}

/* ------------------------------------------------------------- orders */
function _rtsOrderMove(e, x, z, attackMove) {
  if (e.type !== 'unit') return;
  e.order = attackMove ? 'amove' : 'move';
  e.target = null; e.hstate = null;
  e.goal = { x:x, z:z };                       /* remembered so a blocked repath keeps aiming here */
  e.path = _rtsPath(e.x, e.z, x, z); e.pi = 0;
  if (!e.path) { e.order = null; }
}
/* Ordering infantry onto a friendly transport is a board order, not an attack - the original
   runs it over the radio (RADIO_TRYING_TO_LOAD / RADIO_ROGER). The passenger walks there and
   boards when it arrives, which is handled in the move completion below. */
function _rtsOrderBoard(inf, t) {
  if (!_rtsCanBoard(inf, t)) return false;
  inf.order = 'board'; inf.target = t; inf.hstate = null;
  inf.goal = { x:t.x, z:t.z };
  inf.path = _rtsPath(inf.x, inf.z, t.x, t.z); inf.pi = 0;
  return true;
}
function _rtsOrderAttack(e, tgt) {
  if (e.type !== 'unit') return;
  var d = rtsUnitDef(e.def);
  if (!d.weapon) { _rtsOrderMove(e, tgt.x, tgt.z, false); return; }
  /* "Dogs can only attack infantrymen" - INFANTRY.CPP downgrades ACTION_ATTACK to ACTION_NONE
     rather than letting the order stand, so ordering a dog onto a tank is a move order. */
  var _ow = RTS_WEAPONS[d.weapon];
  if (_ow && _ow.maul && !(tgt.type === 'unit' && (rtsUnitDef(tgt.def) || {}).kind === 'infantry')) {
    _rtsOrderMove(e, tgt.x, tgt.z, false); return;
  }
  e.order = 'attack'; e.target = tgt; e.hstate = null;
  e.goal = { x:tgt.x, z:tgt.z };
  e.path = _rtsPath(e.x, e.z, tgt.x, tgt.z); e.pi = 0;
}
function _rtsOrderHarvest(e, tx, tz) {
  var d = rtsUnitDef(e.def);
  if (!d.harvest) return;
  e.order = 'harvest'; e.target = null;
  e.htile = (tx != null) ? { tx:tx, tz:tz } : null;
  e.hstate = e.carry >= d.capacity ? 'toRef' : 'toField';
  e.path = null;
}

/* ---------------------------------------------------------- difficulty --
   RULES.CPP's DifficultyClass is applied to a whole HOUSE, not to individual units, and it
   is a set of multipliers rather than special-case code. Everything the enemy does goes
   through _rtsBias; the player's side always gets the identity table, so a bias can never
   silently change how your own units behave. */
var _RTS_NOBIAS = { name:'Player', iq:5, fire:1, speed:1, armor:1, rof:1, cost:1, build:1, wall:true, scan:true };
/* A crate bonus lives on the UNIT that picked it up, multiplying the house-wide bias rather
   than replacing it. `_rtsBias` answers for a whole side and is difficulty; this answers for
   one object and is what it has found lying around. A unit with no bonuses costs one property
   lookup, which is why this is a plain function rather than a merged object built per call. */
function rtsCrateMult(e, what) {
  var c = e && e.cr;
  return (c && c[what]) ? c[what] : 1;
}
function _rtsBias(side) {
  if (side !== 'enemy') return _RTS_NOBIAS;
  var G = window._rtsG;
  return (G && RTS_DIFF[G.diff]) || RTS_DIFF[RTS_DIFF_DEFAULT];
}
/* Is an AI behaviour switched on at the current IQ? RULES.CPP gates each one separately, so
   a weak opponent is missing nameable abilities rather than just doing less damage. */
function _rtsIQAt(level) { return _rtsBias('enemy').iq >= level; }
/* CostBias / BuildSpeedBias, applied wherever a price or a build time is read. */
function _rtsCostOf(side, def) { return Math.round(def.cost * _rtsBias(side).cost); }
function _rtsBuildTimeOf(side, def) { return Math.max(0.1, def.build * _rtsBias(side).build); }

/* ------------------------------------------------------------- combat */
function _rtsDist(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }
/* Structures are big: measure to the edge of the footprint, not the centre, or nothing
   can ever shoot a 5x5 refinery from its stated range. */
function _rtsRangeTo(a, b) {
  var d = _rtsDist(a, b);
  if (b.type === 'struct') { var sd = rtsStructDef(b.def); d -= Math.min(sd.w, sd.h) * RTS_TILE * 0.45; }
  return Math.max(0, d);
}
function _rtsEnemyOf(side) { return side === 'player' ? 'enemy' : 'player'; }
/* Base centres are needed once per candidate but cost a pass over every structure, so they
   are cached and refreshed on the visibility clock rather than recomputed per lookup. */
function _rtsZoneCache() {
  var G = window._rtsG;
  if (!G.zc || G.t - G.zcT > 0.5) {
    G.zc = { player:_rtsBaseCentre('player'), enemy:_rtsBaseCentre('enemy') };
    G.zcT = G.t;
  }
  return G.zc;
}
/* TECHNO.CPP Evaluate_Object. The target scan scores candidates rather than just measuring
   how far away they are, which is the difference between an army that shoots whatever it
   bumps into and one that picks off the harvester. */
function _rtsEvalObject(e, o, dist, w, force) {
  var d = rtsStructDef(o.def) || rtsUnitDef(o.def);
  if (!d) return 0;
  /* "If the object is in a harmless state, don't bother to consider it a threat." A
     harvester on the ore is not what an auto-acquiring gun should turn to face while
     something armed is in range - though a player who right-clicks one still gets it, and
     it is still worth a great deal once chosen. */
  if (!force && o !== e.target && _rtsMission(o).noThreat) return 0;
  /* A weapon that cannot hurt the thing at all should never choose it - and for a
     two-weapon object the question is asked of its BEST weapon against this armour, or a
     tank would refuse to look at infantry its coaxial gun handles perfectly well. */
  if (!w) w = _rtsPickWeapon(e, o);
  if (w && !rtsVerses(w, o)) return 0;

  /* Value() = Risk + Reward, plus Crew.Kills - a unit that has been killing things is worth
     shooting first.

     Points stand in as cost, with hit points as a floor. The floor is load-bearing, not
     decoration: the Command Yard is free, so cost alone values the most important building
     in the game at ZERO, and a zero-valued candidate is discarded outright. Nothing could
     target a construction yard at all - measured, the Commando AI ran to 179 units and 27
     buildings while an idle player calmly survived eight minutes, because neither side could
     shoot the other's yard. */
  var value = Math.max(d.cost, d.hp || 0) + (o.kills || 0) * RTS_KILL_VALUE;

  var zc = _rtsZoneCache();
  /* Outside the protective umbrella of its OWN base: a straggler is a soft target. */
  if (_rtsWhichZone(zc[o.side], o.x, o.z) < 0) value *= RTS_EXPOSED_MULT;
  /* NervousBias: ...and something that has got inside MY base matters more than the same
     thing sitting in a field somewhere. */
  if (_rtsWhichZone(zc[e.side], o.x, o.z) >= 0) value *= RTS_NERVOUS_BIAS;

  /* Area_Modify is deliberately NOT implemented. It halves a candidate's value for each
     friendly building near it, so a suppressed weapon stops lobbing high explosive into its
     own base - but it is gated on a per-weapon `IsSupressed` flag that only a few RA weapons
     carry, and this game has no equivalent data. Mapping it onto "any splash weapon" was the
     obvious guess and it is wrong: measured, it drove the value of a target standing INSIDE
     your own base down to 640k against 1.28M for the same unit in open ground, exactly
     inverting NervousBias and leaving the base undefended. Without the flag, the rule does
     more harm than the friendly fire it prevents. */
  if (value <= 0) return 0;
  /* Lessen threat as a factor of distance - LINEAR in cells. The squared version is sitting
     right there in the original, commented out; the shipped line is this one. */
  return Math.max(1, (value * RTS_THREAT_SCALE) / (dist / RTS_TILE + 1));
}
function _rtsFindTarget(e, range, w) {
  var G = window._rtsG, foe = _rtsEnemyOf(e.side), best = null, bv = 0;
  for (var i = 0; i < G.ents.length; i++) {
    var o = G.ents[i];
    if (o.dead || o.side !== foe || o.inside) continue;
    /* "Dogs can only attack infantrymen" - INFANTRY.CPP turns ACTION_ATTACK into ACTION_NONE
       against anything else. Without this a dog with a one-bite kill would delete tanks. */
    if (w && w.maul && !(o.type === 'unit' && (rtsUnitDef(o.def) || {}).kind === 'infantry')) continue;
    var dist = _rtsRangeTo(e, o);
    if (dist > range) continue;
    var v = _rtsEvalObject(e, o, dist, w);
    if (v > bv) { bv = v; best = o; }
  }
  return best;
}
/* TECHNO.CPP What_Weapon_Should_I_Use. Every weapon this object carries is scored against
   the candidate's armour - `Modifier[armor] * 1000`, DOUBLED when the target is already in
   that weapon's range, and zeroed outright when it could not fire at all. Highest wins, and
   the primary wins ties (the original returns 0 unless `w2 > w1` strictly).

   The doubling is the interesting half: it biases toward the weapon that can shoot NOW over
   the one that would be better after driving closer. */
function _rtsGuns(e) {
  var d = (e.type === 'struct') ? rtsStructDef(e.def) : rtsUnitDef(e.def);
  var out = [];
  if (d && d.weapon) out.push(RTS_WEAPONS[d.weapon]);
  if (d && d.weapon2) out.push(RTS_WEAPONS[d.weapon2]);
  return out;
}
function _rtsPickWeapon(e, tgt) {
  var ws = _rtsGuns(e);
  if (ws.length < 2) return ws[0];
  var dist = _rtsRangeTo(e, tgt), best = ws[0], bv = -1;
  for (var i = 0; i < ws.length; i++) {
    var w = ws[i], mod = rtsVerses(w, tgt);
    var v = mod * 1000;
    if (dist <= w.range) v *= 2;
    if (!mod) v = 0;                                  /* FIRE_CANT */
    if (v > bv) { bv = v; best = w; }
  }
  return best;
}
/* The longest reach this object has, for "should I even look over there" questions. */
function _rtsReach(e) {
  var ws = _rtsGuns(e), r = 0;
  for (var i = 0; i < ws.length; i++) if (ws[i].range > r) r = ws[i].range;
  return r;
}
/* Threat_Range: 0 means "use weapon range", 1 means area guard - twice the weapon range,
   clamped. Every sight radius in this game is already inside the clamp, so it never binds
   here; it is kept because the clamp is the rule, not the current unit table. */
function _rtsThreatRange(e, control, w) {
  var reach = w ? w.range : 0;
  if (control === 0) return reach;
  return Math.min(reach * 2, RTS_THREAT_MAX_CELLS * RTS_TILE);
}
/* TURRET.CPP Fire_Direction / Fire_Coord. A shot leaves the MUZZLE, and the muzzle is on
   whichever facing actually carries the weapon: the turret's for a turreted vehicle, the
   hull's for everything else. Spawning shots at the object's centre is what makes a tank
   with its gun swung 90 degrees appear to fire sideways out of its own flank while the
   barrel points somewhere else entirely - the turret is drawn separately, so the mismatch
   is plainly visible. Barrel reach is derived from the body radius rather than a new table:
   a turret overhangs its hull, a hull-mounted gun sits inside the body. */
/* The bearing the WEAPON is pointing - which is the bearing Can_Fire tested before allowing
   the shot, so it is the one the shell has to leave along. A structure aims by turning its
   whole self (`e.rot`); every armed unit aims with `e.turret`, whether or not it has a turret
   drawn separately. (An earlier pass used the hull bearing for units without a drawn turret,
   which put a buggy's muzzle flash on its nose while Can_Fire was gating on a bearing that
   could be ninety degrees away.) */
function _rtsMuzzleAngle(e) {
  return e.type === 'struct' ? e.rot : e.turret;
}
function _rtsFireCoord(e, w) {
  var reach;
  if (e.type === 'struct') reach = RTS_MUZZLE_STRUCT;
  else {
    var d = rtsUnitDef(e.def);
    reach = (d.r || 1) * (RTS_TURRETED[e.def] ? RTS_MUZZLE_TURRET : RTS_MUZZLE_HULL);
  }
  var a = _rtsMuzzleAngle(e);
  var x = e.x + Math.cos(a) * reach, z = e.z + Math.sin(a) * reach;
  /* PrimaryLateral: the coordinate steps sideways off the barrel line, to the LEFT or the
     RIGHT depending on IsSecondShot. That is how a two-barrel weapon visibly alternates. */
  if (w && w.burst > 1) {
    var s = (e.second === false ? 1 : -1) * RTS_MUZZLE_LATERAL;
    x += Math.cos(a + Math.PI / 2) * s;
    z += Math.sin(a + Math.PI / 2) * s;
  }
  return { x:x, z:z };
}
function _rtsFire(e, tgt, w) {
  var G = window._rtsG, bias = _rtsBias(e.side);
  /* Rearm_Delay + Is_Two_Shooter. A burst weapon does NOT reload evenly: the delay assigned
     after each shot alternates, so shots arrive as a fast pair and then a long wait, rather
     than as a metronome. `IsSecondShot` starts true, so the first shot of a fresh unit takes
     the full ROF and the pair forms after it. Recoil_Adjust's lateral offset rides the same
     flag - a two-barrel weapon alternates sides, which is where the visible stagger in a
     salvo comes from. */
  if (w.burst > 1) {
    e.cool = (e.second === false ? RTS_BURST_DELAY : w.cool * bias.rof * rtsCrateMult(e, 'rof'));
    e.second = (e.second === false);
  } else {
    e.cool = w.cool * bias.rof * rtsCrateMult(e, 'rof'); e.second = true;  /* ROFBias: higher = slower reload */
  }
  e.fire = 0.09;
  e.recoil = RTS_RECOIL_TIME;                     /* Recoil_Adjust */
  var m = _rtsFireCoord(e, w);
  /* "If a projectile was fired from a unit that is hidden in the darkness, reveal that unit
     and a little area around it." The muzzle flash gives away the shooter. */
  if (e.side !== 'player' && !_rtsVisible(_rtsTX(e.x), _rtsTX(e.z))) e.spot = RTS_MUZZLE_SPOT;
  if (typeof _rtsSfx === 'function') _rtsSfx(w.shot === 'tracer' ? (w.dmg > 7 ? 'mg' : 'rifle')
    : (w.shot === 'missile' ? 'rocket' : (e.type === 'struct' ? 'turretgun' : 'cannon')), e.x, e.z);
  var dmg = w.dmg * rtsVerses(w, tgt) * bias.fire * rtsCrateMult(e, 'fire');
  if (w.speed <= 0) {
    _rtsDamage(tgt, dmg, e);
    G.fx.push({ kind:'tracer', x:m.x, y:1.3, z:m.z, x2:tgt.x, y2:1.3, z2:tgt.z, t:0 });
    _rtsCombatAnim(dmg, tgt.x, tgt.z, 0.5, tgt);
  } else {
    /* Fire_Direction: the shot leaves ALONG THE BARREL. Can_Fire only insists the barrel is
       within FIRE_FACING (~11 degrees) of the mark, so a dumb shell departs at whatever
       angle the turret happens to be sitting at and flies straight - it does not curve onto
       the target. That tolerance now has consequences: a tank shooting at something fast and
       close can genuinely miss. Missiles still home, which is exactly why Can_Fire is four
       times more forgiving about their facing (`diff >>= 2`).

       Flight is bounded by the distance to the mark rather than a flat four seconds, so a
       miss detonates near where it was aimed instead of sailing off across the map and
       exploding in somebody else's base. */
    var a = _rtsMuzzleAngle(e);
    var reach = Math.hypot(tgt.x - m.x, tgt.z - m.z);
    G.proj.push({ kind:w.shot, x:m.x, y:1.4, z:m.z,
      vx:Math.cos(a) * w.speed, vz:Math.sin(a) * w.speed,
      speed:w.speed, tgt:tgt, dmg:dmg, splash:w.splash, side:e.side,
      life:Math.min(4, reach / w.speed + RTS_SHELL_OVER), w:w, from:e });
  }
}
/* INFANTRY.CPP Fear_AI + Scatter. Only infantry have this.

   IsCrawling, from IDATA.CPP: not every infantry type HAS prone artwork. The Dog, Engineer,
   Spy and Thief are all constructed with `is_crawling = false`, and a type with no crawl frames
   must never enter the state - it would be lying about what it is doing. */
function _rtsFearAI(e, dt) {
  var d = rtsUnitDef(e.def);
  /* Fear DECAYS for everyone, including the types that never act on it. Gating this whole
     function on IsFraidyCat was a real bug: a specialist's fear ratcheted up on every hit and
     never came down, and anything downstream that reads a fear threshold then saw a
     permanently terrified unit. Measured, it made the Attack Dog markedly worse at the one
     job it has - 60 hp of damage in six seconds instead of a kill. Only the RESPONSE is
     type-gated. */
  if (e.fear > 0) e.fear = Math.max(0, e.fear - RTS_FEAR_DECAY * dt);
  if (!d || d.fraidy === false) { e.prone = 0; return; }
  if (e.prone) {
    if (e.fear < RTS_FEAR.ANXIOUS || d.crawl === false) e.prone = 0;
  } else if (e.fear >= RTS_FEAR.ANXIOUS && !e.path && d.crawl !== false) {
    e.prone = 1;                     /* do not drop while actually travelling somewhere */
  }
}
function _rtsScatter(e, fromX, fromZ) {
  var G = window._rtsG;
  /* MissionControl IsScatter. A unit holding a position stands its ground - being shoved off
     it by every near miss is exactly what a hold order exists to prevent. */
  if (!_rtsMission(e).scatter) return;
  /* Specialists never scatter. _rtsDamage calls this on EVERY hit, so a directed unit walking
     into a defended base has its path rewritten to a random nearby cell several times a second
     and never arrives - measured, a commando ordered onto an enemy barracks orbited it for ten
     seconds at a steady 12-14 units while her goal was rewritten each time she was shot. Fear
     was the obvious suspect and was not the cause; this was. */
  var _sd = rtsUnitDef(e.def);
  if (_sd && _sd.fraidy === false) return;
  var a = Math.atan2(e.z - fromZ, e.x - fromX);
  a += (_rtsRnd() - 0.5) * (Math.PI / 2);      /* Random_Pick(0,4)-2 facings of spread */
  var d = RTS_TILE * (1.5 + _rtsRnd());
  var gx = e.x + Math.cos(a) * d, gz = e.z + Math.sin(a) * d;
  var tx = _rtsTX(gx), tz = _rtsTX(gz);
  if (!_rtsInB(tx, tz) || _rtsBlocked(tx, tz)) return;
  e.path = [{ x:gx, z:gz }]; e.pi = 0; e.goal = { x:gx, z:gz };
}

function _rtsAttacked(side) {
  var G = window._rtsG;
  if (side === 'enemy') { G.ai.lastHit = G.t; return; }
  var last = (G.playerHit == null) ? -999 : G.playerHit;
  if (G.t - last < RTS_ALERT_DELAY) return;      /* SpeakDelay - and do NOT restart the clock,
                                                    or a sustained attack never warns twice */
  G.playerHit = G.t;
  _rtsSay('Your base is under attack!');
  if (typeof _rtsSfx === 'function') _rtsSfx('alert');
}
/* TECHNO.CPP Base_Is_Attacked. "This routine will pull units off of the field and send them
   back to defend the base. This routine will make taking an enemy base much more difficult."
   It is exactly that: raid a defended base and its army comes home.

   Humans deal with their own base-is-attacked problems, so this only ever runs for the AI.
   A building that can shoot back does not overreact, and a BaseAttackTimer on the attacker
   stops one long firefight from recalling the whole army over and over. */
function _rtsBaseIsAttacked(bldg, enemy) {
  var G = window._rtsG;
  if (bldg.side !== 'enemy' || !enemy || enemy.type !== 'unit') return 0;
  if (rtsStructDef(bldg.def).weapon) return 0;     /* it can defend itself */
  if (enemy.baseTimer && G.t < enemy.baseTimer) return 0;

  /* "We will need units to defend our base. We need to suspend teams until the situation has
     been dealt with." Below the survival priority a team is disbanded outright and its
     members freed - which is where most of the defenders actually come from. */
  _rtsSuspendTeams(RTS_SUSPEND_PRIORITY);

  /* "desired" is how much defence to throw at it: the attacker's risk scaled by tech level.
     Risk stands in as cost here, the same substitution Evaluate_Object uses for Value. */
  var desired = rtsUnitDef(enemy.def).cost, pool = [], i;
  for (i = 0; i < G.ents.length; i++) {
    var u = G.ents[i];
    if (u.dead || u.side !== 'enemy' || u.type !== 'unit') continue;
    var ud = rtsUnitDef(u.def);
    if (!ud.weapon || ud.harvest) continue;
    /* "Never recruit sticky guard units to defend a base." */
    if (!_rtsMission(u).recruitable) continue;
    var w = RTS_WEAPONS[ud.weapon];
    /* "Don't allow a response if it doesn't have a weapon that will affect the enemy." */
    if (!rtsVerses(w, enemy)) continue;
    /* Already fighting this attacker? Then it is part of the answer, not part of the ask. */
    if (u.target === enemy) { desired -= ud.cost; continue; }
    /* Threat it can apply, best when it is close - Rescue_Mission's ranking, in spirit. */
    pool.push({ u:u, v:ud.cost * 1000 / (_rtsRangeTo(u, bldg) / RTS_TILE + 1) });
  }
  if (desired <= 0 || !pool.length) return 0;

  pool.sort(function (a, b) { return b.v - a.v; });
  var sent = 0, risk = 0;
  for (i = 0; i < pool.length && i < RTS_DEFENDERS; i++) {
    var p = pool[i];
    /* "Alternates between guard area and attack" - half go straight for the attacker, half
       take up station on the building being hit. A pure charge leaves the base empty again
       the moment the raider dies. */
    if (_rtsRnd() < 0.5) _rtsOverrideMission(p.u, 'attack', enemy);
    else {
      _rtsOverrideMission(p.u, 'amove', null);
      _rtsOrderMove(p.u, bldg.x + (_rtsRnd() - 0.5) * RTS_TILE * 4,
                         bldg.z + (_rtsRnd() - 0.5) * RTS_TILE * 4, true);
    }
    sent++;
    risk += rtsUnitDef(p.u.def).cost;
    if (risk > desired) break;
  }
  /* BaseDefenseDelay: once enough has been committed, this attacker stops re-triggering. */
  if (risk > desired) enemy.baseTimer = G.t + RTS_BASE_DEFENSE_DELAY;
  return sent;
}
/* MISSION.CPP Override_Mission / Restore_Mission. A temporary order remembers the one it
   interrupted, and puts it back when it is done. Base_Is_Attacked recalls units to defend
   and previously just overwrote their orders, so an army pulled home to swat one raider
   simply forgot it had been going anywhere - it stood in the base for the rest of the match. */
function _rtsOverrideMission(e, order, tgt) {
  if (!e || e.dead) return false;
  if (e.susp === undefined || e.susp === null) {
    e.susp = { order:e.order || null, goal:e.goal ? { x:e.goal.x, z:e.goal.z } : null };
  }
  e.order = order; e.target = tgt || null; e.path = null;
  return true;
}
function _rtsRestoreMission(e) {
  if (!e || e.susp == null) return false;
  var s = e.susp; e.susp = null;
  if (!s.order) { e.order = null; e.goal = null; e.path = null; return true; }
  if (s.order === 'move' || s.order === 'amove') {
    if (s.goal) { _rtsOrderMove(e, s.goal.x, s.goal.z, s.order === 'amove'); return true; }
  }
  e.order = s.order; e.path = null;
  return true;
}
/* MISSION.CPP MissionControl: the flag table for whatever this object is currently doing.
   Get_Mission returns the queued mission when there is no active one, so an object with no
   order is on GUARD rather than in some nameless idle state. */
function _rtsMission(e) {
  if (!e) return RTS_MISSION_DEFAULT;
  var m = e.order || (e.hstate ? 'harvest' : 'guard');
  return RTS_MISSIONS[m] || RTS_MISSION_DEFAULT;
}
/* TECHNO.CPP Is_Allowed_To_Retaliate. Shooting back is not automatic. */
function _rtsCanRetaliate(tgt, from) {
  if (!from || !from.side) return false;                    /* no source, no retaliation */
  if (tgt.dead || tgt.type !== 'unit') return false;
  if (from.side === tgt.side) return false;                 /* never against an ally */
  if (!_rtsMission(tgt).retaliate) return false;            /* "If the mission precludes it" */
  var d = rtsUnitDef(tgt.def);
  if (!d || !d.weapon) return false;
  var w = RTS_WEAPONS[d.weapon];
  /* "Don't allow retaliation if it isn't equipped with a weapon that can deal with the
     threat" - a Modifier of zero against that armour means shooting back is pointless. */
  if (!rtsVerses(w, from)) return false;
  /* Idle: always turn and fight. */
  if (!tgt.order) return true;
  /* Already busy: "Compare potential threat of the current target and the potential new
     target. Don't retaliate if it is currently attacking the greater threat." The original
     only bothers half the time, which is what stops a firefight turning into every unit
     spinning between whoever shot last. */
  if (_rtsRnd() < 0.5) return false;
  if (!tgt.target || tgt.target.dead) return true;
  var dn = _rtsRangeTo(tgt, from), dc = _rtsRangeTo(tgt, tgt.target);
  return _rtsEvalObject(tgt, from, dn, w) > _rtsEvalObject(tgt, tgt.target, dc, w);
}
function _rtsDamage(tgt, dmg, from, floor) {
  if (!tgt || tgt.dead) return;
  /* The dog rule, ahead of every modifier because in the original it replaces the damage
     rather than scaling it. See `maul` on the bite weapon in rts.rules.js. */
  if (from && from.type === 'unit' && !from.dead) {
    var _fw = RTS_WEAPONS[(rtsUnitDef(from.def) || {}).weapon];
    if (_fw && _fw.maul) {
      if (from.target !== tgt) return;              /* a dog spills nothing onto bystanders */
      /* Infantry only, enforced HERE and not just at acquisition. _rtsFindTarget already skips
         vehicles, but a forced order - a player right-click, a script - walks straight past
         that, and a one-bite kill that reaches a tank is a 200-credit answer to a 1700-credit
         one. In the original the order simply cannot be given (ACTION_ATTACK becomes
         ACTION_NONE); making the damage refuse as well means no route can get around it. */
      if (!(tgt.type === 'unit' && (rtsUnitDef(tgt.def) || {}).kind === 'infantry')) return;
      tgt.hp = 0; tgt.hitT = 0.18;
      if (from.side) tgt.hurtBy = from.side;
      if (from.side !== tgt.side) from.kills = (from.kills || 0) + 1;
      if (from.side !== tgt.side) _rtsTrigNotify('attacked', tgt, null);
      _rtsKill(tgt);
      return;
    }
  }
  if (tgt.prone) dmg *= RTS_PRONE_DAMAGE;
  dmg /= _rtsBias(tgt.side).armor;                 /* ArmorBias defends the whole house */
  dmg /= rtsCrateMult(tgt, 'armor');               /* ...and a crate defends one unit */
  /* Modify_Damage clamps last. The MinDamage floor is NOT unconditional - it applies to a
     direct hit and to the inner ring of a blast, so two units can never plink zeroes at each
     other, while the edge of an explosion is still allowed to do nothing at all. */
  if (floor !== false) dmg = Math.max(RTS_MIN_DAMAGE, dmg);
  dmg = Math.min(RTS_MAX_DAMAGE, dmg);
  tgt.hp -= dmg;
  tgt.hitT = 0.18;
  /* an idle unit that gets shot shoots back instead of standing there */
  if (from && from.side) tgt.hurtBy = from.side;     /* WhoLastHurtMe, for the kill credit */
  /* HouseClass::Attacked(). A structure taking malicious damage puts its owner into the
     ATTACKED state for a minute, which several unrelated AI decisions then read - and, for
     the player, raises the warning, rate-limited by SpeakDelay. */
  if (tgt.type === 'struct' && from && from.side && from.side !== tgt.side) {
    _rtsAttacked(tgt.side);
    _rtsBaseIsAttacked(tgt, from);
  }
  if (from && from.side && from.side !== tgt.side) _rtsTrigNotify('attacked', tgt, null);
  if (tgt.type === 'unit' && tgt.sqd != null) _rtsTeamTookDamage(tgt, from);
  if (_rtsCanRetaliate(tgt, from)) { tgt.order = 'attack'; tgt.target = from; }
  if (tgt.hp <= 0) {
    /* Crew.Made_A_Kill: something that has killed becomes a hotter target itself. */
    if (from && from.side && from.side !== tgt.side) from.kills = (from.kills || 0) + 1;
    _rtsKill(tgt);
  }
  else if (tgt.type === 'unit' && rtsUnitDef(tgt.def).harvest && tgt.carry > 0
           && tgt.hp <= tgt.maxHp * RTS_COND_YELLOW && tgt.hstate && tgt.hstate !== 'unload') {
    /* Take_Damage: a damaged harvester with a load aboard heads for the refinery rather than
       sitting in the open finishing its mining run. */
    tgt.hstate = 'toRef'; tgt.path = null;
  }
  else if (tgt.type === 'unit' && rtsUnitDef(tgt.def).kind === 'infantry') {
    /* Fear climbs faster the more hurt the soldier already is. */
    if (tgt.fear < RTS_FEAR.SCARED) tgt.fear = RTS_FEAR.SCARED;
    else {
      var more = RTS_FEAR.ANXIOUS, hr = tgt.hp / tgt.maxHp;
      if (hr > RTS_COND_RED) more /= 2;
      if (hr > RTS_COND_YELLOW) more /= 2;
      tgt.fear = Math.min(RTS_FEAR.MAXIMUM, tgt.fear + more);
    }
    /* IQScatter: dodging incoming fire is a learned behaviour in RULES.CPP, not a reflex
       every soldier has. Yours always scatter; a low-IQ opponent's stand and take it. */
    if (from && (tgt.side !== 'enemy' || _rtsIQAt(RTS_IQ.scatter))) _rtsScatter(tgt, from.x, from.z);
  }
  else if (tgt.type === 'unit' && tgt.hp < tgt.maxHp * RTS_BURN_UNIT) _rtsIgnite(tgt);
  if (tgt.type === 'struct' && tgt.hp < tgt.maxHp * RTS_BURN_STRUCT) _rtsIgnite(tgt);
}
/* ANIM.CPP Attach_To + BuildingClass::Take_Damage. A badly hurt thing catches fire, the
   flame rides it, and the flame eats it.

   Structures burn too, and did not before - which is most of what this is for. A refinery
   on fire is one of the most recognisable sights in the game, and the old code lit units
   only. Which rung of ADATA's ladder it starts on comes from how big the thing is: a 3x3
   refinery gets `OnFireBig`, a 1x1 pillbox gets `OnFireSmall`.

   Re-igniting matters as much as igniting. The ladder burns DOWN - big to medium to small
   to smoke - so a building left alone smoulders out and stops taking damage. Hit it again
   while it is only smouldering and it goes back up to full size, which is what makes a
   sustained bombardment look and behave differently from one shell. */
function _rtsIgnite(tgt) {
  var G = window._rtsG;
  if (!tgt || tgt.dead) return null;
  var kind = 'firesmall', base = 0.75;
  if (tgt.type === 'struct') {
    var d = rtsStructDef(tgt.def), cells = d ? d.w * d.h : 1;
    kind = cells >= RTS_FIRE_BIG ? 'firebig' : (cells >= RTS_FIRE_MED ? 'firemed' : 'firesmall');
    /* Scaled off the footprint WIDTH, matching the flame a building already draws while it
       comes apart (`0.9 + def.w * 0.35` in the renderer) so a burning building and a dying
       one are the same fire at the same size. Scaled off cell COUNT instead, a 3x3 got only
       20% more flame than a 1x1 and the fire on a refinery read as a spark. */
    base = 0.6 + (d ? d.w : 1) * 0.55;
  }
  var rank = { firebig:3, firemed:2, firesmall:1, smoke:0 };
  /* Already alight: top the existing flame back up rather than stacking a second one on the
     same object. Stacking was the first version and it doubled the damage rate every hit. */
  if (tgt.burning) {
    for (var i = 0; i < G.fx.length; i++) {
      var f = G.fx[i];
      if (f.att !== tgt.id || rank[f.kind] === undefined) continue;
      if (rank[kind] > rank[f.kind]) {
        f.kind = kind; f.loops = RTS_ANIMS[kind].loops || 1; f.big = base * RTS_ANIMS[kind].size;
      }
      f.t = 0; f.mid = 0;
      return f;
    }
    tgt.burning = 0;          /* flagged alight with no flame left - the fx was reaped */
  }
  tgt.burning = 1;
  var nf = { kind:kind, x:tgt.x, y:1, z:tgt.z, t:0, base:base,
    big:base * RTS_ANIMS[kind].size, att:tgt.id, loops:RTS_ANIMS[kind].loops || 1 };
  G.fx.push(nf);
  return nf;
}
/* COMBAT.CPP Modify_Damage: the falloff is a DIVISION by distance, not a taper. Damage is
   brutal at the impact point and collapses as 1/d, and the MinDamage floor only applies
   within RTS_SPREAD_FLOOR steps - past that a blast is allowed to do literally nothing,
   which is the difference between "everyone nearby takes a point" and a real blast radius.

   Two rules from Explosion_Damage that matter as much as the curve:
   - a hit anywhere on a BUILDING's footprint counts as a direct hit on its centre, so a
     shell landing on the corner of a refinery is not quietly downgraded to a graze;
   - the blast damages everyone except whoever fired it. Friendly fire is real: park your
     own squad around a target and your rockets will kill them. */
function _rtsSplashSteps(d, spread, target, tx, tz) {
  if (target && target.type === 'struct') {
    var sd = rtsStructDef(target.def);
    if (tx >= target.tx && tx < target.tx + sd.w && tz >= target.tz && tz < target.tz + sd.h) return 0;
  }
  var steps = Math.round(d / RTS_TILE * (RTS_SPREAD_STEPS / Math.max(0.5, spread)));
  return Math.max(0, Math.min(RTS_SPREAD_MAX, steps));
}
function _rtsSplash(x, z, rad, dmg, side, spread, from) {
  var G = window._rtsG, tx = _rtsTX(x), tz = _rtsTX(z);
  spread = spread || 1;
  for (var i = 0; i < G.ents.length; i++) {
    var o = G.ents[i];
    if (o.dead || o === from) continue;
    var d = Math.hypot(o.x - x, o.z - z);
    if (d > rad) continue;
    var steps = _rtsSplashSteps(d, spread, o, tx, tz);
    var hit = steps ? dmg / steps : dmg;
    if (steps >= RTS_SPREAD_FLOOR && hit < RTS_MIN_DAMAGE) continue;   /* allowed to be nothing */
    _rtsDamage(o, hit, null, steps < RTS_SPREAD_FLOOR);
  }
  /* IsTiberiumDestroyer: Reduce_Tiberium(strength / 10). Shelling an ore field destroys it. */
  if (_rtsInB(tx, tz) && G.scrap[_rtsIdx(tx, tz)] > 0) {
    var oi = _rtsIdx(tx, tz);
    G.scrap[oi] = Math.max(0, G.scrap[oi] - (dmg / 10) * RTS_ORE_PER_LEVEL);
    if (G.scrap[oi] <= 0) { G.gems[oi] = 0; G.scrapDirty = true; }
  }
}

/* --------------------------------------------------------- unit update */
function _rtsSteer(e, dt, d) {
  /* Follow the current path with a capped turn rate, then push apart from neighbours.
     Separation runs after movement so units settle into a loose formation instead of
     stacking into a single point. */
  if (!e.path || e.pi >= e.path.length) { e.path = null; return false; }
  var wp = e.path[e.pi], dx = wp.x - e.x, dz = wp.z - e.z, dist = Math.hypot(dx, dz);
  var last = (e.pi === e.path.length - 1);
  if (dist < (last ? d.r * 0.9 + 0.4 : RTS_TILE * 0.55)) {
    e.pi++;
    if (e.pi >= e.path.length) { e.path = null; return false; }
    return true;
  }
  var want = Math.atan2(dz, dx), diff = want - e.rot;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  var turn = Math.min(Math.abs(diff), d.turn * dt) * (diff < 0 ? -1 : 1);
  e.rot += turn;
  /* a vehicle slows while it is still swinging round; infantry just walk */
  var align = Math.max(0, 1 - Math.abs(diff) / 1.6);
  var sp = d.speed * (d.kind === 'infantry' ? Math.max(0.35, align) : align * align);
  sp *= _rtsBias(e.side).speed;                    /* GroundspeedBias */
  sp *= rtsCrateMult(e, 'speed');
  if (e.prone) sp *= RTS_PRONE_SPEED;
  var nx = e.x + Math.cos(e.rot) * sp * dt, nz = e.z + Math.sin(e.rot) * sp * dt;
  /* While standing on a blocked tile, movement is unrestricted - that is how a unit
     extracts itself from a footprint it ended up inside. Blocking it here as well would
     make the escape waypoint unreachable and re-trap it. */
  var freeing = _rtsBlocked(_rtsTX(e.x), _rtsTX(e.z));
  if (!freeing && _rtsBlocked(_rtsTX(nx), _rtsTX(nz))) {
    e.stuck = (e.stuck || 0) + dt;
    /* Repath to the FINAL destination, not to the waypoint we happen to be blocked on.
       Repathing to the waypoint loses the real goal: a unit whose path was cut short (e.g.
       it started inside a footprint and only got an escape waypoint) would otherwise spend
       forever re-targeting the tile it is already standing on. */
    if (e.stuck > 0.5) {
      var g = e.goal || wp;
      e.path = _rtsPath(e.x, e.z, g.x, g.z); e.pi = 0; e.stuck = 0;
    }
    /* Last-resort unstick. A unit can end up genuinely wedged - pinned against a footprint
       by the units behind it, with every forward step blocked and every repath returning the
       same blocked line. After a few seconds of getting nowhere, lift it to the nearest open
       tile. Bounded and rare, and it beats a unit that ignores orders for the rest of the
       match; every real RTS has some version of this. */
    e.jam = (e.jam || 0) + dt;
    if (e.jam > 3) {
      var open = _rtsNearestOpen(_rtsTX(e.x), _rtsTX(e.z), 6);
      if (open) { e.x = _rtsWX(open[0]); e.z = _rtsWX(open[1]); }
      e.jam = 0; e.stuck = 0;
      var g2 = e.goal || wp;
      e.path = _rtsPath(e.x, e.z, g2.x, g2.z); e.pi = 0;
    }
    return true;
  }
  e.stuck = 0; e.jam = 0; e.x = nx; e.z = nz;
  return true;
}
function _rtsSeparate(dt) {
  var G = window._rtsG, i, j;
  var buckets = {}, cell = RTS_TILE * 2;
  for (i = 0; i < G.ents.length; i++) {
    var e = G.ents[i];
    if (e.dead || e.type !== 'unit') continue;
    var k = ((e.x / cell) | 0) + ':' + ((e.z / cell) | 0);
    (buckets[k] || (buckets[k] = [])).push(e);
  }
  for (var key in buckets) {
    var parts = key.split(':'), bx = +parts[0], bz = +parts[1], near = [];
    for (var ox = -1; ox <= 1; ox++) for (var oz = -1; oz <= 1; oz++) {
      var b = buckets[(bx + ox) + ':' + (bz + oz)];
      if (b) near = near.concat(b);
    }
    var mine = buckets[key];
    for (i = 0; i < mine.length; i++) {
      var a = mine[i];
      for (j = 0; j < near.length; j++) {
        var o = near[j];
        if (o === a || o.dead) continue;
        var dx = a.x - o.x, dz = a.z - o.z, d2 = dx * dx + dz * dz, min = a.r + o.r;
        if (d2 >= min * min || d2 < 1e-6) continue;
        var d = Math.sqrt(d2), push = (min - d) * 0.5;
        var ux = dx / d * push, uz = dz / d * push;
        var ax = a.x + ux, az = a.z + uz;
        /* If a is already standing on a blocked tile, take the push unconditionally - it is
           trying to get out. Refusing it there is what leaves the odd unit jammed inside a
           footprint while its neighbours shove it back in every frame. */
        if (_rtsBlocked(_rtsTX(a.x), _rtsTX(a.z)) || !_rtsBlocked(_rtsTX(ax), _rtsTX(az))) { a.x = ax; a.z = az; }
      }
    }
  }
}
function _rtsUpdateUnit(e, dt) {
  /* Cargo rides along. Their coordinates are kept in step with the transport rather than left
     where they boarded, so anything that reads a passenger's position - the unload ring, a
     save, a trigger - gets the truth instead of a stale spot on the map. */
  if (e.cargo && e.cargo.length) {
    for (var _ci = e.cargo.length - 1; _ci >= 0; _ci--) {
      var _p = e.cargo[_ci];
      if (!_p || _p.dead) { e.cargo.splice(_ci, 1); continue; }
      _p.x = e.x; _p.z = e.z; _p.rot = e.rot;
    }
  }
  var G = window._rtsG, d = rtsUnitDef(e.def), w = d.weapon ? RTS_WEAPONS[d.weapon] : null;
  if (e.cool > 0) e.cool -= dt;
  if (e.fire > 0) e.fire -= dt;
  if (e.recoil > 0) e.recoil -= dt;
  if (e.hitT > 0) e.hitT -= dt;
  if (e.spot > 0) e.spot -= dt;
  /* Specialists do not panic. Fear scatters ordinary infantry, which is right for a rifle
     squad and fatal for a directed one: measured, a commando ordered onto an enemy barracks sat
     at fear 49.75, went prone, and had her goal rewritten every second - she circled the
     building for ten seconds and never arrived. A unit you spent 1200 credits on and pointed at
     one specific target has to complete the job, or the verb does not exist in practice.

     A deliberate deviation, and the reference argues for it: the Commando "can never be put in
     guard mode - you must manually target all enemies that you wish attacked". These units are
     directed rather than autonomous, so autonomous self-preservation does not apply. */
  /* IsFraidyCat, from IDATA.CPP's Read_INI - panic is a DECLARED property of the type, not
     something inferred from what verbs a unit happens to carry. This used to read
     `!d.capture && !d.steal && !d.demo && !d.heals`, which produced the right answer for the
     wrong reason and would have mis-classified the next unit added. The flag is checked INSIDE
     _rtsFearAI rather than here, so that fear still decays for the types that ignore it. */
  if (d.kind === 'infantry') _rtsFearAI(e, dt);
  /* Overrun_Square runs BEFORE the engage logic: a tank that is holding position and firing
     returns early from this function, and hooking the crush on the end meant a stationary
     tank never ran anything over. */
  if (RTS_CRUSHERS[e.def]) _rtsOverrun(e);

  /* ---- harvester economy loop ---- */
  if (d.harvest) { _rtsUpdateHarvester(e, dt, d); return; }

  /* ---- Field Medic: a passive aura, not an order ----
     Runs every tick regardless of what the medic is doing, because a medic that stops healing
     while it walks is a medic nobody uses. "Cannot heal himself" comes straight from the
     reference and stops a pair of medics being an immortal blob. */
  if (d.heals) {
    for (var hi = 0; hi < G.ents.length; hi++) {
      var pt = G.ents[hi];
      if (pt === e || pt.dead || pt.type !== 'unit' || pt.side !== e.side) continue;
      if (pt.hp >= pt.maxHp || rtsUnitDef(pt.def).kind !== 'infantry') continue;
      if (Math.hypot(pt.x - e.x, pt.z - e.z) > d.heals) continue;
      pt.hp = Math.min(pt.maxHp, pt.hp + d.healRate * dt);
    }
  }

  /* ---- Thief: walk into an enemy refinery and leave with half their treasury ---- */
  if (d.steal) {
    var tb = e.target;
    if (e.order === 'capture' && (!tb || tb.dead || tb.type !== 'struct' || tb.side === e.side
        || tb.def !== d.stealFrom)) { e.order = null; e.target = null; e.path = null; }
    else if (e.order === 'capture') {
      if (_rtsAtStruct(e, tb)) { _rtsSteal(e, tb); return; }
      /* A CONSUMED path is not a null path: e.path stays truthy with e.pi past its end,
         so guarding on `!e.path` alone leaves the unit parked wherever the route ran out.
         Re-path whenever the route is spent and we are still not there. */
      if (!e.path || e.pi >= e.path.length) {
        var tap = _rtsApproach(e, tb);
        e.goal = tap; e.path = _rtsPath(e.x, e.z, tap.x, tap.z); e.pi = 0;
        if (!e.path) { e.order = null; e.target = null; return; }
      }
      _rtsSteer(e, dt, d); return;
    }
    if (e.path) { _rtsSteer(e, dt, d); if (!e.path) e.order = null; }
    return;
  }

  /* ---- Commando: C4 on any building she can reach ----
     She keeps her pistols, so this is NOT an early-return like the thief - only the demolition
     order is special-cased, and everything else falls through to the normal engage logic. */
  if (d.demo && e.order === 'demo') {
    var db = e.target;
    if (!db || db.dead || db.type !== 'struct' || db.side === e.side) { e.order = null; e.target = null; }
    else if (_rtsAtStruct(e, db)) { _rtsDemo(e, db); return; }
    else {
      /* A CONSUMED path is not a null path: e.path stays truthy with e.pi past its end,
         so guarding on `!e.path` alone leaves the unit parked wherever the route ran out.
         Re-path whenever the route is spent and we are still not there. */
      if (!e.path || e.pi >= e.path.length) {
        var dap = _rtsApproach(e, db);
        e.goal = dap; e.path = _rtsPath(e.x, e.z, dap.x, dap.z); e.pi = 0;
        if (!e.path) { e.order = null; e.target = null; return; }
      }
      _rtsSteer(e, dt, d); return;
    }
  }

  /* ---- engineer: walk to the target building and take it ----
     Placed before the engage block because an engineer has no weapon and must never be pulled
     into the "acquire something to shoot" path - it would stand there aiming at a tank. */
  if (d.capture) {
    var cb = e.target;
    if (e.order === 'capture' && (!cb || cb.dead || cb.type !== 'struct' || cb.side === e.side
        || !rtsCapturable(cb.def))) {
      e.order = null; e.target = null; e.path = null;
    } else if (e.order === 'capture') {
      if (_rtsAtStruct(e, cb)) { _rtsCapture(e, cb); return; }
      /* A CONSUMED path is not a null path: e.path stays truthy with e.pi past its end,
         so guarding on `!e.path` alone leaves the unit parked wherever the route ran out.
         Re-path whenever the route is spent and we are still not there. */
      if (!e.path || e.pi >= e.path.length) {
        var cap = _rtsApproach(e, cb);
        e.goal = cap;
        e.path = _rtsPath(e.x, e.z, cap.x, cap.z); e.pi = 0;
        /* No route to it - drop the order rather than stand still looking busy forever. */
        if (!e.path) { e.order = null; e.target = null; return; }
      }
      _rtsSteer(e, dt, d);
      return;
    }
    /* Not capturing: an engineer still walks, but never acquires a target. */
    if (e.path) { _rtsSteer(e, dt, d); if (!e.path) e.order = null; }
    return;
  }

  /* ---- boarding ---- */
  if (e.order === 'board') {
    var tr = e.target;
    if (!tr || tr.dead || !_rtsCanBoard(e, tr)) { e.order = null; e.target = null; e.path = null; }
    else if (_rtsRangeTo(e, tr) <= RTS_TILE * 1.6) { _rtsBoard(e, tr); return; }
    else {
      /* the transport moves, so the destination is re-aimed rather than pathed once */
      if (!e.path || Math.hypot(tr.x - e.goal.x, tr.z - e.goal.z) > RTS_TILE) {
        e.goal = { x:tr.x, z:tr.z };
        e.path = _rtsPath(e.x, e.z, tr.x, tr.z); e.pi = 0;
      }
    }
  }

  /* ---- engage ---- */
  var tgt = e.target;
  if (tgt && tgt.dead) {
    tgt = e.target = null;
    if (e.order === 'attack') { if (!_rtsRestoreMission(e)) e.order = null; }
  }
  /* An overridden mission that has run its course puts the old one back. Without this only
     the attack case ever restores, and the half of the defenders sent to stand guard would
     never resume what they were doing. */
  if (e.susp != null && !e.target && !e.path) _rtsRestoreMission(e);
  /* MISSION_STICKY holds ground: it acquires and fires, but never takes a chase order and
     never picks up a path. */
  if (e.order === 'hold') {
    e.path = null; e.goal = null;
    if (w && (!tgt || _rtsRangeTo(e, tgt) > _rtsReach(e))) e.target = tgt = _rtsFindTarget(e, _rtsReach(e));
  } else if (w && !tgt && (e.order === 'amove' || !e.order)) {
    tgt = _rtsFindTarget(e, d.sight);
    if (tgt) { e.target = tgt; if (!e.order) { e.order = 'attack'; e.path = null; } }
  }
  if (w) {
    /* Pick what we can actually shoot THIS frame: the ordered target when it is in range,
       otherwise whatever else already is. Without the fallback, a column marching on a
       distant building walks through turret fire without ever shooting back - which made
       an assault lose fifty tanks while killing one defender. */
    var shootAt = null, chasing = false;
    if (tgt) {
      if (_rtsRangeTo(e, tgt) <= _rtsReach(e)) shootAt = tgt;
      else { chasing = true; shootAt = _rtsFindTarget(e, _rtsReach(e)); }
    }
    if (shootAt) {
      /* What_Weapon_Should_I_Use, re-asked per target: a tank switches to its coaxial gun
         for infantry and back to the main gun for armour, without the player doing anything. */
      var fw = _rtsPickWeapon(e, shootAt);
      /* turret tracks its mark even while the hull is still swinging round */
      var ta = Math.atan2(shootAt.z - e.z, shootAt.x - e.x), td = ta - e.turret;
      while (td > Math.PI) td -= Math.PI * 2; while (td < -Math.PI) td += Math.PI * 2;
      var step = Math.min(Math.abs(td), RTS_TURRET_ROT * dt);
      e.turret += step * (td < 0 ? -1 : 1);
      e.tRot = Math.abs(td) > step + 1e-6;                /* still swinging */
      /* Can_Fire: FIRE_FACING unless the turret is lined up, and a homing weapon is four
         times more forgiving about it (Modify: `diff >>= 2`). A turret still rotating
         cannot fire at all unless its projectile homes - FIRE_ROTATING. */
      var tol = fw.speed > 0 && fw.shot === 'missile' ? RTS_FIRE_ANGLE * 4 : RTS_FIRE_ANGLE;
      var homing = fw.shot === 'missile';
      /* NoMovingFire (UDATA.CPP): some hulls cannot fire on the move. Rather than simply
         withholding the shot - which would leave artillery trundling past its target forever -
         a unit in range STOPS, and fires on the tick after it has halted. */
      var inRange = _rtsRangeTo(e, shootAt) <= fw.range;
      if (d.noMovingFire && inRange && e.path) { e.path = null; e.goal = null; }
      if (e.cool <= 0 && Math.abs(td) < tol && (homing || !e.tRot) && inRange
          && !(d.noMovingFire && e.path)) _rtsFire(e, shootAt, fw);
    } else if (!e.path) {
      /* no target: the turret returns to the hull's facing, as Rotation_AI does */
      var rd = e.rot - e.turret;
      while (rd > Math.PI) rd -= Math.PI * 2; while (rd < -Math.PI) rd += Math.PI * 2;
      e.turret += Math.min(Math.abs(rd), RTS_TURRET_ROT * 0.5 * dt) * (rd < 0 ? -1 : 1);
    }
    if (tgt && !chasing) {
      if (e.order === 'attack' || e.order === 'amove' || !e.order) e.path = null;
      if (e.order === 'attack') return;      /* in range: hold and keep firing */
    } else if (chasing && e.order === 'attack') {
      /* close on the ordered target; repath now and then rather than every frame */
      e.rep = (e.rep || 0) - dt;
      if (!e.path || e.rep <= 0) { e.goal = { x:tgt.x, z:tgt.z }; e.path = _rtsPath(e.x, e.z, tgt.x, tgt.z); e.pi = 0; e.rep = 0.9; }
    }
  } else { e.turret = e.rot; }

  if (e.path) { _rtsSteer(e, dt, d); if (!e.path && (e.order === 'move' || e.order === 'amove')) e.order = null; }
}
/* UNIT.CPP Overrun_Square. A crusher threatens the ground in front of it: infantry there
   scatter out of the way, and any that are actually under the tracks are killed. The
   original refuses to let HUMAN vehicles auto-crush - you have to drive over them yourself -
   which is why your own tanks never mow down the enemy infantry they are shooting at. */
function _rtsOverrun(e) {
  var G = window._rtsG, foe = _rtsEnemyOf(e.side);
  for (var i = 0; i < G.ents.length; i++) {
    var o = G.ents[i];
    if (o.dead || o.type !== 'unit' || o.side === e.side) continue;
    if (rtsUnitDef(o.def).kind !== 'infantry') continue;
    var d = Math.hypot(o.x - e.x, o.z - e.z);
    if (d > RTS_CRUSH_DIST) continue;
    if (d <= RTS_CRUSH_KILL) {
      o.hurtBy = e.side; o.crushed = 1;
      _rtsKill(o);
      if (typeof _rtsSfx === 'function') _rtsSfx('pop', o.x, o.z);
    } else {
      /* Incoming(): they panic and try to get out from under it */
      o.fear = Math.max(o.fear, RTS_FEAR.SCARED);
      if (!o.path && (o.side !== 'enemy' || _rtsIQAt(RTS_IQ.scatter))) _rtsScatter(o, e.x, e.z);
    }
  }
}
function _rtsUpdateHarvester(e, dt, d) {
  var G = window._rtsG;
  if (!e.hstate) { if (e.order !== 'move') _rtsOrderHarvest(e, null, null); }
  if (e.order === 'move' && e.path) { _rtsSteer(e, dt, d); if (!e.path) e.order = null; return; }

  if (e.hstate === 'toField') {
    if (!e.htile || G.scrap[_rtsIdx(e.htile.tx, e.htile.tz)] <= 0) e.htile = _rtsNearestScrap(e);
    if (!e.htile) { e.path = null; return; }                      /* nothing left to mine */
    var wx = _rtsWX(e.htile.tx), wz = _rtsWX(e.htile.tz);
    if (Math.hypot(e.x - wx, e.z - wz) < RTS_TILE * 1.1) { e.path = null; e.hstate = 'mining'; return; }
    if (!e.path) { e.goal = { x:wx, z:wz }; e.path = _rtsPath(e.x, e.z, wx, wz); e.pi = 0; if (!e.path) { e.htile = null; return; } }
    _rtsSteer(e, dt, d);
  } else if (e.hstate === 'mining') {
    var i = _rtsIdx(e.htile.tx, e.htile.tz), take = Math.min(RTS_HARVEST_RATE * dt, G.scrap[i], d.capacity - e.carry);
    G.scrap[i] -= take; e.carry += take;
    /* The hopper holds BAILS; what they are worth depends on what was in the ground. */
    e.carryVal += take * (G.gems[i] ? RTS_GEM_MULT : 1);
    if (G.scrap[i] <= 0.5) { G.scrap[i] = 0; G.gems[i] = 0; G.scrapDirty = true; e.htile = null; e.hstate = 'toField'; }
    if (e.carry >= d.capacity - 0.5) { e.hstate = 'toRef'; e.path = null; }
  } else if (e.hstate === 'toRef') {
    var ref = _rtsNearestRefinery(e);
    if (!ref) { e.path = null; return; }
    /* Docking_Coord: a harvester drives to the refinery's DOCK, not its centre. Pathing at
       the centre of a 3x3 building means every harvester aims at a blocked cell, stops
       wherever the crowd stops, and they pile up on whichever side they arrived from. */
    var dock = _rtsDockCoord(ref);
    /* generous docking radius: a harvester that stops one tile short of the strict range
       would otherwise hover beside the refinery without ever unloading */
    /* Arrive at the dock, but unload from anywhere alongside the building: four harvesters
       converging on one point shove each other back out of a strict dock radius, and the one
       at the back of the queue never finishes its trip. The dock is the destination, not a
       condition. */
    if (Math.hypot(e.x - dock.x, e.z - dock.z) < RTS_TILE * 1.6 || _rtsRangeTo(e, ref) < RTS_TILE * 2.2) {
      e.path = null; e.hstate = 'unload'; e.ref = ref; return;
    }
    e.rep = (e.rep || 0) - dt;
    if (!e.path || e.rep <= 0) { e.goal = { x:dock.x, z:dock.z }; e.path = _rtsPath(e.x, e.z, dock.x, dock.z); e.pi = 0; e.rep = 1.5; if (!e.path) return; }
    _rtsSteer(e, dt, d);
  } else if (e.hstate === 'unload') {
    if (!e.ref || e.ref.dead) { e.hstate = 'toRef'; return; }
    var give = Math.min(RTS_UNLOAD_RATE * dt, e.carry);
    var pay = e.carry > 0 ? e.carryVal * (give / e.carry) : 0;
    e.carry -= give; e.carryVal = Math.max(0, e.carryVal - pay);
    /* Harvested_Money, not a credit deposit: this is the one income in the game that goes
       into the STORE, so it is the one the Storage cap can refuse. */
    var lost = _rtsHarvested(G.sides[e.side], pay);
    if (lost > 0 && e.side === 'player') _rtsSiloWarn(G.sides[e.side]);
    if (e.carry <= 0.5) { e.carry = 0; e.carryVal = 0; e.hstate = 'toField'; }
  }
}
/* Nearest deposit, with gems worth a detour. The score is the WHOLE trip - out to the tile
   and back to the refinery - divided by what a load from it is worth, so a harvester will
   pass a nearer ore patch for gems only when the longer haul actually pays. Scoring on the
   one-way distance instead sends harvesters chasing gems across the map and drops income:
   mining takes about four seconds, the drive takes most of a minute. */
function _rtsNearestScrap(e) {
  var G = window._rtsG, best = null, bs = 1e9;
  var ref = _rtsNearestRefinery(e);
  var rx = ref ? ref.x : e.x, rz = ref ? ref.z : e.z;
  for (var tz = 0; tz < RTS_N; tz++) for (var tx = 0; tx < RTS_N; tx++) {
    var i = _rtsIdx(tx, tz);
    if (G.scrap[i] <= 0) continue;
    var wx = _rtsWX(tx), wz = _rtsWX(tz);
    var trip = Math.hypot(wx - e.x, wz - e.z) + Math.hypot(wx - rx, wz - rz);
    /* The detour is weighted by a CAPPED preference, not by the raw value ratio. Once a gem
       step was correctly priced at four times GemValue, dividing the trip by the full 12.6x
       meant a gem tile twelve times further away scored the same as ore underfoot - every
       harvester on the map beelined for the middle, stripped it, and got rich. The Recruit
       AI went from 15 units to 60 and the difficulty ladder collapsed into one rung.
       Goto_Tiberium in the original just takes the CLOSEST patch; preferring gems at all is
       this game's idea, so bounding that preference is this game's job. */
    var s = trip / (G.gems[i] ? RTS_GEM_DETOUR : 1);
    if (s < bs) { bs = s; best = { tx:tx, tz:tz }; }
  }
  return best;
}
/* BUILDING.H Docking_Coord: the point a harvester actually parks at. South face of the
   refinery, one tile clear of the footprint - the same side the free harvester exits from. */
function _rtsDockCoord(ref) {
  var d = rtsStructDef(ref.def);
  return { x:_rtsWX(ref.tx) + (d.w - 1) * RTS_TILE / 2, z:_rtsWX(ref.tz + d.h) };
}
function _rtsNearestRefinery(e) {
  var G = window._rtsG, best = null, bd = 1e9;
  for (var i = 0; i < G.ents.length; i++) {
    var o = G.ents[i];
    if (o.type !== 'struct' || o.def !== 'refinery' || o.side !== e.side || o.dead || o.building) continue;
    var d = _rtsDist(e, o);
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}

/* ------------------------------------------------------- structures */
function _rtsUpdateStruct(e, dt) {
  var d = rtsStructDef(e.def);
  if (e.hitT > 0) e.hitT -= dt;
  if (e.selling) {
    /* Mission_Deconstruction: the build-up animation, in reverse. When it reaches the
       ground the crew comes out and the building is gone. */
    e.bprog -= dt / Math.max(0.4, d.build * RTS_DECON_TIME);
    e.hp = Math.max(1, d.hp * Math.max(0, e.bprog));
    if (e.bprog <= 0) {
      e.bprog = 0;
      _rtsEvacuate(e, _rtsSurvivorCount(e), false);
      _rtsKill(e);
    }
    return;
  }
  if (e.building) {
    /* buildings rise out of the ground while they finish, and gain HP as they go */
    e.bprog += dt / Math.max(0.5, d.build * 0.5) * _rtsPowerFactor(e.side);
    e.hp = d.hp * (0.15 + 0.85 * Math.min(1, e.bprog));
    if (e.bprog >= 1) { e.bprog = 1; e.building = 0; e.hp = d.hp; _rtsRecalcPower(e.side);
      _rtsGrandOpening(e);
      /* HouseClass::JustBuiltStructure, which TEVENT_BUILD reads. It is a one-frame signal,
         cleared at the end of the trigger pass that could have seen it. */
      var _jb = window._rtsG.justBuilt;
      if (_jb) _jb[e.side].struct = e.def; }
    return;
  }
  if (e.repair) _rtsRepairAI(e, dt);
  /* Service Depot. Anything of yours with wheels or tracks that is parked on it gets patched
     up for nothing - the point of the building is that it turns a battered army into a fresh
     one without a trip through the production queue. Infantry are excluded, as in the
     original: a depot repairs vehicles, it does not heal people. Needs power like everything
     else, so browning out the base also stops the repairs. */
  if (d.repairs && _rtsPowerFactor(e.side) >= 0.999) {
    var G2 = window._rtsG;
    for (var ri = 0; ri < G2.ents.length; ri++) {
      var v = G2.ents[ri];
      if (v.dead || v.type !== 'unit' || v.side !== e.side || v.hp >= v.maxHp) continue;
      if (rtsUnitDef(v.def).kind !== 'vehicle') continue;
      if (!_rtsAtStruct(v, e, d.repairs)) continue;
      v.hp = Math.min(v.maxHp, v.hp + d.repairRate * dt);
    }
  }
  if (!d.weapon) return;
  var w = RTS_WEAPONS[d.weapon];
  if (e.cool > 0) e.cool -= dt;
  if (e.fire > 0) e.fire -= dt;
  if (e.recoil > 0) e.recoil -= dt;
  /* a browned-out base loses its defences - power actually matters */
  if (_rtsPowerFactor(e.side) < 0.999) return;
  if (!e.target || e.target.dead || _rtsRangeTo(e, e.target) > w.range) e.target = _rtsFindTarget(e, w.range, w);
  if (!e.target) return;
  var ta = Math.atan2(e.target.z - e.z, e.target.x - e.x), td = ta - e.rot;
  while (td > Math.PI) td -= Math.PI * 2; while (td < -Math.PI) td += Math.PI * 2;
  e.rot += Math.min(Math.abs(td), 2.6 * dt) * (td < 0 ? -1 : 1);
  if (e.cool <= 0 && Math.abs(td) < 0.3) _rtsFire(e, e.target, w);
}

/* --------------------------------------------------------- projectiles --
   A shot in flight belongs to nobody in particular: it hits the first hostile thing it runs
   into, which need not be what it was aimed at. An infantry screen in front of a tank column
   now actually absorbs shells meant for the tanks. Only hostiles are tested - letting shells
   stop on friendlies as well would block every massed formation's line of fire, which is a
   different game. Splash still catches friendlies, as Explosion_Damage always did. */
function _rtsProjHit(p) {
  var G = window._rtsG, foe = _rtsEnemyOf(p.side), best = null, bd = 1e9;
  for (var i = 0; i < G.ents.length; i++) {
    var o = G.ents[i];
    if (o.dead || o.side !== foe) continue;
    var dx = o.x - p.x, dz = o.z - p.z;
    if (dx > RTS_SHELL_HIT * 6 || dx < -RTS_SHELL_HIT * 6) continue;   /* cheap reject */
    if (dz > RTS_SHELL_HIT * 6 || dz < -RTS_SHELL_HIT * 6) continue;
    var d = _rtsRangeTo(p, o);
    if (d < RTS_SHELL_HIT && d < bd) { bd = d; best = o; }
  }
  return best;
}
function _rtsUpdateProj(dt) {
  var G = window._rtsG;
  for (var i = G.proj.length - 1; i >= 0; i--) {
    var p = G.proj[i];
    p.life -= dt;
    /* missiles home; shells hold the bearing they left the barrel on */
    if (p.kind === 'missile' && p.tgt && !p.tgt.dead) {
      var dx = p.tgt.x - p.x, dz = p.tgt.z - p.z, d = Math.hypot(dx, dz) || 1;
      p.vx += (dx / d * p.speed - p.vx) * Math.min(1, dt * 4);
      p.vz += (dz / d * p.speed - p.vz) * Math.min(1, dt * 4);
    }
    p.x += p.vx * dt; p.z += p.vz * dt;
    var hit = _rtsProjHit(p);
    if (hit || p.life <= 0) {
      if (hit) _rtsDamage(hit, p.dmg, p.from);
      if (p.splash > 0) _rtsSplash(p.x, p.z, RTS_BLAST_CELLS * RTS_TILE, p.dmg, p.side, p.splash, p.from);
      _rtsCombatAnim(p.dmg, p.x, p.z, p.splash > 0 ? 1.4 : 0.7, hit);
      G.proj.splice(i, 1);
    }
  }
}

/* ------------------------------------------------------------ enemy AI --
   The build order comes from RULES.CPP's [AI] section, and the important idea there is that
   the AI does not follow a script - it holds a target base COMPOSITION. Each structure type
   wants `ratio` of the base size capped at `limit`, and the AI builds whatever it is
   furthest short of. Base size tracks the human's building count plus BaseSizeAdd, so the
   opponent grows in response to how you are actually playing. */
function _rtsAIWants(S) {
  var G = window._rtsG, have = {}, i, e, theirs = 0, own = 0;
  for (i = 0; i < G.ents.length; i++) {
    e = G.ents[i];
    if (e.type !== 'struct' || e.dead || e.selling) continue;
    if (e.side === 'player') { theirs++; continue; }
    have[e.def] = (have[e.def] || 0) + 1; own++;
  }
  /* count what is already on the way, or the AI queues four refineries in a row */
  if (S.q.struct) have[S.q.struct.key] = (have[S.q.struct.key] || 0) + 1;
  if (S.ready) have[S.ready] = (have[S.ready] || 0) + 1;

  /* PowerSurplus: keep spare capacity in hand rather than building power only once the
     lights are already out. Below PowerEmergency it is the only thing worth building. */
  var slack = S.powerMade - S.powerUsed;
  if (slack < RTS_AI.powerSurplus) return { key:'power', urgent:slack < 0 ||
    S.powerMade < S.powerUsed * RTS_AI.powerEmergency };

  /* A house whose store is nearly full is throwing away income right now, and no ratio in the
     base plan is worth more than that. This has to come BEFORE the ordered walk or the storage
     cap is a pure nerf: the opponent would lose the credits and never buy the fix, because a
     silo sits behind the whole defence tier in the build order. Gated on the silo actually
     being buildable so an AI with no refinery does not sit here demanding one. */
  var cap = rtsCapacity('enemy');
  if (cap > 0 && S.ore >= cap * RTS_AI.siloUrgent && (have.silo || 0) < RTS_AI.limit.silo
      && _rtsCanProduce('enemy', 'silo')) return { key:'silo', urgent:true };

  /* Below IQProduction the opponent keeps a minimal base and never expands - that is the
     whole difference between the low difficulties and the high one. */
  var order = _rtsIQAt(RTS_IQ.production) ? RTS_AI.buildOrder
            : (_rtsIQAt(RTS_IQ.repairSell) ? ['refinery', 'barracks'] : []);
  var size = Math.max(own, theirs + RTS_AI.baseSizeAdd);
  for (i = 0; i < order.length; i++) {
    var k = order[i], want = Math.min(RTS_AI.limit[k], Math.ceil(size * RTS_AI.ratio[k]));
    if ((have[k] || 0) < want) return { key:k, urgent:false };
  }
  return null;
}
/* HOUSE.CPP Recalc_Center: the base centre is a COST-WEIGHTED average of building positions
   ("give more weight to buildings that cost more"), and the radius is the mean distance from
   it. Zones follow: CORE inside the radius, then NORTH/EAST/SOUTH/WEST by direction. */
function _rtsBaseCentre(side) {
  var G = window._rtsG, x = 0, z = 0, n = 0, i, e;
  for (i = 0; i < G.ents.length; i++) {
    e = G.ents[i];
    if (e.dead || e.type !== 'struct' || e.side !== side || e.selling) continue;
    var w = ((rtsStructDef(e.def).cost / 1000) | 0) + 1;
    for (var k = 0; k < w; k++) { x += e.x; z += e.z; n++; }
  }
  if (!n) return null;
  var c = { x:x / n, z:z / n, r:0 }, rad = 0, cnt = 0;
  for (i = 0; i < G.ents.length; i++) {
    e = G.ents[i];
    if (e.dead || e.type !== 'struct' || e.side !== side || e.selling) continue;
    rad += Math.hypot(e.x - c.x, e.z - c.z); cnt++;
  }
  c.r = Math.max(cnt ? rad / cnt : 0, RTS_TILE * 2);
  return c;
}
/* Which_Zone: 0 core, 1 north, 2 east, 3 south, 4 west, -1 too far to be part of the base. */
function _rtsWhichZone(c, x, z) {
  if (!c) return -1;
  var d = Math.hypot(x - c.x, z - c.z);
  if (d <= c.r) return 0;
  if (d > c.r * 4) return -1;
  var a = Math.atan2(z - c.z, x - c.x);
  if (a >= -Math.PI * 0.75 && a < -Math.PI * 0.25) return 1;   /* north (-z) */
  if (a >= -Math.PI * 0.25 && a < Math.PI * 0.25) return 2;    /* east */
  if (a >= Math.PI * 0.25 && a < Math.PI * 0.75) return 3;     /* south */
  return 4;                                                    /* west */
}
/* Find_Build_Location: rate each zone by how far its defence sits BELOW the base average,
   and aim the new defensive building at the weakest one. Putting every turret on the side
   facing the enemy is exactly the mistake this routine exists to avoid - it leaves the other
   three approaches open. */
function _rtsAIWeakZone() {
  var G = window._rtsG, c = _rtsBaseCentre('enemy');
  if (!c) return null;
  var def = [0, 0, 0, 0, 0], i;
  for (i = 0; i < G.ents.length; i++) {
    var e = G.ents[i];
    if (e.dead || e.type !== 'struct' || e.side !== 'enemy' || e.selling) continue;
    var sd = rtsStructDef(e.def);
    if (!sd.weapon) continue;
    var z = _rtsWhichZone(c, e.x, e.z);
    if (z >= 0) def[z]++;
  }
  /* the core counts for half, as in the original's `if (z == ZONE_CORE) diff /= 2` */
  var best = 1, bestv = 1e9;
  for (i = 1; i <= 4; i++) if (def[i] < bestv) { bestv = def[i]; best = i; }
  var ang = [0, -Math.PI / 2, 0, Math.PI / 2, Math.PI][best];
  return { x:c.x + Math.cos(ang) * c.r * 2, z:c.z + Math.sin(ang) * c.r * 2 };
}
/* Where to put it: a refinery hugs the nearest ore, a turret covers the base's weakest
   approach, everything else clusters. Dropping a refinery on the far side of the base from
   the ore is the single most common way a build-order AI wastes its money. */
function _rtsAIPlace(key) {
  var G = window._rtsG, i, e, aim = null;
  /* Next_Buildable first. If the plan has a fillable hole of this type, the building goes back
     into it - that is the whole point of the node list, and it comes before any of the aiming
     below because the plan already decided where this one belongs. */
  var node = _rtsNextBuildable('enemy', key);
  if (node) { _rtsPlaceStruct('enemy', key, node.tx, node.tz, false, G.sides.enemy.readyPaid); return true; }
  if (key === 'refinery') aim = _rtsAIOreSpot();
  else if (key === 'turret') aim = _rtsAIWeakZone();
  var anchors = [];
  for (i = 0; i < G.ents.length; i++) {
    e = G.ents[i];
    if (e.type === 'struct' && e.side === 'enemy' && !e.dead && !e.selling) anchors.push(e);
  }
  if (!anchors.length) return false;
  if (aim) anchors.sort(function (a, b) {
    return Math.hypot(a.x - aim.x, a.z - aim.z) - Math.hypot(b.x - aim.x, b.z - aim.z);
  });
  /* Try every anchor, best-first. Searching only the nearest one looks fine until that
     corner of the base fills up - then placement fails forever, the finished building never
     leaves the "ready" slot, and the AI's whole structure queue is jammed for the rest of
     the match while its credits pile up. */
  var R = RTS_BUILD_RADIUS;
  for (var a = 0; a < anchors.length; a++) {
    var anchor = anchors[a], best = null, bs = 1e9;
    for (var tx = anchor.tx - R; tx <= anchor.tx + R; tx++) {
      for (var tz = anchor.tz - R; tz <= anchor.tz + R; tz++) {
        if (!_rtsCanPlace('enemy', key, tx, tz)) continue;
        var wx = _rtsWX(tx), wz = _rtsWX(tz);
        var s = aim ? Math.hypot(wx - aim.x, wz - aim.z) : Math.hypot(wx - anchor.x, wz - anchor.z);
        if (s < bs) { bs = s; best = [tx, tz]; }
      }
    }
    /* Anything placed outside the plan becomes part of it (in _rtsPlaceStruct), so the next
       raid is repaired against the base as it actually stands, not just the opening layout. */
    if (best) { _rtsPlaceStruct('enemy', key, best[0], best[1], false, G.sides.enemy.readyPaid); return true; }
  }
  return false;
}
/* The richest ore nearest to ANY of the AI's buildings - not to its yard. As the base creeps
   outward the frontier is what matters; measuring from the yard sent late refineries back
   toward a field that had already been mined out. */
function _rtsAIOreSpot() {
  var G = window._rtsG, structs = [], i, e;
  for (i = 0; i < G.ents.length; i++) {
    e = G.ents[i];
    if (e.type === 'struct' && e.side === 'enemy' && !e.dead && !e.selling) structs.push(e);
  }
  if (!structs.length) return null;
  var best = null, bd = 1e9;
  for (var tx = 0; tx < RTS_N; tx += 2) for (var tz = 0; tz < RTS_N; tz += 2) {
    if (G.scrap[_rtsIdx(tx, tz)] < RTS_SCRAP_TILE * 0.4) continue;
    var wx = _rtsWX(tx), wz = _rtsWX(tz), d = 1e9;
    for (i = 0; i < structs.length; i++) d = Math.min(d, Math.hypot(wx - structs[i].x, wz - structs[i].z));
    if (d < bd) { bd = d; best = { x:wx, z:wz }; }
  }
  return best;
}
/* Keep the production lines fed. Economy first, and crucially the AI SAVES for a harvester
   instead of dribbling its income away on cheap infantry - without that it parks at ~90
   credits forever, never affords the 1200 harvester, and its army stops growing two minutes
   in. InfantryReserve is the "we are rich" line: above it the AI restarts a line the instant
   it frees up, below it it only decides on its slow tick, so a poor opponent trickles and a
   rich one runs its factories flat out. */
function _rtsAIUnits(S) {
  var G = window._rtsG, harv = 0, i;
  for (i = 0; i < G.ents.length; i++) {
    var e = G.ents[i];
    if (e.dead || e.side !== 'enemy' || e.type !== 'unit') continue;
    if (rtsUnitDef(e.def).harvest) harv++;
  }
  var wantHarv = _rtsIQAt(RTS_IQ.harvester) ? 3 : 1;
  if (harv < wantHarv) {
    if (_rtsCanQueue('enemy', 'harvester')) { _rtsQueue('enemy', 'harvester'); return; }
  }
  /* One pass per production line: gather everything affordable and buildable, then pick among
     them by weight. RTS_AI.mix holds the ladder so that adding a unit to RTS_UNITS does not
     mean editing this function.

     The weighting is load-bearing, not decoration. Walking the list best-first and taking the
     first hit is degenerate - whatever sits at the top is the only thing ever built. Measured
     over three seeds at eight minutes that gave 461 grenadiers and 14 rocket soldiers: the
     opponent had silently stopped fielding anti-armour infantry. */
  for (var cat in RTS_AI.mix) {
    var list = RTS_AI.mix[cat], pool = [], total = 0;
    for (i = 0; i < list.length; i++) {
      if (rtsMoney(S) <= list[i].at) continue;
      if (!_rtsCanQueue('enemy', list[i].key)) continue;
      pool.push(list[i]); total += list[i].w;
    }
    if (!pool.length) continue;
    var roll = _rtsRnd() * total;
    for (i = 0; i < pool.length; i++) {
      roll -= pool[i].w;
      if (roll <= 0 || i === pool.length - 1) { _rtsQueue('enemy', pool[i].key); break; }
    }
  }
}
/* HOUSE.CPP's house state machine. The urgency checks all read it, which is how one flag
   ("we were attacked in the last minute") changes several unrelated decisions at once. */
/* The one AI rule the MCV needs. It is deliberately narrow: an opponent with no Command Yard
   can build nothing at all, so an MCV sitting in its column is the difference between a
   comeback and a corpse. It is not on the AI's shopping list - buying a 2500-credit vehicle it
   has no use for while it still owns a yard would be a straight waste - so this only ever
   fires on one it was given, by a crate or by a scenario. */
function _rtsAIDeploy(side) {
  var G = window._rtsG;
  if (_rtsHas(side, 'yard')) return false;
  for (var i = 0; i < G.ents.length; i++) {
    var e = G.ents[i];
    if (e.dead || e.side !== side || e.type !== 'unit') continue;
    if (!(rtsUnitDef(e.def) || {}).deploy) continue;
    if (_rtsDeploy(e)) return true;
  }
  return false;
}
function _rtsAIStateTick(S) {
  var G = window._rtsG;
  if (G.ai.state === RTS_STATE.ENDGAME) return;
  /* `G.ai.lastHit || -999` is wrong: at game start the timestamp IS 0, which is falsy, so
     the fallback fires and a base attacked on the first second never enters ATTACKED. */
  var last = (G.ai.lastHit == null) ? -999 : G.ai.lastHit;
  if (G.t - last < 60) { G.ai.state = RTS_STATE.ATTACKED; return; }
  G.ai.state = rtsMoney(S) < 25 ? RTS_STATE.BROKE : RTS_STATE.BUILDUP;
}
function _rtsAICanEarn() {
  return !!(_rtsHas('enemy', 'refinery') && _rtsAIHarvesters());
}
function _rtsAIHarvesters() {
  var G = window._rtsG, n = 0;
  for (var i = 0; i < G.ents.length; i++) {
    var e = G.ents[i];
    if (!e.dead && e.side === 'enemy' && e.type === 'unit' && rtsUnitDef(e.def).harvest) n++;
  }
  return n;
}
/* Does this house still own anything that can PRODUCE? Check_Fire_Sale's question. */
function _rtsAIHasFactory() {
  return !!(_rtsHas('enemy', 'yard') || _rtsHas('enemy', 'barracks') || _rtsHas('enemy', 'factory'));
}
/* Score every strategy. NONE means "not worth doing at all right now". */
function _rtsAIUrgency(S) {
  var G = window._rtsG, U = RTS_URGENCY, u = {};
  var pf = _rtsPowerFactor('enemy'), slack = S.powerMade - S.powerUsed;
  var attacked = G.ai.state === RTS_STATE.ATTACKED;

  /* Check_Build_Power */
  u.power = U.NONE;
  if (slack < RTS_AI.powerSurplus && _rtsAICanEarn()) {
    u.power = U.LOW;
    if (pf < RTS_AI.powerEmergency) u.power = U.MEDIUM;
    if (attacked) u.power = U.HIGH;          /* browned-out defences during a raid */
  }
  /* Check_Raise_Power: a deficit big enough that selling something is the fastest fix. */
  u.raisePower = U.NONE;
  if (pf < RTS_AI.powerEmergency && slack < -RTS_AI.powerEmergencyGap) {
    u.raisePower = attacked ? U.HIGH : U.MEDIUM;
  }
  /* Check_Lower_Power: surplus power is dead money. */
  u.lowerPower = (slack > RTS_AI.powerWaste) ? U.LOW : U.NONE;

  /* Check_Raise_Money */
  u.raiseMoney = U.NONE;
  if (rtsMoney(S) < RTS_AI.brokeMoney) u.raiseMoney = U.LOW;
  if (rtsMoney(S) < RTS_AI.desperateMoney && !_rtsAICanEarn()) u.raiseMoney++;

  /* Check_Fire_Sale: nothing left that can build. The game is over; go out swinging. */
  u.fireSale = U.NONE;
  if (!attacked && _rtsCount('enemy', 'struct') > 0 && !_rtsAIHasFactory()) u.fireSale = U.CRITICAL;

  /* Check_Attack */
  u.attack = U.NONE;
  if (G.t > 60 && G.ai.next <= 0) u.attack = attacked ? U.LOW : U.CRITICAL;

  /* Building the base out. These are the composition ratios, expressed as urgency. */
  var want = _rtsAIWants(S);
  u.build = U.NONE;
  if (want) u.build = want.key === 'refinery' && !_rtsHas('enemy', 'refinery') ? U.HIGH
    : (want.urgent ? U.HIGH : U.MEDIUM);
  G.ai.want = want;
  return u;
}
function _rtsCount(side, type) {
  var G = window._rtsG, n = 0;
  for (var i = 0; i < G.ents.length; i++) {
    var e = G.ents[i];
    if (!e.dead && e.side === side && e.type === type && !e.selling) n++;
  }
  return n;
}
/* Sell the first building on the list whose urgency threshold this situation has reached. */
function _rtsAISellFrom(list, urgency) {
  for (var i = 0; i < list.length; i++) {
    if (urgency < list[i][1]) continue;
    var b = _rtsHas('enemy', list[i][0]);
    if (b && _rtsSell(b)) return true;
  }
  return false;
}
function _rtsAIDo(strat, urgency, S) {
  var G = window._rtsG;
  switch (strat) {
    case 'build':
      if (!G.ai.want || S.q.struct || S.ready) return false;
      var sd = rtsStructDef(G.ai.want.key);
      var reserve = (urgency >= RTS_URGENCY.HIGH) ? 0 : RTS_AI.creditReserve;
      if (rtsMoney(S) < _rtsCostOf('enemy', sd) + reserve) return false;
      return _rtsQueue('enemy', G.ai.want.key);

    case 'raiseMoney':
      if (!_rtsIQAt(RTS_IQ.sellBack)) return false;
      return _rtsAISellFrom(RTS_AI.sellForMoney, urgency);

    case 'raisePower':
      if (!_rtsIQAt(RTS_IQ.sellBack)) return false;
      return _rtsAISellFrom(RTS_AI.sellForPower, urgency);

    case 'lowerPower':
      if (!_rtsIQAt(RTS_IQ.sellBack)) return false;
      /* only if losing one would not brown the base out */
      var p = _rtsHas('enemy', 'power');
      if (!p || S.powerMade - rtsStructDef('power').power < S.powerUsed) return false;
      return _rtsSell(p);

    case 'fireSale':
      /* Fire_Sale + Do_All_To_Hunt: sell the lot and throw everything at the player. */
      G.ai.state = RTS_STATE.ENDGAME;
      var sold = 0, i, e;
      for (i = 0; i < G.ents.length; i++) {
        e = G.ents[i];
        if (e.dead || e.side !== 'enemy' || e.type !== 'struct' || e.selling) continue;
        if (_rtsSell(e)) sold++;
      }
      _rtsAIAllToHunt();
      return sold > 0;

    case 'attack':
      return _rtsAIAttack(urgency);
  }
  return false;
}
/* Do_All_To_Hunt. */
function _rtsAIAllToHunt() {
  var G = window._rtsG;
  /* Do_All_To_Hunt overrides everything, so the teams are dissolved first - otherwise the
     team logic would keep re-issuing its own orders on top of the hunt. */
  for (var tid in (G.teams || {})) _rtsTeamDisband(G.teams[tid]);
  var aim = _rtsHas('player', 'yard') || _rtsHas('player', 'refinery') || _rtsHas('player', 'power');
  if (!aim) return;
  for (var i = 0; i < G.ents.length; i++) {
    var u = G.ents[i];
    if (u.dead || u.side !== 'enemy' || u.type !== 'unit') continue;
    if (rtsUnitDef(u.def).harvest) continue;
    _rtsOrderMove(u, aim.x + (i % 3 - 1) * 5, aim.z + ((i / 3) | 0 % 3) * 5, true);
  }
}
/* AI_Attack. Only a share of the idle army goes; the rest garrisons. */

/* ------------------------------------------------------------- teams (TEAM.CPP) --
   A team is a composition plus a mission. It recruits until it is at full strength, only
   then moves out, and picks its target by CATEGORY rather than by proximity. Replacing the
   old attack wave - which shoved 60-70% of every idle unit at the player's nearest building
   - with this is what stops the opponent fighting as one undifferentiated blob. */

/* ------------------------------------------------------- waypoints (TEAMTYPE.CPP) --
   Every waypoint-taking team mission - MOVE, ATT_WAYPT, PATROL - names a place on the map
   rather than a raw cell, and that indirection is the whole reason a team script can be
   written once and still mean something. In the original a designer drops the waypoints by
   hand in the scenario editor; this map is generated, so they are DERIVED from it instead.

   Named rather than numbered, which is the same mechanism spelled legibly: what a scenario
   author means by "waypoint 7" is "the gap in the ridge", and there is no reason to make the
   team types refer to it as a number here.

     home   the opponent's own command yard - where a team forms up
     front  the direct approach to the player's base, short of the buildings
     flank  the same base approached off the diagonal, so an attack does not always
            arrive up the one corridor the player has learned to defend
     mid    the contested ore in the middle of the map
     ore    the field the player's own harvesters are working - a raider's hunting ground */
function _rtsWayptSnap(tx, tz) {
  tx = Math.max(1, Math.min(RTS_N - 2, Math.round(tx)));
  tz = Math.max(1, Math.min(RTS_N - 2, Math.round(tz)));
  var open = _rtsNearestOpen(tx, tz, 24);
  return open ? { tx:open[0], tz:open[1] } : { tx:tx, tz:tz };
}
/* The ore cell closest to a given point, so "ore" and "mid" name real deposits rather than
   wherever the field happened to be authored. */
function _rtsNearestOre(G, tx, tz) {
  var best = null, bd = 1e9;
  for (var z = 0; z < RTS_N; z++) for (var x = 0; x < RTS_N; x++) {
    if (G.scrap[_rtsIdx(x, z)] <= 0) continue;
    var d = (x - tx) * (x - tx) + (z - tz) * (z - tz);
    if (d < bd) { bd = d; best = { tx:x, tz:z }; }
  }
  return best;
}
function _rtsBuildWaypoints(G) {
  var home = _rtsHas('enemy', 'yard'), foe = _rtsHas('player', 'yard');
  var W = {};
  var hx = home ? home.tx : RTS_N - 20, hz = home ? home.tz : 20;
  var fx = foe ? foe.tx : 20, fz = foe ? foe.tz : RTS_N - 20;
  W.home = _rtsWayptSnap(hx, hz + 6);

  /* Stand off the target base rather than on top of it: a MOVE mission is an approach, and
     a team that "arrives" inside the enemy buildings has already blundered into the fight
     the flank was supposed to avoid. */
  var dx = fx - hx, dz = fz - hz, len = Math.hypot(dx, dz) || 1;
  var ux = dx / len, uz = dz / len, STAND = 13;
  W.front = _rtsWayptSnap(fx - ux * STAND, fz - uz * STAND);

  /* Perpendicular to the line between the two bases, so the flank is derived from the
     layout rather than from a corner that happens to be right for this one map. Both signs
     are candidates; take whichever lands on open ground furthest from the direct route. */
  /* SWING is a real flank, not a trek. At 24 tiles on a 112-tile map this put the waypoint
     out on the map edge and every team that used it spent most of the match walking. */
  var px = -uz, pz = ux, SWING = 12, cand = null, cbest = -1;
  for (var s = -1; s <= 1; s += 2) {
    var c = _rtsWayptSnap(fx + px * s * SWING - ux * 6, fz + pz * s * SWING - uz * 6);
    var away = Math.abs((c.tx - fx) * pz - (c.tz - fz) * px) + Math.hypot(c.tx - fx, c.tz - fz);
    if (away > cbest) { cbest = away; cand = c; }
  }
  W.flank = cand;

  var mid = _rtsNearestOre(G, RTS_N >> 1, RTS_N >> 1);
  W.mid = _rtsWayptSnap(mid ? mid.tx : RTS_N >> 1, mid ? mid.tz : RTS_N >> 1);
  var ore = _rtsNearestOre(G, fx, fz);
  W.ore = _rtsWayptSnap(ore ? ore.tx : fx, ore ? ore.tz : fz);

  G.waypt = W;
  return W;
}
function _rtsWayptPos(name) {
  var G = window._rtsG;
  if (!G.waypt) _rtsBuildWaypoints(G);
  var w = G.waypt[name] || G.waypt.front;
  return w ? { x:_rtsWX(w.tx), z:_rtsWX(w.tz) } : null;
}

/* Quarry: the team leader asks Greatest_Threat for the best target of a KIND, so one team
   hunts harvesters while another goes for the power plants. */
function _rtsQuarryMatch(o, quarry) {
  if (quarry === 'anything') return true;
  if (o.type === 'unit') {
    var ud = rtsUnitDef(o.def);
    if (quarry === 'harvester') return !!ud.harvest;
    if (quarry === 'infantry') return ud.kind === 'infantry';
    if (quarry === 'vehicles') return ud.kind === 'vehicle';
    return false;
  }
  var sd = rtsStructDef(o.def);
  if (quarry === 'buildings') return true;
  if (quarry === 'power') return sd.power > 0;
  if (quarry === 'factories') return !!sd.produces;
  if (quarry === 'defense') return !!sd.weapon;
  return false;
}
/* TMission_Attack: the LEADER picks the target, and the leader is the first active member
   that actually has a weapon - "this presumes that some member is better than no member". */
function _rtsTeamLeader(t) {
  var i, m;
  for (i = 0; i < t.members.length; i++) {
    m = t.members[i];
    if (!m.dead && rtsUnitDef(m.def).weapon) return m;
  }
  return t.members[0] || null;
}
/* `quarry` is the ATTACK mission's argument. It defaults to the team type's own quarry so
   that a team with no mission list behaves exactly as it did before the list existed. */
function _rtsTeamTarget(t, quarry, near) {
  var G = window._rtsG, lead = _rtsTeamLeader(t);
  if (!lead) return null;
  if (quarry == null) quarry = t.type.quarry;
  var best = null, bv = 0, w = _rtsPickWeapon(lead, lead);
  for (var i = 0; i < G.ents.length; i++) {
    var o = G.ents[i];
    if (o.dead || o.side !== 'player') continue;
    if (!_rtsQuarryMatch(o, quarry)) continue;
    /* ATT_WAYPT is "clear out what is HERE", so candidates outside the waypoint's radius
       are not merely worth less - they are not candidates at all. */
    if (near && Math.hypot(o.x - near.x, o.z - near.z) > near.r) continue;
    /* Greatest_Threat(THREAT_TIBERIUM) exists precisely to hunt harvesters, so an explicit
       quarry has to override IsNoThreat - otherwise a team raised to kill harvesters scores
       every harvester at zero and can never see one. */
    var v = _rtsEvalObject(lead, o, _rtsRangeTo(lead, o), w, quarry !== 'anything');
    if (v > bv) { bv = v; best = o; }
  }
  /* "If no target could be found, then the mission advances" - so a quarry that no longer
     exists on the map is a reason to move down the list, NOT a reason to fall back onto
     some other target. Only a team with no list at all keeps the old fallback, because for
     that team standing still forever is the only other outcome. */
  if (!best && !near && !t.type.missions && quarry !== 'anything') {
    for (var j = 0; j < G.ents.length; j++) {
      var p = G.ents[j];
      if (p.dead || p.side !== 'player' || p.type !== 'struct') continue;
      var pv = _rtsEvalObject(lead, p, _rtsRangeTo(lead, p), w);
      if (pv > bv) { bv = pv; best = p; }
    }
  }
  return best;
}
/* Calc_Center: the average position of INITIATED members only. A recruit still running to
   join up must not drag the team's centre out to meet it. */
function _rtsTeamCentre(t) {
  var x = 0, z = 0, n = 0, i, m;
  for (i = 0; i < t.members.length; i++) {
    m = t.members[i];
    if (m.dead || !m.init) continue;
    x += m.x; z += m.z; n++;
  }
  if (!n) {
    for (i = 0; i < t.members.length; i++) if (!t.members[i].dead) return { x:t.members[i].x, z:t.members[i].z };
    return null;
  }
  return { x:x / n, z:z / n };
}
/* Can_Add. The mission gate is the one MISSION.CPP's IsRecruitable exists for. */
function _rtsTeamCanAdd(t, u) {
  if (u.dead || u.side !== 'enemy' || u.type !== 'unit') return false;
  if (rtsUnitDef(u.def).harvest) return false;
  if (!_rtsMission(u).recruitable) return false;
  var want = t.type.members[u.def] || 0;
  if (!want) return false;
  if ((t.have[u.def] || 0) >= want) return false;
  /* "Allows member stealing from lesser priority teams." */
  if (u.sqd != null) {
    var other = window._rtsG.teams[u.sqd];
    if (!other || other.type.priority >= t.type.priority) return false;
  }
  return true;
}
/* NOTE: the membership field is `sqd`, not `team`. `e.team` is already taken by the player's
   control groups (the 1-9 keys) and is initialised to -1, so reusing the name made every
   candidate look like it already belonged to a team with id -1 - and nothing could ever be
   recruited, silently, with no error anywhere. */
function _rtsTeamAdd(t, u) {
  var G = window._rtsG;
  if (u.sqd != null && G.teams[u.sqd]) _rtsTeamRemove(G.teams[u.sqd], u);
  t.members.push(u);
  t.have[u.def] = (t.have[u.def] || 0) + 1;
  u.sqd = t.id;
  u.init = (t.members.length === 1);      /* the first member is the team, so it is initiated */
  return true;
}
function _rtsTeamRemove(t, u) {
  var i = t.members.indexOf(u);
  if (i < 0) return false;
  t.members.splice(i, 1);
  t.have[u.def] = Math.max(0, (t.have[u.def] || 1) - 1);
  u.sqd = null; u.init = false;
  /* "A unit that breaks off of a team will enter idle mode." */
  u.order = null; u.target = null; u.path = null; u.goal = null;
  return true;
}
/* Recruit: pick the CLOSEST eligible unit to the team's centre, not just any. */
function _rtsTeamRecruit(t, centre) {
  var G = window._rtsG, best = null, bd = 1e9;
  var cx = centre ? centre.x : 0, cz = centre ? centre.z : 0;
  for (var i = 0; i < G.ents.length; i++) {
    var u = G.ents[i];
    if (!_rtsTeamCanAdd(t, u)) continue;
    var d = centre ? Math.hypot(u.x - cx, u.z - cz) : 0;
    if (d < bd) { bd = d; best = u; }
  }
  if (best) { _rtsTeamAdd(t, best); return true; }
  return false;
}
function _rtsTeamDesired(t) {
  var n = 0;
  for (var k in t.type.members) n += t.type.members[k];
  return n;
}
function _rtsTeamMake(type) {
  var G = window._rtsG;
  var t = { id:G.teamSeq++, type:type, members:[], have:{}, target:null,
    moving:false, hasBeen:false, under:true, zone:null, lagging:false,
    cur:0, guardUntil:0, legT:null };      /* Current: the index into MissionList[] */
  G.teams[t.id] = t;
  return t;
}
function _rtsTeamDisband(t) {
  var G = window._rtsG;
  while (t.members.length) _rtsTeamRemove(t, t.members[0]);
  delete G.teams[t.id];
}
/* The concurrent-team ceiling, derived from the army rather than fixed. See RTS_TEAM_COMMIT.
   Counts only units that could actually fight: harvesters are not an army. */
function _rtsTeamCap() {
  var G = window._rtsG, army = 0;
  for (var i = 0; i < G.ents.length; i++) {
    var e = G.ents[i];
    if (e.dead || e.side !== 'enemy' || e.type !== 'unit') continue;
    if (rtsUnitDef(e.def).harvest) continue;
    army++;
  }
  var want = Math.floor(army * RTS_TEAM_COMMIT / RTS_TEAM_TYPICAL);
  return Math.max(RTS_TEAM_MAX, Math.min(RTS_TEAM_MAX_HARD, want));
}
/* ...and the same scaling applied per type, so the extra slots are shared across the types
   that are currently eligible rather than all going to whichever one the roll happens to
   pick first. The authored `max` stays the floor. */
function _rtsTypeCap(ty, eligible) {
  var cap = _rtsTeamCap();
  return Math.max(ty.max == null ? RTS_TEAM_MAX : ty.max,
                  Math.ceil(cap / Math.max(1, eligible)));
}
/* HouseClass::IsAlerted, as Suggested_New_Team reads it. The timer half matters as much as
   the provocation half: a house that only wakes up when shot at would never field its late
   team types against a player who simply turtles, so the opponent would get WEAKER the more
   passively you played. */
function _rtsHouseAlerted() {
  var G = window._rtsG;
  if (!G) return false;
  var last = (G.ai.lastHit == null) ? -999 : G.ai.lastHit;
  /* The FIRST ATTACK WAVE is this game's declaration of war, and it is what alerts the
     house. Getting this wrong is expensive: gating the alert on a 240-second timer meant
     that on hard - where the match is decided around 190s - Sappers and Assault were never
     raised at all, since an idle player never provokes the house either. The opponent spent
     whole matches fielding nothing but harassment and an idle player survived 47% longer.
     The timer survives only as a backstop for a match where no wave ever goes out. */
  return G.ai.wave > 0 || last > -900 || G.t >= RTS_ALERT_TIME;
}
/* Suggested_New_Team. The original builds a list of every type that is under its MaxAllowed
   and passes the autocreate filter, then picks one AT RANDOM - `choices[Random_Pick(0,
   choicecount-1)]` - rather than always taking the best-scoring one. The commented-out block
   above it in TEAMTYPE.CPP is the scoring version that shipped disabled, so the randomness is
   the deliberate choice: a predictable opponent is a solved one.

   `spare` is how many loose units are available to crew the team; a type that cannot be
   filled is not a candidate. */
function _rtsSuggestTeam(spare) {
  var G = window._rtsG, choices = [], counts = {}, tid, ti, kk;
  for (tid in G.teams) {
    var nm = G.teams[tid].type.name;
    counts[nm] = (counts[nm] || 0) + 1;
  }
  var alerted = _rtsHouseAlerted(), _elig = 0;
  for (ti = 0; ti < RTS_TEAM_TYPES.length; ti++) {
    if (alerted === !!RTS_TEAM_TYPES[ti].autocreate) _elig++;
  }
  /* "maxnum = 0" for the types the filter rejects. A type capped at zero should not still be
     holding a team slot, so the moment the house changes phase its now-invalid teams are
     disbanded and their members freed. Without this the four harassment teams raised before
     the alert sat in the roster forever and the assault phase never got more than two slots
     out of RTS_TEAM_MAX. */
  for (tid in G.teams) {
    if (alerted !== !!G.teams[tid].type.autocreate) { _rtsTeamDisband(G.teams[tid]); }
  }
  counts = {};
  for (tid in G.teams) {
    var nm2 = G.teams[tid].type.name;
    counts[nm2] = (counts[nm2] || 0) + 1;
  }
  for (ti = 0; ti < RTS_TEAM_TYPES.length; ti++) {
    var ty = RTS_TEAM_TYPES[ti];
    if (G.teamHold[ty.name] && G.t < G.teamHold[ty.name]) continue;
    /* "if ((alerted && !ttype->IsAutocreate) || (!alerted && ttype->IsAutocreate)) maxnum=0"
       - a hard split, not a preference. Before the alert the opponent harasses; after it,
       the heavy types come out and the harassing ones stop being raised. */
    if (alerted !== !!ty.autocreate) continue;
    /* MaxAllowed, per type - but as a floor that scales with the army; see _rtsTypeCap.
       Without any cap the random pick happily raises every team of one kind. */
    if ((counts[ty.name] || 0) >= _rtsTypeCap(ty, _elig)) continue;
    var need = 0;
    for (kk in ty.members) need += ty.members[kk];
    if (spare < need) continue;
    choices.push(ty);
  }
  if (!choices.length) return null;
  return choices[(_rtsRnd() * choices.length) | 0];
}
/* Suspend_Teams: when the base is hit, everything below the survival priority is disbanded
   and its members are freed to defend. HOUSE.CPP calls this and it had nothing to call. */
function _rtsSuspendTeams(priority) {
  var G = window._rtsG, n = 0;
  for (var id in G.teams) {
    var t = G.teams[id];
    if (t.type.priority < priority) { _rtsTeamDisband(t); G.teamHold[t.type.name] = G.t + RTS_SUSPEND_DELAY; n++; }
  }
  return n;
}
/* AI_Unit's counterpart for offence: keep the army employed. A team only marches at full
   strength and only fields its own composition, so leaving team creation on the attack-wave
   timer alone left most of the army standing in the base - the opponent committed about
   fifteen units where the old blob sent sixty per cent of everything, and an idle player
   survived half again as long. Raise a team whenever there are enough loose units to crew
   one; the wave timer still governs the announcement, not the war. */
function _rtsTeamMaybeRaise() {
  var G = window._rtsG, i, tid;
  if (!G.teams) { G.teams = {}; G.teamSeq = 0; G.teamHold = {}; }
  /* Do NOT pre-empt the opening. The attack-wave timer is what gives a new player time to
     stand up an economy before anything arrives; raising teams the moment there are units to
     crew them threw that away entirely and the Commando AI was killing an idle player at 100
     seconds instead of 170. Surplus teams are a way to keep an existing war supplied, not a
     way to start one early. */
  if (!G.ai || !G.ai.wave) return false;

  var live = 0;
  for (tid in G.teams) live++;
  if (live >= _rtsTeamCap()) return false;

  var spare = 0;
  for (i = 0; i < G.ents.length; i++) {
    var u = G.ents[i];
    if (u.dead || u.side !== 'enemy' || u.type !== 'unit') continue;
    if (rtsUnitDef(u.def).harvest || u.sqd != null) continue;
    if (!_rtsMission(u).recruitable) continue;
    spare++;
  }
  /* IQGuardArea: a smart opponent keeps a garrison back rather than emptying the base. */
  if (_rtsIQAt(RTS_IQ.guardArea)) spare -= 3;
  if (spare < 2) return false;

  var pick = _rtsSuggestTeam(spare);
  if (!pick) return false;
  _rtsTeamMake(pick);
  return true;
}
function _rtsTeamsTick(dt) {
  var G = window._rtsG, id, t, i, m;
  if (!G.teams) { G.teams = {}; G.teamSeq = 0; G.teamHold = {}; }

  for (id in G.teams) {
    t = G.teams[id];
    /* prune the dead */
    for (i = t.members.length - 1; i >= 0; i--) {
      m = t.members[i];
      if (m.dead) { t.have[m.def] = Math.max(0, (t.have[m.def] || 1) - 1); t.members.splice(i, 1); }
    }
    var total = t.members.length, desired = _rtsTeamDesired(t);

    if (!total) {
      /* "If there are no members and the team has reached full strength at one time, delete." */
      if (t.hasBeen) { _rtsTeamDisband(t); continue; }
    }

    var full = (total >= desired);
    if (full) t.hasBeen = true;
    /* Reinforceable teams snap out of under-strength at a third; the rest are never under
       strength again once they have set out. */
    if (t.type.reinforce) t.under = (desired > 2) ? (total <= desired / 3) : (total < desired);
    else t.under = !t.hasBeen;

    /* Flag into action at full strength. */
    if (!t.moving && full) {
      t.moving = true; t.hasBeen = true; t.under = false;
      for (i = 0; i < t.members.length; i++) t.members[i].init = true;
    }
    /* Under strength while moving: stop and regroup. */
    if (t.moving && t.under) { t.moving = false; t.target = null; }

    t.zone = _rtsTeamCentre(t);

    /* Recruit while there is room. */
    if (!t.moving || (!full && t.type.reinforce)) {
      for (i = 0; i < 2; i++) if (!_rtsTeamRecruit(t, t.zone)) break;
    }

    if (!t.members.length) continue;

    /* Coordinate_Conscript: an uninitiated recruit runs for the team centre, and counts as
       joined once it is inside StrayDistance. */
    var stragglers = 0;
    for (i = 0; i < t.members.length; i++) {
      m = t.members[i];
      if (m.init) continue;
      if (t.zone && Math.hypot(m.x - t.zone.x, m.z - t.zone.z) > RTS_STRAY) {
        stragglers++;
        if (!m.path && !m.order) _rtsOrderMove(m, t.zone.x, t.zone.z, false);
      } else m.init = true;
    }

    if (!t.moving) continue;

    /* Lagging_Units: anyone who has fallen behind is told to catch up, and the rest HOLD
       until they do. Without this the fast members arrive alone and die alone.
       IsSuicide - "charge toward target ignoring distractions" - opts out: a suicide team
       does not stop for its stragglers. */
    var lag = false;
    if (t.zone && !t.type.suicide) {
      for (i = 0; i < t.members.length; i++) {
        m = t.members[i];
        if (!m.init || m.dead) continue;
        if (Math.hypot(m.x - t.zone.x, m.z - t.zone.z) > RTS_STRAY * 1.6) { lag = true; break; }
      }
    }
    t.lagging = lag;
    if (lag) {
      for (i = 0; i < t.members.length; i++) {
        m = t.members[i];
        if (m.dead || !m.init) continue;
        if (Math.hypot(m.x - t.zone.x, m.z - t.zone.z) <= RTS_STRAY * 1.6) {
          if (m.order !== 'hold' && !m.target) { m.order = 'hold'; m.path = null; }
        }
      }
      continue;
    }

    if (_rtsTeamDoMission(t, dt) === 'gone') continue;
  }
}
/* ----------------------------------------------------- the mission list (TEAMTYPE.CPP) --
   `MissionList[]` with an index walked down it. Each entry is [mission, argument], and the
   argument's meaning comes from TeamMission_Needs (see RTS_TMISSIONS).

   Every mission answers one question - "am I done?" - and when the answer is yes the index
   advances. TMISSION_LOOP is the only one that moves the index anywhere else. */
function _rtsTeamOrderAll(t, fn) {
  for (var i = 0; i < t.members.length; i++) {
    var m = t.members[i];
    if (m.dead || !m.init) continue;
    if (m.order === 'hold') m.order = null;
    fn(m, i);
  }
}
/* Spread arrivals out so five units do not path onto one tile and jam the approach. */
function _rtsTeamSpread(i) {
  var a = i * 2.399963;                        /* golden angle, so any count fans out evenly */
  var r = RTS_TILE * (1 + Math.sqrt(i) * 0.9);
  return { x:Math.cos(a) * r, z:Math.sin(a) * r };
}
function _rtsTeamAdvance(t, to) {
  t.cur = (to == null) ? (t.cur | 0) + 1 : to;
  t.guardUntil = 0;
  t.legT = null;
  t.target = null;
}
function _rtsTeamDoMission(t, dt) {
  var G = window._rtsG, list = t.type.missions, i, m;

  /* No list: the pre-TEAMTYPE behaviour, which is exactly TMISSION_ATTACK on the type's own
     quarry, forever. Keeping it means a team type can still be declared without a script. */
  if (!list || !list.length) {
    if (!t.target || t.target.dead) t.target = _rtsTeamTarget(t);
    if (!t.target) return 'idle';
    _rtsTeamOrderAll(t, function (mm) {
      if (mm.order !== 'attack' || mm.target !== t.target) _rtsOrderAttack(mm, t.target);
    });
    return 'ok';
  }

  if (t.cur == null) t.cur = 0;

  /* A LOOP entry consumes no time, so a list of nothing but jumps would spin forever inside
     one tick. Bound the walk by the length of the list: that is enough for any number of
     legitimate jumps and stops a malformed script dead. */
  for (var guard = 0; guard <= list.length; guard++) {
    if (t.cur >= list.length || t.cur < 0) {
      /* Off the end of the list: the team's job is finished. Disbanding frees the members
         to be recruited into whatever is raised next, rather than leaving a spent squad
         standing in the field. */
      _rtsTeamDisband(t);
      return 'gone';
    }
    var entry = list[t.cur], mis = entry[0], arg = entry[1];

    if (mis === 'loop') { _rtsTeamAdvance(t, arg | 0); continue; }

    if (mis === 'guard') {
      if (!t.guardUntil) t.guardUntil = G.t + (arg || 1) * RTS_GUARD_TICK;
      if (G.t >= t.guardUntil) { _rtsTeamAdvance(t); continue; }
      _rtsTeamOrderAll(t, function (mm) {
        /* MISSION_STICKY, which is what the flag table in MISSION.CPP was for: hold this
           spot, shoot what comes, and do not be dragged off it. */
        if (!mm.target && mm.order !== 'hold') { mm.order = 'hold'; mm.path = null; mm.goal = null; }
      });
      return 'ok';
    }

    if (mis === 'move' || mis === 'patrol') {
      var w = _rtsWayptPos(arg);
      if (!w) { _rtsTeamAdvance(t); continue; }
      /* Arrival is judged on the team CENTRE - a single member wedged behind a cliff must
         not hold the whole script up. The timeout is the same idea for a team that cannot
         reach the waypoint at all. */
      if (t.zone && Math.hypot(t.zone.x - w.x, t.zone.z - w.z) <= RTS_WAYPT_ARRIVE) {
        _rtsTeamAdvance(t); continue;
      }
      if (t.legT == null) t.legT = G.t;
      if (G.t - t.legT > 120) { _rtsTeamAdvance(t); continue; }
      /* PATROL engages on the way (attack-move); MOVE is a march. */
      var amove = (mis === 'patrol');
      _rtsTeamOrderAll(t, function (mm, idx) {
        if (mm.target && !mm.target.dead && amove) return;      /* already busy en route */
        var want = amove ? 'amove' : 'move', off = _rtsTeamSpread(idx);
        if (mm.order === want && mm.goal
            && Math.hypot(mm.goal.x - (w.x + off.x), mm.goal.z - (w.z + off.z)) < RTS_TILE) return;
        _rtsOrderMove(mm, w.x + off.x, w.z + off.z, amove);
      });
      return 'ok';
    }

    if (mis === 'attwaypt') {
      var wp = _rtsWayptPos(arg);
      if (!wp) { _rtsTeamAdvance(t); continue; }
      if (!t.target || t.target.dead) {
        t.target = _rtsTeamTarget(t, 'anything', { x:wp.x, z:wp.z, r:RTS_TILE * 14 });
      }
      if (!t.target) { _rtsTeamAdvance(t); continue; }
      _rtsTeamOrderAll(t, function (mm) {
        if (mm.order !== 'attack' || mm.target !== t.target) _rtsOrderAttack(mm, t.target);
      });
      return 'ok';
    }

    if (mis === 'tarcom') {
      /* ATTACKTARCOM: whatever the team is already fixed on - normally set by Took_Damage. */
      if (!t.target || t.target.dead) { _rtsTeamAdvance(t); continue; }
      _rtsTeamOrderAll(t, function (mm) {
        if (mm.order !== 'attack' || mm.target !== t.target) _rtsOrderAttack(mm, t.target);
      });
      return 'ok';
    }

    /* TMISSION_ATTACK, and the default for anything unrecognised. */
    if (!t.target || t.target.dead) t.target = _rtsTeamTarget(t, (mis === 'attack') ? arg : null);
    if (!t.target) { _rtsTeamAdvance(t); continue; }
    _rtsTeamOrderAll(t, function (mm) {
      if (mm.order !== 'attack' || mm.target !== t.target) _rtsOrderAttack(mm, t.target);
    });
    return 'ok';
  }
  return 'ok';
}
/* Took_Damage: the team retargets onto whoever hit it - unless it is already fighting
   something that shoots back and is in range. "There is no point in endlessly shuffling
   between targets that have firepower." */
function _rtsTeamTookDamage(u, from) {
  var G = window._rtsG;
  if (u.sqd == null || !G.teams || !G.teams[u.sqd]) return;
  var t = G.teams[u.sqd];
  if (!from || from.side !== 'player' || !t.moving) return;
  /* IsSuicide: "Charge toward target ignoring distractions". Being shot at IS the
     distraction, so a suicide team never retargets onto whoever hit it. */
  if (t.type.suicide) return;
  if (t.target === from) return;
  if (t.target && !t.target.dead) {
    var td = rtsStructDef(t.target.def) || rtsUnitDef(t.target.def);
    var lead = _rtsTeamLeader(t);
    if (td && td.weapon && lead && _rtsRangeTo(lead, t.target) <= _rtsReach(lead)) return;
  }
  t.target = from;
}

function _rtsAIAttack(urgency) {
  var G = window._rtsG, pool = [], k;
  for (k = 0; k < G.ents.length; k++) {
    var u = G.ents[k];
    if (!u.dead && u.side === 'enemy' && u.type === 'unit' && !rtsUnitDef(u.def).harvest
        && u.sqd == null && _rtsMission(u).recruitable) pool.push(u);
  }
  /* Commit a real share of the idle army, not a token squad. Sending a fixed handful let
     the AI pile up forty-odd defenders at home, which is both un-fun and unbeatable.
     IQGuardArea: only a smart opponent knows to hold some of it back as a garrison. */
  /* AttackInterval is deliberately randomised over a 4x spread in the original, so waves
     never arrive on a metronome you can set your watch by. */
  G.ai.next = RTS_WAVE_EVERY * _rtsBias('enemy').build * (0.5 + _rtsRnd() * 1.5);
  if (!_rtsHas('player', 'yard') && !_rtsHas('player', 'refinery') && !_rtsHas('player', 'power')) return false;

  /* Raise a TEAM rather than shoving a share of everything idle at the nearest building.
     A team holds a composition and a quarry, waits until it is at full strength, and then
     goes after the kind of thing it was raised to kill. */
  if (!G.teams) { G.teams = {}; G.teamSeq = 0; G.teamHold = {}; }
  var live = 0, tid;
  for (tid in G.teams) live++;
  if (live >= _rtsTeamCap()) return false;

  /* Only raise a type this army can actually crew, and respect a suspension.
     IQGuardArea: a smart opponent keeps a garrison, so it will not raise a team it would
     have to strip the whole base to fill. */
  var spare = _rtsIQAt(RTS_IQ.guardArea) ? Math.max(0, pool.length - 3) : pool.length;
  if (urgency <= RTS_URGENCY.LOW) spare = Math.floor(spare * 0.5);     /* hit at home: hold back */
  var pick = _rtsSuggestTeam(spare);
  if (!pick) return false;
  _rtsTeamMake(pick);
  G.ai.wave++;
  _rtsSay('Redline ' + pick.name + ' team inbound!');
  if (typeof _rtsSfx === 'function') _rtsSfx('alert');
  return true;
}
function _rtsUpdateAI(dt) {
  var G = window._rtsG, S = G.sides.enemy;
  if (S.lost) return;
  _rtsTeamsTick(dt);
  /* Rich: refill a line as soon as it empties, rather than waiting up to five seconds for
     the next decision. Without this the opponent banks tens of thousands of credits it
     structurally cannot spend, while the human restarts a queue the moment it frees. */
  /* Rich: refill a line the moment it empties rather than waiting up to five seconds for
     the next decision. This is a SMART behaviour and is gated like every other one. A house
     that cannot expand its base spends its whole income on units, so handing perfect queue
     efficiency to the low difficulties turned Recruit into a unit pump - 53 units against
     Commando's 61, which is not a difficulty ladder, it is one rung. */
  if (_rtsIQAt(RTS_IQ.refill) && rtsMoney(S) > RTS_AI.infantryReserve) _rtsAIUnits(S);
  G.ai.next -= dt;
  G.ai.build -= dt;
  if (G.ai.build <= 0) {
    G.ai.build = 5;
    _rtsAIStateTick(S);
    _rtsAIDeploy('enemy');

    /* Repair_AI, gated on IQRepairSell: the low difficulties simply cannot do this, which is
       why raiding a Commando base and leaving means finding it whole again. */
    if (_rtsIQAt(RTS_IQ.repairSell) && rtsMoney(S) > RTS_AI.creditReserve * 0.5) {
      for (var r = 0; r < G.ents.length; r++) {
        var b = G.ents[r];
        if (b.dead || b.side !== 'enemy' || b.type !== 'struct' || b.building || b.selling) continue;
        if (!b.repair && b.hp < b.maxHp * 0.85) { b.repair = 1; b.rtimer = 0; }
      }
    }
    _rtsAIUnits(S);
    _rtsTeamMaybeRaise();

    /* Expert_AI: score every strategy, then act from CRITICAL downward. Note the original
       computes an `acted` flag with the stated intent of stopping after the highest urgency
       level that did something - but never actually breaks on it. Following the code rather
       than the comment: every level gets its turn. */
    var urg = _rtsAIUrgency(S);
    for (var u = RTS_URGENCY.CRITICAL; u >= RTS_URGENCY.LOW; u--) {
      for (var strat in urg) if (urg[strat] === u) _rtsAIDo(strat, u, S);
    }
  }
  /* The AI places its own finished buildings. Throttled: the search is over every anchor's
     build radius, which is not something to run on every frame. */
  if (S.ready) {
    G.ai.place -= dt;
    if (G.ai.place <= 0) {
      G.ai.place = 0.6;
      if (_rtsAIPlace(S.ready)) { S.ready = null; S.readyPaid = null; S.readyTry = 0; }
      else if (++S.readyTry > 8 || !_rtsHas('enemy', 'yard')) { S.ready = null; S.readyPaid = null; S.readyTry = 0; }
    }
  }
}
function _rtsSay(m) { var G = window._rtsG; G.msg = m; G.msgT = 4; }

/* Ore regrows into partly-mined tiles and slowly seeds empty neighbours, so a worked-out
   field recovers instead of leaving a dead map (RULES.CPP: IsTGrowth / IsTSpread). */
/* MAP.CPP Map::Logic(). Ore growth is AMORTISED rather than done in one sweep: each frame
   scans `MAP_CELL_TOTAL / (GrowthRate * TICKS_PER_MINUTE)` cells from a rolling cursor, and
   candidates are collected by reservoir sampling -

       if (Random_Pick(0, Excess) <= Count) { add, or replace a random slot }
       Excess++

   - so the candidate list stays a bounded, roughly uniform sample of the whole map however
   much ore there is. When the cursor wraps, the sampled cells grow and spread. The win is
   that no frame ever pays for a full 112x112 pass; the old version walked every cell at once
   and that cost lands as a hitch on a slow machine. */
/* Random_Pick(0, hi), inclusive at both ends. */
function _rtsPick(rnd, hi) { return (rnd() * (hi + 1)) | 0; }
/* FacingType order, N first and clockwise, matching Adjacent_Cell(). */
var _RTS_FACE = [[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1]];
/* Can_Tiberium_Germinate: on the map, nothing built on it, no ore already, and ground that
   could be BUILT on - which is stricter than "passable". Ore creeping across a road or a
   riverbank looks wrong and, worse, quietly makes unbuildable ground minable. */
function _rtsCanGerminate(tx, tz) {
  var G = window._rtsG;
  if (!_rtsInB(tx, tz)) return false;
  var i = _rtsIdx(tx, tz);
  if (G.scrap[i] > 0) return false;                 /* Overlay != OVERLAY_NONE */
  if (G.blocked[i] !== 0) return false;             /* a building or impassable terrain */
  return RTS_ORE_GROUND[G.terrain ? G.terrain[i] : RTS_T_GRASS] === true;
}
/* CELL.CPP Tiberium_Adjust. A cell's density is set from HOW MANY OF ITS EIGHT NEIGHBOURS
   also carry ore, through a lookup table. That single rule is what makes a field read as a
   field: the middle is thick, the edge thins out, and nothing needs a noise function.

       static int _adj[9]    = {0,1,3,4,6,7,8,10,11};
       static int _adjgem[9] = {0,0,0,1,1,1,2,2,2};   // and clamped to 2

   The gem table is the whole gem economy. A gem cell tops out at level 2 of 11, so a gem
   patch holds a fraction of the ore a gold field of the same area does - it is worth
   crossing the map for because each scoop pays 3x, not because there is a lot of it. */
var _RTS_ADJ = [0, 1, 3, 4, 6, 7, 8, 10, 11];
var _RTS_ADJ_GEM = [0, 0, 0, 1, 1, 1, 2, 2, 2];
function _rtsTiberiumAdjust(G) {
  var lvl = new Uint8Array(RTS_N * RTS_N), tx, tz, i;
  for (tz = 0; tz < RTS_N; tz++) for (tx = 0; tx < RTS_N; tx++) {
    i = _rtsIdx(tx, tz);
    if (G.scrap[i] <= 0) continue;
    var count = 0;
    for (var f = 0; f < 8; f++) {
      var nx = tx + _RTS_FACE[f][0], nz = tz + _RTS_FACE[f][1];
      if (_rtsInB(nx, nz) && G.scrap[_rtsIdx(nx, nz)] > 0) count++;
    }
    lvl[i] = G.gems[i] ? Math.min(_RTS_ADJ_GEM[count], 2) : _RTS_ADJ[count];
  }
  for (i = 0; i < lvl.length; i++) {
    if (G.scrap[i] <= 0) continue;
    /* (OverlayData + 1) steps of ore, scaled onto this game's per-tile capacity. */
    /* RICHNESS scales the whole table. Tiberium_Adjust puts most of a blob at 7-8 ore
       neighbours and therefore near the top of _adj, which is nearly twice what the old
       radial falloff averaged - the same field footprints would have handed both sides
       double the economy. Scaling here rather than shrinking the fields matters: the
       footprints are what the AI's refinery placement and its harvesters navigate by, and
       pulling ore away from the bases stopped the Commando AI expanding at all (19
       buildings down to 8). Same map, same distances, less in each tile. */
    G.scrap[i] = (lvl[i] + 1) / RTS_ORE_LEVELS * RTS_SCRAP_TILE * RTS_ORE_RICHNESS;
  }
  G.scrapDirty = true;
}
function _rtsTickOre(dt) {
  var G = window._rtsG;
  if (!G.oreRnd) G.oreRnd = _rtsRngMake(G.seed ^ 0x5eed);
  if (!G.oreGrow) { G.oreGrow = []; G.oreSpread = []; G.oreScan = 0; G.oreGExcess = 0; G.oreSExcess = 0; }

  /* how many cells to look at this step so the whole map is covered in RTS_ORE_GROW_EVERY */
  /* Random_Pick(lo, hi) is INCLUSIVE of both ends, and the reservoir depends on that: with
     Excess 0 and Count 0 the original's test is `0 <= 0`, which is true, so the very first
     candidate always enters the list. Translating it as `rnd() * (excess+1) <= count` makes
     that first test `something-above-zero <= 0` - never true - and the list stays empty
     forever. Ore then silently never grows, with nothing thrown and nothing logged. */
  var total = RTS_N * RTS_N;
  var sub = Math.max(1, Math.ceil(total * dt / RTS_ORE_GROW_EVERY));
  var i, r;
  for (var n = 0; n < sub && G.oreScan < total; n++, G.oreScan++) {
    i = G.oreScan;
    var a = G.scrap[i];
    if (a <= 0) continue;
    if (G.gems[i]) continue;                 /* IsTGrowth is ore only - a gem field is finite */

    /* Can_Tiberium_Grow: `OverlayData >= 11` cannot grow any further. This full-tile test
       used to sit above BOTH lists, so a tile at full density was skipped outright and never
       spread either - exactly backwards, because Can_Tiberium_Spread wants the RICHEST cells
       and a full one is the likeliest seeder there is. The two questions are separate in
       CELL.CPP and have to be separate here. */
    if (a < RTS_SCRAP_TILE) {
      if (_rtsPick(G.oreRnd, G.oreGExcess) <= G.oreGrow.length) {
        if (G.oreGrow.length < RTS_ORE_SAMPLE) G.oreGrow.push(i);
        else G.oreGrow[(G.oreRnd() * G.oreGrow.length) | 0] = i;
      }
      G.oreGExcess++;
    }

    /* Can_Tiberium_Spread - only a rich cell can seed a neighbour */
    if (a > RTS_SCRAP_TILE * RTS_ORE_SPREAD_MIN) {
      if (_rtsPick(G.oreRnd, G.oreSExcess) <= G.oreSpread.length) {
        if (G.oreSpread.length < RTS_ORE_SAMPLE) G.oreSpread.push(i);
        else G.oreSpread[(G.oreRnd() * G.oreSpread.length) | 0] = i;
      }
      G.oreSExcess++;
    }
  }
  if (G.oreScan < total) return;

  /* the cursor has wrapped: apply what was sampled */
  G.oreScan = 0;
  var grew = false;
  for (n = 0; n < G.oreGrow.length; n++) {
    i = G.oreGrow[n];
    if (G.scrap[i] <= 0 || G.scrap[i] >= RTS_SCRAP_TILE) continue;
    G.scrap[i] = Math.min(RTS_SCRAP_TILE, G.scrap[i] + RTS_ORE_GROW_AMT);
    grew = true;
  }
  for (n = 0; n < G.oreSpread.length; n++) {
    i = G.oreSpread[n];
    if (G.oreRnd() >= RTS_ORE_SPREAD_CHANCE) continue;
    /* Spread_Tiberium: pick a random STARTING facing, then walk all eight in order and take
       the first cell that can germinate. Picking one direction at random and giving up when
       it fails - which is what this did - biases growth to the four cardinals and leaves
       permanent holes inside a field, because the one cell that could have been filled is
       only ever offered a 1-in-4 chance per attempt. */
    var tx = i % RTS_N, tz = (i / RTS_N) | 0;
    var off = _rtsPick(G.oreRnd, 7);
    for (var s = 0; s < 8; s++) {
      var fc = _RTS_FACE[(off + s) & 7];
      var nx = tx + fc[0], nz = tz + fc[1];
      if (!_rtsCanGerminate(nx, nz)) continue;
      G.scrap[_rtsIdx(nx, nz)] = RTS_SCRAP_TILE / RTS_ORE_LEVELS;   /* OverlayData = 0 */
      G.scrapDirty = true;           /* new tile - the render layer must re-lay the field */
      break;
    }
  }
  G.oreGrow.length = 0; G.oreSpread.length = 0;
  G.oreGExcess = 0; G.oreSExcess = 0;
  if (grew) G.oreGrew = true;
}

/* HouseClass::AI: "if there is insufficient power, then all buildings that are above half
   strength take a little bit of damage." Only buildings that actually DRAW power - the
   original notes this specifically so that land mines do not blow themselves up in a
   brownout. This is what makes losing your power plants cost something even before you
   notice the production slowdown. */
function _rtsPowerDamage(dt) {
  var G = window._rtsG;
  G.dmgT = (G.dmgT || 0) + dt;
  if (G.dmgT < RTS_DAMAGE_DELAY) return;
  G.dmgT = 0;
  for (var side in G.sides) {
    if (_rtsPowerFactor(side) >= 0.999) continue;
    for (var i = 0; i < G.ents.length; i++) {
      var e = G.ents[i];
      if (e.dead || e.type !== 'struct' || e.side !== side || e.building || e.selling) continue;
      var d = rtsStructDef(e.def);
      if (d.power >= 0) continue;                     /* only what draws power */
      if (e.hp <= e.maxHp * RTS_COND_YELLOW) continue; /* "above half strength" */
      e.hp -= RTS_POWER_DAMAGE;
      e.hitT = 0.18;
    }
  }
}

/* ------------------------------------------------------------ main tick */
/* ========================================================= triggers (TRIGGER.CPP) --
   Find_Or_Make: ONE live trigger instance per trigger TYPE, shared by everything attached to
   it. TriggerTypeClass is the definition (in RTS_TRIGGERS); this is TriggerClass, the
   instance, and it carries the mutable per-event state TDEventClass holds. */
function _rtsTrigType(name) {
  for (var i = 0; i < RTS_TRIGGERS.length; i++) if (RTS_TRIGGERS[i].name === name) return RTS_TRIGGERS[i];
  return null;
}
function _rtsTEventReset(inst, slot) {
  var T = inst.type, spec = (slot === 1) ? T.event1 : T.event2;
  var td = (slot === 1) ? inst.td1 : inst.td2;
  td.tripped = false;
  /* "if (Event == TEVENT_TIME) td.Timer = Data.Value * (TICKS_PER_MINUTE/10)" */
  td.timer = (spec && spec[0] === 'time') ? (spec[1] || 0) * RTS_TIMER_TICK : 0;
}
function _rtsTrigFindOrMake(name) {
  var G = window._rtsG;
  if (!G.trig) _rtsTrigInit(G);
  if (G.trig[name]) return G.trig[name];
  var T = _rtsTrigType(name);
  if (!T) return null;
  var inst = { name:name, type:T, td1:{ tripped:false, timer:0 }, td2:{ tripped:false, timer:0 },
    attach:0, cell:null, fired:0 };
  G.trig[name] = inst;
  _rtsTEventReset(inst, 1); _rtsTEventReset(inst, 2);
  return inst;
}
function _rtsTrigDestroy(inst) {
  var G = window._rtsG;
  /* Detach_This_From_All: nothing may keep pointing at a deleted trigger. */
  for (var i = 0; i < G.ents.length; i++) if (G.ents[i].trig === inst.name) G.ents[i].trig = null;
  delete G.trig[inst.name];
}
function _rtsTrigInit(G) {
  G.trig = {};
  G.globals = {};
  G.mtimer = { active:false, t:0 };
  G.justBuilt = { player:{ struct:null, unit:null }, enemy:{ struct:null, unit:null } };
  G.lost = { player:{ units:0, structs:0 }, enemy:{ units:0, structs:0 } };
  for (var i = 0; i < RTS_TRIGGERS.length; i++) _rtsTrigFindOrMake(RTS_TRIGGERS[i].name);
}

/* TEventClass::operator(). Three classes of event, handled in the order the original does:
   forced first, then the latch, then ambient, then the notify gate, then polled house state. */
function _rtsTEvent(inst, slot, event, obj, forced) {
  var G = window._rtsG, T = inst.type;
  var spec = (slot === 1) ? T.event1 : T.event2;
  var td = (slot === 1) ? inst.td1 : inst.td2;
  if (!spec) return false;
  var name = spec[0], arg = spec[1];
  var def = RTS_TEVENTS[name];
  if (!def) return false;

  /* "If this trigger event has been forced, then no further checks are required." */
  if (forced) td.tripped = true;
  /* THE LATCH. Once tripped, an event stays true until Reset - which is the only reason
     `and` can span time at all: event 1 may trip minutes before event 2. */
  if (td.tripped) return true;

  if (name === 'none') return false;
  if (name === 'globalSet')   return !!G.globals[arg];
  if (name === 'globalClear') return !G.globals[arg];
  if (name === 'timerExpired') return !!(G.mtimer.active && G.mtimer.t <= 0);
  if (name === 'time')        return td.timer <= 0;

  /* "just by the fact that this routine is called" - these are only true when REPORTED. */
  if (def.kind === 'notify') {
    if (name !== 'any' && event !== name && event !== 'any') return false;
    if (name !== 'any') { td.tripped = true; }
    return true;
  }

  var who = (def.who === 'arg') ? arg : T.house;
  var S = G.sides[who];
  if (!S) return false;
  switch (name) {
    case 'credits':        return rtsMoney(S) >= arg;
    case 'nUnitsLost':     return G.lost[who].units >= arg;
    case 'nBuildingsLost': return G.lost[who].structs >= arg;
    case 'build':          if (G.justBuilt[who].struct !== arg) return false; td.tripped = true; return true;
    case 'buildUnit':      if (G.justBuilt[who].unit !== arg) return false;  td.tripped = true; return true;
    case 'noFactories':    return !_rtsHas(who, 'factory') && !_rtsHas(who, 'barracks') && !_rtsHas(who, 'yard');
    case 'buildingExists': return !!_rtsHas(who, arg);
    case 'lowPower':       return S.powerMade < S.powerUsed;
    case 'houseDiscovered': return _rtsHouseSeen(who);
    case 'buildingsDestroyed': return !_rtsAnyAlive(who, 'struct');
    case 'unitsDestroyed':     return !_rtsAnyAlive(who, 'unit');
    case 'allDestroyed':       return !_rtsAnyAlive(who, 'struct') && !_rtsAnyAlive(who, 'unit');
    default: return false;
  }
}
function _rtsAnyAlive(side, type) {
  var G = window._rtsG;
  for (var i = 0; i < G.ents.length; i++) {
    var e = G.ents[i];
    if (!e.dead && e.side === side && e.type === type) return true;
  }
  return false;
}
/* IsDiscovered: has the player actually laid eyes on anything this house owns? The shroud
   already records that per cell, so no separate flag is needed. */
function _rtsHouseSeen(side) {
  var G = window._rtsG;
  for (var i = 0; i < G.ents.length; i++) {
    var e = G.ents[i];
    if (e.dead || e.side !== side) continue;
    var tx = _rtsTX(e.x), tz = _rtsTX(e.z);
    if (_rtsInB(tx, tz) && G.mapped[_rtsIdx(tx, tz)]) return true;
  }
  return false;
}

/* TActionClass::operator(). Returns whether it did anything - TRIGGER.CPP gates the
   trigger's own deletion/reset on this, so a failed action leaves the trigger armed. */
function _rtsTAction(inst, spec, obj, cell) {
  var G = window._rtsG;
  if (!spec) return false;
  var act = spec[0], arg = spec[1];
  if (!RTS_TACTIONS[act]) return false;
  var i, t, ty;
  switch (act) {
    case 'none': return false;
    case 'text':
      /* Rate-limited; see RTS_MESSAGE_DELAY. Returning false leaves the trigger armed. */
      if (!G.msgSaid) G.msgSaid = {};
      if (G.msgSaid[arg] != null && G.t - G.msgSaid[arg] < RTS_MESSAGE_DELAY) return false;
      G.msgSaid[arg] = G.t; _rtsSay(arg); return true;
    case 'playSound': if (typeof _rtsSfx === 'function') _rtsSfx(arg); return true;
    case 'win':
      /* "Really the house value is only used to determine if it is the player or computer." */
      if (arg === 'player') { G.over = 'win'; G.sides.enemy.lost = true; }
      else { G.over = 'lose'; G.sides.player.lost = true; }
      return true;
    case 'lose':
      if (arg === 'player') { G.over = 'lose'; G.sides.player.lost = true; }
      else { G.over = 'win'; G.sides.enemy.lost = true; }
      return true;
    case 'setGlobal':   G.globals[arg] = true;  return true;
    case 'clearGlobal': G.globals[arg] = false; return true;
    case 'autocreate':  G.alerted = true; return true;
    case 'baseBuilding': G.noBuild = !arg; return true;
    case 'beginProduction': G.sides[arg].producing = true; return true;
    case 'preferredTarget': G.preferred = G.preferred || {}; G.preferred[inst.type.house] = arg; return true;
    case 'allHunt': if (arg === 'enemy') { _rtsAIAllToHunt(); return true; } return false;
    case 'fireSale': G.sides[arg].fireSale = true; return true;
    case 'revealAll':
      for (i = 0; i < G.mapped.length; i++) G.mapped[i] = 1;
      return true;
    case 'revealSome':
      var w = _rtsWayptPos(arg);
      if (!w) return false;
      _rtsSightFrom(_rtsTX(w.x), _rtsTX(w.z), Math.min(RTS_SIGHT_MAX, 10));
      return true;
    case 'startTimer': if (G.mtimer.active) return false; G.mtimer.active = true; return true;
    case 'stopTimer':  if (!G.mtimer.active) return false; G.mtimer.active = false; return true;
    case 'setTimer':   G.mtimer.t = (arg || 0) * RTS_TIMER_TICK; G.mtimer.active = true; return true;
    case 'addTimer':   G.mtimer.t += (arg || 0) * RTS_TIMER_TICK; return true;
    /* "if (MissionTimer <= value) MissionTimer = 0" - it clamps, it does not go negative. */
    case 'subTimer':   G.mtimer.t = Math.max(0, G.mtimer.t - (arg || 0) * RTS_TIMER_TICK); return true;
    case 'createTeam':
      ty = _rtsTeamTypeByName(arg);
      if (!ty) return false;
      _rtsTeamMake(ty); return true;
    case 'destroyTeam':
      ty = _rtsTeamTypeByName(arg);
      if (!ty) return false;
      var n = 0;
      for (var tid in G.teams) if (G.teams[tid].type === ty) { _rtsTeamDisband(G.teams[tid]); n++; }
      return n > 0;
    case 'reinforce':
      ty = _rtsTeamTypeByName(arg);
      if (!ty) return false;
      return _rtsTeamReinforce(ty);
    case 'destroyObject':
      if (!obj || obj.dead) return false;
      _rtsDamage(obj, obj.hp + 1, null);
      return true;
    /* "A forced trigger will force an existing trigger of that type or will create a trigger
       of that type and then force it to be sprung." */
    case 'forceTrigger':
      var other = _rtsTrigFindOrMake(arg);
      if (!other) return false;
      _rtsTrigSpring(other, 'any', null, null, true);
      return true;
    /* "Destroying a trigger means that all triggers of that type will be destroyed." */
    case 'destroyTrigger':
      if (!G.trig[arg]) return false;
      _rtsTrigDestroy(G.trig[arg]);
      return true;
    default: return false;
  }
}
function _rtsTeamTypeByName(name) {
  for (var i = 0; i < RTS_TEAM_TYPES.length; i++) if (RTS_TEAM_TYPES[i].name === name) return RTS_TEAM_TYPES[i];
  return null;
}
/* Do_Reinforcements: build the team's whole composition at the house's own waypoint. It
   REPORTS FAILURE if nothing could be placed, which is exactly the case TRIGGER.CPP's
   `if (ok)` gate exists for - the trigger stays armed and tries again. */
function _rtsTeamReinforce(ty) {
  var w = _rtsWayptPos('home');
  if (!w) return false;
  var t = _rtsTeamMake(ty), made = 0, k, n;
  for (k in ty.members) {
    for (n = 0; n < ty.members[k]; n++) {
      var off = _rtsTeamSpread(made);
      var u = _rtsSpawnUnit('enemy', k, w.x + off.x, w.z + off.z);
      if (u) { _rtsTeamAdd(t, u); u.init = true; made++; }
    }
  }
  if (!made) { _rtsTeamDisband(t); return false; }
  return true;
}

/* TriggerClass::Spring. */
function _rtsTrigSpring(inst, event, obj, cell, forced) {
  var T = inst.type, e1, e2 = false, exec = false;

  e1 = _rtsTEvent(inst, 1, event, obj, forced);

  /* "Forced triggers must presume that the cell parameter is invalid" and bypass
     EventControl entirely - a chained trigger does not re-check its own conditions. */
  if (forced) {
    cell = inst.cell;
    exec = true;
  } else {
    switch (T.control || 'only') {
      case 'and':
        e2 = _rtsTEvent(inst, 2, event, obj, forced);
        exec = (e1 && e2); break;
      case 'linked':
      case 'or':
        e2 = _rtsTEvent(inst, 2, event, obj, forced);
        exec = (e1 || e2); break;
      default:
        exec = e1; break;
    }
  }
  if (!exec) return false;

  /* SEMIPERSISTANT detaches as it goes and only actually springs once the LAST attachment
     is gone. */
  if (T.persist === 'semi') {
    if (obj) obj.trig = null;
    inst.attach--;
    if (inst.attach > 0) return false;
  }

  var ok = false;
  if (T.control === 'linked') {
    /* Each event fires ITS OWN action rather than both firing together. */
    if (e1 || forced) ok = _rtsTAction(inst, T.action1, obj, cell) || ok;
    if (e2 && !forced) ok = _rtsTAction(inst, T.action2, obj, cell) || ok;
  } else if ((T.actionControl || 'and') === 'only') {
    ok = _rtsTAction(inst, T.action1, obj, cell);
  } else {
    ok = _rtsTAction(inst, T.action1, obj, cell);
    ok = _rtsTAction(inst, T.action2, obj, cell) || ok;
  }

  /* "If at least one action was performed, then consider this trigger to have completed."
     An action that reported failure leaves the trigger armed to try again. */
  if (ok) {
    inst.fired++;
    if (T.persist === 'volatile' || (T.persist === 'semi' && inst.attach <= 1)) {
      _rtsTrigDestroy(inst);
    } else {
      _rtsTEventReset(inst, 1); _rtsTEventReset(inst, 2);
    }
  }
  return ok;
}
/* The notification path: something happened to an object, tell its trigger. */
function _rtsTrigNotify(event, obj, cell) {
  var G = window._rtsG;
  if (!G || !G.trig) return;
  if (obj && obj.trig && G.trig[obj.trig]) { _rtsTrigSpring(G.trig[obj.trig], event, obj, cell, false); return; }
  for (var name in G.trig) _rtsTrigSpring(G.trig[name], event, obj, cell, false);
}
function _rtsTriggersTick(dt) {
  var G = window._rtsG;
  if (!G.trig) _rtsTrigInit(G);
  if (G.mtimer.active && G.mtimer.t > 0) G.mtimer.t = Math.max(0, G.mtimer.t - dt);
  var name, inst;
  for (name in G.trig) {
    inst = G.trig[name];
    if (inst.td1.timer > 0) inst.td1.timer = Math.max(0, inst.td1.timer - dt);
    if (inst.td2.timer > 0) inst.td2.timer = Math.max(0, inst.td2.timer - dt);
  }
  /* LogicTriggers get an ANY pass every frame; that is how ambient and polled events are
     ever noticed without something reporting them. */
  for (name in G.trig) {
    inst = G.trig[name];
    if (!G.trig[name]) continue;
    _rtsTrigSpring(inst, 'any', null, null, false);
  }
  /* Just_Built is a one-frame signal, cleared after the pass that could read it. */
  G.justBuilt.player.struct = G.justBuilt.player.unit = null;
  G.justBuilt.enemy.struct = G.justBuilt.enemy.unit = null;
}

function _rtsTick(dt) {
  var G = window._rtsG;
  if (!G || G.over) return;
  if (dt > 0.1) dt = 0.1;                        /* never let a stall fast-forward the battle */
  G.t += dt;
  if (G.msgT > 0) G.msgT -= dt;

  _rtsTickOre(dt);
  _rtsVisTick(dt);
  _rtsPowerDamage(dt);
  /* Power_Output tracks hit points, so it has to be re-totalled before anything reads it. */
  _rtsRecalcPower('player'); _rtsRecalcPower('enemy');
  _rtsTickProduction('player', dt);
  _rtsTickProduction('enemy', dt);
  _rtsUpdateAI(dt);
  _rtsTriggersTick(dt);

  var i, e;
  for (i = 0; i < G.ents.length; i++) {
    e = G.ents[i];
    if (e.dead) continue;
    if (e.inside) continue;                      /* riding in a transport - see _rtsAboard */
    if (e.type === 'unit') _rtsUpdateUnit(e, dt); else _rtsUpdateStruct(e, dt);
  }
  _rtsSeparate(dt);
  _rtsUpdateProj(dt);

  if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 2.2);
  _rtsAnimAI(dt);
  _rtsCrateAI(dt);
  for (i = G.fx.length - 1; i >= 0; i--) {
    var fxi = G.fx[i];
    fxi.t += dt;
    if (fxi.kind === 'debris') {
      fxi.x += fxi.vx * dt; fxi.z += fxi.vz * dt;
      fxi.vy -= 34 * dt; fxi.y += fxi.vy * dt;
      if (fxi.y < 0) { fxi.y = 0; fxi.vy = -fxi.vy * 0.35; fxi.vx *= 0.5; fxi.vz *= 0.5; }
      if (fxi.t > 1.6) G.fx.splice(i, 1);
      continue;
    }
    if (!RTS_ANIMS[fxi.kind] && fxi.t > 0.75) G.fx.splice(i, 1);
  }
  /* CountDown. A destroyed structure keeps burning on the map for a moment before it is
     actually removed; everything else is reaped as soon as its death effects are in flight.
     Nothing set `reaped` before this, so dead entities accumulated in the list forever. */
  for (i = G.ents.length - 1; i >= 0; i--) {
    e = G.ents[i];
    if (!e.dead) continue;
    if (e.wreck > 0) { e.wreck -= dt; continue; }
    G.ents.splice(i, 1);
    delete G.byId[e.id];
  }

  /* win / lose: losing every structure ends it, the way it did in the originals */
  var pAlive = 0, eAlive = 0;
  for (i = 0; i < G.ents.length; i++) {
    e = G.ents[i];
    if (e.dead || e.type !== 'struct') continue;
    if (e.side === 'player') pAlive++; else eAlive++;
  }
  if (!pAlive) { G.over = 'lose'; G.sides.player.lost = true; }
  else if (!eAlive) { G.over = 'win'; G.sides.enemy.lost = true; }
}
