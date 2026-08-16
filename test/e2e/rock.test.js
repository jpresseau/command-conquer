/* A RIDGE IS BROKEN STONE, NOT A STACK OF CRATES.

   The rock cells were built from _r3Box, and _r3Box is AXIS-ALIGNED. Every face of every slab
   on the map ran parallel to x or z, at four greys a hair apart, with a flat horizontal top -
   so a ridge came out as a demolished city block. Next to a forest of tapered trees and a sea
   with a swell on it, it was the last piece of the map still made of boxes.

   "There is no rotation anywhere in the world batch" was the reason, and it is true of the
   DRAW: the batch is baked to world space and drawn with an identity placement, which is what
   lets it be one buffer per chunk. It says nothing about the GEOMETRY. A yaw baked into the
   vertices costs a sine and a cosine at build time and nothing per frame, and that is the
   whole change.

   THE CLAIM IS ABOUT EDGE DIRECTIONS, and it is measured as one. A ridge of axis-aligned boxes
   has, in world space, only two horizontal edge directions - along x and along z - however
   many boxes it is made of and however they are sized. Turned slabs have as many directions as
   there are slabs. So the spec reads the built geometry rather than the picture: take the
   horizontal edges of the rock chunks, bin them by angle, and count how many bins are
   occupied. Two is the old ridge. Anything like a full spread is the new one.

   THE PALETTE IS GRADED STRUCTURALLY, and that is worth explaining because the obvious test
   does not work. Counting distinct TONES in the picture sounds like the way to catch a ridge
   built from four near-identical greys - and it is not: the shading ramp turns any base colour
   into hundreds of tones across a lit, turned surface. Measured, flattening the palette back to
   two repeated greys scored 2615 tones, exactly what six varied ones score. So the count is of
   the colours going IN.

   AND THE SOLID HAS TO STAY SOLID. Rotating a box by hand is exactly where a face winding goes
   the wrong way and a normal ends up pointing into the rock, which reads as a hole in the
   middle of the slab - lit as though the inside of the stone were facing the sun. Graded by
   asking every emitted face whether its normal points away from the slab it belongs to. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('rock');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 820, height: 640, dpr: 1 });
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

    /* --------- 1. the geometry, straight out of the emitter ---------
       _r3dSlab writes into a face list, so the faces can be read without a renderer at all.
       This builds one cell's worth the way _r3dWorldBuild does and inspects it. */
    var faces = [];
    _r3dSlab(faces, 0, 0, 0, 3, 2, 4, 0.9, 0.6, 0.4, -0.3, '#7c8177', '#969b8f');
    o.slabFaces = faces.length;

    /* every face's normal, and whether it points AWAY from the slab's centre - a winding put
       in backwards lights the inside of the stone */
    var outward = 0, cx = 0, cy = 0, cz = 0, nv = 0;
    for (i = 0; i < faces.length; i++) {
      for (var v = 0; v < faces[i].v.length; v++) {
        cx += faces[i].v[v][0]; cy += faces[i].v[v][1]; cz += faces[i].v[v][2]; nv++;
      }
    }
    cx /= nv; cy /= nv; cz /= nv;
    for (i = 0; i < faces.length; i++) {
      var f = faces[i].v;
      var ax = f[1][0] - f[0][0], ay = f[1][1] - f[0][1], az = f[1][2] - f[0][2];
      var bx = f[2][0] - f[0][0], by = f[2][1] - f[0][1], bz = f[2][2] - f[0][2];
      var nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
      /* from the slab's centre to the face's own centre */
      var fx = 0, fy = 0, fz = 0;
      for (var w = 0; w < f.length; w++) { fx += f[w][0]; fy += f[w][1]; fz += f[w][2]; }
      fx = fx / f.length - cx; fy = fy / f.length - cy; fz = fz / f.length - cz;
      if (nx * fx + ny * fy + nz * fz > 0) outward++;
    }
    o.outwardFaces = outward;

    /* --------- 2. how many directions the ridge's horizontal edges run in ---------
       Rebuilt into a face list for a patch of real rock cells, so this is the map's own
       geometry and not a synthetic slab. */
    var best = null, bs = 0;
    for (var tz = 5; tz < RTS_N - 5; tz++) {
      for (var tx = 5; tx < RTS_N - 5; tx++) {
        var s = 0;
        for (var dz = -3; dz <= 3; dz++) {
          for (var dx = -3; dx <= 3; dx++) {
            if (G.terrain[_rtsIdx(tx + dx, tz + dz)] === RTS_T_ROCK) s++;
          }
        }
        if (s > bs) { bs = s; best = [tx, tz]; }
      }
    }
    o.ridgeAt = best; o.ridgeDensity = bs;
    if (!best) return o;

    /* The angle histogram, read off the real chunk buffers is not possible - they are GPU
       buffers - so this re-runs the same builder over the same cells. 18 bins of 10 degrees,
       folded to 0-180 because an edge has no direction, only an orientation. */
    var bins = {}, edges = 0;
    var rf = [];
    for (var qz = best[1] - 2; qz <= best[1] + 2; qz++) {
      for (var qx = best[0] - 2; qx <= best[0] + 2; qx++) {
        if (G.terrain[_rtsIdx(qx, qz)] !== RTS_T_ROCK) continue;
        _r3dRockCell(rf, qx, qz);        /* the builder's own emitter, not a copy of it */
      }
    }
    for (i = 0; i < rf.length; i++) {
      var vs = rf[i].v;
      for (var e = 0; e < vs.length; e++) {
        var p0 = vs[e], p1 = vs[(e + 1) % vs.length];
        var ex = p1[0] - p0[0], ez = p1[2] - p0[2];
        if (Math.abs(p1[1] - p0[1]) > 0.001) continue;      /* horizontal edges only */
        if (ex * ex + ez * ez < 0.04) continue;
        var deg = Math.atan2(ez, ex) * 180 / Math.PI;
        if (deg < 0) deg += 180;
        if (deg >= 180) deg -= 180;
        bins[Math.floor(deg / 10)] = 1;
        edges++;
      }
    }
    o.edgeBins = Object.keys(bins).length;
    o.edges = edges;
    o.slabsSampled = rf.length;

    /* THE STONE'S OWN PALETTE, counted off the emitted faces. The picture cannot carry this:
       the shading ramp turns any base colour into hundreds of tones across a lit, turned
       surface, so a ridge built from two greys repeated still renders thousands of them and a
       tone count passes whatever the palette is. Measured that mutation directly - four
       near-identical greys scored 2615 tones, the same as six varied ones. What the change
       actually did is to the colours going IN. */
    var cols = {}, clo = 999, chi = -1;
    for (i = 0; i < rf.length; i++) {
      var c = rf[i].c;
      cols[c[0] + ',' + c[1] + ',' + c[2]] = 1;
      var cl = 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
      if (cl < clo) clo = cl;
      if (cl > chi) chi = cl;
    }
    o.baseCols = Object.keys(cols).length;
    o.baseRange = +(chi - clo).toFixed(1);

    /* --------- 3. the picture: a ridge with something inside it --------- */
    R.focus.x = _rtsWX(best[0]); R.focus.z = _rtsWX(best[1]);
    R.zi = RTS_ZOOMS.length - 1; _rtsApplyCam();
    var gl = R3.gl, CW = R3.cv.width, CH = R3.cv.height;
    _rtsRFrame(1 / 60);
    var buf = new Uint8Array(CW * CH * 4);
    gl.readPixels(0, 0, CW, CH, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    /* rock is the grey family: low saturation, mid luminance. Grass and trees are green,
       the ground is brown, so a channel-spread test picks the stone out without a mask. */
    var tones = {}, n = 0, lo = 999, hi = -1;
    for (var p = 0; p < buf.length; p += 4) {
      var r2 = buf[p], g2 = buf[p + 1], b2 = buf[p + 2];
      var mx = Math.max(r2, g2, b2), mn2 = Math.min(r2, g2, b2);
      if (mx < 60 || mx > 240) continue;
      if (mx - mn2 > 18) continue;                          /* saturated: not stone */
      tones[r2 + ',' + g2 + ',' + b2] = 1;
      var L = 0.299 * r2 + 0.587 * g2 + 0.114 * b2;
      if (L < lo) lo = L;
      if (L > hi) hi = L;
      n++;
    }
    o.rockPx = n;
    o.rockTones = Object.keys(tones).length;
    o.rockRange = n ? +(hi - lo).toFixed(1) : 0;
    return o;
  });

  S.ok('the 3D mode is available to check', out.on, out.on ? 'on' : 'no WebGL');
  if (!out.on) {
    S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');
    await g.close(); await browser.close();
    return require('../lib/report.js')(S);
  }

  S.ok('a slab is a closed solid', out.slabFaces === 5,
       out.slabFaces + ' faces - a top and four sides; the underside is never seen and is not ' +
       'emitted');

  /* Rotating a box by hand is exactly where a winding goes in backwards. */
  S.ok('...with every face wound so its normal points out of the stone',
       out.outwardFaces === out.slabFaces,
       out.outwardFaces + ' of ' + out.slabFaces + ' normals point away from the slab centre - ' +
       'one the wrong way lights the inside of the rock and reads as a hole in it');

  S.ok('the map has a ridge to look at', out.ridgeDensity > 15,
       out.ridgeDensity + ' of 49 cells around ' + out.ridgeAt + ' are rock');

  /* THE CLAIM. An axis-aligned slab has two horizontal edge orientations however it is sized,
     so a ridge of them fills two bins; the seven-sided crags standing among them fill a few
     more. Measured with the yaw forced to zero, the whole ridge reaches 8 of 18. */
  S.ok('a ridge runs in every direction, not just along x and z',
       out.edgeBins >= 15,
       out.edgeBins + ' of 18 ten-degree bins carry a horizontal edge, across ' + out.edges +
       ' edges of ' + out.slabsSampled + ' faces - with the slabs axis-aligned the same ridge ' +
       'reaches 8, and those come mostly from the crags rather than the stone');

  /* Structural, because the picture cannot tell: see the note in the measurement. */
  S.ok('a ridge is built from more than one stone',
       out.baseCols >= 8 && out.baseRange > 35,
       out.baseCols + ' distinct base colours across the emitted faces, spanning ' +
       out.baseRange + ' levels of luminance - four near-identical greys render just as many ' +
       'TONES as six varied ones once the ramp has been over them, which is why this counts ' +
       'the colours going in');

  S.ok('...and it is actually on screen to look at', out.rockPx > 20000,
       out.rockPx + ' pixels of stone in the frame, ' + out.rockTones + ' tones');

  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})();
