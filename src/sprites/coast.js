/* sprites/coast.js - the generated map's shoreline, painted into the terrain bake.
   Part of rts.sprites. Split from sprites/terrain.js, which it pushed past the 500-line cap.

   THE COASTLINE IS DRAWN, not left as a cell boundary. The flat ground fills meet at raw
   cell edges, and between colours as far apart as water and grass a 24-pixel step is the most
   legible straight line on the map - the shore read as a staircase of blue rectangles. RA
   ships 38 water-cliff templates for exactly this meeting; this is the generated map's
   equivalent, painted rather than fitted.

   Per boundary WATER cell: a shallow band along each land edge, its width wobbled by the
   same value-noise the ground fills use so the waterline wanders inside the tile instead
   of tracing the grid, and a broken foam line where the wobbled band meets the land. Per
   boundary SAND cell: a wet-sand darkening along the water edge. Called for procedural maps
   only - on a real map the author drew the shore, and terrain.js skips the call. */
function _sprCoast(g, G, seed, authored, tileAt) {
  var N = RTS_N, TS = RTS_TS, tx, tz;

  var _shal = ['#4a7ba6', '#5b8fb8'];               /* lightened water, toward the sky */
  var _foam = '#cfe3ee';
  var _wet = ['#8a7b57', '#7d6f4e'];                /* sand, darkened as if soaked */
  for (tz = 0; tz < N; tz++) {
    for (tx = 0; tx < N; tx++) {
      var ck = G.terrain[_rtsIdx(tx, tz)];
      if (authored && authored[_rtsIdx(tx, tz)]) continue;
      var cu = tileAt(tx, tz - 1), cd = tileAt(tx, tz + 1),
          cl = tileAt(tx - 1, tz), cr = tileAt(tx + 1, tz);
      var W2 = RTS_T_WATER;
      if (ck === W2) {
        var lu = cu !== W2 && cu !== -1, ld = cd !== W2 && cd !== -1,
            ll = cl !== W2 && cl !== -1, lr = cr !== W2 && cr !== -1;
        if (!lu && !ld && !ll && !lr) continue;
        for (var cy2 = 0; cy2 < TS; cy2++) {
          for (var cx2 = 0; cx2 < TS; cx2++) {
            var gx2 = tx * TS + cx2, gy2 = tz * TS + cy2;
            /* distance to the nearest LAND edge, wobbled so the waterline wanders */
            var dd = 99;
            if (lu) dd = Math.min(dd, cy2);
            if (ld) dd = Math.min(dd, TS - 1 - cy2);
            if (ll) dd = Math.min(dd, cx2);
            if (lr) dd = Math.min(dd, TS - 1 - cx2);
            var wob = (_sprVN(gx2, gy2, 6, seed + 171) - 0.5) * 5;
            var d2 = dd + wob;
            if (d2 < 1.6) {
              /* Foam in CLUMPS. A per-pixel coin flip is white noise, and white noise
                 magnified four times at the top zoom is a band of hard speckle rather than
                 surf. Hashing the 2x2 block gives lumps with gaps between them - the same
                 demotion the ground grain went through when it stopped being TV static. */
              if (_sprHash(gx2 >> 1, gy2 >> 1, seed + 173) > 0.4) {
                _sprRect(g, gx2, gy2, 1, 1, _foam);
              }
            } else if (d2 < 7) {
              /* NOT A CHECKERBOARD. This chose between the two shallow tones on
                 `(gx + gy) & 1` - a perfect one-pixel lattice, which is the most artificial
                 pattern there is. At the default zoom it passes for a dither blending the pair
                 into an intermediate tone; magnified four times at the top zoom the lattice
                 itself is what you see, and it runs the entire length of every coast on the
                 map. A smooth field at about five pixels mixes the same two tones into patches
                 instead, which is how the ground already solves exactly this. */
              _sprRect(g, gx2, gy2, 1, 1,
                       _shal[_sprVN(gx2, gy2, 5, seed + 181) < 0.5 ? 0 : 1]);
            }
          }
        }
      } else if (ck === RTS_T_SAND) {
        var wu = cu === W2, wd = cd === W2, wl = cl === W2, wr = cr === W2;
        if (!wu && !wd && !wl && !wr) continue;
        for (var sy2 = 0; sy2 < TS; sy2++) {
          for (var sx2 = 0; sx2 < TS; sx2++) {
            var gx3 = tx * TS + sx2, gy3 = tz * TS + sy2;
            var ds = 99;
            if (wu) ds = Math.min(ds, sy2);
            if (wd) ds = Math.min(ds, TS - 1 - sy2);
            if (wl) ds = Math.min(ds, sx2);
            if (wr) ds = Math.min(ds, TS - 1 - sx2);
            var wob2 = (_sprVN(gx3, gy3, 6, seed + 177) - 0.5) * 4;
            /* the same lattice as the shallow band above, and the same fix - wet sand is two
               tones apart, so a one-pixel checkerboard of them reads as a woven mat at zoom */
            if (ds + wob2 < 5) {
              _sprRect(g, gx3, gy3, 1, 1,
                       _wet[_sprVN(gx3, gy3, 4, seed + 187) < 0.5 ? 0 : 1]);
            }
          }
        }
      }
    }
  }
}
