/* THE LIVE 3D MODE: it renders, it projects, and the game stays playable inside it.

   The mode draws the same models the sprite baker flattens - there is no second set of
   geometry to drift - so what can actually break is the seam between the two worlds:

   THE PROJECTION CONTRACT is the load-bearing part. Input picking, drag select, health bars,
   effects and the ghost all reach the screen through _rtsSX/_rtsSY/_rtsGroundAt/
   _rtsWorldToScreen, and in 3D those become the tilted-camera forms while the GL shader
   projects the same numbers independently (render3d/gl3d.js). If the two ever disagree,
   every click lands beside the thing it was aimed at - a failure no other spec would see,
   because the 2D mode's identity projection cannot produce it. So the round trip is asserted
   exactly: ground -> screen -> ground must return the pixel it started from.

   THE BLIT is the other seam. The GL canvas is drawn into the 2D frame rather than stacked
   under it, because compositor stacking rendered black in headless capture while the buffer
   provably held the scene (the reduced cases all passed; the real page did not - environment
   compositing of a stacked GL layer is exactly the kind of thing this project cannot rely on
   if it wants its renderer testable). The spec therefore checks the SCENE ARRIVES ON THE 2D
   CANVAS, which is what a player sees, not just that GL drew into its own buffer. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('r3dlive');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 900, height: 650 });
  await g.start(7, 1);

  var out = await g.page.evaluate(function () {
    var o = {};
    rtsSetVoxSide('allied');
    _rtsNewGame(4242, 'easy');
    var G = window._rtsG, yard = _rtsHas('player', 'yard');
    /* spawn on ground PROVEN open - a spawn onto a blocked cell returns null and the pick
       assertion below would then be reporting a harness fault as a projection fault */
    var sp = _rtsNearestOpen(yard.tx + 3, yard.tz + 9, 10, null);
    var tank = sp && _rtsSpawnUnit('player', 'tank', _rtsWX(sp[0]), _rtsWX(sp[1]));
    for (var t = 0; t < 30; t++) _rtsTick(1 / 60);
    o.tank = !!(tank && !tank.dead);

    o.button = !!document.getElementById('rts3dBtn');
    rts3dSet(true);
    var R3 = window._R3D;
    o.on = !!(R3 && R3.on);
    if (!o.on) return o;

    /* one real frame through the real frame function, so the blit path is what is tested */
    _rtsRFrame(1 / 60);
    o.meshes = Object.keys(R3.mesh).length;

    /* the scene reaches the canvas the player sees: sample the 2D canvas across a grid and
       count distinct colours - a failed blit is one flat colour, a scene is many */
    var cv = document.getElementById('rtsCv');
    var ctx = cv.getContext('2d');
    var seen = {}, n = 0;
    for (var gy = 0.2; gy < 0.9; gy += 0.1) {
      for (var gx = 0.1; gx < 0.9; gx += 0.1) {
        var d = ctx.getImageData(Math.floor(cv.width * gx), Math.floor(cv.height * gy), 1, 1).data;
        seen[d[0] + ',' + d[1] + ',' + d[2] + ',' + d[3]] = 1; n++;
      }
    }
    o.sampled = n; o.tones = Object.keys(seen).length;

    /* THE ROUND TRIP, at several screen points and both zoom directions of the ground plane.
       The tolerance is one pixel: these are closed-form inverses of each other, so anything
       larger means the shader and the JS have genuinely diverged. */
    var worst = 0;
    [[200, 150], [450, 325], [700, 500], [333, 444]].forEach(function (pt) {
      var p = _rtsGroundAt(pt[0], pt[1]);
      /* the forward map that matches the inverse - both read the terrain; see e2e/perspective */
      var s = _rtsGroundToScreen(p.x, p.z);
      worst = Math.max(worst, Math.abs(s.x - pt[0]), Math.abs(s.y - pt[1]));
    });
    o.roundtrip = +worst.toFixed(3);

    /* height lifts things UP the screen in 3D, as it does in 2D - the sign is easy to flip */
    var flat = _rtsWorldToScreen(yard.x, 0, yard.z), tall = _rtsWorldToScreen(yard.x, 10, yard.z);
    o.heightLifts = tall.y < flat.y;

    /* a real pick through the 3D projection: aim at where the tank PROJECTS, not where it is */
    var ts = _rtsWorldToScreen(tank.x, 0, tank.z);
    /* _rtsPickAt returns a wrapper - every real caller reads hit.ent (see _rtsModeClick) */
    var hit = _rtsPickAt(ts.x, ts.y), he = hit && hit.ent;
    o.picked = !!(he && he === tank);
    o.pickedWho = he ? (he.def + '#' + he.id) : 'nothing';
    o.tankWho = tank ? (tank.def + '#' + tank.id + ' seen:' + _rtsEntSeen(tank)) : 'null';

    /* the world is geometry, not just a textured plane: forests, ridges, ore and grass are
       batched static meshes, and the count is the claim - A MILLION triangles of map, which
       only stays affordable because the chunks are view-culled. The floor holds the density
       (this seed builds ~1.007M; a mix change that drops below the million is a regression
       of the requirement, not noise), and the cull check holds the affordability - drawing
       all 16 chunks every frame would push the full million through the vertex stage. */
    _rtsRFrame(1 / 60);
    o.worldTris = Math.round(R3.worldTris || 0);
    o.oreTris = R3.oreMesh ? Math.round(R3.oreMesh.verts / 3) : 0;
    o.chunks = R3.world.length;
    /* the renderer's own view rectangle, not a copy of its arithmetic - _r3dViewBounds is
       where the cull, the radar box and the overlay cell window all read it from, so a camera
       change moves this with them instead of leaving a stale replica here */
    var vb = _r3dViewBounds();
    var lift = 14 * R3.sp / R3.cp, drawn = 0;
    for (var wc = 0; wc < R3.world.length; wc++) {
      var wm = R3.world[wc];
      if (wm.x1 < vb.x0 - 4 || wm.x0 > vb.x1 + 4 ||
          wm.z1 < vb.z0 || wm.z0 > vb.z1 + lift) continue;
      drawn++;
    }
    o.chunksDrawn = drawn;

    /* and the way back: 2D must be untouched by the round trip through 3D */
    rts3dSet(false);
    o.off = !(window._R3D && window._R3D.on);
    var p2 = _rtsGroundAt(450, 325), s2 = _rtsWorldToScreen(p2.x, 0, p2.z);
    o.roundtrip2d = +Math.max(Math.abs(s2.x - 450), Math.abs(s2.y - 325)).toFixed(3);
    return o;
  });

  S.ok('the 3D button is in the top bar', out.button, out.button ? 'present' : 'missing');
  S.ok('the mode turns on', out.on, out.on ? 'on' : 'toggle refused (no WebGL?)');
  S.ok('a tank stood on open ground for the pick', out.tank, out.tank ? 'spawned' : 'spawn refused');
  if (out.on) {
    S.ok('models become meshes on first sight', out.meshes > 0, out.meshes + ' meshes cached');
    S.ok('the scene reaches the canvas the player actually sees', out.tones >= 8,
         out.tones + ' distinct colours across ' + out.sampled + ' samples' +
         ' (a failed blit is 1)');
    S.ok('screen -> ground -> screen returns the same pixel', out.roundtrip <= 1,
         'worst drift ' + out.roundtrip + 'px across four points');
    S.ok('height lifts things up the screen', out.heightLifts,
         out.heightLifts ? 'yes' : 'sign flipped - everything would draw sunk into the ground');
    S.ok('a unit is picked at its projected position', out.picked,
         out.picked ? 'clicked the tank through the 3D projection'
                    : 'aimed at ' + out.tankWho + ', hit ' + out.pickedWho);
    S.ok('the map itself is a million triangles of geometry',
         out.worldTris + out.oreTris > 1000000,
         out.worldTris + ' static world triangles + ' + out.oreTris + ' of live ore crystal = ' +
         (out.worldTris + out.oreTris));
    S.ok('and the view culls it - most chunks never reach the vertex stage',
         out.chunksDrawn > 0 && out.chunksDrawn < out.chunks,
         out.chunksDrawn + ' of ' + out.chunks + ' chunks drawn at the default view');
    S.ok('toggling back leaves 2D exact', out.off && out.roundtrip2d <= 0.001,
         'mode off, 2D round trip drift ' + out.roundtrip2d + 'px');
  }
  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})();
