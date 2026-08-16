/* THE FOREST.

   A CORRECTION AT THE TOP, because this spec shipped with a false premise. It was written to
   pin a fix for a forest that "was not being drawn at all" - a cell enclosed by forest
   measuring BRIGHTER than one enclosed by grass, 81.9 against 76.9, on the baked ground. That
   measurement was taken through a harness that called _rtsNewGame into a live renderer without
   re-baking the terrain, so it compared one map's paint against another map's cell grid. With
   that fixed (see the note at the end of _rtsNewGame) the old bake measures forest 74.4
   against grass 100.8, and 89 tones against 12. The one-tree-per-cell forest was legible. It
   was sparse and very regular, and that is all.

   What the change actually buys is quality: trees bake at RTS_PS rather than RTS_TS, two or
   three stand on a cell rather than one, and five variants replace three, so a wood stops
   being a lattice of identical cones. It costs 2.3-4.7 ms a frame that the baked version did
   not. It also removes a genuine double-draw - while the trees lived in the ground texture the
   3D mode drew them twice, flat ones underneath the conifers world3d.js grows from the same
   cells - and that one could not be fixed any other way, because a texture cannot be gated on
   the render mode the way a sprite pass can.

   The thresholds below are therefore about the CURRENT picture being a good forest, not about
   rescuing a missing one.

   IT MEASURES THE FRAME, NOT THE BAKE. "Is the forest in the terrain canvas" is now
   the wrong question - it deliberately is not. The question is whether a player looking at
   forest sees something different from a player looking at grass, and that is answered on the
   canvas the player is shown.

   It also pins the two things that would silently undo it: the 3D mode must NOT draw these
   sprites, because world3d.js grows real conifers from the same cells and until the trees left
   the bake the flat ones were sitting underneath them; and the per-cell count must fall as the
   camera pulls back, which is both what the picture wants and what bounds the cost. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('forest');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 900, height: 650, dpr: 2 });
  await g.start(7, 1);

  var out = await g.page.evaluate(function () {
    var o = {};
    rtsSetVoxSide('allied');
    _rtsNewGame(4242, 'easy');
    var G = window._rtsG, R = _rtsR, SP = R.spr, i;

    /* --- the sprites themselves --- */
    o.variants = SP.tree ? SP.tree.length : 0;
    o.treePs = SP.tree && SP.tree[0].c.ps || 1;
    o.PS = RTS_PS;
    o.treeW = SP.tree ? SP.tree[0].c.width : 0;

    /* reveal the map so the shroud is not what is being measured */
    for (i = 0; i < RTS_N * RTS_N; i++) { G.mapped[i] = 1; G.vis[i] = 1; }
    G.visDirty = 1;

    /* --- find a solid block of each, big enough to fill a sample window --- */
    function solid(kind) {
      for (var tz = 6; tz < RTS_N - 6; tz++) {
        for (var tx = 6; tx < RTS_N - 6; tx++) {
          var all = true;
          for (var dz = -2; dz <= 2 && all; dz++) {
            for (var dx = -2; dx <= 2; dx++) {
              if (G.terrain[_rtsIdx(tx + dx, tz + dz)] !== kind) { all = false; break; }
            }
          }
          if (all) return [tx, tz];
        }
      }
      return null;
    }
    var fc = solid(RTS_T_TREE), gc = solid(RTS_T_GRASS);
    o.haveBoth = !!(fc && gc);
    if (!o.haveBoth) return o;

    R.zi = RTS_ZOOMS.length - 1; R.cell = RTS_ZOOMS[R.zi];
    var cv = document.getElementById('rtsCv'), ctx = cv.getContext('2d');
    /* Sample the SCREEN over each patch: park the camera on it, read the middle of the view.
       A window of three cells keeps the sample inside the solid block at every zoom. */
    function look(cellXZ) {
      R.focus.x = _rtsWX(cellXZ[0]); R.focus.z = _rtsWX(cellXZ[1]);
      _rtsRFrame(1 / 60);
      var half = Math.round(1.5 * R.cell * R.dpr);
      var d = ctx.getImageData(Math.round(cv.width / 2) - half, Math.round(cv.height / 2) - half,
                               half * 2, half * 2).data;
      var tones = {}, s = 0, n = 0, vals = [];
      for (var p = 0; p < d.length; p += 4) {
        tones[d[p] + ',' + d[p + 1] + ',' + d[p + 2]] = 1;
        var L = 0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2];
        s += L; n++; vals.push(L);
      }
      var mean = s / n, v = 0;
      for (i = 0; i < vals.length; i++) v += (vals[i] - mean) * (vals[i] - mean);
      return { tones: Object.keys(tones).length, mean: +mean.toFixed(1),
               sd: +Math.sqrt(v / n).toFixed(2), px: n };
    }
    o.forest = look(fc);
    o.grass = look(gc);

    /* --- the per-cell count falls as the camera pulls back --- */
    function stamps() {
      var n = 0, orig = R.g.drawImage;
      var set = {};
      if (SP.tree) for (i = 0; i < SP.tree.length; i++) set[i] = SP.tree[i].c;
      R.g.drawImage = function (img) {
        for (var k in set) if (set[k] === img) { n++; break; }
        return orig.apply(this, arguments);
      };
      _rtsRFrame(1 / 60);
      R.g.drawImage = orig;
      return n;
    }
    R.focus.x = _rtsWX(fc[0]); R.focus.z = _rtsWX(fc[1]);
    o.perZoom = [];
    for (var zi = 0; zi < RTS_ZOOMS.length; zi++) {
      R.zi = zi; R.cell = RTS_ZOOMS[zi];
      /* forest cells actually in range, so the ratio is per-cell not per-screen */
      var z = _rtsZoom();
      var ax0 = Math.max(0, _rtsTX(R.focus.x - R.W / 2 / z) - 1);
      var ax1 = Math.min(RTS_N - 1, _rtsTX(R.focus.x + R.W / 2 / z) + 1);
      var az0 = Math.max(0, _rtsTX(R.focus.z - R.H / 2 / z) - 2);
      var az1 = Math.min(RTS_N - 1, _rtsTX(R.focus.z + R.H / 2 / z) + 2);
      var cells = 0;
      for (var a = az0; a <= az1; a++) {
        for (var b = ax0; b <= ax1; b++) if (G.terrain[_rtsIdx(b, a)] === RTS_T_TREE) cells++;
      }
      var st = stamps();
      o.perZoom.push({ cell: RTS_ZOOMS[zi], cells: cells, stamps: st,
                       perCell: cells ? +(st / cells).toFixed(2) : 0 });
    }

    /* --- 3D must not draw them: it grows its own --- */
    R.zi = RTS_ZOOMS.length - 1; R.cell = RTS_ZOOMS[R.zi];
    rts3dSet(true);
    o.on = !!(window._R3D && window._R3D.on);
    if (o.on) { o.stamps3d = stamps(); rts3dSet(false); }
    o.stamps2d = stamps();
    return o;
  });

  S.ok('the forest has more than one tree to choose from', out.variants >= 5,
       out.variants + ' tree variants');
  S.ok('trees bake at the procedural density, not the ground canvas\'s', out.treePs === out.PS,
       'ps=' + out.treePs + ' (RTS_PS ' + out.PS + '), ' + out.treeW + ' art px wide');
  S.ok('the map offers a solid block of each to compare', out.haveBoth,
       out.haveBoth ? 'found both' : 'no solid 5x5 of forest and grass on this seed');

  if (out.haveBoth) {
    /* Forest is a canopy: it must be clearly DARKER than open grass and carry more structure.
       That was true of the one-tree-per-cell bake too - the claim that it was not is corrected
       at the top of this file - so this is a floor on the picture staying good, not evidence
       that it was ever broken. */
    S.ok('a forest looks different from a lawn',
         out.forest.mean < out.grass.mean - 12,
         'mean luminance forest ' + out.forest.mean + ' vs grass ' + out.grass.mean +
         ' (the one-tree-per-cell bake measured 74.4 vs 100.8 - also a forest, just a sparser ' +
         'and more regular one)');
    /* Tones, not spread. Spread came out 14.88 against 14.76 - all but a tie, because an open
       patch with one dirt scar in it has as wide a luminance range as a canopy. What separates
       a wood from a lawn is how many DIFFERENT surfaces are in it, and there the two are not
       close: shaded needles, lit needles, trunk, cast shadow and the ground between them
       against a handful of ground tones. */
    /* THERE IS NO SECOND ASSERTION HERE, AND THAT IS THE FINDING.

       This used to also claim a forest "carries far more structure" than a lawn, graded as
       three times the distinct tone count - which held easily while the ground was nearly
       flat: 89 tones against 12. The ground now carries a detail grain of its own
       (render/detail.js), applied equally to every surface, and two replacement metrics were
       written and both deleted for failing to separate the two patches:

         - tone count, per pixel: 2861 against 1115, a ratio of 2.6 and falling, because the
           grain contributes about a thousand tones to ANY patch and a ratio between two
           numbers dominated by a shared term tends to 1.
         - tone count after 4x4 averaging, to cancel the grain: 1301 against 1022, WORSE.
           Averaging sixteen samples divides the grain's sigma by four, it does not remove it,
           and across thousands of blocks that is still enough to saturate the tone space.
         - luminance spread, at every blur radius from 1 to 16 pixels: forest 13.93/13.36/
           12.48/10.75 against grass 17.28/16.51/15.03/12.21. The grass patch scores HIGHER at
           every scale, because it contains a dirt scar and a dirt scar is a larger tonal event
           than a canopy. The original spec already conceded this one was "nearly a tie"; with
           the grain in it is inverted.

       So the claim is not supportable by any measure tried, and a metric that ranks a lawn
       above a wood is worse than no metric. What genuinely separates them is LUMINANCE - a
       canopy is dark - and that is asserted above with a 25-point margin against a 12-point
       threshold. One honest assertion beats two flattering ones. */

    S.ok('the trees thin out as the camera pulls back',
         out.perZoom[0].perCell < out.perZoom[2].perCell,
         out.perZoom.map(function (p) {
           return p.cell + 'px:' + p.perCell + '/cell (' + p.stamps + ' stamps)';
         }).join('  '));

    S.ok('the 3D mode grows its own and skips these', out.on && out.stamps3d === 0,
         out.on ? (out.stamps3d + ' flat trees drawn in 3D, ' + out.stamps2d + ' in 2D')
                : 'no WebGL to check');
  }
  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})();
