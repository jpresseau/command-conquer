/* QUEUED ORDERS WITH THE REAL PAGE (ui/input.js, ui/select.js, ui/wayline.js):

     QUEUE      with a tank selected, a right-click sends it; two Shift + right-clicks on open
                ground add two stops after it, and the line says so
     DRAWN      the HUD draws the queued line for it while it is selected
     REPLACED   a plain right-click replaces them all: one goal, nothing queued
     WALKED     queued again and left to run, it reaches every stop in order */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('waypoints');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 1100, height: 760 });
  var p = g.page;
  await g.start(7, 2, { freeze: true });
  async function canvasAt(sx, sy) {
    var r = await p.evaluate(function () { var c = document.getElementById('rtsCv').getBoundingClientRect(); return { l: c.left, t: c.top }; });
    return { x: r.l + sx, y: r.t + sy };
  }
  /* a tank by the yard, the view on it, and three stops on open ground around it, on screen */
  var set = await p.evaluate(function () {
    var G = window._rtsG, y = _rtsHas('player', 'yard'); G.sides.enemy.ctl = 'none';
    function cell(dx, dz) { var c = _rtsNearestOpen(y.tx + dx, y.tz + dz, 6, null); return { x: _rtsWX(c[0]), z: _rtsWX(c[1]) }; }
    var t0 = cell(4, 4), u = _rtsSpawnUnit('player', 'tank', t0.x, t0.z);
    window.__u = u; G.sel = [u];
    _rtsR.focus.x = u.x; _rtsR.focus.z = u.z; _rtsClampFocus(); _rtsRFrame(0);
    var stops = [cell(10, 2), cell(9, 9), cell(2, 10)];
    window.__stops = stops;
    var R = _rtsR;
    return { W: R.W, H: R.H, sp: stops.map(function (s) { var q = _rtsWorldToScreen(s.x, _rtsElev(s.x, s.z), s.z); return { x: q.x, y: q.y }; }) };
  });
  var inView = set.sp.every(function (q) { return q.x > 20 && q.y > 20 && q.x < set.W - 20 && q.y < set.H - 20; });
  S.ok('the three stops are on the screen, or a click proves nothing', inView, JSON.stringify(set.sp));

  /* ---------- queue ---------- */
  var a = await canvasAt(set.sp[0].x, set.sp[0].y);
  await p.mouse.click(a.x, a.y, { button: 'right' });
  await p.keyboard.down('Shift');
  for (var k = 1; k < 3; k++) { var c = await canvasAt(set.sp[k].x, set.sp[k].y); await p.mouse.click(c.x, c.y, { button: 'right' }); }
  await p.keyboard.up('Shift');
  var q = await p.evaluate(function () {
    var u = window.__u, s = window.__stops;
    function near(a, b) { return !!a && !!b && Math.hypot(a.x - b.x, a.z - b.z) < 1.6 * RTS_TILE; }
    return { order: u.order, goal: near(u.goal, s[0]), wq: (u.wq || []).length, w1: near(u.wq && u.wq[0], s[1]), w2: near(u.wq && u.wq[1], s[2]), msg: window._rtsG.msg };
  });
  S.ok('QUEUE: a right-click sends it, and two Shift + right-clicks add two stops after, in order', q.order === 'move' && q.goal && q.wq === 2 && q.w1 && q.w2, JSON.stringify(q));
  S.ok('...and the line says so', /Stop added/.test(q.msg || ''), q.msg);

  /* ---------- drawn ---------- */
  var drawn = await p.evaluate(function () {
    var n = 0, f = window._rtsDrawWayline;
    window._rtsDrawWayline = function (gg, e) { var r = f(gg, e); if (e === window.__u) n = r; return r; };
    _rtsDrawHud(1 / 60);
    window._rtsDrawWayline = f;
    return n;
  });
  S.ok('DRAWN: the HUD draws its route through both stops while it is selected: three legs', drawn === 3, 'legs ' + drawn);

  /* ---------- replaced ---------- */
  var b = await canvasAt(set.sp[2].x, set.sp[2].y);
  await p.mouse.click(b.x, b.y, { button: 'right' });
  var rep = await p.evaluate(function () { var u = window.__u; return { order: u.order, wq: u.wq, goalAt2: Math.hypot(u.goal.x - window.__stops[2].x, u.goal.z - window.__stops[2].z) < 1.6 * RTS_TILE }; });
  S.ok('REPLACED: a plain right-click replaces them all - one goal, nothing queued', rep.order === 'move' && rep.wq == null && rep.goalAt2, JSON.stringify(rep));

  /* ---------- walked ---------- */
  await p.mouse.click(a.x, a.y, { button: 'right' });
  await p.keyboard.down('Shift');
  for (k = 1; k < 3; k++) { c = await canvasAt(set.sp[k].x, set.sp[k].y); await p.mouse.click(c.x, c.y, { button: 'right' }); }
  await p.keyboard.up('Shift');
  var walked = await p.evaluate(function () {
    var u = window.__u, s = window.__stops, seen = [];
    for (var i = 0; i < 60 * 90; i++) {
      _rtsTick(1 / 60);
      s.forEach(function (p, k) { if (seen.indexOf(k) < 0 && Math.hypot(u.x - p.x, u.z - p.z) < 1.6 * RTS_TILE) seen.push(k); });
      if (!u.order && !u.wq && i > 30) break;
    }
    return { seen: seen.join(), order: u.order, wq: u.wq };
  });
  S.ok('WALKED: queued again and left to run, it reaches every stop in order', walked.seen === '0,1,2' && !walked.order && walked.wq == null, JSON.stringify(walked));

  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');
  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
