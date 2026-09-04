/* ui/gfxstat.js - the render readout and the manual scale control.

   THIS EXISTS BECAUSE THIS PROJECT CANNOT MEASURE A PHONE. The only GPU the test machine has is
   SwiftShader, which renders this scene at about two frames a second, so every frame time ever
   quoted from it is a fact about a software rasteriser and nothing else. Every performance claim
   in the 3D renderer has therefore had to be made in pixel counts, draw calls and uploaded
   bytes - real quantities, but not the one that decides whether the game feels good in a hand.

   So the instrument goes to the device. GFX cycles the 3D buffer's resolution and the readout
   says what that costs, which turns "is 2.6 megapixels too many for this phone" from a guess
   into a thing a player can read off the screen in ten seconds.

   THE SCALE IS THE 3D BUFFER'S ALONE. render/camera.js picks a device pixel ratio of up to 4
   for the 2D renderer and must, because that mode stamps pixel art onto whole device pixels;
   the 3D mode draws meshes and render/frame.js blits its buffer up to the presentation canvas
   whatever size it is. See R3D_MAX_SCALE in render3d/gl3d.js. `auto` means that cap. */

var RTS_GFX_LS = 'rtsGfxScale';        /* '' = auto, or '1' / '2' / '3' / '4' */

/* What the player asked for, or null for auto. Read through here rather than off the key so a
   corrupted or hand-edited value cannot wedge the renderer at a size it cannot draw. */
function _rtsGfxWant() {
  var v = null;
  try { v = window.localStorage.getItem(RTS_GFX_LS); } catch (e) { v = null; }
  var n = parseInt(v, 10);
  return (n >= 1 && n <= 4) ? n : null;
}
function rtsGfxSet(n) {
  try {
    if (n) window.localStorage.setItem(RTS_GFX_LS, String(n));
    else window.localStorage.removeItem(RTS_GFX_LS);
  } catch (e) {}
  /* Force the next _r3dResize to notice: it only re-sizes when the numbers differ, and the
     numbers it compares are the ones it is about to recompute. */
  var R3 = window._R3D;
  if (R3 && R3.cv) { R3.scale = -1; if (typeof _r3dResize === 'function') _r3dResize(); }
  /* THE MESH CACHE IS KEYED ON THE MODEL, NOT ON THE DETAIL LEVEL, so it has to be dropped
     when the level changes or the buffers already built stay at the old tessellation - a base
     built before the pin and a tank built after it would be drawn at two different densities.
     They rebuild on first sight, which is the same cost as entering 3D. */
  if (R3) R3.mesh = {};
  _rtsGfxSync();
}
/* auto -> 1 -> 2 -> 3 -> 4 -> auto, skipping anything above the device's own dpr, which would
   be a buffer larger than the screen can show. */
function rtsGfxCycle() {
  var R = window._rtsR, dpr = (R && R.dpr) || 1, cur = _rtsGfxWant();
  var n = cur ? cur + 1 : 1;
  if (n > dpr) n = null;
  rtsGfxSet(n);
}

/* The readout. Frame time as a MEDIAN over the last second rather than a mean: one long frame
   from a garbage collection or a texture upload drags a mean around and tells the reader
   nothing about how the game feels. */
var _RTS_GFX = { t: [], last: 0, on: false };
function _rtsGfxFrame() {
  var S = _RTS_GFX;
  /* BUILT FROM HERE rather than from the shell's resize handler, which is where this started
     and which does not run when a match opens - so the control only appeared if the window
     happened to be resized, and on a phone it never appeared at all. The frame walk is the one
     thing guaranteed to run, and _rtsGfxInit early-outs once the button exists, so the cost is
     a single getElementById per frame. */
  if (!S.built) { _rtsGfxInit(); S.built = !!document.getElementById('rtsGfxBtn'); }
  if (!S.on) return;
  var now = (window.performance || Date).now();
  if (S.last) S.t.push(now - S.last);
  S.last = now;
  if (S.t.length > 90) S.t.shift();
  if (now - (S.paint || 0) < 400) return;         /* the readout itself must not cost a frame */
  S.paint = now;
  var el = document.getElementById('rtsGfxOut');
  if (!el) return;
  var a = S.t.slice().sort(function (x, y) { return x - y; });
  var med = a.length ? a[a.length >> 1] : 0;
  var R3 = window._R3D, R = window._rtsR;
  var px = (R3 && R3.cv) ? R3.cv.width * R3.cv.height : 0;
  var want = _rtsGfxWant();
  el.textContent = med.toFixed(1) + 'ms  ' + (med > 0 ? (1000 / med).toFixed(0) : '0') + 'fps' +
    '   ' + (R3 && R3.cv ? R3.cv.width + 'x' + R3.cv.height : '-') +
    ' (' + (px / 1e6).toFixed(2) + 'MP)' +
    '   scale ' + ((R3 && R3.scale) || '-') + '/' + ((R && R.dpr) || '-') +
    (want ? ' pinned' : ' auto') +
    /* so the geometry half of the ask is visible too, rather than being a silent consequence
       of a control that reads as being about resolution */
    '   mesh ' + (typeof _r3dDetailLevel === 'function' ? _r3dDetailLevel() : '-') + 'x';
}
function _rtsGfxSync() {
  var b = document.getElementById('rtsGfxBtn');
  if (b) {
    var w = _rtsGfxWant();
    b.textContent = 'GFX ' + (w ? w + 'x' : 'AUTO');
    b.className = _RTS_GFX.on ? 'on' : '';
  }
  var el = document.getElementById('rtsGfxOut');
  if (el) el.style.display = _RTS_GFX.on ? 'block' : 'none';
}
/* Long-press or right-click shows and hides the readout; a tap cycles the scale. One control,
   because the top bar is already tight on a 360px phone - see the note in ui/topbar. */
function _rtsGfxInit() {
  var row = document.querySelector('#rcgRts .rts-btns');
  if (!row || document.getElementById('rtsGfxBtn')) return;
  var b = document.createElement('button');
  b.id = 'rtsGfxBtn';
  b.title = 'Tap: 3D render scale. Hold: show the frame readout.';
  b.onclick = function () { rtsGfxCycle(); };
  b.oncontextmenu = function (e) { e.preventDefault(); _RTS_GFX.on = !_RTS_GFX.on; _rtsGfxSync(); return false; };
  var held = null;
  b.addEventListener('touchstart', function () {
    held = setTimeout(function () { _RTS_GFX.on = !_RTS_GFX.on; _rtsGfxSync(); held = null; }, 500);
  }, { passive: true });
  b.addEventListener('touchend', function (e) {
    if (held) { clearTimeout(held); held = null; }
    else { e.preventDefault(); }        /* the hold already acted - do not also cycle */
  });
  row.appendChild(b);
  var out = document.createElement('div');
  out.id = 'rtsGfxOut';
  document.querySelector('#rcgRts .rts-stage').appendChild(out);
  _rtsGfxSync();
}
