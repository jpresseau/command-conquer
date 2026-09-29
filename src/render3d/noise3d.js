/* render3d/noise3d.js - the noise every procedural surface in the 3D mode is made of. Part of
   rts.render3d.

   A sin-free hash, value noise, a three-octave fbm, gradient noise for bumps - and _gwarp, the
   wander that makes a border between two kinds of ground follow no grid. It lives in a file of
   its own, loaded before the programs are built, because two programs need the SAME warp: the
   ground's materials (terrain3d.js) draw the land's edge with it, and the sea (the mesh
   program, gl3d.js) cuts its shoreline with it. Two copies would drift, and the sea would stop
   meeting its own beach. */
var R3D_NOISE_GLSL =
  'float _h2(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33);' +
  '  return fract((q.x + q.y) * q.z); }' +
  'float _vn(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);' +
  '  return mix(mix(_h2(i), _h2(i + vec2(1.0, 0.0)), u.x),' +
  '             mix(_h2(i + vec2(0.0, 1.0)), _h2(i + vec2(1.0, 1.0)), u.x), u.y); }' +
  'float _fbm(vec2 p){ float s = 0.0, a = 0.5;' +
  '  for (int i = 0; i < 3; i++) { s += a * _vn(p); p = p * 2.03 + vec2(17.1, 9.2); a *= 0.5; }' +
  '  return s; }' +
  /* in CELL units: about half a cell at one scale and an eighth at a finer one */
  'vec2 _gwarp(vec2 w){' +
  '  return (vec2(_vn(w * 0.31), _vn(w * 0.31 + vec2(19.0, 7.0))) - 0.5) * 0.9' +
  '       + (vec2(_vn(w * 1.3), _vn(w * 1.3 + vec2(5.0, 23.0))) - 0.5) * 0.25; }' +
  /* GRADIENT NOISE, for anything that is differentiated - a bump. Value noise is fine as a
     colour and wrong as a height: its slope along z is a row difference interpolated along x,
     so a bump built on it lights in streaks running across the screen (the whole ground did,
     up close). This puts a slope at each lattice point instead of a value, and the quintic
     fade keeps the slope continuous across the lattice lines. .x is the value, about 0.5 in
     the middle as _vn is, and .yz its gradient, worked out rather than differenced - a bump
     from this is one evaluation where differencing costs three, and the ground is the whole
     screen. */
  'vec3 _gnd(vec2 p){ vec2 i = floor(p), f = fract(p);' +
  '  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0), du = 30.0 * f * f * (f * (f - 2.0) + 1.0);' +
  '  vec2 ga = vec2(_h2(i), _h2(i + 37.0)) * 2.0 - 1.0;' +
  '  vec2 gb = vec2(_h2(i + vec2(1.0, 0.0)), _h2(i + vec2(38.0, 37.0))) * 2.0 - 1.0;' +
  '  vec2 gc = vec2(_h2(i + vec2(0.0, 1.0)), _h2(i + vec2(37.0, 38.0))) * 2.0 - 1.0;' +
  '  vec2 gd = vec2(_h2(i + 1.0), _h2(i + 38.0)) * 2.0 - 1.0;' +
  '  float a = dot(ga, f), b = dot(gb, f - vec2(1.0, 0.0));' +
  '  float c = dot(gc, f - vec2(0.0, 1.0)), d = dot(gd, f - 1.0), k = a - b - c + d;' +
  '  vec2 g = ga + u.x * (gb - ga) + u.y * (gc - ga) + u.x * u.y * (ga - gb - gc + gd) + du * (u.yx * k + vec2(b, c) - a);' +
  '  return vec3(a + u.x * (b - a) + u.y * (c - a) + u.x * u.y * k + 0.5, g); }';
