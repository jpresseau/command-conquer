/* THE MIXER, heard in the page (audio/mix.js, audio/bank.js): the rendered effects as they come
   out of the speakers. unit/sfx measures the effects themselves; this is where they go.

     THE CHAIN     the effects pass a room and a compressor on their way out
     LEFT, RIGHT   a shot on the left of the SCREEN is heard on the left, a shot on the right on
                   the right - found by the pixel it is under, so it holds with the camera turned
     THE TAKES     the bank fills in the background, and a squad never repeats one take twice
                   running
     TOO MANY      a barrage is held to the voice caps, an interface chime still gets through it,
                   and what reaches the speakers does not clip
     NOTHING LIVE  a fight builds one buffer source a shot and not a single oscillator

   No game files are loaded, so every effect is the rendered one - the path a player without a
   copy of Red Alert hears. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('sfxmix');

/* Two stereo taps: on the master, before the lid, and after the compressor - what the speakers get. */
function installProbe() {
  var A = _rtsAudioInit();
  if (!A || !A.lid) return 'no audio or no compressor';
  var ctx = A.ctx;
  function tap(node) {
    var t = ctx.createScriptProcessor(4096, 2, 2), sink = ctx.createGain(), M = { L: 0, R: 0, peak: 0 };
    t.channelCountMode = 'explicit'; t.channelCount = 2;
    sink.gain.value = 0;
    t.onaudioprocess = function (e) {
      var l = e.inputBuffer.getChannelData(0), r = e.inputBuffer.getChannelData(1);
      for (var i = 0; i < l.length; i++) {
        M.L += l[i] * l[i]; M.R += r[i] * r[i];
        var p = Math.max(Math.abs(l[i]), Math.abs(r[i])); if (p > M.peak) M.peak = p;
      }
    };
    node.connect(t); t.connect(sink); sink.connect(ctx.destination);
    return M;
  }
  var pre = tap(A.master), post = tap(A.out || A.lid);
  A.mus.gain.value = 0;
  function reset() { [pre, post].forEach(function (M) { M.L = 0; M.R = 0; M.peak = 0; }); }
  window._mxQuiet = function () {
    var t0 = Date.now();
    return new Promise(function (res) {
      (function again() { reset(); setTimeout(function () { if (pre.peak < 0.003 || Date.now() - t0 > 8000) res(); else again(); }, 150); })();
    });
  };
  window._mxHear = function (fn, ms) {
    return window._mxQuiet().then(function () {
      reset(); fn();
      return new Promise(function (res) {
        setTimeout(function () { res({ L: pre.L, R: pre.R, pre: pre.peak, post: post.peak }); }, ms || 700);
      });
    });
  };
  return true;
}

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 1200, height: 800 });
  await g.start(7, 1);
  var up = await g.page.evaluate(function (src) { return eval('(' + src + ')()'); }, installProbe.toString());
  S.ok('WebAudio is available, with the compressor in the chain', up === true, String(up));
  if (up !== true) { await g.close(); await browser.close(); return require('../lib/report.js')(S); }

  var out = await g.page.evaluate(async function () {
    var o = {}, A = _rtsA, R = _rtsR, G = window._rtsG;
    if (window._rtsUI) window._rtsUI.dead = true;
    o.room = !!(A.mix && A.mix.verbIn);
    o.buses = Object.keys(A.mix.cat).length;
    o.in3d = !!(window._R3D && window._R3D.on);

    /* LEFT, RIGHT: a cannon under the pixel 15% in from either edge, and one dead centre */
    async function at(px) {
      var p = _rtsGroundAt(R.W * px, R.H / 2);
      A.last = {};
      var m = await window._mxHear(function () { _rtsSfx('cannon', p.x, p.z); });
      return { lr: m.L / Math.max(1e-12, m.R), heard: m.L + m.R, pan: _rtsPanAt(p.x, p.z) };
    }
    o.left = await at(0.15); o.right = await at(0.85); o.mid = await at(0.5);
    /* in 3D, turned a quarter: the screen's left is somewhere else on the map now */
    rts3dSet(true);
    o.in3d = !!(window._R3D && window._R3D.on);
    if (o.in3d) { _r3dCamSet(Math.PI / 2); _rtsApplyCam(); _rtsRFrame(0); }
    o.turnedLeft = await at(0.15);
    o.turnedRight = await at(0.85);

    /* THE TAKES: the bank filled out of idle time, then a squad's worth of rifles */
    var t0 = Date.now();
    while (A.bank.q === null || A.bank.q.length) {
      if (Date.now() - t0 > 20000) break;
      _rtsBankIdle(A);
      await new Promise(function (r) { setTimeout(r, 100); });
    }
    var want = 0; rtsSfxNames().forEach(function (n) { want += _rtsSfxRecipe(n).takes; });
    o.bank = { built: A.bank.built, want: want, left: A.bank.q ? A.bank.q.length : -1 };
    var seq = [];
    for (var i = 0; i < 12; i++) { var b = _rtsBankPick(A, 'rifle'); seq.push(Object.keys(A.bank.take).filter(function (k) { return A.bank.take[k] === b; })[0]); }
    o.takes = { distinct: seq.filter(function (v, i) { return seq.indexOf(v) === i; }).length, repeats: seq.filter(function (v, i) { return i && v === seq[i - 1]; }).length };

    /* TOO MANY: a barrage of everything at once at the centre of the view, past the retrigger gaps */
    var c = _rtsGroundAt(R.W / 2, R.H / 2), names = ['cannon', 'boom', 'pop', 'hit', 'rifle', 'mg', 'turretgun', 'rocket'];
    o.barrage = await window._mxHear(function () {
      for (var k = 0; k < 60; k++) _rtsSfxPlay(names[k % names.length], A.ctx.currentTime, null, c.x, c.z);
      var now = A.ctx.currentTime, live = A.mix.voices.filter(function (v) { return v.end > now; });
      o.live = live.length;
      o.perName = Math.max.apply(null, names.map(function (n) { return live.filter(function (v) { return v.name === n; }).length; }));
      var before = A.mix.voices.length;
      _rtsSfxPlay('ready', A.ctx.currentTime);
      o.chime = A.mix.voices.some(function (v) { return v.name === 'ready' && v.end > A.ctx.currentTime; });
    }, 900);

    /* NOTHING LIVE: thirty shots, and what they build */
    await window._mxQuiet();
    var ctx = A.ctx, nOsc = 0, nSrc = 0, co = ctx.createOscillator, cb = ctx.createBufferSource;
    ctx.createOscillator = function () { nOsc++; return co.apply(ctx, arguments); };
    ctx.createBufferSource = function () { nSrc++; return cb.apply(ctx, arguments); };
    var played = 0;
    for (i = 0; i < 30; i++) { A.last = {}; _rtsSfxPlay(names[i % names.length], ctx.currentTime, null, c.x, c.z); played++; }
    ctx.createOscillator = co; ctx.createBufferSource = cb;
    o.live30 = { osc: nOsc, src: nSrc, played: played };
    return o;
  });

  S.ok('the effects play into a room', out.room, '');
  S.eq('...through a bus for each kind of sound', out.buses, 4);
  S.ok('a shot on the left of the screen is heard on the left', out.left.lr > 2 && out.left.pan < -0.3,
       'left/right energy ' + out.left.lr.toFixed(2) + ', pan ' + out.left.pan.toFixed(2));
  S.ok('...one on the right on the right', out.right.lr < 0.5 && out.right.pan > 0.3,
       'left/right energy ' + out.right.lr.toFixed(2) + ', pan ' + out.right.pan.toFixed(2));
  S.ok('...and one in the middle in the middle', out.mid.lr > 0.7 && out.mid.lr < 1.4, 'left/right ' + out.mid.lr.toFixed(2));
  S.ok('...the screen\'s left and right, in 3D with the camera turned a quarter', out.in3d && out.turnedLeft.lr > 2 && out.turnedRight.lr < 0.5,
       'left/right ' + out.turnedLeft.lr.toFixed(2) + ' and ' + out.turnedRight.lr.toFixed(2) + (out.in3d ? '' : ' - no 3D'));
  S.ok('the bank fills itself in the background, every take of every effect', out.bank.left === 0 && out.bank.built === out.bank.want,
       out.bank.built + ' of ' + out.bank.want + ' takes');
  S.ok('a squad\'s twelve rifles use several takes, never one twice running', out.takes.distinct >= 3 && out.takes.repeats === 0,
       out.takes.distinct + ' takes, ' + out.takes.repeats + ' repeats');
  S.ok('a sixty-sound barrage is held to the voice cap', out.live <= 24 && out.perName <= 4,
       out.live + ' voices, at most ' + out.perName + ' of one effect');
  S.ok('...and a chime still gets through it', out.chime, '');
  S.ok('...and the speakers do not clip, though the mix before the compressor would', out.barrage.post < 1 && out.barrage.pre > out.barrage.post,
       'peak ' + out.barrage.pre.toFixed(2) + ' into the compressor, ' + out.barrage.post.toFixed(2) + ' out of it');
  S.ok('thirty shots build one buffer source each and not one oscillator', out.live30.osc === 0 && out.live30.src === out.live30.played,
       out.live30.src + ' sources, ' + out.live30.osc + ' oscillators');
  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
