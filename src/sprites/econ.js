/* sprites/econ.js - the War Harvester, the Assay Plant, the Foundry and the Clone Vats
   (core/econ.js). Part of rts.sprites.

   The War Harvester is the harvester's hopper and cab with a gun on the cab roof. The Assay Plant
   is a low hall feeding two tall assay columns by a covered belt; the Foundry a long casting shed
   under three chimneys with a gantry over its yard; the Clone Vats a row of glass-domed tanks lit
   green from inside. */
var RTS_ECON_GLOW = ['#6fe08a', '#c8ffd2'];

function _sprUnitEcon(X, key) {
  var m = X.m, VH = X.VH, TM = X.TM, S = X.S, DK = X.DK, GN = X.GN;
  if (key !== 'warharv') return false;
  X.tracks(18, 5.6, 5, 2.1);
  _r3Slab(m, 1.0, 2.9, 0, 15, 3.4, 10, 1.2, VH[0], VH[1]);
  _r3Box(m, 6.6, 6.3, 0, 4.6, 3.6, 7.6, VH[1], VH[3]);                    /* the cab */
  _r3Box(m, 8.9, 7.4, 0, 0.6, 1.6, 5.8, RTS_PAL.glass, RTS_PAL.glass);
  _r3Box(m, -2.6, 6.3, 0, 8.8, 4.2, 9.0, VH[2], VH[0]);                   /* the hopper */
  _r3Box(m, -2.6, 8.5, 0, 9.0, 0.4, 9.2, TM[1], TM[3]);                   /* its rim, team colour */
  _r3Cyl(m, 6.4, 8.2, 0, 1.6, 1.0, DK[1], DK[2], 16);                     /* the gun mount on the cab */
  _r3Box(m, 8.6, 8.9, 0, 4.4, 0.7, 0.7, GN[0], GN[2]);                    /* the gun */
  for (var p = -1; p <= 1; p += 2) _r3Box(m, 2.0, 4.6, p * 5.2, 9.0, 1.4, 0.6, DK[1], DK[2]);   /* armour skirts */
  return true;
}
function _sprBldEcon(X, key) {
  var m = X.m, W = X.W, D = X.D, C = X.C, S = X.S, B = X.B, WH = X.WH, DK = X.DK, i;
  if (key === 'assay') {
    _r3Box(m, 0, 0, 0, W - 6, 3, D - 6, C[2], C[0]);
    _r3Box(m, -5, 3, 4, W - 22, 7, D - 22, WH[1], WH[3]);                 /* the hall */
    X.facade(4, 2, (W - 22) / 2, (D - 22) / 2);
    _r3Box(m, -5, 10, 4, W - 20, 1.0, D - 20, B.roof, B.roof);
    for (i = 0; i < 2; i++) _r3Cyl(m, 9, 3, -9 + i * 9, 3.0, 15, S[1], S[2], 20);   /* the assay columns */
    _r3Box(m, 4, 11, -4.5, 10, 1.6, 2.0, S[2], S[3]);                     /* the covered belt to them */
    return true;
  }
  if (key === 'foundry') {
    _r3Box(m, 0, 0, 0, W - 6, 3, D - 6, C[2], C[0]);
    _r3Box(m, -4, 3, 0, W - 18, 9, D - 14, WH[1], WH[3]);                 /* the casting shed */
    X.facade(6, 2, (W - 18) / 2, (D - 14) / 2);
    _r3Box(m, -4, 12, 0, W - 16, 1.2, D - 12, B.roof, B.roof);
    for (i = 0; i < 3; i++) _r3Cyl(m, -14 + i * 9, 13, -4, 1.6, 10, DK[1], DK[0], 16);   /* three chimneys */
    _r3Box(m, W / 2 - 8, 3, 0, 1.0, 12, 1.0, S[1], S[3]);                 /* the gantry over the yard */
    _r3Box(m, W / 2 - 8, 15, 0, 1.0, 1.0, D - 12, S[1], S[3]);
    return true;
  }
  if (key === 'vats') {
    _r3Box(m, 0, 0, 0, W - 6, 3, D - 6, C[2], C[0]);
    for (i = 0; i < 4; i++) {                                              /* the vats, lit from inside */
      var vx = -7 + (i % 2) * 14, vz = -7 + ((i / 2) | 0) * 14;
      _r3Cyl(m, vx, 3, vz, 4.4, 6, S[1], S[2], 20);
      _r3Cyl(m, vx, 9, vz, 3.8, 3, RTS_ECON_GLOW[0], RTS_ECON_GLOW[1], 20);
      _r3Cyl(m, vx, 12, vz, 4.0, 0.6, B.roof, B.roof, 20);
    }
    return true;
  }
  return false;
}
