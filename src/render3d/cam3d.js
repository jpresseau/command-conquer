/* render3d/cam3d.js - which way the 3D camera faces, and how far it leans. Part of
   rts.render3d; loads before gl3d.js, whose shaders splice R3D_CAM_GLSL in at load.

   THE CAMERA USED TO FACE NORTH, ALWAYS, AT ONE LEAN. That is the 2D game's camera carried into
   3D, and it is the one thing the later 3D RTS games changed first: you swing the view round to
   see behind the war factory, down the valley the enemy is coming up, and you lean it further
   over or stand it more upright. So the camera has two numbers of its own now:

     YAW    about the vertical, 0 = north up. ui/orbit.js turns it.
     TILT   from straight down, R3D_TILT by default, held inside [R3D_TILT_MIN, R3D_TILT_MAX].

   HOW THE YAW ENTERS. Everything in this renderer already works in the camera's own frame -
   u across the screen, v down it on the ground, then the lean and the perspective divide on
   top (gl3d.js). Yaw is one more step at the very front: the world offset from the focus is
   turned into that frame before anything else happens,

       u =  dx*cos(yaw) + dz*sin(yaw)          (the camera's right, R = (cos, 0, sin))
       v = -dx*sin(yaw) + dz*cos(yaw)          (down the screen,   F = (-sin, 0, cos))

   and turned back on the way out of every inverse. At yaw 0 both are the identity, so a
   north-up camera draws exactly the picture it drew before any of this existed.

   THE TILT'S CEILING IS THE SEA'S. The water is laid down with the depth test off and relies on
   its waves never being steeper than the line of sight (wave3d.js: R3D_WAVE_SLOPE < cot(tilt)),
   which gives out at about 58 degrees; the ground pick's bisection holds to about 67. 56 degrees
   keeps both with room. The floor is where the buildings start to show only their roofs again. */

var R3D_TILT_MIN = 0.45;         /* 26 degrees from straight down */
var R3D_TILT_MAX = 0.98;         /* 56 degrees: the sea's draw order holds to about 58 */

/* One copy of the camera's first step, for every vertex shader that projects: the offset from
   the focus, turned into the camera's frame. The shaders then read .x where they read the world
   x and .y where they read the world z, and nothing after that line knows the yaw exists. */
var R3D_CAM_GLSL =
  'uniform vec2 uYaw;' +          /* cos(yaw), sin(yaw) */
  'vec2 camUV(vec3 p){' +
  '  vec2 o = vec2(p.x - uCam.x, p.z - uCam.y);' +
  '  return vec2(o.x * uYaw.x + o.y * uYaw.y, -o.x * uYaw.y + o.y * uYaw.x);' +
  '}';

/* The camera's uniforms for a program that projects - the lean, the yaw, and the specular's
   half-vector for the one that shades. Set wherever uCam is. */
function _r3dCamU(gl, P) {
  var R3 = window._R3D;
  gl.uniform2f(gl.getUniformLocation(P, 'uTilt'), R3.cp, R3.sp);
  gl.uniform2f(gl.getUniformLocation(P, 'uYaw'), R3.cy, R3.sy);
  var h = R3.half || R3D_HALF;
  gl.uniform3f(gl.getUniformLocation(P, 'uHalf'), h[0], h[1], h[2]);
  if (typeof _r3dSkyU === 'function') _r3dSkyU(gl, P);     /* the hour and the weather: sky3d.js */
}

/* Set the camera's facing and lean. Yaw is kept in (-PI, PI]; tilt is clamped. */
function _r3dCamSet(yaw, tilt) {
  var R3 = window._R3D;
  if (!R3) return;
  if (typeof yaw === 'number' && isFinite(yaw)) {
    yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
    R3.yaw = Math.abs(yaw) < 1e-9 ? 0 : yaw;
  }
  if (typeof tilt === 'number' && isFinite(tilt)) R3.tilt = Math.max(R3D_TILT_MIN, Math.min(R3D_TILT_MAX, tilt));
  R3.cy = Math.cos(R3.yaw || 0); R3.sy = Math.sin(R3.yaw || 0);
  R3.cp = Math.cos(R3.tilt); R3.sp = Math.sin(R3.tilt);
  /* THE HIGHLIGHT TURNS WITH THE CAMERA. The specular's half-vector was the sprite baker's,
     built from a viewer standing south of the model; the viewer now stands wherever the yaw puts
     them, at the baker's own elevation - so at yaw 0 it is exactly R3D_HALF, and a glint on a
     hull stays where the eye would see one as the camera swings. The light stays in the world. */
  var hv = R3_VIEW[1], hh = R3_VIEW[2], L = R3_LIGHT;
  var h = [L[0] - R3.sy * hh, L[1] + hv, L[2] + R3.cy * hh], m = Math.hypot(h[0], h[1], h[2]);
  R3.half = [h[0] / m, h[1] / m, h[2] / m];
}

/* World offset from the focus -> the camera's frame, and back. */
function _r3dToCam(dx, dz) {
  var R3 = window._R3D;
  return { u: dx * R3.cy + dz * R3.sy, v: -dx * R3.sy + dz * R3.cy };
}
function _r3dFromCam(u, v) {
  var R3 = window._R3D;
  return { x: u * R3.cy - v * R3.sy, z: u * R3.sy + v * R3.cy };
}

/* The view's box grown by `pad` all round and by `near` more on the side nearest the eye - where
   something tall standing just off the bottom of the screen still reaches up into it. That side
   was +z while the camera faced north; it is the camera's F = (-sin yaw, 0, cos yaw) now. */
function _r3dBoundsNear(vb, near, pad) {
  var R3 = window._R3D, fx = -R3.sy, fz = R3.cy;
  return { x0: vb.x0 - pad - Math.max(0, -fx) * near, x1: vb.x1 + pad + Math.max(0, fx) * near,
           z0: vb.z0 - pad - Math.max(0, -fz) * near, z1: vb.z1 + pad + Math.max(0, fz) * near };
}

/* How far a world point is toward the eye, in the camera's own depth (larger = nearer): the
   key the blended effects are sorted by. The world z did this job while the camera faced north. */
function _r3dDepthKey(x, y, z) {
  var R3 = window._R3D;
  return (-x * R3.sy + z * R3.cy) * R3.sp + y * R3.cp;
}
