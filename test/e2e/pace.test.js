/* A STEADY FRAME IN A HEAVY BATTLE, in the page - render3d/pace3d.js and upload3d.js. This
   harness cannot time a GPU, so what is graded is what decides a frame on a real one and can be
   counted anywhere:

     THE TERRAIN    a battle stamping craters and corpses into the ground sends no terrain at all
                    while the materials draw (it used to send the whole 36 MB canvas for each);
                    on the baked ground a scorch reaches the picture the frame after it is
                    stamped (the 2D pass stamps after the GL frame), as a rectangle the size of
                    the stamp
     THE UPLOADS    a frame of a heavy battle sends its effects as four corners a quad, and its
                    instances in a handful of uploads, not one a mesh - and draws them all
     THE PIXELS     in AUTO, slow frames waiting on the GPU shrink the buffer a step, and the
                    frame still draws; quick ones bring it back to full */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('pace');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 1000, height: 700, dpr: 1 });
  await g.start(7, 1);

  var out = await g.page.evaluate(function () {
    var o = {}, R = _rtsR, G = window._rtsG, i;
    for (i = 0; i < RTS_N * RTS_N; i++) { G.mapped[i] = 1; G.vis[i] = 1; }
    G.visDirty = 1;
    var R3 = window._R3D;
    o.on = !!(R3 && R3.on);
    if (!o.on) return o;
    if (window._rtsUI) window._rtsUI.dead = true;
    var gl = R3.gl, CW = R3.cv.width, CH = R3.cv.height;
    /* every upload, counted */
    var up = { tex: 0, texB: 0, sub: 0, subB: 0, buf: 0, bufB: 0 }, ti = gl.texImage2D, ts = gl.texSubImage2D, bd = gl.bufferData;
    gl.texImage2D = function () { var a = arguments, src = a[a.length - 1]; up.tex++; up.texB += src && src.width ? src.width * src.height * 4 : (a[3] * a[4] * 4 || 0); return ti.apply(gl, a); };
    gl.texSubImage2D = function () { up.sub++; up.subB += arguments[4] * arguments[5] * 4; return ts.apply(gl, arguments); };
    gl.bufferData = function () { up.buf++; up.bufB += arguments[1] && arguments[1].byteLength || 0; return bd.apply(gl, arguments); };
    function reset() { for (var k in up) up[k] = 0; }
    var yd = _rtsHas('player', 'yard'), cx = yd.x + 30, cz = yd.z + 30;
    R.focus.x = cx; R.focus.z = cz; R.zi = RTS_ZOOMS.length - 3; _rtsApplyCam();
    var mix = ['tank', 'light', 'heavy', 'rifle', 'rocket', 'apc', 'arty', 'buggy'];
    for (var s = 0; s < 2; s++) for (var k = 0; k < 40; k++) {
      var u = _rtsSpawnUnit(s ? 'enemy' : 'player', mix[k % mix.length], cx + (s ? 12 : -12) + (k % 8) * 3 - 10, cz + Math.floor(k / 8) * 3 - 8);
      if (k % 3 === 0) u.hp = u.maxHp * 0.3;
    }
    for (i = 0; i < 10; i++) { _rtsTick(1 / 30); _rtsRFrame(1 / 30); }

    /* THE TERRAIN, while the materials draw: a battle's worth of stamps */
    reset();
    for (i = 0; i < 8; i++) { G.corpses.push({ x: cx + i * 2, z: cz, v: i }); _rtsTick(1 / 30); _rtsRFrame(1 / 30); }
    o.matOn = R3.matOn; o.matTerrain = up.texB > 3000 * 3000 ? up.tex : 0;
    o.frame = { fxQ: R3.fxV ? R3.fxV.M.n + R3.fxV.L.n : 0, buf: up.buf / 8, bufB: up.bufB / 8, fxDrawn: R3.fxDrawn };
    /* ...and on the baked ground: a scorch, the frame it is stamped */
    window.RTS_GROUND_LEGACY = true;
    _rtsRFrame(0);
    var tx = _rtsTX(cx), tz = _rtsTX(cz) + 2, ni = _rtsIdx(tx, tz);
    function shot() { _rtsRFrame(0); var b = new Uint8Array(CW * CH * 4); gl.readPixels(0, 0, CW, CH, gl.RGBA, gl.UNSIGNED_BYTE, b); return b; }
    var A = shot();
    reset();
    G.scorch[ni] = 8 | 1; G.newScorch.push(ni);
    shot();                                         /* stamped after the GL frame is drawn... */
    var B = shot();                                 /* ...and on the ground the next */
    var p = _rtsGroundToScreen(_rtsWX(tx), _rtsWX(tz)), sc = CW / R3.cv.clientWidth, n = 0;
    for (var yy = -10; yy <= 10; yy++) for (var xx = -10; xx <= 10; xx++) {
      var px = Math.round(p.x * sc) + xx, py = Math.round(p.y * sc) + yy;
      if (px < 0 || py < 0 || px >= CW || py >= CH) continue;
      var q = ((CH - 1 - py) * CW + px) * 4;
      if (Math.abs(A[q] - B[q]) + Math.abs(A[q + 1] - B[q + 1]) + Math.abs(A[q + 2] - B[q + 2]) > 24) n++;
    }
    o.scorch = { changed: n, fullTex: up.texB > 3000 * 3000 ? up.tex : 0, sub: up.sub, subB: up.subB };
    window.RTS_GROUND_LEGACY = false;

    /* THE PIXELS, in AUTO, fed frame times of their own */
    try { window.localStorage.removeItem('rtsGfxQ'); } catch (e) {}
    R3.dynA = null; R3.dyn = 1; _r3dResize();
    var w0 = R3.cv.width, t = 0;
    for (; t < R3D_Q_SETTLE + R3D_DYN_WINDOW * 1.5; t += 16) _r3dDynFeed(t < R3D_Q_SETTLE ? 16 : 40, 6, t);
    _rtsRFrame(0);
    o.dyn = { w0: w0, w1: R3.cv.width, dyn: R3.dyn, err: gl.getError() };
    for (var t2 = t; t2 < t + R3D_DYN_WINDOW * 8; t2 += 10) _r3dDynFeed(10, 4, t2);
    _rtsRFrame(0);
    o.dyn.back = R3.cv.width; o.dyn.dynBack = R3.dyn;
    try { window.localStorage.setItem('rtsGfxQ', 'high'); } catch (e) {}
    R3.dyn = 1; _r3dResize();
    gl.texImage2D = ti; gl.texSubImage2D = ts; gl.bufferData = bd;
    o.glErr = gl.getError();
    return o;
  });

  S.ok('the 3D mode is available to check', out.on, out.on ? 'on' : 'no WebGL');
  if (!out.on) { await g.close(); await browser.close(); return require('../lib/report.js')(S); }
  S.ok('a battle stamping craters and corpses sends no terrain while the materials draw', out.matOn && out.matTerrain === 0, 'materials ' + out.matOn + ', ' + out.matTerrain + ' whole-canvas uploads');
  var sc = out.scorch;
  S.ok('on the baked ground a scorch reaches the picture the frame after it is stamped', sc.changed > 30, sc.changed + ' pixels');
  S.ok('...sent as a rectangle the size of the stamp, not the canvas', sc.fullTex === 0 && sc.sub >= 1 && sc.subB < 64 * 64 * 4, sc.sub + ' rectangles, ' + sc.subB + ' bytes; ' + sc.fullTex + ' whole-canvas uploads');
  var f = out.frame;
  S.ok('a frame of a heavy battle draws its effects, sending four corners a quad', f.fxQ > 100 && f.bufB < f.fxQ * 4 * 14 * 4 * 1.1 + 40000, f.fxQ + ' quads, ' + Math.round(f.bufB / 1024) + ' KB sent a frame');
  S.ok('...in a handful of uploads, not one a mesh', f.buf <= 8, f.buf + ' uploads a frame');
  S.ok('in AUTO, slow frames waiting on the GPU shrink the buffer a step', out.dyn.dyn === 0.85 && Math.abs(out.dyn.w1 - Math.round(out.dyn.w0 * 0.85)) <= 1 && out.dyn.err === 0,
       out.dyn.w0 + ' -> ' + out.dyn.w1 + ' px across');
  S.ok('...and quick ones bring it back to full', out.dyn.dynBack === 1 && out.dyn.back === out.dyn.w0, out.dyn.back + ' px');
  S.eq('no draw is refused', out.glErr, 0);
  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
