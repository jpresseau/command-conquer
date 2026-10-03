/* Mutation-test new checks: break the code on purpose and see the right assertion go red.

     node .claude/skills/mutation-test/mutate.js mutants.json [--jobs=3]

   mutants.json is a list of
     { "name": "nofade", "kind": "e2e" | "unit", "spec": "music",
       "edits": [ { "file": "src/audio/music.js", "old": "exact text", "new": "replacement" } ] }

   Each mutant runs in its own copy of the repo (/tmp/mut_<name>), so the working tree is never
   touched and nothing has to be reverted. An edit must match its file EXACTLY ONCE or the mutant is
   reported NOT APPLIED - a mutant that silently did not apply proves nothing. e2e mutants rebuild
   their copy first. The verdict per mutant:
     KILLED       its spec failed, and the red assertions are printed - check they are the ones
                  the mutant was aimed at
     SURVIVED     every assertion passed: the check does not see this fault
     CRASHED      the spec died without an assertion failing (a throw, a timeout) - make the spec
                  fail on an assertion instead; a crash is red for the wrong reason */

var fs = require('fs'), path = require('path'), cp = require('child_process');
var ROOT = path.resolve(__dirname, '../../..');
var args = process.argv.slice(2), file = args.filter(function (a) { return a[0] !== '-'; })[0];
var jobs = +((args.filter(function (a) { return /^--jobs=\d+$/.test(a); })[0] || '--jobs=3').split('=')[1]);
if (!file) { console.error('usage: node mutate.js mutants.json [--jobs=3]'); process.exit(2); }
var list = JSON.parse(fs.readFileSync(file, 'utf8'));
var NODE = '/opt/node22/bin/node', ENV = Object.assign({}, process.env, { NODE_PATH: '/opt/node22/lib/node_modules' });

function one(m) {
  return new Promise(function (resolve) {
    var dir = '/tmp/mut_' + m.name.replace(/[^\w-]/g, '_');
    cp.execSync('rm -rf ' + dir + ' && cp -r ' + JSON.stringify(ROOT) + ' ' + dir);
    for (var i = 0; i < m.edits.length; i++) {
      var e = m.edits[i], p = path.join(dir, e.file), s = fs.readFileSync(p, 'utf8'), n = s.split(e.old).length - 1;
      if (n !== 1) { cp.execSync('rm -rf ' + dir); return resolve({ m: m, verdict: 'NOT APPLIED', lines: [e.file + ': matched ' + n + ' times'] }); }
      fs.writeFileSync(p, s.replace(e.old, function () { return e.new; }));
    }
    if (m.kind === 'e2e') {
      var b = cp.spawnSync('python3', ['build.py'], { cwd: dir, encoding: 'utf8' });
      if (b.status !== 0) { cp.execSync('rm -rf ' + dir); return resolve({ m: m, verdict: 'BUILD FAIL', lines: [(b.stderr || b.stdout).slice(0, 400)] }); }
    }
    var spec = path.join(dir, 'test', m.kind, m.spec + '.test.js');
    var p2 = cp.spawn(NODE, [spec], { cwd: dir, env: ENV }), out = '';
    var timer = setTimeout(function () { p2.kill('SIGKILL'); }, (m.kind === 'e2e' ? 900 : 300) * 1000);
    p2.stdout.on('data', function (d) { out += d; }); p2.stderr.on('data', function (d) { out += d; });
    p2.on('close', function (code) {
      clearTimeout(timer);
      cp.execSync('rm -rf ' + dir);
      var red = out.split('\n').filter(function (l) { return /✗/.test(l); });
      var verdict = code === 0 ? 'SURVIVED' : red.length ? 'KILLED' : 'CRASHED';
      resolve({ m: m, verdict: verdict, lines: verdict === 'CRASHED' ? out.trim().split('\n').slice(-4) : red.slice(0, 6) });
    });
  });
}

var queue = list.slice(), results = [];
function worker() { var m = queue.shift(); return m ? one(m).then(function (r) { results.push(r); report(r); return worker(); }) : Promise.resolve(); }
function report(r) { console.log('=== ' + r.verdict.padEnd(12) + r.m.name + '  (' + r.m.kind + '/' + r.m.spec + ')'); r.lines.forEach(function (l) { console.log('    ' + l.trim()); }); }
var pool = []; for (var j = 0; j < Math.min(jobs, list.length); j++) pool.push(worker());
Promise.all(pool).then(function () {
  var bad = results.filter(function (r) { return r.verdict !== 'KILLED'; });
  console.log('\n' + (results.length - bad.length) + '/' + results.length + ' mutants killed' + (bad.length ? ' - not: ' + bad.map(function (r) { return r.m.name + ' (' + r.verdict + ')'; }).join(', ') : ''));
  process.exit(bad.length ? 1 : 0);
});
