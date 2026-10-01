/* render3d/scenery3d.js - the countryside between the bases. Part of rts.render3d.

   Between the two bases the map was forest, rock, grass and a few dirt roads: nothing said
   anyone had ever lived there. The battlefields of the later RTS games are PLACES - farmland
   fought across, a farmstead at the edge of the woods, poles marching along the road, the
   rusting wreck of an earlier war. So, in the 3D mode:

     FIELDS         crop rows on bare soil - wheat, green rows or fresh furrows - fenced, with
                    bales on the wheat; on open grass well away from the bases, ore and roads
     FARMSTEADS     a house, a barn and a silo, on a two-by-two block of forest at the wood's
                    edge - ground no unit could cross anyway, so nothing about pathing moves;
                    the world batch leaves those cells' trees out (world3d.js reads the claim)
     POLES          telegraph poles along the roads, on the verge, wired to each other
     WRECKS         rusting car and tank hulks by the roadside
     BOULDERS       scattered off the rock ridges and along the beaches

   COSMETIC, ALL OF IT, and it is held to that: nothing here writes G.blocked, G.terrain or any
   simulation state, or draws from the game's random stream - placement is _sprHash of the cell,
   salted with the map's seed, so the same map is always furnished the same way and a different
   seed is furnished differently. What stands on open ground - a field, a pole, a wreck, a rock -
   is taken away when ore spreads under it or a building goes down on it (_r3dSceneryTick).

   ITS OWN BATCH, R3.scenery, chunked like the world's and drawn beside it in both passes, and
   only while there IS a world batch (a spec that clears R3.world for bare ground clears this
   too). R3.sceneryAmt 0 takes it out. Kept out of _r3dWorldBuild, whose triangle cap and
   per-cell tree counts are held by e2e/canopy and e2e/scatter. */

var R3D_SCN_FIELDS = 9, R3D_SCN_FARMS = 5, R3D_SCN_WRECKS = 8, R3D_SCN_POLES = 70, R3D_SCN_ROCKS = 48;
var R3D_SCN_CLEAR = 16;          /* cells kept clear round each start - where the bases grow */
var R3D_SCN = {
  soil: '#6b5536', furrow: '#5a452b', wheat: '#c2a24c', wheatTop: '#d8bb62', greens: '#5f7d3a',
  post: '#6a5238', rail: '#7d6444', bale: '#c9ad5a', baleTop: '#d9c07a',
  wall: '#d6cfbc', roof: '#8e3b2e', barn: '#7a2f25', barnRoof: '#4a3a30', door: '#3a2c20',
  glass: '#2c3440', silo: '#9aa0a4', siloTop: '#b7bcbf', pole: '#4a3a2a', wire: '#2a2a2a', ins: '#d8d8d0',
  rust: ['#6a4130', '#84513a', '#3e2a20'], hulk: '#3a332d', hulkTop: '#4a3f36', tyre: '#1f1d1b'
};

/* THE PLAN: where everything goes, worked out once a map from its cells. `claim` marks cells
   the world batch should leave alone: 1 a farmstead's (no trees), 2 a field's (no grass tufts),
   3 the wood round a farmstead (one tree, not two). */
function _r3dSceneryPlan(G) {
  var N = RTS_N, T = G.terrain, B = G.blocked, S = G.scrap, P = { fields: [], farms: [], poles: [], wires: [], wrecks: [], rocks: [], claim: {} };
  if (!T || !B) return P;
  var seed = (G.seed || 0) % 100003, i, tx, tz;
  /* G.starts is { player, enemy }, not a list: read as one, `far` passed everything */
  var st = Array.isArray(G.starts) ? G.starts : G.starts ? [G.starts.player, G.starts.enemy].filter(Boolean) : [];
  function h(a, b, s) { return _sprHash(a * 131 + seed, b * 7 + (seed % 97), s); }
  function I(x, z) { return z * N + x; }
  function inB(x, z) { return x >= 1 && z >= 1 && x < N - 1 && z < N - 1; }
  function far(x, z, d) {
    for (var k = 0; k < st.length; k++) if (Math.hypot(x - st[k].tx, z - st[k].tz) < d) return false;
    return true;
  }
  /* within `d` cells of ore, or of a road */
  function near(x, z, d, test) {
    for (var dz = -d; dz <= d; dz++) for (var dx = -d; dx <= d; dx++) {
      var a = x + dx, b = z + dz;
      if (a >= 0 && b >= 0 && a < N && b < N && test(I(a, b))) return true;
    }
    return false;
  }
  function ore(k) { return S && S[k] > 0; }
  function road(k) { return T[k] === RTS_T_ROAD; }
  function open(x, z) { var k = I(x, z); return inB(x, z) && !B[k] && !ore(k) && (T[k] === RTS_T_GRASS || T[k] === RTS_T_SAND); }
  function spaced(list, x, z, d) { for (var k = 0; k < list.length; k++) if (Math.hypot(list[k].tx - x, list[k].tz - z) < d) return false; return true; }

  /* FIELDS: a rectangle of level grass, a cell of grass all round it */
  for (tz = 4; tz < N - 10 && P.fields.length < R3D_SCN_FIELDS; tz++) for (tx = 4; tx < N - 10 && P.fields.length < R3D_SCN_FIELDS; tx++) {
    if (h(tx, tz, 901) > 0.035) continue;
    var w = 4 + Math.floor(h(tx, tz, 903) * 4), d = 3 + Math.floor(h(tz, tx, 907) * 3), ok = true, lo = 255, hi = 0;
    if (!far(tx + w / 2, tz + d / 2, R3D_SCN_CLEAR + 4)) continue;
    for (var z = tz - 1; ok && z <= tz + d; z++) for (var x = tx - 1; ok && x <= tx + w; x++) {
      var k = I(x, z);
      if (!inB(x, z) || T[k] !== RTS_T_GRASS || B[k] || P.claim[k]) { ok = false; break; }
      if (G.height) { lo = Math.min(lo, G.height[k]); hi = Math.max(hi, G.height[k]); }
    }
    if (!ok || hi - lo > 40 || near(tx + (w >> 1), tz + (d >> 1), (Math.max(w, d) >> 1) + 3, ore) ||
        near(tx + (w >> 1), tz + (d >> 1), (Math.max(w, d) >> 1) + 1, road)) continue;
    var fl = { tx: tx, tz: tz, w: w, d: d, crop: Math.floor(h(tx, tz, 911) * 3), gate: Math.floor(h(tz, tx, 913) * 4) };
    for (z = tz - 2; z <= tz + d + 1; z++) for (x = tx - 2; x <= tx + w + 1; x++) if (inB(x, z) && T[I(x, z)] === RTS_T_GRASS) P.claim[I(x, z)] = P.claim[I(x, z)] || 2;
    P.fields.push(fl);
  }
  /* FARMSTEADS: a two-by-two of forest with open grass along a side of it, near a field */
  for (tz = 3; tz < N - 5 && P.farms.length < R3D_SCN_FARMS; tz++) for (tx = 3; tx < N - 5 && P.farms.length < R3D_SCN_FARMS; tx++) {
    if (h(tx, tz, 921) > 0.12) continue;
    if (T[I(tx, tz)] !== RTS_T_TREE || T[I(tx + 1, tz)] !== RTS_T_TREE || T[I(tx, tz + 1)] !== RTS_T_TREE || T[I(tx + 1, tz + 1)] !== RTS_T_TREE) continue;
    var edge = 0;
    for (i = -1; i <= 2; i++) {
      [[tx + i, tz - 1], [tx + i, tz + 2], [tx - 1, tz + i], [tx + 2, tz + i]].forEach(function (c) { if (inB(c[0], c[1]) && T[I(c[0], c[1])] === RTS_T_GRASS) edge++; });
    }
    if (edge < 4 || !far(tx, tz, R3D_SCN_CLEAR) || !spaced(P.farms, tx, tz, 14)) continue;
    if (!P.fields.some(function (f) { return Math.hypot(f.tx - tx, f.tz - tz) < 14; }) && h(tx, tz, 923) > 0.02) continue;
    P.farms.push({ tx: tx, tz: tz, ang: h(tx, tz, 925) * 6.2832 });
    P.claim[I(tx, tz)] = P.claim[I(tx + 1, tz)] = P.claim[I(tx, tz + 1)] = P.claim[I(tx + 1, tz + 1)] = 1;
    /* the wood round it thinned to a tree a cell, so the yard is not walled in by canopy */
    for (var rz = tz - 1; rz <= tz + 2; rz++) for (var rx = tx - 1; rx <= tx + 2; rx++) if (inB(rx, rz) && T[I(rx, rz)] === RTS_T_TREE && !P.claim[I(rx, rz)]) P.claim[I(rx, rz)] = 3;
  }
  /* POLES: on the verge of the roads, a few cells apart, each wired to the next */
  for (tz = 2; tz < N - 2 && P.poles.length < R3D_SCN_POLES; tz++) for (tx = 2; tx < N - 2 && P.poles.length < R3D_SCN_POLES; tx++) {
    var kk = I(tx, tz);
    if (T[kk] !== RTS_T_GRASS || B[kk] || ore(kk) || P.claim[kk]) continue;
    if (!(road(I(tx + 1, tz)) || road(I(tx - 1, tz)) || road(I(tx, tz + 1)) || road(I(tx, tz - 1)))) continue;
    if (h(tx, tz, 931) > 0.5 || !far(tx, tz, 8) || !spaced(P.poles, tx, tz, 5)) continue;
    P.poles.push({ tx: tx, tz: tz });
  }
  var linked = {};
  P.poles.forEach(function (p, a) {
    var best = -1, bd = 9;
    P.poles.forEach(function (q, b) { var dd = Math.hypot(p.tx - q.tx, p.tz - q.tz); if (b !== a && dd < bd && !linked[b + ':' + a]) { bd = dd; best = b; } });
    if (best >= 0) { linked[a + ':' + best] = 1; P.wires.push([a, best]); }
  });
  /* WRECKS: off the road, beside it */
  for (tz = 3; tz < N - 3 && P.wrecks.length < R3D_SCN_WRECKS; tz++) for (tx = 3; tx < N - 3 && P.wrecks.length < R3D_SCN_WRECKS; tx++) {
    if (h(tx, tz, 941) > 0.03 || !open(tx, tz) || road(I(tx, tz)) || P.claim[I(tx, tz)]) continue;
    if (!near(tx, tz, 3, road) || !far(tx, tz, 14) || !spaced(P.wrecks, tx, tz, 12)) continue;
    P.wrecks.push({ tx: tx, tz: tz, kind: h(tx, tz, 943) > 0.6 ? 1 : 0, ang: h(tz, tx, 947) * 6.2832 });
  }
  /* BOULDERS: off the ridges, and on the beaches */
  for (tz = 2; tz < N - 2 && P.rocks.length < R3D_SCN_ROCKS; tz++) for (tx = 2; tx < N - 2 && P.rocks.length < R3D_SCN_ROCKS; tx++) {
    if (!open(tx, tz) || P.claim[I(tx, tz)] || road(I(tx, tz))) continue;
    var byRock = near(tx, tz, 1, function (k) { return T[k] === RTS_T_ROCK; });
    var byWater = T[I(tx, tz)] === RTS_T_SAND && near(tx, tz, 1, function (k) { return T[k] === RTS_T_WATER; });
    if (!(byRock ? h(tx, tz, 951) < 0.14 : byWater && h(tx, tz, 953) < 0.05)) continue;
    if (!far(tx, tz, 10) || !spaced(P.rocks, tx, tz, 4)) continue;
    P.rocks.push({ tx: tx, tz: tz });
  }
  return P;
}

/* Every cell a piece stands on, for the watch below: a field's cells, and the rest's own. */
function _r3dSceneryCells(P) {
  var out = [], N = RTS_N;
  P.fields.forEach(function (f) { for (var z = f.tz; z < f.tz + f.d; z++) for (var x = f.tx; x < f.tx + f.w; x++) out.push(z * N + x); });
  [P.poles, P.wrecks, P.rocks].forEach(function (L) { L.forEach(function (p) { out.push(p.tz * N + p.tx); }); });
  return out;
}
/* Is this piece's ground still its own - no ore on it, nothing built on it? */
function _r3dSceneryFree(G, k) { return !G.blocked[k] && !(G.scrap && G.scrap[k] > 0); }

/* A world-batch mesh per chunk, like the world's, rebuilt when the plan's ground changes. */
function _r3dSceneryTick(G) {
  var R3 = window._R3D;
  if (!R3 || !R3.gl) return;
  if (R3.scnFor !== G) { R3.scnPlan = R3.scnPlan && R3.scnPlanFor === G ? R3.scnPlan : _r3dSceneryPlan(G); R3.scnPlanFor = G; R3.scnFor = G; R3.scnKey = null; }
  /* every frame: a few hundred cells, and game time stands still while paused */
  var cells = R3.scnCells || (R3.scnCells = _r3dSceneryCells(R3.scnPlan)), key = 0;
  if (R3.scnCellsFor !== R3.scnPlan) { cells = R3.scnCells = _r3dSceneryCells(R3.scnPlan); R3.scnCellsFor = R3.scnPlan; }
  for (var i = 0; i < cells.length; i++) if (!_r3dSceneryFree(G, cells[i])) key = (Math.imul(key, 31) + cells[i] + 1) | 0;
  if (key === R3.scnKey) return;
  R3.scnKey = key;
  _r3dSceneryBuild(G, R3.scnPlan);
}
function _r3dSceneryBatches(R3) {
  if (!R3.world || !R3.world.length) return [];
  /* the bridges are not the countryside's to take away - a tank stands on them (bridge3d.js) */
  var b = R3.bridges || [];
  return R3.sceneryAmt === 0 || !R3.scenery ? b : b.length ? R3.scenery.concat(b) : R3.scenery;
}
