/* render3d/scar3d.js - battle scars on the ground. Part of rts.render3d.

   A shell that hits scorches its cell, and a big blast or a razed building craters it
   (core/transport.js _rtsAnimMiddle, core/capture.js _rtsWreckGround): a flag a cell, kept in
   the save, that the 2D view draws as one of six scorch sprites or its crater. The 3D ground drew
   a scorch as the cell itself gone near-black - blended over the cell the way a kind of ground
   is, so it filled it, four world units across - and a crater as a darker disc. From a phone's
   zoom a firefight left ink spilt over the grass. Now a scarred cell carries a mark of its own,
   somewhere in the cell (a hash of the cell) and the size of the blast that made it:

   - A SCORCH: a charred core flecked with ash and paler at its heart, ragged at its edge and
     thrown out in streaks, and a ring of grass singed brown round it - sooted, not browned, on
     paving and snow. Its variant (one of the 2D view's six) sets its size and its streaks.
   - A CRATER: a bowl, and lit as one - its slope tilts the ground's normal, so the side facing
     the sun is bright and the far side in shade - in raw soil darker at the bottom, with a
     raised lip and soil thrown out past it.

   The marks are worked out in the cells' own space, unwarped: the four cells round the pixel are
   read again, since the border's wander would smear a mark a cell across. Not on the apron.
   R3.scarAmt = 0 is the before-picture: the old blotch and disc, kept below as they were. */

var R3D_SCAR = {
  scorch: 0.32,     /* a scorch's charred core, in cells (a cell is four world units) */
  crater: 0.38,     /* a crater's bowl */
  off: 0.18,        /* how far off its cell's centre a mark may lie */
  depth: 0.70,      /* the bowl's depth and its lip's height, world units, for the light */
  lip: 0.14,
  tilt: 2.6         /* world slope to the ground's own relief units (_groundLit: 0.12 x 3.2) */
};

/* toward the sun across the ground, from the light the ground is lit by (r3d/primitives.js); set
   with the switch in _r3dMatSet (terrain3d.js) */
function _r3dScarSun() { var m = Math.hypot(R3_LIGHT[0], R3_LIGHT[2]) || 1; return [R3_LIGHT[0] / m, R3_LIGHT[2] / m]; }

var R3D_SCAR_GLSL =
  'uniform vec3 uScar;' +          /* on, and toward the sun across the ground (_r3dScarSun) */
  /* THE OLD LOOK, as it was in terrain3d.js: the scorch blended over the cell, the crater a disc */
  'vec3 _scarOld(vec3 col, vec2 cc, vec2 i0, vec4 wt, vec4 a, vec4 b, vec4 c, vec4 d, vec2 w, out float crat){' +
  '  float sc = dot(wt, vec4(a.g, b.g, c.g, d.g));' +
  '  if (sc > 0.002) {' +
  '    float burn = sc * smoothstep(0.35, 0.65, _fbm(w * 0.6 + vec2(4.0, 9.0)) + sc * 0.4);' +
  '    col = mix(col, vec3(0.13, 0.11, 0.09), clamp(burn, 0.0, 0.85));' +
  '  }' +
  '  vec2 cr = i0 + vec2(0.5); crat = 0.0;' +
  '  if (a.b > 0.5) crat = max(crat, 1.0 - length(cc - cr + vec2(0.5)) * 2.2);' +
  '  if (b.b > 0.5) crat = max(crat, 1.0 - length(cc - cr - vec2(0.5, -0.5)) * 2.2);' +
  '  if (c.b > 0.5) crat = max(crat, 1.0 - length(cc - cr - vec2(-0.5, 0.5)) * 2.2);' +
  '  if (d.b > 0.5) crat = max(crat, 1.0 - length(cc - cr - vec2(0.5)) * 2.2);' +
  '  return col * (1.0 - smoothstep(0.0, 0.5, crat) * 0.55); }' +
  /* ONE CELL'S MARKS. t its texel (.g the scorch, its variant in the value; .b a crater), q the
     pixel from the cell's centre in cells, id the cell. */
  'void _scar1(inout vec3 col, inout vec2 gr, inout float crat, vec4 t, vec2 q, vec2 id, float det){' +
  '  float s = t.g * 255.0, k = t.b;' +
  '  if (s < 1.0 && k < 0.5) return;' +
  '  float v = s < 1.0 ? 0.0 : floor((s - 90.0) / 28.0 + 0.5);' +
  '  float h = _h2(id * 1.37 + vec2(5.3, 2.9));' +
  '  vec2 dq = q - (vec2(_h2(id + vec2(3.1, 7.7)), _h2(id + vec2(8.3, 1.9))) * 2.0 - 1.0) * ' + R3D_SCAR.off.toFixed(3) + ';' +
  '  float r = length(dq), an = atan(dq.y, dq.x + 1e-5);' +
  '  if (k > 0.5) {' +
  '    float R = ' + R3D_SCAR.crater.toFixed(3) + ' * (0.9 + 0.2 * h);' +
  '    float x = r / R + (_vn(dq * 6.0 + id * 3.3) - 0.5) * 0.26 + (_vn(dq * 17.0 + id) - 0.5) * 0.08;' +
  '    float bowl = 1.0 - smoothstep(0.92, 1.02, x), lip = exp(-(x - 1.0) * (x - 1.0) * 28.0);' +
  /* the slope, world height a world unit: the bowl's inside, and the lip's bump round x = 1 */
  '    float dh = (x < 1.0 ? 2.0 * ' + R3D_SCAR.depth.toFixed(3) + ' * x : 0.0) - ' + R3D_SCAR.lip.toFixed(3) + ' * 56.0 * (x - 1.0) * lip;' +
  '    gr += dq / max(r, 1e-4) * dh / (R * ' + RTS_TILE.toFixed(1) + ') * ' + R3D_SCAR.tilt.toFixed(2) + ';' +
  '    vec3 soil = vec3(0.30, 0.235, 0.165) * (0.7 + 0.3 * x) * (0.85 + 0.3 * _vn(dq * 11.0 + id));' +
  '    col = mix(col, soil, bowl * 0.92);' +
  /* the rim on the sun's side shades the floor below it: a hole, not a patch */
  '    col *= 1.0 - bowl * 0.45 * smoothstep(0.15, 0.65, dot(dq / R, uScar.yz) + x * 0.2);' +
  '    col = mix(col, vec3(0.45, 0.37, 0.27), lip * 0.45 * (1.0 - bowl * 0.5));' +
  '    float thrown = smoothstep(0.55, 0.78, _vn(dq * 11.0 + id * 3.0)) * smoothstep(0.95, 1.1, x) * (1.0 - smoothstep(1.1, 1.85, x));' +
  '    col = mix(col, vec3(0.38, 0.30, 0.21), thrown * 0.8);' +
  '    crat = max(crat, 1.0 - x);' +
  '  }' +
  '  if (v > 0.5) {' +
  '    float R = ' + R3D_SCAR.scorch.toFixed(3) + ' * (0.85 + 0.1 * mod(v, 3.0) + 0.1 * h);' +
  '    float ray = pow(abs(sin(an * (2.0 + mod(v, 3.0)) + h * 6.28)), 3.0) * (0.4 + 0.8 * _vn(vec2(an * 2.0, h * 9.0)));' +
  '    float rr = r / (R * (1.0 + 0.35 * ray)) + (_vn(dq * 7.0 + id * 5.1) - 0.5) * 0.3 + (_vn(dq * 19.0 + id) - 0.5) * 0.15;' +
  '    float ch = 1.0 - smoothstep(0.45, 1.0, rr), singe = 1.0 - smoothstep(0.8, 2.0, rr);' +
  /* grass browns where it burnt; paving and snow are only sooted */
  '    float green = clamp((col.g - max(col.r, col.b)) * 8.0, 0.0, 1.0) * (1.0 - uSnow);' +
  '    col = mix(col, mix(col * 0.6, col * vec3(0.86, 0.64, 0.34) + vec3(0.07, 0.05, 0.01), green), singe * 0.85);' +
  '    vec3 soot = vec3(0.115, 0.088, 0.062) * (0.7 + 0.6 * _vn(dq * 13.0 + id));' +
  /* ash: soft pale mottling, and paler at the heart */
  '    float ash = smoothstep(0.6, 0.85, _vn(dq * 15.0 + id * 2.0)) * det;' +
  '    soot = mix(soot, vec3(0.40, 0.37, 0.33), max(ash * 0.55, (1.0 - smoothstep(0.0, 0.4, rr)) * 0.45));' +
  '    col = mix(col, soot, ch * (k > 0.5 ? 0.55 : 0.86));' +
  '  }' +
  '}' +
  /* THE SCARS round a ground pixel at w. cc, i0 and a..d are _groundAt's own warped cells, for
     the old look; gr its relief, which a crater's slope adds to; crat how far into a crater. */
  'vec3 _scars(vec3 col, vec2 cc, vec2 i0w, vec4 wt, vec4 a, vec4 b, vec4 c, vec4 d, vec2 w, float det, inout vec2 gr, out float crat){' +
  '  crat = 0.0;' +
  '  if (uScar.x < 0.5) return _scarOld(col, cc, i0w, wt, a, b, c, d, w, crat);' +
  '  vec2 p = w * uTileInv + uMat.z, i0 = floor(p), f = p - i0;' +
  '  vec4 ta = texture2D(uMap, (i0 + vec2(0.5, 0.5)) * uMat.y), tb = texture2D(uMap, (i0 + vec2(1.5, 0.5)) * uMat.y);' +
  '  vec4 tc = texture2D(uMap, (i0 + vec2(0.5, 1.5)) * uMat.y), td = texture2D(uMap, (i0 + vec2(1.5, 1.5)) * uMat.y);' +
  '  if (ta.g + tb.g + tc.g + td.g + ta.b + tb.b + tc.b + td.b < 0.002) return col;' +
  '  _scar1(col, gr, crat, ta, f, i0, det);' +
  '  _scar1(col, gr, crat, tb, f - vec2(1.0, 0.0), i0 + vec2(1.0, 0.0), det);' +
  '  _scar1(col, gr, crat, tc, f - vec2(0.0, 1.0), i0 + vec2(0.0, 1.0), det);' +
  '  _scar1(col, gr, crat, td, f - vec2(1.0, 1.0), i0 + vec2(1.0, 1.0), det);' +
  '  return col; }';
