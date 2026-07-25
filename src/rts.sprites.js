/* RC COMMAND - sprite generation: terrain, ore, effects, and the palette everything uses.

   The structures and units are NOT drawn here - they are 3D models, defined further down
   and rendered to sprites once at load by rts.r3d.js. That is how the originals were made,
   and it is the reason they have real volume while hand-drawn pixel art of the same subject
   does not. Ground, ore and explosions are still drawn in 2D, because they are flat things.

   One rule governs everything in this file and the baker alike: NEVER SCALE OR ROTATE BY A
   FRACTION IN CANVAS. An early pass drew 24px-per-cell art at 40 screen pixels per cell - a
   1.667x resample - and the result was mush, with pixels of two different sizes side by
   side. Screen cells are locked to RTS_ZOOMS, and the baker rasterises its own polygons
   rather than letting canvas anti-alias them.

   Nothing here is traced, ripped or copied from any existing game. */

var RTS_TS = 24;                  /* art pixels per map cell */
var RTS_ZOOMS = [12, 24, 48];     /* screen px per cell: 0.5x, 1x, 2x. Nothing else. */
var RTS_ZOOM_DEF = 1;             /* index into RTS_ZOOMS - 24 = one art pixel per screen pixel */
var _RTS_SPR = null;

/* Temperate theatre. Deliberately grubby: clean saturated colours read as modern, and the
   first pass's bright lawn-green ground was the single loudest wrong note in the picture. */
var RTS_PAL = {
  out:   '#15171b',
  /* Forest green, not lawn green. The reference material is dark, cool and low-contrast;
     an earlier olive palette read as a golf course with gravel on it. */
  grass: ['#2f3d1e', '#374626', '#273417', '#405030', '#1f2b12'],
  dirt:  ['#6a5a3f', '#786748', '#5b4d35', '#847150'],
  rock:  ['#5b5344', '#6b6252', '#3c372d', '#7c7362'],
  bush:  ['#2c3818', '#222c12', '#39471f'],
  /* Canopy is deliberately a long way darker than the grass, with one bright tip tone. An
     earlier set sat within a few points of the ground colour and the whole forest
     disappeared into texture - you could not see that they were trees. */
  tree:  ['#1c3316', '#26431d', '#111f0d', '#3d7031', '#43301c'],   /* canopy tones + trunk */
  water: ['#2b4c6b', '#356088', '#20384f', '#4a7ba6', '#6fa3c9'],
  sand:  ['#8a7c58', '#9c8e68', '#75684a'],
  road:  ['#5a4e39', '#665942', '#4b412f'],
  bag:   ['#a89663', '#bcaa78', '#7d6e47'],
  ore:   ['#b08420', '#d4a934', '#eecb62', '#7d5c12', '#8f6a17'],
  conc:  ['#8c8c83', '#a3a39a', '#6c6c64', '#b6b6ad'],
  steel: ['#59616d', '#6d7583', '#424953', '#818a99'],
  dark:  ['#31363e', '#3f4650', '#22262c', '#4b5360'],
  glass: '#8fbcd4',
  lit:   '#ffd98a',
  hazard:['#c9a227', '#2a2a26'],
  team: {
    player: ['#2f5fa8', '#3f7fd0', '#1e3f74', '#69a9ee'],
    enemy:  ['#a83228', '#d04438', '#741e18', '#ec7663']
  },
  /* Structures are NOT grey. In the reference each faction's buildings are strongly
     coloured - steel blue walls under maroon roofs on one side, red on the other - and that
     colour is most of how you tell whose base you are looking at from across the map. An
     all-concrete pass read as a grey industrial estate. */
  bld: {
    player: { wall:'#4a6b91', roof:'#6b4436', trim:'#aebccb', dark:'#2f4a68' },
    enemy:  { wall:'#944034', roof:'#4e3630', trim:'#c9a89f', dark:'#5f2820' }
  }
};

/* ------------------------------------------------------------------ plumbing */
function _sprMake(w, h) {
  var c = document.createElement('canvas');
  c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0);
  var g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  return { c: c, g: g };
}
function _sprRect(g, x, y, w, h, col) {
  if (w <= 0 || h <= 0) return;
  g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}
/* Deterministic hash -> [0,1). Used everywhere a pattern must be stable across reloads.
   Every multiply is Math.imul: a plain `a * b` on two 32-bit ints produces a value up to
   2^62, which a double cannot hold exactly, so the low bits - the only ones that matter to
   a hash - come back as garbage. The first version did that, and the result was a terrain
   bake containing no dirt at all, because the "random" grade never crossed its threshold. */
function _sprHash(x, y, s) {
  var h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
/* Value noise with smoothstep interpolation, one octave. */
function _sprVN(x, y, scale, seed) {
  var fx = x / scale, fy = y / scale;
  var x0 = Math.floor(fx), y0 = Math.floor(fy);
  var tx = fx - x0, ty = fy - y0;
  tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
  var a = _sprHash(x0, y0, seed), b = _sprHash(x0 + 1, y0, seed);
  var c = _sprHash(x0, y0 + 1, seed), d = _sprHash(x0 + 1, y0 + 1, seed);
  return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
}
function _sprFbm(x, y, seed) {
  return _sprVN(x, y, 48, seed) * 0.55 + _sprVN(x, y, 16, seed + 7) * 0.30 + _sprVN(x, y, 6, seed + 19) * 0.15;
}

/* Integer-pixel disc and ellipse. arc()+fill() anti-aliases, which is exactly what we are
   avoiding, so these fill whole scanlines instead. */
function _sprDisc(g, cx, cy, r, col) { _sprEll(g, cx, cy, r, r, col); }
function _sprEll(g, cx, cy, rx, ry, col) {
  g.fillStyle = col;
  for (var dy = -Math.ceil(ry); dy <= Math.ceil(ry); dy++) {
    var k = 1 - (dy * dy) / (ry * ry);
    if (k <= 0) continue;
    var w = Math.sqrt(k) * rx;
    g.fillRect(Math.round(cx - w), Math.round(cy + dy), Math.max(1, Math.round(w * 2)), 1);
  }
}
/* An upright cylinder: elliptical cap, body shaded left-lit to right-dark, dark base. */
function _sprCyl(g, cx, topY, rx, bodyH, tones) {
  var ry = Math.max(2, Math.round(rx * 0.42));
  _sprRect(g, cx - rx, topY, rx * 2, bodyH, tones[0]);
  _sprRect(g, cx - rx, topY, Math.max(1, Math.round(rx * 0.5)), bodyH, tones[1]);   /* lit left */
  _sprRect(g, cx + rx - Math.max(1, Math.round(rx * 0.45)), topY, Math.max(1, Math.round(rx * 0.45)), bodyH, tones[2]);
  _sprEll(g, cx, topY, rx, ry, tones[1]);                                            /* cap */
  _sprEll(g, cx, topY - 1, rx - 1, ry - 1, tones[3] || tones[1]);
  _sprRect(g, cx - rx, topY + bodyH - 2, rx * 2, 2, tones[2]);                        /* base shadow */
}

/* Hard 1px outline traced around whatever silhouette is already on the canvas. Stroking
   rectangles cannot do this once a building is made of overlapping parts - the internal
   edges show through. Reading the alpha channel and darkening every transparent pixel
   that touches an opaque one gives one clean line around the whole shape. */
function _sprEdge(cv, col) {
  var g = cv.getContext('2d'), W = cv.width, H = cv.height;
  var img = g.getImageData(0, 0, W, H), d = img.data;
  var op = new Uint8Array(W * H), i, x, y;
  for (i = 0; i < W * H; i++) op[i] = d[i * 4 + 3] > 128 ? 1 : 0;
  var c = _sprCol(col || RTS_PAL.out);
  for (y = 0; y < H; y++) {
    for (x = 0; x < W; x++) {
      i = y * W + x;
      if (op[i]) continue;
      var n = (x > 0 && op[i - 1]) || (x < W - 1 && op[i + 1]) ||
              (y > 0 && op[i - W]) || (y < H - 1 && op[i + W]);
      if (!n) continue;
      d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; d[i * 4 + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
}
function _sprCol(hex) {
  var n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
/* Soft drop shadow under a finished silhouette, offset down-right like the whole genre. */
function _sprShadow(cv, dx, dy) {
  var W = cv.width, H = cv.height;
  var t = _sprMake(W, H);
  t.g.globalAlpha = 0.30;
  t.g.drawImage(cv, dx, dy);
  t.g.globalAlpha = 1;
  t.g.globalCompositeOperation = 'source-in';
  t.g.fillStyle = '#000'; t.g.fillRect(0, 0, W, H);
  t.g.globalCompositeOperation = 'source-over';
  t.g.drawImage(cv, 0, 0);
  return t.c;
}

/* ============================================================ terrain (baked) ==
   The ground used to be one of six 24x24 tiles picked per cell at random. That is what
   produced the checkerboard of hard-edged brown squares: every dirt patch was exactly one
   cell, perfectly axis-aligned, and the seams between tiles lined up into a visible grid.

   Instead the whole battlefield is painted once into a single canvas at art resolution
   (112 cells x 24px = 2688 square) using continuous noise, so patches are organic blobs
   that ignore cell boundaries entirely. The renderer then draws the visible window with
   one drawImage per frame, which is also far cheaper than two thousand tile blits. */
function _rtsBakeTerrain(G) {
  var N = RTS_N, S = N * RTS_TS, seed = (G.seed || 1) | 0;
  var t = _sprMake(S, S), g = t.g;
  var img = g.createImageData(S, S), d = img.data;
  var gr = RTS_PAL.grass.map(_sprCol), dr = RTS_PAL.dirt.map(_sprCol);
  var B = 2;                       /* paint in 2px blocks: pixel art ground is clumpy, not TV static */

  for (var by = 0; by < S; by += B) {
    for (var bx = 0; bx < S; bx += B) {
      var n = _sprFbm(bx, by, seed);
      var grain = _sprHash(bx >> 1, by >> 1, seed + 3);
      var pal, k;
      /* Bare earth is rare now that the map has roads, beaches and ore aprons on it - an
         earlier threshold of 0.62 put dirt everywhere and the battlefield came out more
         tan than green, which is the opposite of the reference. */
      if (n > 0.72) {                                   /* dirt: broad organic patches */
        pal = dr;
        k = grain < 0.18 ? 3 : (grain < 0.5 ? 1 : (grain < 0.82 ? 0 : 2));
        if (n < 0.75 && grain < 0.45) { pal = gr; k = 2; }   /* ragged edge, not a hard border */
      } else {
        pal = gr;
        k = grain < 0.12 ? 4 : (grain < 0.42 ? 2 : (grain < 0.76 ? 0 : 1));
        if (n > 0.56 && grain < 0.35) { pal = gr; k = 3; }   /* sun-bleached toward the dirt */
      }
      var c = pal[k];
      for (var yy = 0; yy < B; yy++) {
        var row = (by + yy) * S;
        for (var xx = 0; xx < B; xx++) {
          var o = (row + bx + xx) * 4;
          d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
        }
      }
    }
  }
  g.putImageData(img, 0, 0);

  /* Scatter that crosses cell lines: tufts, pebbles and bushes placed in world pixels. */
  var i, x, y;
  for (i = 0; i < S * S / 900; i++) {
    x = _sprHash(i, 11, seed + 41) * S; y = _sprHash(i, 29, seed + 43) * S;
    var r = _sprHash(i, 5, seed + 47);
    if (r < 0.55) {                                   /* grass tuft */
      var tc = RTS_PAL.grass[r < 0.28 ? 4 : 3];
      _sprRect(g, x, y, 1, 2, tc); _sprRect(g, x + 1, y + 1, 1, 2, tc); _sprRect(g, x - 1, y + 1, 1, 1, tc);
    } else if (r < 0.85) {                            /* pebble */
      _sprRect(g, x, y + 1, 2, 1, RTS_PAL.rock[2]);
      _sprRect(g, x, y, 2, 1, RTS_PAL.rock[0]);
    } else {                                          /* small bush clump */
      _sprEll(g, x, y + 1, 3, 2, RTS_PAL.bush[1]);
      _sprEll(g, x, y, 3, 2, RTS_PAL.bush[0]);
      _sprEll(g, x - 1, y - 1, 2, 1, RTS_PAL.bush[2]);
    }
  }

  /* --- ground cover per tile: sand, road and water are painted flat, under everything --- */
  var TS = RTS_TS, tx, tz, k, cx, cy;
  function tileAt(x, z) { return _rtsInB(x, z) ? G.terrain[_rtsIdx(x, z)] : -1; }
  for (tz = 0; tz < N; tz++) {
    for (tx = 0; tx < N; tx++) {
      k = G.terrain[_rtsIdx(tx, tz)];
      if (k !== RTS_T_SAND && k !== RTS_T_ROAD && k !== RTS_T_WATER) continue;
      var pal = k === RTS_T_WATER ? RTS_PAL.water : (k === RTS_T_ROAD ? RTS_PAL.road : RTS_PAL.sand);
      for (var py = 0; py < TS; py += 2) {
        for (var px = 0; px < TS; px += 2) {
          var gx = tx * TS + px, gy = tz * TS + py;
          var hv = _sprHash(gx >> 1, gy >> 1, seed + 91);
          /* Edges dither into the neighbour so a road has a ragged verge, not a kerb. */
          var edge = (px < 3 && tileAt(tx - 1, tz) !== k) || (px > TS - 4 && tileAt(tx + 1, tz) !== k) ||
                     (py < 3 && tileAt(tx, tz - 1) !== k) || (py > TS - 4 && tileAt(tx, tz + 1) !== k);
          if (edge && hv < 0.45) continue;
          _sprRect(g, gx, gy, 2, 2, pal[hv < 0.3 ? 2 : (hv < 0.72 ? 0 : 1)]);
        }
      }
    }
  }
  /* Water gets highlight ripples once the body is down, so they run across tile seams. */
  for (var w = 0; w < (S * S) / 1400; w++) {
    var wx = _sprHash(w, 3, seed + 95) * S, wy = _sprHash(3, w, seed + 97) * S;
    if (tileAt((wx / TS) | 0, (wy / TS) | 0) !== RTS_T_WATER) continue;
    var wl = 3 + (_sprHash(w, w, seed + 99) * 6 | 0);
    _sprRect(g, wx, wy, wl, 1, RTS_PAL.water[3]);
    _sprRect(g, wx + 1, wy + 1, wl - 2, 1, RTS_PAL.water[4]);
  }

  /* --- rock ridges. Drawn bigger than their cell and merged with their neighbours, so a
         run of blocked cells reads as one wall rather than a row of boxes. The south face
         is a hard dark band: that shadow is what makes a ridge read as height. --- */
  var rockCv = _sprMake(S, S), rg = rockCv.g, RK = RTS_PAL.rock;
  function isRock(x, z) { return tileAt(x, z) === RTS_T_ROCK; }
  for (tz = 0; tz < N; tz++) {
    for (tx = 0; tx < N; tx++) {
      if (!isRock(tx, tz)) continue;
      var ox = tx * TS, oy = tz * TS;
      /* Extend to the cell edge wherever the neighbour is also rock, and pull in with a
         ragged margin where it is not. Drawing each cell as an ellipse - the first attempt -
         turned a ridge into a string of grey bubbles; a plateau needs flat tops and
         straight-ish edges to read as stone. */
      var l = isRock(tx - 1, tz) ? 0 : 2 + (_sprHash(tx, tz, seed + 61) * 3 | 0);
      var r2 = isRock(tx + 1, tz) ? 0 : 2 + (_sprHash(tx, tz, seed + 62) * 3 | 0);
      var u = isRock(tx, tz - 1) ? 0 : 2 + (_sprHash(tx, tz, seed + 63) * 3 | 0);
      var dn = isRock(tx, tz + 1) ? 0 : 3 + (_sprHash(tx, tz, seed + 64) * 3 | 0);
      var bx = ox + l, by = oy + u, bw = TS - l - r2, bh = TS - u - dn;
      /* Mottled stone, in 2px blocks. Filling the cell with one flat grey and outlining it
         turned a ridge into a paved plaza with visible cell borders - the same tiling
         artefact the ground had, just in grey. The texture has to cross the cell seam. */
      for (var sy = 0; sy < bh; sy += 2) {
        for (var sx = 0; sx < bw; sx += 2) {
          var gx2 = bx + sx, gy2 = by + sy;
          var hv2 = _sprHash(gx2 >> 1, gy2 >> 1, seed + 71);
          _sprRect(rg, gx2, gy2, 2, 2, hv2 < 0.22 ? RK[2] : (hv2 < 0.68 ? RK[0] : RK[1]));
        }
      }
      /* Lighting only on faces that are actually exposed. */
      if (!isRock(tx, tz - 1)) {
        _sprRect(rg, bx, by, bw, 2, RK[3]);                        /* sunlit north lip */
        _sprRect(rg, bx, by + 2, bw, 1, RK[1]);
      }
      if (!isRock(tx - 1, tz)) _sprRect(rg, bx, by, 2, bh, RK[1]);
      if (!isRock(tx + 1, tz)) _sprRect(rg, bx + bw - 2, by, 2, bh, RK[2]);
      if (!isRock(tx, tz + 1)) {                                   /* the drop, in shadow */
        _sprRect(rg, bx, by + bh - 8, bw, 8, RK[2]);
        _sprRect(rg, bx, by + bh - 8, bw, 1, RK[0]);
        for (var cf = 0; cf < 4; cf++) {                           /* vertical fissures */
          var fxx = bx + 2 + Math.floor(cf * (bw - 4) / 3);
          _sprRect(rg, fxx, by + bh - 7, 1, 5 + (_sprHash(cf, tx + tz, seed + 77) * 2 | 0), RK[0]);
        }
      }
    }
  }
  _sprEdge(rockCv.c);
  g.drawImage(rockCv.c, 0, 0);

  /* --- sandbag emplacements --- */
  var bagSpr = _sprSandbag();
  for (tz = 0; tz < N; tz++) {
    for (tx = 0; tx < N; tx++) {
      if (G.terrain[_rtsIdx(tx, tz)] !== RTS_T_WALL) continue;
      g.drawImage(bagSpr.c, tx * TS, tz * TS - bagSpr.head);
    }
  }

  /* --- forest. Conifers, drawn back-to-front down the map so a grove overlaps correctly,
         each one taller than its cell with a cast shadow. This is the single biggest
         difference between "a field" and "a battlefield". --- */
  var trees = _sprTrees();
  for (tz = 0; tz < N; tz++) {
    for (tx = 0; tx < N; tx++) {
      if (G.terrain[_rtsIdx(tx, tz)] !== RTS_T_TREE) continue;
      /* Jitter close to a full cell. One tree per cell nudged a few pixels still lines up
         into visible rows; a grove has to look sown, not planted. */
      var jx = (_sprHash(tx, tz, seed + 101) - 0.5) * 17;
      var jy = (_sprHash(tz, tx, seed + 103) - 0.5) * 15;
      var tr = trees[(_sprHash(tx, tz, seed + 107) * 3) | 0];
      g.drawImage(tr.c, Math.round(tx * TS + jx), Math.round(tz * TS + jy - tr.head));
    }
  }
  return t.c;
}

/* Conifers, baked from 3D like everything else. They were stacked 2D ellipses before, which
   left the forest looking like flat cut-outs while the buildings beside it had volume - and
   the forest is a fifth of the map, so it set the tone for the whole picture. Three size
   variants, picked per cell. */
var _RTS_TREES = null;
function _sprTrees() {
  if (_RTS_TREES) return _RTS_TREES;
  var TR = RTS_PAL.tree, out = [];
  for (var v = 0; v < 3; v++) {
    var sc = [0.82, 1.0, 1.22][v], m = [];
    _r3Cyl(m, 0, 0, 0, 1.6 * sc, 5 * sc, TR[4], TR[4], 8);            /* trunk */
    var tiers = v === 1 ? 4 : 3;
    for (var i = 0; i < tiers; i++) {
      var f = i / tiers;
      var r0 = 8 * sc * (1 - f * 0.55), r1 = r0 * 0.42;
      var y = (3 + f * 13) * sc, h = 6.5 * sc;
      _r3Cone(m, 0, y, 0, r0, r1, h, i === tiers - 1 ? TR[1] : TR[0], 12);
    }
    var r = _r3BakeFootprint(m, RTS_TS, RTS_TS);
    out.push({ c: _sprShadow(r.c, 3, 3), head: r.head });
  }
  _RTS_TREES = out;
  return out;
}

/* ------------------------------------------------------------------------ ore --
   Four density stages. Nuggets are drawn wrapped - every cluster is also painted one cell
   left/right/up/down - so clusters run across cell edges and a worked field reads as
   continuous ground rather than a grid of identical stamps. Three variants per stage,
   chosen by a hash of the cell, kill the last of the repetition. */
function _sprOre() {
  var out = [], P = RTS_PAL.ore, TS = RTS_TS;
  for (var st = 0; st < 4; st++) {
    var variants = [];
    for (var v = 0; v < 3; v++) {
      var t = _sprMake(TS, TS), g = t.g, seed = st * 977 + v * 131 + 17;
      var n = [8, 17, 30, 44][st];
      for (var i = 0; i < n; i++) {
        var x = _sprHash(i, v, seed) * TS, y = _sprHash(v, i, seed + 5) * TS;
        var big = _sprHash(i, i, seed + 9) < 0.35;
        var w = big ? 3 : 2, h = big ? 3 : 2;
        /* Drawn wrapped, so a cluster runs across the cell edge and a worked field reads
           as one continuous deposit instead of a grid of identical stamps. */
        for (var oy = -1; oy <= 1; oy++) {
          for (var ox = -1; ox <= 1; ox++) {
            var px = x + ox * TS, py = y + oy * TS;
            if (px < -4 || px > TS + 1 || py < -4 || py > TS + 1) continue;
            _sprRect(g, px, py + 1, w, h, P[3]);            /* the crystal's own shadow */
            _sprRect(g, px, py, w, h, P[0]);
            _sprRect(g, px, py, w - 1, 1, P[1]);            /* lit facet */
            _sprRect(g, px, py, 1, 1, P[2]);                /* glint */
          }
        }
      }
      variants.push(t.c);
    }
    out.push(variants);
  }
  return out;
}

/* Water shimmer, as a cycle of overlay frames.

   CONQUER.CPP animates water by ROTATING A BAND OF PALETTE ENTRIES one step every quarter
   second - the colours move through the pixels while the pixels stay put. With no indexed
   palette to rotate, the equivalent is a short cycle of highlight overlays drawn over the
   baked water: same effect, same cadence. A static lake is one of the deadest things on a
   map, and mine was static. */
function _sprWaterCycle() {
  var out = [], TS = RTS_TS, W = RTS_PAL.water, n;
  for (var f = 0; f < 4; f++) {
    var t = _sprMake(TS, TS), g = t.g;
    for (n = 0; n < 22; n++) {
      var x = _sprHash(n, 3, 41) * TS, y = _sprHash(3, n, 47) * TS;
      /* The highlight walks along each crest rather than blinking on and off. */
      var ph = (n + f) & 3;
      if (ph > 1) continue;
      var len = 3 + (_sprHash(n, n, 53) * 5 | 0);
      _sprRect(g, x + f, y, len, 1, ph === 0 ? W[3] : W[4]);
      _sprRect(g, x + f + 1, y + 1, Math.max(1, len - 2), 1, W[1]);
    }
    out.push(t.c);
  }
  return out;
}

/* A run of sandbags, one map cell long. Baked from the 3D models like everything else, so
   the bags catch the same light as the buildings. Stamped along RTS_T_WALL cells. */
function _sprSandbag() {
  var m = [], BG = RTS_PAL.bag;
  for (var row = 0; row < 3; row++) {
    var y = row * 4, off = (row % 2) ? 4 : 0, cnt = (row % 2) ? 3 : 4;
    for (var i = 0; i < cnt; i++) {
      _r3Box(m, -RTS_TS / 2 + 4 + off + i * 8, y, 0, 8, 5, 11,
        row === 2 ? BG[1] : (row ? BG[0] : BG[2]), BG[1]);
    }
  }
  var r = _r3BakeFootprint(m, RTS_TS, RTS_TS);
  _sprEdge(r.c);
  return { c: _sprShadow(r.c, 2, 2), head: r.head };
}

/* ============================================================ 3D MODELS ==
   Every structure and unit is a small 3D model, rendered to a sprite once at load by
   rts.r3d.js. See that file for why: the originals were made exactly this way, and
   hand-drawn pixel art does not reproduce the result.

   Coordinates are art pixels. A 3x3 building's footprint is 72x72, centred on the origin,
   with y=0 at ground level and +y up. Build from the ground upward - every part sits on
   something below it, so the y offsets read as a running total. */
function _sprBuilding(key, side) {
  var def = rtsStructDef(key), TM = RTS_PAL.team[side];
  var W = def.w * RTS_TS, D = def.h * RTS_TS;
  var C = RTS_PAL.conc, S = RTS_PAL.steel, DK = RTS_PAL.dark, B = RTS_PAL.bld[side];
  var m = [], i;
  /* Facade detail. In the reference a wall is never one flat colour - it carries pale
     pilasters and rows of lit windows, and that is a lot of what separates a building from
     a coloured box. Mounted 1.5 units proud of the wall face so they read cleanly. */
  function winRow(z, y, cx, count, gap, w, h) {
    for (var k = 0; k < count; k++) {
      _r3Box(m, cx + (k - (count - 1) / 2) * gap, y, z, w, h, 1.5, RTS_PAL.glass, RTS_PAL.glass);
    }
  }
  function pilasters(z, y, cx, count, gap, w, h) {
    for (var k = 0; k < count; k++) {
      _r3Box(m, cx + (k - (count - 1) / 2) * gap, y, z, w, h, 1.5, B.trim, B.trim);
    }
  }

  if (key === 'yard') {
    /* Command Yard: a heavy slab under a full-width crane gantry. Nothing else in the base
       has anything spanning its whole width above the roof line, so it reads at any zoom. */
    _r3Slab(m, 0, 0, 2, W - 8, 25, D - 10, 5, B.wall, B.roof);
    _r3Slab(m, -5, 25, -8, W - 32, 9, D - 40, 3, B.wall, B.roof);            /* penthouse */
    _r3Box(m, -5, 34, -14, W - 40, 2, 4, TM[0], TM[1]);            /* team panel on it */
    for (i = 0; i < 3; i++) _r3Box(m, -18 + i * 13, 25, 8, 8, 5, 7, DK[1], DK[3]);  /* AC units */
    _r3Box(m, 0, 25, 20, W - 26, 2, 5, S[0], S[3]);                /* conduit run */
    _r3Box(m, 19, 25, 12, 14, 7, 11, S[2], S[1]);                  /* rooftop tank */
    _r3Box(m, -26, 0, 0, 9, 52, 9, S[2], S[1]);                    /* crane tower */
    _r3Box(m, 2, 47, 0, W - 22, 5, 7, S[2], S[1]);                 /* jib */
    _r3Box(m, 24, 37, 0, 2, 10, 2, DK[1], DK[3]);                  /* hoist cable */
    _r3Box(m, 24, 32, 0, 11, 5, 8, S[0], S[1]);                    /* hook block */
    pilasters(34, 0, 0, 5, 13, 5, 25);
    winRow(34, 13, 0, 4, 13, 6, 5);
    _r3Box(m, 0, 0, D / 2 - 5, W - 20, 2, 9, RTS_PAL.hazard[0], RTS_PAL.hazard[0]);

  } else if (key === 'power') {
    /* Power Plant: low hall, two big cooling stacks, transformer bank. */
    _r3Slab(m, 0, 0, 3, W - 8, 18, D - 12, 4, B.wall, B.roof);
    _r3Gable(m, 0, 18, 6, W - 20, 8, D - 26, B.roof);                /* turbine hall ridge */
    _r3Box(m, 0, 22, 6, W - 22, 1, 3, TM[0], TM[1]);
    _r3Cyl(m, -11, 0, -8, 8, 38, S[0], DK[1]);                     /* stacks, dark mouths */
    _r3Cyl(m, 12, 0, -3, 8, 32, S[0], DK[1]);
    _r3Box(m, -14, 0, 14, 11, 9, 8, S[2], S[1]);                   /* transformers */
    for (i = 0; i < 3; i++) _r3Box(m, -17 + i * 3, 9, 14, 1, 5, 1, S[3], S[3]);
    pilasters(21, 0, 0, 4, 11, 4, 18);
    winRow(21, 9, 0, 3, 11, 5, 4);
    _r3Box(m, 10, 18, 12, 18, 2, 6, DK[1], DK[3]);

  } else if (key === 'refinery') {
    /* Refinery: processing block, two fat silos, and a wide dock at the front for the
       harvester to drive into. The silos are the silhouette. */
    _r3Slab(m, -12, 0, -4, W - 34, 23, D - 22, 4, B.wall, B.roof);
    _r3Slab(m, -14, 23, -14, W - 50, 8, 16, 3, B.wall, B.roof);              /* control room */
    _r3Box(m, -14, 31, -20, W - 58, 2, 3, TM[0], TM[1]);
    for (i = 0; i < 3; i++) _r3Box(m, -24 + i * 11, 23, 4, 7, 5, 7, DK[1], DK[3]);
    _r3Cyl(m, 22, 0, -12, 12, 40, S[0], S[3]);                     /* rear silo */
    _r3Cyl(m, 21, 0, 14, 11, 32, S[0], S[3]);
    _r3Box(m, 5, 36, -12, 22, 2, 4, S[2], S[3]);                   /* catwalk */
    _r3Box(m, 22, 40, -12, 4, 11, 4, S[0], S[1]);                  /* vent pipe */
    pilasters(21, 0, -12, 4, 11, 5, 23);
    winRow(21, 12, -12, 3, 11, 6, 5);
    _r3Box(m, -14, 0, D / 2 - 7, W - 32, 3, 13, DK[1], DK[3]);     /* dock floor */
    _r3Box(m, -14, 3, D / 2 - 12, W - 32, 1, 3, RTS_PAL.hazard[0], RTS_PAL.hazard[0]);

  } else if (key === 'barracks') {
    /* Barracks: the only pitched roof in the set. */
    _r3Box(m, 0, 0, 0, W - 10, 13, D - 12, B.wall);
    _r3Hip(m, 0, 13, 0, W - 2, 19, D - 4, 11, B.roof);             /* steep, overhanging */
    _r3Box(m, 0, 19, 0, W - 4, 2, 5, TM[0], TM[1]);                /* unit band along the ridge */
    winRow(19, 5, -14, 2, 9, 5, 4);
    winRow(19, 5, 14, 2, 9, 5, 4);
    _r3Box(m, 0, 0, D / 2 - 6, 11, 11, 3, DK[1], DK[3]);            /* door */
    for (i = 0; i < 3; i++) {                                      /* sandbag ring */
      _r3Cyl(m, -16 + i * 5, 0, D / 2 - 2, 3, 3, RTS_PAL.dirt[3], RTS_PAL.dirt[1], 8);
      _r3Cyl(m, 16 - i * 5, 0, D / 2 - 2, 3, 3, RTS_PAL.dirt[3], RTS_PAL.dirt[1], 8);
    }
    _r3Box(m, W / 2 - 7, 0, -14, 1, 34, 1, S[0], S[3]);            /* flag pole */
    _r3Box(m, W / 2 - 3, 29, -14, 7, 5, 1, TM[1], TM[3]);

  } else if (key === 'factory') {
    /* War Factory: wide shed with a barrel roof, roll-up door, exhaust bank. The curved
       roof is where the flat shading pays off - it bands into visible facets. */
    _r3Box(m, 0, 0, 0, W - 8, 15, D - 8, B.wall);
    /* Ridged saw-tooth roof. A barrel vault was tried first and read dead flat: seen from
       above and in front, the whole near half of a barrel points at the light, so every
       segment lands on the same shading band. Five small ridges alternate bright and dark
       instead, which is legible at any zoom. */
    for (i = 0; i < 5; i++) {
      _r3Gable(m, 0, 15, -16 + i * 8, W - 10, 7, 8, i === 2 ? TM[0] : B.roof);
    }
    pilasters(33, 0, 0, 6, 12, 4, 15);
    winRow(33, 9, -24, 2, 11, 5, 4);
    winRow(33, 9, 24, 2, 11, 5, 4);
    _r3Box(m, 0, 0, D / 2 - 3, 30, 15, 3, DK[1], DK[3]);           /* roll-up door */
    _r3Box(m, 0, 0, D / 2 + 1, 38, 1, 6, RTS_PAL.hazard[0], RTS_PAL.hazard[0]);
    _r3Cyl(m, -W / 2 + 10, 15, -12, 4, 20, S[0], DK[1], 10);        /* exhausts */
    _r3Cyl(m, -W / 2 + 19, 15, -12, 4, 15, S[0], DK[1], 10);

  } else if (key === 'turret') {
    /* Turret: concrete pad and a squat rotating housing. The barrel is drawn by the
       renderer instead, because it has to track a target. */
    _r3Cone(m, 0, 0, 0, 11, 9, 4, C[0], 16);
    _r3Cone(m, 0, 4, 0, 8, 6, 8, TM[0], 14);
    _r3Cyl(m, 0, 12, 0, 6, 3, TM[1], TM[3], 14);
  }

  var r = _r3BakeFootprint(m, W, D);
  _sprEdge(r.c);
  return { c: _sprShadow(r.c, 3, 3), head: r.head };
}

/* ------------------------------------------------------------------- units --
   One model per type, yawed to each of eight facings and rendered separately. Because the
   model is rotated in 3D rather than the canvas being rotated in 2D, a tank at 45 degrees
   shows its side and its tracks correctly instead of being a smeared copy of the front. */
function _sprUnit(key, side) {
  var d = rtsUnitDef(key), TM = RTS_PAL.team[side];
  var S = RTS_PAL.steel, DK = RTS_PAL.dark, O = RTS_PAL.ore;
  var size = key === 'harvester' ? 30 : (d.kind === 'infantry' ? 16 : 26);
  var m = [], i;

  if (d.kind === 'infantry') {
    /* Two figures, offset so a squad does not read as one blob. +x is the nose. */
    var men = [[2.5, -3], [-2.5, 2.5]];
    for (i = 0; i < 2; i++) {
      var mx = men[i][0], mz = men[i][1];
      _r3Box(m, mx, 0, mz, 3.5, 5, 3, TM[0], TM[1]);               /* torso */
      _r3Box(m, mx, 5, mz, 3, 2, 3, '#c8a882', '#d8bc96');         /* helmet */
      if (key === 'rocket') _r3Box(m, mx + 3, 4, mz, 7, 1.6, 1.6, DK[1], DK[3]);
      else _r3Box(m, mx + 3, 3.5, mz, 5, 1, 1, DK[1], DK[3]);
    }
  } else if (key === 'tank') {
    _r3Box(m, 0, 0, -6, 19, 4, 5, DK[0], DK[1]);                   /* tracks */
    _r3Box(m, 0, 0, 6, 19, 4, 5, DK[0], DK[1]);
    _r3Box(m, 0, 3, 0, 18, 4, 10, TM[0], TM[1]);                   /* hull */
    _r3Box(m, -1, 7, 0, 10, 4, 9, TM[1], TM[3]);                   /* turret */
    _r3Box(m, 7, 8, 0, 13, 1.8, 1.8, DK[1], DK[3]);                /* barrel */
  } else if (key === 'buggy') {
    for (i = 0; i < 4; i++) {
      _r3Cyl(m, i < 2 ? 6 : -6, 0, (i % 2) ? 5.5 : -5.5, 3, 3.5, DK[0], DK[1], 8);
    }
    _r3Box(m, 0, 2.5, 0, 17, 3.5, 8, TM[0], TM[1]);                /* body */
    _r3Box(m, -2, 6, 0, 7, 3, 7, TM[2], RTS_PAL.glass);            /* open cockpit */
    _r3Box(m, 4, 8, 0, 9, 1.4, 1.4, DK[1], DK[3]);                 /* pintle gun */
  } else if (key === 'harvester') {
    _r3Box(m, 0, 0, -7.5, 22, 5, 6, DK[0], DK[1]);                 /* heavy tracks */
    _r3Box(m, 0, 0, 7.5, 22, 5, 6, DK[0], DK[1]);
    _r3Box(m, -5, 4, 0, 15, 8, 13, S[0], S[1]);                    /* hopper */
    _r3Box(m, -5, 12, 0, 12, 1, 10, O[0], O[1]);                   /* ore heaped in it */
    _r3Box(m, 8, 4, 0, 8, 7, 11, TM[0], TM[1]);                    /* cab */
    _r3Box(m, 11, 6, 0, 2, 4, 8, RTS_PAL.glass, RTS_PAL.glass);
    _r3Box(m, 14, 0, 0, 4, 3, 15, DK[1], DK[3]);                   /* intake blade */
  } else {
    _r3Box(m, 0, 0, -5, 15, 3.5, 4, DK[0], DK[1]);
    _r3Box(m, 0, 0, 5, 15, 3.5, 4, DK[0], DK[1]);
    _r3Box(m, 0, 2.5, 0, 15, 4, 8, TM[0], TM[1]);
    _r3Box(m, 4, 6, 0, 8, 1.4, 1.4, DK[1], DK[3]);
  }

  var frames = [];
  for (var f = 0; f < 8; f++) {
    var cv = _r3BakeCentred(_r3Yaw(m, -f / 8 * Math.PI * 2), size);
    _sprEdge(cv);
    frames.push(_sprShadow(cv, 1, 2));
  }
  return frames;
}

/* The concrete apron a structure stands on. In the reference every building sits on a pale
   irregular pad noticeably larger than itself - it is what stops a base looking like
   furniture set down on a lawn. Baked per footprint size and reused. */
function _sprPad(wCells, hCells) {
  var W = wCells * RTS_TS + 20, H = hCells * RTS_TS + 16;
  var t = _sprMake(W, H), g = t.g, P = RTS_PAL.conc, seed = wCells * 31 + hCells * 7;
  for (var y = 0; y < H; y += 2) {
    for (var x = 0; x < W; x += 2) {
      /* Distance to the edge of a rounded rect, wobbled by noise, gives a ragged verge. */
      var dx = Math.max(0, Math.abs(x - W / 2) - (W / 2 - 11));
      var dy = Math.max(0, Math.abs(y - H / 2) - (H / 2 - 9));
      var e = Math.hypot(dx, dy) + (_sprVN(x, y, 9, seed) - 0.5) * 9;
      if (e > 5) continue;
      var h = _sprHash(x >> 1, y >> 1, seed + 5);
      g.globalAlpha = e > 3 ? 0.5 : 1;
      _sprRect(g, x, y, 2, 2, h < 0.18 ? P[2] : (h < 0.66 ? P[0] : P[1]));
    }
  }
  g.globalAlpha = 1;
  return t.c;
}

/* Scorch marks and craters - SmudgeClass in the original, SMUDGE_SCORCH1..6 and
   SMUDGE_CRATER1. Stamped permanently into the baked terrain, so a battlefield accumulates
   a record of what happened on it instead of resetting between explosions. */
function _sprScorch() {
  var out = [], TS = RTS_TS;
  for (var v = 0; v < 6; v++) {
    var t = _sprMake(TS, TS), g = t.g, seed = v * 313 + 29;
    for (var y = 0; y < TS; y += 2) {
      for (var x = 0; x < TS; x += 2) {
        var dx = (x - TS / 2) / (TS / 2), dy = (y - TS / 2) / (TS / 2);
        var d = Math.hypot(dx, dy) + (_sprVN(x, y, 7, seed) - 0.5) * 0.75;
        if (d > 0.92) continue;
        var h = _sprHash(x >> 1, y >> 1, seed);
        g.globalAlpha = (1 - d) * 0.85;
        _sprRect(g, x, y, 2, 2, h < 0.4 ? '#141210' : (h < 0.78 ? '#241f19' : '#312a22'));
      }
    }
    g.globalAlpha = 1;
    out.push(t.c);
  }
  return out;
}
function _sprCrater() {
  var TS = RTS_TS, t = _sprMake(TS, TS), g = t.g;
  for (var y = 0; y < TS; y += 2) {
    for (var x = 0; x < TS; x += 2) {
      var dx = (x - TS / 2) / (TS / 2), dy = (y - TS / 2) / (TS / 2);
      var d = Math.hypot(dx, dy) + (_sprVN(x, y, 6, 71) - 0.5) * 0.5;
      if (d > 0.88) continue;
      g.globalAlpha = d > 0.6 ? 0.6 : 0.95;
      /* Lit north rim, dark bowl, so it reads as a hole rather than a stain. */
      var col = (d > 0.62 && dy < 0) ? '#6b6252' : (d < 0.35 ? '#171410' : '#2c261e');
      _sprRect(g, x, y, 2, 2, col);
    }
  }
  g.globalAlpha = 1;
  return t.c;
}
/* Flame frames. ANIM_FIRE_SMALL is what an explosion chains into and what rides a burning
   unit; it has to read at a glance without drowning the sprite underneath. */
function _sprFire() {
  var out = [], n = 5;
  for (var f = 0; f < n; f++) {
    var t = _sprMake(16, 20), g = t.g, seed = f * 97 + 11;
    for (var i = 0; i < 16; i++) {
      var yy = 19 - (i * 1.1 + _sprHash(i, f, seed) * 5);
      var wob = Math.sin((i / 16) * 3.1 + f * 1.3) * 3;
      var wx = 8 + wob - 2, w = Math.max(1, 5 - i * 0.25);
      var k = i / 16;
      var col = k < 0.32 ? '#fff2c0' : (k < 0.55 ? '#ffcf6a' : (k < 0.78 ? '#ff9a2e' : '#e0561c'));
      _sprRect(g, wx, yy, w, 2, col);
    }
    out.push(t.c);
  }
  return out;
}

/* Muzzle flashes and explosions, as small frame strips. */
function _sprFx() {
  var boom = [], i;
  var cols = ['#fff4cc', '#ffd070', '#ff9a2e', '#e0561c', '#8a3410', '#3a2418'];
  for (i = 0; i < 6; i++) {
    var s = 20 + i * 13, t = _sprMake(s, s), g = t.g, c = s / 2;
    _sprDisc(g, c, c, c - 1 - i * 0.5, cols[Math.min(5, i)]);
    if (i < 4) _sprDisc(g, c, c, (c - 1) * 0.55, cols[Math.max(0, i - 1)]);
    if (i < 3) for (var k = 0; k < 6; k++) {                     /* debris specks */
      var a = k / 6 * 6.283 + i;
      _sprRect(g, c + Math.cos(a) * c * 0.8, c + Math.sin(a) * c * 0.8, 2, 2, cols[i + 1]);
    }
    boom.push(t.c);
  }
  var flash = [];
  for (i = 0; i < 3; i++) {
    var f = _sprMake(9, 9);
    _sprDisc(f.g, 4.5, 4.5, 4 - i, i === 0 ? '#fff6d0' : (i === 1 ? '#ffd070' : '#ff9a30'));
    flash.push(f.c);
  }
  return { boom: boom, flash: flash };
}

function _rtsSprites() {
  if (_RTS_SPR) return _RTS_SPR;
  var S = { ore: _sprOre(), bld: {}, unit: {}, fx: _sprFx(), pad: {} };
  RTS_STRUCTS.forEach(function (d) { S.pad[d.key] = _sprPad(d.w, d.h); });
  S.bag = _sprSandbag();
  S.wave = _sprWaterCycle();
  S.scorch = _sprScorch();
  S.crater = _sprCrater();
  S.fire = _sprFire();
  ['player', 'enemy'].forEach(function (side) {
    S.bld[side] = {}; S.unit[side] = {};
    RTS_STRUCTS.forEach(function (d) { S.bld[side][d.key] = _sprBuilding(d.key, side); });
    RTS_UNITS.forEach(function (d) { S.unit[side][d.key] = _sprUnit(d.key, side); });
  });
  _RTS_SPR = S;
  return S;
}
