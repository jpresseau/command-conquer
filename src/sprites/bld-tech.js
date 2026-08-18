/* sprites/bld-tech.js - tech, support and air: radar dome, tech centre, service depot, helipad, airfield, AA gun,
   silo and kennel.

   One arm of the model chain that used to be a single 500-line function in
   sprites/models.js. The bodies moved verbatim; the shared locals come in through X
   so that each model line reads exactly as it did before, rather than being rewritten
   into X.m / X.W and made noisier everywhere to solve a file-length problem.
   Returns false for a key it does not own, so models.js can try the next arm. */
function _sprBldTech(X, key) {
  var m = X.m, W = X.W, D = X.D, C = X.C, S = X.S, DK = X.DK, B = X.B,
      K = X.K, SD = X.SD, P = X.P, TM = X.TM,
      AS = X.AS, RU = X.RU, WH = X.WH, CU = X.CU, OL = X.OL,
      winRow = X.winRow, pilasters = X.pilasters, winSide = X.winSide, facade = X.facade,
      vent = X.vent, duct = X.duct, skylight = X.skylight, hatch = X.hatch,
      aerial = X.aerial, parapet = X.parapet,
      roofscape = X.roofscape,
      pipe = X.pipe, ladder = X.ladder, rail = X.rail, steps = X.steps,
      drum = X.drum, crates = X.crates, floodlight = X.floodlight, plant = X.plant,
      sandbags = X.sandbags, ammo = X.ammo;
  if (key === 'radar') {
    /* Radar Dome. The dome IS the building - a pale hemisphere on a small dark base, and the
       most instantly identifiable structure in the game. Everything else stays low. */
    _r3Slab(m, 0, 0, 2, W - 10, 10, D - 12, 3, C[0], C[2]);
    _r3Box(m, 0, 0, D / 2 - 5, 8, 8, 3, DK[0], DK[1]);
    winRow(D / 2 - 4, 3, -11, 2, 8, 4, 4);
    /* WHITEWASH, not concrete. The dome is the most identifiable shape in the game and it
       was the same grey as the bunker under it, so the two read as one lump. */
    _r3Cone(m, 0, 10, -1, 15, 13.5, 6, WH[1], 22);
    _r3Cone(m, 0, 16, -1, 13.5, 9.5, 7, WH[0], 22);
    _r3Cone(m, 0, 23, -1, 9.5, 4, 6, WH[3], 22);
    _r3Cyl(m, 0, 29, -1, 2, 4, S[1], S[3], 16);
    _r3Cyl(m, 0, 10, -1, 15.6, 1.4, B.roof, B.roof, 22);                 /* team ring at its foot */
    _r3Box(m, W / 2 - 7, 0, 4, 5, 12, 5, S[2], S[1]);                    /* waveguide riser */

    /* A radar station is an INSTRUMENT: the dish is the identity, the rest is the equipment
       that feeds it - cable trays, a generator set, a lit control room. */
    facade(6, 3.6, W / 2 - 4, D / 2 - 4);
    plant(-W / 4, 12, -D / 2 + 8, 9, 6);
    drum(W / 2 - 7, 2, D / 2 - 8, 2.0, 4.2, OL);
    pipe(W / 2 - 8, 2, -D / 2 + 9, 11, 'y', 1.4);
    ladder(-W / 2 + 5, 2, D / 2 - 4, 11);
    rail(0, 12, D / 2 - 5, W - 12, false);
    roofscape(12.2, W / 2 - 5, D / 2 - 5);
    floodlight(-W / 2 + 5, 2, -D / 2 + 5, 12);

  } else if (key === 'lab') {
    /* Tech Center. In the cameo this is a TALL PALE OFFICE BLOCK - several storeys of ribbon
       windows with a small mast on top - and that verticality is the point: it is the one
       building in a base that is taller than it is wide. The dish that used to be here made it
       a second Radar Dome. */
    /* Three masses, not one. It was a single 30-tall box in one material: whatever the
       ribbon windows did to its face, the whole silhouette shaded as one plane. A dark plinth,
       a chamfered tower above it and a narrower setback at the top give three separate things
       for the light to fall on, and the setback is what makes the height read as storeys. */
    _r3Slab(m, 0, 0, 2, W - 10, 6, D - 12, 2, DK[0], DK[1]);             /* the plinth */
    _r3Slab(m, 0, 6, 2, W - 12, 20, D - 14, 2.5, P[0], P[1]);            /* the tower */
    _r3Slab(m, 0, 26, 2, W - 20, 5, D - 22, 2, P[1], P[3]);              /* the setback */
    for (var lb = 0; lb < 4; lb++)                                       /* corner piers */
      _r3Box(m, (lb & 1 ? 1 : -1) * (W / 2 - 7), 6, (lb & 2 ? 1 : -1) * (D / 2 - 8),
             2.5, 20, 2.5, P[3], P[2]);
    for (var lf = 0; lf < 3; lf++) {                                     /* ribbon windows */
      winRow(D / 2 - 6, 5 + lf * 9, 0, 3, 10, 6, 5);
      _r3Box(m, 0, 3.5 + lf * 9, D / 2 - 6, W - 14, 1.4, 1.5, P[3], P[3]);
    }
    _r3Box(m, 0, 31, 2, W - 18, 2, D - 20, P[3], P[1]);                  /* parapet */
    _r3Box(m, 0, 33, 2, W - 22, 1.2, 4, B.roof, B.roof);                 /* team band */
    _r3Box(m, -W / 2 + 8, 0, D / 2 - 5, 8, 9, 3, DK[0], DK[1]);          /* entrance */
    _r3Box(m, W / 2 - 10, 32, -2, 2, 14, 2, S[3], S[3]);                 /* mast */
    _r3Box(m, W / 2 - 10, 43, -2, 6, 1.5, 1.5, S[1], S[1]);
    _r3Cyl(m, 8, 32, 4, 4, 4, S[2], S[1], 26);                           /* rooftop plant */

    /* The lab reads as a lab when it has GLASS and services. */
    facade(6, 4.2, W / 2 - 4, D / 2 - 4);
    skylight(0, 12.4, 0, W - 16, D - 16);
    plant(W / 4, 12, -D / 2 + 8, 9, 6);
    pipe(-W / 2 + 8, 2, -D / 2 + 9, 11, 'y', 1.4);
    drum(-W / 2 + 7, 2, D / 2 - 8, 2.0, 4.2, WH);
    ladder(W / 2 - 5, 2, D / 2 - 4, 11);
    roofscape(12.6, W / 2 - 5, D / 2 - 5);
    floodlight(W / 2 - 5, 2, -D / 2 + 5, 12);

  } else if (key === 'depot') {
    /* Service Depot. The cameo is almost entirely a flat pale OVAL APRON with a small hut at
       one edge - the building is the ground, not a box. The gantry frame that used to be here
       was invented. Keeping the middle genuinely empty is what makes it read as somewhere a
       vehicle drives onto. */
    _r3Cone(m, 0, 0, 0, W / 2 - 3, W / 2 - 5, 2, C[3], 26);              /* the round pad */
    _r3Cone(m, 0, 2, 0, W / 2 - 8, W / 2 - 9, 0.8, C[1], 26);            /* inner ring */
    _r3Box(m, 0, 2.8, 0, W - 30, 0.8, D - 30, RTS_PAL.hazard[0], RTS_PAL.hazard[0]);
    _r3Box(m, -W / 2 + 8, 2, -2, 10, 11, 16, C[0], C[2]);                /* the hut */
    _r3Box(m, -W / 2 + 8, 13, -2, 11, 1.6, 17, P[3], P[1]);
    _r3Box(m, -W / 2 + 8, 14.6, -2, 9, 1.0, 4, B.roof, B.roof);          /* team band */
    _r3Box(m, -W / 2 + 8, 2, 8, 5, 7, 3, DK[0], DK[1]);
    for (var db = 0; db < 3; db++)                                       /* drums at the edge */
      _r3Cyl(m, W / 2 - 9, 2, -8 + db * 8, 2.6, 5, RTS_PAL.hazard[0], S[3], 16);
    _r3Box(m, 6, 2, -D / 2 + 7, 12, 4, 4, S[2], S[1]);                   /* toolrack */

    /* A service depot is a workshop YARD, and the detail has to respect what the model above
       says it is: an apron with a hut at one edge. The first pass at this put a four-wall
       facade, a roof beam across the middle and a full roofscape on it - windows and roof
       plant on a building whose roof is the ground. On the contact sheet it read as a comb of
       trim standing in mid-air over an empty pad, and it contradicted the note two paragraphs
       up that says keeping the middle empty is the whole point of the shape.

       So the stock goes round the RIM, where a yard keeps it, and the middle stays clear for
       the vehicle that drives onto it. */
    crates(-W / 2 + 9, 2, D / 2 - 9); crates(-W / 2 + 15, 2, D / 2 - 8);
    drum(W / 2 - 8, 2, D / 2 - 8, 2.2, 4.6, RU);
    drum(W / 2 - 13, 2, D / 2 - 7, 2.2, 4.6, OL);
    ladder(-W / 2 + 3.5, 2, -2, 10);                        /* up the hut, not up thin air */
    winSide(-W / 2 + 3.2, 6, -2, 3, 5, 3.0, 3.4);           /* the hut's own glazing */
    _r3Box(m, -W / 2 + 8, 13.6, -2, 4.5, 2.0, 4.5, S[2], S[1]);   /* its vent */
    /* jack stands and a tyre stack - the things a depot has that nothing else does */
    for (var dj = 0; dj < 3; dj++)
      _r3Box(m, 4 + dj * 7, 2.8, D / 2 - 12, 2.2, 3.4, 2.2, S[3], S[2]);
    for (var dt = 0; dt < 3; dt++)
      _r3Cyl(m, W / 2 - 12, 2.8 + dt * 1.5, -D / 2 + 11, 3.0, 1.5, DK[1], DK[2], 16);
    floodlight(-W / 2 + 5, 2, -D / 2 + 5, 12);

  } else if (key === 'helipad') {
    /* A flat pad, and in the reference it is exactly that: a marked square of apron with a
       yellow cross on it and almost nothing standing up. Keeping it low is the point - the one
       structure a helicopter can sit on top of has to look like it. */
    /* ASPHALT. This is pavement, not a wall - painting it in the concrete used for walls is
       what made it read as a slab of building rather than as ground. */
    _r3Box(m, 0, 0, 0, W - 4, 2.5, D - 4, AS[2], AS[0]);
    _r3Box(m, 0, 2.5, 0, W - 12, 0.8, D - 12, AS[0], AS[1]);       /* the marked square */
    _r3Box(m, 0, 3.3, 0, W - 22, 0.7, 4.5, RTS_PAL.hazard[0], RTS_PAL.hazard[0]);   /* the cross */
    _r3Box(m, 0, 3.3, 0, 4.5, 0.7, D - 22, RTS_PAL.hazard[0], RTS_PAL.hazard[0]);
    _r3Box(m, -W / 2 + 6, 2.5, -D / 2 + 6, 7, 9, 7, C[0], B.roof);  /* control hut, team roof */
    _r3Box(m, -W / 2 + 6, 11.5, -D / 2 + 6, 1.2, 6, 1.2, S[3], S[3]);   /* mast */
    for (var hp = 0; hp < 4; hp++)                                  /* corner lights */
      _r3Cyl(m, (hp < 2 ? -1 : 1) * (W / 2 - 5), 2.5, (hp % 2 ? 1 : -1) * (D / 2 - 5),
             1.0, 1.8, RTS_PAL.lit, RTS_PAL.lit, 10);
    _r3Cyl(m, W / 2 - 7, 2.5, D / 2 - 7, 2.6, 4.5, RTS_PAL.hazard[0], S[3], 14);    /* fuel drum */

    /* A pad needs its ground support - fuel, a windsock, lights round the circle. */
    drum(-W / 2 + 7, 1.6, -D / 2 + 7, 2.2, 4.6, RU);
    drum(-W / 2 + 12, 1.6, -D / 2 + 6, 2.2, 4.6, RU);
    _r3Box(m, W / 2 - 6, 1.6, -D / 2 + 6, 0.9, 12, 0.9, S[3], S[2]);
    _r3Cone(m, W / 2 - 6, 13.6, -D / 2 + 6, 1.0, 2.4, 5.0, RTS_PAL.bag[0], 16);
    for (var pl = 0; pl < 8; pl++) {
      var pa = pl / 8 * Math.PI * 2;
      _r3Box(m, Math.cos(pa) * (W / 2 - 4), 1.6, Math.sin(pa) * (D / 2 - 4),
             1.2, 1.2, 1.2, pl & 1 ? WH[0] : DK[1], WH[1]);
    }
    floodlight(W / 2 - 5, 1.6, D / 2 - 5, 11);

  } else if (key === 'afld') {
    /* THE AIRFIELD. A runway, which is a thing no other structure in this game is: 3x2 cells of
       flat dark tarmac with a dashed centreline down the long axis and threshold bars at each
       end. Almost nothing stands up, for the same reason the Helipad keeps low - aircraft land
       on it - and the centreline is what stops it reading as a car park. */
    _r3Box(m, 0, 0, 0, W - 3, 2.2, D - 4, DK[2], DK[0]);            /* the apron */
    _r3Box(m, 0, 2.2, 0, W - 9, 0.7, D - 13, DK[1], DK[3]);         /* the strip itself */
    for (var af = 0; af < 6; af++)                                  /* dashed centreline */
      _r3Box(m, -W / 2 + 8 + af * ((W - 16) / 5), 2.9, 0, 3.6, 0.6, 1.2,
             RTS_PAL.hazard[0], RTS_PAL.hazard[0]);
    /* PALE threshold bars, both of them. The material sweep recoloured one to asphalt -
       a marking the colour of the surface it marks - and left the other concrete, so the two
       ends of the runway disagreed. Markings are paint, and paint on tarmac is pale. */
    _r3Box(m,  W / 2 - 6, 2.9, 0, 1.6, 0.6, D - 15, C[3], C[1]);      /* threshold bars */
    _r3Box(m, -W / 2 + 6, 2.9, 0, 1.6, 0.6, D - 15, C[3], C[1]);
    for (var ae = 0; ae < 5; ae++) {                                  /* runway edge lights */
      var aex = -W / 2 + 10 + ae * ((W - 20) / 4);
      _r3Cyl(m, aex, 2.9, -D / 2 + 8, 0.7, 1.0, RTS_PAL.lit, RTS_PAL.lit, 8);
      _r3Cyl(m, aex, 2.9, D / 2 - 8, 0.7, 1.0, RTS_PAL.lit, RTS_PAL.lit, 8);
    }
    _r3Box(m, -W / 2 + 7, 2.2, -D / 2 + 5, 8, 8, 6, C[0], B.roof);  /* control shack, team roof */
    _r3Box(m, -W / 2 + 7, 10.2, -D / 2 + 5, 1.1, 5, 1.1, S[3], S[3]);  /* its mast */
    /* the windsock, which is the one silhouette cue that says airfield rather than road */
    _r3Box(m,  W / 2 - 10, 2.2, -D / 2 + 5, 1.0, 9, 1.0, S[3], S[3]);
    _r3Cyl(m, W / 2 - 10, 10.5, -D / 2 + 5, 1.6, 3.4, RTS_PAL.hazard[0], S[3], 12);
    for (var al = 0; al < 4; al++)                                  /* corner lights */
      _r3Cyl(m, (al < 2 ? -1 : 1) * (W / 2 - 4), 2.2, (al % 2 ? 1 : -1) * (D / 2 - 4),
             0.9, 1.6, RTS_PAL.lit, RTS_PAL.lit, 10);

    /* An airfield is a STRIP with a tower and a fuel farm beside it - and a strip has no roof,
       which the first pass at this forgot. It carried a facade, roof plant, a handrail and a
       roofscape at y=12, all of it hanging over open tarmac with nothing underneath. Same
       mistake as the depot: helpers that suit a box applied to something that is a surface.

       What a strip actually has stands ON it, at deck height. */
    drum(-W / 2 + 8, 2, -D / 2 + 8, 2.6, 5.4, RU);
    drum(-W / 2 + 14, 2, -D / 2 + 7, 2.6, 5.4, RU);
    pipe(-W / 2 + 11, 2, D / 2 - 10, 12, 'y', 1.6);
    winSide(-W / 2 + 3.2, 5.5, -D / 2 + 5, 2, 4, 2.6, 3.0);       /* the control shack's glass */
    /* a fuel bowser parked off the threshold, and a ground-power cart beside it */
    _r3Box(m, W / 2 - 13, 3.0, D / 2 - 9, 12, 3.2, 5.0, OL[1], OL[0]);
    _r3Cyl(m, W / 2 - 13, 6.2, D / 2 - 9, 2.4, 3.0, OL[2], OL[3], 16);
    for (var aw = 0; aw < 4; aw++)
      _r3Cyl(m, W / 2 - 18 + aw * 3.4, 2.9, D / 2 - 9 + (aw & 1 ? 2.6 : -2.6),
             1.0, 1.2, DK[1], DK[2], 12);
    _r3Box(m, W / 2 - 21, 3.0, D / 2 - 9, 3.6, 2.6, 3.6, S[2], S[1]);
    /* marshalling boards down the strip edge - flat, and the only thing tall is the sign */
    for (var am = 0; am < 4; am++) {
      var amz = -D / 2 + 12 + am * ((D - 24) / 3);
      _r3Box(m, -W / 2 + 4, 2.9, amz, 1.0, 3.4, 1.0, S[3], S[3]);
      _r3Box(m, -W / 2 + 4, 6.3, amz, 0.6, 2.0, 3.2, C[3], C[1]);
    }
    floodlight(W / 2 - 5, 2, D / 2 - 5, 13);

  } else if (key === 'aagun') {
    /* THE AA GUN. One cell wide and two deep, and the read is entirely in the barrels: a pair of
       long thin tubes ANGLED UP off a small turret. Everything else that shoots in this game
       points flat along the ground, so elevation is the only cue that says "this one is for the
       things above you" - and it is why the barrels are drawn tall rather than long. */
    _r3Box(m, 0, 0, 0, W - 3, 3.0, D - 4, C[2], C[0]);              /* concrete base */
    _r3Box(m, 0, 3.0, 0, W - 7, 3.0, D - 9, SD[2], SD[0]);          /* the mount */
    _r3Cyl(m, 0, 6.0, 0, 4.6, 4.0, C[0], C[1], 16);                 /* the turret ring */
    _r3Box(m, 0, 10.0, 0, 6.0, 1.4, 5.0, B.roof, B.roof);           /* team cap */
    /* the two barrels, raked back and up - a box that is tall and short reads as elevation */
    _r3Box(m, -1.2, 10.5, -1.6, 3.0, 11.0, 1.3, DK[0], DK[2]);
    _r3Box(m, -1.2, 10.5,  1.6, 3.0, 11.0, 1.3, DK[0], DK[2]);
    _r3Box(m, -2.6, 20.5, 0, 3.6, 1.4, 4.6, DK[1], DK[3]);          /* muzzles */
    _r3Box(m,  W / 2 - 4, 3.0, D / 2 - 5, 3.0, 4.0, 3.0, S[2], S[1]);  /* ammo locker */

    /* An emplacement: a revetment, a ready-rack, a light. */
    sandbags(1.4, W / 2 - 3, D / 2 - 3, 15);
    ammo(0, 1.4, -D / 2 + 6);
    crates(W / 2 - 7, 1.4, D / 2 - 7);
    drum(-W / 2 + 6, 1.4, D / 2 - 6, 1.8, 3.6, OL);

  } else if (key === 'silo') {
    /* Ore Silo. The cameo is a LOW RIBBED BUNKER - a wide flat green-grey box with vertical
       ribs down it and an open frame at one end - not the three cylinders that were here,
       which read as a small refinery. Low and wide is the whole identity. */
    _r3Box(m, 0, 0, 0, W - 6, 2, D - 6, C[2], C[0]);                     /* pad */
    _r3Box(m, 0, 2, -1, W - 10, 3, D - 12, K[2], K[0]);                  /* brick base course */
    _r3Slab(m, 0, 5, -1, W - 12, 10, D - 14, 2, SD[2], SD[0]);           /* the bunker */
    for (var sk = 0; sk < 5; sk++)                                       /* the ribs */
      _r3Box(m, -16 + sk * 8, 5, -1, 2.5, 11, D - 12, C[2], C[0]);
    /* The lid was one flat box across the whole top, which under this camera is the largest
       single face on the building. Three shallow ridges instead. */
    for (var sl = 0; sl < 3; sl++)
      _r3Gable(m, 0, 15, (sl - 1) * ((D - 12) / 3), W - 10, 3, (D - 12) / 3 - 0.4,
               (sl & 1) ? C[1] : C[3]);
    _r3Box(m, 0, 17, -1, W - 14, 1.2, 4, B.roof, B.roof);                /* team band */
    _r3Box(m, 0, 2, D / 2 - 5, W - 16, 11, 2.5, DK[2], DK[0]);           /* open end frame */
    _r3Box(m, 0, 2, D / 2 - 4, W - 20, 5, 3, RTS_PAL.ore[0], RTS_PAL.ore[1]);  /* ore inside */
    _r3Box(m, -W / 2 + 7, 2, -D / 2 + 6, 4, 16, 4, S[3], S[3]);          /* fill pipe */
    _r3Box(m, -W / 2 + 13, 17, -D / 2 + 6, 12, 2, 3, S[2], S[1]);

    /* A silo is a vessel: ladder, cap, pressure pipework. */
    ladder(W / 2 - 4, 2, 0, 13);
    pipe(-W / 2 + 6, 2, 0, 10, 'y', 1.4);
    _r3Cyl(m, 0, 15.5, 0, 1.4, 3.4, S[3], S[2], 16);
    drum(W / 2 - 6, 2, -D / 2 + 6, 1.8, 3.6, RU);

  } else if (key === 'kennel') {
    /* Attack Dog Kennel. Literally a doghouse in the cameo - a red-brown box with a barrel
       roof and an arched black entrance. Tiny, and nothing on it could be mistaken for a
       weapon, which matters: it must not read as a defence. */
    _r3Box(m, 0, 0, 0, W - 4, 1.5, D - 4, RTS_PAL.dirt[2], RTS_PAL.dirt[1]);
    _r3Box(m, -3, 1.5, -1, 13, 7, 12, K[0], K[1]);
    _r3Vault(m, -3, 8.5, -1, 14, 7, 13, K[2], 12, true);                 /* barrel roof */
    _r3Box(m, -3, 1.5, 5, 5, 6, 2, DK[2], DK[0]);                        /* the arched entry */
    _r3Box(m, -3, 14, -1, 9, 1.2, 4, B.roof, B.roof);                    /* team band */
    _r3Box(m, 8, 1.5, 2, 5, 2, 4, S[2], S[1]);                           /* feed trough */
    _r3Box(m, 8, 1.5, -6, 1, 8, 1, S[3], S[3]);                          /* post */

    /* A kennel is a run: pens, a wire fence, a water trough. */
    for (var kp = 0; kp < 3; kp++) {
      _r3Box(m, (kp - 1) * (W / 3.4), 2, D / 2 - 7, W / 4.2, 5.0, 5.0, SD[kp & 1], SD[2]);
      _r3Box(m, (kp - 1) * (W / 3.4), 7, D / 2 - 7, W / 4.4, 0.8, 5.4, DK[1], DK[0]);
    }
    for (var kf = 0; kf < 7; kf++)
      _r3Box(m, -W / 2 + 3 + kf * ((W - 6) / 6), 2, -D / 2 + 4, 0.5, 7.0, 0.5, S[3], S[3]);
    _r3Box(m, 0, 8.6, -D / 2 + 4, W - 5, 0.4, 0.4, S[2], S[2]);
    _r3Box(m, W / 2 - 7, 2, -D / 2 + 9, 5.0, 1.4, 3.0, C[1], C[3]);

  } else return false;
  return true;
}
