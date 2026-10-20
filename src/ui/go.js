/* ui/go.js - GOING TO WHAT WAS SAID. The message line, tapped, looks at the place its line was
   about and selects the thing it named (core/ore.js _rtsSay carries both, core/idle.js and
   core/response.js give them); Space looks at the last attack on the player's base; the radar
   rings that attack for RTS_ALERT_RING seconds (G.alert). Part of rts.ui, which owns the DOM. */

var RTS_ALERT_RING = 8;

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
  if (!G || !G.msgAt || !(G.msgT > 0)) return false;
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
