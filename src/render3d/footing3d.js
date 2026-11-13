/* render3d/footing3d.js - every unit stands in its own shade. Part of rts.render3d.

   The sun's shadow map (shadow3d.js) shades the map: a wood its floor, a ridge the grass, a
   building its yard. A texel of it is a quarter of a cell, though, and a tank is half a cell
   across, a rifleman a tenth - so the things a player has to FIND were the one kind of thing on
   the map with nothing under them, olive hulls laid on green grass like stickers. The occlusion
   pass (post3d.js) cannot do it either: at the zoom a phone plays at a unit is a dozen pixels of
   a half-resolution buffer.

   So each unit on the ground has the shade under its own hull drawn for it: a soft dark
   ellipse, the hull's length along its heading and its width across, densest in the middle and
   gone by the edge, in the cool blue-grey the scene's shade is. Drawn straight after the ground
   and the tread marks and before the selection's ring, so a ring lies over it and the unit
   stands on both. It is not a cast shadow and does not pretend to be one - it is the contact,
   the dark a thing has where it meets the ground, which is what puts it ON the ground.

   NOT under what flies (its shadow is the sun's, far from it), what floats (the sea is drawn
   over the seabed this would lie on), what is crossing a bridge (the deck is), or what the
   player cannot see. R3.footAmt (0 to 1) takes it out and leaves the rest, as R3.selAmt does
   the rings. */

var R3D_FOOT_F = 11;                     /* the ring's own vertex: x y z, local x z, half-size x z, alpha, r g b */
var R3D_FOOT_A = 0.5;                    /* how dark at the centre, by day */
var R3D_FOOT_COL = [0.035, 0.05, 0.10];  /* the scene's shade is blue-grey, not black: light3d.js */
var R3D_FOOT_LONG = 1.2;                 /* a hull's half-length, as a multiple of its radius... */
var R3D_FOOT_WIDE = 0.92;                /* ...and its half-width */
var R3D_FOOT_INF = 0.75;                 /* a soldier's: round, and smaller than the circle he is picked by */

function _r3dFootFS() {
  return 'precision highp float; varying vec4 vL; varying vec4 vK;' +
    'uniform float uAmt;' +
    'void main(){' +
    '  float d = length(vL.xy / vL.zw);' +
    '  float a = 1.0 - smoothstep(0.30, 1.0, d);' +
    '  gl_FragColor = vec4(vK.yzw, a * a * vK.x * uAmt);' +
    '}';
}

/* Does this unit stand on ground the shade can be drawn on? */
function _r3dFootOn(e, d) {
  if (!d || e.dead || e.inside || e.air || d.sea || e.chute > 0) return false;
  if (typeof _rtsEntSeen === 'function' && !_rtsEntSeen(e)) return false;
  var k = _rtsInB(_rtsTX(e.x), _rtsTX(e.z)) ? window._rtsG.terrain[_rtsIdx(_rtsTX(e.x), _rtsTX(e.z))] : -1;
  if (k === RTS_T_WATER) return false;                                  /* wading, swimming, an amphibian afloat */
  return !(_rtsStandY(e.x, e.z) > _rtsElev(e.x, e.z) + 0.01);           /* on a bridge's deck */
}

/* One unit's shade, into a at o: a quad turned to its heading, each corner on the ground. */
function _r3dFootQuad(a, o, e, hl, hw, alpha) {
  var c = Math.cos(e.rot || 0), s = Math.sin(e.rot || 0), ml = hl * 1.04, mw = hw * 1.04;
  var P = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]];
  for (var i = 0; i < 6; i++) {
    var ll = P[i][0] * ml, lw = P[i][1] * mw, x = e.x + c * ll - s * lw, z = e.z + s * ll + c * lw;
    a[o] = x; a[o + 1] = _rtsElev(x, z) + 0.04; a[o + 2] = z;
    a[o + 3] = ll; a[o + 4] = lw; a[o + 5] = hl; a[o + 6] = hw;
    a[o + 7] = alpha; a[o + 8] = R3D_FOOT_COL[0]; a[o + 9] = R3D_FOOT_COL[1]; a[o + 10] = R3D_FOOT_COL[2];
    o += R3D_FOOT_F;
  }
}

/* The shade of every unit on the ground inside `view` (world x0 x1 z0 z1; none = all), into
   R3.footA; how many. */
function _r3dFootBuild(G, R3, view) {
  var n = 0, E = G.ents, inf = R3.infScaleOff ? 1 : _r3dInfScale(_rtsR.cell);
  for (var i = 0; i < E.length; i++) {
    var e = E[i];
    if (e.type !== 'unit' || e.dead) continue;
    if (view && (e.x < view.x0 || e.x > view.x1 || e.z < view.z0 || e.z > view.z1)) continue;
    var d = rtsUnitDef(e.def);
    if (!_r3dFootOn(e, d)) continue;
    if (!R3.footA || R3.footA.length < (n + 1) * 6 * R3D_FOOT_F) {
      var big = new Float32Array(Math.max(64, (n + 1) * 2) * 6 * R3D_FOOT_F);
      if (R3.footA) big.set(R3.footA);
      R3.footA = big;
    }
    var r = d.r || 1.2, foot = d.kind === 'infantry';
    _r3dFootQuad(R3.footA, n * 6 * R3D_FOOT_F, e, foot ? r * R3D_FOOT_INF * inf : r * R3D_FOOT_LONG,
                 foot ? r * R3D_FOOT_INF * inf : r * R3D_FOOT_WIDE, foot ? 0.8 : 1);
    n++;
  }
  return n;
}

/* n quads of A through program P, laid on what is under them: blended, tested against the depth
   there and not written to it. The shade's own pass, and the waterline's (afloat3d.js). */
function _r3dFootSend(gl, R3, P, A, n, cam, invD, amt) {
  var i;
  gl.bindBuffer(gl.ARRAY_BUFFER, R3.footBuf);
  gl.bufferData(gl.ARRAY_BUFFER, A.subarray(0, n * 6 * R3D_FOOT_F), gl.DYNAMIC_DRAW);
  gl.useProgram(P);
  gl.uniform4fv(gl.getUniformLocation(P, 'uCam'), cam);
  _r3dCamU(gl, P);
  gl.uniform1f(gl.getUniformLocation(P, 'uInvD'), invD);
  gl.uniform1f(gl.getUniformLocation(P, 'uAmt'), amt);
  var at = [['aP', 3, 0], ['aL', 4, 12], ['aK', 4, 28]], loc = [];
  for (i = 0; i < at.length; i++) {
    loc.push(gl.getAttribLocation(P, at[i][0]));
    if (loc[i] < 0) continue;
    gl.enableVertexAttribArray(loc[i]);
    if (R3.inst && R3.inst.on) R3.inst.divisor(loc[i], 0);
    gl.vertexAttribPointer(loc[i], at[i][1], gl.FLOAT, false, R3D_FOOT_F * 4, at[i][2]);
  }
  gl.enable(gl.DEPTH_TEST);
  gl.depthMask(false);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.drawArrays(gl.TRIANGLES, 0, n * 6);
  gl.disable(gl.BLEND);
  gl.depthMask(true);
  for (i = 0; i < loc.length; i++) if (loc[i] >= 0) gl.disableVertexAttribArray(loc[i]);
}

function _r3dFootDraw(gl, R3, G, cam, invD, view) {
  var amt = R3.footAmt === undefined ? 1 : R3.footAmt;
  R3.foots = 0;
  if (!(amt > 0) || R3.footFail) return 0;
  var n = _r3dFootBuild(G, R3, view);
  if (!n) return 0;
  if (!R3.footP) {
    try { R3.footP = _r3dProgram(gl, _r3dRingVS(), _r3dFootFS()); } catch (e) { R3.footP = null; }
    if (!R3.footP) { R3.footFail = 1; return 0; }
    R3.footBuf = gl.createBuffer();
  }
  /* by night the whole map is in shade, and a unit's own is most of the way to it already */
  var P = R3.footP, night = (R3.sky && R3.sky.night) || 0;
  _r3dFootSend(gl, R3, P, R3.footA, n, cam, invD, Math.min(1, amt) * R3D_FOOT_A * (1 - 0.45 * night));
  R3.foots = n;
  return n;
}
