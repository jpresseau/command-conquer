/* render/fx.js - projectiles, explosions, tracers, muzzle flashes and debris.
   Part of rts.render, which owns every pixel. Split out of render/frame.js, which it pushed
   past the 500-line cap.

   THE SEAM IS "TRANSIENT" AGAINST "STANDING". Everything render/frame.js keeps is either the
   map itself or an object that occupies cells and sorts into the depth pass. Everything here
   lasts a fraction of a second, belongs to no cell, and is painted over the finished
   battlefield in whatever order the simulation holds it - which is why it needs no depth sort,
   and why lifting it out changes nothing about what is drawn or in what order.

   Every draw goes through the projection contract in render/camera.js and multiplies its size
   by the `scale` that comes back, so an effect on the far side of the view is sized to the
   ground under it. Under today's orthographic camera that scale is 1 and the arithmetic is
   what it always was. */
/* WHICH FRAME AN EFFECT IS SHOWING, AND HOW BIG IT IS, factored out because the 3D mode draws
   these as billboards in its own pass (render3d/fx3d.js) and the two must not drift. Everything
   about the choice - which set the kind maps to, the fallbacks when a set only half-loaded, the
   frame index, and whether the sprite hangs around its anchor or stands on it - lives here and
   nowhere else. */
function _rtsFxFrame(f, S) {
  var set = f.kind === 'piff' ? S.fx.piff
          : (f.kind === 'splash' ? S.fx.splash
          : (f.kind === 'smoke' ? S.fx.smoke
          : (f.kind === 'hit' && S.fx.hit ? S.fx.hit
          : (f.kind === 'pop' && S.fx.pop ? S.fx.pop
          : (RTS_ANIMS[f.kind] && RTS_ANIMS[f.kind].size ? S.fx.fire : S.fx.boom)))));
  var dur = (RTS_ANIMS[f.kind] && RTS_ANIMS[f.kind].dur) || 0.75;
  var fr = Math.min(set.length - 1, Math.floor(_rtsAnimQ(f.t) / dur * set.length));
  /* A fire is anchored near its BASE rather than its centre, because it stands on the ground
     rather than hanging in the air around it. */
  return { img: set[Math.max(0, fr)],
           anchor: RTS_ANIMS[f.kind] && RTS_ANIMS[f.kind].size ? 0.72 : 0.5 };
}

/* The sprite's width with NO perspective in it. The 3D path divides by the zoom to get
   world units. Divided by the density the frame was baked at: the drawn set
   bakes at RTS_PS and says so, real Red Alert artwork carries no tag and reads as 1, and
   _mixFx replaces these role by role so a mixed set holds both at once. */
function _rtsFxSize(img, TSscale, big) {
  return img.width * TSscale / (img.ps || 1) * (big || 1) * 0.9;
}

function _rtsDrawFx(g, G, S, TSscale, cell) {
  var i;
  /* 3D DRAWS WHAT IT OWNS ITSELF, inside the world pass rather than as decals laid over the
     finished picture - so it stands at its height and a building in front of it hides it.
     render3d/fxemit3d.js says which: _r3dFxOwns for G.fx, and the rounds in G.proj whenever
     the effects are shaded. Asking it is what keeps the two painters from both drawing one. */
  var r3on = !!(window._R3D && window._R3D.on) && typeof _r3dFxOwns === 'function';
  var r3proj = r3on && _r3dFxShaded();
  /* --- projectiles --- */
  for (i = 0; i < G.proj.length && !r3proj; i++) {
    var p = G.proj[i];
    if (!_rtsVisible(_rtsTX(p.x), _rtsTX(p.z))) continue;
    var pj = _rtsGroundToScreen(p.x, p.z);
    var sx = Math.round(pj.x), sy = Math.round(pj.y);
    g.fillStyle = p.kind === 'missile' ? '#ffd070' : '#fff2c0';
    var r = Math.max(2, Math.round(cell * pj.scale * (p.kind === 'missile' ? 0.09 : 0.06)));
    g.fillRect(sx - r, sy - r, r * 2, r * 2);
  }
  /* --- the Heavy Bomber's bombs, the same way: a dark dash each, at the height it fell to
     (RTS_AIR_ALT_K, core/airspace.js) - the shaded pass draws them itself (render3d/fxemit3d.js),
     and without this a device that cannot shade saw bursts appear from nowhere --- */
  var B = G.bombs || [];
  for (i = 0; i < B.length && !r3proj; i++) {
    var b = B[i];
    if (!_rtsVisible(_rtsTX(b.x), _rtsTX(b.z))) continue;
    var bj = _rtsWorldToScreen(b.x, _rtsElev(b.x, b.z) + b.y * RTS_AIR_ALT_K, b.z);
    if (!bj || bj.behind) continue;
    var bw = Math.max(1, Math.round(cell * (bj.scale || 1) * 0.04)), bh = Math.max(3, Math.round(cell * (bj.scale || 1) * 0.12));
    g.fillStyle = '#2a2a2c';
    g.fillRect(Math.round(bj.x) - bw, Math.round(bj.y) - bh, bw * 2, bh * 2);
  }
  /* --- the weather called down (core/wxsupers.js): a pale disc for a fog bank, a dark one for a
     thunderhead, and a bolt as a white line - the shaded pass draws the real thing
     (render3d/wxfx3d.js); without this a device that cannot shade saw sight cut and units struck
     by nothing at all --- */
  var WX = G.wx || [];
  for (i = 0; i < WX.length && !r3proj; i++) {
    var wc = WX[i], wj = _rtsGroundToScreen(wc.x, wc.z), wr = wc.r / RTS_TILE * cell * (wj.scale || 1);
    g.globalAlpha = wc.kind === 'fog' ? 0.35 : 0.45;
    g.fillStyle = wc.kind === 'fog' ? '#d8dde2' : '#262a33';
    g.beginPath(); g.arc(wj.x, wj.y, wr, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 1;
  }
  var BL = G.bolts || [];
  for (i = 0; i < BL.length && !r3proj; i++) {
    var bo = BL[i], bt = _rtsWorldToScreen(bo.x, _rtsElev(bo.x, bo.z) + 14, bo.z), bb = _rtsGroundToScreen(bo.x, bo.z);
    g.strokeStyle = '#ffffff'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(bt.x, bt.y); g.lineTo(bb.x, bb.y); g.stroke();
  }

  /* --- explosions, tracers, muzzle flashes --- */
  for (i = 0; i < G.fx.length; i++) {
    var f = G.fx[i], k = _rtsAnimQ(f.t) / 0.75;
    if (f.t < 0) continue;                       /* a delayed secondary blast, not started */
    if (r3on && _r3dFxOwns(f.kind)) continue;    /* the world pass has it - see above */
    if (f.kind === 'debris') {
      /* Chunks thrown clear of a dying structure. Height projects upward the same way the
         baked sprites do, so a chunk arcs over the ground rather than sliding along it. */
      var dg = _rtsGroundToScreen(f.x, f.z);
      var dr = _rtsWorldToScreen(f.x, f.y * 1.6, f.z);   /* the chunk's own height */
      var ds = Math.max(1, Math.round(cell * 0.07 * dg.scale * (f.big || 1)));
      var dxp = Math.round(dr.x), dyp = Math.round(dr.y);
      g.globalAlpha = f.t > 1.2 ? Math.max(0, (1.6 - f.t) / 0.4) : 1;
      g.fillStyle = '#15171b';
      g.fillRect(Math.round(dg.x) - ds, Math.round(dg.y) - 1, ds * 2, 2);   /* ground shadow */
      g.fillStyle = f.t < 0.35 ? '#e0561c' : RTS_PAL.dark[1];
      g.fillRect(dxp - ds, dyp - ds, ds * 2, ds * 2);
      g.globalAlpha = 1;
      continue;
    }
    if (f.kind === 'fire') {
      var ff = S.fire[_rtsAnimFrame() % S.fire.length];
      var fp = _rtsGroundToScreen(f.x, f.z);
      /* divided by the density the flame was baked at, like every other sprite draw */
      var fsc = TSscale * fp.scale / (ff.ps || 1);
      var fw = Math.round(ff.width * fsc * (f.big || 1));
      var fh = Math.round(ff.height * fsc * (f.big || 1));
      g.drawImage(ff, Math.round(fp.x - fw / 2), Math.round(fp.y - fh * 0.8), fw, fh);
      continue;
    }
    if (f.kind === 'tracer') {
      /* A ROUND IN FLIGHT, NOT A BEAM. This drew the whole muzzle-to-target line at 90%
         opacity for its entire life, which at the top zoom is a hard cream stroke running the
         width of the battlefield - it read as a scratch on the screen rather than as gunfire,
         and every machine-gun burst drew several at once.

         The weapon really is hitscan (w.speed <= 0 applies its damage on the spot), so there
         is no projectile to follow; what the effect has to sell is the ROUND, and a round is
         a short bright dash somewhere along the line. It advances over the effect's 0.06s and
         fades as it goes, so a burst reads as a stream of them leaving the barrel instead of
         as a solid rod connecting shooter to victim. */
      var TRL = 0.06;
      if (f.t > TRL) continue;
      var ta = _rtsGroundToScreen(f.x, f.z), tb = _rtsGroundToScreen(f.x2, f.z2);
      var ax = ta.x, ay = ta.y, bx2 = tb.x, by2 = tb.y;
      var vx = bx2 - ax, vy = by2 - ay, flen = Math.hypot(vx, vy) || 1;
      var u = Math.min(1, f.t / TRL + 0.28);          /* the head, already clear of the barrel */
      var hx = ax + vx * u, hy = ay + vy * u;
      /* the dash is a fraction of the flight, so a point-blank shot does not overshoot its
         own target, and capped in cells so a long shot is still a dash and not a line */
      var dash = Math.min(flen * 0.34, cell * ta.scale * 1.1);
      g.strokeStyle = 'rgba(255,242,192,' + (0.85 * (1 - f.t / TRL)).toFixed(3) + ')';
      g.lineWidth = Math.max(1, cell * ta.scale * 0.035);
      g.beginPath();
      g.moveTo(hx - vx / flen * dash, hy - vy / flen * dash);
      g.lineTo(hx, hy);
      g.stroke();
    } else {
      /* Combat_Anim: which set of frames this is comes from the animation kind, which the
         simulation chose from the damage and the land type. */
      var pick = _rtsFxFrame(f, S);
      var img = pick.img;
      var xp = _rtsGroundToScreen(f.x, f.z);
      /* Divided by the density the frame was baked at. The drawn set bakes at RTS_PS and
         says so; real Red Alert artwork carries no tag and reads as 1, which matters here
         because _mixFx replaces these role by role and a mixed set holds both at once. */
      var sz = _rtsFxSize(img, TSscale, f.big) * xp.scale;
      /* Draw at the frame's OWN aspect ratio. This used to force every effect square, which
         is harmless for a fireball or a spark but squashes a flame - and a flame is taller
         than it is wide. Every pre-existing effect set is square, so this changes none of
         them. A fire is also anchored near its BASE rather than its centre, because it
         stands on the ground rather than hanging in the air around it. */
      var szh = sz * (img.height / img.width);
      var anchor = pick.anchor;
      g.drawImage(img, Math.round(xp.x - sz / 2), Math.round(xp.y - szh * anchor), sz, szh);
    }
  }
}
