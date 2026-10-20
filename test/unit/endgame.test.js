/* THE ORE IS GONE (core/ore.js _rtsOreLeft, core/ai.js _rtsOreGone, core/missions.js _rtsAIAttack
   and _rtsAIHunt, core/teams.js _rtsTeamCap): a stripped map used to leave every seat sitting on
   its army for the rest of the match. Measured on a 2v2 large map: 220,000 ore at the start, none
   at fifteen minutes, and no move by anyone for the next fifteen.

     THE COUNT     _rtsOreLeft is the number of cells holding ore or gems, moves with the map, and
                   under RTS_AI.oreGone the ore is gone
     CAN EARN      a seat with a refinery and harvesters can earn only while there is ore to mine
     EVERYTHING    four minutes into a 1v1, the opponent keeps a garrison at home while the map has
                   ore and its army grows; with the ore gone nobody stays home inside ninety
                   seconds, and in three minutes the army is spent in the fight
     SAID ONCE     the player is told once, when the first wave of it goes */

var { Suite } = require('../lib/assert.js');
var { loadFast } = require('../lib/sandbox.js');

var S = new Suite('endgame');
var T0 = 240, HOLD = 90, REACH = 180;
/* two identical battles, both seats computer-played so the opponent has an army and a foe at T0 */
function battle() {
  var g = loadFast(['src/rules', 'src/core', 'src/sprites/props.js']);
  g._rtsNewGame(7, 'normal', { player: { ctl: 'ai', diff: 'normal' } });
  g.window._rtsUI = {};
  g.said = [];
  var say0 = g._rtsSay; g._rtsSay = function (m) { g.said.push(String(m)); return say0.apply(null, arguments); };
  return g;
}
function run(g, secs) { for (var i = 0; i < 60 * secs && !g._rtsG.over; i++) g._rtsTick(1 / 60); }
function count(g) { var G = g._rtsG, n = 0; for (var i = 0; i < G.scrap.length; i++) if (G.scrap[i] > 0) n++; return n; }
function fighters(g, side) { return g._rtsG.ents.filter(function (e) { return !e.dead && e.side === side && e.type === 'unit' && !g.rtsUnitDef(e.def).harvest; }); }
function tiles(g, a, b) { return Math.hypot(a.x - b.x, a.z - b.z) / g.RTS_TILE; }
/* the opponent's army: in a team, hunting, or idle at home */
function army(g) {
  var F = fighters(g, 'enemy'), yard = g._rtsHas('enemy', 'yard'), out = { total: F.length, team: 0, hunt: 0, away: 0, home: 0 };
  F.forEach(function (u) {
    if (u.sqd != null) out.team++;
    else if (u.order === 'amove' || u.order === 'attack') out.hunt++;
    else if (!yard || tiles(g, u, yard) >= 12) out.away = (out.away || 0) + 1;      /* out, and done moving: at the foe's base */
    else { out.home++; (out.homes = out.homes || []).push(u.def + ':' + (u.order || '-') + ':' + Math.round(100 * u.hp / u.maxHp) + '%' + (u.mend ? ':mend' : '') + ':' + (g._rtsMission(u).recruitable ? 'r' : 'x')); }
  });
  return out;
}
var A = battle(), B = battle(), C = battle();
run(A, T0); run(B, T0); run(C, T0);
var G = B._rtsG, left0 = B._rtsOreLeft();
S.ok('THE COUNT: _rtsOreLeft is the number of cells holding ore, and four minutes in there is plenty', left0 === count(B) && left0 > 100 && !B._rtsOreGone(), left0 + ' cells');
S.ok('CAN EARN: with a refinery, harvesters and ore the opponent can earn', B._rtsAIAs('enemy', function () { return B._rtsAICanEarn(); }) === true && !!B._rtsHas('enemy', 'refinery'), '');
function strip(g) { var G = g._rtsG; for (var i = 0; i < G.scrap.length; i++) { G.scrap[i] = 0; G.gems[i] = 0; } G.scrapDirty = true; }
strip(B); strip(C);
/* C: the ore gone and no team type this army can crew - the kill switch for the hunt on its own */
C._rtsSuggestTeam = function () { return null; };
var nextA = A._rtsG.ai.next;
run(B, 1 / 60); run(A, 1 / 60); run(C, 1 / 60);     /* the count is per tick */
S.ok('...and the ore gone, it cannot - refinery and harvesters or not', B._rtsOreLeft() === 0 && B._rtsOreGone() && B._rtsAIAs('enemy', function () { return B._rtsAICanEarn(); }) === false,
     JSON.stringify({ left: B._rtsOreLeft(), harv: B._rtsAIAs('enemy', function () { return B._rtsAIHarvesters(); }) }));
var before = army(A), saidAt = null, say1 = B._rtsSay;
B._rtsSay = function (m) { if (saidAt == null && /ore is gone/.test(String(m))) saidAt = B._rtsG.t; return say1.apply(null, arguments); };
/* the teams standing still with a gun, every five seconds of the ninety: the ore gone, none should */
function waiting(g) { var G = g._rtsG; return Object.keys(G.teams || {}).map(function (id) { return G.teams[id]; }).filter(function (t) { return t.type && g._rtsAIAs('enemy', function () { return g._rtsTeamMine(t); }) && !t.moving && g._rtsTeamLeader(t); }).length; }
var waitA = [], waitB = [];
for (var w5 = 0; w5 < HOLD; w5 += 5) { run(A, 5); run(B, 5); run(C, 5); waitA.push(waiting(A)); waitB.push(waiting(B)); }
var a1 = army(A), b1 = army(B), c1 = army(C);
/* both seats are computer-played, so both go: the measure is that nobody stays home and the army is
   spent in the fight - with ore it grows over the same ninety seconds */
S.ok('EVERYTHING: with ore the opponent keeps a garrison at home and its army grows; with the ore gone, inside ' + HOLD + ' s, nobody stays home and every fighter is on the way or there',
     a1.home >= 3 && a1.total >= before.total && b1.home <= 1 && (b1.team + b1.hunt + b1.away) >= b1.total - 1, JSON.stringify({ at240: before, ore: a1, gone: b1 }));
/* a team with a gun goes - none stands waiting for members that will never be bought, nor stops to
   regroup for them - at any of the eighteen looks; with the ore, teams wait to fill */
S.ok('...its teams go as they are - at no look in the ninety seconds does one with a gun stand waiting, where with the ore some do', Math.max.apply(null, waitB) === 0 && Math.max.apply(null, waitA) >= 1,
     JSON.stringify({ gone: waitB.join(' '), ore: waitA.join(' ') }));
S.ok('...and with no team type its army can crew, the whole of it hunts instead - nobody is left at home', c1.total >= 3 && c1.team === 0 && c1.home === 0 && c1.hunt + c1.away >= c1.total - 1, JSON.stringify(c1));
S.ok('...the word comes inside thirty seconds of the ore going, not at the next wave', saidAt != null && saidAt - T0 <= 30 && nextA > 30, JSON.stringify({ saidAt: saidAt, nextWaveWas: Math.round(nextA) }));
run(A, REACH - HOLD); run(B, REACH - HOLD);
var a2 = army(A), b2 = army(B);
S.ok('...and at ' + REACH + ' s still nobody is home and the army is spent in the fight - under 40% of it left, and under half of what the opponent with ore still has - where with the ore the garrison stands',
     b2.home <= 1 && a2.home >= 3 && b2.total <= before.total * 0.4 && b2.total < a2.total / 2, JSON.stringify({ at240: before.total, ore: a2, gone: b2 }));
var told = B.said.filter(function (m) { return /The ore is gone/.test(m); });
S.ok('SAID ONCE: the player is told once, by the opponent', told.length === 1 && /coming with everything/.test(told[0]) && A.said.filter(function (m) { return /ore is gone/.test(m); }).length === 0, JSON.stringify(told));

require('../lib/report.js')(S);
