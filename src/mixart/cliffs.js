/* mixart/cliffs.js - Red Alert's own cliff templates, fitted onto a generated map's rock.
   Part of rts.mixart, the player's own artwork.

   WHY THIS TOOK A DIFFERENT SHAPE THAN EXPECTED. On a real map the cell names its own template
   and tile, so cliffs draw themselves (see _rtsMapPaintCell). On a GENERATED map there is only a
   mask of blocked cells, and the plan of record was to chain the templates along the ridge like
   an autotile: a piece that enters from the west and leaves to the east, another that turns
   north, and so on. That was measured before it was built, and it does not work.

     - The tileset's own terrain classes are no help. Nearly every cell of every Cliffs template
       classifies as 'k', because the class encodes PASSABILITY, not shape. All 38 templates look
       identical to a bitmask lookup.

     - Chaining does not work either. For every ordered pair of templates, the share of the 24
       pixels down their shared border where rock meets rock and grass meets grass was measured.
       Picking each template's best partner scores 78.9%; picking a partner AT RANDOM scores
       78.8%. There is no join structure in these borders to exploit - Westwood drew 38 rock
       formations, not 38 interlocking segments.

   What they are is 2x2 and 3x2 lumps of rock with grass baked around the edges, and that is how
   they are used here: FITTED, not chained. A placement is legal when the template's rock cells
   land on the map's rock and its grass cells land on open ground, so what the player sees is
   exactly what the pathfinder blocks. Then, since a greedy fit still butts arbitrary pieces
   together, each candidate is scored against the neighbours already placed to its west and
   north - the seams a player actually reads as a straight cut through a rock face. That one term
   moves border agreement from 88.7% to 91.8% and turns a row of separate lumps into a ridge. */

/* ------------------------------------------------------------------ decode --
   The library. Every Cliffs template in the tile table, decoded and classified by PIXELS,
   because that is the only place the shape is recorded.

   Splitting rock from grass by colour does not work directly: this tileset dithers its grass
   with near-black neutrals that the rock shadows also use, and a green-versus-not test called
   65% of a mostly-grass cell rock. What IS unambiguous is the index set - clear1.tem is plain
   ground and nothing else, so an index it never uses cannot be grass. Those seeds are then
   closed up over a 5x5 window, which is what turns "the bright beige pixels" into "the rock". */
var _RTS_CLIFFLIB;

function _mixCliffLib() {
  if (_RTS_CLIFFLIB !== undefined) return _RTS_CLIFFLIB;
  _RTS_CLIFFLIB = null;
  if (!_rtsArtReady() || typeof RA_TILETAB === 'undefined') return null;
  var TS = RTS_TS, ex = _rtsThExt();
  var clear = _mixTiles('clear1' + ex);
  if (!clear) return null;

  var grass = new Uint8Array(256), i, c, x, y;
  for (c = 0; c < clear.tile.length; c++) {
    var ct = clear.tile[c];
    if (!ct) continue;
    for (i = 0; i < TS * TS; i++) grass[ct[i]] = 1;
  }

  var lib = [];
  Object.keys(RA_TILETAB).forEach(function (id) {
    var rec = RA_TILETAB[id];
    if (rec.cat !== 'C') return;
    var tem = _mixTiles(rec.img + ex);
    if (!tem || tem.n < rec.w * rec.h) return;
    var W = rec.w * TS, H = rec.h * TS, cx, cy;
    var seedm = new Uint8Array(W * H);
    for (cy = 0; cy < rec.h; cy++) for (cx = 0; cx < rec.w; cx++) {
      var tl = tem.tile[cy * rec.w + cx];
      if (!tl) continue;
      for (y = 0; y < TS; y++) for (x = 0; x < TS; x++)
        seedm[(cy * TS + y) * W + cx * TS + x] = grass[tl[y * TS + x]] ? 0 : 1;
    }
    /* close the seeds into a region */
    var full = new Uint8Array(W * H);
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
      var n = 0;
      for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++) {
        var qx = x + dx, qy = y + dy;
        if (qx < 0 || qy < 0 || qx >= W || qy >= H) continue;
        n += seedm[qy * W + qx];
      }
      full[y * W + x] = n >= 6 ? 1 : 0;
    }
    var cells = [];
    for (c = 0; c < rec.w * rec.h; c++) {
      var px = tem.tile[c], ox = (c % rec.w) * TS, oy = ((c / rec.w) | 0) * TS, k = 0;
      var m = new Uint8Array(TS * TS);
      if (px) for (y = 0; y < TS; y++) for (x = 0; x < TS; x++) {
        var v = full[(oy + y) * W + ox + x];
        m[y * TS + x] = v; k += v;
      }
      var cov = px ? k / (TS * TS) : 0;
      /* R must land on rock, G must land on open ground, E fits either. A hole in the template
         is not art at all, so it behaves like G: it may not cover a blocked cell. */
      cells.push({ cov: cov, px: px || null, m: m,
                   kind: !px ? 'G' : (cov >= 0.5 ? 'R' : (cov <= 0.25 ? 'G' : 'E')) });
    }
    lib.push({ img: rec.img, w: rec.w, h: rec.h, cells: cells });
  });
  /* Sorted by name so the fit is identical whatever order the keys came back in - a generated
     map has to be the same map on every machine. */
  lib.sort(function (a, b) { return a.img < b.img ? -1 : (a.img > b.img ? 1 : 0); });
  return lib.length ? (_RTS_CLIFFLIB = lib) : null;
}

/* --------------------------------------------------------------------- fit --
   Pure, and deliberately so: it takes the library, the map size and two predicates, and knows
   nothing about canvases or the game state. That is what makes it testable without artwork -
   see test/unit/cliffs.

     rockAt(x, z)  the cell is blocked rock and must end up under rock art
     openAt(x, z)  the cell is plain ground a template's margin may be painted over

   Everything else - trees, ore, road, water, the sea - is neither, and a template that would
   cover one is rejected, because painting a template's grass over an ore field deletes the ore.

   Greedy in raster order. For each uncovered rock cell every template is tried at every offset
   that would cover it; the winner takes the most new rock, then the best seam. Ties break on a
   hash of the position so the choice is deterministic rather than "whichever came first". */
var RTS_CLIFF_SEAMW = 8;                 /* measured: 3 -> 91.6%, 8 -> 91.8%, 20 -> 91.9% */

/* How much rock a template cell may carry before it is refused a spot on DRIVEABLE ground.
   The two errors are not symmetrical. Art that spills rock onto open ground makes a route look
   closed when it is open - irritating. Art that leaves a blocked cell looking like grass makes
   a route look open when it is closed, and a player who orders a unit through it watches it
   refuse. The original takes the second error: RA blocks a cliff template's whole footprint,
   grassy margin cells included. This takes the first.

   The limit trades coverage for spill, measured on seed 31: no limit covers every rock cell but
   paints 29% rock over 283 open ones; 0.4 leaves 6 cells for the mop-up and paints 21%; 0.35
   leaves 21 and paints 17%. 0.4 is the knee - and it IMPROVES the seams as a side effect
   (91.8% -> 93.0%), because a piece whose rock runs off its edge is now often refused. */
var RTS_CLIFF_MAXOPEN = 0.4;

function _rtsCliffFit(lib, N, rockAt, openAt, seed) {
  var TS = RTS_TS, used = new Uint8Array(N * N), mask = new Array(N * N), out = [];
  function hash(a, b, s) {
    var v = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(s | 0, 1442695041);
    v = Math.imul(v ^ (v >>> 13), 1274126177); v ^= v >>> 16;
    return (v >>> 0) / 4294967296;
  }
  /* Agreement with the pieces already painted west and north of this offset. Raster order means
     those are the only neighbours that exist yet, and they are the seams that show. */
  function seam(t, ox, oz) {
    var same = 0, tot = 0, i, y;
    for (i = 0; i < t.h; i++) {
      var w = ox - 1 >= 0 ? mask[(oz + i) * N + ox - 1] : null;
      if (!w) continue;
      var me = t.cells[i * t.w].m;
      for (y = 0; y < TS; y++) { tot++; if (w[y * TS + TS - 1] === me[y * TS]) same++; }
    }
    for (i = 0; i < t.w; i++) {
      var u = oz - 1 >= 0 ? mask[(oz - 1) * N + ox + i] : null;
      if (!u) continue;
      var me2 = t.cells[i].m;
      for (y = 0; y < TS; y++) { tot++; if (u[(TS - 1) * TS + y] === me2[y]) same++; }
    }
    return tot ? same / tot : 1;
  }
  function claim(t, ox, oz) {
    for (var cy = 0; cy < t.h; cy++) for (var cx = 0; cx < t.w; cx++) {
      var k = (oz + cy) * N + ox + cx;
      used[k] = 1;
      mask[k] = t.cells[cy * t.w + cx].m;
    }
    out.push({ t: t, ox: ox, oz: oz });
  }

  for (var z = 0; z < N; z++) {
    for (var x = 0; x < N; x++) {
      if (!rockAt(x, z) || used[z * N + x]) continue;
      var best = null;
      for (var ti = 0; ti < lib.length; ti++) {
        var t = lib[ti];
        for (var oz = z - t.h + 1; oz <= z; oz++) {
          for (var ox = x - t.w + 1; ox <= x; ox++) {
            if (ox < 0 || oz < 0 || ox + t.w > N || oz + t.h > N) continue;
            var ok = true, gain = 0;
            for (var cy = 0; cy < t.h && ok; cy++) {
              for (var cx = 0; cx < t.w && ok; cx++) {
                var cell = t.cells[cy * t.w + cx], mx = ox + cx, mz = oz + cy;
                if (used[mz * N + mx]) { ok = false; break; }
                var r = rockAt(mx, mz);
                if (!r && !openAt(mx, mz)) { ok = false; break; }
                if (cell.kind === 'R' && !r) { ok = false; break; }
                if (cell.kind === 'G' && r) { ok = false; break; }
                if (!r && cell.cov > RTS_CLIFF_MAXOPEN) { ok = false; break; }
                if (r) gain++;
              }
            }
            if (!ok || !gain) continue;
            var score = gain * 4 + seam(t, ox, oz) * RTS_CLIFF_SEAMW + hash(ox, oz, ti + seed) * 0.5;
            if (!best || score > best.score) best = { score: score, t: t, ox: ox, oz: oz };
          }
        }
      }
      if (best) claim(best.t, best.ox, best.oz);
    }
  }

  /* Mop up. A rock cell wedged against ore or a road can defeat every whole-template offset, and
     one bare cell in the middle of real cliff art is the loudest possible artefact. So the last
     resort is a SINGLE CELL lifted out of any template that is nearly solid rock - the piece the
     original itself uses for a lone boulder. With this the fit covers every rock cell on every
     seed measured, which is what lets the procedural cliff painter be skipped outright. */
  var solid = [];
  lib.forEach(function (t) {
    t.cells.forEach(function (cell, i) {
      if (cell.px && cell.cov >= 0.7) solid.push({ t: t, i: i });
    });
  });
  if (solid.length) {
    for (var mz2 = 0; mz2 < N; mz2++) {
      for (var mx2 = 0; mx2 < N; mx2++) {
        if (!rockAt(mx2, mz2) || used[mz2 * N + mx2]) continue;
        var p = solid[(hash(mx2, mz2, seed + 7) * solid.length) | 0];
        used[mz2 * N + mx2] = 1;
        mask[mz2 * N + mx2] = p.t.cells[p.i].m;
        out.push({ t: p.t, ox: mx2 - (p.i % p.t.w), oz: mz2 - ((p.i / p.t.w) | 0), only: p.i });
      }
    }
  }
  return { place: out, used: used };
}

/* ------------------------------------------------------------------- paint --
   Stamp the fitted templates into the baked terrain's pixels. Returns the number of blocked
   rock cells left uncovered, so the caller knows whether it still needs its own cliffs; null
   means there was no artwork to work with at all. */
function _mixPaintCliffs(d, S, G, seed) {
  var lib = _mixCliffLib();
  if (!lib) return null;
  var N = RTS_N, TS = RTS_TS, pal = RTS_MIX.pal;
  function rockAt(x, z) { return _rtsInB(x, z) && G.terrain[_rtsIdx(x, z)] === RTS_T_ROCK; }
  function openAt(x, z) { return _rtsInB(x, z) && G.terrain[_rtsIdx(x, z)] === RTS_T_GRASS; }
  var fit = _rtsCliffFit(lib, N, rockAt, openAt, seed);

  fit.place.forEach(function (p) {
    for (var cy = 0; cy < p.t.h; cy++) {
      for (var cx = 0; cx < p.t.w; cx++) {
        var ci = cy * p.t.w + cx;
        if (p.only !== undefined && ci !== p.only) continue;
        var cell = p.t.cells[ci];
        if (!cell.px) continue;
        var mx = p.ox + cx, mz = p.oz + cy;
        if (!_rtsInB(mx, mz)) continue;
        for (var y = 0; y < TS; y++) {
          var row = (mz * TS + y) * S;
          for (var x = 0; x < TS; x++) {
            var v = cell.px[y * TS + x], o = (row + mx * TS + x) * 4;
            d[o] = pal[v * 3]; d[o + 1] = pal[v * 3 + 1]; d[o + 2] = pal[v * 3 + 2]; d[o + 3] = 255;
          }
        }
      }
    }
  });

  var left = 0;
  for (var z = 0; z < N; z++) for (var x = 0; x < N; x++)
    if (rockAt(x, z) && !fit.used[z * N + x]) left++;
  return left;
}
