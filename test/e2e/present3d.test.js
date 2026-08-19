/* THE 3D WORLD IS PRESENTED, NOT COPIED. render/frame.js used to end every 3D frame with a
   full-resolution drawImage of the GL buffer into the 2D canvas. That blit was the one
   full-frame cost the render-scale knob could not touch, and the phone made it the prime
   suspect: an iPhone 17 Pro Max held ~30fps at 0.29, 1.15 and 2.60 megapixels alike, which
   clears the shader's fill rate and leaves the per-frame copy - a GPU sync on exactly that
   class of device. So the GL canvas is a visible layer under a transparent overlay now, and
   the compositor does the presenting. (Whether this is what buys the frames back, or the
   phone is frame-capped, only the device can say - through the GFX readout, the only
   instrument this project trusts for frame rate.)

   What this spec grades is the CONTRACT that keeps the stack showing a picture. Every clause
   here broke for real while the change was built:

   - ADOPTION. The shell rebuilds its DOM every match; the GL context lives on one persistent
     canvas. Unadopted, match two put a blank detached twin in the document - invisible to the
     old blit, which drew by reference, and total blackout for a presented layer.
   - THE OVERLAY'S ALPHA. The 2D context was created alpha:false, under which clearRect leaves
     opaque black: a black sheet over the whole world the moment the blit stopped filling it.
   - VISIBILITY, both ways: presented in 3D, hidden in 2D where an extra composited
     full-screen layer is pure cost.
   - SHAKE. The blit inherited the overlay's shake transform for free; a presented layer has
     to carry its own, or explosions shake the effects and not the world under them.

   The 2D leg doubles as the control for the transparency measurement: the same overlay that
   must be transparent in 3D must be OPAQUE in 2D, so a measurement that cannot tell the two
   apart fails the control. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('present3d');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 1000, height: 700, dpr: 1 });
  await g.start(7, 10, { mode3d: true });
  await g.freeze();

  var out = await g.page.evaluate(function () {
    var o = {}, R = _rtsR, R3 = window._R3D, G = window._rtsG;
    o.on = !!(R3 && R3.on);
    if (!o.on) return o;
    _rtsTick(1 / 60); _rtsRFrame(1 / 60);

    function stats(cv) {
      var c = document.createElement('canvas');
      c.width = cv.width; c.height = cv.height;
      var cg = c.getContext('2d'); cg.drawImage(cv, 0, 0);
      var d = cg.getImageData(0, 0, c.width, c.height).data;
      var opaque = 0, tones = {}, n = d.length / 4;
      for (var i = 0; i < d.length; i += 4) {
        if (d[i + 3] > 250) opaque++;
        if (!(i % 148)) tones[d[i] + ',' + d[i + 1] + ',' + d[i + 2]] = 1;
      }
      return { opaquePct: +(100 * opaque / n).toFixed(1), tones: Object.keys(tones).length };
    }

    /* the stack, in 3D */
    var el = document.getElementById('rtsCv3d');
    o.adopted = el === R3.cv;
    o.display = R3.cv.style.display;
    o.overlayAlpha = !!R.cv.getContext('2d').getContextAttributes().alpha;
    o.cssMatches = R3.cv.style.width === R.cv.style.width &&
                   R3.cv.style.height === R.cv.style.height;
    /* The glow used to be a third element here, screen-blended by the compositor. It is a GPU
       pass inside the GL renderer now (render3d/bloom3d.js), so the stage is back to three
       canvases and the element must be GONE - a leftover would composite stale pixels over
       the world with nothing left to clear it. */
    o.noGlowEl = !document.getElementById('rtsGlow');
    o.gl = stats(R3.cv);
    o.overlay = stats(R.cv);
    var comp = _rtsCompose();
    o.comp = stats(comp);
    o.compSized = comp.width === R.cv.width && comp.height === R.cv.height;

    /* SHAKE: the presented layer must carry the offset the overlay gets through its
       transform. Driven through the real frame walk, not by poking the style. */
    G.shake = 1.0;
    _rtsRFrame(1 / 60);
    o.shakeOn = R3.cv.style.transform;
    G.shake = 0;
    _rtsRFrame(1 / 60);
    o.shakeOff = R3.cv.style.transform;

    /* MATCH TWO: the shell rebuilds its DOM; the persistent canvas must be adopted back and
       the world must still arrive. This is the exact shape of the real bug: everything looked
       fine for the whole first match. */
    rtsClose();
    rtsOpen(9);
    var U = window._rtsUI;
    if (U) { U.dead = true; try { if (U.raf) cancelAnimationFrame(U.raf); } catch (e) {} }
    for (var t = 0; t < 60; t++) _rtsTick(1 / 60);
    _rtsRFrame(1 / 60);
    var el2 = document.getElementById('rtsCv3d');
    o.m2adopted = el2 === window._R3D.cv;
    o.m2display = window._R3D.cv.style.display;
    o.m2gl = stats(window._R3D.cv);

    /* the control: in 2D the same overlay is the whole picture and must be opaque, and the
       world layer must leave the compositor */
    rts3dSet(false);
    _rtsRFrame(1 / 60);
    o.off2d = {
      display: window._R3D.cv.style.display,
      overlay: stats(_rtsR.cv)
    };
    rts3dSet(true);
    return o;
  });

  var errs = g.errors.filter(function (e) { return !/ServiceWorker/.test(e); });
  await g.close();
  await browser.close();

  S.ok('the mode is on', out.on, out.on ? 'on' : 'no WebGL');
  if (out.on) {
    S.ok('the document element IS the renderer\'s canvas, and it is presented',
         out.adopted && out.display === 'block',
         (out.adopted ? 'adopted' : 'DETACHED twin in the DOM') + ', display:' + out.display);
    S.ok('the world layer carries a scene, not a blank',
         out.gl.opaquePct === 100 && out.gl.tones >= 8,
         out.gl.tones + ' tones sampled, ' + out.gl.opaquePct + '% opaque');
    S.ok('the overlay above it is genuinely transparent where nothing 2D drew',
         out.overlayAlpha && out.overlay.opaquePct < 20,
         'alpha:' + out.overlayAlpha + ', ' + out.overlay.opaquePct + '% opaque (fx, readout and ' +
         'message pixels are allowed; a sheet is not)');
    S.ok('...and its CSS box tracks the presentation canvas',
         out.cssMatches, out.cssMatches ? 'same inline size' : 'boxes diverge');
    S.ok('the retired glow element is gone from the stage', out.noGlowEl,
         out.noGlowEl ? 'absent - the glow is a GL pass now' :
         '#rtsGlow still in the DOM with nothing painting or clearing it');
    S.ok('the composite the harness reads carries the scene at presentation size',
         out.compSized && out.comp.opaquePct === 100 && out.comp.tones >= 8,
         out.comp.tones + ' tones, ' + out.comp.opaquePct + '% opaque' +
         (out.compSized ? '' : ', WRONG SIZE'));
    S.ok('screen shake moves the presented layer and stands down after',
         /translate/.test(out.shakeOn) && out.shakeOff === '',
         'shaking: "' + out.shakeOn + '", still: "' + out.shakeOff + '"');
    S.ok('a second match adopts the canvas back into the rebuilt DOM',
         out.m2adopted && out.m2display === 'block' && out.m2gl.tones >= 8,
         (out.m2adopted ? 'adopted' : 'DETACHED - match two is a blackout') +
         ', ' + out.m2gl.tones + ' tones on screen');
    S.ok('in 2D the layer leaves and the overlay is the whole opaque picture (control)',
         out.off2d.display === 'none' && out.off2d.overlay.opaquePct === 100,
         'display:' + out.off2d.display + ', overlay ' + out.off2d.overlay.opaquePct +
         '% opaque - proves the transparency measurement can tell the modes apart');
  }
  S.ok('no page errors', !errs.length, errs.join(' | ') || 'none');
  require('../lib/report.js')(S);
})();
