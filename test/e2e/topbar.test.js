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

/* Five now. The reload button is listed FIRST because it is leftmost in the group, and adding
   it here is the whole of what makes it covered: every measurement below - painted over,
   buried, overflowing the bar, under 40px for a finger, pushing the page sideways - runs over
   this list at all eight shapes. A fifth control on a 360px bar is exactly the case the flex
   group was built for, and this is where that claim gets tested rather than asserted. */
var CONTROLS = ['#rtsReloadBtn', '#rtsSaveBtn', '#rtsLoadBtn', '#rtsMute', '#rcgRts .rts-x'];

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
               docW: document.documentElement.scrollWidth,
               vs: (function () {
                 var v = document.querySelector('#rcgRts .rts-vs'),
                     h = document.querySelector('#rcgRts .rts-help'),
                     d = document.querySelector('#rcgRts .rts-vs .dif');
                 return { over: v ? v.scrollWidth - v.clientWidth : -1,
                          dif: d ? d.textContent : '',
                          help: !!(h && h.getClientRects().length && h.textContent.trim()) };
               })() };
    }, [CONTROLS]);

    var tag = sh.n + ' ' + sh.w + 'x' + sh.h + ': ';
    S.eq(tag + 'every corner control is on screen', r.n, CONTROLS.length);
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
    /* THE DIFFICULTY BADGE READS IN FULL WHERE THERE IS ROOM. The hint beside it had no shrink
       rule, so on a 1280px desktop it kept its width and the army line was ellipsised instead:
       the badge read "SO..." and then, with a 1000:1 ratio, "SOLDIE...". Population first: the
       badge and the hint must both be in the bar, or a clean army line proves nothing. On a
       phone the army line is allowed to give way, which is what it is there for. */
    if (sh.w >= 900) {
      S.ok(tag + 'the difficulty badge is in the army line', !!r.vs.dif, JSON.stringify(r.vs.dif));
      S.ok(tag + '...beside the hint it competes with', r.vs.help, String(r.vs.help));
      S.ok(tag + '...and the army line is not cut short', r.vs.over <= 0,
           r.vs.over + 'px clipped, badge "' + r.vs.dif + '"');
    }
    await o.ctx.close();
  }

  /* ------------------------------------- the superweapon row keeps to its own row -------- */
  /* It shared the sidebar grid's one flexible row - `minmax(0,1fr)`, which the build grid draws
     its height from - so on a short screen that row squeezed toward nothing while the buttons
     kept their size and spilled into the row below, drawn across the selection readout.
     Measured with a Missile Silo and a Chronosphere standing: 24px of overlap at 360, 21px at
     390, 20px at 375, clear only at 412. It has an `auto` row of its own now, which cannot be
     squeezed, and the build grid spans one more row to keep the height it lost. */
  for (var si = 0; si < SHAPES.length; si++) {
    if (!SHAPES[si].touch) continue;
    var so = await open(SHAPES[si]);
    var sup = await so.page.evaluate(function () {
      var G = window._rtsG, yd = _rtsHas('player', 'yard');
      /* Stand up enough of a base to charge two superweapons - the row is empty otherwise and
         a spec that measured an empty row would pass on the broken build too. */
      ['power', 'refinery', 'barracks', 'factory', 'radar', 'lab', 'mslo', 'pdox'].forEach(function (k) {
        if (_rtsHas('player', k)) return;
        var tx = _rtsTX(yd.x), tz = _rtsTX(yd.z);
        for (var r = 2; r <= 24; r++)
          for (var ox = -r; ox <= r; ox++) for (var oz = -r; oz <= r; oz++) {
            if (Math.max(Math.abs(ox), Math.abs(oz)) !== r) continue;
            if (_rtsCanPlace('player', k, tx + ox, tz + oz)) {
              _rtsPlaceStruct('player', k, tx + ox, tz + oz, true); return;
            }
          }
      });
      G.ents.forEach(function (e) {
        if (e.type === 'struct' && e.side === 'player' && e.building) { e.building = 0; e.bprog = 1; }
      });
      _rtsRecalcPower('player'); _rtsSuperRow(); _rtsSyncSidebar(0);
      function bx(q) {
        var e = document.querySelector(q);
        if (!e || !e.getClientRects().length) return null;
        var r2 = e.getBoundingClientRect();
        return { t: r2.top, b: r2.bottom, l: r2.left, r: r2.right, h: r2.height, n: e.children.length };
      }
      function ov(a, c) {
        if (!a || !c) return 0;
        var vy = Math.min(a.b, c.b) - Math.max(a.t, c.t), vx = Math.min(a.r, c.r) - Math.max(a.l, c.l);
        return (vy > 0.5 && vx > 0.5) ? vy : 0;
      }
      var row = bx('#rtsSupers');
      return { n: row ? row.n : 0, overSel: ov(row, bx('#rtsSel')),
               overGrid: ov(row, bx('#rcgRts .rts-mid')),
               gridH: Math.round((bx('#rtsList') || {}).h || 0) };
    });
    var st = SHAPES[si].n + ' ' + SHAPES[si].w + 'x' + SHAPES[si].h + ': ';
    S.ok(st + 'the superweapon row has buttons to place', sup.n >= 2, sup.n + ' buttons');
    S.eq(st + '...and none of them is drawn over the selection readout', Math.round(sup.overSel), 0);
    S.eq(st + '...nor over the build grid', Math.round(sup.overGrid), 0);
    S.ok(st + '...and the build grid still has usable height', sup.gridH > 100, sup.gridH + 'px');
    await so.ctx.close();
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
    /* THE LONGEST BUILD ON OFFER, so the job is still running when the holds land. The match runs
       in real time while the harness delivers each touch - a second or more a frame on
       SwiftShader - and a short one finished between the presses: "Place the finished building
       first." instead of a hold, on a slow frame. */
    var k = Object.keys(U.btns).filter(function (x) { return !_rtsWhyLocked('player', x) && rtsStructDef(x); })
      .sort(function (a, b) { return (rtsStructDef(b).build || 0) - (rtsStructDef(a).build || 0); })[0];
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
  /* A HOLD LASTS UNTIL IT HAS TAKEN, not a fixed 600ms. The cameo starts a 350ms timer on
     touchstart and clears it on touchend (src/ui/sidebar.js); on a frame SwiftShader takes a
     second or two to draw, both events can queue behind that frame, the touchend run first, and
     the timer never fire - a "hold" the page saw as a tap. So the finger stays down until the
     game says the hold happened, and a hold that never happens runs out the wait and fails the
     assertion after it, which is what a check should do. */
  async function hold(sel, took) {
    var b = await t.page.evaluate(function (q) {
      var r2 = document.querySelector(q).getBoundingClientRect();
      return { x: r2.left + r2.width / 2, y: r2.top + r2.height / 2 };
    }, sel);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b.x, y: b.y }] });
    await t.page.waitForFunction(took, null, { timeout: 30000 }).catch(function () {});
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
  /* A TAP IS A TAP: down and up at once. With the finger held 120 ms, a page three specs are
     sharing a machine with could run the cameo's 350 ms hold timer before it saw the finger lift,
     and a tap became a hold on a job that did not exist yet */
  await press('#probeTile', 0);
  /* and the tap has TAKEN before it is read, for the same reason as the hold below: with other
     specs sharing the machine a frame can outlast a fixed wait, and "queued null" was a tap the
     page had not processed yet, not one it refused */
  await t.page.waitForFunction(function () { return !!window._rtsG.sides.player.q.struct; }, null, { timeout: 30000 }).catch(function () {});
  var q1 = await q();
  S.ok('a tap starts a job', q1.key !== null, 'queued ' + q1.key + ' — "' + q1.msg + '"');
  await t.page.evaluate(function () { for (var i = 0; i < 120; i++) _rtsTick(1 / 60); });
  var q2 = await q();
  S.ok('...and it charges as it builds, which is why stopping it matters', q2.paid > 0,
       q2.paid + ' credits spent so far');
  await hold('#probeTile', function () { var j = window._rtsG.sides.player.q.struct; return !!(j && j.hold); });
  var q3 = await q();
  S.ok('a press and hold puts it on hold', q3.hold, '"' + q3.msg + '"');
  var moneyHeld = q3.money;
  await hold('#probeTile', function () { return !window._rtsG.sides.player.q.struct; });
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
  /* THE SECOND PRESS GOES THROUGH THE BUTTON'S OWN click(), not the harness's pointer, and IN
     THE SAME STEP as reading the armed state. The window it has to land in is five seconds of a
     person's time, and on a loaded machine each round trip to the page can take seconds - a
     real pointer press took 7 to 9s, and even a separate evaluate after the read landed after
     the button had disarmed in a full run. The first press above is the real one and proves the
     button is reachable; this one still runs the markup's wiring, which is the point of not
     calling rtsQuitClick() directly. */
  var quit1 = await x.page.evaluate(function () {
    var o = { still: !!document.getElementById('rcgRts'),
              msg: window._rtsG ? window._rtsG.msg : '',
              armed: /arm/.test((document.getElementById('rtsQuitBtn') || {}).className || '') };
    if (o.still) { document.getElementById('rtsQuitBtn').click(); o.gone = !document.getElementById('rcgRts'); }
    return o;
  });
  var gone = !!quit1.gone;
  var quit = { afterOne: quit1.still, msg: quit1.msg, armed: quit1.armed, afterTwo: !gone };
  S.ok('one press on ✕ does not end the battle', quit.afterOne, '');
  S.ok('...it asks, in words', /press ✕ again/i.test(quit.msg || ''), JSON.stringify(quit.msg));
  S.ok('...and the button shows it is armed', quit.armed, '');
  S.eq('a second press does end it', quit.afterTwo, false);
  await x.ctx.close();

  /* ------------------------------------------- ⟳ asks first, and then really reloads ------
     A reload throws the battle away exactly as quitting does, so it arms the same way. Clicked
     rather than called, for the reason stated on the quit block above.

     The second half is the interesting one. It is easy to write a spec that proves the button
     is wired to a function and proves nothing about whether that function does anything, so
     the caches and the service-worker registry are replaced with fakes that RECORD INTO
     sessionStorage - which survives the navigation the button then performs. Playwright waits
     for that navigation, and the markers are read back out of the reloaded page. If the button
     stopped clearing caches, or stopped reloading at all, this fails. */
  var rl = await open(SHAPES[2]);
  await rl.page.evaluate(function () {
    sessionStorage.clear();
    /* Two stale caches to find, and a registration to update. defineProperty rather than plain
       assignment: `caches` is a READ-ONLY attribute on window, so `window.caches = {...}` fails
       silently in a secure context and the real (empty) store is used - which is exactly how
       the first run of this block reported zero caches dropped and looked like a product bug. */
    try {
      Object.defineProperty(window, 'caches', {
        configurable: true,
        value: {
          keys: function () { return Promise.resolve(['stale-v1', 'stale-v2']); },
          delete: function (k) {
            sessionStorage.setItem('killed:' + k, '1');
            return Promise.resolve(true);
          }
        }
      });
    } catch (e) { sessionStorage.setItem('nocaches', String(e && e.message)); }
    try {
      Object.defineProperty(navigator, 'serviceWorker', {
        configurable: true,
        value: { getRegistrations: function () {
          return Promise.resolve([{ update: function () {
            sessionStorage.setItem('updated', '1');
            return Promise.resolve();
          } }]);
        } }
      });
    } catch (e) { sessionStorage.setItem('nosw', String(e && e.message)); }
  });
  await rl.page.click('#rtsReloadBtn');
  /* GUARDED, because the failure this asserts against DESTROYS THE PAGE. A build that reloaded
     on the first press navigated here, and every step afterwards - the evaluate, the second
     click, the wait - failed against a context that no longer existed, so the mutation surfaced
     as a TimeoutError and a stack trace instead of as the one assertion that describes it.
     A thrown spec is still a red spec, but it does not say what went wrong. */
  var rel1;
  try {
    rel1 = await rl.page.evaluate(function () {
      return { still: !!document.getElementById('rcgRts'),
               msg: window._rtsG ? window._rtsG.msg : '',
               armed: /arm/.test((document.getElementById('rtsReloadBtn') || {}).className || ''),
               /* and NOT the quit button's red - two questions, two colours */
               red: /rts-x/.test((document.getElementById('rtsReloadBtn') || {}).className || '') };
    });
  } catch (e) { rel1 = { still: false, msg: 'the page navigated: ' + (e && e.message), armed: false, red: false }; }
  S.ok('one press on ⟳ does not reload', rel1.still, rel1.still ? '' : rel1.msg);
  S.ok('...it asks, in words', /press ⟳ again/i.test(rel1.msg || ''), JSON.stringify(rel1.msg));
  S.ok('...and the button shows it is armed', rel1.armed, '');
  S.ok('...armed as itself rather than as the quit button', !rel1.red, '');

  var didNav = false;
  if (rel1.still) {
    var navigated = rl.page.waitForNavigation({ timeout: 8000 }).then(function () { return true; },
                                                                      function () { return false; });
    /* through the button's own click(), for the reason the second ✕ press gives above */
    await rl.page.evaluate(function () { document.getElementById('rtsReloadBtn').click(); }).catch(function () {});
    didNav = await navigated;
    S.ok('a second press really does reload the page', didNav, String(didNav));
  }
  if (didNav) {
    await rl.page.waitForFunction(function () { return typeof window.rtsOpen === 'function'; });
    var marks = await rl.page.evaluate(function () {
      return { killed: Object.keys(sessionStorage).filter(function (k) { return /^killed:/.test(k); }).sort(),
               updated: sessionStorage.getItem('updated'),
               nosw: sessionStorage.getItem('nosw'), nocaches: sessionStorage.getItem('nocaches') };
    });
    /* If a stub could not be installed, say so rather than reporting on the real browser's
       empty cache store and calling it a pass. */
    S.ok('the fakes were installed, so this is measuring the button and not the browser',
         !marks.nocaches && !marks.nosw, (marks.nocaches || '') + ' ' + (marks.nosw || ''));
    /* THE POINT OF THE BUTTON. sw.js is network-only today, but a service worker deployed
       BEFORE it was may have left Cache Storage behind, and those entries outlive the worker
       that wrote them - so EVERY cache is dropped, not just one this build recognises. */
    S.eq('...having dropped every cache it found, not just its own',
         marks.killed.join(','), 'killed:stale-v1,killed:stale-v2');
    S.eq('...and asked the service worker to re-check itself', marks.updated, '1');
  }
  await rl.ctx.close();

  await browser.close();
  srv.srv.close();
  require('../lib/report.js')(S);
})();
