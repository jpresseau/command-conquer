/* THE DEBRIEF AND THE RECORD, ON THE PAGE (record.js, ui/sidebar.js, title.js):

     THE CARD    a battle won: the end card carries the debrief's rows and the record it joined
     THE TITLE   back on the title, START BATTLE carries the record at the difficulty set, and
                 follows the difficulty picker */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('record');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 1100, height: 760 });
  var p = g.page;
  await p.evaluate(function () { try { localStorage.removeItem('bw.record'); } catch (e) {} rtsSetDiff('normal'); });
  await g.start(7, 2, { freeze: true });
  var card = await p.evaluate(function () {
    var G = window._rtsG;
    G.stats.killed = 5; G.stats.built = 9; G.stats.mined = 2500; G.t = 400; G.over = 'win';
    _rtsSyncSidebar(0);
    var o = document.getElementById('rtsOver');
    return { text: o.textContent, rows: o.querySelectorAll('table.debrief tr').length, rec: (o.querySelector('p.rec') || {}).textContent, stored: localStorage.getItem('bw.record') };
  });
  S.ok('THE CARD: a battle won carries the debrief\'s rows and the record it joined', /VICTORY/.test(card.text) && card.rows === 5 && /Credits mined2500/.test(card.text) &&
       /Units built · lost9 · 0/.test(card.text) && card.rec === 'Soldier: 1 win, 0 losses · fastest 6:40' && /"normal":\{"w":1/.test(card.stored || ''), JSON.stringify(card));

  var title = await p.evaluate(function () {
    rtsClose();
    var n = document.getElementById('rtsRecordNote'), out = { normal: n.textContent };
    rtsSetDiff('hard'); out.hard = n.textContent;
    rtsSetDiff('normal'); out.back = n.textContent;
    return out;
  });
  S.ok('THE TITLE: START BATTLE carries the record at the difficulty set, and follows the picker', title.normal === 'Soldier: 1 win, 0 losses · fastest 6:40' && title.hard === '' && title.back === title.normal,
       JSON.stringify(title));

  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');
  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
