/* THE SCORE IN THE PAGE (audio/music.js): the songs as the sampler plays them, measured on the
   music bus while the game runs. unit/music checks what every bar would play; this is whether it
   does, and whether the music follows the fight:

     IT RENDERS    every sample of the song is built within seconds, out of idle time
     IT PLAYS      calm music is heard; a battle is heard louder
     IT FOLLOWS    cannon fire on the screen raises it to a battle at the next downbeat - through
                   the real _rtsSfx - and a battle far off the screen does not; with the fighting
                   over it comes back down
     IT MOVES ON   the next song takes over at a phrase, with every one of its notes rendered in
                   time, and the last song's samples let go
     IT KEEPS      no more than a few dozen notes live at once, and the samples under 10 MB
     IT STOPS      and the bus goes quiet

   No game files are loaded, so this is the synthesized score - what a player without a copy of
   Red Alert hears. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('music');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 1100, height: 760 });
  await g.start(7, 1);

  var out = await g.page.evaluate(async function () {
    var o = {}, A = _rtsAudioInit(), R = _rtsR;
    if (!A) return { error: 'no audio' };
    if (window._rtsUI) window._rtsUI.dead = true;
    var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    async function until(fn, ms) { var t0 = Date.now(); while (!fn() && Date.now() - t0 < ms) await sleep(50); return fn(); }
    /* the music bus alone, tapped */
    var tap = A.ctx.createScriptProcessor(4096, 2, 2), sink = A.ctx.createGain(), T = { e: 0, n: 0 };
    sink.gain.value = 0;
    tap.onaudioprocess = function (ev) { var d = ev.inputBuffer.getChannelData(0); for (var i = 0; i < d.length; i++) T.e += d[i] * d[i]; T.n += d.length; };
    A.mus.connect(tap); tap.connect(sink); sink.connect(A.ctx.destination);
    async function listen(ms) { T.e = 0; T.n = 0; await sleep(ms); return T.n ? Math.sqrt(T.e / T.n) : 0; }
    var peakLive = 0;
    function watch() { if (A.music) peakLive = Math.max(peakLive, A.music.live.length); }

    /* the shell started the music with the match: stopped, and its samples dropped, so that what
       follows has to render everything it plays - the next song included */
    _rtsMusicStop(); A.heat = null; A.musBuf = {};
    _rtsMusicStart();
    var M = A.music;
    o.started = !!M;
    /* IT RENDERS */
    var t0 = Date.now();
    o.rendered = await until(function () { return !M.q.length && !M.idle; }, 20000);
    o.renderMs = Date.now() - t0;
    o.built = M.built;
    /* IT PLAYS: calm */
    var bar = 240 / RTS_SONGS[M.song].bpm * 1000;
    await sleep(bar);
    o.calmLevel = M.level;
    o.calm = await listen(bar * 2); watch();
    /* IT FOLLOWS: cannon fire in the middle of the screen, through the real dispatcher */
    var c = _rtsGroundAt(R.W / 2, R.H / 2);
    /* A FIGHT GOES ON until the music answers, as a real one does. A burst of seven shots and a
       wall-clock wait of two bars failed in a full run: the scheduler works in idle time, so on a
       busy machine its next downbeat came late, after the heat of the burst had cooled. What is
       claimed is musical time - the battle within two of the score's own bars - so that is what
       is counted, and the shooting keeps up until then. */
    var bars0 = M.bars, i;
    for (i = 0; i < 7; i++) { A.last = {}; _rtsSfx('cannon', c.x, c.z); await sleep(120); }
    o.heat = +_rtsMusicHeat(A, A.ctx.currentTime).toFixed(2);
    o.rose = await until(function () { A.last = {}; _rtsSfx('cannon', c.x, c.z); return M.level === 2; }, bar * 8 + 600);
    o.riseBars = M.bars - bars0;
    await sleep(bar);
    o.battle = await listen(bar * 2); watch();
    /* ...and a battle far off the screen does not heat it */
    A.heat = null;
    for (i = 0; i < 10; i++) { A.last = {}; _rtsSfx('cannon', c.x + 4000, c.z + 4000); }
    o.farHeat = _rtsMusicHeat(A, A.ctx.currentTime);
    /* ...and with the fighting over, back down, a step at a time */
    var hold = window.RTS_MUS_HOLD; window.RTS_MUS_HOLD = 0.5;
    var levels = [M.level];
    o.fell = await until(function () { if (levels[levels.length - 1] !== M.level) levels.push(M.level); watch(); return M.level === 0; }, bar * 6);
    o.levels = levels.join(' > ');
    window.RTS_MUS_HOLD = hold;
    /* IT MOVES ON: the next song, four bars from now */
    var keep = window.RTS_MUS_SONG_BARS; window.RTS_MUS_SONG_BARS = M.bar + 4;
    var song0 = M.song, missed0 = M.missed, oldTag = '@' + RTS_SONGS[song0].bpm;
    o.switched = await until(function () { watch(); return M.song !== song0; }, bar * 7);
    window.RTS_MUS_SONG_BARS = keep;
    await sleep(240 / RTS_SONGS[M.song].bpm * 1000 * 2); watch();
    o.missedAfter = M.missed - missed0;
    o.oldLeft = Object.keys(M.buf).filter(function (k) { return k.slice(-oldTag.length) === oldTag; }).length;
    o.newSong = RTS_SONGS[M.song].name;
    /* IT KEEPS */
    o.peakLive = peakLive;
    o.mb = Object.keys(M.buf).reduce(function (s, k) { var b = M.buf[k]; return s + b.length * b.numberOfChannels * 4; }, 0) / 1e6;
    /* IT STOPS */
    /* ...within a fifth of a second: the score fades out, rather than ringing on until its
       output is unplugged half a second later */
    _rtsMusicStop();
    o.stopped = !A.music;
    await sleep(150);
    o.after = await listen(300);
    return o;
  });

  S.ok('the music starts', out.started, out.error || '');
  S.ok('every sample of the song is rendered within seconds, out of idle time', out.rendered && out.built > 40,
       out.built + ' samples in ' + out.renderMs + ' ms');
  S.ok('calm music is heard', out.calmLevel === 0 && out.calm > 0.004, 'rms ' + out.calm.toFixed(4) + ' at level ' + out.calmLevel);
  S.ok('cannon fire on the screen raises it to a battle at the next downbeat', out.rose && out.riseBars <= 2, 'heat ' + out.heat + ', battle ' + out.riseBars + ' bar(s) after the first shot');
  S.ok('...and the battle is heard louder than the calm', out.battle > out.calm * 1.5, 'rms ' + out.battle.toFixed(4) + ' against ' + out.calm.toFixed(4));
  S.eq('a battle far off the screen adds no heat', out.farHeat, 0);
  S.ok('with the fighting over it comes back down, a step at a time', out.fell && out.levels === '2 > 1 > 0', out.levels);
  S.ok('the next song takes over at a phrase', out.switched, out.newSong);
  S.eq('...with every one of its notes rendered in time', out.missedAfter, 0);
  S.eq('...and the last song\'s samples let go', out.oldLeft, 0);
  S.ok('no more than a few dozen notes live at once', out.peakLive > 0 && out.peakLive < 160, out.peakLive + ' at the most');
  S.ok('...and the samples under 10 MB', out.mb < 10, out.mb.toFixed(1) + ' MB');
  S.ok('stopping it fades it out within a fifth of a second', out.stopped && out.after < out.calm * 0.1, 'rms ' + out.after.toFixed(5) + ' from 150 ms after');
  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
