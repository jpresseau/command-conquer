/* core/garrison.js - TOWNS AND GARRISONS: the civilian buildings in the middle of the map, and
   the infantry that hold them.

   THE TOWN. The skirmish setup's TOWNS option (rules/skirmish.js) lays RTS_SKIRMISH.town[].n towns
   on a standard map, more on a large one and fewer on a small, out in the contested ground between
   the bases and never within RTS_GARRISON.clear of anyone's start. Each is a few civilian
   buildings (rules/structures.js, `civ:true`) owned by the `civ` seat: a seat with no brain, no
   turn and team -1, which core/seats.js makes hostile to nobody - so an empty house is shot at
   by no one and shoots at no one. A town is drawn from its own random stream, after the bases,
   so the map round it is the map it would have been without it. Its buildings are placed here
   rather than through _rtsPlaceStruct, which would cost them, power them and make them a node
   in a base plan for the opponent to rebuild.

   THE GARRISON. Infantry with a gun (not a dog) can be ordered into a civilian building that is
   empty or already held by their side, up to its `garrison` squads, through the transport's own
   order (core/transport.js _rtsCanBoard and _rtsBoard ask here about a building). The building
   then TAKES THEIR SIDE: the enemy can shoot it, and it fires - each squad inside with its own
   weapon, from the building, out to its range plus RTS_GARRISON.reach cells. The men inside are
   out of the war otherwise: nothing targets them, and splash passes over them, as in a transport.

   Three ways out. UNLOAD walks them out (the transport's). The building falling spills them, as
   a wreck spills an APC's squad (core/capture.js _rtsKill). And fire clears it: a weapon marked
   `clears` - flame, grenades - that hits a held building hurts every squad inside by
   RTS_GARRISON.burn of the hit. When the last squad is gone the building is the town's again. */
var RTS_GARRISON = { reach: 2, burn: 0.5, clear: 22, gap: 1, spread: 8, search: 24, think: 8, home: 34 };

/* The town's seat: created the first time a battle has a town, and never in one without. */
function _rtsCivSeat(G) {
  if (!G.sides.civ) {
    var S = G.sides.civ = _rtsSideNew('civ');
    S.team = -1; S.ctl = 'none'; S.credits = 0;
  }
  return G.sides.civ;
}
function _rtsGarrisonable(t) { return !!(t && t.type === 'struct' && !t.dead && ((rtsStructDef(t.def) || {}).garrison || 0) > 0); }
function _rtsGarrisonCap(t) { return (rtsStructDef(t.def) || {}).garrison || 0; }
/* Can this squad go into that building now? */
function _rtsCanGarrison(inf, t) {
  if (!inf || inf.dead || inf.inside || inf.type !== 'unit' || !_rtsGarrisonable(t)) return false;
  var d = rtsUnitDef(inf.def) || {}, w = RTS_WEAPONS[d.weapon];
  if (d.kind !== 'infantry' || !w || w.maul) return false;
  if (t.side !== 'civ' && t.side !== inf.side) return false;
  return _rtsCargoCount(t) < _rtsGarrisonCap(t);
}
/* How close a boarder has to be to be aboard (core/units.js): a hull's breach, or a house's walls,
   which are its door all the way round. */
function _rtsBoardReach(tr, tdef) {
  if (tr && tr.type === 'struct') { var bd = rtsStructDef(tr.def) || { w: 1, h: 1 }; return RTS_TILE * (Math.max(bd.w, bd.h) / 2 + 1.4); }
  return (tdef.sea || tdef.air || tdef.hover) ? RTS_TILE * 3.0 : RTS_TILE * 1.6;
}
/* A squad has gone in (core/transport.js _rtsBoard): the building is its side's now. */
function _rtsGarrisonTake(t, inf) {
  t.side = inf.side;
  inf.x = t.x; inf.z = t.z; inf.cool = 0;
}
/* Nobody left inside: the town's again. */
function _rtsGarrisonFree(t) {
  if (_rtsGarrisonable(t) && !_rtsCargoCount(t) && t.side !== 'civ') { t.side = 'civ'; t.target = null; t.repair = 0; }
}

/* ------------------------------------------------------------------ firing out ---- */
/* What a squad inside `t` shoots at: the nearest enemy unit in reach, else the nearest building. */
function _rtsGarrisonTarget(t, w) {
  var G = window._rtsG, d = rtsStructDef(t.def);
  var R = w.range + (RTS_GARRISON.reach + Math.max(d.w, d.h) / 2) * RTS_TILE;
  var near = _rtsSpNear(t.x, t.z, R) || G.ents, bu = null, bud = 1e9, bs = null, bsd = 1e9;
  for (var i = 0; i < near.length; i++) {
    var o = near[i];
    if (o.dead || o.inside || o.hidden || !_rtsHostile(o.side, t.side)) continue;
    if (o.air && !w.aa) continue;
    if (!_rtsWeaponReaches(w, o)) continue;
    var dd = Math.hypot(o.x - t.x, o.z - t.z);
    if (dd > R) continue;
    if (o.type === 'unit') { if (dd < bud) { bud = dd; bu = o; } }
    else if (dd < bsd) { bsd = dd; bs = o; }
  }
  return bu || bs;
}
function _rtsGarrisonTick(dt) {
  var G = window._rtsG;
  G.garT = (G.garT || 0) + dt;
  if (G.garT >= RTS_GARRISON.think) { G.garT = 0; G.order.forEach(function (k) { if (_rtsSeatAI(k)) _rtsAIGarrison(k); }); }
  for (var i = 0; i < G.ents.length; i++) {
    var t = G.ents[i];
    if (t.type !== 'struct' || t.dead || !t.cargo || !_rtsGarrisonable(t)) continue;
    t.cargo = t.cargo.filter(function (u) { if (u.dead) u.inside = null; return !u.dead; });
    if (!t.cargo.length) { _rtsGarrisonFree(t); continue; }
    for (var k = 0; k < t.cargo.length; k++) {
      var u = t.cargo[k], w = RTS_WEAPONS[(rtsUnitDef(u.def) || {}).weapon];
      /* their own clocks: a squad inside a building is skipped by the unit update (core/tick.js) */
      u.x = t.x; u.z = t.z;
      if (u.fire > 0) u.fire = Math.max(0, u.fire - dt);
      if (u.recoil > 0) u.recoil = Math.max(0, u.recoil - dt);
      if (u.cool > 0) { u.cool -= dt; continue; }
      if (!w) continue;
      var tgt = _rtsGarrisonTarget(t, w);
      if (!tgt) continue;
      u.turret = Math.atan2(tgt.z - t.z, tgt.x - t.x);
      _rtsFire(u, tgt, w);
    }
  }
}
/* THE OPPONENT HOLDS THE TOWN NEAREST HOME. Every RTS_GARRISON.think seconds each computer seat
   looks for the nearest house within RTS_GARRISON.home cells of its start that is empty or already
   its own and not full, and sends its idle infantry into it - squads that belong to no team and
   have no order, two at least, so it never strips a team or empties a base of its last man. */
function _rtsAIGarrison(side) {
  var G = window._rtsG, home = G.starts && G.starts[side];
  if (!home) return 0;
  var best = null, bd = 1e9, idle = [];
  for (var i = 0; i < G.ents.length; i++) {
    var o = G.ents[i];
    if (o.type === 'struct') {
      if (!_rtsGarrisonable(o) || (o.side !== 'civ' && o.side !== side) || _rtsCargoCount(o) >= _rtsGarrisonCap(o)) continue;
      var dd = Math.hypot(o.tx - home.tx, o.tz - home.tz);
      if (dd <= RTS_GARRISON.home && dd < bd) { bd = dd; best = o; }
    } else if (o.side === side && !o.dead && !o.inside && !o.order && (o.team == null || o.team < 0)) idle.push(o);
  }
  if (!best) return 0;
  idle = idle.filter(function (u) { return _rtsCanGarrison(u, best); });
  if (idle.length < 2) return 0;
  var room = _rtsGarrisonCap(best) - _rtsCargoCount(best), sent = 0;
  for (var k = 0; k < idle.length && sent < room; k++) if (_rtsOrderBoard(idle[k], best)) sent++;
  return sent;
}
/* A held building hit by something that `clears` it: the squads inside are burnt too. */
function _rtsGarrisonHit(t, dmg, from) {
  if (!t || t.type !== 'struct' || !t.cargo || !t.cargo.length || !from || from.type !== 'unit') return;
  var w = RTS_WEAPONS[(rtsUnitDef(from.def) || {}).weapon];
  if (!w || !w.clears) return;
  t.cargo.slice().forEach(function (u) { if (!u.dead) _rtsDamage(u, dmg * RTS_GARRISON.burn, from); });
}

/* ------------------------------------------------------------------ the towns ---- */
function _rtsPlaceCiv(key, tx, tz) {
  var G = window._rtsG, d = rtsStructDef(key);
  var e = { id:G.nextId++, type:'struct', side:'civ', def:key, tx:tx, tz:tz,
    x:_rtsWX(tx) + (d.w - 1) * RTS_TILE / 2, z:_rtsWX(tz) + (d.h - 1) * RTS_TILE / 2,
    hp:d.hp, maxHp:d.hp, rot:0, cool:0, target:null, building:0, bprog:1, dead:false, mesh:null, paid:0, opened:1 };
  G.ents.push(e); G.byId[e.id] = e; _rtsSpAdd(e);
  _rtsFootprint(e, true);
  _rtsFlushForPlacement(e);
  return e;
}
/* the footprint and a cell of street round it: open land, no ore, no water, nothing standing */
function _rtsTownFits(key, tx, tz) {
  var G = window._rtsG, d = rtsStructDef(key), m = RTS_GARRISON.gap;
  for (var ax = tx - m; ax < tx + d.w + m; ax++) for (var az = tz - m; az < tz + d.h + m; az++) {
    if (!_rtsInB(ax, az)) return false;
    var i = _rtsIdx(ax, az);
    if (G.blocked[i] !== 0 || G.scrap[i] > 0 || G.terrain[i] === RTS_T_WATER) return false;
  }
  return true;
}
/* Lay the towns the setup asked for. Returns the buildings laid. */
function _rtsLayTowns(G) {
  var sk = G.skirmish || {}, T = RTS_SKIRMISH.town && RTS_SKIRMISH.town[sk.town];
  var n = T ? Math.round(T.n * RTS_N / RTS_N_DEFAULT) : 0, out = [];
  if (!n || !G.starts || !G.starts.player || !G.starts.enemy) return out;
  _rtsCivSeat(G);
  var rnd = _rtsRngMake((G.seed * 7 + 1771) >>> 0), P = G.starts.player, E = G.starts.enemy;
  var ax = E.tx - P.tx, az = E.tz - P.tz, L = Math.hypot(ax, az) || 1, nx = -az / L, nz = ax / L;
  var starts = Object.keys(G.starts).map(function (k) { return G.starts[k]; }).filter(Boolean);
  function clearOfStarts(tx, tz) {
    return !starts.some(function (s) { return Math.hypot(tx - s.tx, tz - s.tz) < RTS_GARRISON.clear; });
  }
  /* the first cell, ring by ring out from (cx, cz), where `key` fits clear of every start */
  function spot(key, cx, cz, rmax) {
    for (var r = 0; r <= rmax; r++) {
      var ring = [];
      for (var dx = -r; dx <= r; dx++) for (var dz = -r; dz <= r; dz++) if (Math.max(Math.abs(dx), Math.abs(dz)) === r) ring.push([cx + dx, cz + dz]);
      /* the ring in a rolled order, so a town does not always grow the same way round */
      var k0 = (rnd() * ring.length) | 0;
      for (var j = 0; j < ring.length; j++) {
        var c = ring[(j + k0) % ring.length];
        if (clearOfStarts(c[0], c[1]) && _rtsTownFits(key, c[0], c[1])) return c;
      }
    }
    return null;
  }
  for (var i = 0; i < n; i++) {
    var f = (i + 1) / (n + 1), side = (i % 2 ? -1 : 1) * RTS_N * 0.16;
    var cx = Math.round(P.tx + ax * f + nx * side + (rnd() - 0.5) * 8);
    var cz = Math.round(P.tz + az * f + nz * side + (rnd() - 0.5) * 8);
    var keys = i === 0 ? ['hall', 'flats', 'cottage', 'cottage'] : ['flats', 'cottage', 'cottage'];
    /* the town's centre: where its biggest building stands, found out to RTS_GARRISON.search */
    var c0 = spot(keys[0], cx, cz, RTS_GARRISON.search);
    if (!c0) continue;
    out.push(_rtsPlaceCiv(keys[0], c0[0], c0[1]));
    for (var q = 1; q < keys.length; q++) {
      var c = spot(keys[q], c0[0], c0[1], RTS_GARRISON.spread);
      if (c) out.push(_rtsPlaceCiv(keys[q], c[0], c[1]));
    }
  }
  return out;
}
