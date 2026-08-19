/* render3d/present3d.js - the 3D mode's lifecycle: turning it on and off, presenting its
   canvas, remembering the choice, and sizing the buffer.

   Split out of gl3d.js, which owns the GL context, the programs and the projection contract -
   this file owns whether and how the rendered buffer reaches the SCREEN. That stopped being
   one line when the canvas became a presented layer: the blit that used to copy the buffer
   into the 2D frame is gone (see render/frame.js), so presentation now means adoption into
   the shell's rebuilt DOM, a display flip, a CSS box, and a scale - all of which live here. */

/* Which mode the player last chose. localStorage rather than the IndexedDB store in
   rts.store.js, for the same reason the title screen's controls panel uses it: that store
   exists to hold megabytes of archives and this is one boolean. Wrapped because private
   browsing throws on access rather than returning null, and a disabled store must cost a
   preference, not the battle. */
var RTS_3D_LS = 'rcc.mode3d';

/* Lazy init so a machine without WebGL pays nothing and is told plainly rather than shown a
   black screen. `quiet` is for restoring the saved choice at match start: no click sound for
   something the player did not just click, and no complaint about WebGL on a machine that
   never had it - it simply stays in 2D. */
function _r3dApply(on, quiet) {
  var R3 = window._R3D;
  if (!R3) R3 = _r3dInit();
  if (!R3) {
    if (!quiet) _rtsSay('3D needs WebGL, which this browser did not provide.');
    return false;
  }
  R3.on = !!on;
  /* ADOPTION, because the shell rebuilds its DOM every match while this canvas - and the GL
     context, buffers and textures that live on it - persists across them. From the second
     match on, R3.cv is a DETACHED element and the #rtsCv3d in the document is a fresh blank
     one. The old blit never noticed, because drawImage reads the reference and not the DOM;
     a presented layer is the DOM, so the persistent canvas is swapped back into the fresh
     shell's slot. A context cannot move between canvases - this is the only direction the
     repair can run. */
  var slot = document.getElementById('rtsCv3d');
  if (slot && slot !== R3.cv && slot.parentNode) slot.parentNode.replaceChild(R3.cv, slot);
  /* The canvas is a LAYER now, not a buffer: visible under the 2D overlay when the mode is
     on, so the compositor presents the world directly instead of the frame walk copying it
     out with a full-resolution drawImage every frame - see the note where that blit used to
     live in render/frame.js. Hidden again in 2D, where the overlay paints everything and an
     opaque world layer underneath it would just be pinned memory. */
  R3.cv.style.display = R3.on ? 'block' : 'none';
  if (!R3.on) { R3.shakeT = ''; R3.cv.style.transform = ''; }
  /* the world moved between canvases, so both need a clean slate */
  R3.terrainDirty = true; R3.fogDirty = true;
  var btn = document.getElementById('rts3dBtn');
  if (btn) { btn.classList.toggle('on', R3.on); btn.title = R3.on ? 'Back to classic 2D' : 'Switch to 3D'; }
  _r3dResize();
  if (!quiet && typeof _rtsSfx === 'function') _rtsSfx('click');
  return true;
}

/* The toggle the button calls. */
function rts3dToggle() {
  rts3dSet(!(window._R3D && window._R3D.on));
}

/* SET IT, RATHER THAN FLIP IT. A toggle is the right thing for a button and the wrong thing
   for everybody else: every caller that wanted the mode ON said `toggle` and meant it, which
   was only true while 2D was the default. It is not any more, so a caller that means "on" has
   to say so. Returns whether the mode ended up where it was asked to go. */
function rts3dSet(on) {
  on = !!on;
  if (!_r3dApply(on, false)) return false;
  try { window.localStorage.setItem(RTS_3D_LS, on ? '1' : '0'); } catch (e) {}
  return true;
}

/* Called once per match from rtsOpen.

   3D IS THE DEFAULT NOW, which inverts what this used to do. It only ever turned the mode ON
   and let an absent preference fall through to 2D, so a new player never saw the renderer at
   all - the shadows, the occlusion, the swell, the lean, the effects standing in the world -
   unless they found a two-character button in the top bar and pressed it.

   So an ABSENT or unreadable preference lands in 3D now, and only an explicit '0' keeps it in
   2D. Nothing writes that '0' except rts3dSet, which is to say except somebody pressing the
   button to leave, so the only way to get the 2D game is to have asked for it. Treating
   unreadable as 3D is deliberate too: a browser refusing localStorage should get the mode the
   game is built around rather than the fallback.

   2D IS STILL THE FLOOR, and that is why this cannot just force the mode on. _r3dApply returns
   false when there is no WebGL context to be had; nothing has changed then, and the 2D painter
   draws the match exactly as it always did. */
function rts3dRestore() {
  var want = null;
  try { want = window.localStorage.getItem(RTS_3D_LS); } catch (e) { want = null; }
  if (want !== '0') _r3dApply(true, true);
}

/* HOW MANY DEVICE PIXELS THE 3D BUFFER GETS PER CSS PIXEL. Native by default; this ceiling
   exists so ui/gfxstat.js has something to clamp a pinned value against.

   IT WAS 2, AS A FILL-RATE CAP, AND THE DEVICE SAID NO. The premise looked solid - a dpr-3 phone
   carried 1.46M pixels and a dpr-4 one 2.10M against the 816k of the 1280x800 desktop this game
   is judged on - then the frame rate was read off a real iPhone 17 Pro Max through the GFX
   readout: 0.29 MP gave ~30 fps, 1.15 MP ~30, 2.60 MP ~30-40. A ninefold range in pixels moved
   nothing, so that phone is not fill-bound: the cap bought no frames and cost sharpness on every
   dense screen. The knob stays (ui/gfxstat.js) for devices that ARE fill-bound. Why 30 and not
   60 is still open - the 2D renderer has not been read, and a frame-rate cap and a slow 3D path
   look identical from here. */
var R3D_MAX_SCALE = 4;   /* = the dpr ceiling in camera.js, so AUTO is native */

function _r3dResize() {
  var R3 = window._R3D, main = document.getElementById('rtsCv'), R = window._rtsR;
  if (!R3 || !main) return;
  /* The 2D canvas is the reference for CSS size because it is the one being presented, and its
     backing store is cssPx * R.dpr - so this recovers the CSS box without reading layout. */
  var dpr = (R && R.dpr) || 1;
  /* A pinned scale from the GFX control wins over the cap, so a player can measure their own
     device at every resolution it can show - see ui/gfxstat.js. Still bounded by dpr: a buffer
     larger than the screen is pure cost. */
  var pin = (typeof _rtsGfxWant === 'function') ? _rtsGfxWant() : null;
  R3.scale = pin ? Math.min(dpr, pin) : Math.min(dpr, R3D_MAX_SCALE);
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
