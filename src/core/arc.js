/* core/arc.js - THE ARC: troopers that charge an Arc Tower, and the arc weapons' numbers.

   An Arc Tower (`chargedBy:'arctroop'` on its rules) is CHARGED by every Arc Trooper of its side
   standing within RTS_ARC.charge cells of it - on foot, not inside a transport - up to
   RTS_ARC.max of them. A charged tower fires through a brownout, which an uncharged one never
   does (core/combat.js _rtsFire), and each charger adds RTS_ARC.boost of a shot. Each time it
   fires, an arc is drawn from each charger up to the coil, so the player can see who is doing it.

   The Arc Tank's bolt jumps on to the enemies beside its target the way a Lens Tank's beam forks
   (core/lens.js), with its own `split` numbers on the weapon. Both arc weapons draw `beam`
   effects marked `arc`, which render3d/fxemit3d.js draws as lightning, and sound as `zap`. */
var RTS_ARC = { charge: 3, max: 3, boost: 0.25, towerY: 6.0, unitY: 1.4 };

/* The troopers charging `e`, nearest first: none for anything that is not charged by them. */
function _rtsArcChargers(e) {
  var d = e && e.type === 'struct' ? rtsStructDef(e.def) : null;
  if (!d || !d.chargedBy) return [];
  var G = window._rtsG, R = RTS_ARC.charge * RTS_TILE, near = _rtsSpNear(e.x, e.z, R) || G.ents, c = [];
  for (var i = 0; i < near.length; i++) {
    var o = near[i];
    if (o.type !== 'unit' || o.dead || o.inside || o.def !== d.chargedBy || o.side !== e.side) continue;
    var dd = Math.hypot(o.x - e.x, o.z - e.z);
    if (dd <= R) c.push({ o: o, d: dd, i: i });
  }
  c.sort(function (a, b) { return a.d - b.d || a.i - b.i; });
  return c.slice(0, RTS_ARC.max).map(function (k) { return k.o; });
}
/* The shot's multiplier from its chargers, drawing an arc from each up to the coil. */
function _rtsArcCharge(e) {
  var cs = _rtsArcChargers(e);
  if (!cs.length) return 1;
  var G = window._rtsG;
  for (var i = 0; i < cs.length; i++)
    G.fx.push({ kind: 'beam', x: cs[i].x, y: RTS_ARC.unitY, z: cs[i].z, x2: e.x, y2: RTS_ARC.towerY, z2: e.z, t: 0, lens: 0.6, arc: 1 });
  return 1 + RTS_ARC.boost * cs.length;
}
