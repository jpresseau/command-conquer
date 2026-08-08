/* core/teams.js - TEAM.CPP / TEAMTYPE.CPP: waypoints, recruiting a team and keeping the
   opponent's teams stocked. Part of rts.core, the simulation. */

/* ------------------------------------------------------- waypoints (TEAMTYPE.CPP) --
   Every waypoint-taking team mission - MOVE, ATT_WAYPT, PATROL - names a place on the map
   rather than a raw cell, and that indirection is the whole reason a team script can be
   written once and still mean something. In the original a designer drops the waypoints by
   hand in the scenario editor; this map is generated, so they are DERIVED from it instead.

   Named rather than numbered, which is the same mechanism spelled legibly: what a scenario
   author means by "waypoint 7" is "the gap in the ridge", and there is no reason to make the
   team types refer to it as a number here.

     home   the opponent's own command yard - where a team forms up
     front  the direct approach to the player's base, short of the buildings
     flank  the same base approached off the diagonal, so an attack does not always
            arrive up the one corridor the player has learned to defend
     mid    the contested ore in the middle of the map
     ore    the field the player's own harvesters are working - a raider's hunting ground */
function _rtsWayptSnap(tx, tz) {
  tx = Math.max(1, Math.min(RTS_N - 2, Math.round(tx)));
  tz = Math.max(1, Math.min(RTS_N - 2, Math.round(tz)));
  var open = _rtsNearestOpen(tx, tz, 24);
  return open ? { tx:open[0], tz:open[1] } : { tx:tx, tz:tz };
}
/* The ore cell closest to a given point, so "ore" and "mid" name real deposits rather than
   wherever the field happened to be authored. */
function _rtsNearestOre(G, tx, tz) {
  var best = null, bd = 1e9;
  for (var z = 0; z < RTS_N; z++) for (var x = 0; x < RTS_N; x++) {
    if (G.scrap[_rtsIdx(x, z)] <= 0) continue;
    var d = (x - tx) * (x - tx) + (z - tz) * (z - tz);
    if (d < bd) { bd = d; best = { tx:x, tz:z }; }
  }
  return best;
}
function _rtsBuildWaypoints(G) {
  var home = _rtsHas('enemy', 'yard'), foe = _rtsHas('player', 'yard');
  var W = {};
  var hx = home ? home.tx : RTS_N - 20, hz = home ? home.tz : 20;
  var fx = foe ? foe.tx : 20, fz = foe ? foe.tz : RTS_N - 20;
  W.home = _rtsWayptSnap(hx, hz + 6);

  /* Stand off the target base rather than on top of it: a MOVE mission is an approach, and
     a team that "arrives" inside the enemy buildings has already blundered into the fight
     the flank was supposed to avoid. */
  var dx = fx - hx, dz = fz - hz, len = Math.hypot(dx, dz) || 1;
  var ux = dx / len, uz = dz / len, STAND = 13;
  W.front = _rtsWayptSnap(fx - ux * STAND, fz - uz * STAND);

  /* Perpendicular to the line between the two bases, so the flank is derived from the
     layout rather than from a corner that happens to be right for this one map. Both signs
     are candidates; take whichever lands on open ground furthest from the direct route. */
  /* SWING is a real flank, not a trek. At 24 tiles on a 112-tile map this put the waypoint
     out on the map edge and every team that used it spent most of the match walking. */
  var px = -uz, pz = ux, SWING = 12, cand = null, cbest = -1;
  for (var s = -1; s <= 1; s += 2) {
    var c = _rtsWayptSnap(fx + px * s * SWING - ux * 6, fz + pz * s * SWING - uz * 6);
    var away = Math.abs((c.tx - fx) * pz - (c.tz - fz) * px) + Math.hypot(c.tx - fx, c.tz - fz);
    if (away > cbest) { cbest = away; cand = c; }
  }
  W.flank = cand;

  /* `sea` - open WATER off the target's coast. A naval team pointed at a land waypoint
     steers at a beach it cannot reach and stalls there for the rest of the match, so this is
     snapped in the sea domain rather than by _rtsWayptSnap, which finds open LAND. Aimed a
     little short of the enemy base for the same reason `front` is: arriving inside the guns
     is not an approach. */
  var _seaAim = _rtsNearestOpen(Math.round(fx - ux * 8), Math.round(fz - uz * 8), 40, 'sea');
  W.sea = _seaAim ? { tx:_seaAim[0], tz:_seaAim[1] } : null;

  var mid = _rtsNearestOre(G, RTS_N >> 1, RTS_N >> 1);
  W.mid = _rtsWayptSnap(mid ? mid.tx : RTS_N >> 1, mid ? mid.tz : RTS_N >> 1);
  var ore = _rtsNearestOre(G, fx, fz);
  W.ore = _rtsWayptSnap(ore ? ore.tx : fx, ore ? ore.tz : fz);

  G.waypt = W;
  return W;
}
function _rtsWayptPos(name) {
  var G = window._rtsG;
  if (!G.waypt) _rtsBuildWaypoints(G);
  var w = G.waypt[name] || G.waypt.front;
  return w ? { x:_rtsWX(w.tx), z:_rtsWX(w.tz) } : null;
}

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
    if (spare < need) continue;
    choices.push(ty);
  }
  if (!choices.length) return null;
  return choices[(_rtsRnd() * choices.length) | 0];
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
    var lag = false;
    if (t.zone && !t.type.suicide) {
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
