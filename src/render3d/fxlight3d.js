/* render3d/fxlight3d.js - explosions and fires LIGHT what stands near them. Part of rts.render3d.

   The glare an explosion throws on the ground (fxemit3d.js) lit the ground and nothing standing on
   it: a tank beside a fireball stayed exactly as lit as one across the map, and a burning refinery
   threw no light on the war factory next door. So each frame picks the strongest few light
   sources among the effects - a fresh fireball, a pop, a round striking armour, a fire - and the
   mesh program adds their light to every surface in reach: warm, falling off with distance, and
   brightest on the side that faces it.

   R3D_PLIGHTS of them. The program's loop is that long whatever is burning, and a slot with nothing
   in it has no reach and sits far below the map, so nothing in the shader branches per light. */

var R3D_PLIGHTS = 4;
var R3D_PLIGHT_WARM = [1.0, 0.58, 0.24];

var R3D_PLIGHT_GLSL =
  'uniform vec4 uPL[' + R3D_PLIGHTS + ']; uniform vec3 uPC[' + R3D_PLIGHTS + '];' +
  'vec3 _plight(vec3 alb, vec3 n, vec3 wp){' +
  '  vec3 acc = vec3(0.0);' +
  '  for (int i = 0; i < ' + R3D_PLIGHTS + '; i++) {' +
  '    vec3 d = uPL[i].xyz - wp; float d2 = dot(d, d);' +
  '    float att = max(0.0, 1.0 - d2 / max(uPL[i].w * uPL[i].w, 1e-4)); att *= att;' +
  '    acc += uPC[i] * att * (max(dot(n, d * inversesqrt(max(d2, 1e-4))), 0.0) * 0.75 + 0.25);' +
  '  }' +
  '  return alb * acc; }';

/* The light each effect gives off now: [x, y, z, reach, strength], or null. */
function _r3dFxLightOf(f, V) {
  var A = RTS_ANIMS[f.kind], big = f.big || 1;
  if (!A || f.t < 0) return null;
  var gy = V.ground(f.x, f.z), R = R3D_FX_R * big;
  if (f.kind === 'boom') return [f.x, gy + (f.y || 0) + R * 0.5, f.z, R * 5, 2.4 * Math.exp(-f.t * 5)];
  if (f.kind === 'pop') return [f.x, gy + (f.y || 0) + R * 0.4, f.z, R * 3.5, 1.5 * Math.exp(-f.t * 9)];
  if (f.kind === 'hit') return [f.x, gy + (f.y || 0), f.z, R * 2.2, 1.0 * Math.exp(-f.t / A.dur * 5)];
  if (f.kind.indexOf('fire') === 0) {         /* the burn ladder's flames - smoke has a size too */
    var H = 3.0 * big, host = _r3dFxHost(f, gy), T = V.t + _r3dFxSeed(f) * 10;
    return [f.x, host.y + H * 0.4, f.z, H * 2.6 + host.w, 0.75 + 0.12 * Math.sin(T * 9.1) + 0.06 * Math.sin(T * 17.3)];
  }
  return null;
}

/* The strongest R3D_PLIGHTS, onto program P: uPL [x, y, z, reach], uPC [r, g, b] * strength. */
function _r3dFxLightSet(gl, R3, G, P) {
  /* R3.plightAmt takes the light out and leaves the rest, as R3.aoAmt does the occlusion */
  var V = { t: G.t || 0, ground: _rtsElev }, L = [], i, amt = R3.plightAmt === undefined ? 1 : R3.plightAmt;
  for (i = 0; G.fx && i < G.fx.length; i++) {
    var l = _r3dFxLightOf(G.fx[i], V);
    if (l && l[4] > 0.02) L.push(l);
  }
  L.sort(function (a, b) { return b[4] * b[3] - a[4] * a[3]; });
  var pos = R3.plPos || (R3.plPos = new Float32Array(R3D_PLIGHTS * 4));
  var col = R3.plCol || (R3.plCol = new Float32Array(R3D_PLIGHTS * 3));
  for (i = 0; i < R3D_PLIGHTS; i++) {
    var s = L[i];
    pos[i * 4] = s ? s[0] : 0; pos[i * 4 + 1] = s ? s[1] : -1e4; pos[i * 4 + 2] = s ? s[2] : 0; pos[i * 4 + 3] = s ? s[3] : 0;
    for (var c = 0; c < 3; c++) col[i * 3 + c] = s ? R3D_PLIGHT_WARM[c] * s[4] * amt : 0;
  }
  R3.plights = Math.min(L.length, R3D_PLIGHTS);
  gl.uniform4fv(gl.getUniformLocation(P, 'uPL'), pos);
  gl.uniform3fv(gl.getUniformLocation(P, 'uPC'), col);
}
