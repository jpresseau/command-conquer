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
  /* A DAYLIT ground, and the numbers are the reason. This palette used to be built around
     "the reference material is dark, cool and low-contrast" - the previous comment here -
     and measured, that produced a frame with a median luminance of 33/255, a 95th percentile
     of 76, and 93% of every pixel below 64. There were no highlights anywhere in the image;
     nothing above half brightness existed. It did not read as a cool palette, it read as
     night, and it is the single biggest reason the game does not look like what it is
     imitating.

     The target is an outdoor scene in daylight: a median around 90-110 with real top end
     near 170, which is what `_rtsLumStats` in the harness measures. Hue relationships are
     kept - grass is still a yellow-olive green, canopy still clearly darker than the ground
     it stands on, dirt still warm - but every value is lifted and each ramp now carries a
     genuine highlight tone at the top rather than five shades of the same dark.

     The exact HUES here are still provisional: they are chosen to sit in the right family
     and the right value range, not measured against the original. Reference frames would
     replace these numbers wholesale and the structure would not have to change. */
  grass: ['#5c6b39', '#68784a', '#4e5c2e', '#748459', '#434f26'],
  dirt:  ['#8a7748', '#9c8a5c', '#786538', '#ad9c72'],
  rock:  ['#7b7360', '#8d8571', '#5f594a', '#a09884'],
  bush:  ['#48562c', '#3a4622', '#5a6b38'],
  /* Canopy stays clearly darker than the grass - an earlier set sat within a few points of
     the ground colour and the whole forest disappeared into texture. But "darker" was being
     read as "nearly black": at luminance 34 against grass at 56, a fifth of the map was a
     hole in the picture. It is now about 25% below the ground it stands on rather than 40%,
     and the tip tone is bright enough to describe a canopy edge. */
  tree:  ['#3a5228', '#48633a', '#2b3d1c', '#6b9455', '#5a4228'],   /* canopy tones + trunk */
  water: ['#2b4c6b', '#356088', '#20384f', '#4a7ba6', '#6fa3c9'],
  sand:  ['#b0a074', '#c2b287', '#9a8b63'],
  road:  ['#7a6e56', '#8a7e66', '#665c48'],
  bag:   ['#a89663', '#bcaa78', '#7d6e47'],
  ore:   ['#b08420', '#d4a934', '#eecb62', '#7d5c12', '#8f6a17'],
  /* GemValue 110 vs GoldValue 35: gems are the high-value deposit, and they have to read as
     a different mineral at a glance or the player will never cross the map for one. */
  gem:   ['#6a4bb0', '#8f6ee0', '#c4b0ff', '#3d2a70', '#4a3585'],
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
function _sprOre(P) {
  var out = [], TS = RTS_TS;
  P = P || RTS_PAL.ore;
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
    /* Construction Yard. Concrete apron, a fortified hall with a taller command core behind
       it, two low annexes flanking a drive-in vehicle bay, and a gantry crane straddling the
       whole roof. The crane is doing the identification work: it is the only thing in the
       base that spans a full 3x3 footprint above the roof line, so the yard is findable at
       any zoom and from behind other buildings. Everything else is arranged for the two
       surfaces this camera actually shows - the roof (plant, ducting, railings, masts) and
       the front elevation (bay mouth, canopy, annexe fronts, apron clutter). The side walls
       are edge-on and get nothing. Team colour is confined to the bay fascia, the roof
       coping band, the jib stripe, the personnel door and the flag, which is enough to read
       ownership without turning the building into a flag. */
    var yq;
    /* --- local kit. These repeat too often to spell out, and railings/ladders are mostly
       what stops steelwork reading as solid blocks. ------------------------------------- */
    var yRailX = function (x0, x1, z, y, h, n) {                    /* railing run along x */
      var q;
      for (q = 0; q < n; q++) _r3Box(m, x0 + (x1 - x0) * q / (n - 1), y, z, 1.0, h, 1.0, S[2], S[3]);
      _r3Box(m, (x0 + x1) / 2, y + h - 0.9, z, x1 - x0 + 1.2, 0.9, 1.0, S[1], S[3]);
    };
    var yRailZ = function (x, z0, z1, y, h, n) {                    /* railing run along z */
      var q;
      for (q = 0; q < n; q++) _r3Box(m, x, y, z0 + (z1 - z0) * q / (n - 1), 1.0, h, 1.0, S[2], S[3]);
      _r3Box(m, x, y + h - 0.9, (z0 + z1) / 2, 1.0, 0.9, z1 - z0 + 1.2, S[1], S[3]);
    };
    var yLadder = function (x, y, z, h, n) {                        /* two rails plus rungs */
      var q;
      _r3Box(m, x - 1.7, y, z, 1.0, h, 1.3, S[1], S[3]);
      _r3Box(m, x + 1.7, y, z, 1.0, h, 1.3, S[1], S[3]);
      for (q = 0; q < n; q++)
        _r3Box(m, x, y + 2.2 + q * (h - 4) / (n - 1), z - 0.3, 3.6, 0.8, 0.8, S[3], S[3]);
    };
    var yAhu = function (x, y, z, w, d, h) {                        /* air handler + fan cowl */
      var q;
      _r3Box(m, x, y, z, w, h, d, DK[1], DK[3]);
      _r3Box(m, x, y + h, z, w - 2, 0.9, d - 2, S[2], S[1]);
      _r3Cyl(m, x, y + h + 0.9, z, d * 0.27, 1.8, S[0], DK[2], 16);
      _r3Cyl(m, x, y + h + 2.7, z, d * 0.33, 0.8, S[3], S[1], 16);
      for (q = 0; q < 3; q++)
        _r3Box(m, x, y + 1.4 + q * 1.7, z + d / 2 + 0.4, w - 3, 1.0, 0.9, DK[3], DK[3]);
    };
    var yStack = function (x, y, z, r, h) {                         /* vent stack, rain cap */
      _r3Cyl(m, x, y, z, r, h, S[0], S[3], 16);
      _r3Cyl(m, x, y + h, z, r + 1.0, 1.0, S[3], S[1], 16);
    };
    var yDrum = function (x, y, z, r, h, c0, c1) {                  /* barrel / cable drum */
      _r3Cyl(m, x, y, z, r, h, c0, c1, 16);
      _r3Cyl(m, x, y + h * 0.28, z, r + 0.4, 0.9, c1, c1, 16);
      _r3Cyl(m, x, y + h * 0.66, z, r + 0.4, 0.9, c1, c1, 16);
    };
    var yCrate = function (x, y, z, w, h, d) {
      _r3Box(m, x, y, z, w, h, d, RTS_PAL.bag[0], RTS_PAL.bag[1]);
      _r3Box(m, x, y + h * 0.30, z + d / 2 + 0.3, w - 0.8, 1.0, 0.6, RTS_PAL.bag[2], RTS_PAL.bag[2]);
      _r3Box(m, x, y + h * 0.72, z + d / 2 + 0.3, w - 0.8, 1.0, 0.6, RTS_PAL.bag[2], RTS_PAL.bag[2]);
    };
    var yHaz = function (x, y, z, w, h, d, n) {                     /* alternating warning bars */
      var q, yc;
      for (q = 0; q < n; q++) {
        yc = q % 2 ? RTS_PAL.hazard[1] : RTS_PAL.hazard[0];
        _r3Box(m, x + (q - (n - 1) / 2) * (w / n), y, z, w / n * 0.62, h, d, yc, yc);
      }
    };

    /* --- apron. A works stands on poured concrete, not grass, and the worn lane is what
       tells the eye where vehicles come out. Everything here stays inside the apron slab
       (+/-35.5) so nothing hangs over the tile edge. ------------------------------------ */
    _r3Box(m, 0, 0, 0, W - 1, 1.2, D - 1, C[2], C[0]);
    _r3Box(m, 2, 1.2, 25.5, 28, 0.4, 20, C[1], C[1]);               /* drive lane */
    _r3Box(m, -5, 1.6, 25.5, 4, 0.25, 20, C[2], C[2]);              /* tyre tracks */
    _r3Box(m, 9, 1.6, 25.5, 4, 0.25, 20, C[2], C[2]);
    _r3Box(m, 2, 1.2, 17, 30, 0.5, 5, C[3], C[1]);                  /* poured sill at the mouth */
    _r3Box(m, -12.6, 1.2, 25.5, 1.6, 0.9, 19, C[3], C[3]);          /* lane kerbs */
    _r3Box(m, 16.6, 1.2, 25.5, 1.6, 0.9, 19, C[3], C[3]);
    _r3Box(m, 2, 1.4, 22, 30, 0.5, 2.6, DK[0], DK[1]);              /* drain channel */
    for (yq = 0; yq < 5; yq++)                                      /* its grate bars */
      _r3Box(m, -10 + yq * 6, 1.5, 22, 2.6, 0.5, 2.8, S[2], S[1]);
    /* Stop line in plain painted bars. Alternating yellow/black on a FLOOR reads as holes
       punched in the concrete - the dark half of a hazard pattern only works upright. */
    for (yq = 0; yq < 5; yq++)
      _r3Box(m, -9 + yq * 5.5, 1.6, 33.5, 3.4, 0.6, 4, RTS_PAL.hazard[0], RTS_PAL.hazard[0]);

    /* --- massing. Three heights - annexes, hall, command core - so the silhouette steps
       instead of presenting one slab edge. --------------------------------------------- */
    _r3Box(m, 0, 1.2, -1, 66, 3, 32, C[2], C[0]);                   /* hall plinth */
    _r3Slab(m, 0, 1.2, -1, 64, 24, 30, 3, B.wall, B.roof);          /* the hall */
    _r3Box(m, -3, 1.2, -25, 52, 3, 21, C[2], C[0]);                 /* core plinth */
    _r3Slab(m, -3, 1.2, -25, 50, 33, 20, 4, B.wall, B.roof);        /* command core */
    _r3Slab(m, -24, 1.2, 20, 22, 13, 13, 2.5, B.wall, B.roof);      /* stores annexe */
    _r3Slab(m, 26, 1.2, 19, 18, 16, 12, 3, B.wall, B.roof);         /* dispatch annexe */

    /* --- the bay. The drive-in mouth is the single strongest cue for what this is, so it
       gets a real reveal, a shutter, guide rails and a canopy over it. ------------------ */
    _r3Box(m, 2, 1.2, 11.5, 24, 18.5, 6, DK[2], DK[2]);             /* recess */
    _r3Box(m, 2, 1.2, 12.5, 23, 1.0, 4, DK[0], DK[1]);              /* bay floor */
    for (yq = 0; yq < 7; yq++)                                      /* shutter slats */
      _r3Box(m, 2, 3.4 + yq * 2.2, 14.4, 23, 1.7, 1.4, yq % 2 ? S[2] : S[1], S[3]);
    _r3Box(m, -11.5, 1.2, 14.6, 3, 19.5, 3, S[0], S[3]);            /* shutter guides */
    _r3Box(m, 15.5, 1.2, 14.6, 3, 19.5, 3, S[0], S[3]);
    /* The canopy is deep, and under this projection a deep canopy buries anything behind and
       below it - a lintel beam over the mouth was invisible. So the head detail is stacked on
       the canopy's own FRONT lip instead, where it steps down the screen clear of the roof. */
    _r3Box(m, 2, 21.6, 19.5, 34, 1.8, 8, S[1], S[3]);               /* canopy */
    for (yq = 0; yq < 3; yq++)                                      /* its standing seams */
      _r3Box(m, -10 + yq * 12, 23.4, 19.5, 2.0, 0.7, 8, S[2], S[0]);
    _r3Box(m, 2, 19.4, 23.3, 32, 2.2, 1.8, TM[0], TM[1]);           /* team fascia on its lip */
    yHaz(2, 17.8, 23.5, 30, 1.6, 1.6, 7);                           /* hazard band under that */
    _r3Box(m, -14, 14.2, 21, 2.2, 7.4, 2.2, S[2], S[3]);            /* canopy legs, off the annexes */
    _r3Box(m, 18, 17.2, 21, 2.2, 4.4, 2.2, S[2], S[3]);
    for (yq = 0; yq < 3; yq++)                                      /* bay floodlights */
      _r3Cyl(m, -8 + yq * 10, 16.0, 23.9, 1.5, 1.7, RTS_PAL.lit, RTS_PAL.lit, 16);
    /* hall wall showing above the annexe roofs */
    pilasters(15, 14.2, -23, 4, 6, 3.0, 8);
    winRow(15, 16.5, -23, 3, 6, 2.8, 3.5);
    pilasters(15, 17.2, 25, 3, 6, 3.0, 5);
    winRow(15, 18.4, 25, 2, 6, 2.6, 2.8);

    /* --- stores annexe front ---------------------------------------------------------- */
    _r3Box(m, -24, 1.2, 26.9, 22, 1.6, 1.4, C[2], C[0]);            /* base course */
    _r3Box(m, -28, 1.2, 27.4, 9, 9.5, 2.0, TM[1], TM[0]);           /* personnel door */
    _r3Box(m, -33.4, 1.2, 27.2, 1.8, 11, 1.8, B.trim, B.trim);      /* its surround */
    _r3Box(m, -22.6, 1.2, 27.2, 1.8, 11, 1.8, B.trim, B.trim);
    _r3Box(m, -28, 10.7, 27.2, 13, 1.8, 1.8, B.trim, B.trim);
    _r3Box(m, -28, 1.2, 29.6, 12, 1.1, 3.6, C[1], C[3]);            /* step */
    _r3Box(m, -17.5, 1.2, 27.2, 9, 7.5, 2.0, DK[1], DK[3]);         /* stores hatch */
    for (yq = 0; yq < 3; yq++)
      _r3Box(m, -17.5, 2.4 + yq * 2.1, 28.3, 8.4, 1.4, 0.8, S[2], S[3]);
    yHaz(-17.5, 8.9, 27.6, 9, 1.2, 1.8, 3);
    winRow(27.6, 11.2, -17.5, 2, 5, 3.4, 2.4);
    yLadder(-13.6, 1.2, 27.6, 15, 5);                               /* roof access */
    _r3Cyl(m, -34.2, 1.2, 27.8, 1.5, 13.5, S[0], S[1], 16);         /* riser up the wall */
    _r3Cyl(m, -34.2, 14.7, 27.8, 1.6, 1.8, S[2], S[3], 16);         /* elbow shoulder */
    _r3Box(m, -34.2, 15.0, 24.5, 3, 2.6, 7.4, S[0], S[3]);          /* and onto the roof */

    /* --- stores annexe roof ----------------------------------------------------------- */
    _r3Box(m, -24, 10.9, 27.0, 22, 1.4, 1.4, B.trim, B.trim);       /* head course, ties into the door head */
    _r3Box(m, -24, 14.2, 20, 17, 0.6, 8, C[2], C[0]);
    yRailX(-31.5, -16.5, 24, 14.8, 3.4, 6);
    yAhu(-27, 14.8, 20, 9, 7, 4.5);
    yStack(-19, 14.8, 17.5, 1.8, 5);
    yStack(-19, 14.8, 22, 1.8, 4);
    _r3Box(m, -24, 14.8, 16.5, 15, 1.2, 1.6, S[2], S[3]);           /* cable tray */
    _r3Box(m, -16.5, 14.8, 21.5, 4, 1.4, 4, DK[1], DK[3]);          /* hatch, lid propped */
    _r3Box(m, -16.5, 16.2, 23, 4.2, 0.6, 2.4, S[1], S[3]);

    /* --- dispatch annexe -------------------------------------------------------------- */
    _r3Box(m, 26, 1.2, 25.4, 18, 1.6, 1.4, C[2], C[0]);             /* base course */
    winRow(26, 10.0, 26.5, 3, 5.5, 3.6, 3.2);                       /* control room band */
    pilasters(26, 1.2, 29.25, 2, 5.5, 3.2, 8);
    _r3Box(m, 20, 1.2, 26.0, 6, 8.5, 2.0, DK[1], DK[3]);            /* side door */
    _r3Box(m, 20, 9.7, 26.2, 8, 1.4, 2.4, B.trim, B.trim);
    _r3Box(m, 20.5, 11.6, 27.6, 8, 1.2, 5.2, S[1], S[3]);           /* door canopy */
    _r3Box(m, 17.0, 11.0, 28.0, 1.4, 1.0, 4.0, S[2], S[3]);
    _r3Box(m, 24.0, 11.0, 28.0, 1.4, 1.0, 4.0, S[2], S[3]);
    for (yq = 0; yq < 4; yq++)                                      /* striped corner post */
      _r3Box(m, 34, 1.2 + yq * 1.6, 26.0, 3.2, 1.3, 3.2,
             yq % 2 ? RTS_PAL.hazard[1] : RTS_PAL.hazard[0], yq % 2 ? RTS_PAL.hazard[1] : RTS_PAL.hazard[0]);
    yLadder(33, 7.6, 26.2, 11.6, 6);                                /* roof access, starts above the post */
    _r3Box(m, 26, 15.8, 25.5, 18, 1.4, 1.4, B.trim, B.trim);        /* eaves fascia */
    _r3Box(m, 26, 17.2, 19, 13, 0.6, 7, C[2], C[0]);                /* roof deck */
    yRailX(20.5, 31.5, 22, 17.8, 3.2, 5);
    yRailZ(32, 16.5, 21.5, 17.8, 3.2, 3);
    for (yq = 0; yq < 4; yq++)                                      /* water tank legs */
      _r3Box(m, 22.5 + (yq % 2) * 7, 17.8, 16.5 + ((yq / 2) | 0) * 5, 1.6, 5, 1.6, S[2], S[3]);
    _r3Cyl(m, 26, 22.8, 19, 5.2, 7, S[0], S[1], 18);                /* water tank */
    _r3Cyl(m, 26, 24.5, 19, 5.6, 0.9, S[2], S[3], 18);              /* hoop ribs */
    _r3Cyl(m, 26, 27.4, 19, 5.6, 0.9, S[2], S[3], 18);
    _r3Cone(m, 26, 29.8, 19, 5.2, 1.4, 2.4, C[1], 18);              /* domed cap */
    _r3Cyl(m, 26, 32.2, 19, 1.1, 2.2, DK[1], DK[3], 16);
    _r3Box(m, 30.5, 17.8, 21.5, 1.4, 5.4, 1.4, S[1], S[3]);         /* downpipe */
    _r3Cyl(m, 21, 17.8, 21.5, 0.9, 14, S[1], S[3], 16);             /* whip aerial */
    _r3Box(m, 21, 27, 21.5, 5, 0.8, 0.8, S[2], S[3]);
    _r3Box(m, 21, 29, 21.5, 3.6, 0.8, 0.8, S[2], S[3]);
    _r3Cyl(m, 21, 31.8, 21.5, 1.0, 1.3, RTS_PAL.hazard[0], RTS_PAL.lit, 16);

    /* --- hall roof. Under this camera the roof is the biggest surface on the building, so
       most of the plant lives here. Everything is kept clear of the four crane legs. ---- */
    _r3Box(m, 0, 25.2, -1, 58, 0.7, 24, C[2], C[0]);                /* deck */
    _r3Box(m, 0, 25.2, 10.2, 58, 1.8, 2.0, C[3], C[1]);             /* coping */
    _r3Box(m, 0, 25.9, 10.9, 52, 1.2, 1.2, TM[0], TM[1]);           /* team band on it */
    yRailX(-22, 22, 9.8, 25.9, 3.4, 9);
    yRailZ(-28.5, -6, 4, 25.9, 3.4, 4);
    yRailZ(28.5, -6, 4, 25.9, 3.4, 4);
    yAhu(-16, 25.9, 1, 11, 8, 5.5);
    yAhu(-2, 25.9, 1, 11, 8, 5.5);
    _r3Cyl(m, -20, 25.9, -8, 3.8, 4.5, S[0], S[3], 18);             /* extractor drums */
    _r3Cyl(m, -20, 30.4, -8, 4.4, 1.1, S[2], S[1], 18);
    _r3Cone(m, -20, 31.5, -8, 4.2, 1.6, 2.2, DK[1], 18);
    _r3Cyl(m, -11, 25.9, -8, 3.8, 4.5, S[0], S[3], 18);
    _r3Cyl(m, -11, 30.4, -8, 4.4, 1.1, S[2], S[1], 18);
    _r3Cone(m, -11, 31.5, -8, 4.2, 1.6, 2.2, DK[1], 18);
    yStack(0, 25.9, -8, 2.2, 8);
    yStack(5.5, 25.9, -8, 2.0, 6);
    _r3Box(m, -2, 25.9, 7.5, 38, 3, 3.6, S[1], S[0]);               /* duct run */
    _r3Box(m, -21.5, 25.9, 7.5, 4.2, 4.6, 4.2, S[0], S[3]);         /* its elbows */
    _r3Box(m, 17.5, 25.9, 7.5, 4.2, 4.6, 4.2, S[0], S[3]);
    for (yq = 0; yq < 3; yq++)                                      /* duct saddles */
      _r3Box(m, -16 + yq * 14, 25.9, 5.4, 3, 1.6, 1.8, DK[1], DK[3]);
    for (yq = 0; yq < 3; yq++)                                      /* manifold risers */
      _r3Cyl(m, 17 + yq * 4.5, 25.9, 0, 1.5, 7 - yq, S[0], S[1], 16);
    _r3Box(m, 21.5, 31.5, 0, 14, 2, 2.6, S[2], S[3]);               /* header */
    _r3Cyl(m, 18, 33.5, 0, 1.4, 1.6, RTS_PAL.hazard[0], DK[1], 16); /* valve wheels */
    _r3Cyl(m, 24, 33.5, 0, 1.4, 1.6, RTS_PAL.hazard[0], DK[1], 16);
    for (yq = 0; yq < 2; yq++) {                                    /* skylights */
      _r3Box(m, -22 + yq * 9, 25.9, -11, 7, 1.0, 5, C[3], C[1]);
      _r3Box(m, -22 + yq * 9, 26.9, -11, 5.6, 1.2, 3.8, RTS_PAL.glass, RTS_PAL.glass);
    }
    _r3Box(m, 20, 25.9, 8, 5, 1.8, 5, DK[1], DK[3]);                /* roof hatch */
    _r3Box(m, 0, 25.9, -4.5, 54, 1.0, 4.5, S[2], S[1]);             /* catwalk plate */
    /* Sandbagged position tucked into the west bay of the deck - clear of the air handlers
       and inboard of the deck edge, so it sits ON the roof rather than off the lip. */
    for (yq = 0; yq < 5; yq++)
      _r3Cyl(m, -27 + (yq % 2) * 3.0, 25.9, 0.4 + ((yq / 2) | 0) * 3.2, 2.2, 2.4,
             RTS_PAL.bag[0], RTS_PAL.bag[1], 16);
    _r3Cyl(m, -24, 28.3, 0.4, 1.3, 2.4, S[2], S[3], 16);            /* its searchlight */
    _r3Cyl(m, -24, 30.7, 0.4, 2.3, 2.6, DK[1], RTS_PAL.lit, 16);
    _r3Box(m, 18, 25.9, -10, 9, 5, 7, B.wall, B.roof);              /* plant house */
    _r3Gable(m, 18, 30.9, -10, 10, 4, 8, B.roof);
    _r3Box(m, 18, 27.5, -6.3, 5.5, 2.4, 1.4, RTS_PAL.glass, RTS_PAL.glass);
    for (yq = 0; yq < 3; yq++)                                      /* obstruction lights */
      _r3Cyl(m, -20 + yq * 20, 27.0, 10.4, 1.2, 1.6, RTS_PAL.hazard[0], RTS_PAL.lit, 16);

    /* --- command core ----------------------------------------------------------------- */
    pilasters(-14, 25.6, -3, 4, 11, 3.6, 3.6);
    winRow(-14, 26.4, -3, 3, 11, 4.5, 2.2);
    _r3Box(m, -3, 29.0, -14.2, 46, 1.5, 2.2, TM[0], TM[1]);         /* team band */
    _r3Box(m, -3, 34.2, -25, 42, 0.7, 12, C[2], C[0]);              /* core deck */
    _r3Box(m, -3, 34.2, -19.6, 42, 1.6, 1.8, C[3], C[1]);           /* coping */
    yRailX(-22, 16, -19.0, 35.8, 3.0, 7);
    _r3Slab(m, -8, 34.9, -26, 20, 8, 11, 2.5, B.wall, B.roof);      /* penthouse */
    _r3Box(m, -8, 39.5, -20.3, 17, 2.6, 1.8, TM[0], TM[1]);
    winRow(-19.8, 36.4, -8, 3, 6, 3.6, 2.6);
    _r3Box(m, -8, 42.9, -26, 21.2, 0.6, 5.6, C[2], C[0]);
    _r3Box(m, -2, 43.5, -26, 5.5, 1.8, 5, DK[1], DK[3]);            /* its plant box */
    _r3Cyl(m, -2, 45.3, -26, 1.7, 1.2, S[2], S[1], 16);
    yStack(-9.5, 42.9, -26, 1.6, 5);                                /* penthouse vent */
    _r3Cyl(m, -15, 43.5, -26, 1.1, 7, S[1], S[3], 16);              /* penthouse mast */
    _r3Box(m, -15, 48.2, -26, 5, 0.8, 0.8, S[2], S[3]);
    _r3Cyl(m, -15, 50.5, -26, 1.0, 1.3, RTS_PAL.hazard[0], RTS_PAL.lit, 16);
    for (yq = 0; yq < 2; yq++) {                                    /* radio masts, clear of the penthouse */
      var yMx = -22 + yq * 38;
      _r3Box(m, yMx, 34.9, -24, 5, 2.2, 6, C[3], C[1]);
      _r3Cyl(m, yMx, 37.1, -24, 1.5, 17, S[0], S[1], 16);
      _r3Cyl(m, yMx, 42, -24, 2.2, 1.1, S[2], S[3], 16);
      _r3Cyl(m, yMx, 47.5, -24, 2.2, 1.1, S[2], S[3], 16);
      _r3Box(m, yMx, 50, -24, 9, 0.9, 0.9, S[2], S[3]);
      _r3Box(m, yMx, 52.2, -24, 6, 0.9, 0.9, S[2], S[3]);
      _r3Cyl(m, yMx, 54.1, -24, 1.1, 1.5, RTS_PAL.hazard[0], RTS_PAL.lit, 16);
    }
    _r3Cyl(m, 8, 34.9, -28, 2.6, 3, S[2], S[1], 16);                /* dish pedestal */
    _r3Cone(m, 8, 37.9, -28, 3.0, 6.0, 4.2, C[0], 20);              /* comms dish */
    _r3Cyl(m, 8, 42.4, -28, 0.9, 3.4, S[1], S[3], 16);
    _r3Box(m, 8, 45.8, -28, 2.2, 1.4, 2.2, DK[1], DK[3]);
    _r3Cyl(m, -23, 34.9, -29, 0.8, 15, S[1], S[3], 16);             /* flagstaff */
    _r3Box(m, -19.5, 45.4, -29, 7, 4.4, 0.8, TM[0], TM[1]);
    _r3Cyl(m, -23, 49.9, -29, 1.0, 1.0, C[3], C[1], 16);

    /* --- gantry crane. Four legs off the hall roof, a trussed bridge across the full
       width, a trolley and a hook block hung where the eye lands. ---------------------- */
    for (yq = 0; yq < 4; yq++) {
      var yLx = (yq % 2) ? 26 : -26, yLz = (yq < 2) ? -10 : 8;
      _r3Box(m, yLx, 25.9, yLz, 5.4, 2.0, 5.4, S[2], S[3]);         /* leg foot */
      _r3Box(m, yLx, 27.9, yLz, 3.8, 16.5, 3.8, S[0], S[1]);        /* leg */
      _r3Box(m, yLx, 42.6, yLz, 4.6, 1.4, 4.6, S[2], S[3]);         /* collar */
    }
    for (yq = 0; yq < 6; yq++)                                      /* tower ties */
      _r3Box(m, yq < 3 ? -26 : 26, 30.5 + (yq % 3) * 5.5, -1, 3.0, 1.8, 18, S[1], S[3]);
    for (yq = 0; yq < 6; yq++)                                      /* staggered bracing */
      _r3Box(m, (yq % 2) ? 26 : -26, 33 + ((yq / 2) | 0) * 5.5, (((yq / 2) | 0) % 2) ? -5 : 3,
             2.4, 2.6, 5, S[2], S[3]);
    _r3Box(m, 0, 44.4, -1, 68, 2.4, 6, S[1], S[3]);                 /* bottom chord */
    _r3Box(m, 0, 50.0, -1, 68, 2.4, 6, S[1], S[3]);                 /* top chord */
    for (yq = 0; yq < 8; yq++)                                      /* web posts, front */
      _r3Box(m, -28 + yq * 8, 46.8, 1.6, 2.2, 3.2, 3.2, S[2], S[3]);
    for (yq = 0; yq < 3; yq++)                                      /* web posts, rear */
      _r3Box(m, -22 + yq * 22, 46.8, -3.6, 2.2, 3.2, 3.2, S[3], S[3]);
    _r3Box(m, 0, 46.6, 2.4, 62, 1.6, 1.6, TM[0], TM[1]);            /* team stripe on the jib */
    _r3Box(m, -34, 44.4, -1, 3, 8, 7, S[0], S[3]);                  /* end frames */
    _r3Box(m, 34, 44.4, -1, 3, 8, 7, S[0], S[3]);
    _r3Box(m, 0, 52.4, 2.6, 68, 0.9, 5, S[2], S[1]);                /* maintenance walkway */
    yRailX(-30, 30, 4.8, 53.3, 3.0, 9);
    for (yq = 0; yq < 3; yq++)
      _r3Cyl(m, -20 + yq * 20, 56.3, 4.8, 1.2, 1.6, RTS_PAL.hazard[0], RTS_PAL.lit, 16);
    _r3Box(m, -14, 37.5, -1, 12, 6.9, 8, S[0], S[1]);               /* winch house, slung under */
    _r3Box(m, -14, 39.5, 3.2, 8, 2.6, 1.4, RTS_PAL.glass, RTS_PAL.glass);
    _r3Box(m, -20.5, 39.0, -1, 1.6, 4.0, 6, DK[1], DK[3]);          /* its louvre end */
    _r3Box(m, 12, 40.6, -1, 14, 3.8, 9, S[0], S[1]);                /* trolley */
    for (yq = 0; yq < 4; yq++)                                      /* trolley wheels */
      _r3Cyl(m, 7 + (yq % 2) * 10, 43.6, -4.2 + ((yq / 2) | 0) * 6.4, 1.5, 1.3, S[2], S[3], 16);
    _r3Cyl(m, 12, 38.4, -1, 2.6, 2.2, DK[1], S[1], 16);             /* hoist drum */
    _r3Box(m, 9.0, 35.0, -1, 1.1, 3.4, 1.1, DK[2], DK[2]);          /* falls */
    _r3Box(m, 15.0, 35.0, -1, 1.1, 3.4, 1.1, DK[2], DK[2]);
    _r3Box(m, 12, 32.0, -1, 8, 3.0, 6, S[0], S[1]);                 /* hook block */
    _r3Box(m, 12, 30.6, -1, 4.4, 1.5, 4.4, S[2], S[3]);
    _r3Cyl(m, 12, 28.2, -1, 1.5, 2.6, DK[1], DK[3], 16);            /* the hook */

    /* --- apron clutter. A yard that is not surrounded by its own stores reads as a
       finished office block, and this is the building the player stares at. ------------ */
    _r3Box(m, -29, 1.2, 33.5, 13, 5, 4.5, DK[1], DK[3]);            /* generator housing */
    _r3Box(m, -29, 6.2, 33.5, 11, 1.0, 3.4, S[2], S[1]);
    for (yq = 0; yq < 3; yq++)                                      /* its louvres */
      _r3Box(m, -32.5 + yq * 3.4, 6.2, 35.4, 2.0, 1.5, 1.0, DK[3], DK[3]);
    _r3Cyl(m, -22.5, 1.2, 33.5, 1.4, 9, S[0], S[3], 16);            /* generator exhaust */
    _r3Cyl(m, -22.5, 10.2, 33.5, 2.0, 1.0, S[2], S[3], 16);
    _r3Box(m, -18, 1.2, 32, 8, 4.5, 6, S[2], S[1]);                 /* transformer */
    for (yq = 0; yq < 3; yq++)
      _r3Cyl(m, -20 + yq * 2.6, 5.7, 32, 1.0, 3.2, C[1], C[3], 16); /* bushings */
    _r3Box(m, -18, 1.2, 34.8, 9, 5.5, 1.2, DK[1], DK[3]);           /* cooling fins */
    yDrum(20, 1.2, 28, 3.0, 6, S[0], S[3]);                         /* cable drums */
    yDrum(26.5, 1.2, 28, 3.0, 6, RTS_PAL.hazard[0], DK[1]);
    yCrate(32.5, 1.2, 28, 6, 4, 5);
    yCrate(22, 1.2, 32.8, 8, 4.5, 4);
    yCrate(30.5, 1.2, 32.8, 7, 4, 4);
    for (yq = 0; yq < 4; yq++) {                                    /* lane bollards */
      var yBx = (yq % 2) ? 15.5 : -11.5, yBz = 20 + ((yq / 2) | 0) * 12;
      _r3Cyl(m, yBx, 1.2, yBz, 1.5, 5.5, RTS_PAL.hazard[0], DK[1], 16);
      _r3Cyl(m, yBx, 6.7, yBz, 1.8, 0.9, DK[1], DK[3], 16);
    }
  } else if (key === 'power') {
    /* Power Plant: a boiler house at the back carrying two fat stacks, a flat-decked turbine
       hall in front of it, a hip-roofed switchgear annexe on the right, and an open
       switchyard filling the forecourt.
       Four masses at four heights, deliberately. screenY is z - 1.3y, so the only way a 2x2
       footprint gets more than one roof onto the screen is to stagger them - stack tops,
       boiler parapet, hall deck, annexe ridge, facade, yard - each landing in its own
       horizontal strip. The same arithmetic decides the yard: anything tall standing CLOSE
       to the building projects straight up over the facade and erases it, so the
       transformers and the busbar gantry are held under about 17 units and pushed to the
       front edge of the tile, and the hall is tall enough that its window band and cornice
       clear them.
       The hall roof is flat rather than gabled because it is the largest surface this camera
       ever sees, and a deck of extract fans, ducting and railings says "generating station"
       far louder than a ridge does. But the boiler roof beside it is kept almost EMPTY: two
       stacks with nothing to compete with are the read at map zoom, and an earlier pass that
       put a hoist and vent gear up there turned them into two more grey drums among many.
       The electrical plant is out in the open where nothing occludes it - two transformers
       with radiator fins and porcelain bushings under a busbar gantry - because a bushing
       stack is a silhouette nothing else in the base owns.
       Team colour on the boiler parapet and the facade cornice, faced TM[1] over TM[3]: the
       dark end of the ramp sits too close to the faction wall colour to separate at this
       size. Roof brown is spent on the annexe hip and the deck parapet so the sprite does
       not drift to all-steel - grey plant on grey walls is how this read before. */
    var pwHz = RTS_PAL.hazard, pwGl = RTS_PAL.glass, pwLt = RTS_PAL.lit;
    var pw0, pwX;

    /* A deck edge is the highest-contrast line this camera has; unrailed it reads as the top
       of a crate. Every walkable roof here gets uprights plus a top rail. */
    var pwRailX = function (x0, x1, y, z, n, col) {
      var k;
      for (k = 0; k < n; k++) _r3Box(m, x0 + (x1 - x0) * k / (n - 1), y, z, 1.5, 3, 1.5, col, col);
      _r3Box(m, (x0 + x1) / 2, y + 3, z, x1 - x0 + 1.5, 1, 1.7, col, col);
    };
    var pwRailZ = function (z0, z1, y, x, n, col) {
      var k;
      for (k = 0; k < n; k++) _r3Box(m, x, y, z0 + (z1 - z0) * k / (n - 1), 1.5, 3, 1.5, col, col);
      _r3Box(m, x, y + 3, (z0 + z1) / 2, 1.7, 1, z1 - z0 + 1.5, col, col);
    };
    /* Extract fan - kerb, shroud with a dark throat, weather cap overhanging it so the ring
       of shadow underneath still separates the two at sprite size. Called at three radii and
       two tones: a deck of identical drums reads as pattern, not as plant. */
    var pwFan = function (x, z, y, r, h, col) {
      _r3Box(m, x, y, z, r * 2.3, 1.5, r * 2.3, DK[1], DK[3]);
      _r3Cyl(m, x, y + 1.5, z, r, h, col, DK[0], 18);
      _r3Cyl(m, x, y + 1.5 + h, z, r * 1.3, 1, S[3], S[0], 18);
      _r3Box(m, x, y + 1.5, z + r * 0.85, 1.6, h * 0.8, 1.6, S[3], S[3]);
    };
    /* Porcelain bushing. Concrete tones against steel everywhere else, so the yard reads as
       switchgear rather than as a row of skips. */
    var pwBush = function (x, z, y, s) {
      _r3Cone(m, x, y, z, 2 * s, 1.5 * s, 3 * s, C[3], 16);
      _r3Cone(m, x, y + 3 * s, z, 1.6 * s, 1.1 * s, 2.4 * s, C[1], 16);
      _r3Cyl(m, x, y + 5.4 * s, z, s, 1.3 * s, S[3], DK[1], 16);
    };
    var pwLad = function (x, y, z, h, n) {
      var k;
      _r3Box(m, x - 1.6, y, z, 1.2, h, 1.2, S[3], S[3]);
      _r3Box(m, x + 1.6, y, z, 1.2, h, 1.2, S[3], S[3]);
      for (k = 0; k < n; k++) _r3Box(m, x, y + 2 + k * (h - 3.5) / (n - 1), z, 3.4, 0.8, 0.9, S[2], S[3]);
    };
    var pwVent = function (x, z, y, r, h) {
      _r3Cyl(m, x, y, z, r, h, S[0], DK[0], 16);
      _r3Cyl(m, x, y + h, z, r * 1.6, 0.9, S[3], S[1], 16);
    };

    /* ---- site and the four masses ---------------------------------------------- */
    _r3Box(m, 0, 0, 0, W - 2, 1.5, D - 2, C[2], C[0]);              /* site slab */
    _r3Box(m, -13, 1.5, 15, 18, 0.4, 14, C[0], C[1]);               /* patched pours, so the */
    _r3Box(m, 10, 1.5, 19, 24, 0.4, 8, C[1], C[3]);                 /* apron is not one tone */
    _r3Box(m, 16, 1.5, -2, 13, 0.4, 12, C[0], C[2]);
    _r3Slab(m, -7, 1.5, -17.5, 32, 21, 13, 3, B.wall, B.roof);      /* boiler house, top 22.5 */
    _r3Slab(m, -7, 1.5, 0, 32, 19, 22, 2.5, B.wall, B.roof);        /* turbine hall,  top 20.5 */
    _r3Slab(m, 16, 1.5, -15.5, 14, 11, 17, 2.5, B.wall, B.roof);    /* annexe, top 12.5 */
    _r3Hip(m, 16, 12.5, -15.5, 15, 6, 17, 4, B.roof);               /* its hip: the one big */
    _r3Slab(m, 16, 1.5, 2.5, 13, 8.5, 17, 2, B.wall, B.roof);       /* roof-brown mass, and */
                                                                    /* the only sloped one */

    /* ---- stacks. Nothing else is allowed on the boiler roof: two clean cylinders with air
       around them is the whole read at map zoom, and an earlier pass that put a hoist and
       vent gear up there turned them into two more grey drums among many. The throats are
       S[2] rather than the darkest grey - a true black disc on top of a 48px sprite reads as
       a hole punched in the roof rather than as a flue. ---------------------------- */
    _r3Slab(m, -15, 22.5, -17.5, 12, 2.5, 9, 1.5, C[2], C[0]);
    _r3Slab(m, 2, 22.5, -17.5, 10, 2.5, 8, 1.5, C[2], C[0]);
    _r3Cyl(m, -15, 25, -17.5, 4.8, 12.5, S[0], S[2], 20);
    _r3Cyl(m, 2, 25, -17.5, 4, 9, S[0], S[2], 20);
    for (pw0 = 0; pw0 < 2; pw0++) _r3Cyl(m, -15, 26.8 + pw0 * 3.4, -17.5, 5.2, 1.2, S[2], S[3], 20);
    _r3Cyl(m, 2, 27.2, -17.5, 4.4, 1.2, S[2], S[3], 20);
    _r3Cyl(m, -15, 34.4, -17.5, 5.2, 2, pwHz[0], pwHz[1], 20);      /* obstruction bands */
    _r3Cyl(m, 2, 31.2, -17.5, 4.4, 1.8, pwHz[0], pwHz[1], 20);
    _r3Cyl(m, -15, 36.4, -17.5, 5.4, 1.3, S[3], DK[1], 20);         /* rim over a lit throat */
    _r3Cyl(m, 2, 33, -17.5, 4.6, 1.3, S[3], DK[1], 20);
    _r3Box(m, -15, 30.4, -17.5, 11.5, 1, 11, S[2], S[1]);           /* one service platform */
    pwRailX(-19, -11, 31.4, -12.3, 4, S[3]);                        /* each, set low so the */
    _r3Box(m, 2, 29, -17.5, 9.5, 1, 9, S[2], S[1]);                 /* cylinders read clean */
    pwRailX(-1.5, 5.5, 30, -13, 4, S[3]);                           /* above them */
    pwLad(-15, 26, -12.1, 5, 3);
    pwLad(2, 26, -12.9, 4, 3);
    _r3Cyl(m, -19, 31.4, -12.3, 0.9, 1.7, pwLt, pwLt, 16);          /* platform lamps */
    _r3Cyl(m, 5.5, 30, -13, 0.9, 1.7, pwLt, pwLt, 16);
    _r3Box(m, -6.5, 22.5, -17.5, 6, 3, 6, S[1], S[3]);              /* cross-over flue, low */
    _r3Box(m, -6.5, 25.5, -17.5, 7, 1.2, 7, S[3], S[0]);            /* so it stays under them */

    /* ---- boiler parapet. The team band lives here: the one broad run with nothing but sky
       above it, so nothing on any roof can eat it. -------------------------------- */
    _r3Box(m, -7, 22.5, -14.4, 30, 2.1, 2.4, TM[1], TM[3]);
    pwRailZ(-20.5, -15.5, 22.5, -19.6, 3, S[3]);

    /* ---- turbine hall deck, y = 20.5 ------------------------------------------- */
    _r3Box(m, -7, 20.5, -6.5, 24, 3.2, 2.8, S[1], S[3]);            /* boiler feed duct, */
    for (pw0 = 0; pw0 < 3; pw0++)                                   /* elbowing up into the */
      _r3Box(m, -15 + pw0 * 8, 23.7, -7.6, 3, 2.4, 2.6, S[2], S[3]);  /* boiler house wall */
    _r3Box(m, -11, 22.4, -6.5, 1.6, 1.6, 3.4, S[3], S[3]);
    _r3Box(m, 3, 22.4, -6.5, 1.6, 1.6, 3.4, S[3], S[3]);
    pwFan(-16.6, -1.6, 20.5, 3, 4, S[1]);
    pwFan(-9.2, -1.6, 20.5, 2.4, 3, DK[3]);
    pwFan(-2.2, -1.6, 20.5, 2.8, 4.4, S[1]);
    pwVent(4.4, -1.6, 20.5, 1.7, 4.6);
    for (pw0 = 0; pw0 < 2; pw0++) {                                 /* air handlers */
      pwX = -16 + pw0 * 9.5;
      _r3Box(m, pwX, 20.5, 4.2, 8.5, 4.5, 4.6, pw0 ? S[2] : DK[0], pw0 ? S[0] : DK[1]);
      _r3Box(m, pwX, 25, 4.2, 7, 1.2, 3.6, S[2], S[3]);
      _r3Box(m, pwX, 21.4, 6.8, 7.5, 3, 1.4, S[3], S[3]);
      _r3Box(m, pwX + 5.2, 21.4, 4.2, 2, 3.4, 3.2, S[1], S[3]);
      _r3Box(m, pwX - 2.6, 21.4, 6.9, 2.2, 1.4, 1.4, pwHz[0], pwHz[1]);
    }
    for (pw0 = 0; pw0 < 4; pw0++)                                   /* water tank on legs - */
      _r3Box(m, 1.1 + (pw0 % 2) * 3.8, 20.5, 2.6 + ((pw0 / 2) | 0) * 3.6, 1.4, 4, 1.4, S[2], S[3]);
    _r3Cyl(m, 3, 24.5, 4.4, 3.7, 5.5, C[1], C[3], 18);              /* pale, so it is not a */
    _r3Cone(m, 3, 30, 4.4, 3.7, 1.2, 1.8, C[0], 18);                /* fourth grey drum */
    _r3Box(m, 3, 24.5, 7.9, 1.2, 5.5, 1.2, S[2], S[2]);
    _r3Box(m, -19.5, 20.5, -6.5, 2.4, 1.4, 2.6, B.roof, B.trim);    /* deck plant huts */
    _r3Box(m, -19.5, 20.5, 6.6, 2.6, 3.4, 2.6, B.roof, B.trim);
    _r3Cyl(m, -19.6, 20.5, 1.5, 0.9, 1.7, pwLt, pwLt, 16);          /* deck lamps */
    _r3Cyl(m, 5.6, 20.5, 1.5, 0.9, 1.7, pwLt, pwLt, 16);
    _r3Box(m, -7, 20.5, 8.5, 29, 2, 2.2, B.roof, B.trim);           /* brown deck parapet */
    pwRailX(-19.5, 5.5, 22.5, 8.5, 9, S[3]);
    pwRailZ(-7, 6.5, 20.5, -20.2, 5, S[3]);
    pwRailZ(-7, 6.5, 20.5, 6.2, 5, S[3]);
    _r3Cyl(m, -19.5, 23.5, 8.5, 0.9, 3, pwHz[0], pwHz[1], 16);      /* corner markers */
    _r3Cyl(m, 5.5, 23.5, 8.5, 0.9, 3, pwHz[0], pwHz[1], 16);

    /* ---- annexe hip and cabin roof --------------------------------------------- */
    pwVent(11.5, -19.5, 14.6, 1.5, 3.6);
    pwVent(20, -12, 14.6, 1.4, 3.2);
    _r3Box(m, 16, 18.5, -15.5, 8, 1.2, 3, S[2], S[0]);              /* ridge cap and vent */
    _r3Cyl(m, 13, 14.5, -20.5, 0.8, 11, S[3], S[3], 16);            /* aerial mast */
    _r3Box(m, 13, 21.5, -20.5, 5, 0.9, 0.9, S[2], S[3]);
    _r3Box(m, 13, 23.5, -20.5, 3.6, 0.9, 0.9, S[2], S[3]);
    _r3Cyl(m, 13, 25.5, -20.5, 0.8, 1.4, pwLt, pwLt, 16);
    _r3Box(m, 14, 10, 1, 6.5, 3.4, 5, DK[1], DK[3]);                /* cabin plant */
    _r3Box(m, 14, 13.4, 1, 5, 1, 3.6, S[2], S[3]);
    _r3Box(m, 19.6, 10, 3, 2.4, 1.2, 9, S[2], S[0]);
    _r3Box(m, 12.5, 10, 7, 2.6, 1.3, 2.6, DK[1], DK[3]);            /* roof hatch */
    pwRailX(11.5, 20.5, 10, 8.4, 4, S[3]);

    /* ---- boiler house front. Only about three units of it clear the hall deck, so it gets
       a trim run and three wide louvres and nothing else - the rest is hidden wall. --- */
    for (pw0 = 0; pw0 < 3; pw0++)
      _r3Box(m, -15 + pw0 * 8, 15.8, -10.2, 6.5, 3.4, 1.8, S[2], S[0]);
    _r3Box(m, -7, 19.4, -10.2, 30, 1.6, 1.8, B.trim, B.trim);

    /* ---- turbine hall facade. Wall face z = 11, top of wall y = 18 -------------- */
    _r3Box(m, -7, 1.5, 11.9, 32, 2.6, 1.8, C[2], C[0]);             /* plinth course */
    _r3Box(m, -19.6, 1.5, 11.9, 3.2, 16.5, 1.8, B.trim, B.trim);    /* pilasters, hand set so */
    for (pw0 = 0; pw0 < 4; pw0++)                                   /* the loading bay gets a */
      _r3Box(m, -11.5 + pw0 * 6.5, 1.5, 11.9, 3.2, 16.5, 1.8, B.trim, B.trim);  /* wide bay */
    for (pw0 = 0; pw0 < 3; pw0++) {                                 /* lower row - mostly */
      _r3Box(m, -8.25 + pw0 * 6.5, 4.4, 11.9, 5.2, 4.2, 1.6, B.dark, B.dark);   /* behind the */
      _r3Box(m, -8.25 + pw0 * 6.5, 4.8, 12.1, 4.4, 3.4, 1.6, pwGl, pwGl);       /* switchyard */
    }
    _r3Box(m, -7, 8.5, 11.8, 31, 1.2, 1.5, B.trim, B.trim);         /* spandrel band */
    for (pw0 = 0; pw0 < 3; pw0++)                                   /* mid row of vents */
      _r3Box(m, -8.25 + pw0 * 6.5, 10, 12, 4.4, 1.6, 1.7, S[2], S[0]);
    for (pw0 = 0; pw0 < 3; pw0++)                                   /* the row that clears the */
      _r3Box(m, -8.25 + pw0 * 6.5, 12, 11.9, 5.4, 4.2, 1.6, B.dark, B.dark);    /* yard, so it */
    _r3Box(m, -8.25, 12.4, 12.1, 4.6, 3.4, 1.7, pwLt, pwLt);        /* gets deep reveals and */
    _r3Box(m, -1.75, 12.4, 12.1, 4.6, 3.4, 1.7, pwGl, pwGl);        /* two lit panes */
    _r3Box(m, 4.75, 12.4, 12.1, 4.6, 3.4, 1.7, pwLt, pwLt);
    _r3Box(m, -7, 15.7, 12.2, 31.5, 2.3, 2, TM[1], TM[3]);          /* team cornice */
    _r3Box(m, -7, 18, 11.9, 32, 1, 1.6, B.roof, B.roof);            /* roof fascia */
    _r3Box(m, -15.25, 1.5, 12.1, 9.5, 12, 2, B.dark, B.dark);       /* loading bay */
    _r3Box(m, -15.25, 2, 13.2, 7.6, 10.6, 1.2, S[2], S[1]);
    for (pw0 = 0; pw0 < 5; pw0++)
      _r3Box(m, -15.25, 3.2 + pw0 * 2, 13.9, 7.2, 0.9, 0.7, S[0], S[3]);
    _r3Box(m, -15.25, 13.5, 13.6, 12.5, 1.5, 5.4, S[3], S[1]);      /* canopy on two posts */
    _r3Box(m, -20.6, 1.5, 15.4, 1.6, 12, 1.6, S[2], S[3]);
    _r3Box(m, -9.9, 1.5, 15.4, 1.6, 12, 1.6, S[2], S[3]);
    _r3Box(m, -15.25, 1.9, 13.4, 13, 0.7, 5, C[1], C[3]);           /* ramp out of the bay */
    for (pw0 = 0; pw0 < 5; pw0++)
      _r3Box(m, -19.4 + pw0 * 2.1, 2.6, 15.4, 1.6, 0.6, 2, pw0 % 2 ? pwHz[1] : pwHz[0], pwHz[0]);
    _r3Box(m, -3, 15.7, 12.5, 4.4, 3.4, 1.6, pwHz[0], pwHz[1]);     /* HV warning plates */
    _r3Box(m, 2.6, 15.7, 12.5, 3.2, 3.4, 1.6, DK[2], DK[0]);
    _r3Box(m, 8.4, 1.5, 12.1, 2.6, 17.5, 2, S[2], S[0]);            /* corner cable riser */
    _r3Box(m, 8.4, 19, 11.4, 3.2, 1.4, 3.6, S[3], S[1]);
    pwLad(-21.4, 1.5, 12.2, 17, 6);

    /* ---- control cabin face ---------------------------------------------------- */
    _r3Box(m, 12, 1.5, 11.8, 5.4, 6.5, 1.6, B.dark, B.dark);
    _r3Box(m, 12, 1.9, 12.7, 3.8, 5.6, 0.9, S[2], S[1]);
    _r3Box(m, 17.5, 4.4, 11.8, 4.2, 3, 1.6, pwGl, pwGl);
    _r3Box(m, 21.4, 4.4, 11.8, 3, 3, 1.6, pwLt, pwLt);
    _r3Box(m, 16, 8.4, 11.9, 12.5, 1.5, 1.8, TM[1], TM[3]);
    _r3Box(m, 12, 1.5, 13.6, 6.5, 0.9, 2.6, C[1], C[3]);

    /* ---- switchyard ------------------------------------------------------------
       Two big transformers rather than three small ones: at 48 pixels across, three sets of
       bushings merged into a hedge and read as noise. Bushings sit on the FRONT of each lid,
       so both insulator rows land below the hall's window band instead of on top of it.
       Gantry LEFT, transformers RIGHT rather than the gantry spanning the lot - stacked in
       the same screen column the busbar cut straight through the bushings and neither read. */
    _r3Box(m, 0, 1.5, 18, 44, 0.7, 11, C[0], C[3]);
    for (pw0 = 0; pw0 < 3; pw0++)
      _r3Box(m, -1 + pw0 * 10, 2.2, 12.6, 7, 0.6, 2.6, DK[1], DK[3]);   /* trench covers */
    for (pw0 = 0; pw0 < 2; pw0++) {
      pwX = 4 + pw0 * 12.5;
      _r3Box(m, pwX, 1.5, 19.5, 12, 0.9, 8.5, C[2], C[1]);          /* bunded pad */
      _r3Box(m, pwX, 2.4, 19, 10, 6.5, 6, S[1], S[3]);              /* tank */
      _r3Box(m, pwX, 8.9, 19, 10.9, 1.3, 6.6, S[3], S[0]);          /* lid */
      _r3Box(m, pwX, 3, 22.6, 10.5, 1.4, 1.6, S[3], S[0]);          /* radiator headers */
      _r3Box(m, pwX, 8, 22.6, 10.5, 1.2, 1.6, S[3], S[0]);
      _r3Box(m, pwX - 3.6, 4.2, 22.9, 1.7, 4, 1.8, S[2], S[0]);     /* radiator fins */
      _r3Box(m, pwX - 1.8, 4.2, 22.9, 1.7, 4, 1.8, S[2], S[0]);
      _r3Box(m, pwX, 4.2, 22.9, 1.7, 4, 1.8, S[2], S[0]);
      _r3Box(m, pwX + 1.8, 4.2, 22.9, 1.7, 4, 1.8, S[2], S[0]);
      _r3Box(m, pwX + 3.6, 4.2, 22.9, 1.7, 4, 1.8, S[2], S[0]);
      pwBush(pwX - 3.2, 20.6, 10.2, 0.9);
      pwBush(pwX, 20.6, 10.2, 0.9);
      pwBush(pwX + 3.2, 20.6, 10.2, 0.9);
      _r3Cyl(m, pwX + 4, 10.2, 16.6, 1.7, 3, S[2], S[0], 16);       /* conservator */
      _r3Box(m, pwX - 4.2, 2.4, 16, 3.2, 4, 2.4, DK[1], DK[3]);     /* marshalling kiosk */
      _r3Box(m, pwX + 4.2, 3.4, 16.2, 2.6, 2.6, 1.6, pwHz[0], pwHz[1]);  /* danger plate */
    }
    /* Busbar gantry, deliberately squat. A full-height tower this far forward would project
       clean over the elevation the camera works hardest on. */
    for (pw0 = 0; pw0 < 8; pw0++)
      _r3Box(m, (pw0 < 4 ? -20.5 : -5.5) + ((pw0 % 2) ? 1.9 : -1.9), 1.5,
        20.5 + (((pw0 / 2) | 0) % 2 ? 1.9 : -1.9), 1.5, 6, 1.5, S[2], S[3]);
    for (pw0 = 0; pw0 < 6; pw0++)
      _r3Box(m, pw0 < 3 ? -20.5 : -5.5, 2.8 + (pw0 % 3) * 2.1, 20.5, 5.2, 0.9, 5.2, S[1], S[3]);
    _r3Box(m, -13, 7.5, 20.5, 17.5, 2, 2.4, S[1], S[3]);            /* head beam */
    _r3Box(m, -13, 5.6, 20.5, 16, 1.2, 1.6, S[2], S[3]);
    for (pw0 = 0; pw0 < 3; pw0++) pwBush(-19 + pw0 * 6.5, 20.5, 9.5, 0.7);
    _r3Box(m, -13, 13.4, 20.5, 16, 1.4, 1.4, S[3], S[0]);           /* the busbar itself */
    _r3Box(m, -13, 2.2, 23.2, 17.5, 1.3, 1.4, pwHz[1], pwHz[1]);    /* its kerb */
    for (pw0 = 0; pw0 < 9; pw0++)                                   /* yard kerb striping */
      _r3Box(m, -20.5 + pw0 * 4.9, 1.5, 11.2, 4.4, 1.1, 1.8, pw0 % 2 ? pwHz[1] : pwHz[0], pwHz[0]);
    for (pw0 = 0; pw0 < 4; pw0++)                                   /* switch kiosks, right */
      _r3Box(m, 11 + pw0 * 3.6, 2.2, 13.5, 3.2, 3.6 + (pw0 % 2) * 1.2, 3.4, DK[1], DK[3]);
    _r3Box(m, 16.4, 6.4, 13.5, 14.4, 0.9, 3.8, S[2], S[3]);
    _r3Box(m, 21.4, 4.6, 15.4, 3, 2.6, 1.4, TM[1], TM[3]);          /* painted panel */
    for (pw0 = 0; pw0 < 3; pw0++)                                   /* fuel drums */
      _r3Cyl(m, -1 + pw0 * 4, 2.2, 14.4, 1.8, 4.2, pw0 === 1 ? DK[1] : pwHz[0], S[3], 16);
    _r3Cyl(m, 6.5, 2.2, 14.4, 3.2, 3.4, DK[1], DK[3], 18);          /* cable drum */
    _r3Cyl(m, 6.5, 2.4, 14.4, 2.2, 3.2, S[2], S[0], 16);
    _r3Box(m, -6.5, 2.2, 14.2, 4.6, 3.4, 3.4, B.roof, B.trim);      /* crates off the ramp */
    _r3Box(m, -6.5, 5.6, 14.2, 4.9, 0.8, 3.7, B.trim, B.trim);
    for (pw0 = 0; pw0 < 5; pw0++)                                   /* sandbagged corner */
      _r3Cyl(m, -22 + pw0 * 2.6, 1.5, 22.1, 1.7, 2.2, RTS_PAL.bag[pw0 % 2], RTS_PAL.bag[1], 16);
    for (pw0 = 0; pw0 < 4; pw0++)                                   /* bollards at the bay */
      _r3Cyl(m, -21 + pw0 * 3.9, 2.2, 17.2, 1.1, 3.4, pwHz[0], pwHz[1], 16);
  } else if (key === 'refinery') {
    /* Scrap Refinery. Three masses that step across the width, because with no yaw the sides
       of a box never show and a single slab reads as a painted rectangle: a squat processing
       block on the left under a roof full of plant, two fat silos standing clear of it on the
       right, and a low annexe beside a wide open dock at the front. The identity is the DOCK -
       a grated receiving pit with a conveyor climbing out of it and into the block. Silos
       alone are the Scrap Silo and a block alone is any shed; the ramp is what makes this the
       place ore goes. So the ramp is the one run kept clear of every other mass, and the dock
       is spanned by an open portal gantry rather than a solid canopy - a slab roof there would
       eat the ramp, the pit and the whole front elevation in this projection.
       The silos and the two cyclone separators are the only curved masses in the base at this
       scale, which is what makes the refinery findable from across the map. Team colour rides
       the silo bands, the gantry sign, the façade band and the annexe lintel - four places at
       four heights, so ownership reads whichever part of it is on screen. */
    var rfY = 1.6;                                   /* everything stands on the apron */
    var rfHZ = RTS_PAL.hazard, rfOR = RTS_PAL.ore;
    /* A run of uprights plus a top rail. Roof railings are the cheapest thing that says
       "people work up here" - without them a roof deck is just a lid. */
    var rfRailX = function (x0, x1, z, y, n) {
      for (var q = 0; q < n; q++)
        _r3Box(m, x0 + (x1 - x0) * q / (n - 1), y, z, 1.6, 4.4, 1.6, S[2], S[3]);
      _r3Box(m, (x0 + x1) / 2, y + 4.4, z, x1 - x0 + 1.8, 1.4, 1.8, S[3], S[1]);
    };
    var rfRailZ = function (z0, z1, x, y, n) {
      for (var q = 0; q < n; q++)
        _r3Box(m, x, y, z0 + (z1 - z0) * q / (n - 1), 1.6, 4.4, 1.6, S[2], S[3]);
      _r3Box(m, x, y + 4.4, (z0 + z1) / 2, 1.8, 1.4, z1 - z0 + 1.8, S[3], S[1]);
    };
    /* A silo. The hoop ribs earn their calls: a bare cylinder bands into three flat tones
       under this light and reads as a painted disc, whereas ribs cut it into stacked
       highlights and it becomes a tank. The ladder and the railed cap platform give it scale.
       The discharge house stands PROUD of the tank (cz + r + 1.2, not cz + r - 2.5): sunk into
       the barrel it was a 1-unit lip behind the silo's own front and cost two calls for
       nothing - only the chute in front of it ever showed. */
    var rfSilo = function (cx, cz, r, h) {
      var q, a;
      _r3Cone(m, cx, 0, cz, r + 1.6, r + 0.4, 3.2, C[2], 20);            /* concrete skirt */
      _r3Cyl(m, cx, rfY, cz, r, h, S[0], S[3], 20);
      for (q = 0; q < 4; q++)
        _r3Cyl(m, cx, rfY + h * (q + 1) / 5.5, cz, r + 0.7, 1.6, S[2], S[3], 20);
      _r3Cyl(m, cx, rfY + h * 0.30, cz, r + 0.9, 3.6, TM[0], TM[1], 20); /* owner band */
      _r3Cone(m, cx, rfY + h, cz, r, r * 0.36, r * 0.44, C[1], 20);      /* cap */
      for (q = 0; q < 6; q++) {                                          /* cap platform */
        a = q / 6 * Math.PI * 2;
        _r3Box(m, cx + Math.cos(a) * (r + 0.4), rfY + h, cz + Math.sin(a) * (r + 0.4),
               1.6, 4.4, 1.6, S[2], S[3]);
      }
      _r3Cyl(m, cx, rfY + h + 4.4, cz, r + 1.2, 1.3, S[3], S[1], 20);
      _r3Cyl(m, cx, rfY + h + r * 0.44, cz, 2.3, 4.6, S[1], DK[1], 16);  /* vent, dark mouth */
      _r3Cyl(m, cx, rfY + h + r * 0.44 + 4.6, cz, 3.1, 1.3, S[3], S[1], 16);
      _r3Box(m, cx - 1.9, rfY, cz + r + 0.7, 1.3, h, 1.3, S[3], S[1]);   /* ladder rails */
      _r3Box(m, cx + 1.9, rfY, cz + r + 0.7, 1.3, h, 1.3, S[3], S[1]);
      for (q = 0; q < 6; q++)                                            /* rungs */
        _r3Box(m, cx, rfY + 4 + q * (h - 9) / 5, cz + r + 0.7, 4.8, 1.2, 1.2, S[1], S[2]);
      _r3Box(m, cx, rfY, cz + r + 1.2, 7, 8.5, 7, S[2], S[3]);           /* discharge house */
      _r3Box(m, cx, rfY + 1.2, cz + r + 4.4, 9, 2.2, 2.4, DK[1], DK[3]); /* its chute */
    };
    /* A roof fan: housing, grille rim, hub. Round, capped and repeated - the vocabulary that
       says "plant" rather than "furniture". The ring is PALE and the hub dark; a dark rim
       quantises to black and reads as a hole punched in the deck. */
    var rfFan = function (cx, cz, y, r) {
      _r3Cyl(m, cx, y, cz, r, 4.6, S[0], S[1], 18);
      _r3Cyl(m, cx, y + 4.6, cz, r + 0.7, 1.3, S[3], S[1], 18);
      _r3Cyl(m, cx, y + 5.9, cz, r * 0.36, 1.6, DK[1], DK[3], 16);
    };
    /* Cyclone separator - the dust extraction the brief lives on. Cone widening upward into a
       barrel, capped, with a clean-air stack off the top. */
    var rfCyclone = function (cx, cz, y, r) {
      _r3Cone(m, cx, y, cz, r * 0.38, r, 5, S[2], 18);
      _r3Cyl(m, cx, y + 5, cz, r, 6, S[0], S[1], 18);
      _r3Cyl(m, cx, y + 11, cz, r + 0.4, 1.4, S[3], S[1], 18);
      _r3Cyl(m, cx, y + 12.4, cz, 1.8, 4.6, S[1], DK[1], 16);
    };
    var rfBarrel = function (cx, cz, y, col) {
      _r3Cyl(m, cx, y, cz, 2.1, 5, col, S[3], 16);
      _r3Cyl(m, cx, y + 5, cz, 2.3, 0.9, DK[1], DK[3], 16);
    };

    /* ---- ground: one apron so nothing floats, with the dock hardstanding a shade paler */
    _r3Box(m, 0, 0, 0, W - 2, rfY, D - 2, C[2], C[1]);
    _r3Box(m, 0, rfY, D / 2 - 2.5, W - 8, 0.7, 4, C[2], C[0]);           /* kerb at the road */

    /* ---- processing block: x -34..8, z -34..-4, 26 tall */
    _r3Slab(m, -13, rfY, -19, 42, 26, 30, 4, B.wall, B.roof);
    _r3Box(m, -13, 0, -19, 43.5, 3.4, 31.5, B.dark, B.dark);             /* base course */
    _r3Box(m, -13, rfY + 6.5, -3.2, 41, 1.6, 1.6, B.trim, B.trim);       /* string course */
    pilasters(-3, rfY, -13, 7, 6, 3.4, 24);
    winRow(-3, rfY + 9.5, -13, 6, 6, 4.2, 4);
    winRow(-3, rfY + 19, -13, 6, 6, 4.2, 4);
    /* TM[1] first, not TM[0]: on the blue side the darker team tone is within a few points of
       B.wall and the band disappeared into the wall it is meant to mark. */
    _r3Box(m, -13, rfY + 15, -3.2, 34, 2.8, 1.8, TM[1], TM[0]);          /* owner band */
    _r3Box(m, -13, rfY + 17.8, -3.4, 34, 0.9, 1.4, B.trim, B.trim);
    /* Process pipes clamped to three of the piers and elbowing into the wall head. Ground
       level here is behind the annexe and the gantry, so the pipes are drawn full height and
       simply read from where they clear that - which is the interesting half anyway. */
    for (var rf0 = 0; rf0 < 3; rf0++) {
      var rfPx = -31 + rf0 * 6;
      _r3Cyl(m, rfPx, rfY, -2.4, 2, 18.4, S[0], S[1], 16);
      _r3Cyl(m, rfPx, rfY + 18.4, -2.4, 2.5, 2.8, S[2], S[3], 16);
      _r3Box(m, rfPx, rfY + 19.4, -5.5, 3.6, 3.6, 5, S[0], S[1]);
    }
    _r3Box(m, -28, 8, -2.4, 5.4, 1.6, 5.4, DK[1], DK[3]);                /* pipe clamps */
    _r3Box(m, -28, 15, -2.4, 5.4, 1.6, 5.4, DK[1], DK[3]);
    _r3Cyl(m, -25, 12, -2.4, 2.6, 1.3, TM[1], TM[0], 16);                /* valve wheel */

    /* ---- block roof, deck at 27.6. Flat top is x -30..4, z -30..-8; this is the largest
       surface in the sprite and it gets the most calls. Two rules hold the layout together:
       the plant row along the front sits at z -13.3 so its faces stop short of the edge rail
       at -8.8 (at -11.5 the rail ran straight through the fans and five of its eight posts
       vanished), and the water tank stands on the control room rather than on the deck -
       there are only 8 units of deck in front of that room and an 8.6-wide tank does not fit
       between it and the rail. */
    _r3Slab(m, -22, 27.6, -22, 14, 9, 12, 2.5, B.wall, B.roof);          /* control room */
    _r3Box(m, -22, 27.6 + 7, -15.2, 11, 2, 1.6, TM[0], TM[1]);
    winRow(-15, 30.6, -22, 3, 4.2, 3, 3);
    _r3Box(m, -22, 36.6, -22, 12.5, 1.2, 10.5, S[2], S[3]);              /* its roof cap */
    _r3Cyl(m, -27, 37.8, -25, 0.9, 10, S[1], S[3], 16);                  /* mast */
    _r3Box(m, -27, 44.4, -25, 4.5, 1.2, 1.2, S[3], S[1]);
    _r3Box(m, -27, 42, -25, 3.4, 1.2, 1.2, S[3], S[1]);
    _r3Cyl(m, -27, 47.8, -25, 1.4, 1.7, rfHZ[0], RTS_PAL.lit, 16);       /* warning light */
    /* water tank on legs, up on the control room: a second round mass at the top of the
       sprite, read against the silos */
    for (var rf3 = 0; rf3 < 4; rf3++)
      _r3Box(m, -20.5 + ((rf3 & 1) ? 2.6 : -2.6), 37.8, -21.5 + ((rf3 & 2) ? 2.4 : -2.4),
             1.7, 5, 1.7, S[3], S[1]);
    _r3Cyl(m, -20.5, 42.8, -21.5, 4.3, 6.5, S[0], S[1], 18);
    _r3Cone(m, -20.5, 49.3, -21.5, 4.3, 1.4, 2.4, C[1], 18);
    _r3Box(m, -20.5, 32.5, -15.6, 2, 10, 2, S[3], S[2]);                 /* its downpipe */

    _r3Box(m, -4, 27.6, -24, 16, 3, 7, S[2], S[3]);                      /* cyclone plenum */
    rfCyclone(-8.7, -24, 30.6, 4.2);
    rfCyclone(0.7, -24, 30.6, 4.2);
    _r3Box(m, -3, 28.6, -18.4, 3.6, 3.6, 4.5, S[2], S[3]);               /* duct to the fan */
    _r3Cyl(m, -3, 27.6, -15.8, 2.4, 5, S[0], S[1], 16);                  /* elbow */
    _r3Slab(m, -3, 27.6, -13.3, 11, 5.5, 6, 1.5, S[2], S[1]);            /* extract fan house */
    _r3Box(m, -13.5, 27.6, -25, 3.8, 13, 3.8, S[1], DK[1]);              /* vent stacks */
    _r3Box(m, -13.5, 40.6, -25, 5, 1.2, 5, S[3], S[1]);
    _r3Box(m, -13.5, 27.6, -18, 3.4, 9.5, 3.4, S[1], DK[1]);
    _r3Box(m, -13.5, 37.1, -18, 4.6, 1.2, 4.6, S[3], S[1]);
    _r3Box(m, -4.5, 27.6, -29.2, 18, 1.8, 2.4, S[3], S[2]);              /* cable tray */
    for (var rf2 = 0; rf2 < 3; rf2++)
      _r3Box(m, -12 + rf2 * 7.5, 27.6, -29.2, 1.6, 3.2, 3.4, S[2], S[3]);
    _r3Box(m, -22, 27.6, -29.3, 5.5, 1.2, 3.4, DK[1], DK[3]);            /* roof hatch */
    _r3Box(m, -22, 28.8, -30.6, 5.5, 3.4, 1.2, S[2], S[1]);              /* its open lid */
    rfFan(-25.5, -13.3, 27.6, 3.4);
    rfFan(-18, -13.3, 27.6, 3.4);
    _r3Slab(m, -11.5, 27.6, -13.3, 5.5, 4.6, 5.5, 1.4, DK[1], DK[3]);    /* air handler */
    _r3Box(m, -11.5, 32.2, -13.3, 4.4, 1.2, 4.4, S[2], S[3]);
    _r3Box(m, -11.5, 29, -10.7, 5, 2.6, 1.4, S[3], DK[2]);               /* its louvre */
    rfRailX(-29, 3, -8.8, 27.6, 8);
    rfRailZ(-28, -11, -29.3, 27.6, 5);
    _r3Cyl(m, 3.5, 27.6, -17, 1.5, 2.6, S[1], S[3], 16);                 /* catwalk to silo */
    _r3Box(m, 7.5, 30.2, -17, 9, 1.8, 5.5, S[2], S[3]);
    _r3Box(m, 7.5, 32, -19.4, 9, 3.4, 1.2, S[3], S[1]);
    _r3Box(m, 7.5, 32, -14.6, 9, 3.4, 1.2, S[3], S[1]);

    /* ---- the two silos. Different diameters and heights on purpose: a matched pair reads as
       one wide cylinder from a distance, a stepped pair reads as two. */
    rfSilo(22, -21, 11.5, 38);
    rfSilo(23, 11, 10, 29);
    /* Pipe bridge between them - three runs at three heights. Every elbow is set ON the tank
       wall it meets rather than at the middle of the run: an elbow parked inside the barrel is
       a call that renders nothing. */
    _r3Box(m, 22, 30, -4, 4.6, 4.6, 18, S[0], S[1]);
    _r3Cyl(m, 22, 30, -10, 2.9, 5.6, S[2], S[3], 16);
    _r3Cyl(m, 22, 30, 1.5, 2.9, 5.6, S[2], S[3], 16);
    _r3Cyl(m, 22, 34.6, -4, 3, 1.3, TM[1], TM[0], 16);
    _r3Box(m, 28.5, 26.5, -4, 3.2, 3.2, 18, S[2], S[3]);
    _r3Cyl(m, 28.5, 26.5, 3, 2.3, 4.6, S[2], S[3], 16);
    _r3Box(m, 15.5, 22, -4, 3, 3, 18, S[1], S[3]);
    _r3Cyl(m, 15.5, 22, -11, 2.2, 4.6, S[2], S[3], 16);
    _r3Cyl(m, 15.5, 25, 0, 2.5, 1.2, TM[1], TM[0], 16);

    /* ---- annexe: pump house and offices, low and forward so the block behind it steps up.
       The front elevation is 20 wide and holds three things in a row that must not share it:
       personnel door, roll-up shutter, office window. */
    _r3Slab(m, -25, rfY, 19, 20, 13, 28, 3, B.wall, B.roof);
    _r3Box(m, -25, 0, 19, 21.5, 3.4, 29.5, B.dark, B.dark);
    _r3Box(m, -25, 14.6, 19, 19, 1.5, 27, C[2], C[1]);                   /* parapet coping */
    _r3Box(m, -23.5, rfY, 34, 12, 11, 1.6, B.trim, B.trim);              /* shutter frame */
    _r3Box(m, -23.5, rfY, 34.6, 9.8, 9.5, 1.4, DK[3], DK[1]);
    for (var rf4 = 0; rf4 < 4; rf4++)                                    /* slats, pale: a
       shutter in the darkest greys quantises flat and reads as a hole in the wall */
      _r3Box(m, -23.5, rfY + 1.6 + rf4 * 2.2, 35, 9.8, 1, 1, S[3], S[1]);
    _r3Box(m, -23.5, rfY + 11, 34.4, 13, 2.2, 1.8, TM[0], TM[1]);        /* owner lintel */
    /* threshold stripe rides ON the road kerb (rfY + 0.7): level with it, the kerb's own top
       face won the depth test and the stripe showed as a 0.4-wide sliver */
    _r3Box(m, -23.5, rfY + 0.7, 34.9, 14, 0.7, 2, rfHZ[0], rfHZ[0]);
    _r3Box(m, -32.6, rfY, 34, 4.6, 9, 1.6, B.trim, B.trim);              /* personnel door */
    _r3Box(m, -32.6, rfY, 34.5, 3.2, 7.6, 1.4, DK[1], DK[3]);
    _r3Box(m, -32.6, 0, 34.4, 4.6, 1.6, 2.6, C[0], C[1]);                /* its step */
    winRow(34, rfY + 4.5, -16.2, 1, 0, 2.4, 3.4);                        /* office window */
    /* annexe roof - everything stands ON the coping at 16.1, not sunk 1.5 into it */
    _r3Box(m, -28.5, 16.1, 12, 6.5, 3.6, 6.5, DK[1], DK[3]);             /* condensers */
    _r3Cyl(m, -28.5, 19.7, 12, 2.4, 1.2, S[2], S[3], 16);
    _r3Box(m, -21, 16.1, 12, 6.5, 3.6, 6.5, DK[1], DK[3]);
    _r3Cyl(m, -21, 19.7, 12, 2.4, 1.2, S[2], S[3], 16);
    for (var rf1 = 0; rf1 < 3; rf1++)                                    /* skylights */
      _r3Box(m, -30 + rf1 * 6, 16.1, 7, 5, 1.5, 2.6, RTS_PAL.glass, '#b6dae8');
    _r3Box(m, -30, 16.1, 24, 6, 3.4, 5.5, S[2], S[1]);                   /* stack housing */
    _r3Cyl(m, -30, 19.5, 24, 2.3, 8, S[1], DK[1], 16);                   /* vent stack */
    _r3Cyl(m, -30, 27.5, 24, 3.1, 1.2, S[3], S[1], 16);
    _r3Box(m, -24, 16.1, 21, 14, 2.6, 2.6, S[2], S[3]);                  /* roof pipe run */
    _r3Cyl(m, -30.5, 16.1, 21, 2, 4, S[2], S[3], 16);
    _r3Cyl(m, -17.5, 16.1, 21, 2, 4, S[2], S[3], 16);
    _r3Box(m, -28, 16.1, 28.5, 5, 1.2, 3.4, DK[1], DK[3]);               /* hatch */
    _r3Box(m, -22.5, 16.1, 24, 5.5, 4.4, 5, DK[3], DK[1]);               /* condenser */
    _r3Cyl(m, -22.5, 20.5, 24, 2, 1.2, S[3], S[1], 16);
    for (var rfg = 0; rfg < 3; rfg++)                                    /* sandbagged post */
      _r3Cyl(m, -29 + rfg * 3.2, 16.1, 27.5, 2.3, 2.6, RTS_PAL.bag[0], RTS_PAL.bag[1], 16);
    rfRailX(-31, -19, 29.2, 16.1, 5);
    _r3Cyl(m, -31.5, 16.1, 9.5, 0.9, 15, S[1], S[3], 16);                /* flag */
    _r3Box(m, -28.8, 26.1, 9.5, 5.5, 4, 1.2, TM[0], TM[1]);

    /* ---- the dock. Open gantry, not a canopy: in this projection a slab roof at working
       height would swallow the pit and the conveyor, which are the two things worth seeing. */
    _r3Box(m, -2, rfY, 26, 26, 0.7, 20, C[1], C[0]);                     /* hardstanding */
    _r3Box(m, -14.5, rfY, 26, 2.4, 2.2, 20, C[2], C[0]);                 /* wheel kerbs */
    _r3Box(m, 10.5, rfY, 26, 2.4, 2.2, 20, C[2], C[0]);
    /* receiving pit: rim, hopper, the scrap sitting in it, and a grating over the mouth */
    _r3Box(m, -2, rfY, 25, 21, 1.6, 17, C[2], C[0]);
    /* Chevrons and bollards ride ON the rim (rfY + 1.6). Laid on the apron at rfY + 0.7 they
       were inside that 1.6-thick slab and five of six never rendered - and the rim IS the
       drive-on deck here, so hazard striping belongs on top of it. */
    for (var rf5 = 0; rf5 < 4; rf5++)                                    /* drive-in chevrons */
      _r3Box(m, -2, rfY + 1.6, 19.5 + rf5 * 3.6, 20, 0.45, 1.6,
             (rf5 & 1) ? rfHZ[1] : rfHZ[0], (rf5 & 1) ? rfHZ[1] : rfHZ[0]);
    for (var rf6 = 0; rf6 < 4; rf6++)                                    /* bollards */
      _r3Cyl(m, (rf6 & 1) ? 6 + (rf6 >> 1) * 0.5 : -10 - (rf6 >> 1) * 0.5, rfY + 1.6,
             (rf6 >> 1) ? 28 : 19, 1.7, 5, rfHZ[0], rfHZ[1], 16);
    _r3Cone(m, -2, rfY + 1.6, 25, 3.5, 7.6, 6, S[2], 18);
    _r3Cyl(m, -2, rfY + 7, 25, 7.3, 1.5, rfOR[1], rfOR[2], 18);
    for (var rf7 = 0; rf7 < 4; rf7++)
      _r3Box(m, -2, rfY + 8.4, 21 + rf7 * 2.7, 15, 0.8, 1.2, S[3], S[2]);
    _r3Box(m, -2, rfY + 1.6, 33.6, 21, 1, 1.8, rfHZ[0], rfHZ[0]);        /* pit edge stripe */
    /* Portal gantry. Two cross beams, not three - three at one height projected into a solid
       grey deck and threw away everything the open frame was for. */
    for (var rf8 = 0; rf8 < 4; rf8++)
      _r3Cyl(m, (rf8 < 2 ? -13 : 9), rfY, (rf8 & 1) ? 32 : 22, 2.4, 16.4, C[0], C[1], 16);
    _r3Box(m, -13, 18, 27, 3.6, 3.6, 13.6, S[0], S[1]);
    _r3Box(m, 9, 18, 27, 3.6, 3.6, 13.6, S[0], S[1]);
    _r3Box(m, -2, 18, 22, 25, 3.4, 3.4, S[0], S[1]);
    _r3Box(m, 4, 15.2, 27, 5.5, 3.6, 4.5, S[2], S[3]);                   /* hoist trolley */
    _r3Box(m, -2, 18, 32, 25, 3.4, 3.4, S[0], S[1]);
    _r3Box(m, -2, 13.6, 32.4, 18, 4.2, 1.6, TM[0], TM[1]);               /* owner sign */
    for (var rf9 = 0; rf9 < 2; rf9++) {                                  /* floodlights */
      _r3Box(m, rf9 ? 5 : -9, 16.2, 31.4, 3.6, 2.8, 2.8, DK[1], DK[3]);
      _r3Box(m, rf9 ? 5 : -9, 16.4, 29.8, 2.8, 2.2, 1.6, RTS_PAL.lit, RTS_PAL.lit);
    }
    _r3Cyl(m, -13, 21.6, 22, 1.7, 2.2, rfHZ[0], RTS_PAL.lit, 16);
    _r3Cyl(m, 9, 21.6, 32, 1.7, 2.2, rfHZ[0], RTS_PAL.lit, 16);

    /* ---- conveyor out of the pit and into the block. Stepped boxes because there is no way
       to tilt a primitive, and stepping is what a covered gallery looks like anyway; the
       darker tops read as one continuous belt line climbing the sprite. */
    for (var rfa = 0; rfa < 12; rfa++)
      _r3Box(m, -2, rfY + 2.4 + rfa * 2, 22 - rfa * 2.3, 8.5, 3.6, 4.6, S[0], DK[1]);
    for (var rfb = 0; rfb < 2; rfb++) {                                  /* trestle bents */
      var rfBz = rfb ? 8 : 16, rfBy = rfY + 2.4 + (22 - rfBz) / 2.3 * 2;
      _r3Cyl(m, -5.6, rfY, rfBz, 1.5, rfBy - rfY, S[2], S[3], 16);
      _r3Cyl(m, 1.6, rfY, rfBz, 1.5, rfBy - rfY, S[2], S[3], 16);
      _r3Box(m, -2, rfBy - 1.6, rfBz, 9.5, 1.6, 2.4, S[3], S[1]);
    }
    _r3Slab(m, -2, 24.6, -2, 13, 9.5, 9.5, 2, S[0], S[1]);               /* head house */
    _r3Box(m, 4.2, 26.5, -2, 4.5, 4.5, 6, DK[1], DK[3]);                 /* drive motor */
    _r3Box(m, -2, 30.5, 3.2, 9, 2.4, 1.6, TM[0], TM[1]);
    _r3Cyl(m, -2, 34.1, -2, 2.1, 4.4, S[1], DK[1], 16);                  /* its vent */
    _r3Box(m, -7.5, 26.5, 3.3, 1.4, 8, 1.4, S[3], S[1]);                 /* access ladder */
    _r3Box(m, -4.5, 26.5, 3.3, 1.4, 8, 1.4, S[3], S[1]);
    for (var rfc = 0; rfc < 4; rfc++)
      _r3Box(m, -6, 27.5 + rfc * 1.9, 3.3, 3.6, 1, 1, S[1], S[2]);

    /* ---- yard clutter. Ground level between the block and the dock, and the free corner to
       the right of the silos - the two places a unit will never stand. */
    for (var rfd = 0; rfd < 4; rfd++)                                    /* crates */
      _r3Box(m, -12 + (rfd & 1) * 5.2, rfY + (rfd > 1 ? 4.6 : 0), 2.5 + (rfd > 1 ? 0.6 : 0),
             5, 4.6, 5, RTS_PAL.dirt[2], RTS_PAL.dirt[1]);
    _r3Box(m, -9.5, rfY, 5.6, 12, 1.2, 3, RTS_PAL.dirt[0], RTS_PAL.dirt[3]);  /* pallet */
    rfBarrel(4, 2.5, rfY, rfHZ[0]);
    rfBarrel(4, 6, rfY, S[1]);
    rfBarrel(8, 4.5, rfY, rfHZ[0]);
    _r3Cyl(m, 7.5, rfY, 12.5, 3.6, 4.2, DK[1], S[2], 18);                /* cable drum */
    _r3Cyl(m, 7.5, rfY + 4.2, 12.5, 4.4, 1.2, S[2], S[3], 18);
    _r3Cyl(m, 7.5, rfY, 12.5, 4.4, 1.2, S[2], S[3], 18);
    _r3Slab(m, 28, rfY, 31, 12, 9, 8, 2, S[2], S[1]);                    /* transformer bank */
    for (var rfe = 0; rfe < 3; rfe++) {
      _r3Cyl(m, 23.5 + rfe * 4.5, rfY + 9, 31, 1.5, 4.2, C[0], C[1], 16);
      _r3Box(m, 23.5 + rfe * 4.5, rfY + 13.2, 31, 2.6, 1, 2.6, DK[1], DK[3]);
    }
    _r3Box(m, 28, rfY + 2, 35.3, 10, 5, 1.4, DK[1], DK[3]);              /* its radiator */
    _r3Cyl(m, 15, rfY, 29, 4.6, 9, S[0], S[1], 18);                      /* day tank */
    _r3Cone(m, 15, rfY + 9, 29, 4.6, 1.6, 2.2, C[1], 18);
    _r3Box(m, 15, rfY, 33.9, 5.5, 5, 1.4, rfHZ[0], rfHZ[1]);
    rfBarrel(33, 20.5, rfY, rfHZ[0]);
    rfBarrel(33, 25, rfY, S[1]);
    /* spilt scrap in the yard, on grey apron: heaped on the striped receiving deck the ore
       tones sat on hazard yellow and vanished */
    _r3Cone(m, -11.5, rfY, 10.5, 2.4, 0.5, 1.5, rfOR[0], 16);
    _r3Cone(m, -6.5, rfY, 12.5, 3, 0.5, 1.7, rfOR[1], 16);
    _r3Cone(m, -11, rfY, 15.5, 2.6, 0.5, 1.4, rfOR[2], 16);
  } else if (key === 'barracks') {
    /* Barracks. A long hut on a concrete apron under a steep hipped roof that overhangs its
       wall, with the entrance pushed forward at one end as a flat-canopied porch and the kit
       store standing off in the yard as its own small gabled shed. Three roof forms at three
       heights is the point: with no yaw the sides of a box never show, so one hut is a painted
       rectangle, and it is the stepped front line plus a ridge running the full width above it
       that keeps this from reading as the Kennel or any other shed in the base.
       The roof is pitched roughly 1:1 because the near slope is the largest surface in the
       sprite and a shallow pitch throws half of it away. It carries three dormers, three ridge
       ventilators, a brick stack, two flues and eleven tile courses. The wall below carries what
       a hut really has - a rank of bunk-room windows under a verandah - and that window rank is
       what the player has to read at a glance, because it is the only cue saying men sleep here
       and infantry come from here.
       THE RANK ONLY READS IF WALL SHOWS BETWEEN THE WINDOWS. An earlier pass put a 5.8-wide
       surround on every window at 7.0 centres and then ran five 3.0-wide pilasters through the
       1.2 gaps that left; measured against the depth buffer, the union of surrounds, pilasters
       and porch covered the wall from x -23.5 to x +22 without a break and the wall itself
       rendered ZERO pixels. The trim had eaten the thing it was meant to decorate. Surrounds are
       now 4.2 at 7.2 centres, the pilasters are gone, and the 3.0-unit gaps are real wall.
       Pale trim is rationed for the same reason: B.trim on the fascia, the vent caps and every
       barge board turns the sprite into pale horizontal banding with no roof left in it, since
       at 48 pixels wide a full-width light band is a third of the silhouette. The ridge cap is
       concrete, not trim, and the vent caps are dark.
       Team colour rides three painted panels above the eaves, the canopy fascia, the double
       doors, the store's ridge and the flag: five heights, so ownership reads whichever part of
       the mass is on screen. It is deliberately separate panels and not one band - a band ran
       the full width and read as a stripe painted across the roof for no reason. */
    var bkY = 2, bkBG = RTS_PAL.bag, bkHZ = RTS_PAL.hazard, bkDT = RTS_PAL.dirt;
    /* The near slope runs from the eave (z 5.5, y 15) to the ridge (z -8, y 29), and the hip
       pulls its half-width in from 23 to 14 over the same run. Roof furniture is placed through
       these two so it sits ON the slope and INSIDE the hip - placing it by eye left half of it
       hovering in mid air and the rest hanging off the ends. */
    var bkRf = function (rz) { return 15 + (5.5 - rz) * 14 / 13.5; };
    var bkHw = function (rz) { return 23 - 9 * (5.5 - rz) / 13.5; };
    /* A window with a reveal, a sill and a lintel. Flat glass on a flat wall reads as a sticker;
       the dark reveal behind it and the trim round it are the whole reason an opening looks like
       an opening at this size. The surround oversails the opening by only 0.5 a side - any more
       and four surrounds at these centres touch and the rank becomes one continuous pale stripe.
       There is deliberately no glazing bar: in a 2.0-wide pane a bar is most of the glass. */
    var bkWin = function (wx, wy, wz, ww, wh) {
      _r3Box(m, wx, wy - 1.4, wz + 0.1, ww + 1.0, 1.4, 2.0, B.trim, C[3]);      /* sill */
      _r3Box(m, wx, wy, wz, ww, wh, 1.6, DK[0], DK[1]);                         /* reveal */
      _r3Box(m, wx, wy + 0.7, wz + 0.5, ww - 1.2, wh - 1.4, 1.7, RTS_PAL.glass, RTS_PAL.lit);
      _r3Box(m, wx, wy + wh, wz, ww + 1.0, 1.4, 2.0, B.trim, B.trim);           /* lintel */
    };
    /* Sandbags are cylinders because a stacked row of boxes reads as a kerb - the round ends are
       the whole tell. Courses step in by half a bag so a run tapers like a revetment instead of
       standing up as a slab, and the bags are deliberately fat: at one pixel per model unit a
       small bag is a speck and a row of specks is grain. The courses alternate the DARK bag tone
       with the mid one; all pale, a run read as one bright sand blob dumped in the yard.
       There is ONE revetment. Two of them, at z 10 and z 20, projected into adjacent screen rows
       and merged into a single beige mass twenty-three rows tall down the middle of the sprite -
       which is the sand-blob failure arriving by a different route. */
    var bkBags = function (bx, bz, bdx, bn, brows) {
      for (var bk0 = 0; bk0 < brows; bk0++) {
        for (var bk1 = 0; bk1 + bk0 < bn; bk1++) {
          _r3Cyl(m, bx + bdx * (bk1 + bk0 * 0.5), bkY + bk0 * 2.5, bz, 2.4, 2.6,
                 ((bk0 + bk1) % 2) ? bkBG[2] : bkBG[0], bkBG[1], 16);
        }
      }
    };
    /* Ridge ventilator - the one piece of roof furniture that says "barrack hut" rather than
       "house". Three, well apart and capped in dark steel: pale caps at closer centres merged
       into a slab along the ridge and read as battlements. The body starts at y 26.0, BELOW the
       roof surface at the vent's front edge (26.3), so it is bedded into the slope rather than
       hovering over it, and each of the three parts clears the one above it in screen rows -
       stacked any tighter the body and louvre were both buried and only the cap ever drew. */
    var bkVent = function (vx) {
      _r3Box(m, vx, 26.0, -8, 5.0, 2.4, 5.2, DK[1], DK[3]);                  /* body */
      _r3Box(m, vx, 28.4, -8, 4.0, 1.4, 4.6, DK[0], DK[2]);                  /* louvre slot */
      _r3Box(m, vx, 29.8, -8, 5.4, 1.0, 5.6, DK[1], DK[2]);                  /* cap */
    };
    /* Stove chimney: brick stack, oversailing cap course, two pots, standing proud of the ridge.
       This began as a thin steel flue and simply vanished - at this scale a two-pixel pipe is a
       scratch, where a masonry stack is a real mass that breaks the ridge line and shades the
       slope beside it. It sits in the right-hand hip so the left half stays clear for the flag. */
    var bkStack = function (fx, fz) {
      _r3Box(m, fx, bkRf(fz) - 1.5, fz, 4.8, 12, 4.8, B.dark, DK[2]);
      _r3Box(m, fx, bkRf(fz) + 10.5, fz, 5.8, 1.6, 5.8, C[0], C[3]);         /* cap course */
      _r3Cyl(m, fx - 1.2, bkRf(fz) + 12.1, fz, 1.2, 2.6, C[2], DK[1], 16);   /* pots */
      _r3Cyl(m, fx + 1.2, bkRf(fz) + 12.1, fz, 1.2, 2.6, C[2], DK[1], 16);
    };
    /* Dormer: cheeks buried in the slope, hipped cap in ROOF colour, one lit window with a sill
       and no lintel. Three of them break the biggest plane in the sprite into four pieces, and
       lit glass up there says "men sleep under this" more cheaply than any amount of wall detail
       could. A trim-coloured cap read as a white lump sitting on the roof. The pane is smaller
       than a bunk-room pane on purpose - at equal size the two ranks competed and the eye could
       not tell which one was the wall. */
    var bkDormer = function (dx) {
      var bkDy = bkRf(3.0) - 1.2;                    /* front face just buried in the slope */
      _r3Box(m, dx, bkDy, -0.5, 6.2, 6.4, 7.0, B.wall, B.roof);
      _r3Hip(m, dx, bkDy + 6.4, -0.5, 7.2, 2.4, 8.4, 2.2, B.roof);
      _r3Box(m, dx, bkDy - 0.1, 3.9, 4.8, 1.4, 2.0, B.trim, C[3]);           /* its sill */
      _r3Box(m, dx, bkDy + 1.4, 3.8, 3.6, 3.2, 1.6, DK[0], DK[1]);           /* its reveal */
      _r3Box(m, dx, bkDy + 2.1, 4.3, 2.2, 2.0, 1.7, RTS_PAL.glass, RTS_PAL.lit);
    };

    /* ---- ground: an apron under the hut, then a narrower parade square in front of the door,
       so the base of the sprite steps in rather than running out as one 46-wide slab. There is
       no worn path: laid at y 2.7 it stood PROUD of the entrance steps and buried them. */
    _r3Box(m, 0, 0, -7, 46, bkY, 26, C[2], C[1]);
    _r3Box(m, 0, 0, 13.5, 40, bkY, 15, C[2], C[1]);

    /* ---- the hut: walls x -22..22, z -19..3, 13 tall. No plinth - a dark band at y 0..3.5 sat
       entirely behind the verandah deck and drew nothing. */
    _r3Slab(m, 0, bkY, -8, 44, 13, 22, 3, B.wall, B.roof);
    for (var bk2 = 0; bk2 < 4; bk2++) bkWin(-16.0 + bk2 * 7.2, 5.0, 3.9, 3.2, 3.8);
    _r3Box(m, -7, bkY, 4.9, 30, 1.2, 4.2, bkDT[2], bkDT[3]);                    /* deck */
    _r3Box(m, 0.9, 3.8, 6.6, 11.6, 0.7, 0.8, DK[1], DK[3]);                     /* its rail */
    /* Verandah posts, in the wall gaps between the windows - these do the job the pilasters were
       meant to do without covering the wall, because they are 1.1 wide instead of 3.0. Only the
       open half of the deck is railed: the left half is behind the kit store in screen space. */
    for (var bk3 = 0; bk3 < 3; bk3++) {
      var bkPx = -12.4 + bk3 * 7.2;
      _r3Cyl(m, bkPx, bkY + 1.2, 6.2, 0.55, 10.4, S[3], S[1], 16);
    }
    /* Post lanterns. The bulb hangs BELOW the shade rim rather than inside it - tucked up into
       the cone the lit box lost the depth test to the shade's own front face every time. */
    for (var bk4 = 0; bk4 < 2; bk4++) {
      var bkLx = bk4 ? 2.0 : -12.4;
      _r3Cone(m, bkLx, 10.2, 6.2, 1.3, 0.6, 1.5, S[2], 16);
      _r3Box(m, bkLx, 9.0, 6.2, 1.8, 1.0, 2.2, RTS_PAL.lit, RTS_PAL.lit);
    }
    /* The eaves are eleven alternating blocks under the overhang rather than one long fascia.
       Same call count, but a continuous band cut the sprite in half where a dentil rhythm reads
       as rafter ends and puts the roof visibly in front of the wall. */
    for (var bk5 = 0; bk5 < 11; bk5++)
      _r3Box(m, -20 + bk5 * 4, 13.2, 5.0, 3.6, 2.3, 2.2, (bk5 % 2) ? DK[0] : B.roof, DK[2]);
    _r3Cyl(m, -22.5, bkY, 4.2, 1.1, 12, S[1], S[3], 16);                        /* downpipes */
    _r3Cyl(m, 22.5, bkY, 4.2, 1.1, 12, S[1], S[3], 16);

    /* ---- the roof. Biggest surface in the sprite by a long way, so it gets the most calls */
    _r3Hip(m, 0, 15, -8, 46, 14, 27, 9, B.roof);
    for (var bk6 = 0; bk6 < 11; bk6++) {                                        /* tile courses */
      var bkBz = 5.0 - bk6 * 1.2;
      _r3Box(m, 0, bkRf(bkBz) - 1.2, bkBz, 2 * bkHw(bkBz) - 3.0, 1.4, 1.4, DK[0], B.roof);
    }
    /* Owner panels sit in the gaps BETWEEN the dormers. Evenly spaced at 13 they landed square
       on the dormer sills, and a team-coloured panel shouldering through a sill is the one
       collision on this model the eye actually picks out. The left panel is wider than the two
       inner ones because the left hip has no stack on it to balance. */
    _r3Box(m, -18.5, 15.2, 4.6, 5.0, 1.9, 2.2, TM[0], TM[1]);
    _r3Box(m, -5.75, 15.2, 4.6, 3.4, 1.9, 2.2, TM[0], TM[1]);
    _r3Box(m, 5.75, 15.2, 4.6, 3.4, 1.9, 2.2, TM[0], TM[1]);
    bkDormer(-11.5);
    bkDormer(0);
    bkDormer(11.5);
    bkStack(16, 2.5);
    for (var bk7 = 0; bk7 < 2; bk7++) {                                         /* stove flues */
      var bkFx = bk7 ? 5.75 : -5.75;
      _r3Cyl(m, bkFx, bkRf(1.0) - 1.2, 1.0, 1.2, 4.6, S[1], DK[1], 16);
      _r3Cyl(m, bkFx, bkRf(1.0) + 3.4, 1.0, 1.6, 1.3, S[2], S[1], 16);
    }
    /* Ridge: cap plus three vents and nothing else. Two finials on top of that made eight
       separate objects along one line and the ridge read as a parapet with merlons on it. */
    _r3Box(m, 0, 28.0, -8, 28, 1.6, 2.6, C[0], C[3]);
    bkVent(-9);
    bkVent(0);
    bkVent(9);

    /* ---- entrance porch, pushed forward at the right hand end: x 9..20, z 3..12. The canopy is
       roof colour, not trim - in trim it was the brightest thing on the sprite and pulled the eye
       clean off the door it exists to frame. The door reveal is 7.4 wide, not 9.4: at 9.4 it ran
       the full width of the porch and the porch walls themselves drew nothing. */
    _r3Slab(m, 14.5, bkY, 7.5, 11, 10, 9, 2, B.wall, B.roof);
    _r3Box(m, 14.5, 12.0, 7.6, 15, 1.7, 12, B.roof, B.roof);                    /* canopy */
    _r3Box(m, 14.5, 12.0, 13.1, 15, 2.4, 1.7, TM[0], TM[1]);                    /* fascia band */
    _r3Cyl(m, 8.6, bkY, 12.4, 1.2, 10, S[3], S[1], 16);                         /* canopy posts */
    _r3Cyl(m, 20.4, bkY, 12.4, 1.2, 10, S[3], S[1], 16);
    _r3Box(m, 14.5, 3.6, 12.4, 7.4, 8.4, 1.7, DK[0], DK[1]);                    /* door reveal */
    _r3Box(m, 12.85, 3.6, 12.9, 3.2, 6.8, 1.6, TM[1], TM[3]);                   /* double doors */
    _r3Box(m, 16.15, 3.6, 12.9, 3.2, 6.8, 1.6, TM[1], TM[3]);
    _r3Box(m, 14.5, 6.6, 13.6, 1.6, 1.6, 1.6, S[3], S[1]);                      /* the handles */
    _r3Box(m, 14.5, 10.5, 12.9, 7.4, 1.4, 1.6, RTS_PAL.glass, RTS_PAL.lit);     /* transom */
    _r3Box(m, 9.9, 5.0, 12.3, 1.6, 2.4, 0.8, C[0], C[3]);                       /* orders board */
    _r3Box(m, 9.9, 7.4, 12.3, 1.6, 0.6, 0.9, TM[0], TM[1]);
    _r3Box(m, 19.1, 8.6, 12.3, 1.4, 1.2, 0.8, DK[0], DK[2]);                    /* porch louvre */
    _r3Cone(m, 14.5, 10.6, 14.2, 1.5, 0.7, 1.4, S[2], 16);                      /* door lamp */
    _r3Box(m, 14.5, 9.4, 14.2, 1.8, 1.0, 2.2, RTS_PAL.lit, RTS_PAL.lit);
    /* Two steps, each standing proud of the one in front of it, then the threshold plate. */
    _r3Box(m, 14.5, bkY, 14.3, 11, 1.6, 2.4, C[0], C[3]);
    _r3Box(m, 14.5, bkY, 16.4, 11, 0.8, 2.4, C[0], C[3]);
    _r3Box(m, 9.6, bkY, 15.0, 1.6, 4.4, 1.6, S[3], S[1]);                       /* newels: BOXES.
       As 1.8-wide cylinders both of these fell through the rasteriser - sixteen facets across
       1.8 pixels leaves every span under the half-pixel fill threshold and neither one drew. */
    _r3Box(m, 17.8, bkY, 15.0, 1.6, 4.4, 1.6, S[3], S[1]);
    _r3Box(m, 14.5, 3.6, 13.3, 7.4, 0.4, 2.0, S[2], S[3]);                      /* threshold */
    _r3Box(m, 13.7, 5.4, 15.0, 8.2, 0.5, 0.6, DK[1], DK[3]);                    /* chain rail */

    /* ---- kit store, standing off in the yard as its own shed. A second, lower pitched roof in
       front of the main one is most of what stops the silhouette being a single triangle. Note
       it also occludes the whole left half of the verandah in screen space, so nothing small
       gets placed behind it. */
    _r3Box(m, -13.5, 0, 17.5, 16.5, 3.4, 10, C[0], C[3]);                       /* its pad */
    _r3Slab(m, -13.5, 3.4, 17.5, 15, 5.6, 8.6, 1.6, B.wall, B.roof);
    _r3Gable(m, -13.5, 9.0, 17.5, 16.5, 5.0, 10.2, B.roof);
    for (var bk8 = 0; bk8 < 3; bk8++) {                                         /* tile courses */
      var bkKz = 21.4 - bk8 * 1.5;
      _r3Box(m, -13.5, 9 + (22.6 - bkKz) / 5.1 * 5.0 - 1.2, bkKz, 15.5, 1.4, 1.4, DK[0], B.roof);
    }
    _r3Box(m, -13.5, 8.6, 22.7, 16.5, 1.1, 1.4, DK[0], DK[2]);                  /* eaves board */
    _r3Box(m, -13.5, 11.6, 20.0, 2.4, 1.8, 1.6, DK[0], DK[1]);                  /* roof vent */
    _r3Box(m, -13.5, 13.3, 17.5, 9, 1.4, 2.0, B.trim, C[3]);                    /* ridge cap */
    _r3Box(m, -13.5, 13.6, 17.5, 5, 1.5, 2.4, TM[0], TM[1]);                    /* owner patch */
    _r3Cyl(m, -19.0, 12.6, 17.5, 1.3, 3.6, S[1], DK[1], 16);                    /* its flue */
    _r3Cyl(m, -19.0, 16.2, 17.5, 1.9, 1.2, S[2], S[1], 16);
    _r3Box(m, -15.5, 3.4, 22.0, 8.5, 5.4, 1.5, DK[0], DK[1]);                   /* kit hatch */
    for (var bk9 = 0; bk9 < 3; bk9++)
      _r3Box(m, -15.5, 4.6 + bk9 * 1.7, 22.4, 7.6, 1.5, 1.5, S[2], S[3]);       /* shutter slats */
    _r3Box(m, -15.5, 8.8, 22.1, 10, 1.5, 1.7, bkHZ[0], bkHZ[1]);                /* hazard lintel */
    bkWin(-8.0, 5.0, 21.9, 2.8, 2.8);
    _r3Box(m, -15.5, 11.3, 23.2, 1.8, 0.6, 1.4, S[3], S[1]);                    /* hatch lamp */
    _r3Box(m, -15.5, 10.5, 23.2, 1.4, 0.8, 1.2, RTS_PAL.lit, RTS_PAL.lit);

    /* ---- the flag: dark thin pole, small team pennant, standing off to one side. A fat pale
       mast up the centre split the sprite in two, and a three-panel rectangular flag was a
       team-coloured slab lying across the roof rather than a flag on a pole. It hangs tall and
       narrow rather than streaming wide, and it flies high, because everything forward of the
       wall drops DOWN the screen as its z rises - lower on the pole and the flag lands square on
       a dormer, wider and it lands on the chimney. There is no base collar: the pole rises from
       behind the kit store, which hides anything at ground level here. */
    _r3Cyl(m, -19.0, bkY, 10.0, 0.8, 30.6, DK[1], DK[3], 16);
    _r3Cone(m, -19.0, 32.6, 10.0, 1.2, 0.2, 1.8, C[3], 16);                     /* finial */
    _r3Box(m, -16.7, 23.4, 10.0, 4.0, 7.2, 1.5, TM[0], TM[1]);                  /* the colours */
    _r3Box(m, -14.1, 24.4, 10.0, 1.6, 5.2, 1.5, TM[1], TM[3]);                  /* its fly edge */

    /* ---- the yard, held to four objects and spread across the frontage rather than stacked up
       the middle: revetment centre, sentry box and drums right, kit store and flag left. */
    bkBags(-4.0, 20.8, 3.9, 3, 2);
    _r3Box(m, 21, 0, 20.4, 5.4, bkY + 1.2, 5.4, C[0], C[3]);                    /* sentry box */
    _r3Slab(m, 21, 3.2, 20.4, 4.6, 7.0, 4.6, 1.2, B.wall, B.roof);
    _r3Cone(m, 21, 10.2, 20.4, 2.8, 0.6, 2.6, B.roof, 16);
    _r3Box(m, 21, 4.4, 22.6, 2.6, 5.6, 1.4, DK[0], DK[1]);
    _r3Box(m, 21, 9.6, 22.7, 4.6, 1.5, 1.5, TM[0], TM[1]);
    _r3Box(m, 21, 11.3, 23.0, 2.0, 0.6, 1.6, S[3], S[1]);                       /* its lamp */
    _r3Box(m, 21, 10.4, 23.0, 1.6, 0.9, 1.4, RTS_PAL.lit, RTS_PAL.lit);
    _r3Cyl(m, 21.6, bkY, 6.6, 1.9, 4.0, bkDT[0], bkDT[2], 16);                  /* rain butt */
    _r3Cyl(m, 21.6, bkY + 4.0, 6.6, 2.0, 0.8, DK[1], DK[3], 16);
    for (var bka = 0; bka < 2; bka++) {                                         /* fuel drums */
      var bkDx = bka ? 16.4 : 12.6;
      _r3Cyl(m, bkDx, bkY, 20.6, 1.9, 4.4, bka ? S[1] : bkHZ[0], S[3], 16);
      _r3Cyl(m, bkDx, bkY + 4.4, 20.6, 2.0, 1.1, DK[1], DK[3], 16);
    }
  } else if (key === 'factory') {
    /* War Factory: a long clear-span shed under a saw-tooth roof, with a shutter big enough to
       drive a tank through and a portal crane standing clear of the front. Three things have
       to read instantly - the DOOR, because this is where vehicles come from; the CRANE,
       because nothing else in the base has a frame standing off its own roof and that is the
       silhouette that names the building from across the map; and the saw-tooth, which is the
       one roof form in the set that says "workshop" rather than "shed". The right-hand third
       steps down into a fabrication annexe with an open welding bay, so the thing is not one
       72-wide rectangle. Most of the budget goes on the roof: with screenY = z - 1.3y the roof
       is simply the largest surface the camera can see, so the extract fans, the duct run and
       the stack bank are worth more than any wall would be. Stock, drums and a half-built hull
       sit out on the apron - a war factory with an empty forecourt reads as a warehouse.

       THE RULE THIS MODEL IS BUILT AROUND. screenY = z - 1.3y means anything nearer the camera
       hides a band of everything behind it 1.3 times its own height - a 5-tall box at z=10
       buries every detail within 6.5 units of depth behind it. So the plant is laid out as ONE
       tall row at the back of the roof deck with only low things in front of it, the welding
       bay is left open rather than roofed, and nothing is mounted flat against a face that
       something else already stands proud of. Every part that failed that test was measured
       owning zero output pixels and has been moved or cut rather than left in as ballast. */
    var fGY = 1.6;                                          /* the apron everything stands on */
    var fHX = -10, fHW = 48, fHZ = -4, fHD = 34, fHH = 20;  /* main hall */
    var fHT = fGY + fHH;                                    /* hall eaves */
    var fAX = 25, fAW = 20, fAZ = -8, fAD = 26, fAH = 13;   /* fabrication annexe */
    var fAT = fGY + fAH;
    var fa0, fa1, fb1, fc0, fc1, fc2, fd0, fe0, fe1, ff0, fg1, fg2, fg3;
    var fh0, fi0, fi1, fj1, fk0, fk1, fk2, fk3, fl0, fl1, fl2, fm0;

    /* A railing is a continuous top rail plus posts. Posts alone vanish at this size and the
       rail alone reads as a kerb - it only works as both. */
    var fRail = function (x0, x1, y, z, n) {
      var q;
      for (q = 0; q < n; q++)
        _r3Box(m, x0 + (x1 - x0) * q / (n - 1), y, z, 1.2, 3.4, 1.2, S[2], S[1]);
      _r3Box(m, (x0 + x1) / 2, y + 3.4, z, x1 - x0 + 1.6, 1.0, 1.5, S[0], S[3]);
    };
    /* Extractor: a drum with a cowl that flares UPWARD. The first cut tapered the other way
       over a thin stalk, and the wide bottom rim then projected down the screen across the
       stalk and most of the drum - the "gap under the cap" it was built for cannot exist under
       this camera, so the cowl carries the shape on its own. */
    var fFan = function (x, y, z, r, h) {
      _r3Cyl(m, x, y, z, r, h, S[1], S[0], 18);
      _r3Cone(m, x, y + h, z, r * 0.6, r * 1.15, 2.6, S[3], 18);
    };
    var fDrum = function (x, y, z, c) {
      _r3Cyl(m, x, y, z, 1.9, 5.2, c, S[3], 16);
      _r3Cyl(m, x, y + 5.2, z, 2.1, 0.9, S[1], S[0], 16);
    };
    /* Crated stock. The strap band round the middle is the only thing separating a crate from
       a brown box, so every stack gets one. */
    var fCrate = function (x, y, z, w, h, d, c0, c1) {
      _r3Box(m, x, y, z, w, h, d, c0, c1);
      _r3Box(m, x, y + h * 0.4, z, w + 0.6, 1.0, d + 0.6, DK[1], DK[2]);
    };

    /* ---------------------------------------------------------------- apron ---- */
    _r3Box(m, 0, 0, 0, W - 2, fGY, D - 2, C[2], C[0]);                    /* hardstanding */
    _r3Box(m, 0, fGY, 19.4, W - 10, 0.5, 7.2, C[1], C[3]);                /* drive lane */
    /* The chevrons stop short of the threshold: run back to the door they cover the bottom of
       both jambs, which are hazard-striped already and are the taller cue. */
    for (fa0 = 0; fa0 < 5; fa0++)                                         /* exit chevrons */
      _r3Box(m, -21 + fa0 * 6, fGY + 0.5, 19.4, 4.0, 0.4, 7.2, RTS_PAL.hazard[0], RTS_PAL.hazard[0]);
    _r3Box(m, 0, fGY, 22.6, W - 4, 1.3, 1.5, DK[1], DK[2]);               /* kerb at the pad edge */
    for (fa1 = 0; fa1 < 2; fa1++)                                         /* bollards on the mouth */
      _r3Cyl(m, -22 + fa1 * 24, fGY, 21.9, 1.5, 4.8, RTS_PAL.hazard[0], DK[1], 16);

    /* ------------------------------------------------------- hall shell & face ----
       No cladding ribs on this face: eleven of them were mounted 1.6 proud of the wall and
       every one measured zero pixels, because the door, the clerestory and the ladder all
       stand further out and the ribs sat in their shadow. The face is banded horizontally
       instead - gutter, team band, glazing, hazard, door - which is what actually survives. */
    _r3Box(m, fHX, fGY, fHZ, fHW, fHH, fHD, B.wall, B.dark);              /* clear-span hall */
    pilasters(13.9, fGY, fHX, 2, fHW - 4, 5.0, fHH - 1.2);                /* corner piers */
    winRow(14.4, 16.0, fHX, 8, 5.6, 4.2, 3.4);                            /* clerestory band */
    for (fb1 = 0; fb1 < 5; fb1++)                                         /* its mullions */
      _r3Box(m, -21.2 + fb1 * 5.6, 15.8, 14.7, 1.5, 3.8, 1.4, S[2], S[1]);
    _r3Box(m, fHX, fHT - 1.8, 13.8, fHW - 1, 1.5, 2.5, TM[0], TM[1]);     /* team eaves band */
    _r3Box(m, fHX, fHT - 0.3, 13.8, fHW - 1, 1.0, 3.0, C[3], C[1]);       /* gutter */

    /* ------------------------------------------------------------ roller door ----
       A deep canopy was tried over this and had to go: height projects straight up the
       screen, so anything that sticks 6 units out of the wall covers 8 rows of the wall
       ABOVE it - the canopy ate the door head, the team band and half the clerestory and
       gave back one grey bar. The hood here is only as deep as it has to be to cast a line. */
    _r3Box(m, -10, fGY, 14.2, 31, 12.6, 2.4, B.dark, DK[2]);              /* reveal */
    _r3Box(m, -10, fGY + 0.6, 14.9, 26, 11, 2.2, DK[1], DK[2]);           /* shutter */
    for (fc0 = 0; fc0 < 5; fc0++)                                         /* its slats */
      _r3Box(m, -10, fGY + 1.2 + fc0 * 2.2, 15.6, 25, 1.6, 1.5,
             fc0 % 2 ? S[1] : DK[2], S[3]);
    _r3Box(m, -10, fGY + 11.6, 15.4, 30, 1.6, 3.0, TM[0], TM[1]);         /* door head */
    _r3Box(m, -10, fGY + 13.2, 15.6, 30, 1.1, 3.4, RTS_PAL.hazard[0], RTS_PAL.hazard[0]);
    for (fc1 = 0; fc1 < 2; fc1++) {
      _r3Box(m, -25 + fc1 * 30, fGY, 15.2, 3.4, 13.2, 2.8, C[0], C[3]);   /* jambs */
      for (fc2 = 0; fc2 < 4; fc2++)                                       /* striped to be hit */
        _r3Box(m, -25 + fc1 * 30, fGY + 1.2 + fc2 * 2.9, 15.8, 3.6, 1.6, 2.2,
               RTS_PAL.hazard[0], RTS_PAL.hazard[0]);
    }
    /* Exit floods sit ON the door head, not out in front of the opening: mounted proud at
       mid-height they hung two bright squares in the middle of the shutter and cut the one
       shape that has to read as a single dark rectangle. */
    for (fd0 = 0; fd0 < 2; fd0++) {
      _r3Box(m, -19 + fd0 * 18, fGY + 14.4, 16.6, 1.6, 1.2, 2.6, S[3], S[2]);
      _r3Box(m, -19 + fd0 * 18, fGY + 15.4, 17.4, 3.2, 1.6, 2.4, RTS_PAL.lit, RTS_PAL.lit);
    }

    /* -------------------------------------------------------- portal crane ----
       The girder has to clear the eaves by a clear band of roof. Sitting it just above the
       gutter - the obvious height - made it read as one more fascia stripe on the building
       rather than as a separate frame standing in front of it. The trolley is parked at the
       RIGHT end, over the drum store: run out to mid-span its rope and hook hang down the
       centre of the shutter and split the door in two, and parked at the left end the trolley
       body covers the water tank and half the roof deck behind it. It also has to clear its own
       LEG - sat on top of one, the leg is nearer than the rope and swallows the fall whole. */
    for (fe0 = 0; fe0 < 2; fe0++) {
      _r3Box(m, -27 + fe0 * 34, fGY, 20.2, 3.2, 37, 3.2, S[0], S[1]);     /* legs */
      _r3Box(m, -27 + fe0 * 34, fGY + 12, 20.2, 5.2, 1.6, 4.4, S[0], S[3]);
      _r3Box(m, -27 + fe0 * 34, fGY + 26, 20.2, 5.2, 1.6, 4.4, S[0], S[3]);
    }
    for (fe1 = 0; fe1 < 7; fe1++)                                         /* web, hung below the
                                                                             girder: level with it
                                                                             the girder's own face
                                                                             covers every bar */
      _r3Box(m, -28 + fe1 * 6, fGY + 32.8, 20.2, 1.6, 4.2, 3.2, S[3], S[2]);
    _r3Box(m, -9.5, fGY + 37, 20.2, 45, 3.4, 4.4, S[0], S[1]);            /* girder */
    _r3Box(m, -10, fGY + 38.6, 20.2, 30, 1.6, 4.8, TM[0], TM[1]);         /* team stripe on it */
    _r3Box(m, 10.2, fGY + 31.6, 20.2, 8.5, 4.6, 5.6, S[1], S[0]);         /* hoist trolley */
    _r3Box(m, 10.2, fGY + 27.0, 20.2, 1.1, 4.6, 1.1, DK[2], DK[0]);       /* fall rope */
    _r3Box(m, 10.2, fGY + 23.4, 20.2, 6.4, 3.6, 4.4, S[0], S[3]);         /* hook block */
    _r3Box(m, 10.2, fGY + 21.0, 20.2, 2.4, 2.4, 2.4, DK[1], DK[3]);       /* the hook */
    for (fm0 = 0; fm0 < 3; fm0++) {                                       /* floods slung under it */
      _r3Box(m, -25 + fm0 * 12, fGY + 34.6, 22.0, 2.0, 2.4, 2.0, S[3], S[2]);
      _r3Box(m, -25 + fm0 * 12, fGY + 33.0, 22.4, 3.2, 1.6, 2.4, RTS_PAL.lit, RTS_PAL.lit);
    }

    /* --------------------------------------------------------- saw-tooth roof ----
       The north light rides high on each slope, a couple of units below its own ridge cap.
       Down at the eaves - where a rooflight belongs - the next tooth in front of it covers
       the glass completely and all three measured zero. */
    for (ff0 = 0; ff0 < 3; ff0++) {
      var ffz = -17.5 + ff0 * 7;
      _r3Gable(m, fHX, fHT, ffz, fHW - 2, 7.5, 7, ff0 === 1 ? B.dark : B.roof);
      _r3Box(m, fHX, fHT + 7.2, ffz, fHW - 5, 1.0, 1.5, S[1], S[3]);      /* ridge cap */
      _r3Box(m, fHX, fHT + 3.6, ffz + 2.0, fHW - 13, 2.2, 2.0,            /* north light */
             RTS_PAL.glass, RTS_PAL.glass);
    }
    _r3Box(m, fHX, fHT, 0.4, fHW - 2, 1.2, 1.8, S[2], S[3]);              /* valley gutter */

    /* ------------------------------------------------------------- roof plant ----
       The near half of the roof is left flat on purpose: the saw-tooth is the form, but a
       saw-tooth has nowhere to stand anything, and roof plant is the detail this camera
       actually sees. ONE tall row at the back - tank, fans, air handler - and everything in
       front of it kept under three units high, because the duct used to run at head height
       here and buried all three fan drums and half the tank behind it. */
    _r3Box(m, fHX, fHT, 6.6, fHW - 3, 0.6, 12, C[2], C[0]);               /* plant deck */
    _r3Cyl(m, -28, fHT + 0.6, 4.2, 4.4, 8.4, S[2], S[1], 18);             /* water tank, sat on the
                                                                             deck: a leg under a
                                                                             9-wide drum projects
                                                                             behind it and nothing
                                                                             of the frame survives */
    _r3Cyl(m, -28, fHT + 9.0, 4.2, 4.6, 1.2, C[3], C[1], 18);             /* its pale lid */
    _r3Box(m, -28, fHT + 10.2, 4.2, 1.6, 2.6, 1.6, S[3], S[2]);           /* filler pipe */
    for (fg1 = 0; fg1 < 3; fg1++)                                         /* extract fans */
      fFan(-17 + fg1 * 7.2, fHT + 0.6, 3.8, 3.0, 5.6);
    _r3Box(m, 6, fHT + 0.6, 3.8, 11, 6.2, 7.4, S[2], S[1]);               /* air handler */
    _r3Box(m, 6, fHT + 6.8, 3.8, 9.4, 1.3, 5.8, C[2], C[0]);              /* its pale lid */
    for (fg2 = 0; fg2 < 3; fg2++)                                         /* its louvres */
      _r3Box(m, 6, fHT + 2.4 + fg2 * 1.7, 8.0, 9.4, 1.4, 1.6, DK[2], S[3]);
    _r3Box(m, -7, fHT + 0.6, 9.0, 30, 2.4, 3.4, S[1], S[0]);              /* duct run */
    for (fg3 = 0; fg3 < 4; fg3++)                                         /* its flanges */
      _r3Box(m, -19 + fg3 * 7, fHT + 0.6, 9.0, 1.6, 2.8, 4.2, S[3], S[2]);
    _r3Box(m, -21.5, fHT + 0.6, 9.0, 3.4, 6.4, 3.4, S[1], S[0]);          /* riser at the duct end */
    _r3Box(m, -11, fHT + 0.6, 11.6, 42, 1.4, 3.4, C[1], C[3]);            /* catwalk */
    fRail(-31, 10, fHT + 2.0, 12.9, 8);                                   /* edge railing */
    for (fh0 = 0; fh0 < 2; fh0++) {                                       /* warning lights */
      _r3Cyl(m, -32.6 + fh0 * 31.6, fHT + 0.6, 12.0, 1.1, 5.2, S[2], S[1], 16);
      _r3Cyl(m, -32.6 + fh0 * 31.6, fHT + 5.8, 12.0, 1.3, 1.6, RTS_PAL.hazard[0], RTS_PAL.lit, 16);
    }

    /* -------------------------------------------------------------- stack bank ---- */
    for (fi0 = 0; fi0 < 3; fi0++) {
      var fix = -30 + fi0 * 6.5, fih = 14 - fi0 * 3.4;
      _r3Cyl(m, fix, fHT + 2, -13, 2.6, fih, S[0], DK[2], 18);
      _r3Cyl(m, fix, fHT + 7, -13, 2.9, 1.6, RTS_PAL.hazard[0], DK[1], 18);
      _r3Cyl(m, fix, fHT + 2 + fih, -13, 3.1, 1.5, S[3], S[1], 18);       /* rain collar */
      _r3Cyl(m, fix, fHT + 3.5 + fih, -13, 2.1, 1.6, DK[2], DK[0], 16);   /* sooty mouth */
    }
    _r3Box(m, -23.5, fHT + 4.4, -13, 20, 2.6, 2.8, S[1], S[0]);           /* manifold */

    /* ------------------------------------------------------ fabrication annexe ---- */
    _r3Box(m, fAX, fGY, fAZ, fAW, fAH, fAD, B.wall, B.dark);
    _r3Gable(m, fAX, fAT, fAZ, fAW + 1, 6.5, fAD + 1, B.roof);
    _r3Box(m, fAX, fAT + 6.2, fAZ, fAW - 4, 1.1, 1.6, S[1], S[3]);        /* ridge cap */
    for (fi1 = 0; fi1 < 2; fi1++)                                         /* annexe extracts */
      fFan(19.5 + fi1 * 8, fAT + 3.4, fAZ + 4.6, 2.2, 3.2);
    _r3Box(m, fAX, fAT + 5.6, fAZ - 1.4, fAW - 5, 1.2, 3.0, C[1], C[3]);  /* ridge walkway */
    _r3Box(m, fAX, fAT + 2.4, fAZ + 8.0, fAW - 8, 1.7, 1.6, RTS_PAL.glass, RTS_PAL.glass);
    _r3Box(m, fAX, fAT + 4.6, fAZ - 5.6, fAW - 8, 1.7, 1.6, RTS_PAL.glass, RTS_PAL.glass);
    _r3Cyl(m, 32.6, fAT + 3.4, fAZ - 7.0, 1.1, 9.0, S[2], S[1], 16);      /* aerial */
    _r3Box(m, 32.6, fAT + 8.0, fAZ - 7.0, 5.0, 1.2, 1.5, S[3], S[2]);
    _r3Box(m, 32.6, fAT + 10.2, fAZ - 7.0, 3.6, 1.2, 1.5, S[3], S[2]);
    _r3Cyl(m, 32.6, fAT + 12.4, fAZ - 7.0, 1.3, 1.6, RTS_PAL.lit, RTS_PAL.lit, 16);
    pilasters(5.9, fGY, fAX, 2, fAW - 3, 4.4, fAH - 1.2);
    winRow(6.2, fGY + 7.4, fAX, 3, 6.0, 4.2, 3.2);
    _r3Box(m, fAX, fAT - 1.6, 5.8, fAW - 1, 1.3, 2.3, TM[0], TM[1]);      /* team eaves band */

    /* --------------------------------------------------------- welding bay ----
       Open to the front on purpose. A lean-to over this bay projects straight down the screen
       across everything under it, and with the roof on, the bench, the bottles, the flash and
       the hull's turret ring all measured zero - the bay was a grey slab with a blue box under
       it. A high head beam on two posts frames the same volume and you can see into it. */
    for (fj1 = 0; fj1 < 2; fj1++)
      _r3Box(m, 15.6 + fj1 * 18.8, fGY, 13.2, 1.8, 12.0, 1.8, S[2], S[1]); /* posts */
    _r3Box(m, 25, fGY + 12.0, 13.2, 21.4, 1.4, 2.6, S[2], S[1]);          /* head beam */
    _r3Box(m, 25, fGY + 11.2, 13.9, 21.4, 1.0, 1.5, TM[0], TM[1]);        /* its fascia */
    _r3Box(m, 19, fGY + 0.8, 7.6, 9.5, 3.2, 5.6, TM[0], TM[1]);           /* half-built hull */
    _r3Box(m, 19, fGY + 4.0, 7.6, 8.5, 1.6, 4.6, TM[1], TM[3]);           /* its deck plate */
    _r3Cyl(m, 19.6, fGY + 5.6, 7.9, 2.4, 1.6, S[2], S[1], 16);            /* its turret ring */
    _r3Box(m, 19, fGY, 10.8, 9.5, 2.6, 1.8, DK[0], DK[1]);                /* the near track only -
                                                                             the far one sits behind
                                                                             the hull and cannot be
                                                                             seen at all */
    _r3Box(m, 30.5, fGY + 0.8, 7.4, 8.5, 3.4, 3.2, S[2], S[1]);           /* bench */
    _r3Box(m, 30.5, fGY + 4.2, 7.4, 9.0, 1.0, 3.6, S[0], S[3]);
    _r3Box(m, 29.4, fGY + 4.2, 10.6, 2.4, 1.8, 2.4, RTS_PAL.lit, RTS_PAL.lit);  /* weld flash */
    _r3Box(m, 29.4, fGY + 6.0, 10.6, 1.2, 3.0, 1.2, DK[1], DK[3]);        /* its torch lead */
    for (fk0 = 0; fk0 < 3; fk0++)                                         /* gas bottles */
      _r3Cyl(m, 22.4 + fk0 * 1.9, fGY + 0.8, 11.4, 0.9, 5.2,
             fk0 === 1 ? RTS_PAL.hazard[0] : S[1], S[3], 16);

    /* ------------------------------------------------- pipes, ladder, stock ---- */
    for (fk1 = 0; fk1 < 2; fk1++) {                                       /* risers up the face */
      _r3Cyl(m, -32.8 + fk1 * 2.6, fGY, 14.4, 1.1, fHH - 1, S[1], S[0], 16);
      _r3Box(m, -32.8 + fk1 * 2.6, fHT - 2.4, 14.4, 2.6, 2.4, 2.6, S[0], S[3]);  /* elbow */
    }
    for (fk2 = 0; fk2 < 2; fk2++)                                         /* pipe clamps */
      _r3Box(m, -30.2, fGY + 9 + fk2 * 6, 14.8, 8.4, 1.5, 2.6, S[3], S[2]);
    _r3Box(m, 11.2, fGY, 14.6, 1.4, fHH, 1.5, S[2], S[1]);                /* ladder rails */
    _r3Box(m, 13.4, fGY, 14.6, 1.4, fHH, 1.5, S[2], S[1]);
    for (fl0 = 0; fl0 < 4; fl0++)                                         /* rungs, proud of the
                                                                             cage or they vanish */
      _r3Box(m, 12.3, fGY + 3.4 + fl0 * 4.4, 15.9, 3.4, 1.0, 1.8, S[3], S[2]);
    for (fl1 = 0; fl1 < 3; fl1++)                                         /* its safety cage */
      _r3Box(m, 12.3, fGY + 5.6 + fl1 * 4.4, 15.5, 4.6, 1.2, 1.6, S[3], S[2]);
    for (fl2 = 0; fl2 < 3; fl2++)                                         /* plate stock, banded */
      fCrate(-30.4, fGY + fl2 * 2.3, 19.2, 9.4, 2.3, 5.4, fl2 % 2 ? S[2] : S[1], S[0]);
    fCrate(18.6, fGY, 16.0, 8.6, 3.4, 4.2, RTS_PAL.dirt[0], RTS_PAL.dirt[3]);
    fCrate(27.6, fGY, 16.0, 7.6, 4.4, 4.2, S[2], S[1]);
    for (fk3 = 0; fk3 < 5; fk3++)                                         /* finished road wheels */
      _r3Cyl(m, (fk3 < 3 ? 17.6 + fk3 * 4.6 : 19.9 + (fk3 - 3) * 4.6),
             fGY + (fk3 < 3 ? 0 : 2.5), 20.8, 2.6, 2.5, DK[1], S[3], 16);
    _r3Cyl(m, 32.0, fGY, 19.8, 3.4, 9.0, S[2], S[1], 18);                 /* fuel tank */
    _r3Cyl(m, 32.0, fGY + 3.0, 19.8, 3.6, 1.4, RTS_PAL.hazard[0], DK[1], 18);
    _r3Cyl(m, 32.0, fGY + 9.0, 19.8, 3.6, 1.1, S[0], S[3], 18);
    _r3Box(m, 32.0, fGY + 10.1, 19.8, 1.5, 3.0, 1.5, S[3], S[2]);
    fDrum(6.4, fGY, 20.6, RTS_PAL.hazard[0]);                             /* drums: parked right of
                                                                             the mouth, clear of the
                                                                             plate stock they used to
                                                                             stand in front of */
    fDrum(10.0, fGY, 20.6, S[1]);
    fDrum(13.6, fGY, 20.6, RTS_PAL.hazard[0]);
  } else if (key === 'radar') {
    /* Radar Dome: a banded radome on a concrete drum, riding a stepped blockhouse - a plant
       wing to the right, a low entrance hall across the front, an open service yard at the
       front right. The dome is the only sphere anywhere in a base and it is deliberately the
       tallest thing on the plot, because this is the structure a player has to pick out of
       his own base at a glance and the one an attacker has to be able to aim at. So it is
       pale concrete and everything beneath it is kept low, boxy and darker: nothing is
       allowed to compete with that silhouette. Team colour goes on a band across the core,
       the drum collar and the roller shutter, NOT on the dome - painting the radome would
       throw away the one bright mass that makes the building findable. The fans, stacks,
       ducting, cable trays and the transformer bank in the yard are the "this thing eats 40
       power" read, and the steerable array on the hall roof is there so the building still
       says RADAR even when the dome is mistaken for a fuel tank. */
    var rd0, rd1, rd2, rd3, rd4;
    /* A guard rail as a run rather than a rectangle: uprights along one axis plus a single
       long top bar. The BACK runs are the ones that pay - height projects straight up, so a
       rail behind the roof deck stands clear above the roof line while the front run is
       half-buried in it. */
    var rdRun = function (qx, qy, qz, qw, qd, n) {
      var k;
      for (k = 0; k < n; k++) {
        _r3Box(m, qx + (n > 1 ? (k / (n - 1) - 0.5) * qw : 0), qy,
               qz + (n > 1 ? (k / (n - 1) - 0.5) * qd : 0), 1.3, 3.3, 1.3, S[2], S[3]);
      }
      _r3Box(m, qx, qy + 3.3, qz, qw + 1.5, 1.0, qd + 1.5, S[3], S[3]);
    };
    /* Two stringers and rungs. Every roof up here is reachable, and a ladder is the cheapest
       thing that tells the eye how tall a wall is. */
    var rdLadder = function (qx, qy, qz, qh) {
      var k, n = Math.max(2, Math.round(qh / 2.4));
      _r3Box(m, qx - 1.7, qy, qz, 1.1, qh, 1.1, S[2], S[3]);
      _r3Box(m, qx + 1.7, qy, qz, 1.1, qh, 1.1, S[2], S[3]);
      for (k = 0; k <= n; k++) _r3Box(m, qx, qy + 0.6 + (k / n) * (qh - 1.6), qz, 4.4, 0.9, 0.9, S[3], S[3]);
    };
    /* Extractor: drum, throat, and a cowl proud of both so the top reads as three stacked
       discs of different diameter instead of one flat circle. */
    var rdFan = function (qx, qy, qz, qr) {
      _r3Cyl(m, qx, qy, qz, qr, 2.6, S[1], S[0], 18);
      _r3Cyl(m, qx, qy + 2.6, qz, qr * 0.68, 1.5, DK[1], DK[0], 18);
      _r3Cyl(m, qx, qy + 4.1, qz, qr * 1.22, 1.0, S[3], S[3], 18);
    };
    var rdStack = function (qx, qy, qz, qr, qh) {
      _r3Cyl(m, qx, qy, qz, qr * 1.7, 1.3, S[2], S[1], 16);
      _r3Cyl(m, qx, qy + 1.3, qz, qr, qh, S[1], DK[1], 16);
      _r3Cyl(m, qx, qy + 1.3 + qh, qz, qr * 1.55, 1.0, DK[1], DK[0], 16);
    };
    var rdDrum = function (qx, qy, qz, qc) {
      _r3Cyl(m, qx, qy, qz, 1.9, 4.4, qc, S[3], 16);
      _r3Cyl(m, qx, qy + 1.1, qz, 2.1, 0.8, DK[1], DK[1], 16);
      _r3Cyl(m, qx, qy + 2.7, qz, 2.1, 0.8, DK[1], DK[1], 16);
    };

    /* ---- ground: one poured apron, a striped kerb and bollards at the vehicle edge ---- */
    _r3Box(m, 0, 0, 0, W - 1, 1.4, D - 1, C[2], C[0]);
    for (rd0 = 0; rd0 < 9; rd0++) {
      _r3Box(m, -20 + rd0 * 5, 1.4, 22.4, 4.4, 0.7, 2.6,
             RTS_PAL.hazard[rd0 % 2], RTS_PAL.hazard[rd0 % 2]);
    }
    for (rd0 = 0; rd0 < 5; rd0++) _r3Cyl(m, -19 + rd0 * 5.5, 1.4, 20.6, 1.1, 3.4, S[2], RTS_PAL.hazard[0], 16);

    /* ---- the core, back left: the mass the dome stands on ---- */
    _r3Box(m, -6, 0.6, -8.5, 34, 1.2, 27, C[2], C[1]);              /* plinth */
    _r3Slab(m, -6, 1.4, -8.5, 32, 15, 25, 3, B.wall, B.roof);       /* wall face at z = 4 */
    /* Only the top third of this wall clears the entrance hall in front of it, so all of the
       facade detail is packed into that band and none is wasted below the roof line. */
    pilasters(4.7, 6.0, -6, 5, 6.8, 2.6, 7.4);
    winRow(4.9, 7.8, -6, 4, 6.8, 3.8, 3.0);
    _r3Box(m, -6, 11.1, 4.8, 31, 0.5, 1.8, DK[0], DK[0]);           /* band shadow lip */
    _r3Box(m, -6, 11.6, 4.9, 31, 2.0, 1.8, TM[1], TM[3]);           /* team band */
    _r3Box(m, -21.2, 6.0, 4.7, 2.4, 7.4, 1.6, B.trim, B.trim);      /* corner trim */
    _r3Box(m, 9.2, 6.0, 4.7, 2.4, 7.4, 1.6, B.trim, B.trim);
    _r3Cyl(m, -18.6, 2.0, 5.2, 1.1, 12.6, S[1], S[3], 16);          /* riser pipes to the roof */
    _r3Cyl(m, -16.2, 2.0, 5.2, 1.1, 12.6, S[1], S[3], 16);
    _r3Box(m, -17.4, 14.6, 4.4, 6.2, 1.6, 2.6, S[2], S[1]);         /* elbow onto the deck */
    _r3Box(m, -17.4, 15.4, 2.0, 6.2, 1.3, 4.0, S[2], S[3]);
    /* Cable tray under the eaves. It cannot go on the roof deck: the fan cowls stand 4 above
       that deck and their discs cover the whole strip behind them, so a 1.1-tall tray up there
       paints nothing. On the wall it lands in the one band of facade above the team stripe. */
    _r3Box(m, -3.0, 14.2, 5.0, 22.0, 1.1, 1.8, S[2], S[3]);
    for (rd0 = 0; rd0 < 6; rd0++) _r3Box(m, -12.5 + rd0 * 4.0, 15.3, 4.9, 1.4, 0.9, 2.0, DK[1], DK[1]);
    rdLadder(2.0, 2.0, 4.9, 14.4);

    /* ---- core roof deck: x -19..7, z -18..1, top at 16.4. The dome eats the left of it, so
       the plant is stacked down the free strip on the right where it is not hidden. ---- */
    rdFan(3.6, 16.4, -13.0, 2.6);
    rdFan(3.6, 16.4, -4.0, 2.6);
    rdStack(3.6, 16.4, -8.6, 1.3, 5.4);
    _r3Box(m, 4.2, 16.4, 0.0, 5.0, 1.6, 3.4, DK[1], DK[0]);         /* roof hatch */
    _r3Box(m, 4.2, 18.0, -0.6, 5.4, 0.6, 2.6, S[3], S[3]);
    rdRun(-6, 16.4, 1.0, 26, 0, 8);
    rdRun(7, 16.4, -8.5, 0, 19, 7);
    _r3Cyl(m, 6.4, 16.4, -17.4, 1.0, 3.0, S[2], RTS_PAL.lit, 16);   /* corner warning light */

    /* ---- the drum, the gantry and the radome ---- */
    _r3Cone(m, -9, 16.0, -10, 12.6, 11.0, 1.2, C[2], 24);           /* skirt off the deck */
    _r3Cyl(m, -9, 17.2, -10, 11.0, 3.4, C[0], C[1], 24);            /* drum */
    /* The team collar IS the gantry deck ring. A separate painted band part-way up the drum
       does not work: this ring overhangs the drum by 1.7, and an overhang that deep buries
       everything within 2.2 of height below it, so the band was a 24-sided cylinder painting
       nothing at all. Put the colour on the ring itself and it lands where it was wanted -
       one bright arc directly under the radome. */
    _r3Cyl(m, -9, 19.2, -10, 12.7, 1.2, TM[1], TM[3], 24);          /* team collar / gantry deck */
    for (rd0 = 0; rd0 < 18; rd0++) {
      rd1 = rd0 / 18 * Math.PI * 2;
      _r3Box(m, -9 + Math.cos(rd1) * 12.1, 20.4, -10 + Math.sin(rd1) * 12.1, 1.3, 3.2, 1.3, S[2], S[3]);
    }
    _r3Cyl(m, -9, 23.6, -10, 12.7, 0.9, S[3], S[3], 24);            /* gantry hand rail */
    /* Up the FRONT of the drum. Anywhere behind the gantry deck ring is under a 25-wide disc
       and invisible - a ladder tucked against the back of the drum is six parts of nothing. */
    rdLadder(-9.0, 16.4, 3.5, 7.2);
    /* Eleven latitude bands of truncated cone with a seam ring between each, in two concrete
       tones. A single smooth pale hemisphere shades as one soft gradient and reads as a
       balloon; banding it gives the light something to break on, which is what makes it look
       like a panelled radome. 24-sided because this is the largest curved surface in the game
       and any facetting on it is visible from the map view. */
    for (rd0 = 0; rd0 < 11; rd0++) {
      rd1 = Math.cos(rd0 / 11 * Math.PI / 2) * 10.0;
      rd2 = Math.cos((rd0 + 1) / 11 * Math.PI / 2) * 10.0;
      rd3 = 20.4 + Math.sin(rd0 / 11 * Math.PI / 2) * 9.8;
      rd4 = 20.4 + Math.sin((rd0 + 1) / 11 * Math.PI / 2) * 9.8;
      _r3Cone(m, -9, rd3, -10, rd1, rd2, rd4 - rd3, (rd0 % 2) ? C[1] : C[3], 24);
      if (rd0 < 9) _r3Cyl(m, -9, rd4 - 0.4, -10, rd2 + 0.4, 0.8, C[0], C[0], 20);
    }
    for (rd0 = 0; rd0 < 14; rd0++) {                                /* meridian ribs, waist only */
      rd1 = rd0 / 14 * Math.PI * 2;
      _r3Box(m, -9 + Math.cos(rd1) * 9.8, 20.6, -10 + Math.sin(rd1) * 9.8, 1.7, 3.4, 1.7, C[2], C[2]);
    }
    _r3Cyl(m, -9, 29.6, -10, 2.4, 1.4, S[2], S[1], 18);             /* apex collar / hatch */
    for (rd0 = 0; rd0 < 3; rd0++) {                                 /* struts down onto the shell */
      rd1 = (rd0 / 3 + 0.16) * Math.PI * 2;
      _r3Box(m, -9 + Math.cos(rd1) * 2.6, 28.4, -10 + Math.sin(rd1) * 2.6, 1.4, 1.8, 1.4, S[2], S[3]);
    }
    _r3Cyl(m, -9, 31.0, -10, 1.5, 2.0, DK[1], DK[0], 16);           /* mast foot */
    _r3Cyl(m, -9, 33.0, -10, 0.8, 5.0, S[1], S[3], 16);             /* lightning mast */
    _r3Box(m, -9, 35.4, -10, 5.2, 0.9, 0.9, S[3], S[3]);            /* dipole crossarm */
    _r3Box(m, -9, 35.4, -10, 0.9, 0.9, 5.2, S[3], S[3]);
    _r3Cyl(m, -9, 38.0, -10, 1.2, 1.6, RTS_PAL.lit, RTS_PAL.lit, 16);

    /* ---- plant wing, right: shorter than the core so the step reads, and it takes all the
       machinery the core roof has no room for ---- */
    _r3Slab(m, 16.5, 1.4, -8.5, 13, 11, 25, 2.5, B.wall, B.roof);   /* wall face at z = 4 */
    _r3Box(m, 16.5, 5.8, 4.6, 11.8, 4.0, 1.4, DK[1], DK[0]);        /* louvre recess */
    for (rd0 = 0; rd0 < 5; rd0++) _r3Box(m, 16.5, 6.0 + rd0 * 0.8, 5.2, 10.6, 0.5, 1.0, S[2], S[3]);
    _r3Box(m, 16.5, 8.2, 5.0, 11.4, 1.6, 1.8, TM[1], TM[3]);        /* team panel over the louvres */
    _r3Box(m, 11.2, 6.0, 4.7, 2.2, 3.6, 1.6, B.trim, B.trim);
    _r3Box(m, 21.8, 6.0, 4.7, 2.2, 3.6, 1.6, B.trim, B.trim);
    /* wing roof deck: x 12.5..20.5, z -18.5..1.5, top at 12.4 */
    _r3Slab(m, 16.5, 12.4, -3.0, 8.2, 3.6, 8.0, 1.2, S[1], S[0]);   /* air handler */
    for (rd0 = 0; rd0 < 4; rd0++) _r3Box(m, 16.5, 13.0, -6.0 + rd0 * 1.9, 7.4, 0.6, 1.2, DK[1], DK[1]);
    rdFan(16.5, 16.0, -3.0, 2.5);
    _r3Box(m, 16.5, 13.4, -8.6, 4.6, 3.2, 4.4, S[2], S[3]);         /* duct run + elbow */
    _r3Box(m, 16.5, 13.4, -11.6, 4.6, 3.2, 4.0, S[2], S[1]);
    _r3Box(m, 16.5, 15.4, -11.6, 5.2, 1.2, 4.6, S[3], S[3]);
    _r3Box(m, 14.0, 12.4, -14.4, 1.6, 5.4, 1.6, S[2], S[3]);        /* water tank on legs */
    _r3Box(m, 19.0, 12.4, -14.4, 1.6, 5.4, 1.6, S[2], S[3]);
    _r3Box(m, 14.0, 12.4, -17.0, 1.6, 5.4, 1.6, S[2], S[3]);
    _r3Box(m, 19.0, 12.4, -17.0, 1.6, 5.4, 1.6, S[2], S[3]);
    _r3Cyl(m, 16.5, 17.8, -15.7, 3.9, 4.6, C[1], C[0], 20);
    _r3Cone(m, 16.5, 22.4, -15.7, 3.9, 1.4, 1.8, C[0], 20);
    rdStack(13.8, 12.4, 0.6, 1.2, 5.0);
    rdStack(19.2, 12.4, 0.6, 1.2, 5.0);
    rdRun(16.5, 12.4, 1.5, 8, 0, 4);
    rdRun(20.5, 12.4, -8.5, 0, 20, 6);
    _r3Cyl(m, 20.0, 12.4, 1.0, 1.0, 3.0, S[2], RTS_PAL.lit, 16);

    /* ---- entrance hall across the front: the only mass whose whole elevation is visible,
       so it gets the shutter, the canopy and the window runs ---- */
    _r3Slab(m, -9, 1.4, 13, 26, 7, 12, 2, B.wall, B.roof);          /* wall face at z = 19 */
    pilasters(19.7, 1.4, -17.4, 3, 4.6, 2.2, 5.0);
    pilasters(19.7, 1.4, -0.6, 3, 4.6, 2.2, 5.0);
    winRow(19.9, 3.4, -17.4, 2, 4.6, 3.2, 2.6);
    winRow(19.9, 3.4, -0.6, 2, 4.6, 3.2, 2.6);
    _r3Box(m, -9, 1.4, 19.8, 9.6, 6.2, 1.6, DK[1], DK[0]);          /* shutter reveal */
    _r3Box(m, -9, 1.6, 20.5, 7.8, 5.2, 1.4, TM[1], TM[3]);          /* roller shutter */
    for (rd0 = 0; rd0 < 5; rd0++) _r3Box(m, -9, 2.0 + rd0 * 1.0, 21.1, 7.4, 0.6, 0.8, TM[2], TM[0]);
    _r3Box(m, -13.6, 1.6, 20.2, 1.4, 5.4, 1.4, RTS_PAL.hazard[0], RTS_PAL.hazard[0]);
    _r3Box(m, -4.4, 1.6, 20.2, 1.4, 5.4, 1.4, RTS_PAL.hazard[0], RTS_PAL.hazard[0]);
    _r3Box(m, -9, 7.0, 21.0, 12.4, 1.1, 4.6, S[1], S[3]);           /* canopy */
    _r3Box(m, -14.4, 5.6, 20.4, 1.2, 1.6, 3.4, S[2], S[3]);
    _r3Box(m, -3.6, 5.6, 20.4, 1.2, 1.6, 3.4, S[2], S[3]);
    _r3Box(m, -9, 1.4, 21.5, 11.0, 0.6, 4.2, C[3], C[3]);           /* threshold pad */
    _r3Box(m, -9, 2.0, 20.6, 9.6, 0.5, 2.0, C[1], C[3]);
    /* hall roof deck: x -20..2, z 9..17, top at 8.4 */
    rdFan(-17.0, 8.4, 15.0, 2.4);
    rdFan(-1.4, 8.4, 15.0, 2.4);
    _r3Slab(m, -8.0, 8.4, 14.6, 7.6, 2.8, 5.2, 1.0, S[1], S[0]);    /* condenser */
    for (rd0 = 0; rd0 < 4; rd0++) _r3Box(m, -8.0, 8.8, 12.8 + rd0 * 1.2, 7.0, 0.6, 1.0, DK[1], DK[1]);
    _r3Box(m, -12.6, 8.4, 14.8, 4.6, 1.0, 4.4, DK[1], DK[0]);       /* skylight */
    _r3Box(m, -12.6, 9.4, 14.8, 3.8, 0.9, 3.6, RTS_PAL.glass, RTS_PAL.glass);
    rdStack(-4.4, 8.4, 10.6, 1.2, 4.4);
    rdStack(-11.6, 8.4, 10.6, 1.2, 4.4);
    _r3Box(m, -8.0, 8.4, 9.8, 15.0, 1.0, 2.6, S[2], S[3]);          /* pipe manifold */
    for (rd0 = 0; rd0 < 4; rd0++) _r3Cyl(m, -14.0 + rd0 * 4.0, 9.4, 9.8, 1.0, 2.4, S[1], S[3], 16);
    rdRun(-9, 8.4, 17.0, 21, 0, 7);
    /* The steerable air-search array. A radome alone can be read as a tank or a silo; a flat
       rectangular mesh on a turntable cannot be read as anything but radar, and it costs a
       mast, a bearing and seven bars to say so. */
    _r3Cyl(m, -16.6, 8.4, 12.0, 1.7, 6.4, S[1], S[3], 16);
    _r3Cyl(m, -16.6, 14.8, 12.0, 2.5, 1.4, DK[1], DK[0], 18);
    _r3Box(m, -16.6, 16.2, 12.0, 12.2, 1.3, 1.7, S[3], S[3]);
    _r3Box(m, -16.6, 20.1, 12.0, 12.2, 1.3, 1.7, S[3], S[3]);
    for (rd0 = 0; rd0 < 7; rd0++) _r3Box(m, -21.4 + rd0 * 1.6, 16.2, 12.0, 1.2, 3.9, 1.2, S[2], S[1]);
    _r3Box(m, -22.2, 16.2, 12.0, 1.5, 5.2, 1.5, S[1], S[3]);
    _r3Box(m, -11.0, 16.2, 12.0, 1.5, 5.2, 1.5, S[1], S[3]);
    _r3Cyl(m, -16.6, 21.4, 12.0, 1.1, 1.5, RTS_PAL.lit, RTS_PAL.lit, 16);

    /* Front-left apron: a floodlight mast and a sandbag emplacement, because a radar is the
       first thing raided and an undefended one looks like scenery. */
    _r3Cyl(m, -21.0, 1.4, 21.6, 1.0, 8.4, S[2], S[3], 16);
    _r3Box(m, -21.0, 9.8, 22.0, 2.0, 1.4, 2.6, DK[1], DK[0]);
    _r3Box(m, -21.0, 9.4, 23.0, 3.4, 1.4, 1.6, RTS_PAL.lit, RTS_PAL.lit);
    for (rd0 = 0; rd0 < 4; rd0++) {
      _r3Box(m, -17.6 + (rd0 % 2) * 2.6, 1.4 + (rd0 > 1 ? 1.5 : 0), 22.6 - (rd0 > 1 ? 0.5 : 0),
             3.0, 1.6, 2.4, RTS_PAL.bag[rd0 % 2], RTS_PAL.bag[1]);
    }

    /* ---- switchgear bay, front right, and the service yard beside it ---- */
    _r3Slab(m, 13.5, 1.4, 10, 15, 5.5, 10, 1.5, B.wall, B.roof);    /* wall face at z = 15 */
    pilasters(15.7, 1.4, 13.5, 4, 4.4, 2.2, 4.0);
    winRow(15.9, 2.8, 13.5, 3, 4.4, 3.0, 2.4);
    _r3Box(m, 13.5, 5.4, 15.0, 14.0, 1.4, 1.6, TM[1], TM[3]);
    rdStack(9.4, 6.9, 8.4, 1.2, 4.0);
    rdStack(17.6, 6.9, 8.4, 1.2, 4.0);
    rdFan(13.5, 6.9, 8.4, 2.3);
    _r3Box(m, 13.5, 6.9, 12.4, 4.6, 1.5, 3.4, DK[1], DK[0]);        /* roof hatch */
    rdRun(13.5, 6.9, 13.5, 12, 0, 5);
    /* External flight up to the bay roof - a stair is the one piece of industrial furniture
       that reads instantly at this angle, because every tread is a separate lit facet. */
    for (rd0 = 0; rd0 < 7; rd0++) {
      rd1 = 20.0 - rd0 * 0.85; rd2 = 1.0 + rd0 * 0.82;
      _r3Box(m, 13.5, 1.4, rd1, 7.0, rd2, 1.5, C[1], C[3]);              /* tread */
      _r3Box(m, 10.4, 1.4 + rd2, rd1, 1.3, 3.0, 1.5, S[2], S[3]);        /* stepped hand rail */
      _r3Box(m, 16.6, 1.4 + rd2, rd1, 1.3, 3.0, 1.5, S[2], S[3]);
    }
    _r3Box(m, 13.5, 6.9, 14.6, 7.2, 0.8, 2.4, S[3], S[3]);          /* landing */
    rdLadder(19.0, 6.9, 4.9, 5.6);
    /* transformer bank */
    _r3Box(m, 20.0, 1.4, 19.4, 6.4, 5.2, 5.6, S[2], S[1]);
    /* Radiator ribs go on the FRONT of the transformer, not its flanks - the +/-x faces of
       a box are edge-on under this camera and anything hung on them is thrown away. */
    for (rd0 = 0; rd0 < 4; rd0++) _r3Box(m, 20.0, 2.0 + rd0 * 1.2, 22.8, 6.6, 0.8, 1.4, S[0], S[3]);
    for (rd0 = 0; rd0 < 3; rd0++) _r3Cyl(m, 17.8 + rd0 * 2.2, 6.6, 19.4, 0.9, 2.4, C[3], C[1], 16);
    _r3Box(m, 20.0, 9.0, 19.4, 6.8, 0.9, 1.4, S[3], S[3]);
    _r3Box(m, 22.4, 1.4, 16.0, 1.6, 6.0, 1.6, S[1], S[3]);          /* cable riser to the wing */
    _r3Box(m, 22.4, 7.0, 12.0, 1.6, 1.2, 6.0, S[2], S[3]);
    /* drums, reels, crates */
    rdDrum(6.2, 1.4, 18.4, RTS_PAL.hazard[0]);
    rdDrum(6.6, 1.4, 21.4, S[0]);
    rdDrum(9.2, 1.4, 21.4, RTS_PAL.hazard[0]);
    _r3Cyl(m, 4.0, 1.4, 16.6, 3.0, 0.9, S[3], S[3], 18);            /* cable reel */
    _r3Cyl(m, 4.0, 2.3, 16.6, 1.6, 2.0, DK[1], DK[1], 16);
    _r3Cyl(m, 4.0, 4.3, 16.6, 3.0, 0.9, S[3], S[3], 18);
    _r3Box(m, 12.4, 1.4, 21.9, 5.0, 0.7, 3.4, DK[1], DK[0]);        /* pallet + crates */
    _r3Box(m, 11.4, 2.1, 21.9, 3.0, 2.8, 3.0, RTS_PAL.bag[0], RTS_PAL.bag[1]);
    _r3Box(m, 14.0, 2.1, 21.7, 2.4, 2.2, 2.4, RTS_PAL.bag[2], RTS_PAL.bag[0]);
    /* yard fence, so the open corner still has something standing in it */
    for (rd0 = 0; rd0 < 5; rd0++) _r3Box(m, 23.0, 1.4, 22.0 - rd0 * 5.6, 1.3, 5.0, 1.3, S[2], S[3]);
    _r3Box(m, 23.0, 5.4, 11.0, 1.4, 0.9, 23.0, S[3], S[3]);
    _r3Box(m, 23.0, 3.2, 11.0, 1.4, 0.9, 23.0, S[3], S[3]);
  } else if (key === 'lab') {
    /* Tech Center: three stepped pale masses - a service podium, a ribbon-glazed middle floor
       and a clean white research storey - with a stair core carrying the aerial array at the
       back right and a dish on a pylon at the front left. Two thin vertical accents at opposite
       corners over a low white block is a silhouette nothing else in the base owns, and that is
       the point: it must not be read as the Radar Dome (one dish, no tower) or as a power plant
       (fat stacks, no glass).
       This camera shows tops and front faces only, so that is where the geometry goes. The roof
       decks carry real plant - air handlers, extract stacks, ducting, cable trays, gas bottle
       racks, a water tank and railings - because a laboratory is a building whose machinery
       lives on the roof. The glazed floor is built as mullions and panes rather than one blue
       band; a band reads as a painted stripe, and at 3x supersampling the mullions survive.
       The entrance is a walled forecourt under a canopy instead of a door in a wall, which is
       the cheapest way to say SECURE, and the right-hand side yard gives the ground level
       something to be other than concrete.
       Team colour is held to the door, one stripe under the white storey, the annexe fascia and
       the mast pennant. Painted all over, the building stops reading as a laboratory. */
    var lbRailX = function (x0, x1, z, y, n) {          /* uprights plus a top rail */
      for (var lr0 = 0; lr0 < n; lr0++) _r3Box(m, x0 + (x1 - x0) * lr0 / (n - 1), y, z, 0.9, 3.0, 0.9, S[2], S[3]);
      _r3Box(m, (x0 + x1) / 2, y + 2.8, z, (x1 - x0) + 1.4, 0.8, 1.3, S[1], S[3]);
    };
    var lbRailZ = function (z0, z1, x, y, n) {
      for (var lr1 = 0; lr1 < n; lr1++) _r3Box(m, x, y, z0 + (z1 - z0) * lr1 / (n - 1), 0.9, 3.0, 0.9, S[2], S[3]);
      _r3Box(m, x, y + 2.8, (z0 + z1) / 2, 1.3, 0.8, (z1 - z0) + 1.4, S[1], S[3]);
    };
    /* Air handler: a chamfered case so its lid catches a different band from its walls, louvre
       ribs across the top, and a capped fan at the front corner. Three tones in one object. */
    var lbAhu = function (x, z, y, w, d, h, c0, c1) {
      _r3Slab(m, x, y, z, w, h, d, 1.1, c0 || S[1], c1 || S[0]);
      for (var la0 = 0; la0 < 3; la0++) _r3Box(m, x, y + h, z - d / 2 + 1.8 + la0 * 2.2, w - 3.4, 0.8, 1.3, DK[1], S[3]);
      _r3Cyl(m, x, y + h, z + d / 2 - 2.6, 2.2, 1.8, S[2], DK[1], 16);
      _r3Cyl(m, x, y + h + 1.8, z + d / 2 - 2.6, 2.6, 0.7, DK[0], S[3], 16);
    };
    var lbStack = function (x, z, y, r, h) {            /* extract stack under a rain cap */
      _r3Cyl(m, x, y, z, r, h, S[0], S[3], 16);
      _r3Cyl(m, x, y + h, z, r + 0.9, 1.0, S[3], C[1], 16);
      _r3Cyl(m, x, y + h + 1.0, z, r * 0.55, 1.5, DK[1], DK[0], 16);
    };
    /* Bottled gas on a rack. The one prop that says LAB rather than FACTORY, so it appears
       three times - roof terrace, side yard and forecourt - at three different sizes. */
    var lbBottles = function (x, z, y, n, hh, az) {
      var lbw = n * 3.0 + 1.6, lb1;
      _r3Box(m, x, y, z, az ? 4.6 : lbw, 1.2, az ? lbw : 4.6, DK[1], DK[2]);
      for (var lb0 = 0; lb0 < n; lb0++) {
        lb1 = (lb0 - (n - 1) / 2) * 3.0;
        _r3Cyl(m, x + (az ? 0 : lb1), y + 1.2, z + (az ? lb1 : 0), 1.35, hh, (lb0 % 2) ? S[3] : C[0], S[1], 16);
        _r3Cyl(m, x + (az ? 0 : lb1), y + 1.2 + hh, z + (az ? lb1 : 0), 0.75, 1.1, RTS_PAL.hazard[0], RTS_PAL.hazard[0], 16);
      }
      _r3Box(m, x + (az ? -1.9 : 0), y + 1.2 + hh * 0.65, z + (az ? 0 : 1.9),
             az ? 1.0 : lbw, 0.9, az ? lbw : 1.0, S[2], S[3]);
    };
    var lbTray = function (x0, x1, z, y) {              /* cable tray on stub legs */
      for (var lt0 = 0; lt0 < 4; lt0++) _r3Box(m, x0 + (x1 - x0) * (lt0 + 0.5) / 4, y, z, 1.0, 1.7, 1.0, DK[1], DK[2]);
      _r3Box(m, (x0 + x1) / 2, y + 1.7, z, x1 - x0, 1.0, 2.6, S[2], S[3]);
      _r3Box(m, (x0 + x1) / 2, y + 2.7, z, x1 - x0 - 2, 0.6, 1.7, DK[0], DK[1]);
    };
    /* Ducting run with flange rings. gy is the deck it stands on: the run is carried a metre
       clear of the deck and the sleeper blocks have to reach it, or the duct hangs in the air
       with daylight under it - boxes here have no underside to hide the gap. */
    var lbDuct = function (x0, x1, z, y, s, gy) {
      _r3Box(m, (x0 + x1) / 2, y, z, x1 - x0, s, s, S[1], S[0]);
      for (var ld0 = 0; ld0 < 4; ld0++) _r3Box(m, x0 + (x1 - x0) * (ld0 + 0.5) / 4, y - 0.35, z, 1.1, s + 0.7, s + 0.7, S[3], S[2]);
      for (var ld1 = 0; ld1 < 3; ld1++) _r3Box(m, x0 + (x1 - x0) * (ld1 + 0.5) / 3, gy, z, 1.7, y - gy + 0.5, 2.1, DK[1], DK[2]);
    };
    var lbLight = function (x, y, z) {                  /* obstruction light */
      _r3Cyl(m, x, y, z, 0.8, 1.1, DK[0], DK[1], 16);
      _r3Cyl(m, x, y + 1.1, z, 1.0, 1.2, RTS_PAL.hazard[0], RTS_PAL.lit, 16);
    };
    var lbHatch = function (x, z, y) {                  /* roof hatch, lid propped open */
      _r3Box(m, x, y, z, 5.0, 1.3, 4.4, DK[1], DK[2]);
      _r3Box(m, x, y + 1.3, z + 1.1, 5.0, 0.8, 2.4, S[2], S[1]);
    };
    var lbLadder = function (x, z, y, h) {              /* two rails plus rungs, proud of a wall */
      _r3Box(m, x - 1.6, y, z, 0.9, h, 1.1, S[3], S[2]);
      _r3Box(m, x + 1.6, y, z, 0.9, h, 1.1, S[3], S[2]);
      for (var ll0 = 0; ll0 * 2.8 < h - 2; ll0++) _r3Box(m, x, y + 1.6 + ll0 * 2.8, z, 3.8, 0.7, 0.9, S[1], S[0]);
    };

    /* --- ground: apron, then the right-hand service yard ------------------------------- */
    _r3Box(m, 0, 0, 0, 47, 1, 47, C[2], C[1]);
    _r3Box(m, 21.2, 1, -6, 4.6, 0.6, 28, C[1], C[3]);                /* yard pad, on the apron */
    for (i = 0; i < 6; i++) _r3Box(m, 23.2, 1.6, -18 + i * 5.2, 1.2, 5.0, 1.2, S[2], S[3]);  /* yard fence */
    _r3Box(m, 23.2, 6.0, -5.0, 1.4, 0.9, 27, S[1], S[3]);
    lbBottles(20.9, -1.0, 1.6, 3, 6.0, 1);
    _r3Slab(m, 20.9, 1.6, -7.6, 3.8, 6.5, 5.6, 1.2, S[2], S[1]);     /* transformer */
    for (i = 0; i < 3; i++) _r3Cyl(m, 19.5 + i * 1.4, 8.1, -7.6, 0.9, 2.4, C[0], C[3], 16);
    _r3Box(m, 20.9, 3.2, -4.6, 3.8, 3.0, 1.2, DK[0], DK[1]);         /* cooling fins */
    _r3Cyl(m, 21.4, 1.6, -14.0, 2.4, 1.0, DK[1], DK[2], 16);         /* cable drum */
    _r3Cyl(m, 21.4, 2.6, -14.0, 1.3, 3.2, RTS_PAL.dirt[2], RTS_PAL.dirt[0], 16);
    _r3Cyl(m, 21.4, 5.8, -14.0, 2.4, 1.0, DK[1], DK[2], 16);
    _r3Cyl(m, 20.1, 1.6, 6.6, 1.5, 4.2, RTS_PAL.ore[0], S[3], 16);   /* drums */
    _r3Cyl(m, 22.5, 1.6, 6.9, 1.4, 3.8, S[0], S[3], 16);
    _r3Box(m, 20.9, 1.6, -19.4, 4.2, 2.6, 3.4, RTS_PAL.dirt[1], RTS_PAL.dirt[3]);   /* crates */
    _r3Box(m, 20.9, 4.2, -19.4, 3.2, 2.2, 2.8, RTS_PAL.dirt[0], RTS_PAL.dirt[3]);
    /* Risers off the yard elbowing onto the podium roof - a pipe has to arrive somewhere or
       it reads as a post. */
    _r3Cyl(m, 19.6, 1.6, -11.0, 1.2, 12.6, S[0], S[3], 16);
    _r3Cyl(m, 19.6, 1.6, -17.6, 1.0, 12.6, S[0], S[3], 16);
    _r3Box(m, 17.2, 13.2, -11.0, 6.0, 2.2, 2.2, S[0], S[1]);
    _r3Box(m, 17.2, 13.2, -17.6, 5.5, 1.9, 1.9, S[0], S[1]);

    /* --- podium: the service storey the whole thing stands on -------------------------- */
    _r3Slab(m, -2, 1, -6, 40, 12, 32, 3.5, B.wall, B.roof);
    _r3Box(m, -2, 1, 10.4, 40, 3.0, 1.2, C[2], C[1]);                /* plinth band */
    _r3Box(m, -2, 8.4, 10.4, 40, 1.0, 1.4, C[3], C[1]);              /* string course */
    _r3Box(m, -21.0, 1, 10.5, 2.2, 8.5, 1.4, C[1], C[3]);            /* corner reveals */
    _r3Box(m, 17.0, 1, 10.5, 2.2, 8.5, 1.4, C[1], C[3]);
    pilasters(10.7, 1, -2, 9, 4.3, 2.2, 8.4);
    /* Only two slots of podium wall survive the forecourt and the annexe standing in front of
       it, so the glazing goes in those two and nowhere else - a window row hidden behind a
       canopy is a window row of nothing. Two storeys deep in each slot, to say the podium has
       floors in it rather than being a plinth. */
    for (i = 0; i < 2; i++) {
      _r3Box(m, -20.0, 2.6 + i * 3.2, 10.9, 2.8, 2.2, 1.3, RTS_PAL.glass, RTS_PAL.glass);
      _r3Box(m, 2.4, 2.6 + i * 3.2, 10.9, 2.6, 2.2, 1.3, RTS_PAL.glass, RTS_PAL.glass);
    }
    _r3Box(m, -20.0, 1, 10.9, 4.4, 1.6, 1.3, RTS_PAL.hazard[0], RTS_PAL.hazard[1]);
    lbLadder(-19.6, 10.9, 1, 12);

    /* --- glazed floor: carcass, then real mullions and panes --------------------------- */
    _r3Box(m, -2, 13, -6, 33, 6.5, 25, DK[0], DK[1]);
    _r3Box(m, -2, 12.6, 6.7, 33, 1.2, 1.6, C[3], C[1]);              /* sill */
    _r3Box(m, -2, 18.3, 6.7, 33, 1.5, 1.9, C[1], C[3]);              /* head fascia */
    for (i = 0; i < 9; i++) _r3Box(m, -2 + (i - 4) * 3.6, 13.6, 7.1, 2.9, 4.7, 1.2, RTS_PAL.glass, RTS_PAL.glass);
    for (i = 0; i < 10; i++) _r3Box(m, -2 + (i - 4.5) * 3.6, 13.3, 7.3, 0.9, 5.3, 1.6, C[1], C[3]);
    _r3Box(m, -2, 15.8, 7.3, 32.4, 0.7, 1.5, C[3], C[1]);            /* transom */

    /* --- white research storey --------------------------------------------------------- */
    _r3Slab(m, -5, 19.5, -9, 27, 9, 19, 3, C[1], C[3]);
    _r3Box(m, -5, 19.6, 0.9, 27, 1.8, 1.3, TM[0], TM[1]);            /* team stripe at the joint */
    _r3Box(m, -5, 24.7, 0.9, 27, 0.9, 1.2, C[3], C[1]);              /* cornice */
    pilasters(1.0, 21.8, -5, 7, 3.7, 1.8, 3.0);
    winRow(1.1, 22.2, -5, 6, 3.7, 2.5, 2.4);
    _r3Box(m, -16.5, 21.4, 1.0, 2.0, 3.4, 1.3, C[3], C[1]);          /* end reveals */
    _r3Box(m, 6.5, 21.4, 1.0, 2.0, 3.4, 1.3, C[3], C[1]);

    /* --- main plant deck on top of the white storey ------------------------------------ */
    /* The deck is laid in three strips of different tone rather than one slab: seen from
       almost overhead it is the single biggest polygon on the model, and one flat colour there
       undoes everything standing on it. */
    _r3Box(m, -5, 28.5, -12.0, 21, 1.0, 7.0, C[2], C[0]);
    _r3Box(m, -5, 28.5, -7.0, 21, 1.0, 3.0, C[2], C[2]);
    _r3Box(m, -5, 28.5, -3.9, 21, 1.0, 3.2, C[2], C[1]);
    _r3Box(m, -5, 29.4, -2.8, 20, 0.4, 1.1, RTS_PAL.hazard[0], RTS_PAL.hazard[1]);
    lbDuct(-14, 4, -14.6, 30.9, 2.4, 29.5);
    lbStack(-13.0, -12.4, 29.5, 2.2, 8.0);
    lbStack(-8.6, -12.8, 29.5, 1.8, 6.4);
    lbStack(-4.4, -12.4, 29.5, 1.6, 5.2);
    lbAhu(-11.0, -7.6, 29.5, 8.0, 6.2, 4.2, C[0], C[3]);
    lbAhu(-1.6, -7.6, 29.5, 8.0, 6.2, 4.2, DK[1], S[1]);
    for (i = 0; i < 4; i++) _r3Box(m, 2.2 + (i % 2) * 2.4, 29.5, -11.0 + Math.floor(i / 2) * 2.6, 1.4, 3.4, 1.4, S[3], S[2]);   /* tank legs */
    _r3Cyl(m, 3.4, 32.9, -9.7, 3.4, 6.0, S[1], S[0], 16);            /* water tank */
    _r3Cyl(m, 3.4, 38.9, -9.7, 2.0, 1.0, S[3], C[1], 16);
    for (i = 0; i < 3; i++) {                                        /* skylights on the front edge */
      _r3Box(m, -7.6 + i * 4.7, 29.5, -4.6, 4.2, 1.0, 3.2, C[3], C[1]);
      _r3Box(m, -7.6 + i * 4.7, 30.5, -4.6, 3.2, 0.9, 2.4, RTS_PAL.glass, RTS_PAL.glass);
    }
    _r3Cyl(m, 4.4, 29.5, -4.6, 1.3, 2.2, S[0], S[3], 16);            /* vent mushroom */
    _r3Cyl(m, 4.4, 31.7, -4.6, 1.9, 0.9, S[3], C[1], 16);
    for (i = 0; i < 3; i++) _r3Cyl(m, -0.2 + i * 1.9, 29.5, -13.6, 0.9, 4.6, S[0], S[3], 16);   /* manifold */
    _r3Box(m, 1.7, 33.7, -13.6, 5.6, 1.4, 1.4, S[1], S[0]);
    _r3Box(m, 1.7, 32.4, -13.6, 1.4, 1.4, 1.4, DK[1], DK[2]);
    lbHatch(-13.0, -4.6, 29.5);
    lbRailX(-15.2, 5.2, -2.7, 29.5, 7);
    lbRailZ(-15.2, -3.0, -15.3, 29.5, 5);
    lbRailZ(-15.2, -3.0, 5.3, 29.5, 5);
    lbLight(-15.3, 32.5, -2.7);
    lbLight(5.3, 32.5, -2.7);

    /* --- stair core and the aerial array ----------------------------------------------- */
    _r3Slab(m, 13, 1, -13.5, 10, 32, 11, 2.5, C[1], C[3]);
    _r3Box(m, 13, 27.9, -7.9, 10, 1.6, 1.2, TM[0], TM[1]);           /* team band */
    for (i = 0; i < 5; i++) _r3Box(m, 13, 19.8 + i * 2.2, -7.9, 4.8, 1.4, 1.2, RTS_PAL.glass, RTS_PAL.glass);
    _r3Box(m, 9.1, 19.0, -7.9, 1.6, 11.5, 1.3, C[3], C[1]);
    _r3Box(m, 16.9, 19.0, -7.9, 1.6, 11.5, 1.3, C[3], C[1]);
    _r3Box(m, 13, 33, -13.5, 12.4, 1.2, 12.4, S[2], S[1]);           /* mast platform */
    lbRailX(7.6, 18.4, -7.9, 34.2, 5);
    lbRailZ(-18.9, -8.1, 7.6, 34.2, 4);
    lbRailZ(-18.9, -8.1, 18.4, 34.2, 4);
    _r3Cyl(m, 13, 34.2, -13.5, 1.7, 10.0, S[1], S[0], 16);           /* mast */
    for (i = 0; i < 4; i++) {                                        /* cross booms and dipoles */
      _r3Box(m, 13, 36.6 + i * 2.3, -13.5, 13.4 - i * 2.2, 0.8, 0.9, S[3], S[2]);
      _r3Cyl(m, 13 - (6.7 - i * 1.1), 36.6 + i * 2.3, -13.5, 0.9, 2.8, S[3], S[2], 16);
      _r3Cyl(m, 13 + (6.7 - i * 1.1), 36.6 + i * 2.3, -13.5, 0.9, 2.8, S[3], S[2], 16);
    }
    _r3Cyl(m, 13, 44.2, -13.5, 0.9, 3.8, S[3], S[2], 16);            /* whip */
    _r3Box(m, 14.6, 45.2, -13.5, 4.0, 2.6, 0.9, TM[0], TM[1]);       /* pennant */
    lbLight(13, 48.0, -13.5);
    _r3Cone(m, 9.6, 34.2, -9.6, 2.8, 1.2, 4.0, S[2], 16);            /* drum aerial */
    _r3Cyl(m, 16.6, 34.2, -9.8, 1.1, 8.4, S[3], S[2], 16);           /* whip aerials */
    _r3Cyl(m, 9.4, 34.2, -17.6, 1.1, 6.4, S[3], S[2], 16);
    lbLight(16.6, 42.6, -9.8);

    /* --- terrace between the glazed floor and the white storey -------------------------- */
    lbDuct(-7.5, 5.5, 2.2, 20.6, 2.2, 19.5);
    lbBottles(-3.0, 5.2, 19.5, 4, 3.0);
    lbHatch(7.0, 3.4, 19.5);
    lbAhu(11.4, -3.4, 19.5, 6.0, 6.2, 4.0, C[0], C[3]);
    lbStack(11.4, 4.2, 19.5, 2.0, 7.0);
    _r3Box(m, 11.4, 26.5, -1.8, 2.0, 1.4, 12.4, S[1], S[0]);         /* stack tie-back to the core */
    lbRailX(-7.0, 13.6, 6.0, 19.5, 7);
    lbLight(-17.4, 19.5, 5.6);

    /* --- dish on a pylon, front left ---------------------------------------------------- */
    _r3Box(m, -13, 19.5, 3.0, 9.0, 1.6, 7.0, S[2], S[1]);
    _r3Cyl(m, -13, 21.1, 3.0, 2.8, 8.0, S[1], S[0], 16);
    for (i = 0; i < 3; i++) _r3Box(m, -13, 22.2 + i * 2.4, 3.0, 7.4 - i * 1.4, 0.9, 0.9, S[3], S[2]);
    _r3Cyl(m, -13, 29.1, 3.0, 3.6, 1.7, S[3], S[2], 16);             /* elevation bearing */
    _r3Box(m, -16.2, 30.8, 3.0, 1.7, 3.4, 4.2, S[0], S[1]);          /* yoke */
    _r3Box(m, -9.8, 30.8, 3.0, 1.7, 3.4, 4.2, S[0], S[1]);
    _r3Cone(m, -13, 31.6, 3.0, 3.0, 8.2, 5.0, C[2], 20);             /* the bowl */
    /* A dish aimed at the sky is a circle to this camera, and one flat circle 16 units across
       is the largest dead area on the model. So it is built as three concentric tones, each
       standing a little proud of the last so the depth test keeps it: bright rim, darker
       reflector face, steel hub - then the feed tripod and horn on top of that. */
    _r3Cyl(m, -13, 36.4, 3.0, 8.0, 0.8, C[1], C[3], 20);             /* rim, bright face */
    _r3Cyl(m, -13, 37.2, 3.0, 6.4, 0.6, C[0], C[2], 20);             /* reflector face */
    _r3Cyl(m, -13, 37.8, 3.0, 2.3, 1.2, S[1], S[0], 16);             /* hub */
    for (i = 0; i < 3; i++) _r3Box(m, -13 + (i - 1) * 3.8, 37.8, 3.0 + (i - 1) * 0.9, 1.0, 4.0, 1.0, S[3], S[2]);   /* feed legs */
    _r3Cyl(m, -13, 41.0, 3.0, 1.7, 2.6, DK[1], S[3], 16);            /* feed horn */
    lbLight(-13, 43.6, 3.0);

    /* --- service annexe, front right ---------------------------------------------------- */
    _r3Slab(m, 11.5, 1, 15, 15, 7, 14, 2, B.wall, B.roof);
    _r3Box(m, 11.5, 1, 22.4, 15, 2.4, 1.2, C[2], C[1]);              /* plinth */
    _r3Box(m, 11.5, 5.2, 22.4, 15, 1.1, 1.4, TM[0], TM[1]);          /* team fascia */
    pilasters(22.6, 1, 11.5, 5, 3.4, 1.9, 5.0);
    winRow(22.7, 2.8, 11.5, 4, 3.4, 2.2, 2.0);
    lbAhu(9.0, 14.6, 8, 7.6, 6.4, 3.8, DK[1], S[1]);
    lbStack(16.4, 12.4, 8, 1.8, 6.0);
    lbDuct(6.0, 17.0, 18.6, 9.6, 2.2, 8);
    lbRailX(6.2, 16.8, 19.8, 8, 5);
    lbHatch(6.6, 11.4, 8);
    lbLight(17.0, 8, 19.4);
    lbLadder(6.4, 10.7, 8, 6);

    /* --- secure entrance: walled forecourt, canopy, armoured door ----------------------- */
    _r3Slab(m, -15.2, 1, 16, 5.0, 6.0, 12, 1.4, C[2], C[0]);         /* blast walls */
    _r3Slab(m, -1.8, 1, 16, 5.0, 6.0, 12, 1.4, C[2], C[0]);
    _r3Box(m, -15.2, 2.0, 22.3, 3.2, 1.4, 1.2, RTS_PAL.hazard[0], RTS_PAL.hazard[0]);
    _r3Box(m, -1.8, 2.0, 22.3, 3.2, 1.4, 1.2, RTS_PAL.hazard[0], RTS_PAL.hazard[0]);
    _r3Box(m, -15.2, 4.2, 22.3, 3.2, 1.4, 1.2, RTS_PAL.hazard[1], RTS_PAL.hazard[1]);
    _r3Box(m, -1.8, 4.2, 22.3, 3.2, 1.4, 1.2, RTS_PAL.hazard[1], RTS_PAL.hazard[1]);
    _r3Cyl(m, -15.2, 1, 21.2, 1.5, 6.6, C[0], C[2], 16);             /* canopy columns */
    _r3Cyl(m, -1.8, 1, 21.2, 1.5, 6.6, C[0], C[2], 16);
    _r3Slab(m, -8.5, 7.0, 16.6, 19, 2.0, 13, 1.0, C[1], C[3]);       /* canopy */
    _r3Box(m, -8.5, 6.9, 23.1, 19, 1.4, 1.0, TM[0], TM[1]);          /* team fascia on its edge */
    for (i = 0; i < 3; i++) _r3Box(m, -13.5 + i * 5.0, 7.4, 23.2, 2.0, 1.0, 1.0, RTS_PAL.lit, RTS_PAL.lit);
    _r3Box(m, -8.5, 8.9, 12.6, 19, 0.4, 3.0, C[2], C[2]);            /* banding, same reason */
    lbTray(-14.5, -2.5, 11.6, 9.0);                                  /* cable tray over the canopy */
    _r3Box(m, -12.0, 9.0, 15.4, 4.0, 2.6, 4.2, S[1], S[0]);          /* canopy plant */
    _r3Box(m, -5.4, 9.0, 15.4, 3.8, 2.2, 3.8, S[2], S[1]);
    _r3Box(m, -15.4, 9.0, 20.0, 3.2, 2.0, 3.2, S[2], S[1]);          /* floodlight over the gate */
    _r3Cyl(m, -15.4, 11.0, 20.0, 0.9, 4.6, S[3], S[2], 16);
    _r3Box(m, -15.4, 15.2, 20.0, 3.0, 1.4, 1.6, RTS_PAL.lit, RTS_PAL.lit);
    _r3Cone(m, -2.2, 9.0, 20.4, 1.2, 3.2, 2.2, C[3], 16);            /* gate comms dish */
    _r3Cyl(m, -2.2, 11.2, 20.4, 0.8, 1.4, DK[1], S[3], 16);
    for (i = 0; i < 3; i++) {                                        /* extract vents */
      _r3Cyl(m, -10.2 + i * 2.7, 9.0, 20.4, 1.0, 2.0, S[0], S[3], 16);
      _r3Cyl(m, -10.2 + i * 2.7, 11.0, 20.4, 1.5, 0.8, S[3], C[1], 16);
    }
    _r3Box(m, -8.5, 1, 15.0, 12, 1.4, 10, C[3], C[1]);               /* threshold */
    _r3Box(m, -8.5, 1, 20.7, 12, 1.0, 1.4, C[3], C[1]);              /* step */
    _r3Box(m, -8.5, 2.0, 20.7, 12, 0.4, 1.0, RTS_PAL.hazard[0], RTS_PAL.hazard[0]);
    for (i = 0; i < 5; i++) _r3Box(m, -14.4 + i * 2.9, 1, 22.4, 2.2, 0.5, 2.2, RTS_PAL.hazard[0], RTS_PAL.hazard[1]);
    _r3Box(m, -8.5, 2.4, 10.7, 12.0, 6.6, 1.2, DK[1], DK[2]);        /* door reveal */
    /* The leaves are sized to the slot the blast walls leave open, not to the reveal: anything
       wider is painted team colour that nobody ever sees. */
    _r3Box(m, -10.6, 2.4, 11.3, 3.8, 5.4, 1.0, TM[0], TM[1]);
    _r3Box(m, -6.4, 2.4, 11.3, 3.8, 5.4, 1.0, TM[0], TM[1]);
    _r3Box(m, -8.5, 2.4, 11.5, 1.0, 5.4, 1.0, DK[0], DK[1]);         /* centre seam */
    _r3Box(m, -8.5, 8.0, 11.1, 13.0, 1.2, 1.6, C[3], C[1]);          /* lintel */
    _r3Box(m, -4.9, 4.6, 11.3, 1.6, 2.4, 1.0, DK[0], S[3]);          /* card reader */
    _r3Box(m, -12.2, 4.6, 11.3, 1.6, 2.4, 1.0, RTS_PAL.lit, RTS_PAL.lit);       /* gate intercom */
    lbLight(-8.5, 9.2, 11.3);
    for (i = 0; i < 4; i++) {                                        /* bollards */
      _r3Cyl(m, -13.6 + i * 3.4, 1, 22.4, 1.3, 4.4, RTS_PAL.hazard[0], RTS_PAL.hazard[1], 16);
      _r3Cyl(m, -13.6 + i * 3.4, 5.4, 22.4, 1.3, 0.7, RTS_PAL.hazard[1], DK[0], 16);
    }
    lbBottles(-21.5, 20.0, 1, 2, 4.0, 1);                            /* bottles by the door */
  } else if (key === 'rocketpit') {
    /* Rocket Turret: a SAM battery, and the whole job is stopping it from reading as a taller
       Gun Turret. So the vocabulary is deliberately different - a revetted concrete pit with a
       toothed traverse race, a three-cell box launcher canted up and BACK, a guidance dish on
       one shoulder and a ready rack of spare rounds on the other. The launcher is stepped
       rather than sloped because this projection has no pitch and no yaw: a staircase of
       boxes climbing in y as it walks in -z is the only way to draw a canted mass, and the
       tread/riser pairs shade into alternating bands that read as tube ribbing for free.
       Pale cells over a mid-steel cradle with one dark line under it, not dark tubes on a
       pale mount: the first pass that way round came out as a single black slab filling the
       sprite. The flanking cells are steel where the centre is concrete-pale so that three
       cells read as three, not as one block. The centre cell runs a step longer than its
       neighbours so the muzzle line is stepped rather than flat, which is what stops the top
       of the silhouette reading as a chimney, and the loaded warheads sit at the top of the
       climb where nothing can occlude them.
       The footprint is only 24 x 24, the tightest in the set, so the budget goes UPWARD in
       four stacked reads - apron, pit, mount, launcher. Everything is kept deliberately low
       and stubby relative to that: a long ramp fills the sprite top to bottom and swallows
       its own pit, dish and rack, which is exactly what it must not do. Round forms
       (revetment blocks, race teeth, dish, sandbags, spare rounds) carry the detail, because
       the +/-x faces of a box are edge-on here and never drawn. */
    var rp0, rp1, rp2, rp3, rp4, rp5, rpA, rpX, rpZ;
    /* One stepped run of boxes = one canted member. Alternating the two tones per step is
       what turns a staircase into ribbing instead of a smooth grey wedge. */
    var rpRun = function (x, y, z, n, dy, dz, w, hh, dd, c1, c2, c3) {
      for (var q = 0; q < n; q++)
        _r3Box(m, x, y + q * dy, z - q * dz, w, hh, dd, (q % 2) ? c1 : c2, c3 || c1);
    };
    /* A spare round: body, warhead band in team colour, nose, and two crossed fin plates.
       Upright in the rack because a horizontal missile at this size is just a grey bar. */
    var rpMsl = function (x, y, z, r, hh) {
      _r3Cyl(m, x, y, z, r, hh, C[3], C[1], 16);
      _r3Cyl(m, x, y + hh * 0.52, z, r + 0.3, 1.2, TM[0], TM[1], 16);
      _r3Cone(m, x, y + hh, z, r, 0.25, r * 2.0, DK[1], 16);
      _r3Box(m, x, y + 0.7, z, r * 2.9, 1.0, 1.6, S[2], S[0]);
      _r3Box(m, x, y + 0.7, z, 1.6, 1.0, r * 2.9, S[2], S[0]);
    };
    /* Muzzle of one cell: collar, dark bore, and the nose of the round sitting in it. */
    var rpMuz = function (x, y, z) {
      _r3Box(m, x, y, z, 3.8, 1.2, 4.0, DK[1], DK[3]);
      _r3Box(m, x, y + 1.2, z, 2.6, 0.5, 2.8, DK[2], DK[2]);
      _r3Cyl(m, x, y + 1.3, z, 1.1, 1.0, C[3], C[1], 16);
      _r3Cone(m, x, y + 2.3, z, 1.1, 0.2, 1.5, TM[1], 16);
    };

    /* --- apron ------------------------------------------------------------------- */
    _r3Box(m, 0, 0, 0, 23.6, 1.2, 23.6, C[2], C[0]);                    /* poured pad */
    _r3Box(m, 0, 1.2, 0, 19.0, 0.6, 19.0, C[0], C[1]);                  /* raised inner slab */
    for (rp0 = 0; rp0 < 6; rp0++)                                       /* hazard kerb, front */
      _r3Box(m, -9.0 + rp0 * 3.6, 1.8, 10.6, 2.8, 0.6, 2.0,
             (rp0 % 2) ? RTS_PAL.hazard[1] : RTS_PAL.hazard[0],
             (rp0 % 2) ? RTS_PAL.hazard[1] : RTS_PAL.hazard[0]);
    for (rp0 = 0; rp0 < 4; rp0++) {                                     /* corner posts */
      rpX = (rp0 & 1) ? 10.4 : -10.4; rpZ = (rp0 & 2) ? 10.4 : -10.4;
      _r3Cyl(m, rpX, 1.2, rpZ, 1.3, 4.0, C[3], C[1], 16);
      _r3Cyl(m, rpX, 3.2, rpZ, 1.5, 1.0, RTS_PAL.hazard[0], RTS_PAL.hazard[0], 16);
    }

    /* --- revetment ---------------------------------------------------------------- */
    /* Sixteen overlapping drums instead of four straight walls: three of those walls would
       be edge-on or hidden here, where a ring reads as a ring from any angle. */
    for (rp1 = 0; rp1 < 16; rp1++) {
      rpA = rp1 / 16 * Math.PI * 2;
      rpX = Math.cos(rpA) * 9.4; rpZ = Math.sin(rpA) * 9.4;
      _r3Cyl(m, rpX, 1.8, rpZ, 2.4, 4.0, (rp1 % 2) ? C[0] : C[2], C[1], 16);
      _r3Cyl(m, rpX, 5.8, rpZ, 2.0, 1.0, C[3], C[1], 16);               /* coping course */
    }
    /* Sandbagged front arc - the cue that this thing is dug in and expects to be shot at. */
    for (rp1 = 0; rp1 < 5; rp1++) {
      rpA = Math.PI * (0.36 + rp1 * 0.07);
      rpX = Math.cos(rpA) * 10.0; rpZ = Math.sin(rpA) * 10.0;
      _r3Cyl(m, rpX, 6.8, rpZ, 1.5, 1.5, RTS_PAL.bag[0], RTS_PAL.bag[1], 16);
      _r3Cyl(m, rpX * 0.86, 6.8, rpZ * 0.86, 1.4, 1.5, RTS_PAL.bag[1], RTS_PAL.bag[2], 16);
    }

    /* --- pit, traverse race ------------------------------------------------------- */
    _r3Cone(m, 0, 1.8, 0, 8.4, 7.4, 3.8, C[1], 20);                     /* tapered plinth */
    _r3Cyl(m, 0, 5.6, 0, 7.6, 1.1, C[3], C[0], 20);                     /* plinth cap */
    _r3Cyl(m, 0, 6.7, 0, 6.9, 1.1, DK[2], DK[1], 20);                   /* race */
    for (rp2 = 0; rp2 < 16; rp2++) {                                    /* ring gear teeth */
      rpA = rp2 / 16 * Math.PI * 2;
      _r3Box(m, Math.cos(rpA) * 6.9, 6.8, Math.sin(rpA) * 6.9, 1.6, 1.3, 1.6,
             (rp2 % 2) ? S[3] : S[0], S[1]);
    }
    _r3Cyl(m, 0, 7.8, 0, 6.2, 1.0, S[0], S[3], 20);                     /* bearing */
    _r3Cyl(m, 0, 8.2, 0, 6.6, 1.0, TM[0], TM[1], 20);                   /* owner band on the joint */
    _r3Cyl(m, 0, 8.8, 0, 6.4, 1.2, S[1], S[3], 20);                     /* turntable deck */

    /* --- traversing mount ---------------------------------------------------------- */
    _r3Slab(m, 0, 10.0, 0.5, 9.2, 3.6, 8.2, 1.3, S[1], S[0]);           /* machinery housing */
    _r3Box(m, 0, 10.8, 4.9, 6.0, 2.4, 1.8, DK[1], DK[3]);               /* control panel */
    _r3Box(m, -1.6, 11.5, 5.9, 1.6, 1.0, 1.6, RTS_PAL.lit, RTS_PAL.lit);
    _r3Box(m, 1.6, 11.5, 5.9, 1.6, 1.0, 1.6, RTS_PAL.hazard[0], RTS_PAL.hazard[0]);
    for (rp3 = 0; rp3 < 2; rp3++) {
      rpX = rp3 ? 4.9 : -4.9;
      _r3Box(m, rpX, 12.0, -0.8, 2.6, 5.0, 6.6, S[2], S[0]);            /* trunnion cheek */
      _r3Box(m, rpX, 15.0, 2.0, 3.0, 2.0, 1.8, TM[0], TM[1]);           /* team plate on it */
      _r3Box(m, rpX, 14.2, -0.8, 3.2, 2.2, 3.2, S[0], S[3]);            /* trunnion boss */
      _r3Box(m, rpX, 15.6, -0.8, 3.6, 1.1, 3.6, DK[1], DK[3]);          /* pin cap */
      /* elevation ram, itself canted - four steps is enough to read as a strut */
      rpRun(rpX * 0.74, 11.0, 4.2, 4, 1.2, 1.0, 1.8, 1.4, 1.8, S[3], S[0], S[1]);
      _r3Cyl(m, rpX, 17.0, -3.6, 0.9, 1.3, S[0], S[3], 16);             /* beacon post */
      _r3Cyl(m, rpX, 18.3, -3.6, 0.8, 0.9, RTS_PAL.hazard[0], RTS_PAL.lit, 16);
    }

    /* --- the launcher --------------------------------------------------------------- */
    /* Four steps of 1.5 up and 1.9 back. Short and stubby on purpose: the ramp has to sit
       clear above the pit without becoming the entire sprite. */
    rpRun(0, 12.9, 3.0, 4, 1.5, 1.9, 9.0, 0.9, 3.6, DK[0], DK[2], DK[1]);    /* shadow line */
    rpRun(0, 13.8, 3.0, 4, 1.5, 1.9, 10.6, 1.9, 3.6, S[2], S[0], S[3]);      /* cradle beam */
    rpRun(0, 15.7, 3.0, 4, 1.5, 1.9, 3.4, 3.0, 3.6, C[3], C[0], C[3]);       /* centre cell */
    rpRun(-3.6, 15.7, 3.0, 3, 1.5, 1.9, 3.4, 3.0, 3.6, S[3], S[1], S[3]);    /* flanking cells */
    rpRun(3.6, 15.7, 3.0, 3, 1.5, 1.9, 3.4, 3.0, 3.6, S[3], S[1], S[3]);
    rpRun(-6.0, 15.0, 3.0, 4, 1.5, 1.9, 1.8, 1.6, 3.6, DK[1], DK[3], DK[1]);  /* cable ducts */
    rpRun(6.0, 15.0, 3.0, 4, 1.5, 1.9, 1.8, 1.6, 3.6, DK[1], DK[3], DK[1]);
    _r3Box(m, 0, 15.0, 1.1, 11.2, 1.0, 3.8, TM[0], TM[1]);              /* owner bands on the beam */
    _r3Box(m, 0, 18.0, -2.7, 11.2, 1.0, 3.8, TM[0], TM[1]);
    rpMuz(0, 23.2, -2.7);                                               /* muzzles, loaded */
    rpMuz(-3.6, 21.7, -0.8);
    rpMuz(3.6, 21.7, -0.8);
    /* Blast deflector, canted the other way so the two wedges cross in silhouette. Pale
       concrete with a scorched top rather than black - a dark wedge across the middle of the
       sprite reads as a hole punched through the building. */
    rpRun(0, 12.4, 5.2, 4, -1.3, -1.0, 8.4, 1.5, 2.6, C[2], C[0], DK[1]);
    _r3Box(m, 0, 8.1, 8.2, 8.8, 0.8, 2.2, RTS_PAL.hazard[0], RTS_PAL.hazard[0]);
    _r3Box(m, -4.6, 6.8, 8.2, 1.8, 3.6, 2.2, S[3], S[0]);               /* deflector legs */
    _r3Box(m, 4.6, 6.8, 8.2, 1.8, 3.6, 2.2, S[3], S[0]);

    /* --- guidance unit, right shoulder ---------------------------------------------- */
    _r3Slab(m, 8.2, 6.8, 1.8, 6.4, 4.0, 6.4, 1.3, B.wall, B.roof);      /* radar hut */
    _r3Box(m, 8.2, 10.8, 1.8, 4.4, 1.1, 2.4, TM[0], TM[1]);             /* team panel */
    _r3Box(m, 6.6, 10.8, 3.8, 2.0, 1.6, 1.8, DK[1], DK[3]);             /* hut clutter */
    _r3Box(m, 9.8, 10.8, 3.8, 2.0, 1.2, 1.8, S[2], S[0]);
    _r3Cyl(m, 9.9, 10.8, 0.0, 1.1, 2.0, S[0], DK[1], 16);               /* extractor */
    _r3Cyl(m, 8.2, 11.9, 1.8, 1.3, 3.4, S[0], S[3], 16);                /* dish mast */
    _r3Cyl(m, 8.2, 13.9, 1.8, 1.7, 1.0, S[2], S[3], 16);                /* mast collar */
    _r3Cone(m, 8.2, 15.3, 1.8, 2.3, 1.2, 1.9, S[2], 16);                /* dish pedestal */
    _r3Cone(m, 8.2, 17.2, 1.8, 3.4, 1.2, 2.5, C[3], 20);                /* the dish */
    _r3Cyl(m, 8.2, 19.7, 1.8, 3.5, 0.7, DK[1], DK[3], 20);              /* dish rim */
    for (rp4 = 0; rp4 < 4; rp4++) {                                     /* dish ribs */
      rpA = rp4 / 4 * Math.PI * 2 + 0.4;
      _r3Box(m, 8.2 + Math.cos(rpA) * 1.9, 17.9, 1.8 + Math.sin(rpA) * 1.9,
             1.5, 2.2, 1.5, S[3], S[1]);
    }
    _r3Cyl(m, 8.2, 19.6, 1.8, 1.6, 0.9, TM[0], TM[1], 16);              /* boss, owner colour */
    _r3Cyl(m, 8.2, 20.4, 1.8, 0.9, 2.0, S[1], S[0], 16);                /* feed mast */
    _r3Box(m, 8.2, 22.4, 1.8, 1.9, 1.3, 1.9, DK[1], DK[3]);             /* feed horn */
    _r3Cyl(m, 8.2, 23.7, 1.8, 0.8, 0.9, RTS_PAL.lit, RTS_PAL.lit, 16);  /* aircraft light */

    /* --- ready rack, left shoulder --------------------------------------------------- */
    _r3Box(m, -8.2, 6.8, 2.6, 6.6, 1.3, 8.4, S[3], S[1]);               /* rack deck */
    _r3Box(m, -8.2, 8.1, 6.4, 6.6, 4.6, 1.6, S[2], S[0]);               /* rack frame */
    _r3Box(m, -8.2, 8.1, -1.2, 6.6, 4.6, 1.6, S[2], S[0]);
    _r3Box(m, -8.2, 12.7, 2.6, 6.6, 1.3, 8.4, S[0], S[3]);              /* top rail */
    _r3Box(m, -8.2, 14.0, 2.6, 4.0, 1.0, 5.8, TM[1], TM[0]);            /* team decal on it */
    rpMsl(-8.2, 8.1, 4.8, 1.5, 4.2);
    rpMsl(-8.2, 8.1, 1.8, 1.5, 4.2);
    rpMsl(-8.2, 8.1, -0.8, 1.5, 4.2);
    _r3Cyl(m, -10.1, 12.7, 2.6, 1.1, 5.2, S[0], S[3], 16);              /* loading davit */
    _r3Box(m, -8.7, 17.1, 2.6, 4.0, 1.3, 1.8, S[2], S[0]);              /* its jib */
    _r3Cyl(m, -7.0, 16.4, 2.6, 0.8, 0.8, S[3], S[1], 16);               /* pulley */
    _r3Box(m, -7.0, 14.6, 2.6, 0.9, 1.8, 0.9, DK[1], DK[3]);            /* fall */
    _r3Box(m, -7.0, 13.5, 2.6, 1.8, 1.1, 1.8, S[0], S[3]);              /* hook block */

    /* --- access, conduit, ground plant ------------------------------------------------ */
    for (rp5 = 0; rp5 < 6; rp5++)                                       /* stair to the hut */
      _r3Box(m, 8.8, 1.8 + rp5 * 0.85, 10.4 - rp5 * 0.72, 3.2, 0.85, 1.6,
             (rp5 % 2) ? C[0] : C[2], C[3]);
    for (rp5 = 0; rp5 < 3; rp5++)                                       /* its handrail */
      _r3Box(m, 10.5, 3.2 + rp5 * 1.7, 10.0 - rp5 * 1.44, 1.4, 2.4, 1.4, S[2], S[0]);
    _r3Box(m, -5.4, 1.8, 6.2, 1.4, 5.4, 1.4, S[2], S[0]);               /* ladder rails */
    _r3Box(m, -2.6, 1.8, 6.2, 1.4, 5.4, 1.4, S[2], S[0]);
    for (rp5 = 0; rp5 < 5; rp5++)
      _r3Box(m, -4.0, 2.6 + rp5 * 1.0, 6.2, 3.6, 0.7, 1.5, S[3], S[1]); /* rungs */
    rpRun(-8.0, 4.6, 8.0, 4, 0.9, 0.9, 2.0, 1.2, 2.0, S[3], S[2], S[0]); /* duct off the set */
    rpRun(2.8, 6.4, 7.0, 4, 0.9, 0.8, 1.8, 1.1, 1.8, S[3], S[2], S[0]);  /* conduit up the plinth */
    rpRun(-1.2, 6.4, 7.0, 4, 0.9, 0.8, 1.8, 1.1, 1.8, S[3], S[2], S[0]);
    _r3Box(m, 2.8, 10.0, 4.6, 2.4, 1.7, 2.0, DK[1], DK[3]);             /* junction boxes */
    _r3Box(m, -1.2, 10.0, 4.6, 2.4, 1.7, 2.0, DK[1], DK[3]);
    _r3Slab(m, -8.2, 1.8, 9.2, 5.6, 3.4, 4.4, 1.1, S[2], S[0]);         /* generator set */
    for (rp5 = 0; rp5 < 3; rp5++)
      _r3Box(m, -9.8 + rp5 * 1.6, 2.4, 11.3, 1.5, 2.2, 0.8, DK[1], DK[3]); /* louvres */
    _r3Cyl(m, -6.0, 5.2, 8.2, 0.9, 2.6, DK[1], DK[3], 16);              /* its exhaust */
    _r3Box(m, -8.2, 5.2, 9.2, 3.2, 0.9, 2.4, TM[1], TM[0]);             /* team cap on it */
    _r3Cyl(m, -2.6, 1.8, 10.4, 1.5, 3.0, RTS_PAL.hazard[0], DK[1], 16); /* barrels */
    _r3Cyl(m, -2.6, 4.8, 10.4, 1.6, 0.5, DK[1], DK[2], 16);
    _r3Cyl(m, 0.4, 1.8, 10.4, 1.5, 3.0, S[2], DK[1], 16);
    _r3Cyl(m, 0.4, 4.8, 10.4, 1.6, 0.5, DK[1], DK[2], 16);
    _r3Box(m, 3.6, 1.8, 10.4, 3.0, 2.0, 3.0, RTS_PAL.bag[1], RTS_PAL.bag[0]);  /* crates */
    _r3Box(m, 3.6, 3.8, 10.4, 2.6, 1.5, 2.6, RTS_PAL.bag[2], RTS_PAL.bag[0]);
  } else if (key === 'apower') {
    /* Advanced Power Plant: everything the Power Plant has and half again as much of it -
       four banded stacks off one long boiler house, a hyperbolic cooling tower filling the
       right third, and a switchyard of four transformers under a full-width busbar gantry.
       It reuses that building's parts - stack rims with hazard collars, porcelain bushings,
       railed decks - and simply carries more of them across a footprint half again as wide.

       EVERY DECISION HERE IS DRIVEN BY screenY = z - 1.3y, so the one rule that governs the
       layout is: a horizontal surface at height h hides everything below h that lands behind
       it, and a tall object in the FOREGROUND climbs the screen and eats the elevation
       behind it. Three consequences the layout is built around:

       - The switchyard is 13 deep and stands in front of the halls, so it owns a wide band
         of the sprite whatever is behind it. It is therefore kept SHORT: tanks 6.6 high,
         lids at 9.4, bushings topping out at 15. That puts the yard's highest screen row at
         about -4.7, and everything on the hall front above y = 12 survives.
       - The halls are correspondingly TALL - west 14.5, east 18.5 - so that each one has a
         real elevation above that line: windows, a team-colour cornice and a parapet. A
         shorter hall would have its whole front buried behind its own transformers, which
         is not a facade at all, only geometry that costs bake time.
       - Anything below y = 11.5 in the strip the control annexe covers is invisible, so
         nothing is built there: no tower-base pump house, no ground-level pipe run. The
         cold-water mains instead crosses OVER the annexe roof at y = 16-20, which is the
         one route from the turbine hall to the tower that the camera can actually see.

       The turbine hall is deliberately TWO blocks, a low west one and a tall east one. With
       no yaw a step in x costs nothing to draw and buys a second roof deck at a second
       height, and deck is the surface this camera spends most of its pixels on. The cooling
       tower sits BEHIND the front line: a 30-unit cone parked in the forecourt would swallow
       the facade, whereas from the back it stacks clear above the annexe roof and becomes
       the thing you name the building by at a glance.

       Roof plant is ordered tall-at-the-back, low-at-the-front on both decks. Put the water
       tank in front of the fans and it simply deletes them.

       The door, its canopy and the steps are on the annexe face at z = 17, the one elevation
       with nothing at all standing in front of it. Team colour rides the boiler band, the
       two hall cornices, the stair-tower head and the annexe head - the walls stay faction
       colour so the damage tones still read. */
    var apHz = RTS_PAL.hazard, apGl = RTS_PAL.glass, apLt = RTS_PAL.lit;
    var ap0, apA;

    /* A deck edge is the highest-contrast line this camera has; unrailed it reads as the top
       of a crate, so every walkable roof gets uprights plus a top rail. */
    var apRailX = function (x0, x1, y, z, n, col) {
      var k;
      for (k = 0; k < n; k++) _r3Box(m, x0 + (x1 - x0) * k / (n - 1), y, z, 1.5, 3, 1.5, col, col);
      _r3Box(m, (x0 + x1) / 2, y + 3, z, x1 - x0 + 1.5, 1, 1.7, col, col);
    };
    /* A rail running in z gets ONE upright, at the near end. Posts spread along z sit
       directly behind the rail's own top box and never reach a pixel. */
    var apRailZ = function (z0, z1, y, x, col) {
      _r3Box(m, x, y, z1, 1.5, 3, 1.5, col, col);
      _r3Box(m, x, y + 3, (z0 + z1) / 2, 1.7, 1, z1 - z0 + 1.5, col, col);
    };
    /* Extract fan - kerb, shroud with a dark throat, weather cap. The cap overhangs the
       shroud so the ring of shadow under it separates the two at sprite size. */
    var apFan = function (x, z, y, r, h, col) {
      _r3Box(m, x, y, z, r * 2.3, 1.5, r * 2.3, DK[1], DK[3]);
      _r3Cyl(m, x, y + 1.5, z, r, h, col, DK[2], 18);
      _r3Cyl(m, x, y + 1.5 + h, z, r * 1.3, 1, S[3], S[0], 18);
      _r3Box(m, x, y + 1.5, z + r * 0.85, 1.6, h * 0.8, 1.6, S[3], S[3]);
    };
    var apVent = function (x, z, y, r, h) {
      _r3Cyl(m, x, y, z, r, h, S[0], DK[2], 16);
      _r3Cyl(m, x, y + h, z, r * 1.6, 0.9, S[3], S[1], 16);
    };
    /* Porcelain bushing: pale concrete tones where everything else in the yard is steel, so
       the switchgear reads as switchgear and not as a row of skips. */
    var apBush = function (x, z, y, s) {
      _r3Cone(m, x, y, z, 2 * s, 1.5 * s, 3 * s, C[3], 16);
      _r3Cone(m, x, y + 3 * s, z, 1.6 * s, 1.1 * s, 2.4 * s, C[1], 16);
      _r3Cyl(m, x, y + 5.4 * s, z, s, 1.3 * s, S[3], DK[1], 16);
    };
    var apLad = function (x, y, z, h, n) {
      var k;
      _r3Box(m, x - 1.6, y, z, 1.2, h, 1.2, S[3], S[3]);
      _r3Box(m, x + 1.6, y, z, 1.2, h, 1.2, S[3], S[3]);
      for (k = 0; k < n; k++) _r3Box(m, x, y + 2 + k * (h - 3.5) / (n - 1), z, 3.4, 0.8, 0.9, S[2], S[3]);
    };
    /* Stack: plinth, banded flue, hazard collar, heavy rim with a dark throat, warning lamp.
       The collar and the rim are what stop a chimney reading as a length of pipe. */
    var apStack = function (x, z, y, r, h, nb) {
      var k, t = y + 3 + h;
      _r3Slab(m, x, y, z, r * 2.1, 3, r * 2.1, 1.5, C[2], C[0]);
      _r3Cyl(m, x, y + 3, z, r, h, S[0], DK[2], 20);
      for (k = 0; k < nb; k++)
        _r3Cyl(m, x, y + 6 + k * (h - 10) / (nb - 1), z, r * 1.09, 1.2, S[2], S[3], 20);
      _r3Cyl(m, x, t - 3.4, z, r * 1.09, 2, apHz[0], apHz[1], 20);
      _r3Cyl(m, x, t - 1.4, z, r * 1.18, 1.4, S[3], DK[2], 20);
      _r3Cyl(m, x, t, z, 0.9, 1.5, apLt, apLt, 16);
    };
    /* Oil-filled transformer: pad, tank, lid rail, a comb of radiator fins, three bushings
       and a marshalling kiosk. Kept LOW on purpose - see the header. The bushings are spaced
       3.1 apart rather than touching, and the kiosk stands on the pad instead of on the lid,
       because anything mounted in front of a bushing simply erases it. */
    var apXfmr = function (x, z) {
      var k;
      _r3Box(m, x, 1.5, z, 9.4, 0.9, 11, C[2], C[1]);
      _r3Box(m, x, 2.4, z, 8.6, 6.6, 8, S[1], S[3]);
      _r3Box(m, x, 9, z, 9.3, 1, 8.6, S[3], S[0]);
      _r3Box(m, x, 10, z - 2.8, 9.3, 0.4, 3.2, S[2], S[3]);
      for (k = 0; k < 3; k++)
        _r3Box(m, x - 2.6 + k * 2.6, 3.2, z + 4.4, 1.8, 5.2, 2.4, S[2], S[0]);
      apBush(x - 3.1, z - 2.8, 10.4, 0.85);
      apBush(x, z - 2.8, 10.4, 0.85);
      apBush(x + 3.1, z - 2.8, 10.4, 0.85);
      _r3Box(m, x + 4, 2.4, z + 4.2, 1.8, 4.4, 1.8, S[2], S[3]);
      _r3Box(m, x + 1.2, 4.4, z + 4.7, 3.2, 2.8, 1.4, apHz[0], apHz[1]);
    };

    /* ---- ground ----------------------------------------------------------------
       Only the strips the yard slab and the transformer pads do NOT cover get their own
       tone; a patch laid under 13 units of switchyard is a patch nobody sees. */
    _r3Box(m, 0, 0, 0, W - 2, 1.5, D - 2, C[2], C[0]);                /* site slab */
    _r3Box(m, 24, 1.5, 20, 22, 0.4, 6, C[0], C[2]);                   /* annexe forecourt */
    _r3Box(m, 31, 1.5, 21, 8, 0.4, 5, C[1], C[3]);

    /* ---- the masses, four decks at four heights ---------------------------------
       The halls are tall enough to carry a facade clear of their own switchyard, and the
       boiler house is tall enough that its louvre band and team band clear the halls. */
    _r3Slab(m, -11, 1.5, -16.4, 44, 25, 15, 2.5, B.wall, B.roof);     /* boiler house */
    _r3Slab(m, -22, 1.5, 0, 22, 14.5, 18, 2.5, B.wall, B.roof);       /* west hall, low */
    _r3Slab(m, 0, 1.5, 0, 22, 18.5, 18, 2.5, B.wall, B.roof);         /* east hall, tall */
    _r3Slab(m, 24, 1.5, 10, 22, 10, 14, 2.5, B.wall, B.roof);         /* control annexe */

    /* ---- cooling tower ----------------------------------------------------------
       A waisted cone flaring back out to a dark mouth, stood on an inlet ring. The shell
       springs from r = 11 INSIDE the r = 11.7 column ring and the r = 12.6 plinth, so the
       columns stand proud of the shell instead of being swallowed by its flare. Only the
       flank columns are built: the ones across the front of the ring are behind the annexe
       roof, which hides everything under y = 11.5. */
    _r3Cyl(m, 23, 1.5, -11, 12.6, 2.5, C[2], C[0], 24);               /* plinth ring */
    for (ap0 = 0; ap0 < 3; ap0++) {
      apA = Math.PI * (ap0 < 2 ? -0.055 + ap0 * 0.15 : 1.055);
      _r3Box(m, 23 + Math.cos(apA) * 11.7, 4, -11 + Math.sin(apA) * 11.7,
        2.4, 5, 2.4, C[3], C[1]);
    }
    _r3Cyl(m, 23, 8.6, -11, 11.3, 1, C[3], C[1], 24);                 /* springing ring */
    _r3Cone(m, 23, 9.6, -11, 11, 7, 16.4, C[2], 24);                  /* waist */
    _r3Cone(m, 23, 26, -11, 7, 9.2, 5, C[0], 24);                     /* flare */
    _r3Cyl(m, 23, 14, -11, 9.9, 0.9, C[3], C[1], 24);                 /* lift-joint bands */
    _r3Cyl(m, 23, 19, -11, 8.75, 0.9, C[3], C[1], 24);
    _r3Cyl(m, 23, 24, -11, 7.6, 0.9, C[3], C[1], 24);
    _r3Cyl(m, 23, 30.4, -11, 9.5, 1.4, C[3], DK[1], 24);              /* rim */
    _r3Cyl(m, 23, 31.8, -11, 7, 0.5, DK[0], DK[0], 22);               /* dark throat */
    apRailX(18.5, 27.5, 32.3, -2.4, 4, S[3]);                         /* rim gallery, sized
                                                   to the chord it actually stands on - a
                                                   wider rail hangs off the rim in mid-air */
    _r3Cyl(m, 30.4, 32.3, -8, 0.9, 1.6, apLt, apLt, 16);

    /* ---- cold-water mains, hall to tower -----------------------------------------
       Carried OVER the annexe on a trestled bridge at y = 16-20. Run at ground level it
       would be inside the turbine hall for most of its length and behind the annexe for the
       rest; up here it is the line that ties the two halves of the plant together. */
    _r3Box(m, 12.2, 1.5, 6.4, 3, 16.5, 4.4, S[1], S[3]);              /* riser up the corner */
    _r3Box(m, 17.6, 16.4, 6.4, 13, 1.4, 5.4, S[1], S[3]);             /* bridge deck */
    _r3Box(m, 17.6, 17.8, 5.1, 13, 2.6, 2.6, S[2], S[0]);             /* cold main */
    _r3Box(m, 17.6, 17.8, 7.9, 13, 2.2, 2.2, S[1], S[3]);             /* return main */
    _r3Box(m, 22.6, 17.8, 3, 2.8, 2.6, 5.6, S[2], S[0]);              /* elbow to the shell */
    _r3Box(m, 22.6, 14.6, 1, 3.2, 4.8, 3.2, S[1], S[3]);
    for (ap0 = 0; ap0 < 2; ap0++)                                     /* trestles */
      _r3Box(m, 15 + ap0 * 5.4, 11.5, 6.4, 1.7, 5, 5, S[2], S[3]);

    /* ---- four stacks off the boiler roof -----------------------------------------
       Starting halfway up the building rather than at the ground is what separates a power
       station from a factory with pipes on it. Two tall and two short, alternating, so the
       skyline is a rhythm rather than a picket fence. */
    apStack(-25, -16.4, 26.5, 4.6, 16, 3);
    apStack(-15.5, -16.4, 26.5, 4.2, 12, 2);
    apStack(-6, -16.4, 26.5, 4.6, 15, 3);
    apStack(3.5, -16.4, 26.5, 4.2, 11, 2);
    _r3Box(m, -20.2, 26.5, -16.4, 5.5, 5, 6, S[1], S[3]);             /* cross-over flues */
    _r3Box(m, -20.2, 31.5, -16.4, 6.5, 1.2, 7, S[3], S[0]);
    _r3Box(m, -1.2, 26.5, -16.4, 5.5, 4.5, 6, S[1], S[3]);
    _r3Box(m, -1.2, 31, -16.4, 6.5, 1.2, 7, S[3], S[0]);
    _r3Box(m, -25, 38.5, -16.4, 13, 1, 12, S[2], S[1]);               /* service platforms */
    apRailX(-31, -19, 39.5, -10.7, 4, S[3]);
    _r3Box(m, -6, 37.5, -16.4, 13, 1, 12, S[2], S[1]);
    apRailX(-12, 0, 38.5, -10.7, 4, S[3]);
    apLad(-25, 29.5, -11, 9, 3);
    apLad(-6, 29.5, -11, 8, 3);

    /* ---- boiler house roof ------------------------------------------------------- */
    apRailX(-30, 8, 26.5, -11.8, 7, S[3]);
    _r3Box(m, 7, 26.5, -19.5, 4, 4.5, 5, DK[1], DK[3]);               /* hoist head */
    _r3Box(m, 7, 31, -19.5, 5.5, 1.2, 6, S[2], S[3]);
    apVent(-29.5, -19.5, 26.5, 1.6, 4.5);
    _r3Box(m, -11, 26.5, -20.6, 30, 1.4, 2.6, S[2], S[0]);            /* cable tray */

    /* ---- boiler house front -----------------------------------------------------
       The louvre row runs only across the WEST hall, which tops out at 16; over the east
       hall the same band is inside the building. The two trim courses and the team band sit
       above both roofs and are the strongest faction read in the sprite. */
    for (ap0 = 0; ap0 < 5; ap0++)
      _r3Box(m, -29.6 + ap0 * 4.2, 16.4, -8, 3.2, 4.4, 1.8, S[2], S[0]);
    _r3Box(m, -22, 21.0, -8, 22, 1.2, 1.8, B.trim, B.trim);
    _r3Box(m, -11, 23.2, -8, 42, 1.2, 1.8, B.trim, B.trim);
    _r3Box(m, -11, 24.4, -8.1, 40, 2.2, 2, TM[0], TM[1]);             /* boiler band */
    _r3Box(m, -30, 21.4, -8, 4, 4, 1.8, apLt, apLt);                  /* lit control gallery */

    /* ---- east hall deck, y = 20 -------------------------------------------------
       Tall plant at the back, low plant at the front, or the front object deletes the one
       behind it. */
    for (ap0 = 0; ap0 < 2; ap0++)                                     /* feed elbows up the
                                                                         boiler wall */
      _r3Box(m, -9.5 + ap0 * 4.6, 23.2, -6.6, 3, 4.6, 2.8, S[2], S[3]);
    _r3Box(m, 1, 20, -2.4, 5, 4, 5.4, S[2], S[3]);                    /* water tank plinth */
    _r3Cyl(m, 1, 24, -2.4, 3.6, 5.5, S[3], S[1], 20);
    _r3Cone(m, 1, 29.5, -2.4, 3.6, 1.2, 2, S[1], 20);
    _r3Box(m, 1, 24, 0.6, 1.3, 5.5, 1.3, S[2], S[2]);                 /* its downpipe */
    _r3Box(m, 7.5, 20, -3, 7, 4.5, 5, B.roof, B.trim);                /* air handler */
    _r3Box(m, 7.5, 24.5, -3, 6, 1.2, 3.8, S[2], S[3]);
    _r3Box(m, 7.5, 20.9, -0.2, 6, 3, 1.3, S[3], S[3]);
    apFan(-7.5, 4.6, 20, 2.7, 3.6, S[1]);
    apFan(-1, 4.6, 20, 2.7, 3.6, S[2]);
    apVent(5, 4.6, 20, 1.8, 5.5);
    _r3Box(m, -9.5, 20, 3, 2.8, 1.5, 2.8, DK[1], DK[3]);              /* roof hatch */
    _r3Box(m, -9.5, 21.5, 3, 3.2, 0.8, 3.2, S[2], S[3]);
    apRailX(-8, 8, 20, 7.4, 5, S[3]);
    apRailZ(-6, 7, 20, 8.6, S[3]);
    _r3Cyl(m, 8.6, 23, 7.4, 0.9, 3, apHz[0], apHz[1], 16);            /* corner marker */
    _r3Cyl(m, -8.6, 20, 6.8, 0.9, 1.7, apLt, apLt, 16);               /* deck lamp */

    /* ---- west hall deck, y = 16 -------------------------------------------------- */
    _r3Box(m, -22, 16, -6.6, 15, 3.2, 2.6, S[1], S[3]);               /* boiler feed duct */
    for (ap0 = 0; ap0 < 2; ap0++)
      _r3Box(m, -29 + ap0 * 4.6, 19.2, -6.6, 3, 4.4, 2.8, S[2], S[3]);
    _r3Box(m, -20, 16, -2.6, 9, 4.5, 4.5, DK[1], DK[3]);              /* air handler */
    _r3Box(m, -20, 20.5, -2.6, 7.5, 1.2, 3.4, S[2], S[3]);
    _r3Box(m, -20, 16.9, -0.1, 8, 3, 1.3, S[3], S[3]);
    _r3Box(m, -14.6, 16.9, -2.6, 2, 3.4, 3.4, S[1], S[3]);
    apFan(-28.6, 3.6, 16, 2.6, 3.4, S[2]);
    apFan(-22, 3.6, 16, 2.6, 3.4, S[1]);
    _r3Box(m, -15.5, 16, 4.4, 2.6, 1.2, 7, S[2], S[0]);               /* cable tray */
    _r3Cyl(m, -31, 16, -5.5, 0.8, 14, S[3], S[3], 16);                /* aerial mast */
    _r3Box(m, -31, 25, -5.5, 5, 0.9, 0.9, S[2], S[3]);
    _r3Box(m, -31, 27, -5.5, 3.6, 0.9, 0.9, S[2], S[3]);
    _r3Cyl(m, -31, 30, -5.5, 0.8, 1.4, apLt, apLt, 16);
    apRailX(-30.4, -13.6, 16, 7.2, 5, S[3]);
    apRailZ(-6, 7, 16, -30.8, S[3]);
    _r3Cyl(m, -30.8, 19, 7.2, 0.9, 3, apHz[0], apHz[1], 16);
    _r3Cyl(m, -13.6, 16, 6.6, 0.9, 1.7, apLt, apLt, 16);

    /* ---- annexe roof, y = 11.5 --------------------------------------------------- */
    apFan(18, 8, 11.5, 2.6, 3.4, S[1]);
    apVent(24.5, 8, 11.5, 1.5, 3.6);
    _r3Box(m, 24, 11.5, 12.6, 15, 1.3, 2.6, S[2], S[0]);              /* cable tray */
    _r3Box(m, 30, 11.5, 9.5, 5.5, 3.6, 5, B.roof, B.trim);            /* switchgear kiosk */
    _r3Box(m, 30, 15.1, 9.5, 6.5, 1, 5.6, S[2], S[3]);
    apRailX(16, 32, 11.5, 14.2, 5, S[3]);
    apRailZ(6, 14, 11.5, 15.6, S[3]);
    _r3Cyl(m, 32, 11.5, 13.6, 0.9, 1.7, apLt, apLt, 16);

    /* ---- hall facade, z = 9, UPPER BAND ONLY -------------------------------------
       Everything below about y = 12 on this elevation is behind the switchyard, so nothing
       is built there: no plinth course, no ground-storey windows, no full-height pilasters.
       The pilasters start at 8 (their feet are hidden and cost nothing), and the storey that
       does show carries the windows, the team cornice and the parapet. Set by hand rather
       than through winRow/pilasters because the two blocks stand at different heights and
       the cornice has to step with them. */
    for (ap0 = 0; ap0 < 4; ap0++)                                     /* west block */
      _r3Box(m, -31.5 + ap0 * 6.8, 8, 9.9, 3.2, 6.8, 1.8, B.trim, B.trim);
    for (ap0 = 0; ap0 < 3; ap0++)
      _r3Box(m, -28.1 + ap0 * 6.8, 11.6, 10, 4.4, 3.2, 1.7, ap0 === 1 ? apLt : apGl, apGl);
    _r3Box(m, -22, 14.8, 10.1, 22.5, 1.6, 2, TM[0], TM[1]);           /* west cornice */
    _r3Box(m, -22, 16.4, 9.8, 23, 1, 1.5, B.dark, B.dark);            /* west parapet */
    for (ap0 = 0; ap0 < 4; ap0++)                                     /* east block */
      _r3Box(m, -9.6 + ap0 * 6.4, 9, 9.9, 3.2, 9.6, 1.8, B.trim, B.trim);
    for (ap0 = 0; ap0 < 3; ap0++)
      _r3Box(m, -6.4 + ap0 * 6.4, 12.4, 10, 4.2, 3.6, 1.7, apGl, apGl);
    for (ap0 = 0; ap0 < 3; ap0++)
      _r3Box(m, -6.4 + ap0 * 6.4, 16.4, 10, 4.2, 2.2, 1.7, ap0 === 1 ? apLt : apGl, apGl);
    _r3Box(m, 0, 18.6, 10.1, 22.5, 1.8, 2, TM[0], TM[1]);             /* east cornice */
    _r3Box(m, 0, 20.4, 9.8, 23, 1, 1.5, B.dark, B.dark);              /* east parapet */
    _r3Box(m, 10.4, 8, 10.1, 2.6, 12, 2, S[2], S[0]);                 /* corner cable riser */
    _r3Box(m, 10.4, 20, 9.4, 3.2, 1.4, 3.6, S[3], S[1]);
    /* Stair tower on the west return, outboard of the hall wall: it is the only part of the
       building standing clear of the yard all the way down, so it gets a head band. */
    _r3Box(m, -33.6, 1.5, 6.4, 3.4, 16, 6, B.wall, B.roof);
    _r3Box(m, -33.6, 14.2, 6.4, 4, 1.6, 6.6, TM[0], TM[1]);
    _r3Box(m, -33.6, 15.8, 6.4, 3.6, 1, 6, B.dark, B.dark);
    _r3Box(m, -33.6, 9.6, 9.7, 2.4, 3, 1.6, apGl, apGl);
    _r3Box(m, -33.6, 12.9, 9.7, 2.8, 1.6, 1.6, apHz[0], apHz[1]);     /* HV warning plate */

    /* ---- annexe face, z = 17 - the one elevation nothing stands in front of ------
       Pilasters and glazing go in the bay east of the door, because the door frame, the
       canopy posts and the day tank between them cover every other bay on this face. */
    _r3Box(m, 24, 1.5, 17.9, 22, 2.4, 1.8, C[2], C[0]);               /* plinth */
    _r3Box(m, 30.4, 1.5, 17.9, 2.8, 8.5, 1.8, B.trim, B.trim);
    _r3Box(m, 34.2, 1.5, 17.9, 2.8, 8.5, 1.8, B.trim, B.trim);
    _r3Box(m, 32.3, 4.4, 18, 3, 3.2, 1.7, apGl, apGl);
    _r3Box(m, 32.3, 8.2, 18, 3, 1.8, 1.7, apLt, apLt);
    _r3Box(m, 32.3, 10.2, 18.7, 5.4, 1.2, 2.8, S[3], S[1]);           /* its hood */
    _r3Box(m, 24, 1.5, 18.1, 9, 7.5, 2, B.dark, B.dark);              /* door frame */
    _r3Box(m, 24, 1.9, 19.1, 7, 6.6, 1.2, S[2], S[1]);                /* roller shutter */
    for (ap0 = 0; ap0 < 3; ap0++)
      _r3Box(m, 24, 3 + ap0 * 2.1, 19.8, 6.6, 0.9, 0.7, S[0], S[3]);
    _r3Box(m, 24, 10.4, 20, 12, 1.4, 6.5, S[3], S[1]);                /* canopy on two posts,
                                                   set wide of the frame so its reveals show */
    _r3Box(m, 18.6, 1.5, 22.6, 1.6, 9, 1.6, S[2], S[3]);
    _r3Box(m, 29.4, 1.5, 22.6, 1.6, 9, 1.6, S[2], S[3]);
    _r3Box(m, 24, 1.9, 20.6, 10, 0.7, 4.5, C[1], C[3]);               /* step out of the door */
    _r3Box(m, 24, 9.6, 18.1, 22.5, 1.8, 2, TM[0], TM[1]);             /* annexe head */
    _r3Box(m, 24, 11.4, 17.8, 23, 1, 1.5, B.dark, B.dark);

    /* ---- switchyard --------------------------------------------------------------
       Four transformers where the Power Plant has three, spread over the whole forecourt on
       their own pads. The gantry is a two-post portal per side rather than a four-leg
       lattice - a back leg sits exactly behind its front leg and inside the end transformer,
       so it is geometry nobody ever sees. The busbar rests ON its insulator caps instead of
       swallowing them. */
    _r3Box(m, -12, 1.5, 17, 46, 0.7, 13.8, C[0], C[3]);
    apXfmr(-30, 16);
    apXfmr(-19.5, 16);
    apXfmr(-9, 16);
    apXfmr(1.5, 16);
    for (ap0 = 0; ap0 < 4; ap0++)                                     /* gantry posts */
      _r3Box(m, (ap0 < 2 ? -33 : 9) + ((ap0 % 2) ? 2 : -2), 1.5, 22.9, 1.6, 10, 1.6, S[2], S[3]);
    for (ap0 = 0; ap0 < 4; ap0++)                                     /* their cross ties */
      _r3Box(m, ap0 < 2 ? -33 : 9, 4.5 + (ap0 % 2) * 4, 21.3, 5, 1, 4, S[1], S[3]);
    _r3Box(m, -12, 11.5, 21.3, 44, 2.2, 2.6, S[1], S[3]);             /* head beam */
    _r3Box(m, -12, 8.8, 21.3, 42, 1.4, 1.8, S[2], S[3]);
    for (ap0 = 0; ap0 < 4; ap0++) apBush(-27 + ap0 * 10, 21.3, 13.7, 0.75);
    _r3Box(m, -12, 18.3, 21.3, 42, 1.4, 1.2, S[3], S[0]);             /* the busbar itself */
    for (ap0 = 0; ap0 < 7; ap0++)                                     /* yard kerb striping */
      _r3Box(m, -31 + ap0 * 6.4, 1.5, 23.1, 5.8, 1.1, 1.6,
        ap0 % 2 ? apHz[1] : apHz[0], apHz[0]);

    /* ---- yard furniture ---------------------------------------------------------- */
    for (ap0 = 0; ap0 < 3; ap0++)                                     /* fuel drums */
      _r3Cyl(m, -25 + ap0 * 3.6, 2.2, 20.4, 1.9, 4.4, ap0 === 1 ? DK[1] : apHz[0], S[3], 16);
    _r3Cyl(m, -14.5, 2.2, 20, 3.4, 3.6, DK[1], DK[3], 18);            /* cable drum */
    _r3Cyl(m, -14.5, 2.4, 20, 2.4, 3.4, S[2], S[0], 16);
    _r3Box(m, -4, 2.2, 20.4, 5.5, 3.2, 4.5, B.roof, B.trim);          /* crates on a pallet */
    _r3Box(m, -4, 5.4, 20.4, 5.8, 0.8, 4.8, B.trim, B.trim);
    _r3Box(m, 5.5, 2.2, 20, 4.6, 2.6, 4, B.roof, B.trim);
    _r3Box(m, 15, 1.9, 20.4, 10, 1.4, 6.6, C[2], C[1]);               /* bund under the tank */
    _r3Cyl(m, 15, 2.2, 20.4, 3.1, 7, S[0], S[3], 18);                 /* day tank */
    _r3Cyl(m, 15, 9.2, 20.4, 3.1, 1, S[3], S[1], 18);
    _r3Box(m, 18.8, 2.2, 20.4, 2, 5, 2, S[2], S[3]);
    for (ap0 = 0; ap0 < 3; ap0++)                                     /* bollards at the door */
      _r3Cyl(m, 21.6 + ap0 * 2.4, 2.2, 22.7, 1.1, 3.4, apHz[0], apHz[1], 16);
  } else if (key === 'silo') {
    /* Scrap Silo: two fat ribbed tanks side by side, a conveyor bridge landing on both crowns,
       a head house over the right one, and an inclined conveyor climbing to it out of an open
       receiving bay at the front left. Upright cylinders are the one silhouette in the base
       that cannot be mistaken for a shed, which matters - this is the building the player has
       to notice they are short of.
       Three things here are forced by the projection and each replaced something that failed.
       The tanks are as fat as the footprint allows and carry only THREE hoops: a first pass
       with slim tanks and seven hoops sliced each barrel into bands and the pair read as one
       corrugated wall, because the ribs covered more of the cylinder than the cylinder did.
       They are pale concrete over a deliberately dark pad and dark steel bands, since a silo
       in the same blue-grey as its own pipework has no edge to be seen against. And the
       conveyor climbs along X, not along Z: screenY = z - 1.3y, so a run along z projects to a
       vertical bar however steeply it rises, while one that gains x as it gains height lands
       as a real diagonal - the only slanted line in the model, and the thing that stops the
       top half being a row of upright cans.
       The heaped scrap in the bay is the only cue for WHAT is stored, so it is torn plate,
       girder and crushed drums rather than a smooth mound - a smooth mound is ore, and ore
       belongs to the refinery.
       Every part below was measured by baking the sprite without it and counting the pixels
       that changed, because this camera hides more than it shows: the front row - heap,
       cabinet, transformer, pipe run - covers both tank feet completely, so detail down there
       is spent for nothing, and detail belongs on the barrels, the terraces of the heap and
       the strip to the right of the cabinet, which are what the player actually sees. */

    /* Two rails and a run of rungs. A tank with no ladder on it reads as a fuel drum, and at
       3x supersample the rungs are the finest thing here that still survives to the sprite. */
    var slLadder = function (lx, ly, lz, lh, ln) {
      _r3Box(m, lx - 1.6, ly, lz, 0.9, lh, 0.9, S[1], S[3]);
      _r3Box(m, lx + 1.6, ly, lz, 0.9, lh, 0.9, S[1], S[3]);
      for (var q = 0; q < ln; q++)
        _r3Box(m, lx, ly + 1.7 + q * (lh - 2.6) / (ln - 1), lz, 3.9, 0.55, 0.7, S[3], S[0]);
    };
    /* Uprights plus a top rail, always at the FRONT lip of what it guards - a railing set back
       on the deck just disappears behind its own parapet. */
    var slRail = function (rx0, rx1, ry, rz, rn, rh) {
      for (var q = 0; q < rn; q++)
        _r3Box(m, rx0 + (rx1 - rx0) * q / (rn - 1), ry, rz, 0.75, rh, 0.75, S[1], S[3]);
      _r3Box(m, (rx0 + rx1) / 2, ry + rh, rz, rx1 - rx0 + 1.2, 0.75, 0.95, S[0], S[3]);
    };
    /* Where the 10.2 barrel actually is at a given x offset, so wall-mounted kit lands ON the
       curve instead of floating off it or sinking into it. */
    var slWallZ = function (dx) { return -7 + Math.sqrt(Math.max(0.01, 104.04 - dx * dx)); };

    /* ---- pad, aprons, ground markings ---- */
    _r3Slab(m, 0, 0, 0, W - 2, 2.2, D - 2, 1.5, DK[2], DK[1]);       /* dark oiled hardstanding */
    _r3Box(m, 12, 2.2, 15, 21, 0.5, 15, C[2], C[0]);                 /* swept apron, front right */
    _r3Box(m, 0, 2.2, -18, 34, 0.5, 9, C[2], C[0]);                  /* apron behind the tanks */
    _r3Box(m, -13, 2.7, D / 2 - 2.6, 21, 0.6, 3.6, RTS_PAL.hazard[1], RTS_PAL.hazard[1]);
    for (i = 0; i < 6; i++)                                          /* hazard chevrons, bay mouth */
      _r3Box(m, -21.5 + i * 3.4, 3.0, D / 2 - 2.6, 1.9, 0.5, 3.6,
             RTS_PAL.hazard[0], RTS_PAL.hazard[0]);
    for (i = 0; i < 3; i++) {                                        /* bollards on the apron */
      _r3Cyl(m, 14 + i * 4, 2.2, 21.4, 1.2, 4.4, C[3], C[0], 16);
      _r3Box(m, 14 + i * 4, 5.6, 21.4, 2.8, 0.7, 2.8, RTS_PAL.hazard[0], RTS_PAL.hazard[0]);
    }

    /* ---- open receiving bay, front left ---- */
    _r3Box(m, -13, 2.2, 14.5, 20, 0.6, 16, DK[2], DK[3]);            /* bay floor */
    _r3Slab(m, -13, 2.2, 6.0, 20, 7.5, 3.0, 1.2, C[0], C[1]);        /* back retaining wall */
    _r3Slab(m, -22.2, 2.2, 14.5, 3.2, 7.5, 16, 1.2, C[0], C[1]);     /* left wall */
    _r3Slab(m, -4.6, 2.2, 14.5, 3.2, 7.5, 16, 1.2, C[0], C[1]);      /* right wall */
    _r3Box(m, -4.6, 9.7, 14.5, 3.8, 1.0, 16, TM[1], TM[0]);          /* team capping on the walls - */
    _r3Box(m, -22.2, 9.7, 14.5, 3.4, 1.0, 16, TM[1], TM[0]);         /* both cheeks, not just one */
    _r3Box(m, -13, 9.7, 6.0, 20, 1.0, 3.6, TM[0], TM[1]);
    _r3Box(m, -22.2, 6.0, 22.4, 3.2, 1.4, 1.6, RTS_PAL.hazard[0], RTS_PAL.hazard[1]);  /* bumpers on */
    _r3Box(m, -4.6, 6.0, 22.4, 3.2, 1.4, 1.6, RTS_PAL.hazard[0], RTS_PAL.hazard[1]);   /* the mouth */
    _r3Box(m, -13, 2.8, 14.5, 17, 3.6, 13, RTS_PAL.ore[3], RTS_PAL.ore[4]);   /* the heap */
    _r3Box(m, -13, 6.4, 14.0, 14, 3.0, 11, RTS_PAL.ore[0], RTS_PAL.ore[1]);
    _r3Box(m, -14, 9.4, 13.5, 10, 2.6, 8.5, RTS_PAL.ore[1], RTS_PAL.ore[2]);
    _r3Box(m, -15, 12.0, 13.0, 6, 2.2, 5.0, RTS_PAL.ore[2], RTS_PAL.ore[2]);
    /* Scrap goes on the TERRACES of that heap - on each tier's top, in front of the tier
       above. Scattered through the volume instead, five of these eight and four of the six
       drums baked to nothing: a heap is opaque, and anything inside one is a wasted call. */
    for (i = 0; i < 8; i++) {                                        /* torn plate and offcuts */
      var slk = i % 4;
      _r3Box(m, -17.5 + slk * 1.6 - ((i / 4) | 0) * 3.4, 6.4 + slk * 2.6, 19.2 - slk * 2.0,
             2.2, 0.9 + (i % 2) * 1.3, 1.8, (i % 2) ? S[2] : DK[1], (i % 2) ? S[1] : DK[3]);
    }
    for (i = 0; i < 6; i++)                                          /* crushed drums */
      _r3Cyl(m, -19.5 + (i % 3) * 2.2 + ((i / 3) | 0) * 5.4, 6.4 + (i % 3) * 2.6,
             19.5 - (i % 3) * 2.0, 1.3, 2.3,
             (i % 2) ? RTS_PAL.ore[1] : RTS_PAL.rock[2], RTS_PAL.ore[2], 16);
    for (i = 0; i < 5; i++)                                          /* girder ends poking out */
      _r3Box(m, -18 + i * 3.0, 11.2 + (i % 2) * 1.9, 13 + (i % 3) * 2.4,
             6.0 - (i % 2) * 2.2, 0.9, 1.2, S[3], S[0]);
    for (i = 0; i < 5; i++)                                          /* grizzly bars over the mouth */
      _r3Box(m, -13, 9.9, 17.0 + i * 1.4, 20, 0.7, 0.9, S[2], S[1]);

    /* ---- the two tanks ---- */
    for (i = 0; i < 2; i++) {
      var slx = -11.6 + i * 23.2;
      _r3Cyl(m, slx, 2.2, -7, 11.0, 1.6, C[2], C[0], 20);            /* ring foundation */
      _r3Cyl(m, slx, 3.8, -7, 9.4, 4.2, DK[3], DK[1], 20);           /* skirt, undercut for shadow */
      _r3Cyl(m, slx, 8.0, -7, 10.2, 20.0, C[3], C[1], 20);           /* barrel, slipformed concrete */
      _r3Cyl(m, slx, 8.2, -7, 10.6, 2.2, TM[0], TM[1], 20);          /* team band round the foot */
      for (var slb = 0; slb < 3; slb++)                              /* hoop stiffeners */
        _r3Cyl(m, slx, 13.5 + slb * 5.5, -7, 10.7, 1.1, S[2], S[3], 20);
      _r3Box(m, slx + 7.4, 13.0, slWallZ(7.4) + 0.9, 1.2, 11.0, 1.2, DK[1], DK[3]);  /* level gauge */
      for (slb = 0; slb < 2; slb++)                                  /* its lit tell-tales */
        _r3Box(m, slx + 7.4, 15.0 + slb * 5.5, slWallZ(7.4) + 1.4, 2.4, 1.2, 0.9,
               RTS_PAL.lit, RTS_PAL.lit);
      _r3Box(m, slx - 7.0, 10.6, slWallZ(7.0) + 0.9, 1.2, 17.0, 1.2, S[1], S[3]);    /* dust downpipe */
      _r3Box(m, slx - 7.0, 26.4, slWallZ(7.0) + 1.1, 3.4, 1.4, 2.2, S[0], S[3]);     /* and its head */
      _r3Cone(m, slx, 3.2, 1.0, 1.6, 3.6, 3.6, S[2], 16);            /* discharge boot under the skirt */
      /* The barrel is the one big lit surface this model has, so the kit that used to sit at
         the foot - slide gate, outlet spout, skirt door - is up here instead, where it is
         not behind the heap on the left and the cabinet on the right. */
      _r3Box(m, slx - 1.6, 16.6, slWallZ(1.6) + 0.7, 6.6, 1.0, 1.6, S[2], S[3]);     /* ladder rest */
      _r3Box(m, slx - 3.4, 13.5, slWallZ(3.4) + 0.8, 3.4, 3.2, 1.6, DK[0], DK[2]);   /* manway */
      _r3Box(m, slx + 3.4, 21.4, slWallZ(3.4) + 0.7, 2.6, 3.2, 1.4, DK[0], DK[2]);   /* upper hatch */
      _r3Cyl(m, slx, 28.0, -7, 11.4, 1.2, S[2], S[0], 20);           /* crown walkway ring */
      _r3Cone(m, slx, 29.2, -7, 10.2, 2.6, 4.8, B.roof, 20);         /* conical roof, faction tone */
      if (i === 0) {                                                 /* vent on the LEFT crown only: */
        _r3Cyl(m, slx, 34.0, -7, 2.9, 1.2, S[1], S[3], 16);          /* the right crown is inside the */
        _r3Cyl(m, slx, 35.2, -7, 1.8, 4.2, DK[1], DK[3], 16);        /* head house and a stack built */
        _r3Cone(m, slx, 39.4, -7, 3.0, 1.6, 1.6, S[2], 16);          /* there bakes to nothing */
      }
      for (slb = 0; slb < 6; slb++)                                  /* crown handrail, front arc */
        _r3Box(m, slx + Math.cos(0.36 + slb * 0.49) * 10.9, 29.2,
               -7 + Math.sin(0.36 + slb * 0.49) * 10.9, 0.85, 3.4, 0.85, S[1], S[3]);
      for (slb = 0; slb < 5; slb++)                                  /* and its top rail, chorded */
        _r3Box(m, slx + (Math.cos(0.36 + slb * 0.49) + Math.cos(0.85 + slb * 0.49)) * 5.45, 32.2,
               -7 + (Math.sin(0.36 + slb * 0.49) + Math.sin(0.85 + slb * 0.49)) * 5.45,
               Math.abs(Math.cos(0.36 + slb * 0.49) - Math.cos(0.85 + slb * 0.49)) * 10.9 + 0.9,
               0.75,
               Math.abs(Math.sin(0.36 + slb * 0.49) - Math.sin(0.85 + slb * 0.49)) * 10.9 + 0.9,
               S[0], S[3]);
      slLadder(slx, 8.0, 3.9, 21.0, 8);                              /* tank ladder, dead front */
      _r3Cone(m, slx, 31.2, -7, 7.4, 6.9, 0.9, S[2], 20);            /* dark ribs round the cone - */
      _r3Cone(m, slx, 32.6, -7, 5.3, 4.8, 0.9, S[2], 20);            /* the roof is the visible face */
      _r3Cyl(m, slx + 7.8, 29.2, 0.2, 1.0, 3.2, DK[1], DK[3], 16);   /* obstruction beacon */
      _r3Cone(m, slx + 7.8, 32.4, 0.2, 1.4, 0.9, 1.6, RTS_PAL.hazard[0], 16);
    }

    /* ---- conveyor bridge landing on both crowns ---- */
    _r3Box(m, 0, 34.2, -2.0, 24, 3.4, 5.0, S[0], S[2]);
    _r3Gable(m, -3.0, 37.6, -2.0, 18, 2.4, 5.4, B.roof);             /* covered as far as the head */
    _r3Box(m, -2.0, 37.1, 0.4, 19, 1.5, 1.3, TM[0], TM[1]);          /* team stripe along it */
    _r3Box(m, 0, 34.2, 1.6, 24, 0.8, 2.6, S[2], S[3]);               /* catwalk on the front side */
    slRail(-11, 11, 35.0, 2.6, 8, 3.0);
    /* Hangers on the catwalk's FRONT lip. Slung under the bridge instead - which is where an
       under-truss belongs - all six baked to zero pixels: the tank roof cones stand in front
       of that gap and swallow it whole. */
    for (i = 0; i < 6; i++)
      _r3Box(m, -10 + i * 4.0, 31.4, 2.0, 1.3, 2.8, 2.0, S[3], S[0]);
    for (i = 0; i < 2; i++)                                          /* drop chutes into the roofs */
      _r3Cyl(m, -11.6 + i * 23.2, 32.4, -2.0, 2.4, 2.0, S[2], S[3], 16);

    /* ---- head house over the right tank, where the incline discharges ---- */
    _r3Slab(m, 12, 37.6, 0, 10, 8.6, 10, 2.2, B.wall, B.roof);
    _r3Box(m, 12, 42.4, 5.7, 7.5, 1.8, 1.5, TM[0], TM[1]);           /* team panel */
    winRow(6.2, 38.8, 12, 2, 4.2, 3.0, 2.8);                         /* lit control windows */
    _r3Box(m, 6.6, 38.6, 1.0, 3.4, 4.4, 5.0, DK[1], DK[3]);          /* head drive motor */
    _r3Box(m, 17.2, 38.6, 1.0, 3.2, 3.2, 4.6, S[2], S[1]);           /* take-up gear */
    _r3Box(m, 10.8, 46.2, -1.0, 3.2, 2.2, 3.0, DK[1], DK[3]);        /* roof hatch */
    _r3Cyl(m, 13.8, 46.2, 1.4, 1.5, 3.0, S[2], S[1], 16);            /* extractor */
    _r3Cone(m, 13.8, 49.2, 1.4, 2.0, 1.2, 1.4, S[0], 16);            /* its cowl */
    _r3Cyl(m, 10.2, 46.2, -2.0, 0.7, 4.5, S[2], S[3], 16);           /* aerial */
    _r3Cyl(m, 10.2, 50.7, -2.0, 1.2, 1.5, RTS_PAL.hazard[0], RTS_PAL.lit, 16);

    /* ---- inclined conveyor, bay to head house. Stepped casing blocks, each overlapping the
       next by more than half so the run fills in solid instead of reading as beads ---- */
    _r3Box(m, -16, 2.8, 6.5, 7.0, 5.2, 5.0, C[2], C[0]);             /* tail pier */
    _r3Cyl(m, -16, 8.0, 6.5, 2.4, 1.8, DK[1], S[3], 16);             /* tail pulley housing */
    _r3Box(m, -16, 10.0, 7.6, 6.4, 6.0, 5.6, S[1], S[3]);            /* tail hopper - tall enough to
                                                                        clear the peak of the heap */
    for (i = 0; i < 13; i++) {
      var slt = i / 12, slcx = -16 + 28 * slt, slcy = 7 + 29 * slt, slcz = 6.5 - 4.5 * slt;
      _r3Box(m, slcx, slcy, slcz, 5.2, 3.0, 5.2, (i % 2) ? S[0] : S[1], S[3]);
      if (i % 3 === 0) _r3Box(m, slcx, slcy + 3.0, slcz, 4.2, 0.9, 4.2, TM[1], TM[0]);
      if (i % 2 === 0) _r3Box(m, slcx, slcy + 3.2, slcz + 2.4, 4.0, 2.4, 0.7, S[2], S[1]);
    }
    _r3Box(m, -2, 2.2, 4.25, 2.6, 18.8, 2.6, S[2], S[1]);            /* column under the mid span */
    _r3Box(m, -2, 8.0, 4.25, 4.6, 1.0, 1.4, S[3], S[0]);             /* its braces */
    _r3Box(m, -2, 14.0, 4.25, 4.6, 1.0, 1.4, S[3], S[0]);
    _r3Box(m, -9, 12.4, 4.6, 1.8, 2.0, 4.0, S[3], S[0]);             /* knee braces up to the casing, */
    _r3Box(m, 6, 29.2, 5.8, 1.8, 1.8, 1.6, S[3], S[0]);              /* both on its front face */

    /* ---- discharge pipework running out to the plant riser ---- */
    _r3Box(m, 10, 4.2, 5.4, 24, 2.0, 2.0, S[2], S[1]);               /* discharge main */
    _r3Box(m, 10, 6.4, 5.4, 22, 1.5, 1.5, S[1], S[3]);               /* dust return line */
    for (i = 0; i < 5; i++)                                          /* saddles under it */
      _r3Box(m, -1 + i * 5.5, 2.2, 5.4, 1.8, 2.0, 3.4, C[2], C[0]);
    _r3Cyl(m, 20.5, 2.2, 5.4, 2.2, 11.0, S[2], S[1], 16);            /* riser */
    _r3Cyl(m, 20.5, 13.2, 5.4, 2.7, 1.2, S[0], S[3], 16);            /* riser flange */
    _r3Cyl(m, 20.5, 14.4, 5.4, 1.4, 2.4, DK[1], DK[3], 16);          /* valve body */
    _r3Cyl(m, 20.5, 16.8, 5.4, 2.4, 0.7, RTS_PAL.hazard[0], RTS_PAL.hazard[0], 16);  /* handwheel */

    /* ---- control cabinet and yard clutter, front right ---- */
    _r3Slab(m, 13, 2.2, 15, 14, 9, 10, 2.2, B.wall, B.roof);
    _r3Box(m, 13, 9.6, 20.9, 10, 1.6, 1.5, TM[0], TM[1]);            /* team panel over the door */
    winRow(20.9, 5.6, 15.5, 2, 5.0, 3.4, 3.0);
    _r3Box(m, 8.4, 2.2, 21.0, 4.6, 6.6, 1.8, DK[0], DK[2]);          /* door */
    _r3Box(m, 8.4, 2.2, 22.4, 5.8, 0.8, 1.8, C[3], C[1]);            /* step */
    _r3Box(m, 19.2, 2.2, 20.6, 1.6, 8.0, 1.6, S[2], S[1]);           /* wall conduit */
    _r3Box(m, 19.2, 10.2, 17.0, 1.6, 1.4, 7.6, S[2], S[1]);          /* and its roof run */
    _r3Box(m, 11.0, 11.2, 14.5, 4.6, 3.0, 4.0, DK[1], DK[3]);        /* roof air handler */
    _r3Box(m, 15.6, 11.2, 14.5, 3.6, 2.2, 3.4, S[2], S[1]);          /* roof vent box */
    _r3Cyl(m, 15.6, 13.4, 14.5, 1.5, 1.8, S[0], S[3], 16);
    slRail(7.5, 18.5, 11.2, 18.2, 5, 2.6);                           /* roof edge rail */
    _r3Box(m, 2.0, 2.2, 12.5, 5.0, 5.4, 5.0, S[2], S[1]);            /* transformer */
    for (i = 0; i < 4; i++)                                          /* its cooling fins */
      _r3Box(m, 0.0 + i * 1.3, 2.2, 12.5, 0.7, 5.0, 5.6, S[3], S[0]);
    _r3Box(m, 2.0, 7.6, 12.5, 3.0, 1.0, 3.0, DK[1], DK[3]);
    for (i = 0; i < 4; i++) {                                        /* barrels */
      _r3Cyl(m, 1.0 + (i % 2) * 3.4, 2.2, 21.0 - ((i / 2) | 0) * 3.6, 1.7, 4.0,
             (i % 2) ? RTS_PAL.hazard[0] : S[2], S[3], 16);
      _r3Cyl(m, 1.0 + (i % 2) * 3.4, 6.2, 21.0 - ((i / 2) | 0) * 3.6, 1.8, 0.5, DK[1], DK[3], 16);
    }
    /* The strip right of the cabinet is the only clear ground left on this side - screenX is
       x, so anything past x=20 stands clear of it. Both of these were behind something. */
    _r3Cyl(m, 21.8, 2.2, 9.6, 2.0, 3.4, S[3], S[0], 16);             /* cable drum */
    _r3Cyl(m, 21.8, 2.2, 9.6, 0.9, 4.2, DK[1], DK[3], 16);
    _r3Box(m, 21.4, 2.2, 15.0, 4.0, 2.6, 4.0, RTS_PAL.dirt[2], RTS_PAL.dirt[3]);  /* pallet stack */
    _r3Box(m, 21.4, 4.8, 15.0, 3.6, 2.2, 3.6, RTS_PAL.dirt[0], RTS_PAL.dirt[1]);
    _r3Box(m, 21.4, 7.0, 15.0, 3.0, 1.8, 3.0, S[2], S[1]);           /* crate on top */
  } else if (key === 'kennel') {
    /* Attack Dog Kennel: a low shed with a row of arched dog doors along its front, three
       fenced runs hanging off it, and a flat-roofed feed store on the end. Everything on it
       is chosen to say "animals live here" rather than "this shoots back" - batten courses
       on a hipped roof, a louvred ridge vent, a header tank, a trough, bowls, straw and
       sacks. The three narrow runs are the whole identity: a row of small openings at ankle
       height with a walled pen in front of each is a shape nothing else in the base has, and
       it survives to 24 pixels when finer detail does not.
       It is deliberately the SHORTEST thing in the base, and that took work. An earlier bake
       stood 19 units to the vent cap and came out 44 pixels tall on a 24-pixel tile - taller
       than the Flame Tower, which is exactly backwards for a building the brief calls small
       and obviously not a defence. The whole elevation is a third lower now, and the roof
       clutter that has to be tall - flue, extractor, dormers - is pushed FORWARD down the
       near slope, because under screenY = z - 1.3y height only costs sprite when it is set
       back; at the eave line it is free.
       Two silhouettes were fixed as well. The header tank and the roof extractor were first
       drums with domed caps and a stub on top, and at this size that reads as a missile;
       both are squat flat-lidded cans now. And the run fence is waist height and pushed to
       the front edge, because a full-height chain-link fence under this camera is an opaque
       grey wall across the bottom third of the sprite, hiding the yard it exists to enclose.
       The annexe roof is FLAT on purpose: a shallow pitch is the worst thing to put under
       this projection - rise over run near 1/1.3 goes edge-on and the plane collapses to a
       line - so the low mass earns its area as a deck with clutter on it while the shed
       carries the only pitch. Every upright is a 16-segment cylinder; posts and pipes are the
       only curves in the silhouette and faceting them shows immediately. */

    var knPost = function (px, pz, pr, ph) {                          /* fence post + cap */
      _r3Cyl(m, px, 2.25, pz, pr, ph, S[2], S[1], 16);
      _r3Cone(m, px, 2.25 + ph, pz, pr * 1.4, pr * 0.5, 0.6, S[0], 16);
    };
    var knBowl = function (bx, bz) {                                  /* feed bowl */
      _r3Cyl(m, bx, 2.4, bz, 1.15, 0.7, S[2], DK[1], 16);
      _r3Cyl(m, bx, 2.9, bz, 0.8, 0.4, DK[0], DK[0], 16);
    };
    var knPen = function (px) {                                       /* run divider wall */
      _r3Box(m, px, 2.6, 3.2, 0.5, 3.1, 6.8, S[3], S[3]);
      _r3Box(m, px, 5.7, 3.2, 0.95, 0.55, 7.0, S[1], S[0]);
      knPost(px, 0.0, 0.62, 3.3);
      knPost(px, 3.2, 0.62, 3.3);
      knPost(px, 6.4, 0.62, 3.3);
    };

    /* ---- ground: a kerbed concrete apron with the runs' worn dirt floor let into it ---- */
    _r3Box(m, 0, 0, 0, W - 0.4, 1.35, D - 0.4, C[0], C[2]);           /* kerb step, one wider */
    _r3Box(m, 0, 0, 0, W - 1.6, 2.25, D - 1.6, C[2], C[0]);           /* apron */
    _r3Box(m, 0, 2.25, 4.7, 20.4, 0.35, 12.8, RTS_PAL.dirt[1], RTS_PAL.dirt[3]);
    _r3Box(m, -6.2, 2.55, 6.6, 6.4, 0.2, 4.2, RTS_PAL.dirt[2], RTS_PAL.dirt[0]);   /* worn */
    _r3Box(m, 5.4, 2.55, 3.6, 5.0, 0.2, 3.4, RTS_PAL.dirt[0], RTS_PAL.dirt[3]);
    _r3Box(m, 1.2, 2.55, 9.2, 7.2, 0.2, 2.6, RTS_PAL.dirt[2], RTS_PAL.dirt[1]);
    _r3Box(m, -4.4, 2.35, 1.4, 15.0, 0.3, 1.7, DK[1], DK[2]);         /* wash-down channel */
    for (var kn0 = 0; kn0 < 6; kn0++)                                 /* its grate bars */
      _r3Box(m, -10.2 + kn0 * 2.6, 2.6, 1.4, 1.1, 0.2, 2.0, S[2], S[1]);
    _r3Box(m, -4.4, 2.25, -0.3, 15.0, 0.5, 1.9, C[3], C[1]);          /* threshold strip */
    _r3Box(m, 0, 2.6, 8.6, 7.0, 0.2, 1.2, RTS_PAL.hazard[0], RTS_PAL.hazard[0]);   /* gate */
    _r3Box(m, 0, 2.6, 9.9, 7.0, 0.2, 0.9, RTS_PAL.hazard[1], RTS_PAL.hazard[1]);

    /* ---- the shed: plinth, walls, hipped roof with batten courses ---- */
    _r3Box(m, -4.4, 2.25, -6.3, 15.0, 0.9, 9.8, C[1], C[3]);          /* plinth */
    _r3Slab(m, -4.4, 3.15, -6.45, 14.4, 6.2, 9.5, 1.2, B.wall, B.roof);
    _r3Hip(m, -4.4, 9.35, -6.2, 15.0, 3.8, 10.0, 3.2, B.roof);
    for (var kn1 = 0; kn1 < 5; kn1++) {                               /* batten courses */
      var knT = 0.13 + kn1 * 0.185;
      _r3Box(m, -4.4, 9.35 + knT * 3.8 - 0.55, -1.2 - knT * 5.0, 15.0 - 6.4 * knT - 0.8,
             1.5, 1.0, (kn1 === 2) ? TM[1] : ((kn1 % 2) ? B.dark : B.roof),
             (kn1 === 2) ? TM[0] : ((kn1 % 2) ? B.trim : C[2]));
    }
    _r3Box(m, -4.4, 8.50, -1.45, 14.4, 0.45, 1.0, S[2], S[3]);        /* gutter */
    _r3Box(m, -4.4, 8.90, -1.30, 15.0, 0.80, 0.9, B.trim, C[3]);      /* fascia */
    _r3Box(m, -4.4, 8.95, -1.30, 11.5, 0.50, 1.1, TM[0], TM[1]);      /* team band on it */
    _r3Cyl(m, -11.2, 2.25, -1.6, 0.7, 6.6, S[2], S[1], 16);           /* downpipes */
    _r3Cyl(m, 2.7, 2.25, -1.6, 0.7, 6.6, S[2], S[1], 16);
    _r3Box(m, -4.4, 12.60, -6.2, 9.2, 0.85, 1.8, B.dark, B.trim);     /* ridge cap */
    _r3Box(m, -1.7, 12.60, -5.5, 3.4, 1.00, 1.2, TM[0], TM[1]);       /* team ridge marker */
    /* The ridge ventilator is deliberately a LOW louvred hood, not a capped stack. Under
       screenY = z - 1.3y anything tall and set back is what decides the sprite's height, and
       this building must stay the shortest in the base. */
    _r3Box(m, -7.2, 12.70, -6.1, 4.6, 0.85, 2.2, S[2], S[1]);         /* ridge vent */
    for (var kn2 = 0; kn2 < 2; kn2++)                                 /* its louvres */
      _r3Box(m, -7.2, 12.80 + kn2 * 0.42, -5.1, 4.6, 0.30, 0.6, DK[1], DK[2]);
    _r3Box(m, -7.2, 13.55, -6.0, 5.2, 0.30, 2.5, S[0], S[3]);         /* vent lid */
    /* Roof clutter is pushed FORWARD down the near slope, where height is free. */
    _r3Cyl(m, -4.2, 11.00, -3.6, 0.75, 3.5, DK[1], DK[3], 16);        /* stove flue */
    _r3Cone(m, -4.2, 14.50, -3.6, 1.0, 0.55, 0.6, S[2], 16);
    _r3Cyl(m, -1.2, 10.70, -3.2, 1.5, 1.3, S[2], S[1], 16);           /* extractor, flat-lidded */
    _r3Cyl(m, -1.2, 12.00, -3.2, 1.9, 0.45, S[0], S[3], 16);
    /* Dormers rather than flush roof lights: anything laid flat ON this slope is buried by
       the slope itself within a unit of depth, so roof detail has to stand up off it. */
    _r3Box(m, -8.4, 10.00, -2.4, 3.0, 2.0, 1.9, B.wall, B.trim);      /* glazed roof light */
    _r3Box(m, -8.4, 10.50, -1.6, 2.0, 1.3, 0.7, RTS_PAL.glass, RTS_PAL.glass);
    _r3Gable(m, -8.4, 12.00, -2.4, 3.4, 1.1, 2.3, B.roof);
    _r3Box(m, 0.0, 10.00, -2.4, 3.0, 2.0, 1.9, B.wall, B.trim);       /* louvred twin */
    for (var kn3 = 0; kn3 < 3; kn3++)
      _r3Box(m, 0.0, 10.35 + kn3 * 0.5, -1.6, 2.0, 0.3, 0.7, DK[1], DK[2]);
    _r3Gable(m, 0.0, 12.00, -2.4, 3.4, 1.1, 2.3, B.roof);
    _r3Cyl(m, 2.0, 9.80, -2.0, 0.6, 2.0, S[2], S[1], 16);             /* yard light mast */
    _r3Cyl(m, 2.0, 11.80, -2.0, 0.9, 0.8, DK[1], RTS_PAL.lit, 16);
    _r3Cone(m, 2.0, 12.60, -2.0, 0.95, 0.4, 0.55, DK[0], 16);

    /* ---- shed front: three arched dog doors, piers between them, a lit clerestory ---- */
    var knDx = [-8.4, -4.2, 0.0];
    for (var kn4 = 0; kn4 < 3; kn4++) {
      var knX = knDx[kn4];
      _r3Box(m, knX, 3.15, -1.20, 2.8, 3.10, 1.2, DK[0], DK[2]);      /* the opening */
      _r3Cyl(m, knX, 6.25, -1.20, 1.4, 0.80, DK[0], DK[1], 16);       /* arched head */
      _r3Box(m, knX, 7.05, -1.10, 3.8, 0.80, 1.4, TM[0], TM[1]);      /* painted door head */
      _r3Box(m, knX, 3.05, 0.45, 3.4, 0.50, 1.9, C[3], C[1]);         /* worn threshold */
      _r3Box(m, knX, 3.30, -0.40, 2.4, 0.30, 0.9, DK[1], DK[2]);      /* rubber flap sill */
      _r3Box(m, knX + 1.6, 3.15, -0.85, 0.6, 3.6, 0.7, DK[1], DK[3]); /* hasp + chain peg */
    }
    var knPx = [-10.5, -6.3, -2.1, 2.1];
    for (var kn5 = 0; kn5 < 4; kn5++) {                               /* piers + corbels */
      _r3Box(m, knPx[kn5], 3.15, -1.15, 1.4, 5.20, 1.3, B.trim, C[3]);
      _r3Box(m, knPx[kn5], 8.35, -1.10, 1.8, 0.70, 1.5, C[3], C[1]);
    }
    _r3Box(m, -4.4, 3.15, -1.15, 14.4, 0.80, 1.2, C[2], C[0]);        /* base course */
    winRow(-1.05, 7.95, -4.2, 3, 4.2, 2.2, 0.9);                      /* clerestory */
    for (var kn6 = 0; kn6 < 2; kn6++) {                               /* two wall lamps */
      var knLx = kn6 ? 2.1 : -6.3;                                    /* on the piers */
      _r3Box(m, knLx, 7.60, -1.30, 0.6, 0.5, 2.0, S[2], S[1]);        /* bracket, proud */
      _r3Cone(m, knLx, 6.85, -0.35, 1.1, 0.5, 0.75, S[3], 16);        /* shade */
      _r3Cyl(m, knLx, 6.55, -0.35, 0.7, 0.35, RTS_PAL.lit, RTS_PAL.lit, 16);
    }

    /* ---- feed store annexe: lower, flat-roofed, parapeted, header tank on the deck ---- */
    _r3Box(m, 7.6, 2.25, -6.35, 8.6, 0.90, 9.8, C[1], C[3]);          /* plinth */
    _r3Box(m, 7.6, 3.15, -6.45, 8.4, 4.60, 9.5, B.wall, B.roof);
    _r3Box(m, 7.6, 7.75, -6.45, 7.2, 0.25, 8.3, C[2], C[0]);          /* roof deck */
    _r3Box(m, 7.6, 7.75, -2.15, 8.4, 1.10, 0.9, C[3], C[1]);          /* parapet ring */
    _r3Box(m, 7.6, 7.75, -10.75, 8.4, 1.10, 0.9, C[3], C[1]);
    _r3Box(m, 3.85, 7.75, -6.45, 0.9, 1.10, 9.5, C[3], C[1]);
    _r3Box(m, 11.35, 7.75, -6.45, 0.9, 1.10, 9.5, C[3], C[1]);
    _r3Box(m, 7.6, 8.85, -2.15, 6.8, 0.45, 1.0, TM[0], TM[1]);        /* team coping */
    for (var kn7 = 0; kn7 < 4; kn7++)                                 /* tank legs */
      _r3Box(m, 5.4 + (kn7 % 2) * 4.4, 7.90, -8.2 + ((kn7 / 2) | 0) * 3.2, 0.9, 1.1, 0.9, S[2], S[1]);
    _r3Cyl(m, 7.6, 8.90, -6.6, 2.9, 1.80, S[0], S[1], 16);            /* header tank */
    _r3Cyl(m, 7.6, 9.60, -6.6, 3.1, 0.45, S[2], S[3], 16);            /* hoop rib */
    _r3Cyl(m, 7.6, 10.70, -6.6, 3.0, 0.45, C[2], C[0], 16);           /* flat lid, not a nose */
    _r3Cyl(m, 6.3, 11.15, -6.6, 0.65, 0.6, DK[1], DK[3], 16);         /* filler */
    _r3Cyl(m, 10.2, 8.00, -4.6, 0.65, 2.1, S[2], S[1], 16);           /* downfeed */
    _r3Box(m, 10.2, 10.10, -5.3, 1.2, 1.00, 1.5, S[3], S[1]);         /* its elbow */
    _r3Cyl(m, 4.7, 8.00, -3.4, 1.2, 1.20, S[2], S[1], 16);            /* extractor */
    _r3Cone(m, 4.7, 9.20, -3.4, 1.5, 0.9, 0.8, S[0], 16);
    _r3Box(m, 7.6, 8.00, -9.9, 6.6, 0.45, 1.1, S[3], S[1]);           /* cable tray */
    for (var kn8 = 0; kn8 < 4; kn8++)
      _r3Box(m, 5.2 + kn8 * 1.7, 8.00, -9.9, 0.5, 0.95, 1.5, DK[1], DK[2]);
    _r3Box(m, 10.4, 8.00, -8.3, 2.0, 0.80, 1.9, S[3], C[3]);          /* roof hatch */
    _r3Box(m, 10.4, 8.80, -8.3, 2.2, 0.30, 2.1, DK[1], DK[2]);
    _r3Box(m, 8.2, 3.15, -1.30, 3.0, 3.40, 1.0, DK[0], DK[2]);        /* store door */
    _r3Box(m, 6.5, 3.15, -1.20, 0.8, 3.90, 1.2, B.trim, C[3]);
    _r3Box(m, 9.9, 3.15, -1.20, 0.8, 3.90, 1.2, B.trim, C[3]);
    _r3Box(m, 8.2, 6.55, -1.20, 4.2, 0.70, 1.2, TM[0], TM[1]);
    _r3Box(m, 8.2, 3.05, 0.45, 3.6, 0.50, 1.9, C[3], C[1]);
    winRow(-1.15, 5.20, 5.2, 2, 1.5, 1.2, 1.2);                       /* store windows */
    _r3Box(m, 10.30, 3.30, -1.15, 0.5, 5.40, 1.3, S[1], S[0]);        /* ladder to the deck */
    _r3Box(m, 11.40, 3.30, -1.15, 0.5, 5.40, 1.3, S[1], S[0]);
    for (var kn9 = 0; kn9 < 4; kn9++)
      _r3Box(m, 10.85, 4.00 + kn9 * 1.10, -1.20, 1.6, 0.30, 0.8, S[3], S[1]);
    _r3Box(m, 4.4, 2.40, 0.60, 2.2, 2.40, 1.8, S[2], S[1]);           /* meter cabinet */
    _r3Box(m, 4.4, 4.80, 0.60, 2.6, 0.35, 2.2, S[3], S[1]);           /* its lid */
    _r3Box(m, 4.4, 3.20, 1.60, 1.4, 1.30, 0.5, DK[1], DK[3]);         /* the dial, on the front */
    _r3Cyl(m, 5.7, 2.40, 1.20, 0.55, 2.7, S[3], S[1], 16);            /* conduit up the side */

    /* ---- the runs: one walled pen per dog door, then the front fence and its gate ---- */
    knPen(-6.3);
    knPen(-2.1);
    knPen(2.1);
    knPost(-10.8, 10.6, 0.8, 4.0);
    knPost(-6.4, 10.6, 0.8, 4.0);
    knPost(6.4, 10.6, 0.8, 4.0);
    knPost(10.8, 10.6, 0.8, 4.0);
    knPost(-2.9, 10.6, 0.92, 4.9);                                    /* gate posts, taller */
    knPost(2.9, 10.6, 0.92, 4.9);
    for (var knA = 0; knA < 3; knA++) {                               /* the two side lines */
      knPost(-10.8, -0.2 + knA * 3.9, 0.7, 4.0);
      knPost(10.8, -0.2 + knA * 3.9, 0.7, 4.0);
    }
    _r3Box(m, -10.8, 2.6, 5.0, 0.5, 3.8, 11.2, S[3], S[3]);           /* side mesh */
    _r3Box(m, 10.8, 2.6, 5.0, 0.5, 3.8, 11.2, S[3], S[3]);
    for (var knB = 0; knB < 3; knB++) {                               /* rails, front + sides */
      _r3Box(m, -6.85, 2.9 + knB * 1.5, 10.6, 8.3, 0.55, 0.8, S[1], S[0]);
      _r3Box(m, 6.85, 2.9 + knB * 1.5, 10.6, 8.3, 0.55, 0.8, S[1], S[0]);
      _r3Box(m, -10.8, 2.9 + knB * 1.5, 5.0, 0.8, 0.55, 11.4, S[1], S[0]);
      _r3Box(m, 10.8, 2.9 + knB * 1.5, 5.0, 0.8, 0.55, 11.4, S[1], S[0]);
    }
    _r3Box(m, 0, 7.15, 10.6, 6.6, 0.85, 1.0, S[1], S[0]);             /* gate head beam */
    _r3Box(m, 0, 8.00, 10.5, 4.6, 1.30, 0.8, TM[0], TM[1]);           /* team sign on it */
    for (var knC = 0; knC < 2; knC++) {                               /* two gate leaves */
      var knGx = knC ? 1.45 : -1.45;
      _r3Box(m, knGx, 2.6, 10.5, 2.7, 4.30, 0.35, S[3], S[3]);
      _r3Box(m, knGx, 6.5, 10.4, 2.9, 0.55, 0.6, S[1], S[0]);
      _r3Box(m, knGx, 4.5, 10.4, 2.9, 0.50, 0.55, S[1], S[0]);
      _r3Box(m, knGx + (knC ? 1.3 : -1.3), 2.6, 10.4, 0.55, 4.30, 0.6, S[1], S[0]);
    }
    _r3Box(m, 0, 4.5, 10.35, 0.7, 1.30, 0.7, TM[0], TM[1]);           /* latch */
    for (var knD = 0; knD < 2; knD++) {                               /* bollards at the gate */
      _r3Cyl(m, knD ? 4.7 : -4.7, 2.4, 9.8, 0.85, 2.9, RTS_PAL.hazard[0], RTS_PAL.hazard[1], 16);
      _r3Cone(m, knD ? 4.7 : -4.7, 5.3, 9.8, 0.9, 0.4, 0.55, DK[1], 16);
    }

    /* ---- what actually says "dogs live here": bowls, straw, boxes, feed ---- */
    for (var knE = 0; knE < 3; knE++) {
      knBowl(knDx[knE] + 0.9, 4.3);                                   /* a bowl in each run */
      knBowl(knDx[knE] - 0.9, 5.4);                                   /* and a water dish */
      _r3Box(m, knDx[knE], 2.4, 6.4, 3.2, 0.4, 2.2, RTS_PAL.bag[0], RTS_PAL.bag[1]);  /* straw */
      _r3Box(m, knDx[knE] + 0.9, 2.4, 8.3, 1.5, 0.9, 1.5, RTS_PAL.bag[2], RTS_PAL.bag[0]);
    }
    _r3Box(m, -9.0, 2.4, 8.9, 4.2, 2.6, 3.2, B.wall, B.roof);         /* a loose kennel box */
    _r3Gable(m, -9.0, 5.0, 8.9, 4.6, 1.8, 3.6, B.roof);
    _r3Box(m, -9.0, 2.4, 10.4, 1.7, 1.9, 0.7, DK[0], DK[2]);          /* its opening */
    _r3Box(m, -9.0, 6.8, 8.9, 2.8, 0.4, 1.0, TM[0], TM[1]);           /* numbered ridge */
    _r3Box(m, -3.4, 2.25, 8.9, 5.8, 0.5, 2.9, DK[1], DK[2]);          /* trough shadow pad */
    _r3Box(m, -3.4, 2.40, 8.9, 5.4, 1.8, 2.5, S[2], S[1]);            /* water trough */
    _r3Box(m, -3.4, 4.05, 8.9, 4.6, 0.3, 1.7, RTS_PAL.water[1], RTS_PAL.water[4]);
    _r3Cyl(m, -5.9, 2.40, 8.9, 0.55, 4.6, S[2], S[1], 16);            /* standpipe */
    _r3Box(m, -5.1, 6.40, 8.9, 1.9, 0.6, 0.6, S[1], S[0]);            /* its spout */
    _r3Cyl(m, -5.9, 7.00, 8.9, 0.85, 0.45, TM[0], TM[1], 16);         /* valve wheel */
    for (var knG = 0; knG < 2; knG++) {                               /* feed bins */
      var knFx = 5.6 + knG * 3.4;
      _r3Cyl(m, knFx, 2.40, 3.0, 1.6, 3.30, S[0], S[1], 16);
      _r3Cyl(m, knFx, 4.50, 3.0, 1.75, 0.45, S[2], S[3], 16);
      _r3Cyl(m, knFx, 5.70, 3.0, 1.7, 0.50, S[3], S[1], 16);          /* flat lid, not a nose */
      _r3Box(m, knFx, 3.10, 4.5, 1.5, 0.90, 0.5, TM[0], TM[1]);       /* painted label */
    }
    _r3Box(m, 6.6, 2.40, 7.0, 4.2, 0.60, 3.4, RTS_PAL.dirt[0], RTS_PAL.dirt[3]);   /* pallet */
    for (var knH = 0; knH < 4; knH++)                                 /* feed sacks on it */
      _r3Slab(m, 5.6 + (knH % 2) * 2.0, 3.0 + ((knH / 2) | 0) * 1.1,
              6.2 + ((knH / 2) | 0) * 1.5, 2.0, 1.1, 1.7, 0.4,
              RTS_PAL.bag[knH % 3], RTS_PAL.bag[1]);
    _r3Cyl(m, 3.6, 2.40, 5.6, 0.55, 3.9, S[2], S[1], 16);             /* sign post */
    _r3Box(m, 3.6, 5.60, 5.4, 2.2, 1.70, 0.5, TM[0], TM[1]);          /* the sign */
    _r3Box(m, 3.6, 5.95, 5.1, 1.5, 0.50, 0.3, C[3], C[3]);
    _r3Box(m, 9.6, 2.40, 8.4, 2.6, 1.90, 2.4, RTS_PAL.dirt[0], RTS_PAL.dirt[3]);   /* crates */
    _r3Box(m, 9.6, 4.30, 8.0, 2.2, 1.70, 2.0, RTS_PAL.dirt[2], RTS_PAL.dirt[1]);
    _r3Cyl(m, 8.0, 2.40, 5.2, 0.55, 3.2, S[2], S[1], 16);             /* hose reel on a post */
    _r3Cyl(m, 8.0, 4.40, 5.2, 1.3, 1.10, DK[1], DK[3], 16);
    _r3Cyl(m, 10.4, 2.40, 4.4, 1.25, 2.10, DK[1], DK[3], 16);         /* muck bin */
    _r3Cyl(m, 10.4, 4.50, 4.4, 1.35, 0.40, S[2], S[3], 16);
  } else if (key === 'flametower') {
    /* Flame Tower: a burner head on a short mast standing on the fuel tank that feeds it.
       Wide drum, dark stalk, wide gallery, team-coloured head - four steps, each a different
       width and a different tone, because on a 24-pixel tile the silhouette IS the sprite.
       The tank is deliberately almost as wide as the pad: it has to be the dominant mass or
       everything above it reads as a pole stuck in the grass, and it is also the honest
       reason the thing detonates when it dies, since the fuel sits right under the nozzle.

       Three facts about this projection shaped the layout, all learned the hard way. Ground
       kit lives in the FRONT half and on the flanks only - anything parked behind the tank is
       either swallowed by it or pokes out above its dome looking like it is floating. The
       tank's DOME is the single largest surface in the sprite, because height compresses by
       1.3 and depth does not, so it carries a manway and two offtakes and nothing else. And
       detail is banded rather than striped: hoop ribs across the drum read as a tank, seven
       vertical strakes on a drum this size read as corduroy. */

    /* ---- local kit. A fuel installation is mostly valves and dials, and hand-placing each
       one would bury the layout below under three lines of noise apiece. ---- */
    var ftValve = function (vx, vy, vz, vr, vcol) {
      _r3Cyl(m, vx, vy, vz, vr * 0.55, 1.5, S[3], S[1], 16);
      _r3Box(m, vx, vy + 1.1, vz, vr * 2.2, 1.0, 1.6, vcol, vcol);
      _r3Box(m, vx, vy + 1.1, vz, 1.6, 1.0, vr * 2.2, vcol, vcol);
    };
    var ftGauge = function (gx, gy, gz) {
      _r3Box(m, gx, gy, gz, 1.8, 2.0, 1.8, S[2], S[1]);
      _r3Cyl(m, gx, gy + 2.0, gz, 1.7, 1.1, C[3], DK[2], 16);
    };

    /* ---- pad and its hazard border. The chevrons ring all four edges: this is the one
       structure your own infantry must not walk past. ---- */
    _r3Slab(m, 0, 0, 0, W - 1, 2.0, D - 1, 3, C[2], C[0]);
    _r3Box(m, 0, 2.0, 8.4, 20, 0.4, 4.6, C[1], C[3]);              /* worn apron */
    _r3Box(m, 0, 2.0, -8.6, 20, 0.4, 4.2, C[1], C[3]);
    for (var ft0 = 0; ft0 < 6; ft0++) {
      var ftq = -8.75 + ft0 * 3.5;
      var ftk0 = ft0 % 2 ? RTS_PAL.hazard[0] : RTS_PAL.hazard[1];
      var ftk1 = ft0 % 2 ? RTS_PAL.hazard[1] : RTS_PAL.hazard[0];
      _r3Box(m, ftq, 2.0, 10.5, 2.8, 0.9, 2.2, ftk0, ftk0);
      _r3Box(m, ftq, 2.0, -10.5, 2.8, 0.9, 2.2, ftk1, ftk1);
      _r3Box(m, 10.5, 2.0, ftq, 2.2, 0.9, 2.8, ftk1, ftk1);
      _r3Box(m, -10.5, 2.0, ftq, 2.2, 0.9, 2.8, ftk0, ftk0);
    }
    _r3Box(m, -1.0, 2.2, 6.2, 5.2, 0.3, 1.6, C[3], C[3]);          /* painted stand-off line */
    _r3Box(m, 6.6, 2.2, 10.0, 3.6, 0.3, 1.6, C[3], C[3]);
    _r3Box(m, -8.0, 2.2, -0.4, 2.2, 0.5, 4.4, DK[1], DK[3]);       /* cable trench covers */
    _r3Box(m, 8.0, 2.2, -8.4, 4.4, 0.5, 2.2, DK[1], DK[3]);
    _r3Cyl(m, 9.4, 2.0, 9.4, 1.7, 3.6, C[0], C[3], 16);            /* bollards */
    _r3Cyl(m, -9.4, 2.0, 9.4, 1.7, 3.6, C[0], C[3], 16);

    /* ---- the fuel tank ---- */
    _r3Cyl(m, 0, 2.0, 0, 7.8, 9.0, S[1], S[3], 24);
    _r3Cyl(m, 0, 3.4, 0, 8.2, 1.5, S[2], DK[2], 24);               /* hoop ribs */
    _r3Cyl(m, 0, 7.0, 0, 8.2, 1.5, S[2], DK[2], 24);
    for (var ft1 = 0; ft1 < 3; ft1++) {                            /* plate seams */
      var fta = (0.06 + ft1 * 0.31) * Math.PI;
      _r3Box(m, Math.cos(fta) * 7.9, 2.0, Math.sin(fta) * 7.9, 2.2, 9.0, 2.2, S[2], DK[2]);
    }
    for (var ft1b = 0; ft1b < 9; ft1b++) {                         /* anchor bolts at the foot */
      var ftj = (-0.18 + ft1b * 0.17) * Math.PI;
      _r3Box(m, Math.cos(ftj) * 8.4, 2.0, Math.sin(ftj) * 8.4, 1.6, 1.6, 1.6, C[0], C[3]);
    }
    _r3Box(m, 1.6, 2.6, 8.2, 1.6, 7.0, 1.6, S[3], S[1]);           /* sight-glass column */
    for (var ft1c = 0; ft1c < 3; ft1c++)
      _r3Box(m, 1.6, 3.8 + ft1c * 2.0, 8.6, 2.4, 0.8, 1.4, DK[1], DK[3]);
    _r3Cyl(m, 0, 9.5, 0, 8.1, 1.5, TM[0], TM[1], 24);              /* owner band */
    _r3Box(m, -2.8, 4.6, 8.0, 3.4, 3.2, 1.6, RTS_PAL.hazard[0], RTS_PAL.hazard[0]);
    _r3Box(m, -6.0, 4.6, 6.0, 2.8, 2.6, 1.6, DK[0], DK[2]);        /* stencil plate */
    _r3Cone(m, 0, 11.0, 0, 7.8, 5.0, 2.2, S[3], 24);               /* domed head, kept bare */
    _r3Cyl(m, 4.0, 12.9, 2.6, 2.3, 1.1, S[2], DK[1], 16);          /* manway */
    for (var ft2 = 0; ft2 < 2; ft2++) {
      var ftg = (0.26 + ft2 * 0.42) * Math.PI;
      var ftnx = Math.cos(ftg) * 6.2, ftnz = Math.sin(ftg) * 6.2;
      _r3Cyl(m, ftnx, 11.4, ftnz, 1.7, 2.6, S[2], DK[2], 16);      /* dome offtakes */
      _r3Cyl(m, ftnx, 14.0, ftnz, 2.2, 1.0, S[3], S[1], 16);
    }

    /* ---- discharge manifold across the tank's near face. This is the run that says "fuel",
       so it goes low and central where nothing can occlude it. ---- */
    _r3Box(m, -1.0, 3.6, 9.2, 8.0, 2.2, 2.2, S[3], S[1]);
    _r3Box(m, -4.6, 2.0, 9.2, 2.0, 3.8, 2.0, S[2], S[1]);          /* stands */
    _r3Box(m, 2.4, 2.0, 9.2, 2.0, 3.8, 2.0, S[2], S[1]);
    ftValve(-2.6, 5.8, 9.2, 1.7, TM[0]);
    ftValve(1.0, 5.8, 9.2, 1.5, RTS_PAL.hazard[0]);
    ftGauge(-1.0, 5.8, 10.2);

    /* ---- control cabinet, front left. The only painted-wall mass on the model, so the owner
       still reads when the burner drum is behind smoke. ---- */
    _r3Slab(m, -8.8, 2.0, 8.4, 5.0, 6.0, 5.2, 1.5, B.wall, B.roof);
    _r3Box(m, -8.8, 8.0, 8.4, 3.4, 1.2, 3.4, TM[0], TM[1]);        /* team lid panel */
    _r3Box(m, -8.8, 2.4, 10.9, 2.8, 4.4, 1.4, DK[0], DK[2]);       /* door */
    _r3Box(m, -8.8, 6.8, 10.6, 5.4, 1.0, 2.4, B.trim, B.trim);     /* canopy over it */
    for (var ft3 = 0; ft3 < 3; ft3++)
      _r3Box(m, -10.6, 2.8 + ft3 * 1.7, 10.7, 1.8, 1.2, 1.6, DK[1], DK[3]);
    _r3Box(m, -6.2, 2.4, 9.4, 2.8, 1.0, 2.0, DK[1], DK[3]);        /* cable duct */

    /* ---- one feed riser, up the left flank and elbowing in over the dome to the burner. Two
       parallel risers were tried and the pair read as a second chimney; a single line with its
       valve and dial hung on it says "plumbing" and leaves the tank wall alone. ---- */
    _r3Box(m, -9.0, 2.4, 2.4, 3.2, 1.8, 3.4, S[2], S[1]);
    _r3Cyl(m, -9.0, 2.4, 2.4, 1.5, 11.2, S[3], S[1], 16);
    for (var ft4 = 0; ft4 < 3; ft4++)
      _r3Box(m, -8.2, 4.6 + ft4 * 3.2, 2.4, 3.0, 1.4, 2.8, S[2], DK[2]);
    ftValve(-9.0, 8.8, 2.4, 1.8, TM[0]);
    ftGauge(-10.2, 5.6, 4.4);
    _r3Box(m, -7.0, 13.6, 2.4, 5.6, 1.6, 2.6, S[2], S[1]);         /* elbow in over the dome */
    _r3Cyl(m, -5.2, 14.2, 2.4, 1.4, 9.0, S[3], S[1], 16);
    for (var ft5 = 0; ft5 < 2; ft5++)
      _r3Box(m, -4.6, 16.4 + ft5 * 4.2, 2.4, 3.6, 1.3, 2.8, S[2], DK[2]);
    _r3Box(m, -3.8, 23.2, 2.0, 5.0, 1.7, 2.0, S[2], S[1]);         /* into the burner */

    /* ---- pressurised bottles, right flank. Beside the tank rather than behind it so they
       actually show - they are the readable answer to "why does this tile go up". ---- */
    _r3Box(m, 9.8, 2.0, 2.2, 4.2, 1.0, 8.6, C[0], C[3]);           /* bottle plinth */
    for (var ft6 = 0; ft6 < 2; ft6++) {
      var ftz = 4.4 - ft6 * 4.2;
      _r3Cyl(m, 9.8, 3.0, ftz, 1.9, 5.8, S[1], S[3], 18);
      _r3Cyl(m, 9.8, 4.8, ftz, 2.05, 1.4, RTS_PAL.hazard[0], RTS_PAL.hazard[0], 18);
      _r3Cone(m, 9.8, 8.8, ftz, 1.9, 0.9, 1.5, S[2], 18);
      _r3Cyl(m, 9.8, 10.3, ftz, 1.0, 1.5, S[3], S[1], 16);
    }
    _r3Box(m, 9.8, 7.4, 2.2, 1.4, 1.4, 6.4, S[2], DK[2]);          /* retaining strap */

    /* ---- sandbags across the back, one low course only, and a couple of drums. Anything
       taller back there clears the dome and reads as debris hanging in mid-air. ---- */
    var ftBag = [[8.4, -7.4], [6.0, -8.8], [3.2, -9.6], [0.4, -9.7], [-2.4, -9.6], [-5.2, -8.8]];
    for (var ft7 = 0; ft7 < 6; ft7++)
      _r3Cyl(m, ftBag[ft7][0], 2.0, ftBag[ft7][1], 2.2, 2.4,
             RTS_PAL.bag[ft7 % 2], RTS_PAL.bag[1], 16);
    _r3Cyl(m, -9.6, 2.0, -5.6, 2.0, 3.6, RTS_PAL.ore[3], RTS_PAL.ore[0], 18);
    _r3Cyl(m, -9.6, 5.6, -5.6, 2.1, 0.8, DK[1], DK[3], 18);
    _r3Cyl(m, 9.6, 2.0, -6.4, 2.0, 3.6, DK[1], DK[0], 18);
    _r3Cyl(m, 9.6, 5.6, -6.4, 2.1, 0.8, S[2], S[1], 18);

    /* ---- caged ladder, front right. Four hoops of four blocks rather than five of five, and
       no continuous stringers: denser than this and the cage stops reading as a cage and
       starts reading as a wall stood beside the tank. ---- */
    _r3Box(m, 3.6, 2.0, 7.4, 1.6, 17.7, 1.6, DK[3], DK[1]);
    _r3Box(m, 6.4, 2.0, 7.4, 1.6, 17.7, 1.6, DK[3], DK[1]);
    for (var ft8 = 0; ft8 < 8; ft8++)
      _r3Box(m, 5.0, 4.4 + ft8 * 2.2, 7.4, 3.2, 1.2, 1.4, DK[1], DK[2]);
    for (var ft9 = 0; ft9 < 4; ft9++) {
      for (var fta0 = 0; fta0 < 4; fta0++) {
        var ftr = (-0.1 + fta0 * 0.4) * Math.PI;
        _r3Box(m, 5.0 + Math.cos(ftr) * 2.8, 6.6 + ft9 * 3.4, 7.4 + Math.sin(ftr) * 2.8,
               2.0, 1.8, 2.0, S[3], S[1]);
      }
    }

    /* ---- the mast. Deliberately the darkest mass on the model: a dark stalk between the
       mid-grey tank and the pale gallery is what makes the stepped silhouette read. ---- */
    _r3Cyl(m, 0, 13.2, 0, 3.9, 6.2, DK[3], DK[1], 20);
    _r3Cyl(m, 0, 13.4, 0, 4.6, 1.4, S[2], S[1], 20);               /* flanges */
    _r3Cyl(m, 0, 17.4, 0, 4.4, 1.2, S[2], S[1], 20);
    _r3Cyl(m, 0, 15.2, 0, 4.05, 1.6, TM[1], TM[3], 20);            /* owner band */
    for (var fta1 = 0; fta1 < 4; fta1++) {
      var ftb = (-0.1 + fta1 * 0.36) * Math.PI;
      _r3Box(m, Math.cos(ftb) * 4.0, 13.2, Math.sin(ftb) * 4.0, 1.8, 6.2, 1.8, DK[1], DK[2]);
    }

    /* ---- gallery. Its deck is the second largest flat surface under this camera, so it gets
       a proper railing and a working platform's worth of kit - but only across the front
       crescent, because the burner drum covers everything behind it. ---- */
    for (var fta2 = 0; fta2 < 6; fta2++) {
      var ftc = fta2 / 6 * Math.PI * 2;
      _r3Box(m, Math.cos(ftc) * 4.9, 17.0, Math.sin(ftc) * 4.9, 2.0, 1.6, 2.0, S[2], DK[2]);
    }
    _r3Cone(m, 0, 18.4, 0, 5.0, 7.2, 1.3, S[2], 22);               /* flared deck skirt */
    _r3Cyl(m, 0, 19.7, 0, 7.2, 0.8, S[3], C[0], 22);               /* deck plate */
    for (var fta3 = 0; fta3 < 4; fta3++) {
      var ftd = fta3 / 4 * Math.PI * 2 + 0.5;
      _r3Box(m, Math.cos(ftd) * 5.0, 20.5, Math.sin(ftd) * 5.0, 3.2, 0.5, 3.2, S[2], S[1]);
    }
    _r3Box(m, 4.8, 20.5, 5.8, 4.2, 0.7, 3.4, S[2], S[1]);          /* ladder landing */
    _r3Box(m, 2.4, 20.5, 4.8, 3.2, 0.6, 2.4, DK[1], DK[3]);        /* hatch */
    _r3Box(m, 3.0, 21.2, 7.2, 1.4, 2.6, 1.4, S[2], DK[2]);         /* landing handrail */
    _r3Box(m, 6.6, 21.2, 7.2, 1.4, 2.6, 1.4, S[2], DK[2]);
    _r3Box(m, 4.8, 23.8, 7.2, 5.0, 1.0, 1.4, S[3], S[1]);
    _r3Cyl(m, -4.6, 20.5, 4.2, 1.5, 2.0, S[1], DK[2], 16);         /* hose reel */
    _r3Cyl(m, -4.6, 20.5, 4.2, 1.9, 0.7, S[3], S[1], 16);
    _r3Box(m, -1.8, 20.5, 6.0, 2.6, 2.2, 1.8, RTS_PAL.hazard[0], RTS_PAL.hazard[1]);
    _r3Box(m, -6.4, 20.5, 1.0, 2.0, 1.8, 3.2, S[2], S[1]);         /* toolbox */
    _r3Box(m, 6.2, 20.5, 1.4, 2.0, 2.4, 2.4, S[2], S[1]);          /* searchlight mount */
    _r3Cyl(m, 6.2, 22.9, 1.4, 1.4, 1.4, RTS_PAL.lit, RTS_PAL.lit, 16);
    for (var fta4 = 0; fta4 < 12; fta4++) {
      var fte = fta4 / 12 * Math.PI * 2 + 0.26;
      var ftpx = Math.cos(fte) * 6.6, ftpz = Math.sin(fte) * 6.6;
      _r3Box(m, ftpx, 20.5, ftpz, 1.5, 2.8, 1.5, S[2], DK[2]);     /* railing uprights */
      _r3Box(m, ftpx, 23.3, ftpz, 3.0, 1.1, 3.0, S[3], S[1]);      /* top rail */
    }

    /* ---- the burner head. Everything above the rail is the weapon, so it takes the team
       colour, the hazard collar and the only near-black masses on the model. ---- */
    _r3Cyl(m, 0, 20.5, 0, 3.0, 1.9, DK[3], DK[1], 20);             /* upper mast */
    _r3Cyl(m, 0, 22.0, 0, 5.0, 1.3, RTS_PAL.hazard[0], RTS_PAL.hazard[1], 20);
    _r3Cyl(m, 0, 23.3, 0, 5.6, 4.6, TM[0], TM[1], 22);             /* burner drum */
    _r3Cyl(m, 0, 25.5, 0, 5.9, 1.3, TM[2], TM[3], 22);
    for (var ftb0 = 0; ftb0 < 5; ftb0++) {
      var ftf = (0.04 + ftb0 * 0.24) * Math.PI;
      _r3Box(m, Math.cos(ftf) * 5.7, 23.8, Math.sin(ftf) * 5.7, 1.8, 1.6, 1.8, DK[0], DK[2]);
    }
    _r3Box(m, 0, 27.4, 5.2, 2.6, 1.5, 1.8, S[2], S[1]);            /* lifting lugs */
    _r3Box(m, -4.6, 27.4, 2.6, 2.4, 1.5, 1.8, S[2], S[1]);
    _r3Cone(m, 0, 27.9, 0, 5.9, 3.4, 1.7, S[3], 22);               /* heat shield */
    _r3Cyl(m, 0, 29.6, 0, 3.4, 0.9, S[2], DK[2], 20);
    _r3Cyl(m, 0, 30.5, 0, 1.9, 2.0, DK[2], DK[0], 18);             /* vent stack */
    _r3Cone(m, 0, 32.5, 0, 2.3, 1.5, 0.9, S[2], 18);
    _r3Cyl(m, 0, 33.4, 0, 1.3, 1.2, RTS_PAL.lit, RTS_PAL.lit, 16); /* warning lamp */

    /* ---- the nozzle. A horizontal barrel has to be boxes under this projection, and stepping
       it cradle / breech / barrel / muzzle ring is what makes it read as a weapon rather than
       a pipe stub. It hangs off the drum's right flank so it never covers the team colour. */
    _r3Box(m, 7.0, 22.2, 1.0, 2.2, 1.4, 4.6, S[2], S[1]);          /* cradle */
    _r3Box(m, 6.6, 23.2, 1.0, 4.4, 3.6, 3.8, S[3], S[1]);          /* breech */
    _r3Box(m, 9.4, 23.8, 1.0, 4.0, 2.6, 2.8, DK[2], DK[0]);        /* barrel */
    _r3Box(m, 11.0, 23.7, 1.0, 1.4, 3.0, 3.2, RTS_PAL.hazard[0], RTS_PAL.hazard[0]);
    _r3Box(m, 11.5, 24.3, 1.0, 0.9, 1.8, 2.0, RTS_PAL.lit, RTS_PAL.lit);   /* muzzle */
    _r3Box(m, -6.0, 23.4, 2.6, 1.8, 2.6, 1.8, S[2], S[1]);         /* pilot bracket */
    _r3Box(m, -5.0, 24.8, 3.8, 3.2, 3.0, 2.6, S[3], S[1]);         /* pilot housing */
    _r3Box(m, -5.0, 25.6, 5.4, 2.2, 1.6, 1.8, RTS_PAL.lit, RTS_PAL.lit);   /* pilot flame */
    for (var ftb1 = 0; ftb1 < 3; ftb1++)
      _r3Box(m, -2.4 + ftb1 * 2.4, 22.0, 4.4 - ftb1 * 0.8, 1.8, 1.4, 1.8, DK[1], DK[3]);
  } else if (key === 'wall') {
    /* Concrete Wall. The only structure that has to tile against copies of itself in BOTH
       directions, and that - not taste - dictates the geometry. Three rules fall out of it.
       (1) The kerb, plinth and capping course run the full 24 in x AND z; anything narrower
       down there opens a slot at every seam. (2) Everything else is either centred in the
       cell or sits FLUSH against an edge, so two neighbours' halves meet as one whole
       feature: the flush pilasters become a single 3-wide pier at each joint, and the coping
       lips become a continuous rail down a run, ribbed once per segment. (3) The panel is a
       21x21 core inset inside a full-width cap and plinth rather than a genuinely thinner
       wall - a reveal roofed by the cap and floored by the plinth reads as shadow, where a
       thin wall would show daylight through every seam.
       Where the budget went: in a run of wall the 24-deep top is nearly all you ever see, so
       that is where the cast coping panels, the duct run, the joint plates and the marker
       lamps are. The elevation underneath is worth about eleven output pixels, so it is cut
       into four bold bands - plinth, form-tied reveal, team rail, cap fascia - rather than
       into fine detail that would silt up into grey noise at this size. Lift tones run dirty
       at the bottom to clean at the top, which is free weathering and gives the flat shading
       horizontal bands to separate. */
    var wlPad = function (px, pz, pc) {                 /* one cast panel in the coping tray */
      _r3Box(m, px, 12.6, pz, 3.0, 0.6, 3.0, pc, pc);
    };
    var wlTie = function (tx, ty) {                     /* form-tie plug, proud of the reveal */
      _r3Cyl(m, tx, ty, 11.0, 0.85, 0.8, C[2], C[3], 16);
    };
    var wlStreak = function (sx, sy, sh, sw, sc) {      /* water stain running down the panel */
      _r3Box(m, sx, sy, 10.95, sw, sh, 1.1, sc, sc);
    };
    var wlDuct = function (dz) {                        /* cable duct on saddle clamps */
      _r3Box(m, 0, 13.2, dz, 21, 1.1, 1.6, S[2], S[0]);
      for (wq0 = 0; wq0 < 5; wq0++) _r3Box(m, -8.4 + wq0 * 4.2, 13.2, dz, 1.4, 1.4, 2.4, S[3], S[1]);
    };
    var wq0, wq1, wq2, wqA, wqB;

    /* ---- base: three full-cell courses. The dark contact band is the ground shadow the
       wall would otherwise have to be lit into having. */
    _r3Box(m, 0, 0, 0, 24, 0.6, 24, DK[1], DK[0]);
    _r3Box(m, 0, 0.6, 0, 24, 1.3, 24, C[2], C[1]);
    _r3Box(m, 0, 1.9, 0, 24, 2.3, 24, C[0], C[1]);

    /* ---- the panel core, poured in four lifts, dirtiest at the splash line. */
    wqA = [C[2], C[0], C[1], C[1]];
    for (wq0 = 0; wq0 < 4; wq0++) _r3Box(m, 0, 4.2 + wq0 * 1.5, 0, 21, 1.5, 21, wqA[wq0], C[1]);

    /* ---- pilasters flush to both x edges: half a pier each, one whole pier at the joint.
       Pale against the reveal, because the pier rhythm is what says "wall" and not "kerb". */
    _r3Box(m, -11.25, 4.2, 0, 1.5, 6.0, 24, C[3], C[3]);
    _r3Box(m, 11.25, 4.2, 0, 1.5, 6.0, 24, C[3], C[3]);
    _r3Box(m, 0, 4.2, 11.25, 1.8, 6.0, 1.5, C[3], C[3]);           /* centre mullion */
    _r3Box(m, 0, 4.2, 11.25, 21, 1.2, 1.5, C[3], C[3]);            /* plinth rail */
    _r3Box(m, 0, 8.8, 11.25, 21, 1.4, 1.5, TM[0], TM[1]);          /* team head rail */

    /* ---- form ties. The mark a she-bolt leaves is the most recognisable thing about
       poured concrete; two rows is all the reveal has room for at this scale. */
    wqA = [-9.6, -7.2, -4.8, -2.4, 2.4, 4.8, 7.2, 9.6];
    for (wq0 = 0; wq0 < 8; wq0++) for (wq1 = 0; wq1 < 2; wq1++) wlTie(wqA[wq0], 6.1 + wq1 * 1.5);

    /* ---- staining. Streaks hang from under the head rail at varied length and weight, so
       the reveal gets vertical grain without one line of it being regular. */
    wqA = [-9.9, -8.1, -6.2, -4.4, -2.6, 2.6, 4.4, 6.2, 8.1, 9.9];
    wqB = [2.2, 3.0, 1.4, 2.5, 3.3, 1.8, 2.7, 1.5, 3.2, 2.0];
    for (wq0 = 0; wq0 < 10; wq0++) {
      wlStreak(wqA[wq0], 8.8 - wqB[wq0], wqB[wq0], wq0 % 3 === 0 ? 1.5 : 1.0,
               wq0 % 5 === 0 ? DK[3] : C[2]);
    }
    wqA = [-8.8, -5.6, -2.4, 2.4, 5.6, 8.8];                       /* weep slots above the rail */
    for (wq0 = 0; wq0 < 6; wq0++) _r3Box(m, wqA[wq0], 5.4, 11.0, 1.8, 0.8, 1.1, C[2], DK[3]);
    wqA = [-9.4, -7.2, -4.0, -1.6, 3.0, 6.2, 9.4, 1.8];
    wqB = [6.4, 7.8, 5.9, 7.4, 6.2, 8.0, 6.0, 8.1];
    for (wq0 = 0; wq0 < 8; wq0++) {                               /* spalled, chipped face */
      _r3Box(m, wqA[wq0], wqB[wq0], 11.05, 1.6 + (wq0 % 3) * 0.5, 1.0 + (wq0 % 2) * 0.4, 1.2,
             wq0 % 3 === 0 ? RTS_PAL.rock[2] : C[3], C[3]);
    }

    /* ---- capping course, full cell so a run has an unbroken top; the dark band under it is
       the drip shadow its 1.5 overhang would throw. */
    _r3Box(m, 0, 10.2, 0, 22.6, 0.8, 22.6, DK[0], DK[1]);
    _r3Box(m, 0, 11.0, 0, 24, 1.6, 24, C[1], C[2]);

    /* ---- coping lips flush to all four edges: down a run the pair parallel to the wall
       merge into one continuous rail, the pair across it into a rib at every joint. */
    _r3Box(m, 0, 12.6, -11.25, 24, 1.4, 1.5, C[0], C[3]);
    _r3Box(m, 0, 12.6, 11.25, 24, 1.4, 1.5, C[0], C[3]);
    _r3Box(m, -11.25, 12.6, 0, 1.5, 1.4, 21, C[0], C[3]);
    _r3Box(m, 11.25, 12.6, 0, 1.5, 1.4, 21, C[0], C[3]);
    for (wq0 = 0; wq0 < 4; wq0++) {                                /* corner blocks */
      _r3Box(m, wq0 < 2 ? -11.25 : 11.25, 14.0, (wq0 % 2) ? 11.25 : -11.25,
             1.5, 0.8, 1.5, C[0], C[3]);
    }

    /* ---- the tray: 25 cast panels on a 4.45 grid with 1.45 joints, which is the narrowest
       groove that still survives the downsample. Tones off the ramp so the largest surface on
       the piece is never one flat colour, with the owner's panel at dead centre - that square
       is the only team mark a wall running north-south ever shows. */
    wqA = [C[3], C[1], C[3], C[0], C[1]];
    for (wq0 = 0; wq0 < 5; wq0++) for (wq1 = 0; wq1 < 5; wq1++) {
      wq2 = (wq0 * 3 + wq1 * 7) % 5;
      wlPad(-8.9 + wq0 * 4.45, -8.9 + wq1 * 4.45,
            (wq0 === 2 && wq1 === 2) ? TM[0] : wqA[wq2]);
    }
    wqA = [-8.9, -4.45, 0, 4.45, 8.9, -4.45, 4.45, 0, -8.9, 8.9, 0, 4.45, -4.45, 8.9, -8.9,
           4.45, -8.9, 0, 8.9, -4.45];
    wqB = [4.45, 8.9, -8.9, -4.45, 0, 4.45, -8.9, 8.9, -4.45, 4.45, 0, 8.9, -8.9, -4.45, 8.9,
           -8.9, 0, 4.45, -4.45, -8.9];
    for (wq0 = 0; wq0 < 20; wq0++) {                               /* wear mottling on the tray */
      _r3Box(m, wqA[wq0], 13.2, wqB[wq0], 1.8, 0.15, 1.8, C[0], C[0]);
    }

    /* ---- tray furniture: a duct run on saddles, service hatches into the core, lifting
       anchors, and at the edges the hardware a segmented wall actually carries - splice plates
       and bolts over each joint, a painted safety line on the near lip, and a marker lamp per
       side so a long run of wall is still legible at night. A pale fillet inside the lips
       stops the tray reading as a hole punched in the cap. */
    _r3Box(m, 0, 13.2, -9.6, 21, 0.5, 1.2, C[1], C[1]);
    _r3Box(m, 0, 13.2, 9.6, 21, 0.5, 1.2, C[1], C[1]);
    _r3Box(m, -9.6, 13.2, 0, 1.2, 0.5, 19.2, C[1], C[1]);
    _r3Box(m, 9.6, 13.2, 0, 1.2, 0.5, 19.2, C[1], C[1]);
    wlDuct(8.4);
    wqA = [-4.45, 4.45, -4.45, 4.45];
    wqB = [-4.45, -4.45, 4.45, 4.45];
    for (wq0 = 0; wq0 < 4; wq0++) {
      _r3Box(m, wqA[wq0], 13.2, wqB[wq0], 2.6, 0.3, 2.6, C[2], DK[3]);
      _r3Box(m, wqA[wq0], 13.5, wqB[wq0], 1.8, 0.3, 0.9, S[3], S[3]);
    }
    for (wq0 = 0; wq0 < 4; wq0++) {
      _r3Cyl(m, wq0 < 2 ? -6.6 : 6.6, 13.2, (wq0 % 2) ? 0 : -8.4, 0.9, 1.3, S[0], S[3], 16);
      _r3Cyl(m, wq0 < 2 ? -11.25 : 11.25, 14.8, (wq0 % 2) ? 11.25 : -11.25, 0.7, 1.0, S[0], S[3], 16);
    }
    for (wq0 = 0; wq0 < 4; wq0++) {
      _r3Box(m, -9 + wq0 * 6, 14.0, 11.25, 3.6, 0.35, 1.5, RTS_PAL.hazard[0], RTS_PAL.hazard[0]);
    }
    for (wq0 = 0; wq0 < 4; wq0++) {
      wq2 = (wq0 % 2) ? 5.5 : -5.5;
      _r3Box(m, wq0 < 2 ? -11.25 : 11.25, 14.0, wq2, 1.5, 0.5, 4.4, S[1], S[3]);
      _r3Cyl(m, wq0 < 2 ? -11.25 : 11.25, 14.5, wq2 - 1.4, 0.72, 0.5, S[3], S[1], 16);
      _r3Cyl(m, wq0 < 2 ? -11.25 : 11.25, 14.5, wq2 + 1.4, 0.72, 0.5, S[3], S[1], 16);
    }
    _r3Box(m, 0, 14.0, -11.25, 2.2, 0.7, 1.2, RTS_PAL.lit, RTS_PAL.lit);
    _r3Box(m, 0, 14.0, 11.25, 2.2, 0.7, 1.2, RTS_PAL.lit, RTS_PAL.lit);
    _r3Box(m, -11.25, 14.0, 0, 1.2, 0.7, 2.2, RTS_PAL.lit, RTS_PAL.lit);
    _r3Box(m, 11.25, 14.0, 0, 1.2, 0.7, 2.2, RTS_PAL.lit, RTS_PAL.lit);
  } else if (key === 'pillbox') {
    /* Pillbox: a low concrete drum sunk in a sandbag revetment, with a boxy embrasure
       casemate shoved out of the front and a concrete parapet round the roof.
       One constraint decides every number here: it has to read as SHORTER and rounder than
       the Gun Turret standing beside it, because it is the cheap early defence and the two
       have to be told apart in one glance across the map. The drum tops out at 9.5 against
       the turret's 15, and the budget goes SIDEWAYS - revetment, casemate, roof furniture,
       hardstanding - rather than upward. Only the aerial goes high, and a mast is a
       different silhouette from a gun.
       Four choices are deliberate. The hardstanding is a DISC, not a square: the renderer
       already lays a ragged `_sprPad` under every structure, and a square slab on top of it
       is the axis-aligned-tile artefact this codebase spent a pass removing. The revetment
       is laid round the front and flanks only, and only up to a third of the drum's height -
       with no yaw, bags behind a round drum fall inside its own roofline at every pixel and
       bake into nothing, and bags carried further UP bury the concrete the building is made
       of under tan speckle. The embrasure is a box standing PROUD rather than a slot cut
       into the curve: a recess in a cylinder collapses to one dark pixel, whereas a casemate
       with a steel lintel, a sill, a painted owner stripe and a gun poking out of it is the
       thing you name the building by. And nothing anywhere reaches past x = +/-10.8, so
       `_sprEdge` still has a transparent column to lay the keyline into - a model flush with
       its own sprite edge loses the black outline that separates it from the grass.
       Sizes are floored at what 24 art pixels can resolve: bags are 3.6-3.9 units across so
       a course reads as bags rather than a smear, and there are no sub-pixel bolt heads. */
    var pbBag = function (bx, by, bz, br, bh, tone) {
      _r3Cyl(m, bx, by, bz, br, bh, RTS_PAL.bag[tone % 2], RTS_PAL.bag[1], 16);
    };
    var pbArc = function (ay, arad, an, a0, a1, br, bh, seed) {
      for (var pb0 = 0; pb0 < an; pb0++) {
        var pba = (a0 + (a1 - a0) * pb0 / (an - 1)) * Math.PI / 180;
        pbBag(Math.cos(pba) * arad, ay, -0.6 + Math.sin(pba) * arad, br, bh, pb0 + seed);
      }
    };
    var pbCrate = function (cx, cy, cz, cw, ch, cd, band) {
      _r3Box(m, cx, cy, cz, cw, ch, cd, RTS_PAL.dirt[2], RTS_PAL.dirt[0]);
      _r3Box(m, cx, cy + ch, cz, cw - 0.7, 0.45, cd - 0.7, RTS_PAL.dirt[3], RTS_PAL.dirt[1]);
      _r3Box(m, cx, cy + ch * 0.4, cz + cd / 2, cw + 0.3, 0.7, 0.8, band, band);
    };
    var pbFuel = function (dx, dz) {
      _r3Cyl(m, dx, 0.6, dz, 1.5, 3.0, DK[1], DK[3], 16);
      _r3Cyl(m, dx, 1.9, dz, 1.6, 0.6, RTS_PAL.hazard[0], RTS_PAL.hazard[0], 16);
      _r3Cyl(m, dx, 3.6, dz, 1.6, 0.45, S[3], S[1], 16);
    };

    /* ---- hardstanding: a disc, worn in patches so it is not one flat grey ---- */
    _r3Cyl(m, 0, 0, -0.6, 10.6, 0.6, C[2], C[0], 20);
    _r3Cyl(m, -5.6, 0.6, 6.6, 3.6, 0.2, C[0], C[3], 16);
    _r3Cyl(m, 6.0, 0.6, 6.4, 3.2, 0.2, C[0], C[1], 16);
    _r3Cyl(m, -6.8, 0.6, -6.4, 3.4, 0.2, C[1], C[3], 16);
    _r3Cyl(m, 6.6, 0.6, -6.8, 3.0, 0.2, C[3], C[1], 16);

    /* ---- ground furniture, all of it out front where it is not behind the drum ---- */
    pbCrate(-7.6, 0.6, 8.8, 3.4, 2.2, 2.6, TM[0]);
    pbCrate(-7.6, 2.8, 8.8, 2.8, 1.8, 2.2, DK[1]);                  /* stacked */
    pbFuel(6.8, 9.2);
    pbFuel(9.0, 7.0);
    _r3Cyl(m, -9.6, 0.6, 9.6, 1.15, 2.6, C[3], C[1], 16);           /* bollards */
    _r3Cyl(m, -9.6, 3.2, 9.6, 1.15, 0.6, C[0], C[3], 16);
    _r3Cyl(m, 9.6, 0.6, 9.8, 1.15, 2.6, C[3], C[1], 16);
    _r3Cyl(m, 9.6, 3.2, 9.8, 1.15, 0.6, C[0], C[3], 16);
    _r3Box(m, 0, 2.7, 9.9, 19.2, 0.55, 0.7, S[3], S[3]);            /* chain slung between them */
    for (i = 0; i < 6; i++) {                                       /* wire pickets, both flanks */
      _r3Box(m, i < 3 ? -10.3 : 10.3, 0.6, 4.6 - (i % 3) * 4.4, 0.9, 3.2, 0.9, S[2], S[3]);
    }
    _r3Box(m, -10.3, 3.0, -1.8, 0.7, 0.6, 13, S[3], S[3]);          /* strands between them */
    _r3Box(m, 10.3, 3.0, -1.8, 0.7, 0.6, 13, S[3], S[3]);
    _r3Box(m, -10.3, 1.6, -1.8, 0.7, 0.5, 13, S[3], S[3]);
    _r3Box(m, 10.3, 1.6, -1.8, 0.7, 0.5, 13, S[3], S[3]);
    /* The rear CORNERS of the pad are not behind the drum - a circle inscribed in a square
       leaves them clear - so they are worth dressing where the rear face is not. */
    pbBag(-8.0, 0.6, -7.2, 1.9, 1.8, 0);                            /* spare bags, stacked */
    pbBag(-8.8, 0.6, -8.7, 1.9, 1.8, 1);
    pbBag(-8.4, 2.4, -7.9, 1.8, 1.7, 0);
    pbCrate(8.8, 0.6, -8.0, 3.2, 2.2, 2.6, DK[1]);
    _r3Cyl(m, 9.5, 0.6, -5.4, 1.3, 2.4, RTS_PAL.dirt[2], RTS_PAL.dirt[3], 16);    /* jerrycan */

    /* ---- revetment: two staggered courses, front and flanks only, kept LOW ---- */
    pbArc(0.6, 8.9, 13, -34, 214, 1.95, 2.0, 0);
    pbArc(2.5, 8.5, 11, -20, 200, 1.8, 1.8, 1);

    /* ---- the bunker: battered skirt, stepped collar, owner band, roof deck ---- */
    _r3Cyl(m, 0, 0.6, -0.6, 8.7, 0.9, C[2], C[1], 20);              /* toe */
    _r3Cone(m, 0, 1.5, -0.6, 8.5, 7.4, 3.7, C[0], 20);              /* sloped armour */
    _r3Cyl(m, 0, 5.2, -0.6, 7.85, 0.35, DK[1], DK[2], 20);          /* shadow line under the step */
    _r3Cyl(m, 0, 5.55, -0.6, 7.7, 0.85, C[3], C[1], 20);            /* stepped collar */
    _r3Cyl(m, 0, 6.4, -0.6, 7.45, 1.2, TM[0], TM[1], 20);           /* painted owner band */
    _r3Cone(m, 0, 7.6, -0.6, 7.3, 6.5, 1.1, C[2], 20);              /* roof haunch */
    _r3Cyl(m, 0, 8.7, -0.6, 6.5, 0.8, C[1], C[3], 20);              /* roof deck */
    for (i = 0; i < 4; i++) {                                       /* buttress ribs */
      var pbr = (28 + i * 41 + (i > 1 ? 30 : 0)) * Math.PI / 180;
      _r3Box(m, Math.cos(pbr) * 7.6, 1.5, -0.6 + Math.sin(pbr) * 7.6, 2.0, 3.7, 2.0, C[3], C[1]);
    }

    /* ---- embrasure casemate. This is the read: stripe, dark slot, lintel, gun in it ---- */
    _r3Box(m, 0, 2.4, 8.2, 13.6, 0.5, 3.4, C[2], C[0]);             /* glacis step at its foot */
    _r3Box(m, 0, 2.9, 8.6, 13.0, 0.4, 2.4, C[2], C[3]);
    _r3Slab(m, 0, 3.2, 5.4, 12.4, 3.6, 5.0, 1.1, C[1], C[3]);
    _r3Box(m, -5.9, 3.2, 5.8, 1.8, 3.4, 3.8, C[2], C[0]);           /* splayed cheeks */
    _r3Box(m, 5.9, 3.2, 5.8, 1.8, 3.4, 3.8, C[2], C[0]);
    _r3Box(m, 0, 3.6, 7.9, 11.2, 1.1, 1.4, TM[0], TM[1]);           /* owner stripe across it */
    _r3Box(m, 0, 4.7, 7.9, 11.8, 0.6, 1.8, C[3], C[1]);             /* sill */
    _r3Box(m, 0, 5.3, 8.1, 10.8, 1.5, 1.4, DK[2], DK[0]);           /* the slot */
    _r3Box(m, -2.4, 5.6, 8.7, 3.2, 0.9, 1.0, RTS_PAL.lit, RTS_PAL.lit);  /* lit interior in it */
    _r3Box(m, 0, 6.8, 7.9, 12.4, 1.0, 1.8, S[2], S[3]);             /* lintel */
    _r3Box(m, -4.6, 6.8, 8.6, 1.0, 1.6, 1.0, S[3], S[1]);           /* splinter fins on it */
    _r3Box(m, 4.6, 6.8, 8.6, 1.0, 1.6, 1.0, S[3], S[1]);
    _r3Box(m, 2.6, 5.0, 8.5, 4.2, 2.2, 1.4, S[1], S[3]);            /* mantlet */
    _r3Box(m, 2.6, 5.4, 9.2, 2.4, 1.6, 1.2, DK[1], DK[3]);          /* receiver */
    _r3Box(m, 2.6, 5.7, 9.8, 1.5, 1.5, 1.1, S[0], S[2]);            /* barrel jacket */
    for (i = 0; i < 3; i++) _r3Box(m, 2.6, 5.7, 9.5 + i * 0.5, 1.8, 1.7, 0.32, S[3], S[1]);
    _r3Box(m, 2.6, 5.7, 10.5, 1.1, 1.1, 0.9, DK[0], DK[2]);         /* muzzle */
    _r3Box(m, 5.4, 4.6, 8.8, 2.2, 2.0, 2.0, S[2], S[1]);            /* ammo box */
    _r3Box(m, 5.4, 6.6, 8.8, 1.8, 0.45, 1.6, S[3], S[1]);
    _r3Box(m, 4.1, 5.4, 8.9, 2.2, 0.7, 0.8, RTS_PAL.ore[0], RTS_PAL.ore[1]);  /* belt feed */
    _r3Box(m, 1.5, 3.7, 8.5, 1.5, 1.2, 1.4, DK[1], DK[3]);          /* case chute */

    /* ---- flank slots, out on the shoulders where the casemate is not ---- */
    for (i = 0; i < 2; i++) {
      var pbs = i ? -1 : 1;
      _r3Box(m, pbs * 7.4, 4.9, 1.6, 2.8, 1.5, 2.8, DK[2], DK[0]);
      _r3Box(m, pbs * 7.6, 6.4, 1.8, 3.2, 0.8, 3.0, S[2], S[3]);    /* hood over it */
      _r3Box(m, pbs * 7.4, 5.2, 2.7, 1.5, 0.7, 1.2, RTS_PAL.lit, RTS_PAL.lit);
      _r3Box(m, pbs * 7.4, 5.4, 3.4, 0.8, 0.8, 1.4, DK[0], DK[2]);  /* a stub barrel in it */
    }

    /* ---- ladder up the front-left face, starting where the bag courses stop ---- */
    _r3Box(m, -7.6, 4.2, 4.0, 0.85, 5.3, 0.85, S[2], S[3]);
    _r3Box(m, -6.3, 4.2, 4.0, 0.85, 5.3, 0.85, S[2], S[3]);
    for (i = 0; i < 4; i++) _r3Box(m, -6.95, 4.9 + i * 1.3, 4.0, 1.8, 0.55, 0.7, S[0], S[3]);
    _r3Box(m, -6.95, 9.5, 3.6, 1.8, 1.4, 0.75, S[3], S[1]);         /* grab hoop at the top */

    /* ---- roof. Biggest surface under this camera, so it carries most of the parts ---- */
    /* The parapet IS a full ring, unlike the revetment on the ground: the far side of a roof
       is the top edge of the sprite and nothing occludes it, so it is the silhouette - and it
       is CONCRETE, not more bags, because tan round the crown buries the material the
       building is made of and the drum stops reading as concrete at all. */
    for (i = 0; i < 12; i++) {
      var pbp = i / 12 * Math.PI * 2;
      _r3Box(m, Math.cos(pbp) * 5.3, 9.5, -0.6 + Math.sin(pbp) * 5.3, 2.2, 1.4, 2.2, C[3], C[1]);
    }
    _r3Box(m, -2.6, 9.5, -2.2, 3.8, 0.9, 3.8, S[2], S[1]);          /* hatch coaming */
    _r3Box(m, -2.6, 10.4, -2.2, 3.0, 0.35, 3.0, DK[2], DK[0]);      /* the opening */
    _r3Box(m, -2.6, 10.55, -1.5, 2.2, 0.35, 1.5, RTS_PAL.lit, RTS_PAL.lit);
    _r3Box(m, -2.6, 10.3, -3.9, 3.8, 0.8, 0.8, DK[1], DK[3]);       /* hinge */
    _r3Box(m, -2.6, 10.4, -4.4, 3.6, 2.0, 0.8, S[0], S[3]);         /* lid, flipped up */
    _r3Box(m, -2.6, 12.0, -4.7, 2.6, 0.6, 0.7, S[3], S[1]);
    _r3Box(m, -0.8, 10.4, -2.2, 0.8, 1.0, 2.4, S[3], S[1]);         /* grab handle */
    _r3Cyl(m, 2.0, 9.5, -3.8, 2.2, 1.3, C[3], C[1], 18);            /* observation cupola */
    _r3Cyl(m, 2.0, 10.8, -3.8, 1.7, 1.4, S[0], S[2], 16);
    _r3Box(m, 2.0, 11.2, -2.5, 2.8, 0.8, 1.1, DK[0], DK[2]);        /* its slit */
    _r3Box(m, 2.0, 11.3, -2.1, 1.7, 0.6, 0.7, RTS_PAL.glass, RTS_PAL.glass);
    _r3Cyl(m, 2.0, 12.2, -3.8, 1.85, 0.5, S[3], S[1], 16);
    _r3Cyl(m, 4.2, 9.5, -0.2, 1.7, 2.0, S[0], S[2], 16);            /* extractor */
    _r3Cyl(m, 4.2, 11.5, -0.2, 2.1, 0.7, S[3], S[1], 16);
    _r3Cone(m, 4.2, 12.2, -0.2, 2.1, 0.8, 0.9, S[2], 16);
    _r3Cyl(m, -4.4, 9.5, 0.8, 1.4, 1.6, S[2], S[1], 16);            /* mushroom vent */
    _r3Cone(m, -4.4, 11.1, 0.8, 1.9, 0.8, 0.8, S[3], 16);
    _r3Box(m, 3.8, 9.5, 1.2, 1.4, 0.8, 3.0, S[2], S[1]);            /* conduit to the mast */
    _r3Box(m, -1.0, 9.5, 2.4, 2.6, 1.5, 2.0, S[2], S[3]);           /* ready locker */
    _r3Box(m, -1.0, 11.0, 2.4, 2.2, 0.4, 1.7, S[3], S[1]);
    _r3Cyl(m, -3.2, 9.5, 3.4, 1.5, 0.5, DK[1], DK[3], 16);          /* coiled hose */
    _r3Cyl(m, -3.2, 10.0, 3.4, 1.2, 0.4, DK[3], DK[1], 16);
    _r3Box(m, -3.0, 10.4, 3.6, 2.8, 2.2, 2.0, S[1], S[3]);          /* searchlight */
    _r3Box(m, -3.0, 10.8, 4.7, 2.0, 1.5, 0.8, RTS_PAL.lit, RTS_PAL.lit);
    _r3Cyl(m, 3.2, 9.5, 2.6, 2.0, 0.7, C[2], C[0], 16);             /* aerial: base, insulator, */
    _r3Cyl(m, 3.2, 10.2, 2.6, 1.2, 1.0, DK[1], DK[3], 16);          /* mast, collar, whip, light */
    _r3Box(m, 4.5, 10.2, 2.6, 1.5, 2.2, 1.0, S[3], S[1]);           /* stay brackets */
    _r3Box(m, 3.2, 10.2, 1.5, 1.0, 2.2, 1.3, S[3], S[1]);
    _r3Cyl(m, 3.2, 11.2, 2.6, 0.9, 2.6, S[1], S[3], 16);
    _r3Cyl(m, 3.2, 13.8, 2.6, 1.2, 0.6, S[3], S[1], 16);
    _r3Box(m, 4.5, 12.9, 2.6, 2.4, 1.6, 0.8, TM[1], TM[3]);         /* pennant */
    _r3Cyl(m, 3.2, 14.4, 2.6, 0.75, 1.6, S[0], S[2], 16);
    _r3Cyl(m, 3.2, 16.0, 2.6, 0.95, 0.9, RTS_PAL.hazard[0], RTS_PAL.lit, 16);
  } else if (key === 'depot') {
    /* Service Depot: a concrete hardstanding with a portal gantry standing over it and a
       workshop block along the back. Everything here serves keeping the MIDDLE of the pad
       empty - the hazard-striped lane between the gantry legs is the only cue that says
       "drive damaged things in here", and it is what stops the Depot reading as a third shed
       parked next to the War Factory, so the gear is pushed out to the left and right margins
       and along the front kerb, where it frames the lane instead of filling it.

       Both of the gantry's dimensions were forced by the projection rather than chosen.
       screenY = z - 1.3y, so a beam is a solid horizontal band of steel laid across every
       column of the sprite it spans, and anything further back whose rows fall inside that
       band is simply deleted from the bake. A first pass ran the beam the full 46 units at
       14 of clearance and lost the parts rack, the compressor, four of the five drums and
       the bottom half of the roller shutter to it. So the beam is 34 wide, which leaves a
       clear seven-unit margin down each side for the yard gear, and it clears the pad by
       12.5, which drops its band low enough that the whole workshop elevation above it -
       shutter, stripe, windows, cornice - is untouched. What the band covers now is the
       empty middle of the pad, which is the one part of this model that is meant to be empty.

       Everything else goes on the workshop roof or along the front kerb, because height
       projects straight up under this camera - horizontal planes own the pixels, while the
       +/-x faces of every box here are edge-on and worth nothing. */

    var dpDrum = function (dx, dz, dc) {                            /* oil drum + rolling hoops */
      _r3Cyl(m, dx, 1.9, dz, 2.0, 5.4, dc, DK[1], 16);
      _r3Cyl(m, dx, 3.0, dz, 2.3, 0.7, DK[1], DK[2], 16);
      _r3Cyl(m, dx, 5.6, dz, 2.3, 0.7, DK[1], DK[2], 16);
    };
    var dpBollard = function (dx, dz) {                             /* pipe bollard, hazard collar */
      _r3Cyl(m, dx, 1.9, dz, 1.5, 4.6, S[2], S[1], 16);
      _r3Cyl(m, dx, 4.4, dz, 1.7, 1.2, RTS_PAL.hazard[0], RTS_PAL.hazard[0], 16);
      _r3Cone(m, dx, 6.5, dz, 1.6, 0.8, 0.8, S[0], 16);
    };
    var dpCrate = function (dx, dz, dw, dh, dd) {
      _r3Box(m, dx, 1.9, dz, dw, dh, dd, RTS_PAL.dirt[2], RTS_PAL.dirt[1]);
      _r3Box(m, dx, 1.9 + dh, dz, dw - 1.6, 0.6, dd - 1.6, RTS_PAL.dirt[3], RTS_PAL.dirt[3]);
      _r3Box(m, dx, 1.9 + dh * 0.45, dz + dd / 2 + 0.4, dw, 1.2, 0.8, DK[1], DK[2]);
    };
    var dpTyres = function (dx, dz, dn) {                           /* stack of scrap tyres */
      for (var dt0 = 0; dt0 < dn; dt0++)
        _r3Cyl(m, dx, 1.9 + dt0 * 1.5, dz, 2.6 - dt0 * 0.14, 1.5, dt0 % 2 ? DK[1] : DK[0], DK[2], 16);
    };
    var dpFlood = function (dx, dy, dz, dh) {                       /* floodlight mast */
      _r3Cyl(m, dx, dy, dz, 1.1, dh, S[2], S[1], 16);
      _r3Box(m, dx, dy + dh, dz, 3.8, 1.2, 2.0, S[3], S[1]);
      _r3Box(m, dx, dy + 1.2 + dh, dz, 4.4, 2.4, 3.0, DK[1], DK[3]);
      _r3Box(m, dx, dy + 1.8 + dh, dz + 1.8, 3.8, 1.6, 0.8, RTS_PAL.lit, RTS_PAL.lit);
    };
    var dpLadder = function (dx, dy, dz, dh, dn) {                  /* two rails plus rungs */
      _r3Box(m, dx - 1.1, dy, dz, 1.1, dh, 1.0, S[3], S[1]);
      _r3Box(m, dx + 1.1, dy, dz, 1.1, dh, 1.0, S[3], S[1]);
      for (var dl0 = 0; dl0 < dn; dl0++)
        _r3Box(m, dx, dy + 1.2 + dl0 * ((dh - 1.6) / dn), dz, 2.6, 0.55, 0.7, S[1], S[0]);
    };
    /* Handrail: posts, a top rail and a TOE BOARD at deck level. It deliberately carries no
       mid rail - a second horizontal at knee height lands on exactly the rows the rooflight
       behind it occupies and wipes it out, where a toe board sits a row lower and does not. */
    var dpRail = function (dx, dy, dz, dw, dn) {
      for (var dr0 = 0; dr0 < dn; dr0++)
        _r3Box(m, dx + (dr0 - (dn - 1) / 2) * (dw / (dn - 1)), dy, dz, 1.2, 3.0, 1.2, S[3], S[1]);
      _r3Box(m, dx, dy + 3.0, dz, dw, 0.8, 1.4, S[1], S[0]);
      _r3Box(m, dx, dy - 0.2, dz, dw, 0.8, 1.1, S[2], S[3]);
    };

    /* ------------------------------------------------------------- the pad -- */
    _r3Box(m, 0, 0, 0, W - 1.5, 1.5, D - 1.5, C[2], C[0]);          /* hardstanding */
    _r3Box(m, 0, 1.5, 7, 42, 0.4, 32, C[1], C[1]);                  /* worn working slab */
    _r3Box(m, 0, 1.9, 9.5, 17, 0.3, 27, C[3], C[3]);                /* the repair lane */
    for (var dp2 = 0; dp2 < 2; dp2++)                               /* its hazard edge stripes */
      _r3Box(m, dp2 ? 8.2 : -8.2, 1.9, 9.5, 1.8, 0.4, 27, RTS_PAL.hazard[0], RTS_PAL.hazard[0]);
    for (var dp3 = 0; dp3 < 6; dp3++) {                             /* black ticks on them */
      _r3Box(m, -8.2, 2.3, 4.0 + dp3 * 3.2, 1.9, 0.2, 1.7, RTS_PAL.hazard[1], RTS_PAL.hazard[1]);
      _r3Box(m, 8.2, 2.3, 4.0 + dp3 * 3.2, 1.9, 0.2, 1.7, RTS_PAL.hazard[1], RTS_PAL.hazard[1]);
    }
    _r3Box(m, 0, 1.9, 19.8, 17, 0.35, 2.6, DK[0], DK[2]);           /* drain across the entry */
    for (var dp4 = 0; dp4 < 5; dp4++)
      _r3Box(m, -6.4 + dp4 * 3.2, 2.25, 19.8, 2.6, 0.22, 2.2, S[2], S[1]);
    _r3Box(m, 0, 1.5, 23.0, W - 4, 1.0, 1.8, RTS_PAL.hazard[0], RTS_PAL.hazard[0]);  /* entry kerb */
    for (var dp5 = 0; dp5 < 10; dp5++)
      _r3Box(m, -19.8 + dp5 * 4.4, 1.5, 23.0, 2.2, 1.1, 2.0, RTS_PAL.hazard[1], RTS_PAL.hazard[1]);

    /* -------------------------------------------------- the workshop block -- */
    /* Nothing on this elevation below y=4.4: that is the strip the gantry beam covers. */
    _r3Slab(m, -10, 1.5, -14, 27, 19, 19, 3.5, B.wall, B.roof);     /* tall core */
    _r3Box(m, -10, 17.0, -4.2, 27, 1.6, 1.8, B.trim, B.trim);       /* cornice */
    for (var dp6 = 0; dp6 < 2; dp6++)                               /* recessed wall courses */
      _r3Box(m, -10, 5.4 + dp6 * 2.7, -4.0, 26, 0.7, 1.2, B.dark, B.dark);
    _r3Box(m, -15.2, 4.4, -4.3, 13.0, 9.9, 1.5, DK[0], DK[2]);      /* shutter reveal */
    for (var dp7 = 0; dp7 < 5; dp7++)                               /* shutter slats */
      _r3Box(m, -15.2, 5.2 + dp7 * 1.32, -3.7, 10.6, 1.05, 1.3, S[2], S[1]);
    _r3Box(m, -15.2, 12.0, -3.5, 10.6, 2.0, 1.4, TM[0], TM[1]);     /* team stripe on the shutter */
    _r3Box(m, -15.2, 14.3, -2.9, 15.0, 1.0, 4.6, S[1], S[0]);       /* door canopy */
    _r3Box(m, -21.2, 12.9, -2.0, 1.6, 1.6, 3.2, S[3], S[3]);        /* canopy braces */
    _r3Box(m, -9.2, 12.9, -2.0, 1.6, 1.6, 3.2, S[3], S[3]);
    pilasters(-4.0, 4.6, -22.6, 1, 0, 2.6, 12.4);                   /* corner pier */
    pilasters(-4.0, 4.6, -3.2, 3, 5.4, 2.4, 12.4);                  /* piers on the office bay */
    winRow(-4.0, 9.4, -3.2, 2, 5.4, 2.8, 2.8);
    winRow(-4.0, 13.6, -3.2, 2, 5.4, 2.8, 2.6);
    _r3Box(m, -5.9, 5.6, -3.9, 3.2, 3.5, 1.4, DK[0], DK[2]);        /* personnel door */

    _r3Slab(m, 14, 1.5, -17.5, 19, 9, 12, 2, B.wall, B.roof);       /* lower annexe */
    _r3Gable(m, 14, 10.5, -17.5, 19.6, 5.5, 12.6, B.roof);          /* its pitched roof */
    _r3Box(m, 14, 15.6, -17.5, 19.6, 0.9, 1.8, TM[1], TM[0]);       /* ridge cap in team colour */
    for (var dp8 = 0; dp8 < 3; dp8++)                               /* workshop rooflights */
      _r3Box(m, 7.0 + dp8 * 7.0, 12.2, -13.9, 5.2, 1.0, 3.2, RTS_PAL.glass, RTS_PAL.glass);
    _r3Box(m, 14, 1.5, -11.1, 19, 2.2, 1.4, C[2], C[1]);            /* annexe plinth */
    /* Its front detail all sits LEFT of x=16: the fuel tank stands off the right-hand end
       and everything behind the tank bakes to nothing. */
    pilasters(-11.0, 1.5, 10.2, 3, 4.8, 2.0, 8.2);
    winRow(-11.0, 4.6, 12.6, 1, 0, 2.6, 2.6);
    _r3Box(m, 12.6, 7.6, -11.0, 2.6, 1.8, 1.4, DK[1], DK[3]);       /* wall extract vent */
    _r3Box(m, 7.8, 1.5, -11.0, 3.2, 7.0, 1.4, DK[0], DK[2]);        /* annexe door */
    _r3Box(m, 7.8, 8.5, -10.6, 4.6, 0.9, 2.6, S[1], S[0]);          /* its hood */
    /* The flue is tall on purpose: the annexe is low, so without it the top right corner of
       the sprite is empty sky while the workshop aerial fills the top left. */
    _r3Cyl(m, 21.4, 10.5, -17.5, 1.7, 12.0, S[2], DK[1], 16);
    _r3Cyl(m, 21.4, 16.4, -17.5, 2.0, 0.9, S[3], S[3], 16);
    _r3Cone(m, 21.4, 22.5, -17.5, 2.2, 1.2, 1.4, DK[1], 16);
    for (var dpt = 0; dpt < 2; dpt++) {                             /* ridge vents beside it */
      _r3Cyl(m, 9.0 + dpt * 5.4, 16.0, -17.5, 1.2, 2.6, S[2], S[1], 16);
      _r3Cone(m, 9.0 + dpt * 5.4, 18.6, -17.5, 1.5, 0.8, 1.0, DK[1], 16);
    }

    /* --------------------------------------------------- workshop roof plant */
    _r3Box(m, -10, 20.5, -14, 19.4, 0.5, 11.4, DK[0], DK[1]);       /* felt deck */
    _r3Box(m, -10, 20.5, -8.4, 19.6, 1.6, 1.3, C[2], C[1]);         /* parapets */
    _r3Box(m, -10, 20.5, -19.6, 19.6, 1.6, 1.3, C[2], C[1]);
    _r3Box(m, -19.6, 20.5, -14, 1.3, 1.6, 11.4, C[2], C[1]);
    _r3Box(m, -0.4, 20.5, -14, 1.3, 1.6, 11.4, C[2], C[1]);
    _r3Slab(m, -16, 21.0, -16, 7.4, 7.0, 7.4, 1.8, B.wall, B.roof); /* stair head / plant room */
    _r3Box(m, -16, 21.8, -12.1, 4.0, 5.0, 1.4, DK[0], DK[2]);       /* its door */
    _r3Box(m, -16, 28.0, -16, 6.4, 0.8, 6.4, S[3], S[1]);           /* its cap */
    _r3Box(m, -16, 28.8, -16.4, 4.4, 1.5, 3.6, TM[0], TM[1]);       /* team panel */
    _r3Cyl(m, -14.0, 28.8, -14.0, 0.9, 5.6, S[1], S[0], 16);        /* aerial mast */
    for (var dp9 = 0; dp9 < 3; dp9++)
      _r3Box(m, -14.0, 30.8 + dp9 * 1.3, -14.0, 4.4 - dp9 * 1.0, 0.6, 0.9, S[3], S[1]);
    _r3Cyl(m, -14.0, 34.4, -14.0, 0.9, 1.2, RTS_PAL.lit, RTS_PAL.lit, 16);
    _r3Cyl(m, -18.4, 28.8, -14.0, 1.0, 1.4, DK[1], DK[3], 16);      /* warning beacon */
    _r3Cone(m, -18.4, 30.2, -14.0, 1.2, 0.5, 1.4, RTS_PAL.hazard[0], 16);
    _r3Box(m, -7.6, 21.0, -16.4, 8.0, 4.4, 6.4, DK[1], DK[3]);      /* air handler */
    for (var dpa = 0; dpa < 3; dpa++)                               /* its louvres */
      _r3Box(m, -7.6, 22.7 + dpa * 1.0, -13.1, 7.0, 0.7, 0.9, S[3], S[1]);
    _r3Box(m, -7.6, 25.4, -16.4, 6.6, 0.9, 5.2, S[2], S[0]);        /* AHU lid */
    _r3Cyl(m, -5.4, 26.3, -16.4, 2.1, 2.6, S[1], S[0], 16);         /* its fan cowl */
    _r3Cone(m, -5.4, 28.9, -16.4, 2.5, 1.4, 1.3, DK[1], 16);
    _r3Box(m, -10.4, 24.0, -16.4, 2.8, 2.8, 2.8, S[3], S[1]);       /* duct elbow off the AHU */
    _r3Box(m, -10.4, 24.2, -13.2, 2.4, 2.4, 4.0, S[2], S[0]);       /* duct run forward */
    _r3Box(m, -10.4, 24.1, -13.6, 2.8, 2.6, 0.5, S[3], S[3]);       /* duct band */
    _r3Box(m, -10.4, 24.0, -11.6, 2.8, 2.8, 2.8, S[3], S[1]);       /* elbow down */
    _r3Cyl(m, -2.6, 21.0, -18.4, 2.6, 4.2, S[1], S[0], 16);         /* header tank */
    _r3Cyl(m, -2.6, 25.2, -18.4, 2.8, 0.8, S[3], S[1], 16);
    _r3Cone(m, -2.6, 26.0, -18.4, 2.4, 1.2, 1.2, DK[1], 16);
    _r3Box(m, -5.0, 21.0, -12.2, 5.6, 1.0, 3.0, S[2], S[3]);        /* condenser skid */
    for (var dpv = 0; dpv < 2; dpv++) {
      _r3Cyl(m, -6.6 + dpv * 3.2, 22.0, -12.2, 1.5, 2.4, S[3], S[1], 16);
      _r3Cone(m, -6.6 + dpv * 3.2, 24.4, -12.2, 1.8, 1.0, 1.1, DK[1], 16);
    }
    _r3Box(m, -14.4, 21.0, -11.4, 3.6, 0.6, 3.2, S[3], S[1]);       /* roof hatch */
    _r3Box(m, -14.4, 21.6, -12.4, 3.2, 2.2, 1.6, S[1], S[0]);       /* its propped lid */
    _r3Box(m, -10, 21.0, -9.6, 15.0, 0.6, 2.0, S[2], S[3]);         /* catwalk along the edge */
    dpRail(-10, 21.6, -9.0, 14.2, 6);
    /* The yard floodlights live up here rather than on masts in the yard: a mast standing on
       the pad is 13 units of near geometry and it deletes whatever share of the margin it
       stands in front of. On the parapet they overhang the pad and cost nothing. */
    for (var dpw = 0; dpw < 2; dpw++) dpFlood(dpw ? -2.6 : -18.4, 21.0, -9.4, 5.0);

    /* -------------------------------------------------------- gantry crane -- */
    for (var dpe = 0; dpe < 2; dpe++) {
      var dsg = dpe ? 1 : -1;
      _r3Box(m, dsg * 13.0, 1.9, 12.6, 8.4, 2.6, 9.2, C[2], C[1]);  /* leg footing */
      _r3Box(m, dsg * 13.0, 1.9, 16.6, 7.6, 2.8, 1.4, RTS_PAL.hazard[0], RTS_PAL.hazard[0]);
      _r3Box(m, dsg * 10.6, 4.5, 13, 2.6, 8.0, 3.6, S[1], S[0]);    /* the two leg posts */
      _r3Box(m, dsg * 15.4, 4.5, 13, 2.6, 8.0, 3.6, S[1], S[0]);
      for (var dpf = 0; dpf < 2; dpf++)                             /* horizontal braces */
        _r3Box(m, dsg * 13.0, 5.4 + dpf * 3.4, 13, 5.2, 1.3, 2.4, S[2], S[3]);
      for (var dpg = 0; dpg < 4; dpg++)                             /* stepped diagonal bracing */
        _r3Box(m, dsg * (11.4 + dpg * 1.0), 6.6 + dpg * 0.9, 13, 1.9, 1.4, 1.9, S[0], S[3]);
      _r3Box(m, dsg * 13.0, 4.5, 14.9, 6.4, 1.4, 1.2, S[3], S[1]);  /* rail-clamp plate */
    }
    dpLadder(-9.9, 4.5, 15.0, 8.0, 5);                              /* ladder up the near leg */
    _r3Box(m, 0, 12.5, 13, 34, 0.9, 4.8, S[2], S[3]);               /* beam lower flange */
    _r3Box(m, 0, 13.4, 13, 34, 1.7, 2.8, S[1], S[0]);               /* beam web */
    _r3Box(m, 0, 15.1, 13, 34, 0.9, 5.2, S[3], S[0]);               /* top flange */
    for (var dph = 0; dph < 7; dph++)                               /* web stiffeners */
      _r3Box(m, -15 + dph * 5, 13.4, 14.5, 1.6, 1.7, 0.8, S[3], S[3]);
    _r3Box(m, 0, 16.0, 12.4, 26, 0.3, 2.6, TM[0], TM[1]);           /* team stripe along the top */
    _r3Box(m, 0, 11.4, 14.9, 30, 0.7, 0.8, DK[0], DK[2]);           /* festoon cable */
    for (var dpi = 0; dpi < 4; dpi++)                               /* its carriers */
      _r3Box(m, dpi < 2 ? -16 + dpi * 6.5 : 9.5 + (dpi - 2) * 6.5, 11.4, 14.9, 1.6, 1.2, 1.6, DK[1], DK[3]);
    for (var dpj = 0; dpj < 5; dpj++)                               /* junction boxes on the beam */
      _r3Box(m, -13 + dpj * 6.5, 16.0, 14.0, 2.8, 1.8, 2.2, DK[1], DK[3]);
    _r3Box(m, 0, 16.0, 11.0, 32, 1.0, 1.4, S[1], S[0]);             /* conduit along the top */
    for (var dpk = 0; dpk < 2; dpk++) {                             /* floodlights on the beam */
      _r3Box(m, dpk ? 6.5 : -6.5, 10.9, 16.2, 3.4, 1.6, 2.2, DK[1], DK[3]);
      _r3Box(m, dpk ? 6.5 : -6.5, 10.5, 16.4, 2.6, 0.6, 1.8, RTS_PAL.lit, RTS_PAL.lit);
    }
    _r3Cyl(m, -9.4, 16.0, 13, 1.0, 1.3, DK[1], DK[3], 16);          /* beacon on the beam */
    _r3Cone(m, -9.4, 17.3, 13, 1.2, 0.5, 1.3, RTS_PAL.hazard[0], 16);
    _r3Box(m, 0, 9.0, 13, 9.4, 3.5, 6.4, S[0], S[1]);               /* hoist trolley */
    _r3Box(m, 0, 9.6, 16.4, 3.4, 2.4, 1.6, S[2], S[1]);             /* its winch housing */
    _r3Cyl(m, 2.6, 9.8, 16.6, 1.3, 1.8, DK[1], DK[3], 16);          /* rope drum on the end */
    for (var dpl = 0; dpl < 2; dpl++)                               /* its wheels on the flange */
      _r3Box(m, dpl ? 4.0 : -4.0, 11.6, 15.8, 1.8, 1.4, 1.8, DK[1], DK[3]);
    _r3Box(m, -3.2, 6.9, 16.4, 1.0, 2.1, 1.0, DK[1], DK[3]);        /* the falls */
    _r3Box(m, 3.2, 6.9, 16.4, 1.0, 2.1, 1.0, DK[1], DK[3]);
    _r3Box(m, 0, 4.9, 13, 6.0, 2.2, 5.2, S[0], S[1]);               /* hook block */
    _r3Cyl(m, 0, 5.3, 13, 1.9, 1.8, S[3], S[1], 16);
    _r3Box(m, 0, 3.6, 15.8, 1.6, 1.8, 1.2, DK[1], DK[3]);           /* the hook, slung forward */
    _r3Cone(m, 0, 1.9, 13, 4.6, 3.3, 2.5, TM[1], 16);               /* a turret under it */
    _r3Box(m, 0, 2.6, 17.2, 2.2, 2.0, 5.6, DK[1], DK[3]);           /* its gun, pointing out */
    _r3Box(m, -4.2, 4.2, 15.9, 1.0, 2.4, 1.0, S[3], S[1]);          /* slings to the hook */
    _r3Box(m, 4.2, 4.2, 15.9, 1.0, 2.4, 1.0, S[3], S[1]);

    /* ----------------------------------------------- yard gear, left margin - */
    _r3Box(m, -20.4, 1.9, -3.0, 7.0, 0.7, 5.4, C[2], C[1]);         /* parts rack base */
    for (var dpm = 0; dpm < 2; dpm++)                               /* its uprights */
      _r3Box(m, -23.2 + dpm * 5.6, 2.6, -1.1, 1.4, 11.0, 1.4, S[2], S[1]);
    for (var dpn = 0; dpn < 3; dpn++)                               /* its shelves */
      _r3Box(m, -20.4, 4.6 + dpn * 3.2, -3.0, 7.0, 0.7, 5.0, S[3], S[0]);
    _r3Box(m, -22.2, 5.3, -3.5, 3.0, 2.2, 3.6, RTS_PAL.ore[3], RTS_PAL.ore[4]);   /* stock on it */
    _r3Box(m, -18.8, 5.3, -3.1, 3.2, 2.4, 3.4, S[2], S[1]);
    _r3Cyl(m, -22.0, 8.5, -3.1, 1.5, 2.4, DK[1], DK[3], 16);
    _r3Box(m, -19.2, 8.5, -3.3, 3.6, 2.0, 3.4, RTS_PAL.dirt[2], RTS_PAL.dirt[3]);
    _r3Box(m, -20.6, 11.7, -3.1, 5.2, 1.8, 3.2, RTS_PAL.ore[0], RTS_PAL.ore[1]);
    dpDrum(-17.4, 4.6, S[2]);
    _r3Box(m, -21.3, 1.9, 6.0, 5.0, 1.0, 5.0, C[2], C[1]);          /* pallet of bar stock */
    for (var dpx = 0; dpx < 3; dpx++)
      _r3Box(m, -21.3, 2.9 + dpx * 0.9, 6.0, 4.4 - dpx * 0.8, 0.9, 4.4 - dpx * 0.8,
        dpx % 2 ? RTS_PAL.ore[3] : S[2], dpx % 2 ? RTS_PAL.ore[4] : S[1]);

    /* ---------------------------------------------- yard gear, right margin - */
    _r3Box(m, 20.2, 1.5, 2.0, 7.0, 1.0, 9.0, C[2], C[1]);           /* fuel tank hardstand */
    _r3Box(m, 20.2, 2.5, 2.0, 5.6, 4.5, 7.0, C[2], C[0]);           /* its pedestal */
    _r3Box(m, 20.2, 7.0, 2.0, 7.0, 1.2, 8.2, S[3], S[1]);           /* its cradle */
    _r3Cyl(m, 20.2, 8.2, 2.0, 3.5, 8.0, S[0], S[1], 18);            /* the tank */
    for (var dpr = 0; dpr < 2; dpr++)                               /* its hoops */
      _r3Cyl(m, 20.2, 9.6 + dpr * 3.8, 2.0, 3.75, 0.9, S[2], S[3], 18);
    _r3Cone(m, 20.2, 16.2, 2.0, 3.5, 1.6, 2.2, S[1], 18);           /* conical top */
    _r3Cyl(m, 20.2, 18.4, 2.0, 1.2, 2.0, DK[1], DK[3], 16);         /* filler neck */
    _r3Box(m, 20.2, 11.4, 5.6, 5.0, 2.0, 0.9, TM[0], TM[1]);        /* team panel on the tank */
    _r3Box(m, 20.0, 1.9, 14.6, 5.4, 4.0, 4.4, S[2], S[1]);          /* compressor set */
    _r3Cyl(m, 20.0, 5.9, 14.6, 1.8, 4.6, S[0], S[3], 16);
    _r3Box(m, 20.0, 5.9, 17.0, 4.0, 1.6, 1.2, DK[1], DK[3]);
    _r3Box(m, 17.0, 1.9, 14.6, 1.6, 2.6, 1.6, DK[1], DK[3]);
    _r3Cyl(m, 18.4, 1.9, 8.0, 1.7, 6.4, RTS_PAL.hazard[0], S[3], 16);    /* welding bottles */
    _r3Cyl(m, 21.4, 1.9, 8.0, 1.7, 6.4, DK[1], S[3], 16);
    _r3Cone(m, 18.4, 8.3, 8.0, 1.7, 1.0, 1.2, S[3], 16);
    _r3Cone(m, 21.4, 8.3, 8.0, 1.7, 1.0, 1.2, S[3], 16);
    dpDrum(10.5, 14.0, RTS_PAL.hazard[0]);
    dpDrum(14.5, 16.8, S[0]);

    /* ------------------------------------------- yard gear, along the kerb -- */
    _r3Box(m, -18.4, 1.9, 19.6, 9.0, 0.9, 0.9, S[2], S[1]);         /* work bench frame */
    _r3Box(m, -22.4, 1.9, 19.6, 1.4, 4.4, 3.6, S[2], S[1]);
    _r3Box(m, -14.4, 1.9, 19.6, 1.4, 4.4, 3.6, S[2], S[1]);
    _r3Box(m, -18.4, 6.3, 19.6, 9.6, 0.9, 4.4, RTS_PAL.dirt[3], RTS_PAL.dirt[1]);  /* bench top */
    _r3Box(m, -18.4, 7.2, 17.6, 9.6, 4.6, 0.8, S[3], S[1]);         /* tool board behind it */
    for (var dpo = 0; dpo < 5; dpo++)                               /* tools hung on it */
      _r3Box(m, -22.0 + dpo * 1.8, 7.6, 18.1, 0.9, 3.2, 0.7, DK[1], DK[3]);
    _r3Box(m, -15.4, 7.2, 20.2, 2.2, 2.0, 2.2, DK[1], DK[3]);       /* the vice */
    _r3Box(m, -20.8, 7.2, 20.6, 3.2, 1.4, 2.4, S[0], S[3]);         /* junk on the bench */
    dpCrate(-10.2, 19.6, 4.8, 4.6, 4.4);
    dpBollard(-9.8, 22.0);
    dpBollard(9.8, 22.0);
    for (var dps = 0; dps < 2; dps++) {                             /* axle stands beside the lane */
      _r3Cone(m, dps ? 5.6 : -5.6, 1.9, 18.6, 2.0, 0.9, 2.6, S[2], 16);
      _r3Box(m, dps ? 5.6 : -5.6, 4.5, 18.6, 1.6, 1.6, 1.6, RTS_PAL.hazard[0], RTS_PAL.hazard[0]);
    }
    _r3Box(m, 10.6, 1.9, 19.0, 4.4, 3.4, 3.6, S[2], S[1]);          /* tool chest */
    for (var dpp = 0; dpp < 3; dpp++)
      _r3Box(m, 10.6, 2.4 + dpp * 1.0, 21.0, 4.0, 0.7, 0.8, DK[1], DK[3]);
    _r3Box(m, 10.6, 5.3, 19.0, 4.8, 0.6, 4.0, TM[1], TM[0]);
    dpTyres(17.6, 21.4, 4);
    _r3Box(m, 20.6, 1.9, 20.4, 6.6, 0.8, 5.6, RTS_PAL.dirt[2], RTS_PAL.dirt[1]);  /* cable drum */
    _r3Cyl(m, 20.6, 2.7, 20.4, 3.2, 0.9, RTS_PAL.dirt[3], RTS_PAL.dirt[1], 18);
    _r3Cyl(m, 20.6, 3.6, 20.4, 2.4, 3.2, DK[0], DK[2], 18);
    _r3Cyl(m, 20.6, 6.8, 20.4, 3.2, 0.9, RTS_PAL.dirt[3], RTS_PAL.dirt[1], 18);
    dpDrum(-3.0, 9.5, S[2]);                                        /* a drum out in the bay */
    _r3Box(m, -6.8, 1.9, 5.0, 5.0, 0.8, 4.0, S[3], S[1]);           /* an engine on a trestle */
    _r3Box(m, -6.8, 2.7, 5.0, 4.0, 2.0, 3.0, S[2], S[1]);
    _r3Box(m, -6.8, 4.7, 5.0, 5.6, 0.9, 4.6, S[0], S[3]);
    _r3Box(m, -5.6, 1.9, 15.0, 4.6, 1.0, 2.2, DK[1], DK[3]);        /* a trolley jack */
    _r3Box(m, -5.6, 2.9, 15.0, 3.0, 0.9, 1.6, S[2], S[1]);
    _r3Box(m, -3.4, 2.9, 15.6, 1.0, 2.6, 0.9, S[3], S[1]);
  } else if (key === 'turret') {
    /* Gun Turret: a cast gun house on a bolted traverse race, over a tapered concrete
       pillbox, sunk in a round poured gun pit inside a sandbag revetment, with a squared
       entrance bastion pushed out to the front.

       SILHOUETTE FIRST. This gets one tile, and the baker renders it into a canvas exactly
       footW wide - 24 art pixels. A full-tile square apron therefore fills every column of
       the sprite, _sprEdge has no transparent pixel left to outline into, and the whole
       structure reads as a grey rectangle with texture on it. So the pit is ROUND (r 10.6,
       inside the 12 the tile allows) with a rectangular hardstanding tab projecting at the
       front: circle, notch, margin. That is the same shape language as the pillbox, and it
       is most of why either of them reads at this size.

       Nothing crosses |10.9| in x or z. Not because 12 is the hard limit - it is - but
       because the last pixel column has to stay EMPTY for the outline. A muzzle brake that
       reaches x=11.8 does not read as the end of a gun, it reads as the edge of the sprite.

       The gun is modelled, and it points down +x, because that is the one axis this camera
       does not foreshorten: screenX is model x, so a barrel along +x reads at full length,
       where the same barrel down +z collapses into a stub behind its own turret. The
       renderer's tracking line then reads as the laying indicator over a gun that is
       visibly there. Its screen band (rows ~12-14) is kept clear of the rear stowage bin's:
       an earlier pass had bin top and barrel top at the same z - 1.3y, and the two fused
       into one bar spanning the whole sprite with the turret apparently threaded onto it.

       Values are banded so the stack separates at four pixels of each: pale concrete below,
       dark steel at the race, faction wall colour above it, pale trim on the roof, and the
       gun near-black against open background. Team colour is spent on the band, the kerb
       dashes, the bastion plate and two roof flashes - four places to read the owner. */

    var tBag = function (bx, by, bz, tn) {                 /* one sandbag of the revetment */
      _r3Cyl(m, bx, by, bz, 1.3, 1.6, RTS_PAL.bag[tn % 3], RTS_PAL.bag[(tn + 1) % 3], 16);
    };
    /* Bolt heads are read from ABOVE under this camera, so they go on the TOP face of the
       ring they belong to, and every ring below sits on an annulus that is actually exposed
       - a stud circle tucked inside the taper of the drum above it is 16 calls for nothing. */
    var tStudRing = function (sy, sr, sn, sw, sh, sc, sc2) {
      for (var ts0 = 0; ts0 < sn; ts0++) {
        var ta0 = (ts0 + 0.5) / sn * Math.PI * 2;
        _r3Cyl(m, Math.cos(ta0) * sr, sy, Math.sin(ta0) * sr, sw, sh, sc, sc2, 16);
      }
    };
    var tCrate = function (cx, cy, cz, cw, ch, cd) {       /* ammunition box, banded lid */
      _r3Box(m, cx, cy, cz, cw, ch, cd, RTS_PAL.dirt[2], RTS_PAL.dirt[1]);
      _r3Box(m, cx, cy + ch, cz, cw - 0.6, 0.3, cd - 0.6, RTS_PAL.dirt[0], RTS_PAL.hazard[0]);
    };

    /* ---- gun pit ---------------------------------------------------------------------- */
    _r3Cyl(m, 0, 0, 0, 10.6, 1.4, C[2], C[0], 20);                      /* poured pit */
    _r3Box(m, 0, 0, 7.2, 14.6, 1.4, 7.0, C[2], C[0]);                   /* entrance hardstanding */
    _r3Cyl(m, 0, 1.4, 0, 9.4, 0.2, C[1], C[1], 20);                     /* inner pour, second tone */
    _r3Box(m, 0, 1.4, 10.1, 14.6, 1.0, 1.2, DK[1], DK[2]);              /* kerb */
    for (i = 0; i < 5; i++)                                             /* hazard chevrons on it */
      _r3Box(m, -5.2 + i * 2.6, 2.4, 10.1, 2.0, 0.35, 1.2,
             (i % 2) ? RTS_PAL.hazard[1] : RTS_PAL.hazard[0],
             (i % 2) ? RTS_PAL.hazard[1] : RTS_PAL.hazard[0]);
    for (i = 0; i < 2; i++)                                             /* team dashes on the lip */
      _r3Box(m, -4.2 + i * 8.4, 2.4, 10.45, 3.6, 0.45, 0.6, TM[0], TM[0]);
    for (i = 0; i < 2; i++) {                                           /* bollards */
      var tp1 = i ? 6.4 : -6.4;
      _r3Cyl(m, tp1, 1.4, 9.6, 1.0, 2.7, S[2], S[1], 16);
      _r3Cyl(m, tp1, 4.1, 9.6, 1.12, 0.5, RTS_PAL.hazard[0], RTS_PAL.hazard[0], 16);
    }

    /* ---- sandbag revetment --------------------------------------------------------------
       A ring, not a wall: one course all the way round with a gap left at the front for the
       entrance, then a second course over the back half and a third over the back third. The
       stepped parapet is the outline of the emplacement and it is what stops the pit reading
       as a plain disc with something standing in the middle of it. */
    for (i = 0; i < 16; i++) {
      var ta1 = (i + 0.5) / 16 * Math.PI * 2;
      if (Math.sin(ta1) > 0.55) continue;                               /* entrance gap */
      tBag(Math.cos(ta1) * 9.5, 1.4, Math.sin(ta1) * 9.5, i);
    }
    for (i = 0; i < 10; i++) {
      var tb1 = (i + 0.5) / 10 * Math.PI + Math.PI;
      tBag(Math.cos(tb1) * 9.5, 3.0, Math.sin(tb1) * 9.5, i + 1);
    }
    for (i = 0; i < 6; i++) {
      var tc1 = (i + 0.5) / 6 * Math.PI * 0.78 + Math.PI * 1.11;
      tBag(Math.cos(tc1) * 9.5, 4.6, Math.sin(tc1) * 9.5, i);
    }
    /* Wire behind the parapet. The turret occludes its middle, so what survives is two short
       horizontals at the top corners - something NON-vertical in a silhouette that is
       otherwise all stacked drums. */
    for (i = 0; i < 3; i++) _r3Cyl(m, -8.0 + i * 8.0, 4.6, -8.4, 0.5, 3.0, S[0], S[3], 16);
    _r3Box(m, 0, 6.4, -8.4, 16.0, 0.4, 0.4, S[0], S[3]);                /* strands */
    _r3Box(m, 0, 5.6, -8.4, 16.0, 0.4, 0.4, S[0], S[3]);

    /* ---- armoured base ---------------------------------------------------------------- */
    _r3Cyl(m, 0, 1.4, 0, 8.0, 0.9, C[2], C[1], 20);                     /* footing ring */
    tStudRing(2.3, 7.6, 16, 0.65, 0.4, C[3], C[1]);                     /* holding-down bolts */
    _r3Cone(m, 0, 2.3, 0, 7.1, 6.4, 2.5, C[0], 20);                     /* tapered pillbox */
    _r3Cyl(m, 0, 3.0, 0, 7.45, 1.0, C[3], C[1], 20);                    /* proud armour band */
    tStudRing(4.0, 7.0, 14, 0.6, 0.4, C[2], C[0]);
    _r3Cyl(m, 0, 4.8, 0, 6.5, 0.9, C[1], C[3], 20);                     /* capping course */
    tStudRing(5.7, 6.0, 12, 0.6, 0.4, C[3], C[1]);

    /* Front bastion. The drum on its own hands the camera nothing but a curve; a squared
       block pushed out past the rim of the pit gives back a flat, fully visible face to carry
       the door, the vision blocks and the ladder, and notches the silhouette while it does. */
    _r3Slab(m, 0, 1.4, 6.3, 12.4, 3.8, 5.8, 1.1, C[0], C[1]);           /* bastion */
    _r3Box(m, 0, 5.2, 6.3, 9.6, 0.5, 4.2, C[1], C[3]);                  /* its coping */
    _r3Box(m, -3.3, 1.4, 9.0, 5.2, 3.3, 0.8, C[3], C[1]);               /* door surround */
    _r3Box(m, -3.3, 1.6, 9.4, 4.0, 2.8, 1.0, DK[1], DK[2]);             /* armoured door */
    _r3Box(m, -3.3, 2.8, 9.8, 4.0, 0.35, 0.6, DK[2], DK[0]);            /* its bracing rib */
    _r3Box(m, -1.7, 2.5, 9.8, 0.8, 1.1, 0.8, S[1], S[3]);               /* dogging handle */
    _r3Box(m, -4.9, 1.9, 9.7, 0.8, 0.7, 0.8, S[2], S[3]);               /* hinges */
    _r3Box(m, -4.9, 3.4, 9.7, 0.8, 0.7, 0.8, S[2], S[3]);
    _r3Box(m, -3.3, 4.4, 9.2, 5.6, 0.45, 1.2, RTS_PAL.hazard[0], RTS_PAL.hazard[0]);
    for (i = 0; i < 2; i++)                                             /* vision blocks */
      _r3Box(m, 0.9 + i * 2.4, 3.0, 9.1, 1.8, 1.1, 1.1, DK[0], DK[2]);
    _r3Box(m, 2.1, 4.1, 9.1, 5.2, 0.5, 1.3, C[3], C[1]);                /* their hood */
    _r3Box(m, 2.1, 2.0, 9.1, 5.2, 0.55, 1.1, C[3], C[1]);               /* plate joint below */
    _r3Box(m, 4.6, 1.4, 9.3, 0.75, 4.2, 0.8, S[2], S[1]);               /* ladder rails */
    _r3Box(m, 5.9, 1.4, 9.3, 0.75, 4.2, 0.8, S[2], S[1]);
    for (i = 0; i < 5; i++) _r3Box(m, 5.25, 2.0 + i * 0.8, 9.3, 1.9, 0.3, 0.55, S[1], S[3]);
    _r3Box(m, -3.8, 5.7, 6.6, 2.4, 1.5, 2.0, S[0], S[2]);               /* power junction box */
    _r3Box(m, -3.8, 5.9, 4.8, 1.2, 0.55, 2.8, S[1], S[3]);              /* cable tray into the base */
    _r3Box(m, 3.6, 5.7, 6.6, 2.0, 1.2, 1.8, TM[0], TM[1]);              /* team plate */

    /* ---- pit furniture ------------------------------------------------------------------
       All of it inside the disc and clear of the kerb. Stores sunk into the kerb strip look
       like stores sunk into a kerb, and the strip is two pixels tall to begin with. */
    tCrate(-8.2, 1.4, 2.0, 3.0, 1.9, 2.0);                              /* ammunition boxes */
    tCrate(-8.2, 3.3, 2.0, 2.6, 1.5, 1.7);
    tCrate(-8.0, 1.4, -1.6, 3.0, 1.7, 2.2);
    tCrate(-6.0, 1.4, 5.6, 2.8, 1.6, 1.8);
    _r3Box(m, 8.2, 1.4, 2.2, 3.2, 0.6, 2.4, S[2], S[1]);                /* ready-round rack */
    _r3Box(m, 8.2, 2.0, 1.2, 3.2, 2.4, 0.6, S[2], S[3]);
    for (i = 0; i < 3; i++) {                                           /* shells stood in it */
      _r3Cyl(m, 7.2 + i * 1.05, 2.0, 2.4, 0.5, 1.9, RTS_PAL.ore[0], RTS_PAL.ore[2], 16);
      _r3Cone(m, 7.2 + i * 1.05, 3.9, 2.4, 0.5, 0.12, 0.9, RTS_PAL.ore[3], 16);
    }
    for (i = 0; i < 2; i++) {                                           /* fuel drums */
      var tq1 = i ? 9.0 : 7.0;
      _r3Cyl(m, tq1, 1.4, -2.0, 1.0, 2.4, RTS_PAL.dirt[2], RTS_PAL.hazard[0], 16);
      _r3Cyl(m, tq1, 3.8, -2.0, 1.1, 0.35, DK[1], DK[3], 16);
    }

    /* ---- traverse race ----------------------------------------------------------------- */
    _r3Cyl(m, 0, 5.7, 0, 5.7, 0.9, DK[1], DK[2], 20);                   /* race */
    _r3Cyl(m, 0, 6.6, 0, 6.0, 0.5, S[0], S[3], 20);                     /* toothed rim */
    tStudRing(7.1, 5.55, 16, 0.6, 0.4, S[2], S[3]);                     /* race bolts */

    /* ---- gun house ---------------------------------------------------------------------
       The house sits 1.9 back of the pit centre. That is not styling: the race is 12 units
       across, so a centred house leaves the gun barely five units of clear run and it reads
       as a bump rather than a barrel. Offsetting the whole rotating assembly buys the gun
       most of the tile's width, and the -x overhang it costs is on the one pair of faces
       this projection never draws. */
    _r3Cone(m, -1.9, 7.1, -0.6, 4.7, 4.25, 2.4, B.wall, 20);            /* cast body */
    _r3Cyl(m, -1.9, 9.5, -0.6, 4.5, 0.8, TM[0], TM[1], 20);             /* team band */
    _r3Cone(m, -1.9, 10.3, -0.6, 4.2, 3.75, 1.0, B.wall, 20);
    _r3Cyl(m, -1.9, 11.3, -0.6, 3.9, 0.7, B.trim, B.trim, 20);          /* pale roof plate */
    _r3Box(m, -1.9, 7.5, 4.2, 5.2, 1.7, 1.5, B.dark, B.wall);           /* bolted applique */
    _r3Box(m, -1.9, 9.6, 4.0, 4.0, 1.2, 1.4, B.dark, B.wall);
    for (i = 0; i < 4; i++) {
      _r3Box(m, -3.8 + i * 1.3, 7.7, 5.0, 0.8, 0.8, 0.85, S[3], S[1]);
      _r3Box(m, -3.4 + i * 1.1, 9.8, 4.7, 0.8, 0.8, 0.85, S[3], S[1]);
    }
    _r3Box(m, -5.9, 7.2, -0.6, 2.8, 1.4, 5.2, S[2], S[1]);              /* rear stowage bin */
    _r3Box(m, -5.9, 8.6, -0.6, 3.0, 0.4, 5.4, S[1], S[3]);              /* bin lid */
    for (i = 0; i < 3; i++) _r3Box(m, -5.9, 7.4, -2.2 + i * 2.0, 3.1, 0.35, 0.7, DK[1], DK[3]);
    for (i = 0; i < 2; i++) _r3Box(m, -4.8, 7.1 + i * 1.6, 2.2, 0.85, 0.75, 1.0, S[2], S[3]);

    /* ---- mantlet and gun ---------------------------------------------------------------
       A horizontal barrel has to be built from boxes - _r3Cyl only runs up y - so it is
       three stacked slabs of decreasing depth, which chamfers the top-front edge, the only
       edge of it this camera sees. It is kept deliberately BARE and near-black: an earlier
       pass hung a jacket, a fume extractor and two bands along its length and the gun stopped
       being a rod and became one more lump on the side of the turret. Two flush bands for
       value, then clear tube, then a pale brake - ending at x 10.8, with a pixel of margin
       left, so the muzzle reads as the end of something and not as the edge of the sprite. */
    _r3Slab(m, 1.6, 7.2, -0.6, 3.2, 3.1, 4.6, 1.0, B.dark, B.wall);     /* mantlet */
    _r3Box(m, 3.0, 7.6, -0.6, 1.2, 2.3, 3.2, DK[1], DK[3]);             /* rotor shield */
    for (i = 0; i < 4; i++)                                             /* mantlet bolts */
      _r3Box(m, 0.5 + (i % 2) * 1.9, 7.7 + ((i > 1) ? 1.7 : 0), 1.9,
             0.85, 0.75, 1.0, S[2], S[3]);
    _r3Box(m, 6.8, 8.0, -0.6, 7.6, 0.8, 2.1, DK[2], DK[2]);             /* barrel, under */
    _r3Box(m, 6.8, 8.4, -0.6, 7.6, 1.0, 2.6, DK[2], DK[1]);             /* barrel, body */
    _r3Box(m, 6.8, 9.2, -0.6, 7.6, 0.5, 1.7, DK[0], DK[0]);             /* barrel, crown */
    _r3Box(m, 3.8, 7.95, -0.6, 1.1, 2.0, 2.9, S[2], S[1]);              /* breech band */
    _r3Box(m, 6.4, 8.0, -0.6, 0.85, 1.9, 2.8, S[2], S[1]);              /* jacket band */
    _r3Box(m, 8.9, 7.8, -0.6, 0.85, 2.3, 3.2, DK[2], DK[1]);            /* brake collar */
    _r3Box(m, 10.0, 7.9, -0.6, 1.6, 2.6, 3.6, S[3], S[1]);              /* muzzle brake */
    _r3Box(m, 10.0, 10.5, -0.6, 0.95, 0.3, 3.7, DK[0], DK[0]);          /* baffle slot */
    _r3Box(m, 10.55, 8.7, -0.6, 0.5, 1.2, 1.5, DK[0], DK[0]);           /* the bore */

    /* ---- gun house roof ----------------------------------------------------------------
       The roof is the largest surface this camera ever sees, and a bare drum top is the one
       place a turret can look unfinished from directly above - so it carries both hatches,
       the sight, the searchlight and the aerial. Pale trim underneath makes every one of
       them read as a dark shape rather than as noise. */
    _r3Box(m, -1.9, 12.0, -0.6, 6.2, 0.85, 1.4, B.dark, B.wall);        /* rangefinder blister */
    _r3Box(m, -4.5, 12.0, -0.6, 0.95, 1.1, 1.7, DK[1], DK[3]);          /* its end windows */
    _r3Box(m, 0.7, 12.0, -0.6, 0.95, 1.1, 1.7, DK[1], DK[3]);
    _r3Box(m, -1.9, 12.0, 2.2, 2.8, 0.3, 1.3, TM[0], TM[0]);            /* roof recognition flash */
    _r3Box(m, -1.9, 12.0, -3.0, 2.0, 0.3, 1.0, TM[0], TM[0]);
    _r3Cyl(m, -2.9, 12.0, 0.4, 1.65, 0.85, B.dark, B.wall, 16);         /* commander's cupola */
    for (i = 0; i < 8; i++) {                                           /* vision blocks on it */
      var tr1 = (i + 0.5) / 8 * Math.PI * 2;
      _r3Box(m, -2.9 + Math.cos(tr1) * 1.7, 12.3, 0.4 + Math.sin(tr1) * 1.7,
             0.95, 0.65, 0.95, DK[0], DK[2]);
    }
    _r3Cyl(m, -2.9, 12.85, 0.4, 1.5, 0.4, B.trim, B.trim, 16);          /* hatch lid */
    _r3Box(m, -1.9, 13.25, 0.4, 1.1, 0.4, 0.8, S[1], S[3]);             /* hatch handle */
    _r3Cyl(m, -0.2, 12.0, -1.4, 1.25, 0.4, B.dark, B.wall, 16);         /* loader's hatch */
    _r3Cyl(m, -0.2, 12.4, -1.4, 1.1, 0.35, B.trim, B.trim, 16);
    _r3Box(m, 0.65, 12.75, -1.4, 0.95, 0.35, 0.7, S[1], S[3]);
    _r3Box(m, -1.9, 12.0, -2.6, 1.25, 1.0, 0.95, DK[1], DK[3]);         /* periscope */
    _r3Box(m, -1.9, 13.0, -2.6, 1.4, 0.4, 1.2, S[1], S[3]);
    _r3Cyl(m, -0.1, 12.0, -2.1, 1.2, 1.4, S[1], S[3], 16);              /* searchlight */
    _r3Box(m, 0.95, 12.4, -2.1, 0.7, 1.2, 1.5, RTS_PAL.lit, RTS_PAL.lit);
    _r3Box(m, -0.1, 13.4, -2.1, 1.4, 0.35, 1.4, S[2], S[3]);
    _r3Box(m, -4.1, 12.0, -1.7, 1.3, 0.9, 1.3, S[2], S[1]);             /* aerial mount */
    _r3Box(m, -4.1, 12.9, -1.7, 0.6, 2.4, 0.6, DK[0], DK[1]);           /* aerial */
    _r3Box(m, -4.1, 15.3, -1.7, 0.85, 0.85, 0.85, RTS_PAL.lit, RTS_PAL.lit);  /* warning light */
    for (i = 0; i < 3; i++)                                             /* roof grab rails */
      _r3Box(m, -4.3 + i * 2.1, 12.0, 1.6 - i * 0.4, 1.7, 0.35, 0.6, S[2], S[3]);
    _r3Box(m, -0.2, 10.3, 2.1, 3.6, 0.5, 1.5, S[2], S[3]);              /* discharger mounts */
    _r3Box(m, -3.8, 10.3, 2.1, 3.6, 0.5, 1.5, S[2], S[3]);
    for (i = 0; i < 3; i++) {                                           /* smoke dischargers */
      _r3Cyl(m, -1.1 + i * 1.0, 10.8, 2.1, 0.65, 1.6, DK[1], DK[3], 16);
      _r3Cyl(m, -4.7 + i * 1.0, 10.8, 2.1, 0.65, 1.6, DK[1], DK[3], 16);
    }
  }
  var r = _r3BakeFootprint(m, W, D);
  _sprEdge(r.c);
  return { c: _sprShadow(r.c, 3, 3), head: r.head };
}

/* ------------------------------------------------------------------- units --
   One model per type, yawed to each of eight facings and rendered separately. Because the
   model is rotated in 3D rather than the canvas being rotated in 2D, a tank at 45 degrees
   shows its side and its tracks correctly instead of being a smeared copy of the front. */
/* part: undefined = the whole unit, 'hull' = body only, 'turret' = turret only. Hull and
   turret bake into the same size canvas about the same origin, so drawing one over the other
   at the same screen position lines them up with no per-facing offset table. */
function _sprUnitModel(key, side, prone, part) {
  var d = rtsUnitDef(key), TM = RTS_PAL.team[side];
  var S = RTS_PAL.steel, DK = RTS_PAL.dark, O = RTS_PAL.ore, C = RTS_PAL.conc;
  var m = [], i;

  /* Road wheels and a track run - the detail that separates a tracked vehicle from a box with
     dark stripes down its sides. The wheels sit proud of the hull, the skirt caps them, so at a
     diagonal facing you read wheel, skirt and hull as three separate values instead of one.

     _r3Cyl is a VERTICAL cylinder - its h runs along y - so anything lying along the ground has
     to be built from boxes. The road wheels are therefore a row of small blocks stepped proud of
     the track run rather than actual discs, which at this size reads the same and costs less. */
  function tracks(len, zoff, wheels, rad) {
    for (var s = -1; s <= 1; s += 2) {
      var z = s * zoff;
      _r3Slab(m, 0, 0, z, len, rad * 2.1, rad * 2.0, 0.9, DK[0], DK[1]);      /* track run */
      for (var k = 0; k < wheels; k++) {
        var wx = (k - (wheels - 1) / 2) * (len - rad * 2.4) / (wheels - 1);
        _r3Box(m, wx, rad * 0.45, z + s * rad * 0.5, rad * 1.5, rad * 1.2, rad * 1.1,
               (k % 2) ? DK[2] : DK[1], DK[2]);
      }
      _r3Box(m, 0, rad * 2.0, z, len - 1, 1.2, rad * 2.4, TM[2], TM[1]);      /* fender skirt */
    }
  }

  if (key === 'dog') {
    /* Not a two-man squad and not upright: a low four-legged body on a long axis. At this size
       the only thing that says "dog" is the silhouette being horizontal where every other
       infantry sprite is vertical. */
    for (i = 0; i < 2; i++) {
      var dx0 = i ? 2.0 : -2.4, dz0 = i ? -1.6 : 1.6;
      _r3Box(m, dx0, 0, dz0 - 0.9, 1.1, 2.4, 0.9, DK[1], DK[2]);   /* legs */
      _r3Box(m, dx0, 0, dz0 + 0.9, 1.1, 2.4, 0.9, DK[1], DK[2]);
      _r3Box(m, dx0, 2.2, dz0, 5.2, 2.0, 2.2, TM[1], TM[3]);       /* body, along +x */
      _r3Box(m, dx0 + 3.0, 2.6, dz0, 2.0, 1.8, 1.8, TM[2], TM[1]); /* head */
      _r3Box(m, dx0 + 3.9, 2.9, dz0, 0.9, 0.9, 1.4, DK[0], DK[2]); /* muzzle */
      _r3Box(m, dx0 - 3.0, 3.4, dz0, 2.2, 0.7, 0.7, TM[1], TM[3]); /* tail */
    }
  } else if (d.kind === 'infantry') {
    /* Two figures, offset so a squad does not read as one blob. +x is the nose.
       Prone is a genuinely different silhouette - low, long and facing forward - because
       that is the only way the player can tell at a glance that they are pinned. */
    /* Hero units are ONE figure. A Commando drawn as a two-man squad reads as two Commandos,
       which is exactly the wrong signal for a unit limited to one at a time. */
    var men = (key === 'tanya') ? [[0, 0]] : [[2.5, -3], [-2.5, 2.5]];
    for (i = 0; i < men.length; i++) {
      var mx = men[i][0], mz = men[i][1];
      if (prone) {
        _r3Box(m, mx - 1, 0, mz, 7, 2, 2.6, TM[0], TM[1]);         /* body, lying down */
        _r3Box(m, mx + 2.6, 0, mz, 2.4, 2, 2.4, '#c8a882', '#d8bc96');
        _r3Box(m, mx + 5, 0.6, mz, 5, 1, 1, DK[1], DK[3]);         /* weapon, braced */
      } else {
        /* A soldier has to read as a figure at about 10 pixels, so it gets legs, a torso that
           narrows into shoulders, and a helmet with a brim - three stacked shapes of different
           widths. One box was a domino. */
        _r3Box(m, mx, 0, mz - 0.9, 1.7, 2.6, 1.4, DK[1], DK[2]);   /* legs */
        _r3Box(m, mx, 0, mz + 0.9, 1.7, 2.6, 1.4, DK[1], DK[2]);
        _r3Box(m, mx, 2.4, mz, 3.2, 3.4, 3.2, TM[0], TM[1]);       /* torso */
        _r3Box(m, mx - 0.4, 5.0, mz, 3.8, 0.9, 3.8, TM[1], TM[3]); /* shoulders/webbing */
        _r3Box(m, mx, 5.9, mz, 2.2, 1.5, 2.2, '#c8a882', '#d8bc96');   /* head */
        _r3Box(m, mx - 0.3, 7.0, mz, 3.0, 0.9, 3.0, TM[2], '#d8bc96'); /* helmet brim */
        if (key === 'rocket') {
          _r3Box(m, mx + 2.0, 5.2, mz - 0.6, 7.5, 1.8, 1.8, DK[1], DK[3]);  /* launch tube */
          _r3Box(m, mx - 2.2, 5.2, mz - 0.6, 2.0, 2.2, 2.2, DK[0], DK[2]);  /* back blast end */
        } else if (key === 'engineer') {
          /* No weapon at all, a toolbox in one hand and a hard hat instead of a helmet. The
             player has to be able to pick an engineer out of a mixed squad at a glance,
             because losing it to a stray shell is losing 600 credits. */
          _r3Box(m, mx - 0.3, 7.0, mz, 3.0, 0.9, 3.0, RTS_PAL.hazard[0], RTS_PAL.hazard[0]);
          _r3Box(m, mx + 1.8, 2.2, mz - 1.3, 2.2, 1.8, 1.6, S[1], S[0]);    /* toolbox */
          _r3Box(m, mx - 0.4, 5.0, mz, 3.9, 0.9, 3.9, RTS_PAL.hazard[0], RTS_PAL.hazard[0]);  /* hi-vis */
        } else if (key === 'medic') {
          /* White over the team colour, with a cross on the back. The only bright white in the
             whole roster, so a medic is findable in a crowd - which is the point of it. */
          _r3Box(m, mx, 2.4, mz, 3.4, 3.6, 3.4, C[1], C[0]);
          _r3Box(m, mx - 1.7, 3.4, mz, 0.6, 1.8, 0.6, '#c8302a', '#e04a42');
          _r3Box(m, mx - 1.7, 4.0, mz, 0.6, 0.6, 1.8, '#c8302a', '#e04a42');
          _r3Box(m, mx - 0.3, 7.0, mz, 3.0, 0.9, 3.0, C[1], C[0]);   /* white helmet */
          _r3Box(m, mx + 1.9, 2.4, mz + 1.5, 2.0, 1.6, 1.2, C[0], C[1]);  /* medical bag */
        } else if (key === 'thief') {
          /* All dark, hunched, carrying a satchel and nothing else. Reads as "not a soldier". */
          _r3Box(m, mx, 2.4, mz, 3.0, 3.0, 3.0, DK[1], DK[2]);
          _r3Box(m, mx, 5.4, mz, 2.2, 1.5, 2.2, DK[0], DK[1]);        /* hood, no helmet */
          _r3Box(m, mx + 1.8, 2.6, mz + 1.6, 2.4, 2.0, 1.4, S[2], S[1]);
        } else if (key === 'tanya') {
          /* One figure, not two - a hero unit should not read as a squad. Handled by the men
             table below; here she just gets the pistols and a satchel of C4. */
          _r3Box(m, mx + 2.2, 4.2, mz - 0.9, 2.6, 0.8, 0.8, DK[1], DK[3]);
          _r3Box(m, mx + 2.2, 4.2, mz + 0.9, 2.6, 0.8, 0.8, DK[1], DK[3]);
          _r3Box(m, mx - 1.6, 2.6, mz + 1.6, 2.2, 1.8, 1.2, RTS_PAL.hazard[0], RTS_PAL.hazard[0]);
        } else if (key === 'flame') {
          /* Tanks on the back and a short wand - the opposite silhouette to the rocket squad's
             long forward tube, which is the pair most likely to be confused. */
          _r3Cyl(m, mx - 2.2, 2.4, mz - 1.0, 1.0, 4.0, DK[0], DK[2], 10);
          _r3Cyl(m, mx - 2.2, 2.4, mz + 1.0, 1.0, 4.0, DK[0], DK[2], 10);
          _r3Box(m, mx + 2.2, 4.4, mz - 0.5, 3.4, 1.2, 1.2, DK[1], DK[3]);  /* wand */
          _r3Box(m, mx + 4.1, 4.4, mz - 0.5, 1.2, 1.6, 1.6, RTS_PAL.hazard[0], RTS_PAL.hazard[0]);
        } else if (key === 'grenadier') {
          /* Arm cocked back with a charge in it, and a satchel on the hip. The silhouette has
             to differ from the rifleman's forward-pointing line or a mixed squad is a smear. */
          _r3Box(m, mx - 1.6, 6.2, mz - 1.2, 2.6, 1.0, 1.0, TM[1], TM[3]);  /* raised arm */
          _r3Cyl(m, mx - 2.6, 6.9, mz - 1.2, 0.8, 1.2, DK[0], DK[2], 8);    /* the charge */
          _r3Box(m, mx + 0.9, 2.6, mz + 1.6, 1.8, 1.8, 1.2, S[2], S[1]);    /* satchel */
        } else {
          _r3Box(m, mx + 2.4, 4.4, mz - 0.5, 5.2, 0.9, 0.9, DK[1], DK[3]);  /* rifle */
          _r3Box(m, mx + 0.4, 4.0, mz - 0.5, 1.6, 1.4, 1.0, DK[0], DK[2]);  /* stock */
        }
      }
    }
  } else if (key === 'tank') {
    /* UNIT.CPP keeps PrimaryFacing (hull) and SecondaryFacing (turret) as separate values and
       draws them as separate shapes. So the turret is baked on its own, pivoting about the
       model origin - which is what lets a tank drive one way while its gun tracks another.
       `part` selects which half to build. */
    if (part !== 'turret') {
      tracks(20, 6.4, 5, 2.4);
      /* Lower hull, then a sloped glacis over it. The taper is what stops the front reading
         as one flat rectangle - it splits the nose into two shading bands. */
      _r3Slab(m, 0, 3.4, 0, 18, 3.6, 10.5, 1.1, TM[0], TM[1]);
      _r3Hip(m, -1, 7.0, 0, 17, 1.9, 10.5, 2.6, TM[1]);            /* deck, tapered */
      _r3Box(m, 7.6, 3.4, 0, 3.2, 3.4, 9.4, TM[1], TM[3]);         /* glacis plate */
      _r3Box(m, -7.4, 5.0, 3.2, 3.4, 2.0, 3.0, S[2], S[1]);        /* stowage box */
      _r3Cyl(m, -8.6, 4.2, -3.4, 1.0, 2.6, DK[1], DK[3], 8);       /* exhaust */
    }
    if (part !== 'hull') {
      /* Turret: a tapered housing with a mantlet and a muzzle brake, centred on its pivot so
         it can rotate independently of the hull. */
      _r3Slab(m, -0.6, 8.6, 0, 10.5, 3.4, 9.0, 1.0, TM[1], TM[3]);
      _r3Hip(m, -0.6, 12.0, 0, 9.5, 1.4, 8.2, 2.0, TM[3]);
      _r3Box(m, 5.0, 9.4, 0, 3.0, 2.6, 4.2, DK[1], DK[3]);         /* mantlet */
      _r3Box(m, 11.0, 9.9, 0, 9.0, 1.7, 1.7, DK[1], DK[3]);        /* barrel, along +x */
      _r3Box(m, 15.8, 9.7, 0, 2.2, 2.2, 2.2, DK[0], DK[3]);        /* muzzle brake */
      _r3Cyl(m, -3.4, 12.6, 1.6, 1.5, 1.0, S[1], S[0], 10);        /* commander's hatch */
      _r3Box(m, -4.6, 13.0, -2.6, 0.6, 4.5, 0.6, DK[1], DK[3]);    /* aerial */
    }
  } else if (key === 'light') {
    /* Light Tank: the Battle Tank's proportions at 80%, with a smaller one-piece turret and no
       aerial or stowage. It has to read as "the cheap one" at a glance. */
    if (part !== 'turret') {
      tracks(16, 5.2, 4, 2.0);
      _r3Slab(m, 0, 2.9, 0, 14.5, 3.0, 8.6, 1.0, TM[0], TM[1]);
      _r3Hip(m, -0.8, 5.9, 0, 13.5, 1.6, 8.6, 2.2, TM[1]);
      _r3Box(m, 6.2, 2.9, 0, 2.6, 2.8, 7.6, TM[1], TM[3]);         /* glacis */
    }
    if (part !== 'hull') {
      _r3Slab(m, -0.5, 7.5, 0, 8.0, 2.8, 7.0, 0.9, TM[1], TM[3]);  /* turret */
      _r3Box(m, 4.0, 8.1, 0, 2.2, 2.0, 3.2, DK[1], DK[3]);         /* mantlet */
      _r3Box(m, 9.0, 8.5, 0, 7.5, 1.3, 1.3, DK[1], DK[3]);         /* barrel */
    }

  } else if (key === 'heavy') {
    /* Heavy Tank: wider tracks, a longer hull, and TWO barrels side by side - the fastest way
       to say "this is the expensive one" without any text. */
    if (part !== 'turret') {
      tracks(23, 7.6, 6, 2.9);
      _r3Slab(m, 0, 4.2, 0, 21, 4.4, 12.5, 1.3, TM[0], TM[1]);
      _r3Hip(m, -1, 8.6, 0, 20, 2.2, 12.5, 3.0, TM[1]);
      _r3Box(m, 9.0, 4.2, 0, 3.6, 4.2, 11.0, TM[1], TM[3]);        /* glacis */
      _r3Box(m, -8.5, 6.2, 4.0, 4.0, 2.6, 3.4, S[2], S[1]);        /* stowage */
    }
    if (part !== 'hull') {
      _r3Slab(m, -0.6, 10.8, 0, 12.5, 4.2, 11.0, 1.2, TM[1], TM[3]);   /* turret */
      _r3Hip(m, -0.6, 15.0, 0, 11.5, 1.6, 10.0, 2.4, TM[3]);
      _r3Box(m, 6.0, 11.6, 0, 3.4, 3.0, 6.0, DK[1], DK[3]);        /* mantlet */
      _r3Box(m, 12.5, 12.0, -2.0, 10.0, 1.8, 1.8, DK[1], DK[3]);   /* twin barrels */
      _r3Box(m, 12.5, 12.0, 2.0, 10.0, 1.8, 1.8, DK[1], DK[3]);
      _r3Cyl(m, -4.0, 16.6, 2.0, 1.6, 1.2, S[1], S[0], 10);        /* hatch */
      _r3Box(m, -5.4, 17.0, -3.0, 0.6, 5.0, 0.6, DK[1], DK[3]);    /* aerial */
    }

  } else if (key === 'arty') {
    /* Artillery: an open chassis dominated by one very long tube at a visible elevation, with
       the recoil spades down at the back. Nothing else in the set has that profile. */
    tracks(17, 5.6, 5, 2.2);
    _r3Slab(m, -1, 3.1, 0, 15, 3.0, 9.0, 1.0, TM[0], TM[1]);       /* chassis */
    _r3Box(m, -7.5, 3.1, 0, 3.0, 2.4, 8.0, DK[2], DK[1]);          /* engine deck */
    _r3Box(m, -1.0, 6.1, 0, 7.0, 2.4, 6.0, DK[2], DK[1]);          /* open crew well */
    _r3Box(m, -1.0, 6.4, -3.4, 8.0, 2.6, 0.9, TM[2], TM[1]);       /* gun shield sides */
    _r3Box(m, -1.0, 6.4, 3.4, 8.0, 2.6, 0.9, TM[2], TM[1]);
    _r3Box(m, 1.0, 8.4, 0, 5.0, 2.6, 5.0, S[2], S[1]);             /* cradle */
    /* The tube is stepped upward along its length, which is how a fixed model shows elevation
       without any way to rotate about z. */
    _r3Box(m, 6.0, 9.6, 0, 6.0, 1.9, 1.9, DK[1], DK[3]);
    _r3Box(m, 11.5, 10.6, 0, 6.0, 1.7, 1.7, DK[1], DK[3]);
    _r3Box(m, 15.6, 11.4, 0, 2.4, 2.2, 2.2, DK[0], DK[3]);         /* muzzle */
    _r3Box(m, -9.5, 1.0, -2.6, 4.0, 1.2, 1.6, S[1], S[0]);         /* recoil spades */
    _r3Box(m, -9.5, 1.0, 2.6, 4.0, 1.2, 1.6, S[1], S[0]);

  } else if (key === 'buggy') {
    /* Wheels are the buggy's whole identity, so they are proper vertical cylinders standing
       clear of the body with a light hub - four round shapes at the corners read instantly as
       "wheeled" against the tank's four square track runs. */
    for (i = 0; i < 4; i++) {
      var bx = i < 2 ? 6.2 : -6.2, bz = (i % 2) ? 6.0 : -6.0;
      _r3Cyl(m, bx, 0, bz, 3.1, 3.4, DK[0], DK[1], 12);
      _r3Cyl(m, bx, 1.0, bz, 1.4, 2.6, S[2], S[1], 10);            /* hub */
    }
    _r3Slab(m, 0, 2.8, 0, 17, 3.2, 8.2, 1.0, TM[0], TM[1]);        /* body tub */
    _r3Box(m, 6.6, 3.2, 0, 3.6, 2.2, 7.6, TM[1], TM[3]);           /* sloped nose */
    _r3Box(m, -1.5, 6.0, 0, 7.5, 2.8, 7.0, DK[2], DK[1]);          /* open cockpit well */
    _r3Box(m, -1.5, 6.4, -3.2, 6.5, 2.2, 0.9, TM[2], TM[1]);       /* roll bar sides */
    _r3Box(m, -1.5, 6.4, 3.2, 6.5, 2.2, 0.9, TM[2], TM[1]);
    _r3Box(m, -4.8, 6.0, 0, 1.0, 4.6, 7.0, TM[1], TM[3]);          /* roll hoop */
    _r3Box(m, 3.2, 8.4, 0, 8.5, 1.3, 1.3, DK[1], DK[3]);           /* pintle gun */
    _r3Box(m, -7.6, 4.2, 0, 2.2, 1.6, 5.0, S[2], S[1]);            /* spare/rack */
  } else if (key === 'harvester') {
    tracks(23, 7.8, 6, 2.9);                                       /* heavy tracks */
    _r3Slab(m, -4.5, 5.0, 0, 16, 7.5, 13.5, 1.2, S[0], S[1]);      /* hopper */
    for (i = 0; i < 4; i++)                                        /* ribs down the hopper */
      _r3Box(m, -11 + i * 4.4, 5.0, 0, 1.0, 7.2, 14.0, S[2], S[1]);
    _r3Box(m, -4.5, 12.4, 0, 13, 1.0, 10.5, O[0], O[1]);           /* ore heaped in it */
    _r3Box(m, -4.5, 12.9, -1.5, 8, 0.8, 5.0, O[1], O[2]);
    _r3Slab(m, 8.0, 5.0, 0, 8, 7.5, 11.5, 1.0, TM[0], TM[1]);      /* cab */
    _r3Box(m, 11.6, 8.0, 0, 1.6, 3.4, 8.4, RTS_PAL.glass, RTS_PAL.glass);
    _r3Box(m, 8.0, 12.6, 0, 6.5, 0.9, 9.5, TM[1], TM[3]);          /* cab roof */
    _r3Cyl(m, 4.6, 12.6, -3.6, 0.9, 3.2, DK[1], DK[3], 8);         /* stack */
    _r3Box(m, 14.5, 0.8, 0, 4.5, 2.6, 15.5, DK[1], DK[3]);         /* intake blade */
    for (i = 0; i < 5; i++)                                        /* cutter teeth */
      _r3Box(m, 16.6, 0.8, -6 + i * 3, 1.6, 2.0, 1.4, S[1], S[0]);
  } else {
    _r3Box(m, 0, 0, -5, 15, 3.5, 4, DK[0], DK[1]);
    _r3Box(m, 0, 0, 5, 15, 3.5, 4, DK[0], DK[1]);
    _r3Box(m, 0, 2.5, 0, 15, 4, 8, TM[0], TM[1]);
    _r3Box(m, 4, 6, 0, 8, 1.4, 1.4, DK[1], DK[3]);
  }

  return m;
}
/* The canvas every variant of one unit bakes into. It has to be the SAME square for all of
   them: hull and turret are drawn at the same screen position and would separate otherwise,
   and a prone squad that changed size would jump. So the size is measured from the union of
   every variant, at every facing, and memoised per key. */
var _RTS_UFIT = {};
function _sprUnitFit(key, side) {
  if (_RTS_UFIT[key] != null) return _RTS_UFIT[key];
  var models = [_sprUnitModel(key, side, false, null)];
  if (rtsUnitDef(key).kind === 'infantry') models.push(_sprUnitModel(key, side, true, null));
  return (_RTS_UFIT[key] = _r3FitSize(models, 2));
}
function _sprUnit(key, side, prone, part) {
  var m = _sprUnitModel(key, side, prone, part), size = _sprUnitFit(key, side);
  var frames = [];
  for (var f = 0; f < 8; f++) {
    var cv = _r3BakeCentred(_r3Yaw(m, -f / 8 * Math.PI * 2), size);
    _sprEdge(cv);
    /* the turret is drawn ON the hull, so it must not cast a second ground shadow */
    frames.push(part === 'turret' ? cv : _sprShadow(cv, 1, 2));
  }
  return frames;
}
/* Which units carry a separately-rotating turret. Artillery is deliberately NOT on this list:
   a howitzer traverses on its chassis, and a fixed forward tube is what makes it read as
   artillery rather than as another tank. */
var RTS_TURRETED = { tank:1, light:1, heavy:1 };

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

/* Corpses. INFANTRY.CPP leaves ANIM_CORPSE1..3 behind depending on how the soldier died,
   and they sit in LAYER_SURFACE - under everything. Stamped into the terrain here for the
   same reason the scorch marks are: permanent, and free after the frame they appear. */
function _sprCorpse() {
  var out = [];
  for (var v = 0; v < 3; v++) {
    var t = _sprMake(14, 12), g = t.g, seed = v * 71 + 5;
    g.globalAlpha = 0.75;
    for (var i = 0; i < 26; i++) {
      var x = 2 + _sprHash(i, v, seed) * 10, y = 3 + _sprHash(v, i, seed + 3) * 7;
      var h = _sprHash(i, i, seed + 7);
      _sprRect(g, x, y, 1 + (h * 2 | 0), 1, h < 0.45 ? '#3a2b28' : (h < 0.8 ? '#4a3733' : '#5c4038'));
    }
    g.globalAlpha = 0.5;
    _sprEll(g, 7, 9, 5, 2, '#20191a');
    g.globalAlpha = 1;
    out.push(t.c);
  }
  return out;
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
/* A crate: a wooden box, bright against both the grass and the ore, because an object the
   player is meant to notice and go and get has to be findable at this zoom.

   ONE version, not two. CRATE.CPP also places OVERLAY_WATER_CRATE on cells that are clear
   for SPEED_FLOAT - but that is collectable in the original because RA has ships, and this
   game has none. See the note on RTS_CRATES. */
function _sprCrate() {
  var t = _sprMake(RTS_TS, RTS_TS), g = t.g, c = RTS_TS / 2;
  _sprRect(g, c - 7, c - 2, 14, 4, '#2b2117');           /* shadow under it */
  _sprRect(g, c - 7, c - 8, 14, 11, '#9c7038');          /* crate body */
  _sprRect(g, c - 7, c - 8, 14, 2, '#c08f4c');           /* lit top edge */
  _sprRect(g, c - 7, c + 1, 14, 2, '#6b4a22');           /* shaded bottom edge */
  _sprRect(g, c - 7, c - 4, 14, 1, '#c9a05a');           /* slat lines */
  _sprRect(g, c - 7, c - 1, 14, 1, '#c9a05a');
  _sprRect(g, c - 1, c - 8, 2, 11, '#6b4a22');           /* upright brace */
  _sprRect(g, c - 4, c - 6, 3, 3, '#e8c661');            /* stencil mark */
  return t.c;
}
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
  /* Combat_Anim's PIFF: a small dirty spark, for a bullet strike. Grey-white, not fire -
     a rifle round hitting a hull does not look like a shell going off. */
  var piff = [];
  for (i = 0; i < 4; i++) {
    var ps = 8 + i * 4, pt = _sprMake(ps, ps), pg = pt.g, pc = ps / 2;
    var pcol = ['#ffffff', '#dfe6ee', '#9fadbb', '#6b7784'][i];
    _sprDisc(pg, pc, pc, Math.max(1, (ps / 2 - 1) * (i < 2 ? 0.55 : 0.8)), pcol);
    for (var pk = 0; pk < 4; pk++) {
      var pa = pk / 4 * 6.283 + i * 0.7;
      _sprRect(pg, pc + Math.cos(pa) * pc * 0.7, pc + Math.sin(pa) * pc * 0.7, 1, 1, '#f2f6fa');
    }
    piff.push(pt.c);
  }
  /* ...and the water set: a column of water thrown up, with a ring spreading on the surface.
     Drawn as a ring plus a collapsing column rather than a pale disc - a filled circle at
     this size reads as a cloud, not as a shell landing in a lake. The canvas has to stay
     SQUARE: the effect renderer draws every frame at width x width. */
  var splash = [];
  for (i = 0; i < 5; i++) {
    var ss = 20 + i * 9, st = _sprMake(ss, ss), sg = st.g, sc = ss / 2;
    var kk = i / 4;
    /* the ring, flattened because the camera looks along the ground plane */
    var rr = (sc - 2) * (0.28 + kk * 0.72);
    for (var sk = 0; sk < 22; sk++) {
      var sa = sk / 22 * 6.283;
      _sprRect(sg, sc + Math.cos(sa) * rr, sc + Math.sin(sa) * rr * 0.42, 2, 2,
        i < 3 ? '#eaf6fc' : '#b6d6e6');
    }
    /* the column: tall and bright at first, collapsing back into the ring */
    if (i < 3) {
      var cw = 5 - i, ch = ss * 0.5 * (1 - kk * 0.7);
      _sprRect(sg, sc - cw / 2, sc - ch, cw, ch, '#dff0f8');
      _sprRect(sg, sc - cw / 2, sc - ch, cw, Math.max(2, ch * 0.35), '#ffffff');
    }
    /* droplets, thrown up and out */
    for (var dk = 0; dk < 9; dk++) {
      var da = dk / 9 * 6.283 + i, dd = rr * (0.7 + _sprHash(dk, i, 7) * 0.6);
      _sprRect(sg, sc + Math.cos(da) * dd, sc + Math.sin(da) * dd * 0.42 - (2 - kk * 2) * 3,
        2, 2, '#ffffff');
    }
    splash.push(st.c);
  }
  /* Flame, for ADATA's burn ladder. Deliberately NOT a new generator: `_sprFire()` already
     draws this game's flame, for a building coming apart, and a burning building should not
     look like a different fire from a dying one. It returns 16x20 - taller than wide, which
     is what a flame is - so the effect renderer had to stop forcing every frame square. */
  var fire = null;   /* filled in by _rtsSprites from the ONE flame set - see below */
  /* SmokeM: what a fire leaves when it has burnt down. Grey, rising, thinning out. Drawn
     with the same square-canvas rule the effect renderer needs. */
  var smoke = [];
  for (i = 0; i < 6; i++) {
    var ms = 30, mt = _sprMake(ms, ms), mg = mt.g, mc = ms / 2, mu = i / 5;
    var puffs = [[0.00, 0.16, '#6b6560'], [0.30, 0.22, '#7b746e'],
                 [0.62, 0.26, '#8a837c'], [0.92, 0.30, '#98918a']];
    for (var pk2 = 0; pk2 < puffs.length; pk2++) {
      var rise = puffs[pk2][0] + mu * 0.5;
      if (rise > 1.15) continue;
      var rad = ms * puffs[pk2][1] * (0.45 + rise * 0.85) * (1 - mu * 0.25);
      _sprDisc(mg, mc + Math.sin(rise * 4.1 + i) * ms * 0.10,
        ms - 3 - rise * (ms - 6), Math.max(1, rad), puffs[pk2][2]);
    }
    smoke.push(mt.c);
  }
  return { boom: boom, flash: flash, piff: piff, splash: splash, fire: fire, smoke: smoke };
}

function _rtsSprites() {
  if (_RTS_SPR) return _RTS_SPR;
  var S = { ore: _sprOre(RTS_PAL.ore), gem: _sprOre(RTS_PAL.gem),
    bld: {}, unit: {}, prone: {}, fx: _sprFx(), pad: {} };
  RTS_STRUCTS.forEach(function (d) { S.pad[d.key] = _sprPad(d.w, d.h); });
  S.bag = _sprSandbag();
  S.wave = _sprWaterCycle();
  S.scorch = _sprScorch();
  S.crater = _sprCrater();
  S.crate = _sprCrate();
  S.fire = _sprFire();
  S.corpse = _sprCorpse();
  ['player', 'enemy'].forEach(function (side) {
    S.bld[side] = {}; S.unit[side] = {};
    RTS_STRUCTS.forEach(function (d) { S.bld[side][d.key] = _sprBuilding(d.key, side); });
    S.hull = S.hull || {}; S.turret = S.turret || {};
    S.hull[side] = {}; S.turret[side] = {};
    RTS_UNITS.forEach(function (d) {
      S.unit[side][d.key] = _sprUnit(d.key, side);
      if (RTS_TURRETED[d.key]) {
        S.hull[side][d.key] = _sprUnit(d.key, side, false, 'hull');
        S.turret[side][d.key] = _sprUnit(d.key, side, false, 'turret');
      }
    });
    S.prone[side] = {};
    RTS_UNITS.forEach(function (d) {
      if (d.kind === 'infantry') S.prone[side][d.key] = _sprUnit(d.key, side, true);
    });
  });
  /* One flame set, referenced twice. `_sprFx` cannot call `_sprFire()` itself without
     baking a second identical set of canvases - same pixels, twice the memory, and two
     things that are supposed to be the same fire drifting apart the moment either is
     retuned. Assigned here, where both already exist. */
  S.fx.fire = S.fire;
  _RTS_SPR = S;
  return S;
}
