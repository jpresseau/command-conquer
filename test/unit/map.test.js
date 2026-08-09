/* The real-map pipeline: 919 lines under src/map/ that had no spec at all.

   This is the code that turns somebody's own Red Alert map into the four grids a battle runs
   on, and it is the headline feature - "play a real map" is on the title screen. It was also
   the largest unguarded surface in the project, and the gap was not theoretical: making the
   ocean drivable, by flipping one `block` in RTS_MAP_LAND, passed the entire suite.

   Everything here is pure over plain objects: a "map" is a couple of typed arrays and a bounds
   record, so none of it needs a browser and none of it needs artwork. What is deliberately NOT
   covered is the MIX scanning and the file pickers, which are I/O against archives this repo
   does not ship. */

var { Suite } = require('../lib/assert.js');
var { load } = require('../lib/sandbox.js');

var S = new Suite('map');
var g = load(['src/rules', 'src/core', 'src/map']);
var N = g.RTS_N;

/* A map in the shape _rtsMapBuild reads: template ids, tile indices, and a resource layer.
   `rows` is one string per row, one character per cell, using RTS_MAP_LAND's own letters. */
function fakeMap(rows, res) {
  var h = rows.length, w = rows[0].length;
  var tmpl = new Uint16Array(w * h), tidx = new Uint8Array(w * h);
  var resType = new Uint8Array(w * h);
  var tab = {};
  var letters = {};
  rows.forEach(function (r, y) {
    for (var x = 0; x < w; x++) {
      var ch = r[x];
      if (letters[ch] === undefined) { letters[ch] = Object.keys(letters).length + 1; tab[letters[ch]] = { t: ch }; }
      tmpl[y * w + x] = letters[ch];
      tidx[y * w + x] = 0;
      if (res) resType[y * w + x] = (res[y] && res[y][x] !== '.') ? +res[y][x] : 0;
    }
  });
  g.window.RA_TILETAB = tab;
  g.window.raTileTab = null;
  return { bin: { w: w, h: h, tmpl: tmpl, tidx: tidx, resType: resType },
           fit: { n: Math.min(w, h), ox: 0, oy: 0 }, theatre: 'temperat',
           yaml: { spawns: [] } };
}
/* One character repeated over a whole N x N map, so a build covers the game's own grid. */
function fill(ch, patch) {
  var rows = [];
  for (var y = 0; y < N; y++) rows.push(new Array(N + 1).join(ch));
  if (patch) patch(rows);
  return rows;
}
function put(rows, x, y, ch) {
  rows[y] = rows[y].slice(0, x) + ch + rows[y].slice(x + 1);
}

/* ------------------------------------------ the land table: what blocks and what does not ----
   The mutation that proved this file needed writing: flip water's `block` to 0 and the whole
   suite still passed, while every ship in the game became redundant and every tank amphibious. */
(function () {
  var L = g.RTS_MAP_LAND;
  var mustBlock = { k: 'rock', w: 'water', i: 'river' };
  var mustNot = { c: 'clear', r: 'rough', d: 'road', g: 'bridge', b: 'beach', '-': 'a hole in the template' };
  Object.keys(mustBlock).forEach(function (k) {
    S.ok(mustBlock[k] + ' (' + k + ') blocks', !!(L[k] && L[k].block), 'block ' + (L[k] || {}).block);
  });
  Object.keys(mustNot).forEach(function (k) {
    S.ok(mustNot[k] + ' (' + k + ') does not block', !!L[k] && !L[k].block, 'block ' + (L[k] || {}).block);
  });
  S.eq('water is water to the simulation, so a splash knows it is wet', L.w.t, g.RTS_T_WATER);
  S.eq('a river is water too', L.i.t, g.RTS_T_WATER);
  S.eq('rock is the cliff kind, so it draws and blocks like one', L.k.t, g.RTS_T_ROCK);
  S.eq('a bridge is road, which is drivable', L.g.t, g.RTS_T_ROAD);
  S.eq('rough collapses onto grass rather than becoming an invisible wall', L.r.t, g.RTS_T_GRASS);
})();

/* ------------------------------------------------------- classifying one cell ----*/
(function () {
  var M = fakeMap(['cw', 'kb']);
  S.eq('a known template reports its own class', g._rtsMapClass(M.bin, 0, 0, 'temperat'), 'c');
  S.eq('...for every cell', g._rtsMapClass(M.bin, 1, 0, 'temperat'), 'w');
  S.eq('...including the blocking ones', g._rtsMapClass(M.bin, 0, 1, 'temperat'), 'k');

  /* A template the table does not know must read as clear. An unknown piece of scenery
     becoming an invisible wall in the middle of the battlefield is the worse failure: the
     player sees open ground and their units refuse to cross it. */
  M.bin.tmpl[0] = 60000;
  S.eq('an unknown template is clear, not a wall', g._rtsMapClass(M.bin, 0, 0, 'temperat'), 'c');
  /* and a tile index past the end of its row is the same case */
  M.bin.tmpl[0] = 1; M.bin.tidx[0] = 200;
  S.eq('a tile index past the end of the row is clear too',
       g._rtsMapClass(M.bin, 0, 0, 'temperat'), 'c');
})();

/* ------------------------------------------------------------- building the grids ----*/
(function () {
  var rows = fill('c', function (r) {
    for (var y = 10; y < 20; y++) for (var x = 10; x < 20; x++) put(r, x, y, 'w');
    for (var y2 = 30; y2 < 34; y2++) for (var x2 = 30; x2 < 34; x2++) put(r, x2, y2, 'k');
  });
  var res = fill('.', function (r) {
    for (var y = 40; y < 44; y++) for (var x = 40; x < 44; x++) put(r, x, y, '1');
    for (var y2 = 50; y2 < 52; y2++) for (var x2 = 50; x2 < 52; x2++) put(r, x2, y2, '2');
    put(r, 60, 60, '3');
  });
  var M = fakeMap(rows, res);
  var built = g._rtsMapBuild(M);
  S.ok('a map builds', !!built && !!built.grid, built && built.error);
  var G = built.grid;
  S.eq('water blocks in the built grid', G.blocked[g._rtsIdx(12, 12)] > 0, true);
  S.eq('...and is the water kind', G.terrain[g._rtsIdx(12, 12)], g.RTS_T_WATER);
  S.eq('rock blocks', G.blocked[g._rtsIdx(31, 31)] > 0, true);
  S.eq('clear ground does not', G.blocked[g._rtsIdx(5, 5)], 0);

  S.ok('ore is marked', G.scrap[g._rtsIdx(41, 41)] > 0, String(G.scrap[g._rtsIdx(41, 41)]));
  S.eq('...as a shape marker of 1, not a density - _rtsTiberiumAdjust derives that later',
       G.scrap[g._rtsIdx(41, 41)], 1);
  S.ok('gems are marked as gems', G.gems[g._rtsIdx(50, 50)] > 0, String(G.gems[g._rtsIdx(50, 50)]));
  S.ok('...and carry ore under them', G.scrap[g._rtsIdx(50, 50)] > 0, '');
  /* ResourceIndex 3 is a wall in RA's own scenarios - an obstacle, not scenery, and above all
     not something a harvester should drive at. */
  S.ok('a wall in the resource layer is an obstacle, not ore',
       G.blocked[g._rtsIdx(60, 60)] > 0 && !G.scrap[g._rtsIdx(60, 60)],
       'blocked ' + G.blocked[g._rtsIdx(60, 60)] + ', scrap ' + G.scrap[g._rtsIdx(60, 60)]);
})();

/* Off the edge of the author's map, the window has to be closed rather than left as open
   ground the player can walk into and off. */
(function () {
  var M = fakeMap(fill('c'), fill('.', function (r) { put(r, 40, 40, '1'); }));
  M.bin.w = N - 8; M.bin.h = N - 8;         /* the window now runs off two sides */
  var out = g._rtsMapBuild(M);
  S.ok('a map whose window overhangs its own edge still builds', !!out.grid, out.error || 'built');
  var G = out.grid || { blocked: new Uint8Array(N * N), terrain: new Uint8Array(N * N) };
  S.ok('ground beyond the edge of the map is blocked',
       G.blocked[g._rtsIdx(N - 2, N - 2)] > 0, String(G.blocked[g._rtsIdx(N - 2, N - 2)]));
  S.eq('...as rock, so it draws as a cliff rather than as nothing',
       G.terrain[g._rtsIdx(N - 2, N - 2)], g.RTS_T_ROCK);
})();

/* ------------------------------------------------------------------- the window fit ----*/
(function () {
  S.ok('a map smaller than a battlefield is refused, with a reason',
       /too small/.test((g._rtsMapFit({ bounds: { x: 0, y: 0, w: 20, h: 20 }, spawns: [] }) || {}).error || ''),
       JSON.stringify(g._rtsMapFit({ bounds: { x: 0, y: 0, w: 20, h: 20 }, spawns: [] })));

  var big = g._rtsMapFit({ bounds: { x: 0, y: 0, w: 400, h: 400 }, spawns: [] });
  S.eq('a huge map is cropped to the biggest window worth simulating', big.n, g.RTS_MAP_MAXN);

  /* The window centres on the two spawns furthest apart that still fit inside it - the whole
     point being that a cropped map keeps the fight, not a corner of the scenery. */
  var fit = g._rtsMapFit({ bounds: { x: 0, y: 0, w: 200, h: 200 },
    spawns: [{ x: 20, y: 20 }, { x: 100, y: 100 }, { x: 105, y: 98 }] });
  S.ok('the window keeps a pair of spawns', !!fit.pair, JSON.stringify(fit.pair));
  S.ok('...and is placed inside the map, not off it',
       fit.ox >= 0 && fit.oy >= 0 && fit.ox + fit.n <= 200 && fit.oy + fit.n <= 200,
       'ox ' + fit.ox + ' oy ' + fit.oy + ' n ' + fit.n);
  /* A pair too far apart to fit in one window must not be chosen - the crop would drop one. */
  var far = g._rtsMapFit({ bounds: { x: 0, y: 0, w: 400, h: 400 },
    spawns: [{ x: 5, y: 5 }, { x: 390, y: 390 }] });
  S.ok('a pair that cannot fit in the window is not chosen', !far.pair, JSON.stringify(far.pair));
})();

/* --------------------------------------------------- can the battle actually be fought ----*/
(function () {
  /* _rtsMapBuild runs the check itself and returns {error}, so the grid for these has to be
     built from a sound map and then broken - otherwise there is no grid to check. */
  function grid(rows, res) {
    var out = g._rtsMapBuild(fakeMap(rows, res || fill('.', function (r) { put(r, 40, 40, '1'); })));
    return out.grid || null;
  }
  /* A wall of rock straight down the middle: the two starts cannot reach each other. */
  var G = grid(fill('c'));
  for (var wy = 0; wy < N; wy++) G.blocked[g._rtsIdx((N / 2) | 0, wy)] = 2;
  var split = g._rtsMapCheck(G, { player: { tx: 15, tz: 15 }, enemy: { tx: N - 16, tz: 15 } });
  S.ok('a map whose halves do not connect is refused', !!split, split || 'accepted');
  S.ok('...and says which fault it is', /no route between them/.test(split || ''), split);

  /* Connected, but there is no ore at all: an economy that never starts. */
  var open = grid(fill('c'));
  open.scrap.fill(0);
  var dry = g._rtsMapCheck(open, { player: { tx: 15, tz: 15 }, enemy: { tx: N - 16, tz: 15 } });
  S.ok('a map with no reachable ore is refused', !!dry, dry || 'accepted');
  S.ok('...and says so rather than reusing the routing message',
       /ore/.test(dry || ''), dry);

  /* And a sound map passes. */
  S.eq('a connected map with reachable ore is accepted',
       g._rtsMapCheck(grid(fill('c')), { player: { tx: 15, tz: 15 }, enemy: { tx: N - 16, tz: 15 } }),
       null);

  /* WATER IS NOT A ROUTE. The fill is land-only, which is why a map whose halves are joined
     only by sea is refused - and why an amphibious transport would not, on its own, make more
     maps playable: _rtsMapCheck would still reject them before the battle started. */
  var sea = grid(fill('c'));
  for (var sy = 0; sy < N; sy++) {
    var si = g._rtsIdx((N / 2) | 0, sy);
    sea.terrain[si] = g.RTS_T_WATER; sea.blocked[si] = 2;
  }
  S.ok('two halves joined only by water are not connected',
       !!g._rtsMapCheck(sea, { player: { tx: 15, tz: 15 }, enemy: { tx: N - 16, tz: 15 } }),
       g._rtsMapCheck(sea, { player: { tx: 15, tz: 15 }, enemy: { tx: N - 16, tz: 15 } }) ||
       'ACCEPTED a map split by the sea');
})();

/* ------------------------------------------------------------------------ the sea ----*/
(function () {
  function built(rows) {
    return g._rtsMapBuild(fakeMap(rows, fill('.', function (r) { put(r, 40, 40, '1'); }))).grid;
  }
  var dry = built(fill('c'));
  var d = g._rtsMapSea(dry, N);
  S.eq('a landlocked map reports no water', d.water, 0);
  S.eq('...and nowhere to put a shipyard', d.shore, 0);

  var wet = fill('c', function (r) {
    for (var y = 0; y < N; y++) for (var x = 0; x < 30; x++) put(r, x, y, 'w');
  });
  var w = g._rtsMapSea(built(wet), N);
  S.ok('a map with a sea reports it', w.water > 0, w.water + ' water cells');
  S.ok('...and finds shore to build a naval yard on', w.shore > 0, w.shore + ' spots');
})();

/* -------------------------------------------------- a base must stand on open ground ----
   _rtsMapClearSpot asked only whether the 9x9 AROUND a candidate was 80% clear, and 80% of 81
   cells leaves room for a 4x4 outcrop with the centre inside it. A start could be placed IN a
   cliff, and nothing downstream noticed: _rtsMapReach floods from that cell, cannot leave it,
   and _rtsMapCheck rejects the whole map with "the two start positions have no route between
   them" - blaming the map for a placement fault, on a map that was perfectly playable.

   Found by walling a 4x4 block of rock at exactly the radius the fallback ring lands on, which
   is not a contrivance: it is where the fallback looks on every map that has no usable spawns. */
(function () {
  var rows = fill('c', function (r) {
    for (var y = 30; y < 34; y++) for (var x = 30; x < 34; x++) put(r, x, y, 'k');
  });
  var out = g._rtsMapBuild(fakeMap(rows, fill('.', function (r) { put(r, 40, 40, '1'); })));
  S.ok('a map with an outcrop where the fallback ring lands is still playable',
       !!out.grid, out.error || 'built');
  if (out.grid) {
    var st = out.starts;
    S.ok('...and neither start is inside it',
         !out.grid.blocked[g._rtsIdx(st.player.tx, st.player.tz)] &&
         !out.grid.blocked[g._rtsIdx(st.enemy.tx, st.enemy.tz)],
         JSON.stringify(st));
    /* directly: the spot picker never hands back a blocked cell */
    var probe = g._rtsMapClearSpot(out.grid, 31, 31);
    S.ok('_rtsMapClearSpot never returns a cell that is itself blocked',
         !probe || !out.grid.blocked[g._rtsIdx(probe.tx, probe.tz)], JSON.stringify(probe));
  }
})();

/* ------------------------------------------------------------- the author's own spawns ----*/
(function () {
  var G = g._rtsMapBuild(fakeMap(fill('c'),
    fill('.', function (r) { put(r, 40, 40, '1'); }))).grid;
  var M = { fit: { ox: 0, oy: 0 }, yaml: { spawns: [{ x: 20, y: 20 }, { x: N - 20, y: N - 20 }] } };
  var st = g._rtsMapStarts(G, M);
  S.ok('the author\'s own spawns are used when they are usable', !!st, JSON.stringify(st));
  S.ok('...and the two furthest apart are the two houses', !!st &&
       Math.hypot(st.player.tx - st.enemy.tx, st.player.tz - st.enemy.tz) > N / 3,
       st ? Math.round(Math.hypot(st.player.tx - st.enemy.tx, st.player.tz - st.enemy.tz)) + ' apart' : '');

  /* A spawn hard against the window edge has nowhere to build and must be dropped, not used. */
  var edge = g._rtsMapStarts(G, { fit: { ox: 0, oy: 0 },
    yaml: { spawns: [{ x: 1, y: 1 }, { x: 2, y: 2 }] } });
  S.eq('spawns jammed against the edge are dropped, and the caller falls back', edge, null);
  S.eq('...as is a map with only one usable spawn',
       g._rtsMapStarts(G, { fit: { ox: 0, oy: 0 }, yaml: { spawns: [{ x: 40, y: 40 }] } }), null);
})();

require('../lib/report.js')(S);
