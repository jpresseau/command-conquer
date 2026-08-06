/* Turn the phone sideways: does the battlefield fill the screen?

   Reported from an iPhone held in landscape: the game was stranded in the middle of the
   window with the stage's own background colour (#7d94a4) showing down the left and along
   the bottom. The canvas had kept its PORTRAIT size inside a now-wider stage.

   Three separate things are asserted, because they fail for three different reasons:

   1. GEOMETRY AFTER ROTATION. The canvas box must equal the stage box. Checked twice over -
      by arithmetic on the two rectangles, and by sampling the rendered page for the stage's
      background colour, which is only ever visible where the canvas is not.

   2. WHAT ACTUALLY DRIVES THE RESIZE. Chromium fires `resize` with correct measurements, so a
      plain rotation test would pass with or without the fix - it would be measuring Chromium,
      not the code. iOS is the one that fires `resize` mid-animation with stale values. To
      stand in for that, the `resize` listener is UNBOUND and the viewport rotated again: only
      the ResizeObserver can recover from that, which is the same job it does on the phone.

   3. THE SIDEBAR'S SHARE. On an 844x390 screen a fixed 244px bar is nearly a third of the
      display. The battlefield is the thing being looked at and must hold the clear majority. */

var { chromium, devices } = require('playwright');
var { serve } = require('../lib/game.js');


var STAGE_BG = [0x7d, 0x94, 0xa4];
(async function () {
  var s = await serve();
  var srv = s.srv, PAGE = s.url;
var browser = await chromium.launch();
  var ctx = await browser.newContext(Object.assign({}, devices['iPhone 13'], { isMobile: true }));
  var page = await ctx.newPage();
  var errs = [];
  page.on('pageerror', function (e) { errs.push(String(e)); });
  await page.goto(PAGE, { waitUntil: 'load' });
  await page.waitForFunction(function () { return typeof window.rtsOpen === 'function'; });

  await page.evaluate(function () {
    rtsOpen(7);
    for (var i = 0; i < 60 * 20; i++) _rtsTick(1 / 60);
  });
  await page.waitForTimeout(400);

  /* Everything the eye would check, in numbers. */
  function geom() {
    return page.evaluate(function () {
      function box(el) { var r = el.getBoundingClientRect(); return { x:r.left, y:r.top, w:r.width, h:r.height }; }
      var st = document.querySelector('#rcgRts .rts-stage');
      var cv = document.getElementById('rtsCv');
      var bar = document.querySelector('#rcgRts .rts-bar');
      var root = document.getElementById('rcgRts');
      return {
        stage: box(st), cv: box(cv), bar: box(bar), root: box(root),
        cvCss: { w: parseFloat(cv.style.width), h: parseFloat(cv.style.height) },
        backing: { w: cv.width, h: cv.height },
        R: { W: _rtsR.W, H: _rtsR.H },
        vw: window.innerWidth, vh: window.innerHeight
      };
    });
  }

  /* The stage colour is only ever on screen where the canvas is not covering it. The shot is
     decoded back inside the page - there is no PNG reader here, and the browser has one. */
  async function bgPixels() {
    var shot = (await page.screenshot({ type: 'png' })).toString('base64');
    return page.evaluate(async function (a) {
      var b64 = a[0], bg = a[1];
      var im = await new Promise(function (res, rej) {
        var x = new Image(); x.onload = function () { res(x); }; x.onerror = rej;
        x.src = 'data:image/png;base64,' + b64;
      });
      var c = document.createElement('canvas');
      c.width = im.naturalWidth; c.height = im.naturalHeight;
      var g2 = c.getContext('2d'); g2.drawImage(im, 0, 0);
      var d = g2.getImageData(0, 0, c.width, c.height).data;
      var r = document.querySelector('#rcgRts .rts-stage').getBoundingClientRect();
      var dpr = c.width / window.innerWidth;
      var hits = 0, total = 0, sample = [];
      for (var i = 0; i <= 40; i++) for (var j = 0; j <= 40; j++) {
        var cx = r.left + r.width * (i / 40), cy = r.top + r.height * (j / 40);
        var px = Math.min(c.width - 1, Math.max(0, Math.round(cx * dpr)));
        var py = Math.min(c.height - 1, Math.max(0, Math.round(cy * dpr)));
        var o = (py * c.width + px) * 4;
        total++;
        var dd = Math.abs(d[o] - bg[0]) + Math.abs(d[o+1] - bg[1]) + Math.abs(d[o+2] - bg[2]);
        if (dd <= 12) { hits++; if (sample.length < 4) sample.push(Math.round(cx) + ',' + Math.round(cy)); }
      }
      return { hits: hits, total: total, sample: sample };
    }, [shot, STAGE_BG]);
  }

  function fits(g) {
    return Math.abs(g.cv.w - g.stage.w) <= 1 && Math.abs(g.cv.h - g.stage.h) <= 1 &&
           Math.abs(g.cv.x - g.stage.x) <= 1 && Math.abs(g.cv.y - g.stage.y) <= 1;
  }

  var fails = [];

  /* ---- portrait: the starting point, which was never in question ---- */
  var p0 = await geom();
  console.log('portrait ' + p0.vw + 'x' + p0.vh + ':  stage ' +
              Math.round(p0.stage.w) + 'x' + Math.round(p0.stage.h) + '   canvas ' +
              Math.round(p0.cv.w) + 'x' + Math.round(p0.cv.h));
  if (!fits(p0)) fails.push('the canvas does not fill the stage even in portrait');

  /* ---- rotate ---- */
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(500);
  var l0 = await geom();
  var lbg = await bgPixels();
  console.log('landscape ' + l0.vw + 'x' + l0.vh + ': stage ' +
              Math.round(l0.stage.w) + 'x' + Math.round(l0.stage.h) + '   canvas ' +
              Math.round(l0.cv.w) + 'x' + Math.round(l0.cv.h) +
              '   renderer ' + l0.R.W + 'x' + l0.R.H);
  console.log('  stage background visible on ' + lbg.hits + '/' + lbg.total + ' sampled points' +
              (lbg.sample.length ? '  e.g. ' + lbg.sample.join('  ') : ''));
  if (!fits(l0)) fails.push('after rotating, the canvas is ' + Math.round(l0.cv.w) + 'x' +
                            Math.round(l0.cv.h) + ' inside a ' + Math.round(l0.stage.w) + 'x' +
                            Math.round(l0.stage.h) + ' stage');
  if (Math.abs(l0.R.W - l0.stage.w) > 1 || Math.abs(l0.R.H - l0.stage.h) > 1)
    fails.push('the renderer still thinks the view is ' + l0.R.W + 'x' + l0.R.H);
  if (lbg.hits > 0) fails.push(lbg.hits + ' sampled points show the stage background - there is ' +
                               'a gap around the battlefield');

  /* ---- the sidebar's share of a landscape phone ---- */
  var share = l0.bar.w / l0.vw;
  console.log('  sidebar ' + Math.round(l0.bar.w) + 'px = ' + (share * 100).toFixed(0) +
              '% of the screen');
  /* The ceiling moved from 26% to 40% ON PURPOSE. A one-column bar at 25% was narrower and
     nothing in it worked: the radar ate 180 of the 340px of height and the build grid was left
     with 26. The bar is two columns now, which costs width and buys back the height - see
     barfit.js, which counts the cameos you can actually read. The floor matters as much as the
     ceiling: below ~250px the two columns stop fitting. */
  if (share > 0.40) fails.push('the sidebar takes ' + (share * 100).toFixed(0) +
                               '% of a landscape phone');
  if (l0.bar.w < 250) fails.push('the sidebar shrank to ' + Math.round(l0.bar.w) +
                                 'px - the two-column layout will not fit');

  /* ---- and the height fills the viewport, not the layout viewport ---- */
  if (Math.abs(l0.root.h - l0.vh) > 1)
    fails.push('the game is ' + Math.round(l0.root.h) + 'px tall in a ' + l0.vh + 'px viewport');

  /* ---- 2. WITHOUT the resize event, which is the case iOS actually presents ----
     Unbinding the listener leaves the ResizeObserver as the only thing that can notice. */
  await page.evaluate(function () { window.removeEventListener('resize', _rtsOnResize); });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  var back = await geom();
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(400);
  var again = await geom();
  var againBg = await bgPixels();
  console.log('with the resize listener unbound (the iOS case):');
  console.log('  back to portrait: canvas ' + Math.round(back.cv.w) + 'x' + Math.round(back.cv.h) +
              ' in stage ' + Math.round(back.stage.w) + 'x' + Math.round(back.stage.h) +
              '   ' + (fits(back) ? 'fits' : 'DOES NOT FIT'));
  console.log('  landscape again:  canvas ' + Math.round(again.cv.w) + 'x' + Math.round(again.cv.h) +
              ' in stage ' + Math.round(again.stage.w) + 'x' + Math.round(again.stage.h) +
              '   ' + (fits(again) ? 'fits' : 'DOES NOT FIT') +
              '   background pixels ' + againBg.hits);
  if (!fits(back) || !fits(again) || againBg.hits > 0)
    fails.push('with no resize event the canvas no longer tracks the stage - the ResizeObserver ' +
               'is not doing the work');

  /* ---- a stage that changes size with no viewport change at all ---- */
  var barChange = await page.evaluate(async function () {
    var bar = document.querySelector('#rcgRts .rts-bar');
    var before = document.getElementById('rtsCv').getBoundingClientRect().width;
    bar.style.flexBasis = '60px'; bar.style.flexGrow = '0'; bar.style.flexShrink = '0';
    await new Promise(function (r) { setTimeout(r, 300); });
    var st = document.querySelector('#rcgRts .rts-stage').getBoundingClientRect();
    var cv = document.getElementById('rtsCv').getBoundingClientRect();
    bar.style.flexBasis = ''; bar.style.flexGrow = ''; bar.style.flexShrink = '';
    await new Promise(function (r) { setTimeout(r, 300); });
    return { before: before, stage: st.width, cv: cv.width, R: _rtsR.W };
  });
  console.log('sidebar narrowed with no window resize: stage ' + Math.round(barChange.stage) +
              '  canvas ' + Math.round(barChange.cv) + '  (was ' + Math.round(barChange.before) + ')');
  if (Math.abs(barChange.cv - barChange.stage) > 1)
    fails.push('the canvas ignored a stage that changed size on its own');

  /* ---- teardown: the observer must not outlive the game ---- */
  var closed = await page.evaluate(function () {
    rtsClose();
    return { ui: window._rtsUI, gone: !document.getElementById('rcgRts') };
  });
  await page.setViewportSize({ width: 600, height: 900 });
  await page.waitForTimeout(250);
  console.log('after rtsClose: game removed ' + closed.gone + ', resizing afterwards is quiet');
  if (!closed.gone) fails.push('rtsClose left the game in the page');

  if (errs.length) fails.push('page errors: ' + errs.join(' | '));
  console.log(fails.length ? 'FAIL\n  ' + fails.join('\n  ') : 'PASS');

  await browser.close();
  srv.close();
  process.exit(fails.length ? 1 : 0);
})();
