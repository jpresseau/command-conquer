/* audio/music.js - the score (audio/score.js) played on the band (audio/instruments.js).

   A SAMPLER, NOT A SYNTHESIZER. Every note a song can ask for (_rtsScoreNeeds) is rendered once
   into a buffer, the first bar's at once and the rest out of idle time, and a note is then one
   buffer source and one gain - with its length set by when that gain lets go. A note whose
   sample is not rendered yet is left out rather than waited for, so the music never holds up a
   frame; within a few seconds of a match starting there is nothing left to render.

   A BAR AT A TIME, on the audio clock: a 25 ms timer looks a quarter of a second ahead, and when
   a bar's downbeat comes into that window, the whole bar is scheduled. So a change of intensity
   lands on a downbeat - the drums come in with a crash, not halfway through a beat.

   THE INTENSITY follows the fighting the player can hear: every audible shot and explosion adds
   to a heat that halves every RTS_MUS_HALF seconds (_rtsMusicHeatAdd, called by _rtsSfx), and at
   each downbeat _rtsMusicLevel decides what the next bar plays.

   THE SONGS TAKE TURNS: after RTS_MUS_SONG_BARS bars, at the start of a phrase, the next one
   begins, its samples rendered over the eight bars before. Four stems (drums, bass, keys, lead)
   mix into one output on the music bus, with a room of their own. */

var RTS_MUS_AHEAD = 0.25;        /* s the scheduler looks ahead */
var RTS_MUS_HALF = 6;            /* s for the heat to halve */
var RTS_MUS_SONG_BARS = 48;      /* bars of a song before the next */
var RTS_MUS_SLICE = 6;           /* ms of rendering per idle slice */
/* how much heat each sound the player hears adds */
var RTS_MUS_HEAT = { rifle: 0.3, mg: 0.25, cannon: 1, turretgun: 1, rocket: 1, hit: 0.5, splash: 0.3, pop: 2, boom: 3, alert: 6 };
var RTS_MUS_STEM = { drums: 0.9, bass: 0.75, keys: 0.6, lead: 0.5 };
var RTS_MUS_VERB = { drums: 0.1, bass: 0, keys: 0.32, lead: 0.28 };
var RTS_MUS_OF = { kick: 'drums', snare: 'drums', hatC: 'drums', hatO: 'drums', crash: 'drums', tomH: 'drums', tomL: 'drums',
  shaker: 'drums', bass: 'bass', bassD: 'bass', pluck: 'keys', pad: 'keys', brass: 'keys', lead: 'lead' };

/* THE HEAT: a shot heard adds its weight to what is left of the last */
function _rtsMusicHeatAdd(A, name) {
  var w = RTS_MUS_HEAT[name];
  if (!w || !A) return;
  var now = A.ctx.currentTime;
  A.heat = { v: _rtsMusicHeat(A, now) + w, t: now };
}
function _rtsMusicHeat(A, now) {
  var h = A && A.heat;
  return h ? h.v * Math.pow(0.5, (now - h.t) / RTS_MUS_HALF) : 0;
}

/* a sample's name in the cache: a drum is a drum in any song; a note is held for the song's own
   tempo, so it is that song's */
function _rtsMusicKey(song, e) {
  return e.inst + (e.key == null ? '' : ':' + e.key + '@' + song.bpm);
}
/* render one sample into the sampler's cache, as long as the song ever holds it (`len`) */
function _rtsMusicRender(M, song, e) {
  var k = _rtsMusicKey(song, e);
  if (M.buf[k]) return M.buf[k];
  var ctx = M.ctx, sr = ctx.sampleRate / (RTS_INST_RATE[e.inst] || 1), key = e.key, step = 15 / song.bpm;
  if (e.inst === 'pad') key = _rtsVoicing(e.key, 52);
  if (e.inst === 'brass') key = _rtsVoicing(e.key, 55);
  var x = _rtsInstRender(e.inst, key, sr, (e.len || 1) * step + (e.inst === 'pad' ? 0.7 : 0.35));
  if (!x) return null;
  var two = x.length === 2 && x[0] instanceof Float32Array, buf = ctx.createBuffer(two ? 2 : 1, two ? x[0].length : x.length, sr);
  if (two) { buf.getChannelData(0).set(x[0]); buf.getChannelData(1).set(x[1]); } else buf.getChannelData(0).set(x);
  M.buf[k] = buf; M.built++;
  return buf;
}
/* queue a song's samples, and render them a slice at a time while the page is idle */
function _rtsMusicQueue(M, song) {
  _rtsScoreNeeds(song).forEach(function (e) { M.q.push([song, e]); });
  if (M.idle) return;
  M.idle = true;
  var later = window.requestIdleCallback ? function (f) { window.requestIdleCallback(f, { timeout: 400 }); } : function (f) { setTimeout(f, 30); };
  (function slice() {
    var t0 = Date.now();
    while (M.q.length && Date.now() - t0 < RTS_MUS_SLICE) { var w = M.q.shift(); try { _rtsMusicRender(M, w[0], w[1]); } catch (_e) {} }
    if (M.q.length && M === (_rtsA && _rtsA.music)) later(slice); else M.idle = false;
  })();
}

/* one note: a buffer source, a gain that lets go when the note ends, into its stem */
function _rtsMusicNote(M, song, e, t, stepDur) {
  var buf = M.buf[_rtsMusicKey(song, e)];
  if (!buf) { M.missed++; return; }                    /* not rendered yet: left out, never waited for */
  var ctx = M.ctx, src = ctx.createBufferSource(), g = ctx.createGain(), end = t + e.len * stepDur;
  src.buffer = buf;
  g.gain.setValueAtTime(e.vel, t);
  src.connect(g); g.connect(M.stem[RTS_MUS_OF[e.inst]]);
  src.start(t);
  if (e.inst === 'bass' || e.inst === 'bassD' || e.inst === 'lead') {
    g.gain.setValueAtTime(e.vel, end);
    g.gain.setTargetAtTime(0, end, 0.04);
    src.stop(end + 0.4);
  }
  M.live.push({ src: src, end: Math.min(t + buf.duration, end + 0.4) });
}

/* the bar whose downbeat is `t` */
function _rtsMusicBar(M, t) {
  var song = RTS_SONGS[M.song], stepDur = 60 / song.bpm / 4, barDur = stepDur * RTS_STEPS;
  /* the intensity, decided at the downbeat */
  var heat = _rtsMusicHeat(_rtsA, t), want = heat >= RTS_MUS_HOT ? 2 : heat >= RTS_MUS_WARM ? 1 : 0;
  M.below = want < M.level ? M.below + barDur : 0;
  var lv = _rtsMusicLevel(M.level, heat, M.below);
  if (lv !== M.level) { M.level = lv; M.below = 0; }
  _rtsScoreBar(song, M.bar, M.level).forEach(function (e) { _rtsMusicNote(M, song, e, t + e.step * stepDur, stepDur); });
  M.live = M.live.filter(function (v) { return v.end > M.ctx.currentTime; });
  M.bar++; M.bars++; M.step = M.bars * RTS_STEPS;
  /* the next song: its samples over the last eight bars, then it begins at a phrase */
  if (!M.queued && M.bar >= RTS_MUS_SONG_BARS - 8) { M.queued = true; _rtsMusicQueue(M, RTS_SONGS[(M.song + 1) % RTS_SONGS.length]); }
  if (M.bar >= RTS_MUS_SONG_BARS && M.bar % 4 === 0) {
    M.song = (M.song + 1) % RTS_SONGS.length; M.bar = 0; M.queued = false;
    /* and the last one's notes let go, a few megabytes of them; they render again if it comes back */
    var was = '@' + song.bpm;
    if (RTS_SONGS[M.song].bpm !== song.bpm) Object.keys(M.buf).forEach(function (k) { if (k.slice(-was.length) === was) delete M.buf[k]; });
  }
  return barDur;
}

/* Start the score: the stems, a room, the first bar's samples now and the rest in idle time. */
function _rtsMusicBegin(A) {
  var ctx = A.ctx, M = { ctx: ctx, buf: (A.musBuf = A.musBuf || {}), built: 0, missed: 0, q: [], idle: false, live: [], stem: {},
    song: A.musSong || 0, bar: 0, bars: 0, step: 0, level: 0, below: 0, next: ctx.currentTime + 0.08, timer: 0 };
  M.out = ctx.createGain(); M.out.connect(A.mus);
  var verb = null;
  try {
    var cv = ctx.createConvolver(), ir = _dspRoom(ctx.sampleRate, 2.2, 23), b = ctx.createBuffer(2, ir[0].length, ctx.sampleRate);
    b.getChannelData(0).set(ir[0]); b.getChannelData(1).set(ir[1]);
    cv.buffer = b; verb = ctx.createGain(); var back = ctx.createGain(); back.gain.value = 0.6;
    verb.connect(cv); cv.connect(back); back.connect(M.out);
  } catch (_e) { verb = null; }
  Object.keys(RTS_MUS_STEM).forEach(function (k) {
    var g = ctx.createGain(); g.gain.value = RTS_MUS_STEM[k]; g.connect(M.out);
    if (verb && RTS_MUS_VERB[k]) { var s = ctx.createGain(); s.gain.value = RTS_MUS_VERB[k]; g.connect(s); s.connect(verb); }
    M.stem[k] = g;
  });
  var song = RTS_SONGS[M.song], needs = _rtsScoreNeeds(song), first = {};
  _rtsScoreBar(song, 0, 0).forEach(function (e) { first[_rtsMusicKey(song, e)] = 1; });
  needs.forEach(function (e) { if (first[_rtsMusicKey(song, e)]) try { _rtsMusicRender(M, song, e); } catch (_e) {} });
  A.music = M;
  _rtsMusicQueue(M, song);
  function tick() {
    if (_rtsA.music !== M) return;
    while (M.next < ctx.currentTime + RTS_MUS_AHEAD) M.next += _rtsMusicBar(M, M.next);
  }
  M.timer = setInterval(tick, 25);
  tick();
  return M;
}
/* Stop it: everything still ringing faded out inside a fifth of a second. */
function _rtsMusicEnd(A) {
  var M = A.music;
  if (!M) return;
  clearInterval(M.timer);
  A.music = null;
  A.musSong = (M.song + 1) % RTS_SONGS.length;          /* the next match opens on the other song */
  var now = M.ctx.currentTime;
  try { M.out.gain.setTargetAtTime(0, now, 0.03); } catch (_e) {}
  M.live.forEach(function (v) { try { v.src.stop(now + 0.3); } catch (_e) {} });
  setTimeout(function () { try { M.out.disconnect(); } catch (_e) {} }, 600);
}
