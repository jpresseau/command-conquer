/* render3d/gl3d.js - the live 3D mode: camera, projection contract, and GL plumbing.
   Part of rts.render3d, which draws the battlefield as real-time 3D.

   WHAT THIS MODE IS. Every building and unit in the game is authored as a genuine 3D model -
   a face list of boxes, cylinders and cones - which the sprite baker flattens into 2D art once
   at load. This mode skips the flattening and draws the same models live: a tilted camera, a
   directional light, a depth buffer, the terrain canvas draped on a ground plane. No second
   set of art exists or is needed; the sprite pipeline and this one share their geometry.

   THE CAMERA IS NORTH-UP TILTED PERSPECTIVE. It used to be orthographic, and that is most of
   why the mode read as "2D with taller sprites": an orthographic camera has no convergence at
   all, so two identical tanks a hundred units apart in depth drew at exactly the same size and
   every vertical edge in the scene stayed exactly vertical. Lean alone does not say depth. A
   perspective divide does, and it is the one cue the picture had none of.

   THE PROJECTION, AS THREE STEPS. Take a world point to camera space first - which is what the
   orthographic camera already did, and is unchanged:

       u  = wx - focus.x                                   (across the screen)
       sy = (wz - focus.z) * cos(tilt) - y * sin(tilt)     (down the screen)
       d  = (wz - focus.z) * sin(tilt) + y * cos(tilt)     (toward the eye)

   then put the eye a distance D in FRONT of the focal plane and divide by how far the point
   is from it:

       w = (D - d) / D                                     (1 at the focus, <1 nearer, >1 further)
       screenX = u  / w * zoom + W/2
       screenY = sy / w * zoom + H/2

   D = R3D_FOVK screen-heights of world, so it moves with the zoom and the FIELD OF VIEW is the
   same at every zoom - only the eye's distance changes, which is what a real camera does. The
   old orthographic camera is exactly the limit D -> infinity, so nothing about the tilt, the
   depth buffer or the shading had to move.

   THE CONTRACT IS _rtsWorldToScreen AND _rtsGroundAt, and it is what makes this a branch
   rather than a rewrite. The whole 2D game - input picking, selection brackets, health bars,
   effects, the placement ghost - reaches the screen through those two, and they now carry two
   things an orthographic camera never needed: `scale` (= 1/w, the factor an overlay must
   multiply its size by, because a bar over a unit at the back of the view is smaller than the
   same bar at the front) and `behind` (a point the eye cannot see, which an orthographic
   camera cannot produce). Every draw site was already reading `scale`; this is the camera that
   finally makes it something other than 1.

   The inverse is still closed-form for the ground plane, which is the only plane input needs:

       v = syo / (cos(tilt) + syo * sin(tilt) / D)        with syo = (my - H/2) / zoom

   and it returns NULL past the horizon, where the view ray never meets the ground at all. The
   horizon cannot appear on screen while D is proportional to the view height - the denominator
   above works out to cos(tilt) - sin(tilt)/(2*FOVK), a constant, and it is positive - but a
   caller can still ask about a pixel above the canvas, so the null is real and every caller
   handles it.

   The light is the sprite baker's own R3_LIGHT and the shading is _r3Ramp PORTED rather than
   approximated - same ambient split, same sky bounce, same specular, same per-channel ramp -
   so 3D mode reads as the same game, not a reskin. See the note above R3D_MESH_VS. */

window._R3D = null;

/* HOW FAR THE CAMERA LEANS, in radians from straight down. 0 is the 2D view.

   This was 0.62 - 36 degrees - which is Red Alert's own near-top-down angle, and at that angle
   most of what this renderer does cannot be seen. A building shows its roof and almost no wall;
   an ore field reads as a gold texture rather than as a field of standing crystals; a forest
   reads as dark speckle. Smooth curved surfaces, cast shadows, contact occlusion and effects
   standing in the world are all things you look at a scene from the SIDE to see, and 36 degrees
   is not the side.

   0.855 is 49 degrees, which is roughly where a modern RTS puts its camera. The war factory
   shows its flank and its roof reads as the barrel it is, the crystals stand up, the trees are
   trees. Nothing else changed to get that.

   WHAT IT COSTS, measured rather than guessed, at the top zoom:

     the view reaches 65 world units up-screen instead of 46, and 38 down instead of 33
     the sun's shadow map covers 70 world units instead of 54, at the same 1024 - so its
       texel grows from 0.105 to 0.137 world units, still finer than the 3x3 kernel over it
     picking round-trips to 0 error, as it does at every angle: world -> screen -> world is
       the projection's own inverse and carries the tilt for free

   AND WHAT IT DOES NOT COST. The horizon stays off screen. gl3d's own guard for that is
   cos(tilt) - sin(tilt)/(2*FOVK) > 0, which is 0.485 here against 0.682 before, and does not
   reach zero until tan(tilt) = 2*FOVK - about 77 degrees. There is a long way to go before the
   projection has anything to complain about; the limits that bite first are how much map the
   camera can see past (see _rtsClampFocus) and how much of the battlefield a building can
   hide. */
var R3D_TILT = 0.855;
var R3D_DEPTH_RANGE = 900;     /* world units mapped into the depth buffer; the map is ~640 */

/* HOW MUCH PERSPECTIVE. The eye sits this many screen-heights of world in front of the focal
   plane, so the field of view is fixed and only the eye's distance moves with the zoom.

   2.2 is a half-angle of about 13 degrees, which works out to a 39% size difference between
   the top of the screen and the bottom - and that difference is the number worth arguing
   about, because an RTS wants identical units to LOOK identical and every degree of field of
   view trades some of that away for depth. Chosen by rendering a grid of power plants across
   the screen at 1.7, 2.2 and 2.6 and looking: at 2.6 the corner buildings barely lean, at 1.7
   the far row is visibly a different size from the near row of the same building, and 2.2 has
   the lean without the size argument. */
var R3D_FOVK = 2.2;

/* The eye distance, in world units. R.H / zoom is the world height of the screen, so this is
   FOVK of those - and because it moves WITH the zoom, every quantity derived from the ratio
   (half-view-height / D) is a pure constant, which is what keeps the horizon off screen at
   every zoom rather than only at the ones that were tried. */
function _r3dEyeDist() { return R3D_FOVK * _rtsR.H / _rtsZoom(); }

/* A point closer to the eye than this fraction of D is not drawable - 1/w has run away. The
   GL side needs no such floor (the hardware clips against w properly, and a triangle that
   straddles the eye plane is cut at it rather than smeared across the screen); this exists so
   the JS side returns finite numbers next to its `behind` flag instead of infinities that a
   caller might quietly draw with. */
var R3D_WMIN = 0.02;

/* Shadows are cast by the sun's depth map - see render3d/shadow3d.js, which owns the light
   direction, the basis and the comparison. This file only samples it. */

/* The sea's swell - its amplitude, its shape and the GLSL both this program and the sun's
   depth pass displace with - lives in render3d/wave3d.js. This file only splices it in. */

/* How finely the ground patch is cut up. See the note at the ground buffer in scene3d.js:
   this renderer's depth is linear in view depth rather than in screen space, so it is exact at
   a vertex and drifts across a triangle. 8x8 takes the drift at the screen centre from 4.7
   world units to 0.06. */
var R3D_GROUND_SUB = 8;

function _r3dShader(gl, type, src) {
  var sh = gl.createShader(type);
  gl.shaderSource(sh, src); gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error('shader: ' + gl.getShaderInfoLog(sh));
  }
  return sh;
}
function _r3dProgram(gl, vs, fs) {
  var p = gl.createProgram();
  gl.attachShader(p, _r3dShader(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, _r3dShader(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error('link: ' + gl.getProgramInfoLog(p));
  }
  return p;
}

/* NO MATRICES. The camera above is six numbers, so the projection is done longhand in the
   vertex shader from uniforms - uCam packs focus and scale, uTilt the lean, uInvD the eye.
   Every mesh is drawn in MODEL space and placed by uPos/uRot/uScale, so one buffer per model
   serves every entity of that type.

   THE PERSPECTIVE DIVIDE IS gl_Position.w AND NOTHING ELSE IS TOUCHED. sx, sy and d are the
   camera-space numbers the orthographic version already computed; w = 1 - d/D is the divide,
   and the depth term is pre-multiplied by w so that after the hardware divides, the value
   landing in the depth buffer is STILL the linear -d/RANGE it always was. That matters:
   depth here spans a third of the buffer's range because it is linear in world depth, where
   the textbook 1/z mapping over the same scene would crowd the whole battlefield into the
   last 1% of it. Nothing about the depth test, the sort, or the shading moved.

   No clamp on w, deliberately. Clamping is what produces the smeared triangle everyone
   associates with geometry behind the camera - the hardware's own homogeneous clipping cuts
   the primitive at the eye plane and is exact, and a clamp is what stops it from running. */
var R3D_MESH_VS =
  'attribute vec3 aP; attribute vec3 aN; attribute vec3 aC;' +
  'uniform vec4 uCam;' +        /* focus.x, focus.z, 2*zoom/W, 2*zoom/H */
  'uniform vec2 uTilt;' +       /* cos(tilt), sin(tilt) */
  'uniform float uInvD;' +      /* 1 / eye distance; 0 is the orthographic camera */
  /* PLACEMENT COMES IN PER INSTANCE, not per draw - see render3d/inst3d.js. The unpack below
     defines uPos, uRot, uScale, uScaleY and uNrm as locals with exactly the names the uniforms
     had, so every line of the maths under it is the line that was here before. */
  R3D_INST_GLSL +
  'uniform vec2 uWave;' +       /* wave amplitude (0 = not water) and the clock */
  R3D_SHADOW_VGLSL +
  R3D_LEAN_GLSL +
  'varying vec3 vN; varying vec4 vCol;' +
  'void main(){' +
  R3D_INST_UNPACK +
  '  vec3 p = vec3(aP.x * uScale, aP.y * uScale * uScaleY, aP.z * uScale);' +
  /* YAW FIRST, THEN LEAN. The yaw is about the model's own up, which is what "facing" means;
     the lean then takes that up to the ground's. Doing it the other way round would turn the
     model about the hill's normal instead of its own axis, so a tank on a slope would face
     somewhere other than where it is driving. */
  '  vec3 ry = vec3(p.x*uRot.x - p.z*uRot.y, p.y, p.x*uRot.y + p.z*uRot.x);' +
  '  vec3 wp = uPos + _lean(ry, uNrm);' +
  '  vec3 rn = vec3(aN.x*uRot.x - aN.z*uRot.y, aN.y, aN.x*uRot.y + aN.z*uRot.x);' +
  '  vec3 n = normalize(_lean(rn, uNrm));' +
  /* WATER IS THIS SAME PROGRAM WITH THE SURFACE MOVING UNDER IT - the height, the analytic
     normal and the tone, all spliced in from the one wave table in render3d/wave3d.js, which
     the sun's depth pass builds its own displacement from too. The alternative was a second
     program, and this file is emphatic that there must be exactly one copy of the light (see
     the note above): a second program means a second copy of the ramp and the projection,
     which is the drift the specular constants were consolidated to prevent.

     uWave.x is 0 for everything that is not water, and the branch is on a UNIFORM, so it is
     the same decision for every vertex in a draw. */
  '  vec3 col = aC;' +
  R3D_WAVE_VGLSL_LIT +
  /* the sprite baker's own light and half-vector, so the two pipelines agree face for face */
  /* THE SHADING ITSELF HAPPENS PER FRAGMENT NOW - see R3D_MESH_LIGHT. All this stage does is
     hand on the surface: its normal and its colour. Doing it here instead meant a curve was
     shaded once per vertex, which on a face whose vertices all carry the same normal is once
     per FACET, and no amount of smoothing the normals would have shown through that. */
  '  vN = n;' +
  /* THE DIM FLAG RIDES IN vCol.w rather than in a varying of its own. It has to reach the
     fragment stage - the ramp _shade runs is not linear in the colour, so a damaged building
     cannot be tinted by pre-multiplying aC and getting the same picture - and a vec3 varying
     and a vec4 one occupy the same slot, so this costs nothing where slots are scarce. */
  '  vCol = vec4(col, uDim);' +
  '  _shadowFrom(wp);' +
  '  float sx = (wp.x - uCam.x) * uCam.z;' +
  '  float sy = ((wp.z - uCam.y) * uTilt.x - wp.y * uTilt.y) * uCam.w;' +
  '  float d  = ((wp.z - uCam.y) * uTilt.y + wp.y * uTilt.x);' +
  '  float pw = 1.0 - d * uInvD;' +
  '  gl_Position = vec4(sx, -sy, -d / ' + R3D_DEPTH_RANGE.toFixed(1) + ' * pw, pw);' +
  '}';
/* uA exists for the contact shadows and for nothing else. They are flat discs drawn through
   this same program, and drawn OPAQUE they were not shadows at all - they were holes cut in
   the ground, which under infantry (whose disc came out wider than the figure) read as a unit
   standing in a puddle of void. A shadow has to darken what is under it rather than replace
   it, and that needs blending, which needs an alpha the fragment shader can write. Every
   other draw sets it to 1 and is unchanged. */
/* THE FRAGMENT STAGE FINALLY DOES SOMETHING. It was `gl_FragColor = vec4(vC, uA)` - every
   light calculation in the game happened per VERTEX and the fragment shader interpolated a
   colour and stopped. A shadow map cannot work that way: shadow is a property of the PIXEL,
   not of the corner of a triangle, and a per-vertex test on a 4-unit slab would put the edge
   of a tree's shadow at the nearest corner of whatever it lands on.

   So the vertex stage hands over the same surface twice - lit and in shade - and this picks
   between them per pixel. highp, because the comparison is against a depth packed into eight
   bits and change, and mediump has neither the range nor the precision to hold it. */
var R3D_MESH_FS =
  'precision highp float; varying vec3 vN; varying vec4 vCol;' +
  'uniform float uA;' +
  R3D_SHADOW_GLSL + R3D_MESH_LIGHT +
  /* NORMALISED HERE, NOT IN THE VERTEX SHADER. A varying is interpolated linearly, and the
     linear blend of two unit vectors is shorter than one - which is exactly the case on the
     curves this is for, and would read as a dark seam down the middle of every one. */
  'void main(){' +
  '  vec3 tint = mix(vec3(1.0), vec3(0.62, 0.55, 0.55), vCol.w);' +
  '  gl_FragColor = vec4(_shade(normalize(vN), vCol.rgb) * tint, uA); }';

/* Ground and fog share one textured program; fog just samples a different texture with
   blending on and the depth test off. */
/* The ground's own program - its vertex and fragment shaders - moved to render3d/ground3d.js
   when the terrain got relief and this file went over the project's per-file limit. It sits
   beside the textures it samples and the mesh it draws, which is where it belonged anyway;
   _r3dInit below still builds it, because that is where every program is built. */

function _r3dInit() {
  var cv = document.getElementById('rtsCv3d');
  if (!cv) return null;
  /* preserveDrawingBuffer, deliberately. Without it the buffer is discarded after each
     composite, which is invisible to a player but reads back BLACK in any capture - and this
     project verifies its rendering with headless screenshots, so a renderer that cannot be
     screenshotted cannot be tested. The cost is a buffer copy per frame instead of a swap,
     which at this scene's ~11k triangles is not measurable. */
  /* No stencil. The pass that needed one - a planar shadow, the whole mesh squashed flat, whose
     faces all land on the same patch of ground and blend over each other into a blot - has been
     replaced by the sun's depth map, which answers "is this pixel in shade" once by
     construction. */
  /* WEBGL2 FIRST, WEBGL1 IF THERE IS NO 2. What 2 is wanted for is a depth TEXTURE, which the
     ambient occlusion in post3d.js reads and which is core there and an extension here. Nothing
     else in the mode had to move for it: every shader in this renderer is GLSL ES 1.00, and a
     WebGL2 context compiles those unchanged. So this is one line, not a second pipeline, and a
     browser with only WebGL1 still gets the whole mode - with the occlusion if it has
     WEBGL_depth_texture, and without it if it does not. */
  var opts = { antialias: true, alpha: false, preserveDrawingBuffer: true };
  var gl = cv.getContext('webgl2', opts), gl2 = !!gl;
  if (!gl) { gl = cv.getContext('webgl', opts); gl2 = false; }
  if (!gl) return null;
  var R3;
  try {
    R3 = {
      on: false, cv: cv, gl: gl, gl2: gl2,
      meshP: _r3dProgram(gl, R3D_MESH_VS, R3D_MESH_FS),
      texP: _r3dProgram(gl, R3D_TEX_VS, R3D_TEX_FS),
      mesh: {}, terrainTex: null, terrainDirty: true,
      fogCv: null, fogTex: null, fogDirty: true,
      shadowReady: false, postReady: false,
      cp: Math.cos(R3D_TILT), sp: Math.sin(R3D_TILT)
    };
  } catch (e) { return null; }
  /* The shadow map and the occlusion are the two parts of the mode allowed to fail on their
     own: a driver that will not give a render target still gets the world, just unshaded and
     unoccluded. */
  try { R3.shadowReady = _r3dShadowInit(R3); } catch (e) { R3.shadowReady = false; }
  try { R3.postReady = _r3dPostInit(R3); } catch (e) { R3.postReady = false; }
  window._R3D = R3;
  return R3;
}

/* The projection contract, used by camera.js when the mode is on. Kept beside the shader that
   must agree with it: if these two ever disagree, clicks land beside units. */

/* Forward, from offsets already taken relative to the focus - which is where both the shader
   and the inverse below do their arithmetic, so all three share one form of the expression. */
function _r3dProject(u, y, v) {
  var R3 = window._R3D, R = _rtsR, zm = _rtsZoom();
  var sy = v * R3.cp - y * R3.sp;
  var d = v * R3.sp + y * R3.cp;
  var w = 1 - d / _r3dEyeDist();
  /* Behind the eye the divide has no answer, but a caller reading `.x` before it reads
     `.behind` must not get an infinity - so the returned numbers are computed against the
     floor and the flag is what says not to trust them. */
  var behind = !(w > R3D_WMIN), ws = behind ? R3D_WMIN : w;
  return { x: u / ws * zm + R.W / 2, y: sy / ws * zm + R.H / 2,
           scale: 1 / ws, behind: behind };
}
function _r3dWorldToScreen(x, y, z) {
  var R = _rtsR;
  return _r3dProject(x - R.focus.x, y || 0, z - R.focus.z);
}
/* Screen y of a point on the ground. x cannot affect it under a north-up camera - the divide
   is a function of depth alone - so this stays a one-argument question even with perspective. */
function _r3dSY(wz) { return _r3dProject(0, 0, wz - _rtsR.focus.z).y; }

/* The inverse, on the ground plane, which is the only plane input ever asks about. Solving
   syo = v*cp / (1 - v*sp/D) for v gives the closed form below; the denominator vanishing is
   the HORIZON, where the view ray runs parallel to the ground and there is no answer to give.
   Null rather than a wrong number: every caller checks, and _rtsPickAt runs inside the draw
   half of the loop, where a NaN would surface as "the display has stopped" rather than as a
   misplaced click. */
/* WHERE A PIXEL MEETS A PLANE AT HEIGHT h. The closed form the file's header gives is this
   with h = 0; carrying the height through costs two terms and is what lets the ray be walked
   against relief rather than against a floor. Solved the same way - set the projected sy equal
   to the pixel's and solve for the depth offset v:

       v = [ syo * (1 - h*cos/D) + h*sin ] / ( cos + syo*sin/D )

   and w falls out of v and h together, because a point that is both further away and higher up
   is nearer the eye by the height's own cosine. */
function _r3dPlaneAt(mx, my, h) {
  var R = _rtsR, R3 = window._R3D, zm = _rtsZoom(), D = _r3dEyeDist();
  var sxo = (mx - R.W / 2) / zm, syo = (my - R.H / 2) / zm;
  var den = R3.cp + syo * R3.sp / D;
  if (den <= 1e-6) return null;
  var v = (syo * (1 - h * R3.cp / D) + h * R3.sp) / den;
  var w = 1 - (v * R3.sp + h * R3.cp) / D;
  if (!(w > R3D_WMIN)) return null;
  return { x: R.focus.x + sxo * w, z: R.focus.z + v };
}

/* WHERE A PIXEL MEETS THE GROUND, which is no longer a plane.

   Every click, every move order, every drag of the map and every building placed goes through
   here, so this is the one piece of the relief work that is not about how the game looks. Get
   it wrong and a unit ordered onto a hillside walks somewhere else.

   BY BISECTION, and the reason is that the obvious method has a cliff edge in it. Walking the
   ray by FIXED POINT - guess a height, ask where the pixel meets that plane, ask the terrain
   how high it is there, repeat - converges by a factor of (terrain slope) x tan(tilt) each
   pass. At an elevation range of 3.2 that measured 0.57 and fourteen passes were plenty. The
   range went to 5, the slopes got half again as steep, the factor went to about 0.89, and the
   same fourteen passes left the answer 0.92 world units out - a quarter of a cell, on the
   function every order in the game is aimed through. Steeper still and the factor reaches 1
   and it stops converging at all. A method that degrades quietly as a constant is tuned is the
   wrong method.

   Bisection does not care how steep the ground is. Let f(h) be "how far the terrain at the
   point this pixel hits a plane at height h sits ABOVE h". f(0) is at least zero, because no
   ground is below sea level; f(RTS_ELEV_MAX) is at most zero, because none is above the top of
   the range - so a root is bracketed before the first step. And f is strictly DECREASING,
   because raising the plane slides the intersection away by tan(tilt) = 1.15 per unit while
   the terrain under it can only climb by its own slope, at most 0.42 here: 0.42 x 1.15 = 0.48,
   comfortably under 1. So the root is unique and each pass halves the bracket, whatever the
   map does.

   That is the same condition the sea's draw order rests on - the ground being shallower than
   the line of sight - and it holds for the same reason. Twenty passes take 5 world units to
   five thousandths of one; the cost is twenty bilinear samples on a mouse move.

   It converges to the LAST crossing rather than the first, which differs only where a hill
   hides ground behind it - and there the pixel is showing the hill, so the near answer is the
   one the player means. */
function _r3dGroundAt(mx, my) {
  var lo = 0, hi = RTS_ELEV_MAX, p = _r3dPlaneAt(mx, my, 0);
  if (!p) return null;
  for (var i = 0; i < 20; i++) {
    var mid = (lo + hi) * 0.5;
    var q = _r3dPlaneAt(mx, my, mid);
    if (!q) break;
    p = q;
    if (_rtsElev(q.x, q.z) > mid) lo = mid; else hi = mid;
  }
  /* the bracket has closed; answer at its centre rather than at whichever side was tried last */
  var f = _r3dPlaneAt(mx, my, (lo + hi) * 0.5);
  return f || p;
}

/* THE GROUND RECTANGLE THE CAMERA CAN SEE, which under perspective is not the view span.
   The visible ground is a TRAPEZOID - narrow at the bottom of the screen where the eye is
   close, wide at the top where it is far - and three separate things need its bounding box:
   the world chunk cull, the radar's view rectangle and the focus clamp (both through
   _rtsViewSpan), and the cell window the 2D overlays iterate. All three used to work it out
   from the zoom, which is the top-down answer and wrong for either 3D camera; deriving it
   once here is what stops them drifting apart again.

   Setting the projected edge equal to the screen edge and solving gives the two z limits; the
   ratio (half-view-height / D) is a constant because D moves with the zoom, so the far limit
   is a fixed multiple of the half-height rather than something that can degenerate at one end
   of the ladder. The x limit is taken at the FAR edge, where the trapezoid is widest. */
function _r3dViewBounds() {
  var R = _rtsR, R3 = window._R3D, zm = _rtsZoom(), D = _r3dEyeDist();
  var hx = R.W / 2 / zm, hz = R.H / 2 / zm;
  var conv = hz * R3.sp / D;
  var vFar = -hz / Math.max(1e-3, R3.cp - conv);      /* up the screen, away from the eye */
  var vNear = hz / (R3.cp + conv);                    /* down the screen, toward it */
  var wFar = 1 - vFar * R3.sp / D;
  return { x0: R.focus.x - hx * wFar, x1: R.focus.x + hx * wFar,
           z0: R.focus.z + vFar, z1: R.focus.z + vNear };
}
