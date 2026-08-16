/* THE 3D CAMERA HAS PERSPECTIVE, AND THE PICTURE PROVES IT.

   The mode was orthographic, and that is most of why the answer to "can we make this actual 3D?"
   kept being "it looks 2D to me". An orthographic camera has NO convergence: two identical tanks
   a hundred units apart in depth draw at exactly the same size, every vertical edge in the scene
   stays exactly vertical, and the only depth cue left is the 35-degree lean - which is a cue for
   "the sprites are tall", not for "the world has depth". A perspective divide is the cue.

   THE MEASUREMENTS ARE TAKEN OFF THE RENDERED FRAME, not off the projection function. That
   matters more here than anywhere else in the renderer: the shader and the JS projection are two
   independent implementations of the same camera, and the entire input path depends on them
   agreeing. A spec that only asked _rtsWorldToScreen would pass with a shader still drawing
   orthographic - and the game would be unplayable, every click landing beside its target, with
   nothing in this suite noticing.

   So the marker is the FOG. One cell is flipped from visible to unexplored, the frame is rendered
   before and after, and the pixels that changed are the ones the GL side put that cell's fog on -
   read straight out of the framebuffer. The centroid of the difference is where the shader thinks
   the cell is, to sub-pixel precision, with no dependence on the scene's content.

   THE PERSPECTIVE CLAIM, stated so that only a perspective camera can pass it: two cells at the
   SAME world x, one near the top of the screen and one near the bottom, must land at DIFFERENT
   screen x. Under an orthographic camera screenX = (wx - focus.x) * zoom + W/2 and depends on
   nothing but wx, so the two are pixel-identical by construction and the gap below is exactly 0.
   Convergence is the whole of what a perspective camera adds, and it is the whole of this test.

   THE FIELD OF VIEW IS THE SAME AT EVERY ZOOM, which is a property of how the eye distance is
   defined rather than a value anyone tuned: D is R3D_FOVK screen-HEIGHTS of world, so it moves
   with the zoom and the ratio (half-view-height / D) - the only thing the convergence depends
   on - is a pure constant. Zooming therefore dollies the camera instead of changing the lens,
   which is what a real camera does and what stops the picture's proportions shifting under the
   player as they zoom. Written as a constant instead, D would give a different lens at every
   rung of the ladder and a different one again on every phone. Graded across the whole ladder,
   because one zoom cannot tell the two apart.

   AND THE GROUND IS STILL ONE QUAD OVER THE WHOLE MAP, which under a perspective camera is not
   obviously allowed: at the top zoom the eye plane cuts the map 242 world units south of the
   focus and the quad reaches far past that, so a good part of it is behind the eye. Nothing
   clamps w, so the hardware clips it there exactly - and the last assertion is the cheap guard
   on that reasoning being right at all: the ground still reaches every corner of the screen and
   the clear colour shows through nowhere. Cutting the quad to the visible patch was written and
   measured as the alternative; it moved 0.26-1.4% of pixels by sub-texel rounding and nothing
   else, so it is not what ships. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('perspective');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 900, height: 650, dpr: 1 });
  await g.start(7, 1);

  var out = await g.page.evaluate(function () {
    var o = {}, R = _rtsR, i;
    rtsSetVoxSide('allied');
    _rtsNewGame(4242, 'easy');
    var G = window._rtsG;
    for (i = 0; i < RTS_N * RTS_N; i++) { G.mapped[i] = 1; G.vis[i] = 1; }
    G.visDirty = 1;
    /* park in the middle of the map so every sample cell is well inside it */
    R.focus.x = _rtsWX(RTS_N / 2); R.focus.z = _rtsWX(RTS_N / 2);
    R.zi = 1; _rtsApplyCam();

    /* --- what the flat window used to cover, for the record --- */
    var zm = _rtsZoom();
    o.flatRows = Math.round(R.H / zm / RTS_TILE);

    rts3dSet(true);
    var R3 = window._R3D;
    o.on = !!(R3 && R3.on);
    if (!o.on) return o;

    o.fovk = R3D_FOVK;
    o.zoomCount = RTS_ZOOMS.length;
    o.eye = +_r3dEyeDist().toFixed(1);

    /* ---------------- the projection function's own numbers ---------------- */
    /* scale across the screen: 1 everywhere under an orthographic camera */
    var topP = _rtsGroundAt(R.W / 2, R.H * 0.10);
    var botP = _rtsGroundAt(R.W / 2, R.H * 0.90);
    o.cornersHit = !!(topP && botP);
    if (!o.cornersHit) return o;
    o.scaleTop = +_rtsGroundToScreen(topP.x, topP.z).scale.toFixed(4);
    o.scaleBot = +_rtsGroundToScreen(botP.x, botP.z).scale.toFixed(4);
    o.scaleRange = +(o.scaleBot / o.scaleTop).toFixed(4);

    /* round trip, at the extremes of the screen rather than near the middle where any
       projection is nearly right */
    var worst = 0;
    [[40, 30], [860, 30], [40, 620], [860, 620], [450, 325]].forEach(function (pt) {
      var p = _rtsGroundAt(pt[0], pt[1]);
      if (!p) { worst = 1e9; return; }
      var s = _rtsWorldToScreen(p.x, 0, p.z);
      worst = Math.max(worst, Math.abs(s.x - pt[0]), Math.abs(s.y - pt[1]));
    });
    o.roundtrip = +worst.toFixed(3);

    /* the cell window the 2D overlays iterate - through the projection now */
    var cw = _rtsCellWindow(1, 2);
    o.rows3d = cw.tz1 - cw.tz0 + 1;

    /* the lens, at every rung of the ladder */
    o.ladder = [];
    for (var li = 0; li < RTS_ZOOMS.length; li++) {
      R.zi = li; _rtsApplyCam();
      var lt = _rtsGroundAt(R.W / 2, 0), lb = _rtsGroundAt(R.W / 2, R.H);
      o.ladder.push({
        cell: R.cell, eye: +_r3dEyeDist().toFixed(1),
        range: (lt && lb)
          ? +(_rtsGroundToScreen(lb.x, lb.z).scale / _rtsGroundToScreen(lt.x, lt.z).scale).toFixed(4)
          : null
      });
    }
    R.zi = 1; _rtsApplyCam();

    /* ---------------- the same thing, measured off the frame ---------------- */
    var gl = R3.gl, CW = R3.cv.width, CH = R3.cv.height;
    function shot() {
      _rtsRFrame(1 / 60);
      var b = new Uint8Array(CW * CH * 4);
      gl.readPixels(0, 0, CW, CH, gl.RGBA, gl.UNSIGNED_BYTE, b);
      return b;
    }
    /* Where the SHADER puts a cell: flip its fog on, diff the two frames, take the centroid of
       what changed. readPixels is bottom-up, and in device pixels. */
    function shaderPos(tx, tz) {
      var k = _rtsIdx(tx, tz);
      G.mapped[k] = 1;
      var A = shot();
      G.mapped[k] = 0;
      var B = shot();
      G.mapped[k] = 1;
      var sx = 0, sy = 0, sw = 0;
      for (var y = 0; y < CH; y++) {
        for (var x = 0; x < CW; x++) {
          var p = (y * CW + x) * 4;
          var d = Math.abs(A[p] - B[p]) + Math.abs(A[p + 1] - B[p + 1]) +
                  Math.abs(A[p + 2] - B[p + 2]);
          if (d > 8) { sx += x * d; sy += y * d; sw += d; }
        }
      }
      if (!sw) return null;
      return { x: (sx / sw) / R.dpr, y: (CH - 1 - sy / sw) / R.dpr, mass: sw };
    }

    /* Two cells at the SAME world x, one near the top of the view and one near the bottom.
       Offset well off centre, because convergence is a fan about the centre line and there is
       nothing to see on the axis itself. */
    var offX = R.W * 0.30 / zm;                       /* world units right of the focus */
    var wx = R.focus.x + offX;
    var tx = _rtsTX(wx);
    var tzTop = _rtsTX(topP.z), tzBot = _rtsTX(botP.z);
    o.cells = { tx: tx, tzTop: tzTop, tzBot: tzBot };

    var mTop = shaderPos(tx, tzTop), mBot = shaderPos(tx, tzBot);
    o.marked = !!(mTop && mBot);
    if (o.marked) {
      var jTop = _rtsGroundToScreen(_rtsWX(tx), _rtsWX(tzTop));
      var jBot = _rtsGroundToScreen(_rtsWX(tx), _rtsWX(tzBot));
      o.shaderTop = { x: +mTop.x.toFixed(2), y: +mTop.y.toFixed(2) };
      o.shaderBot = { x: +mBot.x.toFixed(2), y: +mBot.y.toFixed(2) };
      o.jsTop = { x: +jTop.x.toFixed(2), y: +jTop.y.toFixed(2) };
      o.jsBot = { x: +jBot.x.toFixed(2), y: +jBot.y.toFixed(2) };
      o.agreeTop = +Math.max(Math.abs(mTop.x - jTop.x), Math.abs(mTop.y - jTop.y)).toFixed(2);
      o.agreeBot = +Math.max(Math.abs(mBot.x - jBot.x), Math.abs(mBot.y - jBot.y)).toFixed(2);
      /* THE CLAIM: same world x, two different screen x. Exactly 0 under an ortho camera. */
      o.converge = +Math.abs(mBot.x - mTop.x).toFixed(2);
      o.convergeJs = +Math.abs(jBot.x - jTop.x).toFixed(2);
    }

    /* ---------------- the ground still covers the screen ---------------- */
    /* The clear colour is rgb(4,6,9). With every cell mapped and visible the fog contributes
       nothing, so any pixel that exact is ground the quad failed to reach. */
    var frame = shot(), bare = 0, tot = 0;
    for (var yy = 2; yy < CH - 2; yy += 3) {
      for (var xx = 2; xx < CW - 2; xx += 3) {
        var q = (yy * CW + xx) * 4;
        tot++;
        if (frame[q] === 4 && frame[q + 1] === 6 && frame[q + 2] === 9) bare++;
      }
    }
    o.bareShare = +(bare / tot * 100).toFixed(2);
    o.sampled = tot;

    rts3dSet(false);
    o.off = !(window._R3D && window._R3D.on);
    /* and 2D is untouched - same closed form, same pixel */
    var p2 = _rtsGroundAt(450, 325), s2 = _rtsWorldToScreen(p2.x, 0, p2.z);
    o.roundtrip2d = +Math.max(Math.abs(s2.x - 450), Math.abs(s2.y - 325)).toFixed(4);
    o.scale2d = _rtsWorldToScreen(p2.x, 0, p2.z).scale;
    var cw2 = _rtsCellWindow(1, 2);
    o.win2d = { tz0: cw2.tz0, tz1: cw2.tz1 };
    o.win2dFlat = {
      tz0: Math.max(0, _rtsTX(R.focus.z - R.H / 2 / _rtsZoom()) - 2),
      tz1: Math.min(RTS_N - 1, _rtsTX(R.focus.z + R.H / 2 / _rtsZoom()) + 2)
    };
    return o;
  });

  S.ok('the 3D mode is available to check', out.on, out.on ? 'on' : 'no WebGL');
  if (!out.on) {
    S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');
    await g.close(); await browser.close();
    return require('../lib/report.js')(S);
  }

  S.ok('the screen corners still meet the ground', out.cornersHit,
       out.cornersHit ? ('eye ' + out.eye + ' world units out, a field of view of ' + out.fovk +
                         ' screen-heights')
                      : 'the horizon is on screen - the inverse has no answer for a corner');

  /* Under either orthographic camera every one of these is exactly 1.0000. */
  S.ok('the projection magnifies what is near and shrinks what is far',
       out.scaleRange > 1.2,
       'scale ' + out.scaleBot + ' at the bottom of the screen against ' + out.scaleTop +
       ' at the top, a range of ' + out.scaleRange + 'x (an orthographic camera returns 1.0000 ' +
       'for both, which is why every overlay drew the same size everywhere)');

  S.ok('screen -> ground -> screen returns the same pixel, at the corners',
       out.roundtrip <= 1,
       'worst drift ' + out.roundtrip + 'px across the four corners and the centre');

  if (out.marked) {
    /* The load-bearing assertion: two independent implementations of one camera. */
    S.ok('the shader and the projection function place a cell in the same place',
         out.agreeTop <= 2.5 && out.agreeBot <= 2.5,
         'the frame puts the far cell at ' + out.shaderTop.x + ',' + out.shaderTop.y +
         ' and the projection puts it at ' + out.jsTop.x + ',' + out.jsTop.y + ' (' +
         out.agreeTop + 'px); near cell ' + out.shaderBot.x + ',' + out.shaderBot.y +
         ' against ' + out.jsBot.x + ',' + out.jsBot.y + ' (' + out.agreeBot + 'px)');

    S.ok('THE PICTURE CONVERGES: one world x, two screen x',
         out.converge > 20,
         'two cells at the same world x land ' + out.converge + 'px apart across the screen ' +
         '(the projection predicts ' + out.convergeJs + '; an orthographic camera puts them at ' +
         'exactly the same x, because screenX depends on nothing but wx)');
  } else {
    S.ok('the fog marker was found in the frame', false, 'nothing changed between the two frames');
  }

  S.ok('the ground still reaches every corner of the screen',
       out.bareShare < 0.5,
       out.bareShare + '% of ' + out.sampled + ' samples are the clear colour - the quad spans ' +
       'the whole map and a good part of it is behind the eye, which is only safe because ' +
       'nothing clamps w and the hardware clips it there');

  var ranges = (out.ladder || []).map(function (r) { return r.range; });
  var spread = ranges.length && ranges.indexOf(null) < 0
    ? Math.max.apply(null, ranges) - Math.min.apply(null, ranges) : 1;
  S.ok('the lens does not change when the zoom does - zooming dollies the eye',
       ranges.length === out.zoomCount && spread < 0.002,
       (out.ladder || []).map(function (r) {
         return 'cell ' + r.cell + ': eye ' + r.eye + ', range ' + r.range;
       }).join(' | ') + ' - the eye distance moves with the zoom so the convergence cannot, ' +
       'which a constant eye distance would not give');

  S.ok('the cell window follows the camera rather than the zoom',
       out.rows3d > out.flatRows,
       out.rows3d + ' rows of cells covered in 3D against the ' + out.flatRows +
       ' the flat H/zoom arithmetic gives - the difference is the rows furthest from the ' +
       'camera, which is where the sea used to stop early');

  S.ok('2D is untouched: same pixel, unit scale, same window',
       out.off && out.roundtrip2d <= 0.001 && out.scale2d === 1 &&
       out.win2d.tz0 === out.win2dFlat.tz0 && out.win2d.tz1 === out.win2dFlat.tz1,
       'round trip ' + out.roundtrip2d + 'px, scale ' + out.scale2d + ', window rows ' +
       out.win2d.tz0 + '-' + out.win2d.tz1 + ' against the arithmetic it replaced, ' +
       out.win2dFlat.tz0 + '-' + out.win2dFlat.tz1);

  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})();
