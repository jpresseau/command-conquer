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
  R3D_NOISE_GLSL + R3D_WEATHER_GLSL + R3D_PANEL_GLSL + R3D_SHELF_GLSL + R3D_STONE_GLSL + R3D_PLIGHT_GLSL +
  R3D_SHADOW_GLSL + R3D_MESH_LIGHT +
  /* NORMALISED HERE, NOT IN THE VERTEX SHADER. A varying is interpolated linearly, and the
     linear blend of two unit vectors is shorter than one - which is exactly the case on the
     curves this is for, and would read as a dark seam down the middle of every one. */
  'uniform float uGAO;' +               /* the contact shade: set for placed things only */
  'uniform vec4 uSil;' +                /* a unit seen through what hides it - sil3d.js */
  'uniform vec4 uHaze;' +               /* rgb, amount: sky3d.js */
  'uniform float uSnow;' +              /* the SNOW sky: on every roof, and the shore frozen */
  'uniform float uBld; uniform float uNightK;' +   /* a building, and how far into the night: lit windows */
  'void main(){' +
  '  if (uSil.a > 0.0) { gl_FragColor = uSil; return; }' +
  /* vCol.w: 0 whole, 1 rising, 2 a burnt-out husk (husk3d.js), 3 + damage scorched (hurt3d.js) */
  '  vec3 tint = _tint(vCol.w, vec3(vWxz.x, vHY.y, vWxz.y), vCol.rgb);' +
  /* rock is stone: its relief tilts the normal before it is lit - stone3d.js */
  '  vec3 sp3 = vec3(vWxz.x, vHY.y, vWxz.y); float sk = uStone.x > 0.0 ? _stoneK(vCol.rgb) : 0.0;' +
  '  vec3 nn = sk > 0.0 ? _stoneN(normalize(vN), sp3, sk) : normalize(vN);' +
  '  vec3 c = _shade(nn, vCol.rgb) * tint; float a = uA;' +
  /* SEATED ON THE GROUND: the lowest hand-span of a unit or a building is in the shade of itself
     and of the earth round it - only for what is placed (uGAO, scene3d.js), not the world batch */
  '  if (uGAO > 0.0) {' +
  '    c *= mix(0.70, 1.0, smoothstep(0.0, 0.8, vHY.x));' +
  /* STEEL. The dark, unsaturated parts of a model - tracks, road wheels, barrels, guns, hatches -
     are the palette's `dark`, which the ramp takes to near black: on a tank they read as holes
     in it. Steel is not dark; it reflects. Such a surface takes the sky or the ground in the
     direction it faces the eye, and a broader, brighter sun highlight than paint - so a track is
     grey-blue steel catching the light, not a void. Placed models only, and by the hour. */
  '    float lu = dot(vCol.rgb, vec3(0.30, 0.59, 0.11));' +
  '    float sa = max(max(vCol.r, vCol.g), vCol.b) - min(min(vCol.r, vCol.g), vCol.b);' +
  '    float met = (1.0 - smoothstep(0.26, 0.42, lu)) * (1.0 - smoothstep(0.05, 0.14, sa)) * uLightK.z;' +
  '    if (met > 0.0 && dot(uView, uView) > 0.5) {' +
  '      vec3 nn = normalize(vN), rv = reflect(-uView, nn);' +
  '      vec3 env = mix(vec3(0.20, 0.17, 0.13), vec3(0.50, 0.58, 0.68), clamp(rv.y * 0.5 + 0.5, 0.0, 1.0));' +
  '      float ms = pow(max(dot(nn, uHalf), 0.0), 24.0) * _shadowAt();' +
  '      c += met * (env * 0.30 + vec3(1.0, 0.97, 0.9) * ms * 0.6) * (vec3(1.0) - uDarkL) * tint;' +
  '    }' +
  '  }' +
  '  if (uWeather > 0.0) c = _weather(c, normalize(vN), vec3(vWxz.x, vHY.y, vWxz.y));' +
  /* a building is built of panels, not glass: panel3d.js */
  '  if (uBld > 0.0 && distance(vCol.rgb, vec3(0.561, 0.737, 0.831)) > 0.07) c = _panels(c, normalize(vN));' +
  /* ...and rock of stone: stone3d.js */
  '  if (sk > 0.0) c = _stone(c, nn, sp3, sk);' +
  /* snow settles on whatever faces up - roofs, hulls, canopies - and not on the sea */
  '  if (uSnow > 0.0 && uSea.x < 0.5) {' +
  '    float up = smoothstep(0.55, 0.85, normalize(vN).y) * uSnow;' +
  '    c = mix(c, _shade(normalize(vN), vec3(0.88, 0.9, 0.95)) * tint, up * 0.82);' +
  '  }' +
  '  if (uSea.x > 0.5) {' +
  '    vec2 cc = vWxz * uSea.w + uSea.z + _gwarp(vWxz);' +
  '    vec2 ms = texture2D(uSeaM, (cc + 0.5) * uSea.y).rg; float wm = ms.r;' +
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
  '    vec3 day = vec3(1.0) - uDarkL;' +            /* the hour dims the glint, the foam and the surf */
  /* shallow over the shelf, deep out past it, and the caustics on the sand - shelf3d.js */
  '    float sh = _shelfK(ms.g);' +
  '    c = _shelf(c, vWxz, sh, t, day);' +
  '    float gl = max(dot(np, uHalf), 0.0);' +
  '    gl = pow(gl, 48.0) * _shadowAt();' +
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
  /* in the cold the shallows freeze: ice from the shore most of a cell out - by the distance out
     (shelf3d.js), with a ragged edge - opaque, and not quite one white */
  '    if (uSnow > 0.0) {' +
  '      float ice = (1.0 - smoothstep(0.25, 0.95, _shoreD(ms.g) + (_vn(vWxz * 0.7) - 0.5) * 0.4)) * uSnow;' +
  '      c = mix(c, vec3(0.80, 0.87, 0.92) * day * (0.94 + 0.08 * _vn(vWxz * 1.7)), ice * 0.9); a = mix(a, uA, ice);' +
  '    }' +
  '  }' +
  /* what is burning near it lights it - render3d/fxlight3d.js */
  '  c += _plight(vCol.rgb * tint, normalize(vN), vec3(vWxz.x, vHY.y, vWxz.y));' +
  /* LIT WINDOWS. At night a base was a field of dark boxes with lamps over the doors: the glass of
     every building - the palette's glass, as _tint finds it - read as dull blue-grey with nobody
     home. By the hour's night (1 at night, half at dusk, a little in rain and fog) a building's
     glass shows a warm room behind it. Brightness drifts across a building with a slow noise
     rather than switching window by window: a window is a face this program cannot tell from its
     neighbour, and a cell of its own cut windows in half. Never a vehicle's (uBld), a building
     rising or burnt out, or glass a fire has blown out (hurt3d.js). */
  '  if (uBld > 0.0 && uNightK > 0.0) {' +
  '    float gw = 1.0 - smoothstep(0.03, 0.07, distance(vCol.rgb, vec3(0.561, 0.737, 0.831)));' +
  '    float ws = vCol.w - floor(vCol.w * 0.1 + 0.001) * 10.0;' +
  '    float whole = max(step(ws, 0.5), step(2.5, ws) * step(ws - 3.0, ' + R3D_GLASS_OUT.toFixed(2) + '));' +
  '    if (gw * whole > 0.0) {' +
  '      vec3 wp = vec3(vWxz.x, vHY.y, vWxz.y);' +
  '      float rm = _vn(wp.xz * 0.45 + vec2(wp.y * 0.37, wp.y * 0.21));' +
  '      vec3 warm = mix(vec3(1.0, 0.78, 0.50), vec3(1.0, 0.90, 0.74), _vn(wp.zx * 0.31 + 4.0));' +
  '      c = mix(c, warm * mix(0.55, 1.05, rm), gw * whole * uNightK * uLightK.y * 0.92);' +
  '    }' +
  '  }' +
  /* the haze the weather and the hour lay over everything - sky3d.js */
  '  c = mix(c, uHaze.rgb, uHaze.a);' +
  '  gl_FragColor = vec4(c, a); }';
