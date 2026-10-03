/* audio/loops.js - the world's sound, as loops (rts.ambience.js plays them).

   THE BED WAS A FEW LIVE NODES: rain was white noise through one filter, the wind one low-passed
   noise with a slow wobble, the insects a single triangle wave chirped by a square, and every
   vehicle on the map one 40 Hz saw. Each of these is a rendered loop now, built with the effects'
   tools (audio/dsp.js), seamless (_dspLoop), and turned up and down as before:

     RAIN      a hiss with drops in it, each side its own, and a patter under it
     WIND      a low roar that gusts, with a whistle that comes and goes; SAND, a gritty hiss
     CRICKETS  at night, three of them across the field and one further off
     BIRDS     by day, the odd call - sparse, so it is a place and not a soundtrack
     TRACKS    a tank's engine with its treads clattering; WHEELS, a truck's engine and the road
     ROTOR     a helicopter's blades and its turbine; JET, a roar with a whine in it
     BOAT      a diesel's chug and the water washing past
     BRIDGE    the deep rumble of a deck with traffic on it
     HUM       a power plant's mains hum and buzz
     BUILD     a building going up: clanks, a hammer, the hiss of a weld

   Each loop renders at the lowest rate its content allows (`div`, as audio/instruments.js does),
   and a tone in a loop is tuned to a whole number of cycles of it, so the seam is not heard. */

/* the last `x` seconds laid over the first, so the end runs into the start with no seam */
function _dspLoop(y, sr, sec, x) {
  var n = Math.round(sec * sr), m = Math.round(x * sr), out = new Float32Array(n);
  for (var i = 0; i < n; i++) out[i] = y[i];
  for (i = 0; i < m; i++) {
    var k = i / m, a = Math.sin(k * Math.PI / 2), b = Math.cos(k * Math.PI / 2);
    out[i] = y[i] * a + y[n + i] * b;                      /* equal power: noise does not dip */
  }
  return out;
}
/* a frequency moved to the nearest one that fits a whole number of cycles into `sec` */
function _dspFit(f, sec) { return Math.max(1, Math.round(f * sec)) / sec; }

var RTS_LOOPS = {
  rain: { div: 2, sec: 4, stereo: true, fn: function (sr, rng, sec) {
    var o = new Float32Array(Math.round((sec + 1) * sr));
    _dspLayerNoise(o, sr, rng, { dur: sec + 1, amp: 0.7, a: 0.001, tau: 1e9, color: 'pink', type: 'hp', f0: 500, type2: 'lp', g0: 8000 });
    _dspLayerCrackle(o, sr, rng, { dur: sec + 1, amp: 0.5, rate: 380, tau: 1e9, type: 'bp', f0: 3200, f1: 4200, q: 1.4 });
    _dspLayerNoise(o, sr, rng, { dur: sec + 1, amp: 0.25, a: 0.001, tau: 1e9, color: 'brown', type: 'lp', f0: 500, wob: 1.5, wd: 0.3 });
    return o;
  } },
  wind: { div: 4, sec: 9, stereo: true, fn: function (sr, rng, sec) {
    var o = new Float32Array(Math.round((sec + 1.5) * sr));
    _dspLayerNoise(o, sr, rng, { dur: sec + 1.5, amp: 0.9, a: 0.001, tau: 1e9, color: 'brown', type: 'lp', f0: 600, wob: 0.35, wd: 0.6 });
    _dspLayerNoise(o, sr, rng, { dur: sec + 1.5, amp: 0.25, a: 0.001, tau: 1e9, color: 'pink', type: 'bp', f0: 720, f1: 900, q: 7, wob: 0.5, wd: 0.85 });
    return o;
  } },
  sand: { div: 2, sec: 4, stereo: true, fn: function (sr, rng, sec) {
    var o = new Float32Array(Math.round((sec + 1) * sr));
    _dspLayerNoise(o, sr, rng, { dur: sec + 1, amp: 0.7, a: 0.001, tau: 1e9, type: 'hp', f0: 2200, type2: 'lp', g0: 9000, wob: 0.8, wd: 0.5 });
    _dspLayerCrackle(o, sr, rng, { dur: sec + 1, amp: 0.4, rate: 1500, tau: 1e9, type: 'hp', f0: 4000 });
    return o;
  } },
  crickets: { div: 2, sec: 4, stereo: true, fn: function (sr, rng, sec) {
    var o = new Float32Array(Math.round((sec + 0.5) * sr));
    for (var c = 0; c < 2; c++) {                                      /* two a side, one nearer */
      var f = 4400 + rng() * 900, per = 0.7 + rng() * 0.5, amp = c ? 0.12 : 0.3;
      for (var t = rng() * per; t < sec + 0.5; t += per) for (var p = 0; p < 3; p++)
        _dspLayerTone(o, sr, { at: t + p * 0.045, dur: 0.035, amp: amp, a: 0.004, tau: 0.008, f0: f });
    }
    return o;
  } },
  birds: { div: 2, sec: 8, stereo: true, fn: function (sr, rng, sec) {
    var o = new Float32Array(Math.round((sec + 1) * sr));
    for (var b = 0; b < 2; b++) {
      var at = 0.5 + rng() * (sec - 2), f = 2600 + rng() * 1800, notes = 2 + Math.floor(rng() * 4);
      for (var k = 0; k < notes; k++) {
        var up = rng() < 0.5;
        _dspLayerTone(o, sr, { at: at + k * (0.11 + rng() * 0.05), dur: 0.09, amp: 0.25, a: 0.01, tau: 0.03, f0: f * (up ? 0.85 : 1.15), f1: f * (up ? 1.15 : 0.85) });
      }
    }
    return o;
  } },
  tracks: { div: 4, sec: 2, fn: function (sr, rng, sec) {
    var o = new Float32Array(Math.round((sec + 0.4) * sr)), f = _dspFit(44, sec);
    _dspLayerTone(o, sr, { dur: sec + 0.4, amp: 0.8, tau: 1e9, shape: 'saw', f0: f, type: 'lp', c0: 320 });
    _dspLayerTone(o, sr, { dur: sec + 0.4, amp: 0.4, tau: 1e9, shape: 'square', f0: f / 2, type: 'lp', c0: 200 });
    for (var t = 0; t < sec + 0.4; t += 1 / 13)                       /* the links, coming round */
      _dspLayerModal(o, sr, { at: t + rng() * 0.01, dur: 0.06, amp: 0.05 + rng() * 0.05, modes: [{ f: 1150 + rng() * 300, t60: 0.04, a: 1 }, { f: 1900 + rng() * 300, t60: 0.03, a: 0.6 }] });
    return _dspSat(o, 1.6);
  } },
  wheels: { div: 4, sec: 2, fn: function (sr, rng, sec) {
    var o = new Float32Array(Math.round((sec + 0.4) * sr)), f = _dspFit(72, sec);
    _dspLayerTone(o, sr, { dur: sec + 0.4, amp: 0.6, tau: 1e9, shape: 'saw', f0: f, type: 'lp', c0: 650 });
    _dspLayerTone(o, sr, { dur: sec + 0.4, amp: 0.35, tau: 1e9, shape: 'square', f0: f / 2, type: 'lp', c0: 300 });
    _dspLayerTone(o, sr, { dur: sec + 0.4, amp: 0.05, tau: 1e9, f0: _dspFit(430, sec) });
    _dspLayerNoise(o, sr, rng, { dur: sec + 0.4, amp: 0.35, tau: 1e9, color: 'pink', type: 'lp', f0: 900 });
    return _dspSat(o, 1.4);
  } },
  rotor: { div: 4, sec: 2, fn: function (sr, rng, sec) {
    var o = new Float32Array(Math.round((sec + 0.4) * sr)), per = 1 / _dspFit(19, sec);
    for (var t = 0; t < sec + 0.4; t += per)                           /* each blade's slap */
      _dspLayerNoise(o, sr, rng, { at: t, dur: 0.05, amp: 0.8, a: 0.003, tau: 0.012, color: 'pink', type: 'lp', f0: 1000 });
    _dspLayerTone(o, sr, { dur: sec + 0.4, amp: 0.06, tau: 1e9, f0: _dspFit(1700, sec) });
    _dspLayerTone(o, sr, { dur: sec + 0.4, amp: 0.3, tau: 1e9, f0: _dspFit(38, sec) });
    return o;
  } },
  jet: { div: 2, sec: 3, fn: function (sr, rng, sec) {
    var o = new Float32Array(Math.round((sec + 0.5) * sr));
    _dspLayerNoise(o, sr, rng, { dur: sec + 0.5, amp: 0.8, tau: 1e9, color: 'pink', type: 'lp', f0: 2600, wob: 1.2, wd: 0.2 });
    _dspLayerNoise(o, sr, rng, { dur: sec + 0.5, amp: 0.5, tau: 1e9, color: 'brown', type: 'lp', f0: 300 });
    _dspLayerTone(o, sr, { dur: sec + 0.5, amp: 0.05, tau: 1e9, f0: _dspFit(3300, sec) });
    return o;
  } },
  boat: { div: 4, sec: 3, fn: function (sr, rng, sec) {
    var o = new Float32Array(Math.round((sec + 0.5) * sr)), per = 1 / _dspFit(6, sec);
    for (var t = 0; t < sec + 0.5; t += per)                           /* the diesel's beat */
      _dspLayerTone(o, sr, { at: t, dur: per, amp: 0.7, a: 0.01, tau: 0.07, shape: 'saw', f0: 30, f1: 26, type: 'lp', c0: 240 });
    _dspLayerNoise(o, sr, rng, { dur: sec + 0.5, amp: 0.4, tau: 1e9, color: 'pink', type: 'lp', f0: 1300, wob: 0.7, wd: 0.5 });
    return o;
  } },
  bridge: { div: 4, sec: 3, fn: function (sr, rng, sec) {
    var o = new Float32Array(Math.round((sec + 0.5) * sr));
    _dspLayerNoise(o, sr, rng, { dur: sec + 0.5, amp: 0.9, tau: 1e9, color: 'brown', type: 'lp', f0: 150, wob: 3, wd: 0.4 });
    return o;
  } },
  hum: { div: 4, sec: 2, fn: function (sr, rng, sec) {
    var o = new Float32Array(Math.round((sec + 0.4) * sr));
    [[60, 0.6], [120, 0.35], [180, 0.2], [240, 0.08]].forEach(function (h) { _dspLayerTone(o, sr, { dur: sec + 0.4, amp: h[1], tau: 1e9, f0: _dspFit(h[0], sec) }); });
    _dspLayerTone(o, sr, { dur: sec + 0.4, amp: 0.06, tau: 1e9, shape: 'square', f0: _dspFit(120, sec), type: 'lp', c0: 1600 });
    return o;
  } },
  build: { div: 2, sec: 5, fn: function (sr, rng, sec) {
    var o = new Float32Array(Math.round((sec + 0.6) * sr));
    for (var t = 0.2; t < sec; t += 0.35 + rng() * 0.6) {
      if (rng() < 0.55) {                                              /* a hammer on steel */
        var f = 600 + rng() * 900;
        _dspLayerModal(o, sr, { at: t, dur: 0.3, amp: 0.4, modes: [{ f: f, t60: 0.2, a: 1 }, { f: f * 2.4, t60: 0.12, a: 0.5 }, { f: f * 3.9, t60: 0.08, a: 0.3 }] });
      } else {                                                         /* a weld, crackling */
        _dspLayerCrackle(o, sr, rng, { at: t, dur: 0.6, amp: 0.3, rate: 2500, a: 0.02, h: 0.3, tau: 0.08, type: 'bp', f0: 3800, q: 1.2 });
      }
    }
    return o;
  } }
};

/* One loop, rendered: a Float32Array, or [left, right] for a stereo one, each side its own seed. */
function _rtsLoopRender(name, sr) {
  var L = RTS_LOOPS[name];
  if (!L) return null;
  var x = 0.3;
  function side(seed) {
    var y = L.fn(sr, _dspRng(seed), L.sec);
    return _dspNorm(_dspLoop(y, sr, L.sec, x), 0.8);
  }
  var seed = 0;
  for (var i = 0; i < name.length; i++) seed = (seed * 31 + name.charCodeAt(i)) >>> 0;
  return L.stereo ? [side(seed + 1), side(seed + 2)] : side(seed + 1);
}
