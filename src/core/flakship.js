/* core/flakship.js - the Flak Cruiser: an umbrella that sails with the fleet.

   The verb is ESCORT AT SEA. Its guns (`shipflak`) touch nothing but aircraft, so on its own it
   is a hull that does nothing; its worth is entirely in what it sails beside. So, left idle, it
   keeps station on the nearest ship of its own side within RTS_ESCORT.reach cells - never on
   another escort, or two would chase each other round the bay - sailing to within
   RTS_ESCORT.close cells of it whenever it falls further behind. It sails there on an
   attack-move, so it fires at whatever flies over on the way. An order of the player's always
   comes first: the station is taken up again only once it is idle.

   The opponent buys one only against aircraft, one for every two the player flies, as it does
   the Flak Track (rules/ai.js `vsAir`); the escorting is the same for both sides. */

var RTS_ESCORT = { reach: 14, close: 3, every: 1 };

function _rtsEscorts(u) { return !!(rtsUnitDef(u.def) || {}).escorts; }
/* the ship it keeps station on: of its side's within reach that are not escorts, the nearest
   one UNDER WAY - sailing, or in a team on the march - and only if none is, the nearest at all.
   The umbrella goes where the fleet goes, not to whichever hull happens to be parked closest. */
function _rtsEscortOf(e) {
  var G = window._rtsG, best = null, bd = 1e9, busy = false;
  for (var i = 0; i < G.ents.length; i++) {
    var o = G.ents[i];
    if (o === e || o.dead || o.inside || o.side !== e.side || o.type !== 'unit') continue;
    var d = rtsUnitDef(o.def) || {};
    if (!d.sea || d.escorts) continue;
    var dd = Math.hypot(o.x - e.x, o.z - e.z);
    if (dd > RTS_ESCORT.reach * RTS_TILE) continue;
    var going = !!(o.path && o.pi < o.path.length) || !!(o.sqd != null && G.teams && G.teams[o.sqd] && G.teams[o.sqd].moving);
    if (going && !busy) { busy = true; bd = 1e9; }
    if (busy && !going) continue;
    if (dd < bd) { bd = dd; best = o; }
  }
  return best;
}
function _rtsEscortTick(dt) {
  var G = window._rtsG;
  G.escT = (G.escT || 0) + dt;
  if (G.escT < RTS_ESCORT.every) return;
  G.escT = 0;
  for (var i = 0; i < G.ents.length; i++) {
    var e = G.ents[i];
    if (e.dead || e.type !== 'unit' || !_rtsEscorts(e)) continue;
    var ours = e.order === 'amove' && e.esc && e.goal === e.esc;
    if (e.order && !ours) continue;                                   /* its own orders first */
    var s = _rtsEscortOf(e);
    if (!s) continue;
    var d = Math.hypot(s.x - e.x, s.z - e.z);
    if (d <= RTS_ESCORT.close * RTS_TILE) continue;
    /* to just off its quarter, on the side it is coming from */
    var k = (RTS_ESCORT.close - 1) * RTS_TILE / d, x = s.x + (e.x - s.x) * k, z = s.z + (e.z - s.z) * k;
    if (ours && Math.hypot(e.goal.x - x, e.goal.z - z) < RTS_TILE && e.path && e.pi < e.path.length) continue;
    var p = _rtsPathFor(e, x, z);
    if (!p) continue;
    e.order = 'amove'; e.esc = e.goal = { x: x, z: z }; e.path = p; e.pi = 0; e.target = null;
  }
}
