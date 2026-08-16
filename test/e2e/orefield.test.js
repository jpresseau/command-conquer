/* THE ORE FIELD, AND THE 3D MODE IT WAS PAINTING OVER.

   Ore is the largest single thing on a Red Alert map after the ground itself, and it carried
   five separate faults at once - four of them invisible to every other spec because they
   were all "the picture is worse than it should be" rather than "the game is wrong".

   DENSITY. RTS_PS was introduced so procedural art could be authored finer than Red Alert's
   locked 24px tile format, and it was applied to models.js and props.js - everything that
   stands up - and to nothing the ground is made of. So at max zoom on a 3x phone a building
   art pixel covered 9 device pixels of area while an ore art pixel covered 36: the ground was
   four times coarser than the tank parked on it. The fix is the whole point of a per-canvas
   `ps` tag, so the tag is asserted, not just the size.

   THE DEAD STAGE. The draw picked a density stage with `ore / RTS_SCRAP_TILE * 4`, but a cell
   is SEEDED with `RTS_SCRAP_TILE * RTS_ORE_RICHNESS`, and at richness 0.51 that means the
   richest cell on any map holds 255 of a nominal 500. The top stage therefore required ore
   that could not exist and a quarter of the artwork was unreachable - which also cost the
   depletion animation a quarter of its range. This is asserted as coverage of the stage set,
   because "the last stage is used" is the property, not any particular histogram.

   THE COLLAPSED VARIANT. Three anti-repetition variants were selected by `(tx*7 + tz*13) % 3`.
   Both 7 and 13 are 1 mod 3, so that expression IS `(tx + tz) % 3` - a diagonal ribbon on a
   three-cell lattice, which is a repeating pattern rather than a fix for one. The spec pins
   the property that survives a re-tuning: all variants get real use, and the choice is not a
   function of (tx + tz).

   THE SEAM. A tile is stamped per cell at a QUANTISED density, and the simulation tracks
   twelve ore levels per cell (RTS_ORE_LEVELS) while the artwork had four. Two neighbouring
   cells one step apart therefore met along a hard 48-pixel edge of different ground tone, and
   at the top zoom a worked field read as a grid of rectangles. Doubling the stages halves the
   size of a one-step difference; the spec measures the luminance step across columns that
   fall on a cell boundary against the step across columns that do not, from the INTERIOR of a
   field, because at a field's edge that step is supposed to be there.

   THE OVERLAY. Every other 2D world layer is gated on 3D being off - the terrain blit, the
   pads, the sprites, the shroud - and this loop was missed, so flat ore tiles were painted
   over the top of the ore crystals the 3D renderer had just drawn as real geometry. Measured
   before the fix, 77.2% of the composited frame differed from the GL buffer. That is most of
   the reason the 3D mode "looked exactly the same" as 2D, and it is asserted here rather than
   in r3dlive because the cause is 2D's draw order, not the 3D renderer. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('orefield');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 900, height: 650 });
  await g.start(7, 1);

  var out = await g.page.evaluate(function () {
    var o = {};
    rtsSetVoxSide('allied');
    _rtsNewGame(4242, 'easy');
    var G = window._rtsG, R = _rtsR, SP = R.spr;

    /* --- density: baked at RTS_PS and tagged, so the renderer can divide by it --- */
    var oc = SP.ore[0][0];
    o.oreW = oc.width; o.oreH = oc.height; o.orePs = oc.ps || 1;
    o.PS = RTS_PS; o.TS = RTS_TS;
    o.want = RTS_TS * RTS_PS;
    o.wavePs = SP.wave[0].ps || 1;
    o.waveW = SP.wave[0].width;

    /* --- what the RENDERER actually chooses, observed rather than recomputed ---

       An earlier cut of this spec worked out the stage and the variant itself from G.scrap
       and asserted on its own arithmetic. It passed - and went on passing when both fixes in
       render/frame.js were reverted, because the spec was never reading the renderer at all.
       So the canvases are identified BY IDENTITY as they are drawn: hook drawImage for one
       frame, look each image up in a map of every ore canvas, and recover the cell from the
       destination pixel (the draw is at round(_rtsSX(_rtsWX(tx) - RTS_TILE/2)), which inverts
       exactly). What this measures is the picture, not a copy of the source. */
    var nStages = SP.ore.length, nVariants = SP.ore[0].length;
    var ident = new Map();
    for (var st = 0; st < nStages; st++) {
      for (var v = 0; v < SP.ore[st].length; v++) ident.set(SP.ore[st][v], { st: st, v: v });
      for (var gv = 0; SP.gem && SP.gem[st] && gv < SP.gem[st].length; gv++) {
        ident.set(SP.gem[st][gv], { st: st, v: gv });
      }
    }
    R.zi = 0; R.cell = RTS_ZOOMS[0];              /* widest view = most cells per frame */
    var recs = [], orig = R.g.drawImage;
    var Q = RTS_N * RTS_TILE / 4;
    [-Q, 0, Q].forEach(function (fz) {
      [-Q, 0, Q].forEach(function (fx) {
        R.focus.x = fx; R.focus.z = fz;
        var batch = [];
        R.g.drawImage = function (img) {
          var hit = ident.get(img);
          if (hit) batch.push({ st: hit.st, v: hit.v, px: arguments[1], py: arguments[2] });
          return orig.apply(this, arguments);
        };
        _rtsRFrame(1 / 60);
        R.g.drawImage = orig;
        var zoom = R.cell / RTS_TILE;
        batch.forEach(function (b) {
          b.tx = Math.round(((b.px - R.W / 2) / zoom + R.focus.x) / RTS_TILE + RTS_N / 2);
          b.tz = Math.round(((b.py - R.H / 2) / zoom + R.focus.z) / RTS_TILE + RTS_N / 2);
          recs.push(b);
        });
      });
    });

    var sh = {}, vh = {}, diagonal = 0;
    recs.forEach(function (b) {
      sh[b.st] = (sh[b.st] || 0) + 1;
      vh[b.v] = (vh[b.v] || 0) + 1;
      if (b.v === (((b.tx + b.tz) % nVariants) + nVariants) % nVariants) diagonal++;
    });
    o.drawn = recs.length;
    o.nStages = nStages; o.nVariants = nVariants;
    o.stagesUsed = Object.keys(sh).length;
    o.stageHist = sh; o.varHist = vh;
    o.variants = Object.keys(vh).length;
    o.variantMin = o.variants ? Math.min.apply(null, Object.keys(vh).map(function (k) { return vh[k]; })) : 0;
    /* a variant rule congruent to (tx+tz)%n matches it for EVERY drawn cell; a hash matches
       about 1/n of them by chance */
    o.diagonalShare = recs.length ? +(diagonal / recs.length).toFixed(3) : 1;

    /* --- the overlay: what the player is shown must be what the GL renderer drew --- */
    R.zi = RTS_ZOOMS.length - 1; R.cell = RTS_ZOOMS[R.zi];
    /* THE INTERIOR of the biggest field, not the single richest cell. The richest cell is
       often on a field's edge, and a window centred there is half bare ground - which makes
       the seam measurement below report the boundary between ore and dirt, a step that is
       supposed to be there, instead of the boundary between one ore cell and the next. */
    var bestN = -1, bcx = 0, bcz = 0;
    for (var cz2 = 4; cz2 < RTS_N - 4; cz2++) {
      for (var cx2 = 4; cx2 < RTS_N - 4; cx2++) {
        var cnt = 0;
        for (var dz2 = -3; dz2 <= 3; dz2++) {
          for (var dx2 = -3; dx2 <= 3; dx2++) if (G.scrap[_rtsIdx(cx2 + dx2, cz2 + dz2)] > 0) cnt++;
        }
        if (cnt > bestN) { bestN = cnt; bcx = cx2; bcz = cz2; }
      }
    }
    o.fieldCells = bestN;
    var bi = bcz * RTS_N + bcx;
    R.focus.x = _rtsWX(bcx); R.focus.z = _rtsWX(bcz);
    for (var t = 0; t < 30; t++) _rtsTick(1 / 60);

    /* --- CELL SEAMS. Ore is stamped one tile per cell at a quantised density, so two
       neighbouring cells a step apart meet along a hard 48-pixel edge of different ground
       tone - the field reads as a grid of rectangles rather than as a deposit. The measure is
       the luminance step ACROSS columns that fall on a cell boundary against the step across
       columns that do not: a seamless field scores near 1, and every extra display stage
       halves the size of a one-step difference. Sampled with the camera already parked on the
       densest ore, so the whole window is field. */
    _rtsRFrame(1 / 60);
    var scv = document.getElementById('rtsCv'), sctx = scv.getContext('2d');
    var sd = sctx.getImageData(0, 0, scv.width, scv.height).data, SW = scv.width, SH = scv.height;
    var lum = function (x, y) { var p = (y * SW + x) * 4;
      return 0.299 * sd[p] + 0.587 * sd[p + 1] + 0.114 * sd[p + 2]; };
    var cellPx = R.cell * R.dpr;
    var ex0 = Math.round(_rtsSX(_rtsWX(bcx) - RTS_TILE / 2) * R.dpr);
    var eS = 0, eN = 0, iS = 0, iN = 0;
    for (var sx2 = 2; sx2 < SW - 2; sx2++) {
      var s2 = 0, n2 = 0;
      for (var sy2 = Math.round(SH * 0.3); sy2 < Math.round(SH * 0.7); sy2++) {
        s2 += Math.abs(lum(sx2, sy2) - lum(sx2 - 1, sy2)); n2++;
      }
      if (!n2) continue;
      if ((((sx2 - ex0) % cellPx) + cellPx) % cellPx === 0) { eS += s2 / n2; eN++; }
      else { iS += s2 / n2; iN++; }
    }
    o.edgeStep = +(eS / Math.max(1, eN)).toFixed(2);
    o.interiorStep = +(iS / Math.max(1, iN)).toFixed(2);
    o.seamRatio = +(o.edgeStep / Math.max(0.01, o.interiorStep)).toFixed(3);

    rts3dSet(true);
    o.on = !!(window._R3D && window._R3D.on);
    if (o.on) {
      _rtsRFrame(1 / 60);
      o.oreTris = window._R3D.oreMesh ? Math.round(window._R3D.oreMesh.verts / 3) : 0;
      var glc = window._R3D.cv, main = document.getElementById('rtsCv');
      var tmp = document.createElement('canvas');
      tmp.width = glc.width; tmp.height = glc.height;
      tmp.getContext('2d').drawImage(glc, 0, 0);
      var A = tmp.getContext('2d').getImageData(0, 0, tmp.width, tmp.height).data;
      var B = main.getContext('2d').getImageData(0, 0, main.width, main.height).data;
      var differ = 0, strong = 0, tot = A.length / 4;
      for (var p = 0; p < A.length; p += 4) {
        var d = Math.abs(A[p] - B[p]) + Math.abs(A[p + 1] - B[p + 1]) + Math.abs(A[p + 2] - B[p + 2]);
        if (d > 12) differ++;
        if (d > 60) strong++;
      }
      o.differ = +(100 * differ / tot).toFixed(1);
      o.strong = +(100 * strong / tot).toFixed(1);
      rts3dSet(false);
    }
    return o;
  });

  S.ok('ore is baked at the procedural density, not Red Alert\'s tile format',
       out.oreW === out.want && out.oreH === out.want,
       out.oreW + 'x' + out.oreH + ' art px per cell (want ' + out.want +
       ' = RTS_TS ' + out.TS + ' x RTS_PS ' + out.PS + ')');
  S.ok('...and carries the ps tag the renderer divides by', out.orePs === out.PS,
       'ps=' + out.orePs + ', RTS_PS=' + out.PS);
  S.ok('the water cycle is baked at the same density', out.waveW === out.want && out.wavePs > 1,
       out.waveW + 'px, ps=' + out.wavePs);

  S.ok('the renderer was observed drawing ore at all', out.drawn > 200,
       out.drawn + ' ore tiles drawn across nine camera positions');
  S.ok('every ore density stage actually reaches the screen',
       out.stagesUsed === out.nStages,
       out.stagesUsed + '/' + out.nStages + ' stages drawn ' + JSON.stringify(out.stageHist) +
       ' - dividing by the nominal cell capacity instead of the richness-scaled one leaves ' +
       'the top stage needing ore that cannot exist');

  S.ok('all three field variants get real use', out.variants === out.nVariants && out.variantMin > 0,
       out.variants + '/' + out.nVariants + ' variants drawn ' + JSON.stringify(out.varHist));
  S.ok('...and the variant is not a diagonal of the cell coordinates',
       out.diagonalShare < 0.6,
       out.diagonalShare + ' of drawn cells match (tx+tz)%n' +
       ' - an arithmetic rule congruent to it matches 1.0, a hash about ' +
       (1 / out.nVariants).toFixed(2));

  S.ok('the field does not break into per-cell rectangles',
       out.seamRatio < 2.0,
       out.fieldCells + '/49 cells of ore around the sample point; luminance step across ' +
       'cell boundaries ' + out.edgeStep + ' vs ' + out.interiorStep +
       ' inside a cell, ratio ' + out.seamRatio +
       ' - at four display stages it was 2.467 (20.26 vs 8.21)');

  S.ok('the 3D mode turns on for the overlay check', out.on, out.on ? 'on' : 'no WebGL');
  if (out.on) {
    S.ok('the 2D ore overlay does not paint over the 3D ore',
         out.differ < 5,
         out.differ + '% of composited pixels differ from the GL buffer (' + out.strong +
         '% strongly) - it was 77.2% / 50.0% while the tiles were drawn over ' +
         out.oreTris + ' crystal triangles');
  }
  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})();
