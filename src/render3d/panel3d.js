/* render3d/panel3d.js - a building is built of panels. Part of rts.render3d.

   Seen from above at a phone's zoom, a building's roof and walls were each one flat colour: the
   weathering (weather3d.js) is fine noise, and fades as the view draws back so it does not
   shimmer, so what was left at the zoom a phone opens on was painted card. A built thing is
   sheets and slabs: walls of precast panels or cladding, roofs of decking. So a building's flat
   walls and roofs are divided into panels here, each a shade lighter or darker than its
   neighbour, with a faint seam between - large enough to read at a phone's opening zoom.

   IN THE BUILDING'S OWN FRAME (vMd, the model-space position, scaled), not the world's, so the
   panels line up with the building's corners and centre line wherever it stands. Only faces
   square to it - an upright wall facing along x or z, or a roof - take them: a curve, a dome, a
   bevel and a sloped roof are left as they were, since a grid laid across a curve is a pattern,
   not a building. Not glass, which has its own job (meshfs3d.js, lit windows), and not anything
   but a building (uBld): units and the world batch are untouched.

   FADED BY THE PIXELS A PANEL GETS (uPxW, device pixels a world unit, cam3d.js) rather than by
   the zoom alone: on a dense phone a panel is wide enough to read further out than on a laptop.
   R3.panelAmt = 0 is the before-picture (it zeroes uPxW). */

var R3D_PANEL_W = 2.0;           /* a wall panel's width and height, world units */
var R3D_PANEL_H = 1.6;
var R3D_ROOF_P = 2.4;            /* a roof sheet, square */
var R3D_PANEL_SEAM = 0.035;      /* half the width of the seam between two, world units */
/* device pixels a panel spans, from gone to whole. A phone opens at 24 px a world unit and goes
   no wider than 12, so its wall panels are 19 px and up and always whole; a 1x laptop opens at
   6 (its walls faint, its roofs whole) and at its widest, 3, a panel is a few pixels whose seam
   would shimmer as the view moves - there they are gone. */
var R3D_PANEL_FADE = [7.0, 12.0];

var R3D_PANEL_GLSL =
  'varying vec3 vMd; uniform float uPxW;' +
  'float _phash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }' +
  /* k for a grid of cells sized `sz` at `q` (world units): the cell's own tone times its seam */
  'float _pgrid(vec2 q, vec2 sz, float salt, float tk, float sk) {' +
  '  vec2 g = q / sz, ds = (0.5 - abs(fract(g) - 0.5)) * sz;' +
  '  float fade = smoothstep(' + R3D_PANEL_FADE[0].toFixed(1) + ', ' + R3D_PANEL_FADE[1].toFixed(1) + ', min(sz.x, sz.y) * uPxW);' +
  '  float seam = 1.0 - smoothstep(' + R3D_PANEL_SEAM.toFixed(3) + ', ' + R3D_PANEL_SEAM.toFixed(3) + ' + 1.0 / max(uPxW, 0.01), min(ds.x, ds.y));' +
  '  return (1.0 + (_phash(floor(g) + salt) - 0.5) * tk * fade) * (1.0 - seam * sk * fade); }' +
  'vec3 _panels(vec3 c, vec3 n) {' +
  '  if (uPxW <= 0.0) return c;' +
  '  vec3 an = abs(n);' +
  '  if (an.y < 0.3 && max(an.x, an.z) > 0.92) {' +
  '    vec2 q = vec2(an.x > an.z ? vMd.z : vMd.x, vMd.y);' +
  '    return c * _pgrid(q, vec2(' + R3D_PANEL_W.toFixed(2) + ', ' + R3D_PANEL_H.toFixed(2) + '), an.x > an.z ? 17.0 : 3.0, 0.08, 0.16);' +
  '  }' +
  '  if (n.y > 0.92) return c * _pgrid(vMd.xz, vec2(' + R3D_ROOF_P.toFixed(2) + '), 41.0, 0.06, 0.12);' +
  '  return c; }';
