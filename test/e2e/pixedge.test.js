/* THE GROUND'S STAIRCASES ARE REDRAWN, AND NOTHING ELSE ABOUT IT CHANGES.

   At the closest 3D zooms a baked ground pixel is eight device pixels across, and every edge
   between two kinds of ground that is not horizontal or vertical came out as a staircase of big
   squares. The ground is pixel art magnified NEAREST on purpose, so the fix may not blur it:
   R3D_PIX_GLSL (render3d/ground3d.js) redraws the edges instead, by the EPX rule made
   continuous - a pixel's corner is cut along a diagonal when its two neighbours toward that
   corner agree with each other and not with it, and the edge is not a straight run.

   This spec paints a test card into the terrain canvas itself, on flattened ground with every
   other layer out of the way, and renders the same view with the rule off and on in one page
   (window.RTS_PIX_OFF). Four quadrants, each a claim:

     STAIRCASE   a 45-degree boundary between two flat colours. Off, its edge wanders a whole
                 texel either side of the line it approximates; on, it IS the line. Measured as
                 the RMS residual of the edge position about a fitted line, row by row.
     NO BLUR     over the same staircase, the pixels that are neither colour - the only thing
                 a blur would produce - are the cut's own antialiasing, about one a row.
     SPECK       one texel of the other colour, alone: EPX's "not a straight run" test leaves
                 it exactly as big as it was. Detail in the art is not eroded.
     CHECKER     a one-texel dither and a straight border: pixel for pixel the same picture
                 with the rule on as off. The rule redraws staircases and nothing else.

   And it is gated on magnification: zoomed out, where a texel is a pixel or two, the uniform
   is zero and the frame is the one it always was. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('pixedge');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 900, height: 700, dpr: 1 });
  await g.start(7, 1);

  var out = await g.page.evaluate(function () {
    var o = {}, R = _rtsR, G = window._rtsG, i;
    for (i = 0; i < RTS_N * RTS_N; i++) { G.mapped[i] = 1; G.vis[i] = 1; }
    G.visDirty = 1;
    rts3dSet(true);
    var R3 = window._R3D;
    o.on = !!(R3 && R3.on);
    if (!o.on) return o;
    var yd = _rtsHas('player', 'yard');        /* before the entities go */

    /* ---------- the stage: flat, bare, unfiltered ---------- */
    _rtsRFrame(1 / 60);                     /* the world builds on the first 3D frame; clear it after */
    window.RTS_POST_ON = false;             /* FXAA would redraw the OFF frame's edges too */
    RTS_DETAIL_ALPHA = 0;                   /* the grain is noise over both frames */
    G.height = new Uint8Array(RTS_N * RTS_N);
    G.ents = [];
    R3.world = []; R3.ore = (R3.ore || []).map(function () { return null; });
    R3.waterMesh = null;

    /* ---------- the test card, painted into the terrain canvas ---------- */
    var T = RTS_TS, Q = 30;                 /* texels a quadrant */
    o.canvasIsTheMap = R.terrain.width === RTS_N * T;
    var c0 = (_rtsTX(yd.x) - 12) * T, r0 = (_rtsTX(yd.z) + 2) * T;   /* texel origin */
    var A = '#4a7a3a', B = '#9a8660';
    var cg = R.terrain.getContext('2d');
    function px(c, r, col) { cg.fillStyle = col; cg.fillRect(c0 + c, r0 + r, 1, 1); }
    for (var r = 0; r < 2 * Q; r++) {
      for (var c = 0; c < 2 * Q; c++) {
        var col = A;
        if (c < Q && r < Q) col = c > r ? B : A;                          /* staircase */
        else if (c >= Q && r < Q) col = (c === Q + 15 && r === 15) ? B : A; /* speck */
        else if (c < Q && r >= Q) {                                        /* checker */
          var ic = c - 5, ir = r - Q - 5;
          col = (ic >= 0 && ic < 20 && ir >= 0 && ir < 20 && ((c + r) & 1)) ? B : A;
        } else col = r < Q + 15 ? B : A;                                   /* straight border */
        px(c, r, col);
      }
    }
    R3.terrainDirty = true;

    /* texel corner -> device pixel on the canvas (dpr 1, readPixels rows run bottom-up) */
    var W0 = _rtsWX(0) - RTS_TILE / 2, U = RTS_TILE / T;
    function scr(c, r) {
      var p = _rtsGroundToScreen(W0 + (c0 + c) * U, W0 + (r0 + r) * U);
      return { x: p.x, y: p.y };
    }
    R.focus.x = W0 + (c0 + Q) * U; R.focus.z = W0 + (r0 + Q) * U;
    R.zi = RTS_ZOOMS.length - 1; _rtsApplyCam();

    var gl = R3.gl, CW = R3.cv.width, CH = R3.cv.height;
    function shot(off) {
      window.RTS_PIX_OFF = off;
      _rtsRFrame(1 / 60); _rtsRFrame(1 / 60);
      var b = new Uint8Array(CW * CH * 4);
      gl.readPixels(0, 0, CW, CH, gl.RGBA, gl.UNSIGNED_BYTE, b);
      return b;
    }
    function at(b, x, y) { var q = ((CH - 1 - y) * CW + x) * 4; return [b[q], b[q + 1], b[q + 2]]; }
    var OFF = shot(true), ON = shot(false);
    window.RTS_PIX_OFF = false;
    o.mag = R3.pixMag;

    /* the two colours as they came out of the lighting, read off the frame itself */
    function mid(c, r) { var p = scr(c, r); return at(OFF, Math.round(p.x), Math.round(p.y)); }
    var cA = mid(3, 25), cB = mid(25, 3);
    o.cA = cA; o.cB = cB;
    function d2(p, q) { return (p[0] - q[0]) * (p[0] - q[0]) + (p[1] - q[1]) * (p[1] - q[1]) + (p[2] - q[2]) * (p[2] - q[2]); }
    function cls(p) { return d2(p, cA) < 400 ? 'A' : d2(p, cB) < 400 ? 'B' : 'x'; }
    /* a quadrant's screen box, shrunk by `m` texels so neighbouring quadrants stay out */
    function box(ca, ra, cb, rb) {
      var ps = [scr(ca, ra), scr(cb, ra), scr(ca, rb), scr(cb, rb)];
      return { x0: Math.ceil(Math.max(ps[0].x, ps[2].x)), x1: Math.floor(Math.min(ps[1].x, ps[3].x)),
               y0: Math.ceil(Math.max(ps[0].y, ps[1].y)), y1: Math.floor(Math.min(ps[2].y, ps[3].y)) };
    }

    /* ---------- 1. the staircase: how far the edge wanders from a line ---------- */
    function edge(b) {
      var bx = box(3, 3, Q - 3, Q - 3), pts = [], other = 0, rows = 0;
      for (var y = bx.y0; y <= bx.y1; y++) {
        var nA = 0, nx = 0, seen = false;
        for (var x = bx.x0; x <= bx.x1; x++) {
          var k = cls(at(b, x, y));
          if (k === 'A') nA++; else if (k === 'x') nx++;
        }
        /* only rows the edge actually crosses inside the box */
        if (nA < 2 || nA + nx > bx.x1 - bx.x0 - 1) continue;
        pts.push([y, bx.x0 + nA + nx / 2]);
        other += nx; rows++;
      }
      var n = pts.length, sy = 0, sx = 0, syy = 0, sxy = 0;
      pts.forEach(function (p) { sy += p[0]; sx += p[1]; syy += p[0] * p[0]; sxy += p[0] * p[1]; });
      var k2 = (n * sxy - sy * sx) / (n * syy - sy * sy), c2 = (sx - k2 * sy) / n, e2 = 0;
      pts.forEach(function (p) { var d = p[1] - (k2 * p[0] + c2); e2 += d * d; });
      return { rows: n, rms: +Math.sqrt(e2 / Math.max(1, n)).toFixed(2),
               otherPerRow: +(other / Math.max(1, rows)).toFixed(2) };
    }
    o.stairOff = edge(OFF); o.stairOn = edge(ON);

    /* ---------- 2. the speck keeps its size ---------- */
    function specks(b) {
      var bx = box(Q + 5, 5, 2 * Q - 5, Q - 5), n = 0;
      for (var y = bx.y0; y <= bx.y1; y++) for (var x = bx.x0; x <= bx.x1; x++) if (cls(at(b, x, y)) === 'B') n++;
      return n;
    }
    o.speckOff = specks(OFF); o.speckOn = specks(ON);

    /* ---------- 3. the dither and the straight border are the same picture ---------- */
    function same(ca, ra, cb, rb) {
      var bx = box(ca, ra, cb, rb), n = 0, diff = 0, nB = 0;
      for (var y = bx.y0; y <= bx.y1; y++) {
        for (var x = bx.x0; x <= bx.x1; x++) {
          var p = at(OFF, x, y), q2 = at(ON, x, y);
          n++;
          if (Math.abs(p[0] - q2[0]) + Math.abs(p[1] - q2[1]) + Math.abs(p[2] - q2[2]) > 12) diff++;
          if (cls(p) === 'B') nB++;
        }
      }
      return { n: n, diffPct: +(diff / Math.max(1, n) * 100).toFixed(2), bPct: +(nB / Math.max(1, n) * 100).toFixed(1) };
    }
    o.checker = same(6, Q + 6, 24, Q + 24);
    o.border = same(Q + 3, Q + 3, 2 * Q - 3, 2 * Q - 3);

    /* ---------- 4. gated on magnification ---------- */
    R.zi = 0; _rtsApplyCam();
    var farOff = shot(true), farOn = shot(false);
    o.farMag = R3.pixMag;
    var fd = 0;
    for (i = 0; i < farOff.length; i += 4) if (farOff[i] !== farOn[i] || farOff[i + 1] !== farOn[i + 1] || farOff[i + 2] !== farOn[i + 2]) fd++;
    o.farDiff = fd;
    window.RTS_POST_ON = true;
    return o;
  });

  S.ok('the 3D mode is available to check', out.on, out.on ? 'on' : 'no WebGL');
  if (!out.on) {
    S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');
    await g.close(); await browser.close();
    return require('../lib/report.js')(S);
  }
  S.ok('the terrain canvas is the map at one texel per baked pixel', out.canvasIsTheMap, String(out.canvasIsTheMap));
  S.ok('at the closest zoom a baked pixel is several device pixels, and the rule is on',
       out.mag >= 3, out.mag + ' device pixels a texel');
  S.ok('the two test colours come out of the frame as two colours',
       Math.sqrt((out.cA[0] - out.cB[0]) * (out.cA[0] - out.cB[0]) + (out.cA[1] - out.cB[1]) * (out.cA[1] - out.cB[1]) +
                 (out.cA[2] - out.cB[2]) * (out.cA[2] - out.cB[2])) > 60,
       'A ' + out.cA.join(',') + ', B ' + out.cB.join(','));

  S.ok('the staircase really is a staircase with the rule off', out.stairOff.rows > 60 && out.stairOff.rms > 1.5,
       out.stairOff.rows + ' rows, the edge wandering ' + out.stairOff.rms + 'px RMS about its line');
  S.ok('with it on, the edge is the diagonal it was drawn as', out.stairOn.rms < 1 && out.stairOn.rms < out.stairOff.rms / 2,
       out.stairOn.rms + 'px RMS against ' + out.stairOff.rms + ' - over ' + out.stairOn.rows + ' rows');
  S.ok('...and nothing is blurred to get there: about one in-between pixel a row, the cut\'s own edge',
       out.stairOn.otherPerRow <= 2.5,
       out.stairOn.otherPerRow + ' pixels a row are neither colour (' + out.stairOff.otherPerRow + ' with it off)');

  S.ok('a lone speck in the art is on screen to measure', out.speckOff > 20, out.speckOff + ' pixels');
  S.ok('...and keeps its size - the rule does not erode detail',
       Math.abs(out.speckOn - out.speckOff) <= out.speckOff * 0.1,
       out.speckOn + ' pixels with the rule on against ' + out.speckOff + ' off');

  S.ok('a one-texel dither is in the frame', out.checker.n > 5000 && out.checker.bPct > 25,
       out.checker.n + ' pixels, ' + out.checker.bPct + '% of them the second colour');
  S.ok('...and it is the same picture with the rule on', out.checker.diffPct < 1,
       out.checker.diffPct + '% of pixels changed');
  S.ok('a straight border is the same picture with the rule on',
       out.border.n > 5000 && out.border.bPct > 20 && out.border.diffPct < 1,
       out.border.diffPct + '% of ' + out.border.n + ' pixels changed');

  S.ok('zoomed out, where a texel is a pixel or two, the rule is off',
       out.farMag === 0 && out.farDiff === 0,
       'magnification uniform ' + out.farMag + ', ' + out.farDiff + ' pixels differ from the frame without it');
  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
