/* AIRCRAFT THAT FLY LIKE AIRCRAFT, in the picture - render3d/air3d.js, each with its kill switch:

     BANKING     a MiG flown round a turn is drawn differently from the same MiG with R3.airOff:
                 the MiG, and its shadow on the ground below
     CONTRAILS   behind it hang two white lines - the frame without them (R3.trailOff) differs
                 behind the jet, brighter where they are
     PROPELLER   a Yak's propeller turns between two moments, and with R3.rotorOff it does not */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('air');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 900, height: 700, dpr: 1 });
  await g.start(7, 1);

  var out = await g.page.evaluate(function () {
    var o = {}, R = _rtsR, G = window._rtsG, i;
    for (i = 0; i < RTS_N * RTS_N; i++) { G.mapped[i] = 1; G.vis[i] = 1; }
    G.visDirty = 1;
    var R3 = window._R3D;
    o.on = !!(R3 && R3.on);
    if (!o.on) return o;
    if (window._rtsUI) window._rtsUI.dead = true;
    window.RTS_POST_ON = false;
    R3.cloudAmt = 0; R3.swayAmt = 0; R3.surfAmt = 0;
    G.ents.forEach(function (e) { if (e.type === 'unit') e.path = null; });
    var gl = R3.gl, CW = R3.cv.width, CH = R3.cv.height, t = G.t + 1;
    function look(x, z) { R.focus.x = x; R.focus.z = z; R.zi = RTS_ZOOMS.length - 2; _rtsApplyCam(); }
    function shot() {
      G.fx.length = 0; _rtsRFrame(0);
      var b = new Uint8Array(CW * CH * 4);
      gl.readPixels(0, 0, CW, CH, gl.RGBA, gl.UNSIGNED_BYTE, b);
      return b;
    }
    function boxOf(x, y, z, r) {
      var b = { x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9 };
      [[-r, -r], [r, -r], [-r, r], [r, r]].forEach(function (c) {
        [-r * 0.6, r * 0.6].forEach(function (dy) {
          var p = _rtsWorldToScreen(x + c[0], y + dy, z + c[1]);
          b.x0 = Math.min(b.x0, p.x * R.dpr); b.x1 = Math.max(b.x1, p.x * R.dpr); b.y0 = Math.min(b.y0, p.y * R.dpr); b.y1 = Math.max(b.y1, p.y * R.dpr);
        });
      });
      return b;
    }
    function diff(P, Q, B, brighter) {
      var r = { in: 0, out: 0, up: 0 };
      for (var y = 0; y < CH; y++) for (var x = 0; x < CW; x++) {
        var q = ((CH - 1 - y) * CW + x) * 4, d = P[q] + P[q + 1] + P[q + 2] - Q[q] - Q[q + 1] - Q[q + 2];
        if (Math.abs(P[q] - Q[q]) + Math.abs(P[q + 1] - Q[q + 1]) + Math.abs(P[q + 2] - Q[q + 2]) <= 12) continue;
        if (x >= B.x0 && x <= B.x1 && y >= B.y0 && y <= B.y1) r.in++; else { r.out++; if (d > 0) r.up++; }
      }
      return r;
    }
    var yd = _rtsHas('player', 'yard');

    /* a MiG flown round a turn, the camera on it at the end */
    var mig = _rtsSpawnUnit('player', 'mig', yd.x, yd.z + 10);
    mig.alt = 14; mig.rot = 0;
    for (var f = 0; f < 40; f++) {
      t += 0.05; G.t = t;
      mig.rot += 0.045; mig.x += Math.cos(mig.rot) * 1.4; mig.z += Math.sin(mig.rot) * 1.4;
      look(mig.x, mig.z); _rtsRFrame(0);
    }
    var my = R3.motion[mig.id].y, BM = boxOf(mig.x, my, mig.z, 3.2);
    o.bank = +(Math.acos(R3.motion[mig.id].n ? R3.motion[mig.id].n[1] : 1) * 57.3).toFixed(1);
    var M0 = shot();
    R3.airOff = true; var M1 = shot(); R3.airOff = false;
    o.banked = diff(M0, M1, BM);
    R3.trailOff = true; var M2 = shot(); R3.trailOff = false;
    o.trail = diff(M0, M2, BM);
    o.trailPts = R3.motion[mig.id].trail.length;
    mig.dead = true;

    /* a Yak on the pad side of the map, propeller turning */
    var yak = _rtsSpawnUnit('player', 'yak', yd.x + 6, yd.z + 14);
    yak.alt = 14; yak.rot = 0.4;
    look(yak.x, yak.z);
    var BY = boxOf(yak.x, _rtsElev(yak.x, yak.z) + 14 * 0.35, yak.z, 3.5);
    G.t = t + 1; var Y0 = shot(); G.t = t + 1.03; var Y1 = shot();
    o.prop = diff(Y0, Y1, BY);
    R3.rotorOff = true; G.t = t + 1.06; var Y2 = shot(); G.t = t + 1.09; var Y3 = shot(); R3.rotorOff = false;
    o.propOff = diff(Y2, Y3, BY);
    yak.dead = true;

    gl.getError(); window.RTS_POST_ON = true; shot(); o.glErr = gl.getError();
    R3.cloudAmt = undefined; R3.swayAmt = undefined; R3.surfAmt = undefined;
    return o;
  });

  S.ok('the 3D mode is available to check', out.on, out.on ? 'on' : 'no WebGL');
  if (!out.on) { await g.close(); await browser.close(); return require('../lib/report.js')(S); }
  S.ok('a MiG in a turn banks into it', out.bank > 10 && out.banked.in > 60, out.bank + ' degrees, ' + out.banked.in + ' pixels against R3.airOff');
  /* its shadow, far below it on the ground, banks with it - and that is all that does */
  S.ok('...and that changes the MiG most, its shadow below it less', out.banked.out < out.banked.in * 0.6, out.banked.out + ' pixels elsewhere');
  S.ok('behind it hang its contrails', out.trailPts >= 20 && out.trail.out > 300 && out.trail.up > out.trail.out * 0.8,
       out.trailPts + ' points; ' + out.trail.out + ' pixels behind the jet, ' + out.trail.up + ' of them brighter');
  S.ok('a Yak\'s propeller turns', out.prop.in > 15, out.prop.in + ' pixels in 0.03 s');
  S.ok('...and with R3.rotorOff it stands still', out.propOff.in === 0, out.propOff.in + ' pixels');
  S.eq('no draw is refused', out.glErr, 0);
  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
