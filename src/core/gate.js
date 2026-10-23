/* core/gate.js - THE GATE (`gate` on rules/roster11.js): a wall section that opens for its own
   side and no one else.

   A gate's cell is blocked like any building's (G.blocked 1, G.owner its id). What makes it a gate
   is one question in core/grid.js _rtsBlocked, asked only while a unit of its own side is the one
   moving: core/tick.js names the side whose unit it is updating in _rtsGateSide, and so do the
   path request (core/move.js _rtsPathFor) and the push apart (_rtsSeparate). Everything else -
   placing a building, the opponent's planner, an enemy's path - finds it shut. So a base walled in
   with a gate in the wall is open to its own army and closed to the other.

   It stands open while one of its own is within RTS_GATE.near of it (`open`, which is only the
   picture's: render reads it, the simulation does not). */
var RTS_GATE = { near: RTS_TILE * 1.6, every: 0.25 };
var _rtsGateSide = null;

/* Is cell i a gate the unit moving now may pass? */
function _rtsGateLets(i) {
  var G = window._rtsG, o = G.byId[G.owner[i]];
  return !!(o && !o.dead && o.side === _rtsGateSide && (rtsStructDef(o.def) || {}).gate);
}
/* ...and a path or a move as `side` would make it */
function _rtsAsSide(side, fn) {
  var was = _rtsGateSide;
  _rtsGateSide = side;
  try { return fn(); } finally { _rtsGateSide = was; }
}
function _rtsGateTick(dt) {
  var G = window._rtsG;
  G.gateAcc = (G.gateAcc || 0) + dt;
  if (G.gateAcc < RTS_GATE.every) return;
  G.gateAcc = 0;
  for (var i = 0; i < G.ents.length; i++) {
    var g = G.ents[i];
    if (g.type !== 'struct' || g.dead || !(rtsStructDef(g.def) || {}).gate) continue;
    var open = 0;
    for (var j = 0; j < G.ents.length && !open; j++) {
      var u = G.ents[j];
      if (u.type === 'unit' && !u.dead && !u.air && !u.inside && u.side === g.side && Math.hypot(u.x - g.x, u.z - g.z) < RTS_GATE.near) open = 1;
    }
    g.open = open;
  }
}
