/* render3d/shelf3d.js - the sea is shallow at its shore. Part of rts.render3d.

   The sea was one deep blue from the foam line out. The shore had a look of its own - foam, a
   turquoise line and the seabed through thin water (meshfs3d.js) - but all of it lived inside the
   first fifth of a cell, because the only measure of the coast the sea had was its mask: one
   texel a cell, read bilinear, which runs from land to open water in a single cell. A beach went
   from sand to the deep in a hand's breadth, where real water lightens over the sand for a long
   way out: turquoise at the beach, green-blue over the shelf, blue only where it is deep.

   So the mask carries a second number: in its green channel, how far each water cell lies from
   the nearest land, in cells (an 8-way chamfer, capped at R3D_SHELF_CAP). Read bilinear at the
   same warped point the coast is cut at, half a cell less is the distance from the waterline,
   and that is the depth the sea is coloured by: turned toward turquoise and lifted out to
   R3D_SHELF_W cells, a little more of the seabed showing through it, and on the sand the
   caustics - the light the chop focuses, a net of bright lines drifting over the bottom. The
   net is fine, so it fades out as the view draws back (R3D_SHELF_FADE device pixels a world
   unit), where it would only shimmer.

   The tide rebuilds the mask (world3d.js), so the shallows walk out with the water and back. The
   apron's painted sea (terrain3d.js) reads the same channel, so a shore that runs off the map is
   shallow on both sides of the edge. R3.shelfAmt = 0 is the before-picture; R3.causticAmt = 0
   takes the caustics alone out. */

var R3D_SHELF_CAP = 6;               /* cells: the reach of the distance field; past it, the open sea */
var R3D_SHELF_W = 2.6;               /* cells out from the waterline that the shallows reach */
/* the shallows' colour as a share of the deep's, per channel: the deep blue (bake.js #2b4c6b)
   turned to a light turquoise at the beach. A ratio rather than a colour, so the swell's tone
   (wave3d.js) and the hour's light carry on through it */
var R3D_SHELF_TINT = [1.30, 1.80, 1.30];
var R3D_SHELF_FADE = [6.0, 12.0];    /* device pixels a world unit: the caustics fade in over these */

/* How far each cell of `wet` (1 water, 0 land, N x N) lies from the nearest land cell, centre to
   centre, in cells, up to `cap`: the two-pass chamfer (1 along, root 2 across). Off the map is
   not land - a sea that runs off the edge is open there, as the apron draws it. */
function _r3dShoreDist(N, wet, cap) {
  var D = new Float32Array(N * N), R2 = Math.SQRT2, x, z, i, v;
  for (i = 0; i < N * N; i++) D[i] = wet[i] ? cap : 0;
  for (z = 0; z < N; z++) for (x = 0; x < N; x++) {
    i = z * N + x; v = D[i];
    if (!v) continue;
    if (x > 0) v = Math.min(v, D[i - 1] + 1);
    if (z > 0) {
      v = Math.min(v, D[i - N] + 1);
      if (x > 0) v = Math.min(v, D[i - N - 1] + R2);
      if (x < N - 1) v = Math.min(v, D[i - N + 1] + R2);
    }
    D[i] = v;
  }
  for (z = N - 1; z >= 0; z--) for (x = N - 1; x >= 0; x--) {
    i = z * N + x; v = D[i];
    if (!v) continue;
    if (x < N - 1) v = Math.min(v, D[i + 1] + 1);
    if (z < N - 1) {
      v = Math.min(v, D[i + N] + 1);
      if (x < N - 1) v = Math.min(v, D[i + N + 1] + R2);
      if (x > 0) v = Math.min(v, D[i + N - 1] + R2);
    }
    D[i] = v;
  }
  return D;
}

/* From the mask's green channel: _shoreD, how many cells out from the waterline (half a cell less
   than from the land's centre); _shelfK, the shallows' weight - 1 at the waterline, 0 from
   R3D_SHELF_W cells out. Both programs that draw the sea read them - the mesh program, which
   freezes its shore from _shoreD under snow, and the apron's paint. */
var R3D_SHELF_K_GLSL =
  'float _shoreD(float g){ return max(g * ' + R3D_SHELF_CAP.toFixed(1) + ' - 0.5, 0.0); }' +
  'float _shelfK(float g){' +
  '  float k = 1.0 - smoothstep(0.0, ' + R3D_SHELF_W.toFixed(2) + ', _shoreD(g)); return k * k; }';

/* The sea's colour over its depth, and the caustics on the sand: for the mesh program's water
   (meshfs3d.js). uShelf is (on, device pixels a world unit - 0 without the caustics), set with
   the water draw (terrain3d.js _r3dSeaSet). c is the water as shaded, w the world position, sh
   _shelfK, t the clock, day the hour's light. */
var R3D_SHELF_GLSL = R3D_SHELF_K_GLSL +
  'uniform vec2 uShelf;' +
  'vec3 _shelf(vec3 c, vec2 w, float sh, float t, vec3 day){' +
  '  sh *= uShelf.x;' +
  '  if (sh <= 0.0) return c;' +
  '  c *= mix(vec3(1.0), vec3(' + R3D_SHELF_TINT.map(function (k) { return k.toFixed(3); }).join(', ') + '), sh);' +
  '  float cf = smoothstep(' + R3D_SHELF_FADE[0].toFixed(1) + ', ' + R3D_SHELF_FADE[1].toFixed(1) + ', uShelf.y) * sh * (1.0 - 0.55 * sh);' +
  '  if (cf > 0.0) {' +
  '    vec2 p = w * 0.62;' +
  '    float n1 = _vn(p + vec2(t * 0.29, t * 0.17)), n2 = _vn(p * 1.31 + vec2(7.3 - t * 0.21, 3.1 + t * 0.26));' +
  '    float ca = 1.0 - smoothstep(0.0, 0.085, abs(n1 - n2));' +
  '    c += vec3(0.80, 0.95, 0.90) * day * ca * cf * 0.22;' +
  '  }' +
  '  return c; }';
