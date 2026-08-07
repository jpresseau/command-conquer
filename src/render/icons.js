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
function _rtsMakeIcons(side) {
  var S = _rtsSprites(), out = {}, i;
  function plate(src, pad) {
    /* 128, not 64. The tile displays these at about 103px, so a 64px plate was being blown up
       1.6x by CSS - and worse, the sprite was nearest-neighbour DOWNSCALED into it first (a
       72px building squeezed to 52), which drops pixels irregularly and is what made the
       cameos look chewed rather than merely soft. Building at 128 means the sprite is never
       reduced and the browser's final fit is a downscale, which is the direction that is
       forgiving. */
    var n = 160, t = _sprMake(n, n), g = t.g;
    g.imageSmoothingEnabled = false;
    var grd = g.createLinearGradient(0, 0, 0, n);
    grd.addColorStop(0, '#2b3a4c'); grd.addColorStop(1, '#131b25');
    g.fillStyle = grd; g.fillRect(0, 0, n, n);
    /* 160 is not arbitrary: the largest building sprite is 72px, and 72*2 + 8*2 of padding is
       exactly 160. One size smaller and the biggest cameos fall back to 1x and end up drawn
       SMALLER than the 64px plate managed, which is how the first attempt at this traded
       sharpness for size. */
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
