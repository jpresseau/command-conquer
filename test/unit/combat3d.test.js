/* A GUN GOING OFF - render3d/combat3d.js, and the wreckage a vehicle leaves (core/capture.js).

     RECOIL     at the shot a tank's turret is drawn back along its barrel by R3D_RECOIL_TURRET,
                the hull by less, and the hull rocks back - easing home as e.recoil runs out;
                a soldier, an aircraft and a ship do not kick
     MUZZLE     a firing gun flashes at its barrel's tip, ahead of it the way the gun points; a
                cannon's flash is bigger than a rifle's; a gun not firing does not flash; and the
                flash is a light, as an explosion is
     WRECKAGE   a vehicle that dies throws wreckage, more for a heavier one - the same pieces for
                the same vehicle every time - and a ship none */

var { Suite } = require('../lib/assert.js');
var { load } = require('../lib/sandbox.js');

var S = new Suite('combat3d');
var g = load(['src/rules', 'src/core', 'src/sprites/bake.js', 'src/sprites/props.js', 'src/render3d/combat3d.js']);
g.window._R3D = {};
g._r3dViewBounds = function () { return { x0: -1e4, x1: 1e4, z0: -1e4, z1: 1e4 }; };
g._r3dBoundsNear = function (b) { return b; };
g._rtsNewGame(4242, 'easy');
var G = g.window._rtsG;
function unit(def, x, z) { return g._rtsSpawnUnit('player', def, x, z); }

/* RECOIL */
var t = unit('tank', 0, 0);
t.turret = 0.9; t.recoil = g.RTS_RECOIL_TIME;
var r = g._r3dRecoil(t, null), back = [-Math.cos(0.9), -Math.sin(0.9)];
S.ok('at the shot the turret is drawn back along the barrel by the full kick', !!r && Math.abs(r.tx - back[0] * g.R3D_RECOIL_TURRET) < 1e-9 && Math.abs(r.tz - back[1] * g.R3D_RECOIL_TURRET) < 1e-9,
     r && [r.tx, r.tz].map(function (v) { return v.toFixed(3); }).join(','));
S.ok('...the hull back by less, the same way', Math.hypot(r.hx, r.hz) < Math.hypot(r.tx, r.tz) && r.hx * back[0] + r.hz * back[1] > 0);
S.ok('...and the hull rocks back: its lean tilts away from the gun, still a unit normal',
     r.n[0] * back[0] + r.n[2] * back[1] > 0.05 && Math.abs(Math.hypot(r.n[0], r.n[1], r.n[2]) - 1) < 1e-9, JSON.stringify(r.n));
var ks = [1, 0.75, 0.5, 0.25, 0.01].map(function (f) { t.recoil = g.RTS_RECOIL_TIME * f; var q = g._r3dRecoil(t, null); return q ? Math.hypot(q.tx, q.tz) : 0; });
S.ok('...easing home as the recoil runs out', ks.every(function (v, i) { return !i || v < ks[i - 1]; }) && ks[4] < 0.01, ks.map(function (v) { return v.toFixed(3); }).join(' '));
t.recoil = 0;
S.ok('with no recoil there is no kick', g._r3dRecoil(t, null) === null);
var nonKick = ['rifle', 'gunboat', 'heli'].filter(function (k) { return g.rtsUnitDef(k); }).map(function (k) {
  var u = unit(k, 30, 30); u.recoil = g.RTS_RECOIL_TIME; return k + ':' + (g._r3dRecoil(u, null) === null);
});
S.ok('a soldier, a ship and an aircraft do not kick', nonKick.length >= 2 && nonKick.every(function (s) { return /:true$/.test(s); }), nonKick.join(' '));
/* on a slope, the lean is the ground's, rocked */
var tilt = [0.2, 0.96, 0], tl = Math.hypot(tilt[0], tilt[1], tilt[2]); tilt = tilt.map(function (v) { return v / tl; });
t.recoil = g.RTS_RECOIL_TIME;
var rs = g._r3dRecoil(t, tilt);
S.ok('on a slope the rock is from the ground\'s own lean', rs.n[1] < 0.999 && Math.abs(rs.n[0] - tilt[0]) < 0.2 && rs.n[0] !== tilt[0], JSON.stringify(rs.n));

/* MUZZLE */
t.fire = 0.09; t.turret = 0.9;
var rifle = G.ents.filter(function (e) { return e.def === 'rifle'; })[0] || unit('rifle', 30, 30);
rifle.fire = 0.09; rifle.turret = 0;
var M = g._r3dMuzzles(G), mt = M.filter(function (m) { return m[5] === t; })[0], mr = M.filter(function (m) { return m[5] === rifle; })[0];
var ah = mt ? [(mt[0] - t.x) / Math.hypot(mt[0] - t.x, mt[2] - t.z), (mt[2] - t.z) / Math.hypot(mt[0] - t.x, mt[2] - t.z)] : [0, 0];
S.ok('a firing tank flashes ahead of itself, the way its gun points', !!mt && Math.abs(ah[0] - Math.cos(0.9)) < 1e-6 && Math.abs(ah[1] - Math.sin(0.9)) < 1e-6,
     mt ? mt.slice(0, 3).map(function (v) { return v.toFixed(2); }).join(',') : 'none');
var reach = mt ? Math.hypot(mt[0] - t.x, mt[2] - t.z) : 0, simReach = Math.hypot(g._rtsFireCoord(t).x - t.x, g._rtsFireCoord(t).z - t.z);
S.ok('...at the barrel\'s tip, a little short of where the simulation lets the shell go', reach > simReach * 0.6 && reach < simReach, reach.toFixed(2) + ' of ' + simReach.toFixed(2));
S.ok('...and a cannon\'s flash is bigger than a rifle\'s', !!mr && mt[3] > mr[3] * 1.5, mt && mr ? mt[3] + ' against ' + mr[3] : 'missing');
t.fire = 0; rifle.fire = 0;
S.eq('a gun not firing does not flash', g._r3dMuzzles(G).filter(function (m) { return m[5] === t; }).length, 0);
t.fire = 0.09;
var L = g._r3dMuzzleLights(G).filter(function (l) { return Math.abs(l[0] - mt[0]) < 1e-9; });
S.ok('the flash is a light, warm, like an explosion\'s', L.length === 1 && L[0][3] > 4 && L[0][4] > 0.5 && L[0][6] === undefined, JSON.stringify(L[0]));
t.fire = 0;

/* WRECKAGE */
function wreck(def, seed) {
  g._rtsNewGame(seed || 4242, 'easy');
  var G2 = g.window._rtsG, u = g._rtsSpawnUnit('enemy', def, 20, 20), n0 = G2.fx.length;
  g._rtsDamage(u, 1e6, null);
  return G2.fx.slice(n0).filter(function (f) { return f.kind === 'debris'; }).map(function (f) { return [f.vx, f.vy, f.vz].map(function (v) { return +v.toFixed(4); }); });
}
var a1 = wreck('tank'), a2 = wreck('tank'), b1 = wreck('buggy');
S.ok('a tank that dies throws wreckage', a1.length >= 3, a1.length + ' pieces');
S.ok('...the same pieces for the same tank every time', JSON.stringify(a1) === JSON.stringify(a2));
S.ok('...and a light vehicle fewer', b1.length >= 3 && b1.length < a1.length, b1.length + ' against ' + a1.length);
S.ok('...flung up and out, not along the ground', a1.every(function (v) { return v[1] > 5 && Math.hypot(v[0], v[2]) > 2; }));
var ship = g.rtsUnitDef('gunboat') ? wreck('gunboat') : null;
S.ok('a ship goes down and throws none', ship === null || ship.length === 0, ship ? ship.length + ' pieces' : 'no ships in this build');

require('../lib/report.js')(S);
