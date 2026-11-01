/* render3d/lost3d.js - when the GPU takes the 3D view away, and how it comes back.

   THE REPORT: "the game doesn't work when I switch from landscape to portrait". On the owner's
   phone the battlefield went blank and stayed blank, while the top bar and the sidebar - which
   are the DOM and a 2D canvas - went on working. Turning a phone reallocates every full-screen
   buffer at the new shape, and that is exactly when a phone reclaims GPU memory: the WebGL
   context is LOST. A lost context draws nothing and every call on it is a silent no-op, so
   nothing threw, the clock ran on, and the picture never came back - because a browser hands a
   lost context back only to a page that cancelled its `webglcontextlost` event, and nothing
   here did. e2e/ctxlost reproduces it with WEBGL_lose_context: rotate, lose, restoreContext(),
   and with this file switched off (RTS_LOSS_OFF) the context stays lost and the stage's flat
   grey shows where the battlefield was, for as long as the page is open.

   So, three things:
   - THE LOSS IS CANCELLED, which is what asks the browser for the context back.
   - WHILE IT IS GONE THE 3D FRAME DRAWS NOTHING (_r3dFrame returns at once) rather than building
     programs and buffers on a dead context. A program built there "fails to link" and throws,
     and sixty failing frames in a row stop the loop for good (RTS_LOOP_GIVEUP, ui/camera.js).
   - IT COMES BACK. On `webglcontextrestored`, or after R3D_LOST_WAIT if the browser never says,
     the 3D view starts again from nothing - on the same canvas if the context was handed back,
     on a fresh one in its place if it was not. Starting from nothing is safe because every GPU
     object this renderer owns hangs off window._R3D and is built lazily on first use, exactly
     as on the first frame of a session; nothing else holds one. What the PLAYER had is carried
     across: where the camera looks, and the tier and resolution in force. */

var R3D_LOST_WAIT = 1500;     /* ms to wait for the browser's own restore before starting afresh */
var R3D_LOST_MAX = 12000;     /* ...doubling while a fresh start keeps failing, up to this */
/* what the renderer carries across a fresh start, besides the camera and the tier, which have
   setters of their own: AUTO's state (quality3d.js), the resolution step (pace3d.js), and the
   sun (sky3d.js), which the next frame sets again but the camera's highlight is turned from */
var R3D_LOST_KEEP = ['qAuto', 'dyn', 'dynA', 'dynBound', 'sun', 'sunB'];
/* how often, for the GFX readout (ui/gfxstat.js) and the specs: losses, recoveries, and how many
   of those needed a fresh canvas */
var _R3D_LOSS = { lost: 0, back: 0, fresh: 0 };

/* Called by _r3dInit for every renderer it makes. ONCE PER CANVAS: the listeners find the renderer
   through window._R3D when they fire, so a canvas restored in place keeps one pair. */
function _r3dWatchLoss(R3) {
  var cv = R3.cv;
  if (!cv || cv._r3dWatched) return;
  cv._r3dWatched = true;
  cv.addEventListener('webglcontextlost', function (e) {
    if (window.RTS_LOSS_OFF) return;               /* the before-picture: nobody asks for it back */
    e.preventDefault();
    var R = window._R3D;
    if (R && R.cv === cv && !R.lost) _r3dLoseMark(R);
  }, false);
  cv.addEventListener('webglcontextrestored', function () {
    var R = window._R3D;
    if (R && R.cv === cv) R.restored = true;
  }, false);
}
function _r3dLoseMark(R3) {
  R3.lost = true; R3.restored = false; R3.lostAt = _r3dNow();
  _R3D_LOSS.lost++;
}

/* Every 3D frame, before anything touches GL: true while there is nothing to draw with. Asks the
   context itself as well as the event, because the event is a task of its own and a frame can
   run between the loss and its delivery. */
function _r3dLostTick(R3) {
  if (window.RTS_LOSS_OFF) return false;
  if (!R3.lost) {
    if (!R3.gl.isContextLost()) return false;
    _r3dLoseMark(R3);
  }
  var wait = Math.min(R3D_LOST_MAX, R3D_LOST_WAIT * Math.pow(2, R3.tries || 0));
  if (!R3.restored && _r3dNow() - R3.lostAt < wait) return true;
  return !_r3dRecover(R3);
}

/* Start the 3D view again in place of the lost one `old`. True when there is a live renderer in
   window._R3D afterwards; false when there is not yet, and `old` is put back to wait longer. */
function _r3dRecover(old) {
  var cv = old.cv, nc = null;
  if (!old.restored && cv.parentNode) {
    /* never handed back: a canvas of our own in its slot, carrying everything the shell and
       _r3dStart put on the old one - its id is how _r3dInit finds it */
    nc = document.createElement('canvas');
    for (var i = 0; i < cv.attributes.length; i++) nc.setAttribute(cv.attributes[i].name, cv.attributes[i].value);
    cv.parentNode.replaceChild(nc, cv);
  }
  window._R3D = null;
  var ok = false;
  try { ok = _r3dStart(); } catch (e) { ok = false; }
  var R3 = window._R3D;
  if (!ok || !R3 || R3.gl.isContextLost()) {
    if (nc && nc.parentNode) nc.parentNode.replaceChild(cv, nc);
    window._R3D = old;
    old.restored = false; old.lostAt = _r3dNow(); old.tries = (old.tries || 0) + 1;
    return false;
  }
  _R3D_LOSS.back++;
  if (nc) _R3D_LOSS.fresh++;
  R3D_LOST_KEEP.forEach(function (k) { if (old[k] !== undefined) R3[k] = old[k]; });
  _r3dCamSet(old.yaw, old.tilt);
  if (old.qLevel !== undefined && old.qLevel !== R3.qLevel) _r3dQualityApply(old.qLevel);
  _r3dResize();                                    /* at the resolution step just carried */
  return true;
}

/* The readout's note (ui/gfxstat.js): nothing until the first loss, then how many came back. */
function _r3dLossText() {
  var L = _R3D_LOSS;
  return L.lost ? '   GPU lost ' + L.lost + ', back ' + L.back : '';
}
