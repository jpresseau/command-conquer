/* Zooming in far enough to see the models — the 3D-only rungs on the zoom ladder.

   The ladder stops at 48 pixels a cell for a 2D reason: every rung has to land the SPRITE on a
   whole multiple of its bake or the picture resamples and goes soft. In 3D the things worth
   zooming in to look at are not sprites - a unit is geometry, and since r3d/curves.js its edges
   are rounded and its wheels turn on their axles - so that constraint does not bind and the
   detail had nowhere to be seen. RTS_ZOOM_3D_EXTRA adds two rungs beyond the 2D top.

   TWO THINGS HAVE TO SURVIVE IT, and neither is about how it looks.

   PICKING. Every click, every placement and the drag-pan go through _rtsGroundAt and
   _rtsGroundToScreen, which are inverses of each other. If that breaks at close zoom, orders
   land somewhere other than where they were given - the worst kind of failure, because the
   picture still looks right. e2e/tilt already measures this, but at a fixed sample grid
   calibrated when the closest rung showed 53 world units; at 13 that grid is four screen-widths
   wide and lands outside the frustum, where a perspective inverse is legitimately meaningless.
   So it is measured here over what is ACTUALLY ON SCREEN, at every rung.

   COMING BACK OUT. The ladder is a global that the sidebar, the pinch, the wheel and twenty
   specs read. Turning 3D off from a rung 2D does not have has to land somewhere real. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('zoom3d');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 900, height: 640, dpr: 1 });
  await g.start(7, 20, { freeze: true, mode3d: true });

  var out = await g.page.evaluate(function () {
    var R = _rtsR, G = window._rtsG, C = RTS_N * RTS_TILE / 2, o = {};
    o.ladder = RTS_ZOOMS.slice();
    o.flat = _rtsZoomLadder(R.dpr, false).slice();

    /* ---------- picking, over the visible rect, at every rung ---------- */
    R.focus.x = 0; R.focus.z = 0;
    o.pick = [];
    for (var zi = 0; zi < RTS_ZOOMS.length; zi++) {
      R.zi = zi; _rtsApplyCam();
      _rtsRFrame(1 / 60);
      var worst = 0, n = 0;
      for (var sy = 40; sy < R.H - 40; sy += (R.H - 80) / 6) {
        for (var sx = 40; sx < R.W - 40; sx += (R.W - 80) / 6) {
          var w = _rtsGroundAt(sx, sy);
          if (!w) continue;
          var s = _rtsGroundToScreen(w.x, w.z);
          if (s.behind) continue;
          worst = Math.max(worst, Math.hypot(s.x - sx, s.y - sy));
          n++;
        }
      }
      o.pick.push({ cell: R.cell, wide: +(R.W / (R.cell / RTS_TILE)).toFixed(1),
                    pts: n, err: +worst.toFixed(4) });
    }

    /* ---------- a unit really is drawn bigger ---------- */
    for (var j = G.ents.length - 1; j >= 0; j--)
      if (G.ents[j].type === 'unit') { delete G.byId[G.ents[j].id]; G.ents.splice(j, 1); }
    G.fx.length = 0;
    if (G.proj) G.proj.length = 0;
    if (G.mapped) G.mapped.fill(1);
    if (G.vis) G.vis.fill(1);
    G.visDirty = 1;
    var e = _rtsSpawnUnit('player', 'tank', C, C);
    if (e) { e.rot = 0.9; e.turret = 0.5; }
    R.focus.x = C; R.focus.z = C;
    function unitPixels() {
      var R3 = window._R3D, gl = R3.gl, W = R3.cv.width, H = R3.cv.height;
      function ink() {
        _rtsRFrame(1 / 60); _rtsRFrame(1 / 60);
        var buf = new Uint8Array(W * H * 4);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
        return buf;
      }
      var a = ink();
      var keep = e.dead; e.dead = true;
      var b = ink();
      e.dead = keep;
      var n = 0;
      for (var p = 0; p < a.length; p += 4) {
        if (Math.abs(a[p] - b[p]) + Math.abs(a[p + 1] - b[p + 1]) + Math.abs(a[p + 2] - b[p + 2]) > 12) n++;
      }
      return n;
    }
    R.zi = RTS_ZOOM_2D_STEPS - 1; _rtsApplyCam();
    o.px2d = unitPixels();
    R.zi = RTS_ZOOMS.length - 1; _rtsApplyCam();
    o.px3d = unitPixels();

    /* ---------- coming back out of 3D from a rung 2D does not have ---------- */
    o.deepIndex = R.zi;
    o.deepCell = R.cell;
    rts3dSet(false);
    o.afterLadder = RTS_ZOOMS.slice();
    o.afterIndex = R.zi;
    o.afterCell = R.cell;
    o.afterInRange = R.zi >= 0 && R.zi < RTS_ZOOMS.length;
    rts3dSet(true);
    o.backLadder = RTS_ZOOMS.length;
    return o;
  });

  S.ok('3D offers rungs that 2D does not', out.ladder.length > out.flat.length,
       'in 3D ' + out.ladder.join(', ') + ' css px per cell; in 2D ' + out.flat.join(', '));

  var worstErr = Math.max.apply(null, out.pick.map(function (r) { return r.err; }));
  S.ok('screen and world still invert exactly, at every rung', worstErr < 0.01,
       out.pick.map(function (r) {
         return r.cell + 'px/cell (' + r.wide + ' world wide, ' + r.pts + ' pts): ' + r.err;
       }).join('  |  ') + ' - screen pixels of round-trip error');

  S.ok('a unit is drawn far larger at the closest rung', out.px3d > out.px2d * 8,
       out.px3d.toLocaleString() + ' pixels against ' + out.px2d.toLocaleString() +
       ' at the top 2D rung - ' + (out.px3d / out.px2d).toFixed(1) + 'x the area');

  S.ok('leaving 3D from a rung 2D does not have lands on a real one', out.afterInRange,
       'was index ' + out.deepIndex + ' at ' + out.deepCell + 'px/cell, became index ' +
       out.afterIndex + ' at ' + out.afterCell + ' on a ladder of ' + out.afterLadder.length);
  S.eq('...and it is the closest 2D rung, not whatever the index pointed at',
       out.afterCell, out.afterLadder[out.afterLadder.length - 1]);
  S.eq('...and going back into 3D restores the long ladder', out.backLadder, out.ladder.length);

  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');
  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})();
