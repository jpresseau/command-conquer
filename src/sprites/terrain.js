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
  var B = 2;                       /* paint in 2px blocks: pixel art ground is clumpy, not TV static */

  for (var by = 0; by < S; by += B) {
    for (var bx = 0; bx < S; bx += B) {
      var n = _sprFbm(bx, by, seed);
      var grain = _sprHash(bx >> 1, by >> 1, seed + 3);
      var pal, k;
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
        pal = dr;
        k = grain < 0.18 ? 3 : (grain < 0.5 ? 1 : (grain < 0.82 ? 0 : 2));
      } else if (n > 0.715) {                           /* the rim - a drawn outline */
        pal = dr;
        k = 2;
      } else {
        pal = gr;
        k = grain < 0.12 ? 4 : (grain < 0.42 ? 2 : (grain < 0.76 ? 0 : 1));
        /* grass immediately outside a patch is scuffed rather than lush, which reads as the
           patch having worn outward instead of having been stamped on */
        if (n > 0.64) k = grain < 0.5 ? 2 : 4;
      }
      var c = pal[k];
      for (var yy = 0; yy < B; yy++) {
        var row = (by + yy) * S;
        for (var xx = 0; xx < B; xx++) {
          var o = (row + bx + xx) * 4;
          d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
        }
      }
    }
  }
  /* With the player's own game files loaded, the GROUND is repainted from the original's
     terrain templates - real grass and water, one of sixteen clear variants picked per cell the
     way the original picks them. Everything layered on afterwards (rock, trees, ore, the dirt
     patches' drawn edges) stays procedural, because those are multi-tile templates with real
     placement rules and half-applying them would look worse than either end state. */
  /* On a REAL map the cell names its own template and tile, so the ground is painted exactly
     as its author laid it out - including the cliffs and shorelines, which is the entire
     reason for loading a map. That is the one case where RTS_T_ROCK is not skipped below:
     a cliff drawn from the template the map names is a real cliff, not half of one. */
  if (window._RTS_MAP && typeof _rtsMapPaintCell === 'function' &&
      typeof _mixGround === 'function' && _mixGround()) {
    window._RTS_TERRMISS = {};
    for (var mz = 0; mz < N; mz++) {
      for (var mx2 = 0; mx2 < N; mx2++) {
        if (_rtsMapPaintCell(d, S, mx2, mz)) continue;
        /* a hole in the template, or a piece the table does not know - fill it with ground */
        _mixPaintCell(d, S, mx2, mz, G.terrain[_rtsIdx(mx2, mz)], seed);
      }
    }
    /* Say which templates fell back, on screen, once. A player looking at smeared cliffs
       deserves better than a smear: the list NAMES the missing art files, which is the whole
       diagnosis - typically the Counterstrike/Aftermath templates (sh57+, cliffsw*, sbridge*,
       hill01) on an expansion map, which no base archive carries. */
    var mk = Object.keys(window._RTS_TERRMISS || {});
    if (mk.length) {
      var MISS = window._RTS_TERRMISS, mtot = 0;
      mk.forEach(function (m) { mtot += MISS[m]; });
      mk.sort(function (a, b) { return MISS[b] - MISS[a]; });
      var msg = 'terrain: ' + mtot + ' cells have no template art (' +
                mk.slice(0, 6).join(', ') + (mk.length > 6 ? ' +' + (mk.length - 6) + ' more' : '') + ')';
      try { console.warn('Red Alert ' + msg, MISS); } catch (_e) {}
      if (typeof _rtsSay === 'function') setTimeout(function () { _rtsSay(msg); }, 1500);
    }
    window._RTS_TERRMISS = null;
  } else if (typeof _mixGround === 'function' && _mixGround()) {
    for (var gz = 0; gz < N; gz++) {
      for (var gx = 0; gx < N; gx++) {
        var gk = G.terrain[_rtsIdx(gx, gz)];
        if (gk === RTS_T_ROCK) continue;                /* ours is better than half a cliff */
        _mixPaintCell(d, S, gx, gz, gk, seed);
      }
    }
  }
  g.putImageData(img, 0, 0);

  /* Real scatter first, when the player's files are loaded: loose rock on open ground and the
     occasional log or wreck. Stamped before the procedural clutter so the tufts still go on top
     and the ground keeps some life in it. */
  if (typeof _mixDebris === 'function') {
    var deb = _mixDebris();
    if (deb) {
      var dimg = g.getImageData(0, 0, S, S), dd = dimg.data;
      for (var dz = 0; dz < N; dz++) {
        for (var dx2 = 0; dx2 < N; dx2++) {
          if (G.terrain[_rtsIdx(dx2, dz)] !== RTS_T_GRASS) continue;
          var r = _sprHash(dx2, dz, seed + 211);
          if (r > 0.045) continue;                       /* sparse - it is scenery, not gravel */
          var set = (r < 0.006 && deb.props.length) ? deb.props : deb.rock;
          var pick = (_sprHash(dz, dx2, seed + 212) * set.length) | 0;
          _mixStamp(dd, S, set[Math.min(pick, set.length - 1)], dx2 * RTS_TS, dz * RTS_TS);
        }
      }
      g.putImageData(dimg, 0, 0);
    }
  }

  /* Scatter that crosses cell lines: tufts, pebbles and bushes placed in world pixels. */
  var i, x, y;
  for (i = 0; i < S * S / 900; i++) {
    x = _sprHash(i, 11, seed + 41) * S; y = _sprHash(i, 29, seed + 43) * S;
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

  /* --- ground cover per tile: sand, road and water are painted flat, under everything --- */
  var TS = RTS_TS, tx, tz, k, cx, cy;
  function tileAt(x, z) { return _rtsInB(x, z) ? G.terrain[_rtsIdx(x, z)] : -1; }
  for (tz = 0; tz < N; tz++) {
    for (tx = 0; tx < N; tx++) {
      k = G.terrain[_rtsIdx(tx, tz)];
      if (k !== RTS_T_SAND && k !== RTS_T_ROAD && k !== RTS_T_WATER) continue;
      var pal = k === RTS_T_WATER ? RTS_PAL.water : (k === RTS_T_ROAD ? RTS_PAL.road : RTS_PAL.sand);
      for (var py = 0; py < TS; py += 2) {
        for (var px = 0; px < TS; px += 2) {
          var gx = tx * TS + px, gy = tz * TS + py;
          var hv = _sprHash(gx >> 1, gy >> 1, seed + 91);
          /* Edges dither into the neighbour so a road has a ragged verge, not a kerb. */
          var edge = (px < 3 && tileAt(tx - 1, tz) !== k) || (px > TS - 4 && tileAt(tx + 1, tz) !== k) ||
                     (py < 3 && tileAt(tx, tz - 1) !== k) || (py > TS - 4 && tileAt(tx, tz + 1) !== k);
          if (edge && hv < 0.45) continue;
          _sprRect(g, gx, gy, 2, 2, pal[hv < 0.3 ? 2 : (hv < 0.72 ? 0 : 1)]);
        }
      }
    }
  }
  /* Water gets highlight ripples once the body is down, so they run across tile seams. */
  for (var w = 0; w < (S * S) / 1400; w++) {
    var wx = _sprHash(w, 3, seed + 95) * S, wy = _sprHash(3, w, seed + 97) * S;
    if (tileAt((wx / TS) | 0, (wy / TS) | 0) !== RTS_T_WATER) continue;
    var wl = 3 + (_sprHash(w, w, seed + 99) * 6 | 0);
    _sprRect(g, wx, wy, wl, 1, RTS_PAL.water[3]);
    _sprRect(g, wx + 1, wy + 1, wl - 2, 1, RTS_PAL.water[4]);
  }

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

  /* --- sandbag emplacements --- */
  var bagSpr = _sprSandbag();
  for (tz = 0; tz < N; tz++) {
    for (tx = 0; tx < N; tx++) {
      if (G.terrain[_rtsIdx(tx, tz)] !== RTS_T_WALL) continue;
      g.drawImage(bagSpr.c, tx * TS, tz * TS - bagSpr.head);
    }
  }

  /* --- forest. Conifers, drawn back-to-front down the map so a grove overlaps correctly,
         each one taller than its cell with a cast shadow. This is the single biggest
         difference between "a field" and "a battlefield". --- */
  var trees = _sprTrees();
  for (tz = 0; tz < N; tz++) {
    for (tx = 0; tx < N; tx++) {
      if (G.terrain[_rtsIdx(tx, tz)] !== RTS_T_TREE) continue;
      /* Jitter close to a full cell. One tree per cell nudged a few pixels still lines up
         into visible rows; a grove has to look sown, not planted. */
      var jx = (_sprHash(tx, tz, seed + 101) - 0.5) * 17;
      var jy = (_sprHash(tz, tx, seed + 103) - 0.5) * 15;
      var tr = trees[(_sprHash(tx, tz, seed + 107) * 3) | 0];
      g.drawImage(tr.c, Math.round(tx * TS + jx), Math.round(tz * TS + jy - tr.head));
    }
  }
  return t.c;
}

/* Conifers, baked from 3D like everything else. They were stacked 2D ellipses before, which
   left the forest looking like flat cut-outs while the buildings beside it had volume - and
   the forest is a fifth of the map, so it set the tone for the whole picture. Three size
   variants, picked per cell. */
var _RTS_TREES = null;
function _sprTrees() {
  if (_RTS_TREES) return _RTS_TREES;
  /* Real trees when the player's own files are loaded. Ours next to the original's ground was
     the one thing in the first pass that looked plainly wrong - bright cones on RA's dark
     temperate grass. */
  if (typeof _mixTrees === 'function') {
    var real = _mixTrees();
    if (real) return (_RTS_TREES = real);
  }
  var TR = RTS_PAL.tree, out = [];
  for (var v = 0; v < 3; v++) {
    var sc = [0.82, 1.0, 1.22][v], m = [];
    _r3Cyl(m, 0, 0, 0, 1.6 * sc, 5 * sc, TR[4], TR[4], 8);            /* trunk */
    var tiers = v === 1 ? 4 : 3;
    for (var i = 0; i < tiers; i++) {
      var f = i / tiers;
      var r0 = 8 * sc * (1 - f * 0.55), r1 = r0 * 0.42;
      var y = (3 + f * 13) * sc, h = 6.5 * sc;
      _r3Cone(m, 0, y, 0, r0, r1, h, i === tiers - 1 ? TR[1] : TR[0], 12);
    }
    var r = _r3BakeFootprint(m, RTS_TS, RTS_TS);
    out.push({ c: _sprShadow(r.c, 3, 3), head: r.head });
  }
  _RTS_TREES = out;
  return out;
}

