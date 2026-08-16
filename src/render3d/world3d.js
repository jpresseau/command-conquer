/* render3d/world3d.js - the map itself as geometry: forests, rock ridges, ore crystals and
   grass cover, batched and chunked. Part of rts.render3d.

   Until this, the 3D mode's world was one flat textured plane: every forest, ridge and ore
   field the generator laid down existed only as paint. This walks the terrain grid once and
   emits real geometry for it - a CLUSTER of trees per forest cell (RA's forest cells hold
   several trunks, not one), boulders and crags per rock cell, crystal clusters over the ore,
   grass tufts scattered on open ground - which is what makes the tilted camera worth having:
   a forest you can see INTO the edge of, ridges with sides, ore that glitters above the stain.

   THE BUDGET GOES TO THE FOREST, BY DESIGN. An earlier cut of this file spent two thirds of
   its ~640k triangles on grass tufts - exactly the ground-cover padding the graphics rules
   forbid: the count went up, the picture did not. This mix inverts that: the forest - the
   thing the player actually looks at and fights around - carries most of the ~1M triangles
   (2-3 full trees per forest cell), tufts are a sparse flatness-breaker, and the rest is rock
   and ore. Raising a number here must make the MAP richer, not the floor busier.

   CHUNKED, PRE-TRANSFORMED, ONE DRAW PER VISIBLE CHUNK. A million static triangles is a
   light BUILD load, but pushing all of them through the vertex stage every frame is not free
   on integrated GPUs - so the world is baked into world space once (the primitive builders
   emit at absolute coordinates and are reused unchanged) and split into a grid of
   R3D_CHUNK-cell chunks, each one buffer with a world AABB. The frame draws only the chunks
   whose AABB intersects the view (scene3d.js), which at normal zoom is a small fraction of
   the map - the million is affordable BECAUSE most of it is culled, cheaply, per chunk.
   Memory is the honest cost: ~1M triangles at the byte-packed 18B/vertex is ~54MB of GPU
   buffers, which is why the attributes were packed before the density was raised.

   Everything is HASH-PLACED, never random: the same seed must produce the same forest on
   every machine and after every save-load, and the bake must not shimmer between toggles.

   AND EVERY PER-INSTANCE HASH TAKES BOTH CELL COORDINATES. The first cut of this file
   scattered with separable pairs - the x offset hashed on (index, tx) and the z offset on
   (tz, index) - so the x offsets were identical down every column and the z offsets identical
   along every row. That is not a scatter, it is the outer product of two one-dimensional
   patterns, and at the scale of a forest it reads as a lattice with the cells jittered rather
   than as trees.

   The SIZE hashes had the same defect in an additive form: `_sprHash(tx + tn, ...)` gives tree
   1 on a cell the height of tree 0 on the next cell along, and `_sprHash(tn, tx + tz, ...)` is
   constant along a whole anti-diagonal. Every per-instance hash in the file - the five
   scatters and the eight size hashes - now folds tx, tz and the sub-index with `*31 +`, which
   is injective here because no sub-index reaches 31.

   THE ORE BATCH ALONE IS DYNAMIC. Trees and rock are immutable in this engine, but ore
   depletes and spreads, so its crystal batch follows the field - polled cheaply per frame
   and rebuilt only when the total actually changed. */

/* Density and size knobs, in one place. Trees dominate the budget - see the note above. */
var R3D_CHUNK = 32;            /* cells per chunk side; 128-cell map -> 4x4 chunks */
var R3D_TREE_SEG = 12;
var R3D_TUFTS_PER_CELL = 4;
var R3D_TUFT_ODDS = 0.62;      /* share of grass cells that carry tufts at all */
var R3D_CRYSTALS_PER_CELL = 5;
var R3D_WORLD_YMAX = 14;       /* tallest world geometry; the cull margin hangs on it */

/* One tree: trunk and three or four foliage tiers, SIZED by hash - not leaned, whatever an
   earlier version of this comment claimed. There is no rotation anywhere in the world batch;
   the geometry is baked straight to world space and drawn with an identity placement, which
   is the whole reason it can be one buffer per chunk. What varies between trees is height,
   canopy radius, tier count and tier colour. Heights run 5-9 world units - a cell and a bit
   to two cells - which is the reference's tree-to-tank proportion. */
function _r3dTree(out, x, z, h1, h2, h3) {
  var th = 5 + h1 * 4, tr = 1.2 + h2 * 0.9;
  _r3Cyl(out, x, 0, z, 0.45 + h3 * 0.2, th * 0.35, '#5a4630', '#463620', 6);
  var tiers = h3 > 0.45 ? 4 : 3;
  for (var ti = 0; ti < tiers; ti++) {
    var ty = th * (0.18 + 0.2 * ti), trr = tr * (1 - ti * 0.22);
    _r3Cone(out, x, ty, z, trr, trr * 0.1, th * 0.32,
            (ti + ((h1 * 97) | 0)) & 1 ? '#3d5b2e' : '#456936', R3D_TREE_SEG);
  }
}

/* A TURNED, TAPERED, LEANING SLAB - which is the whole difference between rock and rubble.

   The ridges were _r3Box stacks, and _r3Box is axis-aligned: every face of every slab on the
   map ran parallel to x or z, at four greys a hair apart, with a flat horizontal top. A ridge
   came out as a demolished city block rather than as stone.

   "There is no rotation anywhere in the world batch" is true of the DRAW - the batch is baked
   to world space and drawn with an identity placement, which is what lets it be one buffer per
   chunk - and says nothing about the geometry. A yaw baked into the vertices costs a sine and
   a cosine at build time and nothing at all per frame.

   Three shape knobs, and each does something the others cannot: `ang` turns the slab so its
   edges stop agreeing with every other slab's, `taper` shrinks the top face so it reads as a
   weathered block rather than a crate, and `lx`/`lz` slide that top sideways so the sides lean
   and the top is not a horizontal plane. Wound face by face like _r3Box so every normal points
   out of the solid; the rotation carries the normals with it. */
function _r3dSlab(out, x, y, z, w, d, h, ang, taper, lx, lz, col, topCol) {
  var C = Math.cos(ang), S = Math.sin(ang);
  function pt(u, v, up) {
    var k = up ? taper : 1;
    var uu = u * w * 0.5 * k, vv = v * d * 0.5 * k;
    return [x + uu * C - vv * S + (up ? lx : 0), y + (up ? h : 0),
            z + uu * S + vv * C + (up ? lz : 0)];
  }
  var b00 = pt(-1, -1, 0), b01 = pt(-1, 1, 0), b11 = pt(1, 1, 0), b10 = pt(1, -1, 0);
  var t00 = pt(-1, -1, 1), t01 = pt(-1, 1, 1), t11 = pt(1, 1, 1), t10 = pt(1, -1, 1);
  _r3F(out, [t00, t01, t11, t10], topCol || col);
  _r3F(out, [b01, b11, t11, t01], col);
  _r3F(out, [b10, b00, t00, t10], col);
  _r3F(out, [b11, b10, t10, t11], col);
  _r3F(out, [b00, b01, t01, t00], col);
}

/* Six greys rather than four, and not all neutral: real stone reads warm on the faces the sun
   reaches and cold in the shade, and a ridge built from one hue is a silhouette with nothing
   inside it however well it is lit. */
var R3D_ROCK = ['#7c8177', '#8e948a', '#6a6f66', '#9a9d92', '#585c54', '#83887c'];
var R3D_ROCK_TOP = ['#969b8f', '#a6aa9d', '#82877c', '#b0b3a6', '#6d7268', '#9ba095'];

/* ONE RIDGE CELL: four turned slabs and a pair of crags. Its own function rather than a block
   inside the terrain walk, so that a spec can emit the real thing and measure it - the
   interesting claim here is about the geometry (that a ridge runs in every direction, not just
   along x and z), and a spec that re-derived the angles from its own copy of the hashes would
   pass whatever the builder actually did. */
function _r3dRockCell(out, tx, tz) {
  var wx = _rtsWX(tx), wz = _rtsWX(tz);
  var h1 = _sprHash(tx, tz, 331);
  var nb = h1 > 0.55 ? 4 : 3;
  for (var rb = 0; rb < nb; rb++) {
    var ci = ((_sprHash(tz * 31 + rb, tx, 373) * 6) | 0) % 6;
    _r3dSlab(out,
             wx + (_sprHash(tx * 31 + rb, tz, 367) - 0.5) * 2.6, 0,
             wz + (_sprHash(tz * 31 + rb, tx, 379) - 0.5) * 2.6,
             1.5 + _sprHash(tz * 31 + rb, tx, 349) * 2.4,
             1.2 + _sprHash(tx * 31 + rb, tz * 31 + rb, 353) * 2.1,
             1.6 + _sprHash(tz * 31 + rb, tx * 31 + rb, 359) * 3.8,
             _sprHash(tx * 31 + rb, tz, 347) * Math.PI,
             0.42 + _sprHash(tx * 31 + rb, tz, 361) * 0.46,
             (_sprHash(tx * 31 + rb, tz, 383) - 0.5) * 1.4,
             (_sprHash(tz * 31 + rb, tx, 389) - 0.5) * 1.4,
             R3D_ROCK[ci], R3D_ROCK_TOP[ci]);
  }
  /* and the spikes that break the skyline - seven-sided, because at the top zoom a six-sided
     cone this size still reads as a pyramid */
  for (var cg = 0; cg < 2; cg++) {
    _r3Cone(out, wx + (_sprHash(tx * 31 + cg, tz, 439) - 0.5) * 3, 0,
            wz + (_sprHash(tz * 31 + cg, tx, 443) - 0.5) * 3,
            0.75 + _sprHash(tx * 31 + cg, tz, 449) * 0.7, 0.08,
            3.2 + _sprHash(tx * 31 + cg, tz * 31 + cg, 433) * 3.4,
            R3D_ROCK[cg ? 1 : 4], 7);
  }
}

/* STAND WHAT WAS JUST EMITTED ON THE GROUND. Every builder in this file draws from y = 0,
   which was the only ground there was until the terrain got relief. Rather than thread a base
   height through _r3dTree, _r3dRockCell, the crystal cone and the tuft cone - four signatures,
   and every future one - the walk records how long the face list was before a cell and lifts
   everything added since.

   A pure translation, so the NORMALS are untouched and do not need recomputing; and it lifts
   by the height at the cell CENTRE rather than under each piece, so a tree cluster sits level
   with itself instead of shearing across a slope. Over one cell of a field whose steepest step
   is about a third of the range, that is under a unit of error at the corners and invisible.

   The cost is one pass over the cell's own vertices, which is the same order as emitting them. */
function _r3dLiftFrom(out, from, dy) {
  if (!dy) return;
  for (var i = from; i < out.length; i++) {
    var v = out[i].v;
    for (var j = 0; j < v.length; j++) v[j][1] += dy;
  }
}

function _r3dWorldBuild(G) {
  var R3 = window._R3D, gl = R3.gl;
  var N = RTS_N, half = RTS_TILE / 2;
  var C = Math.ceil(N / R3D_CHUNK);

  /* a rebuild (new game, new map) frees the old map's buffers first */
  if (R3.world) {
    for (var od = 0; od < R3.world.length; od++) {
      var om = R3.world[od];
      gl.deleteBuffer(om.p); gl.deleteBuffer(om.n); gl.deleteBuffer(om.c);
    }
  }
  R3.world = []; R3.worldTris = 0; R3.worldG = G;

  for (var cz = 0; cz < C; cz++) {
    for (var cx = 0; cx < C; cx++) {
      var faces = [];
      var z0 = cz * R3D_CHUNK, z1 = Math.min(N, z0 + R3D_CHUNK);
      var x0 = cx * R3D_CHUNK, x1 = Math.min(N, x0 + R3D_CHUNK);

      for (var tz = z0; tz < z1; tz++) {
        for (var tx = x0; tx < x1; tx++) {
          var k = G.terrain[_rtsIdx(tx, tz)];
          var wx = _rtsWX(tx), wz = _rtsWX(tz);
          var h1 = _sprHash(tx, tz, 331), h2 = _sprHash(tz, tx, 337), h3 = _sprHash(tx * 3, tz * 7, 341);
          var _lift0 = faces.length, _liftY = _rtsTileElev(tx, tz);

          if (k === RTS_T_TREE) {
            /* a forest cell is a CLUSTER - two or three trees, spread across the cell */
            var nt = h1 > 0.5 ? 3 : 2;
            for (var tn = 0; tn < nt; tn++) {
              var ox = (_sprHash(tx * 31 + tn, tz, 401) - 0.5) * (RTS_TILE - 1.6);
              var oz = (_sprHash(tz * 31 + tn, tx, 409) - 0.5) * (RTS_TILE - 1.6);
              /* the SIZE hashes carried the same defect, and one carried it worse:
                 `_sprHash(tn, tx + tz, 431)` is CONSTANT along an entire anti-diagonal, so
                 tier count and trunk girth ran in diagonal stripes across every wood. */
              _r3dTree(faces, wx + ox, wz + oz,
                       _sprHash(tx * 31 + tn, tz, 419), _sprHash(tz * 31 + tn, tx, 421),
                       _sprHash(tx * 31 + tn, tz * 31 + tn, 431));
            }
          } else if (k === RTS_T_ROCK) {
            _r3dRockCell(faces, tx, tz);
          } else if (k === RTS_T_GRASS) {
            /* Sparse tufts, and only where a hash says so - covering every grass cell would
               be the ground-cover padding the graphics rules forbid; a scatter at this
               density is what breaks the plane's perfect flatness without carpeting it.

               NOT WHERE THE ORE IS. An ore field sits on grass cells, so the tuft scatter ran
               straight through it and put dark green spikes between the crystals - grass
               growing out of a mineral deposit, which is the one place it should not be. The
               static batch is baked once and the field moves as it is worked, so this is the
               field as the map was GENERATED; ground that is mined out later keeps its bare
               scar, which is the right way round for it to be wrong. */
            if (h1 < R3D_TUFT_ODDS && !(G.scrap && G.scrap[_rtsIdx(tx, tz)] > 0)) {
              for (var tf = 0; tf < R3D_TUFTS_PER_CELL; tf++) {
                var fx = wx + (_sprHash(tx * 31 + tf, tz, 367) - 0.5) * RTS_TILE;
                var fz = wz + (_sprHash(tz * 31 + tf, tx, 373) - 0.5) * RTS_TILE;
                var fh = 0.5 + _sprHash(tx * 31 + tf, tz, 379) * 0.7;
                _r3Cone(faces, fx, 0, fz, 0.32, 0.02, fh,
                        (tf & 1) ? '#4e6b3a' : '#5a7a44', 5);
              }
            }
          }
          _r3dLiftFrom(faces, _lift0, _liftY);
        }
      }

      if (!faces.length) continue;
      var m = _r3dBuildMesh(gl, faces);
      /* the chunk's world AABB, for the per-frame cull in scene3d.js */
      m.x0 = _rtsWX(x0) - half; m.x1 = _rtsWX(x1 - 1) + half;
      m.z0 = _rtsWX(z0) - half; m.z1 = _rtsWX(z1 - 1) + half;
      R3.world.push(m);
      R3.worldTris += m.verts / 3;
    }
  }
}

/* THE SEA, AS A SURFACE RATHER THAN AS PAINT.

   Everything else on the map became geometry - forests, ridges, ore - and the water stayed a
   picture: render/frame.js drew the 2D wave tiles over the GL buffer because "the GL side has
   no water surface of its own yet", and its own comment said so. Next to a tilted, perspective
   world with cast shadows it was the flattest thing on screen and, on a coastal map, a third
   of it.

   The surface is flat geometry that the vertex shader moves - see the uWave block in gl3d.js.
   That is where the wet look comes from: the shader's specular is the sprite baker's own tight
   Blinn-Phong, and a moving normal under a fixed light is exactly what makes a sheet of water
   glitter instead of sitting there blue.

   SUBDIVIDED, BECAUSE THE WAVES ARE SHORTER THAN A CELL. The shortest of the three has a
   wavelength of about 3.8 world units, just under a cell, and a surface sampled once per cell
   cannot show a wave it is the same size as - it aliases into a slow wobble. R3D_WATER_SUB
   quarters each cell in both directions, which puts a vertex every world unit.

   INSET AT THE SHORE, PER SIDE. The mesh covers water cells, so its outer boundary would be a
   staircase of cell-sized steps - and the terrain bake underneath already has a proper
   coastline on it, with surf and a sand edge. Rather than lay a square-edged sheet over that,
   a sub-quad that sits against a cell which is not water drops out: the geometry stops short
   of the land and the painted shore is what the player sees meeting it.

   Per SIDE is the whole of it. Insetting every side of any cell that has a land neighbour also
   opens a gap between two ADJACENT shore cells, and a coastline is made of adjacent shore
   cells - the sea came out framed in a dark lattice of the paint underneath. */
var R3D_WATER_SUB = 6;
var R3D_WATER_Y = 0.10;        /* clear of the ground plane, under the cast shadows at 0.12 */

function _r3dWaterBuild(G) {
  var R3 = window._R3D, gl = R3.gl, N = RTS_N, faces = [];
  var half = RTS_TILE / 2, step = RTS_TILE / R3D_WATER_SUB;
  var P = RTS_PAL.water;
  function isWater(x, z) {
    return x >= 0 && z >= 0 && x < N && z < N && G.terrain[z * N + x] === RTS_T_WATER;
  }
  for (var tz = 0; tz < N; tz++) {
    for (var tx = 0; tx < N; tx++) {
      if (!isWater(tx, tz)) continue;
      var ox = _rtsWX(tx) - half, oz = _rtsWX(tz) - half;
      var S1 = R3D_WATER_SUB - 1;
      for (var j = 0; j < R3D_WATER_SUB; j++) {
        for (var k2 = 0; k2 < R3D_WATER_SUB; k2++) {
          /* THE INSET IS PER SIDE, and only on sides that actually face land. A first cut
             insets every side of any cell with a land neighbour, which also opens a gap
             between two ADJACENT shore cells - and a coastline is made of adjacent shore
             cells, so the sea came out framed in a dark lattice of the paint underneath. A
             sub-quad drops out only when it sits against a cell that is not water. */
          if (k2 === 0 && !isWater(tx - 1, tz)) continue;
          if (k2 === S1 && !isWater(tx + 1, tz)) continue;
          if (j === 0 && !isWater(tx, tz - 1)) continue;
          if (j === S1 && !isWater(tx, tz + 1)) continue;
          if (k2 === 0 && j === 0 && !isWater(tx - 1, tz - 1)) continue;
          if (k2 === S1 && j === 0 && !isWater(tx + 1, tz - 1)) continue;
          if (k2 === 0 && j === S1 && !isWater(tx - 1, tz + 1)) continue;
          if (k2 === S1 && j === S1 && !isWater(tx + 1, tz + 1)) continue;
          var x0 = ox + k2 * step, x1 = x0 + step;
          var z0 = oz + j * step, z1 = z0 + step;
          _r3F(faces, [[x0, R3D_WATER_Y, z0], [x0, R3D_WATER_Y, z1],
                       [x1, R3D_WATER_Y, z1], [x1, R3D_WATER_Y, z0]], P[0]);
        }
      }
    }
  }
  if (R3.waterMesh) {
    gl.deleteBuffer(R3.waterMesh.p); gl.deleteBuffer(R3.waterMesh.n);
    gl.deleteBuffer(R3.waterMesh.c);
  }
  R3.waterMesh = faces.length ? _r3dBuildMesh(gl, faces) : null;
  R3.waterTris = faces.length * 2;
}

/* THE CRYSTALS THAT STAND IN AN ORE FIELD. The field's colour is not here - it is a texture,
   _r3dOreTex in scene3d.js, for the same reason the fog is one: it is a signal at one value
   per CELL that has to fade smoothly at its edges and track a number that changes as the
   harvesters work. An earlier cut of this drew the bed as flat quads of the palette lying on
   the ground, and a field came out as a heap of overlapping paper squares - the hard straight
   edge of every quad read louder than the colour it was carrying.

   What is left here is the part that genuinely wants to be geometry: things standing UP out of
   the deposit, which is the whole reason to draw ore in 3D rather than paint it. Five per cell
   rather than seven, differing in height, girth and colour across the whole five-entry
   palette, on seven sides rather than four - at the top zoom a cell is 144 device pixels and a
   four-sided cone is unmistakably a pyramid.

   Height scales with what is left, against the RICHNESS-SCALED cell capacity, not the nominal
   one - the same divisor bug the 2D draw carried: cells are seeded
   `(lvl+1)/LEVELS * RTS_SCRAP_TILE * RTS_ORE_RICHNESS`, so dividing by RTS_SCRAP_TILE alone
   caps `frac` at the richness and the crystals never reach full height.

   THIS BATCH ALONE IS DYNAMIC among the world's geometry. Trees and rock are immutable in this
   engine; ore depletes and spreads, so it is rebuilt when the total actually changes. */
function _r3dOreBuild(G) {
  var R3 = window._R3D, gl = R3.gl;
  var faces = [], N = RTS_N, sum = 0;
  for (var tz = 0; tz < N; tz++) {
    for (var tx = 0; tx < N; tx++) {
      var i = tz * N + tx, ore = G.scrap[i];
      if (ore <= 0) continue;
      sum += ore;
      var gem = G.gems && G.gems[i];
      var P = gem ? RTS_PAL.gem : RTS_PAL.ore;
      var frac = Math.min(1, ore / (RTS_SCRAP_TILE *
                     (typeof RTS_ORE_RICHNESS === 'number' ? RTS_ORE_RICHNESS : 1)));
      var wx = _rtsWX(tx), wz = _rtsWX(tz);
      var _o0 = faces.length, _oy = _rtsTileElev(tx, tz);
      for (var c = 0; c < R3D_CRYSTALS_PER_CELL; c++) {
        var cx = wx + (_sprHash(tx * 31 + c, tz, 383) - 0.5) * RTS_TILE;
        var cz = wz + (_sprHash(tz * 31 + c, tx, 389) - 0.5) * RTS_TILE;
        var g2 = _sprHash(tx * 31 + c, tz * 31 + c, 391);
        var ch = (0.45 + _sprHash(tx * 31 + c, tz, 397) * 1.25) * (0.35 + frac);
        _r3Cone(faces, cx, 0, cz, 0.28 + g2 * 0.26, 0.04, ch,
                [P[1], P[2], P[0], P[1], P[2]][c % 5], 7);
      }
      _r3dLiftFrom(faces, _o0, _oy);
    }
  }
  if (R3.oreMesh) {
    gl.deleteBuffer(R3.oreMesh.p); gl.deleteBuffer(R3.oreMesh.n); gl.deleteBuffer(R3.oreMesh.c);
  }
  R3.oreMesh = _r3dBuildMesh(gl, faces);
  R3.oreSum = sum;
}

/* Change detection: the static world is keyed to the game OBJECT - a new game is a new map,
   and without the key the mode would keep drawing the previous map's forests over the new
   terrain. The ore batch keys on total ore, sampled cheaply. G.scrapDirty is set by every
   depletion and spread site but is a shared flag other consumers reset, so relying on
   reading it exactly once is a race; summing 16k floats every 30 frames is not. */
function _r3dWorldTick(G) {
  var R3 = window._R3D;
  if (!R3.world || R3.worldG !== G) {
    _r3dWorldBuild(G); _r3dOreBuild(G); _r3dWaterBuild(G); return;
  }
  R3.oreCheck = (R3.oreCheck || 0) + 1;
  if (R3.oreCheck % 30 !== 0) return;
  var sum = 0;
  for (var i = 0; i < RTS_N * RTS_N; i++) sum += G.scrap[i];
  if (Math.abs(sum - R3.oreSum) > 0.5) _r3dOreBuild(G);
}
