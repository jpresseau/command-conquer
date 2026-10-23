/* TECH BUILDINGS ON THE PAGE (core/tech.js, sprites/tech.js, ui/select.js):

     DRAWN        the Oil Derrick, the Field Hospital, the Machine Shop and the Airstrip are drawn:
                  the picture round each differs with it gone for a frame, and a square nine cells
                  off does not
     TAKE IT      an Engineer selected and right-clicked on a tech building no one holds is sent to
                  take it, and the game says so; a rifleman right-clicked on it is only sent there
     THE BUTTON   the Airstrip taken, the superweapon row has a Paratroopers button
   The loop frozen, the staging asserted first. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('tech');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 1000, height: 700 });
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
    function frame() { _rtsRFrame(0); _rtsRFrame(0); _rtsSyncSidebar(0); _rtsSuperRow(); }
    function differ(a, b, cut) { var d = 0; for (var q = 0; q < a.length; q += 4) if (Math.abs(a[q] - b[q]) + Math.abs(a[q + 1] - b[q + 1]) + Math.abs(a[q + 2] - b[q + 2]) > (cut || 30)) d++; return d; }
    /* a building out of the picture by being gone for a frame (R3.hideId does not reach every
       building's draw: test/e2e/econ.test.js) */
    function drawn(e) {
      var y = _rtsStandY(e.x, e.z) + 1.5;
      look(e.x, e.z); frame(); var a = grab(e.x, y, e.z, 51);
      var cx = e.x + T * 9, cz = e.z + T * 5, cy = _rtsElev(cx, cz), ca = grab(cx, cy, cz, 21);
      e.dead = true; frame(); var b = grab(e.x, y, e.z, 51), cb = grab(cx, cy, cz, 21); e.dead = false;
      out.ctl = (out.ctl || 0) + differ(ca, cb, 20);
      return differ(a, b);
    }
    /* the first open place for `key` near (dx, dz) off the yard, as the setup's own search would */
    function place(key, dx, dz) {
      for (var r = 0; r < 14; r++) for (var a = 0; a < 8; a++) {
        var tx = yd.tx + dx + Math.round(Math.cos(a * 0.785) * r), tz = yd.tz + dz + Math.round(Math.sin(a * 0.785) * r);
        if (_rtsTownFits(key, tx, tz)) return _rtsPlaceCiv(key, tx, tz);
      }
      return null;
    }
    var B = {};
    _rtsCivSeat(G);                                    /* as the setup's towns make it (core/garrison.js) */
    [['derrick', -8, 9], ['hospital', -3, 9], ['mshop', 2, 9], ['airstrip', 7, 9]].forEach(function (s) { B[s[0]] = place(s[0], s[1], s[2]); });
    out.placed = Object.keys(B).filter(function (k) { return B[k] && B[k].side === 'civ'; });
    out.drawn = {};
    Object.keys(B).forEach(function (k) { if (B[k]) out.drawn[k] = drawn(B[k]); });

    /* ---- right-clicked: an Engineer, then a rifleman ---- */
    var d = B.derrick;
    if (d) {
      var q = _rtsNearestOpen(d.tx + 4, d.tz + 4, 8, null);
      var en = _rtsSpawnUnit('player', 'engineer', _rtsWX(q[0]), _rtsWX(q[1]));
      var rf = _rtsSpawnUnit('player', 'rifle', _rtsWX(q[0]) + T, _rtsWX(q[1]));
      function click(u) {
        G.sel.length = 0; G.sel.push(u); u.order = null; u.target = null;
        look(d.x, d.z); frame();
        var s = _rtsWorldToScreen(d.x, _rtsStandY(d.x, d.z) + 1, d.z), said = '', say = window._rtsSay;
        window._rtsSay = function (m) { said = m; return say.apply(this, arguments); };
        try { _rtsRightClickNow(s.x, s.y); } finally { window._rtsSay = say; }
        var r = { order: u.order, target: u.target && u.target.id === d.id, said: said };
        G.sel.length = 0;
        return r;
      }
      out.picked = (_rtsPickAt.apply(null, (function () { look(d.x, d.z); frame(); var s = _rtsWorldToScreen(d.x, _rtsStandY(d.x, d.z) + 1, d.z); return [s.x, s.y]; })()) || {}).ent === d;
      out.eng = click(en);
      out.rifle = click(rf);
      en.dead = rf.dead = true;
    }

    /* ---- the Airstrip taken ---- */
    var st = B.airstrip;
    if (st) {
      out.before = !!document.querySelector('#rtsSupers button[data-super="paradrop"]');
      var q3 = _rtsNearestOpen(st.tx - 2, st.tz - 2, 8, null), ce = _rtsSpawnUnit('player', 'engineer', _rtsWX(q3[0]), _rtsWX(q3[1]));
      out.took = _rtsCapture(ce, st);
      frame();
      var bt = document.querySelector('#rtsSupers button[data-super="paradrop"]');
      out.side = st.side; out.btn = bt ? bt.textContent : null;
    }
    return out;
  });
  S.eq('the staging: the four tech buildings placed, no one\'s', o.placed.length, 4);
  S.ok('the Oil Derrick, the Field Hospital, the Machine Shop and the Airstrip are drawn', ['derrick', 'hospital', 'mshop', 'airstrip'].every(function (k) { return o.drawn[k] > 20; }), JSON.stringify(o.drawn));
  S.eq('...and nowhere else (control squares nine cells off)', o.ctl, 0);
  S.ok('the staging: a click on the Derrick picks it', o.picked, '');
  S.ok('TAKE IT: an Engineer right-clicked on it is sent to take it', o.eng && o.eng.order === 'capture' && o.eng.target, JSON.stringify(o.eng));
  S.ok('...and the game says so', o.eng && /moving in/i.test(o.eng.said), o.eng && o.eng.said);
  S.ok('...and a rifleman is only sent there, not to fight it', o.rifle && o.rifle.order !== 'capture' && o.rifle.order !== 'attack', JSON.stringify(o.rifle));
  S.ok('THE BUTTON: none before the Airstrip is taken; after, a Paratroopers button', o.before === false && o.took !== false && o.side === 'player' && /Paratroopers/.test(o.btn || ''), JSON.stringify([o.before, o.side, o.btn]));
  var errs = g.errors.filter(function (e) { return !/ServiceWorker/.test(e); });
  S.ok('no page errors', !errs.length, errs.join(' | ') || 'none');
  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})();
