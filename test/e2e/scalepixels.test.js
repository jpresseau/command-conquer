/* THE SHADER DRAWS AT THE SCALE THE CAMERA PROJECTS AT.

   e2e/renderscale grades the projection against ITSELF and says so in its own header:
   _rtsWorldToScreen and _rtsGroundAt are exact inverses whatever the shader does, so putting
   R.dpr back into scene3d.js's clip-space scale leaves every assertion in that file green. That
   was checked rather than assumed when the render-scale knob was built, written down, and left.

   IT STOPPED BEING THEORETICAL when ui/gfxstat shipped. The clip-space scale is
   2*z*scale / bufferWidth, which reduces to 2*z/cssWidth and is invariant to the buffer's
   resolution ONLY while the numerator names the BUFFER's scale. At AUTO the buffer's scale and
   the device pixel ratio are the same number, so the bug cannot appear. The moment a player
   PINS a lower scale they diverge - and the world is then drawn dpr/scale too large while
   camera.js goes on projecting clicks at the right size. Clicks land beside units, silently,
   and nothing in the suite notices.

   SO THIS MEASURES THE PIXELS. Two units are placed a known distance apart, the GL buffer is
   read, and each unit's position in it is recovered by DIFFING against a frame with the unit
   moved away - which needs no assumption about what colour a unit is or how tall its model
   stands. The separation between them is then compared with what _rtsWorldToScreen predicts.

   SEPARATION, not absolute position, is the load-bearing measurement: a model is drawn around
   its ground point and stands up from it, so any absolute comparison carries a constant offset
   that has to be tolerated - and a tolerance wide enough for that is wide enough to hide a
   small scale error. The distance between two points cancels the offset exactly and scales
   linearly with the error, so a 3x mistake reads as 3x.

   RUN AT dpr 3, at AUTO and PINNED. On a dpr-1 desktop a pinned 1x IS auto, the two numbers
   agree, and the whole failure mode is unreachable - a spec that only ran there would pass
   against the broken code. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('scalepixels');

(async function () {
  var browser = await chromium.launch();
  /* dpr 3, so a pinned 1x is genuinely different from AUTO */
  var g = await openPage(browser, { width: 900, height: 700, dpr: 3 });
  await g.start(7, 12, { mode3d: true });
  await g.freeze();

  var out = await g.page.evaluate(function () {
    var o = {}, G = window._rtsG, R = _rtsR, R3 = window._R3D;
    o.on = !!(R3 && R3.on);
    if (!o.on) return o;
    for (var i = 0; i < RTS_N * RTS_N; i++) { G.mapped[i] = 1; G.vis[i] = 1; }

    /* One unit, moved between three places: far away for the bare frame, then A, then B.
       Everything else on the map stays put, so the diff can only be this unit. */
    var yard = _rtsHas('player', 'yard');
    var probe = _rtsSpawnUnit('player', 'tank', yard.x, yard.z + RTS_TILE * 6);
    o.spawned = !!probe;
    if (!probe) return o;
    probe.order = null; probe.path = null;

    /* Park the camera where both points will be comfortably on screen. */
    var AX = yard.x - RTS_TILE * 3, AZ = yard.z + RTS_TILE * 8;
    var BX = AX + RTS_TILE * 6, BZ = AZ;              /* same depth: a pure horizontal step */
    R.focus.x = (AX + BX) / 2; R.focus.z = AZ; _rtsApplyCam();

    function shot() {
      _rtsRFrame(0);                                  /* dt 0 - nothing animates between frames */
      var c = document.createElement('canvas');
      c.width = R3.cv.width; c.height = R3.cv.height;
      c.getContext('2d').drawImage(R3.cv, 0, 0);
      return c.getContext('2d').getImageData(0, 0, c.width, c.height);
    }
    /* Where did the picture change, and where is the middle of that change? */
    function blobX(bare, now) {
      var a = bare.data, b = now.data, W = now.width;
      var sum = 0, n = 0, minX = 1e9, maxX = -1e9;
      for (var p = 0; p < a.length; p += 4) {
        var d = Math.abs(a[p] - b[p]) + Math.abs(a[p + 1] - b[p + 1]) + Math.abs(a[p + 2] - b[p + 2]);
        if (d < 40) continue;
        var px = (p / 4) % W;
        sum += px; n++;
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
      }
      return n ? { x: sum / n, n: n, w: maxX - minX } : null;
    }

    function measure(tag) {
      /* bare: the probe well outside the view */
      probe.x = yard.x + RTS_TILE * 60; probe.z = yard.z + RTS_TILE * 60;
      var bare = shot();
      probe.x = AX; probe.z = AZ;
      var atA = blobX(bare, shot());
      probe.x = BX; probe.z = BZ;
      var atB = blobX(bare, shot());
      if (!atA || !atB) return { tag: tag, found: false };
      var pa = _rtsWorldToScreen(AX, 0, AZ), pb = _rtsWorldToScreen(BX, 0, BZ);
      /* _rtsWorldToScreen answers in CSS pixels; the buffer is cssPx * R3.scale. */
      var predicted = Math.abs(pb.x - pa.x) * R3.scale;
      var measured = Math.abs(atB.x - atA.x);
      return { tag: tag, found: true, dpr: R.dpr, scale: R3.scale,
               bufW: R3.cv.width, pxA: +atA.x.toFixed(1), pxB: +atB.x.toFixed(1),
               nA: atA.n, nB: atB.n,
               predicted: +predicted.toFixed(1), measured: +measured.toFixed(1),
               ratio: +(measured / predicted).toFixed(4) };
    }

    rtsGfxSet(null);                 /* AUTO */
    o.auto = measure('auto');
    rtsGfxSet(1);                    /* PINNED - where scale and dpr part company */
    o.pinned = measure('pinned 1x');
    rtsGfxSet(null);
    return o;
  });

  var errs = g.errors.filter(function (e) { return !/ServiceWorker/.test(e); });
  await g.close();
  await browser.close();

  S.ok('the mode is on and a probe unit was placed', out.on && out.spawned,
       out.on ? (out.spawned ? 'ready' : 'spawn refused') : 'no WebGL');

  ['auto', 'pinned'].forEach(function (k) {
    var m = out[k];
    if (!m) return;
    S.ok('the probe was found in the buffer at ' + (m.tag || k), m.found,
         m.found ? m.nA + ' and ' + m.nB + ' pixels changed at the two points'
                 : 'nothing changed in the frame when the unit moved - the diff found no unit');
    if (!m.found) return;
    /* THE CLAIM. A ratio of 1 means the shader drew the step at exactly the width the
       projection says it is. Restoring R.dpr in scene3d.js makes this dpr/scale - 3.0 on the
       pinned row below, which no tolerance here could absorb. */
    S.ok('...and the drawn separation matches the projected one (' + m.tag + ')',
         Math.abs(m.ratio - 1) < 0.04,
         m.measured + ' buffer px drawn against ' + m.predicted + ' projected, ratio ' +
         m.ratio + '  [dpr ' + m.dpr + ', buffer scale ' + m.scale + ', ' + m.bufW + 'px wide]');
  });

  /* THE CONTROL that makes the pinned row worth running: it has to be a genuinely different
     buffer from AUTO, or both rows are the same measurement written twice. */
  if (out.auto && out.pinned && out.auto.found && out.pinned.found) {
    S.ok('the pinned buffer really is a different size from AUTO',
         out.pinned.scale < out.auto.scale && out.pinned.bufW < out.auto.bufW,
         'AUTO scale ' + out.auto.scale + ' at ' + out.auto.bufW + 'px, pinned scale ' +
         out.pinned.scale + ' at ' + out.pinned.bufW + 'px - if these matched, the pinned ' +
         'assertion would be the AUTO one again and the bug it exists for would be unreachable');
  }
  S.ok('no page errors', !errs.length, errs.join(' | ') || 'none');
  require('../lib/report.js')(S);
})();
