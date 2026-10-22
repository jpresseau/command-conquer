/* core/rift.js - THE RIFT: the Compact's units that step outside of time, and the tank that hides
   in plain sight.

   THE RIFT TROOPER (`rift:true` on the unit) does not walk. A move order charges a jump for
   RTS_RIFT.charge seconds, standing still, and then it is THERE - on the open cell nearest the
   spot. It cannot be ordered again until it lands. Its gun (`erase` on rules/weapons.js
   `riftgun`) does no damage: each shot pushes its target further out of time. While a target is
   being erased it is frozen - it does not move, fire or build - and nothing else can hurt it;
   when the push passes its hit points it is gone, with no wreck. Let the shooting lapse for
   RTS_RIFT.lapse seconds and it comes back, whole.

   THE RIFT HARVESTER (`rift:true` with `harvest`) mines like any harvester, and when its hopper is
   full it jumps home to its refinery's dock after RTS_RIFT.home seconds instead of driving there
   (core/harvest.js asks _rtsRiftHome).

   THE VEIL TANK (`veil:true`) is hidden once it has stood still for RTS_RIFT.park seconds without
   firing: the jammer's own rules then apply to it alone (core/jammer.js _rtsJammed), so it is
   found the way a jammed unit is - by something of the enemy's standing close, a Spotter, or an
   Echo Sensor - and to an enemy who has not found it, it is drawn as a tree (render3d/veil3d.js). */
var RTS_RIFT = { charge: 1.2, lapse: 2.5, home: 1.5, park: 2 };

/* ------------------------------------------------------------------ jumping ---- */
/* A move order for a unit that jumps: charge, and land at (x, z). True if it took the order. */
function _rtsRiftJump(e, x, z) {
  var d = rtsUnitDef(e.def);
  if (!d || !d.rift || d.harvest || e.inside) return false;
  var c = _rtsNearestOpen(_rtsTX(x), _rtsTX(z), 6, _rtsDomainOf(e));
  if (!c) return false;
  e.jump = { x: _rtsWX(c[0]), z: _rtsWX(c[1]), t: RTS_RIFT.charge };
  e.order = 'jump'; e.path = null; e.target = null;
  return true;
}
/* Each tick, for a unit charging a jump: true while it is busy charging (core/tick.js). */
function _rtsRiftBusy(e, dt) {
  if (!e.jump) return false;
  e.jump.t -= dt;
  if (e.jump.t > 0) return true;
  var G = window._rtsG, j = e.jump;
  G.fx.push({ kind: 'pop', x: e.x, y: 1, z: e.z, t: 0, big: 0.6 });
  e.x = j.x; e.z = j.z; e.jump = null; e.order = null;
  G.fx.push({ kind: 'pop', x: e.x, y: 1, z: e.z, t: 0, big: 0.6 });
  return false;
}
/* The Rift Harvester, full, going home: charge, then land at the dock. True while it is doing so. */
function _rtsRiftHome(e, ref, dock, dt) {
  if (!(rtsUnitDef(e.def) || {}).rift) return false;
  e.homeT = (e.homeT || 0) + dt;
  e.path = null;
  if (e.homeT < RTS_RIFT.home) return true;
  var c = _rtsNearestOpen(_rtsTX(dock.x), _rtsTX(dock.z), 4, _rtsDomainOf(e));
  e.homeT = 0;
  if (!c) return false;
  var G = window._rtsG;
  G.fx.push({ kind: 'pop', x: e.x, y: 1, z: e.z, t: 0, big: 0.9 });
  e.x = _rtsWX(c[0]); e.z = _rtsWX(c[1]);
  G.fx.push({ kind: 'pop', x: e.x, y: 1, z: e.z, t: 0, big: 0.9 });
  e.hstate = 'unload'; e.ref = ref; _rtsDockReset(e);
  return true;
}

/* ------------------------------------------------------------------ erasing ---- */
/* A shot from an erasing gun: push the target further out of time. */
function _rtsErase(e, tgt, w) {
  var G = window._rtsG;
  if (!tgt || tgt.dead) return;
  tgt.erase = (tgt.erase || 0) + w.dmg;
  tgt.eraseT = G.t; tgt.eraseBy = e.id;
  if (tgt.type === 'unit') { tgt.path = null; tgt.order = null; tgt.target = null; }
  if (tgt.erase >= tgt.hp) {
    if (_rtsHostile(e.side, tgt.side)) e.kills = (e.kills || 0) + 1;
    tgt.hurtBy = e.side;
    _rtsKillQuiet(tgt);
  }
}
/* Each tick, for something being erased: true while it is frozen (core/tick.js). Lapsed, it is back. */
function _rtsErased(e) {
  if (!(e.erase > 0)) return false;
  if (window._rtsG.t - e.eraseT > RTS_RIFT.lapse) { e.erase = 0; e.eraseBy = null; return false; }
  return true;
}

/* ------------------------------------------------------------------- the veil ---- */
function _rtsVeilTick(dt) {
  var G = window._rtsG;
  for (var i = 0; i < G.ents.length; i++) {
    var u = G.ents[i];
    if (u.type !== 'unit' || u.dead || !(rtsUnitDef(u.def) || {}).veil) continue;
    var still = !(u.path && u.pi < u.path.length) && !(u.firedT != null && G.t - u.firedT < RTS_RIFT.park);
    u.veilT = still ? (u.veilT || 0) + dt : 0;
  }
}
/* A shot gives it away at once, not at the next tick: the shot is what sets firedT (core/combat.js). */
function _rtsVeiled(o) {
  if (!o || o.dead || o.type !== 'unit' || !(o.veilT >= RTS_RIFT.park) || !(rtsUnitDef(o.def) || {}).veil) return false;
  return !(o.firedT != null && window._rtsG.t - o.firedT < RTS_RIFT.park);
}
