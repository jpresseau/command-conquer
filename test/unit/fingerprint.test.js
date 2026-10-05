/* THE GAME DID NOT CHANGE. A fingerprint (test/lib/fingerprint.js) of four whole battles, sampled
   every 30 s of game time, compared with test/fixtures/fingerprint.json.

   This is the check a refactor is held to. The computer opponent is about to be made able to play
   any seat - for self-play balance, a second opponent and an ally - which means threading a seat
   through some ninety functions that name 'enemy' and 'player' today. A refactor like that is
   supposed to change nothing, and the only convincing evidence of "nothing" is the whole state of
   several real battles, every unit's order, target and position, every team and what it is doing,
   compared value for value. A summary can agree while the battles differ.

   The four cover the three difficulties and both armies. In two the player does the obvious things
   (test/lib/fingerprint.js pusher: a base, harvesters, guns, an army that pushes), because almost
   everything the opponent decides ABOUT the player - how big a base to build against it, whose
   harvesters to raid, what defences to answer - never runs against an idle one: a refactor slip
   that doubled the player's buildings in the opponent's base plan survived an idle-only record.
   In three the player's buildings are held at full health (KEEP), so the battle is not over at
   minute four and the opponent goes on raising teams and attacking for five minutes. The fourth
   is left to run its course, so the end of a battle is in the record too.

   AN INTENDED CHANGE TO WHAT THE GAME DOES moves these hashes, and that is what they are for:
   rewrite the fixture with FINGERPRINT_WRITE=1 in the same commit, and say in that commit why the
   battles changed. A change that was meant to be a refactor and moves them is a bug.

   Two controls, because a check that can pass over nothing is not a check: the battles really
   are battles (teams raised, an attack launched, a dozen kinds of unit), and a change of one hit
   point to one weapon moves the fingerprint. */

var fs = require('fs'), path = require('path');
var { Suite } = require('../lib/assert.js');
var { loadFast, ROOT } = require('../lib/sandbox.js');
var { battle } = require('../lib/fingerprint.js');

var S = new Suite('fingerprint');
var FIX = path.join(ROOT, 'test', 'fixtures', 'fingerprint.json');
var SRC = ['src/rules', 'src/core', 'src/sprites/props.js'];
var BATTLES = [
  { name: 'normal, Compact, a player who builds', seed: 9001, diff: 'normal', army: 'allied', secs: 300, keep: true, push: true },
  { name: 'hard, Dominion, a player who builds',  seed: 9002, diff: 'hard',   army: 'soviet', secs: 240, keep: true, push: true },
  { name: 'easy, Compact, kept',     seed: 9003, diff: 'easy',   army: 'allied', secs: 300, keep: true },
  { name: 'normal, Dominion, to the end', seed: 7, diff: 'normal', army: 'soviet', secs: 300, keep: false }
];

var got = {}, pop = {};
BATTLES.forEach(function (b) {
  var g = loadFast(SRC), t0 = Date.now();
  var r = battle(g, b), G = g._rtsG;
  got[b.name] = r.marks;
  pop[b.name] = { secs: Math.round(G.t), over: r.over, teams: G.teamSeq || 0, waves: G.ai.wave,
                  kinds: r.kinds.filter(function (k) { return /^enemy:/.test(k); }).length, ms: Date.now() - t0 };
});

if (process.env.FINGERPRINT_WRITE) {
  fs.writeFileSync(FIX, JSON.stringify(got, null, 1) + '\n');
  S.note('wrote ' + path.relative(ROOT, FIX));
}
var want = JSON.parse(fs.readFileSync(FIX, 'utf8'));

S.ok('the record covers every battle, and every battle in it is run', Object.keys(want).sort().join('|') === Object.keys(got).sort().join('|'),
     Object.keys(got).join(', '));
BATTLES.forEach(function (b) {
  var a = got[b.name] || [], w = want[b.name] || [], at = -1;
  for (var i = 0; i < Math.max(a.length, w.length); i++) if (a[i] !== w[i]) { at = i; break; }
  S.ok('the battle "' + b.name + '" (seed ' + b.seed + ') plays out exactly as recorded', at < 0 && a.length > 0,
       at < 0 ? a.length + ' samples to ' + pop[b.name].secs + ' s, ' + pop[b.name].ms + ' ms'
              : 'first differs at sample ' + at + ' (' + ((at + 1) * 30) + ' s): ' + a[at] + ' vs recorded ' + w[at]);
});

/* the population: these are battles worth fingerprinting */
var kept = BATTLES.filter(function (b) { return b.keep; });
S.ok('...and they are real battles: in each kept one the opponent raised teams, sent a wave and fielded a dozen kinds of unit and building',
     kept.every(function (b) { var p = pop[b.name]; return p.teams >= 3 && p.waves >= 1 && p.kinds >= 12; }),
     JSON.stringify(kept.map(function (b) { var p = pop[b.name]; return [b.seed, p.teams, p.waves, p.kinds]; })));
S.ok('...and the battle left to run its course ends', pop[BATTLES[3].name].over === 'lose', JSON.stringify(pop[BATTLES[3].name]));

/* the control: one hit point on one weapon moves it */
/* The Battle Tank's gun, in the first battle, where the player's tanks meet the first wave at about
   three and a half minutes: nothing fires before then on that seed. */
var g2 = loadFast(SRC), w0 = 'cannon';
g2.RTS_WEAPONS[w0].dmg += 1;
var before = got[BATTLES[0].name].slice(0, 8);
var after = battle(g2, Object.assign({}, BATTLES[0], { secs: 240 })).marks;
S.ok('the control: one more hit point on one weapon (' + w0 + ') moves the fingerprint', before.length === 8 && before.join() !== after.join(),
     before.slice(-1) + ' -> ' + after.slice(-1));

require('../lib/report.js')(S);
