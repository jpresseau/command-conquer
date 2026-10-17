/* THE NEWER SCREENS ON A PHONE (campaign.js, skirmish.js, ui/allymenu.js, style.css, title.css),
   on a touch device at a portrait and a landscape iPhone size:

     THE TITLE      with SKIRMISH SETUP open, every choice can be scrolled to and tapped - none sits
                    under the build stamp pinned bottom-right - and the page never scrolls sideways
     THE LIST       the campaign's PLAY buttons are a finger's height (40px)
     OBJECTIVES     in portrait they are a pill just under the top bar, opened by a tap; in
                    landscape they are written out, also clear of the top bar
     THE END CARD   fits on screen, and its buttons are a finger's height
     THE ALLY       the ally's orders are a finger's height

   Measured before: PLAY 27px, the end card's buttons 31px, the ally's 29px, the objectives a 245x100
   block under a phone's taller top bar, and the 10,000 credits button under the stamp. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('phoneui');
var SIZES = [{ name: 'iPhone SE portrait', w: 375, h: 667 }, { name: 'iPhone landscape', w: 844, h: 390 }];
var UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
function heights(sel) {
  return [].slice.call(document.querySelectorAll(sel)).filter(function (b) { return b.getClientRects().length; })
    .map(function (b) { return Math.round(b.getBoundingClientRect().height); });
}

(async function () {
  var browser = await chromium.launch();
  for (var z = 0; z < SIZES.length; z++) {
    var sz = SIZES[z], tag = sz.name + ' ' + sz.w + 'x' + sz.h;
    var g = await openPage(browser, { device: { viewport: { width: sz.w, height: sz.h }, deviceScaleFactor: 2, userAgent: UA } }), p = g.page;

    var title = await p.evaluate(function () {
      rtsSkirmishToggle();
      var home = document.getElementById('rtsHome'), bad = [], n = 0;
      [].slice.call(document.querySelectorAll('#rtsSkirmish button')).forEach(function (x) {
        n++; x.scrollIntoView({ block: 'nearest' });
        var r = x.getBoundingClientRect(), h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        if (!h || (h !== x && !x.contains(h))) bad.push(x.textContent.trim() + ' under ' + (h ? (h.id || h.className) : 'nothing'));
      });
      return { n: n, bad: bad, sideways: document.documentElement.scrollWidth > innerWidth + 1 };
    });
    S.ok(tag + ': every skirmish choice can be scrolled to and tapped, and nothing scrolls sideways', title.n >= 15 && !title.bad.length && !title.sideways,
         JSON.stringify(title));

    var play = await p.evaluate(function (src) { rtsSkirmishToggle(); rtsCampToggle(); var f = eval('(' + src + ')'); return { h: f('#rtsCampList button'), sel: f('#rtsCampList select.lvl'), of: RTS_CAMPAIGN.length }; }, heights.toString());
    S.ok('...the campaign\'s PLAY buttons are a finger\'s height', play.h.length === play.of && play.h.every(function (h) { return h >= 40; }), play.h.join(',') + ' of ' + play.of);
    S.ok('...and so are its level choices', play.sel.length >= 2 && play.sel.every(function (h) { return h >= 40; }), play.sel.join(','));

    await p.evaluate(function () { rtsCampToggle(); rtsCampStart('lowwater'); });
    await p.waitForFunction(function () { return window._rtsG && window._rtsG.mission && document.getElementById('rtsGoals'); }, null, { timeout: 60000 }).catch(function () {});
    var goals = await p.evaluate(function () {
      if (window._rtsUI) window._rtsUI.dead = true;
      _rtsSyncSidebar(0);
      var el = document.getElementById('rtsGoals'), top = document.querySelector('#rcgRts .rts-top').getBoundingClientRect();
      var a = el.getBoundingClientRect();
      el.click();
      var b = el.getBoundingClientRect();
      return { closed: [Math.round(a.width), Math.round(a.height)], open: [Math.round(b.width), Math.round(b.height)], clear: a.top >= top.bottom - 0.5,
               text: el.textContent.slice(0, 40) };
    });
    if (sz.w < 600) S.ok('...in portrait the objectives are a small pill under the top bar, and a tap opens them', goals.clear && goals.closed[0] < 170 && goals.closed[1] < 40 &&
                         goals.open[1] > goals.closed[1] * 2, JSON.stringify(goals));
    else S.ok('...in landscape the objectives are written out, clear of the top bar', goals.clear && goals.closed[1] > 60, JSON.stringify(goals));

    var card = await p.evaluate(function (src) {
      var G = window._rtsG; G.over = 'win'; G.mission.why = 'The convoy is across, and the sea is closing behind it.'; _rtsSyncSidebar(0);
      var c = document.querySelector('#rtsOver .card').getBoundingClientRect();
      return { fits: c.top >= 0 && c.bottom <= innerHeight, h: eval('(' + src + ')')('#rtsOver button') };
    }, heights.toString());
    S.ok('...the end card fits, and its buttons are a finger\'s height', card.fits && card.h.length === 4 && card.h.every(function (h) { return h >= 40; }), JSON.stringify(card));

    await p.evaluate(function () { rtsClose(); localStorage.setItem('bw.skirmish', JSON.stringify({ foes: 'ally' })); rtsOpen(7); });
    await p.waitForFunction(function () { return window._rtsG && window._rtsG.sides.ally && document.getElementById('rtsAllyBtn'); }, null, { timeout: 60000 }).catch(function () {});
    var ally = await p.evaluate(function (src) { if (window._rtsUI) window._rtsUI.dead = true; rtsAllyMenu(); return eval('(' + src + ')')('#rtsAllyMenu button'); }, heights.toString());
    S.ok('...the ally\'s orders are a finger\'s height', ally.length === 3 && ally.every(function (h) { return h >= 40; }), ally.join(','));

    S.ok('...with no page errors', !g.errors.length, g.errors.slice(0, 2).join(' | ') || 'none');
    await g.close();
  }
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
