/* sprites/ore.js - ore, in four density stages. Part of rts.sprites. */

/* THE GROUND IS BAKED AT RTS_PS, LIKE EVERYTHING STANDING ON IT.

   RTS_PS was introduced for the things that stand up - models.js and props.js scale their
   models by it and tag the canvas - and was never applied to anything the ground is made of.
   Measured, that left the two halves of the same frame at different densities: at max zoom on
   a 3x phone one BUILDING art pixel covered 9 device pixels of area and one ORE art pixel
   covered 36. The ground was four times coarser than the tank parked on it, and it is ~100%
   of the frame behind ~10% sprite coverage. That is what "chunky yellow squares" means.

   Ore is the cheap half of the fix: the whole ore and gem set is 24 canvases - 0.06 MB of a
   58 MB sprite budget - so baking it at RTS_PS costs about 83 KB. And it needs NO renderer
   change, because render/frame.js already draws ore with an explicit destination size of one
   cell rather than through the TSscale path, so a finer canvas simply lands with more pixels
   inside the same world square. The canvas is tagged `ps` anyway, so anything that later
   routes ore through the sprite path divides correctly.

   The nuggets keep their COUNT and their fraction of a cell - the field must not get denser
   or coarser, it must get finer - so the extra pixels are spent on structure the 2px nugget
   had no room for: a cast shadow, a lit facet, a dark side and a glint. */

/* One crystal. Written to degrade: at RTS_PS = 1 the facets collapse to the 1px features the
   original had, so this is the same picture at 24px and a faceted lump at 48. Light comes
   from the upper left, matching R3_LIGHT, so ore agrees with the buildings around it. */
function _sprCrystal(g, x, y, w, h, P) {
  var lit = Math.max(1, Math.round(w * 0.6)), dark = Math.max(1, Math.round(w * 0.25));
  _sprRect(g, x, y + Math.max(1, Math.round(h * 0.45)), w, h, P[3]);   /* cast shadow */
  _sprRect(g, x, y, w, h, P[0]);                                       /* body */
  _sprRect(g, x + w - dark, y, dark, h, P[3]);                         /* shaded right face */
  _sprRect(g, x, y, lit, Math.max(1, Math.round(h * 0.5)), P[1]);      /* lit top facet */
  _sprRect(g, x, y, Math.max(1, Math.round(w * 0.3)), 1, P[2]);        /* glint */
}

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
  var out = [], PS = RTS_PS, TS = RTS_TS * PS;
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
        var ur = (4 + _sprHash(ub, ub, seed + 47) * 5) * PS;
        for (var uo = 0; uo < 9; uo++) {
          var wx2 = ux + (uo % 3 - 1) * TS, wy2 = uy + ((uo / 3 | 0) - 1) * TS;
          if (wx2 < -ur - 1 || wx2 > TS + ur || wy2 < -ur - 1 || wy2 > TS + ur) continue;
          _sprDisc(g, wx2, wy2, ur, P[3]);
          _sprDisc(g, wx2 - PS, wy2 - PS, ur * 0.6, P[4] || P[0]);
        }
      }
      g.globalAlpha = 1;
      /* COUNT is per cell and stays fixed - the field must get finer, not denser. Only the
         crystals' pixel size scales, so each one covers the same fraction of a cell as before
         and simply has room for facets. */
      var n = [8, 17, 30, 44][st];
      for (var i = 0; i < n; i++) {
        var x = _sprHash(i, v, seed) * TS, y = _sprHash(v, i, seed + 5) * TS;
        var big = _sprHash(i, i, seed + 9) < 0.35;
        var w = (big ? 3 : 2) * PS, h = (big ? 3 : 2) * PS;
        /* Drawn wrapped, so a cluster runs across the cell edge and a worked field reads
           as one continuous deposit instead of a grid of identical stamps. */
        for (var oy = -1; oy <= 1; oy++) {
          for (var ox = -1; ox <= 1; ox++) {
            var px = x + ox * TS, py = y + oy * TS;
            if (px < -4 * PS || px > TS + PS || py < -4 * PS || py > TS + PS) continue;
            _sprCrystal(g, px, py, w, h, P);
          }
        }
      }
      t.c.ps = PS;
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
  var out = [], PS = RTS_PS, TS = RTS_TS * PS, W = RTS_PAL.water, n;
  for (var f = 0; f < 4; f++) {
    var t = _sprMake(TS, TS), g = t.g;
    for (n = 0; n < 22; n++) {
      var x = _sprHash(n, 3, 41) * TS, y = _sprHash(3, n, 47) * TS;
      /* The highlight walks along each crest rather than blinking on and off. */
      var ph = (n + f) & 3;
      if (ph > 1) continue;
      var len = (3 + (_sprHash(n, n, 53) * 5 | 0)) * PS;
      _sprRect(g, x + f * PS, y, len, PS, ph === 0 ? W[3] : W[4]);
      _sprRect(g, x + (f + 1) * PS, y + PS, Math.max(PS, len - 2 * PS), PS, W[1]);
    }
    t.c.ps = PS;
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

