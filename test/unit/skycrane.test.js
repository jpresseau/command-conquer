/* THE SKY CRANE (rules/units.js `skycrane` - the transport rules are core/transport.js):

     THE LIFT     a Battle Tank ordered onto it goes aboard; the crane flies it over the water to
                  the far shore at altitude and sets it down there, where the tank could not have
                  driven
     WHAT FITS    one vehicle and nothing more: a second tank cannot board, nor a squad, nor a
                  transport; a Harvester ordered onto it goes aboard
     SHOT DOWN    over land its load is set down and lives; over water the load goes with it
     WHOSE        the Dominion builds it, behind an Airfield; the Compact does not (it has the
                  Skylift for men) */

var { Suite } = require('../lib/assert.js');
var { load } = require('../lib/sandbox.js');

var S = new Suite('skycrane');
var g = load(['src/rules', 'src/core', 'src/sprites/props.js']);

function fresh(army) {
  g.window._RTS_ARMY = army || 'soviet';
  g._rtsNewGame(776, 'easy');
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
    if (sp && g._rtsCanPlace(side, k, sp[0], sp[1], true)) return g._rtsPlaceStruct(side, k, sp[0], sp[1], true);
  }
  return null;
}
/* Two land cells across open water from each other - a straight line between them at least a
   third water, 14 to 30 cells apart - and of those, the pair whose road round is longest
   against the flight. */
function roadRun(a, b) {
  var p = g._rtsPath(g._rtsWX(a[0]), g._rtsWX(a[1]), g._rtsWX(b[0]), g._rtsWX(b[1]), null), r = 0;
  if (!p) return 1e9;
  for (var i = 1; i < p.length; i++) r += Math.hypot(p[i].x - p[i - 1].x, p[i].z - p[i - 1].z);
  return r;
}
function acrossWater(G) {
  var N = g.RTS_N, land = [], best = null, tried = 0;
  for (var tz = 4; tz < N - 4; tz += 2) for (var tx = 4; tx < N - 4; tx += 2)
    if (!g._rtsBlocked(tx, tz, null) && g._rtsNearestOpen(tx, tz, 1, 'sea')) land.push([tx, tz]);
  for (var i = 0; i < land.length && tried < 400; i += 3) for (var j = i + 1; j < land.length && tried < 400; j += 3) {
    var a = land[i], b = land[j], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
    if (d < 14 || d > 30) continue;
    var wet = 0;
    for (var k = 1; k < 20; k++) {
      var x = Math.round(a[0] + (b[0] - a[0]) * k / 20), z = Math.round(a[1] + (b[1] - a[1]) * k / 20);
      if (G.terrain[g._rtsIdx(x, z)] === g.RTS_T_WATER) wet++;
    }
    if (wet < 7) continue;
    tried++;
    var ratio = roadRun(a, b) / (d * g.RTS_TILE);
    if (!best || ratio > best.ratio) best = { a: a, b: b, wet: wet, ratio: ratio };
  }
  return best;
}

/* ---------------- the lift ---------------- */
var G = fresh(), X = acrossWater(G);
S.ok('the staging: two shores across open water', !!X, X ? X.a + ' to ' + X.b + ', ' + X.wet + ' of 19 points on water' : 'none found');
var A = { x: g._rtsWX(X.a[0]), z: g._rtsWX(X.a[1]) }, B = { x: g._rtsWX(X.b[0]), z: g._rtsWX(X.b[1]) };
var cr = g._rtsSpawnUnit('player', 'skycrane', A.x, A.z), tk = g._rtsSpawnUnit('player', 'tank', A.x + 6, A.z);
var boarded = g._rtsOrderBoard(tk, cr);
run(12, function () { if (!cr.cargo || !cr.cargo.length) { cr.order = null; cr.path = null; } });
S.ok('a Battle Tank ordered onto it goes aboard', boarded && tk.inside === cr && cr.cargo.length === 1, 'inside ' + !!tk.inside);
var sent = g._rtsOrderUnloadAt(cr, B.x, B.z), high = 0;
run(30, function () { if (cr.cargo && cr.cargo.length) high = Math.max(high, g._rtsAirLift(cr)); });
var land = Math.hypot(tk.x - B.x, tk.z - B.z) / g.RTS_TILE;
S.ok('...and the crane sets it down on the far shore', sent && !tk.inside && !tk.dead && land <= 3 && !g._rtsBlocked(g._rtsTX(tk.x), g._rtsTX(tk.z), null),
     sent ? land.toFixed(1) + ' cells from where it was sent' : 'the order was refused');
S.ok('...flying the whole way at altitude, over whatever lies between', high >= 10, 'up to ' + high.toFixed(1) + ' over the ground');
S.ok('...where driving would have been the long way round, or no way at all', X.ratio >= 1.5, X.ratio > 1e6 ? 'no road at all' : 'the road is ' + X.ratio.toFixed(1) + 'x the flight');

/* ---------------- what fits ---------------- */
G = fresh();
var c2 = g._rtsSpawnUnit('player', 'skycrane', A.x, A.z);
var t1 = g._rtsSpawnUnit('player', 'tank', A.x, A.z), t2 = g._rtsSpawnUnit('player', 'tank', A.x + 4, A.z);
var sq = g._rtsSpawnUnit('player', 'rifle', A.x - 4, A.z), apc = g._rtsSpawnUnit('player', 'apc', A.x, A.z + 4);
g._rtsBoard(t1, c2);
S.ok('one vehicle and nothing more: a second tank cannot board', t1.inside === c2 && !g._rtsCanBoard(t2, c2), '');
c2.cargo = []; t1.inside = null;
S.ok('...nor a squad, nor a transport', !g._rtsCanBoard(sq, c2) && !g._rtsCanBoard(apc, c2), '');
/* a Harvester is a vehicle, and a field cut off by water is in the crane's own rules */
var hv = g._rtsSpawnUnit('player', 'harvester', A.x + 8, A.z + 4), hvOk = g._rtsOrderBoard(hv, c2);
run(12, function () { if (!c2.cargo || !c2.cargo.length) { c2.order = null; c2.path = null; } });
S.ok('...a Harvester ordered onto it goes aboard', hvOk && hv.inside === c2, 'accepted ' + hvOk + ', inside ' + (hv.inside === c2));

/* ---------------- shot down ---------------- */
function downed(over) {
  var G = fresh(), p = over === 'land' ? A : null;
  if (!p) {
    for (var k = 1; k < 20 && !p; k++) {
      var x = Math.round(X.a[0] + (X.b[0] - X.a[0]) * k / 20), z = Math.round(X.a[1] + (X.b[1] - X.a[1]) * k / 20);
      if (G.terrain[g._rtsIdx(x, z)] === g.RTS_T_WATER && !g._rtsNearestOpen(x, z, 3, null)) p = { x: g._rtsWX(x), z: g._rtsWX(z) };
    }
  }
  if (!p) return null;
  var c = g._rtsSpawnUnit('player', 'skycrane', p.x, p.z), t = g._rtsSpawnUnit('player', 'tank', p.x, p.z);
  g._rtsBoard(t, c);
  g._rtsDamage(c, c.hp + 1, null, false);
  run(1);
  return !t.dead;
}
var overLand = downed('land'), overWater = downed('water');
S.ok('shot down over land, its load is set down and lives', overLand === true, String(overLand));
S.ok('...over open water, the load goes with it', overWater === false, overWater === null ? 'no open water three cells from land' : String(overWater));

/* ---------------- whose ---------------- */
function canBuild(army) {
  fresh(army);
  ['power', 'power', 'refinery', 'radar', 'afld'].forEach(function (k) { place('player', k); });
  g._rtsRecalcPower('player');
  return !!g._rtsCanQueue('player', 'skycrane');
}
S.ok('the Dominion builds it behind an Airfield; the Compact does not', canBuild('soviet') && !canBuild('allied'), '');

require('../lib/report.js')(S);
