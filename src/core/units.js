/* core/units.js - the per-unit tick, overrun, the harvester loop, and the structure and
   projectile ticks. Part of rts.core, the simulation. */

function _rtsUpdateUnit(e, dt) {
  /* Cargo rides along. Their coordinates are kept in step with the transport rather than left
     where they boarded, so anything that reads a passenger's position - the unload ring, a
     save, a trigger - gets the truth instead of a stale spot on the map. */
  if (e.cargo && e.cargo.length) {
    for (var _ci = e.cargo.length - 1; _ci >= 0; _ci--) {
      var _p = e.cargo[_ci];
      if (!_p || _p.dead) { e.cargo.splice(_ci, 1); continue; }
      _p.x = e.x; _p.z = e.z; _p.rot = e.rot;
    }
  }
  var G = window._rtsG, d = rtsUnitDef(e.def), w = d.weapon ? RTS_WEAPONS[d.weapon] : null;
  if (e.cool > 0) e.cool -= dt;
  if (e.fire > 0) e.fire -= dt;
  if (e.recoil > 0) e.recoil -= dt;
  if (e.hitT > 0) e.hitT -= dt;
  if (e.spot > 0) e.spot -= dt;
  /* Specialists do not panic. Fear scatters ordinary infantry, which is right for a rifle
     squad and fatal for a directed one: measured, a commando ordered onto an enemy barracks sat
     at fear 49.75, went prone, and had her goal rewritten every second - she circled the
     building for ten seconds and never arrived. A unit you spent 1200 credits on and pointed at
     one specific target has to complete the job, or the verb does not exist in practice.

     A deliberate deviation, and the reference argues for it: the Commando "can never be put in
     guard mode - you must manually target all enemies that you wish attacked". These units are
     directed rather than autonomous, so autonomous self-preservation does not apply. */
  /* IsFraidyCat, from IDATA.CPP's Read_INI - panic is a DECLARED property of the type, not
     something inferred from what verbs a unit happens to carry. This used to read
     `!d.capture && !d.steal && !d.demo && !d.heals`, which produced the right answer for the
     wrong reason and would have mis-classified the next unit added. The flag is checked INSIDE
     _rtsFearAI rather than here, so that fear still decays for the types that ignore it. */
  if (d.kind === 'infantry') _rtsFearAI(e, dt);
  /* Overrun_Square runs BEFORE the engage logic: a tank that is holding position and firing
     returns early from this function, and hooking the crush on the end meant a stationary
     tank never ran anything over. */
  if (RTS_CRUSHERS[e.def]) _rtsOverrun(e);

  /* ---- harvester economy loop ---- */
  if (d.harvest) { _rtsUpdateHarvester(e, dt, d); return; }

  /* ---- Field Medic: a passive aura, not an order ----
     Runs every tick regardless of what the medic is doing, because a medic that stops healing
     while it walks is a medic nobody uses. "Cannot heal himself" comes straight from the
     reference and stops a pair of medics being an immortal blob. */
  if (d.heals) {
    for (var hi = 0; hi < G.ents.length; hi++) {
      var pt = G.ents[hi];
      if (pt === e || pt.dead || pt.type !== 'unit' || pt.side !== e.side) continue;
      if (pt.hp >= pt.maxHp || rtsUnitDef(pt.def).kind !== 'infantry') continue;
      if (Math.hypot(pt.x - e.x, pt.z - e.z) > d.heals) continue;
      pt.hp = Math.min(pt.maxHp, pt.hp + d.healRate * dt);
    }
  }

  /* ---- Thief: walk into an enemy refinery and leave with half their treasury ---- */
  if (d.steal) {
    var tb = e.target;
    if (e.order === 'capture' && (!tb || tb.dead || tb.type !== 'struct' || tb.side === e.side
        || tb.def !== d.stealFrom)) { e.order = null; e.target = null; e.path = null; }
    else if (e.order === 'capture') {
      if (_rtsAtStruct(e, tb)) { _rtsSteal(e, tb); return; }
      /* A CONSUMED path is not a null path: e.path stays truthy with e.pi past its end,
         so guarding on `!e.path` alone leaves the unit parked wherever the route ran out.
         Re-path whenever the route is spent and we are still not there. */
      if (!e.path || e.pi >= e.path.length) {
        var tap = _rtsApproach(e, tb);
        e.goal = tap; e.path = _rtsPathFor(e, tap.x, tap.z); e.pi = 0;
        if (!e.path) { e.order = null; e.target = null; return; }
      }
      _rtsSteer(e, dt, d); return;
    }
    if (e.path) { _rtsSteer(e, dt, d); if (!e.path) e.order = null; }
    return;
  }

  /* ---- Commando: C4 on any building she can reach ----
     She keeps her pistols, so this is NOT an early-return like the thief - only the demolition
     order is special-cased, and everything else falls through to the normal engage logic. */
  if (d.demo && e.order === 'demo') {
    var db = e.target;
    if (!db || db.dead || db.type !== 'struct' || db.side === e.side) { e.order = null; e.target = null; }
    else if (_rtsAtStruct(e, db)) { _rtsDemo(e, db); return; }
    else {
      /* A CONSUMED path is not a null path: e.path stays truthy with e.pi past its end,
         so guarding on `!e.path` alone leaves the unit parked wherever the route ran out.
         Re-path whenever the route is spent and we are still not there. */
      if (!e.path || e.pi >= e.path.length) {
        var dap = _rtsApproach(e, db);
        e.goal = dap; e.path = _rtsPathFor(e, dap.x, dap.z); e.pi = 0;
        if (!e.path) { e.order = null; e.target = null; return; }
      }
      _rtsSteer(e, dt, d); return;
    }
  }

  /* ---- engineer: walk to the target building and take it ----
     Placed before the engage block because an engineer has no weapon and must never be pulled
     into the "acquire something to shoot" path - it would stand there aiming at a tank. */
  if (d.capture) {
    var cb = e.target;
    if (e.order === 'capture' && (!cb || cb.dead || cb.type !== 'struct' || cb.side === e.side
        || !rtsCapturable(cb.def))) {
      e.order = null; e.target = null; e.path = null;
    } else if (e.order === 'capture') {
      if (_rtsAtStruct(e, cb)) { _rtsCapture(e, cb); return; }
      /* A CONSUMED path is not a null path: e.path stays truthy with e.pi past its end,
         so guarding on `!e.path` alone leaves the unit parked wherever the route ran out.
         Re-path whenever the route is spent and we are still not there. */
      if (!e.path || e.pi >= e.path.length) {
        var cap = _rtsApproach(e, cb);
        e.goal = cap;
        e.path = _rtsPathFor(e, cap.x, cap.z); e.pi = 0;
        /* No route to it - drop the order rather than stand still looking busy forever. */
        if (!e.path) { e.order = null; e.target = null; return; }
      }
      _rtsSteer(e, dt, d);
      return;
    }
    /* Not capturing: an engineer still walks, but never acquires a target. */
    if (e.path) { _rtsSteer(e, dt, d); if (!e.path) e.order = null; }
    return;
  }

  /* An aircraft out of ammo is not available for anything else, so this runs first and can
     take the whole tick. */
  if (e.air && _rtsAirTick(e, dt, d)) { _rtsSteer(e, dt, d); return; }

  /* ---- boarding ---- */
  if (e.order === 'board') {
    var tr = e.target;
    if (!tr || tr.dead || !_rtsCanBoard(e, tr)) { e.order = null; e.target = null; e.path = null; }
    else if (_rtsRangeTo(e, tr) <= RTS_TILE * 1.6) { _rtsBoard(e, tr); return; }
    else {
      /* the transport moves, so the destination is re-aimed rather than pathed once */
      if (!e.path || Math.hypot(tr.x - e.goal.x, tr.z - e.goal.z) > RTS_TILE) {
        e.goal = { x:tr.x, z:tr.z };
        e.path = _rtsPathFor(e, tr.x, tr.z); e.pi = 0;
      }
    }
  }

  /* ---- engage ---- */
  var tgt = e.target;
  if (tgt && tgt.dead) {
    tgt = e.target = null;
    if (e.order === 'attack') { if (!_rtsRestoreMission(e)) e.order = null; }
  }
  /* An overridden mission that has run its course puts the old one back. Without this only
     the attack case ever restores, and the half of the defenders sent to stand guard would
     never resume what they were doing. */
  if (e.susp != null && !e.target && !e.path) _rtsRestoreMission(e);
  /* MISSION_STICKY holds ground: it acquires and fires, but never takes a chase order and
     never picks up a path. */
  if (e.order === 'hold') {
    e.path = null; e.goal = null;
    if (w && (!tgt || _rtsRangeTo(e, tgt) > _rtsReach(e))) e.target = tgt = _rtsFindTarget(e, _rtsReach(e));
  } else if (w && !tgt && (e.order === 'amove' || !e.order)) {
    tgt = _rtsFindTarget(e, d.sight);
    if (tgt) { e.target = tgt; if (!e.order) { e.order = 'attack'; e.path = null; } }
  }
  if (w) {
    /* Pick what we can actually shoot THIS frame: the ordered target when it is in range,
       otherwise whatever else already is. Without the fallback, a column marching on a
       distant building walks through turret fire without ever shooting back - which made
       an assault lose fifty tanks while killing one defender. */
    var shootAt = null, chasing = false;
    if (tgt) {
      if (_rtsRangeTo(e, tgt) <= _rtsReach(e)) shootAt = tgt;
      else { chasing = true; shootAt = _rtsFindTarget(e, _rtsReach(e)); }
    }
    if (shootAt) {
      /* What_Weapon_Should_I_Use, re-asked per target: a tank switches to its coaxial gun
         for infantry and back to the main gun for armour, without the player doing anything. */
      var fw = _rtsPickWeapon(e, shootAt);
      /* turret tracks its mark even while the hull is still swinging round */
      var ta = Math.atan2(shootAt.z - e.z, shootAt.x - e.x), td = ta - e.turret;
      while (td > Math.PI) td -= Math.PI * 2; while (td < -Math.PI) td += Math.PI * 2;
      var step = Math.min(Math.abs(td), RTS_TURRET_ROT * dt);
      e.turret += step * (td < 0 ? -1 : 1);
      e.tRot = Math.abs(td) > step + 1e-6;                /* still swinging */
      /* Can_Fire: FIRE_FACING unless the turret is lined up, and a homing weapon is four
         times more forgiving about it (Modify: `diff >>= 2`). A turret still rotating
         cannot fire at all unless its projectile homes - FIRE_ROTATING. */
      var tol = fw.speed > 0 && fw.shot === 'missile' ? RTS_FIRE_ANGLE * 4 : RTS_FIRE_ANGLE;
      var homing = fw.shot === 'missile';
      /* NoMovingFire (UDATA.CPP): some hulls cannot fire on the move. Rather than simply
         withholding the shot - which would leave artillery trundling past its target forever -
         a unit in range STOPS, and fires on the tick after it has halted. */
      var inRange = _rtsRangeTo(e, shootAt) <= fw.range;
      if (d.noMovingFire && inRange && e.path) { e.path = null; e.goal = null; }
      if (e.cool <= 0 && Math.abs(td) < tol && (homing || !e.tRot) && inRange
          && !(d.noMovingFire && e.path)) _rtsFire(e, shootAt, fw);
    } else if (!e.path) {
      /* no target: the turret returns to the hull's facing, as Rotation_AI does */
      var rd = e.rot - e.turret;
      while (rd > Math.PI) rd -= Math.PI * 2; while (rd < -Math.PI) rd += Math.PI * 2;
      e.turret += Math.min(Math.abs(rd), RTS_TURRET_ROT * 0.5 * dt) * (rd < 0 ? -1 : 1);
    }
    if (tgt && !chasing) {
      if (e.order === 'attack' || e.order === 'amove' || !e.order) e.path = null;
      if (e.order === 'attack') return;      /* in range: hold and keep firing */
    } else if (chasing && e.order === 'attack') {
      /* close on the ordered target; repath now and then rather than every frame */
      e.rep = (e.rep || 0) - dt;
      if (!e.path || e.rep <= 0) { e.goal = { x:tgt.x, z:tgt.z }; e.path = _rtsPathFor(e, tgt.x, tgt.z); e.pi = 0; e.rep = 0.9; }
    }
  } else { e.turret = e.rot; }

  if (e.path) { _rtsSteer(e, dt, d); if (!e.path && (e.order === 'move' || e.order === 'amove')) e.order = null; }
}
/* UNIT.CPP Overrun_Square. A crusher threatens the ground in front of it: infantry there
   scatter out of the way, and any that are actually under the tracks are killed. The
   original refuses to let HUMAN vehicles auto-crush - you have to drive over them yourself -
   which is why your own tanks never mow down the enemy infantry they are shooting at. */
function _rtsOverrun(e) {
  var G = window._rtsG, foe = _rtsEnemyOf(e.side);
  for (var i = 0; i < G.ents.length; i++) {
    var o = G.ents[i];
    if (o.dead || o.type !== 'unit' || o.side === e.side) continue;
    if (rtsUnitDef(o.def).kind !== 'infantry') continue;
    var d = Math.hypot(o.x - e.x, o.z - e.z);
    if (d > RTS_CRUSH_DIST) continue;
    if (d <= RTS_CRUSH_KILL) {
      o.hurtBy = e.side; o.crushed = 1;
      _rtsKill(o);
      if (typeof _rtsSfx === 'function') _rtsSfx('pop', o.x, o.z);
    } else {
      /* Incoming(): they panic and try to get out from under it */
      o.fear = Math.max(o.fear, RTS_FEAR.SCARED);
      if (!o.path && (o.side !== 'enemy' || _rtsIQAt(RTS_IQ.scatter))) _rtsScatter(o, e.x, e.z);
    }
  }
}
function _rtsUpdateHarvester(e, dt, d) {
  var G = window._rtsG;
  if (!e.hstate) { if (e.order !== 'move') _rtsOrderHarvest(e, null, null); }
  if (e.order === 'move' && e.path) { _rtsSteer(e, dt, d); if (!e.path) e.order = null; return; }

  if (e.hstate === 'toField') {
    if (!e.htile || G.scrap[_rtsIdx(e.htile.tx, e.htile.tz)] <= 0) e.htile = _rtsNearestScrap(e);
    if (!e.htile) { e.path = null; return; }                      /* nothing left to mine */
    var wx = _rtsWX(e.htile.tx), wz = _rtsWX(e.htile.tz);
    var away = Math.hypot(e.x - wx, e.z - wz);
    if (away < RTS_TILE * 1.1) { e.path = null; e.hstate = 'mining'; e.noGain = 0; return; }
    /* GIVE UP ON ORE YOU CANNOT REACH. The two conditions that clear htile - the tile running
       dry, and the pathfinder returning nothing - can both stay false for ever while the
       harvester makes no progress at all: A* keeps handing back a path, the steering keeps
       failing on the same cell, and the last-resort unstick drops it back where it started. On
       seed 42 that was 14,762 of 14,769 harvester ticks in 'toField' and zero deliveries in 246
       seconds, which is the whole economy. Distance closed is the honest measure of progress -
       not "did we get a path" - so if the gap has not narrowed in eight seconds, write this tile
       off and pick another. _rtsNearestScrap skips it while `noGo` is set. */
    if (e.bestGap === undefined || away < e.bestGap - 0.25) { e.bestGap = away; e.noGain = 0; }
    else {
      e.noGain = (e.noGain || 0) + dt;
      if (e.noGain > 8) {
        e.noGo = e.noGo || {};
        e.noGo[_rtsIdx(e.htile.tx, e.htile.tz)] = G.t + 90;       /* try it again much later */
        e.htile = null; e.path = null; e.noGain = 0; e.bestGap = undefined;
        return;
      }
    }
    if (!e.path) { e.goal = { x:wx, z:wz }; e.path = _rtsPathFor(e, wx, wz); e.pi = 0; if (!e.path) { e.htile = null; return; } }
    _rtsSteer(e, dt, d);
  } else if (e.hstate === 'mining') {
    var i = _rtsIdx(e.htile.tx, e.htile.tz), take = Math.min(RTS_HARVEST_RATE * dt, G.scrap[i], d.capacity - e.carry);
    G.scrap[i] -= take; e.carry += take;
    /* The hopper holds BAILS; what they are worth depends on what was in the ground. */
    e.carryVal += take * (G.gems[i] ? RTS_GEM_MULT : 1);
    if (G.scrap[i] <= 0.5) { G.scrap[i] = 0; G.gems[i] = 0; G.scrapDirty = true; e.htile = null; e.hstate = 'toField'; }
    if (e.carry >= d.capacity - 0.5) { e.hstate = 'toRef'; e.path = null; }
  } else if (e.hstate === 'toRef') {
    var ref = _rtsNearestRefinery(e);
    if (!ref) { e.path = null; return; }
    /* Docking_Coord: a harvester drives to the refinery's DOCK, not its centre. Pathing at
       the centre of a 3x3 building means every harvester aims at a blocked cell, stops
       wherever the crowd stops, and they pile up on whichever side they arrived from. */
    var dock = _rtsDockCoord(ref);
    /* generous docking radius: a harvester that stops one tile short of the strict range
       would otherwise hover beside the refinery without ever unloading */
    /* Arrive at the dock, but unload from anywhere alongside the building: four harvesters
       converging on one point shove each other back out of a strict dock radius, and the one
       at the back of the queue never finishes its trip. The dock is the destination, not a
       condition. */
    if (Math.hypot(e.x - dock.x, e.z - dock.z) < RTS_TILE * 1.6 || _rtsRangeTo(e, ref) < RTS_TILE * 2.2) {
      e.path = null; e.hstate = 'unload'; e.ref = ref; return;
    }
    e.rep = (e.rep || 0) - dt;
    if (!e.path || e.rep <= 0) { e.goal = { x:dock.x, z:dock.z }; e.path = _rtsPathFor(e, dock.x, dock.z); e.pi = 0; e.rep = 1.5; if (!e.path) return; }
    _rtsSteer(e, dt, d);
  } else if (e.hstate === 'unload') {
    if (!e.ref || e.ref.dead) { e.hstate = 'toRef'; return; }
    var give = Math.min(RTS_UNLOAD_RATE * dt, e.carry);
    var pay = e.carry > 0 ? e.carryVal * (give / e.carry) : 0;
    e.carry -= give; e.carryVal = Math.max(0, e.carryVal - pay);
    /* Harvested_Money, not a credit deposit: this is the one income in the game that goes
       into the STORE, so it is the one the Storage cap can refuse. */
    var lost = _rtsHarvested(G.sides[e.side], pay);
    if (lost > 0 && e.side === 'player') _rtsSiloWarn(G.sides[e.side]);
    if (e.carry <= 0.5) { e.carry = 0; e.carryVal = 0; e.hstate = 'toField'; }
  }
}
/* Nearest deposit, with gems worth a detour. The score is the WHOLE trip - out to the tile
   and back to the refinery - divided by what a load from it is worth, so a harvester will
   pass a nearer ore patch for gems only when the longer haul actually pays. Scoring on the
   one-way distance instead sends harvesters chasing gems across the map and drops income:
   mining takes about four seconds, the drive takes most of a minute. */
function _rtsNearestScrap(e) {
  var G = window._rtsG, best = null, bs = 1e9;
  var ref = _rtsNearestRefinery(e);
  var rx = ref ? ref.x : e.x, rz = ref ? ref.z : e.z;
  for (var tz = 0; tz < RTS_N; tz++) for (var tx = 0; tx < RTS_N; tx++) {
    var i = _rtsIdx(tx, tz);
    if (G.scrap[i] <= 0) continue;
    /* Tiles this harvester has already spent eight seconds failing to reach. Per harvester and
       time-limited rather than global and permanent: the reason is usually a unit or a building
       in the way, so the tile is very likely fine again later - and another harvester coming
       from a different direction may have no trouble with it at all. */
    if (e.noGo && e.noGo[i] > G.t) continue;
    var wx = _rtsWX(tx), wz = _rtsWX(tz);
    var trip = Math.hypot(wx - e.x, wz - e.z) + Math.hypot(wx - rx, wz - rz);
    /* The detour is weighted by a CAPPED preference, not by the raw value ratio. Once a gem
       step was correctly priced at four times GemValue, dividing the trip by the full 12.6x
       meant a gem tile twelve times further away scored the same as ore underfoot - every
       harvester on the map beelined for the middle, stripped it, and got rich. The Recruit
       AI went from 15 units to 60 and the difficulty ladder collapsed into one rung.
       Goto_Tiberium in the original just takes the CLOSEST patch; preferring gems at all is
       this game's idea, so bounding that preference is this game's job. */
    var s = trip / (G.gems[i] ? RTS_GEM_DETOUR : 1);
    if (s < bs) { bs = s; best = { tx:tx, tz:tz }; }
  }
  return best;
}
/* BUILDING.H Docking_Coord: the point a harvester actually parks at. South face of the
   refinery, one tile clear of the footprint - the same side the free harvester exits from. */
function _rtsDockCoord(ref) {
  var d = rtsStructDef(ref.def);
  return { x:_rtsWX(ref.tx) + (d.w - 1) * RTS_TILE / 2, z:_rtsWX(ref.tz + d.h) };
}
function _rtsNearestRefinery(e) {
  var G = window._rtsG, best = null, bd = 1e9;
  for (var i = 0; i < G.ents.length; i++) {
    var o = G.ents[i];
    if (o.type !== 'struct' || o.def !== 'refinery' || o.side !== e.side || o.dead || o.building) continue;
    var d = _rtsDist(e, o);
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}

/* ------------------------------------------------------- structures */
function _rtsUpdateStruct(e, dt) {
  var d = rtsStructDef(e.def);
  if (e.hitT > 0) e.hitT -= dt;
  if (e.selling) {
    /* Mission_Deconstruction: the build-up animation, in reverse. When it reaches the
       ground the crew comes out and the building is gone. */
    e.bprog -= dt / Math.max(0.4, d.build * RTS_DECON_TIME);
    e.hp = Math.max(1, d.hp * Math.max(0, e.bprog));
    if (e.bprog <= 0) {
      e.bprog = 0;
      _rtsEvacuate(e, _rtsSurvivorCount(e), false);
      _rtsKill(e);
    }
    return;
  }
  if (e.building) {
    /* buildings rise out of the ground while they finish, and gain HP as they go */
    e.bprog += dt / Math.max(0.5, d.build * 0.5) * _rtsPowerFactor(e.side);
    e.hp = d.hp * (0.15 + 0.85 * Math.min(1, e.bprog));
    if (e.bprog >= 1) { e.bprog = 1; e.building = 0; e.hp = d.hp; _rtsRecalcPower(e.side);
      _rtsGrandOpening(e);
      /* HouseClass::JustBuiltStructure, which TEVENT_BUILD reads. It is a one-frame signal,
         cleared at the end of the trigger pass that could have seen it. */
      var _jb = window._rtsG.justBuilt;
      if (_jb) _jb[e.side].struct = e.def; }
    return;
  }
  if (e.repair) _rtsRepairAI(e, dt);
  /* Service Depot. Anything of yours with wheels or tracks that is parked on it gets patched
     up for nothing - the point of the building is that it turns a battered army into a fresh
     one without a trip through the production queue. Infantry are excluded, as in the
     original: a depot repairs vehicles, it does not heal people. Needs power like everything
     else, so browning out the base also stops the repairs. */
  if (d.repairs && _rtsPowerFactor(e.side) >= 0.999) {
    var G2 = window._rtsG;
    for (var ri = 0; ri < G2.ents.length; ri++) {
      var v = G2.ents[ri];
      if (v.dead || v.type !== 'unit' || v.side !== e.side || v.hp >= v.maxHp) continue;
      if (rtsUnitDef(v.def).kind !== 'vehicle') continue;
      if (!_rtsAtStruct(v, e, d.repairs)) continue;
      v.hp = Math.min(v.maxHp, v.hp + d.repairRate * dt);
    }
  }
  if (!d.weapon) return;
  var w = RTS_WEAPONS[d.weapon];
  if (e.cool > 0) e.cool -= dt;
  if (e.fire > 0) e.fire -= dt;
  if (e.recoil > 0) e.recoil -= dt;
  /* a browned-out base loses its defences - power actually matters */
  if (_rtsPowerFactor(e.side) < 0.999) return;
  if (!e.target || e.target.dead || _rtsRangeTo(e, e.target) > w.range) e.target = _rtsFindTarget(e, w.range, w);
  if (!e.target) return;
  var ta = Math.atan2(e.target.z - e.z, e.target.x - e.x), td = ta - e.rot;
  while (td > Math.PI) td -= Math.PI * 2; while (td < -Math.PI) td += Math.PI * 2;
  e.rot += Math.min(Math.abs(td), 2.6 * dt) * (td < 0 ? -1 : 1);
  if (e.cool <= 0 && Math.abs(td) < 0.3) _rtsFire(e, e.target, w);
}

/* --------------------------------------------------------- projectiles --
   A shot in flight belongs to nobody in particular: it hits the first hostile thing it runs
   into, which need not be what it was aimed at. An infantry screen in front of a tank column
   now actually absorbs shells meant for the tanks. Only hostiles are tested - letting shells
   stop on friendlies as well would block every massed formation's line of fire, which is a
   different game. Splash still catches friendlies, as Explosion_Damage always did. */
function _rtsProjHit(p) {
  var G = window._rtsG, foe = _rtsEnemyOf(p.side), best = null, bd = 1e9;
  for (var i = 0; i < G.ents.length; i++) {
    var o = G.ents[i];
    if (o.dead || o.side !== foe) continue;
    var dx = o.x - p.x, dz = o.z - p.z;
    if (dx > RTS_SHELL_HIT * 6 || dx < -RTS_SHELL_HIT * 6) continue;   /* cheap reject */
    if (dz > RTS_SHELL_HIT * 6 || dz < -RTS_SHELL_HIT * 6) continue;
    var d = _rtsRangeTo(p, o);
    if (d < RTS_SHELL_HIT && d < bd) { bd = d; best = o; }
  }
  return best;
}
function _rtsUpdateProj(dt) {
  var G = window._rtsG;
  for (var i = G.proj.length - 1; i >= 0; i--) {
    var p = G.proj[i];
    p.life -= dt;
    /* missiles home; shells hold the bearing they left the barrel on */
    if (p.kind === 'missile' && p.tgt && !p.tgt.dead) {
      var dx = p.tgt.x - p.x, dz = p.tgt.z - p.z, d = Math.hypot(dx, dz) || 1;
      p.vx += (dx / d * p.speed - p.vx) * Math.min(1, dt * 4);
      p.vz += (dz / d * p.speed - p.vz) * Math.min(1, dt * 4);
    }
    p.x += p.vx * dt; p.z += p.vz * dt;
    var hit = _rtsProjHit(p);
    if (hit || p.life <= 0) {
      if (hit) _rtsDamage(hit, p.dmg, p.from);
      if (p.splash > 0) _rtsSplash(p.x, p.z, RTS_BLAST_CELLS * RTS_TILE, p.dmg, p.side, p.splash, p.from);
      _rtsCombatAnim(p.dmg, p.x, p.z, p.splash > 0 ? 1.4 : 0.7, hit);
      G.proj.splice(i, 1);
    }
  }
}

