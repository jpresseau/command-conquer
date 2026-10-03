/* RED ALERT - audio. Everything here is SYNTHESIZED: there is not a single sampled asset in the
   app, from any game or anywhere else. The effects are rendered ahead of time from layered
   recipes (audio/recipes.js, audio/dsp.js) into a bank of takes (audio/bank.js) and played
   through a mixer with stereo position, a room and a compressor (audio/mix.js); the music is a
   sequenced drum machine plus a bass and lead through a waveshaper.

   Two rules keep it from turning into mush during a big fight:
   - Sounds are positional: an event outside the visible map area is not played at full voice
     (a little way off it is heard muffled, rts.ambience.js), and one on screen is placed left
     or right by where it is.
   - Every effect name has a minimum retrigger gap, so a squad firing in unison makes one
     satisfying crack rather than eight phase-cancelling ones - and past the gap, the mixer
     caps how many play at once (RTS_VOICE_MAX). */

var _rtsA = null;

function _rtsAudioInit() {
  if (_rtsA) return _rtsA;
  var AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  var ctx;
  try { ctx = new AC(); } catch (_e) { return null; }
  var master = ctx.createGain(); master.gain.value = 0.9;
  /* THE LID: everything passes a compressor on its way out, then a soft clip, so a barrage is
     loud and stays clean. The clip is not optional: a compressor alone let sixty simultaneous
     effects out at 1.5 - its attack is slower than a gunshot's, and Chrome adds makeup gain -
     where the clip rounds whatever is left over under full scale and leaves anything quieter
     than about half of it untouched (e2e/sfxmix). */
  var lid = null, out = null;
  try {
    lid = ctx.createDynamicsCompressor();
    lid.threshold.value = -12; lid.knee.value = 8; lid.ratio.value = 4;
    lid.attack.value = 0.003; lid.release.value = 0.25;
    out = ctx.createWaveShaper();
    var cn = 2048, cv = new Float32Array(cn);
    /* the shaper's input runs -1..1; it stands for -4..4, so the gain in front is a quarter */
    for (var ci = 0; ci < cn; ci++) { var cx = (ci / (cn - 1) * 2 - 1) * 4; cv[ci] = Math.abs(cx) < 0.5 ? cx : (cx < 0 ? -1 : 1) * (0.5 + 0.49 * Math.tanh((Math.abs(cx) - 0.5) / 0.49)); }
    out.curve = cv; out.oversample = '4x';
    var quarter = ctx.createGain(); quarter.gain.value = 0.25;
    master.connect(lid); lid.connect(quarter); quarter.connect(out); out.connect(ctx.destination);
  } catch (_e) { lid = null; out = null; master.connect(ctx.destination); }
  var sfxBus = ctx.createGain(); sfxBus.gain.value = 0.6; sfxBus.connect(master);
  var musBus = ctx.createGain(); musBus.gain.value = 0.28; musBus.connect(master);

  /* one second of white noise, reused by every noise-based effect */
  var nb = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  var nd = nb.getChannelData(0);
  for (var i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

  _rtsA = { ctx:ctx, master:master, lid:lid, out:out, sfx:sfxBus, mus:musBus, noise:nb,
    last:{}, muted:false, music:null, t0:0 };
  try { _rtsMixInit(_rtsA); _rtsBankIdle(_rtsA); } catch (_e) {}
  return _rtsA;
}
function _rtsAudioResume() {
  if (_rtsA && _rtsA.ctx.state === 'suspended') { try { _rtsA.ctx.resume(); } catch (_e) {} }
}
function rtsMuteToggle() {
  var A = _rtsA;
  if (!A) return;
  A.muted = !A.muted;
  A.master.gain.setTargetAtTime(A.muted ? 0 : 0.9, A.ctx.currentTime, 0.02);
  var b = document.getElementById('rtsMute');
  if (b) { b.textContent = A.muted ? '🔇' : '🔊'; b.title = A.muted ? 'Sound off' : 'Sound on'; }
}

/* ---------------------------------------------------------------- helpers */
/* NB: named _rtsWaveShaper, not _rtsDist - src/core already owns _rtsDist (distance
   between two entities). Everything here shares one global namespace, and core loads later,
   so the collision silently replaced this function and killed the music with a type error. */
function _rtsWaveShaper(amount) {
  var ctx = _rtsA.ctx, ws = ctx.createWaveShaper(), n = 1024, curve = new Float32Array(n);
  var k = amount || 12;
  for (var i = 0; i < n; i++) {
    var x = (i / (n - 1)) * 2 - 1;
    curve[i] = (1 + k) * x / (1 + k * Math.abs(x));
  }
  ws.curve = curve; ws.oversample = '2x';
  return ws;
}

/* Only play things the player can actually see - a battle on the far side of the map should
   not be audible, and it keeps the voice count sane. */
function _rtsAudible(x, z) {
  var R = _rtsR;
  if (!R) return true;
  if (x == null) return true;
  var vs = _rtsViewSpan();
  /* in the camera's own frame when it has one: across it and into it, whichever way it faces */
  if (vs.cw) {
    var c = _r3dToCam(x - R.focus.x, z - R.focus.z);
    return Math.abs(c.u) < vs.cw * 0.75 && Math.abs(c.v) < vs.ch * 0.85;
  }
  return Math.abs(x - R.focus.x) < vs.w * 0.75 && Math.abs(z - R.focus.z) < vs.h * 0.85;
}

var _RTS_SFX_GAP = { rifle:0.05, mg:0.04, cannon:0.07, rocket:0.07, turretgun:0.07,
  hit:0.05, splash:0.06, pop:0.06, boom:0.09, select:0.08, order:0.08 };

/* ...and a fight a little way off the screen: heard, but muffled (rts.ambience.js). */
function _rtsAudibleFar(x, z) {
  var R = _rtsR;
  if (!R || x == null) return false;
  var vs = _rtsViewSpan(), f = typeof RTS_FAR === 'number' ? RTS_FAR : 0;
  if (vs.cw) {
    var c = _r3dToCam(x - R.focus.x, z - R.focus.z);
    return Math.abs(c.u) < vs.cw * 0.75 * f && Math.abs(c.v) < vs.ch * 0.85 * f;
  }
  return Math.abs(x - R.focus.x) < vs.w * 0.75 * f && Math.abs(z - R.focus.z) < vs.h * 0.85 * f;
}

function _rtsSfx(name, x, z) {
  var A = _rtsA;
  if (!A || A.muted) return;
  if (!_rtsAudible(x, z)) {
    /* out of sight but not out of earshot: through the ambience's muffled bus, if there is one */
    var B = typeof _rtsAmbNodes === 'function' ? _rtsAmbNodes() : null;
    if (!B || !_rtsAudibleFar(x, z) || !_RTS_SFX_GAP[name]) return;
    var tf = A.ctx.currentTime, kf = name + '@far';
    if (A.last[kf] != null && tf - A.last[kf] < _RTS_SFX_GAP[name] * 3) return;
    A.last[kf] = tf;
    try { _rtsSfxPlay(name, tf, B.far, x, z); } catch (_e) {}
    return;
  }
  var now = A.ctx.currentTime, gap = _RTS_SFX_GAP[name] || 0.02;
  if (A.last[name] != null && now - A.last[name] < gap) return;
  A.last[name] = now;
  try { _rtsSfxPlay(name, now, null, x, z); } catch (_e) {}
}

/* One effect, now: the player's own sample if they have one, else a rendered take from the bank,
   through the mixer - from (x, z) on the map if it has a place there. */
function _rtsSfxPlay(name, t, via, x, z) {
  var A = _rtsA;
  /* The player's own sound, if they have it and this effect has a counterpart - see
     src/rts.sound.js. A sound sent somewhere else (the far bus) is always the rendered one. */
  if (!via && typeof _rtsSndTry === 'function' && _rtsSndTry(name)) return;
  var buf = _rtsBankPick(A, name);
  if (buf) _rtsVoice(A, name, buf, x, z, via);
}

/* ------------------------------------------------------------------ music --
   A looping industrial-rock bed: four-on-the-floor kick, backbeat snare, driving eighth
   hats, a distorted saw bass on an E-minor riff, and lead stabs on the off-beats. Scheduled
   with a lookahead so it stays tight regardless of frame rate. */
var _RTS_BASS = [                                /* 16 steps, semitone offsets from E1, null = rest */
  0, null, 0, null, 3, null, 0, null, 5, null, 0, 0, 7, null, 5, 3
];
var _RTS_LEAD = [                                /* stabs, offsets from E3 */
  null, null, 12, null, null, 15, null, null, null, 12, null, null, 19, null, 17, null
];
function _rtsNote(semi, base) { return (base || 41.2) * Math.pow(2, semi / 12); }

function _rtsMusicStart() {
  /* The player's own soundtrack takes priority when it is there. It lives in scores.mix, which
     ships inside MAIN.MIX rather than among the loose archives, so most installs land here
     with the effects present and no score - and that is a normal state, not a failure: the
     synthesized sequencer below carries on exactly as it did. */
  if (typeof rtsSndMusicStart === 'function' && rtsSndMusicStart()) return;

  var A = _rtsA;
  if (!A || A.music) return;
  var ctx = A.ctx, out = A.mus;
  var bpm = 128, spb = 60 / bpm, step = spb / 2;      /* eighth notes */
  var M = { step:0, next:ctx.currentTime + 0.08, timer:0, bars:0 };

  var dist = _rtsWaveShaper(14); dist.connect(out);
  var leadFilt = ctx.createBiquadFilter();
  leadFilt.type = 'lowpass'; leadFilt.frequency.value = 2400; leadFilt.connect(dist);

  function kick(t) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.11);
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.26);
  }
  function snare(t) {
    var s = ctx.createBufferSource(); s.buffer = A.noise; s.loop = true;
    var f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = 0.7;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.17);
    s.connect(f); f.connect(g); g.connect(out);
    s.start(t); s.stop(t + 0.19);
    var o = ctx.createOscillator(), og = ctx.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(220, t);
    og.gain.setValueAtTime(0.22, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
    o.connect(og); og.connect(out); o.start(t); o.stop(t + 0.13);
  }
  function hat(t, open) {
    var s = ctx.createBufferSource(); s.buffer = A.noise; s.loop = true;
    var f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7200;
    var g = ctx.createGain(), d = open ? 0.16 : 0.045;
    g.gain.setValueAtTime(open ? 0.16 : 0.13, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    s.connect(f); f.connect(g); g.connect(out);
    s.start(t); s.stop(t + d + 0.02);
  }
  function bass(t, semi) {
    var o = ctx.createOscillator(), o2 = ctx.createOscillator();
    var f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'sawtooth'; o2.type = 'square';
    var hz = _rtsNote(semi, 41.2);
    o.frequency.setValueAtTime(hz, t);
    o2.frequency.setValueAtTime(hz / 2, t);
    f.type = 'lowpass';
    f.frequency.setValueAtTime(1500, t);
    f.frequency.exponentialRampToValueAtTime(420, t + step * 0.9);
    f.Q.value = 6;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.34, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + step * 0.95);
    o.connect(f); o2.connect(f); f.connect(g); g.connect(dist);
    o.start(t); o.stop(t + step); o2.start(t); o2.stop(t + step);
  }
  function lead(t, semi) {
    var o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sawtooth'; o2.type = 'sawtooth';
    var hz = _rtsNote(semi, 164.8);
    o.frequency.setValueAtTime(hz, t);
    o2.frequency.setValueAtTime(hz * 1.008, t);          /* detune for width */
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.17, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + step * 1.4);
    o.connect(g); o2.connect(g); g.connect(leadFilt);
    o.start(t); o.stop(t + step * 1.5); o2.start(t); o2.stop(t + step * 1.5);
  }

  function schedule() {
    if (!_rtsA || !_rtsA.music) return;
    var t = ctx.currentTime;
    while (M.next < t + 0.22) {
      var s = M.step % 16, at = M.next;
      if (s % 4 === 0) kick(at);
      if (s === 4 || s === 12) snare(at);
      hat(at, s % 8 === 6);
      if (_RTS_BASS[s] != null) bass(at, _RTS_BASS[s]);
      /* the lead only joins in every other bar, so the loop breathes */
      if (M.bars % 2 === 1 && _RTS_LEAD[s] != null) lead(at, _RTS_LEAD[s]);
      M.step++;
      if (M.step % 16 === 0) M.bars++;
      M.next += step;
    }
  }
  M.timer = setInterval(schedule, 30);
  A.music = M;
  schedule();
}
function _rtsMusicStop() {
  if (typeof rtsSndMusicStop === 'function') rtsSndMusicStop();

  var A = _rtsA;
  if (!A || !A.music) return;
  clearInterval(A.music.timer);
  A.music = null;
}
