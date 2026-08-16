/* render3d/place3d.js - how a model is stood in the world: the ground it leans on.
   Part of rts.render3d.

   The terrain got relief and everything on it kept standing bolt upright. Measured over a
   running match, the steepest ground under a unit runs at 0.228 - so a hull three units wide
   has one side 0.69 world units off the ground and the other buried by the same, about a third
   of a tank's own height - and 19% of the map's open, passable ground is steep enough to
   matter. A tank on a ramp had one track in the air.

   SHARED BY THE MAIN PASS AND THE SUN'S, for exactly the reason the swell is (see wave3d.js):
   anything that moves a vertex in one program and not the other detaches a shadow from the
   thing casting it. Both splice this same text, and e2e/shadows checks that they do.

   THE MINIMAL ROTATION, not a basis built from an arbitrary reference direction. Taking the
   model's up to the ground's normal has a one-parameter family of answers - any of them
   followed by a spin about the normal - and picking one by crossing with a fixed axis makes
   the model YAW as it drives across a slope, which reads as the turret slewing on its own.
   Rodrigues' formula about the axis up x n turns through the smallest angle that does the job
   and adds no spin at all:

       v' = v cos + (k x v) + k (k.v)/(1 + cos)     k = up x n,  cos = n.y

   With n = up this is k = 0, cos = 1, and v' = v exactly, so anything handed a flat normal is
   untouched to the last bit rather than to within rounding - which is what lets the same
   program draw the buildings, the world batch and the sea without a branch.

   The guard on 1 + n.y is for a normal pointing straight down, where the rotation is a half
   turn about an undetermined axis. No ground here comes near it - the steepest slope on the
   map is 0.42, which is n.y = 0.92 - but a uniform is a uniform and a NaN would take the whole
   draw with it. */
var R3D_LEAN_GLSL =
  'vec3 _lean(vec3 v, vec3 n){' +
  '  vec3 k = vec3(n.z, 0.0, -n.x);' +           /* cross(vec3(0,1,0), n) */
  '  return v * n.y + cross(k, v) + k * (dot(k, v) / max(1.0 + n.y, 0.0001));' +
  '}';
