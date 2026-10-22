/* core/blast.js - EXPLOSIVES: the charge left on a target, and the unit that is its own bomb.

   A PLANTED CHARGE (`plant` on rules/weapons.js `satchel` and `limpet`). The shot does no damage:
   it leaves a charge on the target (`e.bomb`, plain data, so a save keeps it) that goes off after
   its fuse - its whole `dmg` to the target, through the target's armour, and half of it to
   everything within `rad`, whoever's it is. A target carries one charge at a time, so
   _rtsWeaponReaches says a charged one is not worth another and the planter moves on. If the
   target dies first the charge goes off where it fell. The Sapper's goes on anything on the
   ground; the Frogman's limpet (`on:'hull'`) only on a ship or a building.

   A UNIT THAT IS THE BOMB (`self` on `zealblast` and `wreckblast`, `blasts` on the unit). Its shot
   is the explosion: `dmg` round it within `rad`, friend and foe alike, and the carrier is gone
   with it. And because it is carrying the explosive, killing it sets it off too, where it falls
   (core/capture.js _rtsKill). */
var RTS_BLAST = { share: 0.5, shake: 0.35 };

/* Can `w`'s charge go on `tgt`? Not on one already charged, and a limpet only on a hull. */
function _rtsPlantable(w, tgt) {
  if (!tgt || tgt.dead || tgt.bomb || tgt.air) return false;
  if (w.plant.on !== 'hull') return true;
  return tgt.type === 'struct' || !!(rtsUnitDef(tgt.def) || {}).sea;
}
function _rtsPlant(e, tgt, w, raw) {
  if (!_rtsPlantable(w, tgt)) return false;
  var G = window._rtsG;
  tgt.bomb = { t: w.plant.fuse, fuse: w.plant.fuse, dmg: raw * rtsVerses(w, tgt), rad: w.plant.rad, side: e.side, by: e.id };
  G.bombsLive = (G.bombsLive || 0) + 1;
  return true;
}

/* THE BLAST ITSELF: `dmg` at the heart, falling off evenly to nothing at `rad` - measured to a
   building's edge, as a gun's range is - to everything on the ground but `skip`, whoever's it is.
   Not core/damage.js _rtsSplash, whose steps fall away within a cell: a satchel or a lorry of
   explosive is meant to take the building it is against, and what stands beside it. */
function _rtsBlastRing(x, z, dmg, rad, side, skip) {
  var G = window._rtsG, at = { x: x, z: z };
  for (var i = 0; i < G.ents.length; i++) {
    var o = G.ents[i];
    if (o === skip || o.dead || o.inside || o.air) continue;
    var d = _rtsRangeTo(at, o);
    if (d >= rad) continue;
    o.hurtBy = side;
    _rtsDamage(o, dmg * (1 - d / rad), null);
  }
}
function _rtsBlastFx(x, z, rad) {
  var G = window._rtsG;
  G.fx.push({ kind: 'boom', x: x, y: 1, z: z, t: 0, big: Math.max(1.4, rad / RTS_TILE * 1.3) });
  G.shake = Math.min(1, (G.shake || 0) + RTS_BLAST.shake * rad / (RTS_TILE * 2));
  if (typeof _rtsSfx === 'function') _rtsSfx('boom', x, z);
}
/* A planted charge goes off: all of it to its host, `share` of it round it. */
function _rtsBlastAt(x, z, dmg, rad, side, host) {
  if (host && !host.dead) { host.hurtBy = side; _rtsDamage(host, dmg, null); }
  _rtsBlastRing(x, z, dmg * RTS_BLAST.share, rad, side, host);
  _rtsBlastFx(x, z, rad);
}
/* Each tick, while a charge is ticking anywhere. */
function _rtsBlastTick(dt) {
  var G = window._rtsG;
  if (!G.bombsLive) return;
  var live = 0;
  for (var i = 0; i < G.ents.length; i++) {
    var o = G.ents[i], b = o.bomb;
    if (!b) continue;
    if (o.dead) { o.bomb = null; continue; }      /* gone some quiet way (core/rift.js): it goes with it */
    b.t -= dt;
    if (b.t > 0) { live++; continue; }
    o.bomb = null;
    _rtsBlastAt(o.x, o.z, b.dmg, b.rad, b.side, o);
  }
  G.bombsLive = live;
}
/* Its host destroyed before the fuse ran out, the charge goes off where it fell (core/capture.js
   _rtsKill) - at once, before the wreck is swept off the map. */
function _rtsBlastHostDied(o) {
  var b = o.bomb;
  o.bomb = null;
  _rtsBlastAt(o.x, o.z, b.dmg, b.rad, b.side, null);
}

/* The carrier goes off: from its own shot (core/combat.js) or from being killed (core/capture.js).
   Once only - a Zealot killed by another Zealot's blast does not go off twice. */
function _rtsBlastGo(e) {
  var w = RTS_WEAPONS[(rtsUnitDef(e.def) || {}).weapon];
  if (e.blasted || !w || !w.self) return;
  e.blasted = 1;
  e.crushed = true;                               /* nothing left of it, and nobody climbs out */
  var raw = w.dmg * _rtsBias(e.side).fire * rtsCrateMult(e, 'fire');
  _rtsBlastRing(e.x, e.z, raw, w.self.rad, e.side, e);
  _rtsBlastFx(e.x, e.z, w.self.rad);
}
