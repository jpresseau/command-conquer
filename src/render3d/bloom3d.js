/* render3d/bloom3d.js - the glow around fire, computed on the GPU from the things that EMIT
   light rather than from the things that are bright. Part of rts.render3d.

   WHY THIS EXISTS AT ALL, twice over.

   FIRST, THE COST. The bloom used to run on the 2D canvas, and in 3D that made it the single
   most expensive thing in a combat frame. Counted per frame with the sim frozen, a burning
   frame carried one getImageData of the blur buffer and eight drawImage calls over a quiet
   frame's none - and one of those eight pulled the whole 2.35-megapixel WebGL canvas into a
   2D context. Both are GPU->CPU syncs. A real iPhone 17 Pro Max read 59fps out of combat and
   32.0ms - 31fps - during an attack, and 32.0 is almost exactly twice 16.7: the frame was
   missing vsync by a hair and being halved. The target was never sixteen milliseconds, it was
   one or two, and the syncs were all of it. Nothing here reads a pixel back.

   SECOND, AND THE REASON IT IS AN EMITTER PASS: BRIGHTNESS CANNOT FIND FIRE IN THIS RENDERER.
   The old pass thresholded the frame - x^8 on a downscaled copy - and needed a second guard on
   top, a global "what fraction of the buffer is bright" statistic that stood the whole effect
   down on a pale map, because a snowfield sails through any threshold. That guard was the
   readback. Measured on the GL buffer, the premise turns out to be worse than "needs a guard":

       temperate, one blast    max luminance 0.897, 0.01% of the frame over 0.8
       snowfield, NOTHING lit  max luminance 1.000, 51.5% of the frame over 0.9

   A fireball is DIMMER than snow. There is no threshold anywhere that passes the explosion on
   the first row and rejects the field on the second, so no amount of tuning could have made the
   old approach right - the guard was not a refinement, it was the only thing standing between
   the effect and a full-screen flash.

   Light is not brightness, so this pass asks the other question. The fx billboards are the
   things in this scene that EMIT - fire, explosions, the muzzle-flash set render/fx.js owns -
   and they are re-drawn here, alone, into a small buffer. Nothing else can enter it. Snow
   cannot flash because snow is never in the source, and the threshold, the power curve and the
   stand-down statistic all cease to exist rather than being tuned.

   THE EMITTERS ARE DEPTH TESTED, and the first version of this was not - it drew them straight
   into the quarter-scale buffer, which cannot share the full-resolution depth attachment. The
   argument for skipping the test was that a halo around a light source spilling over a roofline
   is what light does. e2e/tilt disagreed, with a number: that spec exists because leaning the
   camera to 49 degrees makes buildings hide more of what is behind them, and it measures the
   war factory concealing an explosion. Undepthed, the glow leaked over the roof and the factory
   hid 9% of the blast where it had hidden a third of it - the lean's whole visible benefit,
   erased by a halo. A building has to occlude what is behind it or the camera angle means
   nothing.

   So the emitters are drawn at FULL resolution with the scene's own depth texture attached -
   tested, never written - and downsampled on the way into the blur. The cost is one more
   full-resolution RGBA target (9.4MB at 2.35 megapixels) and one extra quad; the emitter draw
   itself is six small quads that the depth test mostly rejects. */

/* A QUARTER, not the eighth the canvas pass used. The old buffer was sized against a full-frame
   drawImage that had to be kept cheap; this one is filled by six quads. A quarter blurs to a
   tighter, better-placed halo and still costs a sixteenth of the pixels. */
var R3D_BLOOM_DIV = 4;
/* How much of the blurred emitter buffer is added back. Additive, so this is in the frame's own
   units: 1.0 doubles the brightness at the heart of a fireball. */
var R3D_BLOOM_AMT = 0.85;
/* The blur radius in buffer texels, spent as a 9-tap gaussian on each axis. At quarter
   resolution 2.0 reaches about eight screen pixels, which is a halo rather than a haze. */
var R3D_BLOOM_RADIUS = 2.0;

/* A separable gaussian. Two passes of this over the emitter buffer is the whole blur - the
   canvas path needed a CSS filter and a bilinear stretch to get here. */
var R3D_BLOOM_BLUR_FS =
  'precision mediump float; varying vec2 vT;' +
  'uniform sampler2D uSrc; uniform vec2 uStep;' +
  'void main(){' +
  '  vec3 s = texture2D(uSrc, vT).rgb * 0.2270270270;' +
  '  s += (texture2D(uSrc, vT + uStep * 1.3846153846).rgb +' +
  '        texture2D(uSrc, vT - uStep * 1.3846153846).rgb) * 0.3162162162;' +
  '  s += (texture2D(uSrc, vT + uStep * 3.2307692308).rgb +' +
  '        texture2D(uSrc, vT - uStep * 3.2307692308).rgb) * 0.0702702703;' +
  '  gl_FragColor = vec4(s, 1.0);' +
  '}';

function _r3dBloomInit(R3) {
  var gl = R3.gl;
  R3.bloomP = _r3dProgram(gl, R3D_QUAD_VS, R3D_BLOOM_BLUR_FS);
  R3.bloomFbo = gl.createFramebuffer();
  return !!R3.bloomP;
}

/* Sized off the scene buffer, so it tracks the render scale the player picked. */
function _r3dBloomSize(R3) {
  var gl = R3.gl;
  var w = Math.max(1, R3.postW / R3D_BLOOM_DIV | 0), h = Math.max(1, R3.postH / R3D_BLOOM_DIV | 0);
  if (R3.bloomW === w && R3.bloomH === h && R3.bloomTex) return true;
  ['bloomTex', 'bloomTex2', 'emitTex'].forEach(function (k) {
    if (R3[k]) { gl.deleteTexture(R3[k]); R3[k] = null; }
  });
  R3.bloomTex = _r3dPostTex(gl, w, h, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR);
  R3.bloomTex2 = _r3dPostTex(gl, w, h, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR);
  /* Full resolution, because it is depth tested against the scene's depth and an attachment
     can only be tested against one the same size. Downsampled into the blur immediately. */
  R3.emitTex = _r3dPostTex(gl, R3.postW, R3.postH, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR);
  R3.bloomW = w; R3.bloomH = h;
  return !!(R3.bloomTex && R3.bloomTex2 && R3.emitTex);
}

/* Draw the emitters and blur them. Returns true when there is a glow to composite, false when
   nothing is burning - and false is the common case, so the resolve is told to skip the
   lookup entirely rather than sampling a black texture on every quiet frame.

   Called from _r3dFrame with the scene FBO still bound, immediately before _r3dPostEnd. */
function _r3dBloomPass(R3, G, cam, invD) {
  /* RTS_POST_ON gates this exactly as it gates the 2D pass: it is the same effect, and a spec
     that A/Bs the post pass has to be able to take the glow out from one switch in either
     renderer. R3.bloomAmt is the finer control - see R3.aoAmt in post3d.js for the precedent -
     which removes the glow from the picture while still paying for the pass, so the cost and
     the appearance can be graded separately. */
  if (typeof RTS_POST_ON !== 'undefined' && !RTS_POST_ON) return false;
  if (!R3.postReady || !G || !G.fx || !G.fx.length) return false;
  if (!R3.bloomP && !_r3dBloomInit(R3)) return false;
  if (!_r3dBloomSize(R3)) return false;
  var gl = R3.gl, i;

  /* --- the emitters, alone, at full resolution and behind the world's own depth --- */
  gl.bindFramebuffer(gl.FRAMEBUFFER, R3.bloomFbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, R3.emitTex, 0);
  /* The SCENE's depth, tested and never written - depthMask stays false through the draw, so
     nothing here can disturb the buffer the occlusion pass is about to read. */
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, R3.sceneDepth, 0);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, null, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, R3.sceneFbo);
    gl.viewport(0, 0, R3.postW, R3.postH);
    return false;
  }
  gl.viewport(0, 0, R3.postW, R3.postH);
  gl.clearColor(0, 0, 0, 1);
  gl.depthMask(false);
  gl.clear(gl.COLOR_BUFFER_BIT);          /* colour only - the depth is the world's */
  gl.enable(gl.DEPTH_TEST);
  var drawn = 0;
  try { drawn = _r3dFxDraw(G, cam, invD) || 0; } catch (e) { drawn = 0; }
  /* the depth goes back before anything else binds this FBO */
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, null, 0);
  /* _r3dFxDraw reports what it actually put on screen, and the set it owns is narrower than
     G.fx - a frame carrying only tracers has fx but no emitters, and blurring an empty buffer
     to composite nothing is pure cost. */
  if (!drawn) {
    gl.depthMask(true);
    gl.bindFramebuffer(gl.FRAMEBUFFER, R3.sceneFbo);
    gl.viewport(0, 0, R3.postW, R3.postH);
    return false;
  }

  /* --- the two blur axes, which also do the downscale: the first samples the full-resolution
         emitter target and writes a quarter-scale one, and because the sampler works in
         normalised uv the step is in destination units either way --- */
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.BLEND);
  gl.useProgram(R3.bloomP);
  gl.uniform1i(gl.getUniformLocation(R3.bloomP, 'uSrc'), 0);
  gl.activeTexture(gl.TEXTURE0);
  gl.viewport(0, 0, R3.bloomW, R3.bloomH);
  for (i = 0; i < 2; i++) {
    var src = i ? R3.bloomTex2 : R3.emitTex, dst = i ? R3.bloomTex : R3.bloomTex2;
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, dst, 0);
    gl.uniform2f(gl.getUniformLocation(R3.bloomP, 'uStep'),
                 i ? 0 : R3D_BLOOM_RADIUS / R3.bloomW, i ? R3D_BLOOM_RADIUS / R3.bloomH : 0);
    gl.bindTexture(gl.TEXTURE_2D, src);
    _r3dQuad(R3, R3.bloomP);
  }
  gl.depthMask(true);
  gl.enable(gl.DEPTH_TEST);

  /* back to the scene buffer, exactly as this pass found it */
  gl.bindFramebuffer(gl.FRAMEBUFFER, R3.sceneFbo);
  gl.viewport(0, 0, R3.postW, R3.postH);
  return true;
}
