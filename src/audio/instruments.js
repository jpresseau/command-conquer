/* audio/instruments.js - the band the score is played on (audio/score.js, audio/music.js).

   THE OLD MUSIC WAS FIVE OSCILLATORS: a sine kick, a noise snare, a noise hat, a saw bass and a
   saw lead, built live on every step of a one-bar loop. These are rendered instead, once a note,
   with the same tools as the effects (audio/dsp.js), and the sequencer plays the finished buffers:

     DRUMS    a kick with a click, a pitch drop and a sub; a snare that is a tuned shell and a
              burst of wires; closed and open hats and a crash from metal, not plain hiss; two
              toms; a shaker for the quiet passages
     BASS     a saw with a square an octave under it, its filter closing as the note dies; and a
              driven version for a battle
     PLUCK    the arpeggio: a short, bright, falling saw
     LEAD     two detuned saws and a square below, with a vibrato that arrives late, as a player's
     PAD      each chord on three detuned saws a note, in stereo, slow to rise
     BRASS    a chord stabbed: the filter opening and shutting in a quarter of a second

   A pitched note is keyed by MIDI number, a chord by its name (audio/score.js), and the pad by
   its length too, because a pad lasts exactly a bar of the song it is in. Every render is pure
   and seeded: unit/music renders the whole band in node and checks every note is in tune. */

function _rtsMidiHz(m) { return 440 * Math.pow(2, (m - 69) / 12); }

/* a saw (or square, or triangle) at a steady pitch with a vibrato that fades in after `vd` s */
function _dspVoice(n, sr, shape, f, vib, vd, cents) {
  var out = new Float32Array(n), ph = 0, f0 = f * Math.pow(2, (cents || 0) / 1200), i, dt, v, w;
  for (i = 0; i < n; i++) {
    var t = i / sr, m = vib && t > vd ? 1 + vib * Math.min(1, (t - vd) / 0.3) * Math.sin(2 * Math.PI * 5.4 * t) : 1;
    dt = f0 * m / sr;
    if (shape === 'square') v = (ph < 0.5 ? 1 : -1) + _dspBlep(ph, dt) - _dspBlep((ph + 0.5) % 1, dt);
    else if (shape === 'tri') v = ph < 0.5 ? 4 * ph - 1 : 3 - 4 * ph;
    else v = 2 * ph - 1 - _dspBlep(ph, dt);
    out[i] = v;
    ph += dt; if (ph >= 1) ph -= 1;
  }
  return out;
}

var RTS_INST = {
  kick: function (sr, rng) {
    var o = new Float32Array(Math.round(0.6 * sr));
    _dspLayerTone(o, sr, { dur: 0.5, amp: 1.0, a: 0.001, tau: 0.16, f0: 150, f1: 44 });
    _dspLayerTone(o, sr, { dur: 0.6, amp: 0.5, a: 0.004, tau: 0.25, f0: 52, f1: 45 });
    _dspLayerNoise(o, sr, rng, { dur: 0.02, amp: 0.35, a: 0.0003, tau: 0.003, type: 'hp', f0: 2500 });
    return _dspSat(o, 1.8);
  },
  snare: function (sr, rng) {
    var o = new Float32Array(Math.round(0.5 * sr));
    _dspLayerTone(o, sr, { dur: 0.25, amp: 0.7, a: 0.001, tau: 0.06, f0: 210, f1: 175 });
    _dspLayerTone(o, sr, { dur: 0.2, amp: 0.3, a: 0.001, tau: 0.04, f0: 330, f1: 300 });
    _dspLayerNoise(o, sr, rng, { dur: 0.45, amp: 0.9, a: 0.001, tau: 0.12, type: 'bp', f0: 4200, f1: 2600, q: 0.6 });
    return _dspSat(o, 1.6);
  },
  hatC: function (sr, rng) {
    var o = new Float32Array(Math.round(0.12 * sr));
    _dspLayerNoise(o, sr, rng, { dur: 0.12, amp: 0.8, a: 0.0005, tau: 0.018, type: 'hp', f0: 7500, type2: 'bp', g0: 10000, q2: 0.8 });
    _dspLayerModal(o, sr, { dur: 0.12, amp: 0.08, modes: [{ f: 3240, t60: 0.05, a: 1 }, { f: 5070, t60: 0.04, a: 0.8 }, { f: 7310, t60: 0.03, a: 0.6 }] });
    return o;
  },
  hatO: function (sr, rng) {
    var o = new Float32Array(Math.round(0.6 * sr));
    _dspLayerNoise(o, sr, rng, { dur: 0.6, amp: 0.7, a: 0.002, tau: 0.16, type: 'hp', f0: 6500, type2: 'bp', g0: 9500, q2: 0.7 });
    _dspLayerModal(o, sr, { dur: 0.6, amp: 0.07, modes: [{ f: 3240, t60: 0.4, a: 1 }, { f: 5070, t60: 0.35, a: 0.8 }, { f: 7310, t60: 0.3, a: 0.6 }] });
    return o;
  },
  crash: function (sr, rng) {
    var o = new Float32Array(Math.round(2.4 * sr));
    _dspLayerNoise(o, sr, rng, { dur: 2.4, amp: 0.8, a: 0.003, tau: 0.7, type: 'hp', f0: 4200, f1: 3000 });
    _dspLayerModal(o, sr, { dur: 2.4, amp: 0.12, modes: [
      { f: 2120, t60: 1.6, a: 1 }, { f: 3390, t60: 1.4, a: 0.8 }, { f: 4870, t60: 1.2, a: 0.7 }, { f: 6630, t60: 1.0, a: 0.5 }, { f: 8810, t60: 0.8, a: 0.4 }] });
    return o;
  },
  tomH: function (sr, rng) {
    var o = new Float32Array(Math.round(0.6 * sr));
    _dspLayerTone(o, sr, { dur: 0.6, amp: 1.0, a: 0.001, tau: 0.18, f0: 175, f1: 128 });
    _dspLayerNoise(o, sr, rng, { dur: 0.1, amp: 0.25, a: 0.001, tau: 0.02, color: 'pink', type: 'lp', f0: 2500 });
    return _dspSat(o, 1.4);
  },
  tomL: function (sr, rng) {
    var o = new Float32Array(Math.round(0.8 * sr));
    _dspLayerTone(o, sr, { dur: 0.8, amp: 1.0, a: 0.001, tau: 0.24, f0: 118, f1: 82 });
    _dspLayerNoise(o, sr, rng, { dur: 0.1, amp: 0.25, a: 0.001, tau: 0.02, color: 'pink', type: 'lp', f0: 2000 });
    return _dspSat(o, 1.4);
  },
  shaker: function (sr, rng) {
    var o = new Float32Array(Math.round(0.12 * sr));
    _dspLayerNoise(o, sr, rng, { dur: 0.12, amp: 0.6, a: 0.012, tau: 0.03, type: 'bp', f0: 6200, q: 1.2 });
    return o;
  },
  /* a bass note: saw over a square an octave down, the filter closing as it dies */
  bass: function (sr, rng, m, sec) { return _rtsInstBass(sr, m, 1.4, sec); },
  bassD: function (sr, rng, m, sec) { return _rtsInstBass(sr, m, 3.2, sec); },
  pluck: function (sr, rng, m) {
    var f = _rtsMidiHz(m), n = Math.round(0.7 * sr), o = new Float32Array(n);
    var a = _dspVoice(n, sr, 'saw', f), b = _dspVoice(n, sr, 'square', f, 0, 0, 7);
    for (var i = 0; i < n; i++) o[i] = a[i] * 0.7 + b[i] * 0.3;
    _dspFilter(o, sr, 'lp', Math.min(6000, f * 9), f * 1.5, 0.9);
    _dspEnv(o, sr, 0.002, 0.18);
    return o;
  },
  lead: function (sr, rng, m, sec) {
    var f = _rtsMidiHz(m), n = Math.round((sec || 2.2) * sr), o = new Float32Array(n);
    var a = _dspVoice(n, sr, 'saw', f, 0.006, 0.18, -6), b = _dspVoice(n, sr, 'saw', f, 0.006, 0.18, 6), c = _dspVoice(n, sr, 'square', f / 2, 0.006, 0.18);
    for (var i = 0; i < n; i++) o[i] = (a[i] + b[i]) * 0.4 + c[i] * 0.22;
    _dspSat(o, 1.3);                                    /* the grit before the filter, which takes its top off */
    _dspFilter(o, sr, 'lp', Math.min(3400, sr * 0.28), 2400, 1.1);
    return _dspEnv(o, sr, 0.012, 2.5, 0.05);
  }
};

function _rtsInstBass(sr, m, drive, sec) {
  var f = _rtsMidiHz(m), n = Math.round((sec || 1.6) * sr), o = new Float32Array(n);
  var a = _dspVoice(n, sr, 'saw', f), b = _dspVoice(n, sr, 'square', f / 2);
  for (var i = 0; i < n; i++) o[i] = a[i] * 0.6 + b[i] * 0.45;
  _dspFilter(o, sr, 'lp', 1600 + drive * 300, 260, 1.4);
  _dspEnv(o, sr, 0.004, 1.2, 0.04);
  return _dspSat(o, drive);
}

/* A chord on the pad, `sec` long: three saws a note, spread across the two sides. */
function _rtsInstPad(sr, notes, sec) {
  var n = Math.round(sec * sr), L = new Float32Array(n), R = new Float32Array(n), j, i;
  var det = [[-9, 3], [-3, 9], [0, 0]];                       /* cents, left and right */
  notes.forEach(function (m) {
    var f = _rtsMidiHz(m);
    for (j = 0; j < 3; j++) {
      var l = _dspVoice(n, sr, 'saw', f, 0, 0, det[j][0]), r = _dspVoice(n, sr, 'saw', f, 0, 0, det[j][1]);
      for (i = 0; i < n; i++) { L[i] += l[i]; R[i] += r[i]; }
    }
  });
  [L, R].forEach(function (x) {
    _dspFilter(x, sr, 'lp', 900, 1500, 0.7);
    var a = Math.round(0.35 * sr);
    for (i = 0; i < a; i++) x[i] *= i / a;
    _dspRelease(x, Math.round(0.6 * sr));
  });
  return [L, R];
}
/* A chord stabbed on the brass. */
function _rtsInstBrass(sr, notes) {
  var n = Math.round(0.7 * sr), o = new Float32Array(n), i;
  notes.forEach(function (m) {
    var f = _rtsMidiHz(m), a = _dspVoice(n, sr, 'saw', f, 0, 0, -5), b = _dspVoice(n, sr, 'saw', f, 0, 0, 5);
    for (i = 0; i < n; i++) o[i] += a[i] + b[i];
  });
  var x = Float32Array.from(o);
  _dspFilter(o, sr, 'lp', 3600, 700, 1.2);                  /* the blare, closing */
  _dspFilter(x, sr, 'lp', 500, 500, 0.7);                   /* and the body under it */
  for (i = 0; i < n; i++) o[i] = o[i] * 0.7 + x[i] * 0.5;
  _dspEnv(o, sr, 0.012, 0.22, 0.04);
  return _dspSat(o, 1.6);
}

/* THE LOW ONES AT A LOWER RATE. Most of the band is filtered well below the top of the hearing
   range - the pad under 1.5 kHz, the bass under 2.6, the lead under 3.4, the arpeggio under 6 - so
   a full-rate buffer would spend most of its memory on silence. They render at a half or a
   quarter of the context's rate, and the context resamples them as they play. Measured, a song's
   samples were 23 MB at full rate and full length; at these rates and only as long as the song
   holds each note, 7. */
var RTS_INST_RATE = { bass: 4, bassD: 4, pad: 4, lead: 4, pluck: 2 };

/* One rendered sample for the sampler: `inst` and its key (a MIDI number, a chord's notes, or
   nothing for a drum), `sec` long where its length varies; normalised. A Float32Array, or
   [left, right] for the pad. */
function _rtsInstRender(inst, key, sr, sec) {
  var rng = _dspRng(1 + inst.length * 97 + (typeof key === 'number' ? key : 0));
  if (inst === 'pad') { var p = _rtsInstPad(sr, key, sec); _dspNorm(p[0], 0.5); _dspNorm(p[1], 0.5); return p; }
  if (inst === 'brass') return _dspNorm(_rtsInstBrass(sr, key), 0.8);
  var fn = RTS_INST[inst];
  if (!fn) return null;
  return _dspRelease(_dspNorm(fn(sr, rng, key, sec), 0.9), Math.round(0.02 * sr));
}
