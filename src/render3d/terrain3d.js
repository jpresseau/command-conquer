/* render3d/terrain3d.js - the ground as materials, not as a baked picture. Part of rts.render3d.

   THIS IS WHERE THE GAME STOPS BEING RED ALERT. Until now the 3D ground was the 2D renderer's
   baked terrain canvas - Red Alert's own format, twenty-four art pixels a cell - magnified onto
   a heightfield. Up close that is a mosaic of eight-pixel squares, and everything since has been
   a way of living with it: NEAREST magnification so the squares stay honest, a grain overlay to
   put back what the stretch took out, the EPX staircase redraw (R3D_PIX_GLSL). The aim now is a
   look of the game's own - warm, sunlit, built-up ground in the spirit of the later 3D RTS
   games, where grass, sand, paving and dirt are materials that meet in soft natural borders.

   SO THE GROUND IS COMPUTED PER PIXEL, IN WORLD SPACE. The only texture is R3.groundMap: one texel
   per CELL carrying what the cell IS (its terrain kind) and what has happened to it (scorch,
   crater). Everything the eye sees - a meadow's colour drifting over twenty metres, clumps, the
   dirt showing through, pebbles, sand ripples, flagstones and their mortar, cracks in rock, leaf
   litter under the trees - is noise and pattern evaluated at the pixel's own world position, so
   it is as sharp at the closest zoom as at the furthest and never shows a texel.

   BORDERS. The four cells around a pixel are read and blended by their bilinear weights - pushed
   through a noise warp so a border wanders instead of following the grid, and sharpened so it
   reads as an edge rather than a smear. The noise every material is made of is evaluated once
   for the pixel, and each corner's material is a few mixes of it.

   LIGHT. The materials carry a height as well as a colour, and the dominant one's SLOPE is
   worked out at the pixel - not differenced, which costs three evaluations - to give a bump
   normal lit by the same sun as everything else: relative to flat, like the relief term in the
   vertex stage, so the flats keep their brightness and the texture gains depth.

   window.RTS_GROUND_LEGACY puts the baked Red Alert ground back, for comparison and for the
   specs that measure it. */

/* How far fine detail survives with distance: below this many device pixels per world unit the
   finest patterns (blades, pebbles, mortar) fade out rather than shimmer. */
var R3D_MAT_DETAIL_PX = 18;

var R3D_MAT_GLSL =
  'uniform sampler2D uMap; uniform vec4 uMat;' +          /* on, 1/N, N/2 - 0.5, detail */
  'uniform sampler2D uOreT;' +                             /* the ore field: colour, richness in .a */
  'uniform float uTileInv;' +
  /* the noise, and the border's wander, are render3d/noise3d.js's - shared with the sea */
  R3D_NOISE_GLSL +
  /* ---- the materials. Each returns colour (sRGB, 0..1) and a height in .a ---- */
  /* ROUND GRAINS: one per lattice cell, at a random spot, only in some cells. Thresholding value
     noise instead gives blobs that snap to the noise's own grid and read as dashes. Returns
     the grain's coverage, and its slope in gg; `r` its radius as a share of the cell, `keep`
     the share of cells lit. */
  'float _grainG(vec2 p, float r, float keep, out vec2 gg){ vec2 gi = floor(p);' +
  '  vec2 go = vec2(_h2(gi + vec2(4.0, 1.0)), _h2(gi + vec2(9.0, 6.0))) * (1.0 - 2.0 * r) + r;' +
  '  vec2 dv = fract(p) - go; float l = length(dv), on = step(1.0 - keep, _h2(gi));' +
  '  float t = clamp((l - r * 0.55) / (r * 0.45), 0.0, 1.0);' +
  '  gg = -on * 6.0 * t * (1.0 - t) / (r * 0.45) * dv / max(l, 1e-4);' +
  '  return (1.0 - t * t * (3.0 - 2.0 * t)) * on; }' +
  /* COBBLES: a jittered Voronoi, so every stone has its own shape and nothing lines up. Returns
     the distance to the nearest stone's centre, the gap to the next one (small on a seam) and
     a per-stone tone - and the offsets to both centres, which is what the relief's slope is
     made of. */
  'vec3 _vorR(vec2 p, out vec2 r1, out vec2 r2){ vec2 i = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0; vec2 id = i;' +
  '  r1 = vec2(0.0); r2 = vec2(0.0);' +
  '  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {' +
  '    vec2 g = vec2(float(x), float(y));' +
  '    vec2 o = vec2(_h2(i + g), _h2(i + g + vec2(7.3, 1.7))) * 0.8 + 0.1;' +
  '    vec2 r = g + o - f; float d = dot(r, r);' +
  '    if (d < d1) { d2 = d1; r2 = r1; d1 = d; r1 = r; id = i + g; } else if (d < d2) { d2 = d; r2 = r; } }' +
  '  return vec3(sqrt(d1), sqrt(d2) - sqrt(d1), _h2(id + vec2(3.7, 9.1))); }' +
  /* ---- the materials: colour (sRGB, 0..1) and a height in .a, each a few mixes of the noise
     _groundAt evaluates once for the pixel -
       N.x  broad drift           fbm, 14 units      grass meadow, dirt, sand
       N.y  patches               fbm, 9 units       bare grass, rock, forest floor, worn paving
       N.z  clumps                value, 1.1 units   grass clumps, rock cracks
       N.w  blades                value, a quarter   grass blades, leaf litter
       M.x  weathering            value, 0.7 units   dirt, concrete, a stone's face
       M.y  wind ripples          sin, bent          sand
       M.z  pebbles               grains, 2.4 a unit dirt, gravel on a track   ---- */
  'vec4 _grass(vec4 N, vec4 M, float det){' +
  '  vec3 c = mix(vec3(0.33, 0.45, 0.17), vec3(0.50, 0.58, 0.24), smoothstep(0.30, 0.72, N.x));' +
  '  c *= 0.86 + 0.26 * N.z;' +
  '  c *= 1.0 + (N.w - 0.5) * 0.22 * det;' +                /* blades, faded with distance */
  /* bare patches: the ground showing through, soft-edged */
  '  c = mix(c, vec3(0.55, 0.47, 0.31) * (0.9 + 0.2 * N.z), smoothstep(0.60, 0.70, N.y) * 0.85);' +
  '  return vec4(c, N.z * 0.6 + N.w * 0.25 * det); }' +
  'vec4 _dirt(vec4 N, vec4 M, float det){' +
  '  vec3 c = mix(vec3(0.47, 0.38, 0.24), vec3(0.62, 0.52, 0.34), N.x);' +
  '  c = mix(c, vec3(0.64, 0.58, 0.47), M.z * 0.45 * det);' +
  '  c *= 0.93 + 0.14 * M.x;' +
  '  return vec4(c, N.x * 0.5 + M.z * 0.5 * det); }' +
  'vec4 _sand(vec4 N, vec4 M, float det){' +
  '  vec3 c = mix(vec3(0.74, 0.64, 0.44), vec3(0.86, 0.77, 0.56), N.x);' +
  '  c *= 1.0 + M.y * 0.045 * det;' +                       /* wind ripples, bent by noise */
  '  return vec4(c, (M.y * 0.5 + 0.5) * 0.35 * det + N.x * 0.2); }' +
  /* worn: where the paving is thin the stones are missing and the sand shows through */
  'vec4 _paving(vec4 N, vec4 M, vec3 v, float det){' +
  '  float stone = smoothstep(0.03, 0.14, v.y);' +          /* 0 in the seam, 1 on the stone */
  '  vec3 c = mix(vec3(0.60, 0.55, 0.45), vec3(0.80, 0.74, 0.62), v.z);' +
  '  c *= 0.9 + 0.14 * M.x;' +                              /* weathering across a stone */
  '  c *= 1.0 - v.x * 0.18;' +                              /* each stone domed: its rim darker */
  '  float wr = smoothstep(0.58, 0.72, N.y);' +
  '  c = mix(vec3(0.50, 0.43, 0.31), c, stone * (1.0 - wr));' +   /* sand packed in the seams */
  '  return vec4(c, (stone * (1.0 - v.x * 0.5)) * (1.0 - wr) * 0.9 + 0.1); }' +
  /* a dirt track: packed, paler down the middle where the wheels run, gravel through it */
  'vec4 _track(vec4 N, vec4 M, float det){' +
  '  vec4 d = _dirt(N, M, det);' +
  '  d.rgb = mix(d.rgb * vec3(1.08, 1.05, 1.0), vec3(0.66, 0.61, 0.52), M.z * 0.35 * det);' +
  '  return vec4(d.rgb, d.a * 0.7 + M.z * 0.1 * det); }' +
  'vec4 _rockg(vec4 N, vec4 M, float det){' +
  '  vec3 c = mix(vec3(0.46, 0.42, 0.35), vec3(0.64, 0.59, 0.49), N.y);' +
  '  float cr = 1.0 - abs(N.z * 2.0 - 1.0);' +              /* ridged: cracks where it peaks */
  '  c *= 1.0 - smoothstep(0.86, 0.98, cr) * 0.45 * det;' +
  '  return vec4(c, N.y * 0.8 - smoothstep(0.86, 0.98, cr) * 0.5); }' +
  'vec4 _forest(vec4 N, vec4 M, float det){' +
  '  vec3 c = mix(vec3(0.20, 0.27, 0.11), vec3(0.31, 0.36, 0.16), N.y);' +
  '  c = mix(c, vec3(0.45, 0.33, 0.17), smoothstep(0.62, 0.8, N.w) * 0.55 * det);' +   /* leaf litter */
  '  return vec4(c, N.y * 0.5 + N.w * 0.3 * det); }' +
  'vec4 _concrete(vec2 w, vec4 M, float det){' +
  '  vec2 f = fract(w * 0.5);' +
  '  float j = 1.0 - smoothstep(0.02, 0.04, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));' +
  '  vec3 c = vec3(0.62, 0.61, 0.57) * (0.92 + 0.1 * M.x);' +
  '  c = mix(c, vec3(0.45, 0.44, 0.41), j * det);' +
  '  return vec4(c, (1.0 - j) * 0.3 * det); }' +
  /* kind codes are RTS_T_*: grass 0, tree 1, rock 2, water 3, road 4, sand 5, wall 6 - and one
     of the ground map's own, 7: PAVED, laid round the buildings - see _r3dGroundMap */
  'vec4 _mat(float k, vec2 w, vec4 N, vec4 M, vec3 v, float det){' +
  '  if (k < 0.5) return _grass(N, M, det);' +
  '  if (k < 1.5) return _forest(N, M, det);' +
  '  if (k < 2.5) return _rockg(N, M, det);' +
  '  if (k < 3.5) return _sand(N, M, det) * vec4(0.62, 0.66, 0.66, 1.0);' +   /* seabed, under the sea */
  '  if (k < 4.5) return _track(N, M, det);' +
  '  if (k < 5.5) return _sand(N, M, det);' +
  '  if (k < 6.5) return _concrete(w, M, det);' +
  '  return _paving(N, M, v, det); }' +
  /* ---- the ground at one world position ---- */
  /* kdom: the kind that won the blend here, which the bump then differences - asked of the SAME
     warped, height-blended weights as the colour, or the relief changes on a grid line the
     colour does not (it did: a straight seam wherever two materials' bumps differed) */
  'vec4 _groundAt(vec2 w, out float kdom, out float oreM, out vec2 grad){' +
  '  float det = uMat.w;' +
  '  vec2 cc = w * uTileInv + uMat.z;' +
  /* the border wanders - the same warp the sea cuts its shoreline with (noise3d.js) */
  '  cc += _gwarp(w);' +
  '  vec2 i0 = floor(cc), f = fract(cc);' +
  '  vec4 a = texture2D(uMap, (i0 + vec2(0.5, 0.5)) * uMat.y);' +
  '  vec4 b = texture2D(uMap, (i0 + vec2(1.5, 0.5)) * uMat.y);' +
  '  vec4 c = texture2D(uMap, (i0 + vec2(0.5, 1.5)) * uMat.y);' +
  '  vec4 d = texture2D(uMap, (i0 + vec2(1.5, 1.5)) * uMat.y);' +
  '  float ka = floor(a.r * 255.0 / 16.0 + 0.5), kb = floor(b.r * 255.0 / 16.0 + 0.5);' +
  '  float kc = floor(c.r * 255.0 / 16.0 + 0.5), kd = floor(d.r * 255.0 / 16.0 + 0.5);' +
  /* THE NOISE, ONCE. Every material is a few mixes of the same handful of noises, so they are
     evaluated here, once for the pixel, and the corners' materials are arithmetic on them. Per
     material, a pixel on a border paid for up to four materials' noise - and the harness's
     software rasteriser, which runs every branch, for all eight at each of four corners: a
     frame took 2.3s where the baked ground took 1.1, and real clicks timed out waiting for it.
     The cobbles' Voronoi, the one expensive noise only one kind needs, is only worked out where
     a corner is paved. */
  '  vec4 N = vec4(_fbm(w * 0.07), _fbm(w * 0.11 + vec2(31.0, 5.0)), _vn(w * 0.87), _vn(w * 4.2 + vec2(3.1, 7.7)));' +
  '  float arg = dot(w, vec2(0.83, 0.56)) * 2.6 + _vn(w * 0.25) * 7.0;' +
  '  vec2 gg; float pb = _grainG(w * 2.4, 0.22, 0.35, gg);' +
  '  vec4 M = vec4(_vn(w * 1.5), sin(arg), pb, 0.0);' +
  '  vec3 v = vec3(0.5); vec2 r1 = vec2(0.0), r2 = vec2(0.0);' +
  '  if (max(max(ka, kb), max(kc, kd)) > 6.5) v = _vorR(w * 1.3, r1, r2);' +
  /* HEIGHT-BLENDED, the way a painter would do it: at a border the HIGHER material wins -
     cobbles poke up through thinning grass, clumps of grass sit up out of sand - so the edge is
     crisp and organic instead of a cross-fade. */
  '  vec4 mA = _mat(ka, w, N, M, v, det), mB = mA, mC = mA, mD = mA;' +
  '  if (kb != ka) { mB = _mat(kb, w, N, M, v, det); }' +
  '  if (kc != ka) { if (kc == kb) { mC = mB; } else { mC = _mat(kc, w, N, M, v, det); } }' +
  '  if (kd != ka) { if (kd == kb) { mD = mB; } else if (kd == kc) { mD = mC; } else { mD = _mat(kd, w, N, M, v, det); } }' +
  '  vec4 bw = vec4((1.0 - f.x) * (1.0 - f.y), f.x * (1.0 - f.y), (1.0 - f.x) * f.y, f.x * f.y);' +
  '  vec4 hs = bw + vec4(mA.a, mB.a, mC.a, mD.a) * 0.32;' +
  '  float hm = max(max(hs.x, hs.y), max(hs.z, hs.w));' +
  '  vec4 wt = max(hs - hm + 0.12, 0.0); wt /= (wt.x + wt.y + wt.z + wt.w);' +
  '  vec4 col = mA * wt.x + mB * wt.y + mC * wt.z + mD * wt.w;' +
  '  kdom = ka; float wb = wt.x;' +
  '  if (wt.y > wb) { wb = wt.y; kdom = kb; }' +
  '  if (wt.z > wb) { wb = wt.z; kdom = kc; }' +
  '  if (wt.w > wb) { kdom = kd; }' +
  /* THE RELIEF of the kind that won, its slope worked out rather than differenced. Grass, forest
     floor and rock are gradient noise (_gnd); sand is the ripples' own slope, a track its
     pebbles', paving its stones' domes and seams from the Voronoi's offsets. */
  '  grad = vec2(0.0);' +
  '  if (kdom < 2.5) {' +
  '    vec3 d1 = _gnd(w * 0.85), d2 = _gnd(w * 4.2 + vec2(3.1, 7.7));' +
  '    if (kdom < 0.5) { grad = d1.yz * 0.51 + d2.yz * 0.75 * det; }' +
  '    else if (kdom < 1.5) { grad = d1.yz * 0.15 + d2.yz * 0.78 * det; }' +
  '    else { float x = 1.0 - abs(d1.x * 2.0 - 1.0), t = clamp((x - 0.86) / 0.12, 0.0, 1.0);' +
  '      grad = d1.yz * 0.2 + 50.0 * t * (1.0 - t) * sign(d1.x * 2.0 - 1.0) * d1.yz * 0.85; }' +
  '  } else if (kdom > 3.5 && kdom < 4.5) { grad = gg * 2.4 * 0.45 * det; }' +
  '  else if (kdom > 4.5 && kdom < 5.5) { grad = cos(arg) * 2.6 * vec2(0.83, 0.56) * 0.175 * det; }' +
  '  else if (kdom > 6.5) {' +
  '    vec2 g1 = -r1 / max(v.x, 1e-4), g2 = -r2 / max(v.x + v.y, 1e-4);' +
  '    float t = clamp((v.y - 0.03) / 0.11, 0.0, 1.0);' +
  '    grad = (1.0 - smoothstep(0.58, 0.72, N.y)) * det * 1.3 *' +
  '           (6.0 * t * (1.0 - t) / 0.11 * (g2 - g1) * (1.0 - v.x * 0.5) - 0.5 * t * t * (3.0 - 2.0 * t) * g1);' +
  '  }' +
  /* SCARS: scorch blends like the ground does; a crater is drawn round its own cell's centre */
  '  float sc = dot(wt, vec4(a.g, b.g, c.g, d.g));' +
  '  if (sc > 0.002) {' +
  '    float burn = sc * smoothstep(0.35, 0.65, _fbm(w * 0.6 + vec2(4.0, 9.0)) + sc * 0.4);' +
  '    col.rgb = mix(col.rgb, vec3(0.13, 0.11, 0.09), clamp(burn, 0.0, 0.85));' +
  '  }' +
  '  vec2 cr = i0 + vec2(0.5); float crat = 0.0;' +
  '  if (a.b > 0.5) crat = max(crat, 1.0 - length(cc - cr + vec2(0.5)) * 2.2);' +
  '  if (b.b > 0.5) crat = max(crat, 1.0 - length(cc - cr - vec2(0.5, -0.5)) * 2.2);' +
  '  if (c.b > 0.5) crat = max(crat, 1.0 - length(cc - cr - vec2(-0.5, 0.5)) * 2.2);' +
  '  if (d.b > 0.5) crat = max(crat, 1.0 - length(cc - cr - vec2(0.5)) * 2.2);' +
  '  col.rgb *= 1.0 - smoothstep(0.0, 0.5, crat) * 0.55;' +
  /* ORE SOIL. The field is read from the ore texture - one texel per cell, LINEAR, its colour
     the mineral's and its alpha how much is left (_r3dOreTex) - and laid INTO the ground rather
     than over it: a rich soil in the mineral's colour, darker in its veins, flecked with bright
     grains, breaking up at its edge by noise and thinning as the field is worked. */
  '  vec4 ore = texture2D(uOreT, (w * uTileInv + uMat.z + 0.5) * uMat.y);' +
  '  oreM = 0.0;' +
  '  if (ore.a > 0.004) {' +
  /* coverage follows what is LEFT, steeply: a full cell is soil, a worked-out one is the ground
     it lay on again (e2e/ore3d: the map has to say where the ore still is) */
  '    float om = smoothstep(0.30, 0.72, ore.a * 1.25 + (_fbm(w * 0.45 + vec2(2.0, 5.0)) - 0.5) * 0.55);' +
  '    oreM = om;' +
  '    float ov = _fbm(w * 0.3 + vec2(9.0, 1.0));' +
  /* earthy, not paint: the mineral's colour carried by a brown soil */
  '    vec3 soil = mix(vec3(0.30, 0.24, 0.16), mix(vec3(0.52, 0.42, 0.28), ore.rgb, 0.55), ov);' +
  /* grains: one per lattice cell at a random spot, round, and only in some cells */
  '    vec2 gp = w * 3.2, gi = floor(gp);' +
  '    vec2 go = vec2(_h2(gi + vec2(4.0, 1.0)), _h2(gi + vec2(9.0, 6.0))) * 0.6 + 0.2;' +
  '    float fl = (1.0 - smoothstep(0.05, 0.12, length(fract(gp) - go))) * step(0.55, _h2(gi));' +
  '    soil = mix(soil, min(ore.rgb * 1.6 + 0.15, vec3(1.0)), fl * det * 0.85);' +
  '    col.rgb = mix(col.rgb, soil, om);' +
  '  }' +
  '  col.a -= smoothstep(0.0, 0.6, crat) * 1.5;' +
  '  return col; }' +
  'vec4 _groundLit(vec2 w, vec3 L){' +
  '  float k, om; vec2 gr;' +
  '  vec4 g = _groundAt(w, k, om, gr);' +
  '  gr *= 0.12;' +
  /* under ore soil the grass's clumps are not there to cast relief */
  '  vec3 n = normalize(vec3(-gr.x * 3.2, 1.0, -gr.y * 3.2) * vec3(1.0 - om * 0.8, 1.0, 1.0 - om * 0.8));' +
  '  float lit = clamp(dot(n, L) / max(L.y, 0.2), 0.55, 1.35);' +
  '  return vec4(g.rgb * lit, 1.0); }';

/* THE GROUND MAP: one texel per cell. R = ground kind * 16, G = scorch (0..1), B = crater.
   Rebuilt only when what it encodes has changed - hashed off the source arrays, the same way the
   shroud is (see _r3dFog in ground3d.js for why a dirty flag is not good enough here).

   THE BASE STANDS ON PAVING. A kind of the ground map's own, R3D_KIND_PAVED, laid under and
   round every building: its footprint and R3D_PAVE_RING cells beyond on open ground, and road
   within R3D_PAVE_ROAD cells of it - so a base grows a cobbled plaza with streets running out
   of it, and the roads out in the country stay dirt tracks. It follows the base as it is built
   and razed: the buildings are part of the key. */
var R3D_KIND_PAVED = 7;
var R3D_PAVE_RING = 1;
var R3D_PAVE_ROAD = 4;
function _r3dPaved(G) {
  var N = RTS_N, out = new Uint8Array(N * N);
  for (var i = 0; i < G.ents.length; i++) {
    var e = G.ents[i];
    if (e.dead || e.type !== 'struct') continue;
    var d = rtsStructDef(e.def);
    if (!d || d.wall) continue;
    var R = R3D_PAVE_ROAD;
    for (var tz = e.tz - R; tz < e.tz + d.h + R; tz++) {
      for (var tx = e.tx - R; tx < e.tx + d.w + R; tx++) {
        if (!_rtsInB(tx, tz)) continue;
        var k = _rtsIdx(tx, tz), kind = G.terrain[k];
        var inner = tx >= e.tx - R3D_PAVE_RING && tx < e.tx + d.w + R3D_PAVE_RING &&
                    tz >= e.tz - R3D_PAVE_RING && tz < e.tz + d.h + R3D_PAVE_RING;
        if (kind === RTS_T_ROAD || (inner && (kind === RTS_T_GRASS || kind === RTS_T_SAND))) out[k] = 1;
      }
    }
  }
  return out;
}
function _r3dGroundMap(gl, R3, G) {
  var N = RTS_N, i, h = 2166136261 >>> 0;
  for (i = 0; i < N * N; i++) {
    h = Math.imul(h ^ G.terrain[i], 16777619) >>> 0;
    if (G.scorch && G.scorch[i]) h = Math.imul(h ^ (G.scorch[i] + 7 * i), 16777619) >>> 0;
  }
  for (i = 0; i < G.ents.length; i++) {
    var se = G.ents[i];
    if (se.type !== 'struct' || se.dead) continue;
    h = Math.imul(h ^ (se.tx * 131 + se.tz * 7 + 1), 16777619) >>> 0;
  }
  if (R3.groundMapTex && R3.groundMapKey === h && R3.groundMapN === N) return R3.groundMapTex;
  var d = new Uint8Array(N * N * 4), paved = _r3dPaved(G);
  for (i = 0; i < N * N; i++) {
    var sv = G.scorch ? G.scorch[i] : 0;
    d[i * 4] = Math.min(255, (paved[i] ? R3D_KIND_PAVED : G.terrain[i]) * 16);
    d[i * 4 + 1] = sv ? Math.min(255, 90 + ((sv & 7) * 28)) : 0;
    d[i * 4 + 2] = (sv & 8) ? 255 : 0;
    d[i * 4 + 3] = 255;
  }
  var t = R3.groundMapTex || gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  /* NEAREST: a kind code is a label, and averaging two labels invents a third */
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, N, N, 0, gl.RGBA, gl.UNSIGNED_BYTE, d);
  R3.groundMapTex = t; R3.groundMapKey = h; R3.groundMapN = N;
  R3.groundMapBuilds = (R3.groundMapBuilds || 0) + 1;
  return t;
}

/* THE MATERIALS HAVE A PROGRAM OF THEIR OWN. They were a branch in the ground's textured
   program, which the fog and the ore stain share - and a branch is not free everywhere: the
   harness's software renderer runs both sides of it, so the shroud, drawn over the whole screen,
   paid for every material under it and a frame took three times as long as before the ground
   changed (a real mouse click then took 50s to land - e2e/savebuttons). Two programs is also
   what a GPU prefers: the shroud's is a texture lookup again, and this one carries no pixel-art
   path it never takes. Built on first use and allowed to fail on its own, so a device that
   cannot compile it draws the baked ground rather than no 3D at all. */
function _r3dMatFS() {
  return 'precision highp float; varying vec2 vT; varying float vShade; varying vec2 vW;' +
    R3D_MAT_GLSL +
    R3D_SHADOW_GLSL +
    'void main(){' +
    '  vec4 c = _groundLit(vW, vec3(' + R3_LIGHT[0].toFixed(4) + ', ' + R3_LIGHT[1].toFixed(4) + ', ' +
         R3_LIGHT[2].toFixed(4) + '));' +
    /* the ground's own shade and relief, exactly as the textured program applies them */
    '  vec3 lit = c.rgb * mix(vec3(0.575, 0.600, 0.655), vec3(1.0), _shadowAt());' +
    '  gl_FragColor = vec4(lit * vShade, 1.0);' +
    '}';
}

/* The materials program when they are wanted and it builds; null for the baked ground. */
function _r3dMatProgram(gl, R3, G) {
  if (window.RTS_GROUND_LEGACY || !G || !R3.oreTex || R3.matFail) return null;
  if (!R3.matP) {
    try { R3.matP = _r3dProgram(gl, R3D_TEX_VS, _r3dMatFS()); } catch (e) { R3.matP = null; }
    if (!R3.matP) { R3.matFail = 1; return null; }
  }
  return R3.matP;
}

/* The ground mesh onto program P's attributes - the ground, the stain and the shroud all draw it. */
function _r3dGroundBind(gl, R3, P) {
  var at = [['aP', R3.groundBuf, 3], ['aN', R3.groundNB, 3], ['aT', R3.groundUV, 2]];
  for (var i = 0; i < at.length; i++) {
    var a = gl.getAttribLocation(P, at[i][0]);
    if (a < 0) continue;
    gl.bindBuffer(gl.ARRAY_BUFFER, at[i][1]);
    gl.enableVertexAttribArray(a);
    gl.vertexAttribPointer(a, at[i][2], gl.FLOAT, false, 0, 0);
  }
}

/* THE GROUND'S DRAW: the materials, or the baked picture with its grain and its staircase redraw.
   Leaves the textured program bound when that is what drew, which the ore stain draws with. */
function _r3dGroundDraw(gl, R3, G, cam, invD) {
  _r3dOreTex(G);                                    /* the materials read the ore field too */
  var M = _r3dMatProgram(gl, R3, G), P = M || R3.texP;
  R3.matOn = !!M;
  gl.useProgram(P);
  gl.uniform4fv(gl.getUniformLocation(P, 'uCam'), cam);
  gl.uniform2f(gl.getUniformLocation(P, 'uTilt'), R3.cp, R3.sp);
  gl.uniform1f(gl.getUniformLocation(P, 'uInvD'), invD);
  if (M) {
    _r3dMatSet(gl, R3, M, G);
    R3.grainMag = 0; R3.pixMag = 0;
  } else {
    gl.uniform1f(gl.getUniformLocation(P, 'uA'), 1);
    gl.uniform1f(gl.getUniformLocation(P, 'uRecv'), 1);        /* the ground takes the world's shadows */
    /* the grain the magnification destroyed, and the staircases redrawn - see R3D_TEX_FS */
    R3.grainMag = _r3dGrainSet(gl, R3, P);
    R3.pixMag = _r3dPixSet(gl, R3, P, true);
  }
  _r3dShadowBind(P, 1);
  _r3dGroundBind(gl, R3, P);
  gl.bindTexture(gl.TEXTURE_2D, R3.terrainTex);
  gl.drawArrays(gl.TRIANGLES, 0, R3.groundVerts);
}

/* The materials' inputs: the ground map on texture unit 4, the ore field on 5, and how much fine
   detail survives at this zoom. */
function _r3dMatSet(gl, R3, P, G) {
  var u = gl.getUniformLocation(P, 'uMat');
  if (!u) return false;
  var px = (typeof _rtsZoom === 'function' ? _rtsZoom() : 0) * (R3.scale || 1);
  gl.activeTexture(gl.TEXTURE0 + 4);
  gl.bindTexture(gl.TEXTURE_2D, _r3dGroundMap(gl, R3, G));
  gl.uniform1i(gl.getUniformLocation(P, 'uMap'), 4);
  gl.activeTexture(gl.TEXTURE0 + 5);
  gl.bindTexture(gl.TEXTURE_2D, R3.oreTex);
  gl.uniform1i(gl.getUniformLocation(P, 'uOreT'), 5);
  gl.activeTexture(gl.TEXTURE0);
  gl.uniform1f(gl.getUniformLocation(P, 'uTileInv'), 1 / RTS_TILE);
  gl.uniform4f(u, 1, 1 / RTS_N, RTS_N / 2 - 0.5, Math.min(1, px / R3D_MAT_DETAIL_PX));
  return true;
}

/* The sea's shoreline switch, for the water draw in scene3d.js: on, with the mask bound on unit
   6 and blending for the shallows; off again afterwards, for everything else the mesh program
   draws. See R3D_MESH_FS. */
function _r3dSeaSet(gl, R3, P, on) {
  var u = gl.getUniformLocation(P, 'uSea');
  if (!u) return;
  /* on whichever ground is drawn: the sheet reaches a cell past the shore either way, so the
     cut is what keeps it off the land. RTS_SEA_CUT_OFF is e2e/terrainmat's before-picture. */
  if (!on || !R3.seaMaskTex || window.RTS_SEA_CUT_OFF) {
    gl.uniform4f(u, 0, 0, 0, 0); gl.disable(gl.BLEND); return;
  }
  gl.activeTexture(gl.TEXTURE0 + 6);
  gl.bindTexture(gl.TEXTURE_2D, R3.seaMaskTex);
  gl.uniform1i(gl.getUniformLocation(P, 'uSeaM'), 6);
  gl.activeTexture(gl.TEXTURE0);
  gl.uniform4f(u, 1, 1 / RTS_N, RTS_N / 2 - 0.5, 1 / RTS_TILE);
  /* R3.rippleAmt takes the chop out and leaves the swell, so e2e/sea can still see the swell */
  gl.uniform1f(gl.getUniformLocation(P, 'uRip'), R3.rippleAmt === undefined ? 1 : R3.rippleAmt);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
}
