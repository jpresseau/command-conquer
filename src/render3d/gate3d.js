/* render3d/gate3d.js - a Gate opening (core/gate.js). Part of rts.render3d.

   The gate's barrier is not in its building model (sprites/roster11.js draws the posts, the caps
   and the sill): it is its own small mesh, drawn over the building as the radar's antenna is
   (render3d/alive3d.js), so it can move. While one of the gate's own side is beside it (`open`,
   which core/gate.js keeps) it sinks into the ground, R3D_GATE.drop model units, and it rises
   again when they have passed - eased over R3D_GATE.ease seconds of game time, so a frozen game
   holds it where it is. The only state is the renderer's own: how far each gate's barrier has
   gone (R3.gateLift), keyed to the game. Cosmetic: the simulation never reads it. */
var R3D_GATE = { drop: 7.2, ease: 0.45 };

/* the barrier, in model units about the gate's centre: a steel slab with three dark ribs */
function _r3dGateBarModel(side) {
  var m = [], S = RTS_PAL.steel, DK = RTS_PAL.dark, D = RTS_TS;
  _r3Box(m, 0, 0.6, 0, 4.0, 6.4, D - 10, S[1], S[2]);
  for (var i = 0; i < 3; i++) _r3Box(m, 0, 1.6 + i * 2.0, 0, 4.4, 0.5, D - 10, DK[1], DK[2]);
  _r3Box(m, 0, 7.0, 0, 4.6, 0.4, D - 10, RTS_PAL.team[side][1], RTS_PAL.team[side][3]);   /* the top rail, the house's colour */
  return m;
}
function _r3dGateBar(R3, side) {
  var k = 'gatebar:' + side;
  if (R3.mesh[k] === undefined) {
    var f = null;
    try { f = _r3DetailHigh(function () { return _r3dGateBarModel(side); }); } catch (e) { f = null; }
    R3.mesh[k] = (f && f.length) ? _r3dBuildMesh(R3.gl, f) : null;
  }
  return R3.mesh[k];
}
/* how far down each barrier is, 0 shut to 1 open, eased toward where its gate says */
function _r3dGateLift(G, R3, g) {
  if (R3.gateG !== G) { R3.gateG = G; R3.gateLift = {}; }
  var t = G.t || 0, L = R3.gateLift[g.id] || (R3.gateLift[g.id] = { v: g.open ? 1 : 0, t: t });
  var k = Math.min(1, Math.max(0, t - L.t) / R3D_GATE.ease);
  L.v += ((g.open ? 1 : 0) - L.v) * k; L.t = t;
  return L.v;
}
/* each standing gate's barrier, to `draw(mesh, x, y, z, rot, dim, sy)` (alive3d.js) */
function _r3dGateDraw(G, R3, draw) {
  var A2W = RTS_TILE / RTS_TS;
  for (var i = 0; i < G.ents.length; i++) {
    var g = G.ents[i];
    if (g.dead || g.type !== 'struct' || g.building || !(rtsStructDef(g.def) || {}).gate) continue;
    var lift = _r3dGateLift(G, R3, g), ease = lift * lift * (3 - 2 * lift);
    draw(_r3dGateBar(R3, g.side), g.x, _rtsElev(g.x, g.z) - ease * R3D_GATE.drop * A2W, g.z, 0, 0, 1);
  }
}
