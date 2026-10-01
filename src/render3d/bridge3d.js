/* render3d/bridge3d.js - the bridges, in 3D. Part of rts.render3d; where they are and the deck's
   height are core/bridge.js, so a unit on a deck (scene3d.js, _rtsStandY) and the deck it is
   drawn on read one function.

   A concrete deck on the road's own line, arched over the water so a gunboat passes under the
   long spans; a parapet each side, lamp posts along it, piers down into the water every second
   cell and an abutment where it meets each shore. Built in the bridge's own frame - x along
   the span, z across it - and turned onto the map, so one builder serves all four directions.

   Drawn with the world batch in both passes, as part of the countryside's list
   (_r3dSceneryBatches) but NOT behind its knob: R3.sceneryAmt 0 leaves the bridges standing,
   because a tank on a deck that is not drawn is a tank on the water. */

var R3D_BRIDGE = {
  deck: '#55534f', deckTop: '#5d5b56', kerb: '#a8a497', wall: '#9a958a', pier: '#7f7a70',
  line: '#d6d0b6', lamp: '#3a3a3a', bulb: '#f2e2b0'
};
var R3D_BRIDGE_THICK = 0.45;     /* the deck slab, world units */

/* A sloped bar from xa to xb in the bridge's frame: its underside at ya..yb, `h` deep, between
   z0 and z1 across. Faces wound outward like _r3Box's. */
function _r3dBridgeBar(L, xa, xb, ya, yb, h, z0, z1, col, top) {
  _r3F(L, [[xa, ya + h, z0], [xa, ya + h, z1], [xb, yb + h, z1], [xb, yb + h, z0]], top || col);
  _r3F(L, [[xa, ya, z1], [xb, yb, z1], [xb, yb + h, z1], [xa, ya + h, z1]], col);
  _r3F(L, [[xb, yb, z0], [xa, ya, z0], [xa, ya + h, z0], [xb, yb + h, z0]], col);
  _r3F(L, [[xa, ya, z0], [xb, yb, z0], [xb, yb, z1], [xa, ya, z1]], col);
}

function _r3dBridge(out, br) {
  var C = R3D_BRIDGE, T = RTS_TILE, L = [], len = br.len * T, hw = br.w * T / 2 - 0.15;
  var n = br.len * 3, th = R3D_BRIDGE_THICK, k;
  function y(x) { return _rtsBridgeDeckY(br, Math.max(0, Math.min(1, x / len))); }
  for (k = 0; k < n; k++) {
    var xa = len * k / n, xb = len * (k + 1) / n, ya = y(xa), yb = y(xb);
    _r3dBridgeBar(L, xa, xb, ya - th, yb - th, th, -hw, hw, C.deck, C.deckTop);
    /* kerbs and parapets, each side */
    _r3dBridgeBar(L, xa, xb, ya, yb, 0.12, -hw, -hw + 0.5, C.kerb);
    _r3dBridgeBar(L, xa, xb, ya, yb, 0.12, hw - 0.5, hw, C.kerb);
    _r3dBridgeBar(L, xa, xb, ya + 0.12, yb + 0.12, 0.5, -hw, -hw + 0.22, C.wall, C.kerb);
    _r3dBridgeBar(L, xa, xb, ya + 0.12, yb + 0.12, 0.5, hw - 0.22, hw, C.wall, C.kerb);
    /* two lanes: a dashed line down the middle */
    if (br.w > 1 && (k % 3) === 1) _r3dBridgeBar(L, xa, xb, ya + 0.005, yb + 0.005, 0.02, -0.09, 0.09, C.line);
  }
  /* piers: a column every second cell, from the bed up to the deck's underside, with a cutwater
     upstream and down */
  for (k = 2; k < br.len; k += 2) {
    var px = k * T, top = y(px) - th, pd = Math.min(hw * 1.5, br.w * T * 0.7);
    _r3Box(L, px, -1.4, 0, 1.0, top + 1.4, pd, C.pier, C.pier);
    _r3Cyl(L, px, -1.4, pd / 2, 0.5, top + 1.4, C.pier, C.pier, 16);
    _r3Cyl(L, px, -1.4, -pd / 2, 0.5, top + 1.4, C.pier, C.pier, 16);
  }
  /* abutments: where the deck meets each shore */
  [0, len].forEach(function (ax) {
    var g = y(ax);
    _r3Box(L, ax + (ax ? 0.5 : -0.5), g - 1.2, 0, 1.6, 1.25, br.w * T + 0.6, C.pier, C.kerb);
  });
  /* lamp posts on the parapets, every third cell, alternating sides */
  for (k = 1; k < br.len; k += 3) {
    var lx = k * T + T / 2, lz = ((k / 3) & 1) ? hw - 0.11 : -hw + 0.11, ly = y(lx) + 0.62;
    _r3Cyl(L, lx, ly, lz, 0.07, 2.4, C.lamp, C.lamp, 16);
    _r3Box(L, lx, ly + 2.3, lz * 0.88, 0.32, 0.14, 0.7, C.lamp, C.lamp);
    _r3Box(L, lx, ly + 2.2, lz * 0.82, 0.22, 0.1, 0.34, C.bulb, C.bulb);
  }
  /* into the world: the frame's origin is the near abutment, centred across the deck */
  var ang = Math.atan2(br.dz, br.dx);
  var ox = _rtsWX(br.tx) - br.dx * T / 2 + br.px * (br.w - 1) * T / 2;
  var oz = _rtsWX(br.tz) - br.dz * T / 2 + br.pz * (br.w - 1) * T / 2;
  _r3dPut(out, L, ang, ox, 0, oz);
}

/* Every bridge on the map, a mesh each with its bounds, rebuilt when the game changes. */
function _r3dBridgeTick(G) {
  var R3 = window._R3D;
  if (!R3 || !R3.gl || R3.bridgeFor === G) return;
  var gl = R3.gl;
  if (R3.bridges) R3.bridges.forEach(function (m) { gl.deleteBuffer(m.p); gl.deleteBuffer(m.n); gl.deleteBuffer(m.c); });
  R3.bridges = []; R3.bridgeFor = G; R3.bridgeTris = 0;
  _r3SegBulk(function () {
    (G.bridges || []).forEach(function (br) {
      var faces = [];
      _r3dBridge(faces, br);
      var m = _r3dBuildMesh(gl, faces), T = RTS_TILE;
      var ex = br.tx + br.dx * (br.len - 1) + br.px * (br.w - 1), ez = br.tz + br.dz * (br.len - 1) + br.pz * (br.w - 1);
      m.x0 = Math.min(_rtsWX(br.tx), _rtsWX(ex)) - T * 1.5; m.x1 = Math.max(_rtsWX(br.tx), _rtsWX(ex)) + T * 1.5;
      m.z0 = Math.min(_rtsWX(br.tz), _rtsWX(ez)) - T * 1.5; m.z1 = Math.max(_rtsWX(br.tz), _rtsWX(ez)) + T * 1.5;
      R3.bridges.push(m); R3.bridgeTris += m.verts / 3;
    });
  });
}
