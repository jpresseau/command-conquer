/* THE BRIDGE LAYER (rules/units.js `bridgelayer`, core/bridgelayer.js). Its verb is the CROSSING,
   staged on a real generated map at a real gap - the one the map makes you walk furthest round:

     SPANNED     at the water's edge, DEPLOY turns the layer into a bridge across the gap ahead:
                 a record in G.bridges like the generator's, its water opened to land units,
                 and the vehicle spent
     A SHORTCUT  the walk from bank to bank, which went the long way round (or nowhere), is now
                 about the width of the water - and a tank sent across really drives over it
     STILL SEA   a ship still sails under it: the sea is one body
     REFUSED     in the middle of dry land it says so and stays a vehicle; it never lays a second
                 deck over a first, nor a pier along a shore - across the water, not along it */

var { Suite } = require('../lib/assert.js');
var { load } = require('../lib/sandbox.js');

var S = new Suite('bridgelayer');
var g = load(['src/rules', 'src/core', 'src/sprites/props.js']);

function fresh() {
  g._rtsNewGame(4242, 'easy');
  var G = g.window._rtsG;
  G.over = null;
  G.ents.forEach(function (e) { if (e.type === 'unit') e.dead = true; });
  g._rtsTick(1 / 30);
  G.teams = {};
  T = G.terrain; B = G.blocked;                      /* each game has its own grids */
  return G;
}
function pathLen(sx, sz, gx, gz) {
  var p = g._rtsPath(sx, sz, gx, gz, null);
  if (!p || !p.length) return Infinity;
  var L = 0, x = sx, z = sz;
  p.forEach(function (q) { L += Math.hypot(q.x - x, q.z - z); x = q.x; z = q.z; });
  return L;
}

/* ---------------- a real gap ---------------- */
var G = fresh(), N = g.RTS_N, T = G.terrain, B = G.blocked, W = g.RTS_T_WATER, best = null, tried = 0, seen = {};
/* every land cell, facing each way, asked of the layer's own gap finder - so the case is one it
   would really lay - and the gap the map makes you walk furthest round kept */
for (var tz = 2; tz < N - 2; tz++) for (var tx = 2; tx < N - 2; tx++) {
  var i0 = g._rtsIdx(tx, tz);
  if (T[i0] === W || B[i0] !== 0) continue;
  for (var f = 0; f < 4; f++) {
    var gp = g._rtsBridgeGap({ x: g._rtsWX(tx), z: g._rtsWX(tz), rot: f * Math.PI / 2 });
    if (!gp || gp.len < 2) continue;
    var key = gp.tx + ',' + gp.tz + ',' + gp.dx + ',' + gp.dz;
    if (seen[key]) continue;
    seen[key] = 1; tried++;
    var ex = gp.tx + gp.dx * gp.len, ez = gp.tz + gp.dz * gp.len;
    var a = { x: g._rtsWX(tx), z: g._rtsWX(tz) }, b = { x: g._rtsWX(ex), z: g._rtsWX(ez) };
    var walk = pathLen(a.x, a.z, b.x, b.z), straight = Math.hypot(b.x - a.x, b.z - a.z);
    var detour = walk === Infinity ? 1e9 : walk / straight;
    if (!best || detour > best.detour) best = { tx: tx, tz: tz, d: [gp.dx, gp.dz], len: gp.len, a: a, b: b, walk: walk, straight: straight, detour: detour };
  }
}
S.ok('the map has a gap worth bridging: water a layer can span, walked a long way round',
     !!best && best.detour > 3, tried + ' gaps found; the worst ' + (best ? (best.walk === Infinity ? 'unwalkable' : best.walk.toFixed(0) + ' units walked for ' + best.straight.toFixed(0) + ' across') : 'none'));

/* ---------------- spanned ---------------- */
var ly = g._rtsSpawnUnit('player', 'bridgelayer', best.a.x, best.a.z);
ly.rot = Math.atan2(best.d[1], best.d[0]);
var n0 = (G.bridges || []).length, rev0 = G.bridgeRev || 0;
G.sel = [ly];
S.ok('it offers the DEPLOY order', g._rtsCanDeploy(ly), '');
S.eq('at the water\'s edge, DEPLOY lays the bridge', g._rtsDeploySelected(), 1);
var br = G.bridges[G.bridges.length - 1];
S.ok('...a bridge like the generator\'s, across the gap it faced', G.bridges.length === n0 + 1 && br.dx === best.d[0] && br.dz === best.d[1] && br.len === best.len && br.w === 1,
     JSON.stringify({ dx: br.dx, dz: br.dz, len: br.len, w: br.w }));
var open = g._rtsBridgeCells(br).every(function (i) { return T[i] === W && B[i] === 0 && g._rtsIsBridgeCell(i); });
S.ok('...its water opened to land units', open, '');
S.ok('...the vehicle spent in the laying, and the renderer told', ly.dead && G.sel.indexOf(ly) < 0 && G.bridgeRev === rev0 + 1, 'layer ' + (ly.dead ? 'gone' : 'still there'));

/* ---------------- a shortcut ---------------- */
var after = pathLen(best.a.x, best.a.z, best.b.x, best.b.z);
S.ok('bank to bank is now about the width of the water', after < best.straight * 1.6,
     (best.walk === Infinity ? 'no way across' : best.walk.toFixed(0)) + ' -> ' + after.toFixed(0) + ' for ' + best.straight.toFixed(0) + ' straight');
var tk = g._rtsSpawnUnit('player', 'tank', best.a.x - best.d[0] * g.RTS_TILE, best.a.z - best.d[1] * g.RTS_TILE);
g._rtsOrderMove(tk, best.b.x + best.d[0] * g.RTS_TILE, best.b.z + best.d[1] * g.RTS_TILE, false);
var onDeck = false;
for (var t = 0; t < 30 * 30; t++) {
  g._rtsTick(1 / 30);
  if (g._rtsBridgeAt(tk.x, tk.z) && g._rtsBridgeAt(tk.x, tk.z).br === br) onDeck = true;
  if (!tk.path && Math.hypot(tk.x - best.b.x, tk.z - best.b.z) < g.RTS_TILE * 2.5) break;
}
S.ok('a tank sent across drives over it to the far bank', onDeck && Math.hypot(tk.x - best.b.x, tk.z - best.b.z) < g.RTS_TILE * 2.5,
     (onDeck ? 'crossed the deck' : 'never on the deck') + ', ' + Math.hypot(tk.x - best.b.x, tk.z - best.b.z).toFixed(1) + ' from the far bank');

/* ---------------- still sea ---------------- */
var mid = g._rtsBridgeCells(br)[br.len >> 1];
S.ok('a ship still sails under it', !g._rtsBlocked(mid % N, (mid / N) | 0, 'sea'), '');

/* ---------------- refused ---------------- */
G = fresh();
var dry = null;
for (var r = 0; r < N && !dry; r++) {
  var c = g._rtsNearestOpen(N >> 1, (N >> 1) + r, 4, null), ok = true;
  if (!c) continue;
  for (var dz = -10; dz <= 10 && ok; dz++) for (var dx = -10; dx <= 10; dx++)
    if (g._rtsInB(c[0] + dx, c[1] + dz) && T[g._rtsIdx(c[0] + dx, c[1] + dz)] === W) { ok = false; break; }
  if (ok) dry = c;
}
var dl = g._rtsSpawnUnit('player', 'bridgelayer', g._rtsWX(dry[0]), g._rtsWX(dry[1]));
var nb = G.bridges.length;
S.ok('in the middle of dry land it refuses, and stays a vehicle', !g._rtsLayBridge(dl) && !dl.dead && G.bridges.length === nb, '');
G = fresh();
var old = G.bridges[0];
S.ok('the case: the map has a bridge of its own to drive up to', !!old, (G.bridges || []).length + ' bridges');
if (old) {
  var nx = old.tx - old.dx, nz = old.tz - old.dz;               /* the near abutment */
  var ol = g._rtsSpawnUnit('player', 'bridgelayer', g._rtsWX(nx), g._rtsWX(nz));
  ol.rot = Math.atan2(old.dz, old.dx);
  var gap = g._rtsBridgeGap(ol);
  S.ok('...and it never lays a second deck over the first', !gap || gap.dx !== old.dx || gap.dz !== old.dz,
       gap ? 'offered ' + JSON.stringify({ dx: gap.dx, dz: gap.dz, len: gap.len }) : 'nothing to span');
}

/* ...nor from a deck: standing on the map's own bridge, which is water, it offers nothing whichever
   way it faces */
G = fresh();
var ob = G.bridges[0], mc = g._rtsBridgeCells(ob)[ob.len >> 1];
var offered = [0, 1, 2, 3].map(function (f) {
  return g._rtsBridgeGap({ x: g._rtsWX(mc % N), z: g._rtsWX((mc / N) | 0), rot: f * Math.PI / 2 });
}).filter(Boolean);
S.ok('...nor from the deck of a bridge, facing any way', offered.length === 0, offered.length + ' offered');

/* THE WAY IT FACES: where there are gaps two ways, it spans the one it is pointed at. No seed is
   promised a spot like that, so one is dug: on open dry ground, a channel four cells long and five
   wide to the east of a cell and another to its south, with land beyond each. */
G = fresh();
var fork = null, dryC = null;
for (var fz = 12; fz < N - 12 && !dryC; fz++) for (var fx = 12; fx < N - 12 && !dryC; fx++) {
  var allDry = true;
  for (var qz = -1; qz <= 9 && allDry; qz++) for (var qx = -3; qx <= 9; qx++) {
    var qi = g._rtsIdx(fx + qx, fz + qz);
    if (T[qi] === W || B[qi] !== 0) { allDry = false; break; }
  }
  if (allDry) dryC = [fx, fz];
}
function dig(x0, z0, x1, z1) {
  for (var zz = z0; zz <= z1; zz++) for (var xx = x0; xx <= x1; xx++) { var di = g._rtsIdx(xx, zz); T[di] = W; B[di] = 2; }
}
if (dryC) {
  var cx = dryC[0], cz = dryC[1];
  dig(cx + 1, cz - 2, cx + 4, cz + 2);                     /* east: x+1..x+4, five wide */
  dig(cx - 2, cz + 1, cx + 2, cz + 4);                     /* south: z+1..z+4, five wide */
  fork = { tx: cx, tz: cz, ways: [0, 1] };                 /* facing east is rot 0, south is pi/2 */
}
S.ok('the case: a spot with a gap two ways', !!fork, fork ? JSON.stringify(fork) : 'none');
if (fork) {
  var picks = fork.ways.map(function (f) {
    var gq = g._rtsBridgeGap({ x: g._rtsWX(fork.tx), z: g._rtsWX(fork.tz), rot: f * Math.PI / 2 + 0.3 });
    return !!gq && gq.dx === Math.round(Math.cos(f * Math.PI / 2)) && gq.dz === Math.round(Math.sin(f * Math.PI / 2));
  });
  S.ok('...and pointed at either, it spans that one', picks.every(Boolean), JSON.stringify(picks));
}

/* ACROSS, NOT ALONG: a run of water from land to land that hugs a shore - water on one side of
   the deck, land on the other - is a pier, and the layer will not lay it */
G = fresh();
var pier = null;
for (var pz2 = 2; pz2 < N - 2 && !pier; pz2++) for (var px2 = 2; px2 < N - 2 && !pier; px2++) {
  if (T[g._rtsIdx(px2, pz2)] === W || B[g._rtsIdx(px2, pz2)] !== 0) continue;
  for (var k2 = 1; k2 <= g.RTS_LAYBRIDGE_SPAN + 1; k2++) {
    if (!g._rtsInB(px2 + k2, pz2)) break;
    var c2 = g._rtsIdx(px2 + k2, pz2);
    if (T[c2] === W) { if (B[c2] !== 2) break; continue; }
    if (k2 >= 4 && B[c2] === 0) {
      var cand = { tx: px2 + 1, tz: pz2, dx: 1, dz: 0, len: k2 - 1, w: 1, px: 0, pz: 1 };
      if (!g._rtsBridgeAcross(cand)) pier = { tx: px2, tz: pz2, len: k2 - 1 };
    }
    break;
  }
}
S.ok('the case: a run of water from land to land along a shore', !!pier, pier ? JSON.stringify(pier) : 'none');
if (pier) {
  var pg = g._rtsBridgeGap({ x: g._rtsWX(pier.tx), z: g._rtsWX(pier.tz), rot: 0 });
  S.ok('...and the layer will not lay a pier down it', !pg || pg.dx !== 1, pg ? 'offered ' + JSON.stringify({ dx: pg.dx, dz: pg.dz, len: pg.len }) : 'refused');
}

/* ---------------- the longest span ---------------- */
/* RTS_LAYBRIDGE_SPAN cells of water is spanned; one more is not: a channel dug five wide (water
   two cells either side of the deck, so it is a crossing and not a pier) across open ground */
G = fresh();
var SPAN = g.RTS_LAYBRIDGE_SPAN, flatRow = null;
for (var fz2 = 4; fz2 < N - 4 && !flatRow; fz2++) for (var fx2 = 2; fx2 < N - SPAN - 4 && !flatRow; fx2++) {
  var okRow = true;
  for (var cz = fz2 - 2; cz <= fz2 + 2 && okRow; cz++) for (var cx = fx2 - 1; cx <= fx2 + SPAN + 2 && okRow; cx++) {
    var ci2 = g._rtsIdx(cx, cz);
    if (T[ci2] === W || B[ci2] !== 0 || (G.tideD && G.tideD[ci2])) okRow = false;
  }
  if (okRow) flatRow = [fx2, fz2];
}
S.ok('the case: open ground a span and a half wide, five deep', !!flatRow, flatRow ? flatRow.join(',') : 'none');
if (flatRow) {
  dig(flatRow[0] + 1, flatRow[1] - 2, flatRow[0] + SPAN, flatRow[1] + 2);                   /* SPAN cells of water ahead, five wide */
  var atCap = g._rtsBridgeGap({ x: g._rtsWX(flatRow[0]), z: g._rtsWX(flatRow[1]), rot: 0 });
  dig(flatRow[0] + SPAN + 1, flatRow[1] - 2, flatRow[0] + SPAN + 1, flatRow[1] + 2);        /* one more */
  var overCap = g._rtsBridgeGap({ x: g._rtsWX(flatRow[0]), z: g._rtsWX(flatRow[1]), rot: 0 });
  S.ok('a gap of RTS_LAYBRIDGE_SPAN cells is spanned, and one a cell longer is not', !!atCap && atCap.len === SPAN && atCap.dx === 1 && !(overCap && overCap.dx === 1),
       (atCap ? 'offered ' + atCap.len : 'refused ' + SPAN) + '; ' + (overCap && overCap.dx === 1 ? 'offered ' + overCap.len : 'refused ' + (SPAN + 1)));
}

/* ---------------- at low water ---------------- */
/* a flat the tide has dried is ground (core/tide.js): the water's edge is out on the flats, and
   a layer standing there is offered the span across what is still wet */
G = fresh(); T = G.terrain; B = G.blocked;
G.t = g.RTS_TIDE.period / 2; g._rtsTideTick(0);
var fromFlat = null, dryCells = 0;
for (var fz = 2; fz < N - 2 && !fromFlat; fz++) for (var fx = 2; fx < N - 2 && !fromFlat; fx++) {
  var fi = g._rtsIdx(fx, fz);
  if (T[fi] !== W || !G.tideDry[fi] || g._rtsBlocked(fx, fz, null)) continue;
  dryCells++;
  for (var ff = 0; ff < 4 && !fromFlat; ff++) {
    var fg = g._rtsBridgeGap({ x: g._rtsWX(fx), z: g._rtsWX(fz), rot: ff * Math.PI / 2 });
    if (fg && fg.len >= 2) fromFlat = { tx: fx, tz: fz, rot: ff * Math.PI / 2, len: fg.len };
  }
}
S.ok('the case: at low water, dried flats a tank may stand on', dryCells > 5, dryCells + ' dry open cells');
S.ok('a layer on a dried flat at the water\'s edge is offered the span across what is still wet', !!fromFlat, fromFlat ? JSON.stringify(fromFlat) : 'none offered');
if (fromFlat) {
  var dfi = g._rtsIdx(fromFlat.tx, fromFlat.tz);
  G.tideDry[dfi] = 0;
  var wetAgain = g._rtsBridgeGap({ x: g._rtsWX(fromFlat.tx), z: g._rtsWX(fromFlat.tz), rot: fromFlat.rot });
  G.tideDry[dfi] = 1;
  S.ok('...and not from the same cell while the water is over it', !wetAgain, wetAgain ? 'offered' : 'refused');
}

require('../lib/report.js')(S);
