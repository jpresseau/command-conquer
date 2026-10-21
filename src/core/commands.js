/* core/commands.js - the player's orders that were writes straight from the interface. Part of
   rts.core.

   A REPLAY (core/replay.js) records every call the interface makes into the simulation, and plays
   them back on the same ticks. A field the interface sets by hand is not a call, so it was not on
   the record: the queued stops (u.wq), the bomber's held aim (u.bombNext), a harvester sent to a
   refinery, the building waiting for its place (S.ready) and a line's repeat (S.rep) were each a
   way for a replay to go its own way. They are named calls here, and test/unit/replay holds the
   interface to it: none of src/ui writes a unit's or a side's orders directly. */

/* the stops a unit had queued, gone - a new order given without Shift (core/orders.js _rtsWayNext) */
function _rtsWayClear(u) { if (u) u.wq = null; }
/* one more stop after the ones it has, attack-moving there or not */
function _rtsWayAdd(u, x, z, am) { if (u) (u.wq = u.wq || []).push({ x: x, z: z, am: !!am }); }
/* the target a bomber was keeping for when it is loaded, given up for a new order (core/bomber.js) */
function _rtsBombClear(u) { if (u) u.bombNext = null; }
/* a demolition charge carried to an enemy building (the Commando's: ui/select.js) */
function _rtsOrderDemo(u, b) { if (u) { u.order = 'demo'; u.target = b; u.path = null; u.goal = null; u.susp = null; } }
/* a harvester right-clicked onto its own refinery: back to unload, whatever it was doing */
function _rtsOrderToRefinery(u) { if (u) { u.order = 'harvest'; u.hstate = 'toRef'; u.path = null; } }
/* the finished building put down, or given up: nothing waits for a place */
function _rtsReadyClear(side) { var S = window._rtsG.sides[side]; S.ready = null; S.readyPaid = null; }
/* a unit line's repeat (ui/repeat.js), on or off */
function _rtsRepeatSet(side, cat, on) {
  var S = window._rtsG.sides[side];
  S.rep = S.rep || {};
  if (on) S.rep[cat] = true; else delete S.rep[cat];
}
