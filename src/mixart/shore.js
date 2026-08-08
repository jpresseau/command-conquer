/* mixart/shore.js - Red Alert's own Beach tiles, laid along a generated map's coastline.
   Part of rts.mixart, the player's own artwork. The packer is in mixart/fit.js.

   WHAT THIS REPLACES. With the player's files loaded, grass and water were already painted from
   real templates - but the sand and the water were then painted OVER, flat, from RTS_PAL, in 2px
   noise blocks clipped to the cell grid. Next to RA's own grass that read as a 24-pixel staircase
   of beige and blue: the one place on the map where you could still count the cells.

   THE PIECES ARE SINGLE CELLS, not templates, and that is the one real surprise here. Fitting
   whole Beach templates the way the cliffs are fitted WORKS - 98% of sand cells covered, legally,
   off the tileset's own classes, which unlike the Cliffs table say what each cell is and mean it
   (sh01 is "---k-ccbbwwiww--w---", one letter per cell in position order). It just draws the
   wrong coast. Our sand ring is one or two cells wide, so a template with sand on top and water
   underneath passes every class check while putting a south-facing beach on a west-facing shore,
   and stacked up the coast that reads as a staircase of little wave lines.

   Scored against the map's own waterline, whole templates average 0.82 agreement and cannot be
   pushed past 0.84 however hard the facing term is weighted. Picking the best SINGLE cell out of
   the library instead reaches 0.96 on the same measure. The footprints were the constraint, not
   the library - so what is loaded here is one 1x1 entry per cell of every Beach template, handed
   to the same packer, which still gets to break ties on the seam with the neighbour already down.

   And nothing reads the class letters in the end. The choice is made on what a cell DRAWS against
   what the map says is there, which is why EVERY cell is a candidate rather than only the ones
   the table calls beach: the clear-classed ones are what carry the landward edge. */
/* Two coasts, one machine. 'B' is the Beach set and its middle material is sand; 'W' is the
   Water Cliffs set and its middle material is rock. Everything else about them is identical -
   a strip of something between the sea and the land, with an edge at each side - so they share
   the library builder, the fields and the picker. */
var _RTS_COASTLIB = {};

function _mixCoastLib(cat) {
  if (_RTS_COASTLIB[cat] !== undefined) return _RTS_COASTLIB[cat];
  _RTS_COASTLIB[cat] = null;
  if (!_rtsArtReady() || typeof RA_TILETAB === 'undefined') return null;
  var ex = _rtsThExt(), grass = _rtsTemGrassSet(), wet = _mixWaterSet();
  if (!grass || !wet) return null;

  var lib = [];
  Object.keys(RA_TILETAB).forEach(function (id) {
    var rec = RA_TILETAB[id];
    if (rec.cat !== cat) return;
    var tem = _mixTiles(rec.img + ex);
    if (!tem || tem.n < rec.w * rec.h) return;
    var masks = _rtsTemMasks(tem, rec.w, rec.h, grass);
    for (var c = 0; c < rec.w * rec.h; c++) {
      var px = tem.tile[c];
      if (!px) continue;
      /* What this cell DRAWS, pixel by pixel: 2 water, 0 plain ground, 1 for everything else -
         which is sand in the Beach set and rock in the Water Cliffs set, and needs no separate
         rule because both are simply "not grass and not water". That is the whole basis of
         choosing a cell, and it needs no class letter at all - which is why EVERY cell of every
         template is a candidate here, not only the ones the table names. The grass-bearing ones
         are what carry the landward edge. */
      var cm = new Uint8Array(RTS_TS * RTS_TS);
      for (var i = 0; i < RTS_TS * RTS_TS; i++)
        cm[i] = wet[px[i]] ? 2 : (grass[px[i]] ? 0 : 1);
      lib.push({ img: rec.img + '#' + c, w: 1, h: 1,
                 cells: [{ px: px, m: masks[c].m, cm: cm }] });
    }
  });
  if (!lib.length) return null;
  /* Sorted by name so the choice is identical whatever order the keys came back in - a generated
     map has to be the same map on every machine. */
  lib.sort(function (a, b) { return a.img < b.img ? -1 : (a.img > b.img ? 1 : 0); });
  return (_RTS_COASTLIB[cat] = lib);
}

/* Which palette indices are OPEN WATER. Same trick as the grass set and for the same reason:
   w1.tem and w2.tem are nothing but water, so their indices are the definitive answer and no
   colour threshold has to be invented. */
function _mixWaterSet() {
  var ex = _rtsThExt(), out = new Uint8Array(256), any = false;
  ['w1', 'w2'].forEach(function (nm) {
    var t = _mixTiles(nm + ex);
    if (!t) return;
    for (var c = 0; c < t.tile.length; c++) {
      var tl = t.tile[c];
      if (!tl) continue;
      any = true;
      for (var i = 0; i < RTS_TS * RTS_TS; i++) out[tl[i]] = 1;
    }
  });
  return any ? out : null;
}

/* Stamp one kind of coast into the baked terrain's pixels. `midAt` says which cells this pass
   owns - the sand ring for a beach, the rock that meets the sea for a headland - and everything
   else follows from it. Returns the number of those cells left without art (zero, since every one
   takes a 1x1 piece) or null when there was no artwork, which is the ordinary case and what
   leaves the drawn sand and water switched on. */
function _mixPaintCoast(d, S, G, seed, cat, midAt) {
  var lib = _mixCoastLib(cat);
  if (!lib) return null;
  var N = RTS_N, TS = RTS_TS;
  var sandAt = midAt;

  /* THE TWO EDGES ARE SCORED SEPARATELY, and that is the whole trick. A shore cell carries a
     waterline, a grass line, or - where the ring is one cell wide - both.

     Each edge gets its own field: 1 where the far material is, 0 where the near one is, and 0.5
     on the shore cells that carry that edge, so the 0.5 contour runs THROUGH those cells rather
     than along their border. Sampled at cell centres and interpolated, the same trick the drawn
     cliffs use, so it arrives as a curve instead of a staircase.

     Asking one question at a time is what makes this answerable. Measured as the best any tile in
     the library can do, averaged over every sand cell on seed 31: the waterline alone scores
     0.962 and the grass line alone 0.935, but a single three-way question - grass here, sand
     there, water beyond - collapses to 0.757, because the field then asks for 78% sand per cell
     and RA has no wide-sand tile; its beaches are narrow. Scoring the two edges and averaging
     lands at 0.898 and draws both.

     It does mean a driveable cell carries some water in the picture. That is the same
     art-versus-blocking trade the cliffs make, and the same one the original makes: RA classes
     those cells 'b' and passable while drawing the waterline straight across them. */
  function terr(x, z) { return _rtsInB(x, z) ? G.terrain[_rtsIdx(x, z)] : -1; }
  function isWater(x, z) { return terr(x, z) === RTS_T_WATER; }
  /* The landward side is anything on the map that is neither the sea nor this pass's own
     material. For a beach that is grass, trees and rock; for a headland it is the beach too. */
  function isLand(x, z) { return terr(x, z) >= 0 && !isWater(x, z) && !midAt(x, z); }
  function wetF(x, z) {
    if (isWater(x, z)) return 1;
    if (!sandAt(x, z)) return 0;
    return (isWater(x - 1, z) || isWater(x + 1, z) || isWater(x, z - 1) || isWater(x, z + 1)) ? 0.5 : 0;
  }
  function dryF(x, z) {
    if (isLand(x, z)) return 1;
    if (!sandAt(x, z)) return 0;
    return (isLand(x - 1, z) || isLand(x + 1, z) || isLand(x, z - 1) || isLand(x, z + 1)) ? 0.5 : 0;
  }
  function bilinear(f, px, py) {
    var u = px / TS - 0.5, v = py / TS - 0.5;
    var x0 = Math.floor(u), y0 = Math.floor(v), fx = u - x0, fy = v - y0;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    var a = f(x0, y0), b = f(x0 + 1, y0), c = f(x0, y0 + 1), e = f(x0 + 1, y0 + 1);
    return (a + (b - a) * fx) * (1 - fy) + (c + (e - c) * fx) * fy;
  }
  /* Every third pixel is plenty - 64 samples a cell. The coast moves by whole pixels, not
     fractions of one, and sampling all 576 is sixteen times the work for the same decision.

     WHAT THE MAP WANTS IS WORKED OUT ONCE PER CELL, not once per candidate, and that is not a
     micro-optimisation - it is the difference between 27 thousand field evaluations and fourteen
     million. Written the obvious way, with the two fields sampled inside the comparison, this
     took 2038 ms of a 3141 ms terrain bake for 429 sand cells. The expectation does not depend on
     which tile is being considered, so it is computed once and the 516 candidates are compared
     against a packed 64-byte answer: bit 0 is "water belongs here", bit 1 is "plain ground does". */
  var SAMPLES = [], sy, sx;
  for (sy = 0; sy < TS; sy += 3) for (sx = 0; sx < TS; sx += 3) SAMPLES.push(sy * TS + sx);
  var want = new Array(N * N);
  function wantAt(mx, mz) {
    var k = mz * N + mx, w = want[k];
    if (w) return w;
    w = new Uint8Array(SAMPLES.length);
    for (var i = 0; i < SAMPLES.length; i++) {
      var o = SAMPLES[i], gx = mx * TS + (o % TS), gy = mz * TS + ((o / TS) | 0);
      w[i] = (bilinear(wetF, gx, gy) > 0.5 ? 1 : 0) | (bilinear(dryF, gx, gy) > 0.5 ? 2 : 0);
    }
    return (want[k] = w);
  }
  function match(cell, mx, mz) {
    var w = wantAt(mx, mz), cm = cell.cm, same = 0, n = SAMPLES.length;
    for (var i = 0; i < n; i++) {
      var k = cm[SAMPLES[i]], e = w[i];
      if ((k === 2) === !!(e & 1)) same++;
      if ((k === 0) === !!(e & 2)) same++;
    }
    return same / (2 * n);
  }

  var res = _rtsTemFit(lib, N, {
    seed: seed,
    needs: midAt,
    match: match,
    fits: function (cell, mx, mz) { return midAt(mx, mz); }
  });
  _rtsTemPaint(d, S, res);

  var left = 0;
  for (var z = 0; z < N; z++) for (var x = 0; x < N; x++)
    if (midAt(x, z) && !res.used[z * N + x]) left++;
  return left;
}

/* The beach: RA's Beach set over the sand ring. */
function _mixPaintShore(d, S, G, seed) {
  return _mixPaintCoast(d, S, G, seed, 'B', function (x, z) {
    return _rtsInB(x, z) && G.terrain[_rtsIdx(x, z)] === RTS_T_SAND;
  });
}

/* The headland: RA's Water Cliffs set over rock that MEETS THE SEA. Only those cells - a rock
   cell further inland is an ordinary cliff and mixart/cliffs.js owns it, which is why that fit
   refuses them rather than both passes painting the same ground.

   There was nowhere to put these until the generator stopped laying sand over every ridge that
   reached the shore; before that, rock adjacent to water was zero cells on every seed measured.
   It is still the smallest of the coasts - about 22 cells a map - and on the two seeds whose
   channel is short enough that both keep-a-beach zones cover it, close to none. */
function _rtsSeaCliffAt(G, x, z) {
  if (!_rtsInB(x, z) || G.terrain[_rtsIdx(x, z)] !== RTS_T_ROCK) return false;
  return (_rtsInB(x - 1, z) && G.terrain[_rtsIdx(x - 1, z)] === RTS_T_WATER) ||
         (_rtsInB(x + 1, z) && G.terrain[_rtsIdx(x + 1, z)] === RTS_T_WATER) ||
         (_rtsInB(x, z - 1) && G.terrain[_rtsIdx(x, z - 1)] === RTS_T_WATER) ||
         (_rtsInB(x, z + 1) && G.terrain[_rtsIdx(x, z + 1)] === RTS_T_WATER);
}

function _mixPaintSeaCliffs(d, S, G, seed) {
  return _mixPaintCoast(d, S, G, seed, 'W', function (x, z) { return _rtsSeaCliffAt(G, x, z); });
}
