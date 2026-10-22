/* sprites/mind.js - the Drone Tank, the Relay Hub and the Echo Sensor (core/mind.js). Part of
   rts.sprites. The Mentalist himself is an infantry kit (sprites/unitmodels.js RTS_INF_KIT).

   The Drone Tank has no crew, so it has no hatch, no periscope and no driver's slit: a sealed
   wedge on four hover pads with one sensor eye where a cupola would be. The Relay Hub is the dish
   it listens to; the Echo Sensor a dome ringed with listening masts. Violet is the mind's colour
   (the Mentalist's link), and only the Dominion's sensor wears it. */
var RTS_MIND_EYE = ['#7fe0ff', '#e6fbff'], RTS_MIND_VIOLET = ['#8a4fc0', '#b48ae8'];

function _sprUnitMind(X, key) {
  if (key !== 'dronetank') return false;
  var m = X.m, VH = X.VH, TM = X.TM, S = X.S, DK = X.DK, part = X.part, s, k;
  if (part !== 'turret') {
    for (s = -1; s <= 1; s += 2) for (k = -1; k <= 1; k += 2)                 /* four hover pads */
      _r3Cyl(m, k * 4.6, 0.6, s * 3.6, 2.2, 1.6, DK[1], DK[2], 18);
    _r3Slab(m, 0, 2.0, 0, 14, 2.6, 8.6, 1.0, VH[0], VH[1]);
    _r3Hip(m, 0.4, 4.6, 0, 12.4, 2.4, 8.0, 3.0, VH[3]);                      /* the sealed wedge */
    _r3Box(m, -6.2, 3.2, 0, 1.6, 1.4, 6.4, DK[1], DK[2]);                    /* exhaust vents */
  }
  if (part !== 'hull') {
    _r3Slab(m, -0.6, 7.0, 0, 6.4, 2.0, 5.6, 0.8, VH[1], TM[1]);             /* low turret, team roof */
    _r3Box(m, 5.2, 7.6, 0, 6.8, 0.9, 0.9, DK[1], DK[3]);                     /* the gun, thin and quick */
    _r3Cyl(m, -1.6, 9.0, 1.6, 0.8, 0.9, RTS_MIND_EYE[0], RTS_MIND_EYE[1], 16);   /* the sensor eye */
  }
  return true;
}
function _sprBldMind(X, key) {
  var m = X.m, W = X.W, D = X.D, C = X.C, S = X.S, B = X.B, DK = X.DK, WH = X.WH, i, a;
  if (key === 'relayhub') {
    _r3Box(m, 0, 0, 0, W - 6, 3, D - 6, C[2], C[0]);
    _r3Box(m, -4, 3, 4, W - 22, 9, D - 22, WH[1], WH[3]);                    /* the equipment hall */
    X.facade(5, 3, (W - 22) / 2, (D - 22) / 2);
    _r3Box(m, -4, 12, 4, W - 20, 1.2, D - 20, B.roof, B.roof);
    _r3Cyl(m, 8, 3, -8, 2, 12, S[1], S[3], 16);                              /* the mast */
    _r3Cone(m, 8, 15, -8, 9, 3, 3, S[3], 24);                                /* the dish */
    _r3Cyl(m, 8, 18, -8, 0.7, 4, S[2], RTS_MIND_EYE[0], 12);                 /* its feed */
    for (i = 0; i < 3; i++) X.vent(-12 + i * 5, 12, -6, 2, 2);
    return true;
  }
  if (key === 'echo') {
    _r3Box(m, 0, 0, 0, W - 6, 3, D - 6, C[2], C[0]);
    _r3Cyl(m, 0, 3, 0, 13, 5, C[1], C[0], 24);                               /* the drum */
    _r3Cone(m, 0, 8, 0, 12, 3, 9, RTS_MIND_VIOLET[0], 24);                   /* the dome */
    _r3Cyl(m, 0, 16.5, 0, 2.4, 1.4, RTS_MIND_VIOLET[1], RTS_MIND_EYE[1], 16);
    for (i = 0; i < 6; i++) {                                                /* the ring of listening masts */
      a = i / 6 * Math.PI * 2;
      _r3Box(m, Math.cos(a) * 15, 3, Math.sin(a) * 15, 0.8, 14, 0.8, S[3], S[2]);
      _r3Box(m, Math.cos(a) * 15, 17, Math.sin(a) * 15, 2.6, 0.8, 0.8, S[1], RTS_MIND_VIOLET[1]);
    }
    _r3Cyl(m, 0, 8.5, 0, 13.5, 0.8, B.roof, B.roof, 24);                     /* team band */
    return true;
  }
  return false;
}
