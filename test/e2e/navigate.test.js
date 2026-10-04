/* GETTING AROUND THE MAP WITH THE MOUSE AND KEYS - ui/navigate.js. Touch is e2e/navtouch.

   Reported as "I must use the direction keys". The view moved by the arrows, the screen edge
   and the radar, and the wheel zoomed about the middle of the screen a whole doubling a notch.
   Driven here through Playwright's real mouse, wheel and keyboard, and graded on where the
   ground ended up and what was ordered, not on any handler being called:

     GRAB THE MAP       a right-drag (or a middle one) keeps the ground it grabbed under the
                        cursor and orders nothing - on over the sidebar too, and the menu Windows
                        fires after that release is eaten; a right-click that does not drag is
                        still the order, as it was PRESSED; with the sell cursor up a drag pans
                        and keeps it, a click drops it
     ZOOM WHERE YOU     the wheel keeps the point under the cursor where it is, in both modes,
       POINT            and on a hillside as well as on the flat
     SMOOTHLY, IN 3D    a notch is a third of a rung, the view glides to it - between the rungs,
                        where it stays through the frame's clamp and a resize - and the running
                        loop is what carries the glide; three notches are one rung
     2D ON ITS RUNGS    a notch is a whole rung, a trackpad's small deltas add up to one, and a
                        held key's remainder does not swallow the next notch back
     + AND -            a tap is a notch, a hold keeps going, and neither a '+' let go after its
                        shift nor a key held while the window loses focus is left held */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('navigate');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 900, height: 640, dpr: 1 });
  await g.start(7, 20, { freeze: true });
  var P = g.page, M0 = g.page.mouse;
  /* A WHEEL IS HANDLED WHEN IT IS HANDLED: Chromium routes it through the compositor, and
     mouse.wheel returns before the page has seen it. Counted as it bubbles out of the canvas,
     after the game's own handler, and waited for. */
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

  /* the view parked mid-map at a middle rung, a unit of ours selected with no orders, nothing
     armed and no key down */
  async function park(zi) {
    return P.evaluate(function (zi) {
      var R = _rtsR, G = window._rtsG, U = window._rtsUI;
      U.mode = null; U.keys = {}; U.zkBy = {}; U.zAcc = 0; U.attackMove = false; U.grab = null; U.eatCtx = false;
      R.focus.x = _rtsWX(RTS_N / 2); R.focus.z = _rtsWX(RTS_N / 2);
      R.zi = zi === undefined ? 2 : zi; _rtsApplyCam(); _rtsClampFocus();
      var u = null;
      G.ents.forEach(function (e) { if (!u && e.side === 'player' && e.type === 'unit' && !e.dead && !e.inside) u = e; });
      G.sel.length = 0;
      if (u) { G.sel.push(u); u.order = null; u.path = null; u.goal = null; }
      return !!u;
    }, zi);
  }
  function ground(x, y) { return P.evaluate(function (a) { var w = _rtsGroundAt(a[0], a[1]); return w && { x: w.x, z: w.z }; }, [x, y]); }
  /* how far, on screen, a ground point now is from where it should be */
  function slip(w, x, y) {
    return P.evaluate(function (a) {
      var s = _rtsGroundToScreen(a[0].x, a[0].z);
      return +Math.hypot(s.x - a[1], s.y - a[2]).toFixed(2);
    }, [w, x, y]);
  }
  function cam() {
    return P.evaluate(function () {
      var R = _rtsR, u = window._rtsG.sel[0];
      return { tile: RTS_TILE, fx: R.focus.x, fz: R.focus.z, zi: R.zi, zf: R.zf, zt: R.zt, cell: R.cell, zoom: _rtsZoom(),
               W: R.W, ladder: RTS_ZOOMS.slice(), ordered: !!(u && (u.order || u.path || u.goal)),
               order: u ? u.order : null, goal: u && u.goal ? { x: u.goal.x, z: u.goal.z } : null,
               mode: window._rtsUI.mode || null };
    });
  }
  async function rdrag(button, x0, y0, x1, y1) {
    await M.move(x0, y0);
    await M.down({ button: button });
    for (var i = 1; i <= 8; i++) await M.move(x0 + (x1 - x0) * i / 8, y0 + (y1 - y0) * i / 8);
    await M.up({ button: button });
  }
  /* the 3D glide, a frame at a time, as the loop would */
  function glide(frames) {
    return P.evaluate(function (n) { for (var i = 0; i < n; i++) { _rtsZoomTick(1 / 60); _rtsClampFocus(); } }, frames || 90);
  }
  function panTick(dt, n) {
    return P.evaluate(function (a) { for (var i = 0; i < a[1]; i++) _rtsPanTick(a[0]); return _rtsR.zt; }, [dt, n || 1]);
  }

  if (on) {
    /* ---------------- GRAB THE MAP ---------------- */
    var had = await park();
    S.ok('a unit of ours to order', had, had ? 'selected' : 'none');
    var w0 = await ground(450, 330), c0 = await cam();
    await rdrag('right', 450, 330, 290, 210);
    var c1 = await cam(), s1 = await slip(w0, 290, 210);
    S.ok('a right-drag moves the view', Math.hypot(c1.fx - c0.fx, c1.fz - c0.fz) > 20,
         'focus moved ' + Math.hypot(c1.fx - c0.fx, c1.fz - c0.fz).toFixed(1) + ' world units');
    S.ok('...keeping the ground it grabbed under the cursor', s1 < 2, s1 + ' px from the cursor');
    S.ok('...and orders nothing', !c1.ordered, 'unit ordered: ' + c1.ordered);

    /* on past the canvas's edge, over the sidebar, and let go there */
    await park();
    var w4 = await ground(430, 330), c4 = await cam();
    var sideX = c4.W + 80;
    await P.evaluate(function (x) {
      window.__menus = { mini: 0, there: 0 };
      var t = document.elementFromPoint(x, 330);
      window.__menuThere = t;
      document.getElementById('rtsMini').addEventListener('contextmenu', function () { window.__menus.mini++; });
      if (t) t.addEventListener('contextmenu', function () { window.__menus.there++; });
    }, sideX);
    await rdrag('right', 430, 330, sideX, 330);
    var c5 = await cam(), s5 = await slip(w4, sideX, 330);
    S.ok('a right-drag carries on over the sidebar, the ground still under the cursor', s5 < 2 && c4.fx !== c5.fx,
         s5 + ' px from the cursor at x ' + sideX + ' (the canvas ends at ' + c4.W + ')');
    var edge = await P.evaluate(function () {
      var R = _rtsR, x = R.focus.x, z = R.focus.z, over = window._rtsUI.mouse.over;
      _rtsPanTick(0.5);
      return { over: over, moved: +Math.hypot(R.focus.x - x, R.focus.z - z).toFixed(2) };
    });
    S.ok('...and let go there, the pointer is not over the battlefield, so the edge does not scroll',
         !edge.over && edge.moved === 0, 'over: ' + edge.over + ', edge scroll moved ' + edge.moved);
    /* WINDOWS' ORDER, which this Linux browser does not follow: the menu comes AFTER the
       release, on the element under the pointer. Dispatched by hand in that order - the one
       event here that is - and counted by listeners on the elements themselves. */
    var menus = await P.evaluate(function () {
      function menu(el) {
        var r = el.getBoundingClientRect();
        el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2,
          clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
      }
      menu(window.__menuThere);
      var eaten = window.__menus.there === 0;
      menu(window.__menuThere);
      return { eaten: eaten, next: window.__menus.there, ordered: !!window._rtsG.sel[0].order };
    });
    S.ok('...where the menu Windows fires after the release is eaten, not a right-click on the sidebar',
         menus.eaten && !menus.ordered, 'reached the element: ' + !menus.eaten + ', unit ordered: ' + menus.ordered);
    S.ok('...once: the next menu there is its own', menus.next === 1, menus.next + ' reached it');
    /* and on Linux and the Mac, where the menu comes with the PRESS, a real right-click on the
       radar straight after a drag is still a right-click on the radar */
    await park();
    await rdrag('right', 430, 330, 300, 250);
    var mb = await P.evaluate(function () { var r = document.getElementById('rtsMini').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, n: window.__menus.mini }; });
    await M.move(mb.x, mb.y); await M.down({ button: 'right' }); await M.up({ button: 'right' });
    var mini = await P.evaluate(function () { return window.__menus.mini; });
    S.ok('...and a real right-click on the radar straight after a drag still reaches it', mini === mb.n + 1,
         (mini - mb.n) + ' menu reached the radar');

    await park();
    var wc = await ground(520, 360), c6 = await cam();
    await M.move(520, 360);
    await M.down({ button: 'right' });
    await M.move(522, 361);                          /* a hand is never quite still */
    await M.up({ button: 'right' });
    var c7 = await cam();
    S.ok('a right-click that does not drag is still the order', c7.ordered, 'unit ordered: ' + c7.ordered);
    S.ok('...given where it was pressed', !!c7.goal && Math.hypot(c7.goal.x - wc.x, c7.goal.z - wc.z) < c7.tile * 1.5,
         c7.goal ? 'goal ' + Math.hypot(c7.goal.x - wc.x, c7.goal.z - wc.z).toFixed(1) + ' world units from the press' : 'no goal');
    S.ok('...and the view does not move', c7.fx === c6.fx && c7.fz === c6.fz, 'focus ' + c6.fx + ',' + c6.fz + ' -> ' + c7.fx + ',' + c7.fz);

    /* AS PRESSED: the view scrolls while the button is down (a held arrow key does 1.15
       view-heights a second), and A is let go before the button */
    await park();
    var wp = await ground(470, 300);
    await M.move(470, 300);
    await P.keyboard.down('a');
    await M.down({ button: 'right' });
    await P.evaluate(function () { _rtsR.focus.x += 3 * RTS_TILE; _rtsR.focus.z += 2 * RTS_TILE; _rtsClampFocus(); });
    await P.keyboard.up('a');
    await M.up({ button: 'right' });
    var c8 = await cam();
    S.ok('the order is where the click was pressed, though the view moved before the release',
         !!c8.goal && Math.hypot(c8.goal.x - wp.x, c8.goal.z - wp.z) < c8.tile * 1.5,
         c8.goal ? 'goal ' + Math.hypot(c8.goal.x - wp.x, c8.goal.z - wp.z).toFixed(1) + ' world units from the press' : 'no goal');
    S.eq('...and it is the attack-move A was held for at the press', c8.order, 'amove');

    /* the sell cursor: a drag pans and keeps it, a still click drops it as it always did */
    await park();
    await P.evaluate(function () { rtsMode('sell'); });
    var c9 = await cam();
    await rdrag('right', 430, 330, 330, 260);
    var c10 = await cam();
    S.ok('with the sell cursor up, a right-drag pans and keeps it', c10.mode === 'sell' && c10.fx !== c9.fx,
         'cursor ' + c10.mode + ', focus moved ' + Math.hypot(c10.fx - c9.fx, c10.fz - c9.fz).toFixed(1));
    await M.move(400, 300); await M.down({ button: 'right' }); await M.up({ button: 'right' });
    var c11 = await cam();
    S.ok('...and a still right-click drops it, ordering nothing', !c11.mode && !c11.ordered, 'cursor ' + c11.mode + ', ordered ' + c11.ordered);

    /* ---------------- ZOOM WHERE YOU POINT, SMOOTHLY ---------------- */
    await park(2);
    var za = await cam(), wz = await ground(510, 170);
    await M.move(510, 170);
    await M.wheel(0, -100);
    await glide();
    var zb = await cam(), sz = await slip(wz, 510, 170);
    var between = zb.ladder.indexOf(zb.cell) < 0;
    S.ok('a wheel notch in 3D zooms in by a third of a rung', Math.abs(zb.zf - za.zf - 1 / 3) < 0.01,
         'rung ' + za.zf + ' -> ' + zb.zf.toFixed(3));
    S.ok('...to a magnification between the rungs', between && zb.zoom > za.zoom,
         'cell ' + za.cell + ' -> ' + zb.cell.toFixed(2) + ' (rungs ' + zb.ladder.join(', ') + ')');
    S.ok('...keeping the point under the cursor where it was', sz < 2, sz + ' px from the cursor');
    await P.evaluate(function () { _rtsClampFocus(); });
    var zc = await cam();
    S.ok('...and it stays there through the frame\'s clamp', zc.cell === zb.cell && zc.zf === zb.zf,
         'cell ' + zb.cell + ' -> ' + zc.cell);
    await P.setViewportSize({ width: 860, height: 640 });
    await P.waitForFunction(function (w) { return _rtsR.W !== w; }, zc.W, { timeout: 10000 }).catch(function () {});
    var zr = await cam();
    await P.setViewportSize({ width: 900, height: 640 });
    await P.waitForFunction(function (w) { return _rtsR.W === w; }, zc.W, { timeout: 10000 }).catch(function () {});
    S.ok('...and through a resize', zr.W !== zc.W && zr.zf === zc.zf && zr.cell === zc.cell,
         'width ' + zc.W + ' -> ' + zr.W + ', rung ' + zc.zf.toFixed(3) + ' -> ' + zr.zf.toFixed(3));
    await M.wheel(0, -100); await M.wheel(0, -100);
    await glide();
    var zd = await cam();
    S.ok('three notches are one rung', Math.abs(zd.zf - za.zf - 1) < 1e-9 && zd.cell === zd.ladder[za.zi + 1],
         'rung ' + za.zf + ' -> ' + zd.zf + ', cell ' + zd.cell);
    for (var k = 0; k < 20; k++) await M.wheel(0, 100);
    await glide(200);
    var ze = await cam();
    S.ok('zooming out stops at the last rung', ze.zf === 0 && ze.cell === ze.ladder[0], 'rung ' + ze.zf);

    /* ON A HILLSIDE: the steepest ground on the map, pointed at off-centre, three notches in */
    await park(2);
    var hill = await P.evaluate(function () {
      var R = _rtsR, T = RTS_TILE, best = null, bs = 0;
      for (var tz = 10; tz < RTS_N - 10; tz++) for (var tx = 10; tx < RTS_N - 10; tx++) {
        var x = _rtsWX(tx), z = _rtsWX(tz);
        var gr = Math.hypot(_rtsElev(x + T, z) - _rtsElev(x - T, z), _rtsElev(x, z + T) - _rtsElev(x, z - T)) / (2 * T);
        if (gr > bs) { bs = gr; best = { x: x, z: z }; }
      }
      R.focus.x = best.x - 3 * T; R.focus.z = best.z - 2 * T; _rtsClampFocus();
      var s = _rtsGroundToScreen(best.x, best.z), w = _rtsGroundAt(s.x, s.y);
      return { slope: +bs.toFixed(3), x: s.x, y: s.y, w: w && { x: w.x, z: w.z } };
    });
    await M.move(hill.x, hill.y);
    await M.wheel(0, -100); await M.wheel(0, -100); await M.wheel(0, -100);
    await glide(120);
    var sh = await slip(hill.w, hill.x, hill.y);
    S.ok('the ground pointed at is steep', hill.slope > 0.2, 'rise over run ' + hill.slope);
    S.ok('...and a rung in, it is still under the cursor', sh < 2, sh + ' px from the cursor');

    /* the running loop carries the glide, not only this spec's hand */
    await park(2);
    await M.move(450, 320);
    await M.wheel(0, -100);
    var ran = await P.evaluate(function () {
      var U = window._rtsUI; U.dead = false; U.last = Date.now(); _rtsLoop(0); return true;
    });
    var done = await P.waitForFunction(function () { return Math.abs(_rtsR.zf - 2 - 1 / 3) < 0.01; }, null, { timeout: 30000 })
      .then(function () { return true; }, function () { return false; });
    await g.freeze();
    S.ok('the game\'s own loop glides the zoom in', ran && done, 'reached the target: ' + done);

    /* ---------------- + AND - ---------------- */
    await park(2);
    await P.keyboard.down('Equal');
    await panTick(0.1);                               /* a frame goes by during a quick tap */
    await P.keyboard.up('Equal');
    var ka = await cam();
    S.ok('a tap of + is one notch in', Math.abs(ka.zt - 2 - 1 / 3) < 1e-9, 'target rung ' + ka.zt);
    /* a real hold: the key goes down once and then REPEATS (Playwright sends the later downs with
       repeat set, as the OS does), for a second: a notch at the press, then 0.7 s of glide */
    await P.keyboard.down('Minus');
    await panTick(0.1, 4); await P.keyboard.down('Minus');
    await panTick(0.1, 3); await P.keyboard.down('Minus');
    var kb = await panTick(0.1, 3);
    await P.keyboard.up('Minus');
    var want = ka.zt - 1 / 3 - 0.7 * 2.4;
    S.ok('...and holding - glides out at its rate, not a notch a repeat', Math.abs(kb - want) < 0.05,
         'target rung ' + ka.zt.toFixed(3) + ' -> ' + kb.toFixed(3) + ', expected ' + want.toFixed(3));
    /* graded on the zoom: with every key up, a second of frames must not move it */
    async function still() {
      return P.evaluate(function () {
        var R = _rtsR, z = R.zt, x = R.focus.x;
        for (var i = 0; i < 60; i++) _rtsPanTick(1 / 60);
        return { zoom: +(R.zt - z).toFixed(3), pan: +(R.focus.x - x).toFixed(3) };
      });
    }
    /* each case first shows the press took (a notch in, the key held), then that the release let go */
    function held() { return P.evaluate(function () { var U = window._rtsUI; return { zt: _rtsR.zt, plus: !!U.keys['zoom+'], left: !!U.keys.arrowleft }; }); }
    await park(1);
    var h0 = await held();
    await P.keyboard.down('Shift'); await P.keyboard.down('Equal');
    var h1 = await held();
    await P.keyboard.up('Shift'); await P.keyboard.up('Equal');
    var st = await still();
    S.ok('Shift+= is + : a notch in, and held', h1.plus && Math.abs(h1.zt - h0.zt - 1 / 3) < 1e-9, JSON.stringify(h1));
    S.ok('...and let go after its shift, it is not left held', st.zoom === 0, 'a second later the zoom target moved ' + st.zoom + ' rungs');
    /* a Swiss board, which this browser cannot be given: '+' is Shift+1 there. Held, with Shift let
       go first, the key REPEATS as '1' - which must stay the zoom, not become the team-1 key - and
       comes up as '1'. Dispatched by hand, as that board sends it. */
    await park(1);
    var sw = await P.evaluate(function () {
      var G = window._rtsG, U = window._rtsUI, z0 = _rtsR.zt, sel0 = G.sel.length, o = {};
      function key(type, k, c, sh, rep) { document.dispatchEvent(new KeyboardEvent(type, { key: k, code: c, shiftKey: sh, repeat: !!rep, bubbles: true, cancelable: true })); }
      key('keydown', 'Shift', 'ShiftLeft', true); key('keydown', '+', 'Digit1', true);
      o.pressed = +(_rtsR.zt - z0).toFixed(6); o.held = !!U.keys['zoom+'];
      key('keyup', 'Shift', 'ShiftLeft', false);
      for (var i = 0; i < 5; i++) key('keydown', '1', 'Digit1', false, true);
      o.sel = G.sel.length === sel0; o.stillPlus = !!U.keys['zoom+'];
      key('keyup', '1', 'Digit1', false);
      return o;
    });
    st = await still();
    S.ok('a Swiss Shift+1 is + : a notch in, and held', sw.held && Math.abs(sw.pressed - 1 / 3) < 1e-6, JSON.stringify(sw));
    S.ok('...its repeats as 1, once Shift is up, go on being + and are not the team-1 key', sw.sel && sw.stillPlus, JSON.stringify(sw));
    S.ok('...and let go as 1, it is not left held', st.zoom === 0, 'a second later the zoom target moved ' + st.zoom + ' rungs');
    await park(1);
    await P.keyboard.down('Equal'); await P.keyboard.down('ArrowLeft');
    var h2 = await held();
    await P.evaluate(function () { window.dispatchEvent(new Event('blur')); });
    st = await still();
    await P.keyboard.up('Equal'); await P.keyboard.up('ArrowLeft');
    S.ok('keys down when the window loses focus are let go', h2.plus && h2.left && st.zoom === 0 && st.pan === 0,
         'held ' + JSON.stringify(h2) + '; a second later: zoom ' + st.zoom + ' rungs, pan ' + st.pan);
  }

  var help = await P.evaluate(function () {
    var d = document.querySelector('#rcgRts .rts-help.desk'), k = document.getElementById('rtsKeys');
    return (d ? d.textContent : '') + ' | ' + (k ? k.textContent : '');
  });
  S.ok('the controls say how', /right-drag pan/.test(help) && /Right-drag/.test(help) && /toward the cursor/.test(help), help.slice(0, 120));
  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
