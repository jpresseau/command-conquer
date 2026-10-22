/* render3d/blast3d.js - explosives on the page (core/blast.js).

   A CHARGE ON SOMETHING blinks: a red light on top of it, quicker as the fuse runs down - twice a
   second when it is set, ten times in its last second - so a player who sees one on a tank of
   theirs knows how long they have. Drawn into the emission batch with the fire (fxemit3d.js), on
   whatever it is on and wherever the player can see. R3.chargeOff draws none, for a spec's A/B.

   A FROGMAN IN THE WATER swims: he is drawn R3D_SWIM_SINK lower, to the chest in it, and the water
   sheet hides the rest (unit3d.js). */
var R3D_CHARGE = { col: [1.6, 0.18, 0.12], size: 0.9, slow: 2, fast: 10 };
var R3D_SWIM_SINK = 0.8;           /* measured: half of him under, the rest above (e2e/blast) */

function _r3dFxCharges(G, V) {
  var R3 = window._R3D;
  if (!G.bombsLive || (R3 && R3.chargeOff)) return;
  var vis = typeof _rtsVisible === 'function';
  for (var i = 0; i < G.ents.length; i++) {
    var o = G.ents[i], b = o.bomb;
    if (!b || o.dead || (vis && !_rtsVisible(_rtsTX(o.x), _rtsTX(o.z)))) continue;
    var left = Math.max(0, b.t) / (b.fuse || 1), hz = R3D_CHARGE.fast + (R3D_CHARGE.slow - R3D_CHARGE.fast) * left;
    if (((V.t || 0) * hz) % 1 > 0.5) continue;                          /* the light's off half of each blink */
    var h = o.type === 'struct' ? 6 : (rtsUnitDef(o.def) || {}).kind === 'infantry' ? 3.4 : 5;
    _r3dFxBill(V.M, V, o.x, V.ground(o.x, o.z) + h, o.z, R3D_CHARGE.size, R3D_CHARGE.size, 0.6, R3D_FXT_FLASH, 0, 0, 1, 0, R3D_CHARGE.col);
  }
}
/* How far down a unit is drawn for swimming: a Frogman over water. */
function _r3dSwimSink(G, e, d) { return d.swims && _r3dWetAt(G, e.x, e.z) ? R3D_SWIM_SINK : 0; }
