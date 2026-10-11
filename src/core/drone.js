/* core/drone.js - the Recon Drone: an eye that stays up.

   The verb is WATCHING A PLACE. Cheap, unarmed and thin-skinned, it flies where it is sent and
   then CIRCLES there (RTS_DRONE.r cells round the point it stopped at) rather than parking, and
   it is a Spotter in the air (rules `spots`, core/spotter.js): its sight is never cut by fog or
   a fog bank, every gun of its side finds what it sees at full reach, and what it sees cannot
   hide in a Jammer's field. Sent somewhere new, it circles there instead.

   SENT ONTO A UNIT IT SHADOWS IT (e.orbitOn): the circle's centre follows the unit once it has
   moved RTS_DRONE.follow cells from it - over one of yours, a column's eye on the march; over
   an enemy's, a tail on it. It lets go when the unit dies or boards something, or when an enemy
   unit is no longer seen by the drone's side (a submarine diving), so a drone cannot hand the
   player the track of something nothing of theirs can see. A new order ends it.

   The opponent buys one when its army is fighting half-blind - fog, a sandstorm, or a Jammer of
   the player's on the field - with its own base defended, and keeps it circling over the middle
   of its largest team on the march. */

var RTS_DRONE = { r: 3, step: 0.6, every: 2, follow: 2 };

function _rtsOrbits(u) { return !!(rtsUnitDef(u.def) || {}).orbits; }
function _rtsDroneTick() {
  var G = window._rtsG;
  for (var i = 0; i < G.ents.length; i++) {
    var e = G.ents[i];
    if (e.dead || e.type !== 'unit' || !_rtsOrbits(e)) continue;
    var busy = e.order && e.order !== 'orbit';
    if (busy) e.orbitOn = null;                                                     /* a new order ends a shadow */
    if (busy && e.path && e.pi < e.path.length) { e.orbit = null; continue; }    /* on its way */
    if (e.orbitOn != null) {
      var t = G.byId[e.orbitOn];
      if (!t || t.dead || t.inside || (_rtsHostile(t.side, e.side) && !_rtsShadowSeen(e, t))) e.orbitOn = null;
      else if (!e.orbit || Math.hypot(t.x - e.orbit.x, t.z - e.orbit.z) > RTS_DRONE.follow * RTS_TILE) e.orbit = _rtsDroneCentre(t.x, t.z);
    }
    if (!e.orbit) e.orbit = _rtsDroneCentre(e.x, e.z);                              /* stopped: circle here */
    if (e.path && e.pi < e.path.length) continue;                                  /* still on this leg */
    /* the next point round the circle, a step ahead of where it is */
    var o = e.orbit, a = Math.atan2(e.z - o.z, e.x - o.x) + RTS_DRONE.step, r = RTS_DRONE.r * RTS_TILE;
    e.order = 'orbit'; e.goal = { x: o.x + Math.cos(a) * r, z: o.z + Math.sin(a) * r };
    e.path = [{ x: e.goal.x, z: e.goal.z }]; e.pi = 0;
  }
}
/* A CIRCLE THAT FITS IN THE SKY. _rtsAirSpread holds every aircraft inside the map's edges, so a
   centre nearer an edge than the radius would put a point of the circle where the drone can
   never arrive, and it sat pinned at the edge for the rest of the match instead of circling. */
function _rtsDroneCentre(x, z) {
  var r = RTS_DRONE.r * RTS_TILE, lo = _rtsWX(0) + r, hi = _rtsWX(RTS_N - 1) - r;
  return { x: Math.min(hi, Math.max(lo, x)), z: Math.min(hi, Math.max(lo, z)) };
}
/* send it to circle somewhere else */
function _rtsDroneAt(e, x, z) {
  var o = _rtsDroneCentre(x, z);
  e.orbit = o; e.order = 'orbit'; e.path = [{ x: o.x, z: o.z }]; e.pi = 0; e.goal = { x: o.x, z: o.z };
  e.orbitOn = null;
}
/* ...or over a unit, wherever it goes */
function _rtsDroneOn(e, t) {
  _rtsDroneAt(e, t.x, t.z);
  e.orbitOn = t.id;
}
/* Is the shadowed enemy still seen by the drone's side? The player's view is _rtsEntSeen
   (core/supers.js) - a diving submarine is not seen, however close the drone circles. The
   opponent never shadows anything (its drone follows its own team, below). */
function _rtsShadowSeen(e, t) { return !_rtsWithPlayer(e.side) || _rtsEntSeen(t); }

/* Is the opponent fighting half-blind? */
function _rtsAIHalfBlind() {
  if (_rtsFogged()) return true;
  var G = window._rtsG;
  for (var i = 0; i < G.ents.length; i++) { var e = G.ents[i]; if (!e.dead && e.side === _rtsAIFoe() && e.type === 'unit' && _rtsJams(e)) return true; }
  return false;
}
/* the opponent's drone: over the middle of its largest team on the march */
function _rtsAIDroneTick(dt) {
  var G = window._rtsG, big = null, bn = 0, id;
  G.ai.droneT = (G.ai.droneT || 0) + dt;
  if (G.ai.droneT < RTS_DRONE.every) return;
  G.ai.droneT = 0;
  for (id in G.teams) {
    var t = G.teams[id];
    if (!t.moving || !_rtsTeamMine(t)) continue;
    var n = t.members.filter(function (m) { return !m.dead; }).length;
    if (n > bn) { bn = n; big = t; }
  }
  var c = big && _rtsTeamCentre(big);
  if (!c) return;
  for (var i = 0; i < G.ents.length; i++) {
    var u = G.ents[i];
    if (u.dead || u.side !== _rtsAIOn || u.type !== 'unit' || !_rtsOrbits(u)) continue;
    if (!u.orbit || Math.hypot(u.orbit.x - c.x, u.orbit.z - c.z) > RTS_TILE * 3) _rtsDroneAt(u, c.x, c.z);
  }
}
