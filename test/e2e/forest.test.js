/* THE FOREST, WHICH WAS NOT ONE.

   A quarter of every generated map is RTS_T_TREE, and until the trees came out of the terrain
   bake that quarter was drawn as mottled green. The measurement that found it compares a cell
   entirely enclosed by forest against one entirely enclosed by grass, on the finished bake:
   60 tones against 74, mean luminance 81.9 against 76.9. The forest was BRIGHTER than bare
   grass, over a narrower range - which is what "the trees are not really there" looks like as
   a number.

   The arithmetic behind it: one sprite per cell, 24 art pixels wide against a 24-pixel cell,
   289 of its 816 pixels opaque, jittered by up to eight pixels so each tree half-leaves its
   own cell. Canopy coverage lands near a third, and a third of a canopy over grass is grass.

   It could not be fixed where it was. The terrain canvas is RTS_N * RTS_TS = 3072 square and
   cannot double - 6144 square is 144 MB of RGBA, a dead tab on a phone - so a tree stamped
   into it is capped at Red Alert's tile density however good the sprite is. Drawn per frame
   the tree is an ordinary sprite: RTS_PS like every other model, several to a cell.

   SO THE SPEC MEASURES THE FRAME, NOT THE BAKE. "Is the forest in the terrain canvas" is now
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
    rts3dToggle();
    o.on = !!(window._R3D && window._R3D.on);
    if (o.on) { o.stamps3d = stamps(); rts3dToggle(); }
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
    /* The defect was that these two were the same picture. Forest is a canopy: it must be
       clearly DARKER than open grass, and carry more structure. */
    S.ok('a forest looks different from a lawn',
         out.forest.mean < out.grass.mean - 12,
         'mean luminance forest ' + out.forest.mean + ' vs grass ' + out.grass.mean +
         ' (it used to be 81.9 vs 76.9 - the forest was BRIGHTER)');
    /* Tones, not spread. Spread came out 14.88 against 14.76 - all but a tie, because an open
       patch with one dirt scar in it has as wide a luminance range as a canopy. What separates
       a wood from a lawn is how many DIFFERENT surfaces are in it, and there the two are not
       close: shaded needles, lit needles, trunk, cast shadow and the ground between them
       against a handful of ground tones. */
    S.ok('...and carries far more structure, not less',
         out.forest.tones > out.grass.tones * 3,
         'distinct tones forest ' + out.forest.tones + ' vs grass ' + out.grass.tones +
         ' (spread is nearly a tie at ' + out.forest.sd + ' vs ' + out.grass.sd +
         ', which is why it is not the measure)');

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
