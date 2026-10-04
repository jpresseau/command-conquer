/* render/post.js - picking on the screen, and the colour cycle the HUD pulses with.
   Part of rts.render. */

/* NULL WHEN THE POINTER IS NOT ON THE GROUND. Under both orthographic cameras every screen
   pixel maps to a ground point, so this dereferenced _rtsGroundAt's result without asking - and
   it runs inside the DRAW half of the loop, through _rtsActionAt, on every frame the pointer
   moves. A perspective camera has a horizon: above it the view ray never meets the ground plane
   and the inverse has no answer to give. Reaching that line with this unguarded throws inside
   the render loop, which ui/camera.js turns into 'The display has stopped' after 60 frames.

   Every caller already copes with a null - `if (!hit) return`, or `hit && hit.ent` - so the
   guard belongs here and costs them nothing. */
function _rtsPickAt(mx, my) {
  var G = window._rtsG, p = _rtsGroundAt(mx, my);
  if (!p) return null;
  var best = null, bd = 1e9, i;
  for (i = 0; i < G.ents.length; i++) {
    var e = G.ents[i];
    if (e.dead || !_rtsEntSeen(e)) continue;     /* you cannot click what you cannot see */
    var rad, d = Math.hypot(e.x - p.x, e.z - p.z);
    /* an aircraft is measured where it is drawn, in world units on the screen (render/camera.js) */
    if (e.air) { var sc = _rtsScreenOf(e); d = sc.behind ? 1e9 : Math.hypot(sc.x - mx, sc.y - my) / _rtsPxPerUnit(e); }
    if (e.type === 'struct') { var sd = rtsStructDef(e.def); rad = Math.max(sd.w, sd.h) * RTS_TILE * 0.55; }
    else rad = Math.max(2.2, e.r * 1.6);
    if (d <= rad && d < bd) { bd = d; best = e; }
  }
  return best ? { ent: best, x: p.x, z: p.z } : { ent: null, x: p.x, z: p.z };
}

/* CONQUER.CPP: Color_Cycle(). Two clocks drive everything that shimmers.

   The pulse steps by 20 every TIMER_SECOND/6, bouncing between 0x20 and 150, and is applied
   to CC_PULSE_COLOR (radar box, glowing interface) and CC_EMBER_COLOR - RGBClass(255,80,80),
   the glow on burning things. The water clock rotates a band of palette entries one step
   every TIMER_SECOND/4.

   With no indexed palette to rotate, the same numbers drive an overlay cycle instead. The
   cadences are the originals' because they are what the eye recognises. */
var _RTS_PULSE = { val: 0x20, up: true, t: 0, wt: 0, wf: 0, at: 0, frame: 0 };
function _rtsCycleTick(dt) {
  var P = _RTS_PULSE;
  P.t += dt;
  while (P.t >= 1 / 6) {
    P.t -= 1 / 6;
    P.val += P.up ? 20 : -20;
    if (P.val > 150) { P.val = 150; P.up = false; }
    if (P.val < 0x20) { P.val = 0x20; P.up = true; }
  }
  P.wt += dt;
  while (P.wt >= 1 / 4) { P.wt -= 1 / 4; P.wf = (P.wf + 1) & 3; }
  /* Sync_Delay() pins the original to 15 FPS, and that cadence is a big part of how its
     animation reads - chunky rather than smooth. Movement here stays continuous (it would
     look broken at 15 Hz on a modern display), but everything that picks an animation FRAME
     advances off this counter instead of off wall-clock time. */
  P.at += dt;
  while (P.at >= 1 / 15) { P.at -= 1 / 15; P.frame++; }
}
function _rtsAnimFrame() { return _RTS_PULSE.frame; }
/* Time quantised to the 15 Hz grid, for anything choosing a frame from an elapsed timer. */
function _rtsAnimQ(t) { return Math.floor(t * 15) / 15; }
function _rtsPulse() { return _RTS_PULSE.val / 255; }        /* 0.125 .. 0.588 */

