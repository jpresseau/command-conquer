/* core/rad.js - RADIATION: ground that burns whoever stands on it.

   A POOL (G.rads, plain data, so a save keeps it) is a circle of poisoned ground that fades to
   nothing over its life. Every RTS_RAD.step seconds everything on the ground inside one is hurt
   by its strength, falling off from the middle to the edge: infantry fully, vehicles and ships by
   RTS_RAD.hull of it, buildings and aircraft not at all, and friend and foe alike - except
   whatever is `radproof`. Pools close together of one side's making are one pool, made stronger
   and longer, so a Blight Trooper firing at one spot does not lay a hundred.

   Where they come from: the Blight Trooper's ray leaves one where it hits (`rad` on
   rules/weapons.js `blightgun`, core/combat.js); a DEPLOYED Blight Trooper (`irradiates`, deployed
   through core/dig.js like a dug-in squad) is a pool of RTS_RAD.aura round itself for as long as
   it stands; and a Fission Reactor destroyed (`meltdown`, core/capture.js _rtsKill) leaves the
   biggest of all. render3d/rad3d.js draws them as glowing green ground. */
var RTS_RAD = { step: 0.5, hull: 0.3, merge: 0.6, aura: { r: RTS_TILE * 3, dps: 26 } };

function _rtsRadPool(x, z, spec, side) {
  var G = window._rtsG, P = G.rads || (G.rads = []);
  for (var i = 0; i < P.length; i++) {
    var p = P[i];
    if (p.side === side && Math.hypot(p.x - x, p.z - z) < p.r * RTS_RAD.merge) {
      p.t = Math.max(p.t, spec.life); p.life = Math.max(p.life, spec.life);
      p.dps = Math.max(p.dps, spec.dps); p.r = Math.max(p.r, spec.r);
      return p;
    }
  }
  var np = { x: x, z: z, r: spec.r, t: spec.life, life: spec.life, dps: spec.dps, side: side };
  P.push(np);
  return np;
}
/* A deployed Blight Trooper: core/dig.js's `dug`, on a unit that irradiates. */
function _rtsIrradiating(e) { return !!(e && !e.dead && e.dug && !e.inside && (rtsUnitDef(e.def) || {}).irradiates); }
/* Everything burning now: the pools at their strength for the life they have left, and each
   deployed Blight Trooper as a pool of its own. */
function _rtsRadSources() {
  var G = window._rtsG, out = [], P = G.rads || [], i;
  for (i = 0; i < P.length; i++) out.push({ x: P[i].x, z: P[i].z, r: P[i].r, dps: P[i].dps * P[i].t / P[i].life, side: P[i].side });
  for (i = 0; i < G.ents.length; i++) {
    var e = G.ents[i];
    if (e.type === 'unit' && _rtsIrradiating(e)) out.push({ x: e.x, z: e.z, r: RTS_RAD.aura.r, dps: RTS_RAD.aura.dps, side: e.side });
  }
  return out;
}
/* How hard the ground at (x, z) burns, per second, for infantry. */
function _rtsRadAt(x, z, src) {
  src = src || _rtsRadSources();
  var s = 0;
  for (var i = 0; i < src.length; i++) {
    var d = Math.hypot(x - src[i].x, z - src[i].z);
    if (d < src[i].r) s += src[i].dps * (1 - 0.5 * d / src[i].r);
  }
  return s;
}
function _rtsRadTick(dt) {
  var G = window._rtsG;
  G.radAcc = (G.radAcc || 0) + dt;
  if (G.radAcc < RTS_RAD.step) return;
  var step = G.radAcc; G.radAcc = 0;
  var src = _rtsRadSources();
  if (!src.length) return;
  for (var i = 0; i < G.ents.length; i++) {
    var o = G.ents[i];
    if (o.type !== 'unit' || o.dead || o.inside || o.air) continue;
    var d = rtsUnitDef(o.def) || {};
    if (d.radproof) continue;
    var burn = _rtsRadAt(o.x, o.z, src);
    if (!(burn > 0)) continue;
    o.hurtBy = _rtsRadWhose(o, src);
    _rtsDamage(o, burn * step * (d.kind === 'infantry' ? 1 : RTS_RAD.hull), null);
  }
  var P = G.rads || [];
  for (var k = P.length - 1; k >= 0; k--) { P[k].t -= step; if (P[k].t <= 0) P.splice(k, 1); }
}
/* whose poison it is, for the scoreboard: the nearest source over `o` */
function _rtsRadWhose(o, src) {
  var best = null, bd = 1e9;
  for (var i = 0; i < src.length; i++) { var d = Math.hypot(o.x - src[i].x, o.z - src[i].z); if (d < src[i].r && d < bd) { bd = d; best = src[i].side; } }
  return best;
}
