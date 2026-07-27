/* Real Red Alert sound, when the player has it.

   rts.audio.js synthesizes everything - shaped noise and oscillators - and still does. This
   file sits in front of it: if the player's own archives are loaded and an effect has a real
   counterpart, the sample plays; otherwise the synthesized version does, unchanged. Every
   effect keeps working with no game files at all, which is the same arrangement the artwork
   uses and for the same reason.

   The mapping below only names sounds I confirmed are actually in the archives. A name that
   is not there costs a failed lookup and a silent fall back to synthesis, so a wrong guess is
   invisible rather than broken - but it is also a sound nobody ever hears, which is worse than
   an error because nothing reports it. Hence: measured, not guessed.

   SPEECH IS SEPARATE from effects. EVA's announcements are events the player must not miss -
   base under attack, construction complete - so they bypass the "is it on screen" test that
   every battlefield sound goes through, and they get their own retrigger gap, because two
   announcements on top of each other are worth less than one. */

/* our effect name -> the archive's. Confirmed present in sounds.mix / conquer.mix. */
var RTS_SND_SFX = {
  rifle:     'gun11',        /* infantry small arms */
  mg:        'gun13',
  cannon:    'cannon2',      /* tank main gun */
  turretgun: 'cannon1',
  rocket:    'missile6',
  boom:      'kaboom25',     /* a structure going up */
  pop:       'kaboom12',     /* a vehicle going up */
  hit:       'kaboom1',
  place:     'placbldg',     /* building slammed down */
  build:     'build5',
  select:    'bleep11',
  order:     'bleep13',
  click:     'bleep6',
  deny:      'bleep12',
  ready:     'rabeep1',
  alert:     'sonpulse'
};

/* EVA. These are announcements, not effects. */
var RTS_SND_EVA = {
  ready:    'unitrdy1',      /* unit ready */
  built:    'constru1',
  newopt:   'newopt1',       /* new construction options */
  progres:  'progres1',      /* construction complete-ish */
  reinfor:  'reinfor1',
  cancel:   'cancld1',
  captured: 'bldginf1',      /* building infiltrated */
  attack:   'baseatk1',      /* our base is under attack */
  lostbldg: 'pribldg1'
};

/* Decoded AudioBuffers, keyed by archive name. Decoding a 22 kHz clip is cheap but doing it on
   every shot is not, and a firefight asks for the same four sounds hundreds of times. */
var _RTS_SNDBUF = {};
var _RTS_SND_MISS = {};

function _rtsSndReady() {
  return !!(window.RA_AUD && typeof _rtsArtReady === 'function' && _rtsArtReady() && _rtsA);
}

/* Find an .aud in any loaded archive and decode it into an AudioBuffer. Returns null once and
   remembers it: a miss is permanent for the session, and retrying it per shot would mean
   hashing a name and walking every archive sixty times a second. */
function _rtsSndBuf(name) {
  if (!name || !_rtsSndReady()) return null;
  if (_RTS_SNDBUF[name]) return _RTS_SNDBUF[name];
  if (_RTS_SND_MISS[name]) return null;

  var file = name + '.aud', raw = null, k;
  for (k in RTS_MIX.open) {
    var a = RTS_MIX.open[k];
    if (a && !a.error && a.has(file)) { raw = a.read(file); break; }
  }
  if (!raw) { _RTS_SND_MISS[name] = 1; return null; }

  var d = window.RA_AUD.audOpen(raw);
  if (d.error || !d.samples.length) { _RTS_SND_MISS[name] = 1; return null; }

  var ctx = _rtsA.ctx, ch = d.channels, frames = Math.floor(d.samples.length / ch);
  if (!frames) { _RTS_SND_MISS[name] = 1; return null; }
  var buf;
  try { buf = ctx.createBuffer(ch, frames, d.rate); }
  catch (e) { _RTS_SND_MISS[name] = 1; return null; }
  for (var c = 0; c < ch; c++) {
    var out = buf.getChannelData(c);
    /* stereo is interleaved in the file and planar in an AudioBuffer */
    if (ch === 1) out.set(d.samples.subarray(0, frames));
    else for (var i = 0; i < frames; i++) out[i] = d.samples[i * ch + c];
  }
  return (_RTS_SNDBUF[name] = buf);
}

/* Play a decoded buffer. `gain` lets the caller balance a sample against the synthesized
   effects it is replacing, which are not mastered to the same level. */
function _rtsSndPlay(buf, bus, gain, rate) {
  if (!buf || !_rtsA) return false;
  var ctx = _rtsA.ctx;
  var src = ctx.createBufferSource();
  src.buffer = buf;
  if (rate) src.playbackRate.value = rate;
  var g = ctx.createGain();
  g.gain.value = gain == null ? 1 : gain;
  src.connect(g); g.connect(bus || _rtsA.sfx);
  src.start();
  return true;
}

/* The hook rts.audio.js calls before it synthesizes. Returns true if a real sample played, in
   which case the synthesized version is skipped. A tiny random detune stops twelve rifles
   firing at once from phase-cancelling into one flat crack - the same problem the synthesized
   path solves with its retrigger gap. */
function _rtsSndTry(name) {
  if (!_rtsSndReady()) return false;
  var buf = _rtsSndBuf(RTS_SND_SFX[name]);
  if (!buf) return false;
  return _rtsSndPlay(buf, _rtsA.sfx, 0.85, 0.97 + Math.random() * 0.06);
}

/* EVA. Deliberately not routed through _rtsSfx: an announcement is not a battlefield sound and
   must not be dropped for being off screen. */
var _RTS_EVA_LAST = 0;
function rtsEva(key) {
  if (!_rtsSndReady() || _rtsA.muted) return false;
  var now = _rtsA.ctx.currentTime;
  if (now - _RTS_EVA_LAST < 1.6) return false;     /* one voice at a time, or it is noise */
  var buf = _rtsSndBuf(RTS_SND_EVA[key]);
  if (!buf) return false;
  _RTS_EVA_LAST = now;
  return _rtsSndPlay(buf, _rtsA.master, 0.95);
}

/* ------------------------------------------------------------------ music --
   The soundtrack lives in scores.mix, which is inside MAIN.MIX rather than among the loose art
   archives - so most players will have the effects and not the music, and that has to be a
   normal state rather than a failure. When there is no score archive the synthesized music in
   rts.audio.js keeps playing, exactly as before.

   Track names are the score list; only the ones actually found are used, so a partial install
   yields a shorter playlist rather than silence. */
var RTS_SND_TRACKS = ['bigfoot','crush','face','fogger1a','hell226m','mud1a','radio2','rollout',
  'run1','smsh226m','snake','terminat','twin','vector1a','workmen','await','arazoid','backstab',
  'chaos2','shut_it','twinmix1','under3','vr2','creping','dense_r','fac1226m','fac2226m',
  'hell227m','run1226m','smsh227m','tren226m','workmn8','2nd_hand','araprowl','bog','float_v2',
  'gloom','grndwire','rpt','search','traction','wastelnd','map','intro'];

var _RTS_SNDTRACKS = null;
function rtsSndTracks() {
  if (_RTS_SNDTRACKS) return _RTS_SNDTRACKS;
  if (!_rtsSndReady()) return [];
  var out = [], i, k;
  for (i = 0; i < RTS_SND_TRACKS.length; i++) {
    var file = RTS_SND_TRACKS[i] + '.aud';
    for (k in RTS_MIX.open) {
      var a = RTS_MIX.open[k];
      if (a && !a.error && a.has(file)) { out.push(RTS_SND_TRACKS[i]); break; }
    }
  }
  return (_RTS_SNDTRACKS = out);
}

var _RTS_SNDMUS = null;
function rtsSndMusicStart() {
  var list = rtsSndTracks();
  if (!list.length || !_rtsA) return false;
  rtsSndMusicStop();
  var pick = list[(Math.random() * list.length) | 0];
  var buf = _rtsSndBuf(pick);
  if (!buf) return false;
  var src = _rtsA.ctx.createBufferSource();
  src.buffer = buf;
  src.connect(_rtsA.mus);
  /* one track at a time, then roll on to another - the originals do not loop a single track */
  src.onended = function () { if (_RTS_SNDMUS && _RTS_SNDMUS.src === src) rtsSndMusicStart(); };
  src.start();
  _RTS_SNDMUS = { src: src, name: pick };
  return true;
}
function rtsSndMusicStop() {
  if (!_RTS_SNDMUS) return;
  try { _RTS_SNDMUS.src.onended = null; _RTS_SNDMUS.src.stop(); } catch (e) {}
  _RTS_SNDMUS = null;
}
function rtsSndMusicPlaying() { return _RTS_SNDMUS ? _RTS_SNDMUS.name : null; }

/* Loading new archives can only ADD sounds, so the misses are the cache that has to go - a
   name that was absent before may be present now. The decoded buffers stay valid. */
function rtsSndReset() { _RTS_SND_MISS = {}; _RTS_SNDTRACKS = null; }
