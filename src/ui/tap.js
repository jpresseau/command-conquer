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
   bar stops the event before it gets here. A slide is a scroll of the build grid, not a press,
   and two fingers are a pinch. */
var RTS_TAP_SLOP = 10;              /* px a finger may wander and still be a tap */

function _rtsTapBind(root) {
  var T = null;
  root.addEventListener('touchstart', function (ev) {
    var b = ev.target && ev.target.closest ? ev.target.closest('button') : null;
    var t = ev.changedTouches && ev.changedTouches[0];
    T = (b && t && ev.touches.length === 1 && root.contains(b)) ? { b: b, id: t.identifier, x: t.clientX, y: t.clientY } : null;
  }, { passive: true });
  root.addEventListener('touchmove', function (ev) {
    var t = T && _rtsTapTouch(ev, T.id);
    if (t && (Math.abs(t.clientX - T.x) > RTS_TAP_SLOP || Math.abs(t.clientY - T.y) > RTS_TAP_SLOP)) T = null;
  }, { passive: true });
  root.addEventListener('touchcancel', function () { T = null; }, { passive: true });
  root.addEventListener('touchend', function (ev) {
    var t = T && _rtsTapTouch(ev, T.id), b = T && T.b;
    T = null;
    if (!t || ev.defaultPrevented || !b.isConnected || b.disabled) return;
    var r = b.getBoundingClientRect();
    if (t.clientX < r.left - RTS_TAP_SLOP || t.clientX > r.right + RTS_TAP_SLOP ||
        t.clientY < r.top - RTS_TAP_SLOP || t.clientY > r.bottom + RTS_TAP_SLOP) return;   /* slid off it */
    ev.preventDefault();
    b.click();
  }, { passive: false });
}
function _rtsTapTouch(ev, id) {
  var ts = ev.changedTouches || [];
  for (var i = 0; i < ts.length; i++) if (ts[i].identifier === id) return ts[i];
  return null;
}
