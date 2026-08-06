/* The test suite.

     node test/run.js              everything
     node test/run.js unit         only the unit specs (fast, no browser)
     node test/run.js e2e          only the end-to-end specs
     node test/run.js save touch   any spec whose name contains one of these

   Two kinds of spec, deliberately separated:

     test/unit/   plain node, no browser, no game assets. These cover the parts that are
                  genuinely modular - the archive and image decoders in ra/, and the pure
                  helpers pulled out of the game files. Fast enough to run on every edit.

     test/e2e/    Playwright against the BUILT index.html. The build reassembles ~30 source
                  files into one page, so testing src/ would prove nothing about the artifact
                  a player actually loads. These run the real game and assert on outcomes -
                  where the camera ended up, what is on disk, which element takes a tap - never
                  on a handler having been called.

   The build runs first, always. A spec measuring a stale index.html is worse than no spec: it
   reports on code that is not there any more.

   Node and Playwright live in /opt/node22:
     NODE_PATH=/opt/node22/lib/node_modules /opt/node22/bin/node test/run.js               */

var fs = require('fs');
var path = require('path');
var cp = require('child_process');

var ROOT = path.resolve(__dirname, '..');
var argv = process.argv.slice(2);
var wantKind = argv.filter(function (a) { return a === 'unit' || a === 'e2e'; });
var wantName = argv.filter(function (a) { return a !== 'unit' && a !== 'e2e' && a[0] !== '-'; });
var listOnly = argv.indexOf('--list') >= 0;
var noBuild = argv.indexOf('--no-build') >= 0;

function specs(kind) {
  var dir = path.join(__dirname, kind);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(function (f) { return /\.test\.js$/.test(f); }).sort()
    .map(function (f) { return { kind: kind, name: f.replace(/\.test\.js$/, ''), file: path.join(dir, f) }; });
}

var all = specs('unit').concat(specs('e2e'));
var chosen = all.filter(function (s) {
  if (wantKind.length && wantKind.indexOf(s.kind) < 0) return false;
  if (wantName.length && !wantName.some(function (w) { return s.name.indexOf(w) >= 0; })) return false;
  return true;
});

if (listOnly) {
  chosen.forEach(function (s) { console.log(s.kind + '/' + s.name); });
  process.exit(0);
}
if (!chosen.length) {
  console.error('no specs match ' + JSON.stringify(argv) + '; try --list');
  process.exit(2);
}

/* Rebuild before measuring anything. index.html is a generated artifact and the specs read it. */
if (!noBuild) {
  var b = cp.spawnSync('python3', ['build.py'], { cwd: ROOT, encoding: 'utf8' });
  if (b.status !== 0) {
    console.error('build.py failed, so nothing below would mean anything:\n' + (b.stderr || b.stdout));
    process.exit(2);
  }
  console.log((b.stdout || '').trim());
  console.log('');
}

var results = [];
var t0 = Date.now();

for (var i = 0; i < chosen.length; i++) {
  var s = chosen[i];
  var started = Date.now();
  /* Each spec is its own process: a spec that leaks a browser, wedges an event loop or calls
     process.exit cannot take the rest of the run with it. */
  var r = cp.spawnSync(process.execPath, [s.file], {
    cwd: ROOT, encoding: 'utf8',
    env: Object.assign({}, process.env, { NODE_PATH: process.env.NODE_PATH || '/opt/node22/lib/node_modules' }),
    maxBuffer: 32 * 1024 * 1024
  });
  var secs = ((Date.now() - started) / 1000).toFixed(1);
  var out = (r.stdout || '') + (r.stderr || '');
  var okRun = r.status === 0;
  results.push({ spec: s, ok: okRun, secs: secs, out: out });
  console.log((okRun ? 'PASS  ' : 'FAIL  ') + (s.kind + '/' + s.name).padEnd(28) + secs + 's');
  /* A passing spec's own numbers are printed too - indented, so the run reads as a report
     rather than a verdict. The measurements are the point; the boolean is the summary. */
  var body = out.replace(/\s+$/, '');
  if (body) console.log(body.split('\n').map(function (l) { return '      ' + l; }).join('\n'));
  if (!okRun && r.status === null) console.log('      (spec did not exit cleanly: ' + r.signal + ')');
}

var failed = results.filter(function (r) { return !r.ok; });
console.log('\n' + '='.repeat(64));
console.log((results.length - failed.length) + '/' + results.length + ' specs passed in ' +
            ((Date.now() - t0) / 1000).toFixed(1) + 's');
if (failed.length) {
  console.log('failed: ' + failed.map(function (r) { return r.spec.kind + '/' + r.spec.name; }).join(', '));
}
process.exit(failed.length ? 1 : 0);
