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
  /* Five tones, not four: the fifth is a near-black used only at the base of a cliff face.
     Warmed towards brown as well - the neutral grey read as poured concrete next to the
     olive ground, and the reference's rock is a warm stone. */
  rock:  ['#7a6f58', '#8e8368', '#4f4839', '#aa9e81', '#332e26'],
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
  /* Gun tubes get their own ramp. `steel` is a blue grey - fine for girders and hubs, but it
     was measurably tinting the guns: an artillery piece came out 45% blue pixels with a hull
     that carried no team colour at all. Gunmetal is neutral-warm and leaves the blue budget
     to the parts that are meant to signal ownership. */
  gun:   ['#6e6a60', '#847f72', '#4b4842', '#9b9588'],
  dark:  ['#31363e', '#3f4650', '#22262c', '#4b5360'],
  glass: '#8fbcd4',
  lit:   '#ffd98a',
  hazard:['#c9a227', '#2a2a26'],
  team: {
    player: ['#2f5fa8', '#3f7fd0', '#1e3f74', '#69a9ee'],
    enemy:  ['#a83228', '#d04438', '#741e18', '#ec7663']
  },
  /* Vehicle bodies are NOT the team colour, and this is taken straight off the reference art
     rather than guessed: in the sidebar cameos for both factions every tank, truck and jeep is
     khaki, olive or grey-green. The team colour is a REMAP over a small part of the sprite, not
     the paint job. Our vehicles were team colour end to end, which made a tank, a light tank, an
     artillery piece and a harvester four blue lumps that differed only in outline.

     So the body takes these tones and the team colour is cut back to the TURRET CAP and the
     track guards. That split was measured, not assumed. Painting the whole deck the team colour
     - the move that made structures readable - left every vehicle still reading as blue, because
     under a camera that looks down the deck IS most of the pixels. On a structure that is the
     point. On a vehicle it buries the reference's khaki completely, so the ownership signal
     moves to the smallest surface that no facing can hide.

     The two sides differ in the body as well as the trim - Allied grey-green, Soviet warm
     khaki - so a glance at a distant column tells you whose it is even before the trim reads. */
  veh: {
    player: ['#7e8672', '#949c86', '#5a6151', '#a9b19a'],
    enemy:  ['#8a7d52', '#a09368', '#635939', '#b5a97c']
  },
  /* Structures are NOT grey. In the reference each faction's buildings are strongly
     coloured - steel blue walls under maroon roofs on one side, red on the other - and that
     colour is most of how you tell whose base you are looking at from across the map. An
     all-concrete pass read as a grey industrial estate. */
  /* Taken from reference frames of the original, and the correction that matters most is the
     ROOF. It used to be a muddy brown on both sides with a thin team-coloured band laid over
     it, and the result was that you could not tell whose base you were looking at without
     stopping to check. In the reference the roof IS the team colour - Soviet buildings are
     bright red across their whole top surface, Allied are steel blue - and because the camera
     looks down, the roof is most of what you see. That one change does more for reading a
     base at a glance than every piece of roof clutter put together.

     The tones are also brighter and more saturated than what was here. The reference palette
     is limited and high-contrast: red, grey, white, mid-green. Nothing in it is muddy. */
  bld: {
    player: { wall:'#7d8794', roof:'#3f6ea8', trim:'#c8d2dc', dark:'#2b3d52' },
    enemy:  { wall:'#8a8f94', roof:'#b8322a', trim:'#d8ccc8', dark:'#4a1f1a' }
  },
  /* Building MATERIALS, read off the structure cameos. A Red Alert base is not one colour: the
     power plants are red brick with brick chimneys, the Allied barracks are sand-coloured Nissen
     huts, the radar dome and the walls are bare concrete, the tech centre is a pale block. Ours
     were one blue for everything - the structure version of exactly the fault the vehicles had.

     The team-coloured ROOF stays. The cameos cannot argue against it: they are sidebar icons,
     drawn separately from the in-game sprites, and they carry no player remap at all - the
     Construction Yard, Power Plant, Refinery, Radar Dome and Silo are literally the same image
     on the Allied and the Soviet sheet. What they are good evidence for is form and base
     material, which is what is taken from them here. */
  mat: {
    brick: ['#8f4a36', '#a85c44', '#663324', '#c07257'],
    sand:  ['#ab9b70', '#c2b287', '#857852', '#d6caa2'],
    pale:  ['#a4a99f', '#bec3b8', '#797e76', '#d4d9cc']
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
      /* A DRAWN edge, not a blended one. The previous version deliberately dithered the
         boundary - the comment read "ragged edge, not a hard border" - and that is the single
         thing that makes this ground read as generated rather than as hand-authored tiles.
         In the reference every dirt patch has a crisp outline with a darker rim inside it,
         because it was drawn by someone, and the eye picks that up immediately even at 24
         pixels a cell.

         Three bands off one noise field: grass, a narrow dark rim, then the patch interior.
         The rim is what sells it - a hard colour change alone still looks like a threshold,
         while a hard change with a shadow line under it looks like an edge. */
      if (n > 0.735) {                                  /* patch interior */
        pal = dr;
        k = grain < 0.18 ? 3 : (grain < 0.5 ? 1 : (grain < 0.82 ? 0 : 2));
      } else if (n > 0.715) {                           /* the rim - a drawn outline */
        pal = dr;
        k = 2;
      } else {
        pal = gr;
        k = grain < 0.12 ? 4 : (grain < 0.42 ? 2 : (grain < 0.76 ? 0 : 1));
        /* grass immediately outside a patch is scuffed rather than lush, which reads as the
           patch having worn outward instead of having been stamped on */
        if (n > 0.64) k = grain < 0.5 ? 2 : 4;
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
  /* With the player's own game files loaded, the GROUND is repainted from the original's
     terrain templates - real grass and water, one of sixteen clear variants picked per cell the
     way the original picks them. Everything layered on afterwards (rock, trees, ore, the dirt
     patches' drawn edges) stays procedural, because those are multi-tile templates with real
     placement rules and half-applying them would look worse than either end state. */
  if (typeof _mixGround === 'function' && _mixGround()) {
    for (var gz = 0; gz < N; gz++) {
      for (var gx = 0; gx < N; gx++) {
        var gk = G.terrain[_rtsIdx(gx, gz)];
        if (gk === RTS_T_ROCK) continue;                /* ours is better than half a cliff */
        _mixPaintCell(d, S, gx, gz, gk, seed);
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

  /* --- rock ridges. --------------------------------------------------------------------
     Rewritten off a continuous COVERAGE FIELD rather than per-cell rectangles. The old version
     drew each rock cell as an axis-aligned box clipped against its neighbours, and rendered it
     read as a paved plaza: you could count the 24-pixel cells along every edge, the whole
     plateau was one flat grey, and the "drop" was a thin kerb along the bottom.

     `cov` samples the cell mask at cell CENTRES and interpolates bilinearly, so its 0.5 contour
     lands exactly on the cell boundaries - the painted rock still matches the rock the
     pathfinder blocks, which is not negotiable - but it arrives there as a smooth curve instead
     of a staircase, and a noise term then breaks it up.

     Every other feature is read off that same field by asking "is there still rock this many
     pixels away": the sunlit north lip, the side walls, and the tall south drop, whose HEIGHT
     is how far the rock continues below - so a deep massif gets a full-height cliff face and a
     thin spur gets a short one, which is what makes a ridge read as a landform rather than as
     a shape with a dark line under it. --- */
  var RK = RTS_PAL.rock;
  var rockCv = _sprMake(S, S), rg = rockCv.g;
  var rimg = rg.createImageData(S, S), rd = rimg.data;
  function isRock(x, z) { return tileAt(x, z) === RTS_T_ROCK; }
  function rk(x, z) { return isRock(x, z) ? 1 : 0; }
  function cov(px, py) {
    var u = px / TS - 0.5, v = py / TS - 0.5;
    var x0 = Math.floor(u), y0 = Math.floor(v), fx = u - x0, fy = v - y0;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    var a = rk(x0, y0), b = rk(x0 + 1, y0), c2 = rk(x0, y0 + 1), e2 = rk(x0 + 1, y0 + 1);
    return (a + (b - a) * fx) * (1 - fy) + (c2 + (e2 - c2) * fx) * fy;
  }
  /* The noise amplitude is deliberately modest. At 0.55 the boundary wandered most of a cell
     and rock was painted over ground a harvester could drive through; 0.34 keeps every wander
     inside about a third of a cell, which is enough to kill the staircase and small enough
     that what you see is still what blocks. */
  function fld(px, py) {
    return cov(px, py) + (_sprVN(px, py, 9, seed + 81) - 0.5) * 0.34;
  }
  var FACE = 11;                          /* the tallest a south drop is allowed to be */
  /* The field is thresholded ONCE per 2x2 block into this mask, because every feature below
     wants to know the answer at five or six nearby points and evaluating it there directly
     cost 353 ms of the terrain bake. Zero is the correct value everywhere it is not filled:
     two cells out from any rock, cov is 0 and the noise can only reach 0.17. */
  var HS = S >> 1, FM = new Uint8Array(HS * HS);
  var NEAR = new Uint8Array(N * N);       /* cells that can hold painted rock, worked out once */
  for (tz = 0; tz < N; tz++)
    for (tx = 0; tx < N; tx++)
      if (isRock(tx, tz))
        for (var mz = -1; mz <= 1; mz++)
          for (var mx = -1; mx <= 1; mx++)
            if (_rtsInB(tx + mx, tz + mz)) NEAR[(tz + mz) * N + (tx + mx)] = 1;
  function solid(px, py) {
    var hx = px >> 1, hy = py >> 1;
    return (hx < 0 || hy < 0 || hx >= HS || hy >= HS) ? 0 : FM[hy * HS + hx];
  }
  for (tz = 0; tz < N; tz++) {
    for (tx = 0; tx < N; tx++) {
      if (!NEAR[tz * N + tx]) continue;
      for (var fy2 = tz * TS; fy2 < tz * TS + TS; fy2 += 2)
        for (var fx2 = tx * TS; fx2 < tx * TS + TS; fx2 += 2)
          if (fld(fx2, fy2) > 0.5) FM[(fy2 >> 1) * HS + (fx2 >> 1)] = 1;
    }
  }
  for (tz = 0; tz < N; tz++) {
    for (tx = 0; tx < N; tx++) {
      if (!NEAR[tz * N + tx]) continue;
      for (var py = tz * TS; py < tz * TS + TS; py += 2) {
        for (var px = tx * TS; px < tx * TS + TS; px += 2) {
          if (!solid(px, py)) continue;
          /* how far the rock continues downward decides the height of the drop */
          var below = 0;
          while (below < FACE && solid(px, py + below + 2)) below += 2;
          var grain = _sprHash(px >> 1, py >> 1, seed + 71);
          var col;
          if (below < FACE) {
            /* THE SOUTH FACE. Vertical striations from a hash on x only, so they run down the
               cliff instead of speckling it - that verticality is most of what says "wall". */
            var strip = _sprHash(px >> 1, 0, seed + 91);
            var deep = below < FACE * 0.45;
            col = strip < 0.30 ? RK[4] : (strip < 0.62 ? RK[2] : RK[0]);
            if (deep) col = strip < 0.45 ? RK[4] : RK[2];
          } else if (!solid(px, py - 3)) {
            col = RK[3];                                        /* sunlit north lip */
          } else if (!solid(px, py - 7)) {
            col = RK[1];                                        /* the shelf under it */
          } else if (!solid(px - 4, py) || !solid(px + 4, py)) {
            col = !solid(px - 4, py) ? RK[1] : RK[2];           /* the two side walls */
          } else {
            /* Plateau top. A low-frequency band picks the broad facet and the grain only
               dithers within it, so the top has large light and dark planes across it rather
               than the single flat grey it used to be. */
            var facet = _sprVN(px, py, 34, seed + 83);
            col = facet < 0.36 ? (grain < 0.5 ? RK[2] : RK[0])
                : (facet < 0.68 ? (grain < 0.5 ? RK[0] : RK[1])
                                : (grain < 0.35 ? RK[1] : RK[3]));
          }
          var cc = _sprCol(col);
          for (var ry = 0; ry < 2; ry++) {
            var rrow = (py + ry) * S;
            for (var rx = 0; rx < 2; rx++) {
              var ro = (rrow + px + rx) * 4;
              rd[ro] = cc[0]; rd[ro + 1] = cc[1]; rd[ro + 2] = cc[2]; rd[ro + 3] = 255;
            }
          }
        }
      }
    }
  }
  rg.putImageData(rimg, 0, 0);
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
  /* Real trees when the player's own files are loaded. Ours next to the original's ground was
     the one thing in the first pass that looked plainly wrong - bright cones on RA's dark
     temperate grass. */
  if (typeof _mixTrees === 'function') {
    var real = _mixTrees();
    if (real) return (_RTS_TREES = real);
  }
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
  /* Real artwork wins when the player has pointed the game at their own game files; everything
     below is the fallback that got this project to the point where it could ask. */
  if (typeof _rtsArtReady === 'function' && _rtsArtReady()) {
    var real = _mixBuilding(key, side);
    if (real) return real;
  }
  var def = rtsStructDef(key), TM = RTS_PAL.team[side];
  var W = def.w * RTS_TS, D = def.h * RTS_TS;
  var C = RTS_PAL.conc, S = RTS_PAL.steel, DK = RTS_PAL.dark, B = RTS_PAL.bld[side];
  /* K = brick, SD = sand, P = pale block. See RTS_PAL.mat - a base in the reference is built
     from several materials, and painting all of it in one team-tinted grey-blue is what made
     ours read as a set of blue boxes. */
  var K = RTS_PAL.mat.brick, SD = RTS_PAL.mat.sand, P = RTS_PAL.mat.pale;
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
    /* Construction Yard. The cameo is a VAULTED HANGAR - a barrel roof over a rectangular hall
       with one big opening in the end - and the arch is the identity. Nothing else in a base
       has a curved roofline, so it reads from across the map without a crane arm to help. */
    _r3Box(m, 0, 0, 0, W - 10, 12, D - 10, C[0], C[2]);                  /* the hall */
    /* The vault has to be TALLER THAN IT IS DEEP or it does not read as an arch: spread 66
       wide and 15 high, every one of its facets faces almost straight up, the light hits
       them all the same and the whole roof shades as one flat plate. Narrower than the hall
       and half as tall again gives the flanks a real angle to catch. */
    _r3Vault(m, 0, 12, 0, W - 8, 22, D - 8, C[1], 18, true);             /* the barrel roof */
    _r3Box(m, 0, 33, 0, 10, 1.6, D - 12, B.roof, B.roof);                /* ridge band - team */
    _r3Box(m, 0, 0, D / 2 - 4, W - 26, 12, 5, DK[2], DK[0]);             /* the opening */
    _r3Box(m, 0, 12, D / 2 - 4, W - 22, 2.5, 6, C[3], C[3]);             /* its lintel */
    pilasters(D / 2 - 3, 0, 0, 2, W - 22, 4, 12);
    _r3Box(m, 0, 0, -D / 2 + 4, W - 26, 3, 5, C[2], C[0]);               /* apron kerb */
    _r3Cyl(m, W / 2 - 11, 13, -D / 2 + 11, 4.5, 9, S[0], S[3], 18);      /* one vent */

  } else if (key === 'power') {
    /* Power Plant. RED BRICK with two tall brick chimneys - that is what the cameo shows on
       both faction sheets, and the chimneys are how you find it in a base. Everything else is
       kept low so the pair owns the silhouette. */
    _r3Slab(m, 0, 0, 4, W - 8, 13, D - 14, 3, K[0], K[1]);
    _r3Box(m, 0, 13, 4, W - 18, 2, D - 24, K[2], K[3]);                  /* roof */
    _r3Box(m, 0, 15, 4, W - 20, 1.2, 4, B.roof, B.roof);                 /* team band */
    winRow(D / 2 - 6, 3, 0, 3, 11, 5, 5);
    _r3Box(m, 0, 0, D / 2 - 6, 10, 8, 4, DK[0], DK[1]);                  /* door */
    for (var pk = 0; pk < 2; pk++) {
      var pxx = -9 + pk * 18;
      _r3Cyl(m, pxx, 13, -D / 2 + 9, 5.5, 28, K[0], K[3], 18);           /* brick chimney */
      _r3Cyl(m, pxx, 30, -D / 2 + 9, 6.0, 2.5, K[2], K[2], 18);          /* string course */
      _r3Cyl(m, pxx, 38, -D / 2 + 9, 6.2, 3, DK[1], DK[3], 18);          /* cap */
    }
    _r3Box(m, W / 2 - 10, 0, 2, 8, 7, 12, S[2], S[1]);                   /* transformer */
    for (var pt = 0; pt < 3; pt++) _r3Box(m, W / 2 - 12 + pt * 3, 7, 2, 1.5, 5, 1.5, S[3], S[3]);

  } else if (key === 'apower') {
    /* Advanced Power Plant. Same brick vocabulary so the pair read as a family, but FOUR
       chimneys on a longer hall. The cooling tower that used to be here is not in the
       reference at all and it was competing with the chimneys for the silhouette. */
    _r3Slab(m, 0, 0, 4, W - 10, 16, D - 14, 3, K[0], K[1]);
    _r3Box(m, 0, 16, 4, W - 22, 2, D - 24, K[2], K[3]);
    _r3Box(m, 0, 18, 4, W - 24, 1.2, 4, B.roof, B.roof);                 /* team band */
    winRow(D / 2 - 6, 4, 0, 5, 13, 5, 6);
    _r3Box(m, -14, 0, D / 2 - 6, 11, 9, 4, DK[0], DK[1]);
    _r3Box(m, 14, 0, D / 2 - 6, 11, 9, 4, DK[0], DK[1]);
    for (var ak = 0; ak < 4; ak++) {
      var axx = -25 + ak * 16.5;
      _r3Cyl(m, axx, 16, -D / 2 + 9, 5.0, 24 + (ak % 2) * 6, K[0], K[3], 18);
      _r3Cyl(m, axx, 36 + (ak % 2) * 6, -D / 2 + 9, 5.6, 3, DK[1], DK[3], 18);
    }
    _r3Box(m, 0, 0, -D / 2 + 4, W - 30, 3, 4, C[2], C[0]);

  } else if (key === 'refinery') {
    /* Ore Refinery. The cameo is a dark industrial block with a RUST-coloured upper stage and
       two pale silos, over a wide dock. Two features rather than one, because the dock is what
       tells you which way the building faces and a refinery you cannot dock at is worse than
       an ugly one. */
    _r3Slab(m, -12, 0, -3, W - 32, 13, D - 22, 3, C[2], C[0]);           /* lower plant */
    _r3Box(m, -12, 13, -3, W - 40, 9, D - 30, K[0], K[1]);               /* rust upper stage */
    _r3Box(m, -12, 22, -3, W - 44, 2, D - 34, K[2], K[3]);
    _r3Box(m, -12, 24, -3, W - 46, 1.2, 4, B.roof, B.roof);              /* team band */
    winRow(7, 4, -12, 3, 11, 5, 5);
    for (var rs = 0; rs < 2; rs++) {                                     /* the two pale silos */
      _r3Cyl(m, W / 2 - 22 + rs * 15, 0, -8, 7, 26, C[3], C[1], 20);
      _r3Cyl(m, W / 2 - 22 + rs * 15, 26, -8, 7.4, 2.5, DK[1], DK[3], 20);
    }
    _r3Box(m, W / 2 - 27, 12, 8, 20, 2.5, 5, S[2], S[1]);                /* conveyor */
    _r3Box(m, W / 2 - 27, 8, 8, 3, 5, 3, S[0], S[1]);
    _r3Box(m, -10, 0, D / 2 - 9, W - 30, 2.5, 16, C[2], C[0]);           /* the dock */
    _r3Box(m, -10, 2.5, D / 2 - 16, W - 30, 1.2, 3, RTS_PAL.hazard[0], RTS_PAL.hazard[0]);
    _r3Box(m, -W / 2 + 7, 0, D / 2 - 9, 4, 8, 15, DK[1], DK[3]);

  } else if (key === 'barracks') {
    /* Barracks. NISSEN HUTS - three sand-coloured barrel-roofed sheds in a row, which is what
       the cameo shows and is nothing like the pitched hall that used to be here. Three curved
       roofs side by side is a silhouette no other structure comes near. */
    _r3Box(m, 0, 0, 0, W - 4, 2, D - 4, RTS_PAL.dirt[2], RTS_PAL.dirt[1]);
    for (var bh = 0; bh < 3; bh++) {
      _r3Vault(m, -W / 2 + 9 + bh * ((W - 18) / 2), 2, 0, 13, 12, D - 8,
               SD[bh === 1 ? 1 : 0], 14, true);
      _r3Box(m, -W / 2 + 9 + bh * ((W - 18) / 2), 2, D / 2 - 5, 12, 8, 3, SD[2], SD[2]);
    }
    _r3Box(m, 0, 13, 0, W - 8, 1.4, 5, B.roof, B.roof);                  /* one team band */
    _r3Box(m, 0, 2, D / 2 - 4, 6, 7, 3, DK[2], DK[0]);                   /* door */
    _r3Box(m, -W / 2 + 8, 15, -D / 2 + 7, 1.6, 15, 1.6, S[3], S[3]);     /* the flag */
    _r3Box(m, -W / 2 + 12, 25, -D / 2 + 7, 7, 5, 1, TM[0], TM[0]);
    _r3Box(m, -W / 2 + 9, 2, D / 2 - 6, 12, 4, 5, RTS_PAL.bag[0], RTS_PAL.bag[1]);

  } else if (key === 'factory') {
    /* War Factory. The cameo's dominant feature is a big dark GABLED roof over an open bay,
       not the flat deck that was here - and under the roof the front is almost entirely a
       roll-up door, which is what says "vehicles come out of this one". */
    _r3Box(m, 0, 0, 0, W - 8, 12, D - 8, C[0], C[2]);
    _r3Gable(m, 0, 12, 0, W - 4, 11, D - 4, DK[1]);                      /* the dark gable */
    _r3Box(m, 0, 21, 0, W - 22, 1.4, 4, B.roof, B.roof);                 /* ridge band - team */
    _r3Box(m, 0, 0, D / 2 - 3, W - 26, 11, 4, DK[2], DK[0]);             /* the door */
    for (var fd = 0; fd < 5; fd++)
      _r3Box(m, 0, 1.5 + fd * 2.1, D / 2 - 1.6, W - 28, 1.0, 1.5, DK[1], DK[3]);
    _r3Box(m, 0, 11, D / 2 - 3, W - 20, 2.5, 5, C[3], C[3]);             /* header */
    pilasters(D / 2 - 3, 0, 0, 2, W - 20, 4, 11);
    _r3Cyl(m, -W / 2 + 12, 23, 0, 4.5, 9, S[0], S[3], 18);               /* one extractor */

  } else if (key === 'radar') {
    /* Radar Dome. The dome IS the building - a pale hemisphere on a small dark base, and the
       most instantly identifiable structure in the game. Everything else stays low. */
    _r3Slab(m, 0, 0, 2, W - 10, 10, D - 12, 3, C[0], C[2]);
    _r3Box(m, 0, 0, D / 2 - 5, 8, 8, 3, DK[0], DK[1]);
    winRow(D / 2 - 4, 3, -11, 2, 8, 4, 4);
    _r3Cone(m, 0, 10, -1, 15, 13.5, 6, C[3], 22);
    _r3Cone(m, 0, 16, -1, 13.5, 9.5, 7, C[1], 22);
    _r3Cone(m, 0, 23, -1, 9.5, 4, 6, C[3], 22);
    _r3Cyl(m, 0, 29, -1, 2, 4, S[1], S[3], 16);
    _r3Cyl(m, 0, 10, -1, 15.6, 1.4, B.roof, B.roof, 22);                 /* team ring at its foot */
    _r3Box(m, W / 2 - 7, 0, 4, 5, 12, 5, S[2], S[1]);                    /* waveguide riser */

  } else if (key === 'lab') {
    /* Tech Center. In the cameo this is a TALL PALE OFFICE BLOCK - several storeys of ribbon
       windows with a small mast on top - and that verticality is the point: it is the one
       building in a base that is taller than it is wide. The dish that used to be here made it
       a second Radar Dome. */
    _r3Box(m, 0, 0, 2, W - 12, 30, D - 14, P[0], P[1]);                  /* the tower */
    for (var lf = 0; lf < 3; lf++) {                                     /* ribbon windows */
      winRow(D / 2 - 6, 5 + lf * 9, 0, 3, 10, 6, 5);
      _r3Box(m, 0, 3.5 + lf * 9, D / 2 - 6, W - 14, 1.4, 1.5, P[3], P[3]);
    }
    _r3Box(m, 0, 30, 2, W - 8, 2.5, D - 10, P[3], P[1]);                 /* parapet */
    _r3Box(m, 0, 32.5, 2, W - 10, 1.2, 4, B.roof, B.roof);               /* team band */
    _r3Box(m, -W / 2 + 8, 0, D / 2 - 5, 8, 9, 3, DK[0], DK[1]);          /* entrance */
    _r3Box(m, W / 2 - 10, 32, -2, 2, 14, 2, S[3], S[3]);                 /* mast */
    _r3Box(m, W / 2 - 10, 43, -2, 6, 1.5, 1.5, S[1], S[1]);
    _r3Cyl(m, 8, 32, 4, 4, 4, S[2], S[1], 16);                           /* rooftop plant */

  } else if (key === 'depot') {
    /* Service Depot. The cameo is almost entirely a flat pale OVAL APRON with a small hut at
       one edge - the building is the ground, not a box. The gantry frame that used to be here
       was invented. Keeping the middle genuinely empty is what makes it read as somewhere a
       vehicle drives onto. */
    _r3Cone(m, 0, 0, 0, W / 2 - 3, W / 2 - 5, 2, C[3], 26);              /* the round pad */
    _r3Cone(m, 0, 2, 0, W / 2 - 8, W / 2 - 9, 0.8, C[1], 26);            /* inner ring */
    _r3Box(m, 0, 2.8, 0, W - 30, 0.8, D - 30, RTS_PAL.hazard[0], RTS_PAL.hazard[0]);
    _r3Box(m, -W / 2 + 8, 2, -2, 10, 11, 16, C[0], C[2]);                /* the hut */
    _r3Box(m, -W / 2 + 8, 13, -2, 11, 1.6, 17, P[3], P[1]);
    _r3Box(m, -W / 2 + 8, 14.6, -2, 9, 1.0, 4, B.roof, B.roof);          /* team band */
    _r3Box(m, -W / 2 + 8, 2, 8, 5, 7, 3, DK[0], DK[1]);
    for (var db = 0; db < 3; db++)                                       /* drums at the edge */
      _r3Cyl(m, W / 2 - 9, 2, -8 + db * 8, 2.6, 5, RTS_PAL.hazard[0], S[3], 16);
    _r3Box(m, 6, 2, -D / 2 + 7, 12, 4, 4, S[2], S[1]);                   /* toolrack */

  } else if (key === 'helipad') {
    /* A flat pad, and in the reference it is exactly that: a marked square of apron with a
       yellow cross on it and almost nothing standing up. Keeping it low is the point - the one
       structure a helicopter can sit on top of has to look like it. */
    _r3Box(m, 0, 0, 0, W - 4, 2.5, D - 4, C[2], C[0]);
    _r3Box(m, 0, 2.5, 0, W - 12, 0.8, D - 12, C[0], C[1]);         /* the marked square */
    _r3Box(m, 0, 3.3, 0, W - 22, 0.7, 4.5, RTS_PAL.hazard[0], RTS_PAL.hazard[0]);   /* the cross */
    _r3Box(m, 0, 3.3, 0, 4.5, 0.7, D - 22, RTS_PAL.hazard[0], RTS_PAL.hazard[0]);
    _r3Box(m, -W / 2 + 6, 2.5, -D / 2 + 6, 7, 9, 7, C[0], B.roof);  /* control hut, team roof */
    _r3Box(m, -W / 2 + 6, 11.5, -D / 2 + 6, 1.2, 6, 1.2, S[3], S[3]);   /* mast */
    for (var hp = 0; hp < 4; hp++)                                  /* corner lights */
      _r3Cyl(m, (hp < 2 ? -1 : 1) * (W / 2 - 5), 2.5, (hp % 2 ? 1 : -1) * (D / 2 - 5),
             1.0, 1.8, RTS_PAL.lit, RTS_PAL.lit, 10);
    _r3Cyl(m, W / 2 - 7, 2.5, D / 2 - 7, 2.6, 4.5, RTS_PAL.hazard[0], S[3], 14);    /* fuel drum */

  } else if (key === 'silo') {
    /* Ore Silo. The cameo is a LOW RIBBED BUNKER - a wide flat green-grey box with vertical
       ribs down it and an open frame at one end - not the three cylinders that were here,
       which read as a small refinery. Low and wide is the whole identity. */
    _r3Box(m, 0, 0, 0, W - 6, 2, D - 6, C[2], C[0]);                     /* pad */
    _r3Box(m, 0, 2, -1, W - 12, 13, D - 14, SD[2], SD[0]);               /* the bunker */
    for (var sk = 0; sk < 5; sk++)                                       /* the ribs */
      _r3Box(m, -16 + sk * 8, 2, -1, 2.5, 14, D - 12, C[2], C[0]);
    _r3Box(m, 0, 15, -1, W - 10, 2, D - 12, C[3], C[1]);                 /* the lid */
    _r3Box(m, 0, 17, -1, W - 14, 1.2, 4, B.roof, B.roof);                /* team band */
    _r3Box(m, 0, 2, D / 2 - 5, W - 16, 11, 2.5, DK[2], DK[0]);           /* open end frame */
    _r3Box(m, 0, 2, D / 2 - 4, W - 20, 5, 3, RTS_PAL.ore[0], RTS_PAL.ore[1]);  /* ore inside */
    _r3Box(m, -W / 2 + 7, 2, -D / 2 + 6, 4, 16, 4, S[3], S[3]);          /* fill pipe */
    _r3Box(m, -W / 2 + 13, 17, -D / 2 + 6, 12, 2, 3, S[2], S[1]);

  } else if (key === 'kennel') {
    /* Attack Dog Kennel. Literally a doghouse in the cameo - a red-brown box with a barrel
       roof and an arched black entrance. Tiny, and nothing on it could be mistaken for a
       weapon, which matters: it must not read as a defence. */
    _r3Box(m, 0, 0, 0, W - 4, 1.5, D - 4, RTS_PAL.dirt[2], RTS_PAL.dirt[1]);
    _r3Box(m, -3, 1.5, -1, 13, 7, 12, K[0], K[1]);
    _r3Vault(m, -3, 8.5, -1, 14, 7, 13, K[2], 12, true);                 /* barrel roof */
    _r3Box(m, -3, 1.5, 5, 5, 6, 2, DK[2], DK[0]);                        /* the arched entry */
    _r3Box(m, -3, 14, -1, 9, 1.2, 4, B.roof, B.roof);                    /* team band */
    _r3Box(m, 8, 1.5, 2, 5, 2, 4, S[2], S[1]);                           /* feed trough */
    _r3Box(m, 8, 1.5, -6, 1, 8, 1, S[3], S[3]);                          /* post */

  } else if (key === 'rocketpit') {
    /* Rocket Turret. TUBES, angled up - a stepped bank so the silhouette is a wedge rather
       than the Gun Turret's single spike. The two must not be confusable. */
    _r3Box(m, 0, 0, 0, W - 4, 3, D - 4, C[2], C[0]);
    _r3Box(m, 0, 3, 0, 15, 6, 13, C[0], C[2]);
    for (var rt = 0; rt < 3; rt++) {
      _r3Cyl(m, -4 + rt * 4, 9 + rt * 2.5, -1, 1.8, 11 - rt, S[0], S[3], 16);
      _r3Cyl(m, -4 + rt * 4, 20 - rt + (rt * 2.5), -1, 2.1, 1.5, DK[1], DK[3], 16);
    }
    _r3Box(m, 0, 9, 5, 13, 1.5, 3, B.roof, B.roof);
    _r3Box(m, 6, 3, 6, 4, 6, 4, S[2], S[1]);                             /* guidance box */

  } else if (key === 'flametower') {
    /* Flame Tower. A stone column with a flared head on a fuel drum. Tall and narrow is the
       identity - it is the only defence with a vertical silhouette. */
    _r3Box(m, 0, 0, 0, W - 5, 2.5, D - 5, C[2], C[0]);
    _r3Cyl(m, -5, 2.5, 4, 5, 7, RTS_PAL.hazard[0], S[3], 18);            /* fuel drum */
    _r3Cyl(m, 3, 2.5, -2, 4, 20, C[0], C[2], 18);                        /* the column */
    _r3Cone(m, 3, 22.5, -2, 4, 6.5, 4, C[1], 18);                        /* flared head */
    _r3Cyl(m, 3, 26.5, -2, 2, 4, RTS_PAL.hazard[0], S[3], 16);           /* pilot */
    _r3Cyl(m, 3, 9, -2, 4.6, 1.4, B.roof, B.roof, 18);                   /* team band */
    _r3Box(m, -1, 6, 1, 6, 1.5, 1.5, S[2], S[1]);                        /* feed pipe */

  } else if (key === 'wall') {
    /* Concrete Wall. Has to tile with itself edge to edge, so it fills the cell exactly and
       nothing may cross the boundary. Simple by necessity and by choice - a wall that draws
       attention is a wall that makes a base look noisy. */
    _r3Box(m, 0, 0, 0, RTS_TS, 9, RTS_TS, C[0], C[1]);
    _r3Box(m, 0, 9, 0, RTS_TS, 2, RTS_TS, C[3], C[3]);                   /* capping course */
    _r3Box(m, 0, 4.5, 0, RTS_TS, 1, RTS_TS, C[2], C[2]);                 /* joint line */
    _r3Box(m, 0, 0, RTS_TS / 2 - 1, 3, 9, 2, C[2], C[2]);                /* form-tie marks */

  } else if (key === 'pillbox') {
    /* Pillbox. A small concrete dome with a slit. Low and rounded on purpose: it is the one
       defence that should read as dug in rather than standing up. */
    _r3Box(m, 0, 0, 0, W - 5, 2.5, D - 5, C[2], C[0]);
    _r3Cone(m, 0, 2.5, 0, 10, 7, 6, C[1], 20);
    _r3Cone(m, 0, 8.5, 0, 7, 4.5, 3.5, C[3], 20);
    _r3Box(m, 0, 5, 7, 11, 2.5, 2, DK[2], DK[3]);                        /* firing slit */
    _r3Box(m, 0, 5.5, 9, 3, 1.5, 4, S[3], S[3]);                         /* gun barrel */
    _r3Box(m, 0, 11.5, 0, 5, 1.2, 5, B.roof, B.roof);
    for (var pb = 0; pb < 3; pb++)
      _r3Box(m, -8 + pb * 8, 2.5, -8, 6, 3, 4, RTS_PAL.bag[0], RTS_PAL.bag[1]);

  } else if (key === 'turret') {
    /* Gun Turret. A single BARREL on a low armoured base, lying almost flat - the barrel is
       the read, so it is long and sits clear of everything else. */
    _r3Box(m, 0, 0, 0, W - 4, 3, D - 4, C[2], C[0]);
    _r3Cone(m, 0, 3, 0, 9, 7.5, 6, C[0], 20);                            /* sloped base */
    _r3Cyl(m, 0, 9, 0, 7, 5, C[2], B.roof, 20);                          /* turret, team roof */
    _r3Box(m, 0, 10, 8, 3, 3, 13, S[0], S[1]);                           /* barrel */
    _r3Box(m, 0, 10, 15, 4, 4, 3, S[2], S[3]);                           /* muzzle */
    _r3Box(m, -7, 3, -6, 4, 3, 4, RTS_PAL.bag[0], RTS_PAL.bag[1]);
  }
  var r = _r3BakeFootprint(m, W, D);
  _sprEdge(r.c);
  return { c: _sprShadow(r.c, 3, 3), head: r.head };
}

/* ------------------------------------------------------------------- units --
   One model per type, yawed to each of eight facings and rendered separately. Because the
   model is rotated in 3D rather than the canvas being rotated in 2D, a tank at 45 degrees
   shows its side and its tracks correctly instead of being a smeared copy of the front. */
/* The size ladder, in art pixels of the baked canvas. A cell is RTS_TS = 24 px, so these read
   directly as "how many cells does this unit cover" - and that is the number that was wrong.
   A Battle Tank measured 69 px, just under THREE cells, which put it level with a 2x2 building
   and turned four of them into one unreadable slab. In the reference a light tank is about a
   cell and a half, a Mammoth a little over two, and infantry stay under one.

   The models below are authored at whatever scale is comfortable to write and brought onto
   this ladder by _sprUnitScale, so resizing a unit is one number here rather than three
   hundred hand-tuned coordinates, and it cannot silently change the unit's proportions. */
var RTS_UNIT_SPAN = {
  rifle:22, rocket:23, grenadier:22, flame:23, engineer:22, medic:22, thief:22, tanya:20,
  dog:17, buggy:30, light:33, tank:39, arty:41, heavy:47, harvester:43, mcv:46, apc:34, heli:40
};

/* Eight of the fifteen units are infantry, and at one cell tall their SILHOUETTES cannot be
   told apart - a rifleman and a medic are the same stack of boxes and no amount of modelling
   changes that. Rendering all eight as bare shapes proved it: one blob, eight times.

   In the reference they are told apart by COLOUR. So colour is the primary signal here and the
   prop is only the confirmation. The camera looks down (R3_K = 1.3), which makes the TOP of the
   helmet the largest single patch of any soldier - so `helm[1]`, the helmet's top face, is the
   identity marker, exactly the way the roof became the team colour on structures. body:null
   means "wear the team colour", which is what an ordinary rifleman does. */
var RTS_INF_KIT = {
  rifle:     { body:null,                  top:null,      prop:'#3f4650' },
  rocket:    { body:['#6b5a3a','#85714c'], top:'#6d727a', prop:'#8d8571' },
  grenadier: { body:['#8a5a20','#a87030'], top:'#d9a13c', prop:'#d9a13c' },
  flame:     { body:['#6b4a1c','#87602a'], top:'#e8531c', prop:'#e8a11c' },
  engineer:  { body:['#c99a1e','#e8bc3c'], top:'#f5d565', prop:'#2a2a26' },
  medic:     { body:['#cfcfc4','#eaeae0'], top:'#ffffff', prop:'#c8302a' },
  thief:     { body:['#22252b','#31363e'], top:'#17191d', prop:'#4b5360' },
  tanya:     { body:['#c4bca4','#e0d8bc'], top:'#a8452a', prop:'#2b3038' }
};

/* part: undefined = the whole unit, 'hull' = body only, 'turret' = turret only. Hull and
   turret bake into the same size canvas about the same origin, so drawing one over the other
   at the same screen position lines them up with no per-facing offset table. */
function _sprUnitModel(key, side, prone, part) {
  var d = rtsUnitDef(key), TM = RTS_PAL.team[side], VH = RTS_PAL.veh[side];
  var S = RTS_PAL.steel, DK = RTS_PAL.dark, O = RTS_PAL.ore, C = RTS_PAL.conc;
  var GN = RTS_PAL.gun;
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
      _r3Box(m, 0, rad * 2.0, z, len - 1, 1.2, rad * 2.4, VH[2], VH[1]);      /* fender skirt */
    }
  }

  if (key === 'dog') {
    /* ONE animal, not two. A kennel turns out a single dog, and the pair that used to be drawn
       here read as a squad - which is also why it shared its silhouette with every infantry
       unit on the board. The identity is the AXIS: a dog is long and low where every man is
       short and tall, so the body runs along +x at knee height and nothing rises above the
       head. It is also the only unit not wearing the team colour - just a collar - because a
       tan animal against eight uniformed men is a difference you can see at eight pixels. */
    var FUR = '#9c8459', FURL = '#b8a077';
    for (i = 0; i < 4; i++)                                                  /* four legs */
      _r3Box(m, i < 2 ? -1.9 : 2.3, 0, (i % 2) ? 1.3 : -1.3, 1.1, 2.4, 1.0, DK[1], DK[2]);
    _r3Box(m, 0.2, 2.2, 0, 7.6, 2.4, 2.7, FUR, FURL);                        /* body along +x */
    _r3Box(m, 2.6, 2.2, 0, 1.1, 2.6, 3.0, TM[1], TM[3]);                     /* collar */
    _r3Box(m, 4.4, 2.8, 0, 2.6, 2.3, 2.1, FUR, FURL);                        /* head */
    _r3Box(m, 5.9, 2.9, 0, 1.5, 1.2, 1.5, DK[0], DK[1]);                     /* muzzle */
    _r3Box(m, 3.9, 5.1, -0.7, 0.8, 1.3, 0.7, FUR, FURL);                     /* ears */
    _r3Box(m, 3.9, 5.1, 0.7, 0.8, 1.3, 0.7, FUR, FURL);
    _r3Box(m, -3.6, 3.8, 0, 2.8, 0.9, 0.9, FUR, FURL);                       /* tail */

  } else if (d.kind === 'infantry') {
    /* Two figures offset from each other so a squad does not read as one lump; +x is the nose.
       Hero units are ONE figure - a Commando drawn as a pair reads as two Commandos, which is
       exactly the wrong signal for a unit limited to one at a time.

       Prone is a genuinely different silhouette, low and long and facing forward, because that
       is the only way the player can tell at a glance that a squad is pinned. */
    var kit = RTS_INF_KIT[key] || RTS_INF_KIT.rifle;
    /* The helmet's SIDES stay the team colour on every kit and only its top carries the unit's
       marker. That keeps ownership readable on a squad of medics or engineers, whose uniforms
       have no team colour left in them at all, without letting the team colour compete with the
       marker for the one surface the camera actually sees. */
    var BD = kit.body ? kit.body[0] : TM[0], BL = kit.body ? kit.body[1] : TM[1];
    var HD = TM[2], HL = kit.top || TM[3];
    var SK = '#c8a882', SKL = '#d8bc96';
    var men = (key === 'tanya') ? [[0, 0]] : [[2.5, -3], [-2.5, 2.5]];
    for (i = 0; i < men.length; i++) {
      var mx = men[i][0], mz = men[i][1];
      if (prone) {
        _r3Box(m, mx - 1, 0, mz, 7, 2, 2.6, BD, BL);               /* body, lying down */
        _r3Box(m, mx + 2.6, 0, mz, 2.4, 2, 2.4, SK, SKL);
        _r3Box(m, mx + 2.4, 1.9, mz, 2.6, 0.8, 2.6, HD, HL);       /* helmet, still readable */
        _r3Box(m, mx + 5, 0.6, mz, 5, 1, 1, kit.prop, kit.prop);   /* weapon, braced */
        continue;
      }
      /* Four stacked shapes of different widths - legs, a torso, a head, a helmet with a brim.
         The torso and the helmet top carry the unit's colour and are what actually identifies
         it; the props below are secondary. */
      _r3Box(m, mx, 0, mz - 0.9, 1.7, 2.6, 1.4, DK[1], DK[2]);     /* legs */
      _r3Box(m, mx, 0, mz + 0.9, 1.7, 2.6, 1.4, DK[1], DK[2]);
      _r3Box(m, mx, 2.4, mz, 3.6, 3.7, 3.6, BD, BL);               /* torso - the colour block */
      _r3Box(m, mx, 6.1, mz, 2.2, 1.4, 2.2, SK, SKL);              /* head */
      _r3Box(m, mx - 0.3, 7.1, mz, 3.4, 1.1, 3.4, HD, HL);         /* helmet - the marker */
      if (key === 'rocket') {
        /* One fat tube carried across the shoulders, long enough to stand proud at BOTH ends.
           The old one pointed forward only and vanished at the facings where forward was
           toward the camera; a bar that overhangs both sides survives every facing. */
        _r3Box(m, mx + 0.4, 5.6, mz - 1.3, 10.5, 2.2, 2.2, S[1], S[3]);
        _r3Box(m, mx - 4.6, 5.6, mz - 1.3, 1.6, 2.6, 2.6, DK[0], DK[2]);   /* blast end */
      } else if (key === 'flame') {
        /* Two bright tanks rising ABOVE the helmet, so from any angle a flame squad is a pair
           of hot pips over a dark figure - the opposite read to the rocket squad's long bar,
           which is the pair most easily confused. */
        _r3Cyl(m, mx - 2.4, 3.0, mz - 1.1, 1.1, 5.6, kit.prop, '#f7c93a', 10);
        _r3Cyl(m, mx - 2.4, 3.0, mz + 1.1, 1.1, 5.6, kit.prop, '#f7c93a', 10);
        _r3Box(m, mx + 3.0, 4.6, mz - 0.5, 4.4, 1.3, 1.3, DK[1], DK[3]);   /* wand */
      } else if (key === 'engineer') {
        /* No weapon at all and a toolbox in one hand. Losing one to a stray shell is losing
           500 credits, so it has to be pickable out of a mixed squad without stopping. */
        _r3Box(m, mx + 2.2, 2.2, mz - 1.4, 2.6, 2.0, 1.8, kit.prop, S[1]);
      } else if (key === 'medic') {
        /* The only white in the game, and a red cross laid flat on top of the pack where the
           camera can actually see it. */
        _r3Box(m, mx - 1.6, 5.6, mz, 1.0, 0.7, 3.0, kit.prop, kit.prop);
        _r3Box(m, mx - 1.6, 5.6, mz, 3.0, 0.7, 1.0, kit.prop, kit.prop);
      } else if (key === 'thief') {
        _r3Box(m, mx + 1.9, 2.6, mz + 1.6, 2.6, 2.2, 1.5, kit.prop, S[1]);  /* satchel */
      } else if (key === 'tanya') {
        _r3Box(m, mx + 2.3, 4.4, mz - 1.0, 2.8, 0.9, 0.9, kit.prop, DK[3]); /* pistols */
        _r3Box(m, mx + 2.3, 4.4, mz + 1.0, 2.8, 0.9, 0.9, kit.prop, DK[3]);
      } else if (key === 'grenadier') {
        /* Arm cocked back with a charge in it - a rearward line where the rifleman's is
           forward, so a mixed squad is not a smear. */
        _r3Box(m, mx - 1.8, 6.4, mz - 1.2, 2.8, 1.1, 1.1, BD, BL);
        _r3Cyl(m, mx - 2.9, 7.2, mz - 1.2, 0.9, 1.4, kit.prop, '#f0bd58', 8);
      } else {
        _r3Box(m, mx + 2.6, 4.4, mz - 0.5, 5.4, 1.0, 1.0, kit.prop, DK[3]); /* rifle */
      }
    }

  } else if (key === 'tank') {
    /* UNIT.CPP keeps PrimaryFacing (hull) and SecondaryFacing (turret) as separate values and
       draws them as separate shapes. So the turret is baked on its own, pivoting about the
       model origin - which is what lets a tank drive one way while its gun tracks another.
       `part` selects which half to build. */
    if (part !== 'turret') {
      tracks(20, 6.4, 5, 2.4);
      /* Lower hull, then a sloped deck over it. The taper is what stops the front reading as
         one flat rectangle - it splits the nose into two shading bands. The deck is the team
         colour; everything else is the khaki body. */
      _r3Slab(m, 0, 3.4, 0, 18, 3.6, 10.5, 1.1, VH[0], VH[1]);
      _r3Hip(m, -1, 7.0, 0, 17, 1.9, 10.5, 2.6, VH[3]);
      _r3Box(m, 7.6, 3.4, 0, 3.2, 3.4, 9.4, VH[1], VH[3]);         /* glacis plate */
      _r3Box(m, -7.4, 5.0, 3.2, 3.4, 2.0, 3.0, S[2], S[1]);        /* stowage box */
    }
    if (part !== 'hull') {
      /* One heavy barrel with a muzzle brake, on a tapered housing. The Light Tank's is thin
         and short and the Mammoth's is doubled, so barrel count and thickness are the whole
         difference between the three at a glance.

         The gun sits LOW on the turret and reaches well past the track guards, and that is a
         projection fix rather than a styling choice. Screen height is z - 1.3y, so a barrel
         swung toward the camera gains z and loses it again to its own height: the old one, high
         on the turret and stopping short, cancelled out exactly and disappeared into the hull
         at three of the eight facings. Low and long, the z wins and the muzzle clears the hull
         at every facing. */
      _r3Slab(m, -0.6, 8.0, 0, 10.5, 3.4, 9.0, 1.0, VH[1], VH[3]);
      _r3Hip(m, -0.6, 11.4, 0, 9.5, 1.4, 8.2, 2.0, TM[1]);         /* turret roof - team */
      _r3Box(m, 5.0, 8.4, 0, 3.0, 2.6, 4.2, DK[1], DK[3]);         /* mantlet */
      _r3Box(m, 12.0, 8.8, 0, 12.0, 2.1, 2.1, DK[1], DK[3]);       /* barrel, along +x */
      _r3Box(m, 19.2, 8.6, 0, 2.8, 2.8, 2.8, GN[0], GN[3]);        /* muzzle brake, pale */
      _r3Box(m, -4.6, 12.8, -2.6, 0.6, 4.5, 0.6, DK[1], DK[3]);    /* aerial */
    }

  } else if (key === 'light') {
    /* The Battle Tank at three-quarters, with a small one-piece turret, a thin stub barrel and
       none of its clutter - no stowage, no aerial, no muzzle brake. It has to read as "the
       cheap one" before the player counts pixels. */
    if (part !== 'turret') {
      tracks(16, 5.2, 4, 2.0);
      _r3Slab(m, 0, 2.9, 0, 14.5, 3.0, 8.6, 1.0, VH[0], VH[1]);
      _r3Hip(m, -0.8, 5.9, 0, 13.5, 1.6, 8.6, 2.2, VH[3]);         /* deck */
      _r3Box(m, 6.2, 2.9, 0, 2.6, 2.8, 7.6, VH[1], VH[3]);         /* glacis */
    }
    if (part !== 'hull') {
      _r3Slab(m, -0.5, 6.9, 0, 7.6, 2.8, 6.6, 0.9, VH[1], TM[1]);  /* turret, team roof */
      _r3Box(m, 3.8, 7.3, 0, 2.0, 1.9, 3.0, DK[1], DK[3]);         /* mantlet */
      _r3Box(m, 9.6, 7.6, 0, 9.5, 1.2, 1.2, DK[1], DK[3]);         /* barrel - thin, long */
      _r3Box(m, 14.8, 7.5, 0, 1.6, 1.6, 1.6, GN[0], GN[3]);        /* muzzle */
    }

  } else if (key === 'heavy') {
    /* Wider tracks, a longer hull, and TWO barrels set well apart - the fastest way to say
       "this is the expensive one" without any text. The old pair sat close enough together to
       merge into one bar at the diagonal facings, so they are spread to either side of the
       mantlet where the gap survives the projection. */
    if (part !== 'turret') {
      tracks(23, 7.6, 6, 2.9);
      _r3Slab(m, 0, 4.2, 0, 21, 4.4, 12.5, 1.3, VH[0], VH[1]);
      _r3Hip(m, -1, 8.6, 0, 20, 2.2, 12.5, 3.0, VH[3]);            /* deck */
      _r3Box(m, 9.0, 4.2, 0, 3.6, 4.2, 11.0, VH[1], VH[3]);        /* glacis */
      _r3Box(m, -8.5, 6.2, 4.0, 4.0, 2.6, 3.4, S[2], S[1]);        /* stowage */
    }
    if (part !== 'hull') {
      _r3Slab(m, -0.6, 10.0, 0, 12.5, 4.2, 11.0, 1.2, VH[1], VH[3]);   /* turret */
      _r3Hip(m, -0.6, 14.2, 0, 11.5, 1.6, 10.0, 2.4, TM[1]);       /* turret roof - team */
      _r3Box(m, 6.0, 10.6, 0, 3.4, 3.0, 7.8, DK[1], DK[3]);        /* mantlet, spanning both */
      _r3Box(m, 13.6, 10.9, -3.2, 12.0, 2.0, 2.0, DK[1], DK[3]);   /* twin barrels, spread */
      _r3Box(m, 13.6, 10.9, 3.2, 12.0, 2.0, 2.0, DK[1], DK[3]);
      _r3Box(m, 20.6, 10.8, -3.2, 2.4, 2.4, 2.4, GN[0], GN[3]);    /* pale muzzles */
      _r3Box(m, 20.6, 10.8, 3.2, 2.4, 2.4, 2.4, GN[0], GN[3]);
      _r3Box(m, -5.4, 15.8, -3.0, 0.6, 5.0, 0.6, DK[1], DK[3]);    /* aerial */
    }

  } else if (key === 'arty') {
    /* The one unit whose identity is a single part, and the one that was broken worst: a long
       tube lying along +x disappears completely at the facings where +x points toward the
       camera, because the oblique projection folds it straight into the hull. Three of the
       eight facings had no gun at all.

       The fix is not a longer tube, it is a HIGHER one, in a colour the hull does not use. The
       tube is carried on a visible pedestal well above a deliberately squat chassis and painted
       pale steel, and depth is y + 1.3z, so at the facings where it lies over the hull it draws
       ON TOP of it as a bright bar rather than being swallowed. The splayed recoil spades at
       the back are the second signal and never move. */
    tracks(16, 5.4, 5, 2.1);
    _r3Slab(m, -1, 2.9, 0, 14.5, 2.6, 9.0, 1.0, VH[0], VH[1]);     /* squat chassis */
    _r3Box(m, -6.6, 2.9, 0, 3.4, 2.4, 8.0, VH[2], TM[1]);          /* engine deck - team cap */
    _r3Slab(m, 0.5, 5.5, 0, 6.6, 3.4, 6.6, 1.0, GN[2], GN[1]);     /* pedestal / trunnion */
    _r3Box(m, 4.5, 8.0, 0, 19.0, 2.8, 2.8, GN[1], GN[3]);          /* the tube - pale, long */
    _r3Box(m, 15.4, 7.9, 0, 3.0, 3.0, 3.0, GN[0], GN[3]);          /* muzzle */
    _r3Box(m, -3.6, 8.2, 0, 4.0, 2.4, 4.6, DK[1], DK[3]);          /* breech */
    _r3Box(m, -9.0, 0.9, -3.4, 5.2, 1.3, 1.8, S[1], S[0]);         /* recoil spades, splayed */
    _r3Box(m, -9.0, 0.9, 3.4, 5.2, 1.3, 1.8, S[1], S[0]);

  } else if (key === 'buggy') {
    /* Wheels are the buggy's whole identity, so they are proper vertical cylinders standing
       clear of the body with a light hub - four round shapes at the corners read instantly as
       "wheeled" against every tank's four square track runs. */
    for (i = 0; i < 4; i++) {
      var bx = i < 2 ? 6.2 : -6.2, bz = (i % 2) ? 6.0 : -6.0;
      _r3Cyl(m, bx, 0, bz, 3.1, 3.4, DK[0], DK[1], 12);
      _r3Cyl(m, bx, 1.0, bz, 1.4, 2.6, S[2], S[1], 10);            /* hub */
    }
    _r3Slab(m, 0, 2.8, 0, 17, 3.2, 8.2, 1.0, VH[0], VH[3]);        /* body tub */
    _r3Box(m, 6.6, 3.2, 0, 3.6, 2.2, 7.6, VH[1], VH[3]);           /* sloped nose */
    _r3Box(m, -1.5, 6.0, 0, 7.5, 2.8, 7.0, DK[2], DK[1]);          /* open cockpit well */
    _r3Box(m, -4.8, 6.0, 0, 1.0, 4.6, 7.0, TM[1], TM[3]);          /* roll hoop */
    _r3Box(m, 3.2, 8.4, 0, 8.5, 1.3, 1.3, DK[1], DK[3]);           /* pintle gun */

  } else if (key === 'heli') {
    /* Attack helicopter. Two things carry it at this size: a long thin tail boom, which no
       ground unit has, and the rotor disc - drawn as a wide, very flat cylinder rather than
       blades, because at 24 px spinning blades are noise and a disc reads instantly. */
    _r3Box(m, 0, 3.0, 0, 15.0, 4.6, 5.2, VH[0], VH[1]);            /* fuselage */
    _r3Box(m, 5.6, 3.4, 0, 4.6, 3.6, 4.4, VH[1], VH[3]);           /* nose */
    _r3Box(m, 7.6, 4.2, 0, 1.6, 2.2, 3.4, RTS_PAL.glass, RTS_PAL.glass);
    _r3Box(m, -10.0, 4.6, 0, 11.0, 1.9, 1.9, VH[2], VH[1]);        /* tail boom */
    _r3Box(m, -15.0, 4.6, 0, 1.4, 5.0, 1.4, VH[1], VH[3]);         /* tail fin */
    _r3Cyl(m, -15.2, 6.2, 0.9, 2.4, 0.5, DK[1], DK[3], 14);        /* tail rotor disc */
    _r3Box(m, 0, 7.6, 0, 3.2, 1.4, 3.2, GN[2], GN[1]);             /* rotor head */
    /* BLADES, and only along the two axes. Drawn as a solid disc - the obvious way to say
       "spinning" - the rotor came out as an opaque dark lid 31 px across that hid the entire
       aircraft; every facing was the same black circle. The next attempt put four blades at
       45-degree steps, which is worse for a reason worth writing down: these primitives are
       axis-aligned boxes, so a diagonal "bar" is a box that is long in BOTH axes - a square.
       Four of them merged into a solid diamond. Two crossed bars along x and z are genuine
       thin bars, they read as a rotor, and the fuselage shows through the gaps. */
    _r3Box(m, 0, 8.9, 0, 30.0, 0.5, 1.4, DK[1], DK[3]);
    _r3Box(m, 0, 8.9, 0, 1.4, 0.5, 30.0, DK[1], DK[3]);
    _r3Box(m, 1.0, 2.2, -3.6, 6.0, 1.4, 1.4, GN[1], GN[3]);        /* stub wings + pods */
    _r3Box(m, 1.0, 2.2, 3.6, 6.0, 1.4, 1.4, GN[1], GN[3]);
    _r3Box(m, 2.6, 1.4, -3.6, 4.0, 1.6, 2.0, DK[1], DK[3]);
    _r3Box(m, 2.6, 1.4, 3.6, 4.0, 1.6, 2.0, DK[1], DK[3]);
    _r3Box(m, 0, 0.4, 0, 9.0, 1.0, 6.6, TM[1], TM[3]);             /* skids / team stripe */

  } else if (key === 'apc') {
    /* A closed box on tracks with a rear ramp and a small cupola gun - no turret (UDATA.CPP
       has IsTurretEquipped false), so the read is "a tank with no gun on top", which is
       exactly what it is. The ramp is the tell that it carries something. */
    tracks(17, 6.0, 5, 2.3);
    _r3Slab(m, 0, 3.2, 0, 16.5, 7.5, 10.5, 1.2, VH[0], VH[1]);     /* the box */
    _r3Box(m, 0, 10.7, 0, 14.5, 1.2, 9.0, VH[3], VH[3]);           /* roof */
    _r3Box(m, 0, 11.9, 0, 6, 1.2, 4, TM[1], TM[3]);                /* team cap */
    _r3Box(m, 7.4, 3.2, 0, 3.0, 6.6, 9.0, VH[1], VH[3]);           /* sloped nose */
    _r3Box(m, 9.6, 6.6, 0, 1.4, 2.6, 6.4, RTS_PAL.glass, RTS_PAL.glass);
    _r3Box(m, -8.6, 1.4, 0, 3.2, 6.0, 8.0, DK[2], DK[0]);          /* the rear ramp */
    for (i = 0; i < 3; i++)                                        /* ramp ribs */
      _r3Box(m, -9.4, 2.0 + i * 1.8, 0, 1.2, 0.9, 7.4, GN[2], GN[1]);
    _r3Cyl(m, 2.0, 10.7, -2.4, 2.4, 2.4, VH[2], VH[3], 14);        /* cupola */
    /* The gun is the one thing separating this box from the MCV's box at a glance, so it is
       longer and darker than the little pintle it started as. */
    _r3Box(m, 8.0, 11.4, -2.4, 10.0, 1.3, 1.3, DK[1], DK[3]);      /* its gun */
    _r3Box(m, 12.6, 11.3, -2.4, 1.6, 1.6, 1.6, GN[0], GN[3]);      /* muzzle */

  } else if (key === 'mcv') {
    /* A slab-sided transporter with the yard's gantry folded flat along its back - IsGigundo
       in UDATA.CPP, so it is the biggest thing on wheels, and it carries no gun at all. The
       folded arm is the read: it is the only vehicle with a lattice lying on top of it. */
    tracks(22, 7.4, 6, 2.8);
    _r3Slab(m, -2, 4.2, 0, 24, 8.5, 13.0, 1.3, VH[0], VH[1]);      /* the body */
    for (i = 0; i < 4; i++)                                        /* side ribs */
      _r3Box(m, -11 + i * 6.0, 4.2, 0, 1.2, 8.2, 13.5, VH[2], VH[1]);
    _r3Box(m, -2, 12.7, 0, 22, 1.2, 11.0, VH[3], VH[3]);           /* roof deck */
    _r3Box(m, -2, 13.9, 0, 8, 1.4, 4, TM[1], TM[3]);               /* team cap */
    /* the folded gantry: two rails and their cross-bracing, lying along the deck */
    _r3Box(m, -1, 13.9, -3.4, 20, 1.6, 1.6, GN[1], GN[3]);
    _r3Box(m, -1, 13.9, 3.4, 20, 1.6, 1.6, GN[1], GN[3]);
    for (i = 0; i < 4; i++)
      _r3Box(m, -8 + i * 5.4, 14.1, 0, 1.2, 1.0, 6.4, GN[2], GN[0]);
    _r3Slab(m, 11.5, 4.2, 0, 7, 9.0, 11.0, 1.0, VH[1], VH[3]);     /* cab */
    _r3Box(m, 14.6, 7.6, 0, 1.6, 3.2, 8.0, RTS_PAL.glass, RTS_PAL.glass);
    _r3Cyl(m, 8.0, 13.2, -4.2, 1.0, 3.4, DK[1], DK[3], 10);        /* stack */
    _r3Box(m, -13.8, 2.0, 0, 3.0, 3.0, 10.0, GN[2], GN[1]);        /* rear jack beam */

  } else if (key === 'harvester') {
    /* The only gold on the board that moves. The heaped ore is the identity and it sits on the
       highest surface, which under this camera is most of what you see of it. */
    tracks(23, 7.8, 6, 2.9);
    _r3Slab(m, -4.5, 5.0, 0, 16, 7.5, 13.5, 1.2, VH[2], VH[0]);    /* hopper */
    for (i = 0; i < 3; i++)                                        /* ribs down the hopper */
      _r3Box(m, -10 + i * 5.5, 5.0, 0, 1.2, 7.2, 14.0, S[2], S[1]);
    _r3Box(m, -4.5, 12.4, 0, 13, 1.0, 10.5, O[0], O[2]);           /* ore heaped in it */
    _r3Box(m, -4.5, 12.9, -1.5, 8, 0.8, 5.0, O[1], O[2]);
    _r3Slab(m, 8.0, 5.0, 0, 8, 7.5, 11.5, 1.0, VH[0], VH[1]);      /* cab */
    _r3Box(m, 11.6, 8.0, 0, 1.6, 3.4, 8.4, RTS_PAL.glass, RTS_PAL.glass);
    _r3Box(m, 8.0, 12.6, 0, 6.5, 0.9, 9.5, TM[1], TM[3]);          /* cab roof */
    _r3Box(m, 14.5, 0.8, 0, 4.5, 2.6, 15.5, DK[1], DK[3]);         /* intake blade */
    for (i = 0; i < 5; i++)                                        /* cutter teeth */
      _r3Box(m, 16.6, 0.8, -6 + i * 3, 1.6, 2.0, 1.4, S[1], S[0]);

  } else {
    _r3Box(m, 0, 0, -5, 15, 3.5, 4, DK[0], DK[1]);
    _r3Box(m, 0, 0, 5, 15, 3.5, 4, DK[0], DK[1]);
    _r3Box(m, 0, 2.5, 0, 15, 4, 8, TM[0], TM[1]);
    _r3Box(m, 4, 6, 0, 8, 1.4, 1.4, DK[1], DK[3]);
  }

  var sc = _sprUnitScale(key);
  return sc === 1 ? m : _r3Scale(m, sc);
}
/* How much to shrink a unit to land it on RTS_UNIT_SPAN. Measured once per key from the
   UNSCALED model - the memo is seeded with 1 first, so the _sprUnitModel call below reads that
   and returns raw geometry instead of recursing. The union of every variant is measured, not
   just the default one, so a prone squad and a turret half both end up on the same scale. */
var _RTS_USCALE = {};
function _sprUnitScale(key) {
  if (_RTS_USCALE[key] != null) return _RTS_USCALE[key];
  _RTS_USCALE[key] = 1;
  var models = [_sprUnitModel(key, 'player', false, null)];
  if (rtsUnitDef(key).kind === 'infantry') models.push(_sprUnitModel(key, 'player', true, null));
  var raw = _r3FitSize(models, 2), want = RTS_UNIT_SPAN[key];
  return (_RTS_USCALE[key] = (want && raw > 0) ? want / raw : 1);
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
/* How many facings a unit is baked at. Red Alert uses THIRTY-TWO for vehicles and eight for
   infantry - `Facings: 32, UseClassicFacings: True` against a plain `Facings: 8` throughout
   mods/ra/sequences. We were baking eight for everything, which is why a tank turning in the
   original sweeps round while ours popped through 45-degree steps. Infantry really are eight in
   the original, so they stay eight; the cost is paid only where it shows. */
function _sprFacingsFor(d) { return d.kind === 'infantry' ? 8 : 32; }
function _sprFacings(key) { return _sprFacingsFor(rtsUnitDef(key)); }

function _sprUnit(key, side, prone, part) {
  if (typeof _rtsArtReady === 'function' && _rtsArtReady()) {
    var real = _mixUnit(key, side, prone, part);
    if (real) return real;
  }
  var m = _sprUnitModel(key, side, prone, part), size = _sprUnitFit(key, side);
  var frames = [], N = _sprFacings(key);
  for (var f = 0; f < N; f++) {
    var cv = _r3BakeCentred(_r3Yaw(m, -f / N * Math.PI * 2), size);
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
      if (RTS_TURRETED[d.key]) {
        /* A turreted unit is only ever DRAWN as hull + turret, so baking the combined body as
           well was pure waste - 32 canvases per unit per side that nothing referenced. `unit`
           aliases the hull instead of duplicating it. */
        S.hull[side][d.key] = _sprUnit(d.key, side, false, 'hull');
        S.turret[side][d.key] = _sprUnit(d.key, side, false, 'turret');
        S.unit[side][d.key] = S.hull[side][d.key];
      } else {
        S.unit[side][d.key] = _sprUnit(d.key, side);
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
