/* sprites/roster11.js - the Tank Hunter and the Long Gun (rules/roster11.js). Part of
   rts.sprites. The Marksman and the Flak Trooper are soldiers, drawn with the others in
   sprites/unit-ground.js and render3d/soldier3d.js, told apart by their kit (sprites/unitmodels.js).

   The Tank Hunter has no turret: a low casemate on tracks, its long gun set in the glacis, so it
   turns its whole hull to shoot, and a squat hull reads as a hunter beside the turreted tanks.
   The Long Gun is one enormous barrel on a ring mount, laid along its pad over a sunken
   emplacement, with ammunition hoists at the back.

   11b: the Multi-role Carrier is a low wheeled hull with a small turret carrying a twin missile
   box, and a hatch at the back for its one passenger; the Strike Jet a swept-wing fighter-bomber
   with the bombs under its wings; the Leech Drone a squat body on six legs; the Gate a pair of
   concrete posts with a steel barrier between them. */
/* the Strike Jet's afterburner, wingtips and trail (render3d's aircraft: sprites/unit-airsea.js) */
RTS_AIR_PARTS.strikejet = { burner: [-9.0, 3.6, 0], tips: 10, trail: true };
function _sprUnitR11(X, key) {
  var m = X.m, VH = X.VH, TM = X.TM, S = X.S, DK = X.DK, GN = X.GN, part = X.part, s, i;
  if (key === 'ifv') {
    if (part !== 'turret') {
      for (i = 0; i < 4; i++) for (s = -1; s <= 1; s += 2) {                 /* four wheels a side */
        var wx = -5.4 + i * 3.6, wz = s * 4.4;
        _r3Wheel(m, wx, 1.7, wz, 1.7, 1.2, 'z', DK[1], DK[2], 16);
        if (!_SPR_ROLL_LEN) { _SPR_ROLL_LEN = 1.7 * Math.PI * 2 / 4; _SPR_ROLL_KIND = 'wheel'; }
        for (var tn = 0; tn < 4; tn++) {                                       /* the wheel nuts, turning as it rolls */
          var ta = (tn - (_SPR_ROLL || 0)) / 4 * Math.PI * 2;
          _r3Box(m, wx + Math.cos(ta) * 0.7, 1.7 + Math.sin(ta) * 0.7, wz, 0.35, 0.35, 1.5, S[3], S[2]);
        }
      }
      _r3Slab(m, 0, 2.2, 0, 15, 3.4, 8.2, 1.2, VH[0], VH[1]);                 /* the hull */
      _r3Hip(m, 0.6, 5.6, 0, 12, 1.2, 7.6, 2.0, VH[2]);
      _r3Box(m, -7.2, 4.4, 0, 0.6, 2.6, 4.0, DK[1], DK[2]);                   /* the rear hatch */
    }
    if (part !== 'hull') {
      _r3Slab(m, 0.6, 6.6, 0, 5.6, 1.8, 5.2, 0.6, VH[1], TM[1]);              /* turret, team roof */
      /* built about the pivot (unit/turrets): the box sits square on top, the coax on the centre line */
      _r3Box(m, 0.2, 8.4, 0, 4.4, 1.8, 2.8, S[1], S[3]);                       /* the twin missile box */
      for (i = 0; i < 2; i++) _r3Cyl(m, 2.5, 8.8, -0.7 + i * 1.4, 0.5, 0.4, '#e8532c', '#ff9a5a', 12);
      _r3Box(m, 4.6, 7.2, 0, 3.6, 0.6, 0.6, GN[0], GN[2]);                     /* the coax */
    }
    return true;
  }
  if (key === 'strikejet') {
    for (s = -1; s <= 1; s += 2) {
      _r3Box(m, -1.2, 3.2, s * 4.6, 5.0, 0.9, 7.4, VH[0], VH[1]);             /* the swept wings */
      _r3Box(m, -3.0, 3.2, s * 8.6, 3.0, 0.9, 1.8, VH[1], VH[3]);
      _r3Box(m, -0.6, 2.0, s * 5.0, 3.8, 1.1, 1.1, GN[1], GN[3]);             /* a bomb under each */
      _r3Box(m, -7.6, 3.6, s * 3.0, 2.4, 0.6, 2.6, VH[1], VH[3]);             /* the tailplanes */
    }
    _r3Box(m, 0, 3.4, 0, 17.0, 3.0, 3.2, VH[0], VH[1]);                       /* fuselage */
    _r3Box(m, 8.4, 3.4, 0, 3.6, 2.0, 2.0, VH[1], VH[3]);                      /* nose */
    _r3Box(m, 3.4, 5.4, 0, 4.0, 1.4, 2.2, RTS_PAL.glass, RTS_PAL.glass);      /* canopy */
    _r3Box(m, -6.8, 6.2, 0, 3.4, 4.2, 0.8, VH[1], VH[3]);                     /* the fin */
    _r3Box(m, -1.0, 1.9, 0, 7.0, 0.9, 3.0, TM[1], TM[3]);                     /* team stripe */
    _r3Cyl(m, -9.0, 3.6, 0, 1.4, 1.4, DK[1], DK[3], 16);                      /* exhaust */
    return true;
  }
  if (key === 'leech') {
    _r3Cyl(m, 0, 2.4, 0, 2.6, 1.8, VH[0], VH[1], 20);                         /* the body */
    _r3Cone(m, 0, 4.2, 0, 2.6, 1.2, 1.4, TM[1], 20);                          /* its back, team colour */
    /* six legs, stepping in two sets of three as it goes: the roll is its gait */
    if (!_SPR_ROLL_LEN) { _SPR_ROLL_LEN = 3.0; _SPR_ROLL_KIND = 'legs'; }
    for (i = 0; i < 6; i++) {
      var la = (i + 0.5) / 6 * Math.PI * 2, lx = Math.cos(la), lz = Math.sin(la);
      var up = Math.max(0, Math.sin(((_SPR_ROLL || 0) + (i % 2) * 0.5) * Math.PI * 2)) * 0.9;
      _r3Box(m, lx * 3.2, 2.8 + up * 0.5, lz * 3.2, Math.abs(lx) * 2.6 + 0.5, 0.5, Math.abs(lz) * 2.6 + 0.5, DK[1], DK[2]);
      _r3Box(m, lx * 4.6, 1.2 + up, lz * 4.6, 0.5, 2.8, 0.5, DK[1], DK[2]);
    }
    _r3Box(m, 2.6, 2.4, 0, 1.4, 0.8, 1.6, '#e8302a', '#ff7a5a');              /* the eye */
    return true;
  }
  if (key !== 'hunter') return false;
  X.tracks(17, 5.6, 5, 2.0);
  _r3Slab(m, 0, 2.9, 0, 15.6, 2.6, 9.4, 1.0, VH[0], VH[1]);                /* the hull */
  _r3Hip(m, -1.4, 5.5, 0, 11.6, 2.2, 8.4, 2.6, VH[2]);                      /* the casemate, sloped */
  _r3Box(m, -2.4, 7.6, 0, 5.6, 0.4, 5.2, TM[1], TM[3]);                     /* its roof hatch, team colour */
  _r3Cyl(m, 4.2, 5.4, 0, 1.5, 1.6, DK[1], DK[2], 16);                       /* the mantlet */
  _r3Wheel(m, 10.0, 5.4, 0, 0.75, 11.6, 'x', GN[0], GN[2], 16);              /* the long gun */
  _r3Wheel(m, 15.6, 5.4, 0, 1.05, 1.6, 'x', DK[0], DK[2], 16);              /* its muzzle brake */
  for (s = -1; s <= 1; s += 2) _r3Box(m, 0.4, 4.4, s * 5.0, 12.0, 1.4, 0.5, DK[1], DK[2]);   /* side skirts */
  _r3Box(m, -7.4, 4.6, 0, 1.6, 1.2, 6.0, S[1], S[3]);                       /* the engine deck */
  return true;
}
function _sprBldR11(X, key) {
  var m = X.m, W = X.W, D = X.D, C = X.C, S = X.S, B = X.B, DK = X.DK, GN = RTS_PAL.gun, i;
  if (key === 'gate') {
    for (i = -1; i <= 1; i += 2) {                                             /* two concrete posts */
      _r3Box(m, 0, 0, i * (D / 2 - 2.6), W - 6, 9, 4.2, C[1], C[0]);
      _r3Box(m, 0, 9, i * (D / 2 - 2.6), W - 5, 1.0, 5.0, B.roof, B.roof);   /* capped in team colour */
    }
    /* the barrier between them is its own mesh, so it can sink when the gate opens (render3d/gate3d.js) */
    for (i = -1; i <= 1; i += 2) _r3Box(m, 0, 0.4, i * (D / 2 - 5.2), 5.0, 7.6, 1.0, DK[1], DK[2]);   /* the slots it runs in */
    _r3Box(m, 0, 0, 0, W - 2, 0.4, D - 2, C[2], C[3]);                        /* the sill */
    return true;
  }
  if (key !== 'longgun') return false;
  _r3Box(m, 0, 0, 0, W - 4, 2, D - 4, C[2], C[0]);                          /* the emplacement */
  for (i = 0; i < 12; i++) {                                                 /* a ring of sandbags round the mount */
    var sa = i / 12 * Math.PI * 2;
    _r3Box(m, Math.cos(sa) * 17, 2, Math.sin(sa) * 17, 4.2, 2.4, 4.2, C[3], C[1]);
  }
  _r3Cyl(m, 0, 2, 0, 14, 3, S[1], S[2], 28);                                /* the ring mount */
  _r3Cyl(m, 0, 5, 0, 12.6, 1.0, B.roof, B.roof, 28);                        /* team band */
  _r3Slab(m, -3, 6, 0, 17, 8, 15, 1.8, DK[0], DK[1]);                       /* the gun house, armoured */
  _r3Hip(m, -3, 14, 0, 16, 2.2, 14, 3.0, DK[1]);
  _r3Box(m, -3, 16.4, 0, 6, 0.6, 15.4, B.roof, B.roof);                     /* a team stripe over the roof */
  _r3Cyl(m, 6.2, 9.2, 0, 3.6, 4.2, DK[1], DK[2], 20);                        /* the mantlet */
  for (i = 0; i < 6; i++)                                                    /* the barrel, stepping down and rising */
    _r3Wheel(m, 9.6 + i * 4.4, 11.2 + i * 0.7, 0, 2.9 - i * 0.22, 4.5, 'x', GN[i & 1 ? 1 : 0], GN[2], 20);
  _r3Wheel(m, 36.4, 15.6, 0, 2.6, 2.2, 'x', DK[0], DK[2], 20);              /* the muzzle brake */
  for (i = 0; i < 2; i++) _r3Box(m, -W / 2 + 6, 2, -6 + i * 12, 4, 12, 4, S[2], S[3]);   /* ammunition hoists */
  _r3Box(m, -W / 2 + 6, 14, 0, 4.4, 1.2, 16, S[1], S[3]);
  return true;
}
