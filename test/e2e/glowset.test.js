/* THE GLOW PASS DRAWS WHAT GLOWS - render3d/fxemit3d.js, _r3dFxGlowSet.

   The bloom's emitter pass (bloom3d.js) drew every effect quad a second time at full resolution,
   smoke and all, and the shader threw away every pixel that gave off nothing. In a big fight the
   effects were the largest part of the frame's GPU time that the fight added, and half of their
   cost was that second draw of smoke. It now draws only the quads that can give off light.

     POPULATION   a burning, smoking scene: quads in the main batch, some of them glowing, and
                  smoke among the ones left out
     THE SAME     the emitter target, read back, is byte-identical to the one every quad made
                  (R3.fxGlowAll, the before-picture) - and so is the finished frame
     IT GLOWS     the post pass is in the picture at all, or "identical" would say nothing */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('glowset');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 760, height: 620, dpr: 1 });
  await g.start(7, 1);

  var out = await g.page.evaluate(function () {
    var o = {}, R = _rtsR, i;
    rtsSetArmySide('allied');
    _rtsNewGame(4242, 'easy');
    var G = window._rtsG, R3 = window._R3D;
    for (i = 0; i < RTS_N * RTS_N; i++) { G.mapped[i] = 1; G.vis[i] = 1; }
    G.visDirty = 1;
    o.on = !!(R3 && R3.on);
    if (!o.on) return o;
    var gl = R3.gl, yard = _rtsHas('player', 'yard');
    R.focus.x = yard.x; R.focus.z = yard.z + 8; R.zi = RTS_ZOOM_BASE_STEPS - 1; _rtsApplyCam();
    var X = yard.x, Z = yard.z + 8;
    /* fresh fireballs, one cooling to smoke, fires of the burn ladder and their smoke */
    var FX = [
      { kind: 'boom', x: X - 4, y: 1, z: Z, t: 0.15, big: 1.2 },
      { kind: 'boom', x: X + 5, y: 1, z: Z + 2, t: 0.6, big: 1.4 },
      { kind: 'pop', x: X, y: 0.5, z: Z - 3, t: 0.1, big: 1 },
      { kind: 'firemed', x: X + 1, y: 0, z: Z + 5, t: 0.4, big: 1.6, loops: 4 },
      { kind: 'firesmall', x: X - 6, y: 0, z: Z + 4, t: 1.1, big: 1.2, loops: 4 },
      { kind: 'smoke', x: X + 7, y: 0, z: Z - 2, t: 0.8, big: 1.5 }
    ];
    function stage() { G.fx.length = 0; FX.forEach(function (f) { G.fx.push(Object.assign({}, f)); }); }
    function emitPixels() {
      var w = R3.postW, h = R3.postH, px = new Uint8Array(w * h * 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, R3.bloomFbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, R3.emitTex, 0);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return px;
    }
    /* time frozen at dt 0, so two frames of the same scene are the same frame */
    function frame(all, post) {
      R3.fxGlowAll = all; window.RTS_POST_ON = post;
      stage(); _rtsRFrame(0);
      var e = emitPixels(), cc = _rtsCompose();
      return { emit: e, pic: cc.getContext('2d').getImageData(0, 0, cc.width, cc.height).data, n: R3.fxV.M.n, nE: R3.fxV.nE, lit: R3.fxV.M.lit };
    }
    function differ(A, B) { var n = 0; for (var p = 0; p < A.length; p++) if (A[p] !== B[p]) n++; return n; }
    function lit(A) { var n = 0; for (var p = 0; p < A.length; p += 4) if (A[p] + A[p + 1] + A[p + 2] > 6) n++; return n; }
    frame(false, true);
    var a = frame(false, true), a2 = frame(false, true), b = frame(true, true), c = frame(false, false);

    /* what was left out, by type: a blob that cannot glow is smoke */
    var M = R3.fxV.M, ord = R3.fxV.ord, kept = {}, out = { smoke: 0, other: 0 };
    stage(); R3.fxGlowAll = false; window.RTS_POST_ON = true; _rtsRFrame(0);
    /* the glow pass's index names quads by their place in the main batch's sorted upload */
    for (i = 0; i < R3.fxV.nE; i++) kept[R3.fxV.idxE[i * 6] / 4] = 1;
    for (i = 0; i < M.n; i++) if (!kept[i]) { if (M.a[ord[i] * R3D_FX_QUAD + 6] === 1) out.smoke++; else out.other++; }
    o.quads = a.n; o.glowing = a.nE; o.lit = a.lit; o.allQuads = b.nE; o.leftOut = out;
    o.emitLit = lit(a.emit);
    o.control = differ(a.emit, a2.emit) + differ(a.pic, a2.pic);
    o.emitDiff = differ(a.emit, b.emit);
    o.picDiff = differ(a.pic, b.pic);
    o.glowDiff = differ(a.pic, c.pic);
    R3.fxGlowAll = undefined; window.RTS_POST_ON = true;
    return o;
  });

  S.ok('the 3D mode is available to check', out.on, out.on ? 'on' : 'no WebGL');
  if (!out.on) { await g.close(); await browser.close(); return require('../lib/report.js')(S); }
  S.ok('the scene burns: effect quads in the main batch, some of them glowing', out.quads > 20 && out.lit > 0,
       out.quads + ' quads, ' + out.lit + ' counted as lit');
  S.ok('the glow pass draws some of them...', out.glowing > 0, out.glowing + ' of ' + out.quads);
  S.ok('...and leaves smoke out', out.leftOut.smoke > 5, JSON.stringify(out.leftOut));
  S.ok('...a good share of the batch', out.glowing < out.quads * 0.8, out.glowing + ' of ' + out.quads);
  S.eq('the before-picture switch draws every quad in the glow pass', out.allQuads, out.quads);
  S.ok('the emitter target has light in it to compare', out.emitLit > 200, out.emitLit + ' lit pixels');
  S.eq('control: the same frame twice is the same frame', out.control, 0);
  S.eq('the emitter target is byte-identical to every quad drawn', out.emitDiff, 0);
  S.eq('...and so is the finished frame', out.picDiff, 0);
  S.ok('the post pass is in the finished frame at all', out.glowDiff > 500, out.glowDiff + ' bytes differ with the post pass off');
  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
