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
      winRow = X.winRow, pilasters = X.pilasters,
      vent = X.vent, duct = X.duct, skylight = X.skylight, hatch = X.hatch,
      aerial = X.aerial, parapet = X.parapet,
      winSide = X.winSide, facade = X.facade,
      roofscape = X.roofscape,
      pipe = X.pipe, ladder = X.ladder, rail = X.rail, steps = X.steps,
      drum = X.drum, crates = X.crates, floodlight = X.floodlight, plant = X.plant,
      sandbags = X.sandbags, ammo = X.ammo;
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
    /* FOURTEEN RIBS, AND THEY HAVE A DEPTH. The first cut was six slices that differed only in
       COLOUR - every one the same width and the same height - so it was not corrugation at
       all, it was six painted stripes on one smooth vault. At the top zoom each stripe is
       around sixty device pixels of flat tone with a hard edge between: a staircase down the
       roof rather than a fluted shed.

       Corrugation is a SHAPE. Alternate ribs are narrower and a little lower, so each presents
       its own angle and the shading does the work the colour was being asked to fake; the tone
       alternation stays, but it now agrees with the geometry instead of standing in for it.
       Fourteen at this depth is a rib about every two art pixels, fine enough to read as a
       surface rather than as bands.

       Raising _r3Vault's segment count would have been the wrong knob, and was measured as
       such: 18 to 72 segments moves 6,102 of the yard's 27,780 pixels at a mean delta of
       4.63/255, with the silhouette shifting two pixels at most. Invisible, and pure cost. */
    var YR = 14, YRD = (D - 8) / YR;
    for (var yv = 0; yv < YR; yv++) {
      var rib = yv & 1;
      _r3Vault(m, 0, 12, (yv - (YR - 1) / 2) * YRD,
               W - 8 - (rib ? 1.7 : 0), 22 - (rib ? 0.9 : 0), YRD - 0.25,
               rib ? C[1] : C[0], 18, true);
    }
    _r3Box(m, 0, 33, 0, 10, 1.6, D - 12, B.roof, B.roof);                /* ridge band - team */
    _r3Box(m, 0, 0, D / 2 - 4, W - 26, 12, 5, DK[2], DK[0]);             /* the opening */
    _r3Box(m, 0, 12, D / 2 - 4, W - 22, 2.5, 6, C[3], C[3]);             /* its lintel */
    pilasters(D / 2 - 3, 0, 0, 2, W - 22, 4, 12);
    _r3Box(m, 0, 0, -D / 2 + 4, W - 26, 3, 5, C[2], C[0]);               /* apron kerb */
    _r3Cyl(m, W / 2 - 11, 13, -D / 2 + 11, 4.5, 9, S[0], S[3], 18);      /* one vent */
    /* The flanks were bare planes the full depth of the biggest sprite in the game - the
       vault above them earns its 100-tone count alone. Lit windows down both sides, and a
       second vent to pair the first, kept below the springing line so the arch silhouette
       stays untouched. */
    /* THE FLANK WINDOWS ARE FOR THE 3D MODE ONLY, and that is now a measured statement, not a
       hope: under the sprite camera the vault overhangs both flanks completely - the baked
       yard did not gain a single tone from these, and a render of the sprite shows why: the
       vault IS the whole visible building from overhead. The tilted 3D camera sees the flanks;
       the sprite never will. What the SPRITE needed was detail on the vault itself, which is
       what the stacks below are. */
    winRow(32, 5, 0, 4, 12, 4, 4);
    winRow(-32, 5, 0, 4, 12, 4, 4);
    /* Vent stacks PIERCING the vault, staggered down its slopes. Surface-matching a curve is
       fiddly and unnecessary - a cylinder pushed up through the shell from inside meets it
       wherever it meets it, the depth buffer cuts the join, and what shows is a roof stack
       with a dark cap: a silhouette break and a second material on the one surface the
       camera actually sees. */
    for (var yv2 = 0; yv2 < 3; yv2++) {
      var yvx = (yv2 & 1 ? -1 : 1) * 15, yvz = -18 + yv2 * 14;
      _r3Cyl(m, yvx, 24, yvz, 2.6, 12, S[1], S[3], 14);
      _r3Cyl(m, yvx, 36, yvz, 2.9, 1.4, DK[1], DK[0], 14);
    }
    _r3Cyl(m, -W / 2 + 11, 13, -D / 2 + 11, 3.6, 7, S[0], S[3], 18);

    /* A CONSTRUCTION YARD IS A SITE. The vault is the identity and it is untouched; what was
       missing is everything a yard does - a crane, a materials stack, a lit office. */
    _r3Box(m, W / 2 - 9, 12.5, D / 2 - 12, 2.0, 26, 2.0, S[3], S[2]);      /* crane mast */
    _r3Box(m, W / 2 - 20, 37, D / 2 - 12, 24, 1.6, 1.6, S[2], S[1]);       /* jib */
    _r3Box(m, W / 2 - 30, 30, D / 2 - 12, 0.5, 7, 0.5, DK[0], DK[0]);      /* the fall */
    _r3Box(m, W / 2 - 30, 27, D / 2 - 12, 3.0, 2.6, 3.0, S[3], S[1]);      /* the hook block */
    ladder(W / 2 - 11.5, 12.5, D / 2 - 12, 24);
    crates(-W / 2 + 12, 3.5, D / 2 - 13); crates(-W / 2 + 19, 3.5, D / 2 - 12);
    drum(-W / 2 + 12, 3.5, -D / 2 + 13, 2.2, 4.6, RU);
    drum(-W / 2 + 17, 3.5, -D / 2 + 12, 2.2, 4.6, OL);
    floodlight(-W / 2 + 7, 3.5, D / 2 - 7, 15);
    floodlight(W / 2 - 7, 3.5, -D / 2 + 7, 15);
    plant(0, 12.5, -D / 2 + 14, 12, 7);
    winRow(D / 2 - 6.5, 7, -W / 2 + 22, 4, 7, 3.0, 3.4);                   /* site office */
    facade(6, 4.0, W / 2 - 5, D / 2 - 5);

  } else if (key === 'power') {
    /* Power Plant. RED BRICK with two tall brick chimneys - that is what the cameo shows on
       both faction sheets, and the chimneys are how you find it in a base. Everything else is
       kept low so the pair owns the silhouette. */
    _r3Slab(m, 0, 0, 4, W - 8, 13, D - 14, 3, K[0], K[1]);
    _r3Box(m, 0, 13, 4, W - 18, 2, D - 24, K[2], K[3]);                  /* roof */
    _r3Box(m, 0, 15, 4, W - 20, 1.2, 4, B.roof, B.roof);                 /* team band */
    winRow(D / 2 - 6, 3, 0, 3, 11, 5, 5);
    X.skylight(-6, 15, 6, 7, 5);
    X.hatch(8, 15, 7, 4, 4);
    _r3Box(m, 0, 0, D / 2 - 6, 10, 8, 4, DK[0], DK[1]);                  /* door */
    for (var pk = 0; pk < 2; pk++) {
      var pxx = -9 + pk * 18;
      _r3Cyl(m, pxx, 13, -D / 2 + 9, 5.5, 28, K[0], K[3], 18);           /* brick chimney */
      _r3Cyl(m, pxx, 30, -D / 2 + 9, 6.0, 2.5, K[2], K[2], 18);          /* string course */
      _r3Cyl(m, pxx, 38, -D / 2 + 9, 6.2, 3, DK[1], DK[3], 18);          /* cap */
    }
    _r3Box(m, W / 2 - 10, 0, 2, 8, 7, 12, S[2], S[1]);                   /* transformer */
    for (var pt = 0; pt < 3; pt++) _r3Box(m, W / 2 - 12 + pt * 3, 7, 2, 1.5, 5, 1.5, S[3], S[3]);

    /* A POWER PLANT SHOULD LOOK LIKE ONE: transformers, bus bars, cooling, cable runs. It was
       a shed with two stacks. */
    for (var pt = 0; pt < 3; pt++) {
      var px2 = (pt - 1) * 11;
      _r3Box(m, px2, 2, D / 2 - 9, 7.0, 7.5, 6.0, S[1], S[0]);             /* transformer */
      _r3Box(m, px2, 9.5, D / 2 - 9, 5.2, 1.4, 4.6, CU[1], CU[0]);         /* its lid */
      _r3Cyl(m, px2 - 2, 10.9, D / 2 - 9, 0.8, 4.0, WH[0], WH[1], 16);     /* bushings */
      _r3Cyl(m, px2 + 2, 10.9, D / 2 - 9, 0.8, 4.0, WH[0], WH[1], 16);
    }
    _r3Box(m, 0, 15.5, D / 2 - 9, W - 14, 0.6, 0.6, CU[2], CU[2]);         /* bus bar */
    pipe(-W / 2 + 10, 2, -D / 2 + 10, 14, 'y', 1.6);
    pipe(W / 2 - 10, 2, -D / 2 + 10, 14, 'y', 1.6);
    plant(0, 13, -D / 2 + 12, 14, 8);
    ladder(W / 2 - 6, 2, D / 2 - 4, 12);
    rail(0, 13, D / 2 - 5, W - 12, false);
    floodlight(-W / 2 + 5, 2, -D / 2 + 5, 12);
    facade(6, 3.6, W / 2 - 4, D / 2 - 4);
    roofscape(13.2, W / 2 - 5, D / 2 - 5);

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

    /* The advanced plant earns its cost with COOLING: two draught towers and a condenser deck.
       Same vocabulary as the basic plant so they read as a family, at a different scale. */
    for (var ct = 0; ct < 2; ct++) {
      var cx2 = (ct ? 1 : -1) * (W / 4 - 1);
      _r3Cone(m, cx2, 2, -D / 2 + 13, 7.5, 5.2, 15, C[1], 20);            /* tower waist */
      _r3Cone(m, cx2, 17, -D / 2 + 13, 5.2, 6.4, 4, C[3], 20);            /* its lip */
      _r3Cyl(m, cx2, 21, -D / 2 + 13, 6.4, 0.8, DK[0], DK[1], 20);        /* the dark mouth */
    }
    plant(0, 13, D / 2 - 12, 16, 9);
    pipe(-W / 2 + 9, 2, 0, 13, 'y', 1.8);
    pipe(W / 2 - 9, 2, 0, 13, 'y', 1.8);
    drum(-W / 2 + 8, 2, D / 2 - 8, 2.4, 5.0, OL);
    drum(-W / 2 + 13, 2, D / 2 - 7, 2.4, 5.0, OL);
    rail(0, 13, D / 2 - 4, W - 14, false);
    ladder(W / 2 - 5, 2, D / 2 - 3, 13);
    floodlight(W / 2 - 6, 2, -D / 2 + 6, 14);
    facade(6, 3.8, W / 2 - 4, D / 2 - 4);
    roofscape(13.2, W / 2 - 5, D / 2 - 5);

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

    /* A REFINERY PROCESSES SOMETHING, and none of that was on it: no silo, no conveyor, no
       ducting between the two. The dock end is where a harvester pulls in, so the plant is
       massed at the other end where it does not fight the vehicle for room. */
    _r3Cyl(m, -W / 2 + 13, 2, -D / 2 + 13, 6.5, 17, P[1], P[0], 20);      /* holding silo */
    _r3Cone(m, -W / 2 + 13, 19, -D / 2 + 13, 6.5, 2.0, 4.5, P[2], 20);    /* its cap */
    _r3Cyl(m, -W / 2 + 13, 23.5, -D / 2 + 13, 1.2, 3.0, S[3], S[2], 16);  /* vent stack */
    _r3Box(m, -W / 2 + 22, 14, -D / 2 + 13, 16, 2.2, 4.0, S[1], S[0]);    /* conveyor gantry */
    for (var cv = 0; cv < 5; cv++)                                        /* its trestles */
      _r3Box(m, -W / 2 + 16 + cv * 4, 2, -D / 2 + 13, 0.8, 12, 0.8, S[3], S[3]);
    pipe(W / 2 - 11, 2, -D / 2 + 11, 15, 'y', 1.7);
    plant(4, 13, -D / 2 + 10, 12, 7);
    drum(W / 2 - 8, 2, D / 2 - 9, 2.3, 4.8, RU);
    drum(W / 2 - 13, 2, D / 2 - 8, 2.3, 4.8, RU);
    ladder(-W / 2 + 20, 2, -D / 2 + 8, 13);
    rail(0, 13, D / 2 - 6, W - 18, false);
    floodlight(W / 2 - 6, 2, -D / 2 + 6, 13);
    facade(6, 3.6, W / 2 - 4, D / 2 - 4);
    roofscape(13.2, W / 2 - 6, D / 2 - 6);

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
    /* A BARRACKS IS A CAMP, not three sheds on a slab. Each hut gets its stovepipe and a
       lit window; the yard in front gets the kit a camp actually has. Twelve calls became
       forty and the silhouette above the roofline is now chimneys rather than one flag. */
    for (var bs = 0; bs < 3; bs++) {
      var bx = -W / 2 + 9 + bs * ((W - 18) / 2);
      _r3Cyl(m, bx + 4, 13, -D / 2 + 9, 0.9, 6, S[2], DK[0], 16);        /* stovepipe */
      _r3Cyl(m, bx + 4, 19, -D / 2 + 9, 1.5, 1.2, DK[1], DK[0], 16);     /* its cowl */
      _r3Box(m, bx - 4.5, 7, D / 2 - 4.2, 2.6, 3.0, 0.6, RTS_PAL.glass, RTS_PAL.glass);
      _r3Box(m, bx + 4.5, 7, D / 2 - 4.2, 2.6, 3.0, 0.6, RTS_PAL.glass, RTS_PAL.glass);
      _r3Box(m, bx, 1.6, D / 2 - 8, 9, 0.5, 3.4, RTS_PAL.dirt[0], RTS_PAL.dirt[1]);  /* duckboard */
    }
    steps(0, 2, D / 2 - 2.5, 7);
    crates(W / 2 - 8, 2, D / 2 - 9);
    drum(W / 2 - 6, 2, -D / 2 + 8, 2.0, 4.2, RU);
    drum(W / 2 - 11, 2, -D / 2 + 7, 2.0, 4.2, OL);
    floodlight(-W / 2 + 5, 2, -D / 2 + 5, 12);
    rail(0, 2, D / 2 - 11, W - 16, false);
    facade(6.5, 3.2, W / 2 - 3, D / 2 - 4);

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
    winRow(-D / 2 + 6, 5, 0, 4, 13, 5, 4);                               /* back wall, lit */
    X.vent(-W / 2 + 8, 12, -D / 2 + 9, 2.2, 3.6);
    X.hatch(W / 2 - 10, 12, -D / 2 + 9, 5, 4);
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
    /* A WAR FACTORY IS A WORKS. The saw-tooth roof is the identity; what it needed is the
       yard around it - the gantry vehicles roll out under, the stock, the services. */
    _r3Box(m, 0, 2, D / 2 - 5, W - 10, 1.0, 5.0, AS[1], AS[0]);           /* the apron */
    for (var fg = 0; fg < 2; fg++) {                                      /* door gantry */
      _r3Box(m, (fg ? 1 : -1) * (W / 2 - 9), 2, D / 2 - 7, 2.4, 15, 2.4, S[2], S[1]);
    }
    _r3Box(m, 0, 17, D / 2 - 7, W - 14, 2.0, 2.4, S[1], S[0]);
    _r3Box(m, 0, 15.4, D / 2 - 7, W - 16, 1.6, 1.0, TM[0], TM[0]);        /* team lintel */
    plant(-W / 4, 17.5, D / 2 - 14, 11, 7);
    plant(W / 4, 17.5, D / 2 - 14, 11, 7);
    pipe(-W / 2 + 8, 2, -D / 2 + 9, 15, 'y', 1.7);
    crates(W / 2 - 9, 2, -D / 2 + 10); crates(W / 2 - 15, 2, -D / 2 + 9);
    drum(-W / 2 + 9, 2, D / 2 - 12, 2.2, 4.6, OL);
    ladder(-W / 2 + 5, 2, 0, 15);
    rail(0, 17.5, -D / 2 + 6, W - 14, false);
    floodlight(W / 2 - 5, 2, D / 2 - 4, 14);
    facade(6, 4.0, W / 2 - 3, D / 2 - 3);

  } else return false;
  return true;
}
