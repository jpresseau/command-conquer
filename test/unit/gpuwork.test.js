/* LESS FOR THE GPU TO DRAW - render3d/shadowcache3d.js's snapped window and its key, and the
   plain models of mesh3d.js, asked without a GPU; e2e/gpuwork checks the page.

     THE WINDOW   the sun's window, snapped, still covers what the camera sees; its centre sits on
                  its grid and its size on its ladder, so a small pan or a small zoom leaves it
                  where it was - the condition for keeping the world's shadows
     THE KEY      the kept map is redrawn for a new window, a turned sun, or a rebuilt batch, and
                  for nothing else
     THE MODELS   the plain model is about half the triangles and no round thing on it passes
                  R3D_LOD_SEG sides; one serves every pose, stride and roll; a soldier is the
                  sprite's figure; the cap is lifted again after
     THE MIDDLE   nearer, a unit takes the plain geometry still walking and rolling (R3D_LOD_MID);
                  one not built yet waits, the full model standing in; the warm-up builds both
     FAR OUT      the plain models come in below R3D_LOD_CELL device pixels a cell, not above, and
                  the middle ones below R3D_LOD_MID_CELL */

var { Suite } = require('../lib/assert.js');
var { load } = require('../lib/sandbox.js');

var S = new Suite('gpuwork');
var g = load(['src/rules', 'src/core', 'src/r3d', 'src/sprites', 'src/render3d']);
g._rtsNewGame(4242, 'easy');

/* ---- THE WINDOW ---- */
var onGrid = true, sizes = {};
for (var i = 0; i < 400; i++) {
  var w = g._r3dSunSnap((i * 37.3) % 300 - 150, (i * 53.9) % 260 - 130, 20 + (i % 37) * 3.1);
  if (Math.abs(w.c[0] / w.step - Math.round(w.c[0] / w.step)) > 1e-9 || Math.abs(w.c[2] / w.step - Math.round(w.c[2] / w.step)) > 1e-9) onGrid = false;
  sizes[w.span.toFixed(3)] = 1;
}
var cov = true;
for (i = 0; i < 400 && cov; i++) {
  var cx2 = (i * 41.7) % 300 - 150, cz2 = (i * 29.3) % 260 - 130, h2 = 20 + (i % 37) * 3.1, w2 = g._r3dSunSnap(cx2, cz2, h2);
  /* the snapped window reaches past the raw one on every side: its half is the raw half's
     bucket plus a step, and the centre moved at most half a step either way */
  if (!(w2.span - h2 >= w2.step * 0.999 && Math.abs(w2.c[0] - cx2) <= w2.step / 2 + 1e-9 && Math.abs(w2.c[2] - cz2) <= w2.step / 2 + 1e-9)) cov = false;
}
S.ok('the snapped window still covers the view: a step of margin over a centre moved at most half a step', cov);
S.ok('...its centre on its grid', onGrid);
var st0 = g._r3dSunSnap(0, 0, 40).step, a = g._r3dSunSnap(st0 * 3, st0 * 4, 40), b = g._r3dSunSnap(st0 * 3.3, st0 * 3.7, 41);
S.ok('a small pan or a small zoom leaves it where it was', a.c[0] === b.c[0] && a.c[2] === b.c[2] && a.span === b.span, JSON.stringify([a.c, a.span, b.c, b.span]));
var c = g._r3dSunSnap(st0 * 3 + a.step * 0.8, st0 * 4, 40);
S.ok('...and a pan of a step moves it a step', Math.abs(c.c[0] - a.c[0] - a.step) < 1e-9);
S.ok('its sizes are a ladder, not every size the zoom passes through', Object.keys(sizes).length <= 12, Object.keys(sizes).length + ' sizes over 400 views');

/* ---- THE KEY ---- */
var bA = { id: 1 }, bB = { id: 2 }, R3 = {};
var k1 = g._r3dShadowKey(R3, a, [bA, bB]), k2 = g._r3dShadowKey(R3, b, [bA, bB]);
S.ok('the kept map stands for the same window, sun and batches', g._r3dShadowKeySame(k1, k2));
S.ok('...and not for another window', !g._r3dShadowKeySame(k1, g._r3dShadowKey(R3, c, [bA, bB])));
S.ok('...nor for a rebuilt batch', !g._r3dShadowKeySame(k1, g._r3dShadowKey(R3, a, [bA, { id: 2 }])));
var keepB = g.window._R3D;
g.window._R3D = { sunB: g._r3dSunBasis(g._rtsSunAt(15)) };
var k3 = g._r3dShadowKey(g.window._R3D, a, [bA, bB]);
g.window._R3D = keepB;
S.ok('...nor for a sun that has turned', !g._r3dShadowKeySame(k1, k3));

/* ---- THE MODELS ---- */
var built = {};
g._r3dBuildMesh = function (gl, faces) { return { faces: faces, tris: faces.reduce(function (s, f) { return s + f.v.length - 2; }, 0) }; };
var R4 = g.window._R3D = { mesh: {}, gl: {} };
var full = g._r3dMesh('u', 'tank', 'player', 'hull', false, 0, 0), plain = g._r3dMesh('u', 'tank', 'player', 'hull', false, 0, 0, true);
S.ok('the plain model is about half the triangles', plain.tris < full.tris * 0.65 && plain.tris > full.tris * 0.2, plain.tris + ' against ' + full.tris);
var segOk = true;
/* a round thing's sides: the most faces any one cylinder ring lays - read off the cap's own effect */
var capped = g._r3dMesh('u', 'heavy', 'enemy', 'hull', false, 0, 0, true), fullH = g._r3dMesh('u', 'heavy', 'enemy', 'hull', false, 0, 0);
S.ok('...round things capped at R3D_LOD_SEG sides', g._R3_SEG_CAP === 1e9 && (function () {
  g._R3_SEG_CAP = g.R3D_LOD_SEG; var n = g._r3Seg(24); g._R3_SEG_CAP = 1e9; return n === g.R3D_LOD_SEG && g._r3Seg(24) >= 24;
})() && capped.tris < fullH.tris, 'and the cap is lifted again after');
/* the same plain build with no cap on its round things: the cap is what takes these off */
var uncapped = g._sprUnitModel('heavy', 'enemy', false, 'hull').reduce(function (n, f) { return n + f.v.length - 2; }, 0);
S.ok('...which takes triangles off even the plain build', capped.tris < uncapped * 0.95, capped.tris + ' against ' + uncapped + ' uncapped');
S.ok('one plain model serves every roll of the tracks and every pose', g._r3dMesh('u', 'tank', 'player', 'hull', false, 0, 2, true) === plain &&
     g._r3dMesh('u', 'rifle', 'player', null, false, 3, 0, true) === g._r3dMesh('u', 'rifle', 'player', null, false, 0, 0, true));
var sol = g._r3dMesh('u', 'rifle', 'player', null, false, 0, 0, true);
g._R3_SEG_CAP = g.R3D_LOD_SEG; var spr = g._sprUnitModel('rifle', 'player', false, null); g._R3_SEG_CAP = 1e9;
S.ok('...a soldier as the sprite\'s own figure', sol.faces.length === spr.length);
S.ok('...and a propeller at its first turn', g._r3dMesh('u', 'yak', 'player', 'prop3', false, 0, 0, true) === g._r3dMesh('u', 'yak', 'player', 'prop0', false, 0, 0, true));
S.ok('...a building too', !!g._r3dMesh('b', 'power', 'player', null, 0, 0, 0, true));

/* ---- THE MIDDLE ---- */
var mid = g._r3dMesh('u', 'tank', 'player', 'hull', false, 0, 0, g.R3D_LOD_MID);
S.ok('the middle model is the plain geometry: a third of the full one\'s triangles', mid.tris === plain.tris && mid.tris < full.tris * 0.4, mid.tris + ' against ' + full.tris);
S.ok('...but the tracks still roll: each roll is its own model', g._r3dMesh('u', 'tank', 'player', 'hull', false, 0, 2, g.R3D_LOD_MID) !== mid &&
     g._r3dMesh('u', 'tank', 'player', 'hull', false, 0, 2, g.R3D_LOD_MID).tris === mid.tris);
var mw0 = g._r3dMesh('u', 'rifle', 'player', null, false, 0, 0, g.R3D_LOD_MID), mw3 = g._r3dMesh('u', 'rifle', 'player', null, false, 3, 0, g.R3D_LOD_MID);
var fw0 = g._r3dMesh('u', 'rifle', 'player', null, false, 0, 0);
S.ok('...and a soldier still walks: his own model, a stride a pose, fewer triangles than the full one', mw3 !== mw0 && mw0.faces.length !== spr.length && mw0.tris < fw0.tris,
     mw0.tris + ' against ' + fw0.tris + '; the sprite\'s figure is ' + spr.length + ' faces');
R4.meshBudget = 0;
S.ok('a middle model not built yet waits for a frame with room: the full one stands in', g._r3dMesh('u', 'light', 'player', 'hull', false, 0, 0, g.R3D_LOD_MID) === g._r3dMesh('u', 'light', 'player', 'hull', false, 0, 0) &&
     !g.window._R3D.mesh['M:u:light:player:hull:0:0']);
R4.meshBudget = undefined;
/* the warm-up builds both near levels, the one in use first */
g._rtsR = g.window._rtsR = { cell: 16 };
var warmR = { mesh: {}, gl: {}, scale: 1 };
g.window._R3D = warmR;
g._rtsR.spr = { turret: { player: { tank: 1 } } };
g._r3dWarm(warmR, 1e9); g._r3dWarm(warmR, 1e9);
S.ok('the warm-up builds a unit at both near levels', !!warmR.mesh['u:tank:player:hull:0:0'] && !!warmR.mesh['M:u:tank:player:hull:0:0'] && warmR.warmQ.length === 0,
     Object.keys(warmR.mesh).filter(function (k) { return /tank:player:hull/.test(k); }).join(' '));
g.window._R3D = R4;

/* ---- FAR OUT ---- */
g._rtsR = g.window._rtsR = { cell: 24 };
g._rtsZoom = function () { return g._rtsR.cell / g.RTS_TILE; };
var R5 = { scale: 1 };
S.ok('at 24 px a cell a unit keeps its full model', !g._r3dLodFar(R5));
g._rtsR.cell = 12;
S.ok('...below R3D_LOD_CELL it takes the plain one', g._r3dLodFar(R5) && 12 < g.R3D_LOD_CELL);
R5.scale = 2;
S.ok('...counted in device pixels, so a sharp screen keeps the detail', !g._r3dLodFar(R5));
g._rtsR.cell = 16;
S.ok('at 16 px a cell on a sharp screen, the middle models', !g._r3dLodFar(R5) && g._r3dLodMid(R5) && 16 * 2 < g.R3D_LOD_MID_CELL);
g._rtsR.cell = 48;
S.ok('...at 48, the full ones', !g._r3dLodMid(R5) && 48 * 2 >= g.R3D_LOD_MID_CELL);
R5.scale = 1.2;
S.ok('...unless a heavy fight has dropped the scale, which drops the detail with it', g._r3dLodMid(R5));
R5.scale = 1; g._rtsR.cell = 12; R5.lodOff = true;
S.ok('...and R3.lodOff keeps it always', !g._r3dLodFar(R5) && !g._r3dLodMid(R5));

require('../lib/report.js')(S);
