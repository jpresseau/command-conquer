/* ui/navigate.js - getting around the map with the mouse. Part of rts.ui.

   Moving the view was the arrow keys, holding the pointer against a screen edge, or clicking
   the radar; the wheel zoomed about the middle of the screen, a whole doubling a notch. Reported
   as "I must use the direction keys". So, the way the later RTS games do it:

     GRAB THE MAP       hold the right button (or the middle one) and drag: the ground under the
                        cursor stays under it, as a finger drag does on a phone. A right-click
                        that does NOT drag is still the order it always was - issued on release,
                        so the game can tell the two apart, but worked out AS PRESSED: what was
                        under the cursor and whether A was held then, not a moment later.
     ZOOM WHERE YOU     the wheel zooms toward the point under the cursor, not the middle of the
       POINT            screen.
     SMOOTHLY           the camera glides between the ladder's rungs a third of one a notch
                        (_rtsCellAt), and a trackpad or a pinch moves it continuously.
     + AND -            zoom from the keyboard, a notch a press, held to keep going.

   The radar, the arrows, the screen edge and Home all still move it as they did. */

var RTS_ZOOM_NOTCH = 1 / 3;      /* rungs a wheel notch moves the 3D zoom: three notches a doubling */
var RTS_ZOOM_RATE = 14;          /* how fast the glide closes on its target, per second */
var RTS_GRAB_SLOP = 5;           /* screen px a right-button press may wander and still click */
var RTS_ZOOM_HOLD = 0.3;         /* seconds a +/- key is held before it glides on: a tap is a notch */

/* Move the view so that the ground point W is drawn at the screen point (sx, sy). Every grab,
   pinch and zoom-to-point comes through here.

   IN CLOSED FORM, AT W'S OWN HEIGHT. The obvious way - read the ground under the point, move the
   view by the difference - is exact only on the flat: on a slope, moving the camera changes
   WHICH ground its ray meets, and it left the point up to 36 px off after one wheel notch on seed
   7's hillsides, the misses adding up through a glide. Repeating it does not help, because the
   pick bisects on height and, where a ray crosses a steep hill twice, can settle on the other
   crossing (it stalled 22 px off). An iterated solve on the projection was exact but could step
   W behind the eye on a big zoom in one frame. This is exact in one step: the camera is north-up
   and moving the focus moves everything with it, so the point at W's height under (sx, sy), less
   W, is how far the focus is out. */
function _rtsHoldGround(W, sx, sy) {
  var R = _rtsR;
  if (W) {
    var p = _r3dPlaneAt(sx, sy, _rtsElev(W.x, W.z));
    if (p) { R.focus.x += W.x - p.x; R.focus.z += W.z - p.z; }
  }
  _rtsClampFocus();
}

/* Where a zoom from the keyboard pivots: the middle of the screen, or the pointer while it is
   dragging the map, so the ground in its grip stays there. */
function _rtsZoomPivot() {
  var U = window._rtsUI, R = _rtsR;
  return U && U.grab && U.grab.moved ? { x: U.mouse.x, y: U.mouse.y } : { x: R.W / 2, y: R.H / 2 };
}

/* Zoom by `delta` rungs toward the screen point (sx, sy). */
function _rtsZoomToward(delta, sx, sy) {
  var R = _rtsR;
  if (!R || !delta) return;
  if (R.zt === undefined) R.zt = R.zi;
  R.zAnchor = { x: sx, y: sy };
  R.zt = Math.max(0, Math.min(RTS_ZOOMS.length - 1, R.zt + delta));
  /* three thirds of a rung are a rung, not 3.0000000000000004 of one */
  if (Math.abs(R.zt - Math.round(R.zt)) < 1e-6) R.zt = Math.round(R.zt);
}

/* The 3D glide, a frame at a time, keeping the anchored point where it is on screen. */
function _rtsZoomTick(dt) {
  var R = _rtsR;
  if (!R || R.zt === undefined || R.zf === undefined || R.zt === R.zf) return;
  var a = R.zAnchor || { x: R.W / 2, y: R.H / 2 }, w = _rtsGroundAt(a.x, a.y);
  var step = (R.zt - R.zf) * Math.min(1, dt * RTS_ZOOM_RATE);
  R.zf = Math.abs(R.zt - R.zf - step) < 0.004 ? R.zt : R.zf + step;
  _rtsApplyCamF();
  _rtsHoldGround(w, a.x, a.y);      /* exact through the projection, so no frame's miss adds up */
}

/* A wheel event, in rungs. In proportion - 100 px (or 3 lines) is RTS_ZOOM_NOTCH, and a
   trackpad's small deltas add up to the same. But A MOUSE CLICK IS A NOTCH whatever size the browser reports
   it: macOS gives one as 4.000244140625 px (or a multiple), which in proportion was a
   seventy-fifth of a doubling, and some wheels on Linux give 53. So an event with the Mac's
   pattern, or one of 30 px or more after a pause (`quiet`, from ui/input.js), is at least a notch; the
   stream a trackpad sends stays in proportion - except the same size again, or a whole multiple
   of it (`unit`, the size of the last such notch), which is the same wheel turning on. A
   trackpad PINCH arrives as a wheel with ctrlKey
   held, and follows the fingers the way a touchscreen pinch does. */
var RTS_WHEEL_MAC = 4.000244140625;
var RTS_WHEEL_MIN = 30;          /* px: the smallest wheel click (Windows at one line a notch is 33) */
var RTS_WHEEL_QUIET = 150;       /* ms without a wheel event that make the next one a fresh gesture */
function _rtsWheelRungs(e, quiet, unit) {
  /* deltaMode FIRST: Firefox turns a line-mode event into pixels if the page reads deltaY before
     it has asked what mode the event is in (its bug 1392460) */
  var mode = e.deltaMode, px = e.deltaY * (mode === 1 ? 33 : mode === 2 ? 400 : 1);
  if (!px) return 0;
  var notch = RTS_ZOOM_NOTCH, r = -px / 100 * notch, a = Math.abs(px), n = 1;
  /* `unit` is the size of the click that opened THIS gesture (ui/input.js), so the same wheel
     turning on - the same size again, or a whole multiple where the browser merged clicks - is a
     notch each; it goes with the gesture, and a trackpad cannot leave one behind for the next */
  var again = unit >= RTS_WHEEL_MIN && a >= unit - 1e-6 && Math.abs(a / unit - Math.round(a / unit)) < 1e-6;
  if (again) n = Math.round(a / unit);
  var click = mode !== 0 || a % RTS_WHEEL_MAC === 0 || (quiet && a >= RTS_WHEEL_MIN) || again;
  /* a trackpad PINCH arrives as a wheel with ctrlKey held, in small steps, and follows the
     fingers; a MOUSE click with Ctrl held is still a click */
  if (e.ctrlKey && !click) return Math.max(-1, Math.min(1, -px * 0.012));
  if (click) r = (px > 0 ? -1 : 1) * Math.max(Math.abs(r), n * notch);
  return Math.max(-0.75, Math.min(0.75, r));
}

/* GRABBING THE MAP. `start` on a right or middle press; `move` drags the view once the press
   has wandered past the slop; `end` says whether it was a drag, so a still right-click can go
   on to be the order it was (_rtsGrabClick).

   What the order would be is settled AT THE PRESS - the thing under the cursor and the attack-
   move key - because the old order was given on mousedown, and in the tenth of a second a click
   takes, a held arrow key scrolls the view the width of a tank and A can already be up. */
function _rtsGrabStart(button, mx, my, orbit) {
  var U = window._rtsUI;
  if (U.grab) return;              /* a second button while one grab is live: the first keeps it */
  /* `orbit`: this drag turns and leans the 3D camera instead of moving it (ui/orbit.js) */
  U.grab = { button: button, x0: mx, y0: my, lx: mx, ly: my, moved: false, orbit: !!orbit,
             hit: button === 2 ? _rtsPickAt(mx, my) : null, am: !!U.attackMove };
}
function _rtsGrabMove(mx, my) {
  var U = window._rtsUI, g = U && U.grab;
  if (!g) return false;
  if (!g.moved && Math.hypot(mx - g.x0, my - g.y0) <= RTS_GRAB_SLOP) return false;
  g.moved = true;
  if (g.orbit) {
    /* across turns - the world under the cursor going the way it is dragged - and up leans over */
    _rtsOrbitBy(-(mx - g.lx) * RTS_ORBIT_YAW, -(my - g.ly) * RTS_ORBIT_TILT);
    g.lx = mx; g.ly = my; U.orbitTo = null;
    return true;
  }
  /* the ground under the last point is brought under this one: the grip is kept, and at the
     map's edge, where the clamp stops the view, dragging back moves it again at once */
  _rtsHoldGround(_rtsGroundAt(g.lx, g.ly), mx, my);
  g.lx = mx; g.ly = my;
  if (_rtsR.zAnchor) _rtsR.zAnchor = { x: mx, y: my };   /* a glide under a grab pivots on the cursor */
  return true;
}
function _rtsGrabEnd() {
  var U = window._rtsUI, g = U && U.grab;
  if (U) U.grab = null;
  /* A RIGHT DRAG LET GO OVER THE SIDEBAR MUST NOT BE A RIGHT-CLICK ON IT. Windows fires the
     context menu AFTER the release, on whatever is under the pointer: a build cameo went on
     hold, the radar sent the army across the map. ui/input.js eats that one menu. */
  if (U && g && g.moved && g.button === 2) U.eatCtx = true;
  return g ? { moved: g.moved, button: g.button, x0: g.x0, y0: g.y0, hit: g.hit, am: g.am, orbit: g.orbit } : null;
}
/* A right press that did not drag: the repair/sell cursor dropped, or the order, as pressed. */
function _rtsGrabClick(g) {
  var U = window._rtsUI;
  if (U.mode) { rtsMode(U.mode); return; }
  var am = U.attackMove;
  U.attackMove = am || g.am;
  try { _rtsRightClick(g.x0, g.y0, g.hit); } finally { U.attackMove = am; }
}

/* + AND -, from the keyboard. A press is a notch at once - a tap has to do something - and a key
   HELD past RTS_ZOOM_HOLD goes on gliding (ui/camera.js _rtsPanTick). Ctrl/Cmd with them is the
   browser's own page zoom, and left to it. */
function _rtsZoomKeyDown(e, U) {
  var id = e.code || e.key, by = U.zkBy && U.zkBy[id];
  /* a repeat keeps the zoom its press started, even if Shift has changed its character since */
  var zk = (e.repeat && by) ? by : _rtsZoomKey(e);
  if (!zk || e.ctrlKey || e.metaKey) return false;
  if (!e.repeat || !by) {
    var pv = _rtsZoomPivot();
    U.zkHeld = 0; _rtsZoomToward((zk === 'zoom+' ? 1 : -1) * RTS_ZOOM_NOTCH, pv.x, pv.y);
  }
  U.keys[zk] = true; (U.zkBy || (U.zkBy = {}))[id] = zk;
  e.preventDefault();
  return true;                     /* claimed: not also a team key when a Swiss '+' repeats as '1' */
}
function _rtsZoomKeyUp(e, U) {
  var id = e.code || e.key, by = U.zkBy && U.zkBy[id], zk = by || _rtsZoomKey(e);
  if (by) delete U.zkBy[id];
  if (!zk) return;
  /* still held by another key? (Equal and NumpadAdd both zoom in) */
  var other = false;
  for (var k in U.zkBy) if (U.zkBy[k] === zk) other = true;
  if (!other) U.keys[zk] = false;
}
/* + and - zoom, BY THE CHARACTER TYPED: the key's place means nothing across layouts - on a Belgian
   or Turkish board the key US calls Equal types '-'. The number pad is the exception, by place.
   Which zoom a press started is kept per physical key (U.zkBy), because the character of a held
   key is not stable: '+' is Shift+'=' on a US board and Shift+'1' on a Swiss one, and letting go
   of Shift first releases a key that now reads '=' or '1' - which used to leave '+' held for ever. */
function _rtsZoomKey(e) {
  var c = e.code || '', k = e.key || '';
  if (k === '+' || k === '=' || c === 'NumpadAdd') return 'zoom+';
  if (k === '-' || c === 'NumpadSubtract') return 'zoom-';
  return null;
}

/* Three listeners on the window, kept in U.winL so rtsClose can take every one off again (see
   U.onWinUp in ui/input.js for what one forgotten listener cost).

   THE MENU AFTER A RIGHT DRAG. Windows fires contextmenu after the release, on whatever is under
   the pointer, so a drag let go over the sidebar right-clicked a build cameo (on hold) or the
   radar (an order across the map). _rtsGrabEnd arms U.eatCtx and the next menu is eaten in the
   capture phase, before any handler sees it. Any mousedown disarms it first, because Linux and
   the Mac fire the menu on the PRESS, and there the next one is a real right-click.

   KEYS HELD ACROSS A LOST FOCUS were never released: the window never hears the keyup, and an
   arrow or a zoom key ran on until it was pressed again. */
function _rtsNavBindWindow(U) {
  U.winL = [
    ['contextmenu', function (e) {
      var UU = window._rtsUI;
      if (UU && UU.eatCtx) { UU.eatCtx = false; e.preventDefault(); e.stopPropagation(); }
    }, true],
    ['mousedown', function () { var UU = window._rtsUI; if (UU) UU.eatCtx = false; }, true],
    ['blur', function () {
      var UU = window._rtsUI;
      if (!UU) return;
      /* an attack-move from the A KEY is let go; the touch bar's A-MOVE is a latch and stays */
      if (UU.keys.a) UU.attackMove = false;
      UU.keys = {}; UU.zkBy = {};
      if (UU.grab) _rtsGrabEnd();
    }, false]
  ];
  U.winL.forEach(function (l) { window.addEventListener(l[0], l[1], l[2]); });
}
