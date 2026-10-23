/* core/leech.js - THE LEECH DRONE (`latch` on rules/roster11.js `leechbite`).

   Its bite is not a shot: within its reach of an enemy vehicle it climbs inside (_rtsLatch). In
   there it is out of the fight - nothing can shoot it, it is not drawn (`inside`, as a passenger
   is) - and it eats the vehicle from within, `latch.dps` a second, through any armour, until the
   vehicle dies. Then it climbs out where the wreck is and goes on hunting. A vehicle carries one.

   THE CURE. A Repair Truck of the vehicle's own side with the vehicle inside its reach (`heals`,
   `healKind:'vehicle'`), or a Repair Bay with it inside its own (`repairs`), gets the drone out,
   and the drone dies. So the answer to a Leech Drone is to drive home, or to bring the truck. */
function _rtsLatchable(tgt) {
  if (!tgt || tgt.dead || tgt.type !== 'unit' || tgt.air || tgt.inside || tgt.leeched) return false;
  return (rtsUnitDef(tgt.def) || {}).kind === 'vehicle';
}
/* from core/combat.js _rtsFire */
function _rtsLatch(e, tgt, w) {
  if (!_rtsLatchable(tgt)) return false;
  var G = window._rtsG;
  e.latch = { host: tgt.id, dps: w.latch.dps * _rtsBias(e.side).fire };
  tgt.leeched = e.id;
  e.inside = tgt; e.order = null; e.target = null; e.path = null; e.goal = null;
  var si = G.sel.indexOf(e); if (si >= 0) G.sel.splice(si, 1);
  return true;
}
/* Is the host where its side can get the drone out? */
function _rtsLeechCured(host) {
  var G = window._rtsG;
  for (var i = 0; i < G.ents.length; i++) {
    var o = G.ents[i];
    if (o.dead || o.side !== host.side || o === host) continue;
    var d = o.type === 'struct' ? rtsStructDef(o.def) : rtsUnitDef(o.def);
    if (!d) continue;
    var r = o.type === 'struct' ? d.repairs : (d.healKind === 'vehicle' ? d.heals : 0);
    if (r && !o.building && !o.inside && _rtsRangeTo(o, host) <= r) return true;
  }
  return false;
}
function _rtsLeechOut(e, host) {
  e.latch = null; e.inside = null;
  if (host) { host.leeched = null; e.x = host.x; e.z = host.z; }
}
function _rtsLeechTick(dt) {
  var G = window._rtsG;
  for (var i = 0; i < G.ents.length; i++) {
    var e = G.ents[i];
    if (e.dead || !e.latch) continue;
    var host = G.byId[e.latch.host];
    if (!host || host.dead) { _rtsLeechOut(e, host); continue; }
    if (_rtsLeechCured(host)) {
      _rtsLeechOut(e, host);
      e.hurtBy = host.side;
      _rtsKill(e);
      if (host.side === 'player') _rtsSay('Leech Drone removed.');
      continue;
    }
    e.x = host.x; e.z = host.z;
    host.hurtBy = e.side;
    _rtsDamage(host, e.latch.dps * dt, e, false);
    if (host.dead) _rtsLeechOut(e, host);
  }
}
