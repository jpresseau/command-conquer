/* core/veterancy.js - VETERANS: a unit that has made kills is promoted, and fights better for it.

   Three ranks, by kills (RTS_VET.kills in rules/balance.js): each hits harder and takes less
   (RTS_VET.dmg, RTS_VET.armor, applied in core/damage.js with the house's own bias), and the
   third, elite, mends itself in the field when it is not being hit (RTS_VET.heal of its hit
   points a second). Every seat's units are promoted alike - the kill count already existed
   (Crew.Made_A_Kill, damage.js), so a veteran enemy tank was always a hotter target; now it is
   also a harder one. Only units rank: a tower that has killed forty men is still a tower. A
   promotion on the player's side is said, with the unit, so a tap on the line finds it; the
   chevrons are ui/hud.js's, over the health bar. Part of rts.core; unit/veterancy plays it. */

/* the rank `e` has earned; said and kept when it changes */
function _rtsVetRank(e) {
  if (!e || e.type !== 'unit') return 0;
  var k = e.kills || 0, r = 0;
  for (var i = 0; i < RTS_VET.kills.length; i++) if (k >= RTS_VET.kills[i]) r = i + 1;
  if (r !== (e.rank || 0)) {
    e.rank = r;
    if (e.side === 'player' && !e.dead) _rtsSay((rtsUnitDef(e.def) || {}).name + (r >= RTS_VET.kills.length ? ' is elite' : ' promoted') + ' — ' + k + ' kills.', 3, { x: e.x, z: e.z }, e);
  }
  return r;
}
/* what a rank is worth: the attacker's on the damage, the target's against it */
function _rtsVetHit(dmg, from, tgt) {
  if (from && from.rank) dmg *= 1 + RTS_VET.dmg * from.rank;
  if (tgt && tgt.rank) dmg /= 1 + RTS_VET.armor * tgt.rank;
  return dmg;
}
/* elite units mend, a little a second, while nothing is hitting them */
function _rtsVetTick(dt) {
  var G = window._rtsG, top = RTS_VET.kills.length;
  for (var i = 0; i < G.ents.length; i++) {
    var e = G.ents[i];
    if (e.dead || e.type !== 'unit' || (e.rank || 0) < top || e.hp >= e.maxHp || e.hitT > 0) continue;
    e.hp = Math.min(e.maxHp, e.hp + e.maxHp * RTS_VET.heal * dt);
  }
}
