/* ui/allymenu.js - the 🤝 ALLY button beside REPAIR and SELL, in a battle with a computer ally, and
   its three orders (core/allycmd.js). Part of rts.ui.

   ATTACK HERE sends the ally to the middle of the player's view rather than asking for a click: on
   a phone a second tap on the map is a selection, and the view's centre is where the player is
   already looking. */

function rtsAllyMenu() {
  var m = document.getElementById('rtsAllyMenu');
  if (m) m.hidden = !m.hidden;
}
function rtsAllyOrder(kind) {
  var R = window._rtsR, ok;
  if (kind === 'attack') ok = !!R && _rtsAllyCommand('attack', R.focus.x, R.focus.z);
  else ok = _rtsAllyCommand(kind);
  if (!ok && typeof _rtsSfx === 'function') _rtsSfx('deny');
  var m = document.getElementById('rtsAllyMenu');
  if (m) m.hidden = true;
  return ok;
}
