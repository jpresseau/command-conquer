/* sprites/scenery.js - the things that STAND on the baked ground: forests and rock ridges.
   Part of rts.sprites. Split from sprites/terrain.js, which it pushed past the 500-line cap -
   the same reason coast.js came out of it.

   The seam is deliberate rather than arbitrary. What stays in terrain.js paints the SURFACE,
   pixel by pixel, into one canvas: ground tone, relief, dirt patches, roads, water, shore.
   What lives here stamps an OBJECT onto that finished surface from a baked 3D model, at cell
   positions. The two halves share only the canvas context and the seed, which is why the cut
   is clean; and _sprDrawRock is called from terrain.js while _sprTrees is called from both,
   so both stay global exactly as they were. */

/* Conifers, baked from 3D like everything else. They were stacked 2D ellipses before, which
   left the forest looking like flat cut-outs while the buildings beside it had volume - and
   the forest is a fifth of the map, so it set the tone for the whole picture.

   BAKED AT RTS_PS AND DRAWN PER FRAME, not stamped into the ground canvas.

   A CORRECTION FIRST, because the commit that made this change justified it with a measurement
   that was wrong. It claimed a forest cell in the old bake measured BRIGHTER than bare grass -
   81.9 against 76.9 - and therefore that a quarter of the map was not being drawn. That number
   came from a harness that called _rtsNewGame into a live renderer without re-baking, so it
   was comparing one map's paint against another map's grid. Re-measured with that fixed (see
   the note at the end of _rtsNewGame), the old bake gave forest 74.4 against grass 100.8 and
   89 tones against 12: the one-tree-per-cell forest was perfectly legible, just sparse and
   regular. Nothing was missing.

   WHAT THIS CHANGE ACTUALLY BUYS, then, is quality rather than rescue: trees bake at RTS_PS
   instead of RTS_TS, two or three stand on a cell instead of one, and there are five variants
   instead of three, so a wood stops being a lattice of identical cones. It costs 2.3-4.7 ms a
   frame that the baked version did not, measured over the densest forest on the map.

   It also removes a real double-draw. The bake could not be improved in place - the terrain
   canvas is RTS_N * RTS_TS = 3072 square and cannot double, since 6144 square is 144 MB of
   RGBA and a dead tab on a phone - and while the trees lived in it the 3D mode drew them
   TWICE: flat ones in the ground texture underneath the conifers world3d.js grows from the
   same cells. Sprites can be skipped when the 3D mode is on; a baked texture cannot.

   FIVE VARIANTS, not three - a forest at two or three trees a cell shows its repeats far more
   readily than one at one. */
var _RTS_TREES = null;
function _sprTrees() {
  if (_RTS_TREES) return _RTS_TREES;
  /* Real trees when the player's own files are loaded. Ours next to the original's ground was
     the one thing in the first pass that looked plainly wrong - bright cones on RA's dark
     temperate grass. Those carry no `ps` and read as 1, so they draw at their own size. */
  if (typeof _mixTrees === 'function') {
    var real = _mixTrees();
    if (real) return (_RTS_TREES = real);
  }
  var TR = RTS_PAL.tree, out = [], PS = RTS_PS;
  for (var v = 0; v < 5; v++) {
    var sc = [0.74, 0.86, 1.0, 1.13, 1.28][v], m = [];
    _r3Cyl(m, 0, 0, 0, 1.6 * sc, 5 * sc, TR[4], TR[4], 8);            /* trunk */
    var tiers = (v & 1) ? 4 : 3;
    for (var i = 0; i < tiers; i++) {
      var f = i / tiers;
      var r0 = 8 * sc * (1 - f * 0.55), r1 = r0 * 0.42;
      var y = (3 + f * 13) * sc, h = 6.5 * sc;
      _r3Cone(m, 0, y, 0, r0, r1, h, i === tiers - 1 ? TR[1] : TR[0], 12);
    }
    var r = _r3BakeFootprint(PS === 1 ? m : _r3Scale(m, PS), RTS_TS * PS, RTS_TS * PS);
    var cc = _sprShadow(r.c, 3 * PS, 3 * PS);
    cc.ps = PS;
    out.push({ c: cc, head: r.head });
  }
  _RTS_TREES = out;
  return out;
}

/* The drawn cliffs. Lifted out of _rtsBakeTerrain so the real-artwork path can skip it in one
   line rather than by threading a flag through a hundred lines of painting. */
function _sprDrawRock(g, G, S, seed) {
  var N = RTS_N, TS = RTS_TS, tx, tz;
  function tileAt(x, z) { return _rtsInB(x, z) ? G.terrain[_rtsIdx(x, z)] : -1; }
  /* --- rock ridges. --------------------------------------------------------------------
     Rewritten off a continuous COVERAGE FIELD rather than per-cell rectangles. The old version
     drew each rock cell as an axis-aligned box clipped against its neighbours, and rendered it
     read as a paved plaza: you could count the 24-pixel cells along every edge, the whole
     plateau was one flat grey, and the "drop" was a thin kerb along the bottom.

     `cov` samples the cell mask at cell CENTRES and interpolates bilinearly, so its 0.5 contour
     lands exactly on the cell boundaries - the painted rock still matches the rock the
     pathfinder blocks, which is not negotiable - but it arrives there as a smooth curve instead
     of a staircase, and a noise term then breaks it up.

     Every other feature is read off that same field by asking "is there still rock this many
     pixels away": the sunlit north lip, the side walls, and the tall south drop, whose HEIGHT
     is how far the rock continues below - so a deep massif gets a full-height cliff face and a
     thin spur gets a short one, which is what makes a ridge read as a landform rather than as
     a shape with a dark line under it. --- */
  var RK = RTS_PAL.rock;
  var rockCv = _sprMake(S, S), rg = rockCv.g;
  var rimg = rg.createImageData(S, S), rd = rimg.data;
  function isRock(x, z) { return tileAt(x, z) === RTS_T_ROCK; }
  function rk(x, z) { return isRock(x, z) ? 1 : 0; }
  function cov(px, py) {
    var u = px / TS - 0.5, v = py / TS - 0.5;
    var x0 = Math.floor(u), y0 = Math.floor(v), fx = u - x0, fy = v - y0;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    var a = rk(x0, y0), b = rk(x0 + 1, y0), c2 = rk(x0, y0 + 1), e2 = rk(x0 + 1, y0 + 1);
    return (a + (b - a) * fx) * (1 - fy) + (c2 + (e2 - c2) * fx) * fy;
  }
  /* The noise amplitude is deliberately modest. At 0.55 the boundary wandered most of a cell
     and rock was painted over ground a harvester could drive through; 0.34 keeps every wander
     inside about a third of a cell, which is enough to kill the staircase and small enough
     that what you see is still what blocks. */
  function fld(px, py) {
    return cov(px, py) + (_sprVN(px, py, 9, seed + 81) - 0.5) * 0.34;
  }
  var FACE = 11;                          /* the tallest a south drop is allowed to be */
  /* The field is thresholded ONCE per 2x2 block into this mask, because every feature below
     wants to know the answer at five or six nearby points and evaluating it there directly
     cost 353 ms of the terrain bake. Zero is the correct value everywhere it is not filled:
     two cells out from any rock, cov is 0 and the noise can only reach 0.17. */
  var HS = S >> 1, FM = new Uint8Array(HS * HS);
  var NEAR = new Uint8Array(N * N);       /* cells that can hold painted rock, worked out once */
  for (tz = 0; tz < N; tz++)
    for (tx = 0; tx < N; tx++)
      if (isRock(tx, tz))
        for (var mz = -1; mz <= 1; mz++)
          for (var mx = -1; mx <= 1; mx++)
            if (_rtsInB(tx + mx, tz + mz)) NEAR[(tz + mz) * N + (tx + mx)] = 1;
  function solid(px, py) {
    var hx = px >> 1, hy = py >> 1;
    return (hx < 0 || hy < 0 || hx >= HS || hy >= HS) ? 0 : FM[hy * HS + hx];
  }
  for (tz = 0; tz < N; tz++) {
    for (tx = 0; tx < N; tx++) {
      if (!NEAR[tz * N + tx]) continue;
      for (var fy2 = tz * TS; fy2 < tz * TS + TS; fy2 += 2)
        for (var fx2 = tx * TS; fx2 < tx * TS + TS; fx2 += 2)
          if (fld(fx2, fy2) > 0.5) FM[(fy2 >> 1) * HS + (fx2 >> 1)] = 1;
    }
  }
  for (tz = 0; tz < N; tz++) {
    for (tx = 0; tx < N; tx++) {
      if (!NEAR[tz * N + tx]) continue;
      for (var py = tz * TS; py < tz * TS + TS; py += 2) {
        for (var px = tx * TS; px < tx * TS + TS; px += 2) {
          if (!solid(px, py)) continue;
          /* how far the rock continues downward decides the height of the drop */
          var below = 0;
          while (below < FACE && solid(px, py + below + 2)) below += 2;
          var grain = _sprHash(px >> 1, py >> 1, seed + 71);
          var col;
          if (below < FACE) {
            /* THE SOUTH FACE. Vertical striations from a hash on x only, so they run down the
               cliff instead of speckling it - that verticality is most of what says "wall". */
            var strip = _sprHash(px >> 1, 0, seed + 91);
            var deep = below < FACE * 0.45;
            col = strip < 0.30 ? RK[4] : (strip < 0.62 ? RK[2] : RK[0]);
            if (deep) col = strip < 0.45 ? RK[4] : RK[2];
          } else if (!solid(px, py - 3)) {
            col = RK[3];                                        /* sunlit north lip */
          } else if (!solid(px, py - 7)) {
            col = RK[1];                                        /* the shelf under it */
          } else if (!solid(px - 4, py) || !solid(px + 4, py)) {
            col = !solid(px - 4, py) ? RK[1] : RK[2];           /* the two side walls */
          } else {
            /* Plateau top. A low-frequency band picks the broad facet and the grain only
               dithers within it, so the top has large light and dark planes across it rather
               than the single flat grey it used to be. */
            var facet = _sprVN(px, py, 34, seed + 83);
            col = facet < 0.36 ? (grain < 0.5 ? RK[2] : RK[0])
                : (facet < 0.68 ? (grain < 0.5 ? RK[0] : RK[1])
                                : (grain < 0.35 ? RK[1] : RK[3]));
          }
          var cc = _sprCol(col);
          for (var ry = 0; ry < 2; ry++) {
            var rrow = (py + ry) * S;
            for (var rx = 0; rx < 2; rx++) {
              var ro = (rrow + px + rx) * 4;
              rd[ro] = cc[0]; rd[ro + 1] = cc[1]; rd[ro + 2] = cc[2]; rd[ro + 3] = 255;
            }
          }
        }
      }
    }
  }
  rg.putImageData(rimg, 0, 0);
  _sprEdge(rockCv.c);
  g.drawImage(rockCv.c, 0, 0);
}
