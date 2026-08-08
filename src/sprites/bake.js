/* sprites/bake.js - the palette, and the plumbing every baked sprite goes through:
   canvases, shadows, outlines. Part of rts.sprites, the sprite baker. */

/* RED ALERT - sprite generation: terrain, ore, effects, and the palette everything uses.

   The structures and units are NOT drawn here - they are 3D models, defined further down
   and rendered to sprites once at load by src/r3d. That is how the originals were made,
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
  /* CONCRETE, and it is the most load-bearing ramp in the game - about half the roster is
     built from nothing else. It used to span luminance 107..181 at a saturation of 0.06: a
     74-step band of dead grey. Every part of a model painted from it landed in the same
     shading band, so the geometry stopped reading - the shipyards have an apron, a shed, a
     roof, a slipway, a gantry, a mast and a dockside crate, and measured 62 distinct tones
     across 5,800 pixels, which is a rectangle. Compare brick (span 68 at saturation 0.45) and
     sand (82 at 0.30): those two buildings are the ones that read, and it is not because they
     have more geometry.
     Now 78..205 with a slight tilt - the shadow side cool and green, the top warm - so a face
     turned away from the light differs from one facing it by more than a rounding error. */
  conc:  ['#7e837a', '#a2a89b', '#4a4f48', '#c9cebd'],
  /* Steel was the same fault in blue: span 92, and everything girder-shaped merged into its
     own shadow. Widened at both ends, the darks kept cool. */
  steel: ['#59616d', '#757e8e', '#343a44', '#939db0'],
  /* Gun tubes get their own ramp. `steel` is a blue grey - fine for girders and hubs, but it
     was measurably tinting the guns: an artillery piece came out 45% blue pixels with a hull
     that carried no team colour at all. Gunmetal is neutral-warm and leaves the blue budget
     to the parts that are meant to signal ownership. */
  gun:   ['#6e6a60', '#847f72', '#4b4842', '#9b9588'],
  /* DARK spanned luminance 38..82 - a 44-step band, the narrowest ramp in the file, and the
     War Factory and Airfield are built from almost nothing else. Ribbing the factory's roof
     moved it from one flat plane to a saw-tooth and its distinct-tone count barely shifted,
     because every rib was landing in the same two shades. Widened to 31..108.
     Kept NEUTRAL, and that was a correction: the first widening reached for a bluer top tone
     and took the War Factory from 34% to 50% blue-dominant pixels. Blue creep is a fault this
     roster has already been dragged back from once - 66% to 13% - and a wider ramp is not
     worth reopening it. Same span, almost no hue. */
  dark:  ['#3a3d40', '#4f545a', '#1d1f22', '#666d75'],
  glass: '#8fbcd4',
  lit:   '#ffd98a',
  hazard:['#c9a227', '#2a2a26'],
  /* The Tesla Coil's arc. Pale blue-white, and deliberately the only thing on the battlefield
     lit this colour - a Soviet defensive line should be identifiable at a glance, and the head
     going dark is what tells you the power is out. */
  spark: ['#bfe6ff', '#7fc4ff', '#e8f6ff'],
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
    /* Pale block: same widening. The Tech Centre is the tallest building in the game and was
       measuring 0.10 saturation over 70 tones - a white slab with a stripe. */
    pale:  ['#a0a696', '#c3c9b6', '#6e746a', '#dee3d0']
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

