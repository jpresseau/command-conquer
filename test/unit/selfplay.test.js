/* THE COMPUTER PLAYS EITHER SEAT (core/seats.js), so it can play itself - self-play balance, and
   later a second opponent or an ally.

   The opponent's brain was written from one seat's point of view and named it 'enemy' about a
   hundred and fifty times; it now says _rtsAIOn and _rtsAIFoe(), and _rtsUpdateAI runs every
   computer seat in turn with _rtsAIOn set to it. unit/fingerprint holds the shipped game - one
   computer seat - to the byte. This holds the other half: that a second brain on the player's
   seat is a whole brain of its own, and not the opponent's leaking through.

   HOW IT WAS PROVED BEFORE IT WAS PINNED. The refactor was checked against a label-swap harness
   run on the unmodified code: it ran the real brain a second time each tick with every side label
   in the game swapped, and dispatched the four hooks the simulation calls the brain through. That
   defines what a perfectly side-generic brain does with two seats. On three seeds (normal against
   normal, hard against hard, easy against normal), five and four minutes each, the refactored game
   fingerprinted identically to it at every sample - once the harness was corrected for the two
   things its swap could not reach (a unit delivered under the swap faced the wrong way; an
   attacker already removed from the entity list kept its real label). The battle below is that
   comparison's first seed, recorded in test/fixtures/selfplay.json.

   And the parts the fingerprint cannot name: each seat's teams belong to it and fight the other
   seat, the brains are two objects, a building hit tells its own seat's brain, and a save keeps
   both brains and plays on exactly as if it had never been saved. */

var fs = require('fs'), path = require('path');
var { Suite } = require('../lib/assert.js');
var { loadFast, ROOT } = require('../lib/sandbox.js');
var { battle, fingerprint } = require('../lib/fingerprint.js');

var S = new Suite('selfplay');
var FIX = path.join(ROOT, 'test', 'fixtures', 'selfplay.json');
var SRC = ['src/rules', 'src/core', 'src/sprites/props.js'];
var CFG = { seed: 9001, diff: 'normal', self: 'normal', army: 'allied', secs: 240 };

var g = loadFast(SRC), r = battle(g, CFG), G = g._rtsG;
if (process.env.FINGERPRINT_WRITE) fs.writeFileSync(FIX, JSON.stringify({ 'normal against normal': r.marks }, null, 1) + '\n');
var want = JSON.parse(fs.readFileSync(FIX, 'utf8'))['normal against normal'];
S.ok('self-play on seed 9001 plays out exactly as recorded', r.marks.join() === want.join(),
     r.marks.length + ' samples' + (r.marks.join() === want.join() ? '' : ': ' + r.marks.join(' ') + ' vs ' + want.join(' ')));

var teams = { player: [], enemy: [] }, k;
for (k in G.teams) (teams[G.teams[k].side] || (teams[G.teams[k].side] = [])).push(G.teams[k]);
S.ok('both seats are the computer\'s, each with a brain of its own',
     G.sides.player.ctl === 'ai' && G.sides.enemy.ctl === 'ai' && G.sides.player.ai && G.sides.enemy.ai && G.sides.player.ai !== G.sides.enemy.ai,
     JSON.stringify([G.sides.player.ctl, G.sides.enemy.ctl]));
S.ok('...and both raised teams and went to war', G.sides.player.ai.wave >= 1 && G.sides.enemy.ai.wave >= 1 && G.teamSeq >= 6,
     'waves ' + G.sides.player.ai.wave + ' / ' + G.sides.enemy.ai.wave + ', ' + G.teamSeq + ' teams raised');
var all = teams.player.concat(teams.enemy), wrong = all.filter(function (t) {
  return t.members.some(function (m) { return m.side !== t.side; }) || (t.target && !t.target.dead && t.target.side === t.side);
});
S.ok('every team is made of its own seat\'s units and goes for the other seat',
     all.length >= 2 && teams.player.length >= 1 && teams.enemy.length >= 1 && !wrong.length,
     all.length + ' live teams (' + teams.player.length + ' player, ' + teams.enemy.length + ' enemy)' + (wrong.length ? ', wrong: ' + wrong.map(function (t) { return t.side + ' ' + t.type.name; }).join(', ') : ''));

/* the hooks: a building hit tells its own seat's brain */
var pb = G.ents.filter(function (e) { return !e.dead && e.side === 'player' && e.type === 'struct'; })[0];
G.sides.player.ai.lastHit = -999; G.sides.enemy.ai.lastHit = -999;
g._rtsAttacked('player');
S.ok('an attack on the player\'s seat is noted by the player\'s brain, not the opponent\'s',
     !!pb && G.sides.player.ai.lastHit === G.t && G.sides.enemy.ai.lastHit === -999, JSON.stringify([G.sides.player.ai.lastHit, G.sides.enemy.ai.lastHit, G.t]));

/* a save keeps both brains, and plays on as if never saved */
var SAVE = SRC.concat(['src/rts.save.js']);
var g1 = loadFast(SAVE); battle(g1, Object.assign({}, CFG, { secs: 150 }));
var body = JSON.parse(JSON.stringify(g1._rtsSaveState(g1._rtsG)));
var g2 = loadFast(SAVE); g2.window._RTS_ARMY = 'allied'; g2._rtsNewGame(CFG.seed, CFG.diff); g2._rtsApplyState(g2._rtsG, body);
var a = [], b = [];
for (var i = 1; i <= 60 * 60; i++) {
  g1._rtsTick(1 / 60); g2._rtsTick(1 / 60);
  if (i % 1800 === 0) { a.push(fingerprint(g1)); b.push(fingerprint(g2)); }
}
S.ok('a save taken mid-battle keeps both brains and plays on exactly as the unsaved battle does',
     g2._rtsG.sides.player.ctl === 'ai' && !!g2._rtsG.sides.player.ai && a.join() === b.join() && a.length === 2,
     a.join(' ') + (a.join() === b.join() ? '' : ' vs ' + b.join(' ')));
S.ok('...and the save holds each brain once, on its seat, never under the old names',
     body.ai === undefined && body.teamHold === undefined && !!body.sides.player.ai && !!body.sides.enemy.ai, Object.keys(body.sides.player).join(','));

require('../lib/report.js')(S);
