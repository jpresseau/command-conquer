/* Where the base is paved - _r3dPaved in render3d/terrain3d.js.

   The 3D ground is materials now, and one of them belongs to the ground map rather than to the
   terrain: PAVED, laid under and round every building, so a base stands on a cobbled plaza with
   streets running out of it while the roads out in the country stay dirt tracks. The rule has
   three parts and each can quietly go wrong: the plaza (footprint and a ring), the streets (road
   near a building), and what is never paved (water, forest, rock - and anything round a wall,
   which is a line, not a base). e2e/terrainmat checks the picture; this holds the rule. */

var { Suite } = require('../lib/assert.js');
var { load } = require('../lib/sandbox.js');

var S = new Suite('paving');
var g = load(['src/rules', 'src/core', 'src/render3d/noise3d.js', 'src/render3d/terrain3d.js']);
var N = g.RTS_N;

function world(fill) {
  var G = { terrain: new Uint8Array(N * N), ents: [] };
  if (fill) G.terrain.fill(fill);
  g.window._rtsG = G;
  return G;
}
function at(p, tx, tz) { return p[tz * N + tx]; }

/* ---- a barracks (2x2) on open grass: its footprint and a one-cell ring, and no further ---- */
(function () {
  var G = world(g.RTS_T_GRASS);
  G.ents.push({ type: 'struct', def: 'barracks', tx: 40, tz: 40, dead: false });
  var p = g._r3dPaved(G);
  S.eq('a building\'s footprint is paved', at(p, 40, 40) + at(p, 41, 41), 2);
  S.eq('...and the ring round it', at(p, 39, 39) + at(p, 42, 42) + at(p, 39, 42), 3);
  S.eq('...but open grass further out is left as grass', at(p, 43, 40) + at(p, 38, 40), 0);
  var n = 0;
  for (var i = 0; i < p.length; i++) n += p[i];
  S.eq('exactly the 4x4 plaza, nothing else', n, 16);
})();

/* ---- roads near a building become its streets; roads far away stay tracks ---- */
(function () {
  var G = world(g.RTS_T_GRASS);
  for (var x = 30; x < 60; x++) G.terrain[45 * N + x] = g.RTS_T_ROAD;
  G.ents.push({ type: 'struct', def: 'barracks', tx: 40, tz: 42, dead: false });
  var p = g._r3dPaved(G);
  S.eq('road within reach of a building is paved', at(p, 44, 45), 1);
  S.eq('...up to four cells beyond its footprint', at(p, 45, 45) + at(p, 36, 45), 2);
  S.eq('...and road beyond that stays a dirt track', at(p, 46, 45) + at(p, 35, 45) + at(p, 58, 45), 0);
})();

/* ---- what is never paved ---- */
(function () {
  var G = world(g.RTS_T_WATER);
  G.ents.push({ type: 'struct', def: 'barracks', tx: 40, tz: 40, dead: false });
  var p = g._r3dPaved(G), n = 0;
  for (var i = 0; i < p.length; i++) n += p[i];
  S.eq('water is never paved, even under a building', n, 0);

  G = world(g.RTS_T_TREE);
  G.ents.push({ type: 'struct', def: 'barracks', tx: 40, tz: 40, dead: false });
  p = g._r3dPaved(G); n = 0;
  for (i = 0; i < p.length; i++) n += p[i];
  S.eq('...nor forest', n, 0);

  G = world(g.RTS_T_GRASS);
  G.ents.push({ type: 'struct', def: 'wall', tx: 40, tz: 40, dead: false });
  p = g._r3dPaved(G); n = 0;
  for (i = 0; i < p.length; i++) n += p[i];
  S.eq('a wall is a line, not a base - nothing round it is paved', n, 0);

  G = world(g.RTS_T_GRASS);
  G.ents.push({ type: 'struct', def: 'barracks', tx: 40, tz: 40, dead: true });
  p = g._r3dPaved(G); n = 0;
  for (i = 0; i < p.length; i++) n += p[i];
  S.eq('...and a destroyed building takes its plaza with it', n, 0);
})();

/* ---- the edge of the map ---- */
(function () {
  var G = world(g.RTS_T_GRASS);
  G.ents.push({ type: 'struct', def: 'barracks', tx: 0, tz: 0, dead: false });
  var p;
  S.ok('a building in the corner does not pave off the map', (function () {
    try { p = g._r3dPaved(G); return true; } catch (e) { return false; } })(), '');
  S.eq('...and paves what is on it', at(p, 0, 0) + at(p, 2, 2), 2);
})();

require('../lib/report.js')(S);
