/* THE SPOTTER (rules/units.js `spotter`, core/spotter.js), on the real simulation:

     IT SEES THROUGH  under a fog sky its sight disc reaches its full nine cells where a tank's
                      stops at five; from inside a fog bank it sees out, and from outside it sees
                      into one, past the three cells anything else gets
     IT SPOTS         in fog, a long gun finds an enemy tank seven cells off when a spotter of its
                      own side sees the tank, and not without one - nor with only the enemy's;
                      in a fog bank the same; on a clear day the spotter changes nothing
     BOTH ARMIES      either can build one, once it has a Radar Post
     THE OPPONENT     buys one in fog when it has a long gun to see for - not on a clear day, and
                      not with no long gun - and keeps it ahead of the gun, toward the player */

var { Suite } = require('../lib/assert.js');
var { load } = require('../lib/sandbox.js');

var S = new Suite('spotter');
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
    if (sp && g._rtsCanPlace(side, k, sp[0], sp[1], true)) return g._rtsPlaceStruct(side, k, sp[0], sp[1], true);
  }
  return null;
}
/* how far the one unit the player has left sees, in cells */
function farthest(G, u, R) {
  G.ents.forEach(function (e) { if (e.side === 'player' && e !== u) e.dead = true; });
  G.visT = 1; g._rtsVisTick(0);
  var far = 0, tx = g._rtsTX(u.x), tz = g._rtsTX(u.z);
  for (var dz = -R; dz <= R; dz++) for (var dx = -R; dx <= R; dx++)
    if (g._rtsInB(tx + dx, tz + dz) && G.vis[g._rtsIdx(tx + dx, tz + dz)]) far = Math.max(far, Math.hypot(dx, dz));
  return far;
}

/* ---------------- it sees through ---------------- */
function seesIn(sky, key, bank) {
  var G = fresh(sky), m = middle(), u = g._rtsSpawnUnit('player', key, m.x, m.z);
  if (bank === 'on') g._rtsFireFogBank('enemy', m.tx, m.tz);
  if (bank === 'beside') g._rtsFireFogBank('enemy', m.tx + g.RTS_FOGBANK.r + 2, m.tz);
  return farthest(G, u, 12);
}
var spFog = seesIn('fog', 'spotter'), tkFog = seesIn('fog', 'tank');
S.ok('under a fog sky the spotter sees its full nine cells, where a tank stops at five', spFog >= 8.5 && tkFog <= g.RTS_FOG_CELLS, 'spotter ' + spFog.toFixed(1) + ', tank ' + tkFog.toFixed(1));
var spIn = seesIn('day', 'spotter', 'on'), tkIn = seesIn('day', 'tank', 'on');
S.ok('...from inside a fog bank it sees out, where a tank sees three cells', spIn >= 8.5 && tkIn <= g.RTS_FOGBANK.see, 'spotter ' + spIn.toFixed(1) + ', tank ' + tkIn.toFixed(1));
/* into a bank beside it: how much of the bank's ground past three cells it sees */
function intoBank(key) {
  var G = fresh('day'), m = middle(), u = g._rtsSpawnUnit('player', key, m.x, m.z);
  g._rtsFireFogBank('enemy', m.tx + g.RTS_FOGBANK.r + 2, m.tz);
  farthest(G, u, 12);
  var b = G.wx[0], n = 0;
  for (var dx = 4; dx <= 9; dx++) for (var dz = -2; dz <= 2; dz++) {
    var x = m.tx + dx, z = m.tz + dz;
    if (Math.hypot(g._rtsWX(x) - b.x, g._rtsWX(z) - b.z) <= b.r && G.vis[g._rtsIdx(x, z)]) n++;
  }
  return n;
}
var spInto = intoBank('spotter'), tkInto = intoBank('arty');
S.ok('...and from outside sees into one, past the three cells anything else gets', spInto > 5 && tkInto === 0, 'spotter ' + spInto + ' cells, artillery ' + tkInto);

/* ---------------- it spots ---------------- */
function duel(sky, spotSide, bank) {
  var G = fresh(sky), m = middle();
  var a = g._rtsSpawnUnit('player', 'arty', m.x, m.z), p = open(m.tx + 7, m.tz);
  var f = g._rtsSpawnUnit('enemy', 'tank', p.x, p.z);
  /* the player's spotter near its own gun; the enemy's beyond the tank, out of the fog's reach of
     the gun, so the only thing the gun could find is what a spotter lets it */
  if (spotSide) { var q = spotSide === 'player' ? open(m.tx + 4, m.tz + 2) : open(m.tx + 9, m.tz); g._rtsSpawnUnit(spotSide, 'spotter', q.x, q.z); }
  if (bank) g._rtsFireFogBank('enemy', p.tx, p.tz);
  g._rtsSpotTick();
  var got = g._rtsFindTarget(a, Math.max(g.rtsUnitDef('arty').sight, g._rtsReach(a)));
  return spotSide === 'enemy' ? got : got === f;
}
S.ok('in fog, a long gun finds a tank seven cells off when its own spotter sees it', duel('fog', 'player'), '');
S.ok('...and not without one', !duel('fog', null), '');
var theirs = duel('fog', 'enemy');
S.ok('...nor with only the enemy\'s: the gun finds nothing at all', !theirs, theirs ? 'found its ' + theirs.def : 'nothing');
S.ok('in a fog bank the same: found with a spotter, not without', duel('day', 'player', true) && !duel('day', null, true), '');
S.ok('on a clear day the spotter changes nothing: found either way', duel('day', 'player') && duel('day', null), '');
/* ...and through the frame loop itself, not the finder alone: an idle long gun in fog opens up on
   the tank its spotter sees, and does not without one */
function fought(spotSide) {
  var G = fresh('fog'), m = middle();
  var a = g._rtsSpawnUnit('player', 'arty', m.x, m.z), p = open(m.tx + 7, m.tz), f = g._rtsSpawnUnit('enemy', 'tank', p.x, p.z), sp = null;
  if (spotSide) { var q = open(m.tx + 4, m.tz + 2); sp = g._rtsSpawnUnit(spotSide, 'spotter', q.x, q.z); }
  var hp0 = f.hp;
  run(6, function () { [a, f, sp].forEach(function (u) { if (u) { u.path = null; u.order = u === a ? null : 'hold'; } }); });
  return { shot: f.dead || f.hp < hp0, aimed: a.target === f };
}
var withSp = fought('player'), without = fought(null);
S.ok('through the frame loop: an idle long gun in fog opens up on the tank its spotter sees, and not without one', (withSp.shot || withSp.aimed) && !without.shot && !without.aimed,
     'with: ' + JSON.stringify(withSp) + ', without: ' + JSON.stringify(without));

/* ---------------- both armies ---------------- */
function canBuild(army) {
  fresh('day', army);
  ['power', 'power', 'refinery', 'factory'].forEach(function (k) { place('player', k); });
  g._rtsRecalcPower('player');
  var before = !!g._rtsCanQueue('player', 'spotter');
  place('player', 'radar'); g._rtsRecalcPower('player');
  return !before && !!g._rtsCanQueue('player', 'spotter');
}
S.ok('either army can build one, once it has a Radar Post', canBuild('allied') && canBuild('soviet'), '');

/* ---------------- the opponent ---------------- */
function buys(sky, gun) {
  var G = fresh(sky);
  ['factory', 'radar', 'depot', 'apower', 'apower', 'apower'].forEach(function (k) { if (!g._rtsHas('enemy', k) || /power/.test(k)) place('enemy', k); });
  var ey = g._rtsHas('enemy', 'yard');
  for (var hv = 0; hv < 3; hv++) g._rtsSpawnUnit('enemy', 'harvester', ey.x + hv * 4, ey.z + 30);
  g._rtsSpawnUnit('enemy', 'minelayer', ey.x, ey.z + 24);
  if (gun) g._rtsSpawnUnit('enemy', 'arty', ey.x + 12, ey.z + 12);
  g._rtsRecalcPower('enemy');
  G.ai.hovQ = { t: 1e9, v: null };
  var S2 = G.sides.enemy, got = 0;
  for (var r = 0; r < 30; r++) { S2.q = {}; S2.credits = 1e6; S2.ore = 0; g._rtsAIUnits(S2); if (S2.q.vehicle && S2.q.vehicle.key === 'spotter') got++; }
  return got;
}
var fogGun = buys('fog', true), dayGun = buys('day', true), fogNone = buys('fog', false);
S.ok('the opponent buys one in fog with a long gun to see for', fogGun > 5, fogGun + ' of 30');
S.ok('...not on a clear day, and not with no long gun', dayGun === 0 && fogNone === 0, 'day ' + dayGun + ', no gun ' + fogNone);
var G = fresh('fog'), ey = g._rtsHas('enemy', 'yard'), py = g._rtsHas('player', 'yard');
var gun = g._rtsSpawnUnit('enemy', 'arty', ey.x + 12, ey.z + 12); gun.order = 'hold';
var es = g._rtsSpawnUnit('enemy', 'spotter', ey.x, ey.z + 16);
run(20, function () { gun.order = 'hold'; gun.path = null; });
var ahead = Math.hypot(py.x - es.x, py.z - es.z) < Math.hypot(py.x - gun.x, py.z - gun.z), off = Math.hypot(es.x - gun.x, es.z - gun.z) / g.RTS_TILE;
S.ok('...and keeps it a few cells ahead of the gun, toward the player', ahead && off > 2 && off < 7, off.toFixed(1) + ' cells from the gun, ' + (ahead ? 'ahead' : 'behind'));

require('../lib/report.js')(S);
