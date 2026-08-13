/* THE GROUND, WHICH IS MOST OF EVERY FRAME AND HAD NO LIGHTING MODEL AT ALL.

   Two faults, both of them "the picture is worse than it needs to be" rather than "the game is
   wrong", which is why nothing else caught them.

   THE 2px BLOCK. `_rtsBakeTerrain` painted in 2x2 blocks. That was correct when the grain was a
   white-noise hash and the block was there to stop it reading as television snow - but the
   grain became a smooth ~7px `_sprVN` field, which does that job properly, and the block stayed
   behind quantising everything laid on top of it. The result was a 12x12 effective texel per
   cell in a canvas with room for 24x24: half the ground detail thrown away for a reason that
   had stopped applying. It costs no memory to fix, because the canvas is the same size either
   way - only bake time.

   Asserted as a SIGNATURE rather than as a constant. A 2px-quantised image has two tells: a
   very high share of horizontally adjacent pixels that are byte-identical, and a run-length
   histogram that peaks on even lengths. Both were measured on the finished bake before the fix
   (92.7% identical inside a block against 61.6% across a boundary; run 2 at 17020 against run 3
   at 1096) and both are checked here, so a future change that reintroduces block painting by
   any route fails - not just a change to one named constant.

   NO LIGHT ON THE GROUND. Eight flat tones indexed off noise, measured at a p05-to-p95
   luminance span of 39.8 points, under buildings whose own ramp spans 171.5. Objects had form
   and the surface they stood on did not. `_sprFbm` is already a height field, so its gradient
   is a surface normal and the shading is a dot product against the same upper-left light the
   sprite shadows are cast from - free, because the two samples the gradient needs are the
   previous pixel and one cached row.

   The spec measures the BAKED CANVAS, which is what both renderers read: the 2D path blits it
   and the 3D path uploads it as the ground texture. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('ground');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 900, height: 650 });
  await g.start(7, 1);

  var out = await g.page.evaluate(function () {
    rtsSetVoxSide('allied');
    _rtsNewGame(4242, 'easy');
    var R = _rtsR, o = {};
    o.side = R.terrain.width;

    /* A patch of open ground, sampled off the baked canvas at 1:1. Away from the spawn so it
       is grass and dirt rather than concrete pads and buildings. */
    var W = 480, c = document.createElement('canvas');
    c.width = W; c.height = W;
    var cc = c.getContext('2d');
    cc.imageSmoothingEnabled = false;
    cc.drawImage(R.terrain, 1400, 1400, W, W, 0, 0, W, W);
    var D = cc.getImageData(0, 0, W, W).data;
    function lum(i) { return 0.2126 * D[i] + 0.7152 * D[i + 1] + 0.0722 * D[i + 2]; }

    /* the block signature: identical-adjacent share, and the run-length histogram */
    var runs = {}, same = 0, pairs = 0, tones = {}, x, y;
    for (y = 0; y < W; y++) {
      var run = 1;
      for (x = 1; x < W; x++) {
        var a = (y * W + x) * 4, b = (y * W + x - 1) * 4;
        var eq = D[a] === D[b] && D[a + 1] === D[b + 1] && D[a + 2] === D[b + 2];
        pairs++;
        if (eq) { same++; run++; } else { runs[run] = (runs[run] || 0) + 1; run = 1; }
      }
      runs[run] = (runs[run] || 0) + 1;
    }
    o.identicalAdjacent = +(100 * same / pairs).toFixed(1);
    o.run2 = runs[2] || 0; o.run3 = runs[3] || 0;
    o.run4 = runs[4] || 0; o.run5 = runs[5] || 0;
    /* even-run dominance: 2px quantisation makes runs 2 and 4 tower over 3 and 5 */
    o.evenBias = +(((o.run2 + o.run4) / Math.max(1, o.run3 + o.run5))).toFixed(2);

    var L = [];
    for (var i = 0; i < D.length; i += 4) { tones[D[i] + ',' + D[i + 1] + ',' + D[i + 2]] = 1; L.push(lum(i)); }
    L.sort(function (p, q) { return p - q; });
    o.tones = Object.keys(tones).length;
    o.p05 = +L[(L.length * 0.05) | 0].toFixed(1);
    o.p95 = +L[(L.length * 0.95) | 0].toFixed(1);
    o.span = +(o.p95 - o.p05).toFixed(1);

    /* the buildings' own span, as the standard the ground is being held to */
    var yard = _rtsHas('player', 'yard');
    var bs = yard && R.spr.bld.player.yard && R.spr.bld.player.yard.c;
    if (bs) {
      var bc = document.createElement('canvas');
      bc.width = bs.width; bc.height = bs.height;
      bc.getContext('2d').drawImage(bs, 0, 0);
      var BD = bc.getContext('2d').getImageData(0, 0, bs.width, bs.height).data;
      var BL = [];
      for (var j = 0; j < BD.length; j += 4) {
        if (BD[j + 3] < 200) continue;
        BL.push(0.2126 * BD[j] + 0.7152 * BD[j + 1] + 0.0722 * BD[j + 2]);
      }
      BL.sort(function (p, q) { return p - q; });
      o.bldSpan = BL.length
        ? +(BL[(BL.length * 0.95) | 0] - BL[(BL.length * 0.05) | 0]).toFixed(1) : 0;
    }
    return o;
  });

  S.ok('the ground is painted per pixel, not in 2px blocks',
       out.identicalAdjacent < 80,
       out.identicalAdjacent + '% of horizontally adjacent pixels are identical' +
       ' - it was 92.7% inside a block while the bake quantised to 2px');
  S.ok('...and its run lengths do not favour even numbers',
       out.evenBias < 2.6,
       'runs 2+4 = ' + (out.run2 + out.run4) + ' against 3+5 = ' + (out.run3 + out.run5) +
       ' (ratio ' + out.evenBias + '); 2px quantisation measured 17020 against 1096');

  S.ok('the ground carries light and shade, not one flat tone per noise band',
       out.span > 60,
       'luminance p05 ' + out.p05 + ' -> p95 ' + out.p95 + ' = ' + out.span +
       ' points, against ' + out.bldSpan + ' for the construction yard standing on it' +
       ' (the unlit ground measured 39.8)');
  S.ok('...spent on real tones rather than a handful of bands',
       out.tones > 40, out.tones + ' distinct ground tones in the sample');

  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})();
