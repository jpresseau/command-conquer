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
   up along its own banner comments.

   WHAT THE CAP COVERS, AND WHAT IT DELIBERATELY DOES NOT. It applies to source under src/ and
   ra/, and to the reference documents under docs/. It does NOT apply to test/ or to CSS, and
   both exemptions are choices rather than oversights - they were oversights until somebody
   ranked the tree by size and found the three largest hand-edited files in the project were all
   outside a rule that governed nothing bigger than 498 lines.

     docs/ IS covered, because those documents exist for exactly the reason the cap does. They
     were split out of CLAUDE.md so it could stay small enough to read before every change; a
     reference that grows past the size at which the source tree is told to split is the same
     failure one level up, and one of them had reached 506.

     test/ IS NOT, and that is load-bearing. A spec here carries the measurement that justified
     it - what was tried, what the numbers were, what was rejected and why - and that record is
     worth more than a line count. Capping specs would push exactly that material out of the
     file that needs it. The largest spec in the tree is nearly 700 lines and should stay one
     file.

     CSS IS NOT, because a stylesheet is one cascade rather than a set of subsystems: splitting
     it changes what order the rules land in, which is a behaviour change dressed up as
     housekeeping. src/style.css is over MAX_LINES and is meant to be. */

var fs = require('fs');
var path = require('path');
var { Suite } = require('../lib/assert.js');
var { sources, ROOT } = require('../lib/sandbox.js');

var S = new Suite('layout');
var MAX_LINES = 500;
var MAX_CLAUDE = 400;

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

/* ------------------------------------------------- every spec can actually fail ----
   There is no framework here. The runner reads one thing: the exit code. Only two things set
   it - report(), which every Suite-based spec ends with, and the older specs' own
   `process.exit(fails.length ? 1 : 0)`. A spec that does NEITHER exits 0 whatever it found and
   the runner prints PASS, which is what a brand new cliffs spec did while two of its assertions
   were failing. That is the one failure mode a test suite cannot survive, and nothing else in
   this arrangement can notice it. */
['unit', 'e2e'].forEach(function (kind) {
  var dir = path.join(ROOT, 'test', kind);
  var all = fs.readdirSync(dir).filter(function (f) { return /\.test\.js$/.test(f); });
  var silent = all.filter(function (f) {
    var src = fs.readFileSync(path.join(dir, f), 'utf8');
    return !/require\(['"][^'"]*lib\/report\.js['"]\)\s*\(/.test(src) &&
           !/process\.exit(Code)?\b/.test(src);
  });
  S.ok('every test/' + kind + ' spec has a path to a non-zero exit code',
       !silent.length, silent.join(', ') || all.length + ' specs');
});

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

/* ------------------------------------------------------- and the docs are wired up ----
   CLAUDE.md is read in full at the start of every session, so what it costs is not navigation
   but dilution: rules that must be followed, buried in 2,500 lines of things that merely
   happened. The reference was split into docs/ for that reason, and the split only holds if
   two things stay true - CLAUDE.md stays small, and every document it sent away is still
   reachable from it. An unlinked reference doc is worse than a deleted one: it looks like
   live guidance and nobody opens it. */
var claude = fs.readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8');
var docs = fs.readdirSync(path.join(ROOT, 'docs')).filter(function (f) { return f.endsWith('.md'); });
var linked = (claude.match(/docs\/[\w.-]+\.md/g) || []);

var unlinked = docs.filter(function (d) { return linked.indexOf('docs/' + d) < 0; });
S.ok('every reference document is linked from CLAUDE.md', !unlinked.length,
     unlinked.join(', ') || docs.length + ' documents, all linked');

var dangling = linked.filter(function (l) { return !fs.existsSync(path.join(ROOT, l)); });
S.ok('...and every link in CLAUDE.md resolves', !dangling.length,
     dangling.join(', ') || linked.length + ' links resolve');

var claudeLines = claude.split('\n').length;
S.ok('CLAUDE.md stays short enough to be read before every change',
     claudeLines <= MAX_CLAUDE, claudeLines + ' lines of ' + MAX_CLAUDE + ' (reference: ' +
     docs.reduce(function (a, d) {
       return a + fs.readFileSync(path.join(ROOT, 'docs', d), 'utf8').split('\n').length;
     }, 0) + ' lines across ' + docs.length + ' documents)');

/* ...AND NO SINGLE DOCUMENT GROWS BACK INTO THE THING THE SPLIT WAS FOR. Same cap as the source
   tree, for the same reason and one level up - see the note at the top for why docs/ is inside
   the rule and test/ and CSS are outside it. This was not enforced until docs/core-units.md had
   reached 506 lines, past the number every source file in the project is held to. */
var docSized = docs.map(function (d) {
  return { f: 'docs/' + d,
           n: fs.readFileSync(path.join(ROOT, 'docs', d), 'utf8').split('\n').length };
}).sort(function (a, b) { return b.n - a.n; });
var docOver = docSized.filter(function (r) { return r.n > MAX_LINES; });
S.ok('no reference document is over ' + MAX_LINES + ' lines either', !docOver.length,
     docOver.length ? docOver.map(function (r) { return r.f + ' (' + r.n + ')'; }).join(', ')
                    : 'largest is ' + docSized[0].f + ' at ' + docSized[0].n);

require('../lib/report.js')(S);
