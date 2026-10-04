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
   building within the Monitor's reach of the water. It sends it at that building, the one
   nearest the Monitor, whenever it is idle. */

var RTS_MONITOR = { every: 2 };

/* The player's building nearest the Monitor that it can shell from water: one with an open
   cell of the Monitor's water within a cell of its reach. */
function _rtsAIMonitorTarget(u) {
  var G = window._rtsG, d = rtsUnitDef('monitor'), reach = RTS_WEAPONS[d.weapon].range / RTS_TILE - 1;
  var from = u || _rtsShipyardOf('enemy', null), best = null, bd = 1e9;
  if (!from) return null;
  for (var i = 0; i < G.ents.length; i++) {
    var b = G.ents[i];
    if (b.dead || b.side !== 'player' || b.type !== 'struct') continue;
    var w = _rtsNearestOpen(_rtsTX(b.x), _rtsTX(b.z), Math.floor(reach), 'shallow');
    if (!w || Math.hypot(_rtsWX(w[0]) - b.x, _rtsWX(w[1]) - b.z) / RTS_TILE > reach) continue;
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
  for (var i = 0; i < G.ents.length; i++) {
    var u = G.ents[i];
    if (u.dead || u.side !== 'enemy' || u.type !== 'unit' || u.def !== 'monitor') continue;
    if (u.order === 'attack' && u.target && !u.target.dead) continue;
    var t = _rtsAIMonitorTarget(u);
    if (t) _rtsOrderAttack(u, t);
  }
}
