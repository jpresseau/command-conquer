/* Load game source files into a plain node context so their pure parts can be unit-tested.

   The game is written as browser globals concatenated by build.py - there is no module system
   to import from. But most of what is worth unit-testing (the rules tables, the save encoder,
   the cost and rate arithmetic) touches no DOM at all; it just happens to live in a file that
   assumes `window` exists. So the files are evaluated in a vm context with a shim thin enough
   that anything reaching for a real browser API fails loudly rather than silently returning
   undefined and making a test pass for the wrong reason.

   This is deliberately NOT a way to test rendering, input or anything that needs layout. Those
   belong in test/e2e, against the real built page. If a test needs a canvas, it is in the wrong
   directory. */

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.resolve(__dirname, '..', '..');

/* Every source the page inlines, in the order it inlines them - read out of the skeleton
   rather than listed here, for the same reason build.py discovers its own list: a hand-written
   copy falls behind the moment a file is added, and the way it fails is a test that quietly
   stops covering something.

   Subsystems are directories now (src/core, src/rules, ...), so a spec names the directory and
   gets every part of it, in load order. That is the whole point: splitting rts.core.js into
   twenty files must not mean twenty paths in twenty specs, each of which can go stale. */
var _INC = null;
function sources() {
  if (_INC) return _INC;
  var sk = fs.readFileSync(path.join(ROOT, 'src', 'index.skeleton.html'), 'utf8');
  var re = /@@(?:INC|CSS):([\w./-]+)@@/g, m, out = [];
  while ((m = re.exec(sk))) {
    if (!/\.js$/.test(m[1])) continue;
    out.push(path.relative(ROOT, path.resolve(ROOT, 'src', m[1])));
  }
  return (_INC = out);
}

/* A path that is a directory expands to its sources in load order; a file stays itself. */
function expand(rel) {
  var full = path.join(ROOT, rel);
  if (fs.existsSync(full) && fs.statSync(full).isDirectory()) {
    var pre = rel.replace(/\/*$/, '') + path.sep;
    var hit = sources().filter(function (s) { return s.indexOf(pre) === 0; });
    if (!hit.length) throw new Error(rel + ' is not inlined by the skeleton');
    return hit;
  }
  return [rel];
}

/* The concatenated text of a source or a whole subsystem. For the handful of assertions that
   are about what the source SAYS - a name that must appear, a call that must not - rather than
   about what it does. */
function read(rel) {
  return expand(rel).map(function (f) {
    return fs.readFileSync(path.join(ROOT, f), 'utf8');
  }).join('\n');
}

/* The globals every game file may reach for, on whatever object will be the context's global. */
function _shim(g, extra) {
  var base = {
    console: console, Math: Math, JSON: JSON, Date: Date,
    Uint8Array: Uint8Array, Uint16Array: Uint16Array, Uint32Array: Uint32Array,
    Int32Array: Int32Array, Float32Array: Float32Array, Float64Array: Float64Array,
    ArrayBuffer: ArrayBuffer, DataView: DataView, Set: Set, Map: Map,
    isNaN: isNaN, parseInt: parseInt, parseFloat: parseFloat,
    setTimeout: function () { return 0; }, clearTimeout: function () {},
    /* Real base64, not a stub - the save encoder puts typed arrays through it and a test that
       round-trips a save has to get the same bytes back that a browser would produce. */
    btoa: function (s) { return Buffer.from(s, 'binary').toString('base64'); },
    atob: function (s) { return Buffer.from(s, 'base64').toString('binary'); },
    /* localStorage, because several of these files read a preference at call time. A plain
       object is enough and keeps the test in charge of what is stored. */
    _store: {}
  };
  for (var b in base) g[b] = base[b];
  g.window = g;
  g.globalThis = g;
  g.localStorage = {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(g._store, k) ? g._store[k] : null; },
    setItem: function (k, v) { g._store[k] = String(v); },
    removeItem: function (k) { delete g._store[k]; }
  };
  /* Anything DOM-shaped throws rather than returning a convincing null: a unit test that
     silently exercises a stub is worse than one that refuses to run. */
  g.document = new Proxy({}, {
    get: function (_t, prop) {
      throw new Error('unit tests must not touch the DOM (document.' + String(prop) +
                      ') — that belongs in test/e2e');
    }
  });
  if (extra) for (var k in extra) g[k] = extra[k];
  return g;
}
function _run(files, ctx) {
  var flat = [];
  files.forEach(function (rel) { flat = flat.concat(expand(rel)); });
  flat.forEach(function (rel) {
    var src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    try { vm.runInContext(src, ctx, { filename: rel }); }
    catch (e) { throw new Error('loading ' + rel + ': ' + e.message); }
  });
}

function load(files, extra) {
  var sandbox = _shim({}, extra);
  var ctx = vm.createContext(sandbox);
  _run(files, ctx);
  return sandbox;
}

/* THE SAME SOURCES, WITH AN ORDINARY GLOBAL - for battles stepped for minutes on end. A context
   made from a sandbox object puts an interceptor between every global the game declares and every
   read of one, and this game is nothing but globals: a battle stepped through load() runs 6-8x
   slower than the same battle in a browser, so a few hundred of them would take days.
   vm.constants.DONT_CONTEXTIFY (node 22.8 and later) makes the context's global a plain object
   instead. Same shims, same order, same throwing document, and the same results: test/unit/fast
   holds the two loaders to identical battles. */
function loadFast(files, extra) {
  if (!vm.constants || vm.constants.DONT_CONTEXTIFY === undefined) throw new Error('loadFast needs node 22.8 or later');
  var ctx = vm.createContext(vm.constants.DONT_CONTEXTIFY);
  var g = _shim(vm.runInContext('globalThis', ctx), extra);
  _run(files, ctx);
  return g;
}

module.exports = { load: load, loadFast: loadFast, read: read, sources: sources, expand: expand, ROOT: ROOT };
