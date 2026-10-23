/* sprites/deep.js - the Sonar Dolphin, the Kraken, the Sea Hornet and the Bombard (core/deep.js).
   Part of rts.sprites.

   The Dolphin and the Kraken are animals, so they carry no team colour on a hull - a collar band
   says whose they are. The Dolphin is a long grey body of slices, a dorsal fin and a flat tail; the
   Kraken a purple mantle with eight arms spread on the water round it. The Sea Hornet is a small,
   fast hull with a twin flak mount forward; the Bombard the longest hull afloat after the Carrier,
   its deck a block of missile cells. */
var RTS_DEEP_SKIN = { dolphin: ['#7d8a96', '#a9b6c2'], kraken: ['#5a2e6a', '#8a4a9a'] };

function _sprUnitDeep(X, key) {
  var m = X.m, VH = X.VH, TM = X.TM, S = X.S, DK = X.DK, GN = X.GN, i, a;
  if (key === 'dolphin') {
    var C = RTS_DEEP_SKIN.dolphin;
    for (i = 0; i < 10; i++) {                                         /* the body */
      var x = -9 + i * 2, u = (x - 1) / 10, r = 2.4 * Math.sqrt(Math.max(0.05, 1 - u * u));
      _r3Wheel(m, x, 1.6, 0, r, 2.05, 'x', C[i % 2 ? 1 : 0], C[1], 18);
    }
    _r3Box(m, 0.5, 4.2, 0, 3.0, 2.2, 0.5, C[0], C[1]);                  /* the dorsal fin */
    _r3Box(m, -10.4, 1.6, 0, 1.4, 0.4, 6.0, C[0], C[1]);                /* the flukes */
    _r3Box(m, 9.8, 1.4, 0, 2.4, 0.9, 1.0, C[1], C[1]);                  /* the beak */
    _r3Wheel(m, 4.0, 1.6, 0, 2.3, 0.6, 'x', TM[1], TM[3], 18);          /* the collar: whose it is */
    return true;
  }
  if (key === 'kraken') {
    var K = RTS_DEEP_SKIN.kraken;
    _r3Cyl(m, 0, 0.4, 0, 3.8, 2.2, K[0], K[1], 24);                     /* the mantle */
    _r3Cone(m, 0, 2.6, 0, 3.8, 1.2, 3.4, K[1], 24);
    for (i = 0; i < 8; i++) {                                          /* eight arms, spread */
      a = i / 8 * Math.PI * 2;
      for (var s = 0; s < 3; s++) {
        var rr = 4.2 + s * 2.4, w = 1.1 - s * 0.3;
        _r3Box(m, Math.cos(a + s * 0.15) * rr, 0.6, Math.sin(a + s * 0.15) * rr, w * 2, 0.6, w * 2, K[0], K[1]);
      }
    }
    _r3Cyl(m, 0, 2.6, 0, 3.9, 0.5, TM[1], TM[3], 24);                   /* the collar: whose it is */
    _r3Box(m, 3.2, 2.2, -1.2, 0.6, 0.6, 0.6, '#f2e85a', '#f2e85a');      /* the eyes */
    _r3Box(m, 3.2, 2.2, 1.2, 0.6, 0.6, 0.6, '#f2e85a', '#f2e85a');
    return true;
  }
  if (key === 'seahornet') {
    _r3Slab(m, 0, 0.6, 0, 16, 2.8, 6.0, 1.2, VH[0], VH[1]);             /* hull */
    _r3Box(m, 6.6, 0.9, 0, 3.4, 2.2, 3.4, VH[1], VH[3]);                /* bow */
    _r3Box(m, -2.0, 3.6, 0, 5.0, 2.4, 4.0, VH[2], VH[0]);               /* wheelhouse */
    _r3Box(m, -2.0, 5.0, 0, 3.6, 0.6, 3.0, TM[1], TM[3]);
    _r3Cyl(m, 3.4, 3.2, 0, 1.6, 1.4, DK[1], DK[2], 16);                 /* the flak mount */
    _r3Box(m, 5.6, 4.6, -0.6, 4.2, 0.5, 0.5, GN[0], GN[2]);             /* twin barrels, raised */
    _r3Box(m, 5.6, 4.6, 0.6, 4.2, 0.5, 0.5, GN[0], GN[2]);
    _r3Box(m, -3.0, 7.4, 0, 0.5, 3.6, 0.5, S[1], S[0]);                  /* the mast */
    _r3Box(m, -3.0, 9.0, 0, 0.4, 0.4, 3.2, S[2], S[3]);                  /* its radar bar */
    for (var rl = -1; rl <= 1; rl += 2) {
      _r3Box(m, 0, 2.6, rl * 2.9, 12, 0.6, 0.25, S[2], S[3]);            /* the rails */
      _r3Cyl(m, -6.0, 2.4, rl * 2.2, 0.8, 0.9, '#e8e2d0', '#ff8a3a', 12); /* the life rafts */
    }
    return true;
  }
  if (key === 'bombard') {
    var L = 36, Wd = 11;
    _r3Slab(m, 0, 0.6, 0, L, 3.8, Wd, 1.4, VH[0], VH[1]);               /* hull */
    _r3Box(m, L * 0.42, 0.9, 0, L * 0.18, 3.2, Wd * 0.55, VH[1], VH[3]); /* bow */
    _r3Box(m, -L * 0.12, 4.6, 0, L * 0.26, 4.0, Wd * 0.6, VH[2], VH[0]); /* the bridge */
    _r3Box(m, -L * 0.12, 7.2, 0, L * 0.16, 1.2, Wd * 0.4, TM[1], TM[3]);
    _r3Cyl(m, -L * 0.24, 7.0, 0, 1.6, 4.0, DK[1], DK[0], 16);           /* funnel */
    for (var cx = 0; cx < 3; cx++) for (var cz = 0; cz < 2; cz++)       /* the missile cells, forward */
      _r3Box(m, L * 0.12 + cx * 2.6, 3.8, (cz - 0.5) * 3.0, 2.2, 1.0, 2.4, DK[0], GN[2]);
    for (var lz = -1; lz <= 1; lz += 2)                                 /* two launchers, raised, aft */
      _r3Box(m, -L * 0.36, 5.0, lz * 2.6, 6.0, 1.4, 1.6, GN[0], GN[2]);
    return true;
  }
  return false;
}
