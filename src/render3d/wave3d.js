/* render3d/wave3d.js - the sea's swell, in one place. Part of rts.render3d.

   Three travelling sine waves, summed: two long ones that give the sheet its roll, and a short
   fast one that does almost nothing to the height and most of the work on the NORMAL - which is
   what the specular reads, and the specular is what makes water look wet rather than blue.

   IT LIVED IN TWO SHADERS, WRITTEN OUT TWICE. The mesh program displaced the surface and the
   sun's depth pass displaced it again - the same nine constants typed out in both files,
   because anything that moves in the main pass has to move in the shadow pass too or its
   shadow stands still while it swims. That is the same drift this renderer consolidated the
   light for (see light3d.js): two copies of a number are one edit away from disagreeing.

   So the waves are a TABLE, and both programs build their GLSL from it. Which also means a
   spec can read the real numbers instead of re-deriving them from a copy - and one of them
   now has to, because the draw order depends on how steep this sum can get:

   THE SLOPE IS A CONTRACT WITH THE CAMERA. scene3d.js lays the sea's depth down with the
   comparison turned off, so the surface must never occlude ITSELF - with no comparison the
   triangles land in mesh order rather than back to front. A heightfield hides nothing from a
   camera looking down at a steeper angle than its own steepest slope, so the requirement is

       R3D_WAVE_SLOPE  <  cos(R3D_TILT) / sin(R3D_TILT)

   which at the shipped numbers is 0.615 against 0.867 - a factor of 1.4 in hand. Raise the
   amplitude or the lean far enough and that stops being true; e2e/sea is what says so. */

/* How far the sea heaves, in world units - the amplitude the table below is scaled by. Small
   on purpose: most of what makes water read as water is the specular sliding over a moving
   NORMAL, and the normal comes from the slope, so the short fast wave does most of the work at
   a fifth of the amplitude. Push this much past a third of a unit and a harbour starts to look
   like open ocean - and see the slope contract above for the hard ceiling. */
var R3D_WAVE_AMP = 0.42;

/* Each row is one wave: [kx, kz, speed, weight]. kx/kz are radians per world unit, so a row's
   wavelength is 2*pi/hypot(kx,kz) - 15.5, 13.9 and 3.8 world units, the shortest just under a
   cell, which is what R3D_WATER_SUB has to stay finer than. The weight scales both its height
   and its slope. */
var R3D_WAVE = [
  [0.34, 0.22, 1.15, 1.00],
  [0.19, -0.41, 0.85, 0.70],
  [1.35, 0.95, 2.40, 0.45]
];

/* The sum's peak height, in units of the amplitude - what a crest reaches and a trough drops.
   1 + 0.7 + 0.45 = 2.15, so the shipped 0.42 amplitude swings +-0.90 world units. */
var R3D_WAVE_PEAK = R3D_WAVE.reduce(function (s, w) { return s + w[3]; }, 0);

/* And the steepest the surface can get: every wave's gradient at full tilt and all pointing
   the same way at once. A bound rather than a measurement - the three waves travel in
   different directions and never actually line up - which is the right side to err on for
   something the draw order depends on. See the contract above. */
var R3D_WAVE_SLOPE = R3D_WAVE_AMP * R3D_WAVE.reduce(function (s, w) {
  return s + w[3] * Math.hypot(w[0], w[1]);
}, 0);

/* The phase lines, shared by both emitters below: q<i> is one wave's argument at wp. */
function _r3dWaveQ() {
  var s = '';
  for (var i = 0; i < R3D_WAVE.length; i++) {
    var w = R3D_WAVE[i];
    s += '    float q' + i + ' = wp.x * ' + w[0].toFixed(4) + ' + wp.z * ' + w[1].toFixed(4) +
         ' + uWave.y * ' + w[2].toFixed(4) + ';';
  }
  return s;
}

/* The sum, in units of the amplitude: sin(q0) + 0.7*sin(q1) + ... */
function _r3dWaveSum() {
  var s = '';
  for (var i = 0; i < R3D_WAVE.length; i++) {
    s += (i ? ' + ' + R3D_WAVE[i][3].toFixed(4) + ' * ' : '') + 'sin(q' + i + ')';
  }
  return s;
}

/* HEIGHT ONLY - what the sun's pass needs, because a depth map records where a thing is and
   not which way it faces. `uWave.x` is 0 for everything that is not water, and the branch is
   on a UNIFORM, so it is the same decision for every vertex in a draw. */
var R3D_WAVE_VGLSL =
  '  if (uWave.x > 0.0) {' +
  _r3dWaveQ() +
  '    wp.y += uWave.x * (' + _r3dWaveSum() + ');' +
  '  }';

/* HEIGHT, SLOPE AND TONE - the main pass. The normal is the analytic slope of the sum rather
   than a baked attribute, so it is exact at every vertex and costs three cosines.

   AND THE SWELL IS CARRIED BY THE COLOUR, not by the light - which is not a stylistic choice,
   it is what the ramp leaves room for. An up-facing surface takes very nearly the most lambert
   this light can give: v works out at 0.96 for a flat sheet against a ceiling of 1.0, so the
   whole bright half of the wave's swing is clipped off and the dark half compresses into a 22%
   band. Measured, the entire sea came out in 79 tones and read as a slab. There is no headroom
   up there for water to use.

   So the height itself moves the tone - dark in the troughs, bright and whitening on the
   crests, which is what the 2D wave tiles have always drawn and what the reference art does.
   The moving normal above is still worth having: it is what breaks the bands up and glints as
   the swell travels. */
var R3D_WAVE_VGLSL_LIT = (function () {
  /* a wave travelling the other way has a negative gradient, so the terms are joined by their
     own sign rather than by a `+` that would emit `+ -0.287 * cos(q1)` */
  function term(v, i, first) {
    return (first ? (v < 0 ? '-' : '') : (v < 0 ? ' - ' : ' + ')) +
           Math.abs(v).toFixed(6) + ' * cos(q' + i + ')';
  }
  var dx = '', dz = '';
  for (var i = 0; i < R3D_WAVE.length; i++) {
    var w = R3D_WAVE[i], k = w[3];
    dx += term(k * w[0], i, !i);
    dz += term(k * w[1], i, !i);
  }
  return '  if (uWave.x > 0.0) {' +
    _r3dWaveQ() +
    '    float hs = ' + _r3dWaveSum() + ';' +
    '    wp.y += uWave.x * hs;' +
    '    float dx = uWave.x * (' + dx + ');' +
    '    float dz = uWave.x * (' + dz + ');' +
    '    n = normalize(vec3(-dx, 1.0, -dz));' +
    '    float hh = hs / ' + R3D_WAVE_PEAK.toFixed(4) + ';' +
    '    col *= 0.70 + 0.52 * (hh * 0.5 + 0.5);' +
    '    col += vec3(0.10, 0.13, 0.15) * smoothstep(0.45, 1.0, hh);' +
    '  }';
})();
