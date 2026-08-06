/* RESUME BATTLE used to fail in silence.

   The reason existed all along - _rtsReadSave knew exactly which of six things had gone wrong -
   but it returned a bare null, and rtsLoadGame's one explanation was written as

       if (window._rtsG) _rtsSay('No usable save ...')

   which is a guard that can never pass on the screen where the button lives: press RESUME
   BATTLE from the title and _rtsG is null by definition. So the click did nothing, said
   nothing, and looked exactly like a broken button.

   Each failure is produced HERE by breaking a real save the way the browser would break it -
   truncating it, altering it, emptying it, removing the body but not the index - rather than by
   stubbing _rtsReadSave, because a stub would only prove the message plumbing works on inputs
   we invented. And each is asserted on what the PLAYER can see: is there visible text on the
   title screen, and does it name the actual fault rather than listing every fault it might be. */

var { chromium, devices } = require('playwright');
var { serve } = require('../lib/game.js');


/* Each case: how to break the save, and a word that MUST appear in what the player is told. */
var CASES = [
  { key: 'gone',      want: /gone|cleared/i,
    note: 'body removed, index left behind',
    break: function () { localStorage.removeItem('rccmd.save1'); } },
  { key: 'truncated', want: /incomplete|cut short|room/i,
    note: 'body cut in half, index still claims the full length',
    break: function () {
      var t = localStorage.getItem('rccmd.save1');
      localStorage.setItem('rccmd.save1', t.slice(0, Math.floor(t.length / 2)));
    } },
  { key: 'damaged',   want: /damaged/i,
    note: 'one character changed, length preserved so only the hash catches it',
    break: function () {
      var t = localStorage.getItem('rccmd.save1');
      var i = Math.floor(t.length / 2);
      var c = t[i] === 'x' ? 'y' : 'x';
      localStorage.setItem('rccmd.save1', t.slice(0, i) + c + t.slice(i + 1));
    } },
  { key: 'stale',     want: /earlier version|older version/i, noClick: true,
    note: 'index written by a different build - the button does not even appear',
    break: function () {
      var raw = JSON.parse(localStorage.getItem('rccmd.save1.info'));
      raw.v = 'not-this-build';
      localStorage.setItem('rccmd.save1.info', JSON.stringify(raw));
    } },
];
(async function () {
  var s = await serve();
  var srv = s.srv, PAGE = s.url;
var browser = await chromium.launch();
  var fails = [];
  var errs = [];

  /* ---- 0. the happy path still works, or nothing below means anything ---- */
  var ctx = await browser.newContext({ viewport: { width: 1100, height: 900 } });
  var page = await ctx.newPage();
  page.on('pageerror', function (e) { errs.push(String(e)); });
  await page.goto(PAGE, { waitUntil: 'load' });
  await page.waitForFunction(function () { return typeof window.rtsOpen === 'function'; });
  var ok = await page.evaluate(async function () {
    rtsOpen(7);
    for (var i = 0; i < 60 * 30; i++) _rtsTick(1 / 60);
    var saved = rtsSaveGame();
    var tSaved = Math.round(window._rtsG.t);
    var units = window._rtsG.ents.filter(function (e) { return !e.dead; }).length;
    rtsClose();
    var loaded = rtsLoadGame();
    var back = window._rtsG ? { t: Math.round(window._rtsG.t),
                                units: window._rtsG.ents.filter(function (e) { return !e.dead; }).length } : null;
    return { saved: saved, loaded: loaded, tSaved: tSaved, units: units, back: back };
  });
  console.log('happy path: saved ' + ok.saved + ' at t=' + ok.tSaved + 's with ' + ok.units +
              ' entities -> loaded ' + ok.loaded +
              (ok.back ? ' at t=' + ok.back.t + 's with ' + ok.back.units : ' with NO GAME'));
  if (!ok.saved)  fails.push('could not save at all - the rest of this run proves nothing');
  if (!ok.loaded) fails.push('a good save did not load');
  if (!ok.back || Math.abs(ok.back.t - ok.tSaved) > 1)
    fails.push('the resumed battle is not the one that was saved');
  await ctx.close();

  /* ---- 1..n. each way it can go wrong ---- */
  for (var ci = 0; ci < CASES.length; ci++) {
    var c = CASES[ci];
    var cx = await browser.newContext({ viewport: { width: 1100, height: 900 } });
    var pg = await cx.newPage();
    pg.on('pageerror', function (e) { errs.push(c.key + ': ' + String(e)); });
    await pg.goto(PAGE, { waitUntil: 'load' });
    await pg.waitForFunction(function () { return typeof window.rtsOpen === 'function'; });
    /* make a real save, then break it the way a browser would */
    await pg.evaluate(function () {
      rtsOpen(7);
      for (var i = 0; i < 60 * 20; i++) _rtsTick(1 / 60);
      rtsSaveGame();
      rtsClose();
    });
    await pg.evaluate(new Function('(' + c.break.toString() + ')()'));
    /* come back to the title screen the way a player would: reload */
    await pg.reload({ waitUntil: 'load' });
    await pg.waitForFunction(function () { return typeof window.rtsShowResume === 'function'; });
    await pg.waitForTimeout(300);

    var r = await pg.evaluate(async function (noClick) {
      function seen(el) {
        if (!el || el.hidden) return '';
        var s = getComputedStyle(el);
        if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return '';
        var b = el.getBoundingClientRect();
        if (b.width < 1 || b.height < 1) return '';
        return (el.textContent || '').trim();
      }
      var btn = document.getElementById('rtsResume');
      var before = { btn: !btn.hidden, note: seen(document.getElementById('rtsResumeNote')) };
      var ret = null;
      if (!noClick) { ret = rtsLoadGame(); await new Promise(function (z) { setTimeout(z, 200); }); }
      return {
        before: before,
        ret: ret,
        note: seen(document.getElementById('rtsResumeNote')),
        btnAfter: !document.getElementById('rtsResume').hidden,
        gameOpened: !!document.getElementById('rcgRts')
      };
    }, !!c.noClick);

    console.log('\n' + c.key + '  (' + c.note + ')');
    console.log('  button offered beforehand: ' + r.before.btn +
                (c.noClick ? '   [not clicked - it should not be there to click]' : ''));
    console.log('  player is told: ' + (r.note ? '"' + r.note + '"' : 'NOTHING'));
    console.log('  button still offered after: ' + r.btnAfter + '   game opened: ' + r.gameOpened);

    if (!r.note) fails.push(c.key + ': the player is told nothing at all');
    else if (!c.want.test(r.note))
      fails.push(c.key + ': the message does not name this fault: "' + r.note + '"');
    if (/missing, damaged, or from an older build/.test(r.note))
      fails.push(c.key + ': still the old catch-all message that lists every fault at once');
    if (r.gameOpened) fails.push(c.key + ': a broken save opened a game anyway');
    if (!c.noClick && r.ret !== false) fails.push(c.key + ': rtsLoadGame returned ' + r.ret);
    if (!c.noClick && !r.before.btn) fails.push(c.key + ': the button was not even offered, so ' +
                                                'this case never reaches a player');
    if (!c.noClick && r.btnAfter) fails.push(c.key + ': the button is still offering a save that ' +
                                             'has just been shown to be unreadable');
    if (c.noClick && r.before.btn) fails.push(c.key + ': a save this build cannot read is still ' +
                                              'being offered as resumable');
    await cx.close();
  }

  if (errs.length) fails.push('page errors: ' + errs.join(' | '));
  console.log('\n' + (fails.length ? 'FAIL\n  ' + fails.join('\n  ') : 'PASS'));
  await browser.close();
  srv.close();
  process.exit(fails.length ? 1 : 0);
})();
