/* THE FLAME IS A FLAME, AND THE SEA IS WHERE THE SEA IS.

   THE FIRE A BURNING BUILDING WEARS WAS A CANDLE. _sprFire drew sixteen horizontal bars up a
   wobbling axis - 5 art pixels wide at the bottom, 1 at the top, each 2 tall, stepping up by
   1.1 - so the bars OVERLAPPED into a solid slab through the lower half and separated into a
   thin stalk above it. On screen that is a wide white splash with an orange stick coming out of
   the top. It is also the sprite the 'fire' effect role uses, so it was on every burning
   building and every fire animation in the game.

   The tell is a number a bar chart cannot escape: EVERY PIXEL IN A HORIZONTAL BAR IS THE SAME
   COLOUR, so across any row of the sprite the centre is exactly as bright as the edge. A real
   flame is hottest on its axis - that is what a white core inside a yellow body inside an
   orange edge IS - and no arrangement of single-coloured horizontal bars can produce it.

   So the rewrite evaluates a temperature field instead: temperature falls with height AND with
   distance from the axis, the half-width pinches to nothing at the fuel, swells through the
   lower third and tapers to a point, and the axis snakes by a per-frame hash. This spec grades
   the three properties that distinguishes that from what was there - a hot core, a taper, and
   frames that actually differ - rather than grading the picture. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('flame');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 900, height: 650, dpr: 1 });
  await g.start(7, 1);

  var out = await g.page.evaluate(function () {
    var o = {}, R = _rtsR, SP = _rtsSprites();
    rtsSetArmySide('allied');
    _rtsNewGame(4242, 'easy');

    /* ---------- the flame ---------- */
    var set = SP.fire;
    o.frames = set.length;
    o.ps = set[0].ps || 1;
    o.size = set[0].width + 'x' + set[0].height;
    o.tallerThanWide = set[0].height > set[0].width;

    function frameData(cv) {
      return cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    }
    /* the opaque span of a row, and the luminance at its centre against its edge */
    function row(d, W, y) {
      var x0 = -1, x1 = -1;
      for (var x = 0; x < W; x++) {
        if (d[(y * W + x) * 4 + 3] > 200) { if (x0 < 0) x0 = x; x1 = x; }
      }
      if (x0 < 0) return null;
      function lum(x) {
        var p = (y * W + x) * 4;
        return 0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2];
      }
      var mid = Math.round((x0 + x1) / 2);
      var edge = Math.round(x0 + (x1 - x0) * 0.08);
      return { w: x1 - x0 + 1, mid: lum(mid), edge: lum(edge) };
    }

    var cv0 = set[0], W0 = cv0.width, H0 = cv0.height, d0 = frameData(cv0);
    /* a row a quarter of the way up the flame, in the body rather than the tip */
    var yBody = Math.round(H0 - 1 - (H0 - 1) * 0.25);
    var yHigh = Math.round(H0 - 1 - (H0 - 1) * 0.62);
    var rb = row(d0, W0, yBody), rh = row(d0, W0, yHigh);
    o.body = rb; o.high = rh;
    /* THE metric: a bar is one colour, so its centre and its edge are identical */
    o.coreContrast = rb ? +(rb.mid - rb.edge).toFixed(1) : 0;
    o.taper = (rb && rh) ? +(rh.w / rb.w).toFixed(3) : 1;
    /* the very base must pinch - fire necks where it leaves what it is burning */
    var rBase = row(d0, W0, H0 - 1);
    o.baseW = rBase ? rBase.w : 0;
    o.bodyW = rb ? rb.w : 0;

    /* frames must differ, or it pulses instead of flickering */
    var sigs = {};
    for (var f = 0; f < set.length; f++) {
      var df = frameData(set[f]), acc = 0;
      for (var q = 0; q < df.length; q += 4) acc = (acc * 31 + df[q + 3]) & 0xffffff;
      sigs[acc] = 1;
    }
    o.distinctFrames = Object.keys(sigs).length;

    return o;
  });

  S.ok('the flame bakes at the procedural density', out.ps > 1,
       out.size + ' at ps ' + out.ps + ', ' + out.frames + ' frames');
  S.ok('it is taller than it is wide, like a flame', out.tallerThanWide, out.size);

  /* The one thing a stack of single-coloured horizontal bars can never produce. */
  S.ok('it has a hot core, not a flat band', out.coreContrast > 25,
       'across a row a quarter up the flame the centre is ' + out.coreContrast +
       ' luminance above the edge (' + (out.body ? out.body.mid + ' vs ' + out.body.edge : 'n/a') +
       ') - with horizontal bars every pixel in a row is one colour and this is exactly 0');

  S.ok('...and it tapers toward the tip', out.taper < 0.85,
       'the row at 62% height is ' + out.taper + ' of the width of the row at 25% (' +
       (out.high ? out.high.w : 0) + 'px against ' + out.bodyW + 'px)');

  S.ok('...and pinches where it meets the fuel', out.baseW < out.bodyW,
       'the bottom row is ' + out.baseW + 'px against ' + out.bodyW + 'px through the body');

  S.ok('the frames flicker rather than pulse', out.distinctFrames === out.frames,
       out.distinctFrames + ' distinct silhouettes across ' + out.frames + ' frames');

  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})();
