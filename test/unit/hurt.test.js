/* DAMAGE YOU CAN SEE - render3d/hurt3d.js, asked without a GPU; e2e/hurt checks the picture.

     SCORCH  untouched above R3D_SCORCH_FROM, mounting to 1 at death, nothing on a building still
             going up; carried to the shader as 3 + how far gone, and not at all with
             R3.scorchOff; a hurt tank's hull and turret both carry it
     SMOKE   nothing above RTS_COND_YELLOW; below it smoke, thicker the worse; below
             RTS_COND_RED fire as well; never on infantry, on what has its own fire, out of
             sight, or with R3.hurtOff
     ROOF    a building smokes from spots on its own roof, the same every frame, two on a big one */

var { Suite } = require('../lib/assert.js');
var { load } = require('../lib/sandbox.js');

var S = new Suite('hurt');
/* the whole renderer, in page order: a unit's draw reaches into most of it */
var g = load(['src/rules', 'src/core', 'src/r3d', 'src/sprites', 'src/render3d']);
g._rtsNewGame(4242, 'easy');
var G = g.window._rtsG;
for (var vi = 0; vi < G.vis.length; vi++) { G.vis[vi] = 1; G.mapped[vi] = 1; }

/* ---- SCORCH ---- */
function at(f, extra) { return g._r3dHurtAmt(Object.assign({ hp: 100 * f, maxHp: 100 }, extra || {})); }
S.ok('untouched above R3D_SCORCH_FROM', at(1) === 0 && at(g.R3D_SCORCH_FROM + 0.01) === 0);
S.ok('...scorched below it, more the worse it gets, all the way at death', at(0.6) > 0 && at(0.3) > at(0.6) && at(0) === 1,
     [0.6, 0.3, 0].map(function (f) { return at(f).toFixed(2); }).join(' / '));
S.eq('a building still going up is not damaged, it is rising', at(0.2, { building: true }), 0);
var hurt = { hp: 30, maxHp: 100 };
S.ok('the shader is handed 3 + how far gone', Math.abs(g._r3dHurtDim(hurt, {}) - 3 - g._r3dHurtAmt(hurt)) < 1e-12 && g._r3dHurtDim({ hp: 100, maxHp: 100 }, {}) === 0);
S.eq('...and nothing with R3.scorchOff', g._r3dHurtDim(hurt, { scorchOff: true }), 0);
S.ok('the mesh program knows when the windows go', g.R3D_WEATHER_GLSL.indexOf('step(' + g.R3D_GLASS_OUT.toFixed(2) + ', s)') > 0 && g.R3D_WEATHER_GLSL.indexOf('vec3 _tint(') >= 0);

/* ---- SMOKE and FIRE, through stand-ins for the effect builders ---- */
var cols = [], fires = [];
g._r3dFxColumn = function (V, x, y, z, H, seed, T, op, tint) { cols.push({ x: x, y: y, z: z, H: H, op: op, tint: tint }); };
g._r3dFxFire = function (V, x, y, z) { fires.push({ x: x, y: y, z: z }); };
g._r3dMesh = function () { return { top: 40 }; };
g.window._R3D = { motion: {} };
var V = { t: 3, M: {}, ground: function () { return 1; } };
function run(list) {
  cols = []; fires = [];
  var keep = G.ents;
  G.ents = list;
  g._r3dFxHurt(G, V);
  G.ents = keep;
  return { cols: cols.slice(), fires: fires.slice() };
}
function tank(f, extra) { var u = g._rtsSpawnUnit('player', 'tank', 40, 40); u.hp = u.maxHp * f; return Object.assign(u, extra || {}); }
S.ok('nothing smokes above RTS_COND_YELLOW', run([tank(g.RTS_COND_YELLOW + 0.01)]).cols.length === 0);
var t40 = run([tank(0.4)]), t30 = run([tank(0.3)]), t15 = run([tank(0.15)]);
S.ok('below it, a vehicle smokes - and nothing burns yet', t40.cols.length === 1 && t40.fires.length === 0);
S.ok('...thicker the worse it is', t30.cols[0].op > t40.cols[0].op && t30.cols[0].H > t40.cols[0].H, t40.cols[0].op.toFixed(2) + ' then ' + t30.cols[0].op.toFixed(2));
S.ok('below RTS_COND_RED it is on fire, under black smoke', t15.fires.length === 1 && t15.cols[0].tint === g.R3D_FX_SOOT && t40.cols[0].tint === g.R3D_FX_SMOKE);
var sq = g._rtsSpawnUnit('player', 'rifle', 44, 44); sq.hp = sq.maxHp * 0.1;
S.ok('...never infantry', run([sq]).cols.length === 0);
S.ok('...nor what has a fire of its own', run([tank(0.1, { burning: 1 })]).cols.length === 0);
g.window._R3D.hurtOff = true; var off = run([tank(0.1)]); g.window._R3D.hurtOff = false;
S.ok('...nor with R3.hurtOff', off.cols.length === 0 && off.fires.length === 0);
var hid = tank(0.1); G.vis[g._rtsIdx(g._rtsTX(hid.x), g._rtsTX(hid.z))] = 0;
S.ok('...nor out of sight', run([hid]).cols.length === 0);
G.vis[g._rtsIdx(g._rtsTX(hid.x), g._rtsTX(hid.z))] = 1;
var up = tank(0.3); g.window._R3D.motion[up.id] = { y: 7 };
S.ok('a vehicle smokes from where it was drawn', run([up]).cols[0].y > 7, 'from ' + run([up]).cols[0].y.toFixed(2));
var apc = g._rtsSpawnUnit('player', 'apc', 46, 46), rider = tank(0.2, {}); rider.inside = apc;
S.ok('nothing aboard a transport smokes', run([rider]).cols.length === 0);
var crn = g._rtsSpawnUnit('player', 'skycrane', 50, 50), slung = tank(0.2, {}); slung.inside = crn;
g.window._R3D.motion[slung.id] = { y: 9.5 };
var sl = run([slung]);
S.ok('...but a Sky Crane\'s slung load does, from where it hangs', sl.cols.length === 1 && sl.cols[0].y > 9.5 && sl.fires.length === 1, sl.cols.length ? 'from ' + sl.cols[0].y.toFixed(2) : 'nothing');

/* ---- ROOF ---- */
var yd = g._rtsHas('player', 'yard'), dY = g.rtsStructDef(yd.def), keepHp = yd.hp;
yd.hp = yd.maxHp * 0.15;
var b1 = run([yd]), b2 = run([yd]);
var inside = b1.cols.every(function (c) { return Math.abs(c.x - yd.x) < dY.w * g.RTS_TILE / 2 && Math.abs(c.z - yd.z) < dY.h * g.RTS_TILE / 2; });
S.ok('a building smokes and burns from its roof, inside its own footprint', b1.cols.length >= 1 && b1.fires.length === b1.cols.length && inside && Math.abs(b1.cols[0].y - (1 + 40 * g.RTS_TILE / g.RTS_TS * 0.85)) < 1e-9,
     b1.cols.length + ' spots, from ' + b1.cols[0].y.toFixed(1));
S.ok('...from the same spots every frame', JSON.stringify(b1) === JSON.stringify(b2));
S.ok('...two of them on a big one, one on a small', g._r3dHurtSpots({ id: 1, x: 0, z: 0 }, { w: 3, h: 3 }).length === 2 && g._r3dHurtSpots({ id: 1, x: 0, z: 0 }, { w: 1, h: 1 }).length === 1);
yd.hp = keepHp;

/* ---- THE DRAW: a hurt tank's hull and turret both carry the scorch ---- */
var calls = [], R5 = { motion: {} };
g._rtsR = g.window._rtsR = { spr: { turret: { player: { tank: 1 } } } };
g._r3dMesh = function (kind, def, side, part) { return { part: part || null }; };
var ht = tank(0.3), want = 3 + g._r3dHurtAmt(ht);
g._r3dPaintUnit(null, ht, G, R5, function (C, m, x, y, z, rot, sc, dim) { calls.push({ part: m.part, dim: dim }); }, 1);
S.ok('a hurt tank is drawn scorched, hull and turret alike', calls.length === 2 && calls.every(function (c) { return Math.abs(c.dim - want) < 1e-12; }), JSON.stringify(calls));

require('../lib/report.js')(S);
