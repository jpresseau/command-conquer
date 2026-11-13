/* render3d/afloat3d.js - a ship sits IN the water. Part of rts.render3d.

   A hull was laid on the sea the way a tank was laid on the grass before its shade
   (footing3d.js): nothing where the two meet. At rest a ship had no waterline at all - the wake
   (fxwake3d.js) is what a MOVING hull leaves - so a fleet at anchor read as models on a blue
   sheet. Each ship afloat has the water round it drawn for it: a ring of foam along the hull,
   broken by the swell's clock, and the hull's own shade in the water inside it. One quad a ship,
   the hull's length along its heading, through the shade's pass - drawn straight after the sea
   and before the ships, so the hull stands in it.

   Not for a boat under the surface, or one the player cannot see. R3.afloatAmt takes it out. */

var R3D_AFLOAT_LONG = 1.30;      /* a hull's half-length as a multiple of its radius... */
var R3D_AFLOAT_WIDE = 0.72;      /* ...and its half-beam, with the foam outside it */
var R3D_AFLOAT_FOAM = [0.86, 0.93, 0.95];

function _r3dAfloatFS() {
  return 'precision highp float; varying vec4 vL; varying vec4 vK;' +
    'uniform float uAmt; uniform float uT;' +
    'void main(){' +
    '  vec2 q = vL.xy / vL.zw; float d = length(q), an = atan(q.y, q.x);' +
    /* the foam: a band along the hull, thicker and thinner round it, breathing with the swell */
    '  float br = 0.5 + 0.5 * sin(an * 9.0 + uT * 1.3 + vK.x * 40.0) * sin(an * 4.0 - uT * 0.7);' +
    '  float ring = smoothstep(0.50, 0.80, d) * (1.0 - smoothstep(0.80, 1.0, d)) * (0.16 + 0.34 * br * br);' +
    '  float shade = (1.0 - smoothstep(0.25, 0.80, d)) * 0.30;' +
    '  float a = max(ring, shade);' +
    '  vec3 c = mix(vec3(0.02, 0.07, 0.13), vK.yzw, step(shade, ring));' +
    '  gl_FragColor = vec4(c, a * uAmt);' +
    '}';
}

/* Is this ship on the surface, where the player can see it? */
function _r3dAfloatOn(e, d) {
  if (!d || !d.sea || e.dead || e.inside || e.air || e.hidden) return false;
  return typeof _rtsEntSeen !== 'function' || _rtsEntSeen(e);
}

function _r3dAfloatBuild(G, R3, view) {
  var n = 0, E = G.ents;
  for (var i = 0; i < E.length; i++) {
    var e = E[i];
    if (e.type !== 'unit' || e.dead) continue;
    if (view && (e.x < view.x0 || e.x > view.x1 || e.z < view.z0 || e.z > view.z1)) continue;
    var d = rtsUnitDef(e.def);
    if (!_r3dAfloatOn(e, d)) continue;
    if (!R3.afloatA || R3.afloatA.length < (n + 1) * 6 * R3D_FOOT_F) {
      var big = new Float32Array(Math.max(32, (n + 1) * 2) * 6 * R3D_FOOT_F);
      if (R3.afloatA) big.set(R3.afloatA);
      R3.afloatA = big;
    }
    var r = d.r || 2, o = n * 6 * R3D_FOOT_F;
    _r3dFootQuad(R3.afloatA, o, e, r * R3D_AFLOAT_LONG, r * R3D_AFLOAT_WIDE, (e.id % 97) / 97);
    for (var v = 0; v < 6; v++) for (var c = 0; c < 3; c++) R3.afloatA[o + v * R3D_FOOT_F + 8 + c] = R3D_AFLOAT_FOAM[c];
    n++;
  }
  return n;
}

function _r3dAfloatDraw(gl, R3, G, cam, invD, view) {
  var amt = R3.afloatAmt === undefined ? 1 : R3.afloatAmt;
  R3.afloats = 0;
  if (!(amt > 0) || R3.afloatFail) return 0;
  var n = _r3dAfloatBuild(G, R3, view);
  if (!n) return 0;
  if (!R3.afloatP) {
    try { R3.afloatP = _r3dProgram(gl, _r3dRingVS(), _r3dAfloatFS()); } catch (e) { R3.afloatP = null; }
    if (!R3.afloatP) { R3.afloatFail = 1; return 0; }
  }
  if (!R3.footBuf) R3.footBuf = gl.createBuffer();
  gl.useProgram(R3.afloatP);
  gl.uniform1f(gl.getUniformLocation(R3.afloatP, 'uT'), G.t || 0);
  _r3dFootSend(gl, R3, R3.afloatP, R3.afloatA, n, cam, invD, Math.min(1, amt) * (1 - 0.4 * ((R3.sky && R3.sky.night) || 0)));
  R3.afloats = n;
  return n;
}
