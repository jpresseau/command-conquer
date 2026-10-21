/* SURVIVAL WITH THE REAL PAGE (survival.js, title.js, ui/shell.js, ui/sidebar.js, core/survival.js):

     THE BUTTON   the title offers SURVIVAL, its line saying what it is, under a finger
     A RUN        a real click starts a battle with no enemy base and the wave count at nought;
                  the first wave comes at its time
     THE END      the base razed, the card says OVERRUN and how many waves were held, and that it
                  is the best at this difficulty
     THE TITLE    back on the title the button carries that best
     AGAIN        Play again lays another survival, not a plain battle */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('survival');
function centre(sel) {
  var b = document.querySelector(sel);
  if (!b) return null;
  b.scrollIntoView({ block: 'center' });
  var r = b.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2, e = document.elementFromPoint(x, y);
  return { x: x, y: y, hit: e === b || b.contains(e), text: b.textContent };
}
function freeze() { var U = window._rtsUI; if (U) { U.dead = true; try { if (U.raf) cancelAnimationFrame(U.raf); } catch (e) {} } }

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 1100, height: 760 });
  var p = g.page;
  await p.evaluate(function () { try { localStorage.removeItem('bw.survival'); } catch (e) {} rtsSetDiff('normal'); });
  var btn = await p.evaluate(centre, '#rtsSurvival');
  S.ok('THE BUTTON: the title offers SURVIVAL, saying what it is, under a finger', !!btn && btn.hit && /SURVIVAL/.test(btn.text) && /waves until your base falls/.test(btn.text), JSON.stringify(btn));

  await p.mouse.click(btn.x, btn.y);
  await p.waitForFunction(function () { return !!(window._rtsG && window._rtsG.survival && document.getElementById('rcgRts')); }, null, { timeout: 60000 }).catch(function () {});
  var run = await p.evaluate(function (src) {
    eval(src); freeze();
    var G = window._rtsG;
    if (!G || !G.survival) return null;
    var out = { wave0: G.survival.wave, enemy: G.ents.filter(function (e) { return !e.dead && e.side === 'enemy'; }).length };
    for (var i = 0; i < 60 * (RTS_SURV.first + 2); i++) _rtsTick(1 / 60);
    out.wave1 = G.survival.wave; out.t = Math.round(G.t); out.came = G.ents.filter(function (e) { return !e.dead && e.side === 'enemy'; }).length;
    return out;
  }, freeze.toString());
  S.ok('A RUN: a real click starts a battle with no enemy base and no wave yet', !!run && run.wave0 === 0 && run.enemy === 0, JSON.stringify(run));
  S.ok('...and the first wave comes at its time', !!run && run.wave1 === 1 && run.came >= 3, JSON.stringify(run));

  var card = await p.evaluate(function () {
    var G = window._rtsG;
    G.ents.forEach(function (e) { if (e.side === 'player' && e.type === 'struct') { e.hp = 0; _rtsKill(e); } });
    for (var i = 0; i < 30; i++) _rtsTick(1 / 60);
    _rtsSyncSidebar(0);
    var o = document.getElementById('rtsOver');
    return { over: G.over, text: o.textContent, stored: localStorage.getItem('bw.survival') };
  });
  S.ok('THE END: the base razed, the card says OVERRUN, how many waves were held, and that it is the best', card.over === 'lose' && /OVERRUN/.test(card.text) && /Held 1 wave, 2:/.test(card.text) &&
       /Your best at Soldier/.test(card.text) && /"normal":\{"waves":1/.test(card.stored || ''), JSON.stringify(card));

  var again = await p.evaluate(function (src) {
    eval(src);
    rtsRestart();
    return new Promise(function (res) { setTimeout(function () { freeze(); var G = window._rtsG; res({ survival: !!(G && G.survival), wave: G && G.survival && G.survival.wave }); }, 400); });
  }, freeze.toString());
  S.ok('AGAIN: Play again lays another survival', again.survival && again.wave === 0, JSON.stringify(again));

  var title = await p.evaluate(function () { rtsClose(); var n = document.getElementById('rtsSurvivalNote'); return { note: n && n.textContent, flag: !!window._RTS_SURVIVAL }; });
  S.ok('THE TITLE: back on the title the button carries that best, and the next START BATTLE is a plain battle', /best: 1 wave, 2:/.test(title.note || '') && !title.flag, JSON.stringify(title));

  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');
  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
