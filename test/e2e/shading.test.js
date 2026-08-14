/* TWO THINGS THAT WERE FLAT AND SAID THEY WERE NOT.

   THE DROP SHADOW. _sprShadow is the only object shadow anywhere in the 2D game - the ground
   has no lighting model that could cast one - so contact between a building and the dirt is
   entirely this one function. Its comment described a soft shadow; what it drew was a single
   offset copy of the silhouette filled flat black at 30%, which is a 1-BIT shape. Measured on
   the baked Construction Yard, the whole sprite contained exactly ONE partial alpha value,
   77 of 255, and nothing between it and either extreme. At the top zoom that is a dozen device
   pixels of hard black step beside every structure.

   The spec measures the alpha HISTOGRAM rather than looking for a blur, because "soft" is
   exactly the property a histogram states: a hard mask has one level, a penumbra has a spread.
   It also pins the core, because the cheap way to pass the first assertion is to make the whole
   shadow fainter, which would be a different regression rather than a fix.

   THE YARD'S CORRUGATED ROOF. Six slices of vault, alternating in colour - and only in colour.
   Every slice was the same width and the same height, so there was no corrugation in the model
   at all: it was six painted stripes on one smooth arch, and at the top zoom each is around
   sixty device pixels of flat tone with a hard edge, which reads as a staircase down the roof.
   There are fourteen now and alternate ribs are genuinely narrower and lower.

   It would be better to assert that directly against the geometry, and two attempts to do so
   were written and thrown away - see the note at the measurement. Both passed with the ribs
   mutated back to uniform, which makes them worse than no assertion: they would have reported
   a property the code did not have. What is asserted instead is what the corrugation exists
   to buy and what does separate the two models, tone density on the finished sprite. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('shading');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 800, height: 600 });
  await g.start(7, 1);

  var out = await g.page.evaluate(function () {
    var o = {};
    rtsSetVoxSide('allied');
    _rtsNewGame(4242, 'easy');
    var SP = _rtsR.spr;

    /* --- the shadow, as an alpha histogram over the biggest sprite in the game --- */
    var yc = SP.bld.player.yard.c;
    var d = yc.getContext('2d').getImageData(0, 0, yc.width, yc.height).data;
    var alphas = {}, partial = 0;
    for (var i = 0; i < d.length; i += 4) {
      var a = d[i + 3];
      if (a === 0 || a === 255) continue;      /* clear ground, or the opaque body */
      alphas[a] = (alphas[a] || 0) + 1;
      partial++;
    }
    var ks = Object.keys(alphas).map(Number).sort(function (x, y) { return x - y; });
    o.levels = ks.length;
    o.partialPx = partial;
    o.aMin = ks.length ? ks[0] : 0;
    o.aMax = ks.length ? ks[ks.length - 1] : 0;

    /* --- the ground decals must not be cut off square ---

       Scorch marks and craters are stamped PERMANENTLY into the baked terrain, so a shape
       fault in them is not a frame of bad art, it is a mark the battlefield keeps. Both were
       radial blobs whose cutoff was applied to a radius with a large noise term added, which
       let pixels out at the true canvas edge pass the test and be drawn - so the mark was
       clipped flat where it ran out of canvas. Measured, the scorches reached alpha 103 of 255
       on their own border and the crater 153, the latter because its alpha was a step (0.6 out
       to the cutoff) rather than a falloff. Under every firefight that left a hard dark
       RECTANGLE about a cell across.

       Border alpha is the whole property: a blob that fades out inside its canvas cannot have
       a straight edge, whatever shape the noise gives it. Coverage is checked alongside it
       because the cheap way to pass is to shrink the mark until there is nothing left. */
    function decalEdge(cv) {
      var dd = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
      var W2 = cv.width, H2 = cv.height, mx = 0, op = 0;
      for (var q = 0; q < dd.length; q += 4) if (dd[q + 3] >= 8) op++;
      for (var bx = 0; bx < W2; bx++) {
        mx = Math.max(mx, dd[bx * 4 + 3], dd[((H2 - 1) * W2 + bx) * 4 + 3]);
      }
      for (var by = 0; by < H2; by++) {
        mx = Math.max(mx, dd[(by * W2) * 4 + 3], dd[(by * W2 + W2 - 1) * 4 + 3]);
      }
      return { border: mx, coverage: +(100 * op / (W2 * H2)).toFixed(1) };
    }
    var scorches = SP.scorch.map(decalEdge);
    o.scorchBorder = Math.max.apply(null, scorches.map(function (s) { return s.border; }));
    o.scorchCover = Math.min.apply(null, scorches.map(function (s) { return s.coverage; }));
    var cr = decalEdge(SP.crater);
    o.craterBorder = cr.border; o.craterCover = cr.coverage;

    /* --- the corrugation, measured by what it BUYS ---

       NO GEOMETRY ASSERTION HERE, and that is deliberate. Two attempts at one were written and
       both were thrown away for passing when the ribs were mutated back to uniform. Counting
       the distinct |x| the vault reaches over a height band fails because the arch is a CURVE
       and supplies a dozen different |x| by itself; bucketing faces by centroid z to get a
       per-rib width fails because _r3Vault emits end caps at z0 and z1 as well as sides at the
       rib centre, and the roof vents are cylinders whose side quads each have their own
       centroid z - 62 buckets for 14 ribs. Both versions reported plausible-looking numbers
       and neither could tell the two models apart.

       Rather than tune a third one until it happens to discriminate, the property is asserted
       where it is unambiguous: tone density on the finished sprite, which is what the
       corrugation exists to raise and which DOES separate them - 16.0 per 1000 px against 14.9
       for colour-only ribs, and 14.6 for the six flat slices this replaced. A shape that
       catches the light differently shows up as tones; one that does not, does not. */
    var td = {}, opaque = 0;
    for (i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 8) continue;
      opaque++;
      td[d[i] + ',' + d[i + 1] + ',' + d[i + 2]] = 1;
    }
    o.yardTones = Object.keys(td).length;
    o.yardPx = opaque;
    o.per1000 = +(o.yardTones / Math.max(1, opaque) * 1000).toFixed(1);
    return o;
  });

  S.ok('the drop shadow has a penumbra, not one flat level',
       out.levels >= 5,
       out.levels + ' distinct partial-alpha levels across ' + out.partialPx +
       ' pixels, ' + out.aMin + '..' + out.aMax +
       ' (a 1-bit mask is exactly 1 level, and this was 77..77)');
  S.ok('...and it is no darker overall than the hard one it replaced',
       out.aMax >= 68 && out.aMax <= 92,
       'core alpha ' + out.aMax + ' of 255, against the 77 the flat shadow used' +
       ' - fading it would pass the test above for the wrong reason');

  S.ok('a scorch mark fades out before its canvas does',
       out.scorchBorder === 0,
       'worst border alpha across the six scorches: ' + out.scorchBorder +
       ' of 255 (it was 103, which is a burn with a straight edge)');
  S.ok('...and so does a crater', out.craterBorder === 0,
       'crater border alpha ' + out.craterBorder + ' of 255 (it was 153 - its alpha was a ' +
       'step, 0.6 all the way out to the cutoff)');
  S.ok('...and neither was simply shrunk away to pass that',
       out.scorchCover > 40 && out.craterCover > 40,
       'coverage: scorch ' + out.scorchCover + '%, crater ' + out.craterCover +
       '% of the tile (they were 61-76% and 60% with the clipped square included)');

  S.ok('the yard roof corrugation earns its keep in tone density',
       out.per1000 >= 15.5,
       out.per1000 + ' tones per 1000 px (' + out.yardTones + ' over ' + out.yardPx +
       ') - against 14.9 for ribs that differ only in colour, and 14.6 for the six flat ' +
       'slices before them');

  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})();
