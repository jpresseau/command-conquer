/* THE REPLAY LIST, FILES, THE TIMELINE AND 👁, WITH THE REAL PAGE (replays.js, replay.js):

     THE LIST     a battle left, REPLAYS lists the last one to WATCH, KEEP or FILE; ★ KEEP puts a copy
                  in the kept list, kept across a reload, and the last one's KEEP goes
     A FILE       ⬇ FILE downloads the recording as JSON, whole; OPEN A FILE with a doctored one - an
                  order that is not a command - refuses it and says why; with the downloaded one it
                  plays that battle, and its card has no KEEP, the battle being kept already
     THE JUMP     a click on the timeline at three quarters jumps there; one at a quarter lays the
                  battle again and comes forward to it, the speed kept; and played on from there it
                  still ends as it was fought
     👁           the whole map for the watcher: the enemy's yard seen, the shroud lifted from the
                  ground, the radar lit without a Radar Post; off, all of it is back
     ✕            a kept replay deleted is gone from the list and from storage
     ESCAPED      a file naming its build as markup gets the name shown as text, nothing made of it
     A PHONE      on an iPhone the bar fits the screen and its buttons are a finger's height */

var fs = require('fs'), path = require('path'), os = require('os');
var { chromium, devices } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('replays');
var TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-replays-'));
function centreOf(sel) {
  var e = document.querySelector(sel);
  if (!e) return null;
  e.scrollIntoView({ block: 'center' });
  var r = e.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, l: r.left };
}

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 1100, height: 760, quality: 'low' });
  var p = g.page;
  async function click(sel) { var c = await p.evaluate(centreOf, sel); if (c) await p.mouse.click(c.x, c.y); return c; }
  /* a battle: forty seconds, an order or two from outside the ticks, then left */
  await p.evaluate(function () { localStorage.removeItem('bw.replay'); localStorage.removeItem('bw.replays'); });
  await g.start(7, 0, { freeze: true });
  await p.evaluate(function () {
    var G = window._rtsG, y = _rtsHas('player', 'yard');
    var army = G.ents.filter(function (e) { return !e.dead && e.side === 'player' && e.type === 'unit' && !rtsUnitDef(e.def).harvest; });
    for (var i = 0; i < 60 * 40; i++) {
      if (i === 120) army.forEach(function (u) { _rtsOrderMove(u, y.x + 12 * RTS_TILE, y.z, true); });
      if (i === 600) _rtsQueue('player', 'power');
      _rtsTick(1 / 60);
    }
    rtsClose();
  });

  /* ---------------- the list ---------------- */
  await click('#rtsReplay');
  var list = await p.evaluate(function () {
    var rows = Array.prototype.map.call(document.querySelectorAll('#rtsReplays .rp-row'), function (r) { return { id: r.dataset.id, btns: Array.prototype.map.call(r.querySelectorAll('button'), function (b) { return b.className; }).join(' '), text: r.textContent }; });
    return { open: !document.getElementById('rtsReplays').hidden, rows: rows };
  });
  S.ok('THE LIST: REPLAYS lists the last battle to WATCH, KEEP or FILE', list.open && list.rows.length === 1 && list.rows[0].id === 'last' && list.rows[0].btns === 'go save keep' && /Battle · Soldier · left at 0:40/.test(list.rows[0].text),
       JSON.stringify(list));
  await click('#rtsReplays .rp-row[data-id="last"] .keep');
  await p.reload({ waitUntil: 'load' });
  await p.waitForFunction(function () { return typeof window.rtsOpen === 'function'; });
  await click('#rtsReplay');
  var kept = await p.evaluate(function () {
    var rows = Array.prototype.map.call(document.querySelectorAll('#rtsReplays .rp-row'), function (r) { return { id: r.dataset.id, btns: Array.prototype.map.call(r.querySelectorAll('button'), function (b) { return b.className; }).join(' ') }; });
    return { rows: rows, stored: JSON.parse(localStorage.getItem('bw.replays') || '[]').length, note: document.getElementById('rtsReplayNote').textContent };
  });
  S.ok('...★ KEEP puts a copy in the kept list, kept across a reload, and the last one\'s KEEP goes', kept.rows.length === 2 && kept.rows[0].btns === 'go save' && kept.rows[1].btns === 'go save del' && kept.stored === 1 && /1 kept/.test(kept.note),
       JSON.stringify(kept));

  /* ---------------- a file ---------------- */
  var keptId = kept.rows[1].id;
  var dl = p.waitForEvent('download');
  await click('#rtsReplays .rp-row[data-id="' + keptId + '"] .save');
  var file = await dl, out = path.join(TMP, file.suggestedFilename());
  await file.saveAs(out);
  var body = JSON.parse(fs.readFileSync(out, 'utf8')), last = await p.evaluate(function () { return localStorage.getItem('bw.replay'); });
  S.ok('A FILE: ⬇ FILE downloads the recording as JSON, whole', /^breachwater-replay-\d{8}-\d{4}\.json$/.test(file.suggestedFilename()) && JSON.stringify(body) === last,
       file.suggestedFilename() + ' ' + fs.statSync(out).size + ' bytes');
  var doctored = JSON.parse(JSON.stringify(body));
  doctored.cmds.push({ k: 5, f: 'rtsClose', a: [] });
  var badPath = path.join(TMP, 'doctored.json');
  fs.writeFileSync(badPath, JSON.stringify(doctored));
  await p.setInputFiles('#rtsReplayFile', badPath);
  /* refused - or, were it let through, played */
  await p.waitForFunction(function () { var n = document.getElementById('rtsReplaysNote'); return (n && !n.hidden) || !!document.getElementById('rcgRts'); }, null, { timeout: 60000 });
  var refused = await p.evaluate(function () { var n = document.getElementById('rtsReplaysNote'), b = !!document.getElementById('rcgRts'); if (b) { rtsClose(); rtsReplaysToggle(); } return { note: n ? n.textContent : '', battle: b }; });
  S.ok('...OPEN A FILE with a doctored one - an order that is not a command - refuses it and says why', !refused.battle && /Cannot play that file: it gives an order this game does not take/.test(refused.note), JSON.stringify(refused));
  await p.setInputFiles('#rtsReplayFile', out);
  await p.waitForFunction(function () { return !!(window._rtsUI && window._rtsUI.replay && document.getElementById('rtsReplayPos')); }, null, { timeout: 60000 });
  var playing = await p.evaluate(function (b) { var r = window._rtsUI.replay.rec; return { same: r.dts === b.dts && r.head.seed === b.head.seed, max: +document.getElementById('rtsReplayPos').max }; }, body);
  S.ok('...with the downloaded one it plays that battle', playing.same && playing.max === body.dts.length, JSON.stringify(playing));

  /* ---------------- the jump ---------------- */
  await p.evaluate(function () { rtsReplaySpeed(4); });
  async function jump(frac) {
    /* where the click put it, from its own change - a jump back lays the battle again, bar and all */
    await p.evaluate(function () { var e = document.getElementById('rtsReplayPos'); window.__want = null; e.addEventListener('change', function () { window.__want = +e.value; }); });
    var c = await p.evaluate(centreOf, '#rtsReplayPos');
    await p.mouse.click(c.l + c.w * frac, c.y);
    var want = await p.evaluate(function () { return window.__want; });
    await p.waitForFunction(function () { var U = window._rtsUI; return U && U.replay && U.replay.seekTo == null && _rtsRec && _rtsRec.mode === 'play' && window._rtsG; }, null, { timeout: 300000, polling: 200 });
    return p.evaluate(function (w) { var U = window._rtsUI, L = U.replay.landed || {}; return { want: w, n: L.n, t: L.t, tw: U.replay.times[w], speed: U.replay.speed, G: window._rtsG.__id || (window._rtsG.__id = Math.random()) }; }, want);
  }
  var fwd = await jump(0.75);
  var back = await jump(0.25);
  S.ok('THE JUMP: a click at three quarters comes down on that tick exactly, on the timeline\'s clock', fwd.want > body.dts.length * 0.6 && fwd.n === fwd.want && fwd.t === fwd.tw, JSON.stringify(fwd));
  S.ok('...one at a quarter lays the battle again and comes forward to that tick exactly, the speed kept', back.want < body.dts.length * 0.4 && back.n === back.want && back.t === back.tw && back.G !== fwd.G && back.speed === 4, JSON.stringify(back));

  /* ---------------- 👁 ---------------- */
  async function look() {
    return p.evaluate(function () {
      _rtsRFrame(0);
      var R3 = window._R3D, px = R3.fogPx, hid = 0;
      for (var i = 3; i < px.length; i += 4) if (px[i]) hid++;
      var y = _rtsHas('enemy', 'yard');
      return { seen: _rtsEntSeen(y), hid: hid, radar: _rtsRadarLit(), pressed: document.getElementById('rtsReplayEye').getAttribute('aria-pressed') };
    });
  }
  await p.evaluate(function () { window._rtsUI.paused = true; });            /* held still while it is looked at */
  var before = await look();
  await click('#rtsReplayEye');
  var on = await look();
  await click('#rtsReplayEye');
  var off = await look();
  S.ok('👁: the whole map for the watcher - the enemy\'s yard seen, the shroud lifted, the radar lit with no Radar Post; off, all three are back',
       !before.seen && before.hid > 1000 && !before.radar && on.seen && on.hid === 0 && on.radar && on.pressed === 'true' && !off.seen && off.hid === before.hid && !off.radar && off.pressed === 'false', JSON.stringify({ before: before, on: on, off: off }));
  await click('#rtsReplayEye');                                                /* and on, for the rest of it */
  await p.evaluate(function () { window._rtsUI.paused = false; rtsReplaySpeed(64); });
  await p.waitForFunction(function () { return !!document.getElementById('rtsReplayVerdict'); }, null, { timeout: 300000, polling: 500 });
  var end = await p.evaluate(function () { return { verdict: document.getElementById('rtsReplayVerdict').textContent, keep: !!document.getElementById('rtsReplayKeepBtn') }; });
  S.ok('...and jumped about and watched revealed, it still ends as it was fought; its card has no KEEP, the battle being kept already', /played out as it was fought/.test(end.verdict) && !end.keep, JSON.stringify(end));

  /* ---------------- ✕ ---------------- */
  await p.evaluate(function () { rtsClose(); });
  if (await p.evaluate(function () { return document.getElementById('rtsReplays').hidden; })) await click('#rtsReplay');
  await click('#rtsReplays .rp-row[data-id="' + keptId + '"] .del');
  var gone = await p.evaluate(function () { return { rows: document.querySelectorAll('#rtsReplays .rp-row').length, stored: JSON.parse(localStorage.getItem('bw.replays') || '[]').length }; });
  S.ok('✕: a kept replay deleted is gone from the list and from storage', gone.rows === 1 && gone.stored === 0, JSON.stringify(gone));

  /* ---------------- what a file says, escaped ---------------- */
  /* a file naming its build as markup, and ending elsewhere so the card names the build */
  var hostile = JSON.parse(JSON.stringify(body));
  hostile.head.build = '<b id="pwn">x</b><img src=x onerror="window.__pwned=1">';
  hostile.end.hash = '00000000';
  var hPath = path.join(TMP, 'hostile.json');
  fs.writeFileSync(hPath, JSON.stringify(hostile));
  await p.evaluate(function () { window.__pwned = 0; if (document.getElementById('rtsReplays').hidden) rtsReplaysToggle(); });
  await p.setInputFiles('#rtsReplayFile', hPath);
  await p.waitForFunction(function () { return !!(window._rtsUI && window._rtsUI.replay && document.getElementById('rtsReplayPos')); }, null, { timeout: 60000 });
  await p.evaluate(function () { rtsReplaySpeed(64); });
  await p.waitForFunction(function () { return !!document.getElementById('rtsReplayVerdict'); }, null, { timeout: 300000, polling: 500 });
  var esc = await p.evaluate(function () { return { verdict: document.getElementById('rtsReplayVerdict').textContent, el: !!document.getElementById('pwn'), img: document.querySelectorAll('#rtsOver img').length, pwned: window.__pwned }; });
  S.ok('ESCAPED: a file naming its build as markup gets its name shown as text on the card - no element made of it, nothing run',
       /another version of the game \(<b id="pwn">x<\/b><img/.test(esc.verdict) && !esc.el && esc.img === 0 && !esc.pwned, JSON.stringify(esc));
  await p.evaluate(function () { rtsClose(); });

  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');
  await g.close();

  /* ---------------- a phone ---------------- */
  var ph = await openPage(browser, { device: devices['iPhone 13'], quality: 'low' });
  await ph.page.evaluate(function (b) { localStorage.setItem('bw.replay', b); }, last);
  await ph.page.evaluate(function () { rtsReplayWatch(null); });
  await ph.page.waitForFunction(function () { return !!document.getElementById('rtsReplayBar'); }, null, { timeout: 60000 });
  var bar = await ph.page.evaluate(function () {
    var b = document.getElementById('rtsReplayBar').getBoundingClientRect();
    var h = Array.prototype.map.call(document.querySelectorAll('#rtsReplayBar button'), function (x) { return Math.round(x.getBoundingClientRect().height); });
    return { l: b.left, r: b.right, W: innerWidth, h: h, wide: document.documentElement.scrollWidth };
  });
  S.ok('A PHONE: on an iPhone the bar fits the screen and its buttons are a finger\'s height', bar.l >= 0 && bar.r <= bar.W && bar.wide <= bar.W && bar.h.length === 2 && bar.h.every(function (x) { return x >= 40; }), JSON.stringify(bar));
  S.ok('...with no page errors', !ph.errors.length, ph.errors.join(' | ') || 'none');
  await ph.close();
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
