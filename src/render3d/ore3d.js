/* render3d/ore3d.js - the ore field's crystals, as geometry that follows the field. Part of
   rts.render3d.

   The field's COLOUR is not here - it is a texture, _r3dOreTex in ground3d.js, for the same
   reason the fog is one: it is a signal at one value per CELL that has to fade smoothly at its
   edges and track a number that changes as the harvesters work. An earlier cut drew the bed as
   flat quads of the palette lying on the ground, and a field came out as a heap of overlapping
   paper squares. What is here is the part that genuinely wants to be geometry: crystals
   standing UP out of the deposit, which is the whole reason to draw ore in 3D at all. Their
   shape lives in r3d/crystal.js.

   CHUNKED, LIKE THE REST OF THE WORLD. This batch used to be one buffer over the whole map,
   rebuilt from scratch whenever the map's total ore moved - which, with a harvester working,
   is every poll. It is split on the world's own R3D_CHUNK grid now, and each chunk keeps the
   sum it was built from: a harvester working one field rebuilds the one chunk it is working,
   not sixteen. And since each chunk carries a world AABB, the frame culls it with the forest
   (scene3d.js) instead of drawing every crystal on the map at every zoom. Those two together
   are what let a crystal carry three times the geometry the old cone did.

   Height scales with what is left, against the RICHNESS-SCALED cell capacity, not the nominal
   one - the same divisor bug the 2D draw carried: cells are seeded
   `(lvl+1)/LEVELS * RTS_SCRAP_TILE * RTS_ORE_RICHNESS`, so dividing by RTS_SCRAP_TILE alone
   caps `frac` at the richness and the crystals never reach full height.

   R3.ore      one mesh (or null) per chunk, row-major on the chunk grid
   R3.oreSums  the ore total each chunk was last built from
   R3.oreTris  the batch's triangle count, summed over its chunks
   R3.oreSum   the map's total, for anyone who wants one number
   R3.oreBuilds  chunk builds since the page loaded - a counter, so a spec can tell a rebuild of
               one chunk from a rebuild of the map */

function _r3dOreSums(G) {
  var N = RTS_N, C = Math.ceil(N / R3D_CHUNK), out = new Float64Array(C * C);
  for (var tz = 0; tz < N; tz++) {
    var row = (tz / R3D_CHUNK | 0) * C;
    for (var tx = 0; tx < N; tx++) out[row + (tx / R3D_CHUNK | 0)] += G.scrap[tz * N + tx];
  }
  return out;
}

/* One chunk's crystals, or null if it has none. BULK GEOMETRY, so the model segment floor is
   lifted for the duration - see _r3SegBulk in r3d/primitives.js. */
function _r3dOreChunk(G, k) { return _r3SegBulk(function () {
  var R3 = window._R3D, gl = R3.gl, N = RTS_N, C = Math.ceil(N / R3D_CHUNK);
  var cz = k / C | 0, cx = k % C, half = RTS_TILE / 2;
  var z0 = cz * R3D_CHUNK, z1 = Math.min(N, z0 + R3D_CHUNK);
  var x0 = cx * R3D_CHUNK, x1 = Math.min(N, x0 + R3D_CHUNK);
  var cap = RTS_SCRAP_TILE * (typeof RTS_ORE_RICHNESS === 'number' ? RTS_ORE_RICHNESS : 1);
  var faces = [];
  for (var tz = z0; tz < z1; tz++) {
    for (var tx = x0; tx < x1; tx++) {
      var i = tz * N + tx, ore = G.scrap[i];
      if (ore <= 0) continue;
      var gem = !!(G.gems && G.gems[i]);
      var o0 = faces.length;
      _r3OreCell(faces, _rtsWX(tx), _rtsWX(tz), tx, tz, Math.min(1, ore / cap), gem,
                 gem ? RTS_PAL.gem : RTS_PAL.ore);
      _r3dLiftFrom(faces, o0, _rtsTileElev(tx, tz));
    }
  }
  R3.oreBuilds = (R3.oreBuilds || 0) + 1;
  if (!faces.length) return null;
  var m = _r3dBuildMesh(gl, faces);
  /* the chunk's cells, and a tile beyond them for the crystals that lean out of the edge */
  m.x0 = _rtsWX(x0) - half - RTS_TILE; m.x1 = _rtsWX(x1 - 1) + half + RTS_TILE;
  m.z0 = _rtsWX(z0) - half - RTS_TILE; m.z1 = _rtsWX(z1 - 1) + half + RTS_TILE;
  return m;
}); }

function _r3dOreFree(m) {
  if (!m) return;
  var gl = window._R3D.gl;
  gl.deleteBuffer(m.p); gl.deleteBuffer(m.n); gl.deleteBuffer(m.c);
}

function _r3dOreTotals(R3) {
  var t = 0, s = 0;
  for (var k = 0; k < R3.ore.length; k++) {
    if (R3.ore[k]) t += R3.ore[k].verts / 3;
    s += R3.oreSums[k];
  }
  R3.oreTris = Math.round(t); R3.oreSum = s;
}

/* The whole field, every chunk - a new map, or a spec that has rewritten G.scrap. */
function _r3dOreBuild(G) {
  var R3 = window._R3D;
  if (R3.ore) R3.ore.forEach(_r3dOreFree);
  R3.oreSums = _r3dOreSums(G);
  R3.ore = [];
  for (var k = 0; k < R3.oreSums.length; k++) R3.ore.push(_r3dOreChunk(G, k));
  _r3dOreTotals(R3);
}

/* THE WATCH. Every 30 frames, the per-chunk sums - one pass over 16k floats, the same cost the
   single total had - and a rebuild of exactly the chunks whose sum moved. G.scrapDirty is set by
   every depletion and spread site but is a shared flag other consumers reset, so relying on
   reading it exactly once is a race; summing is not. */
function _r3dOreTick(G) {
  var R3 = window._R3D;
  if (!R3.ore) { _r3dOreBuild(G); return; }
  R3.oreCheck = (R3.oreCheck || 0) + 1;
  if (R3.oreCheck % 30 !== 0) return;
  var sums = _r3dOreSums(G), moved = false;
  if (sums.length !== R3.ore.length) { _r3dOreBuild(G); return; }
  for (var k = 0; k < sums.length; k++) {
    if (Math.abs(sums[k] - R3.oreSums[k]) <= 0.5) continue;
    _r3dOreFree(R3.ore[k]);
    R3.ore[k] = _r3dOreChunk(G, k);
    R3.oreSums[k] = sums[k];
    moved = true;
  }
  if (moved) _r3dOreTotals(R3);
}
