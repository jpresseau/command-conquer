/* render3d/fxglsl3d.js - how an explosion, a flame, a spark and a splash are SHADED. Part of
   rts.render3d; fxemit3d.js decides where the quads go and fx3d.js draws them.

   Every effect was a Red Alert sprite: a few frames of pixel art, stretched onto a quad. From the
   3D camera they read as what they were - flat paper cut-outs with hard pixel edges, the same
   three frames at every size, lit by nothing and lighting nothing. This draws them instead: each
   quad is a small shader program, and what it draws depends only on its age, a seed and a type.

   ONE PROGRAM, TWELVE TYPES, ONE DRAW. The type rides in a vertex attribute, so a whole battle's
   effects - fireballs, smoke, sparks, rings, spray, flames, rounds in flight - go down in one
   call with no state change between them. The ground light is the exception (see fx3d.js): it
   has to MULTIPLY what is under it, and blending is fixed per draw.

   PREMULTIPLIED, so one blend covers both halves of fire. rgb is added and alpha is what the
   effect hides of the scene behind it: smoke is all alpha, a spark is all rgb, and a fireball is
   an opaque body with an added glow. Out of that, uEmit picks only the light an effect GIVES
   OFF, for the bloom's emitter pass: a flame is there, its smoke is not.

   THE SUN IS THE SCENE'S. uSunV is the scene's own sun expressed in the quad's frame - across,
   up the screen, toward the eye - so a smoke puff is lit on the same side as every building
   around it, and a billow's shaded side goes the same blue-grey as their shadows. */

var R3D_FX2_VS =
  'attribute vec3 aP; attribute vec4 aQ; attribute vec4 aA; attribute vec3 aB;' +
  'uniform vec4 uCam; uniform vec2 uTilt; uniform float uInvD;' + R3D_CAM_GLSL +
  'varying vec2 vQ; varying vec4 vA; varying vec3 vB; varying float vY;' +
  'void main(){' +
  '  vQ = aQ.xy; vA = aA; vB = aB; vY = aQ.w;' +
  '  float sx = camUV(aP).x * uCam.z;' +
  '  float sy = (camUV(aP).y * uTilt.x - aP.y * uTilt.y) * uCam.w;' +
  /* the same projection as every other program here, with each quad's own lift toward the eye
     in aQ.z: a tall fireball needs more of it than a ring lying on the ground */
  '  float d  = (camUV(aP).y * uTilt.y + aP.y * uTilt.x) + aQ.z;' +
  '  float pw = 1.0 - d * uInvD;' +
  '  gl_Position = vec4(sx, -sy, -d / ' + R3D_DEPTH_RANGE.toFixed(1) + ' * pw, pw);' +
  '}';

var R3D_FX2_FS =
  'precision highp float;' +
  'varying vec2 vQ; varying vec4 vA; varying vec3 vB; varying float vY;' +
  'uniform vec3 uSunV; uniform float uEmit; uniform vec3 uDarkL;' +   /* the hour: sky3d.js */
  R3D_NOISE_GLSL +
  /* black body, roughly: embers, red, orange, yellow, white */
  'vec3 _fireRamp(float h){ h = clamp(h, 0.0, 1.0);' +
  '  vec3 c = mix(vec3(0.16, 0.05, 0.03), vec3(0.78, 0.16, 0.03), smoothstep(0.0, 0.28, h));' +
  '  c = mix(c, vec3(1.0, 0.48, 0.08), smoothstep(0.22, 0.52, h));' +
  '  c = mix(c, vec3(1.0, 0.80, 0.32), smoothstep(0.48, 0.78, h));' +
  '  return mix(c, vec3(1.0, 0.97, 0.86), smoothstep(0.76, 1.0, h)); }' +
  'void main(){' +
  '  vec2 q = vQ; float k = vA.x, s = vA.y, op = vA.z, heat = vA.w;' +
  '  vec4 o = vec4(0.0); vec3 em = vec3(0.0);' +
  /* 1. BLOB: a lumpy sphere of fire turning to smoke - the unit a fireball, a dust cloud and a
        smoke column are all built from. Its edge is eaten by two octaves of noise that roll as
        it ages, the noise tilts its normal so the billows catch the sun, and `heat` decides how
        much of it glows. */
  '  if (vY < 1.5) {' +
  '    float r2 = dot(q, q); if (r2 >= 1.0) discard;' +
  '    vec2 np = q * 1.6 + vec2(s * 37.0, s * 91.0);' +
  '    float n1 = _vn(np + vec2(k * 0.7, -k * 1.9));' +
  '    float n2 = _vn(np * 2.6 + vec2(5.0 - k * 1.3, k * 0.4));' +
  '    float n = n1 * 0.65 + n2 * 0.35;' +
  '    float cov = 1.0 - smoothstep(0.30, 0.92, r2 + (n - 0.5) * 0.9);' +
  '    float z = sqrt(1.0 - r2);' +
  '    vec3 nr = normalize(vec3(q + (vec2(n1, n2) - 0.5) * 0.8, z + 0.2));' +
  '    float lam = clamp(dot(nr, uSunV), 0.0, 1.0);' +
  '    vec3 smk = vB * (0.42 + 0.78 * lam);' +
  '    float h = heat * (0.3 + 0.7 * z * z) * (0.55 + 0.8 * n);' +
  '    vec3 fire = _fireRamp(h);' +
  '    float g = smoothstep(0.12, 0.5, h);' +
  '    float a = cov * op;' +
  '    o = vec4(mix(smk, fire, g) * a, a); em = fire * g * a;' +
  /* 2. FLASH: the instant of detonation, a hot core in a wide orange glow, added not blended */
  '  } else if (vY < 2.5) {' +
  '    float r2 = dot(q, q); if (r2 >= 1.0) discard;' +
  '    float l = exp(-r2 * 4.0) * (1.0 - r2) * op;' +
  '    vec3 c = mix(vec3(1.0, 0.46, 0.12), vec3(1.0, 0.86, 0.55), exp(-r2 * 10.0)) * l * 0.85;' +
  '    o = vec4(c, 0.0); em = c;' +
  /* 3. SPARKS: ten streaks thrown up and out, falling as they go - drawn as distance to a
        segment from each spark's tail to its head, so a spark is a streak at every size */
  '  } else if (vY < 3.5) {' +
  '    float acc = 0.0;' +
  '    for (int i = 0; i < 10; i++) {' +
  '      float fi = float(i);' +
  '      float h1 = _h2(vec2(s * 71.0, fi * 3.7)), h2 = _h2(vec2(fi * 5.3, s * 43.0)), h3 = _h2(vec2(s + fi * 1.9, 7.0));' +
  '      float kk = k * (0.7 + 0.5 * h3); if (kk >= 1.0) continue;' +
  '      float an = mix(0.12, 0.88, h1) * 3.14159, v = 0.55 + 0.6 * h2;' +
  '      vec2 dir = vec2(cos(an), sin(an));' +
  '      vec2 p = dir * v * kk - vec2(0.0, 0.55 * kk * kk);' +
  '      vec2 vel = dir * v - vec2(0.0, 1.1 * kk);' +
  '      vec2 tl = p - normalize(vel) * (0.10 + 0.06 * h3) * (1.0 - kk * 0.6);' +
  '      vec2 pa = q - tl, ba = p - tl;' +
  '      float hh = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-5), 0.0, 1.0);' +
  '      acc += smoothstep(0.03, 0.006, length(pa - ba * hh)) * (0.45 + 0.75 * hh) * (1.0 - kk * kk);' +
  '    }' +
  '    vec3 c = vB * acc * op; o = vec4(c, 0.0); em = c;' +
  /* 4. RING: the shock front, a broken band of dust (or foam) racing out across the ground */
  '  } else if (vY < 4.5) {' +
  '    float r = length(q), R = (1.0 - (1.0 - k) * (1.0 - k)) * 0.92;' +
  '    float n = _vn(q * 6.0 + s * 19.0) * 0.6 + _vn(q * 15.0 + s * 7.0) * 0.4;' +
  '    float a = smoothstep(0.04 + 0.1 * k, 0.0, abs(r - R)) * smoothstep(0.2, 0.75, n) * 1.2;' +
  '    a += smoothstep(R, R * 0.4, r) * 0.15 * n;' +
  '    a = clamp(a * (1.0 - k) * op, 0.0, 1.0);' +
  '    o = vec4(vB * a, a);' +
  /* 5. LIGHT: the glare an explosion throws on the ground round it. Drawn in its own batch
        with the destination as the multiplier, so it brightens what is there - grass goes a
        lit green, not an orange smear */
  '  } else if (vY < 5.5) {' +
  '    float r2 = dot(q, q); float l = max(0.0, 1.0 - r2); l = l * l * op;' +
  '    o = vec4(vB * l, 0.0);' +
  /* 6. SPRAY: a plume of water thrown up and falling back, white where it is thick */
  '  } else if (vY < 6.5) {' +
  '    float y = (q.y + 1.0) * 0.5;' +
  '    float top = sin(min(k * 1.6, 1.0) * 1.5708) * (1.0 - 0.45 * smoothstep(0.5, 1.0, k));' +
  /* a crown rather than a jet: it opens upward and outward, frays at every edge, and is soft
     where it leaves the water */
  '    float wid = 0.18 + 0.55 * y + 0.3 * k;' +
  '    float n = _vn(vec2(q.x * 6.0, y * 5.0 - k * 3.0) + s * 23.0);' +
  '    float n2 = _vn(vec2(q.x * 13.0, y * 11.0 - k * 6.0) + s * 7.0);' +
  '    float body = smoothstep(wid, wid * 0.3, abs(q.x) + (n - 0.5) * 0.35) *' +
  '                 smoothstep(top, top - 0.3, y - (n2 - 0.5) * 0.2) * smoothstep(0.0, 0.15, y);' +
  '    float a = body * (0.35 + 0.65 * n2) * (1.0 - smoothstep(0.55, 1.0, k)) * op;' +
  '    o = vec4(mix(vec3(0.62, 0.76, 0.82), vec3(1.0), 0.4 + 0.6 * n2) * a, a);' +
  /* 7. FLAME: a tongue of fire standing on its base, its noise scrolling upward - k is TIME
        here rather than age, because a fire burns for as long as it burns */
  '  } else if (vY < 7.5) {' +
  '    float y = (q.y + 1.0) * 0.5;' +
  '    vec2 np = vec2(q.x * 2.1, y * 2.3 - k * 2.7) + vec2(s * 11.0, s * 5.0);' +
  '    float n = _vn(np * 1.5) * 0.55 + _vn(np * 3.3 + 2.0) * 0.3 + _vn(np * 7.1 + 9.0) * 0.15;' +
  /* a teardrop narrowing upward, eaten by noise that grows with height - a steady base under
     tips that break off into tongues */
  '    float w = 0.78 * (1.0 - y * 0.72);' +
  '    float sh = 1.0 - length(vec2(q.x / w, (y - 0.32) * 1.35));' +
  '    float f = sh + (n - 0.5) * (0.35 + y * 0.9);' +
  '    float a = smoothstep(0.0, 0.22, f) * smoothstep(0.0, 0.06, y) * op;' +
  '    vec3 c = _fireRamp(f * 1.45 * heat);' +
  '    o = vec4(c * a, a * 0.92); em = c * a;' +
  /* 8. STREAK: a round in flight - a hot core line, brightest at its head (q.x = 1) and dying
        away toward its tail, added not blended */
  '  } else if (vY < 8.5) {' +
  '    float along = q.x * 0.5 + 0.5;' +
  '    float l = exp(-q.y * q.y * 14.0) * mix(0.12, 1.0, along * along) * op;' +
  '    vec3 c = vB * l * 1.3; o = vec4(c, 0.0); em = c;' +
  /* 9. TRAIL: a rocket's smoke, thin at the rocket and spreading behind it, fading as it goes.
        k is how far the rocket has flown and heat how long the trail is, so the noise is laid
        down in the WORLD: the trail does not crawl along with the rocket, the rocket leaves it */
  '  } else if (vY < 9.5) {' +
  '    float along = q.x * 0.5 + 0.5;' +
  '    float u = k - heat * (1.0 - along);' +
  '    float n = _vn(vec2(u * 0.9, q.y * 1.6) + s * 13.0) * 0.65 + _vn(vec2(u * 2.3, q.y * 3.1) + s * 5.0) * 0.35;' +
  '    float wid = mix(1.0, 0.35, along);' +
  '    float body = smoothstep(wid, wid * 0.25, abs(q.y) + (n - 0.5) * 0.45);' +
  '    float a = body * smoothstep(0.0, 0.6, along) * (0.45 + 0.55 * n) * op;' +
  '    o = vec4(vB * a, a);' +
  /* 10. RAIN: a falling drop's streak, pale and thin, blended - it gives off no light, so it is
         not in the bloom's emitters (skyfx3d.js) */
  '  } else if (vY < 10.5) {' +
  '    float along = q.x * 0.5 + 0.5;' +
  '    float a = exp(-q.y * q.y * 9.0) * smoothstep(0.0, 0.5, along) * op;' +
  '    o = vec4(vB * a, a * 0.6);' +
  /* 12. FLAKE: a snowflake, a soft round dot, blended and giving off nothing */
  '  } else if (vY > 11.5) {' +
  '    float r2 = dot(q, q); if (r2 >= 1.0) discard;' +
  '    float a = (1.0 - r2) * (1.0 - r2) * op;' +
  '    o = vec4(vB * a, a);' +
  /* 11. GLOW: a lamp seen at night - a soft round light in its own colour, added, and given off */
  '  } else {' +
  '    float r2 = dot(q, q); if (r2 >= 1.0) discard;' +
  '    float l = (exp(-r2 * 9.0) * 0.8 + (1.0 - r2) * 0.2) * op;' +
  '    vec3 c = vB * l; o = vec4(c, 0.0); em = c;' +
  '  }' +
  '  if (uEmit > 0.5) { if (em.r + em.g + em.b < 0.004) discard; gl_FragColor = vec4(em, 0.0); return; }' +
  '  if (o.a < 0.003 && o.r + o.g + o.b < 0.003) discard;' +
  /* the hour darkens what an effect REFLECTS - smoke, dust, rain - and not the light it gives */
  '  gl_FragColor = vec4(em + max(o.rgb - em, vec3(0.0)) * (vec3(1.0) - uDarkL), o.a);' +
  '}';
