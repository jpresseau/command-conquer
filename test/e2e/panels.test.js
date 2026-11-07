/* A BUILDING IS BUILT OF PANELS - render3d/panel3d.js.

   Seen from above at a phone's zoom a building's walls and roof were each one flat colour. Now
   its flat walls and roofs are divided into panels in the building's own frame, each a shade
   lighter or darker than the next, with a faint seam between. Read straight off the GL canvas, a
   Research Lab up close by day, with R3.panelAmt = 0 as the before-picture:

     STRUCTURE     the walls change, some panels lighter and some darker, and the building as a
                   whole is no darker or lighter for it: structure, not a cast
     SEAMS         thin lines darker than any panel's own shade
     NOT GLASS     the windows (found as the pixels the night lights) are left alone
     NOT A UNIT    a tank beside it is untouched
     FADES OUT     at the widest zoom, where a panel would be a few pixels, nothing changes */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('panels');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 700, height: 600, dpr: 1 });
  await g.start(7, 1, { freeze: true });

  var out = await g.page.evaluate(function () {
    var o = {}, R = _rtsR, G = window._rtsG, R3 = window._R3D, i;
    o.on = !!(R3 && R3.on);
    if (!o.on) return o;
    for (i = 0; i < RTS_N * RTS_N; i++) { G.mapped[i] = 1; G.vis[i] = 1; } G.visDirty = 1;
    var gl = R3.gl, CW = R3.cv.width, CH = R3.cv.height;
    function shot() {
      _rtsRFrame(1 / 60); _rtsRFrame(1 / 60);
      var b = new Uint8Array(CW * CH * 4);
      gl.readPixels(0, 0, CW, CH, gl.RGBA, gl.UNSIGNED_BYTE, b);
      return b;
    }
    function lum(b, q) { return 0.3 * b[q] + 0.59 * b[q + 1] + 0.11 * b[q + 2]; }
    function moved(A, B, q) { return Math.abs(A[q] - B[q]) + Math.abs(A[q + 1] - B[q + 1]) + Math.abs(A[q + 2] - B[q + 2]) > 6; }
    function pair() {
      R3.panelAmt = undefined; var A = shot();
      R3.panelAmt = 0; var B = shot();
      R3.panelAmt = undefined;
      return [A, B];
    }
    function place(key) {
      var yd = _rtsHas('player', 'yard'), ax = _rtsTX(yd.x), az = _rtsTX(yd.z), r, a;
      for (r = 3; r < 40; r++) for (a = 0; a < 32; a++) {
        var tx = Math.round(ax + Math.cos(a / 32 * 6.283) * r), tz = Math.round(az + Math.sin(a / 32 * 6.283) * r);
        if (_rtsCanPlace('player', key, tx, tz, true)) return _rtsPlaceStruct('player', key, tx, tz, true);
      }
      return null;
    }
    var lab = place('lab');
    if (!lab) return o;
    R.focus.x = lab.x; R.focus.z = lab.z + 2; R.zi = RTS_ZOOMS.length - 1; _rtsApplyCam();
    _r3dCamSet(0.3);

    /* the windows, as the pixels the night lights (render3d/meshfs3d.js) */
    window.RTS_SKY_FORCE = 'night';
    R3.winAmt = undefined; var WA = shot(); R3.winAmt = 0; var WB = shot(); R3.winAmt = undefined;
    var glass = [];
    for (var q = 0; q < WA.length; q += 4) if (moved(WA, WB, q)) glass.push(q);
    o.glass = glass.length;

    /* by day: the panels against none */
    window.RTS_SKY_FORCE = 'day';
    var P = pair(), A = P[0], B = P[1];
    var n = 0, up = 0, down = 0, seam = 0, dsum = 0;
    for (q = 0; q < A.length; q += 4) {
      if (!moved(A, B, q)) continue;
      n++;
      var la = lum(A, q), lb = lum(B, q);
      dsum += la - lb;
      if (la > lb + 2) up++;
      if (la < lb - 2) down++;
      if (lb > 20 && la < lb * 0.9) seam++;          /* past a panel's own shade: a seam */
    }
    o.day = { n: n, up: up, down: down, seam: seam, mean: n ? dsum / n : 0 };
    var onGlass = 0;
    glass.forEach(function (q2) { if (moved(A, B, q2)) onGlass++; });
    o.onGlass = onGlass;

    /* NOT A UNIT: a tank on open ground, nothing built in view */
    var yd = _rtsHas('player', 'yard');
    R.focus.x = yd.x + 6 * RTS_TILE; R.focus.z = yd.z + 7 * RTS_TILE; _rtsApplyCam();
    var noTk = shot();
    var tk = _rtsSpawnUnit('player', 'heavy', R.focus.x, R.focus.z);
    tk.path = null; tk.order = 'hold';
    var withTk = shot(), tkPx = 0;
    for (q = 0; q < withTk.length; q += 4) if (moved(withTk, noTk, q)) tkPx++;
    o.tankPx = tkPx;
    P = pair(); var tkMoved = 0;
    for (q = 0; q < P[0].length; q += 4) if (moved(P[0], P[1], q) && moved(withTk, noTk, q)) tkMoved++;
    o.tank = tkMoved;

    /* FADES OUT: the Lab again, at the widest zoom */
    R.focus.x = lab.x; R.focus.z = lab.z; R.zi = 0; _rtsApplyCam();
    P = pair(); var far = 0;
    for (q = 0; q < P[0].length; q += 4) if (moved(P[0], P[1], q)) far++;
    o.far = far; o.farPx = _rtsZoom() * (R3.scale || 1);
    o.err = gl.getError();
    window.RTS_SKY_FORCE = undefined;
    return o;
  });

  S.ok('the 3D view is on', out.on, '');
  if (out.on && out.day) {
    S.ok('STRUCTURE: the Lab\'s walls and roof change by day', out.day.n > 4000, out.day.n + ' pixels');
    S.ok('...some panels lighter and some darker', out.day.up > out.day.n * 0.15 && out.day.down > out.day.n * 0.15,
         out.day.up + ' lighter, ' + out.day.down + ' darker');
    /* a seam only darkens, so the mean leans dark by a little: a cast would be several times it */
    S.ok('...and the building no darker or lighter for it: structure, not a cast', Math.abs(out.day.mean) < 6,
         'mean change ' + out.day.mean.toFixed(2));
    S.ok('SEAMS: thin lines darker than any panel\'s own shade', out.day.seam > 300, out.day.seam + ' pixels darker by more than a tenth');
    S.ok('(the staging: the Lab\'s windows found, as the night lights them)', out.glass > 3000, out.glass + ' pixels');
    S.ok('NOT GLASS: the windows are left alone', out.onGlass < out.glass * 0.03, out.onGlass + ' of ' + out.glass + ' window pixels moved');
    S.ok('(the staging: a Heavy Tank in view)', out.tankPx > 1500, out.tankPx + ' pixels');
    S.ok('NOT A UNIT: the tank is untouched', out.tank === 0, out.tank + ' pixels');
    S.ok('FADES OUT: at the widest zoom, where a panel is a few pixels, nothing changes', out.far === 0,
         out.far + ' pixels, at ' + out.farPx.toFixed(1) + ' px a world unit');
    S.ok('no GL error', out.err === 0, 'error ' + out.err);
  }
  S.ok('the page logged no errors', !g.errors.length, g.errors.slice(0, 2).join(' | ') || 'clean');
  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
