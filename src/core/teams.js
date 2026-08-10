/* core/teams.js - TEAM.CPP / TEAMTYPE.CPP: recruiting a team, keeping the opponent's teams
   stocked, and deciding what kind to raise. Part of rts.core, the simulation. The named places
   a team script steers by live next door in core/waypoints.js. */

/* Quarry: the team leader asks Greatest_Threat for the best target of a KIND, so one team
   hunts harvesters while another goes for the power plants. */
function _rtsQuarryMatch(o, quarry) {
  if (quarry === 'anything') return true;
  if (o.type === 'unit') {
    var ud = rtsUnitDef(o.def);
    if (quarry === 'harvester') return !!ud.harvest;
    if (quarry === 'infantry') return ud.kind === 'infantry';
    if (quarry === 'vehicles') return ud.kind === 'vehicle';
    return false;
  }
  var sd = rtsStructDef(o.def);
  if (quarry === 'buildings') return true;
  if (quarry === 'power') return sd.power > 0;
  if (quarry === 'factories') return !!sd.produces;
  if (quarry === 'defense') return !!sd.weapon;
  return false;
}
/* TMission_Attack: the LEADER picks the target, and the leader is the first active member
   that actually has a weapon - "this presumes that some member is better than no member". */
function _rtsTeamLeader(t) {
  var i, m;
  for (i = 0; i < t.members.length; i++) {
    m = t.members[i];
    if (!m.dead && rtsUnitDef(m.def).weapon) return m;
  }
  return t.members[0] || null;
}
/* `quarry` is the ATTACK mission's argument. It defaults to the team type's own quarry so
   that a team with no mission list behaves exactly as it did before the list existed. */
function _rtsTeamTarget(t, quarry, near) {
  var G = window._rtsG, lead = _rtsTeamLeader(t);
  if (!lead) return null;
  if (quarry == null) quarry = t.type.quarry;
  var best = null, bv = 0, w = _rtsPickWeapon(lead, lead);
  for (var i = 0; i < G.ents.length; i++) {
    var o = G.ents[i];
    if (o.dead || o.side !== 'player') continue;
    if (!_rtsQuarryMatch(o, quarry)) continue;
    /* ATT_WAYPT is "clear out what is HERE", so candidates outside the waypoint's radius
       are not merely worth less - they are not candidates at all. */
    if (near && Math.hypot(o.x - near.x, o.z - near.z) > near.r) continue;
    /* Greatest_Threat(THREAT_TIBERIUM) exists precisely to hunt harvesters, so an explicit
       quarry has to override IsNoThreat - otherwise a team raised to kill harvesters scores
       every harvester at zero and can never see one. */
    var v = _rtsEvalObject(lead, o, _rtsRangeTo(lead, o), w, quarry !== 'anything');
    if (v > bv) { bv = v; best = o; }
  }
  /* "If no target could be found, then the mission advances" - so a quarry that no longer
     exists on the map is a reason to move down the list, NOT a reason to fall back onto
     some other target. Only a team with no list at all keeps the old fallback, because for
     that team standing still forever is the only other outcome. */
  if (!best && !near && !t.type.missions && quarry !== 'anything') {
    for (var j = 0; j < G.ents.length; j++) {
      var p = G.ents[j];
      if (p.dead || p.side !== 'player' || p.type !== 'struct') continue;
      var pv = _rtsEvalObject(lead, p, _rtsRangeTo(lead, p), w);
      if (pv > bv) { bv = pv; best = p; }
    }
  }
  return best;
}
/* Calc_Center: the average position of INITIATED members only. A recruit still running to
   join up must not drag the team's centre out to meet it. */
function _rtsTeamCentre(t) {
  var x = 0, z = 0, n = 0, i, m;
  for (i = 0; i < t.members.length; i++) {
    m = t.members[i];
    if (m.dead || !m.init) continue;
    x += m.x; z += m.z; n++;
  }
  if (!n) {
    for (i = 0; i < t.members.length; i++) if (!t.members[i].dead) return { x:t.members[i].x, z:t.members[i].z };
    return null;
  }
  return { x:x / n, z:z / n };
}
/* Can_Add. The mission gate is the one MISSION.CPP's IsRecruitable exists for. */
function _rtsTeamCanAdd(t, u) {
  if (u.dead || u.side !== 'enemy' || u.type !== 'unit') return false;
  if (rtsUnitDef(u.def).harvest) return false;
  if (!_rtsMission(u).recruitable) return false;
  var want = t.type.members[u.def] || 0;
  if (!want) return false;
  if ((t.have[u.def] || 0) >= want) return false;
  /* "Allows member stealing from lesser priority teams." */
  if (u.sqd != null) {
    var other = window._rtsG.teams[u.sqd];
    if (!other || other.type.priority >= t.type.priority) return false;
  }
  return true;
}
/* NOTE: the membership field is `sqd`, not `team`. `e.team` is already taken by the player's
   control groups (the 1-9 keys) and is initialised to -1, so reusing the name made every
   candidate look like it already belonged to a team with id -1 - and nothing could ever be
   recruited, silently, with no error anywhere. */
function _rtsTeamAdd(t, u) {
  var G = window._rtsG;
  if (u.sqd != null && G.teams[u.sqd]) _rtsTeamRemove(G.teams[u.sqd], u);
  t.members.push(u);
  t.have[u.def] = (t.have[u.def] || 0) + 1;
  u.sqd = t.id;
  u.init = (t.members.length === 1);      /* the first member is the team, so it is initiated */
  return true;
}
function _rtsTeamRemove(t, u) {
  var i = t.members.indexOf(u);
  if (i < 0) return false;
  t.members.splice(i, 1);
  t.have[u.def] = Math.max(0, (t.have[u.def] || 1) - 1);
  u.sqd = null; u.init = false;
  /* "A unit that breaks off of a team will enter idle mode." */
  u.order = null; u.target = null; u.path = null; u.goal = null;
  return true;
}
/* Recruit: pick the CLOSEST eligible unit to the team's centre, not just any. */
function _rtsTeamRecruit(t, centre) {
  var G = window._rtsG, best = null, bd = 1e9;
  var cx = centre ? centre.x : 0, cz = centre ? centre.z : 0;
  for (var i = 0; i < G.ents.length; i++) {
    var u = G.ents[i];
    if (!_rtsTeamCanAdd(t, u)) continue;
    var d = centre ? Math.hypot(u.x - cx, u.z - cz) : 0;
    if (d < bd) { bd = d; best = u; }
  }
  if (best) { _rtsTeamAdd(t, best); return true; }
  return false;
}
function _rtsTeamDesired(t) {
  var n = 0;
  for (var k in t.type.members) n += t.type.members[k];
  return n;
}
function _rtsTeamMake(type) {
  var G = window._rtsG;
  var t = { id:G.teamSeq++, type:type, members:[], have:{}, target:null,
    moving:false, hasBeen:false, under:true, zone:null, lagging:false,
    cur:0, guardUntil:0, legT:null };      /* Current: the index into MissionList[] */
  G.teams[t.id] = t;
  return t;
}
function _rtsTeamDisband(t) {
  var G = window._rtsG;
  while (t.members.length) _rtsTeamRemove(t, t.members[0]);
  delete G.teams[t.id];
}
/* The concurrent-team ceiling, derived from the army rather than fixed. See RTS_TEAM_COMMIT.
   Counts only units that could actually fight: harvesters are not an army. */
function _rtsTeamCap() {
  var G = window._rtsG, army = 0;
  for (var i = 0; i < G.ents.length; i++) {
    var e = G.ents[i];
    if (e.dead || e.side !== 'enemy' || e.type !== 'unit') continue;
    if (rtsUnitDef(e.def).harvest) continue;
    army++;
  }
  var want = Math.floor(army * RTS_TEAM_COMMIT / RTS_TEAM_TYPICAL);
  return Math.max(RTS_TEAM_MAX, Math.min(RTS_TEAM_MAX_HARD, want));
}
/* ...and the same scaling applied per type, so the extra slots are shared across the types
   that are currently eligible rather than all going to whichever one the roll happens to
   pick first. The authored `max` stays the floor. */
function _rtsTypeCap(ty, eligible) {
  var cap = _rtsTeamCap();
  /* `only` MAKES max A CEILING INSTEAD OF A FLOOR, and exactly two types need it: the ones built
     around a unit the opponent hard-caps. Snatch needs an engineer and RTS_AI.engCap allows one
     alive; Landing needs a transport and craftCap allows one. Scaling their `max` with the army
     raises a second team that CANNOT be crewed - the only engineer is already in the first one -
     so the second recruits its tank and its rifleman, holds them for the whole of
     RTS_TEAM_FORM_TIMEOUT, and disbands having done nothing.

     Measured over twelve matches, three seeds across both armies at normal and hard: a second
     Snatch was raised in EVERY ONE and two units sat in it every time. Sixty-six of seventy-eight
     teams raised ever marched, and all twelve failures were this.

     The floor is right for everything else - see the note above for why a fixed cap collapses the
     share of the army committed as the opponent gets richer - so this is a flag on the two types
     whose limit comes from somewhere other than the size of the army. */
  if (ty.only) return ty.max == null ? 1 : ty.max;
  return Math.max(ty.max == null ? RTS_TEAM_MAX : ty.max,
                  Math.ceil(cap / Math.max(1, eligible)));
}
/* HouseClass::IsAlerted, as Suggested_New_Team reads it. The timer half matters as much as
   the provocation half: a house that only wakes up when shot at would never field its late
   team types against a player who simply turtles, so the opponent would get WEAKER the more
   passively you played. */
function _rtsHouseAlerted() {
  var G = window._rtsG;
  if (!G) return false;
  var last = (G.ai.lastHit == null) ? -999 : G.ai.lastHit;
  /* The FIRST ATTACK WAVE is this game's declaration of war, and it is what alerts the
     house. Getting this wrong is expensive: gating the alert on a 240-second timer meant
     that on hard - where the match is decided around 190s - Sappers and Assault were never
     raised at all, since an idle player never provokes the house either. The opponent spent
     whole matches fielding nothing but harassment and an idle player survived 47% longer.
     The timer survives only as a backstop for a match where no wave ever goes out. */
  return G.ai.wave > 0 || last > -900 || G.t >= RTS_ALERT_TIME;
}
/* Suggested_New_Team. The original builds a list of every type that is under its MaxAllowed
   and passes the autocreate filter, then picks one AT RANDOM - `choices[Random_Pick(0,
   choicecount-1)]` - rather than always taking the best-scoring one. The commented-out block
   above it in TEAMTYPE.CPP is the scoring version that shipped disabled, so the randomness is
   the deliberate choice: a predictable opponent is a solved one.

   `spare` is how many loose units are available to crew the team; a type that cannot be
   filled is not a candidate. */
function _rtsSuggestTeam(spare) {
  var G = window._rtsG, choices = [], counts = {}, tid, ti, kk;
  for (tid in G.teams) {
    var nm = G.teams[tid].type.name;
    counts[nm] = (counts[nm] || 0) + 1;
  }
  var alerted = _rtsHouseAlerted(), _elig = 0;
  for (ti = 0; ti < RTS_TEAM_TYPES.length; ti++) {
    if (alerted === !!RTS_TEAM_TYPES[ti].autocreate) _elig++;
  }
  /* "maxnum = 0" for the types the filter rejects. A type capped at zero should not still be
     holding a team slot, so the moment the house changes phase its now-invalid teams are
     disbanded and their members freed. Without this the four harassment teams raised before
     the alert sat in the roster forever and the assault phase never got more than two slots
     out of RTS_TEAM_MAX. */
  for (tid in G.teams) {
    if (alerted !== !!G.teams[tid].type.autocreate) { _rtsTeamDisband(G.teams[tid]); }
  }
  counts = {};
  for (tid in G.teams) {
    var nm2 = G.teams[tid].type.name;
    counts[nm2] = (counts[nm2] || 0) + 1;
  }
  for (ti = 0; ti < RTS_TEAM_TYPES.length; ti++) {
    var ty = RTS_TEAM_TYPES[ti];
    if (G.teamHold[ty.name] && G.t < G.teamHold[ty.name]) continue;
    /* "if ((alerted && !ttype->IsAutocreate) || (!alerted && ttype->IsAutocreate)) maxnum=0"
       - a hard split, not a preference. Before the alert the opponent harasses; after it,
       the heavy types come out and the harassing ones stop being raised. */
    if (alerted !== !!ty.autocreate) continue;
    /* MaxAllowed, per type - but as a floor that scales with the army; see _rtsTypeCap.
       Without any cap the random pick happily raises every team of one kind. */
    if ((counts[ty.name] || 0) >= _rtsTypeCap(ty, _elig)) continue;
    var need = 0, buildable = true;
    for (kk in ty.members) {
      need += ty.members[kk];
      /* A TYPE THIS ARMY CANNOT CREW IS NOT A CANDIDATE. `spare` counts idle units, not
         MATCHING ones, so a type whose members this house can never build passes the size
         check, takes a slot, recruits nobody and never reaches full strength - so it never
         marches and never frees the slot either. Harmless while every composition was
         faction-neutral infantry and armour; the moment the two naval types arrived, one of
         them was always uncrewable, because a house builds one side's hulls only. */
      if (!_rtsCanProduce('enemy', kk)) buildable = false;
    }
    if (!buildable) continue;
    /* AND A TYPE THAT ONLY MAKES SENSE ACROSS WATER IS NOT A CANDIDATE ON DRY LAND. The same
       shape as the buildable gate above, for the same reason: a landing party raised where the
       tanks could simply drive is five units and a boat arriving later than walking. */
    if (ty.crossing && !_rtsAIWorthCrossing()) continue;
    /* ...and one that only makes sense against a building worth taking is not a candidate when
       there is not one. Same gate the engineer purchase is on, so the team and the unit it is
       built around are always raised for the same reason. */
    if (ty.capture && !_rtsAIWorthCapturing()) continue;
    if (spare < need) continue;
    choices.push(ty);
  }
  if (!choices.length) return null;
  return choices[(_rtsRnd() * choices.length) | 0];
}
/* IS SAILING WORTH IT? Asked of the map rather than assumed from it, because the answer decides
   whether the opponent spends 700 credits and five units on a crossing.

   Two ways for it to be yes, and they are the same question at two extremes: there is NO land
   route to the enemy at all, or the land route is RTS_AI_DETOUR times longer than the straight
   line - the road goes a long way round a lake, and the boat does not. A generated map is
   guaranteed a land route between the starts (see core/terrain.js), so on those this comes down
   to the detour test alone, and on most of them it is false: that is the intended answer, not a
   dead feature. It is false without a shipyard too - there is no point wanting a craft that
   cannot be built.

   Cached for RTS_AI_CROSS_RECHECK seconds. _rtsPath over half a map is not free and the answer
   moves only when a base does. */
function _rtsAIWorthCrossing() {
  var G = window._rtsG;
  if (!G || !G.ai) return false;
  if (G.ai.crossT != null && G.t - G.ai.crossT < RTS_AI_CROSS_RECHECK) return !!G.ai.crossOk;
  G.ai.crossT = G.t;
  G.ai.crossOk = false;
  if (!_rtsCanProduce('enemy', 'lst')) return false;
  /* BOTH ANCHORS ARE HOME ANCHORS. With a plain _rtsHas, an opponent that had captured the
     player's Construction Yard measured the crossing FROM that captured yard - which stands in
     the player's base - TO the player's War Factory a few tiles away. The straight line
     collapses to single digits while the walked route goes round the player's own buildings,
     so the detour test flipped true on a map with no water on it, and the opponent bought a
     700-credit transport for a crossing that did not exist. */
  var from = _rtsHasHome('enemy', 'yard') || _rtsHasHome('enemy', 'factory');
  var to = _rtsHasHome('player', 'yard') || _rtsHasHome('player', 'factory');
  if (!from || !to) return false;
  var straight = Math.hypot(to.x - from.x, to.z - from.z);
  if (straight <= 0) return false;
  var path = _rtsPath(from.x, from.z, to.x, to.z, null);
  if (!path) { G.ai.crossOk = true; return true; }        /* no road at all: the boat is the road */
  var run = 0, px = from.x, pz = from.z;
  for (var i = 0; i < path.length; i++) {
    run += Math.hypot(path[i].x - px, path[i].z - pz);
    px = path[i].x; pz = path[i].z;
  }
  G.ai.crossOk = run > straight * RTS_AI_DETOUR;
  G.ai.crossRun = run; G.ai.crossStraight = straight;     /* kept for the spec to read */
  return G.ai.crossOk;
}
/* Suspend_Teams: when the base is hit, everything below the survival priority is disbanded
   and its members are freed to defend. HOUSE.CPP calls this and it had nothing to call. */
function _rtsSuspendTeams(priority) {
  var G = window._rtsG, n = 0;
  for (var id in G.teams) {
    var t = G.teams[id];
    if (t.type.priority < priority) { _rtsTeamDisband(t); G.teamHold[t.type.name] = G.t + RTS_SUSPEND_DELAY; n++; }
  }
  return n;
}
/* AI_Unit's counterpart for offence: keep the army employed. A team only marches at full
   strength and only fields its own composition, so leaving team creation on the attack-wave
   timer alone left most of the army standing in the base - the opponent committed about
   fifteen units where the old blob sent sixty per cent of everything, and an idle player
   survived half again as long. Raise a team whenever there are enough loose units to crew
   one; the wave timer still governs the announcement, not the war. */
function _rtsTeamMaybeRaise() {
  var G = window._rtsG, i, tid;
  if (!G.teams) { G.teams = {}; G.teamSeq = 0; G.teamHold = {}; }
  /* Do NOT pre-empt the opening. The attack-wave timer is what gives a new player time to
     stand up an economy before anything arrives; raising teams the moment there are units to
     crew them threw that away entirely and the Commando AI was killing an idle player at 100
     seconds instead of 170. Surplus teams are a way to keep an existing war supplied, not a
     way to start one early. */
  if (!G.ai || !G.ai.wave) return false;

  var live = 0;
  for (tid in G.teams) live++;
  if (live >= _rtsTeamCap()) return false;

  var spare = 0;
  for (i = 0; i < G.ents.length; i++) {
    var u = G.ents[i];
    if (u.dead || u.side !== 'enemy' || u.type !== 'unit') continue;
    if (rtsUnitDef(u.def).harvest || u.sqd != null) continue;
    if (!_rtsMission(u).recruitable) continue;
    spare++;
  }
  /* IQGuardArea: a smart opponent keeps a garrison back rather than emptying the base. */
  if (_rtsIQAt(RTS_IQ.guardArea)) spare -= 3;
  if (spare < 2) return false;

  var pick = _rtsSuggestTeam(spare);
  if (!pick) return false;
  _rtsTeamMake(pick);
  return true;
}
function _rtsTeamsTick(dt) {
  var G = window._rtsG, id, t, i, m;
  if (!G.teams) { G.teams = {}; G.teamSeq = 0; G.teamHold = {}; }

  for (id in G.teams) {
    t = G.teams[id];
    /* prune the dead */
    for (i = t.members.length - 1; i >= 0; i--) {
      m = t.members[i];
      if (m.dead) { t.have[m.def] = Math.max(0, (t.have[m.def] || 1) - 1); t.members.splice(i, 1); }
    }
    var total = t.members.length, desired = _rtsTeamDesired(t);

    if (!total) {
      /* "If there are no members and the team has reached full strength at one time, delete." */
      if (t.hasBeen) { _rtsTeamDisband(t); continue; }
    }

    var full = (total >= desired);
    if (full) t.hasBeen = true;
    /* A TEAM THAT NEVER FILLS IS WORSE THAN NO TEAM, and until now nothing ever wrote one off.
       Below full strength it does not march, so its script never runs; meanwhile it holds a
       slot against the concurrent-team cap and its recruits are not `spare` to anything else -
       so the units are out of the war too, standing in the base with a squad id and no job.

       Unreachable while every composition was built from units the opponent produces
       constantly. It stopped being unreachable with the two gated compositions: the key member
       of each - the landing craft, the engineer - is bought only while its gate is open, and
       the gate can shut between raising the team and crewing it. Then the team waits forever
       for a unit that will never be built. */
    if (!t.hasBeen) {
      if (t.formT == null) t.formT = G.t;
      if (G.t - t.formT > RTS_TEAM_FORM_TIMEOUT) { _rtsTeamDisband(t); continue; }
    }
    /* Reinforceable teams snap out of under-strength at a third; the rest are never under
       strength again once they have set out. */
    if (t.type.reinforce) t.under = (desired > 2) ? (total <= desired / 3) : (total < desired);
    else t.under = !t.hasBeen;

    /* Flag into action at full strength. */
    if (!t.moving && full) {
      t.moving = true; t.hasBeen = true; t.under = false;
      for (i = 0; i < t.members.length; i++) t.members[i].init = true;
    }
    /* Under strength while moving: stop and regroup. */
    if (t.moving && t.under) { t.moving = false; t.target = null; }

    t.zone = _rtsTeamCentre(t);

    /* Recruit while there is room. */
    if (!t.moving || (!full && t.type.reinforce)) {
      for (i = 0; i < 2; i++) if (!_rtsTeamRecruit(t, t.zone)) break;
    }

    if (!t.members.length) continue;

    /* Coordinate_Conscript: an uninitiated recruit runs for the team centre, and counts as
       joined once it is inside StrayDistance. */
    var stragglers = 0;
    for (i = 0; i < t.members.length; i++) {
      m = t.members[i];
      if (m.init) continue;
      if (t.zone && Math.hypot(m.x - t.zone.x, m.z - t.zone.z) > RTS_STRAY) {
        stragglers++;
        if (!m.path && !m.order) _rtsOrderMove(m, t.zone.x, t.zone.z, false);
      } else m.init = true;
    }

    if (!t.moving) continue;

    /* Lagging_Units: anyone who has fallen behind is told to catch up, and the rest HOLD
       until they do. Without this the fast members arrive alone and die alone.
       IsSuicide - "charge toward target ignoring distractions" - opts out: a suicide team
       does not stop for its stragglers. */
    /* EXCEPT WHILE EMBARKING OR LANDING, when being spread out IS the manoeuvre: the tanks are
       walking to the water, the craft is sitting in it, and the whole point of the leg is that
       they are not together yet. Left in, the lag rule told everyone within range of the centre
       to HOLD until the stragglers arrived - and the stragglers were trying to board, which is
       a thing you cannot do while holding. The team stood on the beach until the load timed
       out, every time. */
    var _leg = t.type.missions && t.type.missions[t.cur | 0];
    var _amphib = !!_leg && (_leg[0] === 'load' || _leg[0] === 'unload');
    var lag = false;
    if (t.zone && !t.type.suicide && !_amphib) {
      for (i = 0; i < t.members.length; i++) {
        m = t.members[i];
        if (!m.init || m.dead) continue;
        if (Math.hypot(m.x - t.zone.x, m.z - t.zone.z) > RTS_STRAY * 1.6) { lag = true; break; }
      }
    }
    t.lagging = lag;
    if (lag) {
      for (i = 0; i < t.members.length; i++) {
        m = t.members[i];
        if (m.dead || !m.init) continue;
        if (Math.hypot(m.x - t.zone.x, m.z - t.zone.z) <= RTS_STRAY * 1.6) {
          if (m.order !== 'hold' && !m.target) { m.order = 'hold'; m.path = null; }
        }
      }
      continue;
    }

    if (_rtsTeamDoMission(t, dt) === 'gone') continue;
  }
}
