/* render3d/ring3d.js - what is selected is ringed on the ground. Part of rts.render3d.

   Selection was Red Alert's: four corner brackets drawn on the HUD over whatever was picked, a
   flat 2D mark floating in front of a 3D world. In the 3D mode a selected unit stands in a soft
   ring of light on the ground now, and a selected building has its footprint traced round, the
   way the later 3D RTS games mark a selection - green for the player's own, red for the
   opponent's, breathing a little so a ring on a busy field is found at a glance.

   Drawn straight after the ground and its tread marks, before anything stands on it, so the
   unit stands IN its ring and hides the part of it that runs behind its hull. The quads are
   rebuilt every frame - a handful of them - and each carries its own shape in world units: a
   circle round a unit, a rounded box round a footprint, so the band is the same width on both.

   R3.selAmt takes the rings out and leaves the rest, as R3.aoAmt does the occlusion. */

var R3D_RING_F = 11;         /* floats a vertex: x y z, local x z, half-size x z, box, r g b */
var R3D_RING_LIFT = 0.5;     /* toward the eye, as the tread marks are (tread3d.js) */
var R3D_RING_UNIT = 1.25;    /* a unit's ring, as a multiple of its radius */

/* The house's selection colour: the green and red the HUD always drew its brackets in. */
var R3D_RING_COL = { player: [0.557, 0.941, 0.478], enemy: [1.0, 0.541, 0.478] };

function _r3dRingVS() {
  return 'attribute vec3 aP; attribute vec4 aL; attribute vec4 aK;' +
    'uniform vec4 uCam; uniform vec2 uTilt; uniform float uInvD;' + R3D_CAM_GLSL +
    'varying vec4 vL; varying vec4 vK;' +
    'void main(){' +
    '  vL = aL; vK = aK;' +
    '  float sx = camUV(aP).x * uCam.z;' +
    '  float sy = (camUV(aP).y * uTilt.x - aP.y * uTilt.y) * uCam.w;' +
    '  float d  = (camUV(aP).y * uTilt.y + aP.y * uTilt.x);' +
    '  float pw = 1.0 - d * uInvD;' +
    '  gl_Position = vec4(sx, -sy, -(d + ' + R3D_RING_LIFT.toFixed(2) + ') / ' + R3D_DEPTH_RANGE.toFixed(1) + ' * pw, pw);' +
    '}';
}
/* vL: the offset from the centre (xy) and the half-size (zw); vK: box or ring (x), colour (yzw).
   The shape is a distance: negative inside, 0 on the line. */
function _r3dRingFS() {
  return 'precision highp float; varying vec4 vL; varying vec4 vK;' +
    'uniform float uT; uniform float uAmt;' +
    'void main(){' +
    '  float sd;' +
    '  if (vK.x > 0.5) { vec2 q = abs(vL.xy) - vL.zw + 0.8;' +
    '    sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 0.8; }' +
    '  else sd = length(vL.xy) - vL.z;' +
    '  float band = smoothstep(-0.5, -0.28, sd) * (1.0 - smoothstep(-0.06, 0.1, sd));' +
    '  float fill = (1.0 - smoothstep(-0.35, 0.0, sd)) * 0.1;' +
    '  float a = (band * 0.85 + fill) * (0.86 + 0.14 * sin(uT * 4.0)) * uAmt;' +
    '  gl_FragColor = vec4(vK.yzw, a);' +
    '}';
}

/* One quad centred on (cx, cz), half-size (hx, hz) plus a margin for the soft edge, lying on
   the ground: each corner takes the ground's own height. */
function _r3dRingQuad(a, o, cx, cz, hx, hz, box, c) {
  var mx = hx + 0.3, mz = hz + 0.3, P = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]];
  for (var i = 0; i < 6; i++) {
    var lx = P[i][0] * mx, lz = P[i][1] * mz, x = cx + lx, z = cz + lz;
    a[o] = x; a[o + 1] = _rtsElev(x, z) + 0.05; a[o + 2] = z;
    a[o + 3] = lx; a[o + 4] = lz; a[o + 5] = hx; a[o + 6] = hz;
    a[o + 7] = box; a[o + 8] = c[0]; a[o + 9] = c[1]; a[o + 10] = c[2];
    o += R3D_RING_F;
  }
}

/* The rings of everything selected that the player can see, into R3.ringA; how many. */
function _r3dRingBuild(G, R3) {
  var sel = G.sel || [], n = 0, need = sel.length * 6 * R3D_RING_F;
  if (!R3.ringA || R3.ringA.length < need) R3.ringA = new Float32Array(Math.max(need, 64 * 6 * R3D_RING_F));
  for (var i = 0; i < sel.length; i++) {
    var e = sel[i];
    if (!e || e.dead || e.inside || (typeof _rtsEntSeen === 'function' && !_rtsEntSeen(e))) continue;
    var c = R3D_RING_COL[e.side] || R3D_RING_COL.player, o = n * 6 * R3D_RING_F;
    if (e.type === 'struct') {
      var d = rtsStructDef(e.def), hx = d.w * RTS_TILE / 2 + 0.4, hz = d.h * RTS_TILE / 2 + 0.4;
      _r3dRingQuad(R3.ringA, o, _rtsWX(e.tx) - RTS_TILE / 2 + d.w * RTS_TILE / 2,
                   _rtsWX(e.tz) - RTS_TILE / 2 + d.h * RTS_TILE / 2, hx, hz, 1, c);
    } else {
      var r = (rtsUnitDef(e.def).r || 1.2) * R3D_RING_UNIT;
      _r3dRingQuad(R3.ringA, o, e.x, e.z, r, r, 0, c);
    }
    n++;
  }
  return n;
}

function _r3dRingDraw(gl, R3, G, cam, invD) {
  var amt = R3.selAmt === undefined ? 1 : R3.selAmt;
  R3.rings = 0;
  if (!(amt > 0) || R3.ringFail || !G.sel || !G.sel.length) return 0;
  var n = _r3dRingBuild(G, R3);
  if (!n) return 0;
  if (!R3.ringP) {
    try { R3.ringP = _r3dProgram(gl, _r3dRingVS(), _r3dRingFS()); } catch (e) { R3.ringP = null; }
    if (!R3.ringP) { R3.ringFail = 1; return 0; }
    R3.ringBuf = gl.createBuffer();
  }
  var P = R3.ringP, i;
  gl.bindBuffer(gl.ARRAY_BUFFER, R3.ringBuf);
  gl.bufferData(gl.ARRAY_BUFFER, R3.ringA.subarray(0, n * 6 * R3D_RING_F), gl.DYNAMIC_DRAW);
  gl.useProgram(P);
  gl.uniform4fv(gl.getUniformLocation(P, 'uCam'), cam);
  _r3dCamU(gl, P);
  gl.uniform1f(gl.getUniformLocation(P, 'uInvD'), invD);
  gl.uniform1f(gl.getUniformLocation(P, 'uT'), G.t || 0);
  gl.uniform1f(gl.getUniformLocation(P, 'uAmt'), Math.min(1, amt));
  var at = [['aP', 3, 0], ['aL', 4, 12], ['aK', 4, 28]], loc = [];
  for (i = 0; i < at.length; i++) {
    loc.push(gl.getAttribLocation(P, at[i][0]));
    if (loc[i] < 0) continue;
    gl.enableVertexAttribArray(loc[i]);
    if (R3.inst && R3.inst.on) R3.inst.divisor(loc[i], 0);
    gl.vertexAttribPointer(loc[i], at[i][1], gl.FLOAT, false, R3D_RING_F * 4, at[i][2]);
  }
  gl.enable(gl.DEPTH_TEST);
  gl.depthMask(false);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.drawArrays(gl.TRIANGLES, 0, n * 6);
  gl.disable(gl.BLEND);
  gl.depthMask(true);
  for (i = 0; i < loc.length; i++) if (loc[i] >= 0) gl.disableVertexAttribArray(loc[i]);
  R3.rings = n;
  return n;
}
