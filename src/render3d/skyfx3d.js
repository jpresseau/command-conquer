/* render3d/skyfx3d.js - what the sky puts in the effects pass: the lamps' glows, the rain and
   the fog banks. Part of rts.render3d; the sky itself is sky3d.js.

   All of it is laid round the VIEW each frame, from hashes, and nothing is kept: a raindrop is a
   position and a phase in its fall worked out from its index and the clock, so the rain costs
   no state, cannot drift out of step with the frame, and is the same on every frame drawn at
   the same moment. R3.rainAmt / R3.bankAmt / R3.lampAmt take each out for a spec's A/B. */

var R3D_RAIN_N = 360;            /* streaks at once, at most */
var R3D_RAIN_FALL = 0.55;        /* seconds from the top of a streak's fall to the ground */
var R3D_RAIN_H = 16;             /* world units it falls */
var R3D_RAIN_C = [0.78, 0.84, 0.92];
var R3D_BANK_N = 14;             /* fog banks at once */
var R3D_BANK_C = [0.86, 0.88, 0.91];
var R3D_FXT_RAIN = 10, R3D_FXT_GLOW = 11;

function _r3dFxSky(G, V) {
  var R3 = window._R3D, S = R3 && R3.sky;
  if (!S || S === R3D_SKIES.day) return;
  var vb = _r3dBoundsNear(_r3dViewBounds(), 6, 12), W = vb.x1 - vb.x0, D = vb.z1 - vb.z0, i;

  /* THE LAMPS: a steady glow on every bulb in view, headlights on what is moving */
  if (S.night > 0 && R3.lampAmt !== 0) {
    var glow = function (x, y, z, r, c) {
      if (x < vb.x0 || x > vb.x1 || z < vb.z0 || z > vb.z1) return;
      _r3dFxBill(V.M, V, x, y, z, r, r, 0.6, R3D_FXT_GLOW, 0, 0.5, 1.1 * S.night, 0, c);
    };
    (R3.dressLamps || []).forEach(function (p) { glow(p[0], p[1], p[2], 0.55, R3D_LAMP_C); });
    (R3.bridgeLamps || []).forEach(function (p) { glow(p[0], p[1], p[2], 0.55, R3D_LAMP_C); });
    var E = G.ents || [];
    for (i = 0; i < E.length; i++) {
      var e = E[i];
      if (e.dead) continue;
      if (e.type === 'struct' && !e.building) {
        var d = rtsStructDef(e.def);
        if (d && !d.wall) glow(e.x, _rtsElev(e.x, e.z) + 2.4, e.z + d.h * RTS_TILE / 2 + 0.4, 0.5, R3D_LAMP_C);
      } else if (e.type === 'unit' && !e.air && e.path) {
        var ud = rtsUnitDef(e.def);
        if (!ud || ud.kind !== 'vehicle' || ud.sea) continue;
        var fx = Math.cos(e.rot), fz = Math.sin(e.rot), y = _rtsStandY(e.x, e.z) + 0.9, f = (e.r || 2) * 0.95;
        glow(e.x + fx * f - fz * 0.6, y, e.z + fz * f + fx * 0.6, 0.35, R3D_HEAD_C);
        glow(e.x + fx * f + fz * 0.6, y, e.z + fz * f - fx * 0.6, 0.35, R3D_HEAD_C);
      }
    }
  }

  /* THE RAIN: streaks falling through the view, a ring where each lands */
  if (S.rain > 0 && R3.rainAmt !== 0) {
    var n = Math.min(R3D_RAIN_N, Math.round(W * D / 26));
    R3.rainN = n;
    for (i = 0; i < n; i++) {
      var ph = _r3dFxH(i, 3.1), cyc = (V.t / R3D_RAIN_FALL + ph), ep = Math.floor(cyc), p = cyc - ep;
      var rx = vb.x0 + _r3dFxH(i * 1.7 + ep * 0.31, 7.3) * W, rz = vb.z0 + _r3dFxH(i * 2.3 + ep * 0.57, 1.9) * D;
      var gy = V.ground(rx, rz), top = gy + R3D_RAIN_H * (1 - p);
      if (V.water(rx, rz)) gy = Math.max(gy, R3D_WATER_Y);
      if (p < 0.94) {
        /* a short streak, leaning down the wind */
        _r3dFxStreak(V.M, V, rx + 0.35, top + 1.7, rz + 0.12, rx, top, rz, 0.11, 0, R3D_FXT_RAIN, 0, i, 0.85 * S.rain, 0, R3D_RAIN_C);
      } else {
        /* landed: a little ring, spreading */
        var k = (p - 0.94) / 0.06;
        _r3dFxDecal(V.M, V, rx, rz, 0.15 + k * 0.45, 8, 0.3, R3D_FXT_RING, k, i, 0.5 * S.rain * (1 - k), R3D_RAIN_C);
      }
    }
  }

  /* THE FOG BANKS: low, wide, slow, drifting on the wind across the view */
  if (S.banks > 0 && R3.bankAmt !== 0) {
    var span = Math.max(W, D) + 60;
    for (i = 0; i < R3D_BANK_N; i++) {
      var bx = vb.x0 - 30 + ((_r3dFxH(i, 5.5) * span + V.t * 1.1) % span);
      var bz = vb.z0 - 30 + ((_r3dFxH(i, 8.8) * span + V.t * 0.4) % span);
      var r = 14 + _r3dFxH(i, 2.2) * 12;
      _r3dFxBill(V.M, V, bx, V.ground(bx, bz) + r * 0.25, bz, r, r * 0.55, 0.4, R3D_FXT_BLOB, 0.35, i * 0.37, 0.32 * S.banks, 0, R3D_BANK_C);
    }
  }
}
