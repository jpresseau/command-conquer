/* render3d/shadow3d.js - the sun's own view of the map, and the depth map it leaves behind.
   Part of rts.render3d.

   WHAT THIS IS FOR. Until this, nothing in the 3D mode shaded anything else. A forest stood on
   ground as bright as the clearing beside it, a ridge threw nothing across the grass, and a
   building's own courtyard was lit as though the walls were not there. Entities had a planar
   cast shadow - their own mesh squashed onto the ground - which grounds a tank and does
   nothing for the rest of the map, because a planar shadow only ever lands on the plane.

   A shadow MAP has no such limit: render the scene once from the sun, keep the distance to the
   nearest thing it can see in every direction, and any surface further from the sun than that
   is in shade. Trees shade the forest floor, ridges shade the grass, and a building shades the
   ground and the units standing in it, all from one pass.

   THE LIGHT IS THE SHADING LIGHT WITH ITS Z FLIPPED, the same sun the planar shadows used and
   for the same measured reason - R3_LIGHT is the sprite baker's and sits 22 degrees off the
   camera's own axis, so its own shadows fall behind the things casting them. The measurement
   and the reasoning are at R3D_SUN below.

   NO MATRICES, TO MATCH THE REST OF THE RENDERER. A shadow map is usually a matrix multiply,
   but this renderer does its projection longhand from a handful of uniforms and there is no
   reason for this pass to be the exception. The sun's view is an orthonormal basis - right, up
   and forward - and the transform is three dot products:

       lx = dot(p - centre, right)     ly = dot(p - centre, up)     lz = dot(p - centre, fwd)

   which is exactly a matrix multiply written out, and keeps the whole file readable without a
   matrix library the project does not have.

   DEPTH IS PACKED INTO COLOUR, NOT INTO A DEPTH TEXTURE. Sampling a depth attachment needs
   WEBGL_depth_texture on WebGL1 or a WebGL2 context, and this renderer supports plain WebGL1
   deliberately. Two channels of an ordinary RGBA8 target give 16 bits, which over this pass's
   depth range is about a centimetre - far finer than the bias the comparison needs anyway. One
   code path, no extensions, works everywhere the mode already works. */

var R3D_SHADOW_SIZE = 1024;    /* the map is square. 1024 over a view a few dozen cells across
                                  is about a texel per 6cm of ground at the top zoom, which is
                                  finer than the 3x3 PCF kernel that samples it. 2048 was tried
                                  and is not visibly different. */
/* How much of the world the sun's view covers, as a multiple of the camera's own view radius.
   Bigger wastes resolution on ground nobody is looking at; smaller and things just off screen
   stop casting into the frame, which reads as shadows switching on as you pan. */
var R3D_SHADOW_SPAN = 1.35;
/* The depth range the pass spans, in world units, and the bias that stops a surface shadowing
   itself. Acne is the classic failure - a lit surface samples its own depth, half its texels
   come back "further", and the whole thing stipples. */
var R3D_SHADOW_RANGE = 260;
var R3D_SHADOW_BIAS = 0.0022;

/* THE SUN IS THE SHADING LIGHT WITH ITS Z FLIPPED, and that is not a shortcut - it is the only
   direction that produces a shadow anyone can see.

   R3_LIGHT is the sprite baker's, and the baker chose it to light the face the camera sees
   most: upper-left and IN FRONT, +z, so that a front elevation does not sit at flat ambient.
   That puts it 22 degrees off the camera's own axis, which is very nearly a headlight.
   Measured, the true shadow of a point at height h lands at screen dy -0.568h while the
   object's own top lands at -0.581h - the shadow would hide behind the object casting it, to
   within 2%, at every zoom and every position on screen.

   Flipping z swings the source behind the scene and throws the shadow DOWN and to the right,
   which is where the rest of the game already puts it: _sprShadow offsets every baked sprite by
   a positive dx and dy, and so does the original's artwork. The two modes agree with each
   other, and the SHADING keeps the light the baker picked for it - only the shadow moves.
   e2e/shadows grades this as a sign, and with the flip removed it measures 16px instead of
   217px below the caster.

   The basis itself: forward is the direction the light TRAVELS, so it is minus the surface-to-
   light vector; right and up complete it. Built once - the sun does not move. */
var R3D_SUN = (function () {
  var Lx = R3_LIGHT[0], Ly = R3_LIGHT[1], Lz = -R3_LIGHT[2];   /* the z-flipped sun */
  var m = Math.hypot(Lx, Ly, Lz);
  Lx /= m; Ly /= m; Lz /= m;
  var fx = -Lx, fy = -Ly, fz = -Lz;
  /* right = normalize(cross(worldUp, forward)); the sun is well off vertical, so worldUp and
     forward are never parallel and the degenerate case cannot arise */
  var rx = 1 * fz - 0 * fy, ry = 0 * fx - 0 * fz, rz = 0 * fy - 1 * fx;
  var rm = Math.hypot(rx, ry, rz);
  rx /= rm; ry /= rm; rz /= rm;
  var ux = fy * rz - fz * ry, uy = fz * rx - fx * rz, uz = fx * ry - fy * rx;
  return { L: [Lx, Ly, Lz], f: [fx, fy, fz], r: [rx, ry, rz], u: [ux, uy, uz] };
})();

/* The depth-only pass. Positions come in exactly as the mesh program takes them - the same
   attribute, the same placement uniforms, the same wave displacement - because anything that
   moves in the main pass has to move here too or its shadow stands still while it walks. */
var R3D_SHADOW_VS =
  'attribute vec3 aP;' +
  'uniform vec3 uPos; uniform vec2 uRot; uniform float uScale; uniform float uScaleY;' +
  'uniform vec2 uWave;' +
  'uniform vec3 uSunR; uniform vec3 uSunU; uniform vec3 uSunF; uniform vec3 uSunC;' +
  'uniform vec2 uSunSpan;' +      /* half-extent across, and the depth range */
  'varying float vD;' +
  'void main(){' +
  '  vec3 p = vec3(aP.x * uScale, aP.y * uScale * uScaleY, aP.z * uScale);' +
  '  vec3 wp = vec3(uPos.x + p.x*uRot.x - p.z*uRot.y, uPos.y + p.y, uPos.z + p.x*uRot.y + p.z*uRot.x);' +
  '  if (uWave.x > 0.0) {' +
  '    float q1 = wp.x * 0.34 + wp.z * 0.22 + uWave.y * 1.15;' +
  '    float q2 = wp.x * 0.19 - wp.z * 0.41 + uWave.y * 0.85;' +
  '    float q3 = wp.x * 1.35 + wp.z * 0.95 + uWave.y * 2.40;' +
  '    wp.y += uWave.x * (sin(q1) + 0.7 * sin(q2) + 0.45 * sin(q3));' +
  '  }' +
  '  vec3 d = wp - uSunC;' +
  '  float lx = dot(d, uSunR), ly = dot(d, uSunU), lz = dot(d, uSunF);' +
  '  vD = lz / uSunSpan.y * 0.5 + 0.5;' +
  '  gl_Position = vec4(lx / uSunSpan.x, ly / uSunSpan.x, vD * 2.0 - 1.0, 1.0);' +
  '}';
/* 16 bits across two channels. The fract/floor pair is the standard pack: the high byte is the
   value, the low byte is what the high byte threw away, scaled back up. */
var R3D_SHADOW_FS =
  'precision highp float; varying float vD;' +
  'void main(){' +
  '  float d = clamp(vD, 0.0, 1.0);' +
  '  float hi = floor(d * 255.0) / 255.0;' +
  '  float lo = fract(d * 255.0);' +
  '  gl_FragColor = vec4(hi, lo, 0.0, 1.0);' +
  '}';

/* The GLSL the MAIN shaders use to read this back. Kept here, beside the shader that writes
   it, so the pack and the unpack cannot drift apart - they are two halves of one format. */
var R3D_SHADOW_GLSL =
  'uniform sampler2D uShadowMap; uniform vec2 uSunSpan; uniform float uShadowOn;' +
  'varying vec3 vL;' +
  'float _shUnpack(vec2 rg){ return rg.x + rg.y / 255.0; }' +
  /* One tap, and then eight more around it. A single tap gives a hard aliased edge a couple of
     texels wide, which at this shadow-map scale is a visible staircase on every tree; nine taps
     over a texel radius is a soft edge for eight extra samples. */
  'float _shadowAt(){' +
  '  if (uShadowOn < 0.5) return 1.0;' +
  '  vec2 uv = vL.xy * 0.5 + 0.5;' +
  '  if (uv.x < 0.001 || uv.x > 0.999 || uv.y < 0.001 || uv.y > 0.999) return 1.0;' +
  '  float me = vL.z - ' + R3D_SHADOW_BIAS.toFixed(6) + ';' +
  '  float s = 0.0;' +
  '  float t = 1.0 / ' + R3D_SHADOW_SIZE.toFixed(1) + ';' +
  '  for (int j = -1; j <= 1; j++) {' +
  '    for (int i = -1; i <= 1; i++) {' +
  '      vec2 o = vec2(float(i), float(j)) * t;' +
  '      s += _shUnpack(texture2D(uShadowMap, uv + o).rg) < me ? 0.0 : 1.0;' +
  '    }' +
  '  }' +
  '  return s / 9.0;' +
  '}';
/* And the vertex-side half: where this fragment sits in the sun's view. */
var R3D_SHADOW_VGLSL =
  'uniform vec3 uSunR; uniform vec3 uSunU; uniform vec3 uSunF; uniform vec3 uSunC;' +
  'uniform vec2 uSunSpan;' +
  'varying vec3 vL;' +
  'void _shadowFrom(vec3 wp){' +
  '  vec3 d = wp - uSunC;' +
  '  vL = vec3(dot(d, uSunR) / uSunSpan.x, dot(d, uSunU) / uSunSpan.x,' +
  '            dot(d, uSunF) / uSunSpan.y * 0.5 + 0.5);' +
  '}';

function _r3dShadowInit(R3) {
  var gl = R3.gl, S = R3D_SHADOW_SIZE;
  R3.shadowTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, R3.shadowTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, S, S, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  /* NEAREST, and that is not an oversight. The packed depth is two channels of one number;
     filtering them averages the high byte with its neighbour's and the low byte with its
     neighbour's SEPARATELY, which is not the average of the two depths and is not any depth at
     all. Softness comes from the nine taps in _shadowAt, which average the COMPARISON. */
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  R3.shadowRb = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, R3.shadowRb);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, S, S);

  R3.shadowFbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, R3.shadowFbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, R3.shadowTex, 0);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, R3.shadowRb);
  var ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  if (!ok) return false;
  R3.shadP = _r3dProgram(gl, R3D_SHADOW_VS, R3D_SHADOW_FS);
  return true;
}

/* WHERE THE SUN LOOKS. It has to cover what the camera can see, and no more than it has to:
   every world unit of span is resolution taken away from the shadows the player is looking at.
   The centre is the middle of the visible ground, lifted to the middle of the world's height
   so the near and far clip have something to spare, and the span is the view's own radius with
   a margin for geometry standing just off screen and casting into it. */
function _r3dSunView() {
  var vb = _r3dViewBounds();
  var cx = (vb.x0 + vb.x1) / 2, cz = (vb.z0 + vb.z1) / 2;
  var half = Math.max(vb.x1 - vb.x0, vb.z1 - vb.z0) * 0.5 * R3D_SHADOW_SPAN;
  return { c: [cx, R3D_WORLD_YMAX * 0.5, cz], span: Math.max(8, half) };
}

/* The pass itself. Colour only - the depth attachment is there so the nearest surface wins,
   not to be read. NOTHING IS CULLED: front-face culling is the usual answer to shadow acne,
   and it needs every caster to be a closed solid. Most of this world is - the slabs and boxes
   are - but the cones the trees, crags and ore crystals are built from are not reliably
   capped, and an open caster with its front faces culled leaves the light a way through it.
   A hole in a tree's shadow is worse than the acne the bias already handles. */
function _r3dShadowPass(G, draw) {
  var R3 = window._R3D, gl = R3.gl, sv = _r3dSunView();
  R3.sunC = sv.c; R3.sunSpan = sv.span;
  gl.bindFramebuffer(gl.FRAMEBUFFER, R3.shadowFbo);
  gl.viewport(0, 0, R3D_SHADOW_SIZE, R3D_SHADOW_SIZE);
  gl.clearColor(1, 1, 1, 1);
  gl.disable(gl.BLEND);
  gl.enable(gl.DEPTH_TEST);
  gl.depthMask(true);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  gl.useProgram(R3.shadP);
  var P = R3.shadP;
  gl.uniform3fv(gl.getUniformLocation(P, 'uSunR'), R3D_SUN.r);
  gl.uniform3fv(gl.getUniformLocation(P, 'uSunU'), R3D_SUN.u);
  gl.uniform3fv(gl.getUniformLocation(P, 'uSunF'), R3D_SUN.f);
  gl.uniform3fv(gl.getUniformLocation(P, 'uSunC'), sv.c);
  gl.uniform2f(gl.getUniformLocation(P, 'uSunSpan'), sv.span, R3D_SHADOW_RANGE);
  draw(P);

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, R3.cv.width, R3.cv.height);
}

/* Hand the sun's view to a program that reads the map. Called once per program per frame. */
function _r3dShadowBind(P, unit) {
  var R3 = window._R3D, gl = R3.gl;
  gl.uniform3fv(gl.getUniformLocation(P, 'uSunR'), R3D_SUN.r);
  gl.uniform3fv(gl.getUniformLocation(P, 'uSunU'), R3D_SUN.u);
  gl.uniform3fv(gl.getUniformLocation(P, 'uSunF'), R3D_SUN.f);
  gl.uniform3fv(gl.getUniformLocation(P, 'uSunC'), R3.sunC || [0, 0, 0]);
  gl.uniform2f(gl.getUniformLocation(P, 'uSunSpan'), R3.sunSpan || 64, R3D_SHADOW_RANGE);
  gl.uniform1f(gl.getUniformLocation(P, 'uShadowOn'), R3.shadowReady ? 1 : 0);
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, R3.shadowTex);
  gl.uniform1i(gl.getUniformLocation(P, 'uShadowMap'), unit);
  gl.activeTexture(gl.TEXTURE0);
}
