/* core/mirror.js - the SEAT-FAIR map: the player's half of the generated ground, reflected onto the
   opponent's. Part of rts.core, the simulation.

   A generated map is fair only on average. Measured in self-play (docs/measuring.md): on one seed
   whichever army held the opponent's seat ended with about 80% of the field, so the seat outweighed
   everything a balance change could do. Reflected, every cell one seat sees, the other sees too -
   ground, rock, forest, roads, height, water and ore.

   REFLECTED ACROSS THE LINE HALFWAY BETWEEN THE BASES, not turned half a circle. The inlet runs down
   one flank parallel to the line between the starts (core/terrain.js), so a reflection keeps it on
   that flank as one body of water; a rotation would cut it in two and give each base a pond of its
   own with no navy able to reach the other. The starts are opposite points of a ring round the
   centre on one of four axes, so the reflection maps whole cells onto whole cells, and the
   player's start onto the opponent's. An extra seat's start reflects onto its counterpart's: the
   ally's onto the second foe's (scenario.js puts both on the same flank).

   Runs after the terrain, before any base is laid; the rolls drawn before it are unchanged, so a
   seed is the same map's left half either way. */
/* The reflection: the axis from the player's start to the opponent's in -1/0/1 steps, and k = |axis|^2,
   so a cell (x, z) maps to (x, z) - 2d*axis/k with d = ((x, z) - centre) . axis. Fractional cells
   (a unit's position) reflect by the same rule. */
function _rtsMirrorFrame(G) {
  var p = G.starts.player, e = G.starts.enemy, ax = Math.sign(e.tx - p.tx), az = Math.sign(e.tz - p.tz);
  return { c: RTS_N / 2, ax: ax, az: az, k: (ax && az) ? 2 : 1 };
}
function _rtsMirrorAt(F, x, z) {
  var d = (x - F.c) * F.ax + (z - F.c) * F.az;
  return { d: d, x: x - 2 * d * F.ax / F.k, z: z - 2 * d * F.az / F.k };
}
function _rtsMirrorMap(G) {
  var N = RTS_N, F = _rtsMirrorFrame(G), c = F.c, ax = F.ax, az = F.az, k = F.k;
  var A = [G.terrain, G.blocked, G.height, G.scrap, G.gems];
  for (var z = 0; z < N; z++) for (var x = 0; x < N; x++) {
    var d = (x - c) * ax + (z - c) * az;                             /* which side of the line, scaled */
    if (d >= 0) continue;                                            /* the opponent's half is written, not read */
    var rx = x - 2 * d * ax / k, rz = z - 2 * d * az / k;
    if (!_rtsInB(rx, rz)) continue;
    var from = _rtsIdx(x, z), to = _rtsIdx(rx, rz);
    for (var i = 0; i < A.length; i++) A[i][to] = A[i][from];
  }
}

/* THE OPPONENT'S BASE AS THE MIRROR OF THE ONE ALREADY LAID, slot by slot, when both seats open alike
   (self-play): each building goes on the reflection of the player's footprint - not of its corner,
   which is where the footprint is anchored, so a reflected corner would set it a cell or two off and
   erase a different patch of ore - and each unit on the reflection of where the player's stood. The
   opponent keeps its own army's keys (its own turret), which are the same size. A slot the player
   could not fill, or whose reflection is taken, is laid the ordinary way. */
function _rtsMirrorBase(G, placed, list, side, start, foe) {
  var F = _rtsMirrorFrame(G), rest = [];
  for (var i = 0; i < list.length; i++) {
    var src = placed[i], key = list[i][1];
    if (!src) { rest.push(list[i]); continue; }
    if (list[i][0] === 'unit') {
      var u = _rtsMirrorAt(F, src.x / RTS_TILE + RTS_N / 2 - 0.5, src.z / RTS_TILE + RTS_N / 2 - 0.5);
      if (!_rtsSpawnUnit(side, key, _rtsWX(u.x), _rtsWX(u.z))) rest.push(list[i]);
      continue;
    }
    var sd = rtsStructDef(src.def), a = _rtsMirrorAt(F, src.tx, src.tz), b = _rtsMirrorAt(F, src.tx + sd.w - 1, src.tz + sd.h - 1);
    var tx = Math.min(a.x, b.x), tz = Math.min(a.z, b.z), kd = rtsStructDef(key), free = true;
    for (var ox = 0; ox < kd.w; ox++) for (var oz = 0; oz < kd.h; oz++) if (!_rtsInB(tx + ox, tz + oz) || _rtsBlocked(tx + ox, tz + oz)) free = false;
    if (free) _rtsPlaceStruct(side, key, tx, tz, true); else rest.push(list[i]);
  }
  if (rest.length) _rtsLayBase(start, foe, rest, side, true);
}
