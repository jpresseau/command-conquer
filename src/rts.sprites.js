/* RC COMMAND - sprite generation.

   Every sprite in the game is drawn here, in code, at 24 art-pixels per map cell, and
   blitted with image smoothing off. Two rules keep it looking like 1996 rather than like
   a browser demo, and both were learned the hard way:

   1. NEVER SCALE BY A FRACTION. The first pass drew 24px-per-cell art at 40 screen pixels
      per cell - a 1.667x resample - and the result was mush: soft edges, pixels of two
      different sizes sitting next to each other. Screen cells are now locked to RTS_ZOOMS,
      every entry a whole multiple or half of RTS_TS.
   2. NEVER ROTATE THE CANVAS. ctx.rotate() + fillRect anti-aliases every diagonal, which
      is the same mush by another route. Unit facings are built by _sprRot(), which walks
      the destination pixels and inverse-rotates each one into the unit's local space, so
      a tank turned 45 degrees still has hard square pixels.

   Nothing here is traced, ripped or copied from any existing game. It is original pixel
   art in the visual language of the mid-90s 2D RTS: a tight desaturated palette, three
   tones per surface (lit top, mid face, shadowed side), and a hard near-black outline
   around every silhouette. */

var RTS_TS = 24;                  /* art pixels per map cell */
var RTS_ZOOMS = [12, 24, 48];     /* screen px per cell: 0.5x, 1x, 2x. Nothing else. */
var RTS_ZOOM_DEF = 1;             /* index into RTS_ZOOMS - 24 = one art pixel per screen pixel */
var _RTS_SPR = null;

/* Temperate theatre. Deliberately grubby: clean saturated colours read as modern, and the
   first pass's bright lawn-green ground was the single loudest wrong note in the picture. */
var RTS_PAL = {
  out:   '#15171b',
  grass: ['#454f2c', '#4e5933', '#3a4325', '#576240', '#333c20'],
  dirt:  ['#6a5a3f', '#786748', '#5b4d35', '#847150'],
  rock:  ['#6a665c', '#7d7970', '#54514a', '#8d897f'],
  bush:  ['#39471f', '#2c3818', '#465828'],
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
      if (n > 0.62) {                                   /* dirt: broad organic patches */
        pal = dr;
        k = grain < 0.18 ? 3 : (grain < 0.5 ? 1 : (grain < 0.82 ? 0 : 2));
        if (n < 0.66 && grain < 0.45) { pal = gr; k = 2; }   /* ragged edge, not a hard border */
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

  /* Rock outcrops on impassable cells, drawn bigger than the cell and merged with their
     neighbours so a run of blocked cells reads as one ridge instead of a row of boxes. */
  var rockCv = _sprMake(S, S), rg = rockCv.g;
  for (var tz = 0; tz < N; tz++) {
    for (var tx = 0; tx < N; tx++) {
      if (G.blocked[_rtsIdx(tx, tz)] !== 2) continue;
      var cx = tx * RTS_TS + RTS_TS / 2, cy = tz * RTS_TS + RTS_TS / 2;
      var h = _sprHash(tx, tz, seed + 61);
      var rx = RTS_TS * (0.52 + h * 0.16), ry = RTS_TS * (0.46 + _sprHash(tx, tz, seed + 67) * 0.16);
      _sprEll(rg, cx, cy + 2, rx, ry, RTS_PAL.rock[2]);          /* shadowed base */
      _sprEll(rg, cx, cy, rx * 0.92, ry * 0.86, RTS_PAL.rock[0]);
      _sprEll(rg, cx - rx * 0.2, cy - ry * 0.3, rx * 0.55, ry * 0.45, RTS_PAL.rock[1]);
      _sprEll(rg, cx - rx * 0.3, cy - ry * 0.4, rx * 0.28, ry * 0.2, RTS_PAL.rock[3]);
      for (var f = 0; f < 5; f++) {                              /* fracture speckle */
        var fx = cx + (_sprHash(tx * 31 + f, tz, seed + 71) - 0.5) * rx * 1.4;
        var fy = cy + (_sprHash(tx, tz * 31 + f, seed + 73) - 0.5) * ry * 1.4;
        _sprRect(rg, fx, fy, 1 + (_sprHash(f, tx + tz, seed + 79) * 2 | 0), 1, RTS_PAL.rock[2]);
      }
    }
  }
  _sprEdge(rockCv.c);
  g.drawImage(rockCv.c, 0, 0);
  return t.c;
}

/* ------------------------------------------------------------------------ ore --
   Four density stages. Nuggets are drawn wrapped - every cluster is also painted one cell
   left/right/up/down - so clusters run across cell edges and a worked field reads as
   continuous ground rather than a grid of identical stamps. Three variants per stage,
   chosen by a hash of the cell, kill the last of the repetition. */
function _sprOre() {
  var out = [], P = RTS_PAL.ore, TS = RTS_TS;
  for (var s = 0; s < 4; s++) {
    var variants = [];
    for (var v = 0; v < 3; v++) {
      var t = _sprMake(TS, TS), g = t.g, seed = s * 977 + v * 131 + 17;
      /* At high density the ground itself is ore-stained, which is what makes a rich
         field look like terrain instead of scattered confetti. */
      if (s >= 2) {
        g.globalAlpha = s === 2 ? 0.28 : 0.52;
        _sprRect(g, 0, 0, TS, TS, P[3]);
        g.globalAlpha = 1;
        /* Break the stain up, or a rich field becomes one flat gold carpet with no
           texture at all - which is what a solid fill looked like. */
        g.globalAlpha = s === 2 ? 0.2 : 0.34;
        for (var b = 0; b < 26; b++) {
          _sprRect(g, _sprHash(b, v, seed + 31) * TS, _sprHash(v, b, seed + 37) * TS,
            2 + (_sprHash(b, b, seed + 41) * 4 | 0), 2, P[4]);
        }
        g.globalAlpha = 1;
      }
      var n = 6 + s * 9;
      for (var i = 0; i < n; i++) {
        var x = _sprHash(i, v, seed) * TS, y = _sprHash(v, i, seed + 5) * TS;
        var w = 2 + (_sprHash(i, i, seed + 9) * 3 | 0), h = 2 + (_sprHash(i, v + i, seed + 13) * 2 | 0);
        var top = P[(_sprHash(i, s, seed + 17) * 3) | 0];
        for (var oy = -1; oy <= 1; oy++) {
          for (var ox = -1; ox <= 1; ox++) {
            var px = x + ox * TS, py = y + oy * TS;
            if (px < -6 || px > TS + 2 || py < -6 || py > TS + 2) continue;
            _sprRect(g, px, py + 1, w, h, P[4]);      /* seam under the nugget */
            _sprRect(g, px, py, w, h, top);
            _sprRect(g, px, py, 1, 1, P[2]);          /* glint */
          }
        }
      }
      variants.push(t.c);
    }
    out.push(variants);
  }
  return out;
}

/* ================================================================= buildings ==
   Each returns a canvas sized (w x h cells) plus headroom above the footprint for the
   parts that rise off it, and the footprint's top-left sits at (0, head).

   The brief here is silhouette. The first pass drew every structure as the same grey
   rectangle with a coloured stripe, so a Refinery and a Barracks were indistinguishable
   at a glance - which is the one thing a base-builder cannot afford. Each of these is
   now built around a shape you can name from across the map: stacks, silos, a pitched
   roof, a ribbed shed, a crane. */
function _sprBuilding(key, side) {
  var def = rtsStructDef(key), TM = RTS_PAL.team[side];
  var cw = def.w * RTS_TS, ch = def.h * RTS_TS;
  var head = 24;
  var t = _sprMake(cw, ch + head), g = t.g, y0 = head;
  var C = RTS_PAL.conc, S = RTS_PAL.steel, D = RTS_PAL.dark, HZ = RTS_PAL.hazard;

  /* A flat-roofed slab: roof, a sliver of front wall, shaded right edge, lit top edge. */
  function slab(x, y, w, h, front, tn) {
    _sprRect(g, x, y, w, h - front, tn[0]);
    _sprRect(g, x, y, w, 1, tn[3] || tn[1]);
    _sprRect(g, x + w - 3, y, 3, h, tn[2]);
    _sprRect(g, x, y + h - front, w, front, tn[2]);
    _sprRect(g, x, y + h - front, w, 1, tn[1]);
  }
  /* Roof seams. A bare slab of one flat colour is what made the first pass read as a
     placeholder; breaking the surface into panels is most of the difference between
     "grey rectangle" and "building". */
  function seams(x, y, w, h, step, col) {
    for (var i = step; i < h; i += step) _sprRect(g, x, y + i, w, 1, col);
    _sprRect(g, x, y, 1, h, col);
    _sprRect(g, x + w - 1, y, 1, h, col);
  }
  function vent(x, y, w, h) {
    _sprRect(g, x, y, w, h, D[1]);
    _sprRect(g, x, y, w, 1, S[3]);
    for (var i = 1; i < h - 1; i += 2) _sprRect(g, x + 1, y + i, w - 2, 1, D[2]);
  }
  function pipe(x, y, w, h) {                       /* a run of conduit across the roof */
    _sprRect(g, x, y, w, h, S[0]);
    _sprRect(g, x, y, w, 1, S[3]);
    _sprRect(g, x, y + h - 1, w, 1, S[2]);
  }
  function hazardBar(x, y, w, h) {
    _sprRect(g, x, y, w, h, HZ[1]);
    for (var i = 0; i * 6 < w; i++) _sprRect(g, x + i * 6, y, 3, h, HZ[0]);
  }
  function windows(x, y, w, n, lit) {
    for (var i = 0; i < n; i++) {
      var wx = x + i * Math.floor(w / n);
      _sprRect(g, wx, y, 3, 3, lit ? RTS_PAL.lit : RTS_PAL.glass);
      _sprRect(g, wx, y + 3, 3, 1, D[2]);
    }
  }
  function teamStripe(x, y, w, h) {
    _sprRect(g, x, y, w, h, TM[0]);
    _sprRect(g, x, y, w, 1, TM[3]);
  }

  if (key === 'yard') {
    /* Command Yard: heavy slab under a full-width crane gantry, with a vehicle bay at the
       front. The crane is the tell - nothing else in the base has anything above the roof
       line spanning its whole width. */
    slab(2, y0 - 6, cw - 4, ch + 4, 8, C);
    seams(4, y0 - 4, cw - 8, ch, 9, C[2]);
    teamStripe(6, y0 - 2, cw - 12, 5);
    _sprRect(g, 6, y0 + 6, cw - 13, 15, C[2]);                      /* equipment deck */
    _sprRect(g, 6, y0 + 6, cw - 13, 1, C[3]);
    for (var i = 0; i < 4; i++) vent(9 + i * 13, y0 + 8, 8, 10);
    pipe(6, y0 + 25, cw - 13, 3);                                   /* conduit run */
    _sprRect(g, cw - 22, y0 + 30, 14, 10, S[2]);                    /* rooftop tank */
    _sprRect(g, cw - 22, y0 + 30, 14, 2, S[3]);
    _sprRect(g, 8, y0 + 31, 10, 8, C[3]);                           /* skylight */
    _sprRect(g, 9, y0 + 32, 8, 6, RTS_PAL.glass);
    _sprRect(g, 4, y0 - 24, 6, 26, S[0]);                           /* crane tower */
    _sprRect(g, 4, y0 - 24, 2, 26, S[3]);
    _sprRect(g, 6, y0 - 20, 2, 22, S[2]);
    _sprRect(g, 4, y0 - 24, cw - 20, 4, S[1]);                      /* jib across the roof */
    _sprRect(g, 4, y0 - 24, cw - 20, 1, S[3]);
    _sprRect(g, 4, y0 - 21, cw - 20, 1, S[2]);
    _sprRect(g, cw - 19, y0 - 20, 2, 10, D[0]);                     /* hoist cable */
    _sprRect(g, cw - 23, y0 - 11, 9, 5, S[0]);                      /* hook block */
    windows(9, y0 + ch - 7, cw - 20, 5, true);
    hazardBar(6, y0 + ch - 3, cw - 15, 4);

  } else if (key === 'power') {
    /* Power Plant: low hall behind two big cooling stacks and a transformer bank. */
    slab(2, y0 + 2, cw - 4, ch - 4, 6, C);
    seams(4, y0 + 4, cw - 8, ch - 10, 8, C[2]);
    teamStripe(5, y0 + 5, cw - 10, 4);
    _sprRect(g, 5, y0 + 12, cw - 11, 9, C[2]);                      /* turbine housing */
    _sprRect(g, 5, y0 + 12, cw - 11, 1, C[3]);
    for (var tv = 0; tv < 3; tv++) _sprRect(g, 7 + tv * 11, y0 + 14, 7, 5, D[1]);
    _sprCyl(g, 13, y0 - 16, 7, 26, S);                              /* stacks */
    _sprCyl(g, cw - 13, y0 - 11, 7, 23, S);
    _sprRect(g, 7, y0 - 18, 12, 2, D[0]);                           /* soot rims */
    _sprRect(g, cw - 19, y0 - 13, 12, 2, D[0]);
    _sprRect(g, 4, y0 + ch - 14, 9, 11, S[2]);                      /* transformer bank */
    _sprRect(g, 4, y0 + ch - 14, 9, 2, S[1]);
    _sprRect(g, 6, y0 + ch - 19, 1, 6, S[3]);
    _sprRect(g, 8, y0 + ch - 19, 1, 6, S[3]);
    _sprRect(g, 10, y0 + ch - 19, 1, 6, S[3]);
    windows(cw - 24, y0 + ch - 7, 18, 4, true);

  } else if (key === 'refinery') {
    /* Refinery: a processing block with two fat silos behind it and a wide hazard-striped
       unloading dock across the front - the shape a harvester visibly drives into. */
    slab(2, y0 - 6, cw - 24, ch - 12, 8, C);
    seams(4, y0 - 4, cw - 28, ch - 22, 8, C[2]);
    teamStripe(5, y0 - 2, cw - 30, 4);
    _sprRect(g, 5, y0 + 6, cw - 30, 12, C[2]);                      /* cracking tower base */
    for (var rv = 0; rv < 3; rv++) vent(7 + rv * 12, y0 + 8, 8, 8);
    pipe(5, y0 + 21, cw - 30, 3);
    _sprCyl(g, cw - 14, y0 - 14, 11, 32, S);                        /* rear silo */
    _sprCyl(g, cw - 15, y0 + 22, 10, 26, S);                        /* front silo */
    _sprRect(g, cw - 40, y0 - 8, 22, 3, S[2]);                      /* catwalk to the block */
    _sprRect(g, cw - 40, y0 - 8, 22, 1, S[3]);
    _sprRect(g, cw - 18, y0 - 24, 3, 11, S[0]);                     /* vent pipe */
    _sprRect(g, cw - 23, y0 - 25, 12, 3, S[1]);
    _sprRect(g, 3, y0 + ch - 16, cw - 26, 4, D[1]);                 /* dock canopy */
    hazardBar(3, y0 + ch - 12, cw - 26, 4);                         /* dock lip */
    _sprRect(g, 3, y0 + ch - 8, cw - 26, 7, D[2]);                  /* dock floor */
    _sprRect(g, 3, y0 + ch - 8, cw - 26, 1, D[1]);
    for (var dg2 = 0; dg2 < 4; dg2++) _sprRect(g, 6 + dg2 * 11, y0 + ch - 7, 7, 1, D[0]);

  } else if (key === 'barracks') {
    /* Barracks: the only pitched roof in the set, so it reads instantly from across the
       map. The ridge runs left-right, so the two slopes are horizontal bands - an earlier
       version drew vertical rafter stripes over the whole roof and it read as an awning. */
    var rh = ch - 6, ry0 = y0 - 4, ridge = ry0 + Math.round(rh * 0.44);
    _sprRect(g, 2, ry0, cw - 4, rh, RTS_PAL.dirt[2]);               /* far slope, in shade */
    _sprRect(g, 2, ry0, cw - 4, ridge - ry0, RTS_PAL.dirt[1]);      /* near slope, lit */
    for (var rr = 0; rr < 11; rr++) _sprRect(g, 4 + rr * 4, ry0, 1, rh, RTS_PAL.dirt[2]);
    _sprRect(g, 2, ridge - 1, cw - 4, 2, RTS_PAL.dirt[3]);          /* ridge cap */
    teamStripe(2, ridge + 3, cw - 4, 4);                            /* unit band */
    _sprRect(g, 2, ry0, cw - 4, 1, RTS_PAL.dirt[3]);                /* lit eave */
    _sprRect(g, 2, ry0 + rh - 1, cw - 4, 1, D[2]);
    _sprRect(g, 1, y0 + ch - 8, cw - 2, 7, C[0]);                   /* front wall, overhung */
    _sprRect(g, 1, y0 + ch - 8, cw - 2, 1, C[3]);
    _sprRect(g, cw / 2 - 5, y0 + ch - 8, 10, 7, D[2]);              /* door */
    _sprRect(g, cw / 2 - 4, y0 + ch - 6, 8, 5, D[1]);
    _sprRect(g, cw / 2 - 7, y0 + ch - 10, 14, 2, C[2]);             /* awning */
    windows(6, y0 + ch - 7, 12, 2, true);
    windows(cw - 18, y0 + ch - 7, 12, 2, true);
    for (var sb = 0; sb < 3; sb++) {                                /* sandbag ring */
      _sprEll(g, 5 + sb * 5, y0 + ch - 1, 3, 2, RTS_PAL.dirt[3]);
      _sprEll(g, cw - 5 - sb * 5, y0 + ch - 1, 3, 2, RTS_PAL.dirt[3]);
    }
    _sprRect(g, cw - 6, y0 - 20, 1, 17, S[0]);                      /* flag pole */
    _sprRect(g, cw - 5, y0 - 20, 6, 4, TM[1]);
    _sprRect(g, cw - 5, y0 - 20, 6, 1, TM[3]);

  } else if (key === 'factory') {
    /* War Factory: wide corrugated shed with a skylight spine, roll-up door and exhausts. */
    slab(2, y0 - 8, cw - 4, ch + 6, 8, C);
    for (var rb = 0; rb < 10; rb++) {                               /* corrugated roof ribs */
      _sprRect(g, 4, y0 - 6 + rb * 3, cw - 9, 2, rb % 2 ? S[0] : S[1]);
    }
    _sprRect(g, cw / 2 - 12, y0 - 6, 24, 28, S[2]);                 /* skylight spine */
    for (var sk = 0; sk < 6; sk++) _sprRect(g, cw / 2 - 11, y0 - 5 + sk * 5, 22, 3, RTS_PAL.glass);
    teamStripe(4, y0 - 8, cw - 9, 3);
    _sprRect(g, 4, y0 + ch - 20, cw - 9, 2, S[3]);                  /* gantry rail */
    _sprRect(g, 4, y0 + ch - 18, cw - 9, 1, S[2]);
    _sprRect(g, cw / 2 - 15, y0 + ch - 15, 30, 13, D[2]);           /* roll-up door recess */
    for (var dl = 0; dl < 6; dl++) _sprRect(g, cw / 2 - 14, y0 + ch - 14 + dl * 2, 28, 1, D[1]);
    hazardBar(cw / 2 - 18, y0 + ch - 3, 36, 4);                     /* apron */
    _sprCyl(g, 9, y0 - 19, 4, 14, S);                               /* exhausts */
    _sprCyl(g, 18, y0 - 15, 4, 11, S);
    windows(cw - 24, y0 + ch - 9, 18, 4, true);
    windows(6, y0 + ch - 9, 12, 2, true);

  } else if (key === 'turret') {
    /* Turret: octagonal concrete pad with a squat rotating housing. The barrel is drawn
       by the renderer instead, because it has to track a target. */
    _sprEll(g, RTS_TS / 2, y0 + RTS_TS / 2 + 1, 11, 9, C[2]);
    _sprEll(g, RTS_TS / 2, y0 + RTS_TS / 2, 10, 8, C[0]);
    _sprEll(g, RTS_TS / 2 - 1, y0 + RTS_TS / 2 - 2, 7, 5, C[3]);
    for (var bo = 0; bo < 6; bo++) {                                /* anchor bolts */
      var ba = bo / 6 * Math.PI * 2;
      _sprRect(g, RTS_TS / 2 + Math.cos(ba) * 8 - 0.5, y0 + RTS_TS / 2 + Math.sin(ba) * 6.5 - 0.5, 1, 1, D[0]);
    }
    _sprEll(g, RTS_TS / 2, y0 + RTS_TS / 2 - 2, 6, 5, TM[0]);       /* housing */
    _sprEll(g, RTS_TS / 2 - 1, y0 + RTS_TS / 2 - 3, 4, 3, TM[3]);
  }

  _sprEdge(t.c);
  return { c: _sprShadow(t.c, 3, 3), head: head };
}

/* ===================================================================== units ==
   Built by inverse-rotation sampling: for every destination pixel, rotate it back into
   the unit's local frame and ask the shape function what colour lives there. Local +u is
   the nose, local +v is the unit's right. Because the plot is a whole-pixel fillRect in
   destination space, a 45-degree tank has hard pixels instead of the anti-aliased fringe
   ctx.rotate() would leave. */
function _sprRot(size, ang, sample) {
  var t = _sprMake(size, size), g = t.g;
  var c = size / 2, cs = Math.cos(ang), sn = Math.sin(ang);
  for (var py = 0; py < size; py++) {
    for (var px = 0; px < size; px++) {
      var dx = px + 0.5 - c, dy = py + 0.5 - c;
      var u = dx * cs + dy * sn, v = -dx * sn + dy * cs;
      var col = sample(u, v);
      if (col) { g.fillStyle = col; g.fillRect(px, py, 1, 1); }
    }
  }
  return t.c;
}

function _sprUnit(key, side) {
  var d = rtsUnitDef(key), TM = RTS_PAL.team[side];
  var S = RTS_PAL.steel, D = RTS_PAL.dark, O = RTS_PAL.ore;
  var size = key === 'harvester' ? 26 : (d.kind === 'infantry' ? 16 : 22);
  var frames = [];

  /* Shape functions in local space. Body length runs along u, width along v. Shading is
     by v so the side away from the light stays dark whatever the facing, which is what
     stops a turning tank from strobing.

     The rule that matters here is INTERNAL CONTRAST. An earlier version drew the tank's
     hull and its turret both in TM[0] and ran the barrel from u=-1, straight through the
     turret - so the turret vanished into the hull and the whole unit read as a blue brick
     with a scratch on it. Each part now sits a full tone away from the one under it, and
     the barrel starts outside the turret. */
  function box(u, v, u0, u1, v0, v1) { return u >= u0 && u <= u1 && v >= v0 && v <= v1; }
  function tone(v, half, tn) {
    if (v < -half * 0.45) return tn[1];        /* lit near edge */
    if (v > half * 0.5) return tn[2];          /* shadowed far edge */
    return tn[0];
  }
  /* Tracks with visible tread blocks - a flat dark bar reads as a shadow, not a vehicle. */
  function track(u, v, uHalf, v0, v1, right) {
    if (!box(u, v, -uHalf, uHalf, v0, v1)) return null;
    if (Math.abs(v - (right ? v1 : v0)) < 0.9) return D[2];      /* outer edge */
    return (Math.floor(u + 100) % 3 === 0) ? D[2] : D[0];        /* tread blocks */
  }

  var sample;
  if (d.kind === 'infantry') {
    /* Two figures at a diagonal offset, each big enough to have a helmet and a weapon. */
    var men = [[2.2, -2.6], [-2.4, 2.2]];
    sample = function (u, v) {
      for (var i = 0; i < 2; i++) {
        var mu = u - men[i][0], mv = v - men[i][1];
        if (key === 'rocket' ? box(mu, mv, 1.5, 7, -1.4, 1.4) : box(mu, mv, 2, 6, -0.7, 0.7))
          return key === 'rocket' ? (mv < 0 ? D[1] : D[2]) : D[1];     /* weapon */
        if (box(mu, mv, 0.5, 2.6, -1.8, 1.8)) return '#cbae88';        /* helmet */
        if (box(mu, mv, -2.4, 0.5, -2.2, 2.2))                         /* torso + pack */
          return mv < -0.8 ? TM[1] : (mv > 1 ? TM[2] : TM[0]);
      }
      return null;
    };
  } else if (key === 'tank') {
    sample = function (u, v) {
      if (box(u, v, 4.5, 12, -1.2, 1.2)) return v < 0 ? D[1] : D[2];   /* barrel, clear of turret */
      var tu = u + 0.5;
      if (tu * tu + v * v < 25) {                                      /* turret, a tone up */
        if (tu * tu + v * v > 19) return D[2];                         /* turret rim */
        if (box(tu, v, -3, -1, -1.5, 1.5)) return TM[2];               /* hatch */
        return v < -1.5 ? TM[3] : (v > 2.2 ? TM[0] : TM[1]);
      }
      var tr = track(u, v, 9, -7, -4.2) || track(u, v, 9, 4.2, 7, 1);
      if (tr) return tr;
      if (box(u, v, -8.5, 9.5, -4.4, 4.4)) {                           /* hull, bevelled nose */
        if (u > 7 && Math.abs(v) > 3) return null;
        if (Math.abs(v) > 3.6) return TM[2];                           /* fender line */
        return tone(v, 4.4, TM);
      }
      return null;
    };
  } else if (key === 'buggy') {
    sample = function (u, v) {
      if (box(u, v, 2, 9, -0.9, 0.9)) return D[1];                     /* pintle gun */
      if (box(u, v, -1.5, 2.5, -2, 2)) return D[2];                    /* gun mount */
      var wheels = [[5.5, -4.4], [5.5, 4.4], [-5, -4.6], [-5, 4.6]];
      for (var i = 0; i < 4; i++) {
        var du = u - wheels[i][0], dv = v - wheels[i][1];
        if (du * du * 0.55 + dv * dv * 1.6 < 5) return Math.abs(dv) > 1.2 ? D[2] : D[0];
      }
      if (box(u, v, -7, 8.5, -3.4, 3.4)) {                             /* narrow body */
        if (u > 6 && Math.abs(v) > 2.2) return null;                   /* pointed nose */
        if (box(u, v, -4.5, -1, -2.4, 2.4)) return RTS_PAL.glass;      /* open cockpit */
        return tone(v, 3.4, TM);
      }
      return null;
    };
  } else if (key === 'harvester') {
    sample = function (u, v) {
      if (box(u, v, 9, 12.5, -7, 7)) return Math.abs(v) > 5.5 ? D[2] : D[1];  /* intake blade */
      var tr = track(u, v, 10, -8.2, -5.6) || track(u, v, 10, 5.6, 8.2, 1);
      if (tr) return tr;
      if (box(u, v, -11, 2, -6, 6)) {                                  /* ore hopper */
        if (box(u, v, -9.5, 0.5, -4.6, 4.6)) {
          if (Math.floor(u + 100) % 4 === 0) return O[3];              /* hopper ribs */
          return v < -2 ? O[2] : (v > 2.5 ? O[0] : O[1]);
        }
        return v < -4.8 ? S[1] : (v > 4.8 ? S[2] : S[0]);
      }
      if (box(u, v, 2.5, 9, -5.2, 5.2)) {                              /* cab */
        if (box(u, v, 5, 8.2, -3, 3)) return RTS_PAL.glass;
        return tone(v, 5.2, TM);
      }
      return null;
    };
  } else {
    sample = function (u, v) {
      if (box(u, v, 3, 9, -0.9, 0.9)) return D[1];
      var tr = track(u, v, 7, -5.4, -3.2) || track(u, v, 7, 3.2, 5.4, 1);
      if (tr) return tr;
      if (box(u, v, -7, 8, -3.4, 3.4)) {
        if (u > 6 && Math.abs(v) > 2.2) return null;
        return tone(v, 3.4, TM);
      }
      return null;
    };
  }

  for (var f = 0; f < 8; f++) {
    var cv = _sprRot(size, f / 8 * Math.PI * 2, sample);
    _sprEdge(cv);
    frames.push(_sprShadow(cv, 1, 2));
  }
  return frames;
}

/* Muzzle flashes and explosions, as small frame strips. */
function _sprFx() {
  var boom = [], i;
  var cols = ['#fff4cc', '#ffd070', '#ff9a2e', '#e0561c', '#8a3410', '#3a2418'];
  for (i = 0; i < 6; i++) {
    var s = 14 + i * 8, t = _sprMake(s, s), g = t.g, c = s / 2;
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
  var S = { ore: _sprOre(), bld: {}, unit: {}, fx: _sprFx() };
  ['player', 'enemy'].forEach(function (side) {
    S.bld[side] = {}; S.unit[side] = {};
    RTS_STRUCTS.forEach(function (d) { S.bld[side][d.key] = _sprBuilding(d.key, side); });
    RTS_UNITS.forEach(function (d) { S.unit[side][d.key] = _sprUnit(d.key, side); });
  });
  _RTS_SPR = S;
  return S;
}
