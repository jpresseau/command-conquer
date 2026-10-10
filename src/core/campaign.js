/* core/campaign.js - an authored mission on a generated map. Part of rts.core, the simulation.

   A mission (rules/campaign.js) is a seed, the armies, a setup and a check. The setup runs once,
   on the battle _rtsNewGame has just made: it clears what the mission does not want, lays what it
   does, and may cut the ground (a moat, an island). The check runs every tick in place of the
   skirmish's "lose every building and it is over" rule, which ended a base-less mission on its
   first tick: it keeps the objectives and calls the result.

   Everything the mission remembers is plain data on G.mission ({id, obj, ...}), looked up by id
   in RTS_CAMPAIGN, so the functions stay in the table and nothing callable is ever on G. A seat
   the mission does not want thinking is handed ctl 'none' (core/seats.js): its buildings stand
   and its guns fire, but no brain sells, builds or attacks with them. */

function _rtsMissionOf(id) {
  for (var i = 0; i < RTS_CAMPAIGN.length; i++) if (RTS_CAMPAIGN[i].id === id) return RTS_CAMPAIGN[i];
  return null;
}
/* Lay mission `id` onto the battle just made. */
function _rtsMissionSetup(G, id) {
  var m = _rtsMissionOf(id);
  if (!m) return null;
  G.mission = { id: id, obj: {}, t0: G.t, over: null, why: '' };
  m.setup(G, G.mission);
  _rtsRecalcPower('player'); _rtsRecalcPower('enemy');
  G.waypt = null;                       /* the waypoints are rebuilt on the ground the mission left */
  return G.mission;
}
/* Every tick, instead of the skirmish rule: the mission's check, and its verdict once. */
function _rtsMissionTick(G, dt) {
  var M = G.mission, m = _rtsMissionOf(M.id);
  if (!m || G.over) return;
  var r = m.check(G, M, dt);
  if (r) {
    G.over = r.over; M.why = r.why || '';
    if (r.over === 'win') G.sides.enemy.lost = true; else G.sides.player.lost = true;
  }
}
/* The objectives as the player reads them: [{text, done, failed}] */
function _rtsMissionGoals(G) {
  var M = G && G.mission, m = M && _rtsMissionOf(M.id);
  if (!m) return [];
  return m.goals.map(function (g) { var s = M.obj[g.id] || ''; return { text: typeof g.text === 'function' ? g.text(G, M) : g.text, done: s === 'done', failed: s === 'failed' }; });
}

/* ---- helpers the missions are written in ---- */
/* Take a side's whole presence off the map: buildings, units, its blueprint. */
function _rtsMClear(G, side) {
  G.ents.forEach(function (e) {
    if (e.side !== side || e.dead) return;
    if (e.type === 'struct') { _rtsFootprint(e, false); _rtsKillQuiet(e); } else { e.dead = true; e.hp = 0; }
  });
  G.ents = G.ents.filter(function (e) { return !e.dead; });
  if (G.base) G.base[side] = [];
}
/* n units of `key` for `side` near cell (tx, tz), tagged; returns them */
function _rtsMUnits(side, key, tx, tz, n, tag) {
  var out = [], d = rtsUnitDef(key), dom = d.sea ? 'sea' : (d.hover ? 'hover' : null);
  for (var i = 0; i < n; i++) {
    var c = _rtsNearestOpen(tx + (i % 3) - 1, tz + ((i / 3) | 0), 12, dom);
    if (!c) continue;
    var e = _rtsSpawnUnit(side, key, _rtsWX(c[0]), _rtsWX(c[1]));
    if (e) { e.tag = tag || null; out.push(e); }
  }
  return out;
}
/* a building of `key` for `side` as near (tx, tz) as it fits, built */
function _rtsMBuild(side, key, tx, tz, tag) {
  for (var r = 0; r < 14; r++) for (var a = 0; a < 12; a++) {
    var x = Math.round(tx + Math.cos(a / 12 * 6.283) * r), z = Math.round(tz + Math.sin(a / 12 * 6.283) * r);
    if (!_rtsCanPlace(side, key, x, z, true)) continue;
    var b = _rtsPlaceStruct(side, key, x, z, true);
    if (b) { b.building = 0; b.hp = b.maxHp; b.tag = tag || null; return b; }
  }
  return null;
}
function _rtsMTagged(G, tag) { return G.ents.filter(function (e) { return !e.dead && e.tag === tag; }); }
function _rtsMNear(e, tx, tz, r) { return Math.hypot(e.x - _rtsWX(tx), e.z - _rtsWX(tz)) <= r * RTS_TILE; }
function _rtsMAlive(G, side, type) { return G.ents.filter(function (e) { return !e.dead && e.side === side && (!type || e.type === type); }).length; }
/* the water: its cells and their centre */
function _rtsMWater(G) {
  var n = 0, sx = 0, sz = 0, cells = [];
  for (var i = 0; i < RTS_N * RTS_N; i++) if (G.terrain[i] === RTS_T_WATER && !_rtsIsBridgeCell(i)) { var x = i % RTS_N, z = (i / RTS_N) | 0; n++; sx += x; sz += z; cells.push(i); }
  return { n: n, tx: n ? Math.round(sx / n) : RTS_N >> 1, tz: n ? Math.round(sz / n) : RTS_N >> 1, cells: cells };
}
/* Cut a ring of open water between radii r0 and r1 round (cx, cz): a moat, for an island */
function _rtsMMoat(G, cx, cz, r0, r1) {
  for (var z = cz - r1; z <= cz + r1; z++) for (var x = cx - r1; x <= cx + r1; x++) {
    if (!_rtsInB(x, z)) continue;
    var d = Math.hypot(x - cx, z - cz), i = _rtsIdx(x, z);
    if (d < r0 || d > r1 || G.owner[i]) continue;
    G.terrain[i] = RTS_T_WATER; G.blocked[i] = 2; G.scrap[i] = 0;   /* 2: water, as the generator marks it (1 is a building) */ G.gems[i] = 0; G.height[i] = 0;
  }
  G.roads = [];
}
/* Cut a strait of open water `half` cells either side of the line through (cx, cz) with normal
   (nx, nz), edge to edge. Eight wide or less, it is all flats: dry ground at low water, sea at high. */
function _rtsMStrait(G, cx, cz, nx, nz, half) {
  for (var z = 0; z < RTS_N; z++) for (var x = 0; x < RTS_N; x++) {
    var d = Math.abs((x - cx) * nx + (z - cz) * nz), i = _rtsIdx(x, z);
    if (d > half || G.owner[i]) continue;
    G.terrain[i] = RTS_T_WATER; G.blocked[i] = 2; G.scrap[i] = 0; G.gems[i] = 0; G.height[i] = 0;
  }
  G.roads = []; G.bridges = [];
}
