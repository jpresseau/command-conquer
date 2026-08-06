/* Where does the sidebar's height actually GO on a landscape phone?

   Reported: "I can't see any of the buildings." The build grid was a sliver holding one
   clipped row of cameos, with the names and prices below the cut.

   This does not guess. It measures every child of the bar, reports the height each one takes,
   and then counts how many build tiles are FULLY inside the grid's visible box - a tile whose
   name and price are below the fold is a tile you cannot read. Also checks the tab row, which
   in the report was overflowing far enough to cut "Ships" down to "Sh". */

var { chromium, devices } = require('playwright');
var { serve } = require('../lib/game.js');

(async function () {
  var s = await serve();
  var srv = s.srv, PAGE = s.url;
var browser = await chromium.launch();
  var ctx = await browser.newContext(Object.assign({}, devices['iPhone 13 landscape'], { isMobile: true }));
  var page = await ctx.newPage();
  var errs = [];
  page.on('pageerror', function (e) { errs.push(String(e)); });
  await page.goto(PAGE, { waitUntil: 'load' });
  await page.waitForFunction(function () { return typeof window.rtsOpen === 'function'; });
  await page.evaluate(function () {
    rtsOpen(7);
    for (var i = 0; i < 60 * 25; i++) _rtsTick(1 / 60);
  });
  await page.waitForTimeout(400);

  async function report(tag) {
    var r = await page.evaluate(function () {
      var bar = document.querySelector('#rcgRts .rts-bar');
      var br = bar.getBoundingClientRect();
      var kids = [];
      for (var i = 0; i < bar.children.length; i++) {
        var c = bar.children[i], cr = c.getBoundingClientRect();
        if (!cr.height) continue;
        kids.push({ cls: c.className || c.id, h: Math.round(cr.height) });
      }
      var grid = document.getElementById('rtsList');
      var gr = grid.getBoundingClientRect();
      var tiles = grid.querySelectorAll('.rts-tile');
      var whole = 0, names = [], overlap = 0, worst = 0, pitch = [];
      var boxes = [];
      for (var j = 0; j < tiles.length; j++) {
        var tr = tiles[j].getBoundingClientRect();
        boxes.push(tr);
        if (tr.top >= gr.top - 1 && tr.bottom <= gr.bottom + 1) {
          whole++;
          var nm = tiles[j].querySelector('.nm');
          if (nm && names.length < 8) names.push(nm.textContent);
        }
      }
      /* DO THEY SIT ON TOP OF EACH OTHER? A tile can be "fully inside the grid" and still be
         invisible because the next row is drawn over its name and price. Compare every pair
         that shares a column: the row below must start at or after the one above ends. */
      for (var a = 0; a < boxes.length; a++) for (var b2 = a + 1; b2 < boxes.length; b2++) {
        var A = boxes[a], B = boxes[b2];
        var ox = Math.min(A.right, B.right) - Math.max(A.left, B.left);
        var oy = Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top);
        if (ox > 1 && oy > 1) { overlap++; worst = Math.max(worst, Math.round(oy)); }
      }
      if (boxes.length > 2) pitch = [Math.round(boxes[2].top - boxes[0].top),
                                     Math.round(boxes[0].height)];
      /* tabs: does the row fit inside the bar, and is any label clipped? */
      var tabs = bar.querySelector('.rts-tabs');
      var tabOver = Math.round(tabs.scrollWidth - tabs.clientWidth);
      var cut = [];
      var tb = tabs.querySelectorAll('button');
      for (var k = 0; k < tb.length; k++) {
        if (tb[k].scrollWidth > tb[k].clientWidth + 1 ||
            tb[k].getBoundingClientRect().right > br.right)
          cut.push(tb[k].textContent);
      }
      return {
        vw: window.innerWidth, vh: window.innerHeight,
        barW: Math.round(br.width), barH: Math.round(br.height),
        kids: kids, gridH: Math.round(gr.height),
        total: tiles.length, whole: whole, names: names,
        overlap: overlap, worst: worst, pitch: pitch,
        scroll: Math.round(grid.scrollHeight), tabOver: tabOver, cut: cut,
        radar: Math.round(document.getElementById('rtsMini').getBoundingClientRect().height)
      };
    });
    console.log('--- ' + tag + '  viewport ' + r.vw + 'x' + r.vh +
                '   bar ' + r.barW + 'x' + r.barH);
    r.kids.forEach(function (k) {
      console.log('    ' + String(k.h).padStart(4) + 'px  ' + k.cls +
                  (k.cls === 'rts-radar' ? '   (canvas ' + r.radar + 'px)' : ''));
    });
    console.log('    build grid ' + r.gridH + 'px, content ' + r.scroll + 'px: ' +
                r.whole + ' of ' + r.total + ' tiles fully visible' +
                (r.names.length ? '  [' + r.names.join(', ') + ']' : ''));
    console.log('    row pitch ' + r.pitch[0] + 'px for a ' + r.pitch[1] + 'px tile' +
                (r.overlap ? '   >>> ' + r.overlap + ' overlapping pairs, worst ' +
                             r.worst + 'px' : '   no overlap'));
    console.log('    tab row overflows by ' + r.tabOver + 'px' +
                (r.cut.length ? ', clipped: ' + r.cut.join(', ') : ''));
    return r;
  }

  var land = await report('landscape');
  await page.setViewportSize({ width: 390, height: 664 });
  await page.waitForTimeout(400);
  var port = await report('portrait');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(400);
  var desk = await report('desktop');

  var fails = [];
  [['landscape', land], ['portrait', port], ['desktop', desk]].forEach(function (p) {
    var n = p[0], r = p[1];
    if (r.whole < 4) fails.push(n + ': only ' + r.whole + ' of ' + r.total +
                                ' build tiles are fully visible');
    if (r.overlap) fails.push(n + ': ' + r.overlap + ' pairs of build tiles overlap (worst ' +
                              r.worst + 'px) - row pitch is ' + r.pitch[0] +
                              'px for a ' + r.pitch[1] + 'px tile');
    if (r.cut.length) fails.push(n + ': tab labels clipped - ' + r.cut.join(', '));
    if (r.tabOver > 0) fails.push(n + ': the tab row overflows the sidebar by ' + r.tabOver + 'px');
  });
  if (errs.length) fails.push('page errors: ' + errs.join(' | '));
  console.log(fails.length ? 'FAIL\n  ' + fails.join('\n  ') : 'PASS');

  await browser.close();
  srv.close();
  process.exit(fails.length ? 1 : 0);
})();
