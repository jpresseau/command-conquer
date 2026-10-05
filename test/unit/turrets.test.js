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
var badSplit = [], notPart = [], offOrigin = [], offHull = [], offRing = [];
keys.forEach(function (k) {
  var sc = g._sprUnitScale(k);
  var whole = g._sprUnitModel(k, 'player', false, null), hull = g._sprUnitModel(k, 'player', false, 'hull'), tur = g._sprUnitModel(k, 'player', false, 'turret');
  /* the Monitor's turret IS half its model, by design; the destroyer's was once all of it */
  if (!(tur.length > 0 && tur.length < whole.length * 0.6 && hull.length < whole.length)) notPart.push(k + ':' + hull.length + '+' + tur.length + '/' + whole.length);
  var te = extent(tur);
  if (!(te.lo[0] < 0 && te.hi[0] > 0 && Math.abs(te.lo[2] + te.hi[2]) < 0.5 * sc)) offOrigin.push(k);
  /* a turntable built off the pivot orbits the deck as it traverses: the Flak Track's ring (the
     cylinder at y 7.2..8.2 in its model, unit-special.js) was built 2.4 units aft and swung round 0 */
  if (k === 'flaktrack') {
    var ring = tur.filter(function (f) { var ys = f.v.map(function (p) { return p[1]; }); return Math.min.apply(null, ys) >= 7.19 * sc && Math.max.apply(null, ys) <= 8.21 * sc; });
    var rc = [0, 0], rn = 0;
    ring.forEach(function (f) { f.v.forEach(function (p) { rc[0] += p[0]; rc[1] += p[2]; rn++; }); });
    if (rn < 20 || Math.abs(rc[0] / rn) > 0.3 * sc || Math.abs(rc[1] / rn) > 0.3 * sc) offRing.push(k + '@' + (rn ? (rc[0] / rn / sc).toFixed(1) : 'no ring'));
  }
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
S.eq('...and the Flak Track\'s turntable centred on the pivot it turns about', offRing.join(' ') || 'all', 'all');

/* ---- in the world ---- */
var sc = g._sprUnitScale('destroyer') * g.RTS_TILE / g.RTS_TS, M = g.RTS_TURRET_AT.destroyer;
function at(def, rot) { return g._r3dTurretAt(def, 100, 200, rot); }
var east = at('destroyer', 0), north = at('destroyer', Math.PI / 2);
S.ok('a destroyer heading +x has a mount ahead of it and one astern', east.length === 2 && Math.abs(east[0].x - (100 + M[0][0] * sc)) < 1e-9 && Math.abs(east[1].x - (100 + M[1][0] * sc)) < 1e-9 && Math.abs(east[0].z - 200) < 1e-9,
     east.map(function (p) { return p.x.toFixed(2) + ',' + p.z.toFixed(2); }).join(' / '));
S.ok('...turned to head +z, the same two mounts turn with it', Math.abs(north[0].z - (200 + M[0][0] * sc)) < 1e-9 && Math.abs(north[1].z - (200 + M[1][0] * sc)) < 1e-9 && Math.abs(north[0].x - 100) < 1e-9,
     north.map(function (p) { return p.x.toFixed(2) + ',' + p.z.toFixed(2); }).join(' / '));
var tk = at('tank', 1.1), noTable = at('no-such-def', 2.3);
S.ok('a tank\'s one turret turns at its centre', tk.length === 1 && tk[0].x === 100 && tk[0].z === 200);
S.ok('...as does anything with no mount table at all - the fallback is the hull, not nothing', !g.RTS_TURRET_AT.tank && noTable.length === 1 && noTable[0].x === 100 && noTable[0].z === 200, JSON.stringify(noTable));

/* ---- the muzzle flash, from the ring that fired (combat3d.js _r3dMuzzleAt) ---- */
function unitAt(def, rot, turret, tgt) { return { type: 'unit', def: def, x: 100, z: 200, rot: rot, turret: turret, target: tgt || null }; }
var reachK = 0.78, ft = unitAt('flaktrack', 0, 0), ftRing = at('flaktrack', 0)[0], ftFlash = g._r3dMuzzleAt(ft);
var ftReach = g.rtsUnitDef('flaktrack').r * (g.RTS_TURRETED.flaktrack ? g.RTS_MUZZLE_TURRET : g.RTS_MUZZLE_HULL) * reachK;
S.ok('a Flak Track\'s flash bursts a barrel\'s reach from its own ring, a little behind its middle',
     ftRing.x < 100 && Math.abs(Math.hypot(ftFlash.x - ftRing.x, ftFlash.z - ftRing.z) - ftReach) < 0.35,
     'ring at ' + ftRing.x.toFixed(2) + ', flash at ' + ftFlash.x.toFixed(2) + ', ' + Math.hypot(ftFlash.x - ftRing.x, ftFlash.z - ftRing.z).toFixed(2) + ' from the ring against a barrel of ' + ftReach.toFixed(2));
var fore = at('destroyer', 0)[0], aft = at('destroyer', 0)[1];
var dAhead = g._r3dMuzzleAt(unitAt('destroyer', 0, 0, { x: 300, z: 200 })), dAstern = g._r3dMuzzleAt(unitAt('destroyer', 0, Math.PI, { x: -100, z: 200 }));
var near = function (p, q) { return Math.hypot(p.x - q.x, p.z - q.z); };
var dReach = g.rtsUnitDef('destroyer').r * (g.RTS_TURRETED.destroyer ? g.RTS_MUZZLE_TURRET : g.RTS_MUZZLE_HULL) * reachK;
S.ok('...a destroyer\'s from the ring nearer its target: the fore gun at a target ahead, the aft at one astern - not the deck between them',
     near(fore, aft) > 1.5 && Math.abs(near(dAhead, fore) - dReach) < 0.35 && Math.abs(near(dAstern, aft) - dReach) < 0.35, 'ahead: ' + near(dAhead, fore).toFixed(2) + ' from fore, astern: ' + near(dAstern, aft).toFixed(2) + ' from aft');
var tk2 = unitAt('tank', 0.7, 0.7), tkFlash = g._r3dMuzzleAt(tk2), fc = g._rtsFireCoord(tk2);
S.ok('...and a tank\'s, one turret at its middle, where it always was', Math.abs(tkFlash.x - (100 + (fc.x - 100) * reachK)) < 1e-9 && Math.abs(tkFlash.z - (200 + (fc.z - 200) * reachK)) < 1e-9, JSON.stringify(tkFlash));

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
