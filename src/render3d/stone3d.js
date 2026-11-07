/* render3d/stone3d.js - rock is stone. Part of rts.render3d.

   The ridges are turned, tapered slabs and split crystals (world3d.js), each face one flat grey.
   Seen up close at a phone's zoom they read as grey prisms - ice, or concrete - because nothing
   on a face said stone: no bedding, no grain, no weather. Stone shows how it was laid down and
   what has grown on it since, so a rock face here takes:

   - BEDDING: bands along its height, lighter and darker by turns, with a fine dark line where one
     layer meets the next. Tilted a little and differently from ridge to ridge, as strata lie, and
     on the walls rather than the tops.
   - GRAIN: a mottle of two noises at two scales, so a face is never one flat tone.
   - WARM AND COLD: iron stains and grey by a slow noise across the ridge, where every slab was a
     cool grey and a ridge was blue-violet in the sky's fill.
   - LICHEN on what faces up: olive patches on the tops and ledges.

   Only the world batch's rock (uStone, scene3d.js - not the ore, the dressing or the scenery,
   and not on the low tier), found by its colour: rock is the palette's greys (world3d.js R3D_ROCK, saturation under a
   tenth), where bark and leaves are browns and greens at four tenths and more. Faded by the
   device pixels a world unit (R3D_STONE_FADE), so a view drawn back is not a shimmer of lines.
   R3.stoneAmt = 0 is the before-picture. */

var R3D_STONE_FADE = [4.0, 9.0];     /* device pixels a world unit: whole from the second */
var R3D_STONE_SAT = 0.14;            /* rock is greyer than this; bark and leaves are not */
var R3D_STONE_BUMP = 0.42;           /* how far the relief tilts a face's normal */

/* uStone is (on, device pixels a world unit). _stoneK is how much of a face is stone: its own
   colour al grey enough, the view near enough, the world batch's. _stoneN roughens its normal -
   gradient noise on the face's own plane, stretched along the height so the relief runs with
   the beds - which is what the light reads first. _stone then colours it: c is the face as lit
   with that normal, n the normal, p its world position (x, height, z). */
var R3D_STONE_GLSL =
  'uniform vec2 uStone;' +
  'float _stoneK(vec3 al){' +
  '  float mx = max(max(al.r, al.g), al.b), sat = (mx - min(min(al.r, al.g), al.b)) / max(mx, 0.01);' +
  '  return uStone.x * smoothstep(' + R3D_STONE_FADE[0].toFixed(1) + ', ' + R3D_STONE_FADE[1].toFixed(1) + ', uStone.y) *' +
  '         (1.0 - smoothstep(' + (R3D_STONE_SAT * 0.7).toFixed(3) + ', ' + R3D_STONE_SAT.toFixed(3) + ', sat)); }' +
  'vec3 _stoneN(vec3 n, vec3 p, float k){' +
  '  vec3 a = abs(n); vec2 q; vec3 g1, g2;' +
  '  if (a.y > 0.6) q = p.xz; else if (a.x > a.z) q = vec2(p.z, p.y * 1.6); else q = vec2(p.x, p.y * 1.6);' +
  '  g1 = _gnd(q * 2.1); g2 = _gnd(q * 5.6 + 11.0);' +
  '  vec2 gr = g1.yz + g2.yz * 0.45;' +
  '  vec3 t = a.y > 0.6 ? vec3(gr.x, 0.0, gr.y) : (a.x > a.z ? vec3(0.0, gr.y, gr.x) : vec3(gr.x, gr.y, 0.0));' +
  '  return normalize(n - t * ' + R3D_STONE_BUMP.toFixed(2) + ' * k); }' +
  'vec3 _stone(vec3 c, vec3 n, vec3 p, float k){' +
  '  vec3 s = c;' +
  /* warm and cold, across the ridge */
  '  float wc = smoothstep(0.30, 0.75, _vn(p.xz * 0.09 + p.y * 0.04 + 31.0));' +
  '  s *= mix(vec3(0.93, 0.97, 1.04), vec3(1.10, 1.00, 0.84), wc);' +
  /* bedding: a band's height tilted by a slow noise, so strata dip and differ ridge to ridge */
  '  float wall = 1.0 - smoothstep(0.55, 0.85, abs(n.y));' +
  '  float dip = (_vn(p.xz * 0.045 + 7.0) - 0.5) * 0.25;' +
  '  float sy = p.y * 1.35 + dot(p.xz, vec2(dip, -0.6 * dip)) + _vn(p.xz * 0.35) * 0.5;' +
  '  float band = _vn(vec2(sy, dot(p.xz, vec2(0.04, 0.03))));' +
  /* a seam between two beds, at only some of them, and faint */
  '  float fl = fract(sy * 0.5), seam = step(0.62, _h2(vec2(floor(sy * 0.5), 3.7)));' +
  '  float line = seam * (1.0 - smoothstep(0.01, 0.05, min(fl, 1.0 - fl)));' +
  '  s *= mix(1.0, (0.88 + 0.24 * band) * (1.0 - 0.16 * line), wall);' +
  /* grain */
  '  float g = _vn(p.xz * 1.9 + p.y * 1.3) * 0.6 + _vn(p.zx * 5.3 - p.y * 3.7) * 0.4;' +
  '  s *= 0.90 + 0.20 * g;' +
  /* lichen on what faces up */
  '  float li = smoothstep(0.42, 0.78, n.y) * smoothstep(0.40, 0.62, _vn(p.xz * 0.8 + 3.0) * 0.7 + _vn(p.xz * 2.7) * 0.3);' +
  '  s = mix(s, s * vec3(0.80, 0.98, 0.58), li * 0.75);' +
  '  return mix(c, s, k); }';
