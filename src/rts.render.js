/* RC COMMAND - render layer. Canvas 2D, sprite-based, pure top-down.

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
function _rtsPickAt(mx, my) {
  var G = window._rtsG, p = _rtsGroundAt(mx, my);
  var best = null, bd = 1e9, i;
  for (i = 0; i < G.ents.length; i++) {
    var e = G.ents[i];
    if (e.dead) continue;
    var rad, d = Math.hypot(e.x - p.x, e.z - p.z);
    if (e.type === 'struct') { var sd = rtsStructDef(e.def); rad = Math.max(sd.w, sd.h) * RTS_TILE * 0.55; }
    else rad = Math.max(2.2, e.r * 1.6);
    if (d <= rad && d < bd) { bd = d; best = e; }
  }
  return best ? { ent: best, x: p.x, z: p.z } : { ent: null, x: p.x, z: p.z };
}

/* --------------------------------------------------------------- the frame */
function _rtsRFrame(dt) {
  var R = _rtsR, G = window._rtsG, g = R.g, S = R.spr, i;
  var z = _rtsZoom(), cell = R.cell, TSscale = cell / RTS_TS;

  g.setTransform(R.dpr, 0, 0, R.dpr, 0, 0);
  g.imageSmoothingEnabled = false;
  g.fillStyle = '#1a1d16';
  g.fillRect(0, 0, R.W, R.H);

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
      if (ore <= 0) continue;
      var px = Math.round(_rtsSX(_rtsWX(tx) - RTS_TILE / 2));
      var py = Math.round(_rtsSY(_rtsWX(tz) - RTS_TILE / 2));
      var stage = Math.min(3, Math.floor(ore / RTS_SCRAP_TILE * 4));
      var vari = (tx * 7 + tz * 13) % 3;
      g.drawImage(S.ore[stage][vari], px, py, cell, cell);
    }
  }

  /* --- foundation pads. A separate pass before any structure is drawn, so one building's
     pad can never cover its neighbour. Without these a base looks like furniture dropped
     on a lawn; a scuffed earth apron is what makes it look built. --- */
  for (i = 0; i < G.ents.length; i++) {
    var pe = G.ents[i];
    if (pe.dead || pe.type !== 'struct') continue;
    var pd = rtsStructDef(pe.def);
    var pad = S.pad[pe.def];
    var pw = Math.round(pad.width * TSscale), ph = Math.round(pad.height * TSscale);
    var ppx = Math.round(_rtsSX(_rtsWX(pe.tx) - RTS_TILE / 2)) - Math.round(10 * TSscale);
    var ppy = Math.round(_rtsSY(_rtsWX(pe.tz) - RTS_TILE / 2)) - Math.round(8 * TSscale);
    if (ppx > R.W || ppy > R.H || ppx + pw < 0 || ppy + ph < 0) continue;
    g.drawImage(pad, ppx, ppy, pw, ph);
  }

  /* --- everything that stands up, painted back to front --- */
  var draw = [];
  for (i = 0; i < G.ents.length; i++) {
    var e = G.ents[i];
    if (e.dead) continue;
    if (e.z < R.focus.z - R.H / z || e.z > R.focus.z + R.H / z) continue;
    if (e.x < R.focus.x - R.W / z || e.x > R.focus.x + R.W / z) continue;
    draw.push(e);
  }
  draw.sort(function (a, b) { return a.z - b.z; });

  for (i = 0; i < draw.length; i++) {
    var d = draw[i];
    if (d.type === 'struct') _rtsDrawStruct(g, d, TSscale, cell);
    else _rtsDrawUnit(g, d, TSscale);
  }

  /* --- projectiles --- */
  for (i = 0; i < G.proj.length; i++) {
    var p = G.proj[i];
    var sx = Math.round(_rtsSX(p.x)), sy = Math.round(_rtsSY(p.z));
    g.fillStyle = p.kind === 'missile' ? '#ffd070' : '#fff2c0';
    var r = Math.max(2, Math.round(cell * (p.kind === 'missile' ? 0.09 : 0.06)));
    g.fillRect(sx - r, sy - r, r * 2, r * 2);
  }

  /* --- explosions, tracers, muzzle flashes --- */
  for (i = 0; i < G.fx.length; i++) {
    var f = G.fx[i], k = f.t / 0.75;
    if (f.t < 0) continue;                       /* a delayed secondary blast, not started */
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
    if (f.kind === 'tracer') {
      if (f.t > 0.06) continue;
      g.strokeStyle = 'rgba(255,242,192,0.9)';
      g.lineWidth = Math.max(1, cell * 0.04);
      g.beginPath();
      g.moveTo(_rtsSX(f.x), _rtsSY(f.z));
      g.lineTo(_rtsSX(f.x2), _rtsSY(f.z2));
      g.stroke();
    } else {
      var fr = Math.min(5, Math.floor(k * 6));
      var img = S.fx.boom[fr];
      var sz = img.width * TSscale * (f.big || 1) * 0.9;
      g.drawImage(img, Math.round(_rtsSX(f.x) - sz / 2), Math.round(_rtsSY(f.z) - sz / 2), sz, sz);
    }
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

function _rtsDrawStruct(g, e, TSscale, cell) {
  var R = _rtsR, def = rtsStructDef(e.def);
  var spr = R.spr.bld[e.side][e.def];
  var px = Math.round(_rtsSX(_rtsWX(e.tx) - RTS_TILE / 2));
  var py = Math.round(_rtsSY(_rtsWX(e.tz) - RTS_TILE / 2));
  var w = Math.round(spr.c.width * TSscale), h = Math.round(spr.c.height * TSscale);
  var top = py - Math.round(spr.head * TSscale);
  if (e.building) {
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
      if (((q + ((e.bprog * 30) | 0)) & 1) === 0) continue;
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
  var f = ((Math.round(e.rot / (Math.PI * 2) * 8) % 8) + 8) % 8;
  var img = R.spr.unit[e.side][e.def][f];
  var w = Math.round(img.width * TSscale), h = Math.round(img.height * TSscale);
  var px = Math.round(_rtsSX(e.x) - w / 2), py = Math.round(_rtsSY(e.z) - h / 2);
  if (e.hitT > 0) g.globalAlpha = 0.7;
  g.drawImage(img, px, py, w, h);
  g.globalAlpha = 1;
  if (e.fire > 0) {
    var fl = R.spr.fx.flash[Math.min(2, Math.floor(e.fire * 30))];
    var fx = _rtsSX(e.x) + Math.cos(e.turret) * w * 0.45;
    var fy = _rtsSY(e.z) + Math.sin(e.turret) * w * 0.45;
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
  return A[id] || (A[id] = { door: 0, phase: 0 });
}
function _rtsDrawStructAnim(g, e, def, px, top, w, h, cell) {
  var G = window._rtsG, S = G.sides[e.side], a = _rtsStructAnim(e.id);
  var u = cell / RTS_TS;                       /* screen px per art px */

  if (def.produces === 'vehicle') {
    /* Open while a vehicle is on the line, shut otherwise. 18 stages, wide open at 9. */
    var want = (S.q && S.q.vehicle) ? 9 : 0;
    a.door += Math.max(-0.35, Math.min(0.35, want - a.door)) * 0.5;
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
  if (e.def === 'refinery' || e.def === 'power') {
    /* A working structure blinks. Cheap, but it is the difference between a base that is
       running and a row of ornaments. */
    a.phase += 0.06;
    var lit = (Math.sin(a.phase) > 0.2);
    if (lit) {
      var r = Math.max(1, Math.round(u * 2));
      g.fillStyle = e.def === 'refinery' ? '#ffd070' : '#8fe8a8';
      g.fillRect(px + Math.round(w * 0.18), top + Math.round(h * 0.30), r, r);
      g.fillRect(px + Math.round(w * 0.74), top + Math.round(h * 0.30), r, r);
    }
  }
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
  _rtsR = null; _RTS_SPR = null;
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
