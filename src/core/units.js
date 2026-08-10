/* core/units.js - the per-unit tick, overrun, and the structure and projectile ticks. Part of
   rts.core, the simulation. The harvester economy the per-unit tick delegates to lives next
   door in core/harvest.js. */

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
  /* Cloaking_AI. Before anything that can return, so a submarine's `hidden` flag is refreshed
     every tick whatever else it is doing - a stale one is a boat that is invisible while parked
     or visible while running silent. */
  if (d.cloak) _rtsCloakAI(e, dt, d);
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
    /* `cb.selling` belongs in this list beside `cb.dead`: a building whose sale has started is
       already gone as far as this order is concerned, and walking the rest of the way to it can
       only end in _rtsCapture refusing. Dropping the order here is what keeps the engineer -
       it is free to be sent somewhere else rather than spent on a structure that removes
       itself. Reachable by playing normally: the AI sells while your engineer is en route. */
    if (e.order === 'capture' && (!cb || cb.dead || cb.selling || cb.type !== 'struct'
        || cb.side === e.side || !rtsCapturable(cb.def))) {
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

  /* ---- unloading ----
     A transport under an unload order sails/drives to where it was sent and puts its cargo
     down on arrival. Ahead of the engage block because an unarmed hull must never be pulled
     into "acquire something to shoot", and ahead of boarding because a transport is not a
     passenger. */
  if (e.order === 'unload') {
    if (!_rtsCargoCount(e)) { e.order = null; e.path = null; }
    else if (e.path && e.pi < e.path.length) { _rtsSteer(e, dt, d); return; }
    else {
      var put = _rtsUnload(e);
      /* Nothing got out: the hull is somewhere with no ground its cargo can stand on. Say so
         rather than leave the player watching a boat that has apparently ignored the order -
         which is the whole reason _rtsUnload returns a count. */
      if (!put && e.side === 'player') _rtsSay('Nowhere to unload — bring it closer to shore.');
      e.order = null; e.path = null;
      return;
    }
  }

  /* ---- boarding ---- */
  if (e.order === 'board') {
    var tr = e.target;
    /* A LANDING CRAFT IS BOARDED FROM THE BEACH, so the reach has to be more than the tile and
       a half that suits walking into an APC. The passenger cannot enter the water at all: its
       path ends at whatever land cell _rtsPath found nearest the hull, and how far that is from
       the hull is a property of the coastline, not of the order. Three tiles is what covers a
       craft nosed against a beach without letting a squad teleport aboard from inland. */
    var breach = ((rtsUnitDef(tr && tr.def || '') || {}).sea) ? RTS_TILE * 3.0 : RTS_TILE * 1.6;
    if (!tr || tr.dead || !_rtsCanBoard(e, tr)) { e.order = null; e.target = null; e.path = null; }
    else if (_rtsRangeTo(e, tr) <= breach) { _rtsBoard(e, tr); return; }
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
  /* A FRIENDLY IN e.target IS NOT SOMETHING TO SHOOT AT. The board order puts one there - it
     has to, the passenger is walking towards a particular transport - and everything below
     treats e.target as the thing to engage. Measured, seed 7, one rifle squad ordered onto its
     own APC from ten tiles out: two rounds into its own hull on the walk in, 350 -> 347.9 hp.
     Trivial with a rifle and an APC; a Battle Tank boarding an unarmed 400 hp landing craft is
     the same code with a cannon. Cleared LOCALLY, so the order keeps its target and only the
     gun forgets about it. */
  if (tgt && tgt.side === e.side) tgt = null;
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
    /* ANYTHING LOOKS AS FAR AS IT SHOOTS. This started as a special case for the two siege
       hulls, whose guns reach 34 against sight 16 - they had to walk into everything else's
       range before they could fire, which is why they were worthless. Sweeping the roster
       afterwards showed they were only the worst of a set, not a pair of oddities:

         cruiser  sees 28, shoots 38      destroyer  sees 24, shoots 30
         missilesub  26 / 34              gunboat    20 / 24
         sub         18 / 22              heavy and rocket, 18 / 20

       Every one of those closes to less than its own reach before it may fire, and for the
       Cruiser that is a quarter of the range it is sold on. There is no spotting model here to
       justify the shortfall - the `hold` branch six lines up has always acquired at _rtsReach,
       so the codebase already asserted this rule in one path and simply disagreed with itself in
       the other. The max keeps the scouts honest the other way round: a Buggy sees 22 and shoots
       16, and it should still notice something at 22 and go after it.

       `standoff` therefore no longer means "sees further". It means only "gives ground", which
       is the behaviour it actually names. */
    tgt = _rtsFindTarget(e, Math.max(d.sight, _rtsReach(e)));
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
      /* SHOOT AND SCOOT. NoMovingFire stops a hull so it can fire, and _rtsStandoff walks it
         backwards - left alone the two fight each other every tick and the stop always wins,
         so a standoff unit would acquire at its full reach (good) and then never actually give
         any ground (useless). Measured with only the acquisition half working: 5 Artillery
         still lost 0 of 5 to 3 Battle Tanks, having taken them to 30% instead of 57%.
         The reload is what settles it. A loaded gun is worth more than a few yards, so the hull
         plants itself and fires; the moment the shot is away it has 3.4 seconds with nothing to
         do but reposition, and that is when it backs off. */
      if (d.noMovingFire && inRange && e.path && !(d.standoff && e.cool > 0)) { e.path = null; e.goal = null; }
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
      /* ...and then a standoff hull may put a path BACK, to give ground. It fires while it
         does: the shot above has already been taken this tick. */
      if (d.standoff) _rtsStandoff(e, dt);
      /* `!e.path` keeps the original behaviour exactly for everything else - the line above
         has just cleared it - while letting a hull that decided to back off fall through to
         the steering at the bottom instead of standing still with a path it never walks. */
      if (e.order === 'attack' && !e.path) return;   /* in range: hold and keep firing */
    } else if (chasing && e.order === 'attack') {
      /* close on the ordered target; repath now and then rather than every frame */
      e.rep = (e.rep || 0) - dt;
      if (!e.path || e.rep <= 0) { e.goal = { x:tgt.x, z:tgt.z }; e.path = _rtsPathFor(e, tgt.x, tgt.z); e.pi = 0; e.rep = 0.9; }
    }
  } else { e.turret = e.rot; }

  if (e.path) { _rtsSteer(e, dt, d); if (!e.path && (e.order === 'move' || e.order === 'amove')) e.order = null; }
}
/* GIVE GROUND RATHER THAN TRADE - the movement half of RTS_STANDOFF_KEEP, and see that constant
   for why it exists at all. Reached only from the in-range branch above, so it can never delay an
   approach: by the time this runs the hull has already taken its shot this tick and is standing
   at a distance it is happy with, or too close to one.

   THE THREAT IS THE NEAREST ARMED ENEMY *UNIT*, and both of those words are load-bearing. A
   building cannot follow, so backing away from the Pillbox a team was sent to demolish would be
   the siege piece refusing its own order - the one thing it is unambiguously for. And an unarmed
   vehicle is not a reason to give ground: a harvester wandering past must not be able to walk an
   artillery battery off its firing position.

   Re-planned on a timer rather than every frame, one short hop at a time, because this competes
   with the steering: a fresh full-length path every tick is how the harvester thrash bug worked. */
function _rtsStandoff(e, dt) {
  /* A LOADED GUN OUTRANKS A FEW YARDS - see the shoot-and-scoot note by NoMovingFire. Backing
     off is what a siege piece does with its reload, not instead of its shot. */
  if (e.cool <= 0) return;
  e.soT = (e.soT || 0) - dt;
  if (e.soT > 0) return;
  var G = window._rtsG, keep = _rtsReach(e) * RTS_STANDOFF_KEEP;
  var near = null, nd = keep;
  for (var i = 0; i < G.ents.length; i++) {
    var o = G.ents[i];
    if (o.dead || o.type !== 'unit' || o.side === e.side || o.inside) continue;
    var od = rtsUnitDef(o.def);
    if (!od || !od.weapon) continue;
    var dd = Math.hypot(o.x - e.x, o.z - e.z);
    if (dd < nd) { nd = dd; near = o; }
  }
  if (!near) return;                                  /* nothing inside the keep distance */
  e.soT = RTS_STANDOFF_RATE;
  var a = Math.atan2(e.z - near.z, e.x - near.x);
  var step = Math.min(RTS_STANDOFF_STEP, keep - nd);
  var gx = e.x + Math.cos(a) * step, gz = e.z + Math.sin(a) * step;
  var tx = _rtsTX(gx), tz = _rtsTX(gz);
  /* CORNERED MEANS STAND AND FIGHT. Failing to find open ground behind must leave the hull
     firing where it is, not stop it dead with a path it cannot walk. */
  if (!_rtsInB(tx, tz) || _rtsBlocked(tx, tz)) return;
  e.path = [{ x:gx, z:gz }]; e.pi = 0; e.goal = { x:gx, z:gz };
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
    /* A PASSENGER IS NOT UNDER YOUR TRACKS. Cargo is kept at its transport's coordinates, so
       without this a tank driving past an APC crushes the squad sealed inside it - the men are
       standing exactly where the APC is. Found by a landing craft losing its passenger in open
       water with nothing near it but the opponent's armour on the far bank. */
    if (o.inside) continue;
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
    /* and not a passenger: cargo rides at its transport's coordinates, so without this a shell
       aimed past an APC stops on a man sealed inside it. Third of the three places that walked
       G.ents comparing positions and forgot - see the header of core/transport.js. */
    if (o.inside) continue;
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

