/* A VEHICLE GOES UP IN A FIREBALL - render3d/wreckfx3d.js.

   Every unit died in the same quick `pop`, whose billows were gone in 0.19 s: a Heavy Tank's death
   was a grey haze with sparks in it. Now a vehicle that burns where it died - the fire record that
   carries its husk - is given a fireball of its own by the renderer, scaled by the vehicle, and
   nothing in the game's state is touched. Read off the GL canvas, a vehicle killed on open
   ground, the renderer drawing as it would in play, with R3.wreckAmt = 0 as the before-picture:

     THE BLAST      0.15 s after a Heavy Tank dies, a fireball: much of the view changes, brighter
                    and warm
     IT LASTS       at 1 s it is still smoke and glow, where the old pop was gone at 0.4
     AND ENDS       by 2.5 s it is over: the picture is the fire's alone
     BY SIZE        a Buggy's is smaller than a Heavy Tank's
     NOT A SOLDIER  a rifleman's death leaves no husk and so no fireball
     NOT OLD NEWS   a fire first met half a second on - a loaded game, a replay seek - only burns
     NOT STATE      the fire's record carries exactly what the game put on it */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('wreckfx');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 520, height: 480, dpr: 1 });
  await g.start(7, 1, { freeze: true });

  var out = await g.page.evaluate(function () {
    var o = {}, R = _rtsR, G = window._rtsG, R3 = window._R3D, i;
    o.on = !!(R3 && R3.on);
    if (!o.on) return o;
    for (i = 0; i < RTS_N * RTS_N; i++) { G.mapped[i] = 1; G.vis[i] = 1; } G.visDirty = 1;
    window.RTS_SKY_FORCE = 'day';
    var gl = R3.gl, CW = R3.cv.width, CH = R3.cv.height;
    function shot() {
      _rtsRFrame(0); _rtsRFrame(0);
      var b = new Uint8Array(CW * CH * 4);
      gl.readPixels(0, 0, CW, CH, gl.RGBA, gl.UNSIGNED_BYTE, b);
      return b;
    }
    function lum(b, q) { return 0.3 * b[q] + 0.59 * b[q + 1] + 0.11 * b[q + 2]; }
    function pair() {
      R3.wreckAmt = undefined; var A = shot();
      R3.wreckAmt = 0; var B = shot();
      R3.wreckAmt = undefined;
      var n = 0, gain = 0, warm = 0;
      for (var q = 0; q < A.length; q += 4) {
        if (Math.abs(A[q] - B[q]) + Math.abs(A[q + 1] - B[q + 1]) + Math.abs(A[q + 2] - B[q + 2]) > 12) {
          n++; gain += lum(A, q) - lum(B, q); warm += A[q] - A[q + 2];
        }
      }
      return { n: n, gain: n ? gain / n : 0, warm: n ? warm / n : 0 };
    }
    function tick(s) { for (var k = 0; k < Math.round(s * 60); k++) _rtsTick(1 / 60); }
    /* open land, away from the yard */
    var yd = _rtsHas('player', 'yard'), ax = _rtsTX(yd.x), az = _rtsTX(yd.z), spot = null, r, a;
    for (r = 6; r < 50 && !spot; r++) for (a = 0; a < 48 && !spot; a++) {
      var tx = Math.round(ax + Math.cos(a / 48 * 6.283) * r), tz = Math.round(az + Math.sin(a / 48 * 6.283) * r);
      if (_rtsCanPlace('player', 'power', tx, tz, true) && _rtsCanPlace('player', 'power', tx + 2, tz, true)) spot = [tx, tz];
    }
    if (!spot) return o;
    var x = _rtsWX(spot[0]) + 4, z = _rtsWX(spot[1]) + 2;
    R.focus.x = x; R.focus.z = z + 1; R.zi = RTS_ZOOMS.length - 2; _rtsApplyCam();
    /* a death the renderer sees as it happens: one frame drawn on the tick it died, as in play */
    function husk() { for (var k = G.fx.length - 1; k >= 0; k--) if (G.fx[k].husk) return G.fx[k]; return null; }
    /* ...and what its fire's record held before the renderer first met it */
    function die(key, dx) {
      var u = _rtsSpawnUnit('enemy', key, x + dx, z);
      u.order = 'hold'; u.path = null;
      tick(0.1);
      _rtsKill(u); _rtsTick(1 / 60);
      var h = husk(), keys = h ? Object.keys(h).sort().join(',') : '';
      _rtsRFrame(1 / 60);
      return keys;
    }
    function clear() { G.fx.length = 0; tick(0.05); }

    /* THE BLAST, and NOT STATE */
    var keys0 = die('heavy', 0), f = husk();
    tick(0.13);
    o.blast = pair();
    o.keys = [keys0, f ? Object.keys(f).sort().join(',') : ''];
    tick(0.85); o.lasts = pair();
    tick(1.5); o.ends = pair();
    clear();
    /* BY SIZE */
    die('buggy', 0); tick(0.13); o.buggy = pair(); clear();
    die('heavy', 0); tick(0.13); o.heavy = pair(); clear();
    /* NOT A SOLDIER */
    die('rifle', 0); tick(0.13); o.rifle = pair(); clear();
    /* NOT OLD NEWS: killed and burned half a second unwatched, then drawn */
    var u = _rtsSpawnUnit('enemy', 'heavy', x, z); u.order = 'hold'; u.path = null;
    tick(0.1); _rtsKill(u); tick(0.5);
    o.late = pair();
    o.err = gl.getError();
    window.RTS_SKY_FORCE = undefined;
    return o;
  });

  S.ok('the 3D view is on', out.on, '');
  if (out.on && out.blast) {
    S.ok('THE BLAST: 0.15 s after a Heavy Tank dies, a fireball - brighter and warm', out.blast.n > 20000 && out.blast.gain > 30 && out.blast.warm > 40,
         out.blast.n + ' pixels, +' + out.blast.gain.toFixed(1) + ' brighter, red over blue ' + out.blast.warm.toFixed(1));
    S.ok('IT LASTS: at 1 s still smoke and glow, where the pop was gone at 0.4', out.lasts.n > 2000, out.lasts.n + ' pixels');
    S.ok('AND ENDS: by 2.5 s the picture is the fire\'s alone', out.ends.n === 0, out.ends.n + ' pixels');
    S.ok('BY SIZE: a Buggy\'s fireball is smaller than a Heavy Tank\'s', out.buggy.n > 2000 && out.buggy.n < out.heavy.n * 0.9,
         'Buggy ' + out.buggy.n + ', Heavy Tank ' + out.heavy.n + ' pixels');
    S.ok('NOT A SOLDIER: a rifleman leaves no husk, and no fireball', out.rifle.n === 0, out.rifle.n + ' pixels');
    S.ok('NOT OLD NEWS: a fire first met half a second on only burns', out.late.n === 0, out.late.n + ' pixels');
    S.ok('NOT STATE: the fire\'s record carries exactly what the game put on it', out.keys[0] && out.keys[0] === out.keys[1],
         out.keys[1]);
    S.ok('no GL error', out.err === 0, 'error ' + out.err);
  }
  S.ok('the page logged no errors', !g.errors.length, g.errors.slice(0, 2).join(' | ') || 'clean');
  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
