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
var _RTS_SHORELIB;

function _mixShoreLib() {
  if (_RTS_SHORELIB !== undefined) return _RTS_SHORELIB;
  _RTS_SHORELIB = null;
  if (!_rtsArtReady() || typeof RA_TILETAB === 'undefined') return null;
  var ex = _rtsThExt(), grass = _rtsTemGrassSet(), wet = _mixWaterSet();
  if (!grass || !wet) return null;

  var lib = [];
  Object.keys(RA_TILETAB).forEach(function (id) {
    var rec = RA_TILETAB[id];
    if (rec.cat !== 'B') return;
    var tem = _mixTiles(rec.img + ex);
    if (!tem || tem.n < rec.w * rec.h) return;
    var masks = _rtsTemMasks(tem, rec.w, rec.h, grass);
    for (var c = 0; c < rec.w * rec.h; c++) {
      var px = tem.tile[c];
      if (!px) continue;
      /* What this cell DRAWS, pixel by pixel: 2 water, 0 plain ground, 1 sand for everything
         else. That is the whole basis of choosing it, and it needs no class letter at all -
         which is why every cell of every Beach template is a candidate here, not only the ones
         the table calls beach. The grass-bearing cells are what carry the landward edge. */
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
  return (_RTS_SHORELIB = lib);
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

/* Stamp the shoreline into the baked terrain's pixels. Returns the number of sand cells left
   without art - zero, since every sand cell takes a 1x1 piece - or null when there was no
   artwork, which is the ordinary case and what leaves the drawn sand and water switched on. */
function _mixPaintShore(d, S, G, seed) {
  var lib = _mixShoreLib();
  if (!lib) return null;
  var N = RTS_N, TS = RTS_TS;
  function sandAt(x, z) { return _rtsInB(x, z) && G.terrain[_rtsIdx(x, z)] === RTS_T_SAND; }

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
  function isLand(x, z) { var t = terr(x, z); return t >= 0 && t !== RTS_T_SAND && t !== RTS_T_WATER; }
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
    needs: sandAt,
    match: match,
    fits: function (cell, mx, mz) { return sandAt(mx, mz); }
  });
  _rtsTemPaint(d, S, res);

  var left = 0;
  for (var z = 0; z < N; z++) for (var x = 0; x < N; x++)
    if (sandAt(x, z) && !res.used[z * N + x]) left++;
  return left;
}

/* ------------------------------------------------------------------- roads --
   THE ROAD TEMPLATES CANNOT DRAW OUR ROADS, and this is what is left after establishing that.
   Measured three ways on the 45 temperate Road templates:

     - fitting them the way the cliffs and the shore are fitted covers every road cell and
       produces camouflage: a scatter of disconnected track fragments pointing every way at once,
       because a road's continuity is the whole point and a packer has no notion of it;
     - chaining is not available either - 35 of the 45 keep their track INSIDE the footprint with
       clear margins all round, so there are no ends to join;
     - and there is no fill tile: no cell in the entire Road set is more than 55% packed earth,
       against the 100% sand tiles the Beach set has. The best in the whole temperate tileset is
       f06#5 at 0.71, a ford approach.

   The reason is structural, not a gap in the library: our roads are 2-4 cell wide carved swathes
   and RA's road art is a narrow track with grass either side. They are different things wearing
   the same name, and the fix for that is narrower roads, which is a terrain change with pathing
   consequences rather than an art one.

   What CAN be taken is the colour. The drawn road stays drawn, painted in the tileset's own
   packed earth rather than in ours, which is the same mismatch the drawn trees had beside RA's
   ground before the real ones arrived - and a road is 500 cells of it.

   Three tones, dark to light, taken by luminance from the dirt pixels the Road templates
   actually use, weighted by how often each index appears so the road is coloured like a road and
   not like its rarest speck. */
var _RTS_ROADPAL;

function _mixRoadPal() {
  if (_RTS_ROADPAL !== undefined) return _RTS_ROADPAL;
  _RTS_ROADPAL = null;
  if (!_rtsArtReady() || typeof RA_TILETAB === 'undefined') return null;
  var ex = _rtsThExt(), grass = _rtsTemGrassSet(), pal = RTS_MIX.pal;
  if (!grass || !pal) return null;

  var count = new Float64Array(256), total = 0;
  Object.keys(RA_TILETAB).forEach(function (id) {
    var rec = RA_TILETAB[id];
    if (rec.cat !== 'R') return;
    var tem = _mixTiles(rec.img + ex);
    if (!tem) return;
    for (var c = 0; c < rec.w * rec.h; c++) {
      var px = tem.tile[c];
      if (!px || String(rec.t.charAt(c) || '-').toLowerCase() !== 'd') continue;
      for (var i = 0; i < RTS_TS * RTS_TS; i++) {
        if (grass[px[i]]) continue;                      /* the verge, not the road */
        count[px[i]]++; total++;
      }
    }
  });
  if (total < 1000) return null;

  /* The commonest indices, then the darkest, the middle and the lightest of those - the same
     three-tone shape RTS_PAL.road has, so the caller's banding is unchanged. */
  var idx = [];
  for (var v = 0; v < 256; v++) if (count[v] / total > 0.01) idx.push(v);
  if (idx.length < 3) return null;
  function lum(v) { return pal[v * 3] * 0.30 + pal[v * 3 + 1] * 0.59 + pal[v * 3 + 2] * 0.11; }
  idx.sort(function (a, b) { return lum(a) - lum(b); });
  function hex(v) {
    return '#' + [pal[v * 3], pal[v * 3 + 1], pal[v * 3 + 2]].map(function (c) {
      return (c < 16 ? '0' : '') + c.toString(16);
    }).join('');
  }
  /* [mid, light, dark] - the order RTS_PAL.road is indexed in: 0 base, 1 light, 2 dark. */
  return (_RTS_ROADPAL = [hex(idx[(idx.length / 2) | 0]), hex(idx[idx.length - 1]), hex(idx[0])]);
}
