/* render/detail.js - the ground's high-frequency grain, added back at magnification.
   Part of rts.render, which owns every pixel.

   THE GROUND IS BAKED AT 24 PIXELS A CELL AND CAN NEVER BE BAKED AT MORE. That is not a
   preference, it is arithmetic: the bake is one canvas of RTS_N * RTS_TS square, it costs a
   measured 164 nanoseconds a pixel, and doubling its density means 6144 square - 144 MB of
   RGBA and a 6.2 second bake. Neither is survivable on a phone, so the density is fixed and
   the only question is what happens when the screen asks for more than it has.

   What happens is blocks. On a dpr-3 phone at the top zoom a cell covers 144 device pixels
   against 24 baked, a magnification of six, and nearest-neighbour magnification of six turns
   every baked pixel into a 6x6 square of one flat colour. Measured on a 288x288 patch of open
   grass: 29 distinct tones in the whole patch, and a single colour running a median of 12 and
   a mean of 14.7 device pixels before it changed. At arm's length that is not ground, it is
   tiling.

   SO THE MISSING FREQUENCIES ARE PUT BACK RATHER THAN BAKED IN. A detail texture is the
   standard answer to exactly this in 3D engines and it applies unchanged here: the base bake
   supplies colour and large-scale structure, and a small tile of pure high-frequency noise,
   repeated over the view and blended so it modulates luminance without shifting hue, supplies
   the grain the magnification destroyed. It costs 65 KB and one fill.

   THE TILE CARRIES NO LOW FREQUENCIES, which is what stops it reading as a repeat. A 128-pixel
   tile across a 1179-pixel phone repeats nine times, so any structure in it larger than a few
   pixels would be seen nine times and read as wallpaper. The noise here is built at a 4- and
   8-pixel scale - both of which divide the tile, so it wraps seamlessly - and then high-passed - the local mean is subtracted - so what is left has
   no shape bigger than a few pixels for the eye to find and lock onto.

   IT IS ANCHORED TO THE WORLD, NOT THE SCREEN. The pattern is offset by the camera so the
   grain sits still on the ground while the view moves over it. Anchored to the screen it would
   swim during a pan, which is far more obvious than the blocks it replaces.

   AND IT ONLY RUNS WHEN THE GROUND IS ACTUALLY BEING MAGNIFIED. At or below one device pixel
   per baked pixel there are no missing frequencies to restore and the pass is skipped, so the
   wide zooms - where the ground is already dense and the fill would cost the most screen - pay
   nothing at all. */

var RTS_DETAIL_TILE = 128;        /* pixels square; 9 repeats across a phone, 65 KB */
var RTS_DETAIL_SCALE = 4;         /* feature size in tile pixels; MUST divide the tile */
var RTS_DETAIL_MIN_MAG = 1.5;     /* below this the ground is not magnified enough to need it */
var RTS_DETAIL_ALPHA = 0.22;      /* grain, not pattern - see the note on the weave below */
/* HOW THE TILE IS COMPOSITED, and the reason it is a variable rather than a literal.

   `overlay` is the natural blend for grain and it is the expensive one. This tile does not need
   it: it encodes lighten-or-darken per pixel in its own colour and strength in its alpha, so a
   plain source-over produces the same picture for a fraction of the fill cost. That claim used
   to be defended by two numbers written into a comment - overlay 7.06 ms, soft-light 10.38 -
   measured once, on a machine nobody has any more, and no longer checkable by anything.

   e2e/grain now prices the alternative itself by pointing this at 'overlay' for a few frames
   and timing both. A number a test can re-measure is worth more than a number a comment
   remembers. Nothing in the game ever assigns to it. */
var RTS_DETAIL_OP = 'source-over';
var _RTS_DETAIL = null;
var _RTS_DETAIL_PAT = null;      /* {g, pat} - a pattern belongs to the context that made it */

/* THE TILE CARRIES ITS STRENGTH IN ALPHA, NOT IN GREY, so the composite can be a plain one.

   The obvious build is a neutral-grey tile blended with `overlay`, which modulates luminance
   around mid-grey and leaves hue alone. It looks right and it costs too much: measured in a
   real frame at 1179x1656, `overlay` adds 7.06 ms, `multiply` 8.48 and `soft-light` 10.38,
   against a 16.7 ms budget already carrying 8 ms of game. Plain `source-over` adds 3.74.

   So the same picture is built out of source-over instead. Each pixel is WHITE where the noise
   is above its mean and BLACK where it is below, and the deviation goes into ALPHA - so a
   light pixel lightens the ground and a dark one darkens it, per pixel, with no grey veil in
   between. A flat grey tile at low alpha would wash the whole map toward grey; this cannot,
   because where the noise is neutral the tile is fully transparent.

   Deterministic, like everything else that must survive a reload. */
function _rtsDetailTile() {
  if (_RTS_DETAIL) return _RTS_DETAIL;
  var T = RTS_DETAIL_TILE, t = _sprMake(T, T);
  var img = t.g.createImageData(T, T), d = img.data;
  /* THREE OCTAVES, AND THE REASON IS A VISIBLE WEAVE. Two octaves at 4 and 8 pixels, blended
     at 0.5, put a clear diagonal cross-hatch across every dirt road on the map - value noise
     interpolates between points on an axis-aligned lattice, and two octaves sharing that
     lattice reinforce it rather than hide it. A third octave at 16 spreads the energy over
     enough scales that no single lattice dominates, and the alpha above came down by more
     than half: the job is to break up flat blocks, and the moment the eye can name the
     pattern it has been overdone. Every scale still divides the tile, so it still wraps. */
  var raw = new Float32Array(T * T), sum = 0, i;
  for (var y = 0; y < T; y++) {
    for (var x = 0; x < T; x++) {
      /* WRAPPED, so the tile is seamless: sampling the noise on a torus means the right edge
         and the left edge are the same samples, and a visible seam every 128 pixels would be
         exactly the wallpaper this is trying to avoid. */
      var v = _sprVNWrap(x, y, RTS_DETAIL_SCALE, 9001, T) * 0.45
            + _sprVNWrap(x, y, RTS_DETAIL_SCALE * 2, 9007, T) * 0.33
            + _sprVNWrap(x, y, RTS_DETAIL_SCALE * 4, 9013, T) * 0.22;
      raw[y * T + x] = v; sum += v;
    }
  }
  /* HIGH-PASS: subtract the mean, so the tile is centred on neutral and carries no overall
     lightening or darkening. Without this the pass would tint the entire ground. */
  var mean = sum / (T * T), peak = 0;
  for (i = 0; i < T * T; i++) peak = Math.max(peak, Math.abs(raw[i] - mean));
  if (peak < 1e-6) peak = 1;
  for (i = 0; i < T * T; i++) {
    var dev = (raw[i] - mean) / peak;              /* -1 .. 1, normalised on the real range */
    var lit = dev >= 0 ? 255 : 0;                  /* lighten above the mean, darken below */
    d[i * 4] = lit; d[i * 4 + 1] = lit; d[i * 4 + 2] = lit;
    d[i * 4 + 3] = Math.round(Math.min(1, Math.abs(dev)) * 255);
  }
  t.g.putImageData(img, 0, 0);
  _RTS_DETAIL = t.c;
  return _RTS_DETAIL;
}

/* Lay the grain over the ground already drawn into `g`. `srcX`/`srcY` are the terrain-canvas
   coordinates of the top-left of the view, which is what anchors the pattern to the world. */
function _rtsGroundDetail(g, R, TSscale) {
  /* device pixels per baked terrain pixel - the magnification this exists to answer */
  var mag = TSscale * R.dpr;
  if (mag < RTS_DETAIL_MIN_MAG) return 0;
  /* THE PATTERN IS BUILT ONCE, NOT ONCE A FRAME. It is cached against the context it was made
     for, because a pattern belongs to its context and the context is replaced whenever the
     canvas is resized.

     THE NUMBER THAT USED TO BE HERE IS GONE, because it is no longer true. This said
     createPattern cost a measured 8.3 ms a frame - 8.8 ms to 17.1, straight through the
     budget. Re-measured through e2e/grain with the cache defeated, it now costs nothing that
     rises out of the noise: 3.32 ms against 3.51 for the pass as a whole, which is a difference
     in the wrong direction. The tile itself is cached separately in _RTS_DETAIL, so what was
     being timed was createPattern alone, and whatever made it expensive in that browser is not
     doing so in this one. The cache stays - allocating an object per frame to hand it straight
     back is pointless whatever it costs - but it is no longer load-bearing, and a comment
     asserting 8.3 ms would send the next reader looking for a regression that is not there. */
  if (!_RTS_DETAIL_PAT || _RTS_DETAIL_PAT.g !== g) {
    var made = g.createPattern(_rtsDetailTile(), 'repeat');
    if (!made) return 0;
    _RTS_DETAIL_PAT = { g: g, pat: made };
  }
  var pat = _RTS_DETAIL_PAT.pat;

  /* The grain is drawn at DEVICE resolution, not scaled up with the ground: the whole point is
     to supply detail finer than a magnified baked pixel, and a pattern stretched by `mag`
     would be exactly as blocky as what it is covering. The canvas transform is already scaled
     by dpr, so a 1/dpr scale on the pattern puts one tile pixel on one device pixel. */
  /* World anchoring: the terrain-canvas origin of the view, carried into device pixels and
     wrapped to the tile so the offset stays small and exact. */
  var ox = -((R.focus.x / RTS_TILE + RTS_N / 2) * RTS_TS - (R.W / 2) / TSscale) * mag;
  var oy = -((R.focus.z / RTS_TILE + RTS_N / 2) * RTS_TS - (R.H / 2) / TSscale) * mag;
  var T = RTS_DETAIL_TILE;
  ox = ox - Math.floor(ox / T) * T;
  oy = oy - Math.floor(oy / T) * T;

  g.save();
  /* Plain source-over: the tile already encodes lighten-or-darken per pixel in its own colour
     and alpha, so no blend mode is needed and none of their cost is paid. See RTS_DETAIL_OP. */
  g.globalCompositeOperation = RTS_DETAIL_OP;
  g.globalAlpha = RTS_DETAIL_ALPHA;
  g.setTransform(1, 0, 0, 1, 0, 0);            /* device pixels: one tile pixel per screen pixel */
  g.translate(ox, oy);
  g.fillStyle = pat;
  g.fillRect(-ox, -oy, R.W * R.dpr, R.H * R.dpr);
  g.restore();
  return 1;
}
