/* THE FOREST IS SHAPE, NOT COUNT.

   The 3D world's forest was 74% of the entire map's triangle budget - 773,848 of 1,049,608 on
   seed 4242 - and what it bought was a field of identical smooth cones. Every tree was a stack
   of _r3Cone tiers on a trunk, which makes it a surface of revolution: perfectly circular in
   plan, two straight lines in profile, and the same outline ten thousand times over. Worse, the
   tiers were INVISIBLE. Each cone's base sat inside the flare of the one below it, so the
   seventy-odd triangles a tree spent on tier structure resolved on screen to one smooth cone.
   Three quarters of the map's geometry was drawing a shape a tenth of it could have drawn.

   THIS SPEC HOLDS THE TRADE THAT REPLACED IT, and the trade is the claim: fewer trees, each
   worth roughly twice the geometry, at a total that does not move. Every assertion below fails
   against the stacked-cone tree, and the first one fails at its theoretical extreme - a surface
   of revolution has EXACTLY one silhouette radius per height, so its sector ratio is 1.000 and
   no threshold has to be argued about.

   WHY THE OUTLINE IS MEASURED IN PLAN AND NOT IN PROFILE. "Is the canopy ragged" asked of a
   side view is answered by the tier count as much as by the raggedness, and a stack of cones
   has a perfectly good sawtooth profile. Asked of the plan view it is answered by exactly one
   thing: whether the canopy's radius depends on the angle you look from. A cone's does not, at
   any segment count - a 64-sided cone is still a cone - which is the whole reason the rebuild
   is about jitter and whorls rather than about spending more sides.

   IT CALLS THE REAL BUILDER. _r3dTree is the function world3d.js runs over every forest cell on
   the map; the trees measured here are built by it, at cell coordinates taken off the real
   terrain, so a spec that passed while the map grew something else is not available. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('canopy');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 900, height: 650, dpr: 1 });
  await g.start(7, 1);

  var out = await g.page.evaluate(function () {
    var o = {}, i;
    rtsSetVoxSide('allied');
    _rtsNewGame(4242, 'easy');
    var G = window._rtsG, R = _rtsR;
    for (i = 0; i < RTS_N * RTS_N; i++) { G.mapped[i] = 1; G.vis[i] = 1; }
    G.visDirty = 1;

    rts3dSet(true);
    var R3 = window._R3D;
    o.on = !!(R3 && R3.on);
    if (!o.on) return o;
    /* a real frame first: the world and ore batches are built by _r3dWorldTick off the frame
       walk, and reading R3.oreMesh before one has run reports a map with no ore in it */
    _rtsRFrame(1 / 60);

    /* ---------- 1. the trees themselves, off the real builder ---------- */
    var SECT = 16, LIFT = 3.5;
    var trees = [], cells = 0, worstLift = 0, worstSpan = 0;
    for (var tz = 0; tz < RTS_N && trees.length < 400; tz++) {
      for (var tx = 0; tx < RTS_N && trees.length < 400; tx++) {
        if (G.terrain[_rtsIdx(tx, tz)] !== RTS_T_TREE) continue;
        cells++;
        if (cells % 7) continue;                     /* spread the sample over the whole map */
        var f = [];
        _r3dTree(f, 0, 0, tx, tz, 0);
        var tris = 0, hi = 0, lo = 1e9;
        for (i = 0; i < f.length; i++) { tris += f[i].v.length - 2; }
        /* the canopy is everything clear of the trunk: no trunk in this file reaches 0.7
           world units, and no canopy ring starts inside one */
        var sect = [], wideR = 0, wideY = 0;
        for (i = 0; i < SECT; i++) sect.push(-1);
        for (i = 0; i < f.length; i++) {
          var v = f[i].v;
          for (var j = 0; j < v.length; j++) {
            var p = v[j], r = Math.hypot(p[0], p[2]);
            if (p[1] > hi) hi = p[1];
            if (p[1] < lo) lo = p[1];
            if (r < 0.7) continue;
            var a = Math.atan2(p[2], p[0]);
            var si = Math.floor((a + Math.PI) / (Math.PI * 2) * SECT) % SECT;
            if (r > sect[si]) sect[si] = r;
            if (r > wideR) { wideR = r; wideY = p[1]; }
          }
        }
        var mn = 1e9, mx = 0, filled = 0;
        for (i = 0; i < SECT; i++) {
          if (sect[i] < 0) continue;
          filled++;
          if (sect[i] < mn) mn = sect[i];
          if (sect[i] > mx) mx = sect[i];
        }
        if (filled < 8 || hi <= 0) continue;

        /* STANDING THE TREE ON A SLOPE IS A TRANSLATION, and nothing else. _r3dLiftFrom walks
           the faces a cell emitted and adds the terrain height to each vertex it reaches - so
           a builder that lets two faces share one vertex array has that vertex lifted twice,
           four times, or once per face of a fan. It is invisible on flat ground and invisible
           in any count, and forest3d.js shipped it twice while being written: a crown apex
           shared by sixteen fan triangles grew green spires several map-heights tall, and a
           whorl ring shared by two quads deformed the tree by 1.6 units under the 3.5-unit
           lift below - on high ground only, where relief reaches five. Read every y, lift,
           read them again: a translation moves all of them by exactly the same amount and
           changes the tree's height not at all. */
        var pre = [], post = [], k, lo2 = 1e9, hi2 = -1e9;
        for (i = 0; i < f.length; i++)
          for (var j2 = 0; j2 < f[i].v.length; j2++) pre.push(f[i].v[j2][1]);
        _r3dLiftFrom(f, 0, LIFT);
        for (i = 0; i < f.length; i++)
          for (var j3 = 0; j3 < f[i].v.length; j3++) {
            var yy = f[i].v[j3][1];
            post.push(yy);
            if (yy < lo2) lo2 = yy;
            if (yy > hi2) hi2 = yy;
          }
        for (k = 0; k < pre.length; k++)
          worstLift = Math.max(worstLift, Math.abs(post[k] - pre[k] - LIFT));
        worstSpan = Math.max(worstSpan, Math.abs((hi2 - lo2) - (hi - lo)));

        trees.push({ tris: tris, h: hi, ratio: mn / mx, filled: filled,
                     /* where the canopy is widest, as a share of the tree's height: a
                        whorled conifer is widest at its lowest whorl, a broadleaf halfway up
                        a crown that sits on a bare stem */
                     wide: wideY / hi });
      }
    }
    o.sampled = trees.length;
    o.worstLift = +worstLift.toFixed(6);
    o.worstSpan = +worstSpan.toFixed(6);
    o.lift = LIFT;
    if (!o.sampled) return o;

    var rs = trees.map(function (t) { return t.ratio; }).sort(function (a, b) { return a - b; });
    o.ratioMedian = +rs[rs.length >> 1].toFixed(4);
    o.ratioWorst = +rs[rs.length - 1].toFixed(4);        /* the most circular tree on the map */
    o.trisPerTree = +(trees.reduce(function (s, t) { return s + t.tris; }, 0) / trees.length).toFixed(1);
    o.lowSil = +(trees.filter(function (t) { return t.wide < 0.45; }).length / trees.length).toFixed(3);
    o.highSil = +(trees.filter(function (t) { return t.wide > 0.55; }).length / trees.length).toFixed(3);

    /* ---------- 2. how many stand on a cell, and what the map cost ---------- */
    var per = {}, treeCells = 0;
    var oy = window._r3Cyl;
    window._r3Cyl = function () { per.n = (per.n || 0) + 1; return oy.apply(this, arguments); };
    /* one trunk per tree, counted over the whole map through the real walk */
    _r3dWorldBuild(G);
    window._r3Cyl = oy;
    for (i = 0; i < RTS_N * RTS_N; i++) if (G.terrain[i] === RTS_T_TREE) treeCells++;
    /* rock cells stand two crags and four slabs and no cylinder at all, so the trunk count is
       the tree count exactly - see _r3dRockCell */
    o.treeCells = treeCells;
    o.trees = per.n || 0;
    o.perCell = +(o.trees / Math.max(1, treeCells)).toFixed(3);
    o.worldTris = Math.round(R3.worldTris);
    o.oreTris = R3.oreMesh ? Math.round(R3.oreMesh.verts / 3) : 0;

    /* ---------- 3. and it still reads as forest on the frame ---------- */
    function solid(kind) {
      for (var z2 = 6; z2 < RTS_N - 6; z2++) {
        for (var x2 = 6; x2 < RTS_N - 6; x2++) {
          var all = true;
          for (var dz = -2; dz <= 2 && all; dz++) {
            for (var dx = -2; dx <= 2; dx++) {
              if (G.terrain[_rtsIdx(x2 + dx, z2 + dz)] !== kind) { all = false; break; }
            }
          }
          if (all) return [x2, z2];
        }
      }
      return null;
    }
    var fc = solid(RTS_T_TREE), gc = solid(RTS_T_GRASS);
    o.haveBoth = !!(fc && gc);
    if (!o.haveBoth) return o;
    R.zi = RTS_ZOOMS.length - 1; R.cell = RTS_ZOOMS[R.zi];
    /* Through the COMPOSITE: in 3D the world is presented on the GL layer under a transparent
       overlay, so reading the overlay alone reads a pane of glass. _rtsCompose() is the frame
       the player sees. */
    function look(c) {
      R.focus.x = _rtsWX(c[0]); R.focus.z = _rtsWX(c[1]);
      _rtsRFrame(1 / 60); _rtsRFrame(1 / 60);
      var cv = _rtsCompose(), ctx = cv.getContext('2d');
      var half = Math.round(1.5 * R.cell * R.dpr);
      var d = ctx.getImageData(Math.round(cv.width / 2) - half, Math.round(cv.height / 2) - half,
                               half * 2, half * 2).data;
      var s = 0, n = 0, tones = {};
      for (var p = 0; p < d.length; p += 4) {
        s += 0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2]; n++;
        tones[d[p] + ',' + d[p + 1] + ',' + d[p + 2]] = 1;
      }
      return { mean: +(s / n).toFixed(1), tones: Object.keys(tones).length };
    }
    o.forest = look(fc);
    o.grass = look(gc);
    return o;
  });

  S.ok('the 3D mode is available to check', out.on, out.on ? 'on' : 'no WebGL');
  if (!out.on) {
    S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');
    await g.close(); await browser.close();
    return require('../lib/report.js')(S);
  }
  S.ok('there are real forest cells to build from', out.sampled >= 40,
       out.sampled + ' trees built by _r3dTree at coordinates taken off the map');

  /* THE ONE THAT CANNOT BE ARGUED WITH. Bucket a tree's canopy vertices into 16 angular
     sectors and take the furthest one in each: for any stack of cones that number is the
     widest tier's radius in every sector, so min/max is exactly 1.000 however many sides the
     cones have. Anything below 1 is a canopy whose outline depends on where you stand. */
  S.ok('a canopy is not a circle in plan - it has arms and gaps',
       out.ratioMedian < 0.85,
       'the narrowest of 16 angular sectors reaches ' + (out.ratioMedian * 100).toFixed(1) +
       '% of the furthest, median over ' + out.sampled + ' trees (a stack of cones is a ' +
       'surface of revolution and scores exactly 100%)');
  S.ok('...and that is true of every tree, not just the average one',
       out.ratioWorst < 0.95,
       'the most nearly circular tree sampled reaches ' + (out.ratioWorst * 100).toFixed(1) + '%');

  /* The invariant _r3dLiftFrom runs on, checked against the real trees rather than asserted in
     a comment - relief reaches five world units and a tree is five to nine tall, so a vertex
     lifted twice is a canopy floating clear of its own trunk. Both of this file's shapes have
     shipped that bug once each. */
  S.ok('standing a tree on sloped ground moves it, and does not deform it',
       out.worstLift < 1e-9 && out.worstSpan < 1e-9,
       'over ' + out.sampled + ' trees, the worst vertex missed a ' + out.lift +
       '-unit lift by ' + out.worstLift + ' and the worst tree changed height by ' +
       out.worstSpan + ' (a vertex shared by two faces is lifted twice)');

  /* Two silhouettes, measured as where the canopy is widest: a whorled conifer carries its
     width at its lowest whorl, a broadleaf halfway up a crown standing on a bare stem. One
     species is one number and this split is what stops a wood reading as texture. */
  S.ok('a wood grows two silhouettes, not one',
       out.lowSil > 0.15 && out.highSil > 0.15,
       (out.lowSil * 100).toFixed(1) + '% of trees are widest below 45% of their height and ' +
       (out.highSil * 100).toFixed(1) + '% above 55% - conifers and broadleaves');

  /* The trade itself. The old forest was 2-3 trees a cell at 101 triangles each; anything that
     quietly puts the count back is putting the smooth cone back with it. */
  S.ok('one or two trees to a cell, not two or three',
       out.perCell > 1 && out.perCell <= 2,
       out.trees + ' trunks over ' + out.treeCells + ' forest cells = ' + out.perCell +
       ' per cell (it was 2.50)');
  /* This sampler builds one tree per sampled cell, so its own before-figure is 116 rather than
     the 101 the whole map averaged - the map average includes the third tree on a cell, which
     was the SMALL one. Quoting the map number here would be comparing two different things. */
  S.ok('and each of them is worth half as much geometry again',
       out.trisPerTree > 150,
       out.trisPerTree + ' triangles a tree; the same sampler measured 116.2 on the stacked ' +
       'cones, and the map as a whole averaged 101');
  S.ok('the map did not get more expensive for it',
       out.worldTris <= 1060000,
       out.worldTris + ' static world triangles against 1,049,608 before the rebuild');
  S.ok('...and is still the million of geometry e2e/r3dlive holds it to',
       out.worldTris + out.oreTris > 1000000,
       out.worldTris + ' world + ' + out.oreTris + ' ore = ' + (out.worldTris + out.oreTris));

  /* The guard on the change, not on the old bug: the broadleaf's leaves are lighter and warmer
     than the needles, and canopy tones that drift toward the grass are what made a forest
     vanish into texture the last time this was got wrong. */
  S.ok('a wood still reads as a wood against open grass',
       out.haveBoth && out.forest.mean < out.grass.mean * 0.85,
       out.haveBoth ? 'forest luminance ' + out.forest.mean + ' against grass ' +
         out.grass.mean + ', over ' + out.forest.tones + ' and ' + out.grass.tones + ' tones'
       : 'the map carries no solid block of one of them');

  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})();
