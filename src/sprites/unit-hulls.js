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
  } else if (key === 'mineboat') {
    /* MINE BOAT. A small low working hull with a flat open stern: two rows of round black mines
       on rails along it, a little crane at the transom to put them over the side, and a squat
       wheelhouse well forward. The identity is the ROWS OF MINES on the open deck. */
    var Lm = 19, Wm = 6.6;
    _r3Slab(m, 0, 0.6, 0, Lm, 3.0, Wm, 1.2, VH[0], VH[1]);              /* hull */
    _r3Box(m, Lm * 0.40, 0.9, 0, Lm * 0.20, 2.4, Wm * 0.55, VH[1], VH[3]); /* bow */
    _r3Box(m, Lm * 0.20, 3.8, 0, Lm * 0.22, 3.0, Wm * 0.70, VH[2], VH[0]); /* wheelhouse */
    _r3Box(m, Lm * 0.30, 4.4, 0, 0.5, 1.2, Wm * 0.56, RTS_PAL.glass, RTS_PAL.glass);   /* its windows */
    _r3Box(m, Lm * 0.20, 5.5, 0, Lm * 0.16, 0.5, Wm * 0.50, TM[1], TM[3]);  /* team roof */
    _r3Box(m, Lm * 0.14, 6.6, 0, 0.5, 2.6, 0.5, S[1], S[0]);             /* mast */
    for (var rw = -1; rw <= 1; rw += 2) {                                 /* the mine rails and their mines */
      _r3Box(m, -Lm * 0.18, 2.5, rw * 1.6, Lm * 0.52, 0.3, 0.4, S[2], S[1]);
      for (var mn = 0; mn < 4; mn++) {                                  /* each a squat drum with its horn */
        _r3Cyl(m, -Lm * 0.02 - mn * 2.2, 2.8, rw * 1.6, 0.9, 1.2, DK[0], DK[1], 16);
        _r3Cyl(m, -Lm * 0.02 - mn * 2.2, 4.0, rw * 1.6, 0.25, 0.5, RTS_PAL.hazard[0], RTS_PAL.hazard[1], 16);
      }
    }
    _r3Box(m, -Lm * 0.44, 4.2, 0, 0.6, 3.6, 0.6, RTS_PAL.hazard[0], RTS_PAL.hazard[1]);   /* the stern crane */
    _r3Box(m, -Lm * 0.50, 5.8, 0, 2.2, 0.5, 0.5, RTS_PAL.hazard[0], RTS_PAL.hazard[1]);
  } else if (key === 'tender') {
    /* REPAIR TENDER. A broad working hull with a gantry crane straddling an open well deck, a
       hook hanging from it, crates of spares and a welding rig on the deck, and the deckhouse
       aft. The identity is the GANTRY - a frame across the whole beam, which no warship has. */
    var Lt = 24, Wt = 8.4;
    _r3Slab(m, 0, 0.6, 0, Lt, 3.2, Wt, 1.4, VH[0], VH[1]);              /* hull */
    _r3Box(m, Lt * 0.40, 0.9, 0, Lt * 0.20, 2.6, Wt * 0.55, VH[1], VH[3]); /* bow */
    _r3Box(m, -Lt * 0.30, 4.2, 0, Lt * 0.24, 3.6, Wt * 0.72, VH[2], VH[0]); /* deckhouse aft */
    _r3Box(m, -Lt * 0.20, 5.0, 0, 0.5, 1.4, Wt * 0.58, RTS_PAL.glass, RTS_PAL.glass);   /* its bridge glass */
    _r3Box(m, -Lt * 0.30, 6.3, 0, Lt * 0.18, 0.6, Wt * 0.56, TM[1], TM[3]);   /* team roof */
    _r3Cyl(m, -Lt * 0.38, 7.4, 0, 1.0, 2.6, DK[1], DK[0], 16);          /* stack */
    /* the gantry: two legs either side of the well deck and the beam across them */
    for (var gl = -1; gl <= 1; gl += 2) _r3Box(m, Lt * 0.06, 6.0, gl * Wt * 0.44, 0.8, 7.6, 0.8, RTS_PAL.hazard[0], RTS_PAL.hazard[1]);
    _r3Box(m, Lt * 0.06, 10.0, 0, 1.2, 1.0, Wt * 0.98, RTS_PAL.hazard[0], RTS_PAL.hazard[1]);
    _r3Box(m, Lt * 0.06, 7.6, 0, 0.2, 4.0, 0.2, DK[2], DK[3]);           /* cable */
    _r3Box(m, Lt * 0.06, 5.4, 0, 1.0, 0.8, 1.0, DK[1], DK[2]);           /* hook block */
    _r3Box(m, Lt * 0.06, 2.4, 0, Lt * 0.20, 0.3, Wt * 0.60, DK[0], DK[1]);  /* the open well deck */
    [[Lt * 0.26, -1.6], [Lt * 0.26, 1.6], [Lt * 0.32, 0]].forEach(function (c) {   /* crates of spares */
      _r3Box(m, c[0], 3.4, c[1], 1.8, 1.6, 1.6, S[2], S[1]);
    });
    _r3Cyl(m, -Lt * 0.10, 3.6, Wt * 0.30, 0.6, 1.8, GN[1], GN[2], 16);   /* gas bottles for the rig */
    _r3Cyl(m, -Lt * 0.10, 3.6, Wt * 0.18, 0.6, 1.8, GN[1], GN[2], 16);
  } else if (key === 'monitor') {
    /* RIVER MONITOR. A low flat barge riding almost awash, with ONE big armoured turret and its
       twin heavy barrels forward, a small conning tower behind it and nothing else. The identity
       is the low hull under the oversized turret - a gun that floats rather than a ship. */
    var Lo = 22, Wo = 8.0;
    _r3Slab(m, 0, 0.4, 0, Lo, 2.0, Wo, 1.6, VH[0], VH[1]);              /* the low hull, square-ended */
    _r3Box(m, Lo * 0.44, 0.6, 0, Lo * 0.12, 1.6, Wo * 0.70, VH[1], VH[3]); /* blunt bow */
    _r3Cyl(m, Lo * 0.12, 3.0, 0, 3.4, 2.6, VH[3], VH[1], 20);           /* the turret */
    _r3Cyl(m, Lo * 0.12, 5.4, 0, 2.6, 0.5, TM[1], TM[3], 20);           /* team ring on its roof */
    for (var bb = -1; bb <= 1; bb += 2) _r3Box(m, Lo * 0.12 + 5.2, 3.6, bb * 0.9, 7.0, 0.9, 0.9, GN[0], GN[2]);   /* twin heavy barrels */
    _r3Box(m, -Lo * 0.18, 3.4, 0, 3.4, 3.2, 3.2, VH[2], VH[0]);          /* conning tower */
    _r3Box(m, -Lo * 0.18 + 1.75, 4.4, 0, 0.3, 0.8, 2.6, RTS_PAL.glass, RTS_PAL.glass);   /* its vision slit */
    _r3Cyl(m, -Lo * 0.32, 3.0, 0, 0.9, 2.0, DK[1], DK[0], 16);          /* low stack */
    for (var rl = -1; rl <= 1; rl += 2) _r3Box(m, -Lo * 0.05, 1.6, rl * Wo * 0.47, Lo * 0.80, 0.4, 0.3, DK[0], DK[0]);   /* rubbing strakes */
  } else return false;
  return true;
}
