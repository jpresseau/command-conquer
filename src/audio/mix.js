/* audio/mix.js - where a sound goes once it is made.

   The old effects went straight onto one bus: every shot dead centre, dry, as loud in a hundred-
   unit battle as in a skirmish, and summed until the output clipped. Now each one:

     LEFT OR RIGHT   is placed across the stereo field where its source is on the screen
                     (_rtsPanAt), so a fight on the left of the view is heard on the left
     IN A ROOM       is sent to one shared reverb (a ConvolverNode on a rendered impulse,
                     _dspRoom), a little for a rifle, more for an explosion, least for a click
     ON ITS BUS      by category - guns, explosions, the interface, the weather - each with its
                     own level and its own share of the room (RTS_CAT_BUS)
     NOT TOO MANY    at most RTS_VOICE_PER of one effect and RTS_VOICE_MAX in all: past either, the
                     oldest of the same name, or the oldest of the least important kind, gives
                     way - faded over 15 ms, not cut - and a click is never lost to a rifle
     UNDER A LID     everything ends in a compressor before the speakers, so a barrage is loud
                     and stays clean instead of clipping

   The take is varied as it plays too: a few per cent of pitch, a dB or so of level. Not the
   interface, which should sound the same every time. */

var RTS_VOICE_MAX = 24;          /* voices at once, all effects together */
var RTS_VOICE_PER = 4;           /* ...and of any one effect */
var RTS_PAN_WIDTH = 0.75;        /* how far to either side the edge of the screen sits */
/* g the bus's level, verb its send to the room, pri how much it matters when voices run short */
var RTS_CAT_BUS = {
  gun:   { g: 0.9, verb: 0.22, pri: 1 },
  boom:  { g: 1.0, verb: 0.32, pri: 2 },
  ui:    { g: 0.9, verb: 0.05, pri: 3 },
  world: { g: 1.0, verb: 0.28, pri: 2 }
};

/* The chain, built once with the context: category buses into the effects bus, a room, and the
   compressor the master feeds (rts.audio.js). */
function _rtsMixInit(A) {
  if (A.mix) return A.mix;
  var ctx = A.ctx, M = { cat: {}, voices: [], verbIn: null };
  try {
    var cv = ctx.createConvolver(), ir = _dspRoom(ctx.sampleRate, 1.6, 11);
    var b = ctx.createBuffer(2, ir[0].length, ctx.sampleRate);
    b.getChannelData(0).set(ir[0]); b.getChannelData(1).set(ir[1]);
    cv.buffer = b;
    M.verbIn = ctx.createGain();
    var back = ctx.createGain(); back.gain.value = 0.55;
    M.verbIn.connect(cv); cv.connect(back); back.connect(A.sfx);
  } catch (_e) { M.verbIn = null; }
  Object.keys(RTS_CAT_BUS).forEach(function (c) {
    var g = ctx.createGain(); g.gain.value = RTS_CAT_BUS[c].g; g.connect(A.sfx);
    if (M.verbIn) { var s = ctx.createGain(); s.gain.value = RTS_CAT_BUS[c].verb; g.connect(s); s.connect(M.verbIn); }
    M.cat[c] = g;
  });
  A.mix = M;
  return M;
}

/* Where across the stereo field a sound at (x, z) sits: -1 hard left to 1 hard right, from where
   it is on the screen. Nothing for a sound with no place (the interface). */
function _rtsPanAt(x, z) {
  var R = window._rtsR;
  if (!R || x == null || typeof _rtsViewSpan !== 'function') return 0;
  var vs = _rtsViewSpan(), u;
  if (vs.cw) u = _r3dToCam(x - R.focus.x, z - R.focus.z).u / (vs.cw / 2);
  else u = (x - R.focus.x) / (vs.w / 2);
  return Math.max(-1, Math.min(1, u)) * RTS_PAN_WIDTH;
}

function _rtsVoiceStop(v, now) {
  try { v.g.gain.setTargetAtTime(0, now, 0.015); v.src.stop(now + 0.1); } catch (_e) {}
  v.end = now;
}

/* Play a rendered take of `name`, from (x, z) if it has a place, onto its bus - or onto `via`
   (the ambience's muffled far bus) instead. False when the voices were full of better things. */
function _rtsVoice(A, name, buf, x, z, via) {
  var R = _rtsSfxRecipe(name), C = RTS_CAT_BUS[R.cat] || RTS_CAT_BUS.gun, ctx = A.ctx, now = ctx.currentTime;
  var M = _rtsMixInit(A), i;
  M.voices = M.voices.filter(function (v) { return v.end > now; });
  var same = M.voices.filter(function (v) { return v.name === name; });
  if (same.length >= RTS_VOICE_PER) _rtsVoiceStop(same[0], now);
  else if (M.voices.length >= RTS_VOICE_MAX) {
    var low = null;
    for (i = 0; i < M.voices.length; i++) if (!low || M.voices[i].pri < low.pri) low = M.voices[i];
    if (low.pri > C.pri) return false;
    _rtsVoiceStop(low, now);
  }
  M.voices = M.voices.filter(function (v) { return v.end > now; });
  var src = ctx.createBufferSource(), g = ctx.createGain(), ui = R.cat === 'ui';
  src.buffer = buf;
  var rate = ui ? 1 : 1 + (Math.random() * 2 - 1) * 0.04;
  src.playbackRate.value = rate;
  g.gain.value = (R.vol || 1) * (ui ? 1 : Math.pow(10, (Math.random() * 2 - 1) * 1.2 / 20));
  src.connect(g);
  var last = g;
  if (!via && x != null && ctx.createStereoPanner) {
    var p = ctx.createStereoPanner(); p.pan.value = _rtsPanAt(x, z);
    g.connect(p); last = p;
  }
  last.connect(via || M.cat[R.cat] || A.sfx);
  src.start(now);
  M.voices.push({ name: name, src: src, g: g, pri: C.pri, end: now + buf.duration / rate });
  return true;
}
