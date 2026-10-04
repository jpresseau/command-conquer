/* sprites/unit-special.js - the special-purpose vehicles Breachwater added to the roster: the
   Flak Track and the Mine Layer. One arm of the unit model chain (see sprites/unitmodels.js for the
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
  } else return false;
  return true;
}
