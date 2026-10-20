/* SAVE SLOTS, WITH THE REAL PAGE (ui/slots.js, rts.save.js, title.js, autosave.js):

     ONE BATTLE     💾 writes slot 1 and no other; 📂 with one slot filled brings it straight back,
                    with no panel, and the next save goes to it
     THE PANEL      📂 with two filled opens the panel instead: three rows, what each holds, the
                    one in use marked, SAVE HERE on each, LOAD on the filled ones - and every button
                    is what a pointer at its centre lands on, on a desktop and on a phone
     SAVE HERE      a real click on row 2's writes slot 2 and makes it the slot in use: 💾 now goes
                    there, and slot 1 is byte-identical
     LOAD           a real click on row 1's brings slot 1's battle back - its clock - and the next
                    💾 goes to slot 1 again
     PAUSED         the paused screen's SAVED BATTLES opens the panel over it
     THE TITLE      after ✕, RESUME BATTLE is the newest slot and the other is listed under it, a
                    real click bringing it back; CONTINUE is offered against the newest slot, not
                    slot 1 */

var { chromium, devices } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('slots');

function tickFor(secs) { for (var i = 0; i < 60 * secs; i++) _rtsTick(1 / 60); }
function freeze() { var U = window._rtsUI; if (U) { U.dead = true; try { if (U.raf) cancelAnimationFrame(U.raf); } catch (e) {} } }
function slotT() { return ['save', 'save2', 'save3'].map(function (k) { var i = rtsSaveInfo(k); return i ? i.t : null; }); }
function panel() {
  var P = document.getElementById('rtsSlots');
  if (!P || P.hidden) return { open: false };
  return { open: true, rows: [].map.call(P.querySelectorAll('.slot'), function (r) {
    return { slot: r.getAttribute('data-slot'), act: r.classList.contains('act'), text: r.querySelector('.d').textContent,
             save: !!r.querySelector('.save'), load: !!r.querySelector('.load') };
  }) };
}
/* the real reachability check: is the button what a pointer at its centre lands on */
function under(sel) {
  var b = document.querySelector(sel);
  if (!b) return 'missing';
  var r = b.getBoundingClientRect(), e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return e === b || b.contains(e) ? 'yes' : (e ? e.tagName + '.' + e.className : 'nothing');
}
function click(sel) { var b = document.querySelector(sel); if (!b) return false; b.click(); return true; }
function title() {
  var r = document.getElementById('rtsResume'), c = document.getElementById('rtsContinue'), box = document.getElementById('rtsSaves');
  return { resume: !!r && !r.hidden, resumeText: r ? r.textContent : '', cont: !!c && !c.hidden, box: !!box && !box.hidden,
           others: box ? [].map.call(box.querySelectorAll('button'), function (b) { return b.textContent; }) : [] };
}
var LIB = [tickFor, freeze, slotT, panel, under, click, title].map(String).join('\n');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 1100, height: 760 });
  var p = g.page;
  await g.start(7, 0, { freeze: true });

  /* ---------- one battle ---------- */
  var one = await p.evaluate(function (lib) {
    eval(lib);
    Object.keys(localStorage).filter(function (k) { return /^rccmd\./.test(k); }).forEach(function (k) { localStorage.removeItem(k); });
    tickFor(10);
    click('#rtsSaveBtn');
    var t1 = Math.round(window._rtsG.t), after = slotT(), active = rtsSlotActive(), msg = window._rtsG.msg;
    window._rtsG.mark = 'first';
    click('#rtsLoadBtn');
    freeze();
    return { t1: t1, after: after, active: active, msg: msg, loadedT: Math.round(window._rtsG.t), fresh: window._rtsG.mark !== 'first', panel: panel(), slot: window._RTS_SLOT };
  }, LIB);
  S.ok('ONE BATTLE: 💾 writes slot 1 and no other', one.after[0] === one.t1 && one.after[1] === null && one.after[2] === null && one.active === 'save' && /saved/i.test(one.msg || ''), JSON.stringify(one));
  S.ok('...and 📂 with one slot filled brings it straight back, with no panel, and the next save goes to it', one.fresh && one.loadedT >= one.t1 && one.loadedT <= one.t1 + 2 && !one.panel.open && one.slot === 'save',
       JSON.stringify({ loadedT: one.loadedT, t1: one.t1, fresh: one.fresh, panel: one.panel, slot: one.slot }));

  /* ---------- the panel, and save here ---------- */
  var two = await p.evaluate(function (lib) {
    eval(lib);
    tickFor(10);
    rtsSlotsPanel(true);
    var p0 = panel(), hit = { save2: under('#rtsSlots .slot[data-slot=save2] .save'), load1: under('#rtsSlots .slot[data-slot=save] .load'), x: under('#rtsSlots .hd .x') };
    var body1 = localStorage.getItem('rccmd.save1'), info1 = localStorage.getItem('rccmd.save1.info');
    click('#rtsSlots .slot[data-slot=save2] .save');
    var t2 = Math.round(window._rtsG.t), p1 = panel(), after1 = slotT();
    tickFor(5);
    click('#rtsSaveBtn');
    var after2 = slotT();
    return { p0: p0, hit: hit, t2: t2, p1: p1, after1: after1, after2: after2, active: rtsSlotActive(), same: localStorage.getItem('rccmd.save1') === body1 && localStorage.getItem('rccmd.save1.info') === info1 };
  }, LIB);
  var r0 = two.p0.rows || [];
  S.ok('THE PANEL: three rows - slot 1 in use with SAVE HERE and LOAD, slots 2 and 3 empty with SAVE HERE alone', two.p0.open && r0.length === 3 &&
       r0[0].slot === 'save' && r0[0].act && /in use/.test(r0[0].text) && /units and buildings/.test(r0[0].text) && r0[0].save && r0[0].load &&
       r0[1].slot === 'save2' && !r0[1].act && /^empty/.test(r0[1].text) && r0[1].save && !r0[1].load && r0[2].slot === 'save3' && !r0[2].act && /^empty/.test(r0[2].text) && r0[2].save && !r0[2].load,
       JSON.stringify(two.p0));
  S.ok('...and every button is what a pointer at its centre lands on', two.hit.save2 === 'yes' && two.hit.load1 === 'yes' && two.hit.x === 'yes', JSON.stringify(two.hit));
  var r1 = two.p1.rows || [];
  S.ok('SAVE HERE: a real click on row 2\'s writes slot 2 and makes it the slot in use, slot 1 byte-identical', two.after1[0] === one.t1 && two.after1[1] === two.t2 && two.after1[2] === null && two.t2 >= one.t1 + 10 &&
       two.same && r1.length === 3 && r1[1].act && r1[1].load && /in use/.test(r1[1].text) && !r1[0].act && r1[0].load, JSON.stringify({ after1: two.after1, t1: one.t1, t2: two.t2, same: two.same, p1: two.p1 }));
  S.ok('...and 💾 now goes there', two.after2[0] === one.t1 && two.after2[1] === two.t2 + 5 && two.after2[2] === null && two.active === 'save2', JSON.stringify({ after2: two.after2, active: two.active }));

  /* ---------- 📂 with two filled, and load ---------- */
  var three = await p.evaluate(function (lib) {
    eval(lib);
    rtsSlotsPanel(false);
    var closed = !panel().open;
    window._rtsG.mark = 'second';
    tickFor(3);
    click('#rtsLoadBtn');
    var opened = panel().open, sameG = window._rtsG.mark === 'second';
    click('#rtsSlots .slot[data-slot=save] .load');
    freeze();
    var loaded = { t: Math.round(window._rtsG.t), fresh: window._rtsG.mark !== 'second', slot: window._RTS_SLOT, panel: panel().open };
    tickFor(2);
    click('#rtsSaveBtn');
    return { closed: closed, opened: opened, sameG: sameG, loaded: loaded, after: slotT() };
  }, LIB);
  S.ok('📂 with two slots filled opens the panel and loads nothing', three.closed && three.opened && three.sameG, JSON.stringify({ closed: three.closed, opened: three.opened, sameG: three.sameG }));
  S.ok('LOAD: a real click on row 1\'s brings slot 1\'s battle back, at its clock, and closes the panel', three.loaded.fresh && three.loaded.t >= one.t1 && three.loaded.t <= one.t1 + 2 && three.loaded.slot === 'save' && !three.loaded.panel,
       JSON.stringify({ loaded: three.loaded, t1: one.t1 }));
  S.ok('...and the next 💾 goes to slot 1 again, slot 2 untouched', three.after[0] === one.t1 + 2 && three.after[1] === two.t2 + 5 && three.after[2] === null, JSON.stringify(three.after));

  /* ---------- from the paused screen ---------- */
  var paused = await p.evaluate(function (lib) {
    eval(lib);
    rtsPauseToggle(true);
    var btn = under('#rtsPause .slotsbtn');
    click('#rtsPause .slotsbtn');
    var out = { btn: btn, panel: panel(), save3: under('#rtsSlots .slot[data-slot=save3] .save') };
    rtsSlotsPanel(false); rtsPauseToggle(false);
    return out;
  }, LIB);
  S.ok('PAUSED: the paused screen\'s SAVED BATTLES opens the panel over it, every button still under a pointer', paused.btn === 'yes' && paused.panel.open && (paused.panel.rows || []).length === 3 && paused.save3 === 'yes',
       JSON.stringify(paused));

  /* ---------- the title ---------- */
  var four = await p.evaluate(function (lib) {
    eval(lib);
    tickFor(1);
    rtsQuitClick(); rtsQuitClick();
    var a = title(), auto = rtsSaveInfo('auto'), d = { save: rtsSaveInfo('save').desc, save2: rtsSaveInfo('save2').desc };
    var raw = JSON.parse(localStorage.getItem('rccmd.save2.info')); raw.when = Date.now() + 1e6; localStorage.setItem('rccmd.save2.info', JSON.stringify(raw));
    rtsHome();
    var b = title();
    click('#rtsSaves button');
    freeze();
    return { gone: !document.getElementById('rtsSlots'), a: a, d: d, auto: auto && auto.t, b: b, back: window._rtsG && { t: Math.round(window._rtsG.t), slot: window._RTS_SLOT } };
  }, LIB);
  var tA = one.t1 + 2, d = four.d || {};
  S.ok('THE TITLE: after ✕ RESUME BATTLE is the newest slot, slot 1, and slot 2 is listed under it', four.gone && four.a.resume && !!d.save && d.save !== d.save2 && four.a.resumeText.indexOf(d.save) >= 0 && four.a.box &&
       four.a.others.length === 1 && four.a.others[0].indexOf(d.save2) >= 0 && /slot 2/.test(four.a.others[0]), JSON.stringify({ a: four.a, d: d }));
  S.ok('...the autosave written on leaving is newer than any slot, so CONTINUE is offered', four.a.cont && four.auto === tA + 1, JSON.stringify({ cont: four.a.cont, auto: four.auto, tA: tA }));
  S.ok('...slot 2 made newer than the autosave: it is RESUME BATTLE, slot 1 is under it, and CONTINUE goes - the autosave is weighed against the newest slot, not slot 1',
       four.b.resume && four.b.resumeText.indexOf(d.save2) >= 0 && four.b.others.length === 1 && /slot 1/.test(four.b.others[0]) && four.b.others[0].indexOf(d.save) >= 0 && !four.b.cont, JSON.stringify({ b: four.b, d: d }));
  S.ok('...and a real click on the slot under it brings that battle back, as the slot in use', !!four.back && four.back.t >= tA && four.back.t <= tA + 2 && four.back.slot === 'save', JSON.stringify(four.back));
  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');
  await g.close();

  /* ---------- a phone ---------- */
  var ph = await openPage(browser, { device: devices['Galaxy S8'] });
  await ph.start(7, 0, { freeze: true });
  var phone = await ph.page.evaluate(function (lib) {
    eval(lib);
    Object.keys(localStorage).filter(function (k) { return /^rccmd\./.test(k); }).forEach(function (k) { localStorage.removeItem(k); });
    tickFor(3);
    rtsSaveGame(); rtsSaveGame('save2');
    rtsSlotsPanel(true);
    var P = document.getElementById('rtsSlots'), r = P.getBoundingClientRect();
    var hitsX = under('#rtsSlots .hd .x');
    return { w: innerWidth, left: r.left, right: r.right, rows: panel().rows.length, buttons: P.querySelectorAll('button').length, x: hitsX,
             every: [].every.call(P.querySelectorAll('.slot button'), function (b) { var q = b.getBoundingClientRect(), e = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2); return e === b || b.contains(e); }) };
  }, LIB);
  S.ok('A PHONE: the panel fits the screen and every one of its buttons is what a finger at its centre lands on', phone.left >= 0 && phone.right <= phone.w && phone.rows === 3 && phone.buttons === 6 && phone.every && phone.x === 'yes',
       JSON.stringify(phone));
  S.ok('no page errors on the phone', !ph.errors.length, ph.errors.join(' | ') || 'none');
  await ph.close();
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
