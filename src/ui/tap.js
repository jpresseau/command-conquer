/* ui/tap.js - A TAP ON A BUTTON PRESSES IT, whether or not the browser follows it with a click.

   Every button in the battle - the tabs, REPAIR and SELL, the top bar, the end card - acted on
   `click` alone, and on an iPhone the click a tap is meant to produce does not always come.
   Reported from an installed iPhone app in Survival: Ships switched, Vehicles did nothing, tap
   after tap. Chromium's touch emulation always sends the click, so no test here could see it.
   Safari withholds the click when it decides a tap only hovered, which it judges by what changed
   on the page while it dispatched the hover, and on this page the game changes something every
   frame. The bar over the battlefield met the same thing first and acts on touchend
   (ui/touchcmd.js); this does that for every button under the battle's root, once.

   So a finger that goes down and comes up on the same button, without sliding off it, presses
   that button here, and preventDefault stops the browser pressing it a second time. A button
   that handles its own touch says so by cancelling the touchend - a build tile that was held
   (ui/sidebar.js), the GFX button after a hold (ui/gfxstat.js) - and is left alone; the touch
   bar stops the event before it gets here. A slide is a scroll of the build grid, not a press.

   ONLY A FINGER THAT COMES DOWN DURING THE TAP MAKES IT A GESTURE. This used to ask for exactly
   one touch on the glass (`ev.touches.length === 1`), and from the installed iPhone app: after
   the phone was turned, the build buttons did nothing and stayed that way until a relaunch, with
   the screen looking right. The battlefield counts only the touches that began on it (ui/input.js,
   targetTouches) and the touch bar counts none; this counted every touch on the glass, so one
   that was already there - a palm on the edge, a thumb resting on the screen as the phone turned,
   a touch iOS stranded across the rotation and never ended - refused every tap after it, and
   Safari withheld the click as it does. A second finger that lands while the tap is down is
   still a pinch, not a press. RTS_TAP_STRICT is the old rule: e2e/tapglass's before-picture.

   SLID is judged against where the finger went down, not against the button's box: both ends
   are the touch's own coordinates, so nothing about how the page is laid out can disagree with
   them. And a tap whose end never came is dropped after RTS_TAP_STALE rather than standing in
   the way of the next one. */
var RTS_TAP_SLOP = 10;              /* px a finger may wander and still be a tap */
var RTS_TAP_STALE = 1000;           /* ms after which a tap that never ended is forgotten */

function _rtsTapBind(root) {
  var T = null;
  root.addEventListener('touchstart', function (ev) {
    var t = ev.changedTouches && ev.changedTouches[0];
    if (!t) return;
    if (T && ev.timeStamp - T.t0 > RTS_TAP_STALE) T = null;
    if (T) {
      if (t.identifier !== T.id) { _rtsTapNote('a second finger: ' + _rtsTapName(T.b) + ' not pressed'); T = null; }
      return;
    }
    var b = ev.target && ev.target.closest ? ev.target.closest('button') : null;
    if (!b || !root.contains(b)) return;
    if (window.RTS_TAP_STRICT && ev.touches.length !== 1) return;
    T = { b: b, id: t.identifier, x: t.clientX, y: t.clientY, t0: ev.timeStamp, n: ev.touches.length };
  }, { passive: true });
  root.addEventListener('touchmove', function (ev) {
    var t = T && _rtsTapTouch(ev, T.id);
    if (t && (Math.abs(t.clientX - T.x) > RTS_TAP_SLOP || Math.abs(t.clientY - T.y) > RTS_TAP_SLOP)) {
      _rtsTapNote('slid off ' + _rtsTapName(T.b)); T = null;
    }
  }, { passive: true });
  root.addEventListener('touchcancel', function (ev) {
    if (T && _rtsTapTouch(ev, T.id)) { _rtsTapNote(_rtsTapName(T.b) + ': the browser cancelled the touch'); T = null; }
  }, { passive: true });
  root.addEventListener('touchend', function (ev) {
    var P = T, t = P && _rtsTapTouch(ev, P.id), b = P && P.b;
    if (!t) return;                   /* another finger, or no tap in progress */
    T = null;
    if (ev.defaultPrevented) { _rtsTapNote(_rtsTapName(b) + ' handled its own touch'); return; }
    if (!b.isConnected || b.disabled) { _rtsTapNote(_rtsTapName(b) + (b.disabled ? ' is disabled' : ' was rebuilt')); return; }
    if (Math.abs(t.clientX - P.x) > RTS_TAP_SLOP || Math.abs(t.clientY - P.y) > RTS_TAP_SLOP) {
      _rtsTapNote('slid off ' + _rtsTapName(b)); return;
    }
    ev.preventDefault();
    _rtsTapNote('pressed ' + _rtsTapName(b) + (P.n > 1 ? ' (' + P.n + ' touches on the glass)' : ''));
    b.click();
  }, { passive: false });
}
function _rtsTapTouch(ev, id) {
  var ts = ev.changedTouches || [];
  for (var i = 0; i < ts.length; i++) if (ts[i].identifier === id) return ts[i];
  return null;
}
/* WHAT BECAME OF THE LAST TAP ON A BUTTON, for the GFX readout's third line (ui/gfxstat.js): a
   phone has no console, and "the buttons do nothing" has had more than one cause. */
var _RTS_TAPLOG = { s: '' };
function _rtsTapNote(s) { _RTS_TAPLOG.s = s; }
function _rtsTapName(b) {
  var nm = b && b.querySelector && b.querySelector('.nm');      /* a build tile: its name, not its price */
  return ((nm && nm.textContent) || (b && (b.textContent || b.title || b.id)) || '?').replace(/\s+/g, ' ').trim().slice(0, 18);
}
function _rtsTapLine() { return _RTS_TAPLOG.s ? '\ntap: ' + _RTS_TAPLOG.s : ''; }
