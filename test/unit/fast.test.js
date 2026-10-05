/* THE FAST LOADER RUNS THE SAME GAME (test/lib/sandbox.js loadFast).

   loadFast evaluates the game's sources in a vm context whose global is an ordinary object
   (vm.constants.DONT_CONTEXTIFY) instead of the interceptor-backed sandbox load() builds, and a
   battle stepped through it runs 6-8 times faster. That speed is only worth having if it is the
   same game: everything measured through it - the fingerprints, self-play balance - rests on the
   two loaders agreeing. So the same battle is stepped through both and fingerprinted every 15 s,
   and the fast one is held to the shims the slow one promises: a document that throws, its own
   localStorage, and no globals leaking between two loads. */

var { Suite } = require('../lib/assert.js');
var { load, loadFast } = require('../lib/sandbox.js');
var { battle } = require('../lib/fingerprint.js');

var S = new Suite('fast');
var SRC = ['src/rules', 'src/core', 'src/sprites/props.js'];
var cfg = { seed: 9001, diff: 'normal', army: 'allied', secs: 45, every: 15, keep: true };

var t0 = Date.now(), slow = battle(load(SRC), cfg).marks, tSlow = Date.now() - t0;
t0 = Date.now(); var fast = battle(loadFast(SRC), cfg).marks, tFast = Date.now() - t0;
S.ok('the same battle stepped through both loaders is the same battle, sample for sample',
     slow.length === 3 && slow.join() === fast.join(), slow.join(' ') + (slow.join() === fast.join() ? '' : ' vs ' + fast.join(' ')));
/* at least three times: a context made from a plain {} is a contextified sandbox again, and runs
   within a few percent of load() - "faster" alone passed it */
S.ok('...and the fast one is at least three times faster', tFast * 3 < tSlow, tFast + ' ms against ' + tSlow + ' ms');

var a = loadFast(SRC), b = loadFast(SRC), threw = null;
try { a.document.body; } catch (e) { threw = e.message; }
S.ok('its document throws, as the slow loader\'s does', /must not touch the DOM/.test(threw || ''), threw);
a.localStorage.setItem('k', 'v');
a._rtsNewGame(7, 'normal');
S.ok('two loads share nothing: storage, game state', b.localStorage.getItem('k') === null && !b._rtsG && !!a._rtsG,
     'b storage ' + b.localStorage.getItem('k') + ', b game ' + (b._rtsG ? 'present' : 'none'));

require('../lib/report.js')(S);
