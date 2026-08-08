/* mixart/fit.js - laying Red Alert's multi-cell terrain templates onto a generated map.
   Part of rts.mixart, the player's own artwork.

   On a real map every cell names its own template and tile, so nothing here is needed. A
   GENERATED map has only a mask of what is where, and the templates have to be chosen for it.

   The plan of record was an autotile chain - a piece that enters from the west and leaves to the
   east, another that turns north. That was measured on the Cliffs set before it was built, and it
   does not work: over every ordered pair of templates, the share of the 24 pixels down their
   shared border where the material meets itself is 78.9% for each template's BEST partner and
   78.8% for a partner picked AT RANDOM. There is no join structure in these borders to exploit.

   So they are FITTED instead. Greedy in raster order: for each cell that still needs art, every
   template is tried at every offset that would cover it, and the winner takes the most new cells,
   then the best seam. A candidate's SEAM is its agreement with the pieces already placed to its
   west and north - the only neighbours that exist yet in raster order, and the ones a player
   reads as a straight cut through a rock face or a shoreline. On the cliffs that term moves
   border agreement from 88.7% to 91.8%; a full four-neighbour relaxation afterwards adds 0.3
   more, which is not worth the code.

   The caller supplies everything domain-specific, which is what lets the cliffs and the shore
   share this:

     opt.needs(x, z)        this cell must end up under art
     opt.fits(cell, x, z)   this template cell may sit on this map cell
     opt.match(cell, x, z)  0..1, how well this cell's own picture agrees with the map here
     opt.fill               [{t, i}] single cells to mop up with, or none
     opt.seed               ties break on a hash of this, so a map is the same everywhere

   `match` is what forces ORIENTATION, and the shoreline is why it exists. Legality alone does
   not: on a coast running north-south our sand ring is one cell wide, and a template with sand
   on top and water underneath satisfies every class check while drawing a south-facing beach on
   a west-facing shore. Stacked up the coast that reads as a staircase of little wave lines. The
   caller scores the piece against the map's own land-water boundary instead, and the wrong
   facing loses. Omit it where the material has no facing - the cliffs do.

   A template is {img, w, h, cells:[{m, ...}]} where `m` is the cell's 24x24 material mask - what
   the seam is scored on - and the rest is whatever the caller's `fits` wants to read. */
var RTS_TEM_SEAMW = 8;                   /* measured: 3 -> 91.6%, 8 -> 91.8%, 20 -> 91.9% */
var RTS_TEM_MATCHW = 24;                 /* facing beats seam: see the shoreline note above */
/* A candidate that repeats the piece already next to it is docked this much. A straight run of
   coast is the same situation cell after cell, so without this the same tile wins every time and
   the shore comes out as one motif stamped in a row - a picket fence, not rock.

   Measured on seed 9001, as the share of neighbouring pairs drawn with the SAME piece, against
   what the accuracy costs:

     weight 0   beach 15.1% identical, sea cliff 64.3%   match 0.8994 / 0.7730
     weight 1   beach  0.6%,           sea cliff 46.4%   match 0.8980 / 0.7703
     weight 3   beach  0.0%,           sea cliff  0.0%   match 0.8977 / 0.7717

   Three costs about a quarter of one sample out of 64 and removes the artefact outright. The sea
   cliff needs the whole of it: its coast is a short straight run, which is the worst case. */
var RTS_TEM_REPEATW = 3;

function _rtsTemFit(lib, N, opt) {
  var TS = RTS_TS, used = new Uint8Array(N * N), mask = new Array(N * N), out = [];
  var last = new Array(N * N);             /* map cell -> the template painted there */
  var seed = opt.seed | 0, needs = opt.needs, fits = opt.fits, match = opt.match;
  function hash(a, b, s) {
    var v = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(s | 0, 1442695041);
    v = Math.imul(v ^ (v >>> 13), 1274126177); v ^= v >>> 16;
    return (v >>> 0) / 4294967296;
  }
  /* Is this the same piece as the one already beside it? Only west and north exist in raster
     order, which is enough: a run is broken by breaking every second join. */
  function repeated(t, ox, oz) {
    for (var i = 0; i < t.h; i++) if (ox > 0 && last[(oz + i) * N + ox - 1] === t) return true;
    for (var j = 0; j < t.w; j++) if (oz > 0 && last[(oz - 1) * N + ox + j] === t) return true;
    return false;
  }
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

  for (var z = 0; z < N; z++) {
    for (var x = 0; x < N; x++) {
      if (!needs(x, z) || used[z * N + x]) continue;
      var best = null;
      for (var ti = 0; ti < lib.length; ti++) {
        var t = lib[ti];
        for (var oz = z - t.h + 1; oz <= z; oz++) {
          for (var ox = x - t.w + 1; ox <= x; ox++) {
            if (ox < 0 || oz < 0 || ox + t.w > N || oz + t.h > N) continue;
            var ok = true, gain = 0, agree = 0, nc = 0;
            for (var cy = 0; cy < t.h && ok; cy++) {
              for (var cx = 0; cx < t.w && ok; cx++) {
                var cell = t.cells[cy * t.w + cx], mx = ox + cx, mz = oz + cy;
                if (used[mz * N + mx] || !fits(cell, mx, mz)) { ok = false; break; }
                if (needs(mx, mz)) gain++;
                if (match && cell.px) { agree += match(cell, mx, mz); nc++; }
              }
            }
            if (!ok || !gain) continue;
            var score = gain * 4 + seam(t, ox, oz) * RTS_TEM_SEAMW + hash(ox, oz, ti + seed) * 0.5;
            if (nc) score += (agree / nc) * RTS_TEM_MATCHW;
            if (repeated(t, ox, oz)) score -= RTS_TEM_REPEATW;
            if (!best || score > best.score) best = { score: score, t: t, ox: ox, oz: oz };
          }
        }
      }
      if (!best) continue;
      for (var by = 0; by < best.t.h; by++) for (var bx = 0; bx < best.t.w; bx++) {
        var k = (best.oz + by) * N + best.ox + bx;
        used[k] = 1;
        mask[k] = best.t.cells[by * best.t.w + bx].m;
        last[k] = best.t;
      }
      out.push({ t: best.t, ox: best.ox, oz: best.oz });
    }
  }

  /* Mop up. A cell wedged against something no whole template can straddle defeats every offset,
     and one bare cell in the middle of real art is the loudest possible artefact. The last resort
     is a SINGLE CELL lifted out of a template - the piece the original itself uses for a lone
     boulder or a stretch of open sand. With it the fit reaches every cell that needs art on every
     seed measured, which is what lets the drawn fallback be skipped outright rather than mixed in
     beside the real thing. */
  var fill = opt.fill;
  if (fill && fill.length) {
    for (var mz2 = 0; mz2 < N; mz2++) {
      for (var mx2 = 0; mx2 < N; mx2++) {
        if (!needs(mx2, mz2) || used[mz2 * N + mx2]) continue;
        var p = fill[(hash(mx2, mz2, seed + 7) * fill.length) | 0];
        used[mz2 * N + mx2] = 1;
        mask[mz2 * N + mx2] = p.t.cells[p.i].m;
        out.push({ t: p.t, ox: mx2 - (p.i % p.t.w), oz: mz2 - ((p.i / p.t.w) | 0), only: p.i });
      }
    }
  }
  return { place: out, used: used };
}

/* Stamp a fitted result into the baked terrain's pixels. `only` marks a mop-up piece: one cell of
   its template is painted and the rest of the footprint is left alone. */
function _rtsTemPaint(d, S, res) {
  var TS = RTS_TS, pal = RTS_MIX.pal;
  res.place.forEach(function (p) {
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
}

/* Which palette indices are plain ground. clear1.tem is the theatre's grass and nothing else, so
   an index it never uses cannot be grass - which is the only reliable way to separate a
   template's material from its margin. A colour test does not work: this tileset dithers its
   grass with near-black neutrals that the rock shadows also use, and green-versus-not called 65%
   of a mostly-grass cell rock. */
function _rtsTemGrassSet() {
  var clear = _mixTiles('clear1' + _rtsThExt());
  if (!clear) return null;
  var g = new Uint8Array(256);
  for (var c = 0; c < clear.tile.length; c++) {
    var t = clear.tile[c];
    if (!t) continue;
    for (var i = 0; i < RTS_TS * RTS_TS; i++) g[t[i]] = 1;
  }
  return g;
}

/* Per-cell material masks and coverage for one template: the not-plain-ground seeds, closed over
   a 5x5 window so shadow and the dark dither inside a face count as material rather than leaving
   the mask as lace.

   Computed over the WHOLE template and sliced afterwards, not cell by cell. The close has to see
   across a cell boundary, or every cell grows a thinned border and the seam scoring - which is
   entirely about what happens at those borders - is measuring an artefact of its own making. */
function _rtsTemMasks(tem, w, h, grass) {
  var TS = RTS_TS, W = w * TS, H = h * TS, seed = new Uint8Array(W * H), x, y, cx, cy;
  for (cy = 0; cy < h; cy++) for (cx = 0; cx < w; cx++) {
    var tl = tem.tile[cy * w + cx];
    if (!tl) continue;
    for (y = 0; y < TS; y++) for (x = 0; x < TS; x++)
      seed[(cy * TS + y) * W + cx * TS + x] = grass[tl[y * TS + x]] ? 0 : 1;
  }
  var full = new Uint8Array(W * H);
  for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
    var n = 0;
    for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++) {
      var qx = x + dx, qy = y + dy;
      if (qx < 0 || qy < 0 || qx >= W || qy >= H) continue;
      n += seed[qy * W + qx];
    }
    full[y * W + x] = n >= 6 ? 1 : 0;
  }
  var out = [];
  for (var c = 0; c < w * h; c++) {
    var ox = (c % w) * TS, oy = ((c / w) | 0) * TS, m = new Uint8Array(TS * TS), k = 0;
    if (tem.tile[c]) for (y = 0; y < TS; y++) for (x = 0; x < TS; x++) {
      var v = full[(oy + y) * W + ox + x];
      m[y * TS + x] = v; k += v;
    }
    out.push({ m: m, cov: tem.tile[c] ? k / (TS * TS) : 0 });
  }
  return out;
}
