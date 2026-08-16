/* EXPLOSIONS STAND IN THE WORLD INSTEAD OF LYING ON THE GLASS.

   Every effect in this game is a sprite animation, and in 3D they were decals: render/fx.js
   drew them onto the 2D canvas AFTER the GL frame had been blitted onto it. Two things follow
   from that, and both are visible.

   A blast was painted at the ground position of its cell whatever height it happened at,
   because the 2D path anchors through _rtsGroundToScreen and never reads f.y - which every
   caller sets. A building blowing up flashed at its feet rather than across its roof.

   And nothing could ever be in front of one. The decal is applied last, so a blast two cells
   behind a war factory painted straight over the roof.

   These are the same sprites drawn as camera-facing quads inside the world pass, so they stand
   at their own height and the depth buffer decides what covers what.

   WHY THE SIZE IS CHECKED AGAINST A FORMULA RATHER THAN AGAINST THE 2D MODE. The obvious test
   is to draw one effect in each mode and compare the two pictures, and it is meaningless: the
   two modes do not share a camera. _rtsGroundToScreen is projection-aware only in 3D, so the
   same world point lands somewhere else entirely in 2D, and measured that way the billboard
   came out 7.8% larger and 16px higher than "the same" sprite - all of it the difference
   between a tilted perspective camera and a flat top-down one. What CAN be compared, and is
   what actually matters, is whether the quad projects to the size the 2D sizing rule asks for,
   evaluated at the same projection. Both paths go through _rtsFxSize for exactly that reason. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('fxbillboard');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 900, height: 760, dpr: 1 });
  await g.start(7, 1);

  var out = await g.page.evaluate(function () {
    var o = {}, R = _rtsR, i;
    rtsSetVoxSide('allied');
    _rtsNewGame(4242, 'easy');
    var G = window._rtsG;
    for (i = 0; i < RTS_N * RTS_N; i++) { G.mapped[i] = 1; G.vis[i] = 1; }
    G.visDirty = 1;

    rts3dSet(true);
    var R3 = window._R3D;
    o.on = !!(R3 && R3.on);
    if (!o.on) return o;
    var gl = R3.gl;

    /* the war factory: the tallest thing on the map, so it can hide something behind it */
    var wf = null;
    for (i = 0; i < G.ents.length; i++) if (G.ents[i].def === 'factory') { wf = G.ents[i]; break; }
    o.found = !!wf;
    if (!wf) return o;
    R.focus.x = wf.x; R.focus.z = wf.z;
    R.zi = RTS_ZOOMS.length - 1; _rtsApplyCam();
    window.RTS_POST_ON = false;              /* the bloom would spread every footprint */
    var CW = R3.cv.width, CH = R3.cv.height;

    function frame(fx) {
      G.fx.length = 0;
      if (fx) for (var k = 0; k < fx.length; k++) G.fx.push(fx[k]);
      _rtsRFrame(0);
      var t = new Uint8Array(CW * CH * 4);
      gl.readPixels(0, 0, CW, CH, gl.RGBA, gl.UNSIGNED_BYTE, t);
      return t;
    }
    frame(null);
    var bare = frame(null);

    function drawnPx(A) {
      var n = 0, cy = 0;
      for (var p = 0; p < A.length; p += 4) {
        if (Math.abs(A[p] - bare[p]) + Math.abs(A[p + 1] - bare[p + 1]) +
            Math.abs(A[p + 2] - bare[p + 2]) < 12) continue;
        n++; cy += (p >> 2) / CW | 0;
      }
      /* readPixels counts rows from the BOTTOM, so a larger y is higher on screen */
      return { px: n, y: n ? +(cy / n).toFixed(0) : 0 };
    }

    /* ---------- 1. the pass runs at all ---------- */
    var front = frame([{ kind: 'boom', x: wf.x, y: 1, z: wf.z + 9, t: 0.18, big: 1.0 }]);
    o.drawnFront = R3.fxDrawn;
    o.front = drawnPx(front);

    /* ---------- 2. a building in front of one HIDES it ---------- */
    var behind = frame([{ kind: 'boom', x: wf.x, y: 1, z: wf.z - 5, t: 0.18, big: 1.0 }]);
    o.drawnBehind = R3.fxDrawn;
    o.behind = drawnPx(behind);

    /* ---------- 3. f.y is read, and by the right amount ----------
       Up the screen is y * sin(tilt) world units, and the zoom turns that into pixels. */
    var low = drawnPx(frame([{ kind: 'boom', x: wf.x, y: 0, z: wf.z + 9, t: 0.18, big: 1.0 }]));
    var high = drawnPx(frame([{ kind: 'boom', x: wf.x, y: 8, z: wf.z + 9, t: 0.18, big: 1.0 }]));
    o.rosePx = high.y - low.y;
    o.expectRise = +(8 * R3.sp * _rtsZoom()).toFixed(1);

    /* ---------- 4. the quad projects to the size the sizing rule asks for ----------
       Run the shader's own arithmetic in JS against the 2D path's number, at one projection,
       which is the only comparison that means anything (see the note at the top). */
    var f0 = { kind: 'boom', x: wf.x, y: 0, z: wf.z + 9, t: 0.18, big: 1.0 };
    var pick = _rtsFxFrame(f0, R.spr);
    var TSscale = R.cell / RTS_TS, zoom = _rtsZoom();
    var xp = _rtsGroundToScreen(f0.x, f0.z);
    var szh2d = _rtsFxSize(pick.img, TSscale, f0.big) * xp.scale *
                (pick.img.height / pick.img.width);
    var w = _rtsFxSize(pick.img, TSscale, f0.big) / zoom;
    var h = w * (pick.img.height / pick.img.width);
    function projY(y, z, lift) {
      var sy = ((z - R.focus.z) * R3.cp - y * R3.sp) * (2 * zoom * R.dpr / CH);
      var d = ((z - R.focus.z) * R3.sp + y * R3.cp) + lift;
      return (0.5 + sy / (1 - d / _r3dEyeDist()) * 0.5) * CH / R.dpr;
    }
    var topY = projY((h / 2) * R3.sp, f0.z - (h / 2) * R3.cp, 0);
    var botY = projY(-(h / 2) * R3.sp, f0.z + (h / 2) * R3.cp, 0);
    o.szh2d = +szh2d.toFixed(1);
    o.szh3d = +Math.abs(botY - topY).toFixed(1);

    /* ---------- 5. the 2D path has stood down for exactly these kinds ----------
       Both sides carry a list of which effects the 3D pass owns, and a disagreement either
       draws an effect twice or loses it entirely. Run the 2D painter onto a scratch canvas
       with 3D on: for an owned kind it must put down nothing. */
    /* FULL SIZE, AND WITH THE SAME TRANSFORM THE REAL FRAME USES. The first version of this
       was a 200x200 scratch canvas, and the effect projects to the middle of a 900x760 screen -
       so the 2D painter drew it cleanly off the edge and the check passed no matter what.
       Mutation-testing caught it: removing the skip in render/fx.js changed nothing here. */
    var sc = document.createElement('canvas');
    sc.width = R.W * R.dpr; sc.height = R.H * R.dpr;
    var sg = sc.getContext('2d');
    sg.setTransform(R.dpr, 0, 0, R.dpr, 0, 0);
    var kinds = ['boom', 'pop', 'hit', 'piff', 'splash', 'smoke'];
    var painted = [];
    for (i = 0; i < kinds.length; i++) {
      sg.clearRect(0, 0, R.W, R.H);
      G.fx.length = 0;
      G.fx.push({ kind: kinds[i], x: R.focus.x, y: 0, z: R.focus.z, t: 0.18, big: 1.0 });
      try { _rtsDrawFx(sg, G, R.spr, TSscale, R.cell); } catch (e) { }
      var d = sg.getImageData(0, 0, sc.width, sc.height).data, any = 0;
      for (var p2 = 3; p2 < d.length; p2 += 4) if (d[p2] > 8) { any = 1; break; }
      if (any) painted.push(kinds[i]);
    }
    o.doubleDrawn = painted;
    G.fx.length = 0;
    return o;
  });

  S.ok('the 3D mode is available to check', out.on, out.on ? 'on' : 'no WebGL');
  if (!out.on) {
    S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');
    await g.close(); await browser.close();
    return require('../lib/report.js')(S);
  }
  S.ok('a tall building was found to hide things behind', out.found, out.found ? 'factory' : 'none');

  if (out.found) {
    S.ok('an explosion is drawn by the world pass', out.drawnFront === 1 && out.front.px > 300,
         out.front.px + ' pixels from one blast, ' + out.drawnFront + ' quad submitted');

    /* THE CLAIM THE DECAL COULD NEVER MAKE. */
    S.ok('...and a building in front of one hides part of it',
         out.behind.px > 0 && out.behind.px < out.front.px * 0.85,
         'the same blast covers ' + out.front.px + ' pixels in front of a war factory and ' +
         out.behind.px + ' behind it - drawn over the finished picture the two are identical, ' +
         'because a decal is applied after everything and nothing can ever be in front of it');

    /* The other one: f.y is set by every caller and was read by nobody. */
    S.ok('an explosion happens at the height it happened at',
         Math.abs(out.rosePx - out.expectRise) < 6,
         'raising a blast 8 world units moves it ' + out.rosePx + 'px up the screen, against ' +
         out.expectRise + 'px of tilt and zoom - anchored through the ground, as the 2D path ' +
         'does, it does not move at all');

    /* Both paths size through _rtsFxSize; this is that agreement, at one projection. */
    S.ok('a billboard is the size the sizing rule asks for',
         Math.abs(out.szh3d - out.szh2d) < 1.5,
         'the quad projects to ' + out.szh3d + 'px tall where the 2D rule asks for ' +
         out.szh2d + 'px - the two go through one _rtsFxSize so they cannot drift');

    S.ok('...and the 2D painter has stood down for the kinds the world pass took',
         out.doubleDrawn.length === 0,
         out.doubleDrawn.length ? 'still drawn in 2D as well: ' + out.doubleDrawn.join(', ') +
         ' - which paints each of them twice, once in the world and once over it'
         : 'none of boom/pop/hit/piff/splash/smoke paint twice');
  }

  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})();
