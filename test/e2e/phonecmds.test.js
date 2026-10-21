/* QUEUE AND IDLE ON A PHONE (ui/touchcmd.js, ui/select.js, ui/idlesel.js), on a touch device at a
   portrait and a landscape phone size - the two controls a keyboard has (Shift, I) and a phone did
   not:

     THE BAR      A-MOVE, HOLD, QUEUE, IDLE and TEAMS fit on the stage, each under a finger
     QUEUE        a finger held on the ground sends the tank; QUEUE lit, two more holds add two
                  stops after it; QUEUE off, the next hold replaces them
     IDLE         a tap selects the idle army, and a second tap keeps it and moves on */

var { chromium, devices } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('phonecmds');
function bar() {
  function under(id) {
    var b = document.getElementById(id);
    if (!b) return 'missing';
    var r = b.getBoundingClientRect(), e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return e === b || b.contains(e) ? 'yes' : (e ? (e.id || e.tagName) : 'nothing');
  }
  var st = document.querySelector('#rcgRts .rts-stage').getBoundingClientRect(), out = {};
  ['rtsTAmove', 'rtsTHold', 'rtsTQueue', 'rtsTIdle', 'rtsTTeams'].forEach(function (id) {
    var b = document.getElementById(id), r = b && b.getBoundingClientRect();
    out[id] = !b ? 'missing' : (r.left >= st.left && r.right <= st.right && r.top >= st.top && r.bottom <= st.bottom && r.height >= 32 ? under(id) : 'outside ' + Math.round(r.left) + '-' + Math.round(r.right) + ' of ' + Math.round(st.left) + '-' + Math.round(st.right));
  });
  return out;
}

(async function () {
  var browser = await chromium.launch();
  var sizes = [{ name: 'portrait', dev: devices['iPhone 13'] }, { name: 'landscape', dev: devices['iPhone 13 landscape'] }];
  for (var z = 0; z < sizes.length; z++) {
    var g = await openPage(browser, { device: sizes[z].dev });
    var p = g.page;
    await g.start(7, 2, { freeze: true });
    await p.evaluate(function () { _rtsTouchCmdFrame(); });
    var b = await p.evaluate(bar);
    S.ok(sizes[z].name + ': THE BAR - A-MOVE, HOLD, QUEUE, IDLE and TEAMS on the stage, each under a finger', Object.keys(b).every(function (k) { return b[k] === 'yes'; }), JSON.stringify(b));
    if (z) { await g.close(); continue; }

    /* ---------- queue ---------- */
    var set = await p.evaluate(function () {
      var G = window._rtsG, y = _rtsHas('player', 'yard'); G.sides.enemy.ctl = 'none';
      function cell(dx, dz) { var c = _rtsNearestOpen(y.tx + dx, y.tz + dz, 6, null); return { x: _rtsWX(c[0]), z: _rtsWX(c[1]) }; }
      var t0 = cell(3, 3), u = _rtsSpawnUnit('player', 'tank', t0.x, t0.z);
      window.__u = u; G.sel = [u];
      _rtsR.focus.x = u.x; _rtsR.focus.z = u.z; _rtsClampFocus(); _rtsRFrame(0);
      var stops = [cell(7, 1), cell(6, 6), cell(1, 7)]; window.__stops = stops;
      var c = document.getElementById('rtsCv').getBoundingClientRect();
      return { sp: stops.map(function (s) { var q = _rtsWorldToScreen(s.x, _rtsElev(s.x, s.z), s.z); return { x: c.left + q.x, y: c.top + q.y }; }), W: innerWidth, H: innerHeight };
    });
    var T = await g.touch();
    async function hold(pt) { await T.start(pt.x, pt.y); await p.waitForTimeout(520); await T.end(); await p.waitForTimeout(60); }
    function read() { return p.evaluate(function () { var u = window.__u, s = window.__stops; function n(a, b) { return !!a && !!b && Math.hypot(a.x - b.x, a.z - b.z) < 1.6 * RTS_TILE; }
      return { order: u.order, goal: [0, 1, 2].filter(function (k) { return n(u.goal, s[k]); })[0], wq: (u.wq || []).map(function (w) { return [0, 1, 2].filter(function (k) { return n(w, s[k]); })[0]; }).join(), lit: document.getElementById('rtsTQueue').className }; }); }
    await hold(set.sp[0]);
    var q0 = await read();
    await p.locator('#rtsTQueue').tap();
    await hold(set.sp[1]); await hold(set.sp[2]);
    var q1 = await read();
    await p.locator('#rtsTQueue').tap();
    await hold(set.sp[2]);
    var q2 = await read();
    S.ok('QUEUE: a finger held on the ground sends the tank', q0.order === 'move' && q0.goal === 0 && q0.wq === '', JSON.stringify(q0));
    S.ok('...QUEUE lit, two more holds add two stops after it', q1.lit === 'on' && q1.goal === 0 && q1.wq === '1,2', JSON.stringify(q1));
    S.ok('...QUEUE off, the next hold replaces them', q2.lit === '' && q2.goal === 2 && q2.wq === '', JSON.stringify(q2));

    /* ---------- idle ---------- */
    var idle = await p.evaluate(function () {
      var G = window._rtsG, y = _rtsHas('player', 'yard');
      G.ents.forEach(function (e) { if (e.side === 'player' && e.type === 'unit' && !rtsUnitDef(e.def).harvest && e !== window.__u) e.dead = true; });
      var a = _rtsNearestOpen(y.tx - 6, y.tz, 6, null), b = _rtsNearestOpen(y.tx, y.tz - 6, 6, null);
      var i1 = _rtsSpawnUnit('player', 'rifle', _rtsWX(a[0]), _rtsWX(a[1])), i2 = _rtsSpawnUnit('player', 'rifle', _rtsWX(b[0]), _rtsWX(b[1]));
      G.sel = [];
      return [i1.id, i2.id].sort(function (x, y) { return x - y; }).join();
    });
    function sel() { return p.evaluate(function () { return { sel: window._rtsG.sel.map(function (e) { return e.id; }).sort(function (a, b) { return a - b; }).join(), msg: window._rtsG.msg }; }); }
    await p.locator('#rtsTIdle').tap();
    var i1 = await sel();
    await p.locator('#rtsTIdle').tap();
    var i2 = await sel();
    S.ok('IDLE: a tap selects the idle army - not the tank on its way', i1.sel === idle && /2 idle units/.test(i1.msg || ''), JSON.stringify({ got: i1, want: idle }));
    S.ok('...and a second tap keeps it and moves on to the next', i2.sel === idle && /2 of 2/.test(i2.msg || ''), JSON.stringify(i2));
    S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');
    await g.close();
  }
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
