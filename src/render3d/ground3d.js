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
/* REBUILT ONLY WHEN THE SHROUD ACTUALLY CHANGED, decided by HASHING THE SOURCE rather than by
   trusting a signal. This ran every frame - 16k cells rewritten, a putImageData and a 64 KB
   texImage2D - and on an emulated iPhone 13 this and _r3dOreTex together were pushing 128 KB a
   frame, about 7.7 MB a second at 60 fps, nearly all of it byte-identical to the frame before.
   Texture bandwidth is what a phone has least of.

   TWO SIGNAL-KEYED VERSIONS WERE TRIED FIRST AND BOTH WENT STALE, which is the whole reason
   this hashes. G.visDirty is no good because it has an owner: render/frame.js clears it when it
   re-bakes the 2D fog, so a second reader is told "nothing changed" for every change the first
   one saw first. A generation counter bumped at the sweep and at the reveal sites fixed that and
   was still wrong, because it only covers the writes that go through those sites - anything
   setting G.mapped or G.vis directly (a save being restored, the editor, a spec driving the
   renderer) would render a shroud frozen at whatever it last agreed with. e2e/perspective caught
   exactly that.

   A hash cannot have that failure mode: it is keyed on the bytes themselves, so every change
   invalidates and no change does. 32k reads against a 16k-pixel rebuild plus a 64 KB upload, so
   it is still roughly thirty times cheaper than what it replaces, and it is CORRECT, which the
   cheaper versions were not. */
/* SEEDED WITH THE CONSTANTS THE TEXTURE ALSO DEPENDS ON, not just the game state. The dimming
   factor is as much an input to these pixels as the shroud bytes are, and a cache keyed on only
   some of its inputs is stale for the rest - e2e/ore3d changes RTS_ORE_TEX_A to render a frame
   without the stain and got the cached one back. */
function _r3dFogHash(G) {
  var h = (2166136261 ^ Math.round(RTS_FOG_DIM * 1e6)) >>> 0, m = G.mapped, v = G.vis, n = RTS_N * RTS_N;
  for (var i = 0; i < n; i++) {
    h = (h ^ (m[i] | (v[i] << 1))) >>> 0;
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h;
}
function _r3dFog(G) {
  var R3 = window._R3D, gl = R3.gl, N = RTS_N;
  var fh = _r3dFogHash(G);
  if (R3.fogTex && R3.fogHash === fh && R3.fogFor === G) return;
  R3.fogHash = fh; R3.fogFor = G;
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
/* AND THE SAME TREATMENT FOR THE BED'S COLOUR, hashed for the same reason and over the two
   arrays that decide it. Keying this on R3.oreSum was tried and was wrong twice over: that
   total is refreshed by _r3dWorldTick's sampler, which runs once every thirty frames because
   rebuilding the crystal GEOMETRY is expensive and half a second of lag there is invisible - but
   colour is not geometry, and a cell mined out has to stop being gold at once. e2e/ore3d caught
   all three of its stain assertions reading the frame before. */
function _r3dOreHash(G) {
  var h = (2166136261 ^ Math.round(RTS_ORE_TEX_A * 1e6)) >>> 0, sc = G.scrap, gm = G.gems, n = RTS_N * RTS_N;
  for (var i = 0; i < n; i++) {
    h = (h ^ ((sc[i] * 4) | 0) ^ ((gm && gm[i]) ? 0x5a5a : 0)) >>> 0;
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h;
}
function _r3dOreTex(G) {
  var R3 = window._R3D, gl = R3.gl, N = RTS_N, i;
  var oh = _r3dOreHash(G);
  if (R3.oreTex && R3.oreHash === oh && R3.oreTexFor === G) return;
  R3.oreHash = oh; R3.oreTexFor = G;
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


/* THE GROUND CARRIES A HEIGHT NOW. This attribute was aXZ, two floats, with y taken as zero
   everywhere - which was true of the map until the terrain got relief (see RTS_ELEV_MAX in
   core/grid.js). It is aP, and y goes through the same two lines every other program projects
   with: up the screen by y*sin(tilt), and TOWARD THE EYE by y*cos(tilt), because a hilltop is
   nearer the camera than the ground beside it and has to sort that way against everything
   standing on it. */
var R3D_TEX_VS =
  'attribute vec3 aP; attribute vec2 aT; attribute vec3 aN;' +
  'uniform vec4 uCam; uniform vec2 uTilt; uniform float uInvD;' +
  R3D_SHADOW_VGLSL +
  'varying vec2 vT; varying float vShade; varying vec2 vW;' +
  'void main(){' +
  '  vT = aT;' +
  /* the world position under this fragment, for the grain below - see R3D_TEX_FS */
  '  vW = aP.xz;' +
  /* HOW MUCH LIGHT THIS PATCH OF GROUND TAKES, RELATIVE TO FLAT. The terrain texture is the
     2D renderer's baked canvas and already carries its own lighting for a level surface, so
     shading it again with the full lambert would light it twice. What the relief needs is the
     DIFFERENCE: dot(n,L) over what a flat surface would have taken, which is exactly 1.0 on
     the flats - leaving them the picture they always were - and rises or falls only where the
     ground leans. Without this the heightfield is invisible: it moves the pixels around and
     every one of them keeps the colour it had, so a hillside reads as a smear rather than as
     a slope. */
  '  vShade = clamp(dot(normalize(aN), vec3(' +
       R3_LIGHT[0].toFixed(4) + ', ' + R3_LIGHT[1].toFixed(4) + ', ' + R3_LIGHT[2].toFixed(4) +
       ')) / ' + R3_LIGHT[1].toFixed(4) + ', 0.35, 1.55);' +
  '  _shadowFrom(aP);' +
  '  float sx = (aP.x - uCam.x) * uCam.z;' +
  '  float sy = ((aP.z - uCam.y) * uTilt.x - aP.y * uTilt.y) * uCam.w;' +
  '  float d  = ((aP.z - uCam.y) * uTilt.y + aP.y * uTilt.x);' +
  '  float pw = 1.0 - d * uInvD;' +
  '  gl_Position = vec4(sx, -sy, -d / ' + R3D_DEPTH_RANGE.toFixed(1) + ' * pw, pw);' +
  '}';
/* THE GROUND RECEIVES, and it is the surface that matters most - a shadow map that shades
   every mesh but not the floor puts a tree's shade on the tree beside it and none on the grass
   underneath, which is worse than no shadows at all.

   uRecv is 0 for the fog, which is drawn through this same program and is not a surface: it is
   the unexplored map laid over the finished picture, and shading it would darken the shroud in
   the shape of trees the player cannot see.

   The shade is a COOL MULTIPLY rather than a scalar one, matched to the mesh ramp's own floor -
   a shadow on grass and a shadow on a slab beside it have to be the same colour of shade or
   the two read as different times of day. */
/* THE GRAIN, AND WHY IT IS HERE RATHER THAN ONLY IN THE 2D FRAME.

   The terrain is a baked canvas in both renderers - RTS_TS pixels a cell - so both magnify it,
   and magnifying a texture destroys the frequencies above its own resolution. render/detail.js
   is the answer to that and has been for a long time: a wrapping, high-passed, three-octave
   tile laid over the ground at DEVICE resolution, putting back what the stretch took out. The
   spec for it measures one colour running 12 device pixels without and 1 with.

   It ran only in 2D. The line that calls it sits inside `if (!r3on)` in render/frame.js,
   because the 3D ground is this program and not a drawImage - so in 3D the ground had no grain
   at all, and nobody noticed while the closest zoom was 48 pixels a cell. Two rungs further in
   (RTS_ZOOM_3D_EXTRA) it is the first thing you see.

   THE SAME TILE, not a second one. It is uploaded once from _rtsDetailTile, sampled here in
   WORLD space scaled to device pixels - one tile pixel on one screen pixel, exactly as the 2D
   pass places it - so the grain is anchored to the ground and does not swim when the camera
   pans. uGrain carries the strength and is zero below RTS_DETAIL_MIN_MAG, where there is
   nothing to put back and a full-screen fetch would be a pure loss. */
var R3D_TEX_FS =
  'precision highp float; varying vec2 vT; varying float vShade; varying vec2 vW;' +
  'uniform sampler2D uS; uniform float uA;' +
  'uniform float uRecv;' +
  'uniform sampler2D uGrainTex; uniform vec2 uGrain;' +   /* strength, world->tile scale */
  R3D_SHADOW_GLSL +
  'void main(){' +
  '  vec4 c = texture2D(uS, vT);' +
  /* Composited the way the 2D pass composites it: the tile carries lighten-or-darken in its
     own colour and the strength in its alpha, so this is a plain source-over and none of a
     blend mode's cost is paid. */
  '  if (uGrain.x > 0.0) {' +
  '    vec4 gt = texture2D(uGrainTex, vW * uGrain.y);' +
  '    c.rgb = mix(c.rgb, gt.rgb, gt.a * uGrain.x);' +
  '  }' +
  '  float s = mix(1.0, _shadowAt(), uRecv);' +
  '  vec3 lit = c.rgb * mix(vec3(0.575, 0.600, 0.655), vec3(1.0), s);' +
  /* uRecv is 0 for the fog, which is a signal painted over the world rather than a surface in
     it - leaning it toward the sun would make the shroud brighter on a hillside. */
  '  gl_FragColor = vec4(lit * mix(1.0, vShade, uRecv), c.a * uA);' +
  '}';


/* ------------------------------------------------------------- the ground mesh --
   Built here rather than in the frame walk because it belongs with the textures draped over
   it and the shader that samples them; it also took scene3d.js over the per-file limit.
   Everything it needs comes in: the visible bounds, and the map's half-extent for the UVs. */
function _r3dGroundMesh(R3, gl, vb, EXT) {
/* THE PATCH IS CUT ON THE TILE GRID, not on the view, and that is what stops the relief
   shimmering. A uniform subdivision of the visible rectangle moves its vertices every time
   the camera pans by less than a quad, so each one slides across the height field and the
   whole surface crawls. Cutting on the grid pins every vertex to a tile CORNER, where the
   bilinear height is exact and, more to the point, the same from one frame to the next: the
   patch gains and loses whole cells at its edges and never moves the ones in the middle.

   The step coarsens when the view is wide, and coarsens by whole CELLS so the vertices stay
   on corners and the surface still cannot crawl. At the top zoom the view is about 29 cells
   across and every cell gets its own quad; zoomed all the way out it is 115, and four cells
   to a quad keeps the count near four thousand. Relief that fine is not readable from out
   there anyway.

   THE MARGIN CARRIES THE HEIGHT. It used to be two cells, which is what a flat plane needs
   to clear the eye plane. A hilltop is nearer the eye than the ground under it, so it can be
   on screen while its cell is not: the extra reach is the full elevation times tan(tilt),
   the same lift the world batch widens its cull by. */
  var GM = RTS_TILE * 2 + RTS_ELEV_MAX * R3.sp / R3.cp;
  var t0x = _rtsTX(Math.max(-EXT, vb.x0 - GM)), t1x = _rtsTX(Math.min(EXT, vb.x1 + GM));
  var t0z = _rtsTX(Math.max(-EXT, vb.z0 - GM)), t1z = _rtsTX(Math.min(EXT, vb.z1 + GM));
  t0x = Math.max(0, t0x - 1); t0z = Math.max(0, t0z - 1);
  t1x = Math.min(RTS_N, t1x + 2); t1z = Math.min(RTS_N, t1z + 2);
  var gstep = 1;
  while ((t1x - t0x) / gstep * ((t1z - t0z) / gstep) > 4200 && gstep < 8) gstep *= 2;
  /* snap the origin to the step so the quads keep their phase as the camera pans */
  t0x -= t0x % gstep; t0z -= t0z % gstep;
  var nqx = Math.ceil((t1x - t0x) / gstep), nqz = Math.ceil((t1z - t0z) / gstep);
  var need = nqx * nqz * 18;
  if (!R3.groundBuf) { R3.groundBuf = gl.createBuffer(); R3.groundUV = gl.createBuffer(); }
  if (!R3.groundXZ || R3.groundXZ.length < need) {
    R3.groundXZ = new Float32Array(need);
    R3.groundN = new Float32Array(need);
    R3.groundT = new Float32Array(need / 3 * 2);
    if (!R3.groundNB) R3.groundNB = gl.createBuffer();
  }
  var q = R3.groundXZ, nb = R3.groundN, t = R3.groundT, k = 0, kt = 0, gi, gj;
  /* the world coordinate of a tile's low CORNER - _rtsWX gives the centre */
  function gcx(tx) { return _rtsWX(tx) - RTS_TILE / 2; }
  /* The slope comes from _rtsElevNormal - the terrain's, not the mesh's. At gstep 4 a quad
     spans four cells and its own corners would flatten everything between them, and it is the
     same normal the units standing here lean by, so the surface and what stands on it cannot
     disagree. */
  function gv(x, zz) {
    var n = _rtsElevNormal(x, zz);
    q[k] = x; q[k + 1] = _rtsElev(x, zz); q[k + 2] = zz;
    nb[k] = n[0]; nb[k + 1] = n[1]; nb[k + 2] = n[2];
    k += 3;
    t[kt] = (x + EXT) / (2 * EXT); t[kt + 1] = (zz + EXT) / (2 * EXT); kt += 2;
  }
  for (gj = 0; gj < nqz; gj++) {
    var az = gcx(t0z + gj * gstep), bz = gcx(Math.min(t1z, t0z + (gj + 1) * gstep));
    for (gi = 0; gi < nqx; gi++) {
      var ax = gcx(t0x + gi * gstep), bx = gcx(Math.min(t1x, t0x + (gi + 1) * gstep));
      gv(ax, az); gv(bx, az); gv(bx, bz);
      gv(ax, az); gv(bx, bz); gv(ax, bz);
    }
  }
  R3.groundVerts = k / 3;
  R3.groundStep = gstep;
  gl.bindBuffer(gl.ARRAY_BUFFER, R3.groundBuf);
  gl.bufferData(gl.ARRAY_BUFFER, q, gl.DYNAMIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, R3.groundNB);
  gl.bufferData(gl.ARRAY_BUFFER, nb, gl.DYNAMIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, R3.groundUV);
  gl.bufferData(gl.ARRAY_BUFFER, t, gl.DYNAMIC_DRAW);
}


/* The detail tile as a GL texture, built once from the same canvas the 2D pass uses. REPEAT,
   because the tile wraps by construction and the whole point is that it tiles across the
   ground without a seam - render/detail.js says so and e2e/grain measures it. */
function _r3dGrainTex(gl, R3) {
  if (R3.grainTex) return R3.grainTex;
  if (typeof _rtsDetailTile !== 'function') return null;
  var src = null;
  try { src = _rtsDetailTile(); } catch (e) { src = null; }
  if (!src) return null;
  var t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
  R3.grainTex = t;
  return t;
}

/* How hard the grain goes, and how it is scaled, for the ground program.

   `mag` is device pixels per baked terrain pixel - the same quantity render/detail.js gates on,
   arrived at the same way: the ground is RTS_TS pixels a cell and RTS_TILE world units a cell,
   so a world unit is RTS_TS/RTS_TILE baked pixels, and the view draws `px` device pixels to the
   world unit. Below RTS_DETAIL_MIN_MAG nothing has been stretched and there is nothing to
   restore. The scale puts one tile pixel on one device pixel, so the grain is the same size on
   screen at every zoom - it is screen-resolution detail, not a texture on the map. */
function _r3dGrainSet(gl, R3, P) {
  var uG = gl.getUniformLocation(P, 'uGrain');
  if (!uG) return 0;
  var px = (typeof _rtsZoom === 'function' ? _rtsZoom() : 0) * (R3.scale || 1);
  var mag = px * RTS_TILE / RTS_TS;
  if (!(mag >= RTS_DETAIL_MIN_MAG) || !_r3dGrainTex(gl, R3)) {
    gl.uniform2f(uG, 0, 0);
    return 0;
  }
  gl.activeTexture(gl.TEXTURE0 + 3);
  gl.bindTexture(gl.TEXTURE_2D, R3.grainTex);
  gl.uniform1i(gl.getUniformLocation(P, 'uGrainTex'), 3);
  gl.activeTexture(gl.TEXTURE0);
  gl.uniform2f(uG, RTS_DETAIL_ALPHA, px / RTS_DETAIL_TILE);
  return mag;
}
