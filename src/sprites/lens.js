/* sprites/lens.js - the Lens Tower and the Lens Tank (core/lens.js). Part of rts.sprites.

   Both are built round the same thing, a cut crystal lens, so the tank reads at a glance as the
   tower's beam on tracks. The Compact's buildings are pale concrete and whitewash; the lens is
   the one part of either that is not, and it is the part the eye should go to. */
var RTS_LENS_GLASS = ['#9fd8f2', '#6fb4dc', '#e6fbff'];

/* THE LENS TOWER, one cell by two like the Arc Tower it answers, and the same height class -
   so the two armies' premium defences read as a pair, a copper coil against a white pylon. A
   hexagonal plinth, a tapering shaft with four fins up it, a collar, and the lens: one tall
   crystal ringed by six small mirrors leaning out, which are what the relays aim at. */
function _sprBldLens(X, key) {
  if (key !== 'prism') return false;
  var m = X.m, W = X.W, D = X.D, C = X.C, S = X.S, B = X.B, WH = X.WH, DK = X.DK, LG = RTS_LENS_GLASS, i, a;
  _r3Box(m, 0, 0, 0, W - 4, 3, D - 6, C[2], C[0]);                         /* footing */
  _r3Cyl(m, 0, 3, 0, 9, 4, WH[2], WH[0], 6);                                /* plinth */
  _r3Cyl(m, 0, 7, 0, 8, 1.6, B.roof, B.roof, 6);                            /* team band */
  _r3Cone(m, 0, 8.6, 0, 6, 3.2, 20, WH[1], 16);                             /* the shaft */
  for (i = 0; i < 4; i++) {                                                 /* fins */
    a = i * Math.PI / 2 + Math.PI / 4;
    _r3Box(m, Math.cos(a) * 5.2, 8.6, Math.sin(a) * 5.2, 1.4, 14, 1.4, WH[0], WH[3]);
  }
  _r3Cyl(m, 0, 28.6, 0, 5, 1.6, S[1], S[3], 16);                            /* collar */
  _r3Crystal(m, 0, 30, 0, 4.2, 12, 0, 0, LG, 6, 0.35, 7);                   /* the lens */
  for (i = 0; i < 6; i++) {                                                 /* the ring of mirrors */
    a = i / 6 * Math.PI * 2;
    _r3Crystal(m, Math.cos(a) * 6, 29.4, Math.sin(a) * 6, 1.2, 5, Math.cos(a) * 0.5, Math.sin(a) * 0.5, LG, 5, 0.4, i + 1);
  }
  /* the plant at its foot: a power cabinet with a lit panel, and the cable run to it */
  _r3Box(m, 0, 3, D / 2 - 7, 8, 5, 5, S[1], S[0]);
  _r3Box(m, 0, 5, D / 2 - 4.4, 5, 2, 0.6, LG[0], LG[2]);
  _r3Box(m, 0, 1.6, D / 4 - 3, 2.6, 0.7, D / 2 - 6, DK[1], DK[0]);
  _r3Box(m, 0, 3, -D / 2 + 7, 7, 3, 6, C[1], C[0]);                         /* a step down to the pad */
  return true;
}

/* THE LENS TANK. A light hull on four road wheels, and on the turret a yoke holding the lens
   leant forward along the gun line with a mirror dish behind it. No barrel at all: the one tank
   in the game without one, which is the fastest way to say it does not fire shells. */
function _sprUnitLens(X, key) {
  if (key !== 'prismtank') return false;
  var m = X.m, VH = X.VH, TM = X.TM, S = X.S, DK = X.DK, part = X.part, LG = RTS_LENS_GLASS;
  if (part !== 'turret') {
    X.tracks(15, 5.0, 4, 1.9);
    _r3Slab(m, 0, 2.8, 0, 13.5, 2.8, 8.4, 1.0, VH[0], VH[1]);
    _r3Hip(m, -0.6, 5.6, 0, 12.5, 1.4, 8.4, 2.0, VH[3]);                    /* deck */
    _r3Box(m, 6.0, 2.8, 0, 2.4, 2.6, 7.4, VH[1], VH[3]);                     /* glacis */
    _r3Box(m, -6.0, 5.8, 0, 2.2, 1.0, 5.6, DK[1], DK[2]);                    /* engine grille */
    _r3Box(m, 7.2, 4.4, -2.9, 0.9, 1.0, 1.4, LG[0], LG[2]);                  /* lamps */
    _r3Box(m, 7.2, 4.4, 2.9, 0.9, 1.0, 1.4, LG[0], LG[2]);
  }
  if (part !== 'hull') {
    _r3Cyl(m, -0.5, 6.4, 0, 3.6, 1.6, VH[1], TM[1], 16);                    /* turret ring, team roof */
    _r3Box(m, -0.5, 8.0, -2.5, 1.6, 4.2, 0.9, S[1], S[3]);                   /* the yoke */
    _r3Box(m, -0.5, 8.0, 2.5, 1.6, 4.2, 0.9, S[1], S[3]);
    _r3Wheel(m, -2.6, 10.0, 0, 2.2, 0.7, 'x', S[2], S[3], 20);               /* the mirror dish */
    _r3Crystal(m, 0.4, 7.8, 0, 2.6, 9, 1.4, 0, LG, 6, 0.4, 3);               /* the lens, leant forward */
  }
  return true;
}
