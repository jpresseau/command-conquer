/* The in-match interface on a phone: the top bar, and the one gesture the sidebar did not have.

   THE BAR. Four controls sat at `position:absolute; right:6/34/62/90`, so the bar's flex layout
   did not know they existed and the army/difficulty line ran underneath them. Measured across
   the eight shapes below, before:

     360x640   .rts-vs under Save by 24px, under Load by 24px, under Mute by 4px
     375x667   under Save 24px, under Load 17px
     390x664   under Save 24px, under Load 2px
     412x732   under Save 8px
     667x375   the title wrapped to two lines inside a 26px bar

   Every control was 24x24 with 4px gaps - and the ✕ that ends the match, with no autosave and
   no second slot, sat four pixels from the mute button a player presses casually and acted
   immediately. src/style.css already recorded this project's own floor, for the title screen's
   file pickers: 35px was "under every touch-target guideline going".

   THE GESTURE. Hold-to-pause and hold-again-to-cancel existed only as `oncontextmenu`, and not
   one touch handler in the app was bound to the sidebar - every one is on the battlefield canvas
   or the radar. So on a phone a job could be started and never paused, never cancelled and never
   refunded, while _rtsQueue charges progressively: one mis-tap on a 2,000-credit cameo drained
   the treasury with no way to stop it. The only instruction on screen said "right-click". */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { serve } = require('../lib/game.js');

var S = new Suite('topbar');

/* Four portrait phones, two landscapes and a desktop control. */
var SHAPES = [
  { n: 'iPhone SE', w: 375, h: 667, touch: true },
  { n: 'small android', w: 360, h: 640, touch: true },
  { n: 'iPhone 13', w: 390, h: 664, touch: true },
  { n: 'Pixel 7', w: 412, h: 732, touch: true },
  { n: 'iPhone 14 Pro Max', w: 430, h: 739, touch: true },
  { n: 'SE landscape', w: 667, h: 375, touch: true },
  { n: 'phone landscape', w: 844, h: 390, touch: true },
  { n: 'desktop', w: 1280, h: 900, touch: false }
];

var CONTROLS = ['#rtsSaveBtn', '#rtsLoadBtn', '#rtsMute', '#rcgRts .rts-x'];

(async function () {
  var srv = await serve();
  var browser = await chromium.launch();

  async function open(sh) {
    var ctx = await browser.newContext({ viewport: { width: sh.w, height: sh.h },
      deviceScaleFactor: 2, isMobile: sh.touch, hasTouch: sh.touch });
    var page = await ctx.newPage();
    await page.goto(srv.url, { waitUntil: 'load' });
    await page.waitForFunction(function () { return typeof window.rtsOpen === 'function'; });
    await page.evaluate(function () { rtsOpen(7); });
    await page.waitForTimeout(350);
    return { ctx: ctx, page: page };
  }

  /* -------------------------------------------------------------- the bar ---------------- */
  for (var i = 0; i < SHAPES.length; i++) {
    var sh = SHAPES[i];
    var o = await open(sh);
    var r = await o.page.evaluate(function (a) {
      var CONTROLS = a[0];
      function box(q) {
        var e = document.querySelector(q);
        if (!e || !e.getClientRects().length) return null;
        var b = e.getBoundingClientRect();
        return { q: q, l: b.left, r: b.right, t: b.top, b: b.bottom, w: b.width, h: b.height };
      }
      var btns = CONTROLS.map(box).filter(Boolean);
      /* THE CONTAINERS, not their children. `.rts-vs` clips with overflow:hidden, so a
         difficulty pill whose rect runs under a button is drawn cut off at the container's
         edge and is not painted over anything. Measuring the child reports an overlap that is
         not on the screen; measuring the box that does the clipping reports what is. */
      var texts = ['#rcgRts .rts-vs', '#rcgRts .rts-title'].map(box).filter(Boolean);
      var clash = [];
      texts.forEach(function (t) {
        btns.forEach(function (b2) {
          var vx = Math.min(t.r, b2.r) - Math.max(t.l, b2.l);
          var vy = Math.min(t.b, b2.b) - Math.max(t.t, b2.t);
          if (vx > 0.5 && vy > 0.5) clash.push(t.q + ' under ' + b2.q + ' by ' + vx.toFixed(0) + 'px');
        });
      });
      /* Each control must be the topmost thing at its own centre, or it cannot be pressed. */
      var buried = btns.filter(function (b2) {
        var e = document.elementFromPoint((b2.l + b2.r) / 2, (b2.t + b2.b) / 2);
        return !e || !(e.matches(b2.q) || e.closest('#rtsSaveBtn,#rtsLoadBtn,#rtsMute,.rts-x'));
      }).map(function (b2) { return b2.q; });
      var sorted = btns.slice().sort(function (x, y) { return y.l - x.l; });
      var gaps = [];
      for (var k = 1; k < sorted.length; k++) gaps.push(sorted[k - 1].l - sorted[k].r);
      /* the destructive one is the rightmost; how far is it from its neighbour? */
      var quitGap = gaps.length ? gaps[0] : 0;
      var bar = box('#rcgRts .rts-top');
      var over = btns.filter(function (b2) { return bar && (b2.t < bar.t - 0.5 || b2.b > bar.b + 0.5); })
        .map(function (b2) { return b2.q; });
      return { n: btns.length, sizes: btns.map(function (b2) { return b2.w + 'x' + b2.h; }),
               min: Math.min.apply(null, btns.map(function (b2) { return Math.min(b2.w, b2.h); })),
               clash: clash, buried: buried, quitGap: quitGap, overflow: over,
               docW: document.documentElement.scrollWidth };
    }, [CONTROLS]);

    var tag = sh.n + ' ' + sh.w + 'x' + sh.h + ': ';
    S.eq(tag + 'all four corner controls are on screen', r.n, CONTROLS.length);
    S.ok(tag + 'nothing in the bar is painted over a control', !r.clash.length,
         r.clash.join('; ') || 'clear');
    S.ok(tag + 'every control is the topmost thing at its own centre', !r.buried.length,
         r.buried.join(', ') || 'all reachable');
    S.ok(tag + 'no control overflows the bar it sits in', !r.overflow.length,
         r.overflow.join(', ') || 'contained');
    if (sh.touch) {
      /* The floor this file already states for the title screen's file pickers. */
      S.ok(tag + 'every control is at least 40px for a finger', r.min >= 40,
           r.sizes.join(' '));
      /* The ✕ ends the match. It must not be a neighbour of the button people press to mute. */
      S.ok(tag + 'the quit button is set apart from the one beside it', r.quitGap >= 10,
           r.quitGap.toFixed(0) + 'px from its neighbour');
    }
    S.ok(tag + 'the page does not scroll sideways', r.docW <= sh.w, r.docW + 'px wide');
    await o.ctx.close();
  }

  /* --------------------------------------------- the radar's own placeholder ------------- */
  /* Its backing store is sized to the map (188px) and the element is shown at whatever the
     layout gives it - 84px on a phone. A font set in backing-store units therefore renders at
     84/188 of its nominal size: `bold 11px` drew this label at 4.9 CSS pixels. */
  var ro = await open(SHAPES[0]);
  var radar = await ro.page.evaluate(function () {
    var mini = document.getElementById('rtsMini');
    var css = mini.getBoundingClientRect().width, back = mini.width;
    var seen = [];
    var g = mini.getContext('2d'), realFill = g.fillText.bind(g);
    var fonts = [];
    Object.defineProperty(g, 'font', {
      get: function () { return this._f || ''; },
      set: function (v) { this._f = v; fonts.push(v); }
    });
    g.fillText = function (t, x, y) { seen.push(t); return realFill(t, x, y); };
    _rtsDrawMini();
    /* every px size the placeholder asked for, converted back to what the player sees */
    var cssPx = fonts.map(function (f) {
      var m = /([\d.]+)px/.exec(f); return m ? +(parseFloat(m[1]) * css / back).toFixed(1) : null;
    }).filter(function (x) { return x !== null; });
    return { css: css, back: back, texts: seen, cssPx: cssPx,
             smallest: cssPx.length ? Math.min.apply(null, cssPx) : null };
  });
  S.note('radar: ' + radar.back + 'px backing shown at ' + radar.css + 'px, drew ' +
         JSON.stringify(radar.texts));
  S.ok('the radar placeholder says what is missing', radar.texts.length >= 2,
       radar.texts.join(' / '));
  S.ok('...at a size a person can read, not 4.9 CSS pixels', radar.smallest >= 8,
       'smallest ' + radar.smallest + ' CSS px (sizes ' + radar.cssPx.join(', ') + ')');
  await ro.ctx.close();

  /* --------------------------------------------- hold and cancel, with a finger ---------- */
  var t = await open(SHAPES[2]);
  var cdp = await t.ctx.newCDPSession(t.page);
  await t.page.evaluate(function () {
    window._rtsG.sides.player.credits = 20000;
    rtsTab('struct'); _rtsSyncSidebar(0);
    var U = window._rtsUI;
    var k = Object.keys(U.btns).filter(function (x) { return !_rtsWhyLocked('player', x); })[0];
    U.btns[k].id = 'probeTile';
    window.__k = k;
  });
  async function press(sel, ms) {
    var b = await t.page.evaluate(function (q) {
      var r2 = document.querySelector(q).getBoundingClientRect();
      return { x: r2.left + r2.width / 2, y: r2.top + r2.height / 2 };
    }, sel);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b.x, y: b.y }] });
    await t.page.waitForTimeout(ms);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await t.page.waitForTimeout(120);
  }
  function q() {
    return t.page.evaluate(function () {
      var j = window._rtsG.sides.player.q.struct;
      return { key: j ? j.key : null, hold: j ? !!j.hold : false,
               paid: j ? Math.round(j.paid) : 0, msg: window._rtsG.msg,
               money: Math.round(rtsMoney(window._rtsG.sides.player)),
               tip: document.getElementById('probeTile').title };
    });
  }
  await press('#probeTile', 120);
  var q1 = await q();
  S.ok('a tap starts a job', q1.key !== null, 'queued ' + q1.key + ' — "' + q1.msg + '"');
  await t.page.evaluate(function () { for (var i = 0; i < 120; i++) _rtsTick(1 / 60); });
  var q2 = await q();
  S.ok('...and it charges as it builds, which is why stopping it matters', q2.paid > 0,
       q2.paid + ' credits spent so far');
  await press('#probeTile', 600);
  var q3 = await q();
  S.ok('a press and hold puts it on hold', q3.hold, '"' + q3.msg + '"');
  var moneyHeld = q3.money;
  await press('#probeTile', 600);
  var q4 = await q();
  S.eq('...and holding again abandons it', q4.key, null);
  S.ok('...refunding what had been paid', q4.money > moneyHeld,
       moneyHeld + ' -> ' + q4.money + ' credits');
  S.ok('the cameo tells a phone how to do it, not to right-click',
       /hold/i.test(q4.tip) && !/right-click/i.test(q4.tip), JSON.stringify(q4.tip));
  await t.ctx.close();

  /* ------------------------------------------------- ✕ asks before it throws it away ----- */
  var x = await open(SHAPES[2]);
  /* CLICK THE BUTTON, do not call the function. Calling rtsQuitClick() directly tests the
     confirmation and not the wiring - with the markup pointed straight back at rtsClose() the
     whole block still passed, which is a spec proving something nobody was worried about. */
  await x.page.click('#rtsQuitBtn');
  var quit1 = await x.page.evaluate(function () {
    return { still: !!document.getElementById('rcgRts'),
             msg: window._rtsG ? window._rtsG.msg : '',
             armed: /arm/.test((document.getElementById('rtsQuitBtn') || {}).className || '') };
  });
  var gone = false;
  if (quit1.still) {
    await x.page.click('#rtsQuitBtn');
    gone = await x.page.evaluate(function () { return !document.getElementById('rcgRts'); });
  }
  var quit = { afterOne: quit1.still, msg: quit1.msg, armed: quit1.armed, afterTwo: !gone };
  S.ok('one press on ✕ does not end the battle', quit.afterOne, '');
  S.ok('...it asks, in words', /press ✕ again/i.test(quit.msg || ''), JSON.stringify(quit.msg));
  S.ok('...and the button shows it is armed', quit.armed, '');
  S.eq('a second press does end it', quit.afterTwo, false);
  await x.ctx.close();

  await browser.close();
  srv.srv.close();
  require('../lib/report.js')(S);
})();
