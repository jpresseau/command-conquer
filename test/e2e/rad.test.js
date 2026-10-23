/* RADIATION ON THE PAGE (core/rad.js, sprites/rad.js, render3d/rad3d.js):

     DRAWN        the Blight Trooper and the Fission Reactor are drawn: the picture round each
                  differs with it hidden (R3.hideId)
     THE GLOW     a pool of poison glows green on the ground (R3.radOff takes it away for the A/B),
                  and a square nine cells off is not changed
     THE RAY      a Blight Trooper's shot is on the screen, and it is green
     DEPLOYED     selected and deployed, its readout says it is irradiating, and its button STOP
   The loop frozen, the staging asserted first. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('rad');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 1000, height: 700 });
  await g.page.evaluate(function () { window._RTS_ARMY = 'soviet'; });   /* the Blight Trooper deploys for the Dominion */
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
    /* of the pixels that changed, how many got greener than they got redder or bluer */
    function greener(a, b) {
      var n = 0, gn = 0;
      for (var q = 0; q < a.length; q += 4) {
        var dr = a[q] - b[q], dg = a[q + 1] - b[q + 1], db = a[q + 2] - b[q + 2];
        if (Math.abs(dr) + Math.abs(dg) + Math.abs(db) <= 20) continue;
        n++; if (dg > dr && dg > db) gn++;
      }
      return n ? gn / n : 0;
    }
    /* the mean change of each channel over the pixels that changed */
    function shift(a, b) {
      var n = 0, t = [0, 0, 0];
      for (var q = 0; q < a.length; q += 4) {
        var d = [a[q] - b[q], a[q + 1] - b[q + 1], a[q + 2] - b[q + 2]];
        if (Math.abs(d[0]) + Math.abs(d[1]) + Math.abs(d[2]) <= 20) continue;
        n++; t[0] += d[0]; t[1] += d[1]; t[2] += d[2];
      }
      return n ? t.map(function (v) { return Math.round(v / n); }) : [0, 0, 0];
    }
    function at(dx, dz) { var q = _rtsNearestOpen(yd.tx + dx, yd.tz + dz, 8, null); return [_rtsWX(q[0]), _rtsWX(q[1])]; }
    function drawn(e, up) {
      var y = _rtsStandY(e.x, e.z) + (up || 1);
      look(e.x, e.z); frame(); var a = grab(e.x, y, e.z, 25);
      R3.hideId = e.id; frame(); var b = grab(e.x, y, e.z, 25); R3.hideId = null;
      return differ(a, b);
    }
    var p = at(6, 8);
    var bl = _rtsSpawnUnit('player', 'blight', p[0], p[1]);
    var rc = _rtsPlaceStruct('player', 'reactor', yd.tx - 7, yd.tz + 6, true);
    out.placed = !!rc;
    if (rc) rc.building = 0;
    out.drawn = { blight: drawn(bl), reactor: rc ? drawn(rc, 6) : 0 };

    /* ---- a pool on open ground ---- */
    var q2 = at(4, 14), px = q2[0], pz = q2[1], py = _rtsElev(px, pz);
    _rtsRadPool(px, pz, RTS_WEAPONS.blightgun.rad, 'enemy');
    out.pool = (G.rads || []).length === 1;
    /* the breath at its brightest */
    G.t = (0.25 - 0.37 * 0) / R3D_RAD.hz + Math.ceil(G.t * R3D_RAD.hz) / R3D_RAD.hz;
    var cx = px + RTS_TILE * 9, cz = pz + RTS_TILE * 5, cy = _rtsElev(cx, cz);
    look(px, pz);
    frame(); var on = grab(px, py, pz, 31), con = grab(cx, cy, cz, 21);
    R3.radOff = true; frame(); var off = grab(px, py, pz, 31), coff = grab(cx, cy, cz, 21); R3.radOff = false;
    out.glow = differ(on, off, 20); out.glowGreen = greener(on, off); out.ctl = differ(con, coff, 20);
    G.rads.length = 0;

    /* ---- the ray ---- */
    var tk = _rtsSpawnUnit('enemy', 'tank', bl.x + RTS_TILE * 2.2, bl.z + RTS_TILE * 1.2), fx0 = G.fx.length;
    bl.cool = 0; _rtsFire(bl, tk, RTS_WEAPONS.blightgun);
    var bm = G.fx.slice(fx0).filter(function (f) { return f.kind === 'beam' && f.rad; })[0];
    out.ray = !!bm;
    if (bm) {
      var mx = (bm.x + bm.x2) / 2, mz = (bm.z + bm.z2) / 2, my = _rtsElev(mx, mz) + (bm.y + bm.y2) / 2, keep = G.fx.slice();
      G.rads.length = 0;                                /* the pool it left is not the ray */
      look(mx, mz);
      frame(); var a = grab(mx, my, mz, 21);
      G.fx = keep.filter(function (f) { return f !== bm; }); frame(); var b = grab(mx, my, mz, 21);
      G.fx = keep;
      out.rayPx = differ(a, b, 20); out.rayGreen = greener(a, b); out.rayRGB = shift(a, b);
    }
    tk.dead = true;

    /* ---- deployed ---- */
    _rtsDigToggle(bl);
    G.sel.length = 0; G.sel.push(bl); frame();
    out.selTxt = (document.getElementById('rtsSelTxt') || {}).textContent;
    out.army = rtsHouseSide('player'); out.dug = bl.dug;
    out.btn = _rtsDeployLabel([bl]);
    G.sel.length = 0;
    return out;
  });
  S.ok('the staging: a Fission Reactor placed', o.placed, '');
  S.ok('the Blight Trooper and the Fission Reactor are drawn', o.drawn.blight > 20 && o.drawn.reactor > 20, JSON.stringify(o.drawn));
  S.ok('the staging: a pool of poison', o.pool, '');
  S.ok('THE GLOW: poisoned ground glows', o.glow > 40, o.glow + ' px with the glow and without');
  S.ok('...green', o.glowGreen > 0.6, Math.round(o.glowGreen * 100) + '% of them greener');
  S.eq('...and nowhere else (control)', o.ctl, 0);
  S.ok('THE RAY: a Blight Trooper\'s shot is on the screen', o.ray && o.rayPx > 8, o.rayPx + ' px');
  /* measured: green [34,49,14]; the Lens Tower's own tint over the same ground [36,40,36] */
  S.ok('...and it is green', o.rayGreen > 0.9 && o.rayRGB[1] >= 1.25 * Math.max(o.rayRGB[0], o.rayRGB[2]), Math.round(o.rayGreen * 100) + '% of them greener, mean shift ' + JSON.stringify(o.rayRGB));
  S.ok('the staging: the player is the Dominion, and the trooper deployed', o.army === 'soviet' && o.dug === 1, o.army + ', dug ' + o.dug);
  S.ok('DEPLOYED, its readout says it is irradiating', /irradiating/.test(o.selTxt || ''), o.selTxt);
  S.ok('...and its button says STOP', /STOP/.test(o.btn || ''), o.btn);
  var errs = g.errors.filter(function (e) { return !/ServiceWorker/.test(e); });
  S.ok('no page errors', !errs.length, errs.join(' | ') || 'none');
  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})();
