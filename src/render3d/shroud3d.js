/* render3d/shroud3d.js - the fog of war, as fog. Part of rts.render3d.

   The shroud is one texel a cell (_r3dFog, ground3d.js), and drawn straight it is a grid: the
   linear filter softens each cell into a diamond and the edge of what you can see runs in
   steps along the map's own lines. And what moved out of sight vanished on the frame it went,
   and appeared on the frame it came back - in 3D it did not even vanish: a unit nobody could
   see was drawn anyway, under the dimmed shroud, shadow and all. Now:

     DRIFTING EDGES  the shroud is read through a slow noise that wanders a cell either way, so
                     its edge billows and drifts rather than stepping along the grid, and the
                     dimmed half-light of ground you have seen and cannot see now carries a
                     mottle of mist moving through it (R3D_SHROUD_GLSL, in the ground texture
                     program while it draws the fog; uFog is on, clock, 1/RTS_N)
     OUT OF SIGHT    a unit the player cannot see (_rtsEntSeen, the same test the 2D draw list,
                     the radar and picking use) is not drawn, nor its shadow
     FADING          and it dissolves out over R3D_FADE_T as it leaves sight, and in as it comes
                     back: drawn with a screen-door of discarded pixels, the fade riding in the
                     instance's dim value as tens (_tint, weather3d.js)

   R3.shroudOff draws the old shroud; R3.fadeOff pops units in and out as before (but still
   hides what cannot be seen). */

var R3D_SHROUD_WARP = 0.9;       /* cells the shroud's edge wanders either way */
var R3D_FADE_T = 0.45;           /* seconds a unit takes to dissolve in or out */

var R3D_SHROUD_GLSL =
  'uniform vec3 uFog;' +
  'vec4 _shroud(sampler2D s, vec2 uv, vec2 w){' +
  '  float t = uFog.y;' +
  '  vec2 q = w * 0.11 + vec2(t * 0.045, t * 0.02);' +
  '  vec2 d = vec2(_vn(q) - 0.5, _vn(q + vec2(17.3, 5.1)) - 0.5) * (2.0 * ' + R3D_SHROUD_WARP.toFixed(2) + ' * uFog.z);' +
  '  vec4 c = texture2D(s, uv + d);' +
  /* mist: only where the shroud is neither clear nor solid - its edges and the half-light */
  '  float n = _vn(w * 0.35 + vec2(-t * 0.08, t * 0.05)) * 0.6 + _vn(w * 0.9 - vec2(t * 0.11, 0.0)) * 0.4;' +
  '  c.a = clamp(c.a + (n - 0.5) * 0.9 * c.a * (1.0 - c.a), 0.0, 1.0);' +
  '  c.rgb += vec3(0.02, 0.025, 0.035) * n;' +
  '  return c; }';

/* How much of a unit is drawn this frame, 0 gone to 1 whole: easing toward whether the player
   can see it, R3D_FADE_T for the whole way. A unit met for the first time is simply what it is,
   so nothing fades in at the start of a match. */
function _r3dSeenFade(R3, e, mo, t) {
  var want = typeof _rtsEntSeen !== 'function' || _rtsEntSeen(e) ? 1 : 0;
  if (R3.fadeOff || mo.seen === undefined) { mo.seen = want; mo.ft = t; return want; }
  var dt = t - mo.ft;
  mo.ft = t;
  if (dt > 0 && dt < 1) mo.seen += Math.max(-dt / R3D_FADE_T, Math.min(dt / R3D_FADE_T, want - mo.seen));
  else if (dt !== 0) mo.seen = want;
  return mo.seen;
}
/* The dim value with the fade on it: tens of how much is gone, 1 to 9, over the tint it had. */
function _r3dFadeDim(dim, fade) {
  if (fade >= 1) return dim;
  return (dim || 0) + 10 * Math.max(1, Math.min(9, Math.round((1 - fade) * 9)));
}
