/* core/monitor.js - the River Monitor: a gun that sits on the flats.

   The verb is THE LOW-WATER BOMBARDMENT. When the tide goes out (core/tide.js) the flats dry and
   every hull afloat has to keep off them: they are ground to a ship. The Monitor is
   flat-bottomed - it moves in its own domain, `shallow` (core/grid.js _rtsBlocked), in which any
   water cell is open whatever the tide, dry or not - so at low water it can sit on the flats
   right under a coast that every other ship has been pushed away from, and shell it. Being a
   ship, it is never swamped. It cannot go ashore.

   The Dominion's, from its Sub Pen: the Compact has the Cruiser for the long reach; this is the
   short, close, tide-riding answer.

   The opponent buys one once it has a yard, its own base is defended and the player has a
   building within the Monitor's reach of the water. IT COMES IN ON THE EBB AND LEAVES ON THE
   FLOOD: at low water (core/tide.js _rtsTideLow, the first flats dry) it is sent at the player's
   building nearest it that it can shell from the water; at high water it goes home to its yard,
   breaking off whatever it was doing. So the player's coast is shelled on the tide's clock, and
   the Monitor is not a lone gunboat at high water.

   AND IT SAILS WITH COMPANY. The Ebb team (rules/teams.js, `tide:true`) - a Monitor and two
   submarines - is raised only on the falling tide (_rtsAIEbb), when every member is already
   afloat and free, so it forms the moment it is raised and arrives on the flats near low water;
   the Repair Tender follows it as the fleet (core/repairtruck.js). Its quarry is `shore`
   (_rtsQuarryMatch): a building a Monitor can shell from its water. A Monitor in a team is the
   team's; the solo tick leaves it alone. */

var RTS_MONITOR = { every: 2, home: 6 };

/* Can a Monitor shell `b` from its water: is there a cell of the shallow domain within a cell of
   its reach? Tide-independent, since the shallow domain is. */
function _rtsShoreReach(b) {
  var reach = RTS_WEAPONS[rtsUnitDef('monitor').weapon].range / RTS_TILE - 1;
  var w = _rtsNearestOpen(_rtsTX(b.x), _rtsTX(b.z), Math.floor(reach), 'shallow');
  return !!w && Math.hypot(_rtsWX(w[0]) - b.x, _rtsWX(w[1]) - b.z) / RTS_TILE <= reach;
}

/* CAN THIS HULL'S GUN REACH IT FROM ITS WATER? Any hull, in its own domain and by its own gun -
   the test above, for the player's order: a Monitor sent at a building too far inland parked at
   the nearest water with its attack order and never fired, and nothing said why. A building's
   half-width is reach too, since the gun reaches its edge. */
function _rtsHullReaches(u, b) {
  var d = rtsUnitDef(u.def) || {}, w = d.weapon && RTS_WEAPONS[d.weapon];
  if (!d.sea || !w) return true;
  var sd = b.type === 'struct' ? rtsStructDef(b.def) : null;
  var reach = w.range / RTS_TILE - 1 + (sd ? Math.max(sd.w, sd.h) / 2 : 0);
  var o = _rtsNearestOpen(_rtsTX(b.x), _rtsTX(b.z), Math.ceil(reach), _rtsDomainOf(u));
  return !!o && Math.hypot(_rtsWX(o[0]) - b.x, _rtsWX(o[1]) - b.z) / RTS_TILE <= reach;
}
/* Is this hull aground - a deep-water hull on a flat the tide has dried (core/move.js holds it
   there until the flood)? The Monitor sits on the flats by design and is never aground. */
function _rtsAground(u) {
  var G = window._rtsG, i = _rtsIdx(_rtsTX(u.x), _rtsTX(u.z));
  return _rtsDomainOf(u) === 'sea' && !!(G.tideDry && G.tideDry[i]);
}
/* The player's building nearest the Monitor that it can shell from water: one with an open
   cell of the Monitor's water within a cell of its reach. */
function _rtsAIMonitorTarget(u) {
  var G = window._rtsG, from = u || _rtsShipyardOf(_rtsAIOn, null), best = null, bd = 1e9;
  if (!from) return null;
  for (var i = 0; i < G.ents.length; i++) {
    var b = G.ents[i];
    if (b.dead || b.side !== _rtsAIFoe() || b.type !== 'struct' || !_rtsShoreReach(b)) continue;
    var dd = Math.hypot(b.x - from.x, b.z - from.z);
    if (dd < bd) { bd = dd; best = b; }
  }
  return best;
}
function _rtsAIMonitorTick(dt) {
  var G = window._rtsG;
  G.ai.monT = (G.ai.monT || 0) + dt;
  if (G.ai.monT < RTS_MONITOR.every) return;
  G.ai.monT = 0;
  var low = _rtsTideLow(G);
  for (var i = 0; i < G.ents.length; i++) {
    var u = G.ents[i];
    if (u.dead || u.side !== _rtsAIOn || u.type !== 'unit' || u.def !== 'monitor' || u.sqd != null) continue;
    if (!low) {                                                   /* the flood: home to the yard */
      var y = _rtsShipyardOf(_rtsAIOn, u);
      if (!y || Math.hypot(y.x - u.x, y.z - u.z) <= RTS_MONITOR.home * RTS_TILE) continue;
      if (u.order === 'move' && u.goal && Math.hypot(u.goal.x - y.x, u.goal.z - y.z) < RTS_TILE * 3) continue;
      _rtsOrderMove(u, y.x, y.z, false);
      continue;
    }
    if (u.order === 'attack' && u.target && !u.target.dead) continue;
    var t = _rtsAIMonitorTarget(u);
    if (t) _rtsOrderAttack(u, t);
  }
}
/* The Ebb team's gate: the tide falling with the flats drying, and every member of the type
   afloat and free to be recruited right now - so a team that is raised forms at once and sails
   in the window, instead of holding the Monitor out of the war while it waits for a hull. */
function _rtsAIEbb(ty) {
  var G = window._rtsG, need = {}, k;
  if (!_rtsTideEbbing(G)) return false;
  for (k in ty.members) need[k] = ty.members[k];
  for (var i = 0; i < G.ents.length; i++) {
    var u = G.ents[i];
    if (u.dead || u.inside || u.side !== _rtsAIOn || u.type !== 'unit' || u.sqd != null || !need[u.def]) continue;
    if (!_rtsMission(u).recruitable) continue;
    need[u.def]--;
  }
  for (k in need) if (need[k] > 0) return false;
  return true;
}
