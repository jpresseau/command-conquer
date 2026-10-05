/* render3d/fxwake3d.js - what moving things leave behind: dust off the tracks, a wake off the
   hull. Part of rts.render3d; the quads go down with the rest of the effects (fxemit3d.js).

   A column of tanks crossing open ground raised nothing and a destroyer at full speed left the
   sea as it found it, so nothing on the map looked as if it was going anywhere. A vehicle on the
   move now throws dust behind it - thick off sand and dirt tracks, thin off grass and rock, none
   off paving - and a ship lays a fan of foam on the water.

   STATELESS, like everything in the effects pass: a puff is a phase of the game clock, born at
   the tracks and drifting back and up as it swells and thins, so the plume is continuous and
   needs no memory of where the vehicle has been. It moves with the vehicle rather than hanging
   where it was raised - the price of keeping no state, and at the speeds and zooms of this game
   it reads as dust. Only what the player can see, as for the rounds in flight. */

var R3D_FX_WAKEC = [0.93, 0.96, 0.97];

/* how much dust a surface throws: loose ground most, grass a little, a hard base none */
function _r3dFxDustOf(G, x, z) {
  var tx = _rtsTX(x), tz = _rtsTX(z);
  if (!_rtsInB(tx, tz)) return 0;
  var t = G.terrain[_rtsIdx(tx, tz)];
  if (t === RTS_T_SAND || t === RTS_T_ROAD) return 1;
  if (t === RTS_T_ROCK) return 0.5;
  if (t === RTS_T_GRASS) return 0.35;
  return 0;
}

/* A quad lying flat, from its tail pair of corners to its head pair: q.x runs -1 at the tail to
   1 at the head, q.y across. */
function _r3dFxFlat(B, V, t0, t1, h0, h1, y, lift, type, k, s, op, heat, c) {
  if (op <= 0.002) return;
  _r3dFxQuad(B, _r3dFxKey(V, (t0[0] + h1[0]) * 0.5, y, (t0[1] + h1[1]) * 0.5));
  var P = [[t0, -1, -1], [h0, 1, -1], [h1, 1, 1], [t0, -1, -1], [h1, 1, 1], [t1, -1, 1]];
  for (var i = 0; i < 6; i++) _r3dFxV(B, P[i][0][0], y, P[i][0][1], P[i][1], P[i][2], lift, type, k, s, op, heat, c);
}

/* DUST: puffs born at the tracks, drifting back and rising as they swell and thin. */
function _r3dFxDust(V, e, hx, hz, r, seed, amt) {
  var T = V.t * 1.6 + seed * 10, gy = V.ground(e.x, e.z), n = 4;
  for (var p = 0; p < n; p++) {
    var cyc = T + p / n, ph = cyc - Math.floor(cyc), gen = Math.floor(cyc);
    var back = r * (0.8 + ph * 3.2), side = (_r3dFxH(seed * 7 + p, gen) - 0.5) * r * 0.9;
    var pr = r * (0.45 + 0.9 * ph);
    _r3dFxBill(V.M, V, e.x - hx * back - hz * side, gy + pr * 0.55 + ph * 0.6, e.z - hz * back + hx * side,
               pr, pr, _r3dFxLift(pr), R3D_FXT_BLOB, ph, _r3dFxH(seed * 13 + p, gen),
               Math.sin(ph * Math.PI) * 0.6 * amt, 0, R3D_FX_DUST);
  }
}

/* A WAKE: foam fanning out behind the hull and fading back, lying on the water. k is the clock
   the foam's noise runs on, so it streams back off the stern. */
function _r3dFxWake(V, e, hx, hz, r, seed) {
  var s0 = r * 0.8, L = r * 5, w0 = r * 0.6, w1 = r * 2.2, px = -hz, pz = hx;
  var sx = e.x - hx * s0, sz = e.z - hz * s0, ex = sx - hx * L, ez = sz - hz * L;
  _r3dFxFlat(V.M, V, [ex - px * w1, ez - pz * w1], [ex + px * w1, ez + pz * w1],
             [sx - px * w0, sz - pz * w0], [sx + px * w0, sz + pz * w0], R3D_WATER_Y + 0.14,
             R3D_FX_SEA_LIFT, R3D_FXT_TRAIL, V.t * 6, seed, 0.8, L, R3D_FX_WAKEC);
}

/* Is there water under (x, z) to draw on: the sea, and not a flat the tide has gone out from
   (core/tide.js; world3d.js cuts those out of the sheet)? The wakes ask, and so does the swell a
   hull rides (unit3d.js). */
function _r3dWetAt(G, x, z) {
  var tx = _rtsTX(x), tz = _rtsTX(z);
  if (!_rtsInB(tx, tz)) return false;
  var ci = _rtsIdx(tx, tz);
  return G.terrain[ci] === RTS_T_WATER && !(G.tideDry && G.tideDry[ci]);
}

/* Every vehicle and ship on the move, into the main batch. */
function _r3dFxWakes(G, V) {
  var E = G.ents || [], vis = typeof _rtsVisible === 'function';
  for (var i = 0; i < E.length; i++) {
    var e = E[i];
    if (e.dead || e.type !== 'unit' || !e.path || e.air) continue;
    var d = rtsUnitDef(e.def);
    if (!d || d.kind === 'infantry' || d.kind === 'air') continue;
    if (vis && !_rtsVisible(_rtsTX(e.x), _rtsTX(e.z))) continue;
    var hx = Math.cos(e.rot || 0), hz = Math.sin(e.rot || 0), r = d.r || 1.6, seed = _r3dFxH(e.id || i + 1, 5.5);
    /* a wake wants water under the hull: a Monitor crossing a flat the tide has dried, or a
       hovercraft over one, is on sand (unit3d.js _r3dWetAt) */
    if ((d.sea || d.hover) && _r3dWetAt(G, e.x, e.z)) { _r3dFxWake(V, e, hx, hz, r, seed); continue; }
    var amt = _r3dFxDustOf(G, e.x - hx * r, e.z - hz * r);
    if (amt > 0) _r3dFxDust(V, e, hx, hz, r, seed, amt);
  }
}
