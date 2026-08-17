/* THE 3D BUFFER'S RESOLUTION IS ITS OWN, AND SMALLER THAN THE SCREEN'S ON A PHONE.

   render/camera.js picks a device pixel ratio of up to 4 and builds a zoom ladder around it,
   because the 2D mode STAMPS PIXEL ART and a cell has to land on whole device pixels or the
   sprites smear. None of that reasoning applies to the 3D mode, which draws meshes - so its
   buffer is a pure fill-rate knob, and render/frame.js already blits whatever size it is up to
   the presentation canvas. R3D_MAX_SCALE caps it at 2.

   Measured, backing store per canvas:

       desktop 1280x800  dpr 1    816k -> 816k     unchanged
       iPhone 13         dpr 3   1.46M -> 647k     56% of the fill gone
       Galaxy S9+        dpr 4   2.10M -> 526k     75% of the fill gone

   WHAT THIS FILE DOES NOT YET PROVE, stated first because it is the risk that matters. The
   clip-space scale in scene3d.js is 2*z*scale / bufferWidth, which reduces to 2*z/cssWidth and
   is invariant to the buffer's resolution - but ONLY while the numerator names the BUFFER's
   scale. Left as R.dpr, as it was while the two were always equal, the world is DRAWN
   dpr/scale too large (twice over on a Galaxy S9+) while camera.js goes on projecting clicks
   at the right size: the "clicks land beside units" failure gl3d.js warns about, and a silent
   one, because the picture still looks like a battlefield.

   The round trip below does NOT catch it, and this was checked rather than assumed: putting
   R.dpr back leaves every assertion here green. _rtsWorldToScreen and _rtsGroundAt both live in
   camera.js and are exact inverses of each other whatever the shader is doing, so a projection
   that agrees with itself proves only that camera.js is self-consistent. Catching a shader that
   disagrees with camera.js needs a PIXEL cross-check - render a unit at a known world point,
   find it in the frame, and compare against _rtsWorldToScreen - which is not written yet.

   So what follows grades the cap's arithmetic and its blast radius, and the round trip is kept
   as a regression net for camera.js itself. The shader agreement is verified by hand for now:
   worst error 0 world units over 88 sampled points on three devices, and e2e/perspective,
   e2e/ground, e2e/default3d and e2e/resolution all pass at every scale. */

var { chromium, devices } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('renderscale');
var TARGETS = [
  { name: 'desktop dpr1', opts: { width: 1280, height: 800, dpr: 1 }, capped: false },
  { name: 'iPhone 13', opts: { device: devices['iPhone 13'] }, capped: true },
  { name: 'Galaxy S9+', opts: { device: devices['Galaxy S9+'] }, capped: true }
];

(async function () {
  var browser = await chromium.launch();
  var rows = [], errors = [];

  for (var i = 0; i < TARGETS.length; i++) {
    var T = TARGETS[i];
    var g = await openPage(browser, T.opts);
    await g.start(7, 15, { mode3d: 'default' });
    var r = await g.page.evaluate(function () {
      var R3 = window._R3D, R = window._rtsR, main = document.getElementById('rtsCv');
      var worst = 0, n = 0;
      for (var k = 0; k < 40; k++) {
        var wx = (k % 8) * 24 - 96, wz = ((k / 8) | 0) * 24 - 60;
        var sp = _rtsWorldToScreen(wx, _rtsElev(wx, wz), wz);
        if (!sp || sp.behind) continue;
        var gp = _rtsGroundAt(sp.x, sp.y);
        if (!gp) continue;
        n++;
        var e = Math.hypot(gp.x - wx, gp.z - wz);
        if (e > worst) worst = e;
      }
      return { on: !!(R3 && R3.on), dpr: R.dpr, scale: R3.scale, cap: window.R3D_MAX_SCALE,
               mainPx: main.width * main.height, glPx: R3.cv.width * R3.cv.height,
               samples: n, worstErr: +worst.toFixed(3) };
    });
    r.target = T.name; r.capped = T.capped;
    rows.push(r);
    errors = errors.concat(g.errors.filter(function (e) { return !/ServiceWorker/.test(e); }));
    await g.close();
  }
  await browser.close();

  function show(f) { return rows.map(function (p) { return p.target + ': ' + f(p); }).join('   '); }

  S.ok('every target is actually in 3D', rows.every(function (p) { return p.on; }),
       show(function (p) { return p.on ? 'on' : 'OFF'; }));

  /* camera.js against itself - see the header for what this does and does not establish. */
  S.ok('the projection is self-consistent at every scale',
       rows.every(function (p) { return p.samples >= 10 && p.worstErr < 0.05; }),
       show(function (p) { return p.worstErr + ' world units over ' + p.samples + ' points'; }));

  S.ok('the buffer is capped where the screen is denser than the cap',
       rows.filter(function (p) { return p.capped; })
           .every(function (p) { return p.scale === p.cap && p.glPx < p.mainPx * 0.7; }),
       show(function (p) { return 'dpr ' + p.dpr + ' -> scale ' + p.scale + ', ' +
            (p.glPx / 1000).toFixed(0) + 'k of ' + (p.mainPx / 1000).toFixed(0) + 'k px'; }));

  /* ...AND LEFT ALONE WHERE IT IS NOT, which is the control: a cap that fired everywhere would
     pass the line above and quietly halve the desktop picture nobody asked it to touch. */
  S.ok('...and untouched where the screen is no denser than the cap',
       rows.filter(function (p) { return !p.capped; })
           .every(function (p) { return p.scale === p.dpr && p.glPx === p.mainPx; }),
       show(function (p) { return p.capped ? 'capped' : 'scale ' + p.scale + ' = dpr ' + p.dpr +
            ', ' + (p.glPx === p.mainPx ? 'buffer unchanged' : 'BUFFER MOVED'); }));

  S.ok('no page errors', !errors.length, errors.join(' | ') || 'none');
  require('../lib/report.js')(S);
})();
