/* THE 3D BUFFER RENDERS AT NATIVE RESOLUTION, AND THE PLAYER CAN LOWER IT.

   It was capped at 2 device pixels per CSS pixel for a while, as a fill-rate saving, and the
   device said no. The premise looked solid - a dpr-3 phone carried 1.46M pixels and a dpr-4 one
   2.10M against the 816k of the 1280x800 desktop this game is judged on - and then the frame
   rate was read off an actual iPhone 17 Pro Max through the GFX readout, at every scale its
   screen can show:

       1x  0.29 MP -> ~30 fps     2x  1.15 MP -> ~30 fps     3x  2.60 MP -> ~30-40 fps

   A ninefold range in pixels moved nothing. Not fill-bound; the cap bought no frames and cost
   sharpness on every dense screen. So AUTO is native again and this spec grades what survived:
   the KNOB. A player on a device that really is fill-bound pins a lower scale and reads the
   result off the screen, which is the only way this project has ever measured real hardware.

   WHAT IS STILL NOT PROVEN, kept from the capped version because the risk did not go away. The
   clip-space scale in scene3d.js is 2*z*scale / bufferWidth, which reduces to 2*z/cssWidth and
   is invariant to the buffer's resolution - but only while the numerator names the BUFFER's
   scale. Left as R.dpr it draws the world dpr/scale too large while camera.js goes on projecting
   clicks at the right size: clicks landing beside units, silently. The round trip below does NOT
   catch that, and this was checked rather than assumed - putting R.dpr back leaves every
   assertion here green, because _rtsWorldToScreen and _rtsGroundAt are exact inverses of each
   other whatever the shader does. Catching it needs a pixel cross-check: render a unit at a
   known world point, find it in the frame, compare. Not written yet.

   It matters less at native than it did under the cap - at AUTO the two scales are equal again,
   so the bug can only appear for a player who has pinned one - but it is still there. */

var { chromium, devices } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('renderscale');
var TARGETS = [
  { name: 'desktop dpr1', opts: { width: 1280, height: 800, dpr: 1 } },
  { name: 'iPhone 13', opts: { device: devices['iPhone 13'] } },
  { name: 'Galaxy S9+', opts: { device: devices['Galaxy S9+'] } }
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
      var nativePx = R3.cv.width * R3.cv.height;
      rtsGfxSet(1);                                   /* pin the lowest the knob offers */
      var pinnedPx = R3.cv.width * R3.cv.height;
      rtsGfxSet(null);                                /* and back to AUTO for the next target */
      return { on: !!(R3 && R3.on), dpr: R.dpr, scale: R3.scale, cap: window.R3D_MAX_SCALE,
               mainPx: main.width * main.height, glPx: nativePx, pinnedPx: pinnedPx,
               samples: n, worstErr: +worst.toFixed(3) };
    });
    r.target = T.name;
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

  S.ok('the buffer renders at native resolution by default',
       rows.every(function (p) { return p.scale === p.dpr && p.glPx === p.mainPx; }),
       show(function (p) { return 'dpr ' + p.dpr + ', scale ' + p.scale + ', ' +
            (p.glPx / 1000).toFixed(0) + 'k px' +
            (p.glPx === p.mainPx ? ' = the screen' : ' != the screen ' + (p.mainPx / 1000).toFixed(0) + 'k'); }));

  /* AND THE KNOB STILL LOWERS IT, which is the half worth keeping - and the control that stops
     the line above passing for the wrong reason. "Native by default" is also what a knob that
     does nothing at all would report. */
  S.ok('...and a pinned scale really does shrink it',
       rows.every(function (p) { return p.dpr === 1 ? p.pinnedPx === p.mainPx
                                                    : p.pinnedPx < p.mainPx * 0.6; }),
       show(function (p) { return 'pinned 1x -> ' + (p.pinnedPx / 1000).toFixed(0) + 'k of ' +
            (p.mainPx / 1000).toFixed(0) + 'k'; }));

  S.ok('no page errors', !errors.length, errors.join(' | ') || 'none');
  require('../lib/report.js')(S);
})();
