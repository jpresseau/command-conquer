/* THE RADAR BLIP, THE DROP SHADOW, AND THE ENDGAME HUNT - three places where code that
   looked right was quietly working on the wrong geometry.

   THE RADAR SAMPLED A QUARTER OF EACH BUILDING. CONQUER.CPP's Get_Radar_Icon builds a blip by
   DOWNSAMPLING THE REAL SHAPE, which is why structures are recognisable on the original's
   radar instead of being coloured blocks. The port stepped by `RTS_TS / Z` - art pixels per
   sample - but the sprite it reads is baked at RTS_TS * RTS_PS per cell, so it crossed only
   1/RTS_PS of the footprint and stopped. Measured end to end, the bottom-right pixel of every
   blip came from 47% of the way across the building: each one was the TOP-LEFT QUADRANT
   stretched over the whole footprint, which is the exact failure downsampling-the-real-shape
   exists to avoid.

   AND ITS NINE-TAP KERNEL WAS THREE TAPS. OFFY was a byte-for-byte copy of OFFX, so the nine
   (dx,dy) pairs collapsed to three distinct offsets - (0,0), (-1,-1), (1,1) - every one on the
   main diagonal. A kernel whose entire job is to catch a thin feature falling between samples
   cannot catch an axis-aligned one if it only ever looks along a diagonal.

   MEASURED THROUGH THE REAL FUNCTION, NOT A COPY OF ITS ARITHMETIC. Re-deriving the sampling
   expressions here and checking they look right would pass with the fix reverted, because the
   spec would be grading its own formula. Instead a synthetic sprite is swapped in - a ramp
   that encodes position in its colour - and the blip is read back: the icon's corner pixel
   DECODES to the fraction of the building the shipped sampler actually reached.

   The kernel gets the same treatment with a lattice of isolated 1px dots, spaced 7 apart so
   they are coprime with both the 8px stride the broken sampler used and the 16px stride the
   fixed one uses, and therefore land at every offset from a sample point rather than a
   favoured one. Of 81 blip pixels: 3 survived with both faults, 9 with the stride fixed and
   the kernel still diagonal, 25 with both fixed.

   THE DROP SHADOW WAS CUT OFF SQUARE. Softening it was only half the job - the result was
   still composed into a canvas the size of the silhouette while being drawn down and to the
   right, so everything past the edge was discarded along a perfectly straight line. Measured on
   the shade alone, every structure carried 75-80 of 255 on its outermost row and column: not a
   tail, the shadow at full strength, ending at a boundary. A blurred rim on three sides and a
   guillotine cut on the other two is worse than the honest hard shadow it replaced.

   MEASURED ON THE SHADE, NOT THE COMPOSITE, because _sprShadow draws the silhouette back on
   top and a building whose artwork reaches the canvas edge - the refinery does - reports 255
   there whatever the shade is doing. The first version of this graded that and was reading the
   building. Only pixels the source silhouette leaves transparent are counted now.

   The canvas is NOT allowed to grow to fix that, which is how this was first written and what
   the suite rejected: a building sprite is exactly its footprint wide, e2e/r3d asserts it for
   all 26 structures, e2e/cameo asserts the placement ghost against it, and the real Red Alert
   artwork satisfies the same contract. So the shadow is ramped to nothing across its last
   `dx + r` pixels instead. It still ends inside the footprint - it just stops being cut.

   THE ENDGAME HUNT WALKED AWAY FROM THE FIGHT. Do_All_To_Hunt spreads the army 3x3 around the
   target so it arrives on a frontage. The z term read `((i / 3) | 0 % 3)`, and `%` binds
   tighter than `|`, so it parsed as `(i / 3) | (0 % 3)` - the `% 3` evaluated separately, to
   zero, and OR-ed in where it changed nothing. The offset grew with the entity index instead
   of cycling -5/0/+5, so the tail of the list was sent a hundred world units south of the
   player's base. It is graded on the orders that come out of the real function. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('radar');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 900, height: 650, dpr: 1 });
  await g.start(7, 1);

  var out = await g.page.evaluate(function () {
    var o = {};
    rtsSetVoxSide('allied');
    _rtsNewGame(4242, 'easy');
    var SP = _rtsSprites();

    /* Swap a synthetic canvas in as a building's sprite, build its blip, put the real one
       back. The icon cache is keyed by type, so it is cleared on both sides of the swap. */
    function withFake(key, paint, fn) {
      var slot = SP.bld.player, real = slot[key];
      var def = rtsStructDef(key), PS = real.c.ps || 1;
      var t = _sprMake(real.c.width, real.c.height);
      paint(t.g, real.head, def, PS);
      t.c.ps = PS;
      slot[key] = { c: t.c, head: real.head };
      window._RTS_RICON = null;
      var r = fn(def, PS);
      slot[key] = real;
      window._RTS_RICON = null;
      return r;
    }

    /* --- 1. how far across the footprint does the sampler reach? --- */
    o.reach = [];
    ['yard', 'refinery', 'power', 'barracks'].forEach(function (key) {
      o.reach.push(withFake(key, function (g2, head, def, PS) {
        /* an opaque ramp over the FOOTPRINT: red encodes x, green encodes y, so a sampled
           pixel reports where in the building it was taken from */
        var fw = def.w * RTS_TS * PS, fh = def.h * RTS_TS * PS;
        for (var y = 0; y < fh; y++) {
          for (var x = 0; x < fw; x++) {
            g2.fillStyle = 'rgb(' + Math.round(x / (fw - 1) * 250) + ',' +
                                    Math.round(y / (fh - 1) * 250) + ',0)';
            g2.fillRect(x, head + y, 1, 1);
          }
        }
      }, function () {
        var ic = _rtsRadarIcon(key, 'player');
        var d = ic.getContext('2d').getImageData(0, 0, ic.width, ic.height).data;
        var last = ((ic.height - 1) * ic.width + (ic.width - 1)) * 4;
        return { key: key, x: +(d[last] / 250).toFixed(3), y: +(d[last + 1] / 250).toFixed(3) };
      }));
    });

    /* --- 2. the kernel, on isolated dots that fall between samples --- */
    o.dots = withFake('yard', function (g2, head, def, PS) {
      var fw = def.w * RTS_TS * PS, fh = def.h * RTS_TS * PS;
      g2.fillStyle = '#ff0000';
      for (var y = 1; y < fh; y += 7) for (var x = 1; x < fw; x += 7) g2.fillRect(x, head + y, 1, 1);
    }, function () {
      var ic = _rtsRadarIcon('yard', 'player');
      var d = ic.getContext('2d').getImageData(0, 0, ic.width, ic.height).data;
      var hit = 0;
      for (var p = 0; p < d.length; p += 4) if (d[p + 3] > 0) hit++;
      return { hit: hit, tot: ic.width * ic.height, share: +(hit / (ic.width * ic.height)).toFixed(3) };
    });

    /* --- 3. the shadow fits the canvas it is composed into --- */
    o.shadows = [];
    ['yard', 'refinery', 'power', 'barracks'].forEach(function (key) {
      var def = rtsStructDef(key);
      var m = _sprBuildingModel(key, 'player');
      var r = _r3BakeFootprint(RTS_PS === 1 ? m : _r3Scale(m, RTS_PS),
                               def.w * RTS_TS * RTS_PS, def.h * RTS_TS * RTS_PS);
      _sprEdge(r.c);
      var src = r.c.getContext('2d').getImageData(0, 0, r.c.width, r.c.height).data;
      var sc = _sprShadow(r.c, 3 * RTS_PS, 3 * RTS_PS);
      var d = sc.getContext('2d').getImageData(0, 0, sc.width, sc.height).data;
      /* SHADOW ONLY, not the composite. _sprShadow draws the silhouette back on top, so a
         building whose own artwork reaches the canvas edge - the refinery does - reports 255
         there whatever the shade is doing, and grading that measures the building. Counting
         only the pixels where the SOURCE is transparent leaves exactly the shade behind, which
         is the thing that must not end in a straight line. */
      var edge = 0, edgeN = 0;
      for (var y = 0; y < sc.height; y++) {
        for (var x = 0; x < sc.width; x++) {
          if (x !== sc.width - 1 && y !== sc.height - 1) continue;
          if (src[(y * r.c.width + x) * 4 + 3] >= 8) continue;    /* the building itself */
          edgeN++;
          var a = d[(y * sc.width + x) * 4 + 3];
          if (a > edge) edge = a;
        }
      }
      o.shadows.push({ key: key, edge: edge, edgeN: edgeN,
                       sameSize: sc.width === r.c.width && sc.height === r.c.height });
    });

    /* --- 4. the endgame hunt converges on the target --- */
    var G = window._rtsG;
    var aim = _rtsHas('player', 'yard');
    o.haveAim = !!aim;
    if (aim) {
      /* enough hunters that a per-index offset has room to run away */
      var made = 0;
      for (var s = 0; s < 24 && made < 20; s++) {
        var sp = _rtsNearestOpen(aim.tx - 30 + (s % 6) * 2, aim.tz - 26 + ((s / 6) | 0) * 2, 14, null);
        if (sp && _rtsSpawnUnit('enemy', 'tank', _rtsWX(sp[0]), _rtsWX(sp[1]))) made++;
      }
      o.hunters = made;
      _rtsAIAllToHunt();
      var maxdx = 0, maxdz = 0, ordered = 0;
      for (var i = 0; i < G.ents.length; i++) {
        var u = G.ents[i];
        if (u.dead || u.side !== 'enemy' || u.type !== 'unit' || !u.goal) continue;
        if (rtsUnitDef(u.def).harvest) continue;
        ordered++;
        maxdx = Math.max(maxdx, Math.abs(u.goal.x - aim.x));
        maxdz = Math.max(maxdz, Math.abs(u.goal.z - aim.z));
      }
      o.ordered = ordered;
      o.maxdx = +maxdx.toFixed(1);
      o.maxdz = +maxdz.toFixed(1);
    }
    return o;
  });

  /* 0.47 before, on every structure. The residual below 1.0 is the half-sample inset at the
     far edge, which is what correct centre-of-cell sampling produces. */
  out.reach.forEach(function (r) {
    S.ok('the ' + r.key + ' blip is sampled from the whole building', r.x > 0.85 && r.y > 0.85,
         'the corner blip pixel came from ' + (r.x * 100).toFixed(1) + '% across and ' +
         (r.y * 100).toFixed(1) + '% down the footprint (47% before: the top-left quadrant ' +
         'stretched over the whole blip)');
  });

  /* 3/81 with both faults, 9/81 with only the kernel still diagonal, 25/81 with both fixed -
     so a threshold of 20% discriminates against either one being reverted alone. */
  S.ok('the kernel catches features that fall between samples', out.dots.share > 0.20,
       out.dots.hit + '/' + out.dots.tot + ' blip pixels found a dot on a 7px lattice ' +
       '(3/81 with the art-pixel stride and the diagonal-only kernel, 9/81 with the stride ' +
       'fixed alone)');

  out.shadows.forEach(function (s) {
    S.ok('the ' + s.key + '\'s shadow fades out before the canvas does',
         s.edge <= 16 && s.sameSize,
         'max shade alpha on the outermost row/column is ' + s.edge + ' of 255 over ' +
         s.edgeN + ' pixels the building itself does not occupy' +
         (s.sameSize ? '' : ', and the canvas is no longer footprint-sized') +
         ' (75-80 there before, which is the shade at full strength cut dead at the boundary)');
  });

  S.ok('the map offers a target for the hunt', out.haveAim && out.hunters > 0,
       out.haveAim ? out.hunters + ' hunters spawned' : 'no player yard');
  if (out.haveAim) {
    /* The spread is 3x3 at 5 world units, so nothing may be sent further than 5 from the aim
       in either axis. Unbounded, the z term reached the entity index times 5. */
    S.ok('every hunter is sent to the target, not past it',
         out.ordered > 0 && out.maxdx <= 5.01 && out.maxdz <= 5.01,
         out.ordered + ' units ordered, furthest goal ' + out.maxdx + ' in x and ' +
         out.maxdz + ' in z from the target (the 3x3 spread is 5 in each axis; the z term ' +
         'was unbounded and grew with the entity index)');
  }

  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})();
