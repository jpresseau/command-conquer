/* The source tree's own invariants.

   The game has no module system - build.py concatenates files listed in index.skeleton.html into
   one page - and that arrangement has exactly two ways to rot, neither of which shows up as an
   error anywhere.

   The first is an ORPHAN: a file sitting in src/ that the skeleton does not include. It reads
   like live code, it can be edited for an afternoon, and none of it is in the shipped page. The
   only symptom is that the change appears not to work. Nothing in the build notices, because
   build.py discovers its work from the skeleton and an unlisted file is simply not work.

   The second is JAVASCRIPT INSIDE THE SKELETON. build.py syntax-checks and collision-checks the
   files it INCLUDES; an inline <script> block is neither. That is not hypothetical - the
   standalone shell lived inline for the whole life of the project, 344 lines of it, and a parse
   error in any of them would have shipped as a blank white page, which is the exact failure the
   syntax gate exists to prevent. So: the skeleton carries markers, and nothing else.

   And then the size cap, which is why the tree looks the way it does. Every subsystem here is a
   directory of small files rather than one large one, and the split only stays split if
   something objects when a file grows back. MAX_LINES is the line at which a file wants breaking
   up along its own banner comments. */

var fs = require('fs');
var path = require('path');
var { Suite } = require('../lib/assert.js');
var { sources, ROOT } = require('../lib/sandbox.js');

var S = new Suite('layout');
var MAX_LINES = 500;

var skel = fs.readFileSync(path.join(ROOT, 'src', 'index.skeleton.html'), 'utf8');
var inlined = sources();                       /* every .js the page includes, in load order */

/* ------------------------------------------------------------ nothing is orphaned ----
   Walked from the disk, not from the manifest, because the manifest is the thing being
   checked. Anything under src/ or ra/ that ends in .js is meant to be in the page. */
function walk(dir, out) {
  fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).forEach(function (d) {
    var rel = dir + '/' + d.name;
    if (d.isDirectory()) walk(rel, out);
    else if (d.name.endsWith('.js')) out.push(rel);
  });
  return out;
}
var onDisk = walk('src', walk('ra', [])).sort();
var listed = {};
inlined.forEach(function (f) { listed[f] = (listed[f] || 0) + 1; });

var orphans = onDisk.filter(function (f) { return !listed[f]; });
S.ok('every source file on disk is included in the page', !orphans.length,
     orphans.join(', ') || onDisk.length + ' files, all included');

var missing = inlined.filter(function (f) { return !fs.existsSync(path.join(ROOT, f)); });
S.ok('...and every file the skeleton includes exists', !missing.length,
     missing.join(', ') || inlined.length + ' includes resolve');

var twice = Object.keys(listed).filter(function (f) { return listed[f] > 1; });
S.ok('...exactly once, so nothing is evaluated twice', !twice.length,
     twice.join(', ') || 'no duplicate includes');

/* ------------------------------------------------- the skeleton holds no JavaScript ----
   Every <script> in it must be a marker and nothing else. A block with a body would be code
   that neither the syntax gate nor the duplicate-name check ever sees. */
var scripts = skel.match(/<script\b[^>]*>([\s\S]*?)<\/script>/g) || [];
var withCode = scripts.filter(function (s) {
  var body = s.replace(/^<script\b[^>]*>/, '').replace(/<\/script>$/, '').trim();
  return body && !/^(?:\/\/|\/\*)@@(?:INC|CSS):[\w./-]+@@(?:\*\/)?$/.test(body);
});
S.ok('the skeleton is markers only - no inline JavaScript escapes the build gates',
     !withCode.length,
     withCode.length ? (withCode.length + ' inline block(s), first: ' +
                        withCode[0].slice(0, 70).replace(/\s+/g, ' ')) :
                       scripts.length + ' script tags, all markers');

/* ---------------------------------------------------------------- and none is huge ----
   Printed as a table on success: the point of a cap is that the next reader can see how much
   headroom is left, not just that it has not been breached. */
var sized = onDisk.map(function (f) {
  return { f: f, n: fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n').length };
}).sort(function (a, b) { return b.n - a.n; });

var over = sized.filter(function (r) { return r.n > MAX_LINES; });
S.ok('no source file is over ' + MAX_LINES + ' lines',
     !over.length,
     over.length ? over.map(function (r) { return r.f + ' (' + r.n + ')'; }).join(', ')
                 : 'largest is ' + sized[0].f + ' at ' + sized[0].n);
S.note('top 5: ' + sized.slice(0, 5).map(function (r) {
  return r.f.replace(/^src\//, '') + ' ' + r.n;
}).join(', '));
S.note(onDisk.length + ' source files, ' +
       sized.reduce(function (a, r) { return a + r.n; }, 0) + ' lines, median ' +
       sized[Math.floor(sized.length / 2)].n);

require('../lib/report.js')(S);
