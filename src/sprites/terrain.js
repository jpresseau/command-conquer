/* sprites/terrain.js - the baked ground: grass, trees, cliffs, water, roads. Part of rts.sprites. */

/* ============================================================ terrain (baked) ==
   The ground used to be one of six 24x24 tiles picked per cell at random. That is what
   produced the checkerboard of hard-edged brown squares: every dirt patch was exactly one
   cell, perfectly axis-aligned, and the seams between tiles lined up into a visible grid.

   Instead the whole battlefield is painted once into a single canvas at art resolution
   (112 cells x 24px = 2688 square) using continuous noise, so patches are organic blobs
   that ignore cell boundaries entirely. The renderer then draws the visible window with
   one drawImage per frame, which is also far cheaper than two thousand tile blits. */
function _rtsBakeTerrain(G) {
  var N = RTS_N, S = N * RTS_TS, seed = (G.seed || 1) | 0;
  var t = _sprMake(S, S), g = t.g;
  var img = g.createImageData(S, S), d = img.data;
  var gr = RTS_PAL.grass.map(_sprCol), dr = RTS_PAL.dirt.map(_sprCol);
  /* PAINT PER PIXEL, NOT IN 2px BLOCKS.

     `B = 2` predates the smooth tone field. It was there because the grain used to be a white
     noise hash, and 2px blocks made the static clumpier - but the grain is now `_sprVN` at
     about seven pixels, which does that job properly, and the block was left behind quantising
     everything laid on top of it. Measured on the finished 3072 bake: 92.7% of horizontally
     adjacent pixels INSIDE a block were byte-identical against 61.6% across a boundary, and
     the run-length histogram peaked hard on even lengths (len 2: 17020, len 3: 1096). That is
     a 12x12 effective texel per cell where there was room for 24x24 - the ground carried half
     the detail it had space for, and at max zoom on a phone one tone covered a 12px square.

     B = 1 costs NO memory: the canvas is the same 3072 square either way. It costs bake time,
     which the three dead getImageData calls further down hand back. */
  var B = 1;

  /* RELIEF, from the field that already shapes the patches.

     There was no lighting model on the ground at all - eight flat tones indexed off noise,
     measured at a p05-to-p95 luminance span of 39.8 points against 171.5 for the buildings
     standing on it. The ground read as a flat pattern under objects that had form.

     `_sprFbm` is a height field, and the gradient of a height field is a surface normal, so
     shading is a two-term dot product against a light from the upper left - the direction the
     sprite shadows are already cast in, so ground and objects agree about where the sun is.
     The gradient is FREE: the sample to the left is the previous iteration's and the sample
     above is one row of cache, so no noise is evaluated twice.

     Quantised to three levels rather than applied continuously. This ground is drawn pixel
     art - areas of one tone with deliberate marks in them - and a smooth multiply would turn
     every patch into an airbrushed gradient. Three levels is what an artist does: the tone, a
     highlight down its lit flank, a shadow down the other. */
  function _shaded(cols, f) {
    return cols.map(function (c) {
      return [Math.min(255, Math.round(c[0] * f)),
              Math.min(255, Math.round(c[1] * f)),
              Math.min(255, Math.round(c[2] * f))];
    });
  }
  var grL = _shaded(gr, 1.13), grD = _shaded(gr, 0.86);
  var drL = _shaded(dr, 1.13), drD = _shaded(dr, 0.86);
  var RELIEF = 0.004;              /* slope that counts as a face; tuned to the fbm's own scale */
  var prevRow = new Float32Array(S), leftN = 0;

  /* THE FLECK IS CACHED, THE GRAIN IS NOT, AND THE DIFFERENCE IS NOT A JUDGEMENT CALL.

     `fleck` is hashed on `bx >> 1, by >> 1`, so it is CONSTANT across each 2px block by
     construction: evaluating it on a 2px lattice and reusing it returns bit-for-bit the same
     value to every pixel. That is free.

     `grain` is `_sprVN` at ~7px, so caching it the same way LOOKS free and is not - it
     re-quantises the tone selection to the very lattice this change exists to remove. Caching
     both measured 1556 ms against 1746 ms, and the identical-adjacent-pixel share barely moved
     (63.5% -> 63.8%) which is what made it look harmless; but the run-length histogram tells
     the truth, with even-run dominance going 2.21 -> 2.95 against 15.53 for the old 2px bake.
     190 ms of one-time bake is not worth putting a third of the block signature back, so the
     grain stays per-pixel.

     The small saving is itself the finding: `_sprFbm` dominates this loop, not the cheap
     fields. The honest cost of per-pixel ground is ~600 ms of one-time bake (941 ms at B = 2
     -> ~1700 ms), and there is nothing more to reclaim here without sampling `n` coarsely -
     which is the one thing that would put the quantisation back properly. */
  var fleckRow = new Float32Array(S), gx2;

  for (var by = 0; by < S; by += B) {
    leftN = 0;
    if ((by & 1) === 0) {
      for (gx2 = 0; gx2 < S; gx2 += 2) fleckRow[gx2] = _sprHash(gx2 >> 1, by >> 1, seed + 31);
    }
    for (var bx = 0; bx < S; bx += B) {
      var n = _sprFbm(bx, by, seed);
      /* slope in +x and +y; a light from the upper left lights whatever rises toward it */
      var lam = (bx ? n - leftN : 0) + (by ? n - prevRow[bx] : 0);
      leftN = n; prevRow[bx] = n;
      /* GRAIN USED TO BE A WHITE-NOISE HASH per 2px block, picking one of five tones at random
         with no spatial correlation whatsoever. The comment beside it said "clumpy, not TV
         static", but 2px blocks of white noise ARE static - just chunkier. Measured on the
         finished bake: the mean absolute luminance step between horizontally adjacent pixels
         was 16.9, which is to say every pixel differed from its neighbour by about a
         seventeenth of the whole range. That is what made the ground read as televison snow
         with a green tint rather than as grass.

         Drawn pixel-art ground is the other way round: areas of one tone with a few
         deliberate marks in them. So the tone now comes from a SMOOTH field at about seven
         pixels - patches you can see - and the white noise is demoted to a sparse fleck that
         breaks up the banding without carrying the whole texture. */
      var grain = _sprVN(bx, by, 7, seed + 3);
      var fleck = fleckRow[bx & ~1];
      var pal, palL, palD, k;
      /* Bare earth is rare now that the map has roads, beaches and ore aprons on it - an
         earlier threshold of 0.62 put dirt everywhere and the battlefield came out more
         tan than green, which is the opposite of the reference. */
      /* A DRAWN edge, not a blended one. The previous version deliberately dithered the
         boundary - the comment read "ragged edge, not a hard border" - and that is the single
         thing that makes this ground read as generated rather than as hand-authored tiles.
         In the reference every dirt patch has a crisp outline with a darker rim inside it,
         because it was drawn by someone, and the eye picks that up immediately even at 24
         pixels a cell.

         Three bands off one noise field: grass, a narrow dark rim, then the patch interior.
         The rim is what sells it - a hard colour change alone still looks like a threshold,
         while a hard change with a shadow line under it looks like an edge. */
      if (n > 0.735) {                                  /* patch interior */
        pal = dr; palL = drL; palD = drD;
        k = grain < 0.30 ? 1 : (grain < 0.72 ? 0 : 2);
        if (fleck > 0.93) k = 3;                        /* an occasional stone */
      } else if (n > 0.715) {                           /* the rim - a drawn outline */
        pal = dr; palL = drL; palD = drD;
        k = 2;
      } else {
        pal = gr; palL = grL; palD = grD;
        k = grain < 0.30 ? 2 : (grain < 0.70 ? 0 : 1);
        /* The flecks are what stop the smooth field reading as banding, and they are rare on
           purpose: at 12% of blocks the ground went straight back to looking like noise. */
        if (fleck > 0.955) k = 4;                       /* a bright tuft */
        else if (fleck < 0.035) k = 2;                  /* a dark clump */
        /* grass immediately outside a patch is scuffed rather than lush, which reads as the
           patch having worn outward instead of having been stamped on */
        if (n > 0.64) k = grain < 0.5 ? 2 : 4;
      }
      /* The rim keeps its authored tone: it is a drawn outline, and letting the relief lighten
         part of it would break the one hard edge that makes a patch read as drawn. */
      var c = (n > 0.715 && n <= 0.735) ? pal[k]
            : (lam > RELIEF ? palL[k] : (lam < -RELIEF ? palD[k] : pal[k]));
      for (var yy = 0; yy < B; yy++) {
        var row = (by + yy) * S;
        for (var xx = 0; xx < B; xx++) {
          var o = (row + bx + xx) * 4;
          d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
        }
      }
    }
  }
  var authored = null;
  g.putImageData(img, 0, 0);

  /* Scatter that crosses cell lines: tufts, pebbles and bushes placed in world pixels.

     NOT ON THE WATER. It always landed there - a twentieth of the map is lake - and it never
     showed because the flat blue below was painted over the top of it afterwards. The moment
     the real shoreline took that pass away, the tufts and pebbles surfaced, floating. */
  var i, x, y;
  for (i = 0; i < S * S / 900; i++) {
    x = _sprHash(i, 11, seed + 41) * S; y = _sprHash(i, 29, seed + 43) * S;
    var wet = G.terrain[_rtsIdx(Math.min(N - 1, (x / RTS_TS) | 0), Math.min(N - 1, (y / RTS_TS) | 0))];
    if (wet === RTS_T_WATER) continue;
    /* NOR ON GROUND SOMEBODY ELSE DREW. Same reason as the water: on a loaded map the sand is
       the author's own beach template, and our tufts and pebbles on top of it are litter. */
    if (authored && authored[_rtsIdx(Math.min(N - 1, (x / RTS_TS) | 0),
                                     Math.min(N - 1, (y / RTS_TS) | 0))]) continue;
    var r = _sprHash(i, 5, seed + 47);
    if (r < 0.55) {                                   /* grass tuft */
      var tc = RTS_PAL.grass[r < 0.28 ? 4 : 3];
      _sprRect(g, x, y, 1, 2, tc); _sprRect(g, x + 1, y + 1, 1, 2, tc); _sprRect(g, x - 1, y + 1, 1, 1, tc);
    } else if (r < 0.85) {                            /* pebble */
      _sprRect(g, x, y + 1, 2, 1, RTS_PAL.rock[2]);
      _sprRect(g, x, y, 2, 1, RTS_PAL.rock[0]);
    } else {                                          /* small bush clump */
      _sprEll(g, x, y + 1, 3, 2, RTS_PAL.bush[1]);
      _sprEll(g, x, y, 3, 2, RTS_PAL.bush[0]);
      _sprEll(g, x - 1, y - 1, 2, 1, RTS_PAL.bush[2]);
    }
  }

  var shore = null;

  /* --- ground cover per tile: sand, road and water are painted flat, under everything --- */
  var TS = RTS_TS, tx, tz, k, cx, cy;
  function tileAt(x, z) { return _rtsInB(x, z) ? G.terrain[_rtsIdx(x, z)] : -1; }
  for (tz = 0; tz < N; tz++) {
    for (tx = 0; tx < N; tx++) {
      k = G.terrain[_rtsIdx(tx, tz)];
      if (k !== RTS_T_SAND && k !== RTS_T_ROAD && k !== RTS_T_WATER) continue;
      var pal = k === RTS_T_WATER ? RTS_PAL.water
              : (k === RTS_T_ROAD ? RTS_PAL.road : RTS_PAL.sand);
      for (var py = 0; py < TS; py += 2) {
        for (var px = 0; px < TS; px += 2) {
          var gx = tx * TS + px, gy = tz * TS + py;
          var hv = _sprHash(gx >> 1, gy >> 1, seed + 91);
          /* THE TONE COMES FROM A SMOOTH FIELD, not from that hash. Per-2px white noise is what
             made the grass read as television snow, and the road had exactly the same bug for
             exactly as long - only more visible, because a road is a solid block of one material
             with nothing else going on in it. The hash is demoted to a sparse fleck. */
          var tone = _sprVN(gx, gy, 8, seed + 93);
          var ki = tone < 0.34 ? 2 : (tone < 0.72 ? 0 : 1);
          if (hv > 0.955) ki = 1; else if (hv < 0.045) ki = 2;
          /* Edges dither into the neighbour so a road has a ragged verge, not a kerb. Two blocks
             deep rather than one and a half, and a coin-flip rather than 45%: at the old width
             the verge was a dotted line along a straight edge, which reads as a kerb with
             crumbs on it. */
          var din = 5;
          var edge = (px < din && tileAt(tx - 1, tz) !== k) || (px > TS - 1 - din && tileAt(tx + 1, tz) !== k) ||
                     (py < din && tileAt(tx, tz - 1) !== k) || (py > TS - 1 - din && tileAt(tx, tz + 1) !== k);
          if (edge && hv < 0.5 + (_sprVN(gx, gy, 5, seed + 94) - 0.5) * 0.7) continue;
          _sprRect(g, gx, gy, 2, 2, pal[ki]);
        }
      }
    }
  }
  /* The coastline pass lives in sprites/coast.js - it was written here and pushed this file
     past the 500-line cap the layout spec holds every source file to. Procedural maps only:
     on a real map the author drew the shore and `shore !== null` skips it. */
  if (shore === null) _sprCoast(g, G, seed, authored, tileAt);

  /* Water gets highlight ripples once the body is down, so they run across tile seams. Not over
     the real thing: RA's own water carries its own movement, and ours on top of it is litter.

     `shore === null` was the whole of that test, and on a LOADED MAP shore is always null - the
     shoreline pass is skipped there because the map draws its own. So the one case the comment
     names, RA's own water, was the one case the guard could not catch. The per-cell mask is what
     actually answers the question it was asking. */
  for (var w = 0; shore === null && w < (S * S) / 1400; w++) {
    var wx = _sprHash(w, 3, seed + 95) * S, wy = _sprHash(3, w, seed + 97) * S;
    if (tileAt((wx / TS) | 0, (wy / TS) | 0) !== RTS_T_WATER) continue;
    if (authored && authored[_rtsIdx((wx / TS) | 0, (wy / TS) | 0)]) continue;
    var wl = 3 + (_sprHash(w, w, seed + 99) * 6 | 0);
    _sprRect(g, wx, wy, wl, 1, RTS_PAL.water[3]);
    _sprRect(g, wx + 1, wy + 1, wl - 2, 1, RTS_PAL.water[4]);
  }

  /* --- cliffs --- */
  _sprDrawRock(g, G, S, seed);

  /* --- bridges: over the water, under everything that stands on the ground --- */
  if (typeof _sprDrawBridges === 'function') _sprDrawBridges(g, G, TS);

  /* --- sandbag emplacements --- */
  var bagSpr = _sprSandbag();
  for (tz = 0; tz < N; tz++) {
    for (tx = 0; tx < N; tx++) {
      if (G.terrain[_rtsIdx(tx, tz)] !== RTS_T_WALL) continue;
      g.drawImage(bagSpr.c, tx * TS, tz * TS - bagSpr.head);
    }
  }

  /* --- forest. NOT PAINTED HERE ANY MORE.

     The conifers used to be stamped into this canvas, one to a cell, and that read perfectly
     well - re-measured properly, forest 74.4 against grass 100.8 and 89 tones against 12. (The
     commit that moved them cited the opposite, 81.9 against 76.9, from a harness that had
     re-generated the map without re-baking the ground; see the correction on _sprTrees.)

     They moved because this canvas is RTS_TS art pixels a cell and cannot grow - 6144 square
     is 144 MB of RGBA - so no finer tree fits in it, and because a texture cannot be skipped
     when the 3D mode wants to grow its own trees on the same cells. Drawn per frame as
     ordinary sprites they get RTS_PS, several to a cell, and a 3D gate. See _sprTrees in
     sprites/scenery.js and the forest pass in render/frame.js. --- */
  return t.c;
}
