/* core/seamines.js - the Mine Boat: a minefield in the water.

   The Mine Layer's verb, at sea: DENIAL of a channel. The mines are the Mine Layer's own
   (core/mines.js) - the same G.mines, the same charge, hidden from the side they are meant for -
   laid on water instead of ground (`_rtsLayMine` asks the layer's `sea`). They go off under
   anything afloat that stands on their cell, ships and hovercraft alike; aircraft pass over.

     RESTOCKED      at its own shipyard, one mine every RTS_MINE.restock seconds, alongside
                    within RTS_SEAMINE.dock cells
     FOUND          by SONAR: a hull with `detects` (the Destroyer) sees every enemy mine in the
                    water within its sonar reach, as a Mine Sweeper does on land - and a Sweeper
                    on the shore sees those in its own reach, though it cannot clear them

   The opponent buys one once the player has a shipyard, and mines the channel the player's
   ships would come by: the sea route between the two yards, RTS_SEAMINE.from to .to cells out
   from its own, with a cell either side of it. */

var RTS_SEAMINE = { dock: 2.5, from: 4, to: 12, every: 1 };

function _rtsSeaLayer(u) { var d = rtsUnitDef(u.def) || {}; return !!(d.mines && d.sea); }
function _rtsShipyardOf(side, u) {
  var G = window._rtsG, best = null, bd = 1e9;
  for (var i = 0; i < G.ents.length; i++) {
    var b = G.ents[i];
    if (b.dead || b.building || b.type !== 'struct' || b.side !== side || (rtsStructDef(b.def) || {}).produces !== 'ship') continue;
    var d = u ? Math.hypot(b.x - u.x, b.z - u.z) : 0;
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}
function _rtsSeaMineTick(dt) {
  var G = window._rtsG, M = G.mines, i, k;
  for (i = 0; i < G.ents.length; i++) {
    var u = G.ents[i];
    if (u.dead || u.inside || u.type !== 'unit') continue;
    var d = rtsUnitDef(u.def) || {};
    /* alongside its yard: loaded again */
    if (d.mines && d.sea) {
      var y = _rtsShipyardOf(u.side, u);
      if (y && _rtsAtStruct(u, y, RTS_SEAMINE.dock * RTS_TILE)) _rtsMineRestock(u, dt);
    }
    /* sonar: the enemy's mines in the water within its reach are seen */
    if (d.detects && M) for (k = 0; k < M.length; k++) {
      var m = M[k];
      if (m.side === u.side || !m.sea) continue;
      if (Math.hypot(_rtsWX(m.tx) - u.x, _rtsWX(m.tz) - u.z) <= d.detects) (m.seen = m.seen || {})[u.side] = 1;
    }
  }
}

/* ------------------------------------------------ the opponent's field -- */
/* The channel: the sea route from the player's yard to its own, from .from to .to cells out
   from its own, each cell with its neighbours across the route. Planned once per pair of yards,
   IN THE SHALLOW DOMAIN - water at any tide - so a plan made at low water, when the channels are
   dry to a hull, is the same plan as one made at high; and a plan that came back empty is asked
   again after a while rather than kept for the match. */
var RTS_SEAMINE_RECHECK = 30;
function _rtsAISeaMineSpots(G) {
  var py = _rtsShipyardOf('player', null), ey = _rtsShipyardOf('enemy', null);
  if (!py || !ey) return [];
  var C = G.ai.seaMines;
  if (C && C.by === py.id + ':' + ey.id && (C.out.length || G.t - C.t < RTS_SEAMINE_RECHECK)) return C.out;
  var out = [], seen = {};
  G.ai.seaMines = { by: py.id + ':' + ey.id, out: out, t: G.t };
  var a = _rtsNearestOpen(_rtsTX(ey.x), _rtsTX(ey.z), 6, 'shallow'), b = _rtsNearestOpen(_rtsTX(py.x), _rtsTX(py.z), 6, 'shallow');
  var path = a && b && _rtsPath(_rtsWX(a[0]), _rtsWX(a[1]), _rtsWX(b[0]), _rtsWX(b[1]), 'shallow');
  if (!path || !path.length) return out;
  var px = _rtsWX(a[0]), pz = _rtsWX(a[1]), step = RTS_TILE / 2;
  for (var i = 0; i < path.length; i++) {
    var dx = path[i].x - px, dz = path[i].z - pz, L = Math.hypot(dx, dz), n = Math.ceil(L / step);
    for (var k = 1; k <= n; k++) {
      var x = px + dx * k / n, z = pz + dz * k / n, o = Math.hypot(x - ey.x, z - ey.z) / RTS_TILE;
      if (o < RTS_SEAMINE.from || o > RTS_SEAMINE.to) continue;
      var ax = -dz / (L || 1), az = dx / (L || 1);
      for (var s = -1; s <= 1; s++) {
        var tx = _rtsTX(x + ax * s * RTS_TILE), tz = _rtsTX(z + az * s * RTS_TILE), key = tx + ',' + tz;
        if (seen[key] || _rtsBlocked(tx, tz, 'shallow')) continue;
        seen[key] = 1; out.push([tx, tz]);
      }
    }
    px = path[i].x; pz = path[i].z;
  }
  return out;
}
function _rtsAISeaMinesTick(dt) {
  var G = window._rtsG;
  G.ai.seaMineT = (G.ai.seaMineT || 0) + dt;
  if (G.ai.seaMineT < RTS_SEAMINE.every) return;
  G.ai.seaMineT = 0;
  for (var i = 0; i < G.ents.length; i++) {
    var u = G.ents[i];
    if (u.dead || u.side !== 'enemy' || u.type !== 'unit' || !_rtsSeaLayer(u)) continue;
    if (_rtsMinesLeft(u) <= 0) {                               /* home to load again */
      var y = _rtsShipyardOf('enemy', u);
      if (y && !_rtsAtStruct(u, y, RTS_SEAMINE.dock * RTS_TILE) && !u.path) {
        var c = _rtsNearestOpen(_rtsTX(y.x), _rtsTX(y.z), 6, 'sea');
        if (c) _rtsOrderMove(u, _rtsWX(c[0]), _rtsWX(c[1]), false);
      }
      continue;
    }
    var spots = _rtsAISeaMineSpots(G), next = null;
    for (var k = 0; k < spots.length && !next; k++) if (!_rtsMineAt(spots[k][0], spots[k][1])) next = spots[k];
    if (!next) continue;
    if (Math.abs(_rtsTX(u.x) - next[0]) <= 1 && Math.abs(_rtsTX(u.z) - next[1]) <= 1) { _rtsLayMine(u, next[0], next[1]); u.path = null; continue; }
    if (!u.path || u.pi >= u.path.length) _rtsOrderMove(u, _rtsWX(next[0]), _rtsWX(next[1]), false);
  }
}
