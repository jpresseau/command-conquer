/* render3d/tread3d.js - the marks vehicles leave on the ground. Part of rts.render3d.

   A column of tanks crossing a beach left the sand exactly as it found it. Now every vehicle on
   the move lays its marks behind it - a pair of cleated tracks under a tracked hull, two thin
   tyre lines under a wheeled one - deepest in sand and loose dirt, faint on grass, none on the
   paving, the rock or the sea - and they fade over half a minute, so a busy crossing reads as
   one and an old route is gone.

   THE ONE THING IN THE EFFECTS THAT KEEPS STATE. Dust and wakes are phases of the game clock
   (fxwake3d.js) because they move with what raises them; a mark stays where it was laid, so it
   has to be remembered. A ring of R3D_TREAD_MAX quads, oldest overwritten first, kept on the GPU:
   each mark carries the moment it was laid and the shader works out its fade from the clock, so
   a frame uploads only the marks laid in it rather than every mark on the map. Nothing of it is
   saved - a loaded game starts with clean ground.

   Drawn straight after the ground and before anything stands on it, MULTIPLYING the ground's
   colour down: a mark darkens whatever the light made of the ground there, in sun or in shade,
   and everything drawn later - the vehicles themselves, the smoke, the shroud - is drawn over it.
   R3.treadAmt takes the marks out and leaves the rest, as R3.aoAmt does the occlusion. */

var R3D_TREAD_MAX = 4096;       /* marks held at once, a quad each */
var R3D_TREAD_STEP = 0.9;       /* world units driven between one mark and the next */
var R3D_TREAD_LIFE = 32;        /* seconds before a mark is gone */
var R3D_TREAD_F = 8;            /* floats a vertex: x y z, along across, laid strength tracked */
/* toward the eye, in world units: the ground patch is cut on the grid and a mark follows the
   terrain's own height, and the two part by a little on a slope */
var R3D_TREAD_LIFT = 0.5;

/* How deep a mark this ground takes: loose sand most, a dirt road nearly as much, grass a
   little, and nothing where the base is paved (the ground map's paving, terrain3d.js). */
function _r3dTreadGround(G, R3, x, z) {
  var tx = _rtsTX(x), tz = _rtsTX(z);
  if (!_rtsInB(tx, tz)) return 0;
  var i = _rtsIdx(tx, tz);
  if (R3.treadPave && R3.treadPave[i]) return 0;
  var t = G.terrain[i];
  if (t === RTS_T_SAND) return 1;
  if (t === RTS_T_ROAD) return 0.85;
  if (t === RTS_T_GRASS) return 0.45;
  return 0;
}

/* One mark into the ring at float offset o: a quad from (x0,z0) to (x1,z1), `off` to the side
   of the path along (px,pz) and `hw` either side of that. u runs with the distance driven, so a
   track's cleats keep their spacing from one mark to the next; v runs -1 to 1 across it. */
function _r3dTreadQuad(a, o, x0, z0, x1, z1, px, pz, off, hw, u0, u1, born, s, k) {
  var P = [[x0, z0, u0, -1], [x1, z1, u1, -1], [x1, z1, u1, 1], [x0, z0, u0, -1], [x1, z1, u1, 1], [x0, z0, u0, 1]];
  for (var i = 0; i < 6; i++) {
    var c = P[i], w = off + hw * c[3], x = c[0] + px * w, z = c[1] + pz * w;
    a[o] = x; a[o + 1] = _rtsElev(x, z) + 0.02; a[o + 2] = z;
    a[o + 3] = c[2]; a[o + 4] = c[3]; a[o + 5] = born; a[o + 6] = s; a[o + 7] = k;
    o += R3D_TREAD_F;
  }
}

/* Every vehicle that has driven a step since its last mark lays the next pair, from where the
   last pair ended - so a track is continuous round a bend. A jump longer than any step (a unit
   unloaded, a save restored, the mode switched back on) starts again from where it landed. */
function _r3dTreadTick(G, R3) {
  if (R3.treadG !== G) {
    R3.treadG = G; R3.treadN = 0; R3.treadHead = 0; R3.treadLast = {}; R3.treadLo = 1e9; R3.treadHi = -1;
  }
  if (R3.groundMapKey !== undefined && R3.treadPaveKey !== R3.groundMapKey && typeof _r3dPaved === 'function') {
    R3.treadPave = _r3dPaved(G); R3.treadPaveKey = R3.groundMapKey;
  }
  var E = G.ents || [], L = R3.treadLast, t = G.t || 0;
  var a = R3.treadA || (R3.treadA = new Float32Array(R3D_TREAD_MAX * 6 * R3D_TREAD_F));
  for (var i = 0; i < E.length; i++) {
    var e = E[i];
    if (e.dead || e.type !== 'unit' || e.air) continue;
    var d = rtsUnitDef(e.def);
    if (!d || d.kind === 'infantry' || d.kind === 'air' || d.sea) continue;
    var l = L[e.id];
    if (!l) { L[e.id] = [e.x, e.z, 0]; continue; }
    var dx = e.x - l[0], dz = e.z - l[1], m = Math.sqrt(dx * dx + dz * dz);
    if (m < R3D_TREAD_STEP) continue;
    if (m > 6) { l[0] = e.x; l[1] = e.z; continue; }
    var s = _r3dTreadGround(G, R3, (l[0] + e.x) / 2, (l[1] + e.z) / 2);
    if (s > 0) {
      /* tracked: the hulls that crush (RTS_CRUSHERS, and the ones carrying the flag themselves) */
      var trk = (d.crush || (typeof RTS_CRUSHERS !== 'undefined' && RTS_CRUSHERS[e.def])) ? 1 : 0;
      var r = d.r || 1.6, px = -dz / m, pz = dx / m;
      var off = r * (trk ? 0.55 : 0.5), hw = r * (trk ? 0.16 : 0.07);
      for (var side = -1; side <= 1; side += 2) {
        var h = R3.treadHead;
        _r3dTreadQuad(a, h * 6 * R3D_TREAD_F, l[0], l[1], e.x, e.z, px, pz, off * side, hw, l[2], l[2] + m, t, s, trk);
        if (h < R3.treadLo) R3.treadLo = h;
        if (h > R3.treadHi) R3.treadHi = h;
        R3.treadHead = (h + 1) % R3D_TREAD_MAX;
        R3.treadN = Math.min(R3D_TREAD_MAX, R3.treadN + 1);
      }
    }
    l[0] = e.x; l[1] = e.z; l[2] += m;
  }
}

/* The program's two halves, built on first use like the ground's materials (terrain3d.js):
   they read constants from gl3d.js, which loads after this file. */
function _r3dTreadVS() {
  return 'attribute vec3 aP; attribute vec2 aU; attribute vec3 aB;' +
  'uniform vec4 uCam; uniform vec2 uTilt; uniform float uInvD;' +
  'varying vec2 vU; varying vec3 vB;' +
  'void main(){' +
  '  vU = aU; vB = aB;' +
  '  float sx = (aP.x - uCam.x) * uCam.z;' +
  '  float sy = ((aP.z - uCam.y) * uTilt.x - aP.y * uTilt.y) * uCam.w;' +
  '  float d  = ((aP.z - uCam.y) * uTilt.y + aP.y * uTilt.x);' +
  '  float pw = 1.0 - d * uInvD;' +
  '  gl_Position = vec4(sx, -sy, -(d + ' + R3D_TREAD_LIFT.toFixed(2) + ') / ' + R3D_DEPTH_RANGE.toFixed(1) + ' * pw, pw);' +
  '}';
}
/* What the ground is multiplied by: 1 where there is no mark, down toward a dark, warm brown in
   the middle of a fresh one. A track is broken into cleats across it; a tyre line is smooth. */
function _r3dTreadFS() {
  return 'precision highp float; varying vec2 vU; varying vec3 vB;' +
  'uniform float uNow; uniform float uAmt;' +
  'void main(){' +
  '  float age = uNow - vB.x;' +
  '  float life = 1.0 - smoothstep(' + (R3D_TREAD_LIFE * 0.3).toFixed(1) + ', ' + R3D_TREAD_LIFE.toFixed(1) + ', age);' +
  '  float edge = 1.0 - smoothstep(0.5, 1.0, abs(vU.y));' +
  '  float cleat = mix(1.0, 0.5 + 0.5 * smoothstep(0.12, 0.3, abs(fract(vU.x * 1.8) - 0.5)), vB.z);' +
  /* pressed harder in some places than others, a metre or two at a time */
  '  float f = floor(vU.x * 0.6), g = fract(vU.x * 0.6);' +
  '  float h0 = fract(sin(f * 12.9898) * 43758.55), h1 = fract(sin((f + 1.0) * 12.9898) * 43758.55);' +
  '  float press = 0.72 + 0.28 * mix(h0, h1, g * g * (3.0 - 2.0 * g));' +
  '  float a = clamp(vB.y * life * edge * cleat * press * uAmt, 0.0, 1.0) * 0.5;' +
  '  gl_FragColor = vec4(1.0 - a * vec3(0.42, 0.50, 0.58), 1.0);' +
  '}';
}

/* Lay this frame's marks and draw them all, onto the ground that has just been drawn. */
function _r3dTreadDraw(gl, R3, G, cam, invD) {
  _r3dTreadTick(G, R3);
  if (!R3.treadN || R3.treadFail) return 0;
  if (!R3.treadP) {
    try { R3.treadP = _r3dProgram(gl, _r3dTreadVS(), _r3dTreadFS()); } catch (e) { R3.treadP = null; }
    if (!R3.treadP) { R3.treadFail = 1; return 0; }
    R3.treadBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, R3.treadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, R3.treadA.byteLength, gl.DYNAMIC_DRAW);
    R3.treadLo = 0; R3.treadHi = R3D_TREAD_MAX - 1;
  }
  var P = R3.treadP, Q = 6 * R3D_TREAD_F, i;
  gl.bindBuffer(gl.ARRAY_BUFFER, R3.treadBuf);
  if (R3.treadHi >= R3.treadLo) {
    gl.bufferSubData(gl.ARRAY_BUFFER, R3.treadLo * Q * 4, R3.treadA.subarray(R3.treadLo * Q, (R3.treadHi + 1) * Q));
    R3.treadLo = 1e9; R3.treadHi = -1;
  }
  gl.useProgram(P);
  gl.uniform4fv(gl.getUniformLocation(P, 'uCam'), cam);
  gl.uniform2f(gl.getUniformLocation(P, 'uTilt'), R3.cp, R3.sp);
  gl.uniform1f(gl.getUniformLocation(P, 'uInvD'), invD);
  gl.uniform1f(gl.getUniformLocation(P, 'uNow'), G.t || 0);
  gl.uniform1f(gl.getUniformLocation(P, 'uAmt'), R3.treadAmt === undefined ? 1 : R3.treadAmt);
  var at = [['aP', 3, 0], ['aU', 2, 12], ['aB', 3, 20]], loc = [];
  for (i = 0; i < at.length; i++) {
    loc.push(gl.getAttribLocation(P, at[i][0]));
    if (loc[i] < 0) continue;
    gl.enableVertexAttribArray(loc[i]);
    if (R3.inst && R3.inst.on) R3.inst.divisor(loc[i], 0);
    gl.vertexAttribPointer(loc[i], at[i][1], gl.FLOAT, false, R3D_TREAD_F * 4, at[i][2]);
  }
  gl.enable(gl.DEPTH_TEST);
  gl.depthMask(false);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.DST_COLOR, gl.ZERO);
  gl.drawArrays(gl.TRIANGLES, 0, R3.treadN * 6);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.disable(gl.BLEND);
  gl.depthMask(true);
  for (i = 0; i < loc.length; i++) if (loc[i] >= 0) gl.disableVertexAttribArray(loc[i]);
  return R3.treadN;
}
