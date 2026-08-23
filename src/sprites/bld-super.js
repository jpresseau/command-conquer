/* sprites/bld-super.js - the four superweapon buildings, and the three small defences that share their file by
   position rather than by kind: wall, pillbox and gun turret.

   One arm of the model chain that used to be a single 500-line function in
   sprites/models.js. The bodies moved verbatim; the shared locals come in through X
   so that each model line reads exactly as it did before, rather than being rewritten
   into X.m / X.W and made noisier everywhere to solve a file-length problem.
   Returns false for a key it does not own, so models.js can try the next arm. */
function _sprBldSuper(X, key) {
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
  if (key === 'mslo') {
    /* MISSILE SILO. A pair of blast doors laid flat with the nose of the missile showing
       through the open one. Deliberately LOW and horizontal - it is the most dangerous thing
       on the field and it should not look like a defence tower, it should look like a hatch in
       the ground that you would walk past. The read is the yellow-black hazard chevrons. */
    _r3Box(m, 0, 0, 0, W - 4, 3, D - 4, C[2], C[0]);                     /* apron */
    /* OLIVE. The apron stays concrete - it is ground - but the silo itself is equipment, and
       army equipment is painted. The chevrons read far better against paint than against the
       same grey the apron is. */
    _r3Box(m, 0, 3, 0, W - 10, 6, D - 10, OL[0], OL[1]);                 /* silo block */
    /* the open door, hinged back, and the closed one beside it */
    _r3Box(m, -7, 9, -2, 12, 1.6, 13, DK[1], DK[2]);
    _r3Box(m, 6, 9, -8, 12, 1.6, 5, C[3], C[2]);
    _r3Cyl(m, -7, 9, -2, 4.6, 3, DK[2], DK[3], 16);                      /* the shaft mouth */
    _r3Cone(m, -7, 12, -2, 3.6, 7, 3, S[0], 16);                         /* the warhead */
    _r3Box(m, -7, 17.5, -2, 2, 2, 2, RTS_PAL.hazard[0], RTS_PAL.hazard[1]);
    for (var _mv = 0; _mv < 4; _mv++)                                    /* hazard chevrons */
      _r3Box(m, -12 + _mv * 8, 9.1, 6, 5, 0.9, 3,
             _mv % 2 ? RTS_PAL.hazard[0] : DK[2], _mv % 2 ? RTS_PAL.hazard[1] : DK[3]);
    _r3Box(m, W / 2 - 6, 3, D / 2 - 6, 6, 9, 6, S[2], S[1]);             /* control hut */
    _r3Box(m, W / 2 - 6, 12, D / 2 - 6, 1.0, 4, 1.0, S[3], S[2]);        /* its antenna */
    /* Surface detail that keeps the building LOW - it measured 98 distinct tones, worst in
       the game, and being a hatch in the ground is its identity, so the interest has to come
       from what is bolted to the apron rather than from anything standing up. */
    _r3Box(m, 5, 3, D / 2 - 8, 14, 1.2, 2.2, DK[1], DK[0]);              /* cable trench */
    _r3Box(m, W / 2 - 9, 3, D / 2 - 10, 2.2, 1.2, 5, DK[1], DK[0]);
    for (var _mk = 0; _mk < 4; _mk++)                                    /* apron kerbs */
      _r3Box(m, (_mk & 1 ? 1 : -1) * (W / 2 - 5), 3, (_mk & 2 ? 1 : -1) * (D / 2 - 5),
             4, 1.6, 4, C[3], C[1]);
    _r3Cyl(m, -W / 2 + 6, 3, -D / 2 + 6, 1.2, 4.5, S[2], RTS_PAL.lit, 12);  /* beacon */
    _r3Box(m, 0, 9.8, -D / 2 + 5, 9, 1.2, 3, B.roof, B.roof);            /* team band */

    /* A missile silo is a hardened cap over a shaft: blast doors, hydraulics, plant. */
    for (var mb = 0; mb < 2; mb++)
      _r3Box(m, (mb ? 1 : -1) * (W / 4 + 1), 2, 0, W / 3.2, 3.4, D - 8, C[3], C[1]);
    _r3Cyl(m, -W / 4 - 1, 5.4, D / 2 - 8, 1.2, 5.0, S[2], S[1], 16);
    _r3Cyl(m, W / 4 + 1, 5.4, D / 2 - 8, 1.2, 5.0, S[2], S[1], 16);
    plant(0, 2, -D / 2 + 7, 10, 5);
    floodlight(-W / 2 + 5, 2, D / 2 - 5, 12);

  } else if (key === 'iron') {
    /* IRON CURTAIN. A heavy frame holding a lens between two coil banks, aimed sideways. The
       identity is the FRAME with a gap in the middle - a machine that projects something -
       against the Chronosphere's sphere. They are the two "field" buildings and must not be
       confusable at a glance. */
    _r3Box(m, 0, 0, 0, W - 4, 3, D - 4, C[2], C[0]);
    _r3Box(m, 0, 3, 0, W - 12, 7, D - 8, OL[0], OL[1]);                  /* plinth, painted */
    /* the two uprights and the yoke across the top */
    _r3Box(m, -10, 10, 0, 4, 18, 7, DK[1], DK[2]);
    _r3Box(m,  10, 10, 0, 4, 18, 7, DK[1], DK[2]);
    _r3Box(m, 0, 26, 0, 24, 3.5, 6, C[3], C[2]);
    /* coil banks on each upright */
    for (var _iv = 0; _iv < 3; _iv++) {
      /* COPPER. These are coils. They were concrete, which is the one material a coil
         cannot be made of, and they are the part the eye goes to. */
      _r3Cyl(m, -10, 13 + _iv * 5, 0, 4.2, 2, CU[0], CU[3], 16);
      _r3Cyl(m,  10, 13 + _iv * 5, 0, 4.2, 2, CU[0], CU[3], 16);
    }
    /* the emitter itself, between them - emissive, because a powered field IS the building */
    _r3Cyl(m, 0, 18, 0, 5, 3.2, RTS_PAL.lit, RTS_PAL.lit, 20);
    _r3Box(m, 0, 10, 0, 6, 1.4, 4, B.roof, B.roof);
    _r3Box(m, -W / 2 + 6, 3, D / 2 - 6, 5, 8, 5, S[2], S[1]);            /* transformer */

    /* The iron curtain is an emitter bank: capacitors, bus work, glazing. */
    for (var ic = 0; ic < 4; ic++)
      _r3Cyl(m, (ic & 1 ? 1 : -1) * (W / 2 - 6), 2, (ic & 2 ? 1 : -1) * (D / 2 - 6),
             2.2, 8.0, CU[1], CU[0], 18);
    _r3Box(m, 0, 10, 0, W - 10, 0.8, 0.8, CU[2], CU[2]);
    facade(6, 3.4, W / 2 - 4, D / 2 - 4);
    roofscape(11.5, W / 2 - 5, D / 2 - 5);
    ladder(W / 2 - 4, 2, D / 2 - 4, 11);

  } else if (key === 'pdox') {
    /* CHRONOSPHERE. A SPHERE in a cradle of arms. Round where the Iron Curtain is square, and
       the only spherical thing in the whole build list, which is the entire reason it reads
       instantly. */
    _r3Box(m, 0, 0, 0, W - 4, 3, D - 4, C[2], C[0]);
    _r3Box(m, 0, 3, 0, W - 12, 6, D - 12, C[0], C[1]);                   /* base drum */
    for (var _pa = 0; _pa < 4; _pa++) {                                  /* the cradle arms */
      var _px = (_pa < 2 ? -1 : 1) * 9, _pz = (_pa % 2 ? 1 : -1) * 9;
      _r3Box(m, _px, 9, _pz, 3, 13, 3, DK[1], DK[2]);
    }
    /* the sphere, as a stack of cones - there is no sphere primitive and adding one for a
       single building would be a worse trade than four rings that read as round from every
       angle the camera can reach */
    /* WHITEWASH. The two field buildings must not be confusable, and they were both built
       from the same greys - the shape was carrying the whole distinction. Now the Chronosphere
       is a white sphere and the Iron Curtain is a painted frame with copper coils. */
    _r3Cone(m, 0, 15, 0, 3.5, 7.5, 4, WH[2], 20);
    _r3Cone(m, 0, 19, 0, 7.5, 9,   3, WH[0], 20);
    _r3Cone(m, 0, 22, 0, 9,   7.5, 4, WH[1], 20);
    _r3Cone(m, 0, 26, 0, 7.5, 3.5, 4, WH[0], 20);
    _r3Cyl(m, 0, 21.5, 0, 10.5, 1.6, RTS_PAL.spark[1], RTS_PAL.spark[2], 20); /* equator ring */
    _r3Cyl(m, 0, 30, 0, 1.6, 3, RTS_PAL.lit, RTS_PAL.lit, 12);           /* crown light */
    _r3Box(m, 0, 9.5, 0, 8, 1.4, 5, B.roof, B.roof);
    _r3Box(m, W / 2 - 6, 3, -D / 2 + 6, 6, 8, 6, S[2], S[1]);            /* control hut */

    /* The chronosphere is a ring rig: coils on posts, cabinets, a trench. */
    for (var pc = 0; pc < 6; pc++) {
      var pang = pc / 6 * Math.PI * 2;
      _r3Cyl(m, Math.cos(pang) * (W / 2 - 6), 2, Math.sin(pang) * (D / 2 - 6),
             1.4, 9.0, S[2], S[1], 16);
      _r3Cyl(m, Math.cos(pang) * (W / 2 - 6), 11, Math.sin(pang) * (D / 2 - 6),
             2.2, 1.6, CU[1], CU[0], 16);
    }
    _r3Box(m, 0, 2, -D / 2 + 6, 7.0, 5.0, 4.0, S[1], S[0]);
    facade(6, 3.2, W / 2 - 4, D / 2 - 4);

  } else if (key === 'gps') {
    /* GPS UPLINK. A dish on a mast. The most familiar shape in the set and the least
       threatening, which is right - it is the one superweapon that shoots nothing. */
    /* It was concrete end to end - pad, shed, roof - so the dish was the only thing on it
       with an edge. A brick plinth under a chamfered shed puts two more materials on screen. */
    _r3Box(m, 0, 0, 0, W - 6, 3, D - 6, C[2], C[0]);
    _r3Box(m, 0, 3, 2, W - 10, 2.5, D - 10, K[2], K[0]);                 /* brick plinth */
    _r3Slab(m, 0, 5.5, 2, W - 14, 7, D - 14, 2, C[0], C[1]);             /* equipment shed */
    _r3Box(m, 0, 12.5, 2, W - 18, 1.6, D - 18, C[3], C[2]);
    _r3Box(m, -W / 2 + 8, 3, -D / 2 + 8, 6, 7, 6, DK[0], DK[1]);         /* transformer */
    for (var gv = 0; gv < 3; gv++)
      _r3Box(m, -W / 2 + 6 + gv * 3, 10, -D / 2 + 8, 1.2, 4, 1.2, S[3], S[3]);
    _r3Cyl(m, 0, 13.5, 2, 2.2, 11, S[2], S[1], 16);                      /* the mast */
    _r3Cone(m, 0, 23, 2, 11, 6, 9, C[3], 20);                            /* the dish */
    _r3Cyl(m, 0, 27, 2, 1.2, 4, S[3], S[3], 12);                         /* feed horn */
    _r3Cyl(m, 0, 30.5, 2, 1.5, 1.5, RTS_PAL.lit, RTS_PAL.lit, 12);
    _r3Box(m, 0, 13.9, -D / 2 + 6, 8, 1.2, 3, B.roof, B.roof);           /* team band */
    _r3Box(m, -W / 2 + 6, 3, D / 2 - 6, 5, 6, 5, S[2], S[1]);            /* cable box */

    /* GPS is a ground station: equipment shed, cable run, glazing. */
    _r3Box(m, -W / 2 + 8, 2, D / 2 - 7, 7.0, 5.0, 5.0, C[1], C[3]);
    roofscape(11.0, W / 2 - 5, D / 2 - 5);
    pipe(W / 2 - 7, 2, D / 2 - 7, 9, 'y', 1.2);
    facade(6, 3.2, W / 2 - 4, D / 2 - 4);
    floodlight(W / 2 - 5, 2, -D / 2 + 5, 11);

  } else if (key === 'wall') {
    /* Concrete Wall. Has to tile with itself edge to edge, so it fills the cell exactly and
       nothing may cross the boundary. Simple by necessity and by choice - a wall that draws
       attention is a wall that makes a base look noisy. */
    _r3Box(m, 0, 0, 0, RTS_TS, 9, RTS_TS, C[0], C[1]);
    _r3Box(m, 0, 9, 0, RTS_TS, 2, RTS_TS, C[3], C[3]);                   /* capping course */
    _r3Box(m, 0, 4.5, 0, RTS_TS, 1, RTS_TS, C[2], C[2]);                 /* joint line */
    _r3Box(m, 0, 0, RTS_TS / 2 - 1, 3, 9, 2, C[2], C[2]);                /* form-tie marks */

    /* A wall section gets a footing and a cap, so a RUN of them reads as coursed masonry
       rather than as one long extruded bar - which is what a wall is mostly seen as. */
    _r3Box(m, 0, 0, 0, W - 1, 1.2, D - 1, DK[1], DK[0]);
    _r3Box(m, 0, 7.0, 0, W - 2.5, 1.0, D - 2.5, C[3], C[1]);
    /* COURSES. A wall is the most repeated object a base has, so a flat slab is a flat slab
       twenty times over; three courses with a set-back give a run of them a horizontal line
       to catch the light along and a shadow under each lip. */
    for (var wc = 0; wc < 3; wc++)
      _r3Box(m, 0, 1.2 + wc * 1.9, 0, W - 1.6 - wc * 0.5, 1.7, D - 1.6 - wc * 0.5,
             wc & 1 ? C[1] : C[2], C[3]);

  } else if (key === 'pillbox') {
    /* Pillbox. A small concrete dome with a slit. Low and rounded on purpose: it is the one
       defence that should read as dug in rather than standing up. */
    _r3Box(m, 0, 0, 0, W - 5, 2.5, D - 5, C[2], C[0]);
    _r3Cone(m, 0, 2.5, 0, 10, 7, 6, C[1], 20);
    _r3Cone(m, 0, 8.5, 0, 7, 4.5, 3.5, C[3], 20);
    _r3Box(m, 0, 5, 7, 11, 2.5, 2, DK[2], DK[3]);                        /* firing slit */
    _r3Box(m, 0, 5.5, 9, 3, 1.5, 4, S[3], S[3]);                         /* gun barrel */
    _r3Box(m, 0, 11.5, 0, 5, 1.2, 5, B.roof, B.roof);
    for (var pb = 0; pb < 3; pb++)
      _r3Box(m, -8 + pb * 8, 2.5, -8, 6, 3, 4, RTS_PAL.bag[0], RTS_PAL.bag[1]);

    /* A pillbox sits in its own sandbag ring, with a firing slit and a periscope. The ring was
       five bags evenly spaced, which at sprite size is a dotted line rather than a wall - the
       shared builder lays two staggered courses instead, so the joints break up and it stacks. */
    sandbags(1.2, W / 2 - 3, D / 2 - 3, 13);
    ammo(-W / 2 + 5, 1.2, D / 2 - 6);
    _r3Box(m, 0, 5.0, D / 2 - 3.2, W - 9, 1.4, 0.8, DK[0], DK[0]);
    _r3Cyl(m, W / 2 - 5, 6.2, -D / 2 + 5, 0.7, 2.6, S[3], S[2], 16);
    /* A sloped concrete apron round the dome, and the embrasure hood over the slit. */
    for (var pa2 = 0; pa2 < 4; pa2++)
      _r3Box(m, (pa2 & 1 ? 1 : -1) * (W / 2 - 2.2), 1.0, (pa2 & 2 ? 1 : -1) * (D / 2 - 2.2),
             3.4, 2.2, 3.4, C[3], C[1]);
    _r3Box(m, 0, 6.6, D / 2 - 3.6, W - 8, 1.0, 2.0, C[3], C[1]);

  } else if (key === 'turret') {
    /* Gun Turret. A single BARREL on a low armoured base, lying almost flat - the barrel is
       the read, so it is long and sits clear of everything else.

       THE GUN HOUSE IS A HOUSE, NOT A LID. It was one cylinder, radius 7 on a 24-unit
       footprint, carrying the team colour as its TOP face - and this camera looks down at 49
       degrees, so that top face is most of what the building ever shows. The most-built
       defence in the game rendered as a flat blue disc filling half its own pad: no shape, no
       shading, nothing to say which way the gun pointed except the barrel sticking out of it.
       Caught by eye on the roster contact sheet.

       Built the way the tank turrets in sprites/unit-ground.js are built instead - a chamfered
       _r3Slab body under an _r3Hip roof. The slab gives four wall planes at four angles and
       the hip gives two more sloping the other way, so the same light lands on six tones where
       it used to land on one.

       AND THE ROOF IS THE BUILDING'S OWN PAINT, not the team colour. Putting the hip in
       B.roof was the first attempt and it only traded a flat blue disc for a flat blue tent -
       still half the footprint in one hue, because the area was the problem and the shape was
       only half of it. The team colour is a marker on the ridge now, the way the power plant
       and the barracks carry a band rather than a lid.

       (_r3Hip's ridge runs along X, across the barrel rather than along it - the ridge line is
       (rx0..rx1, y1, z) at the footprint's centre in z. An earlier draft of this note claimed
       the opposite and was wrong; the roof says nothing about facing, and the barrel and the
       mantlet already do.) */
    _r3Box(m, 0, 0, 0, W - 4, 3, D - 4, C[2], C[0]);
    _r3Cone(m, 0, 3, 0, 9, 7.5, 5, OL[0], 20);                           /* sloped base, painted */
    _r3Cyl(m, 0, 8, 0, 6.4, 1.6, S[1], S[0], 20);                        /* the traverse ring */
    /* the gun house: chamfered walls, hipped roof, ridge along the barrel */
    _r3Slab(m, 0, 9.6, 0, 11.5, 3.6, 12.5, 1.3, OL[1], OL[2]);
    _r3Hip(m, 0, 13.2, 0, 10.5, 1.7, 11.5, 3.6, OL[3]);
    _r3Box(m, 0, 14.5, 0, 6.4, 0.9, 2.6, B.roof, B.roof);                /* team marker, on the ridge */
    _r3Box(m, 0, 10.2, 6.6, 4.6, 3.0, 2.2, DK[1], DK[3]);                /* mantlet */
    _r3Box(m, 0, 10.4, 8, 3, 3, 13, S[0], S[1]);                         /* barrel */
    _r3Box(m, 0, 10.4, 15, 4, 4, 3, S[2], S[3]);                         /* muzzle */
    /* What a gun house carries on top, and the reason the roof is worth having: a hatch and a
       periscope break the ridge, so even head-on there are three heights up there. */
    _r3Box(m, -2.6, 14.4, -1.6, 3.4, 0.9, 3.4, S[2], S[1]);              /* hatch */
    _r3Cyl(m, 2.4, 14.4, -2.2, 0.7, 2.2, S[3], S[2], 12);                /* periscope */
    _r3Box(m, 0, 11.0, -6.4, 5.0, 2.2, 1.6, S[2], S[1]);                 /* stowage bin, aft */
    /* A gun turret gets its mounting: a ring base, a revetment, ready ammunition, a scope. */
    _r3Cyl(m, 0, 1.2, 0, W / 2 - 2.5, 1.6, C[3], C[1], 20);
    sandbags(2.8, W / 2 - 2.5, D / 2 - 2.5, 13);
    ammo(-W / 2 + 5, 2.8, -D / 2 + 6);
    crates(W / 2 - 5, 1.2, D / 2 - 5);
    _r3Cyl(m, -W / 2 + 4, 4.0, -D / 2 + 4, 0.7, 2.4, S[3], S[2], 16);

  } else return false;
  return true;
}
