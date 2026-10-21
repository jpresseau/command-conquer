/* ui/repeat.js - REPEAT: a unit line that keeps building. Part of rts.ui, which owns the DOM.

   A long battle is a long run of clicks on the same tank. ↻ REPEAT, beside REPAIR and SELL, sets
   the line of the tab in view (S.rep[cat]) to start its unit again each time the last copy is
   done (core/production.js); the tile being repeated wears ↻. It is the line's, not the unit's:
   queue something else on a repeating line and that is what repeats next. Cancelling the job
   stops the line until something is queued again. The Build tab has no repeat - a building
   waits for its placement. Kept on the side, so a save carries it. */
function rtsRepeatToggle(cat) {
  var G = window._rtsG, U = window._rtsUI;
  if (!G || !U) return false;
  cat = cat || U.cat;
  if (!cat || cat === 'struct') return false;
  var S = G.sides.player;
  S.rep = S.rep || {};
  S.rep[cat] = !S.rep[cat];
  if (!S.rep[cat]) delete S.rep[cat];
  var name = (RTS_TABS.filter(function (t) { return t[0] === cat; })[0] || [cat, cat])[1];
  _rtsSay(S.rep && S.rep[cat] ? name + ' repeat on - the line builds its unit again when one is done.' : name + ' repeat off.');
  if (typeof _rtsSfx === 'function') _rtsSfx('click');
  _rtsRepeatSync();
  return !!(S.rep && S.rep[cat]);
}
/* the button for the tab in view, and the ↻ on the tile being repeated */
function _rtsRepeatSync() {
  var G = window._rtsG, U = window._rtsUI, b = document.getElementById('rtsRepeatBtn');
  if (!G || !U || !b) return;
  var S = G.sides.player, cat = U.cat, on = !!(S.rep && S.rep[cat]);
  var hide = !cat || cat === 'struct';
  if (b.hidden !== hide) b.hidden = hide;
  var cls = on ? 'on' : '';
  if (b.className !== cls) b.className = cls;
  var q = S.q[cat], key = on && q ? q.key : null;
  for (var k in (U.btns || {})) {
    var t = U.btns[k], mark = t.querySelector('.rep');
    if (k === key && !mark) { mark = document.createElement('span'); mark.className = 'rep'; mark.textContent = '↻'; t.appendChild(mark); }
    else if (k !== key && mark) mark.remove();
  }
}
