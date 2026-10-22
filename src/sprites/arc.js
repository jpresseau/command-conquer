/* sprites/arc.js - the Arc Tank (core/arc.js). Part of rts.sprites.

   The Arc Tower's copper on tracks: a squat Dominion hull, and on the turret two short coils
   side by side with their sparks lit, in place of a gun. Copper and a blue spark are the arc's
   colours on every model that carries one - the tower, the trooper's backpack, this. */
var RTS_ARC_SPARK = '#3fb6e8';

function _sprUnitArc(X, key) {
  if (key !== 'arctank') return false;
  var m = X.m, VH = X.VH, TM = X.TM, S = X.S, DK = X.DK, part = X.part, CU = RTS_PAL.mat.copper, s, k;
  if (part !== 'turret') {
    X.tracks(16, 5.4, 4, 2.0);
    _r3Slab(m, 0, 2.9, 0, 14.8, 3.0, 9.0, 1.0, VH[0], VH[1]);
    _r3Hip(m, -0.8, 5.9, 0, 13.6, 1.5, 9.0, 2.2, VH[3]);                     /* deck */
    _r3Box(m, 6.4, 2.9, 0, 2.6, 2.8, 8.0, VH[1], VH[3]);                     /* glacis */
    _r3Box(m, -6.4, 6.0, -2.4, 2.4, 1.6, 2.6, CU[2], CU[0]);                 /* the generator */
    _r3Box(m, -6.4, 6.0, 2.4, 2.4, 1.6, 2.6, CU[2], CU[0]);
  }
  if (part !== 'hull') {
    _r3Slab(m, -0.4, 7.0, 0, 7.2, 2.4, 7.0, 0.8, VH[1], TM[1]);             /* turret, team roof */
    for (s = -1; s <= 1; s += 2) {                                           /* two coils */
      _r3Cyl(m, 0.8, 9.4, s * 2.0, 1.1, 6.2, S[1], S[3], 16);
      for (k = 0; k < 6; k++) _r3Cyl(m, 0.8, 9.8 + k * 0.95, s * 2.0, 1.75 - k * 0.08, 0.5, CU[k & 1 ? 1 : 0], CU[2], 16);
      _r3Cyl(m, 0.8, 15.6, s * 2.0, 1.4, 1.1, RTS_ARC_SPARK, '#e8f6ff', 16); /* the spark */
    }
    _r3Box(m, 3.6, 7.4, 0, 1.6, 1.4, 4.6, DK[1], DK[3]);                      /* the emitter bar */
  }
  return true;
}
