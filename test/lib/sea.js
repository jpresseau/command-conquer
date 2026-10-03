/* The sea on the map a naval spec is about to play on, measured in the page before anything is
   asserted about it (e2e/navsea, e2e/navair). A generated map is not guaranteed to be
   interesting, and a spec that quietly did nothing on a dry map would report success for a
   subsystem it never reached. Handed to page.evaluate as it stands, so it runs in the page:
   the largest body of water, its deepest cell, a buildable shore cell, the water beside it and
   a second water cell near that one. */

function seaSurvey() {
  var G = window._rtsG, cells = [], i;
  for (i = 0; i < G.terrain.length; i++) if (G.terrain[i] === RTS_T_WATER) cells.push(i);
  if (!cells.length) return { error: 'this map has no water at all' };
  /* the largest connected body, and a cell well inside it */
  var seen = {}, best = [], q, head, c, cx, cz, n;
  for (i = 0; i < cells.length; i++) {
    if (seen[cells[i]]) continue;
    q = [cells[i]]; head = 0; seen[cells[i]] = 1;
    while (head < q.length) {
      c = q[head++]; cx = c % RTS_N; cz = (c / RTS_N) | 0;
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
        var nx = cx + d[0], nz = cz + d[1];
        if (nx < 0 || nz < 0 || nx >= RTS_N || nz >= RTS_N) return;
        var ni = nz * RTS_N + nx;
        if (seen[ni] || G.terrain[ni] !== RTS_T_WATER) return;
        seen[ni] = 1; q.push(ni);
      });
    }
    if (q.length > best.length) best = q;
  }
  /* deepest water: the cell furthest from any shore, so a ship put there has room */
  var deep = best[0], deepScore = -1;
  best.forEach(function (ci) {
    var tx = ci % RTS_N, tz = (ci / RTS_N) | 0, r = 0;
    while (r < 8) {
      var edge = false;
      for (var ox = -r; ox <= r && !edge; ox++) for (var oz = -r; oz <= r && !edge; oz++) {
        var x = tx + ox, z = tz + oz;
        if (!_rtsInB(x, z) || G.terrain[_rtsIdx(x, z)] !== RTS_T_WATER) edge = true;
      }
      if (edge) break;
      r++;
    }
    if (r > deepScore) { deepScore = r; deep = ci; }
  });
  /* a shore cell: land with water beside it */
  var shore = null, shoreWater = null;
  for (i = 0; i < best.length && !shore; i++) {
    var tx0 = best[i] % RTS_N, tz0 = (best[i] / RTS_N) | 0;
    for (var ox2 = -1; ox2 <= 1 && !shore; ox2++) for (var oz2 = -1; oz2 <= 1 && !shore; oz2++) {
      var x2 = tx0 + ox2, z2 = tz0 + oz2;
      if (_rtsInB(x2, z2) && G.terrain[_rtsIdx(x2, z2)] !== RTS_T_WATER && !_rtsBlocked(x2, z2)) {
        shore = { tx: x2, tz: z2 };
        /* the water cell it stands beside - a submarine has to be within TORPEDO range of
           the beach for the refusal to mean anything, and the deepest water is nowhere near */
        shoreWater = { tx: tx0, tz: tz0 };
      }
    }
  }
  /* a second water cell near the first, so a ship target can sit within torpedo range of a
     submarine that is itself within torpedo range of the beach */
  var shoreWater2 = null;
  if (shoreWater) {
    for (var rr = 1; rr <= 3 && !shoreWater2; rr++) {
      for (var ax = -rr; ax <= rr && !shoreWater2; ax++) for (var az = -rr; az <= rr && !shoreWater2; az++) {
        if (Math.max(Math.abs(ax), Math.abs(az)) !== rr) continue;
        var wx3 = shoreWater.tx + ax, wz3 = shoreWater.tz + az;
        if (_rtsInB(wx3, wz3) && G.terrain[_rtsIdx(wx3, wz3)] === RTS_T_WATER)
          shoreWater2 = { tx: wx3, tz: wz3 };
      }
    }
  }
  return { total: cells.length, body: best.length,
           deep: { tx: deep % RTS_N, tz: (deep / RTS_N) | 0 }, margin: deepScore,
           shore: shore, shoreWater: shoreWater, shoreWater2: shoreWater2, tile: RTS_TILE };
}

module.exports = { seaSurvey: seaSurvey };
