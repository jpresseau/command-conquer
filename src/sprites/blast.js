/* sprites/blast.js - the Wrecker (core/blast.js). Part of rts.sprites. The Sapper, the Zealot and
   the Frogman are infantry kits (sprites/unitmodels.js RTS_INF_KIT).

   The Wrecker is a plain flat-bed lorry - nothing on it says "armour" - with its load lashed down
   behind the cab: rows of drums under hazard stripes, and a red lamp on the cab roof. */
var RTS_BLAST_DRUM = ['#7a3a22', '#9c4c2c'], RTS_BLAST_STRIPE = ['#e8c21c', '#1f1f1f'];

function _sprUnitBlast(X, key) {
  var m = X.m, VH = X.VH, TM = X.TM, S = X.S, DK = X.DK, i;
  if (key !== 'wrecker') return false;
  for (i = 0; i < 6; i++) {
    var wx = [6.2, -2.2, -6.0][i >> 1], wz = (i % 2) ? 5.0 : -5.0;
    _r3Wheel(m, wx, 2.5, wz, 2.5, 2.6, 'z', DK[0], DK[1], 22);
    _r3Wheel(m, wx, 2.5, wz, 1.1, 2.9, 'z', S[2], S[1], 16);
    if (!_SPR_ROLL_LEN) { _SPR_ROLL_LEN = 2.5 * Math.PI * 2 / 5; _SPR_ROLL_KIND = 'wheel'; }
    for (var tn = 0; tn < 5; tn++) {                                         /* the wheel nuts, turning as it rolls */
      var ta = (tn - (_SPR_ROLL || 0)) / 5 * Math.PI * 2;
      _r3Box(m, wx + Math.cos(ta) * 0.8, 2.5 + Math.sin(ta) * 0.8, wz, 0.4, 0.4, 3.1, S[3], S[2]);
    }
  }
  _r3Box(m, 0, 2.3, 0, 18.0, 1.3, 8.0, DK[1], DK[2]);                         /* chassis */
  _r3Slab(m, 6.4, 3.4, 0, 4.8, 4.6, 8.2, 0.8, VH[0], VH[1]);                   /* the cab, cab-over */
  _r3Box(m, 8.9, 5.8, 0, 0.5, 1.8, 6.6, RTS_PAL.glass, RTS_PAL.glass);
  _r3Box(m, 6.4, 8.1, 0, 4.4, 0.4, 7.6, TM[0], TM[1]);                         /* team colour on the cab roof */
  _r3Cyl(m, 6.4, 8.7, 0, 0.6, 0.9, '#e8321c', '#ff6a4a', 16);                 /* the red lamp */
  _r3Box(m, -2.6, 3.3, 0, 11.6, 0.6, 8.2, S[1], S[2]);                         /* the bed */
  for (var r = 0; r < 3; r++) for (var c = 0; c < 3; c++)                      /* the drums, nine of them */
    _r3Cyl(m, -6.6 + r * 3.6, 5.2, -2.7 + c * 2.7, 1.25, 3.2, RTS_BLAST_DRUM[0], RTS_BLAST_DRUM[1], 16);
  for (i = 0; i < 5; i++)                                                      /* the hazard band round them */
    _r3Box(m, -7.8 + i * 2.6, 7.2, 0, 1.3, 0.35, 8.4, RTS_BLAST_STRIPE[i % 2], RTS_BLAST_STRIPE[i % 2]);
  return true;
}
