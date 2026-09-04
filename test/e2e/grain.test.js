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

   AND IT MUST BE AFFORDABLE. `overlay` is the natural blend for grain and the expensive one.
   The tile encodes lighten-or-darken in its own colour and strength in its alpha instead, so
   the composite is a plain source-over.

   THAT IS MEASURED HERE RATHER THAN REMEMBERED, and the difference matters. This used to assert
   that a whole frame came in under 16.7 ms, and quote 7.06 ms for overlay and 10.38 for
   soft-light from a comment. Both were claims about a machine, not about the grain: three runs
   of identical code measured the frame at 18.96, 14.88 and 11.10 ms and the bar sat inside that
   spread, so the spec failed a run in which nothing had changed. What the spec asks now is what
   the pass costs RELATIVE to the frame the game draws anyway, and how that compares to the
   blend mode it exists to avoid - both priced in the same run, seconds apart, through the
   RTS_DETAIL_OP seam. Across seven runs, four of them with the box deliberately loaded, those
   came out at 45-49% and 1.80-2.00x. (The live overlay figure, 5.45-7.71 ms, does corroborate
   the 7.06 the comment remembered.) */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('grain');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 393, height: 852, dpr: 3 });
  await g.start(7, 1);

  /* A SECOND PAGE, IN 3D. This spec's own page is 2D on purpose - everything above measures
     the drawImage path and its canvas - so the 3D half gets its own rather than toggling the
     renderer under a page whose measurements have already been taken. */
  var g3d = await openPage(browser, { width: 900, height: 640, dpr: 1 });
  await g3d.start(7, 20, { freeze: true, mode3d: true });

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

    /* --- cost, in a real frame at the zoom that needs it ---

       MEASURED AGAINST ITSELF. This used to assert a whole frame came in under 16.7 ms, which
       is a claim about whatever machine happens to be running the suite rather than about the
       grain: three runs of identical code measured 18.96, 14.88 and 11.10 ms, and the bar sat
       inside that spread, so the spec failed a run that had changed nothing. What is stable is
       what the pass costs RELATIVE to the frame the game draws anyway - 0.53, 0.52 and 0.46
       across those same three runs - and how it compares to the blend mode it exists to avoid.

       The three are interleaved rather than run in three blocks: the box drifts over the tens
       of seconds this takes, and whichever went last would carry the drift on its own. */
    R.zi = RTS_ZOOMS.length - 1; _rtsApplyCam();
    function bench(m) {
      var t0 = performance.now();
      for (var q = 0; q < m; q++) _rtsRFrame(1 / 60);
      return performance.now() - t0;
    }
    var keepMag = RTS_DETAIL_MIN_MAG, keepOp = RTS_DETAIL_OP;
    var ROUNDS = 9, M = 10, rounds = [];
    bench(6);                                                    /* warm */
    for (var rd = 0; rd < ROUNDS; rd++) {
      RTS_DETAIL_MIN_MAG = keepMag; RTS_DETAIL_OP = keepOp;
      var wi = bench(M) / M;
      RTS_DETAIL_MIN_MAG = 1e9;                                  /* the pass gated off entirely */
      var wo = bench(M) / M;
      /* ...and the same pass through the blend mode it was written to avoid. RTS_DETAIL_OP is
         a seam for exactly this: the alternative is priced here, on this machine, in this run,
         instead of being quoted from a comment. */
      RTS_DETAIL_MIN_MAG = keepMag; RTS_DETAIL_OP = 'overlay';
      var ov = bench(M) / M;
      rounds.push({ wi: wi, wo: wo, ov: ov });
    }
    RTS_DETAIL_MIN_MAG = keepMag; RTS_DETAIL_OP = keepOp;

    /* MEDIAN OF PER-ROUND RATIOS, not a ratio of pooled means. A round is a tenth of a second
       of SwiftShader and any one of them can be swallowed by something else on the box; pooled,
       a single bad round moves the answer, and the pooled version of this measured a cost
       between 3.15 and 4.98 ms across four runs of identical code. The median throws that round
       away instead. */
    function med(f) {
      var v = rounds.map(f).sort(function (a, b) { return a - b; });
      return v[v.length >> 1];
    }
    o.msWith = +med(function (r) { return r.wi; }).toFixed(2);
    o.msWithout = +med(function (r) { return r.wo; }).toFixed(2);
    o.msOverlay = +med(function (r) { return r.ov; }).toFixed(2);
    o.msCost = +med(function (r) { return r.wi - r.wo; }).toFixed(2);
    o.msOverCost = +med(function (r) { return r.ov - r.wo; }).toFixed(2);
    o.share = +med(function (r) { return (r.wi - r.wo) / r.wo; }).toFixed(3);
    o.vsOverlay = +med(function (r) { return (r.ov - r.wo) / (r.wi - r.wo); }).toFixed(2);
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

  S.ok('the grain costs less than the frame it is added to', out.share < 0.75,
       'a frame is ' + out.msWithout + ' ms without it and ' + out.msWith + ' ms with, so the ' +
       'pass costs ' + out.msCost + ' ms — ' + (100 * out.share).toFixed(0) + '% of what the ' +
       'game draws anyway');

  /* THE DESIGN DECISION, priced rather than remembered. The tile carries lighten-or-darken in
     its own colour so the composite can be a plain fill; if it ever needs a blend mode again,
     this is what that costs. */
  S.ok('...and materially less than the blend mode it exists to avoid', out.vsOverlay >= 1.4,
       'through `overlay` the same pass costs ' + out.msOverCost + ' ms against ' + out.msCost +
       ' — ' + out.vsOverlay + 'x');

  /* A clock reading kept as a backstop against a total collapse, set clear of the measured
     envelope rather than at a phone budget headless Chromium cannot represent - the same shape
     e2e/resolution settled on for the same reason. With-grain frames measured 9.8 to 14.4 ms
     across seven runs here, so this fires only on something an order of magnitude wrong. */
  S.ok('...and the frame has not collapsed outright', out.msWith < 45,
       out.msWith + ' ms a frame; measured 9.8-14.4 across seven runs, four of them loaded');

  S.ok('the tile is small', out.tile.kb <= 128, out.tile.size + ', ' + out.tile.kb + ' KB');
  /* ---------------------------------------------------- and the same in 3D ----
     The line that calls _rtsGroundDetail sits inside `if (!r3on)` in render/frame.js, because
     the 3D ground is a GL program and not a drawImage. So everything above was true of the 2D
     renderer and the 3D one had no grain at all - which nobody noticed while its closest zoom
     was 48 pixels a cell, and which is the first thing you see two rungs further in.

     The tile is the same tile, sampled in the ground's fragment shader (R3D_TEX_FS). What is
     graded here is different, though, and deliberately: the 2D measurement above is the RUN
     LENGTH of one colour, which works because a magnified drawImage really does produce flat
     blocks. The 3D ground is shaded per pixel - relief, shadow, the sun's lean - so its runs
     are one pixel long whether the grain is there or not, and a run-length test would pass on
     a frame with no grain in it at all. What magnification actually costs there is fine
     variation, so that is what is counted. */
  var three = await g3d.page.evaluate(function () {
    var G = window._rtsG, R = _rtsR, R3 = window._R3D, gl = R3.gl;
    for (var j = G.ents.length - 1; j >= 0; j--)
      if (G.ents[j].type === 'unit') { delete G.byId[G.ents[j].id]; G.ents.splice(j, 1); }
    G.fx.length = 0;
    if (G.proj) G.proj.length = 0;
    if (G.mapped) G.mapped.fill(1);
    if (G.vis) G.vis.fill(1);
    G.visDirty = 1;
    R.focus.x = _rtsWX(64); R.focus.z = _rtsWX(64);
    function look() {
      _rtsRFrame(1 / 60); _rtsRFrame(1 / 60);
      var W = R3.cv.width, H = R3.cv.height, buf = new Uint8Array(W * H * 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      var tones = {}, step = 0, n = 0;
      for (var y = (H >> 2); y < (H >> 1); y += 2) {
        for (var x = 10; x < W - 11; x++) {
          var q = (y * W + x) * 4;
          if (buf[q] + buf[q + 1] + buf[q + 2] < 30) continue;
          tones[(buf[q] << 16) | (buf[q + 1] << 8) | buf[q + 2]] = 1;
          step += Math.abs(buf[q] - buf[q + 4]) + Math.abs(buf[q + 1] - buf[q + 5]) +
                  Math.abs(buf[q + 2] - buf[q + 6]);
          n++;
        }
      }
      return { tones: Object.keys(tones).length, step: n ? +(step / n).toFixed(3) : 0 };
    }
    R.zi = RTS_ZOOMS.length - 1; _rtsApplyCam();       /* the closest rung 3D offers */
    var on = look();
    var keep = RTS_DETAIL_MIN_MAG;
    window.RTS_DETAIL_MIN_MAG = 1e9;                   /* the pass gated off entirely */
    var off = look();
    window.RTS_DETAIL_MIN_MAG = keep;
    /* THE GATE, READ RATHER THAN INFERRED. Turning it off through RTS_DETAIL_MIN_MAG is how
       the two frames above are compared, so the same knob cannot also be the evidence that the
       gate works - a mutation that removed the threshold entirely made "with" and "without"
       identical and would have slipped past a test phrased that way. _r3dGrainSet returns the
       magnification it decided on, and zero when it decided not to draw. */
    R.zi = RTS_ZOOMS.length - 1; _rtsApplyCam();
    _rtsRFrame(1 / 60);
    var magClose = R3.grainMag;
    R.zi = 0; _rtsApplyCam();
    _rtsRFrame(1 / 60);
    var magWide = R3.grainMag;
    var wide = look();
    return { on: on, off: off, wide: wide, magClose: magClose, magWide: magWide,
             gate: RTS_DETAIL_MIN_MAG, cell: RTS_ZOOMS[RTS_ZOOMS.length - 1] };
  });

  S.ok('the 3D ground carries the grain too, at the zoom that needs it',
       three.on.step > three.off.step * 1.4,
       'neighbouring pixels differ by ' + three.on.step + ' with the pass and ' +
       three.off.step + ' without, at ' + three.cell + ' css px per cell');
  S.ok('...and far more distinct tones with it', three.on.tones > three.off.tones * 1.3,
       three.on.tones + ' tones against ' + three.off.tones);
  S.ok('...and it is skipped where the ground is not magnified',
       three.magWide === 0 && three.magClose >= three.gate,
       'the ground magnifies ' + three.magClose + 'x at the closest rung and the pass runs; at ' +
       'the widest it reports ' + three.magWide + ' and does not, against a gate of ' + three.gate);

  await g3d.close();

  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})();
