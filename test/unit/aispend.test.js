/* THE OPPONENT'S UNIT LINES SPEND THE SURPLUS, NOT THE PLAN'S MONEY (core/ai.js _rtsAIUnits,
   core/aisupers.js _rtsAISpare), staged on a real generated map:

     ONE SURPLUS   a credit over what the base plan is saving for buys one thing, not one on every
                   line: a job is paid as it builds, so the bank has not moved when the next line
                   is asked, and each line counts what the lines before it committed
     A BIG BANK    still buys on every line it has (the population: with two lines open, two) */

var { Suite } = require('../lib/assert.js');
var { load } = require('../lib/sandbox.js');

var S = new Suite('aispend');
var g = load(['src/rules', 'src/core', 'src/sprites/props.js']);

g._rtsNewGame(9001, 'normal');
var G = g.window._rtsG;
G.over = null;
G.ents.forEach(function (e) { if (e.type === 'unit') e.dead = true; });
g._rtsTick(1 / 30);
G.teams = {};
var E = G.sides.enemy, ey = g._rtsHas('enemy', 'yard');
/* harvesters first, or the pass tops them up and buys nothing else */
for (var h = 0; h < 3; h++) g._rtsSpawnUnit('enemy', 'harvester', ey.x + h * 4, ey.z + 30);
function lines(credits) {
  E.q = {}; E.credits = credits; E.ore = 0;
  g._rtsAIUnits(E);
  return Object.keys(E.q).filter(function (k) { return k !== 'struct' && E.q[k]; });
}
var big = lines(1e6);
S.ok('(the population: with a big bank the opponent buys on every line it has, two or more)', big.length >= 2, big.join(', '));
var spare = g._rtsAISpare(E), one = [];
for (var r = 0; r < 40; r++) one.push(lines(spare + 1).length);
S.ok('ONE SURPLUS: a credit over what the plan is saving for buys one thing, never one on every line',
     one.every(function (n) { return n === 1; }), 'spare ' + spare + '; lines bought per pass: ' + one.join(''));

require('../lib/report.js')(S);
