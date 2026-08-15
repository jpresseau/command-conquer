/* render3d/light3d.js - the light every mesh in the 3D mode is shaded by, as GLSL.
   Part of rts.render3d.

   Split out of gl3d.js, which the shading pushed past this project's per-file limit. It sits in
   its own file for a better reason than that, though: this IS the one copy of the light, and
   the note below is emphatic that there must not be a second. A file of its own makes that
   harder to undo by accident.

   Loaded BEFORE gl3d.js - the strings here are spliced into the mesh shaders at load time, the
   same arrangement shadow3d.js has.
*/

/* THE SHADING IS THE SPRITE BAKER'S, PORTED - not an approximation of it.

   This shader used to carry a loose imitation of r3d/render.js: one lambert term, its own
   ambient and diffuse constants, and a two-colour mix for the ramp. Measured, that cost the
   3D mode most of its form. The baker computes ambient + diffuse + a sky bounce + a tight
   Blinn-Phong specular and then runs the result through _r3Ramp, whose shadow floor and warm
   highlight are per-channel; the shader had neither the specular nor the sky term, so an
   axis-aligned box resolved to exactly FOUR tones (the four values lambert can take for six
   axis normals) while the same model baked to a sprite carried hundreds. That is why extra
   resolution in 3D did not read as extra detail - there was nothing in the shading for the
   pixels to show.

   Every constant below is read from r3d/primitives.js rather than copied, so the two
   pipelines cannot drift: primitives.js loads first (see the include order in the skeleton),
   and if the light or the ambient split is ever retuned, both renderers move together. */
function _r3dGlsl3(v) {
  return 'vec3(' + v[0].toFixed(6) + ',' + v[1].toFixed(6) + ',' + v[2].toFixed(6) + ')';
}
/* The half-vector the baker builds at r3d/render.js:78, for the same specular. */
var R3D_HALF = (function () {
  var h = [R3_LIGHT[0] + R3_VIEW[0], R3_LIGHT[1] + R3_VIEW[1], R3_LIGHT[2] + R3_VIEW[2]];
  var m = Math.hypot(h[0], h[1], h[2]);
  return [h[0] / m, h[1] / m, h[2] / m];
})();

/* THE SHADING, AS ONE STRING, EVALUATED PER FRAGMENT.

   It used to live in the vertex shader, and that was the ceiling on how round anything in this
   game could look. Two separate reasons, and both had to go:

   The normals were per FACE - every vertex of a face carried that face's own normal - so a
   cylinder was not being interpolated across at all. Shading it once per vertex was shading it
   once per facet. That is fixed where the meshes are built (see R3D_SMOOTH_COS in scene3d.js),
   and once a corner can carry an averaged normal, the shader has to be the thing that reads it
   somewhere other than the corners.

   And the specular is a ^16 Blinn-Phong lobe. A highlight that tight is narrower than the
   faces it lands on, so sampling it at the corners either misses it entirely or smears a whole
   facet with it - it cannot land where the surface actually points at the light.

   The ramp is the sprite baker's _r3Ramp, ported term for term, and it is evaluated TWICE per
   fragment: once with the sun and once without. The fragment picks between them by how much of
   the sun reaches this pixel, which is what the shadow map is for. Multiplying a lit colour
   down instead is the usual shortcut and it is wrong here for a measurable reason - this ramp
   does not pass through the origin. Its floor is per-channel and COOL, so shade slides toward
   blue-grey; a scalar multiply drags it toward black and takes the sky out of every shadow. */
var R3D_MESH_LIGHT =
  /* The ramp itself, because it is now evaluated TWICE per vertex - once with
     the sun and once without it. That is what lets the fragment stage put a shadow on
     a surface: it has the same surface lit and unlit to choose between, so a shadow is
     the shading this material would have in shade rather than a multiply on top of it.
     Multiplying instead is the usual shortcut and it is wrong here for a measurable
     reason - this ramp does not pass through the origin. Its floor is per-channel and
     COOL, so shade slides toward blue-grey; a scalar multiply drags it toward black and
     takes the sky out of every shadow on the map. */
  'vec3 _ramp(vec3 col, float v){' +
  '  float k = clamp(v, 0.0, 1.0);' +
  '  vec3 shade = col * (vec3(0.30, 0.32, 0.38) + vec3(0.70, 0.68, 0.62) * k)' +
  '             + vec3(7.0, 10.0, 21.0) / 255.0 * (1.0 - k);' +
  '  shade += (vec3(255.0, 250.0, 228.0) / 255.0 - col) * clamp(v - 1.0, 0.0, 1.0) * 0.60;' +
  '  return shade;' +
  '}' +
  'vec3 _shade(vec3 n, vec3 col){' +
  /* the sprite baker's own light and half-vector, so the two pipelines agree face for face */
  '  float lam = max(dot(n, ' + _r3dGlsl3(R3_LIGHT) + '), 0.0);' +
  '  float sp = max(dot(n, ' + _r3dGlsl3(R3D_HALF) + '), 0.0);' +
  '  sp *= sp; sp *= sp; sp *= sp; sp *= sp;' +      /* ^16, the baker's tight highlight */
  /* a touch of sky bounce so upward faces do not go dead in shadow - r3d/render.js:97 */
  '  float sky = 0.10 * max(n.y, 0.0);' +
  '  float v = min(' + R3_AMB.toFixed(4) + ' + ' + R3_DIF.toFixed(4) +
      ' * lam + sky + 0.16 * sp, 1.10);' +
  '  float vs = min(' + R3_AMB.toFixed(4) + ' + sky, 1.10);' +
  '  return mix(_ramp(col, vs), _ramp(col, v), _shadowAt());' +
  '}';
