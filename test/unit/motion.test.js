/* WHAT MOVES ON A UNIT - render3d/unit3d.js, crawl3d.js, the roll in sprites/unitmodels.js, the
   rotor part in sprites/unit-airsea.js and the swell in wave3d.js, asked of the model builders
   and the arithmetic without a GPU. e2e/motion checks the picture.

     ROLL     the sprite is the model it always was; a roll changes every vehicle's running gear,
              and a full turn of it comes back to where it started; the links run back as far as
              the hull rolls; the odometer turns only for ground covered
     ROTOR    the heli's blades are a part of their own, and body and blades are the whole
              machine; they spin flat out in the air and idle on the pad
     SWELL    the sea's height and slope from JS agree with the table the shaders are built from;
              a ship rides it, pitching and rolling, never past R3D_SHIP_TILT
     CRAWL    every infantry type that can go prone lies down in 3D - low, long, the marker still
              on top - and crawls with one knee then the other */

var { Suite } = require('../lib/assert.js');
var { load } = require('../lib/sandbox.js');

var S = new Suite('motion');
/* the whole renderer, in page order: a unit's draw reaches into most of it */
var g = load(['src/rules', 'src/core', 'src/r3d', 'src/sprites', 'src/render3d']);

function sig(faces) {
  return faces.map(function (f) { return f.v.map(function (p) { return p.map(function (v) { return (Math.round(v * 1000) / 1000).toFixed(3); }).join(','); }).join(';') + '|' + f.c; }).sort();
}
/* the same faces, in any order, to within a rounding error - a tooth turned round by two teeth
   lands where another was, not on the same bits */
function same(a, b) {
  if (a.length !== b.length) return false;
  var used = [];
  function near(f, h) { return f.c + '' === h.c + '' && f.v.length === h.v.length && f.v.every(function (p, i) { return Math.abs(p[0] - h.v[i][0]) + Math.abs(p[1] - h.v[i][1]) + Math.abs(p[2] - h.v[i][2]) < 1e-6; }); }
  return a.every(function (f) {
    for (var i = 0; i < b.length; i++) if (!used[i] && near(f, b[i])) { used[i] = 1; return true; }
    return false;
  });
}
function box(faces) {
  var b = { x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9 };
  faces.forEach(function (f) { f.v.forEach(function (p) { b.x0 = Math.min(b.x0, p[0]); b.x1 = Math.max(b.x1, p[0]); b.y0 = Math.min(b.y0, p[1]); b.y1 = Math.max(b.y1, p[1]); }); });
  return b;
}
function at(roll, fn) { g._SPR_ROLL = roll; try { return fn(); } finally { g._SPR_ROLL = null; } }

/* ---- ROLL ---- */
S.eq('the sprites are built at no roll', g._SPR_ROLL, null);
var exact = true;
for (var k = 0; k < 14; k++) if (g._sprLinkX(k, 14, 23, 0) !== -23 / 2 + (k + 0.5) * (23 / 14)) exact = false;
S.ok('...where every link sits exactly where it always did', exact);
var VEH = g.RTS_UNITS.filter(function (u) { return u.kind === 'vehicle' && !u.sea && !u.air; }).map(function (u) { return u.key; });
S.ok('there are vehicles on the ground to roll', VEH.length >= 6, VEH.join(', '));
var moved = [], closed = [], still = [], links = [], teeth = [], tracked = [];
/* the faces of b that are not in a: what a roll moved */
function changed(a, b) {
  var have = {};
  sig(a).forEach(function (k) { have[k] = (have[k] || 0) + 1; });
  return b.filter(function (f) { var k = sig([f])[0]; if (have[k]) { have[k]--; return false; } return true; });
}
VEH.forEach(function (key) {
  g._SPR_ROLL_LEN = 0; g._SPR_ROLL_KIND = null;
  var r0 = at(0, function () { return g._sprUnitModel(key, 'player', false, null); }), len = g._SPR_ROLL_LEN;
  var rq = at(0.25, function () { return g._sprUnitModel(key, 'player', false, null); });
  var r1 = at(1, function () { return g._sprUnitModel(key, 'player', false, null); });
  if (!len) { still.push(key); return; }
  if (!same(rq, r0)) moved.push(key);
  if (same(r1, r0)) closed.push(key);
  /* ON TRACKS, BOTH TURN: the links all down the run, and the sprocket's teeth at the front -
     so a quarter turn moves something in the rear half, and more in the front quarter than
     in the rear one */
  if (g._SPR_ROLL_KIND !== 'track') return;
  tracked.push(key);
  var ch = changed(r0, rq);
  function cx(f) { return f.v.reduce(function (s2, p) { return s2 + p[0]; }, 0) / f.v.length; }
  /* the run of the TRACK: the faces along the bottom that the roll moves - its links. Not the
     model's own box, which the hull's gun would stretch, and not everything on the bottom: a
     half-track (the Flak Track) has steered wheels ahead of its track, and the front of its
     running gear is not where its sprocket is */
  var yb = box(r0).y0, run = ch.filter(function (f) { return Math.min.apply(null, f.v.map(function (p) { return p[1]; })) < yb + 0.5; }).map(cx);
  var x0 = Math.min.apply(null, run), x1 = Math.max.apply(null, run), q = (x1 - x0) / 4, xs = ch.map(cx);
  var rearHalf = xs.filter(function (x) { return x < (x0 + x1) / 2; }).length;
  var front = xs.filter(function (x) { return x > x1 - q; }).length, back = xs.filter(function (x) { return x < x0 + q; }).length;
  if (rearHalf > 0) links.push(key);
  if (front > back * 1.2) teeth.push(key);
});
S.ok('on tracks, a quarter turn runs the links back', tracked.length >= 6 && links.length === tracked.length, links.length + ' of ' + tracked.length + ' tracked');
S.ok('...and turns the drive sprocket', teeth.length === tracked.length, teeth.length + ' of ' + tracked.length);
S.ok('every vehicle on tracks or wheels has running gear to roll', still.length === 0, still.join(', ') || 'all');
S.ok('...a quarter turn of it changes the model', moved.length === VEH.length, moved.length + ' of ' + VEH.length + ': ' + moved.join(', '));
S.ok('...and a full turn brings every link, tooth and nut back onto the pattern', closed.length === VEH.length, closed.length + ' of ' + VEH.length);
g._SPR_ROLL_LEN = 0; g._sprUnitModel('rifle', 'player', false, null);
S.eq('a soldier has nothing to roll', g._SPR_ROLL_LEN, 0);
var pitch = 23 / 14, dx = g._sprLinkX(3, 14, 23, 0.1) - g._sprLinkX(3, 14, 23, 0);
S.ok('the links run back against the hull as far as it rolls', Math.abs(dx + 0.1 * 2 * pitch) < 1e-9, dx.toFixed(4) + ' for a tenth of a turn of ' + (2 * pitch).toFixed(3));
var inside = true;
for (var r = 0; r < 1; r += 0.07) for (k = 0; k < 14; k++) { var lx = g._sprLinkX(k, 14, 23, r); if (lx < -11.5 || lx > 11.5) inside = false; }
S.ok('...and one that runs off the back comes round at the front', inside);

var R3 = { rollLen: { tank: 1.2 } }, tank = { id: 7, def: 'tank', x: 0, z: 0, rot: 0 }, phases = [];
g._r3dUnitMotion(R3, tank, 0);
for (var f = 1; f <= 8; f++) {
  tank.x += 0.15;
  var mo = g._r3dUnitMotion(R3, tank, f * 0.05);
  g._r3dUnitMotion(R3, tank, f * 0.05);                 /* the sun's pass, the same frame */
  phases.push(g._r3dRollPhase(R3, 'tank', mo.d));
}
S.eq('rolling forward steps through the running gear, once a frame', phases.join(''), '01122330');
var parked = g._r3dRollPhase(R3, 'tank', g._r3dUnitMotion(R3, tank, 1).d), p2 = g._r3dRollPhase(R3, 'tank', g._r3dUnitMotion(R3, tank, 3).d);
S.ok('...and a parked tank\'s tracks stand still', parked === p2, parked + ' then ' + p2);
var before = g._r3dUnitMotion(R3, tank, 3.02).d;
tank.x += 30;
S.ok('...as they do across a jump (unloaded, placed)', g._r3dUnitMotion(R3, tank, 3.05).d === before);
var fast = [], f0 = g._r3dRollPhase(R3, 'tank', g._r3dUnitMotion(R3, tank, 3.1).d);
for (f = 1; f <= 12; f++) {
  tank.x += 0.5;                                        /* a third more than a quarter turn a frame, as a tank goes */
  var fp = g._r3dRollPhase(R3, 'tank', g._r3dUnitMotion(R3, tank, 3.1 + f * 0.016).d);
  fast.push((fp - f0 + 4) % 4); f0 = fp;
}
S.ok('...and however fast it goes, the running gear never steps more than one point a frame', fast.every(function (v) { return v <= 1; }) && fast.filter(function (v) { return v === 1; }).length >= 10,
     'steps ' + fast.join(''));
R3.rollOff = true;
S.eq('R3.rollOff holds every vehicle at the first point', g._r3dRollPhase(R3, 'tank', 0.5), 0);

/* ---- ROTOR ---- */
var keys = Object.keys(g.RTS_AIR_PARTS).filter(function (k) { return g.RTS_AIR_PARTS[k].rotor; });
S.ok('there are rotors to turn', keys.length >= 1, keys.join(', '));
keys.forEach(function (key) {
  var whole = g._sprUnitModel(key, 'player', false, null), body = g._sprUnitModel(key, 'player', false, 'body'), blades = g._sprUnitModel(key, 'player', false, 'rotor');
  /* one copy of the blades over each hub the 3D mode turns one at (RTS_AIR_PARTS.rotors - the
     Chinook has two), so a rotor drawn in 3D is exactly where the sprite has it */
  var hubs = g.RTS_AIR_PARTS[key].rotors || [0], copies = [], usc = g._sprUnitScale(key);
  hubs.forEach(function (hx) { blades.forEach(function (f) { copies.push({ v: f.v.map(function (p) { return [p[0] + hx * usc, p[1], p[2]]; }), c: f.c }); }); });
  S.ok(key + ': the blades are a part of their own, and body and blades over each hub are the whole machine',
       blades.length > 0 && copies.length < whole.length / 3 && JSON.stringify(sig(body.concat(copies))) === JSON.stringify(sig(whole)),
       blades.length + ' blade faces x ' + hubs.length + ' hub' + (hubs.length > 1 ? 's, ' : ', ') + body.length + ' body, ' + whole.length + ' whole');
  /* ...and the 3D mode turns them over those same hubs, wherever the machine is heading */
  var rot = 0.7, W2 = g.RTS_TILE / g.RTS_TS, hb = g._r3dRotorHubs({ def: key, x: 10, z: 20, rot: rot }, 0.3);
  var hubOk = hb.length === hubs.length && hb.every(function (q, i) {
    return Math.abs(q.x - (10 + Math.cos(rot) * hubs[i] * usc * W2)) < 1e-9 && Math.abs(q.z - (20 + Math.sin(rot) * hubs[i] * usc * W2)) < 1e-9;
  }) && (hb.length < 2 || Math.abs((hb[0].a + rot) + (hb[1].a + rot)) < 1e-9);
  S.ok(key + ': ...and the 3D mode turns a rotor over each of those hubs' + (hubs.length > 1 ? ', the two turning opposite ways' : ''), hubOk,
       hb.map(function (q) { return q.x.toFixed(2) + ',' + q.z.toFixed(2); }).join('  '));
  var bb = box(blades), wb = box(body);
  S.ok(key + ': ...on top of it, and wider than it is long', bb.y0 > wb.y1 - 1 && bb.x1 - bb.x0 > (wb.x1 - wb.x0) * 0.9, 'blades from ' + bb.y0.toFixed(1) + ', body to ' + wb.y1.toFixed(1));
});
var heli = { id: 9, x: 5, z: 5, rot: 0, air: true }, R4 = {};
var s0 = g._r3dUnitMotion(R4, heli, 10).spin, s1 = g._r3dUnitMotion(R4, heli, 10.1).spin;
heli.rearming = 3;
var s2 = g._r3dUnitMotion(R4, heli, 10.2).spin;
S.ok('the rotor spins flat out in the air and idles on the pad', Math.abs(s1 - s0 - 0.1 * g.R3D_ROTOR_SPIN) < 1e-9 && Math.abs(s2 - s1 - 0.1 * g.R3D_ROTOR_IDLE) < 1e-9 && g.R3D_ROTOR_IDLE < g.R3D_ROTOR_SPIN,
     ((s1 - s0) / 0.1).toFixed(1) + ' then ' + ((s2 - s1) / 0.1).toFixed(1) + ' rad/s');

/* ---- SWELL ---- */
var worst = 0, slope = 0;
for (var i = 0; i < 40; i++) {
  var x = i * 3.7 - 50, z = i * 1.3 - 20, t = i * 0.77, sw = g._r3dSwellAt(x, z, t), h = 0;
  g.R3D_WAVE.forEach(function (w) { h += w[3] * Math.sin(x * w[0] + z * w[1] + t * w[2]); });
  worst = Math.max(worst, Math.abs(sw.h - h * g.R3D_WAVE_AMP));
  var e2 = 1e-4, nx = (g._r3dSwellAt(x + e2, z, t).h - g._r3dSwellAt(x - e2, z, t).h) / (2 * e2), nz = (g._r3dSwellAt(x, z + e2, t).h - g._r3dSwellAt(x, z - e2, t).h) / (2 * e2);
  slope = Math.max(slope, Math.abs(nx - sw.dx), Math.abs(nz - sw.dz));
}
S.ok('the swell asked from JS is the table the shaders are built from', worst < 1e-9 && slope < 1e-5, 'height off by ' + worst.toExponential(1) + ', slope by ' + slope.toExponential(1));
var ship = { x: 12, z: -8, rot: 0 }, tilt = 0, nxs = [], nzs = [], follow = 0;
for (t = 0; t < 30; t += 0.25) {
  var ss = g._r3dShipSwell(ship, t);
  tilt = Math.max(tilt, Math.acos(ss.n[1]));
  nxs.push(ss.n[0]); nzs.push(ss.n[2]);
  follow = Math.max(follow, Math.abs(ss.y - g._r3dSwellAt(ship.x, ship.z, t).h));
}
function range(a) { return Math.max.apply(null, a) - Math.min.apply(null, a); }
S.ok('a ship rides up and down with the sea it sits in', follow < 1e-9);
S.ok('...pitching along its length and rolling across it', range(nxs) > 0.03 && range(nzs) > 0.03, 'pitch swing ' + range(nxs).toFixed(3) + ', roll ' + range(nzs).toFixed(3));
S.ok('...never further than R3D_SHIP_TILT', tilt <= g.R3D_SHIP_TILT + 1e-9, (tilt * 57.3).toFixed(1) + ' degrees at most');

/* ---- CRAWL ---- */
var CRAWL = g.RTS_UNITS.filter(function (u) { return u.kind === 'infantry' && u.crawl !== false && u.key !== 'dog'; }).map(function (u) { return u.key; });
S.ok('there are infantry that crawl', CRAWL.length >= 4, CRAWL.join(', '));
function crown(faces) {
  var best = null, top = -1e9;
  faces.forEach(function (f) { var y = Math.min.apply(null, f.v.map(function (p) { return p[1]; })); if (y > top) { top = y; best = f; } });
  return '#' + best.c.map(function (v) { return ('0' + v.toString(16)).slice(-2); }).join('');
}
CRAWL.forEach(function (key) {
  var lying = g._r3dSoldierModel(key, 'player', true, 0), stand = g._r3dSoldierModel(key, 'player', false, 0);
  var a = box(lying), b = box(stand), kit = g.RTS_INF_KIT[key] || g.RTS_INF_KIT.rifle;
  S.ok(key + ': lies low and long', a.y1 - a.y0 < (b.y1 - b.y0) * 0.5 && a.x1 - a.x0 > (a.y1 - a.y0) * 2,
       (a.y1 - a.y0).toFixed(2) + ' high against ' + (b.y1 - b.y0).toFixed(2) + ' standing, ' + (a.x1 - a.x0).toFixed(2) + ' long');
  S.eq(key + ': ...with the marker still on top', crown(lying), (kit.top || g.RTS_PAL.team.player[3]).toLowerCase());
});
function rear(pose, side) {
  var mn = 1e9;
  g._r3dSoldierModel('tanya', 'player', true, pose).forEach(function (f) { f.v.forEach(function (p) { if (p[2] * side > 0.3) mn = Math.min(mn, p[0]); }); });
  return mn;
}
var d2 = rear(2, -1) - rear(2, 1), d4 = rear(4, -1) - rear(4, 1);
S.ok('crawling draws up one knee and then the other', d2 * d4 < 0 && Math.abs(d2) > 0.8 && Math.abs(d4) > 0.8,
     'left foot ahead of the right by ' + d2.toFixed(2) + ', then ' + d4.toFixed(2));
var crawler = { path: [{ x: 1, z: 1 }], prone: 1, gait: 0 }, walker = { path: [{ x: 1, z: 1 }], gait: 0 }, seen = {}, cs = 0, ws = 0, pc = -1, pw = -1;
for (t = 0; t < 4; t += 0.02) {
  var c = g._r3dCrawlPose(crawler, t), w = g._r3dSoldierPose(walker, t);
  seen[c] = 1; if (c !== pc) cs++; if (w !== pw) ws++; pc = c; pw = w;
}
S.ok('on the move a prone soldier goes through all four crawl poses, slower than a walk', Object.keys(seen).sort().join('') === '1234' && cs < ws * 0.7, 'poses ' + Object.keys(seen).join('') + ', ' + cs + ' steps to the walk\'s ' + ws);
S.eq('lying still is pose 0', g._r3dCrawlPose({ path: null, prone: 1 }, 1.3), 0);
S.eq('...and standing is not crawling', g._r3dCrawlPose({ path: [{ x: 0, z: 0 }], prone: 0 }, 1.3), 0);

/* ---- THE DRAW: what _r3dPaintUnit hands the renderer, with a stand-in for the mesh cache ---- */
g._rtsNewGame(4242, 'easy');
var G = g.window._rtsG, calls = [], R5 = { motion: {}, rollLen: { tank: 1.2 } };
g._rtsR = g.window._rtsR = { spr: { turret: { player: { tank: 1 } } } };
g._r3dMesh = function (kind, def, side, part, prone, pose, roll) { return { def: def, part: part || null, prone: !!prone, pose: pose || 0, roll: roll || 0 }; };
function paint(e) { calls = []; g._r3dPaintUnit(null, e, G, R5, function (C, m, x, y, z, rot, sc, dim, sy, n) { calls.push({ m: m, y: y, rot: rot, n: n }); }, 1); return calls; }
var sea2 = null;
for (var ci = 0; ci < G.terrain.length && !sea2; ci++) if (G.terrain[ci] === g.RTS_T_WATER) sea2 = ci;
var shp = g._rtsSpawnUnit('player', 'destroyer', g._rtsWX(sea2 % g.RTS_N), g._rtsWX(Math.floor(sea2 / g.RTS_N)));
shp.rot = 0.7; G.t = 31.3;
var dc = paint(shp)[0], want = g._r3dShipSwell(shp, G.t);
S.ok('the ship is drawn on the swell: lifted with it and leaned to it',
     Math.abs(dc.y - (g._rtsElev(shp.x, shp.z) + want.y)) < 1e-9 && dc.n && Math.abs(dc.n[0] - want.n[0]) + Math.abs(dc.n[2] - want.n[2]) < 1e-9 && Math.abs(want.n[0]) + Math.abs(want.n[2]) > 0.01,
     'y ' + dc.y.toFixed(3) + ', normal ' + (dc.n && dc.n.map(function (v) { return v.toFixed(3); }).join(',')));
R5.swellOff = true; var dOff = paint(shp)[0]; R5.swellOff = false;
S.ok('...and with R3.swellOff it sits level at the waterline', !dOff.n && Math.abs(dOff.y - g._rtsElev(shp.x, shp.z)) < 1e-9);
var tk = g._rtsSpawnUnit('player', 'tank', 40, 40); tk.rot = 0;
paint(tk); R5.motion[tk.id].d = 1.2 * 0.6;
var tc = paint(tk);
S.ok('a tank\'s hull is drawn at the point round its running gear its odometer says, the turret apart', tc[0].m.part === 'hull' && tc[0].m.roll === 2 && tc[1].m.part === 'turret' && !tc[1].m.roll,
     JSON.stringify(tc.map(function (c) { return c.m; })));
var hl = g._rtsSpawnUnit('player', 'heli', 44, 44); hl.rot = 0.3;
var hc = paint(hl), spin = R5.motion[hl.id].spin;
S.ok('a helicopter is its body, and its blades turned by the rotor\'s spin', hc.length === 2 && hc[0].m.part === 'body' && hc[1].m.part === 'rotor' && Math.abs(hc[1].rot - (-0.3 - spin)) < 1e-9,
     hc.map(function (c) { return c.m.part + '@' + c.rot.toFixed(2); }).join(', '));
R5.rotorOff = true; var hOff = paint(hl); R5.rotorOff = false;
S.ok('...and with R3.rotorOff the one machine it always was', hOff.length === 1 && hOff[0].m.part === null);
var cr = g._rtsSpawnUnit('player', 'rifle', 48, 48); cr.prone = 1; cr.path = [{ x: 0, z: 0 }];
var cc = paint(cr)[0];
S.ok('a prone squad on the move is drawn crawling', cc.m.prone && cc.m.pose === g._r3dCrawlPose(cr, G.t) && cc.m.pose > 0, JSON.stringify(cc.m));

require('../lib/report.js')(S);
