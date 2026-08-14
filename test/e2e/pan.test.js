/* THE MAP STAYS UNDER YOUR FINGER, AND THE OVERLAY IS SIZED BY THE PROJECTION.

   Two halves of the same mistake: code that knew where a point was but not how the projection
   got it there.

   THE TOUCH PAN DIVIDED BY THE ZOOM. It moved the camera by the pixel delta over _rtsZoom() on
   both axes, which is the right answer only for a camera looking straight down. In 3D the view
   is tilted - screenY is (wz - focus.z) * cos(tilt) * zoom - so a vertical drag of N pixels is
   N / (zoom * cos(tilt)) world units. With R3D_TILT at 0.62 the cosine is 0.8139, so every
   vertical pan in 3D moved the ground 18.6% less than the finger asked for. On a phone, where
   dragging is the only way to move the camera at all, the map slid out from under the fingertip
   the whole time. It goes through _rtsGroundAt now - the projection's own inverse - which is
   correct for any projection and stays correct if the camera gains perspective or yaw.

   THE HUD IGNORED THE SCALE IT WAS HANDED. _rtsWorldToScreen returns the scale to draw at as
   well as the point to draw at. ui/hud.js read the point, checked `behind`, and sized health
   bars from the literals 46 and 26, brackets from _rtsR.cell, and the order ping from 26 and
   14. It is invisible today - both cameras are orthographic and the scale is 1 - which is
   exactly why it needs a test: nothing in the picture would show it until a perspective camera
   made every bar on screen the wrong size at once.

   BOTH ARE GRADED ON BEHAVIOUR, NOT ARITHMETIC. The pan test dispatches real touch events and
   asks where the world went; the HUD test forces a scale of 2 through the real projection
   function and measures the rectangles the real drawing code emits. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('pan');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 900, height: 650, dpr: 1 });
  await g.start(7, 1);

  var out = await g.page.evaluate(function () {
    var o = {}, R = _rtsR;
    rtsSetVoxSide('allied');
    _rtsNewGame(4242, 'easy');

    var cv = document.getElementById('rtsCv');
    function fire(type, x, y) {
      var r = cv.getBoundingClientRect();
      var t = new Touch({ identifier: 7, target: cv,
                          clientX: r.left + x, clientY: r.top + y });
      cv.dispatchEvent(new TouchEvent(type, {
        touches: type === 'touchend' ? [] : [t],
        targetTouches: type === 'touchend' ? [] : [t],
        changedTouches: [t], bubbles: true, cancelable: true, view: window
      }));
    }
    /* Drag from a to b and report how far the ground that started under the finger ended up
       from it. A correct pan leaves it exactly under the fingertip. */
    function drag(ax, ay, bx, by) {
      var before = _rtsGroundAt(ax, ay);
      fire('touchstart', ax, ay);
      /* several steps, because the handler integrates deltas between moves */
      var N = 6;
      for (var i = 1; i <= N; i++) {
        fire('touchmove', ax + (bx - ax) * i / N, ay + (by - ay) * i / N);
      }
      fire('touchend', bx, by);
      var after = _rtsGroundAt(bx, by);
      return { dx: +(after.x - before.x).toFixed(3), dz: +(after.z - before.z).toFixed(3) };
    }

    /* park well inside the map so the focus clamp cannot absorb the drag */
    function centre() { R.focus.x = _rtsWX(RTS_N / 2); R.focus.z = _rtsWX(RTS_N / 2); }

    R.zi = 1; _rtsApplyCam();
    centre();
    o.slip2d = drag(430, 300, 330, 180);

    rts3dToggle();
    o.on3d = !!(window._R3D && window._R3D.on);
    if (o.on3d) {
      o.cp = +window._R3D.cp.toFixed(4);
      centre();
      o.slip3d = drag(430, 300, 330, 180);
      rts3dToggle();
    }

    /* --- the HUD's use of `scale` --- */
    /* Reveal first: the health-bar pass is gated on _rtsEntSeen, and a game this fresh has
       swept no visibility yet, so nothing would be drawn to measure. */
    var G2 = window._rtsG;
    for (var mi = 0; mi < RTS_N * RTS_N; mi++) { G2.mapped[mi] = 1; G2.vis[mi] = 1; }
    G2.visDirty = 1;
    var yard = _rtsHas('player', 'yard');
    G2.sel = [yard];
    /* and look at it - the pass culls anything off screen, and the pan test above left the
       camera parked in the middle of the map */
    R.focus.x = yard.x; R.focus.z = yard.z;
    _rtsRFrame(1 / 60);
    var hud = document.getElementById('rtsHud'), hg = hud.getContext('2d');
    function bars(forceScale) {
      var real = window._rtsWorldToScreen;
      if (forceScale != null) {
        window._rtsWorldToScreen = function (x, y, z) {
          var s = real(x, y, z); s.scale = forceScale; return s;
        };
      }
      var rects = [], ellipses = [], origR = hg.fillRect, origE = hg.ellipse;
      hg.fillRect = function (x, y, w, h) { rects.push({ w: w, h: h }); return origR.apply(this, arguments); };
      hg.ellipse = function (x, y, rx, ry) { ellipses.push({ rx: rx, ry: ry }); return origE.apply(this, arguments); };
      _rtsDrawHud(1 / 60);
      hg.fillRect = origR; hg.ellipse = origE;
      window._rtsWorldToScreen = real;
      /* the health bar is the widest rect the pass draws over an entity */
      var w = 0;
      for (var i = 0; i < rects.length; i++) if (rects[i].w > w && rects[i].w < 400) w = rects[i].w;
      return { barW: +w.toFixed(2), rects: rects.length };
    }
    o.hud1 = bars(1);
    o.hud2 = bars(2);
    o.hudRatio = o.hud1.barW > 0 ? +(o.hud2.barW / o.hud1.barW).toFixed(3) : 0;
    return o;
  });

  /* The whole claim of a drag-to-pan control: the ground you grabbed is the ground you still
     have. A tolerance of a tenth of a world unit is well under a cell (RTS_TILE is 4). */
  S.ok('a touch drag leaves the ground under the finger in 2D',
       Math.abs(out.slip2d.dx) < 0.1 && Math.abs(out.slip2d.dz) < 0.1,
       'the world point that started under the finger ended ' + out.slip2d.dx + ' x and ' +
       out.slip2d.dz + ' z away from it');

  S.ok('the 3D mode is available to check', out.on3d,
       out.on3d ? ('tilt cosine ' + out.cp) : 'no WebGL');

  if (out.on3d) {
    S.ok('...and in 3D, where the tilt used to eat 18.6% of every vertical drag',
         Math.abs(out.slip3d.dx) < 0.1 && Math.abs(out.slip3d.dz) < 0.1,
         'slip ' + out.slip3d.dx + ' x, ' + out.slip3d.dz + ' z (dividing by the zoom alone ' +
         'left the ground short by a factor of ' + out.cp + ' on the z axis)');
  }

  /* Scale is 1 in both shipped cameras, so this forces it through the real projection function
     and measures the rectangles the real HUD code emits. Doubling the scale must double the
     bar; before the fix it changed nothing at all. */
  S.ok('the HUD draws something to measure', out.hud1.rects > 0 && out.hud1.barW > 0,
       out.hud1.rects + ' rects, widest bar ' + out.hud1.barW + 'px');
  S.ok('health bars are sized by the projection, not by a literal',
       Math.abs(out.hudRatio - 2) < 0.05,
       'doubling the projection scale takes the bar from ' + out.hud1.barW + 'px to ' +
       out.hud2.barW + 'px, a ratio of ' + out.hudRatio + ' (it was 1.0 - the literal 46)');

  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})();
