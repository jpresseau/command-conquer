/* render/frame.js - _rtsRFrame: one frame - the 3D world, and the overlay over it.
   Part of rts.render. */

/* --------------------------------------------------------------- the frame
   The world - ground, entities, fog, effects - is drawn by the GL canvas underneath this one
   (_r3dFrame). This canvas is a transparent overlay over it, carrying only what is not part of
   the world: the crates, the effects the GL pass does not own (render/fx.js asks _r3dFxOwns),
   the placement outline, and the readouts. Everything on it positions itself through the same
   projection the meshes use (render/camera.js), so the two cannot drift apart. */
function _rtsRFrame(dt) {
  var R = _rtsR, G = window._rtsG, g = R.g, S = R.spr, i;
  var cell = R.cell, TSscale = cell / RTS_TS;

  _rtsCycleTick(dt);
  /* Shake_The_Screen(): the page is offset by a couple of pixels, a new offset each tick. The
     world layer shakes by a compositor transform, the overlay by its own transform, so the two
     cannot part. */
  var shk = G.shake || 0, shy = 0, shx = 0;
  if (shk > 0.02) {
    R.shakeF = (R.shakeF || 0) + 1;
    shy = ((R.shakeF & 1) ? 1 : -1) * Math.round(shk * 5);
    shx = ((R.shakeF & 2) ? 1 : -1) * Math.round(shk * 3);
  }
  g.setTransform(R.dpr, 0, 0, R.dpr, shx * R.dpr, shy * R.dpr);
  g.imageSmoothingEnabled = false;
  _r3dFrame(G);
  g.clearRect(-8, -8, R.W + 16, R.H + 16);
  var shT = (shx || shy) ? 'translate(' + shx + 'px,' + shy + 'px)' : '';
  if (window._R3D.shakeT !== shT) {
    window._R3D.shakeT = shT;
    window._R3D.cv.style.transform = shT;
  }

  /* --- new scorch marks and craters, stamped once into the baked terrain. Because the
     ground is a single canvas, a smudge costs nothing after the frame it appears on. --- */
  /* the GL ground shares this canvas, and is sent only the rectangles stamped (render3d/upload3d.js) */
  var stamp = window._R3D && typeof _r3dTerrainStamp === 'function' ? _r3dTerrainStamp : function () {};
  if (G.corpses && G.corpses.length) {
    var cg = R.terrain.getContext('2d');
    cg.imageSmoothingEnabled = false;
    while (G.corpses.length) {
      var cp = G.corpses.pop(), cim = S.corpse[cp.v % 3];
      var cpx = (cp.x / RTS_TILE + RTS_N / 2) * RTS_TS, cpy = (cp.z / RTS_TILE + RTS_N / 2) * RTS_TS;
      cg.drawImage(cim, Math.round(cpx - 7), Math.round(cpy - 6));
      stamp(Math.round(cpx - 7), Math.round(cpy - 6), cim.width, cim.height);
    }
  }
  if (G.newScorch && G.newScorch.length) {
    var tg = R.terrain.getContext('2d');
    tg.imageSmoothingEnabled = false;
    while (G.newScorch.length) {
      var ni = G.newScorch.pop();
      var nx = (ni % RTS_N) * RTS_TS, ny = ((ni / RTS_N) | 0) * RTS_TS;
      var sv = G.scorch[ni];
      var sim = (sv & 8) ? S.crater : S.scorch[((sv & 7) - 1) % 6];
      tg.drawImage(sim, nx, ny);
      stamp(nx, ny, sim.width, sim.height);
    }
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

  /* --- the player's own mines (core/mines.js): a dark disc with a ring in the house colour,
     blinking until it arms. Nobody else's are drawn - that is what a mine is - unless a Mine
     Sweeper has found it (core/sweeper.js), when it is ringed in the enemy's colour. --- */
  if (G.mines && G.mines.length) {
    var mr = Math.max(2, RTS_TILE * 0.32 * _rtsZoom()), tcol = (RTS_PAL.team.player || [])[1] || '#4a8ff0';
    for (i = 0; i < G.mines.length; i++) {
      var mn = G.mines[i];
      if (!_rtsMineShown(mn) || (mn.arm > 0 && ((G.t * 4) | 0) % 2)) continue;
      var mp = _rtsGroundToScreen(_rtsWX(mn.tx), _rtsWX(mn.tz)), ms = mr * (mp.scale || 1);
      if (mp.x < -ms || mp.y < -ms || mp.x > R.W + ms || mp.y > R.H + ms) continue;
      g.beginPath(); g.ellipse(mp.x, mp.y, ms, ms * 0.6, 0, 0, Math.PI * 2);
      g.fillStyle = 'rgba(28,32,26,0.92)'; g.fill();
      g.lineWidth = Math.max(1, ms * 0.28); g.strokeStyle = mn.side === 'player' ? tcol : ((RTS_PAL.team.enemy || [])[1] || '#e04a3a'); g.stroke();
    }
  }

  _rtsDrawFx(g, G, S, TSscale, cell);

  /* --- placement: the footprint as the ground shows it - four corners, projected at their own
     heights, so it is the right shape at any lean and faces the right way at any turn. The
     building itself is its own mesh (render3d/place3d.js). --- */
  if (R.ghost) {
    var def = rtsStructDef(R.ghostKey);
    g.strokeStyle = R.ghost.ok ? '#7fe07f' : '#e05a4a';
    g.lineWidth = 2;
    var gx0 = _rtsWX(R.ghost.tx) - RTS_TILE / 2, gz0 = _rtsWX(R.ghost.tz) - RTS_TILE / 2;
    var fw = def.w * RTS_TILE, fh = def.h * RTS_TILE, cs = [[0, 0], [fw, 0], [fw, fh], [0, fh]];
    g.beginPath();
    for (var gi = 0; gi < 4; gi++) {
      var gq = _rtsGroundToScreen(gx0 + cs[gi][0], gz0 + cs[gi][1]);
      if (gi) g.lineTo(gq.x, gq.y); else g.moveTo(gq.x, gq.y);
    }
    g.closePath(); g.stroke();
  }

  /* The render readout samples here, at the end of the frame walk, so what it times is a
     whole frame - see ui/gfxstat.js. It throttles its own repaint. */
  if (typeof _rtsGfxFrame === 'function') _rtsGfxFrame();
  /* The touch command bar builds itself from here for the same reason the readout does - see
     ui/touchcmd.js - and early-outs once its buttons exist. */
  if (typeof _rtsTouchCmdFrame === 'function') _rtsTouchCmdFrame();
}

/* The composited frame, on demand: the GL world with the overlay canvas over it - exactly what
   the compositor is showing the player, rebuilt as one readable canvas. This is the per-frame
   blit that used to live in the frame walk, demoted to a capture tool: the harness reads
   pixels, and layered canvases have no readable composite except through something like this. */
function _rtsCompose() {
  var R = _rtsR, R3 = window._R3D;
  var out = document.createElement('canvas');
  out.width = R.cv.width; out.height = R.cv.height;
  var og = out.getContext('2d');
  og.imageSmoothingEnabled = false;
  og.drawImage(R3.cv, 0, 0, out.width, out.height);
  og.drawImage(R.cv, 0, 0);
  return out;
}
