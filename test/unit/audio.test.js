/* THE ONE FAILURE MODE AUDIO HAS: SILENCE. Nothing throws, nothing logs, the game plays on, and
   the only symptom is a sound that never comes. Not something a person notices by playing;
   something a check over the source notices in a millisecond. So:

     every effect the game ever dispatches has a synthesized recipe to play,
     every retrigger gap belongs to an effect that exists,
     the shell's music calls reach the score,
     and with no AudioContext every entry point declines quietly instead of throwing.

   What needs a real AudioContext - that a sound reaches the speakers, that muting works - is
   test/e2e/audio. */

var fs = require('fs');
var path = require('path');
var { Suite } = require('../lib/assert.js');
var { load, read: srcText } = require('../lib/sandbox.js');

var S = new Suite('audio');
var ROOT = path.resolve(__dirname, '..', '..');
var g = load(['src/rules/factions.js', 'src/audio', 'src/rts.audio.js']);

/* ------------------------------------------------------- the army picker ---- */
S.eq('the army defaults to allied', g.rtsArmySide(), 'allied');
S.ok('...and both are offered', g.RTS_ARMY_SIDES.length === 2 && g.RTS_ARMY_SIDES.indexOf('soviet') >= 0, g.RTS_ARMY_SIDES.join(', '));

/* -------------------------------------------- every effect makes a sound ----
   An effect name reaching _rtsSfxPlay that matches none of its branches plays nothing at all.
   There is no else, no warning, no throw - it simply returns. So the set of names the game
   DISPATCHES has to be a subset of the set the dispatcher HANDLES, and the only honest way to
   know the first set is to read the call sites out of the source. */
(function () {
  var srcFiles = ['src/core', 'src/ui', 'src/render', 'src/title.js'];
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

  /* what can be played: every effect there is a recipe for (audio/recipes.js) */
  var handled = {};
  g.rtsSfxNames().forEach(function (n) { handled[n] = 1; });

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

})();

/* ------------------------------------------------------- the sequencer ----
   The synthesized score is two songs now (audio/score.js), played by a sampler (audio/music.js);
   unit/music plays every bar of them. All that is asked here is that the entry points the shell
   calls are the ones that start and stop it. */
(function () {
  S.ok('the shell\'s music calls reach the score', /_rtsMusicBegin\(A\)/.test(g._rtsMusicStart.toString()) &&
       /_rtsMusicEnd\(_rtsA\)/.test(g._rtsMusicStop.toString()));
})();

/* ------------------------------------------ nothing works without a context ----
   Every entry point is called from game code that does not check first, so with no AudioContext
   - which is every one of these specs, and any browser that refuses one - they have to decline
   quietly rather than throw. A throw inside a tick loop takes the whole frame with it. */
(function () {
  var calls = [
    ['_rtsSfx', function () { return g._rtsSfx('rifle', 0, 0); }],
    ['_rtsMusicStart', function () { return g._rtsMusicStart(); }],
    ['_rtsMusicStop', function () { return g._rtsMusicStop(); }],
    ['rtsMuteToggle', function () { return g.rtsMuteToggle(); }]
  ];
  var threw = [];
  calls.forEach(function (c) {
    try { c[1](); } catch (e) { threw.push(c[0] + ': ' + e.message); }
  });
  S.ok('every audio entry point declines quietly with no AudioContext', !threw.length,
       threw.slice(0, 4).join('; ') || (calls.length + ' entry points called, none threw'));

})();

require('../lib/report.js')(S);
