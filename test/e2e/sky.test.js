/* THE HOUR AND THE WEATHER, on the built page - render3d/sky3d.js, render3d/skyfx3d.js,
   render/sky2d.js.

     DAY       nothing of the night is drawn by day: the lamps, the rain and the banks switched
               off leave a day frame exactly as it was
     NIGHT     the battlefield goes dark - and the sea's foam and glint with it - while the
               lamps light the doors they hang over and the headlights the ground ahead
     DUSK      warmer than day: red gains on blue across the frame
     RAIN      the rain is in the picture, and the ground is wet: darker than the same sky dry
     FOG       the banks are in the picture, and the haze takes contrast out of the frame
     2D        the 2D picture takes the hour too, and its lamps light the doors
     GL        no program is left with an error under any sky
     TITLE     the SKY button cycles the conditions and keeps the choice */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('sky');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 900, height: 700, dpr: 1, sky: 'auto' });

  /* TITLE, before the battle */
  var title = await g.page.evaluate(function () {
    var b = document.querySelector('#rtsSky button'), o = { before: b && b.textContent };
    if (!b) return o;
    b.click(); o.after = b.textContent; o.stored = window.localStorage.getItem('rtsSky');
    for (var i = 0; i < 5; i++) b.click();
    o.back = b.textContent; o.storedBack = window.localStorage.getItem('rtsSky');
    return o;
  });

  await g.start(7, 1);
  var out = await g.page.evaluate(function () {
    var o = {}, R = _rtsR, G, i;
    rtsSetVoxSide('allied');
    _rtsNewGame(4242, 'easy');
    G = window._rtsG;
    for (i = 0; i < RTS_N * RTS_N; i++) { G.mapped[i] = 1; G.vis[i] = 1; }
    G.visDirty = 1;
    rts3dSet(true);
    var R3 = window._R3D;
    o.on = !!(R3 && R3.on);
    if (!o.on) return o;
    R3.cloudAmt = 0;
    var wf = null;
    for (i = 0; i < G.ents.length; i++) if (G.ents[i].def === 'factory') { wf = G.ents[i]; break; }
    var tank = _rtsSpawnUnit('player', 'tank', wf.x + 2, wf.z + 22);
    tank.rot = 0; tank.path = [[_rtsTX(wf.x) + 20, _rtsTX(wf.z) + 5]];
    R.focus.x = wf.x + 6; R.focus.z = wf.z + 12; R.zi = RTS_ZOOMS.length - 2; _rtsApplyCam();
    var gl = R3.gl, CW = R3.cv.width, CH = R3.cv.height, sc = CW / R3.cv.clientWidth;
    function shot(sky) {
      window.RTS_SKY_FORCE = sky; tank.path = tank.path || [[1, 1]];
      _rtsRFrame(0);
      var b = new Uint8Array(CW * CH * 4);
      gl.readPixels(0, 0, CW, CH, gl.RGBA, gl.UNSIGNED_BYTE, b);
      return b;
    }
    function stats(b) {
      var l = 0, l2 = 0, r = 0, bl = 0, n = 0;
      for (var k = 0; k < b.length; k += 16) { var y = b[k] * 0.3 + b[k + 1] * 0.59 + b[k + 2] * 0.11; l += y; l2 += y * y; r += b[k]; bl += b[k + 2]; n++; }
      l /= n; return { luma: +l.toFixed(1), sd: +Math.sqrt(l2 / n - l * l).toFixed(1), rb: +(r / Math.max(1, bl)).toFixed(3) };
    }
    function patch(b, sx, sy, r) {
      var s2 = 0, n = 0;
      for (var y = -r; y <= r; y++) for (var x = -r; x <= r; x++) {
        var px = Math.round((sx + x) * sc), py = CH - 1 - Math.round((sy + y) * sc);
        if (px < 0 || py < 0 || px >= CW || py >= CH) continue;
        var k = (py * CW + px) * 4; s2 += b[k] * 0.3 + b[k + 1] * 0.59 + b[k + 2] * 0.11; n++;
      }
      return n ? s2 / n : 0;
    }
    function diff(a, b, thr) { var n = 0; for (var k = 0; k < a.length; k += 4) if (Math.abs(a[k] - b[k]) + Math.abs(a[k + 1] - b[k + 1]) + Math.abs(a[k + 2] - b[k + 2]) > (thr || 24)) n++; return n / (a.length / 4); }
    var errs = [];
    function glErr(tag) { var e = gl.getError(); if (e) errs.push(tag + ':' + e); }

    /* DAY */
    var D0 = shot('day'); glErr('day');
    R3.lampAmt = 0; R3.rainAmt = 0; R3.bankAmt = 0;
    var D1 = shot('day');
    R3.lampAmt = 1; R3.rainAmt = 1; R3.bankAmt = 1;
    o.dayOff = diff(D0, D1);
    o.day = stats(D0);

    /* NIGHT: the door, and the ground ahead of the tank */
    var N0 = shot('night'); glErr('night');
    o.night = stats(N0);
    var d = rtsStructDef(wf.def), door = _r3dWorldToScreen(wf.x, _rtsElev(wf.x, wf.z) + 1.2, wf.z + d.h * RTS_TILE / 2 + 0.5);
    var ahead = _r3dWorldToScreen(tank.x + 4.5, _rtsElev(tank.x + 4.5, tank.z), tank.z);
    R3.lampAmt = 0; var N1 = shot('night');
    /* the tank's own hull - the mesh program's shading, not the ground's */
    var roof = _r3dWorldToScreen(tank.x, _rtsElev(tank.x, tank.z) + 1.0, tank.z);
    o.roof = [+patch(D0, roof.x, roof.y, 3).toFixed(1), +patch(N1, roof.x, roof.y, 3).toFixed(1)];
    R3.lampAmt = 1;
    o.door = [+patch(N0, door.x, door.y, 4).toFixed(1), +patch(N1, door.x, door.y, 4).toFixed(1)];
    o.ahead = [+patch(N0, ahead.x, ahead.y, 4).toFixed(1), +patch(N1, ahead.x, ahead.y, 4).toFixed(1)];
    /* the sea: the darkest third of the frame by day is mostly water here; take open water */
    var sea = null;
    for (i = 0; i < 400 && !sea; i++) {
      var sx = R.focus.x + (i % 20 - 10) * 3, sz = R.focus.z + (Math.floor(i / 20) - 10) * 3;
      if (G.terrain[_rtsIdx(_rtsTX(sx), _rtsTX(sz))] === RTS_T_WATER && G.terrain[_rtsIdx(_rtsTX(sx) + 1, _rtsTX(sz))] === RTS_T_WATER) sea = [sx, sz];
    }
    if (sea) { var sp = _r3dWorldToScreen(sea[0], 0.1, sea[1]); o.sea = [+patch(D0, sp.x, sp.y, 6).toFixed(1), +patch(N0, sp.x, sp.y, 6).toFixed(1)]; }

    /* DUSK */
    o.dusk = stats(shot('dusk')); glErr('dusk');

    /* RAIN */
    var W0 = shot('rain'); glErr('rain');
    R3.rainAmt = 0; var W1 = shot('rain'); R3.rainAmt = 1;
    R3.rainN = 0; shot('rain'); o.rainN = R3.rainN;
    o.rainSeen = diff(W0, W1, 10);                 /* streaks a pixel wide, pale: a fainter threshold */
    var wet = R3D_SKIES.rain.wet; R3D_SKIES.rain.wet = 0; R3.rainAmt = 0;
    var W2 = shot('rain'); R3D_SKIES.rain.wet = wet; R3.rainAmt = 1;
    o.wet = [stats(W1).luma, stats(W2).luma];

    /* FOG */
    var F0 = shot('fog'); glErr('fog');
    R3.bankAmt = 0; var F1 = shot('fog'); R3.bankAmt = 1;
    o.bankSeen = diff(F0, F1);
    /* WHAT AN EFFECT REFLECTS takes the hour: the same pale banks laid over the night lift the
       frame far less than they lift the fog's daylight */
    function lift(a, b) { var s2 = 0, n = 0; for (var k = 0; k < a.length; k += 16) { s2 += Math.abs((a[k] - b[k]) * 0.3 + (a[k + 1] - b[k + 1]) * 0.59 + (a[k + 2] - b[k + 2]) * 0.11); n++; } return s2 / n; }
    R3D_SKIES.night.banks = 1; R3.lampAmt = 0;
    var B1 = shot('night'); R3.bankAmt = 0; var B0 = shot('night'); R3.bankAmt = 1;
    R3D_SKIES.night.banks = 0; R3.lampAmt = 1;
    o.bankLift = [+lift(F0, F1).toFixed(2), +lift(B1, B0).toFixed(2)];
    o.fog = stats(F1);

    /* 2D */
    rts3dSet(false);
    function shot2(sky) { window.RTS_SKY_FORCE = sky; _rtsRFrame(0); var c = R.cv, x = c.getContext('2d'); return { d: x.getImageData(0, 0, c.width, c.height).data, w: c.width, dpr: c.width / c.clientWidth }; }
    var T0 = shot2('day'), T1 = shot2('night');
    function luma2(T) { var s2 = 0, n = 0; for (var k = 0; k < T.d.length; k += 64) { s2 += T.d[k] * 0.3 + T.d[k + 1] * 0.59 + T.d[k + 2] * 0.11; n++; } return s2 / n; }
    o.luma2 = [+luma2(T0).toFixed(1), +luma2(T1).toFixed(1)];
    var dp = _rtsGroundToScreen(wf.x, wf.z + d.h * RTS_TILE / 2 + 1), fp = _rtsGroundToScreen(wf.x - 30, wf.z + 30);
    function at2(T, p) { var x = Math.round(p.x * T.dpr), y = Math.round(p.y * T.dpr), k = (y * T.w + x) * 4; return T.d[k] * 0.3 + T.d[k + 1] * 0.59 + T.d[k + 2] * 0.11; }
    o.door2 = [+(at2(T1, dp) / Math.max(1, at2(T0, dp))).toFixed(2), +(at2(T1, fp) / Math.max(1, at2(T0, fp))).toFixed(2)];
    window.RTS_SKY_FORCE = undefined;
    o.errs = errs;
    return o;
  });

  S.ok('the title has a SKY button, AUTO to begin with', title.before === 'SKY: AUTO', String(title.before));
  S.ok('...a tap moves it on to DAY and keeps the choice', title.after === 'SKY: DAY' && title.stored === 'day', title.after + ' / ' + title.stored);
  S.ok('...and round the six back to AUTO, which keeps nothing', title.back === 'SKY: AUTO' && title.storedBack === null, title.back + ' / ' + title.storedBack);
  S.ok('the 3D mode is available to check', out.on, String(out.on));
  if (out.on) {
    S.ok('by day nothing of the night is drawn: lamps, rain and banks off leave the frame as it was', out.dayOff === 0, (out.dayOff * 100).toFixed(2) + '% changed');
    S.ok('night is dark: under half the day\'s brightness', out.night.luma < out.day.luma * 0.5, out.night.luma + ' against ' + out.day.luma);
    S.ok('...the models with it: a tank\'s hull by night under half its day', out.roof[1] < out.roof[0] * 0.5, out.roof[1] + ' against ' + out.roof[0]);
    S.ok('...while the lamp over a door lights it', out.door[0] > out.door[1] + 6, out.door[0] + ' with the lamps, ' + out.door[1] + ' without');
    S.ok('...and a moving tank\'s headlights the ground ahead of it', out.ahead[0] > out.ahead[1] + 4, out.ahead[0] + ' with, ' + out.ahead[1] + ' without');
    S.ok('the sea goes dark with it, its foam and glint too', !out.sea || out.sea[1] < out.sea[0] * 0.55, out.sea ? out.sea[1] + ' against ' + out.sea[0] + ' by day' : 'no open water in view');
    S.ok('dusk is warmer than day: red gains on blue', out.dusk.rb > out.day.rb * 1.12, out.dusk.rb + ' against ' + out.day.rb);
    S.ok('the rain is in the picture: hundreds of streaks, each a pixel or two', out.rainN > 150 && out.rainSeen > 0.001,
         out.rainN + ' streaks, ' + (out.rainSeen * 100).toFixed(2) + '% of the frame');
    S.ok('...and the ground is wet: darker than the same sky dry', out.wet[0] < out.wet[1] - 3, out.wet[0] + ' wet, ' + out.wet[1] + ' dry');
    S.ok('an effect takes the hour too: the same banks lift the night less than half as much as the fog\'s day',
         out.bankLift[0] > 2 && out.bankLift[1] < out.bankLift[0] * 0.5, out.bankLift[1] + ' by night, ' + out.bankLift[0] + ' in the fog');
    S.ok('the fog banks are in the picture', out.bankSeen > 0.02, (out.bankSeen * 100).toFixed(2) + '% of the frame');
    S.ok('...and the haze takes the contrast out', out.fog.sd < out.day.sd * 0.85, 'spread ' + out.fog.sd + ' against ' + out.day.sd);
    S.ok('in 2D the night is dark too', out.luma2[1] < out.luma2[0] * 0.6, out.luma2.join(' -> '));
    S.ok('...but a door keeps more of its light than open ground', out.door2[0] > out.door2[1] * 1.3, 'door ' + out.door2[0] + ' of its day, open ground ' + out.door2[1]);
    S.ok('no GL errors under any sky', out.errs.length === 0, out.errs.join(' ') || 'none');
  }
  S.ok('no page errors', g.errors.length === 0, g.errors.join(' | ') || 'none');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
