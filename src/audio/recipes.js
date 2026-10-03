/* audio/recipes.js - what the battle sounds like: the guns and what they hit.

   Each effect is LAYERS, the way a real one is heard. A gunshot is a supersonic crack (a few
   milliseconds of broadband noise), the report (lower, longer noise, the gas leaving the barrel),
   a thump of pressure (a falling sine), the slap of the shot coming back off the land, and the
   action cycling (a struck-metal ring). A shell landing is a thud, a spray of dirt and the grit
   falling after it. An explosion has a sub-bass push, a second blast, a long rumble and debris
   that keeps landing for two seconds.

   Every number that shapes a layer is varied by a few per cent per take (_dspJit), with the
   take's own seed, so a squad firing is never one sample played over and over. The bank renders
   `takes` of each (audio/bank.js); `peak` is what the take is normalised to and `cat` which bus
   it plays through (audio/mix.js). `len` is in seconds.

   `heard` is how loud the effect is MEANT to sound - dB of its loudest 400 ms, weighted the way
   the ear weights it (A-weighting) - and `vol` the gain that gets it there. A peak says nothing
   about loudness: a click and a building's collapse can share one. unit/sfx measures every
   effect and holds `vol` to `heard`, so a recipe retuned without its gain fails there.

   UI and world sounds - the clicks, the chimes, the klaxon, the thunder - are audio/recipes2.js. */

var RTS_SFX_WAR = {
  /* infantry small arms: a sharp crack, a short report, a slap off the land */
  rifle: { cat: 'gun', len: 0.6, takes: 5, peak: 0.9, heard: -20, vol: 1.12, fn: function (sr, rng) {
    var o = new Float32Array(Math.round(0.6 * sr)), J = function (x, k) { return _dspJit(rng, x, k || 0.08); };
    _dspLayerNoise(o, sr, rng, { dur: 0.05, amp: 1.0, a: 0.0004, tau: J(0.006), type: 'hp', f0: J(2200) });
    _dspLayerNoise(o, sr, rng, { dur: 0.25, amp: 0.85, a: 0.0008, tau: J(0.035), color: 'pink', type: 'lp', f0: J(3800), f1: 700, q: 0.8 });
    _dspLayerTone(o, sr, { dur: 0.12, amp: 0.5, tau: J(0.03), f0: J(170), f1: 70 });
    _dspLayerNoise(o, sr, rng, { at: J(0.03, 0.3), dur: 0.5, amp: 0.16, a: 0.01, tau: J(0.12), color: 'pink', type: 'lp', f0: 1100, f1: 350 });
    _dspLayerModal(o, sr, { at: 0.002, dur: 0.08, amp: 0.1, modes: [{ f: J(3150), t60: 0.03, a: 1 }, { f: J(4720), t60: 0.02, a: 0.6 }] });
    return _dspSat(o, 1.6);
  } },

  /* a machine gun's round: lighter and higher, a bolt that clacks */
  mg: { cat: 'gun', len: 0.45, takes: 5, peak: 0.85, heard: -22, vol: 1.66, fn: function (sr, rng) {
    var o = new Float32Array(Math.round(0.45 * sr)), J = function (x, k) { return _dspJit(rng, x, k || 0.08); };
    _dspLayerNoise(o, sr, rng, { dur: 0.03, amp: 1.0, a: 0.0003, tau: J(0.004), type: 'hp', f0: J(2800) });
    _dspLayerNoise(o, sr, rng, { dur: 0.18, amp: 0.7, a: 0.0006, tau: J(0.024), color: 'pink', type: 'lp', f0: J(4500), f1: 1000, q: 0.8 });
    _dspLayerTone(o, sr, { dur: 0.08, amp: 0.35, tau: J(0.02), f0: J(240), f1: 110 });
    _dspLayerNoise(o, sr, rng, { at: 0.02, dur: 0.4, amp: 0.1, a: 0.008, tau: J(0.08), color: 'pink', type: 'lp', f0: 1300, f1: 400 });
    _dspLayerModal(o, sr, { at: J(0.035, 0.2), dur: 0.06, amp: 0.14, modes: [{ f: J(2650), t60: 0.03, a: 1 }, { f: J(4100), t60: 0.02, a: 0.5 }] });
    return _dspSat(o, 1.5);
  } },

  /* a tank's main gun: a blast, a deep push, a rolling tail, and the breech clanking open */
  cannon: { cat: 'gun', len: 1.6, takes: 4, peak: 0.95, heard: -16, vol: 1.10, fn: function (sr, rng) {
    var o = new Float32Array(Math.round(1.6 * sr)), J = function (x, k) { return _dspJit(rng, x, k || 0.08); };
    _dspLayerNoise(o, sr, rng, { dur: 0.08, amp: 1.0, a: 0.0005, tau: J(0.014), type: 'hp', f0: J(500) });
    _dspLayerTone(o, sr, { dur: 0.6, amp: 1.0, a: 0.002, tau: J(0.16), f0: J(115), f1: 40 });
    _dspLayerNoise(o, sr, rng, { dur: 0.6, amp: 0.9, a: 0.001, tau: J(0.11), color: 'pink', type: 'lp', f0: J(2800), f1: 260 });
    _dspLayerNoise(o, sr, rng, { at: 0.01, dur: 1.5, amp: 0.45, a: 0.03, tau: J(0.45), color: 'brown', type: 'lp', f0: 420, f1: 110 });
    _dspLayerModal(o, sr, { at: J(0.13, 0.15), dur: 0.4, amp: 0.1, modes: [
      { f: J(880), t60: 0.25, a: 1 }, { f: J(1370), t60: 0.2, a: 0.7 }, { f: J(2240), t60: 0.15, a: 0.5 }, { f: J(3510), t60: 0.1, a: 0.3 }] });
    return _dspSat(o, 2.4);
  } },

  /* a gun on a wall: as heavy, tighter, a harder crack */
  turretgun: { cat: 'gun', len: 1.3, takes: 4, peak: 0.92, heard: -16.5, vol: 1.15, fn: function (sr, rng) {
    var o = new Float32Array(Math.round(1.3 * sr)), J = function (x, k) { return _dspJit(rng, x, k || 0.08); };
    _dspLayerNoise(o, sr, rng, { dur: 0.06, amp: 1.0, a: 0.0004, tau: J(0.01), type: 'hp', f0: J(900) });
    _dspLayerTone(o, sr, { dur: 0.45, amp: 0.85, a: 0.002, tau: J(0.13), f0: J(145), f1: 55 });
    _dspLayerNoise(o, sr, rng, { dur: 0.5, amp: 0.85, a: 0.001, tau: J(0.09), color: 'pink', type: 'lp', f0: J(3400), f1: 380 });
    _dspLayerNoise(o, sr, rng, { at: 0.01, dur: 1.2, amp: 0.35, a: 0.02, tau: J(0.34), color: 'brown', type: 'lp', f0: 480, f1: 130 });
    _dspLayerModal(o, sr, { at: J(0.09, 0.15), dur: 0.3, amp: 0.1, modes: [
      { f: J(1040), t60: 0.2, a: 1 }, { f: J(1650), t60: 0.16, a: 0.6 }, { f: J(2610), t60: 0.12, a: 0.4 }] });
    return _dspSat(o, 2.2);
  } },

  /* a rocket: the motor lighting, a rasp, and the whoosh rising then falling away */
  rocket: { cat: 'gun', len: 1.1, takes: 4, peak: 0.85, heard: -17, vol: 0.43, fn: function (sr, rng) {
    var o = new Float32Array(Math.round(1.1 * sr)), J = function (x, k) { return _dspJit(rng, x, k || 0.08); };
    _dspLayerNoise(o, sr, rng, { dur: 0.06, amp: 0.7, a: 0.0005, tau: J(0.012), type: 'hp', f0: 900 });
    _dspLayerTone(o, sr, { dur: 0.12, amp: 0.3, tau: 0.03, f0: J(320), f1: 120 });
    _dspLayerNoise(o, sr, rng, { at: 0.01, dur: 0.4, amp: 0.9, a: 0.05, tau: J(0.16), color: 'pink', type: 'bp', f0: J(650), f1: J(2600), q: 1.3 });
    _dspLayerNoise(o, sr, rng, { at: 0.18, dur: 0.9, amp: 0.6, a: 0.05, tau: J(0.3), color: 'pink', type: 'bp', f0: 2600, f1: J(700), q: 1.1 });
    _dspLayerTone(o, sr, { at: 0.02, dur: 0.7, amp: 0.14, a: 0.04, tau: 0.25, shape: 'saw', f0: J(85), f1: J(150), type: 'lp', c0: 1400, c1: 900 });
    return _dspSat(o, 1.5);
  } },

  /* a shell landing on ground: a thud, a spray of dirt, the grit pattering down after */
  hit: { cat: 'boom', len: 0.9, takes: 5, peak: 0.85, heard: -19, vol: 1.08, fn: function (sr, rng) {
    var o = new Float32Array(Math.round(0.9 * sr)), J = function (x, k) { return _dspJit(rng, x, k || 0.1); };
    _dspLayerTone(o, sr, { dur: 0.3, amp: 0.8, a: 0.001, tau: J(0.08), f0: J(95), f1: 40 });
    _dspLayerNoise(o, sr, rng, { dur: 0.3, amp: 1.0, a: 0.0008, tau: J(0.06), color: 'pink', type: 'lp', f0: J(1800), f1: 260 });
    _dspLayerCrackle(o, sr, rng, { at: 0.004, dur: 0.4, amp: 0.22, rate: J(1100), tau: J(0.08), type: 'bp', f0: 2200, f1: 1400, q: 1.2 });
    _dspLayerCrackle(o, sr, rng, { at: J(0.09), dur: 0.7, amp: 0.15, rate: J(140), tau: J(0.22), type: 'bp', f0: 1600, q: 2 });
    return _dspSat(o, 1.8);
  } },

  /* a round landing in water: a whump, the spray, bubbles - and no crack, which water does not make */
  splash: { cat: 'boom', len: 1.0, takes: 4, peak: 0.8, heard: -21, vol: 1.19, fn: function (sr, rng) {
    var o = new Float32Array(Math.round(1.0 * sr)), J = function (x, k) { return _dspJit(rng, x, k || 0.1); };
    _dspLayerTone(o, sr, { dur: 0.3, amp: 0.6, a: 0.003, tau: J(0.07), f0: J(125), f1: 55 });
    _dspLayerNoise(o, sr, rng, { dur: 0.7, amp: 0.3, a: 0.01, tau: J(0.15), type: 'bp', f0: J(2700), f1: 1000, q: 0.8 });
    _dspLayerNoise(o, sr, rng, { dur: 0.5, amp: 0.55, a: 0.005, tau: J(0.11), color: 'pink', type: 'lp', f0: 1500, f1: 420 });
    for (var b = 0; b < 11; b++) {
      _dspLayerBubble(o, sr, { at: 0.04 + rng() * 0.55, dur: 0.12, amp: 0.07 + rng() * 0.09, f: 380 + rng() * 1100, tau: 0.025 + rng() * 0.035 });
    }
    return o;
  } },

  /* a vehicle going up: a crack, a deep blast, metal raining down, the fire catching */
  pop: { cat: 'boom', len: 1.9, takes: 4, peak: 0.95, heard: -15, vol: 0.89, fn: function (sr, rng) {
    var o = new Float32Array(Math.round(1.9 * sr)), J = function (x, k) { return _dspJit(rng, x, k || 0.1); };
    _dspLayerNoise(o, sr, rng, { dur: 0.1, amp: 1.0, a: 0.0005, tau: J(0.018), type: 'hp', f0: 600 });
    _dspLayerTone(o, sr, { dur: 0.9, amp: 1.0, a: 0.002, tau: J(0.24), f0: J(92), f1: 30 });
    _dspLayerNoise(o, sr, rng, { dur: 0.9, amp: 0.9, a: 0.001, tau: J(0.22), color: 'pink', type: 'lp', f0: J(3200), f1: 220 });
    _dspLayerNoise(o, sr, rng, { at: 0.02, dur: 1.8, amp: 0.5, a: 0.04, tau: J(0.6), color: 'brown', type: 'lp', f0: 380, f1: 90 });
    for (var c = 0; c < 3; c++) {
      var f = 650 + rng() * 2300;
      _dspLayerModal(o, sr, { at: 0.12 + c * J(0.17, 0.3), dur: 0.3, amp: 0.06 + rng() * 0.07, modes: [{ f: f, t60: 0.2, a: 1 }, { f: f * 1.58, t60: 0.15, a: 0.5 }, { f: f * 2.37, t60: 0.1, a: 0.3 }] });
    }
    _dspLayerCrackle(o, sr, rng, { at: 0.1, dur: 1.7, amp: 0.16, rate: J(420), a: 0.1, tau: J(0.5), type: 'bp', f0: 3000, q: 1 });
    return _dspSat(o, 2.2);
  } },

  /* a building coming down: two blasts, a long rumble, masonry falling for two seconds */
  boom: { cat: 'boom', len: 2.9, takes: 3, peak: 0.98, heard: -12, vol: 0.97, fn: function (sr, rng) {
    var o = new Float32Array(Math.round(2.9 * sr)), J = function (x, k) { return _dspJit(rng, x, k || 0.1); };
    _dspLayerNoise(o, sr, rng, { dur: 0.12, amp: 1.0, a: 0.0006, tau: J(0.025), type: 'hp', f0: 420 });
    _dspLayerTone(o, sr, { dur: 1.4, amp: 1.1, a: 0.003, tau: J(0.42), f0: J(72), f1: 24 });
    _dspLayerNoise(o, sr, rng, { dur: 1.2, amp: 1.0, a: 0.001, tau: J(0.4), color: 'pink', type: 'lp', f0: J(2300), f1: 150 });
    var t2 = J(0.18, 0.25);
    _dspLayerNoise(o, sr, rng, { at: t2, dur: 1.2, amp: 0.7, a: 0.002, tau: J(0.45), color: 'pink', type: 'lp', f0: 1700, f1: 120 });
    _dspLayerTone(o, sr, { at: t2, dur: 0.9, amp: 0.6, a: 0.002, tau: J(0.28), f0: J(62), f1: 25 });
    _dspLayerNoise(o, sr, rng, { at: 0.03, dur: 2.8, amp: 0.6, a: 0.06, tau: J(1.0), color: 'brown', type: 'lp', f0: 320, f1: 70, wob: 6, wd: 0.3 });
    _dspLayerCrackle(o, sr, rng, { at: 0.1, dur: 2.5, amp: 0.13, rate: J(260), a: 0.05, tau: J(0.85), type: 'bp', f0: 2000, f1: 1200, q: 1.2 });
    for (var m = 0; m < 5; m++) {
      var at = 0.3 + rng() * 1.4;
      _dspLayerTone(o, sr, { at: at, dur: 0.2, amp: 0.18, tau: 0.045, f0: 125 + rng() * 40, f1: 60 });
      _dspLayerNoise(o, sr, rng, { at: at, dur: 0.2, amp: 0.2, tau: 0.04, color: 'pink', type: 'lp', f0: 950 });
    }
    return _dspSat(o, 2.5);
  } }
};

/* One recipe by name, from whichever table holds it; null for a name nothing makes. */
function _rtsSfxRecipe(name) {
  return RTS_SFX_WAR[name] || (typeof RTS_SFX_UI !== 'undefined' && RTS_SFX_UI[name]) || null;
}
/* every effect there is a recipe for */
function rtsSfxNames() {
  return Object.keys(RTS_SFX_WAR).concat(typeof RTS_SFX_UI !== 'undefined' ? Object.keys(RTS_SFX_UI) : []);
}
/* One take of an effect, rendered: a Float32Array at `sr`, normalised, its end brought to rest. */
function _rtsSfxRender(name, take, sr) {
  var R = _rtsSfxRecipe(name);
  if (!R) return null;
  var seed = 0;
  for (var i = 0; i < name.length; i++) seed = (seed * 31 + name.charCodeAt(i)) >>> 0;
  var x = R.fn(sr, _dspRng(seed + 7919 * (take + 1)));
  /* the last fifth of it released along a raised cosine: a tail still ringing when its buffer
     ends would otherwise stop dead, and that is heard as a cut even where it does not click */
  return _dspRelease(_dspNorm(x, R.peak), Math.max(Math.round(sr * 0.03), Math.round(x.length * 0.2)));
}
