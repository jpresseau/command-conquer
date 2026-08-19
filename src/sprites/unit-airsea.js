/* sprites/unit-airsea.js - aircraft, ships, and the support vehicles (APC, MCV, harvester).
   One arm of the unit model chain; see sprites/unitmodels.js for the dispatch and for the
   shared locals, which come in through X so that each model line reads exactly as it did when
   they were all one function. Returns false for a key it does not own, so the next arm can try.

   Split because unitmodels.js reached 506 lines the moment the V2 Rocket Launcher was given a
   model of its own, and unit/layout holds every source file to 500. Same shape the building
   models already use (bld-base / bld-tech / bld-war / bld-super). */
function _sprUnitAirSea(X, key) {
  var m = X.m, TM = X.TM, VH = X.VH, S = X.S, DK = X.DK, O = X.O, C = X.C, GN = X.GN,
      d = X.d, prone = X.prone, part = X.part, side = X.side, tracks = X.tracks, i;
  if (key === 'heli') {
    /* Attack helicopter. Two things carry it at this size: a long thin tail boom, which no
       ground unit has, and the rotor disc - drawn as a wide, very flat cylinder rather than
       blades, because at 24 px spinning blades are noise and a disc reads instantly. */
    _r3Box(m, 0, 3.0, 0, 15.0, 4.6, 5.2, VH[0], VH[1]);            /* fuselage */
    _r3Box(m, 5.6, 3.4, 0, 4.6, 3.6, 4.4, VH[1], VH[3]);           /* nose */
    _r3Box(m, 7.6, 4.2, 0, 1.6, 2.2, 3.4, RTS_PAL.glass, RTS_PAL.glass);
    _r3Box(m, -10.0, 4.6, 0, 11.0, 1.9, 1.9, VH[2], VH[1]);        /* tail boom */
    _r3Box(m, -15.0, 4.6, 0, 1.4, 5.0, 1.4, VH[1], VH[3]);         /* tail fin */
    _r3Cyl(m, -15.2, 6.2, 0.9, 2.4, 0.5, DK[1], DK[3], 14);        /* tail rotor disc */
    _r3Box(m, 0, 7.6, 0, 3.2, 1.4, 3.2, GN[2], GN[1]);             /* rotor head */
    /* BLADES, and only along the two axes. Drawn as a solid disc - the obvious way to say
       "spinning" - the rotor came out as an opaque dark lid 31 px across that hid the entire
       aircraft; every facing was the same black circle. The next attempt put four blades at
       45-degree steps, which is worse for a reason worth writing down: these primitives are
       axis-aligned boxes, so a diagonal "bar" is a box that is long in BOTH axes - a square.
       Four of them merged into a solid diamond. Two crossed bars along x and z are genuine
       thin bars, they read as a rotor, and the fuselage shows through the gaps. */
    _r3Box(m, 0, 8.9, 0, 30.0, 0.5, 1.4, DK[1], DK[3]);
    _r3Box(m, 0, 8.9, 0, 1.4, 0.5, 30.0, DK[1], DK[3]);
    _r3Box(m, 1.0, 2.2, -3.6, 6.0, 1.4, 1.4, GN[1], GN[3]);        /* stub wings + pods */
    _r3Box(m, 1.0, 2.2, 3.6, 6.0, 1.4, 1.4, GN[1], GN[3]);
    _r3Box(m, 2.6, 1.4, -3.6, 4.0, 1.6, 2.0, DK[1], DK[3]);
    _r3Box(m, 2.6, 1.4, 3.6, 4.0, 1.6, 2.0, DK[1], DK[3]);
    _r3Box(m, 0, 0.4, 0, 9.0, 1.0, 6.6, TM[1], TM[3]);             /* skids / team stripe */
    /* The mechanicals: engine cowls flanking the rotor head with exhaust stubs behind them,
       a chin sensor ball, and the skid cross-tubes - the camera looks straight down at a
       helicopter's back, so the cowls are the second-largest surface it ever shows. */
    _r3Box(m, -0.6, 5.6, -2.0, 6.0, 1.9, 1.6, VH[2], VH[1]);       /* engine cowls */
    _r3Box(m, -0.6, 5.6, 2.0, 6.0, 1.9, 1.6, VH[2], VH[1]);
    _r3Cyl(m, -3.6, 6.2, -2.0, 0.7, 1.6, DK[1], DK[3], 8);         /* exhaust stubs */
    _r3Cyl(m, -3.6, 6.2, 2.0, 0.7, 1.6, DK[1], DK[3], 8);
    _r3Cyl(m, 6.8, 1.6, 0, 1.2, 1.6, DK[0], DK[2], 10);            /* chin sensor ball */
    _r3Box(m, 2.6, 1.2, 0, 1.1, 1.2, 6.6, S[1], S[0]);             /* skid cross-tubes */
    _r3Box(m, -2.6, 1.2, 0, 1.1, 1.2, 6.6, S[1], S[0]);

  } else if (key === 'mig' || key === 'yak') {
    /* FIXED WING, and the whole job of these two is to not read as the helicopter above. The
       Heli is defined by a rotor disc and a long thin tail boom; a plane has neither, and what
       it does have is WINGS - a span wider than the aircraft is long. At 24px that span is the
       entire silhouette, so it is drawn first and everything else hangs off it.

       The two are told apart from each other the same way: the MiG is a swept-wing jet with a
       tapered nose and intakes, the Yak is shorter, straight-winged and carries a propeller.
       Different silhouettes rather than different colours - both fly for the same army in the
       same team palette, so colour cannot be the distinguisher. */
    var _jet = (key === 'mig');
    var _len = _jet ? 17.0 : 13.5, _span = _jet ? 20.0 : 22.0;
    if (_jet) {
      _r3Box(m, 0.5, 3.0, 0, 6.0, 1.3, _span, VH[0], VH[1]);       /* leading edge */
      _r3Box(m, -2.5, 3.0, 0, 5.0, 1.3, _span * 0.68, VH[1], VH[3]);  /* swept back */
    } else {
      _r3Box(m, 0.0, 3.0, 0, 5.4, 1.4, _span, VH[0], VH[1]);       /* straight wing */
    }
    _r3Box(m, 0, 3.4, 0, _len, 4.2, 4.6, VH[0], VH[1]);            /* fuselage */
    _r3Box(m, _len * 0.42, 3.6, 0, _len * 0.30, 3.2, 3.4, VH[1], VH[3]);  /* nose taper */
    _r3Box(m, 0.6, 6.2, 0, 4.2, 1.8, 3.0, RTS_PAL.glass, RTS_PAL.glass);  /* canopy */
    _r3Box(m, -_len * 0.46, 3.6, 0, 3.4, 1.2, 8.0, VH[2], VH[1]);  /* tailplane */
    _r3Box(m, -_len * 0.44, 4.6, 0, 2.6, 4.4, 1.3, VH[1], VH[3]);  /* fin */
    _r3Box(m, -1.0, 1.9, 0, 7.0, 1.2, 4.0, TM[1], TM[3]);          /* team stripe, underside */
    if (_jet) {
      _r3Cyl(m, -_len * 0.50, 3.6, 0, 1.9, 1.6, DK[1], DK[3], 12); /* exhaust */
      _r3Box(m, 0.5, 1.8, -6.0, 5.0, 1.2, 1.2, GN[1], GN[3]);      /* the Mavericks it carries */
      _r3Box(m, 0.5, 1.8, 6.0, 5.0, 1.2, 1.2, GN[1], GN[3]);
      /* Wing-root intakes and a pitot: the jet's engine has a mouth, and the dark pair
         either side of the nose is what says so from above. */
      _r3Box(m, _len * 0.24, 3.2, -3.1, 3.4, 2.2, 1.5, DK[0], DK[2]);
      _r3Box(m, _len * 0.24, 3.2, 3.1, 3.4, 2.2, 1.5, DK[0], DK[2]);
      _r3Box(m, _len * 0.62, 3.8, 0, 3.0, 0.6, 0.6, S[2], S[3]);
    } else {
      /* the propeller: a thin hub plus two crossed bars, the same trick the Heli's rotor uses
         and for the same reason - a solid disc at this size is an opaque lid over the aircraft */
      _r3Cyl(m, _len * 0.56, 3.6, 0, 1.4, 0.6, GN[2], GN[1], 12);
      _r3Box(m, _len * 0.60, 3.6, 0, 0.5, 11.0, 1.1, DK[1], DK[3]);
      _r3Box(m, _len * 0.60, 3.6, 0, 0.5, 1.1, 11.0, DK[1], DK[3]);
      /* Fixed gear under the wings and exhaust stubs down the cowling - the Yak is the
         WW2-era airframe of the pair and wears its machinery outside. */
      for (var _yg = -1; _yg <= 1; _yg += 2) {
        _r3Box(m, 1.2, 1.2, _yg * 4.2, 1.0, 2.0, 1.0, VH[2], VH[1]);
        _r3Cyl(m, 1.2, 0.2, _yg * 4.2, 1.1, 1.1, DK[0], DK[1], 10);
      }
      for (var _ye = 0; _ye < 3; _ye++)
        _r3Box(m, _len * 0.30 - _ye * 1.6, 4.6, -2.5, 1.0, 0.6, 0.8, DK[1], DK[3]);
    }

  } else if (key === 'gunboat' || key === 'destroyer' || key === 'cruiser') {
    /* SURFACE SHIPS. Long and narrow with a raked bow - a hull has to read as a hull from
       above or it is just a rectangle in the sea, and the only cues that survive this camera
       are the taper at the front and the wake-line down the middle. No tracks and no wheels:
       the underside is never seen, and drawing a keel would only widen the silhouette. */
    /* Three sizes off one hull, because the silhouette IS the difference at this camera: a
       Cruiser has to read as bigger than a Destroyer at a glance or the player cannot tell what
       is in their fleet without clicking it. The extra turret aft comes with `_big`. */
    var _cru = (key === 'cruiser'), _big = (key === 'destroyer' || _cru);
    var _L = _cru ? 32 : (_big ? 26 : 19), _Wd = _cru ? 10.5 : (_big ? 8.5 : 6.5);
    _r3Slab(m, 0, 0.6, 0, _L, 3.4, _Wd, 1.4, VH[0], VH[1]);              /* hull */
    _r3Box(m, _L * 0.40, 0.9, 0, _L * 0.22, 2.8, _Wd * 0.55, VH[1], VH[3]);   /* raked bow */
    _r3Box(m, -_L * 0.06, 4.0, 0, _L * 0.34, 3.2, _Wd * 0.66, VH[2], VH[0]);  /* superstructure */
    _r3Box(m, -_L * 0.06, 7.2, 0, _L * 0.20, 1.4, _Wd * 0.44, TM[1], TM[3]);  /* team cap */
    _r3Cyl(m, -_L * 0.18, 7.2, 0, 1.5, 4.5, DK[1], DK[0], 14);           /* funnel */
    /* the guns: one forward on a gunboat, fore and aft on a destroyer */
    _r3Cyl(m, _L * 0.16, 4.2, 0, 2.4, 1.8, VH[3], VH[1], 14);
    _r3Box(m, _L * 0.30, 4.6, 0, _big ? 7 : 5, 1.1, 1.1, GN[0], GN[2]);
    if (_big) {
      _r3Cyl(m, -_L * 0.34, 4.2, 0, 2.4, 1.8, VH[3], VH[1], 14);
      _r3Box(m, -_L * 0.48, 4.6, 0, 6, 1.1, 1.1, GN[0], GN[2]);
    }
    _r3Box(m, _L * 0.02, 5.6, 0, 1.0, 1.0, _Wd * 0.9, DK[0], DK[0]);     /* rail */

    /* A WARSHIP IS RIGGED, and these were bare hulls with a box and a funnel: at 198 triangles
       the Cruiser - the most expensive thing the player can float - carried less shape than a
       Ranger. What a hull shows this camera is its DECK, so the additions live there: a lattice
       mast with a radar bar (the tallest thing aboard, and the first thing that reads as
       "warship" from above), bridge glass, bollard pairs at bow and stern, and boats in davits
       along the big hulls' sides - the classic white pips that break a grey deck line. */
    _r3Box(m, -_L * 0.14, 7.0, 0, 0.9, 6.0, 0.9, S[1], S[0]);            /* mast */
    _r3Box(m, -_L * 0.14, 12.6, 0, 0.7, 0.9, _Wd * 0.52, S[2], S[3]);    /* radar bar */
    _r3Box(m, _L * 0.045, 6.2, 0, 1.2, 1.6, _Wd * 0.5, RTS_PAL.glass, RTS_PAL.glass);
    for (var _bl = -1; _bl <= 1; _bl += 2) {
      _r3Box(m, _L * 0.42, 4.0, _bl * _Wd * 0.22, 1.0, 1.1, 1.0, DK[0], DK[2]);
      _r3Box(m, -_L * 0.44, 4.0, _bl * _Wd * 0.22, 1.0, 1.1, 1.0, DK[0], DK[2]);
    }
    if (_big) {
      for (var _dv = -1; _dv <= 1; _dv += 2) {                            /* boats in davits */
        _r3Box(m, -_L * 0.20, 4.6, _dv * _Wd * 0.42, 4.6, 1.3, 1.6, GN[0], GN[2]);
        _r3Box(m, _L * 0.06, 4.6, _dv * _Wd * 0.42, 4.6, 1.3, 1.6, GN[0], GN[2]);
      }
      _r3Box(m, -_L * 0.46, 4.4, 0, 2.6, 1.2, _Wd * 0.5, DK[1], DK[3]);  /* depth-charge rack */
      for (var _dc = 0; _dc < 3; _dc++)
        _r3Cyl(m, -_L * 0.46, 5.4, (_dc - 1) * _Wd * 0.17, 0.7, 1.3, DK[2], DK[0], 8);
    }
    if (_cru) {
      /* THE CRUISER'S OWN TELL: twin barrels in BOTH mounts - it is the shore-bombardment
         ship and its guns are its identity - plus a second funnel and a higher bridge tier,
         so it out-silhouettes the Destroyer instead of just out-measuring it. */
      _r3Box(m, _L * 0.30, 4.6, -1.4, 7, 1.1, 1.1, GN[0], GN[2]);
      _r3Box(m, _L * 0.30, 4.6, 1.4, 7, 1.1, 1.1, GN[0], GN[2]);
      _r3Box(m, -_L * 0.48, 4.6, -1.4, 6, 1.1, 1.1, GN[0], GN[2]);
      _r3Box(m, -_L * 0.48, 4.6, 1.4, 6, 1.1, 1.1, GN[0], GN[2]);
      _r3Cyl(m, -_L * 0.26, 7.2, 0, 1.5, 3.8, DK[1], DK[0], 14);         /* second funnel */
      _r3Box(m, -_L * 0.02, 8.6, 0, _L * 0.16, 1.8, _Wd * 0.4, VH[1], VH[3]);
    }

  } else if (key === 'sub' || key === 'missilesub') {
    /* SUBMARINES. Almost nothing above the surface, which is the point: a low dark shape with
       a conning tower is instantly not a surface ship, and that difference has to be legible
       because the two behave completely differently - one can shell the shore and the other
       cannot touch it. */
    var _ms = (key === 'missilesub');
    _r3Slab(m, 0, 0.4, 0, 22, 2.6, 5.6, 2.2, DK[1], DK[2]);              /* hull, rounded */
    _r3Box(m, 9.2, 0.6, 0, 3.4, 2.0, 3.0, DK[0], DK[2]);                 /* nose */
    _r3Box(m, -9.6, 0.6, 0, 3.0, 1.8, 2.6, DK[0], DK[2]);                /* stern */
    _r3Slab(m, 0.5, 3.0, 0, 6.0, 3.4, 3.0, 1.0, DK[0], DK[1]);           /* conning tower */
    _r3Box(m, 0.5, 6.4, 0, 2.6, 1.0, 2.2, TM[1], TM[3]);                 /* team cap */
    _r3Box(m, 0.5, 7.4, 0, 0.7, 3.0, 0.7, GN[2], GN[0]);                 /* periscope */
    _r3Box(m, 2.6, 4.2, 0, 3.4, 0.8, 5.4, DK[2], DK[2]);                 /* dive planes */
    if (_ms) {                                                            /* missile hatches */
      _r3Box(m, -3.6, 3.1, -1.3, 5.0, 0.9, 1.5, RTS_PAL.hazard[0], DK[2]);
      _r3Box(m, -3.6, 3.1, 1.3, 5.0, 0.9, 1.5, RTS_PAL.hazard[0], DK[2]);
    }
    /* The stern says "boat" rather than "log": a rudder fin, stern planes, and a shrouded
       screw. Flooding ports pock the casing sides - the one texture a submarine hull has. */
    _r3Box(m, -11.4, 1.2, 0, 1.0, 3.4, 0.9, DK[0], DK[2]);               /* rudder */
    _r3Box(m, -10.6, 1.0, 0, 2.4, 0.7, 4.6, DK[2], DK[2]);               /* stern planes */
    _r3Cyl(m, -11.8, 0.4, 0, 1.2, 1.0, DK[2], DK[0], 10);                /* screw shroud */
    for (var _fp = 0; _fp < 4; _fp++) {
      _r3Box(m, -4 + _fp * 3.0, 1.7, -2.9, 1.5, 0.6, 0.4, DK[0], DK[0]);
      _r3Box(m, -4 + _fp * 3.0, 1.7, 2.9, 1.5, 0.6, 0.4, DK[0], DK[0]);
    }

  } else if (key === 'lst') {
    /* THE LANDING CRAFT, and the whole job of the model is to say "not a warship" at a glance,
       because it is the one hull on the water that must never be mistaken for something that
       shoots back. Everything the gunboat has, this deliberately does not: no funnel, no
       superstructure amidships, no gun anywhere.

       What it has instead is the silhouette of a ferry seen from above - a BROAD flat deck
       taking up most of the length, a blunt square bow rather than a raked one, a bow ramp
       laid down over it, and a small wheelhouse pushed right to the stern. The deck is the
       read: wide, empty and pale against the sea, where every other hull is narrow and dark. */
    var _dL = 24, _dW = 12.5;
    _r3Box(m, 0, 0.5, 0, _dL, 3.0, _dW, VH[0], VH[1]);                   /* hull */
    _r3Box(m, 0, 3.5, 0, _dL * 0.86, 0.9, _dW * 0.80, DK[2], DK[1]);     /* the cargo deck */
    /* Deck rails down both sides - what stops the deck reading as an empty grey rectangle. */
    _r3Box(m, -1.0, 4.6, -_dW * 0.44, _dL * 0.70, 2.2, 1.1, VH[2], VH[1]);
    _r3Box(m, -1.0, 4.6, _dW * 0.44, _dL * 0.70, 2.2, 1.1, VH[2], VH[1]);
    /* The bow ramp, down and forward: the tell that things drive off the front of it. */
    _r3Box(m, _dL * 0.46, 1.2, 0, _dL * 0.20, 2.2, _dW * 0.62, GN[1], GN[3]);
    _r3Box(m, _dL * 0.60, 0.5, 0, _dL * 0.14, 1.0, _dW * 0.56, GN[2], GN[0]);
    for (i = 0; i < 3; i++)                                              /* ramp ribs */
      _r3Box(m, _dL * 0.40 + i * 2.2, 2.6, 0, 1.0, 0.8, _dW * 0.56, DK[1], DK[3]);
    /* Wheelhouse right aft, small and off nothing - the only thing standing up on the boat. */
    _r3Box(m, -_dL * 0.40, 3.6, 0, _dL * 0.16, 4.6, _dW * 0.42, VH[2], VH[0]);
    _r3Box(m, -_dL * 0.40, 8.2, 0, _dL * 0.12, 1.3, _dW * 0.30, TM[1], TM[3]);  /* team cap */
    _r3Box(m, -_dL * 0.33, 6.4, 0, 1.0, 2.0, _dW * 0.34, RTS_PAL.glass, RTS_PAL.glass);
    /* Mooring bitts at the corners and a stern anchor davit - ON THE GUNWALES, never the deck:
       the wide empty deck IS this model's identity and stays clear. */
    for (i = 0; i < 4; i++)
      _r3Box(m, (i < 2 ? 1 : -1) * _dL * 0.34, 3.8, (i % 2 ? 1 : -1) * _dW * 0.44,
             1.1, 1.4, 1.1, DK[0], DK[2]);
    _r3Box(m, -_dL * 0.47, 4.2, _dW * 0.28, 1.0, 2.6, 1.0, S[1], S[0]);
    _r3Box(m, -_dL * 0.47, 6.6, _dW * 0.36, 1.0, 0.8, 2.6, S[2], S[1]);

  } else if (key === 'apc') {
    /* A closed box on tracks with a rear ramp and a small cupola gun - no turret (UDATA.CPP
       has IsTurretEquipped false), so the read is "a tank with no gun on top", which is
       exactly what it is. The ramp is the tell that it carries something. */
    tracks(17, 6.0, 5, 2.3);
    _r3Slab(m, 0, 3.2, 0, 16.5, 7.5, 10.5, 1.2, VH[0], VH[1]);     /* the box */
    _r3Box(m, 0, 10.7, 0, 14.5, 1.2, 9.0, VH[3], VH[3]);           /* roof */
    _r3Box(m, 0, 11.9, 0, 6, 1.2, 4, TM[1], TM[3]);                /* team cap */
    _r3Box(m, 7.4, 3.2, 0, 3.0, 6.6, 9.0, VH[1], VH[3]);           /* sloped nose */
    _r3Box(m, 9.6, 6.6, 0, 1.4, 2.6, 6.4, RTS_PAL.glass, RTS_PAL.glass);
    _r3Box(m, -8.6, 1.4, 0, 3.2, 6.0, 8.0, DK[2], DK[0]);          /* the rear ramp */
    for (i = 0; i < 3; i++)                                        /* ramp ribs */
      _r3Box(m, -9.4, 2.0 + i * 1.8, 0, 1.2, 0.9, 7.4, GN[2], GN[1]);
    _r3Cyl(m, 2.0, 10.7, -2.4, 2.4, 2.4, VH[2], VH[3], 14);        /* cupola */
    /* The gun is the one thing separating this box from the MCV's box at a glance, so it is
       longer and darker than the little pintle it started as. */
    _r3Box(m, 8.0, 11.4, -2.4, 10.0, 1.3, 1.3, DK[1], DK[3]);      /* its gun */
    _r3Box(m, 12.6, 11.3, -2.4, 1.6, 1.6, 1.6, GN[0], GN[3]);      /* muzzle */
    /* Smoke launchers on the nose corners, headlights, and an exhaust on the flank - the
       fittings a battle taxi carries. */
    for (i = 0; i < 3; i++) {
      _r3Cyl(m, 8.6, 8.6, -3.6 + i * 0.9, 0.5, 1.5, DK[0], DK[2], 8);
      _r3Cyl(m, 8.6, 8.6, 2.0 + i * 0.9, 0.5, 1.5, DK[0], DK[2], 8);
    }
    _r3Box(m, 9.2, 4.6, -3.4, 1.0, 1.2, 1.6, GN[3], GN[3]);        /* headlights */
    _r3Box(m, 9.2, 4.6, 3.4, 1.0, 1.2, 1.6, GN[3], GN[3]);
    _r3Box(m, -6.0, 9.2, 5.0, 4.6, 1.3, 1.2, DK[1], DK[2]);        /* exhaust */

  } else if (key === 'mcv') {
    /* A slab-sided transporter with the yard's gantry folded flat along its back - IsGigundo
       in UDATA.CPP, so it is the biggest thing on wheels, and it carries no gun at all. The
       folded arm is the read: it is the only vehicle with a lattice lying on top of it. */
    tracks(22, 7.4, 6, 2.8);
    _r3Slab(m, -2, 4.2, 0, 24, 8.5, 13.0, 1.3, VH[0], VH[1]);      /* the body */
    for (i = 0; i < 4; i++)                                        /* side ribs */
      _r3Box(m, -11 + i * 6.0, 4.2, 0, 1.2, 8.2, 13.5, VH[2], VH[1]);
    _r3Box(m, -2, 12.7, 0, 22, 1.2, 11.0, VH[3], VH[3]);           /* roof deck */
    _r3Box(m, -2, 13.9, 0, 8, 1.4, 4, TM[1], TM[3]);               /* team cap */
    /* the folded gantry: two rails and their cross-bracing, lying along the deck */
    _r3Box(m, -1, 13.9, -3.4, 20, 1.6, 1.6, GN[1], GN[3]);
    _r3Box(m, -1, 13.9, 3.4, 20, 1.6, 1.6, GN[1], GN[3]);
    for (i = 0; i < 4; i++)
      _r3Box(m, -8 + i * 5.4, 14.1, 0, 1.2, 1.0, 6.4, GN[2], GN[0]);
    _r3Slab(m, 11.5, 4.2, 0, 7, 9.0, 11.0, 1.0, VH[1], VH[3]);     /* cab */
    _r3Box(m, 14.6, 7.6, 0, 1.6, 3.2, 8.0, RTS_PAL.glass, RTS_PAL.glass);
    _r3Cyl(m, 8.0, 13.2, -4.2, 1.0, 3.4, DK[1], DK[3], 10);        /* stack */
    _r3Box(m, -13.8, 2.0, 0, 3.0, 3.0, 10.0, GN[2], GN[1]);        /* rear jack beam */
    /* Site kit: hazard beacons on the cab, toolboxes along the skirt, a second stack -
       a construction vehicle reads by its fittings, and this one had only the gantry. */
    _r3Cyl(m, 13.0, 13.8, -3.4, 0.8, 1.5, RTS_PAL.hazard[0], RTS_PAL.hazard[1], 8);
    _r3Cyl(m, 13.0, 13.8, 3.4, 0.8, 1.5, RTS_PAL.hazard[0], RTS_PAL.hazard[1], 8);
    _r3Box(m, 0, 2.6, -7.0, 5.0, 2.4, 1.3, S[2], S[1]);            /* toolboxes */
    _r3Box(m, -7.0, 2.6, 7.0, 5.0, 2.4, 1.3, S[2], S[1]);
    _r3Cyl(m, 5.4, 13.2, -4.2, 1.0, 2.8, DK[1], DK[3], 10);        /* second stack */

  } else if (key === 'harvester') {
    /* The only gold on the board that moves. The heaped ore is the identity and it sits on the
       highest surface, which under this camera is most of what you see of it. */
    tracks(23, 7.8, 6, 2.9);
    _r3Slab(m, -4.5, 5.0, 0, 16, 7.5, 13.5, 1.2, VH[2], VH[0]);    /* hopper */
    for (i = 0; i < 3; i++)                                        /* ribs down the hopper */
      _r3Box(m, -10 + i * 5.5, 5.0, 0, 1.2, 7.2, 14.0, S[2], S[1]);
    _r3Box(m, -4.5, 12.4, 0, 13, 1.0, 10.5, O[0], O[2]);           /* ore heaped in it */
    _r3Box(m, -4.5, 12.9, -1.5, 8, 0.8, 5.0, O[1], O[2]);
    _r3Slab(m, 8.0, 5.0, 0, 8, 7.5, 11.5, 1.0, VH[0], VH[1]);      /* cab */
    _r3Box(m, 11.6, 8.0, 0, 1.6, 3.4, 8.4, RTS_PAL.glass, RTS_PAL.glass);
    _r3Box(m, 8.0, 12.6, 0, 6.5, 0.9, 9.5, TM[1], TM[3]);          /* cab roof */
    _r3Box(m, 14.5, 0.8, 0, 4.5, 2.6, 15.5, DK[1], DK[3]);         /* intake blade */
    for (i = 0; i < 5; i++)                                        /* cutter teeth */
      _r3Box(m, 16.6, 0.8, -6 + i * 3, 1.6, 2.0, 1.4, S[1], S[0]);
    /* Working plant: hydraulic rams down to the blade, an exhaust stack, a beacon on the cab
       and rungs up the hopper - the fittings that say "mining machine" instead of "van". */
    _r3Box(m, 12.6, 3.2, -4.6, 4.6, 1.4, 1.4, S[1], S[3]);         /* rams to the blade */
    _r3Box(m, 12.6, 3.2, 4.6, 4.6, 1.4, 1.4, S[1], S[3]);
    _r3Cyl(m, 4.6, 12.9, -4.0, 1.0, 3.2, DK[1], DK[3], 10);        /* stack */
    _r3Cyl(m, 10.4, 13.5, 3.2, 0.8, 1.4, RTS_PAL.hazard[0], RTS_PAL.hazard[1], 8);
    for (i = 0; i < 3; i++)
      _r3Box(m, 3.4, 2.4 + i * 2.6, -7.2, 2.2, 0.7, 0.7, GN[2], GN[1]);
  } else return false;
  return true;
}
