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
    have[e.def] = (have[e.def] || 0) + 1;
    /* `have` counts everything this side owns - a captured Refinery is a Refinery and the plan
       must not queue a replacement for it. `own` is a different question: how big is MY BASE,
       and it is the number every ratio in the plan is multiplied by.

       A captured building must not count towards that, and until one could exist the two were
       the same number so nothing said so. Capturing moves a building from `theirs` to `own`,
       which swings `size` by two and lifts the target for every key in the order at once - so
       the walk keeps finding an early entry short and never reaches the tail. Measured on the
       base-defence seed: after the opponent took a Command Yard, its plan never asked for a
       Tesla Coil again, not late but never, still unwanted at 600 seconds. An outpost inside
       the enemy's base does not mean this house needs another power plant at home. */
    if (_rtsInBase(e.side, e.x, e.z)) own++;
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
      /* TWO ENTRIES ARE BOUGHT FOR A REASON OR NOT AT ALL, and they are the only ones in any
         mix that are asked a question before being offered. Both are unarmed and worth nothing
         on their own: a hull is worth something only when there is a crossing to make, and an
         engineer only when there is a building worth taking. Each is gated on the same test
         that decides whether its team may be raised - so the purchase and the plan can never
         disagree - and capped at the one that team needs. Every other entry in every mix is
         worth something the moment it exists, which is why it is simply rolled for. */
      if (list[i].key === 'engineer') {
        if (!_rtsAIWorthCapturing()) continue;
        if (_rtsAIEngineers() >= RTS_AI.engCap) continue;
        /* AND OUT OF GENUINE SURPLUS ONLY - never out of the building fund. _rtsAIUnits is
           called with the bank already above _rtsAISpare, which is whatever the base plan is
           currently saving for; every other unit spends that surplus, which is the point. An
           engineer is different because it buys no army and no building, so paying for one out
           of the margin delays the plan by a whole structure.

           Measured: the Soviet opponent stopped reaching the Tesla Coil inside the 420 seconds
           e2e/basedef watches - the credits that would have become its signature defence went
           into an engineer instead. Asking for the spare PLUS the price means the plan's money
           is never touched, and it is the same _rtsAISpare the caller tested, so the two can
           not drift apart. */
        if (rtsMoney(S) < _rtsAISpare(S) + _rtsCostOf('enemy', rtsUnitDef('engineer'))) continue;
      }
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
      /* only if losing one would not brown the base out - and a plant AT HOME, because
         _rtsHas answers in entity-creation order and the player's opening Power Plant is one
         of the two earliest structures on the map. Capturing it is what pushes the surplus
         past powerWaste and fires this strategy in the first place, so with a plain _rtsHas
         the opponent sold the very plant it had just spent an engineer taking, seconds later,
         for half of what the PLAYER paid. See _rtsHasHome. */
      var p = _rtsHasHome('enemy', 'power');
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
/* AI_Attack - see _rtsAIAttack in core/missions.js. This line used to read "only a share of the
   idle army goes; the rest garrisons", which described that function BEFORE teams landed. It now
   raises a team and returns, and sends nobody directly.

   The stale sentence is worth replacing rather than deleting, because what it hid is load-bearing:
   a team and the ENDGAME hunt above are the ONLY two routes out of the base, so a unit no team
   composition lists never attacks the player at all. Measured, hard, both armies, a player that
   fights back: 49 Light Tanks, Artillery and V2s bought across eight matches, none of which ever
   came within 45 of the player's yard or fired a single shot at anything the player owned; on one
   seed, 17 vehicles built and 17 never given an order in 250 seconds. See unit/aiplan, which
   reports that list and explains why it is not worth fixing. */

/* ------------------------------------------------------------- teams (TEAM.CPP) --
   A team is a composition plus a mission. It recruits until it is at full strength, only
   then moves out, and picks its target by CATEGORY rather than by proximity. Replacing the
   old attack wave - which shoved 60-70% of every idle unit at the player's nearest building
   - with this is what stops the opponent fighting as one undifferentiated blob. */

