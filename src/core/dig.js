/* core/dig.js - DIGGING IN: the Compact's Rifle Squad deploys behind sandbags.

   DEPLOY (D, or the sidebar's button) on a Compact Rifle Squad - the rules say which army, `dig`
   on the unit - digs it in where it stands, and DEPLOY again climbs out. Dug in, it cannot move
   (core/units.js does not steer it or chase), takes RTS_DIG.armor of every hit, and its gun hits
   RTS_DIG.fire as hard and reloads in RTS_DIG.rof of the time - the squad that holds a line
   rather than the one that takes it. Any move order climbs it out first, so a player who forgot
   is never left with a squad that will not go (core/orders.js). render3d/dig3d.js draws the
   sandbags, and the men crouched behind them. */
var RTS_DIG = { armor: 0.5, fire: 1.4, rof: 0.75 };

function _rtsCanDig(e) {
  var d = e && e.type === 'unit' && rtsUnitDef(e.def);
  return !!(d && d.dig && !e.dead && !e.inside && rtsHouseSide(e.side) === d.dig);
}
function _rtsDigToggle(e) {
  if (!_rtsCanDig(e)) return false;
  e.dug = e.dug ? 0 : 1;
  e.order = null; e.path = null; e.goal = null; e.wq = null;
  if (e.side === 'player' && typeof _rtsSfx === 'function') _rtsSfx('place', e.x, e.z);
  return true;
}
