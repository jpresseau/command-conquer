/* THE CORNERS OF MAP NAVIGATION - ui/navigate.js. e2e/navigate is the main line, e2e/navtouch
   the fingers; this is what two review rounds found at the edges, each a case a player reaches:

     CHORDS             a left press while a right grab holds the pointer is not a click on the
                        battlefield at off-screen numbers; a second grab button does not replace
                        the first, so the menu after a right drag is still eaten
     AS PRESSED         a still right-click on an enemy that dies before the release moves to its
                        ground rather than attacking a corpse
     THE WHEEL          a Mac mouse click (4.000244 px) is a whole notch; in 2D a turn back
                        starts the sum clean, with no key involved
     ONE BIG FRAME      a zoom of four rungs taken in a single slow frame keeps the point under the
                        cursor - on the steepest hillside
     SAFARI             a trackpad pinch sent as GestureEvents zooms the map, not the page
     THE A-MOVE LATCH   the touch bar's latched attack-move survives the window losing focus */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('navedge');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 900, height: 640, dpr: 1 });
  await g.start(7, 20, { freeze: true, mode3d: true });
  var P = g.page, M0 = g.page.mouse;
  await P.evaluate(function () { window.__wheels = 0; document.addEventListener('wheel', function () { window.__wheels++; }); });
  var M = {
    move: M0.move.bind(M0), down: M0.down.bind(M0), up: M0.up.bind(M0),
    wheel: async function (dx, dy) {
      var n = await P.evaluate(function () { return window.__wheels; });
      await M0.wheel(dx, dy);
      await P.waitForFunction(function (n) { return window.__wheels > n; }, n, { timeout: 10000 });
    }
  };
  var on = await P.evaluate(function () { return !!(window._R3D && window._R3D.on); });
  S.ok('the 3D mode is available to check', on, on ? 'on' : 'no WebGL');

  function park(zi) {
    return P.evaluate(function (zi) {
      var R = _rtsR, G = window._rtsG, U = window._rtsUI, i;
      for (i = 0; i < RTS_N * RTS_N; i++) { G.mapped[i] = 1; G.vis[i] = 1; }
      U.mode = null; U.keys = {}; U.zkBy = {}; U.zAcc = 0; U.attackMove = false; U.grab = null; U.eatCtx = false; U.drag = null;
      R.focus.x = _rtsWX(RTS_N / 2); R.focus.z = _rtsWX(RTS_N / 2);
      R.zi = zi; _rtsApplyCam(); _rtsClampFocus();
      var u = null;
      G.ents.forEach(function (e) { if (!u && e.side === 'player' && e.type === 'unit' && !e.dead && !e.inside) u = e; });
      G.sel.length = 0;
      if (u) { G.sel.push(u); u.order = null; u.path = null; u.goal = null; }
      return !!u;
    }, zi);
  }
  function state() {
    return P.evaluate(function () {
      var R = _rtsR, G = window._rtsG, U = window._rtsUI, u = G.sel[0];
      return { zt: R.zt, zf: R.zf, zi: R.zi, fx: R.focus.x, fz: R.focus.z, sel: G.sel.length, drag: !!U.drag,
               grab: !!U.grab, eat: !!U.eatCtx, order: u ? u.order : null, goal: u && u.goal ? { x: u.goal.x, z: u.goal.z } : null,
               am: !!U.attackMove };
    });
  }
  function slip(w, x, y) {
    return P.evaluate(function (a) { var s = _rtsGroundToScreen(a[0].x, a[0].z); return +Math.hypot(s.x - a[1], s.y - a[2]).toFixed(2); }, [w, x, y]);
  }

  if (on) {
    /* ---------------- CHORDS ---------------- */
    await park(2);
    var s0 = await state();
    await M.move(430, 330); await M.down({ button: 'right' });
    await M.move(330, 260); await M.move(760, 260);              /* moved, and out over the sidebar */
    await M.down({ button: 'left' }); await M.up({ button: 'left' });
    var s1 = await state();
    await M.up({ button: 'right' });
    S.ok('a left press while a right grab holds the pointer starts nothing on the battlefield',
         !s1.drag && s1.sel === s0.sel && s1.grab, 'drag ' + s1.drag + ', selected ' + s0.sel + ' -> ' + s1.sel + ', grab live ' + s1.grab);
    await park(2);
    await M.move(430, 330); await M.down({ button: 'right' });
    await M.move(330, 260);
    await M.down({ button: 'middle' }); await M.up({ button: 'middle' });
    await M.up({ button: 'right' });
    var s2 = await state();
    S.ok('a middle press during a right drag leaves the right drag in charge: its menu is still eaten',
         s2.eat && !s2.grab && !s2.order, 'menu armed ' + s2.eat + ', grab live ' + s2.grab + ', order ' + s2.order);

    /* a wheel turned in the middle of a right drag: the glide goes on while the cursor moves, and
       the ground being dragged stays under it */
    await park(2);
    await M.move(430, 330); await M.down({ button: 'right' });
    await M.move(410, 316);
    var wg = await P.evaluate(function () { var w = _rtsGroundAt(410, 316); return { x: w.x, z: w.z }; });
    await M.wheel(0, -100);
    for (var q = 1; q <= 6; q++) {
      await M.move(410 - 18 * q, 316 - 11 * q);
      await P.evaluate(function () { for (var i = 0; i < 3; i++) { _rtsZoomTick(1 / 60); _rtsClampFocus(); } });
    }
    await P.evaluate(function () { for (var i = 0; i < 90; i++) { _rtsZoomTick(1 / 60); _rtsClampFocus(); } });
    var sg = await slip(wg, 302, 250), zg = (await state()).zf;
    await M.up({ button: 'right' });
    S.ok('a wheel turned mid-drag zooms, and the dragged ground stays under the cursor', Math.abs(zg - 2 - 1 / 3) < 0.01 && sg < 2,
         'rung ' + zg.toFixed(3) + ', ' + sg + ' px off');

    /* + held in the middle of a right drag, off the screen's centre: the zoom pivots on the grip */
    await park(2);
    await M.move(430, 330); await M.down({ button: 'right' });
    await M.move(470, 200);
    var wk = await P.evaluate(function () { var w = _rtsGroundAt(470, 200); return { x: w.x, z: w.z }; });
    await P.keyboard.down('Equal');
    await P.evaluate(function () { for (var i = 0; i < 6; i++) { _rtsPanTick(0.1); _rtsZoomTick(0.1); _rtsClampFocus(); } });
    await P.keyboard.up('Equal');
    await P.evaluate(function () { for (var i = 0; i < 90; i++) { _rtsZoomTick(1 / 60); _rtsClampFocus(); } });
    var sk = await slip(wk, 470, 200), zk = (await state()).zf;
    await M.up({ button: 'right' });
    S.ok('+ held mid-drag zooms about the grip, not the screen\'s centre', zk > 2.9 && sk < 2, 'rung ' + zk.toFixed(3) + ', ' + sk + ' px off');

    /* ---------------- AS PRESSED, ON SOMETHING THAT DIES ---------------- */
    await park(2);
    var foe = await P.evaluate(function () {
      var R = _rtsR, G = window._rtsG, T = RTS_TILE, key = null;
      RTS_UNITS.forEach(function (u) { if (!key && u.kind === 'vehicle' && !u.harvest && !u.naval) key = u.key; });
      var open = _rtsNearestOpen(RTS_N / 2 + 3, RTS_N / 2 + 2, 12), e = open && _rtsSpawnUnit('enemy', key, _rtsWX(open[0]), _rtsWX(open[1]));
      if (!e) return null;
      var s = _rtsGroundToScreen(e.x, e.z), hit = _rtsPickAt(s.x, s.y);
      return { id: e.id, x: s.x, y: s.y, picked: !!(hit && hit.ent === e), gx: hit.x, gz: hit.z };
    });
    S.ok('an enemy on screen, and the pick names it', !!foe && foe.picked, JSON.stringify(foe));
    if (foe) {
      await M.move(foe.x, foe.y); await M.down({ button: 'right' });
      await P.evaluate(function (id) { var e = window._rtsG.ents.filter(function (x) { return x.id === id; })[0]; if (e) _rtsKill(e); }, foe.id);
      await M.up({ button: 'right' });
      var s3 = await state();
      S.ok('a right-click pressed on an enemy that died before the release moves to its ground, not onto a corpse',
           s3.order === 'move' && !!s3.goal && Math.hypot(s3.goal.x - foe.gx, s3.goal.z - foe.gz) < 40,
           'order ' + s3.order + (s3.goal ? ', goal ' + Math.hypot(s3.goal.x - foe.gx, s3.goal.z - foe.gz).toFixed(1) + ' from the press' : ''));
    }

    /* ---------------- THE WHEEL: A MAC MOUSE CLICK ---------------- */
    await park(2);
    await M.move(450, 320);
    await M.wheel(0, -4.000244140625);
    var s4 = await state();
    S.ok('a Mac mouse click (4.000244 px) is a whole notch in 3D', Math.abs(s4.zt - 2 - 1 / 3) < 1e-9, 'target rung ' + s4.zt);

    /* A GESTURE'S CLICK SIZE GOES WITH IT: a trackpad swipe that opened with 42 px, then a new one
       opening small - a 42 px delta later in that stream is in proportion, not a whole notch */
    await park(2);
    await P.evaluate(function () { RTS_WHEEL_QUIET = 0; });              /* each of these opens a gesture */
    await M.wheel(0, -42); await M.wheel(0, -8);
    await P.evaluate(function () { RTS_WHEEL_QUIET = 60000; });          /* and this one is inside it */
    var zq = (await state()).zt;
    await M.wheel(0, -42);
    var dq = (await state()).zt - zq;
    await P.evaluate(function () { RTS_WHEEL_QUIET = 150; });
    S.ok('a click size from one gesture is not carried into the next', Math.abs(dq - 0.42 / 3) < 1e-6,
         'the 42 px delta moved ' + dq.toFixed(4) + ' rungs (in proportion: ' + (0.42 / 3).toFixed(4) + ', a notch: 0.3333)');

    /* ---------------- ONE BIG FRAME, ON A HILLSIDE ---------------- */
    await park(0);
    var big = await P.evaluate(function () {
      var R = _rtsR, T = RTS_TILE, best = null, bs = 0;
      for (var tz = 10; tz < RTS_N - 10; tz++) for (var tx = 10; tx < RTS_N - 10; tx++) {
        var x = _rtsWX(tx), z = _rtsWX(tz);
        var gr = Math.hypot(_rtsElev(x + T, z) - _rtsElev(x - T, z), _rtsElev(x, z + T) - _rtsElev(x, z - T)) / (2 * T);
        if (gr > bs) { bs = gr; best = { x: x, z: z }; }
      }
      R.focus.x = best.x - 6 * T; R.focus.z = best.z - 4 * T; _rtsClampFocus();
      var s = _rtsGroundToScreen(best.x, best.z), w = _rtsGroundAt(s.x, s.y);
      _rtsZoomToward(RTS_ZOOMS.length - 1, s.x, s.y);
      _rtsZoomTick(0.1);                               /* one hitch frame takes the whole glide */
      return { slope: bs, x: s.x, y: s.y, w: w && { x: w.x, z: w.z }, zf: R.zf, top: RTS_ZOOMS.length - 1 };
    });
    var sb = await slip(big.w, big.x, big.y);
    S.ok('a whole-ladder zoom in one slow frame, on the steepest ground', big.zf === big.top && big.slope > 0.2,
         'rung ' + big.zf + ' of ' + big.top + ', slope ' + big.slope.toFixed(2));
    S.ok('...keeps the point under the cursor', sb < 2, sb + ' px from the cursor');

    /* ---------------- SAFARI'S PINCH ---------------- */
    /* Chromium has no GestureEvent, so these two are made by hand with Safari's fields */
    await park(2);
    var ges = await P.evaluate(function () {
      var cv = document.getElementById('rtsCv'), r = cv.getBoundingClientRect(), x = r.left + 420, y = r.top + 240;
      function fire(type, sc) {
        var ev = new Event(type, { bubbles: true, cancelable: true });
        ev.scale = sc; ev.clientX = x; ev.clientY = y;
        cv.dispatchEvent(ev);
        return ev.defaultPrevented;
      }
      var w = _rtsGroundAt(420, 240), a = fire('gesturestart', 1), b = fire('gesturechange', 2);
      for (var i = 0; i < 90; i++) { _rtsZoomTick(1 / 60); _rtsClampFocus(); }
      var s = _rtsGroundToScreen(w.x, w.z);
      return { prevented: a && b, zf: _rtsR.zf, slip: +Math.hypot(s.x - 420, s.y - 240).toFixed(2) };
    });
    S.ok('a Safari trackpad pinch is kept from the page', ges.prevented, String(ges.prevented));
    S.ok('...and zooms the map a rung for twice the spread, about the fingers', Math.abs(ges.zf - 3) < 0.02 && ges.slip < 2,
         'rung 2 -> ' + ges.zf.toFixed(3) + ', ' + ges.slip + ' px off');

    /* ---------------- THE A-MOVE LATCH ---------------- */
    await park(2);
    var latch = await P.evaluate(function () {
      var U = window._rtsUI;
      U.attackMove = true;                            /* the touch bar's A-MOVE, not the A key */
      window.dispatchEvent(new Event('blur'));
      var kept = U.attackMove;
      U.keys.a = true; U.attackMove = true;           /* and the A key held */
      window.dispatchEvent(new Event('blur'));
      return { kept: kept, keyLetGo: !U.attackMove };
    });
    S.ok('the touch bar\'s latched attack-move survives the window losing focus', latch.kept, String(latch.kept));
    S.ok('...while one from the A key held is let go', latch.keyLetGo, String(latch.keyLetGo));
  }

  /* ---------------- 2D: A TURN BACK STARTS THE SUM CLEAN ---------------- */
  await P.evaluate(function () { rts3dSet(false); RTS_WHEEL_QUIET = 60000; });
  await park(1);
  await M.move(400, 300);
  for (var t = 0; t < 3; t++) await M.wheel(0, -25);           /* three quarters of a rung in */
  var steps = [];
  for (t = 0; t < 4; t++) { await M.wheel(0, 25); steps.push((await state()).zi); }
  S.ok('in 2D, after three quarters in, the way out takes a whole rung of its own', steps.join() === '1,1,1,0',
       'rungs after each notch out: ' + steps.join(', '));

  /* and a remainder belongs to its own gesture: three quarters in, a pause, a quarter more */
  await park(1);
  for (t = 0; t < 3; t++) await M.wheel(0, -25);
  await P.evaluate(function () { RTS_WHEEL_QUIET = 0; });      /* every event from here comes after a pause */
  await M.wheel(0, -25);
  var after = (await state()).zi;
  S.ok('...and after a pause a small nudge does not finish the last gesture\'s rung', after === 1, 'rung ' + after);

  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');
  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
