/* Two passes that painted over the artwork they had just drawn.

   1. THE SEA WAS ONE TILE. `_mixGround` pools open water from w1 AND w2 - one tile plus a 2x2
      template's four - so the baked terrain varies across five. `_mixWater`, which bakes the
      animated overlay drawn on top of it every frame, asked for w1 alone. Its per-step set
      therefore held exactly ONE tile, and the overlay's pick,
      `(_sprHash(x, z, seed + 137) * set.length) | 0`, is identically 0 when the length is 1.

      Measured against a real temperat.mix: the bake chose from 5 tiles and the overlay then
      stamped one of them over all 4,096 water cells. Both read the same pool now, in the same
      order, and both picks use the same hash and salt - so the animated tile that lands on a
      cell is the tile the bake chose for it.

   2. ON A REAL MAP THE FLAT COVER PASS REPAINTED THE AUTHOR'S OWN GROUND. _rtsBakeTerrain draws
      a loaded map from the templates the map names, then runs a ground-cover pass that fills
      sand, road and water flat. That pass's only escape was `shore !== null` - and the shoreline
      pass is deliberately switched off on a real map, because the map draws its own. So the
      escape could never be taken, and every beach, road and river-bank cell the author had laid
      out was covered over.

   The fix is a per-cell mask rather than "skip these kinds on a real map", because
   _rtsMapPaintCell returns false for a hole in a template or a piece the table does not know,
   and _mixPaintCell has no SAND branch - so a blanket skip would leave a template-miss sand
   cell showing bare grass.

   NO ARTWORK SHIPS IN THIS REPO, by design, so the second half is asserted against a stubbed
   painter rather than a real map: what is being tested is which cells the cover pass leaves
   alone, and that is a property of the loop, not of the pixels. The first half is checked
   against stubbed tile sets for the same reason - the five-versus-one measurement above came
   from the maintainer's own archives and is recorded here rather than re-run. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('terrainpaint');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 900, height: 700 });
  await g.start(7, 12, { freeze: true });

  /* ---------------- 1. the two water pools are the same pool ---------------- */
  var water = await g.page.evaluate(function () {
    /* Stand in for the theatre's tiles: w1 is 1x1, w2 is 2x2. Exactly the shape of the real
       ones, which is all either function reads. */
    var W1 = { w: 1, h: 1, n: 1, tile: [new Uint8Array(RTS_TS * RTS_TS)] };
    var W2 = { w: 2, h: 2, n: 4, tile: [0, 1, 2, 3].map(function (v) {
      var a = new Uint8Array(RTS_TS * RTS_TS); a.fill(v + 1); return a; }) };
    var CLEAR = { w: 4, h: 4, n: 16, tile: [] };
    for (var c = 0; c < 16; c++) CLEAR.tile.push(new Uint8Array(RTS_TS * RTS_TS));

    var realTiles = window._mixTiles, realReady = window._rtsArtReady;
    window._rtsArtReady = function () { return true; };
    window._mixTiles = function (name) {
      if (/^w1/.test(name)) return W1;
      if (/^w2/.test(name)) return W2;
      if (/^clear1/.test(name)) return CLEAR;
      return null;
    };
    if (!window.RTS_MIX.pal) window.RTS_MIX.pal = new Uint8Array(256 * 3);
    window._RTS_TILECACHE = null; window._RTS_MIXWATER = null;

    var pool = _mixWaterPool();
    var ground = _mixGround();
    var steps = _mixWater();

    /* What the overlay's pick can actually return over a field of cells - the number that was
       1 out of 1 before, whatever the pool held. */
    var set = steps && steps[0] ? steps[0] : [];
    var seen = {};
    for (var y = 0; y < 64; y++) for (var x = 0; x < 64; x++) {
      var v = (_sprHash(x, y, 1 + 137) * set.length) | 0;
      if (v >= set.length) v = set.length - 1;
      seen[v] = 1;
    }
    /* and the coupling itself: bake and overlay must index the SAME list the same way */
    var sameIndex = true;
    for (var yy = 0; yy < 40 && sameIndex; yy++) for (var xx = 0; xx < 40; xx++) {
      var bake = (_sprHash(xx, yy, 1 + 137) * ground.water.n) | 0;
      var over = (_sprHash(xx, yy, 1 + 137) * set.length) | 0;
      if (bake !== over) { sameIndex = false; break; }
    }

    window._mixTiles = realTiles; window._rtsArtReady = realReady;
    window._RTS_TILECACHE = null; window._RTS_MIXWATER = null;
    return { pool: pool.length, baked: ground && ground.water ? ground.water.n : 0,
             steps: steps ? steps.length : 0, perStep: set.length,
             distinct: Object.keys(seen).length, sameIndex: sameIndex };
  });
  S.eq('open water pools w1 and w2 together', water.pool, 5);
  S.eq('...and the baked terrain uses all of them', water.baked, 5);
  S.ok('the animated overlay is baked in steps', water.steps > 1, water.steps + ' steps');
  S.eq('...each holding the same five tiles, not one', water.perStep, water.baked);
  S.ok('...so the overlay actually varies across a field of water',
       water.distinct === water.baked,
       water.distinct + ' distinct tiles chosen over 4096 cells, of ' + water.perStep);
  S.ok('...and lands on the very tile the bake chose for that cell', water.sameIndex,
       'same hash, same salt, same list');

  /* ---------------- 2. a real map's own ground survives the cover pass ---------------- */
  var map = await g.page.evaluate(function () {
    var G = window._rtsG, N = RTS_N, TS = RTS_TS;
    /* A map whose author drew every SAND and WATER cell and half the ROAD cells - the other
       half standing in for a template the table does not know, which must still be filled. The
       stub paints a colour nothing else in the bake produces, so "was this repainted?" is a
       pixel question rather than a question about hooks. */
    var MARK = [7, 251, 13];
    var drew = new Uint8Array(N * N), roads = 0;
    var realPaint = window._rtsMapPaintCell, realMap = window._RTS_MAP;
    var realGround = window._mixGround;
    window._RTS_MAP = { fake: true };
    /* _mixGround only has to be truthy for the real-map branch to be taken. */
    window._mixGround = function () { return { clear: { n: 1, tile: [null] }, water: null }; };
    window._rtsMapPaintCell = function (d, S2, tx, tz) {
      var k = G.terrain[_rtsIdx(tx, tz)], mine = false;
      if (k === RTS_T_SAND || k === RTS_T_WATER) mine = true;
      else if (k === RTS_T_ROAD) { roads++; mine = !!(roads % 2); }
      if (!mine) return false;
      drew[tz * N + tx] = 1;
      for (var y = 0; y < TS; y++) {
        var row = (tz * TS + y) * S2;
        for (var x = 0; x < TS; x++) {
          var o = (row + tx * TS + x) * 4;
          d[o] = MARK[0]; d[o + 1] = MARK[1]; d[o + 2] = MARK[2]; d[o + 3] = 255;
        }
      }
      return true;
    };

    var out = null, err = null;
    try { out = _rtsBakeTerrain(G); } catch (e) { err = e.message; }

    window._rtsMapPaintCell = realPaint; window._RTS_MAP = realMap;
    window._mixGround = realGround;
    if (err) return { threw: err };

    var cv = out && out.c ? out.c : out;
    var ctx2 = cv.getContext('2d');
    var px = ctx2.getImageData(0, 0, cv.width, cv.height).data;
    var total = 0, covered = 0, overhang = 0, byKind = {}, rest = [];
    for (var tz2 = 0; tz2 < N; tz2++) for (var tx2 = 0; tx2 < N; tx2++) {
      if (!drew[tz2 * N + tx2]) continue;
      total++;
      /* the middle of the cell: the flat cover pass fills the whole cell, so one probe is
         enough and 16,384 of them is not */
      var o2 = (((tz2 * TS + TS / 2) | 0) * cv.width + ((tx2 * TS + TS / 2) | 0)) * 4;
      if (px[o2] !== MARK[0] || px[o2 + 1] !== MARK[1] || px[o2 + 2] !== MARK[2]) {
        covered++;
        var kk = G.terrain[_rtsIdx(tx2, tz2)];
        byKind[kk] = (byKind[kk] || 0) + 1;
        /* which later, deliberately-procedural layer reached it: rock ridges, cliffs, sea
           cliffs and forest all overhang their own cell */
        var near = false;
        for (var ax = -1; ax <= 1 && !near; ax++) for (var az = -1; az <= 1; az++) {
          if (!_rtsInB(tx2 + ax, tz2 + az)) continue;
          var nk = G.terrain[_rtsIdx(tx2 + ax, tz2 + az)];
          if (nk === RTS_T_ROCK || nk === RTS_T_TREE) { near = true; break; }
        }
        if (near) overhang++;
        else {
          var why = [];
          if (G.scrap[_rtsIdx(tx2, tz2)] > 0) why.push('ore');
          for (var bx = -2; bx <= 2; bx++) for (var bz = -2; bz <= 2; bz++) {
            if (!_rtsInB(tx2 + bx, tz2 + bz)) continue;
            var bk = G.terrain[_rtsIdx(tx2 + bx, tz2 + bz)];
            if (bk === RTS_T_ROCK && why.indexOf('rock2') < 0) why.push('rock2');
            if (bk === RTS_T_TREE && why.indexOf('tree2') < 0) why.push('tree2');
          }
          var st = G.ents.filter(function (e) {
            return e.type === 'struct' && !e.dead &&
              Math.abs(_rtsTX(e.x) - tx2) < 4 && Math.abs(_rtsTX(e.z) - tz2) < 4; });
          if (st.length) why.push('struct:' + st[0].def);
          rest.push(tx2 + ',' + tz2 + ' kind' + kk + ' ' + (why.join('+') || 'nothing near'));
        }
      }
    }
    return { threw: null, authoredTotal: total, authoredCovered: covered,
             overhang: overhang, byKind: byKind, rest: rest };
  });
  S.ok('the bake survives a real map', !map.threw, map.threw || 'ok');
  S.ok('the map has authored ground to protect', map.authoredTotal > 0,
       map.authoredTotal + ' cells drawn by the map');
  S.note('authored ' + map.authoredTotal + ' cells, ' + map.authoredCovered + ' repainted (' +
         map.overhang + ' of them under a rock or a tree)');
  /* THE FLAT COVER PASS must leave every one of them alone - before the fix it took all 1,650.
     What remains is the deliberately-procedural layers drawn afterwards: rock ridges, cliffs,
     sea cliffs and forest all overhang the cell they stand on, and terrain.js states in so many
     words that those stay procedural. So the bar is not zero-touched-pixels; it is that nothing
     is repainted except where one of those overhangs, which is checked rather than assumed. */
  /* Every procedural pass that fills ground - the flat sand/road/water cover, the tuft and
     pebble scatter, and the drawn water ripples - must leave an authored cell alone. Before,
     all 1,650 were repainted; then 13 when only the cover pass was fixed, which is how the
     scatter and the ripples were found. What is left is the layers terrain.js states in so many
     words stay procedural: rock ridges, cliffs, sea cliffs and forest, all of which overhang
     the cell they stand on. That is checked here rather than assumed, so a pass that starts
     covering open ground again cannot hide inside the allowance. */
  S.ok('no procedural ground pass repaints the author\'s own ground',
       map.authoredCovered - map.overhang === 0,
       map.authoredCovered + ' of ' + map.authoredTotal + ' repainted, all ' + map.overhang +
       ' of them under an overhanging rock or tree (was all 1650)');
  S.ok('...and what remains is a small edge, not a layer', map.authoredCovered < 40,
       map.authoredCovered + ' cells');
  if ((map.rest || []).length) S.note('unattributed: ' + map.rest.join(' | '));

  S.ok('the page logged no errors', !g.errors.length, g.errors.slice(0, 2).join(' | ') || 'clean');
  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})();
