/* The difficulty ladder, A against B: how long an idle player survives on each difficulty, for each
   side, on the same seeds, in this tree and (optionally) at another git ref, side by side.

     node .claude/skills/balance/ladder.js                      this tree only
     node .claude/skills/balance/ladder.js --ref=main           this tree against main
     node .claude/skills/balance/ladder.js --ref=main --seeds=5 --diffs=hard --sides=soviet

   Every match runs off its scenario seed, so the same seed is the same match and a difference is
   the change, not noise. It drives the built page exactly as e2e/ladder does (in a browser - the
   node sandbox runs the simulation about seven times slower), builds each tree first, and runs the
   two trees at the same time. About 10 s a match. */

var path = require('path'), cp = require('child_process'), fs = require('fs');
var ROOT = path.resolve(__dirname, '../../..');
var o = { seeds: 3, diffs: 'easy,normal,hard', sides: 'allied,soviet', cap: 600, ref: null };
process.argv.slice(2).forEach(function (a) {
  var m = /^--(\w+)=(.*)$/.exec(a);
  if (!m || !(m[1] in o)) { console.error('unknown option ' + a + ' (--ref --seeds --diffs --sides --cap)'); process.exit(2); }
  o[m[1]] = m[2];
});
var SEEDS = []; for (var i = 0; i < +o.seeds; i++) SEEDS.push(9001 + i);
var DIFFS = o.diffs.split(','), SIDES = o.sides.split(','), CAP = +o.cap;

function build(dir) { cp.execSync('python3 build.py', { cwd: dir, stdio: 'ignore' }); }

async function ladder(dir, label) {
  var { chromium } = require('playwright');
  var { openPage } = require(path.join(dir, 'test/lib/game.js'));
  var browser = await chromium.launch(), g = await openPage(browser, { width: 800, height: 600 }), out = {};
  await g.start(7, 1);
  for (var vs of SIDES) for (var d of DIFFS) {
    var fell = [];
    for (var seed of SEEDS) {
      var r = await g.page.evaluate(function (a) {
        if (typeof rtsSetVoxSide === 'function') rtsSetVoxSide(a[2]);
        _rtsNewGame(a[1], a[0]);
        var G = window._rtsG, fell = null;
        for (var i = 0; i < 60 * a[3] && fell === null; i++) { _rtsTick(1 / 60); if (G.over) fell = Math.round(G.t); }
        return fell;
      }, [d, seed, vs, CAP]);
      fell.push(r === null ? CAP : r);
      process.stderr.write(label + ' ' + vs + ' ' + d + ' ' + seed + ': ' + (r === null ? '>' + CAP : r) + 's\n');
    }
    out[vs + ' ' + d] = fell;
  }
  await g.close(); await browser.close();
  return out;
}

(async function () {
  var trees = [{ dir: ROOT, label: 'this' }], wt = null;
  if (o.ref) {
    wt = '/tmp/ladder-ref-' + o.ref.replace(/[^\w.-]/g, '_');
    try { cp.execSync('git worktree remove --force ' + wt, { cwd: ROOT, stdio: 'ignore' }); } catch (e) {}
    cp.execSync('git worktree add --detach ' + wt + ' ' + o.ref, { cwd: ROOT, stdio: 'ignore' });
    trees.push({ dir: wt, label: o.ref });
  }
  trees.forEach(function (t) { build(t.dir); });
  var res = await Promise.all(trees.map(function (t) { return ladder(t.dir, t.label); }));
  if (wt) cp.execSync('git worktree remove --force ' + wt, { cwd: ROOT, stdio: 'ignore' });
  function mean(a) { return a.reduce(function (s, v) { return s + v; }, 0) / a.length; }
  console.log('\nseconds an idle player survives (cap ' + CAP + '; seeds ' + SEEDS.join(' ') + ')\n');
  console.log('rung'.padEnd(16) + trees.map(function (t) { return (t.label + ' mean').padStart(12) + '  per seed'.padEnd(6 + SEEDS.length * 5); }).join('') + (o.ref ? 'change'.padStart(8) : ''));
  Object.keys(res[0]).forEach(function (k) {
    var line = k.padEnd(16);
    res.forEach(function (r) { line += mean(r[k]).toFixed(0).padStart(12) + '  ' + r[k].map(function (v) { return String(v).padStart(4); }).join(' ').padEnd(5 * SEEDS.length + 4); });
    if (o.ref) { var dd = mean(res[0][k]) - mean(res[1][k]); line += ((dd > 0 ? '+' : '') + dd.toFixed(0) + 's').padStart(8); }
    console.log(line);
  });
  /* the shape e2e/ladder holds: easy outlasts normal outlasts hard, on each side */
  res.forEach(function (r, i) {
    SIDES.forEach(function (vs) {
      var m = DIFFS.map(function (d) { return mean(r[vs + ' ' + d]); });
      for (var j = 1; j < m.length; j++) if (DIFFS[j - 1] === 'easy' || DIFFS[j - 1] === 'normal') if (m[j] > m[j - 1]) console.log('ORDER BROKEN in ' + trees[i].label + ': ' + vs + ' ' + DIFFS[j] + ' outlasts ' + DIFFS[j - 1]);
    });
  });
})().catch(function (e) { console.error(e); process.exit(1); });
