/* THE BATTLEFIELD IS NOT FLAT ANY MORE.

   Red Alert's ground is a plane and its cliffs are drawn rather than modelled. That was the
   right call for a near-top-down 2D game and it is a waste of a camera leaning 49 degrees, so
   the terrain has relief: G.height, a byte a cell, scaled by RTS_ELEV_MAX.

   PASSABILITY DOES NOT READ IT, AND THAT IS THE DESIGN. No cell is blocked by its height, so
   no generated map can be cut in two by ground that was not there before. This spec grades that
   as hard as it grades the relief itself, because "the ground has hills now" would be a very
   expensive way to break a working game - and it is measured by asking the sim the same three
   passability questions with the field flattened underneath it.

   THE REST OF THE SIMULATION DOES read it now: a climb costs speed and costs A*, a ridge takes
   a bite out of what an observer can see, and height is worth a little sight and reach. That
   arrived after this spec and lives in core/relief.js, graded by e2e/highground. The assertion
   below used to be worded as "nothing in the sim reads G.height", which was always a bigger
   claim than the three counts underneath it could support; it now says what it measures.

   IT COSTS NOTHING TO GENERATE because it is READ OFF A FIELD THAT WAS ALREADY THERE. The rock
   ridges are a narrow band either side of a contour of a smooth noise field, and the boundary
   between two levels is exactly a contour - so the height comes from the same field, and the
   wall the generator already built lands on the slope without either pass being told about the
   other. Graded below by asking what fraction of rock cells actually sit on a gradient.

   Which hands the map its RAMPS for free: the ridge only exists where a second mask allows it,
   so plateau edge with a wall is a cliff and plateau edge without one is a slope you can drive
   up. Nothing was written to produce that; it is what not interfering produces.

   AND PICKING IS THE PART THAT IS NOT ABOUT LOOKS. Every click, order, drag and placement goes
   through _rtsGroundAt, which was a closed-form ray/plane intersection against y=0. Over relief
   that lands in the wrong place - measured, up to 5.72 world units out, a cell and a half - so
   it walks the ray against the terrain by fixed point instead. The round trip is graded through
   the pair that are actually inverses of each other; see the note in gl3d.js for why
   _rtsWorldToScreen(x, 0, z) is not the other half of it. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('elevation');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 1000, height: 780, dpr: 1 });
  await g.start(7, 1);

  var out = await g.page.evaluate(function () {
    var o = {}, R = _rtsR, i, tx, tz;
    rtsSetVoxSide('allied');
    _rtsNewGame(4242, 'easy');
    var G = window._rtsG, N = RTS_N;
    for (i = 0; i < N * N; i++) { G.mapped[i] = 1; G.vis[i] = 1; }
    G.visDirty = 1;

    /* ---------- 1. the field itself: plateaus, not rolling hills, and not a staircase ----- */
    var hist = [0, 0, 0, 0, 0], mx = 0;
    for (i = 0; i < N * N; i++) {
      var h = G.height[i];
      if (h > mx) mx = h;
      hist[Math.min(4, Math.floor(h / 51))]++;
    }
    o.max = mx;
    o.flatShare = +((hist[0] + hist[4]) / (N * N) * 100).toFixed(1);
    o.midShare = +((hist[1] + hist[2] + hist[3]) / (N * N) * 100).toFixed(1);
    /* the steepest step between neighbours anywhere - a staircase would show up here */
    var worst = 0;
    for (tz = 0; tz < N; tz++) {
      for (tx = 0; tx < N - 1; tx++) {
        var d = Math.abs(G.height[_rtsIdx(tx, tz)] - G.height[_rtsIdx(tx + 1, tz)]);
        if (d > worst) worst = d;
      }
    }
    o.worstStep = +(worst / 255 * RTS_ELEV_MAX).toFixed(2);
    o.elevMax = RTS_ELEV_MAX;
    /* THE GRADIENT THE BISECTION ACTUALLY DEPENDS ON, sampled the way the renderer samples it.
       This used to be derived from the worst neighbour STEP, which is a proxy that understates
       it by root two: a step is measured along one axis, a gradient combines both, so ground
       falling diagonally is 0.59 across where either axis alone reads 0.42. A bound on the
       wrong number is not a bound - and the number the bisection cares about is this one. */
    var gmax = 0;
    for (tz = 2; tz < N - 2; tz += 2) {
      for (tx = 2; tx < N - 2; tx += 2) {
        var gn2 = _rtsElevNormal(_rtsWX(tx), _rtsWX(tz));
        var gs = Math.hypot(gn2[0], gn2[2]) / gn2[1];
        if (gs > gmax) gmax = gs;
      }
    }
    o.worstSlope = +gmax.toFixed(2);

    /* ---------- 2. the ridges found the same contour ---------- */
    var rock = 0, rockOnSlope = 0;
    for (tz = 1; tz < N - 1; tz++) {
      for (tx = 1; tx < N - 1; tx++) {
        if (G.terrain[_rtsIdx(tx, tz)] !== RTS_T_ROCK) continue;
        rock++;
        var lo = 255, hi = 0;
        for (var a = -1; a <= 1; a++) {
          for (var b = -1; b <= 1; b++) {
            var v = G.height[_rtsIdx(tx + b, tz + a)];
            if (v < lo) lo = v; if (v > hi) hi = v;
          }
        }
        if (hi - lo > 40) rockOnSlope++;
      }
    }
    o.rock = rock;
    o.rockOnSlope = rock ? +(rockOnSlope / rock * 100).toFixed(1) : 0;

    /* ---------- 3. the sea is at sea level, and so are its beaches ---------- */
    var wet = 0, wetHigh = 0;
    for (i = 0; i < N * N; i++) {
      if (G.terrain[i] !== RTS_T_WATER) continue;
      wet++;
      if (G.height[i] > 0) wetHigh++;
    }
    o.water = wet; o.waterAboveSea = wetHigh;

    /* ---------- 4. AND THE SIM IS UNTOUCHED ----------
       The claim is not "relief is cheap", it is "relief is free": nothing in the simulation
       reads the height, so the same seed must produce the same blocked map, the same ore and
       the same reachability it did when the ground was a plane. Graded by flattening the field
       and re-deriving the answers rather than by reading the source, because a spec that
       greps for `height` in core/ proves only that the word is absent. */
    function fingerprint() {
      var blocked = 0, ore = 0, reach = 0;
      for (var q = 0; q < N * N; q++) {
        if (G.blocked[q] === 2) blocked++;
        if (G.scrap[q] > 0) ore++;
      }
      /* Flood the land from beside the player's yard - what the pathfinder can actually get
         to. FROM BESIDE IT, not from it: a structure blocks its own cells, so a flood seeded
         on the yard finds every neighbour blocked and returns 0. It did, and 0 is the same
         with relief as without, so a third of this fingerprint was agreeing about nothing. */
      var yard = _rtsHas('player', 'yard');
      var yx = _rtsTX(yard.x), yz = _rtsTX(yard.z), seed0 = -1;
      for (var rr = 1; rr < 12 && seed0 < 0; rr++) {
        for (var oa = -rr; oa <= rr && seed0 < 0; oa++) {
          for (var ob = -rr; ob <= rr; ob++) {
            var sx = yx + ob, sz = yz + oa;
            if (!_rtsInB(sx, sz) || _rtsBlocked(sx, sz)) continue;
            seed0 = _rtsIdx(sx, sz); break;
          }
        }
      }
      if (seed0 < 0) return 'nostart';
      var seen = new Uint8Array(N * N), st = [seed0];
      seen[seed0] = 1; reach = 1;
      while (st.length) {
        var c = st.pop(), cx = c % N, cz = (c / N) | 0;
        for (var d2 = 0; d2 < 4; d2++) {
          var nx = cx + [1, -1, 0, 0][d2], nz = cz + [0, 0, 1, -1][d2];
          if (!_rtsInB(nx, nz)) continue;
          var ni = _rtsIdx(nx, nz);
          if (seen[ni] || _rtsBlocked(nx, nz)) continue;
          seen[ni] = 1; st.push(ni); reach++;
        }
      }
      return blocked + '/' + ore + '/' + reach;
    }
    o.fpRelief = fingerprint();
    var keepH = G.height;
    G.height = new Uint8Array(N * N);
    o.fpFlat = fingerprint();
    G.height = keepH;

    /* ---------- 5. picking lands on the ground, not on the plane under it ---------- */
    rts3dSet(true);
    var R3 = window._R3D;
    o.on = !!(R3 && R3.on);
    if (!o.on) return o;
    R.zi = RTS_ZOOMS.length - 1; R.focus.x = 0; R.focus.z = 0; _rtsApplyCam();
    _rtsRFrame(0);
    var n = 0, sumH = 0, wTerr = 0, wFlat = 0;
    for (var ax = -8; ax <= 8; ax++) {
      for (var bz = -8; bz <= 8; bz++) {
        var wx = ax * 7, wz = bz * 7, hh = _rtsElev(wx, wz);
        var s = _rtsGroundToScreen(wx, wz);
        if (s.behind) continue;
        n++; sumH += hh;
        var back = _rtsGroundAt(s.x, s.y);
        if (back) wTerr = Math.max(wTerr, Math.hypot(back.x - wx, back.z - wz));
        /* and what the plane inverse this replaced would have said about the same pixel */
        var flat = _r3dPlaneAt(s.x, s.y, 0);
        if (flat) wFlat = Math.max(wFlat, Math.hypot(flat.x - wx, flat.z - wz));
      }
    }
    /* ---------- 6. AND WHAT STANDS ON THE GROUND LEANS WITH IT ----------
       Relief without this is worse than no relief: a hull three units wide on the steepest
       slope under a unit has one side 0.69 world units clear of the ground and the other
       buried, about a third of a tank's height, and 19% of the map's open ground is steep
       enough to show it.

       GRADED BY TAKING THE LEAN OUT AND NOTHING ELSE. R3.leanAmt blends the ground normal back
       toward up, so the terrain, the shadows and the picking all stay exactly where they were
       and the only thing that can move is the model's attitude. Flattening G.height instead
       would move four things at once and a frame that differs for four reasons says nothing
       about any of them.

       AND THE BUILDING IS THE CONTROL. A structure must NOT lean - a tilted factory reads as
       wrong as a floating one - so the same toggle over a frame with only a building in it has
       to change nothing at all. Without that half, "the lean is wired up" and "the lean is
       wired to everything" score the same. */
    var lean = { unit: 0, unitPx: 0, struct: 0, slope: 0 };
    (function () {
      var keepEnts = G.ents;
      /* the steepest ground the camera can actually be put over - not the map's rim, where
         the clamp pulls the focus away and the subject leaves the frame entirely */
      var bx = 0, bz = 0, best = 0;
      for (var tz2 = 24; tz2 < RTS_N - 24; tz2++) {
        for (var tx2 = 24; tx2 < RTS_N - 24; tx2++) {
          if (_rtsBlocked(tx2, tz2)) continue;
          var nn = _rtsElevNormal(_rtsWX(tx2), _rtsWX(tz2));
          var sl = Math.hypot(nn[0], nn[2]) / nn[1];
          if (sl > best) { best = sl; bx = tx2; bz = tz2; }
        }
      }
      lean.slope = +best.toFixed(3);
      var u = null, st = null;
      for (var k = 0; k < keepEnts.length; k++) {
        if (!u && keepEnts[k].type === 'unit' && !keepEnts[k].air) u = keepEnts[k];
        if (!st && keepEnts[k].type === 'struct') st = keepEnts[k];
      }
      if (!u || !st) { G.ents = keepEnts; return; }
      var CW2 = R3.cv.width, CH2 = R3.cv.height;
      function shot2() {
        for (var f = 0; f < 3; f++) _rtsRFrame(0);
        var bb = new Uint8Array(CW2 * CH2 * 4);
        R3.gl.readPixels(0, 0, CW2, CH2, R3.gl.RGBA, R3.gl.UNSIGNED_BYTE, bb);
        return bb;
      }
      function moved(a2, b2) {
        var c = 0;
        for (var q2 = 0; q2 < a2.length; q2 += 4) {
          if (Math.abs(a2[q2] - b2[q2]) + Math.abs(a2[q2 + 1] - b2[q2 + 1]) +
              Math.abs(a2[q2 + 2] - b2[q2 + 2]) > 12) c++;
        }
        return c;
      }
      u.x = _rtsWX(bx); u.z = _rtsWX(bz); u.rot = 0;
      G.ents = [u];
      R.focus.x = u.x; R.focus.z = u.z; _rtsClampFocus();
      G.ents = []; var bare = shot2(); G.ents = [u];
      R3.leanAmt = 1; var on = shot2();
      lean.unitPx = moved(on, bare);
      R3.leanAmt = 0; var off = shot2();
      R3.leanAmt = 1;
      lean.unit = moved(on, off);
      G.ents = [st];
      R.focus.x = st.x; R.focus.z = st.z; _rtsClampFocus();
      R3.leanAmt = 1; var son = shot2();
      R3.leanAmt = 0; var soff = shot2();
      R3.leanAmt = 1;
      lean.struct = moved(son, soff);
      G.ents = keepEnts;
    })();
    o.lean = lean;
    o.leanSpliced = (R3D_MESH_VS.indexOf(R3D_LEAN_GLSL) >= 0 ? 1 : 0) +
                    (R3D_SHADOW_VS.indexOf(R3D_LEAN_GLSL) >= 0 ? 1 : 0);

    o.pickPts = n;
    o.pickMeanH = +(sumH / n).toFixed(2);
    o.pickErr = +wTerr.toFixed(4);
    o.pickErrFlat = +wFlat.toFixed(2);
    o.pickErrCells = +(wFlat / RTS_TILE).toFixed(2);
    return o;
  });

  S.ok('the ground has relief at all', out.max > 200,
       'the height field reaches ' + out.max + ' of 255, which is ' +
       (out.max / 255 * out.elevMax).toFixed(1) + ' world units, over a cell');

  /* Plateaus with slopes between them, which is what a contour of a smooth field gives.
     Rolling hills would put most of the map in the middle bands; a staircase would show in
     the neighbour step. */
  S.ok('...as flat ground at two levels rather than as rolling hills',
       out.flatShare > 80 && out.midShare < 20,
       out.flatShare + '% of cells are at the top or the bottom of the range and only ' +
       out.midShare + '% in between - the levels are flat and it is only the boundary that ' +
       'leans, which is what a smoothstep across a narrow band of a smooth field gives');

  /* AND SHALLOWER THAN THE LINE OF SIGHT, which is not a stylistic bound. _r3dGroundAt finds
     where a pixel meets the ground by bisecting on height, and that has a unique answer only
     while raising the plane slides the intersection away faster than the terrain under it can
     climb: slope x tan(tilt) < 1, with tan(0.855) = 1.15. Steeper than about 0.87 and picking
     has more than one answer and no way to choose. */
  S.ok('...and it is a surface, not a staircase, and shallower than the camera looks',
       out.worstStep > 0 && out.worstStep < out.elevMax * 0.4 && out.worstSlope * 1.15 < 0.8,
       'the steepest step between two neighbouring cells anywhere on the map is ' +
       out.worstStep + ' world units over a 4-unit cell, and the steepest GRADIENT anywhere - ' +
       'read through _rtsElevNormal, which is what the mesh shades by and the units lean by - ' +
       'is ' + out.worstSlope + '. So a unit crossing it walks up rather than jumping, the ' +
       'ground mesh has no vertical face in it to leave a seam, and gradient x tan(tilt) is ' +
       (out.worstSlope * 1.15).toFixed(2) + ', under the 1 that picking needs to have a single ' +
       'answer at all. Bounded on the GRADIENT rather than on the neighbour step, and the two ' +
       'are not the same number: the step is measured along one axis at a time, the gradient ' +
       'combines both, so ground that falls diagonally is root-two steeper than either step ' +
       'suggests - 0.42 per axis is 0.59 across. Bounding on the step would have left a third ' +
       'of the real slope out of the margin that keeps picking single-valued');

  /* The whole reason this was cheap to build. */
  S.ok('the rock ridges sit on the slopes, because both came off one contour',
       out.rock > 100 && out.rockOnSlope > 70,
       out.rockOnSlope + '% of the map\'s ' + out.rock + ' rock cells stand on a gradient. ' +
       'Neither pass knows about the other: the ridges are a band around where a noise field ' +
       'crosses 0.5 and the height is a smoothstep across the same crossing, so a wall lands ' +
       'on a plateau edge by arithmetic rather than by placement. The rest are ridges near ' +
       'water, where the height is pinned to sea level');

  S.ok('the sea is at sea level', out.water > 200 && out.waterAboveSea === 0,
       'none of the ' + out.water + ' water cells is above zero - a shoreline that climbed ' +
       'away from the water would leave the surface standing over its own coast');

  /* THE ONE THAT MATTERS MOST. */
  S.ok('and no cell is blocked by how high it is',
       out.fpRelief === out.fpFlat,
       out.fpRelief === out.fpFlat
         ? 'blocked cells / ore cells / cells reachable from the player yard come to ' +
           out.fpRelief + ' with the relief and ' + out.fpFlat + ' with the field flattened ' +
           'under it - identical, because passability never consults G.height. That is what ' +
           'stops relief cutting a generated map in two. What the height DOES reach - speed, ' +
           'route cost, sight - is graded in e2e/highground'
         : 'the sim answers differently with relief (' + out.fpRelief + ') than without (' +
           out.fpFlat + ') - height has leaked into PASSABILITY, and a map can now be cut in ' +
           'two by ground that used to be crossable');

  if (out.on) {
    S.ok('the camera can see enough relief to be worth picking over', out.pickMeanH > 0.5,
         'the ' + out.pickPts + ' sample points average ' + out.pickMeanH + ' world units up');

    /* THE PART THAT IS NOT ABOUT LOOKS. */
    S.ok('a click lands where the ground is, not where the plane was',
         out.pickErr < 0.01 && out.pickErrFlat > 2,
         'screen and back is out by ' + out.pickErr + ' world units at worst; the closed-form ' +
         'plane inverse this replaced is out by ' + out.pickErrFlat + ' - ' + out.pickErrCells +
         ' cells - over the same points. Every selection, move order, drag-pan and building ' +
         'placement goes through that inverse, so on high ground all of them were landing a ' +
         'cell and a half from where the player pointed');
  }

  if (out.on && out.lean) {
    S.ok('a unit standing on a slope leans with the ground',
         out.lean.unitPx > 60 && out.lean.unit > out.lean.unitPx * 0.5,
         'on ground sloping ' + out.lean.slope + ', taking the lean out and changing nothing ' +
         'else moves ' + out.lean.unit + ' of the unit\'s ' + out.lean.unitPx + ' pixels. ' +
         'Upright on that slope a three-unit hull has one side 0.69 world units off the ground ' +
         'and the other buried - a third of a tank\'s height - and 19% of the map\'s open ' +
         'ground is steep enough to show it');

    /* THE CONTROL. Without it, "wired up" and "wired to everything" score the same. */
    S.ok('...and a building does not',
         out.lean.struct === 0,
         out.lean.struct === 0
           ? 'the same toggle over a frame with only a building in it moves nothing - a tilted '
             + 'factory reads as wrong as a floating one, so structures stay square to the world'
           : out.lean.struct + ' pixels of a building move when the lean is taken out');

    S.ok('...and the sun\'s pass leans it the same way',
         out.leanSpliced === 2,
         out.leanSpliced === 2
           ? 'both programs splice the one _lean, so a shadow cannot stand up while its caster '
             + 'leans over'
           : 'only ' + out.leanSpliced + ' of the two programs carries the lean - the other '
             + 'draws the unit somewhere else, and the shadow detaches from what casts it');
  }

  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})();
