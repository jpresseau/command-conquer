/* core/ai.js - the opponent: what it builds, when it expands and when it attacks.
   Part of rts.core, the simulation. */

/* ------------------------------------------------------------ enemy AI --
   The build order comes from RULES.CPP's [AI] section, and the important idea there is that
   the AI does not follow a script - it holds a target base COMPOSITION. Each structure type
   wants `ratio` of the base size capped at `limit`, and the AI builds whatever it is
   furthest short of. Base size tracks the human's building count plus BaseSizeAdd, so the
   opponent grows in response to how you are actually playing. */
function _rtsAIWants(S) {
  var G = window._rtsG, have = {}, i, e, theirs = 0, own = 0;
  for (i = 0; i < G.ents.length; i++) {
    e = G.ents[i];
    if (e.type !== 'struct' || e.dead || e.selling) continue;
    if (e.side === 'player') { theirs++; continue; }
    have[e.def] = (have[e.def] || 0) + 1; own++;
  }
  /* count what is already on the way, or the AI queues four refineries in a row */
  if (S.q.struct) have[S.q.struct.key] = (have[S.q.struct.key] || 0) + 1;
  if (S.ready) have[S.ready] = (have[S.ready] || 0) + 1;

  /* PowerSurplus: keep spare capacity in hand rather than building power only once the
     lights are already out. Below PowerEmergency it is the only thing worth building. */
  var slack = S.powerMade - S.powerUsed;
  if (slack < RTS_AI.powerSurplus) return { key:'power', urgent:slack < 0 ||
    S.powerMade < S.powerUsed * RTS_AI.powerEmergency };

  /* A house whose store is nearly full is throwing away income right now, and no ratio in the
     base plan is worth more than that. This has to come BEFORE the ordered walk or the storage
     cap is a pure nerf: the opponent would lose the credits and never buy the fix, because a
     silo sits behind the whole defence tier in the build order. Gated on the silo actually
     being buildable so an AI with no refinery does not sit here demanding one. */
  var cap = rtsCapacity('enemy');
  if (cap > 0 && S.ore >= cap * RTS_AI.siloUrgent && (have.silo || 0) < RTS_AI.limit.silo
      && _rtsCanProduce('enemy', 'silo')) return { key:'silo', urgent:true };

  /* Below IQProduction the opponent keeps a minimal base and never expands. That used to be
     one flag between "two buildings" and "all twenty-three", and since the difficulties are
     IQ 2 / 3 / 5 it meant Soldier and Recruit built the same seven things as each other for
     the whole match. The rung is per building now - see RTS_AI.buildIQ. */
  var order = _rtsIQAt(RTS_IQ.production) ? RTS_AI.buildOrder
            : (_rtsIQAt(RTS_IQ.expandBase) ? RTS_AI.buildOrder.filter(function (k) {
                 return _rtsIQAt(RTS_AI.buildIQ[k] || RTS_AI.buildIQDefault);
               }) : []);
  var size = Math.max(own, theirs + RTS_AI.baseSizeAdd);
  var mySide = rtsHouseSide('enemy');
  for (i = 0; i < order.length; i++) {
    var k = order[i];
    /* Skip the other army's buildings. Without this the plan STOPS DEAD on the first one it
       cannot build: the list is walked in order and returns the first shortfall, so a Soviet
       house asking for four Pillboxes - an Allied building - demands them forever and never
       reaches anything after them. That silently killed the entire defensive tail (flame
       towers, gun turrets, rocket turrets, Tesla coils) the moment factions were added, and
       nothing reported it because wanting a building is not an error. */
    var kd = rtsStructDef(k);
    if (kd && !rtsBuildableBy(kd, mySide)) continue;
    /* A SHIPYARD IT CANNOT PLACE MUST NOT BE WANTED. This walk returns the first shortfall,
       so a building that can never be placed is demanded forever and everything after it in
       the order - the whole defensive tail, the superweapons - is never reached. That exact
       failure already happened once here with the other army's buildings, which is what the
       comment above is about. A shore structure is the same trap by a different route: not
       every map has a coast the base can reach, and on one that does not, wanting a Naval
       Yard would silently stop the opponent building anything else for the rest of the
       match. The `ready` slot has a readyTry bail-out, but that only limits the damage after
       the money has been spent - this stops it being wanted at all. */
    if (kd && kd.shore && !_rtsAIShoreSpot(k)) continue;
    var want = Math.min(RTS_AI.limit[k], Math.ceil(size * RTS_AI.ratio[k]));
    if ((have[k] || 0) < want) return { key:k, urgent:false };
  }
  return null;
}
/* HOUSE.CPP Recalc_Center: the base centre is a COST-WEIGHTED average of building positions
   ("give more weight to buildings that cost more"), and the radius is the mean distance from
   it. Zones follow: CORE inside the radius, then NORTH/EAST/SOUTH/WEST by direction. */
function _rtsBaseCentre(side) {
  var G = window._rtsG, x = 0, z = 0, n = 0, i, e;
  for (i = 0; i < G.ents.length; i++) {
    e = G.ents[i];
    if (e.dead || e.type !== 'struct' || e.side !== side || e.selling) continue;
    var w = ((rtsStructDef(e.def).cost / 1000) | 0) + 1;
    for (var k = 0; k < w; k++) { x += e.x; z += e.z; n++; }
  }
  if (!n) return null;
  var c = { x:x / n, z:z / n, r:0 }, rad = 0, cnt = 0;
  for (i = 0; i < G.ents.length; i++) {
    e = G.ents[i];
    if (e.dead || e.type !== 'struct' || e.side !== side || e.selling) continue;
    rad += Math.hypot(e.x - c.x, e.z - c.z); cnt++;
  }
  c.r = Math.max(cnt ? rad / cnt : 0, RTS_TILE * 2);
  return c;
}
/* Which_Zone: 0 core, 1 north, 2 east, 3 south, 4 west, -1 too far to be part of the base. */
function _rtsWhichZone(c, x, z) {
  if (!c) return -1;
  var d = Math.hypot(x - c.x, z - c.z);
  if (d <= c.r) return 0;
  if (d > c.r * 4) return -1;
  var a = Math.atan2(z - c.z, x - c.x);
  if (a >= -Math.PI * 0.75 && a < -Math.PI * 0.25) return 1;   /* north (-z) */
  if (a >= -Math.PI * 0.25 && a < Math.PI * 0.25) return 2;    /* east */
  if (a >= Math.PI * 0.25 && a < Math.PI * 0.75) return 3;     /* south */
  return 4;                                                    /* west */
}
/* Find_Build_Location: rate each zone by how far its defence sits BELOW the base average,
   and aim the new defensive building at the weakest one. Putting every turret on the side
   facing the enemy is exactly the mistake this routine exists to avoid - it leaves the other
   three approaches open. */
function _rtsAIWeakZone() {
  var G = window._rtsG, c = _rtsBaseCentre('enemy');
  if (!c) return null;
  var def = [0, 0, 0, 0, 0], i;
  for (i = 0; i < G.ents.length; i++) {
    var e = G.ents[i];
    if (e.dead || e.type !== 'struct' || e.side !== 'enemy' || e.selling) continue;
    var sd = rtsStructDef(e.def);
    if (!sd.weapon) continue;
    var z = _rtsWhichZone(c, e.x, e.z);
    if (z >= 0) def[z]++;
  }
  /* the core counts for half, as in the original's `if (z == ZONE_CORE) diff /= 2` */
  var best = 1, bestv = 1e9;
  for (i = 1; i <= 4; i++) if (def[i] < bestv) { bestv = def[i]; best = i; }
  var ang = [0, -Math.PI / 2, 0, Math.PI / 2, Math.PI][best];
  return { x:c.x + Math.cos(ang) * c.r * 2, z:c.z + Math.sin(ang) * c.r * 2 };
}
/* Where to put it: a refinery hugs the nearest ore, a turret covers the base's weakest
   approach, everything else clusters. Dropping a refinery on the far side of the base from
   the ore is the single most common way a build-order AI wastes its money. */
function _rtsAIPlace(key) {
  var G = window._rtsG, i, e, aim = null;
  /* Next_Buildable first. If the plan has a fillable hole of this type, the building goes back
     into it - that is the whole point of the node list, and it comes before any of the aiming
     below because the plan already decided where this one belongs. */
  var node = _rtsNextBuildable('enemy', key);
  if (node) { _rtsPlaceStruct('enemy', key, node.tx, node.tz, false, G.sides.enemy.readyPaid); return true; }
  if (key === 'refinery') aim = _rtsAIOreSpot();
  /* ANYTHING THAT SHOOTS, not the one building called 'turret'. The zone routine above already
     defines a defence as `sd.weapon` when it COUNTS what is where - it was only this call site
     that named a key, and `turret` is Allied-only, so the entire Which_Zone port ran for one
     army and never for the other.

     Measured before the fix, hard, three seeds, 420s: the Allied house spread its defences over
     4 of 4 compass zones on every seed; the Soviet house managed 1, 3 and 2 - on seed 9001 all
     seven of its defences sat on ONE side of the base. Six structures carry a weapon and all
     six want aiming. */
  else if ((rtsStructDef(key) || {}).weapon) aim = _rtsAIWeakZone();
  else if ((rtsStructDef(key) || {}).shore) {
    /* A shipyard has exactly one place it can go, and the search below only accepts cells
       _rtsCanPlace agrees with - which already applies the shore rule. Aiming at the spot
       found by the gate above just means the best one wins rather than the first. */
    var _sh = _rtsAIShoreSpot(key);
    if (_sh) aim = { x:_rtsWX(_sh[0]), z:_rtsWX(_sh[1]) };
  }
  var anchors = [];
  for (i = 0; i < G.ents.length; i++) {
    e = G.ents[i];
    if (e.type === 'struct' && e.side === 'enemy' && !e.dead && !e.selling) anchors.push(e);
  }
  if (!anchors.length) return false;
  if (aim) anchors.sort(function (a, b) {
    return Math.hypot(a.x - aim.x, a.z - aim.z) - Math.hypot(b.x - aim.x, b.z - aim.z);
  });
  /* Try every anchor, best-first. Searching only the nearest one looks fine until that
     corner of the base fills up - then placement fails forever, the finished building never
     leaves the "ready" slot, and the AI's whole structure queue is jammed for the rest of
     the match while its credits pile up. */
  var R = RTS_BUILD_RADIUS;
  for (var a = 0; a < anchors.length; a++) {
    var anchor = anchors[a], best = null, bs = 1e9;
    for (var tx = anchor.tx - R; tx <= anchor.tx + R; tx++) {
      for (var tz = anchor.tz - R; tz <= anchor.tz + R; tz++) {
        if (!_rtsCanPlace('enemy', key, tx, tz)) continue;
        var wx = _rtsWX(tx), wz = _rtsWX(tz);
        var s = aim ? Math.hypot(wx - aim.x, wz - aim.z) : Math.hypot(wx - anchor.x, wz - anchor.z);
        if (s < bs) { bs = s; best = [tx, tz]; }
      }
    }
    /* Anything placed outside the plan becomes part of it (in _rtsPlaceStruct), so the next
       raid is repaired against the base as it actually stands, not just the opening layout. */
    if (best) { _rtsPlaceStruct('enemy', key, best[0], best[1], false, G.sides.enemy.readyPaid); return true; }
  }
  return false;
}
/* Somewhere the opponent could actually put a shipyard: a cell inside the build radius of
   one of its buildings that _rtsCanPlace accepts, which is where the `shore` rule is applied.
   Returns null on a map whose coast the base cannot reach - and null is the whole point, see
   the caller in _rtsAIWants. */
function _rtsAIShoreSpot(key) {
  var G = window._rtsG, R = RTS_BUILD_RADIUS, best = null, bs = 1e9, i;
  var anchors = [];
  for (i = 0; i < G.ents.length; i++) {
    var e = G.ents[i];
    if (e.type === 'struct' && e.side === 'enemy' && !e.dead && !e.selling) anchors.push(e);
  }
  for (var a = 0; a < anchors.length; a++) {
    var an = anchors[a];
    for (var tx = an.tx - R; tx <= an.tx + R; tx++) {
      for (var tz = an.tz - R; tz <= an.tz + R; tz++) {
        if (!_rtsCanPlace('enemy', key, tx, tz)) continue;
        /* Prefer a berth near the middle of the base rather than the first cell scanned:
           a yard tucked behind the furthest outbuilding is one the defences do not cover. */
        var s = Math.hypot(_rtsWX(tx) - an.x, _rtsWX(tz) - an.z);
        if (s < bs) { bs = s; best = [tx, tz]; }
      }
    }
  }
  return best;
}
/* The richest ore nearest to ANY of the AI's buildings - not to its yard. As the base creeps
   outward the frontier is what matters; measuring from the yard sent late refineries back
   toward a field that had already been mined out. */
function _rtsAIOreSpot() {
  var G = window._rtsG, structs = [], i, e;
  for (i = 0; i < G.ents.length; i++) {
    e = G.ents[i];
    if (e.type === 'struct' && e.side === 'enemy' && !e.dead && !e.selling) structs.push(e);
  }
  if (!structs.length) return null;
  var best = null, bd = 1e9;
  for (var tx = 0; tx < RTS_N; tx += 2) for (var tz = 0; tz < RTS_N; tz += 2) {
    if (G.scrap[_rtsIdx(tx, tz)] < RTS_SCRAP_TILE * 0.4) continue;
    var wx = _rtsWX(tx), wz = _rtsWX(tz), d = 1e9;
    for (i = 0; i < structs.length; i++) d = Math.min(d, Math.hypot(wx - structs[i].x, wz - structs[i].z));
    if (d < bd) { bd = d; best = { x:wx, z:wz }; }
  }
  return best;
}
/* Keep the production lines fed. Economy first, and crucially the AI SAVES for a harvester
   instead of dribbling its income away on cheap infantry - without that it parks at ~90
   credits forever, never affords the 1200 harvester, and its army stops growing two minutes
   in. InfantryReserve is the "we are rich" line: above it the AI restarts a line the instant
   it frees up, below it it only decides on its slow tick, so a poor opponent trickles and a
   rich one runs its factories flat out. */
function _rtsAIUnits(S) {
  var G = window._rtsG, harv = 0, i;
  for (i = 0; i < G.ents.length; i++) {
    var e = G.ents[i];
    if (e.dead || e.side !== 'enemy' || e.type !== 'unit') continue;
    if (rtsUnitDef(e.def).harvest) harv++;
  }
  var wantHarv = _rtsIQAt(RTS_IQ.harvester) ? 3 : 1;
  if (harv < wantHarv) {
    if (_rtsCanQueue('enemy', 'harvester')) { _rtsQueue('enemy', 'harvester'); return; }
  }
  /* One pass per production line: gather everything affordable and buildable, then pick among
     them by weight. RTS_AI.mix holds the ladder so that adding a unit to RTS_UNITS does not
     mean editing this function.

     The weighting is load-bearing, not decoration. Walking the list best-first and taking the
     first hit is degenerate - whatever sits at the top is the only thing ever built. Measured
     over three seeds at eight minutes that gave 461 grenadiers and 14 rocket soldiers: the
     opponent had silently stopped fielding anti-armour infantry. */
  for (var cat in RTS_AI.mix) {
    /* AS MANY AIRCRAFT AS THERE ARE PLACES TO PUT THEM. Measured over a 900-second match on
       hard: the opponent reached an Airfield at 257s and finished with THIRTY-FOUR aircraft,
       almost all Yaks, because it was rich, aircraft are their own production line, and nothing
       said stop. RA's own rule is one aircraft per pad - an airfield holds one - and applying
       it here is both faithful and the reason the swarm cannot happen. Two pads, two planes.

       Deliberately on the AI's PURCHASE only. Capping what the player may own is a bigger
       change to the Helipad that has stood since the Attack Heli shipped, and it is not what
       an opponent building thirty-four Yaks is asking for. */
    if (cat === 'air') {
      var pads = 0, air = 0;
      for (i = 0; i < G.ents.length; i++) {
        var pe = G.ents[i];
        if (pe.dead || pe.side !== 'enemy') continue;
        if (pe.type === 'struct' && !pe.building && !pe.selling &&
            (rtsStructDef(pe.def) || {}).produces === 'air') pads++;
        else if (pe.type === 'unit' && (rtsUnitDef(pe.def) || {}).kind === 'air') air++;
      }
      if (air >= pads) continue;
    }
    /* AS MANY HULLS AS THERE ARE YARDS TO BUILD THEM, times a small factor. Ships are their
       own production line and the opponent is rich late, so without a cap this is the
       thirty-four-Yak problem again in a domain the player may not even be contesting. A
       shipyard is not consumed by a hull the way a pad is by an aircraft, so the cap is a
       multiple rather than one-for-one. */
    if (cat === 'ship') {
      var yards = 0, hulls = 0;
      for (i = 0; i < G.ents.length; i++) {
        var se = G.ents[i];
        if (se.dead || se.side !== 'enemy') continue;
        if (se.type === 'struct' && !se.building && !se.selling &&
            (rtsStructDef(se.def) || {}).produces === 'ship') yards++;
        else if (se.type === 'unit' && (rtsUnitDef(se.def) || {}).sea) hulls++;
      }
      if (!yards || hulls >= yards * RTS_AI.fleetPerYard) continue;
    }
    var list = RTS_AI.mix[cat], pool = [], total = 0;
    for (i = 0; i < list.length; i++) {
      if (rtsMoney(S) <= list[i].at) continue;
      if (!_rtsCanQueue('enemy', list[i].key)) continue;
      /* THE TRANSPORT IS BOUGHT FOR A REASON OR NOT AT ALL, and it is the only entry in any mix
         that asks a question before it is offered. An unarmed hull is worth nothing by itself;
         it is worth something only when there is a crossing to make and a landing party to make
         it. So it is gated on the same test that decides whether that team may be raised, and
         capped at the one the team needs. Without the gate this is the engineer in the vehicle
         mix - credits donated to whatever shoots first. */
      if (list[i].key === 'lst') {
        if (!_rtsAIWorthCrossing()) continue;
        var craft = 0;
        for (var ci = 0; ci < G.ents.length; ci++) {
          var ce = G.ents[ci];
          if (!ce.dead && ce.side === 'enemy' && ce.def === 'lst') craft++;
        }
        if (craft >= RTS_AI.craftCap) continue;
      }
      pool.push(list[i]); total += list[i].w;
    }
    if (!pool.length) continue;
    var roll = _rtsRnd() * total;
    for (i = 0; i < pool.length; i++) {
      roll -= pool[i].w;
      if (roll <= 0 || i === pool.length - 1) { _rtsQueue('enemy', pool[i].key); break; }
    }
  }
}
/* HOUSE.CPP's house state machine. The urgency checks all read it, which is how one flag
   ("we were attacked in the last minute") changes several unrelated decisions at once. */
/* The one AI rule the MCV needs. It is deliberately narrow: an opponent with no Command Yard
   can build nothing at all, so an MCV sitting in its column is the difference between a
   comeback and a corpse. It is not on the AI's shopping list - buying a 2500-credit vehicle it
   has no use for while it still owns a yard would be a straight waste - so this only ever
   fires on one it was given, by a crate or by a scenario. */
function _rtsAIDeploy(side) {
  var G = window._rtsG;
  if (_rtsHas(side, 'yard')) return false;
  for (var i = 0; i < G.ents.length; i++) {
    var e = G.ents[i];
    if (e.dead || e.side !== side || e.type !== 'unit') continue;
    if (!(rtsUnitDef(e.def) || {}).deploy) continue;
    if (_rtsDeploy(e)) return true;
  }
  return false;
}
function _rtsAIStateTick(S) {
  var G = window._rtsG;
  if (G.ai.state === RTS_STATE.ENDGAME) return;
  /* `G.ai.lastHit || -999` is wrong: at game start the timestamp IS 0, which is falsy, so
     the fallback fires and a base attacked on the first second never enters ATTACKED. */
  var last = (G.ai.lastHit == null) ? -999 : G.ai.lastHit;
  if (G.t - last < 60) { G.ai.state = RTS_STATE.ATTACKED; return; }
  G.ai.state = rtsMoney(S) < 25 ? RTS_STATE.BROKE : RTS_STATE.BUILDUP;
}
function _rtsAICanEarn() {
  return !!(_rtsHas('enemy', 'refinery') && _rtsAIHarvesters());
}
function _rtsAIHarvesters() {
  var G = window._rtsG, n = 0;
  for (var i = 0; i < G.ents.length; i++) {
    var e = G.ents[i];
    if (!e.dead && e.side === 'enemy' && e.type === 'unit' && rtsUnitDef(e.def).harvest) n++;
  }
  return n;
}
/* Does this house still own anything that can PRODUCE? Check_Fire_Sale's question. */
function _rtsAIHasFactory() {
  return !!(_rtsHas('enemy', 'yard') || _rtsHas('enemy', 'barracks') || _rtsHas('enemy', 'factory'));
}
/* Score every strategy. NONE means "not worth doing at all right now". */
function _rtsAIUrgency(S) {
  var G = window._rtsG, U = RTS_URGENCY, u = {};
  var pf = _rtsPowerFactor('enemy'), slack = S.powerMade - S.powerUsed;
  var attacked = G.ai.state === RTS_STATE.ATTACKED;

  /* Check_Build_Power */
  u.power = U.NONE;
  if (slack < RTS_AI.powerSurplus && _rtsAICanEarn()) {
    u.power = U.LOW;
    if (pf < RTS_AI.powerEmergency) u.power = U.MEDIUM;
    if (attacked) u.power = U.HIGH;          /* browned-out defences during a raid */
  }
  /* Check_Raise_Power: a deficit big enough that selling something is the fastest fix. */
  u.raisePower = U.NONE;
  if (pf < RTS_AI.powerEmergency && slack < -RTS_AI.powerEmergencyGap) {
    u.raisePower = attacked ? U.HIGH : U.MEDIUM;
  }
  /* Check_Lower_Power: surplus power is dead money. */
  u.lowerPower = (slack > RTS_AI.powerWaste) ? U.LOW : U.NONE;

  /* Check_Raise_Money */
  /* THE LADDER HAS TO REACH ITS OWN TOP RUNG. This stopped at MEDIUM - NONE, then LOW when
     broke, then one increment when desperate and unable to earn - while RTS_AI.sellForMoney
     lists `power` at 3 and `refinery` at 4. Those two entries could never fire, so a house with
     no income and no credits sold its turrets and its factory and then simply stood there.
     A house that cannot earn AND has no production line left is not going to recover: that is
     the emergency the last rungs were written for. */
  u.raiseMoney = U.NONE;
  if (rtsMoney(S) < RTS_AI.brokeMoney) u.raiseMoney = U.LOW;
  if (rtsMoney(S) < RTS_AI.desperateMoney && !_rtsAICanEarn()) {
    u.raiseMoney = U.MEDIUM;
    if (!_rtsAIHasFactory()) u.raiseMoney = U.HIGH;
    if (!_rtsHas('enemy', 'yard')) u.raiseMoney = U.CRITICAL;
  }

  /* Check_Fire_Sale: nothing left that can build. The game is over; go out swinging. */
  u.fireSale = U.NONE;
  if (!attacked && _rtsCount('enemy', 'struct') > 0 && !_rtsAIHasFactory()) u.fireSale = U.CRITICAL;

  /* Check_Attack */
  u.attack = U.NONE;
  if (G.t > 60 && G.ai.next <= 0) u.attack = attacked ? U.LOW : U.CRITICAL;

  /* Building the base out. These are the composition ratios, expressed as urgency. */
  var want = _rtsAIWants(S);
  u.build = U.NONE;
  if (want) u.build = want.key === 'refinery' && !_rtsHas('enemy', 'refinery') ? U.HIGH
    : (want.urgent ? U.HIGH : U.MEDIUM);
  G.ai.want = want;
  return u;
}
function _rtsCount(side, type) {
  var G = window._rtsG, n = 0;
  for (var i = 0; i < G.ents.length; i++) {
    var e = G.ents[i];
    if (!e.dead && e.side === side && e.type === type && !e.selling) n++;
  }
  return n;
}
/* Sell the first building on the list whose urgency threshold this situation has reached. */
function _rtsAISellFrom(list, urgency) {
  for (var i = 0; i < list.length; i++) {
    if (urgency < list[i][1]) continue;
    var b = _rtsHas('enemy', list[i][0]);
    if (b && _rtsSell(b)) return true;
  }
  return false;
}
function _rtsAIDo(strat, urgency, S) {
  var G = window._rtsG;
  switch (strat) {
    case 'build':
      if (!G.ai.want || S.q.struct || S.ready) return false;
      var sd = rtsStructDef(G.ai.want.key);
      var reserve = (urgency >= RTS_URGENCY.HIGH) ? 0 : RTS_AI.creditReserve;
      if (rtsMoney(S) < _rtsCostOf('enemy', sd) + reserve) return false;
      return _rtsQueue('enemy', G.ai.want.key);

    case 'raiseMoney':
      if (!_rtsIQAt(RTS_IQ.sellBack)) return false;
      return _rtsAISellFrom(RTS_AI.sellForMoney, urgency);

    case 'raisePower':
      if (!_rtsIQAt(RTS_IQ.sellBack)) return false;
      return _rtsAISellFrom(RTS_AI.sellForPower, urgency);

    case 'lowerPower':
      if (!_rtsIQAt(RTS_IQ.sellBack)) return false;
      /* only if losing one would not brown the base out */
      var p = _rtsHas('enemy', 'power');
      if (!p || S.powerMade - rtsStructDef('power').power < S.powerUsed) return false;
      return _rtsSell(p);

    case 'fireSale':
      /* Fire_Sale + Do_All_To_Hunt: sell the lot and throw everything at the player. */
      G.ai.state = RTS_STATE.ENDGAME;
      var sold = 0, i, e;
      for (i = 0; i < G.ents.length; i++) {
        e = G.ents[i];
        if (e.dead || e.side !== 'enemy' || e.type !== 'struct' || e.selling) continue;
        if (_rtsSell(e)) sold++;
      }
      _rtsAIAllToHunt();
      return sold > 0;

    case 'attack':
      return _rtsAIAttack(urgency);
  }
  return false;
}
/* Do_All_To_Hunt. */
function _rtsAIAllToHunt() {
  var G = window._rtsG;
  /* Do_All_To_Hunt overrides everything, so the teams are dissolved first - otherwise the
     team logic would keep re-issuing its own orders on top of the hunt. */
  for (var tid in (G.teams || {})) _rtsTeamDisband(G.teams[tid]);
  var aim = _rtsHas('player', 'yard') || _rtsHas('player', 'refinery') || _rtsHas('player', 'power');
  if (!aim) return;
  for (var i = 0; i < G.ents.length; i++) {
    var u = G.ents[i];
    if (u.dead || u.side !== 'enemy' || u.type !== 'unit') continue;
    if (rtsUnitDef(u.def).harvest) continue;
    _rtsOrderMove(u, aim.x + (i % 3 - 1) * 5, aim.z + ((i / 3) | 0 % 3) * 5, true);
  }
}
/* AI_Attack. Only a share of the idle army goes; the rest garrisons. */

/* ------------------------------------------------------------- teams (TEAM.CPP) --
   A team is a composition plus a mission. It recruits until it is at full strength, only
   then moves out, and picks its target by CATEGORY rather than by proximity. Replacing the
   old attack wave - which shoved 60-70% of every idle unit at the player's nearest building
   - with this is what stops the opponent fighting as one undifferentiated blob. */

