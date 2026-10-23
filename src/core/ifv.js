/* core/ifv.js - THE MULTI-ROLE CARRIER (`ifv` on rules/roster11.js): one soldier rides in it, and
   its gun is his.

   Empty, it fires its own missiles (`weapon`). With a soldier aboard, core/combat.js _rtsGuns asks
   _rtsIfvGun for the weapon his key names in `ifv` - '*' for any other soldier who carries a gun -
   and a soldier with none (a Field Medic, an Engineer, a Mentalist...) leaves it its missiles.
   Two are named for more than a gun: 'fix' (an Engineer) repairs its side's vehicles near it, and
   'heal' (a Field Medic) its side's soldiers, while the missiles stay (_rtsIfvTick). */
var RTS_IFV = { r: RTS_TILE * 3, fix: 10, heal: 6, every: 0.5 };

/* what the soldier aboard makes of it: a weapon key, 'fix', 'heal', or null */
function _rtsIfvRole(e, d) {
  if (!d || !d.ifv || !e.cargo || !e.cargo.length) return null;
  var p = e.cargo[0], pd = rtsUnitDef(p.def) || {};
  return d.ifv[p.def] || (pd.weapon ? d.ifv['*'] : null);
}
/* the weapon the carrier fires now */
function _rtsIfvGun(e, d) {
  var r = _rtsIfvRole(e, d);
  return !r || r === 'fix' || r === 'heal' ? d.weapon : r;
}
function _rtsIfvTick(dt) {
  var G = window._rtsG;
  G.ifvAcc = (G.ifvAcc || 0) + dt;
  if (G.ifvAcc < RTS_IFV.every) return;
  var step = G.ifvAcc; G.ifvAcc = 0;
  for (var i = 0; i < G.ents.length; i++) {
    var c = G.ents[i];
    if (c.type !== 'unit' || c.dead || !c.cargo || !c.cargo.length) continue;
    var r = _rtsIfvRole(c, rtsUnitDef(c.def));
    if (r !== 'fix' && r !== 'heal') continue;
    var kind = r === 'fix' ? 'vehicle' : 'infantry', hps = RTS_IFV[r];
    for (var j = 0; j < G.ents.length; j++) {
      var u = G.ents[j];
      if (u.type !== 'unit' || u.dead || u.side !== c.side || u.hp >= u.maxHp || u.inside) continue;
      if ((rtsUnitDef(u.def) || {}).kind !== kind || Math.hypot(u.x - c.x, u.z - c.z) > RTS_IFV.r) continue;
      u.hp = Math.min(u.maxHp, u.hp + hps * step);
    }
  }
}
