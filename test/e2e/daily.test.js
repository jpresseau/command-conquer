/* THE DAILY BATTLE, WITH REAL CLICKS (src/daily.js, title.js, ui/sidebar.js):

     THE BUTTON     DAILY BATTLE on the title says what today's battle is, and a real click opens it
                    on today's seed, army and difficulty - whatever the player had picked
     THE RESULT     the end card carries the day's line, and COPY RESULT puts exactly that line on
                    the clipboard; the result is kept as the day's best
     PUT BACK       quitting to the title gives the player their own army and difficulty again, and
                    the button now shows the day's best
     AGAIN          "Play again" on a daily replays the same day's battle */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('daily');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 1100, height: 760 });
  var p = g.page;
  await g.ctx.grantPermissions(['clipboard-read', 'clipboard-write']);

  /* the player's own choices: the OTHER army from today's, and the hard rung */
  var before = await p.evaluate(function () {
    var d = rtsDailySpec(rtsDailyDate());
    rtsSetArmySide(d.army === 'allied' ? 'soviet' : 'allied');
    rtsSetDiff('hard');
    try { localStorage.removeItem('bw.daily.' + d.date); } catch (e) {}
    rtsDailyNote();
    var b = document.getElementById('rtsDaily'), r = b.getBoundingClientRect();
    return { spec: d, mine: rtsArmySide(), diff: window._RTS_DIFF, note: document.getElementById('rtsDailyNote').textContent,
             x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  S.ok('the button says what today\'s battle is', before.note.indexOf(before.spec.army === 'allied' ? 'Meridian Compact' : 'Basalt Dominion') >= 0, before.note);

  /* ---------- the button ---------- */
  await p.mouse.click(before.x, before.y);
  await p.waitForFunction(function () { return !!(window._rtsG && document.getElementById('rcgRts')); }, null, { timeout: 60000 }).catch(function () {});
  var inside = await p.evaluate(function () {
    var G = window._rtsG;
    return G ? { seed: G.seed, army: rtsArmySide(), diff: G.diff } : null;
  });
  S.ok('a real click opens today\'s battle: its seed, its army, its difficulty', !!inside && inside.seed === before.spec.seed &&
       inside.army === before.spec.army && inside.diff === before.spec.diff, JSON.stringify(inside) + ' for ' + JSON.stringify(before.spec));

  /* ---------- on the clock ---------- */
  /* the daily is scored on the clock, and nothing showed it until the end card: the pill carries
     it (ui/sidebar.js), a saved daily says it is the daily, and the radar says what the tide does
     next (core/tide.js) */
  var clock = await p.evaluate(function () {
    var G = window._rtsG, t0 = G.t;
    G.t = 75; _rtsSyncSidebar(0);
    var pill = document.getElementById('rtsDifLbl').textContent, tide = document.getElementById('rtsTide');
    var tideTxt = tide && !tide.hidden ? tide.textContent : null;
    rtsSaveGame();
    var info = rtsSaveInfo();
    G.t = t0;
    return { pill: pill, tide: tideTxt, flats: _rtsTideAny(G), desc: info && info.desc };
  });
  S.ok('in the battle the pill shows the daily\'s clock, and a saved daily says it is the daily', clock.pill === 'DAILY 1:15' && /^Daily — /.test(clock.desc || ''),
       JSON.stringify({ pill: clock.pill, desc: clock.desc }));
  S.ok('...and the radar says what the tide does next, on a map with flats', clock.flats ? /^TIDE: (ebbing - low in|flats dry in) \d+:\d\d$/.test(clock.tide || '') : clock.tide === null,
       JSON.stringify({ flats: clock.flats, tide: clock.tide }));

  /* ---------- the result ---------- */
  var card = await p.evaluate(function () {
    var G = window._rtsG;
    if (window._rtsUI) window._rtsUI.dead = true;
    G.t = 612; G.over = 'win'; G.stats.killed = 41; G.stats.lostU = 9;
    _rtsSyncSidebar(0);
    var line = document.getElementById('rtsDailyLine'), btn = line && line.parentNode.querySelector('button');
    var r = btn && btn.getBoundingClientRect();
    return { line: line ? line.textContent : null, x: r && r.left + r.width / 2, y: r && r.top + r.height / 2,
             stored: localStorage.getItem('bw.daily.' + rtsDailyDate()) };
  });
  S.ok('the end card carries the day\'s line', !!card.line && card.line.indexOf(before.spec.date) >= 0 && /Victory in 10:12/.test(card.line), JSON.stringify(card.line));
  S.ok('...and keeps it as the day\'s best', !!card.stored && JSON.parse(card.stored).won === true, card.stored);
  if (card.x) await p.mouse.click(card.x, card.y);
  await p.waitForFunction(function () { var b = document.querySelector('.daily button'); return b && b.textContent === 'COPIED'; }, null, { timeout: 5000 }).catch(function () {});
  var clip = await p.evaluate(function () { return navigator.clipboard.readText().catch(function () { return null; }); });
  S.eq('COPY RESULT puts exactly that line on the clipboard', clip, card.line);

  /* ---------- again ---------- */
  var again = await p.evaluate(function () {
    rtsRestart();
    return new Promise(function (res) {
      (function wait(n) {
        if (window._rtsG && window._rtsG.t >= 0 && document.getElementById('rcgRts') && !window._rtsG.over) return res({ seed: window._rtsG.seed, army: rtsArmySide(), diff: window._rtsG.diff });
        if (n > 200) return res(null);
        setTimeout(function () { wait(n + 1); }, 100);
      })(0);
    });
  });
  S.ok('"Play again" on a daily replays the same day\'s battle', !!again && again.seed === before.spec.seed && again.army === before.spec.army,
       JSON.stringify(again));

  /* ---------- put back ---------- */
  var home = await p.evaluate(function () {
    rtsClose();
    return { army: rtsArmySide(), diff: window._RTS_DIFF, title: !document.getElementById('rtsHome').classList.contains('gone'),
             note: document.getElementById('rtsDailyNote').textContent, daily: window._RTS_DAILY };
  });
  S.ok('quitting gives the player their own army and difficulty again', home.title && home.army === before.mine && home.diff === before.diff && !home.daily,
       JSON.stringify({ army: home.army, diff: home.diff }) + ' (theirs ' + before.mine + ', ' + before.diff + ')');
  S.ok('...and the button now shows the day\'s best', /Your best: victory in 10:12/.test(home.note), home.note);

  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');
  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
