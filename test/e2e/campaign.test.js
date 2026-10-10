/* THE CAMPAIGN, WITH REAL CLICKS (src/campaign.js, title.js, ui/shell.js, ui/sidebar.js):

     THE LIST       CAMPAIGN on the title opens the four missions with their briefs, and a real
                    click on PLAY opens that mission: its seed, its army, its difficulty, laid
     IN BATTLE      the objectives sit on the battlefield and read the mission's goals; a mission
                    refuses to be saved
     THE END        a won mission's card says MISSION COMPLETE with the mission's own reason,
                    offers the next one, and keeps the result; Retry replays the same mission
     PUT BACK       back on the title the player has their own army and difficulty, and the list
                    marks the mission won */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('campaign');

function centre(sel) {
  var b = document.querySelector(sel), r = b && b.getBoundingClientRect();
  return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
}

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 1100, height: 760 });
  var p = g.page;

  /* the player's own choices: the Dominion, on hard - the first mission is the Compact on easy */
  var before = await p.evaluate(function () {
    rtsSetArmySide('soviet'); rtsSetDiff('hard');
    try { localStorage.removeItem('bw.campaign'); } catch (e) {}
    return { army: rtsArmySide(), diff: window._RTS_DIFF };
  });
  var at = await p.evaluate(centre, '#rtsCampBtn');
  await p.mouse.click(at.x, at.y);
  var list = await p.evaluate(function () {
    var box = document.getElementById('rtsCampList');
    return { open: !box.hidden && box.getBoundingClientRect().height > 50, n: box.querySelectorAll('.mission').length,
             text: box.textContent };
  });
  S.ok('CAMPAIGN opens the four missions with their briefs', list.open && list.n === 4 && list.text.indexOf('Low Water') >= 0 && /tide/i.test(list.text), JSON.stringify({ open: list.open, n: list.n }));

  /* ---------- play ---------- */
  await p.evaluate(function () { document.querySelector('#rtsCampList .mission button').scrollIntoView(); });
  at = await p.evaluate(centre, '#rtsCampList .mission button');
  await p.mouse.click(at.x, at.y);
  await p.waitForFunction(function () { return !!(window._rtsG && window._rtsG.mission && document.getElementById('rcgRts')); }, null, { timeout: 60000 }).catch(function () {});
  var inside = await p.evaluate(function () {
    var G = window._rtsG, m = RTS_CAMPAIGN[0];
    return G ? { seed: G.seed, army: rtsArmySide(), diff: G.diff, id: G.mission && G.mission.id, want: { seed: m.seed, army: m.army, diff: m.diff } } : null;
  });
  S.ok('a real click on PLAY opens the mission: its seed, army and difficulty, laid', !!inside && inside.id === 'lowwater' && inside.seed === inside.want.seed &&
       inside.army === inside.want.army && inside.diff === inside.want.diff, JSON.stringify(inside));

  var hud = await p.evaluate(function () {
    _rtsSyncSidebar(0);
    var el = document.getElementById('rtsGoals'), r = el.getBoundingClientRect();
    var saved = rtsSaveGame();
    return { shown: !el.hidden && r.width > 40 && r.height > 20, spans: el.querySelectorAll('span').length, text: el.textContent, saved: saved, msg: window._rtsG.msg };
  });
  S.ok('the objectives sit on the battlefield and read the mission\'s goals', hud.shown && hud.spans === 2 && /convoy/i.test(hud.text), JSON.stringify(hud));
  S.ok('...and a mission refuses to be saved, and says so', hud.saved === false && /cannot be saved/.test(hud.msg || ''), JSON.stringify({ saved: hud.saved, msg: hud.msg }));

  /* ---------- the end ---------- */
  var card = await p.evaluate(function () {
    var G = window._rtsG;
    if (!G || !G.mission) return { text: '', btns: [], stored: null, next: '' };   /* fail on the assertion, not a throw */
    if (window._rtsUI) window._rtsUI.dead = true;
    G.t = 140; G.over = 'win'; G.mission.why = 'The convoy is across, and the sea is closing behind it.';
    _rtsSyncSidebar(0);
    var o = document.getElementById('rtsOver');
    return { text: o.textContent, btns: Array.prototype.map.call(o.querySelectorAll('button'), function (b) { return b.textContent; }),
             stored: localStorage.getItem('bw.campaign'), next: RTS_CAMPAIGN[1].name };
  });
  S.ok('a won mission\'s card says so, with the mission\'s own reason, and offers the next', /MISSION COMPLETE/.test(card.text) && /convoy is across/.test(card.text) &&
       card.btns[0] === 'Next: ' + card.next && card.btns.indexOf('Retry') >= 0 && card.btns.indexOf('Missions') >= 0, JSON.stringify(card.btns));
  S.ok('...and keeps the result', !!card.stored && (JSON.parse(card.stored).lowwater || {}).won === true, card.stored);

  var again = await p.evaluate(function () {
    rtsRestart();
    /* a deadline in time, not in polls: under SwiftShader a skirmish's frames stretch every poll */
    var until = Date.now() + 30000;
    return new Promise(function (res) {
      (function wait() {
        var G = window._rtsG;
        if (G && G.mission && document.getElementById('rcgRts') && !G.over) return res({ id: G.mission.id, seed: G.seed, army: rtsArmySide() });
        if (G && !G.mission && document.getElementById('rcgRts')) return res({ id: null, seed: G.seed, army: rtsArmySide() });
        if (Date.now() > until) return res(null);
        setTimeout(wait, 100);
      })();
    });
  });
  S.ok('Retry replays the same mission', !!again && again.id === 'lowwater' && again.army === 'allied', JSON.stringify(again));

  /* ---------- put back ---------- */
  var home = await p.evaluate(function () {
    rtsClose();
    rtsCampToggle(); if (document.getElementById('rtsCampList').hidden) rtsCampToggle();
    return { army: rtsArmySide(), diff: window._RTS_DIFF, mission: window._RTS_MISSION, title: !document.getElementById('rtsHome').classList.contains('gone'),
             won: document.querySelectorAll('#rtsCampList .mission.won').length };
  });
  S.ok('back on the title the player has their own army and difficulty', home.title && home.army === before.army && home.diff === before.diff && !home.mission,
       JSON.stringify(home) + ' (theirs ' + JSON.stringify(before) + ')');
  S.eq('...and the list marks the mission won', home.won, 1);

  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');
  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
