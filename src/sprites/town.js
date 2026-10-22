/* sprites/town.js - the town's buildings (core/garrison.js): a cottage, a block of flats and the
   town hall. Part of rts.sprites.

   They are built from RTS_PAL.bld[side] like every building, and their side is the town's until
   a squad goes in - so the ROOF takes the colour of whoever holds the house, which is how a
   player reads a town at a glance: brown tiles are nobody's, blue are yours. Everything else is
   the town's own: whitewash and brick, glazed windows, a chimney, a clock. */
function _sprBldTown(X, key) {
  var m = X.m, W = X.W, D = X.D, C = X.C, S = X.S, B = X.B, K = X.K, WH = X.WH, DK = X.DK, i;
  if (key === 'cottage') {
    _r3Box(m, 0, 0, 0, W - 6, 2, D - 6, C[2], C[0]);                          /* the plinth */
    _r3Box(m, 0, 2, 0, W - 12, 12, D - 14, WH[1], WH[3]);                      /* whitewashed walls */
    X.winRow(D / 2 - 7, 6, 0, 2, 14, 4, 4.5);
    X.winRow(-(D / 2 - 7), 6, 0, 2, 14, 4, 4.5);
    X.winSide(W / 2 - 6, 6, 0, 2, 12, 4, 4.5);
    X.winSide(-(W / 2 - 6), 6, 0, 2, 12, 4, 4.5);
    _r3Box(m, 6, 2, D / 2 - 6.6, 4.5, 7.5, 1.5, DK[1], DK[2]);                /* the door */
    _r3Gable(m, 0, 14, 0, W - 9, 9, D - 11, B.roof);                          /* tiled roof, the holder's colour */
    _r3Box(m, -W / 4, 16, -D / 6, 3.4, 10, 3.4, K[0], K[1]);                   /* chimney */
    _r3Box(m, -W / 4, 26, -D / 6, 4.2, 1.2, 4.2, K[2], K[1]);
    _r3Box(m, W / 2 - 5, 2, -D / 2 + 6, 2.4, 3.4, 8, X.OL[1], X.OL[0]);        /* a woodpile */
    return true;
  }
  if (key === 'flats') {
    _r3Box(m, 0, 0, 0, W - 4, 2, D - 4, C[2], C[0]);
    _r3Box(m, 0, 2, 0, W - 10, 30, D - 10, K[0], K[1]);                        /* four storeys of brick */
    for (i = 0; i < 4; i++) X.facade(5 + i * 7, 4, (W - 10) / 2, (D - 10) / 2);
    for (i = 1; i < 4; i++) _r3Box(m, 0, 2 + i * 7.2, 0, W - 8.6, 0.8, D - 8.6, B.trim, B.trim);   /* floor bands */
    _r3Box(m, 0, 32, 0, W - 8, 1.6, D - 8, B.dark, B.roof);                    /* the roof, the holder's colour */
    _r3Cyl(m, W / 5, 33.6, -D / 5, 3.2, 6, S[1], S[3], 16);                    /* water tank */
    X.hatch(-W / 5, 33.6, D / 5, 4, 4);
    _r3Box(m, 0, 2, D / 2 - 4.6, 6, 7, 1.2, DK[1], DK[2]);                    /* the entrance */
    _r3Box(m, 0, 9.2, D / 2 - 3.6, 9, 0.8, 3.4, B.trim, B.trim);               /* its canopy */
    return true;
  }
  if (key === 'hall') {
    _r3Box(m, 0, 0, 0, W - 4, 3, D - 4, C[1], C[0]);                          /* the terrace */
    _r3Box(m, 0, 3, -4, W - 14, 20, D - 22, X.P[0], X.P[1]);                   /* pale stone */
    X.facade(8, 6, (W - 14) / 2, (D - 22) / 2);
    for (i = 0; i < 6; i++) _r3Cyl(m, (i - 2.5) * ((W - 18) / 5), 3, D / 2 - 12, 1.6, 17, WH[3], WH[1], 16);   /* the portico's columns */
    _r3Box(m, 0, 20, D / 2 - 12, W - 14, 3, 8, X.P[1], X.P[0]);                /* entablature */
    _r3Gable(m, 0, 23, D / 2 - 12, W - 14, 6, 8, B.roof);                      /* pediment, the holder's colour */
    _r3Box(m, 0, 23, -4, W - 14, 1.6, D - 22, B.dark, B.roof);
    _r3Box(m, 0, 24.6, -6, 10, 18, 10, X.P[0], X.P[1]);                        /* the clock tower */
    _r3Cyl(m, 0, 32, -0.6, 3.2, 1, WH[3], WH[3], 24);                          /* the clock face */
    _r3Box(m, 0, 42.6, -6, 11.4, 1.4, 11.4, B.trim, B.trim);
    _r3Gable(m, 0, 44, -6, 10, 7, 10, B.roof);
    X.steps(0, 2.2, D / 2 - 6, 18);
    return true;
  }
  return false;
}
