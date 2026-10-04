/* THE GROUND KEEPS ITS GRAIN WHEN THE SCREEN MAGNIFIES IT (render/detail.js, render3d/ground3d.js).

   The legacy ground (RTS_GROUND_LEGACY) is a bake at 24 pixels a cell, and the closest 3D rungs
   magnify it several times over: nearest-neighbour magnification turns each baked pixel into a
   flat block. A detail texture puts the missing frequencies back: the bake supplies colour and
   large structure, a small tile of pure high-frequency noise supplies the grain, sampled in the
   ground's fragment shader (R3D_TEX_FS).

     THE TILE          lightens as much as it darkens (or it tints the map), wraps without a
                       seam (or it is wallpaper), and is small
     THE 3D GROUND     carries the grain at the zoom that needs it, measured as fine variation
                       between neighbouring pixels, and skips it where nothing is magnified

   NOT GRADED HERE, HONESTLY: the weave. Alpha 0.5 put a visible cross-hatch on every dirt road
   and alpha 0.22 does not, but two metrics written to catch it (low-frequency share, directional
   anisotropy) ranked the bad build above the good one and were deleted. The alpha constant, and
   the note where it is declared, guard it. The materials ground (render3d/terrain3d.js) computes
   detail per pixel in world space and switches the grain off. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('grain');

(async function () {
  var browser = await chromium.launch();
  var g3d = await openPage(browser, { width: 900, height: 640, dpr: 1 });
  await g3d.start(7, 20, { freeze: true });

  var out = await g3d.page.evaluate(function () {
    var o = {}, i;
    /* --- the tile itself --- */
    var t = _rtsDetailTile();
    var td = t.getContext('2d').getImageData(0, 0, t.width, t.height).data;
    o.tile = { size: t.width + 'x' + t.height, kb: +(t.width * t.height * 4 / 1024).toFixed(0) };
    /* Lighten and darken must balance, or the pass tints the map. Weighted by alpha, because
       alpha is where the strength lives. */
    var lightW = 0, darkW = 0;
    for (i = 0; i < td.length; i += 4) {
      if (td[i] > 127) lightW += td[i + 3]; else darkW += td[i + 3];
    }
    o.tile.balance = +(Math.min(lightW, darkW) / Math.max(lightW, darkW)).toFixed(3);

    /* SEAM: the mean absolute step across the wrap, against the mean across interior columns.
       A tile that does not wrap shows a step several times the interior one. */
    function colStep(a, b) {
      var s = 0;
      for (var y = 0; y < t.height; y++) {
        var p = (y * t.width + a) * 4, q = (y * t.width + b) * 4;
        s += Math.abs(td[p] * td[p + 3] - td[q] * td[q + 3]) / 255;
      }
      return s / t.height;
    }
    var interior = 0, n = 0;
    for (i = 8; i < t.width - 8; i += 8) { interior += colStep(i, i + 1); n++; }
    o.tile.interiorStep = +(interior / n).toFixed(2);
    o.tile.wrapStep = +colStep(t.width - 1, 0).toFixed(2);
    o.tile.seamRatio = +(o.tile.wrapStep / (interior / n)).toFixed(2);

    return o;
  });
  S.ok('the tile lightens as much as it darkens', out.tile.balance > 0.8,
       'light-to-dark weight ratio ' + out.tile.balance +
       ' - unbalanced, the pass tints the whole map');

  S.ok('the tile wraps without a seam', out.tile.seamRatio < 1.6,
       'step across the wrap ' + out.tile.wrapStep + ' against ' + out.tile.interiorStep +
       ' inside, ratio ' + out.tile.seamRatio + ' (a tile that does not wrap shows several x)');

  S.ok('the tile is small', out.tile.kb <= 128, out.tile.size + ', ' + out.tile.kb + ' KB');

  /* ON THE LEGACY GROUND. The 3D ground is materials now (render3d/terrain3d.js): detail is
     computed per pixel in world space, so there is no magnified picture for the grain to put
     anything back into, and the materials switch it off. The grain still serves the baked
     ground behind RTS_GROUND_LEGACY, and that is what this measures. */
  var three = await g3d.page.evaluate(function () {
    window.RTS_GROUND_LEGACY = true;
    var G = window._rtsG, R = _rtsR, R3 = window._R3D, gl = R3.gl;
    for (var j = G.ents.length - 1; j >= 0; j--)
      if (G.ents[j].type === 'unit') { delete G.byId[G.ents[j].id]; G.ents.splice(j, 1); }
    G.fx.length = 0;
    if (G.proj) G.proj.length = 0;
    if (G.mapped) G.mapped.fill(1);
    if (G.vis) G.vis.fill(1);
    G.visDirty = 1;
    R.focus.x = _rtsWX(64); R.focus.z = _rtsWX(64);
    function look() {
      _rtsRFrame(1 / 60); _rtsRFrame(1 / 60);
      var W = R3.cv.width, H = R3.cv.height, buf = new Uint8Array(W * H * 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      var tones = {}, step = 0, n = 0;
      for (var y = (H >> 2); y < (H >> 1); y += 2) {
        for (var x = 10; x < W - 11; x++) {
          var q = (y * W + x) * 4;
          if (buf[q] + buf[q + 1] + buf[q + 2] < 30) continue;
          tones[(buf[q] << 16) | (buf[q + 1] << 8) | buf[q + 2]] = 1;
          step += Math.abs(buf[q] - buf[q + 4]) + Math.abs(buf[q + 1] - buf[q + 5]) +
                  Math.abs(buf[q + 2] - buf[q + 6]);
          n++;
        }
      }
      return { tones: Object.keys(tones).length, step: n ? +(step / n).toFixed(3) : 0 };
    }
    R.zi = RTS_ZOOMS.length - 1; _rtsApplyCam();       /* the closest rung 3D offers */
    var on = look();
    var keep = RTS_DETAIL_MIN_MAG;
    window.RTS_DETAIL_MIN_MAG = 1e9;                   /* the pass gated off entirely */
    var off = look();
    window.RTS_DETAIL_MIN_MAG = keep;
    /* THE GATE, READ RATHER THAN INFERRED. Turning it off through RTS_DETAIL_MIN_MAG is how
       the two frames above are compared, so the same knob cannot also be the evidence that the
       gate works - a mutation that removed the threshold entirely made "with" and "without"
       identical and would have slipped past a test phrased that way. _r3dGrainSet returns the
       magnification it decided on, and zero when it decided not to draw. */
    R.zi = RTS_ZOOMS.length - 1; _rtsApplyCam();
    _rtsRFrame(1 / 60);
    var magClose = R3.grainMag;
    R.zi = 0; _rtsApplyCam();
    _rtsRFrame(1 / 60);
    var magWide = R3.grainMag;
    var wide = look();
    window.RTS_GROUND_LEGACY = false;
    return { on: on, off: off, wide: wide, magClose: magClose, magWide: magWide,
             gate: RTS_DETAIL_MIN_MAG, cell: RTS_ZOOMS[RTS_ZOOMS.length - 1] };
  });

  S.ok('the 3D ground carries the grain too, at the zoom that needs it',
       three.on.step > three.off.step * 1.4,
       'neighbouring pixels differ by ' + three.on.step + ' with the pass and ' +
       three.off.step + ' without, at ' + three.cell + ' css px per cell');
  S.ok('...and far more distinct tones with it', three.on.tones > three.off.tones * 1.3,
       three.on.tones + ' tones against ' + three.off.tones);
  S.ok('...and it is skipped where the ground is not magnified',
       three.magWide === 0 && three.magClose >= three.gate,
       'the ground magnifies ' + three.magClose + 'x at the closest rung and the pass runs; at ' +
       'the widest it reports ' + three.magWide + ' and does not, against a gate of ' + three.gate);

  S.ok('no page errors', !g3d.errors.length, g3d.errors.join(' | ') || 'none');
  await g3d.close();
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
