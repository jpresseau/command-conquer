/* BATCH 11a ON THE PAGE (rules/roster11.js, sprites/roster11.js, the soldiers' kit):

     DRAWN        the Marksman, the Tank Hunter, the Flak Trooper and the Long Gun are drawn: the
                  picture round each differs with it hidden (R3.hideId for a unit; a building gone
                  for a frame), and a square nine cells off does not
     THE SIDEBAR  the Compact's infantry tab offers the Marksman, its vehicle tab the Tank Hunter,
                  and its build tab the Long Gun (a Radar Post standing, which all three need)
   The loop frozen, the staging asserted first. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('roster11');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 1000, height: 700 });
  await g.start(7, 1, { freeze: true });
  var o = await g.page.evaluate(function () {
    var G = window._rtsG, R = _rtsR, R3 = window._R3D, gl = R3.gl, yd = _rtsHas('player', 'yard'), out = { ctl: 0 }, T = RTS_TILE;
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
    function drawn(e) {
      var st = e.type === 'struct', y = _rtsStandY(e.x, e.z) + (st ? 3 : 1), n = st ? 51 : 25;
      var cx = e.x + T * 9, cz = e.z + T * 5, cy = _rtsElev(cx, cz);
      look(e.x, e.z); frame(); var a = grab(e.x, y, e.z, n), ca = grab(cx, cy, cz, 21);
      if (st) e.dead = true; else R3.hideId = e.id;
      frame(); var b = grab(e.x, y, e.z, n), cb = grab(cx, cy, cz, 21);
      if (st) e.dead = false; else R3.hideId = null;
      out.ctl += differ(ca, cb, 20);
      return differ(a, b);
    }
    function at(dx, dz) { var q = _rtsNearestOpen(yd.tx + dx, yd.tz + dz, 8, null); return [_rtsWX(q[0]), _rtsWX(q[1])]; }
    out.drawn = {};
    [['marksman', 6, 8], ['flakman', 9, 8], ['hunter', 6, 12]].forEach(function (s) {
      var p = at(s[1], s[2]), u = _rtsSpawnUnit('player', s[0], p[0], p[1]);
      out.drawn[s[0]] = u ? drawn(u) : 0;
      if (u) u.dead = true;
    });
    var L = null;
    for (var r = 0; r < 14 && !L; r++) for (var a = 0; a < 8 && !L; a++)
      L = _rtsPlaceStruct('player', 'longgun', yd.tx - 8 + Math.round(Math.cos(a * 0.785) * r), yd.tz + 8 + Math.round(Math.sin(a * 0.785) * r), true);
    out.placed = !!L;
    if (L) { L.building = 0; out.drawn.longgun = drawn(L); }

    /* the sidebar: is each one's tile there, on its tab (the player is the Compact) */
    out.army = rtsHouseSide('player');
    var rd = null;
    for (var r2 = 0; r2 < 14 && !rd; r2++) for (var a2 = 0; a2 < 8 && !rd; a2++)
      rd = _rtsPlaceStruct('player', 'radar', yd.tx + 8 + Math.round(Math.cos(a2 * 0.785) * r2), yd.tz - 6 + Math.round(Math.sin(a2 * 0.785) * r2), true);
    if (rd) rd.building = 0;
    out.radar = !!rd;
    function tile(tab, key) { rtsTab(tab); frame(); return !!(_rtsUI.btns && _rtsUI.btns[key] && document.body.contains(_rtsUI.btns[key])); }
    out.tiles = { marksman: tile('infantry', 'marksman'), hunter: tile('vehicle', 'hunter'), longgun: tile('struct', 'longgun') };
    return out;
  });
  S.ok('the staging: a Long Gun placed', o.placed, '');
  S.ok('the Marksman, the Flak Trooper, the Tank Hunter and the Long Gun are drawn', ['marksman', 'flakman', 'hunter', 'longgun'].every(function (k) { return o.drawn[k] > 20; }), JSON.stringify(o.drawn));
  S.eq('...and nowhere else (control squares nine cells off)', o.ctl, 0);
  S.ok('the staging: the player is the Compact, with a Radar Post', o.army === 'allied' && o.radar, o.army + ', radar ' + o.radar);
  S.ok('THE SIDEBAR offers the Marksman, the Tank Hunter and the Long Gun on their tabs', o.tiles.marksman && o.tiles.hunter && o.tiles.longgun, JSON.stringify(o.tiles));
  var errs = g.errors.filter(function (e) { return !/ServiceWorker/.test(e); });
  S.ok('no page errors', !errs.length, errs.join(' | ') || 'none');
  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})();
