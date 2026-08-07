/* sprites/models.js - the 3D models for every structure, rendered to a sprite once at load.
   Part of rts.sprites, the sprite baker. */

/* ============================================================ 3D MODELS ==
   Every structure and unit is a small 3D model, rendered to a sprite once at load by
   src/r3d. See there for why: the originals were made exactly this way, and
   hand-drawn pixel art does not reproduce the result.

   Coordinates are art pixels. A 3x3 building's footprint is 72x72, centred on the origin,
   with y=0 at ground level and +y up. Build from the ground upward - every part sits on
   something below it, so the y offsets read as a running total. */
function _sprBuilding(key, side) {
  /* Real artwork wins when the player has pointed the game at their own game files; everything
     below is the fallback that got this project to the point where it could ask. */
  if (typeof _rtsArtReady === 'function' && _rtsArtReady()) {
    var real = _mixBuilding(key, side);
    if (real) return real;
  }
  /* The drawn set gets a damaged look too, or "buildings show their wounds" is a feature only
     the players who loaded their archives ever see. There is no second hand-drawn sprite to
     switch to, so one is DERIVED: scorch the finished canvas, punch a few dark holes through
     it, and let the silhouette stand. Built here, after the real-art path has had its chance,
     so it costs nothing for anyone using the originals. */
  var made = _sprBuildingClean(key, side);
  made.dmg = _sprBldDamaged(made.c, key);
  return made;
}

/* Take a finished building canvas and make it look hit: darken it unevenly, burn a few holes
   through the roof, and leave soot around them. Deterministic per key, so a given building
   always breaks the same way rather than shimmering between frames.

   NOT _sprScorch - that name was already taken further down by the ground scorch marks, and
   declaring it twice silently replaced one with the other. The only symptom was every
   procedurally-drawn building handing back an ARRAY where a canvas was expected. */
function _sprBldDamaged(src, key) {
  var t = _sprMake(src.width, src.height), g = t.g;
  g.drawImage(src, 0, 0);
  var W = src.width, H = src.height, seed = 0;
  for (var q = 0; q < key.length; q++) seed = (seed * 31 + key.charCodeAt(q)) & 0xffff;

  /* uneven soot, only where the building actually is - composited so it cannot spill onto
     the transparent surround and give the sprite a square halo */
  g.globalCompositeOperation = 'source-atop';
  for (var y = 0; y < H; y += 2) {
    for (var x = 0; x < W; x += 2) {
      var n = _sprVN(x, y, 7, seed + 3);
      if (n < 0.42) continue;
      g.globalAlpha = 0.16 + (n - 0.42) * 0.5;
      _sprRect(g, x, y, 2, 2, n > 0.8 ? '#1a1410' : '#2b2420');
    }
  }
  g.globalAlpha = 1;

  /* holes: a handful of dark bites out of the upper half, where a roof would be */
  for (var i = 0; i < 5; i++) {
    var hx = W * (0.18 + _sprHash(i, 1, seed) * 0.64);
    var hy = H * (0.15 + _sprHash(i, 2, seed) * 0.5);
    var hr = Math.max(2, Math.min(W, H) * (0.05 + _sprHash(i, 3, seed) * 0.06));
    g.globalAlpha = 0.85;
    _sprEll(g, hx, hy, hr, hr * 0.7, '#140f0c');
    g.globalAlpha = 0.4;
    _sprEll(g, hx + hr * 0.4, hy + hr * 0.5, hr * 0.9, hr * 0.6, '#3a2a1e');
  }
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  return t.c;
}

function _sprBuildingClean(key, side) {
  var def = rtsStructDef(key), TM = RTS_PAL.team[side];
  var W = def.w * RTS_TS, D = def.h * RTS_TS;
  var C = RTS_PAL.conc, S = RTS_PAL.steel, DK = RTS_PAL.dark, B = RTS_PAL.bld[side];
  /* K = brick, SD = sand, P = pale block. See RTS_PAL.mat - a base in the reference is built
     from several materials, and painting all of it in one team-tinted grey-blue is what made
     ours read as a set of blue boxes. */
  var K = RTS_PAL.mat.brick, SD = RTS_PAL.mat.sand, P = RTS_PAL.mat.pale;
  var m = [], i;
  /* Facade detail. In the reference a wall is never one flat colour - it carries pale
     pilasters and rows of lit windows, and that is a lot of what separates a building from
     a coloured box. Mounted 1.5 units proud of the wall face so they read cleanly. */
  function winRow(z, y, cx, count, gap, w, h) {
    for (var k = 0; k < count; k++) {
      _r3Box(m, cx + (k - (count - 1) / 2) * gap, y, z, w, h, 1.5, RTS_PAL.glass, RTS_PAL.glass);
    }
  }
  function pilasters(z, y, cx, count, gap, w, h) {
    for (var k = 0; k < count; k++) {
      _r3Box(m, cx + (k - (count - 1) / 2) * gap, y, z, w, h, 1.5, B.trim, B.trim);
    }
  }

      if (key === 'yard') {
    /* Construction Yard. The cameo is a VAULTED HANGAR - a barrel roof over a rectangular hall
       with one big opening in the end - and the arch is the identity. Nothing else in a base
       has a curved roofline, so it reads from across the map without a crane arm to help. */
    _r3Box(m, 0, 0, 0, W - 10, 12, D - 10, C[0], C[2]);                  /* the hall */
    /* The vault has to be TALLER THAN IT IS DEEP or it does not read as an arch: spread 66
       wide and 15 high, every one of its facets faces almost straight up, the light hits
       them all the same and the whole roof shades as one flat plate. Narrower than the hall
       and half as tall again gives the flanks a real angle to catch. */
    _r3Vault(m, 0, 12, 0, W - 8, 22, D - 8, C[1], 18, true);             /* the barrel roof */
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
    /* War Factory. The cameo's dominant feature is a big dark GABLED roof over an open bay,
       not the flat deck that was here - and under the roof the front is almost entirely a
       roll-up door, which is what says "vehicles come out of this one". */
    _r3Box(m, 0, 0, 0, W - 8, 12, D - 8, C[0], C[2]);
    _r3Gable(m, 0, 12, 0, W - 4, 11, D - 4, DK[1]);                      /* the dark gable */
    _r3Box(m, 0, 21, 0, W - 22, 1.4, 4, B.roof, B.roof);                 /* ridge band - team */
    _r3Box(m, 0, 0, D / 2 - 3, W - 26, 11, 4, DK[2], DK[0]);             /* the door */
    for (var fd = 0; fd < 5; fd++)
      _r3Box(m, 0, 1.5 + fd * 2.1, D / 2 - 1.6, W - 28, 1.0, 1.5, DK[1], DK[3]);
    _r3Box(m, 0, 11, D / 2 - 3, W - 20, 2.5, 5, C[3], C[3]);             /* header */
    pilasters(D / 2 - 3, 0, 0, 2, W - 20, 4, 11);
    _r3Cyl(m, -W / 2 + 12, 23, 0, 4.5, 9, S[0], S[3], 18);               /* one extractor */

  } else if (key === 'radar') {
    /* Radar Dome. The dome IS the building - a pale hemisphere on a small dark base, and the
       most instantly identifiable structure in the game. Everything else stays low. */
    _r3Slab(m, 0, 0, 2, W - 10, 10, D - 12, 3, C[0], C[2]);
    _r3Box(m, 0, 0, D / 2 - 5, 8, 8, 3, DK[0], DK[1]);
    winRow(D / 2 - 4, 3, -11, 2, 8, 4, 4);
    _r3Cone(m, 0, 10, -1, 15, 13.5, 6, C[3], 22);
    _r3Cone(m, 0, 16, -1, 13.5, 9.5, 7, C[1], 22);
    _r3Cone(m, 0, 23, -1, 9.5, 4, 6, C[3], 22);
    _r3Cyl(m, 0, 29, -1, 2, 4, S[1], S[3], 16);
    _r3Cyl(m, 0, 10, -1, 15.6, 1.4, B.roof, B.roof, 22);                 /* team ring at its foot */
    _r3Box(m, W / 2 - 7, 0, 4, 5, 12, 5, S[2], S[1]);                    /* waveguide riser */

  } else if (key === 'lab') {
    /* Tech Center. In the cameo this is a TALL PALE OFFICE BLOCK - several storeys of ribbon
       windows with a small mast on top - and that verticality is the point: it is the one
       building in a base that is taller than it is wide. The dish that used to be here made it
       a second Radar Dome. */
    _r3Box(m, 0, 0, 2, W - 12, 30, D - 14, P[0], P[1]);                  /* the tower */
    for (var lf = 0; lf < 3; lf++) {                                     /* ribbon windows */
      winRow(D / 2 - 6, 5 + lf * 9, 0, 3, 10, 6, 5);
      _r3Box(m, 0, 3.5 + lf * 9, D / 2 - 6, W - 14, 1.4, 1.5, P[3], P[3]);
    }
    _r3Box(m, 0, 30, 2, W - 8, 2.5, D - 10, P[3], P[1]);                 /* parapet */
    _r3Box(m, 0, 32.5, 2, W - 10, 1.2, 4, B.roof, B.roof);               /* team band */
    _r3Box(m, -W / 2 + 8, 0, D / 2 - 5, 8, 9, 3, DK[0], DK[1]);          /* entrance */
    _r3Box(m, W / 2 - 10, 32, -2, 2, 14, 2, S[3], S[3]);                 /* mast */
    _r3Box(m, W / 2 - 10, 43, -2, 6, 1.5, 1.5, S[1], S[1]);
    _r3Cyl(m, 8, 32, 4, 4, 4, S[2], S[1], 16);                           /* rooftop plant */

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

  } else if (key === 'helipad') {
    /* A flat pad, and in the reference it is exactly that: a marked square of apron with a
       yellow cross on it and almost nothing standing up. Keeping it low is the point - the one
       structure a helicopter can sit on top of has to look like it. */
    _r3Box(m, 0, 0, 0, W - 4, 2.5, D - 4, C[2], C[0]);
    _r3Box(m, 0, 2.5, 0, W - 12, 0.8, D - 12, C[0], C[1]);         /* the marked square */
    _r3Box(m, 0, 3.3, 0, W - 22, 0.7, 4.5, RTS_PAL.hazard[0], RTS_PAL.hazard[0]);   /* the cross */
    _r3Box(m, 0, 3.3, 0, 4.5, 0.7, D - 22, RTS_PAL.hazard[0], RTS_PAL.hazard[0]);
    _r3Box(m, -W / 2 + 6, 2.5, -D / 2 + 6, 7, 9, 7, C[0], B.roof);  /* control hut, team roof */
    _r3Box(m, -W / 2 + 6, 11.5, -D / 2 + 6, 1.2, 6, 1.2, S[3], S[3]);   /* mast */
    for (var hp = 0; hp < 4; hp++)                                  /* corner lights */
      _r3Cyl(m, (hp < 2 ? -1 : 1) * (W / 2 - 5), 2.5, (hp % 2 ? 1 : -1) * (D / 2 - 5),
             1.0, 1.8, RTS_PAL.lit, RTS_PAL.lit, 10);
    _r3Cyl(m, W / 2 - 7, 2.5, D / 2 - 7, 2.6, 4.5, RTS_PAL.hazard[0], S[3], 14);    /* fuel drum */

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
    _r3Box(m,  W / 2 - 6, 2.9, 0, 1.6, 0.6, D - 15, C[0], C[1]);    /* threshold bars */
    _r3Box(m, -W / 2 + 6, 2.9, 0, 1.6, 0.6, D - 15, C[0], C[1]);
    _r3Box(m, -W / 2 + 7, 2.2, -D / 2 + 5, 8, 8, 6, C[0], B.roof);  /* control shack, team roof */
    _r3Box(m, -W / 2 + 7, 10.2, -D / 2 + 5, 1.1, 5, 1.1, S[3], S[3]);  /* its mast */
    /* the windsock, which is the one silhouette cue that says airfield rather than road */
    _r3Box(m,  W / 2 - 10, 2.2, -D / 2 + 5, 1.0, 9, 1.0, S[3], S[3]);
    _r3Cyl(m, W / 2 - 10, 10.5, -D / 2 + 5, 1.6, 3.4, RTS_PAL.hazard[0], S[3], 12);
    for (var al = 0; al < 4; al++)                                  /* corner lights */
      _r3Cyl(m, (al < 2 ? -1 : 1) * (W / 2 - 4), 2.2, (al % 2 ? 1 : -1) * (D / 2 - 4),
             0.9, 1.6, RTS_PAL.lit, RTS_PAL.lit, 10);

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

  } else if (key === 'silo') {
    /* Ore Silo. The cameo is a LOW RIBBED BUNKER - a wide flat green-grey box with vertical
       ribs down it and an open frame at one end - not the three cylinders that were here,
       which read as a small refinery. Low and wide is the whole identity. */
    _r3Box(m, 0, 0, 0, W - 6, 2, D - 6, C[2], C[0]);                     /* pad */
    _r3Box(m, 0, 2, -1, W - 12, 13, D - 14, SD[2], SD[0]);               /* the bunker */
    for (var sk = 0; sk < 5; sk++)                                       /* the ribs */
      _r3Box(m, -16 + sk * 8, 2, -1, 2.5, 14, D - 12, C[2], C[0]);
    _r3Box(m, 0, 15, -1, W - 10, 2, D - 12, C[3], C[1]);                 /* the lid */
    _r3Box(m, 0, 17, -1, W - 14, 1.2, 4, B.roof, B.roof);                /* team band */
    _r3Box(m, 0, 2, D / 2 - 5, W - 16, 11, 2.5, DK[2], DK[0]);           /* open end frame */
    _r3Box(m, 0, 2, D / 2 - 4, W - 20, 5, 3, RTS_PAL.ore[0], RTS_PAL.ore[1]);  /* ore inside */
    _r3Box(m, -W / 2 + 7, 2, -D / 2 + 6, 4, 16, 4, S[3], S[3]);          /* fill pipe */
    _r3Box(m, -W / 2 + 13, 17, -D / 2 + 6, 12, 2, 3, S[2], S[1]);

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

  } else if (key === 'rocketpit') {
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

  } else if (key === 'mslo') {
    /* MISSILE SILO. A pair of blast doors laid flat with the nose of the missile showing
       through the open one. Deliberately LOW and horizontal - it is the most dangerous thing
       on the field and it should not look like a defence tower, it should look like a hatch in
       the ground that you would walk past. The read is the yellow-black hazard chevrons. */
    _r3Box(m, 0, 0, 0, W - 4, 3, D - 4, C[2], C[0]);                     /* apron */
    _r3Box(m, 0, 3, 0, W - 10, 6, D - 10, C[0], C[1]);                   /* silo block */
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
    _r3Box(m, 0, 9.8, -D / 2 + 5, 9, 1.2, 3, B.roof, B.roof);            /* team band */

  } else if (key === 'iron') {
    /* IRON CURTAIN. A heavy frame holding a lens between two coil banks, aimed sideways. The
       identity is the FRAME with a gap in the middle - a machine that projects something -
       against the Chronosphere's sphere. They are the two "field" buildings and must not be
       confusable at a glance. */
    _r3Box(m, 0, 0, 0, W - 4, 3, D - 4, C[2], C[0]);
    _r3Box(m, 0, 3, 0, W - 12, 7, D - 8, C[0], C[1]);                    /* plinth */
    /* the two uprights and the yoke across the top */
    _r3Box(m, -10, 10, 0, 4, 18, 7, DK[1], DK[2]);
    _r3Box(m,  10, 10, 0, 4, 18, 7, DK[1], DK[2]);
    _r3Box(m, 0, 26, 0, 24, 3.5, 6, C[3], C[2]);
    /* coil banks on each upright */
    for (var _iv = 0; _iv < 3; _iv++) {
      _r3Cyl(m, -10, 13 + _iv * 5, 0, 4.2, 2, C[2], C[3], 16);
      _r3Cyl(m,  10, 13 + _iv * 5, 0, 4.2, 2, C[2], C[3], 16);
    }
    /* the emitter itself, between them - emissive, because a powered field IS the building */
    _r3Cyl(m, 0, 18, 0, 5, 3.2, RTS_PAL.lit, RTS_PAL.lit, 20);
    _r3Box(m, 0, 10, 0, 6, 1.4, 4, B.roof, B.roof);
    _r3Box(m, -W / 2 + 6, 3, D / 2 - 6, 5, 8, 5, S[2], S[1]);            /* transformer */

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
    _r3Cone(m, 0, 15, 0, 3.5, 7.5, 4, S[2], 20);
    _r3Cone(m, 0, 19, 0, 7.5, 9,   3, S[1], 20);
    _r3Cone(m, 0, 22, 0, 9,   7.5, 4, S[1], 20);
    _r3Cone(m, 0, 26, 0, 7.5, 3.5, 4, S[2], 20);
    _r3Cyl(m, 0, 21.5, 0, 10.5, 1.6, RTS_PAL.spark[1], RTS_PAL.spark[2], 20); /* equator ring */
    _r3Cyl(m, 0, 30, 0, 1.6, 3, RTS_PAL.lit, RTS_PAL.lit, 12);           /* crown light */
    _r3Box(m, 0, 9.5, 0, 8, 1.4, 5, B.roof, B.roof);
    _r3Box(m, W / 2 - 6, 3, -D / 2 + 6, 6, 8, 6, S[2], S[1]);            /* control hut */

  } else if (key === 'gps') {
    /* GPS UPLINK. A dish on a mast. The most familiar shape in the set and the least
       threatening, which is right - it is the one superweapon that shoots nothing. */
    _r3Box(m, 0, 0, 0, W - 6, 3, D - 6, C[2], C[0]);
    _r3Box(m, 0, 3, 2, W - 14, 8, D - 14, C[0], C[1]);                   /* equipment shed */
    _r3Box(m, 0, 11, 2, W - 18, 1.6, D - 18, C[3], C[2]);
    _r3Cyl(m, 0, 12, 2, 2.2, 12, S[2], S[1], 16);                        /* the mast */
    _r3Cone(m, 0, 22, 2, 11, 6, 9, C[3], 20);                            /* the dish */
    _r3Cyl(m, 0, 26, 2, 1.2, 4, S[3], S[3], 12);                         /* feed horn */
    _r3Cyl(m, 0, 29.5, 2, 1.5, 1.5, RTS_PAL.lit, RTS_PAL.lit, 12);
    _r3Box(m, 0, 12.4, -D / 2 + 6, 8, 1.2, 3, B.roof, B.roof);           /* team band */
    _r3Box(m, -W / 2 + 6, 3, D / 2 - 6, 5, 6, 5, S[2], S[1]);            /* cable box */

  } else if (key === 'wall') {
    /* Concrete Wall. Has to tile with itself edge to edge, so it fills the cell exactly and
       nothing may cross the boundary. Simple by necessity and by choice - a wall that draws
       attention is a wall that makes a base look noisy. */
    _r3Box(m, 0, 0, 0, RTS_TS, 9, RTS_TS, C[0], C[1]);
    _r3Box(m, 0, 9, 0, RTS_TS, 2, RTS_TS, C[3], C[3]);                   /* capping course */
    _r3Box(m, 0, 4.5, 0, RTS_TS, 1, RTS_TS, C[2], C[2]);                 /* joint line */
    _r3Box(m, 0, 0, RTS_TS / 2 - 1, 3, 9, 2, C[2], C[2]);                /* form-tie marks */

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

  } else if (key === 'turret') {
    /* Gun Turret. A single BARREL on a low armoured base, lying almost flat - the barrel is
       the read, so it is long and sits clear of everything else. */
    _r3Box(m, 0, 0, 0, W - 4, 3, D - 4, C[2], C[0]);
    _r3Cone(m, 0, 3, 0, 9, 7.5, 6, C[0], 20);                            /* sloped base */
    _r3Cyl(m, 0, 9, 0, 7, 5, C[2], B.roof, 20);                          /* turret, team roof */
    _r3Box(m, 0, 10, 8, 3, 3, 13, S[0], S[1]);                           /* barrel */
    _r3Box(m, 0, 10, 15, 4, 4, 3, S[2], S[3]);                           /* muzzle */
    _r3Box(m, -7, 3, -6, 4, 3, 4, RTS_PAL.bag[0], RTS_PAL.bag[1]);
  }
  var r = _r3BakeFootprint(m, W, D);
  _sprEdge(r.c);
  return { c: _sprShadow(r.c, 3, 3), head: r.head };
}

