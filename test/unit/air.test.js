/* AIRCRAFT THAT FLY LIKE AIRCRAFT - render3d/air3d.js, asked without a GPU; e2e/air checks the
   picture.

     BANKING     level flying straight; into the turn, whichever way it turns; never past
                 R3D_BANK_MAX; a helicopter less than a jet; level on the pad
     PITCH       a helicopter noses down as far as it is going fast, not at all hovering
     PROPELLER   built round the hub the model's own propeller sits on, stepping through its
                 angles as the spin turns a quarter round; the body leaves the old one off
     CONTRAILS   a point every R3D_TRAIL_EVERY however many passes ask, none older than
                 R3D_TRAIL_LIFE, none on the pad, and drawn off both wingtips
     THE DRAW    what _r3dPaintUnit hands the renderer for each of them */

var { Suite } = require('../lib/assert.js');
var { load } = require('../lib/sandbox.js');

var S = new Suite('air');
/* the whole renderer, in page order: a unit's draw reaches into most of it */
var g = load(['src/rules', 'src/core', 'src/map', 'src/r3d', 'src/sprites', 'src/render3d']);
g._rtsNewGame(4242, 'easy');
var G = g.window._rtsG;
for (var vi = 0; vi < G.vis.length; vi++) { G.vis[vi] = 1; G.mapped[vi] = 1; }

function dot(a, b) { a = a || [0, 1, 0]; return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }   /* null is upright */
function lean(def, w, v, extra) {
  var e = Object.assign({ def: def, rot: 0.6, air: true }, extra || {});
  return g._r3dAirLean(extra && extra.R3 || {}, e, { w: w, v: v }, g.rtsUnitDef(def));
}
var f = [Math.cos(0.6), 0, Math.sin(0.6)], sd = [-Math.sin(0.6), 0, Math.cos(0.6)];

/* ---- BANKING ---- */
S.eq('flying straight, a jet is level', lean('mig', 0, 30), null);
var L = lean('mig', 0.8, 30), R = lean('mig', -0.8, 30);
S.ok('turning, it banks into the turn - toward the side it is turning to', dot(L, sd) > 0.2 && dot(R, sd) < -0.2,
     'leaning ' + dot(L, sd).toFixed(2) + ' toward the inside one way, ' + dot(R, sd).toFixed(2) + ' the other');
S.ok('...and harder the harder it turns', dot(lean('mig', 0.4, 30), sd) < dot(L, sd));
var hard = lean('mig', 20, 30);
S.ok('...never past R3D_BANK_MAX', Math.abs(Math.asin(dot(hard, sd)) - g.R3D_BANK_MAX) < 1e-9, (Math.asin(dot(hard, sd)) * 57.3).toFixed(1) + ' degrees');
var H = lean('heli', 0.8, 0);
S.ok('a helicopter banks less than a jet', dot(H, sd) > 0.05 && dot(H, sd) < dot(L, sd) * 0.7, dot(H, sd).toFixed(2) + ' against ' + dot(L, sd).toFixed(2));
S.eq('on the pad it sits level', lean('mig', 0.8, 30, { rearming: 3 }), null);
S.eq('...as it does with R3.airOff', lean('mig', 0.8, 30, { R3: { airOff: true } }), null);

/* ---- PITCH ---- */
var fast = lean('heli', 0, 22), slow = lean('heli', 0, 8);
S.ok('a helicopter flying noses down', dot(fast, f) > 0.15 && dot(slow, f) > 0 && dot(slow, f) < dot(fast, f),
     'tipped ' + dot(fast, f).toFixed(2) + ' forward at full speed, ' + dot(slow, f).toFixed(2) + ' at a third');
S.eq('...and hovering does not', lean('heli', 0, 0), null);
S.eq('a jet does not pitch to its speed', lean('mig', 0, 30), null);

/* ---- what it banks to: the motion record's turn rate ---- */
var R3 = {}, jet = { id: 3, def: 'mig', x: 0, z: 0, rot: 0, air: true }, mo;
for (var k = 0; k <= 40; k++) { jet.rot = k * 0.05 * 0.9; jet.x += 1; mo = g._r3dUnitMotion(R3, jet, k * 0.05); g._r3dUnitMotion(R3, jet, k * 0.05); }
S.ok('the motion record learns how fast it is turning and going', Math.abs(mo.w - 0.9) < 0.02 && Math.abs(mo.v - 20) < 0.5, 'turning ' + mo.w.toFixed(3) + ' rad/s, going ' + mo.v.toFixed(2));

/* ---- PROPELLER ---- */
var P = g.RTS_AIR_PARTS.yak.prop, sc = g._sprUnitScale('yak');
var p0 = g._r3dPropModel('yak', 'player', 0), p1 = g._r3dPropModel('yak', 'player', 1);
function centre(m) { var c = [0, 0, 0], n = 0; m.forEach(function (fc) { fc.v.forEach(function (p) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; n++; }); }); return c.map(function (v) { return v / n; }); }
var c0 = centre(p0);
S.ok('the propeller turns about the hub the model\'s own sits on', Math.abs(c0[0] - P[0] * sc) < 0.6 * sc && Math.abs(c0[1] - P[1] * sc) < 0.2 * sc && Math.abs(c0[2]) < 0.1,
     c0.map(function (v) { return v.toFixed(2); }).join(', ') + ' against ' + [P[0] * sc, P[1] * sc, 0].map(function (v) { return v.toFixed(2); }).join(', '));
S.ok('...and each of its angles is a different picture', JSON.stringify(p0) !== JSON.stringify(p1));
var seen = {};
for (var a = 0; a < Math.PI / 2; a += 0.01) seen[g._r3dPropPhase(a)] = 1;
S.ok('the spin steps it through every angle in a quarter turn, and round again', Object.keys(seen).length === g.R3D_PROP_N && g._r3dPropPhase(0.1) === g._r3dPropPhase(0.1 + Math.PI / 2),
     Object.keys(seen).join(''));
var whole = g._sprUnitModel('yak', 'player', false, null), body = g._sprUnitModel('yak', 'player', false, 'body');
S.ok('the body leaves the old propeller off - and only that', whole.length - body.length > 0 && whole.length - body.length <= 60, (whole.length - body.length) + ' faces fewer');
S.eq('a jet has no propeller', g._r3dPropModel('mig', 'player', 0), null);

/* ---- CONTRAILS ---- */
var mo2 = { }, mg = { id: 4, def: 'mig', x: 0, z: 0, rot: 0, air: true }, t;
for (t = 0; t < 5; t += 0.01) { mg.x = t * 30; g._r3dAirTrail(mo2, mg, 5, t); g._r3dAirTrail(mo2, mg, 5, t); }
var T = mo2.trail, gaps = T.slice(1).map(function (p, i) { return p[3] - T[i][3]; });
S.ok('a jet lays a contrail point every R3D_TRAIL_EVERY, however many passes ask', gaps.every(function (v) { return v >= g.R3D_TRAIL_EVERY - 1e-9 && v < g.R3D_TRAIL_EVERY + 0.011; }),
     T.length + ' points, ' + Math.min.apply(null, gaps).toFixed(3) + ' to ' + Math.max.apply(null, gaps).toFixed(3) + ' s apart');
S.ok('...none older than R3D_TRAIL_LIFE', T[T.length - 1][3] - T[0][3] <= g.R3D_TRAIL_LIFE && T[T.length - 1][3] - T[0][3] > g.R3D_TRAIL_LIFE - 0.1, (T[T.length - 1][3] - T[0][3]).toFixed(2) + ' s from first to last');
mg.rearming = 2; g._r3dAirTrail(mo2, mg, 5, t + 0.1);
S.eq('...and on the pad it has none', mo2.trail.length, 0);
var mo3 = {}; g._r3dAirTrail(mo3, { id: 5, def: 'yak', x: 0, z: 0, rot: 0 }, 5, 1);
S.ok('a propeller aircraft lays no contrail', !mo3.trail || !mo3.trail.length);

/* the effects pass: both wingtips along the trail, and the afterburner */
var streaks = [], bills = [];
g._r3dFxStreak = function () { streaks.push([].slice.call(arguments)); };
g._r3dFxBill = function () { bills.push([].slice.call(arguments)); };
g.window._R3D = { motion: {} };
var fj = g._rtsSpawnUnit('player', 'mig', 30, 30); fj.air = true; fj.rot = 0;
var fm = g.window._R3D.motion[fj.id] = { y: 6, trail: [] };
for (k = 0; k < 6; k++) fm.trail.push([30 - (5 - k) * 2, 6, 30, 10 + k * 0.07, 0, 1]);
var V = { t: 10.4, M: {} };
g._r3dFxAir(G, V);
var trailN = streaks.filter(function (a) { return a[a.length - 1] === g.R3D_TRAIL_C; });
var zs = trailN.map(function (a) { return a[7] - 30; });
S.ok('the contrail is drawn off both wingtips, all along the trail', trailN.length === 2 * 5 && zs.some(function (z) { return z > 0.5; }) && zs.some(function (z) { return z < -0.5; }),
     trailN.length + ' pieces, out to ' + Math.max.apply(null, zs).toFixed(2) + ' and ' + Math.min.apply(null, zs).toFixed(2));
S.ok('...and the afterburner burns behind the jet', bills.some(function (a) { return a[a.length - 1] === g.R3D_BURN_C && a[2] < 30; }));
streaks = []; bills = []; g.window._R3D.trailOff = true; g._r3dFxAir(G, V); g.window._R3D.trailOff = false;
S.ok('...R3.trailOff takes the contrail out and leaves the afterburner', !streaks.some(function (a) { return a[a.length - 1] === g.R3D_TRAIL_C; }) && bills.length > 0);

/* ---- THE DRAW ---- */
var calls = [], R5 = { motion: {} };
g._rtsR = g.window._rtsR = { spr: { turret: {} } };
g._r3dMesh = function (kind, def, side, part) { return { def: def, part: part || null }; };
function paint(e) { calls = []; g._r3dPaintUnit(null, e, G, R5, function (C, m, x, y, z, rot, scl, dim, sy, n) { calls.push({ m: m, n: n, y: y }); }, 1); return calls; }
var yk = g._rtsSpawnUnit('player', 'yak', 50, 50); yk.air = true; yk.rot = 0;
G.t = 20; paint(yk); yk.rot = 0.05; G.t = 20.05; paint(yk); yk.rot = 0.1; G.t = 20.1;
var yc = paint(yk);
S.ok('a Yak is drawn as its body and its propeller at the spin\'s angle, both leaning into the turn',
     yc.length === 2 && yc[0].m.part === 'body' && yc[1].m.part === 'prop' + g._r3dPropPhase(R5.motion[yk.id].spin) && yc[0].n && yc[1].n === yc[0].n,
     yc.map(function (c) { return c.m.part; }).join(', '));
R5.rotorOff = true; var yo = paint(yk); R5.rotorOff = false;
S.ok('...and with R3.rotorOff as the one model it was', yo.length === 1 && yo[0].m.part === null);
var hl = g._rtsSpawnUnit('player', 'heli', 60, 60); hl.air = true; hl.rot = 0;
paint(hl); hl.x += 1; G.t = 20.15; paint(hl); hl.x += 1; G.t = 20.2;
var hc = paint(hl);
S.ok('a helicopter\'s rotor leans with its body', hc.length === 2 && hc[0].n && hc[1].n === hc[0].n && hc[0].n[0] > 0, hc[0].n && hc[0].n.map(function (v) { return v.toFixed(3); }).join(','));
S.ok('...and the motion record keeps where it was drawn, for the effects', Math.abs(R5.motion[hl.id].y - hc[0].y) < 1e-9);

require('../lib/report.js')(S);
