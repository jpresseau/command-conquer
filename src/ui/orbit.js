/* ui/orbit.js - turning and leaning the 3D camera. Part of rts.ui; the camera's side of it is
   render3d/cam3d.js.

   The 3D camera faced north at one lean for as long as it existed, so there was no looking
   behind the war factory or down the valley the enemy was coming up. The later RTS games let
   you swing it round and lean it over; so does this, in the 3D mode:

     MIDDLE-DRAG        across turns the camera, up and down leans it - or ALT + RIGHT-DRAG, for
                        a mouse or a trackpad without a middle button (a still Alt+right-click is
                        still the order). It is a grab of the ordinary kind (ui/navigate.js), so
                        the pointer is captured and the menu after a right drag is eaten the same.
     MIDDLE-CLICK       or the compass: back to north up at the usual lean, gliding there.
     Q / E              turn, held; PAGE UP / PAGE DOWN lean.
     TWO FINGERS        twisted, on a phone - past a small threshold, so a pinch does not wander.

   Every turn and lean pivots on the ground under a screen point - the middle of the screen, or
   the fingers - and holds it there (_rtsHoldGround), so the thing being looked at stays put. */

var RTS_ORBIT_YAW = 0.0065;      /* radians of turn a pixel of drag */
var RTS_ORBIT_TILT = 0.004;      /* radians of lean a pixel of drag */
var RTS_ORBIT_KEY = 1.6;         /* radians a second of turn, Q or E held */
var RTS_ORBIT_LEANKEY = 0.7;     /* radians a second of lean, Page Up or Page Down held */
var RTS_TWIST_START = 0.15;      /* radians two fingers must twist before the map turns */

/* Turn by dyaw and lean by dtilt, holding the ground under (sx, sy) - the middle by default. */
function _rtsOrbitBy(dyaw, dtilt, sx, sy) {
  var R3 = window._R3D, R = _rtsR;
  if (!R3 || !R || !_rtsIn3D() || (!dyaw && !dtilt)) return;
  if (sx === undefined) { sx = R.W / 2; sy = R.H / 2; }
  var W = _rtsGroundAt(sx, sy);
  _r3dCamSet(R3.yaw + dyaw, R3.tilt + dtilt);
  _rtsHoldGround(W, sx, sy);
}

/* Back to north up at the usual lean, gliding (_rtsOrbitTick). */
function _rtsOrbitReset() {
  var U = window._rtsUI;
  if (U && _rtsIn3D()) U.orbitTo = { yaw: 0, tilt: R3D_TILT };
}

/* A frame: the glide back, the keys, and the compass's needle. */
function _rtsOrbitTick(dt) {
  var U = window._rtsUI, R3 = window._R3D, k = U && U.keys;
  if (!U || !R3) return;
  var on = _rtsIn3D();
  if (on && k) {
    var dy = ((k.q ? 1 : 0) - (k.e ? 1 : 0)) * RTS_ORBIT_KEY * dt;
    var dl = ((k.pageup ? 1 : 0) - (k.pagedown ? 1 : 0)) * RTS_ORBIT_LEANKEY * dt;
    if (dy || dl) { U.orbitTo = null; _rtsOrbitBy(dy, dl); }
  }
  if (on && U.orbitTo) {
    var t = U.orbitTo, a = Math.min(1, dt * 10);
    var ey = Math.atan2(Math.sin(t.yaw - R3.yaw), Math.cos(t.yaw - R3.yaw)), et = t.tilt - R3.tilt;
    if (Math.abs(ey) < 1e-3 && Math.abs(et) < 1e-3) { _rtsOrbitBy(ey, et); U.orbitTo = null; }
    else _rtsOrbitBy(ey * a, et * a);
  }
  /* the needle points where north is on screen: the yaw's own angle, turned back */
  var c = document.getElementById('rtsCompass');
  if (c) {
    var show = on ? '' : 'none';
    if (c.style.display !== show) c.style.display = show;
    /* compared against what was last written, not read back: the browser normalises the string */
    var tr = 'rotate(' + (-(R3.yaw || 0)).toFixed(4) + 'rad)', n = c.firstChild;
    if (n && c._tr !== tr) { n.style.transform = tr; c._tr = tr; }
  }
}

/* Two fingers twisting, from the pinch in ui/input.js: T carries the gesture's state, `mid` is
   the fingers' midpoint. The map turns with the fingers once they have twisted far enough. */
function _rtsTwist(e, T, mid) {
  if (!_rtsIn3D() || e.targetTouches.length < 2) return;
  var a = e.targetTouches[0], b = e.targetTouches[1];
  var ang = Math.atan2(b.clientY - a.clientY, b.clientX - a.clientX);
  if (T.ang === undefined || T.ang === null) { T.ang = ang; T.tw = 0; T.twOn = false; return; }
  var d = Math.atan2(Math.sin(ang - T.ang), Math.cos(ang - T.ang));
  T.ang = ang;
  T.tw = (T.tw || 0) + d;
  if (!T.twOn && Math.abs(T.tw) < RTS_TWIST_START) return;
  /* the whole twist so far the moment it starts, so the map catches up with the fingers */
  var turn = T.twOn ? d : T.tw;
  T.twOn = true;
  /* fingers turning clockwise on screen turn the map clockwise under them */
  _rtsOrbitBy(-turn, 0, mid.x, mid.y);
}
