/* core/aimines.js - the opponent's Mine Layer: a minefield across the way you will come.

   The layer's verb is denial, and the opponent has one place worth denying: the approach to its
   own base. So the field is planned once a match, from the land route between the two yards - the
   way an attack actually walks - as the cells of that route between RTS_AI_MINES.from and .to cells
   out from its yard, with a cell either side of each, nearest first. The layer works through them,
   one mine a cell, and goes home to the Repair Bay to load again when it runs out.

   No army the opponent raises takes it along: teams recruit by composition and none has a layer
   in it, and escorts and the base's response want a gun.

   BOUGHT OUTSIDE THE ROLL (_rtsAISupport, called from _rtsAIUnits - the Hovercraft too). As an entry in the weighted
   vehicle mix it moved every roll after it - the Soviet opponent stopped reaching its Arc Tower
   in e2e/basedef, and the raiders thinned out in e2e/raid - and a full army skipped the whole
   line, so a capped opponent never bought one. Here it is one question, asked before the roll:
   no layer alive, a field to lay, the vehicle line free, and the price out of genuine surplus
   above what the base plan is saving for (as the engineer is), so it delays no building. */

function _rtsAISupport(S) {
  return _rtsAISupportBuy(S, 'minelayer', function (G) { return _rtsAIMineSpots(G).length > 0; }) ||   /* a land route to deny */
         _rtsAISupportBuy(S, 'hovercraft', function () { return !!_rtsAIHoverTarget(); }) ||           /* a harvester by the water: core/aihover.js */
         _rtsAISupportBuy(S, 'sweeper', function (G) { return !!(G.mineHits && G.mineHits.length); }) ||  /* a mine has cost it a unit: core/sweeper.js */
         _rtsAISupportBuy(S, 'spotter', function () { return _rtsFogged() && _rtsAILongGuns() > 0; }) ||  /* long guns blind in fog: core/spotter.js */
         _rtsAISupportBuy(S, 'repairtruck', function () { return _rtsAIFieldVehicles() >= RTS_FIX.army && _rtsAIDefended(); }) ||  /* an army worth mending: core/repairtruck.js */
         _rtsAISupportBuy(S, 'jammer', function () { return _rtsPlayerDefences() >= RTS_JAM.digIn && _rtsAIFieldVehicles() >= 4 && _rtsAIDefended(); }) ||  /* the player dug in: core/jammer.js */
         _rtsAISupportBuy(S, 'paraplane', function () { return _rtsPlayerDefences() >= RTS_JAM.digIn && _rtsAIDefended() && !!_rtsAIParaTarget(); }) ||  /* over the wall: core/paradrop.js */
         _rtsAISupportBuy(S, 'drone', function () { return _rtsAIHalfBlind() && _rtsAIDefended(); }) ||  /* eyes in fog, or on a Jammer: core/drone.js */
         _rtsAISupportBuy(S, 'bomber', function () { return _rtsPlayerDefences() >= RTS_JAM.digIn && _rtsAIDefended(); });  /* a carpet across the base: core/bomber.js */
}
function _rtsAISupportBuy(S, key, worth) {
  var G = window._rtsG, d = rtsUnitDef(key);
  if (!d || _rtsAIOwned(key) >= 1) return false;
  if (S.q && S.q.vehicle) return false;
  if (!_rtsCanQueue('enemy', key)) return false;
  if (!worth(G)) return false;
  if (rtsMoney(S) < _rtsAISpare(S) + _rtsCostOf('enemy', d)) return false;
  _rtsQueue('enemy', key);
  return true;
}

var RTS_AI_MINES = { from: 9, to: 18, every: 1 };

/* The field: route cells 9 to 18 out from the yard, each with its neighbours across the route. */
function _rtsAIMineSpots(G) {
  if (G.ai.mineSpots) return G.ai.mineSpots;
  var ey = _rtsHas('enemy', 'yard'), py = _rtsHas('player', 'yard'), out = [], seen = {};
  G.ai.mineSpots = out;
  if (!ey || !py) return out;
  var path = _rtsPath(ey.x, ey.z, py.x, py.z, null);
  if (!path || !path.length) return out;
  var px = ey.x, pz = ey.z, step = RTS_TILE / 2;
  for (var i = 0; i < path.length; i++) {
    var dx = path[i].x - px, dz = path[i].z - pz, L = Math.hypot(dx, dz), n = Math.ceil(L / step);
    for (var k = 1; k <= n; k++) {
      var x = px + dx * k / n, z = pz + dz * k / n;
      var out2 = Math.hypot(x - ey.x, z - ey.z) / RTS_TILE;
      if (out2 < RTS_AI_MINES.from || out2 > RTS_AI_MINES.to) continue;
      var ax = -dz / (L || 1), az = dx / (L || 1);              /* across the route */
      for (var s = -1; s <= 1; s++) {
        var tx = _rtsTX(x + ax * s * RTS_TILE * 1.5), tz = _rtsTX(z + az * s * RTS_TILE * 1.5), key = tx + ',' + tz;
        if (seen[key] || !_rtsInB(tx, tz) || _rtsBlocked(tx, tz, null) || G.terrain[_rtsIdx(tx, tz)] === RTS_T_WATER) continue;
        seen[key] = 1; out.push([tx, tz]);
      }
    }
    px = path[i].x; pz = path[i].z;
  }
  return out;
}

function _rtsAIMinesTick(dt) {
  var G = window._rtsG;
  G.ai.mineT = (G.ai.mineT || 0) + dt;
  if (G.ai.mineT < RTS_AI_MINES.every) return;
  G.ai.mineT = 0;
  for (var i = 0; i < G.ents.length; i++) {
    var u = G.ents[i];
    if (u.dead || u.side !== 'enemy' || u.type !== 'unit' || u.inside || !(rtsUnitDef(u.def) || {}).mines) continue;
    if (_rtsMinesLeft(u) <= 0) {                               /* home to load again */
      var bay = _rtsHas('enemy', 'depot');
      if (bay && !_rtsAtStruct(u, bay, rtsStructDef('depot').repairs) && !u.path) _rtsOrderMove(u, bay.x, bay.z, false);
      continue;
    }
    var spots = _rtsAIMineSpots(G), next = null;
    for (var k = 0; k < spots.length && !next; k++) if (!_rtsMineAt(spots[k][0], spots[k][1])) next = spots[k];
    if (!next) continue;                                       /* the field is laid */
    /* beside it is near enough: a move order stops a cell short */
    if (Math.abs(_rtsTX(u.x) - next[0]) <= 1 && Math.abs(_rtsTX(u.z) - next[1]) <= 1) { _rtsLayMine(u, next[0], next[1]); u.path = null; continue; }
    if (!u.path) _rtsOrderMove(u, _rtsWX(next[0]), _rtsWX(next[1]), false);
  }
}
