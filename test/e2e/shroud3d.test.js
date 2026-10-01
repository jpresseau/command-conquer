/* THE FOG OF WAR, AS FOG, in the picture - render3d/shroud3d.js:

     OUT OF SIGHT  an enemy tank on ground you have seen but cannot see now leaves the frame as
                   it was without it - no hull under the dimmed shroud, no shadow; in sight it is
                   drawn
     FADING        leaving sight it dissolves: part drawn a moment later, gone after R3D_FADE_T
     DRIFTING      the shroud's edge is not the old one (R3.shroudOff), the change is on the
                   shroud and not in the clear, and it drifts: a moment on, far more of the
                   picture has moved than with the old shroud, where only the sea moves */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('shroud3d');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 900, height: 700, dpr: 1 });
  await g.start(7, 1);

  var out = await g.page.evaluate(function () {
    var o = {}, R = _rtsR, G = window._rtsG, i;
    rts3dSet(true);
    var R3 = window._R3D;
    o.on = !!(R3 && R3.on);
    if (!o.on) return o;
    if (window._rtsUI) window._rtsUI.dead = true;
    window.RTS_POST_ON = false;
    R3.cloudAmt = 0; R3.swayAmt = 0; R3.surfAmt = 0;
    G.ents.forEach(function (e) { if (e.type === 'unit') e.path = null; });
    var gl = R3.gl, CW = R3.cv.width, CH = R3.cv.height, t = G.t + 1;
    function shot(tt) {
      G.t = tt; G.fx.length = 0; _rtsRFrame(0);
      var b = new Uint8Array(CW * CH * 4);
      gl.readPixels(0, 0, CW, CH, gl.RGBA, gl.UNSIGNED_BYTE, b);
      return b;
    }
    function diff(a, b) { var n = 0; for (var k = 0; k < a.length; k += 4) if (Math.abs(a[k] - b[k]) + Math.abs(a[k + 1] - b[k + 1]) + Math.abs(a[k + 2] - b[k + 2]) > 12) n++; return n; }
    var yd = _rtsHas('player', 'yard');

    /* a patch of ground seen and not in sight, an enemy tank on it - the sweep is kept off it */
    var x = yd.x + 30, z = yd.z + 30, tx = _rtsTX(x), tz = _rtsTX(z);
    function sight(v) {
      for (var dz = -4; dz <= 4; dz++) for (var dx = -4; dx <= 4; dx++) { var k = _rtsIdx(tx + dx, tz + dz); G.mapped[k] = 1; G.vis[k] = v; }
    }
    sight(0);
    R.focus.x = x; R.focus.z = z; R.zi = RTS_ZOOMS.length - 1; _rtsApplyCam();
    var en = _rtsSpawnUnit('enemy', 'tank', x, z);
    var A = shot(t); en.dead = true; var B = shot(t); en.dead = false;
    o.unseen = diff(A, B);
    sight(1);
    var C = shot(t + 3); en.dead = true; var D = shot(t + 3); en.dead = false;
    o.inSight = diff(C, D);
    shot(t + 4);                                         /* whole, in sight */
    sight(0);
    var F1 = shot(t + 4 + R3D_FADE_T * 0.4); en.dead = true; var F0 = shot(t + 4 + R3D_FADE_T * 0.4); en.dead = false;
    o.fading = diff(F1, F0);
    var E1 = shot(t + 4 + R3D_FADE_T * 1.2); en.dead = true; var E0 = shot(t + 4 + R3D_FADE_T * 1.2); en.dead = false;
    o.gone = diff(E1, E0);
    en.dead = true;

    /* THE MIST: deep inside the patch, two cells and more from any edge, the shroud's own
       wandering cannot reach - what changes there against the old shroud is the mist */
    sight(0);
    var M0 = shot(t + 6); R3.shroudOff = true; var M1 = shot(t + 6); R3.shroudOff = false;
    var w0 = _rtsWX(tx - 2) - RTS_TILE / 2, w1 = _rtsWX(tx + 2) + RTS_TILE / 2, v0 = _rtsWX(tz - 2) - RTS_TILE / 2, v1 = _rtsWX(tz + 2) + RTS_TILE / 2, sc3 = CW / R3.cv.clientWidth, mist = 0, cells = 0;
    for (var mz = v0; mz < v1; mz += 0.4) for (var mx = w0; mx < w1; mx += 0.4) {
      var sp3 = _r3dWorldToScreen(mx, _rtsElev(mx, mz), mz), px = Math.round(sp3.x * sc3), py = Math.round(sp3.y * sc3);
      if (px < 0 || py < 0 || px >= CW || py >= CH) continue;
      var q3 = ((CH - 1 - py) * CW + px) * 4; cells++;
      if (Math.abs(M0[q3] - M1[q3]) + Math.abs(M0[q3 + 1] - M1[q3 + 1]) + Math.abs(M0[q3 + 2] - M1[q3 + 2]) > 6) mist++;
    }
    o.mist = [mist, cells];

    /* the edge of sight, east of the yard, as the game left it */
    sight(0);
    var ex = _rtsTX(yd.x);
    while (ex < RTS_N - 1 && G.vis[_rtsIdx(ex, _rtsTX(yd.z))]) ex++;
    R.focus.x = _rtsWX(ex); R.focus.z = yd.z; R.zi = RTS_ZOOMS.length - 3; _rtsApplyCam();
    var N0 = shot(t + 10), N1 = shot(t + 14);
    R3.shroudOff = true; var O0 = shot(t + 10), O1 = shot(t + 14); R3.shroudOff = false;
    o.vsOld = diff(N0, O0); o.drift = diff(N0, N1); o.oldDrift = diff(O0, O1);
    /* the drift is the shroud's alone: the ground program it borrows draws the ore stain too,
       and the frame after a shroud must be the frame after none */
    window.RTS_GROUND_LEGACY = true;                 /* the ground drawn through that program too */
    R3.shroudOff = true; shot(t + 10); R3.shroudOff = false;
    var P1 = shot(t + 10), P2 = shot(t + 10);
    o.stale = diff(P1, P2);
    window.RTS_GROUND_LEGACY = false;
    /* where the change is: on what the old shroud covered, not in the clear */
    var onFog = 0, inClear = 0;
    for (var k = 0; k < N0.length; k += 4) {
      if (Math.abs(N0[k] - O0[k]) + Math.abs(N0[k + 1] - O0[k + 1]) + Math.abs(N0[k + 2] - O0[k + 2]) <= 12) continue;
      /* the old frame's own darkness says where its shroud was */
      if (O0[k] + O0[k + 1] + O0[k + 2] < 200) onFog++; else inClear++;
    }
    o.where = [onFog, inClear];

    gl.getError(); window.RTS_POST_ON = true; shot(t); o.glErr = gl.getError();
    R3.cloudAmt = undefined; R3.swayAmt = undefined; R3.surfAmt = undefined;
    return o;
  });

  S.ok('the 3D mode is available to check', out.on, out.on ? 'on' : 'no WebGL');
  if (!out.on) { await g.close(); await browser.close(); return require('../lib/report.js')(S); }
  S.ok('an enemy tank out of sight is not in the picture - nor its shadow', out.unseen === 0, out.unseen + ' pixels');
  S.ok('...and in sight it is', out.inSight > 300, out.inSight + ' pixels');
  S.ok('leaving sight it dissolves: part drawn a moment later', out.fading > out.inSight * 0.15 && out.fading < out.inSight * 0.85, out.fading + ' of ' + out.inSight + ' pixels');
  S.ok('...gone once R3D_FADE_T is out', out.gone === 0, out.gone + ' pixels');
  S.ok('the half-light of ground seen and not in sight carries a mist', out.mist[0] > out.mist[1] * 0.2, out.mist[0] + ' of ' + out.mist[1] + ' points deep in it differ from the old shroud');
  S.ok('the shroud\'s edge is not the old grid', out.vsOld > 2000, out.vsOld + ' pixels differ from the old shroud');
  S.ok('...the change is on the shroud, not in the clear', out.where[0] > out.where[1] * 3, out.where[0] + ' on it, ' + out.where[1] + ' in the clear');
  /* the sea moves in both; the shroud moves only in the new */
  S.ok('...and it drifts, where the old shroud stood still', out.drift > out.oldDrift + 5000, out.drift + ' pixels move in four seconds, ' + out.oldDrift + ' with the old shroud');
  S.eq('...and only the shroud: the next frame is drawn as if it had not been', out.stale, 0);
  S.eq('no draw is refused', out.glErr, 0);
  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
