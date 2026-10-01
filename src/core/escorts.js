/* core/escorts.js - the opponent's spare army goes with its attacks. Part of rts.core.

   WHY THIS EXISTS. Measured over eight matches (both armies, normal and hard): 80 to 89 per cent
   of the opponent's fighting army, averaged over the match, had no order, no squad and no target.
   It built 90 to 170 units by the seventh minute and banked 5,000 credits besides. A team only
   recruits the unit types its composition names and only marches at full strength, so everything
   else it bought - Light Tanks, Artillery, V2s, the grenadiers and flamers - had no route out of
   the base but the endgame hunt. unit/aiplan measured it: 49 such vehicles bought across eight
   matches, none of them ever fired at anything the player owned.

   WHY ESCORTS AND NOT MORE TEAMS. Fielding them as teams of their own was built once and deleted
   (see unit/aiplan): the teams marched, and the opponent did WORSE, because artillery walking at
   a base on its own dies on its own. So the spare army joins attacks that are already going out.
   Whenever a team is on the march, idle fighters at home attach to it as escorts, travel to where
   it is and fight alongside it - combined arms around the compositions that work, instead of new
   compositions that do not.

   HOW MUCH, BY DIFFICULTY. Every difficulty uses its army now; how much of it is the ladder.
   `keep` fighters stay at home as a garrison, closest to the base first, and `commit` of the rest
   march - see RTS_DIFF. Recruit keeps a large garrison and sends half of the remainder; Commando
   keeps a handful and sends everything. What sets a
   difficulty's strength is the SIZE of its army (`army`), not how much of it marches - see the
   measurements on RTS_DIFF. An optional `escorts` caps the escorts with any one team; no
   difficulty uses it, because capping them sent the army back to standing at home.

   WHAT AN ESCORT DOES. It attack-moves to its team: to the team's target when it has one, else to
   the team's centre, spread over a frontage so a column does not funnel into one cell. It is
   re-aimed every RTS_ESCORT_EVERY seconds while it is not busy fighting. When its team is gone -
   destroyed, or done - it carries on to the player's nearest building and is released there; an
   attack that has reached the enemy's base does not turn round and walk home. Escorts stay
   recruitable (sqd is untouched), so a team short of a member can still take one. */

var RTS_ESCORT_EVERY = 2;          /* seconds between re-aims */

/* A unit that can go: the opponent's, on the ground, armed, not a harvester, not in a team, and
   not on a mission that forbids recruiting it (holding, harvesting, rearming...). */
function _rtsEscortable(u) {
  if (u.dead || u.side !== 'enemy' || u.type !== 'unit' || u.air || u.inside) return false;
  var d = rtsUnitDef(u.def);
  if (!d || d.harvest || d.sea || !d.weapon) return false;
  if (u.sqd != null || u.mend != null) return false;      /* mend: on its way to the depot, core/aimend.js */
  return !!_rtsMission(u).recruitable;
}
/* A team worth escorting: on the march, on land, with someone in it. */
function _rtsEscortWorthy(t) {
  if (!t || !t.moving || !t.members.length || t.type.crossing) return false;
  for (var i = 0; i < t.members.length; i++) {
    var d = rtsUnitDef(t.members[i].def);
    if (!t.members[i].dead && d && !d.air && !d.sea) return true;
  }
  return false;
}
function _rtsEscortsTick(dt) {
  var G = window._rtsG;
  if (!G.ai || !G.ai.wave) return;                  /* the opening is the wave timer's, as teams */
  if (window.RTS_ESCORT_OFF) return;                /* e2e/armyuse's before-picture */
  G.ai.escT = (G.ai.escT || 0) + dt;
  if (G.ai.escT < RTS_ESCORT_EVERY) return;
  G.ai.escT = 0;
  var B = _rtsBias('enemy'), i, u, tid, t;
  /* KEEP THE MUSTER POINTS GOOD, on this tick rather than only at delivery. Production stops at
     the army's ceiling (RTS_DIFF `army`), and a point checked only when a unit comes out was
     never checked again after that: a refinery built beside it, or ore spreading to its edge,
     left the waiting army standing in the harvest - e2e/basespace caught exactly one. */
  for (i = 0; i < G.ents.length; i++) {
    var pb = G.ents[i];
    if (!pb.dead && pb.side === 'enemy' && pb.type === 'struct' && pb.muster) _rtsAIMuster(pb);
  }
  var teams = [];
  for (tid in (G.teams || {})) if (_rtsEscortWorthy(G.teams[tid])) teams.push(G.teams[tid]);

  /* ---- who is escorting whom, and who is free ---- */
  var loose = [], count = {};
  for (i = 0; i < G.ents.length; i++) {
    u = G.ents[i];
    if (!_rtsEscortable(u)) continue;
    if (u.escort != null) {
      t = G.teams && G.teams[u.escort];
      if (_rtsEscortWorthy(t)) { count[t.id] = (count[t.id] || 0) + 1; _rtsEscortAim(u, t, count[t.id]); continue; }
      /* its team is gone: finish the attack, then stand down where it ends */
      _rtsEscortRelease(u);
      continue;
    }
    if (u.order || u.target || u.path) continue;      /* busy - fighting, or already on its way */
    loose.push(u);
  }
  if (!teams.length || !loose.length) return;

  /* ---- the garrison stays: the fighters nearest the base's centre ---- */
  var c = _rtsBaseCentre('enemy');
  if (c) loose.sort(function (a, b) {
    return Math.hypot(a.x - c.x, a.z - c.z) - Math.hypot(b.x - c.x, b.z - c.z) || a.id - b.id;
  });
  var keep = B.keep == null ? 6 : B.keep, commit = B.commit == null ? 0.75 : B.commit;
  var per = B.escorts == null ? 1e9 : B.escorts;
  var free = loose.slice(keep);
  var go = Math.floor(free.length * commit);
  /* the furthest-out go first: they are the ones already at the muster points on the base's edge */
  for (i = free.length - go; i < free.length; i++) {
    u = free[i];
    /* to whichever marching team has the fewest escorts so far */
    var best = null, bn = 1e9;
    for (var k = 0; k < teams.length; k++) {
      var n = count[teams[k].id] || 0;
      if (n < bn) { bn = n; best = teams[k]; }
    }
    if (bn >= per) break;                          /* every marching team has its escort */
    u.escort = best.id;
    count[best.id] = bn + 1;
    _rtsEscortAim(u, best, count[best.id]);
  }
}
/* Where an escort should be heading: the team's target if it has one, else the team's centre,
   on a frontage. Re-issued only when the aim has moved, so a unit is not re-pathed every pass. */
function _rtsEscortAim(u, t, n) {
  if (u.target && !u.target.dead) return;            /* fighting - leave it be */
  var aim = (t.target && !t.target.dead) ? t.target : (t.zone || _rtsTeamCentre(t));
  if (!aim) return;
  var ox = ((n % 5) - 2) * RTS_TILE, oz = ((((n / 5) | 0) % 3) - 1) * RTS_TILE;
  var gx = aim.x + ox, gz = aim.z + oz;
  if (u.goal && Math.hypot(u.goal.x - gx, u.goal.z - gz) < RTS_TILE * 3 && u.path) return;
  _rtsOrderMove(u, gx, gz, true);
}
function _rtsEscortRelease(u) {
  u.escort = null;
  var aim = _rtsHas('player', 'yard') || _rtsHas('player', 'factory') || _rtsHas('player', 'refinery');
  if (aim && !u.target) _rtsOrderMove(u, aim.x, aim.z, true);
}
