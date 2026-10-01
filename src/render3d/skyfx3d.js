/* render3d/skyfx3d.js - what the sky puts in the effects pass: the lamps' glows, the rain, the
   snow, a sandstorm's driven sand, the lightning's bolt and the fog banks. Part of
   rts.render3d; the sky itself is sky3d.js.

   All of it is laid round the VIEW each frame, from hashes, and nothing is kept: a raindrop is a
   position and a phase in its fall worked out from its index and the clock, so the rain costs
   no state, cannot drift out of step with the frame, and is the same on every frame drawn at
   the same moment. R3.rainAmt / R3.bankAmt / R3.lampAmt / R3.snowAmt / R3.sandAmt and
   R3.boltOff take each out for a spec's A/B. */

var R3D_RAIN_N = 360;            /* streaks at once, at most */
var R3D_RAIN_FALL = 0.55;        /* seconds from the top of a streak's fall to the ground */
var R3D_RAIN_H = 16;             /* world units it falls */
var R3D_RAIN_C = [0.78, 0.84, 0.92];
var R3D_BANK_N = 14;             /* fog banks at once */
var R3D_BANK_C = [0.86, 0.88, 0.91];
var R3D_FXT_RAIN = 10, R3D_FXT_GLOW = 11, R3D_FXT_FLAKE = 12;
var R3D_SNOW_N = 420;            /* flakes at once, at most */
var R3D_SNOW_FALL = 3.2;         /* seconds a flake takes to come down */
var R3D_SNOW_C = [0.95, 0.96, 0.98];
var R3D_SAND_N = 380;            /* grains of driven sand at once, at most */
var R3D_SAND_FLY = 0.7;          /* seconds a grain takes to cross its run */
var R3D_SAND_RUN = 14;           /* world units it is blown */
var R3D_SAND_C = [0.86, 0.68, 0.44];
var R3D_BOLT_C = [0.86, 0.9, 1.0];

/* Where strike n of the lightning comes down this frame: its place in the view (_rtsBoltAt,
   sky3d.js) on the ground there - [x, y, z, n] - or null when nothing is striking. Read by the
   bolt below and by the light it throws (_r3dSkyLights). */
function _r3dBoltFoot(G) {
  var R3 = window._R3D, S = R3 && R3.sky;
  if (!S || !(S.flash > 0.05) || R3.boltOff === true || typeof _rtsLightning !== 'function') return null;
  var n = _rtsLightning((G && G.t) || 0).n, b = _rtsBoltAt(n), vb = _r3dViewBounds();
  var x = vb.x0 + b.u * (vb.x1 - vb.x0), z = vb.z0 + b.v * (vb.z1 - vb.z0);
  return [x, _rtsElev(x, z), z, n];
}

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

  /* THE SNOW: flakes drifting down through the view, swaying as they come */
  if (S.snow > 0 && R3.snowAmt !== 0) {
    var nf = Math.min(R3D_SNOW_N, Math.round(W * D / 22));
    R3.snowN = nf;
    for (i = 0; i < nf; i++) {
      var fph = _r3dFxH(i, 4.7), fc = V.t / R3D_SNOW_FALL + fph, fe = Math.floor(fc), fp = fc - fe;
      var fx = vb.x0 + _r3dFxH(i * 1.3 + fe * 0.41, 2.9) * W + Math.sin(V.t * 1.3 + i) * 0.8;
      var fz = vb.z0 + _r3dFxH(i * 2.9 + fe * 0.73, 6.1) * D + Math.cos(V.t * 1.1 + i * 0.7) * 0.5;
      var fy = V.ground(fx, fz) + 18 * (1 - fp), fr = 0.1 + _r3dFxH(i, 8.3) * 0.1;
      _r3dFxBill(V.M, V, fx, fy, fz, fr, fr, 0.2, R3D_FXT_FLAKE, 0, i, 0.85 * S.snow * Math.min(1, (1 - fp) * 8), 0, R3D_SNOW_C);
    }
  }

  /* THE SANDSTORM: sand driven low across the view on the wind, and clouds of it rolling by */
  if (S.sand > 0 && R3.sandAmt !== 0) {
    var ns = Math.min(R3D_SAND_N, Math.round(W * D / 18));
    R3.sandN = ns;
    for (i = 0; i < ns; i++) {
      var sp = _r3dFxH(i, 6.1), sc = V.t / R3D_SAND_FLY + sp, se = Math.floor(sc), sq = sc - se;
      var sx = vb.x0 - R3D_SAND_RUN + _r3dFxH(i * 1.9 + se * 0.37, 2.3) * (W + R3D_SAND_RUN) + sq * R3D_SAND_RUN;
      var sz = vb.z0 + _r3dFxH(i * 2.7 + se * 0.61, 5.9) * D + sq * R3D_SAND_RUN * 0.3;
      var sy = V.ground(sx, sz) + 0.3 + _r3dFxH(i, 9.7) * 2.6;
      _r3dFxStreak(V.M, V, sx - 2.4, sy + 0.08, sz - 0.7, sx, sy, sz, 0.09, 0, R3D_FXT_RAIN, 0, i, 0.75 * S.sand * Math.sin(sq * Math.PI), 0, R3D_SAND_C);
    }
    var sspan = Math.max(W, D) + 60;
    for (i = 0; i < R3D_BANK_N; i++) {
      var cx = vb.x0 - 30 + ((_r3dFxH(i, 3.5) * sspan + V.t * 7) % sspan), cz = vb.z0 - 30 + ((_r3dFxH(i, 6.6) * sspan + V.t * 2) % sspan);
      var cr = 10 + _r3dFxH(i, 4.2) * 10;
      _r3dFxBill(V.M, V, cx, V.ground(cx, cz) + cr * 0.3, cz, cr, cr * 0.5, 0.4, R3D_FXT_BLOB, 0.4, i * 0.53, 0.4 * S.sand, 0, R3D_SAND_C);
    }
  }

  /* THE BOLT: the strike itself, a jagged line of light from the cloud to the ground, forked,
     and a glare where it lands. A streak is a tracer's, bright at its head and faint at its
     tail, so each piece is laid both ways to burn evenly along its length. */
  var foot = _r3dBoltFoot(G);
  if (foot) {
    var bp = _rtsBoltAt(foot[3]).pts, bw = 1.1, bop = Math.min(1, S.flash * 1.4);
    var seg = function (a, b, w2, op) {
      _r3dFxStreak(V.M, V, a[0], a[1], a[2], b[0], b[1], b[2], w2, 0.6, R3D_FXT_STREAK, 0, 0, op, 0, R3D_BOLT_C);
      _r3dFxStreak(V.M, V, b[0], b[1], b[2], a[0], a[1], a[2], w2, 0.6, R3D_FXT_STREAK, 0, 0, op, 0, R3D_BOLT_C);
    };
    var at3 = function (p) { return [foot[0] + p[0], foot[1] + p[1], foot[2] + p[2]]; };
    for (i = 1; i < bp.length; i++) seg(at3(bp[i - 1]), at3(bp[i]), bw, bop);
    var fk = at3(bp[3]);
    seg(fk, [fk[0] + 4, fk[1] - 7, fk[2] + 1.5], bw * 0.6, bop * 0.7);
    _r3dFxBill(V.M, V, foot[0], foot[1] + 1, foot[2], 4, 4, 0.6, R3D_FXT_GLOW, 0, 0.5, bop, 0, R3D_BOLT_C);
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
