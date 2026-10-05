/* core/jammer.js - the Jammer: a column the enemy cannot find.

   The verb is CONCEALMENT. Parked - RTS_JAM.park seconds without moving - it throws a field
   RTS_JAM.r cells round itself, and inside it its side's UNITS are JAMMED (buildings are not:
   a base cannot be hidden):

     UNSEEN      a jammed unit is not seen by the other side unless something of that side is
                 within RTS_JAM.close cells of it, or a Spotter of that side sees it - the one
                 eye a jammer cannot blind (core/spotter.js)
     UNTARGETED  nothing finds it to shoot at by itself from further off, and no team of the
                 opponent's picks it as its target (_rtsFindTarget, _rtsTeamTarget)
     FIRING      gives it away: a unit that has fired in the last RTS_JAM.fired seconds is not
                 jammed - the muzzle flash is seen whatever the radio does
     THE RADAR   shows static over an enemy jammer's field (ui/hud.js)

   Moving, the field is down. G.jam holds, per side, the fields that are up this tick - plain
   numbers, rebuilt once a tick (_rtsJamTick).

   The opponent buys one once the player has dug in - RTS_JAM.digIn armed buildings - and has an
   army to hide, and parks it in the middle of its largest team on the march. */

var RTS_JAM = { r: 4, close: 2, park: 2, fired: 3, digIn: 2, every: 2 };

function _rtsJams(u) { return !!(rtsUnitDef(u.def) || {}).jams; }
function _rtsJamTick(dt) {
  var G = window._rtsG, J = { player: [], enemy: [] };
  for (var i = 0; i < G.ents.length; i++) {
    var u = G.ents[i];
    if (u.dead || u.inside || u.type !== 'unit' || !J[u.side] || !_rtsJams(u)) continue;
    var moving = u.path && u.pi < u.path.length;
    u.jamT = moving ? 0 : (u.jamT || 0) + dt;
    if (u.jamT >= RTS_JAM.park) J[u.side].push({ x: u.x, z: u.z, r: RTS_JAM.r * RTS_TILE });
  }
  G.jam = J;
}
/* Is `o` inside a field of its own side's, and quiet? */
function _rtsJammed(o) {
  var G = window._rtsG, L = G && G.jam && G.jam[o.side];
  if (!L || !L.length || o.type !== 'unit') return false;
  if (o.firedT != null && G.t - o.firedT < RTS_JAM.fired) return false;
  for (var i = 0; i < L.length; i++) if (Math.hypot(o.x - L[i].x, o.z - L[i].z) <= L[i].r) return true;
  return false;
}
/* Does the jamming hide `o` from an eye of `side` at (x, z)? */
function _rtsJamHides(o, side, x, z) {
  if (!_rtsJammed(o)) return false;
  if (Math.hypot(o.x - x, o.z - z) <= RTS_JAM.close * RTS_TILE) return false;
  return !_rtsSpotted(o, side);
}
/* ...from every eye `side` has: hidden unless something of it stands close, or a Spotter sees it. */
function _rtsJamHidden(o, side) {
  if (!_rtsJammed(o) || _rtsSpotted(o, side)) return false;
  var G = window._rtsG, r = RTS_JAM.close * RTS_TILE;
  for (var i = 0; i < G.ents.length; i++) {
    var e = G.ents[i];
    if (!e.dead && e.side === side && !e.inside && Math.hypot(e.x - o.x, e.z - o.z) <= r) return false;
  }
  return true;
}

/* Whether the radar shows static over an enemy field (ui/hud.js): only where the radar reads at
   all - the field's centre explored. Under the unexplored shroud a disc of static marked the
   army the Jammer was hiding, from across the map. */
function _rtsRadarStaticShown(G, f) {
  var tx = _rtsTX(f.x), tz = _rtsTX(f.z);
  return _rtsInB(tx, tz) && !!(G.mapped && G.mapped[_rtsIdx(tx, tz)]);
}

/* The opponent's jammer: parked in the middle of its largest team on the march. */
function _rtsAIJamTick(dt) {
  var G = window._rtsG, big = null, bn = 0, id;
  G.ai.jamT = (G.ai.jamT || 0) + dt;
  if (G.ai.jamT < RTS_JAM.every) return;
  G.ai.jamT = 0;
  /* the largest team ON LAND: counted by its land members, and never a crossing. A fleet or a
     landing party was once the largest team moving, and the jammer was sent onto the water -
     to park on the nearest beach, hiding nothing, while the army it was bought for marched bare. */
  for (id in G.teams) {
    var t = G.teams[id];
    if (!t.moving || (t.type && t.type.crossing)) continue;
    var n = t.members.filter(function (m) { var md = rtsUnitDef(m.def) || {}; return !m.dead && !md.sea && !md.air; }).length;
    if (n > bn) { bn = n; big = t; }
  }
  var c = big && _rtsTeamCentre(big);
  if (!c) return;
  for (var i = 0; i < G.ents.length; i++) {
    var u = G.ents[i];
    if (u.dead || u.inside || u.side !== 'enemy' || u.type !== 'unit' || !_rtsJams(u) || u.mend != null) continue;   /* mend: core/aimend.js */
    if (Math.hypot(c.x - u.x, c.z - u.z) > RTS_TILE * 2.5) _rtsOrderMove(u, c.x, c.z, false);
  }
}
/* Has the player dug in? Armed buildings of theirs. */
function _rtsPlayerDefences() {
  var G = window._rtsG, n = 0;
  for (var i = 0; i < G.ents.length; i++) {
    var e = G.ents[i];
    if (!e.dead && e.side === 'player' && e.type === 'struct' && !e.building && (rtsStructDef(e.def) || {}).weapon) n++;
  }
  return n;
}
