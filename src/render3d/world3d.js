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
var R3D_TREE_SEG = 10;
var R3D_TUFTS_PER_CELL = 4;
var R3D_TUFT_ODDS = 0.62;      /* share of grass cells that carry tufts at all */
var R3D_CRYSTALS_PER_CELL = 7;
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
            /* A ridge cell: stacked slabs of differing greys plus a crag spike or two. There
               is no rotation in the batch, so the tilt is faked the way the buildings fake
               it - offset stacked boxes, which under this light shade as separate facets. */
            for (var rb = 0; rb < 3; rb++) {
              var rh = 2.2 + _sprHash(tx * 31 + rb, tz, 347) * 3.4;
              var rw = 1.6 + _sprHash(tz * 31 + rb, tx, 349) * 2.2;
              _r3Box(faces, wx + (_sprHash(tx * 31 + rb, tz, 353) - 0.5) * 2.4, rb * 0.5,
                     wz + (_sprHash(tz * 31 + rb, tx, 359) - 0.5) * 2.4,
                     rw, rh, rw * (0.8 + h1 * 0.5),
                     rb & 1 ? '#6a6f66' : '#7e837a', rb & 1 ? '#575b54' : '#8d9289');
            }
            for (var cg = 0; cg < 2; cg++) {
              var gh = 3 + _sprHash(tx * 31 + cg, tz * 31 + cg, 433) * 3;
              _r3Cone(faces, wx + (_sprHash(tx * 31 + cg, tz, 439) - 0.5) * 3,
                      0, wz + (_sprHash(tz * 31 + cg, tx, 443) - 0.5) * 3,
                      0.9 + _sprHash(tx * 31 + cg, tz, 449) * 0.6, 0.1, gh,
                      cg & 1 ? '#757a71' : '#888d84', 6);
            }
          } else if (k === RTS_T_GRASS) {
            /* Sparse tufts, and only where a hash says so - covering every grass cell would
               be the ground-cover padding the graphics rules forbid; a scatter at this
               density is what breaks the plane's perfect flatness without carpeting it. */
            if (h1 < R3D_TUFT_ODDS) {
              for (var tf = 0; tf < R3D_TUFTS_PER_CELL; tf++) {
                var fx = wx + (_sprHash(tx * 31 + tf, tz, 367) - 0.5) * RTS_TILE;
                var fz = wz + (_sprHash(tz * 31 + tf, tx, 373) - 0.5) * RTS_TILE;
                var fh = 0.5 + _sprHash(tx * 31 + tf, tz, 379) * 0.7;
                _r3Cone(faces, fx, 0, fz, 0.32, 0.02, fh,
                        (tf & 1) ? '#4e6b3a' : '#5a7a44', 5);
              }
            }
          }
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

/* The crystals over the ore, rebuilt when the field actually changes. These are the ONLY ore
   the 3D mode draws: the golden stain belongs to the 2D ore tile, which render/frame.js skips
   when the mode is on, so there is no painted deposit underneath them the way there is in 2D.
   (An earlier version of this comment credited the stain to the terrain bake. It was never
   there.) Height scales with what is left in the cell, so a field visibly wears down as the
   harvesters work it - against the RICHNESS-SCALED cell capacity, not the nominal one, which
   is the same divisor bug the 2D draw carried: cells are seeded
   `(lvl+1)/LEVELS * RTS_SCRAP_TILE * RTS_ORE_RICHNESS`, so dividing by RTS_SCRAP_TILE alone
   caps `frac` at the richness and the crystals never reach full height. */
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
      for (var c = 0; c < R3D_CRYSTALS_PER_CELL; c++) {
        var cx = wx + (_sprHash(tx * 31 + c, tz, 383) - 0.5) * RTS_TILE;
        var cz = wz + (_sprHash(tz * 31 + c, tx, 389) - 0.5) * RTS_TILE;
        var ch = (0.5 + _sprHash(tx * 31 + c, tz, 397) * 1.1) * (0.35 + frac);
        _r3Cone(faces, cx, 0, cz, 0.42, 0.05, ch, (c & 1) ? P[0] : P[1], 4);
      }
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
  if (!R3.world || R3.worldG !== G) { _r3dWorldBuild(G); _r3dOreBuild(G); return; }
  R3.oreCheck = (R3.oreCheck || 0) + 1;
  if (R3.oreCheck % 30 !== 0) return;
  var sum = 0;
  for (var i = 0; i < RTS_N * RTS_N; i++) sum += G.scrap[i];
  if (Math.abs(sum - R3.oreSum) > 0.5) _r3dOreBuild(G);
}
