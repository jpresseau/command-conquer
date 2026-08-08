/* mixart/cliffs.js - Red Alert's own cliff templates, fitted onto a generated map's rock.
   Part of rts.mixart, the player's own artwork. The packer itself is in mixart/fit.js, which
   also carries the measurement that ruled out chaining these.

   WHY THE SHAPE HAS TO COME FROM THE PIXELS. The tileset's own terrain classes are no help here:
   nearly every cell of every Cliffs template classifies as 'k', because the class encodes
   PASSABILITY, not shape. All 38 templates look identical to a bitmask lookup. (The Road and
   Beach tables are not like this - see mixart/shore.js, where the classes are used directly.)

   Splitting rock from grass by colour does not work either: this tileset dithers its grass with
   near-black neutrals that the rock shadows also use, and a green-versus-not test called 65% of a
   mostly-grass cell rock. What IS unambiguous is the index set - see _rtsTemGrassSet. */
var _RTS_CLIFFLIB;

function _mixCliffLib() {
  if (_RTS_CLIFFLIB !== undefined) return _RTS_CLIFFLIB;
  _RTS_CLIFFLIB = null;
  if (!_rtsArtReady() || typeof RA_TILETAB === 'undefined') return null;
  var ex = _rtsThExt(), grass = _rtsTemGrassSet();
  if (!grass) return null;

  var lib = [];
  Object.keys(RA_TILETAB).forEach(function (id) {
    var rec = RA_TILETAB[id];
    if (rec.cat !== 'C') return;
    var tem = _mixTiles(rec.img + ex);
    if (!tem || tem.n < rec.w * rec.h) return;
    var masks = _rtsTemMasks(tem, rec.w, rec.h, grass), cells = [];
    for (var c = 0; c < rec.w * rec.h; c++) {
      var px = tem.tile[c] || null, cov = masks[c].cov;
      /* R must land on rock, G must land on open ground, E fits either. A hole in the template
         is not art at all, so it behaves like G: it may not cover a blocked cell. */
      cells.push({ cov: cov, px: px, m: masks[c].m,
                   kind: !px ? 'G' : (cov >= 0.5 ? 'R' : (cov <= 0.25 ? 'G' : 'E')) });
    }
    lib.push({ img: rec.img, w: rec.w, h: rec.h, cells: cells });
  });
  /* Sorted by name so the fit is identical whatever order the keys came back in - a generated
     map has to be the same map on every machine. */
  lib.sort(function (a, b) { return a.img < b.img ? -1 : (a.img > b.img ? 1 : 0); });
  return lib.length ? (_RTS_CLIFFLIB = lib) : null;
}

/* How much rock a template cell may carry before it is refused a spot on DRIVEABLE ground.
   The two errors are not symmetrical. Art that spills rock onto open ground makes a route look
   closed when it is open - irritating. Art that leaves a blocked cell looking like grass makes a
   route look open when it is closed, and a player who orders a unit through it watches it refuse.
   The original takes the second error: RA blocks a cliff template's whole footprint, grassy
   margin cells included. This takes the first.

   The limit trades coverage for spill, measured on seed 31: no limit covers every rock cell but
   paints 29% rock over 283 open ones; 0.4 leaves 6 cells for the mop-up and paints 21%; 0.35
   leaves 21 and paints 17%. 0.4 is the knee - and it IMPROVES the seams as a side effect
   (91.8% -> 93.0%), because a piece whose rock runs off its edge is now often refused. */
var RTS_CLIFF_MAXOPEN = 0.4;

/* The two halves of the cliff fit that need no artwork: which cells may carry which piece, and
   which pieces are solid enough to serve as a lone boulder. Pulled out as their own functions so
   both stay testable - the packer moved to mixart/fit.js and _mixPaintCliffs below cannot run
   without a decoded temperat.mix, but these are just arithmetic over a library. */
function _rtsCliffRules(rockAt, openAt) {
  return {
    needs: rockAt,
    fits: function (cell, mx, mz) {
      var r = rockAt(mx, mz);
      if (!r && !openAt(mx, mz)) return false;   /* never over ore, a tree or the sea */
      if (cell.kind === 'R' && !r) return false;
      if (cell.kind === 'G' && r) return false;
      return r || cell.cov <= RTS_CLIFF_MAXOPEN;
    }
  };
}

/* The nearly-solid cells - the piece the original itself uses for a lone boulder when a rock cell
   defeats every whole-template offset. */
function _rtsCliffFill(lib) {
  var fill = [];
  lib.forEach(function (t) {
    t.cells.forEach(function (cell, i) {
      if (cell.px && cell.cov >= 0.7) fill.push({ t: t, i: i });
    });
  });
  return fill;
}

/* Stamp the fitted cliffs into the baked terrain's pixels. Returns the number of blocked rock
   cells left uncovered, so the caller knows whether it still needs its own drawn cliffs; null
   means there was no artwork to work with at all. */
function _mixPaintCliffs(d, S, G, seed) {
  var lib = _mixCliffLib();
  if (!lib) return null;
  var N = RTS_N;
  function rockAt(x, z) { return _rtsInB(x, z) && G.terrain[_rtsIdx(x, z)] === RTS_T_ROCK; }
  function openAt(x, z) { return _rtsInB(x, z) && G.terrain[_rtsIdx(x, z)] === RTS_T_GRASS; }

  var rules = _rtsCliffRules(rockAt, openAt);
  var res = _rtsTemFit(lib, N, {
    seed: seed, needs: rules.needs, fits: rules.fits, fill: _rtsCliffFill(lib)
  });
  _rtsTemPaint(d, S, res);

  var left = 0;
  for (var z = 0; z < N; z++) for (var x = 0; x < N; x++)
    if (rockAt(x, z) && !res.used[z * N + x]) left++;
  return left;
}
