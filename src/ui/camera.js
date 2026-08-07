/* ui/camera.js - panning and clamping the view, and the main loop that drives a frame.
   Part of rts.ui, which owns the DOM. */

/* -------------------------------------------------------------- camera */
function _rtsPanTick(dt) {
  var U = window._rtsUI, R = _rtsR, sp = R.dist * 1.15 * dt, moved = false;
  var k = U.keys;
  /* ARROWS, NOT WASD. W/A/S/D used to pan as well, and three of the four are command keys: the
     Controls list promised "WASD pans" AND "S hold" AND "D deploy" AND "A + right-click
     attack-move", so it documented a collision into existence. Every one of them fired both
     jobs at once. Panning right with D DEPLOYED YOUR SELECTED MCV on the very first keydown -
     2500 credits and a base position, no confirmation and no undo; panning down with S put the
     whole selection on hold so it stopped chasing; panning left with A latched attack-move so
     the next right-click was an assault rather than a move.

     The arrow keys already pan, as do the screen edges, the radar and a finger drag, so WASD
     was the redundant half of every one of those pairs - and the half that was silently
     destroying things. RA panned with the arrows and the screen edge in the first place. */
  if (k['arrowup'])    { R.focus.z -= sp; moved = true; }
  if (k['arrowdown'])  { R.focus.z += sp; moved = true; }
  if (k['arrowleft'])  { R.focus.x -= sp; moved = true; }
  if (k['arrowright']) { R.focus.x += sp; moved = true; }
  /* edge scroll, but only while the pointer is genuinely over the battlefield */
  if (U.mouse.over && !U.drag) {
    var m = 26;
    if (U.mouse.x < m) { R.focus.x -= sp; moved = true; }
    if (U.mouse.x > R.W - m) { R.focus.x += sp; moved = true; }
    if (U.mouse.y < m) { R.focus.z -= sp; moved = true; }
    if (U.mouse.y > R.H - m) { R.focus.z += sp; moved = true; }
  }
  if (moved) _rtsClampFocus();
}
/* Keep the view on the battlefield. The old fixed clamp was tuned for a perspective camera
   and let the ortho view slide far enough that the off-map background filled a third of the
   screen. Derive the limit from what is actually visible at the current zoom. */
function _rtsClampFocus() {
  var R = _rtsR, span = RTS_N * RTS_TILE, vs = _rtsViewSpan();
  var lx = Math.max(0, span / 2 - vs.w * 0.5), lz = Math.max(0, span / 2 - vs.h * 0.5);
  R.focus.x = Math.max(-lx, Math.min(lx, R.focus.x));
  R.focus.z = Math.max(-lz, Math.min(lz, R.focus.z));
  _rtsApplyCam();
}

/* ----------------------------------------------------------- main loop */
/* `prime` is passed as the literal `true` by rtsOpen's one hand-made call, and the check below
   tests for exactly that - NOT for truthiness. requestAnimationFrame hands its callback a
   timestamp, so every real frame would arrive with a large truthy number in this slot and a
   loose test would switch the simulation off for the whole match. */
function _rtsLoop(prime) {
  var U = window._rtsUI;
  if (!U || U.dead) return;
  U.raf = requestAnimationFrame(_rtsLoop);
  var now = (new Date()).getTime(), dt = Math.min(0.1, (now - U.last) / 1000);
  U.last = now;
  try {
    _rtsPanTick(dt);
    /* THE FIRST FRAME PAINTS, IT DOES NOT SIMULATE. rtsOpen calls this once by hand to put an
       image on screen and start the rAF chain; no game time has passed at that point and the
       tick has nothing to do.

       Almost everything in a tick is scaled by dt, so a near-zero step is harmless to it. The
       unit separation pass is not: it shoves overlapping units apart by a fixed distance every
       time it runs, whatever the clock says. So the priming frame quietly displaced every
       crowded unit before the player saw anything.

       On a fresh battle that is invisible. On a LOADED one it is not: _rtsApplyState restores
       every position exactly, and then this frame moved eleven of thirty-four units by up to
       0.12 world units - measured - so the resumed battle was never quite the battle that was
       saved, and ninety seconds later it had diverged into a different game.

       Guarding on `dt > 0` alone was not enough, and that is worth keeping in mind: rtsOpen
       sets U.last and calls straight in, so on an idle machine the two statements land in the
       same millisecond and dt really is 0 - but on a busy one a millisecond or two elapses
       between them, dt becomes 0.001, and the frame simulates after all. The suite caught it
       exactly that way: the spec passed alone and failed inside the full run. Timing is not a
       guard; saying which call it is, is. The dt test stays as well, because two real frames
       can share a millisecond on a fast display and that step has nothing to do either. */
    if (dt > 0 && prime !== true) _rtsTick(dt);
    _rtsRFrame(dt);
    _rtsDrawHud(dt);
    U.miniT = (U.miniT || 0) + dt;
    if (U.miniT > 0.12) { U.miniT = 0; _rtsDrawMini(); }
    U.uiT = (U.uiT || 0) + dt;
    if (U.uiT > 0.1) { U.uiT = 0; _rtsSyncSidebar(); _rtsSuperRow(); }
  } catch (err) {
    /* Surface a persistent failure instead of silently burning frames on it. */
    U.errs = (U.errs || 0) + 1;
    if (!U.errShown) {
      U.errShown = true;
      try { console.error('Red Alert:', err); } catch (_c) {}
      _rtsSay('Error: ' + ((err && err.message) || err));
    }
  }
}
