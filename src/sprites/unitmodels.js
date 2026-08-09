/* sprites/unitmodels.js - the 3D model for every unit, yawed to each facing. Part of rts.sprites. */

/* ------------------------------------------------------------------- units --
   One model per type, yawed to each of eight facings and rendered separately. Because the
   model is rotated in 3D rather than the canvas being rotated in 2D, a tank at 45 degrees
   shows its side and its tracks correctly instead of being a smeared copy of the front. */
/* The size ladder, in art pixels of the baked canvas. A cell is RTS_TS = 24 px, so these read
   directly as "how many cells does this unit cover" - and that is the number that was wrong.
   A Battle Tank measured 69 px, just under THREE cells, which put it level with a 2x2 building
   and turned four of them into one unreadable slab. In the reference a light tank is about a
   cell and a half, a Mammoth a little over two, and infantry stay under one.

   The models below are authored at whatever scale is comfortable to write and brought onto
   this ladder by _sprUnitScale, so resizing a unit is one number here rather than three
   hundred hand-tuned coordinates, and it cannot silently change the unit's proportions. */
var RTS_UNIT_SPAN = {
  rifle:22, rocket:23, grenadier:22, flame:23, engineer:22, medic:22, thief:22, tanya:20,
  dog:17, buggy:30, light:33, tank:39, arty:41, heavy:47, harvester:43, mcv:46, apc:34, heli:40
};

/* Eight of the fifteen units are infantry, and at one cell tall their SILHOUETTES cannot be
   told apart - a rifleman and a medic are the same stack of boxes and no amount of modelling
   changes that. Rendering all eight as bare shapes proved it: one blob, eight times.

   In the reference they are told apart by COLOUR. So colour is the primary signal here and the
   prop is only the confirmation. The camera looks down (R3_K = 1.3), which makes the TOP of the
   helmet the largest single patch of any soldier - so `helm[1]`, the helmet's top face, is the
   identity marker, exactly the way the roof became the team colour on structures. body:null
   means "wear the team colour", which is what an ordinary rifleman does. */
var RTS_INF_KIT = {
  rifle:     { body:null,                  top:null,      prop:'#3f4650' },
  rocket:    { body:['#6b5a3a','#85714c'], top:'#6d727a', prop:'#8d8571' },
  grenadier: { body:['#8a5a20','#a87030'], top:'#d9a13c', prop:'#d9a13c' },
  flame:     { body:['#6b4a1c','#87602a'], top:'#e8531c', prop:'#e8a11c' },
  engineer:  { body:['#c99a1e','#e8bc3c'], top:'#f5d565', prop:'#2a2a26' },
  medic:     { body:['#cfcfc4','#eaeae0'], top:'#ffffff', prop:'#c8302a' },
  thief:     { body:['#22252b','#31363e'], top:'#17191d', prop:'#4b5360' },
  tanya:     { body:['#c4bca4','#e0d8bc'], top:'#a8452a', prop:'#2b3038' }
};

/* part: undefined = the whole unit, 'hull' = body only, 'turret' = turret only. Hull and
   turret bake into the same size canvas about the same origin, so drawing one over the other
   at the same screen position lines them up with no per-facing offset table. */
function _sprUnitModel(key, side, prone, part) {
  var d = rtsUnitDef(key), TM = RTS_PAL.team[side], VH = RTS_PAL.veh[side];
  var S = RTS_PAL.steel, DK = RTS_PAL.dark, O = RTS_PAL.ore, C = RTS_PAL.conc;
  var GN = RTS_PAL.gun;
  var m = [], i;

  /* Road wheels and a track run - the detail that separates a tracked vehicle from a box with
     dark stripes down its sides. The wheels sit proud of the hull, the skirt caps them, so at a
     diagonal facing you read wheel, skirt and hull as three separate values instead of one.

     _r3Cyl is a VERTICAL cylinder - its h runs along y - so anything lying along the ground has
     to be built from boxes. The road wheels are therefore a row of small blocks stepped proud of
     the track run rather than actual discs, which at this size reads the same and costs less. */
  function tracks(len, zoff, wheels, rad) {
    for (var s = -1; s <= 1; s += 2) {
      var z = s * zoff;
      _r3Slab(m, 0, 0, z, len, rad * 2.1, rad * 2.0, 0.9, DK[0], DK[1]);      /* track run */
      for (var k = 0; k < wheels; k++) {
        var wx = (k - (wheels - 1) / 2) * (len - rad * 2.4) / (wheels - 1);
        _r3Box(m, wx, rad * 0.45, z + s * rad * 0.5, rad * 1.5, rad * 1.2, rad * 1.1,
               (k % 2) ? DK[2] : DK[1], DK[2]);
      }
      _r3Box(m, 0, rad * 2.0, z, len - 1, 1.2, rad * 2.4, VH[2], VH[1]);      /* fender skirt */
    }
  }

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
    var men = (key === 'tanya') ? [[0, 0]] : [[2.5, -3], [-2.5, 2.5]];
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
      _r3Box(m, mx, 0, mz - 0.9, 1.7, 2.6, 1.4, DK[1], DK[2]);     /* legs */
      _r3Box(m, mx, 0, mz + 0.9, 1.7, 2.6, 1.4, DK[1], DK[2]);
      _r3Box(m, mx, 2.4, mz, 3.6, 3.7, 3.6, BD, BL);               /* torso - the colour block */
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

  } else if (key === 'heli') {
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
    } else {
      /* the propeller: a thin hub plus two crossed bars, the same trick the Heli's rotor uses
         and for the same reason - a solid disc at this size is an opaque lid over the aircraft */
      _r3Cyl(m, _len * 0.56, 3.6, 0, 1.4, 0.6, GN[2], GN[1], 12);
      _r3Box(m, _len * 0.60, 3.6, 0, 0.5, 11.0, 1.1, DK[1], DK[3]);
      _r3Box(m, _len * 0.60, 3.6, 0, 0.5, 1.1, 11.0, DK[1], DK[3]);
    }

  } else if (key === 'gunboat' || key === 'destroyer') {
    /* SURFACE SHIPS. Long and narrow with a raked bow - a hull has to read as a hull from
       above or it is just a rectangle in the sea, and the only cues that survive this camera
       are the taper at the front and the wake-line down the middle. No tracks and no wheels:
       the underside is never seen, and drawing a keel would only widen the silhouette. */
    var _big = (key === 'destroyer');
    var _L = _big ? 26 : 19, _Wd = _big ? 8.5 : 6.5;
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

  } else {
    _r3Box(m, 0, 0, -5, 15, 3.5, 4, DK[0], DK[1]);
    _r3Box(m, 0, 0, 5, 15, 3.5, 4, DK[0], DK[1]);
    _r3Box(m, 0, 2.5, 0, 15, 4, 8, TM[0], TM[1]);
    _r3Box(m, 4, 6, 0, 8, 1.4, 1.4, DK[1], DK[3]);
  }

  var sc = _sprUnitScale(key);
  return sc === 1 ? m : _r3Scale(m, sc);
}
