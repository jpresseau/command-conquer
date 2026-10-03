/* audio/recipes2.js - the sounds that are not gunfire: the interface, the base, the weather.

   THE INTERFACE WAS SQUARE WAVES, and a square wave is the sound of a 1980s handheld: every
   click, blip and chime in the game was one, with nothing to soften it. These are built from
   what real equipment sounds like instead - a click is a struck plastic tick, a chime is a bell
   (a sine with the inharmonic partials a struck bar really has, ringing down), an order is a
   radio acknowledging with a squelch either side, and the attack alarm is a klaxon, not a buzzer.
   Kept consistent take to take (`takes` 2, small jitter): the interface should sound the same
   every time, which is how a player learns what it is saying.

   A recipe's fields are those of audio/recipes.js. */

/* a struck bar: its fundamental and the partials at 2.76x and 5.4x that make it a bell, not a beep */
function _sfxBell(o, sr, at, f, amp, t60) {
  _dspLayerModal(o, sr, { at: at, dur: t60 * 1.1, amp: amp, modes: [
    { f: f, t60: t60, a: 1 }, { f: f * 2.756, t60: t60 * 0.45, a: 0.32 }, { f: f * 5.404, t60: t60 * 0.22, a: 0.12 }] });
}

var RTS_SFX_UI = {
  /* selecting a unit: a soft, bright blip and the faintest tick */
  select: { cat: 'ui', len: 0.2, takes: 2, peak: 0.6, heard: -24, vol: 0.48, fn: function (sr, rng) {
    var o = new Float32Array(Math.round(0.2 * sr));
    _dspLayerTone(o, sr, { dur: 0.18, amp: 0.7, a: 0.002, tau: 0.04, f0: _dspJit(rng, 1480, 0.01) });
    _dspLayerTone(o, sr, { dur: 0.1, amp: 0.25, a: 0.002, tau: 0.02, f0: 2960 });
    _dspLayerNoise(o, sr, rng, { dur: 0.01, amp: 0.15, a: 0.0002, tau: 0.002, type: 'hp', f0: 4500 });
    return o;
  } },

  /* an order given: a radio acknowledging - squelch, two rising tones down a narrow band, squelch */
  order: { cat: 'ui', len: 0.34, takes: 2, peak: 0.6, heard: -22, vol: 0.35, fn: function (sr, rng) {
    var o = new Float32Array(Math.round(0.34 * sr));
    _dspLayerNoise(o, sr, rng, { dur: 0.04, amp: 0.12, a: 0.001, tau: 0.012, type: 'bp', f0: 2300, q: 0.9 });
    _dspLayerTone(o, sr, { at: 0.02, dur: 0.09, amp: 0.6, a: 0.003, h: 0.03, tau: 0.02, shape: 'tri', f0: 1046, type: 'bp', c0: 1500, q: 0.6 });
    _dspLayerTone(o, sr, { at: 0.11, dur: 0.13, amp: 0.6, a: 0.003, h: 0.04, tau: 0.03, shape: 'tri', f0: 1568, type: 'bp', c0: 1700, q: 0.6 });
    _dspLayerNoise(o, sr, rng, { at: 0.25, dur: 0.06, amp: 0.1, a: 0.002, tau: 0.015, type: 'bp', f0: 2100, q: 0.9 });
    return o;
  } },

  /* a button: a crisp plastic tick */
  click: { cat: 'ui', len: 0.08, takes: 2, peak: 0.55, heard: -26, vol: 0.99, fn: function (sr, rng) {
    var o = new Float32Array(Math.round(0.08 * sr));
    _dspLayerModal(o, sr, { dur: 0.06, amp: 0.6, modes: [{ f: _dspJit(rng, 3300, 0.02), t60: 0.02, a: 1 }, { f: 5150, t60: 0.014, a: 0.5 }] });
    _dspLayerNoise(o, sr, rng, { dur: 0.01, amp: 0.35, a: 0.0002, tau: 0.0025, type: 'hp', f0: 3000 });
    return o;
  } },

  /* refused: two soft low tones, falling - "no", not an error buzzer */
  deny: { cat: 'ui', len: 0.36, takes: 2, peak: 0.6, heard: -23, vol: 0.80, fn: function (sr) {
    var o = new Float32Array(Math.round(0.36 * sr));
    _dspLayerTone(o, sr, { dur: 0.12, amp: 0.7, a: 0.004, h: 0.03, tau: 0.03, shape: 'tri', f0: 330, type: 'lp', c0: 1400 });
    _dspLayerTone(o, sr, { at: 0.12, dur: 0.22, amp: 0.7, a: 0.004, h: 0.04, tau: 0.05, shape: 'tri', f0: 247, type: 'lp', c0: 1200 });
    return o;
  } },

  /* production started: a latch clicking and a servo winding up */
  build: { cat: 'ui', len: 0.5, takes: 2, peak: 0.6, heard: -24, vol: 2.04, fn: function (sr, rng) {
    var o = new Float32Array(Math.round(0.5 * sr));
    _dspLayerModal(o, sr, { dur: 0.06, amp: 0.4, modes: [{ f: 2400, t60: 0.03, a: 1 }, { f: 3800, t60: 0.02, a: 0.5 }] });
    _dspLayerTone(o, sr, { dur: 0.12, amp: 0.4, tau: 0.035, f0: 190, f1: 120 });
    _dspLayerTone(o, sr, { at: 0.03, dur: 0.42, amp: 0.25, a: 0.03, h: 0.1, tau: 0.08, shape: 'saw', f0: _dspJit(rng, 140, 0.02), f1: 300, type: 'lp', c0: 900, c1: 1600 });
    return o;
  } },

  /* a building set down: a heavy thud, a steel frame ringing, dust */
  place: { cat: 'boom', len: 1.0, takes: 3, peak: 0.85, heard: -17, vol: 2.21, fn: function (sr, rng) {
    var o = new Float32Array(Math.round(1.0 * sr)), J = function (x, k) { return _dspJit(rng, x, k || 0.05); };
    _dspLayerTone(o, sr, { dur: 0.5, amp: 1.0, a: 0.002, tau: J(0.12), f0: J(88), f1: 45 });
    _dspLayerNoise(o, sr, rng, { dur: 0.3, amp: 0.8, a: 0.001, tau: J(0.07), color: 'pink', type: 'lp', f0: 1500, f1: 260 });
    _dspLayerModal(o, sr, { at: 0.01, dur: 0.5, amp: 0.22, modes: [
      { f: J(430), t60: 0.32, a: 1 }, { f: J(690), t60: 0.26, a: 0.7 }, { f: J(1120), t60: 0.2, a: 0.5 }, { f: J(1790), t60: 0.14, a: 0.3 }] });
    _dspLayerNoise(o, sr, rng, { at: 0.02, dur: 0.9, amp: 0.2, a: 0.03, tau: 0.25, color: 'pink', type: 'lp', f0: 900 });
    return _dspSat(o, 1.6);
  } },

  /* construction complete: a rising major arpeggio on a bell */
  ready: { cat: 'ui', len: 1.5, takes: 2, peak: 0.6, heard: -20, vol: 0.67, fn: function (sr) {
    var o = new Float32Array(Math.round(1.5 * sr));
    [659.3, 830.6, 987.8].forEach(function (f, i) { _sfxBell(o, sr, i * 0.09, f, 0.5, 1.0); });
    return o;
  } },

  /* a unit ready: two notes of the same bell */
  unitready: { cat: 'ui', len: 1.0, takes: 2, peak: 0.55, heard: -21, vol: 0.82, fn: function (sr) {
    var o = new Float32Array(Math.round(1.0 * sr));
    [784, 1174.7].forEach(function (f, i) { _sfxBell(o, sr, i * 0.08, f, 0.5, 0.7); });
    return o;
  } },

  /* under attack: a klaxon, three falling pulses with grit in them */
  alert: { cat: 'ui', len: 1.3, takes: 2, peak: 0.7, heard: -17, vol: 0.58, fn: function (sr) {
    var o = new Float32Array(Math.round(1.3 * sr));
    for (var p = 0; p < 3; p++) {
      var at = p * 0.38;
      _dspLayerTone(o, sr, { at: at, dur: 0.34, amp: 0.6, a: 0.012, h: 0.22, tau: 0.03, shape: 'saw', f0: 520, f1: 400, type: 'lp', c0: 2200, c1: 1500 });
      _dspLayerTone(o, sr, { at: at, dur: 0.34, amp: 0.35, a: 0.012, h: 0.22, tau: 0.03, shape: 'square', f0: 262, f1: 201, type: 'lp', c0: 1600 });
    }
    return _dspSat(o, 2.2);
  } },

  /* power failing: everything winding down, and the hum of what is left */
  lowpower: { cat: 'ui', len: 1.3, takes: 2, peak: 0.6, heard: -20, vol: 1.30, fn: function (sr) {
    var o = new Float32Array(Math.round(1.3 * sr));
    _dspLayerTone(o, sr, { dur: 1.2, amp: 0.6, a: 0.01, h: 0.15, tau: 0.35, shape: 'saw', f0: 230, f1: 55, type: 'lp', c0: 1600, c1: 250 });
    _dspLayerTone(o, sr, { dur: 1.2, amp: 0.4, a: 0.01, h: 0.2, tau: 0.4, f0: 116, f1: 40 });
    _dspLayerTone(o, sr, { at: 0.1, dur: 1.1, amp: 0.15, a: 0.1, h: 0.4, tau: 0.25, shape: 'square', f0: 60, type: 'lp', c0: 400 });
    return o;
  } },

  /* in a storm: the crack overhead, then the roll, swelling and fading as it goes (rts.ambience.js) */
  thunder: { cat: 'world', len: 5.5, takes: 2, peak: 0.95, heard: -16, vol: 1.45, fn: function (sr, rng) {
    var o = new Float32Array(Math.round(5.5 * sr));
    _dspLayerNoise(o, sr, rng, { dur: 0.5, amp: 0.6, a: 0.002, tau: 0.1, type: 'bp', f0: 2200, f1: 500, q: 0.7 });
    _dspLayerCrackle(o, sr, rng, { dur: 0.5, amp: 0.22, rate: 2200, tau: 0.1, type: 'bp', f0: 1800, q: 0.8 });
    _dspLayerNoise(o, sr, rng, { at: 0.05, dur: 5.4, amp: 1.0, a: 0.4, tau: 1.9, color: 'brown', type: 'lp', f0: 320, f1: 80, wob: 3, wd: 0.45 });
    _dspLayerNoise(o, sr, rng, { at: 1.1 + rng() * 0.5, dur: 3.8, amp: 0.7, a: 0.3, tau: 1.3, color: 'brown', type: 'lp', f0: 240, f1: 60, wob: 2, wd: 0.5 });
    return _dspSat(o, 1.4);
  } }
};
