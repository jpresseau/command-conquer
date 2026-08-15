/* THE GAME RENDERS AT THE DEVICE'S OWN RESOLUTION, AND STILL ON WHOLE PIXELS.

   The device pixel ratio was capped at 2 with no comment saying why, and the why turns out to
   be the integer-scaling rule the renderer is built on: art at a fixed density magnified by
   anything but a whole number of pixels resamples, and the picture goes soft. The ladder
   [12, 24, 48] at a dpr of 2 gives 24/48/96 device pixels per cell, which against the
   48-pixel sprite bake is 0.5x, 1x and 2x - every zoom clean. The same ladder at a dpr of 3
   gives 36/72/144: 0.75x, 1.5x and 3x, two of the three fractional. The cap kept the rule by
   throwing the display away.

   And it threw away a lot. A 393x852 iPhone has a 1179x2556 panel; capped at 2 the game drew
   786x1104 and let the browser stretch it 1.5x, so every pixel was blurred before any art was
   involved and 44% of the panel was ever rendered.

   So the ladder moves with the device. This spec is the thing that makes that safe: it asserts
   the scaling rule DIRECTLY, for every zoom the active ladder can produce, on both a dpr-2 and
   a dpr-3 device - rather than trusting a table of numbers in a comment to stay right.

   It also pins the two things that would silently undo it: the backing store must match the
   panel, because a canvas smaller than its CSS box is the blur this removes; and the HUD
   overlay must be at the same device resolution as the battlefield under it, because it had
   its own copy of the old cap and health bars drawn at a different sharpness from the units
   they sit on is the same fault wearing a different hat. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('resolution');

/* A scale is clean if it is a whole number of pixels, or an exact binary fraction - halving and
   quartering drop source pixels on a regular lattice, which is hard and even; 1.5x does not. */
function clean(v) {
  if (v <= 0) return false;
  if (Math.abs(v - Math.round(v)) < 1e-9) return true;
  var inv = 1 / v;
  return Math.abs(inv - Math.round(inv)) < 1e-9 && (Math.round(inv) & (Math.round(inv) - 1)) === 0;
}

(async function () {
  var browser = await chromium.launch();

  async function look(dpr) {
    var g = await openPage(browser, { width: 393, height: 852, dpr: dpr });
    await g.start(7, 1);
    var out = await g.page.evaluate(function () {
      var o = {}, R = _rtsR;
      o.reported = window.devicePixelRatio;
      o.used = R.dpr;
      o.ladder = RTS_ZOOMS.slice();
      var cv = document.getElementById('rtsCv');
      o.cssBox = cv.clientWidth + 'x' + cv.clientHeight;
      o.backing = cv.width + 'x' + cv.height;
      /* the browser stretches the backing store to the CSS box by this much; 1 means none */
      o.upscale = +((cv.clientWidth * window.devicePixelRatio) / cv.width).toFixed(4);
      var hud = document.getElementById('rtsHud');
      o.hudBacking = hud ? hud.width + 'x' + hud.height : null;
      o.hudMatches = !!hud && hud.width === cv.width && hud.height === cv.height;
      o.scales = RTS_ZOOMS.map(function (cell) {
        var dev = cell * R.dpr;
        return { cell: cell, dev: dev,
                 terrain: dev / RTS_TS, sprite: dev / (RTS_TS * RTS_PS) };
      });
      /* frame cost at the most expensive zoom, so the resolution rise is not paid in stutter */
      R.zi = RTS_ZOOMS.length - 1; _rtsApplyCam();
      for (var w = 0; w < 5; w++) _rtsRFrame(1 / 60);
      var t0 = performance.now(), n = 30;
      for (var i = 0; i < n; i++) _rtsRFrame(1 / 60);
      o.msPerFrame = +((performance.now() - t0) / n).toFixed(2);
      return o;
    });
    out.errors = g.errors.slice();
    await g.close();
    return out;
  }

  var two = await look(2);
  var three = await look(3);

  /* --- the device is used, not truncated --- */
  S.eq('a dpr-2 device renders at 2', two.used, 2);
  S.eq('a dpr-3 device renders at 3, not the old cap of 2', three.used, 3);

  [['dpr 2', two], ['dpr 3', three]].forEach(function (pair) {
    var name = pair[0], o = pair[1];
    S.ok('on ' + name + ' the backing store matches the panel', Math.abs(o.upscale - 1) < 0.001,
         'CSS box ' + o.cssBox + ', backing store ' + o.backing + ', browser upscale ' +
         o.upscale + 'x (the cap left a 1.5x stretch on every dpr-3 phone)');

    S.ok('...and the HUD is at the same resolution as the battlefield', o.hudMatches,
         'battlefield ' + o.backing + ' vs HUD ' + o.hudBacking +
         ' - the overlay carried its own copy of the cap');

    /* THE RULE, asserted rather than asserted-about. Every zoom the active ladder offers has
       to land the sprite bake and the terrain bake on whole pixels. */
    o.scales.forEach(function (s) {
      S.ok('on ' + name + ' a ' + s.cell + 'px cell scales the art by whole pixels',
           clean(s.terrain) && clean(s.sprite),
           s.dev + ' device px per cell: terrain x' + (+s.terrain.toFixed(3)) +
           (clean(s.terrain) ? '' : ' FRACTIONAL') + ', sprite x' + (+s.sprite.toFixed(3)) +
           (clean(s.sprite) ? '' : ' FRACTIONAL'));
    });
  });

  /* The shipped ladder must not move for the devices that already had it right. */
  S.eq('the dpr-2 ladder is untouched', two.ladder.join(','), '12,24,48');

  /* THE COST OF THE RESOLUTION IS A RATIO, NOT A CLOCK READING.

     This used to assert dpr-3 under 16.7ms, on the reasoning that a phone has a 16.7ms frame.
     Headless Chromium rasterises on the CPU through SwiftShader and is not a phone, so the
     number measured the HOST, and the host does not hold still: six runs of one unchanged
     build spread 15.55, 16.34, 16.98, 16.31, 18.85, 18.08 - straddling the threshold, one
     failure in three, drifting upward within a single sitting. It had been failing
     intermittently for reasons that had nothing to do with any change under test.

     What the comment always claimed - 2.25x the pixels costs about 2.25x the fill - is scale
     free, and it is the quantity that does hold still. Across those six runs the ratio was
     2.25; across six runs of the build that added the sun's shadow pass, 2.26. So the ratio is
     the assertion, and it fires on anything SUPERLINEAR in resolution: a full-screen pass that
     went per-pixel instead of per-frame, a readback, a per-pixel allocation.

     The clock reading is kept as a backstop against a total collapse, set clear of the
     measured envelope rather than at a phone budget it cannot represent. */
  var fillRatio = +(three.msPerFrame / two.msPerFrame).toFixed(2);
  S.ok('the extra resolution costs about what its extra pixels cost',
       fillRatio < 3.0,
       'dpr 3 costs ' + fillRatio + 'x dpr 2 for 2.25x the pixels (' + three.msPerFrame +
       ' ms against ' + two.msPerFrame + ' ms) - past 3.0 the rise is superlinear in ' +
       'resolution, which is a per-pixel pass where there should be a per-frame one');

  S.ok('...and the frame has not collapsed outright', three.msPerFrame < 25,
       three.msPerFrame + ' ms a frame at dpr 3, top zoom - a backstop, not a phone budget; ' +
       'SwiftShader on this host measures 15.5-18.9 for a build that is fine');

  S.ok('no page errors', !two.errors.length && !three.errors.length,
       two.errors.concat(three.errors).join(' | ') || 'none');

  await browser.close();
  require('../lib/report.js')(S);
})();
