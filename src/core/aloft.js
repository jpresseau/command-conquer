/* core/aloft.js - ALOFT: the airship, the drones and the aircraft that never reload.

   ENDLESS (`endless` on the unit): an aircraft that carries what it fires for as long as it flies -
   the Leviathan, the Jetpack Trooper. core/move.js never sends one home to a pad, and core/combat.js
   never counts its rounds, so it neither runs dry nor crashes for want of a pad.

   THE DROP (`drop` on rules/weapons.js `levbomb`): the Leviathan's bombs fall from where it is,
   onto whatever is under it, through the Heavy Bomber's own falling bombs (core/bomber.js
   G.bombs) with the weapon's own damage and reach. Its range is short, so it has to float over
   what it means to hit.

   THE CARRIER (`launch` on `hornets`): its shot is a Hornet - a drone - launched at the target, up
   to RTS_ALOFT.hornets in the air at once. A Hornet fights as any aircraft does until its rack is
   empty or its target gone, then flies home and lands on its Carrier, which counts it back in.
   With no Carrier to go home to, it falls out of the sky. Hornets are never built (`spawned`:
   core/production.js will not queue one, ui/sidebar.js does not show one). */
var RTS_ALOFT = { hornets: 3, dock: RTS_TILE * 1.8 };

function _rtsEndless(d) { return !!(d && d.endless); }

/* The Leviathan's bomb: down from where it is. */
function _rtsSkyDrop(e, w, raw) {
  var G = window._rtsG;
  (G.bombs || (G.bombs = [])).push({ x: e.x, z: e.z, y: e.alt || 14, t: w.drop.fall, side: e.side, from: e.id, dmg: raw, rad: w.drop.rad });
}

/* ------------------------------------------------------------------ hornets ---- */
function _rtsHornetsOf(c) {
  var G = window._rtsG, n = 0;
  for (var i = 0; i < G.ents.length; i++) { var o = G.ents[i]; if (!o.dead && o.mother === c.id) n++; }
  return n;
}
/* The Carrier's shot: a Hornet away at `tgt`, if it has one to spare. */
function _rtsLaunch(e, tgt, w) {
  if (!tgt || tgt.dead || _rtsHornetsOf(e) >= RTS_ALOFT.hornets) return false;
  var h = _rtsSpawnUnit(e.side, w.launch, e.x, e.z);
  if (!h) return false;
  h.mother = e.id;
  _rtsOrderAttack(h, tgt);
  if (typeof _rtsSfx === 'function') _rtsSfx('rocket', e.x, e.z);
  return true;
}
/* A Hornet's tick, ahead of the aircraft's (core/move.js _rtsAirTick): true while it is going home,
   false to leave it to fight. */
function _rtsHornetTick(e, dt) {
  var G = window._rtsG, c = G.byId[e.mother];
  if (!c || c.dead) { _rtsDamage(e, e.hp + 1, null, false); return true; }   /* nowhere to land */
  var busy = e.ammo > 0 && e.target && !e.target.dead;
  if (busy) return false;
  e.target = null; e.order = 'home';
  var d = Math.hypot(c.x - e.x, c.z - e.z);
  if (d <= RTS_ALOFT.dock) { _rtsKillQuiet(e); return true; }                 /* aboard, and counted back in */
  if (!e.goal || Math.hypot(c.x - e.goal.x, c.z - e.goal.z) > RTS_TILE) {
    e.goal = { x: c.x, z: c.z }; e.path = _rtsPathFor(e, c.x, c.z); e.pi = 0;
  }
  return true;
}
