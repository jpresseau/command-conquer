/* The first screen of a match — the view is on the map, and the shroud does not leak.

   The view opens centred on the player's own command yard (ui/shell.js), and since SCENARIO.CPP's
   rolled start the yard can sit anywhere on the ring. Nothing clamped that opening. Scrolling, the
   wheel, the pinch, a radar click and a team jump all did; the one camera move every single match
   makes did not. Two seeds in four put the yard near enough an edge that the first screen showed
   the void beyond it - seed 7 opened 59.5 world units past the north edge, 18% of the screen - and
   it stayed that way until the player happened to scroll.

   AND IT LEAKED THE SHROUD. The fog is draped over the GROUND, so anything standing up at the far
   edge of the map poked up into rows with no ground behind it to fog. Seed 7's opening showed two
   unexplored rock formations in full colour, sitting on a line across the top of the screen. The
   north row of the map was 0 of 128 cells explored.

   The fix holds the view on the map every frame in the live loop (ui/camera.js), rather than at
   each place that moves the camera - because the places kept outnumbering the clamps: the 3D
   toggle and a resize both change what the camera can see without moving its focus. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('opening');
var SEEDS = [7, 42, 9001, 3, 11, 500];

(async function () {
  var browser = await chromium.launch();

  /* ---------- 1. every opening is on the map, with the yard in it ---------- */
  var rows = [];
  for (var i = 0; i < SEEDS.length; i++) {
    var g = await openPage(browser, { width: 1280, height: 800, dpr: 1 });
    await g.start(SEEDS[i], 0, { freeze: true, mode3d: 'default' });
    var r = await g.page.evaluate(function () {
      var R = _rtsR, HALF = RTS_N * RTS_TILE / 2, vb = _r3dViewBounds();
      var yd = _rtsHas('player', 'yard'), s = _rtsGroundToScreen(yd.x, yd.z);
      /* how close the yard is to an edge, in cells - the population this spec needs is a yard
         close enough that the uncentred view would have gone past it */
      var edge = Math.min(HALF - Math.abs(yd.x), HALF - Math.abs(yd.z)) / RTS_TILE;
      return {
        over: Math.max(0, -HALF - vb.z0, vb.z1 - HALF, -HALF - vb.x0, vb.x1 - HALF),
        onScreen: s.x > 0 && s.x < R.W && s.y > 0 && s.y < R.H,
        edgeCells: +edge.toFixed(1), halfViewCells: +((vb.z1 - vb.z0) / 2 / RTS_TILE).toFixed(1)
      };
    });
    r.seed = SEEDS[i];
    rows.push(r);
    await g.close();
  }

  /* A check that can pass over nothing is not a check: if no seed put the yard near an edge,
     every opening would be on the map whether the clamp ran or not. */
  var near = rows.filter(function (r) { return r.edgeCells < r.halfViewCells; });
  S.ok('some of these openings really do sit near an edge', near.length >= 2,
       near.length + ' of ' + rows.length + ' seeds put the yard closer to an edge than half a view (' +
       near.map(function (r) { return 'seed ' + r.seed + ': ' + r.edgeCells + ' cells'; }).join(', ') + ')');

  var worst = Math.max.apply(null, rows.map(function (r) { return r.over; }));
  S.ok('every opening view stays on the map', worst < 0.01,
       rows.map(function (r) { return 'seed ' + r.seed + ' ' + r.over.toFixed(2); }).join(', ') +
       ' world units past an edge (seed 7 was 59.5, seed 9001 37.1, before the fix)');
  S.ok('...and the player\'s own yard is on screen in every one',
       rows.every(function (r) { return r.onScreen; }),
       rows.filter(function (r) { return !r.onScreen; }).map(function (r) { return 'seed ' + r.seed; }).join(', ') || 'all of them');

  /* ---------- 2. nothing unexplored shows at the top of the screen ---------- */
  var g2 = await openPage(browser, { width: 1280, height: 800, dpr: 1 });
  await g2.start(7, 0, { freeze: true, mode3d: 'default' });
  var leak = await g2.page.evaluate(function () {
    var G = window._rtsG, R3 = window._R3D, gl = R3.gl;
    /* The population: the far row of this map really is unexplored and really has things
       standing on it, or a dark top band proves nothing. */
    var mapped = 0, world = 0;
    for (var tx = 0; tx < RTS_N; tx++) if (G.mapped[_rtsIdx(tx, 0)]) mapped++;
    for (var b = 0; b < (R3.world || []).length; b++) {
      var m = R3.world[b];
      if (m && m.z0 !== undefined && m.z0 < -RTS_N * RTS_TILE / 2 + RTS_TILE * 3) world += m.verts || 0;
    }
    _rtsRFrame(1 / 60); _rtsRFrame(1 / 60);
    var W = R3.cv.width, H = R3.cv.height, buf = new Uint8Array(W * H * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    /* readPixels is bottom-up: the TOP fifth of the screen is the last fifth of the rows */
    var lit = 0, n = 0;
    for (var y = Math.floor(H * 0.8); y < H; y++) {
      for (var x = 0; x < W; x++) {
        var q = (y * W + x) * 4;
        n++;
        if (buf[q] + buf[q + 1] + buf[q + 2] > 90) lit++;
      }
    }
    return { northMapped: mapped, northVerts: world, lit: lit, n: n };
  });
  S.ok('the far edge of this map is unexplored and has geometry standing on it',
       leak.northMapped === 0 && leak.northVerts > 0,
       leak.northMapped + ' of ' + '128' + ' far-row cells explored, ' + leak.northVerts +
       ' world vertices in the chunks that reach it');
  S.eq('...and none of it shows through the top of the opening screen', leak.lit, 0);
  await g2.close();

  /* ---------- 3. and the camera moves that do not move the focus ---------- */
  var g3 = await openPage(browser, { width: 1280, height: 800, dpr: 1 });
  await g3.start(7, 0, { mode3d: 'default' });            /* the live loop, not frozen */
  var toggle = await g3.page.evaluate(async function () {
    var HALF = RTS_N * RTS_TILE / 2;
    function over() {
      var vb = (window._R3D && window._R3D.on) ? _r3dViewBounds() : null, R = _rtsR;
      if (!vb) {
        var z = _rtsZoom();
        vb = { x0: R.focus.x - R.W / z / 2, x1: R.focus.x + R.W / z / 2,
               z0: R.focus.z - R.H / z / 2, z1: R.focus.z + R.H / z / 2 };
      }
      return Math.max(0, -HALF - vb.z0, vb.z1 - HALF, -HALF - vb.x0, vb.x1 - HALF);
    }
    function frames(n) {
      return new Promise(function (res) {
        var k = 0;
        (function f() { if (++k >= n) res(); else requestAnimationFrame(f); })();
      });
    }
    /* push the focus hard against the north edge while in 2D, where the view is smaller... */
    rts3dSet(false);
    _rtsR.focus.z = -1e6; _rtsClampFocus();
    await frames(3);
    var in2d = over();
    /* ...then switch renderer, which changes what the camera sees without touching the focus */
    rts3dSet(true);
    await frames(3);
    return { in2d: in2d, after3d: over() };
  });
  S.ok('switching to 3D at the edge of the map does not open the view onto the void',
       toggle.in2d < 0.01 && toggle.after3d < 0.01,
       'overshoot ' + toggle.in2d.toFixed(2) + ' in 2D against the north edge, ' +
       toggle.after3d.toFixed(2) + ' a few frames after switching to 3D');
  await g3.close();

  await browser.close();
  require('../lib/report.js')(S);
})();
