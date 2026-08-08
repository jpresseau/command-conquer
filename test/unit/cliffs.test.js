/* The cliff fitter: which of Red Alert's Cliffs templates go where on a generated map.

   No artwork is involved. _rtsCliffFit takes a library, a map size and two predicates and hands
   back placements - that is the whole reason it was written as a pure function, because the
   thing worth testing here is the packing, and the packing does not need a single pixel of
   anyone's temperat.mix to be checked.

   The library below is therefore SYNTHETIC and hand-shaped, so each assertion has one job. A
   template's cells are R (must land on blocked rock), G (must land on open ground) or E (either),
   and each carries a 24x24 mask that the seam scoring reads - the masks here are flat blocks,
   which makes "does this piece agree with its west neighbour" a fact rather than a judgement.

   What has to hold, and why each one is a bug that shipped or nearly did:

     LEGALITY - art that claims rock where a harvester can drive, or open grass over a cell the
     pathfinder blocks, is the whole failure mode of doing this at all.
     COVERAGE - one bare cell in the middle of real cliff art is louder than no cliff art.
     DETERMINISM - a generated map has to be the same map on every machine.
     THE SEAM TERM - it is the difference between a ridge and a row of separate lumps, and it is
     invisible in a screenshot of a single piece, so nothing but a test will catch it dying. */

var { Suite } = require('../lib/assert.js');
var { load } = require('../lib/sandbox.js');

var S = new Suite('cliffs');
/* bake.js only for RTS_TS - the fitter's one dependency outside itself, and taken from the
   real source rather than stubbed so the masks here are the size the game actually uses. */
var box = load(['src/sprites/bake.js', 'src/mixart/cliffs.js']);
var TS = box.RTS_TS;

/* A cell whose mask is a solid block of `on`, so two neighbours agree exactly when they carry
   the same value - the seam score becomes 1 or 0 with nothing in between. */
function cell(kind, on, cov) {
  var m = new Uint8Array(TS * TS);
  if (on) m.fill(1);
  return { kind: kind, cov: cov === undefined ? (kind === 'R' ? 0.9 : (kind === 'G' ? 0.1 : 0.35)) : cov,
           m: m, px: new Uint8Array(TS * TS) };
}
function tmpl(img, w, h, cells) { return { img: img, w: w, h: h, cells: cells }; }

/* A map is a string per row: '#' blocked rock, '.' open ground, ' ' neither (a tree, ore, the
   sea) - which no template may cover at all. */
function world(rows) {
  var N = rows.length;
  return {
    N: N,
    rock: function (x, z) { return x >= 0 && z >= 0 && x < N && z < N && rows[z][x] === '#'; },
    open: function (x, z) { return x >= 0 && z >= 0 && x < N && z < N && rows[z][x] === '.'; }
  };
}

/* ------------------------------------------------------------------ legality ----
   One template: a 2x2 with rock down its left column and grass down its right. Where it can go
   is completely determined, which makes it the cheapest possible check that the two hard rules
   are both enforced rather than only one of them. */
(function () {
  var lib = [tmpl('left', 2, 2, [cell('R', 1), cell('G', 0), cell('R', 1), cell('G', 0)])];
  var narrow = world([
    '.....',
    '.#...',
    '.#...',
    '.....',
    '.....'
  ]);
  var r2 = box._rtsCliffFit(lib, narrow.N, narrow.rock, narrow.open, 1);
  S.eq('a 1-wide, 2-tall band takes exactly one piece', r2.place.length, 1);
  S.eq('...with its rock column on the rock', r2.place[0].ox, 1);
  S.eq('...and its grass column on the ground beside it', r2.place[0].oz, 1);

  /* Two cells wide, and the piece can only reach the RIGHT column: sitting on the left one
     would put its grass column over blocked rock. So one whole placement, and the inner column
     falls to the single-cell mop-up rather than being left bare. */
  var band = world([
    '.....',
    '.##..',
    '.##..',
    '.....',
    '.....'
  ]);
  var r = box._rtsCliffFit(lib, band.N, band.rock, band.open, 1);
  var whole = r.place.filter(function (p) { return p.only === undefined; });
  S.eq('on a 2-wide band only the outer column can take the piece', whole.length, 1);
  S.eq('...and it is the outer column it takes', whole[0].ox, 2);
  S.eq('...leaving the inner one to the mop-up',
       r.place.filter(function (p) { return p.only !== undefined; }).length, 2);
})();

/* Each rule again on its own, so a mutation that deletes exactly one of them is caught by name
   rather than by a general sweep that might happen to stay legal anyway. */
(function () {
  var w = world([
    '.....',
    '.#...',
    '.#...',
    '.....',
    '.....'
  ]);
  /* A solid 2x2 over a rock column one cell wide: half its rock cells would hang over grass. */
  var solid = [tmpl('slab', 2, 2, [cell('R', 1), cell('R', 1), cell('R', 1), cell('R', 1)])];
  var r = box._rtsCliffFit(solid, w.N, w.rock, w.open, 2);
  S.eq('rock art is never laid over ground a unit can drive on',
       r.place.filter(function (p) { return p.only === undefined; }).length, 0);
  /* Two rules forbid that, and for a library the classifier actually produces the second one
     alone is enough: a cell is only marked R when it carries 0.5 or more rock, which already
     exceeds the spill limit. The R rule is kept as the statement of intent and as the guard if
     the limit is ever raised past 0.5 - so this is asserted rather than left as a surprise. */
  S.ok('a rock-classified cell always exceeds the spill limit, so the two rules overlap',
       box.RTS_CLIFF_MAXOPEN < 0.5, box.RTS_CLIFF_MAXOPEN + ' < the 0.5 that marks a cell R');

  /* Never over ore, a tree or the sea. Painting a template's own grass margin over an ore field
     deletes the ore from the picture while the harvesters keep driving to it. */
  var blob = [tmpl('blob', 2, 2, [cell('R', 1), cell('R', 1), cell('R', 1), cell('E', 1)])];
  var hole = world([
    '.....',
    '.##..',
    '.# ..',
    '.....',
    '.....'
  ]);
  var r2 = box._rtsCliffFit(blob, hole.N, hole.rock, hole.open, 2);
  S.eq('no piece covers a cell that is neither rock nor open ground',
       r2.place.filter(function (p) { return p.only === undefined; }).length, 0);

  /* The spill limit. Two templates identical but for how much rock their right-hand cell
     carries; that cell has to sit on open ground, so 0.45 is refused and 0.35 is not. */
  var over  = [tmpl('over',  2, 1, [cell('R', 1), cell('E', 1, 0.45)])];
  var under = [tmpl('under', 2, 1, [cell('R', 1), cell('E', 1, 0.35)])];
  S.eq('a cell carrying more than the spill limit is refused open ground',
       box._rtsCliffFit(over, w.N, w.rock, w.open, 2)
          .place.filter(function (p) { return p.only === undefined; }).length, 0);
  S.eq('...and one carrying less is not',
       box._rtsCliffFit(under, w.N, w.rock, w.open, 2)
          .place.filter(function (p) { return p.only === undefined; }).length, 2);
})();

/* Every placement, on a map with all three kinds of cell present, must obey the contract. */
(function () {
  var lib = [
    tmpl('blob', 2, 2, [cell('R', 1), cell('R', 1), cell('R', 1), cell('E', 1)]),
    tmpl('edge', 2, 2, [cell('R', 1), cell('G', 0), cell('R', 1), cell('G', 0)]),
    tmpl('wide', 3, 2, [cell('R', 1), cell('R', 1), cell('E', 1),
                        cell('R', 1), cell('R', 1), cell('G', 0)])
  ];
  var w = world([
    '..........',
    '.###......',
    '.###..##..',
    '.....  #..',
    '..#...##..',
    '..#.......',
    '..##......',
    '..........',
    '.......#..',
    '..........'
  ]);
  var r = box._rtsCliffFit(lib, w.N, w.rock, w.open, 7);
  var bad = [], seen = new Uint8Array(w.N * w.N);
  r.place.forEach(function (p) {
    for (var cy = 0; cy < p.t.h; cy++) for (var cx = 0; cx < p.t.w; cx++) {
      var ci = cy * p.t.w + cx;
      if (p.only !== undefined && ci !== p.only) continue;
      var mx = p.ox + cx, mz = p.oz + cy, c = p.t.cells[ci];
      if (mx < 0 || mz < 0 || mx >= w.N || mz >= w.N) { bad.push('offmap ' + mx + ',' + mz); continue; }
      if (seen[mz * w.N + mx]) bad.push('overlap at ' + mx + ',' + mz);
      seen[mz * w.N + mx] = 1;
      var isR = w.rock(mx, mz);
      if (!isR && !w.open(mx, mz)) bad.push('painted a cell that is neither at ' + mx + ',' + mz);
      if (c.kind === 'R' && !isR) bad.push(p.t.img + ' rock cell on open ground at ' + mx + ',' + mz);
      if (c.kind === 'G' && isR) bad.push(p.t.img + ' grass cell on rock at ' + mx + ',' + mz);
      if (!isR && c.cov > box.RTS_CLIFF_MAXOPEN) bad.push(p.t.img + ' spilled ' + c.cov + ' onto open ground');
    }
  });
  S.ok('every placement is legal', bad.length === 0, bad.slice(0, 4).join('; ') || r.place.length + ' placements');

  /* ------------------------------------------------------------- coverage ---- */
  var left = [];
  for (var z = 0; z < w.N; z++) for (var x = 0; x < w.N; x++)
    if (w.rock(x, z) && !r.used[z * w.N + x]) left.push(x + ',' + z);
  S.ok('no blocked cell is left without cliff art on it', left.length === 0, left.join(' '));

  /* The lone rock cell at (7,8) has no whole-template home - it is one cell and every template
     is at least 2x2 with two rock cells. It exists in this map to prove the mop-up fires. */
  var only = r.place.filter(function (p) { return p.only !== undefined; });
  S.ok('a rock cell no template fits gets a single-cell piece instead', only.length > 0,
       only.length + ' single cells of ' + r.place.length + ' placements');

  /* --------------------------------------------------------- determinism ---- */
  var again = box._rtsCliffFit(lib, w.N, w.rock, w.open, 7);
  S.eq('the same map fits the same way twice',
       JSON.stringify(again.place.map(function (p) { return [p.t.img, p.ox, p.oz, p.only]; })),
       JSON.stringify(r.place.map(function (p) { return [p.t.img, p.ox, p.oz, p.only]; })));
})();

/* ------------------------------------------------------------- the seam term ----
   Two candidates that are identical in every way the packer cares about - same size, same cell
   kinds, same rock covered - and differ only in their mask. The west neighbour is already down
   and its right edge is SOLID, so the candidate whose left edge is solid agrees with it and the
   other does not. If the seam term is removed or inverted, this picks the wrong one.

   The map is a 1-wide rock band read left to right, so the second placement always has a
   already-placed neighbour to its west. */
(function () {
  var solid = tmpl('solid', 1, 2, [cell('R', 1), cell('R', 1)]);
  var hollow = tmpl('hollow', 1, 2, [cell('R', 0, 0.9), cell('R', 0, 0.9)]);
  var w = world([
    '.....',
    '.##..',
    '.##..',
    '.....',
    '.....'
  ]);
  /* solid first in the library, then hollow: order alone must not decide it */
  var r = box._rtsCliffFit([solid, hollow], w.N, w.rock, w.open, 3);
  var r2 = box._rtsCliffFit([hollow, solid], w.N, w.rock, w.open, 3);
  function names(res) { return res.place.map(function (p) { return p.t.img; }).join(','); }
  S.eq('four rock cells become two 1x2 columns', r.place.length, 2);
  S.ok('the second column matches the first whichever order the library is in',
       r.place[1].t.img === r.place[0].t.img && r2.place[1].t.img === r2.place[0].t.img,
       names(r) + '  |  ' + names(r2));

  /* And the term is doing it, not luck: drop the seam weight to zero and the tie is settled by
     the position hash instead, which is free to disagree. */
  var keep = box.RTS_CLIFF_SEAMW;
  box.RTS_CLIFF_SEAMW = 0;
  var blind = box._rtsCliffFit([solid, hollow], w.N, w.rock, w.open, 3);
  box.RTS_CLIFF_SEAMW = keep;
  S.ok('with the seam weight at zero the two columns are free to disagree',
       blind.place[0].t.img !== blind.place[1].t.img,
       names(blind) + ' (seam-weighted: ' + names(r) + ')');
})();

/* ------------------------------------------------- a library with nothing solid ----
   The mop-up needs a cell that is nearly all rock. A library without one must not crash and
   must not lie: the cells it cannot reach come back uncovered, which is what tells
   _mixPaintCliffs to leave the drawn cliffs switched on. */
(function () {
  /* A lone rock cell in open ground. No template in this library is 1x1, so nothing whole can
     cover it and the mop-up is the only thing that can. */
  var w = world([
    '.....',
    '.....',
    '..#..',
    '.....',
    '.....'
  ]);
  /* Two rock cells stacked, so nothing whole can sit on one island cell. The top one is nearly
     solid, which is exactly what the mop-up looks for. */
  var solid = [tmpl('post', 1, 2, [cell('R', 1, 0.9), cell('R', 1, 0.9)])];
  var r = box._rtsCliffFit(solid, w.N, w.rock, w.open, 5);
  S.eq('a 1x1 island is reached by a single cell of a bigger template', r.place.length, 1);
  S.eq('...and only that one cell of it is painted', r.place[0].only !== undefined, true);

  /* The same shape, but no cell carries enough rock to serve as a boulder, so the mop-up has
     nothing to use. It must return quietly with the cell uncovered - _mixPaintCliffs then
     reports a non-zero remainder and the drawn cliffs stay switched on. */
  var faint = [tmpl('faint', 1, 2, [cell('R', 1, 0.55), cell('R', 1, 0.55)])];
  var r2 = box._rtsCliffFit(faint, w.N, w.rock, w.open, 5);
  S.eq('a library with no nearly-solid cell leaves the island uncovered', r2.used[2 * w.N + 2], 0);
  S.ok('...and does not invent a mop-up piece to do it', r2.place.length === 0,
       r2.place.length + ' placements');
})();

/* ----------------------------------------------------------- the constants ----
   Both are tuning numbers with a measurement behind them in the source; they are asserted here
   so a stray edit that zeroes one is a failing test rather than a quietly worse map. */
S.ok('the seam weight is on', box.RTS_CLIFF_SEAMW > 0, String(box.RTS_CLIFF_SEAMW));
S.ok('a template cell may not spill more than 40% rock onto driveable ground',
     box.RTS_CLIFF_MAXOPEN > 0 && box.RTS_CLIFF_MAXOPEN <= 0.4, String(box.RTS_CLIFF_MAXOPEN));

require('../lib/report.js')(S);
