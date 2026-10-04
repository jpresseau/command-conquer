/* core/repairtruck.js - the Repair Truck: a Repair Bay that drives to the fight.

   The verb is MENDING IN THE FIELD. The repair itself is the Field Medic's aura (core/units.js
   `heals`), pointed at vehicles by `healKind` - every friendly vehicle within its radius is
   brought back up, for free, whatever the truck is doing. This file is where it goes:

     LEFT IDLE   it drives to the nearest damaged friendly vehicle within RTS_FIX.seek cells that
                 is not already in its reach, and stops beside it
     THE ENEMY'S follows its army: idle with nothing damaged near, it goes to the centre of the
                 opponent's largest team on the march, a few cells behind it (_rtsAIFixTick)

   The opponent buys one once its field army has RTS_FIX.army vehicles worth mending
   (_rtsAISupport, core/aimines.js). */

var RTS_FIX = { seek: 10, every: 1, army: 6, behind: 4, defended: 4 };

function _rtsFixes(u) { var d = rtsUnitDef(u.def) || {}; return d.healKind === 'vehicle' && d.heals > 0; }
function _rtsFixIdle(u) { return !u.order && (!u.path || u.pi >= u.path.length); }
/* The nearest damaged friendly vehicle within `cells`, not already in the truck's reach. */
function _rtsFixWants(u) {
  var G = window._rtsG, d = rtsUnitDef(u.def), best = null, bd = RTS_FIX.seek * RTS_TILE;
  for (var i = 0; i < G.ents.length; i++) {
    var v = G.ents[i];
    if (v === u || v.dead || v.inside || v.type !== 'unit' || v.side !== u.side || v.hp >= v.maxHp) continue;
    if ((rtsUnitDef(v.def) || {}).kind !== 'vehicle') continue;
    var dd = Math.hypot(v.x - u.x, v.z - u.z);
    if (dd <= d.heals * 0.8 || dd >= bd) continue;
    bd = dd; best = v;
  }
  return best;
}
function _rtsFixTick(dt) {
  var G = window._rtsG;
  G.fixT = (G.fixT || 0) + dt;
  if (G.fixT < RTS_FIX.every) return;
  G.fixT = 0;
  for (var i = 0; i < G.ents.length; i++) {
    var u = G.ents[i];
    if (u.dead || u.inside || u.type !== 'unit' || !_rtsFixes(u) || !_rtsFixIdle(u)) continue;
    var v = _rtsFixWants(u);
    if (v) _rtsOrderMove(u, v.x, v.z, false);
  }
}
/* The opponent's truck, with nothing damaged near: behind the largest team on the march. */
function _rtsAIFixTick(dt) {
  var G = window._rtsG, big = null, bn = 0, id;
  G.ai.fixT = (G.ai.fixT || 0) + dt;
  if (G.ai.fixT < RTS_FIX.every) return;
  G.ai.fixT = 0;
  for (id in G.teams) {
    var t = G.teams[id];
    if (!t.moving) continue;
    var n = t.members.filter(function (m) { return !m.dead && (rtsUnitDef(m.def) || {}).kind === 'vehicle'; }).length;
    if (n > bn) { bn = n; big = t; }
  }
  var c = big && _rtsTeamCentre(big), home = _rtsHas('enemy', 'yard');
  if (!c || !home) return;
  var dx = home.x - c.x, dz = home.z - c.z, L = Math.hypot(dx, dz) || 1;
  var ax = c.x + dx / L * RTS_FIX.behind * RTS_TILE, az = c.z + dz / L * RTS_FIX.behind * RTS_TILE;
  for (var i = 0; i < G.ents.length; i++) {
    var u = G.ents[i];
    if (u.dead || u.inside || u.side !== 'enemy' || u.type !== 'unit' || !_rtsFixes(u) || !_rtsFixIdle(u)) continue;
    if (_rtsFixWants(u)) continue;                                    /* mending comes first */
    if (Math.hypot(ax - u.x, az - u.z) > RTS_TILE * 3) _rtsOrderMove(u, ax, az, false);
  }
}
/* HAS THE OPPONENT DUG IN ITSELF? A truck is bought after its base has its defences, not before:
   bought on six vehicles alone, the one purchase moved the base plan off its defensive tail on
   seed 9001 - five defences and an Arc Tower became two, in e2e/basedef. */
function _rtsAIDefended() {
  var G = window._rtsG, n = 0;
  for (var i = 0; i < G.ents.length; i++) {
    var e = G.ents[i];
    if (!e.dead && e.side === 'enemy' && e.type === 'struct' && !e.building && (rtsStructDef(e.def) || {}).weapon) n++;
  }
  return n >= RTS_FIX.defended;
}
/* How many vehicles the opponent's field army has. */
function _rtsAIFieldVehicles() {
  var G = window._rtsG, n = 0;
  for (var i = 0; i < G.ents.length; i++) {
    var u = G.ents[i], d = u.type === 'unit' && rtsUnitDef(u.def);
    if (!u.dead && u.side === 'enemy' && d && d.kind === 'vehicle' && d.weapon && !d.harvest) n++;
  }
  return n;
}
