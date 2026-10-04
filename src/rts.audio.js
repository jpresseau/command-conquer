/* RED ALERT - audio. Everything here is SYNTHESIZED: there is not a single sampled asset in the
   app, from any game or anywhere else. The effects are rendered ahead of time from layered
   recipes (audio/recipes.js, audio/dsp.js) into a bank of takes (audio/bank.js) and played
   through a mixer with stereo position, a room and a compressor (audio/mix.js); the music is a
   score of two songs that follows the fighting (audio/score.js, audio/music.js).

   Two rules keep it from turning into mush during a big fight:
   - Sounds are positional: an event outside the visible map area is not played at full voice
     (a little way off it is heard muffled, rts.ambience.js), and one on screen is placed left
     or right by where it is.
   - Every effect name has a minimum retrigger gap, so a squad firing in unison makes one
     satisfying crack rather than eight phase-cancelling ones - and past the gap, the mixer
     caps how many play at once (RTS_VOICE_MAX). */

var _rtsA = null;

/* THE PLAYER'S LEVELS (ui/soundpanel.js): each bus at its own level times the slider's, kept
   between sessions. A key that is missing, unreadable or out of range reads as full. */
var RTS_BUS_BASE = { sfx: 0.6, mus: 0.28, amb: 0.7 };
var RTS_VOL_LS = 'rtsSoundVol';
var _RTS_VOL = null;
function _rtsVol(k) {
  if (!_RTS_VOL) {
    _RTS_VOL = {};
    try { _RTS_VOL = JSON.parse(window.localStorage.getItem(RTS_VOL_LS) || '{}') || {}; } catch (_e) { _RTS_VOL = {}; }
  }
  var v = +_RTS_VOL[k];
  return _RTS_VOL[k] != null && v >= 0 && v <= 1 ? v : 1;
}
function rtsVolSet(k, v) {
  if (!RTS_BUS_BASE[k]) return;
  _rtsVol(k);
  _RTS_VOL[k] = Math.max(0, Math.min(1, +v || 0));
  try { window.localStorage.setItem(RTS_VOL_LS, JSON.stringify(_RTS_VOL)); } catch (_e) {}
  var A = _rtsA;
  if (!A) return;
  var bus = k === 'sfx' ? A.sfx : k === 'mus' ? A.mus : (A.amb && A.amb.bus);
  if (bus) bus.gain.setTargetAtTime(RTS_BUS_BASE[k] * _RTS_VOL[k], A.ctx.currentTime, 0.03);
  /* the score at nothing is the score stopped, not a sequencer playing to a silent bus */
  if (k === 'mus' && !_RTS_VOL[k]) _rtsMusicStop();
  else if (k === 'mus' && !A.music && window._rtsG && !window._rtsG.over) _rtsMusicStart();
}

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
     than about half of it untouched (e2e/sfxmix). Its ceiling is 0.95, not 0.99: the shaper's
     oversampling filter rings a little past the curve, and at 0.99 a barrage measured 1.00. */
  var lid = null, out = null;
  try {
    lid = ctx.createDynamicsCompressor();
    lid.threshold.value = -12; lid.knee.value = 8; lid.ratio.value = 4;
    lid.attack.value = 0.003; lid.release.value = 0.25;
    out = ctx.createWaveShaper();
    var cn = 2048, cv = new Float32Array(cn);
    /* the shaper's input runs -1..1; it stands for -4..4, so the gain in front is a quarter */
    for (var ci = 0; ci < cn; ci++) { var cx = (ci / (cn - 1) * 2 - 1) * 4; cv[ci] = Math.abs(cx) < 0.5 ? cx : (cx < 0 ? -1 : 1) * (0.5 + 0.45 * Math.tanh((Math.abs(cx) - 0.5) / 0.45)); }
    out.curve = cv; out.oversample = '4x';
    var quarter = ctx.createGain(); quarter.gain.value = 0.25;
    master.connect(lid); lid.connect(quarter); quarter.connect(out); out.connect(ctx.destination);
  } catch (_e) { lid = null; out = null; master.connect(ctx.destination); }
  var sfxBus = ctx.createGain(); sfxBus.gain.value = RTS_BUS_BASE.sfx * _rtsVol('sfx'); sfxBus.connect(master);
  var musBus = ctx.createGain(); musBus.gain.value = RTS_BUS_BASE.mus * _rtsVol('mus'); musBus.connect(master);

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
  if (typeof _rtsMusicHeatAdd === 'function') _rtsMusicHeatAdd(A, name);   /* the fighting the music follows */
  var now = A.ctx.currentTime, gap = _RTS_SFX_GAP[name] || 0.02;
  if (A.last[name] != null && now - A.last[name] < gap) return;
  A.last[name] = now;
  try { _rtsSfxPlay(name, now, null, x, z); } catch (_e) {}
}

/* One effect, now: a rendered take from the bank, through the mixer - from (x, z) on the map if
   it has a place there. */
function _rtsSfxPlay(name, t, via, x, z) {
  var A = _rtsA;
  var buf = _rtsBankPick(A, name);
  if (buf) _rtsVoice(A, name, buf, x, z, via);
}

/* ------------------------------------------------------------------ music --
   The score of audio/score.js, played by audio/music.js - two songs that take turns, louder and
   fuller as the fighting the player can hear grows. */
function _rtsMusicStart() {
  var A = _rtsA;
  if (!A || A.music || !_rtsVol('mus')) return;
  try { _rtsMusicBegin(A); } catch (_e) {}
}
function _rtsMusicStop() {
  if (_rtsA && _rtsA.music) _rtsMusicEnd(_rtsA);
}
