/* render3d/veil3d.js - a Veil Tank the enemy has not found (core/rift.js) is drawn as one of the
   map's own trees, standing where the tank stands: the same tree the forest draws (forest3d.js
   _r3dTree), one mesh for every Veil Tank, built the first time one is hidden. R3.veilOff draws
   nothing in its place, for a spec's A/B. */
function _r3dVeilTree(R3) {
  if (R3.mesh.veilTree !== undefined) return R3.mesh.veilTree;
  var m = [];
  _r3dTree(m, 0, 0, 17, 23, 0);
  var mesh = m.length ? _r3dBuildMesh(R3.gl, m) : null;
  if (mesh) mesh.weather = 0.5;
  return (R3.mesh.veilTree = mesh);
}
function _r3dVeilDraw(C, e, R3, drawIn) {
  if (R3.veilOff) return;
  if (typeof _rtsSeen === 'function' && !_rtsSeen(_rtsTX(e.x), _rtsTX(e.z))) return;   /* not even a tree under the shroud */
  drawIn(C, _r3dVeilTree(R3), e.x, _rtsElev(e.x, e.z), e.z, 0, 1, 0, 1);
}
