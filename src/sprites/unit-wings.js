/* sprites/unit-wings.js - the second wave of aircraft: the Sky Crane, and those that follow it.
   One arm of the unit model chain (sprites/unitmodels.js has the dispatch and the shared locals
   handed over in X); returns false for a key it does not own. A file of its own because
   unit-airsea.js holds the first four aircraft and every ship and is near the 500-line cap. */

/* the 3D renderer's moving parts for these (see RTS_AIR_PARTS in unit-airsea.js) */
RTS_AIR_PARTS.skycrane = { rotor: true };
RTS_AIR_PARTS.paraplane = { prop: [7.4, 6.1, -6.6, 2.8], props: [[7.4, 6.1, -6.6, 2.8], [7.4, 6.1, 6.6, 2.8]], tips: 13.0 };

function _sprUnitWings(X, key) {
  var m = X.m, TM = X.TM, VH = X.VH, S = X.S, DK = X.DK, GN = X.GN, part = X.part, i;

  if (key === 'skycrane') {
    /* SKY CRANE. A flying crane: a thin spine with the cockpit at its nose and nothing under
       it but air - tall splayed legs and a hook, room for a tank to hang where a cabin would
       be. The identity is that EMPTY BELLY under one big rotor; the Skylift is a box. */
    var _blades = function () {
      _r3Cyl(m, 0, 12.2, 0, 0.7, 1.4, GN[1], GN[3], 16);           /* mast, from the engine deck up */
      _r3Cyl(m, 0, 13.4, 0, 1.3, 0.6, GN[1], GN[3], 16);           /* hub */
      _r3Box(m, 0, 14.0, 0, 30.0, 0.5, 1.4, DK[1], DK[3]);         /* blades */
      _r3Box(m, 0, 14.0, 0, 1.4, 0.5, 30.0, DK[1], DK[3]);
    };
    if (part === 'rotor') { _blades(); return true; }
    if (part !== 'body') _blades();
    _r3Box(m, 0, 8.2, 0, 22.0, 2.6, 3.0, VH[0], VH[1]);            /* the spine */
    _r3Box(m, 10.6, 5.6, 0, 4.6, 4.6, 4.4, VH[1], VH[3]);          /* the cockpit, slung under its nose */
    _r3Box(m, 12.9, 6.6, 0, 0.6, 2.6, 3.8, RTS_PAL.glass, RTS_PAL.glass);   /* windscreen */
    _r3Box(m, 8.6, 6.8, 0, 0.5, 1.4, 4.6, RTS_PAL.glass, RTS_PAL.glass);    /* the rear-facing winch window */
    _r3Box(m, 0, 10.8, 0, 7.0, 1.2, 4.4, VH[2], VH[1]);            /* engine deck */
    _r3Box(m, 0, 10.9, 0, 5.0, 0.4, 4.6, TM[1], TM[3]);            /* team band on it */
    _r3Cyl(m, -2.6, 10.9, -2.6, 0.8, 1.2, DK[1], DK[3], 16);       /* exhausts */
    _r3Cyl(m, -2.6, 10.9, 2.6, 0.8, 1.2, DK[1], DK[3], 16);
    _r3Box(m, -12.4, 8.6, 0, 3.0, 4.6, 0.6, VH[1], VH[2]);         /* the tail fin */
    _r3Cyl(m, -13.0, 10.4, 0.8, 1.6, 0.4, DK[1], DK[2], 16);       /* tail rotor */
    /* the legs: four, long and splayed, so a tank fits between them */
    [[7.0, -4.4], [7.0, 4.4], [-7.0, -4.4], [-7.0, 4.4]].forEach(function (L) {
      _r3Box(m, L[0], 0.6, L[1], 0.7, 7.8, 0.7, S[2], S[1]);
      _r3Box(m, L[0], 0, L[1], 2.4, 0.6, 1.0, DK[1], DK[2]);       /* its pad */
    });
    _r3Box(m, 7.0, 4.6, 0, 0.6, 0.6, 8.8, S[2], S[1]);             /* cross members */
    _r3Box(m, -7.0, 4.6, 0, 0.6, 0.6, 8.8, S[2], S[1]);
    _r3Box(m, 0, 4.4, 0, 0.3, 3.8, 0.3, DK[2], DK[3]);             /* the cable */
    _r3Box(m, 0, 3.8, 0, 1.4, 0.8, 1.0, RTS_PAL.hazard[0], RTS_PAL.hazard[1]);   /* the hook block */
  } else if (key === 'paraplane') {
    /* PARADROP PLANE. A high-winged twin-engined transport with a fat fuselage, a tail raised on
       an upswept boom and the jump door open in its flank. The identity is the HIGH STRAIGHT WING
       with an engine pod on each side, wider than anything else in the air, and the door. */
    _r3Box(m, 0, 2.2, 0, 19.0, 4.6, 4.8, VH[0], VH[1]);            /* fuselage */
    _r3Box(m, 10.4, 2.6, 0, 2.4, 3.6, 4.2, VH[1], VH[3]);          /* nose */
    _r3Box(m, 11.3, 4.6, 0, 0.6, 1.4, 3.4, RTS_PAL.glass, RTS_PAL.glass);   /* cockpit glazing */
    _r3Box(m, 1.4, 6.8, 0, 4.6, 0.6, 26.0, VH[1], VH[2]);          /* the high wing */
    _r3Box(m, 1.4, 7.4, 0, 3.0, 0.3, 8.0, TM[1], TM[3]);           /* team band on it */
    for (var en = -1; en <= 1; en += 2) {                           /* engine pods */
      _r3Box(m, 3.6, 5.2, en * 6.6, 6.0, 1.8, 2.0, VH[2], VH[1]);
      _r3Cyl(m, 6.8, 5.4, en * 6.6, 0.6, 1.2, DK[1], DK[2], 16);
    }
    _r3Box(m, -11.4, 4.0, 0, 6.0, 1.6, 2.2, VH[1], VH[2]);         /* the upswept boom */
    _r3Box(m, -13.6, 5.2, 0, 2.4, 4.4, 0.5, VH[1], VH[2]);         /* the fin */
    _r3Box(m, -13.4, 8.6, 0, 2.2, 0.4, 9.0, VH[1], VH[2]);         /* tailplane, high */
    _r3Box(m, -4.6, 2.6, 2.45, 2.4, 3.0, 0.2, DK[2], DK[3]);       /* the open jump door */
    _r3Box(m, -4.6, 5.8, 2.6, 2.6, 0.3, 0.6, RTS_PAL.lit, RTS_PAL.lit);    /* its jump light */
    for (var wn = 0; wn < 4; wn++) {                                /* cabin windows */
      _r3Box(m, 6.0 - wn * 2.6, 4.0, -2.45, 1.0, 0.8, 0.2, RTS_PAL.glass, RTS_PAL.glass);
      _r3Box(m, 6.0 - wn * 2.6, 4.0, 2.45, 1.0, 0.8, 0.2, RTS_PAL.glass, RTS_PAL.glass);
    }
    if (part !== 'body') {                                          /* the props, for the sprite */
      for (var pp = -1; pp <= 1; pp += 2) _r3Box(m, 7.4, 3.3, pp * 6.6, 0.3, 5.6, 0.6, DK[1], DK[2]);
    }
  } else return false;
  return true;
}
