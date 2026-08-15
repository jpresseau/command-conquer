/* render3d/post3d.js - the offscreen buffer the frame is drawn into, and the ambient occlusion
   computed from its depth. Part of rts.render3d.

   WHAT THIS IS FOR. The sun's shadow map answers "does the sun reach this pixel", and it
   transformed the map. It cannot answer the other question light asks, which is "how much of
   the SKY can this pixel see" - and that is the one that makes things sit in a scene rather
   than float on top of it. Every inside corner, every place a wall meets the ground, the gap
   under a tank, the seam where a chimney leaves a roof: all of those see less sky than open
   ground does, and all of them were rendered at exactly the same ambient as open ground. That
   flat ambient constant is most of what still read as "flat" after the shadows landed.

   Screen-space ambient occlusion approximates the answer from the depth buffer: around each
   pixel, sample a hemisphere of points facing away from the surface, and count how many of
   them are BEHIND something the camera can see. A point in an open field occludes nothing; a
   point in a corner has half its hemisphere buried in wall.

   THIS NEEDS THE FRAME IN A BUFFER IT CAN READ, which the mode did not have - it drew straight
   to the canvas, and a canvas's depth buffer cannot be sampled. So the frame now goes to an
   offscreen colour target with a depth TEXTURE attached, the occlusion is computed from that
   depth, and the two are composited to the canvas at the end. The same buffer is what a
   tonemap, a bloom and an FXAA pass would all read, so this is the plumbing for the rest of it
   as much as it is this effect.

   NO MATRICES, AGAIN, and here that is not just consistency - it falls out unusually well.
   This renderer writes LINEAR depth: gl_Position.z is -d/RANGE premultiplied by w, so after
   the hardware divide the depth buffer holds -d/RANGE exactly, and

       d = (0.5 - texel) * 2 * RANGE

   recovers camera depth with one subtract. The rest of the position comes back the same way
   the vertex shader put it there, run backwards:

       pw = 1 - d/D            u  = ndc.x * pw / uCam.z          sv = -ndc.y * pw / uCam.w

   and (u, sv, d) is worth naming: sv and d are a plain ROTATION of world (z, y) by the camera
   tilt, and u is world x untouched. So the three are an orthonormal frame of world space, and
   a distance measured in them is a distance in WORLD UNITS. The occlusion radius below is
   therefore in the same units as everything else on the map - it is a third of a cell, not a
   tuned screen-space fudge that changes meaning with the zoom.

   NORMALS COME FROM THE DEPTH, NOT FROM A G-BUFFER. Two neighbouring depths reconstruct two
   more positions, and their cross product is the surface normal - no second attachment, no
   second pass over the geometry. Sampled on BOTH sides and the nearer difference kept, because
   at a silhouette the far side straddles two surfaces and its cross product is garbage; that
   is the difference between clean edges and a dark halo around every unit.

   WHY WEBGL2 IS TRIED FIRST. Sampling a depth attachment needs a depth texture, which is core
   in WebGL2 and an extension on WebGL1. The context request now asks for WebGL2 and falls back
   to WebGL1, and every existing shader in this renderer is GLSL ES 1.00 - which a WebGL2
   context compiles unchanged, so nothing else in the mode had to move. Where neither a WebGL2
   context nor WEBGL_depth_texture is available, R3.postReady stays false and the frame is
   drawn exactly as it was before this file existed. */

/* Half resolution. Occlusion is a low-frequency signal - it is blurred immediately afterwards
   anyway - and this is the difference between a pass that costs a quarter of the frame and one
   that costs most of it. */
var R3D_AO_DIV = 2;
/* The hemisphere radius, IN WORLD UNITS (see the note above - the reconstruction frame is
   orthonormal, so this is a real distance). A cell is RTS_TILE across, so 1.6 is about a
   three quarters of one: wide enough that the darkening at a wall's foot READS at the zoom the
   game is played at, narrow enough that a building does not shade the road on the far side of
   itself. Tried at 1.6 first, which is correct-looking in the occlusion buffer and invisible in
   the frame - it moved 0.55% of pixels by an average of 4 levels. */
var R3D_AO_RADIUS = 3.0;
/* How far a surface may be from a sample before the sample stops counting - without this a
   building occludes ground a hundred units behind it, which reads as a dark smear following
   every silhouette. In world units, like the radius, and it has to clear the height of the
   things that do the occluding: a war factory's roof is about seven units above the ground it
   should be darkening, so a range of 3.2 was attenuating exactly the case this is for. */
var R3D_AO_RANGE = 8.0;
/* Lifted off the surface so it does not occlude itself, the same failure the shadow map's bias
   answers. Small: the reconstruction is exact rather than interpolated, so this only has to
   cover the depth buffer's own quantisation. */
var R3D_AO_BIAS = 0.045;
/* How dark a fully enclosed pixel goes. Occlusion is not a shadow and must not read as one -
   the sun's map draws those, and an AO strong enough to be noticed on its own is the effect
   everyone recognises as "the screen-space AO is turned up too high". */
var R3D_AO_STRENGTH = 1.6;
var R3D_AO_SAMPLES = 12;

/* THE HEMISPHERE, as a fixed set of offsets rather than a random one per pixel. A golden-angle
   spiral over the disc, lifted onto the hemisphere, with the radius growing as a power so the
   samples bunch toward the centre - which is where occlusion actually varies. Fixed means the
   pattern is the same every frame, so the AO does not crawl when the camera stands still. */
var R3D_AO_KERNEL = (function () {
  var k = [], i, GA = Math.PI * (3 - Math.sqrt(5));
  for (i = 0; i < R3D_AO_SAMPLES; i++) {
    var t = (i + 0.5) / R3D_AO_SAMPLES;
    /* Cosine-weighted over the hemisphere: dense near the normal, thinning toward the tangent
       plane, which is how a surface actually gathers light. */
    var cy = Math.sqrt(1 - t), sy = Math.sqrt(t);
    var a = i * GA;
    /* THE RADIUS IS DECORRELATED FROM THE DIRECTION, and that is the whole point of the golden
       ratio here rather than another function of i. Tie the two together - short samples near
       the normal, long ones near the tangent - and every short sample points straight up, where
       nothing is ever in the way, while every long one lies flat on the surface, where nothing
       is either. Measured, that kernel found almost no occlusion at all outside the concave
       detail of a roof. Walking the radius by the golden ratio puts long samples along the
       normal and short ones along the tangent as well. */
    var s = 0.30 + 0.70 * ((i * 0.6180339887) % 1);
    k.push(Math.cos(a) * sy * s, cy * s, Math.sin(a) * sy * s);
  }
  return k;
})();

/* Reconstruction, shared by the occlusion pass and its blur. uProj packs the four numbers the
   vertex shader used - the two clip scales, 1/eye distance, and the depth range - so this is
   the same arithmetic run backwards rather than a second opinion about the camera. */
var R3D_AO_RECON =
  'uniform sampler2D uDepth; uniform vec4 uProj;' +
  'float _aoD(vec2 uv){ return (0.5 - texture2D(uDepth, uv).r) * 2.0 * uProj.w; }' +
  /* the full position, in the orthonormal (across, down-screen, into-screen) frame */
  'vec3 _aoP(vec2 uv, float d){' +
  '  float pw = 1.0 - d * uProj.z;' +
  '  return vec3((uv.x * 2.0 - 1.0) * pw / uProj.x,' +
  '              -(uv.y * 2.0 - 1.0) * pw / uProj.y, d);' +
  '}' +
  /* and the inverse - a point in that frame back to a texture coordinate */
  'vec2 _aoUV(vec3 p){' +
  '  float pw = 1.0 - p.z * uProj.z;' +
  '  return vec2(p.x * uProj.x / pw * 0.5 + 0.5, -p.y * uProj.y / pw * 0.5 + 0.5);' +
  '}';

var R3D_QUAD_VS =
  'attribute vec2 aP; varying vec2 vT;' +
  'void main(){ vT = aP * 0.5 + 0.5; gl_Position = vec4(aP, 0.0, 1.0); }';

var R3D_AO_FS =
  'precision highp float; varying vec2 vT; uniform vec2 uTexel;' +
  R3D_AO_RECON +
  'uniform vec3 uK[' + R3D_AO_SAMPLES + '];' +
  /* THE NORMAL, FROM THE NEARER NEIGHBOUR ON EACH AXIS. Taking the forward difference alone
     puts a one-pixel band of the wrong surface along every silhouette, and its cross product
     points somewhere arbitrary - which shows up as a dark outline around every unit. Comparing
     the forward and backward depths and keeping whichever is closer to this pixel's own keeps
     the difference on THIS surface. */
  'vec3 _aoN(vec2 uv, vec3 P){' +
  '  float dxp = _aoD(uv + vec2(uTexel.x, 0.0)), dxm = _aoD(uv - vec2(uTexel.x, 0.0));' +
  '  float dyp = _aoD(uv + vec2(0.0, uTexel.y)), dym = _aoD(uv - vec2(0.0, uTexel.y));' +
  '  vec3 ex = abs(dxp - P.z) < abs(dxm - P.z)' +
  '          ? _aoP(uv + vec2(uTexel.x, 0.0), dxp) - P' +
  '          : P - _aoP(uv - vec2(uTexel.x, 0.0), dxm);' +
  '  vec3 ey = abs(dyp - P.z) < abs(dym - P.z)' +
  '          ? _aoP(uv + vec2(0.0, uTexel.y), dyp) - P' +
  '          : P - _aoP(uv - vec2(0.0, uTexel.y), dym);' +
  '  vec3 n = cross(ex, ey);' +
  '  float m = length(n);' +
  '  if (m < 1e-8) return vec3(0.0, 0.0, 1.0);' +
  '  n /= m;' +
  /* AND TURNED TO FACE THE EYE. Which way round the cross product comes out depends on the
     handedness of the frame and on which neighbour each difference happened to pick, and a
     normal pointing INTO the surface buries the whole hemisphere in solid geometry - every
     sample reads as occluded and the entire frame goes dark. (Measured: 98% of pixels
     darkened, by an average of 17 levels.) A surface the camera can see always faces the eye,
     which sits at (0, 0, D) in this frame, so the test needs nothing else to be known. */
  '  return dot(n, vec3(0.0, 0.0, 1.0 / uProj.z) - P) < 0.0 ? -n : n;' +
  '}' +
  'void main(){' +
  '  float raw = texture2D(uDepth, vT).r;' +
  /* nothing was drawn here - the clear value. Sky occludes nothing. */
  '  if (raw > 0.99999) { gl_FragColor = vec4(1.0); return; }' +
  '  float d = (0.5 - raw) * 2.0 * uProj.w;' +
  '  vec3 P = _aoP(vT, d);' +
  '  vec3 N = _aoN(vT, P);' +
  /* A PER-PIXEL TURN OF THE PATTERN. Twelve fixed samples on their own tile visibly - the
     same twelve directions at every pixel put a repeating rosette over the whole frame. Turning
     the kernel by a hash of the pixel trades that for noise, and noise is what the blur below
     is for. */
  '  float a = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) * 6.2831853;' +
  '  float ca = cos(a), sa = sin(a);' +
  /* the hemisphere basis: any tangent will do, so build one that cannot degenerate */
  '  vec3 T = abs(N.y) < 0.9 ? normalize(cross(vec3(0.0, 1.0, 0.0), N))' +
  '                          : normalize(cross(vec3(1.0, 0.0, 0.0), N));' +
  '  vec3 B = cross(N, T);' +
  '  float occ = 0.0;' +
  '  for (int i = 0; i < ' + R3D_AO_SAMPLES + '; i++) {' +
  '    vec3 k = uK[i];' +
  '    vec3 kr = vec3(k.x * ca - k.z * sa, k.y, k.x * sa + k.z * ca);' +
  '    vec3 S = P + (T * kr.x + N * kr.y + B * kr.z) * ' + R3D_AO_RADIUS.toFixed(3) + ';' +
  '    vec2 su = _aoUV(S);' +
  '    if (su.x < 0.0 || su.x > 1.0 || su.y < 0.0 || su.y > 1.0) continue;' +
  '    float sraw = texture2D(uDepth, su).r;' +
  '    if (sraw > 0.99999) continue;' +
  '    float sd = (0.5 - sraw) * 2.0 * uProj.w;' +
  /* d grows TOWARD the eye, so the surface hides the sample when its depth is the larger */
  '    float hidden = step(S.z + ' + R3D_AO_BIAS.toFixed(3) + ', sd);' +
  /* and it only counts if it is near enough to be the same piece of world */
  '    float near = smoothstep(0.0, 1.0, ' + R3D_AO_RANGE.toFixed(3) +
       ' / max(abs(sd - P.z), 0.0001));' +
  '    occ += hidden * near;' +
  '  }' +
  '  occ = occ / float(' + R3D_AO_SAMPLES + ') * ' + R3D_AO_STRENGTH.toFixed(3) + ';' +
  '  gl_FragColor = vec4(clamp(1.0 - occ, 0.0, 1.0));' +
  '}';

/* THE BLUR IS DEPTH-AWARE, and it has to be. A plain box blur pulls the dark of a tank's
   underside out across the ground beside it, which is the halo that makes screen-space AO look
   like a sticker. Weighting each tap by how close its depth is to the centre's keeps the blur
   inside one surface. Separable: this program runs twice, with uDir picking the axis. */
var R3D_AO_BLUR_FS =
  'precision highp float; varying vec2 vT; uniform sampler2D uAO;' +
  'uniform vec2 uTexel; uniform vec2 uDir;' +
  R3D_AO_RECON +
  'void main(){' +
  '  float c = _aoD(vT), s = 0.0, w = 0.0;' +
  '  for (int i = -3; i <= 3; i++) {' +
  '    vec2 o = uDir * uTexel * float(i);' +
  '    float wd = 1.0 / (1.0 + abs(_aoD(vT + o) - c) * 4.0);' +
  '    s += texture2D(uAO, vT + o).r * wd;' +
  '    w += wd;' +
  '  }' +
  '  gl_FragColor = vec4(s / w);' +
  '}';

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
var R3D_AO_RESOLVE_FS =
  'precision highp float; varying vec2 vT;' +
  'uniform sampler2D uScene; uniform sampler2D uAO; uniform float uAOAmt;' +
  'uniform vec2 uTexel; uniform float uAA;' +
  'float _lum(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }' +
  'vec3 _fxaa(vec2 uv){' +
  '  vec3 mC = texture2D(uScene, uv).rgb;' +
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
  '  vec3 c = mix(texture2D(uScene, vT).rgb, _fxaa(vT), uAA);' +
  '  float ao = mix(1.0, texture2D(uAO, vT).r, uAOAmt);' +
  '  gl_FragColor = vec4(c * mix(vec3(0.62, 0.66, 0.78), vec3(1.0), ao), 1.0);' +
  '}';

/* --------------------------------------------------------------------------- setup -- */

function _r3dPostTex(gl, w, h, internal, format, type, filter) {
  var t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}

/* Sized to the canvas, so this reruns whenever the canvas does. Returns false rather than
   throwing on an incomplete framebuffer - a driver that will not give one of these attachments
   gets the mode without the effect, not a black screen. */
function _r3dPostSize(R3) {
  var gl = R3.gl, w = R3.cv.width, h = R3.cv.height;
  if (!w || !h) return false;
  if (R3.postW === w && R3.postH === h) return true;
  var aw = Math.max(1, w / R3D_AO_DIV | 0), ah = Math.max(1, h / R3D_AO_DIV | 0);

  ['sceneTex', 'sceneDepth', 'aoTex', 'aoTex2'].forEach(function (k) {
    if (R3[k]) { gl.deleteTexture(R3[k]); R3[k] = null; }
  });
  R3.sceneTex = _r3dPostTex(gl, w, h, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR);
  R3.sceneDepth = _r3dPostTex(gl, w, h, R3.depthInternal, gl.DEPTH_COMPONENT,
                              R3.depthType, gl.NEAREST);
  R3.aoTex = _r3dPostTex(gl, aw, ah, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR);
  R3.aoTex2 = _r3dPostTex(gl, aw, ah, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR);

  gl.bindFramebuffer(gl.FRAMEBUFFER, R3.sceneFbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, R3.sceneTex, 0);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, R3.sceneDepth, 0);
  var ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  if (!ok) return false;

  R3.postW = w; R3.postH = h; R3.aoW = aw; R3.aoH = ah;
  return true;
}

function _r3dPostInit(R3) {
  var gl = R3.gl;
  /* WebGL2 has depth textures in core. On WebGL1 the extension provides the same enums, and
     its 24-bit-in-an-int form is what this asks for either way. */
  if (R3.gl2) {
    R3.depthInternal = gl.DEPTH_COMPONENT24;
    R3.depthType = gl.UNSIGNED_INT;
  } else {
    if (!gl.getExtension('WEBGL_depth_texture')) return false;
    R3.depthInternal = gl.DEPTH_COMPONENT;
    R3.depthType = gl.UNSIGNED_INT;
  }
  R3.aoP = _r3dProgram(gl, R3D_QUAD_VS, R3D_AO_FS);
  R3.aoBlurP = _r3dProgram(gl, R3D_QUAD_VS, R3D_AO_BLUR_FS);
  R3.aoResolveP = _r3dProgram(gl, R3D_QUAD_VS, R3D_AO_RESOLVE_FS);
  R3.sceneFbo = gl.createFramebuffer();
  R3.aoFbo = gl.createFramebuffer();
  R3.quadBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, R3.quadBuf);
  gl.bufferData(gl.ARRAY_BUFFER,
                new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  return _r3dPostSize(R3);
}

/* ---------------------------------------------------------------------------- pass -- */

/* One triangle rather than two, which is the usual way to cover a viewport: the shared edge of
   a quad is rasterised twice, and there is no seam to get wrong when there is no seam. */
function _r3dQuad(R3, P) {
  var gl = R3.gl;
  gl.useProgram(P);
  gl.bindBuffer(gl.ARRAY_BUFFER, R3.quadBuf);
  var a = gl.getAttribLocation(P, 'aP');
  gl.enableVertexAttribArray(a);
  gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

/* Everything the reconstruction needs, from the same numbers the vertex shader was given. */
function _r3dPostProj(R3, P, cam, invD) {
  R3.gl.uniform4f(R3.gl.getUniformLocation(P, 'uProj'),
                  cam[2], cam[3], invD, R3D_DEPTH_RANGE);
}

/* Redirect the frame into the offscreen buffer. Called where the frame used to clear. */
function _r3dPostBegin(R3) {
  var gl = R3.gl;
  if (!_r3dPostSize(R3)) { R3.postReady = false; return false; }
  gl.bindFramebuffer(gl.FRAMEBUFFER, R3.sceneFbo);
  gl.viewport(0, 0, R3.postW, R3.postH);
  return true;
}

/* Occlude, blur it twice, and put the result on the canvas. Leaves the default framebuffer
   bound and the full viewport set, so the fog pass that follows draws straight to the screen -
   the shroud is not a surface and must not be occluded, nor occlude anything. */
function _r3dPostEnd(R3, cam, invD) {
  var gl = R3.gl, i;
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.BLEND);
  gl.depthMask(false);

  /* --- occlusion, at half resolution --- */
  gl.bindFramebuffer(gl.FRAMEBUFFER, R3.aoFbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, R3.aoTex, 0);
  gl.viewport(0, 0, R3.aoW, R3.aoH);
  gl.useProgram(R3.aoP);
  _r3dPostProj(R3, R3.aoP, cam, invD);
  gl.uniform2f(gl.getUniformLocation(R3.aoP, 'uTexel'), 1 / R3.aoW, 1 / R3.aoH);
  gl.uniform3fv(gl.getUniformLocation(R3.aoP, 'uK'), R3D_AO_KERNEL);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, R3.sceneDepth);
  gl.uniform1i(gl.getUniformLocation(R3.aoP, 'uDepth'), 0);
  _r3dQuad(R3, R3.aoP);

  /* --- the two blur axes, ping-ponging between the pair of half-res targets --- */
  gl.useProgram(R3.aoBlurP);
  _r3dPostProj(R3, R3.aoBlurP, cam, invD);
  gl.uniform2f(gl.getUniformLocation(R3.aoBlurP, 'uTexel'), 1 / R3.aoW, 1 / R3.aoH);
  gl.uniform1i(gl.getUniformLocation(R3.aoBlurP, 'uDepth'), 0);
  gl.uniform1i(gl.getUniformLocation(R3.aoBlurP, 'uAO'), 1);
  gl.activeTexture(gl.TEXTURE1);
  for (i = 0; i < 2; i++) {
    var src = i ? R3.aoTex2 : R3.aoTex, dst = i ? R3.aoTex : R3.aoTex2;
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, dst, 0);
    gl.uniform2f(gl.getUniformLocation(R3.aoBlurP, 'uDir'), i ? 0 : 1, i ? 1 : 0);
    gl.bindTexture(gl.TEXTURE_2D, src);
    _r3dQuad(R3, R3.aoBlurP);
  }

  /* --- and onto the canvas --- */
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
               R3.aoAmt === undefined ? 1 : R3.aoAmt);
  /* R3.aaAmt, for the same reason as R3.aoAmt: the edge filter and the occlusion are separate
     claims and a spec has to be able to grade one without the other moving. */
  gl.uniform1f(gl.getUniformLocation(R3.aoResolveP, 'uAA'),
               R3.aaAmt === undefined ? 1 : R3.aaAmt);
  gl.uniform2f(gl.getUniformLocation(R3.aoResolveP, 'uTexel'), 1 / R3.postW, 1 / R3.postH);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, R3.sceneTex);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, R3.aoTex);
  _r3dQuad(R3, R3.aoResolveP);

  gl.activeTexture(gl.TEXTURE0);
  gl.depthMask(true);
  gl.enable(gl.DEPTH_TEST);
}
