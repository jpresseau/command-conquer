/* render3d/fx3d.js - explosions and their kin, drawn INTO the world rather than over it.
   Part of rts.render3d.

   Every effect in this game is a sprite animation, and in 3D they were laid over the finished
   picture as decals: drawn by render/fx.js onto the 2D canvas after the GL frame had been
   blitted onto it. That has two consequences you can see. A blast is painted at the ground
   position of its cell whatever height it happened at, because the 2D path anchors through
   _rtsGroundToScreen and never reads f.y - so a building blowing up flashes at its feet rather
   than across its roof. And nothing can ever be in front of one: the decal is applied last, so
   an explosion two cells behind a war factory paints straight over the roof.

   These are the same sprites, drawn as camera-facing quads inside the world pass, before the
   ground and the meshes are composited. So they stand at their own height, and the depth
   buffer decides what covers what.

   THE QUAD IS SCREEN-ALIGNED IN WORLD SPACE, which under this camera is exact rather than
   approximate. The view frame is (u, sv, d) - across, down-screen, toward the eye - and it is
   an orthonormal rotation of world space (see post3d.js). So the two world directions that
   move a point purely across and purely up the screen, with its DEPTH unchanged, are:

       right = (1, 0, 0)                 sv unchanged, d unchanged
       up    = (0, sin(tilt), -cos(tilt))    one unit up the screen, d unchanged

   Check the second: its sv is -cos^2 - sin^2 = -1, and its d is sin*cos - cos*sin = 0. A quad
   built on those two is exactly a rectangle on screen, at one depth, at every zoom - no
   foreshortening to correct and no per-corner depth to sort.

   SIZE COMES THROUGH THE SAME FUNCTION THE 2D PATH USES. _rtsFxSize returns the sprite's width
   with no perspective in it; the 2D path multiplies that by the projection's scale, this one
   divides by the zoom to get world units. Same number, arrived at from either side, so an
   effect is the same size in both modes and cannot drift.

   AND IT IS LIFTED TOWARD THE EYE, which is the one part that is a fudge and is worth stating
   plainly. The quad sits at a single depth, but the ground it stands on does not: a point at
   height y is nearer the eye than the ground beneath it by exactly y/cos(tilt). So the bottom
   of a tall sprite - which is BELOW its anchor, at the anchor's depth - loses the depth test
   against the ground in front of it, and a big fireball gets its lower half cut off by the
   floor. Lifting the whole quad toward the eye clears that. The lift has to beat half a
   sprite's height and stay well under a building's, and those are far apart: a large blast is
   about six world units tall, so its bottom corner sits ~1.7 below its anchor, while a war
   factory stands eight or more. */

/* In world units of DEPTH. See the note above: over half of a large sprite's height, under a
   building's, and the gap between those is wide enough that this needs no tuning. */
var R3D_FX_LIFT = 2.2;

var R3D_FX_VS =
  'attribute vec3 aP; attribute vec2 aT;' +
  'uniform vec4 uCam; uniform vec2 uTilt; uniform float uInvD; uniform float uLift;' +
  'varying vec2 vT;' +
  'void main(){' +
  '  vT = aT;' +
  '  float sx = (aP.x - uCam.x) * uCam.z;' +
  '  float sy = ((aP.z - uCam.y) * uTilt.x - aP.y * uTilt.y) * uCam.w;' +
  /* the same three lines every other program in this renderer projects with */
  '  float d  = ((aP.z - uCam.y) * uTilt.y + aP.y * uTilt.x) + uLift;' +
  '  float pw = 1.0 - d * uInvD;' +
  '  gl_Position = vec4(sx, -sy, -d / ' + R3D_DEPTH_RANGE.toFixed(1) + ' * pw, pw);' +
  '}';

var R3D_FX_FS =
  'precision mediump float; varying vec2 vT; uniform sampler2D uS; uniform float uA;' +
  'void main(){' +
  '  vec4 c = texture2D(uS, vT);' +
  '  if (c.a < 0.004) discard;' +
  '  gl_FragColor = vec4(c.rgb, c.a * uA);' +
  '}';

/* A TEXTURE PER SPRITE FRAME, MADE ONCE. The frames are canvases that the sprite bank builds
   at load and never touches again, so the upload can be cached on the canvas itself - a frame
   is uploaded the first time it is ever shown and reused for the rest of the session. A battle
   shows a few dozen distinct frames, so the cache is that size.

   NPOT and no mips, which WebGL1 requires of a texture this shape, and NEAREST magnification
   because these are pixel art and the rest of the renderer is emphatic about not smearing it. */
function _r3dFxTex(R3, img) {
  var gl = R3.gl;
  if (img.__r3dTex) return img.__r3dTex;
  var t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  /* FLIPPED, AND PUT BACK. A canvas hands its TOP row over first, which lands at v = 0, while
     the quad below builds its top corners at v = 1 - so without this every explosion renders
     upside down. The flag is global unpack state and the ground and shroud uploads rely on its
     default, so it goes back the moment this one texture is in. */
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  img.__r3dTex = t;
  (R3.fxTex || (R3.fxTex = [])).push(t);
  return t;
}

function _r3dFxInit(R3) {
  R3.fxP = _r3dProgram(R3.gl, R3D_FX_VS, R3D_FX_FS);
  R3.fxBuf = R3.gl.createBuffer();
  R3.fxUV = R3.gl.createBuffer();
  R3.fxPos = new Float32Array(18);      /* two triangles, three floats a vertex */
  R3.fxT = new Float32Array(12);
  return true;
}

/* Which effects this pass owns. The rest - tracers, debris, the nuke's own mushroom, the death
   animation - keep their 2D path: they are lines and single chunks rather than sprite quads,
   or one-offs with their own anchoring, and moving them buys nothing. render/fx.js skips
   exactly this set when 3D is on, and the two lists have to agree. */
function _r3dFxOwns(kind) {
  return kind !== 'tracer' && kind !== 'debris' && kind !== 'nuke' && kind !== 'die' &&
         kind !== 'fire';
}

function _r3dFxDraw(G, cam, invD) {
  var R3 = window._R3D, gl = R3.gl, R = _rtsR;
  var S = R.spr;                          /* the sprite bank, exactly as render/frame.js takes it */
  if (!S || !S.fx || !S.fx.boom || !G.fx.length) return 0;
  if (!R3.fxP) { try { _r3dFxInit(R3); } catch (e) { return 0; } }

  var zoom = _rtsZoom(), TSscale = R.cell / RTS_TS;
  var sp = R3.sp, cp = R3.cp;
  var drawn = 0, i;

  gl.useProgram(R3.fxP);
  gl.uniform4fv(gl.getUniformLocation(R3.fxP, 'uCam'), cam);
  gl.uniform2f(gl.getUniformLocation(R3.fxP, 'uTilt'), cp, sp);
  gl.uniform1f(gl.getUniformLocation(R3.fxP, 'uInvD'), invD);
  gl.uniform1f(gl.getUniformLocation(R3.fxP, 'uLift'), R3D_FX_LIFT);
  gl.uniform1i(gl.getUniformLocation(R3.fxP, 'uS'), 0);
  var uA = gl.getUniformLocation(R3.fxP, 'uA');
  var aP = gl.getAttribLocation(R3.fxP, 'aP'), aT = gl.getAttribLocation(R3.fxP, 'aT');

  /* DEPTH TESTED BUT NOT DEPTH WRITTEN. Tested, so the world can cover an effect; not written,
     so two overlapping effects blend instead of one punching a hole in the other. */
  gl.enable(gl.DEPTH_TEST);
  gl.depthMask(false);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.activeTexture(gl.TEXTURE0);

  var q = R3.fxPos, t = R3.fxT;
  t[0] = 0; t[1] = 1; t[2] = 1; t[3] = 1; t[4] = 1; t[5] = 0;
  t[6] = 0; t[7] = 1; t[8] = 1; t[9] = 0; t[10] = 0; t[11] = 0;
  gl.bindBuffer(gl.ARRAY_BUFFER, R3.fxUV);
  gl.bufferData(gl.ARRAY_BUFFER, t, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(aT);
  gl.vertexAttribPointer(aT, 2, gl.FLOAT, false, 0, 0);

  for (i = 0; i < G.fx.length; i++) {
    var f = G.fx[i];
    if (f.t < 0) continue;                        /* a delayed secondary blast, not started */
    if (!_r3dFxOwns(f.kind)) continue;
    var pick;
    try { pick = _rtsFxFrame(f, S); } catch (e) { continue; }
    if (!pick || !pick.img || !pick.img.width) continue;
    var img = pick.img;

    /* world size: the 2D path's own number, with the zoom taken out instead of put in */
    var w = _rtsFxSize(img, TSscale, f.big) / zoom;
    var h = w * (img.height / img.width);
    /* the anchor sits `anchor` of the way DOWN the sprite, so the centre is above it by
       h * (anchor - 0.5) along the screen's up */
    var off = h * (pick.anchor - 0.5);
    var cxw = f.x, cyw = (f.y || 0) + off * sp, czw = f.z - off * cp;

    var rx = w / 2;
    var ux = 0, uy = (h / 2) * sp, uz = -(h / 2) * cp;
    /* corners: top-left, top-right, bottom-right / top-left, bottom-right, bottom-left */
    function put(k, sx2, sy2) {
      q[k] = cxw + rx * sx2 + ux * sy2;
      q[k + 1] = cyw + uy * sy2;
      q[k + 2] = czw + uz * sy2;
    }
    put(0, -1, 1); put(3, 1, 1); put(6, 1, -1);
    put(9, -1, 1); put(12, 1, -1); put(15, -1, -1);

    gl.bindBuffer(gl.ARRAY_BUFFER, R3.fxBuf);
    gl.bufferData(gl.ARRAY_BUFFER, q, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(aP);
    gl.vertexAttribPointer(aP, 3, gl.FLOAT, false, 0, 0);
    gl.uniform1f(uA, f.alpha === undefined ? 1 : f.alpha);
    gl.bindTexture(gl.TEXTURE_2D, _r3dFxTex(R3, img));
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    drawn++;
  }

  gl.disable(gl.BLEND);
  gl.depthMask(true);
  R3.fxDrawn = drawn;
  return drawn;
}
