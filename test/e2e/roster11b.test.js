/* BATCH 11b ON THE PAGE (rules/roster11.js, sprites/roster11.js, core/marshal.js, the soldiers' kit):

     DRAWN        the Multi-role Carrier, the Leech Drone, the Marshal, a Strike Jet and the Gate are
                  drawn: the picture round each differs with it hidden (R3.hideId for a unit; a
                  building gone for a frame), and a square nine cells off does not
     THE LASE     a Marshal's mark is a beam on the screen, and it is red
   The loop frozen, the staging asserted first. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('roster11b');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 1000, height: 700 });
  await g.page.evaluate(function () { window._RTS_ARMY = 'soviet'; });   /* the Marshal is the Dominion's */
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
    function drawn(e) {
      /* an aircraft where it is drawn: its altitude above the ground it is over (render/camera.js) */
      var st = e.type === 'struct', y = e.air ? _rtsElev(e.x, e.z) + _rtsAirLift(e) * RTS_AIR_ALT_K + 1 : _rtsStandY(e.x, e.z) + (st ? 3 : 1), n = st ? 51 : 25;
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
    [['ifv', 6, 8], ['leech', 9, 8], ['marshal', 6, 12], ['strikejet', 9, 12]].forEach(function (s) {
      var p = at(s[1], s[2]), u = _rtsSpawnUnit('player', s[0], p[0], p[1]);
      out.drawn[s[0]] = u ? drawn(u) : 0;
      if (u) u.dead = true;
    });
    var gt = null;
    for (var r = 0; r < 14 && !gt; r++) for (var a = 0; a < 8 && !gt; a++)
      gt = _rtsPlaceStruct('player', 'gate', yd.tx - 8 + Math.round(Math.cos(a * 0.785) * r), yd.tz + 8 + Math.round(Math.sin(a * 0.785) * r), true);
    out.placed = !!gt;
    if (gt) { gt.building = 0; out.drawn.gate = drawn(gt); }

    /* ---- the lase: a Marshal's mark on an enemy building ---- */
    var pw = null;
    for (r = 0; r < 14 && !pw; r++) for (a = 0; a < 8 && !pw; a++)
      pw = _rtsPlaceStruct('enemy', 'power', yd.tx + 2 + Math.round(Math.cos(a * 0.785) * r), yd.tz + 14 + Math.round(Math.sin(a * 0.785) * r), true);
    if (pw) {
      pw.building = 0;
      var p = at(_rtsTX(pw.x) - yd.tx - 5, _rtsTX(pw.z) - yd.tz), ms = _rtsSpawnUnit('player', 'marshal', p[0], p[1]), fx0 = G.fx.length;
      ms.cool = 0; _rtsFire(ms, pw, RTS_WEAPONS.lase);
      var bm = G.fx.slice(fx0).filter(function (f) { return f.kind === 'beam' && f.lase; })[0];
      out.beam = !!bm;
      /* the jets out of the picture: it is the beam that is measured */
      G.ents.forEach(function (e) { if (e.def === 'strikejet') e.dead = true; });
      if (bm) {
        var mx = (bm.x + bm.x2) / 2, mz = (bm.z + bm.z2) / 2, my = _rtsElev(mx, mz) + (bm.y + bm.y2) / 2, keep = G.fx.slice();
        look(mx, mz);
        frame(); var A = grab(mx, my, mz, 21);
        G.fx = keep.filter(function (f) { return f !== bm; }); frame(); var B = grab(mx, my, mz, 21);
        G.fx = keep;
        out.beamPx = differ(A, B, 20); out.beamRGB = shift(A, B);
      }
    }
    return out;
  });
  S.ok('the staging: a Gate placed', o.placed, '');
  S.ok('the Multi-role Carrier, the Leech Drone, the Marshal, a Strike Jet and the Gate are drawn', ['ifv', 'leech', 'marshal', 'strikejet', 'gate'].every(function (k) { return o.drawn[k] > 20; }), JSON.stringify(o.drawn));
  S.eq('...and nowhere else (control squares nine cells off)', o.ctl, 0);
  S.ok('THE LASE: a Marshal\'s mark is a beam on the screen', o.beam && o.beamPx > 8, o.beamPx + ' px');
  S.ok('...and it is red', o.beamRGB && o.beamRGB[0] > 1.5 * Math.max(o.beamRGB[1], o.beamRGB[2], 1), JSON.stringify(o.beamRGB));
  var errs = g.errors.filter(function (e) { return !/ServiceWorker/.test(e); });
  S.ok('no page errors', !errs.length, errs.join(' | ') || 'none');
  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})();
