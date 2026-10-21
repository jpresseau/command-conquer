/* SURVIVAL WITH THE REAL PAGE (survival.js, title.js, ui/shell.js, ui/sidebar.js, core/survival.js):

     THE BUTTON   the title offers SURVIVAL, its line saying what it is, under a finger
     A RUN        a real click starts a battle with no enemy base and the wave count at nought;
                  the first wave comes at its time
     THE PANEL    the objectives panel carries the run: before the first wave, that it is coming
                  and in how long; with it on the field, how many of it, the next wave's countdown
                  and the bounty; shown inside the window
     THE BOUNTY   the first wave wiped out, the player is paid its bounty and the panel says so
     THE END      the base razed, the card says OVERRUN and how many waves were held, what the
                  bounties earned, and that it is the best at this difficulty
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
    /* the panel as the HUD tick leaves it: shown, its text, and the middle of it reachable */
    function panel() {
      _rtsSyncSidebar(0);
      var el = document.getElementById('rtsGoals');
      el.classList.add('open');
      /* on a desktop the panel lets a click through to the map (pointer-events: none, style.css),
         so what is checked is that it shows: laid out, inside the window, not hidden by style */
      var r = el.getBoundingClientRect(), cs = getComputedStyle(el), pill = el.querySelector('.pill');
      return { hidden: el.hidden, text: el.textContent, pill: pill && pill.textContent, onScreen: r.width > 40 && r.height > 20 && r.top >= 0 && r.bottom <= innerHeight && r.left >= 0,
               shown: cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity > 0.5 };
    }
    out.p0 = panel();
    for (var i = 0; i < 60 * (RTS_SURV.first + 2); i++) _rtsTick(1 / 60);
    out.wave1 = G.survival.wave; out.t = Math.round(G.t); out.came = G.ents.filter(function (e) { return !e.dead && e.side === 'enemy'; }).length;
    out.p1 = panel();
    /* the whole first wave down: the bounty, and what the panel says after */
    var c0 = G.sides.player.credits;
    G.ents.forEach(function (e) { if (e.side === 'enemy' && e.tag === 'w1') { e.hp = 0; _rtsKill(e); } });
    for (i = 0; i < 60 * (RTS_SURV.look + 0.5); i++) _rtsTick(1 / 60);
    out.got = G.sides.player.credits - c0; out.owe = _rtsSurvivalBounty(G, 1); out.msg = G.msg;
    out.p2 = panel();
    return out;
  }, freeze.toString());
  S.ok('A RUN: a real click starts a battle with no enemy base and no wave yet', !!run && run.wave0 === 0 && run.enemy === 0, JSON.stringify(run));
  S.ok('...and the first wave comes at its time', !!run && run.wave1 === 1 && run.came >= 3, JSON.stringify(run));
  S.ok('THE PANEL: before the first wave it says one is coming, and the countdown to it - shown, inside the window; its folded line too',
       !!run && !run.p0.hidden && run.p0.onScreen && run.p0.shown && run.p0.pill === 'First wave in 2:00 ▾' && /Survival/.test(run.p0.text) && /first wave is on its way/.test(run.p0.text) && /Wave 1 in 2:00/.test(run.p0.text),
       JSON.stringify(run && run.p0));
  S.ok('...with the wave on the field, how many of it, the next wave\'s countdown and the bounty for wiping it out',
       !!run && new RegExp('Wave 1 - ' + run.came + ' enemies on the field').test(run.p1.text) && /Wave 2 in 1:0\d/.test(run.p1.text) && /Wipe out wave 1: \+200 credits/.test(run.p1.text),
       JSON.stringify(run && run.p1));
  S.ok('THE BOUNTY: the first wave wiped out, the player is paid it, the message line says so, and the panel offers the next',
       !!run && run.got === run.owe && run.owe === 200 && /Wave 1 wiped out/.test(run.msg || '') && /Wipe out wave 2: \+\d+ credits \(200 earned\)/.test(run.p2.text) && /Wave 1 - 0 enemies/.test(run.p2.text),
       JSON.stringify(run && { got: run.got, owe: run.owe, msg: run.msg, p2: run.p2.text }));

  var card = await p.evaluate(function () {
    var G = window._rtsG;
    G.ents.forEach(function (e) { if (e.side === 'player' && e.type === 'struct') { e.hp = 0; _rtsKill(e); } });
    for (var i = 0; i < 30; i++) _rtsTick(1 / 60);
    _rtsSyncSidebar(0);
    var o = document.getElementById('rtsOver');
    return { over: G.over, text: o.textContent, stored: localStorage.getItem('bw.survival') };
  });
  S.ok('THE END: the base razed, the card says OVERRUN, how many waves were held, the bounties earned, and that it is the best', card.over === 'lose' && /OVERRUN/.test(card.text) && /Held 1 wave, 2:/.test(card.text) && /Bounties earned: 200 credits/.test(card.text) &&
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
