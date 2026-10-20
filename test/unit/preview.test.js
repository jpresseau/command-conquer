/* THE MAP BEFORE THE BATTLE, the pure half (preview.js):

     THE PICTURE   one pixel a cell: water reads blue, ore gold, and each seat's start is a square
                   of its colour - on the battle _rtsNewGame built, as the title builds it
     THE SEED      rolls in 1..65535, never 0 (0 would mean "none" to rtsOpen), and not the same
                   every time */

var { Suite } = require('../lib/assert.js');
var { loadFast } = require('../lib/sandbox.js');

var S = new Suite('preview');
var g = loadFast(['src/rules', 'src/core', 'src/sprites/props.js', 'src/preview.js']);
g.window.Math = Math;
g._rtsNewGame(7, 'normal', { skirmish: { foes: 'team' } });
var G = g._rtsG, N = g.RTS_N, px = g._rtsMapThumb(G);
function at(tx, tz) { var j = (tz * N + tx) * 4; return [px[j], px[j + 1], px[j + 2]]; }
var water = [], ore = [];
for (var i = 0; i < N * N; i++) { if (G.terrain[i] === g.RTS_T_WATER) water.push(i); if (G.scrap[i] > 0) ore.push(i); }
S.ok('THE PICTURE: one pixel a cell', px.length === N * N * 4 && water.length > 200 && ore.length > 50, px.length + ' bytes, ' + water.length + ' water cells, ' + ore.length + ' ore');
S.ok('...water reads blue', water.every(function (i) { return px[i * 4 + 2] > px[i * 4] && px[i * 4 + 2] > px[i * 4 + 1]; }), '');
var oreGold = ore.filter(function (i) { return px[i * 4] > 150 && px[i * 4 + 1] > 110 && px[i * 4 + 2] < 120; }).length;
S.ok('...ore gold (gems violet)', oreGold >= ore.length * 0.6, oreGold + ' of ' + ore.length);
var seats = G.order.map(function (k) { var s = G.starts[k]; return k + ':' + at(s.tx, s.tz).join(','); });
S.ok('...and each of the four seats\' starts is a square of its colour', seats.join(' ') === 'player:96,160,255 enemy:255,96,80 ally:96,210,120 enemy2:240,180,60', seats.join(' '));

var seeds = [];
for (var k = 0; k < 6; k++) seeds.push(g.rtsSeedRoll());
S.ok('THE SEED: rolls in 1..65535, never 0, and not the same every time', seeds.every(function (s) { return s >= 1 && s <= 65535 && s === (s | 0); }) &&
     new Set(seeds).size >= 2 && g.rtsSeedNext() === seeds[5], seeds.join(' '));

require('../lib/report.js')(S);
