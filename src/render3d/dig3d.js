/* render3d/dig3d.js - a squad dug in (core/dig.js): a ring of sandbags round it, two courses high
   and staggered, with a gap at the back to climb out by, and the men crouched behind it (unit3d.js
   draws them prone). One mesh for every dug-in squad, built the first time one is seen. */
var R3D_DIG = { n: 14, r: 10, gap: 2, bag: ['#8a7a55', '#a8966a'] };
function _r3dDigRing(R3) {
  if (R3.mesh.digRing !== undefined) return R3.mesh.digRing;
  var m = [], D = R3D_DIG;
  for (var row = 0; row < 2; row++) for (var i = 0; i < D.n; i++) {
    var k = (i + D.n / 2) % D.n;
    if (k < D.gap) continue;                                   /* the way out, behind */
    var a = (i + row * 0.5) / D.n * Math.PI * 2;
    _r3Box(m, Math.cos(a) * D.r, row * 1.9, Math.sin(a) * D.r, 3.8, 2.0, 3.8, D.bag[0], D.bag[1]);
  }
  var mesh = m.length ? _r3dBuildMesh(R3.gl, m) : null;
  if (mesh) mesh.weather = 0.5;
  return (R3.mesh.digRing = mesh);
}
