/* RED ALERT - render layer. Canvas 2D, sprite-based, pure top-down.

   This replaced a three.js renderer. The 3D version was the wrong medium: the games this
   is modelled on are 2D sprite games, and no amount of flattening the camera or shrinking
   footprints makes lit 3D geometry read as 1996 pixel art. The simulation was written with
   no renderer dependencies precisely so this swap was possible - rts.core.js did not
   change by a single line.

   Everything is drawn at sprite resolution (24px per map cell) and blitted with image
   smoothing off, scaled by a whole number of pixels per cell. That integer scaling is what
   keeps pixels square and hard instead of blurry.

   Screen space is a straight top-down projection of the sim's x/z plane:
       screenX = (worldX - focus.x) * zoom + W/2
       screenY = (worldZ - focus.z) * zoom + H/2
   No tilt, no perspective. */

var _rtsR = null;

function _rtsRInit(cv) {
  var W = cv.clientWidth || 960, H = cv.clientHeight || 620;
  var dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  var g = cv.getContext('2d', { alpha: false });
  g.imageSmoothingEnabled = false;

  _rtsR = {
    cv: cv, g: g, W: W, H: H, dpr: dpr,
    focus: { x: _rtsWX(21), z: _rtsWX(87) },
    zi: RTS_ZOOM_DEF,            /* index into RTS_ZOOMS */
    cell: RTS_ZOOMS[RTS_ZOOM_DEF],
    dist: 0,                     /* derived: world height visible, kept for the UI + minimap */
    spr: _rtsSprites(),
    ghost: null, ghostKey: null,
    terrain: null
  };
  _rtsR.terrain = _rtsBakeTerrain(window._rtsG);
  _rtsApplyCam();
  return _rtsR;
}

function _rtsZoom() { return _rtsR.cell / RTS_TILE; }          /* screen px per world unit */
/* Zoom is not a free number. The art is 24 px per cell, so a screen cell of anything but
   24, its double or its half resamples every sprite by a fraction and the whole picture
   goes soft - which is exactly how the first pass looked. */
function _rtsApplyCam() {
  var R = _rtsR;
  R.zi = Math.max(0, Math.min(RTS_ZOOMS.length - 1, R.zi | 0));
  R.cell = RTS_ZOOMS[R.zi];
  R.dist = R.H / _rtsZoom();
}
function _rtsZoomStep(dir) {
  var R = _rtsR;
  if (!R) return;
  R.zi = Math.max(0, Math.min(RTS_ZOOMS.length - 1, R.zi + (dir > 0 ? 1 : -1)));
  _rtsApplyCam();
}
function _rtsViewSpan() {
  var R = _rtsR, z = _rtsZoom();
  return { w: R.W / z, h: R.H / z };
}
function _rtsSX(wx) { return (wx - _rtsR.focus.x) * _rtsZoom() + _rtsR.W / 2; }
function _rtsSY(wz) { return (wz - _rtsR.focus.z) * _rtsZoom() + _rtsR.H / 2; }

function _rtsGroundAt(mx, my) {
  var R = _rtsR, z = _rtsZoom();
  return { x: (mx - R.W / 2) / z + R.focus.x, z: (my - R.H / 2) / z + R.focus.z };
}
function _rtsWorldToScreen(x, y, z) {
  return { x: _rtsSX(x), y: _rtsSY(z) - (y || 0) * _rtsZoom() * 0.5, behind: false };
}

/* Stamp RA's shroud tiles over the visible cells.

   Three states per cell, and they are NOT the same thing:
     unexplored  - never seen; fully black, and its neighbours get a shaped edge against it
     explored    - seen once, not currently watched; dimmed, no shape
     visible     - watched right now; nothing drawn

   The shaping is only ever computed against UNEXPLORED, because that is the boundary the eye
   reads as the edge of the map. Shaping the explored/visible boundary too would put hard
   diagonal wedges around every unit as it walks, which is noise rather than information. */
function _rtsDrawShroudTiles(g, G, cell) {
  var R = _rtsR, spr = _mixShroud(), map = _mixShroudMap();
  var N = RTS_N;
  /* which cells are on screen, in cell coordinates */
  var ox = R.focus.x / RTS_TILE + N / 2 - (R.W / 2) / cell;
  var oy = R.focus.z / RTS_TILE + N / 2 - (R.H / 2) / cell;
  var x0 = Math.max(0, Math.floor(ox) - 1), y0 = Math.max(0, Math.floor(oy) - 1);
  var x1 = Math.min(N - 1, Math.ceil(ox + R.W / cell) + 1);
  var y1 = Math.min(N - 1, Math.ceil(oy + R.H / cell) + 1);

  /* Off the edge of the MAP counts as unexplored, so the border gets a proper cut edge rather
     than stopping flat at the last cell. */
  function dark(x, y) { return (x < 0 || y < 0 || x >= N || y >= N) ? 1 : (G.mapped[y * N + x] ? 0 : 1); }

  var prevA = g.globalAlpha;
  for (var y = y0; y <= y1; y++) {
    for (var x = x0; x <= x1; x++) {
      var i = y * N + x;
      var sx = Math.round((x - ox) * cell), sy = Math.round((y - oy) * cell);
      var w = Math.ceil(cell) + 1;

      if (!G.mapped[i]) {
        /* unexplored: solid, no shape needed - the shape lives on the LIT side of the border */
        g.globalAlpha = 1;
        g.fillStyle = '#040609';
        g.fillRect(sx, sy, w, w);
        continue;
      }

      /* explored: dim it, then cut the edge against anything unexplored around it */
      if (!G.vis[i]) {
        g.globalAlpha = RTS_FOG_DIM;
        g.fillStyle = '#040609';
        g.fillRect(sx, sy, w, w);
      }

      var u = dark(x, y - 1), d = dark(x, y + 1), l = dark(x - 1, y), r = dark(x + 1, y);
      var e = 0;
      if (u) e |= 0x10;
      if (r) e |= 0x20;
      if (d) e |= 0x40;
      if (l) e |= 0x80;
      /* A corner only counts when neither of its sides does - otherwise the side piece already
         covers it, and the combined mask names a frame that does not exist. */
      if (!u && !l && dark(x - 1, y - 1)) e |= 0x01;
      if (!u && !r && dark(x + 1, y - 1)) e |= 0x02;
      if (!d && !r && dark(x + 1, y + 1)) e |= 0x04;
      if (!d && !l && dark(x - 1, y + 1)) e |= 0x08;
      if (!e) continue;

      var f = map[e];
      if (f < 0 || !spr[f]) continue;
      g.globalAlpha = 1;
      g.drawImage(spr[f], sx, sy, w, w);
    }
  }
  g.globalAlpha = prevA;
}

function _rtsPickAt(mx, my) {
  var G = window._rtsG, p = _rtsGroundAt(mx, my);
  var best = null, bd = 1e9, i;
  for (i = 0; i < G.ents.length; i++) {
    var e = G.ents[i];
    if (e.dead || !_rtsEntSeen(e)) continue;     /* you cannot click what you cannot see */
    var rad, d = Math.hypot(e.x - p.x, e.z - p.z);
    if (e.type === 'struct') { var sd = rtsStructDef(e.def); rad = Math.max(sd.w, sd.h) * RTS_TILE * 0.55; }
    else rad = Math.max(2.2, e.r * 1.6);
    if (d <= rad && d < bd) { bd = d; best = e; }
  }
  return best ? { ent: best, x: p.x, z: p.z } : { ent: null, x: p.x, z: p.z };
}

/* CONQUER.CPP: Color_Cycle(). Two clocks drive everything that shimmers.

   The pulse steps by 20 every TIMER_SECOND/6, bouncing between 0x20 and 150, and is applied
   to CC_PULSE_COLOR (radar box, glowing interface) and CC_EMBER_COLOR - RGBClass(255,80,80),
   the glow on burning things. The water clock rotates a band of palette entries one step
   every TIMER_SECOND/4.

   With no indexed palette to rotate, the same numbers drive an overlay cycle instead. The
   cadences are the originals' because they are what the eye recognises. */
var _RTS_PULSE = { val: 0x20, up: true, t: 0, wt: 0, wf: 0, at: 0, frame: 0 };
function _rtsCycleTick(dt) {
  var P = _RTS_PULSE;
  P.t += dt;
  while (P.t >= 1 / 6) {
    P.t -= 1 / 6;
    P.val += P.up ? 20 : -20;
    if (P.val > 150) { P.val = 150; P.up = false; }
    if (P.val < 0x20) { P.val = 0x20; P.up = true; }
  }
  P.wt += dt;
  while (P.wt >= 1 / 4) { P.wt -= 1 / 4; P.wf = (P.wf + 1) & 3; }
  /* Sync_Delay() pins the original to 15 FPS, and that cadence is a big part of how its
     animation reads - chunky rather than smooth. Movement here stays continuous (it would
     look broken at 15 Hz on a modern display), but everything that picks an animation FRAME
     advances off this counter instead of off wall-clock time. */
  P.at += dt;
  while (P.at >= 1 / 15) { P.at -= 1 / 15; P.frame++; }
}
function _rtsAnimFrame() { return _RTS_PULSE.frame; }
/* Time quantised to the 15 Hz grid, for anything choosing a frame from an elapsed timer. */
function _rtsAnimQ(t) { return Math.floor(t * 15) / 15; }
function _rtsPulse() { return _RTS_PULSE.val / 255; }        /* 0.125 .. 0.588 */
function _rtsEmber() {
  var k = _rtsPulse();
  return 'rgb(' + Math.round(255 * k) + ',' + Math.round(80 * k) + ',' + Math.round(80 * k) + ')';
}

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
  g.fillStyle = '#1a1d16';
  g.fillRect(-8, -8, R.W + 16, R.H + 16);

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
  g.drawImage(R.terrain,
    srcX, srcY, R.W / TSscale, R.H / TSscale,
    0, 0, R.W, R.H);

  for (var tz = tz0; tz <= tz1; tz++) {
    for (var tx = tx0; tx <= tx1; tx++) {
      var idx = _rtsIdx(tx, tz);
      var ore = G.scrap[idx];
      var isWater = G.terrain && G.terrain[idx] === RTS_T_WATER;
      if (ore <= 0 && !isWater) continue;
      var px = Math.round(_rtsSX(_rtsWX(tx) - RTS_TILE / 2));
      var py = Math.round(_rtsSY(_rtsWX(tz) - RTS_TILE / 2));
      if (isWater) {
        /* The crest highlights step round a four-frame cycle, so the lake moves. */
        g.drawImage(S.wave[(_RTS_PULSE.wf + tx + tz) & 3], px, py, cell, cell);
        continue;
      }
      /* The number of density steps comes from the sprite set, not from a literal: ours has
         four, the original's gold has TWELVE and its gems three. Hard-coding 4 here worked
         until real art arrived and then quietly showed a third of a field. */
      var set = (G.gems && G.gems[idx] ? S.gem : S.ore);
      var stage = Math.min(set.length - 1, Math.floor(ore / RTS_SCRAP_TILE * set.length));
      var vari = (tx * 7 + tz * 13) % set[stage].length;
      g.drawImage(set[stage][vari], px, py, cell, cell);
    }
  }

  /* --- new scorch marks and craters, stamped once into the baked terrain. Because the
     ground is a single canvas, a smudge costs nothing after the frame it appears on. --- */
  if (G.corpses && G.corpses.length) {
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

  /* --- foundation pads. A separate pass before any structure is drawn, so one building's
     pad can never cover its neighbour. Without these a base looks like furniture dropped
     on a lawn; a scuffed earth apron is what makes it look built. --- */
  for (i = 0; i < G.ents.length; i++) {
    var pe = G.ents[i];
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
    if (d.type === 'struct') _rtsDrawStruct(g, d, TSscale, cell);
    else _rtsDrawUnit(g, d, TSscale);
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
  if (G.mapped && typeof _mixShroud === 'function' && _mixShroud()) {
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
    g.drawImage(R.fog, fsx, fsy, R.W / cell, R.H / cell, 0, 0, R.W, R.H);
  }

  /* --- placement ghost --- */
  if (R.ghost) {
    var def = rtsStructDef(R.ghostKey);
    var gspr = S.bld[R.ghost.side][R.ghostKey];
    var gx = Math.round(_rtsSX(_rtsWX(R.ghost.tx) - RTS_TILE / 2));
    var gy = Math.round(_rtsSY(_rtsWX(R.ghost.tz) - RTS_TILE / 2));
    g.globalAlpha = 0.55;
    g.drawImage(gspr.c, gx, gy - Math.round(gspr.head * TSscale),
      Math.round(gspr.c.width * TSscale), Math.round(gspr.c.height * TSscale));
    g.globalAlpha = 1;
    g.strokeStyle = R.ghost.ok ? '#7fe07f' : '#e05a4a';
    g.lineWidth = 2;
    g.strokeRect(gx + 1, gy + 1, def.w * cell - 2, def.h * cell - 2);
  }
}


/* Which frame of an animated building to draw right now.

   Returns null when there is nothing to choose - no extra frames, or the building is still
   going up, where the build-up reveal owns the picture and a moving part inside it reads as a
   glitch. The damaged set is the same frames shifted by `half`, so the choice is made once
   against the healthy layout and shifted at the end. */
function _rtsBldFrame(e, spr) {
  if (!spr || !spr.frames || e.building) return null;
  var a = RTS_MIX_BLDANIM[e.def];
  if (!a) return null;
  var G = window._rtsG, hurt = e.hp < e.maxHp * RTS_COND_YELLOW;
  var idx = null;

  if (a.kind === 'facing') {
    /* Same classic facing order the vehicles use - measured once from the artwork, not read off
       a document - so a turret and a tank pointing the same way agree. */
    var f32 = Math.round(((-(e.rot || 0) / (Math.PI * 2)) * a.facings + a.facings) % a.facings);
    idx = a.start + _mixFacing(f32, a.facings);

  } else if (a.kind === 'fill') {
    /* All of a house's silos show the same level, because the ore is the HOUSE's, not the
       building's - which is also why selling one does not empty the others. */
    var cap = (typeof rtsCapacity === 'function') ? rtsCapacity(e.side) : 0;
    var S = G.sides[e.side];
    var frac = cap > 0 ? Math.max(0, Math.min(1, (S ? S.ore : 0) / cap)) : 0;
    idx = a.start + Math.min(a.len - 1, Math.floor(frac * a.len));

  } else if (a.kind === 'loop' || (a.kind === 'active' && _rtsBldBusy(e))) {
    idx = a.start + (Math.floor(G.t * (a.fps || 10)) % a.len);
  }

  if (idx === null) return null;
  if (hurt) idx += spr.half;
  return (idx >= 0 && idx < spr.frames.length) ? spr.frames[idx] : null;
}

/* Is this building doing its job? Deliberately a different question per type, because "busy"
   has a different meaning for each and a single generic flag would be wrong for all of them. */
function _rtsBldBusy(e) {
  var G = window._rtsG, S = G.sides[e.side];
  if (!S) return false;
  switch (e.def) {
    case 'yard':
      return !!S.q.struct;                       /* the yard works while a structure is queued */
    case 'tesla':
      return (e.cool || 0) > 0;                  /* the coil discharges, then recovers */
    case 'pdox': case 'iron': case 'mslo':
      /* a superweapon building is busy exactly while its charge is climbing */
      return !!(S.supers && S.supers[_rtsSuperKeyOf(e.def)] &&
                !S.supers[_rtsSuperKeyOf(e.def)].ready);
    case 'helipad': {
      var i, o;
      for (i = 0; i < G.ents.length; i++) {
        o = G.ents[i];
        if (o.dead || o.type !== 'unit' || o.side !== e.side || !o.rearming) continue;
        if (Math.abs(o.x - e.x) < RTS_TILE && Math.abs(o.z - e.z) < RTS_TILE) return true;
      }
      return false;
    }
    case 'depot': {
      var j, u;
      for (j = 0; j < G.ents.length; j++) {
        u = G.ents[j];
        if (u.dead || u.type !== 'unit' || u.side !== e.side) continue;
        if (u.hp >= u.maxHp) continue;                       /* nothing to mend */
        if (Math.abs(u.x - e.x) < RTS_TILE * 1.5 && Math.abs(u.z - e.z) < RTS_TILE * 1.5) return true;
      }
      return false;
    }
  }
  return false;
}
function _rtsSuperKeyOf(defKey) {
  var d = rtsStructDef(defKey);
  return (d && d.super) ? d.super.key : '';
}

function _rtsDrawStruct(g, e, TSscale, cell) {
  var R = _rtsR, def = rtsStructDef(e.def);
  var spr = R.spr.bld[e.side][e.def];
  /* Below half strength the original swaps in the damaged artwork - scorched, holed, smoking.
     RTS_COND_YELLOW is the same threshold the sim already uses for "hurt" everywhere else, so
     what you see and what the rules think agree rather than being two separate judgements.
     Only while it is STANDING: a building still going up shows its clean frame, because the
     build-up reveal is about progress and a half-built ruin reads as a bug. */
  /* An animated building picks its own frame - moving part, aim or fill level - and that frame
     already accounts for damage, so it is asked FIRST and the plain damaged swap below only
     runs for the buildings that have no frame set. */
  var af = _rtsBldFrame(e, spr);
  if (af) spr = { c: af, head: spr.head, dmg: spr.dmg, half: spr.half, frames: spr.frames };
  else if (spr.dmg && !e.building && e.hp < e.maxHp * RTS_COND_YELLOW) {
    spr = { c: spr.dmg, head: spr.head, dmg: spr.dmg };
  }
  var px = Math.round(_rtsSX(_rtsWX(e.tx) - RTS_TILE / 2));
  var py = Math.round(_rtsSY(_rtsWX(e.tz) - RTS_TILE / 2));
  var w = Math.round(spr.c.width * TSscale), h = Math.round(spr.c.height * TSscale);
  var top = py - Math.round(spr.head * TSscale);
  if (e.building) {
    /* The original's own construction sequence, when the player's files have it: RA draws a
       building assembling itself frame by frame, and 21 of the 22 ship one. That is what the
       reveal below was standing in for, so where the real thing exists it simply replaces it -
       no beam, no stipple, because the artwork is already doing the job they were faking. */
    var mk = (typeof _mixMake === 'function') ? _mixMake(e.def, e.side) : null;
    if (mk) {
      var mi = Math.max(0, Math.min(mk.frames.length - 1,
                        Math.floor(Math.min(1, e.bprog) * (mk.frames.length - 1))));
      var mc = mk.frames[mi];
      var mw = Math.round(mc.width * TSscale), mh = Math.round(mc.height * TSscale);
      g.drawImage(mc, px, py - Math.round(mk.head * TSscale), mw, mh);
      return;
    }
    /* Build-up. BUILDING.H drives this off Mission_Construction, and in the originals a
       structure visibly assembles rather than sliding up out of the ground. Here: the
       finished fraction is revealed from the bottom, the leading edge carries a bright
       construction beam, and a few stippled rows above it flicker so the boundary
       dissolves instead of being a hard horizontal cut. */
    var showH = Math.max(2, Math.round(h * Math.min(1, e.bprog)));
    var edge = top + (h - showH);
    g.save();
    g.beginPath(); g.rect(px, edge, w, showH); g.clip();
    g.drawImage(spr.c, px, top, w, h);
    g.restore();
    var band = Math.max(1, Math.round(cell / 12));
    for (var q = 1; q <= 4; q++) {                                /* dissolving stipple */
      var by = edge - q * band;
      if (by < top) break;
      if (((q + _rtsAnimFrame()) & 1) === 0) continue;
      g.save();
      g.beginPath(); g.rect(px, by, w, band); g.clip();
      g.globalAlpha = 0.85 - q * 0.18;
      g.drawImage(spr.c, px, top, w, h);
      g.restore();
      g.globalAlpha = 1;
    }
    g.fillStyle = '#cfe6ff';
    g.globalAlpha = 0.75;
    g.fillRect(px, edge - band, w, band);                          /* construction beam */
    g.globalAlpha = 1;
    return;
  }
  if (e.dead) {
    /* CountDown: the wreck. Darkened, sinking slightly and fading out over its last moments,
       with fire on top - so a destroyed building collapses rather than being deleted. */
    var k = Math.max(0, Math.min(1, e.wreck / RTS_WRECK_TIME));
    var sink = Math.round(h * (1 - k) * 0.16);
    g.save();
    g.globalAlpha = 0.35 + k * 0.6;
    g.beginPath(); g.rect(px, top + sink, w, h - sink); g.clip();
    g.drawImage(spr.c, px, top, w, h);
    /* burn it down to a silhouette as it goes */
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = 'rgba(14,12,12,' + (0.45 + (1 - k) * 0.4).toFixed(2) + ')';
    g.fillRect(px, top, w, h);
    g.restore();
    g.globalAlpha = 1;
    var ffr = _rtsAnimFrame() % R.spr.fire.length, fimg = R.spr.fire[ffr];
    var fws = Math.round(fimg.width * TSscale * (0.9 + def.w * 0.35));
    var fhs = Math.round(fimg.height * TSscale * (0.9 + def.w * 0.35));
    g.globalAlpha = Math.min(1, k * 1.6);
    g.drawImage(fimg, Math.round(_rtsSX(e.x) - fws / 2), Math.round(_rtsSY(e.z) - fhs * 0.75), fws, fhs);
    g.globalAlpha = 1;
    return;
  }
  if (e.hitT > 0) g.globalAlpha = 0.75;
  g.drawImage(spr.c, px, top, w, h);
  g.globalAlpha = 1;
  _rtsDrawStructAnim(g, e, def, px, top, w, h, cell);
  /* turret barrel tracks its target */
  if (def.weapon) {
    var cx = _rtsSX(e.x), cy = _rtsSY(e.z) - cell * 0.25, L = cell * 0.55;
    g.strokeStyle = RTS_PAL.dark[0];
    g.lineWidth = Math.max(2, cell * 0.08);
    g.beginPath(); g.moveTo(cx, cy);
    g.lineTo(cx + Math.cos(e.rot) * L, cy + Math.sin(e.rot) * L);
    g.stroke();
  }
}

function _rtsDrawUnit(g, e, TSscale) {
  var R = _rtsR, d = rtsUnitDef(e.def);
  var N = _sprFacingsFor(d);   /* d is already in hand - rtsUnitDef is a linear scan */
  var f = ((Math.round(e.rot / (Math.PI * 2) * N) % N) + N) % N;
  var turreted = R.spr.turret && R.spr.turret[e.side][e.def];
  var img = (e.prone && R.spr.prone[e.side][e.def])
    ? R.spr.prone[e.side][e.def][f]
    : (turreted ? R.spr.hull[e.side][e.def][f] : R.spr.unit[e.side][e.def][f]);
  /* A walking soldier steps through the run cycle. `gait` is MasterDoControls' 'randomstart' -
     it was put on every unit at spawn long before there were frames to start - so a squad does
     not march in lockstep. The cycle is driven off the clock rather than off distance covered,
     which is what the original does (Tick: 100). */
  var walk = R.spr.walk && R.spr.walk[e.side] && R.spr.walk[e.side][e.def];
  if (walk && !e.prone && e.path && e.pi < e.path.length) {
    var cyc = walk[f];
    img = cyc[(Math.floor(_rtsG.t * 10) + (e.gait || 0)) % cyc.length];
  }
  var w = Math.round(img.width * TSscale), h = Math.round(img.height * TSscale);
  var px = Math.round(_rtsSX(e.x) - w / 2), py = Math.round(_rtsSY(e.z) - h / 2);
  /* An aircraft is drawn lifted off its own ground position, with a flattened shadow left
     behind on the cell it is actually over. That gap is the only cue that says "this is above
     the battlefield rather than on it" - without it a helicopter reads as a fast, oddly
     invulnerable jeep. It shrinks to nothing while the machine is sitting on a pad rearming. */
  if (e.air) {
    var lift = Math.round((e.rearming > 0 ? 2 : (e.alt || 12)) * TSscale);
    g.save();
    g.globalAlpha = 0.28;
    g.drawImage(img, px, py + Math.round(h * 0.06), w, Math.max(1, Math.round(h * 0.55)));
    g.restore();
    py -= lift;
  }
  if (e.hitT > 0) g.globalAlpha = 0.7;
  g.drawImage(img, px, py, w, h);
  /* SecondaryFacing: the turret is its own shape at its own angle, drawn over the hull. */
  if (turreted) {
    var tf = ((Math.round(e.turret / (Math.PI * 2) * N) % N) + N) % N;
    var timg = turreted[tf], rx = 0, ry = 0;
    /* Recoil_Adjust: a firing turret moves back one pixel along its facing. */
    if (e.recoil > 0) {
      var u = Math.max(1, Math.round(TSscale));
      rx = -Math.round(Math.cos(e.turret)) * u;
      ry = -Math.round(Math.sin(e.turret)) * u;
    }
    g.drawImage(timg, px + rx, py + ry, w, h);
  }
  g.globalAlpha = 1;
  if (e.fire > 0) {
    var fl = R.spr.fx.flash[Math.min(2, Math.floor(e.fire * 30))];
    /* The flash belongs on the muzzle the shot actually left from - the same Fire_Coord the
       simulation used, projected. Offsetting along `e.turret` regardless put the flash on the
       turret's bearing even for a hull-mounted gun like the buggy's, so the flash and its own
       tracer came off the vehicle at different angles. */
    var mz = _rtsFireCoord(e, e.type === 'struct' ? null : RTS_WEAPONS[d.weapon]);
    var fx = _rtsSX(mz.x), fy = _rtsSY(mz.z);
    var fs = fl.width * TSscale;
    g.drawImage(fl, Math.round(fx - fs / 2), Math.round(fy - fs / 2), fs, fs);
  }
  /* a loaded harvester shows its ore */
  if (d.harvest && e.carry > 1) {
    g.fillStyle = RTS_PAL.ore[1];
    var s = Math.max(2, Math.round(w * 0.16));
    g.fillRect(Math.round(_rtsSX(e.x) - s / 2), Math.round(_rtsSY(e.z) - h * 0.42), s, s);
  }
}

/* Animated states. BUILDING.H carries BState/QueueBState and MAX_DOOR_STAGE 18 with
   DOOR_OPEN_STAGE 9: a structure is not one static bitmap, it has an idle look and a
   working look, and the War Factory's door is an eighteen-frame animation. Door and
   activity phase are kept here, keyed by entity id, so the simulation stays renderer-free. */
function _rtsStructAnim(id) {
  var A = _rtsR.anim || (_rtsR.anim = {});
  return A[id] || (A[id] = { door: 0, phase: 0, df: -1 });
}
function _rtsDrawStructAnim(g, e, def, px, top, w, h, cell) {
  var G = window._rtsG, S = G.sides[e.side], a = _rtsStructAnim(e.id);
  var u = cell / RTS_TS;                       /* screen px per art px */

  if (def.produces === 'vehicle') {
    /* Open while a vehicle is on the line, shut otherwise. 18 stages, wide open at 9. */
    var want = (S.q && S.q.vehicle) ? 9 : 0;
    /* One stage per animation frame: MAX_DOOR_STAGE 18 at 15 FPS is the original's timing. */
    if (a.df !== _rtsAnimFrame()) {
      a.df = _rtsAnimFrame();
      a.door += Math.max(-1, Math.min(1, want - a.door));
    }
    var open = Math.max(0, Math.min(1, a.door / 9));
    if (open > 0.01) {
      var dw = Math.round(30 * u), dh = Math.round(13 * u * open);
      var dx = px + Math.round(w / 2 - dw / 2);
      var dy = top + h - Math.round(15 * u);
      g.fillStyle = '#0d0f12';
      g.fillRect(dx, dy, dw, dh);
      g.fillStyle = RTS_PAL.lit;
      g.globalAlpha = 0.35;
      g.fillRect(dx, dy + dh - Math.max(1, Math.round(u)), dw, Math.max(1, Math.round(u)));
      g.globalAlpha = 1;
    }
  }
  /* A structure below a third health burns. CC_EMBER_COLOR pulses on the same clock as the
     radar, which is what ties the whole screen's glow together in the original. */
  var hpFrac = e.hp / rtsStructDef(e.def).hp;
  if (hpFrac < 0.34) {
    var er = Math.max(1, Math.round(u * 3));
    g.fillStyle = _rtsEmber();
    for (var q = 0; q < 3; q++) {
      var ex = px + Math.round(w * (0.24 + q * 0.26));
      var ey = top + Math.round(h * (0.42 + ((q * 7 + (_RTS_PULSE.wf & 1)) % 3) * 0.14));
      g.fillRect(ex, ey, er, er);
    }
    g.globalAlpha = 0.28 + _rtsPulse() * 0.3;
    g.fillStyle = '#2a2a2e';
    g.fillRect(px + Math.round(w * 0.3), top - Math.round(u * 5), Math.round(w * 0.4), Math.round(u * 6));
    g.globalAlpha = 1;
  }
  if (e.def === 'refinery' || e.def === 'power') {
    /* A working structure blinks. Cheap, but it is the difference between a base that is
       running and a row of ornaments. */
    var lit = (((_rtsAnimFrame() + e.id) % 14) < 6);
    if (lit) {
      var r = Math.max(1, Math.round(u * 2));
      g.fillStyle = e.def === 'refinery' ? '#ffd070' : '#8fe8a8';
      g.fillRect(px + Math.round(w * 0.18), top + Math.round(h * 0.30), r, r);
      g.fillRect(px + Math.round(w * 0.74), top + Math.round(h * 0.30), r, r);
    }
  }
}

/* ------------------------------------------------------------ radar icons --
   CONQUER.CPP's Get_Radar_Icon builds a radar blip by DOWNSAMPLING THE REAL SHAPE - three
   samples per map cell, each taking the first non-transparent pixel found across a nine-tap
   offset kernel, so a thin feature does not drop out between samples. That is why structures
   are recognisable on the original's radar instead of being coloured blocks, which is what
   these were.

   Built once per structure type on first use. */
var _RTS_RICON = null;
function _rtsRadarIcon(key, side) {
  if (!_RTS_RICON) _RTS_RICON = {};
  var ck = key + ':' + side;
  if (_RTS_RICON[ck]) return _RTS_RICON[ck];
  var OFFX = [0, 0, -1, 1, 0, -1, 1, -1, 1], OFFY = [0, 0, -1, 1, 0, -1, 1, -1, 1];
  var def = rtsStructDef(key), spr = _rtsSprites().bld[side][key];
  var Z = 3, W = def.w * Z, H = def.h * Z;
  var src = spr.c.getContext('2d').getImageData(0, 0, spr.c.width, spr.c.height).data;
  var sw = spr.c.width;
  var t = _sprMake(W, H), g = t.g;
  for (var iy = 0; iy < H; iy++) {
    for (var ix = 0; ix < W; ix++) {
      /* Sample the footprint only - the headroom above it belongs to no tile. */
      var bx = Math.round((ix + 0.5) * RTS_TS / Z);
      var by = spr.head + Math.round((iy + 0.5) * RTS_TS / Z);
      for (var n = 0; n < 9; n++) {
        var qx = bx - OFFX[n], qy = by - OFFY[n];
        if (qx < 0 || qy < 0 || qx >= sw) continue;
        var o = (qy * sw + qx) * 4;
        if (src[o + 3] < 128) continue;
        g.fillStyle = 'rgb(' + src[o] + ',' + src[o + 1] + ',' + src[o + 2] + ')';
        g.fillRect(ix, iy, 1, 1);
        break;
      }
    }
  }
  _RTS_RICON[ck] = t.c;
  return t.c;
}

/* ------------------------------------------------------------ placement ghost */
function _rtsGhostShow(key) {
  _rtsR.ghost = { tx: 0, tz: 0, ok: false, side: 'player' };
  _rtsR.ghostKey = key;
}
function _rtsGhostHide() { if (_rtsR) { _rtsR.ghost = null; _rtsR.ghostKey = null; } }
function _rtsGhostMove(tx, tz, ok) {
  if (!_rtsR.ghost) return;
  _rtsR.ghost.tx = tx; _rtsR.ghost.tz = tz; _rtsR.ghost.ok = ok;
}

function _rtsRResize(W, H) {
  var R = _rtsR;
  if (!R) return;
  R.W = W; R.H = H;
  R.cv.width = Math.round(W * R.dpr); R.cv.height = Math.round(H * R.dpr);
  R.g.imageSmoothingEnabled = false;
  _rtsApplyCam();
}
function _rtsRDispose() {
  if (_rtsR && _rtsR.terrain) { _rtsR.terrain.width = 1; _rtsR.terrain.height = 1; }  /* 2688^2 is ~29 MB */
  /* _RTS_UFIT caches a measured canvas size per unit type. It is pure geometry, so it would
     survive a dispose harmlessly - but a harness that pokes R3_K between runs would then bake
     into stale squares, so it dies with the rest of the sprite cache. */
  _rtsR = null; _RTS_SPR = null; _RTS_UFIT = {};
}

/* ------------------------------------------------------------- sidebar icons --
   The sprites already are the artwork, so an icon is just the sprite on a dark plate. */
function _rtsMakeIcons(side) {
  var S = _rtsSprites(), out = {}, i;
  function plate(src, pad) {
    var n = 64, t = _sprMake(n, n), g = t.g;
    g.imageSmoothingEnabled = false;
    var grd = g.createLinearGradient(0, 0, 0, n);
    grd.addColorStop(0, '#2b3a4c'); grd.addColorStop(1, '#131b25');
    g.fillStyle = grd; g.fillRect(0, 0, n, n);
    var m = n - (pad || 8) * 2;
    var sc = Math.min(m / src.width, m / src.height);
    var w = Math.round(src.width * sc), h = Math.round(src.height * sc);
    g.drawImage(src, Math.round((n - w) / 2), Math.round((n - h) / 2), w, h);
    return t.c.toDataURL('image/png');
  }
  for (i = 0; i < RTS_STRUCTS.length; i++) out[RTS_STRUCTS[i].key] = plate(S.bld[side][RTS_STRUCTS[i].key].c, 6);
  for (i = 0; i < RTS_UNITS.length; i++) out[RTS_UNITS[i].key] = plate(S.unit[side][RTS_UNITS[i].key][6], 14);
  return out;
}
