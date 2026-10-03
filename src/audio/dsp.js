/* audio/dsp.js - the sound, built sample by sample. Part of the audio.

   THE OLD EFFECTS WERE BUILT LIVE, a few WebAudio nodes a shot: one square wave for a click, one
   band of white noise for a rifle, the same every time. That is all a node graph can afford when
   it is rebuilt for every shot of a battle, and it sounded like it - a toy's beeps and hiss.

   So the effects are rendered ahead of time instead, into plain arrays, by the functions here:
   noise of three colours, oscillators with a falling pitch, filters swept over a sound's life,
   struck-metal resonances, crackle, bubbles, saturation. A recipe (audio/recipes.js) layers a
   dozen of them into one sound, the bank (audio/bank.js) renders each a few times over with its
   own seed so no two shots are identical, and the game only ever plays the finished buffer.

   Pure arithmetic over Float32Arrays, with no WebAudio and no window: unit/sfx renders every
   sound in node and measures it. Seeded, so a sound is the same on every run. */

/* a small fast seeded generator (mulberry32): the same seed, the same sound */
function _dspRng(seed) {
  var a = (seed >>> 0) || 1;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/* x varied by up to +-k of itself */
function _dspJit(rng, x, k) { return x * (1 + (rng() * 2 - 1) * k); }

/* ---------------------------------------------------------------- sources ---- */
/* noise: white, pink (Kellet's filter - the hiss of air), or brown (the rumble of the ground) */
function _dspNoise(n, rng, color) {
  var out = new Float32Array(n), i, w;
  if (color === 'pink') {
    var b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (i = 0; i < n; i++) {
      w = rng() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.96900 * b2 + w * 0.1538520; b3 = 0.86650 * b3 + w * 0.3104856;
      b4 = 0.55000 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.0168980;
      out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  } else if (color === 'brown') {
    var last = 0;
    for (i = 0; i < n; i++) { last = (last + 0.02 * (rng() * 2 - 1)) / 1.02; out[i] = last * 3.5; }
  } else {
    for (i = 0; i < n; i++) out[i] = rng() * 2 - 1;
  }
  return out;
}

/* PolyBLEP: the step a saw or square takes once a cycle, rounded off so it does not alias into
   the whistling the old square-wave beeps had */
function _dspBlep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}
/* an oscillator gliding from f0 to f1 (exponentially, as a falling shell or a dying motor does) */
function _dspTone(n, sr, shape, f0, f1) {
  var out = new Float32Array(n), ph = 0, i, f = f0, dt, v;
  var r = f1 && f1 !== f0 ? Math.exp(Math.log(f1 / f0) / Math.max(1, n)) : 1;
  for (i = 0; i < n; i++, f *= r) {
    dt = f / sr;
    if (shape === 'saw') v = 2 * ph - 1 - _dspBlep(ph, dt);
    else if (shape === 'square') v = (ph < 0.5 ? 1 : -1) + _dspBlep(ph, dt) - _dspBlep((ph + 0.5) % 1, dt);
    else if (shape === 'tri') v = ph < 0.5 ? 4 * ph - 1 : 3 - 4 * ph;
    else v = Math.sin(2 * Math.PI * ph);
    out[i] = v;
    ph += dt; if (ph >= 1) ph -= 1;
  }
  return out;
}
/* struck metal: a few inharmonic partials, each ringing down at its own rate (modal synthesis) */
function _dspModal(n, sr, modes) {
  var out = new Float32Array(n), m, i, w, d;
  for (m = 0; m < modes.length; m++) {
    /* a damped resonator run as a recurrence - two multiplies a sample, no sine */
    w = 2 * Math.PI * modes[m].f / sr; d = Math.exp(-6.91 / (modes[m].t60 * sr));
    var c = 2 * d * Math.cos(w), d2 = d * d, y1 = modes[m].a * d * Math.sin(w), y2 = 0, y;
    for (i = 1; i < n; i++) { out[i] += y1; y = c * y1 - d2 * y2; y2 = y1; y1 = y; }
  }
  return out;
}
/* crackle: sparse random impulses - grit, debris, a fire catching */
function _dspCrackle(n, sr, rng, rate) {
  var out = new Float32Array(n), p = rate / sr;
  for (var i = 0; i < n; i++) if (rng() < p) out[i] = (rng() * 2 - 1) * (0.4 + 0.6 * rng());
  return out;
}

/* ----------------------------------------------------------------- shaping ---- */
/* an RBJ biquad, its corner swept exponentially from f0 to f1 over the sound */
function _dspFilter(x, sr, type, f0, f1, q) {
  var n = x.length, Q = q || 0.707, b0, b1, b2, a1, a2, x1 = 0, x2 = 0, y1 = 0, y2 = 0, i, y;
  var lf0 = Math.log(Math.min(f0, sr * 0.45)), lf1 = Math.log(Math.min(f1 || f0, sr * 0.45));
  for (i = 0; i < n; i++) {
    if ((i & 15) === 0) {
      var f = Math.exp(lf0 + (lf1 - lf0) * i / n), w = 2 * Math.PI * f / sr;
      var c = Math.cos(w), al = Math.sin(w) / (2 * Q), a0 = 1 + al;
      if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; }
      else if (type === 'bp') { b0 = al; b1 = 0; b2 = -al; }
      else { b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; }
      b0 /= a0; b1 /= a0; b2 /= a0; a1 = -2 * c / a0; a2 = (1 - al) / a0;
    }
    y = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = y;
    x[i] = y;
  }
  return x;
}
/* the amplitude: a linear rise over `a` seconds, held for `h`, then an exponential fall with time
   constant `tau` - the shape of almost every struck or exploding thing */
function _dspEnv(x, sr, a, tau, h) {
  var na = Math.max(1, Math.round(a * sr)), nh = Math.round((h || 0) * sr), d = Math.exp(-1 / (tau * sr)), e = 1, i;
  for (i = 0; i < x.length && i < na; i++) x[i] *= i / na;
  for (; i < x.length && i < na + nh; i++) {}
  for (; i < x.length; i++) { x[i] *= e; e *= d; }
  return x;
}
/* a slow random swell and fade - thunder rolling, a fire breathing */
function _dspWobble(x, sr, rng, rate, depth) {
  var step = Math.max(1, Math.round(sr / rate)), a = rng(), b = rng();
  for (var i = 0; i < x.length; i++) {
    var j = i % step;
    if (j === 0 && i) { a = b; b = rng(); }
    var s = j / step, m = a + (b - a) * s * s * (3 - 2 * s);
    x[i] *= 1 - depth + depth * 2 * m;
  }
  return x;
}
/* warmth and punch: a soft clip, unity at small signals */
function _dspSat(x, drive) {
  var k = Math.tanh(drive);
  for (var i = 0; i < x.length; i++) x[i] = Math.tanh(x[i] * drive) / k;
  return x;
}
/* src into dst at `at` seconds, scaled */
function _dspAdd(dst, src, sr, at, gain) {
  var o = Math.round((at || 0) * sr), g = gain == null ? 1 : gain;
  for (var i = 0; i < src.length && o + i < dst.length; i++) dst[o + i] += src[i] * g;
  return dst;
}
/* a sound brought down over its last `n` samples along a raised cosine, which an ear hears as it
   dying away rather than being turned off */
function _dspRelease(x, n) {
  n = Math.min(x.length, n);
  for (var i = 0; i < n; i++) x[x.length - n + i] *= 0.5 + 0.5 * Math.cos(Math.PI * (i + 1) / n);
  return x;
}
/* its loudest sample to `peak`, and no DC: a sound that sits off zero thumps when it starts */
function _dspNorm(x, peak) {
  var m = 0, s = 0, i;
  for (i = 0; i < x.length; i++) s += x[i];
  s /= x.length || 1;
  for (i = 0; i < x.length; i++) { x[i] -= s; if (Math.abs(x[i]) > m) m = Math.abs(x[i]); }
  if (m > 0) for (i = 0; i < x.length; i++) x[i] *= peak / m;
  return x;
}

/* ------------------------------------------------------------------ layers ----
   What a recipe is made of: each makes one part of a sound and lays it into `out`.
   o.at start (s), o.dur length (s), o.amp level, o.a attack (s), o.tau decay (s), o.h hold (s).

   A FILTERED NOISE IS BROUGHT BACK TO A FIXED LEVEL before its envelope (_dspLevel), so that `amp`
   means the same loudness whatever the filter took away. Without it a narrow band of noise came
   out at a tenth of a sine of the same `amp`, and every gunshot was its thump and nothing else:
   measured, the rifle had 92% of its energy under 400 Hz. */
var RTS_DSP_LEVEL = 0.5;            /* the RMS a noise layer is brought to: a sine of amp 0.7 */
function _dspLevel(x) {
  var s = 0, i;
  for (i = 0; i < x.length; i++) s += x[i] * x[i];
  s = Math.sqrt(s / (x.length || 1));
  if (s > 0) for (i = 0; i < x.length; i++) x[i] *= RTS_DSP_LEVEL / s;
  return x;
}
function _dspLayerNoise(out, sr, rng, o) {
  var x = _dspNoise(Math.round(o.dur * sr), rng, o.color);
  if (o.type) _dspFilter(x, sr, o.type, o.f0, o.f1, o.q);
  if (o.type2) _dspFilter(x, sr, o.type2, o.g0, o.g1, o.q2);
  _dspLevel(x);
  _dspEnv(x, sr, o.a || 0.001, o.tau, o.h);
  if (o.wob) _dspWobble(x, sr, rng, o.wob, o.wd || 0.5);
  return _dspAdd(out, x, sr, o.at, o.amp);
}
function _dspLayerTone(out, sr, o) {
  var x = _dspTone(Math.round(o.dur * sr), sr, o.shape, o.f0, o.f1);
  if (o.type) _dspFilter(x, sr, o.type, o.c0, o.c1, o.q);
  _dspEnv(x, sr, o.a || 0.001, o.tau, o.h);
  return _dspAdd(out, x, sr, o.at, o.amp);
}
function _dspLayerModal(out, sr, o) {
  return _dspAdd(out, _dspModal(Math.round(o.dur * sr), sr, o.modes), sr, o.at, o.amp);
}
function _dspLayerCrackle(out, sr, rng, o) {
  var x = _dspCrackle(Math.round(o.dur * sr), sr, rng, o.rate);
  if (o.type) _dspFilter(x, sr, o.type, o.f0, o.f1, o.q);
  _dspLevel(x);
  _dspEnv(x, sr, o.a || 0.001, o.tau, o.h);
  return _dspAdd(out, x, sr, o.at, o.amp);
}
/* a bubble: a sine that rises as it rings down (water, not noise) */
function _dspLayerBubble(out, sr, o) {
  var n = Math.round(o.dur * sr), x = _dspTone(n, sr, 'sine', o.f, o.f * (o.rise || 1.4));
  _dspEnv(x, sr, 0.001, o.tau);
  return _dspAdd(out, x, sr, o.at, o.amp);
}

/* THE ROOM. An impulse response for the reverb every effect is sent to: a handful of early
   reflections, then a tail of noise that dies away and darkens as it goes, the two channels
   drawn apart so the space has width. Rendered once, for a ConvolverNode (audio/mix.js). */
function _dspRoom(sr, sec, seed) {
  var n = Math.round(sec * sr), rng = _dspRng(seed || 7), out = [new Float32Array(n), new Float32Array(n)];
  for (var ch = 0; ch < 2; ch++) {
    var x = out[ch], lp = 0;
    for (var i = 0; i < n; i++) {
      var t = i / sr, k = 0.55 - 0.45 * Math.min(1, t / sec);   /* the tail darkens */
      lp += k * ((rng() * 2 - 1) - lp);
      x[i] = lp * Math.exp(-6.91 * t / (sec * 0.8)) * Math.min(1, t / 0.012);
    }
    for (var r = 0; r < 6; r++) {
      var at = Math.round((0.008 + rng() * 0.07) * sr);
      if (at < n) x[at] += (rng() < 0.5 ? -1 : 1) * (0.5 - r * 0.06);
    }
    _dspNorm(x, 0.5);
  }
  return out;
}
