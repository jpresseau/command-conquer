/* render3d/weather3d.js - wear on everything that was built: stains, streaks and grime. Part of
   rts.render3d.

   Every building and vehicle is painted in flat colour, one tone to a face, which the eye reads
   as a model on a table rather than as a thing that has stood out in the weather. So the mesh
   program ages the surface per pixel, in world space: a mottle of stains over every face; on the
   walls, rain streaks running down and a band of grime rising from the foot, where mud splashes
   and water stands; on the roofs, the pale rings standing water dries into. Nothing moves the
   geometry and nothing is textured - it is all noise at the pixel's own position, so it holds
   at the closest zoom and fades out, like the ground's fine detail, where it would only shimmer.

   HOW MUCH is uWeather, per draw: 1 for a building, less for a unit, and 0 for everything else
   this program draws - trees, rock, crystals, the sea - which has not been built and does not
   weather like paint. The noise is render3d/noise3d.js's, so it is the ground's noise too. */

/* device pixels per world unit below which the wear fades out, as R3D_MAT_DETAIL_PX does */
var R3D_WEATHER_PX = 14;

var R3D_WEATHER_GLSL =
  'uniform float uWeather; varying vec2 vHY;' +           /* height above the foot, world y */
  'vec3 _weather(vec3 c, vec3 n, vec3 wp){' +
  '  vec3 an = abs(n);' +
  /* BLENDED BY SLOPE, not switched: a wall is read along itself and up, a roof in x and z, and
     a curved roof - a hangar's arch, a dome - passes from one to the other smoothly. Switched
     at a threshold, the pattern broke along a line across every curve. */
  '  float wy = smoothstep(0.45, 0.8, an.y);' +
  '  vec2 tw = an.x > an.z ? wp.zy : wp.xy;' +
  '  float gw = _vn(tw * 1.3) * 0.55 + _vn(tw * 4.1 + 7.0) * 0.45;' +
  '  float gr = _vn(wp.xz * 1.3 + 5.0) * 0.55 + _vn(wp.xz * 4.1 + 2.0) * 0.45;' +
  '  float k = 1.0 + (mix(gw, gr, wy) - 0.5) * 0.28;' +
  /* on the walls: streaks - noise pulled out vertically, so it runs down the way water does -
     and grime rising from the foot */
  '  float st = _vn(vec2(tw.x * 4.0, tw.y * 0.3 + 3.0));' +
  '  float grime = (1.0 - smoothstep(0.0, 1.5, vHY.x)) * (1.0 - wy);' +
  '  k *= 1.0 - (st * 0.18 + grime * 0.24) * (1.0 - wy);' +
  /* grime is mud, not shadow: browner as well as darker */
  '  vec3 w = c * k;' +
  '  w = mix(w, w * vec3(0.86, 0.76, 0.64), grime * 0.5);' +
  '  return mix(c, w, uWeather); }';
