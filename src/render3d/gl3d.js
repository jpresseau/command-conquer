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

/* Tilt: 0 is straight down (the 2D view); this leans the camera until walls and chimneys
   show real elevation. cos 0.62 rad = 0.81, so ground depth compresses to 81% - enough lean
   to read as 3D, mild enough that the map stays readable as a map. */
var R3D_TILT = 0.62;
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

/* How far the sea heaves, in world units. Small on purpose: most of what makes water read as
   water is the specular sliding over a moving NORMAL, and the normal comes from the slope, so
   the short fast wave in the sum does most of the work at a fifth of the amplitude. Push this
   much past a third of a unit and a harbour starts to look like open ocean. */
/* How finely the ground patch is cut up. See the note at the ground buffer in scene3d.js:
   this renderer's depth is linear in view depth rather than in screen space, so it is exact at
   a vertex and drifts across a triangle. 8x8 takes the drift at the screen centre from 4.7
   world units to 0.06. */
var R3D_GROUND_SUB = 8;

var R3D_WAVE_AMP = 0.42;

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
  'uniform vec3 uPos; uniform vec2 uRot; uniform float uScale; uniform float uScaleY; uniform vec3 uTint;' +
  'uniform vec2 uWave;' +       /* wave amplitude (0 = not water) and the clock */
  R3D_SHADOW_VGLSL +
  /* The ramp, as a function, because it is now evaluated TWICE per vertex - once with
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
  'varying vec3 vC; varying vec3 vCs;' +
  'void main(){' +
  '  vec3 p = vec3(aP.x * uScale, aP.y * uScale * uScaleY, aP.z * uScale);' +
  '  vec3 wp = vec3(uPos.x + p.x*uRot.x - p.z*uRot.y, uPos.y + p.y, uPos.z + p.x*uRot.y + p.z*uRot.x);' +
  '  vec3 n = normalize(vec3(aN.x*uRot.x - aN.z*uRot.y, aN.y, aN.x*uRot.y + aN.z*uRot.x));' +
  /* WATER IS THIS SAME PROGRAM WITH THE SURFACE MOVING UNDER IT. Three travelling waves,
     summed: two long ones that give the sheet its roll, and a short fast one that does almost
     nothing to the height and most of the work on the NORMAL - which is what the specular
     reads, and the specular is what makes water look wet rather than blue.

     The normal is the analytic slope of that sum, not a baked attribute, so it is exact at
     every vertex and costs three cosines. The alternative was a second program, and this file
     is emphatic that there must be exactly one copy of the light (see the note above): a
     second program means a second copy of the ramp and the projection, which is the drift the
     specular constants were consolidated to prevent.

     uWave.x is 0 for everything that is not water, and the branch is on a UNIFORM, so it is
     the same decision for every vertex in a draw. */
  '  vec3 col = aC;' +
  '  if (uWave.x > 0.0) {' +
  '    float q1 = wp.x * 0.34 + wp.z * 0.22 + uWave.y * 1.15;' +
  '    float q2 = wp.x * 0.19 - wp.z * 0.41 + uWave.y * 0.85;' +
  '    float q3 = wp.x * 1.35 + wp.z * 0.95 + uWave.y * 2.40;' +
  '    wp.y += uWave.x * (sin(q1) + 0.7 * sin(q2) + 0.45 * sin(q3));' +
  '    float dx = uWave.x * (0.34 * cos(q1) + 0.7 * 0.19 * cos(q2) + 0.45 * 1.35 * cos(q3));' +
  '    float dz = uWave.x * (0.22 * cos(q1) - 0.7 * 0.41 * cos(q2) + 0.45 * 0.95 * cos(q3));' +
  '    n = normalize(vec3(-dx, 1.0, -dz));' +
  /* AND THE SWELL IS CARRIED BY THE COLOUR, not by the light - which is not a stylistic
     choice, it is what the ramp leaves room for. An up-facing surface takes very nearly the
     most lambert this light can give: v works out at 0.96 for a flat sheet against a ceiling
     of 1.0, so the whole bright half of the wave's swing is clipped off and the dark half
     compresses into a 22% band. Measured, the entire sea came out in 79 tones and read as a
     slab. There is no headroom up there for water to use.

     So the height itself moves the tone - dark in the troughs, bright and whitening on the
     crests, which is what the 2D wave tiles have always drawn and what the reference art
     does. The moving normal above is still worth having: it is what breaks the bands up and
     glints as the swell travels. */
  '    float hh = (sin(q1) + 0.7 * sin(q2) + 0.45 * sin(q3)) / 2.15;' +
  '    col *= 0.70 + 0.52 * (hh * 0.5 + 0.5);' +
  '    col += vec3(0.10, 0.13, 0.15) * smoothstep(0.45, 1.0, hh);' +
  '  }' +
  /* the sprite baker's own light and half-vector, so the two pipelines agree face for face */
  '  float lam = max(dot(n, ' + _r3dGlsl3(R3_LIGHT) + '), 0.0);' +
  '  float sp = max(dot(n, ' + _r3dGlsl3(R3D_HALF) + '), 0.0);' +
  '  sp *= sp; sp *= sp; sp *= sp; sp *= sp;' +      /* ^16, the baker's tight highlight */
  /* a touch of sky bounce so upward faces do not go dead in shadow - r3d/render.js:97 */
  '  float sky = 0.10 * max(n.y, 0.0);' +
  '  float v = min(' + R3_AMB.toFixed(4) + ' + ' + R3_DIF.toFixed(4) +
      ' * lam + sky + 0.16 * sp, 1.10);' +
  /* AND THE SAME SURFACE WITH THE SUN TAKEN OUT of it - ambient and the sky bounce only. The
     fragment stage picks between the two by how much of the sun actually reaches this pixel,
     which is what a shadow map is for. _r3Ramp is ported term for term either way: its floor
     is per-channel and COOL, so shade slides toward blue-grey rather than to black, and the
     shadowed end keeps 30-38% of the surface's own colour instead of losing it. */
  '  float vs = min(' + R3_AMB.toFixed(4) + ' + sky, 1.10);' +
  '  vC  = _ramp(col, v) * uTint;' +
  '  vCs = _ramp(col, vs) * uTint;' +
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
  'precision highp float; varying vec3 vC; varying vec3 vCs; uniform float uA;' +
  R3D_SHADOW_GLSL +
  'void main(){ gl_FragColor = vec4(mix(vCs, vC, _shadowAt()), uA); }';

/* Ground and fog share one textured program; fog just samples a different texture with
   blending on and the depth test off. */
var R3D_TEX_VS =
  'attribute vec2 aXZ; attribute vec2 aT;' +
  'uniform vec4 uCam; uniform vec2 uTilt; uniform float uInvD;' +
  R3D_SHADOW_VGLSL +
  'varying vec2 vT;' +
  'void main(){' +
  '  vT = aT;' +
  '  _shadowFrom(vec3(aXZ.x, 0.0, aXZ.y));' +
  '  float sx = (aXZ.x - uCam.x) * uCam.z;' +
  '  float sy = (aXZ.y - uCam.y) * uTilt.x * uCam.w;' +
  '  float d  = (aXZ.y - uCam.y) * uTilt.y;' +
  '  float pw = 1.0 - d * uInvD;' +
  '  gl_Position = vec4(sx, -sy, -d / ' + R3D_DEPTH_RANGE.toFixed(1) + ' * pw, pw);' +
  '}';
/* THE GROUND RECEIVES, and it is the surface that matters most - a shadow map that shades
   every mesh but not the floor puts a tree's shade on the tree beside it and none on the grass
   underneath, which is worse than no shadows at all.

   uRecv is 0 for the fog, which is drawn through this same program and is not a surface: it is
   the unexplored map laid over the finished picture, and shading it would darken the shroud in
   the shape of trees the player cannot see.

   The shade is a COOL MULTIPLY rather than a scalar one, matched to the mesh ramp's own floor -
   a shadow on grass and a shadow on a slab beside it have to be the same colour of shade or
   the two read as different times of day. */
var R3D_TEX_FS =
  'precision highp float; varying vec2 vT; uniform sampler2D uS; uniform float uA;' +
  'uniform float uRecv;' +
  R3D_SHADOW_GLSL +
  'void main(){' +
  '  vec4 c = texture2D(uS, vT);' +
  '  float s = mix(1.0, _shadowAt(), uRecv);' +
  '  vec3 lit = c.rgb * mix(vec3(0.575, 0.600, 0.655), vec3(1.0), s);' +
  '  gl_FragColor = vec4(lit, c.a * uA);' +
  '}';

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

/* Which mode the player last chose. localStorage rather than the IndexedDB store in
   rts.store.js, for the same reason the title screen's controls panel uses it: that store
   exists to hold megabytes of archives and this is one boolean. Wrapped because private
   browsing throws on access rather than returning null, and a disabled store must cost a
   preference, not the battle. */
var RTS_3D_LS = 'rcc.mode3d';

/* Lazy init so a machine without WebGL pays nothing and is told plainly rather than shown a
   black screen. `quiet` is for restoring the saved choice at match start: no click sound for
   something the player did not just click, and no complaint about WebGL on a machine that
   never had it - it simply stays in 2D. */
function _r3dApply(on, quiet) {
  var R3 = window._R3D;
  if (!R3) R3 = _r3dInit();
  if (!R3) {
    if (!quiet) _rtsSay('3D needs WebGL, which this browser did not provide.');
    return false;
  }
  R3.on = !!on;
  /* the canvas stays hidden either way - it is a buffer the 2D frame blits, not a layer the
     compositor stacks; see the note at the blit in render/frame.js */
  /* the world moved between canvases, so both need a clean slate */
  R3.terrainDirty = true; R3.fogDirty = true;
  var btn = document.getElementById('rts3dBtn');
  if (btn) { btn.classList.toggle('on', R3.on); btn.title = R3.on ? 'Back to classic 2D' : 'Switch to 3D'; }
  _r3dResize();
  if (!quiet && typeof _rtsSfx === 'function') _rtsSfx('click');
  return true;
}

/* The toggle the button calls. */
function rts3dToggle() {
  var R3 = window._R3D;
  if (!_r3dApply(!(R3 && R3.on), false)) return;
  try { window.localStorage.setItem(RTS_3D_LS, window._R3D.on ? '1' : '0'); } catch (e) {}
}

/* Called once per match from rtsOpen. Only ever turns the mode ON: 2D is the default and an
   absent or unreadable preference must land there. */
function rts3dRestore() {
  var want = null;
  try { want = window.localStorage.getItem(RTS_3D_LS); } catch (e) { return; }
  if (want === '1') _r3dApply(true, true);
}

function _r3dResize() {
  var R3 = window._R3D, main = document.getElementById('rtsCv');
  if (!R3 || !main) return;
  if (R3.cv.width !== main.width || R3.cv.height !== main.height) {
    R3.cv.width = main.width; R3.cv.height = main.height;
  }
  R3.gl.viewport(0, 0, R3.cv.width, R3.cv.height);
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
function _r3dGroundAt(mx, my) {
  var R = _rtsR, R3 = window._R3D, zm = _rtsZoom(), D = _r3dEyeDist();
  var sxo = (mx - R.W / 2) / zm, syo = (my - R.H / 2) / zm;
  var den = R3.cp + syo * R3.sp / D;
  if (den <= 1e-6) return null;
  var v = syo / den, w = 1 - v * R3.sp / D;
  if (!(w > R3D_WMIN)) return null;
  return { x: R.focus.x + sxo * w, z: R.focus.z + v };
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
