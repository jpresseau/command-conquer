/* MEDALS (core/campaign.js _rtsMissionMedal, src/campaign.js rtsCampBetter), by the rule:

     NONE       no record, or a loss
     BRONZE     won below the level the mission was written at
     SILVER     won at the written level or above, but not gold
     GOLD       won at the top level the mission offers, inside its par where it has one; a record
                from before levels was won at the written level
     THE BEST   the harder level, then the faster time - which puts the higher medal first by itself,
                since a medal follows from the level and the par */

var { Suite } = require('../lib/assert.js');
var { loadFast } = require('../lib/sandbox.js');

var S = new Suite('campaign-medals');
var g = loadFast(['src/rules', 'src/core', 'src/campaign.js']);
var fog = g._rtsMissionOf('fogbank'), chan = g._rtsMissionOf('channel'), mir = g._rtsMissionOf('mirror'), M = g._rtsMissionMedal;
function w(lvl, secs) { return { won: true, lvl: lvl, secs: secs }; }

S.ok('the three used here are as the rule needs them: Fog Bank written at Soldier with a par, the Channel to Veteran with none, Mirror Line from Recruit to Soldier with one',
     fog.diff === 'normal' && !fog.top && fog.par === 150 && chan.top === 'hard' && !chan.par && mir.diff === 'easy' && mir.top === 'normal' && mir.par === 480, '');
S.ok('NONE: no record, or a loss', M(fog, null) === 0 && M(fog, { won: false, secs: 90 }) === 0, '');
S.ok('BRONZE: won below the written level', M(fog, w('easy', 60)) === 1 && M(chan, w('regular', 480)) === 1, '');
S.ok('SILVER: at the written level over par, or above it short of the top', M(fog, w('normal', 200)) === 2 && M(chan, w('normal', 480)) === 2 && M(mir, w('regular', 100)) === 2 && M(mir, w('normal', 500)) === 2, '');
S.ok('GOLD: at the top level inside the par, or at a top with no par', M(fog, w('normal', 120)) === 3 && M(fog, { won: true, secs: 100 }) === 3 && M(chan, w('hard', 480)) === 3 && M(mir, w('normal', 400)) === 3, '');
S.ok('...and a win at the written level inside the par is still silver where a harder level is offered', M(mir, w('easy', 200)) === 2, '');
S.ok('what gold asks, in words', g._rtsMissionGold(fog) === 'Gold: Soldier inside 2:30' && g._rtsMissionGold(chan) === 'Gold: Veteran' && g._rtsMissionGold(mir) === 'Gold: Soldier inside 8:00',
     [g._rtsMissionGold(fog), g._rtsMissionGold(chan), g._rtsMissionGold(mir)].join(' | '));
S.ok('THE BEST: a higher level over a faster lower one, and the faster time at the same level - so a gold over a faster silver, and a faster gold over a gold',
     g.rtsCampBetter(w('normal', 140), w('normal', 110 + 60), fog) === true && g.rtsCampBetter(w('normal', 140), w('normal', 120), fog) === false &&
     g.rtsCampBetter(w('hard', 480), w('normal', 480), chan) === true && g.rtsCampBetter(w('normal', 480), w('hard', 480), chan) === false, '');

require('../lib/report.js')(S);
