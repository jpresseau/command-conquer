/* THE TRACER WAS A BEAM.

   Instant weapons in this game are hitscan - `w.speed <= 0` applies the damage on the spot -
   and the effect that sold the shot drew the WHOLE muzzle-to-target line, at 90% opacity, for
   the entire 0.06s life of the effect. At the top zoom that is a hard cream stroke running the
   width of the battlefield, and a machine-gun burst draws several at once: it read as a
   scratch on the screen rather than as gunfire, and it was the loudest wrong thing in any
   frame with a firefight in it.

   There is no projectile to follow, so what the effect has to sell is the ROUND, and a round
   is a short bright dash somewhere along the line. It advances over the effect's life and
   fades as it goes.

   THE SPEC MEASURES THE DRAWN EXTENT, not the code path. A tracer is pushed along a known,
   deliberately long line and the frame is diffed against the same frame without it; the
   changed pixels are exactly what the tracer drew, and their span along the line is the
   length of the mark. A beam spans the whole flight, a round spans a fraction of it - so the
   assertion is on the RATIO, which stays meaningful whatever the dash length is tuned to. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('tracer');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 900, height: 700, dpr: 1 });
  await g.start(7, 1);

  var out = await g.page.evaluate(function () {
    var o = {};
    rtsSetVoxSide('allied');
    _rtsNewGame(4242, 'easy');
    var G = window._rtsG, R = _rtsR, i;
    for (i = 0; i < RTS_N * RTS_N; i++) { G.mapped[i] = 1; G.vis[i] = 1; }
    G.visDirty = 1;
    R.zi = RTS_ZOOMS.length - 1; R.cell = RTS_ZOOMS[R.zi];
    var yard = _rtsHas('player', 'yard');
    R.focus.x = yard.x; R.focus.z = yard.z + 10;

    var cv = document.getElementById('rtsCv'), ctx = cv.getContext('2d');
    function grab() { return ctx.getImageData(0, 0, cv.width, cv.height).data; }

    /* a clean frame with no effects at all */
    G.fx.length = 0;
    _rtsRFrame(1 / 60);
    var bare = grab();

    /* one tracer, across a long stretch of the visible world */
    var ax = R.focus.x - 22, az = R.focus.z - 14;
    var bx = R.focus.x + 22, bz = R.focus.z + 14;
    G.fx.length = 0;
    G.fx.push({ kind: 'tracer', x: ax, y: 1.3, z: az, x2: bx, y2: 1.3, z2: bz, t: 0 });
    _rtsRFrame(1 / 60);
    var shot = grab();

    var sx1 = _rtsSX(ax), sy1 = _rtsSY(az), sx2 = _rtsSX(bx), sy2 = _rtsSY(bz);
    var vx = sx2 - sx1, vy = sy2 - sy1;
    var flight = Math.hypot(vx, vy);
    o.flightPx = Math.round(flight);

    /* the changed pixels ARE the tracer; project them onto the flight line */
    var lo = 1e9, hi = -1e9, changed = 0, W = cv.width;
    for (var p = 0; p < bare.length; p += 4) {
      if (Math.abs(bare[p] - shot[p]) + Math.abs(bare[p + 1] - shot[p + 1]) +
          Math.abs(bare[p + 2] - shot[p + 2]) < 12) continue;
      changed++;
      var q = p >> 2, px = q % W, py = (q / W) | 0;
      var t = ((px - sx1) * vx + (py - sy1) * vy) / (flight * flight);
      if (t < lo) lo = t;
      if (t > hi) hi = t;
    }
    o.changed = changed;
    o.spanFrac = changed ? +(hi - lo).toFixed(3) : -1;
    o.drawnPx = changed ? Math.round((hi - lo) * flight) : 0;

    /* and it fades: the same tracer late in its life must be fainter than at the start */
    function inkAt(age) {
      G.fx.length = 0;
      G.fx.push({ kind: 'tracer', x: ax, y: 1.3, z: az, x2: bx, y2: 1.3, z2: bz, t: age });
      _rtsRFrame(1 / 60);
      var d = grab(), sum = 0;
      for (var pp = 0; pp < d.length; pp += 4) {
        sum += Math.abs(d[pp] - bare[pp]) + Math.abs(d[pp + 1] - bare[pp + 1]) +
               Math.abs(d[pp + 2] - bare[pp + 2]);
      }
      return sum;
    }
    o.inkEarly = inkAt(0.005);
    o.inkLate = inkAt(0.055);
    o.gone = inkAt(0.2);
    return o;
  });

  S.ok('the tracer draws something', out.changed > 20,
       out.changed + ' pixels changed by one tracer over a ' + out.flightPx + 'px flight');
  S.ok('it is a round in flight, not a beam joining shooter to target',
       out.spanFrac > 0 && out.spanFrac < 0.5,
       'the mark spans ' + out.drawnPx + 'px of the ' + out.flightPx + 'px flight (' +
       (out.spanFrac * 100).toFixed(1) + '%) - a full-length beam spans 100%');
  S.ok('...and it fades as it goes', out.inkLate < out.inkEarly * 0.6,
       'ink at 0.005s ' + out.inkEarly + ' -> at 0.055s ' + out.inkLate);
  S.ok('...and is gone when the effect expires', out.gone === 0,
       'ink after the 0.06s life: ' + out.gone);
  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})();
