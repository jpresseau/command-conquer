/* core/basezone.js - HOUSE.CPP Recalc_Center and Which_Zone, and everything that decides
   WHERE the opponent puts its next building. Part of rts.core, the simulation.

   Split out of core/ai.js when that file reached the 500-line ceiling unit/layout enforces.
   A clean seam: this file answers "where is a side's base, and where in it should this go",
   and knows nothing about what the opponent is trying to build or why. */

/* HOUSE.CPP Recalc_Center: the base centre is a COST-WEIGHTED average of building positions
   ("give more weight to buildings that cost more"), and the radius is the mean distance from
   it. Zones follow: CORE inside the radius, then NORTH/EAST/SOUTH/WEST by direction.

   ...OVER THE CLUSTER, NOT THE SCATTER, which the original never had to say because in a
   scenario a house's buildings are all in one place and stay there. They do not here: an
   engineer moves a building to the other side, and a plain mean has no defence against one
   outlier. Measured, a captured Refinery (cost 2000, so weight 3) at the far end of the map
   dragged the centre a tenth of the map and took the radius from ~20 world units to ~65 -
   and everything downstream reads that radius as "how big is my base":

     _rtsAIWeakZone aims the next defensive building at c.r*2 from the centre, so every
     Turret and Tesla Coil bought after the capture was sited beside the PLAYER's base
     rather than covering its own approaches - the exact failure Which_Zone exists to avoid.

     _rtsWhichZone calls anything inside c.r*4 part of the base, so at r=65 almost the whole
     map counted as "inside the enemy base": the exposed and nervous biases in _rtsEvalObject
     stopped discriminating and became a constant.

   So the centre is SEEDED ON THE DENSEST BUILDING rather than on the mean, and averaged over
   what is within a base's reach of it. That is one line different from an outlier rejection and
   it matters: rejecting outliers around the mean handles one stray building, and the case here
   is not one stray. An opponent that captures once captures again - the player who lost a
   Refinery to an engineer is the player whose base is worth walking into - so what the side
   owns becomes TWO CLUSTERS, and a mean sitting between two clusters rejects neither of them.
   Measured on the base-defence run, where the player is held alive and never builds a gun: the
   opponent's mean distance from its own centre was 175 world units on a map 512 across, and
   every defence it owned scored as "core" because the radius had swallowed the whole base. Two
   compass zones covered, against four before.

   Seeking the mode instead answers the question the callers are actually asking - "where is
   this side's base" - for any number of clusters.

   EVERY caller gets it, placement included, and that was checked rather than assumed. Leaving
   Recalc_Center on the plain mean and giving only the new callers the seeded answer was tried
   first, on the theory that placement is tuned against the old numbers and should not be
   disturbed. It is worse, measurably: with the plain mean the opponent's defensive siting
   collapses the moment it owns a building across the map - 0 of 4 compass zones covered on one
   army and 2 of 4 on the other, against 4 and 4 with this. The mean between two clusters is
   not a base and nothing downstream can do anything sensible with it. */
function _rtsHomeCentre(side) { return _rtsBaseCentre(side); }
function _rtsBaseCentre(side) {
  var seed = _rtsBaseSeed(side);
  if (!seed) return null;
  return _rtsBaseMean(side, seed, RTS_BASE_REACH) || _rtsBaseMean(side, null, 0);
}
/* The building with the most company inside a base's reach - the densest point of the side's
   holdings. Cost-weighted, so a Refinery counts for more than a silo when two groups tie, and
   ties beyond that fall to entity order, which is stable. */
function _rtsBaseSeed(side) {
  var G = window._rtsG, best = null, bv = -1, i, j;
  for (i = 0; i < G.ents.length; i++) {
    var e = G.ents[i];
    if (e.dead || e.type !== 'struct' || e.side !== side || e.selling) continue;
    var v = 0;
    for (j = 0; j < G.ents.length; j++) {
      var o = G.ents[j];
      if (o.dead || o.type !== 'struct' || o.side !== side || o.selling) continue;
      if (Math.hypot(o.x - e.x, o.z - e.z) > RTS_BASE_REACH) continue;
      v += ((rtsStructDef(o.def).cost / 1000) | 0) + 1;
    }
    if (v > bv) { bv = v; best = e; }
  }
  return best;
}
/* One weighted pass. `from`/`lim` restrict it to buildings within `lim` of a previous centre;
   with no limit it is the plain Recalc_Center. Returns null when nothing qualifies, which is
   why the caller keeps the unrestricted answer as a fallback. */
function _rtsBaseMean(side, from, lim) {
  var G = window._rtsG, x = 0, z = 0, n = 0, i, e, k;
  function counts(o) {
    if (o.dead || o.type !== 'struct' || o.side !== side || o.selling) return false;
    return !lim || Math.hypot(o.x - from.x, o.z - from.z) <= lim;
  }
  for (i = 0; i < G.ents.length; i++) {
    e = G.ents[i];
    if (!counts(e)) continue;
    var w = ((rtsStructDef(e.def).cost / 1000) | 0) + 1;
    for (k = 0; k < w; k++) { x += e.x; z += e.z; n++; }
  }
  if (!n) return null;
  var c = { x:x / n, z:z / n, r:0 }, rad = 0, cnt = 0;
  for (i = 0; i < G.ents.length; i++) {
    e = G.ents[i];
    if (!counts(e)) continue;
    rad += Math.hypot(e.x - c.x, e.z - c.z); cnt++;
  }
  c.r = Math.max(cnt ? rad / cnt : 0, RTS_TILE * 2);
  return c;
}
/* Is this point part of that side's base? The question every "my base is being attacked"
   reaction should have been asking and none of them were - see _rtsBaseIsAttacked. */
function _rtsInBase(side, x, z) {
  var c = _rtsHomeCentre(side);
  if (!c) return false;
  return Math.hypot(x - c.x, z - c.z) <= c.r * RTS_BASE_SPAN;
}
/* The side's own `key`, meaning the one at HOME rather than whichever comes first in the
   entity list. _rtsHas walks G.ents from index 0, and _rtsLayBase lays the player's base
   before the opponent's, so the player's opening Yard and Power Plant hold the lowest indices
   on the map for the whole match. The moment the opponent captures either, every
   _rtsHas('enemy','yard'|'power') silently starts answering with a building standing in the
   middle of the player's base.

   That is not a theoretical tidy-up. Capturing a Power Plant adds its supply, which pushes
   the opponent's slack past RTS_AI.powerWaste, which fires `lowerPower`, whose handler sells
   _rtsHas('enemy','power') - the plant it had just spent an engineer and a walk across the
   map to take, sold back seconds later for half of what the PLAYER paid for it. */
function _rtsHasHome(side, key) {
  var G = window._rtsG, c = _rtsHomeCentre(side), best = null, bd = 1e9;
  for (var i = 0; i < G.ents.length; i++) {
    var e = G.ents[i];
    if (e.dead || e.type !== 'struct' || e.side !== side || e.def !== key) continue;
    if (!c) return e;
    var d = Math.hypot(e.x - c.x, e.z - c.z);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}
/* Which_Zone: 0 core, 1 north, 2 east, 3 south, 4 west, -1 too far to be part of the base. */
function _rtsWhichZone(c, x, z) {
  if (!c) return -1;
  var d = Math.hypot(x - c.x, z - c.z);
  if (d <= c.r) return 0;
  if (d > c.r * 4) return -1;
  var a = Math.atan2(z - c.z, x - c.x);
  if (a >= -Math.PI * 0.75 && a < -Math.PI * 0.25) return 1;   /* north (-z) */
  if (a >= -Math.PI * 0.25 && a < Math.PI * 0.25) return 2;    /* east */
  if (a >= Math.PI * 0.25 && a < Math.PI * 0.75) return 3;     /* south */
  return 4;                                                    /* west */
}
/* Find_Build_Location: rate each zone by how far its defence sits BELOW the base average,
   and aim the new defensive building at the weakest one. Putting every turret on the side
   facing the enemy is exactly the mistake this routine exists to avoid - it leaves the other
   three approaches open. */
function _rtsAIWeakZone() {
  var G = window._rtsG, c = _rtsBaseCentre('enemy');
  if (!c) return null;
  var def = [0, 0, 0, 0, 0], i;
  for (i = 0; i < G.ents.length; i++) {
    var e = G.ents[i];
    if (e.dead || e.type !== 'struct' || e.side !== 'enemy' || e.selling) continue;
    var sd = rtsStructDef(e.def);
    if (!sd.weapon) continue;
    var z = _rtsWhichZone(c, e.x, e.z);
    if (z >= 0) def[z]++;
  }
  /* the core counts for half, as in the original's `if (z == ZONE_CORE) diff /= 2` */
  var best = 1, bestv = 1e9;
  for (i = 1; i <= 4; i++) if (def[i] < bestv) { bestv = def[i]; best = i; }
  var ang = [0, -Math.PI / 2, 0, Math.PI / 2, Math.PI][best];
  return { x:c.x + Math.cos(ang) * c.r * 2, z:c.z + Math.sin(ang) * c.r * 2 };
}
/* A BUILDING MAY NOT WALL OFF THE GROUND AROUND IT.

   The placement below takes the legal cell nearest its anchor, which packs a base tight - and
   nothing asked what the new footprint closed off. Measured over ten matches (both armies,
   seeds 9001-9005, normal): six ended with free cells inside the opponent's base that no unit
   could reach any more, and on seed 9004 the sealed pocket was the one its barracks delivers
   into. Eighteen to twenty infantry came out of that barracks into a four-cell hole between a
   silo, two refineries and the barracks itself, and stood there for the rest of the match,
   squad orders and all, with no path to anywhere.

   So a candidate is refused if blocking its footprint leaves more free ground cut off than
   was cut off before. Asked over a window a few cells round the footprint, flooding in from
   the window's edge: anything the new building can seal lies next to it, and ground that was
   already enclosed (a pocket in the rocks) is counted on both sides and cancels. Four-way
   connectivity, which is the cautious reading - a gap that is only open across two building
   corners is not counted as open.

   Only the opponent is held to this. Walling in your own factory is a mistake a player is
   allowed to make. */
var RTS_OPEN_MARGIN = 6;
function _rtsSealsGround(tx, tz, w, h) {
  if (window.RTS_OPEN_OFF) return false;          /* e2e/basespace's before-picture */
  var M = RTS_OPEN_MARGIN, N = RTS_N;
  var x0 = Math.max(0, tx - M), z0 = Math.max(0, tz - M);
  var x1 = Math.min(N - 1, tx + w - 1 + M), z1 = Math.min(N - 1, tz + h - 1 + M);
  var W = x1 - x0 + 1, H = z1 - z0 + 1;
  function foot(x, z) { return x >= tx && x < tx + w && z >= tz && z < tz + h; }
  function cutOff(withFoot) {
    var seen = new Uint8Array(W * H), q = [], x, z, k, n = 0;
    function open(x2, z2) { return !(withFoot && foot(x2, z2)) && !_rtsBlocked(x2, z2, null); }
    for (x = x0; x <= x1; x++) for (z = z0; z <= z1; z++) {
      if (x !== x0 && x !== x1 && z !== z0 && z !== z1) continue;
      k = (z - z0) * W + (x - x0);
      if (!seen[k] && open(x, z)) { seen[k] = 1; q.push(x, z); }
    }
    for (var h2 = 0; h2 < q.length; h2 += 2) {
      var cx = q[h2], cz = q[h2 + 1];
      for (var d = 0; d < 4; d++) {
        var nx = cx + (d === 0 ? 1 : d === 1 ? -1 : 0), nz = cz + (d === 2 ? 1 : d === 3 ? -1 : 0);
        if (nx < x0 || nx > x1 || nz < z0 || nz > z1) continue;
        k = (nz - z0) * W + (nx - x0);
        if (!seen[k] && open(nx, nz)) { seen[k] = 1; q.push(nx, nz); }
      }
    }
    /* free ground the flood never reached - the footprint itself is not counted either way */
    for (x = x0; x <= x1; x++) for (z = z0; z <= z1; z++) {
      if (foot(x, z) || _rtsBlocked(x, z, null)) continue;
      if (!seen[(z - z0) * W + (x - x0)]) n++;
    }
    return n;
  }
  return cutOff(true) > cutOff(false);
}

/* Where to put it: a refinery hugs the nearest ore, a turret covers the base's weakest
   approach, everything else clusters. Dropping a refinery on the far side of the base from
   the ore is the single most common way a build-order AI wastes its money. */
function _rtsAIPlace(key) {
  var G = window._rtsG, i, e, aim = null;
  /* Next_Buildable first. If the plan has a fillable hole of this type, the building goes back
     into it - that is the whole point of the node list, and it comes before any of the aiming
     below because the plan already decided where this one belongs. */
  var node = _rtsNextBuildable('enemy', key), kd = rtsStructDef(key);
  /* ...unless the hole has been closed in since: the plan was open when it was laid out, but a
     building put up beside the gap afterwards may have leaned on it to keep a lane clear */
  if (node && !_rtsSealsGround(node.tx, node.tz, kd.w, kd.h)) {
    _rtsPlaceStruct('enemy', key, node.tx, node.tz, false, G.sides.enemy.readyPaid); return true;
  }
  if (key === 'refinery') aim = _rtsAIOreSpot();
  /* ANYTHING THAT SHOOTS, not the one building called 'turret'. The zone routine above already
     defines a defence as `sd.weapon` when it COUNTS what is where - it was only this call site
     that named a key, and `turret` is Allied-only, so the entire Which_Zone port ran for one
     army and never for the other.

     Measured before the fix, hard, three seeds, 420s: the Allied house spread its defences over
     4 of 4 compass zones on every seed; the Soviet house managed 1, 3 and 2 - on seed 9001 all
     seven of its defences sat on ONE side of the base. Six structures carry a weapon and all
     six want aiming. */
  else if ((rtsStructDef(key) || {}).weapon) aim = _rtsAIWeakZone();
  else if ((rtsStructDef(key) || {}).shore) {
    /* A shipyard has exactly one place it can go, and the search below only accepts cells
       _rtsCanPlace agrees with - which already applies the shore rule. Aiming at the spot
       found by the gate above just means the best one wins rather than the first. */
    var _sh = _rtsAIShoreSpot(key);
    if (_sh) aim = { x:_rtsWX(_sh[0]), z:_rtsWX(_sh[1]) };
  }
  var anchors = [];
  for (i = 0; i < G.ents.length; i++) {
    e = G.ents[i];
    if (e.type === 'struct' && e.side === 'enemy' && !e.dead && !e.selling) anchors.push(e);
  }
  if (!anchors.length) return false;
  if (aim) anchors.sort(function (a, b) {
    return Math.hypot(a.x - aim.x, a.z - aim.z) - Math.hypot(b.x - aim.x, b.z - aim.z);
  });
  /* Try every anchor, best-first. Searching only the nearest one looks fine until that
     corner of the base fills up - then placement fails forever, the finished building never
     leaves the "ready" slot, and the AI's whole structure queue is jammed for the rest of
     the match while its credits pile up. */
  var R = RTS_BUILD_RADIUS;
  for (var a = 0; a < anchors.length; a++) {
    var anchor = anchors[a], best = null, cand = [];
    for (var tx = anchor.tx - R; tx <= anchor.tx + R; tx++) {
      for (var tz = anchor.tz - R; tz <= anchor.tz + R; tz++) {
        if (!_rtsCanPlace('enemy', key, tx, tz)) continue;
        var wx = _rtsWX(tx), wz = _rtsWX(tz);
        cand.push([aim ? Math.hypot(wx - aim.x, wz - aim.z) : Math.hypot(wx - anchor.x, wz - anchor.z), tx, tz]);
      }
    }
    /* best-first, and the first that leaves the ground around it open - see _rtsSealsGround.
       The flood runs only on the few candidates that get this far, not on every legal cell. */
    cand.sort(function (p, q) { return p[0] - q[0] || p[1] - q[1] || p[2] - q[2]; });
    for (var c = 0; c < cand.length && !best; c++) {
      if (_rtsOnMuster(cand[c][1], cand[c][2], kd.w, kd.h)) continue;
      if (!_rtsSealsGround(cand[c][1], cand[c][2], kd.w, kd.h)) best = [cand[c][1], cand[c][2]];
    }
    /* Anything placed outside the plan becomes part of it (in _rtsPlaceStruct), so the next
       raid is repaired against the base as it actually stands, not just the opening layout. */
    if (best) { _rtsPlaceStruct('enemy', key, best[0], best[1], false, G.sides.enemy.readyPaid); return true; }
  }
  return false;
}
/* Somewhere the opponent could actually put a shipyard: a cell inside the build radius of
   one of its buildings that _rtsCanPlace accepts, which is where the `shore` rule is applied.
   Returns null on a map whose coast the base cannot reach - and null is the whole point, see
   the caller in _rtsAIWants. */
function _rtsAIShoreSpot(key) {
  var G = window._rtsG, R = RTS_BUILD_RADIUS, best = null, bs = 1e9, i;
  var anchors = [];
  for (i = 0; i < G.ents.length; i++) {
    var e = G.ents[i];
    if (e.type === 'struct' && e.side === 'enemy' && !e.dead && !e.selling) anchors.push(e);
  }
  for (var a = 0; a < anchors.length; a++) {
    var an = anchors[a];
    for (var tx = an.tx - R; tx <= an.tx + R; tx++) {
      for (var tz = an.tz - R; tz <= an.tz + R; tz++) {
        if (!_rtsCanPlace('enemy', key, tx, tz)) continue;
        /* Prefer a berth near the middle of the base rather than the first cell scanned:
           a yard tucked behind the furthest outbuilding is one the defences do not cover. */
        var s = Math.hypot(_rtsWX(tx) - an.x, _rtsWX(tz) - an.z);
        if (s < bs) { bs = s; best = [tx, tz]; }
      }
    }
  }
  return best;
}
/* The richest ore nearest to ANY of the AI's buildings - not to its yard. As the base creeps
   outward the frontier is what matters; measuring from the yard sent late refineries back
   toward a field that had already been mined out. */
function _rtsAIOreSpot() {
  var G = window._rtsG, structs = [], i, e;
  for (i = 0; i < G.ents.length; i++) {
    e = G.ents[i];
    if (e.type === 'struct' && e.side === 'enemy' && !e.dead && !e.selling) structs.push(e);
  }
  if (!structs.length) return null;
  var best = null, bd = 1e9;
  for (var tx = 0; tx < RTS_N; tx += 2) for (var tz = 0; tz < RTS_N; tz += 2) {
    if (G.scrap[_rtsIdx(tx, tz)] < RTS_SCRAP_TILE * 0.4) continue;
    var wx = _rtsWX(tx), wz = _rtsWX(tz), d = 1e9;
    for (i = 0; i < structs.length; i++) d = Math.min(d, Math.hypot(wx - structs[i].x, wz - structs[i].z));
    if (d < bd) { bd = d; best = { x:wx, z:wz }; }
  }
  return best;
}

/* WHERE THE OPPONENT'S NEW UNITS GO TO WAIT: OUT OF THE DOORWAY.

   A player sets a rally point; the opponent never had one, so every unit it built stopped on the
   cell it was delivered to and stood there until a team took it. Most never were taken - the
   team cap and the garrison it keeps back leave the rest where they fell. Measured across eight
   matches (both armies, normal and hard, seeds 9001 and 9006): 35 to 74 per cent of the
   opponent's army, averaged over the match, was standing within two cells of a factory or a
   barracks. On hard, seed 9006, that doorway was a three-cell lane between the War Factory and
   a power plant, and tanks with real attack orders sat behind the idle ones for up to a minute,
   three of them still there when the match ended.

   So each production building gets a muster point: the nearest spot with clear ground round it,
   leaning away from the base's centre so the waiting army stands at the edge of the base rather
   than in its streets, and one the door can actually reach. Kept on the building and re-found
   only if something is built over it. Delivered units attack-move there - a unit walking out
   while the base is under attack should fight on the way, not stroll past it - and teams recruit
   them from there exactly as they did from the doorway. */
var RTS_MUSTER_CLEAR = 2;       /* cells of open ground on every side of the point */
var RTS_MUSTER_REACH = 14;      /* how far from the building to look */
var RTS_MUSTER_ORE = 4;         /* cells kept between the patch and any ore */
var RTS_MUSTER_REF = 5;         /* ...and between it and any refinery */
function _rtsMusterClear(tx, tz) {
  for (var ox = -RTS_MUSTER_CLEAR; ox <= RTS_MUSTER_CLEAR; ox++)
    for (var oz = -RTS_MUSTER_CLEAR; oz <= RTS_MUSTER_CLEAR; oz++)
      if (_rtsBlocked(tx + ox, tz + oz, null)) return false;
  return true;
}
/* OUT OF THE HARVEST, TOO. The first cut only asked for clear ground, and clear ground is often
   the ore field's edge: refineries are placed hugging the ore, and "away from the base centre"
   from a factory frequently points the same way. The waiting army stood across the harvesters'
   road. Measured with basedef's setup, ten matches: the opponent's harvesters unloaded 8% less,
   down 27% on the worst seed, and three of its bases ended with a third of their defences - and
   switching the muster off alone put every figure back. */
function _rtsMusterAwayFromHarvest(tx, tz) {
  var G = window._rtsG, r = RTS_MUSTER_ORE + RTS_MUSTER_CLEAR, a, b;
  for (a = -r; a <= r; a++) for (b = -r; b <= r; b++) {
    if (_rtsInB(tx + a, tz + b) && G.scrap[_rtsIdx(tx + a, tz + b)] > 0) return false;
  }
  for (var i = 0; i < G.ents.length; i++) {
    var e = G.ents[i];
    if (e.dead || e.type !== 'struct' || e.def !== 'refinery') continue;
    var d = rtsStructDef(e.def);
    if (tx >= e.tx - RTS_MUSTER_REF && tx < e.tx + d.w + RTS_MUSTER_REF &&
        tz >= e.tz - RTS_MUSTER_REF && tz < e.tz + d.h + RTS_MUSTER_REF) return false;
  }
  return true;
}
function _rtsAIMuster(src) {
  /* kept while it is still good - re-found if the base has grown onto it, or the harvest has
     come to it: a refinery built nearby, or ore spreading to its edge */
  if (src.muster && _rtsMusterClear(src.muster.tx, src.muster.tz) &&
      _rtsMusterAwayFromHarvest(src.muster.tx, src.muster.tz)) return src.muster;
  var d = rtsStructDef(src.def), cx = src.tx + (d.w - 1) / 2, cz = src.tz + (d.h - 1) / 2;
  var c = _rtsBaseCentre(src.side);
  var ux = c ? cx - _rtsTX(c.x) : 0, uz = c ? cz - _rtsTX(c.z) : 0;
  var ul = Math.hypot(ux, uz);
  if (ul < 0.5) { ux = RTS_N / 2 - cx; uz = RTS_N / 2 - cz; ul = Math.hypot(ux, uz) || 1; }
  ux /= ul; uz /= ul;
  /* far enough out that the patch, and the units spread across it, clear the doorway: the
     clear radius plus two cells beyond the footprint's edge */
  var cand = [], R = RTS_MUSTER_REACH, near = Math.max(d.w, d.h) / 2 + RTS_MUSTER_CLEAR + 2;
  for (var tx = Math.round(cx) - R; tx <= Math.round(cx) + R; tx++) {
    for (var tz = Math.round(cz) - R; tz <= Math.round(cz) + R; tz++) {
      var dx = tx - cx, dz = tz - cz, dist = Math.hypot(dx, dz);
      if (dist < near || dist > R || !_rtsMusterClear(tx, tz) || !_rtsMusterAwayFromHarvest(tx, tz)) continue;
      cand.push([dist - (dx * ux + dz * uz) * 0.8, tx, tz]);
    }
  }
  cand.sort(function (p, q) { return p[0] - q[0] || p[1] - q[1] || p[2] - q[2]; });
  /* reachable from the door - a clear patch across a river is no use. A handful of tries, each
     one A* search, and the answer is kept, so this is paid once per building. */
  var door = _rtsExitCell(src, 0, 1);
  for (var i = 0; i < cand.length && i < 6; i++) {
    if (!door || _rtsPath(_rtsWX(door[0]), _rtsWX(door[1]), _rtsWX(cand[i][1]), _rtsWX(cand[i][2]), null)) {
      src.muster = { tx:cand[i][1], tz:cand[i][2] };
      return src.muster;
    }
  }
  return null;
}
/* THE MUSTER PATCH IS KEPT CLEAR. Without this the base grew over it: the army walked out of
   the doorway, and the next building went up beside the patch and made it a doorway again -
   measured on seed 9003, most of the Soviet army ended up waiting next to a factory that had
   not been there when it arrived. A footprint may not come within the patch's clear radius
   plus two cells of a production building's muster point. */
function _rtsOnMuster(tx, tz, w, h) {
  var G = window._rtsG, m = RTS_MUSTER_CLEAR + 2;
  for (var i = 0; i < G.ents.length; i++) {
    var e = G.ents[i];
    if (e.dead || e.type !== 'struct' || e.side !== 'enemy' || !e.muster) continue;
    if (e.muster.tx >= tx - m && e.muster.tx < tx + w + m &&
        e.muster.tz >= tz - m && e.muster.tz < tz + h + m) return true;
  }
  return false;
}
/* Walk a freshly delivered unit out to it, spread over the clear patch so a stream of them does
   not pile onto one cell. */
function _rtsAIMusterOut(u, src) {
  if (window.RTS_MUSTER_OFF) return false;       /* e2e/basespace's before-picture */
  var m = _rtsAIMuster(src);
  if (!m) return false;
  var k = u.id % 9;
  _rtsOrderMove(u, _rtsWX(m.tx) + ((k % 3) - 1) * RTS_TILE, _rtsWX(m.tz) + (((k / 3) | 0) - 1) * RTS_TILE, true);
  return !!u.path;
}
