/* render/icons.js - radar blips, the placement ghost, resize/dispose, and sidebar icons.
   Part of rts.render, which owns every pixel. */

/* ------------------------------------------------------------ radar icons --
   CONQUER.CPP's Get_Radar_Icon builds a radar blip by DOWNSAMPLING THE REAL SHAPE - three
   samples per map cell, each taking the first non-transparent pixel found across a nine-tap
   offset kernel, so a thin feature does not drop out between samples. That is why structures
   are recognisable on the original's radar instead of being coloured blocks, which is what
   these were.

   Built once per structure type on first use. */
var _RTS_RICON = null;
function _rtsRadarIcon(key, side) {
  if (!_RTS_RICON) _RTS_RICON = {};
  var ck = key + ':' + side;
  if (_RTS_RICON[ck]) return _RTS_RICON[ck];
  var OFFX = [0, 0, -1, 1, 0, -1, 1, -1, 1], OFFY = [0, 0, -1, 1, 0, -1, 1, -1, 1];
  var def = rtsStructDef(key), spr = _rtsSprites().bld[side][key];
  var Z = 3, W = def.w * Z, H = def.h * Z;
  var src = spr.c.getContext('2d').getImageData(0, 0, spr.c.width, spr.c.height).data;
  var sw = spr.c.width;
  var t = _sprMake(W, H), g = t.g;
  for (var iy = 0; iy < H; iy++) {
    for (var ix = 0; ix < W; ix++) {
      /* Sample the footprint only - the headroom above it belongs to no tile. */
      var bx = Math.round((ix + 0.5) * RTS_TS / Z);
      var by = spr.head + Math.round((iy + 0.5) * RTS_TS / Z);
      for (var n = 0; n < 9; n++) {
        var qx = bx - OFFX[n], qy = by - OFFY[n];
        if (qx < 0 || qy < 0 || qx >= sw) continue;
        var o = (qy * sw + qx) * 4;
        if (src[o + 3] < 128) continue;
        g.fillStyle = 'rgb(' + src[o] + ',' + src[o + 1] + ',' + src[o + 2] + ')';
        g.fillRect(ix, iy, 1, 1);
        break;
      }
    }
  }
  _RTS_RICON[ck] = t.c;
  return t.c;
}

/* ------------------------------------------------------------ placement ghost */
function _rtsGhostShow(key) {
  _rtsR.ghost = { tx: 0, tz: 0, ok: false, side: 'player' };
  _rtsR.ghostKey = key;
}
function _rtsGhostHide() { if (_rtsR) { _rtsR.ghost = null; _rtsR.ghostKey = null; } }
function _rtsGhostMove(tx, tz, ok) {
  if (!_rtsR.ghost) return;
  _rtsR.ghost.tx = tx; _rtsR.ghost.tz = tz; _rtsR.ghost.ok = ok;
}

function _rtsRResize(W, H) {
  var R = _rtsR;
  if (!R) return;
  R.W = W; R.H = H;
  R.cv.width = Math.round(W * R.dpr); R.cv.height = Math.round(H * R.dpr);
  R.g.imageSmoothingEnabled = false;
  _rtsApplyCam();
}
function _rtsRDispose() {
  if (_rtsR && _rtsR.terrain) { _rtsR.terrain.width = 1; _rtsR.terrain.height = 1; }  /* 2688^2 is ~29 MB */
  /* _RTS_UFIT caches a measured canvas size per unit type. It is pure geometry, so it would
     survive a dispose harmlessly - but a harness that pokes R3_K between runs would then bake
     into stale squares, so it dies with the rest of the sprite cache. */
  _rtsR = null; _RTS_SPR = null; _RTS_UFIT = {};
}

/* ------------------------------------------------------------- sidebar icons --
   The sprites already are the artwork, so an icon is just the sprite on a dark plate. */

/* The plate size, MEASURED from the sprites rather than written down. A literal here has gone
   stale once already - it was derived from a 72px largest building and RTS_PS then doubled
   every procedural bake under it, which silently put ten of twenty-six cameos back onto the
   nearest-neighbour downscale path the literal existed to escape. Reading the sprites means
   the plate follows the art, whatever density it is baked at.

   Rounded up to a multiple of 16 so the value moves in visible steps rather than jittering by
   a pixel whenever a model's silhouette changes, and floored at the old 160 so a hypothetical
   small-sprite set cannot shrink the cameos. */
function _rtsIconPlate(S, side) {
  var big = 0, i, c;
  for (i = 0; i < RTS_STRUCTS.length; i++) {
    c = S.bld[side][RTS_STRUCTS[i].key];
    if (c && c.c) big = Math.max(big, c.c.width, c.c.height);
  }
  for (i = 0; i < RTS_UNITS.length; i++) {
    c = S.unit[side][RTS_UNITS[i].key];
    if (c && c[6]) big = Math.max(big, c[6].width, c[6].height);
  }
  return Math.max(160, Math.ceil((big + 16) / 16) * 16);
}

function _rtsMakeIcons(side) {
  var S = _rtsSprites(), out = {}, i;
  function plate(src, pad) {
    /* The plate must never REDUCE the sprite. A cameo is drawn with smoothing off so the
       artwork keeps its hard pixel edges, and nearest-neighbour reduction drops source pixels
       irregularly - which is the "chewed" look, distinct from merely soft.

       This has now been wrong twice for the same reason, and the sizing is derived rather than
       chosen so it cannot rot a third time. The note that replaced 64 with 160 justified it as
       "the largest building sprite is 72px, and 72*2 + 8*2 = 160" - true when it was written,
       and stale the moment RTS_PS doubled every procedural bake. Measured against the actual
       sprites afterwards, ten of twenty-six cameos were being downscaled: the Construction
       Yard at 0.661, Advanced Power 0.712, Power 0.751, Refinery 0.800.

       So the plate is sized from the sprites themselves at load. `_rtsIconPlate` walks every
       structure and unit sprite this side will show, takes the largest dimension, and returns
       a plate big enough to hold it at 1:1 with padding - so the scale below can never fall
       under 1 no matter what RTS_PS becomes. */
    var n = _rtsIconPlate(S, side), t = _sprMake(n, n), g = t.g;
    g.imageSmoothingEnabled = false;
    var grd = g.createLinearGradient(0, 0, 0, n);
    grd.addColorStop(0, '#2b3a4c'); grd.addColorStop(1, '#131b25');
    g.fillStyle = grd; g.fillRect(0, 0, n, n);
    var m = n - (pad || 8) * 2;
    /* Whole-number scaling only. A pixel-art sprite enlarged by 1.7 gives some source pixels two
       screen pixels and others one, which reads as a wobble along every straight edge; clamping
       to an integer keeps them uniform. Below 1 there is nothing to clamp to. */
    var sc = Math.min(m / src.width, m / src.height);
    sc = sc >= 1 ? Math.floor(sc) : sc;
    var w = Math.round(src.width * sc), h = Math.round(src.height * sc);
    g.drawImage(src, Math.round((n - w) / 2), Math.round((n - h) / 2), w, h);
    return t.c.toDataURL('image/png');
  }
  for (i = 0; i < RTS_STRUCTS.length; i++) out[RTS_STRUCTS[i].key] = plate(S.bld[side][RTS_STRUCTS[i].key].c, 6);
  for (i = 0; i < RTS_UNITS.length; i++) out[RTS_UNITS[i].key] = plate(S.unit[side][RTS_UNITS[i].key][6], 14);
  return out;
}
