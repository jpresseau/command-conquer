/* sprites/rift.js - the Veil Tank and the Rift Harvester (core/rift.js). Part of rts.sprites. The
   Rift Trooper is an infantry kit (sprites/unitmodels.js RTS_INF_KIT).

   The rift's colour is a cold white with a cyan heart, the colour of the Rift Gate's own light, and
   each carries a ring of it: the harvester round its hopper, the trooper on his back. The Veil
   Tank is the odd one out - its trick is to be seen as something else, so it carries the
   projector that does it, a dome of lenses on a low turret, and nothing bright at all. */
var RTS_RIFT_GLOW = ['#bfefff', '#f2fdff'];

function _sprUnitRift(X, key) {
  var m = X.m, VH = X.VH, TM = X.TM, S = X.S, DK = X.DK, part = X.part, i, a;
  if (key === 'veiltank') {
    if (part !== 'turret') {
      X.tracks(15, 5.0, 4, 1.9);
      _r3Slab(m, 0, 2.8, 0, 13.6, 2.4, 8.4, 1.0, VH[0], VH[1]);
      _r3Hip(m, -0.4, 5.2, 0, 12.6, 1.4, 8.2, 2.6, VH[3]);
    }
    if (part !== 'hull') {
      _r3Slab(m, -0.6, 6.4, 0, 6.6, 1.8, 6.0, 0.8, VH[1], TM[1]);
      _r3Box(m, 5.6, 7.0, 0, 8.0, 1.1, 1.1, DK[1], DK[3]);                  /* the gun */
      _r3Cone(m, -1.4, 8.2, 0, 2.6, 1.2, 2.2, S[2], 18);                    /* the projector dome */
      for (i = 0; i < 6; i++) {
        a = i / 6 * Math.PI * 2;
        _r3Cyl(m, -1.4 + Math.cos(a) * 1.7, 8.6, Math.sin(a) * 1.7, 0.45, 0.5, '#5b7a5a', '#8fb08a', 10);   /* its lenses, leaf-green */
      }
    }
    return true;
  }
  if (key === 'riftharv') {
    X.tracks(18, 5.6, 5, 2.1);
    _r3Slab(m, 1.0, 2.9, 0, 15, 3.4, 10, 1.2, VH[0], VH[1]);
    _r3Box(m, 6.6, 6.3, 0, 4.6, 3.6, 7.6, VH[1], VH[3]);                     /* the cab */
    _r3Box(m, 8.9, 7.4, 0, 0.6, 1.6, 5.8, RTS_PAL.glass, RTS_PAL.glass);
    _r3Box(m, -2.6, 6.3, 0, 8.8, 4.2, 9.0, TM[0], TM[1]);                     /* the hopper, team colour */
    _r3Cyl(m, -2.6, 10.5, 0, 4.4, 0.9, RTS_RIFT_GLOW[0], RTS_RIFT_GLOW[1], 24);   /* the rift ring round it */
    _r3Cyl(m, -2.6, 10.5, 0, 3.4, 1.0, DK[1], DK[2], 24);
    return true;
  }
  return false;
}
