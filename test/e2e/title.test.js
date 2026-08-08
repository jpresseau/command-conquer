/* The title screen's layout, at the sizes people actually hold.

   Reported from an iPhone: the difficulty note was printed straight across the difficulty
   buttons, and the army note across the army buttons.

   The cause was not a phone problem at all. `#rtsTitleMenu` exists only so the whole menu can
   be moved bodily inside the original title plate's red panel when the player's own artwork is
   loaded (see rtsShowTitleArt), and it had been given a layout ONLY under `.hasart`. Without
   the artwork it was a plain block <div>, and most of what is inside it is `<button>`s - which
   are inline-level, and flowed as words in a paragraph. What made it visible is that the notes
   and the secondary buttons carry NEGATIVE top margins (-14px, -10px) whose entire job is to
   cancel #rtsHome's own 22px flex gap; inside a wrapper with no gap they cancel nothing and
   just pull each element up into the one above.

   Measured before the fix, at every viewport tried - phone AND desktop:

     #rtsDiff x #rtsDiffNote  overlap 14px
     #rtsVoxSide x #rtsVoxNote overlap 14px
     desktop: #rtsInstall drawn ABOVE #rtsGo, across it and both notes

   So this is not a phone spec with a phone fix. It is the overlap itself, asserted at six
   viewports so the next tuning of a margin cannot quietly reintroduce it at one of them.

   Geometry only. What the buttons DO is covered elsewhere; what is asserted here is that a
   player can see and hit them. */

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
var PARTS = ['#rtsDiff', '#rtsDiffNote', '#rtsVoxSide', '#rtsVoxNote', '#rtsGo', '#rtsInstall'];

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

      var go = box('#rtsGo'), inst = box('#rtsInstall');
      var stamp = document.getElementById('rtsBuild');
      var sc = stamp ? getComputedStyle(stamp) : null;
      return {
        over: over, rows: Object.keys(rows).length, buttons: dbs.length, wide: wide, small: small,
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

  /* And the artwork path still wins. The fix adds a default `#rtsTitleMenu` rule, and a base
     rule that outranked `#rtsHome.hasart #rtsTitleMenu` would strand the menu outside the
     plate's panel - the one arrangement this wrapper exists for. */
  var g2 = await openPage(browser, { width: 1280, height: 900 });
  var art = await g2.page.evaluate(function () {
    var m = document.getElementById('rtsTitleMenu'), h = document.getElementById('rtsHome');
    var before = getComputedStyle(m).position;
    h.classList.add('hasart');
    var after = getComputedStyle(m).position;
    h.classList.remove('hasart');
    return { before: before, after: after };
  });
  S.eq('without artwork the menu is in the ordinary flow', art.before, 'static');
  S.eq('...and with it the plate still positions the menu inside its panel', art.after, 'absolute');
  await g2.close();

  await browser.close();
  require('../lib/report.js')(S);
})();
