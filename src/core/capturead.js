/* core/capturead.js - the opponent's side of MISSION_CAPTURE: is there a building worth
   taking, and which one. Part of rts.core, the simulation.

   The engineer was a player-only verb. _rtsCapture has always been side-agnostic and the unit
   tick has always driven a `capture` order for whoever holds it, but nothing ever gave the
   opponent one, and rules/ai.js said why in as many words: "capturing is a decision about a
   specific building at a specific moment, and an AI that buys engineers without a plan for
   them just donates 600 credits to whatever shoots them first". That was true. This file is
   the plan, and it is the same shape as _rtsAIWorthCrossing next door: a question asked of the
   map, cached, with the purchase gated on the answer rather than on a die roll. */

/* WHAT A BUILDING IS WORTH TAKING. Not what it is worth SHOOTING - _rtsEvalObject already
   answers that one, and it answers it wrongly for this question in two ways that matter.

   It scores Math.max(cost, hp), which puts the Missile Silo, the Chronosphere, the Iron
   Curtain and the GPS Uplink at the top of the player's building list - and all four carry
   `capturable:false`, so aiming an engineer at any of them ends with the order dropped at the
   wall and the engineer standing there until something shoots it.

   And it scores the Construction Yard at its `cost`, which is ZERO: it is the one building
   never bought, so a table keyed on price values the best capture in the game below a Power
   Plant. Taking the yard takes the player's ability to rebuild anything, which is why it is
   named here rather than derived. */
function _rtsCaptureWorth(b) {
  var d = rtsStructDef(b.def);
  if (!d) return 0;
  var w = d.cost || 0;
  if (b.def === 'yard') w = RTS_CAP_YARD_WORTH;
  /* A building that produces is worth more than its price says, because taking it takes the
     line as well as the shell - and the previous owner cannot replace what it can no longer
     build. Same reasoning the `factories` quarry is built on. */
  if (d.produces) w *= RTS_CAP_FACTORY_MULT;
  return w;
}
/* ...and what it will COST to get there, in the only currency that matters to an unarmed
   45-hp walker: guns pointed at the approach. Every player defence whose range covers the
   building is one more thing that shoots the engineer on the way in, and the engineer cannot
   shoot back, go prone or step aside (`fraidy:false`, `weapon:null`), so this is not a risk to
   be balanced against the prize - past a couple of guns it is a certainty. */
function _rtsCaptureGuns(b) {
  var G = window._rtsG, n = 0;
  for (var i = 0; i < G.ents.length; i++) {
    var e = G.ents[i];
    if (e.dead || e.side !== 'player' || e.type !== 'struct') continue;
    var sd = rtsStructDef(e.def);
    if (!sd || !sd.weapon) continue;
    var w = RTS_WEAPONS[sd.weapon];
    if (!w) continue;
    if (Math.hypot(e.x - b.x, e.z - b.z) <= w.range + RTS_TILE * 2) n++;
  }
  return n;
}
/* The best building on the map to send an engineer at, or null when there is not one worth the
   walk. Every clause here is a way the walk ends with nothing:

     capturable   - the six that are not would drop the order at the wall
     not selling  - _rtsCapture refuses a sale in progress and the engineer is spent anyway
     not building - a structure still going up moves no power until it finishes
     reachable    - on FOOT, from the opponent's own base. _rtsPath answers this honestly now;
                    before the landing work it returned a one-waypoint path for an unreachable
                    goal, and every caller read that as "there is a road"
     guns         - past RTS_CAP_MAX_GUNS the engineer does not arrive, so the prize is moot */
function _rtsAICaptureTarget() {
  var G = window._rtsG, best = null, bv = 0;
  var home = _rtsHasHome('enemy', 'yard') || _rtsHasHome('enemy', 'factory')
          || _rtsHasHome('enemy', 'barracks');
  if (!home) return null;
  for (var i = 0; i < G.ents.length; i++) {
    var b = G.ents[i];
    if (b.dead || b.side !== 'player' || b.type !== 'struct') continue;
    if (b.selling || b.building) continue;
    if (!rtsCapturable(b.def)) continue;
    var worth = _rtsCaptureWorth(b);
    if (worth < RTS_CAP_MIN_WORTH) continue;
    if (_rtsCaptureGuns(b) > RTS_CAP_MAX_GUNS) continue;
    /* THE PRIZE IS DISCOUNTED BY THE WALK, because an engineer that does not arrive is worth
       nothing at all and the walk is where they mostly do not arrive. A capture is the slowest
       play in the game - one 6.5-speed unit crossing whatever the map puts between the two
       bases - so a nearer building worth somewhat less is usually the better buy, and the
       ranking should say so rather than always reaching for the richest thing on the map.

       Traced on seed 7: the richest capturable target was the player's Command Yard, ninety
       tiles away, and the engineer was still seven tiles short when the match ended. Nothing
       was broken - it walked the whole way without a stall - it simply lost the race to the
       opponent's own tanks. */
    var score = worth / (1 + Math.hypot(b.x - home.x, b.z - home.z) / RTS_CAP_WALK_SCALE);
    /* Rank before pathing, so the expensive test runs on the leader rather than on every
       building the player owns. A* over half a map is not free and this runs on a timer. */
    if (score <= bv) continue;
    var spot = _rtsNearestOpen(_rtsTX(b.x), _rtsTX(b.z), 6, null);
    if (!spot) continue;
    if (!_rtsPath(home.x, home.z, _rtsWX(spot[0]), _rtsWX(spot[1]), null)) continue;
    bv = score; best = b;
  }
  return best;
}
/* IS CAPTURING WORTH IT? The gate, cached for RTS_CAP_RECHECK seconds because the answer moves
   only when a building does and the reachability test walks the map.

   Deliberately NOT cached as a boolean alone: the team's capture leg wants the building the
   gate found, and re-deriving it there would let the two disagree - the purchase justified by
   a Refinery, the walk aimed at a Power Plant. One answer, one place. */
function _rtsAIWorthCapturing() {
  var G = window._rtsG;
  if (!G || !G.ai) return false;
  if (G.ai.capT != null && G.t - G.ai.capT < RTS_CAP_RECHECK) {
    /* A cached target that has since died, been sold or already changed hands is not an
       answer, and waiting out the rest of the recheck on it would aim the leg at a corpse. */
    var c = G.ai.capTgt;
    if (!c || c.dead || c.selling || c.side !== 'player') { G.ai.capT = null; }
    else return true;
  }
  G.ai.capT = G.t;
  G.ai.capTgt = null;
  if (!_rtsCanProduce('enemy', 'engineer')) return false;
  /* NOT BEFORE THE HOUSE IS AWAKE. The Snatch team is `autocreate`, so Suggested_New_Team will
     not raise one until the alert - but nothing gated the PURCHASE, and the gate opens in the
     opening seconds, when the player owns two undefended buildings and nothing is covering
     anything. So the opponent would buy its engineer minutes before it could field a team to
     use it, and it would stand in the base until then. Buying a unit for a plan means not
     buying it before the plan can exist. */
  if (!_rtsHouseAlerted()) return false;
  G.ai.capTgt = _rtsAICaptureTarget();
  return !!G.ai.capTgt;
}
/* Engineers the opponent has, ALIVE - not "engineers currently busy", which is the version this
   started as and which is wrong in a way worth recording, because it looks more careful.

   The reasoning for counting only employed ones was that every path stripping a capture order
   leaves the engineer alive and idle - a suspended team, a sold target, an unreachable one -
   so a live count would let one idle engineer hold the cap closed for the rest of the match.
   True, but the cure is worse: an idle engineer is invisible to a busy count, so the gate
   simply buys another, and another. The team can only be raised once the house is alerted,
   which is minutes after the gate first opens, and in that window nothing is employed at all.
   The cap that was supposed to bound the waste would have been counting zero the whole time.

   Live it is, and the blockage it was supposed to avoid does not happen: _rtsTeamCanAdd takes
   any loose unit whose def the type wants, so the next Snatch team raised recruits the idle
   engineer rather than needing a new one. The cap unblocks itself. */
function _rtsAIEngineers() {
  var G = window._rtsG, n = 0;
  for (var i = 0; i < G.ents.length; i++) {
    var e = G.ents[i];
    if (e.dead || e.side !== 'enemy' || e.type !== 'unit' || e.def !== 'engineer') continue;
    n++;
  }
  return n;
}
