/* EXPLOSIVES ON THE PAGE (core/blast.js, sprites/blast.js, render3d/blast3d.js):

     DRAWN        the Sapper, the Zealot, the Wrecker and the Frogman are drawn: the picture round
                  each differs with it hidden (R3.hideId)
     THE CHARGE   a charge on a tank blinks a red light over it (R3.chargeOff takes the light away
                  for the A/B), and a square nine cells off is not changed; selected, the tank's
                  readout counts the fuse down
     HE SWIMS     a Frogman in the water is drawn lower, to the chest in it, and is still drawn
   The loop frozen, the staging asserted first. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('blast');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 1000, height: 700 });
  await g.start(7, 1, { freeze: true });
  var o = await g.page.evaluate(function () {
    var G = window._rtsG, R = _rtsR, R3 = window._R3D, gl = R3.gl, yd = _rtsHas('player', 'yard'), out = {};
    for (var i = 0; i < RTS_N * RTS_N; i++) { G.mapped[i] = 1; G.vis[i] = 1; }
    function look(x, z) { R.focus.x = x; R.focus.z = z; R.zi = RTS_ZOOMS.length - 2; _rtsApplyCam(); }
    function grab(x, y, z, n) {
      var s = _rtsWorldToScreen(x, y, z), k = R3.cv.width / R.W, H = R3.cv.height, px = new Uint8Array(4 * n * n), h = (n - 1) / 2;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.readPixels(Math.round(s.x * k) - h, H - Math.round(s.y * k) - h, n, n, gl.RGBA, gl.UNSIGNED_BYTE, px);
      return px;
    }
    function frame() { _rtsRFrame(0); _rtsRFrame(0); _rtsSyncSidebar(0); }
    function differ(a, b, cut) { var d = 0; for (var q = 0; q < a.length; q += 4) if (Math.abs(a[q] - b[q]) + Math.abs(a[q + 1] - b[q + 1]) + Math.abs(a[q + 2] - b[q + 2]) > (cut || 30)) d++; return d; }
    function at(dx, dz) { var q = _rtsNearestOpen(yd.tx + dx, yd.tz + dz, 8, null); return [_rtsWX(q[0]), _rtsWX(q[1])]; }
    function drawn(e) {
      var y = _rtsStandY(e.x, e.z) + 1 - _r3dSwimSink(G, e, rtsUnitDef(e.def)) * 0.5;
      look(e.x, e.z); frame(); var a = grab(e.x, y, e.z, 25);
      R3.hideId = e.id; frame(); var b = grab(e.x, y, e.z, 25); R3.hideId = null;
      return differ(a, b);
    }
    var p = at(6, 8);
    var sp = _rtsSpawnUnit('player', 'sapper', p[0], p[1]);
    var zl = _rtsSpawnUnit('player', 'zealot', p[0] + RTS_TILE * 3, p[1]);
    var wk = _rtsSpawnUnit('player', 'wrecker', p[0] + RTS_TILE * 2, p[1] + RTS_TILE * 4);
    var fm = _rtsSpawnUnit('player', 'frogman', p[0] - RTS_TILE * 3, p[1] + RTS_TILE * 2);
    out.drawn = { sapper: drawn(sp), zealot: drawn(zl), wrecker: drawn(wk), frogman: drawn(fm) };

    /* ---- a charge on the player's tank, set by an enemy Sapper ---- */
    var q2 = at(4, 14), tk = _rtsSpawnUnit('player', 'tank', q2[0], q2[1]);
    var es = _rtsSpawnUnit('enemy', 'sapper', q2[0] + RTS_TILE * 0.6, q2[1]);
    es.cool = 0; _rtsFire(es, tk, RTS_WEAPONS.satchel);
    es.dead = true;
    out.charged = !!tk.bomb;
    /* a moment in the blink when the light is on: the start of a cycle */
    var b = tk.bomb, hz = R3D_CHARGE.fast + (R3D_CHARGE.slow - R3D_CHARGE.fast) * (b.t / b.fuse);
    G.t = Math.ceil(G.t * hz) / hz + 0.01 / hz;
    var ly = _rtsElev(tk.x, tk.z) + 5, cx = tk.x + RTS_TILE * 9, cz = tk.z + RTS_TILE * 5, cy = _rtsElev(cx, cz);
    look(tk.x, tk.z);
    frame(); var on = grab(tk.x, ly, tk.z, 21), con = grab(cx, cy, cz, 21);
    R3.chargeOff = true; frame(); var off = grab(tk.x, ly, tk.z, 21), coff = grab(cx, cy, cz, 21); R3.chargeOff = false;
    out.light = differ(on, off, 20); out.ctl = differ(con, coff, 20);
    G.sel.length = 0; G.sel.push(tk); frame();
    out.selTxt = (document.getElementById('rtsSelTxt') || {}).textContent;
    G.sel.length = 0;

    /* ---- the Frogman in the water ---- */
    var wc = null;
    for (var j = 0; j < RTS_N * RTS_N && !wc; j++) if (G.terrain[j] === RTS_T_WATER && !(G.tideDry && G.tideDry[j])) wc = [j % RTS_N, (j / RTS_N) | 0];
    out.water = !!wc;
    if (wc) {
      var sw = _rtsSpawnUnit('player', 'frogman', _rtsWX(wc[0]), _rtsWX(wc[1]));
      out.sink = _r3dSwimSink(G, sw, rtsUnitDef('frogman'));
      out.landSink = _r3dSwimSink(G, fm, rtsUnitDef('frogman'));
      out.swimPx = drawn(sw);
      /* and it is the drawing that sinks him: stood up on the water, the picture changes */
      look(sw.x, sw.z); frame(); var sa = grab(sw.x, 1, sw.z, 25);
      var keepSink = R3D_SWIM_SINK; R3D_SWIM_SINK = 0; frame(); var sb = grab(sw.x, 1, sw.z, 25); R3D_SWIM_SINK = keepSink;
      out.sinkPx = differ(sa, sb);
    }
    return out;
  });
  S.ok('the Sapper, the Zealot, the Wrecker and the Frogman are drawn', Object.keys(o.drawn).every(function (k) { return o.drawn[k] > 20; }), JSON.stringify(o.drawn));
  S.ok('the staging: an enemy Sapper\'s charge on the player\'s tank', o.charged, '');
  S.ok('THE CHARGE BLINKS a red light over the tank', o.light > 8, o.light + ' px with the light and without');
  S.eq('...and nowhere else (control)', o.ctl, 0);
  S.ok('...and the tank\'s readout counts the fuse down', /a charge on it: \d+ s/.test(o.selTxt || ''), o.selTxt);
  S.ok('the staging: the map has open water', o.water, '');
  S.ok('HE SWIMS: a Frogman in the water is drawn lower, and on land is not', o.sink > 0.5 && o.landSink === 0, 'in water ' + o.sink + ', on land ' + o.landSink);
  S.ok('...and is still drawn there', o.swimPx > 10, o.swimPx + ' px');
  S.ok('...and it is the picture that is lower: stood up on the water, he is drawn differently', o.sinkPx > 20, o.sinkPx + ' px');
  var errs = g.errors.filter(function (e) { return !/ServiceWorker/.test(e); });
  S.ok('no page errors', !errs.length, errs.join(' | ') || 'none');
  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})();
