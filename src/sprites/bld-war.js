/* sprites/bld-war.js - rocket pit, flame tower, the two shipyards, and the Tesla coil.

   One arm of the model chain that used to be a single 500-line function in
   sprites/models.js. The bodies moved verbatim; the shared locals come in through X
   so that each model line reads exactly as it did before, rather than being rewritten
   into X.m / X.W and made noisier everywhere to solve a file-length problem.
   Returns false for a key it does not own, so models.js can try the next arm. */
function _sprBldWar(X, key) {
  var m = X.m, W = X.W, D = X.D, C = X.C, S = X.S, DK = X.DK, B = X.B,
      K = X.K, SD = X.SD, P = X.P, TM = X.TM,
      AS = X.AS, RU = X.RU, WH = X.WH, CU = X.CU, OL = X.OL,
      winRow = X.winRow, pilasters = X.pilasters;
  if (key === 'rocketpit') {
    /* Rocket Turret. TUBES, angled up - a stepped bank so the silhouette is a wedge rather
       than the Gun Turret's single spike. The two must not be confusable. */
    _r3Box(m, 0, 0, 0, W - 4, 3, D - 4, C[2], C[0]);
    _r3Box(m, 0, 3, 0, 15, 6, 13, OL[0], OL[2]);                         /* painted mount */
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
    /* SAND, because the model's own note calls this a STONE column and stone is not concrete.
       It also puts the one vertical Soviet defence in a different material from the Tesla Coil
       beside it, which is the pair most often built together. */
    _r3Cyl(m, 3, 2.5, -2, 4, 20, SD[0], SD[2], 18);                      /* the column */
    _r3Cone(m, 3, 22.5, -2, 4, 6.5, 4, SD[1], 18);                       /* flared head */
    _r3Cyl(m, 3, 26.5, -2, 2, 4, RTS_PAL.hazard[0], S[3], 16);           /* pilot */
    _r3Cyl(m, 3, 9, -2, 4.6, 1.4, B.roof, B.roof, 18);                   /* team band */
    _r3Box(m, -1, 6, 1, 6, 1.5, 1.5, S[2], S[1]);                        /* feed pipe */

  } else if (key === 'navalyard' || key === 'subpen') {
    /* Shipyard. A slipway open on one side with a gantry over it - the silhouette has to say
       "this end goes in the water", because it is the only building with a placement rule and
       the shape is the only hint the player gets before they try. The Sub Pen is the same
       hull with a covered roof, which is what distinguishes them in the original too. */
    /* The shed used to be one _r3Box 34 wide and 66 deep. Under a camera this close to
       overhead that box is mostly its own TOP - a single flat polygon covering about a third
       of the sprite, in one tone, whatever the palette does. Measured: 62 distinct colours
       across 5,800 opaque pixels, which is a rectangle with a stripe. Both yards measured the
       same because they ARE the same box; nothing about the slipway, gantry, mast or crate
       survived to distinguish them.

       So the shed is a ribbed hall now - _r3Slab for a chamfered base (four planes at four
       angles, so four tones, which is what the presentation rules ask for instead of a box)
       and a row of roof ribs over it, the same saw-tooth that fixed the war factory. */
    var _cov = (key === 'subpen');
    _r3Box(m, 0, 0, 0, W - 3, 3, D - 3, C[2], C[0]);                     /* apron */
    /* RUST for the hall itself, not just the rails and gantry. The audit that recoloured
       fourteen buildings left these halls concrete, and they are the largest flat areas in
       the whole set - the one place the second material was needed most and not applied. */
    _r3Slab(m, -W / 4, 3, 0, W / 2 - 2, 9, D - 8, 2.5, RU[0], RU[1]);    /* the hall */
    var NR = 4, NRD = (D - 10) / NR;
    for (var nv = 0; nv < NR; nv++)
      _r3Gable(m, -W / 4, 12, (nv - (NR - 1) / 2) * NRD, W / 2 - 3, 4.5, NRD - 0.5,
               (nv & 1) ? RU[2] : RU[0]);
    _r3Box(m, -W / 4, 11.4, 0, W / 2 - 1, 1.2, D - 7, C[3], C[1]);       /* eaves */
    _r3Box(m, -W / 4, 16.2, 0, W / 2 - 9, 1.1, 3, B.roof, B.roof);       /* team band, on the ridge */
    /* ROOFSCAPE on the hall. The ribs give the roof a saw-tooth but every tooth is the same
       tone as the last; plant on top of them is what breaks the repeat. Kept to the landward
       half so the slipway side stays legible as the open end. */
    /* Along the roof EDGE, like the refinery's - the first placement bisected the hall roof
       and cut the team band, the exact fault on all three of the buildings that got roof
       plant in that pass. */
    X.duct(-W / 4 - 8, 15.5, D / 8, D / 4.2, true, 3.0);
    X.vent(-W / 4 + 7, 15.5, -D / 4.4, 2.2, 4.0);
    X.hatch(-W / 4 + 7, 15.5, D / 3.4, 4, 4);
    /* The slipway: a real channel, dark and open at the seaward end, with its own kerbs. A
       dark trough beside a pale hall is the strongest edge on the building and the only hint
       the player gets that this end goes in the water. */
    _r3Box(m, W / 5, 1.2, 0, W / 2.4, 1.4, D / 2.4, DK[2], DK[0]);
    _r3Box(m, W / 5, 1.6, -D / 4.2, W / 2.4, 2.4, 2.5, C[3], C[1]);      /* kerb, landward */
    /* RUSTED PLATE on everything that lives in the water. Two of the three largest flat
       sprites in the game are these yards, and a second material is what they most need. */
    for (var ns = 0; ns < 4; ns++)                                        /* slipway rails */
      _r3Box(m, W / 5, 2.4, -D / 7 + ns * (D / 11), W / 2.8, 0.7, 1.2, RU[0], RU[2]);
    if (_cov) {
      /* The Sub Pen is the same hull under cover, which is what tells them apart in the
         original too. A vault rather than a flat lid: alongZ, so the curve is in the
         silhouette and the near cap faces the camera. */
      _r3Vault(m, W / 5, 3, 0, W / 2.2, 9, D / 2.3, C[1], 16, true);
      _r3Box(m, W / 5, 12, 0, 4, 1.1, D / 2.4, B.roof, B.roof);
    } else {
      _r3Box(m, W / 5, 10, -D / 5, 1.8, 7, 1.8, RU[0], RU[2]);           /* gantry legs */
      _r3Box(m, W / 5, 10, D / 5, 1.8, 7, 1.8, RU[0], RU[2]);
      _r3Box(m, W / 5, 17, 0, W / 2.2, 1.8, 2.4, RU[1], RU[0]);          /* gantry beam */
      _r3Cyl(m, W / 5, 18.8, 0, 1.6, 3, S[2], S[0], 16);                 /* the hoist */
      _r3Box(m, W / 5, 14, 0, 1.0, 4.5, 1.0, S[3], S[3]);                /* its cable */
    }
    _r3Cyl(m, -W / 4, 17, -D / 3, 2.0, 6, B.roof, B.roof, 16);           /* team-coloured mast */
    _r3Cyl(m, -W / 2 + 7, 3, D / 3, 3.2, 7, RTS_PAL.hazard[0], S[3], 16);  /* dockside drum */
    _r3Box(m, -W / 3, 3.5, -D / 3, 4, 2.5, 4, RTS_PAL.hazard[0], S[3]);  /* crate */
    for (var nb = 0; nb < 3; nb++)                                        /* bollards along the quay */
      _r3Cyl(m, W / 2 - 5, 3, -D / 3 + nb * (D / 3.2), 1.3, 2.6, S[2], S[0], 12);

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
    /* COPPER rings and head. A Tesla Coil made of concrete from footing to crown was the
       clearest case in the audit: the three greys were doing the work of an insulator, a
       winding and a toroid, and none of those is grey. */
    for (var _ti = 0; _ti < 3; _ti++) {                                  /* insulator rings */
      _r3Cyl(m, 0, 11 + _ti * 7, 0, 4.2, 1.6, CU[2], CU[0], 16);
    }
    _r3Cyl(m, 0, 9, 0, 3.4, 1.5, B.roof, B.roof, 16);                    /* team band */
    /* the head: two toroids with the arc gap between them */
    _r3Cyl(m, 0, 33, 0, 7, 2.4, CU[0], CU[3], 20);
    _r3Cyl(m, 0, 38.5, 0, 5.2, 2, CU[0], CU[3], 20);
    _r3Cyl(m, 0, 35.4, 0, 1.3, 3.1, RTS_PAL.spark[2], RTS_PAL.spark[1], 12);  /* the arc */
    _r3Cyl(m, 0, 41, 0, 1.6, 2.2, RTS_PAL.spark[0], RTS_PAL.spark[1], 12);    /* crown */

  } else return false;
  return true;
}
