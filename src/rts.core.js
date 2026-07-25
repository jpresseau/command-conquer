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

/* ------------------------------------------------------------- grid helpers */
function _rtsIdx(tx, tz) { return tz * RTS_N + tx; }
function _rtsInB(tx, tz) { return tx >= 0 && tz >= 0 && tx < RTS_N && tz < RTS_N; }
function _rtsWX(tx) { return (tx - RTS_N / 2 + 0.5) * RTS_TILE; }          /* tile -> world centre */
function _rtsTX(x)  { return Math.floor(x / RTS_TILE + RTS_N / 2); }        /* world -> tile */
function _rtsBlocked(tx, tz) { var G = window._rtsG; return !_rtsInB(tx, tz) || G.blocked[_rtsIdx(tx, tz)] !== 0; }

/* Deterministic PRNG so a given seed always lays out the same battlefield. */
function _rtsRngMake(seed) {
  var s = (seed || 1) >>> 0;
  return function () { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
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
  return { key:key, credits:RTS_START_CREDITS, powerMade:0, powerUsed:0,
    q:{ struct:null, infantry:null, vehicle:null },   /* one build line per category, like the classic sidebar */
    ready:null, readyTry:0,                            /* finished structure awaiting placement */
    lost:false };
}
/* ------------------------------------------------------------------ terrain --
   An earlier map was 62 random 1-3 tile rock rectangles on otherwise empty ground, and it
   looked like a field with gravel on it. The games this is modelled on put a *landscape*
   under the battle: dense conifer forest, rock ridges, a shoreline, and dirt roads cutting
   through it all. That is what this builds.

   Everything here is clustered noise rather than scattered singles - a grove of twenty
   trees reads as forest, twenty lone trees read as litter. Roads are carved LAST and are
   what guarantees the two bases can still reach each other; see _rtsCarveRoad. */
function _rtsGenTerrain(G, rnd) {
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
  _rtsCarveRoad(G, 20, 90, 92, 22, rnd);          /* the main diagonal, base to base */
  _rtsCarveRoad(G, 20, 90, 90, 78, rnd);          /* south branch, toward the lake */
  _rtsCarveRoad(G, 92, 22, 26, 34, rnd);          /* north branch */

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
  var reach = new Uint8Array(N * N), stack = [_rtsIdx(20, 90)];
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
      _rtsCarveRoad(G, tx, tz, 20, 90, rnd, true);   /* cut through to the player start */
      /* One carve reconnects the whole blob, so re-run the fill rather than carving per tile. */
      reach.fill(0); stack = [_rtsIdx(20, 90)]; reach[stack[0]] = 1;
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

function _rtsNewGame(seed, diff) {
  var G = {
    t:0, seed:seed || 12345, over:null, msg:null, msgT:0, shake:0,
    /* the whole difficulty system is this one string plus RTS_DIFF; see _rtsBias */
    diff:(RTS_DIFF[diff] ? diff : (RTS_DIFF[window._RTS_DIFF] ? window._RTS_DIFF : RTS_DIFF_DEFAULT)),
    blocked:new Uint8Array(RTS_N * RTS_N),
    terrain:new Uint8Array(RTS_N * RTS_N),  /* RTS_T_* - what the ground IS, for the renderer */
    scorch:new Uint8Array(RTS_N * RTS_N),   /* 0 none, 1-6 scorch variant, +8 bit = crater */
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
    ai:{ next:0, wave:0, build:6, place:0, state:0, lastHit:-999, want:null },
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
     decision, and both bases are meant to want the middle. */
  var fields = [[28,82,7,0],[82,28,7,0],[38,38,6,0],[74,74,6,0],[56,56,10,0],
                [22,32,5,0],[90,80,5,0],[34,62,5,1],[78,50,5,1]];
  for (var f = 0; f < fields.length; f++) {
    var cx = fields[f][0], cz = fields[f][1], rad = fields[f][2], isGem = fields[f][3];
    for (var tx = cx - rad; tx <= cx + rad; tx++) for (var tz = cz - rad; tz <= cz + rad; tz++) {
      if (!_rtsInB(tx, tz)) continue;
      var d = Math.hypot(tx - cx, tz - cz);
      if (d > rad) continue;
      var amt = RTS_SCRAP_TILE * (1 - d / (rad + 1)) * (0.6 + rnd() * 0.6);
      if (amt > 40) { G.scrap[_rtsIdx(tx, tz)] = amt; if (isGem) G.gems[_rtsIdx(tx, tz)] = 1; }
    }
  }
  _rtsGenTerrain(G, rnd);

  /* --- the two bases: player bottom-left, Redline top-right.
     Footprints are small (Command Yard 3x3) so a base is a cluster of compact structures
     on a large map, the way the originals laid out - not a few slabs filling the screen. --- */
  _rtsPlaceStruct('player', 'yard', 18, 88, true);
  _rtsPlaceStruct('player', 'power', 23, 89, true);
  _rtsSpawnUnit('player', 'rifle', _rtsWX(21), _rtsWX(84));
  _rtsSpawnUnit('player', 'rifle', _rtsWX(23), _rtsWX(85));
  _rtsSpawnUnit('player', 'buggy', _rtsWX(19), _rtsWX(85));

  _rtsPlaceStruct('enemy', 'yard', 91, 20, true);
  _rtsPlaceStruct('enemy', 'power', 87, 21, true);
  _rtsPlaceStruct('enemy', 'refinery', 91, 25, true);
  _rtsPlaceStruct('enemy', 'barracks', 87, 25, true);
  _rtsPlaceStruct('enemy', 'factory', 95, 24, true);
  _rtsPlaceStruct('enemy', 'turret', 89, 29, true);
  _rtsPlaceStruct('enemy', 'turret', 94, 29, true);
  _rtsSpawnUnit('enemy', 'harvester', _rtsWX(92), _rtsWX(32));
  _rtsSpawnUnit('enemy', 'rifle', _rtsWX(89), _rtsWX(32));
  _rtsSpawnUnit('enemy', 'tank', _rtsWX(94), _rtsWX(33));

  _rtsRecalcPower('player'); _rtsRecalcPower('enemy');
  return G;
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
function _rtsCanPlace(side, key, tx, tz) {
  var G = window._rtsG, d = rtsStructDef(key);
  if (!d) return false;
  for (var ax = tx; ax < tx + d.w; ax++) for (var az = tz; az < tz + d.h; az++) {
    if (!_rtsInB(ax, az)) return false;
    if (G.blocked[_rtsIdx(ax, az)] !== 0) return false;
    if (G.scrap[_rtsIdx(ax, az)] > 0) return false;
  }
  /* must be within build radius of one of your own structures (classic base-creep rule) */
  var cx = tx + d.w / 2, cz = tz + d.h / 2, near = false;
  for (var i = 0; i < G.ents.length; i++) {
    var o = G.ents[i];
    if (o.type !== 'struct' || o.side !== side || o.dead || o.building) continue;
    var od = rtsStructDef(o.def);
    if (Math.hypot(cx - (o.tx + od.w / 2), cz - (o.tz + od.h / 2)) <= RTS_BUILD_RADIUS) { near = true; break; }
  }
  return near;
}
function _rtsPlaceStruct(side, key, tx, tz, instant) {
  var G = window._rtsG, d = rtsStructDef(key);
  var e = { id:G.nextId++, type:'struct', side:side, def:key, tx:tx, tz:tz,
    x:_rtsWX(tx) + (d.w - 1) * RTS_TILE / 2, z:_rtsWX(tz) + (d.h - 1) * RTS_TILE / 2,
    hp:instant ? d.hp : d.hp * 0.15, maxHp:d.hp, rot:0, cool:0, target:null,
    building:instant ? 0 : 1, bprog:instant ? 1 : 0, dead:false, mesh:null };
  G.ents.push(e); G.byId[e.id] = e;
  _rtsFootprint(e, true);
  _rtsFlushForPlacement(e);
  _rtsRecalcPower(side);
  /* Only a pre-placed (instant) structure hands over its free unit here. A structure that
     has to be built delivers it in _rtsUpdateStruct when construction finishes - granting
     it in both places gave every constructed refinery two harvesters for the price of one. */
  if (instant) _rtsGrandOpening(e);
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
function _rtsKill(e) {
  var G = window._rtsG;
  if (e.dead) return;
  e.dead = true;
  if (e.type === 'struct') { _rtsFootprint(e, false); _rtsRecalcPower(e.side); }
  if (e.type === 'struct' && e.selling) {
    /* Sold, not destroyed: a puff of dust where it stood, and no fireworks. */
    G.fx.push({ kind:'pop', x:e.x, y:1, z:e.z, t:0, big:1.6 });
  }
  else if (e.type === 'struct') {
    var sd = rtsStructDef(e.def);
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
      if (!e.crushed && Math.random() < RTS_CREW_CHANCE) {
        var cell = _rtsNearestOpen(_rtsTX(e.x), _rtsTX(e.z), 4);
        if (cell) {
          var crew = _rtsSpawnUnit(e.side, 'rifle', _rtsWX(cell[0]), _rtsWX(cell[1]));
          if (crew) {
            crew.hp = Math.max(5, Math.round(crew.maxHp * (0.15 + Math.random() * 0.35)));
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
  /* WhoLastHurtMe: a thing that burns to death is still someone's kill. Scoring it off the
     victim's side alone credited the player for units the AI's own fires finished off. */
  if (e.side === 'enemy' && (!e.hurtBy || e.hurtBy === 'player')) G.stats.killed++;
  var si = G.sel.indexOf(e); if (si >= 0) G.sel.splice(si, 1);
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
  for (var i = 0; i < want; i++) if (Math.random() < RTS_SURVIVOR_ODDS) n++;
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
  if (S.credits < cost) {
    /* Repair_AI gives up when it cannot pay, and the AI sells rather than sit on a wreck. */
    e.repair = 0;
    if (e.side === 'player') _rtsSay('Not enough credits to keep repairing.');
    else if (e.hp < e.maxHp * RTS_COND_RED) _rtsSell(e);
    return;
  }
  S.credits -= cost;
  e.hp = Math.min(e.maxHp, e.hp + e.maxHp * RTS_REPAIR_STEP);
}
/* Sell_Back: half the price back straight away, then the building deconstructs (the build-up
   animation played backwards) and its crew walks out. */
function _rtsSell(e) {
  var G = window._rtsG;
  if (!e || e.dead || e.type !== 'struct' || e.selling) return false;
  if (e.def === 'yard') return false;           /* selling the Command Yard is suicide, not a sale */
  e.selling = 1; e.repair = 0; e.building = 1; e.bprog = 1;
  G.sides[e.side].credits += Math.round(rtsStructDef(e.def).cost * RTS_REFUND_PCT
    * (e.hp / e.maxHp * 0.5 + 0.5));           /* a wreck is worth less than a clean building */
  if (e.side === 'player' && typeof _rtsSfx === 'function') _rtsSfx('build');
  return true;
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
      if (!host || host.dead) { f.att = 0; }
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
      if (def.chain) {
        /* ChainTo: it does not end, it metamorphoses. */
        f.kind = def.chain; f.t = 0; f.mid = 0;
        f.loops = RTS_ANIMS[def.chain].loops || 1;
        f.big = (f.big || 1) * 0.6;
        continue;
      }
      G.fx.splice(i, 1);
    }
  }
}
/* COMBAT.CPP Combat_Anim. */
function _rtsCombatAnim(dmg, x, z, big) {
  var G = window._rtsG;
  if (!(dmg > 0)) return null;
  var tx = _rtsTX(x), tz = _rtsTX(z);
  var water = _rtsInB(tx, tz) && G.terrain[_rtsIdx(tx, tz)] === RTS_T_WATER;
  var kind = water ? 'splash' : (dmg < RTS_ANIM_PIFF ? 'piff' : (dmg < RTS_ANIM_BOOM ? 'hit' : 'boom'));
  /* scale with damage the way the original steps through its list, rather than one fixed size */
  var scale = (big || 1) * (0.7 + Math.min(1, dmg / 90) * 0.7);
  G.fx.push({ kind:kind, x:x, y:1, z:z, t:0, big:scale });
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
  if (s.powerUsed <= s.powerMade) return 1;
  return Math.max(RTS_LOW_POWER_MIN, s.powerMade / Math.max(1, s.powerUsed));
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
  if (cat === 'infantry' && !_rtsHas(side, 'barracks')) return false;
  if (cat === 'vehicle' && !_rtsHas(side, 'factory')) return false;
  if (S.credits < _rtsCostOf(side, def)) return false;
  return true;
}
function _rtsQueue(side, key) {
  if (!_rtsCanQueue(side, key)) return false;
  var S = window._rtsG.sides[side], def = rtsStructDef(key) || rtsUnitDef(key);
  S.q[_rtsQueueCat(key)] = { key:key, prog:0, total:_rtsBuildTimeOf(side, def),
    cost:_rtsCostOf(side, def), paid:0 };
  return true;
}
function _rtsCancel(side, cat) {
  var S = window._rtsG.sides[side], q = S.q[cat];
  if (!q) return;
  S.credits += q.paid;         /* refund what was actually spent */
  S.q[cat] = null;
}
function _rtsTickProduction(side, dt) {
  var G = window._rtsG, S = G.sides[side], pf = _rtsPowerFactor(side), cat;
  for (cat in S.q) {
    var q = S.q[cat]; if (!q) continue;
    var rate = dt / q.total * pf;                  /* fraction of the job done this step */
    var want = q.cost * rate;
    if (want > S.credits) { want = S.credits; rate = q.cost > 0 ? want / q.cost : rate; }
    if (q.cost > 0 && want <= 0) continue;          /* broke: the line stalls, as it should */
    S.credits -= want; q.paid += want; q.prog += rate;
    if (q.prog >= 1) {
      S.q[cat] = null;
      if (cat === 'struct') S.ready = q.key;        /* wait for the player to place it */
      else _rtsDeliverUnit(side, q.key);
      if (side === 'player' && typeof _rtsSfx === 'function') _rtsSfx(cat === 'struct' ? 'ready' : 'unitready');
    }
  }
}
function _rtsDeliverUnit(side, key) {
  var u = rtsUnitDef(key);
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
function _rtsOrderAttack(e, tgt) {
  if (e.type !== 'unit') return;
  var d = rtsUnitDef(e.def);
  if (!d.weapon) { _rtsOrderMove(e, tgt.x, tgt.z, false); return; }
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
function _rtsFindTarget(e, range) {
  var G = window._rtsG, foe = _rtsEnemyOf(e.side), best = null, bd = 1e9;
  for (var i = 0; i < G.ents.length; i++) {
    var o = G.ents[i];
    if (o.dead || o.side !== foe) continue;
    var d = _rtsRangeTo(e, o);
    if (d > range) continue;
    /* prefer units over buildings at equal-ish distance - shoot the thing shooting you */
    var score = d + (o.type === 'struct' ? 8 : 0);
    if (score < bd) { bd = score; best = o; }
  }
  return best;
}
/* TURRET.CPP Fire_Direction / Fire_Coord. A shot leaves the MUZZLE, and the muzzle is on
   whichever facing actually carries the weapon: the turret's for a turreted vehicle, the
   hull's for everything else. Spawning shots at the object's centre is what makes a tank
   with its gun swung 90 degrees appear to fire sideways out of its own flank while the
   barrel points somewhere else entirely - the turret is drawn separately, so the mismatch
   is plainly visible. Barrel reach is derived from the body radius rather than a new table:
   a turret overhangs its hull, a hull-mounted gun sits inside the body. */
function _rtsMuzzleAngle(e) {
  if (e.type === 'struct') return e.rot;                    /* the gun IS the building */
  return RTS_TURRETED[e.def] ? e.turret : e.rot;
}
function _rtsFireCoord(e) {
  var reach;
  if (e.type === 'struct') reach = RTS_MUZZLE_STRUCT;
  else {
    var d = rtsUnitDef(e.def);
    reach = (d.r || 1) * (RTS_TURRETED[e.def] ? RTS_MUZZLE_TURRET : RTS_MUZZLE_HULL);
  }
  var a = _rtsMuzzleAngle(e);
  return { x:e.x + Math.cos(a) * reach, z:e.z + Math.sin(a) * reach };
}
function _rtsFire(e, tgt, w) {
  var G = window._rtsG, bias = _rtsBias(e.side);
  e.cool = w.cool * bias.rof; e.fire = 0.09;      /* ROFBias: higher = slower reload */
  e.recoil = RTS_RECOIL_TIME;                     /* Recoil_Adjust */
  var m = _rtsFireCoord(e);
  if (typeof _rtsSfx === 'function') _rtsSfx(w.shot === 'tracer' ? (w.dmg > 7 ? 'mg' : 'rifle')
    : (w.shot === 'missile' ? 'rocket' : (e.type === 'struct' ? 'turretgun' : 'cannon')), e.x, e.z);
  var dmg = w.dmg * (w.vs[rtsArmour(tgt)] || 1) * bias.fire;
  if (w.speed <= 0) {
    _rtsDamage(tgt, dmg, e);
    G.fx.push({ kind:'tracer', x:m.x, y:1.3, z:m.z, x2:tgt.x, y2:1.3, z2:tgt.z, t:0 });
    _rtsCombatAnim(dmg, tgt.x, tgt.z, 0.5);
  } else {
    /* travel still starts from the barrel, but aims at the mark: Can_Fire has already
       insisted the barrel is within FIRE_FACING tolerance of it, and letting a shell fly
       along the barrel instead would make tanks miss - a balance change, not this one. */
    var d = Math.hypot(tgt.x - m.x, tgt.z - m.z) || 1;
    G.proj.push({ kind:w.shot, x:m.x, y:1.4, z:m.z, vx:(tgt.x - m.x) / d * w.speed, vz:(tgt.z - m.z) / d * w.speed,
      speed:w.speed, tgt:tgt, dmg:dmg, splash:w.splash, side:e.side, life:4, w:w, from:e });
  }
}
/* INFANTRY.CPP Fear_AI + Scatter. Only infantry have this. */
function _rtsFearAI(e, dt) {
  if (e.fear > 0) e.fear = Math.max(0, e.fear - RTS_FEAR_DECAY * dt);
  if (e.prone) {
    if (e.fear < RTS_FEAR.ANXIOUS) e.prone = 0;
  } else if (e.fear >= RTS_FEAR.ANXIOUS && !e.path) {
    e.prone = 1;                     /* do not drop while actually travelling somewhere */
  }
}
function _rtsScatter(e, fromX, fromZ) {
  var G = window._rtsG;
  var a = Math.atan2(e.z - fromZ, e.x - fromX);
  a += (Math.random() - 0.5) * (Math.PI / 2);      /* Random_Pick(0,4)-2 facings of spread */
  var d = RTS_TILE * (1.5 + Math.random());
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
function _rtsDamage(tgt, dmg, from, floor) {
  if (!tgt || tgt.dead) return;
  if (tgt.prone) dmg *= RTS_PRONE_DAMAGE;
  dmg /= _rtsBias(tgt.side).armor;                 /* ArmorBias defends the whole house */
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
  if (tgt.type === 'struct' && from && from.side && from.side !== tgt.side) _rtsAttacked(tgt.side);
  if (tgt.type === 'unit' && from && !tgt.order && rtsUnitDef(tgt.def).weapon) { tgt.order = 'attack'; tgt.target = from; }
  if (tgt.hp <= 0) _rtsKill(tgt);
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
  else if (tgt.type === 'unit' && !tgt.burning && tgt.hp < tgt.maxHp * 0.3) {
    /* Attach_To: the flame follows the unit and eats it, exactly as ANIM.CPP does. */
    tgt.burning = 1;
    window._rtsG.fx.push({ kind:'fire', x:tgt.x, y:1, z:tgt.z, t:0, big:0.75, att:tgt.id, loops:3 });
  }
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
  var G = window._rtsG, d = rtsUnitDef(e.def), w = d.weapon ? RTS_WEAPONS[d.weapon] : null;
  if (e.cool > 0) e.cool -= dt;
  if (e.fire > 0) e.fire -= dt;
  if (e.recoil > 0) e.recoil -= dt;
  if (e.hitT > 0) e.hitT -= dt;
  if (d.kind === 'infantry') _rtsFearAI(e, dt);
  /* Overrun_Square runs BEFORE the engage logic: a tank that is holding position and firing
     returns early from this function, and hooking the crush on the end meant a stationary
     tank never ran anything over. */
  if (RTS_CRUSHERS[e.def]) _rtsOverrun(e);

  /* ---- harvester economy loop ---- */
  if (d.harvest) { _rtsUpdateHarvester(e, dt, d); return; }

  /* ---- engage ---- */
  var tgt = e.target;
  if (tgt && tgt.dead) { tgt = e.target = null; if (e.order === 'attack') e.order = null; }
  if (w && !tgt && (e.order === 'amove' || !e.order)) {
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
      if (_rtsRangeTo(e, tgt) <= w.range) shootAt = tgt;
      else { chasing = true; shootAt = _rtsFindTarget(e, w.range); }
    }
    if (shootAt) {
      /* turret tracks its mark even while the hull is still swinging round */
      var ta = Math.atan2(shootAt.z - e.z, shootAt.x - e.x), td = ta - e.turret;
      while (td > Math.PI) td -= Math.PI * 2; while (td < -Math.PI) td += Math.PI * 2;
      var step = Math.min(Math.abs(td), RTS_TURRET_ROT * dt);
      e.turret += step * (td < 0 ? -1 : 1);
      e.tRot = Math.abs(td) > step + 1e-6;                /* still swinging */
      /* Can_Fire: FIRE_FACING unless the turret is lined up, and a homing weapon is four
         times more forgiving about it (Modify: `diff >>= 2`). A turret still rotating
         cannot fire at all unless its projectile homes - FIRE_ROTATING. */
      var tol = w.speed > 0 && w.shot === 'missile' ? RTS_FIRE_ANGLE * 4 : RTS_FIRE_ANGLE;
      var homing = w.shot === 'missile';
      if (e.cool <= 0 && Math.abs(td) < tol && (homing || !e.tRot)) _rtsFire(e, shootAt, w);
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
    G.sides[e.side].credits += pay;
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
    var s = trip / (G.gems[i] ? RTS_GEM_MULT : 1);
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
      _rtsGrandOpening(e); }
    return;
  }
  if (e.repair) _rtsRepairAI(e, dt);
  if (!d.weapon) return;
  var w = RTS_WEAPONS[d.weapon];
  if (e.cool > 0) e.cool -= dt;
  if (e.fire > 0) e.fire -= dt;
  if (e.recoil > 0) e.recoil -= dt;
  /* a browned-out base loses its defences - power actually matters */
  if (_rtsPowerFactor(e.side) < 0.999) return;
  if (!e.target || e.target.dead || _rtsRangeTo(e, e.target) > w.range) e.target = _rtsFindTarget(e, w.range);
  if (!e.target) return;
  var ta = Math.atan2(e.target.z - e.z, e.target.x - e.x), td = ta - e.rot;
  while (td > Math.PI) td -= Math.PI * 2; while (td < -Math.PI) td += Math.PI * 2;
  e.rot += Math.min(Math.abs(td), 2.6 * dt) * (td < 0 ? -1 : 1);
  if (e.cool <= 0 && Math.abs(td) < 0.3) _rtsFire(e, e.target, w);
}

/* --------------------------------------------------------- projectiles */
function _rtsUpdateProj(dt) {
  var G = window._rtsG;
  for (var i = G.proj.length - 1; i >= 0; i--) {
    var p = G.proj[i];
    p.life -= dt;
    /* missiles home; shells fly straight at where the target was */
    if (p.kind === 'missile' && p.tgt && !p.tgt.dead) {
      var dx = p.tgt.x - p.x, dz = p.tgt.z - p.z, d = Math.hypot(dx, dz) || 1;
      p.vx += (dx / d * p.speed - p.vx) * Math.min(1, dt * 4);
      p.vz += (dz / d * p.speed - p.vz) * Math.min(1, dt * 4);
    }
    p.x += p.vx * dt; p.z += p.vz * dt;
    var hit = null;
    if (p.tgt && !p.tgt.dead && _rtsRangeTo(p, p.tgt) < 1.8) hit = p.tgt;
    if (hit || p.life <= 0) {
      if (hit) _rtsDamage(hit, p.dmg, null);
      if (p.splash > 0) _rtsSplash(p.x, p.z, RTS_BLAST_CELLS * RTS_TILE, p.dmg, p.side, p.splash, p.from);
      _rtsCombatAnim(p.dmg, p.x, p.z, p.splash > 0 ? 1.4 : 0.7);
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

  /* Below IQProduction the opponent keeps a minimal base and never expands - that is the
     whole difference between the low difficulties and the high one. */
  var order = _rtsIQAt(RTS_IQ.production) ? ['refinery', 'barracks', 'factory', 'turret']
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
    if (best) { _rtsPlaceStruct('enemy', key, best[0], best[1], false); return true; }
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
  if (_rtsCanQueue('enemy', 'tank') && S.credits > 1600) _rtsQueue('enemy', 'tank');
  else if (_rtsCanQueue('enemy', 'buggy') && S.credits > 900) _rtsQueue('enemy', 'buggy');
  if (_rtsCanQueue('enemy', 'rocket') && S.credits > 500) _rtsQueue('enemy', 'rocket');
  else if (_rtsCanQueue('enemy', 'rifle') && S.credits > 250) _rtsQueue('enemy', 'rifle');
}
/* HOUSE.CPP's house state machine. The urgency checks all read it, which is how one flag
   ("we were attacked in the last minute") changes several unrelated decisions at once. */
function _rtsAIStateTick(S) {
  var G = window._rtsG;
  if (G.ai.state === RTS_STATE.ENDGAME) return;
  /* `G.ai.lastHit || -999` is wrong: at game start the timestamp IS 0, which is falsy, so
     the fallback fires and a base attacked on the first second never enters ATTACKED. */
  var last = (G.ai.lastHit == null) ? -999 : G.ai.lastHit;
  if (G.t - last < 60) { G.ai.state = RTS_STATE.ATTACKED; return; }
  G.ai.state = S.credits < 25 ? RTS_STATE.BROKE : RTS_STATE.BUILDUP;
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
  if (S.credits < RTS_AI.brokeMoney) u.raiseMoney = U.LOW;
  if (S.credits < RTS_AI.desperateMoney && !_rtsAICanEarn()) u.raiseMoney++;

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
      if (S.credits < _rtsCostOf('enemy', sd) + reserve) return false;
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
function _rtsAIAttack(urgency) {
  var G = window._rtsG, pool = [], k;
  for (k = 0; k < G.ents.length; k++) {
    var u = G.ents[k];
    if (!u.dead && u.side === 'enemy' && u.type === 'unit' && !rtsUnitDef(u.def).harvest && !u.order) pool.push(u);
  }
  /* Commit a real share of the idle army, not a token squad. Sending a fixed handful let
     the AI pile up forty-odd defenders at home, which is both un-fun and unbeatable.
     IQGuardArea: only a smart opponent knows to hold some of it back as a garrison. */
  var share = _rtsIQAt(RTS_IQ.guardArea) ? 0.7 : 0.6;
  if (urgency <= RTS_URGENCY.LOW) share *= 0.5;      /* under attack at home: send fewer */
  var send = Math.min(pool.length, Math.max(3, Math.ceil(pool.length * share)));
  if (_rtsIQAt(RTS_IQ.guardArea)) send = Math.min(send, Math.max(3, pool.length - 3));

  /* AttackInterval is deliberately randomised over a 4x spread in the original, so waves
     never arrive on a metronome you can set your watch by. */
  G.ai.next = RTS_WAVE_EVERY * _rtsBias('enemy').build * (0.5 + Math.random() * 1.5);
  if (send < 2) return false;
  var aim = _rtsHas('player', 'yard') || _rtsHas('player', 'refinery') || _rtsHas('player', 'power');
  if (!aim) return false;
  G.ai.wave++;
  for (k = 0; k < send; k++) _rtsOrderMove(pool[k], aim.x + (k % 3 - 1) * 5, aim.z + ((k / 3) | 0) * 5, true);
  _rtsSay('Redline attack wave inbound!');
  if (typeof _rtsSfx === 'function') _rtsSfx('alert');
  return true;
}
function _rtsUpdateAI(dt) {
  var G = window._rtsG, S = G.sides.enemy;
  if (S.lost) return;
  /* Rich: refill a line as soon as it empties, rather than waiting up to five seconds for
     the next decision. Without this the opponent banks tens of thousands of credits it
     structurally cannot spend, while the human restarts a queue the moment it frees. */
  if (S.credits > RTS_AI.infantryReserve) _rtsAIUnits(S);
  G.ai.next -= dt;
  G.ai.build -= dt;
  if (G.ai.build <= 0) {
    G.ai.build = 5;
    _rtsAIStateTick(S);

    /* Repair_AI, gated on IQRepairSell: the low difficulties simply cannot do this, which is
       why raiding a Commando base and leaving means finding it whole again. */
    if (_rtsIQAt(RTS_IQ.repairSell) && S.credits > RTS_AI.creditReserve * 0.5) {
      for (var r = 0; r < G.ents.length; r++) {
        var b = G.ents[r];
        if (b.dead || b.side !== 'enemy' || b.type !== 'struct' || b.building || b.selling) continue;
        if (!b.repair && b.hp < b.maxHp * 0.85) { b.repair = 1; b.rtimer = 0; }
      }
    }
    _rtsAIUnits(S);

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
      if (_rtsAIPlace(S.ready)) { S.ready = null; S.readyTry = 0; }
      else if (++S.readyTry > 8 || !_rtsHas('enemy', 'yard')) { S.ready = null; S.readyTry = 0; }
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
    if (a <= 0 || a >= RTS_SCRAP_TILE) continue;
    if (G.gems[i]) continue;                 /* IsTGrowth is ore only - a gem field is finite */

    /* Can_Tiberium_Grow */
    if (_rtsPick(G.oreRnd, G.oreGExcess) <= G.oreGrow.length) {
      if (G.oreGrow.length < RTS_ORE_SAMPLE) G.oreGrow.push(i);
      else G.oreGrow[(G.oreRnd() * G.oreGrow.length) | 0] = i;
    }
    G.oreGExcess++;

    /* Can_Tiberium_Spread - only a rich cell can seed a neighbour */
    if (a > RTS_SCRAP_TILE * 0.6) {
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
    var tx = i % RTS_N, tz = (i / RTS_N) | 0;
    var d = (G.oreRnd() * 4) | 0;
    var nx = tx + (d === 0 ? 1 : d === 1 ? -1 : 0), nz = tz + (d === 2 ? 1 : d === 3 ? -1 : 0);
    if (!_rtsInB(nx, nz)) continue;
    var ni = _rtsIdx(nx, nz);
    if (G.scrap[ni] > 0 || G.blocked[ni] !== 0) continue;
    G.scrap[ni] = RTS_SCRAP_TILE * 0.2;
    G.scrapDirty = true;             /* new tile - the render layer must re-lay the field */
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

  var i, e;
  for (i = 0; i < G.ents.length; i++) {
    e = G.ents[i];
    if (e.dead) continue;
    if (e.type === 'unit') _rtsUpdateUnit(e, dt); else _rtsUpdateStruct(e, dt);
  }
  _rtsSeparate(dt);
  _rtsUpdateProj(dt);

  if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 2.2);
  _rtsAnimAI(dt);
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
