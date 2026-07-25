/* RC COMMAND - simulation core. Pure game state + logic; no rendering in this file.
   rts.render.js owns every pixel, rts.ui.js owns the DOM. Keeping the sim renderer-free
   means the whole battle can be stepped headlessly (which is how it gets verified) - and it
   is what allowed the renderer to be swapped from three.js to canvas 2D without touching a
   line of this file.

   The world is a fixed grid (RTS_N x RTS_N). Structures occupy whole tiles and block
   them; units move continuously and avoid each other with soft separation rather than
   tile reservation, so a traffic jam resolves itself instead of deadlocking. */

window._rtsG = null;

/* ------------------------------------------------------------- grid helpers */
function _rtsIdx(tx, tz) { return tz * RTS_N + tx; }
function _rtsInB(tx, tz) { return tx >= 0 && tz >= 0 && tx < RTS_N && tz < RTS_N; }
function _rtsWX(tx) { return (tx - RTS_N / 2 + 0.5) * RTS_TILE; }          /* tile -> world centre */
function _rtsTX(x)  { return Math.floor(x / RTS_TILE + RTS_N / 2); }        /* world -> tile */
function _rtsBlocked(tx, tz) { var G = window._rtsG; return !_rtsInB(tx, tz) || G.blocked[_rtsIdx(tx, tz)] !== 0; }

/* Deterministic PRNG so a given seed always lays out the same battlefield. */
function _rtsRngMake(seed) {
  var s = (seed || 1) >>> 0;
  return function () { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

/* --------------------------------------------------------------------- A* --
   8-way octile A* over the blocked grid. Diagonals are refused when they would cut
   a blocked corner, so units never clip through a building corner. Returns an array
   of world-space waypoints, string-pulled so the path reads as straight runs rather
   than a staircase. */
var _rtsPF = null;
function _rtsPathfindInit() {
  var n = RTS_N * RTS_N;
  _rtsPF = { g:new Float32Array(n), f:new Float32Array(n), came:new Int32Array(n), state:new Uint8Array(n), stamp:new Int32Array(n), run:0, heap:new Int32Array(n + 1), hn:0 };
}
function _rtsHeapPush(i) {
  var P = _rtsPF, h = P.heap, k = ++P.hn; h[k] = i;
  while (k > 1) { var p = k >> 1; if (P.f[h[p]] <= P.f[h[k]]) break; var t = h[p]; h[p] = h[k]; h[k] = t; k = p; }
}
function _rtsHeapPop() {
  var P = _rtsPF, h = P.heap, top = h[1]; h[1] = h[P.hn--]; var k = 1;
  for (;;) { var l = k << 1, r = l + 1, m = k;
    if (l <= P.hn && P.f[h[l]] < P.f[h[m]]) m = l;
    if (r <= P.hn && P.f[h[r]] < P.f[h[m]]) m = r;
    if (m === k) break; var t = h[m]; h[m] = h[k]; h[k] = t; k = m; }
  return top;
}
/* Nearest tile that is not blocked, searched as expanding rings. */
function _rtsNearestOpen(tx, tz, maxR) {
  if (!_rtsBlocked(tx, tz)) return [tx, tz];
  for (var r = 1; r <= (maxR || 8); r++) {
    var best = null, bd = 1e9;
    for (var ox = -r; ox <= r; ox++) for (var oz = -r; oz <= r; oz++) {
      if (Math.max(Math.abs(ox), Math.abs(oz)) !== r) continue;
      var cx = tx + ox, cz = tz + oz;
      if (_rtsBlocked(cx, cz)) continue;
      var d = ox * ox + oz * oz;
      if (d < bd) { bd = d; best = [cx, cz]; }
    }
    if (best) return best;
  }
  return null;
}
function _rtsPath(sx, sz, gx, gz) {
  if (!_rtsPF) _rtsPathfindInit();
  var P = _rtsPF, run = ++P.run;
  var stx = _rtsTX(sx), stz = _rtsTX(sz), gtx = _rtsTX(gx), gtz = _rtsTX(gz);
  if (!_rtsInB(stx, stz)) return null;
  /* A unit can legitimately be standing on a blocked tile - it spawned inside its own
     factory's footprint, or a building went up over it. A* from a blocked start dead-ends
     immediately (every neighbour is inside the same footprint), which used to strand the
     unit permanently. Step it out to the nearest open tile first, then path from there. */
  if (_rtsBlocked(stx, stz)) {
    var esc = _rtsNearestOpen(stx, stz, 10);
    if (!esc) return null;
    var ex = _rtsWX(esc[0]), ez = _rtsWX(esc[1]);
    var rest = _rtsPath(ex, ez, gx, gz);
    return [{ x:ex, z:ez }].concat(rest || []);
  }
  /* If the goal tile is blocked (ordered onto a building), walk outwards to the nearest
     open tile so "attack that refinery" still produces a path that arrives beside it. */
  if (!_rtsInB(gtx, gtz) || _rtsBlocked(gtx, gtz)) {
    var best = null, bd = 1e9;
    for (var rr = 1; rr <= 6 && !best; rr++) {
      for (var ox = -rr; ox <= rr; ox++) for (var oz = -rr; oz <= rr; oz++) {
        if (Math.max(Math.abs(ox), Math.abs(oz)) !== rr) continue;
        var cx = gtx + ox, cz = gtz + oz; if (_rtsBlocked(cx, cz)) continue;
        var d = (cx - gtx) * (cx - gtx) + (cz - gtz) * (cz - gtz);
        if (d < bd) { bd = d; best = [cx, cz]; }
      }
    }
    if (!best) return null;
    gtx = best[0]; gtz = best[1];
  }
  var start = _rtsIdx(stx, stz), goal = _rtsIdx(gtx, gtz);
  if (start === goal) return [{ x:gx, z:gz }];
  P.hn = 0;
  function H(i) { var ax = Math.abs((i % RTS_N) - gtx), az = Math.abs(((i / RTS_N) | 0) - gtz);
    return (ax > az) ? (ax - az) + 1.41421 * az : (az - ax) + 1.41421 * ax; }
  P.g[start] = 0; P.f[start] = H(start); P.stamp[start] = run; P.state[start] = 1; _rtsHeapPush(start);
  var found = false, guard = 0;
  while (P.hn > 0 && guard++ < 60000) {
    var cur = _rtsHeapPop();
    if (P.state[cur] === 2) continue;
    P.state[cur] = 2;
    if (cur === goal) { found = true; break; }
    var cx2 = cur % RTS_N, cz2 = (cur / RTS_N) | 0;
    for (var dx = -1; dx <= 1; dx++) for (var dz = -1; dz <= 1; dz++) {
      if (!dx && !dz) continue;
      var nx = cx2 + dx, nz = cz2 + dz;
      if (_rtsBlocked(nx, nz)) continue;
      if (dx && dz && (_rtsBlocked(cx2 + dx, cz2) || _rtsBlocked(cx2, cz2 + dz))) continue; /* no corner cutting */
      var ni = _rtsIdx(nx, nz);
      if (P.stamp[ni] === run && P.state[ni] === 2) continue;
      var ng = P.g[cur] + ((dx && dz) ? 1.41421 : 1);
      if (P.stamp[ni] !== run) { P.stamp[ni] = run; P.state[ni] = 0; P.g[ni] = 1e9; }
      if (ng < P.g[ni]) { P.g[ni] = ng; P.f[ni] = ng + H(ni); P.came[ni] = cur; P.state[ni] = 1; _rtsHeapPush(ni); }
    }
  }
  if (!found) return null;
  var tiles = [], c = goal, safety = 0;
  while (c !== start && safety++ < 20000) { tiles.push(c); c = P.came[c]; }
  tiles.reverse();
  /* string-pull: drop a waypoint whenever the line to the next-but-one is clear */
  var pts = [];
  for (var i = 0; i < tiles.length; i++) pts.push({ x:_rtsWX(tiles[i] % RTS_N), z:_rtsWX((tiles[i] / RTS_N) | 0) });
  if (pts.length) { pts[pts.length - 1] = { x:gx, z:gz }; }
  var out = [], px = sx, pz = sz, j = 0;
  while (j < pts.length) {
    var far = j;
    for (var k = pts.length - 1; k > j; k--) { if (_rtsClearLine(px, pz, pts[k].x, pts[k].z)) { far = k; break; } }
    out.push(pts[far]); px = pts[far].x; pz = pts[far].z; j = far + 1;
  }
  return out;
}
/* Bresenham-ish sample along the segment; true when no blocked tile is crossed. */
function _rtsClearLine(x0, z0, x1, z1) {
  var d = Math.hypot(x1 - x0, z1 - z0), steps = Math.ceil(d / (RTS_TILE * 0.4));
  if (steps <= 0) return true;
  for (var i = 0; i <= steps; i++) {
    var t = i / steps;
    if (_rtsBlocked(_rtsTX(x0 + (x1 - x0) * t), _rtsTX(z0 + (z1 - z0) * t))) return false;
  }
  return true;
}

/* ------------------------------------------------------------------ state */
function _rtsSideNew(key) {
  return { key:key, credits:RTS_START_CREDITS, powerMade:0, powerUsed:0,
    q:{ struct:null, infantry:null, vehicle:null },   /* one build line per category, like the classic sidebar */
    ready:null,                                        /* finished structure awaiting placement */
    lost:false };
}
function _rtsNewGame(seed) {
  var G = {
    t:0, seed:seed || 12345, over:null, msg:null, msgT:0,
    blocked:new Uint8Array(RTS_N * RTS_N),
    scrap:new Float32Array(RTS_N * RTS_N),
    owner:new Int32Array(RTS_N * RTS_N),   /* entity id occupying the tile, 0 = none */
    ents:[], byId:{}, nextId:1,
    sel:[], proj:[], fx:[],
    sides:{ player:_rtsSideNew('player'), enemy:_rtsSideNew('enemy') },
    ai:{ next:RTS_WAVE_FIRST, wave:0, build:6 },
    stats:{ killed:0, lostU:0 }
  };
  window._rtsG = G;
  _rtsPathfindInit();
  var rnd = _rtsRngMake(G.seed);

  /* --- ore fields: a few blobs, biggest ones out in the contested middle --- */
  var fields = [[28,82,7],[82,28,7],[38,38,6],[74,74,6],[56,56,10],[22,32,5],[90,80,5],[34,62,5],[78,50,5]];
  for (var f = 0; f < fields.length; f++) {
    var cx = fields[f][0], cz = fields[f][1], rad = fields[f][2];
    for (var tx = cx - rad; tx <= cx + rad; tx++) for (var tz = cz - rad; tz <= cz + rad; tz++) {
      if (!_rtsInB(tx, tz)) continue;
      var d = Math.hypot(tx - cx, tz - cz);
      if (d > rad) continue;
      var amt = RTS_SCRAP_TILE * (1 - d / (rad + 1)) * (0.6 + rnd() * 0.6);
      if (amt > 40) G.scrap[_rtsIdx(tx, tz)] = amt;
    }
  }
  /* --- impassable rock outcrops, kept off the bases and off the scrap --- */
  for (var r = 0; r < 62; r++) {
    var rx = 6 + ((rnd() * (RTS_N - 12)) | 0), rz = 6 + ((rnd() * (RTS_N - 12)) | 0);
    if (Math.hypot(rx - 20, rz - 90) < 20 || Math.hypot(rx - 92, rz - 22) < 20) continue;
    var rw = 1 + ((rnd() * 3) | 0), rh = 1 + ((rnd() * 3) | 0);
    for (var ax = rx; ax < rx + rw; ax++) for (var az = rz; az < rz + rh; az++) {
      if (!_rtsInB(ax, az) || G.scrap[_rtsIdx(ax, az)] > 0) continue;
      G.blocked[_rtsIdx(ax, az)] = 2;  /* 2 = terrain (never cleared) */
    }
  }

  /* --- the two bases: player bottom-left, Redline top-right.
     Footprints are small (Command Yard 3x3) so a base is a cluster of compact structures
     on a large map, the way the originals laid out - not a few slabs filling the screen. --- */
  _rtsPlaceStruct('player', 'yard', 18, 88, true);
  _rtsPlaceStruct('player', 'power', 23, 89, true);
  _rtsSpawnUnit('player', 'rifle', _rtsWX(21), _rtsWX(84));
  _rtsSpawnUnit('player', 'rifle', _rtsWX(23), _rtsWX(85));
  _rtsSpawnUnit('player', 'buggy', _rtsWX(19), _rtsWX(85));

  _rtsPlaceStruct('enemy', 'yard', 91, 20, true);
  _rtsPlaceStruct('enemy', 'power', 87, 21, true);
  _rtsPlaceStruct('enemy', 'refinery', 91, 25, true);
  _rtsPlaceStruct('enemy', 'barracks', 87, 25, true);
  _rtsPlaceStruct('enemy', 'factory', 95, 24, true);
  _rtsPlaceStruct('enemy', 'turret', 89, 29, true);
  _rtsPlaceStruct('enemy', 'turret', 94, 29, true);
  _rtsSpawnUnit('enemy', 'harvester', _rtsWX(92), _rtsWX(32));
  _rtsSpawnUnit('enemy', 'rifle', _rtsWX(89), _rtsWX(32));
  _rtsSpawnUnit('enemy', 'tank', _rtsWX(94), _rtsWX(33));

  _rtsRecalcPower('player'); _rtsRecalcPower('enemy');
  return G;
}

/* ------------------------------------------------------------- entities */
function _rtsFootprint(e, on) {
  var G = window._rtsG, d = rtsStructDef(e.def);
  for (var tx = e.tx; tx < e.tx + d.w; tx++) for (var tz = e.tz; tz < e.tz + d.h; tz++) {
    if (!_rtsInB(tx, tz)) continue;
    var i = _rtsIdx(tx, tz);
    if (on) {
      G.blocked[i] = 1; G.owner[i] = e.id;
      /* the ground under a structure is cleared - otherwise the starting bases (which are
         placed without the player's build check) end up with crystals poking through them */
      if (G.scrap[i] > 0) { G.scrap[i] = 0; G.scrapDirty = true; }
    }
    else if (G.owner[i] === e.id) { G.blocked[i] = 0; G.owner[i] = 0; }
  }
}
function _rtsCanPlace(side, key, tx, tz) {
  var G = window._rtsG, d = rtsStructDef(key);
  if (!d) return false;
  for (var ax = tx; ax < tx + d.w; ax++) for (var az = tz; az < tz + d.h; az++) {
    if (!_rtsInB(ax, az)) return false;
    if (G.blocked[_rtsIdx(ax, az)] !== 0) return false;
    if (G.scrap[_rtsIdx(ax, az)] > 0) return false;
  }
  /* must be within build radius of one of your own structures (classic base-creep rule) */
  var cx = tx + d.w / 2, cz = tz + d.h / 2, near = false;
  for (var i = 0; i < G.ents.length; i++) {
    var o = G.ents[i];
    if (o.type !== 'struct' || o.side !== side || o.dead || o.building) continue;
    var od = rtsStructDef(o.def);
    if (Math.hypot(cx - (o.tx + od.w / 2), cz - (o.tz + od.h / 2)) <= RTS_BUILD_RADIUS) { near = true; break; }
  }
  return near;
}
function _rtsPlaceStruct(side, key, tx, tz, instant) {
  var G = window._rtsG, d = rtsStructDef(key);
  var e = { id:G.nextId++, type:'struct', side:side, def:key, tx:tx, tz:tz,
    x:_rtsWX(tx) + (d.w - 1) * RTS_TILE / 2, z:_rtsWX(tz) + (d.h - 1) * RTS_TILE / 2,
    hp:instant ? d.hp : d.hp * 0.15, maxHp:d.hp, rot:0, cool:0, target:null,
    building:instant ? 0 : 1, bprog:instant ? 1 : 0, dead:false, mesh:null };
  G.ents.push(e); G.byId[e.id] = e;
  _rtsFootprint(e, true);
  _rtsRecalcPower(side);
  /* Only a pre-placed (instant) structure hands over its free unit here. A structure that
     has to be built delivers it in _rtsUpdateStruct when construction finishes - granting
     it in both places gave every constructed refinery two harvesters for the price of one. */
  if (instant && d.freeUnit) _rtsSpawnAt(side, d.freeUnit, e);
  return e;
}
/* Spawn a unit just outside `src`, on ground that is actually open. Without the open-tile
   search a refinery's free harvester can land inside a neighbouring building's footprint. */
function _rtsSpawnAt(side, key, src) {
  var d = rtsStructDef(src.def);
  var out = Math.max(d.w, d.h) * RTS_TILE * 0.5 + RTS_TILE * 1.2;
  for (var i = 0; i < 16; i++) {
    var a = (side === 'player' ? 0.5 : Math.PI + 0.5) + i * (Math.PI * 2 / 16);
    var x = src.x + Math.cos(a) * out, z = src.z + Math.sin(a) * out;
    var tx = _rtsTX(x), tz = _rtsTX(z);
    if (!_rtsBlocked(tx, tz)) return _rtsSpawnUnit(side, key, _rtsWX(tx), _rtsWX(tz));
  }
  var open = _rtsNearestOpen(_rtsTX(src.x), _rtsTX(src.z), 12);
  return open ? _rtsSpawnUnit(side, key, _rtsWX(open[0]), _rtsWX(open[1])) : null;
}
function _rtsSpawnUnit(side, key, x, z) {
  var G = window._rtsG, d = rtsUnitDef(key);
  if (!d) return null;
  var e = { id:G.nextId++, type:'unit', side:side, def:key, x:x, z:z, rot:side === 'player' ? 0 : Math.PI,
    hp:d.hp, maxHp:d.hp, r:d.r, cool:0, path:null, pi:0, order:null, target:null,
    carry:0, hstate:null, htile:null, dead:false, mesh:null, turret:0, fire:0 };
  G.ents.push(e); G.byId[e.id] = e;
  return e;
}
function _rtsKill(e) {
  var G = window._rtsG;
  if (e.dead) return;
  e.dead = true;
  if (e.type === 'struct') { _rtsFootprint(e, false); _rtsRecalcPower(e.side); }
  G.fx.push({ kind:e.type === 'struct' ? 'boom' : 'pop', x:e.x, y:1, z:e.z, t:0,
    big:e.type === 'struct' ? Math.max(2, rtsStructDef(e.def).w * 0.7) : 1 });
  if (typeof _rtsSfx === 'function') _rtsSfx(e.type === 'struct' ? 'boom' : 'pop', e.x, e.z);
  if (e.side === 'player' && e.type === 'unit') G.stats.lostU++;
  if (e.side === 'enemy') G.stats.killed++;
  var si = G.sel.indexOf(e); if (si >= 0) G.sel.splice(si, 1);
}
function _rtsRecalcPower(side) {
  var G = window._rtsG, made = 0, used = 0;
  for (var i = 0; i < G.ents.length; i++) {
    var e = G.ents[i];
    if (e.type !== 'struct' || e.side !== side || e.dead || e.building) continue;
    var d = rtsStructDef(e.def);
    if (d.power > 0) made += d.power; else used += -d.power;
  }
  G.sides[side].powerMade = made; G.sides[side].powerUsed = used;
}
function _rtsPowerFactor(side) {
  var s = window._rtsG.sides[side];
  if (s.powerUsed <= s.powerMade) return 1;
  return Math.max(RTS_LOW_POWER_MIN, s.powerMade / Math.max(1, s.powerUsed));
}
function _rtsHas(side, key) {
  var G = window._rtsG;
  for (var i = 0; i < G.ents.length; i++) {
    var e = G.ents[i];
    if (e.type === 'struct' && e.side === side && e.def === key && !e.dead && !e.building) return e;
  }
  return null;
}
function _rtsAvailable(side, def) {
  if (!def.needs) return true;
  for (var i = 0; i < def.needs.length; i++) if (!_rtsHas(side, def.needs[i])) return false;
  return true;
}

/* --------------------------------------------------------- production */
function _rtsQueueCat(key) {
  var s = rtsStructDef(key); if (s) return 'struct';
  var u = rtsUnitDef(key); return u ? u.kind : null;
}
function _rtsCanQueue(side, key) {
  var G = window._rtsG, S = G.sides[side];
  var cat = _rtsQueueCat(key); if (!cat) return false;
  if (S.q[cat]) return false;
  if (cat === 'struct' && S.ready) return false;
  var def = rtsStructDef(key) || rtsUnitDef(key);
  if (!_rtsAvailable(side, def)) return false;
  if (cat === 'infantry' && !_rtsHas(side, 'barracks')) return false;
  if (cat === 'vehicle' && !_rtsHas(side, 'factory')) return false;
  if (S.credits < def.cost) return false;
  return true;
}
function _rtsQueue(side, key) {
  if (!_rtsCanQueue(side, key)) return false;
  var S = window._rtsG.sides[side], def = rtsStructDef(key) || rtsUnitDef(key);
  S.q[_rtsQueueCat(key)] = { key:key, prog:0, total:Math.max(0.1, def.build), cost:def.cost, paid:0 };
  return true;
}
function _rtsCancel(side, cat) {
  var S = window._rtsG.sides[side], q = S.q[cat];
  if (!q) return;
  S.credits += q.paid;         /* refund what was actually spent */
  S.q[cat] = null;
}
function _rtsTickProduction(side, dt) {
  var G = window._rtsG, S = G.sides[side], pf = _rtsPowerFactor(side), cat;
  for (cat in S.q) {
    var q = S.q[cat]; if (!q) continue;
    var rate = dt / q.total * pf;                  /* fraction of the job done this step */
    var want = q.cost * rate;
    if (want > S.credits) { want = S.credits; rate = q.cost > 0 ? want / q.cost : rate; }
    if (q.cost > 0 && want <= 0) continue;          /* broke: the line stalls, as it should */
    S.credits -= want; q.paid += want; q.prog += rate;
    if (q.prog >= 1) {
      S.q[cat] = null;
      if (cat === 'struct') S.ready = q.key;        /* wait for the player to place it */
      else _rtsDeliverUnit(side, q.key);
      if (side === 'player' && typeof _rtsSfx === 'function') _rtsSfx(cat === 'struct' ? 'ready' : 'unitready');
    }
  }
}
function _rtsDeliverUnit(side, key) {
  var u = rtsUnitDef(key);
  var src = _rtsHas(side, u.kind === 'infantry' ? 'barracks' : 'factory') || _rtsHas(side, 'yard');
  if (!src) return null;
  return _rtsSpawnAt(side, key, src);
}

/* ------------------------------------------------------------- orders */
function _rtsOrderMove(e, x, z, attackMove) {
  if (e.type !== 'unit') return;
  e.order = attackMove ? 'amove' : 'move';
  e.target = null; e.hstate = null;
  e.goal = { x:x, z:z };                       /* remembered so a blocked repath keeps aiming here */
  e.path = _rtsPath(e.x, e.z, x, z); e.pi = 0;
  if (!e.path) { e.order = null; }
}
function _rtsOrderAttack(e, tgt) {
  if (e.type !== 'unit') return;
  var d = rtsUnitDef(e.def);
  if (!d.weapon) { _rtsOrderMove(e, tgt.x, tgt.z, false); return; }
  e.order = 'attack'; e.target = tgt; e.hstate = null;
  e.goal = { x:tgt.x, z:tgt.z };
  e.path = _rtsPath(e.x, e.z, tgt.x, tgt.z); e.pi = 0;
}
function _rtsOrderHarvest(e, tx, tz) {
  var d = rtsUnitDef(e.def);
  if (!d.harvest) return;
  e.order = 'harvest'; e.target = null;
  e.htile = (tx != null) ? { tx:tx, tz:tz } : null;
  e.hstate = e.carry >= d.capacity ? 'toRef' : 'toField';
  e.path = null;
}

/* ------------------------------------------------------------- combat */
function _rtsDist(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }
/* Structures are big: measure to the edge of the footprint, not the centre, or nothing
   can ever shoot a 5x5 refinery from its stated range. */
function _rtsRangeTo(a, b) {
  var d = _rtsDist(a, b);
  if (b.type === 'struct') { var sd = rtsStructDef(b.def); d -= Math.min(sd.w, sd.h) * RTS_TILE * 0.45; }
  return Math.max(0, d);
}
function _rtsEnemyOf(side) { return side === 'player' ? 'enemy' : 'player'; }
function _rtsFindTarget(e, range) {
  var G = window._rtsG, foe = _rtsEnemyOf(e.side), best = null, bd = 1e9;
  for (var i = 0; i < G.ents.length; i++) {
    var o = G.ents[i];
    if (o.dead || o.side !== foe) continue;
    var d = _rtsRangeTo(e, o);
    if (d > range) continue;
    /* prefer units over buildings at equal-ish distance - shoot the thing shooting you */
    var score = d + (o.type === 'struct' ? 8 : 0);
    if (score < bd) { bd = score; best = o; }
  }
  return best;
}
function _rtsFire(e, tgt, w) {
  var G = window._rtsG;
  e.cool = w.cool; e.fire = 0.09;
  if (typeof _rtsSfx === 'function') _rtsSfx(w.shot === 'tracer' ? (w.dmg > 7 ? 'mg' : 'rifle')
    : (w.shot === 'missile' ? 'rocket' : (e.type === 'struct' ? 'turretgun' : 'cannon')), e.x, e.z);
  var dmg = w.dmg * (w.vs[rtsArmour(tgt)] || 1);
  if (w.speed <= 0) {
    _rtsDamage(tgt, dmg, e);
    G.fx.push({ kind:'tracer', x:e.x, y:1.3, z:e.z, x2:tgt.x, y2:1.3, z2:tgt.z, t:0 });
  } else {
    var d = Math.hypot(tgt.x - e.x, tgt.z - e.z) || 1;
    G.proj.push({ kind:w.shot, x:e.x, y:1.4, z:e.z, vx:(tgt.x - e.x) / d * w.speed, vz:(tgt.z - e.z) / d * w.speed,
      speed:w.speed, tgt:tgt, dmg:dmg, splash:w.splash, side:e.side, life:4, w:w });
  }
}
function _rtsDamage(tgt, dmg, from) {
  if (!tgt || tgt.dead) return;
  tgt.hp -= dmg;
  tgt.hitT = 0.18;
  /* an idle unit that gets shot shoots back instead of standing there */
  if (tgt.type === 'unit' && from && !tgt.order && rtsUnitDef(tgt.def).weapon) { tgt.order = 'attack'; tgt.target = from; }
  if (tgt.hp <= 0) _rtsKill(tgt);
}
function _rtsSplash(x, z, rad, dmg, side) {
  var G = window._rtsG, foe = _rtsEnemyOf(side);
  for (var i = 0; i < G.ents.length; i++) {
    var o = G.ents[i];
    if (o.dead || o.side !== foe) continue;
    var d = Math.hypot(o.x - x, o.z - z);
    if (d > rad) continue;
    _rtsDamage(o, dmg * (1 - d / rad) * 0.6, null);
  }
}

/* --------------------------------------------------------- unit update */
function _rtsSteer(e, dt, d) {
  /* Follow the current path with a capped turn rate, then push apart from neighbours.
     Separation runs after movement so units settle into a loose formation instead of
     stacking into a single point. */
  if (!e.path || e.pi >= e.path.length) { e.path = null; return false; }
  var wp = e.path[e.pi], dx = wp.x - e.x, dz = wp.z - e.z, dist = Math.hypot(dx, dz);
  var last = (e.pi === e.path.length - 1);
  if (dist < (last ? d.r * 0.9 + 0.4 : RTS_TILE * 0.55)) {
    e.pi++;
    if (e.pi >= e.path.length) { e.path = null; return false; }
    return true;
  }
  var want = Math.atan2(dz, dx), diff = want - e.rot;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  var turn = Math.min(Math.abs(diff), d.turn * dt) * (diff < 0 ? -1 : 1);
  e.rot += turn;
  /* a vehicle slows while it is still swinging round; infantry just walk */
  var align = Math.max(0, 1 - Math.abs(diff) / 1.6);
  var sp = d.speed * (d.kind === 'infantry' ? Math.max(0.35, align) : align * align);
  var nx = e.x + Math.cos(e.rot) * sp * dt, nz = e.z + Math.sin(e.rot) * sp * dt;
  /* While standing on a blocked tile, movement is unrestricted - that is how a unit
     extracts itself from a footprint it ended up inside. Blocking it here as well would
     make the escape waypoint unreachable and re-trap it. */
  var freeing = _rtsBlocked(_rtsTX(e.x), _rtsTX(e.z));
  if (!freeing && _rtsBlocked(_rtsTX(nx), _rtsTX(nz))) {
    e.stuck = (e.stuck || 0) + dt;
    /* Repath to the FINAL destination, not to the waypoint we happen to be blocked on.
       Repathing to the waypoint loses the real goal: a unit whose path was cut short (e.g.
       it started inside a footprint and only got an escape waypoint) would otherwise spend
       forever re-targeting the tile it is already standing on. */
    if (e.stuck > 0.5) {
      var g = e.goal || wp;
      e.path = _rtsPath(e.x, e.z, g.x, g.z); e.pi = 0; e.stuck = 0;
    }
    /* Last-resort unstick. A unit can end up genuinely wedged - pinned against a footprint
       by the units behind it, with every forward step blocked and every repath returning the
       same blocked line. After a few seconds of getting nowhere, lift it to the nearest open
       tile. Bounded and rare, and it beats a unit that ignores orders for the rest of the
       match; every real RTS has some version of this. */
    e.jam = (e.jam || 0) + dt;
    if (e.jam > 3) {
      var open = _rtsNearestOpen(_rtsTX(e.x), _rtsTX(e.z), 6);
      if (open) { e.x = _rtsWX(open[0]); e.z = _rtsWX(open[1]); }
      e.jam = 0; e.stuck = 0;
      var g2 = e.goal || wp;
      e.path = _rtsPath(e.x, e.z, g2.x, g2.z); e.pi = 0;
    }
    return true;
  }
  e.stuck = 0; e.jam = 0; e.x = nx; e.z = nz;
  return true;
}
function _rtsSeparate(dt) {
  var G = window._rtsG, i, j;
  var buckets = {}, cell = RTS_TILE * 2;
  for (i = 0; i < G.ents.length; i++) {
    var e = G.ents[i];
    if (e.dead || e.type !== 'unit') continue;
    var k = ((e.x / cell) | 0) + ':' + ((e.z / cell) | 0);
    (buckets[k] || (buckets[k] = [])).push(e);
  }
  for (var key in buckets) {
    var parts = key.split(':'), bx = +parts[0], bz = +parts[1], near = [];
    for (var ox = -1; ox <= 1; ox++) for (var oz = -1; oz <= 1; oz++) {
      var b = buckets[(bx + ox) + ':' + (bz + oz)];
      if (b) near = near.concat(b);
    }
    var mine = buckets[key];
    for (i = 0; i < mine.length; i++) {
      var a = mine[i];
      for (j = 0; j < near.length; j++) {
        var o = near[j];
        if (o === a || o.dead) continue;
        var dx = a.x - o.x, dz = a.z - o.z, d2 = dx * dx + dz * dz, min = a.r + o.r;
        if (d2 >= min * min || d2 < 1e-6) continue;
        var d = Math.sqrt(d2), push = (min - d) * 0.5;
        var ux = dx / d * push, uz = dz / d * push;
        var ax = a.x + ux, az = a.z + uz;
        /* If a is already standing on a blocked tile, take the push unconditionally - it is
           trying to get out. Refusing it there is what leaves the odd unit jammed inside a
           footprint while its neighbours shove it back in every frame. */
        if (_rtsBlocked(_rtsTX(a.x), _rtsTX(a.z)) || !_rtsBlocked(_rtsTX(ax), _rtsTX(az))) { a.x = ax; a.z = az; }
      }
    }
  }
}
function _rtsUpdateUnit(e, dt) {
  var G = window._rtsG, d = rtsUnitDef(e.def), w = d.weapon ? RTS_WEAPONS[d.weapon] : null;
  if (e.cool > 0) e.cool -= dt;
  if (e.fire > 0) e.fire -= dt;
  if (e.hitT > 0) e.hitT -= dt;

  /* ---- harvester economy loop ---- */
  if (d.harvest) { _rtsUpdateHarvester(e, dt, d); return; }

  /* ---- engage ---- */
  var tgt = e.target;
  if (tgt && tgt.dead) { tgt = e.target = null; if (e.order === 'attack') e.order = null; }
  if (w && !tgt && (e.order === 'amove' || !e.order)) {
    tgt = _rtsFindTarget(e, d.sight);
    if (tgt) { e.target = tgt; if (!e.order) { e.order = 'attack'; e.path = null; } }
  }
  if (w) {
    /* Pick what we can actually shoot THIS frame: the ordered target when it is in range,
       otherwise whatever else already is. Without the fallback, a column marching on a
       distant building walks through turret fire without ever shooting back - which made
       an assault lose fifty tanks while killing one defender. */
    var shootAt = null, chasing = false;
    if (tgt) {
      if (_rtsRangeTo(e, tgt) <= w.range) shootAt = tgt;
      else { chasing = true; shootAt = _rtsFindTarget(e, w.range); }
    }
    if (shootAt) {
      /* turret tracks its mark even while the hull is still swinging round */
      var ta = Math.atan2(shootAt.z - e.z, shootAt.x - e.x), td = ta - e.turret;
      while (td > Math.PI) td -= Math.PI * 2; while (td < -Math.PI) td += Math.PI * 2;
      e.turret += Math.min(Math.abs(td), 4 * dt) * (td < 0 ? -1 : 1);
      if (e.cool <= 0 && Math.abs(td) < 0.35) _rtsFire(e, shootAt, w);
    }
    if (tgt && !chasing) {
      if (e.order === 'attack' || e.order === 'amove' || !e.order) e.path = null;
      if (e.order === 'attack') return;      /* in range: hold and keep firing */
    } else if (chasing && e.order === 'attack') {
      /* close on the ordered target; repath now and then rather than every frame */
      e.rep = (e.rep || 0) - dt;
      if (!e.path || e.rep <= 0) { e.goal = { x:tgt.x, z:tgt.z }; e.path = _rtsPath(e.x, e.z, tgt.x, tgt.z); e.pi = 0; e.rep = 0.9; }
    }
  } else { e.turret = e.rot; }

  if (e.path) { _rtsSteer(e, dt, d); if (!e.path && (e.order === 'move' || e.order === 'amove')) e.order = null; }
}
function _rtsUpdateHarvester(e, dt, d) {
  var G = window._rtsG;
  if (!e.hstate) { if (e.order !== 'move') _rtsOrderHarvest(e, null, null); }
  if (e.order === 'move' && e.path) { _rtsSteer(e, dt, d); if (!e.path) e.order = null; return; }

  if (e.hstate === 'toField') {
    if (!e.htile || G.scrap[_rtsIdx(e.htile.tx, e.htile.tz)] <= 0) e.htile = _rtsNearestScrap(e);
    if (!e.htile) { e.path = null; return; }                      /* nothing left to mine */
    var wx = _rtsWX(e.htile.tx), wz = _rtsWX(e.htile.tz);
    if (Math.hypot(e.x - wx, e.z - wz) < RTS_TILE * 1.1) { e.path = null; e.hstate = 'mining'; return; }
    if (!e.path) { e.goal = { x:wx, z:wz }; e.path = _rtsPath(e.x, e.z, wx, wz); e.pi = 0; if (!e.path) { e.htile = null; return; } }
    _rtsSteer(e, dt, d);
  } else if (e.hstate === 'mining') {
    var i = _rtsIdx(e.htile.tx, e.htile.tz), take = Math.min(RTS_HARVEST_RATE * dt, G.scrap[i], d.capacity - e.carry);
    G.scrap[i] -= take; e.carry += take;
    if (G.scrap[i] <= 0.5) { G.scrap[i] = 0; G.scrapDirty = true; e.htile = null; e.hstate = 'toField'; }
    if (e.carry >= d.capacity - 0.5) { e.hstate = 'toRef'; e.path = null; }
  } else if (e.hstate === 'toRef') {
    var ref = _rtsNearestRefinery(e);
    if (!ref) { e.path = null; return; }
    /* generous docking radius: a harvester that stops one tile short of the strict range
       would otherwise hover beside the refinery without ever unloading */
    if (_rtsRangeTo(e, ref) < RTS_TILE * 2.2) { e.path = null; e.hstate = 'unload'; e.ref = ref; return; }
    e.rep = (e.rep || 0) - dt;
    if (!e.path || e.rep <= 0) { e.goal = { x:ref.x, z:ref.z }; e.path = _rtsPath(e.x, e.z, ref.x, ref.z); e.pi = 0; e.rep = 1.5; if (!e.path) return; }
    _rtsSteer(e, dt, d);
  } else if (e.hstate === 'unload') {
    if (!e.ref || e.ref.dead) { e.hstate = 'toRef'; return; }
    var give = Math.min(RTS_UNLOAD_RATE * dt, e.carry);
    e.carry -= give; G.sides[e.side].credits += give;
    if (e.carry <= 0.5) { e.carry = 0; e.hstate = 'toField'; }
  }
}
function _rtsNearestScrap(e) {
  var G = window._rtsG, best = null, bd = 1e9;
  for (var tz = 0; tz < RTS_N; tz++) for (var tx = 0; tx < RTS_N; tx++) {
    var i = _rtsIdx(tx, tz);
    if (G.scrap[i] <= 0) continue;
    var d = Math.hypot(_rtsWX(tx) - e.x, _rtsWX(tz) - e.z);
    if (d < bd) { bd = d; best = { tx:tx, tz:tz }; }
  }
  return best;
}
function _rtsNearestRefinery(e) {
  var G = window._rtsG, best = null, bd = 1e9;
  for (var i = 0; i < G.ents.length; i++) {
    var o = G.ents[i];
    if (o.type !== 'struct' || o.def !== 'refinery' || o.side !== e.side || o.dead || o.building) continue;
    var d = _rtsDist(e, o);
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}

/* ------------------------------------------------------- structures */
function _rtsUpdateStruct(e, dt) {
  var d = rtsStructDef(e.def);
  if (e.hitT > 0) e.hitT -= dt;
  if (e.building) {
    /* buildings rise out of the ground while they finish, and gain HP as they go */
    e.bprog += dt / Math.max(0.5, d.build * 0.5) * _rtsPowerFactor(e.side);
    e.hp = d.hp * (0.15 + 0.85 * Math.min(1, e.bprog));
    if (e.bprog >= 1) { e.bprog = 1; e.building = 0; e.hp = d.hp; _rtsRecalcPower(e.side);
      if (d.freeUnit) _rtsSpawnAt(e.side, d.freeUnit, e); }
    return;
  }
  if (!d.weapon) return;
  var w = RTS_WEAPONS[d.weapon];
  if (e.cool > 0) e.cool -= dt;
  if (e.fire > 0) e.fire -= dt;
  /* a browned-out base loses its defences - power actually matters */
  if (_rtsPowerFactor(e.side) < 0.999) return;
  if (!e.target || e.target.dead || _rtsRangeTo(e, e.target) > w.range) e.target = _rtsFindTarget(e, w.range);
  if (!e.target) return;
  var ta = Math.atan2(e.target.z - e.z, e.target.x - e.x), td = ta - e.rot;
  while (td > Math.PI) td -= Math.PI * 2; while (td < -Math.PI) td += Math.PI * 2;
  e.rot += Math.min(Math.abs(td), 2.6 * dt) * (td < 0 ? -1 : 1);
  if (e.cool <= 0 && Math.abs(td) < 0.3) _rtsFire(e, e.target, w);
}

/* --------------------------------------------------------- projectiles */
function _rtsUpdateProj(dt) {
  var G = window._rtsG;
  for (var i = G.proj.length - 1; i >= 0; i--) {
    var p = G.proj[i];
    p.life -= dt;
    /* missiles home; shells fly straight at where the target was */
    if (p.kind === 'missile' && p.tgt && !p.tgt.dead) {
      var dx = p.tgt.x - p.x, dz = p.tgt.z - p.z, d = Math.hypot(dx, dz) || 1;
      p.vx += (dx / d * p.speed - p.vx) * Math.min(1, dt * 4);
      p.vz += (dz / d * p.speed - p.vz) * Math.min(1, dt * 4);
    }
    p.x += p.vx * dt; p.z += p.vz * dt;
    var hit = null;
    if (p.tgt && !p.tgt.dead && _rtsRangeTo(p, p.tgt) < 1.8) hit = p.tgt;
    if (hit || p.life <= 0) {
      if (hit) _rtsDamage(hit, p.dmg, null);
      if (p.splash > 0) _rtsSplash(p.x, p.z, p.splash * RTS_TILE * 0.8, p.dmg, p.side);
      G.fx.push({ kind:'hit', x:p.x, y:1, z:p.z, t:0, big:p.splash > 0 ? 1.4 : 0.7 });
      G.proj.splice(i, 1);
    }
  }
}

/* ------------------------------------------------------------ enemy AI --
   Deliberately simple and legible: keep a harvester alive, replace losses, and
   throw a growing wave at the player on a timer. */
function _rtsUpdateAI(dt) {
  var G = window._rtsG, S = G.sides.enemy;
  if (S.lost) return;
  G.ai.build -= dt;
  if (G.ai.build <= 0) {
    G.ai.build = 5;
    var harv = 0, refs = 0, army = [], i;
    for (i = 0; i < G.ents.length; i++) {
      var e = G.ents[i];
      if (e.dead || e.side !== 'enemy') continue;
      if (e.type === 'struct') { if (e.def === 'refinery') refs++; continue; }
      if (rtsUnitDef(e.def).harvest) harv++; else army.push(e);
    }
    /* Economy first, and crucially the AI SAVES for a harvester instead of dribbling its
       income away on cheap infantry - without this it parks at ~90 credits forever, never
       affords the 1200 harvester, and its army stops growing about two minutes in. */
    if (harv < 3) {
      if (_rtsCanQueue('enemy', 'harvester')) _rtsQueue('enemy', 'harvester');
    } else if (_rtsCanQueue('enemy', 'tank') && S.credits > 1600) _rtsQueue('enemy', 'tank');
    else if (_rtsCanQueue('enemy', 'buggy') && S.credits > 900) _rtsQueue('enemy', 'buggy');
    else if (_rtsCanQueue('enemy', 'rocket') && S.credits > 500) _rtsQueue('enemy', 'rocket');
    else if (_rtsCanQueue('enemy', 'rifle') && S.credits > 250) _rtsQueue('enemy', 'rifle');
    /* rebuild a dead power plant so the AI does not brown itself out permanently */
    if (S.powerUsed > S.powerMade && _rtsCanQueue('enemy', 'power')) _rtsQueue('enemy', 'power');
    /* once genuinely rich, expand rather than stockpile - but cap it, or the AI spends its
       whole income on refineries it does not have the harvesters to use */
    else if (S.credits > 4000 && refs < 2 && !S.q.struct && _rtsCanQueue('enemy', 'refinery')) _rtsQueue('enemy', 'refinery');
  }
  /* the AI places its own finished buildings next to the yard */
  if (S.ready) {
    var yard = _rtsHas('enemy', 'yard'), placed = false;
    if (yard) {
      for (var rr = 3; rr <= RTS_BUILD_RADIUS && !placed; rr++) {
        for (var a = 0; a < 12 && !placed; a++) {
          var ang = a / 12 * Math.PI * 2;
          var tx = Math.round(yard.tx + Math.cos(ang) * rr), tz = Math.round(yard.tz + Math.sin(ang) * rr);
          if (_rtsCanPlace('enemy', S.ready, tx, tz)) { _rtsPlaceStruct('enemy', S.ready, tx, tz, false); placed = true; }
        }
      }
    }
    if (placed || !yard) S.ready = null;
  }
  G.ai.next -= dt;
  if (G.ai.next <= 0) {
    G.ai.next = RTS_WAVE_EVERY; G.ai.wave++;
    var pool = [], k;
    for (k = 0; k < G.ents.length; k++) {
      var u = G.ents[k];
      if (!u.dead && u.side === 'enemy' && u.type === 'unit' && !rtsUnitDef(u.def).harvest && !u.order) pool.push(u);
    }
    /* Commit a real share of the idle army, not a token squad. Sending a fixed handful let
       the AI pile up forty-odd defenders at home, which is both un-fun and unbeatable. */
    var send = Math.min(pool.length, Math.max(3, Math.ceil(pool.length * 0.6)));
    if (send >= 2) {
      var aim = _rtsHas('player', 'yard') || _rtsHas('player', 'refinery') || _rtsHas('player', 'power');
      if (aim) {
        for (k = 0; k < send; k++) _rtsOrderMove(pool[k], aim.x + (k % 3 - 1) * 5, aim.z + ((k / 3) | 0) * 5, true);
        _rtsSay('Redline attack wave inbound!');
        if (typeof _rtsSfx === 'function') _rtsSfx('alert');
      }
    }
  }
}
function _rtsSay(m) { var G = window._rtsG; G.msg = m; G.msgT = 4; }

/* Ore regrows into partly-mined tiles and slowly seeds empty neighbours, so a worked-out
   field recovers instead of leaving a dead map (RULES.CPP: IsTGrowth / IsTSpread). */
function _rtsTickOre(dt) {
  var G = window._rtsG;
  G.oreT = (G.oreT || 0) + dt;
  if (G.oreT < RTS_ORE_GROW_EVERY) return;
  G.oreT = 0;
  if (!G.oreRnd) G.oreRnd = _rtsRngMake(G.seed ^ 0x5eed);
  var tx, tz, i, grew = false;
  for (tz = 1; tz < RTS_N - 1; tz++) {
    for (tx = 1; tx < RTS_N - 1; tx++) {
      i = _rtsIdx(tx, tz);
      var a = G.scrap[i];
      if (a <= 0 || a >= RTS_SCRAP_TILE) continue;
      G.scrap[i] = Math.min(RTS_SCRAP_TILE, a + RTS_ORE_GROW_AMT);
      grew = true;
      /* a rich tile occasionally seeds an adjacent empty, unblocked one */
      if (a > RTS_SCRAP_TILE * 0.6 && G.oreRnd() < RTS_ORE_SPREAD_CHANCE) {
        var d = (G.oreRnd() * 4) | 0;
        var nx = tx + (d === 0 ? 1 : d === 1 ? -1 : 0), nz = tz + (d === 2 ? 1 : d === 3 ? -1 : 0);
        var ni = _rtsIdx(nx, nz);
        if (_rtsInB(nx, nz) && G.scrap[ni] <= 0 && G.blocked[ni] === 0) {
          G.scrap[ni] = RTS_SCRAP_TILE * 0.2;
          G.scrapDirty = true;      /* new tile - the render layer must re-lay the field */
        }
      }
    }
  }
  if (grew) G.oreGrew = true;
}

/* ------------------------------------------------------------ main tick */
function _rtsTick(dt) {
  var G = window._rtsG;
  if (!G || G.over) return;
  if (dt > 0.1) dt = 0.1;                        /* never let a stall fast-forward the battle */
  G.t += dt;
  if (G.msgT > 0) G.msgT -= dt;

  _rtsTickOre(dt);
  _rtsTickProduction('player', dt);
  _rtsTickProduction('enemy', dt);
  _rtsUpdateAI(dt);

  var i, e;
  for (i = 0; i < G.ents.length; i++) {
    e = G.ents[i];
    if (e.dead) continue;
    if (e.type === 'unit') _rtsUpdateUnit(e, dt); else _rtsUpdateStruct(e, dt);
  }
  _rtsSeparate(dt);
  _rtsUpdateProj(dt);

  for (i = G.fx.length - 1; i >= 0; i--) { G.fx[i].t += dt; if (G.fx[i].t > 0.75) G.fx.splice(i, 1); }
  for (i = G.ents.length - 1; i >= 0; i--) if (G.ents[i].dead && G.ents[i].reaped) G.ents.splice(i, 1);

  /* win / lose: losing every structure ends it, the way it did in the originals */
  var pAlive = 0, eAlive = 0;
  for (i = 0; i < G.ents.length; i++) {
    e = G.ents[i];
    if (e.dead || e.type !== 'struct') continue;
    if (e.side === 'player') pAlive++; else eAlive++;
  }
  if (!pAlive) { G.over = 'lose'; G.sides.player.lost = true; }
  else if (!eAlive) { G.over = 'win'; G.sides.enemy.lost = true; }
}
