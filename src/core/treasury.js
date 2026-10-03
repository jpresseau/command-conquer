/* core/treasury.js - credits, ore and the silos that hold it. Split from core/grid.js. */
/* --------------------------------------------------------------- the treasury --
   HOUSE.CPP keeps TWO pools, not one, and BDATA.CPP's `Capacity` is the reason:

     Credits  - money you were GIVEN. Starting cash, a sale, a cancelled order, a thief's
                haul. Uncapped: nothing physical is holding it.
     Tiberium - harvested ore SITTING IN YOUR BUILDINGS. Capped by the sum of every
                structure's Storage, and a harvester that unloads above that cap loses the
                difference on the dock.

   Available_Money() is the sum of the two and is what everything asks about; Spend_Money()
   drains the stored ore first, so the cap keeps biting until you have actually spent down.
   Keeping them as one number would make the cap meaningless: you would start the match
   already over capacity and never earn a credit.

   Call rtsMoney() to ask, _rtsSpend/_rtsGrant/_rtsHarvested to change. Assigning to
   `S.credits` directly still works and still means "given money", but it will not be capped
   and will not warn - which is right for a refund and wrong for income. */
function rtsMoney(S) { return S.credits + S.ore; }
/* Sum of Storage over this side's finished, living structures. Rebuilt on demand rather than
   cached: a capacity that goes stale when a silo is shot is a capacity that silently keeps
   accepting scrap into a building that is no longer there. */
function rtsCapacity(side) {
  var G = window._rtsG, cap = 0;
  for (var i = 0; i < G.ents.length; i++) {
    var e = G.ents[i];
    if (e.dead || e.type !== 'struct' || e.side !== side || e.building) continue;
    var d = rtsStructDef(e.def);
    if (d && d.storage) cap += d.storage;
  }
  return cap;
}
/* The original nags you about this once and then shuts up for a while - a message that fires
   on every unload tick would be the only thing on screen. */
var RTS_SILO_WARN_DELAY = 25;
function _rtsSiloWarn(S) {
  var G = window._rtsG;
  if (S.spillSaid && G.t - S.spillSaid < RTS_SILO_WARN_DELAY) return;
  S.spillSaid = G.t || 0.0001;
  _rtsSay('Silos needed - scrap is being lost.');
  if (typeof _rtsSfx === 'function') _rtsSfx('deny');
}
function _rtsSpend(S, n) {
  if (n <= 0) return 0;
  var paid = Math.min(n, rtsMoney(S));
  if (S.ore >= paid) { S.ore -= paid; }
  else { var rest = paid - S.ore; S.ore = 0; S.credits -= rest; }
  return paid;
}
/* Money handed over rather than mined: never capped, never spilled. */
function _rtsGrant(S, n) { if (n > 0) S.credits += n; }
/* Harvested_Money: into the store, clamped, and the remainder is gone. Returns what was lost
   so the caller can complain about it. */
function _rtsHarvested(S, n) {
  if (n <= 0) return 0;
  var cap = rtsCapacity(S.key), room = Math.max(0, cap - S.ore);
  var kept = Math.min(n, room);
  S.ore += kept;
  var lost = n - kept;
  if (lost > 0) S.spill += lost;
  return lost;
}
