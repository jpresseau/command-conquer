/* core/econ.js - THE ECONOMY: the buildings that make money go further, and the harvester that
   fights for it.

   Each of these works while it stands and is finished (_rtsHas counts nothing still going up) -
   power or no power, as a refinery does - and one is enough: a second adds nothing.

   THE ASSAY PLANT (`assay`): every load a refinery takes pays RTS_ECON.assay as much
   (core/harvest.js, at the unload). THE FOUNDRY (`foundry`): a vehicle costs and builds in
   RTS_ECON.foundry of its price and time (core/production.js _rtsCostOf, _rtsBuildTimeOf - so the
   sidebar's price says so too). THE CLONE VATS (`vats`): every soldier the barracks trains comes
   out twice (core/production.js _rtsDeliverUnit), the second for nothing.

   THE WAR HARVESTER (`harvest` with a weapon): it mines like any harvester, and turns its gun on
   anything in reach as it goes, without leaving its work (core/harvest.js asks _rtsHarvGuns). */
var RTS_ECON = { assay: 1.25, foundry: 0.75 };

/* what a load's worth pays at `side`'s refineries */
function _rtsOreBonus(side) { return _rtsHas(side, 'assay') ? RTS_ECON.assay : 1; }
/* a vehicle's price and time at `side`, the Foundry counted */
function _rtsFoundryK(side, def) { return def && def.kind === 'vehicle' && _rtsHas(side, 'foundry') ? RTS_ECON.foundry : 1; }
/* a soldier out of the barracks: one more for nothing, with the Clone Vats standing */
function _rtsCloned(side, key) {
  var d = rtsUnitDef(key);
  return !!(d && d.kind === 'infantry' && !d.air && _rtsHas(side, 'vats'));
}
/* the War Harvester's gun, on whatever comes in reach while it works */
function _rtsHarvGuns(e, d) {
  var w = d.weapon && RTS_WEAPONS[d.weapon];
  if (!w || e.cool > 0) return;
  /* its own aim (e.hgun, an id), not e.target: a harvester's orders are its work, and the rest of
     the game reads a target as an order to go and fight */
  var G = window._rtsG, held = e.hgun != null && G.byId[e.hgun];
  var t = held && !held.dead && _rtsHostile(held.side, e.side) && _rtsRangeTo(e, held) <= w.range ? held : _rtsFindTarget(e, w.range, w);
  e.hgun = t ? t.id : null;
  if (t) _rtsFire(e, t, w);
}
