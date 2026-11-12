/* EVERY UNIT STANDS IN ITS OWN SHADE, AND HAS A RIM (render3d/footing3d.js, resolve3d.js), headless:

     WHO HAS ONE   a tank and a rifleman on open ground; not what flies, floats, wades, rides
                   inside something, crosses a bridge, hangs under a canopy, is dead, or is the
                   opponent's and out of sight
     ITS SHAPE     a hull's shade is longer along its heading than across it, and turns with it;
                   a soldier's is round, and grows with him when the camera is far off; every
                   corner lies on the ground
     IN VIEW       only the units inside the view are given one, and the count is theirs
     THE INK       full at the default zoom and nearer, lighter from far off, never gone; its
                   taps a fixed distance apart on the screen whatever the buffer's resolution */

var { Suite } = require('../lib/assert.js');
var { load } = require('../lib/sandbox.js');

var S = new Suite('footing');
var g = load(['src/rules', 'src/core', 'src/render3d/footing3d.js', 'src/render3d/resolve3d.js'],
             { R3D_HEAT_GLSL: '', R3D_AO_FLOOR: [0, 0, 0], R3D_DEPTH_RANGE: 400, _r3dInfScale: function (cell) { return cell < 20 ? 1.5 : 1; } });
g._rtsNewGame(4242, 'easy');
var G = g.window._rtsG, N = g.RTS_N, T = g.RTS_TILE;
G.over = null;
g._rtsR = { cell: 24 };
for (var i = 0; i < N * N; i++) { G.mapped[i] = 1; G.vis[i] = 1; }

/* open grass, seven cells square, and the nearest water */
function patch(kind, r) {
  for (var z = r; z < N - r; z++) for (var x = r; x < N - r; x++) {
    var ok = true;
    for (var dz = -r; dz <= r && ok; dz++) for (var dx = -r; dx <= r && ok; dx++) if (G.terrain[g._rtsIdx(x + dx, z + dz)] !== kind || (kind !== g.RTS_T_WATER && g._rtsBlocked(x + dx, z + dz))) ok = false;
    if (ok) return [g._rtsWX(x), g._rtsWX(z)];
  }
  return null;
}
var land = patch(g.RTS_T_GRASS, 3), sea = patch(g.RTS_T_WATER, 1);
S.ok('the map has open grass and open water to stand things on', !!land && !!sea, JSON.stringify([land, sea]));
G.ents.forEach(function (e) { if (e.type === 'unit') e.dead = true; });      /* the armies the map opened with */

var tank = g._rtsSpawnUnit('player', 'tank', land[0], land[1]);
var man = g._rtsSpawnUnit('player', 'rifle', land[0] + 6, land[1]);
var R3 = {};
function build(view) { return g._r3dFootBuild(G, R3, view); }
function on(e) { return g._r3dFootOn(e, g.rtsUnitDef(e.def)); }

S.eq('a tank and a rifleman on open grass: two shades', build(null), 2);
S.ok('...each one of them', on(tank) && on(man), '');

/* ---- who has none ---- */
var airKey = (g.RTS_UNITS.filter(function (d) { return d.air; })[0] || {}).key;
var seaKey = (g.RTS_UNITS.filter(function (d) { return d.sea; })[0] || {}).key;
S.ok('the tables have a flier and a ship to try', !!g.rtsUnitDef(airKey) && !!g.rtsUnitDef(seaKey) && !g.rtsUnitDef(airKey).sea, airKey + ', ' + seaKey);
/* stood where the tank is, so only what they ARE can refuse them */
var heli = { type: 'unit', side: 'player', def: airKey, x: land[0] - 6, z: land[1], air: true };
var ship = { type: 'unit', side: 'player', def: seaKey, x: land[0] - 6, z: land[1] };
S.ok('control: a tank stood there has one', on({ type: 'unit', side: 'player', def: 'tank', x: land[0] - 6, z: land[1] }), '');
S.ok('what flies has none', !on(heli), airKey);
heli.air = false;
S.ok('...because it is in the air: the same machine set down has one', on(heli), '');
S.ok('what floats has none', !on(ship), seaKey);
var wader = g._rtsSpawnUnit('player', 'rifle', land[0], land[1] + 6);
S.ok('control: a second rifleman on the grass has one', on(wader), '');
wader.x = sea[0]; wader.z = sea[1];
S.ok('...and none once he is in the water', !on(wader), '');
wader.x = land[0]; wader.z = land[1] + 6;
wader.inside = tank.id;
S.ok('...none riding inside something', !on(wader), '');
wader.inside = null; wader.chute = 2;
S.ok('...none under a canopy, coming down', !on(wader), '');
wader.chute = 0; wader.dead = true;
S.ok('...none dead', !on(wader), '');
wader.dead = false;
S.ok('control: and one again, back on his feet', on(wader), '');
/* a bridge's deck: wherever the standing height is above the ground's */
var realStand = g._rtsStandY;
g._rtsStandY = function (x, z) { return g._rtsElev(x, z) + (Math.abs(x - wader.x) < 0.1 && Math.abs(z - wader.z) < 0.1 ? 2 : 0); };
S.ok('...none on a bridge\'s deck', !on(wader) && on(man), '');
g._rtsStandY = realStand;
/* the opponent's, in and out of sight */
var foe = g._rtsSpawnUnit('enemy', 'tank', land[0] + 6, land[1] + 6);
S.ok('the opponent\'s tank in sight has one', on(foe), '');
var k = g._rtsIdx(g._rtsTX(foe.x), g._rtsTX(foe.z));
for (i = 0; i < N * N; i++) G.vis[i] = 0;
S.ok('...and none out of sight, where the player\'s own still do', !on(foe) && on(tank), 'cell ' + k);
for (i = 0; i < N * N; i++) G.vis[i] = 1;
S.eq('the count is the units on the ground the player can see', build(null), 4);

/* ---- the shape ---- */
function quad(e) {
  var a = new Float32Array(6 * g.R3D_FOOT_F), d = g.rtsUnitDef(e.def), r = d.r || 1.2;
  g._r3dFootQuad(a, 0, e, r * g.R3D_FOOT_LONG, r * g.R3D_FOOT_WIDE, 1);
  var o = { x0: 1e9, x1: -1e9, z0: 1e9, z1: -1e9, onGround: true, half: [a[5], a[6]] };
  for (var v = 0; v < 6; v++) { var x = a[v * 11], y = a[v * 11 + 1], z = a[v * 11 + 2];
    o.x0 = Math.min(o.x0, x); o.x1 = Math.max(o.x1, x); o.z0 = Math.min(o.z0, z); o.z1 = Math.max(o.z1, z);
    if (Math.abs(y - g._rtsElev(x, z)) > 0.06) o.onGround = false; }
  o.w = o.x1 - o.x0; o.d = o.z1 - o.z0;
  return o;
}
tank.rot = 0;
var q0 = quad(tank);
tank.rot = Math.PI / 2;
var q90 = quad(tank);
S.ok('a hull\'s shade is longer than it is wide', q0.half[0] > q0.half[1] * 1.15, q0.half.map(function (v) { return v.toFixed(2); }).join(' x '));
S.ok('heading east it lies along x', q0.w > q0.d * 1.15, q0.w.toFixed(2) + ' by ' + q0.d.toFixed(2));
S.ok('...and turned south, along z', q90.d > q90.w * 1.15, q90.w.toFixed(2) + ' by ' + q90.d.toFixed(2));
S.ok('every corner lies on the ground', q0.onGround && q90.onGround, '');
build(null);
var at = -1;
for (i = 0; i < 4; i++) if (Math.abs((R3.footA[i * 66] + R3.footA[i * 66 + 22]) / 2 - man.x) < 1.5 && Math.abs((R3.footA[i * 66 + 2] + R3.footA[i * 66 + 24]) / 2 - man.z) < 1.5) at = i;
S.ok('the rifleman\'s is in the list', at >= 0, String(at));
var near = [R3.footA[at * 66 + 5], R3.footA[at * 66 + 6], R3.footA[at * 66 + 7]];
S.ok('a soldier\'s is round, smaller than a hull\'s, and lighter', near[0] === near[1] && near[0] < q0.half[1] && near[2] < 1, near.map(function (v) { return v.toFixed(2); }).join(' '));
g._rtsR.cell = 12;
build(null);
S.near('...and grows with him when the camera is far off', R3.footA[at * 66 + 5] / near[0], 1.5, 0.01);
R3.infScaleOff = true;
build(null);
S.near('...unless he is not scaled', R3.footA[at * 66 + 5] / near[0], 1, 0.01);
R3.infScaleOff = false; g._rtsR.cell = 24;

/* ---- in view ---- */
var view = { x0: tank.x - 2, x1: tank.x + 2, z0: tank.z - 2, z1: tank.z + 2 };
S.eq('a view round the tank alone: one shade', build(view), 1);
S.eq('a view with nothing in it: none', build({ x0: -50, x1: -40, z0: -50, z1: -40 }), 0);
/* a crowd grows the list without losing what was in it */
for (i = 0; i < 80; i++) g._rtsSpawnUnit('player', 'rifle', land[0] - 8 + (i % 9) * 1.5, land[1] - 8 + (i / 9 | 0) * 1.5);
var many = build(null);
S.ok('eighty more are all given one, the list grown to hold them', many === 84 && R3.footA.length >= 84 * 66, many + ' in ' + R3.footA.length / 66);
var lost = 0;
for (i = 0; i < many; i++) if (!(R3.footA[i * 66 + 5] > 0)) lost++;
S.eq('...and none written before it grew is lost', lost, 0);

/* ---- the ink ---- */
var K = {};
S.near('the ink is whole at the default zoom', g._r3dInkAmt(K, 24), g.R3D_INK, 1e-9);
S.near('...and nearer', g._r3dInkAmt(K, 48), g.R3D_INK, 1e-9);
S.near('...lighter from far off', g._r3dInkAmt(K, 10), g.R3D_INK * g.R3D_INK_FAR, 1e-9);
S.ok('...by degrees between', g._r3dInkAmt(K, 17) > g._r3dInkAmt(K, 10) && g._r3dInkAmt(K, 17) < g._r3dInkAmt(K, 24), g._r3dInkAmt(K, 17).toFixed(3));
S.ok('...never gone, however far', g._r3dInkAmt(K, 4) > 0 && g._r3dInkAmt(K, 4) === g._r3dInkAmt(K, 10), g._r3dInkAmt(K, 4).toFixed(3));
S.eq('R3.inkAmt 0 takes it out', g._r3dInkAmt({ inkAmt: 0 }, 24), 0);
S.near('...and sets it', g._r3dInkAmt({ inkAmt: 0.5 }, 24), 0.5, 1e-9);
S.eq('its taps are neighbours on a buffer of one pixel a pixel', g._r3dInkTap({ scale: 1 }), 1);
S.near('...and the same distance apart on the screen on a finer one', g._r3dInkTap({ scale: 3 }) / 3, g.R3D_INK_PX, 1e-9);

require('../lib/report.js')(S);
