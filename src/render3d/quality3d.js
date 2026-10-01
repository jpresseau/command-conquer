/* render3d/quality3d.js - how much the 3D mode draws, by device. Part of rts.render3d.

   EVERY EFFECT HERE HAS A KNOB THAT TAKES IT OUT OF THE PICTURE (R3.aoAmt and the rest), AND
   NONE OF THEM SAVES A MILLISECOND: they zero an amount so a spec can grade the effect, and the
   pass still runs. A phone that cannot keep up needs the passes themselves not to run. So:

     HIGH     everything, at the device's own resolution
     MEDIUM   no occlusion pass, no heat haze, no cloud shade; the buffer at most 2 device px a CSS px
     LOW      no shadow pass, no post stack at all (occlusion, bloom, heat, edge filter, grade), no
              silhouettes, no firelight; 1.5 px a CSS px; the coarser meshes (r3d/curves.js)
     AUTO     starts HIGH and steps down while the frame is slow - and KEEPS a step only if it
              paid. A phone held at 30 by its own power saving is slow whatever this draws, and a
              controller that stepped down on frame time alone would take it to LOW for nothing.
              So each step is a trial (_r3dQualityFeed): the next window's frame time has to beat
              the last by R3D_Q_GAIN or the step is undone and AUTO stops trying.

   The tier is the player's (ui/gfxstat.js: the GFX button), kept per device. The harness pins
   HIGH (test/lib/game.js), because its software rasteriser draws a frame in about 0.6 s and
   AUTO would otherwise take every spec's picture down to LOW; e2e/quality drives AUTO with
   frame times of its own. */

var R3D_TIERS = [
  { name: 'HIGH',   scale: 4,   shadow: 1, post: 1, ao: 1, heat: 1, clouds: 1, sil: 1, lights: 1, detail: 1 },
  { name: 'MEDIUM', scale: 2,   shadow: 1, post: 1, ao: 0, heat: 0, clouds: 0, sil: 1, lights: 1, detail: 1 },
  { name: 'LOW',    scale: 1.5, shadow: 0, post: 0, ao: 0, heat: 0, clouds: 0, sil: 0, lights: 0, detail: 0 }
];
var RTS_GFXQ_LS = 'rtsGfxQ';            /* 'auto' (or unset), 'high', 'medium', 'low' */
var R3D_Q_WINDOW = 2500;                /* ms of frames AUTO judges at a time */
var R3D_Q_SLOW = 26;                    /* ms: a median frame slower than this is worth a step down */
var R3D_Q_FAST = 17.5;                  /* ms: ...and faster than this, for three windows, a step up */
var R3D_Q_GAIN = 0.85;                  /* a step down is kept only if it takes the frame below this share */
var R3D_Q_SETTLE = 4000;                /* ms after a match opens before AUTO judges anything */

/* Is this part of the frame drawn at the current tier? True when no tier is set at all. */
function _r3dQ(k) {
  var R3 = window._R3D, q = R3 && R3.q;
  return !q || q[k] !== 0;
}

/* What the player chose: 'auto', 'high', 'medium' or 'low'. */
function _r3dQualityWant() {
  var v = null;
  try { v = window.localStorage.getItem(RTS_GFXQ_LS); } catch (e) { v = null; }
  return (v === 'high' || v === 'medium' || v === 'low') ? v : 'auto';
}
function _r3dQualitySetWant(v) {
  try {
    if (v && v !== 'auto') window.localStorage.setItem(RTS_GFXQ_LS, v);
    else window.localStorage.removeItem(RTS_GFXQ_LS);
  } catch (e) {}
  var R3 = window._R3D;
  if (R3) { R3.qAuto = null; _r3dQualityApply(v === 'medium' ? 1 : v === 'low' ? 2 : 0); }
}

/* Put tier `lvl` in force: the switches, the buffer's size, and - when it changes - the meshes. */
function _r3dQualityApply(lvl) {
  var R3 = window._R3D;
  if (!R3) return;
  lvl = Math.max(0, Math.min(R3D_TIERS.length - 1, lvl | 0));
  var was = R3.q, q = R3D_TIERS[lvl];
  R3.q = q; R3.qLevel = lvl;
  if (was && was.detail !== q.detail) R3.mesh = {};    /* rebuilt at the new tessellation on sight */
  if (R3.cv && typeof _r3dResize === 'function') { R3.scale = -1; _r3dResize(); }
}

/* AUTO, a frame at a time: `dt` is the ms since the last frame, `now` the clock. */
function _r3dQualityFeed(dt, now) {
  var R3 = window._R3D;
  if (!R3 || !R3.on || _r3dQualityWant() !== 'auto' || !(dt > 0) || dt > 250) return;
  var A = R3.qAuto || (R3.qAuto = { t0: now + R3D_Q_SETTLE, s: [], fast: 0, trial: null, locked: false });
  if (R3.q === undefined || R3.q === null) _r3dQualityApply(0);
  if (now < A.t0) return;
  A.s.push(dt);
  if (now - A.t0 < R3D_Q_WINDOW) return;
  var s = A.s.slice().sort(function (a, b) { return a - b; }), med = s[s.length >> 1];
  A.s.length = 0; A.t0 = now; A.last = med;
  var lvl = R3.qLevel || 0;
  if (A.trial) {
    /* the verdict on the last step: kept if it paid, undone if not - and then AUTO stops */
    if (A.trial.down && !(med < A.trial.base * R3D_Q_GAIN)) { _r3dQualityApply(A.trial.from); A.locked = true; }
    else if (!A.trial.down && med > R3D_Q_SLOW) { _r3dQualityApply(A.trial.from); A.locked = true; }
    A.trial = null;
    return;
  }
  if (A.locked) return;
  if (med > R3D_Q_SLOW && lvl < R3D_TIERS.length - 1) {
    A.trial = { from: lvl, base: med, down: true }; A.fast = 0;
    _r3dQualityApply(lvl + 1);
  } else if (med < R3D_Q_FAST && lvl > 0) {
    if (++A.fast >= 3) { A.trial = { from: lvl, base: med, down: false }; A.fast = 0; _r3dQualityApply(lvl - 1); }
  } else A.fast = 0;
}

/* WHERE A FRAME GOES, for the GFX readout (ui/gfxstat.js). `k` names the phase that has just
   ended, null starts the frame. JavaScript time only - what the CPU spent building and
   submitting each part - which is the half a phone's frame rate can be held by and the half this
   harness can measure; the GPU's half shows as the readout's `wait`. Smoothed over ~20 frames. */
function _r3dMark(R3, k) {
  var t = (window.performance || Date).now();
  if (k && R3.pm) { var P = R3.prof || (R3.prof = {}); P[k] = (P[k] || 0) * 0.95 + (t - R3.pm) * 0.05; }
  R3.pm = t;
}
