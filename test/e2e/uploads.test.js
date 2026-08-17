/* WHAT THE GAME UPLOADS TO THE GPU EVERY FRAME, which is the cost a phone feels first.

   Texture bandwidth is the resource a mobile GPU has least of, and two of the 3D renderer's
   layers - the shroud and the ore bed - are built as a 128x128 canvas and pushed with a full
   texImage2D. Measured on an emulated iPhone 13 before this was gated, both went up on EVERY
   frame: 128 KB a frame, about 7.7 MB a second at 60 fps, nearly all of it byte-identical to
   the frame before. Neither can change more than fifteen times a second - the shroud rides the
   visibility sweep's own clock - and the ore bed changes only when ore is mined or grows.

   WHY THIS IS MEASURED WITH THE SIMULATION FROZEN. The test machine has SwiftShader and renders
   at about two frames a second, so one rendered frame spans nearly half a second of simulated
   time - six visibility sweeps - and the shroud legitimately rebuilds on every frame. Counting
   uploads per frame on this box would therefore report "no change" for a gate that works
   perfectly, which is exactly what the first run of this measurement did. Freezing the sim and
   driving _r3dFrame by hand asks the question the gate actually answers: with nothing changing,
   how many times does it re-upload? On a real phone at 60 fps the same gate turns 60 uploads a
   second into 15.

   EVERY COUNT HAS ITS CONTROL. A cache that never refreshes would score perfectly here and show
   the player a shroud frozen at the start of the match, so each "it stops uploading" assertion
   is paired with one that makes the thing change and requires the upload to happen. */

var { chromium, devices } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('uploads');
var FRAMES = 30;

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { device: devices['iPhone 13'] });

  /* Wrapped before the match builds its context, and attributed by stack rather than by size:
     the two layers are both 128x128 canvases and would otherwise be indistinguishable. */
  await g.page.evaluate(function () {
    window.__up = { fog: 0, ore: 0, other: 0, bytes: 0 };
    var realGet = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind) {
      var ctx = realGet.apply(this, arguments);
      if (ctx && /webgl/i.test(String(kind)) && !ctx.__wrapped) {
        ctx.__wrapped = 1;
        ['texImage2D', 'texSubImage2D'].forEach(function (fn) {
          var real = ctx[fn].bind(ctx);
          ctx[fn] = function () {
            var U = window.__up, st = (new Error()).stack || '';
            if (/_r3dFog/.test(st)) U.fog++;
            else if (/_r3dOreTex/.test(st)) U.ore++;
            else U.other++;
            for (var k = 0; k < arguments.length; k++) {
              var a = arguments[k];
              if (a && a.width && a.height) { U.bytes += a.width * a.height * 4; break; }
            }
            return real.apply(null, arguments);
          };
        });
      }
      return ctx;
    };
  });

  await g.start(7, 20, { mode3d: 'default', freeze: true });

  var out = await g.page.evaluate(function (FRAMES) {
    var G = window._rtsG, o = {};
    function reset() { window.__up = { fog: 0, ore: 0, other: 0, bytes: 0 }; }
    function snap() { return JSON.parse(JSON.stringify(window.__up)); }

    o.is3d = !!(window._R3D && window._R3D.on);
    _r3dFrame(G);                       /* settle whatever is genuinely first-time work */

    /* 1. nothing changes */
    reset();
    for (var i = 0; i < FRAMES; i++) _r3dFrame(G);
    o.still = snap();

    /* 2. the match runs: uploads must track the 15 Hz sweep, not the frame count */
    reset();
    var t0 = G.t;
    for (var k = 0; k < FRAMES; k++) { _rtsTick(1 / 60); _r3dFrame(G); }
    o.running = snap();
    o.simSeconds = +(G.t - t0).toFixed(3);
    o.visHz = RTS_VIS_HZ;

    /* 3. THE CONTROL. Reveal the whole map and the shroud MUST be re-uploaded - a cache that
          never refreshes would have scored perfectly above and shown a frozen shroud. */
    reset();
    _r3dFrame(G);
    var before = snap().fog;
    G.mapped.fill(1); G.visGen = (G.visGen | 0) + 1;
    _r3dFrame(G);
    o.fogAfterReveal = snap().fog - before;

    /* 4. ...and the same for the ore bed, driven by changing the FIELD - not by poking the
          renderer's own bookkeeping, which would only prove the bookkeeping talks to itself. */
    reset();
    _r3dFrame(G);
    var oreBefore = snap().ore;
    G.scrap[70 * RTS_N + 70] = (G.scrap[70 * RTS_N + 70] || 0) + 25;
    _r3dFrame(G);
    o.oreAfterChange = snap().ore - oreBefore;

    /* 5. A NEW MATCH MUST NOT INHERIT THE LAST ONE'S SHROUD, and the collision has to be built
          rather than hoped for. Simply starting a new game does not exercise the guard: a fresh
          G has no visGen, which reads as 0 and cannot match a cached generation in the hundreds,
          so the gate misses for the wrong reason and the assertion passes however the key is
          written - measured, deleting the identity from the key left this green. Two fresh games
          back to back BOTH sit at generation 0, which is the case that actually needs the G. */
    reset();
    _rtsNewGame(11);
    window._rtsG.visGen = 0;
    _r3dFrame(window._rtsG);            /* caches at generation 0 */
    var g1 = snap().fog;
    _rtsNewGame(12);
    window._rtsG.visGen = 0;            /* a different map at the SAME generation */
    _r3dFrame(window._rtsG);
    o.fogOnNewGame = snap().fog - g1;
    return o;
  }, FRAMES);

  S.ok('the 3D renderer is the one under test', out.is3d, out.is3d ? '3D on' : 'NOT IN 3D');

  var expected = Math.round(out.simSeconds * out.visHz);
  S.ok('a still frame uploads no shroud at all',
       out.still.fog === 0 && out.still.ore <= 1,
       FRAMES + ' frames with the simulation frozen: ' + out.still.fog + ' shroud uploads, ' +
       out.still.ore + ' ore uploads, ' + (out.still.bytes / 1024).toFixed(0) + ' KB total — ' +
       'it was ' + FRAMES + ' of each before the gate');
  /* AT MOST the sweep clock, and fewer is better rather than suspicious: the sweep runs at
     15 Hz but usually rediscovers exactly the same cells, and a hash notices that where a
     clock cannot. The floor that keeps this honest is the reveal control below, which requires
     an upload when the shroud really does change. */
  S.ok('...and a running one never uploads more often than the sweep could change it',
       out.running.fog <= expected + 1,
       out.running.fog + ' shroud uploads over ' + FRAMES + ' frames covering ' +
       out.simSeconds + 's of match time — the ' + out.visHz + ' Hz sweep caps it at ' + expected +
       ', and it was ' + FRAMES + ' before the gate');

  S.ok('but the shroud still repaints when it really changes',
       out.fogAfterReveal === 1,
       'revealing the map forced ' + out.fogAfterReveal + ' upload on the very next frame ' +
       '(0 would mean a cache that never refreshes, which would pass everything above)');
  S.ok('...and so does the ore bed', out.oreAfterChange === 1,
       'adding ore to one cell forced ' + out.oreAfterChange + ' upload');
  S.ok('...and a second new match at the same generation does not inherit the first one\'s shroud',
       out.fogOnNewGame >= 1,
       out.fogOnNewGame + ' upload for a different map pinned to the SAME generation as the ' +
       'one cached — 0 means the key is not keyed on the game, which a plain new-game check ' +
       'cannot detect');

  S.ok('no page errors', !g.errors.filter(function (e) { return !/ServiceWorker/.test(e); }).length,
       g.errors.join(' | ') || 'none');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})();
