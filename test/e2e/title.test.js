/* The title screen's layout, at the sizes people actually hold.

   Reported from an iPhone: the difficulty note was printed straight across the difficulty
   buttons, and the army note across the army buttons.

   The cause was not a phone problem at all. `#rtsTitleMenu` had been given a layout only for
   a title-art mode, and otherwise was a plain block <div> - and most of what is inside it is
   `<button>`s, which are inline-level, and flowed as words in a paragraph. What made it visible is that the notes
   and the secondary buttons carry NEGATIVE top margins (-14px, -10px) whose entire job is to
   cancel #rtsHome's own 22px flex gap; inside a wrapper with no gap they cancel nothing and
   just pull each element up into the one above.

   Measured before the fix, at every viewport tried - phone AND desktop:

     #rtsDiff x #rtsDiffNote  overlap 14px
     #rtsArmySide x #rtsVoxNote overlap 14px
     desktop: #rtsInstall drawn ABOVE #rtsGo, across it and both notes

   So this is not a phone spec with a phone fix. It is the overlap itself, asserted at six
   viewports so the next tuning of a margin cannot quietly reintroduce it at one of them.

   Geometry only. What the buttons DO is covered elsewhere; what is asserted here is that a
   player can see and hit them - and that the coast drawn behind them (title-bg.js) runs only
   while the title is up. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('title');

/* Portrait phones, both phone landscapes (which take the max-height:520px branch) and a
   desktop. The desktop is not a formality - it was broken too, and worse. */
var SIZES = [
  { name: 'iPhone SE', w: 375, h: 667 },
  { name: 'iPhone 13', w: 390, h: 844 },
  { name: 'iPhone 14 Pro Max', w: 430, h: 932 },
  { name: 'small android', w: 360, h: 640 },
  { name: 'phone landscape', w: 844, h: 390 },
  { name: 'desktop', w: 1280, h: 900 }
];

/* Everything in the menu that a player reads or presses. The two notes are the ones that were
   overlapping, and the loader cards are in because they are what the pinned build stamp lands
   on when the page is scrolled. */
var PARTS = ['#rtsDiff', '#rtsDiffNote', '#rtsSky', '#rtsCvd', '#rtsArmySide', '#rtsVoxNote', '#rtsGo', '#rtsSkirmishBtn', '#rtsCampBtn', '#rtsInstall'];

(async function () {
  var browser = await chromium.launch();
  var results = [];
  for (var i = 0; i < SIZES.length; i++) {
    var sz = SIZES[i];
    var g = await openPage(browser, { width: sz.w, height: sz.h });
    var r = await g.page.evaluate(function (a) {
      var PARTS = a[0], vw = a[1], vh = a[2];
      function box(q) {
        var e = document.querySelector(q);
        if (!e || e.hidden || !e.getClientRects().length) return null;
        var b = e.getBoundingClientRect();
        return { q: q, top: b.top, bot: b.bottom, left: b.left, right: b.right, h: b.height };
      }
      var boxes = PARTS.map(box).filter(Boolean);

      /* Two rectangles that share any area at all. Not "close together" - actually on top of
         each other, which is unambiguous and needs no tolerance. */
      var over = [];
      for (var x = 0; x < boxes.length; x++) for (var y = x + 1; y < boxes.length; y++) {
        var p = boxes[x], q = boxes[y];
        var vy = Math.min(p.bot, q.bot) - Math.max(p.top, q.top);
        var vx = Math.min(p.right, q.right) - Math.max(p.left, q.left);
        if (vy > 0.5 && vx > 0.5)
          over.push(p.q + ' x ' + q.q + ' by ' + vy.toFixed(0) + 'px');
      }

      /* The difficulty picker is a choice between three things and only reads as one when they
         sit side by side. Same top edge = same row. */
      var dbs = [].slice.call(document.querySelectorAll('#rtsDiff button'))
        .map(function (b) { return b.getBoundingClientRect(); });
      var rows = {};
      dbs.forEach(function (b) { rows[Math.round(b.top)] = 1; });

      /* Nothing may stick out sideways: a title screen that scrolls horizontally on a phone is
         one where a fat word has pushed the whole page wider than the handset. */
      var wide = boxes.filter(function (b) { return b.left < -0.5 || b.right > vw + 0.5; })
        .map(function (b) { return b.q; });

      /* A finger, not a mouse. 40px is the smaller of the two common guidelines and every
         control here clears it comfortably - the assertion is that a future squeeze does not
         solve an overflow by making things untappable. */
      var small = [].slice.call(document.querySelectorAll(
        '#rtsTitleMenu button, #rtsHome .artbtn')).filter(function (e) {
          return e.getClientRects().length && e.getBoundingClientRect().height < 40;
        }).map(function (e) { return e.id || e.className; });

      /* What is hidden is not drawn: a row's own display rule once beat the attribute, and CONTINUE
         and RESUME BATTLE showed with nothing kept */
      var shown = [].slice.call(document.querySelectorAll('#rtsHome [hidden]'))
        .filter(function (e) { return e.getClientRects().length; }).map(function (e) { return e.id || e.className; });
      var go = box('#rtsGo'), inst = box('#rtsInstall');
      var stamp = document.getElementById('rtsBuild');
      var sc = stamp ? getComputedStyle(stamp) : null;
      return {
        over: over, shown: shown, rows: Object.keys(rows).length, buttons: dbs.length, wide: wide, small: small,
        goAboveInstall: !!(go && inst) && go.bot <= inst.top + 0.5,
        goOnScreen: !!go && go.bot <= vh + 0.5 && go.top >= -0.5,
        docH: document.documentElement.scrollWidth,
        stampBg: sc ? sc.backgroundColor : null
      };
    }, [PARTS, sz.w, sz.h]);
    r.name = sz.name; r.w = sz.w; r.h = sz.h;
    results.push(r);
    await g.page.screenshot({ path: '/tmp/spl/title-' + sz.w + 'x' + sz.h + '.png' });
    S.ok(sz.name + ' ' + sz.w + 'x' + sz.h + ': nothing in the menu overlaps anything else',
         !r.over.length, r.over.join('; ') || 'clear');
    S.ok('...nothing hidden is drawn', !r.shown.length, r.shown.join(', ') || 'none');
    S.ok('...the three difficulty buttons are on one row', r.rows === 1 && r.buttons === 3,
         r.buttons + ' buttons on ' + r.rows + ' row(s)');
    S.ok('...START BATTLE comes before INSTALL, not after it', r.goAboveInstall, '');
    S.ok('...START BATTLE is on screen without scrolling', r.goOnScreen, '');
    S.ok('...nothing hangs off the side', !r.wide.length && r.docH <= sz.w,
         (r.wide.join(', ') || 'nothing') + ', document ' + r.docH + 'px wide');
    S.ok('...every control is at least 40px tall for a finger', !r.small.length,
         r.small.join(', ') || 'all big enough');
    if (!g.errors.length) S.pass++; else S.fails.push(sz.name + ': page errors — ' + g.errors[0]);
    await g.close();
  }

  /* The build mark is pinned to the window over a page that scrolls under it, so on a narrow
     screen it lands in the middle of the artwork card's prose. It needs its own backing or it
     is two greys on top of each other. */
  S.ok('the build stamp has a background to sit on',
       results.every(function (r) {
         return r.stampBg && r.stampBg !== 'transparent' && !/rgba\(0, 0, 0, 0\)/.test(r.stampBg);
       }), results[0].stampBg);

  /* THE COAST BEHIND IT (title-bg.js): drawn while the title is up, and not one frame while a
     battle is - the title is hidden then, and a canvas animating under the 3D view would be paid
     for in every frame of the battle. Hiding #rtsHome is what opening a battle does to it. */
  var gc = await openPage(browser, { width: 1280, height: 800 });
  var coast = await gc.page.evaluate(async function () {
    function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
    var B = window._rtsHomeBg, cv = document.getElementById('rtsHomeBg'), o = {};
    if (!B || !cv) return { missing: true };
    await wait(1200);
    var f0 = B.frames; await wait(1200); o.up = B.frames - f0;
    var x = document.createElement('canvas'); x.width = 64; x.height = 40;
    var c = x.getContext('2d'); c.drawImage(cv, 0, 0, 64, 40);
    var d = c.getImageData(0, 0, 64, 40).data, lit = 0, warm = 0;
    for (var i = 0; i < d.length; i += 4) { if (d[i] + d[i + 1] + d[i + 2] > 90) lit++; if (d[i] > d[i + 2] + 40) warm++; }
    o.lit = lit; o.warm = warm; o.px = d.length / 4;
    document.getElementById('rtsHome').classList.add('gone');
    await wait(300); var f1 = B.frames; await wait(1500); o.hidden = B.frames - f1;
    document.getElementById('rtsHome').classList.remove('gone');
    await wait(300); var f2 = B.frames; await wait(1200); o.back = B.frames - f2;
    return o;
  });
  S.ok('THE COAST: the backdrop is drawn while the title is up - a dusk, not a blank', !coast.missing && coast.up >= 5 && coast.lit > 40 && coast.warm > 20,
       coast.missing ? 'no backdrop' : coast.up + ' frames in 1.2 s; ' + coast.lit + ' lit and ' + coast.warm + ' warm of ' + coast.px + ' samples');
  S.ok('...and not one frame while the title is hidden, as it is in a battle', coast.hidden === 0, coast.hidden + ' frames in 1.5 s');
  S.ok('...and drawn again when the title comes back', coast.back >= 5, coast.back + ' frames in 1.2 s');
  S.ok('...with no page errors', !gc.errors.length, gc.errors.slice(0, 2).join(' | ') || 'clean');
  await gc.close();

  await browser.close();
  require('../lib/report.js')(S);
})();
