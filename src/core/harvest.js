/* core/harvest.js - the harvester economy: the mine/deliver loop, finding the next ore cell,
   and finding a refinery to unload at. Part of rts.core, the simulation.

   Split out of core/units.js, which had grown past the 500-line ceiling unit/layout enforces.
   It is a clean seam rather than an arbitrary cut: nothing here is called from the per-unit tick
   except _rtsUpdateHarvester itself, which that tick delegates to and returns from. */

function _rtsUpdateHarvester(e, dt, d) {
  var G = window._rtsG;
  if (!e.hstate) { if (e.order !== 'move') _rtsOrderHarvest(e, null, null); }
  if (e.order === 'move' && e.path) { _rtsSteer(e, dt, d); if (!e.path) e.order = null; return; }

  if (e.hstate === 'toField') {
    if (!e.htile || G.scrap[_rtsIdx(e.htile.tx, e.htile.tz)] <= 0) e.htile = _rtsNearestScrap(e);
    if (!e.htile) { e.path = null; return; }                      /* nothing left to mine */
    var wx = _rtsWX(e.htile.tx), wz = _rtsWX(e.htile.tz);
    var away = Math.hypot(e.x - wx, e.z - wz);
    if (away < RTS_TILE * 1.1) { e.path = null; e.hstate = 'mining'; e.noGain = 0; return; }
    /* GIVE UP ON ORE YOU CANNOT REACH. The two conditions that clear htile - the tile running
       dry, and the pathfinder returning nothing - can both stay false for ever while the
       harvester makes no progress at all: A* keeps handing back a path, the steering keeps
       failing on the same cell, and the last-resort unstick drops it back where it started. On
       seed 42 that was 14,762 of 14,769 harvester ticks in 'toField' and zero deliveries in 246
       seconds, which is the whole economy. Distance closed is the honest measure of progress -
       not "did we get a path" - so if the gap has not narrowed in eight seconds, write this tile
       off and pick another. _rtsNearestScrap skips it while `noGo` is set. */
    if (e.bestGap === undefined || away < e.bestGap - 0.25) { e.bestGap = away; e.noGain = 0; }
    else {
      e.noGain = (e.noGain || 0) + dt;
      if (e.noGain > 8) {
        e.noGo = e.noGo || {};
        e.noGo[_rtsIdx(e.htile.tx, e.htile.tz)] = G.t + RTS_HARV_NOGO;
        e.htile = null; e.path = null; e.noGain = 0; e.bestGap = undefined;
        return;
      }
    }
    if (!e.path) {
      e.goal = { x:wx, z:wz }; e.path = _rtsPathFor(e, wx, wz); e.pi = 0;
      /* A FAILED PATH IS AN ANSWER, not a reason to try again next frame. The eight-second
         timer above measures a different fault - a harvester that is moving and not closing -
         and it was the only thing that ever wrote to `noGo`. So a tile the pathfinder had just
         proved unreachable went straight back into the running: htile cleared, _rtsNearestScrap
         hands back the same nearest cell, and A* searches the whole map again. Sixty times a
         second, for eight seconds, per harvester, and again ninety seconds later when the
         blacklist lapsed.

         Measured on a map whose only ore is a 5x5 patch ringed in rock - which is the
         player-supplied-map case, since _rtsMapCheck's flood fill is land-only and starts.js
         passes a map if even ONE ore cell is reachable. A* is not cheap when it FAILS: a search
         that finds nothing has expanded every reachable cell before it gives up.

         Unreachable now is not unreachable for ever - a building may be sold, a wall killed -
         so this uses the same time-limited, per-harvester blacklist the timer does. */
      if (!e.path) {
        e.noGo = e.noGo || {};
        e.noGo[_rtsIdx(e.htile.tx, e.htile.tz)] = G.t + RTS_HARV_NOGO;
        e.htile = null; e.noGain = 0; e.bestGap = undefined;
        return;
      }
    }
    _rtsSteer(e, dt, d);
  } else if (e.hstate === 'mining') {
    var i = _rtsIdx(e.htile.tx, e.htile.tz), take = Math.min(RTS_HARVEST_RATE * dt, G.scrap[i], d.capacity - e.carry);
    G.scrap[i] -= take; e.carry += take;
    /* The hopper holds BAILS; what they are worth depends on what was in the ground. */
    e.carryVal += take * (G.gems[i] ? RTS_GEM_MULT : 1);
    if (G.scrap[i] <= 0.5) { G.scrap[i] = 0; G.gems[i] = 0; G.scrapDirty = true; e.htile = null; e.hstate = 'toField'; }
    if (e.carry >= d.capacity - 0.5) { e.hstate = 'toRef'; e.path = null; }
  } else if (e.hstate === 'toRef') {
    var ref = _rtsNearestRefinery(e);
    if (!ref) { e.path = null; _rtsDockReset(e); return; }
    if (e.dockRef !== ref.id) { _rtsDockReset(e); e.dockRef = ref.id; }
    /* Docking_Coord: a harvester drives to the refinery's DOCK, not its centre. Pathing at
       the centre of a 3x3 building means every harvester aims at a blocked cell, stops
       wherever the crowd stops, and they pile up on whichever side they arrived from.
       `dockGoal` overrides it once the south face has been shown to be unusable - see below. */
    var dock = e.dockGoal || _rtsDockCoord(ref);
    /* Arrive at the dock, but unload from anywhere alongside the building: four harvesters
       converging on one point shove each other back out of a strict dock radius, and the one
       at the back of the queue never finishes its trip. The dock is the destination, not a
       condition. */
    if (Math.hypot(e.x - dock.x, e.z - dock.z) < RTS_TILE * 1.6 || _rtsRangeTo(e, ref) < RTS_TILE * 2.2) {
      e.path = null; e.hstate = 'unload'; e.ref = ref; _rtsDockReset(e); return;
    }
    /* THE DOCK IS ONE CELL AND THE PLAYER IS ALLOWED TO BUILD ON IT. All this branch used to do
       on failure was `if (!e.path) return;`, so a harvester whose refinery had been walled in on
       its south face queued for that one cell for the rest of the match: full hopper, no
       delivery, no second refinery, no message. Measured - same map, same harvester, the only
       difference three silos across the south face - 2,000 ore delivered with the row clear
       against ZERO with it blocked, every sampled tick of two minutes stuck here.

       AND `!e.path` IS THE WRONG TEST FOR IT, which is the part that took a second attempt.
       _rtsPathFor does not return null for an unreachable goal - it hands back a single waypoint
       at the goal itself. _rtsSteer consumes that one waypoint, clears e.path, and the harvester
       has "arrived" ten units short of a dock it can never reach. So there is no path failure to
       notice. The toField branch above learned this already and says so: distance closed is the
       honest measure of progress, not whether a path came back. Same measure here. */
    var gap = _rtsRangeTo(e, ref);
    if (e.dockGap === undefined || gap < e.dockGap - 0.25) { e.dockGap = gap; e.dockStall = 0; }
    else {
      e.dockStall = (e.dockStall || 0) + dt;
      if (e.dockStall > RTS_DOCK_STALL) {
        e.dockStall = 0; e.dockGap = undefined; e.path = null;
        /* First stall: the south face is not working, so try the nearest free cell on any other
           face. Unloading never required the dock - the arrival test above already accepts
           anywhere alongside the building - so the dock is a preference, not a condition. */
        if (!e.dockGoal) {
          e.dockGoal = _rtsApproachCell(e, ref);
          if (e.dockGoal) return;
        }
        /* Second stall, or no free cell at all: this refinery is the wrong one to queue for.
           Same per-harvester, time-limited blacklist the ore tiles use, and for the same reason -
           what blocks it is usually a building or a unit, so it is very likely fine again later,
           and a second refinery may be reachable when the nearest is not. If there is no other
           refinery the harvester waits rather than starving for ever: the entry lapses. */
        e.noDock = e.noDock || {};
        e.noDock[ref.id] = window._rtsG.t + RTS_HARV_NOGO;
        _rtsDockReset(e);
        return;
      }
    }
    e.rep = (e.rep || 0) - dt;
    if (!e.path || e.rep <= 0) { e.goal = { x:dock.x, z:dock.z }; e.path = _rtsPathFor(e, dock.x, dock.z); e.pi = 0; e.rep = 1.5; if (!e.path) return; }
    _rtsSteer(e, dt, d);
  } else if (e.hstate === 'unload') {
    if (!e.ref || e.ref.dead) { e.hstate = 'toRef'; return; }
    var give = Math.min(RTS_UNLOAD_RATE * dt, e.carry);
    var pay = e.carry > 0 ? e.carryVal * (give / e.carry) : 0;
    e.carry -= give; e.carryVal = Math.max(0, e.carryVal - pay);
    /* Harvested_Money, not a credit deposit: this is the one income in the game that goes
       into the STORE, so it is the one the Storage cap can refuse. */
    var lost = _rtsHarvested(G.sides[e.side], pay);
    if (lost > 0 && e.side === 'player') _rtsSiloWarn(G.sides[e.side]);
    if (e.carry <= 0.5) { e.carry = 0; e.carryVal = 0; e.hstate = 'toField'; }
  }
}
/* Nearest deposit, with gems worth a detour. The score is the WHOLE trip - out to the tile
   and back to the refinery - divided by what a load from it is worth, so a harvester will
   pass a nearer ore patch for gems only when the longer haul actually pays. Scoring on the
   one-way distance instead sends harvesters chasing gems across the map and drops income:
   mining takes about four seconds, the drive takes most of a minute. */
/* How long a harvester writes a tile off for. Time-limited and per harvester rather than global
   and permanent: the obstruction is often a building or a unit, so the tile is very likely fine
   again later, and a harvester approaching from another side may have no trouble with it now. */
var RTS_HARV_NOGO = 90;
function _rtsNearestScrap(e) {
  var G = window._rtsG, best = null, bs = 1e9;
  var ref = _rtsNearestRefinery(e);
  var rx = ref ? ref.x : e.x, rz = ref ? ref.z : e.z;
  for (var tz = 0; tz < RTS_N; tz++) for (var tx = 0; tx < RTS_N; tx++) {
    var i = _rtsIdx(tx, tz);
    if (G.scrap[i] <= 0) continue;
    /* Tiles this harvester has already spent eight seconds failing to reach. Per harvester and
       time-limited rather than global and permanent: the reason is usually a unit or a building
       in the way, so the tile is very likely fine again later - and another harvester coming
       from a different direction may have no trouble with it at all. */
    if (e.noGo && e.noGo[i] > G.t) continue;
    var wx = _rtsWX(tx), wz = _rtsWX(tz);
    var trip = Math.hypot(wx - e.x, wz - e.z) + Math.hypot(wx - rx, wz - rz);
    /* The detour is weighted by a CAPPED preference, not by the raw value ratio. Once a gem
       step was correctly priced at four times GemValue, dividing the trip by the full 12.6x
       meant a gem tile twelve times further away scored the same as ore underfoot - every
       harvester on the map beelined for the middle, stripped it, and got rich. The Recruit
       AI went from 15 units to 60 and the difficulty ladder collapsed into one rung.
       Goto_Tiberium in the original just takes the CLOSEST patch; preferring gems at all is
       this game's idea, so bounding that preference is this game's job. */
    var s = trip / (G.gems[i] ? RTS_GEM_DETOUR : 1);
    if (s < bs) { bs = s; best = { tx:tx, tz:tz }; }
  }
  return best;
}
/* BUILDING.H Docking_Coord: the point a harvester actually parks at. South face of the
   refinery, one tile clear of the footprint - the same side the free harvester exits from. */
function _rtsDockCoord(ref) {
  var d = rtsStructDef(ref.def);
  return { x:_rtsWX(ref.tx) + (d.w - 1) * RTS_TILE / 2, z:_rtsWX(ref.tz + d.h) };
}
/* How long a harvester queues for a dock it is not getting any closer to. The same eight
   seconds the toField branch allows, for the same reason: long enough that ordinary traffic
   around a busy refinery does not trip it, short enough that a real obstruction costs one trip
   rather than the match. */
var RTS_DOCK_STALL = 8;
function _rtsDockReset(e) {
  e.dockGoal = null; e.dockGap = undefined; e.dockStall = 0; e.dockRef = null;
}
/* A WAY IN THAT IS NOT THE DOCK. The ring of cells just outside a building's footprint, nearest
   to the unit first, skipping anything already blocked - the first one is the harvester's next
   guess at how to get alongside.

   Deliberately NOT verified with the pathfinder before returning: _rtsPathFor answers a single
   waypoint at the goal for an unreachable target rather than null, so asking it "can I get here"
   returns yes for cells that are walled off. The stall timer is what actually decides, and a cell
   that turns out to be no better trips it a second time and blacklists the refinery. */
function _rtsApproachCell(e, s) {
  var d = rtsStructDef(s.def), best = null, bd = 1e9, ox, oz;
  for (ox = -1; ox <= d.w; ox++) for (oz = -1; oz <= d.h; oz++) {
    if (ox >= 0 && ox < d.w && oz >= 0 && oz < d.h) continue;   /* the perimeter, not the footprint */
    var tx = s.tx + ox, tz = s.tz + oz;
    if (!_rtsInB(tx, tz) || _rtsBlocked(tx, tz, e)) continue;
    var wx = _rtsWX(tx), wz = _rtsWX(tz), dist = Math.hypot(wx - e.x, wz - e.z);
    if (dist < bd) { bd = dist; best = { x:wx, z:wz }; }
  }
  return best;
}
function _rtsNearestRefinery(e) {
  var G = window._rtsG, best = null, bd = 1e9;
  for (var i = 0; i < G.ents.length; i++) {
    var o = G.ents[i];
    if (o.type !== 'struct' || o.def !== 'refinery' || o.side !== e.side || o.dead || o.building) continue;
    /* One this harvester has just proved it cannot reach any face of. Skipped rather than
       preferred-against, so a second refinery is tried properly; the entry lapses on its own. */
    if (e.noDock && e.noDock[o.id] > window._rtsG.t) continue;
    var d = _rtsDist(e, o);
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}
