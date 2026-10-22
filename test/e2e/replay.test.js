/* REPLAYS WITH THE REAL PAGE (replay.js, core/replay.js):

     THE BATTLE   a battle on the Dominion's side, played by real input under the live loop and its
                  real frame times - a drag-select, a right-click order, a Shift + right-click stop,
                  a building queued from its tile and REPEAT pressed on a unit line - then left by ✕
     KEPT         the recording is kept: every one of those orders in it, every tick, and the title's
                  REPLAYS lists it to watch, with a line saying what the battle was
     WATCHED      with the title's army changed, its WATCH plays the battle as it was laid - the
                  Dominion's side - at 8x by its own button, and ends saying it played out as it was
                  fought; its end matches the recording's to the bit
     HANDS OFF    a right-click order during it, the replay held still, is refused and says so
     NOTHING      opening it leaves the player's autosave, no record is written, Save is refused,
     WRITTEN      and back on the title the player's own army is theirs again
     DECIDED      a survival overrun offers WATCH REPLAY on its card; watched, it falls as it fell,
                  under the replay's own card, and the survival's best is not written again */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('replay');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 1100, height: 760, quality: 'low' });
  var p = g.page;
  await p.evaluate(function () { localStorage.removeItem('bw.replay'); rtsSetArmySide('soviet'); });
  await g.start(7, 0);
  async function canvasAt(sx, sy) {
    var r = await p.evaluate(function () { var c = document.getElementById('rtsCv').getBoundingClientRect(); return { l: c.left, t: c.top }; });
    return { x: r.l + sx, y: r.t + sy };
  }
  /* the opening army, the view on it: a box round it on screen, and two points of open ground */
  var set = await p.evaluate(function () {
    var G = window._rtsG, R = _rtsR, y = _rtsHas('player', 'yard');
    var army = G.ents.filter(function (e) { return !e.dead && e.side === 'player' && e.type === 'unit' && !rtsUnitDef(e.def).harvest; });
    var cx = 0, cz = 0;
    army.forEach(function (e) { cx += e.x / army.length; cz += e.z / army.length; });
    R.focus.x = cx; R.focus.z = cz; _rtsClampFocus(); _rtsRFrame(0);
    var sp = army.map(function (e) { return _rtsWorldToScreen(e.x, _rtsElev(e.x, e.z), e.z); });
    function cell(dx, dz) { var c = _rtsNearestOpen(_rtsTX(cx) + dx, _rtsTX(cz) + dz, 6, null); var w = { x: _rtsWX(c[0]), z: _rtsWX(c[1]) }; var q = _rtsWorldToScreen(w.x, _rtsElev(w.x, w.z), w.z); return { x: q.x, y: q.y }; }
    return { n: army.length, house: rtsHouseSide('player'), W: R.W, H: R.H,
      box: { x0: Math.min.apply(null, sp.map(function (q) { return q.x; })) - 25, y0: Math.min.apply(null, sp.map(function (q) { return q.y; })) - 25,
             x1: Math.max.apply(null, sp.map(function (q) { return q.x; })) + 25, y1: Math.max.apply(null, sp.map(function (q) { return q.y; })) + 25 },
      go: cell(6, -4), stop: cell(-5, 5) };
  });
  S.ok('THE BATTLE: the population - the Dominion\'s side, an opening army, the box and both points on screen', set.house === 'soviet' && set.n >= 2 &&
       set.box.x0 > 0 && set.box.y0 > 0 && set.box.x1 < set.W && set.box.y1 < set.H && [set.go, set.stop].every(function (q) { return q.x > 20 && q.y > 20 && q.x < set.W - 20 && q.y < set.H - 20; }), JSON.stringify(set));

  /* drag-select it, send it, add a stop */
  var a = await canvasAt(set.box.x0, set.box.y0), b = await canvasAt(set.box.x1, set.box.y1);
  await p.mouse.move(a.x, a.y); await p.mouse.down(); await p.mouse.move(b.x, b.y, { steps: 6 }); await p.mouse.up();
  var picked = await p.evaluate(function () { return window._rtsG.sel.length; });
  var go = await canvasAt(set.go.x, set.go.y), st = await canvasAt(set.stop.x, set.stop.y);
  await p.mouse.click(go.x, go.y, { button: 'right' });
  await p.keyboard.down('Shift'); await p.mouse.click(st.x, st.y, { button: 'right' }); await p.keyboard.up('Shift');
  /* a power plant from its tile, and REPEAT on the infantry line */
  async function clickEl(fn, arg) { var r = await p.evaluate(fn, arg); if (r) await p.mouse.click(r.x, r.y); return r; }
  function rectOf(sel) { var e = typeof sel === 'string' ? document.querySelector(sel) : null; if (!e) return null; e.scrollIntoView({ block: 'nearest' }); var r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
  await clickEl(function () { var b = window._rtsUI.btns.power; if (!b) return null; var r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await clickEl(rectOf, '[data-cat="infantry"]');
  /* REPEAT shows on the next frame the tab is drawn in, and a frame here is slow */
  await p.waitForFunction(function () { var b = document.getElementById('rtsRepeatBtn'); return b && !b.hidden && b.getBoundingClientRect().width > 0; }, null, { timeout: 120000 });
  await clickEl(rectOf, '#rtsRepeatBtn');
  var mid = await p.evaluate(function (n) { var G = window._rtsG; return { sel: n, t: G.t, rep: !!(G.sides.player.rep && G.sides.player.rep.infantry), q: !!G.sides.player.q.struct }; }, picked);
  /* a few seconds of the live loop, at its own frame times */
  await p.waitForFunction(function (t) { return window._rtsG.t >= t + 6; }, mid.t, { timeout: 240000, polling: 500 });
  var ran = await p.evaluate(function () { return { t: window._rtsG.t, auto: localStorage.getItem('bw.autosave') }; });
  await clickEl(rectOf, '#rtsQuitBtn'); await clickEl(rectOf, '#rtsQuitBtn');
  await p.waitForFunction(function () { return !document.getElementById('rcgRts'); }, null, { timeout: 120000 });
  var kept = await p.evaluate(function () {
    var r = rtsReplayGet(), b = document.getElementById('rtsReplay');
    rtsReplaysToggle();
    var row = document.querySelector('#rtsReplays .rp-row[data-id="last"] .go');
    return r && { cmds: r.cmds.map(function (c) { return c.f; }), ticks: r.dts.length, odd: Object.keys(r.odd).length, steps: r.dts.split('').filter(function (c, i, a) { return a.indexOf(c) === i; }).map(function (c) { return c.charCodeAt(0) - 48; }),
      end: r.end, head: r.head, shown: !!b && !b.hidden && !!row, note: document.getElementById('rtsReplayNote').textContent, size: localStorage.getItem('bw.replay').length };
  });
  S.ok('...played by real input: the army selected, sent, a stop added, a plant queued and the infantry line repeating', mid.sel === set.n && mid.rep && mid.q, JSON.stringify(mid));
  /* every tick a live frame's, a whole number of milliseconds (here they are all the 100 ms cap:
     this rasteriser takes longer than that over a frame - unit/replay plays uneven ones) */
  S.ok('KEPT: the recording has every order given - the move, the stop, the queued plant, the repeat - and every tick, each a live frame\'s',
       !!kept && ['_rtsOrderMove', '_rtsWayAdd', '_rtsQueue', '_rtsRepeatSet'].every(function (n) { return kept.cmds.indexOf(n) >= 0; }) && kept.ticks > 100 && kept.odd === 0 && kept.head.army === 'soviet' && kept.end.t >= ran.t - 1,
       JSON.stringify(kept && { cmds: kept.cmds.join(' '), ticks: kept.ticks, steps: kept.steps, odd: kept.odd, end: kept.end, size: kept.size }));
  S.ok('...and the title\'s REPLAYS lists it to WATCH, saying what the battle was', !!kept && kept.shown && /last: Battle · Soldier · left at 0:\d\d/.test(kept.note), kept && kept.note);
  /* nothing to watch without the button: what follows would only wait on a click that cannot land */
  if (!(kept && kept.shown)) { await g.close(); await browser.close(); require('../lib/report.js')(S); return; }

  /* ---------------- watched ---------------- */
  /* an autosave of the player's own, which opening a replay must not clear as a new battle does */
  var before = await p.evaluate(function () { rtsSetArmySide('allied'); _rtsSkySetWant('fog'); rtsSkirmishSet('money', 'rich'); localStorage.setItem('rccmd.auto1', 'KEEP'); localStorage.setItem('rccmd.auto1.info', 'KEEP');
    return { record: localStorage.getItem('bw.record'), auto: localStorage.getItem('rccmd.auto1') + localStorage.getItem('rccmd.auto1.info') }; });
  var w = await p.evaluate(function () { var b = document.querySelector('#rtsReplays .rp-row[data-id="last"] .go'); b.scrollIntoView({ block: 'center' }); var r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await p.mouse.click(w.x, w.y);
  await p.waitForFunction(function () { return !!(window._rtsUI && window._rtsUI.replay && document.getElementById('rtsReplaySpeed')); }, null, { timeout: 120000 });
  for (var k = 0; k < 3; k++) await clickEl(rectOf, '#rtsReplaySpeed');
  var playing = await p.evaluate(function () { return { speed: window._rtsUI.replay.speed, house: rtsHouseSide('player'), sky: window._rtsG.sky, want: _rtsSkyWant(), recSky: rtsReplayGet().head.sky, money: rtsSkirmishGet().money, cred: rtsMoney(window._rtsG.sides.player), label: document.getElementById('rtsReplaySpeed').textContent }; });
  /* an order by hand, on a unit of the replay's own - the replay held still for it (the loop's own
     pause, without its screen over the field), so whatever moves the unit is the order's doing */
  var hand = await p.evaluate(function () {
    window._rtsUI.paused = true;
    var G = window._rtsG, u = G.ents.filter(function (e) { return !e.dead && e.side === 'player' && e.type === 'unit' && !rtsUnitDef(e.def).harvest; })[0];
    if (!u) return null;
    G.sel = [u]; window.__hu = u;
    var q = _rtsWorldToScreen(u.x + 6 * RTS_TILE, _rtsElev(u.x, u.z), u.z), c = document.getElementById('rtsCv').getBoundingClientRect();
    return { x: c.left + q.x, y: c.top + q.y, goal: u.goal ? [u.goal.x, u.goal.z] : null, refused: _rtsRec.refused || 0 };
  });
  if (hand) await p.mouse.click(hand.x, hand.y, { button: 'right' });
  var after = await p.evaluate(function () { var u = window.__hu; window._rtsUI.paused = false; return u && { goal: u.goal ? [u.goal.x, u.goal.z] : null, refused: _rtsRec ? _rtsRec.refused || 0 : -1, msg: window._rtsG.msg }; });
  S.ok('WATCHED: WATCH REPLAY lays the battle as it was - the Dominion\'s side, the recorded sky and money, though the title now says Compact, fog and rich - and plays it at 8x by its own button',
       playing.speed === 8 && playing.label === '8×' && playing.house === 'soviet' && playing.want === 'fog' && playing.sky === playing.recSky && playing.recSky === 'day' && playing.money === 'rich' && playing.cred <= 3000, JSON.stringify(playing));
  S.ok('HANDS OFF: a right-click order during it is refused, changes nothing, and says so', !!hand && !!after && after.refused > hand.refused && JSON.stringify(after.goal) === JSON.stringify(hand.goal) && /A replay plays itself/.test(after.msg || ''),
       JSON.stringify({ hand: hand, after: after }));
  await p.waitForFunction(function () { return !!document.getElementById('rtsReplayVerdict'); }, null, { timeout: 300000, polling: 500 });
  var end = await p.evaluate(function () {
    var r = rtsReplayGet(), G = window._rtsG;
    return { verdict: document.getElementById('rtsReplayVerdict').textContent, card: document.getElementById('rtsOver').textContent, hash: _rtsReplayHash(G), want: r.end.hash, t: G.t, wantT: r.end.t,
             save: (rtsSaveGame(), G.msg), record: localStorage.getItem('bw.record'), auto: localStorage.getItem('rccmd.auto1') + localStorage.getItem('rccmd.auto1.info') };
  });
  S.ok('...and ends saying it played out as it was fought: its end is the recording\'s, to the bit', /played out as it was fought/.test(end.verdict) && end.hash === end.want && end.t === end.wantT,
       JSON.stringify({ verdict: end.verdict, hash: [end.hash, end.want], t: [end.t, end.wantT] }));
  S.ok('NOTHING WRITTEN: the player\'s autosave is still there, no record is written, and Save is refused', end.auto === 'KEEPKEEP' && end.record === before.record && /replay is not saved/.test(end.save || ''),
       JSON.stringify({ record: [before.record, end.record], auto: [before.auto, end.auto], save: end.save }));
  await p.evaluate(function () { rtsClose(); });
  var home = await p.evaluate(function () { return { army: rtsArmySide(), rec: !!_rtsRec, title: !document.getElementById('rtsHome').classList.contains('gone') }; });
  S.ok('...and back on the title the player\'s own army is theirs again, and nothing is recording', home.army === 'allied' && !home.rec && home.title, JSON.stringify(home));

  /* ---------------- a decided battle ---------------- */
  /* a survival with one overwhelming wave, run to its end by ticks in a breath (recorded as ticks
     like any other): its end card's own WATCH REPLAY, and nothing the replay's end writes */
  await p.evaluate(function () { RTS_SURV.first = 3; RTS_SURV.budget = 40000; window._RTS_SURVIVAL = true; localStorage.removeItem('bw.survival'); });
  await g.start(7, 0);
  var fell = await p.evaluate(function () { var G = window._rtsG; for (var i = 0; i < 60 * 300 && !G.over; i++) _rtsTick(1 / 60); return { over: G.over, t: Math.round(G.t), wave: G.survival && G.survival.wave }; });
  await p.waitForFunction(function () { return !!document.getElementById('rtsReplayGo'); }, null, { timeout: 120000 });
  var won = await p.evaluate(function () { var r = rtsReplayGet(); return { best: localStorage.getItem('bw.survival'), over: r && r.end.over, survival: r && r.head.survival, ticks: r && r.dts.length }; });
  S.ok('A DECIDED BATTLE: a survival overrun - its card offers WATCH REPLAY, and the recording ends where it fell', fell.over === 'lose' && won.over === 'lose' && won.survival === true && !!won.best,
       JSON.stringify({ fell: fell, won: won }));
  await clickEl(rectOf, '#rtsReplayGo');
  await p.waitForFunction(function () { return !!(window._rtsUI && window._rtsUI.replay && window._rtsG.survival); }, null, { timeout: 120000 });
  await p.evaluate(function () { localStorage.setItem('bw.survival', 'KEEP'); rtsReplaySpeed(64); });     /* faster than a player's, for the harness */
  /* whichever card comes: the replay's own, or - were it let through - the battle's */
  await p.waitForFunction(function () { return !!document.getElementById('rtsReplayVerdict') || /OVERRUN/.test(document.getElementById('rtsOver').textContent); }, null, { timeout: 300000, polling: 500 });
  var dend = await p.evaluate(function () { var G = window._rtsG, v = document.getElementById('rtsReplayVerdict'); return { over: G.over, verdict: v ? v.textContent : null, card: document.getElementById('rtsOver').textContent, best: localStorage.getItem('bw.survival'), auto: localStorage.getItem('rccmd.auto1') }; });
  S.ok('...watched, it falls again as it fell, the card is the replay\'s own, and the survival\'s best is not written again',
       dend.over === 'lose' && /played out as it was fought/.test(dend.verdict) && /DEFEATED/.test(dend.card) && !/OVERRUN/.test(dend.card) && dend.best === 'KEEP',
       JSON.stringify(dend));
  await p.evaluate(function () { rtsClose(); });

  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');
  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
