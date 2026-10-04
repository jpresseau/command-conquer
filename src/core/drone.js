/* core/drone.js - the Recon Drone: an eye that stays up.

   The verb is WATCHING A PLACE. Cheap, unarmed and thin-skinned, it flies where it is sent and
   then CIRCLES there (RTS_DRONE.r cells round the point it stopped at) rather than parking, and
   it is a Spotter in the air (rules `spots`, core/spotter.js): its sight is never cut by fog or
   a fog bank, every gun of its side finds what it sees at full reach, and what it sees cannot
   hide in a Jammer's field. Sent somewhere new, it circles there instead.

   The opponent buys one when its army is fighting half-blind - fog, a sandstorm, or a Jammer of
   the player's on the field - with its own base defended, and keeps it circling over the middle
   of its largest team on the march. */

var RTS_DRONE = { r: 3, step: 0.6, every: 2 };

function _rtsOrbits(u) { return !!(rtsUnitDef(u.def) || {}).orbits; }
function _rtsDroneTick() {
  var G = window._rtsG;
  for (var i = 0; i < G.ents.length; i++) {
    var e = G.ents[i];
    if (e.dead || e.type !== 'unit' || !_rtsOrbits(e)) continue;
    var busy = e.order && e.order !== 'orbit';
    if (busy && e.path && e.pi < e.path.length) { e.orbit = null; continue; }    /* on its way */
    if (!e.orbit) e.orbit = { x: e.x, z: e.z };                                      /* stopped: circle here */
    if (e.path && e.pi < e.path.length) continue;                                  /* still on this leg */
    /* the next point round the circle, a step ahead of where it is */
    var o = e.orbit, a = Math.atan2(e.z - o.z, e.x - o.x) + RTS_DRONE.step, r = RTS_DRONE.r * RTS_TILE;
    e.order = 'orbit'; e.goal = { x: o.x + Math.cos(a) * r, z: o.z + Math.sin(a) * r };
    e.path = [{ x: e.goal.x, z: e.goal.z }]; e.pi = 0;
  }
}
/* send it to circle somewhere else */
function _rtsDroneAt(e, x, z) { e.orbit = { x: x, z: z }; e.order = 'orbit'; e.path = [{ x: x, z: z }]; e.pi = 0; e.goal = { x: x, z: z }; }

/* Is the opponent fighting half-blind? */
function _rtsAIHalfBlind() {
  if (_rtsFogged()) return true;
  var G = window._rtsG;
  for (var i = 0; i < G.ents.length; i++) { var e = G.ents[i]; if (!e.dead && e.side === 'player' && e.type === 'unit' && _rtsJams(e)) return true; }
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
    if (!t.moving) continue;
    var n = t.members.filter(function (m) { return !m.dead; }).length;
    if (n > bn) { bn = n; big = t; }
  }
  var c = big && _rtsTeamCentre(big);
  if (!c) return;
  for (var i = 0; i < G.ents.length; i++) {
    var u = G.ents[i];
    if (u.dead || u.side !== 'enemy' || u.type !== 'unit' || !_rtsOrbits(u)) continue;
    if (!u.orbit || Math.hypot(u.orbit.x - c.x, u.orbit.z - c.z) > RTS_TILE * 3) _rtsDroneAt(u, c.x, c.z);
  }
}
