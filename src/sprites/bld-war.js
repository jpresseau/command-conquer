/* sprites/bld-war.js - rocket pit, flame tower, the two shipyards, and the Tesla coil.

   One arm of the model chain that used to be a single 500-line function in
   sprites/models.js. The bodies moved verbatim; the shared locals come in through X
   so that each model line reads exactly as it did before, rather than being rewritten
   into X.m / X.W and made noisier everywhere to solve a file-length problem.
   Returns false for a key it does not own, so models.js can try the next arm. */
function _sprBldWar(X, key) {
  var m = X.m, W = X.W, D = X.D, C = X.C, S = X.S, DK = X.DK, B = X.B,
      K = X.K, SD = X.SD, P = X.P, TM = X.TM,
      winRow = X.winRow, pilasters = X.pilasters;
  if (key === 'rocketpit') {
    /* Rocket Turret. TUBES, angled up - a stepped bank so the silhouette is a wedge rather
       than the Gun Turret's single spike. The two must not be confusable. */
    _r3Box(m, 0, 0, 0, W - 4, 3, D - 4, C[2], C[0]);
    _r3Box(m, 0, 3, 0, 15, 6, 13, C[0], C[2]);
    for (var rt = 0; rt < 3; rt++) {
      _r3Cyl(m, -4 + rt * 4, 9 + rt * 2.5, -1, 1.8, 11 - rt, S[0], S[3], 16);
      _r3Cyl(m, -4 + rt * 4, 20 - rt + (rt * 2.5), -1, 2.1, 1.5, DK[1], DK[3], 16);
    }
    _r3Box(m, 0, 9, 5, 13, 1.5, 3, B.roof, B.roof);
    _r3Box(m, 6, 3, 6, 4, 6, 4, S[2], S[1]);                             /* guidance box */

  } else if (key === 'flametower') {
    /* Flame Tower. A stone column with a flared head on a fuel drum. Tall and narrow is the
       identity - it is the only defence with a vertical silhouette. */
    _r3Box(m, 0, 0, 0, W - 5, 2.5, D - 5, C[2], C[0]);
    _r3Cyl(m, -5, 2.5, 4, 5, 7, RTS_PAL.hazard[0], S[3], 18);            /* fuel drum */
    _r3Cyl(m, 3, 2.5, -2, 4, 20, C[0], C[2], 18);                        /* the column */
    _r3Cone(m, 3, 22.5, -2, 4, 6.5, 4, C[1], 18);                        /* flared head */
    _r3Cyl(m, 3, 26.5, -2, 2, 4, RTS_PAL.hazard[0], S[3], 16);           /* pilot */
    _r3Cyl(m, 3, 9, -2, 4.6, 1.4, B.roof, B.roof, 18);                   /* team band */
    _r3Box(m, -1, 6, 1, 6, 1.5, 1.5, S[2], S[1]);                        /* feed pipe */

  } else if (key === 'navalyard' || key === 'subpen') {
    /* Shipyard. A slipway open on one side with a gantry over it - the silhouette has to say
       "this end goes in the water", because it is the only building with a placement rule and
       the shape is the only hint the player gets before they try. The Sub Pen is the same
       hull with a covered roof, which is what distinguishes them in the original too. */
    var _cov = (key === 'subpen');
    _r3Box(m, 0, 0, 0, W - 3, 3, D - 3, C[2], C[0]);                     /* apron */
    _r3Box(m, -W / 4, 3, 0, W / 2 - 2, 9, D - 6, C[0], C[1]);            /* the shed */
    _r3Box(m, -W / 4, 12, 0, W / 2, 2, D - 5, C[3], C[3]);               /* its roof */
    /* the slipway: a channel cut through the apron, open at the seaward end */
    _r3Box(m, W / 5, 1.5, 0, W / 2.4, 1.5, D / 2.6, S[2], S[3]);
    if (_cov) _r3Box(m, W / 5, 8, 0, W / 2.2, 2, D / 2.4, C[1], C[0]);   /* pen roof */
    else {
      _r3Box(m, W / 5, 10, -D / 5, 1.6, 7, 1.6, S[1], S[2]);             /* gantry legs */
      _r3Box(m, W / 5, 10, D / 5, 1.6, 7, 1.6, S[1], S[2]);
      _r3Box(m, W / 5, 17, 0, W / 2.2, 1.6, 2.2, S[0], S[1]);            /* gantry beam */
    }
    _r3Cyl(m, -W / 4, 14, -D / 4, 2.2, 5, B.roof, B.roof, 16);           /* team-coloured mast */
    _r3Box(m, -W / 3, 3.5, -D / 3, 3, 2, 3, RTS_PAL.hazard[0], S[3]);    /* dockside crate */

  } else if (key === 'tesla') {
    /* TESLA COIL. Two cells tall and almost nothing wide - the tallest, thinnest thing either
       army builds, which is the whole point: you should be able to pick a Soviet defensive
       line out of a skyline at a glance, the way the Flame Tower reads as a column and the
       Pillbox reads as dug in.

       A narrow mast on a heavy base, three insulator rings up the shaft, and the coil head as
       a pair of stacked toroids with an arc gap between them. The head is emissive because it
       is the part that says POWERED - and this building is dark and useless the moment the
       power browns out, so the lit head is telling you something true. */
    _r3Box(m, 0, 0, 0, W - 6, 4, D - 6, C[2], C[0]);                     /* concrete footing */
    _r3Box(m, 0, 4, 0, 9, 3, 9, C[0], C[1]);                             /* transformer block */
    _r3Cyl(m, 0, 7, 0, 2.6, 26, C[1], C[0], 16);                         /* the mast */
    for (var _ti = 0; _ti < 3; _ti++) {                                  /* insulator rings */
      _r3Cyl(m, 0, 11 + _ti * 7, 0, 4.2, 1.6, C[3], C[2], 16);
    }
    _r3Cyl(m, 0, 9, 0, 3.4, 1.5, B.roof, B.roof, 16);                    /* team band */
    /* the head: two toroids with the arc gap between them */
    _r3Cyl(m, 0, 33, 0, 7, 2.4, S[1], S[2], 20);
    _r3Cyl(m, 0, 38.5, 0, 5.2, 2, S[1], S[2], 20);
    _r3Cyl(m, 0, 35.4, 0, 1.3, 3.1, RTS_PAL.spark[2], RTS_PAL.spark[1], 12);  /* the arc */
    _r3Cyl(m, 0, 41, 0, 1.6, 2.2, RTS_PAL.spark[0], RTS_PAL.spark[1], 12);    /* crown */

  } else return false;
  return true;
}
