/* mixart/remap.js - recolouring a side by rewriting a palette range. Part of rts.mixart. */

/* --------------------------------------------------------------- remapping --
   RA recolours a player's units by rewriting a RANGE of palette entries rather than by tinting
   the sprite - indices 80..95 are the team block, and every unit's artwork is drawn using them
   wherever it wants to show ownership. That is why the vehicles come out of the archive gold
   and green: those are the unremapped slots.

   Rebuilding the block from our own team colour keeps the original's shading intact - the ramp
   inside the block is preserved, only its hue moves - which is what a naive per-pixel tint
   destroys. */
var RTS_REMAP_LO = 80, RTS_REMAP_HI = 95;

function _mixTeamPal(base, hex) {
  var pal = new Uint8Array(base);
  var t = _sprCol(hex);
  for (var i = RTS_REMAP_LO; i <= RTS_REMAP_HI; i++) {
    /* position within the block, 0 = lightest in RA's ordering */
    var f = (i - RTS_REMAP_LO) / (RTS_REMAP_HI - RTS_REMAP_LO);
    /* a ramp from near-white through the team colour to near-black, matching how the block is
       used: highlights at the top, shadow at the bottom */
    var k = f < 0.5 ? (1 - f * 2) : 0, d = f < 0.5 ? 0 : (f - 0.5) * 2;
    for (var c = 0; c < 3; c++) {
      var v = t[c] * (1 - d) + 0 * d;         /* darken toward the bottom of the ramp */
      v = v + (255 - v) * k * 0.75;           /* lighten toward the top */
      pal[i * 3 + c] = Math.max(0, Math.min(255, Math.round(v)));
    }
  }
  return pal;
}

/* A SHP frame is palette indices; index 0 is transparent. RA also reserves index 4 for the
   drop shadow, which is drawn as translucent black rather than as a palette colour - painting
   it literally puts a hard green blob under every unit. */
var RTS_SHADOW_INDEX = 4;

function _mixFrameToCanvas(fr, w, h, pal) {
  var cv = _sprMake(w, h), g = cv.g;
  var img = g.createImageData(w, h), d = img.data;
  for (var i = 0; i < w * h; i++) {
    var v = fr[i], o = i * 4;
    if (v === 0) { d[o + 3] = 0; continue; }
    if (v === RTS_SHADOW_INDEX) { d[o] = 0; d[o + 1] = 0; d[o + 2] = 0; d[o + 3] = 90; continue; }
    d[o] = pal[v * 3]; d[o + 1] = pal[v * 3 + 1]; d[o + 2] = pal[v * 3 + 2]; d[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return cv.c;
}

function _mixShp(name) {
  var i, a;
  for (i = 0; i < RTS_MIX.want.length; i++) {
    a = RTS_MIX.open[RTS_MIX.want[i]];
    if (a && !a.error && a.has(name)) {
      var s = window.RA_SHP.shpOpen(a.read(name));
      if (!s.error) return s;
    }
  }
  return null;
}

function _rtsArtReady() { return !!(RTS_MIX.ready && RTS_MIX.pal); }

