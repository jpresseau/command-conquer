/* THE SHROUD COVERS THE WHOLE BATTLEFIELD, INCLUDING THE PART THAT IS NOT MAP.

   Reported from a live game as fields of blue speckle across the unexplored black. They were
   unexplored LAKES: the ore-and-water overlay draws every water cell in range without asking
   whether the player has seen it, which is harmless only for as long as something paints over
   it afterwards. Two faults meant nothing did.

   THE VIEW IS WIDER THAN THE WORLD, ROUTINELY. At the widest zoom a 1660px battlefield at 12px
   cells is 138 cells across, against a 128-cell map, so on every desktop window there is a band
   down each side of the screen that is not map at all. Neither shroud path painted it: the
   fallback blits a canvas exactly RTS_N square, and the artwork path stamps per cell, and
   off-map cells do not exist to stamp. Whatever the terrain pass had left there stayed - which
   was the water overlay, drawn for every water cell in range without asking whether the player
   has seen it. Hence unexplored lakes as blue speckle inside a hard straight-edged band.

   THE FIX IS THE OFF-MAP FILL, AND ONLY THAT. The blit alongside it was also rewritten to
   position the whole fog canvas rather than crop it to the screen, and that is a
   simplification rather than a second fix: a source rectangle overrunning its image is well
   defined, and drawImage clips source and destination in the same proportion, so the old crop
   placed the fog correctly. Reverting that line alone leaves the alignment check below at zero
   errors, which is how that was settled rather than assumed.

   AND A NEW MAP DOES NOT INHERIT THE OLD MAP'S VISION. The fog canvas lives on the renderer and
   is rebuilt only when the visibility sweep marks it dirty. A brand new game has revealed
   nothing yet - the sweep runs in the tick, not at creation - so nothing marked it stale and
   the previous match's explored blob sat on screen over unrelated ground. Same shape of hole as
   the terrain bake had, one layer up, and closed in the same place.

   IT MEASURES THE BATTLEFIELD THE PLAYER IS SHOWN. Not the fog canvas, not the arithmetic -
   the pixels, at the zoom and the window where the fault appears. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('shroud');

(async function () {
  var browser = await chromium.launch();
  /* a desktop window, because that is where the view outruns the map */
  var g = await openPage(browser, { width: 1980, height: 1000, dpr: 1 });
  await g.start(7, 1);

  var out = await g.page.evaluate(function () {
    var o = {};
    rtsSetVoxSide('allied');
    _rtsNewGame(4242, 'easy');
    var R = _rtsR, G = window._rtsG;

    R.zi = 0; _rtsApplyCam();                    /* the widest zoom, where the view is widest */
    o.cell = R.cell;
    o.cellsAcross = +(R.W / R.cell).toFixed(1);
    o.mapCells = RTS_N;
    o.viewOutrunsMap = R.W / R.cell > RTS_N;

    var yard = _rtsHas('player', 'yard');
    R.focus.x = yard.x; R.focus.z = yard.z;
    /* FRAME ZERO FIRST, while nothing is revealed. `G.mapped` is uniformly zero here, so the
       whole battlefield must be shroud - and if the fog canvas still holds the previous
       match's vision, a bright blob of it is sitting on screen with nothing to justify it. */
    _rtsRFrame(1 / 60);
    var cv0 = document.getElementById('rtsCv');
    var d0 = cv0.getContext('2d').getImageData(0, 0, cv0.width, cv0.height).data;
    var fresh = 0, freshTot = 0;
    for (var q = 0; q < RTS_N * RTS_N; q++) if (G.mapped[q]) fresh++;
    o.mappedAtFrameZero = fresh;
    var lit = 0;
    for (var pi = 0; pi < d0.length; pi += 4 * 37) {          /* a sparse sweep of the frame */
      freshTot++;
      if (!(d0[pi] <= 12 && d0[pi + 1] <= 14 && d0[pi + 2] <= 18)) lit++;
    }
    o.frameZeroLit = lit; o.frameZeroTot = freshTot;

    /* TICK BEFORE LOOKING FURTHER. The sight sweep runs in the tick, so thirty ticks is the
       base opening its own eyes - which is the state a player is ever actually in. */
    for (var t = 0; t < 30; t++) _rtsTick(1 / 60);
    _rtsRFrame(1 / 60);
    o.mapped = 0;
    for (var mi = 0; mi < RTS_N * RTS_N; mi++) if (G.mapped[mi]) o.mapped++;

    var cv = document.getElementById('rtsCv'), ctx = cv.getContext('2d');
    var d = ctx.getImageData(0, 0, cv.width, cv.height).data;
    function at(x, y) {
      var i = ((y * cv.width) + x) * 4;
      return [d[i], d[i + 1], d[i + 2]];
    }
    /* The unexplored colour, as the shroud writes it. Anything darker than this is impossible;
       anything appreciably lighter is something showing through that should not be. */
    function shrouded(p) { return p[0] <= 12 && p[1] <= 14 && p[2] <= 18; }

    /* --- the margins. A band down each edge of the battlefield, well outside anything the
       player has explored: every pixel of it must be shroud. --- */
    function band(x0, y0, w, h) {
      var bad = 0, tot = 0, tones = {}, worst = null;
      for (var y = y0; y < y0 + h; y += 2) {
        for (var x = x0; x < x0 + w; x += 2) {
          var p = at(x, y); tot++;
          tones[p[0] + ',' + p[1] + ',' + p[2]] = 1;
          if (!shrouded(p)) { bad++; if (!worst) worst = p.join(','); }
        }
      }
      return { tot: tot, bad: bad, share: +(bad / tot).toFixed(4),
               tones: Object.keys(tones).length, worst: worst };
    }
    var W = cv.width, H = cv.height;
    o.left = band(0, 0, 70, H);
    o.right = band(W - 70, 0, 70, H);
    o.top = band(0, 0, W, 60);
    o.bottom = band(0, H - 60, W, 60);

    /* --- ALIGNMENT, which is the half the margins cannot see. Filling off-map black hides a
       missing fog; it does not hide a MISPLACED one, and the source-rect crop produced exactly
       that - the fog was drawn into a sub-rectangle of the battlefield, at the wrong scale, so
       black sat over ground the player had explored and explored ground showed through where
       the map was still dark. Every on-screen cell is classified twice, once from the game
       state and once from the pixel over it, and the two have to agree.

       Only cells whose whole 3x3 neighbourhood shares their state are sampled: the boundary is
       deliberately soft - half a cell of smoothed gradient, matching the 3D mode's fog - so a
       cell on the seam is legitimately neither, and grading it would be grading the blur. --- */
    o.centre = at(Math.round(W / 2), Math.round(H / 2));
    o.centreClear = !shrouded(o.centre);
    function solid(tx, tz, want) {
      for (var dz = -1; dz <= 1; dz++) {
        for (var dx = -1; dx <= 1; dx++) {
          if (!_rtsInB(tx + dx, tz + dz)) return false;
          if (!!G.mapped[_rtsIdx(tx + dx, tz + dz)] !== want) return false;
        }
      }
      return true;
    }
    var seenOK = 0, seenBad = 0, darkOK = 0, darkBad = 0, firstBad = null;
    for (var tz2 = 1; tz2 < RTS_N - 1; tz2++) {
      for (var tx2 = 1; tx2 < RTS_N - 1; tx2++) {
        var want = !!G.mapped[_rtsIdx(tx2, tz2)];
        if (!solid(tx2, tz2, want)) continue;
        var sp = _rtsWorldToScreen(_rtsWX(tx2), 0, _rtsWX(tz2));
        if (sp.x < 4 || sp.x > W - 4 || sp.y < 4 || sp.y > H - 4) continue;
        var dark = shrouded(at(Math.round(sp.x), Math.round(sp.y)));
        if (want) {                                   /* explored: must NOT be shroud */
          if (dark) { seenBad++; if (!firstBad) firstBad = 'explored cell ' + tx2 + ',' + tz2 + ' is black'; }
          else seenOK++;
        } else {                                      /* unexplored: must be shroud */
          if (dark) darkOK++;
          else { darkBad++; if (!firstBad) firstBad = 'unexplored cell ' + tx2 + ',' + tz2 + ' is clear'; }
        }
      }
    }
    o.seenOK = seenOK; o.seenBad = seenBad;
    o.darkOK = darkOK; o.darkBad = darkBad; o.firstBad = firstBad;
    return o;
  });

  S.ok('a new map starts with nothing revealed and nothing lit',
       out.mappedAtFrameZero === 0 && out.frameZeroLit === 0,
       out.mappedAtFrameZero + ' cells mapped and ' + out.frameZeroLit + '/' + out.frameZeroTot +
       ' sampled pixels not shroud on the first frame of a new map - a fog canvas left over ' +
       'from the previous match shows that match\'s vision here (measured at 281 cells)');

  S.ok('the view really is wider than the map at this zoom', out.viewOutrunsMap,
       out.cellsAcross + ' cells across the battlefield at ' + out.cell +
       'px cells, against a ' + out.mapCells + '-cell map');

  ['left', 'right', 'top', 'bottom'].forEach(function (k) {
    var b = out[k];
    S.ok('the ' + k + ' margin is shroud all the way to the edge', b.bad === 0,
         b.bad + '/' + b.tot + ' sampled pixels are not the unexplored colour' +
         (b.worst ? ' (e.g. rgb ' + b.worst + ')' : '') + ', ' + b.tones + ' distinct tones' +
         ' - unexplored water used to speckle these bands because the fog never reached them');
  });

  /* Positioning, which the margins alone cannot catch: a fog blitted at the wrong scale can
     still be black everywhere it lands. */
  S.ok('the explored base under the camera is not shrouded', out.centreClear,
       'centre pixel is rgb ' + out.centre.join(','));
  S.ok('there is enough of both on screen to grade the alignment',
       out.seenOK + out.seenBad > 100 && out.darkOK + out.darkBad > 2000,
       (out.seenOK + out.seenBad) + ' explored and ' + (out.darkOK + out.darkBad) +
       ' unexplored cells sampled, boundary cells excluded');
  S.ok('the fog lands exactly over the cells the player has not seen',
       out.seenBad === 0 && out.darkBad === 0,
       out.seenBad + ' explored cells covered by shroud and ' + out.darkBad +
       ' unexplored cells left clear' + (out.firstBad ? ' (' + out.firstBad + ')' : '') +
       ' - the fog and the terrain under it have to be the same map');

  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})();
