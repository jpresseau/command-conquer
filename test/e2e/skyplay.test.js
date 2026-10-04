/* THE WEATHER TAKES PART, IN THE PAGE (core/skyplay.js, render3d/sky3d.js, rts.save.js):

     FOG       a battle started under a chosen fog is a fog battle: the player is told nothing sees
               past five cells (once the battle's opening line has been read), and the ground in
               sight is smaller than the same base sees on a clear day
     KEPT      a saved fog battle loads as a fog battle, whatever sky the player has picked since
     PICTURE   while the play says storm - aircraft grounded - the picture is a downpour, and when
               it says clear the rain has stopped */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('skyplay');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 1000, height: 700, sky: 'fog' });
  var p = g.page;

  var o = await p.evaluate(function () {
    var said = [], say = window._rtsSay;
    window._rtsSay = function (m) { said.push(m); return say.apply(this, arguments); };
    rtsOpen(7);
    for (var i = 0; i < 60 * 8; i++) _rtsTick(1 / 60);
    var U = window._rtsUI;
    if (U) { U.dead = true; try { if (U.raf) cancelAnimationFrame(U.raf); } catch (e) {} }
    var G = window._rtsG, o = { sky: G.sky, name: _rtsSkyName(G), said: said.slice() };
    function seen() { G.visT = 1; _rtsVisTick(0); var n = 0; for (var c = 0; c < G.vis.length; c++) n += G.vis[c]; return n; }
    o.fogSeen = seen();
    G.sky = 'day'; o.daySeen = seen(); G.sky = 'fog'; seen();
    /* saved, the preference changed, and loaded into a fresh game */
    var blob = JSON.stringify(_rtsSaveState(G));
    _rtsSkySetWant('day');
    _rtsNewGame(999, 'easy');
    _rtsApplyState(window._rtsG, JSON.parse(blob));
    _rtsTick(1 / 60);
    o.loaded = window._rtsG.sky; o.loadedName = _rtsSkyName(window._rtsG);
    /* the storm against the picture, through one rain battle's showers */
    G = window._rtsG; G.sky = 'rain';
    var agree = 0, storms = 0, clears = 0;
    for (var t = RTS_SHOWER_FIRST; t < RTS_SHOWER_FIRST + 900; t += 3) {
      G.t = t; _rtsSkyPlayTick();
      var rain = _rtsSkyNow(G).rain;
      if (G.storm) { storms++; if (rain >= 0.5) agree++; } else { clears++; if (rain < 0.5) agree++; }
    }
    o.agree = agree; o.storms = storms; o.clears = clears;
    return o;
  });
  S.ok('a battle under a chosen fog is a fog battle', o.sky === 'fog' && o.name === 'fog', o.sky + ' / ' + o.name);
  S.ok('...and the player is told nothing sees past five cells - after the battle\'s opening line', o.said.length >= 2 && !/Fog/.test(o.said[0]) &&
       o.said.some(function (m) { return /^Fog: nothing sees past 5 cells/.test(m); }), JSON.stringify(o.said));
  S.ok('...and sees less of the ground than the same base on a clear day', o.fogSeen > 0 && o.fogSeen < o.daySeen * 0.8, o.fogSeen + ' cells against ' + o.daySeen);
  S.ok('a saved fog battle loads as a fog battle, whatever sky is picked since', o.loaded === 'fog' && o.loadedName === 'fog', o.loaded + ' / ' + o.loadedName);
  S.ok('while the play says storm the picture is a downpour, and while it says clear it is not', o.storms > 20 && o.clears > 20 && o.agree === o.storms + o.clears,
       o.agree + ' of ' + (o.storms + o.clears) + ' agree (' + o.storms + ' storming)');

  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');
  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
