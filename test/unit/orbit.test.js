/* The turned camera's arithmetic - render3d/cam3d.js, and the effects that face it
   (render3d/fxemit3d.js).

   Every effect is a quad the CPU builds to face the camera, and every blended one is sorted by
   how near the eye it is. While the camera faced north "across" was world x and "near" was
   world z; turned, both are the camera's own axes. Checked here against the camera's own
   transform, at several yaws and leans: a billboard lies flat to the screen (its corners are
   exactly hw across and hh up, and none of them is nearer the eye than another), a streak's
   width is across its run on the screen, and the sort key is the camera's depth. e2e/orbit
   checks the pictures and the seam with the shaders. */

var { Suite } = require('../lib/assert.js');
var { load } = require('../lib/sandbox.js');

var S = new Suite('orbit');
var g = load(['src/rules', 'src/core', 'src/r3d', 'src/sprites/bake.js', 'src/render3d/light3d.js',
              'src/render3d/cam3d.js', 'src/render3d/fxemit3d.js', 'src/render3d/wave3d.js', 'src/render3d/sil3d.js']);
g.R3D_TILT = 0.855;                       /* gl3d.js's, which this sandbox does not load */
var R3 = g.window._R3D = { yaw: 0, tilt: 0.855 };
g._r3dCamSet(0, 0.855);

/* the quads are float32, so their corners carry ~1e-7 of rounding */
/* a world point in the camera's frame, about a focus at the origin: across, up the screen, and
   toward the eye */
function camOf(x, y, z) {
  var c = g._r3dToCam(x, z);
  return { u: c.u, up: -(c.v * R3.cp - y * R3.sp), d: c.v * R3.sp + y * R3.cp };
}

S.ok('at yaw 0 the specular is exactly the sprite baker\'s', R3.half.every(function (v, i) { return Math.abs(v - g.R3D_HALF[i]) < 1e-12; }),
     JSON.stringify(R3.half));
var views = [[0, 0.855], [0.7, 0.855], [2.4, 0.6], [-1.9, 0.98], [3.0, 0.45]];
views.forEach(function (vw) {
  g._r3dCamSet(vw[0], vw[1]);
  var tag = 'yaw ' + vw[0] + ', tilt ' + vw[1] + ': ';
  /* the frame round-trips */
  var c = g._r3dToCam(13, -7), b = g._r3dFromCam(c.u, c.v);
  S.ok(tag + 'into the camera\'s frame and back', Math.abs(b.x - 13) < 1e-9 && Math.abs(b.z + 7) < 1e-9, JSON.stringify(b));
  /* a billboard */
  var V = { sp: R3.sp, cp: R3.cp, cy: R3.cy, sy: R3.sy, M: g._r3dFxBatch() }, B = V.M;
  var x = 30, y = 4, z = -18, hw = 2.5, hh = 1.5;
  g._r3dFxBill(B, V, x, y, z, hw, hh, 0, 1, 0, 0, 1, 0, [1, 1, 1]);
  var F = g.R3D_FX_STRIDE, o = camOf(x, y, z), worst = 0, depth = 0;
  for (var v = 0; v < 6; v++) {
    var a = B.a, k = v * F, p = camOf(a[k], a[k + 1], a[k + 2]), qx = a[k + 3], qy = a[k + 4];
    worst = Math.max(worst, Math.abs(p.u - o.u - qx * hw), Math.abs(p.up - o.up - qy * hh));
    depth = Math.max(depth, Math.abs(p.d - o.d));
  }
  S.ok(tag + 'a billboard is hw across and hh up the screen', worst < 1e-5, worst.toExponential(2));
  S.ok(tag + '...and lies flat to it', depth < 1e-5, depth.toExponential(2));
  S.ok(tag + 'its sort key is the camera\'s depth', Math.abs(B.key[0] - o.d) < 1e-5 && Math.abs(g._r3dDepthKey(x, y, z) - o.d) < 1e-9,
       B.key[0] + ' against ' + o.d);
  /* a streak, across its own run on the screen */
  var S2 = g._r3dFxBatch(), p0 = [0, 1, 0], p1 = [12, 5, 9], w = 0.8;
  g._r3dFxStreak(S2, V, p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], w, 0, 1, 0, 0, 1, 0, [1, 1, 1]);
  var A0 = camOf.apply(null, p0), A1 = camOf.apply(null, p1), run = [A1.u - A0.u, A1.up - A0.up], rl = Math.hypot(run[0], run[1]);
  var bad = 0;
  for (v = 0; v < 6; v++) {
    k = v * F;
    var q = camOf(S2.a[k], S2.a[k + 1], S2.a[k + 2]), end = S2.a[k + 3] < 0 ? A0 : A1;
    var off = [q.u - end.u, q.up - end.up];
    /* the offset is half the width, square to the run */
    bad = Math.max(bad, Math.abs(Math.hypot(off[0], off[1]) - w / 2), Math.abs((off[0] * run[0] + off[1] * run[1]) / rl));
  }
  S.ok(tag + 'a streak is w wide, square to its run on the screen', bad < 1e-5, bad.toExponential(2));
});

/* the highlight turns with the viewer: the half-vector is the light plus a view that has swung
   round with the yaw, at the baker's elevation */
g._r3dCamSet(1.2, 0.855);
var hv = g.R3_VIEW, L = g.R3_LIGHT, eh = [L[0] - Math.sin(1.2) * hv[2], L[1] + hv[1], L[2] + Math.cos(1.2) * hv[2]], em = Math.hypot(eh[0], eh[1], eh[2]);
S.ok('turned, the specular\'s half-vector turns with the viewer', R3.half.every(function (v, i) { return Math.abs(v - eh[i] / em) < 1e-12; }) &&
     Math.abs(R3.half[0] - g.R3D_HALF[0]) > 0.05, JSON.stringify(R3.half));
/* the side nearest the eye is the one a view's box grows on - +z facing north, -x a quarter
   turn round (the eye then stands to the west) */
var box0 = { x0: 0, x1: 10, z0: 0, z1: 10 };
g._r3dCamSet(0, 0.855);
var n0 = g._r3dBoundsNear(box0, 5, 0);
g._r3dCamSet(Math.PI / 2, 0.855);
var n1 = g._r3dBoundsNear(box0, 5, 0);
S.ok('a view\'s box grows toward the eye: +z facing north, -x turned a quarter', n0.z1 === 15 && n0.z0 === 0 && n0.x0 === 0 &&
     Math.abs(n1.x0 + 5) < 1e-9 && Math.abs(n1.z1 - 10) < 1e-9, JSON.stringify([n0, n1]));
/* and so is the ground a silhouette looks for cover on */
var N = g.RTS_N, cG = { terrain: new Uint8Array(N * N), blocked: new Uint8Array(N * N) }, mid = N / 2;
var unitAt = { x: g._rtsWX(mid), z: g._rtsWX(mid) };
g.window._rtsG = cG;
function coverWith(dx, dz, yaw) {
  cG.blocked.fill(0); cG.blocked[g._rtsIdx(mid + dx, mid + dz)] = 1;
  g._r3dCamSet(yaw, 0.855);
  return g._r3dSilCover(cG, unitAt);
}
S.ok('facing north, a building a cell south of a unit - toward the eye - can hide it, one north cannot',
     coverWith(0, 2, 0) === true && coverWith(0, -2, 0) === false, 'south ' + coverWith(0, 2, 0) + ', north ' + coverWith(0, -2, 0));
S.ok('turned a quarter, it is the one to the west', coverWith(-2, 0, Math.PI / 2) === true && coverWith(2, 0, Math.PI / 2) === false &&
     coverWith(0, 2, Math.PI / 2) === false, 'west ' + coverWith(-2, 0, Math.PI / 2) + ', east ' + coverWith(2, 0, Math.PI / 2));

g._r3dCamSet(7, 5);
S.ok('the yaw wraps into (-PI, PI] and the lean is held to its range',
     Math.abs(R3.yaw - (7 - 2 * Math.PI)) < 1e-12 && R3.tilt === g.R3D_TILT_MAX, R3.yaw + ', ' + R3.tilt);
g._r3dCamSet(null, -1);
S.eq('...at the bottom too', R3.tilt, g.R3D_TILT_MIN);
S.ok('...and the lean\'s ceiling is inside the sea\'s: its waves stay shallower than the line of sight',
     g.R3D_WAVE_SLOPE > 0 && g.R3D_TILT_MAX < Math.atan(1 / g.R3D_WAVE_SLOPE), g.R3D_TILT_MAX + ' against ' + Math.atan(1 / g.R3D_WAVE_SLOPE).toFixed(3));

require('../lib/report.js')(S);
