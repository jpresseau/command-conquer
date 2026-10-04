/* sprites/unit-special.js - the special-purpose vehicles Breachwater added to the roster: the
   Flak Track, the Mine Layer, the Bridge Layer and the Hovercraft. One arm of the unit model chain (see sprites/unitmodels.js for the
   dispatch and the shared locals handed over in X); returns false for a key it does not own.

   Two small helpers live here because these are the first models that need them: a run of
   faces moved along the hull (a half-track's tracks sit behind its front wheels, and `tracks`
   builds them centred), and a run of faces pitched up about a pivot (an anti-aircraft gun points
   at the sky, and every primitive is axis-aligned). */

/* Move faces [from, end) of `m` along x. */
function _sprShiftX(m, from, dx) {
  for (var i = from; i < m.length; i++) {
    var v = m[i].v;
    for (var j = 0; j < v.length; j++) v[j] = [v[j][0] + dx, v[j][1], v[j][2]];
  }
}
/* Pitch faces [from, end) of `m` nose-up by `ang` radians about the point (px, py), in the x-y
   plane - a barrel along +x comes up toward +y. Normals turn with them. */
function _sprPitch(m, from, ang, px, py) {
  var c = Math.cos(ang), s = Math.sin(ang);
  function rot(p, o) { var x = p[0] - o[0], y = p[1] - o[1]; return [o[0] + x * c - y * s, o[1] + x * s + y * c, p[2]]; }
  for (var i = from; i < m.length; i++) {
    var f = m[i], o = [px, py, 0], z0 = [0, 0, 0];
    f.v = f.v.map(function (p) { return rot(p, o); });
    if (f.n) f.n = f.n.map(function (n) { return rot(n, z0); });
  }
}

/* Roll faces [from, end) of `m` by `ang` radians about the line y = py, z = pz along x - a
   cylinder, which every primitive builds standing up, laid across the hull. */
function _sprRoll(m, from, ang, py, pz) {
  var c = Math.cos(ang), s = Math.sin(ang);
  function rot(p, o) { var y = p[1] - o[1], z = p[2] - o[2]; return [p[0], o[1] + y * c - z * s, o[2] + y * s + z * c]; }
  for (var i = from; i < m.length; i++) {
    var f = m[i], o = [0, py, pz], z0 = [0, 0, 0];
    f.v = f.v.map(function (p) { return rot(p, o); });
    if (f.n) f.n = f.n.map(function (n) { return rot(n, z0); });
  }
}

function _sprUnitSpecial(X, key) {
  var m = X.m, TM = X.TM, VH = X.VH, S = X.S, DK = X.DK, GN = X.GN, part = X.part,
      tracks = X.tracks, i, n0;

  if (key === 'flaktrack') {
    /* FLAK TRACK. A half-track - steered wheels at the front, a track run under the bed -
       carrying a twin anti-aircraft mount on a turntable. Its identity has to survive one cell
       of screen: the TWO PALE BARRELS POINTING AT THE SKY. Every other gun in the roster lies
       along the ground, so the raised pair is the one silhouette nothing else has. */
    if (part !== 'turret') {
      n0 = m.length;
      tracks(11, 5.0, 3, 1.9);                                      /* the rear track run */
      _sprShiftX(m, n0, -3.6);
      for (var s = -1; s <= 1; s += 2) {                            /* steered front wheels */
        _r3Wheel(m, 6.6, 2.3, s * 4.6, 2.3, 2.0, 'z', DK[0], DK[1], 22);
        _r3Wheel(m, 6.6, 2.3, s * 4.6, 1.1, 2.2, 'z', S[2], S[1], 16);
        for (var wn = 0; wn < 5; wn++) {                            /* nuts, turning with the roll */
          var wa = (wn - (_SPR_ROLL || 0)) / 5 * Math.PI * 2;
          _r3Box(m, 6.6 + Math.cos(wa) * 0.7, 2.3 + Math.sin(wa) * 0.7, s * 4.6, 0.34, 0.34, 2.4, S[3], S[2]);
        }
        _r3Box(m, 6.6, 4.6, s * 4.6, 4.8, 0.8, 2.6, VH[2], VH[1]); /* mudguard */
      }
      _r3Slab(m, 0.4, 2.6, 0, 17.5, 3.2, 8.2, 1.0, VH[0], VH[1]);  /* the hull */
      _r3Box(m, 7.6, 3.6, 0, 3.6, 2.6, 6.8, VH[1], VH[3]);         /* the engine bonnet */
      _r3Box(m, 9.6, 3.4, 0, 0.8, 2.2, 5.4, DK[1], DK[2]);         /* radiator grille */
      _r3Box(m, 4.4, 5.8, 0, 2.6, 2.8, 7.4, VH[2], VH[1]);         /* the cab's armoured front */
      _r3Box(m, 5.6, 6.8, 0, 0.6, 1.2, 5.8, RTS_PAL.glass, RTS_PAL.glass);   /* vision slits */
      _r3Box(m, -3.0, 5.8, 0, 9.8, 1.4, 8.2, VH[2], TM[1]);        /* the gun deck - team colour */
      /* ready ammunition along both sides of the deck: the flak's long clips */
      for (i = 0; i < 3; i++) {
        _r3Box(m, -6.4 + i * 2.6, 7.4, -3.4, 2.0, 1.6, 1.2, RTS_PAL.hazard[0], S[1]);
        _r3Box(m, -6.4 + i * 2.6, 7.4, 3.4, 2.0, 1.6, 1.2, RTS_PAL.hazard[0], S[1]);
      }
      _r3Box(m, 10.0, 4.4, -3.0, 0.8, 0.9, 1.3, GN[3], GN[3]);     /* headlights */
      _r3Box(m, 10.0, 4.4, 3.0, 0.8, 0.9, 1.3, GN[3], GN[3]);
      _r3Box(m, 3.0, 8.6, -3.6, 0.5, 4.0, 0.5, DK[1], DK[3]);      /* whip aerial */
    }
    if (part !== 'hull') {
      /* The turntable and its shield, then the cradle and the barrels pitched up at fifty
         degrees about the trunnions. Built along +x and turned, so the pair keeps its spacing
         and its muzzle brakes at the top whatever the turret faces. */
      _r3Cyl(m, -2.4, 7.2, 0, 3.4, 1.0, DK[1], DK[2], 20);         /* turntable ring */
      _r3Slab(m, -2.4, 8.2, 0, 5.4, 2.2, 6.4, 0.6, VH[1], TM[1]);  /* the mount - team roof */
      _r3Box(m, 0.2, 9.4, -3.6, 1.0, 3.2, 1.2, S[2], S[1]);        /* splinter shields */
      _r3Box(m, 0.2, 9.4, 3.6, 1.0, 3.2, 1.2, S[2], S[1]);
      _r3Box(m, -5.4, 9.6, 0, 1.4, 1.6, 1.4, DK[1], DK[3]);        /* the gunner's sight */
      n0 = m.length;
      for (var b = -1; b <= 1; b += 2) {
        _r3Box(m, 2.4, 10.4, b * 1.5, 5.0, 1.8, 1.8, DK[1], DK[3]);   /* the breeches */
        _r3Box(m, 8.6, 10.6, b * 1.5, 8.6, 0.9, 0.9, GN[1], GN[3]);   /* barrels - pale steel */
        _r3Box(m, 13.4, 10.6, b * 1.5, 1.4, 1.4, 1.4, GN[0], GN[3]);  /* muzzle brakes */
      }
      _sprPitch(m, n0, 50 * Math.PI / 180, -0.4, 10.2);
    }
  } else if (key === 'minelayer') {
    /* MINE LAYER. A low tracked hull carrying its load where it can be seen: a rack of mines
       stacked on the rear deck, and the dispenser chute sloping off the stern that puts them
       down. The identity is the chute and the stacks - round, dark discs with a yellow band,
       the one cargo nothing else in the roster carries. */
    tracks(19, 6.0, 5, 2.2);
    _r3Slab(m, 0, 3.2, 0, 18.0, 3.2, 10.2, 1.0, VH[0], VH[1]);    /* hull */
    _r3Box(m, 7.2, 3.2, 0, 3.2, 3.0, 9.2, VH[1], VH[3]);          /* glacis */
    _r3Slab(m, 4.2, 6.4, 0, 6.0, 2.8, 8.4, 0.8, VH[1], TM[1]);    /* crew cab - team roof */
    _r3Box(m, 7.4, 7.4, 0, 0.6, 1.0, 6.4, RTS_PAL.glass, RTS_PAL.glass);   /* vision block */
    _r3Box(m, -3.2, 6.4, 0, 9.4, 0.8, 9.0, S[1], S[2]);           /* the rack's floor */
    /* the load: three stacks of four, each mine a squat disc with a hazard band */
    for (var st = 0; st < 3; st++) {
      var sx = -6.2 + st * 3.1;
      for (var lv = 0; lv < 4; lv++) {
        _r3Cyl(m, sx, 7.2 + lv * 1.05, -2.2, 1.3, 0.8, DK[1], DK[2], 18);
        _r3Cyl(m, sx, 7.2 + lv * 1.05, 2.2, 1.3, 0.8, DK[1], DK[2], 18);
      }
      _r3Cyl(m, sx, 11.4, -2.2, 0.5, 0.4, RTS_PAL.hazard[0], RTS_PAL.hazard[1], 16);   /* fuzes */
      _r3Cyl(m, sx, 11.4, 2.2, 0.5, 0.4, RTS_PAL.hazard[0], RTS_PAL.hazard[1], 16);
    }
    _r3Box(m, -3.2, 7.2, -4.4, 9.4, 1.4, 0.5, S[2], S[1]);        /* rack rails, low enough to show the load */
    _r3Box(m, -3.2, 7.2, 4.4, 9.4, 1.4, 0.5, S[2], S[1]);
    /* the dispenser chute off the stern, pitched down to the ground */
    n0 = m.length;
    _r3Box(m, -11.6, 4.6, 0, 6.0, 0.6, 4.4, S[1], S[2]);          /* chute floor */
    _r3Box(m, -11.6, 5.2, -2.1, 6.0, 1.2, 0.4, VH[2], VH[1]);     /* its sides */
    _r3Box(m, -11.6, 5.2, 2.1, 6.0, 1.2, 0.4, VH[2], VH[1]);
    _sprPitch(m, n0, 0.42, -8.6, 5.0);
    _r3Cyl(m, -13.0, 2.0, 0, 1.3, 0.8, DK[1], RTS_PAL.hazard[0], 18);   /* one on its way out */
    _r3Box(m, 8.6, 5.0, -3.6, 0.9, 1.0, 1.4, GN[3], GN[3]);       /* headlights */
    _r3Box(m, 8.6, 5.0, 3.6, 0.9, 1.0, 1.4, GN[3], GN[3]);
    _r3Box(m, 2.4, 9.0, -3.2, 0.5, 4.2, 0.5, DK[1], DK[3]);       /* whip aerial */
  } else if (key === 'sweeper') {
    /* MINE SWEEPER. A tank hull pushing a flail: a drum across the bow on two arms, hung with
       chains that beat the ground ahead of it. The identity is the DRUM - a bar wider than the
       hull, out in front of it - and the chains under it; a hazard-striped cab with a beacon
       says the rest. */
    tracks(18, 6.0, 5, 2.2);
    _r3Slab(m, -1.0, 3.2, 0, 17.0, 3.2, 10.2, 1.0, VH[0], VH[1]);   /* hull */
    _r3Slab(m, -3.6, 6.4, 0, 7.0, 3.0, 8.0, 0.8, VH[1], TM[1]);    /* armoured cab - team roof */
    _r3Box(m, 0.0, 7.6, 0, 0.6, 1.0, 6.0, RTS_PAL.glass, RTS_PAL.glass);   /* vision slit */
    for (var hz = 0; hz < 4; hz++)                                   /* hazard band on the cab */
      _r3Box(m, -0.2, 6.6, -3.0 + hz * 2.0, 0.4, 0.9, 1.0, hz % 2 ? DK[2] : RTS_PAL.hazard[0], hz % 2 ? DK[3] : RTS_PAL.hazard[1]);
    _r3Cyl(m, -5.0, 9.4, 0, 0.8, 1.0, RTS_PAL.lit, RTS_PAL.lit, 16);   /* the beacon */
    /* the two arms, from the bow down to the drum */
    for (var ar = -1; ar <= 1; ar += 2) {
      n0 = m.length;
      _r3Box(m, 10.4, 4.0, ar * 4.4, 7.0, 1.0, 1.0, S[2], S[1]);
      _sprPitch(m, n0, -0.32, 7.2, 4.5);
    }
    /* the drum, laid across the bow - wider than the hull - with its end caps */
    n0 = m.length;
    _r3Cyl(m, 13.4, 2.6 - 6.5, 0, 1.5, 13.0, S[1], S[2], 18);
    _sprRoll(m, n0, Math.PI / 2, 2.6, 0);
    for (var ec = -1; ec <= 1; ec += 2) {
      n0 = m.length;
      _r3Cyl(m, 13.4, 2.6 + ec * 6.5 - 0.4, 0, 1.9, 0.8, DK[1], DK[2], 18);
      _sprRoll(m, n0, Math.PI / 2, 2.6, 0);
    }
    /* the chains, hanging from it to the ground, links staggered */
    for (var ch = 0; ch < 7; ch++) {
      var cz = -5.4 + ch * 1.8;
      for (var lk = 0; lk < 2; lk++) _r3Box(m, 13.6 + (ch % 2) * 0.5, 0.2 + lk * 0.9, cz, 0.5, 0.8, 0.4, DK[2], DK[3]);
    }
    _r3Box(m, -9.6, 6.4, -3.6, 0.5, 3.6, 0.5, DK[1], DK[3]);       /* marker pole */
    _r3Box(m, -9.6, 9.4, -3.0, 0.1, 1.0, 1.4, RTS_PAL.hazard[0], RTS_PAL.hazard[1]);  /* its pennant */
    _r3Box(m, 7.6, 5.0, -3.8, 0.9, 1.0, 1.4, GN[3], GN[3]);       /* headlights */
    _r3Box(m, 7.6, 5.0, 3.8, 0.9, 1.0, 1.4, GN[3], GN[3]);
  } else if (key === 'bridgelayer') {
    /* BRIDGE LAYER. A tank hull carrying its bridge folded in two on its back: a long pale deck
       with a truss along each side and the hinge at the front, overhanging the hull at both ends.
       The identity is that overhang - a box longer than the vehicle under it - and the launching
       arm reaching up to it from the bow. */
    tracks(20, 6.4, 5, 2.3);
    _r3Slab(m, 0, 3.4, 0, 19.0, 3.4, 10.6, 1.1, VH[0], VH[1]);    /* hull */
    _r3Box(m, 8.2, 3.4, 0, 3.0, 3.2, 9.6, VH[1], VH[3]);          /* glacis */
    _r3Slab(m, 5.6, 6.8, -2.6, 4.4, 2.4, 4.4, 0.6, VH[1], TM[1]); /* the driver's cab, offset - team roof */
    _r3Box(m, 7.8, 7.6, -2.6, 0.6, 1.0, 3.4, RTS_PAL.glass, RTS_PAL.glass);
    /* the folded bridge: two deck halves stacked, overhanging fore and aft */
    for (var h = 0; h < 2; h++) {
      var by = 9.6 + h * 1.9;
      _r3Box(m, -1.0, by, 0, 26.0, 1.0, 8.8, S[1], S[0]);         /* deck plate, pale steel */
      for (var sd = -1; sd <= 1; sd += 2) {
        _r3Box(m, -1.0, by + 0.9, sd * 4.0, 26.0, 0.9, 0.6, S[2], S[1]);   /* truss chords */
        for (var t = 0; t < 7; t++) _r3Box(m, -12.0 + t * 3.7, by + 0.5, sd * 4.0, 0.5, 1.2, 0.6, S[3], S[2]);
      }
    }
    _r3Box(m, 11.4, 10.6, 0, 1.6, 3.4, 8.0, DK[1], DK[2]);        /* the hinge, at the bow */
    /* the launching arm, pitched up from the bow to the bridge */
    n0 = m.length;
    _r3Box(m, 9.0, 6.6, -3.0, 5.6, 1.2, 1.2, RTS_PAL.hazard[0], RTS_PAL.hazard[1]);
    _r3Box(m, 9.0, 6.6, 3.0, 5.6, 1.2, 1.2, RTS_PAL.hazard[0], RTS_PAL.hazard[1]);
    _sprPitch(m, n0, 0.55, 6.6, 6.6);
    _r3Box(m, -1.0, 8.4, 0, 18.0, 1.0, 6.6, DK[1], DK[2]);        /* the cradle under it */
    _r3Box(m, 9.4, 5.2, -3.8, 0.9, 1.0, 1.4, GN[3], GN[3]);       /* headlights */
    _r3Box(m, 9.4, 5.2, 3.8, 0.9, 1.0, 1.4, GN[3], GN[3]);
  } else if (key === 'hovercraft') {
    /* HOVERCRAFT. No wheels and no tracks: a flat hull riding on a fat black skirt, driven by
       two great ducted fans at the stern. The fans are the identity - two rings standing up
       behind the cabin, bigger than anything else on it - and the skirt the second, a dark band
       all round that says "this floats". */
    _r3Slab(m, 0, 0.6, 0, 21.0, 2.6, 12.4, 1.3, DK[0], DK[1]);    /* the skirt */
    _r3Slab(m, 0.4, 3.0, 0, 19.0, 1.6, 10.8, 0.8, VH[0], VH[1]);  /* the hull deck */
    _r3Box(m, 9.4, 3.2, 0, 2.6, 1.4, 8.6, VH[1], VH[3]);          /* a blunt bow ramp */
    _r3Slab(m, 2.6, 4.6, 0, 7.6, 3.2, 7.0, 0.8, VH[1], TM[1]);    /* the cabin - team roof */
    _r3Box(m, 6.5, 5.8, 0, 0.6, 1.4, 5.8, RTS_PAL.glass, RTS_PAL.glass);  /* windscreen */
    _r3Box(m, 2.6, 5.8, -3.6, 5.0, 1.2, 0.6, RTS_PAL.glass, RTS_PAL.glass);
    _r3Box(m, 2.6, 5.8, 3.6, 5.0, 1.2, 0.6, RTS_PAL.glass, RTS_PAL.glass);
    _r3Cyl(m, 2.0, 7.8, 0, 1.1, 0.8, DK[1], DK[2], 16);           /* gun ring */
    _r3Box(m, 4.4, 8.5, 0, 5.4, 0.7, 0.7, DK[1], DK[3]);          /* machine gun */
    /* the fans: a duct ring standing across the stern on each side, a hub, four blades */
    for (var fs = -1; fs <= 1; fs += 2) {
      var fz = fs * 3.0;
      _r3Wheel(m, -7.6, 8.2, fz, 3.4, 1.4, 'x', S[1], S[2], 24);   /* the duct */
      _r3Wheel(m, -7.6, 8.2, fz, 2.8, 1.6, 'x', DK[1], DK[2], 24); /* its dark throat */
      _r3Wheel(m, -7.6, 8.2, fz, 0.7, 2.0, 'x', S[2], S[3], 16);   /* hub */
      for (var bl = 0; bl < 4; bl++) {
        var ba = bl * Math.PI / 2 + Math.PI / 4;
        _r3Box(m, -7.4, 8.2 + Math.sin(ba) * 1.4, fz + Math.cos(ba) * 1.4, 0.3, 0.6 + Math.abs(Math.sin(ba)) * 1.6, 0.6 + Math.abs(Math.cos(ba)) * 1.6, GN[1], GN[2]);
      }
      _r3Box(m, -7.6, 4.6, fz, 1.2, 3.6, 1.0, VH[2], VH[1]);       /* the pylon it stands on */
      _r3Box(m, -10.0, 8.2, fz, 0.4, 5.2, 0.6, VH[1], VH[3]);      /* rudder behind it */
    }
    _r3Box(m, 8.6, 4.2, -4.4, 0.9, 0.9, 1.3, GN[3], GN[3]);       /* lamps */
    _r3Box(m, 8.6, 4.2, 4.4, 0.9, 0.9, 1.3, GN[3], GN[3]);
  } else return false;
  return true;
}
