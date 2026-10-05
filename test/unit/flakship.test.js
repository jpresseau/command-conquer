/* THE FLAK CRUISER (rules/units.js `flakship`, core/flakship.js), on the real simulation:

     THE UMBRELLA  a gunship firing on a gunboat is hit, with a Flak Cruiser alongside, and is
                   not without one; and the cruiser's guns find nothing to fire at in a ship or a
                   building - it is anti-aircraft and nothing else
     ESCORT        left idle beside a gunboat, it follows when the gunboat sails fourteen cells,
                   and keeps within a few cells of it; it keeps station on the ship under way
                   over one parked nearer; sent back by the player it goes, and
                   waits there until it is idle before taking up station again; with no ship of
                   its side in reach it stays where it is; and two Flak Cruisers with no other
                   ship do not chase each other
     BOTH ARMIES   either builds one, from its yard, once it has a Radar Post
     THE OPPONENT  buys one only when the player flies: none with an empty sky */

var { Suite } = require('../lib/assert.js');
var { load } = require('../lib/sandbox.js');

var S = new Suite('flakship');
var g = load(['src/rules', 'src/core', 'src/sprites/props.js']);

function fresh(army) {
  g.window._RTS_ARMY = army || 'allied';
  g._rtsNewGame(4242, 'easy');
  var G = g.window._rtsG;
  G.over = null;
  G.ents.forEach(function (e) { if (e.type === 'unit') e.dead = true; });
  g._rtsTick(1 / 30);
  G.teams = {};
  return G;
}
function run(secs, each) { for (var t = 0; t < secs * 30; t++) { if (each) each(); g._rtsTick(1 / 30); } }
function place(side, k) {
  var yd = g._rtsHas(side, 'yard');
  for (var r = 4; r < 30; r++) for (var a = 0; a < 8; a++) {
    var sp = g._rtsNearestOpen(yd.tx + Math.round(Math.cos(a) * r), yd.tz + Math.round(Math.sin(a) * r), 3, null);
    if (sp && g._rtsCanPlace(side, k, sp[0], sp[1], true)) { var b = g._rtsPlaceStruct(side, k, sp[0], sp[1], true); if (b) b.building = 0; return b; }
  }
  return null;
}
var cells = function (a, b) { return Math.hypot(a.x - b.x, a.z - b.z) / g.RTS_TILE; };
/* water open for R cells all round */
function openAt(tx, tz, R) {
  for (var dz = -R; dz <= R; dz++) for (var dx = -R; dx <= R; dx++) if (g._rtsBlocked(tx + dx, tz + dz, 'sea')) return false;
  return true;
}
function W(tx, tz) { return { tx: tx, tz: tz, x: g._rtsWX(tx), z: g._rtsWX(tz) }; }
function seaRun(p) { var r = 0; for (var i = 1; i < p.length; i++) r += Math.hypot(p[i].x - p[i - 1].x, p[i].z - p[i - 1].z); return r / g.RTS_TILE; }
/* The maps' seas are channels at most five cells wide, so the staging is a stretch of one: two
   cells of open water fourteen cells apart, the way between them by sea not much longer. */
function channel() {
  var N = g.RTS_N, open = [];
  for (var tz = 4; tz < N - 4; tz += 2) for (var tx = 4; tx < N - 4; tx += 2) if (openAt(tx, tz, 2)) open.push([tx, tz]);
  for (var i = 0; i < open.length; i++) for (var j = 0; j < open.length; j++) {
    var a = open[i], b = open[j], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
    if (d < 13 || d > 15) continue;
    var A = W(a[0], a[1]), B = W(b[0], b[1]), p = g._rtsPath(A.x, A.z, B.x, B.z, 'sea');
    if (p && p.length && seaRun(p) < d * 1.3) return { A: A, B: B, d: d };
  }
  return null;
}
function sit(list) { list.forEach(function (u) { u.order = 'hold'; u.path = null; u.goal = null; }); }

/* ---------------- the umbrella ---------------- */
var G = fresh(), CH = channel(), C = CH && CH.A;
S.ok('the staging: a stretch of channel fourteen cells long', !!CH, CH ? CH.A.tx + ',' + CH.A.tz + ' to ' + CH.B.tx + ',' + CH.B.tz : 'none');
/* a sea cell near (dx, dz) cells off C */
function at(C, dx, dz) { var c = g._rtsNearestOpen(C.tx + dx, C.tz + dz, 3, 'sea'); return W(c[0], c[1]); }
function raid(withFlak) {
  var G = fresh(), gb = g._rtsSpawnUnit('player', 'gunboat', C.x, C.z);
  var fl = withFlak ? g._rtsSpawnUnit('player', 'flakship', at(C, 2, 0).x, at(C, 2, 0).z) : null;
  var h = g._rtsSpawnUnit('enemy', 'heli', at(C, -4, 0).x, at(C, -4, 0).z), hp = h.hp;
  g._rtsOrderAttack(h, gb);
  run(6, function () { sit([gb].concat(fl ? [fl] : [])); gb.target = null; });
  return { hurt: hp - (h.dead ? 0 : h.hp), dead: h.dead };
}
var cover = raid(true), bare = raid(false);
S.ok('a gunship firing on a gunboat is hit, with a Flak Cruiser alongside', cover.hurt > 50, cover.dead ? 'shot down' : cover.hurt.toFixed(0) + ' hp off it');
S.ok('...and not without one', bare.hurt === 0, bare.hurt.toFixed(0) + ' hp off it');
G = fresh();
var fl0 = g._rtsSpawnUnit('player', 'flakship', C.x, C.z), eb = g._rtsSpawnUnit('enemy', 'gunboat', at(C, 4, 0).x, at(C, 4, 0).z);
var py = g._rtsHas('player', 'yard');
S.ok('its guns find nothing to fire at in a ship or a building: anti-aircraft and nothing else',
     !g._rtsCanEngage(fl0, eb) && !g._rtsCanEngage(fl0, g._rtsHas('enemy', 'yard')) && !g._rtsFindTarget(fl0, 40 * g.RTS_TILE), '');

/* ---------------- escort ---------------- */
G = fresh();
var gb1 = g._rtsSpawnUnit('player', 'gunboat', C.x, C.z), f1 = at(C, 2, 0);
var fl1 = g._rtsSpawnUnit('player', 'flakship', f1.x, f1.z);
var to = CH.B;
g._rtsOrderMove(gb1, to.x, to.z, false);
var far = 0, amoves = 0, plainMoves = 0;
run(25, function () { if (G.t > 6) far = Math.max(far, cells(fl1, gb1)); if (fl1.esc) { if (fl1.order === 'amove') amoves++; else if (fl1.order === 'move') plainMoves++; } });
var gone = cells(gb1, C);
S.ok('left idle beside a gunboat, it follows when the gunboat sails fourteen cells', gone >= 12 && cells(fl1, gb1) <= 4,
     'the gunboat went ' + gone.toFixed(1) + ' cells; the cruiser ended ' + cells(fl1, gb1).toFixed(1) + ' from it');
S.ok('...and keeps within a few cells of it', far <= 7, 'at most ' + far.toFixed(1) + ' cells behind after the first six seconds');
S.ok('...closing up on an attack-move, so it fires at anything flying over on the way', amoves > 0 && plainMoves === 0, amoves + ' ticks on amove, ' + plainMoves + ' on a plain move');
/* the player's order comes first */
var spot = C, there = null, stillThere = null, broke = 0;
g._rtsOrderMove(fl1, spot.x, spot.z, false);
run(20, function () {
  if (there !== null) return;
  if (fl1.order === 'move') return;
  if (fl1.esc && fl1.goal === fl1.esc) broke++;                      /* it left the order for the station */
  there = cells(fl1, spot); stillThere = cells(fl1, gb1);
});
S.ok('sent back by the player it goes there, and does not break off for the station on the way', there !== null && there <= 2.5 && broke === 0,
     there !== null ? there.toFixed(1) + ' cells from where it was sent, ' + stillThere.toFixed(1) + ' from the gunboat' : 'never arrived');
S.ok('...and once idle takes up station again', stillThere > 6 && cells(fl1, gb1) <= 4,
     'from ' + (stillThere || 0).toFixed(1) + ' to ' + cells(fl1, gb1).toFixed(1) + ' cells off the gunboat');
/* the ship that is going somewhere, over the one parked nearer */
G = fresh();
var parked = g._rtsSpawnUnit('player', 'gunboat', C.x, C.z), f3 = at(C, 2, 0), fl3 = g._rtsSpawnUnit('player', 'flakship', f3.x, f3.z);
var s4 = at(C, 4, 0), sailing = g._rtsSpawnUnit('player', 'gunboat', s4.x, s4.z);
g._rtsOrderMove(sailing, CH.B.x, CH.B.z, false);
run(25, function () { parked.order = 'hold'; parked.path = null; });
S.ok('it keeps station on the ship under way, not on the one parked nearer', cells(fl3, sailing) <= 4 && cells(fl3, parked) > 6 && cells(sailing, parked) >= 10,
     cells(fl3, sailing).toFixed(1) + ' cells from the sailing gunboat, ' + cells(fl3, parked).toFixed(1) + ' from the parked one');
/* after a save and a resume the station order is two objects with one value; a cruiser that has
   acquired a target has no path, so an 'amove' it does not recognise as its own would never end */
G = fresh();
var gbS = g._rtsSpawnUnit('player', 'gunboat', C.x, C.z), fS = at(C, 2, 0), flS = g._rtsSpawnUnit('player', 'flakship', fS.x, fS.z);
flS.order = 'amove'; flS.esc = { x: flS.x, z: flS.z }; flS.goal = { x: flS.x, z: flS.z }; flS.path = null;
g._rtsOrderMove(gbS, CH.B.x, CH.B.z, false);
run(25);
S.ok('its station order is still its own after a save has split it into two objects: it follows the gunboat', cells(flS, gbS) <= 4 && cells(gbS, C) >= 12, cells(flS, gbS).toFixed(1) + ' cells from the gunboat');
/* nothing to follow */
G = fresh();
var lone = g._rtsSpawnUnit('player', 'flakship', C.x, C.z), x0 = lone.x, z0 = lone.z;
var pc = at(C, 6, 0), pair = g._rtsSpawnUnit('player', 'flakship', pc.x, pc.z), px = pair.x, pz = pair.z;
/* a gunboat of its own side, but well out of reach - twenty-odd cells off, on other water */
var fs = null;
for (var tz = 2; tz < g.RTS_N - 2 && !fs; tz += 2) for (var tx = 2; tx < g.RTS_N - 2 && !fs; tx += 2)
  if (!g._rtsBlocked(tx, tz, 'sea') && Math.hypot(tx - C.tx, tz - C.tz) > 24 && Math.hypot(tx - C.tx, tz - C.tz) < 40) fs = W(tx, tz);
var far2 = g._rtsSpawnUnit('player', 'gunboat', fs.x, fs.z);
run(10, function () { far2.order = 'hold'; far2.path = null; });
S.ok('with no ship of its side in reach it stays where it is, and two Flak Cruisers do not chase each other',
     !!fs && cells(pair, lone) < 9 && Math.hypot(lone.x - x0, lone.z - z0) < 1 && Math.hypot(pair.x - px, pair.z - pz) < 1,
     'moved ' + (Math.hypot(lone.x - x0, lone.z - z0) / g.RTS_TILE).toFixed(2) + ' and ' + (Math.hypot(pair.x - px, pair.z - pz) / g.RTS_TILE).toFixed(2) + ' cells');

/* ---------------- both armies ---------------- */
function canBuild(army, yard) {
  fresh(army);
  ['power', 'power', 'refinery'].forEach(function (k) { place('player', k); });
  var y = null, N = g.RTS_N;
  for (var tz = 3; tz < N - 3 && !y; tz++) for (var tx = 3; tx < N - 3 && !y; tx++)
    if (g._rtsCanPlace('player', yard, tx, tz, true)) { y = g._rtsPlaceStruct('player', yard, tx, tz, true); if (y) y.building = 0; }
  g._rtsRecalcPower('player');
  var before = !!g._rtsCanQueue('player', 'flakship');
  place('player', 'radar'); g._rtsRecalcPower('player');
  return !!y && !before && !!g._rtsCanQueue('player', 'flakship');
}
S.ok('either army builds one from its yard, once it has a Radar Post', canBuild('allied', 'navalyard') && canBuild('soviet', 'subpen'), '');

/* ---------------- the opponent ---------------- */
G = fresh();
['power', 'power', 'refinery', 'radar'].forEach(function (k) { place('enemy', k); });
var ey = null;
for (var tz = 3; tz < g.RTS_N - 3 && !ey; tz++) for (var tx = 3; tx < g.RTS_N - 3 && !ey; tx++)
  if (g._rtsCanPlace('enemy', 'subpen', tx, tz, true)) { ey = g._rtsPlaceStruct('enemy', 'subpen', tx, tz, true); if (ey) ey.building = 0; }
var ey2 = g._rtsHas('enemy', 'yard');
for (var hv = 0; hv < 3; hv++) g._rtsSpawnUnit('enemy', 'harvester', ey2.x + hv * 4, ey2.z + 30);
g._rtsRecalcPower('enemy');
G.ai.hovQ = { t: 1e9, v: null };
function buys(n) {
  var S2 = G.sides.enemy, got = 0;
  for (var r = 0; r < n; r++) { S2.q = {}; S2.credits = 1e6; S2.ore = 0; g._rtsAIUnits(S2); if (S2.q.ship && S2.q.ship.key === 'flakship') got++; }
  return got;
}
var empty = buys(40);
for (var k = 0; k < 4; k++) g._rtsSpawnUnit('player', 'heli', py.x + k * 4, py.z);
var flying = buys(40);
S.ok('the opponent buys one when the player flies', !!ey && flying > 3, flying + ' of 40');
S.ok('...and none with an empty sky', empty === 0, empty + ' of 40');

require('../lib/report.js')(S);
