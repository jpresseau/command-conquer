/* THE PHONE TURNED AND THE BATTLEFIELD WENT BLANK - render3d/lost3d.js.

   Reported from an iPhone: "the game doesn't work when I switch from landscape to portrait". The
   bar and the sidebar went on working; the battlefield did not. Turning a phone reallocates every
   full-screen buffer, the WebGL context can be lost while it does, and nothing cancelled the loss,
   so the browser never handed it back. Driven here on a phone turned from landscape to portrait,
   the context taken away with WEBGL_lose_context, the loop frozen and every frame drawn by hand,
   with the file switched off (RTS_LOSS_OFF) as the before-picture:

     BEFORE            with it off, a context the browser is asked to restore stays lost, and the
                       battlefield reads back blank however long it is waited for
     WHILE LOST        the 3D frame and the model warm-up touch nothing on the dead context: no
                       draw, no program bound, no buffer or texture made
     NEVER GIVEN BACK  after R3D_LOST_WAIT the 3D view starts again on a fresh canvas in the old
                       one's slot - one #rtsCv3d in the page, filling the portrait stage - and
                       draws the picture it drew before the loss, with the camera's turn and the
                       tier carried across
     GIVEN BACK        the loss is cancelled, so the browser's restore arrives, and the view
                       starts again on the same canvas: the same picture again
     TURNED BACK       to landscape, the view fills the landscape stage
     THE READOUT       the GFX readout says how many were lost and how many came back */

var { chromium, devices } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('ctxlost');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { device: Object.assign({}, devices['iPhone 13'], { viewport: { width: 844, height: 390 } }) });
  var page = g.page;
  await g.start(7, 5, { freeze: true });
  var on = await page.evaluate(function () {
    var R3 = window._R3D;
    if (!R3 || !R3.on || !R3.gl.getExtension('WEBGL_lose_context')) return false;
    var C = window.__cl = {};
    /* every call that draws, or that makes something on the GPU, counted per context */
    C.hook = function (gl) {
      if (gl.__cnt) return gl.__cnt;
      var n = gl.__cnt = { draw: 0, make: 0 };
      function wrap(k, f) { gl[k] = function () { n[f]++; return gl.__orig[k].apply(gl, arguments); }; }
      gl.__orig = {};
      ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'useProgram'].forEach(function (k) {
        if (typeof gl[k] === 'function') { gl.__orig[k] = gl[k]; wrap(k, 'draw'); }
      });
      ['createBuffer', 'createTexture', 'createProgram', 'createFramebuffer', 'bufferData', 'texImage2D'].forEach(function (k) {
        if (typeof gl[k] === 'function') { gl.__orig[k] = gl[k]; wrap(k, 'make'); }
      });
      return n;
    };
    C.box = function (el) {
      var r = el.getBoundingClientRect();
      return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)];
    };
    /* two frames, then the 3D buffer read back on a grid: how much of it is drawn, and the picture */
    C.shot = function (tag) {
      _rtsRFrame(1 / 60); _rtsRFrame(1 / 60);
      var R3 = window._R3D, gl = R3.gl, W = R3.cv.width, H = R3.cv.height, b = new Uint8Array(W * H * 4);
      gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, b);
      var px = [], lit = 0, n = 0;
      for (var y = 4; y < H; y += 16) for (var x = 4; x < W; x += 16) {
        var q = (y * W + x) * 4; px.push(b[q], b[q + 1], b[q + 2]); n++;
        if (b[q + 3] === 255 && b[q] + b[q + 1] + b[q + 2] > 30) lit++;
      }
      C[tag] = px;
      return { lit: +(lit / n).toFixed(3), buf: [W, H], box: C.box(R3.cv), stage: C.box(document.querySelector('#rcgRts .rts-stage')),
               lost: gl.isContextLost(), n3d: document.querySelectorAll('#rtsCv3d').length,
               slot: document.getElementById('rtsCv3d') === R3.cv, yaw: R3.yaw, tilt: R3.tilt, q: R3.qLevel,
               L: JSON.stringify(_R3D_LOSS) };
    };
    C.diff = function (a, b) {
      var A = C[a], B = C[b], s = 0, big = 0;
      if (!A || !B || A.length !== B.length) return { mean: 999, big: 1 };
      for (var i = 0; i < A.length; i++) { var d = Math.abs(A[i] - B[i]); s += d; if (d > 40) big++; }
      return { mean: +(s / A.length).toFixed(2), big: +(big / A.length).toFixed(4) };
    };
    /* a turned camera and the middle tier, so that carrying them across is something to see */
    _r3dCamSet(0.6, 0.8); _r3dQualityApply(1);
    return true;
  });
  S.ok('the 3D view is on, and the context can be taken away', on, '');
  if (!on) { await g.close(); await browser.close(); require('../lib/report.js')(S); return; }

  var land = await page.evaluate(function () { return window.__cl.shot('land'); });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(function () { return _rtsR.W === 390; }, null, { timeout: 15000 }).catch(function () {});
  var port = await page.evaluate(function () { window.__cl.cv0 = window._R3D.cv; return window.__cl.shot('port'); });
  S.ok('(the staging: turned from landscape to portrait, the battlefield drawn and filling the stage both ways)',
       land.stage[2] > land.stage[3] && port.stage[3] > port.stage[2] && land.lit > 0.8 && port.lit > 0.8 &&
       JSON.stringify(land.box) === JSON.stringify(land.stage) && JSON.stringify(port.box) === JSON.stringify(port.stage),
       'landscape stage ' + land.stage + ', ' + land.lit + ' drawn; portrait stage ' + port.stage + ', canvas ' + port.box + ', ' + port.lit + ' drawn');

  /* BEFORE: the switch off, the context lost and the browser asked to restore it */
  var wait = await page.evaluate(function () {
    window.RTS_LOSS_OFF = true;
    var R3 = window._R3D;
    window.__cl.r3a = R3;
    window.__cl.ext = R3.gl.getExtension('WEBGL_lose_context');
    R3.cv.addEventListener('webglcontextlost', function () { window.__cl.seen = true; });
    window.__cl.ext.loseContext();
    return R3D_LOST_WAIT;
  });
  await page.waitForFunction(function () { return window.__cl.seen === true; }, null, { timeout: 10000 }).catch(function () {});
  await page.evaluate(function () { try { window.__cl.ext.restoreContext(); } catch (e) {} });
  await page.waitForTimeout(wait + 300);
  var off = await page.evaluate(function () {
    var o = window.__cl.shot('off');
    o.same = window._R3D === window.__cl.r3a;
    return o;
  });
  S.ok('BEFORE: with it off, the lost context stays lost after the restore, and the battlefield reads back blank',
       off.lost && off.lit === 0 && off.same, 'lost ' + off.lost + ', ' + off.lit + ' drawn, ' + (wait + 300) + 'ms after the restore');

  /* WHILE LOST: the switch back on - the frame finds the context gone, and waits */
  var lost = await page.evaluate(function () {
    window.RTS_LOSS_OFF = false;
    var R3 = window._R3D, n = window.__cl.hook(R3.gl), d0 = n.draw, m0 = n.make;
    R3.mesh = {}; R3.warmQ = null;          /* models to build, if the warm-up were let at it */
    _r3dPaceBegin(); _rtsRFrame(1 / 60); _r3dPaceEnd(0);
    _rtsRFrame(1 / 60);
    return { draw: n.draw - d0, make: n.make - m0, lost: R3.lost === true, same: window._R3D === R3 };
  });
  S.ok('WHILE LOST: the 3D frame and the warm-up touch nothing on the dead context', lost.lost && lost.same && lost.draw === 0 && lost.make === 0,
       'marked lost ' + lost.lost + '; ' + lost.draw + ' draws or programs bound, ' + lost.make + ' buffers, textures or programs made');

  /* NEVER GIVEN BACK: after the wait, a fresh canvas */
  await page.waitForTimeout(wait + 300);
  var fresh = await page.evaluate(function () {
    var o = window.__cl.shot('fresh');
    o.newCv = window._R3D.cv !== window.__cl.cv0;
    o.oldGone = !document.contains(window.__cl.cv0);
    window.__cl.cv1 = window._R3D.cv;
    return o;
  });
  var dF = await page.evaluate(function () { return window.__cl.diff('port', 'fresh'); });
  S.ok('NEVER GIVEN BACK: the view starts again on a fresh canvas in the old one\'s slot', !fresh.lost && fresh.newCv && fresh.oldGone && fresh.n3d === 1 && fresh.slot,
       'lost ' + fresh.lost + ', new canvas ' + fresh.newCv + ', old one gone ' + fresh.oldGone + ', ' + fresh.n3d + ' #rtsCv3d, in the slot ' + fresh.slot);
  S.ok('...filling the portrait stage, and drawn', JSON.stringify(fresh.box) === JSON.stringify(fresh.stage) && fresh.lit > 0.8,
       'canvas ' + fresh.box + ' in stage ' + fresh.stage + ', ' + fresh.lit + ' drawn');
  S.ok('...the picture it drew before the loss', dF.mean < 2 && dF.big < 0.005, 'mean difference ' + dF.mean + ', ' + (dF.big * 100).toFixed(2) + '% of samples off by more than 40');
  S.ok('...with the camera\'s turn carried across', Math.abs(fresh.yaw - 0.6) < 1e-6 && Math.abs(fresh.tilt - 0.8) < 1e-6, 'yaw ' + fresh.yaw + ', tilt ' + fresh.tilt);
  S.ok('...and the tier', fresh.q === 1, 'tier ' + fresh.q);

  /* GIVEN BACK: lost again, and the browser's restore arrives */
  var live = await page.evaluate(function () {
    var ext = window._R3D.gl.getExtension('WEBGL_lose_context');
    if (!ext) return false;                 /* still lost: nothing came back above */
    window.__cl.ext2 = ext; ext.loseContext(); return true;
  });
  var marked = live && await page.waitForFunction(function () { return window._R3D.lost === true; }, null, { timeout: 10000 }).then(function () { return true; }, function () { return false; });
  S.ok('GIVEN BACK: the fresh canvas\'s loss is heard, before any frame looks', marked, live ? '' : 'there was no live context to lose');
  if (live) await page.evaluate(function () { try { window.__cl.ext2.restoreContext(); } catch (e) {} });
  var back = live && await page.waitForFunction(function () { return window._R3D.restored === true; }, null, { timeout: 10000 }).then(function () { return true; }, function () { return false; });
  S.ok('...and cancelled, so the browser hands the context back', back, '');
  var inplace = await page.evaluate(function () {
    var o = window.__cl.shot('inplace');
    o.sameCv = window._R3D.cv === window.__cl.cv1;
    return o;
  });
  var dI = await page.evaluate(function () { return window.__cl.diff('port', 'inplace'); });
  S.ok('...and the view starts again on the same canvas', !inplace.lost && inplace.sameCv && inplace.n3d === 1 && inplace.slot,
       'lost ' + inplace.lost + ', same canvas ' + inplace.sameCv + ', ' + inplace.n3d + ' #rtsCv3d');
  S.ok('...the same picture again', inplace.lit > 0.8 && dI.mean < 2 && dI.big < 0.005,
       inplace.lit + ' drawn; mean difference ' + dI.mean + ', ' + (dI.big * 100).toFixed(2) + '% off by more than 40');

  /* TURNED BACK */
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForFunction(function () { return _rtsR.W > 390; }, null, { timeout: 15000 }).catch(function () {});
  var land2 = await page.evaluate(function () { return window.__cl.shot('land2'); });
  S.ok('TURNED BACK: in landscape again, the view fills the landscape stage, drawn',
       land2.stage[2] > land2.stage[3] && JSON.stringify(land2.box) === JSON.stringify(land2.stage) && land2.lit > 0.8,
       'canvas ' + land2.box + ' in stage ' + land2.stage + ', ' + land2.lit + ' drawn');

  var txt = await page.evaluate(function () { return _rtsGfxPhases(); });
  S.ok('THE READOUT: says how many were lost and how many came back', /GPU lost 2, back 2/.test(txt), txt.replace(/\s+/g, ' ').slice(-60));
  S.ok('the page logged no errors', !g.errors.length, g.errors.slice(0, 2).join(' | ') || 'clean');
  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
