/* core/missions.js - the team mission list (TEAMTYPE.CPP): the script a team runs.
   Part of rts.core, the simulation. */

/* ----------------------------------------------------- the mission list (TEAMTYPE.CPP) --
   `MissionList[]` with an index walked down it. Each entry is [mission, argument], and the
   argument's meaning comes from TeamMission_Needs (see RTS_TMISSIONS).

   Every mission answers one question - "am I done?" - and when the answer is yes the index
   advances. TMISSION_LOOP is the only one that moves the index anywhere else. */
function _rtsTeamOrderAll(t, fn) {
  for (var i = 0; i < t.members.length; i++) {
    var m = t.members[i];
    if (m.dead || !m.init) continue;
    /* A PASSENGER TAKES NO ORDERS. Cargo is a team member like any other and sits at its
       transport's coordinates, so without this a landing party's tanks are given attack
       orders while they are still in the hold - orders nothing will execute, because the tick
       skips anything flagged `inside`, and which _rtsUnload then clears on the beach anyway.
       Same rule as the five other places that must ask whether a unit is on the map; see the
       header of core/transport.js. */
    if (m.inside) continue;
    if (m.order === 'hold') m.order = null;
    fn(m, i);
  }
}
/* WHERE TO PUT AN ARMY ASHORE near something worth attacking: the closest cell to the target
   that a land unit can stand on AND that a hull can reach the edge of. A beach, in other words,
   and it is searched for from the TARGET outwards - so the beach it finds is on the target's
   own side of the water, which is the entire point of going.

   The first version of this asked for the nearest WATER to the target instead, and the
   difference is not academic. Measured on a channel arena: the nearest water cell to the
   player's Command Yard was ninety tiles up the coast, the craft dutifully sailed all the way
   there, and then sat in open water for the rest of the leg because nothing within reach of it
   was land. A hull cannot land on water; it lands on the shore beside it, so the shore is the
   thing to look for. */
function _rtsLandingSpot(aim) {
  var atx = _rtsTX(aim.x), atz = _rtsTX(aim.z);
  for (var r = 1; r <= 30; r++) {
    for (var ox = -r; ox <= r; ox++) {
      for (var oz = -r; oz <= r; oz++) {
        if (Math.max(Math.abs(ox), Math.abs(oz)) !== r) continue;
        var tx = atx + ox, tz = atz + oz;
        if (!_rtsInB(tx, tz) || _rtsBlocked(tx, tz, null)) continue;    /* must be standable */
        /* ...and close enough to open water that a hull could put somebody on it. The same
           reach the unload itself uses, so a spot chosen here is a spot that can be landed on. */
        if (!_rtsNearestOpen(tx, tz, RTS_UNLOAD_REACH, 'sea')) continue;
        return { x:_rtsWX(tx), z:_rtsWX(tz) };
      }
    }
  }
  return null;
}
/* The craft a landing party is built around: its one member with a hold. */
function _rtsTeamTransport(t) {
  for (var i = 0; i < t.members.length; i++) {
    var m = t.members[i];
    if (!m.dead && _rtsIsTransport(m)) return m;
  }
  return null;
}
/* Spread arrivals out so five units do not path onto one tile and jam the approach. */
function _rtsTeamSpread(i) {
  var a = i * 2.399963;                        /* golden angle, so any count fans out evenly */
  var r = RTS_TILE * (1 + Math.sqrt(i) * 0.9);
  return { x:Math.cos(a) * r, z:Math.sin(a) * r };
}
function _rtsTeamAdvance(t, to) {
  t.cur = (to == null) ? (t.cur | 0) + 1 : to;
  t.guardUntil = 0;
  t.legT = null;
  t.target = null;
  t.beach = null;                 /* the landing point is chosen per leg - see TMISSION_UNLOAD */
}
function _rtsTeamDoMission(t, dt) {
  var G = window._rtsG, list = t.type.missions, i, m;

  /* No list: the pre-TEAMTYPE behaviour, which is exactly TMISSION_ATTACK on the type's own
     quarry, forever. Keeping it means a team type can still be declared without a script. */
  if (!list || !list.length) {
    if (!t.target || t.target.dead) t.target = _rtsTeamTarget(t);
    if (!t.target) return 'idle';
    _rtsTeamOrderAll(t, function (mm) {
      if (mm.order !== 'attack' || mm.target !== t.target) _rtsOrderAttack(mm, t.target);
    });
    return 'ok';
  }

  if (t.cur == null) t.cur = 0;

  /* A LOOP entry consumes no time, so a list of nothing but jumps would spin forever inside
     one tick. Bound the walk by the length of the list: that is enough for any number of
     legitimate jumps and stops a malformed script dead. */
  for (var guard = 0; guard <= list.length; guard++) {
    if (t.cur >= list.length || t.cur < 0) {
      /* Off the end of the list: the team's job is finished. Disbanding frees the members
         to be recruited into whatever is raised next, rather than leaving a spent squad
         standing in the field. */
      _rtsTeamDisband(t);
      return 'gone';
    }
    var entry = list[t.cur], mis = entry[0], arg = entry[1];

    if (mis === 'loop') { _rtsTeamAdvance(t, arg | 0); continue; }

    if (mis === 'guard') {
      if (!t.guardUntil) t.guardUntil = G.t + (arg || 1) * RTS_GUARD_TICK;
      if (G.t >= t.guardUntil) { _rtsTeamAdvance(t); continue; }
      _rtsTeamOrderAll(t, function (mm) {
        /* MISSION_STICKY, which is what the flag table in MISSION.CPP was for: hold this
           spot, shoot what comes, and do not be dragged off it. */
        if (!mm.target && mm.order !== 'hold') { mm.order = 'hold'; mm.path = null; mm.goal = null; }
      });
      return 'ok';
    }

    if (mis === 'move' || mis === 'patrol') {
      var w = _rtsWayptPos(arg);
      if (!w) { _rtsTeamAdvance(t); continue; }
      /* Arrival is judged on the team CENTRE - a single member wedged behind a cliff must
         not hold the whole script up. The timeout is the same idea for a team that cannot
         reach the waypoint at all. */
      if (t.zone && Math.hypot(t.zone.x - w.x, t.zone.z - w.z) <= RTS_WAYPT_ARRIVE) {
        _rtsTeamAdvance(t); continue;
      }
      if (t.legT == null) t.legT = G.t;
      if (G.t - t.legT > 120) { _rtsTeamAdvance(t); continue; }
      /* PATROL engages on the way (attack-move); MOVE is a march. */
      var amove = (mis === 'patrol');
      _rtsTeamOrderAll(t, function (mm, idx) {
        if (mm.target && !mm.target.dead && amove) return;      /* already busy en route */
        var want = amove ? 'amove' : 'move', off = _rtsTeamSpread(idx);
        if (mm.order === want && mm.goal
            && Math.hypot(mm.goal.x - (w.x + off.x), mm.goal.z - (w.z + off.z)) < RTS_TILE) return;
        _rtsOrderMove(mm, w.x + off.x, w.z + off.z, amove);
      });
      return 'ok';
    }

    /* TMISSION_LOAD. Everyone who can get into the team's transport does; the craft waits.
       This is the player's own board order, issued once per member, so a landing party loads
       by exactly the rules a player loads by - including the longer reach that lets a squad
       board from the beach while the hull sits in the water. */
    if (mis === 'load') {
      var tr = _rtsTeamTransport(t);
      if (!tr) { _rtsTeamAdvance(t); continue; }
      if (t.legT == null) t.legT = G.t;
      var waiting = 0, aboard = 0;
      for (i = 0; i < t.members.length; i++) {
        m = t.members[i];
        if (m.dead || m === tr) continue;
        if (m.inside) { aboard++; continue; }
        if (!_rtsCanBoard(m, tr)) continue;              /* the hold is full, or it cannot fit */
        waiting++;
        if (m.order !== 'board' || m.target !== tr) _rtsOrderBoard(m, tr);
      }
      /* The craft holds station while they come to it. It is unarmed, so this is only about
         not wandering off mid-embarkation. */
      if (!tr.dead && tr.order !== 'hold') { tr.order = 'hold'; tr.path = null; tr.goal = null; }
      if (!waiting) { _rtsTeamAdvance(t); continue; }    /* everyone in, or nobody else can be */
      if (G.t - t.legT > RTS_LOAD_TIMEOUT) {
        /* Out of time. With somebody aboard the crossing is still worth making; with nobody
           aboard there is no landing party at all, and leaving it standing would hold a team
           slot and five units out of the war for the rest of the match. */
        if (aboard) { _rtsTeamAdvance(t); continue; }
        _rtsTeamDisband(t);
        return 'gone';
      }
      return 'ok';
    }

    /* TMISSION_UNLOAD. The craft takes what it is carrying to the far shore and puts it down.
       _rtsOrderUnloadAt is the player's right-click-the-beach order - it sails to the water
       nearest the point it is aimed at and lands the cargo there - which is why this leg needs
       no waypoint of its own, and why a landing arrives where the target is rather than at a
       spot chosen in advance. */
    if (mis === 'unload') {
      var trU = _rtsTeamTransport(t);
      if (!trU || !_rtsCargoCount(trU)) { _rtsTeamAdvance(t); continue; }
      if (t.legT == null) t.legT = G.t;
      if (!t.target || t.target.dead) t.target = _rtsTeamTarget(t, 'buildings');
      var aim = t.target || _rtsHas('player', 'yard');
      if (!aim) { _rtsTeamAdvance(t); continue; }
      /* AIM AT THE BEACH, NOT AT THE BUILDING. A target worth landing against is usually well
         inland, and _rtsOrderUnloadAt walks an unreachable goal outwards only far enough to
         find a cell the craft can occupy - six rings. Aimed straight at a Command Yard in the
         middle of a base that is nowhere near, the search failed, the order was refused, and
         the craft sat re-issuing it until the leg timed out with everyone still in the hold.
         So the aim point is the BEACH nearest the target - the closest cell to it a tank can
         stand on and a hull can reach the edge of. See _rtsLandingSpot; the unload then sails
         to the water beside that cell and puts the cargo down on it. */
      if (!t.beach) {
        t.beach = _rtsLandingSpot(aim);
        if (!t.beach) { _rtsTeamAdvance(t); continue; }   /* the target has no coast at all */
      }
      if (trU.order !== 'unload') _rtsOrderUnloadAt(trU, t.beach.x, t.beach.z);
      /* A craft that cannot find a route, or cannot land when it arrives, must not strand the
         team: time out and let the attack leg do what it can with whoever is on the map. */
      if (G.t - t.legT > RTS_UNLOAD_TIMEOUT) { _rtsTeamAdvance(t); continue; }
      return 'ok';
    }

    if (mis === 'attwaypt') {
      var wp = _rtsWayptPos(arg);
      if (!wp) { _rtsTeamAdvance(t); continue; }
      if (!t.target || t.target.dead) {
        t.target = _rtsTeamTarget(t, 'anything', { x:wp.x, z:wp.z, r:RTS_TILE * 14 });
      }
      if (!t.target) { _rtsTeamAdvance(t); continue; }
      _rtsTeamOrderAll(t, function (mm) {
        if (mm.order !== 'attack' || mm.target !== t.target) _rtsOrderAttack(mm, t.target);
      });
      return 'ok';
    }

    if (mis === 'tarcom') {
      /* ATTACKTARCOM: whatever the team is already fixed on - normally set by Took_Damage. */
      if (!t.target || t.target.dead) { _rtsTeamAdvance(t); continue; }
      _rtsTeamOrderAll(t, function (mm) {
        if (mm.order !== 'attack' || mm.target !== t.target) _rtsOrderAttack(mm, t.target);
      });
      return 'ok';
    }

    /* TMISSION_ATTACK, and the default for anything unrecognised. */
    if (!t.target || t.target.dead) t.target = _rtsTeamTarget(t, (mis === 'attack') ? arg : null);
    if (!t.target) { _rtsTeamAdvance(t); continue; }
    _rtsTeamOrderAll(t, function (mm) {
      if (mm.order !== 'attack' || mm.target !== t.target) _rtsOrderAttack(mm, t.target);
    });
    return 'ok';
  }
  return 'ok';
}
/* Took_Damage: the team retargets onto whoever hit it - unless it is already fighting
   something that shoots back and is in range. "There is no point in endlessly shuffling
   between targets that have firepower." */
function _rtsTeamTookDamage(u, from) {
  var G = window._rtsG;
  if (u.sqd == null || !G.teams || !G.teams[u.sqd]) return;
  var t = G.teams[u.sqd];
  if (!from || from.side !== 'player' || !t.moving) return;
  /* IsSuicide: "Charge toward target ignoring distractions". Being shot at IS the
     distraction, so a suicide team never retargets onto whoever hit it. */
  if (t.type.suicide) return;
  if (t.target === from) return;
  if (t.target && !t.target.dead) {
    var td = rtsStructDef(t.target.def) || rtsUnitDef(t.target.def);
    var lead = _rtsTeamLeader(t);
    if (td && td.weapon && lead && _rtsRangeTo(lead, t.target) <= _rtsReach(lead)) return;
  }
  t.target = from;
}

function _rtsAIAttack(urgency) {
  var G = window._rtsG, pool = [], k;
  for (k = 0; k < G.ents.length; k++) {
    var u = G.ents[k];
    if (!u.dead && u.side === 'enemy' && u.type === 'unit' && !rtsUnitDef(u.def).harvest
        && u.sqd == null && _rtsMission(u).recruitable) pool.push(u);
  }
  /* Commit a real share of the idle army, not a token squad. Sending a fixed handful let
     the AI pile up forty-odd defenders at home, which is both un-fun and unbeatable.
     IQGuardArea: only a smart opponent knows to hold some of it back as a garrison. */
  /* AttackInterval is deliberately randomised over a 4x spread in the original, so waves
     never arrive on a metronome you can set your watch by. */
  G.ai.next = RTS_WAVE_EVERY * _rtsBias('enemy').build * (0.5 + _rtsRnd() * 1.5);
  if (!_rtsHas('player', 'yard') && !_rtsHas('player', 'refinery') && !_rtsHas('player', 'power')) return false;

  /* Raise a TEAM rather than shoving a share of everything idle at the nearest building.
     A team holds a composition and a quarry, waits until it is at full strength, and then
     goes after the kind of thing it was raised to kill. */
  if (!G.teams) { G.teams = {}; G.teamSeq = 0; G.teamHold = {}; }
  var live = 0, tid;
  for (tid in G.teams) live++;
  if (live >= _rtsTeamCap()) return false;

  /* Only raise a type this army can actually crew, and respect a suspension.
     IQGuardArea: a smart opponent keeps a garrison, so it will not raise a team it would
     have to strip the whole base to fill. */
  var spare = _rtsIQAt(RTS_IQ.guardArea) ? Math.max(0, pool.length - 3) : pool.length;
  if (urgency <= RTS_URGENCY.LOW) spare = Math.floor(spare * 0.5);     /* hit at home: hold back */
  var pick = _rtsSuggestTeam(spare);
  if (!pick) return false;
  _rtsTeamMake(pick);
  G.ai.wave++;
  _rtsSay(rtsArmyName('enemy') + ' ' + pick.name + ' team inbound!');
  if (typeof _rtsSfx === 'function') _rtsSfx('alert');
  return true;
}

