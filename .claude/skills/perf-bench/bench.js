/* A heavy battle, measured: JS time per frame (simulation and render), the render's phases, and the
   GPU's workload - draws and triangles by phase - plus a CPU profile's top functions.

     node bench.js [--frames=40] [--units=60] [--zoom=3] [--profile] [--label=before]

   SwiftShader renders this in seconds a frame, so the GPU's TIME here means nothing; its WORK -
   draws and triangles - transfers to any GPU, and the JS milliseconds are real. The battle: two
   armies of --units each, mixed arms, a third of them hurt, six aircraft, rain, the whole map
   revealed, the camera --zoom rungs out from the closest. Compare a run before a change with one
   after, same arguments. */

var path = require('path');
var ROOT = path.resolve(__dirname, '../../..');
var { chromium } = require('playwright');
var { openPage } = require(path.join(ROOT, 'test/lib/game.js'));
var A = {};
process.argv.slice(2).forEach(function (a) { var m = /^--([\w]+)(?:=(.*))?$/.exec(a); if (m) A[m[1]] = m[2] == null ? true : m[2]; });
var FR = +A.frames || 40, UNITS = +A.units || 60, ZOOM = +A.zoom || 3;

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 1280, height: 800, dpr: 1 });
  await g.start(7, 1);
  var cdp = A.profile ? await g.page.context().newCDPSession(g.page) : null;
  await g.page.evaluate(function (a) {
    var R = _rtsR, G = window._rtsG, i;
    if (window._rtsUI) window._rtsUI.dead = true;
    for (i = 0; i < RTS_N * RTS_N; i++) { G.mapped[i] = 1; G.vis[i] = 1; }
    G.visDirty = 1;
    window.RTS_SKY_FORCE = 'rain';
    var yd = _rtsHas('player', 'yard'), cx = yd.x + 30, cz = yd.z + 30;
    var mix = ['tank', 'tank', 'light', 'heavy', 'rifle', 'rifle', 'rocket', 'apc', 'arty', 'buggy'];
    for (var s = 0; s < 2; s++) for (var k = 0; k < a.units; k++) {
      var u = _rtsSpawnUnit(s ? 'enemy' : 'player', mix[k % mix.length], cx + (s ? 14 : -14) + (k % 8) * 3.2 - 11, cz + Math.floor(k / 8) * 3.2 - 12);
      if (k % 3 === 0) u.hp = u.maxHp * (0.15 + 0.3 * ((k / 3) % 2));
    }
    for (var q = 0; q < 6; q++) { var h = _rtsSpawnUnit(q % 2 ? 'enemy' : 'player', q < 4 ? 'heli' : 'mig', cx + q * 4, cz - 20); h.alt = 14; }
    R.focus.x = cx; R.focus.z = cz; R.zi = Math.max(0, RTS_ZOOMS.length - a.zoom); _rtsApplyCam();
    for (i = 0; i < 60; i++) { _rtsTick(1 / 30); _rtsRFrame(1 / 30); }     /* let the fight start */
  }, { units: UNITS, zoom: ZOOM });
  if (cdp) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); await cdp.send('Profiler.start'); }
  var r = await g.page.evaluate(function (FR) {
    var R3 = window._R3D, gl = R3.gl, pc = performance, sim = 0, draw = 0, px = new Uint8Array(4), phase = 'pre', st = {};
    var mk = window._r3dMark;
    window._r3dMark = function (R3x, k) { mk(R3x, k); phase = k || 'start'; };
    function rec(tris) { var e = st[phase] || (st[phase] = { draws: 0, tris: 0 }); e.draws++; e.tris += tris; }
    var da = gl.drawArrays, de = gl.drawElements;
    gl.drawArrays = function (m, f, c) { rec(m === gl.TRIANGLES ? c / 3 : 0); return da.apply(gl, arguments); };
    gl.drawElements = function (m, c) { rec(c / 3); return de.apply(gl, arguments); };
    if (R3.inst && R3.inst.on) { var idraw = R3.inst.draw; R3.inst.draw = function (m, f, c, n) { rec(c / 3 * n); return idraw(m, f, c, n); }; }
    R3.prof = {};
    for (var f = 0; f < FR; f++) {
      var t0 = pc.now(); _rtsTick(1 / 30);
      var t1 = pc.now(); _rtsRFrame(1 / 30);
      var t2 = pc.now(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);    /* drain the GPU */
      sim += t1 - t0; draw += t2 - t1;
    }
    var out = {};
    Object.keys(st).forEach(function (k) { out[k] = { draws: Math.round(st[k].draws / FR), tris: Math.round(st[k].tris / FR) }; });
    var prof = {}; Object.keys(R3.prof || {}).forEach(function (k) { prof[k] = +(R3.prof[k]).toFixed(2); });
    return { sim: sim / FR, draw: draw / FR, phases: out, prof: prof, ents: window._rtsG.ents.filter(function (e) { return !e.dead; }).length };
  }, FR);
  console.log((A.label ? A.label + ': ' : '') + r.ents + ' live entities, ' + FR + ' frames');
  console.log('per frame: simulation ' + r.sim.toFixed(1) + ' ms, render JS ' + r.draw.toFixed(1) + ' ms');
  console.log('render JS by phase (ms): ' + JSON.stringify(r.prof));
  var tot = { draws: 0, tris: 0 };
  /* a mark ends a phase (render3d/scene3d.js), so what is drawn after one belongs to the next */
  var NEXT = { pre: 'before the frame', start: 'setup', setup: 'shadow pass', shadow: 'world', world: 'units', units: 'effects', fx: 'post', post: 'present' };
  Object.keys(r.phases).forEach(function (k) { var p = r.phases[k]; tot.draws += p.draws; tot.tris += p.tris; console.log('  ' + (NEXT[k] || k).padEnd(16) + String(p.draws).padStart(6) + ' draws ' + String(p.tris).padStart(10) + ' triangles'); });
  console.log('  ' + 'total'.padEnd(16) + String(tot.draws).padStart(6) + ' draws ' + String(tot.tris).padStart(10) + ' triangles a frame');
  if (cdp) {
    var prof = (await cdp.send('Profiler.stop')).profile, self = {}, byId = {}, t = 0;
    prof.nodes.forEach(function (n) { byId[n.id] = n; });
    prof.samples.forEach(function (id, i) { var k = byId[id].callFrame.functionName || '(anon)'; self[k] = (self[k] || 0) + (prof.timeDeltas[i] || 0); t += prof.timeDeltas[i] || 0; });
    console.log('top functions by self time (readPixels is the GPU wait):');
    Object.keys(self).sort(function (a, b) { return self[b] - self[a]; }).slice(0, 15).forEach(function (k) { console.log('  ' + (self[k] / 1000).toFixed(0).padStart(6) + ' ms ' + (100 * self[k] / t).toFixed(1).padStart(5) + '%  ' + k); });
  }
  if (g.errors.length) console.log('page errors: ' + g.errors.slice(0, 3).join(' | '));
  await g.close(); await browser.close();
})().catch(function (e) { console.error(e); process.exit(1); });
