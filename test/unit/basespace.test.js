/* The opponent may not wall off its own ground - _rtsSealsGround in core/basezone.js.

   The AI put each building on the legal cell nearest its anchor, packing its base tight, and
   nothing asked what a new footprint closed off. On seed 9004 the pocket it sealed was the one
   its barracks delivers into, and some twenty infantry stood in it for the rest of the match.
   e2e/basespace measures that on real matches; this holds the test itself, on grids drawn by
   hand, where each case is exactly one shape.

   Grids are written as rows of text: '#' blocked, '.' open. The map is RTS_N square and open
   everywhere the picture does not reach. */

var { Suite } = require('../lib/assert.js');
var { load } = require('../lib/sandbox.js');

var S = new Suite('basespace');
var g = load(['src/rules', 'src/core']);
var N = g.RTS_N;

/* draw `rows` with their top-left at (ox, oz) */
function grid(rows, ox, oz) {
  var blocked = new Uint8Array(N * N);
  rows.forEach(function (r, z) {
    for (var x = 0; x < r.length; x++) if (r[x] === '#') blocked[(oz + z) * N + ox + x] = 1;
  });
  g.window._rtsG = { blocked: blocked, terrain: new Uint8Array(N * N) };
}
var O = 40;

/* ---- 1. open ground: nothing to seal ---- */
grid([], O, O);
S.eq('a building in open ground seals nothing', g._rtsSealsGround(O, O, 2, 2), false);

/* ---- 2. the barracks pocket: a one-cell lane between buildings whose only way out is the
   2x2 slot at its mouth. The nearest-cell rule would fill the slot. ---- */
var pocket = [
  '######...',
  '#.........',
  '######...'
];
grid(pocket, O, O);
S.eq('the lane is open to begin with', g._rtsSealsGround(O + 20, O + 20, 1, 1), false);
S.eq('filling the only way out of a lane seals it', g._rtsSealsGround(O + 6, O, 2, 2), true);
/* the control: the same building a cell further along leaves the lane's mouth clear */
S.eq('...and the same building beside the mouth does not', g._rtsSealsGround(O + 7, O + 1, 2, 2), false);

/* ---- 3. a pocket that was ALREADY enclosed (a ring of rock) is not this building's doing ---- */
var ring = [
  '#####',
  '#...#',
  '#...#',
  '#####'
];
grid(ring, O, O);
S.eq('ground the rocks already enclosed is not held against a building beside it',
     g._rtsSealsGround(O + 6, O, 2, 2), false);
/* and filling that enclosed hole exactly closes off nothing that was open */
S.eq('...nor against one built inside it', g._rtsSealsGround(O + 1, O + 1, 3, 2), false);

/* ---- 4. a one-cell corridor to a dead end: blocking the corridor cuts off the room ---- */
var corridor = [
  '#######',
  '#.....#',
  '###.###',
  '###.###',
  '###.###'
];
grid(corridor, O, O);
S.eq('a building across the only corridor into a room seals the room',
     g._rtsSealsGround(O + 3, O + 3, 1, 1), true);

/* ---- 5. a gap open only across two building corners counts as closed ---- */
var corner = [
  '###.',
  '#..#',
  '#..#',
  '####'
];
grid(corner, O, O);
/* the 2x2 room's only link out is the diagonal at its top-right; four-way flooding reads it
   as already enclosed, so nothing here is a NEW seal - the cautious reading costs nothing */
S.eq('a room open only across a diagonal is read as enclosed already', g._rtsSealsGround(O + 5, O, 1, 1), false);
/* but turning an orthogonal exit into a diagonal-only one is a seal */
var nearly = [
  '###..',
  '#..#.',
  '#....',
  '#####'
];
grid(nearly, O, O);
S.eq('...and closing a room down to a diagonal-only gap seals it', g._rtsSealsGround(O + 3, O + 2, 1, 1), true);

/* ---- 6. the map edge is not a wall to flood around ---- */
grid(['#.', '#.'], 0, 0);
S.eq('near the map edge, open ground still reads as open', g._rtsSealsGround(3, 3, 2, 2), false);

/* ---- 7. the kill switch e2e/basespace uses for its before-picture ---- */
grid(pocket, O, O);
g.window.RTS_OPEN_OFF = true;
S.eq('with RTS_OPEN_OFF the check stands aside', g._rtsSealsGround(O + 6, O, 2, 2), false);
g.window.RTS_OPEN_OFF = false;

require('../lib/report.js')(S);
