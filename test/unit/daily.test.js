/* THE DAILY BATTLE'S RULES (src/daily.js), without a browser:

     ONE A DAY     the same date gives the same battle - seed, army, difficulty - every time, on
                   any machine; another date gives another; the date is the UTC day
     A FAIR MIX    over a year the days give both armies, and spread seeds rather than repeating
     THE BEST      any victory beats any defeat, a faster victory a slower one, a longer defeat a
                   shorter one - and only a better result replaces the day's record
     THE LINE      says the date, the outcome, the time and the tallies, and nothing else */

var { Suite } = require('../lib/assert.js');
var { load } = require('../lib/sandbox.js');

var S = new Suite('daily');
var g = load(['src/rules', 'src/core', 'src/daily.js']);

/* ---------------- one a day ---------------- */
var a = g.rtsDailySpec('2026-10-04'), b = g.rtsDailySpec('2026-10-04'), c = g.rtsDailySpec('2026-10-05');
S.ok('the same date gives the same battle', JSON.stringify(a) === JSON.stringify(b), JSON.stringify(a));
S.ok('...and the next day another', a.seed !== c.seed, a.seed + ' then ' + c.seed);
S.ok('...on a real difficulty and a real army', !!g.RTS_DIFF[a.diff] && g.RTS_ARMY_SIDES.indexOf(a.army) >= 0, a.diff + ', ' + a.army);
S.eq('the date is the UTC day, whatever the clock\'s zone', g.rtsDailyDate(new Date(Date.UTC(2026, 9, 4, 23, 30))), '2026-10-04');

/* ---------------- a fair mix ---------------- */
var armies = {}, seeds = {};
for (var d = 0; d < 365; d++) {
  var s = g.rtsDailySpec(g.rtsDailyDate(new Date(Date.UTC(2026, 0, 1) + d * 864e5)));
  armies[s.army] = (armies[s.army] || 0) + 1; seeds[s.seed] = 1;
}
S.ok('over a year the days give both armies, near evenly', armies.allied > 140 && armies.soviet > 140, JSON.stringify(armies));
S.ok('...and spread their maps rather than repeating', Object.keys(seeds).length > 355, Object.keys(seeds).length + ' different seeds in 365 days');

/* ---------------- the best ---------------- */
var B = g.rtsDailyBetter;
S.ok('any victory beats any defeat', B({ won: true, secs: 900 }, { won: false, secs: 1200 }) && !B({ won: false, secs: 1200 }, { won: true, secs: 900 }), '');
S.ok('...a faster victory a slower one', B({ won: true, secs: 400 }, { won: true, secs: 500 }) && !B({ won: true, secs: 500 }, { won: true, secs: 400 }), '');
S.ok('...a longer defeat a shorter one', B({ won: false, secs: 500 }, { won: false, secs: 400 }) && !B({ won: false, secs: 400 }, { won: false, secs: 500 }), '');
S.ok('...and anything beats no record', B({ won: false, secs: 1 }, null), '');

g.window._RTS_DAILY = g.rtsDailySpec('2026-10-04');
function over(won, secs) { return { over: won ? 'win' : 'lose', t: secs, stats: { killed: 30, lostU: 12 } }; }
var r1 = g.rtsDailyResult(over(false, 300));
var r2 = g.rtsDailyResult(over(true, 700));
var r3 = g.rtsDailyResult(over(true, 900));
var stored = JSON.parse(g.window.localStorage.getItem('bw.daily.2026-10-04'));
S.ok('a first result is the day\'s best; a victory replaces a defeat; a slower victory does not', r1.isBest && r2.isBest && !r3.isBest && stored.won && stored.secs === 700,
     [r1.isBest, r2.isBest, r3.isBest].join(',') + ' -> stored ' + JSON.stringify(stored));
S.ok('...and every result knows the day\'s best', r3.best.secs === 700, JSON.stringify(r3.best));
S.ok('no daily under way, no result', (g.window._RTS_DAILY = null, g.rtsDailyResult(over(true, 10)) === null), '');

/* ---------------- the line ---------------- */
S.eq('the line says the date, the outcome, the time and the tallies', r2.line, 'Breachwater daily 2026-10-04 · Victory in 11:40 · 30 destroyed, 12 lost');
S.eq('...and a defeat says how long it held', r1.line, 'Breachwater daily 2026-10-04 · Held out 5:00 · 30 destroyed, 12 lost');

require('../lib/report.js')(S);
