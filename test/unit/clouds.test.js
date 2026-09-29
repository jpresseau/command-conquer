/* The clouds' inputs - render3d/cloud3d.js.

   The clouds are a term in the sun's own shadow, laid out across the sun's view. What keeps them
   on the ground rather than on the camera is the offset handed back for the view's centre, and
   what makes them drift is the game clock - both are numbers this file computes, and both are
   checked here against a stand-in for the GL. e2e/clouds checks the picture they make. */

var { Suite } = require('../lib/assert.js');
var { load, read } = require('../lib/sandbox.js');

var S = new Suite('clouds');
var g = load(['src/rules', 'src/core', 'src/r3d', 'src/render3d/inst3d.js', 'src/render3d/noise3d.js',
              'src/render3d/wave3d.js', 'src/render3d/place3d.js', 'src/render3d/light3d.js',
              'src/render3d/cloud3d.js', 'src/render3d/shadow3d.js']);
var SUN = g.R3D_SUN;

/* a GL that remembers what it was handed */
function fakeGL(has) {
  return {
    calls: [],
    getUniformLocation: function (P, n) { return has && n === 'uCloud' ? { n: n } : null; },
    uniform4f: function (u, a, b, c, d) { this.calls.push([a, b, c, d]); }
  };
}
function set(R3, t) {
  var gl = fakeGL(true);
  g.window._rtsG = { t: t };
  g._r3dCloudSet(gl, R3, {});
  return gl.calls[0];
}
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function near(a, b) { return Math.abs(a - b) < 1e-6; }

/* ---- the switch and the depth ---- */
var u = set({ sunC: [0, 7, 0] }, 0);
S.ok('a full cloud takes R3D_CLOUD_DEPTH of the sun, unless told otherwise',
     near(u[2], g.R3D_CLOUD_DEPTH) && g.R3D_CLOUD_DEPTH > 0.3 && g.R3D_CLOUD_DEPTH < 1,
     'depth ' + u[2] + ', R3D_CLOUD_DEPTH ' + g.R3D_CLOUD_DEPTH);
S.ok('R3.cloudAmt 0 takes the clouds out', set({ sunC: [0, 7, 0], cloudAmt: 0 }, 0)[2] === 0,
     'depth ' + set({ sunC: [0, 7, 0], cloudAmt: 0 }, 0)[2]);
S.ok('...and 0.5 halves them', near(set({ sunC: [0, 7, 0], cloudAmt: 0.5 }, 0)[2], g.R3D_CLOUD_DEPTH / 2),
     'depth ' + set({ sunC: [0, 7, 0], cloudAmt: 0.5 }, 0)[2]);

/* ---- pinned to the world ----
   The shader reads the pattern at vL.xy * span + uCloud.xy, and vL is the sun's view CENTRED ON
   THE VIEW (shadow3d.js, _shadowFrom). Worked through here for one point of the ground seen from
   two views a long way apart: the offset has to cancel the centre exactly, or a pan drags the
   clouds along. */
function patternAt(p, c, span) {
  var o = set({ sunC: c }, 0), d = [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
  var lx = dot(d, SUN.r) / span, ly = dot(d, SUN.u) / span;
  return [lx * span + o[0], ly * span + o[1]];
}
var P = [37.5, 0.4, -121.25];
var a = patternAt(P, [0, 7, -24.9], 128.8), b = patternAt(P, [96, 7, 60], 61.3);
S.ok('a point on the ground reads the same place in the pattern from two views far apart',
     near(a[0], b[0]) && near(a[1], b[1]),
     'from one view (' + a[0].toFixed(4) + ', ' + a[1].toFixed(4) + '), from the other (' + b[0].toFixed(4) + ', ' + b[1].toFixed(4) + ')');
S.ok('...which is its own place in the sun\'s frame, whatever the view',
     near(a[0], dot(P, SUN.r)) && near(a[1], dot(P, SUN.u)),
     'the sun\'s frame puts it at (' + dot(P, SUN.r).toFixed(4) + ', ' + dot(P, SUN.u).toFixed(4) + ')');
var z = set({}, 0);
S.ok('with no sun view yet, the offset is nothing rather than nonsense', z[0] === 0 && z[1] === 0,
     'offset (' + z[0] + ', ' + z[1] + ')');

/* ---- the drift ---- */
var d0 = set({ sunC: [0, 7, 0] }, 0)[3], d1 = set({ sunC: [0, 7, 0] }, 100)[3], d2 = set({ sunC: [0, 7, 0] }, 200)[3];
S.ok('the clouds drift on the game clock, steadily', d0 === 0 && d1 > 0 && near(d2, 2 * d1),
     'drift ' + d0 + ' at 0s, ' + d1.toFixed(4) + ' at 100s, ' + d2.toFixed(4) + ' at 200s');
var wu = d1 / g.R3D_CLOUD_SCALE / 100;
S.ok('...at a walking pace for a cloud: under two world units a second', wu > 0.2 && wu < 2,
     wu.toFixed(2) + ' world units a second');
g.window._rtsG = null;
var gl0 = fakeGL(true);
g._r3dCloudSet(gl0, { sunC: [0, 7, 0] }, {});
S.ok('...and stand still before there is a game clock', gl0.calls.length === 1 && gl0.calls[0][3] === 0,
     'drift ' + (gl0.calls[0] || [])[3]);

/* ---- a program without the clouds ---- */
var gl1 = fakeGL(false);
g._r3dCloudSet(gl1, { sunC: [0, 7, 0] }, {});
S.ok('a program that does not read the shadow is left alone', gl1.calls.length === 0, gl1.calls.length + ' calls');

/* ---- the shadow carries them on every way out ---- */
var src = g.R3D_SHADOW_GLSL, body = src.slice(src.indexOf('float _shadowAt()'));
body = body.slice(0, body.indexOf('}', body.lastIndexOf('return s')) + 1);
var rets = body.match(/return [^;]*;/g) || [];
S.ok('the sun\'s shadow reads the clouds', src.indexOf(g.R3D_CLOUD_GLSL) >= 0 && /float cl = _cloudAt\(\);/.test(body),
     'R3D_CLOUD_GLSL inside R3D_SHADOW_GLSL: ' + (src.indexOf(g.R3D_CLOUD_GLSL) >= 0));
S.ok('...and every way out of _shadowAt carries them, the shadow map on or off',
     rets.length >= 3 && rets.every(function (r) { return /\bcl\b/.test(r); }),
     rets.join(' | '));
S.ok('_r3dShadowBind hands the clouds to every program it binds the sun to',
     /_r3dCloudSet\(gl, R3, P\);/.test(read('src/render3d/shadow3d.js').replace(/\/\*[\s\S]*?\*\//g, '')),
     'shadow3d.js');

require('../lib/report.js')(S);
