/* RC COMMAND - audio. Everything here is SYNTHESIZED at runtime with WebAudio: there is not
   a single sampled asset in the app, from any game or anywhere else. Weapons are shaped noise
   and pitch-swept oscillators, the music is a sequenced drum machine plus a bass and lead
   through a waveshaper.

   Two rules keep it from turning into mush during a big fight:
   - Sounds are positional in the loosest sense: an event outside the visible map area is
     simply not played. Forty units firing across the map would otherwise be a wall of noise.
   - Every effect name has a minimum retrigger gap, so a squad firing in unison makes one
     satisfying crack rather than eight phase-cancelling ones. */

var _rtsA = null;

function _rtsAudioInit() {
  if (_rtsA) return _rtsA;
  var AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  var ctx;
  try { ctx = new AC(); } catch (_e) { return null; }
  var master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
  var sfxBus = ctx.createGain(); sfxBus.gain.value = 0.85; sfxBus.connect(master);
  var musBus = ctx.createGain(); musBus.gain.value = 0.34; musBus.connect(master);

  /* one second of white noise, reused by every noise-based effect */
  var nb = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  var nd = nb.getChannelData(0);
  for (var i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

  _rtsA = { ctx:ctx, master:master, sfx:sfxBus, mus:musBus, noise:nb,
    last:{}, muted:false, music:null, t0:0 };
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
function _rtsNoiseSrc(dur, type, f0, f1, q) {
  var A = _rtsA, ctx = A.ctx, t = ctx.currentTime;
  var s = ctx.createBufferSource(); s.buffer = A.noise; s.loop = true;
  var f = ctx.createBiquadFilter(); f.type = type || 'bandpass';
  f.frequency.setValueAtTime(f0, t);
  if (f1 != null) f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  f.Q.value = q == null ? 1 : q;
  s.connect(f);
  return { src:s, node:f };
}
function _rtsEnv(dur, peak, attack) {
  var A = _rtsA, ctx = A.ctx, t = ctx.currentTime;
  var g = ctx.createGain();
  var a = attack == null ? 0.004 : attack;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  return g;
}
function _rtsTone(type, f0, f1, dur, peak) {
  var A = _rtsA, ctx = A.ctx, t = ctx.currentTime;
  var o = ctx.createOscillator(); o.type = type || 'sine';
  o.frequency.setValueAtTime(f0, t);
  if (f1 != null) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  var g = _rtsEnv(dur, peak == null ? 0.3 : peak);
  o.connect(g);
  o.start(t); o.stop(t + dur + 0.02);
  return g;
}
/* NB: named _rtsWaveShaper, not _rtsDist - rts.core.js already owns _rtsDist (distance
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
  return Math.abs(x - R.focus.x) < vs.w * 0.75 && Math.abs(z - R.focus.z) < vs.h * 0.85;
}

var _RTS_SFX_GAP = { rifle:0.05, mg:0.04, cannon:0.07, rocket:0.07, turretgun:0.07,
  hit:0.05, pop:0.06, boom:0.09, select:0.08, order:0.08 };

function _rtsSfx(name, x, z) {
  var A = _rtsA;
  if (!A || A.muted) return;
  if (!_rtsAudible(x, z)) return;
  var now = A.ctx.currentTime, gap = _RTS_SFX_GAP[name] || 0.02;
  if (A.last[name] != null && now - A.last[name] < gap) return;
  A.last[name] = now;
  try { _rtsSfxPlay(name, now); } catch (_e) {}
}

function _rtsSfxPlay(name, t) {
  var A = _rtsA, ctx = A.ctx, out = A.sfx, n, g;

  /* The player's own sound, if they have it and this effect has a counterpart. Everything
     below stays exactly as it was and is what plays otherwise - see src/rts.sound.js. */
  if (typeof _rtsSndTry === 'function' && _rtsSndTry(name)) return;

  if (name === 'rifle') {                       /* dry snap + a little body */
    n = _rtsNoiseSrc(0.09, 'bandpass', 2400, 900, 1.1);
    g = _rtsEnv(0.09, 0.32); n.node.connect(g); g.connect(out);
    n.src.start(t); n.src.stop(t + 0.11);
    _rtsTone('square', 260, 90, 0.05, 0.09).connect(out);

  } else if (name === 'mg') {                   /* faster, thinner, higher */
    n = _rtsNoiseSrc(0.055, 'bandpass', 3200, 1500, 1.4);
    g = _rtsEnv(0.055, 0.22); n.node.connect(g); g.connect(out);
    n.src.start(t); n.src.stop(t + 0.07);

  } else if (name === 'cannon') {               /* deep thump + crack */
    _rtsTone('sine', 150, 38, 0.34, 0.55).connect(out);
    n = _rtsNoiseSrc(0.22, 'lowpass', 1700, 260, 0.8);
    g = _rtsEnv(0.22, 0.4); n.node.connect(g); g.connect(out);
    n.src.start(t); n.src.stop(t + 0.24);

  } else if (name === 'turretgun') {
    _rtsTone('sine', 200, 60, 0.24, 0.42).connect(out);
    n = _rtsNoiseSrc(0.16, 'bandpass', 2100, 700, 1.0);
    g = _rtsEnv(0.16, 0.3); n.node.connect(g); g.connect(out);
    n.src.start(t); n.src.stop(t + 0.18);

  } else if (name === 'rocket') {               /* whoosh: noise sweeping upward */
    n = _rtsNoiseSrc(0.42, 'bandpass', 380, 2600, 2.2);
    g = _rtsEnv(0.42, 0.3, 0.05); n.node.connect(g); g.connect(out);
    n.src.start(t); n.src.stop(t + 0.44);
    _rtsTone('sawtooth', 120, 300, 0.3, 0.08).connect(out);

  } else if (name === 'boom') {                 /* structure destroyed */
    _rtsTone('sine', 110, 26, 0.85, 0.75).connect(out);
    n = _rtsNoiseSrc(0.75, 'lowpass', 1300, 120, 0.7);
    g = _rtsEnv(0.75, 0.6, 0.01); n.node.connect(g); g.connect(out);
    n.src.start(t); n.src.stop(t + 0.8);

  } else if (name === 'pop') {                  /* unit destroyed */
    _rtsTone('sine', 190, 50, 0.3, 0.4).connect(out);
    n = _rtsNoiseSrc(0.26, 'lowpass', 1500, 300, 0.8);
    g = _rtsEnv(0.26, 0.34); n.node.connect(g); g.connect(out);
    n.src.start(t); n.src.stop(t + 0.28);

  } else if (name === 'hit') {
    n = _rtsNoiseSrc(0.11, 'bandpass', 1500, 500, 1.6);
    g = _rtsEnv(0.11, 0.18); n.node.connect(g); g.connect(out);
    n.src.start(t); n.src.stop(t + 0.13);

  } else if (name === 'select') {               /* crisp UI blip */
    _rtsTone('square', 880, 1320, 0.06, 0.12).connect(out);

  } else if (name === 'order') {                /* two-tone acknowledge */
    _rtsTone('square', 620, 620, 0.045, 0.11).connect(out);
    setTimeout(function () { try { _rtsTone('square', 930, 930, 0.05, 0.1).connect(out); } catch (_e) {} }, 55);

  } else if (name === 'click') {
    _rtsTone('square', 520, 380, 0.04, 0.1).connect(out);

  } else if (name === 'build') {                /* production started */
    _rtsTone('sawtooth', 150, 300, 0.2, 0.16).connect(out);

  } else if (name === 'place') {                /* building slammed down */
    _rtsTone('sine', 120, 40, 0.4, 0.6).connect(out);
    n = _rtsNoiseSrc(0.3, 'lowpass', 900, 180, 0.7);
    g = _rtsEnv(0.3, 0.35); n.node.connect(g); g.connect(out);
    n.src.start(t); n.src.stop(t + 0.32);

  } else if (name === 'ready') {                /* construction complete */
    [660, 880, 1320].forEach(function (f, i) {
      setTimeout(function () {
        try { _rtsTone('triangle', f, f, 0.16, 0.16).connect(out); } catch (_e) {}
      }, i * 90);
    });

  } else if (name === 'unitready') {
    [520, 780].forEach(function (f, i) {
      setTimeout(function () {
        try { _rtsTone('triangle', f, f, 0.11, 0.13).connect(out); } catch (_e) {}
      }, i * 80);
    });

  } else if (name === 'alert') {                /* incoming attack */
    [0, 260, 520].forEach(function (d) {
      setTimeout(function () {
        try { _rtsTone('sawtooth', 440, 300, 0.2, 0.22).connect(out); } catch (_e) {}
      }, d);
    });

  } else if (name === 'lowpower') {
    _rtsTone('sawtooth', 200, 120, 0.5, 0.16).connect(out);

  } else if (name === 'deny') {
    _rtsTone('square', 200, 130, 0.16, 0.16).connect(out);
  }
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
