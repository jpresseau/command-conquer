/* core/entities.js - spawning, placing and removing entities. Part of rts.core. */

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
      if (G.scrap[i] > 0) { G.scrap[i] = 0; G.gems[i] = 0; G.scrapDirty = true; }
    }
    else if (G.owner[i] === e.id) { G.blocked[i] = 0; G.owner[i] = 0; }
  }
}
/* BUILDING.H Flush_For_Placement: units do not block a structure going up, so anything
   standing on the new footprint has to be shoved clear. Without it a unit ends up embedded
   in a wall - which happened once the AI started building enough to land on its own army. */
function _rtsFlushForPlacement(e) {
  var G = window._rtsG, d = rtsStructDef(e.def);
  for (var i = 0; i < G.ents.length; i++) {
    var u = G.ents[i];
    if (u.dead || u.type !== 'unit') continue;
    var tx = _rtsTX(u.x), tz = _rtsTX(u.z);
    if (tx < e.tx || tx >= e.tx + d.w || tz < e.tz || tz >= e.tz + d.h) continue;
    var cell = _rtsExitCell(e, u.x - e.x, u.z - e.z);
    if (cell) { u.x = _rtsWX(cell[0]); u.z = _rtsWX(cell[1]); u.path = null; }
  }
}
function _rtsCanPlace(side, key, tx, tz, anywhere) {
  var G = window._rtsG, d = rtsStructDef(key);
  if (!d) return false;
  for (var ax = tx; ax < tx + d.w; ax++) for (var az = tz; az < tz + d.h; az++) {
    if (!_rtsInB(ax, az)) return false;
    if (G.blocked[_rtsIdx(ax, az)] !== 0) return false;
    if (G.scrap[_rtsIdx(ax, az)] > 0) return false;
  }
  /* A shipyard must reach the water. Checked here rather than only at build time so the
     placement ghost turns red as you drag it inland, which is the only way a player finds out
     the rule exists. Applies even to `anywhere`: an MCV deploy does not make the sea move. */
  if (d.shore && !_rtsShoreOk(key, tx, tz)) return false;
  /* Must be within build radius of one of your own structures (classic base-creep rule).
     `anywhere` skips it: BuildingTypeClass::Legal_Placement, which is what an MCV deploy is
     checked against, tests terrain and occupancy only. A vehicle whose entire purpose is to
     found a base somewhere you have nothing cannot be held to a rule about being near
     something you own. */
  if (anywhere) return true;
  var cx = tx + d.w / 2, cz = tz + d.h / 2, near = false;
  for (var i = 0; i < G.ents.length; i++) {
    var o = G.ents[i];
    if (o.type !== 'struct' || o.side !== side || o.dead || o.building) continue;
    var od = rtsStructDef(o.def);
    if (Math.hypot(cx - (o.tx + od.w / 2), cz - (o.tz + od.h / 2)) <= RTS_BUILD_RADIUS) { near = true; break; }
  }
  return near;
}
/* A shipyard has to touch water, and it is the only structure whose placement asks about the
   terrain rather than about free space. Checked on the ring OUTSIDE the footprint, not inside
   it: the building stands on land and reaches into the sea, so a cell of water under it would
   mean it was floating. */
function _rtsShoreOk(key, tx, tz) {
  var d = rtsStructDef(key);
  if (!d || !d.shore) return true;
  var G = window._rtsG;
  for (var ox = -1; ox <= d.w; ox++) {
    for (var oz = -1; oz <= d.h; oz++) {
      var inside = (ox >= 0 && ox < d.w && oz >= 0 && oz < d.h);
      if (inside) continue;
      var x = tx + ox, z = tz + oz;
      if (_rtsInB(x, z) && G.terrain[_rtsIdx(x, z)] === RTS_T_WATER) return true;
    }
  }
  return false;
}

/* Where a ship appears when its yard finishes one: the nearest open water to the yard. A
   shipyard with no free water beside it produces nothing rather than beaching a hull. */
function _rtsSeaSpawn(src) {
  if (!src) return null;
  var tx = _rtsTX(src.x), tz = _rtsTX(src.z);
  var spot = _rtsNearestOpen(tx, tz, 12, 'sea');
  return spot ? { tx: spot[0], tz: spot[1] } : null;
}

function _rtsPlaceStruct(side, key, tx, tz, instant, paid) {
  var G = window._rtsG, d = rtsStructDef(key);
  var e = { id:G.nextId++, type:'struct', side:side, def:key, tx:tx, tz:tz,
    x:_rtsWX(tx) + (d.w - 1) * RTS_TILE / 2, z:_rtsWX(tz) + (d.h - 1) * RTS_TILE / 2,
    hp:instant ? d.hp : d.hp * 0.15, maxHp:d.hp, rot:0, cool:0, target:null,
    building:instant ? 0 : 1, bprog:instant ? 1 : 0, dead:false, mesh:null,
    /* PurchasePrice. A structure placed straight onto the map at match start was never
       bought, so it is worth what it would have cost this side to buy. */
    paid:paid == null ? _rtsCostOf(side, d) : paid };
  G.ents.push(e); G.byId[e.id] = e; _rtsSpAdd(e);
  _rtsFootprint(e, true);
  _rtsFlushForPlacement(e);
  _rtsRecalcPower(side);
  /* Only a pre-placed (instant) structure hands over its free unit here. A structure that
     has to be built delivers it in _rtsUpdateStruct when construction finishes - granting
     it in both places gave every constructed refinery two harvesters for the price of one. */
  if (instant) _rtsGrandOpening(e);
  /* Every structure placed becomes a node in its side's blueprint, unless it is filling a hole
     that is already one. Recording it here rather than at each call site is what keeps the
     invariant simple: a node exists for every building that has ever stood, until it is sold. */
  if (!_rtsBaseIsNode(e)) _rtsBaseAdd(side, key, tx, tz);
  return e;
}
/* BUILDING.CPP Find_Exit_Cell(): a new unit does not appear inside the building, it walks
   out of it. Walk the ring of cells around the footprint and take the clear one nearest the
   building's exit side, widening the ring until something is free. `prefX/prefZ` is that
   exit direction - the war factory's door faces the camera, and a refinery backs its
   harvester out to the south-west, both as in the original. */
function _rtsExitCell(src, prefX, prefZ) {
  var d = rtsStructDef(src.def);
  var cx = src.tx + (d.w - 1) / 2, cz = src.tz + (d.h - 1) / 2;
  var pl = Math.hypot(prefX, prefZ) || 1;
  prefX /= pl; prefZ /= pl;
  for (var ring = 1; ring <= 6; ring++) {
    var x0 = src.tx - ring, x1 = src.tx + d.w - 1 + ring;
    var z0 = src.tz - ring, z1 = src.tz + d.h - 1 + ring;
    var best = null, bs = 1e9;
    for (var tx = x0; tx <= x1; tx++) for (var tz = z0; tz <= z1; tz++) {
      if (tx !== x0 && tx !== x1 && tz !== z0 && tz !== z1) continue;   /* border cells only */
      if (!_rtsInB(tx, tz) || _rtsBlocked(tx, tz)) continue;
      var dx = tx - cx, dz = tz - cz, len = Math.hypot(dx, dz) || 1;
      /* nearest first, then whichever of those best matches the exit direction */
      var score = len - (dx / len * prefX + dz / len * prefZ) * 1.6;
      if (score < bs) { bs = score; best = [tx, tz]; }
    }
    if (best) return best;
  }
  return _rtsNearestOpen(_rtsTX(src.x), _rtsTX(src.z), 14);
}
/* Grand_Opening, guarded by HasOpened. BUILDING.H keeps that flag precisely so that "multiple
   inadvertant calls to Grand_Opening won't cause problems" - which is the exact bug that once
   gave every constructed refinery two harvesters, because the free unit was handed out at
   placement AND again when construction finished. The flag makes that impossible rather than
   merely fixed. */
function _rtsGrandOpening(e) {
  if (e.opened) return;
  e.opened = 1;
  var d = rtsStructDef(e.def);
  if (d.freeUnit) _rtsSpawnAt(e.side, d.freeUnit, e);
}
/* Exit_Object: put the unit on a clear exit cell, and give a harvester leaving a refinery
   its harvest order straight away rather than leaving it parked by the door. */
function _rtsSpawnAt(side, key, src) {
  var u = rtsUnitDef(key), harv = !!(u && u.harvest);
  var cell = _rtsExitCell(src, harv ? -0.7 : 0, harv ? 0.7 : 1);
  if (!cell) return null;
  var e = _rtsSpawnUnit(side, key, _rtsWX(cell[0]), _rtsWX(cell[1]));
  if (e && harv) _rtsOrderHarvest(e, null, null);
  return e;
}
function _rtsSpawnUnit(side, key, x, z) {
  /* team: Handle_Team's Group. -1 = unassigned. */
  var G = window._rtsG, d = rtsUnitDef(key);
  if (!d) return null;
  var e = { id:G.nextId++, type:'unit', side:side, def:key, x:x, z:z, rot:side === 'player' ? 0 : Math.PI,
    /* AIRCRAFT.CPP: `Ammo = Class->MaxAmmo`. `air` is read all over the place as "this is not
       on the ground" - it skips pathfinding, ignores blocked cells, draws at altitude, and can
       only be shot at by an `aa` weapon. */
    air:!!d.air, ammo:d.ammo || 0, rearming:0, alt:d.air ? (d.alt || 12) : 0,
    hp:d.hp, maxHp:d.hp, r:d.r, cool:0, path:null, pi:0, order:null, target:null,
    carry:0, carryVal:0, hstate:null, htile:null, dead:false, mesh:null, turret:0, fire:0, team:-1,
    fear:0, prone:0,
    /* MasterDoControls marks DO_WALK and DO_CRAWL 'randomstart'. That is why a squad does
       not march in lockstep - each soldier's walk cycle begins on a different frame. */
    gait:(G.nextId * 7) % 8 };
  G.ents.push(e); G.byId[e.id] = e; _rtsSpAdd(e);
  return e;
}
