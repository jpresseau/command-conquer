/* TOWNS, GARRISONS AND DIGGING IN on the real page (core/garrison.js, core/dig.js, sprites/town.js,
   render3d/dig3d.js, the TOWNS row of the skirmish setup):

     THE SETUP    the title's skirmish setup has a TOWNS row; picking TOWNS says so on the button,
                  and START BATTLE lays the town
     DRAWN        each kind of town building is drawn: the picture round it differs with it hidden
     A RIGHT-CLICK three squads selected and right-clicked onto a cottage go in - the order the
                  player gives, through _rtsRightClick - and the readout says how many are inside
     THE ROOF     a held house wears its holder's colour: its roof is drawn differently held and empty
     UNLOAD       the sidebar's UNLOAD shows for the held house, and puts them out
     DIG IN       the DEPLOY button says DIG IN for a Compact rifle squad, and a dug-in squad has its
                  sandbags drawn (R3.digOff for the A/B)
   The loop frozen, every staging asserted first. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('garrison');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 1000, height: 700 });
  var p = g.page;

  /* ---- the setup, on the title ---- */
  var setup = await p.evaluate(function () {
    rtsSetArmySide('allied');
    var box = document.getElementById('rtsSkirmish');
    if (box && box.hidden) rtsSkirmishToggle();
    var row = document.querySelector('#rtsSkirmish .diff[data-k="town"]');
    var btn = row && row.querySelector('button[data-v="towns"]');
    if (btn) btn.click();
    var note = (document.getElementById('rtsSkirmishNote') || {}).textContent || '';
    return { row: !!row, n: row ? row.querySelectorAll('button').length : 0, on: btn ? btn.className : '', note: note };
  });
  /* NONE, TOWNS, and TOWNS + TECH (core/tech.js) */
S.ok('the skirmish setup has a TOWNS row with three choices', setup.row && setup.n === 3, JSON.stringify(setup));
  S.ok('...and picking TOWNS says so on the button', setup.on === 'on' && /towns/.test(setup.note), setup.note);

  await g.start(7, 1, { freeze: true });
  var o = await p.evaluate(function () {
    var G = window._rtsG, R = _rtsR, R3 = window._R3D, gl = R3.gl, out = {};
    for (var i = 0; i < RTS_N * RTS_N; i++) { G.mapped[i] = 1; G.vis[i] = 1; }
    function look(x, z, zi) { R.focus.x = x; R.focus.z = z; R.zi = zi == null ? RTS_ZOOMS.length - 2 : zi; _rtsApplyCam(); }
    function grab(x, y, z, n) {
      var s = _rtsWorldToScreen(x, y, z), k = R3.cv.width / R.W, H = R3.cv.height, px = new Uint8Array(4 * n * n), h = (n - 1) / 2;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.readPixels(Math.round(s.x * k) - h, H - Math.round(s.y * k) - h, n, n, gl.RGBA, gl.UNSIGNED_BYTE, px);
      return px;
    }
    /* the loop is frozen, so the sidebar's own pass is run by hand as the loop would (ui/sidebar.js) */
    function frame() { _rtsRFrame(0); _rtsRFrame(0); _rtsSyncSidebar(0); }
    function differ(a, b, cut) { var d = 0; for (var q = 0; q < a.length; q += 4) if (Math.abs(a[q] - b[q]) + Math.abs(a[q + 1] - b[q + 1]) + Math.abs(a[q + 2] - b[q + 2]) > (cut || 30)) d++; return d; }
    function run(secs) { for (var t = 0; t < secs * 30; t++) _rtsTick(1 / 30); }
    var H = G.ents.filter(function (e) { return e.type === 'struct' && rtsStructDef(e.def).civ; });
    out.kinds = {};
    H.forEach(function (h) { out.kinds[h.def] = (out.kinds[h.def] || 0) + 1; });
    /* ---- each kind drawn ---- */
    out.drawn = {};
    Object.keys(out.kinds).forEach(function (k) {
      var h = H.filter(function (x) { return x.def === k; })[0], y = _rtsElev(h.x, h.z) + 2;
      look(h.x, h.z); frame(); var a = grab(h.x, y, h.z, 31);
      R3.hideId = h.id; frame(); var b = grab(h.x, y, h.z, 31); R3.hideId = null;
      out.drawn[k] = differ(a, b);
    });
    /* ---- three squads, right-clicked onto a cottage ---- */
    var C = H.filter(function (h) { return h.def === 'cottage'; })[0];
    var sq = [0, 1, 2].map(function (k) { return _rtsSpawnUnit('player', 'rifle', C.x - RTS_TILE * 3, C.z + RTS_TILE * (k - 1)); });
    G.sel.length = 0; sq.forEach(function (u) { G.sel.push(u); });
    look(C.x, C.z);
    var sc = _rtsWorldToScreen(C.x, 1, C.z);
    out.picked = (_rtsPickAt(sc.x, sc.y) || {}).ent === C;
    _rtsRightClick(sc.x, sc.y);
    out.orders = sq.filter(function (u) { return u.order === 'board' && u.target === C; }).length;
    out.said = G.msg;
    run(15);
    out.inside = _rtsCargoCount(C); out.side = C.side;
    G.sel.length = 0; G.sel.push(C);
    frame();
    out.readout = (document.getElementById('rtsSelTxt') || {}).textContent;
    var ub = document.getElementById('rtsUnloadBtn');
    out.unloadShown = !!ub && !ub.hidden;
    /* ---- the roof: held, then empty, the same moment ---- */
    var ry = _rtsElev(C.x, C.z) + 3.5;
    look(C.x, C.z, RTS_ZOOMS.length - 1); frame();
    var held = grab(C.x, ry, C.z, 21);
    C.side = 'civ'; frame(); var empty = grab(C.x, ry, C.z, 21); C.side = 'player';
    out.roof = differ(held, empty);
    /* ---- UNLOAD ---- */
    if (ub) ub.click();
    out.out = sq.filter(function (u) { return !u.dead && !u.inside; }).length;
    out.sideAfter = C.side;
    /* ---- dig in ---- */
    var r = sq[0];
    G.sel.length = 0; G.sel.push(r); frame();
    var db = document.getElementById('rtsDeployBtn');
    out.digLabel = db && !db.hidden ? db.textContent : '(hidden)';
    if (db) db.click();
    out.dug = r.dug;
    look(r.x, r.z, RTS_ZOOMS.length - 1);
    var yy = _rtsStandY(r.x, r.z) + 0.3;
    frame(); var withBags = grab(r.x, yy, r.z, 121);
    R3.digOff = true; frame(); var noBags = grab(r.x, yy, r.z, 121); R3.digOff = false;
    out.bags = differ(withBags, noBags);
    return out;
  });

  S.ok('START BATTLE with TOWNS lays a town: a hall, flats and cottages',
       o.kinds.hall >= 1 && o.kinds.flats >= 1 && o.kinds.cottage >= 1, JSON.stringify(o.kinds));
  S.ok('each kind of town building is drawn', Object.keys(o.drawn).length === 3 && Object.keys(o.drawn).every(function (k) { return o.drawn[k] > 40; }),
       JSON.stringify(o.drawn));
  S.ok('the staging: the cottage is under the cursor', o.picked, '');
  S.eq('A RIGHT-CLICK ON THE COTTAGE sends all three in', o.orders, 3);
  S.ok('...and says so', /garrisoning the Cottage/i.test(o.said || ''), JSON.stringify(o.said));
  S.ok('...they go in, and it is the player\'s', o.inside === 3 && o.side === 'player', o.inside + ' inside, ' + o.side);
  S.ok('the readout says how many are inside', /3\/3 squads inside/.test(o.readout || ''), JSON.stringify(o.readout));
  S.ok('THE ROOF WEARS ITS HOLDER\'S COLOUR: drawn differently held and empty', o.roof > 40, o.roof + ' px');
  S.ok('UNLOAD shows for the held house, and puts them out', o.unloadShown && o.out === 3 && o.sideAfter === 'civ',
       'shown ' + o.unloadShown + ', ' + o.out + ' out, ' + o.sideAfter);
  S.eq('the DEPLOY button says DIG IN for a Compact rifle squad', o.digLabel, 'DIG IN');
  S.eq('...and digs it in', o.dug, 1);
  S.ok('A DUG-IN SQUAD HAS ITS SANDBAGS DRAWN', o.bags > 30, o.bags + ' px differ with them and without');
  var errs = g.errors.filter(function (e) { return !/ServiceWorker/.test(e); });
  S.ok('no page errors', !errs.length, errs.join(' | ') || 'none');
  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})();
