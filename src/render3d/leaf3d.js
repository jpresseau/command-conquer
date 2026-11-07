/* render3d/leaf3d.js - a canopy is leaves. Part of rts.render3d.

   The trees are built of facets (forest3d.js): whorls of needles and lumpy broadleaf crowns, each
   facet one flat green. From the camera at a phone's zoom a wood read as painted card beside the
   grass, which is textured to the blade: nothing on a crown said leaves. So a face of the world
   batch that is green - needles, leaves and the tufts - takes:

   - A LEAFY RELIEF (_leafN): two octaves of gradient noise tilt its normal before it is lit, so the
     light breaks up across a facet into the dapple of a mass of leaves instead of lying on it as
     one tone - in the sun far more than in the shade, as relief does.
   - CLUMPS: lighter and darker by a noise a little over a leaf-cluster across, the gaps between
     clusters darker.
   - SUNLIT TIPS: the lightest of the clumps a warmer yellow-green.

   Found by colour, as the stone is (stone3d.js): green over red and blue by more than R3D_LEAF_G,
   which the bark (brown), the rock (grey) and the ore (gold) are not. Only the world's own batches
   and not on the low tier, as the stone - its own switch in the stone's uniform (uStone.z,
   scene3d.js), so either can be taken out without the other; faded by the device pixels a world
   unit (R3D_STONE_FADE), so a view drawn back is not a shimmer. R3.leafAmt = 0 is the
   before-picture. */

var R3D_LEAF_G = [0.03, 0.08];       /* green over red and blue: none below the first, whole from the second */
var R3D_LEAF_BUMP = 0.5;             /* how far the leafy relief tilts a facet's normal */

var R3D_LEAF_GLSL =
  'float _leafK(vec3 al){' +
  '  float gr = al.g - max(al.r, al.b);' +
  '  return uStone.z * smoothstep(' + R3D_STONE_FADE[0].toFixed(1) + ', ' + R3D_STONE_FADE[1].toFixed(1) + ', uStone.y) *' +
  '         smoothstep(' + R3D_LEAF_G[0].toFixed(3) + ', ' + R3D_LEAF_G[1].toFixed(3) + ', gr); }' +
  'vec3 _leafN(vec3 n, vec3 p, float k){' +
  '  vec3 a = abs(n); vec2 q;' +
  '  if (a.y > 0.6) q = p.xz; else if (a.x > a.z) q = p.zy; else q = p.xy;' +
  '  vec3 g1 = _gnd(q * 2.6), g2 = _gnd(q * 6.3 + 17.0);' +
  '  vec2 gr = g1.yz + g2.yz * 0.6;' +
  '  vec3 t = a.y > 0.6 ? vec3(gr.x, 0.0, gr.y) : (a.x > a.z ? vec3(0.0, gr.y, gr.x) : vec3(gr.x, gr.y, 0.0));' +
  '  return normalize(n - t * ' + R3D_LEAF_BUMP.toFixed(2) + ' * k); }' +
  'vec3 _leaf(vec3 c, vec3 n, vec3 p, float k){' +
  '  float cl = _vn(p.xz * 1.3 + vec2(p.y * 0.9, -p.y * 0.7)) * 0.7 + _vn(p.zx * 3.1 + p.y * 2.3) * 0.3;' +
  '  vec3 s = c * (0.80 + 0.34 * cl);' +
  '  s = mix(s, s * vec3(1.10, 1.07, 0.80), smoothstep(0.58, 0.85, cl) * 0.6);' +
  '  return mix(c, s, k); }';
