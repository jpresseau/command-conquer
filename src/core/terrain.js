/* core/terrain.js - generating the ground: land types, ore fields, and where the two sides
   start (SCENARIO.CPP). Part of rts.core, the simulation. */

/* ------------------------------------------------------------------ terrain --
   An earlier map was 62 random 1-3 tile rock rectangles on otherwise empty ground, and it
   looked like a field with gravel on it. The games this is modelled on put a *landscape*
   under the battle: dense conifer forest, rock ridges, a shoreline, and dirt roads cutting
   through it all. That is what this builds.

   Everything here is clustered noise rather than scattered singles - a grove of twenty
   trees reads as forest, twenty lone trees read as litter. Roads are carved LAST and are
   what guarantees the two bases can still reach each other; see _rtsCarveRoad. */
function _rtsGenTerrain(G, rnd, starts) {
  var N = RTS_N, i, tx, tz;
  var seed = G.seed | 0;
  function nz(x, y, sc, s) {                       /* smooth value noise, tile units */
    var fx = x / sc, fy = y / sc, x0 = Math.floor(fx), y0 = Math.floor(fy);
    var ax = fx - x0, ay = fy - y0;
    ax = ax * ax * (3 - 2 * ax); ay = ay * ay * (3 - 2 * ay);
    function h(a, b) {
      var v = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(s | 0, 1442695041);
      v = Math.imul(v ^ (v >>> 13), 1274126177); v ^= v >>> 16;
      return (v >>> 0) / 4294967296;
    }
    var p = h(x0, y0), q = h(x0 + 1, y0), r = h(x0, y0 + 1), t = h(x0 + 1, y0 + 1);
    return (p + (q - p) * ax) * (1 - ay) + (r + (t - r) * ax) * ay;
  }
  /* Base areas and ore stay clear of everything.

     These were the literals (20,90) and (92,22) - the two FIXED starts this game had before
     SCENARIO.CPP's Create_Units landed and made them a random pick from a ring of eight. The
     function is handed the real `starts` and was ignoring them, so it reserved two arbitrary
     circles of pristine grass and left the actual bases to fend for themselves. Not fatal,
     because _clearStart bulldozes the real ones afterwards - but it meant every map carried
     two unexplained clearings, and the ore and terrain kept away from the wrong places. */
  function nearBase(x, z) {
    return Math.hypot(x - starts.player.tx, z - starts.player.tz) < 15 ||
           Math.hypot(x - starts.enemy.tx,  z - starts.enemy.tz)  < 15;
  }
  function free(x, z) {
    return _rtsInB(x, z) && G.scrap[_rtsIdx(x, z)] <= 0 && !nearBase(x, z);
  }
  function set(x, z, terr, block) {
    var k = _rtsIdx(x, z);
    G.terrain[k] = terr;
    G.blocked[k] = block ? 2 : 0;
  }

  /* --- water. See the INLET further down: it is carved after the roads, because it has to
         be able to cut one, and because it is placed relative to the two starts rather than
         at a fixed spot on the map. Nothing to do here. --- */

  /* --- rock ridges: high-contrast bands of a low-frequency noise field, which gives
         long connected walls rather than the confetti a per-tile threshold produces --- */
  for (tx = 0; tx < N; tx++) {
    for (tz = 0; tz < N; tz++) {
      if (!free(tx, tz) || G.terrain[_rtsIdx(tx, tz)] !== RTS_T_GRASS) continue;
      /* A narrow band either side of a noise contour gives long thin walls. Widening this
         even slightly turns the ridges into one huge mesa, because the field is smooth and
         the region near the contour grows fast. */
      var ridge = Math.abs(nz(tx, tz, 19, seed + 11) - 0.5);
      if (ridge < 0.016 && nz(tx, tz, 6, seed + 13) > 0.42) set(tx, tz, RTS_T_ROCK, true);
    }
  }

  /* --- forest: groves where a low-frequency mask is high, thinned by a high-frequency
         one so a grove has gaps in it and units can thread through --- */
  for (tx = 0; tx < N; tx++) {
    for (tz = 0; tz < N; tz++) {
      if (!free(tx, tz) || G.terrain[_rtsIdx(tx, tz)] !== RTS_T_GRASS) continue;
      var grove = nz(tx, tz, 17, seed + 21);
      var thin = nz(tx, tz, 3.1, seed + 23);
      if (grove > 0.55 && thin > 0.38) set(tx, tz, RTS_T_TREE, true);
      else if (grove > 0.46 && thin > 0.76) set(tx, tz, RTS_T_TREE, true);   /* stragglers */
    }
  }

  /* --- roads. Carved last, straight through whatever is in the way, so they double as
         the guarantee that the map stays connected: every road links the two start
         corners, so a unit can always get from one base to the other. --- */
  /* Clear a build area at each start FIRST. Terrain is generated before the bases are placed,
     so a start can land inside a forest or a lake; the base then gets scan-placed as much as
     32 rings away while the roads still meet at the original point, and the map comes apart -
     one seed in twenty-four had a player base with no route to anything, ore included. */
  function _clearStart(b) {
    for (var ox = -5; ox <= 5; ox++) for (var oz = -5; oz <= 5; oz++) {
      if (ox * ox + oz * oz > 30) continue;
      var cx = b.tx + ox, cz = b.tz + oz;
      if (!_rtsInB(cx, cz)) continue;
      var ci = _rtsIdx(cx, cz);
      if (G.blocked[ci] === 1) continue;               /* never bulldoze a structure */
      G.blocked[ci] = 0;
      if (G.terrain[ci] !== RTS_T_ROAD) G.terrain[ci] = RTS_T_GRASS;
    }
  }

  /* Every road still links the two STARTS, which is what guarantees the map stays passable -
     they are just no longer two fixed corners. The branches are expressed in the same local
     frame as the bases so they fan out sideways from the main route whatever axis it runs on. */
  var _sp = starts.player, _se = starts.enemy;
  var _dx = _se.tx - _sp.tx, _dz = _se.tz - _sp.tz, _L = Math.hypot(_dx, _dz) || 1;
  var _ux = _dx / _L, _uz = _dz / _L, _px = -_uz, _pz = _ux;
  function _off(b, along, across) {
    return [Math.max(2, Math.min(N - 3, Math.round(b.tx + _ux * along + _px * across))),
            Math.max(2, Math.min(N - 3, Math.round(b.tz + _uz * along + _pz * across)))];
  }
  _clearStart(_sp); _clearStart(_se);
  var _b1 = _off(_sp, _L * 0.55,  30), _b2 = _off(_se, -_L * 0.55, -30);
  _rtsCarveRoad(G, _sp.tx, _sp.tz, _se.tx, _se.tz, rnd);      /* the main route, base to base */
  _rtsCarveRoad(G, _sp.tx, _sp.tz, _b1[0], _b1[1], rnd);      /* one branch out to each flank */
  _rtsCarveRoad(G, _se.tx, _se.tz, _b2[0], _b2[1], rnd);

  /* --- the inlet ---
     A COAST EACH, and one body of water rather than two ponds.

     There used to be a single lake at a hardcoded (88,88) while the starts rotated around a
     ring of eight, so whether anyone could reach the sea was down to which start came up.
     Measured across eight seeds before this: the opponent could place a shipyard on two of
     them, the player on one, and on five neither side could. Four ship types, two shipyards
     and the whole naval half of the roster were unreachable on most maps - for the PLAYER as
     much as for the opponent.

     So the water is placed relative to the two starts: a channel running PARALLEL to the
     line between them, offset to one flank. That gives both bases a shore at roughly equal
     distance, keeps the two fleets in one connected body so a navy has something to fight,
     and leaves the whole other flank as open land - which is where the main road runs, so
     the map's land connectivity is untouched by construction.

     Carved AFTER the roads on purpose. _rtsCarveRoad cuts straight through whatever is in
     its way, so water laid before it would be bridged by the first branch that crossed it
     and split into two ponds. The main base-to-base road runs down the axis and the channel
     is off to one side, so it is only ever a flank BRANCH that gets cut - decoration, not
     the connectivity guarantee. */
  var _sg = ((seed >>> 3) & 1) ? 1 : -1;          /* which flank, off the scenario seed */
  var SEA_OFF = 16, SEA_R = 6.2, SEA_BEACH = 2.4;
  var _ia = [_sp.tx + _px * _sg * SEA_OFF, _sp.tz + _pz * _sg * SEA_OFF];
  var _ib = [_se.tx + _px * _sg * SEA_OFF, _se.tz + _pz * _sg * SEA_OFF];
  function _segD(x, z, a, b) {
    var vx = b[0] - a[0], vz = b[1] - a[1], L2 = vx * vx + vz * vz || 1;
    var q = Math.max(0, Math.min(1, ((x - a[0]) * vx + (z - a[1]) * vz) / L2));
    return Math.hypot(x - (a[0] + vx * q), z - (a[1] + vz * q));
  }
  for (tx = 0; tx < N; tx++) {
    for (tz = 0; tz < N; tz++) {
      var _si = _rtsIdx(tx, tz);
      if (G.scrap[_si] > 0) continue;               /* never drown an ore field */
      if (G.blocked[_si] === 1) continue;           /* nor anything already standing */
      /* Keep clear of the ground each base is actually built on. _clearStart guarantees a
         radius of about 5.5; this leaves margin on top of it, so the shore lands just
         outside the base rather than in the middle of it. */
      if (Math.hypot(tx - _sp.tx, tz - _sp.tz) < 7.5) continue;
      if (Math.hypot(tx - _se.tx, tz - _se.tz) < 7.5) continue;
      var _wob = nz(tx, tz, 11, seed + 31) * 5 - 2.5;
      var _sd = _segD(tx, tz, _ia, _ib) + _wob;
      if (_sd < SEA_R) set(tx, tz, RTS_T_WATER, true);
      else if (_sd < SEA_R + SEA_BEACH) set(tx, tz, RTS_T_SAND, false);
    }
  }

  /* --- sandbag emplacements. Short dog-legged chains of old fortification, left over from
         whoever fought here last. They are scattered all over the reference material and are
         most of why those maps read as contested ground rather than open country. Blocking,
         but short enough to go around. --- */
  for (var wc = 0; wc < 70; wc++) {
    var wx = 8 + ((rnd() * (N - 16)) | 0), wz = 8 + ((rnd() * (N - 16)) | 0);
    if (!free(wx, wz) || G.terrain[_rtsIdx(wx, wz)] !== RTS_T_GRASS) continue;
    var dir = (rnd() * 4) | 0, len = 4 + ((rnd() * 6) | 0);
    var DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
    for (var ws = 0; ws < len; ws++) {
      if (ws === (len >> 1)) dir = (dir + (rnd() < 0.5 ? 1 : 3)) % 4;   /* one dog-leg */
      if (!free(wx, wz) || G.terrain[_rtsIdx(wx, wz)] !== RTS_T_GRASS) break;
      set(wx, wz, RTS_T_WALL, true);
      wx += DIRS[dir][0]; wz += DIRS[dir][1];
    }
  }

  /* --- connectivity guarantee for ore ---
     Roads link the two bases, but a forest can still ring an ore field completely and leave
     it unharvestable. Roughly one map in three did. Flood fill from the player start and
     carve a track out to any ore that the fill could not reach. --- */
  var reach = new Uint8Array(N * N), stack = [_rtsIdx(_sp.tx, _sp.tz)];
  reach[stack[0]] = 1;
  while (stack.length) {
    var ci = stack.pop(), cxr = ci % N, czr = (ci / N) | 0;
    for (var dq = 0; dq < 4; dq++) {
      var nxr = cxr + [1, -1, 0, 0][dq], nzr = czr + [0, 0, 1, -1][dq];
      if (!_rtsInB(nxr, nzr)) continue;
      var nir = _rtsIdx(nxr, nzr);
      if (reach[nir] || G.blocked[nir] === 2) continue;
      reach[nir] = 1; stack.push(nir);
    }
  }
  for (tx = 0; tx < N; tx++) {
    for (tz = 0; tz < N; tz++) {
      i = _rtsIdx(tx, tz);
      if (G.scrap[i] <= 0 || reach[i]) continue;
      _rtsCarveRoad(G, tx, tz, _sp.tx, _sp.tz, rnd, true);   /* cut through to the player start */
      /* One carve reconnects the whole blob, so re-run the fill rather than carving per tile. */
      reach.fill(0); stack = [_rtsIdx(_sp.tx, _sp.tz)]; reach[stack[0]] = 1;
      while (stack.length) {
        var c2 = stack.pop(), cx2r = c2 % N, cz2r = (c2 / N) | 0;
        for (var d2 = 0; d2 < 4; d2++) {
          var nx2 = cx2r + [1, -1, 0, 0][d2], nz2 = cz2r + [0, 0, 1, -1][d2];
          if (!_rtsInB(nx2, nz2)) continue;
          var ni2 = _rtsIdx(nx2, nz2);
          if (reach[ni2] || G.blocked[ni2] === 2) continue;
          reach[ni2] = 1; stack.push(ni2);
        }
      }
    }
  }

  /* Trees never grow right up against ore, so a field has a little clearing around it. */
  for (tx = 1; tx < N - 1; tx++) {
    for (tz = 1; tz < N - 1; tz++) {
      i = _rtsIdx(tx, tz);
      if (G.terrain[i] !== RTS_T_TREE) continue;
      if (G.scrap[_rtsIdx(tx + 1, tz)] > 0 || G.scrap[_rtsIdx(tx - 1, tz)] > 0 ||
          G.scrap[_rtsIdx(tx, tz + 1)] > 0 || G.scrap[_rtsIdx(tx, tz - 1)] > 0) {
        G.terrain[i] = RTS_T_GRASS; G.blocked[i] = 0;
      }
    }
  }

  /* The spine and the single-sea pass run HERE, at the end, rather than beside the noisy
     pass that shapes the channel. Two things come after that pass and both can cut water:
     the ore connectivity carve is explicitly allowed to lay a causeway across it, and a
     causeway splits the sea in two. Measured with this cleanup in its old position: one
     connected body on 7 seeds of 16. Re-laying the centreline after everything else has had
     its turn is what makes it one body every time. */
  /* A SPINE down the middle of it, forced. The noisy pass above pinches the channel shut
     wherever the wobble runs against an ore field it is not allowed to drown - measured at a
     largest-connected-body of 34-65% of all water, which is two or three ponds wearing a
     channel's shape. Two fleets in separate ponds can never meet, and a navy that cannot be
     fought is scenery. So the centreline is laid down afterwards at a fixed width, over
     anything but a standing building: whatever the noise did to the edges, the water is one
     body. Ore that ends up under it is lost, which is the honest cost of the channel having
     to be continuous - and the ore layout is mirrored about the midpoint, so it costs both
     sides the same. */
  var _steps = Math.ceil(Math.hypot(_ib[0] - _ia[0], _ib[1] - _ia[1]));
  for (var _s = 0; _s <= _steps; _s++) {
    var _q = _s / (_steps || 1);
    var _cx = Math.round(_ia[0] + (_ib[0] - _ia[0]) * _q);
    var _cz = Math.round(_ia[1] + (_ib[1] - _ia[1]) * _q);
    for (var _ox = -2; _ox <= 2; _ox++) for (var _oz = -2; _oz <= 2; _oz++) {
      if (_ox * _ox + _oz * _oz > 5) continue;
      var _wx = _cx + _ox, _wz = _cz + _oz;
      if (!_rtsInB(_wx, _wz)) continue;
      if (G.blocked[_rtsIdx(_wx, _wz)] === 1) continue;      /* never drown a structure */
      if (Math.hypot(_wx - _sp.tx, _wz - _sp.tz) < 7.5) continue;
      if (Math.hypot(_wx - _se.tx, _wz - _se.tz) < 7.5) continue;
      G.scrap[_rtsIdx(_wx, _wz)] = 0;
      set(_wx, _wz, RTS_T_WATER, true);
    }
  }
  /* ONE SEA, and only one. The noisy pass leaves detached puddles either side of the channel
     - measured at a largest-connected-body of 51-100% of all water even with the spine down.
     A puddle is harmless to look at and dangerous to build on: a shipyard placed against one
     spawns its ships into a pond they can never leave, and _rtsSeaSpawn cannot tell the
     difference because it only ever asks for the nearest open water. So everything that is
     not part of the biggest body becomes beach. */
  var _wseen = new Uint8Array(N * N), _best = null, _bestN = 0;
  for (i = 0; i < N * N; i++) {
    if (G.terrain[i] !== RTS_T_WATER || _wseen[i]) continue;
    var _comp = [i], _st = [i], _n = 0;
    _wseen[i] = 1;
    while (_st.length) {
      var _c = _st.pop(), _cx2 = _c % N, _cz2 = (_c / N) | 0; _n++;
      for (var _d = 0; _d < 4; _d++) {
        var _nx = _cx2 + [1, -1, 0, 0][_d], _nz = _cz2 + [0, 0, 1, -1][_d];
        if (!_rtsInB(_nx, _nz)) continue;
        var _ni = _rtsIdx(_nx, _nz);
        if (_wseen[_ni] || G.terrain[_ni] !== RTS_T_WATER) continue;
        _wseen[_ni] = 1; _comp.push(_ni); _st.push(_ni);
      }
    }
    if (_n > _bestN) { _bestN = _n; _best = _comp; }
  }
  if (_best) {
    var _keep = new Uint8Array(N * N);
    for (i = 0; i < _best.length; i++) _keep[_best[i]] = 1;
    for (i = 0; i < N * N; i++) {
      if (G.terrain[i] !== RTS_T_WATER || _keep[i]) continue;
      G.terrain[i] = RTS_T_SAND; G.blocked[i] = 0;
    }
  }

  /* --- and the ore has to still be reachable ---
     The two guarantees pull against each other. The ore connectivity carve above is allowed
     to lay a causeway across water, and a causeway splits the sea; re-laying the spine after
     it puts the sea back together and cuts the causeway again. Measured: keep the causeways
     and one seed in two has a sea in two halves, so a fleet can never meet the other side's;
     re-cut them and twelve seeds of sixteen strand some ore.

     Stranded ore loses. It is 1 to 18 cells of about 930 - under two per cent - and the ore
     layout is mirrored about the midpoint, so what it costs it costs both sides. A sea in two
     halves would cost the naval half of the game entirely. Whatever is still cut off after
     the sea is final simply is not ore. */
  var _lr = new Uint8Array(N * N), _ls = [_rtsIdx(_sp.tx, _sp.tz)];
  _lr[_ls[0]] = 1;
  while (_ls.length) {
    var _lc = _ls.pop(), _lx = _lc % N, _lz = (_lc / N) | 0;
    for (var _ld = 0; _ld < 4; _ld++) {
      var _lnx = _lx + [1, -1, 0, 0][_ld], _lnz = _lz + [0, 0, 1, -1][_ld];
      if (!_rtsInB(_lnx, _lnz)) continue;
      var _lni = _rtsIdx(_lnx, _lnz);
      if (_lr[_lni] || G.blocked[_lni] === 2) continue;
      _lr[_lni] = 1; _ls.push(_lni);
    }
  }
  for (i = 0; i < N * N; i++) {
    if (G.scrap[i] > 0 && !_lr[i]) { G.scrap[i] = 0; G.gems[i] = 0; }
  }

}

/* A wandering 3-tile-wide track between two points. Clears obstacles as it goes. */
function _rtsCarveRoad(G, x0, z0, x1, z1, rnd, force) {
  var steps = Math.ceil(Math.hypot(x1 - x0, z1 - z0)) * 2;
  var sway = force ? 0 : (rnd() - 0.5) * 26;
  for (var s = 0; s <= steps; s++) {
    var t = s / steps;
    /* a sine bulge perpendicular to the line, so roads bend instead of ruling a diagonal */
    var px = x0 + (x1 - x0) * t, pz = z0 + (z1 - z0) * t;
    var dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz) || 1;
    var off = Math.sin(t * Math.PI) * sway;
    px += (-dz / L) * off; pz += (dx / L) * off;
    /* Two tiles wide. Three read as a runway rather than a track. */
    for (var ox = 0; ox <= 1; ox++) {
      for (var oz = 0; oz <= 1; oz++) {
        var tx = Math.round(px) + ox, tz = Math.round(pz) + oz;
        if (!_rtsInB(tx, tz)) continue;
        var i = _rtsIdx(tx, tz);
        if (G.scrap[i] > 0) continue;
        /* Normally a road stops at the shore. The connectivity pass passes force, and then
           it lays a causeway instead - an ore field on an island is unharvestable, and the
           lake is generated after the ore, so islands do happen. */
        if (G.terrain[i] === RTS_T_WATER && !force) continue;
        if (G.blocked[i] === 1) continue;                 /* never bulldoze a structure */
        G.blocked[i] = 0;
        G.terrain[i] = RTS_T_ROAD;
      }
    }
  }
}


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

