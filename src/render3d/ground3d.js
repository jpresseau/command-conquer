/* render3d/ground3d.js - the textures the ground is draped in: the terrain canvas, the
   shroud, and the ore field's colour. Part of rts.render3d.

   Split out of scene3d.js, which was over this project's per-file limit; the frame walk and
   the mesh cache stayed there. These three share one idea and nothing else in the file needs
   them: each is a texture rebuilt from game state and drawn on the same ground patch.
*/

/* ------------------------------------------------------------------ textures --
   The ground texture IS the 2D renderer's baked terrain canvas, so scorch marks, craters and
   corpses stamped into it appear in 3D too - frame.js sets terrainDirty when it stamps.
   The fog is rebuilt every frame: RTS_N^2 pixels is a 128x128 image, far below the cost of
   worrying about dirty flags.

   THE TWO TEXTURES WANT OPPOSITE MAGNIFICATION FILTERS, and sharing one setting made the
   ground the blurriest thing in the mode that is supposed to look better.

   The ground is PIXEL ART. The 2D renderer draws it with imageSmoothingEnabled = false, on
   purpose and at length: art at 24 px a cell magnified to 48 or 144 device pixels has to land
   on hard pixel blocks, because the alternative is not more detail, it is the same detail
   smeared. Sampling it LINEAR here did exactly that smearing - at max zoom the ground is
   magnified about six times, so every baked pixel became a six-pixel gradient and the 3D
   ground read as mud while the 2D ground beside it read as ground. MAG is NEAREST now, which
   is the same picture the 2D mode draws.

   MINIFICATION is the other way round: zoomed out, one screen pixel covers several baked
   pixels, and NEAREST there drops whichever texel it happens to land on and shimmers as the
   camera pans. So MIN stays LINEAR. (No mipmaps: the terrain canvas is 3072 square, which is
   not a power of two, and WebGL1 will not mip an NPOT texture.)

   The fog is NOT pixel art - it is one texel per CELL, a signal at 1/24th the ground's
   resolution, and its whole job is to be a soft boundary. LINEAR magnification is what turns
   the 2D mode's hard black cell-steps into a soft edge for free, so it keeps it. */
function _r3dTexture(gl, old, mag) {
  var t = old || gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, mag || gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}
function _r3dFog(G) {
  var R3 = window._R3D, gl = R3.gl, N = RTS_N;
  if (!R3.fogCv) {
    R3.fogCv = document.createElement('canvas');
    R3.fogCv.width = N; R3.fogCv.height = N;
    R3.fogG = R3.fogCv.getContext('2d');
    R3.fogIm = R3.fogG.createImageData(N, N);
  }
  var d = R3.fogIm.data;
  for (var i = 0; i < N * N; i++) {
    var a = G.mapped[i] ? (G.vis[i] ? 0 : Math.round(255 * RTS_FOG_DIM)) : 255;
    d[i * 4] = 4; d[i * 4 + 1] = 6; d[i * 4 + 2] = 9; d[i * 4 + 3] = a;
  }
  R3.fogG.putImageData(R3.fogIm, 0, 0);
  R3.fogTex = _r3dTexture(gl, R3.fogTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, R3.fogCv);
}

/* THE ORE FIELD'S COLOUR, as a texture rather than as geometry.

   In 2D the deposit is a painted tile; render/frame.js skips that in 3D because the crystals
   are real there, which left the crystals standing on plain grass with nothing to say a
   deposit was underneath them. Drawing the bed as flat quads was tried and looked like a heap
   of overlapping paper squares - a quad's hard straight edge reads louder than the colour it
   carries, however the colour is varied.

   This is the fog's own trick, which is the right one for the job: ONE TEXEL PER CELL,
   magnified LINEAR. The interpolation is what turns a grid of cells into a field that fades
   out over its last cell instead of ending on a square, and the alpha follows what is left in
   each cell, so a worked-out patch thins back to grass on its own.

   EVERY TEXEL CARRIES A COLOUR EVEN WHERE THERE IS NO ORE, and that is not wasted work. The
   blend interpolates rgb and alpha together, so a gold texel next to a BLACK transparent one
   averages to half-gold at the boundary and rings the whole field in a dark fringe. Empty
   cells take the colour of an ore neighbour where they have one and the field's own base gold
   otherwise, which leaves nothing for the interpolation to darken toward. */
var RTS_ORE_TEX_A = 0.82;      /* how much of the ground a full cell covers - not 1, so the
                                  terrain's own dirt and grass still read through the field */
function _r3dOreTex(G) {
  var R3 = window._R3D, gl = R3.gl, N = RTS_N, i;
  if (!R3.oreCv) {
    R3.oreCv = document.createElement('canvas');
    R3.oreCv.width = N; R3.oreCv.height = N;
    R3.oreG = R3.oreCv.getContext('2d');
    R3.oreIm = R3.oreG.createImageData(N, N);
    R3.oreGold = _r3Hex(RTS_PAL.ore[0]);
    R3.oreGem = _r3Hex(RTS_PAL.gem[0]);
  }
  var d = R3.oreIm.data, gold = R3.oreGold, gemc = R3.oreGem;
  var full = RTS_SCRAP_TILE * (typeof RTS_ORE_RICHNESS === 'number' ? RTS_ORE_RICHNESS : 1);
  var any = false;
  for (i = 0; i < N * N; i++) {
    var ore = G.scrap[i], p = i * 4;
    if (ore > 0) {
      var c = (G.gems && G.gems[i]) ? gemc : gold;
      var frac = Math.min(1, ore / full);
      d[p] = c[0]; d[p + 1] = c[1]; d[p + 2] = c[2];
      /* a shallow curve: a half-worked cell should still look like a deposit, and only the
         last of it should fade out */
      d[p + 3] = Math.round(255 * RTS_ORE_TEX_A * Math.pow(frac, 0.55));
      any = true;
    } else {
      d[p] = gold[0]; d[p + 1] = gold[1]; d[p + 2] = gold[2]; d[p + 3] = 0;
    }
  }
  /* an empty cell beside a gem field takes the gem's colour, so the fringe has nothing to
     average toward - see the note above */
  for (i = 0; i < N * N; i++) {
    if (G.scrap[i] > 0 || !G.gems) continue;
    var x = i % N, y = (i / N) | 0, q = i * 4;
    if ((x > 0 && G.gems[i - 1] && G.scrap[i - 1] > 0) ||
        (x < N - 1 && G.gems[i + 1] && G.scrap[i + 1] > 0) ||
        (y > 0 && G.gems[i - N] && G.scrap[i - N] > 0) ||
        (y < N - 1 && G.gems[i + N] && G.scrap[i + N] > 0)) {
      d[q] = gemc[0]; d[q + 1] = gemc[1]; d[q + 2] = gemc[2];
    }
  }
  R3.oreAny = any;
  R3.oreG.putImageData(R3.oreIm, 0, 0);
  R3.oreTex = _r3dTexture(gl, R3.oreTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, R3.oreCv);
}
