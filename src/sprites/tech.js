/* sprites/tech.js - the tech buildings (core/tech.js). Part of rts.sprites.

   Civilian work, not military: an oil derrick's lattice tower over its pump and tank; a field
   hospital's white tents round a red cross; a machine shop's open-fronted shed with a crane arm; an
   airstrip's runway with a hangar and a windsock. Their roofs take the holder's colour once one is
   taken (B.roof), as every building's does. */
function _sprBldCivTech(X, key) {
  var m = X.m, W = X.W, D = X.D, C = X.C, S = X.S, B = X.B, WH = X.WH, DK = X.DK, i;
  if (key === 'derrick') {
    _r3Box(m, 0, 0, 0, W - 6, 2, D - 6, C[2], C[0]);
    for (i = 0; i < 4; i++) {                                              /* the lattice tower */
      var lx = (i % 2 ? 1 : -1) * 3, lz = (i < 2 ? 1 : -1) * 3;
      _r3Box(m, -4 + lx * 0.6, 2, -2 + lz * 0.6, 0.6, 18, 0.6, S[1], S[3]);
    }
    for (i = 0; i < 4; i++) _r3Box(m, -4, 4 + i * 4, -2, 4.4 - i * 0.6, 0.4, 4.4 - i * 0.6, S[2], S[3]);
    _r3Box(m, 5, 2, 4, 6, 3, 2, DK[1], DK[2]);                              /* the pump */
    _r3Box(m, 7.4, 5.4, 4, 6, 0.8, 0.8, DK[0], DK[1]);                       /* its beam */
    _r3Cyl(m, 6, 2, -6, 4, 6, S[1], B.roof, 20);                             /* the tank, roof in the holder's colour */
    return true;
  }
  if (key === 'hospital') {
    _r3Box(m, 0, 0, 0, W - 6, 2, D - 6, C[2], C[0]);
    for (i = 0; i < 2; i++) {                                               /* two ward tents */
      var tz = -6 + i * 12;
      _r3Box(m, 0, 2, tz, W - 14, 4, 7, '#e8e6dc', '#f6f4ea');
      _r3Box(m, 0, 6, tz, W - 14, 1.2, 5, '#dcdad0', B.roof);
    }
    _r3Box(m, 0, 8.6, 0, 8, 0.4, 2.4, '#c8302a', '#e04a3a');                 /* the red cross, on top */
    _r3Box(m, 0, 8.6, 0, 2.4, 0.4, 8, '#c8302a', '#e04a3a');
    return true;
  }
  if (key === 'mshop') {
    _r3Box(m, 0, 0, 0, W - 6, 2, D - 6, C[2], C[0]);
    _r3Box(m, -4, 2, 0, W - 18, 8, D - 10, WH[1], WH[3]);                    /* the shed */
    _r3Box(m, -4, 10, 0, W - 16, 1, D - 8, B.roof, B.roof);
    _r3Box(m, W / 2 - 10, 2, 0, 1.2, 1.2, D - 12, DK[0], DK[1]);             /* the open front's inspection pit */
    _r3Box(m, 8, 2, -8, 1, 13, 1, S[1], S[3]);                               /* the crane post */
    _r3Box(m, 8, 15, -4, 1, 1, 9, S[1], S[3]);                               /* ...and its arm */
    _r3Box(m, 8, 11, 0, 0.3, 4, 0.3, DK[2], DK[3]);                          /* the hook's line */
    X.facade(3, 2, (W - 18) / 2, (D - 10) / 2);                              /* the shed's windows */
    for (i = 0; i < 3; i++) _r3Cyl(m, -W / 2 + 6 + i * 2.6, 2, D / 2 - 6, 1.1, 3, '#7a2a1e', '#9a3a2a', 16);   /* oil drums */
    for (i = 0; i < 3; i++) _r3Cyl(m, W / 2 - 6, 2 + i * 1.3, D / 2 - 6, 1.8, 1.2, DK[0], DK[1], 16);   /* a stack of tyres */
    return true;
  }
  if (key === 'airstrip') {
    _r3Box(m, 0, 0, 0, W - 4, 1.2, D - 4, '#4a4e54', '#5a5e64');            /* the runway */
    for (i = 0; i < 6; i++) _r3Box(m, -W / 2 + 8 + i * (W - 16) / 5, 1.3, 0, 3, 0.1, 0.8, '#e8e6dc', '#f6f4ea');
    _r3Box(m, -W / 2 + 12, 1.2, -D / 2 + 9, 14, 8, 10, WH[1], WH[3]);        /* the hangar */
    _r3Box(m, -W / 2 + 12, 9.2, -D / 2 + 9, 15, 1.2, 11, B.roof, B.roof);
    _r3Box(m, W / 2 - 6, 1.2, -D / 2 + 6, 0.5, 8, 0.5, S[1], S[3]);          /* the windsock's mast */
    _r3Box(m, W / 2 - 4.6, 8.4, -D / 2 + 6, 2.8, 1.0, 1.0, '#ff8a3a', '#f6f4ea');
    return true;
  }
  return false;
}
