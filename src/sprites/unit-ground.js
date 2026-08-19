/* sprites/unit-ground.js - infantry and the tracked and wheeled ground vehicles.
   One arm of the unit model chain; see sprites/unitmodels.js for the dispatch and for the
   shared locals, which come in through X so that each model line reads exactly as it did when
   they were all one function. Returns false for a key it does not own, so the next arm can try.

   Split because unitmodels.js reached 506 lines the moment the V2 Rocket Launcher was given a
   model of its own, and unit/layout holds every source file to 500. Same shape the building
   models already use (bld-base / bld-tech / bld-war / bld-super). */
function _sprUnitGround(X, key) {
  var m = X.m, TM = X.TM, VH = X.VH, S = X.S, DK = X.DK, O = X.O, C = X.C, GN = X.GN,
      d = X.d, prone = X.prone, part = X.part, side = X.side, tracks = X.tracks, i;
  if (key === 'dog') {
    /* ONE animal, not two. A kennel turns out a single dog, and the pair that used to be drawn
       here read as a squad - which is also why it shared its silhouette with every infantry
       unit on the board. The identity is the AXIS: a dog is long and low where every man is
       short and tall, so the body runs along +x at knee height and nothing rises above the
       head. It is also the only unit not wearing the team colour - just a collar - because a
       tan animal against eight uniformed men is a difference you can see at eight pixels. */
    var FUR = '#9c8459', FURL = '#b8a077';
    for (i = 0; i < 4; i++)                                                  /* four legs */
      _r3Box(m, i < 2 ? -1.9 : 2.3, 0, (i % 2) ? 1.3 : -1.3, 1.1, 2.4, 1.0, DK[1], DK[2]);
    _r3Box(m, 0.2, 2.2, 0, 7.6, 2.4, 2.7, FUR, FURL);                        /* body along +x */
    _r3Box(m, 2.6, 2.2, 0, 1.1, 2.6, 3.0, TM[1], TM[3]);                     /* collar */
    _r3Box(m, 4.4, 2.8, 0, 2.6, 2.3, 2.1, FUR, FURL);                        /* head */
    _r3Box(m, 5.9, 2.9, 0, 1.5, 1.2, 1.5, DK[0], DK[1]);                     /* muzzle */
    _r3Box(m, 3.9, 5.1, -0.7, 0.8, 1.3, 0.7, FUR, FURL);                     /* ears */
    _r3Box(m, 3.9, 5.1, 0.7, 0.8, 1.3, 0.7, FUR, FURL);
    _r3Box(m, -3.6, 3.8, 0, 2.8, 0.9, 0.9, FUR, FURL);                       /* tail */

  } else if (d.kind === 'infantry') {
    /* Two figures offset from each other so a squad does not read as one lump; +x is the nose.
       Hero units are ONE figure - a Commando drawn as a pair reads as two Commandos, which is
       exactly the wrong signal for a unit limited to one at a time.

       Prone is a genuinely different silhouette, low and long and facing forward, because that
       is the only way the player can tell at a glance that a squad is pinned. */
    var kit = RTS_INF_KIT[key] || RTS_INF_KIT.rifle;
    /* The helmet's SIDES stay the team colour on every kit and only its top carries the unit's
       marker. That keeps ownership readable on a squad of medics or engineers, whose uniforms
       have no team colour left in them at all, without letting the team colour compete with the
       marker for the one surface the camera actually sees. */
    var BD = kit.body ? kit.body[0] : TM[0], BL = kit.body ? kit.body[1] : TM[1];
    var HD = TM[2], HL = kit.top || TM[3];
    var SK = '#c8a882', SKL = '#d8bc96';
    /* THE PAIR IS OFFSET OFF THE FACING GRID, and that angle is load-bearing. The two men used
       to sit on a ~48 degree diagonal, and infantry bake at EIGHT facings 45 degrees apart - so
       twice per rotation the separation ran almost exactly along the view, the rear man hid
       behind the front one, and a squad read as a single column instead of as two soldiers.
       Sitting the separation at 22.5 degrees puts it exactly BETWEEN two facings, so it is
       never parallel to the view and every facing shows two figures.

       CHECKED BY EYE, and that is deliberate rather than lazy. The obvious number - how wide the
       sprite draws - was tried first and is the wrong instrument: it measures HORIZONTAL extent
       only, so at the facings where the pair separates vertically on screen it reports a narrow
       sprite whether the two men are cleanly stacked or completely merged. It read 12 px at the
       two broken facings and 14 px at the two fixed ones, which looks like no improvement and
       is not what happened. Widening the separation moved the maximum and never the minimum,
       which is the signature of measuring the wrong axis. Two helmets and a gap between them is
       the actual question, and it is answered by looking. */
    var men = (key === 'tanya') ? [[0, 0]] : [[3.6, -1.5], [-3.6, 1.5]];
    for (i = 0; i < men.length; i++) {
      var mx = men[i][0], mz = men[i][1];
      if (prone) {
        _r3Box(m, mx - 1, 0, mz, 7, 2, 2.6, BD, BL);               /* body, lying down */
        _r3Box(m, mx + 2.6, 0, mz, 2.4, 2, 2.4, SK, SKL);
        _r3Box(m, mx + 2.4, 1.9, mz, 2.6, 0.8, 2.6, HD, HL);       /* helmet, still readable */
        _r3Box(m, mx + 5, 0.6, mz, 5, 1, 1, kit.prop, kit.prop);   /* weapon, braced */
        continue;
      }
      /* Four stacked shapes of different widths - legs, a torso, a head, a helmet with a brim.
         The torso and the helmet top carry the unit's colour and are what actually identifies
         it; the props below are secondary. */
      /* A STRIDE, NOT TWO IDENTICAL POSTS. The legs used to sit level beside each other, which
         is a tripod rather than a person, and the two men in a squad struck the same pose. One
         leg forward and the other back - mirrored between the two figures - reads as walking at
         a glance and stops a squad looking like a single object with several bases.

         Everything added to this figure is here because of RTS_PS. At RA's resolution a limb
         is under an art pixel wide and a stride of half a unit lands inside one, so none of it
         survived the bake and the model was authored without it: legs, torso, head, helmet,
         prop, and the kit note above conceding that "a rifleman and a medic are the same stack
         of boxes and no amount of modelling changes that". That was true at 22 art pixels. It
         is not true at twice the bake resolution, which is where these pixels come from. */
      var _st = (i % 2) ? -0.55 : 0.55;
      _r3Box(m, mx + _st, 0, mz - 0.9, 1.7, 2.6, 1.4, DK[1], DK[2]);   /* leading leg */
      _r3Box(m, mx - _st, 0, mz + 0.9, 1.7, 2.6, 1.4, DK[1], DK[2]);   /* trailing leg */
      _r3Box(m, mx + _st, 0, mz - 0.9, 1.9, 0.7, 1.6, DK[2], DK[0]);   /* boots, grounding it */
      _r3Box(m, mx - _st, 0, mz + 0.9, 1.9, 0.7, 1.6, DK[2], DK[0]);
      _r3Box(m, mx, 2.4, mz, 3.6, 3.7, 3.6, BD, BL);               /* torso - the colour block */
      /* ARMS. The torso was a bare block, and a block with a head on it is a bollard. They take
         the body colour rather than a contrasting one on purpose: the torso is the unit's
         identity surface and an arm in another tone would compete with it. What they add is
         SHAPE - two more planes at two more angles down each side, which the shading pass turns
         into a pair of edges the silhouette did not have. */
      _r3Box(m, mx - 0.2, 2.8, mz - 2.2, 1.3, 3.0, 1.2, BD, BL);
      _r3Box(m, mx - 0.2, 2.8, mz + 2.2, 1.3, 3.0, 1.2, BD, BL);
      /* A pack, which is also the only thing on a soldier the camera looks straight down at
         besides the helmet - so it is a second surface to break the torso's flat top. */
      _r3Box(m, mx - 1.9, 3.2, mz, 1.6, 2.6, 2.8, DK[1], DK[0]);
      _r3Box(m, mx, 6.1, mz, 2.2, 1.4, 2.2, SK, SKL);              /* head */
      _r3Box(m, mx - 0.3, 7.1, mz, 3.4, 1.1, 3.4, HD, HL);         /* helmet - the marker */
      if (key === 'rocket') {
        /* One fat tube carried across the shoulders, long enough to stand proud at BOTH ends.
           The old one pointed forward only and vanished at the facings where forward was
           toward the camera; a bar that overhangs both sides survives every facing. */
        _r3Box(m, mx + 0.4, 5.6, mz - 1.3, 10.5, 2.2, 2.2, S[1], S[3]);
        _r3Box(m, mx - 4.6, 5.6, mz - 1.3, 1.6, 2.6, 2.6, DK[0], DK[2]);   /* blast end */
      } else if (key === 'flame') {
        /* Two bright tanks rising ABOVE the helmet, so from any angle a flame squad is a pair
           of hot pips over a dark figure - the opposite read to the rocket squad's long bar,
           which is the pair most easily confused. */
        _r3Cyl(m, mx - 2.4, 3.0, mz - 1.1, 1.1, 5.6, kit.prop, '#f7c93a', 10);
        _r3Cyl(m, mx - 2.4, 3.0, mz + 1.1, 1.1, 5.6, kit.prop, '#f7c93a', 10);
        _r3Box(m, mx + 3.0, 4.6, mz - 0.5, 4.4, 1.3, 1.3, DK[1], DK[3]);   /* wand */
      } else if (key === 'engineer') {
        /* No weapon at all and a toolbox in one hand. Losing one to a stray shell is losing
           500 credits, so it has to be pickable out of a mixed squad without stopping. */
        _r3Box(m, mx + 2.2, 2.2, mz - 1.4, 2.6, 2.0, 1.8, kit.prop, S[1]);
      } else if (key === 'medic') {
        /* The only white in the game, and a red cross laid flat on top of the pack where the
           camera can actually see it. */
        _r3Box(m, mx - 1.6, 5.6, mz, 1.0, 0.7, 3.0, kit.prop, kit.prop);
        _r3Box(m, mx - 1.6, 5.6, mz, 3.0, 0.7, 1.0, kit.prop, kit.prop);
      } else if (key === 'thief') {
        _r3Box(m, mx + 1.9, 2.6, mz + 1.6, 2.6, 2.2, 1.5, kit.prop, S[1]);  /* satchel */
      } else if (key === 'tanya') {
        _r3Box(m, mx + 2.3, 4.4, mz - 1.0, 2.8, 0.9, 0.9, kit.prop, DK[3]); /* pistols */
        _r3Box(m, mx + 2.3, 4.4, mz + 1.0, 2.8, 0.9, 0.9, kit.prop, DK[3]);
      } else if (key === 'grenadier') {
        /* Arm cocked back with a charge in it - a rearward line where the rifleman's is
           forward, so a mixed squad is not a smear. */
        _r3Box(m, mx - 1.8, 6.4, mz - 1.2, 2.8, 1.1, 1.1, BD, BL);
        _r3Cyl(m, mx - 2.9, 7.2, mz - 1.2, 0.9, 1.4, kit.prop, '#f0bd58', 8);
      } else {
        _r3Box(m, mx + 2.6, 4.4, mz - 0.5, 5.4, 1.0, 1.0, kit.prop, DK[3]); /* rifle */
      }
    }

  } else if (key === 'tank') {
    /* UNIT.CPP keeps PrimaryFacing (hull) and SecondaryFacing (turret) as separate values and
       draws them as separate shapes. So the turret is baked on its own, pivoting about the
       model origin - which is what lets a tank drive one way while its gun tracks another.
       `part` selects which half to build. */
    if (part !== 'turret') {
      tracks(20, 6.4, 5, 2.4);
      /* Lower hull, then a sloped deck over it. The taper is what stops the front reading as
         one flat rectangle - it splits the nose into two shading bands. The deck is the team
         colour; everything else is the khaki body. */
      _r3Slab(m, 0, 3.4, 0, 18, 3.6, 10.5, 1.1, VH[0], VH[1]);
      _r3Hip(m, -1, 7.0, 0, 17, 1.9, 10.5, 2.6, VH[3]);
      _r3Box(m, 7.6, 3.4, 0, 3.2, 3.4, 9.4, VH[1], VH[3]);         /* glacis plate */
      _r3Box(m, -7.4, 5.0, 3.2, 3.4, 2.0, 3.0, S[2], S[1]);        /* stowage box */
      /* Fittings that read from above: headlights at the glacis corners, an exhaust on the
         rear deck, jerrycans on the far fender balancing the stowage box. */
      _r3Box(m, 9.0, 5.6, -3.6, 1.0, 1.1, 1.8, GN[3], GN[3]);
      _r3Box(m, 9.0, 5.6, 3.6, 1.0, 1.1, 1.8, GN[3], GN[3]);
      _r3Box(m, -8.2, 7.4, -1.8, 2.6, 1.2, 1.4, DK[1], DK[2]);     /* exhaust */
      _r3Box(m, -7.4, 5.0, -3.4, 1.6, 2.2, 2.6, RTS_PAL.hazard[1] || S[0], S[1]);
    }
    if (part !== 'hull') {
      /* One heavy barrel with a muzzle brake, on a tapered housing. The Light Tank's is thin
         and short and the Mammoth's is doubled, so barrel count and thickness are the whole
         difference between the three at a glance.

         The gun sits LOW on the turret and reaches well past the track guards, and that is a
         projection fix rather than a styling choice. Screen height is z - 1.3y, so a barrel
         swung toward the camera gains z and loses it again to its own height: the old one, high
         on the turret and stopping short, cancelled out exactly and disappeared into the hull
         at three of the eight facings. Low and long, the z wins and the muzzle clears the hull
         at every facing. */
      _r3Slab(m, -0.6, 8.0, 0, 10.5, 3.4, 9.0, 1.0, VH[1], VH[3]);
      _r3Hip(m, -0.6, 11.4, 0, 9.5, 1.4, 8.2, 2.0, TM[1]);         /* turret roof - team */
      _r3Box(m, 5.0, 8.4, 0, 3.0, 2.6, 4.2, DK[1], DK[3]);         /* mantlet */
      _r3Box(m, 12.0, 8.8, 0, 12.0, 2.1, 2.1, DK[1], DK[3]);       /* barrel, along +x */
      _r3Box(m, 19.2, 8.6, 0, 2.8, 2.8, 2.8, GN[0], GN[3]);        /* muzzle brake, pale */
      _r3Box(m, -4.6, 12.8, -2.6, 0.6, 4.5, 0.6, DK[1], DK[3]);    /* aerial */
      _r3Cyl(m, -2.4, 12.8, 2.4, 1.6, 1.1, VH[2], VH[3], 12);      /* commander's cupola */
      _r3Box(m, -0.6, 13.0, 2.4, 2.8, 0.6, 0.6, DK[1], DK[3]);     /* its MG */
    }

  } else if (key === 'light') {
    /* The Battle Tank at three-quarters, with a small one-piece turret, a thin stub barrel and
       none of its clutter - no stowage, no aerial, no muzzle brake. It has to read as "the
       cheap one" before the player counts pixels. */
    if (part !== 'turret') {
      tracks(16, 5.2, 4, 2.0);
      _r3Slab(m, 0, 2.9, 0, 14.5, 3.0, 8.6, 1.0, VH[0], VH[1]);
      _r3Hip(m, -0.8, 5.9, 0, 13.5, 1.6, 8.6, 2.2, VH[3]);         /* deck */
      _r3Box(m, 6.2, 2.9, 0, 2.6, 2.8, 7.6, VH[1], VH[3]);         /* glacis */
      /* Headlights and an exhaust, and deliberately NOTHING more: no stowage and no clutter
         is this model's identity - it must read as the cheap one at a glance. */
      _r3Box(m, 7.4, 4.6, -3.0, 0.9, 1.0, 1.5, GN[3], GN[3]);
      _r3Box(m, 7.4, 4.6, 3.0, 0.9, 1.0, 1.5, GN[3], GN[3]);
      _r3Box(m, -7.2, 6.4, -1.6, 2.2, 1.0, 1.2, DK[1], DK[2]);
    }
    if (part !== 'hull') {
      _r3Slab(m, -0.5, 6.9, 0, 7.6, 2.8, 6.6, 0.9, VH[1], TM[1]);  /* turret, team roof */
      _r3Box(m, 3.8, 7.3, 0, 2.0, 1.9, 3.0, DK[1], DK[3]);         /* mantlet */
      _r3Box(m, 9.6, 7.6, 0, 9.5, 1.2, 1.2, DK[1], DK[3]);         /* barrel - thin, long */
      _r3Box(m, 14.8, 7.5, 0, 1.6, 1.6, 1.6, GN[0], GN[3]);        /* muzzle */
    }

  } else if (key === 'heavy') {
    /* Wider tracks, a longer hull, and TWO barrels set well apart - the fastest way to say
       "this is the expensive one" without any text. The old pair sat close enough together to
       merge into one bar at the diagonal facings, so they are spread to either side of the
       mantlet where the gap survives the projection. */
    if (part !== 'turret') {
      tracks(23, 7.6, 6, 2.9);
      _r3Slab(m, 0, 4.2, 0, 21, 4.4, 12.5, 1.3, VH[0], VH[1]);
      _r3Hip(m, -1, 8.6, 0, 20, 2.2, 12.5, 3.0, VH[3]);            /* deck */
      _r3Box(m, 9.0, 4.2, 0, 3.6, 4.2, 11.0, VH[1], VH[3]);        /* glacis */
      _r3Box(m, -8.5, 6.2, 4.0, 4.0, 2.6, 3.4, S[2], S[1]);        /* stowage */
      _r3Box(m, 10.6, 6.8, -4.4, 1.1, 1.2, 2.0, GN[3], GN[3]);     /* headlights */
      _r3Box(m, 10.6, 6.8, 4.4, 1.1, 1.2, 2.0, GN[3], GN[3]);
      _r3Box(m, -9.6, 8.9, -2.2, 3.0, 1.3, 1.5, DK[1], DK[2]);     /* twin exhausts */
      _r3Box(m, -9.6, 8.9, 2.2, 3.0, 1.3, 1.5, DK[1], DK[2]);
    }
    if (part !== 'hull') {
      _r3Slab(m, -0.6, 10.0, 0, 12.5, 4.2, 11.0, 1.2, VH[1], VH[3]);   /* turret */
      _r3Hip(m, -0.6, 14.2, 0, 11.5, 1.6, 10.0, 2.4, TM[1]);       /* turret roof - team */
      _r3Box(m, 6.0, 10.6, 0, 3.4, 3.0, 7.8, DK[1], DK[3]);        /* mantlet, spanning both */
      _r3Box(m, 13.6, 10.9, -3.2, 12.0, 2.0, 2.0, DK[1], DK[3]);   /* twin barrels, spread */
      _r3Box(m, 13.6, 10.9, 3.2, 12.0, 2.0, 2.0, DK[1], DK[3]);
      _r3Box(m, 20.6, 10.8, -3.2, 2.4, 2.4, 2.4, GN[0], GN[3]);    /* pale muzzles */
      _r3Box(m, 20.6, 10.8, 3.2, 2.4, 2.4, 2.4, GN[0], GN[3]);
      _r3Box(m, -5.4, 15.8, -3.0, 0.6, 5.0, 0.6, DK[1], DK[3]);    /* aerial */
      /* THE TUSKS. The Mammoth's other weapon is the missile rack on each turret flank, and
         it is also the strongest identity feature the reference gives this silhouette - a
         boxy pod outboard of each barrel, with pale tips showing in the muzzle direction. */
      for (var _hp = -1; _hp <= 1; _hp += 2) {
        _r3Box(m, -3.2, 11.6, _hp * 6.6, 5.2, 2.6, 2.6, VH[2], VH[1]);
        _r3Box(m, -0.4, 11.8, _hp * 6.6, 1.0, 1.8, 1.8, GN[0], GN[3]);
      }
      _r3Cyl(m, -3.2, 15.8, 2.6, 1.7, 1.1, VH[2], TM[1], 12);      /* cupola */
    }

  } else if (key === 'arty') {
    /* The one unit whose identity is a single part, and the one that was broken worst: a long
       tube lying along +x disappears completely at the facings where +x points toward the
       camera, because the oblique projection folds it straight into the hull. Three of the
       eight facings had no gun at all.

       The fix is not a longer tube, it is a HIGHER one, in a colour the hull does not use. The
       tube is carried on a visible pedestal well above a deliberately squat chassis and painted
       pale steel, and depth is y + 1.3z, so at the facings where it lies over the hull it draws
       ON TOP of it as a bright bar rather than being swallowed. The splayed recoil spades at
       the back are the second signal and never move. */
    tracks(16, 5.4, 5, 2.1);
    _r3Slab(m, -1, 2.9, 0, 14.5, 2.6, 9.0, 1.0, VH[0], VH[1]);     /* squat chassis */
    _r3Box(m, -6.6, 2.9, 0, 3.4, 2.4, 8.0, VH[2], TM[1]);          /* engine deck - team cap */
    _r3Slab(m, 0.5, 5.5, 0, 6.6, 3.4, 6.6, 1.0, GN[2], GN[1]);     /* pedestal / trunnion */
    _r3Box(m, 4.5, 8.0, 0, 19.0, 2.8, 2.8, GN[1], GN[3]);          /* the tube - pale, long */
    _r3Box(m, 15.4, 7.9, 0, 3.0, 3.0, 3.0, GN[0], GN[3]);          /* muzzle */
    _r3Box(m, -3.6, 8.2, 0, 4.0, 2.4, 4.6, DK[1], DK[3]);          /* breech */
    _r3Box(m, -9.0, 0.9, -3.4, 5.2, 1.3, 1.8, S[1], S[0]);         /* recoil spades, splayed */
    _r3Box(m, -9.0, 0.9, 3.4, 5.2, 1.3, 1.8, S[1], S[0]);
    /* A ready rack of shells on the chassis flank and the travel lock the tube rests in -
       a gun carriage carries its ammunition where the crew can reach it. */
    for (i = 0; i < 3; i++)
      _r3Cyl(m, -3.4 + i * 2.2, 4.2, -3.9, 0.8, 2.4, GN[1], GN[0], 8);
    _r3Box(m, 5.8, 4.2, 3.6, 1.1, 2.6, 1.1, S[2], S[0]);           /* travel lock post */

  } else if (key === 'v2rl') {
    /* V2 ROCKET LAUNCHER, and it had no model at all. It fell through to the generic fallback
       at the bottom of this chain - two dark track boxes and a body in the TEAM COLOUR - which
       is both the wrong shape and the one thing RTS_PAL.veh exists to forbid: a vehicle painted
       team colour end to end reads as a coloured lump, which is exactly what the palette note
       above the veh ramp was written about. Measured against its peers by face count: every
       other vehicle in the roster carries 110 to 187 faces and the V2 carried 20.

       The identity is the RAISED MISSILE, and it stands VERTICAL rather than lying along the
       hull. That is a projection decision, not a styling one, and it is the same one the
       Artillery's comment above records: screen height is z - 1.3y, so a long tube lying along
       +x cancels itself out at the facings where +x points at the camera and gets swallowed by
       its own hull. Artillery answers that by raising its tube; a rocket can simply stand up,
       and then no facing can hide it - the launcher reads identically from all thirty-two.
       It also separates the two siege units at a glance, which they need: they share a role,
       a range band and a chassis size, and a low tube against a standing rocket is a
       difference that survives being half a cell tall.

       A truck, not a tank: six road wheels under a long flat bed, so it reads as wheeled
       transport carrying something rather than as another turreted chassis. */
    tracks(19, 5.8, 6, 2.0);
    _r3Slab(m, -0.5, 2.6, 0, 18.0, 3.0, 9.4, 1.0, VH[0], VH[1]);   /* flat bed */
    _r3Box(m, 6.4, 2.6, 0, 5.4, 4.6, 8.6, VH[1], VH[3]);           /* cab */
    _r3Box(m, 8.6, 5.2, 0, 1.2, 2.0, 6.2, RTS_PAL.glass, RTS_PAL.glass);  /* windscreen */
    _r3Box(m, 3.2, 5.6, 0, 3.0, 1.4, 8.0, VH[2], TM[1]);           /* team cap, behind the cab */
    /* The launch table the rocket stands on, and the erector arms around it. These used to be
       two horizontal side rails, which is what a missile lying flat would need - with a
       standing rocket through them the geometry said two different things at once. */
    _r3Box(m, -3.6, 5.6, 0, 7.6, 1.6, 8.2, S[2], S[1]);            /* launch table */
    for (var _vs = -1; _vs <= 1; _vs += 2) {
      _r3Box(m, -3.6, 7.2, _vs * 3.4, 1.2, 6.4, 1.2, S[1], S[0]);  /* erector arms */
      _r3Box(m, -3.6, 13.6, _vs * 3.4, 1.2, 1.0, 2.4, S[2], S[1]); /* their tie-bars */
    }
    /* THE MISSILE, pale against the khaki so it never merges with the truck under it. */
    _r3Cyl(m, -3.6, 7.2, 0, 2.3, 11.0, GN[1], GN[3], 16);
    _r3Cone(m, -3.6, 18.2, 0, 2.3, 0.3, 3.4, GN[0], 16);           /* nose cone */
    for (var _vf = 0; _vf < 4; _vf++) {                            /* tail fins, at the base */
      var _fa = _vf * Math.PI / 2 + Math.PI / 4;
      _r3Box(m, -3.6 + Math.cos(_fa) * 2.6, 8.0, Math.sin(_fa) * 2.6,
             1.0, 3.2, 1.0, DK[1], DK[3]);
    }
    _r3Box(m, -8.6, 3.0, 0, 2.2, 2.0, 5.0, DK[2], DK[1]);          /* blast plate at the tail */
    /* Launch support riding the bed: a fuel drum and a cable spool by the erector, and the
       cab's mirrors - the truck fittings that separate it from an armoured chassis. */
    _r3Cyl(m, 0.6, 4.2, -3.6, 1.4, 3.0, RTS_PAL.hazard[0], RTS_PAL.hazard[1], 10);
    _r3Cyl(m, 0.6, 4.4, 3.6, 1.7, 1.4, DK[1], DK[3], 10);          /* spool */
    _r3Box(m, 9.4, 6.4, -4.6, 0.6, 1.4, 0.9, S[2], S[3]);          /* mirrors */
    _r3Box(m, 9.4, 6.4, 4.6, 0.6, 1.4, 0.9, S[2], S[3]);

  } else if (key === 'buggy') {
    /* Wheels are the buggy's whole identity, so they are proper vertical cylinders standing
       clear of the body with a light hub - four round shapes at the corners read instantly as
       "wheeled" against every tank's four square track runs. */
    for (i = 0; i < 4; i++) {
      var bx = i < 2 ? 6.2 : -6.2, bz = (i % 2) ? 6.0 : -6.0;
      _r3Cyl(m, bx, 0, bz, 3.1, 3.4, DK[0], DK[1], 12);
      _r3Cyl(m, bx, 1.0, bz, 1.4, 2.6, S[2], S[1], 10);            /* hub */
    }
    _r3Slab(m, 0, 2.8, 0, 17, 3.2, 8.2, 1.0, VH[0], VH[3]);        /* body tub */
    _r3Box(m, 6.6, 3.2, 0, 3.6, 2.2, 7.6, VH[1], VH[3]);           /* sloped nose */
    _r3Box(m, -1.5, 6.0, 0, 7.5, 2.8, 7.0, DK[2], DK[1]);          /* open cockpit well */
    _r3Box(m, -4.8, 6.0, 0, 1.0, 4.6, 7.0, TM[1], TM[3]);          /* roll hoop */
    _r3Box(m, 3.2, 8.4, 0, 8.5, 1.3, 1.3, DK[1], DK[3]);           /* pintle gun */
    /* Scout kit: a spare wheel standing on the tail, a jerrycan beside it, headlight pair
       and a whip aerial - the loose stowage that says "raider" against a tank's plating. */
    _r3Cyl(m, -8.0, 3.4, 0, 2.6, 2.6, DK[0], DK[1], 12);           /* spare wheel */
    _r3Box(m, -7.6, 3.4, 4.2, 1.6, 2.2, 2.4, RTS_PAL.hazard[0], S[1]);
    _r3Box(m, 8.6, 3.6, -2.6, 0.9, 1.0, 1.4, GN[3], GN[3]);
    _r3Box(m, 8.6, 3.6, 2.6, 0.9, 1.0, 1.4, GN[3], GN[3]);
    _r3Box(m, -3.6, 8.8, -3.2, 0.5, 4.4, 0.5, DK[1], DK[3]);       /* whip aerial */
  } else return false;
  return true;
}
