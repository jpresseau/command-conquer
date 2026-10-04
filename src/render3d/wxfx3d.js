/* render3d/wxfx3d.js - weather called down (core/wxsupers.js) in the effects pass: a fog bank
   lying on the ground where it was called, and a thunderhead's cloud, its rain and its bolts.
   Laid from hashes each frame like the sky's own weather (skyfx3d.js), so it costs no state.
   Each comes in and goes out over R3D_WX_FADE seconds rather than popping. */

var R3D_WX_FADE = 3;
var R3D_WX_FOG_C = [0.88, 0.9, 0.93];
var R3D_WX_CLOUD_C = [0.30, 0.32, 0.38];
var R3D_WX_BOLT_C = [0.86, 0.9, 1.0];

function _r3dFxWx(G, V) {
  var W = G && G.wx, R3 = window._R3D;
  if (R3 && R3.wxOff === true) return;
  var vb = _r3dViewBounds(), i, j;
  for (i = 0; W && i < W.length; i++) {
    var c = W[i], life = c.kind === 'fog' ? RTS_FOGBANK.time : RTS_THUNDER.time;
    if (c.x + c.r < vb.x0 - 20 || c.x - c.r > vb.x1 + 20 || c.z + c.r < vb.z0 - 20 || c.z - c.r > vb.z1 + 20) continue;
    var fade = Math.max(0, Math.min(1, (life - c.t) / R3D_WX_FADE, c.t / R3D_WX_FADE));
    if (c.kind === 'fog') {
      /* the bank: wide low blobs over the whole of it, thickest in the middle, drifting */
      var nb = Math.round(c.r * c.r / 9);
      for (j = 0; j < nb; j++) {
        var a = _r3dFxH(j, c.id * 1.7) * Math.PI * 2, rr = Math.sqrt(_r3dFxH(j, c.id * 3.1)) * c.r * 0.92;
        var bx = c.x + Math.cos(a) * rr + Math.sin(V.t * 0.15 + j) * 2.2, bz = c.z + Math.sin(a) * rr + Math.cos(V.t * 0.12 + j * 0.7) * 1.6;
        var br = 6 + _r3dFxH(j, 5.3) * 5;
        /* flat and low: a blanket lying on the ground, not a cloud standing on it */
        _r3dFxBill(V.M, V, bx, V.ground(bx, bz) + br * 0.12, bz, br, br * 0.38, 0.4, R3D_FXT_BLOB, 0.3, j * 0.41 + c.id,
                   0.6 * fade * (1 - 0.3 * rr / c.r), 0, R3D_WX_FOG_C);
      }
    } else {
      /* the cloud, low, heavy and dark over the storm */
      var nc = Math.round(c.r * c.r / 16);
      for (j = 0; j < nc; j++) {
        var ca = _r3dFxH(j, c.id * 2.3) * Math.PI * 2, cr = Math.sqrt(_r3dFxH(j, c.id * 4.7)) * c.r;
        var cx = c.x + Math.cos(ca) * cr + Math.sin(V.t * 0.3 + j) * 1.5, cz = c.z + Math.sin(ca) * cr;
        var cs = 7 + _r3dFxH(j, 7.7) * 5;
        _r3dFxBill(V.M, V, cx, V.ground(cx, cz) + 12 + _r3dFxH(j, 1.3) * 4, cz, cs, cs * 0.55, 0.4, R3D_FXT_BLOB, 0.4, j * 0.37 + c.id,
                   0.6 * fade, 0, R3D_WX_CLOUD_C);
      }
      /* its rain, under the cloud only */
      var nr = Math.round(c.r * c.r / 3);
      for (j = 0; j < nr; j++) {
        var ph = _r3dFxH(j, 3.3), cyc = V.t / R3D_RAIN_FALL + ph, ep = Math.floor(cyc), p = cyc - ep;
        var ra = _r3dFxH(j * 1.7 + ep * 0.31, c.id) * Math.PI * 2, rd = Math.sqrt(_r3dFxH(j * 2.3 + ep * 0.57, c.id + 0.5)) * c.r;
        var rx = c.x + Math.cos(ra) * rd, rz = c.z + Math.sin(ra) * rd, top = V.ground(rx, rz) + 18 * (1 - p);
        if (p < 0.94) _r3dFxStreak(V.M, V, rx + 0.35, top + 1.9, rz + 0.12, rx, top, rz, 0.12, 0, R3D_FXT_RAIN, 0, j, 0.8 * fade, 0, R3D_RAIN_C);
      }
    }
  }
  /* the bolts: a jagged line of light from the cloud to what it struck, and a glare at the foot */
  var Bl = G && G.bolts;
  for (i = 0; Bl && i < Bl.length; i++) {
    var b = Bl[i], gy = V.ground(b.x, b.z), op = Math.max(0, 1 - b.t / 0.35), px = b.x, pz = b.z, py = gy + 24;
    for (j = 1; j <= 8; j++) {
      var k = j / 8, nx = b.x + (j < 8 ? (_r3dFxH(j, b.x + b.z) - 0.5) * 3.4 * (1 - k) : 0);
      var nz = b.z + (j < 8 ? (_r3dFxH(j, b.z - b.x) - 0.5) * 2.4 * (1 - k) : 0), ny = gy + 24 * (1 - k);
      _r3dFxStreak(V.M, V, px, py, pz, nx, ny, nz, 1.0, 0.6, R3D_FXT_STREAK, 0, 0, op, 0, R3D_WX_BOLT_C);
      _r3dFxStreak(V.M, V, nx, ny, nz, px, py, pz, 1.0, 0.6, R3D_FXT_STREAK, 0, 0, op, 0, R3D_WX_BOLT_C);
      px = nx; py = ny; pz = nz;
    }
    _r3dFxBill(V.M, V, b.x, gy + 1, b.z, 4, 4, 0.6, R3D_FXT_GLOW, 0, 0.5, op, 0, R3D_WX_BOLT_C);
  }
}
