/* render3d/cloud3d.js - clouds passing over the battlefield. Part of rts.render3d.

   The sun lit the whole map evenly, every hour of every match, and a plain that size under one
   even light reads as a board rather than as country. So there are clouds now: big, soft
   shadows drifting slowly across the map, the way the later 3D RTS games put them over their
   battlefields. Nothing about them is drawn. They are a term in the sun's own shadow
   (_shadowAt, shadow3d.js), so everything the sun lights passes under them the same way: the
   ground, the forests, the buildings and the units on it, the sea and its glints.

   IN THE SUN'S OWN COORDINATES, and that is what makes them fall right. The pattern is laid
   out across the sun's view (vL, which every program that reads the shadow map carries
   already), so a cloud's shadow is the cloud projected along the light: stretched a little
   along the sun's line on flat ground, and climbing a building's sunny face at the same slant
   as the building's own shadow falls. vL is centred on the view, so the view's own offset is
   handed back in (uCloud.xy) to pin the pattern to the WORLD: a pan must not drag the clouds
   along with the camera.

   ON THE GAME CLOCK, like everything else that moves in this mode: paused, they hold still.
   R3.cloudAmt takes them out and leaves the rest, as R3.aoAmt does the occlusion. */

/* noise units per world unit: a cloud is about fourteen cells across */
var R3D_CLOUD_SCALE = 0.028;
/* how much of the sun a full cloud takes - a light cloud, not an overcast */
var R3D_CLOUD_DEPTH = 0.7;
/* world units a second, across the sun's view */
var R3D_CLOUD_SPEED = 0.8;

var R3D_CLOUD_GLSL =
  'uniform vec4 uCloud;' +          /* the view's offset in the sun's frame, depth, drift */
  /* the same hash as noise3d.js, under names of its own: the shadow is read by programs that
     carry that file and by one that does not */
  'float _clh(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33);' +
  '  return fract((q.x + q.y) * q.z); }' +
  'float _clv(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);' +
  '  return mix(mix(_clh(i), _clh(i + vec2(1.0, 0.0)), u.x),' +
  '             mix(_clh(i + vec2(0.0, 1.0)), _clh(i + vec2(1.0, 1.0)), u.x), u.y); }' +
  /* 1 in the open, down to 1 - depth under the thick of a cloud; two octaves - a cloud's
     shadow is soft, and its edge is the only place a finer one would show */
  'float _cloudAt(){' +
  '  if (uCloud.z <= 0.0) return 1.0;' +
  '  vec2 p = (vL.xy * uSunSpan.x + uCloud.xy) * ' + R3D_CLOUD_SCALE.toFixed(4) + ' + vec2(uCloud.w, uCloud.w * 0.37);' +
  '  float n = _clv(p) * 0.7 + _clv(p * 2.3 + vec2(5.2, 1.7)) * 0.3;' +
  '  return 1.0 - uCloud.z * smoothstep(0.5, 0.64, n); }';

/* onto program P, with the sun's view it is drawn under (_r3dShadowBind) */
function _r3dCloudSet(gl, R3, P) {
  var u = gl.getUniformLocation(P, 'uCloud');
  if (!u) return;
  var c = R3.sunC || [0, 0, 0], G = window._rtsG;
  var amt = (typeof _r3dQ === 'function' && !_r3dQ('clouds')) ? 0 : R3.cloudAmt === undefined ? 1 : R3.cloudAmt;
  var t = (G && G.t) || 0;
  var B = _r3dSunB();
  gl.uniform4f(u, c[0] * B.r[0] + c[1] * B.r[1] + c[2] * B.r[2],
                  c[0] * B.u[0] + c[1] * B.u[1] + c[2] * B.u[2],
                  R3D_CLOUD_DEPTH * amt, t * R3D_CLOUD_SPEED * R3D_CLOUD_SCALE);
}
