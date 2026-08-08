/* The shared template packer, and the facing term the shoreline needed.

   No artwork is involved. _rtsTemFit takes a library, a map size and a handful of callbacks, and
   _rtsTemMasks takes decoded tiles - both are pure, which is the entire reason they live in
   mixart/fit.js rather than inside the two callers. The cliff side of the packer is covered by
   test/unit/cliffs; this covers what the shore added.

   THE FACING TERM is the one that matters. Legality alone cannot orient a shoreline: on a coast
   running north-south our sand ring is one cell wide, and a piece with sand on top and water
   underneath is perfectly legal while drawing a south-facing beach on a west-facing shore. That
   was not a hypothetical - it is what the first version shipped into a screenshot, a staircase of
   little wave lines up the coast. The fix was to score each candidate on whether its own picture
   agrees with the map, and nothing but a test will catch that dying.

   THE MASK WINDOW is the other. Material masks are computed over a whole template and sliced
   afterwards, not cell by cell, because the closing window has to see across a cell boundary -
   and the seam scoring is entirely about what happens at those boundaries, so a mask that thins
   itself there would be measuring an artefact of its own making. */

var { Suite } = require('../lib/assert.js');
var { load } = require('../lib/sandbox.js');

var S = new Suite('shore');
/* bake.js only for RTS_TS - the packer's one dependency outside itself. */
var box = load(['src/sprites/bake.js', 'src/mixart/fit.js']);
var TS = box.RTS_TS;

/* A 1x1 piece whose picture is a solid block on one side and empty on the other, so "does this
   piece agree with the map" has an unambiguous answer. `side` is which half carries the material. */
function piece(img, side) {
  var cm = new Uint8Array(TS * TS), m = new Uint8Array(TS * TS);
  for (var y = 0; y < TS; y++) for (var x = 0; x < TS; x++) {
    var on = side === 'E' ? x >= TS / 2 : side === 'W' ? x < TS / 2
           : side === 'S' ? y >= TS / 2 : side === 'N' ? y < TS / 2
           : side === 'all';
    cm[y * TS + x] = on ? 2 : 0;
    m[y * TS + x] = on ? 1 : 0;
  }
  return { img: img, w: 1, h: 1, cells: [{ px: new Uint8Array(TS * TS), cm: cm, m: m }] };
}

/* ------------------------------------------------------- the facing term ----
   A map that is water to the EAST of the shore cell. The piece whose water is on its east side
   is the only right answer; every candidate is equally legal. */
(function () {
  var N = 5, shore = [2, 2];
  function needs(x, z) { return x === shore[0] && z === shore[1]; }
  /* 1 where the water is, 0 on the land - read at pixel resolution, as the real one is */
  function want(px) { return px >= (shore[0] + 0.5) * TS ? 2 : 0; }
  function match(cell, mx, mz) {
    var same = 0, n = 0;
    for (var y = 0; y < TS; y += 3) for (var x = 0; x < TS; x += 3) {
      if (cell.cm[y * TS + x] === want(mx * TS + x)) same++;
      n++;
    }
    return same / n;
  }
  var lib = [piece('north', 'N'), piece('south', 'S'), piece('east', 'E'), piece('west', 'W')];
  var r = box._rtsTemFit(lib, N, {
    seed: 1, needs: needs, match: match,
    fits: function (cell, mx, mz) { return mx === shore[0] && mz === shore[1]; }
  });
  S.eq('one shore cell takes one piece', r.place.length, 1);
  S.eq('...the one whose water lies where the water is', r.place[0].t.img, 'east');

  /* And it is the term doing it, not the library order: reversed, and with the weight off. */
  var rev = box._rtsTemFit(lib.slice().reverse(), N, {
    seed: 1, needs: needs, match: match,
    fits: function (cell, mx, mz) { return mx === shore[0] && mz === shore[1]; }
  });
  S.eq('...whichever order the library is in', rev.place[0].t.img, 'east');

  var keep = box.RTS_TEM_MATCHW;
  box.RTS_TEM_MATCHW = 0;
  var blind = box._rtsTemFit(lib, N, {
    seed: 1, needs: needs, match: match,
    fits: function (cell, mx, mz) { return mx === shore[0] && mz === shore[1]; }
  });
  box.RTS_TEM_MATCHW = keep;
  S.ok('with the facing weight at zero the choice is no longer about the picture',
       blind.place[0].t.img !== 'east', 'picked ' + blind.place[0].t.img);
  S.ok('the facing weight outranks the seam weight, because a wrong facing is worse than a seam',
       box.RTS_TEM_MATCHW > box.RTS_TEM_SEAMW,
       box.RTS_TEM_MATCHW + ' vs ' + box.RTS_TEM_SEAMW);
})();

/* A whole coast, so the assertion is about a line rather than one cell: water everywhere east of
   x=3, shore cells down the column at x=2. Every one of them must face east. */
(function () {
  var N = 8, SX = 2;
  function needs(x, z) { return x === SX && z >= 1 && z <= 6; }
  function match(cell, mx, mz) {
    var same = 0, n = 0;
    for (var y = 0; y < TS; y += 3) for (var x = 0; x < TS; x += 3) {
      if (cell.cm[y * TS + x] === ((mx * TS + x) >= (SX + 0.5) * TS ? 2 : 0)) same++;
      n++;
    }
    return same / n;
  }
  var lib = [piece('north', 'N'), piece('south', 'S'), piece('east', 'E'), piece('west', 'W')];
  var r = box._rtsTemFit(lib, N, {
    seed: 9, needs: needs, match: match,
    fits: function (cell, mx, mz) { return needs(mx, mz); }
  });
  var wrong = r.place.filter(function (p) { return p.t.img !== 'east'; });
  S.eq('a six-cell coast takes six pieces', r.place.length, 6);
  S.ok('...and every one of them faces the water', !wrong.length,
       wrong.map(function (p) { return p.t.img + '@' + p.ox + ',' + p.oz; }).join(' ') || 'all east');
})();

/* --------------------------------------------------- masks span the template ----
   Two cells side by side, the left one solid material and the right one empty. The closing
   window is 5x5, so the right cell's first two pixel columns sit within reach of the left cell's
   material and must come back set. Sliced per cell first, they could not. */
(function () {
  var grass = new Uint8Array(256);
  grass[0] = 1;                                  /* index 0 is plain ground, 1 is material */
  var left = new Uint8Array(TS * TS), right = new Uint8Array(TS * TS);
  for (var i = 0; i < TS * TS; i++) { left[i] = 1; right[i] = 0; }
  var masks = box._rtsTemMasks({ tile: [left, right] }, 2, 1, grass);
  S.eq('a solid cell masks solid', masks[0].cov, 1);
  S.ok('...and its neighbour picks up material across the cell boundary',
       masks[1].m[0] === 1, 'first pixel of the empty cell: ' + masks[1].m[0] +
       ', coverage ' + masks[1].cov.toFixed(3));
  S.ok('...but only within the window, not across the whole cell',
       masks[1].cov < 0.2, 'coverage ' + masks[1].cov.toFixed(3));

  /* A hole is not art: no tile, no material, no coverage. */
  var holed = box._rtsTemMasks({ tile: [left, null] }, 2, 1, grass);
  S.eq('a hole in a template masks to nothing', holed[1].cov, 0);
})();

require('../lib/report.js')(S);
