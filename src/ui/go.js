/* ui/go.js - GOING TO WHAT WAS SAID. The message line, tapped, looks at the place its line was
   about and selects the thing it named (core/ore.js _rtsSay carries both, core/idle.js and
   core/response.js give them); Space looks at the last attack on the player's base; the radar
   rings that attack for RTS_ALERT_RING seconds (G.alert). Part of rts.ui, which owns the DOM. */

var RTS_ALERT_RING = 8;
var RTS_ALERT_KEEP = 30;         /* seconds the quiet message line still offers the last alert */

/* WHAT THE MESSAGE LINE SHOWS. The game has one line, and the next thing said replaces it: "Your
   base is under attack!" lasted until a building finished, and its tap went with it - on a phone,
   which has no Space, that was the only way to the attack. So while nothing is being said the
   line keeps offering the last alert, for RTS_ALERT_KEEP seconds: tap it (or Space) to look. Not
   while something is armed (`busy`): a placement's or a mode's banner has the same slot. */
function _rtsMsgShown(G, touch, busy) {
  if (G.msgT > 0) return { text: G.msg || '', go: !!G.msgAt, alert: false };
  var A = G.alert, age = A ? G.t - A.t : -1;
  if (A && !busy && !G.over && age >= 0 && age <= RTS_ALERT_KEEP) return { text: '\u26a0 Last alert \u2014 ' + (touch ? 'tap' : 'Space') + ' to look', go: true, alert: true };
  return { text: '', go: false, alert: false };
}
/* REPAIR and SELL are modes: the next tap on a building is theirs. A mouse has the crosshair to
   say so; a phone had only the lit button, down in the bar - and SELL stayed armed after a sale,
   so the next tap on a building, meant to select it, sold it. The banner says the mode is on. */
function _rtsModeHint(mode, touch) {
  var off = touch ? 'tap ' + (mode === 'sell' ? 'SELL' : 'REPAIR') + ' to cancel' : 'Esc to cancel';
  return (mode === 'sell' ? (touch ? 'SELL: tap a building to sell it' : 'SELL: click a building to sell it')
                          : (touch ? 'REPAIR: tap a damaged building' : 'REPAIR: click a damaged building')) + '  \u00b7  ' + off;
}

/* Put (x, z) at the centre of what is on screen. The focus is not that centre - a tilted camera
   looks a fifth of a half-height past it (render/camera.js _rtsViewSpan) - so the focus moves by
   the gap between the point and the centre now, and the clamp keeps the view on the map. */
function _rtsLookAt(x, z) {
  var R = _rtsR, vs = _rtsViewSpan();
  R.focus.x += x - vs.cx; R.focus.z += z - vs.cz;
  _rtsClampFocus();
}
/* the message line's tap: true when it had somewhere to go */
function rtsMsgGo() {
  var G = window._rtsG;
  if (!G) return false;
  if (!(G.msgT > 0)) return _rtsMsgShown(G, false, false).alert ? _rtsGoAlert() : false;   /* the quiet line's last alert */
  if (!G.msgAt) return false;
  _rtsLookAt(G.msgAt.x, G.msgAt.z);
  if (G.msgSel && !G.msgSel.dead) G.sel = [G.msgSel];
  return true;
}
/* Space: the last attack on the base, however long ago */
function _rtsGoAlert() {
  var G = window._rtsG;
  if (!G || !G.alert) return false;
  _rtsLookAt(G.alert.x, G.alert.z);
  return true;
}
/* on the radar (ui/hud.js _rtsDrawMini): a ring widening out of the spot, twice a second */
function _rtsDrawAlertRing(g, sc) {
  var G = window._rtsG, A = G && G.alert;
  if (!A || G.t - A.t > RTS_ALERT_RING) return;
  var ph = (G.t - A.t) % 1, cx = (A.x / RTS_TILE + RTS_N / 2) * sc, cz = (A.z / RTS_TILE + RTS_N / 2) * sc;
  g.lineWidth = 2; g.strokeStyle = 'rgba(255,96,72,' + (1 - ph * 0.8).toFixed(2) + ')';
  g.beginPath(); g.arc(cx, cz, 3 + ph * 9, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 1.5; g.strokeStyle = 'rgba(255,96,72,0.9)';
  g.beginPath(); g.arc(cx, cz, 3, 0, Math.PI * 2); g.stroke();
}
