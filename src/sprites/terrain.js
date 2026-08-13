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
  if (typeof _mixPaintShore === 'function' && !window._RTS_MAP && _rtsArtReady()) {
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

  /* --- cliffs. When the player has pointed the game at their own game files, Red Alert's own
         Cliffs templates are FITTED onto the rock mask instead - see mixart/cliffs.js for why
         fitted rather than chained, and for the measurement that ruled the alternative out.

         It runs at exactly the point the drawn cliffs would have been composited, so the
         tufts and debris scattered further up still end up underneath the rock. What comes
         back is how many blocked cells it could NOT reach: zero on every seed measured, and
         the drawn cliffs are then skipped outright. Null means there was no artwork, which
         is the ordinary case and the reason all of _sprDrawRock still exists. --- */
  var cliffLeft = null;
  if (typeof _mixPaintCliffs === 'function' && !window._RTS_MAP && _rtsArtReady()) {
    var cimg = g.getImageData(0, 0, S, S);
    cliffLeft = _mixPaintCliffs(cimg.data, S, G, seed);
    if (cliffLeft !== null) g.putImageData(cimg, 0, 0);
  }
  if (cliffLeft === null || cliffLeft > 0) _sprDrawRock(g, G, S, seed);

  /* --- headlands: rock that meets the sea, from RA's 38 Water Cliffs templates. Painted after
         the land cliffs because it repaints nothing they touched - _rtsCliffRules refuses those
         cells outright - and before the trees, which stand on top of everything. --- */
  if (typeof _mixPaintSeaCliffs === 'function' && !window._RTS_MAP && _rtsArtReady()) {
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
