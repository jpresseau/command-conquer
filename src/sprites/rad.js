/* sprites/rad.js - the Fission Reactor (core/rad.js). Part of rts.sprites. The Blight Trooper is
   an infantry kit (sprites/unitmodels.js RTS_INF_KIT).

   A squat containment drum on a concrete apron, two cooling towers waisted in the middle beside
   it, and the core showing green through a ring of ports round the drum's top - the one thing on
   the building that says what is inside it. */
var RTS_RAD_GLOW = ['#7fe04a', '#c8ff8a'];

function _sprBldRad(X, key) {
  var m = X.m, W = X.W, D = X.D, C = X.C, S = X.S, B = X.B, i, a;
  if (key !== 'reactor') return false;
  _r3Box(m, 0, 0, 0, W - 6, 3, D - 6, C[2], C[0]);                          /* the apron */
  _r3Cyl(m, -7, 3, 0, 14, 12, C[1], C[0], 28);                             /* the containment drum */
  _r3Cone(m, -7, 15, 0, 14, 4, 8, C[0], 28);                                /* its dome */
  for (i = 0; i < 8; i++) {                                                 /* the ports, the core showing */
    a = i / 8 * Math.PI * 2;
    _r3Box(m, -7 + Math.cos(a) * 13.6, 11, Math.sin(a) * 13.6, 2.2, 2.2, 2.2, RTS_RAD_GLOW[0], RTS_RAD_GLOW[1]);
  }
  _r3Cyl(m, -7, 14.6, 0, 14.3, 0.9, B.roof, B.roof, 28);                    /* team band */
  for (var t = 0; t < 2; t++) {                                             /* the cooling towers, waisted */
    var tx = 15, tz = -11 + t * 22, rr = [7.5, 6.6, 5.6, 5.0, 5.2, 5.9];
    for (var k = 0; k < rr.length; k++) _r3Cyl(m, tx, 3 + k * 4, tz, rr[k], 4, S[1], S[2], 24);
    _r3Cyl(m, tx, 27, tz, 5.4, 0.4, S[3], S[3], 24);                        /* the dark mouth */
  }
  return true;
}
