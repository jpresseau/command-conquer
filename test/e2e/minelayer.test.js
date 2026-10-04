/* THE MINE LAYER, ON THE SCREEN (core/mines.js, render/frame.js), with real input:

     THE D KEY       a Mine Layer selected and the D key pressed puts a mine down where it stands
     DEPLOY          the touch bar's DEPLOY button is offered for it, and a real click lays another
     ON THE MAP      the player's own mine is drawn on the overlay where it lies, and an enemy
                     mine on the same ground is not */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('minelayer');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 1100, height: 760 });
  await g.start(7, 1, { freeze: true });
  var p = g.page;

  var set = await p.evaluate(function () {
    var G = window._rtsG, R = _rtsR;
    for (var i = 0; i < RTS_N * RTS_N; i++) { G.mapped[i] = 1; G.vis[i] = 1; }
    G.visDirty = 1;
    var yd = _rtsHas('player', 'yard'), c = _rtsNearestOpen(yd.tx + 8, yd.tz + 8, 12, null);
    var ly = _rtsSpawnUnit('player', 'minelayer', _rtsWX(c[0]), _rtsWX(c[1]));
    window.__ly = ly;
    R.focus.x = ly.x; R.focus.z = ly.z; R.zi = RTS_ZOOMS.length - 2; _rtsApplyCam();
    G.sel.length = 0; G.sel.push(ly);
    _rtsSyncSidebar(0);
    return { mines: (G.mines || []).length };
  });

  /* ---------- the D key ---------- */
  await p.mouse.move(550, 380);
  await p.keyboard.press('d');
  var afterKey = await p.evaluate(function () { return { mines: (window._rtsG.mines || []).length, left: window.__ly.mines }; });
  S.ok('with a Mine Layer selected, the D key lays a mine', set.mines === 0 && afterKey.mines === 1 && afterKey.left === 4,
       set.mines + ' -> ' + afterKey.mines + ' mines, ' + afterKey.left + ' left on the layer');

  /* ---------- the DEPLOY button ---------- */
  var btn = await p.evaluate(function () {
    var ly = window.__ly; ly.x += RTS_TILE * 2;                /* onto fresh ground */
    _rtsSyncSidebar(0);
    var b = document.getElementById('rtsDeployBtn');
    if (!b || b.hidden) return { shown: false };
    var r = b.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2, hit = document.elementFromPoint(x, y);
    return { shown: true, x: x, y: y, reach: !!hit && (hit === b || b.contains(hit)) };
  });
  S.ok('the DEPLOY button is offered for it, and reachable', btn.shown && btn.reach, JSON.stringify(btn));
  if (btn.shown) await p.mouse.click(btn.x, btn.y);
  var afterBtn = await p.evaluate(function () { return (window._rtsG.mines || []).length; });
  S.eq('...and a real click on it lays another', afterBtn, 2);

  /* ---------- on the map ---------- */
  var seen = await p.evaluate(function () {
    var G = window._rtsG, R = _rtsR, ly = window.__ly;
    G.mines.forEach(function (m) { m.arm = 0; });                /* armed: drawn steadily */
    ly.x -= RTS_TILE * 8;                                          /* the layer out of the way */
    if (!G.mines.length) return null;
    var mine = G.mines[0], foe = { tx: mine.tx + 3, tz: mine.tz, side: 'enemy', arm: 0 };
    G.mines.push(foe);
    _rtsRFrame(0);
    function dark(m) {
      var s = _rtsGroundToScreen(_rtsWX(m.tx), _rtsWX(m.tz)), d = R.dpr;
      var px = R.g.getImageData(Math.round(s.x * d) - 2, Math.round(s.y * d) - 2, 5, 5).data, a = 0;
      for (var i = 3; i < px.length; i += 4) a += px[i];
      return a / 25;
    }
    return { mine: dark(mine), foe: dark(foe) };
  });
  S.ok('the player\'s own mine is drawn where it lies', !!seen && seen.mine > 150, seen ? 'overlay alpha ' + seen.mine.toFixed(0) : 'no mine was laid');
  S.ok('...and an enemy mine on the same ground is not', !!seen && seen.foe < 10, seen ? 'overlay alpha ' + seen.foe.toFixed(0) : 'no mine was laid');

  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');
  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
