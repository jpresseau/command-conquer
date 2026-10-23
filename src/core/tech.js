/* core/tech.js - TECH BUILDINGS: the prizes between the bases.

   The setup's TOWNS + TECH lays an Oil Derrick, a Field Hospital, a Machine Shop and an Airstrip in
   the contested ground (_rtsLayTech, from core/garrison.js _rtsLayTowns). They belong to the `civ`
   seat, which fights nobody, until an Engineer takes one (`tech` on the building makes it fair game
   for an Engineer though it is no one's enemy: _rtsClaimable). Then it works for whoever holds it:

     THE DERRICK   RTS_TECH.oil.pay credits every RTS_TECH.oil.every seconds
     THE HOSPITAL  heals its owner's infantry within RTS_TECH.heal.r, RTS_TECH.heal.hps a second
     THE SHOP      repairs its owner's vehicles within RTS_TECH.fix.r, RTS_TECH.fix.hps a second
     THE AIRSTRIP  a superweapon, Paratroopers (core/supers.js): a plane with RTS_TECH.drop.n rifle
                   squads aboard flies from it to the cell chosen, and they jump (core/paradrop.js)

   An Engineer can take it back again from whoever holds it, as it can any building. */
var RTS_TECH = {
  oil: { every: 10, pay: 75 },
  heal: { r: RTS_TILE * 6, hps: 6 },
  fix: { r: RTS_TILE * 6, hps: 8 },
  drop: { n: 4 }
};

/* Can `side` send an Engineer at `b`? An enemy's building, or a tech building no one holds. */
function _rtsClaimable(b, side) {
  if (!b || b.type !== 'struct') return false;
  return _rtsHostile(b.side, side) || (b.side === 'civ' && !!(rtsStructDef(b.def) || {}).tech);
}
function _rtsTechTick(dt) {
  var G = window._rtsG;
  G.techAcc = (G.techAcc || 0) + dt;
  if (G.techAcc < 0.5) return;
  var step = G.techAcc; G.techAcc = 0;
  for (var i = 0; i < G.ents.length; i++) {
    var b = G.ents[i];
    if (b.type !== 'struct' || b.dead || b.side === 'civ') continue;
    var t = (rtsStructDef(b.def) || {}).tech;
    if (!t) continue;
    if (t === 'oil') {
      b.oilT = (b.oilT || 0) + step;
      if (b.oilT >= RTS_TECH.oil.every) { b.oilT -= RTS_TECH.oil.every; G.sides[b.side].credits += RTS_TECH.oil.pay; }
    } else if (t === 'heal' || t === 'fix') {
      var A = RTS_TECH[t], kind = t === 'heal' ? 'infantry' : 'vehicle';
      for (var j = 0; j < G.ents.length; j++) {
        var u = G.ents[j];
        if (u.type !== 'unit' || u.dead || u.side !== b.side || u.hp >= u.maxHp || u.inside) continue;
        if ((rtsUnitDef(u.def) || {}).kind !== kind || Math.hypot(u.x - b.x, u.z - b.z) > A.r) continue;
        u.hp = Math.min(u.maxHp, u.hp + A.hps * step);
      }
    }
  }
}
/* THE AIRSTRIP'S PARATROOPERS: a plane from the strip, four squads aboard, sent to drop at (tx, tz). */
function _rtsFireParadrop(side, tx, tz) {
  var G = window._rtsG, strip = null;
  for (var i = 0; i < G.ents.length && !strip; i++) {
    var b = G.ents[i];
    if (b.type === 'struct' && !b.dead && b.side === side && (rtsStructDef(b.def) || {}).tech === 'drop') strip = b;
  }
  if (!strip || !_rtsInB(tx, tz)) return false;
  var plane = _rtsSpawnUnit(side, 'paraplane', strip.x, strip.z);
  if (!plane) return false;
  for (var k = 0; k < RTS_TECH.drop.n; k++) {
    var man = _rtsSpawnUnit(side, 'rifle', strip.x, strip.z);
    if (man) _rtsBoard(man, plane);
  }
  _rtsOrderUnloadAt(plane, _rtsWX(tx), _rtsWX(tz));
  return true;
}

/* ------------------------------------------------------------------ laying ---- */
/* The setup's tech: one of each, spread across the contested ground between the first two bases. */
function _rtsLayTech(G, spot) {
  var keys = ['derrick', 'hospital', 'mshop', 'airstrip'], out = [], P = G.starts.player, E = G.starts.enemy;
  var ax = E.tx - P.tx, az = E.tz - P.tz, L = Math.hypot(ax, az) || 1, nx = -az / L, nz = ax / L;
  for (var i = 0; i < keys.length; i++) {
    var side = (i % 2 ? -1 : 1) * RTS_N * (0.08 + 0.1 * (i >> 1)), f = 0.5;
    var c = spot(keys[i], Math.round(P.tx + ax * f + nx * side), Math.round(P.tz + az * f + nz * side), RTS_GARRISON.search);
    if (c) out.push(_rtsPlaceCiv(keys[i], c[0], c[1]));
  }
  return out;
}
