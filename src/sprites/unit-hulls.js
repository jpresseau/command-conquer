/* sprites/unit-hulls.js - the second wave of ships: the Flak Cruiser, and those that follow it.
   One arm of the unit model chain (sprites/unitmodels.js has the dispatch and the shared locals
   handed over in X); returns false for a key it does not own. A file of its own because
   unit-airsea.js holds the first ships and is near the 500-line cap. */

function _sprUnitHulls(X, key) {
  var m = X.m, TM = X.TM, VH = X.VH, S = X.S, DK = X.DK, GN = X.GN;

  if (key === 'flakship') {
    /* FLAK CRUISER. A Destroyer's hull with no big gun on it: its deck is a forest of twin flak
       mounts, four of them with their barrels cocked up at the sky, round a tall bridge under
       a big search radar. The identity is the GUNS POINTING UP - every other hull's point
       ahead. */
    var L = 27, W = 8.8;
    _r3Slab(m, 0, 0.6, 0, L, 3.4, W, 1.4, VH[0], VH[1]);                /* hull */
    _r3Box(m, L * 0.40, 0.9, 0, L * 0.22, 2.8, W * 0.55, VH[1], VH[3]);  /* raked bow */
    _r3Box(m, -L * 0.02, 4.0, 0, L * 0.30, 3.6, W * 0.62, VH[2], VH[0]); /* superstructure */
    _r3Box(m, L * 0.06, 7.6, 0, L * 0.12, 2.4, W * 0.48, VH[1], VH[2]);  /* the bridge */
    _r3Box(m, L * 0.12, 8.0, 0, 0.5, 1.2, W * 0.42, RTS_PAL.glass, RTS_PAL.glass);   /* its glass */
    _r3Box(m, -L * 0.02, 7.0, 0, L * 0.16, 1.2, W * 0.40, TM[1], TM[3]); /* team cap */
    _r3Cyl(m, -L * 0.15, 7.0, 0, 1.4, 4.0, DK[1], DK[0], 16);           /* funnel */
    _r3Box(m, L * 0.02, 9.8, 0, 0.9, 5.0, 0.9, S[1], S[0]);             /* mast */
    _r3Box(m, L * 0.02, 14.6, 0, 1.6, 1.6, W * 0.72, S[2], S[3]);       /* the big search radar */
    /* the four twin mounts, fore and aft, each with its pair of barrels cocked at the sky */
    [[L * 0.24, 0], [L * 0.33, 0], [-L * 0.28, 0], [-L * 0.38, 0]].forEach(function (p, i) {
      var y = i === 1 || i === 3 ? 4.4 : 5.6;                           /* the outer pair lower */
      _r3Cyl(m, p[0], y - 1.2, p[1], 1.7, 1.4, VH[3], VH[1], 16);
      for (var b = -1; b <= 1; b += 2) _r3Box(m, p[0] + 0.6, y + 1.4, b * 0.55, 0.5, 3.2, 0.5, GN[0], GN[2]);
    });
    for (var bl = -1; bl <= 1; bl += 2) {                               /* bollards */
      _r3Box(m, L * 0.44, 4.0, bl * W * 0.22, 1.0, 1.1, 1.0, DK[0], DK[2]);
      _r3Box(m, -L * 0.46, 4.0, bl * W * 0.22, 1.0, 1.1, 1.0, DK[0], DK[2]);
    }
  } else return false;
  return true;
}
