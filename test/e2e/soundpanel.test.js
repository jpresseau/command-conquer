/* THE SOUND PANEL (ui/soundpanel.js, rtsVolSet in rts.audio.js), worked with real input: a
   click on the 🔊, keys on the sliders, a touch on a phone.

     IT OPENS      the 🔊 opens it where a press can reach every control
     THE LEVELS    music to nothing stops the score, effects to half halves its bus, the world to
                   nothing silences the bed - and bringing the music back starts the score again
     IT REMEMBERS  across a reload, the levels are as they were left
     THE MUTE      is its first line, and still mutes
     IT CLOSES     on Escape, and on a press outside it
     ON A PHONE    a touch on the 🔊 opens it, all of it on the screen */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('soundpanel');

/* the centre of an element, and whether a press there lands on it */
async function at(page, sel) {
  return page.evaluate(function (q) {
    var e = document.querySelector(q);
    if (!e) return null;
    var r = e.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2, hit = document.elementFromPoint(x, y);
    return { x: x, y: y, r: { l: r.left, t: r.top, rt: r.right, b: r.bottom }, reach: !!hit && (hit === e || e.contains(hit)) };
  }, sel);
}
function levels(page) {
  return page.evaluate(function () {
    var A = _rtsA, B = A.amb;
    return { sfx: +A.sfx.gain.value.toFixed(3), mus: +A.mus.gain.value.toFixed(3), amb: B ? +B.bus.gain.value.toFixed(3) : null,
             music: !!A.music, muted: !!A.muted, open: !!document.getElementById('rtsSoundPanel') && !document.getElementById('rtsSoundPanel').hidden,
             saved: localStorage.getItem('rtsSoundVol'), label: (document.getElementById('rtsMute') || {}).textContent || null,
             battle: !!document.getElementById('rtsMute') };
  });
}
async function settle(page) { await page.waitForTimeout(250); }

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 1200, height: 800 });
  await g.page.evaluate(function () { try { localStorage.removeItem('rtsSoundVol'); } catch (e) {} });
  await g.start(7, 1);
  var p = g.page;
  await p.evaluate(function () { _rtsAudioInit(); _rtsAudioResume(); _rtsAmbTick(1); });

  /* IT OPENS */
  var b = await at(p, '#rtsMute');
  await p.mouse.click(b.x, b.y);
  await settle(p);
  var L0 = await levels(p);
  var reach = [];
  for (var sel of ['#rtsSoundMute', '#rtsVol_mus', '#rtsVol_sfx', '#rtsVol_amb', '#rtsSoundClose']) { var a = await at(p, sel); if (!a || !a.reach) reach.push(sel); }
  S.ok('the 🔊 opens the panel', L0.open, '');
  S.ok('...where a press reaches every control in it', !reach.length, reach.join(', ') || 'mute, three sliders, close');
  S.ok('...the sliders at full on a first visit', L0.sfx === 0.6 && L0.mus === 0.28 && L0.music, JSON.stringify(L0));

  /* THE LEVELS, by the keys a slider answers to */
  async function key(sel, keys) { await p.focus(sel); for (var k of keys) await p.keyboard.press(k); await settle(p); }
  var cam0 = await p.evaluate(function () { return _rtsR.focus.x + ',' + _rtsR.focus.z; });
  await key('#rtsVol_mus', ['Home']);
  var L1 = await levels(p), cam1 = await p.evaluate(function () { return _rtsR.focus.x + ',' + _rtsR.focus.z; });
  S.eq('a key in a slider moves the slider, not the camera', cam1, cam0);
  S.ok('music to nothing stops the score', !L1.music && L1.mus < 0.01, JSON.stringify({ mus: L1.mus, music: L1.music }));
  await key('#rtsVol_sfx', ['End', 'ArrowLeft', 'ArrowLeft', 'ArrowLeft', 'ArrowLeft', 'ArrowLeft', 'ArrowLeft', 'ArrowLeft', 'ArrowLeft', 'ArrowLeft', 'ArrowLeft']);
  await key('#rtsVol_amb', ['Home']);
  var L2 = await levels(p);
  S.ok('effects to half halves their bus', Math.abs(L2.sfx - 0.3) < 0.01, 'sfx ' + L2.sfx);
  S.ok('the world to nothing silences the bed', L2.amb !== null && L2.amb < 0.01, 'amb ' + L2.amb);
  var shown = await p.evaluate(function () { return ['mus', 'sfx', 'amb'].map(function (k) { return document.getElementById('rtsVolV_' + k).textContent; }).join(' '); });
  S.eq('...and the panel says so', shown, 'off 50% off');

  /* IT REMEMBERS */
  await p.reload({ waitUntil: 'load' });
  await p.waitForFunction(function () { return typeof window.rtsOpen === 'function'; });
  await g.start(7, 1);
  await p.evaluate(function () { _rtsAudioInit(); _rtsAudioResume(); _rtsMusicStart(); _rtsAmbTick(1); });
  var L3 = await levels(p);
  S.ok('across a reload the levels are as they were left, the score still off', Math.abs(L3.sfx - 0.3) < 0.01 && L3.mus < 0.01 && !L3.music && L3.amb < 0.01,
       JSON.stringify({ sfx: L3.sfx, mus: L3.mus, amb: L3.amb, music: L3.music, saved: L3.saved }));
  b = await at(p, '#rtsMute');
  await p.mouse.click(b.x, b.y);
  await settle(p);
  await key('#rtsVol_mus', ['End']);
  var L4 = await levels(p);
  S.ok('bringing the music back starts the score again', L4.music && Math.abs(L4.mus - 0.28) < 0.01, JSON.stringify({ mus: L4.mus, music: L4.music }));

  /* THE MUTE */
  var m = await at(p, '#rtsSoundMute');
  await p.mouse.click(m.x, m.y);
  await settle(p);
  var L5 = await levels(p);
  var master = await p.evaluate(function () { return _rtsA.master.gain.value; });
  S.ok('the panel\'s first line mutes', L5.muted && L5.label === '🔇' && master < 0.05, JSON.stringify({ muted: L5.muted, label: L5.label, master: +master.toFixed(3) }));
  await p.mouse.click(m.x, m.y);
  await settle(p);

  /* IT CLOSES */
  await p.keyboard.press('Escape');
  await settle(p);
  var L6 = await levels(p);
  /* Escape with the panel open closes the panel - it does not leave the battle, which is what
     Escape does when there is nothing else to cancel (ui/input.js) */
  S.ok('Escape closes the panel and the battle carries on', !L6.open && L6.battle, 'open ' + L6.open + ', battle ' + L6.battle);
  if (!L6.battle) { await g.close(); await browser.close(); return require('../lib/report.js')(S); }
  await p.mouse.click(b.x, b.y);
  await settle(p);
  var reopened = (await levels(p)).open;
  var field = await at(p, '#rtsCv');                   /* outside it: the battlefield */
  await p.mouse.click(field.x - 150, field.y);
  await settle(p);
  var L7 = await levels(p);
  S.ok('...and it opens again, and a press outside it closes it', reopened && !L7.open, [reopened, L7.open].join(' '));
  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');
  await g.close();

  /* ON A PHONE */
  var ph = await openPage(browser, { device: { viewport: { width: 375, height: 667 }, deviceScaleFactor: 2 } });
  await ph.start(7, 1);
  var t = await ph.touch();
  var pb = await at(ph.page, '#rtsMute');
  await t.start(pb.x, pb.y); await t.end();
  await settle(ph.page);
  var open = await ph.page.evaluate(function () { var P = document.getElementById('rtsSoundPanel'); return P && !P.hidden; });
  var box = await at(ph.page, '#rtsSoundPanel'), off = [];
  for (var s2 of ['#rtsSoundMute', '#rtsVol_mus', '#rtsVol_sfx', '#rtsVol_amb', '#rtsSoundClose']) { var q = await at(ph.page, s2); if (!q || !q.reach) off.push(s2); }
  S.ok('on a phone a touch on the 🔊 opens it', open, '');
  S.ok('...all of it on the screen, every control in reach', box && box.r.l >= 0 && box.r.rt <= 375 && box.r.b <= 667 && !off.length,
       box ? ('panel ' + Math.round(box.r.l) + '-' + Math.round(box.r.rt) + ' x ' + Math.round(box.r.t) + '-' + Math.round(box.r.b) + (off.length ? ', unreachable ' + off.join(' ') : '')) : 'no panel');
  S.ok('no page errors on the phone', !ph.errors.length, ph.errors.join(' | ') || 'none');
  await ph.close();

  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
