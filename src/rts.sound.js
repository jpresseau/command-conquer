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

/* ------------------------------------------------------------- by hash --
   Sounds are fetched by INDEX HASH, not by filename. A MIX has no directory, so asking for a
   name means guessing one, and guessing reached 25 of the 333 sounds a normal install holds.
   ra/sndtab.js identifies 152 of them by matching their audio against a named set, and what it
   stores is the hash already sitting in the player's own index - so the lookup is exact and
   needs no name at all.

   _rtsSndBuf still takes a filename for the handful of effects that were already working that
   way; _rtsSndById is the path everything new uses. */

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
  var buf = _rtsSndDecode(raw);
  if (!buf) { _RTS_SND_MISS[name] = 1; return null; }
  return (_RTS_SNDBUF[name] = buf);
}

/* AUD bytes -> an AudioBuffer, or null. Shared by both lookup paths so they cannot decode
   differently. */
function _rtsSndDecode(raw) {
  var d = window.RA_AUD.audOpen(raw);
  if (d.error || !d.samples.length) return null;
  var ctx = _rtsA.ctx, ch = d.channels, frames = Math.floor(d.samples.length / ch);
  if (!frames) return null;
  var buf;
  try { buf = ctx.createBuffer(ch, frames, d.rate); } catch (e) { return null; }
  for (var c = 0; c < ch; c++) {
    var out = buf.getChannelData(c);
    /* stereo is interleaved in the file and planar in an AudioBuffer */
    if (ch === 1) out.set(d.samples.subarray(0, frames));
    else for (var i = 0; i < frames; i++) out[i] = d.samples[i * ch + c];
  }
  return buf;
}

/* The same decode, addressed by hash. Cached under the id so the two paths cannot each hold
   their own copy of the same sound. */
function _rtsSndById(id) {
  if (id == null || !_rtsSndReady()) return null;
  var key = 'id:' + id;
  if (_RTS_SNDBUF[key]) return _RTS_SNDBUF[key];
  if (_RTS_SND_MISS[key]) return null;

  var raw = null, k;
  for (k in RTS_MIX.open) {
    var a = RTS_MIX.open[k];
    if (!a || a.error || !a.readId) continue;
    raw = a.readId(id);
    if (raw) break;
  }
  if (!raw) { _RTS_SND_MISS[key] = 1; return null; }
  var buf = _rtsSndDecode(raw);
  if (!buf) { _RTS_SND_MISS[key] = 1; return null; }
  return (_RTS_SNDBUF[key] = buf);
}

/* A sound named in ra/sndtab.js. This is the entry point for everything the identity table
   unlocked - unit voices, EVA, the lot. */
function rtsSndNamed(name) {
  if (!window.RA_SNDTAB) return null;
  return _rtsSndById(window.RA_SNDTAB[name]);
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
   must not be dropped for being off screen.

   Every line comes from the identity table, which knows them by content. There used to be a
   second map of guessed filenames behind this as a fallback; it was dead - the table resolved
   first for every key, so none of its nine entries ever produced a sound, and one of them named
   a file that is not in the archives at all. A fallback that can never run is not a safety net,
   it is a second answer nobody checks. */
var RTS_EVA_NAMED = {
  ready:     'unit_ready',
  built:     'construction_complete',
  building:  'building',
  newopt:    'new_construction_options',
  reinfor:   'reinforcements',
  cancel:    'canceled',
  attack:    'base_under_attack',
  primary:   'primary_building_selected',
  nofunds:   'insufficient_funds',
  lowpower:  'low_power',
  cantbuild: 'unable_to_build',
  lostbldg:  'structure_destroyed',
  chrono:    'chronosphere_sound',
  won:       'mission_accomplished',
  lost:      'mission_failed'
};

var _RTS_EVA_LAST = 0;
function rtsEva(key) {
  if (!_rtsSndReady() || _rtsA.muted) return false;
  var now = _rtsA.ctx.currentTime;
  if (now - _RTS_EVA_LAST < 1.6) return false;     /* one voice at a time, or it is noise */
  var buf = RTS_EVA_NAMED[key] && rtsSndNamed(RTS_EVA_NAMED[key]);
  if (!buf) return false;
  _RTS_EVA_LAST = now;
  return _rtsSndPlay(buf, _rtsA.master, 0.95);
}

/* ------------------------------------------------------------ unit voices --
   The reply when you click a unit or give it an order. RA records these per SIDE and per unit
   TYPE - an infantryman and a tank crew answer differently, and the Soviets answer differently
   again - so the pick is (side, kind, what happened) rather than one generic bark.

   The two variants of each line exist to stop repetition wearing thin, and which one plays is
   chosen from the unit's own id rather than at random: the same soldier answers with the same
   voice every time, which is what makes a squad sound like people instead of a shuffle. */
var RTS_VOX_SELECT = {
  allied:  { infantry: ['yes_sir_allied_infantry', 'reporting_allied_infantry',
                        'awaiting_orders_allied_infantry', 'ready_allied_infantry'],
             vehicle:  ['yes_sir_allied_vehicle', 'reporting_allied_vehicle',
                        'awaiting_orders_allied_vehicle', 'vehicle_reporting_allied_vehicle'] },
  soviet:  { infantry: ['yes_sir_soviet_infantry', 'reporting_soviet_infantry',
                        'awaiting_orders_soviet_infantry', 'ready_soviet_infantry'],
             vehicle:  ['yes_sir_soviet_vehicle', 'reporting_soviet_vehicle',
                        'awaiting_orders_soviet_vehicle', 'vehicle_reporting_soviet_vehicle'] }
};
var RTS_VOX_ORDER = {
  allied:  { infantry: ['affirmative_allied_infantry', 'acknowledged_allied_infantry',
                        'at_once_allied_infantry', 'agreed_allied_infantry',
                        'as_you_wish_allied_infantry', 'of_course_allied_infantry',
                        'very_well_allied_infantry'],
             vehicle:  ['affirmative_allied_vehicle', 'acknowledged_allied_vehicle'] },
  soviet:  { infantry: ['affirmative_soviet_infantry', 'acknowledged_soviet_infantry',
                        'at_once_soviet_infantry', 'agreed_soviet_infantry',
                        'as_you_wish_soviet_infantry', 'of_course_soviet_infantry',
                        'very_well_soviet_infantry'],
             vehicle:  ['affirmative_soviet_vehicle', 'acknowledged_soviet_vehicle'] }
};

/* A few units have their own voice actor and should never use the generic pool. */
var RTS_VOX_SPECIAL = {
  engineer: ['engineer_yes_sir', 'engineer_affirmative', 'engineer_movin_out', 'engineer_engineering'],
  thief:    ['thief_yea', 'thief_ok', 'thief_affirmative', 'thief_movin_out', 'thief_what'],
  medic:    ['medic_yes_sir', 'medic_affirmative', 'medic_reporting', 'medic_movin_out'],
  /* All twelve of Tanya's takes. Six were listed and six were not, for no reason beyond the
     list having been written from memory. */
  tanya:    ['tanya_yes_sir', 'tanya_lets_rock', 'tanya_im_there', 'tanya_whats_up',
             'tanya_shake_it_baby', 'tanya_give_it_to_me', 'tanya_cha_ching',
             'tanya_chew_on_this', 'tanya_kiss_it_bye_bye', 'tanya_laugh',
             'tanya_thats_all_you_got', 'tanya_yea'],
  dog:      ['dog_bark', 'dog_growl', 'dog_yes_sir']
};

/* Which army's voices the player hears. It is a VOICE choice and nothing else - both sides
   field the same roster and the same rules - so it is offered as exactly that rather than
   dressed up as a faction with consequences it does not have. Kept in localStorage: it is a
   six-byte preference and does not belong in the archive store. */
var RTS_VOX_SIDES = ['allied', 'soviet'];
function rtsVoxSide() {
  if (window._RTS_VOXSIDE) return window._RTS_VOXSIDE;
  var v = null;
  try { v = window.localStorage.getItem('rcgVoxSide'); } catch (e) {}
  return (window._RTS_VOXSIDE = (RTS_VOX_SIDES.indexOf(v) >= 0 ? v : 'allied'));
}
function rtsSetVoxSide(v) {
  if (RTS_VOX_SIDES.indexOf(v) < 0) return;
  window._RTS_VOXSIDE = v;
  try { window.localStorage.setItem('rcgVoxSide', v); } catch (e) {}
}

var _RTS_VOX_LAST = 0;
function rtsVox(unit, what) {
  if (!_rtsSndReady() || _rtsA.muted || !unit) return false;
  var now = _rtsA.ctx.currentTime;
  /* One reply per action. Selecting twelve units must not play twelve lines on top of each
     other - the originals answer once, from whichever unit you happen to have picked. */
  if (now - _RTS_VOX_LAST < 0.9) return false;

  var def = (typeof rtsUnitDef === 'function') ? rtsUnitDef(unit.def) : null;
  var kind = (def && def.kind === 'infantry') ? 'infantry' : 'vehicle';
  /* WHICH ARMY THE PLAYER COMMANDS, not which side the unit is on.

     This used to read `unit.side === 'enemy' ? 'soviet' : 'allied'`, which sounds right and
     silences half the set: you only ever select your OWN units, so the enemy branch is
     unreachable and 34 of the identified lines - the entire Soviet half - could never play.
     The choice is the player's now; see RTS_VOX_SIDE. The enemy branch is kept because an
     enemy unit CAN reach slot 0 of a mixed selection, and when it does it should not answer
     in your own army's voice. */
  var mine = unit.side === 'player';
  var side = mine ? rtsVoxSide() : (rtsVoxSide() === 'soviet' ? 'allied' : 'soviet');
  var pool = RTS_VOX_SPECIAL[unit.def];
  if (!pool) {
    var t = (what === 'order' ? RTS_VOX_ORDER : RTS_VOX_SELECT)[side];
    pool = t && t[kind];
  }
  if (!pool || !pool.length) return false;

  /* Every line CROSSED WITH ITS TAKES, then indexed once.

     This used to be `named(line) || named(line+'_1') || named(line+'_2')`, which reads like a
     fallback chain and is not one: the pool holds base names, which are never keys, so the
     first is always null and the second always resolves - and the third was unreachable. Every
     second take in the set was dead, which is exactly the repetition the two takes exist to
     prevent. Expanding first and picking once is the only way the id can choose among them. */
  var cand = _rtsVoxTakes(pool);
  if (!cand.length) return false;
  var seed = (unit.id != null ? unit.id : 0) | 0;
  var buf = rtsSndNamed(cand[Math.abs(seed) % cand.length]);
  if (!buf) return false;
  _RTS_VOX_LAST = now;
  return _rtsSndPlay(buf, _rtsA.master, 0.9);
}

/* A pool of base names -> every name in the table that is one of their takes. Cached per pool
   because it is the same handful of arrays every time and this runs on every click. */
var _RTS_VOX_CACHE = {};
function _rtsVoxTakes(pool) {
  var key = pool.join('|');
  if (_RTS_VOX_CACHE[key]) return _RTS_VOX_CACHE[key];
  var out = [], i, j, sfx = ['', '_1', '_2'];
  for (i = 0; i < pool.length; i++) {
    for (j = 0; j < sfx.length; j++) {
      var nm = pool[i] + sfx[j];
      if (window.RA_SNDTAB && window.RA_SNDTAB[nm] != null) out.push(nm);
    }
  }
  return (_RTS_VOX_CACHE[key] = out);
}

/* ------------------------------------------------------------ death cries --
   Ten recorded takes, and until now not one of them played: the identity table knew what they
   were and nothing ever asked. Infantry only - a tank crew does not scream, and RA does not
   record one doing so. Deliberately routed through the SFX bus and the on-screen test, unlike
   EVA: a man dying out of sight is not news, it is atmosphere, and atmosphere from across the
   map is just noise. */
var RTS_DEATH_CRIES = ['death_dedman1', 'death_dedman2', 'death_dedman3', 'death_dedman4',
  'death_dedman5', 'death_dedman6', 'death_dedman7', 'death_dedman8', 'death_dedman10'];
var _RTS_CRY_LAST = 0;

function rtsDeathCry(unit) {
  if (!_rtsSndReady() || _rtsA.muted || !unit) return false;
  var def = (typeof rtsUnitDef === 'function') ? rtsUnitDef(unit.def) : null;
  if (!def || def.kind !== 'infantry') return false;
  if (unit.def === 'dog') return _rtsSndPlayNamed('dog_whine', 0.7);
  if (typeof _rtsAudible === 'function' && !_rtsAudible(unit.x, unit.z)) return false;
  var now = _rtsA.ctx.currentTime;
  if (now - _RTS_CRY_LAST < 0.25) return false;     /* a squad wiped out is one cry, not eight */
  _RTS_CRY_LAST = now;
  var seed = (unit.id != null ? unit.id : 0) | 0;
  return _rtsSndPlayNamed(RTS_DEATH_CRIES[Math.abs(seed) % RTS_DEATH_CRIES.length], 0.75);
}

function _rtsSndPlayNamed(name, gain) {
  var buf = rtsSndNamed(name);
  return buf ? _rtsSndPlay(buf, _rtsA.sfx, gain == null ? 0.85 : gain) : false;
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
