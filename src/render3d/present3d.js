/* render3d/present3d.js - the 3D view's lifecycle: starting it, presenting its canvas, and
   sizing the buffer.

   Split out of gl3d.js, which owns the GL context, the programs and the projection contract -
   this file owns whether and how the rendered buffer reaches the SCREEN. That stopped being
   one line when the canvas became a presented layer: the blit that used to copy the buffer
   into the overlay is gone (see render/frame.js), so presentation now means adoption into
   the shell's rebuilt DOM, a display flip, a CSS box, and a scale - all of which live here. */

/* THE GAME IS 3D, and only 3D: there is no flat battlefield to fall back to. Called once per
   match from rtsOpen, before the first frame; false when the browser gives no WebGL, and rtsOpen
   then refuses the match with a reason rather than showing a black screen. */
function _r3dStart() {
  var R3 = window._R3D || _r3dInit();
  if (!R3) return false;
  R3.on = true;
  /* the tier the player chose, or AUTO's starting one (render3d/quality3d.js) */
  if (!R3.q) { var qw = _r3dQualityWant(); _r3dQualityApply(qw === 'medium' ? 1 : qw === 'low' ? 2 : 0); }
  /* ADOPTION, because the shell rebuilds its DOM every match while this canvas - and the GL
     context, buffers and textures that live on it - persists across them. From the second
     match on, R3.cv is a DETACHED element and the #rtsCv3d in the document is a fresh blank
     one. A context cannot move between canvases, so the persistent canvas is swapped back into
     the fresh shell's slot. */
  var slot = document.getElementById('rtsCv3d');
  if (slot && slot !== R3.cv && slot.parentNode) slot.parentNode.replaceChild(R3.cv, slot);
  /* A LAYER, under the overlay canvas: the compositor presents the world directly rather than the
     frame walk copying it out with a full-resolution drawImage every frame. */
  R3.cv.style.display = 'block';
  R3.terrainDirty = true; R3.fogDirty = true;
  _r3dResize();
  return true;
}

/* HOW MANY DEVICE PIXELS THE 3D BUFFER GETS PER CSS PIXEL. Native by default; this ceiling
   exists so ui/gfxstat.js has something to clamp a pinned value against.

   IT WAS 2, AS A FILL-RATE CAP, AND THE DEVICE SAID NO. The premise looked solid - a dpr-3 phone
   carried 1.46M pixels and a dpr-4 one 2.10M against the 816k of the 1280x800 desktop this game
   is judged on - then the frame rate was read off a real iPhone 17 Pro Max through the GFX
   readout: 0.29 MP gave ~30 fps, 1.15 MP ~30, 2.60 MP ~30-40. A ninefold range in pixels moved
   nothing, so that phone is not fill-bound: the cap bought no frames and cost sharpness on every
   dense screen. The knob stays (ui/gfxstat.js) for devices that ARE fill-bound. */
var R3D_MAX_SCALE = 4;   /* = the dpr ceiling in camera.js, so AUTO is native */

function _r3dResize() {
  var R3 = window._R3D, main = document.getElementById('rtsCv'), R = window._rtsR;
  if (!R3 || !main) return;
  /* The overlay canvas is the reference for CSS size because it fills the stage, and its
     backing store is cssPx * R.dpr - so this recovers the CSS box without reading layout. */
  var dpr = (R && R.dpr) || 1;
  /* A pinned scale from the GFX control wins over the cap, so a player can measure their own
     device at every resolution it can show - see ui/gfxstat.js. Still bounded by dpr: a buffer
     larger than the screen is pure cost. */
  var pin = (typeof _rtsGfxWant === 'function') ? _rtsGfxWant() : null;
  /* ...and the tier's own ceiling, when no pin is set (render3d/quality3d.js) */
  R3.scale = pin ? Math.min(dpr, pin) : Math.min(dpr, R3D_MAX_SCALE, (R3.q && R3.q.scale) || R3D_MAX_SCALE) * (R3.dyn || 1);   /* fewer pixels when a fight is heavy: pace3d.js */
  /* The CSS box tracks the presentation canvas's, so the presented layer always fills the
     stage whatever the buffer scale. Off the overlay's inline style rather than layout, for
     the same reason as the buffer size above - and string-compared, because this runs every
     frame and assigning an unchanged style still costs a recalc. */
  if (R3.cv.style.width !== main.style.width) R3.cv.style.width = main.style.width;
  if (R3.cv.style.height !== main.style.height) R3.cv.style.height = main.style.height;
  var w = Math.max(1, Math.round(main.width / dpr * R3.scale));
  var h = Math.max(1, Math.round(main.height / dpr * R3.scale));
  if (R3.cv.width !== w || R3.cv.height !== h) { R3.cv.width = w; R3.cv.height = h; }
  R3.gl.viewport(0, 0, R3.cv.width, R3.cv.height);
}
