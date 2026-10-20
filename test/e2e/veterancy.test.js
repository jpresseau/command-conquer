/* VETERANS ON THE SCREEN (ui/hud.js, core/veterancy.js): a promoted unit wears its chevrons over its
   health bar - one a rank, gold - and a green unit wears none. Read off the HUD canvas. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('veterancy');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 1100, height: 760 });
  var p = g.page;
  await g.start(7, 2, { freeze: true });
  var out = await p.evaluate(function () {
    var G = window._rtsG, y = _rtsHas('player', 'yard');
    _rtsR.focus.x = y.x; _rtsR.focus.z = y.z; _rtsClampFocus();
    var u = _rtsSpawnUnit('player', 'tank', y.x + 2 * RTS_TILE, y.z + 2 * RTS_TILE);
    G.sel = [u];
    function gold(rank) {
      u.rank = rank;
      _rtsRFrame(1 / 60); _rtsDrawHud(1 / 60);
      var hud = document.getElementById('rtsHud'), c = hud.getContext('2d'), s = _rtsWorldToScreen(u.x, 3.4, u.z);
      var d = c.getImageData(Math.max(0, s.x - 40 | 0), Math.max(0, s.y - 30 | 0), 80, 36).data, n = 0;
      for (var i = 0; i < d.length; i += 4) if (d[i + 3] > 200 && d[i] > 220 && d[i + 1] > 180 && d[i + 2] < 120) n++;
      return n;
    }
    return { none: gold(0), one: gold(1), three: gold(3) };
  });
  S.ok('a green unit wears no chevron; a veteran one; an elite three, each more gold than the last', out.none === 0 && out.one >= 1 && out.three >= out.one * 2, JSON.stringify(out));
  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');
  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
