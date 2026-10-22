/* MIND CONTROL ON THE PAGE (core/mind.js, sprites/mind.js, the violet link in render3d/fxemit3d.js):

     DRAWN        the Mentalist, the Drone Tank, the Relay Hub and the Echo Sensor are drawn: the
                  picture round each differs with it hidden (R3.hideId)
     THE LINK     a Mentalist takes a tank: the violet link is on the screen half-way along it, and a
                  square nine cells away is the same with it and without (the control)
     THE READOUT  the taken tank, selected, says it is held; a Drone Tank with no hub says offline
   The loop frozen, the staging asserted first. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('mind');

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
    function at(dx, dz) { return _rtsNearestOpen(yd.tx + dx, yd.tz + dz, 8, null); }
    function drawn(e, y, n) {
      look(e.x, e.z); frame(); var a = grab(e.x, y, e.z, n);
      R3.hideId = e.id; frame(); var b = grab(e.x, y, e.z, n); R3.hideId = null;
      return differ(a, b);
    }
    var q = at(9, 2), hub = _rtsPlaceStruct('player', 'relayhub', q[0], q[1], true); hub.building = 0;
    q = at(14, 2); var ec = _rtsPlaceStruct('enemy', 'echo', q[0], q[1], true); ec.building = 0;
    q = at(5, 10); var dt = _rtsSpawnUnit('player', 'dronetank', _rtsWX(q[0]), _rtsWX(q[1]));
    var mm = _rtsSpawnUnit('enemy', 'mentalist', dt.x + RTS_TILE * 4, dt.z + RTS_TILE);
    out.drawn = {
      relayhub: drawn(hub, _rtsElev(hub.x, hub.z) + 2, 31), echo: drawn(ec, _rtsElev(ec.x, ec.z) + 2, 31),
      dronetank: drawn(dt, _rtsStandY(dt.x, dt.z) + 1, 25), mentalist: drawn(mm, _rtsStandY(mm.x, mm.z) + 1, 25)
    };
    /* ---- the link ---- */
    var tk = _rtsSpawnUnit('player', 'tank', dt.x + RTS_TILE, dt.z + RTS_TILE * 4);
    var fx0 = G.fx.length;
    mm.cool = 0; _rtsFire(mm, tk, RTS_WEAPONS.mindlink);
    out.taken = tk.side;
    var lk = G.fx.slice(fx0).filter(function (f) { return f.kind === 'beam' && f.mind; })[0];
    out.link = !!lk;
    if (lk) {
      var mx = (lk.x + lk.x2) / 2, mz = (lk.z + lk.z2) / 2, my = _rtsElev(mx, mz) + (lk.y + lk.y2) / 2;
      var cx = mx + RTS_TILE * 9, cz = mz + RTS_TILE * 5, cy = _rtsElev(cx, cz), keep = G.fx.slice();
      look(mx, mz);
      G.fx = keep; frame(); var a = grab(mx, my, mz, 21), ca = grab(cx, cy, cz, 21);
      G.fx = keep.filter(function (f) { return f !== lk; }); frame(); var b = grab(mx, my, mz, 21), cb = grab(cx, cy, cz, 21);
      G.fx = keep;
      out.linkPx = differ(a, b, 20); out.ctlPx = differ(ca, cb, 20);
      /* violet: more red and blue than green, in the pixels the link changed */
      var vr = 0, vg = 0, vb = 0, n = 0;
      for (var p = 0; p < a.length; p += 4) if (Math.abs(a[p] - b[p]) + Math.abs(a[p + 1] - b[p + 1]) + Math.abs(a[p + 2] - b[p + 2]) > 20) { vr += a[p]; vg += a[p + 1]; vb += a[p + 2]; n++; }
      out.violet = n ? [Math.round(vr / n), Math.round(vg / n), Math.round(vb / n)] : null;
    }
    /* ---- the readout ---- */
    G.sel.length = 0; G.sel.push(tk); frame();
    out.heldTxt = (document.getElementById('rtsSelTxt') || {}).textContent;
    hub.dead = true; _rtsFootprint(hub, false);
    _rtsOffline(dt);
    G.sel.length = 0; G.sel.push(dt); frame();
    out.offTxt = (document.getElementById('rtsSelTxt') || {}).textContent;
    return out;
  });
  S.ok('the Mentalist, the Drone Tank, the Relay Hub and the Echo Sensor are drawn',
       Object.keys(o.drawn).every(function (k) { return o.drawn[k] > 20; }), JSON.stringify(o.drawn));
  S.ok('the staging: the Mentalist took the tank and pushed its link', o.taken === 'enemy' && o.link, o.taken + ' ' + o.link);
  S.ok('THE LINK IS ON THE SCREEN', o.linkPx > 8, o.linkPx + ' px');
  S.eq('...and nowhere else: a square nine cells off is the same with it and without (control)', o.ctlPx, 0);
  S.ok('...and it is violet: more red and blue than green', o.violet && o.violet[0] > o.violet[1] && o.violet[2] > o.violet[1], JSON.stringify(o.violet));
  S.ok('the taken tank, selected, says it is held', /held by a Mentalist/.test(o.heldTxt || ''), JSON.stringify(o.heldTxt));
  S.ok('a Drone Tank with no hub says it is offline', /offline/.test(o.offTxt || ''), JSON.stringify(o.offTxt));
  var errs = g.errors.filter(function (e) { return !/ServiceWorker/.test(e); });
  S.ok('no page errors', !errs.length, errs.join(' | ') || 'none');
  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})();
