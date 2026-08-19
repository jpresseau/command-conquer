/* A GLOW IS LOCAL, OR IT IS HAZE.

   The post pass had no spec at all, which is how it has already shipped a full-screen flash
   that reached a bug report. This is the first one, and it grades the property that separates
   bloom from a wash: light added AROUND something bright, and nowhere else.

   HOW THE PASS WORKS, because the measurement depends on it. The frame is downscaled to an
   eighth, run through a power curve to throw away everything that is not bright, blurred, and
   added back. The curve is built by drawing the buffer into ITSELF with multiply, so each such
   line squares it: x, x^2, x^4, x^8.

   It stopped at x^4, and that is not a hard enough threshold. A midtone of 0.5 survives x^4 at
   0.0625 - sixteen levels before any gain - and once that is blurred across the frame and added
   back, every pixel of the map receives some. Measured on a single explosion: 99.8% of the
   frame lifted, by a mean of 7.2 levels. Milder than the 19% haze this file's own comments
   record rejecting, and the same mistake.

   x^8 takes that midtone to 0.004 - one level, which an 8-bit buffer cannot even carry - while
   a fireball at 0.95 falls only from 0.81 to 0.66. The measurements below are what that buys.

   AND THE GAIN STANDS DOWN ON A BRIGHT FIELD. Bloom keyed on brightness cannot tell albedo
   from light, so a snowfield sails through any threshold and the whole map flashes the moment
   anything explodes. That is the bug that reached a report. The guard counts bright pixels in
   the thresholded buffer and fades the gain out - and since this change alters exactly that
   buffer, the guard has to be re-graded against it rather than assumed. Snow itself needs the
   player's archives, which do not ship, so the field here is made bright by hand. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('bloom');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 900, height: 700, dpr: 1 });
  await g.start(7, 1);

  var out = await g.page.evaluate(function () {
    var o = {}, R = _rtsR, i;
    rtsSetVoxSide('allied');
    _rtsNewGame(4242, 'easy');
    var G = window._rtsG;
    for (i = 0; i < RTS_N * RTS_N; i++) { G.mapped[i] = 1; G.vis[i] = 1; }
    G.visDirty = 1;

    rts3dSet(true);
    var R3 = window._R3D;
    o.on = !!(R3 && R3.on);
    if (!o.on) return o;

    var yard = _rtsHas('player', 'yard');
    R.focus.x = yard.x; R.focus.z = yard.z;
    R.zi = RTS_ZOOMS.length - 1; _rtsApplyCam();

    /* The GL world is PRESENTED under the 2D overlay now, not blitted into it, so no single
       canvas carries the finished picture any more - _rtsCompose() rebuilds it (GL layer plus
       overlay), which is the frame the compositor is showing the player and the picture the
       post pass's output lands on. */
    var cv2 = _rtsCompose();
    var BX = yard.x + 4, BZ = yard.z + 6;

    /* TIME FROZEN, at dt = 0. Stepping the clock lets the sea swell and everything else move,
       which lands as a few levels across the whole frame and reads exactly like a global bloom
       lift - measured that way first, and it reported the bloom touching 99.8% of pixels for
       reasons that had nothing to do with the bloom. The control below is what proves it. */
    function frame(post, fire) {
      window.RTS_POST_ON = post;
      G.fx.length = 0;
      if (fire) G.fx.push({ kind: 'boom', x: BX, y: 1, z: BZ, t: 0.18, big: 1.0 });
      _rtsRFrame(0);
      var cc = _rtsCompose();
      return cc.getContext('2d').getImageData(0, 0, cc.width, cc.height).data;
    }
    frame(true, true);                       /* settle */

    var CW = cv2.width, CH = cv2.height;
    function diff(A, B) {                    /* how much B adds over A */
      var n = 0, sum = 0, mx = 0;
      for (var p = 0; p < A.length; p += 4) {
        var d = ((B[p] - A[p]) + (B[p + 1] - A[p + 1]) + (B[p + 2] - A[p + 2])) / 3;
        if (d > 2) { n++; sum += d; }
        if (d > mx) mx = d;
      }
      return { pct: +(n / (A.length / 4) * 100).toFixed(1),
               mean: n ? +(sum / n).toFixed(1) : 0, max: +mx.toFixed(1) };
    }

    /* the control: same settings twice must be identical, or nothing below means anything */
    var c1 = frame(true, true), c2 = frame(true, true);
    o.control = diff(c1, c2);

    var lit = frame(true, true), unlit = frame(false, true);
    o.glow = diff(unlit, lit);

    /* NEAR SOMETHING BRIGHT AGAINST NEAR NOTHING BRIGHT.

       The first version of this measured distance from the BLAST, and it failed - 19.4% of
       pixels lit within 70px of the explosion against 22.8% beyond 220px. That is not the
       bloom washing the frame, it is the frame having more than one bright thing in it: a
       sunlit roof and a gold ore field both pass the threshold and both are entitled to glow.
       Distance from one chosen source is the wrong axis. What a glow actually claims is that
       light lands NEAR BRIGHTNESS, so that is what this measures. */
    var CG = 16, gw = Math.ceil(CW / CG), gh = Math.ceil(CH / CG);
    var brightCell = new Uint8Array(gw * gh);
    for (i = 0; i < CW * CH; i++) {
      var qb = i * 4;
      var L = (0.299 * unlit[qb] + 0.587 * unlit[qb + 1] + 0.114 * unlit[qb + 2]) / 255;
      if (L > 0.72) brightCell[(((i / CW) | 0) / CG | 0) * gw + ((i % CW) / CG | 0)] = 1;
    }
    /* how far a cell is from the nearest bright one, in cells, by a bounded search */
    var RAD = 3;                                   /* 3 cells = 48px, the glow's own reach */
    var nearBright = new Uint8Array(gw * gh);
    for (var cy = 0; cy < gh; cy++) {
      for (var cx = 0; cx < gw; cx++) {
        for (var oy = -RAD; oy <= RAD && !nearBright[cy * gw + cx]; oy++) {
          for (var ox = -RAD; ox <= RAD; ox++) {
            var yy2 = cy + oy, xx2 = cx + ox;
            if (yy2 < 0 || yy2 >= gh || xx2 < 0 || xx2 >= gw) continue;
            if (brightCell[yy2 * gw + xx2]) { nearBright[cy * gw + cx] = 1; break; }
          }
        }
      }
    }
    var nearN = 0, nearS = 0, farN = 0, farS = 0;
    for (i = 0; i < CW * CH; i++) {
      var q = i * 4;
      var d2 = ((lit[q] - unlit[q]) + (lit[q + 1] - unlit[q + 1]) +
                (lit[q + 2] - unlit[q + 2])) / 3;
      var cell = (((i / CW) | 0) / CG | 0) * gw + ((i % CW) / CG | 0);
      if (nearBright[cell]) { nearN++; if (d2 > 2) nearS++; }
      else { farN++; if (d2 > 2) farS++; }
    }
    o.nearLitPct = nearN ? +(nearS / nearN * 100).toFixed(1) : 0;
    o.farLitPct = farN ? +(farS / farN * 100).toFixed(1) : 0;
    o.brightCells = +(brightCell.reduce(function (a2, v) { return a2 + v; }, 0) /
                      brightCell.length * 100).toFixed(1);

    /* a quiet frame: nothing burning, so the pass must not fire at all */
    var q1 = frame(true, false), q2 = frame(false, false);
    o.quiet = diff(q2, q1);

    /* THE BRIGHT FIELD. The ground texture is painted white and re-uploaded, which is what a
       snowfield looks like to a threshold that cannot tell albedo from light. */
    var tc = R.terrain;
    if (tc && tc.getContext) {
      var tg = tc.getContext('2d');
      tg.fillStyle = '#f2f4f8';
      tg.fillRect(0, 0, tc.width, tc.height);
      R3.terrainDirty = true;
      _rtsRFrame(0);
      var w1 = frame(true, true), w2 = frame(false, true);
      o.snow = diff(w2, w1);
      o.snowTested = true;
    }
    return o;
  });

  S.ok('the 3D mode is available to check', out.on, out.on ? 'on' : 'no WebGL');
  if (!out.on) {
    S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');
    await g.close(); await browser.close();
    return require('../lib/report.js')(S);
  }

  /* Without this the rest is reading frame-to-frame animation. */
  S.ok('two frames of the same settings are the same picture',
       out.control.pct === 0,
       out.control.pct + '% of pixels differ between two identical captures - anything above 0 ' +
       'means the clock is running and every measurement below is reading the sea move');

  S.ok('something burning gets a glow', out.glow.max > 10,
       'the brightest pixel gains ' + out.glow.max + ' levels');

  /* THE CLAIM. */
  S.ok('...and the glow is local to it', out.glow.pct < 45,
       out.glow.pct + '% of the frame is lifted at all - at a threshold of x^4 this measured ' +
       '99.8%, by a mean of 7.2 levels, which is the whole map receiving light from one ' +
       'explosion and is haze rather than glow');

  S.ok('...landing where the bright things are, not everywhere',
       out.nearLitPct > out.farLitPct * 3,
       out.nearLitPct + '% of pixels within 48px of something bright are lit, against ' +
       out.farLitPct + '% of pixels that are not near anything bright (' + out.brightCells +
       '% of the frame is bright at all) - a wash lifts the two equally');

  /* The pass costs a full-frame downscale, two composites and a readback, so it must not run
     when there is nothing to bloom - which is most frames. */
  S.ok('a quiet frame is not touched at all', out.quiet.pct === 0,
       out.quiet.pct + '% of a frame with nothing burning changes when the pass is enabled');

  if (out.snowTested) {
    /* The regression that reached a bug report, re-graded because this change alters the very
       buffer the guard measures. */
    S.ok('a bright field does not flash when something explodes',
         out.snow.pct < 25 && out.snow.mean < 12,
         'on a white field one blast lifts ' + out.snow.pct + '% of the frame by a mean of ' +
         out.snow.mean + ' - bloom keyed on brightness cannot tell albedo from light, so ' +
         'without the guard the whole snowfield adds onto itself and flashes');
  }

  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})();
