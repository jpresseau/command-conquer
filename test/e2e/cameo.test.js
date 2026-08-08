/* A locked cameo in the real sidebar: greyed, and it tells you why.

   test/unit/locked pins the rule - _rtsWhyLocked - without a browser. This is the other half:
   that the sidebar actually DRAWS from it. The bug it exists for was invisible in the rule and
   only visible on screen. With the full tech tree and one Commando already alive, the Commando
   cameo was drawn enabled, and clicking it played the deny beep and printed an EMPTY message
   line: the queue refused, and the player was told nothing at all and shown nothing at all.

   The tooltip is measured because it is the only channel that answers WITHOUT a click. A greyed
   cameo used to be silent until you clicked it, so the only way to learn what a locked Refinery
   wanted was to press a button that visibly does nothing. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('cameo');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 1100, height: 800 });
  /* Frozen: the assertions below read the sidebar between evaluate calls, and a running match
     would go on building and dying underneath them. */
  await g.start(7, 15, { freeze: true });

  /* ---------- 1. nothing built yet: the tech tree is legible from the tooltips ---------- */
  var early = await g.page.evaluate(function () {
    var U = window._rtsUI;
    rtsTab('struct'); _rtsSyncSidebar(0);
    /* Every cameo checked against its own reason rather than one hand-picked building: what the
       starting base already provides is a generation detail, and a spec that guessed it would
       be asserting on the map rather than on the sidebar. */
    var locked = [], open = [], wrong = [];
    Object.keys(U.btns).forEach(function (k) {
      var b = U.btns[k], why = _rtsWhyLocked('player', k), grey = /locked/.test(b.className);
      (why ? locked : open).push(k);
      if (grey !== !!why) wrong.push(k + ': grey ' + grey + ' vs why ' + why);
      else if (why && b.title.indexOf(why) < 0) wrong.push(k + ': tooltip missing "' + why + '"');
      else if (!why && /\n\n/.test(b.title)) wrong.push(k + ': tooltip carries a reason anyway');
    });
    return { locked: locked, open: open, wrong: wrong,
             sample: locked.length ? { k: locked[0], title: U.btns[locked[0]].title } : null,
             have: ['yard','power','refinery','barracks','factory','radar','lab']
               .filter(function (k) { return !!_rtsHas('player', k); }) };
  });
  S.note('the starting base has: ' + early.have.join(', '));
  S.ok('some of the tech tree is locked at the start and some is not',
       early.locked.length > 0 && early.open.length > 0,
       early.locked.length + ' locked, ' + early.open.length + ' open');
  S.ok('every cameo is greyed exactly when there is a reason, and carries that reason in its ' +
       'tooltip', !early.wrong.length, early.wrong.join(' | ') || 'all agree');
  S.ok('...which reads as a sentence, with no click', !!early.sample &&
       /first\.|army|at a time/.test(early.sample.title),
       early.sample ? early.sample.k + ': ' + JSON.stringify(early.sample.title) : 'nothing locked');

  /* ---------- 2. the Commando at her cap ---------- */
  var cap = await g.page.evaluate(function () {
    var G = window._rtsG, U = window._rtsUI, S2 = G.sides.player;
    var yd = _rtsHas('player', 'yard');
    var ytx = _rtsTX(yd.x), ytz = _rtsTX(yd.z);
    /* Stand the whole tree up at once. Placement is a real _rtsCanPlace search so the base is
       a legal one; the buildings are then finished by hand rather than by waiting out ninety
       seconds of build time per structure. */
    ['power', 'refinery', 'barracks', 'factory', 'radar', 'lab'].forEach(function (k) {
      if (_rtsHas('player', k)) return;
      for (var r = 2; r <= 20; r++)
        for (var ox = -r; ox <= r; ox++) for (var oz = -r; oz <= r; oz++) {
          if (Math.max(Math.abs(ox), Math.abs(oz)) !== r) continue;
          if (_rtsCanPlace('player', k, ytx + ox, ytz + oz)) {
            _rtsPlaceStruct('player', k, ytx + ox, ytz + oz); return;
          }
        }
    });
    G.ents.forEach(function (e) {
      if (e.type === 'struct' && e.side === 'player' && e.building) {
        e.building = 0; e.bprog = 1; e.hp = rtsStructDef(e.def).hp;
      }
    });
    _rtsRecalcPower('player');
    S2.credits = 20000;

    rtsTab('infantry'); _rtsSyncSidebar(0);
    var free = { cls: U.btns.tanya.className, title: U.btns.tanya.title,
                 canProduce: _rtsCanProduce('player', 'tanya') };

    _rtsSpawnUnit('player', 'tanya', yd.x + RTS_TILE * 3, yd.z);
    _rtsSyncSidebar(0);
    G.msg = ''; G.msgT = 0;
    _rtsItemClick('tanya');
    return { free: free,
             capped: { cls: U.btns.tanya.className, title: U.btns.tanya.title,
                       canProduce: _rtsCanProduce('player', 'tanya'),
                       canQueue: _rtsCanQueue('player', 'tanya') },
             said: G.msgT > 0 ? G.msg : '(nothing)' };
  });
  S.ok('with the tech and none alive the Commando is buildable', !/locked/.test(cap.free.cls),
       cap.free.cls);
  S.eq('...and the sidebar\'s own question agrees', cap.free.canProduce, true);
  S.eq('the queue refuses a second Commando', cap.capped.canQueue, false);
  S.eq('...and so does the question the sidebar draws from, which it did not before',
       cap.capped.canProduce, false);
  S.ok('...so the cameo is greyed rather than left looking buildable',
       /locked/.test(cap.capped.cls), cap.capped.cls);
  S.ok('...the tooltip says why', /one at a time/.test(cap.capped.title),
       JSON.stringify(cap.capped.title));
  S.ok('...and clicking it says something rather than beeping into silence',
       cap.said !== '(nothing)' && /one at a time/.test(cap.said), cap.said);

  /* ---------- 3. the reason clears again, and does not pile up ---------- */
  var cleared = await g.page.evaluate(function () {
    var G = window._rtsG, U = window._rtsUI;
    var t = G.ents.filter(function (e) { return !e.dead && e.def === 'tanya'; })[0];
    /* Tick the sidebar a few times while she is alive: the reason is appended to a stored base
       tooltip, so a pass that re-appended every frame would grow it without bound. */
    for (var i = 0; i < 5; i++) _rtsSyncSidebar(0.016);
    var whileAlive = U.btns.tanya.title;
    t.dead = true;
    _rtsSyncSidebar(0);
    return { whileAlive: whileAlive, after: U.btns.tanya.title,
             repeats: (whileAlive.match(/You may only have one at a time\./g) || []).length };
  });
  S.eq('the reason is appended once however many frames pass', cleared.repeats, 1);
  S.ok('and it goes away when the reason does',
       !/You may only have one at a time\./.test(cleared.after),
       JSON.stringify(cleared.after));
  S.ok('...leaving the ordinary description behind', /Commando/.test(cleared.after),
       JSON.stringify(cleared.after));

  S.ok('the page logged no errors', !g.errors.length, g.errors.slice(0, 3).join(' | ') || 'clean');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})();
