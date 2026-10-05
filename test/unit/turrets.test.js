/* A TURRET ON ITS MOUNT - sprites/props.js RTS_TURRETED, sprites/unit-airsea.js RTS_TURRET_AT,
   render3d/unit3d.js _r3dTurretAt, husk3d.js:

     TWO PARTS     every turreted unit's model builds a 'hull' and a 'turret', and the two make
                   up the whole: the turret part is a fraction of it, built about the origin -
                   never the whole ship again (the destroyer's once was, so a ship firing abeam
                   was drawn twice, the second hull swung across the first)
     THE MOUNTS    a gun ship's turret part is drawn at each place RTS_TURRET_AT names: the whole
                   model is the hull plus that one part set down at every mount, the mounts lie
                   on the hull, and every ship with mounts is turreted
     IN THE WORLD  _r3dTurretAt turns the mounts with the hull: a destroyer's two are fore and
                   aft of it whichever way it heads; a tank's one is at its centre
     THE HUSK      a wreck's turret part is drawn on the same mounts */

var { Suite } = require('../lib/assert.js');
var { load } = require('../lib/sandbox.js');

var S = new Suite('turrets');
var g = load(['src/rules', 'src/core', 'src/r3d', 'src/sprites', 'src/render3d']);
g._rtsNewGame(4242, 'easy');
var G = g.window._rtsG;

var keys = Object.keys(g.RTS_TURRETED), ships = Object.keys(g.RTS_TURRET_AT);
S.ok('the population: turreted units, four of them gun ships with mounts', keys.length >= 8 && ships.length >= 4 && ships.indexOf('monitor') >= 0 && ships.indexOf('destroyer') >= 0,
     keys.join(' ') + ' / ' + ships.join(' '));
S.ok('every ship with mounts is turreted', ships.every(function (k) { return g.RTS_TURRETED[k]; }), ships.filter(function (k) { return !g.RTS_TURRETED[k]; }).join(' '));

/* a face as a string, after moving it by (dx, dz), so sets of faces can be compared */
function faceKey(f, dx, dz) {
  return f.v.map(function (p) { return (p[0] + dx).toFixed(4) + ',' + p[1].toFixed(4) + ',' + (p[2] + dz).toFixed(4); }).join('|') + '#' + JSON.stringify(f.c || f.col || '');
}
function keysOf(m, dx, dz) { return m.map(function (f) { return faceKey(f, dx || 0, dz || 0); }).sort(); }
function extent(m) {
  var lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  m.forEach(function (f) { f.v.forEach(function (p) { for (var i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], p[i]); hi[i] = Math.max(hi[i], p[i]); } }); });
  return { lo: lo, hi: hi };
}
var badSplit = [], notPart = [], offOrigin = [], offHull = [];
keys.forEach(function (k) {
  var sc = g._sprUnitScale(k);
  var whole = g._sprUnitModel(k, 'player', false, null), hull = g._sprUnitModel(k, 'player', false, 'hull'), tur = g._sprUnitModel(k, 'player', false, 'turret');
  /* the Monitor's turret IS half its model, by design; the destroyer's was once all of it */
  if (!(tur.length > 0 && tur.length < whole.length * 0.6 && hull.length < whole.length)) notPart.push(k + ':' + hull.length + '+' + tur.length + '/' + whole.length);
  var te = extent(tur);
  if (!(te.lo[0] < 0 && te.hi[0] > 0 && Math.abs(te.lo[2] + te.hi[2]) < 0.5 * sc)) offOrigin.push(k);
  var mounts = g.RTS_TURRET_AT[k] || [[0, 0]], want = keysOf(hull);
  mounts.forEach(function (p) { want = want.concat(keysOf(tur, p[0] * sc, p[1] * sc)); });
  if (want.sort().join('\n') !== keysOf(whole).join('\n')) badSplit.push(k);
  var he = extent(hull);
  mounts.forEach(function (p) { if (!(p[0] * sc > he.lo[0] && p[0] * sc < he.hi[0] && Math.abs(p[1] * sc) < (he.hi[2] - he.lo[2]) / 2)) offHull.push(k); });
});
S.eq('every turreted model builds in two parts, the turret a fraction of the whole', notPart.join(' ') || 'all', 'all');
S.eq('...the turret part about the origin', offOrigin.join(' ') || 'all', 'all');
S.eq('...and the hull plus that part at every mount is the whole model, face for face', badSplit.join(' ') || 'all', 'all');
S.eq('...with every mount on the hull', offHull.join(' ') || 'all', 'all');

/* ---- in the world ---- */
var sc = g._sprUnitScale('destroyer') * g.RTS_TILE / g.RTS_TS, M = g.RTS_TURRET_AT.destroyer;
function at(def, rot) { return g._r3dTurretAt(def, 100, 200, rot); }
var east = at('destroyer', 0), north = at('destroyer', Math.PI / 2);
S.ok('a destroyer heading +x has a mount ahead of it and one astern', east.length === 2 && Math.abs(east[0].x - (100 + M[0][0] * sc)) < 1e-9 && Math.abs(east[1].x - (100 + M[1][0] * sc)) < 1e-9 && Math.abs(east[0].z - 200) < 1e-9,
     east.map(function (p) { return p.x.toFixed(2) + ',' + p.z.toFixed(2); }).join(' / '));
S.ok('...turned to head +z, the same two mounts turn with it', Math.abs(north[0].z - (200 + M[0][0] * sc)) < 1e-9 && Math.abs(north[1].z - (200 + M[1][0] * sc)) < 1e-9 && Math.abs(north[0].x - 100) < 1e-9,
     north.map(function (p) { return p.x.toFixed(2) + ',' + p.z.toFixed(2); }).join(' / '));
var tk = at('tank', 1.1);
S.ok('a tank\'s one turret turns at its centre', tk.length === 1 && tk[0].x === 100 && tk[0].z === 200);

/* ---- the husk ---- */
g._rtsR = g.window._rtsR = { spr: { turret: { player: { destroyer: 1, tank: 1 } } } };
g._r3dMesh = function (kind, def, side, part) { return { def: def, part: part || null }; };
function husks(def, rot) {
  var draws = [], R3 = { huskAmt: 1 };
  G.fx = [{ kind: 'firemed', x: 100, y: 1, z: 200, t: 0.5, base: 1, husk: { def: def, side: 'player', rot: rot, tur: 0.4 } }];
  g._r3dHusks(G, R3, function (m, x, y, z, r, n) { draws.push({ part: m.part, x: x, z: z, rot: r }); });
  return draws;
}
var hd = husks('destroyer', 0), ht = husks('tank', 0);
S.ok('a destroyer\'s husk is its hull and its turret part on both mounts, turned where the guns pointed',
     hd.length === 3 && hd[0].part === 'hull' && hd.filter(function (d) { return d.part === 'turret'; }).length === 2
     && Math.abs(hd[1].x - east[0].x) < 1e-9 && Math.abs(hd[2].x - east[1].x) < 1e-9 && Math.abs(hd[1].rot + 0.4) < 1e-9,
     hd.map(function (d) { return d.part + '@' + d.x.toFixed(1); }).join(' '));
S.ok('...a tank\'s, hull and turret at its centre', ht.length === 2 && ht[1].part === 'turret' && ht[1].x === 100 && ht[1].z === 200);

require('../lib/report.js')(S);
