/* core/waypoints.js - the named places on the map that a team script steers by (TEAMTYPE.CPP).
   Part of rts.core, the simulation.

   Split out of core/teams.js when that file passed the 500-line ceiling unit/layout enforces.
   A clean seam: nothing here knows what a team is, and the only thing teams ask of it is where
   a name points. */

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
