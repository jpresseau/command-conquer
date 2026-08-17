/* render/frame.js - _rtsRFrame: drawing one frame of the battlefield, back to front.
   Part of rts.render, which owns every pixel. */

/* --------------------------------------------------------------- the frame */
function _rtsRFrame(dt) {
  var R = _rtsR, G = window._rtsG, g = R.g, S = R.spr, i;
  var z = _rtsZoom(), cell = R.cell, TSscale = cell / RTS_TS;

  _rtsCycleTick(dt);
  /* Shake_The_Screen(): the original blits the page offset by a couple of pixels, picking a
     new offset each tick. Same idea, applied as a transform offset. */
  var shk = G.shake || 0, shy = 0, shx = 0;
  if (shk > 0.02) {
    R.shakeF = (R.shakeF || 0) + 1;
    shy = ((R.shakeF & 1) ? 1 : -1) * Math.round(shk * 5);
    shx = ((R.shakeF & 2) ? 1 : -1) * Math.round(shk * 3);
  }
  g.setTransform(R.dpr, 0, 0, R.dpr, shx * R.dpr, shy * R.dpr);
  g.imageSmoothingEnabled = false;
  /* 3D MODE: the world - ground, entities, fog - is drawn by the GL canvas underneath this
     one (_r3dFrame), and this canvas becomes a transparent overlay carrying only what stays
     2D: ore and wave decals, effects, the ghost, the message line. Everything positions
     itself through _rtsSX/_rtsSY, which camera.js makes projection-aware, so the overlay and
     the meshes cannot drift apart. */
  var r3on = window._R3D && window._R3D.on;
  if (r3on) {
    _r3dFrame(G);
    /* The GL canvas is BLITTED here rather than stacked under this one and left to the
       compositor. Stacking worked in every reduced test and still composited black inside the
       real page in headless capture - and a renderer this project cannot screenshot is one it
       cannot verify, so the compositor was fired from the job. The blit costs one full-frame
       drawImage, buys identical behaviour everywhere, and gets screen shake for free because
       it happens under the same transform as everything else. */
    g.clearRect(-8, -8, R.W + 16, R.H + 16);
    g.drawImage(window._R3D.cv, 0, 0, R.W, R.H);
  } else {
    g.fillStyle = '#1a1d16';
    g.fillRect(-8, -8, R.W + 16, R.H + 16);
  }
  /* ground decals squash by the camera lean so they hug the terrain instead of shingling
     over the row below - 1 in 2D, cos(tilt) in 3D */
  var ys = r3on ? window._R3D.cp : 1;

  /* Visible cell range, padded so half-on-screen sprites still draw. Through the projection's
     own inverse rather than through the zoom: the tilted camera sees 1/cos(tilt) further up
     the screen than W/zoom by H/zoom says, and the perspective one further again at the far
     end, so the flat arithmetic this replaces left the top rows of the sea undrawn. In 2D it
     reduces to exactly the same four numbers. */
  var cw = _rtsCellWindow(1, 2);
  var tx0 = cw.tx0, tx1 = cw.tx1, tz0 = cw.tz0, tz1 = cw.tz1;

  /* --- terrain: one blit of the baked map, plus ore on top ---
     The ground is a single pre-painted canvas, so the visible window is one drawImage
     rather than a couple of thousand tile blits - and, more to the point, its dirt
     patches are continuous noise instead of per-cell stamps, so there is no grid. */
  var srcX = (R.focus.x / RTS_TILE + RTS_N / 2) * RTS_TS - (R.W / 2) / TSscale;
  var srcY = (R.focus.z / RTS_TILE + RTS_N / 2) * RTS_TS - (R.H / 2) / TSscale;
  if (!r3on) {
    g.drawImage(R.terrain,
      srcX, srcY, R.W / TSscale, R.H / TSscale,
      0, 0, R.W, R.H);
    /* and the grain the magnification just destroyed, put back at device resolution - see
       render/detail.js. Under everything that stands on the ground, because it IS the ground. */
    _rtsGroundDetail(g, R, TSscale);
  }

  for (var tz = tz0; tz <= tz1; tz++) {
    for (var tx = tx0; tx <= tx1; tx++) {
      var idx = _rtsIdx(tx, tz);
      var ore = G.scrap[idx];
      var isWater = G.terrain && G.terrain[idx] === RTS_T_WATER;
      if (ore <= 0 && !isWater) continue;
      var pp = _rtsGroundToScreen(_rtsWX(tx) - RTS_TILE / 2, _rtsWX(tz) - RTS_TILE / 2);
      var px = Math.round(pp.x), py = Math.round(pp.y);
      if (isWater && !r3on) {
        /* The crest highlights step round a four-frame cycle, so the lake moves.
           2D ONLY, now that the GL side has a sea of its own (render3d/world3d.js). This used
           to run in both modes - the comment here said so - because without it 3D had nothing
           but a flat painted colour where the water was. It was then the last thing painting
           over a surface that has real geometry, a moving normal and a specular, which is the
           same mistake the ore tile made and was fixed for.

           SIZED CORNER TO CORNER, not by `cell` and a lean factor. A tile drawn at a fixed
           size abuts its neighbour only while every cell projects to the same rectangle -
           true of both orthographic cameras and of nothing else. Under perspective the near
           rows are larger than the far ones, so a fixed size opens a hairline of dark ground
           between every row at one end of the screen and overlaps them at the other. Asking
           the projection where the OPPOSITE corner lands makes each tile exactly reach its
           neighbour whatever the camera, and in 2D it is the same integer it always was. */
        var pq = _rtsGroundToScreen(_rtsWX(tx) + RTS_TILE / 2, _rtsWX(tz) + RTS_TILE / 2);
        g.drawImage(S.wave[(_RTS_PULSE.wf + tx + tz) & 3], px, py,
                    Math.max(1, Math.round(pq.x) - px), Math.max(1, Math.round(pq.y) - py));
        continue;
      }
      /* IN 3D THE ORE IS REAL GEOMETRY, so this flat tile must not be painted over it. Every
         other 2D world layer is already gated on r3on - the terrain blit above, the pads, the
         sprites, the shroud - and this loop was missed. Measured over a full field at max
         zoom, the composited frame differed from the raw GL buffer in 77.2% of its pixels
         (50.0% of them by more than 60 levels); with the ore skipped it is 0.1%. This single
         ungated loop was burying the ~47k crystal triangles world3d.js builds every frame,
         and it is most of why the 3D toggle "looked exactly the same" as 2D. */
      if (r3on) continue;
      /* The number of density steps comes from the sprite set, not from a literal: ours has
         four, the original's gold has TWELVE and its gems three. Hard-coding 4 here worked
         until real art arrived and then quietly showed a third of a field. */
      var set = (G.gems && G.gems[idx] ? S.gem : S.ore);
      /* A FULL CELL IS RICHNESS-SCALED, not RTS_SCRAP_TILE. core/ore.js seeds a cell with
         `(lvl+1)/LEVELS * RTS_SCRAP_TILE * RTS_ORE_RICHNESS`, so at richness 0.51 the richest
         cell on the map holds 255 of a nominal 500 - and dividing by the nominal value asked
         the last stage for ore that cannot exist. Measured over a seeded map the stage
         histogram was [86, 300, 411, 0]: a quarter of the ore artwork was dead. */
      var full = RTS_SCRAP_TILE * (typeof RTS_ORE_RICHNESS === 'number' ? RTS_ORE_RICHNESS : 1);
      var stage = Math.min(set.length - 1, Math.floor(ore / full * set.length));
      /* Hashed, not arithmetic. `(tx*7 + tz*13) % 3` collapses to `(tx + tz) % 3`, because 7
         and 13 are both 1 mod 3 - verified identical for all 797 ore cells of a seeded map -
         so the three anti-repetition variants laid out as diagonal ribbons on a three-cell
         lattice instead of breaking the field up. */
      var vari = Math.floor(_sprHash(tx, tz, 6101) * set[stage].length) % set[stage].length;
      g.drawImage(set[stage][vari], px, py, cell, cell * ys);
    }
  }

  /* --- the forest, drawn rather than baked ---------------------------------------------
     These used to be stamped into the terrain canvas at one 24-pixel tree a cell, which read
     as a legible but sparse and very regular wood. (The commit that moved them claimed the old
     forest measured brighter than bare grass; that was a stale-bake artifact and is corrected
     on _sprTrees.) That canvas is capped at Red Alert's tile density and cannot grow, so the
     trees came out of it: as sprites they bake at RTS_PS, several stand on one cell, and there
     are five variants, which is what makes a grove read as one close up.

     SKIPPED IN 3D, like the ore - render3d/world3d.js grows real conifers from the same cells,
     and until the trees left the bake the flat ones were sitting underneath them.

     TREES PER CELL TAPERS WITH ZOOM. It is not a performance dodge, it is what the picture
     wants: zoomed out a cell is twelve pixels and three overlapping canopies are one dark
     blob, so the extra two cost time and show nothing. Zoomed in they are the difference
     between a wood and a lawn. The count is also what bounds the cost - at the widest zoom
     the most forest is on screen and the fewest trees are drawn per cell.

     Drawn back to front so a grove overlaps correctly, and before the units, which keeps the
     old behaviour of a unit never being hidden by a tree it is standing behind. Depth-sorting
     trees into the entity pass is a separate change; doing it here would silently alter what
     the player can see. */
  if (!r3on && S.tree) {
    var TPC = cell >= 48 ? 3 : (cell >= 24 ? 2 : 1);
    var tsc = TSscale / (S.tree[0].c.ps || 1);
    for (var ftz = tz0; ftz <= tz1; ftz++) {
      for (var ftx = tx0; ftx <= tx1; ftx++) {
        if (G.terrain[_rtsIdx(ftx, ftz)] !== RTS_T_TREE) continue;
        for (var ti = 0; ti < TPC; ti++) {
          /* hash-placed, never random: the same seed must grow the same wood every frame,
             and a tree that moved between frames would read as the map shimmering */
          var jx = (_sprHash(ftx * 3 + ti, ftz, 101) - 0.5) * RTS_TILE * 0.78;
          var jz = (_sprHash(ftz, ftx * 3 + ti, 103) - 0.5) * RTS_TILE * 0.78;
          var tv = S.tree[Math.floor(_sprHash(ftx + ti, ftz * 2 + ti, 107) * S.tree.length)
                          % S.tree.length];
          var tp = _rtsGroundToScreen(_rtsWX(ftx) + jx, _rtsWX(ftz) + jz);
          var tw = Math.round(tv.c.width * tsc * tp.scale), th = Math.round(tv.c.height * tsc * tp.scale);
          var tpx = Math.round(tp.x - tw / 2);
          var tpy = Math.round(tp.y - Math.round(tv.head * tsc * tp.scale) - th / 2);
          g.drawImage(tv.c, tpx, tpy, tw, th);
        }
      }
    }
  }

  /* --- new scorch marks and craters, stamped once into the baked terrain. Because the
     ground is a single canvas, a smudge costs nothing after the frame it appears on. --- */
  if (G.corpses && G.corpses.length) {
    if (window._R3D) window._R3D.terrainDirty = true;   /* the GL ground shares this canvas */
    var cg = R.terrain.getContext('2d');
    cg.imageSmoothingEnabled = false;
    while (G.corpses.length) {
      var cp = G.corpses.pop();
      var cpx = (cp.x / RTS_TILE + RTS_N / 2) * RTS_TS, cpy = (cp.z / RTS_TILE + RTS_N / 2) * RTS_TS;
      cg.drawImage(S.corpse[cp.v % 3], Math.round(cpx - 7), Math.round(cpy - 6));
    }
  }
  if (G.newScorch && G.newScorch.length) {
    var tg = R.terrain.getContext('2d');
    tg.imageSmoothingEnabled = false;
    while (G.newScorch.length) {
      var ni = G.newScorch.pop();
      var nx = (ni % RTS_N) * RTS_TS, ny = ((ni / RTS_N) | 0) * RTS_TS;
      var sv = G.scorch[ni];
      if (sv & 8) tg.drawImage(S.crater, nx, ny);
      else tg.drawImage(S.scorch[((sv & 7) - 1) % 6], nx, ny);
    }
  }

  /* --- the sea, moving. Over the baked terrain and under everything that stands on it. --- */
  if (typeof _rtsDrawWater === 'function') _rtsDrawWater(g, G, cell);

  /* --- foundation pads. A separate pass before any structure is drawn, so one building's
     pad can never cover its neighbour. Without these a base looks like furniture dropped
     on a lawn; a scuffed earth apron is what makes it look built. --- */
  for (i = 0; i < G.ents.length; i++) {
    var pe = G.ents[i];
    if (r3on) break;                 /* 3D buildings model their own ground - a flat pad sprite
                                        drawn on the overlay would float above the mesh */
    if (pe.type !== 'struct' || (pe.dead && !(pe.wreck > 0))) continue;
    if (!_rtsEntSeen(pe)) continue;
    var pd = rtsStructDef(pe.def);
    /* The original's own apron, when the player's files have it. It is a tyre-marked strip
       lining up with the footprint exactly, where ours is a pale blob noticeably larger than
       the building - which is what made a base look pasted onto the ground rather than
       standing on it. Two cells tall, hung off the BOTTOM row of the footprint, which is
       where RA puts it. */
    var bib = (typeof _mixBib === 'function') ? _mixBib(pd.w) : null;
    if (bib) {
      var bcell = Math.round(RTS_TILE * TSscale) || 1;
      var bp = _rtsGroundToScreen(_rtsWX(pe.tx) - RTS_TILE / 2,
                                  _rtsWX(pe.tz + pd.h - 2) - RTS_TILE / 2);
      var bx0 = Math.round(bp.x), by0 = Math.round(bp.y);
      if (bx0 > R.W || by0 > R.H || bx0 + bcell * bib.w < 0 || by0 + bcell * 2 < 0) continue;
      for (var br = 0; br < 2; br++) {
        for (var bc = 0; bc < bib.w; bc++) {
          var bt = bib.tile[br * bib.w + bc];
          if (bt) g.drawImage(bt, bx0 + bc * bcell, by0 + br * bcell, bcell + 1, bcell + 1);
        }
      }
      continue;
    }
    var pad = S.pad[pe.def];
    var pp2 = _rtsGroundToScreen(_rtsWX(pe.tx) - RTS_TILE / 2, _rtsWX(pe.tz) - RTS_TILE / 2);
    /* TWO SCALES, AND THEY ARE NOT THE SAME ONE. `psc` turns PAD pixels into screen pixels and
       so divides by the density the pad was baked at. The 10 and 8 below are the pad's
       overhang beyond the footprint measured in ART pixels - a fixed part of the shape, not of
       the raster - so they convert with `pofs` and must NOT pick up the divide, or the apron
       shifts under every building by half its own overhang the moment the density changes. */
    var pofs = TSscale * pp2.scale;
    var psc = pofs / (pad.ps || 1);
    var pw = Math.round(pad.width * psc), ph = Math.round(pad.height * psc);
    var ppx = Math.round(pp2.x) - Math.round(10 * pofs);
    var ppy = Math.round(pp2.y) - Math.round(8 * pofs);
    if (ppx > R.W || ppy > R.H || ppx + pw < 0 || ppy + ph < 0) continue;
    g.drawImage(pad, ppx, ppy, pw, ph);
  }

  /* --- crates. Drawn with the ground clutter rather than with the objects that stand up:
     a crate sits ON the map, and sorting it into the depth pass would let a unit walking
     over one disappear behind it. Only where the player can see: a crate under the shroud is
     something you have not found yet. --- */
  if (G.crates) {
    for (i = 0; i < G.crates.length; i++) {
      var cr = G.crates[i];
      if (!_rtsVisible(cr.tx, cr.tz)) continue;
      var cimg = S.crate;
      var crp = _rtsGroundToScreen(_rtsWX(cr.tx), _rtsWX(cr.tz));
      var csc = TSscale * crp.scale / (cimg.ps || 1);
      var cw = Math.round(cimg.width * csc), ch = Math.round(cimg.height * csc);
      var cpx = Math.round(crp.x - cw / 2), cpy = Math.round(crp.y - ch / 2);
      if (cpx > R.W || cpy > R.H || cpx + cw < 0 || cpy + ch < 0) continue;
      g.drawImage(cimg, cpx, cpy, cw, ch);
    }
  }

  /* --- everything that stands up, painted back to front --- */
  var draw = [];
  for (i = 0; i < G.ents.length; i++) {
    var e = G.ents[i];
    /* CountDown: a destroyed structure is still on the map, burning, for a moment. Dropping
       it on the frame it died left its own explosion hanging over bare grass. */
    if (e.dead && !(e.type === 'struct' && e.wreck > 0)) continue;
    if (e.inside) continue;                /* riding inside a transport */
    if (!_rtsEntSeen(e)) continue;         /* out of sight, off the screen */
    if (e.z < R.focus.z - R.H / z || e.z > R.focus.z + R.H / z) continue;
    if (e.x < R.focus.x - R.W / z || e.x > R.focus.x + R.W / z) continue;
    draw.push(e);
  }
  draw.sort(function (a, b) { return a.z - b.z; });

  /* Ground shadows for the DRAWN units only. The original's sprites carry their shadow inside
     the frame - palette index 4, which _mixFrameToCanvas already paints as translucent black -
     so adding one under those would give every tank two. Ours have none at all, which is what
     makes them look laid on the grass rather than standing on it.

     A separate pass ahead of the units, not per unit inside the loop: drawn inline, a unit's
     shadow would fall ON TOP of the unit sorted just behind it. */
  if (!(typeof _rtsArtReady === 'function' && _rtsArtReady())) {
    g.globalAlpha = 0.28;
    g.fillStyle = '#0b0f14';
    for (i = 0; i < draw.length; i++) {
      var sd = draw[i];
      if (sd.type !== 'unit') continue;
      var sdd = rtsUnitDef(sd.def);
      if (!sdd || sdd.kind === 'air') continue;      /* a helicopter's shadow is not under it */
      var sp2 = _rtsGroundToScreen(sd.x, sd.z);
      var srx = Math.max(2, Math.round(sd.r * _rtsZoom() * 0.95 * sp2.scale));
      var sry = Math.max(1, Math.round(srx * 0.55));
      g.beginPath();
      g.ellipse(Math.round(sp2.x), Math.round(sp2.y) + Math.round(sry * 0.5),
                srx, sry, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
  }

  for (i = 0; i < draw.length; i++) {
    var d = draw[i];
    /* YOUR OWN SUBMARINES, DRAWN AWASH. The draw list only holds what _rtsEntSeen allows, and
       that refuses a hidden ENEMY boat outright - so the only cloaked thing that reaches here
       is one of yours, and it has to LOOK submerged or the state is invisible to the player who
       owns it. Half-transparent is the whole treatment: still selectable, still clearly there,
       obviously not on the surface. It goes solid the moment it fires, because _rtsCloakAI
       clears `hidden` for the surfacing window. */
    if (d.hidden) g.globalAlpha = 0.42;
    if (r3on) continue;                    /* drawn as meshes by _r3dFrame */
    if (d.type === 'struct') _rtsDrawStruct(g, d, TSscale, cell);
    else _rtsDrawUnit(g, d, TSscale);
    if (d.hidden) g.globalAlpha = 1;
  }

  _rtsDrawFx(g, G, S, TSscale, cell);


  /* --- shroud. MAP.CPP keeps IsMapped and IsVisible per cell; this paints them.
     Baked into a 112x112 canvas (one pixel per cell) and blown up with smoothing off, so
     the whole layer is one drawImage and the edges stay hard and cell-aligned the way the
     original's shroud tiles do. Re-baked only when the visibility sweep says something
     changed, which is at most 15 times a second. --- */
  /* With the player's archives loaded there is a better shroud available than a grid of
     squares: RA's own shadow.shp, whose 48 frames are the diagonal wedges and corner nibbles
     that make the boundary look CUT rather than pixel-stepped. Stamped per cell, and only
     across the cells actually on screen - a 160x160 map is 25600 cells and perhaps 900 of them
     are visible, so drawing all of them would be 28x the work for the same picture. */
  /* OFF THE MAP IS NOT UNSHROUDED, and it used to be. Both branches below paint only cells
     that exist - the tile stamper walks the visible cells, the fallback blits a canvas that is
     exactly RTS_N square - so wherever the view runs past the edge of the world neither one
     painted anything, and whatever the terrain pass had left there stayed.

     That is not an edge case at the widest zoom, it is the normal state: a 1660px battlefield
     at 12px cells is 138 cells across against a 128-cell map, so the view is ALWAYS wider than
     the world and there is always a band down each side carrying no shroud. What showed
     through it was the ore-and-water overlay, which draws without asking whether the player
     has seen the cell - so unexplored lakes came out as fields of blue speckle on the black,
     inside a hard straight-edged band, on every desktop window. Filled here, once, for both
     branches, because "there is no map here" is the same answer in both. */
  if (!r3on && G.mapped) {
    var mfx = R.focus.x / RTS_TILE + RTS_N / 2 - (R.W / 2) / cell;
    var mfy = R.focus.z / RTS_TILE + RTS_N / 2 - (R.H / 2) / cell;
    var mdx = -mfx * cell, mdy = -mfy * cell, mds = RTS_N * cell;
    /* Outward-rounded, so the fill never leaves a gap at the seam; the sliver it can overlap
       is the outermost column of the map, under which there is nothing to hide. */
    var ex0 = Math.max(0, Math.ceil(mdx)), ey0 = Math.max(0, Math.ceil(mdy));
    var ex1 = Math.min(R.W, Math.floor(mdx + mds)), ey1 = Math.min(R.H, Math.floor(mdy + mds));
    g.fillStyle = 'rgb(4,6,9)';                     /* the unexplored colour, fully opaque */
    if (ex0 > 0) g.fillRect(0, 0, ex0, R.H);
    if (ex1 < R.W) g.fillRect(ex1, 0, R.W - ex1, R.H);
    if (ey0 > 0) g.fillRect(0, 0, R.W, ey0);
    if (ey1 < R.H) g.fillRect(0, ey1, R.W, R.H - ey1);
  }
  if (r3on) { /* fog drawn by the GL pass, soft-sampled */ }
  else if (G.mapped && typeof _mixShroud === 'function' && _mixShroud()) {
    _rtsDrawShroudTiles(g, G, cell);
  } else if (G.mapped) {
    if (!R.fog) {
      R.fog = document.createElement('canvas');
      R.fog.width = RTS_N; R.fog.height = RTS_N;
      R.fogG = R.fog.getContext('2d');
      G.visDirty = 1;
    }
    if (G.visDirty) {
      G.visDirty = 0;
      var fim = R.fogG.createImageData(RTS_N, RTS_N), fd = fim.data;
      for (i = 0; i < RTS_N * RTS_N; i++) {
        var a = G.mapped[i] ? (G.vis[i] ? 0 : Math.round(255 * RTS_FOG_DIM)) : 255;
        fd[i * 4] = 4; fd[i * 4 + 1] = 6; fd[i * 4 + 2] = 9; fd[i * 4 + 3] = a;
      }
      R.fogG.putImageData(fim, 0, 0);
    }
    /* POSITION THE WHOLE CANVAS RATHER THAN CROPPING IT TO THE SCREEN. This is a
       simplification, NOT the fix for the missing shroud - the fill above is that, and this
       was written first on the assumption that the crop was also landing the fog in the wrong
       place. It was not: asking for a source rectangle that overruns the image is well
       defined, and drawImage clips the source and the destination IN THE SAME PROPORTION, so
       the scale and the position both survive. Reverting this line alone and re-running the
       alignment check in e2e/shroud finds zero misplaced cells, which is the measurement that
       settled it.

       What it buys is not depending on that rule. The destination the map occupies is
       something this code can state directly, and stating it removes the only place where the
       picture rested on a subtlety of how a source rectangle gets clipped. Destination
       clipping, which is what happens instead, is the ordinary case. */
    var mapDX = -(R.focus.x / RTS_TILE + RTS_N / 2 - (R.W / 2) / cell) * cell;
    var mapDY = -(R.focus.z / RTS_TILE + RTS_N / 2 - (R.H / 2) / cell) * cell;
    /* SMOOTHED, deliberately, and only for this one draw. The comment above says hard edges
       are "the way the original's shroud tiles do" it - but RA's shadow.shp frames are
       diagonal wedges and corner nibbles, a CUT edge; the hard cell-aligned square was this
       fallback's approximation of that, and blown up it read as a black staircase, the
       loudest wrong note in the frame. A half-cell soft edge is the other honest
       approximation, it is what the 3D mode's LINEAR-sampled fog already does, and using it
       here means the two modes agree about what the boundary looks like. Players with their
       archives loaded still get the real wedges - this branch is the fallback only. */
    g.imageSmoothingEnabled = true;
    g.drawImage(R.fog, 0, 0, RTS_N, RTS_N,
                mapDX, mapDY, RTS_N * cell, RTS_N * cell);
    g.imageSmoothingEnabled = false;
  }

  /* --- placement ghost --- */
  if (R.ghost) {
    var def = rtsStructDef(R.ghostKey);
    var gspr = S.bld[R.ghost.side][R.ghostKey];
    var gp = _rtsGroundToScreen(_rtsWX(R.ghost.tx) - RTS_TILE / 2,
                                _rtsWX(R.ghost.tz) - RTS_TILE / 2);
    var gx = Math.round(gp.x), gy = Math.round(gp.y);
    g.globalAlpha = 0.55;
    /* DIVIDE BY THE SCALE THE SPRITE WAS BAKED AT, exactly as _rtsDrawStruct does. This was
       the one draw site that missed it, so the ghost came out at RTS_PS times its real size -
       measured at zoom 48, the Construction Yard ghost was drawn 288x448 with its head offset
       at 160 where 144x224 and 80 are correct, inside a footprint box the very next statement
       strokes correctly at 144x144. On a 390 CSS px phone that is a translucent building 74%
       of the screen wide, floating above and beside the green box telling you where it will
       actually land. Procedural art only: real Red Alert art carries no `ps` and reads as 1,
       so a player with their own archives loaded never saw this. */
    var gsc = TSscale * gp.scale / (gspr.c.ps || 1);
    g.drawImage(gspr.c, gx, gy - Math.round(gspr.head * gsc),
      Math.round(gspr.c.width * gsc), Math.round(gspr.c.height * gsc));
    g.globalAlpha = 1;
    g.strokeStyle = R.ghost.ok ? '#7fe07f' : '#e05a4a';
    g.lineWidth = 2;
    g.strokeRect(gx + 1, gy + 1, def.w * cell * gp.scale - 2, def.h * cell * gp.scale - 2);
  }

  /* Last, over the finished battlefield and nothing else. */
  _rtsPost(g);
  /* The render readout samples here, at the end of the frame walk, so what it times is a
     whole frame of this renderer - see ui/gfxstat.js. It throttles its own repaint. */
  if (typeof _rtsGfxFrame === 'function') _rtsGfxFrame();
}


