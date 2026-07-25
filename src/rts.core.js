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
    ready:null,                                        /* finished structure awaiting placement */
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

function _rtsNewGame(seed) {
  var G = {
    t:0, seed:seed || 12345, over:null, msg:null, msgT:0, shake:0,
    blocked:new Uint8Array(RTS_N * RTS_N),
    terrain:new Uint8Array(RTS_N * RTS_N),  /* RTS_T_* - what the ground IS, for the renderer */
    scorch:new Uint8Array(RTS_N * RTS_N),   /* 0 none, 1-6 scorch variant, +8 bit = crater */
    corpses:[],                             /* {x,z,v} the renderer has yet to stamp */
    newScorch:[],                           /* cells the renderer has yet to stamp */
    scrap:new Float32Array(RTS_N * RTS_N),
    owner:new Int32Array(RTS_N * RTS_N),   /* entity id occupying the tile, 0 = none */
    ents:[], byId:{}, nextId:1,
    sel:[], proj:[], fx:[],
    sides:{ player:_rtsSideNew('player'), enemy:_rtsSideNew('enemy') },
    ai:{ next:RTS_WAVE_FIRST, wave:0, build:6 },
    stats:{ killed:0, lostU:0 }
  };
  window._rtsG = G;
  _rtsPathfindInit();
  var rnd = _rtsRngMake(G.seed);

  /* --- ore fields: a few blobs, biggest ones out in the contested middle --- */
  var fields = [[28,82,7],[82,28,7],[38,38,6],[74,74,6],[56,56,10],[22,32,5],[90,80,5],[34,62,5],[78,50,5]];
  for (var f = 0; f < fields.length; f++) {
    var cx = fields[f][0], cz = fields[f][1], rad = fields[f][2];
    for (var tx = cx - rad; tx <= cx + rad; tx++) for (var tz = cz - rad; tz <= cz + rad; tz++) {
      if (!_rtsInB(tx, tz)) continue;
      var d = Math.hypot(tx - cx, tz - cz);
      if (d > rad) continue;
      var amt = RTS_SCRAP_TILE * (1 - d / (rad + 1)) * (0.6 + rnd() * 0.6);
      if (amt > 40) G.scrap[_rtsIdx(tx, tz)] = amt;
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
      if (G.scrap[i] > 0) { G.scrap[i] = 0; G.scrapDirty = true; }
    }
    else if (G.owner[i] === e.id) { G.blocked[i] = 0; G.owner[i] = 0; }
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
  _rtsRecalcPower(side);
  /* Only a pre-placed (instant) structure hands over its free unit here. A structure that
     has to be built delivers it in _rtsUpdateStruct when construction finishes - granting
     it in both places gave every constructed refinery two harvesters for the price of one. */
  if (instant && d.freeUnit) _rtsSpawnAt(side, d.freeUnit, e);
  return e;
}
/* Spawn a unit just outside `src`, on ground that is actually open. Without the open-tile
   search a refinery's free harvester can land inside a neighbouring building's footprint. */
function _rtsSpawnAt(side, key, src) {
  var d = rtsStructDef(src.def);
  var out = Math.max(d.w, d.h) * RTS_TILE * 0.5 + RTS_TILE * 1.2;
  for (var i = 0; i < 16; i++) {
    var a = (side === 'player' ? 0.5 : Math.PI + 0.5) + i * (Math.PI * 2 / 16);
    var x = src.x + Math.cos(a) * out, z = src.z + Math.sin(a) * out;
    var tx = _rtsTX(x), tz = _rtsTX(z);
    if (!_rtsBlocked(tx, tz)) return _rtsSpawnUnit(side, key, _rtsWX(tx), _rtsWX(tz));
  }
  var open = _rtsNearestOpen(_rtsTX(src.x), _rtsTX(src.z), 12);
  return open ? _rtsSpawnUnit(side, key, _rtsWX(open[0]), _rtsWX(open[1])) : null;
}
function _rtsSpawnUnit(side, key, x, z) {
  /* team: Handle_Team's Group. -1 = unassigned. */
  var G = window._rtsG, d = rtsUnitDef(key);
  if (!d) return null;
  var e = { id:G.nextId++, type:'unit', side:side, def:key, x:x, z:z, rot:side === 'player' ? 0 : Math.PI,
    hp:d.hp, maxHp:d.hp, r:d.r, cool:0, path:null, pi:0, order:null, target:null,
    carry:0, hstate:null, htile:null, dead:false, mesh:null, turret:0, fire:0, team:-1,
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
  if (e.type === 'struct') {
    var sd = rtsStructDef(e.def);
    G.fx.push({ kind:'boom', x:e.x, y:1, z:e.z, t:0, big:Math.max(2, sd.w * 0.7) });
    /* Secondary blasts walking across the footprint on a delay, then debris thrown clear.
       A structure going down should be an event; one puff was not. */
    var rn = _rtsRngMake((e.id * 7919) >>> 0);
    for (var b = 0; b < 3 + sd.w; b++) {
      G.fx.push({ kind:'boom', t:-0.10 - rn() * 0.5, big:0.8 + rn() * 0.9,
        x:e.x + (rn() - 0.5) * sd.w * RTS_TILE, y:1, z:e.z + (rn() - 0.5) * sd.h * RTS_TILE });
    }
    G.shake = Math.min(1, G.shake + 0.35 + sd.w * 0.12);
    for (var k = 0; k < 9 + sd.w * 3; k++) {
      var a = rn() * 6.283, sp = 4 + rn() * 15;
      G.fx.push({ kind:'debris', x:e.x, y:2 + rn() * 3, z:e.z, t:0,
        vx:Math.cos(a) * sp, vz:Math.sin(a) * sp, vy:7 + rn() * 11, big:0.6 + rn() * 0.8 });
    }
  } else {
    G.fx.push({ kind:'pop', x:e.x, y:1, z:e.z, t:0, big:1 });
    if (rtsUnitDef(e.def).kind === 'infantry') {
      G.corpses.push({ x:e.x, z:e.z, v:(e.id * 5) % 3 });
      if (G.corpses.length > 220) G.corpses.shift();
    }
  }
  if (typeof _rtsSfx === 'function') _rtsSfx(e.type === 'struct' ? 'boom' : 'pop', e.x, e.z);
  if (e.side === 'player' && e.type === 'unit') G.stats.lostU++;
  if (e.side === 'enemy') G.stats.killed++;
  var si = G.sel.indexOf(e); if (si >= 0) G.sel.splice(si, 1);
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
            if (host.hp <= 0) { _rtsKill(host); f.att = 0; }
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
function _rtsAnimMiddle(f, def) {
  var G = window._rtsG;
  var tx = _rtsTX(f.x), tz = _rtsTX(f.z);
  if (!_rtsInB(tx, tz)) return;
  var i = _rtsIdx(tx, tz);
  if (G.terrain[i] === RTS_T_WATER) return;
  if (def.crater) {
    /* Reduce_Tiberium(6): a crater eats the ore it lands in. */
    if (G.scrap[i] > 0) G.scrap[i] = Math.max(0, G.scrap[i] - RTS_CRATER_ORE * 10);
    if (!(G.scorch[i] & 8)) { G.scorch[i] = (G.scorch[i] & 7) | 8; G.newScorch.push(i); }
    return;
  }
  if (def.scorch && !(G.scorch[i] & 7)) {
    G.scorch[i] |= 1 + (((tx * 7 + tz * 13 + G.fx.length) % 6) | 0);
    G.newScorch.push(i);
  }
}

function _rtsRecalcPower(side) {
  var G = window._rtsG, made = 0, used = 0;
  for (var i = 0; i < G.ents.length; i++) {
    var e = G.ents[i];
    if (e.type !== 'struct' || e.side !== side || e.dead || e.building) continue;
    var d = rtsStructDef(e.def);
    if (d.power > 0) made += d.power; else used += -d.power;
  }
  G.sides[side].powerMade = made; G.sides[side].powerUsed = used;
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
  if (S.credits < def.cost) return false;
  return true;
}
function _rtsQueue(side, key) {
  if (!_rtsCanQueue(side, key)) return false;
  var S = window._rtsG.sides[side], def = rtsStructDef(key) || rtsUnitDef(key);
  S.q[_rtsQueueCat(key)] = { key:key, prog:0, total:Math.max(0.1, def.build), cost:def.cost, paid:0 };
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
function _rtsFire(e, tgt, w) {
  var G = window._rtsG;
  e.cool = w.cool; e.fire = 0.09;
  if (typeof _rtsSfx === 'function') _rtsSfx(w.shot === 'tracer' ? (w.dmg > 7 ? 'mg' : 'rifle')
    : (w.shot === 'missile' ? 'rocket' : (e.type === 'struct' ? 'turretgun' : 'cannon')), e.x, e.z);
  var dmg = w.dmg * (w.vs[rtsArmour(tgt)] || 1);
  if (w.speed <= 0) {
    _rtsDamage(tgt, dmg, e);
    G.fx.push({ kind:'tracer', x:e.x, y:1.3, z:e.z, x2:tgt.x, y2:1.3, z2:tgt.z, t:0 });
  } else {
    var d = Math.hypot(tgt.x - e.x, tgt.z - e.z) || 1;
    G.proj.push({ kind:w.shot, x:e.x, y:1.4, z:e.z, vx:(tgt.x - e.x) / d * w.speed, vz:(tgt.z - e.z) / d * w.speed,
      speed:w.speed, tgt:tgt, dmg:dmg, splash:w.splash, side:e.side, life:4, w:w });
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

function _rtsDamage(tgt, dmg, from) {
  if (tgt.prone) dmg *= RTS_PRONE_DAMAGE;
  if (!tgt || tgt.dead) return;
  tgt.hp -= dmg;
  tgt.hitT = 0.18;
  /* an idle unit that gets shot shoots back instead of standing there */
  if (tgt.type === 'unit' && from && !tgt.order && rtsUnitDef(tgt.def).weapon) { tgt.order = 'attack'; tgt.target = from; }
  if (tgt.hp <= 0) _rtsKill(tgt);
  else if (tgt.type === 'unit' && rtsUnitDef(tgt.def).kind === 'infantry') {
    /* Fear climbs faster the more hurt the soldier already is. */
    if (tgt.fear < RTS_FEAR.SCARED) tgt.fear = RTS_FEAR.SCARED;
    else {
      var more = RTS_FEAR.ANXIOUS, hr = tgt.hp / tgt.maxHp;
      if (hr > RTS_COND_RED) more /= 2;
      if (hr > RTS_COND_YELLOW) more /= 2;
      tgt.fear = Math.min(RTS_FEAR.MAXIMUM, tgt.fear + more);
    }
    if (from) _rtsScatter(tgt, from.x, from.z);
  }
  else if (tgt.type === 'unit' && !tgt.burning && tgt.hp < tgt.maxHp * 0.3) {
    /* Attach_To: the flame follows the unit and eats it, exactly as ANIM.CPP does. */
    tgt.burning = 1;
    window._rtsG.fx.push({ kind:'fire', x:tgt.x, y:1, z:tgt.z, t:0, big:0.75, att:tgt.id, loops:3 });
  }
}
function _rtsSplash(x, z, rad, dmg, side) {
  var G = window._rtsG, foe = _rtsEnemyOf(side);
  for (var i = 0; i < G.ents.length; i++) {
    var o = G.ents[i];
    if (o.dead || o.side !== foe) continue;
    var d = Math.hypot(o.x - x, o.z - z);
    if (d > rad) continue;
    _rtsDamage(o, dmg * (1 - d / rad) * 0.6, null);
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
  if (e.hitT > 0) e.hitT -= dt;
  if (d.kind === 'infantry') _rtsFearAI(e, dt);

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
      e.turret += Math.min(Math.abs(td), 4 * dt) * (td < 0 ? -1 : 1);
      if (e.cool <= 0 && Math.abs(td) < 0.35) _rtsFire(e, shootAt, w);
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
    if (G.scrap[i] <= 0.5) { G.scrap[i] = 0; G.scrapDirty = true; e.htile = null; e.hstate = 'toField'; }
    if (e.carry >= d.capacity - 0.5) { e.hstate = 'toRef'; e.path = null; }
  } else if (e.hstate === 'toRef') {
    var ref = _rtsNearestRefinery(e);
    if (!ref) { e.path = null; return; }
    /* generous docking radius: a harvester that stops one tile short of the strict range
       would otherwise hover beside the refinery without ever unloading */
    if (_rtsRangeTo(e, ref) < RTS_TILE * 2.2) { e.path = null; e.hstate = 'unload'; e.ref = ref; return; }
    e.rep = (e.rep || 0) - dt;
    if (!e.path || e.rep <= 0) { e.goal = { x:ref.x, z:ref.z }; e.path = _rtsPath(e.x, e.z, ref.x, ref.z); e.pi = 0; e.rep = 1.5; if (!e.path) return; }
    _rtsSteer(e, dt, d);
  } else if (e.hstate === 'unload') {
    if (!e.ref || e.ref.dead) { e.hstate = 'toRef'; return; }
    var give = Math.min(RTS_UNLOAD_RATE * dt, e.carry);
    e.carry -= give; G.sides[e.side].credits += give;
    if (e.carry <= 0.5) { e.carry = 0; e.hstate = 'toField'; }
  }
}
function _rtsNearestScrap(e) {
  var G = window._rtsG, best = null, bd = 1e9;
  for (var tz = 0; tz < RTS_N; tz++) for (var tx = 0; tx < RTS_N; tx++) {
    var i = _rtsIdx(tx, tz);
    if (G.scrap[i] <= 0) continue;
    var d = Math.hypot(_rtsWX(tx) - e.x, _rtsWX(tz) - e.z);
    if (d < bd) { bd = d; best = { tx:tx, tz:tz }; }
  }
  return best;
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
  if (e.building) {
    /* buildings rise out of the ground while they finish, and gain HP as they go */
    e.bprog += dt / Math.max(0.5, d.build * 0.5) * _rtsPowerFactor(e.side);
    e.hp = d.hp * (0.15 + 0.85 * Math.min(1, e.bprog));
    if (e.bprog >= 1) { e.bprog = 1; e.building = 0; e.hp = d.hp; _rtsRecalcPower(e.side);
      if (d.freeUnit) _rtsSpawnAt(e.side, d.freeUnit, e); }
    return;
  }
  if (!d.weapon) return;
  var w = RTS_WEAPONS[d.weapon];
  if (e.cool > 0) e.cool -= dt;
  if (e.fire > 0) e.fire -= dt;
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
      if (p.splash > 0) _rtsSplash(p.x, p.z, p.splash * RTS_TILE * 0.8, p.dmg, p.side);
      G.fx.push({ kind:'hit', x:p.x, y:1, z:p.z, t:0, big:p.splash > 0 ? 1.4 : 0.7 });
      G.proj.splice(i, 1);
    }
  }
}

/* ------------------------------------------------------------ enemy AI --
   Deliberately simple and legible: keep a harvester alive, replace losses, and
   throw a growing wave at the player on a timer. */
function _rtsUpdateAI(dt) {
  var G = window._rtsG, S = G.sides.enemy;
  if (S.lost) return;
  G.ai.build -= dt;
  if (G.ai.build <= 0) {
    G.ai.build = 5;
    var harv = 0, refs = 0, army = [], i;
    for (i = 0; i < G.ents.length; i++) {
      var e = G.ents[i];
      if (e.dead || e.side !== 'enemy') continue;
      if (e.type === 'struct') { if (e.def === 'refinery') refs++; continue; }
      if (rtsUnitDef(e.def).harvest) harv++; else army.push(e);
    }
    /* Economy first, and crucially the AI SAVES for a harvester instead of dribbling its
       income away on cheap infantry - without this it parks at ~90 credits forever, never
       affords the 1200 harvester, and its army stops growing about two minutes in. */
    if (harv < 3) {
      if (_rtsCanQueue('enemy', 'harvester')) _rtsQueue('enemy', 'harvester');
    } else if (_rtsCanQueue('enemy', 'tank') && S.credits > 1600) _rtsQueue('enemy', 'tank');
    else if (_rtsCanQueue('enemy', 'buggy') && S.credits > 900) _rtsQueue('enemy', 'buggy');
    else if (_rtsCanQueue('enemy', 'rocket') && S.credits > 500) _rtsQueue('enemy', 'rocket');
    else if (_rtsCanQueue('enemy', 'rifle') && S.credits > 250) _rtsQueue('enemy', 'rifle');
    /* rebuild a dead power plant so the AI does not brown itself out permanently */
    if (S.powerUsed > S.powerMade && _rtsCanQueue('enemy', 'power')) _rtsQueue('enemy', 'power');
    /* once genuinely rich, expand rather than stockpile - but cap it, or the AI spends its
       whole income on refineries it does not have the harvesters to use */
    else if (S.credits > 4000 && refs < 2 && !S.q.struct && _rtsCanQueue('enemy', 'refinery')) _rtsQueue('enemy', 'refinery');
  }
  /* the AI places its own finished buildings next to the yard */
  if (S.ready) {
    var yard = _rtsHas('enemy', 'yard'), placed = false;
    if (yard) {
      for (var rr = 3; rr <= RTS_BUILD_RADIUS && !placed; rr++) {
        for (var a = 0; a < 12 && !placed; a++) {
          var ang = a / 12 * Math.PI * 2;
          var tx = Math.round(yard.tx + Math.cos(ang) * rr), tz = Math.round(yard.tz + Math.sin(ang) * rr);
          if (_rtsCanPlace('enemy', S.ready, tx, tz)) { _rtsPlaceStruct('enemy', S.ready, tx, tz, false); placed = true; }
        }
      }
    }
    if (placed || !yard) S.ready = null;
  }
  G.ai.next -= dt;
  if (G.ai.next <= 0) {
    G.ai.next = RTS_WAVE_EVERY; G.ai.wave++;
    var pool = [], k;
    for (k = 0; k < G.ents.length; k++) {
      var u = G.ents[k];
      if (!u.dead && u.side === 'enemy' && u.type === 'unit' && !rtsUnitDef(u.def).harvest && !u.order) pool.push(u);
    }
    /* Commit a real share of the idle army, not a token squad. Sending a fixed handful let
       the AI pile up forty-odd defenders at home, which is both un-fun and unbeatable. */
    var send = Math.min(pool.length, Math.max(3, Math.ceil(pool.length * 0.6)));
    if (send >= 2) {
      var aim = _rtsHas('player', 'yard') || _rtsHas('player', 'refinery') || _rtsHas('player', 'power');
      if (aim) {
        for (k = 0; k < send; k++) _rtsOrderMove(pool[k], aim.x + (k % 3 - 1) * 5, aim.z + ((k / 3) | 0) * 5, true);
        _rtsSay('Redline attack wave inbound!');
        if (typeof _rtsSfx === 'function') _rtsSfx('alert');
      }
    }
  }
}
function _rtsSay(m) { var G = window._rtsG; G.msg = m; G.msgT = 4; }

/* Ore regrows into partly-mined tiles and slowly seeds empty neighbours, so a worked-out
   field recovers instead of leaving a dead map (RULES.CPP: IsTGrowth / IsTSpread). */
function _rtsTickOre(dt) {
  var G = window._rtsG;
  G.oreT = (G.oreT || 0) + dt;
  if (G.oreT < RTS_ORE_GROW_EVERY) return;
  G.oreT = 0;
  if (!G.oreRnd) G.oreRnd = _rtsRngMake(G.seed ^ 0x5eed);
  var tx, tz, i, grew = false;
  for (tz = 1; tz < RTS_N - 1; tz++) {
    for (tx = 1; tx < RTS_N - 1; tx++) {
      i = _rtsIdx(tx, tz);
      var a = G.scrap[i];
      if (a <= 0 || a >= RTS_SCRAP_TILE) continue;
      G.scrap[i] = Math.min(RTS_SCRAP_TILE, a + RTS_ORE_GROW_AMT);
      grew = true;
      /* a rich tile occasionally seeds an adjacent empty, unblocked one */
      if (a > RTS_SCRAP_TILE * 0.6 && G.oreRnd() < RTS_ORE_SPREAD_CHANCE) {
        var d = (G.oreRnd() * 4) | 0;
        var nx = tx + (d === 0 ? 1 : d === 1 ? -1 : 0), nz = tz + (d === 2 ? 1 : d === 3 ? -1 : 0);
        var ni = _rtsIdx(nx, nz);
        if (_rtsInB(nx, nz) && G.scrap[ni] <= 0 && G.blocked[ni] === 0) {
          G.scrap[ni] = RTS_SCRAP_TILE * 0.2;
          G.scrapDirty = true;      /* new tile - the render layer must re-lay the field */
        }
      }
    }
  }
  if (grew) G.oreGrew = true;
}

/* ------------------------------------------------------------ main tick */
function _rtsTick(dt) {
  var G = window._rtsG;
  if (!G || G.over) return;
  if (dt > 0.1) dt = 0.1;                        /* never let a stall fast-forward the battle */
  G.t += dt;
  if (G.msgT > 0) G.msgT -= dt;

  _rtsTickOre(dt);
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
  for (i = G.ents.length - 1; i >= 0; i--) if (G.ents[i].dead && G.ents[i].reaped) G.ents.splice(i, 1);

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
