/* DAMAGE YOU CAN SEE, in the picture - render3d/hurt3d.js and the mesh program's _tint:

     SCORCH   a construction yard at a fifth of its health is darker than whole, and the change
              is on the yard; with R3.scorchOff it is the old dull cast instead
     WINDOWS  just past R3D_GLASS_OUT the windows go dark all at once - a step a nudge of the
              scorch alone does not make
     SMOKE    a tank below half health smokes
     FIRE     a tank near death burns */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('hurt');

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
    function look(x, z) { R.focus.x = x; R.focus.z = z; R.zi = RTS_ZOOMS.length - 1; _rtsApplyCam(); }
    function shot() {
      G.t = t; G.fx.length = 0; _rtsRFrame(0);
      var b = new Uint8Array(CW * CH * 4);
      gl.readPixels(0, 0, CW, CH, gl.RGBA, gl.UNSIGNED_BYTE, b);
      return b;
    }
    function boxOf(x, z, rx, rz, h) {
      var y = _rtsElev(x, z), b = { x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9 };
      [[-rx, -rz], [rx, -rz], [-rx, rz], [rx, rz]].forEach(function (c) {
        [0, h].forEach(function (dy) {
          var p = _rtsWorldToScreen(x + c[0], y + dy, z + c[1]);
          b.x0 = Math.min(b.x0, p.x * R.dpr); b.x1 = Math.max(b.x1, p.x * R.dpr); b.y0 = Math.min(b.y0, p.y * R.dpr); b.y1 = Math.max(b.y1, p.y * R.dpr);
        });
      });
      return b;
    }
    function inB(B, x, y) { return x >= B.x0 && x <= B.x1 && y >= B.y0 && y <= B.y1; }
    function cmp(P, Q, B) {
      var r = { in: 0, out: 0, lumP: 0, lumQ: 0, n: 0, dark: 0 };
      for (var y = 0; y < CH; y++) for (var x = 0; x < CW; x++) {
        var q = ((CH - 1 - y) * CW + x) * 4, sp = P[q] + P[q + 1] + P[q + 2], sq = Q[q] + Q[q + 1] + Q[q + 2], ins = inB(B, x, y);
        if (ins) { r.lumP += sp; r.lumQ += sq; r.n++; }
        if (Math.abs(P[q] - Q[q]) + Math.abs(P[q + 1] - Q[q + 1]) + Math.abs(P[q + 2] - Q[q + 2]) <= 12) continue;
        if (ins) r.in++; else r.out++;
        if (sq < sp - 80) r.dark++;
      }
      r.lumP /= Math.max(1, r.n); r.lumQ /= Math.max(1, r.n);
      return r;
    }
    /* pixels P makes fire-hot that Q does not: much redder and bright - smoke greys, it does not redden */
    function hot(P, Q, B) {
      var n = 0;
      for (var y = Math.max(0, Math.floor(B.y0)); y < Math.min(CH, B.y1); y++) for (var x = Math.max(0, Math.floor(B.x0)); x < Math.min(CW, B.x1); x++) {
        var q = ((CH - 1 - y) * CW + x) * 4;
        if (P[q] > 180 && P[q] - Q[q] > 50 && P[q] > P[q + 2] + 70) n++;
      }
      return n;
    }
    var yd = _rtsHas('player', 'yard'), dY = rtsStructDef(yd.def), full = yd.maxHp;
    look(yd.x, yd.z + 4);
    var BY = boxOf(yd.x, yd.z, dY.w * RTS_TILE / 2, dY.h * RTS_TILE / 2, 8);
    R3.hurtOff = true;
    yd.hp = full; var W0 = shot();
    yd.hp = full * 0.2; var W1 = shot();
    o.scorch = cmp(W0, W1, BY);
    R3.scorchOff = true; var W2 = shot(); R3.scorchOff = false;
    o.oldCast = cmp(W1, W2, BY);
    /* the windows: either side of R3D_GLASS_OUT, and a like nudge of the scorch short of it */
    function hpAt(s) { return full * R3D_SCORCH_FROM * (1 - s); }
    yd.hp = hpAt(R3D_GLASS_OUT - 0.02); var G0 = shot(); yd.hp = hpAt(R3D_GLASS_OUT + 0.02); var G1 = shot();
    yd.hp = hpAt(R3D_GLASS_OUT - 0.1); var G2 = shot(); yd.hp = hpAt(R3D_GLASS_OUT - 0.06); var G3 = shot();
    o.glass = cmp(G0, G1, BY); o.nudge = cmp(G2, G3, BY);
    yd.hp = full;
    R3.hurtOff = false;

    /* a tank smoking, and one burning, out in the open */
    var spot = { x: yd.x + 26, z: yd.z + 22 };
    var tk = _rtsSpawnUnit('player', 'tank', spot.x, spot.z);
    look(spot.x, spot.z - 4);
    var BT = boxOf(spot.x, spot.z, 6, 6, 9);
    tk.hp = tk.maxHp * 0.4;
    var K0 = shot(); R3.hurtOff = true; var K1 = shot(); R3.hurtOff = false;
    o.smoke = cmp(K1, K0, BT);
    tk.hp = tk.maxHp * 0.12;
    var F0 = shot(); R3.hurtOff = true; var F1 = shot(); R3.hurtOff = false;
    o.fire = [hot(F0, F1, BT), hot(K0, K1, BT)];          /* burning, and only smoking */
    tk.dead = true;

    gl.getError(); window.RTS_POST_ON = true; shot(); o.glErr = gl.getError();
    R3.cloudAmt = undefined; R3.swayAmt = undefined; R3.surfAmt = undefined;
    return o;
  });

  S.ok('the 3D mode is available to check', out.on, out.on ? 'on' : 'no WebGL');
  if (!out.on) { await g.close(); await browser.close(); return require('../lib/report.js')(S); }
  var sc = out.scorch;
  S.ok('a yard at a fifth of its health is scorched darker', sc.lumQ < sc.lumP * 0.88 && sc.in > 2000,
       'mean ' + (sc.lumQ / 3).toFixed(1) + ' against ' + (sc.lumP / 3).toFixed(1) + ' whole, ' + sc.in + ' pixels changed');
  S.ok('...and the change is on the yard', sc.out < sc.in * 0.05, sc.out + ' pixels elsewhere');
  S.ok('with R3.scorchOff it is the old dull cast instead', out.oldCast.in > 2000, out.oldCast.in + ' pixels differ');
  S.ok('past R3D_GLASS_OUT the windows go dark at once', out.glass.dark > 40 && out.glass.dark > out.nudge.dark * 3,
       out.glass.dark + ' pixels darken sharply across it, ' + out.nudge.dark + ' for a like nudge short of it');
  S.ok('a tank below half health smokes', out.smoke.in + out.smoke.out > 150, (out.smoke.in + out.smoke.out) + ' pixels of smoke');
  S.ok('a tank near death burns', out.fire[0] > 30 && out.fire[0] > out.fire[1] * 4, out.fire[0] + ' pixels turn fire-hot; ' + out.fire[1] + ' for the tank only smoking');
  S.eq('no draw is refused', out.glErr, 0);
  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
