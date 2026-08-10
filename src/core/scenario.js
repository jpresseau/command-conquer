/* core/scenario.js - where the two sides start, where the ore is, and how a base is laid out
   on the ground once the start is picked (SCENARIO.CPP). Part of rts.core, the simulation.

   Split out of core/terrain.js, which generates the LAND. Everything here is the other half of
   SCENARIO.CPP's job: it decides the two points the match is fought between, and terrain.js is
   then handed those points and shapes forest, roads and water around them. */

/* ------------------------------------------------ start positions (SCENARIO.CPP) --
   Create_Units picks the first house's start AT RANDOM from the waypoint list, then gives
   every later house the waypoint with the highest SUM OF DISTANCES to all already-taken
   starts - "the waypoint with the largest score is the one that is furthest from all other
   taken waypoints". For two houses that means: roll the axis, then take the far end of it.

   In RA the candidate list is authored per scenario. This map is generated, so the candidates
   are a ring inset from the edge; the roll therefore chooses which diagonal the match is
   fought along, and the whole map - ore, roads, connectivity, waypoints - follows from it
   instead of being pinned to one corner every game. */
function _rtsStartCandidates() {
  var c = [], n = 8, R = RTS_N * 0.36, mid = RTS_N / 2;
  for (var i = 0; i < n; i++) {
    var a = (i / n) * Math.PI * 2;
    c.push({ tx:Math.round(mid + Math.cos(a) * R), tz:Math.round(mid + Math.sin(a) * R) });
  }
  return c;
}
function _rtsPickStarts(rnd) {
  var cand = _rtsStartCandidates(), taken = [], i, j;
  /* "int pick = Random_Pick(0, num_waypts-1)" - the first is simply chosen. */
  taken.push(cand.splice((rnd() * cand.length) | 0, 1)[0]);
  /* ...every later one maximises the summed distance to those already taken. */
  while (taken.length < 2) {
    var best = 0, bestScore = -1;
    for (i = 0; i < cand.length; i++) {
      var score = 0;
      for (j = 0; j < taken.length; j++) score += Math.hypot(cand[i].tx - taken[j].tx, cand[i].tz - taken[j].tz);
      if (score > bestScore) { bestScore = score; best = i; }
    }
    taken.push(cand.splice(best, 1)[0]);
  }
  return { player:taken[0], enemy:taken[1] };
}
/* The ore layout is expressed RELATIVE to the two starts rather than as fixed cells: a home
   field beside each base, matched pairs out along the line between them, and the gems in
   contested ground at the midpoint. Mirroring it about the midpoint is what keeps the map
   fair whichever axis the roll produced. */
function _rtsOreFields(S) {
  var p = S.player, e = S.enemy;
  var mx = (p.tx + e.tx) / 2, mz = (p.tz + e.tz) / 2;
  var dx = e.tx - p.tx, dz = e.tz - p.tz, L = Math.hypot(dx, dz) || 1;
  var ux = dx / L, uz = dz / L, px = -uz, pz = ux;
  function at(base, along, across, rad, gem) {
    return [Math.round(base.tx + ux * along + px * across),
            Math.round(base.tz + uz * along + pz * across), rad, gem];
  }
  return [
    /* home fields: close enough to mine from the start, offset so they are not underfoot */
    at(p,  9,  -7, 7, 0), at(e, -9,   7, 7, 0),
    /* a second field each, on the other flank, to give the base two directions to work */
    at(p, 14,  10, 5, 0), at(e, -14, -10, 5, 0),
    /* the big contested field in the middle */
    [Math.round(mx), Math.round(mz), 10, 0],
    /* matched mid-field pairs either side of the centre line */
    at(p, L * 0.42,  18, 6, 0), at(e, -L * 0.42, -18, 6, 0),
    /* gems: small, unmirrored pair straddling the midpoint, in the most contested ground */
    [Math.round(mx + px * 14), Math.round(mz + pz * 14), 3, 1],
    [Math.round(mx - px * 14), Math.round(mz - pz * 14), 3, 1]
  ];
}


/* Scan_Place_Object: "loop through distances from the given center cell; skip the center
   cell. For each distance, try placing the object along each rotational direction; if none
   are available, try each direction with a random scatter value." The second pass exists
   because otherwise everything lines up along eight spokes out of the centre.

   Returns the cell used, or null if 32 rings found nothing. */
var _RTS_FACING8 = [[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1]];
function _rtsScanPlace(tx, tz, fits, rnd) {
  if (fits(tx, tz)) return { tx:tx, tz:tz };
  for (var dist = 1; dist < 32; dist++) {
    var rot = ((rnd ? rnd() : 0) * 8) | 0;                 /* "Pick a random starting direction" */
    for (var tryval = 0; tryval < 2; tryval++) {
      for (var f = 0; f < 8; f++) {
        var d = _RTS_FACING8[(rot + f) % 8];
        var cx = tx + d[0] * dist, cz = tz + d[1] * dist;
        if (tryval > 0 && rnd) {                            /* Clip_Scatter, second pass only */
          cx += ((rnd() * 3) | 0) - 1; cz += ((rnd() * 3) | 0) - 1;
        }
        if (cx === tx && cz === tz) continue;
        if (fits(cx, cz)) return { tx:cx, tz:cz };
      }
    }
  }
  return null;
}
/* Lay out a base in its own local frame: `along` points at the opponent, `across` to the
   side. The same table then produces the same arrangement whichever axis the start roll
   picked, instead of the layout only making sense on one diagonal. */
function _rtsLayBase(start, foe, list, side) {
  var G = window._rtsG;
  var dx = foe.tx - start.tx, dz = foe.tz - start.tz, L = Math.hypot(dx, dz) || 1;
  var ux = dx / L, uz = dz / L, px = -uz, pz = ux;
  for (var i = 0; i < list.length; i++) {
    var kind = list[i][0], key = list[i][1], along = list[i][2], across = list[i][3];
    var tx = Math.round(start.tx + ux * along + px * across);
    var tz = Math.round(start.tz + uz * along + pz * across);
    if (kind === 'unit') {
      var open = _rtsScanPlace(tx, tz, function (x, z) { return _rtsInB(x, z) && !_rtsBlocked(x, z); }, _rtsRnd);
      if (open) _rtsSpawnUnit(side, key, _rtsWX(open.tx), _rtsWX(open.tz));
      continue;
    }
    var d = rtsStructDef(key);
    var spot = _rtsScanPlace(tx, tz, function (x, z) {
      for (var ox = 0; ox < d.w; ox++) for (var oz = 0; oz < d.h; oz++) {
        if (!_rtsInB(x + ox, z + oz) || _rtsBlocked(x + ox, z + oz)) return false;
      }
      return true;
    }, _rtsRnd);
    if (spot) _rtsPlaceStruct(side, key, spot.tx, spot.tz, true);
  }
}

