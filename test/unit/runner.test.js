/* The runner itself (test/run.js): an option it does not read is refused rather than ignored,
   because `--jobs=3` was passed to it for weeks while it ran every spec one at a time, and
   nothing said so. Asked through --list, which builds nothing and runs nothing. */

var cp = require('child_process');
var path = require('path');
var { Suite } = require('../lib/assert.js');

var S = new Suite('runner');
var RUN = path.join(__dirname, '..', 'run.js');
function run(args) { return cp.spawnSync(process.execPath, [RUN].concat(args), { encoding: 'utf8' }); }

var ok = run(['--list', '--jobs=2', '--quiet', '--no-build', 'unit']);
S.ok('the options it knows are taken', ok.status === 0 && /unit\/runner/.test(ok.stdout), 'exit ' + ok.status);
var typo = run(['--list', '--jobs3']);
S.ok('a misspelt one is refused, by name', typo.status === 2 && /--jobs3/.test(typo.stderr), (typo.stderr || '').trim());
var odd = run(['--list', '--paralel']);
S.ok('...and so is one it never had', odd.status === 2 && /--paralel/.test(odd.stderr), (odd.stderr || '').trim());

/* the order a run starts them in: anything timing itself last, alone */
var order = run(['--list', 'e2e']).stdout.trim().split('\n');
var alone = order.filter(function (l) { return /alone/.test(l); });
S.ok('a spec that times itself is run alone (@solo), and there is one to check', alone.length > 0 && alone.some(function (l) { return /e2e\/grain/.test(l); }),
     alone.map(function (l) { return l.split(' ')[0]; }).join(', ') || 'none marked');
var firstAlone = order.findIndex(function (l) { return /alone/.test(l); });
S.ok('...after everything that shares the machine', order.slice(firstAlone).every(function (l) { return /alone/.test(l); }),
     (order.length - firstAlone) + ' of ' + order.length + ' at the end');

require('../lib/report.js')(S);
