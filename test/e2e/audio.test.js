/* The audio, measured as sound rather than as function calls.

   This subsystem has exactly one failure mode and it is silence. Nothing throws, nothing logs:
   an effect name that matches no branch in the dispatcher simply returns, a sample name that is
   not in the archives quietly falls back, a muted bus passes zeroes. Every one of those looks
   identical from the outside - the game runs, and a sound does not come. So a spec that checked
   "was the handler called" would pass through all of them.

   Headless Chromium runs WebAudio for real, so this does not have to guess: a ScriptProcessor
   is tapped onto the master bus and the actual samples are read back. Every assertion below is
   about signal - peak amplitude and energy over a window - which is the only thing that
   distinguishes a sound that plays from a sound that does not.

   The one exception is the retrigger gap, where "how many sounds were made" is the question and
   the answer is counted by wrapping the context's node constructors. That is still the product
   of the call rather than the call itself: a suppressed effect builds nothing. It is corroborated
   with an energy measurement immediately afterwards so it cannot pass on node-counting alone.

   No game assets ship here, so RTS_MIX is empty and every sample lookup misses. That is the
   primary path - it is what a player without a copy of Red Alert hears - and the synthesized
   fallback is what is under test. The sampled path is covered by unit/audio, which checks that
   every name the game asks for is one the identity table can actually resolve. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('audio');

/* Installed in the page once. Taps the master bus and accumulates peak and energy between
   resets, so a measurement is "what came out of the speakers while this ran". */
function installProbe() {
  var A = _rtsAudioInit();
  if (!A) return false;
  var ctx = A.ctx;
  var tap = ctx.createScriptProcessor(4096, 1, 1);
  var sink = ctx.createGain(); sink.gain.value = 0;      /* the tap must run, but not be heard twice */
  var M = { peak: 0, energy: 0, frames: 0 };
  tap.onaudioprocess = function (e) {
    var d = e.inputBuffer.getChannelData(0);
    for (var i = 0; i < d.length; i++) {
      var v = d[i] < 0 ? -d[i] : d[i];
      if (v > M.peak) M.peak = v;
      M.energy += d[i] * d[i];
      M.frames++;
    }
  };
  A.master.connect(tap); tap.connect(sink); sink.connect(ctx.destination);
  window._AP = M;
  window._apReset = function () { M.peak = 0; M.energy = 0; M.frames = 0; };
  /* Measure what a piece of code produces.

     The wait BEFORE the reset is not padding. An explosion rings for the best part of a
     second, so a measurement taken straight after the previous one is reading the tail of
     that one - which made a shot that had been correctly culled for being off-screen measure
     as clearly audible, and a single rifle measure louder than twelve. Every measurement here
     therefore waits for the room to go quiet, resets, and only then runs. */
  window._apSettle = function (ms) {
    return new Promise(function (res) { setTimeout(res, ms || 520); });
  };
  window._apMeasure = function (fn, ms) {
    return window._apSettle().then(function () {
      window._apReset();
      try { fn(); } catch (e) { return { error: String(e && e.message || e) }; }
      return new Promise(function (res) {
        setTimeout(function () {
          res({ peak: M.peak, rms: M.frames ? Math.sqrt(M.energy / M.frames) : 0, frames: M.frames });
        }, ms || 320);
      });
    });
  };
  /* Count the nodes a piece of code builds. A suppressed effect builds none. */
  window._apCount = function (fn) {
    var n = 0;
    var co = ctx.createOscillator, cb = ctx.createBufferSource;
    ctx.createOscillator = function () { n++; return co.apply(ctx, arguments); };
    ctx.createBufferSource = function () { n++; return cb.apply(ctx, arguments); };
    try { fn(); } finally { ctx.createOscillator = co; ctx.createBufferSource = cb; }
    return n;
  };
  return true;
}

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 1200, height: 800 });

  var up = await g.page.evaluate(function (src) {
    return eval('(' + src + ')()');
  }, installProbe.toString());
  S.ok('WebAudio is available and the master bus can be tapped', up === true, String(up));
  if (up !== true) { await g.close(); await browser.close(); return require('../lib/report.js')(S); }

  /* ------------------------------------------------------------- the graph ----
     Three buses, and the levels are the mix. If sfx and music were not separate, the music
     could not sit under a firefight, which is the whole reason for the split. */
  var graph = await g.page.evaluate(function () {
    var A = _rtsAudioInit();
    return { state: A.ctx.state, rate: A.ctx.sampleRate,
             master: A.master.gain.value, sfx: A.sfx.gain.value, mus: A.mus.gain.value,
             noiseSec: A.noise.length / A.ctx.sampleRate, muted: A.muted };
  });
  S.eq('the audio context is running', graph.state, 'running');
  S.ok('master sits below unity so summed effects have headroom',
       graph.master > 0.5 && graph.master < 1, 'master ' + graph.master.toFixed(2));
  S.ok('effects and music are on separate buses at different levels',
       graph.sfx > graph.mus, 'sfx ' + graph.sfx.toFixed(2) + ' vs music ' + graph.mus.toFixed(2));
  S.ok('the music sits well under the effects, so a firefight is still legible',
       graph.mus < graph.sfx * 0.6, 'music is ' + Math.round(graph.mus / graph.sfx * 100) + '% of sfx');
  S.near('the shared noise buffer is one second', graph.noiseSec, 1, 0.001);
  S.eq('and it starts unmuted', graph.muted, false);

  /* -------------------------------------------- every effect makes a sound ----
     The assertion this spec exists for. An effect name that matches no branch in _rtsSfxPlay
     returns without doing anything - there is no else and no warning - so the only way to know
     a name works is to play it and listen. `splash`, which _rtsImpact dispatches for every
     round that lands in water, was silent exactly this way. */
  var names = await g.page.evaluate(function () {
    /* Not a hand-written list: the names the game DISPATCHES, collected by wrapping _rtsSfx
       and playing a real match, plus the impact kinds, which arrive through a variable and so
       never appear literally at a call site. A hardcoded list would drift away from the code
       and stop meaning anything. */
    var seen = {}, real = window._rtsSfx;
    window._rtsSfx = function (n) { if (typeof n === 'string') seen[n] = 1; return real.apply(null, arguments); };
    try {
      rtsOpen(7);
      for (var i = 0; i < 60 * 90; i++) _rtsTick(1 / 60);
      /* An idle player survives about five minutes, so ninety seconds of a real match yields
         the economy and construction sounds and no combat at all - which would quietly leave
         every weapon in the game untested. So a fight is arranged rather than waited for:
         two sides put within reach of each other, and ticked until they have killed each
         other. That covers the guns, the impacts and the deaths. */
      var f = _rtsR ? _rtsR.focus : { x: 40, z: 40 };
      ['rifle', 'rocket', 'tank', 'heavy'].forEach(function (k, n) {
        _rtsSpawnUnit('player', k, f.x - 3 + n, f.z);
        _rtsSpawnUnit('enemy', k, f.x + 3 + n, f.z);
      });
      for (var j = 0; j < 60 * 60; j++) _rtsTick(1 / 60);
    } catch (e) { seen._error = String(e && e.message || e); }
    window._rtsSfx = real;
    /* Freeze the match before anything is measured. A live battle keeps its rAF loop running
       and keeps firing effects of its own, and every measurement after this point is of a
       supposedly quiet room - leave it running and a shot correctly culled for being
       off-screen still measures as loud, because what the tap heard was the battle.

       Frozen rather than closed: rtsClose disposes the renderer, and _rtsAudible answers
       "yes, everything" without one, which would quietly turn the off-screen culling test
       into a test of nothing. This is the same stop rtsClose uses, without the teardown. */
    try {
      var U = window._rtsUI;
      if (U) { U.dead = true; if (U.raf) cancelAnimationFrame(U.raf); }
      if (typeof _rtsMusicStop === 'function') _rtsMusicStop();
    } catch (e2) {}
    /* `splash` arrives through a variable from the impact dispatcher and needs a round to
       land on water, which this map may not offer - so it is named here rather than left to
       chance. It is the one that was broken. */
    seen.splash = 1;
    return Object.keys(seen).sort();
  });
  S.ok('a real match dispatches a broad set of effects', names.length >= 8, names.join(', '));

  var silent = [], levels = [];
  for (var i = 0; i < names.length; i++) {
    var nm = names[i];
    var r = await g.page.evaluate(function (n) {
      var A = _rtsAudioInit();
      A.last = {};                                  /* the retrigger gap is tested separately */
      return window._apMeasure(function () { _rtsSfxPlay(n, A.ctx.currentTime); }, 300);
    }, nm);
    levels.push(nm + ' ' + (r.peak || 0).toFixed(3));
    if (r.error || !(r.peak > 0.004)) silent.push(nm + (r.error ? ' (' + r.error + ')' : ' (peak ' + (r.peak || 0).toFixed(4) + ')'));
  }
  S.ok('every effect the game dispatches actually produces sound', !silent.length,
       silent.join('; ') || levels.join('  '));

  /* the specific regression: a round landing in water */
  var splash = await g.page.evaluate(function () {
    var A = _rtsAudioInit(); A.last = {};
    return window._apMeasure(function () { _rtsSfx('splash', null, null); }, 320);
  });
  S.ok('a round landing in water is audible', splash.peak > 0.01,
       'peak ' + splash.peak.toFixed(3) + ', rms ' + splash.rms.toFixed(4));

  /* ---------------------------------------------------------- the retrigger gap ----
     Twelve rifles firing in unison must be one crack, not twelve phase-cancelling ones. The
     gap is what does that, and without it a firefight is a wall of noise. */
  var gap = await g.page.evaluate(async function () {
    var A = _rtsAudioInit();
    A.last = {};
    var burst = window._apCount(function () {
      for (var i = 0; i < 12; i++) _rtsSfx('rifle', null, null);
    });
    /* the same twelve, spaced past the gap, must all be heard */
    var spaced = 0;
    for (var j = 0; j < 6; j++) {
      A.last = {};
      spaced += window._apCount(function () { _rtsSfx('rifle', null, null); });
    }
    /* and it must be a GAP, not a mute: the same effect has to come back at full level once
       the gap has elapsed. Both shots are measured from silence, so neither is reading the
       other's tail. */
    A.last = {};
    var first = await window._apMeasure(function () { _rtsSfx('rifle', null, null); }, 250);
    var again = await window._apMeasure(function () { _rtsSfx('rifle', null, null); }, 250);
    /* A second shot INSIDE the gap, for contrast. This one is counted rather than listened to,
       and that is forced by physics rather than convenience: the rifle's gap is 0.05s and the
       rifle itself is 0.09s long, so the suppressed second shot's window lies entirely inside
       the first shot's tail. There is no moment at which a microphone could tell the two
       apart. An earlier version of this test tried anyway and passed on the timing of a
       buffer boundary. What can be established exactly is that the second call builds nothing. */
    A.last = {};
    var shot1 = window._apCount(function () { _rtsSfx('rifle', null, null); });
    var shot2 = window._apCount(function () { _rtsSfx('rifle', null, null); });
    return { burst: burst, spaced: spaced, first: first.peak, again: again.peak,
             shot1: shot1, shot2: shot2, oneShot: spaced / 6 };
  });
  S.ok('twelve rifles at once collapse into far fewer sounds',
       gap.burst > 0 && gap.burst < gap.spaced * 0.5,
       gap.burst + ' nodes for twelve simultaneous shots, against ' + gap.spaced + ' for twelve spaced out');
  S.ok('...but the burst is not silenced entirely', gap.burst >= gap.oneShot,
       'at least one full shot got through (' + gap.burst + ' nodes, one shot builds ' + gap.oneShot + ')');
  S.ok('a shot fired from silence builds a sound', gap.shot1 > 0, gap.shot1 + ' nodes');
  S.eq('...and a second one immediately after it builds nothing at all', gap.shot2, 0);
  S.ok('...but once the gap elapses the effect sounds again',
       gap.first > 0.02 && gap.again > 0.02,
       'two spaced shots, both audible: ' + gap.first.toFixed(3) + ' and ' + gap.again.toFixed(3));

  /* ------------------------------------------------------ off-screen culling ----
     A battle on the far side of the map is not audible. This is the other half of what keeps a
     big fight from turning to mush, and it is easy to break by moving the camera model. */
  var cull = await g.page.evaluate(async function () {
    var A = _rtsAudioInit(); A.last = {};
    var f = _rtsR ? _rtsR.focus : { x: 0, z: 0 };
    var near = await window._apMeasure(function () { _rtsSfx('cannon', f.x, f.z); }, 320);
    A.last = {};
    var far = await window._apMeasure(function () { _rtsSfx('cannon', f.x + 4000, f.z + 4000); }, 320);
    return { near: near.peak, far: far.peak, audibleNear: _rtsAudible(f.x, f.z), audibleFar: _rtsAudible(f.x + 4000, f.z + 4000) };
  });
  S.ok('a shot in view is heard', cull.near > 0.01, 'peak ' + cull.near.toFixed(3));
  S.eq('a shot on the far side of the map is silent', cull.far, 0);
  S.eq('...because it is judged out of earshot', cull.audibleFar, false);
  S.eq('...while the one in view is not', cull.audibleNear, true);

  /* ------------------------------------------------------------------- mute ----
     The button has to actually stop the sound, not just change its own label.

     Two separate things make that true and only one of them covers everything: _rtsSfx
     declines outright while muted, and the master gain is pulled to zero. Effects would go
     quiet on the flag alone - but the music does not go through _rtsSfx, so if the gain were
     ever left alone the score would keep playing over a muted game. So the gain is asserted
     on directly, and the music is muted separately below rather than assumed. */
  var mute = await g.page.evaluate(async function () {
    var A = _rtsAudioInit(); A.last = {};
    var before = await window._apMeasure(function () { _rtsSfx('boom', null, null); }, 320);
    rtsMuteToggle();
    await new Promise(function (r) { setTimeout(r, 200); });      /* the gain ramps, it does not jump */
    A.last = {};
    var during = await window._apMeasure(function () { _rtsSfx('boom', null, null); }, 320);
    var label = (document.getElementById('rtsMute') || {}).textContent;
    var flagged = A.muted, gain = A.master.gain.value;
    rtsMuteToggle();
    await new Promise(function (r) { setTimeout(r, 200); });
    A.last = {};
    var after = await window._apMeasure(function () { _rtsSfx('boom', null, null); }, 320);
    return { before: before.peak, during: during.peak, after: after.peak,
             label: label, flagged: flagged, gain: gain, backOn: A.master.gain.value };
  });
  S.ok('an explosion is loud before muting', mute.before > 0.05, 'peak ' + mute.before.toFixed(3));
  S.ok('muting actually silences the output', mute.during < mute.before * 0.02,
       'peak fell from ' + mute.before.toFixed(3) + ' to ' + mute.during.toFixed(4));
  S.ok('...and the master gain is what fell', mute.gain < 0.01, 'master ' + mute.gain.toFixed(4));
  S.eq('...with the button showing it', mute.label, '🔇');
  S.ok('unmuting brings it back', mute.after > mute.before * 0.5,
       'peak back to ' + mute.after.toFixed(3) + ' (master ' + mute.backOn.toFixed(2) + ')');

  /* ------------------------------------------------------------------ music ----
     The synthesized score is a sequencer on a timer, not a one-shot, so the test is that it
     keeps producing sound over time - and that stopping it stops it. A sequencer that schedules
     one bar and dies looks identical to a working one if you only listen for a moment. */
  var music = await g.page.evaluate(async function () {
    var A = _rtsAudioInit();
    _rtsMusicStop();
    /* no archives here, so this is the synthesized path - which is the point */
    var usedSamples = (typeof rtsSndMusicPlaying === 'function') && rtsSndMusicPlaying();
    _rtsMusicStart();
    var running = !!A.music;
    await new Promise(function (r) { setTimeout(r, 400); });      /* let the sequencer get going */
    window._apReset();
    /* Long enough to cross a bar line. At 128bpm an eighth-note step is 234ms and the pattern
       is sixteen of them, so a bar is 3.75s - and "does it loop" cannot be answered by
       listening for less than one. A shorter window would pass against a sequencer that
       scheduled its first bar and stopped. */
    await new Promise(function (r) { setTimeout(r, 4400); });
    var on = { peak: window._AP.peak, rms: window._AP.frames ? Math.sqrt(window._AP.energy / window._AP.frames) : 0 };
    var bars = A.music ? A.music.bars : -1, steps = A.music ? A.music.step : -1;
    _rtsMusicStop();
    var stopped = !A.music;
    await new Promise(function (r) { setTimeout(r, 700); });      /* let scheduled notes ring out */
    window._apReset();
    await new Promise(function (r) { setTimeout(r, 500); });
    var off = { peak: window._AP.peak, rms: window._AP.frames ? Math.sqrt(window._AP.energy / window._AP.frames) : 0 };
    return { running: running, on: on, off: off, bars: bars, steps: steps,
             stopped: stopped, usedSamples: usedSamples };
  });
  S.eq('with no archives loaded the score is the synthesized one', music.usedSamples, null);
  S.eq('starting the music starts a sequencer', music.running, true);
  S.ok('...which keeps producing sound, not one bar and silence', music.on.rms > 0.005,
       'rms ' + music.on.rms.toFixed(4) + ', peak ' + music.on.peak.toFixed(3) +
       ' over 4.4s, having reached step ' + music.steps);
  S.ok('...and the pattern loops rather than running out', music.bars >= 1 && music.steps >= 16,
       music.steps + ' steps through ' + music.bars + ' complete bars');
  S.eq('stopping it clears the sequencer', music.stopped, true);
  S.ok('...and the sound stops', music.off.rms < music.on.rms * 0.05,
       'rms fell from ' + music.on.rms.toFixed(4) + ' to ' + music.off.rms.toFixed(5));

  /* Muting has to silence the SCORE, not just the guns. The music never touches _rtsSfx, so
     the flag that stops effects does nothing for it - only the master gain does. */
  var musMute = await g.page.evaluate(async function () {
    var A = _rtsAudioInit();
    _rtsMusicStart();
    await new Promise(function (r) { setTimeout(r, 600); });
    window._apReset();
    await new Promise(function (r) { setTimeout(r, 600); });
    var loud = window._AP.frames ? Math.sqrt(window._AP.energy / window._AP.frames) : 0;
    rtsMuteToggle();
    await new Promise(function (r) { setTimeout(r, 400); });
    window._apReset();
    await new Promise(function (r) { setTimeout(r, 700); });
    var quiet = window._AP.frames ? Math.sqrt(window._AP.energy / window._AP.frames) : 0;
    rtsMuteToggle();
    _rtsMusicStop();
    await new Promise(function (r) { setTimeout(r, 300); });
    return { loud: loud, quiet: quiet };
  });
  S.ok('the music is playing before muting', musMute.loud > 0.005, 'rms ' + musMute.loud.toFixed(4));
  S.ok('...and muting silences the score, not only the guns',
       musMute.quiet < musMute.loud * 0.02,
       'rms fell from ' + musMute.loud.toFixed(4) + ' to ' + musMute.quiet.toFixed(5));

  /* the music has to be ON the music bus, or its level cannot be set independently */
  var bus = await g.page.evaluate(async function () {
    var A = _rtsAudioInit();
    var was = A.mus.gain.value;
    A.mus.gain.value = 0;
    _rtsMusicStart();
    await new Promise(function (r) { setTimeout(r, 500); });
    window._apReset();
    await new Promise(function (r) { setTimeout(r, 600); });
    var quiet = window._AP.frames ? Math.sqrt(window._AP.energy / window._AP.frames) : 0;
    _rtsMusicStop();
    A.mus.gain.value = was;
    return { quiet: quiet };
  });
  S.ok('the music runs through the music bus, so its level is separately controllable',
       bus.quiet < 0.002, 'rms with the music bus at zero: ' + bus.quiet.toFixed(5));

  /* --------------------------------------------- the sampled path, with nothing ----
     Every one of these is called from game code that does not check first. With no archives
     they must decline and let the synthesized version carry on - never throw inside a tick. */
  var noArt = await g.page.evaluate(function () {
    var out = { threw: [] }, A = _rtsAudioInit();
    function t(n, f) { try { out[n] = f(); } catch (e) { out.threw.push(n + ': ' + e.message); } }
    t('ready', function () { return _rtsArtReady(); });
    t('sndReady', function () { return _rtsSndReady(); });
    t('eva', function () { return rtsEva('built'); });
    t('vox', function () { return rtsVox({ def: 'rifle', side: 'player', id: 4 }, 'select'); });
    t('cry', function () { return rtsDeathCry({ def: 'rifle', side: 'player', id: 4, x: 0, z: 0 }); });
    t('tracks', function () { return rtsSndTracks().length; });
    t('musicStart', function () { return rtsSndMusicStart(); });
    t('sndTry', function () { return _rtsSndTry('rifle'); });
    t('named', function () { return rtsSndNamed('unit_ready'); });
    return out;
  });
  S.ok('no sampled entry point throws when the player has no game files', !noArt.threw.length,
       noArt.threw.join('; ') || 'nine entry points, none threw');
  S.eq('the artwork is correctly reported as absent', noArt.sndReady, false);
  S.eq('EVA declines', noArt.eva, false);
  S.eq('unit voices decline', noArt.vox, false);
  S.eq('death cries decline', noArt.cry, false);
  S.eq('the sampled score offers no tracks', noArt.tracks, 0);
  S.eq('and the sampled effect hook declines, so the synth plays', noArt.sndTry, false);

  /* And the whole point of declining: the synthesized effect still sounds. */
  var fallback = await g.page.evaluate(function () {
    var A = _rtsAudioInit(); A.last = {};
    return window._apMeasure(function () { _rtsSfx('cannon', null, null); }, 320);
  });
  S.ok('a player with no game files still hears the guns', fallback.peak > 0.05,
       'peak ' + fallback.peak.toFixed(3));

  S.ok('the page logged no errors throughout', !g.errors.length,
       g.errors.slice(0, 3).join(' | ') || 'clean');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})();
