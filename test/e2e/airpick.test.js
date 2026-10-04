/* A HELICOPTER IS PICKED WHERE IT IS DRAWN (render/camera.js _rtsScreenOf, render/post.js), with
   real mouse input, on the leaned 3D camera:

     A CLICK       on the machine you can see selects it - it is drawn lifted off its ground point
                   by its altitude, and a click used to be measured against the ground under it
     THE BOX       dragged round the machine you can see takes it
     A STACK       of four sent to one place has parted, and four clicks on the four of them that
                   can be seen select four different helicopters (core/airspace.js)

   Played from the player's side of the map, with the enemy's units cleared from the field. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('airpick');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 1100, height: 760 });
  await g.start(7, 1);
  var p = g.page;

  async function canvasAt(sx, sy) {
    var r = await p.evaluate(function () { var c = document.getElementById('rtsCv').getBoundingClientRect(); return { l: c.left, t: c.top }; });
    return { x: r.l + sx, y: r.t + sy };
  }
  async function round() {
    var o = {};
    var setup = await p.evaluate(function () {
      var G = window._rtsG, R = _rtsR;
      if (window._rtsUI) window._rtsUI.dead = true;
      G.ents.forEach(function (e) { if (e.type === 'unit' && e.air) e.dead = true; });
      var yd = _rtsHas('player', 'yard'), x = yd.x + 26, z = yd.z + 18;
      R.focus.x = x; R.focus.z = z; _rtsApplyCam();
      var h = _rtsSpawnUnit('player', 'heli', x, z);
      _rtsRFrame(0);
      window.__h = h;
      var s = _rtsScreenOf(h), gnd = _rtsWorldToScreen(h.x, 1, h.z);
      G.sel.length = 0;
      return { s: { x: s.x, y: s.y }, lift: Math.hypot(s.x - gnd.x, s.y - gnd.y), px: _rtsPxPerUnit(h), on: !!(window._R3D && window._R3D.on) };
    });
    o.on = setup.on;
    o.lift = setup.lift;
    /* A CLICK on the drawn machine */
    var c = await canvasAt(setup.s.x, setup.s.y);
    await p.mouse.click(c.x, c.y);
    await p.waitForTimeout(150);
    o.click = await p.evaluate(function () { return window._rtsG.sel.indexOf(window.__h) >= 0; });
    /* THE BOX round the drawn machine, not reaching its ground point */
    await p.evaluate(function () { window._rtsG.sel.length = 0; });
    /* the box stops short of the ground point, or it proves nothing */
    var r = setup.lift * 0.6, a = await canvasAt(setup.s.x - r, setup.s.y - r), b = await canvasAt(setup.s.x + r, setup.s.y + r);
    await p.mouse.move(a.x, a.y); await p.mouse.down(); await p.mouse.move(b.x, b.y, { steps: 6 }); await p.mouse.up();
    await p.waitForTimeout(150);
    o.box = await p.evaluate(function () { return window._rtsG.sel.indexOf(window.__h) >= 0; });
    o.boxReach = setup.lift > r;
    /* A STACK of four, parted by the simulation, then clicked one by one */
    var spots = await p.evaluate(function () {
      var G = window._rtsG, h = window.__h, four = [h];
      for (var i = 0; i < 3; i++) four.push(_rtsSpawnUnit('player', 'heli', h.x, h.z));
      four.forEach(function (u) { u.x = h.x; u.z = h.z; });
      for (var t = 0; t < 150; t++) _rtsTick(1 / 30);
      _rtsRFrame(0);
      window.__four = four;
      return four.map(function (u) { var s = _rtsScreenOf(u); return { x: s.x, y: s.y }; });
    });
    var got = [];
    for (var i = 0; i < spots.length; i++) {
      var q = await canvasAt(spots[i].x, spots[i].y);
      await p.mouse.click(q.x, q.y);
      await p.waitForTimeout(120);
      got.push(await p.evaluate(function () { var G = window._rtsG, s = G.sel[0]; return s ? window.__four.indexOf(s) : -1; }));
    }
    o.stack = got;
    return o;
  }

  var o = await round();
  S.ok('the 3D view is up to check', o.on, '');
  {
    S.ok('a click on the helicopter you can see selects it', o.click, 'drawn ' + o.lift.toFixed(0) + ' px from its ground point');
    S.ok('...and a box round it takes it, not reaching its ground point', o.box && o.boxReach, 'box ' + (o.boxReach ? 'clear of' : 'over') + ' the ground point');
    var distinct = o.stack.filter(function (v, k) { return v >= 0 && o.stack.indexOf(v) === k; }).length;
    S.ok('four sent to one place part, and four clicks pick four different machines', distinct === 4, JSON.stringify(o.stack));
  }
  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
