/* THE MINE SWEEPER, ON THE SCREEN (core/sweeper.js, render/frame.js):

     FOUND        an enemy mine is not drawn for the player - until a Mine Sweeper of theirs comes
                  within four cells of it, and then it is, ringed in the enemy's colour
     THE BUTTON   the sweeper is on the Vehicle Works' list, and a real click on it starts one */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('sweeper');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 1000, height: 700 });
  await g.start(7, 1, { freeze: true });
  var p = g.page;

  var seen = await p.evaluate(function () {
    var G = window._rtsG, R = _rtsR, yd = _rtsHas('player', 'yard');
    for (var i = 0; i < RTS_N * RTS_N; i++) { G.mapped[i] = 1; G.vis[i] = 1; }
    var c = _rtsNearestOpen(yd.tx + 12, yd.tz + 6, 6, null);
    G.mines = [{ tx: c[0], tz: c[1], side: 'enemy', arm: 0 }];
    R.focus.x = _rtsWX(c[0]); R.focus.z = _rtsWX(c[1]); R.zi = RTS_ZOOMS.length - 2; _rtsApplyCam();
    function dark() {
      _rtsRFrame(0);
      var s = _rtsGroundToScreen(_rtsWX(c[0]), _rtsWX(c[1])), d = R.dpr;
      var px = R.g.getImageData(Math.round(s.x * d) - 2, Math.round(s.y * d) - 2, 5, 5).data, a = 0;
      for (var i = 3; i < px.length; i += 4) a += px[i];
      return a / 25;
    }
    var o = { before: dark() };
    var sw = _rtsSpawnUnit('player', 'sweeper', _rtsWX(c[0] - 3), _rtsWX(c[1]));
    sw.order = 'hold';
    _rtsSweepTick(1 / 60);
    o.after = dark();
    o.shown = _rtsMineShown(G.mines[0], 'player');
    sw.dead = true;
    return o;
  });
  S.ok('an enemy mine is not drawn for the player', seen.before < 10, 'overlay alpha ' + seen.before.toFixed(0));
  S.ok('...until a Mine Sweeper of theirs comes within four cells, and then it is', seen.shown && seen.after > 150, 'overlay alpha ' + seen.after.toFixed(0));

  /* the button: a Vehicle Works, and the sweeper on its list */
  var btn = await p.evaluate(function () {
    var G = window._rtsG, yd = _rtsHas('player', 'yard');
    ['power', 'refinery', 'factory'].forEach(function (k) {
      for (var r = 4; r < 30; r++) { var sp = _rtsNearestOpen(yd.tx - r, yd.tz + 4, 4, null); if (sp && _rtsCanPlace('player', k, sp[0], sp[1], true)) { var e = _rtsPlaceStruct('player', k, sp[0], sp[1], true); e.building = 0; break; } }
    });
    _rtsRecalcPower('player'); _rtsGrant(G.sides.player, 5000);
    if (typeof rtsTab === 'function') rtsTab('vehicle');
    _rtsSyncSidebar(0);
    var b = document.querySelector('[data-key="sweeper"]') || Array.prototype.filter.call(document.querySelectorAll('#rcgRts button, #rcgRts .cameo'), function (x) { return /Mine Sweeper/.test(x.title || x.getAttribute('aria-label') || ''); })[0];
    if (!b) return null;
    b.scrollIntoView({ block: 'center' });                    /* the list scrolls, as it does for a player */
    var r = b.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, hit: document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === b || b.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)) };
  });
  S.ok('the sweeper is on the Vehicle Works\' list, where a finger can reach it', !!btn && btn.hit, JSON.stringify(btn));
  if (btn) await p.mouse.click(btn.x, btn.y);
  var q = await p.evaluate(function () { var v = window._rtsG.sides.player.q || {}; return v.vehicle ? v.vehicle.key : null; });
  S.eq('...and a real click on it starts one', q, 'sweeper');

  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');
  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
