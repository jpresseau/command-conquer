/* The save format's pure parts: the checksum, the version stamp, and the encoder.

   All three had defects that cost players their battles, and all three are testable without a
   browser - which is the argument for this file existing. The version stamp bug in particular
   was a pure arithmetic mistake that any test computing the stamp at two points in the cycle
   would have caught. */

var path = require('path');
var { Suite } = require('../lib/assert.js');
var { load } = require('../lib/sandbox.js');

var S = new Suite('save');
var g = load(['src/rts.rules.js', 'src/rts.save.js']);

/* ---------------------------------------------------------------- checksum ---- */
S.ok('hash is stable', g._rtsHash('the quick brown fox') === g._rtsHash('the quick brown fox'),
     String(g._rtsHash('the quick brown fox')));
S.ok('hash changes on a one-character edit',
     g._rtsHash('abcdefghij') !== g._rtsHash('abcdefghIj'),
     g._rtsHash('abcdefghij') + ' vs ' + g._rtsHash('abcdefghIj'));
S.ok('hash changes on a transposition',
     g._rtsHash('ab') !== g._rtsHash('ba'), g._rtsHash('ab') + ' vs ' + g._rtsHash('ba'));
S.eq('hash of the empty string is defined', typeof g._rtsHash(''), 'number');
/* The save's length check runs before the hash, so the hash only has to catch same-length
   edits - which is exactly the case a truncation check cannot see. */
(function () {
  var a = 'x'.repeat(5000), b = a.slice(0, 2500) + 'y' + a.slice(2501);
  S.ok('hash catches a single flipped byte in 5000', g._rtsHash(a) !== g._rtsHash(b));
})();

/* ------------------------------------------------------------ version stamp ----
   THE BUG THIS FILE EXISTS FOR. The stamp folded in RTS_N, which holds the map's size only
   while a battle is running - so a stamp written inside a battle could never be recomputed
   outside one, and every save made on a real map was rejected on the next visit with the
   title screen blaming a version change that had not happened. */
(function () {
  var outside = g._rtsSaveVersion();
  g.window._RTS_MAP = { n: 96 };                       /* a real map is loaded */
  var withMap = g._rtsSaveVersion();
  var savedRTSN = g.RTS_N;
  g.RTS_N = 96;                                        /* ...and now the battle is running */
  var inBattle = g._rtsSaveVersion();
  g.RTS_N = savedRTSN;                                 /* _rtsMapAssemble puts it back */
  var afterBattle = g._rtsSaveVersion();

  S.ok('a 96-tile map moves the stamp off the 128 default', withMap !== outside,
       'default ' + outside + ', with the map ' + withMap);
  S.eq('the stamp is the same inside the battle as out', inBattle, withMap);
  S.eq('and the same again once RTS_N has been put back', afterBattle, withMap);
  g.window._RTS_MAP = null;
  S.eq('with no map it falls back to RTS_N', g._rtsSaveVersion(), outside);
})();

/* The stamp's actual job: reject a save whose shape no longer matches the code. */
(function () {
  var before = g._rtsSaveVersion();
  g.RTS_UNITS.push({ key: '__probe', name: 'probe' });
  var after = g._rtsSaveVersion();
  g.RTS_UNITS.pop();
  S.ok('adding a unit invalidates old saves', before !== after, before + ' -> ' + after);
})();

/* ----------------------------------------------------------------- encoder ----
   _rtsCode walks live game state into JSON. Two things must never happen: a DOM node must not
   be followed (with the player's artwork loaded, a death effect holds <canvas> elements whose
   attributes lead back to the canvas, which used to throw mid-save), and a genuine reference
   cycle in game state must still be caught rather than looping forever. */
(function () {
  var ents = new Map(), statics = new Map();
  function code(v) { return g._rtsCode(v, ents, statics, [], '$'); }

  S.eq('numbers survive', code(42), 42);
  S.eq('strings survive', code('hi'), 'hi');
  S.eq('functions are dropped', code(function () {}), null);
  S.eq('undefined becomes null', code(undefined), null);
  S.eq('a nested plain object survives',
       JSON.stringify(code({ a: 1, b: { c: [1, 2, 3] } })), '{"a":1,"b":{"c":[1,2,3]}}');
  S.eq('a typed array round-trips as a tagged blob', code(new Uint8Array([1, 2, 3])).__ta, 'Uint8Array');
  S.eq('the `mesh` renderer handle is dropped', code({ mesh: { big: 1 }, x: 5 }).mesh, undefined);

  /* A fake DOM node: the guard is `instanceof Node`, so the test supplies a Node class the
     same way a browser would. This is the exact shape that used to throw - a canvas whose
     attribute list points back at the canvas. */
  function Node() {}
  var fakeCanvas = new Node();
  fakeCanvas.width = 8;
  fakeCanvas.attributes = [{ ownerElement: fakeCanvas }];
  g.Node = Node;
  S.eq('a DOM node is dropped rather than followed', code(fakeCanvas), null);
  S.eq('and dropped from inside an effect, where it actually appeared',
       JSON.stringify(code({ kind: 'die', t: 0.5, seq: [fakeCanvas, fakeCanvas] })),
       '{"kind":"die","t":0.5,"seq":[null,null]}');

  /* The cycle detector still has to work on real state - dropping nodes must not have
     disarmed it, because a genuine cycle is a bug worth failing loudly on. */
  var loop = { name: 'a' }; loop.self = loop;
  S.throws('a genuine reference cycle still throws', function () { code(loop); }, /cycle/);

  /* Sharing an object twice is not a cycle and must not be mistaken for one. */
  var shared = { v: 1 };
  S.eq('the same object twice in a row is not a cycle',
       JSON.stringify(code({ a: shared, b: shared })), '{"a":{"v":1},"b":{"v":1}}');
})();

module.exports = S;
require('../lib/report.js')(S);
