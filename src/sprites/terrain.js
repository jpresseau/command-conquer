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
      var fleck = _sprHash(bx >> 1, by >> 1, seed + 31);
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
        k = grain < 0.30 ? 1 : (grain < 0.72 ? 0 : 2);
        if (fleck > 0.93) k = 3;                        /* an occasional stone */
      } else if (n > 0.715) {                           /* the rim - a drawn outline */
        pal = dr;
        k = 2;
      } else {
        pal = gr;
        k = grain < 0.30 ? 2 : (grain < 0.70 ? 0 : 1);
        /* The flecks are what stop the smooth field reading as banding, and they are rare on
           purpose: at 12% of blocks the ground went straight back to looking like noise. */
        if (fleck > 0.955) k = 4;                       /* a bright tuft */
        else if (fleck < 0.035) k = 2;                  /* a dark clump */
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
  /* WHICH CELLS THE MAP'S AUTHOR DREW. Kept because the flat ground-cover pass further down
     has to leave them alone, and it could not tell: its only escape was `shore !== null`, and
     the shoreline pass is switched off on a real map (the map draws its own). So every sand,
     road and water cell the author had laid out from real templates was then repainted flat
     on top - the beaches, the roads and the river banks, which are most of the reason for
     loading somebody's map in the first place.

     A per-cell mask rather than "skip these kinds on a real map": _rtsMapPaintCell returns
     false for a hole in a template or a piece the table does not know, those cells fall through
     to _mixPaintCell, and _mixPaintCell has no SAND branch at all - so a blanket skip would
     leave a template-miss sand cell showing bare grass. Only what was actually drawn is
     protected. */
  var authored = null;
  if (window._RTS_MAP && typeof _rtsMapPaintCell === 'function' &&
      typeof _mixGround === 'function' && _mixGround()) {
    window._RTS_TERRMISS = {};
    authored = new Uint8Array(N * N);
    for (var mz = 0; mz < N; mz++) {
      for (var mx2 = 0; mx2 < N; mx2++) {
        if (_rtsMapPaintCell(d, S, mx2, mz)) { authored[mz * N + mx2] = 1; continue; }
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

  /* --- the shoreline, from the player's own game files. -----------------------------------
         RA's Beach templates fitted onto the sand ring and the water it surrounds - see
         mixart/shore.js. Without it the sand and the water are painted flat below, which
         beside RA's own grass reads as a 24-pixel staircase of beige and blue: the one place
         on the map where you could count the cells.

         Null means no artwork, the ordinary case. Anything else means the shoreline is real
         and the flat sand and water are skipped outright. --- */
  var shore = null;
  if (typeof _mixPaintShore === 'function' && !window._RTS_MAP) {
    var shimg = g.getImageData(0, 0, S, S);
    shore = _mixPaintShore(shimg.data, S, G, seed);
    if (shore !== null) g.putImageData(shimg, 0, 0);
  }

  /* --- ground cover per tile: sand, road and water are painted flat, under everything --- */
  var TS = RTS_TS, tx, tz, k, cx, cy;
  var roadPal = typeof _mixRoadPal === 'function' ? _mixRoadPal() : null;
  function tileAt(x, z) { return _rtsInB(x, z) ? G.terrain[_rtsIdx(x, z)] : -1; }
  for (tz = 0; tz < N; tz++) {
    for (tx = 0; tx < N; tx++) {
      k = G.terrain[_rtsIdx(tx, tz)];
      if (k !== RTS_T_SAND && k !== RTS_T_ROAD && k !== RTS_T_WATER) continue;
      /* The map's author already drew this one. Before every other rule, including the road
         exception below - that exception exists because RA's road templates cannot draw OUR
         generated roads, and on a real map the roads are the map's own. */
      if (authored && authored[_rtsIdx(tx, tz)]) continue;
      /* ROAD is still drawn here even with artwork loaded, and deliberately: RA's 45 Road
         templates cannot draw it. Measured three ways - fitting them produces camouflage
         rather than a road; 35 of the 45 keep their track inside the footprint with clear
         margins all round, so there is nothing to chain; and NO cell in the whole set is more
         than 55% packed earth, so there is no fill tile either. The reason is structural: our
         roads are 2-4 cell wide carved swathes and RA's road art is a narrow track with grass
         either side. See docs/artwork.md. */
      if (shore !== null && k !== RTS_T_ROAD) continue;
      /* The road's COLOURS come from the tileset's own packed earth when there is artwork, even
         though its shape cannot. Ours beside RA's ground is the same mismatch the drawn trees
         had before the real ones arrived - and a road is 500 cells of it. */
      var pal = k === RTS_T_WATER ? RTS_PAL.water
              : (k === RTS_T_ROAD ? (roadPal || RTS_PAL.road) : RTS_PAL.sand);
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

  /* --- cliffs. When the player has pointed the game at their own game files, Red Alert's own
         Cliffs templates are FITTED onto the rock mask instead - see mixart/cliffs.js for why
         fitted rather than chained, and for the measurement that ruled the alternative out.

         It runs at exactly the point the drawn cliffs would have been composited, so the
         tufts and debris scattered further up still end up underneath the rock. What comes
         back is how many blocked cells it could NOT reach: zero on every seed measured, and
         the drawn cliffs are then skipped outright. Null means there was no artwork, which
         is the ordinary case and the reason all of _sprDrawRock still exists. --- */
  var cliffLeft = null;
  if (typeof _mixPaintCliffs === 'function' && !window._RTS_MAP) {
    var cimg = g.getImageData(0, 0, S, S);
    cliffLeft = _mixPaintCliffs(cimg.data, S, G, seed);
    if (cliffLeft !== null) g.putImageData(cimg, 0, 0);
  }
  if (cliffLeft === null || cliffLeft > 0) _sprDrawRock(g, G, S, seed);

  /* --- headlands: rock that meets the sea, from RA's 38 Water Cliffs templates. Painted after
         the land cliffs because it repaints nothing they touched - _rtsCliffRules refuses those
         cells outright - and before the trees, which stand on top of everything. --- */
  if (typeof _mixPaintSeaCliffs === 'function' && !window._RTS_MAP) {
    var wcimg = g.getImageData(0, 0, S, S);
    if (_mixPaintSeaCliffs(wcimg.data, S, G, seed) !== null) g.putImageData(wcimg, 0, 0);
  }

  /* --- sandbag emplacements. With the player's own files loaded these come from sbag.shp,
         which is a real autotile: sixteen frames indexed by which neighbours are also wall, so
         a run joins up instead of being sixteen copies of one horizontal bag stack laid end to
         end. See mixart/walls.js. Ours is one sprite and has no notion of a corner, which is
         why a north-south wall used to read as a ladder. --- */
  var wallSet = typeof _mixWallSet === 'function' ? _mixWallSet() : null;
  var bagSpr = wallSet ? null : _sprSandbag();
  function isWallAt(x, z) { return _rtsInB(x, z) && G.terrain[_rtsIdx(x, z)] === RTS_T_WALL; }
  for (tz = 0; tz < N; tz++) {
    for (tx = 0; tx < N; tx++) {
      if (G.terrain[_rtsIdx(tx, tz)] !== RTS_T_WALL) continue;
      if (wallSet) g.drawImage(wallSet[_rtsWallMask(isWallAt, tx, tz)], tx * TS, tz * TS);
      else g.drawImage(bagSpr.c, tx * TS, tz * TS - bagSpr.head);
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
