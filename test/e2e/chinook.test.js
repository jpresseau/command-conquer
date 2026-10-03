/* THE CHINOOK WITH REAL INPUT (rules/units.js 'tran', ui/select.js), in the 3D view a player
   gets by default:

     LOADING       a squad box-selected with the mouse and right-clicked onto the Chinook walks
                   to it and climbs in - all five
     THE DROP      the Chinook clicked, then a right-click on open ground across the water: it
                   says it is taking them in, flies there, and all five are put down on the far
                   side, where no squad could have walked

   The opponent's units are cleared from the field and the loop is frozen, so the simulation
   moves only when the spec ticks it. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('chinook');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 1100, height: 760 });
  await g.start(7, 1, { freeze: true, mode3d: true });
  var p = g.page;
  async function canvasAt(sx, sy) {
    var r = await p.evaluate(function () { var c = document.getElementById('rtsCv').getBoundingClientRect(); return { l: c.left, t: c.top }; });
    return { x: r.l + sx, y: r.t + sy };
  }
  function tick(sec, until) {
    return p.evaluate(function (a) {
      for (var t = 0; t < a[0] * 30; t++) { _rtsTick(1 / 30); if (a[1] && eval(a[1])) return t / 30; }
      return a[0];
    }, [sec, until || null]);
  }

  var set = await p.evaluate(function () {
    var G = window._rtsG, R = _rtsR;
    G.over = null;
    G.ents.forEach(function (e) { if (e.side === 'enemy' && e.type === 'unit') e.dead = true; });
    var yd = _rtsHas('player', 'yard'), st = _rtsNearestOpen(yd.tx + 4, yd.tz + 4, 10, null), sx = _rtsWX(st[0]), sz = _rtsWX(st[1]);
    var far = null;
    for (var r = 6; r < 40 && !far; r += 2) for (var a = 0; a < 24 && !far; a++) {
      var tx = Math.round(st[0] + Math.cos(a / 24 * 6.283) * r), tz = Math.round(st[1] + Math.sin(a / 24 * 6.283) * r);
      if (_rtsInB(tx, tz) && !_rtsBlocked(tx, tz) && !_rtsPath(sx, sz, _rtsWX(tx), _rtsWX(tz), null)) far = [tx, tz];
    }
    var ch = _rtsSpawnUnit('player', 'tran', sx, sz), ms = _rtsNearestOpen(st[0] - 8, st[1] + 6, 10, null), men = [];
    for (var i = 0; i < 5; i++) men.push(_rtsSpawnUnit('player', 'rifle', _rtsWX(ms[0]) + (i - 2) * 3, _rtsWX(ms[1])));
    window.__ch = ch; window.__men = men; window.__far = { x: _rtsWX(far[0]), z: _rtsWX(far[1]) };
    for (var k = 0; k < 60; k++) _rtsTick(1 / 30);          /* it settles onto the ground to wait */
    /* the camera over the lot: Chinook, squad and the far bank all on the screen */
    R.focus.x = (sx + window.__far.x + _rtsWX(ms[0])) / 3; R.focus.z = (sz + window.__far.z + _rtsWX(ms[1])) / 3;
    _rtsApplyCam(); _rtsRFrame(0);
    G.sel.length = 0;
    var c = _rtsScreenOf(ch), f = _rtsWorldToScreen(window.__far.x, _rtsElev(window.__far.x, window.__far.z), window.__far.z);
    var mp = men.map(function (m) { return _rtsScreenOf(m); });
    return { on: !!(window._R3D && window._R3D.on), far: !!far, ch: { x: c.x, y: c.y }, fp: { x: f.x, y: f.y }, W: R.W, H: R.H,
             box: { x0: Math.min.apply(null, mp.map(function (q) { return q.x; })) - 24, x1: Math.max.apply(null, mp.map(function (q) { return q.x; })) + 24,
                    y0: Math.min.apply(null, mp.map(function (q) { return q.y; })) - 24, y1: Math.max.apply(null, mp.map(function (q) { return q.y; })) + 24 },
             land: ch.land };
  });
  var inView = function (q) { return q.x > 0 && q.y > 0 && q.x < set.W && q.y < set.H; };
  S.ok('the 3D view is up, with open ground across the water no squad can walk to', set.on && set.far, '');
  S.ok('...the Chinook, the squad and the far bank all on the screen, or a click proves nothing', inView(set.ch) && inView(set.fp) && inView({ x: set.box.x0, y: set.box.y0 }) && inView({ x: set.box.x1, y: set.box.y1 }),
       'chinook ' + Math.round(set.ch.x) + ',' + Math.round(set.ch.y) + '  far ' + Math.round(set.fp.x) + ',' + Math.round(set.fp.y));
  S.ok('it waits on the ground, settled', set.land === 1, 'land ' + set.land);

  /* LOADING: a box round the squad, then a right-click on the Chinook */
  var a = await canvasAt(set.box.x0, set.box.y0), b = await canvasAt(set.box.x1, set.box.y1);
  await p.mouse.move(a.x, a.y); await p.mouse.down(); await p.mouse.move(b.x, b.y, { steps: 6 }); await p.mouse.up();
  var picked = await p.evaluate(function () { return window._rtsG.sel.filter(function (e) { return window.__men.indexOf(e) >= 0; }).length; });
  S.ok('a box round the squad selects all five', picked === 5, picked + ' of 5');
  var c = await canvasAt(set.ch.x, set.ch.y);
  await p.mouse.click(c.x, c.y, { button: 'right' });
  var boardT = await tick(30, 'window.__ch.cargo && window.__ch.cargo.length === 5');
  var aboard = await p.evaluate(function () { return (window.__ch.cargo || []).length; });
  S.ok('...and a right-click on the Chinook puts them all aboard', aboard === 5, aboard + ' of 5 after ' + boardT.toFixed(1) + ' s');

  /* THE DROP: click the Chinook, then right-click across the water */
  await p.evaluate(function () { _rtsRFrame(0); });
  var cs = await p.evaluate(function () { var q = _rtsScreenOf(window.__ch); return { x: q.x, y: q.y }; });
  c = await canvasAt(cs.x, cs.y);
  await p.mouse.click(c.x, c.y);
  var selCh = await p.evaluate(function () { var G = window._rtsG; return G.sel.length === 1 && G.sel[0] === window.__ch; });
  S.ok('a click on the Chinook selects it', selCh, '');
  var f = await canvasAt(set.fp.x, set.fp.y);
  await p.mouse.click(f.x, f.y, { button: 'right' });
  var said = await p.evaluate(function () { return { order: window.__ch.order }; });
  S.ok('a right-click on the far bank sends it to put them down there', said.order === 'unload', 'order ' + said.order);
  var flyT = await tick(60, '!window.__ch.cargo.length');
  var res = await p.evaluate(function () {
    var F = window.__far, out = window.__men.filter(function (m) { return !m.dead && !m.inside && Math.hypot(m.x - F.x, m.z - F.z) < RTS_TILE * 4; });
    return { n: out.length, land: window.__ch.land };
  });
  S.ok('...and all five are put down across the water', res.n === 5, res.n + ' of 5 on the far side after ' + flyT.toFixed(1) + ' s');
  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
