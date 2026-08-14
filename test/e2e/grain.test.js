/* THE GROUND KEEPS ITS GRAIN WHEN THE SCREEN MAGNIFIES IT.

   The terrain bakes at 24 pixels a cell and can never bake at more: it is one canvas of
   RTS_N * RTS_TS square, it costs a measured 164 ns a pixel, and doubling the density means
   6144 square - 144 MB of RGBA and a 6.2 second bake. So the density is fixed, and the only
   question is what the screen does when it asks for more than exists.

   It made blocks. On a dpr-3 phone at the top zoom a cell covers 144 device pixels against 24
   baked - a magnification of six - and nearest-neighbour magnification turns each baked pixel
   into a 6x6 square of one flat colour. Measured on a 288x288 patch of open grass: 29 distinct
   tones in the whole patch, and one colour running a median of 12 and a mean of 14.7 device
   pixels before it changed.

   A detail texture is the standard answer and it applies here unchanged: the bake supplies
   colour and large structure, a small tile of pure high-frequency noise supplies the grain the
   magnification destroyed. What this spec pins is the four ways that goes wrong.

   IT MUST NOT BE WALLPAPER, AND THAT IS NOT GRADED HERE - HONESTLY. The first build (two
   octaves at 4 and 8 pixels, alpha 0.5) put a visible diagonal cross-hatch across every dirt
   road on the map. The second (three octaves, alpha 0.22) does not. Two candidate assertions
   were written to catch the difference and BOTH WERE DELETED for failing to:

     - low-frequency share, the energy surviving a 16px box blur: 12.0% for the build that
       weaved against 17.0% for the one that does not. It ranks them backwards, because adding
       a 16-pixel octave adds low-frequency energy by construction.
     - directional anisotropy, the ratio of the largest to the smallest mean squared step
       across the four directions: 1.109 against 1.113. Both tiles are isotropic.

   So the weave was never a property of the tile - it was STRENGTH. At alpha 0.5 the grain is
   loud enough for the eye to lock onto the value-noise lattice in the rendered picture; at
   0.22 it is not. The third octave was added in the same edit and neither measurement supports
   the claim that it helped. What guards this is the alpha constant, which is documented where
   it is declared, and the rendered assertions below - not a number about the tile. A metric
   that ranks a known-bad build above a known-good one is worse than no metric.

   IT MUST NOT TINT THE MAP. The tile is high-passed - its mean is subtracted - so it lightens
   exactly as much as it darkens and the ground keeps its colour.

   IT MUST WRAP. Sampled on a torus so the tile meets itself; a seam every 128 pixels would be
   the wallpaper this is avoiding, eight times over.

   AND IT MUST BE AFFORDABLE. `overlay` is the natural blend and costs 7.06 ms in a real frame
   at 1179x1656, against a 16.7 ms budget already carrying 8 ms of game; multiply 8.48,
   soft-light 10.38. The tile encodes lighten-or-darken in its own colour and strength in its
   alpha instead, so the composite is a plain source-over at 3.74. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('grain');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 393, height: 852, dpr: 3 });
  await g.start(7, 1);

  var out = await g.page.evaluate(function () {
    var o = {}, R = _rtsR, G = window._rtsG, i;
    rtsSetVoxSide('allied');
    _rtsNewGame(4242, 'easy');
    G = window._rtsG;
    for (i = 0; i < RTS_N * RTS_N; i++) { G.mapped[i] = 1; G.vis[i] = 1; }
    G.visDirty = 1;

    /* --- the tile itself --- */
    var t = _rtsDetailTile();
    var td = t.getContext('2d').getImageData(0, 0, t.width, t.height).data;
    o.tile = { size: t.width + 'x' + t.height, kb: +(t.width * t.height * 4 / 1024).toFixed(0) };
    /* Lighten and darken must balance, or the pass tints the map. Weighted by alpha, because
       alpha is where the strength lives. */
    var lightW = 0, darkW = 0;
    for (i = 0; i < td.length; i += 4) {
      if (td[i] > 127) lightW += td[i + 3]; else darkW += td[i + 3];
    }
    o.tile.balance = +(Math.min(lightW, darkW) / Math.max(lightW, darkW)).toFixed(3);

    /* SEAM: the mean absolute step across the wrap, against the mean across interior columns.
       A tile that does not wrap shows a step several times the interior one. */
    function colStep(a, b) {
      var s = 0;
      for (var y = 0; y < t.height; y++) {
        var p = (y * t.width + a) * 4, q = (y * t.width + b) * 4;
        s += Math.abs(td[p] * td[p + 3] - td[q] * td[q + 3]) / 255;
      }
      return s / t.height;
    }
    var interior = 0, n = 0;
    for (i = 8; i < t.width - 8; i += 8) { interior += colStep(i, i + 1); n++; }
    o.tile.interiorStep = +(interior / n).toFixed(2);
    o.tile.wrapStep = +colStep(t.width - 1, 0).toFixed(2);
    o.tile.seamRatio = +(o.tile.wrapStep / (interior / n)).toFixed(2);

    /* --- the picture: a solid block of open grass, no ore --- */
    function solid() {
      for (var tz = 8; tz < RTS_N - 8; tz++) {
        for (var tx = 8; tx < RTS_N - 8; tx++) {
          var all = true;
          for (var dz = -3; dz <= 3 && all; dz++) {
            for (var dx = -3; dx <= 3; dx++) {
              var id = _rtsIdx(tx + dx, tz + dz);
              if (G.terrain[id] !== RTS_T_GRASS || G.scrap[id] > 0) { all = false; break; }
            }
          }
          if (all) return [tx, tz];
        }
      }
      return null;
    }
    var gc = solid();
    o.found = !!gc;
    if (!gc) return o;

    var cv = document.getElementById('rtsCv'), ctx = cv.getContext('2d');
    function look() {
      _rtsRFrame(1 / 60);
      var side = Math.round(2 * R.cell * R.dpr);
      var d = ctx.getImageData(Math.round(cv.width / 2 - side / 2),
                               Math.round(cv.height / 2 - side / 2), side, side).data;
      var tones = {}, runs = [], run;
      for (var p = 0; p < d.length; p += 4) tones[d[p] + ',' + d[p + 1] + ',' + d[p + 2]] = 1;
      for (var y = 0; y < side; y += 7) {
        run = 1;
        for (var x = 1; x < side; x++) {
          var a = (y * side + x) * 4, b = (y * side + x - 1) * 4;
          if (d[a] === d[b] && d[a + 1] === d[b + 1] && d[a + 2] === d[b + 2]) run++;
          else { runs.push(run); run = 1; }
        }
      }
      runs.sort(function (p2, q2) { return p2 - q2; });
      return { tones: Object.keys(tones).length,
               medianRun: runs.length ? runs[Math.floor(runs.length / 2)] : 0,
               meanRun: runs.length ? +(runs.reduce(function (s2, v) { return s2 + v; }, 0) / runs.length).toFixed(2) : 0 };
    }
    R.zi = RTS_ZOOMS.length - 1; _rtsApplyCam();
    R.focus.x = _rtsWX(gc[0]); R.focus.z = _rtsWX(gc[1]);
    o.mag = +(R.cell / RTS_TS * R.dpr).toFixed(1);
    o.withGrain = look();
    var keep = RTS_DETAIL_MIN_MAG; RTS_DETAIL_MIN_MAG = 1e9;   /* gate the pass off */
    o.without = look();
    RTS_DETAIL_MIN_MAG = keep;

    /* --- the gate. Where the ground is not magnified there are no missing frequencies to
       restore, and paying a full-screen fill for nothing is the one way this is a pure loss.
       Exercised on the function directly, across the magnifications the ladders can produce:
       at dpr 2 the widest zoom is 1.0x and must be skipped, at dpr 3 it is 2.0x and must not. --- */
    o.gateMin = RTS_DETAIL_MIN_MAG;
    o.gate = [0.5, 1.0, 1.4, 1.5, 2.0, 6.0].map(function (m) {
      return { mag: m, drew: _rtsGroundDetail(ctx, R, m / R.dpr) === 1 };
    });

    /* --- cost, in a real frame at the zoom that needs it --- */
    R.zi = RTS_ZOOMS.length - 1; _rtsApplyCam();
    function bench() {
      for (var w = 0; w < 6; w++) _rtsRFrame(1 / 60);
      var t0 = performance.now(), m = 30;
      for (var q = 0; q < m; q++) _rtsRFrame(1 / 60);
      return +((performance.now() - t0) / m).toFixed(2);
    }
    o.msWith = bench();
    var keep2 = RTS_DETAIL_MIN_MAG; RTS_DETAIL_MIN_MAG = 1e9;
    o.msWithout = bench();
    RTS_DETAIL_MIN_MAG = keep2;
    o.msCost = +(o.msWith - o.msWithout).toFixed(2);
    return o;
  });

  S.ok('the map offers a solid block of open grass to measure', out.found,
       out.found ? 'found one' : 'none on this seed');

  if (out.found) {
    /* The whole point: at six times magnification the ground must stop being flat blocks. */
    S.ok('magnified ground carries grain instead of flat blocks',
         out.withGrain.medianRun <= 2 && out.without.medianRun >= 6,
         'at ' + out.mag + 'x magnification one colour runs a median of ' +
         out.withGrain.medianRun + ' device px (mean ' + out.withGrain.meanRun +
         '); with the pass gated off it runs ' + out.without.medianRun +
         ' (mean ' + out.without.meanRun + ')');

    S.ok('...and far more distinct tones',
         out.withGrain.tones > out.without.tones * 8,
         out.withGrain.tones + ' tones in the patch against ' + out.without.tones +
         ' without - the bake has no more to give, so these are put back rather than baked in');
  }

  S.ok('the tile lightens as much as it darkens', out.tile.balance > 0.8,
       'light-to-dark weight ratio ' + out.tile.balance +
       ' - unbalanced, the pass tints the whole map');

  S.ok('the tile wraps without a seam', out.tile.seamRatio < 1.6,
       'step across the wrap ' + out.tile.wrapStep + ' against ' + out.tile.interiorStep +
       ' inside, ratio ' + out.tile.seamRatio + ' (a tile that does not wrap shows several x)');

  S.ok('the pass is skipped where the ground is not magnified',
       out.gate.every(function (r) { return r.drew === (r.mag >= out.gateMin); }),
       'gate at ' + out.gateMin + 'x: ' + out.gate.map(function (r) {
         return r.mag + 'x ' + (r.drew ? 'drew' : 'skipped');
       }).join(', ') + ' - at dpr 2 the widest zoom is 1.0x and pays nothing');

  S.ok('the grain fits the frame budget', out.msWith < 16.7,
       out.msWith + ' ms a frame with it against ' + out.msWithout + ' without, a cost of ' +
       out.msCost + ' ms (overlay as a blend mode cost 7.06, soft-light 10.38)');

  S.ok('the tile is small', out.tile.kb <= 128, out.tile.size + ', ' + out.tile.kb + ' KB');
  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})();
