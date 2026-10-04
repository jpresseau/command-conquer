/* render3d/world3d.js - the map itself as geometry: forests, rock ridges and
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
   thing the player actually looks at and fights around - carries most of the ~1M triangles,
   tufts are a sparse flatness-breaker, and the rest is rock and ore. Raising a number here
   must make the MAP richer, not the floor busier.

   AND THE SAME ARGUMENT APPLIES INSIDE THE FOREST. The forest's share was being spent on
   COUNT rather than on shape - 7,639 trees at 101 triangles, and the tiers those triangles
   drew were invisible because each sat inside the flare of the one below it. forest3d.js
   holds the rebuilt tree; the trade it makes is fewer trees, each worth about twice the
   geometry, at a flat total. Density is emphatically not a substitute for shape here: a wood
   at three trees a cell had no ground and no trunk visible anywhere in it.

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

   THE ORE IS NOT HERE. Trees and rock are immutable in this engine, but ore depletes and
   spreads, so its crystals are a batch of their own that follows the field, chunk by chunk:
   render3d/ore3d.js, standing on the crystal in r3d/crystal.js. */

/* Density and size knobs, in one place. Trees dominate the budget - see the note above, and
   see forest3d.js for where a tree's own triangles go and what they had to buy to be worth it.

   TUFTS ARE THREE PER CELL, NOT FOUR. The forest's rebuild bought its per-tree detail partly
   out of its own tree count and partly out of here: four tufts on 6,167 grass cells was
   246,680 triangles - a quarter of the entire world - spent on ground cover a player never
   looks at, which is exactly the padding the note at the top of this file was written about.
   Three still scatters; the freed 60k went into canopies. */
var R3D_CHUNK = 32;            /* cells per chunk side; 128-cell map -> 4x4 chunks */
var R3D_TUFTS_PER_CELL = 3;
var R3D_TUFT_ODDS = 0.62;      /* share of grass cells that carry tufts at all */
var R3D_WORLD_YMAX = 14;       /* tallest world geometry; the cull margin hangs on it */
var R3D_SWAY = 0.09;           /* world units the wind moves a canopy or a tuft (R3D_MESH_VS) */

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
   out of the solid; the rotation carries the normals with it.

   AND THE TOP IS BROKEN. With one flat quad for a top, a lit ridge read up close as a heap of
   sugar cubes: every slab's brightest face was a clean square. `peak` raises a point off the
   top's centre by (px, pz) of its half-extent, and the top becomes four facets running up to
   it, so the light breaks across it the way it does across split stone. Without `peak` the
   top is the flat quad it was. */
function _r3dSlab(out, x, y, z, w, d, h, ang, taper, lx, lz, col, topCol, peak, px, pz) {
  var C = Math.cos(ang), S = Math.sin(ang);
  function pt(u, v, up) {
    var k = up ? taper : 1;
    var uu = u * w * 0.5 * k, vv = v * d * 0.5 * k;
    return [x + uu * C - vv * S + (up ? lx : 0), y + (up ? h : 0),
            z + uu * S + vv * C + (up ? lz : 0)];
  }
  var b00 = pt(-1, -1, 0), b01 = pt(-1, 1, 0), b11 = pt(1, 1, 0), b10 = pt(1, -1, 0);
  var t00 = pt(-1, -1, 1), t01 = pt(-1, 1, 1), t11 = pt(1, 1, 1), t10 = pt(1, -1, 1);
  if (peak) {
    var ap = pt(px || 0, pz || 0, 1);
    ap[1] += peak;
    var tc = topCol || col;
    /* each facet wound as the quad it replaces was, so its normal points up and out */
    _r3F(out, [t00, t01, ap.slice()], tc);
    _r3F(out, [t01, t11, ap.slice()], tc);
    _r3F(out, [t11, t10, ap.slice()], tc);
    _r3F(out, [t10, t00, ap.slice()], tc);
  } else {
    _r3F(out, [t00, t01, t11, t10], topCol || col);
  }
  _r3F(out, [b01, b11, t11, t01], col);
  _r3F(out, [b10, b00, t00, t10], col);
  _r3F(out, [b11, b10, t10, t11], col);
  _r3F(out, [b00, b01, t01, t00], col);
}

/* Six greys rather than four, and not all neutral: real stone reads warm on the faces the sun
   reaches and cold in the shade, and a ridge built from one hue is a silhouette with nothing
   inside it however well it is lit. */
var R3D_ROCK = ['#7c8177', '#8e948a', '#6a6f66', '#9a9d92', '#585c54', '#83887c'];
/* The tops sit HALFWAY to the sides rather than a full step above them. A top faces the sun
   and the ramp already lifts it; a lighter base colour on top of that turned a lit ridge into a
   glare of white squares. */
var R3D_ROCK_TOP = ['#898e83', '#9a9f93', '#767b71', '#a5a89c', '#62675e', '#8f9488'];

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
             R3D_ROCK[ci], R3D_ROCK_TOP[ci],
             0.25 + _sprHash(tx * 31 + rb, tz * 31 + rb, 397) * 0.7,
             (_sprHash(tz * 31 + rb, tx, 401) - 0.5) * 1.1,
             (_sprHash(tx * 31 + rb, tz, 409) - 0.5) * 1.1);
  }
  /* and the spires that break the skyline. They were smooth seven-sided cones, and a smooth
     cone is a traffic cone however grey it is: stone breaks along planes. A spire is a crystal
     now (r3d/crystal.js) - five jittered flat facets, most of its length in the point, leaning a
     little - which reads as a shard of split rock for one triangle more. */
  for (var cg = 0; cg < 2; cg++) {
    var sr = 0.9 + _sprHash(tx * 31 + cg, tz, 449) * 0.7;
    _r3Crystal(out, wx + (_sprHash(tx * 31 + cg, tz, 439) - 0.5) * 3, 0,
               wz + (_sprHash(tz * 31 + cg, tx, 443) - 0.5) * 3,
               sr, 3.2 + _sprHash(tx * 31 + cg, tz * 31 + cg, 433) * 3.4,
               (_sprHash(tx * 31 + cg, tz, 457) - 0.5) * 0.35,
               (_sprHash(tz * 31 + cg, tx, 461) - 0.5) * 0.35,
               [R3D_ROCK[cg ? 1 : 4], R3D_ROCK[cg ? 5 : 2], R3D_ROCK_TOP[cg ? 1 : 4]],
               5, 0.7, (tx * 131 + tz) * 2 + cg);
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

function _r3dWorldBuild(G) { return _r3SegBulk(function () {
  /* BULK GEOMETRY, so the model segment floor is lifted for the duration - see
     _r3SegBulk in r3d/primitives.js. A tree canopy at 24 sides instead of 10 took
     the static world from 1,049,608 triangles to 2,112,650, for shapes a few pixels
     across, on a batch that is drawn every frame and again from the sun. */
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
          /* the walk's own hash, and the only one left in it: h2 and h3 sized the old tree and
             went with it into _r3dTree, which needs the cell coordinates for its per-segment
             jitter anyway. This one chooses how many trees stand on a forest cell and whether a
             grass cell carries tufts at all - the two decisions that are the WALK's to make. */
          var h1 = _sprHash(tx, tz, 331);
          var _lift0 = faces.length, _liftY = _rtsTileElev(tx, tz);

          var _scn = R3.scnPlanFor === G && R3.scnPlan ? R3.scnPlan.claim[_rtsIdx(tx, tz)] : 0;   /* scenery3d.js */
          if (k === RTS_T_TREE && _scn !== 1) {
            /* ONE OR TWO TREES, not two or three. A cell is four world units across and a
               canopy is up to two units in radius, so a single tree already closes the canopy
               over its own cell and a dense wood still reads solid from above - what the third
               tree bought was a wall with no ground, no trunk and no gap anywhere in it, at
               the price of the detail on the two in front of it. The size hashes live in
               _r3dTree now; only the placement is left here.

               The offsets still take BOTH cell coordinates and the sub-index - see the note at
               the top of this file for what the separable version drew. */
            var nt = h1 > 0.44 && _scn !== 3 ? 2 : 1;
            for (var tn = 0; tn < nt; tn++) {
              var ox = (_sprHash(tx * 31 + tn, tz, 401) - 0.5) * (RTS_TILE - 1.6);
              var oz = (_sprHash(tz * 31 + tn, tx, 409) - 0.5) * (RTS_TILE - 1.6);
              _r3dTree(faces, wx + ox, wz + oz, tx, tz, tn);
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
            if (h1 < R3D_TUFT_ODDS && _scn !== 2 && !(G.scrap && G.scrap[_rtsIdx(tx, tz)] > 0)) {
              for (var tf = 0; tf < R3D_TUFTS_PER_CELL; tf++) {
                var fx = wx + (_sprHash(tx * 31 + tf, tz, 367) - 0.5) * RTS_TILE;
                var fz = wz + (_sprHash(tz * 31 + tf, tx, 373) - 0.5) * RTS_TILE;
                var fh = 0.5 + _sprHash(tx * 31 + tf, tz, 379) * 0.7;
                /* blades, not a cone - a cone on a map of conifers is a sapling; r3d/tuft.js */
                _r3Tuft(faces, fx, 0, fz, fh,
                        (tf & 1) ? ['#56773f', '#739450'] : ['#62844a', '#4f7040'],
                        (tx * 131 + tz) * 3 + tf);
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
});
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

function _r3dWaterBuild(G) { return _r3SegBulk(function () {
  /* BULK GEOMETRY, so the model segment floor is lifted for the duration - see
     _r3SegBulk in r3d/primitives.js. A tree canopy at 24 sides instead of 10 took
     the static world from 1,049,608 triangles to 2,112,650, for shapes a few pixels
     across, on a batch that is drawn every frame and again from the sun. */
  var R3 = window._R3D, gl = R3.gl, N = RTS_N, faces = [];
  var half = RTS_TILE / 2, step = RTS_TILE / R3D_WATER_SUB;
  var P = RTS_PAL.water;
  function isWater(x, z) {
    return x >= 0 && z >= 0 && x < N && z < N && G.terrain[z * N + x] === RTS_T_WATER;
  }
  for (var tz = 0; tz < N; tz++) {
    for (var tx = 0; tx < N; tx++) {
      /* THE SHEET REACHES A CELL PAST THE SHORE, and the shoreline itself is cut per pixel
         (R3D_MESH_FS, uSea): the water mask decides what is sea, round and in step with the
         ground's own border. It used to be cut here, cell by cell - sub-quads dropped wherever
         they touched land - and a coast built out of cells is a staircase however it is
         inset; at a middle zoom every lake was a flight of stairs. */
      var near = isWater(tx, tz);
      for (var ny = -1; ny <= 1 && !near; ny++) for (var nx = -1; nx <= 1 && !near; nx++) near = isWater(tx + nx, tz + ny);
      if (!near) continue;
      var ox = _rtsWX(tx) - half, oz = _rtsWX(tz) - half;
      for (var j = 0; j < R3D_WATER_SUB; j++) {
        for (var k2 = 0; k2 < R3D_WATER_SUB; k2++) {
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
  _r3dSeaMask(G);
  R3.waterMesh = faces.length ? _r3dBuildMesh(gl, faces) : null;
  R3.waterTris = faces.length * 2;
});
}
/* The water mask the shoreline is cut from: one texel per cell, 255 on water, LINEAR. Rebuilt
   whenever the tide moves (core/tide.js bumps G.tideRev), so flats the sea has gone out from
   are cut out of the sheet and the ground under them shows - the coast walks out and back. */
function _r3dSeaMask(G) {
  var R3 = window._R3D, gl = R3.gl, N = RTS_N, dry = G.tideDry;
  var wm = new Uint8Array(N * N * 4);
  for (var mi = 0; mi < N * N; mi++) {
    var wv = G.terrain[mi] === RTS_T_WATER && !(dry && dry[mi]) ? 255 : 0;
    wm[mi * 4] = wv; wm[mi * 4 + 1] = wv; wm[mi * 4 + 2] = wv; wm[mi * 4 + 3] = 255;
  }
  R3.seaMaskRev = G.tideRev || 0;
  R3.seaMaskTex = R3.seaMaskTex || gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, R3.seaMaskTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, N, N, 0, gl.RGBA, gl.UNSIGNED_BYTE, wm);
}

/* Change detection: the static world is keyed to the game OBJECT - a new game is a new map,
   and without the key the mode would keep drawing the previous map's forests over the new
   terrain. The ore field keeps its own watch, chunk by chunk - see _r3dOreTick in ore3d.js. */
function _r3dWorldTick(G) {
  var R3 = window._R3D;
  if (typeof _r3dSky === 'function') _r3dSky(G);     /* this frame's hour and weather: sky3d.js */
  R3.plTick = (R3.plTick || 0) + 1;                     /* ...and its lights, before the ground: fxlight3d.js */
  if (typeof _r3dFxLightPick === 'function') _r3dFxLightPick(R3, G);
  if (!R3.world || R3.worldG !== G) {
    R3.scnPlan = _r3dSceneryPlan(G); R3.scnPlanFor = G;   /* first: the world leaves its claims alone */
    _r3dWorldBuild(G); _r3dOreBuild(G); _r3dWaterBuild(G); _r3dDressTick(G); _r3dSceneryTick(G); _r3dBridgeTick(G); return;
  }
  _r3dOreTick(G);
  _r3dBridgeTick(G);                /* a no-op unless a bridge was laid in play */
  if (R3.seaMaskRev !== (G.tideRev || 0)) _r3dSeaMask(G);   /* the tide moved: core/tide.js */
  _r3dSceneryTick(G);
  _r3dDressTick(G);                 /* what the bases keep lying about - dress3d.js */
}
