/* core/bridgelayer.js - the Bridge Layer: a bridge where the map has none.

   The verb is the CROSSING: a river or a channel the map gave no bridge over, spanned where the
   player chooses, so an army can come at a base from the side it is not watching. The layer
   drives to the water's edge and DEPLOYs (D, or the button), and becomes a one-lane bridge
   across the gap ahead of it - the vehicle is the span, as the MCV is the yard.

   The bridge is exactly the kind the map generator lays (core/bridge.js): a record in G.bridges
   and its water cells opened to land units, so nothing that reads a bridge needs to know where
   this one came from - the pathfinder, a unit standing on the deck, the radar, a save. Only the
   3D mesh is built once per map, so a bridge laid in play bumps G.bridgeRev and the renderer
   rebuilds (render3d/bridge3d.js). */

var RTS_LAYBRIDGE_SPAN = 8;      /* the longest gap it can span, in cells of water */

/* The gap ahead: from the layer's own cell, a straight run of open water ending on open, dry
   ground, tried along the way it faces first and then the other three. Null if there is none. */
function _rtsBridgeGap(e) {
  var G = window._rtsG, T = G.terrain, B = G.blocked;
  var tx = _rtsTX(e.x), tz = _rtsTX(e.z);
  /* never from the water - a deck - which no generated map has yet offered a gap from, since a
     deck runs the length of its channel; a guard, and unit/bridgelayer cannot reach it. A FLAT
     THE TIDE HAS DRIED IS GROUND (core/tide.js): at low water the water's edge is out on the
     flats, and refusing the span from there said "drive to the water's edge" to a layer standing
     on it. */
  if (!_rtsInB(tx, tz)) return null;
  var own = _rtsIdx(tx, tz);
  if (T[own] === RTS_T_WATER && !(G.tideDry && G.tideDry[own])) return null;
  var fx = Math.cos(e.rot || 0), fz = Math.sin(e.rot || 0);
  var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]].sort(function (a, b) {
    return (b[0] * fx + b[1] * fz) - (a[0] * fx + a[1] * fz);
  });
  for (var d = 0; d < 4; d++) {
    var dx = dirs[d][0], dz = dirs[d][1];
    for (var k = 1; k <= RTS_LAYBRIDGE_SPAN + 1; k++) {
      var x = tx + dx * k, z = tz + dz * k;
      if (!_rtsInB(x, z)) break;
      var i = _rtsIdx(x, z);
      if (T[i] === RTS_T_WATER) {
        if (B[i] !== 2) break;             /* a deck already, or a shipyard's water */
        continue;
      }
      if (B[i] === 0) {                    /* a zero-length run fails _rtsBridgeAcross */
        var br = { tx: tx + dx, tz: tz + dz, dx: dx, dz: dz, len: k - 1, w: 1, px: dz !== 0 ? 1 : 0, pz: dx !== 0 ? 1 : 0 };
        if (_rtsBridgeAcross(br)) return br;
      }
      break;
    }
  }
  return null;
}
/* ACROSS THE WATER, NOT ALONG IT - the generator's own rule (core/bridge.js `crosses`): through
   the middle third of the span there is water on both sides of the deck. Without it a layer on a
   beach laid a pier down the shoreline over the first inlet it faced. */
function _rtsBridgeAcross(br) {
  var G = window._rtsG, wet = 0, n = 0;
  function sea(x, z) { return _rtsInB(x, z) && G.terrain[_rtsIdx(x, z)] === RTS_T_WATER; }
  for (var k = Math.floor(br.len / 3); k < Math.ceil(br.len * 2 / 3); k++) {
    var cx = br.tx + br.dx * k, cz = br.tz + br.dz * k;
    n++;
    if (sea(cx - br.px * 2, cz - br.pz * 2) && sea(cx + br.px * 2, cz + br.pz * 2)) wet++;
  }
  return n > 0 && wet * 3 >= n * 2;
}
/* Lay it: the layer becomes the bridge. False, and the player told why, when there is no gap. */
function _rtsLayBridge(e) {
  var G = window._rtsG, br = _rtsBridgeGap(e);
  if (!br) {
    if (e.side === 'player') _rtsSay('No gap to span here - drive to the water\'s edge, facing the far bank.');
    return false;
  }
  br.laid = e.side;
  _rtsBridgeCells(br).forEach(function (i) { G.blocked[i] = 0; });
  (G.bridges = G.bridges || []).push(br);
  G.bridgeRev = (G.bridgeRev || 0) + 1;
  _rtsKillQuiet(e);
  if (e.side === 'player') {
    _rtsSay('Bridge laid.');
    if (typeof _rtsSfx === 'function') _rtsSfx('place', e.x, e.z);
  }
  return true;
}
