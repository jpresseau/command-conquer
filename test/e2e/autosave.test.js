/* THE AUTOSAVE, WITH THE REAL PAGE (autosave.js, rts.save.js, ui/shell.js, title.js):

     A MINUTE IN    the HUD tick writes the battle a minute after it opened
     HIDDEN         the page hidden (switched away from, locked, the app closed) writes it at once
     REOPENED       the page loaded again, as an app closed and opened is: the title offers CONTINUE
                    with the battle's own line, and a real click brings the battle back where it
                    was hidden - its clock and every unit and building
     ⟳ RELOAD       the prompt says the battle is kept, and after the reload CONTINUE has it
     ✕ QUIT         the prompt says CONTINUE brings it back; leaving writes it, and the title
                    offers it
     NOT ANY MORE   a new battle drops the last one's autosave; a battle that ends drops its own;
                    a save of the player's own that is newer hides CONTINUE behind RESUME BATTLE;
                    and an autosave from an earlier build is dropped with a note saying so */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('autosave');

function centre(sel) {
  var b = document.querySelector(sel);
  if (!b) return null;
  b.scrollIntoView({ block: 'center' });
  var r = b.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}
/* the HUD tick once a second, as the frame loop runs it, for `secs` seconds of battle */
function tickFor(secs) {
  for (var i = 0; i < 60 * secs; i++) { _rtsTick(1 / 60); if (i % 60 === 59) _rtsSyncSidebar(0); }
}
function ids() {
  return window._rtsG.ents.filter(function (e) { return !e.dead; }).map(function (e) { return e.id; }).sort(function (a, b) { return a - b; }).join(',');
}
function title() {
  var c = document.getElementById('rtsContinue'), r = document.getElementById('rtsResume'), n = document.getElementById('rtsAutoNote');
  return { cont: !!c && !c.hidden, contText: c ? c.textContent : '', resume: !!r && !r.hidden, note: n && !n.hidden ? n.textContent : '',
           info: rtsSaveInfo('auto') && { t: rtsSaveInfo('auto').t, desc: rtsSaveInfo('auto').desc } };
}
async function reopened(p) {
  await p.waitForFunction(function () { return typeof window.rtsOpen === 'function' && !!document.getElementById('rtsContinue'); }, null, { timeout: 60000 });
}

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 1100, height: 760 });
  var p = g.page;

  /* ---------- a minute in ---------- */
  await g.start(7, 0, { freeze: true });
  var m = await p.evaluate(function (src) {
    eval(src);
    try { localStorage.removeItem('rccmd.save1'); localStorage.removeItem('rccmd.save1.info'); } catch (e) {}
    tickFor(50);
    var before = rtsSaveInfo('auto');
    tickFor(12);
    var a = rtsSaveInfo('auto');
    return { before: before, t: a && a.t, desc: a && a.desc };
  }, tickFor.toString());
  S.ok('A MINUTE IN: the HUD tick writes the battle a minute after it opened, not before', m.before === null && m.t >= 60 && m.t <= 62 && /units and buildings/.test(m.desc || ''),
       JSON.stringify(m));

  /* ---------- hidden ---------- */
  var h = await p.evaluate(function (a) {
    eval(a[0]); eval(a[1]);
    tickFor(9);
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: function () { return 'hidden'; } });
    document.dispatchEvent(new Event('visibilitychange'));
    delete document.visibilityState;
    var i = rtsSaveInfo('auto');
    return { t: i && i.t, now: Math.round(window._rtsG.t), ids: ids() };
  }, [tickFor.toString(), ids.toString()]);
  S.ok('HIDDEN: the page hidden writes it at once', h.t === h.now && h.t >= 70, JSON.stringify({ t: h.t, now: h.now }));

  /* ---------- reopened ---------- */
  await p.reload({ waitUntil: 'load' });
  await reopened(p);
  var t1 = await p.evaluate(title);
  S.ok('REOPENED: the title offers CONTINUE with the battle\'s own line, and no RESUME BATTLE (there is no save of the player\'s own)',
       t1.cont && /CONTINUE/.test(t1.contText) && /autosaved/.test(t1.contText) && /units and buildings/.test(t1.contText) && !t1.resume && !!t1.info && t1.info.t === h.t,
       JSON.stringify(t1));
  var at = await p.evaluate(centre, '#rtsContinue');
  if (at) await p.mouse.click(at.x, at.y);
  await p.waitForFunction(function () { return !!(window._rtsG && document.getElementById('rcgRts')); }, null, { timeout: 60000 }).catch(function () {});
  var back = await p.evaluate(function (src) {
    eval(src);
    var U = window._rtsUI, G = window._rtsG;
    if (!G) return null;
    if (U) { U.dead = true; try { if (U.raf) cancelAnimationFrame(U.raf); } catch (e) {} }
    return { t: G.t, ids: ids(), msg: G.msg };
  }, ids.toString());
  S.ok('...and a real click brings the battle back where it was hidden: its clock, and every unit and building', !!back && back.t >= h.t - 0.5 && back.t < h.t + 3 &&
       back.ids.indexOf(h.ids) === 0 && /resumed/i.test(back.msg || ''), JSON.stringify(back && { t: back.t, same: back.ids === h.ids, msg: back.msg }));

  /* ---------- ⟳ reload ---------- */
  var arm = await p.evaluate(function (src) {
    eval(src);
    tickFor(5);
    rtsReloadClick();
    return { msg: window._rtsG.msg, t: Math.round(window._rtsG.t) };
  }, tickFor.toString());
  S.ok('⟳ RELOAD: the prompt says the battle is kept', /autosaved first/.test(arm.msg || '') && !/not saved/.test(arm.msg || ''), arm.msg);
  await Promise.all([p.waitForNavigation({ waitUntil: 'load', timeout: 60000 }).catch(function () {}),
                     p.evaluate(function () { rtsReloadClick(); }).catch(function () {})]);
  await reopened(p);
  var t2 = await p.evaluate(title);
  S.ok('...and after the reload CONTINUE has it, at the moment of the reload', t2.cont && !!t2.info && t2.info.t === arm.t, JSON.stringify({ t2: t2.info, armed: arm.t }));

  /* ---------- ✕ quit ---------- */
  at = await p.evaluate(centre, '#rtsContinue');
  if (at) await p.mouse.click(at.x, at.y);
  await p.waitForFunction(function () { return !!(window._rtsG && document.getElementById('rcgRts')); }, null, { timeout: 60000 }).catch(function () {});
  var quit = await p.evaluate(function (a) {
    eval(a[0]); eval(a[1]);
    var U = window._rtsUI;
    if (U) { U.dead = true; try { if (U.raf) cancelAnimationFrame(U.raf); } catch (e) {} }
    tickFor(7);
    rtsQuitClick();
    var msg = window._rtsG.msg, t = Math.round(window._rtsG.t);
    rtsQuitClick();
    var after = eval('(' + a[2] + ')')();
    return { msg: msg, t: t, gone: !window._rtsG, title: after };
  }, [tickFor.toString(), ids.toString(), title.toString()]);
  S.ok('✕ QUIT: the prompt says CONTINUE brings it back', /CONTINUE on the title brings it back/.test(quit.msg || ''), quit.msg);
  S.ok('...and leaving writes it, and the title offers it', quit.gone && quit.title.cont && !!quit.title.info && quit.title.info.t === quit.t, JSON.stringify(quit.title));

  /* ---------- not any more ---------- */
  var gone = await p.evaluate(function (a) {
    eval(a[0]);
    var out = {};
    rtsOpen(9);
    var U = window._rtsUI; if (U) { U.dead = true; try { if (U.raf) cancelAnimationFrame(U.raf); } catch (e) {} }
    out.newBattle = rtsSaveInfo('auto');
    tickFor(62);
    out.written = !!rtsSaveInfo('auto');
    window._rtsG.over = 'win';
    _rtsSyncSidebar(0);
    out.ended = rtsSaveInfo('auto');
    rtsClose();
    rtsOpen(11);
    U = window._rtsUI; if (U) { U.dead = true; try { if (U.raf) cancelAnimationFrame(U.raf); } catch (e) {} }
    tickFor(62);
    out.again = !!rtsSaveInfo('auto');
    rtsSaveGame();
    rtsClose();
    out.mine = eval('(' + a[1] + ')')();
    var raw = JSON.parse(localStorage.getItem('rccmd.auto1.info')); raw.v += 1; raw.when = Date.now() + 1e6;
    localStorage.setItem('rccmd.auto1.info', JSON.stringify(raw));
    rtsHome();
    out.stale = eval('(' + a[1] + ')')();
    out.staleKeys = [localStorage.getItem('rccmd.auto1'), localStorage.getItem('rccmd.auto1.info')].filter(Boolean).length;
    return out;
  }, [tickFor.toString(), title.toString()]);
  S.ok('NOT ANY MORE: a new battle drops the last one\'s autosave', gone.newBattle === null, JSON.stringify(gone.newBattle));
  S.ok('...a battle that ends drops its own', gone.written && gone.ended === null, JSON.stringify({ written: gone.written, ended: gone.ended }));
  S.ok('...a save of the player\'s own that is newer hides CONTINUE behind RESUME BATTLE', gone.again && !gone.mine.cont && gone.mine.resume, JSON.stringify(gone.mine));
  S.ok('...and an autosave from an earlier build is dropped, with a note saying so', !gone.stale.cont && /earlier version/.test(gone.stale.note) && gone.staleKeys === 0,
       JSON.stringify({ stale: gone.stale, keys: gone.staleKeys }));

  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');
  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
