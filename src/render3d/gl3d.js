/* render3d/gl3d.js - the live 3D mode: camera, projection contract, and GL plumbing.
   Part of rts.render3d, which draws the battlefield as real-time 3D.

   WHAT THIS MODE IS. Every building and unit in the game is authored as a genuine 3D model -
   a face list of boxes, cylinders and cones - which the sprite baker flattens into 2D art once
   at load. This mode skips the flattening and draws the same models live: a tilted camera, a
   directional light, a depth buffer, the terrain canvas draped on a ground plane. No second
   set of art exists or is needed; the sprite pipeline and this one share their geometry.

   THE CAMERA IS NORTH-UP TILTED ORTHOGRAPHIC, AND THAT IS A CONTRACT, NOT A TASTE. The whole
   2D game - input picking, selection brackets, health bars, effects, the placement ghost -
   talks to the screen through four functions (_rtsSX, _rtsSY, _rtsGroundAt, _rtsWorldToScreen).
   For a north-up tilted ortho camera those stay CLOSED-FORM:

       screenX = (wx - focus.x) * zoom + W/2                       (identical to 2D)
       screenY = ((wz - focus.z) * cos(tilt) - y * sin(tilt)) * zoom + H/2

   so the 2D renderer turns out to be the special case tilt = 0 with height drawn at y*0.5.
   Every overlay and input path therefore works in 3D by branching those four functions on
   R3.on - no rewrite, no drift between what is drawn and what is clicked. A yawed or
   perspective camera breaks the closed form (screenX would depend on z), which is why both are
   follow-ups behind depth-aware overlays, not defaults.

   The light is the sprite baker's own R3_LIGHT and the shading ramp approximates _r3Ramp's
   cool-shadow / warm-highlight curve, so 3D mode reads as the same game, not a reskin. */

window._R3D = null;

/* Tilt: 0 is straight down (the 2D view); this leans the camera until walls and chimneys
   show real elevation. cos 0.62 rad = 0.81, so ground depth compresses to 81% - enough lean
   to read as 3D, mild enough that the map stays readable as a map. */
var R3D_TILT = 0.62;
var R3D_DEPTH_RANGE = 900;     /* world units mapped into the depth buffer; the map is ~640 */

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

/* NO MATRICES. The camera above is five numbers, so the projection is done longhand in the
   vertex shader from uniforms - uCam packs focus and scale, uTilt the lean. Every mesh is
   drawn in MODEL space and placed by uPos/uRot/uScale, so one buffer per model serves every
   entity of that type. */
var R3D_MESH_VS =
  'attribute vec3 aP; attribute vec3 aN; attribute vec3 aC;' +
  'uniform vec4 uCam;' +        /* focus.x, focus.z, 2*zoom/W, 2*zoom/H */
  'uniform vec2 uTilt;' +       /* cos(tilt), sin(tilt) */
  'uniform vec3 uPos; uniform vec2 uRot; uniform float uScale; uniform float uScaleY; uniform vec3 uTint;' +
  'varying vec3 vC;' +
  'void main(){' +
  '  vec3 p = vec3(aP.x * uScale, aP.y * uScale * uScaleY, aP.z * uScale);' +
  '  vec3 wp = vec3(uPos.x + p.x*uRot.x - p.z*uRot.y, uPos.y + p.y, uPos.z + p.x*uRot.y + p.z*uRot.x);' +
  '  vec3 n = vec3(aN.x*uRot.x - aN.z*uRot.y, aN.y, aN.x*uRot.y + aN.z*uRot.x);' +
  /* the sprite baker's light, so the two pipelines agree about which face is lit */
  '  vec3 L = normalize(vec3(-0.38, 0.76, 0.53));' +
  '  float lam = max(dot(normalize(n), L), 0.0);' +
  '  float v = 0.40 + 0.74 * lam;' +
  /* _r3Ramp in one line: shadows slide toward a cool blue floor instead of black */
  '  vec3 shade = mix(vec3(0.03, 0.04, 0.08), aC, min(v, 1.0));' +
  '  vC = (shade + max(v - 1.0, 0.0) * (vec3(1.0, 0.98, 0.9) - aC) * 0.6) * uTint;' +
  '  float sx = (wp.x - uCam.x) * uCam.z;' +
  '  float sy = ((wp.z - uCam.y) * uTilt.x - wp.y * uTilt.y) * uCam.w;' +
  '  float d  = ((wp.z - uCam.y) * uTilt.y + wp.y * uTilt.x);' +
  '  gl_Position = vec4(sx, -sy, -d / ' + R3D_DEPTH_RANGE.toFixed(1) + ', 1.0);' +
  '}';
/* uA exists for the contact shadows and for nothing else. They are flat discs drawn through
   this same program, and drawn OPAQUE they were not shadows at all - they were holes cut in
   the ground, which under infantry (whose disc came out wider than the figure) read as a unit
   standing in a puddle of void. A shadow has to darken what is under it rather than replace
   it, and that needs blending, which needs an alpha the fragment shader can write. Every
   other draw sets it to 1 and is unchanged. */
var R3D_MESH_FS =
  'precision mediump float; varying vec3 vC; uniform float uA;' +
  'void main(){ gl_FragColor = vec4(vC, uA); }';

/* Ground and fog share one textured program; fog just samples a different texture with
   blending on and the depth test off. */
var R3D_TEX_VS =
  'attribute vec2 aXZ; attribute vec2 aT;' +
  'uniform vec4 uCam; uniform vec2 uTilt;' +
  'varying vec2 vT;' +
  'void main(){' +
  '  vT = aT;' +
  '  float sx = (aXZ.x - uCam.x) * uCam.z;' +
  '  float sy = (aXZ.y - uCam.y) * uTilt.x * uCam.w;' +
  '  float d  = (aXZ.y - uCam.y) * uTilt.y;' +
  '  gl_Position = vec4(sx, -sy, -d / ' + R3D_DEPTH_RANGE.toFixed(1) + ', 1.0);' +
  '}';
var R3D_TEX_FS =
  'precision mediump float; varying vec2 vT; uniform sampler2D uS; uniform float uA;' +
  'void main(){ vec4 c = texture2D(uS, vT); gl_FragColor = vec4(c.rgb, c.a * uA); }';

function _r3dInit() {
  var cv = document.getElementById('rtsCv3d');
  if (!cv) return null;
  /* preserveDrawingBuffer, deliberately. Without it the buffer is discarded after each
     composite, which is invisible to a player but reads back BLACK in any capture - and this
     project verifies its rendering with headless screenshots, so a renderer that cannot be
     screenshotted cannot be tested. The cost is a buffer copy per frame instead of a swap,
     which at this scene's ~11k triangles is not measurable. */
  var gl = cv.getContext('webgl', { antialias: true, alpha: false, preserveDrawingBuffer: true });
  if (!gl) return null;
  var R3;
  try {
    R3 = {
      on: false, cv: cv, gl: gl,
      meshP: _r3dProgram(gl, R3D_MESH_VS, R3D_MESH_FS),
      texP: _r3dProgram(gl, R3D_TEX_VS, R3D_TEX_FS),
      mesh: {}, terrainTex: null, terrainDirty: true,
      fogCv: null, fogTex: null, fogDirty: true,
      cp: Math.cos(R3D_TILT), sp: Math.sin(R3D_TILT)
    };
  } catch (e) { return null; }
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

/* The four-function projection contract, used by camera.js when the mode is on. Kept beside
   the shader that must agree with it: if these two ever disagree, clicks land beside units. */
function _r3dSY(wz) {
  var R = _rtsR;
  return (wz - R.focus.z) * window._R3D.cp * _rtsZoom() + R.H / 2;
}
function _r3dGroundAt(mx, my) {
  var R = _rtsR, z = _rtsZoom();
  return { x: (mx - R.W / 2) / z + R.focus.x,
           z: (my - R.H / 2) / (z * window._R3D.cp) + R.focus.z };
}
function _r3dWorldToScreen(x, y, z) {
  var R3 = window._R3D;
  return { x: _rtsSX(x), y: _r3dSY(z) - (y || 0) * R3.sp * _rtsZoom(), behind: false };
}
