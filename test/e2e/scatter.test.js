/* THE 3D WORLD'S SCATTER IS ACTUALLY A SCATTER.

   world3d.js places every tree, boulder, crag, grass tuft and ore crystal by hash rather than
   by random - it has to, or a save-load would grow a different forest. But a hash of the wrong
   arguments is not a scatter, and every placement in the file was hashing the wrong arguments.

   The offsets came in SEPARABLE pairs: the x offset from `_sprHash(index, tx)` and the z offset
   from `_sprHash(tz, index)`. Neither takes both cell coordinates, so the x offsets were
   IDENTICAL down every column of the map and the z offsets identical along every row. That is
   the outer product of two one-dimensional patterns, not a two-dimensional scatter: what it
   draws is a lattice whose rows and columns have been nudged, which under a tilted camera is
   exactly the regularity the 3D mode exists to break up. Measured on the geometry the builder
   emits, EVERY pair of vertically adjacent rock cells and EVERY pair of vertically adjacent
   grass cells - 100% of them - stood their boulders and tufts at the same x offsets.

   The size hashes had it in an additive form, which is milder but not harmless: `tx + index`
   gives tree 1 on a cell the height of tree 0 on the next cell along, and `_sprHash(tn, tx+tz)`
   - which chose the number of foliage tiers - is CONSTANT along a whole anti-diagonal, so
   canopy shape ran in diagonal stripes across every wood on the map.

   IT MEASURES THE EMITTED GEOMETRY, NOT THE ARITHMETIC. Re-deriving the offset expressions in
   the spec and checking they look scattered would pass with the fix reverted, because the spec
   would be grading its own copy of the formula. So this hooks _r3Box/_r3Cone/_r3Cyl through a
   real _r3dWorldBuild and reads the placements that came out.

   The diagonal test carries its own CONTROL: the same profile comparison against an ORTHOGONAL
   neighbour, which was never expected to repeat. Before, the diagonal ran 51.6% against the
   control's 12.7% - a fourfold excess is the stripe. After, 10.4% against 9.7%, which is a tie
   at the chance rate for a two-or-three-character profile.

   AND THE CRYSTALS REACH FULL HEIGHT. Ore cells are seeded to
   `(lvl+1)/RTS_ORE_LEVELS * RTS_SCRAP_TILE * RTS_ORE_RICHNESS`, so the richest cell on the map
   holds RICHNESS of the nominal tile capacity, never the whole of it. Scaling crystal height by
   `ore / RTS_SCRAP_TILE` therefore capped the tallest crystal in the game at the richness -
   63.7% of the height the expression can produce - and the top third of the range was
   unreachable. The 2D ore draw had the identical bug and was fixed first; this is its twin. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('scatter');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 900, height: 650, dpr: 1 });
  await g.start(7, 1);

  var out = await g.page.evaluate(function () {
    var o = {};
    rtsSetVoxSide('allied');
    _rtsNewGame(4242, 'easy');
    var G = window._rtsG;

    rts3dToggle();
    o.on = !!(window._R3D && window._R3D.gl);
    if (!o.on) return o;

    /* --- run the REAL builder, recording what it places --- */
    var log = [];
    var oc = window._r3Cone, ob = window._r3Box, oy = window._r3Cyl;
    window._r3Cone = function (out, x, y, z) { log.push({ k: 'cone', x: x, z: z }); return oc.apply(this, arguments); };
    window._r3Box = function (out, x, y, z) { log.push({ k: 'box', x: x, z: z }); return ob.apply(this, arguments); };
    window._r3Cyl = function (out, x, y, z) { log.push({ k: 'cyl', x: x, z: z }); return oy.apply(this, arguments); };
    _r3dWorldBuild(G);
    window._r3Cone = oc; window._r3Box = ob; window._r3Cyl = oy;
    o.prims = log.length;

    /* A placement's offset never leaves its own cell, so bucketing by nearest cell centre
       assigns it back to the cell that emitted it, in emission order. */
    var byCell = {};
    for (var i = 0; i < log.length; i++) {
      var e = log[i], kk = _rtsTX(e.x) + ',' + _rtsTX(e.z);
      (byCell[kk] || (byCell[kk] = [])).push(e);
    }

    /* DISTINCT offsets, not the multiset: a tree contributes one x offset however many
       foliage tiers it happens to carry, so tier count can neither mask a repeat nor fake one. */
    function offs(tx, tz, axis) {
      var L = byCell[tx + ',' + tz]; if (!L) return null;
      var s = {};
      for (var j = 0; j < L.length; j++) {
        s[(axis === 'x' ? L[j].x - _rtsWX(tx) : L[j].z - _rtsWX(tz)).toFixed(4)] = 1;
      }
      return Object.keys(s).sort().join('|');
    }
    /* Share of same-kind neighbour pairs that got the IDENTICAL offsets - down a column for
       the x offsets, along a row for the z offsets, which is where a separable pair repeats. */
    function sep(kind) {
      var cs = 0, ct = 0, rs = 0, rt = 0;
      for (var tz = 1; tz < RTS_N - 1; tz++) {
        for (var tx = 1; tx < RTS_N - 1; tx++) {
          if (G.terrain[_rtsIdx(tx, tz)] !== kind) continue;
          if (G.terrain[_rtsIdx(tx, tz + 1)] === kind) {
            var a = offs(tx, tz, 'x'), b = offs(tx, tz + 1, 'x');
            if (a && b) { ct++; if (a === b) cs++; }
          }
          if (G.terrain[_rtsIdx(tx + 1, tz)] === kind) {
            var c = offs(tx, tz, 'z'), d = offs(tx + 1, tz, 'z');
            if (c && d) { rt++; if (c === d) rs++; }
          }
        }
      }
      return { colTot: ct, col: ct ? +(cs / ct).toFixed(4) : null,
               rowTot: rt, row: rt ? +(rs / rt).toFixed(4) : null };
    }
    o.tree = sep(RTS_T_TREE);
    o.rock = sep(RTS_T_ROCK);
    o.grass = sep(RTS_T_GRASS);

    /* --- the anti-diagonal canopy stripe. It is the TIER COUNT that repeated, not the
       height: h3 chose the tiers and was constant on the diagonal, h1 chose the height and
       was not. Split a cell into trees on the trunk cylinders and read the counts. --- */
    function prof(tx, tz) {
      var L = byCell[tx + ',' + tz]; if (!L) return null;
      var v = [], cur = -1;
      for (var j = 0; j < L.length; j++) {
        if (L[j].k === 'cyl') { v.push(0); cur++; }
        else if (L[j].k === 'cone' && cur >= 0) v[cur]++;
      }
      return v.length ? v.join('|') : null;
    }
    var ds = 0, dt = 0, os = 0, ot = 0;
    for (var tz2 = 1; tz2 < RTS_N - 1; tz2++) {
      for (var tx2 = 1; tx2 < RTS_N - 1; tx2++) {
        if (G.terrain[_rtsIdx(tx2, tz2)] !== RTS_T_TREE) continue;
        if (G.terrain[_rtsIdx(tx2 + 1, tz2 - 1)] === RTS_T_TREE) {
          var p1 = prof(tx2, tz2), p2 = prof(tx2 + 1, tz2 - 1);
          if (p1 && p2) { dt++; if (p1 === p2) ds++; }
        }
        if (G.terrain[_rtsIdx(tx2 + 1, tz2)] === RTS_T_TREE) {   /* the control */
          var q1 = prof(tx2, tz2), q2 = prof(tx2 + 1, tz2);
          if (q1 && q2) { ot++; if (q1 === q2) os++; }
        }
      }
    }
    o.diagTot = dt; o.diag = dt ? +(ds / dt).toFixed(4) : null;
    o.orthoTot = ot; o.ortho = ot ? +(os / ot).toFixed(4) : null;

    /* --- the crystals reach the top of their height range --- */
    var ore = [];
    window._r3Cone = function (out, x, y, z, r0, r1, h) { ore.push(h); return oc.apply(this, arguments); };
    _r3dOreBuild(G);
    window._r3Cone = oc;
    var mx = 0;
    for (var w = 0; w < ore.length; w++) if (ore[w] > mx) mx = ore[w];
    o.oreCones = ore.length;
    /* the ceiling of `(0.5 + h*1.1) * (0.35 + frac)` at h = frac = 1 */
    o.reach = +(mx / ((0.5 + 1.1) * (0.35 + 1))).toFixed(3);
    var best = 0;
    for (var y2 = 0; y2 < RTS_N * RTS_N; y2++) if (G.scrap[y2] > best) best = G.scrap[y2];
    o.richest = +best.toFixed(1);
    o.nominalCap = RTS_SCRAP_TILE;
    o.richness = RTS_ORE_RICHNESS;
    return o;
  });

  S.ok('the 3D world builds', out.on && out.prims > 10000,
       out.on ? out.prims + ' primitives placed' : 'no WebGL to check');

  if (out.on) {
    /* 100% before, on rock and on grass alike. A threshold of 20% is far below anything a
       separable pair can produce and far above the incidental agreement of a real scatter,
       which measured 0 on all three kinds. */
    ['rock', 'grass', 'tree'].forEach(function (kind) {
      var m = out[kind];
      S.ok('the ' + kind + ' scatter is not a column of copies', m.col < 0.2,
           m.colTot + ' vertically adjacent ' + kind + ' pairs, ' + (m.col * 100).toFixed(1) +
           '% with identical x offsets (separable hashing gave 100% on rock and grass, ' +
           '50.6% on forest)');
      S.ok('...nor a row of them', m.row < 0.2,
           m.rowTot + ' horizontally adjacent pairs, ' + (m.row * 100).toFixed(1) +
           '% with identical z offsets');
    });

    /* Against its own control, so the threshold is not a guess about the chance rate. */
    S.ok('the canopy does not run in diagonal stripes', out.diag < out.ortho * 2,
         'anti-diagonal neighbours share a tier profile ' + (out.diag * 100).toFixed(1) +
         '% of the time vs ' + (out.ortho * 100).toFixed(1) + '% for orthogonal ones (' +
         out.diagTot + '/' + out.orthoTot + ' pairs); before the fix that was 51.6% vs 12.7%');

    /* The richest cell the generator can seed is RICHNESS of the nominal capacity, so
       dividing by the nominal capacity alone pins the tallest crystal at RICHNESS of full. */
    S.ok('ore crystals reach full height on the richest cell', out.reach > 0.95,
         'tallest crystal is ' + (out.reach * 100).toFixed(1) + '% of the height expression\'s ' +
         'ceiling, from a richest cell of ' + out.richest + ' against a nominal ' +
         out.nominalCap + ' at richness ' + out.richness + ' (dividing by the nominal ' +
         'capacity alone capped it at 63.7%)');
  }

  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})();
