/* THE CAMERA LEANS FAR ENOUGH TO SEE WHAT THE RENDERER DOES, AND THE VIEW STAYS ON THE MAP.

   The 3D mode shipped at 0.62 radians - 36 degrees from straight down - which is Red Alert's
   own near-top-down angle. At that angle a building shows its roof and almost no wall, an ore
   field reads as a gold texture rather than a field of standing crystals, and a forest reads as
   speckle. Smooth curved surfaces, cast shadows, contact occlusion and effects standing in the
   world are all things you see by looking at a scene from the side, and 36 degrees is not the
   side. It is 0.855 now, which is 49.

   THE CLAIM IS GRADED AGAINST THE OLD ANGLE RATHER THAN A NUMBER, because "how much of a
   building can you see" has no natural threshold - so the spec renders the same scene at both
   angles and compares.

   NOT by the building's own silhouette, which was the first thing tried and is wrong. A
   building's drawn height is its footprint's depth times cos(tilt) plus its wall's height times
   sin(tilt), and leaning the camera moves those two the opposite way: for the war factory,
   about twelve units deep and eight tall, 36 degrees gives 12*0.814 + 8*0.588 = 14.5 and 49
   gives 12*0.656 + 8*0.755 = 13.9. The silhouette gets SHORTER, because the footprint
   compresses faster than the wall grows, and measured that way the assertion failed - 0.621
   against 0.691 - while being perfectly correct about the camera.

   What actually follows from seeing a building's side is that the building HIDES more of what
   is behind it, and that is both a render measurement and the change's real cost to the player.
   The ground a wall of height h conceals runs h*tan(tilt) behind it, and tan goes from 0.727 to
   1.15 across this change - so the same explosion standing behind the same factory loses more
   of itself to the roof.

   AND LEANING THE CAMERA BROKE THE FOCUS CLAMP, which is the part worth a spec of its own. The
   visible ground is a TRAPEZOID - it reaches further up the screen than down it, because the far
   edge is further from the eye - so a focus sitting exactly half a view inside the map's edge
   still has a view that runs past it. That was already true at 36 degrees: measured at the top
   zoom, panned as far north as the camera would go, the view overshot the map by 6.5 world
   units and put 45 rows of off-map background across the top of the screen. Leaning further
   roughly doubles it, to 13.5 units and 61 rows.

   _rtsViewSpan already reported the trapezoid's true centre - the radar box needed it for the
   same reason - and _rtsClampFocus was the one caller still assuming the focus was it. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('tilt');

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
    var gl = R3.gl, CW = R3.cv.width, CH = R3.cv.height;
    o.tilt = R3D_TILT;
    o.deg = +(R3D_TILT * 180 / Math.PI).toFixed(1);
    /* the guard gl3d.js states for the horizon: positive means it cannot come on screen */
    o.guard = +(Math.cos(R3D_TILT) - Math.sin(R3D_TILT) / (2 * R3D_FOVK)).toFixed(3);

    /* ---------- 1. the view stays on the map, at the clamp's own limit, on all four sides ----
       The clamp derives its limit from the CURRENT zoom, and _rtsApplyCam runs at the end of
       it - so the zoom has to be applied BEFORE clamping or the limit is computed for whatever
       zoom was in force before, which is a smaller view, a tighter clamp, and a measurement
       that hides the overshoot entirely. That mistake is why this was first measured as clean. */
    R.zi = RTS_ZOOMS.length - 1;
    R.focus.x = 0; R.focus.z = 0; _rtsApplyCam();
    var HALF = RTS_N * RTS_TILE / 2;
    o.edges = [];
    [['north', 0, -1e6], ['south', 0, 1e6], ['west', -1e6, 0], ['east', 1e6, 0]]
      .forEach(function (e) {
        R.focus.x = e[1]; R.focus.z = e[2];
        _rtsClampFocus();
        var vb = _r3dViewBounds();
        _rtsRFrame(1 / 60); _rtsRFrame(1 / 60);
        var buf = new Uint8Array(CW * CH * 4);
        gl.readPixels(0, 0, CW, CH, gl.RGBA, gl.UNSIGNED_BYTE, buf);
        /* how many pixels are the background clear colour (4,6,9) rather than any ground */
        var bg = 0;
        for (var p = 0; p < buf.length; p += 4) {
          if (buf[p] < 14 && buf[p + 1] < 18 && buf[p + 2] < 24) bg++;
        }
        o.edges.push({ side: e[0],
                       over: +Math.max(0, Math.max(-HALF - vb.z0, vb.z1 - HALF,
                                                   -HALF - vb.x0, vb.x1 - HALF)).toFixed(1),
                       bgPct: +(bg / (CW * CH) * 100).toFixed(1) });
      });

    /* ---------- 2. picking still inverts exactly ---------- */
    R.focus.x = 0; R.focus.z = 0; _rtsApplyCam();
    var worst = 0;
    for (i = 0; i < 25; i++) {
      var wx = (i % 5 - 2) * 24, wz = ((i / 5 | 0) - 2) * 24;
      var s = _rtsWorldToScreen(wx, 0, wz);
      if (s.behind) continue;
      var back = _rtsGroundAt(s.x, s.y);
      if (!back) { worst = 1e9; break; }
      worst = Math.max(worst, Math.hypot(back.x - wx, back.z - wz));
    }
    o.pickErr = +worst.toFixed(4);

    /* ---------- 3. how much of a building the camera can see, at this angle and the old one --
       Same building, same zoom, same everything: only R3.cp/sp move. Graded by how much the
       building HIDES rather than by its own silhouette - see the note at the top for why the
       silhouette says the opposite of what it looks like it should. */
    var wf = null;
    for (i = 0; i < G.ents.length; i++) if (G.ents[i].def === 'factory') { wf = G.ents[i]; break; }
    o.found = !!wf;
    if (wf) {
      var keep = G.ents;
      G.ents = [wf];
      R.focus.x = wf.x; R.focus.z = wf.z; _rtsApplyCam();
      /* how much of a blast standing BEHIND the factory the factory manages to hide */
      function hidden(t) {
        R3.cp = Math.cos(t); R3.sp = Math.sin(t);
        _rtsApplyCam();
        function shot(fire) {
          G.fx.length = 0;
          if (fire) G.fx.push({ kind: 'boom', x: wf.x, y: 1, z: wf.z + fire,
                                t: 0.18, big: 1.0 });
          _rtsRFrame(0);
          var b = new Uint8Array(CW * CH * 4);
          gl.readPixels(0, 0, CW, CH, gl.RGBA, gl.UNSIGNED_BYTE, b);
          return b;
        }
        var bare = shot(0);
        function seen(dz) {
          var A = shot(dz), n = 0;
          for (var p = 0; p < A.length; p += 4) {
            if (Math.abs(A[p] - bare[p]) + Math.abs(A[p + 1] - bare[p + 1]) +
                Math.abs(A[p + 2] - bare[p + 2]) > 12) n++;
          }
          return n;
        }
        var clear = seen(9);        /* in front of the factory: nothing in the way */
        var occl = seen(-5);        /* behind it */
        G.fx.length = 0;
        return clear ? 1 - occl / clear : 0;
      }
      o.hidNew = +hidden(R3D_TILT).toFixed(3);
      o.hidOld = +hidden(0.62).toFixed(3);
      R3.cp = Math.cos(R3D_TILT); R3.sp = Math.sin(R3D_TILT);
      G.ents = keep;
      _rtsApplyCam();
    }
    return o;
  });

  S.ok('the 3D mode is available to check', out.on, out.on ? 'on' : 'no WebGL');
  if (!out.on) {
    S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');
    await g.close(); await browser.close();
    return require('../lib/report.js')(S);
  }

  S.ok('the camera leans well past the original near-top-down angle',
       out.tilt > 0.75 && out.tilt < 1.1,
       out.deg + ' degrees from straight down, against the 36 this shipped with');

  /* The projection's own guard, from the note in gl3d.js. */
  S.ok('...and not so far that the horizon can come on screen', out.guard > 0.2,
       'cos(tilt) - sin(tilt)/(2*FOVK) is ' + out.guard + ' - it reaches zero at about 77 ' +
       'degrees, where the ground would run to a horizon inside the viewport');

  /* THE FIX. */
  var worstBg = Math.max.apply(null, out.edges.map(function (e) { return e.bgPct; }));
  var worstOver = Math.max.apply(null, out.edges.map(function (e) { return e.over; }));
  S.ok('the view stays on the map at every edge the camera can reach',
       worstOver < 0.5 && worstBg < 0.5,
       out.edges.map(function (e) { return e.side + ' ' + e.bgPct + '%'; }).join(', ') +
       ' of off-map background, overshooting by at most ' + worstOver + ' world units - ' +
       'clamping the FOCUS rather than the view\'s centre put 45 rows (5.9%) of background ' +
       'across the top at 36 degrees and 61 rows (8%) at 49, because the visible ground is a ' +
       'trapezoid and its centre is not the focus');

  S.ok('...and the projection still inverts exactly', out.pickErr < 0.01,
       'world to screen and back is out by ' + out.pickErr + ' world units at worst over 25 ' +
       'points - picking, placement and the drag-pan all go through that inverse');

  S.ok('a building was found to look at', out.found, out.found ? 'factory' : 'none');
  if (out.found) {
    /* Graded against the old angle rather than a threshold - see the note at the top. */
    S.ok('a building stands between the camera and what is behind it',
         out.hidNew > out.hidOld + 0.08,
         'the war factory hides ' + (out.hidNew * 100).toFixed(0) + '% of an explosion behind ' +
         'it, against ' + (out.hidOld * 100).toFixed(0) + '% at the old 36 degrees - the same ' +
         'model, the same zoom, only the lean moved. That is the camera seeing the building\'s ' +
         'side, and it is also what the change costs the player: more of the battlefield sits ' +
         'behind something');
  }

  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})();
