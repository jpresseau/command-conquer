/* WHAT IS LEFT OF A VEHICLE - render3d/husk3d.js.

   A tank is killed on open ground and the frame is taken R3.huskAmt 0 against 1:

     THE HULL    a charred hull stands where it died, in its fire - darker than the ground it
                 stands on, and darker than the tank was
     SETTLING    in the last of its smoke it sinks out of sight
     GONE        when the fire is out, so is the hull
     NOT ALL     a soldier leaves no hull, and nor does a crushed tank: only what the wreck
                 fire burns (core/capture.js) is left standing in it */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('husk');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 900, height: 760, dpr: 1 });
  await g.start(7, 1);

  var out = await g.page.evaluate(function () {
    var o = {}, R = _rtsR, G = window._rtsG, i;
    for (i = 0; i < RTS_N * RTS_N; i++) { G.mapped[i] = 1; G.vis[i] = 1; }
    G.visDirty = 1;
    rts3dSet(true);
    var R3 = window._R3D;
    o.on = !!(R3 && R3.on);
    if (!o.on) return o;
    window.RTS_POST_ON = false;
    R3.cloudAmt = 0;
    /* open grass near the yard, away from everything */
    var yd = _rtsHas('player', 'yard'), spot = null;
    for (var rr = 5; rr < 30 && !spot; rr++) for (var a = 0; a < 16 && !spot; a++) {
      var x = yd.x + Math.cos(a / 16 * 6.283) * rr * RTS_TILE, z = yd.z + Math.sin(a / 16 * 6.283) * rr * RTS_TILE, ok = true;
      for (var dz = -2; dz <= 2 && ok; dz++) for (var dx = -2; dx <= 2 && ok; dx++) {
        var tx = _rtsTX(x) + dx, tz = _rtsTX(z) + dz;
        if (!_rtsInB(tx, tz) || G.terrain[_rtsIdx(tx, tz)] !== RTS_T_GRASS || _rtsBlocked(tx, tz)) ok = false;
      }
      if (ok) spot = [x, z];
    }
    o.spot = !!spot;
    if (!spot) return o;
    G.fx.length = 0;
    var tank = _rtsSpawnUnit('enemy', 'tank', spot[0], spot[1]);
    R.focus.x = spot[0]; R.focus.z = spot[1]; R.zi = RTS_ZOOMS.length - 1; _rtsApplyCam();
    var gl = R3.gl, CW = R3.cv.width, CH = R3.cv.height;
    function shot(amt) {
      R3.huskAmt = amt;
      _rtsRFrame(0);
      var b = new Uint8Array(CW * CH * 4);
      gl.readPixels(0, 0, CW, CH, gl.RGBA, gl.UNSIGNED_BYTE, b);
      return b;
    }
    function lum(b, q) { return b[q] * 0.299 + b[q + 1] * 0.587 + b[q + 2] * 0.114; }
    /* the pixels the husk changes, and how dark they are with it and without */
    function husk() {
      var A = shot(0), B = shot(1), n = 0, la = 0, lb = 0;
      for (var q = 0; q < A.length; q += 4) {
        if (Math.abs(A[q] - B[q]) + Math.abs(A[q + 1] - B[q + 1]) + Math.abs(A[q + 2] - B[q + 2]) <= 20) continue;
        n++; la += lum(A, q); lb += lum(B, q);
      }
      return { n: n, ground: n ? +(la / n).toFixed(1) : 0, hull: n ? +(lb / n).toFixed(1) : 0, husks: R3.husks };
    }
    /* the tank alive, for how dark it was */
    var L = shot(1);
    tank.dead = true; var L0 = shot(1); tank.dead = false;
    var ln = 0, ll = 0;
    for (var q = 0; q < L.length; q += 4) {
      if (Math.abs(L[q] - L0[q]) + Math.abs(L[q + 1] - L0[q + 1]) + Math.abs(L[q + 2] - L0[q + 2]) <= 20) continue;
      ln++; ll += lum(L, q);
    }
    o.alive = ln ? +(ll / ln).toFixed(1) : 0;

    _rtsKill(tank);
    for (var k = 0; k < 20; k++) _rtsTick(0.05);
    o.reaped = G.ents.indexOf(tank) < 0;
    o.fresh = husk();
    var rec = null;
    for (i = 0; i < G.fx.length; i++) if (G.fx[i].husk) rec = G.fx[i];
    o.rec = rec ? { def: rec.husk.def, side: rec.husk.side } : null;
    /* on through the flames to the last loop of the smoke */
    var guard = 0;
    while (rec && G.fx.indexOf(rec) >= 0 && !(rec.kind === 'smoke' && rec.loops <= 1) && guard++ < 2000) _rtsTick(0.05);
    o.lastLoop = !!rec && G.fx.indexOf(rec) >= 0;
    o.early = o.late = { n: 0 };
    if (o.lastLoop) {
      rec.t = 0.1; o.early = husk();
      rec.t = RTS_ANIMS.smoke.dur * 0.9; o.late = husk();
    }
    guard = 0;
    while (G.fx.indexOf(rec) >= 0 && guard++ < 2000) _rtsTick(0.05);
    o.gone = husk();

    /* a soldier, and a crushed tank */
    var man = _rtsSpawnUnit('enemy', 'rifle', spot[0], spot[1]);
    var crushed = _rtsSpawnUnit('enemy', 'tank', spot[0] + 6, spot[1]);
    crushed.crushed = true;
    _rtsKill(man); _rtsKill(crushed);
    o.others = G.fx.filter(function (f) { return f.husk; }).length;

    gl.getError(); window.RTS_POST_ON = true; shot(1); o.glErr = gl.getError();
    R3.huskAmt = undefined; R3.cloudAmt = undefined;
    return o;
  });

  S.ok('the 3D mode is available to check', out.on, out.on ? 'on' : 'no WebGL');
  if (!out.on || !out.spot) {
    S.ok('there is open grass to fight on', out.spot, String(out.spot));
    await g.close(); await browser.close();
    return require('../lib/report.js')(S);
  }
  var f = out.fresh;
  S.ok('the dead tank is off the board', out.reaped, String(out.reaped));
  S.ok('...and its fire remembers what burned', out.rec && out.rec.def === 'tank' && out.rec.side === 'enemy', JSON.stringify(out.rec));
  S.ok('a hull stands where it died', f.husks === 1 && f.n > 300, f.husks + ' husk, ' + f.n + ' pixels');
  S.ok('...charred: darker than the ground under it', f.hull < f.ground * 0.6,
       'mean brightness ' + f.hull + ' against ' + f.ground + ' without it');
  S.ok('...and darker than the tank was', f.hull < out.alive * 0.75, f.hull + ' against ' + out.alive + ' alive');
  S.ok('in the last of its smoke it settles out of sight', out.lastLoop && out.late.n < out.early.n * 0.6,
       out.early.n + ' pixels at the start of the last loop, ' + out.late.n + ' near its end');
  S.ok('when the fire is out, so is the hull', out.gone.husks === 0 && out.gone.n === 0,
       out.gone.husks + ' husks, ' + out.gone.n + ' pixels');
  S.ok('a soldier and a crushed tank leave no hull', out.others === 0, out.others + ' husks');
  S.eq('no draw is refused with a husk and the post buffer on', out.glErr, 0);
  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
