/* PAUSE AND SPEED, WITH THE REAL LOOP (ui/pause.js, ui/camera.js, ui/keys.js, ui/shell.js):

     P            pauses: the paused screen shows, the ⏸ reads ▶, frames go on being drawn and the
                  clock does not move; P again resumes and the clock moves
     THE SPEED    2× on the paused screen is kept, the ⏸ says so, and after RESUME the loop runs
                  two ticks a frame - counted, not timed
     THE END      a battle that is over does not pause */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('pause');

/* frames drawn, and ticks run, counted by wrapping the two the loop calls by name */
function count() {
  if (window.__cnt) return window.__cnt;
  var C = window.__cnt = { frames: 0, ticks: 0 }, pan = window._rtsPanTick, tick = window._rtsTick;
  window._rtsPanTick = function (dt) { C.frames++; return pan(dt); };
  window._rtsTick = function (dt) { C.ticks++; return tick(dt); };
  return C;
}
function moreFrames(p, n) {
  return p.evaluate(function (n) {
    var C = window.__cnt, f0 = C.frames, until = Date.now() + 60000;
    return new Promise(function (res) { (function w() { if (C.frames >= f0 + n || Date.now() > until) res(C.frames - f0); else setTimeout(w, 50); })(); });
  }, n);
}

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 1100, height: 760 });
  var p = g.page;
  await g.start(7, 2);
  await p.evaluate(function (src) { eval('(' + src + ')')(); }, count.toString());

  /* ---------- P ---------- */
  var before = await p.evaluate(function () { return { t: window._rtsG.t, btn: document.getElementById('rtsPauseBtn').textContent }; });
  await p.keyboard.press('p');
  await p.waitForFunction(function () { return !document.getElementById('rtsPause').hidden; }, null, { timeout: 10000 }).catch(function () {});
  var t0 = await p.evaluate(function () { return window._rtsG.t; });
  var drawn = await moreFrames(p, 4);
  var held = await p.evaluate(function () {
    return { t: window._rtsG.t, shown: !document.getElementById('rtsPause').hidden, btn: document.getElementById('rtsPauseBtn').textContent,
             text: document.getElementById('rtsPause').textContent, paused: !!window._rtsUI.paused };
  });
  S.ok('P pauses: the paused screen shows and the ⏸ reads ▶', held.shown && held.paused && /PAUSED/.test(held.text) && held.btn === '▶' && before.btn === '⏸', JSON.stringify(held));
  S.ok('...frames go on being drawn and the clock does not move', drawn >= 4 && held.t === t0, JSON.stringify({ drawn: drawn, t0: t0, t: held.t }));
  await p.keyboard.press('p');
  await p.waitForFunction(function (t) { return window._rtsG.t > t; }, t0, { timeout: 30000 }).catch(function () {});
  var on = await p.evaluate(function () { return { t: window._rtsG.t, hidden: document.getElementById('rtsPause').hidden }; });
  S.ok('...and P again resumes: the screen goes and the clock moves', on.hidden && on.t > t0, JSON.stringify(on));

  /* ---------- the speed ---------- */
  await p.keyboard.press('p');
  await p.waitForFunction(function () { return !document.getElementById('rtsPause').hidden; }, null, { timeout: 10000 }).catch(function () {});
  var at = await p.evaluate(function () { var b = document.querySelector('#rtsPause button[data-speed="2"]'), r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await p.mouse.click(at.x, at.y);
  var picked = await p.evaluate(function () {
    return { speed: rtsSpeedGet(), stored: localStorage.getItem('bw.speed'), on: document.querySelector('#rtsPause button.on').textContent };
  });
  at = await p.evaluate(function () { var b = document.querySelector('#rtsPause button.go'), r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await p.mouse.click(at.x, at.y);
  var ratio = await p.evaluate(function () {
    var C = window.__cnt, f0 = C.frames, k0 = C.ticks, until = Date.now() + 60000;
    return new Promise(function (res) { (function w() {
      if (C.frames >= f0 + 12 || Date.now() > until) res({ frames: C.frames - f0, ticks: C.ticks - k0, btn: document.getElementById('rtsPauseBtn').textContent, hidden: document.getElementById('rtsPause').hidden });
      else setTimeout(w, 50); })(); });
  });
  S.ok('THE SPEED: 2× is kept and marked', picked.speed === 2 && picked.stored === '2' && picked.on === '2×', JSON.stringify(picked));
  S.ok('...and after RESUME the loop runs two ticks a frame, the ⏸ saying 2×', ratio.hidden && ratio.btn === '2×' && ratio.frames >= 12 &&
       ratio.ticks >= ratio.frames * 2 - 1 && ratio.ticks <= ratio.frames * 2 + 1, JSON.stringify(ratio));
  await p.evaluate(function () { rtsSpeedPick(1); });

  /* ---------- the end ---------- */
  var over = await p.evaluate(function () {
    var G = window._rtsG; G.over = 'win';
    var r = rtsPauseToggle();
    return { r: r, hidden: document.getElementById('rtsPause').hidden };
  });
  S.ok('THE END: a battle that is over does not pause', over.r === false && over.hidden, JSON.stringify(over));

  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');
  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
