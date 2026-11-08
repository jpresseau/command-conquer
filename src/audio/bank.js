/* audio/bank.js - every effect, rendered once a take and kept.

   An effect is rendered (audio/recipes.js) into an AudioBuffer the first time it is wanted and
   then only ever played, so a firefight costs one buffer source a shot rather than the half-dozen
   oscillators, filters and envelopes the old effects built and threw away for every one.

   TAKES. Each effect has a few, each from its own seed, and a shot plays one at random - never
   the one just played - so twelve rifles are twelve slightly different cracks. Every effect's
   first take is rendered on the title screen, before the battle (_rtsBankEarly, below); one still
   missing when it is first asked for is rendered then, so nothing is ever silent; the rest are
   rendered out of spare time (_rtsBankIdle), a few milliseconds at a slice, every effect's first
   take before any effect's second and the battle's sounds before the rest. Measured: the whole bank, every take, is about 230 ms of
   rendering on a desktop, a building's collapse 15 ms of it and a rifle 2. */

var RTS_BANK_SLICE = 8;          /* ms of rendering per idle slice */

function _rtsBank(A) {
  return A.bank || (A.bank = { take: {}, last: {}, q: null, built: 0, idle: false });
}
/* one take, built now if it is not already - from the title's early render when it has one */
function _rtsBankBuf(A, name, take, now) {
  var B = _rtsBank(A), k = name + '#' + take;
  if (B.take[k]) return B.take[k];
  var E = _rtsBankEarlyQ, x = E.x[k], sr = RTS_BANK_EARLY_SR;
  if (x) delete E.x[k];
  else { if (now) E.live++; sr = A.ctx.sampleRate; x = _rtsSfxRender(name, take, sr); }
  if (!x) return null;
  var buf = A.ctx.createBuffer(1, x.length, sr);
  buf.getChannelData(0).set(x);
  B.take[k] = buf; B.built++;
  return buf;
}
/* A take of `name` to play: any built one but the last played, or the first, built now. */
function _rtsBankPick(A, name) {
  var R = _rtsSfxRecipe(name);
  if (!R) return null;
  var B = _rtsBank(A), have = [], t;
  for (t = 0; t < R.takes; t++) if (B.take[name + '#' + t]) have.push(t);
  if (!have.length) { if (!_rtsBankBuf(A, name, 0, true)) return null; have = [0]; }
  var pick = have[Math.floor(Math.random() * have.length)];
  if (have.length > 1 && pick === B.last[name]) pick = have[(have.indexOf(pick) + 1) % have.length];
  B.last[name] = pick;
  return B.take[name + '#' + pick];
}
/* What is left to render, the first take of everything ahead of anyone's second - and THE
   BATTLE'S SOUNDS FIRST: the ones heard often enough to have a gap of their own (_RTS_SFX_GAP,
   rts.audio.js), the guns and the blasts, ahead of the interface's and the rare ones. */
function _rtsBankQueue() {
  var names = rtsSfxNames(), q = [], most = 0, t, gap = typeof _RTS_SFX_GAP === 'object' ? _RTS_SFX_GAP : {};
  names = names.filter(function (n) { return gap[n]; }).concat(names.filter(function (n) { return !gap[n]; }));
  names.forEach(function (n) { most = Math.max(most, _rtsSfxRecipe(n).takes); });
  for (t = 0; t < most; t++) names.forEach(function (n) { if (t < _rtsSfxRecipe(n).takes) q.push([n, t]); });
  return q;
}
/* Render for up to `ms`; how many takes are still to come. */
function _rtsBankWarm(A, ms) {
  var B = _rtsBank(A), t0 = Date.now();
  if (!B.q) B.q = _rtsBankQueue();
  while (B.q.length && Date.now() - t0 < ms) {
    var w = B.q.shift();
    try { _rtsBankBuf(A, w[0], w[1]); } catch (_e) {}
  }
  return B.q.length;
}
/* ...a slice at a time, whenever the page is idle, until the bank is full */
function _rtsBankIdle(A) {
  var B = _rtsBank(A);
  if (B.idle) return;
  B.idle = true;
  var later = window.requestIdleCallback ? function (f) { window.requestIdleCallback(f, { timeout: 500 }); }
                                         : function (f) { setTimeout(f, 40); };
  (function slice() {
    if (_rtsBankWarm(A, RTS_BANK_SLICE) > 0) later(slice);
    else B.idle = false;
  })();
}

/* BEFORE THE BATTLE. The bank used to start filling when a battle opened - that is when the
   sound is unlocked - and only out of idle time, which a phone in a battle hardly has. So the
   first minutes of a game rendered each new sound the moment it was first heard, on the frame
   that wanted it: measured on a desktop, the first cannon 41 ms, the first kill 25 ms, several
   times that on a phone, and a big fight is where the new sounds come all at once.

   A take is plain arithmetic and needs no AudioContext, only a rate, so the title screen - which
   is idle while the player chooses - renders every effect's first take, the battle's first, at
   RTS_BANK_EARLY_SR. _rtsBankBuf wraps one in a buffer at that rate when it is wanted, and the
   context resamples it as it does any other buffer. `live` counts the takes a play still had to
   wait for (`now`, from _rtsBankPick), for e2e/sfxearly. RTS_BANK_EARLY = false is the before-picture. */
var RTS_BANK_EARLY = true;
var RTS_BANK_EARLY_SR = 48000;
var _rtsBankEarlyQ = { x: {}, q: null, on: false, live: 0 };
function _rtsBankEarlyWarm(ms) {
  var E = _rtsBankEarlyQ, t0 = Date.now();
  if (!E.q) E.q = _rtsBankQueue().filter(function (w) { return w[1] === 0; });
  while (E.q.length && Date.now() - t0 < ms) {
    var w = E.q.shift(), k = w[0] + '#0';
    if (window._rtsA && _rtsBank(window._rtsA).take[k]) continue;
    try { var x = _rtsSfxRender(w[0], 0, RTS_BANK_EARLY_SR); if (x) E.x[k] = x; } catch (_e) {}
  }
  return E.q.length;
}
function _rtsBankEarly() {
  var E = _rtsBankEarlyQ;
  if (!RTS_BANK_EARLY || E.on) return;
  E.on = true;
  var later = window.requestIdleCallback ? function (f) { window.requestIdleCallback(f, { timeout: 500 }); }
                                         : function (f) { setTimeout(f, 40); };
  (function slice() {
    if (_rtsBankEarlyWarm(RTS_BANK_SLICE) > 0) later(slice);
  })();
}
