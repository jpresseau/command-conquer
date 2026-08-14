/* render/draw.js - drawing one structure or one unit, including their animations.
   Part of rts.render, which owns every pixel. */

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
  var bp = _rtsGroundToScreen(_rtsWX(e.tx) - RTS_TILE / 2, _rtsWX(e.tz) - RTS_TILE / 2);
  var px = Math.round(bp.x), py = Math.round(bp.y);
  /* THE SPRITE'S OWN RESOLUTION, not the map's. A procedurally baked sprite carries `ps` - how
     many of its pixels there are per RA art pixel (sprites/bake.js) - and real RA artwork
     carries none, so it reads as 1 and this is the arithmetic it always was. Dividing here is
     what keeps a building covering exactly its own tiles however finely it was baked. */
  var ps = spr.c.ps || 1, sc = TSscale / ps;
  var w = Math.round(spr.c.width * sc), h = Math.round(spr.c.height * sc);
  var top = py - Math.round(spr.head * sc);
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
    var fp = _rtsGroundToScreen(e.x, e.z);
    var rsc = TSscale * fp.scale / (fimg.ps || 1);
    var fws = Math.round(fimg.width * rsc * (0.9 + def.w * 0.35));
    var fhs = Math.round(fimg.height * rsc * (0.9 + def.w * 0.35));
    g.globalAlpha = Math.min(1, k * 1.6);
    g.drawImage(fimg, Math.round(fp.x - fws / 2), Math.round(fp.y - fhs * 0.75), fws, fhs);
    g.globalAlpha = 1;
    return;
  }
  if (e.hitT > 0) g.globalAlpha = 0.75;
  g.drawImage(spr.c, px, top, w, h);
  g.globalAlpha = 1;
  _rtsDrawStructAnim(g, e, def, px, top, w, h, cell);
  /* turret barrel tracks its target */
  if (def.weapon) {
    var tp = _rtsGroundToScreen(e.x, e.z);
    var cx = tp.x, cy = tp.y - cell * tp.scale * 0.25, L = cell * tp.scale * 0.55;
    g.strokeStyle = RTS_PAL.dark[0];
    g.lineWidth = Math.max(2, cell * tp.scale * 0.08);
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
  /* A SOLDIER STANDING STILL DOES NOT STAND TO ATTENTION FOREVER. Every so often he shifts his
     weight, checks his weapon, stretches - RA's idle1/idle2, ticked at 120ms.

     Cosmetic, and driven entirely off the clock and the unit's own `gait`, exactly like the
     walk cycle above: nothing is stored on the entity, so this cannot desynchronise a save, a
     replay or the sim. gait also staggers WHICH fidget and WHEN, so a squad standing in a line
     does not twitch in unison - the thing that would make it read as a glitch rather than as
     life. The period is 9-13s per unit, and each fidget runs a second or two of that.

     Only while genuinely idle: not prone, not walking, and not while the unit has a target,
     because a man mid-burst rolling his shoulders looks broken rather than relaxed. */
  var fidg = (!e.prone && d.kind === 'infantry' && !e.target
              && !(e.path && e.pi < e.path.length)
              && typeof _mixIdleAnim === 'function') ? _mixIdleAnim(e.def, e.side) : null;
  if (fidg && fidg.length) {
    var gt = e.gait || 0, per = 9 + (gt % 5), ph = (_rtsG.t + gt * 0.37) % per;
    var run = fidg[(gt + Math.floor((_rtsG.t + gt * 0.37) / per)) % fidg.length];
    if (ph < run.length * 0.12) img = run[Math.floor(ph / 0.12)];
  }
  /* The harvester AT WORK, from the 79 frames of harv.shp the facing bake does not use.
     Purely cosmetic - the sim's hstate drives it and is never touched. The dock timer is
     stamped here in the renderer because it is a drawing concern: the tip-up plays once from
     the moment unloading is first seen, then the pour loops until the sim moves on. */
  if (e.def === 'harvester' && typeof _mixHarvAnim === 'function') {
    var ha = (e.hstate === 'mining' || e.hstate === 'unload') ? _mixHarvAnim(e.side) : null;
    if (ha && e.hstate === 'mining') {
      var f8 = ((Math.round(e.rot / (Math.PI * 2) * 8) % 8) + 8) % 8;
      img = ha.harvest[f8][(Math.floor(_rtsG.t * 10) + (e.gait || 0)) % 8];
      e.dockT = 0;
    } else if (ha) {                                   /* unload */
      if (!e.dockT) e.dockT = _rtsG.t;
      var dk = Math.floor((_rtsG.t - e.dockT) * 10);
      img = dk < ha.dock.length ? ha.dock[dk]
                                : ha.pour[(dk - ha.dock.length) % ha.pour.length];
    } else e.dockT = 0;
  }
  /* Same as the structures: divide by the scale the sprite was baked at. See _rtsDrawStruct. */
  var up = _rtsGroundToScreen(e.x, e.z);
  var usc = TSscale * up.scale / (img.ps || 1);
  var w = Math.round(img.width * usc), h = Math.round(img.height * usc);
  var px = Math.round(up.x - w / 2), py = Math.round(up.y - h / 2);
  /* An aircraft is drawn lifted off its own ground position, with a flattened shadow left
     behind on the cell it is actually over. That gap is the only cue that says "this is above
     the battlefield rather than on it" - without it a helicopter reads as a fast, oddly
     invulnerable jeep. It shrinks to nothing while the machine is sitting on a pad rearming. */
  if (e.air) {
    var lift = Math.round((e.rearming > 0 ? 2 : (e.alt || 12)) * TSscale * up.scale);
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
    var mp = _rtsGroundToScreen(mz.x, mz.z);
    var fx = mp.x, fy = mp.y;
    var fs = fl.width * TSscale * mp.scale / (fl.ps || 1);
    g.drawImage(fl, Math.round(fx - fs / 2), Math.round(fy - fs / 2), fs, fs);
  }
  /* a loaded harvester shows its ore */
  if (d.harvest && e.carry > 1) {
    g.fillStyle = RTS_PAL.ore[1];
    var s = Math.max(2, Math.round(w * 0.16));
    g.fillRect(Math.round(up.x - s / 2), Math.round(up.y - h * 0.42), s, s);
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

