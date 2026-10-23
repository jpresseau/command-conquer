/* THE ECONOMY ON THE PAGE (core/econ.js, sprites/econ.js):

     DRAWN        the War Harvester, the Assay Plant, the Foundry and the Clone Vats are drawn: the
                  picture round each differs with it hidden (R3.hideId)
     THE PRICE    with a Foundry standing, the sidebar's tank tile says the lower price
   The loop frozen, the staging asserted first. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('econ');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 1000, height: 700 });
  await g.page.evaluate(function () { window._RTS_ARMY = 'soviet'; });
  await g.start(7, 1, { freeze: true });
  var o = await g.page.evaluate(function () {
    var G = window._rtsG, R = _rtsR, R3 = window._R3D, gl = R3.gl, yd = _rtsHas('player', 'yard'), out = {}, T = RTS_TILE;
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
    function drawn(e, up) {
      var y = _rtsStandY(e.x, e.z) + (up || 1.5);
      var n = e.type === 'struct' ? 51 : 25;             /* a building's middle can be open apron */
      look(e.x, e.z); frame(); var a = grab(e.x, y, e.z, n);
      /* a building out of the picture by being gone for a frame: R3.hideId does not reach every
         building's draw (measured: a 2x2 drew the same with it set) */
      if (e.type === 'struct') { e.dead = true; frame(); var b = grab(e.x, y, e.z, n); e.dead = false; }
      else { R3.hideId = e.id; frame(); b = grab(e.x, y, e.z, n); R3.hideId = null; }
      return differ(a, b);
    }
    function place(key, dx, dz) {
      var b = null;
      for (var r = 0; r < 14 && !b; r++) for (var a = 0; a < 8 && !b; a++) b = _rtsPlaceStruct('player', key, yd.tx + dx + Math.round(Math.cos(a * 0.785) * r), yd.tz + dz + Math.round(Math.sin(a * 0.785) * r), true);
      if (b) b.building = 0;
      return b;
    }
    var q = _rtsNearestOpen(yd.tx + 6, yd.tz + 10, 8, null);
    var wh = _rtsSpawnUnit('player', 'warharv', _rtsWX(q[0]), _rtsWX(q[1]));
    wh.hstate = null; wh.order = 'hold';
    out.drawn = { warharv: drawn(wh) };
    /* a sidebar tile's price before the Foundry */
    function price() { var b = _rtsUI.btns && _rtsUI.btns.tank, c = b && b.querySelector('.ct'); return c ? c.textContent : ''; }
    rtsTab('vehicle');
    frame(); out.before = price();
    ['assay', 'foundry', 'vats'].forEach(function (k, n) {
      var b = place(k, -8 + n * 5, 8);
      out['placed_' + k] = !!b;
      if (b) out.drawn[k] = drawn(b, 5);
    });
    frame(); out.after = price();
    return out;
  });
  S.ok('the staging: the three buildings placed', o.placed_assay && o.placed_foundry && o.placed_vats, JSON.stringify(o));
  S.ok('the War Harvester, the Assay Plant, the Foundry and the Clone Vats are drawn', ['warharv', 'assay', 'foundry', 'vats'].every(function (k) { return o.drawn[k] > 20; }), JSON.stringify(o.drawn));
  S.ok('THE PRICE: with a Foundry standing, the sidebar\'s tank tile says the lower price', /600/.test(o.after || '') && /800/.test(o.before || ''), JSON.stringify([o.before, o.after]));
  var errs = g.errors.filter(function (e) { return !/ServiceWorker/.test(e); });
  S.ok('no page errors', !errs.length, errs.join(' | ') || 'none');
  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})();
