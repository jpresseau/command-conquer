/* sprites/bld-base.js - the core of a base: construction yard, both power plants, refinery, barracks and war
   factory. These are the six a player sees in the first two minutes, so they carry the most
   silhouette work.

   One arm of the model chain that used to be a single 500-line function in
   sprites/models.js. The bodies moved verbatim; the shared locals come in through X
   so that each model line reads exactly as it did before, rather than being rewritten
   into X.m / X.W and made noisier everywhere to solve a file-length problem.
   Returns false for a key it does not own, so models.js can try the next arm. */
function _sprBldBase(X, key) {
  var m = X.m, W = X.W, D = X.D, C = X.C, S = X.S, DK = X.DK, B = X.B,
      K = X.K, SD = X.SD, P = X.P, TM = X.TM,
      AS = X.AS, RU = X.RU, WH = X.WH, CU = X.CU, OL = X.OL,
      winRow = X.winRow, pilasters = X.pilasters;
      if (key === 'yard') {
    /* Construction Yard. The cameo is a VAULTED HANGAR - a barrel roof over a rectangular hall
       with one big opening in the end - and the arch is the identity. Nothing else in a base
       has a curved roofline, so it reads from across the map without a crane arm to help. */
    /* A dark plinth and buttresses under the arch. This is the biggest sprite in the game -
       6,882 opaque pixels - and it was concrete from the ground to the ridge, so all of that
       area shaded as one material however good the corrugation above it is. */
    _r3Box(m, 0, 0, 0, W - 6, 3.5, D - 6, DK[0], DK[1]);                 /* plinth */
    _r3Box(m, 0, 3.5, 0, W - 10, 9, D - 10, C[0], C[2]);                 /* the hall */
    for (var yb = 0; yb < 4; yb++)                                       /* buttresses */
      _r3Box(m, (yb & 1 ? 1 : -1) * (W / 2 - 6), 3.5, (yb & 2 ? 1 : -1) * (D / 2 - 10),
             3, 9, 5, C[3], C[1]);
    /* The vault has to be TALLER THAN IT IS DEEP or it does not read as an arch: spread 66
       wide and 15 high, every one of its facets faces almost straight up, the light hits
       them all the same and the whole roof shades as one flat plate. Narrower than the hall
       and half as tall again gives the flanks a real angle to catch. */
    /* CORRUGATED, in slices along the depth. One vault call is one smooth surface, and a
       smooth surface under this light is a single wide shading gradient: the Construction Yard
       measured 8.8 distinct tones per thousand pixels, the worst in the game, on the building
       every base opens with and the largest thing on screen. Sliced and alternated it reads as
       a corrugated hangar - which is what an arched shed of this size actually is - and the
       arch itself is untouched, so the silhouette that identifies it survives. */
    var YR = 6, YRD = (D - 8) / YR;
    for (var yv = 0; yv < YR; yv++)
      _r3Vault(m, 0, 12, (yv - (YR - 1) / 2) * YRD, W - 8, 22, YRD - 0.4,
               (yv & 1) ? C[1] : C[0], 18, true);
    _r3Box(m, 0, 33, 0, 10, 1.6, D - 12, B.roof, B.roof);                /* ridge band - team */
    _r3Box(m, 0, 0, D / 2 - 4, W - 26, 12, 5, DK[2], DK[0]);             /* the opening */
    _r3Box(m, 0, 12, D / 2 - 4, W - 22, 2.5, 6, C[3], C[3]);             /* its lintel */
    pilasters(D / 2 - 3, 0, 0, 2, W - 22, 4, 12);
    _r3Box(m, 0, 0, -D / 2 + 4, W - 26, 3, 5, C[2], C[0]);               /* apron kerb */
    _r3Cyl(m, W / 2 - 11, 13, -D / 2 + 11, 4.5, 9, S[0], S[3], 18);      /* one vent */

  } else if (key === 'power') {
    /* Power Plant. RED BRICK with two tall brick chimneys - that is what the cameo shows on
       both faction sheets, and the chimneys are how you find it in a base. Everything else is
       kept low so the pair owns the silhouette. */
    _r3Slab(m, 0, 0, 4, W - 8, 13, D - 14, 3, K[0], K[1]);
    _r3Box(m, 0, 13, 4, W - 18, 2, D - 24, K[2], K[3]);                  /* roof */
    _r3Box(m, 0, 15, 4, W - 20, 1.2, 4, B.roof, B.roof);                 /* team band */
    winRow(D / 2 - 6, 3, 0, 3, 11, 5, 5);
    _r3Box(m, 0, 0, D / 2 - 6, 10, 8, 4, DK[0], DK[1]);                  /* door */
    for (var pk = 0; pk < 2; pk++) {
      var pxx = -9 + pk * 18;
      _r3Cyl(m, pxx, 13, -D / 2 + 9, 5.5, 28, K[0], K[3], 18);           /* brick chimney */
      _r3Cyl(m, pxx, 30, -D / 2 + 9, 6.0, 2.5, K[2], K[2], 18);          /* string course */
      _r3Cyl(m, pxx, 38, -D / 2 + 9, 6.2, 3, DK[1], DK[3], 18);          /* cap */
    }
    _r3Box(m, W / 2 - 10, 0, 2, 8, 7, 12, S[2], S[1]);                   /* transformer */
    for (var pt = 0; pt < 3; pt++) _r3Box(m, W / 2 - 12 + pt * 3, 7, 2, 1.5, 5, 1.5, S[3], S[3]);

  } else if (key === 'apower') {
    /* Advanced Power Plant. Same brick vocabulary so the pair read as a family, but FOUR
       chimneys on a longer hall. The cooling tower that used to be here is not in the
       reference at all and it was competing with the chimneys for the silhouette. */
    _r3Slab(m, 0, 0, 4, W - 10, 16, D - 14, 3, K[0], K[1]);
    _r3Box(m, 0, 16, 4, W - 22, 2, D - 24, K[2], K[3]);
    _r3Box(m, 0, 18, 4, W - 24, 1.2, 4, B.roof, B.roof);                 /* team band */
    winRow(D / 2 - 6, 4, 0, 5, 13, 5, 6);
    _r3Box(m, -14, 0, D / 2 - 6, 11, 9, 4, DK[0], DK[1]);
    _r3Box(m, 14, 0, D / 2 - 6, 11, 9, 4, DK[0], DK[1]);
    for (var ak = 0; ak < 4; ak++) {
      var axx = -25 + ak * 16.5;
      _r3Cyl(m, axx, 16, -D / 2 + 9, 5.0, 24 + (ak % 2) * 6, K[0], K[3], 18);
      _r3Cyl(m, axx, 36 + (ak % 2) * 6, -D / 2 + 9, 5.6, 3, DK[1], DK[3], 18);
    }
    _r3Box(m, 0, 0, -D / 2 + 4, W - 30, 3, 4, C[2], C[0]);

  } else if (key === 'refinery') {
    /* Ore Refinery. The cameo is a dark industrial block with a RUST-coloured upper stage and
       two pale silos, over a wide dock. Two features rather than one, because the dock is what
       tells you which way the building faces and a refinery you cannot dock at is worse than
       an ugly one. */
    _r3Slab(m, -12, 0, -3, W - 32, 13, D - 22, 3, C[2], C[0]);           /* lower plant */
    _r3Box(m, -12, 13, -3, W - 40, 9, D - 30, K[0], K[1]);               /* rust upper stage */
    _r3Box(m, -12, 22, -3, W - 44, 2, D - 34, K[2], K[3]);
    _r3Box(m, -12, 24, -3, W - 46, 1.2, 4, B.roof, B.roof);              /* team band */
    winRow(7, 4, -12, 3, 11, 5, 5);
    for (var rs = 0; rs < 2; rs++) {                                     /* the two pale silos */
      _r3Cyl(m, W / 2 - 22 + rs * 15, 0, -8, 7, 26, C[3], C[1], 20);
      _r3Cyl(m, W / 2 - 22 + rs * 15, 26, -8, 7.4, 2.5, DK[1], DK[3], 20);
    }
    _r3Box(m, W / 2 - 27, 12, 8, 20, 2.5, 5, S[2], S[1]);                /* conveyor */
    _r3Box(m, W / 2 - 27, 8, 8, 3, 5, 3, S[0], S[1]);
    _r3Box(m, -10, 0, D / 2 - 9, W - 30, 2.5, 16, C[2], C[0]);           /* the dock */
    _r3Box(m, -10, 2.5, D / 2 - 16, W - 30, 1.2, 3, RTS_PAL.hazard[0], RTS_PAL.hazard[0]);
    _r3Box(m, -W / 2 + 7, 0, D / 2 - 9, 4, 8, 15, DK[1], DK[3]);
    /* Roofscape. The ore hall is the tallest flat plate in the base and it carried nothing;
       extraction plant on top of a refinery is also just true. */
    /* Roof plant sits along the EDGE of the rust deck, not across its middle - the first
       placement ran the duct down the centre, which bisected the roof and cut straight
       through the team band, unmaking both of the reads the roof exists for. */
    X.duct(-26, 24, -6, 16, true, 3.2);
    X.vent(-26, 24, 8, 2.4, 4.4);
    X.vent(2, 24, -18, 2.0, 3.4);
    X.hatch(-5, 24, 15, 5, 4);

  } else if (key === 'barracks') {
    /* Barracks. NISSEN HUTS - three sand-coloured barrel-roofed sheds in a row, which is what
       the cameo shows and is nothing like the pitched hall that used to be here. Three curved
       roofs side by side is a silhouette no other structure comes near. */
    _r3Box(m, 0, 0, 0, W - 4, 2, D - 4, RTS_PAL.dirt[2], RTS_PAL.dirt[1]);
    for (var bh = 0; bh < 3; bh++) {
      _r3Vault(m, -W / 2 + 9 + bh * ((W - 18) / 2), 2, 0, 13, 12, D - 8,
               SD[bh === 1 ? 1 : 0], 14, true);
      _r3Box(m, -W / 2 + 9 + bh * ((W - 18) / 2), 2, D / 2 - 5, 12, 8, 3, SD[2], SD[2]);
    }
    _r3Box(m, 0, 13, 0, W - 8, 1.4, 5, B.roof, B.roof);                  /* one team band */
    _r3Box(m, 0, 2, D / 2 - 4, 6, 7, 3, DK[2], DK[0]);                   /* door */
    _r3Box(m, -W / 2 + 8, 15, -D / 2 + 7, 1.6, 15, 1.6, S[3], S[3]);     /* the flag */
    _r3Box(m, -W / 2 + 12, 25, -D / 2 + 7, 7, 5, 1, TM[0], TM[0]);
    _r3Box(m, -W / 2 + 9, 2, D / 2 - 6, 12, 4, 5, RTS_PAL.bag[0], RTS_PAL.bag[1]);

  } else if (key === 'factory') {
    /* War Factory. The cameo's dominant feature is a big dark roof over an open bay, and
       under it the front is almost entirely a roll-up door - which is what says "vehicles
       come out of this one".

       THE ROOF IS A ROW OF SMALL RIDGES, not one gable. It was one gable, and that is the
       form both CLAUDE.md and _r3Gable's own comment say does not work under this camera:
       the near slope covers about five times the pixels of the far one, so it lands in a
       single shading band and reads as one flat plane. On a 3x3 building that plane WAS the
       top half of the sprite - 72 art pixels wide, thirty-odd tall, one tone, with nothing
       in it but a stray cylinder off to one side.

       Five narrow ridges instead. Each is still a gable, but at this width its two slopes
       are a few pixels each, so what the eye gets is an alternating rhythm rather than one
       field - and a ribbed shed is what a factory roof looks like anyway. The saw-tooth runs
       across the width, so the ribs are perpendicular to the door and the building reads as
       a shed you drive INTO. */
    /* The walls are a MATERIAL now, not more of the roof. Ribbing the roof last time barely
       moved the tone count because the whole building - walls, roof, door surround - came out
       of the `dark` ramp, so every rib landed in the same two shades however many there were.
       A brick base course under pale walls, with the dark kept for the roof and the bay, is
       both what a factory shed looks like and three ramps instead of one. */
    _r3Box(m, 0, 0, 0, W - 6, 3, D - 6, K[2], K[0]);                     /* brick base course */
    _r3Slab(m, 0, 3, 0, W - 8, 9, D - 8, 2.5, P[0], P[1]);               /* pale walls */
    for (var fp = 0; fp < 4; fp++)                                       /* wall piers */
      _r3Box(m, -W / 2 + 9 + fp * ((W - 18) / 3), 3, -D / 2 + 5, 3, 9, 2, P[3], P[2]);
    /* The ribs repeat along the DEPTH, each one spanning the full width. _r3Gable's ridge
       runs along x with its slopes facing +z and -z, so repeating it across the width just
       gives five copies of the same big front slope side by side - vertical stripes, which
       is what the first attempt at this produced. Stepped along z instead, each rib presents
       a short near slope and a short far slope, and screen height is `z - K*y`, so adjacent
       slopes separate in BOTH shading and height. That is a saw-tooth roof seen from above,
       which is what a factory has. */
    var RIB = 5, RIBD = (D - 6) / RIB;
    for (var fr = 0; fr < RIB; fr++) {
      /* Alternate the base tone as well as the geometry: two adjacent slopes at this scale
         can still land in the same shading band, and then the ribs vanish once the sprite is
         batched and tone-mapped - which is the failure this whole section exists to fix. */
      _r3Gable(m, 0, 12, (fr - (RIB - 1) / 2) * RIBD, W - 5, 5.5, RIBD - 0.5,
               (fr & 1) ? DK[1] : DK[2]);
    }
    /* An eaves band the ribs sit on, so the roof reads as one shed rather than five huts. */
    _r3Box(m, 0, 11.2, 0, W - 4, 1.4, D - 4, DK[3], DK[0]);
    /* The team band sat at y=21 with the ridge line at 23, so it was buried inside the roof
       and only its two edges showed - which is why it read as a pair of floating lines. It
       runs along the ridge line now, on top, where a band on a roof goes. */
    _r3Box(m, 0, 17.2, 0, W - 16, 1.2, 3.0, B.roof, B.roof);
    _r3Box(m, 0, 0, D / 2 - 3, W - 26, 11, 4, DK[2], DK[0]);             /* the door */
    for (var fd = 0; fd < 5; fd++)
      _r3Box(m, 0, 1.5 + fd * 2.1, D / 2 - 1.6, W - 28, 1.0, 1.5, DK[1], DK[3]);
    _r3Box(m, 0, 11, D / 2 - 3, W - 20, 2.5, 5, C[3], C[3]);             /* header */
    /* Hazard chevrons on the apron in front of the bay - the one warm accent on an otherwise
       cold building, and what says "vehicles come out here" from across the map. */
    for (var fh = 0; fh < 4; fh++)
      _r3Box(m, -W / 2 + 14 + fh * 8, 3.2, D / 2 - 7, 4, 0.8, 2.5,
             RTS_PAL.hazard[0], RTS_PAL.hazard[1]);
    pilasters(D / 2 - 3, 0, 0, 2, W - 20, 4, 11);
    /* Two extractors, not one. A single stack was visibly off-centre once the ribs gave the
       roof a centre line to be off it. */
    _r3Cyl(m, -W / 2 + 13, 17, -D / 2 + 10, 4.0, 8, S[0], S[3], 18);
    _r3Cyl(m, W / 2 - 13, 17, -D / 2 + 10, 4.0, 8, S[0], S[3], 18);

  } else return false;
  return true;
}
