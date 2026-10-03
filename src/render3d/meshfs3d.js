/* render3d/meshfs3d.js - the mesh program's fragment stage: shadow per pixel, the sea and its
   surf, fire light and haze. Split from render3d/gl3d.js, which keeps the vertex stage beside
   the projection contract it must agree with, and builds this into the mesh program in
   _r3dInit. It concatenates R3D_NOISE_GLSL and R3D_SHADOW_GLSL at load, so it is included
   after noise3d.js and shadow3d.js. */
/* uA exists for the contact shadows and for nothing else. They are flat discs drawn through
   this same program, and drawn OPAQUE they were not shadows at all - they were holes cut in
   the ground, which under infantry (whose disc came out wider than the figure) read as a unit
   standing in a puddle of void. A shadow has to darken what is under it rather than replace
   it, and that needs blending, which needs an alpha the fragment shader can write. Every
   other draw sets it to 1 and is unchanged. */
/* THE FRAGMENT STAGE FINALLY DOES SOMETHING. It was `gl_FragColor = vec4(vC, uA)` - every
   light calculation in the game happened per VERTEX and the fragment shader interpolated a
   colour and stopped. A shadow map cannot work that way: shadow is a property of the PIXEL,
   not of the corner of a triangle, and a per-vertex test on a 4-unit slab would put the edge
   of a tree's shadow at the nearest corner of whatever it lands on.

   So the vertex stage hands over the same surface twice - lit and in shade - and this picks
   between them per pixel. highp, because the comparison is against a depth packed into eight
   bits and change, and mediump has neither the range nor the precision to hold it. */
var R3D_MESH_FS =
  'precision highp float; varying vec3 vN; varying vec4 vCol; varying vec2 vWxz;' +
  'uniform float uA;' +
  /* THE SEA'S SHORELINE, per pixel. uSea is (on, 1/N, N/2 - 0.5, 1/tile) and uSeaM the water
     mask - one texel per cell, LINEAR, so it is the bilinear "how much water" the ground's own
     borders are built from. Read at the same warped position the ground uses (_gwarp in
     noise3d.js), the coast is the mask's half-way line: round where the cells were a staircase,
     and in step with the sand under it. Toward the line the water thins to let the shallows'
     sand through and a foam line runs along it; past it, the pixel is land and is not drawn. */
  'uniform vec4 uSea; uniform sampler2D uSeaM;' +
  'uniform vec2 uWave;' +               /* the swell's own clock, shared with the vertex stage */
  'uniform float uRip;' +               /* the chop's strength: R3.rippleAmt, 1 unless a spec says */
  'uniform float uSurf;' +              /* the surf rolling in: R3.surfAmt, 1 unless a spec says */
  R3D_NOISE_GLSL + R3D_WEATHER_GLSL + R3D_PLIGHT_GLSL +
  R3D_SHADOW_GLSL + R3D_MESH_LIGHT +
  /* NORMALISED HERE, NOT IN THE VERTEX SHADER. A varying is interpolated linearly, and the
     linear blend of two unit vectors is shorter than one - which is exactly the case on the
     curves this is for, and would read as a dark seam down the middle of every one. */
  'uniform vec4 uSil;' +                /* a unit seen through what hides it - sil3d.js */
  'uniform vec4 uHaze;' +               /* rgb, amount: sky3d.js */
  'uniform float uSnow;' +              /* the SNOW sky: on every roof, and the shore frozen */
  'void main(){' +
  '  if (uSil.a > 0.0) { gl_FragColor = uSil; return; }' +
  /* vCol.w: 0 whole, 1 rising, 2 a burnt-out husk (husk3d.js), 3 + damage scorched (hurt3d.js) */
  '  vec3 tint = _tint(vCol.w, vec3(vWxz.x, vHY.y, vWxz.y), vCol.rgb);' +
  '  vec3 c = _shade(normalize(vN), vCol.rgb) * tint; float a = uA;' +
  '  if (uWeather > 0.0) c = _weather(c, normalize(vN), vec3(vWxz.x, vHY.y, vWxz.y));' +
  /* snow settles on whatever faces up - roofs, hulls, canopies - and not on the sea */
  '  if (uSnow > 0.0 && uSea.x < 0.5) {' +
  '    float up = smoothstep(0.55, 0.85, normalize(vN).y) * uSnow;' +
  '    c = mix(c, _shade(normalize(vN), vec3(0.88, 0.9, 0.95)) * tint, up * 0.82);' +
  '  }' +
  '  if (uSea.x > 0.5) {' +
  '    vec2 cc = vWxz * uSea.w + uSea.z + _gwarp(vWxz);' +
  '    float wm = texture2D(uSeaM, (cc + 0.5) * uSea.y).r;' +
  '    if (wm < 0.46) discard;' +
  /* RIPPLES AND GLINTS. The swell (wave3d.js) is geometry - metres long, and smooth. What makes
     water read as water up close is the fine chop on top of it: two layers of noise drifting
     across each other, differenced into a normal, and the sun caught in it as a tight, bright
     highlight - so the sea sparkles where it faces the sun and stays deep blue where it does
     not. Per pixel and only on water, so it costs nothing anywhere else. */
  '    float t = uWave.y;' +
  '    vec2 p1 = vWxz * 0.9 + vec2(t * 0.35, t * 0.21), p2 = vWxz * vec2(1.6, 1.9) - vec2(t * 0.27, -t * 0.33);' +
  '    float r0 = _vn(p1) + _vn(p2) * 0.6;' +
  '    float rx = _vn(p1 + vec2(0.07, 0.0)) + _vn(p2 + vec2(0.07, 0.0)) * 0.6 - r0;' +
  '    float rz = _vn(p1 + vec2(0.0, 0.07)) + _vn(p2 + vec2(0.0, 0.07)) * 0.6 - r0;' +
  '    vec3 np = normalize(normalize(vN) + vec3(-rx, 0.0, -rz) * 5.0 * uRip);' +
  '    c = _shade(np, vCol.rgb) * tint;' +
  '    float gl = max(dot(np, uHalf), 0.0);' +
  '    gl = pow(gl, 48.0) * _shadowAt();' +
  '    vec3 day = vec3(1.0) - uDarkL;' +            /* the hour dims the glint, the foam and the surf */
  '    c += vec3(1.0, 0.96, 0.86) * day * gl * 1.1;' +
  '    float edge = 1.0 - smoothstep(0.46, 0.66, wm);' +
  '    float fo = edge * edge * smoothstep(0.3, 0.7, _vn(vWxz * 1.6 + vec2(t * 0.2, 0.0)));' +
  '    c = mix(c, vec3(0.16, 0.50, 0.50) * day + c * 0.35, edge * 0.45);' +   /* turquoise shallows */
  '    c = mix(c, vec3(0.92, 0.95, 0.93) * day, clamp(fo * 1.4, 0.0, 0.85));' +               /* foam */
  /* THE SURF. Lines of foam roll in to every shore, a few seconds apart: sd is how far out
     the water is by the same mask the coast is cut from - 0 at the waterline, 1 about a cell
     out - so each line follows the coast's own shape, and it breaks as it arrives. */
  '    float sd = clamp((wm - 0.46) / 0.5, 0.0, 1.0);' +
  '    float wv = fract(sd * 1.6 + t * 0.22 + _vn(vWxz * 0.35) * 0.8);' +
  '    float brk = smoothstep(0.3, 0.65, _vn(vWxz * 0.9));' +   /* broken where it breaks, as over a bar */
  '    float roll = smoothstep(0.0, 0.05, wv) * (1.0 - smoothstep(0.05, 0.4, wv)) * (1.0 - sd) * (0.35 + 0.65 * brk);' +
  '    c = mix(c, vec3(0.93, 0.96, 0.95) * day, clamp(roll * 0.75 * uSurf, 0.0, 0.75));' +
  '    a = uA * mix(0.45, 1.0, smoothstep(0.46, 0.74, wm));' +
  /* in the cold the shallows freeze: ice, from the shore a cell out, opaque */
  '    if (uSnow > 0.0) { float ice = (1.0 - smoothstep(0.5, 0.82, wm)) * uSnow; c = mix(c, vec3(0.80, 0.87, 0.92) * day, ice * 0.9); a = mix(a, uA, ice); }' +
  '  }' +
  /* what is burning near it lights it - render3d/fxlight3d.js */
  '  c += _plight(vCol.rgb * tint, normalize(vN), vec3(vWxz.x, vHY.y, vWxz.y));' +
  /* the haze the weather and the hour lay over everything - sky3d.js */
  '  c = mix(c, uHaze.rgb, uHaze.a);' +
  '  gl_FragColor = vec4(c, a); }';
