/* core/bridge.js - where the roads cross the water. Part of rts.core.

   The roads are carved before the sea, so the channel cuts every branch that runs out to its
   flank, and the ore connectivity pass's forced causeways are cut again when the spine is
   re-laid (core/terrain.js says why: a causeway splits the sea in two). What was left was a
   road that ran down to the water and stopped, the same road picking up again on the far
   shore, and on most seeds a little ore stranded on the wrong side of it.

   A BRIDGE IS WATER THAT LAND UNITS MAY CROSS. Its cells keep RTS_T_WATER, so the sea is still
   one body and a ship still sails under it - _rtsBlocked's sea test is "water, and no
   structure" - and their `blocked` byte goes to 0, so the land test lets a tank across. Nothing
   in the pathfinder changes. A building may not stand on one (_rtsCanPlace refuses water).

   Laid from the cells alone and never from the game's random stream, so a map that has no
   bridge to lay is generated exactly as it was. Called from _rtsGenTerrain just before the
   stranded-ore pass, which then sees the bridges as the way across. */

var RTS_BRIDGE_SPAN = 14;        /* the longest bridge, in cells of water */
var RTS_BRIDGE_MIN = 3;         /* ...and the shortest: a cell or two is an inlet, not a crossing */
var RTS_BRIDGE_GAP = 6;          /* no two bridges closer than this, end to end */
var RTS_BRIDGE_DECK = 0.55;      /* world units the deck stands over the water at its ends */
var RTS_BRIDGE_ARCH = 1.7;       /* ...and how much higher at mid-span, on a span of 12 cells or
                                    more: a gunboat has to pass under it. Shorter, lower. */

function _rtsLayBridges(G) {
  var N = RTS_N, T = G.terrain, B = G.blocked, out = [], used = new Uint8Array(N * N);
  G.bridges = out;
  function I(x, z) { return z * N + x; }
  function water(x, z) { return _rtsInB(x, z) && T[I(x, z)] === RTS_T_WATER && B[I(x, z)] !== 1; }
  function roadNear(x, z, r) {
    for (var dz = -r; dz <= r; dz++) for (var dx = -r; dx <= r; dx++)
      if (_rtsInB(x + dx, z + dz) && T[I(x + dx, z + dz)] === RTS_T_ROAD) return true;
    return false;
  }
  /* From a road cell, straight out over the water: how many cells to dry land, or 0 */
  function span(x, z, dx, dz) {
    for (var k = 1; k <= RTS_BRIDGE_SPAN + 1; k++) {
      var a = x + dx * k, b = z + dz * k;
      if (!_rtsInB(a, b)) return 0;
      if (water(a, b)) continue;
      if (T[I(a, b)] === RTS_T_WATER || B[I(a, b)] !== 0) return 0;
      return k > 1 && roadNear(a, b, 2) ? k - 1 : 0;
    }
    return 0;
  }
  function clear(x, z) {
    for (var q = 0; q < out.length; q++) {
      var o = out[q], ex = o.tx + o.dx * (o.len - 1), ez = o.tz + o.dz * (o.len - 1);
      var d = Math.min(Math.hypot(x - o.tx, z - o.tz), Math.hypot(x - ex, z - ez));
      if (d < RTS_BRIDGE_GAP) return false;
    }
    return true;
  }
  /* ACROSS THE WATER, not along it: the middle of the span has water on both sides of the deck.
     A road that ran beside the coast and was swallowed lengthwise by the channel reconnects too,
     and laid as a bridge it was a pier running down the shoreline under a cliff. */
  function crosses(br) {
    var wet = 0, n = 0;
    for (var k = Math.floor(br.len / 3); k < Math.ceil(br.len * 2 / 3); k++) {
      var cx = br.tx + br.dx * k, cz = br.tz + br.dz * k;
      n++;
      if (water(cx - br.px * 2, cz - br.pz * 2) && water(cx + br.px * (br.w + 1), cz + br.pz * (br.w + 1))) wet++;
    }
    return n > 0 && wet * 3 >= n * 2;
  }
  var DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (var tz = 0; tz < N; tz++) for (var tx = 0; tx < N; tx++) {
    if (T[I(tx, tz)] !== RTS_T_ROAD) continue;
    for (var di = 0; di < 4; di++) {
      var dx = DIRS[di][0], dz = DIRS[di][1];
      if (!water(tx + dx, tz + dz) || used[I(tx + dx, tz + dz)]) continue;
      var len = span(tx, tz, dx, dz);
      if (!len || !clear(tx + dx, tz + dz)) continue;
      if (len < RTS_BRIDGE_MIN) continue;
      /* two lanes where the road beside this cell, on either side, reaches the same far shore
         (or one cell short of it - a road crossing at a slant lands a cell apart) */
      var px = dz !== 0 ? 1 : 0, pz = dx !== 0 ? 1 : 0, w = 1, ox = tx, oz = tz;
      for (var sd = 1; sd >= -1 && w === 1; sd -= 2) {
        var qx = tx + px * sd, qz = tz + pz * sd;
        if (!_rtsInB(qx, qz) || T[I(qx, qz)] !== RTS_T_ROAD) continue;
        var l2 = span(qx, qz, dx, dz);
        if (!l2 || Math.abs(l2 - len) > 1) continue;
        w = 2; len = Math.max(len, l2);
        if (sd < 0) { ox = qx; oz = qz; }
      }
      var br = { tx: ox + dx, tz: oz + dz, dx: dx, dz: dz, len: len, w: w, px: px, pz: pz };
      if (!crosses(br)) continue;
      /* the deck's cells that are water open to land units; a cell of the far shore under the
         second lane of a slanting crossing is land already */
      for (var k = 0; k < len; k++) for (var l = 0; l < w; l++) {
        var cx = br.tx + dx * k + px * l, cz = br.tz + dz * k + pz * l;
        if (!water(cx, cz)) continue;
        B[I(cx, cz)] = 0; used[I(cx, cz)] = 1;
      }
      out.push(br);
    }
  }
  return out;
}

/* Is cell i under a deck? The only water a land unit may stand on - open sea is blocked 2, a
   shipyard's water 1. */
function _rtsIsBridgeCell(i) {
  var G = window._rtsG;
  return G.terrain[i] === RTS_T_WATER && G.blocked[i] === 0;
}

/* Every cell a bridge's deck covers. */
function _rtsBridgeCells(br) {
  var out = [];
  for (var k = 0; k < br.len; k++) for (var l = 0; l < br.w; l++)
    out.push(_rtsIdx(br.tx + br.dx * k + br.px * l, br.tz + br.dz * k + br.pz * l));
  return out;
}

/* Where along a bridge a world point is: { br, t } with t 0..1 from the near shore to the far,
   or null off every deck. The renderer stands land units on the deck by it. */
function _rtsBridgeAt(x, z) {
  var G = window._rtsG, L = G && G.bridges;
  if (!L || !L.length) return null;
  var tx = _rtsTX(x), tz = _rtsTX(z);
  for (var i = 0; i < L.length; i++) {
    var b = L[i];
    var a = (tx - b.tx) * b.dx + (tz - b.tz) * b.dz;            /* cells along the span */
    var s = (tx - b.tx) * b.px + (tz - b.tz) * b.pz;            /* cells across it */
    if (a < 0 || a >= b.len || s < 0 || s >= b.w) continue;
    /* along, continuous: from the near abutment (half a cell before the first water cell) */
    var ux = (x - _rtsWX(b.tx)) * b.dx + (z - _rtsWX(b.tz)) * b.dz;
    var t = (ux / RTS_TILE + 0.5) / b.len;
    return { br: b, t: t < 0 ? 0 : t > 1 ? 1 : t };
  }
  return null;
}
/* Where a bridge's ends are, in world units: the near and far abutment lines, centred across. */
function _rtsBridgeEnd(br, t) {
  var a = t * br.len - 0.5, c = (br.w - 1) / 2;
  return [_rtsWX(br.tx + br.dx * a + br.px * c), _rtsWX(br.tz + br.dz * a + br.pz * c)];
}
/* The deck's height at a fraction t of its span: the ground's own height where it meets each
   shore - not the shore cell's, which stands a step above the blended ground at the abutment,
   and a tank drove up that step - lifted, arched in the middle. */
function _rtsBridgeDeckY(br, t) {
  var A = _rtsBridgeEnd(br, 0), Z = _rtsBridgeEnd(br, 1), h0 = _rtsElev(A[0], A[1]), h1 = _rtsElev(Z[0], Z[1]);
  return h0 + (h1 - h0) * t + RTS_BRIDGE_DECK * Math.min(1, Math.min(t, 1 - t) * 6) + RTS_BRIDGE_ARCH * Math.min(1, br.len / 12) * Math.sin(Math.PI * t);
}
/* What a land unit stands on: the deck where there is one, else the ground. */
function _rtsStandY(x, z) {
  var at = _rtsBridgeAt(x, z);
  return at ? Math.max(_rtsElev(x, z), _rtsBridgeDeckY(at.br, at.t)) : _rtsElev(x, z);
}
