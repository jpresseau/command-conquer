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

  /* visible cell range, padded so half-on-screen sprites still draw */
  var tx0 = Math.max(0, _rtsTX(R.focus.x - R.W / 2 / z) - 1);
  var tx1 = Math.min(RTS_N - 1, _rtsTX(R.focus.x + R.W / 2 / z) + 1);
  var tz0 = Math.max(0, _rtsTX(R.focus.z - R.H / 2 / z) - 2);
  var tz1 = Math.min(RTS_N - 1, _rtsTX(R.focus.z + R.H / 2 / z) + 2);

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
  }

  for (var tz = tz0; tz <= tz1; tz++) {
    for (var tx = tx0; tx <= tx1; tx++) {
      var idx = _rtsIdx(tx, tz);
      var ore = G.scrap[idx];
      var isWater = G.terrain && G.terrain[idx] === RTS_T_WATER;
      if (ore <= 0 && !isWater) continue;
      var px = Math.round(_rtsSX(_rtsWX(tx) - RTS_TILE / 2));
      var py = Math.round(_rtsSY(_rtsWX(tz) - RTS_TILE / 2));
      if (isWater) {
        /* The crest highlights step round a four-frame cycle, so the lake moves. Still drawn
           in 3D: the GL side has no water surface of its own yet, so without this the sea is
           a flat painted colour. It is the one world overlay that still covers the buffer. */
        g.drawImage(S.wave[(_RTS_PULSE.wf + tx + tz) & 3], px, py, cell, cell * ys);
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
      var bx0 = Math.round(_rtsSX(_rtsWX(pe.tx) - RTS_TILE / 2));
      var by0 = Math.round(_rtsSY(_rtsWX(pe.tz + pd.h - 2) - RTS_TILE / 2));
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
    var pw = Math.round(pad.width * TSscale), ph = Math.round(pad.height * TSscale);
    var ppx = Math.round(_rtsSX(_rtsWX(pe.tx) - RTS_TILE / 2)) - Math.round(10 * TSscale);
    var ppy = Math.round(_rtsSY(_rtsWX(pe.tz) - RTS_TILE / 2)) - Math.round(8 * TSscale);
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
      var cw = Math.round(cimg.width * TSscale), ch = Math.round(cimg.height * TSscale);
      var cpx = Math.round(_rtsSX(_rtsWX(cr.tx)) - cw / 2), cpy = Math.round(_rtsSY(_rtsWX(cr.tz)) - ch / 2);
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
      var srx = Math.max(2, Math.round(sd.r * _rtsZoom() * 0.95));
      var sry = Math.max(1, Math.round(srx * 0.55));
      g.beginPath();
      g.ellipse(Math.round(_rtsSX(sd.x)), Math.round(_rtsSY(sd.z)) + Math.round(sry * 0.5),
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

  /* --- projectiles --- */
  for (i = 0; i < G.proj.length; i++) {
    var p = G.proj[i];
    if (!_rtsVisible(_rtsTX(p.x), _rtsTX(p.z))) continue;
    var sx = Math.round(_rtsSX(p.x)), sy = Math.round(_rtsSY(p.z));
    g.fillStyle = p.kind === 'missile' ? '#ffd070' : '#fff2c0';
    var r = Math.max(2, Math.round(cell * (p.kind === 'missile' ? 0.09 : 0.06)));
    g.fillRect(sx - r, sy - r, r * 2, r * 2);
  }

  /* --- explosions, tracers, muzzle flashes --- */
  for (i = 0; i < G.fx.length; i++) {
    var f = G.fx[i], k = _rtsAnimQ(f.t) / 0.75;
    if (f.t < 0) continue;                       /* a delayed secondary blast, not started */
    if (f.kind === 'nuke') {
      /* Anchored near its BASE, not its centre: a mushroom cloud stands on the ground and grows
         upward, so centring it would sink the stem below the impact point. */
      var nz = (typeof _mixFxSet === 'function') ? _mixFxSet('nuke') : null;
      if (nz) {
        var ni = Math.min(nz.length - 1, Math.floor((f.t / RTS_ANIMS.nuke.dur) * nz.length));
        var nc = nz[ni];
        var nw = Math.round(nc.width * TSscale * (f.big || 1));
        var nh = Math.round(nc.height * TSscale * (f.big || 1));
        g.drawImage(nc, Math.round(_rtsSX(f.x) - nw / 2), Math.round(_rtsSY(f.z) - nh * 0.88),
                    nw, nh);
        continue;
      }
    }
    if (f.kind === 'die') {
      /* A soldier falling over, drawn from his own artwork. Held on the LAST frame once the
         sequence runs out rather than looping - a body that gets back up and dies again is
         worse than one that lies still. */
      var dq = RTS_ANIMS.die.dur;
      var di = Math.min(f.seq.length - 1, Math.floor((f.t / dq) * f.seq.length));
      var dc = f.seq[di];
      var dw = Math.round(dc.width * TSscale), dh = Math.round(dc.height * TSscale);
      g.drawImage(dc, Math.round(_rtsSX(f.x) - dw / 2), Math.round(_rtsSY(f.z) - dh * 0.62),
                  dw, dh);
      continue;
    }
    if (f.kind === 'debris') {
      /* Chunks thrown clear of a dying structure. Height projects upward the same way the
         baked sprites do, so a chunk arcs over the ground rather than sliding along it. */
      var ds = Math.max(1, Math.round(cell * 0.07 * (f.big || 1)));
      var dxp = Math.round(_rtsSX(f.x)), dyp = Math.round(_rtsSY(f.z) - f.y * _rtsZoom() * 0.8);
      g.globalAlpha = f.t > 1.2 ? Math.max(0, (1.6 - f.t) / 0.4) : 1;
      g.fillStyle = '#15171b';
      g.fillRect(dxp - ds, Math.round(_rtsSY(f.z)) - 1, ds * 2, 2);     /* ground shadow */
      g.fillStyle = f.t < 0.35 ? '#e0561c' : RTS_PAL.dark[1];
      g.fillRect(dxp - ds, dyp - ds, ds * 2, ds * 2);
      g.globalAlpha = 1;
      continue;
    }
    if (f.kind === 'fire') {
      var ff = S.fire[_rtsAnimFrame() % S.fire.length];
      var fw = Math.round(ff.width * TSscale * (f.big || 1));
      var fh = Math.round(ff.height * TSscale * (f.big || 1));
      g.drawImage(ff, Math.round(_rtsSX(f.x) - fw / 2), Math.round(_rtsSY(f.z) - fh * 0.8), fw, fh);
      continue;
    }
    if (f.kind === 'tracer') {
      if (f.t > 0.06) continue;
      g.strokeStyle = 'rgba(255,242,192,0.9)';
      g.lineWidth = Math.max(1, cell * 0.04);
      g.beginPath();
      g.moveTo(_rtsSX(f.x), _rtsSY(f.z));
      g.lineTo(_rtsSX(f.x2), _rtsSY(f.z2));
      g.stroke();
    } else {
      /* Combat_Anim: which set of frames this is comes from the animation kind, which the
         simulation chose from the damage and the land type. */
      /* Role-by-role, so `hit` and `pop` use their own artwork where it exists instead of a
         scaled fireball. Falling back to boom keeps a set that only half-loaded working. */
      var set = f.kind === 'piff' ? S.fx.piff
              : (f.kind === 'splash' ? S.fx.splash
              : (f.kind === 'smoke' ? S.fx.smoke
              : (f.kind === 'hit' && S.fx.hit ? S.fx.hit
              : (f.kind === 'pop' && S.fx.pop ? S.fx.pop
              : (RTS_ANIMS[f.kind] && RTS_ANIMS[f.kind].size ? S.fx.fire : S.fx.boom)))));
      var dur = (RTS_ANIMS[f.kind] && RTS_ANIMS[f.kind].dur) || 0.75;
      var fr = Math.min(set.length - 1, Math.floor(_rtsAnimQ(f.t) / dur * set.length));
      var img = set[Math.max(0, fr)];
      var sz = img.width * TSscale * (f.big || 1) * 0.9;
      /* Draw at the frame's OWN aspect ratio. This used to force every effect square, which
         is harmless for a fireball or a spark but squashes a flame - and a flame is taller
         than it is wide. Every pre-existing effect set is square, so this changes none of
         them. A fire is also anchored near its BASE rather than its centre, because it
         stands on the ground rather than hanging in the air around it. */
      var szh = sz * (img.height / img.width);
      var anchor = RTS_ANIMS[f.kind] && RTS_ANIMS[f.kind].size ? 0.72 : 0.5;
      g.drawImage(img, Math.round(_rtsSX(f.x) - sz / 2), Math.round(_rtsSY(f.z) - szh * anchor), sz, szh);
    }
  }

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
    var fsx = R.focus.x / RTS_TILE + RTS_N / 2 - (R.W / 2) / cell;
    var fsy = R.focus.z / RTS_TILE + RTS_N / 2 - (R.H / 2) / cell;
    /* SMOOTHED, deliberately, and only for this one draw. The comment above says hard edges
       are "the way the original's shroud tiles do" it - but RA's shadow.shp frames are
       diagonal wedges and corner nibbles, a CUT edge; the hard cell-aligned square was this
       fallback's approximation of that, and blown up it read as a black staircase, the
       loudest wrong note in the frame. A half-cell soft edge is the other honest
       approximation, it is what the 3D mode's LINEAR-sampled fog already does, and using it
       here means the two modes agree about what the boundary looks like. Players with their
       archives loaded still get the real wedges - this branch is the fallback only. */
    g.imageSmoothingEnabled = true;
    g.drawImage(R.fog, fsx, fsy, R.W / cell, R.H / cell, 0, 0, R.W, R.H);
    g.imageSmoothingEnabled = false;
  }

  /* --- placement ghost --- */
  if (R.ghost) {
    var def = rtsStructDef(R.ghostKey);
    var gspr = S.bld[R.ghost.side][R.ghostKey];
    var gx = Math.round(_rtsSX(_rtsWX(R.ghost.tx) - RTS_TILE / 2));
    var gy = Math.round(_rtsSY(_rtsWX(R.ghost.tz) - RTS_TILE / 2));
    g.globalAlpha = 0.55;
    /* DIVIDE BY THE SCALE THE SPRITE WAS BAKED AT, exactly as _rtsDrawStruct does. This was
       the one draw site that missed it, so the ghost came out at RTS_PS times its real size -
       measured at zoom 48, the Construction Yard ghost was drawn 288x448 with its head offset
       at 160 where 144x224 and 80 are correct, inside a footprint box the very next statement
       strokes correctly at 144x144. On a 390 CSS px phone that is a translucent building 74%
       of the screen wide, floating above and beside the green box telling you where it will
       actually land. Procedural art only: real Red Alert art carries no `ps` and reads as 1,
       so a player with their own archives loaded never saw this. */
    var gsc = TSscale / (gspr.c.ps || 1);
    g.drawImage(gspr.c, gx, gy - Math.round(gspr.head * gsc),
      Math.round(gspr.c.width * gsc), Math.round(gspr.c.height * gsc));
    g.globalAlpha = 1;
    g.strokeStyle = R.ghost.ok ? '#7fe07f' : '#e05a4a';
    g.lineWidth = 2;
    g.strokeRect(gx + 1, gy + 1, def.w * cell - 2, def.h * cell - 2);
  }

  /* Last, over the finished battlefield and nothing else. */
  _rtsPost(g);
}


