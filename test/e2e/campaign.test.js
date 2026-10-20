/* THE CAMPAIGN, WITH REAL CLICKS (src/campaign.js, title.js, ui/shell.js, ui/sidebar.js):

     THE LIST       CAMPAIGN on the title lists every mission, and to a new player only the first
                    is open: the rest are locked, each saying which win opens it, and refuse to
                    start; a real click on PLAY opens the first: its seed, army, difficulty, laid
     IN BATTLE      the objectives sit on the battlefield and read the mission's goals; a mission
                    saves, and its save says which mission it is
     THE END        a won mission's card says MISSION COMPLETE with the mission's own reason and
                    its line of story, offers the next one, and keeps the result; Retry replays it
     PUT BACK       back on the title the player has their own army and difficulty, and the list
                    marks the mission won and opens the next
     A LEVEL        a mission that offers levels has a choice on its card, opening on its own; PLAY
                    at Veteran gives the Dominion Veteran and the ally the mission's own; the end
                    card names the level, the record keeps it, and Next carries it on
     RESUMED        saved mid-mission and quit, the title has the player's own army back and offers
                    the mission by name and level; RESUME BATTLE brings it back as that mission, at
                    that level, at the moment it was saved, not laid again; Retry keeps the level */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('campaign');

function centre(sel) {
  var b = document.querySelector(sel), r = b && b.getBoundingClientRect();
  return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
}

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 1100, height: 760 });
  var p = g.page;

  /* the player's own choices: the Dominion, on hard - the first mission is the Compact on easy */
  var before = await p.evaluate(function () {
    rtsSetArmySide('soviet'); rtsSetDiff('hard');
    try { localStorage.removeItem('bw.campaign'); } catch (e) {}
    return { army: rtsArmySide(), diff: window._RTS_DIFF };
  });
  var at = await p.evaluate(centre, '#rtsCampBtn');
  await p.mouse.click(at.x, at.y);
  var list = await p.evaluate(function () {
    var box = document.getElementById('rtsCampList'), cards = box.querySelectorAll('.mission');
    var locked = box.querySelectorAll('.mission.locked');
    var refused = (rtsCampStart('breachwater'), !!window._RTS_MISSION);
    return { open: !box.hidden && box.getBoundingClientRect().height > 50, n: cards.length, of: RTS_CAMPAIGN.length, text: box.textContent,
             locked: locked.length, play: box.querySelectorAll('.mission button').length, firstPlay: !!cards[0].querySelector('button'),
             says: locked[0] ? locked[0].textContent : '', refused: refused, brief: cards[0].textContent.indexOf(RTS_CAMPAIGN[0].brief) >= 0 };
  });
  S.ok('CAMPAIGN lists every mission, the first with its brief', list.open && list.n === list.of && list.n >= 8 && list.text.indexOf('Low Water') >= 0 && list.brief,
       JSON.stringify({ open: list.open, n: list.n, brief: list.brief }));
  S.ok('...and to a new player only the first is open: the rest are locked, each saying which win opens it', list.locked === list.of - 1 && list.play === 1 && list.firstPlay &&
       /Win Boot Camp to open it/.test(list.says), JSON.stringify({ locked: list.locked, play: list.play, says: list.says }));
  S.ok('...and a locked mission refuses to start', list.refused === false, String(list.refused));

  /* ---------- play ---------- */
  await p.evaluate(function () { document.querySelector('#rtsCampList .mission button').scrollIntoView(); });
  at = await p.evaluate(centre, '#rtsCampList .mission button');
  await p.mouse.click(at.x, at.y);
  await p.waitForFunction(function () { return !!(window._rtsG && window._rtsG.mission && document.getElementById('rcgRts')); }, null, { timeout: 60000 }).catch(function () {});
  var inside = await p.evaluate(function () {
    var G = window._rtsG, m = RTS_CAMPAIGN[0];
    return G ? { seed: G.seed, army: rtsArmySide(), diff: G.diff, id: G.mission && G.mission.id, want: { seed: m.seed, army: m.army, diff: m.diff } } : null;
  });
  S.ok('a real click on PLAY opens the mission: its seed, army and difficulty, laid', !!inside && inside.id === 'bootcamp' && inside.seed === inside.want.seed &&
       inside.army === inside.want.army && inside.diff === inside.want.diff, JSON.stringify(inside));

  var hud = await p.evaluate(function () {
    _rtsSyncSidebar(0);
    var el = document.getElementById('rtsGoals'), r = el.getBoundingClientRect();
    var saved = rtsSaveGame();
    return { shown: !el.hidden && r.width > 40 && r.height > 20, spans: el.querySelectorAll('span').length, text: el.textContent, saved: saved, msg: window._rtsG.msg };
  });
  S.ok('the objectives sit on the battlefield and read the mission\'s goals', hud.shown && hud.spans === 4 && /Refinery/.test(hud.text), JSON.stringify(hud));
  var sinfo = await p.evaluate(function () { var i = rtsSaveInfo(); return i && { mission: i.mission, desc: i.desc, first: { id: RTS_CAMPAIGN[0].id, name: RTS_CAMPAIGN[0].name } }; });
  S.ok('...and a mission saves, and its save says which mission it is', hud.saved === true && !!sinfo && !!sinfo.mission && sinfo.mission.id === sinfo.first.id &&
       sinfo.desc.indexOf(sinfo.first.name + ' — Recruit') === 0, JSON.stringify({ saved: hud.saved, msg: hud.msg, info: sinfo }));

  /* ---------- the end ---------- */
  var card = await p.evaluate(function () {
    var G = window._rtsG;
    if (!G || !G.mission) return { text: '', btns: [], stored: null, next: '' };   /* fail on the assertion, not a throw */
    if (window._rtsUI) window._rtsUI.dead = true;
    G.t = 140; G.over = 'win'; G.mission.why = 'The post is down: you have a base, an army and the trade.';
    _rtsSyncSidebar(0);
    var o = document.getElementById('rtsOver');
    var after = o.querySelector('p.after');
    return { text: o.textContent, btns: Array.prototype.map.call(o.querySelectorAll('button'), function (b) { return b.textContent; }),
             stored: localStorage.getItem('bw.campaign'), first: RTS_CAMPAIGN[0].id, next: RTS_CAMPAIGN[1].name, after: after ? after.textContent : '', want: RTS_CAMPAIGN[0].after };
  });
  S.ok('a won mission\'s card says so, with the mission\'s own reason, and offers the next', /MISSION COMPLETE/.test(card.text) && /post is down/.test(card.text) &&
       card.btns[0] === 'Next: ' + card.next && card.btns.indexOf('Retry') >= 0 && card.btns.indexOf('Missions') >= 0, JSON.stringify(card.btns));
  S.ok('...and its medal: gold, won at its one level inside its par', /🥇 Gold/.test(card.text), (/🥇 Gold|🥈 Silver|🥉 Bronze/.exec(card.text) || [''])[0]);
  S.ok('...and its line of story, on into the next', !!card.want && card.after === card.want, JSON.stringify(card.after));
  S.ok('...and keeps the result, under the first mission\'s id', !!card.stored && !!card.first && (JSON.parse(card.stored)[card.first] || {}).won === true, JSON.stringify({ first: card.first, stored: card.stored }));

  var again = await p.evaluate(function () {
    rtsRestart();
    /* a deadline in time, not in polls: under SwiftShader a skirmish's frames stretch every poll */
    var until = Date.now() + 30000;
    return new Promise(function (res) {
      (function wait() {
        var G = window._rtsG;
        if (G && G.mission && document.getElementById('rcgRts') && !G.over) return res({ id: G.mission.id, seed: G.seed, army: rtsArmySide() });
        if (G && !G.mission && document.getElementById('rcgRts')) return res({ id: null, seed: G.seed, army: rtsArmySide() });
        if (Date.now() > until) return res(null);
        setTimeout(wait, 100);
      })();
    });
  });
  S.ok('Retry replays the same mission', !!again && again.id === 'bootcamp' && again.army === 'allied', JSON.stringify(again));

  /* ---------- put back ---------- */
  var home = await p.evaluate(function () {
    rtsClose();
    rtsCampToggle(); if (document.getElementById('rtsCampList').hidden) rtsCampToggle();
    var second = document.querySelector('#rtsCampList .mission[data-id="' + RTS_CAMPAIGN[1].id + '"]');
    return { army: rtsArmySide(), diff: window._RTS_DIFF, mission: window._RTS_MISSION, title: !document.getElementById('rtsHome').classList.contains('gone'),
             won: document.querySelectorAll('#rtsCampList .mission.won').length, second: !!second && !second.classList.contains('locked') && !!second.querySelector('button'),
             locked: document.querySelectorAll('#rtsCampList .mission.locked').length, of: RTS_CAMPAIGN.length };
  });
  S.ok('back on the title the player has their own army and difficulty', home.title && home.army === before.army && home.diff === before.diff && !home.mission,
       JSON.stringify(home) + ' (theirs ' + JSON.stringify(before) + ')');
  S.eq('...and the list marks the mission won', home.won, 1);
  S.ok('...and opens the next one, and only that one', home.second && home.locked === home.of - 2, JSON.stringify({ second: home.second, locked: home.locked }));

  /* ---------- a level ---------- */
  /* Two Fronts is the sixth: the five before it won, as a player who got this far has them */
  await p.evaluate(function () {
    var done = JSON.parse(localStorage.getItem('bw.campaign') || '{}');
    RTS_CAMPAIGN.slice(0, 5).forEach(function (m) { done[m.id] = done[m.id] || { won: true, secs: 300, lost: 0, killed: 0, lvl: m.diff }; });
    localStorage.setItem('bw.campaign', JSON.stringify(done));
    var box = document.getElementById('rtsCampList'); box.hidden = true; rtsCampToggle();
  });
  var pick = await p.evaluate(function () {
    var card = document.querySelector('#rtsCampList .mission[data-id="twofronts"]'), sel = card && card.querySelector('select.lvl');
    var low = document.querySelector('#rtsCampList .mission[data-id="lowwater"] select.lvl');
    if (!sel) return { sel: false, low: !!low };
    var first = sel.value, opts = Array.prototype.map.call(sel.options, function (o) { return o.value; });
    sel.value = 'hard'; sel.scrollIntoView();
    var skirmish = Array.prototype.map.call(document.querySelectorAll('#rtsDiff button'), function (b) { return b.getAttribute('data-d'); });
    return { sel: true, first: first, opts: opts, low: !!low, skirmish: skirmish };
  });
  S.ok('a mission that offers levels has a choice on its card, opening on its own; one that offers only its own has none',
       pick.sel && pick.first === 'normal' && pick.opts.join() === 'easy,regular,normal,hard' && !pick.low, JSON.stringify(pick));
  S.ok('...and Regular, the campaign rung, is a mission\'s choice only: the skirmish picker has the other three', pick.skirmish && pick.skirmish.join() === 'easy,normal,hard',
       JSON.stringify(pick.skirmish));
  at = await p.evaluate(centre, '#rtsCampList .mission[data-id="twofronts"] button');
  if (at) await p.mouse.click(at.x, at.y);
  await p.waitForFunction(function () { var G = window._rtsG; return !!(G && G.mission && G.mission.id === 'twofronts' && document.getElementById('rcgRts')); }, null, { timeout: 60000 }).catch(function () {});
  /* ---------- resumed ---------- */
  var saved = await p.evaluate(function () {
    var G = window._rtsG;
    if (!G || !G.mission) return null;
    for (var i = 0; i < 60 * 20; i++) _rtsTick(1 / 60);        /* a little way in: a save of the opening proves little */
    var out = { ok: rtsSaveGame(), t: Math.round(G.t), units: G.ents.filter(function (e) { return !e.dead && e.side === 'enemy'; }).length };
    rtsClose();
    var r = document.getElementById('rtsResume');
    out.army = rtsArmySide(); out.diff = window._RTS_DIFF; out.mission = window._RTS_MISSION;
    out.resume = r && !r.hidden ? r.textContent : '';
    return out;
  });
  S.ok('RESUMED: saved mid-mission and quit, the title has the player\'s own army back and offers the mission by name and level', !!saved && saved.ok &&
       saved.army === before.army && saved.diff === before.diff && !saved.mission && /Two Fronts — Veteran/.test(saved.resume), JSON.stringify(saved));
  await p.evaluate(function () { var r = document.getElementById('rtsResume'); if (r) r.scrollIntoView({ block: 'center' }); });
  at = await p.evaluate(centre, '#rtsResume');
  if (at) await p.mouse.click(at.x, at.y);
  await p.waitForFunction(function () { var G = window._rtsG; return !!(G && G.mission && document.getElementById('rcgRts')); }, null, { timeout: 60000 }).catch(function () {});
  var back = await p.evaluate(function () {
    var G = window._rtsG;
    return G && { id: G.mission && G.mission.id, lvl: G.mission && G.mission.lvl, t: Math.round(G.t), army: rtsArmySide(), page: window._RTS_MISSION && window._RTS_MISSION.id,
      units: G.ents.filter(function (e) { return !e.dead && e.side === 'enemy'; }).length, goals: document.getElementById('rtsGoals').textContent };
  });
  S.ok('...and RESUME BATTLE brings it back as that mission, at that level, at the moment it was saved - not laid again', !!saved && !!back && back.id === 'twofronts' &&
       back.lvl === 'hard' && back.page === 'twofronts' && back.army === 'allied' && Math.abs(back.t - saved.t) <= 1 && back.units === saved.units && /ally/i.test(back.goals),
       JSON.stringify({ back: back, saved: saved && { t: saved.t, units: saved.units } }));

  var vet = await p.evaluate(function () {
    var G = window._rtsG;
    if (!G || !G.mission || G.mission.id !== 'twofronts') return null;
    var seats = { lvl: G.mission.lvl, diff: G.diff, enemy: _rtsBias('enemy').name, ally: _rtsBias('ally').name };
    if (window._rtsUI) window._rtsUI.dead = true;
    G.t = 421; G.over = 'win'; G.mission.why = 'The flank held.';
    _rtsSyncSidebar(0);
    var o = document.getElementById('rtsOver'), nx = o.querySelector('button');
    seats.card = o.textContent; seats.next = nx ? nx.getAttribute('onclick') : '';
    seats.stored = (JSON.parse(localStorage.getItem('bw.campaign') || '{}').twofronts || {}).lvl;
    return seats;
  });
  S.ok('PLAY at Veteran: the Dominion plays Veteran, the ally and the battle the mission\'s own', !!vet && vet.lvl === 'hard' && vet.enemy === 'Veteran' &&
       vet.ally === 'Soldier' && vet.diff === 'normal', JSON.stringify(vet));
  S.ok('...the end card names the level, the record keeps it, and Next carries it on', !!vet && /Two Fronts \(Veteran\)/.test(vet.card) && vet.stored === 'hard' &&
       /rtsCampNext\('mirror', 'hard'\)/.test(vet.next), JSON.stringify(vet && { card: vet.card.slice(0, 80), stored: vet.stored, next: vet.next }));
  var retry = await p.evaluate(function () {
    rtsRestart();
    var until = Date.now() + 30000;
    return new Promise(function (res) {
      (function wait() {
        var G = window._rtsG;
        if (G && G.mission && !G.over && document.getElementById('rcgRts')) return res({ id: G.mission.id, lvl: G.mission.lvl, t: Math.round(G.t) });
        if (Date.now() > until) return res(null);
        setTimeout(wait, 100);
      })();
    });
  });
  S.ok('...and Retry replays it from the start at the same level', !!retry && retry.id === 'twofronts' && retry.lvl === 'hard' && retry.t < 5, JSON.stringify(retry));
  var listed = await p.evaluate(function () {
    rtsClose();
    var box = document.getElementById('rtsCampList'); box.hidden = true; rtsCampToggle();
    var h = box.querySelector('.mission[data-id="twofronts"] h3');
    return h ? h.textContent : '';
  });
  S.ok('...and the list shows the win at Veteran, a gold - the top level it offers, with no par to meet', /🥇 .* Veteran/.test(listed), listed);

  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');
  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
