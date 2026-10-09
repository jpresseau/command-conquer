/* core/spotter.js - the Spotter: eyes for the long guns.

   The verb is SEEING FOR OTHERS. Fog and the Fog Bank shorten what every eye sees and how far
   every gun looks for a target (core/skyplay.js, core/wxsupers.js); the long guns - artillery,
   rocket artillery, the cruisers, the towers - are the ones that lose most by it. The Spotter
   is the answer:

     IT SEES THROUGH   its own sight disc is never capped by fog, a sandstorm or a fog bank, and
                       what it sees in a fog bank is not hidden from it (_rtsVisTick)
     IT SPOTS          anything inside its sight is SPOTTED for its side: every gun of that side
                       finds a spotted target at its full reach, fog or no fog (_rtsFindTarget)

   G.spot holds, per side, the discs its spotters see this tick - plain numbers, built once a tick
   (_rtsSpotTick), so the many questions a target search asks cost a short loop each.

   The opponent buys one when its long guns are fighting blind - under fog or a sandstorm with a
   long gun to see for (_rtsAISupport, core/aimines.js) - and keeps it a few cells ahead of the
   nearest of them, toward the player's base. */

var RTS_SPOT = { ahead: 4, every: 2 };

function _rtsSpots(u) { return !!(rtsUnitDef(u.def) || {}).spots; }
function _rtsSpotTick() {
  var G = window._rtsG, sp = { player: [], enemy: [] };
  for (var i = 0; i < G.ents.length; i++) {
    var u = G.ents[i];
    if (u.dead || u.inside || u.type !== 'unit' || !sp[u.side] || !_rtsSpots(u)) continue;
    sp[u.side].push({ x: u.x, z: u.z, r: rtsSightTiles(rtsUnitDef(u.def)) * RTS_TILE });
  }
  G.spot = sp;
}
/* Is `o` inside the sight of a spotter of `side`? */
function _rtsSpotted(o, side) {
  var G = window._rtsG, L = G && G.spot && G.spot[side];
  if (!L || !L.length) return false;
  for (var i = 0; i < L.length; i++) if (Math.hypot(o.x - L[i].x, o.z - L[i].z) <= L[i].r) return true;
  return false;
}

/* A long gun: anything that shoots further than it would otherwise see in fog. */
function _rtsLongGun(u) {
  var d = rtsUnitDef(u.def) || {}, w = d.weapon && RTS_WEAPONS[d.weapon];
  return !!(w && w.range > RTS_FOG_CELLS * RTS_TILE && !d.air);
}
function _rtsAILongGuns() {
  var G = window._rtsG, n = 0;
  for (var i = 0; i < G.ents.length; i++) { var u = G.ents[i]; if (!u.dead && u.side === _rtsAIOn && u.type === 'unit' && _rtsLongGun(u)) n++; }
  return n;
}
/* The opponent's spotter: a few cells ahead of the nearest long gun, toward the player's base. */
function _rtsAISpotTick(dt) {
  var G = window._rtsG;
  G.ai.spotT = (G.ai.spotT || 0) + dt;
  if (G.ai.spotT < RTS_SPOT.every) return;
  G.ai.spotT = 0;
  var py = _rtsHas(_rtsAIFoe(), 'yard');
  if (!py) return;
  for (var i = 0; i < G.ents.length; i++) {
    var s = G.ents[i];
    if (s.dead || s.inside || s.side !== _rtsAIOn || s.type !== 'unit' || !_rtsSpots(s)) continue;
    if (_rtsOrbits(s)) continue;                       /* the Recon Drone is the drone tick's: core/drone.js */
    if (s.mend != null) continue;                      /* on its way to the depot: core/aimend.js */
    if (s.order === 'attack' && s.target && !s.target.dead) continue;          /* defending itself */
    var gun = null, gd = 1e9;
    for (var k = 0; k < G.ents.length; k++) {
      var u = G.ents[k];
      if (u.dead || u.inside || u.side !== _rtsAIOn || u.type !== 'unit' || !_rtsLongGun(u)) continue;
      var d = Math.hypot(u.x - s.x, u.z - s.z);
      if (d < gd) { gd = d; gun = u; }
    }
    if (!gun) continue;
    var dx = py.x - gun.x, dz = py.z - gun.z, L = Math.hypot(dx, dz) || 1;
    var ax = gun.x + dx / L * RTS_SPOT.ahead * RTS_TILE, az = gun.z + dz / L * RTS_SPOT.ahead * RTS_TILE;
    if (Math.hypot(ax - s.x, az - s.z) > RTS_TILE * 2) _rtsOrderMove(s, ax, az, false);
  }
}
