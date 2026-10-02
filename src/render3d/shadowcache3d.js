/* render3d/shadowcache3d.js - the world's shadows, drawn once and kept. Part of rts.render3d.

   THE SUN'S PASS WAS THE HEAVIEST THING IN THE FRAME. Every frame it drew every tree, ridge,
   crystal and prop under the sun's square into the shadow map - measured in a battle, 73 draws
   and a million triangles, more than the camera's own pass drew of the world - to throw shadows
   that had not moved since the last frame, because none of those things ever move. Only the
   units do.

   So the world's casters go into a map of their own (R3.shadowStatic) and stay there, and each
   frame the live map starts as a copy of it - colour and DEPTH, the depth restored from the
   packed value (gl_FragDepthEXT) so that a unit standing under a tree still loses to the tree -
   and then only the units are drawn on top. The kept map is redrawn when what it shows could
   have changed: the sun's window moved on, the sun turned, or a batch of the world was rebuilt.

   A WINDOW THAT MOVES EVERY FRAME CAN NEVER BE KEPT, and the sun's window used to follow the
   camera exactly. It is snapped now (_r3dSunSnap): its size to R3D_SHADOW_ZOOMQ steps a doubling,
   its centre to a grid R3D_SHADOW_SNAP steps across it, with a margin of one step so the snapped
   window still covers what the camera sees. Panning redraws the world's shadows once every
   sixteenth of the window rather than every frame.

   Without a way to write depth (WebGL2, or EXT_frag_depth on WebGL1) it cannot be restored, and
   the pass draws everything every frame as it did. R3.shadowCacheOff does the same, for a spec's A/B. */

var R3D_SHADOW_SNAP = 16;        /* the window's centre moves in steps of 1/16 of its width */
var R3D_SHADOW_ZOOMQ = 4;        /* window sizes a doubling of the view */

/* The sun's window for a view whose ground runs `half` either way of (cx, cz): snapped. */
function _r3dSunSnap(cx, cz, half) {
  var hq = Math.pow(2, Math.ceil(Math.log(Math.max(8, half)) / Math.LN2 * R3D_SHADOW_ZOOMQ) / R3D_SHADOW_ZOOMQ);
  var step = hq * 2 / R3D_SHADOW_SNAP;
  return { c: [Math.round(cx / step) * step, R3D_WORLD_YMAX * 0.5, Math.round(cz / step) * step], span: hq + step, step: step };
}

/* The kept map, its framebuffer, and the program that copies it into the live one: built on
   first use, or not at all where the depth cannot be written. */
function _r3dShadowCacheInit(R3) {
  if (R3.shadowCache !== undefined) return R3.shadowCache;
  var gl = R3.gl, S = R3D_SHADOW_SIZE;
  R3.shadowCache = null;
  try {
    /* WebGL2 writes depth from any 300 es shader; WebGL1 needs the extension */
    var two = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
    if (!two && !gl.getExtension('EXT_frag_depth')) return null;
    var C = { tex: gl.createTexture(), rb: gl.createRenderbuffer(), fbo: gl.createFramebuffer(), quad: gl.createBuffer(), key: null };
    gl.bindTexture(gl.TEXTURE_2D, C.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, S, S, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindRenderbuffer(gl.RENDERBUFFER, C.rb);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, S, S);
    gl.bindFramebuffer(gl.FRAMEBUFFER, C.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, C.tex, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, C.rb);
    var ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (!ok) return null;
    gl.bindBuffer(gl.ARRAY_BUFFER, C.quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);
    /* the depth the packed value came from (shadow3d.js's pack): a unit behind a tree stays behind it */
    var depth = 'clamp(c.r + c.g / 255.0, 0.0, 1.0)';
    C.P = two ? _r3dProgram(gl,
      '#version 300 es\nin vec2 aQ; out vec2 vU; void main(){ vU = aQ * 0.5 + 0.5; gl_Position = vec4(aQ, 0.0, 1.0); }',
      '#version 300 es\nprecision highp float; in vec2 vU; uniform sampler2D uS; out vec4 oC;' +
      'void main(){ vec4 c = texture(uS, vU); oC = c; gl_FragDepth = ' + depth + '; }')
    : _r3dProgram(gl,
      'attribute vec2 aQ; varying vec2 vU; void main(){ vU = aQ * 0.5 + 0.5; gl_Position = vec4(aQ, 0.0, 1.0); }',
      '#extension GL_EXT_frag_depth : enable\n' +
      'precision highp float; varying vec2 vU; uniform sampler2D uS;' +
      'void main(){ vec4 c = texture2D(uS, vU); gl_FragColor = c; gl_FragDepthEXT = ' + depth + '; }');
    if (!C.P) return null;
    R3.shadowCache = C;
  } catch (e) { R3.shadowCache = null; }
  return R3.shadowCache;
}

/* What the kept map shows: the window, the sun, and which batches of the world drew it. */
function _r3dShadowKey(R3, sv, batches) {
  var f = _r3dSunB().f, k = sv.c[0] + ',' + sv.c[2] + ',' + sv.span + ',' + f.map(function (v) { return v.toFixed(4); }).join(',');
  return { s: k, b: batches.slice() };
}
function _r3dShadowKeySame(a, b) {
  if (!a || !b || a.s !== b.s || a.b.length !== b.b.length) return false;
  for (var i = 0; i < a.b.length; i++) if (a.b[i] !== b.b[i]) return false;
  return true;
}

/* Into the live map, the kept one: colour and depth, every texel. */
function _r3dShadowCopy(gl, C) {
  gl.useProgram(C.P);
  gl.depthFunc(gl.ALWAYS);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, C.tex);
  gl.uniform1i(gl.getUniformLocation(C.P, 'uS'), 0);
  var a = gl.getAttribLocation(C.P, 'aQ');
  gl.bindBuffer(gl.ARRAY_BUFFER, C.quad);
  gl.enableVertexAttribArray(a);
  gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  gl.disableVertexAttribArray(a);
  gl.depthFunc(gl.LESS);
}
