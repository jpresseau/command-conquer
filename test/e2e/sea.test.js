/* THE SEA IS A SURFACE, NOT A PICTURE.

   Every other feature of the map became geometry - forests, ridges, ore crystals, the ore bed -
   and the water stayed paint. render/frame.js drew the 2D wave tiles over the GL buffer and its
   own comment said why: "the GL side has no water surface of its own yet". Next to a tilted,
   perspective world with cast shadows it was the flattest thing on screen, and on a coastal map
   it is a third of the screen.

   It is geometry the vertex shader moves now, and the interesting part is WHY THE SWELL IS
   CARRIED BY THE COLOUR RATHER THAN BY THE LIGHT.

   The first cut leaned on the shading: displace the surface, take the analytic slope as the
   normal, and let lambert and the baker's specular do the rest. Measured, the whole sea came
   back in 79 TONES and read as a slab, and the arithmetic says exactly why. An up-facing
   surface takes very nearly the most this light can give - v works out at 0.96 against a
   ceiling of 1.0 - so the bright half of the wave's swing is clipped off and the dark half
   compresses into a 22% band on a dark colour. The specular is worse: the baker's half-vector
   sits about 45 degrees off vertical, so dot(n,H)^16 on flat water is 0.004, and no plausible
   wave slope brings it up. There is no headroom up there for water to use.

   So the height moves the TONE - dark troughs, bright crests, whitening at the top - which is
   what the 2D wave tiles have always drawn and what the reference artwork does. The moving
   normal is still worth having; it breaks the bands up and glints as the swell travels. The
   spec grades the tone count, because that is the number that separated the two attempts.

   AND THE COAST IS WHERE THE GEOMETRY STOPS. The mesh covers water cells, so its raw boundary
   is a staircase of cell-sized steps over a terrain bake that already has a proper coastline
   drawn on it. A sub-quad sitting against a cell that is not water drops out, so the surface
   stops short and the painted surf is what meets the land. PER SIDE, and that is the whole
   trick: insetting every side of any cell with a land neighbour also opens a gap between two
   ADJACENT shore cells, and a coastline is made of adjacent shore cells - the sea came out
   framed in a dark lattice of the paint underneath. Graded as the share of the open sea that
   the mesh actually covers, which that bug drops.

   IT SUPPRESSES BY R3D_WAVE_AMP. Zero flattens the surface without removing it, so the frames
   differ by the swell and by nothing else - not the draw order, not the mesh, not the coast.

   AND WHERE THE SURFACE IS, IT MARKS RATHER THAN INFERS. "Does this pixel differ from the frame
   without the mesh" sounds equivalent to "is the mesh here" and is not: the painted water under
   the surface is the same dark blue the troughs are, so in a trough the difference falls under
   any sane threshold and the surface reads as absent. Measured that way, cells with water on
   all eight sides came out 85.9% covered by a mesh that covers them entirely. Rebuilding the
   surface in a colour nothing else on the map wears removes the question.

   AND IT ASKS THAT TWICE - ONCE FLAT AND ONCE WITH THE SWELL RUNNING - because the flat
   answer is the easy one, and for a long time it was the only one asked. Flattening the
   surface separates "where the mesh is" from "where it draws", which is what the coverage
   check above wants. It also removes the trough. And the trough was a hole: the sheet sits
   0.10 world units over the ground and heaves 0.90 either way, so every trough dipped below
   the ground plane, lost the depth test to it, and let the painted seabed through. A THIRD of
   the open sea was ground - 65.8% of these very samples, and 72% of the frame over open water
   at the top zoom when it was chased down separately - hard-edged blue-grey blotches lying in
   the dark bands between the crests, on every coastal map, for as long as the surface has
   existed. The spec asserting "the surface covers the open sea" was passing at 100% the whole
   time, because it was looking at a sea with the waves switched off.

   The fix is that the sea lays its DEPTH down over the ground rather than competing with it -
   drawn while the ground is the only thing in the buffer, with the comparison off. Which buys
   one obligation, and the last assertion here is it: with no comparison the triangles land in
   mesh order, so the surface must never occlude itself. It cannot at any slope shallower than
   the line of sight, and both numbers are read from the source rather than re-derived. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('sea');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 800, height: 640, dpr: 1 });
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

    /* the most open water on the map */
    var best = null, bs = 0;
    for (var tz = 6; tz < RTS_N - 6; tz += 2) {
      for (var tx = 6; tx < RTS_N - 6; tx += 2) {
        var s = 0;
        for (var dz = -4; dz <= 4; dz++) {
          for (var dx = -4; dx <= 4; dx++) {
            if (G.terrain[_rtsIdx(tx + dx, tz + dz)] === RTS_T_WATER) s++;
          }
        }
        if (s > bs) { bs = s; best = [tx, tz]; }
      }
    }
    o.seaAt = best; o.seaDensity = bs;
    if (!best) return o;
    R.focus.x = _rtsWX(best[0]); R.focus.z = _rtsWX(best[1]);
    R.zi = RTS_ZOOMS.length - 1; _rtsApplyCam();
    _rtsRFrame(1 / 60);

    o.mesh = !!R3.waterMesh;
    o.waterTris = R3.waterTris || 0;
    o.sub = R3D_WATER_SUB;
    o.amp = R3D_WAVE_AMP;

    var gl = R3.gl, CW = R3.cv.width, CH = R3.cv.height;
    function shot() {
      _rtsRFrame(1 / 60);
      var b = new Uint8Array(CW * CH * 4);
      gl.readPixels(0, 0, CW, CH, gl.RGBA, gl.UNSIGNED_BYTE, b);
      return b;
    }
    var A = shot();

    /* WHERE THE SURFACE IS, MARKED RATHER THAN INFERRED. Asking "does this pixel differ from
       the frame without the mesh" sounds equivalent and is not: the painted water under the
       mesh is the same dark blue the troughs are, so in the troughs the difference falls under
       any sane threshold and the surface reads as absent. Measured that way, cells with water
       on all eight sides came out 85.9% covered by a mesh that covers them entirely.
       Rebuilding the surface in a colour nothing else on the map wears removes the question. */
    var keepCol = RTS_PAL.water[0], keepA = window.R3D_WAVE_AMP;
    RTS_PAL.water[0] = '#ff00ff';
    window.R3D_WAVE_AMP = 0;              /* flat, so where the mesh IS is where it DRAWS */
    _r3dWaterBuild(G);
    var marked = shot();
    /* AND THE SAME MARK WITH THE SWELL RUNNING, which is the sea the player is actually
       looking at. The line above flattens the surface to separate "where the mesh is" from
       "where it draws" - and flattening is precisely what removed the bug this pair now
       measures, so the flat mark can only ever answer the easier question. Magenta survives
       the swell: the tone term scales the colour and the crest term adds a little of each
       channel, so red and blue stay together and green stays far below both. */
    window.R3D_WAVE_AMP = keepA;
    _r3dWaterBuild(G);
    var markedWavy = shot();
    RTS_PAL.water[0] = keepCol;
    _r3dWaterBuild(G);
    function isMark(b, q) {
      return b[q] > 90 && b[q + 2] > 90 && b[q + 1] < b[q] - 40;
    }
    function isMesh(q) { return isMark(marked, q); }
    function isMeshWavy(q) { return isMark(markedWavy, q); }
    /* and the same surface with the swell flattened */
    var keepAmp = window.R3D_WAVE_AMP;
    window.R3D_WAVE_AMP = 0;
    var flat = shot();
    window.R3D_WAVE_AMP = keepAmp;

    var tones = {}, flatTones = {}, n = 0;
    for (var p = 0; p < A.length; p += 4) {
      if (!isMesh(p)) continue;
      tones[A[p] + ',' + A[p + 1] + ',' + A[p + 2]] = 1;
      flatTones[flat[p] + ',' + flat[p + 1] + ',' + flat[p + 2]] = 1;
      n++;
    }
    o.seaPx = n;
    o.seaShare = +(n / (CW * CH) * 100).toFixed(1);
    o.tones = Object.keys(tones).length;
    o.flatTones = Object.keys(flatTones).length;

    /* THE SURFACE COVERS THE OPEN SEA. Take the cells that are water and have water on all
       eight sides - no coast, no inset - project their centres, and ask whether the mesh is
       what is on screen there. The per-side inset bug leaves a lattice of paint through the
       middle of that, so the share drops. */
    var open = 0, covered = 0, coveredWavy = 0;
    function isW(x, z) {
      return x >= 0 && z >= 0 && x < RTS_N && z < RTS_N &&
             G.terrain[z * RTS_N + x] === RTS_T_WATER;
    }
    for (var cz = best[1] - 3; cz <= best[1] + 3; cz++) {
      for (var cx = best[0] - 3; cx <= best[0] + 3; cx++) {
        if (!(isW(cx, cz) && isW(cx - 1, cz) && isW(cx + 1, cz) && isW(cx, cz - 1) &&
              isW(cx, cz + 1) && isW(cx - 1, cz - 1) && isW(cx + 1, cz - 1) &&
              isW(cx - 1, cz + 1) && isW(cx + 1, cz + 1))) continue;
        /* nine samples across the cell, so a lattice of gaps cannot hide between them */
        for (var sy = -1; sy <= 1; sy++) {
          for (var sx = -1; sx <= 1; sx++) {
            var pt = _rtsGroundToScreen(_rtsWX(cx) + sx * RTS_TILE * 0.33,
                                        _rtsWX(cz) + sy * RTS_TILE * 0.33);
            var px = Math.round(pt.x * R.dpr), py = Math.round(pt.y * R.dpr);
            if (px < 0 || py < 0 || px >= CW || py >= CH) continue;
            var q = ((CH - 1 - py) * CW + px) * 4;
            open++;
            if (isMesh(q)) covered++;
            if (isMeshWavy(q)) coveredWavy++;
          }
        }
      }
    }
    o.openSamples = open;
    o.openCovered = open ? +(covered / open * 100).toFixed(1) : 0;
    o.openCoveredWavy = open ? +(coveredWavy / open * 100).toFixed(1) : 0;

    /* THE SLOPE THE DRAW ORDER IS ALLOWED TO ASSUME. Read off the wave table itself rather
       than re-derived here from a copy of the constants - that is what wave3d.js exists for. */
    o.slope = +R3D_WAVE_SLOPE.toFixed(4);
    o.cot = +(Math.cos(R3D_TILT) / Math.sin(R3D_TILT)).toFixed(4);
    o.sightDeg = +(90 - R3D_TILT * 180 / Math.PI).toFixed(0);
    o.peakDrop = +(R3D_WAVE_AMP * R3D_WAVE_PEAK).toFixed(3);
    o.waterY = R3D_WATER_Y;

    /* THE SEAM BETWEEN TWO ADJACENT SHORE CELLS, which is the one place the whole-cell inset
       differs from the per-side one - and a coastline is nothing but a run of those seams. The
       open-sea samples above cannot see it: a cell with water on all eight sides is not a
       shore cell under either rule and is emitted whole by both. */
    var seam = 0, seamCovered = 0;
    function shoreCell(x, z) {
      if (!isW(x, z)) return false;
      return !(isW(x - 1, z) && isW(x + 1, z) && isW(x, z - 1) && isW(x, z + 1) &&
               isW(x - 1, z - 1) && isW(x + 1, z - 1) && isW(x - 1, z + 1) && isW(x + 1, z + 1));
    }
    for (var sz = 1; sz < RTS_N - 1; sz++) {
      for (var sx2 = 1; sx2 < RTS_N - 1; sx2++) {
        if (!shoreCell(sx2, sz)) continue;
        var dirs = [[1, 0], [0, 1]];
        for (var d2 = 0; d2 < 2; d2++) {
          var nx = sx2 + dirs[d2][0], nz = sz + dirs[d2][1];
          if (!shoreCell(nx, nz)) continue;
          /* the midpoint of the edge they share */
          var mxw = (_rtsWX(sx2) + _rtsWX(nx)) / 2, mzw = (_rtsWX(sz) + _rtsWX(nz)) / 2;
          var mp = _rtsGroundToScreen(mxw, mzw);
          var mpx = Math.round(mp.x * R.dpr), mpy = Math.round(mp.y * R.dpr);
          if (mpx < 2 || mpy < 2 || mpx >= CW - 2 || mpy >= CH - 2) continue;
          seam++;
          if (isMesh(((CH - 1 - mpy) * CW + mpx) * 4)) seamCovered++;
        }
      }
    }
    o.seams = seam;
    o.seamCovered = seam ? +(seamCovered / seam * 100).toFixed(1) : 0;

    /* the 2D passes stand aside - checked as a draw count, not as pixels */
    var wave = 0, origDraw = R.g.drawImage;
    R.g.drawImage = function (img) {
      if (R.spr.wave && R.spr.wave.indexOf(img) >= 0) wave++;
      return origDraw.apply(this, arguments);
    };
    _rtsRFrame(1 / 60);
    R.g.drawImage = origDraw;
    o.waveTiles3d = wave;
    rts3dSet(false);
    wave = 0;
    R.g.drawImage = function (img) {
      if (R.spr.wave && R.spr.wave.indexOf(img) >= 0) wave++;
      return origDraw.apply(this, arguments);
    };
    _rtsRFrame(1 / 60);
    R.g.drawImage = origDraw;
    o.waveTiles2d = wave;
    o.off = !(window._R3D && window._R3D.on);
    return o;
  });

  S.ok('the 3D mode is available to check', out.on, out.on ? 'on' : 'no WebGL');
  if (!out.on) {
    S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');
    await g.close(); await browser.close();
    return require('../lib/report.js')(S);
  }
  S.ok('the map has open water to look at', out.seaDensity > 40,
       out.seaDensity + ' of 81 cells around ' + out.seaAt + ' are water');

  S.ok('the sea is geometry', out.mesh && out.waterTris > 5000,
       out.waterTris + ' triangles of surface, ' + out.sub + ' subdivisions a cell - it has to ' +
       'be finer than the waves are short or the swell aliases into a wobble');

  S.ok('...and it is most of what is on screen here', out.seaShare > 30,
       out.seaShare + '% of the frame is the water surface (' + out.seaPx + ' pixels)');

  /* The number that separated the two attempts: shading alone gave 79 tones over the whole
     sea, because an up-facing surface has no headroom left in this light's ramp. */
  S.ok('the swell is in the picture, not just in the geometry',
       out.tones > out.flatTones * 3 && out.tones > 250,
       out.tones + ' distinct tones across the sea against ' + out.flatTones +
       ' with the swell flattened - leaning on the light alone gave 79, because a flat sheet ' +
       'already sits at v=0.96 of a ceiling of 1.0');

  /* The per-side inset. Insetting whole shore cells leaves gaps between adjacent ones.
     Measured on a FLATTENED surface, so this is the mesh's footprint and nothing else. */
  S.ok('the surface covers the open sea', out.openCovered > 97,
       out.openCovered + '% of ' + out.openSamples + ' samples over cells with water on all ' +
       'eight sides are the mesh, with the swell flattened - so this is where the geometry ' +
       'IS, which is a different question from what survives to the screen');

  /* THE SAME QUESTION ASKED OF THE SEA THE PLAYER SEES, which is the one that was wrong. */
  S.ok('...and still covers it once the swell is running',
       out.openCoveredWavy > 97,
       out.openCoveredWavy + '% of the same samples are the mesh with the real swell, against ' +
       out.openCovered + '% flat. It was 65.8%: the surface heaves ' + out.peakDrop +
       ' world units either way about a sheet ' + out.waterY + ' above the ground, so every ' +
       'TROUGH dipped under the ground plane, lost the depth test to it and let the painted ' +
       'seabed through - hard-edged blotches lying in the dark bands between the crests, on ' +
       'every coastal map. The sea lays its depth down over the ground now rather than ' +
       'competing with it');

  /* WHAT THAT FIX COSTS, and the one thing that has to stay true for it. */
  S.ok('...and the swell is too shallow to hide itself from this camera',
       out.slope < out.cot,
       'the steepest the three waves can sum to is ' + out.slope + ', against ' + out.cot +
       ' for a line of sight ' + out.sightDeg + ' degrees above ' +
       'the horizontal - a factor of ' + (out.cot / out.slope).toFixed(2) + ' in hand. The sea ' +
       'draws with the depth comparison off, so its triangles land in mesh order rather than ' +
       'back to front, and a heightfield steeper than the view would sort a far crest over a ' +
       'near trough. Raising R3D_WAVE_AMP or R3D_TILT far enough breaks that, and nothing ' +
       'else in the renderer would say so');

  /* The per-side inset, measured where it is the only thing that differs. */
  S.ok('...and does not break at the seam between two shore cells',
       out.seams > 20 && out.seamCovered > 95,
       out.seamCovered + '% of ' + out.seams + ' shared edges between ADJACENT shore cells are ' +
       'covered - insetting whole cells instead of single sides opens a third of a cell of gap ' +
       'at every one of them, and a coastline is nothing but a run of them');

  S.ok('the 2D wave tiles stand aside in 3D', out.waveTiles3d === 0,
       out.waveTiles3d + ' wave tiles drawn over the GL sea - a flat sheet over a surface ' +
       'with a swell on it hides the swell, which is the mistake the ore tile made');

  S.ok('...and still draw the sea in 2D, which has no other', out.off && out.waveTiles2d > 0,
       out.waveTiles2d + ' wave tiles drawn with the mode off');

  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})();
