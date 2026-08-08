/* The wall connection mask.

   This is the one piece of the tileset that is a plain autotile, and the whole of it is one
   arithmetic expression: RA's overlay walls are 16 frames indexed by which orthogonal neighbours
   are also wall, N=1 E=2 S=4 W=8. There is nothing to fit and nothing to score - it either joins
   or the bit order is wrong, and a transposed pair is invisible in code review and obvious only
   once somebody looks at a screenshot of a corner.

   The bit order was established by building walls out of it against the real sbag.shp and
   looking; what is pinned here is that the expression still says the same thing, because every
   frame of that art is meaningless if this drifts. */

var { Suite } = require('../lib/assert.js');
var { load } = require('../lib/sandbox.js');

var S = new Suite('walls');
var box = load(['src/sprites/bake.js', 'src/mixart/walls.js']);

/* A map is a string per row; '#' is wall. */
function world(rows) {
  return function (x, z) {
    return z >= 0 && z < rows.length && x >= 0 && x < rows[z].length && rows[z][x] === '#';
  };
}

/* -------------------------------------------------------------- the bits ----
   One wall cell with exactly one neighbour, four times over. Each must light exactly its own
   bit, which is what catches a transposition - swapping N and S leaves the total right and every
   corner wrong. */
(function () {
  var cases = [
    { name: 'north', rows: ['.#.', '.#.', '...'], at: [1, 1], want: 1 },
    { name: 'east',  rows: ['...', '.##', '...'], at: [1, 1], want: 2 },
    { name: 'south', rows: ['...', '.#.', '.#.'], at: [1, 1], want: 4 },
    { name: 'west',  rows: ['...', '##.', '...'], at: [1, 1], want: 8 }
  ];
  cases.forEach(function (c) {
    S.eq('a neighbour to the ' + c.name + ' sets its own bit',
         box._rtsWallMask(world(c.rows), c.at[0], c.at[1]), c.want);
  });
})();

/* And the combinations the art is actually indexed by. */
(function () {
  var w = world([
    '.....',
    '..#..',
    '.###.',
    '..#..',
    '.....'
  ]);
  S.eq('a cross is all four bits', box._rtsWallMask(w, 2, 2), 15);
  S.eq('the top of the cross joins only downward', box._rtsWallMask(w, 2, 1), 4);
  S.eq('the left arm joins only eastward', box._rtsWallMask(w, 1, 2), 2);
  S.eq('the right arm joins only westward', box._rtsWallMask(w, 3, 2), 8);
  S.eq('the bottom joins only upward', box._rtsWallMask(w, 2, 3), 1);

  var l = world([
    '.....',
    '.#...',
    '.#...',
    '.##..',
    '.....'
  ]);
  S.eq('a corner turning north-to-east is N|E', box._rtsWallMask(l, 1, 3), 1 | 2);
  S.eq('...the cell above it runs straight north-south', box._rtsWallMask(l, 1, 2), 1 | 4);
  S.eq('...and the end of the arm joins only westward', box._rtsWallMask(l, 2, 3), 8);

  S.eq('a lone post joins nothing', box._rtsWallMask(world(['...', '.#.', '...']), 1, 1), 0);
  /* Diagonals are not connections - a wall joins along its own axes only, and counting them
     would ask for frames past 15 that do not exist. */
  S.eq('a diagonal neighbour is not a connection',
       box._rtsWallMask(world(['#..', '.#.', '..#']), 1, 1), 0);
})();

/* Every mask the game can ask for has to be one the art has. */
(function () {
  var seen = {}, w = world([
    '#####',
    '#...#',
    '#.#.#',
    '#...#',
    '#####'
  ]);
  for (var z = 0; z < 5; z++) for (var x = 0; x < 5; x++) {
    if (!w(x, z)) continue;
    seen[box._rtsWallMask(w, x, z)] = 1;
  }
  var bad = Object.keys(seen).filter(function (m) { return m < 0 || m > 15; });
  S.ok('every mask a layout produces is inside the 16 frames the art has', !bad.length,
       bad.join(',') || Object.keys(seen).sort(function (a, b) { return a - b; }).join(','));
})();

S.eq('the wall art is the sandbag set', box.RTS_WALL_SHP, 'sbag.shp');

require('../lib/report.js')(S);
