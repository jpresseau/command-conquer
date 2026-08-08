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
      winRow = X.winRow, pilasters = X.pilasters;
  if (key === 'mslo') {
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
  } else return false;
  return true;
}
