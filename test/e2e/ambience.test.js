/* THE WORLD'S OWN SOUND, heard - rts.ambience.js through the real WebAudio graph, measured as
   signal off the master bus the way e2e/audio measures the effects (a ScriptProcessor tap, peak
   and RMS over a window), with the music out of it so the bed is all there is:

     QUIET      a clear day with nothing moving is silent
     RAIN       rain is heard, and so is a night's insects
     ENGINES    tanks on the move in view are heard, and stop being heard when they stop
     THUNDER    a strike in the rain is a loud crack and roll over the hiss
     DISTANCE   a cannon just off the screen is heard, quieter than one on it, and one well beyond
                earshot is not
     ECHO       at night a shot rings on after it is over */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('ambience');

function installProbe() {
  var A = _rtsAudioInit();
  if (!A) return false;
  var ctx = A.ctx, tap = ctx.createScriptProcessor(4096, 1, 1), sink = ctx.createGain();
  sink.gain.value = 0;
  var M = { peak: 0, energy: 0, frames: 0, trail: [] };
  tap.onaudioprocess = function (e) {
    var d = e.inputBuffer.getChannelData(0), en = 0;
    for (var i = 0; i < d.length; i++) { var v = d[i] < 0 ? -d[i] : d[i]; if (v > M.peak) M.peak = v; en += d[i] * d[i]; }
    M.energy += en; M.frames += d.length; M.trail.push(Math.sqrt(en / d.length));
  };
  A.master.connect(tap); tap.connect(sink); sink.connect(ctx.destination);
  A.mus.gain.value = 0;                                   /* the score is not under test */
  window._AM = M;
  window._amListen = function (ms, every) {
    M.peak = 0; M.energy = 0; M.frames = 0; M.trail = [];
    return new Promise(function (res) {
      var iv = setInterval(function () { try { every && every(); } catch (e) {} }, 50);
      setTimeout(function () { clearInterval(iv); res({ peak: +M.peak.toFixed(4), rms: M.frames ? +Math.sqrt(M.energy / M.frames).toFixed(4) : 0, trail: M.trail.map(function (v) { return +v.toFixed(4); }) }); }, ms);
    });
  };
  return true;
}

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 1200, height: 800 });
  await g.start(7, 1);
  var up = await g.page.evaluate(function (src) { return eval('(' + src + ')()'); }, installProbe.toString());
  S.ok('WebAudio is available and the master bus can be tapped', up === true, String(up));
  if (up !== true) { await g.close(); await browser.close(); return require('../lib/report.js')(S); }

  var out = await g.page.evaluate(async function () {
    var o = {}, G = window._rtsG, R = _rtsR, A = _rtsA;
    if (window._rtsUI) window._rtsUI.dead = true;                 /* the loop: these ticks are driven by hand */
    G.ents.forEach(function (e) { if (e.type === 'unit') e.path = null; });
    function tick() { G.t += 0.05; _rtsAmbTick(0.25); }
    function sky(s) { window.RTS_SKY_FORCE = s; }
    /* until the room is quiet - every shot here has a tail and a room now - or eight seconds */
    var settle = function () {
      var t0 = Date.now();
      return new Promise(function (r) {
        (function again() { window._amListen(150).then(function (m) { if (m.peak < 0.004 || Date.now() - t0 > 8000) r(); else again(); }); })();
      });
    };

    /* the bed's loops render out of idle time (audio/loops.js): all of them, before anything is measured */
    tick();
    var t0 = Date.now();
    while (A.amb.q.length && Date.now() - t0 < 15000) await settle();
    o.loops = { left: A.amb.q.length, started: Object.keys(A.amb.v).filter(function (k) { return A.amb.v[k].src; }).length };
    /* the weather heard over open ground: the middle of the map, away from either base's hum */
    R.focus.x = _rtsWX(RTS_N / 2); R.focus.z = _rtsWX(RTS_N / 2); _rtsApplyCam();
    o.structsInView = G.ents.filter(function (e) { return !e.dead && e.type === 'struct' && _rtsAudible(e.x, e.z); }).length;
    sky('day'); await window._amListen(900, tick);
    o.day = await window._amListen(700, tick);
    sky('rain'); await window._amListen(1200, tick);
    o.rain = await window._amListen(700, tick);
    sky('night'); await window._amListen(1800, tick);
    o.night = await window._amListen(700, tick);

    /* ENGINES */
    sky('day'); await window._amListen(1500, tick);
    var tanks = [];
    for (var i = 0; i < 4; i++) { var u = _rtsSpawnUnit('player', 'tank', R.focus.x + i * 4, R.focus.z); u.path = [{ x: 0, z: 0 }]; tanks.push(u); }
    await window._amListen(900, tick);
    o.engines = await window._amListen(700, tick);
    tanks.forEach(function (u) { u.path = null; });
    await window._amListen(1500, tick);
    o.parked = await window._amListen(700, tick);
    tanks.forEach(function (u) { u.dead = true; });

    /* THUNDER: the rain, then the game's clock moved onto the first strike */
    sky('rain'); await window._amListen(1200, tick);
    o.hiss = await window._amListen(600, tick);
    G.t = RTS_THUNDER_FIRST - 0.01;
    o.thunder = await window._amListen(900, function () { G.t += 0.02; _rtsAmbTick(0.02); });
    sky('day'); await window._amListen(1500, tick);

    /* DISTANCE */
    var vs = _rtsViewSpan(), wv = vs.cw || vs.w;
    function shot(dx) { return window._amListen(700, null).then(function (m) { return m; }); }
    var near = window._amListen(700); _rtsSfx('cannon', R.focus.x, R.focus.z); o.near = await near;
    await settle();
    var mid = window._amListen(700); _rtsSfx('cannon', R.focus.x + wv * 1.3, R.focus.z); o.mid = await mid;
    await settle();
    var gone = window._amListen(700); _rtsSfx('cannon', R.focus.x + wv * 5, R.focus.z); o.gone = await gone;
    await settle();

    /* ECHO: the same shot by day and at night, and how long it rings */
    function tail(m) { var t = m.trail, peak = Math.max.apply(null, t), n = 0; for (var k = 0; k < t.length; k++) if (t[k] > peak * 0.05) n = k; return n; }
    await settle();
    var dy = window._amListen(3200, tick); _rtsSfx('cannon', R.focus.x, R.focus.z); var dyM = await dy;
    sky('night'); await window._amListen(1800, tick); await settle();
    A.amb.v.crickets.g.gain.value = 0; A.amb.v.crickets.g.gain.cancelScheduledValues(A.ctx.currentTime);   /* the crickets would drown the measure */
    var nt = window._amListen(3200); _rtsSfx('cannon', R.focus.x, R.focus.z); var ntM = await nt;
    o.echo = [tail(ntM), tail(dyM)];
    window.RTS_SKY_FORCE = undefined;
    return o;
  });

  S.ok('the bed\'s loops are all rendered and running', out.loops.left === 0 && out.loops.started === 13, JSON.stringify(out.loops));
  /* not silent any more over open ground: the odd bird */
  S.eq('the weather is heard over open ground, no building in earshot', out.structsInView, 0);
  S.ok('a clear day with nothing moving is quiet', out.day.rms < 0.004, 'rms ' + out.day.rms);
  S.ok('rain is heard', out.rain.rms > 0.01 && out.rain.rms > out.day.rms * 3, 'rms ' + out.rain.rms + ' against ' + out.day.rms);
  S.ok('...and so is the night', out.night.rms > out.day.rms * 2 && out.night.rms > 0.004, 'rms ' + out.night.rms + ' against ' + out.day.rms);
  S.ok('tanks on the move in view are heard', out.engines.rms > 0.006 && out.engines.rms > out.day.rms * 3, 'rms ' + out.engines.rms);
  S.ok('...and stop being heard when they stop', out.parked.rms < out.engines.rms * 0.3, 'rms ' + out.parked.rms);
  S.ok('a strike in the rain is a crack and a roll over the hiss', out.thunder.peak > out.hiss.peak * 2.5 && out.thunder.rms > out.hiss.rms * 1.5,
       'peak ' + out.thunder.peak + ' against ' + out.hiss.peak + ', rms ' + out.thunder.rms + ' against ' + out.hiss.rms);
  S.ok('a cannon just off the screen is heard', out.mid.peak > 0.01, 'peak ' + out.mid.peak);
  S.ok('...quieter than one on it', out.mid.peak < out.near.peak * 0.7, out.mid.peak + ' against ' + out.near.peak);
  S.ok('...and one far beyond earshot is not', out.gone.peak < out.mid.peak * 0.1, 'peak ' + out.gone.peak);
  S.ok('at night a shot rings on after it is over', out.echo[0] > out.echo[1] + 1, out.echo[0] + ' blocks of tail by night, ' + out.echo[1] + ' by day');
  S.ok('no page errors', g.errors.length === 0, g.errors.join(' | ') || 'none');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
