/* I, THE IDLE ARMY, WITH THE REAL PAGE (ui/idlesel.js, ui/keys.js):

     WHO          a real I selects exactly the idle fighters: not one on its way, not one holding
                  position on purpose, not a harvester - and looks at the first
     NEXT         I again, with them still selected, looks at the next and keeps the selection
     FRESH        one of them given an order, I selects the rest
     NONE         with nobody idle, I says so and selects nothing new */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('idlesel');
function state() {
  var G = window._rtsG, vs = _rtsViewSpan();
  return { sel: G.sel.map(function (e) { return e.id; }).sort(function (a, b) { return a - b; }).join(','), msg: G.msg, cx: vs.cx, cz: vs.cz };
}

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 1100, height: 760 });
  var p = g.page;
  await g.start(7, 2, { freeze: true });
  var set = await p.evaluate(function () {
    var G = window._rtsG, y = _rtsHas('player', 'yard'); G.sides.enemy.ctl = 'none';
    function at(dx, dz) { var c = _rtsNearestOpen(y.tx + dx, y.tz + dz, 8, null); return { x: _rtsWX(c[0]), z: _rtsWX(c[1]) }; }
    /* the opening army goes somewhere else first: this is about the four placed here */
    G.ents.forEach(function (e) { if (e.side === 'player' && e.type === 'unit' && !rtsUnitDef(e.def).harvest) { e.dead = true; } });
    var a = at(12, 0), b = at(-12, 2), c = at(0, 14), d = at(6, 8), h = at(4, -6);
    var idle1 = _rtsSpawnUnit('player', 'tank', a.x, a.z), idle2 = _rtsSpawnUnit('player', 'rifle', b.x, b.z);
    var moving = _rtsSpawnUnit('player', 'tank', c.x, c.z), held = _rtsSpawnUnit('player', 'rifle', d.x, d.z), harv = _rtsSpawnUnit('player', 'harvester', h.x, h.z);
    _rtsOrderMove(moving, a.x, a.z, false); held.order = 'hold'; harv.hstate = null; harv.order = null;
    window.__w = { idle: [idle1.id, idle2.id].sort(function (x, y) { return x - y; }).join(','), i1: idle1, i2: idle2, moving: moving };
    G.sel = []; _rtsR.focus.x = y.x; _rtsR.focus.z = y.z; _rtsClampFocus();
    return window.__w.idle;
  });
  await p.keyboard.press('i');
  var one = await p.evaluate(state);
  /* where each idle unit is in the view: its distance from the centre, and whether it is in it. At
     this zoom the view is wide and the camera may not pass the map's edge, so "looks at" is the
     unit brought into view and nearer the centre than the other, not dead centre */
  function where() { var w = window.__w, vs = _rtsViewSpan();
    return [w.i1, w.i2].map(function (e) { return { off: +(Math.hypot(vs.cx - e.x, vs.cz - e.z) / RTS_TILE).toFixed(1), inView: Math.abs(vs.cx - e.x) < vs.w / 2 && Math.abs(vs.cz - e.z) < vs.h / 2 }; }); }
  var firstAt = await p.evaluate(where);
  S.ok('WHO: a real I selects exactly the idle fighters - not one on its way, nor one holding, nor a harvester', one.sel === set && /2 idle units/.test(one.msg || ''), JSON.stringify({ sel: one.sel, want: set, msg: one.msg }));
  var f = firstAt[0].off < firstAt[1].off ? 0 : 1;
  S.ok('...and looks at one of them: in view, the nearer of the two to the centre', firstAt[f].inView, JSON.stringify(firstAt));
  await p.keyboard.press('i');
  var two = await p.evaluate(state);
  var secondAt = await p.evaluate(where);
  S.ok('NEXT: I again keeps the selection and looks at the other - now it is in view and the nearer of the two', two.sel === set && /2 of 2/.test(two.msg || '') &&
       secondAt[1 - f].inView && secondAt[1 - f].off < secondAt[f].off, JSON.stringify({ msg: two.msg, first: firstAt, second: secondAt }));
  var three = await p.evaluate(function () { var w = window.__w; _rtsOrderMove(w.i1, w.i2.x, w.i2.z, false); return w.i2.id; });
  await p.keyboard.press('i');
  var fresh = await p.evaluate(state);
  S.ok('FRESH: one of them given an order, I selects the rest', fresh.sel === String(three) && /One idle unit/.test(fresh.msg || ''), JSON.stringify(fresh));
  await p.evaluate(function () { var w = window.__w; _rtsOrderMove(w.i2, w.moving.x, w.moving.z, false); window._rtsG.sel = [w.moving]; });
  await p.keyboard.press('i');
  var none = await p.evaluate(state);
  S.ok('NONE: with nobody idle, I says so and leaves the selection', /No idle units/.test(none.msg || '') && none.sel === await p.evaluate(function () { return String(window.__w.moving.id); }), JSON.stringify(none));
  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');
  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
