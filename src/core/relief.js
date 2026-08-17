/* core/relief.js - what the height of the ground MEANS to the simulation. Part of rts.core.

   The battlefield got relief, and for two changes the sim could not tell. Height was a
   property of the map that only the renderer read - which was deliberate, and is written up
   at length in core/grid.js: nothing in pathing, combat, harvesting or sight consulted it, so
   no balance could move and no generated map could be cut in two by ground that had not been
   there before. This file is where that stops being true, on purpose, and every number in it
   was picked off a measurement rather than off taste.

   ------------------------------------------------------------------------------------------
   WHAT THE MEASUREMENTS SAID, INCLUDING THE RULE THEY KILLED.

   The obvious first rule - STEEP GROUND IS IMPASSABLE, so ramps become the only way up - is
   not here, and cannot be. core/terrain.js finishes with four passes that stop any cell
   standing more than 85/255 above its lowest neighbour, which QUANTISES the slope: measured
   over eight seeds, the 90th percentile of slope on open ground is 0.417 and the maximum is
   0.589, on every single seed. There are essentially two slopes on the map, flat and the cap.
   So no threshold separates a cliff from a ramp - a ramp IS ground at the cap - and blocking
   above 0.30, 0.35 and 0.40 all block the same cells. What that does to the map:

       reachable ground from the player's start, as a share of what it was
       slope > 0.30   15% .. 35%      slope > 0.35   15% .. 35%      slope > 0.40   15% .. 35%

   The map cut into quarters, identically at every threshold. The generator ALREADY draws the
   distinction properly and does it with rock: the ridge is laid along the plateau contour only
   where a second mask allows, so a walled stretch is a cliff and a bare stretch is a ramp.
   That rule exists, it works, and a slope test would only fight it.

   WHAT DOES HAVE REACH IS THE GROUND UNITS CROSS. Sampling every unit every ten seconds of a
   match, the share standing on ground above half height ran 2.9%, 4.5%, 13.3% and 32.8% on
   four seeds - relief is not scenery the army walks past, it is ground the army is on. But
   fighting is not: bases are placed on the flat (seven of eight base sites at height zero),
   the opponent walks at the base, and 90% of all shots fired were between two things at
   EXACTLY the same height. So the rules that bite are about crossing terrain, and a rule about
   shooting across it is nearly a no-op. Both are here, sized accordingly.

   AND ONE WARNING ABOUT THAT LAST FIGURE, because it was nearly read the wrong way round. The
   first engagement probe reported that no shot in 729 was ever fired by the HIGHER of the two
   parties - 0.0%, not "rare" - which looked like a fact about terrain and was a fact about the
   harness: it drove the idle ladder, where the player builds nothing, so only the opponent
   ever fires. Level ground is real; the perfect asymmetry was the probe. */

/* How high an observer's eye sits above the ground it stands on. Only sight uses it, and it is
   what stops a unit being blinded by the cell it is standing on: at eye level 0 every slope
   above the observer occludes everything behind it including its own far side. 1.5 is a little
   under half a tile - a tank commander's head, not a spotter tower. */
var RTS_EYE = 1.5;

/* ------------------------------------------------------------------- climbing --
   The uphill component of a step, in world units, and the two things it is spent on.

   RTS_CLIMB_SLOW is how much a climb costs a unit's speed. A unit crossing the cap slope
   (0.417) climbs 1.67 world units per cell, and at 1.6 that lands it at 1/(1+0.667) = 0.60 of
   its rated speed - a ramp is visibly a ramp. The floor stops the sum running away on the one
   diagonal corner case the terrain allows (0.589, which would otherwise reach 0.51).

   DOWNHILL IS NOT A BONUS, and that is not an oversight. Free speed downhill makes a unit
   oscillate at the crest - fast into the dip, slow out of it - and, worse, makes the fastest
   route between two points on the flat a detour through a hollow. Uphill only is monotone:
   the flat route is never slower than a route with climb in it.

   RTS_CLIMB_COST is the same idea inside A*, in units of "how many flat cells is one world
   unit of climb worth". At 0.6, one full step up (1.67 units) costs 1.0 - a climbed cell costs
   what two flat cells cost. That is enough to send a unit round a knoll or along to a ramp,
   and far too little to send it round the map: the longest detour it can ever justify is two
   cells per cell of climb avoided. */
var RTS_CLIMB_SLOW = 1.6;
var RTS_CLIMB_MIN  = 0.55;
var RTS_CLIMB_COST = 0.6;

/* The climb from one world point to another: the rise, or zero if it falls. */
function _rtsClimb(x0, z0, x1, z1) {
  return Math.max(0, _rtsElev(x1, z1) - _rtsElev(x0, z0));
}

/* The speed multiplier for a unit at (x,z) heading in direction (dx,dz), which need not be
   normalised. Sea and air are exempt: a boat has no ground under it and _rtsElev would hand it
   the seabed, and an aircraft is not on the ground at all. */
function _rtsClimbSpeed(e, x, z, dx, dz) {
  if (!e || e.air) return 1;
  var d = (e.type === 'unit') ? rtsUnitDef(e.def) : null;
  if (d && d.sea) return 1;
  var l = Math.hypot(dx, dz);
  if (!l) return 1;
  /* Sampled a whole cell ahead rather than at the sub-step the unit is about to take: a step
     is a few hundredths of a tile, and a difference read over that distance is the bilinear's
     own interpolation, not the shape of the ground. */
  var rise = _rtsClimb(x, z, x + dx / l * RTS_TILE, z + dz / l * RTS_TILE);
  return Math.max(RTS_CLIMB_MIN, 1 / (1 + RTS_CLIMB_SLOW * rise / RTS_TILE));
}

/* ---------------------------------------------------------------- the horizon --
   Whether an observer at (tx,tz) can see each cell around it, as a flat Uint8Array over the
   (2r+1) square. The ground itself is the only occluder - a building is not tall enough to
   hide a hillside behind it and RA never had one hide anything.

   ONE PASS, OUTWARDS, each cell inheriting the steepest slope its ray has climbed so far. The
   alternative - walking a fresh ray to every cell - is the same answer for ten times the work,
   and this runs on every unit and every structure the player owns at 15 Hz. A cell's PARENT is
   the cell one step closer to the observer along its own ray: its offset scaled by (r-1)/r and
   rounded. WHICH ORDER "outwards" MEANS is the whole correctness of the pass and is not the
   obvious choice - see the note above _rtsHorizon.

   The test is the classic horizon: the cell is seen if the slope from the eye to its GROUND is
   at least the steepest slope already climbed on that ray. Flat ground never occludes itself -
   slope rises from -eye/d toward zero as distance grows, so each cell beats the last - which
   is what makes a flat map read exactly as it did before this file existed.

   IT IS NOT SYMMETRIC WITH BEING SEEN, and the interesting case is the one that surprised the
   probe: an observer in the middle of a plateau is occluded MORE than one in a valley (17-30%
   of its disc against 11-17%), because its own plateau lip hides the ground below and beyond.
   That is right, and it is the tactical content of the rule - to see down off high ground you
   have to go to the edge of it. The compensation for standing high is RTS_ELEV_SIGHT below,
   which is a bigger disc, not a clearer one. */
/* ONE BUFFER AT THE MAXIMUM RANGE, indexed off a fixed centre rather than off the range of the
   sweep currently running. Sizing it per call is the obvious thing and it is a trap: the stride
   would change with the range, so a short-sighted infantryman sweeping after a Cruiser would
   read the Cruiser's slopes through its own arithmetic. RTS_SIGHT_MAX caps every range, so one
   21x21 buffer serves them all and the stride is a constant.

   IT IS NEVER CLEARED, because it never needs to be: every cell is written before anything
   reads it. That rests entirely on the walk order below, which is the part that was wrong the
   first time and is worth stating precisely. */
var _RTS_HZ = null, _RTS_HZ_V = null;

/* One cell of the sweep: inherit the ray's steepest slope so far from the parent, decide, pass
   it on. Kept out of the loop rather than inlined so the walk below reads as a walk. */
function _rtsHzStep(hz, vis, w, c, tx, tz, eye, dx, dz) {
  var k = (dz + c) * w + (dx + c);
  var r = (Math.abs(dx) > Math.abs(dz)) ? Math.abs(dx) : Math.abs(dz);
  var px = Math.round(dx * (r - 1) / r), pz = Math.round(dz * (r - 1) / r);
  var ph = hz[(pz + c) * w + (px + c)];
  var s = (_rtsTileElev(tx + dx, tz + dz) - eye) / (Math.sqrt(dx * dx + dz * dz) * RTS_TILE);
  vis[k] = (s >= ph - 1e-6) ? 1 : 0;
  hz[k] = (s > ph) ? s : ph;
}

/* CHEBYSHEV RINGS - square rings, one cell wide, walked outwards - and NOT the ring table
   _rtsSightFrom uses. That table is ordered by ROUNDED EUCLIDEAN distance, and a parent is
   picked by Chebyshev radius, so the two orders disagree: (2,-4) is at Euclidean 4.47 and its
   parent (2,-3) at 3.61, which both round to ring 4, and within ring 4 the table emits the
   child first. Brute-forced over every offset at every range: 16 of 1196 parent lookups read a
   cell the sweep had not written yet. The failure was quiet - those cells fell back to "nothing
   occluding" and leaked about 1% of the disc visible - which is exactly why it survived being
   reasoned about instead of checked.

   A Chebyshev walk cannot have that problem. The parent of a cell at ring r is that cell scaled
   by (r-1)/r, whose dominant axis is exactly r-1 - so the parent is always in the ring
   immediately inside, always already written, for every cell and every range. e2e/highground
   asserts it directly rather than trusting this paragraph.

   The whole SQUARE is swept, not just the disc, because the caller does the circular filtering
   and a square has no cells to special-case. 441 cells at the maximum range against 317 for the
   circle: the sweep costs about 6us either way and this way there is nothing to get wrong. */
function _rtsHorizon(tx, tz, range) {
  var w = RTS_SIGHT_MAX * 2 + 1, c = RTS_SIGHT_MAX;
  if (!_RTS_HZ) { _RTS_HZ = new Float32Array(w * w); _RTS_HZ_V = new Uint8Array(w * w); }
  var hz = _RTS_HZ, vis = _RTS_HZ_V;
  var eye = _rtsTileElev(tx, tz) + RTS_EYE;
  hz[c * w + c] = -1e9; vis[c * w + c] = 1;          /* the cell underfoot occludes nothing */
  for (var r = 1; r <= range; r++) {
    for (var i = -r; i <= r; i++) {
      _rtsHzStep(hz, vis, w, c, tx, tz, eye, i, -r);
      _rtsHzStep(hz, vis, w, c, tx, tz, eye, i, r);
      if (i > -r && i < r) {
        _rtsHzStep(hz, vis, w, c, tx, tz, eye, -r, i);
        _rtsHzStep(hz, vis, w, c, tx, tz, eye, r, i);
      }
    }
  }
  return vis;
}
/* Where a (dx,dz) offset lands in the buffer above. Callers must not do this arithmetic
   themselves - the stride is the whole reason the buffer is a fixed size. */
function _rtsHorizonAt(vis, dx, dz) {
  return vis[(dz + RTS_SIGHT_MAX) * (RTS_SIGHT_MAX * 2 + 1) + (dx + RTS_SIGHT_MAX)];
}

/* The total CLIMB along a straight line, in world units - every rise summed, falls ignored.
   Sampled half a tile at a time, which is fine enough to catch a ridge crossed at a corner and
   coarse enough that the string-puller can afford to ask about it. */
function _rtsLineClimb(x0, z0, x1, z1) {
  var n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / (RTS_TILE * 0.5)));
  var acc = 0, ph = _rtsElev(x0, z0);
  for (var i = 1; i <= n; i++) {
    var t = i / n, h = _rtsElev(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t);
    if (h > ph) acc += h - ph;
    ph = h;
  }
  return acc;
}
/* How much extra climb a straightened shortcut may carry before it is refused. A tenth of a
   step: enough that the bilinear's own wobble across a flat cell never blocks a pull, far less
   than the 1.67 a real level costs. */
var RTS_PULL_SLACK = 0.17;

/* ------------------------------------------------------------- height in a fight --
   Extra sight, in CELLS, for standing high: the full height of the map is worth two more
   cells of disc, and RTS_SIGHT_MAX still caps the result, so this widens the view without
   letting anything see further than the original's own limit.

   And extra weapon reach, in WORLD UNITS per world unit of height advantage over the target.
   Measured, this fires on about one shot in ten and never in a base assault, because bases sit
   on the flat - it is worth having for the fight over a ramp and it is deliberately too small
   to move a base fight, which is also why the ladder did not notice it. Advantage only: being
   below does not shorten your reach, or a unit shelling uphill would be unable to answer
   something it can plainly see. */
var RTS_ELEV_SIGHT = 2;
var RTS_ELEV_RANGE = 0.9;

/* HOW HIGH A THING IS STANDING, which is not the same question as how high the ground is.

   A BOAT FLOATS. It is at sea level whatever byte G.height happens to carry for the cell it is
   on, and reading the ground under it is reading the seabed. On a generated map that never
   showed, because core/terrain.js pins water to zero - measured, 0 of 3187 water cells across
   three seeds carry any height at all. It shows the moment water exists that the generator did
   not put there: e2e/navy cuts its duel arena by overwriting G.terrain and G.blocked and NOT
   G.height, so its open sea lies over whatever hills were there, and submarines lost their whole
   advantage over gunboats - 67% of the fleet against 33% before this file, 56% against 61%
   after - because hulls were being handed reach for standing on underwater hills.

   The same will be true of any map this game did not generate: a player's own RA scenario, or
   anything the editor saves. Fixing the arena would have fixed the spec and left the bug.

   Air is at its own altitude for the same reason and has been from the start. */
function _rtsStandHeight(e) {
  if (!e || e.air) return 0;
  if (_rtsDomainOf(e) === 'sea') return 0;
  return _rtsElev(e.x, e.z);
}

function _rtsSightBonus(e) {
  if (!e || e.air) return 0;
  return Math.round(_rtsStandHeight(e) / RTS_ELEV_MAX * RTS_ELEV_SIGHT);
}
/* The reach `a` has against `b`, given a weapon range. Air at either end opts out entirely - an
   aircraft is not shooting from the ground under it. A boat does NOT opt out, it simply stands
   at zero: a coastal gun on a bluff really should outrange the hull it is shelling, and that
   falls out of the same subtraction rather than needing a rule of its own. */
function _rtsElevReach(a, b, range) {
  if (!a || !b || a.air || b.air) return range;
  var adv = _rtsStandHeight(a) - _rtsStandHeight(b);
  return adv > 0 ? range + adv * RTS_ELEV_RANGE : range;
}
