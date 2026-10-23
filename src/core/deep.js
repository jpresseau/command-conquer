/* core/deep.js - THE DEEP: what lives under the water, and the ships that hunt it.

   THE KRAKEN (`grip` on rules/weapons.js `tentacles`) runs submerged, as a submarine does (`cloak`,
   core/combat.js _rtsCloakAI). Its shot is taking hold: it surfaces and seizes the ship (e.grip,
   the held ship's id; the ship's e.gripBy, the Kraken's - plain data, so a save keeps both). While
   it holds on, the ship does nothing - it does not move, or fire, or anything else (core/tick.js
   skips it) - and is crushed, `dps` a second through its armour; the Kraken stays surfaced, where
   it can be shot. It lets go when the ship is gone, when it dies, or when they drift apart.

   THE SONAR DOLPHIN hears what is under the water near it (`detects`, as the Destroyer's sonar does)
   and its sonic burst reaches anything afloat or below (`seaOnly`). The Sea Hornet's flak and the
   Bombard's missiles are ordinary weapons (rules/weapons.js `scorpflak`, `bombmissile`). */
var RTS_DEEP = { slack: RTS_TILE * 1.2 };

function _rtsGrip(e, tgt) {
  if (!tgt || tgt.dead || tgt.type !== 'unit' || !(rtsUnitDef(tgt.def) || {}).sea) return false;
  var G = window._rtsG, old = e.grip != null && G.byId[e.grip];
  if (old && old !== tgt) old.gripBy = null;
  e.grip = tgt.id; tgt.gripBy = e.id;
  e.path = null; e.goal = null;
  e.gripAt = { x: e.x, z: e.z, tx: tgt.x, tz: tgt.z };   /* where the two are locked together */
  return true;
}
/* Is `e` held? (core/tick.js: if so it does nothing this tick) */
function _rtsGripped(e) {
  if (e.gripBy == null) return false;
  var k = window._rtsG.byId[e.gripBy];
  if (!k || k.dead || k.grip !== e.id) { e.gripBy = null; return false; }
  return true;
}
function _rtsDeepTick(dt) {
  var G = window._rtsG;
  for (var i = 0; i < G.ents.length; i++) {
    var k = G.ents[i];
    if (k.grip == null) continue;
    var t = G.byId[k.grip], w = RTS_WEAPONS[(rtsUnitDef(k.def) || {}).weapon];
    if (k.dead || !t || t.dead || !w || !w.grip || Math.hypot(t.x - k.x, t.z - k.z) > w.range + RTS_DEEP.slack + (t.r || 0)) {
      if (t && t.gripBy === k.id) t.gripBy = null;
      k.grip = null; k.gripAt = null;
      continue;
    }
    k.decloak = RTS_SUB_SURFACE;                   /* holding on, it stays up where it can be shot */
    k.path = null;
    /* locked together: the crowd's shove (core/move.js _rtsSeparate) does not part them */
    if (k.gripAt) { k.x = k.gripAt.x; k.z = k.gripAt.z; t.x = k.gripAt.tx; t.z = k.gripAt.tz; }
    t.hurtBy = k.side;
    _rtsDamage(t, w.grip.dps * dt * _rtsBias(k.side).fire, k);   /* crushed to death, it is swept off and the grip goes with it next tick */
  }
}
