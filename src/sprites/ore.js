/* sprites/ore.js - ore, in four density stages. Part of rts.sprites. */

/* ------------------------------------------------------------------------ ore --
   Four density stages. Nuggets are drawn wrapped - every cluster is also painted one cell
   left/right/up/down - so clusters run across cell edges and a worked field reads as
   continuous ground rather than a grid of identical stamps. Three variants per stage,
   chosen by a hash of the cell, kill the last of the repetition. */
function _sprOre(P, gem) {
  if (typeof _mixOre === 'function') {
    var real = _mixOre(gem);
    if (real) return real;
  }
  var out = [], TS = RTS_TS;
  P = P || RTS_PAL.ore;
  for (var st = 0; st < 4; st++) {
    var variants = [];
    for (var v = 0; v < 3; v++) {
      var t = _sprMake(TS, TS), g = t.g, seed = st * 977 + v * 131 + 17;
      /* THE GROUND GOES GOLD UNDER A DEPOSIT. The nuggets alone read as orange confetti
         scattered on grass, because grass shows between them at every density - in the
         reference a worked field is a stained patch of ground with crystals ON it, and the
         stain is most of what makes a field read as one deposit instead of speckle. Painted
         first, wrapped exactly like the nuggets so the stain also runs across cell edges,
         and scaled by stage so a nearly-mined cell fades back toward bare ground. */
      var blobs = [3, 5, 8, 11][st];
      g.globalAlpha = 0.34;
      for (var ub = 0; ub < blobs; ub++) {
        var ux = _sprHash(ub, 7, seed + 41) * TS, uy = _sprHash(7, ub, seed + 43) * TS;
        var ur = 4 + _sprHash(ub, ub, seed + 47) * 5;
        for (var uo = 0; uo < 9; uo++) {
          var wx2 = ux + (uo % 3 - 1) * TS, wy2 = uy + ((uo / 3 | 0) - 1) * TS;
          if (wx2 < -ur - 1 || wx2 > TS + ur || wy2 < -ur - 1 || wy2 > TS + ur) continue;
          _sprDisc(g, wx2, wy2, ur, P[3]);
          _sprDisc(g, wx2 - 1, wy2 - 1, ur * 0.6, P[4] || P[0]);
        }
      }
      g.globalAlpha = 1;
      var n = [8, 17, 30, 44][st];
      for (var i = 0; i < n; i++) {
        var x = _sprHash(i, v, seed) * TS, y = _sprHash(v, i, seed + 5) * TS;
        var big = _sprHash(i, i, seed + 9) < 0.35;
        var w = big ? 3 : 2, h = big ? 3 : 2;
        /* Drawn wrapped, so a cluster runs across the cell edge and a worked field reads
           as one continuous deposit instead of a grid of identical stamps. */
        for (var oy = -1; oy <= 1; oy++) {
          for (var ox = -1; ox <= 1; ox++) {
            var px = x + ox * TS, py = y + oy * TS;
            if (px < -4 || px > TS + 1 || py < -4 || py > TS + 1) continue;
            _sprRect(g, px, py + 1, w, h, P[3]);            /* the crystal's own shadow */
            _sprRect(g, px, py, w, h, P[0]);
            _sprRect(g, px, py, w - 1, 1, P[1]);            /* lit facet */
            _sprRect(g, px, py, 1, 1, P[2]);                /* glint */
          }
        }
      }
      variants.push(t.c);
    }
    out.push(variants);
  }
  return out;
}

/* Water shimmer, as a cycle of overlay frames.

   CONQUER.CPP animates water by ROTATING A BAND OF PALETTE ENTRIES one step every quarter
   second - the colours move through the pixels while the pixels stay put. With no indexed
   palette to rotate, the equivalent is a short cycle of highlight overlays drawn over the
   baked water: same effect, same cadence. A static lake is one of the deadest things on a
   map, and mine was static. */
function _sprWaterCycle() {
  var out = [], TS = RTS_TS, W = RTS_PAL.water, n;
  for (var f = 0; f < 4; f++) {
    var t = _sprMake(TS, TS), g = t.g;
    for (n = 0; n < 22; n++) {
      var x = _sprHash(n, 3, 41) * TS, y = _sprHash(3, n, 47) * TS;
      /* The highlight walks along each crest rather than blinking on and off. */
      var ph = (n + f) & 3;
      if (ph > 1) continue;
      var len = 3 + (_sprHash(n, n, 53) * 5 | 0);
      _sprRect(g, x + f, y, len, 1, ph === 0 ? W[3] : W[4]);
      _sprRect(g, x + f + 1, y + 1, Math.max(1, len - 2), 1, W[1]);
    }
    out.push(t.c);
  }
  return out;
}

/* A run of sandbags, one map cell long. Baked from the 3D models like everything else, so
   the bags catch the same light as the buildings. Stamped along RTS_T_WALL cells. */
function _sprSandbag() {
  var m = [], BG = RTS_PAL.bag;
  for (var row = 0; row < 3; row++) {
    var y = row * 4, off = (row % 2) ? 4 : 0, cnt = (row % 2) ? 3 : 4;
    for (var i = 0; i < cnt; i++) {
      _r3Box(m, -RTS_TS / 2 + 4 + off + i * 8, y, 0, 8, 5, 11,
        row === 2 ? BG[1] : (row ? BG[0] : BG[2]), BG[1]);
    }
  }
  var r = _r3BakeFootprint(m, RTS_TS, RTS_TS);
  _sprEdge(r.c);
  return { c: _sprShadow(r.c, 2, 2), head: r.head };
}

