/* LESS FOR THE GPU TO DRAW, in the page - the kept world shadows (shadowcache3d.js), the plain
   models (mesh3d.js) and the camera's own cull of the entities (scene3d.js). Counted as draws and
   triangles, which decide a frame on any GPU, and checked against the picture:

     KEPT SHADOWS   the world's shadows are drawn once and not again while the window stands;
                    the picture with them kept is the picture drawn in full; a unit on the move
                    still moves its shadow; a pan past the window's step draws them again
     PLAIN MODELS   the sun's pass draws the plain models, in far fewer triangles than it did
     THE CULL       a unit off the screen is not drawn at all, and the picture is unchanged by
                    leaving it out */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('gpuwork');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 1000, height: 700, dpr: 1 });
  await g.start(7, 1);

  var out = await g.page.evaluate(function () {
    var o = {}, R = _rtsR, G = window._rtsG, i;
    for (i = 0; i < RTS_N * RTS_N; i++) { G.mapped[i] = 1; G.vis[i] = 1; }
    G.visDirty = 1;
    rts3dSet(true);
    var R3 = window._R3D;
    o.on = !!(R3 && R3.on);
    if (!o.on) return o;
    if (window._rtsUI) window._rtsUI.dead = true;
    window.RTS_POST_ON = false;
    R3.cloudAmt = 0; R3.swayAmt = 0; R3.surfAmt = 0;
    G.ents.forEach(function (e) { if (e.type === 'unit') e.path = null; });
    var gl = R3.gl, CW = R3.cv.width, CH = R3.cv.height;
    var yd = _rtsHas('player', 'yard');
    var tanks = [];
    for (i = 0; i < 10; i++) tanks.push(_rtsSpawnUnit('player', 'tank', yd.x + 8 + i * 3, yd.z + 14));
    R.focus.x = yd.x + 16; R.focus.z = yd.z + 12; R.zi = RTS_ZOOMS.length - 2; _rtsApplyCam();
    function shot() { _rtsRFrame(0); var b = new Uint8Array(CW * CH * 4); gl.readPixels(0, 0, CW, CH, gl.RGBA, gl.UNSIGNED_BYTE, b); return b; }
    function diff(A, B) { var n = 0; for (var k = 0; k < A.length; k += 4) if (Math.abs(A[k] - B[k]) + Math.abs(A[k + 1] - B[k + 1]) + Math.abs(A[k + 2] - B[k + 2]) > 12) n++; return n; }
    shot();                                          /* the first frame makes the instancing it uses */
    /* the sun's pass, counted: its triangles, between the frame's own marks */
    var phase = '', tris = {}, mk = window._r3dMark;
    window._r3dMark = function (R3x, k) { mk(R3x, k); phase = k || 'start'; };
    var da = gl.drawArrays, idraw = R3.inst && R3.inst.on ? R3.inst.draw : null;
    function add(n) { tris[phase] = (tris[phase] || 0) + n; }
    gl.drawArrays = function (m, f, c) { if (m === gl.TRIANGLES) add(c / 3); return da.apply(gl, arguments); };
    if (idraw) R3.inst.draw = function (m, f, c, n) { add(c / 3 * n); return idraw(m, f, c, n); };

    /* KEPT SHADOWS */
    o.cache = !!_r3dShadowCacheInit(R3);
    shot();
    var w0 = R3.shadowWorldDraws;
    tris = {}; var A = shot(); o.keptTris = tris.setup || 0;
    shot(); shot();
    o.redrawn = R3.shadowWorldDraws - w0;
    R3.shadowCacheOff = true; tris = {}; var F = shot(); o.fullTris = tris.setup || 0; R3.shadowCacheOff = false;
    o.same = diff(A, F);
    /* a unit on the move still moves its shadow: a step across, kept against drawn in full */
    tanks[0].x += 2.5; var K = shot(); R3.shadowCacheOff = true; var KF = shot(); R3.shadowCacheOff = false; tanks[0].x -= 2.5;
    o.moved = diff(K, A); o.movedSame = diff(K, KF);
    /* a pan past the window's step */
    var st = _r3dSunView().step;
    R.focus.x += st * 1.2; _rtsApplyCam(); var w1 = R3.shadowWorldDraws; shot(); o.panRedraw = R3.shadowWorldDraws - w1;
    R.focus.x -= st * 1.2; _rtsApplyCam(); shot();

    /* PLAIN MODELS: the sun's pass with them and without */
    var keepLod = window._r3dMesh;
    window._r3dMesh = function (kind, def, side, part, prone, pose, roll, lod) { return keepLod(kind, def, side, part, prone, pose, roll, false); };
    R3.shadowCacheOff = true; tris = {}; shot(); o.richShadow = tris.setup || 0;
    window._r3dMesh = keepLod; tris = {}; shot(); o.plainShadow = tris.setup || 0; R3.shadowCacheOff = false;

    /* THE CULL: a tank off the screen */
    var far = _rtsSpawnUnit('player', 'heavy', R.focus.x + 120, R.focus.z + 90);
    var n0 = 0; R3.instDrawn = 0; var C1 = shot(); var inst1 = R3.instDrawn;
    R3.entCullOff = true; R3.instDrawn = 0; var C0 = shot(); var inst0 = R3.instDrawn; R3.entCullOff = false;
    o.cull = { on: inst1, off: inst0, same: diff(C1, C0) };
    far.dead = true;

    gl.drawArrays = da; if (idraw) R3.inst.draw = idraw; window._r3dMark = mk;
    o.glErr = gl.getError();
    R3.cloudAmt = undefined; R3.swayAmt = undefined; R3.surfAmt = undefined;
    return o;
  });

  S.ok('the 3D mode is available to check', out.on, out.on ? 'on' : 'no WebGL');
  if (!out.on) { await g.close(); await browser.close(); return require('../lib/report.js')(S); }
  S.ok('the world\'s shadows can be kept here (WebGL2, or EXT_frag_depth)', out.cache);
  S.ok('...drawn once and not again while the window stands', out.redrawn === 0 && out.keptTris < out.fullTris * 0.6,
       out.redrawn + ' redraws over three frames; the sun\'s pass ' + Math.round(out.keptTris) + ' triangles kept, ' + Math.round(out.fullTris) + ' drawn in full');
  S.ok('...and the picture is the picture drawn in full', out.same === 0, out.same + ' pixels differ');
  S.ok('a tank on the move still moves its shadow, kept or not', out.moved > 50 && out.movedSame === 0, out.moved + ' pixels move; ' + out.movedSame + ' differ from the full draw');
  S.ok('a pan past the window\'s step draws them again', out.panRedraw === 1, out.panRedraw + ' redraws');
  S.ok('the sun\'s pass draws the plain models, in far fewer triangles', out.plainShadow < out.richShadow * 0.8,
       Math.round(out.plainShadow) + ' triangles against ' + Math.round(out.richShadow) + ' with the full models');
  S.ok('a unit off the screen is not drawn at all', out.cull.on < out.cull.off, out.cull.on + ' instances drawn, ' + out.cull.off + ' without the cull');
  S.ok('...and leaving it out changes nothing in the picture', out.cull.same === 0, out.cull.same + ' pixels');
  S.eq('no draw is refused', out.glErr, 0);
  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
