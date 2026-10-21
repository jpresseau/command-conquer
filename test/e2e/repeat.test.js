/* REPEAT WITH THE REAL PAGE (ui/repeat.js, ui/shell.js, ui/sidebar.js):

     THE BUTTON   on the Build tab there is no ↻ REPEAT; on the Infantry tab there is, and a
                  finger at its centre lands on it
     ON           a real click turns it on, marked; a real click on the rifleman's tile queues one,
                  the tile wears ↻, and two minutes on the barracks has made several
     OFF          a real click turns it off: what is building finishes, and no more are started */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('repeat');
function centre(sel) {
  var b = document.querySelector(sel);
  if (!b || b.hidden) return null;
  b.scrollIntoView({ block: 'center' });
  var r = b.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2, e = document.elementFromPoint(x, y);
  return { x: x, y: y, hit: e === b || b.contains(e) };
}

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 1100, height: 760 });
  var p = g.page;
  await g.start(7, 2, { freeze: true });
  await p.evaluate(function () {
    var G = window._rtsG, y = _rtsHas('player', 'yard'); G.sides.enemy.ctl = 'none';
    _rtsMBuild('player', 'barracks', y.tx + 5, y.tz, 'bar'); _rtsMBuild('player', 'power', y.tx, y.tz + 5);
    _rtsRecalcPower('player'); G.sides.player.credits = 20000;
    rtsTab('struct'); _rtsSyncSidebar(0);
  });
  var onBuild = await p.evaluate(centre, '#rtsRepeatBtn');
  await p.evaluate(function () { rtsTab('infantry'); _rtsSyncSidebar(0); });
  var onInf = await p.evaluate(centre, '#rtsRepeatBtn');
  S.ok('THE BUTTON: none on the Build tab; on the Infantry tab there is one, under a finger', onBuild === null && !!onInf && onInf.hit, JSON.stringify({ build: onBuild, inf: onInf }));

  /* ---------- on ---------- */
  await p.mouse.click(onInf.x, onInf.y);
  var tile = await p.evaluate(function () { _rtsSyncSidebar(0); var b = window._rtsUI.btns.rifle; b.scrollIntoView({ block: 'center' }); var r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await p.mouse.click(tile.x, tile.y);
  var on = await p.evaluate(function () {
    var G = window._rtsG, n0 = G.ents.filter(function (e) { return !e.dead && e.side === 'player' && e.def === 'rifle'; }).length;
    _rtsSyncSidebar(0);
    var btn = document.getElementById('rtsRepeatBtn'), mark = !!window._rtsUI.btns.rifle.querySelector('.rep');
    for (var i = 0; i < 60 * 120; i++) { _rtsTick(1 / 60); if (i % 60 === 59) _rtsSyncSidebar(0); }
    var n1 = G.ents.filter(function (e) { return !e.dead && e.side === 'player' && e.def === 'rifle'; }).length;
    return { cls: btn.className, rep: G.sides.player.rep, mark: mark, made: n1 - n0, msg: G.msg };
  });
  S.ok('ON: a real click turns it on, marked, and the rifleman\'s tile wears ↻', on.cls === 'on' && !!on.rep && on.rep.infantry === true && on.mark, JSON.stringify(on));
  S.ok('...and two minutes on the barracks has made several from one click', on.made >= 5, 'made ' + on.made);

  /* ---------- off ---------- */
  var b2 = await p.evaluate(centre, '#rtsRepeatBtn');
  await p.mouse.click(b2.x, b2.y);
  var off = await p.evaluate(function () {
    var G = window._rtsG, S = G.sides.player, count = function () { return G.ents.filter(function (e) { return !e.dead && e.side === 'player' && e.def === 'rifle'; }).length; };
    var n0 = count(), busy = !!S.q.infantry;
    for (var i = 0; i < 60 * 60; i++) { _rtsTick(1 / 60); if (i % 60 === 59) _rtsSyncSidebar(0); }
    return { rep: S.rep && S.rep.infantry, cls: document.getElementById('rtsRepeatBtn').className, made: count() - n0, busy: busy, q: S.q.infantry && S.q.infantry.key,
             mark: !!window._rtsUI.btns.rifle.querySelector('.rep') };
  });
  S.ok('OFF: a real click turns it off - what was building finishes, and no more are started', !off.rep && off.cls === '' && off.made === (off.busy ? 1 : 0) && !off.q && !off.mark, JSON.stringify(off));

  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');
  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
