/* THE JAMMER (rules/units.js `jammer`, core/jammer.js), on the real simulation:

     PARKED       its field is up two seconds after it stops, and down the moment it moves
     UNSEEN       an enemy tank in an enemy Jammer's field is not seen by the player from five
                  cells, is from one and a half, and is from five when a Spotter of the player's
                  sees it
     UNTARGETED   a long gun does not find a jammed tank six cells off, finds it with no jammer,
                  and finds it again once it has fired; it works the other way round too - the
                  player's Jammer hides the player's tank from the opponent's guns - and no team
                  of the opponent's picks a jammed unit; a building in the field is not hidden
     BOTH ARMIES  either can build one, once it has a Radar Post
     THE OPPONENT buys one once the player has dug in, it has an army to hide and its own base is
                  defended, not before, and
                  parks it in the middle of its team on the march */

var { Suite } = require('../lib/assert.js');
var { load } = require('../lib/sandbox.js');

var S = new Suite('jammer');
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
function middle() {
  var c = g._rtsNearestOpen(g.RTS_N >> 1, g.RTS_N >> 1, 20, null);
  return { tx: c[0], tz: c[1], x: g._rtsWX(c[0]), z: g._rtsWX(c[1]) };
}
function at(side, key, tx, tz) { var c = g._rtsNearestOpen(tx, tz, 3, null); return g._rtsSpawnUnit(side, key, g._rtsWX(c[0]), g._rtsWX(c[1])); }
function place(side, k) {
  var yd = g._rtsHas(side, 'yard');
  for (var r = 4; r < 30; r++) for (var a = 0; a < 8; a++) {
    var sp = g._rtsNearestOpen(yd.tx + Math.round(Math.cos(a) * r), yd.tz + Math.round(Math.sin(a) * r), 3, null);
    if (sp && g._rtsCanPlace(side, k, sp[0], sp[1], true)) return g._rtsPlaceStruct(side, k, sp[0], sp[1], true);
  }
  return null;
}
function hold(list) { list.forEach(function (u) { if (!u.dead) { u.order = 'hold'; u.path = null; u.target = null; u.cool = 9; } }); }
function finds(a) { return g._rtsFindTarget(a, Math.max(g.rtsUnitDef(a.def).sight, g._rtsReach(a))); }
/* every cell lit for the player, so only the jamming decides what is seen */
function lit(G) { for (var i = 0; i < G.vis.length; i++) { G.vis[i] = 1; G.mapped[i] = 1; } }

/* ---------------- parked ---------------- */
var G = fresh(), m = middle();
var jm = at('player', 'jammer', m.tx, m.tz);
g._rtsOrderMove(jm, g._rtsWX(m.tx + 10), m.z, false);
var upMoving = false;
run(1.5, function () { if (G.jam && G.jam.player.length) upMoving = true; });
jm.path = null; jm.order = 'hold';
run(1);
var upEarly = G.jam.player.length > 0;
run(1.5);
S.ok('its field is down while it moves, and up two seconds after it stops', !upMoving && !upEarly && G.jam.player.length === 1,
     'moving ' + upMoving + ', at 1 s ' + upEarly + ', at 2.5 s ' + G.jam.player.length);

/* ---------------- unseen ---------------- */
function seenFrom(cells, withSpotter) {
  var G = fresh(), m = middle();
  var j = at('enemy', 'jammer', m.tx, m.tz), t = at('enemy', 'tank', m.tx + 1, m.tz + 1);
  var eye = g._rtsSpawnUnit('player', 'rifle', t.x - cells * g.RTS_TILE, t.z);
  var sp = withSpotter ? at('player', 'spotter', m.tx - 7, m.tz) : null;
  run(2.5, function () { hold([j, t, eye, sp].filter(Boolean)); });
  lit(G);
  return g._rtsEntSeen(t);
}
S.ok('an enemy tank in an enemy Jammer\'s field is not seen from five cells', !seenFrom(5), '');
S.ok('...is from one and a half', seenFrom(1.5), '');
S.ok('...and is from five when a Spotter of the player\'s sees it', seenFrom(5, true), '');

/* ---------------- untargeted ---------------- */
function duel(shooterSide, jam, fired) {
  var G = fresh(), m = middle(), other = shooterSide === 'player' ? 'enemy' : 'player';
  var a = at(shooterSide, 'arty', m.tx, m.tz), t = at(other, 'tank', m.tx + 6, m.tz);
  var j = jam ? at(other, 'jammer', m.tx + 7, m.tz + 1) : null;
  run(2.5, function () { hold([a, t, j].filter(Boolean)); });
  if (fired) t.firedT = G.t;
  return finds(a) === t;
}
S.ok('a long gun does not find a jammed tank six cells off', !duel('player', true), '');
S.ok('...finds it with no jammer', duel('player', false), '');
S.ok('...and finds it again once it has fired', duel('player', true, true), '');
S.ok('the player\'s Jammer hides the player\'s tank from the opponent\'s guns the same way', !duel('enemy', true) && duel('enemy', false), '');
/* a team of the opponent's choosing its target - among vehicles, so the player's buildings are
   not candidates - with the Jammer, and without it */
function teamPick(jam) {
  var G = fresh(), m = middle();
  var pt = at('player', 'tank', m.tx + 6, m.tz), pj = jam ? at('player', 'jammer', m.tx + 7, m.tz + 1) : null;
  var et = at('enemy', 'tank', m.tx, m.tz);
  var team = g._rtsTeamMake(g.RTS_TEAM_TYPES.filter(function (t) { return t.name === 'Skirmish'; })[0]);
  g._rtsTeamAdd(team, et);
  run(2.5, function () { hold([pt, pj, et].filter(Boolean)); });
  var pick = g._rtsTeamTarget(team, 'vehicles');
  return pick === pt ? 'the tank' : pick === pj && pj ? 'the jammer' : pick ? 'a ' + pick.def : 'nothing';
}
var open2 = teamPick(false), jammed = teamPick(true);
S.ok('no team of the opponent\'s picks a jammed unit, where it picks the same one unjammed', open2 === 'the tank' && jammed === 'nothing',
     'unjammed: ' + open2 + ', jammed: ' + jammed);
/* a building in the field */
G = fresh(); m = middle();
var py = g._rtsHas('player', 'yard');
var near = g._rtsNearestOpen(py.tx + 3, py.tz + 3, 6, null);
pj = at('player', 'jammer', near[0], near[1]);
var ea = g._rtsSpawnUnit('enemy', 'arty', py.x + 24, py.z);
run(2.5, function () { hold([pj, ea]); });
var tgt = finds(ea);
S.ok('a building in the field is not hidden', G.jam.player.length === 1 && !!tgt && tgt.type === 'struct', tgt ? tgt.def : 'nothing');
/* ...nor from the player's eye: the opponent's yard, with the opponent's Jammer parked beside it */
G = fresh();
var eyd = g._rtsHas('enemy', 'yard'), en = g._rtsNearestOpen(eyd.tx + 3, eyd.tz + 3, 6, null);
var ejm = at('enemy', 'jammer', en[0], en[1]), eye2 = g._rtsSpawnUnit('player', 'rifle', eyd.x - 6 * g.RTS_TILE, eyd.z);
run(2.5, function () { hold([ejm, eye2]); });
lit(G);
S.ok('...and the player still sees a building of the opponent\'s in the opponent\'s field', G.jam.enemy.length === 1 && g._rtsEntSeen(eyd), '');

/* ---------------- both armies ---------------- */
function canBuild(army) {
  fresh(army);
  ['power', 'power', 'refinery', 'factory'].forEach(function (k) { place('player', k); });
  g._rtsRecalcPower('player');
  var before = !!g._rtsCanQueue('player', 'jammer');
  place('player', 'radar'); g._rtsRecalcPower('player');
  return !before && !!g._rtsCanQueue('player', 'jammer');
}
S.ok('either army can build one, once it has a Radar Post', canBuild('allied') && canBuild('soviet'), '');

/* ---------------- the opponent ---------------- */
G = fresh();
['factory', 'radar', 'depot', 'apower', 'apower', 'apower'].forEach(function (k) { if (!g._rtsHas('enemy', k) || /power/.test(k)) place('enemy', k); });
var ey = g._rtsHas('enemy', 'yard');
for (var hv = 0; hv < 3; hv++) g._rtsSpawnUnit('enemy', 'harvester', ey.x + hv * 4, ey.z + 30);
g._rtsSpawnUnit('enemy', 'minelayer', ey.x, ey.z + 24);
g._rtsRecalcPower('enemy');
G.ai.hovQ = { t: 1e9, v: null };
function buys(n) {
  var S2 = G.sides.enemy, got = 0;
  for (var r = 0; r < n; r++) { S2.q = {}; S2.credits = 1e6; S2.ore = 0; g._rtsAIUnits(S2); if (S2.q.vehicle && S2.q.vehicle.key === 'jammer') got++; }
  return got;
}
var tanks = [];
for (var k = 0; k < 4; k++) tanks.push(g._rtsSpawnUnit('enemy', 'tank', ey.x + 8 + k * 3, ey.z + 8));
var notDug = buys(30), defBefore = g._rtsPlayerDefences();
['pillbox', 'pillbox'].forEach(function (k) { var b = place('player', k); if (b) b.building = 0; });
var undefended = buys(30);
for (var df = 0; df < 4; df++) { var tw = place('enemy', 'flametower'); if (tw) tw.building = 0; }
var dug = buys(30);
S.ok('the opponent buys none before the player has dug in', notDug === 0 && defBefore < 2, notDug + ' of 30; ' + defBefore + ' defences');
S.ok('...nor while its own base is undefended', undefended === 0, undefended + ' of 30');
S.ok('...and one once they have, with an army to hide and its own base defended', dug > 5 && g._rtsPlayerDefences() >= 2 && g._rtsAIDefended(), dug + ' of 30; ' + g._rtsPlayerDefences() + ' defences');
var team2 = g._rtsTeamMake(g.RTS_TEAM_TYPES.filter(function (t) { return t.name === 'Skirmish'; })[0]);
tanks.forEach(function (u) { g._rtsTeamAdd(team2, u); u.init = true; });
team2.moving = true; team2.hasBeen = true;
py = g._rtsHas('player', 'yard');
tanks.forEach(function (u) { u.x += (py.x - u.x) * 0.4; u.z += (py.z - u.z) * 0.4; });
var ej = g._rtsSpawnUnit('enemy', 'jammer', ey.x, ey.z + 10);
run(60, function () { hold(tanks); });
var c = g._rtsTeamCentre(team2), off = Math.hypot(ej.x - c.x, ej.z - c.z) / g.RTS_TILE;
S.ok('...and parks it in the middle of its team on the march', off < 4, off.toFixed(1) + ' cells from the team\'s centre');

require('../lib/report.js')(S);
