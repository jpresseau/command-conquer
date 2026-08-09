/* map/starts.js - spawn points, checking the two sides can reach each other, and painting
   the map onto the terrain layer. Part of rts.map. */

/* ----------------------------------------------------------------- starts --
   Prefer the spawn points the map's author placed; they are chosen with knowledge of the
   terrain that no heuristic here has. But an authored spawn can still be unusable once the
   window has been cropped, so each one is checked for buildable room and quietly nudged if
   it is a tile or two inside a cliff. If fewer than two survive, fall back to picking starts
   the generated way - the terrain is still real, only the placement is ours. */
function _rtsMapStarts(G, M) {
  var f = M.fit, out = [], i;
  var sp = (M.yaml.spawns || []).map(function (s) {
    return { tx: s.x - f.ox, tz: s.y - f.oy };
  }).filter(function (s) {
    return s.tx >= RTS_MAP_EDGE && s.tz >= RTS_MAP_EDGE &&
           s.tx < RTS_N - RTS_MAP_EDGE && s.tz < RTS_N - RTS_MAP_EDGE;
  });

  for (i = 0; i < sp.length; i++) {
    var fixed = _rtsMapClearSpot(G, sp[i].tx, sp[i].tz);
    if (fixed) out.push(fixed);
  }
  if (out.length < 2) return null;                 /* caller falls back to _rtsPickStarts */

  /* Two houses, furthest apart, exactly as the generated picker does it. */
  var bi = 0, bj = 1, bd = -1;
  for (i = 0; i < out.length; i++) {
    for (var j = i + 1; j < out.length; j++) {
      var d = Math.hypot(out[i].tx - out[j].tx, out[i].tz - out[j].tz);
      if (d > bd) { bd = d; bi = i; bj = j; }
    }
  }
  return { player: out[bi], enemy: out[bj] };
}

/* No usable authored spawns - a campaign map, or one whose starts the window cropped away.
   The terrain is still real; only the placement falls back to ours. Same rule the generated
   picker uses (a ring inset from the edge, then the furthest-apart pair), but every candidate
   is dragged to open ground first, because on a real map a ring position lands in the sea
   about as often as not. */
function _rtsMapFallbackStarts(G) {
  var cand = [], n = 16, R = RTS_N * 0.36, mid = RTS_N / 2, i, j;
  for (i = 0; i < n; i++) {
    var a = (i / n) * Math.PI * 2;
    var spot = _rtsMapClearSpot(G, Math.round(mid + Math.cos(a) * R), Math.round(mid + Math.sin(a) * R));
    if (spot) cand.push(spot);
  }
  if (cand.length < 2) return null;
  var bi = 0, bj = 1, bd = -1;
  for (i = 0; i < cand.length; i++) {
    for (j = i + 1; j < cand.length; j++) {
      var d = Math.hypot(cand[i].tx - cand[j].tx, cand[i].tz - cand[j].tz);
      if (d > bd) { bd = d; bi = i; bj = j; }
    }
  }
  return { player: cand[bi], enemy: cand[bj] };
}

/* A start needs a clear patch, not just a clear tile. Search outward for a spot whose
   surroundings are mostly buildable; give up rather than return somewhere a yard cannot go. */
function _rtsMapClearSpot(G, tx, tz) {
  function open(cx, cz) {
    /* THE SPOT ITSELF, before its surroundings. This asked only whether the 9x9 around a
       candidate was 80% clear, and 80% of 81 cells leaves room for a 4x4 outcrop with the
       centre inside it - so a start could be placed IN a cliff. Nothing downstream noticed:
       _rtsMapReach floods from that cell, cannot leave it, and _rtsMapCheck then rejects the
       whole map with "the two start positions have no route between them" - blaming the map
       for a placement fault, on a map that was perfectly playable. Found by walling a 4x4
       block of rock at exactly the radius the fallback ring lands on. */
    if (!_rtsInB(cx, cz) || G.blocked[_rtsIdx(cx, cz)]) return -1;
    var free = 0, tot = 0;
    for (var ox = -4; ox <= 4; ox++) {
      for (var oz = -4; oz <= 4; oz++) {
        var x = cx + ox, z = cz + oz;
        if (!_rtsInB(x, z)) return -1;
        tot++;
        if (!G.blocked[_rtsIdx(x, z)]) free++;
      }
    }
    return free / tot;
  }
  if (open(tx, tz) >= 0.8) return { tx: tx, tz: tz };
  for (var r = 1; r <= 8; r++) {
    for (var a = 0; a < 16; a++) {
      var th = (a / 16) * Math.PI * 2;
      var cx = Math.round(tx + Math.cos(th) * r * 2), cz = Math.round(tz + Math.sin(th) * r * 2);
      if (cx < RTS_MAP_EDGE || cz < RTS_MAP_EDGE ||
          cx >= RTS_N - RTS_MAP_EDGE || cz >= RTS_N - RTS_MAP_EDGE) continue;
      if (open(cx, cz) >= 0.8) return { tx: cx, tz: cz };
    }
  }
  return null;
}

/* ----------------------------------------------------------- connectivity --
   A generated map guarantees a route between the bases by carving roads last. A real map
   guarantees nothing: its author may have meant the two halves to be joined by a bridge, or
   by a transport, and cropping a window can sever a route that existed on the full map. So
   this checks, and the caller refuses a map that fails rather than starting a battle that
   cannot be fought. Plain flood fill from one start - the pathfinder's own rules, without
   the pathfinder, because it only has to answer "reachable at all". */
function _rtsMapReach(G, from) {
  var N = RTS_N, seen = new Uint8Array(N * N), q = [_rtsIdx(from.tx, from.tz)];
  seen[q[0]] = 1;
  for (var h = 0; h < q.length; h++) {
    var cur = q[h], cx = cur % N, cz = (cur / N) | 0;
    for (var d = 0; d < 4; d++) {
      var nx = cx + [1, -1, 0, 0][d], nz = cz + [0, 0, 1, -1][d];
      if (!_rtsInB(nx, nz)) continue;
      var ni = _rtsIdx(nx, nz);
      if (seen[ni] || G.blocked[ni]) continue;
      seen[ni] = 1; q.push(ni);
    }
  }
  return seen;
}

/* Does this map hold together as a battlefield? Both bases must be able to reach each other,
   and each must be able to reach ore, or its economy never starts. */
function _rtsMapCheck(G, starts) {
  var seen = _rtsMapReach(G, starts.player);
  if (!seen[_rtsIdx(starts.enemy.tx, starts.enemy.tz)]) {
    return 'the two start positions have no route between them';
  }
  var ore = 0;
  for (var i = 0; i < seen.length; i++) if (seen[i] && G.scrap[i] > 0) ore++;
  if (!ore) return 'no ore is reachable from the start positions';
  return null;
}

/* ------------------------------------------------------------------ paint --
   Draw the real template art for one cell, exact - the template and tile the map names, not a
   random pick from a set the way generated ground is painted. Returns false when the artwork
   is not loaded or the tile is a hole, so the caller can fall back to its own ground. */
function _rtsMapPaintCell(d, S, tx, tz) {
  var M = window._RTS_MAP;
  if (!M || !_rtsArtReady()) return false;
  var b = M.bin, f = M.fit;
  var mx = f.ox + tx, my = f.oy + tz;
  if (mx < 0 || my < 0 || mx >= b.w || my >= b.h) return false;
  var tab = window.raTileTab ? window.raTileTab(M.theatre) : window.RA_TILETAB;
  var k = my * b.w + mx, rec = tab[b.tmpl[k]];
  /* EVERY fallback is counted, by template, into the collector the bake hangs out while it
     runs. This exists because "the terrain is a disaster" is unanswerable from a screenshot:
     the procedural smears tell you cells fell back, not WHICH templates failed or WHY. The
     expansion maps (Normandy et al) are built from Counterstrike/Aftermath templates - sh57+,
     cliffsw*, sbridge*, hill01 - whose art is not in the base archives at all, and whether a
     given install resolves them from expand.mix cannot be known from here. So the game
     reports its own misses and the report names the fix. */
  var MISS = window._RTS_TERRMISS;
  if (!rec) { if (MISS) MISS['#' + b.tmpl[k]] = (MISS['#' + b.tmpl[k]] || 0) + 1; return false; }
  var set = _mixTiles(rec.img + _rtsThExt());
  if (!set) { if (MISS) MISS[rec.img] = (MISS[rec.img] || 0) + 1; return false; }
  var t = set.tile[b.tidx[k]];
  if (!t) return false;                              /* a hole in the template */
  var pal = RTS_MIX.pal;
  for (var y = 0; y < RTS_TS; y++) {
    var row = (tz * RTS_TS + y) * S;
    for (var x = 0; x < RTS_TS; x++) {
      var p = t[y * RTS_TS + x] * 3, o = (row + tx * RTS_TS + x) * 4;
      d[o] = pal[p]; d[o + 1] = pal[p + 1]; d[o + 2] = pal[p + 2]; d[o + 3] = 255;
    }
  }
  return true;
}
