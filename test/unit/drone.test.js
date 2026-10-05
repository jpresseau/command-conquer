/* THE RECON DRONE (rules/units.js `drone`, core/drone.js), on the real simulation:

     IT CIRCLES     sent fifteen cells off, it gets there and then keeps circling the point, two
                    to four cells round it, rather than parking; sent somewhere new, it circles
                    there instead
     IT SEES        under a fog sky its sight reaches its full disc, where a tank's stops at five
     IT SPOTS       in fog, a long gun finds an enemy tank seven cells off when the drone sees it,
                    and not without; and a tank in an enemy Jammer's field is seen with the drone
                    over it, not without
     WHOSE          the Compact builds it, behind a Helipad; the Dominion does not
     THE OPPONENT   buys one once it is fighting half-blind - fog, or a Jammer of the player's on
                    the field - with its own base defended; not on a clear day with no Jammer,
                    nor undefended; and keeps it circling over its largest team on the march */

var { Suite } = require('../lib/assert.js');
var { load } = require('../lib/sandbox.js');

var S = new Suite('drone');
var g = load(['src/rules', 'src/core', 'src/sprites/props.js']);

function fresh(sky, army) {
  g.window._RTS_ARMY = army || 'allied';
  g._rtsNewGame(4242, 'easy');
  var G = g.window._rtsG;
  G.over = null;
  G.sky = sky || 'day';
  G.ents.forEach(function (e) { if (e.type === 'unit') e.dead = true; });
  g._rtsTick(1 / 30);
  G.teams = {};
  return G;
}
function run(secs, each) { for (var t = 0; t < secs * 30; t++) { if (each) each(); g._rtsTick(1 / 30); } }
function middle() {
  var c = g._rtsNearestOpen(g.RTS_N >> 1, g.RTS_N >> 1, 20, null);
  return { tx: c[0], tz: c[1], x: g._rtsWX(c[0]), z: g._rtsWX(c[1]) };
}
function open(tx, tz) { var c = g._rtsNearestOpen(tx, tz, 3, null); return { tx: c[0], tz: c[1], x: g._rtsWX(c[0]), z: g._rtsWX(c[1]) }; }
function place(side, k) {
  var yd = g._rtsHas(side, 'yard');
  for (var r = 4; r < 30; r++) for (var a = 0; a < 8; a++) {
    var sp = g._rtsNearestOpen(yd.tx + Math.round(Math.cos(a) * r), yd.tz + Math.round(Math.sin(a) * r), 3, null);
    if (sp && g._rtsCanPlace(side, k, sp[0], sp[1], true)) { var b = g._rtsPlaceStruct(side, k, sp[0], sp[1], true); if (b) b.building = 0; return b; }
  }
  return null;
}
function hold(list) { list.forEach(function (u) { if (!u.dead) { u.order = 'hold'; u.path = null; u.target = null; u.cool = 9; } }); }
var cells = function (a, b) { return Math.hypot(a.x - b.x, a.z - b.z) / g.RTS_TILE; };

/* ---------------- it circles ---------------- */
var G = fresh(), m = middle();
var dr = g._rtsSpawnUnit('player', 'drone', m.x, m.z);
/* how it sits round a point: nearest and farthest over the last stretch, and how far round it went */
function circling(P, secs) {
  var lo = 99, hi = 0, turned = 0, last = null;
  run(secs, function () {
    if (G.t < 0) return;
    var d = cells(dr, P), a = Math.atan2(dr.z - P.z, dr.x - P.x);
    if (last !== null) { var da = a - last; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI; turned += Math.abs(da); }
    last = a; lo = Math.min(lo, d); hi = Math.max(hi, d);
  });
  return { lo: lo, hi: hi, turns: turned / (2 * Math.PI) };
}
var P1 = { x: m.x + 15 * g.RTS_TILE, z: m.z };
g._rtsOrderMove(dr, P1.x, P1.z, false);
run(12);
var arrived = cells(dr, P1), c1 = circling(P1, 15);
S.ok('sent fifteen cells off, it gets there', arrived <= 5, arrived.toFixed(1) + ' cells from the point');
S.ok('...and keeps circling it, two to four cells round, rather than parking', c1.lo >= 1.5 && c1.hi <= 4.5 && c1.turns >= 1,
     'from ' + c1.lo.toFixed(1) + ' to ' + c1.hi.toFixed(1) + ' cells, ' + c1.turns.toFixed(1) + ' times round');
var P2 = { x: m.x, z: m.z + 12 * g.RTS_TILE };
g._rtsOrderMove(dr, P2.x, P2.z, false);
run(12);
var c2 = circling(P2, 12);
S.ok('...sent somewhere new, it circles there instead', c2.lo >= 1.5 && c2.hi <= 4.5 && c2.turns >= 0.75,
     'from ' + c2.lo.toFixed(1) + ' to ' + c2.hi.toFixed(1) + ' cells, ' + c2.turns.toFixed(1) + ' times round');

/* ---------------- it sees ---------------- */
function farthest(G, u, R) {
  G.ents.forEach(function (e) { if (e.side === 'player' && e !== u) e.dead = true; });
  G.visT = 1; g._rtsVisTick(0);
  var far = 0, tx = g._rtsTX(u.x), tz = g._rtsTX(u.z);
  for (var dz = -R; dz <= R; dz++) for (var dx = -R; dx <= R; dx++)
    if (g._rtsInB(tx + dx, tz + dz) && G.vis[g._rtsIdx(tx + dx, tz + dz)]) far = Math.max(far, Math.hypot(dx, dz));
  return far;
}
function seesIn(key) { var G = fresh('fog'), m = middle(); return farthest(G, g._rtsSpawnUnit('player', key, m.x, m.z), 14); }
var full = g.rtsSightTiles(g.rtsUnitDef('drone')), drFog = seesIn('drone'), tkFog = seesIn('tank');
S.ok('under a fog sky its sight reaches its full disc, where a tank\'s stops at five', drFog >= full - 0.5 && tkFog <= g.RTS_FOG_CELLS,
     'drone ' + drFog.toFixed(1) + ' of ' + full + ', tank ' + tkFog.toFixed(1));

/* ---------------- it spots ---------------- */
function duel(withDrone) {
  var G = fresh('fog'), m = middle();
  var a = g._rtsSpawnUnit('player', 'arty', m.x, m.z), p = open(m.tx + 7, m.tz);
  var f = g._rtsSpawnUnit('enemy', 'tank', p.x, p.z);
  if (withDrone) g._rtsSpawnUnit('player', 'drone', m.x + 3 * g.RTS_TILE, m.z + 2 * g.RTS_TILE);
  g._rtsSpotTick();
  return g._rtsFindTarget(a, Math.max(g.rtsUnitDef('arty').sight, g._rtsReach(a))) === f;
}
S.ok('in fog, a long gun finds a tank seven cells off when the drone sees it', duel(true), '');
S.ok('...and not without', !duel(false), '');
function jammedSeen(withDrone) {
  var G = fresh(), m = middle();
  var j = open(m.tx, m.tz), t = open(m.tx + 1, m.tz + 1);
  var jm = g._rtsSpawnUnit('enemy', 'jammer', j.x, j.z), tk = g._rtsSpawnUnit('enemy', 'tank', t.x, t.z);
  var eye = g._rtsSpawnUnit('player', 'rifle', tk.x - 5 * g.RTS_TILE, tk.z);
  var d = withDrone ? g._rtsSpawnUnit('player', 'drone', tk.x - 6 * g.RTS_TILE, tk.z) : null;
  run(2.5, function () { hold([jm, tk, eye]); if (d) { d.x = tk.x - 6 * g.RTS_TILE; d.z = tk.z; } });
  for (var i = 0; i < G.vis.length; i++) { G.vis[i] = 1; G.mapped[i] = 1; }
  return G.jam.enemy.length === 1 && g._rtsEntSeen(tk);
}
S.ok('a tank in an enemy Jammer\'s field is seen with the drone over it', jammedSeen(true), '');
S.ok('...and not without', !jammedSeen(false), '');

/* ---------------- whose ---------------- */
function canBuild(army, pad) {
  fresh('day', army);
  ['power', 'power', 'refinery', 'radar', pad].forEach(function (k) { place('player', k); });
  g._rtsRecalcPower('player');
  return !!g._rtsCanQueue('player', 'drone');
}
S.ok('the Compact builds it behind a Helipad; the Dominion does not', canBuild('allied', 'helipad') && !canBuild('soviet', 'afld'), '');

/* ---------------- the opponent ---------------- */
function base(sky) {
  var G = fresh(sky, 'soviet');                                       /* the opponent is the Compact */
  ['factory', 'radar', 'depot', 'apower', 'apower', 'apower', 'helipad'].forEach(function (k) { if (!g._rtsHas('enemy', k) || /power/.test(k)) place('enemy', k); });
  var ey = g._rtsHas('enemy', 'yard');
  for (var hv = 0; hv < 3; hv++) g._rtsSpawnUnit('enemy', 'harvester', ey.x + hv * 4, ey.z + 30);
  g._rtsSpawnUnit('enemy', 'minelayer', ey.x, ey.z + 24);
  g._rtsRecalcPower('enemy');
  G.ai.hovQ = { t: 1e9, v: null };
  return G;
}
function buys(G, n) {
  var S2 = G.sides.enemy, got = 0;
  for (var r = 0; r < n; r++) { S2.q = {}; S2.credits = 1e6; S2.ore = 0; g._rtsAIUnits(S2); if (S2.q.air && S2.q.air.key === 'drone') got++; }
  return got;
}
function towers(n) { var t = []; for (var i = 0; i < n; i++) t.push(place('enemy', 'flametower')); return t; }
G = base('fog');
var fogUndef = buys(G, 20);
towers(4);
var fogDef = buys(G, 20);
G = base('day'); towers(4);
var clear = buys(G, 20);
var pm = middle(), pjm = g._rtsSpawnUnit('player', 'jammer', pm.x, pm.z);
var jammed = buys(G, 20);
S.ok('the opponent buys one in fog with its own base defended', fogDef > 3, fogDef + ' of 20');
S.ok('...and with a Jammer of the player\'s on the field', jammed > 3, jammed + ' of 20');
S.ok('...not on a clear day with no Jammer', clear === 0, clear + ' of 20');
S.ok('...nor with its own base undefended', fogUndef === 0, fogUndef + ' of 20');
/* two teams on the march: the drone goes to the larger - and nothing else of the opponent's
   about to be recruited into either */
pjm.dead = true;
var py = g._rtsHas('player', 'yard'), ey = g._rtsHas('enemy', 'yard');
function team(n, ox) {
  var t = g._rtsTeamMake(g.RTS_TEAM_TYPES.filter(function (t) { return t.name === 'Skirmish'; })[0]);
  for (var k = 0; k < n; k++) {
    var u = g._rtsSpawnUnit('enemy', 'tank', ey.x + ox + k * 3, ey.z + 8);
    u.x += (py.x - u.x) * 0.4; u.z += (py.z - u.z) * 0.4; u.init = true;
    g._rtsTeamAdd(t, u);
  }
  t.moving = true; t.hasBeen = true;
  return t;
}
var small = team(2, -30), large = team(5, 20), all = small.members.concat(large.members);
var ed = g._rtsSpawnUnit('enemy', 'drone', ey.x, ey.z + 10);
/* ...and a long gun at home, which the Spotter AI (core/spotter.js) would send a spotter ahead of:
   the drone spots too, and it is the drone tick's, not the Spotter AI's */
var gun = g._rtsSpawnUnit('enemy', 'arty', ey.x - 10, ey.z - 10); all.push(gun);
var lo = 99, hi = 0;
function only() { G.ents.forEach(function (e) { if (e.side === 'enemy' && e.type === 'unit' && e !== ed && all.indexOf(e) < 0) e.dead = true; }); hold(all); }
run(40, only);
run(10, function () {
  only();
  var d = cells(ed, g._rtsTeamCentre(large));
  lo = Math.min(lo, d); hi = Math.max(hi, d);
});
var toSmall = cells(ed, g._rtsTeamCentre(small));
S.ok('...and keeps it circling over its largest team on the march, a long gun at home notwithstanding', hi <= 5 && toSmall > hi && cells(ed, gun) > 10,
     'from ' + lo.toFixed(1) + ' to ' + hi.toFixed(1) + ' cells round the larger team\'s centre; ' + toSmall.toFixed(1) + ' from the smaller, ' + cells(ed, gun).toFixed(1) + ' from the gun');

require('../lib/report.js')(S);
