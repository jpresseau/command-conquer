/* The difficulty ladder: how long an idle player survives at each setting.

   This is the balance metric of record. A player who does nothing at all is the one measurement
   that isolates the AI - no skill, no strategy, nothing but the opponent doing its job - and the
   number that matters is not any single figure but the ORDER: easy must outlast normal must
   outlast hard. A change that collapses three rungs into one has broken the game even if every
   other spec is green, and that has happened here before (a gem-detour weighting once made every
   AI rich and flattened the whole ladder).

   Bands rather than exact numbers. Balance drifts on purpose and a spec asserting 246s would
   have to be edited on every deliberate retune, which trains everyone to edit it without looking.
   What is asserted is the shape: the ordering holds, nobody survives forever, and nobody dies
   instantly. The measured means are printed every run so a drift is visible long before it trips
   a bound.

   Three seeds rather than five, to keep this inside a couple of minutes; the wider sweep lives in
   the same harness with SEEDS extended. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('ladder');
var SEEDS = [9001, 9002, 9003];
var DIFFS = ['easy', 'normal', 'hard'];
var CAP = 600;                       /* simulated seconds before a match is called a survival */

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 800, height: 600 });
  /* the ladder drives _rtsNewGame directly, so a battle has to exist to be replaced */
  await g.start(7, 1);

  var means = {};
  for (var si = 0; si < 2; si++) {
    var vs = ['allied', 'soviet'][si];
    for (var di = 0; di < DIFFS.length; di++) {
      var d = DIFFS[di];
      var fell = [];
      for (var i = 0; i < SEEDS.length; i++) {
        var r = await g.page.evaluate(function (a) {
          var d = a[0], seed = a[1], vs = a[2], CAP = a[3];
          if (typeof rtsSetVoxSide === 'function') rtsSetVoxSide(vs);
          _rtsNewGame(seed, d);
          var G = window._rtsG, fell = null, wave = null;
          for (var i = 0; i < 60 * CAP && fell === null; i++) {
            _rtsTick(1 / 60);
            if (wave === null && G.ai && G.ai.wave > 0) wave = +G.t.toFixed(0);
            if (G.over) fell = +G.t.toFixed(0);
          }
          return { fell: fell, wave: wave, over: G.over || null,
                   eu: G.ents.filter(function (e) { return !e.dead && e.side === 'enemy' && e.type === 'unit'; }).length,
                   es: G.ents.filter(function (e) { return !e.dead && e.side === 'enemy' && e.type === 'struct'; }).length };
        }, [d, SEEDS[i], vs, CAP]);
        fell.push(r.fell === null ? CAP : r.fell);
        S.note(vs.padEnd(7) + d.padEnd(7) + 'seed ' + SEEDS[i] +
               '  first wave ' + String(r.wave).padStart(4) + 's' +
               '  fell ' + String(r.fell === null ? '>' + CAP : r.fell).padStart(4) + 's' +
               '  enemy left ' + r.eu + 'u/' + r.es + 's  ' + (r.over || '-'));
        /* An idle player must LOSE. If the AI cannot finish off someone who never fires a shot,
           the metric below is measuring nothing at all. */
        S.ok(vs + ' ' + d + ' seed ' + SEEDS[i] + ': the idle player is actually defeated',
             r.over === 'lose', 'result: ' + (r.over || 'still running at ' + CAP + 's'));
      }
      means[vs + ':' + d] = Math.round(fell.reduce(function (a, c) { return a + c; }, 0) / fell.length);
    }
  }

  S.note('mean survival — ' + Object.keys(means).map(function (k) { return k + ' ' + means[k] + 's'; }).join('   '));

  ['allied', 'soviet'].forEach(function (vs) {
    var e = means[vs + ':easy'], n = means[vs + ':normal'], h = means[vs + ':hard'];
    /* THE ORDERING IS THE POINT. Absolute seconds are a retune away from changing; three
       settings that all play the same is a broken game. */
    S.ok(vs + ': easy outlasts normal', e > n, e + 's vs ' + n + 's');
    S.ok(vs + ': normal outlasts hard', n > h, n + 's vs ' + h + 's');
    S.ok(vs + ': the rungs are far enough apart to feel', e - h >= 40,
         'easy to hard spans ' + (e - h) + 's');
    /* and nothing has become absurd in either direction */
    S.ok(vs + ': hard is not instant death', h > 60, h + 's');
    S.ok(vs + ': easy is not unloseable', e < CAP, e + 's against a ' + CAP + 's cap');
  });

  S.ok('no page errors', !g.errors.filter(function (e) { return !/ServiceWorker/.test(e); }).length,
       g.errors.join(' | ') || 'none');
  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})();
