/* A GUN GOING OFF, on the built page - render3d/combat3d.js, and a vehicle's wreckage.

     RECOIL     at the shot the turret is drawn back along its barrel, behind the hull, and home
                again when the recoil is spent - read off the placements the renderer hands the GPU
     FLASH      the muzzle flash is in the picture, at the barrel's tip
     LIGHT      at night the flash lights the ground round the tank
     WRECKAGE   a tank that dies throws wreckage that is in the picture, and lands */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('combat3d');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 900, height: 700, dpr: 1 });
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
    var t = _rtsSpawnUnit('player', 'tank', wf.x + 2, wf.z + 26);
    t.turret = 0.4; t.rot = 0.4;
    R.focus.x = t.x; R.focus.z = t.z; R.zi = RTS_ZOOMS.length - 1; _rtsApplyCam();
    var gl = R3.gl, CW = R3.cv.width, CH = R3.cv.height, sc = CW / R3.cv.clientWidth;
    function shot() { _rtsRFrame(0); var b = new Uint8Array(CW * CH * 4); gl.readPixels(0, 0, CW, CH, gl.RGBA, gl.UNSIGNED_BYTE, b); return b; }
    function patch(b, sx, sy, r) {
      var s2 = 0, n = 0;
      for (var y = -r; y <= r; y++) for (var x = -r; x <= r; x++) {
        var px = Math.round((sx + x) * sc), py = CH - 1 - Math.round((sy + y) * sc);
        if (px < 0 || py < 0 || px >= CW || py >= CH) continue;
        var k = (py * CW + px) * 4; s2 += b[k] * 0.3 + b[k + 1] * 0.59 + b[k + 2] * 0.11; n++;
      }
      return n ? s2 / n : 0;
    }
    function diff(a, b) { var n = 0; for (var k = 0; k < a.length; k += 4) if (Math.abs(a[k] - b[k]) + Math.abs(a[k + 1] - b[k + 1]) + Math.abs(a[k + 2] - b[k + 2]) > 24) n++; return n / (a.length / 4); }

    /* RECOIL: where the tank's two meshes are placed, caught on their way to the GPU */
    function placed() {
      /* once a mesh: the shadow pass places each of them as well */
      var push = window._r3dInstPush, got = [], seen = [];
      window._r3dInstPush = function (B, mesh, x, y, z) {
        if (Math.hypot(x - t.x, z - t.z) < 2 && seen.indexOf(mesh) < 0) { seen.push(mesh); got.push([x, z]); }
        return push.apply(this, arguments);
      };
      _rtsRFrame(0);
      window._r3dInstPush = push;
      /* the sun's pass draws the plain models (mesh3d.js) and comes first; the last two are the
         camera's own hull and turret */
      return got.slice(-2);
    }
    var still = placed();
    t.fire = 0.09; t.recoil = RTS_RECOIL_TIME;
    var kick = placed();
    t.recoil = 0;
    var after = placed();
    function along(p) { return (p[0] - t.x) * Math.cos(t.turret) + (p[1] - t.z) * Math.sin(t.turret); }
    o.still = still.map(along); o.kick = kick.map(along); o.after = after.map(along);

    /* FLASH */
    t.fire = 0.09; t.recoil = 0;
    var m = _r3dMuzzles(G).filter(function (q) { return q[5] === t; })[0];
    var mp = _r3dWorldToScreen(m[0], m[1], m[2]);
    var F1 = shot(); R3.muzzleAmt = 0; var F0 = shot(); R3.muzzleAmt = 1;
    o.flash = [+patch(F1, mp.x, mp.y, 4).toFixed(1), +patch(F0, mp.x, mp.y, 4).toFixed(1)];

    /* LIGHT: at night, on the ground beside the tank */
    window.RTS_SKY_FORCE = 'night'; R3.lampAmt = 0;
    var gp = _r3dWorldToScreen(t.x + Math.cos(t.turret) * 6, _rtsElev(t.x + Math.cos(t.turret) * 6, t.z + Math.sin(t.turret) * 6), t.z + Math.sin(t.turret) * 6);
    var N1 = shot(); t.fire = 0; var N0 = shot();
    o.light = [+patch(N1, gp.x, gp.y, 5).toFixed(1), +patch(N0, gp.x, gp.y, 5).toFixed(1)];
    window.RTS_SKY_FORCE = 'day'; R3.lampAmt = 1;

    /* WRECKAGE */
    var n0 = G.fx.length;
    _rtsDamage(t, 1e6, null);
    var deb = G.fx.slice(n0).filter(function (f) { return f.kind === 'debris'; });
    o.debris = deb.length;
    for (i = 0; i < 8; i++) _rtsTick(1 / 30);
    var W1 = shot(), keep = G.fx.slice();
    G.fx = G.fx.filter(function (f) { return f.kind !== 'debris'; });
    var W0 = shot(); G.fx = keep;
    o.wreckSeen = +(diff(W1, W0) * 100).toFixed(2);
    for (i = 0; i < 60; i++) _rtsTick(1 / 30);
    o.landed = deb.every(function (f) { return G.fx.indexOf(f) < 0 || f.y < 0.5; });
    window.RTS_SKY_FORCE = undefined;
    return o;
  });

  S.ok('the 3D mode is available to check', out.on, String(out.on));
  if (out.on) {
    var num = function (a, b) { return a - b; };
    var still = out.still.slice().sort(num), kick = out.kick.slice().sort(num), after = out.after.slice().sort(num);
    S.ok('the tank\'s hull and turret are both found', still.length === 2 && kick.length === 2, JSON.stringify(out.still));
    S.ok('at the shot both are drawn back along the barrel, the turret furthest', kick[0] < still[0] - 0.4 && kick[1] < still[1] - 0.1,
         'along the barrel: ' + out.still.map(function (v) { return v.toFixed(2); }) + ' -> ' + out.kick.map(function (v) { return v.toFixed(2); }));
    S.ok('...and home again when the recoil is spent', JSON.stringify(after) === JSON.stringify(still), out.after.map(function (v) { return v.toFixed(2); }).join(','));
    S.ok('the muzzle flash is in the picture, at the barrel\'s tip', out.flash[0] > out.flash[1] + 25, out.flash[0] + ' with it, ' + out.flash[1] + ' without');
    S.ok('at night the flash lights the ground beside the tank', out.light[0] > out.light[1] + 8, out.light[0] + ' firing, ' + out.light[1] + ' not');
    S.ok('a tank that dies throws wreckage', out.debris >= 3, out.debris + ' pieces');
    S.ok('...that is in the picture', out.wreckSeen > 0.05, out.wreckSeen + '% of the frame');
    S.ok('...and comes down', out.landed, String(out.landed));
  }
  S.ok('no page errors', g.errors.length === 0, g.errors.join(' | ') || 'none');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
