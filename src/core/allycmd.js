/* core/allycmd.js - the player's orders to a computer ally (the `ally` seat, rules/skirmish.js).
   Part of rts.core, the simulation.

   Two orders and a release, kept on the ally's brain as plain data (G.sides.ally.ai.cmd) so a save
   carries them:

     ATTACK   its fighting army attack-moves to a point - the player's view, in the page - and
              fights everything on the way, for RTS_ALLY_CMD.attackFor seconds, then the brain
              goes back to its own plans
     DEFEND   the same army attack-moves to the player's base and stays there until released
     FREE     the order is dropped at once

   While an order stands the brain still builds, harvests and spends, but raises no teams and
   sends no escorts (core/aisupers.js): those would pull the same units back to its own war. The
   teams it had are disbanded when the order is given, so their members answer it. */

var RTS_ALLY_CMD = {
  every: 3,          /* seconds between re-aims, as an escort's (core/escorts.js) */
  attackFor: 120,    /* an attack order runs this long */
  near: 4            /* cells: close enough to the point to stop walking and hold */
};

/* The order, from the player. kind 'attack' needs the point in world units; 'defend' and 'free'
   take none. Returns false when there is no ally to give it to. */
function _rtsAllyCommand(kind, x, z) {
  var G = window._rtsG, S = G && G.sides && G.sides.ally;
  /* a seat the computer holds, thinking ('ai') or held still by a mission ('none') - never the human's */
  if (!S || S.lost || S.ctl === 'human' || !S.ai) return false;
  if (kind === 'free') { S.ai.cmd = null; _rtsSay('Ally: acting on its own again.'); return true; }
  if (kind === 'defend') {
    var c = _rtsBaseCentre('player');
    if (!c) return false;
    x = c.x; z = c.z;
  } else if (kind !== 'attack' || typeof x !== 'number' || typeof z !== 'number') return false;
  S.ai.cmd = { kind: kind, x: x, z: z, t0: G.t, next: 0 };
  /* its teams are disbanded, so every fighter it has answers */
  _rtsAIAs('ally', function () {
    for (var id in (G.teams || {})) if (_rtsTeamMine(G.teams[id])) _rtsTeamDisband(G.teams[id]);
  });
  _rtsSay(kind === 'attack' ? 'Ally: moving to attack.' : 'Ally: falling back to defend your base.');
  return true;
}
/* The ally's fighters: on the ground, armed, not a harvester, ship or support vehicle. */
function _rtsAllyFighter(u) {
  if (u.dead || u.side !== 'ally' || u.type !== 'unit' || u.air || u.inside) return false;
  var d = rtsUnitDef(u.def);
  return !!(d && d.weapon && !d.harvest && !d.sea && !_rtsSupportDriven(d));
}
/* Called from the ally's brain each tick (core/aisupers.js). True while an order stands, which is
   what tells the brain to hold its teams and escorts. */
function _rtsAllyCmdTick(dt) {
  var G = window._rtsG, S = G.sides[_rtsAIOn], c = S && S.ai && S.ai.cmd;
  if (!c) return false;
  if (c.kind === 'attack' && G.t - c.t0 > RTS_ALLY_CMD.attackFor) { S.ai.cmd = null; return false; }
  c.next -= dt;
  if (c.next > 0) return true;
  c.next = RTS_ALLY_CMD.every;
  var n = 0;
  for (var i = 0; i < G.ents.length; i++) {
    var u = G.ents[i];
    if (!_rtsAllyFighter(u)) continue;
    n++;
    if (u.target && !u.target.dead && _rtsHostile(u.target.side, u.side)) continue;   /* busy fighting */
    var ox = ((n % 5) - 2) * RTS_TILE * 1.2, oz = (((n / 5) | 0) % 5 - 2) * RTS_TILE * 1.2;   /* a frontage */
    if (Math.hypot(u.x - c.x - ox, u.z - c.z - oz) < RTS_ALLY_CMD.near * RTS_TILE) continue;
    _rtsOrderMove(u, c.x + ox, c.z + oz, true);
  }
  return true;
}
