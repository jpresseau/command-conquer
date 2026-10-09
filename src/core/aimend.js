/* core/aimend.js - the opponent sends a battered vehicle home to be mended. Part of rts.core,
   the simulation.

   The opponent builds a Service Depot (rules/ai.js lists it in its order) and then never used
   it: a tank down to a sliver of armour stayed in its team and fought on until it died, so the
   depot was twelve hundred credits of nothing. A player does the obvious thing - pulls the
   wreck back, parks it on the pad, sends it out again full - and now so does the opponent:

     OUT     a vehicle under RTS_MEND_AT of its armour, with a powered depot to go to, leaves
             its team (or its escort) and drives to the pad - not one in a suicide team, whose
             whole point is that it does not turn round
     ON      it is parked there until it is back to RTS_MEND_DONE, which the depot's own
             repair does (core/units.js); a unit on the way shoots what shoots at it
     BACK    then it is idle again, and the teams recruit it like any other
     OFF     if the depot is lost or loses its power, the run is called off where it stands

   Asked once a second, in the order of the entity list, with no random draw: the same battle
   sends the same tanks home. */

var RTS_MEND_AT = 0.35;          /* share of its armour under which a vehicle goes home */
var RTS_MEND_DONE = 0.95;        /* ...and the share it is sent back out at */
var RTS_MEND_EVERY = 1;          /* seconds between looks */

/* The opponent's depot that can mend right now, or null. */
function _rtsAIDepot() {
  var G = window._rtsG;
  if (_rtsPowerFactor(_rtsAIOn) < 0.999) return null;
  for (var i = 0; i < G.ents.length; i++) {
    var e = G.ents[i];
    if (e.type === 'struct' && e.side === _rtsAIOn && !e.dead && !e.building && rtsStructDef(e.def).repairs) return e;
  }
  return null;
}
/* Which of the opponent's units are worth the trip: wheels and tracks on land, not a harvester
   (it has a refinery to go to and a job to do), not an aircraft. */
function _rtsMendable(u) {
  if (u.dead || u.type !== 'unit' || u.side !== _rtsAIOn || u.air || u.inside) return false;
  var d = rtsUnitDef(u.def);
  return !!d && d.kind === 'vehicle' && !d.sea && !d.harvest;
}

function _rtsAIMendTick(dt) {
  var G = window._rtsG;
  G.mendT = (G.mendT || 0) - dt;
  if (G.mendT > 0) return;
  G.mendT = RTS_MEND_EVERY;
  var dep = _rtsAIDepot(), i, u;
  for (i = 0; i < G.ents.length; i++) {
    u = G.ents[i];
    if (!_rtsMendable(u)) continue;
    if (u.mend != null) {
      /* ON / BACK / OFF */
      if (!dep || dep.id !== u.mend) { u.mend = null; continue; }
      if (u.hp >= u.maxHp * RTS_MEND_DONE) { u.mend = null; u.order = null; u.path = null; u.goal = null; continue; }
      if (!_rtsAtStruct(u, dep, rtsStructDef(dep.def).repairs * 0.8) && !u.path && !u.target) {
        var a = _rtsApproach(u, dep);
        _rtsOrderMove(u, a.x, a.z);
      }
      continue;
    }
    /* OUT */
    if (!dep || u.hp >= u.maxHp * RTS_MEND_AT) continue;
    var t = u.sqd != null && G.teams ? G.teams[u.sqd] : null;
    if (t && t.type.suicide) continue;
    if (t) _rtsTeamRemove(t, u);
    u.escort = null;
    u.mend = dep.id;
    var p = _rtsApproach(u, dep);
    _rtsOrderMove(u, p.x, p.z);
  }
}
