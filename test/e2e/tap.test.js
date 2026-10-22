/* A TAP PRESSES A BUTTON EVEN WHEN THE BROWSER SENDS NO CLICK (ui/tap.js).

   Reported from an iPhone, installed app, Survival: Ships switched, Vehicles did nothing, tap
   after tap. Every button in the battle acted on `click` alone, and Safari does not always
   follow a tap with one. It withholds the click when it decides the tap only hovered, and the
   game changes something on the page every frame. Chromium always sends the click, so every
   tap in this suite passed while the phone failed.

   So this spec takes the click away, the way Safari did: every TRUSTED click (the one the
   browser makes from a tap) is stopped at the window before any handler sees it. ui/tap.js
   presses the button itself with an untrusted click(), and that one is let through. A mouse
   click on a tab is the control: it is trusted, so it is stopped, and nothing switches. Then:

   - every tab the army has switches the build list, in the order the report gives (Ships, then
     Vehicles) and the rest after it. The tabs are counted first, so the check cannot pass
     over a tab row with nothing in it.
   - REPAIR arms and disarms, and a build tile starts a job, with no click from the browser.
   - with clicks back on, one tap is ONE press. The browser's click and ours would both press a
     toggle, and REPAIR would arm and disarm in the same tap, which looks like nothing.
   - a finger that slides off is a scroll, not a press, and a held tile pauses its job without
     the release also pressing the tile. */

var { chromium, devices } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('tap');

(async function () {
  var browser = await chromium.launch();
  /* the reporter's phone, held upright */
  var g = await openPage(browser, { device: devices['iPhone 14 Pro Max'] });
  var p = g.page;
  await g.start(7, 10, { freeze: true });
  await p.evaluate(function () {
    window.__drop = true;
    window.__n = { tab: 0, mode: 0, item: 0, cancel: 0, dropped: 0 };
    window.addEventListener('click', function (e) {
      if (window.__drop && e.isTrusted) { e.stopImmediatePropagation(); e.preventDefault(); window.__n.dropped++; }
    }, true);
    /* counted at the global, which is what the inline onclick and the tile's handler call */
    ['rtsTab:tab', 'rtsMode:mode', '_rtsItemClick:item', '_rtsItemCancel:cancel'].forEach(function (s) {
      var k = s.split(':'), f = window[k[0]];
      window[k[0]] = function () { window.__n[k[1]]++; return f.apply(this, arguments); };
    });
  });
  function centre(sel) {
    return p.evaluate(function (sel) {
      var b = document.querySelector(sel);
      if (!b) return null;
      var r = b.getBoundingClientRect();
      return [r.left + r.width / 2, r.top + r.height / 2];
    }, sel);
  }
  async function tap(sel) {
    var c = await centre(sel);
    if (!c) return false;
    await p.touchscreen.tap(c[0], c[1]);
    await p.waitForTimeout(80);
    return true;
  }
  function state() {
    return p.evaluate(function () {
      return { cat: window._rtsUI.cat, mode: window._rtsUI.mode || null, n: Object.assign({}, window.__n),
               tiles: document.querySelectorAll('#rtsList .rts-tile').length };
    });
  }
  function drop(on) { return p.evaluate(function (on) { window.__drop = on; }, on); }

  /* ---- the population: the tabs this army has, Ships and Vehicles among them ---- */
  var cats = await p.evaluate(function () {
    return Array.prototype.filter.call(document.querySelectorAll('#rcgRts .rts-tabs button'),
      function (b) { return !b.hidden; }).map(function (b) { return b.getAttribute('data-cat'); });
  });
  S.ok('the army has a Ships tab and a Vehicles tab to tap', cats.indexOf('ship') >= 0 && cats.indexOf('vehicle') >= 0,
       cats.join(', '));

  /* ---- the control: with clicks taken away, a real click (a mouse's) presses nothing ---- */
  var mc = await centre('#rcgRts .rts-tabs button[data-cat="air"]');
  await p.mouse.click(mc[0], mc[1]);
  await p.waitForTimeout(80);
  var ctl = await state();
  S.ok('with the browser\'s clicks taken away, a click alone switches nothing (control)',
       ctl.cat === 'struct' && ctl.n.dropped >= 1 && ctl.n.tab === 0,
       ctl.n.dropped + ' dropped, tab ' + ctl.cat);

  /* ---- no click from the browser: every tab, Ships then Vehicles as reported ---- */
  var order = ['ship', 'vehicle'].concat(cats.filter(function (c) { return c !== 'ship' && c !== 'vehicle'; }));
  var bad = [];
  for (var i = 0; i < order.length; i++) {
    await tap('#rcgRts .rts-tabs button[data-cat="' + order[i] + '"]');
    var st = await state();
    var on = await p.evaluate(function (c) {
      var b = document.querySelector('#rcgRts .rts-tabs button[data-cat="' + c + '"]');
      return !!b && b.className === 'on';
    }, order[i]);
    if (st.cat !== order[i] || !on || !st.tiles) bad.push(order[i] + ' gave ' + st.cat + (on ? '' : ', not lit') + ', ' + st.tiles + ' tiles');
  }
  S.ok('EVERY TAB SWITCHES ON A TAP with no click from the browser (Ships, then Vehicles)', !bad.length,
       bad.join('; ') || order.join(' → '));

  await tap('#rcgRts .rts-ops button[data-mode="repair"]');
  var armed = (await state()).mode;
  await tap('#rcgRts .rts-ops button[data-mode="repair"]');
  var disarmed = (await state()).mode;
  S.ok('REPAIR arms and disarms on a tap with no click', armed === 'repair' && disarmed === null,
       'armed ' + armed + ', then ' + disarmed);

  await tap('#rcgRts .rts-tabs button[data-cat="infantry"]');
  var n0 = (await state()).n.item;
  await tap('#rtsList .rts-tile');
  S.eq('a build tile starts its job on a tap with no click', (await state()).n.item - n0, 1);

  /* ---- clicks back on: one tap is one press, not ours and the browser's ---- */
  await drop(false);
  var a = (await state()).n;
  await tap('#rcgRts .rts-tabs button[data-cat="vehicle"]');
  await tap('#rcgRts .rts-ops button[data-mode="repair"]');
  var b2 = await state();
  S.ok('one tap is one press when the browser clicks as well',
       b2.n.tab - a.tab === 1 && b2.n.mode - a.mode === 1 && b2.mode === 'repair' && b2.cat === 'vehicle',
       'rtsTab ×' + (b2.n.tab - a.tab) + ', rtsMode ×' + (b2.n.mode - a.mode) + ', REPAIR ' + b2.mode);
  await tap('#rcgRts .rts-ops button[data-mode="repair"]');

  /* ---- a slide is not a press; a hold is not a press ---- */
  var t = await g.touch(), c = await centre('#rcgRts .rts-tabs button[data-cat="ship"]');
  var before = await state();
  await t.start(c[0], c[1]);
  await t.move(c[0] + 40, c[1] + 40);
  await t.move(c[0] + 80, c[1] + 80);
  await t.end();
  await p.waitForTimeout(80);
  var slid = await state();
  S.ok('a finger that slides off a tab does not press it', slid.cat === before.cat && slid.n.tab === before.n.tab,
       'tab ' + before.cat + ' → ' + slid.cat);

  var tc = await centre('#rtsList .rts-tile');
  var h0 = (await state()).n;
  await t.start(tc[0], tc[1]);
  await p.waitForFunction(function (k) { return window.__n.cancel > k; }, h0.cancel, { timeout: 5000 }).catch(function () {});
  await t.end();
  await p.waitForTimeout(80);
  var h1 = (await state()).n;
  S.ok('a held tile pauses its job, and letting go does not also press it',
       h1.cancel - h0.cancel === 1 && h1.item === h0.item,
       'cancel ×' + (h1.cancel - h0.cancel) + ', press ×' + (h1.item - h0.item));

  var errs = g.errors.filter(function (e) { return !/ServiceWorker/.test(e); });
  S.ok('no page errors', !errs.length, errs.join(' | ') || 'none');
  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})();
