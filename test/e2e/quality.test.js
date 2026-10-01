/* WHAT A PHONE IS ASKED TO DRAW - render3d/quality3d.js, and the GFX readout (ui/gfxstat.js).

   This harness cannot time a phone: its GPU is a software rasteriser. So nothing here is a frame
   rate. What is graded is what decides one on a real device and can be counted anywhere:

     NO ROUND TRIPS   a steady frame, with things burning, asks the GPU nothing it must wait for
                      (checkFramebufferStatus was asked every frame the bloom ran)
     THE TIERS        each one really leaves passes out - counted as draws and framebuffers
                      bound, not as a picture - and caps the buffer and the meshes as it says
     AUTO             steps down while frames are slow, KEEPS a step only when it paid, undoes
                      it and holds when it did not (a phone capped at 30 by its own power saving),
                      and steps back up when there is room - fed frame times of its own, since
                      this machine's would take it straight to the floor
     THE CONTROL      the GFX button cycles AUTO, HIGH, MEDIUM, LOW and the readout says where a
                      frame went */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('quality');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 900, height: 640, dpr: 3, quality: 'auto' });
  await g.start(7, 20, { freeze: true, mode3d: true });
  var P = g.page;
  var on = await P.evaluate(function () { return !!(window._R3D && window._R3D.on); });
  S.ok('the 3D mode is available to check', on, on ? 'on' : 'no WebGL');
  if (!on) { await g.close(); await browser.close(); return require('../lib/report.js')(S); }

  var out = await P.evaluate(function () {
    var R = _rtsR, G = window._rtsG, R3 = window._R3D, gl = R3.gl, o = {};
    for (var i = 0; i < RTS_N * RTS_N; i++) { G.mapped[i] = 1; G.vis[i] = 1; } G.visDirty = 1;
    var yd = G.ents.filter(function (e) { return e.side === 'player' && e.type === 'struct' && !e.dead; })[0] || G.ents[0];
    R.focus.x = yd.x; R.focus.z = yd.z; R.zi = 2; _rtsApplyCam(); _rtsClampFocus();
    /* things burning, so the bloom runs every frame */
    function burn() { G.fx.length = 0; for (var k = 0; k < 4; k++) G.fx.push({ kind: 'boom', x: yd.x + k * 8 - 12, y: 1, z: yd.z + 10, t: 0.1, big: 1, loops: 1 }); }
    /* the calls that make the page wait on the GPU process, counted over a stretch of frames */
    var SYNC = ['checkFramebufferStatus', 'getError', 'readPixels', 'finish', 'getParameter', 'getProgramParameter',
                'getShaderParameter', 'getBufferSubData', 'clientWaitSync', 'getQueryParameter', 'getTexParameter'];
    var DRAW = ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced'];
    var n = {}, fbos = [], real = {};
    SYNC.concat(DRAW, ['bindFramebuffer']).forEach(function (k) {
      if (typeof gl[k] !== 'function') return;
      real[k] = gl[k];
      gl[k] = function () { n[k] = (n[k] || 0) + 1; if (k === 'bindFramebuffer') fbos.push(arguments[1]); return real[k].apply(gl, arguments); };
    });
    /* the switches that are not passes of their own: what the frame handed the shaders */
    var sil = 0, realSil = window._r3dSilPass, heatOn = null, realHeat = window._r3dHeatSet;
    window._r3dSilPass = function () { sil++; return realSil.apply(this, arguments); };
    window._r3dHeatSet = function (gl2, R, P2, on) { heatOn = !!on; return realHeat.apply(this, arguments); };
    function cloud() { var v = gl.getUniform(R3.meshP, gl.getUniformLocation(R3.meshP, 'uCloud')); return v ? v[2] : null; }
    function frames(k) { n = {}; fbos = []; for (var f = 0; f < k; f++) { burn(); G.t = 50 + f * 0.05; _rtsRFrame(1 / 20); } }
    function sum(list) { return list.reduce(function (a, k) { return a + (n[k] || 0); }, 0); }

    _r3dQualitySetWant('high');
    frames(3);                                     /* warm: first sight builds meshes and targets */
    frames(12);
    o.bloomRan = !!R3.bloomOn;
    o.sync = {}; SYNC.forEach(function (k) { if (n[k]) o.sync[k] = n[k]; });
    o.tiers = {};
    ['high', 'medium', 'low'].forEach(function (w) {
      _r3dQualitySetWant(w);
      frames(3); frames(4);
      var sl = sil; sil = 0; heatOn = null; frames(1);
      o.tiers[w + 'X'] = { sil: sil, heat: heatOn, cloud: cloud(), lights: (R3.plList || []).length };
      o.tiers[w] = { draws: sum(DRAW) / 4, shadowFbo: fbos.indexOf(R3.shadowFbo) >= 0, sceneFbo: fbos.indexOf(R3.sceneFbo) >= 0,
                     aoFbo: fbos.indexOf(R3.aoFbo) >= 0, bloomFbo: fbos.indexOf(R3.bloomFbo) >= 0,
                     scale: R3.scale, dpr: R.dpr, detail: _r3dDetailLevel(), name: R3.q.name };
    });
    /* the picture is still a picture at LOW */
    var CW = R3.cv.width, CH = R3.cv.height, b = new Uint8Array(CW * CH * 4);
    real.readPixels.call(gl, 0, 0, CW, CH, gl.RGBA, gl.UNSIGNED_BYTE, b);
    var tones = {}; for (i = 0; i < b.length; i += 4 * 97) tones[(b[i] >> 4) + ',' + (b[i + 1] >> 4) + ',' + (b[i + 2] >> 4)] = 1;
    o.lowTones = Object.keys(tones).length;
    Object.keys(real).forEach(function (k) { gl[k] = real[k]; });
    window._r3dSilPass = realSil; window._r3dHeatSet = realHeat;
    _r3dQualitySetWant('high');
    return o;
  });

  S.ok('the bloom runs in the frames measured', out.bloomRan, String(out.bloomRan));
  S.ok('a steady frame, things burning, makes no call the page must wait on the GPU for', Object.keys(out.sync).length === 0,
       JSON.stringify(out.sync) + ' over 12 frames');
  var T = out.tiers;
  S.ok('HIGH draws everything: shadows, the scene buffer, occlusion, bloom', T.high.shadowFbo && T.high.sceneFbo && T.high.aoFbo && T.high.bloomFbo,
       JSON.stringify(T.high));
  S.ok('MEDIUM leaves the occlusion pass out and keeps the rest', T.medium.shadowFbo && T.medium.sceneFbo && !T.medium.aoFbo && T.medium.bloomFbo,
       JSON.stringify(T.medium));
  S.ok('LOW leaves out the shadow pass and the whole post stack', !T.low.shadowFbo && !T.low.sceneFbo && !T.low.aoFbo && !T.low.bloomFbo,
       JSON.stringify(T.low));
  S.ok('...and each tier draws less than the one above it', T.low.draws < T.medium.draws && T.medium.draws < T.high.draws,
       T.high.draws + ' / ' + T.medium.draws + ' / ' + T.low.draws + ' draws a frame');
  S.ok('the buffer\'s scale on a dpr-3 screen: native, then 2, then 1.5', T.high.dpr === 3 && T.high.scale === 3 && T.medium.scale === 2 && T.low.scale === 1.5,
       T.high.scale + ' / ' + T.medium.scale + ' / ' + T.low.scale);
  var X = { h: T.highX, m: T.mediumX, l: T.lowX };
  S.ok('HIGH hands the shaders heat haze, cloud shade and firelight, and draws the silhouettes',
       X.h.heat === true && X.h.cloud > 0 && X.h.lights > 0 && X.h.sil === 1, JSON.stringify(X.h));
  S.ok('MEDIUM takes the heat haze and the cloud shade out', X.m.heat === false && X.m.cloud === 0 && X.m.lights > 0 && X.m.sil === 1, JSON.stringify(X.m));
  S.ok('LOW takes the firelight and the silhouettes out too', X.l.lights === 0 && X.l.sil === 0 && X.l.cloud === 0, JSON.stringify(X.l));
  S.ok('LOW builds the coarser meshes', T.low.detail === 1 && T.high.detail > 1, T.high.detail + ' -> ' + T.low.detail);
  S.ok('...and LOW is still a picture', out.lowTones > 20, out.lowTones + ' tones');

  /* ---------------- WHAT A FRAME UPLOADS ---------------- */
  var up = await P.evaluate(function () {
    var R = _rtsR, G = window._rtsG, R3 = window._R3D, gl = R3.gl, o = {}, bytes = 0, ground = 0, ore = 0, real = {};
    _r3dQualitySetWant('high');
    ['bufferData', 'bufferSubData', 'texImage2D', 'texSubImage2D'].forEach(function (k) {
      real[k] = gl[k];
      gl[k] = function () {
        var a = arguments, n = 0;
        for (var j = 0; j < a.length; j++) if (a[j] && a[j].byteLength !== undefined) n = a[j].byteLength;
        if (!n && k.indexOf('tex') === 0) { var el = a[a.length - 1]; if (el && el.width) n = el.width * el.height * 4; }
        if (a[a.length - 1] === R3.oreCv) ore++;
        bytes += n; return real[k].apply(gl, arguments);
      };
    });
    var gm = window._r3dGroundMesh, calls = 0, rebuilt = 0;
    /* a rebuild is the patch's key changing; counted by watching it */
    function frames(k) { for (var f = 0; f < k; f++) { var was = R3.groundKey; _rtsTick(1 / 30); _rtsRFrame(1 / 30); if (R3.groundKey !== was) rebuilt++; } }
    frames(3); bytes = 0; rebuilt = 0; ore = 0;
    var t0 = G.t;
    frames(15);
    o.kbFrame = +(bytes / 15 / 1024).toFixed(1); o.stillRebuilt = rebuilt; o.orePerSec = +(ore / (G.t - t0)).toFixed(2);
    rebuilt = 0;
    R.focus.x += RTS_TILE * 1.5; _rtsClampFocus();
    frames(1);
    o.panRebuilt = rebuilt;
    Object.keys(real).forEach(function (k) { gl[k] = real[k]; });
    return o;
  });
  S.ok('with the camera still, the ground is not rebuilt', up.stillRebuilt === 0, up.stillRebuilt + ' rebuilds over 15 frames');
  S.ok('...and a frame uploads little: under 250 KB (the ground alone was 740)', up.kbFrame < 250, up.kbFrame + ' KB a frame');
  S.ok('...the ore field at most four times a second, however busy the harvesters', up.orePerSec <= 4.01, up.orePerSec + ' a second');
  S.ok('moving the camera a cell and a half does rebuild the ground', up.panRebuilt === 1, up.panRebuilt + ' rebuild');

  /* ---------------- AUTO, fed frame times ---------------- */
  var auto = await P.evaluate(function () {
    var R3 = window._R3D, o = {};
    function run(ms, t0, dur) { for (var t = t0; t < t0 + dur; t += ms) _r3dQualityFeed(ms, t); return t0 + dur; }
    function fresh() { _r3dQualitySetWant('auto'); R3.qAuto = null; _r3dQualityApply(0); }
    /* a device that is simply slow: every step pays */
    fresh();
    var t = run(40, 0, 4000 + 2600);               /* settle, then a slow window: a step down, on trial */
    o.slowStep = R3.q.name;
    t = run(30, t, 2600);                          /* 30 ms: under 85% of 40 - kept */
    o.slowKept = R3.q.name;
    t = run(30, t, 2600);                          /* still slow: another step, on trial */
    o.slowStep2 = R3.q.name;
    t = run(29.9, t, 2600);                        /* ...which bought nothing: undone, and AUTO holds */
    o.slowUndone = R3.q.name; o.held = R3.qAuto.locked;
    t = run(45, t, 8000);
    o.slowHeld = R3.q.name;
    /* a phone held at 30 by its own power saving: the step buys nothing and is undone */
    fresh();
    t = run(33.3, 0, 4000 + 2600);
    o.capStep = R3.q.name;
    t = run(33.3, t, 2600);
    o.capBack = R3.q.name; o.capHeld = R3.qAuto.locked;
    /* room to spare at LOW: back up, a step at a time */
    fresh(); _r3dQualityApply(2);
    t = run(12, 0, 4000 + 2600 * 3);
    o.upStep = R3.q.name;
    t = run(12, t, 2600);
    o.upKept = R3.q.name;
    /* pinned, AUTO does nothing */
    _r3dQualitySetWant('high'); R3.qAuto = null;
    var seen = {};
    for (var tt = 0; tt < 20000; tt += 80) { _r3dQualityFeed(80, tt); seen[R3.q.name] = 1; }
    o.pinned = Object.keys(seen).join(',') + (R3.qAuto ? ' (judged)' : '');
    return o;
  });
  S.eq('a slow device: AUTO steps down', auto.slowStep, 'MEDIUM');
  S.eq('...keeps the step when the frame got faster', auto.slowKept, 'MEDIUM');
  S.eq('...tries another', auto.slowStep2, 'LOW');
  S.ok('...undoes it when it bought nothing, and holds', auto.slowUndone === 'MEDIUM' && auto.held && auto.slowHeld === 'MEDIUM',
       auto.slowUndone + ', held ' + auto.held + ', later ' + auto.slowHeld);
  S.ok('a phone capped at 30 fps: the step is tried, bought nothing, and is undone', auto.capStep === 'MEDIUM' && auto.capBack === 'HIGH' && auto.capHeld,
       auto.capStep + ' -> ' + auto.capBack + ', held ' + auto.capHeld);
  S.ok('with room to spare AUTO steps back up, and keeps it', auto.upStep === 'MEDIUM' && auto.upKept === 'MEDIUM', auto.upStep + ', ' + auto.upKept);
  S.eq('pinned, AUTO never touches the tier, not even for a trial', auto.pinned, 'HIGH');

  /* ---------------- THE CONTROL AND THE READOUT ---------------- */
  var ui = await P.evaluate(function () {
    var U = window._rtsUI, o = { labels: [] };
    _r3dQualitySetWant('auto'); _rtsGfxSync();
    var b = document.getElementById('rtsGfxBtn');
    if (!b) { _rtsGfxInit(); b = document.getElementById('rtsGfxBtn'); }
    o.labels.push(b.textContent);
    for (var i = 0; i < 4; i++) { b.click(); o.labels.push(b.textContent + '/' + window._R3D.q.name + '/' + (localStorage.getItem('rtsGfxQ') || '-')); }
    /* a few frames of the real loop, for the breakdown */
    U.dead = false; U.last = Date.now(); U.pl = 0; _rtsLoop(0);
    return o;
  });
  await P.waitForFunction(function () { var p = window._rtsUI.prof, q = window._R3D.prof; return p && p.draw > 0 && q && q.shadow > 0 && q.post > 0; }, null, { timeout: 60000 }).catch(function () {});
  var readout = await P.evaluate(function () {
    window._RTS_GFX.on = true; window._RTS_GFX.paint = 0; window._RTS_GFX.last = 0; window._RTS_GFX.t = [16, 16, 16];
    _rtsGfxFrame();
    var el = document.getElementById('rtsGfxOut'), U = window._rtsUI;
    U.dead = true; try { cancelAnimationFrame(U.raf); } catch (e) {}
    return el ? el.textContent : '';
  });
  S.eq('the GFX button cycles AUTO, HIGH, MEDIUM, LOW and back', ui.labels.join(' | '),
       'GFX AUTO | GFX HIGH/HIGH/high | GFX MEDIUM/MEDIUM/medium | GFX LOW/LOW/low | GFX AUTO/HIGH/-');
  S.ok('the readout says where a frame went', /sim \d/.test(readout) && /draw \d/.test(readout) && /shadow \d/.test(readout) &&
       /post \d/.test(readout) && /wait \d/.test(readout) && /HIGH auto/.test(readout), readout.replace(/\n/g, ' // '));
  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');
  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
