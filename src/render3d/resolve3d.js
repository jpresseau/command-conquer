/* render3d/resolve3d.js - the composite: the finished frame, its occlusion and its glow, put
   onto the canvas with the antialiasing put back. Part of rts.render3d. Split out of post3d.js,
   which owns the offscreen buffer and the occlusion this reads; this is the one pass that turns
   them into the picture, so it is also where anything done to the WHOLE picture belongs. */

/* THE COMPOSITE, WHICH ALSO HAS TO PUT THE ANTIALIASING BACK.

   Drawing into a buffer costs the canvas's multisampling: the canvas was created with
   antialias:true and an offscreen colour texture has no such thing, so every silhouette in the
   scene came back a stair. Measured against the direct-to-canvas frame, that is about 2% of
   pixels moving by up to 88 levels - small in count, and exactly the pixels an eye follows.

   Multisampling the offscreen target instead is the obvious repair and it is not available
   here: the occlusion needs a depth TEXTURE, and resolving a multisampled depth buffer into
   one is not something WebGL2 will do. So the edges are put back in this pass, by FXAA, which
   is the standard answer for precisely this situation - a pipeline that renders through a
   buffer cannot use MSAA and reconstructs its edges from the finished image instead.

   It runs on the SCENE, before the occlusion is applied, not after. The occlusion is a
   half-resolution, twice-blurred signal with no edges of its own to find; running the edge
   filter over the composite would only let it smear the AO across silhouettes it should stop
   at.

   Occlusion multiplies the frame COOL rather than toward black, for the reason the mesh shader
   spells out about its shading ramp: this scene's shade is blue-grey, not absence of light, and
   darkening straight down the channels takes the sky back out of every corner the AO found. */
/* how sharp a break in depth, in world units, counts as a geometric edge for the edge filter */
var R3D_AA_EDGE = 0.25;
var R3D_AO_RESOLVE_FS =
  'precision highp float; varying vec2 vT;' +
  'uniform sampler2D uScene; uniform sampler2D uAO; uniform float uAOAmt;' +
  'uniform vec2 uTexel; uniform float uAA;' +
  /* The glow, added after the occlusion rather than before it: light in the air is not a
     surface and must not be darkened by how much sky that surface can see. See bloom3d.js -
     uBloomAmt is 0 on every frame with nothing burning, which is most of them. */
  'uniform sampler2D uBloom; uniform float uBloomAmt;' +
  /* THE GRADE - the game's own light, applied last, to the whole picture: warm in the highlights
     and cool in the shade, a little more colour, a gentle S-curve, and the far edge of the frame
     hazed toward a pale sky - the sunlit, lived-in look of the later 3D RTS games rather than
     the flat palette of the 2D one. No vignette: #rtsVig already lays one over both modes.
     Part of the light pass, so RTS_POST_ON takes it out with the bloom; R3.gradeAmt (0 to 1)
     takes it out alone, as R3.aoAmt does the occlusion. e2e/grade holds what it does. */
  'uniform float uGrade;' +
  R3D_HEAT_GLSL +                    /* the air over what burns - heat3d.js */
  'vec3 _grade(vec3 c, vec2 uv){' +
  '  float l = dot(c, vec3(0.299, 0.587, 0.114));' +
  '  c *= mix(vec3(0.94, 0.97, 1.06), vec3(1.05, 1.02, 0.93), smoothstep(0.12, 0.72, l));' +
  '  c = clamp(mix(vec3(l), c, 1.06), 0.0, 1.0);' +
  '  c = mix(c, c * c * (3.0 - 2.0 * c), 0.32);' +
  '  return mix(c, vec3(0.83, 0.86, 0.87), smoothstep(0.55, 1.0, uv.y) * 0.22); }' +
  'float _lum(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }' +
  /* ONLY WHERE THERE IS GEOMETRY'S EDGE. FXAA reads colour, so it cannot tell a silhouette
     from detail painted on a surface - and the ground is detail now (render3d/terrain3d.js):
     cobble seams, pebbles, blades. Left alone it smeared all of it, 3.1 levels of contrast gone
     where the multisampled frame loses 0.3 (e2e/ao). Multisampling only ever smooths geometric
     edges, so this does the same: the depth buffer's SECOND difference across the pixel is
     near zero on any plane or gentle slope at every zoom and jumps at a silhouette, and below
     R3D_AA_EDGE the pixel is left exactly as it was. */
  'uniform sampler2D uDepthR;' +
  'vec3 _fxaa(vec2 uv){' +
  '  vec3 mC = texture2D(uScene, uv).rgb;' +
  '  float z0 = texture2D(uDepthR, uv).r;' +
  '  float cx = abs(texture2D(uDepthR, uv + vec2(uTexel.x, 0.0)).r + texture2D(uDepthR, uv - vec2(uTexel.x, 0.0)).r - 2.0 * z0);' +
  '  float cy = abs(texture2D(uDepthR, uv + vec2(0.0, uTexel.y)).r + texture2D(uDepthR, uv - vec2(0.0, uTexel.y)).r - 2.0 * z0);' +
  '  if (max(cx, cy) < ' + (R3D_AA_EDGE / (2 * R3D_DEPTH_RANGE)).toExponential(3) + ') return mC;' +
  '  vec3 nw = texture2D(uScene, uv + vec2(-1.0, -1.0) * uTexel).rgb;' +
  '  vec3 ne = texture2D(uScene, uv + vec2( 1.0, -1.0) * uTexel).rgb;' +
  '  vec3 sw = texture2D(uScene, uv + vec2(-1.0,  1.0) * uTexel).rgb;' +
  '  vec3 se = texture2D(uScene, uv + vec2( 1.0,  1.0) * uTexel).rgb;' +
  '  float lnw = _lum(nw), lne = _lum(ne), lsw = _lum(sw), lse = _lum(se), lm = _lum(mC);' +
  '  float lo = min(lm, min(min(lnw, lne), min(lsw, lse)));' +
  '  float hi = max(lm, max(max(lnw, lne), max(lsw, lse)));' +
  /* a flat neighbourhood has no edge to find, and blurring it is pure loss on pixel art */
  '  if (hi - lo < max(0.1600, hi * 0.400)) return mC;' +
  '  vec2 dir = vec2(-((lnw + lne) - (lsw + lse)), ((lnw + lsw) - (lne + lse)));' +
  '  float red = max((lnw + lne + lsw + lse) * 0.03125, 0.0078125);' +
  '  float rcp = 1.0 / (min(abs(dir.x), abs(dir.y)) + red);' +
  '  dir = clamp(dir * rcp, -8.0, 8.0) * uTexel;' +
  '  vec3 a = 0.5 * (texture2D(uScene, uv + dir * (1.0 / 3.0 - 0.5)).rgb +' +
  '                  texture2D(uScene, uv + dir * (2.0 / 3.0 - 0.5)).rgb);' +
  '  vec3 b = a * 0.5 + 0.25 * (texture2D(uScene, uv - dir * 0.5).rgb +' +
  '                             texture2D(uScene, uv + dir * 0.5).rgb);' +
  '  float lb = _lum(b);' +
  '  return (lb < lo || lb > hi) ? a : b;' +
  '}' +
  'void main(){' +
  '  vec2 hv = vT + _heat(vT);' +
  '  vec3 c = mix(texture2D(uScene, hv).rgb, _fxaa(hv), uAA);' +
  '  float ao = mix(1.0, texture2D(uAO, vT).r, uAOAmt);' +
  '  vec3 lit = c * mix(vec3(' + R3D_AO_FLOOR[0].toFixed(3) + ', ' +
       R3D_AO_FLOOR[1].toFixed(3) + ', ' + R3D_AO_FLOOR[2].toFixed(3) +
       '), vec3(1.0), ao);' +
  '  lit += texture2D(uBloom, vT).rgb * uBloomAmt;' +
  '  lit = mix(lit, _grade(lit, vT), uGrade);' +
  '  gl_FragColor = vec4(lit, 1.0);' +
  '}';

/* The last step of _r3dPostEnd. Leaves the default framebuffer bound and the full viewport set. */
function _r3dResolve(R3) {
  var gl = R3.gl;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, R3.postW, R3.postH);
  gl.useProgram(R3.aoResolveP);
  gl.uniform1i(gl.getUniformLocation(R3.aoResolveP, 'uScene'), 0);
  gl.uniform1i(gl.getUniformLocation(R3.aoResolveP, 'uAO'), 1);
  /* R3.aoAmt exists so the occlusion can be taken out WITHOUT taking the offscreen buffer out
     with it. Turning postReady off does both at once, and the two have separate effects on the
     picture - the buffer has no multisampling, so a postReady A/B measures the occlusion and
     the lost antialiasing added together and cannot tell which is which. */
  gl.uniform1f(gl.getUniformLocation(R3.aoResolveP, 'uAOAmt'),
               !_r3dQ('ao') ? 0 : R3.aoAmt === undefined ? 1 : R3.aoAmt);   /* no pass, no occlusion */
  /* R3.aaAmt, for the same reason as R3.aoAmt: the edge filter and the occlusion are separate
     claims and a spec has to be able to grade one without the other moving. */
  gl.uniform1f(gl.getUniformLocation(R3.aoResolveP, 'uAA'),
               R3.aaAmt === undefined ? 1 : R3.aaAmt);
  gl.uniform2f(gl.getUniformLocation(R3.aoResolveP, 'uTexel'), 1 / R3.postW, 1 / R3.postH);
  var postOn = typeof RTS_POST_ON === 'undefined' || RTS_POST_ON;
  gl.uniform1f(gl.getUniformLocation(R3.aoResolveP, 'uGrade'),
               postOn ? (R3.gradeAmt === undefined ? 1 : R3.gradeAmt) : 0);
  _r3dHeatSet(gl, R3, R3.aoResolveP, postOn && _r3dQ('heat'));
  /* The glow. R3.bloomOn is set by _r3dBloomPass for this frame only; with nothing burning the
     amount is zero and the sampler still needs a bound texture, so it gets the AO one - a
     texture multiplied by zero, rather than a branch in the shader every pixel. */
  var bloomAmt = R3.bloomOn ? (R3.bloomAmt === undefined ? R3D_BLOOM_AMT : R3.bloomAmt) : 0;
  gl.uniform1f(gl.getUniformLocation(R3.aoResolveP, 'uBloomAmt'), bloomAmt);
  gl.uniform1i(gl.getUniformLocation(R3.aoResolveP, 'uBloom'), 2);
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, (R3.bloomOn && R3.bloomTex) ? R3.bloomTex : R3.aoTex);
  gl.uniform1i(gl.getUniformLocation(R3.aoResolveP, 'uDepthR'), 3);
  gl.activeTexture(gl.TEXTURE3);
  gl.bindTexture(gl.TEXTURE_2D, R3.sceneDepth);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, R3.sceneTex);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, R3.aoTex);
  _r3dQuad(R3, R3.aoResolveP);
  /* AND THE DEPTH COMES BACK OFF ITS UNIT. Left bound, it is still there when the next frame
     draws into the buffer it belongs to, and a program with a sampler on that unit - the
     ground's grain sampler, which the material ground never rebinds - is then reading the
     depth attachment it is writing. WebGL refuses the draw outright (INVALID_OPERATION), and
     it was the ground: e2e/terrainmat checks the error flag at every zoom for this. */
  gl.activeTexture(gl.TEXTURE3);
  gl.bindTexture(gl.TEXTURE_2D, null);
}
