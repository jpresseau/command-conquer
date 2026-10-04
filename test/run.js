/* The test suite.

     node test/run.js              everything
     node test/run.js unit         only the unit specs (fast, no browser)
     node test/run.js e2e          only the end-to-end specs
     node test/run.js save touch   any spec whose name contains one of these
     node test/run.js --failed     only what failed last time
     node test/run.js --jobs=1     one spec at a time (the default runs several - see below)
     node test/run.js --quiet      failures and totals only, not every passing spec's numbers

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

   SEVERAL AT ONCE, LONGEST FIRST. This ran one spec at a time for its whole life, and a
   `--jobs=3` passed to it for weeks was read by nothing: the full suite was the sum of every
   spec, 93 minutes, of which one simulation (e2e/pushback) is nine. Each spec is its own
   process with its own browser and its own server on port 0, so nothing stops them sharing the
   machine. They are started in order of how long each took LAST time (test/.last-run.json, a
   record of the runs themselves rather than a list anyone keeps), so the long ones begin at
   once and the short ones fill in round them; a spec with no record goes first, as the one
   nobody can plan around. Results print as each finishes; the failures are printed again at
   the end, so a red line is never left a thousand lines up the scroll.

   A SPEC THAT TIMES ITSELF RUNS ALONE. One that asserts on milliseconds measures the machine,
   and a machine three specs are sharing is a different machine: the old 2D grain spec's "overlay
   costs more than the blend it replaces" came out backwards beside two other browsers. Such a spec says so
   with `@solo` in its opening comment, and runs by itself after everything else. Waiting on a
   condition rather than a fixed delay is the fix for anything else that only fails under load.

   Node and Playwright live in /opt/node22:
     NODE_PATH=/opt/node22/lib/node_modules /opt/node22/bin/node test/run.js               */

var fs = require('fs');
var os = require('os');
var path = require('path');
var cp = require('child_process');

var ROOT = path.resolve(__dirname, '..');
var LAST = path.join(__dirname, '.last-run.json');
var argv = process.argv.slice(2);
var wantKind = argv.filter(function (a) { return a === 'unit' || a === 'e2e'; });
var wantName = argv.filter(function (a) { return a !== 'unit' && a !== 'e2e' && a[0] !== '-'; });
var listOnly = argv.indexOf('--list') >= 0;
var noBuild = argv.indexOf('--no-build') >= 0;
var onlyFailed = argv.indexOf('--failed') >= 0;
var quiet = argv.indexOf('--quiet') >= 0;
/* Three on this machine's four cores: a browser spec rasterises on the CPU (SwiftShader) and
   uses more than one thread doing it, so a job a core oversubscribes it. */
var jobsArg = argv.filter(function (a) { return /^--jobs=\d+$/.test(a); })[0];
var JOBS = jobsArg ? Math.max(1, +jobsArg.split('=')[1]) : Math.max(1, Math.min(3, os.cpus().length - 1));
/* AN OPTION NOBODY READS IS REFUSED, not ignored: that is how --jobs=3 went unread for weeks. */
var unknown = argv.filter(function (a) {
  return a[0] === '-' && ['--list', '--no-build', '--failed', '--quiet'].indexOf(a) < 0 && a !== jobsArg;
});
if (unknown.length) {
  console.error('unknown option ' + unknown.join(' ') + ' - see the top of test/run.js');
  process.exit(2);
}

function specs(kind) {
  var dir = path.join(__dirname, kind);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(function (f) { return /\.test\.js$/.test(f); }).sort()
    .map(function (f) {
      var file = path.join(dir, f), head = fs.readFileSync(file, 'utf8');
      head = head.slice(0, head.indexOf('*/') + 2);
      return { kind: kind, name: f.replace(/\.test\.js$/, ''), file: file, solo: /@solo\b/.test(head) };
    });
}
function id(s) { return s.kind + '/' + s.name; }

/* What the last run found: how long each spec took, and which failed. */
var last = { secs: {}, failed: [] };
try { last = Object.assign(last, JSON.parse(fs.readFileSync(LAST, 'utf8'))); } catch (e) {}

var all = specs('unit').concat(specs('e2e'));
var chosen = all.filter(function (s) {
  if (wantKind.length && wantKind.indexOf(s.kind) < 0) return false;
  if (wantName.length && !wantName.some(function (w) { return s.name.indexOf(w) >= 0; })) return false;
  if (onlyFailed && last.failed.indexOf(id(s)) < 0) return false;
  return true;
});

if (!chosen.length) {
  console.error(onlyFailed ? 'nothing failed last time' : 'no specs match ' + JSON.stringify(argv) + '; try --list');
  process.exit(onlyFailed ? 0 : 2);
}

/* the order they start in: unknown first, then the longest last time */
var queue = chosen.slice().sort(function (a, b) {
  var ta = last.secs[id(a)], tb = last.secs[id(b)];
  if (ta === undefined || tb === undefined) return (ta === undefined ? 0 : 1) - (tb === undefined ? 0 : 1);
  return tb - ta;
});
var solo = queue.filter(function (s) { return s.solo; });
queue = queue.filter(function (s) { return !s.solo; });

/* --list: what would run, in the order it would start, and how long each took last time */
if (listOnly) {
  queue.concat(solo).forEach(function (s) {
    console.log(id(s).padEnd(28) + (last.secs[id(s)] !== undefined ? (last.secs[id(s)] + 's').padStart(8) : '       ?') + (s.solo ? '  alone, after the rest' : ''));
  });
  process.exit(0);
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

function report(r) {
  console.log((r.ok ? 'PASS  ' : 'FAIL  ') + id(r.spec).padEnd(28) + r.secs + 's');
  /* A passing spec's own numbers are printed too - indented, so the run reads as a report
     rather than a verdict. The measurements are the point; the boolean is the summary. */
  var body = r.out.replace(/\s+$/, '');
  if (body && (!r.ok || !quiet)) console.log(body.split('\n').map(function (l) { return '      ' + l; }).join('\n'));
  if (!r.ok && r.status === null) console.log('      (spec did not exit cleanly: ' + r.signal + ')');
}

/* Each spec is its own process: a spec that leaks a browser, wedges an event loop or calls
   process.exit cannot take the rest of the run with it. */
function start(s) {
  return new Promise(function (resolve) {
    var started = Date.now(), out = '';
    var p = cp.spawn(process.execPath, [s.file], {
      cwd: ROOT,
      env: Object.assign({}, process.env, { NODE_PATH: process.env.NODE_PATH || '/opt/node22/lib/node_modules' })
    });
    p.stdout.on('data', function (d) { out += d; });
    p.stderr.on('data', function (d) { out += d; });
    p.on('close', function (status, signal) {
      var r = { spec: s, ok: status === 0, status: status, signal: signal, out: out,
                secs: ((Date.now() - started) / 1000).toFixed(1) };
      results.push(r); report(r); resolve();
    });
  });
}
function worker() {
  var s = queue.shift();
  return s ? start(s).then(worker) : Promise.resolve();
}
function alone() {
  var s = solo.shift();
  return s ? start(s).then(alone) : Promise.resolve();
}

var pool = [];
for (var j = 0; j < Math.min(JOBS, queue.length); j++) pool.push(worker());
Promise.all(pool).then(alone).then(function () {
  var failed = results.filter(function (r) { return !r.ok; });
  /* the record the next run plans from: this run's times over the last, and what failed here
     replacing what failed before among the specs this run covered */
  results.forEach(function (r) { last.secs[id(r.spec)] = +r.secs; });
  var ran = results.map(function (r) { return id(r.spec); });
  last.failed = last.failed.filter(function (f) { return ran.indexOf(f) < 0; })
    .concat(failed.map(function (r) { return id(r.spec); }));
  try { fs.writeFileSync(LAST, JSON.stringify(last, null, 1)); } catch (e) {}

  console.log('\n' + '='.repeat(64));
  failed.forEach(function (r) {
    console.log('FAIL  ' + id(r.spec));
    r.out.split('\n').filter(function (l) { return /✗|Error|did not/.test(l); }).slice(0, 12)
      .forEach(function (l) { console.log('      ' + l.trim()); });
  });
  console.log((results.length - failed.length) + '/' + results.length + ' specs passed in ' +
              ((Date.now() - t0) / 1000).toFixed(1) + 's, ' + Math.min(JOBS, chosen.length) + ' at a time');
  if (failed.length) {
    console.log('failed: ' + failed.map(function (r) { return id(r.spec); }).join(', '));
    console.log('re-run just those: node test/run.js --failed');
  }
  process.exit(failed.length ? 1 : 0);
});
