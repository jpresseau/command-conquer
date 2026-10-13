/* THE SKIRMISH SETUP, WITH REAL CLICKS (src/skirmish.js, title.js, ui/shell.js, rts.save.js):

     THE PANEL      SKIRMISH SETUP opens five rows of choices; a click marks the choice, the
                    button's line says what START BATTLE will make, and it is still chosen after
                    a reload
     THE BATTLE     START BATTLE makes that battle: a 160-cell mirrored lagoon map, 10,000 credits a side,
                    and the 3D view draws the ground at the player's base
     A SAVE         a battle saved on a large map loads onto a large map
     NOT A DAILY    the daily battle is the default map whatever is chosen here
     ALLY ORDERS    in a 2 V 2 the 🤝 ALLY button opens its orders, and ATTACK HERE sends the ally
                    to the middle of the view; with no ally there is no button
     FFA 4          four seats on four teams, named in the top bar, the third foe baked purple
     2 V 2          four seats, named in the top bar, baked in their own colours, and the ally's
                    base is in the player's sight */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('skirmish');
function centre(sel) {
  var b = document.querySelector(sel), r = b && b.getBoundingClientRect();
  return r && r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
}
async function click(p, sel) {
  await p.evaluate(function (s) { var b = document.querySelector(s); if (b) b.scrollIntoView({ block: 'center' }); }, sel);
  var at = await p.evaluate(centre, sel);
  if (at) await p.mouse.click(at.x, at.y);
  return !!at;
}
function waitBattle(p) {
  return p.waitForFunction(function () { return !!(window._rtsG && document.getElementById('rcgRts') && window._rtsR); }, null, { timeout: 60000 }).catch(function () {});
}

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 1100, height: 760 });
  var p = g.page;
  await p.evaluate(function () { try { localStorage.removeItem('bw.skirmish'); } catch (e) {} rtsSkirmishSync(); });
  /* THE GROUND AT THE MIDDLE OF THE VIEW, rendered and read in one task (test/README.md). Read on the
     first frame it was sometimes the shroud: the sight that clears it is rebuilt on its own 15 Hz
     clock, so a frame drawn just after the loop stops can still be dark (measured 12.6 against 71
     on the same seed). So sight is rebuilt first, and a few frames are tried before calling it dark. */
  await p.addInitScript(function () {
    window.litAtCentre = function () {
      var best = 0;
      for (var k = 0; k < 6 && best <= 25; k++) {
        if (typeof _rtsVisTick === 'function') _rtsVisTick(1);
        _rtsRFrame(1 / 60);
        var cv = window._R3D.cv, c = document.createElement('canvas'); c.width = 64; c.height = 64;
        var x = c.getContext('2d'); x.drawImage(cv, cv.width / 2 - 32, cv.height / 2 - 32, 64, 64, 0, 0, 64, 64);
        var d = x.getImageData(0, 0, 64, 64).data, s = 0;
        for (var i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2];
        best = Math.max(best, s / (d.length / 4) / 3);
      }
      return best;
    };
  });

  /* ---------- the panel ---------- */
  var line0 = await p.evaluate(function () { return document.getElementById('rtsSkirmishNote').textContent; });
  await click(p, '#rtsSkirmishBtn');
  var rows = await p.evaluate(function () { return document.querySelectorAll('#rtsSkirmish .diff').length; });
  S.ok('SKIRMISH SETUP opens five rows of choices, on the default', rows === 5 && line0 === '1 foe · standard map · coast · 3,000 credits', rows + ' rows; "' + line0 + '"');
  var hit = [await click(p, '#rtsSkirmish [data-k=size] [data-v=large]'), await click(p, '#rtsSkirmish [data-k=layout] [data-v=mirror]'),
             await click(p, '#rtsSkirmish [data-k=water] [data-v=lagoon]'),
             await click(p, '#rtsSkirmish [data-k=money] [data-v=flush]')];
  var marked = await p.evaluate(function () {
    return { on: Array.prototype.map.call(document.querySelectorAll('#rtsSkirmish button.on'), function (b) { return b.getAttribute('data-v'); }),
             line: document.getElementById('rtsSkirmishNote').textContent };
  });
  S.ok('a click marks the choice, and the button says what START BATTLE will make', hit.every(Boolean) && marked.on.join() === 'one,large,mirror,lagoon,flush' &&
       marked.line === '1 foe · large mirrored map · lagoon · 10,000 credits', JSON.stringify(marked));
  await p.reload();
  await p.waitForFunction(function () { return typeof rtsSkirmishGet === 'function' && !!document.getElementById('rtsSkirmishNote').textContent; }, null, { timeout: 30000 }).catch(function () {});
  var kept = await p.evaluate(function () { return document.getElementById('rtsSkirmishNote').textContent; });
  S.eq('...and it is still chosen after a reload', kept, '1 foe · large mirrored map · lagoon · 10,000 credits');

  /* ---------- the battle ---------- */
  await click(p, '#rtsGo');
  await waitBattle(p);
  var b = await p.evaluate(function () {
    var G = window._rtsG, y = _rtsHas('player', 'yard');
    _rtsR.focus.x = y.x; _rtsR.focus.z = y.z;
    return { N: RTS_N, len: G.terrain.length, sk: G.skirmish, cr: [G.sides.player.credits, G.sides.enemy.credits] };
  });
  S.ok('START BATTLE makes that battle: a 160-cell mirrored lagoon map, 10,000 credits a side', b.N === 160 && b.len === 25600 && b.sk.water === 'lagoon' && b.sk.layout === 'mirror' &&
       b.cr[0] >= 9000 && b.cr[1] >= 9000, JSON.stringify(b));
  /* the ground drawn at the base: render and read the canvas in one task (test/README.md) */
  await p.waitForFunction(function () { return window._rtsG && window._rtsG.t > 1; }, null, { timeout: 60000 }).catch(function () {});
  var lit = await p.evaluate(function () {
    var U = window._rtsUI;
    if (U) { U.dead = true; try { if (U.raf) cancelAnimationFrame(U.raf); } catch (e) {} }
    return litAtCentre();
  });
  S.ok('...and the 3D view draws the ground at the player\'s base', lit > 25, 'mean ' + lit.toFixed(1) + ' of 255');

  /* ---------- a save ---------- */
  var re = await p.evaluate(function () {
    var ok = rtsSaveGame();
    rtsClose();
    try { localStorage.setItem('bw.skirmish', JSON.stringify({ size: 'small' })); } catch (e) {}
    rtsLoadGame();
    return new Promise(function (res) {
      var until = Date.now() + 30000;
      (function wait() {
        var G = window._rtsG;
        if (G && document.getElementById('rcgRts')) return res({ ok: ok, N: RTS_N, len: G.terrain.length, sk: G.skirmish });
        if (Date.now() > until) return res({ ok: ok });
        setTimeout(wait, 100);
      })();
    });
  });
  S.ok('a battle saved on a large map loads onto a large map, whatever is chosen now', re.ok && re.N === 160 && re.len === 25600 && re.sk && re.sk.size === 'large',
       JSON.stringify(re));

  /* ---------- not a daily ---------- */
  var d = await p.evaluate(function () {
    rtsClose();
    rtsDailyStart();
    return new Promise(function (res) {
      var until = Date.now() + 30000;
      (function wait() {
        var G = window._rtsG;
        if (G && window._RTS_DAILY && document.getElementById('rcgRts')) return res({ N: RTS_N, sk: G.skirmish, cr: G.sides.player.credits });
        if (Date.now() > until) return res(null);
        setTimeout(wait, 100);
      })();
    });
  });
  S.ok('the daily battle is the default map whatever is chosen here', !!d && d.N === 128 && d.sk.size === 'standard' && d.sk.water === 'coast', JSON.stringify(d));

  /* ---------- an ally and a second foe ---------- */
  await p.evaluate(function () { rtsClose(); var b = document.getElementById('rtsSkirmish'); if (b) b.hidden = true; });
  await click(p, '#rtsSkirmishBtn');
  var picked = await click(p, '#rtsSkirmish [data-k=foes] [data-v=team]');
  await click(p, '#rtsSkirmish [data-k=size] [data-v=standard]');
  await click(p, '#rtsSkirmish [data-k=layout] [data-v=random]');
  await click(p, '#rtsGo');
  await waitBattle(p);
  await p.waitForFunction(function () { return window._rtsG && window._rtsG.t > 1; }, null, { timeout: 60000 }).catch(function () {});
  var four = await p.evaluate(function () {
    var G = window._rtsG, R = window._rtsR, y = _rtsHas('ally', 'yard');
    var U = window._rtsUI;
    if (U) { U.dead = true; try { if (U.raf) cancelAnimationFrame(U.raf); } catch (e) {} }
    if (y) { R.focus.x = y.x; R.focus.z = y.z; }
    return { order: G.order, vs: document.querySelector('#rcgRts .rts-vs').textContent,
             baked: !!(R.spr && R.spr.bld.ally && R.spr.bld.enemy2 && R.spr.unit.ally.tank), lit: litAtCentre() };
  });
  S.ok('2 V 2 makes four seats, names them in the top bar, and has the ally and second foe\'s colours baked', picked && four.order.join() === 'player,enemy,ally,enemy2' &&
       /\+ ally/.test(four.vs) && /×2/.test(four.vs) && four.baked, JSON.stringify({ order: four.order, vs: four.vs, baked: four.baked }));
  S.ok('...and the 3D view draws the ally\'s base, which the player can see', four.lit > 25, 'mean ' + four.lit.toFixed(1) + ' of 255');

  /* ---------- orders to the ally, with real clicks ---------- */
  var shown = await p.evaluate(function () { var b = document.getElementById('rtsAllyBtn'); return !!b && !b.hidden && b.getBoundingClientRect().height > 20; });
  await click(p, '#rtsAllyBtn');
  var menuOpen = await p.evaluate(function () { var m = document.getElementById('rtsAllyMenu'); return !!m && !m.hidden; });
  await click(p, '#rtsAllyMenu button');
  var cmd = await p.evaluate(function () {
    var c = window._rtsG.sides.ally.ai.cmd, R = window._rtsR;
    return c ? { kind: c.kind, dx: Math.abs(c.x - R.focus.x), dz: Math.abs(c.z - R.focus.z), menu: document.getElementById('rtsAllyMenu').hidden } : null;
  });
  S.ok('in a battle with an ally, 🤝 ALLY opens its orders, and ATTACK HERE sends it where the player is looking', shown && menuOpen && !!cmd &&
       cmd.kind === 'attack' && cmd.dx < 0.01 && cmd.dz < 0.01 && cmd.menu, JSON.stringify({ shown: shown, menuOpen: menuOpen, cmd: cmd }));

  /* ---------- a free-for-all of four ---------- */
  await p.evaluate(function () { rtsClose(); var b = document.getElementById('rtsSkirmish'); if (b) b.hidden = true; });
  await click(p, '#rtsSkirmishBtn');
  var ffaPick = await click(p, '#rtsSkirmish [data-k=foes] [data-v=ffa4]');
  await click(p, '#rtsGo');
  await waitBattle(p);
  var ffa = await p.evaluate(function () {
    var G = window._rtsG, R = window._rtsR, teams = {};
    G.order.forEach(function (k) { teams[G.sides[k].team] = 1; });
    return { order: G.order, teams: Object.keys(teams).length, vs: document.querySelector('#rcgRts .rts-vs').textContent,
             baked: !!(R.spr && R.spr.bld.enemy3 && R.spr.unit.enemy3.tank), allyBtn: !document.getElementById('rtsAllyBtn').hidden };
  });
  S.ok('FFA 4 makes four seats on four teams, says so in the top bar, and bakes the third foe\'s colours', ffaPick && ffa.order.length === 4 && ffa.teams === 4 &&
       /free-for-all ×3/.test(ffa.vs) && ffa.baked && !ffa.allyBtn, JSON.stringify(ffa));

  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');
  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
