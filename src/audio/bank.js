/* audio/bank.js - every effect, rendered once a take and kept.

   An effect is rendered (audio/recipes.js) into an AudioBuffer the first time it is wanted and
   then only ever played, so a firefight costs one buffer source a shot rather than the half-dozen
   oscillators, filters and envelopes the old effects built and threw away for every one.

   TAKES. Each effect has a few, each from its own seed, and a shot plays one at random - never
   the one just played - so twelve rifles are twelve slightly different cracks. The first take of
   anything is rendered the moment it is first asked for, so nothing is ever silent; the rest are
   rendered out of spare time (_rtsBankIdle), a few milliseconds at a slice, every effect's first
   take before any effect's second. Measured: the whole bank, every take, is about 230 ms of
   rendering on a desktop, a building's collapse 15 ms of it and a rifle 2. */

var RTS_BANK_SLICE = 8;          /* ms of rendering per idle slice */

function _rtsBank(A) {
  return A.bank || (A.bank = { take: {}, last: {}, q: null, built: 0, idle: false });
}
/* one take, built now if it is not already */
function _rtsBankBuf(A, name, take) {
  var B = _rtsBank(A), k = name + '#' + take;
  if (B.take[k]) return B.take[k];
  var x = _rtsSfxRender(name, take, A.ctx.sampleRate);
  if (!x) return null;
  var buf = A.ctx.createBuffer(1, x.length, A.ctx.sampleRate);
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
  if (!have.length) { if (!_rtsBankBuf(A, name, 0)) return null; have = [0]; }
  var pick = have[Math.floor(Math.random() * have.length)];
  if (have.length > 1 && pick === B.last[name]) pick = have[(have.indexOf(pick) + 1) % have.length];
  B.last[name] = pick;
  return B.take[name + '#' + pick];
}
/* What is left to render, the first take of everything ahead of anyone's second. */
function _rtsBankQueue() {
  var names = rtsSfxNames(), q = [], most = 0, t;
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
