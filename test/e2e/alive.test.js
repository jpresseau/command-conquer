/* A BASE THAT IS RUNNING - render3d/alive3d.js.

   A power plant, a radar station and a tech centre put down beside the yard, and the frames
   taken R3.aliveAmt 0 against 1:

     THE RADAR TURNS   an antenna stands on the dome, and half a second on it has turned
     CHIMNEYS SMOKE    a plume rises off the power plant's stacks
     BEACONS BLINK     a red light on the dome when its beat is on, none when it is off
     RUINS STAND       a destroyed plant slumps into a charred heap that outlasts the rules'
                       wreck time, and is gone when its own time is up; a SOLD one leaves none */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('alive');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 900, height: 760, dpr: 1 });
  await g.start(7, 1);

  var out = await g.page.evaluate(function () {
    var o = {}, R = _rtsR, G = window._rtsG, i;
    for (i = 0; i < RTS_N * RTS_N; i++) { G.mapped[i] = 1; G.vis[i] = 1; }
    G.visDirty = 1;
    var R3 = window._R3D;
    o.on = !!(R3 && R3.on);
    if (!o.on) return o;
    window.RTS_POST_ON = false;
    R3.cloudAmt = 0; R3.swayAmt = 0; R3.surfAmt = 0;
    G.fx.length = 0;
    var yd = _rtsHas('player', 'yard'), placed = {};
    ['power', 'radar', 'lab'].forEach(function (k) {
      for (var r = 3; r < 18 && !placed[k]; r++) for (var ox = -r; ox <= r && !placed[k]; ox++) for (var oz = -r; oz <= r && !placed[k]; oz++) {
        if (Math.max(Math.abs(ox), Math.abs(oz)) !== r) continue;
        if (_rtsCanPlace('player', k, yd.tx + ox, yd.tz + oz, true)) placed[k] = _rtsPlaceStruct('player', k, yd.tx + ox, yd.tz + oz, true);
      }
    });
    G.ents.forEach(function (e) { if (e.type === 'struct') { e.building = 0; e.bprog = 1; } });
    o.placed = !!(placed.power && placed.radar);
    if (!o.placed) return o;
    var gl = R3.gl, CW = R3.cv.width, CH = R3.cv.height, A2W = RTS_TILE / RTS_TS, t0 = Math.floor(G.t) + 10;
    function shot(amt, t) {
      R3.aliveAmt = amt; G.t = t; _rtsRFrame(0);
      var b = new Uint8Array(CW * CH * 4);
      gl.readPixels(0, 0, CW, CH, gl.RGBA, gl.UNSIGNED_BYTE, b);
      return b;
    }
    /* pixels that differ within `rad` screen pixels of a model point on a building */
    function near(e, mp, rad, P, Q, cond) {
      var s = _rtsWorldToScreen(e.x + mp[0] * A2W, _rtsElev(e.x, e.z) + mp[1] * A2W, e.z + mp[2] * A2W);
      var cx = s.x * R.dpr, cy = s.y * R.dpr, n = 0, red = 0;
      for (var y = Math.max(0, Math.round(cy - rad)); y < Math.min(CH, cy + rad); y++)
        for (var x = Math.max(0, Math.round(cx - rad)); x < Math.min(CW, cx + rad); x++) {
          var q = ((CH - 1 - y) * CW + x) * 4;
          if (Math.abs(P[q] - Q[q]) + Math.abs(P[q + 1] - Q[q + 1]) + Math.abs(P[q + 2] - Q[q + 2]) <= 15) continue;
          n++;
          if (Q[q] > Q[q + 1] + 40 && Q[q] > Q[q + 2] + 40) red++;
        }
      return cond === 'red' ? red : n;
    }
    var rd = placed.radar, sp = _r3dAliveSpots('radar'), pw = placed.power, pp = _r3dAliveSpots('power');
    R.focus.x = rd.x; R.focus.z = rd.z + 4; R.zi = RTS_ZOOMS.length - 2; _rtsApplyCam();

    /* THE RADAR, with the effects' quads out so the smoke and the beacons are not in it */
    var draw = window._r3dFxDraw;
    window._r3dFxDraw = function () { return 0; };
    var N0 = shot(0, t0), N1 = shot(1, t0), N2 = shot(1, t0 + 0.5), M2 = shot(0, t0 + 0.5);
    o.antenna = near(rd, sp.spin, 45, N0, N1);
    o.turned = near(rd, sp.spin, 45, N1, N2);
    o.stillOff = near(rd, sp.spin, 45, N0, M2);
    window._r3dFxDraw = draw;

    /* THE BEACON: its beat is on for the first fifth of every 1.4 seconds */
    var seed = _r3dFxH(rd.id, 7.7), on = Math.ceil(t0 / 1.4 + 1) * 1.4 - seed * 1.4 + 0.03;
    var B0 = shot(0, on), B1 = shot(1, on), B2 = shot(1, on + 0.7), B3 = shot(0, on + 0.7);
    o.beaconOn = near(rd, sp.beacon[0], 8, B0, B1, 'red');
    o.beaconOff = near(rd, sp.beacon[0], 8, B3, B2, 'red');

    /* THE SMOKE off the power plant's stacks, above the caps */
    R.focus.x = pw.x; R.focus.z = pw.z + 4; _rtsApplyCam();
    var P0 = shot(0, t0), P1 = shot(1, t0);
    o.smoke = near(pw, [pp.smoke[0][0], pp.smoke[0][1] + 12, pp.smoke[0][2]], 30, P0, P1);

    /* THE RUIN */
    function tall(amt) {
      /* how far up the screen the plant's pixels reach, against bare ground where it stood */
      var A = shot(0, G.t), B = shot(amt, G.t), top = CH;
      for (var y = 0; y < CH; y++) for (var x = 0; x < CW; x++) {
        var q = ((CH - 1 - y) * CW + x) * 4;
        if (Math.abs(A[q] - B[q]) + Math.abs(A[q + 1] - B[q + 1]) + Math.abs(A[q + 2] - B[q + 2]) > 30 && y < top) top = y;
      }
      return top;
    }
    G.t = t0;
    var standing = _rtsWorldToScreen(pw.x, _rtsElev(pw.x, pw.z) + 41 * A2W, pw.z).y * R.dpr;
    /* frames drawn as the game runs, as they are in play: the renderer learns what died by
       seeing it dead through its wreck time */
    _rtsKill(pw);
    for (var k = 0; k < 100 && G.ents.indexOf(pw) >= 0; k++) { _rtsTick(0.05); if (k % 4 === 0) _rtsRFrame(0); }
    for (k = 0; k < 40; k++) _rtsTick(0.05);
    o.reaped = G.ents.indexOf(pw) < 0;
    G.fx.length = 0;
    _rtsRFrame(0);
    o.ruins = R3.rubbleN;
    var s0 = shot(0, G.t), s1 = shot(1, G.t), dark = 0, n = 0;
    var c = _rtsWorldToScreen(pw.x, _rtsElev(pw.x, pw.z) + 3 * A2W, pw.z), cx = c.x * R.dpr, cy = c.y * R.dpr;
    for (var y = Math.round(cy - 30); y < cy + 30; y++) for (var x = Math.round(cx - 40); x < cx + 40; x++) {
      var q = ((CH - 1 - y) * CW + x) * 4, l0 = s0[q] + s0[q + 1] + s0[q + 2], l1 = s1[q] + s1[q + 1] + s1[q + 2];
      if (Math.abs(l0 - l1) > 30) { n++; if (l1 < l0) dark++; }
    }
    o.ruinPx = n; o.ruinDark = dark;
    o.ruinTop = Math.round(tall(1)); o.standingTop = Math.round(standing);
    for (k = 0; k < (R3D_RUBBLE_LIFE + 2) * 20; k++) _rtsTick(0.05);
    _rtsRFrame(0);
    o.ruinsLater = R3.rubbleN;
    /* sold, not destroyed */
    var lab = placed.lab;
    /* a frame drawn while the sold building is still in the list, dead, so the renderer has
       had its chance to take it for a ruin */
    if (lab) { lab.selling = true; _rtsKill(lab); o.soldSeen = lab.dead && G.ents.indexOf(lab) >= 0; _rtsRFrame(0); }
    o.soldRuins = R3.rubbleN;

    gl.getError(); window.RTS_POST_ON = true; shot(1, G.t); o.glErr = gl.getError();
    R3.aliveAmt = undefined; R3.cloudAmt = undefined; R3.swayAmt = undefined; R3.surfAmt = undefined;
    return o;
  });

  S.ok('the 3D mode is available to check', out.on, out.on ? 'on' : 'no WebGL');
  if (!out.on || !out.placed) {
    S.ok('a power plant and a radar station could be put down', out.placed, String(out.placed));
    await g.close(); await browser.close();
    return require('../lib/report.js')(S);
  }
  S.ok('an antenna stands on the radar dome', out.antenna > 60, out.antenna + ' pixels round its foot');
  S.ok('...and half a second on it has turned', out.turned > 30, out.turned + ' pixels change');
  S.ok('...where without it nothing there moves', out.stillOff === 0, out.stillOff + ' pixels change');
  S.ok('a red beacon shows on the dome while its beat is on', out.beaconOn >= 4, out.beaconOn + ' red pixels');
  S.ok('...and none while it is off', out.beaconOff === 0, out.beaconOff + ' red pixels');
  S.ok('smoke rises off the power plant\'s stacks', out.smoke > 40, out.smoke + ' pixels above the stack change');
  S.ok('the destroyed plant is off the map as far as the rules go', out.reaped, String(out.reaped));
  S.ok('...but its ruin still stands', out.ruins === 1 && out.ruinPx > 150 && out.ruinDark > out.ruinPx * 0.7,
       out.ruins + ' ruin, ' + out.ruinPx + ' pixels, ' + out.ruinDark + ' of them darker than the ground was');
  S.ok('...slumped, far lower than the plant stood', out.ruinTop > out.standingTop + 40,
       'its top at y ' + out.ruinTop + ' against the stacks at y ' + out.standingTop);
  S.ok('...and it is gone when its time is up', out.ruinsLater === 0, out.ruinsLater + ' ruins');
  S.ok('a building sold leaves no ruin', out.soldSeen && out.soldRuins === 0,
       out.soldRuins + ' ruins, with a frame drawn while it lay dead: ' + out.soldSeen);
  S.eq('no draw is refused', out.glErr, 0);
  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
