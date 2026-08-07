/* The sound tables, and the one failure mode this subsystem actually has.

   Audio here fails SILENTLY, always. rts.sound.js says so in its own header: a name that is
   not in the archives "costs a failed lookup and a silent fall back to synthesis, so a wrong
   guess is invisible rather than broken - but it is also a sound nobody ever hears, which is
   worse than an error because nothing reports it." Nothing throws, nothing logs, the game
   plays on, and the only symptom is a sound that never comes. That is not something a person
   notices by playing; it is something a table check notices in a millisecond.

   Two whole classes of bug have already been found and fixed here by reasoning rather than
   listening - a fallback chain whose first branch always resolved so the second was dead, and
   a voice pool indexed by base names that were never keys - and both were exactly this shape:
   a lookup that always misses. So the assertions are:

     every name the game ever asks for is a name that can be found,
     and every effect the game ever plays has something to play.

   All of it is pure. The tables are data and the dispatcher is a function of a string, so this
   runs in plain node with no browser and no WebAudio. What needs a real AudioContext - that a
   sound actually reaches the speakers, that the retrigger gap holds, that muting works - is
   test/e2e/audio. */

var fs = require('fs');
var path = require('path');
var { Suite } = require('../lib/assert.js');
var { load, read: srcText } = require('../lib/sandbox.js');

var S = new Suite('audio');
var ROOT = path.resolve(__dirname, '..', '..');
var g = load(['ra/sndtab.js', 'src/rts.audio.js', 'src/rts.sound.js']);
var TAB = g.RA_SNDTAB || {};

S.note(Object.keys(TAB).length + ' sounds identified in the archives, ' +
       Object.keys(g.RTS_SND_SFX).length + ' effects mapped, ' +
       g.RTS_SND_TRACKS.length + ' score tracks named');

/* ------------------------------------------------- every name resolves ----
   RA_SNDTAB is the identity table: it knows what each sound in the player's archives IS, by
   hash. Anything the game asks for by name has to be a key in it, or the lookup returns null
   forever and that line simply never plays. */
function checkNames(what, names) {
  var missing = names.filter(function (n) { return TAB[n] == null; });
  S.ok(what + ' all resolve in the identity table', !missing.length,
       missing.slice(0, 6).join(', ') || (names.length + ' names, all present'));
}

checkNames('EVA\'s announcements', Object.keys(g.RTS_EVA_NAMED).map(function (k) { return g.RTS_EVA_NAMED[k]; }));
checkNames('the infantry death cries', g.RTS_DEATH_CRIES);

/* The unit voices are stored as BASE names and the table holds takes - `_1`, `_2`. That
   indirection is where the last bug lived, so it is checked through the same expansion the
   game uses rather than against the raw list. */
(function () {
  var pools = [];
  ['allied', 'soviet'].forEach(function (side) {
    ['infantry', 'vehicle'].forEach(function (kind) {
      var a = g.RTS_VOX_SELECT[side][kind], b = g.RTS_VOX_ORDER[side][kind];
      if (a) pools.push(['select/' + side + '/' + kind, a]);
      if (b) pools.push(['order/' + side + '/' + kind, b]);
    });
  });
  Object.keys(g.RTS_VOX_SPECIAL).forEach(function (k) { pools.push(['special/' + k, g.RTS_VOX_SPECIAL[k]]); });

  var dead = [], total = 0;
  pools.forEach(function (p) {
    var takes = g._rtsVoxTakes(p[1]);
    total += takes.length;
    if (!takes.length) dead.push(p[0] + ' (' + p[1].length + ' lines, none found)');
    /* a pool where SOME lines expand and others do not is the silent half-failure */
    p[1].forEach(function (base) {
      var got = takes.filter(function (t) { return t === base || t === base + '_1' || t === base + '_2'; });
      if (!got.length) dead.push(p[0] + ': ' + base);
    });
  });
  S.ok('every voice pool expands to lines that exist', !dead.length,
       dead.slice(0, 6).join('; ') || (pools.length + ' pools expanding to ' + total + ' takes'));

  /* And the expansion must actually be doing something: if it returned the base names it was
     handed, the check above would pass while every lookup missed - which is the bug that was
     here. So at least one take must differ from the name it came from. */
  var sel = g._rtsVoxTakes(g.RTS_VOX_SELECT.allied.infantry);
  S.ok('...and the expansion resolves takes, not the base names it was given',
       sel.some(function (t) { return /_[12]$/.test(t); }),
       sel.slice(0, 3).join(', '));

  /* Both armies have to be reachable. Half the identified voices are Soviet and they were all
     unplayable once, behind a branch that could not be taken. */
  ['allied', 'soviet'].forEach(function (side) {
    var n = g._rtsVoxTakes(g.RTS_VOX_SELECT[side].infantry).length +
            g._rtsVoxTakes(g.RTS_VOX_ORDER[side].infantry).length;
    S.ok('the ' + side + ' infantry have lines to say', n >= 8, n + ' takes');
  });
  S.eq('the voice side defaults to allied', g.rtsVoxSide(), 'allied');
  S.ok('and both sides are offered', g.RTS_VOX_SIDES.length === 2 &&
       g.RTS_VOX_SIDES.indexOf('soviet') >= 0, g.RTS_VOX_SIDES.join(', '));
})();

/* -------------------------------------------- every effect makes a sound ----
   An effect name reaching _rtsSfxPlay that matches none of its branches plays nothing at all.
   There is no else, no warning, no throw - it simply returns. So the set of names the game
   DISPATCHES has to be a subset of the set the dispatcher HANDLES, and the only honest way to
   know the first set is to read the call sites out of the source. */
(function () {
  var srcFiles = ['src/core', 'src/ui', 'src/render', 'src/rts.store.js',
                  'src/rts.editor.js', 'src/map', 'src/title.js'];
  var src = srcFiles.map(function (f) { return srcText(f); }).join('\n');

  /* Reading the dispatched names off the call sites needs a little care, and getting it wrong
     in either direction makes this check worthless:

       _rtsSfx(w.shot === 'missile' ? 'rocket' : 'cannon')

     Taking every string literal in the argument collects 'missile', which is not a sound - it
     is what is being compared against - and a check that demands a synth branch for it fails
     on code that is perfectly correct. So comparison operands are stripped first, and what is
     left is what actually reaches the dispatcher.

       if (kind === 'hit' || kind === 'splash') _rtsSfx(kind, x, z);

     And taking only literals inside the parentheses misses this entirely, because the name
     arrives in a variable - which is exactly where a missing sound hides, since nothing about
     the call site names it. A bare identifier is resolved from the comparisons just above it.

     Both of those are real call sites in this source, and an earlier version of this test got
     both wrong: it demanded a sound for 'missile' and never noticed 'splash'. */
  var asked = {}, unresolved = [];
  function lits(s) {
    return (s.match(/'([a-z][a-z0-9_]*)'/g) || []).map(function (l) { return l.replace(/'/g, ''); });
  }
  /* the argument expression, balanced to the matching close paren */
  function argOf(at) {
    var i = at, depth = 0, out = '';
    for (; i < src.length && i < at + 400; i++) {
      var c = src[i];
      if (c === '(') { depth++; if (depth === 1) continue; }
      if (c === ')') { depth--; if (!depth) break; }
      out += c;
    }
    return out;
  }
  var call = /_rtsSfx\(/g, m;
  while ((m = call.exec(src))) {
    var arg = argOf(m.index + '_rtsSfx'.length);
    /* only the FIRST argument names the sound; x and z follow it */
    var head = arg.split(/,(?![^(]*\))/)[0];
    /* strip comparisons - `x === 'lit'` is a test, not a name */
    var bare = head.replace(/[!=]==?\s*'[a-z0-9_]*'/g, ' ').replace(/'[a-z0-9_]*'\s*[!=]==?/g, ' ');
    var found = lits(bare);
    if (found.length) { found.forEach(function (n) { asked[n] = 1; }); continue; }
    /* no literal survived: the name is in a variable, so resolve it from the guard above */
    var id = (head.match(/^\s*([A-Za-z_$][\w$]*)\s*$/) || [])[1];
    if (!id) { unresolved.push(head.trim().slice(0, 40)); continue; }
    var before = src.slice(Math.max(0, m.index - 400), m.index);
    var cmp = before.match(new RegExp(id + "\\s*===\\s*'[a-z0-9_]+'", 'g')) || [];
    if (!cmp.length) { unresolved.push(id); continue; }
    cmp.forEach(function (c) { lits(c).forEach(function (n) { asked[n] = 1; }); });
  }
  S.note(unresolved.length
    ? ('names reaching _rtsSfx through a variable this scan cannot resolve: ' +
       unresolved.join(', ') + ' - these are checked at runtime by e2e/audio instead')
    : 'every call site names its sound literally');

  var audio = srcText('src/rts.audio.js');
  var handled = {};
  (audio.match(/name === '([a-z0-9]+)'/g) || []).forEach(function (s) {
    handled[s.replace(/.*'([a-z0-9]+)'.*/, '$1')] = 1;
  });

  var names = Object.keys(asked).sort();
  S.ok('the source dispatches a recognisable set of effect names', names.length >= 10,
       names.join(', '));

  var silent = names.filter(function (n) { return !handled[n]; });
  S.ok('every effect the game plays has a synthesized voice', !silent.length,
       silent.length ? ('nothing is synthesized for: ' + silent.join(', ')) :
                       (names.length + ' names, all handled'));

  /* The reverse is worth knowing but is not a failure: a branch nothing calls is dead weight,
     not a silent bug, so it is reported rather than asserted. */
  var unused = Object.keys(handled).filter(function (n) { return !asked[n]; }).sort();
  S.note(unused.length ? ('synthesized but never dispatched from these files: ' + unused.join(', '))
                       : 'no unreachable synth branches');

  /* A retrigger gap for a name that is never played is the tell that the name was renamed and
     the gap left behind - which is exactly how the impact sounds went missing once. */
  var strayGap = Object.keys(g._RTS_SFX_GAP).filter(function (n) { return !asked[n] && !handled[n]; });
  S.ok('every retrigger gap belongs to an effect that exists', !strayGap.length,
       strayGap.join(', ') || (Object.keys(g._RTS_SFX_GAP).length + ' gaps, all matched'));

  /* And the real-sample map must not name effects the synthesizer has never heard of: an entry
     here without a branch means the sample plays for players with archives and NOTHING plays
     for everyone else, which is the worst of the two failures because it is invisible to
     whoever is testing with their own copy of the game installed. */
  var oneSided = Object.keys(g.RTS_SND_SFX).filter(function (n) { return !handled[n]; });
  S.ok('every sampled effect also has a synthesized fallback', !oneSided.length,
       oneSided.join(', ') || (Object.keys(g.RTS_SND_SFX).length + ' mapped effects, all with fallbacks'));
})();

/* ------------------------------------------------------------ the score ----
   Track names are looked up as files in the archives rather than by hash, so a typo is a track
   that never plays. They cannot be verified against anything here - no archives ship - but the
   list can be held to being a list: no duplicates, no empties, no stray extensions. */
(function () {
  var t = g.RTS_SND_TRACKS, seen = {}, dup = [], bad = [];
  t.forEach(function (n) {
    if (seen[n]) dup.push(n); seen[n] = 1;
    if (!/^[a-z0-9_]{2,12}$/.test(n)) bad.push(n);
  });
  S.ok('the score list has no duplicate tracks', !dup.length, dup.join(', ') || t.length + ' tracks');
  S.ok('...and every name is a bare archive name, no extension', !bad.length,
       bad.join(', ') || 'all clean');
})();

/* ------------------------------------------------------- the sequencer ----
   The synthesized music is a 16-step pattern. Both tables have to be that long or the bass and
   the lead drift apart against the drums a little further every bar. */
(function () {
  S.eq('the bass line is sixteen steps', g._RTS_BASS.length, 16);
  S.eq('the lead line is sixteen steps', g._RTS_LEAD.length, 16);
  var notes = g._RTS_BASS.filter(function (v) { return v != null; });
  S.ok('the bass actually plays on most steps', notes.length >= 8, notes.length + ' of 16');
  S.ok('the lead is sparse - stabs, not a melody',
       g._RTS_LEAD.filter(function (v) { return v != null; }).length <= 8,
       g._RTS_LEAD.filter(function (v) { return v != null; }).length + ' of 16');

  /* semitones -> hertz, the one piece of arithmetic in the music */
  S.near('a semitone offset of 0 is the base note', g._rtsNote(0, 41.2), 41.2, 1e-9);
  S.near('twelve semitones is an octave up', g._rtsNote(12, 41.2), 82.4, 1e-9);
  S.near('seven semitones is a fifth', g._rtsNote(7, 41.2), 41.2 * 1.4983, 0.01);
  S.ok('every note in the bass line lands in a sane range for a bass',
       g._RTS_BASS.every(function (v) { return v == null || (g._rtsNote(v, 41.2) >= 40 && g._rtsNote(v, 41.2) <= 70); }),
       'E1 to ' + g._rtsNote(Math.max.apply(null, notes), 41.2).toFixed(1) + ' Hz');
})();

/* ------------------------------------------ nothing works without a context ----
   Every entry point is called from game code that does not check first, so with no AudioContext
   - which is every one of these specs, and any browser that refuses one - they have to decline
   quietly rather than throw. A throw inside a tick loop takes the whole frame with it. */
(function () {
  var calls = [
    ['rtsEva', function () { return g.rtsEva('ready'); }],
    ['rtsVox', function () { return g.rtsVox({ def: 'rifle', side: 'player', id: 3 }, 'select'); }],
    ['rtsDeathCry', function () { return g.rtsDeathCry({ def: 'rifle', side: 'player', id: 3, x: 0, z: 0 }); }],
    ['rtsSndMusicStart', function () { return g.rtsSndMusicStart(); }],
    ['rtsSndMusicStop', function () { return g.rtsSndMusicStop(); }],
    ['rtsSndTracks', function () { return g.rtsSndTracks(); }],
    ['rtsSndNamed', function () { return g.rtsSndNamed('unit_ready'); }],
    ['_rtsSndTry', function () { return g._rtsSndTry('rifle'); }],
    ['rtsSndReset', function () { return g.rtsSndReset(); }],
    ['_rtsSfx', function () { return g._rtsSfx('rifle', 0, 0); }],
    ['rtsMuteToggle', function () { return g.rtsMuteToggle(); }]
  ];
  var threw = [];
  calls.forEach(function (c) {
    try { c[1](); } catch (e) { threw.push(c[0] + ': ' + e.message); }
  });
  S.ok('every audio entry point declines quietly with no AudioContext', !threw.length,
       threw.slice(0, 4).join('; ') || (calls.length + ' entry points called, none threw'));

  S.eq('...and the ones that report success say no', g.rtsEva('ready'), false);
  S.eq('...for voices too', g.rtsVox({ def: 'rifle', side: 'player', id: 1 }, 'select'), false);
  S.eq('...and the score reports nothing playing', g.rtsSndMusicPlaying(), null);
  S.eq('...and no tracks are available', g.rtsSndTracks().length, 0);
})();

require('../lib/report.js')(S);
