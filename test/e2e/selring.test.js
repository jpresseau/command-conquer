/* WHAT IS SELECTED IS RINGED ON THE GROUND - render3d/ring3d.js.

   In 3D a selected unit stands in a ring of light on the ground and a selected building has its
   footprint traced round, in place of Red Alert's corner brackets on the HUD. Measured as an A/B
   on one frame - selected against not - on open ground:

     A UNIT      a ring round the tank, at its radius, in the player's green
     THE OTHER   the opponent's tank rings red
     A BUILDING  the yard's footprint is outlined, along its edge
     THE SWITCH  R3.selAmt 0 takes the rings out
     THE HUD     in 3D it draws no brackets; in 2D it still does */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('selring');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 900, height: 760, dpr: 1 });
  await g.start(7, 1);

  var out = await g.page.evaluate(function () {
    var o = {}, R = _rtsR, G = window._rtsG, i;
    for (i = 0; i < RTS_N * RTS_N; i++) { G.mapped[i] = 1; G.vis[i] = 1; }
    G.visDirty = 1;
    rts3dSet(true);
    var R3 = window._R3D;
    o.on = !!(R3 && R3.on);
    if (!o.on) return o;
    window.RTS_POST_ON = false;
    R3.cloudAmt = 0;
    G.fx.length = 0;
    /* open grass near the player's yard */
    var yd = _rtsHas('player', 'yard'), spot = null;
    for (var rr = 4; rr < 30 && !spot; rr++) for (var a = 0; a < 16 && !spot; a++) {
      var x = yd.x + Math.cos(a / 16 * 6.283) * rr * RTS_TILE, z = yd.z + Math.sin(a / 16 * 6.283) * rr * RTS_TILE, ok = true;
      for (var dz = -2; dz <= 2 && ok; dz++) for (var dx = -2; dx <= 2 && ok; dx++) {
        var tx = _rtsTX(x) + dx, tz = _rtsTX(z) + dz;
        if (!_rtsInB(tx, tz) || G.terrain[_rtsIdx(tx, tz)] !== RTS_T_GRASS || _rtsBlocked(tx, tz)) ok = false;
      }
      if (ok) spot = [x, z];
    }
    o.spot = !!spot;
    if (!spot) return o;
    var mine = _rtsSpawnUnit('player', 'tank', spot[0], spot[1]);
    var gl = R3.gl, CW = R3.cv.width, CH = R3.cv.height;
    function shot() {
      _rtsRFrame(0);
      var b = new Uint8Array(CW * CH * 4);
      gl.readPixels(0, 0, CW, CH, gl.RGBA, gl.UNSIGNED_BYTE, b);
      return b;
    }
    /* the pixels a selection changes, and where on the ground they are */
    function ringed(sel, dist) {
      G.sel = []; var A = shot();
      G.sel = sel; var B = shot();
      G.sel = [];
      var n = 0, inBand = 0, gr = 0, rd = 0, bl = 0;
      for (var y = 0; y < CH; y += 2) for (var x = 0; x < CW; x += 2) {
        var q = ((CH - 1 - y) * CW + x) * 4;
        var d = Math.abs(B[q] - A[q]) + Math.abs(B[q + 1] - A[q + 1]) + Math.abs(B[q + 2] - A[q + 2]);
        if (d <= 30) continue;
        n++; rd += B[q] - A[q]; gr += B[q + 1] - A[q + 1]; bl += B[q + 2] - A[q + 2];
        var w = _rtsGroundAt(x / R.dpr, y / R.dpr);
        if (w && dist(w.x, w.z)) inBand++;
      }
      return { n: n, inBand: n ? +(inBand / n * 100).toFixed(1) : 0, r: +(rd / Math.max(1, n)).toFixed(1),
               g: +(gr / Math.max(1, n)).toFixed(1), b: +(bl / Math.max(1, n)).toFixed(1) };
    }
    R.focus.x = mine.x; R.focus.z = mine.z; R.zi = RTS_ZOOMS.length - 1; _rtsApplyCam();
    /* hugging the hull: between one and one and a half of the tank's own radius - a number of
       the test's, not read back from the renderer, or a ring drawn anywhere would agree with it */
    var ur = rtsUnitDef('tank').r;
    o.R = [+(ur * 1.0).toFixed(2), +(ur * 1.5).toFixed(2)];
    function round(x, z) { var d = Math.hypot(x - mine.x, z - mine.z); return d > ur * 1.0 - 0.5 && d < ur * 1.5 + 0.3; }
    o.unit = ringed([mine], round);
    R3.selAmt = 0; o.off = ringed([mine], round); R3.selAmt = undefined;
    mine.side = 'enemy'; o.enemy = ringed([mine], round); mine.side = 'player';

    /* the yard: its footprint, outlined just outside the edge */
    var d = rtsStructDef('yard'), x0 = _rtsWX(yd.tx) - RTS_TILE / 2, z0 = _rtsWX(yd.tz) - RTS_TILE / 2;
    var x1 = x0 + d.w * RTS_TILE, z1 = z0 + d.h * RTS_TILE;
    R.focus.x = (x0 + x1) / 2; R.focus.z = (z0 + z1) / 2 + 4; R.zi = RTS_ZOOMS.length - 2; _rtsApplyCam();
    /* the line runs along the footprint's edge and rounds its corners, so it is measured from
       the edge either way: outside, the distance to the rectangle; inside, to its nearest side */
    var corners = [0, 0];                /* the two front corners, which the camera sees */
    o.yard = ringed([yd], function (x, z) {
      if (Math.hypot(x - x0, z - z1) < 1.6) corners[0]++;
      if (Math.hypot(x - x1, z - z1) < 1.6) corners[1]++;
      var inside = x > x0 && x < x1 && z > z0 && z < z1;
      var e = inside ? Math.min(x - x0, x1 - x, z - z0, z1 - z)
                     : Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(z0 - z, 0, z - z1));
      return e < 1.0;
    });
    o.corners = corners;

    /* the HUD's brackets: counted as the strokes it makes in the selection green */
    function brackets() {
      var hud = document.getElementById('rtsHud'), hg = hud.getContext('2d'), n = 0, orig = hg.stroke;
      hg.stroke = function () { if (hg.strokeStyle === '#8ef07a') n++; return orig.apply(this, arguments); };
      G.sel = [mine];
      _rtsDrawHud(0);
      G.sel = [];
      hg.stroke = orig;
      return n;
    }
    R.focus.x = mine.x; R.focus.z = mine.z; _rtsApplyCam();
    o.hud3 = brackets();
    gl.getError();
    window.RTS_POST_ON = true;
    G.sel = [mine]; shot(); G.sel = [];
    o.glErr = gl.getError();
    rts3dSet(false);
    o.hud2 = brackets();
    R3.cloudAmt = undefined;
    return o;
  });

  S.ok('the 3D mode is available to check', out.on, out.on ? 'on' : 'no WebGL');
  if (!out.on || !out.spot) {
    S.ok('there is open grass to park a tank on', out.spot, String(out.spot));
    await g.close(); await browser.close();
    return require('../lib/report.js')(S);
  }
  var u = out.unit, e = out.enemy, y = out.yard;
  S.ok('a selected tank stands in a ring on the ground', u.n > 150, u.n + ' sampled pixels change');
  S.ok('...hugging its hull', u.inBand > 85, u.inBand + '% of them lie ' + out.R[0] + ' to ' + out.R[1] + ' world units from its centre, give or take the line\'s width');
  S.ok('...in the player\'s green', u.g > u.r + 15 && u.g > u.b + 15,
       'red ' + u.r + ', green ' + u.g + ', blue ' + u.b + ' levels a pixel');
  S.ok('the opponent\'s tank rings red', e.n > 150 && e.r > e.g + 15 && e.r > e.b + 15,
       e.n + ' pixels: red ' + e.r + ', green ' + e.g + ', blue ' + e.b);
  S.ok('a selected building has its footprint outlined', y.n > 150 && y.inBand > 80,
       y.n + ' pixels change, ' + y.inBand + '% of them within a unit of its edge');
  S.ok('...square to it: the line turns both front corners', out.corners[0] >= 5 && out.corners[1] >= 5,
       out.corners.join(' and ') + ' pixels within a unit and a half of the two front corners');
  S.ok('R3.selAmt 0 takes the rings out', out.off.n === 0, out.off.n + ' pixels change');
  S.ok('in 3D the HUD draws no corner brackets', out.hud3 === 0, out.hud3 + ' green strokes');
  S.ok('...and in 2D it still does', out.hud2 >= 4, out.hud2 + ' green strokes');
  S.eq('no draw is refused with a ring and the post buffer on', out.glErr, 0);
  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
