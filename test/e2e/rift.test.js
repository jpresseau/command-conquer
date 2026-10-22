/* THE RIFT ON THE PAGE (core/rift.js, sprites/rift.js, render3d/veil3d.js):

     DRAWN        the Rift Trooper, the Rift Harvester and the Veil Tank are drawn: the picture round
                  each differs with it hidden (R3.hideId)
     A TREE       an enemy Veil Tank the player has not found is not seen - and where it stands, a
                  tree is drawn (R3.veilOff takes the tree away for the A/B)
     THE BEAM     a Rift Trooper's shot is on the screen, and a square nine cells off is not changed
   The loop frozen, the staging asserted first. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('rift');

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
    function frame() { _rtsRFrame(0); _rtsRFrame(0); }
    function differ(a, b, cut) { var d = 0; for (var q = 0; q < a.length; q += 4) if (Math.abs(a[q] - b[q]) + Math.abs(a[q + 1] - b[q + 1]) + Math.abs(a[q + 2] - b[q + 2]) > (cut || 30)) d++; return d; }
    function at(dx, dz) { var q = _rtsNearestOpen(yd.tx + dx, yd.tz + dz, 8, null); return [_rtsWX(q[0]), _rtsWX(q[1])]; }
    function drawn(e) {
      var y = _rtsStandY(e.x, e.z) + 1;
      look(e.x, e.z); frame(); var a = grab(e.x, y, e.z, 25);
      R3.hideId = e.id; frame(); var b = grab(e.x, y, e.z, 25); R3.hideId = null;
      return differ(a, b);
    }
    var p = at(6, 8);
    var rt = _rtsSpawnUnit('player', 'rifttroop', p[0], p[1]);
    var hv = _rtsSpawnUnit('player', 'riftharv', p[0] + RTS_TILE * 5, p[1]);
    var vtm = _rtsSpawnUnit('player', 'veiltank', p[0] + RTS_TILE * 2, p[1] + RTS_TILE * 4);
    out.drawn = { rifttroop: drawn(rt), riftharv: drawn(hv), veiltank: drawn(vtm) };
    /* ---- an enemy Veil Tank, hidden ---- */
    var q2 = at(4, 14), vt = _rtsSpawnUnit('enemy', 'veiltank', q2[0], q2[1]);
    vt.veilT = 10;
    out.hidden = _rtsVeiled(vt) && !_rtsEntSeen(vt);
    var ty = _rtsElev(vt.x, vt.z) + 2.5;
    look(vt.x, vt.z); frame(); var withTree = grab(vt.x, ty, vt.z, 31);
    R3.veilOff = true; frame(); var noTree = grab(vt.x, ty, vt.z, 31); R3.veilOff = false;
    out.tree = differ(withTree, noTree);
    /* and the tank's own model is not drawn there: with the tree off, taking the tank out too changes
       nothing (a Veil Tank's model is drawn when it can be: out.drawn.veiltank, the population) */
    R3.veilOff = true; R3.hideId = vt.id; frame(); var bare = grab(vt.x, ty, vt.z, 31); R3.hideId = null; R3.veilOff = false;
    out.notTank = differ(noTree, bare);
    /* ---- the rift beam ---- */
    var tk = _rtsSpawnUnit('enemy', 'tank', rt.x + RTS_TILE * 2.5, rt.z + RTS_TILE * 1.5), fx0 = G.fx.length;
    rt.cool = 0; _rtsFire(rt, tk, RTS_WEAPONS.riftgun);
    var bm = G.fx.slice(fx0).filter(function (f) { return f.kind === 'beam' && f.rift; })[0];
    out.beam = !!bm && tk.erase > 0;
    if (bm) {
      var mx = (bm.x + bm.x2) / 2, mz = (bm.z + bm.z2) / 2, my = _rtsElev(mx, mz) + (bm.y + bm.y2) / 2, keep = G.fx.slice();
      var cx = mx + RTS_TILE * 9, cz = mz + RTS_TILE * 5, cy = _rtsElev(cx, cz);
      look(mx, mz);
      frame(); var a = grab(mx, my, mz, 21), ca = grab(cx, cy, cz, 21);
      G.fx = keep.filter(function (f) { return f !== bm; }); frame(); var b = grab(mx, my, mz, 21), cb = grab(cx, cy, cz, 21);
      G.fx = keep;
      out.beamPx = differ(a, b, 20); out.ctlPx = differ(ca, cb, 20);
    }
    return out;
  });
  S.ok('the Rift Trooper, the Rift Harvester and the Veil Tank are drawn', Object.keys(o.drawn).every(function (k) { return o.drawn[k] > 20; }), JSON.stringify(o.drawn));
  S.ok('the staging: an enemy Veil Tank, hidden from the player', o.hidden, '');
  S.ok('A TREE STANDS WHERE IT IS', o.tree > 40, o.tree + ' px differ with the tree and without');
  S.eq('...and not the tank: with the tree off, nothing of it is left to take away', o.notTank, 0);
  S.ok('a Rift Trooper\'s shot pushes its target out of time and draws its beam', o.beam, '');
  S.ok('THE BEAM IS ON THE SCREEN', o.beamPx > 8, o.beamPx + ' px');
  S.eq('...and nowhere else (control)', o.ctlPx, 0);
  var errs = g.errors.filter(function (e) { return !/ServiceWorker/.test(e); });
  S.ok('no page errors', !errs.length, errs.join(' | ') || 'none');
  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})();
