/* sprites/aloft.js - the Leviathan, the Falcon, the Hornet and the Carrier (core/aloft.js). Part
   of rts.sprites. The Jetpack Trooper is an infantry kit (sprites/unitmodels.js RTS_INF_KIT).

   The Leviathan is an envelope - a long body of slices along its length, fattest a little ahead
   of the middle - with a gondola slung under it, cruciform fins at the tail and an engine pod
   each side whose propellers turn (RTS_AIR_PARTS, sprites/unit-airsea.js). The Falcon is a delta:
   one broad swept wing, where the Kestrel's is a straight bar. The Hornet is four arms and a body,
   small enough to read as a drone beside a jet. The Carrier is the widest, flattest hull afloat:
   a deck, an island to one side, and two Hornets parked on it. */
var RTS_ALOFT_ENV = ['#7a7f86', '#9aa0a8'];

function _sprUnitAloft(X, key) {
  var m = X.m, VH = X.VH, TM = X.TM, S = X.S, DK = X.DK, GN = X.GN, part = X.part, i, x;
  if (key === 'leviathan') {
    for (i = 0; i < 16; i++) {                                         /* the envelope */
      x = -15 + i * 2 + 1;
      var u = (x + 1.5) / 16.5, r = 7.4 * Math.sqrt(Math.max(0.04, 1 - u * u));
      _r3Wheel(m, x, 10, 0, r, 2.05, 'x', i === 5 || i === 10 ? TM[1] : RTS_ALOFT_ENV[0], RTS_ALOFT_ENV[1], 20);
    }
    _r3Box(m, 1.5, 2.6, 0, 9.0, 2.6, 3.6, DK[1], DK[2]);                 /* the gondola */
    _r3Box(m, 5.6, 2.8, 0, 0.6, 1.4, 2.8, RTS_PAL.glass, RTS_PAL.glass);
    _r3Box(m, 1.5, 4.4, 0, 6.0, 1.4, 1.2, DK[0], DK[1]);                 /* its hanger */
    _r3Box(m, -14.2, 10, 0, 4.4, 9.0, 0.7, VH[1], VH[3]);                /* the fins */
    _r3Box(m, -14.2, 10, 0, 4.4, 0.7, 9.0, VH[1], VH[3]);
    for (var sd = -1; sd <= 1; sd += 2) {                                /* the engine pods */
      _r3Box(m, -3.0, 6.0, sd * 7.6, 1.2, 0.8, 3.0, DK[1], DK[2]);
      _r3Wheel(m, -3.0, 6.0, sd * 9.4, 1.3, 4.0, 'x', S[1], S[2], 16);
      if (part !== 'body') _r3Box(m, -0.6, 6.0, sd * 9.4, 0.3, 5.6, 0.6, DK[1], DK[2]);   /* the props, for the sprite */
    }
    _r3Box(m, 1.5, 1.0, 0, 3.0, 0.8, 2.0, GN[1], GN[3]);                 /* the bomb bay */
    return true;
  }
  if (key === 'falcon') {
    _r3Box(m, -1.0, 3.0, 0, 7.0, 1.2, 18.0, VH[0], VH[1]);               /* the delta, broad at the root */
    _r3Box(m, -2.4, 3.0, 0, 4.4, 1.2, 22.0, VH[1], VH[3]);               /* ...and swept to the tips */
    _r3Box(m, 2.2, 3.0, 0, 3.0, 1.2, 10.0, VH[0], VH[1]);
    _r3Box(m, 0, 3.4, 0, 18.0, 3.6, 3.8, VH[0], VH[1]);                  /* fuselage */
    _r3Box(m, 8.6, 3.6, 0, 4.4, 2.4, 2.4, VH[1], VH[3]);                 /* the needle nose */
    _r3Box(m, 2.6, 5.8, 0, 4.4, 1.6, 2.6, RTS_PAL.glass, RTS_PAL.glass); /* canopy */
    _r3Box(m, -7.4, 6.0, -1.6, 3.0, 4.0, 0.8, VH[1], VH[3]);             /* twin fins */
    _r3Box(m, -7.4, 6.0, 1.6, 3.0, 4.0, 0.8, VH[1], VH[3]);
    _r3Box(m, -1.0, 1.9, 0, 8.0, 1.0, 3.6, TM[1], TM[3]);                /* team stripe */
    _r3Cyl(m, -9.4, 3.4, 0, 1.6, 1.4, DK[1], DK[3], 12);                 /* exhaust */
    _r3Box(m, 0.4, 1.8, -4.4, 4.0, 1.4, 1.4, GN[1], GN[3]);              /* the two bombs */
    _r3Box(m, 0.4, 1.8, 4.4, 4.0, 1.4, 1.4, GN[1], GN[3]);
    return true;
  }
  if (key === 'hornet') {
    _r3Box(m, 0, 3, 0, 5.0, 1.8, 2.2, TM[0], TM[1]);                     /* the body */
    for (i = 0; i < 4; i++) {
      var a = (i + 0.5) / 4 * Math.PI * 2, ax = Math.cos(a) * 3.4, az = Math.sin(a) * 3.4;
      _r3Box(m, ax / 2, 3.2, az / 2, Math.abs(ax) + 0.6, 0.5, Math.abs(az) + 0.6, DK[1], DK[2]);
      _r3Cyl(m, ax, 3.5, az, 1.5, 0.3, S[1], S[2], 16);                  /* a rotor ring at each arm */
    }
    _r3Box(m, 1.4, 2.0, 0, 2.0, 0.6, 0.6, GN[1], GN[3]);                 /* the launcher */
    return true;
  }
  if (key === 'carrier') {
    var L = 40, Wd = 12;
    _r3Slab(m, 0, 0.6, 0, L, 3.6, Wd, 1.4, VH[0], VH[1]);                /* hull */
    _r3Box(m, L * 0.42, 0.9, 0, L * 0.18, 3.0, Wd * 0.6, VH[1], VH[3]);  /* bow */
    _r3Box(m, 0, 4.4, 0, L * 0.96, 0.6, Wd * 1.1, DK[1], DK[2]);         /* the flight deck */
    for (i = 0; i < 6; i++) _r3Box(m, -L * 0.4 + i * L * 0.16, 4.8, 0, L * 0.06, 0.1, 0.6, S[3], S[3]);   /* the centre line */
    _r3Box(m, -L * 0.05, 7.4, Wd * 0.45, L * 0.18, 5.4, 2.8, VH[2], VH[0]);   /* the island */
    _r3Box(m, -L * 0.05, 10.4, Wd * 0.45, L * 0.12, 0.8, 3.0, TM[1], TM[3]);
    _r3Box(m, -L * 0.08, 12.2, Wd * 0.45, 0.6, 3.0, 0.6, S[1], S[0]);    /* mast */
    _r3Box(m, -L * 0.0, 7.6, Wd * 0.45 - 1.5, 2.4, 1.2, 0.2, RTS_PAL.glass, RTS_PAL.glass);
    for (i = 0; i < 2; i++) {                                            /* two Hornets parked aft */
      var px = -L * 0.3 + i * 6;
      _r3Box(m, px, 5.6, -2.5, 4.0, 1.4, 1.8, VH[1], VH[3]);
      _r3Box(m, px, 5.8, -2.5, 4.6, 0.4, 4.6, DK[1], DK[2]);
      _r3Box(m, px, 6.4, -2.5, 1.0, 0.2, 1.8, TM[1], TM[3]);              /* a team stripe on each */
    }
    return true;
  }
  return false;
}
