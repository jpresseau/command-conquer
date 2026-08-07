/* The service worker's contract, read off the file itself.

   e2e/swupdate proves the behaviour: a new deploy reaches the player, nothing is cached, an
   updated worker takes over a page that is still open. It proves it for the requests it makes,
   though, and that is the gap this closes. A worker that called respondWith for SOME requests -
   only images, say, or only when the network is slow - would satisfy every assertion over there
   and still be a caching worker, and the day it answered a stale one would be the day it pinned
   every player to an old build.

   sw.js states its contract in the first person: "We never call respondWith(), so every request
   falls through to the network - no stale content." That is a claim about the SOURCE, not about
   one request, so it is checked against the source. A static check earns its place here for
   exactly the reason it usually does not: the property is universal, and no finite set of
   requests can establish it.

   The manifest gets the same treatment for the same reason. The app is deployed under a path
   (jpresseau.github.io/command-conquer/), so every URL in it has to be relative; an absolute one
   resolves to the host root, 404s, and produces a manifest that inspects clean and refuses to
   install. e2e/swupdate catches that by fetching from a subpath, which is the real proof - this
   just fails in a millisecond with the offending key named. */

var fs = require('fs');
var path = require('path');
var { Suite } = require('../lib/assert.js');

var S = new Suite('sw');
var ROOT = path.resolve(__dirname, '..', '..');
var sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

/* Comments describe the contract; code has to keep it. Stripping them first is the difference
   between reading the file and reading what it does - the word respondWith appears twice in
   sw.js's own prose, explaining that it is never called. */
var code = sw.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

/* ------------------------------------------------------------- the contract ---- */
S.ok('the worker never calls respondWith - every request falls through to the network',
     !/\brespondWith\b/.test(code),
     /\brespondWith\b/.test(code) ? 'respondWith appears in sw.js' : 'no respondWith anywhere');
S.ok('...and never opens a cache', !/\bcaches\b/.test(code),
     /\bcaches\b/.test(code) ? 'the Cache API is referenced' : 'no reference to the Cache API');
S.ok('...and stores nothing itself', !/\bindexedDB\b|\blocalStorage\b/.test(code),
     'no storage APIs in the worker');

/* A registered fetch handler is what makes the app install-eligible, so the handler has to be
   there even though it does nothing. Deleting it as dead code is the obvious mistake, and the
   symptom is not an error - it is the install option quietly disappearing. */
S.ok('a fetch handler is registered, because that is an install criterion',
     /addEventListener\(\s*['"]fetch['"]/.test(code), 'fetch listener present');
S.ok('the worker activates immediately rather than waiting for every tab to close',
     /skipWaiting\s*\(/.test(code), 'skipWaiting called');
S.ok('...and claims the pages already open',
     /clients\.claim\s*\(/.test(code), 'clients.claim called');

/* ------------------------------------------------------------- the manifest ----
   Everything here has to resolve relative to the deploy directory. */
var man = null, manErr = null;
try { man = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8')); }
catch (e) { manErr = e.message; }
S.ok('the manifest is valid JSON', !!man, manErr || 'parses');

if (man) {
  ['name', 'short_name', 'start_url', 'scope', 'display', 'icons'].forEach(function (k) {
    S.ok('the manifest has ' + k, man[k] != null && man[k] !== '',
         typeof man[k] === 'object' ? '(present)' : String(man[k]));
  });
  S.eq('display is standalone, or it installs as a browser tab', man.display, 'standalone');

  /* The install criterion is an icon of at least 192px; 512 is what the launcher and the
     splash screen use, and without it the app installs with a blurry icon. */
  var sizes = (man.icons || []).map(function (i) { return parseInt(i.sizes, 10) || 0; });
  S.ok('there is an icon of at least 192px, which is the install criterion',
       sizes.some(function (n) { return n >= 192; }), 'icon sizes: ' + sizes.join(', '));
  S.ok('...and one of 512px for the launcher and splash screen',
       sizes.some(function (n) { return n >= 512; }), 'largest is ' + Math.max.apply(null, sizes));

  var absolute = [];
  function rel(key, v) {
    if (typeof v !== 'string') return;
    if (v.charAt(0) === '/' || /^https?:/i.test(v)) absolute.push(key + ' = ' + v);
  }
  rel('start_url', man.start_url);
  rel('scope', man.scope);
  (man.icons || []).forEach(function (i, n) { rel('icons[' + n + '].src', i.src); });
  S.ok('every URL in the manifest is relative, because the app is deployed under a path',
       !absolute.length,
       absolute.join('; ') || 'start_url, scope and ' + (man.icons || []).length + ' icon srcs all relative');

  /* The icons have to be real files at the size they claim, or the manifest inspects clean and
     the install is refused. Read straight out of the PNG header - IHDR is the first chunk, and
     width and height are the two big-endian 32-bit words at byte 16. */
  var wrong = [];
  (man.icons || []).forEach(function (i) {
    var p = path.join(ROOT, i.src);
    if (!fs.existsSync(p)) { wrong.push(i.src + ' does not exist'); return; }
    var b = fs.readFileSync(p);
    if (b.length < 24 || b.readUInt32BE(0) !== 0x89504e47) { wrong.push(i.src + ' is not a PNG'); return; }
    var w = b.readUInt32BE(16), h = b.readUInt32BE(20);
    var want = parseInt(i.sizes, 10);
    if (w !== want || h !== want) wrong.push(i.src + ' claims ' + i.sizes + ' but is ' + w + 'x' + h);
  });
  S.ok('every icon file exists at the size it claims', !wrong.length,
       wrong.join('; ') || (man.icons || []).length + ' icons checked');
}

/* --------------------------------------------------- and the page registers it ----
   The registration is one line in the shell, and it has to be relative for the same reason
   the manifest does. Served from the host root a '/sw.js' works perfectly; on the real deploy
   it 404s and takes installability with it. */
var skel = fs.readFileSync(path.join(ROOT, 'src', 'title.js'), 'utf8');
var m = skel.match(/serviceWorker\.register\(\s*(['"])([^'"]*)\1\s*(?:,\s*\{([^}]*)\})?/);
S.ok('the page registers a service worker', !!m, m ? m[0].slice(0, 60) : 'no register() call found');
if (m) {
  S.ok('...by a relative script path', m[2].charAt(0) !== '/' && !/^https?:/i.test(m[2]),
       "register('" + m[2] + "')");
  var scope = (m[3] || '').match(/scope\s*:\s*(['"])([^'"]*)\1/);
  S.ok('...with a relative scope', scope && scope[2].charAt(0) !== '/',
       scope ? "scope: '" + scope[2] + "'" : 'no scope given');
}

require('../lib/report.js')(S);
