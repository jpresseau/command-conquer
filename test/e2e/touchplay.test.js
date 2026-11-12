/* WHAT A PHONE COULD NOT DO, OR DID BY ACCIDENT - ui/idlesel.js, ui/go.js, ui/sidebar.js.

   Found by reading the touch paths end to end:

     A MIXED GROUP   a tap selects one unit, a double-tap its kind, a drag pans: tanks and rocket
                     squads on one street could not be selected together, and a team can only be
                     made from a selection. ARMY selects every fighter in view, and again the
                     whole army - never a harvester
     THE TEAM        a second tap on a team's digit looks at it; an empty team says how a phone
                     assigns one, not "Ctrl+N"
     THE LAST ALERT  the game has one message line and the next thing said replaced "under
                     attack", with its tap. Quiet, the line offers the last alert for half a
                     minute, and a tap goes there - not while something is armed, not for ever
     SELL            stayed armed after a sale with nothing on the field to say so: the next tap
                     on a building, meant to select it, sold it. On touch a press sells one
                     building, and a banner says the mode is on. A mouse has its crosshair, and
                     keeps the mode (the control) */

var { chromium, devices } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('touchplay');

/* the scene, staged the same on both devices: two kinds of fighter and a harvester in view by
   the yard, a tank far off, two power plants to sell */
function stage() {
  var G = window._rtsG, R = _rtsR, U = window._rtsUI, y = _rtsHas('player', 'yard'), i;
  for (i = 0; i < RTS_N * RTS_N; i++) { G.mapped[i] = 1; G.vis[i] = 1; }
  G.visDirty = 1;
  G.ents.forEach(function (e) { if (e.type === 'unit') e.dead = true; });
  G.sides.enemy.ai.next = 1e9;
  var tx = _rtsTX(y.x), tz = _rtsTX(y.z);
  var W = { tank: _rtsMUnits('player', 'tank', tx + 3, tz + 4, 2, 't'), rocket: _rtsMUnits('player', 'rocket', tx - 3, tz + 4, 2, 'r'),
            harv: _rtsMUnits('player', 'harvester', tx, tz + 5, 1, 'h') };
  var e = _rtsHas('enemy', 'yard');
  W.far = _rtsMUnits('player', 'tank', Math.round((tx + _rtsTX(e.x)) / 2), Math.round((tz + _rtsTX(e.z)) / 2), 1, 'far');
  W.p1 = _rtsMBuild('player', 'power', tx + 5, tz - 1, 'p1'); W.p2 = _rtsMBuild('player', 'power', tx - 6, tz - 1, 'p2');
  window._W = W;
  G.sel.length = 0; G.msgT = 0; G.alert = null; U.mode = null;
  _rtsLookAt(y.x, y.z + 2 * RTS_TILE); _rtsRFrame(1 / 60); _rtsRFrame(1 / 60);
  function on(u) { return _rtsOnScreen(u); }
  return { inView: W.tank.concat(W.rocket, W.harv).every(on), farOff: !on(W.far[0]), p: on(W.p1) && on(W.p2),
           n: { tank: W.tank.length, rocket: W.rocket.length, harv: W.harv.length, far: W.far.length } };
}
function selNow() {
  var G = window._rtsG, W = window._W;
  function has(l) { return l.every(function (u) { return G.sel.indexOf(u) >= 0; }); }
  return { n: G.sel.length, tanks: has(W.tank), rockets: has(W.rocket), harv: G.sel.indexOf(W.harv[0]) >= 0, far: G.sel.indexOf(W.far[0]) >= 0, msg: G.msg };
}

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { device: devices['iPhone 13'] });
  await g.start(7, 3, { freeze: true });
  var p = g.page;
  var st = await p.evaluate(stage);
  S.ok('the scene: two kinds of fighter and a harvester in view, a tank far off, two plants on screen',
       st.inView && st.farOff && st.p && st.n.tank === 2 && st.n.rocket === 2 && st.n.harv === 1 && st.n.far === 1, JSON.stringify(st));

  /* ---------------- ARMY ---------------- */
  var bar = await p.evaluate(function () {
    var b = document.getElementById('rtsTArmy'), row = b && b.parentNode, stg = document.querySelector('#rcgRts .rts-stage').getBoundingClientRect();
    if (!b) return null;
    var r = b.getBoundingClientRect(), rr = row.getBoundingClientRect(), hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { w: Math.round(r.width), h: Math.round(r.height), fits: rr.left >= stg.left - 1 && rr.right <= stg.right + 1, hit: hit === b,
             n: row.children.length, overlap: Array.prototype.some.call(row.children, function (c, i) { return i && c.getBoundingClientRect().left < row.children[i - 1].getBoundingClientRect().right - 0.5; }) };
  });
  S.ok('ARMY is in the touch bar, a finger wide, reachable', !!bar && bar.w >= 36 && bar.h >= 36 && bar.hit, JSON.stringify(bar));
  S.ok('...and the bar still fits the phone\'s field, no button over another', !!bar && bar.fits && !bar.overlap, JSON.stringify(bar));
  if (bar) {
    await p.locator('#rtsTArmy').tap();
    var a1 = await p.evaluate(selNow);
    S.ok('A MIXED GROUP: one tap selects both kinds of fighter in view', a1.tanks && a1.rockets && a1.n === 4, JSON.stringify(a1));
    S.ok('...not the harvester, and not the tank across the map', !a1.harv && !a1.far, JSON.stringify(a1));
    await p.locator('#rtsTArmy').tap();
    var a2 = await p.evaluate(selNow);
    S.ok('...and again, the whole army: the far tank too, still no harvester', a2.far && a2.tanks && a2.rockets && !a2.harv && a2.n === 5, JSON.stringify(a2));
  }

  /* ---------------- the team ---------------- */
  await p.evaluate(function () { var G = window._rtsG, W = window._W; G.sel = W.far.slice(); _rtsHandleTeam(4, 2); G.sel = []; });
  await p.locator('#rtsTTeams').tap();
  await p.evaluate(function () { _rtsRFrame(1 / 60); });
  await p.locator('#rtsTTeam4').tap();
  var t1 = await p.evaluate(function () { var W = window._W; return { sel: window._rtsG.sel.length === 1 && window._rtsG.sel[0] === W.far[0], seen: _rtsOnScreen(W.far[0]) }; });
  S.ok('THE TEAM: a tap on its digit selects it, the view where it was', t1.sel && !t1.seen, JSON.stringify(t1));
  await p.locator('#rtsTTeam4').tap();
  var t2 = await p.evaluate(function () { _rtsRFrame(1 / 60); return { seen: _rtsOnScreen(window._W.far[0]) }; });
  S.ok('...and a second tap looks at it', t2.seen, JSON.stringify(t2));
  await p.locator('#rtsTTeam7').tap();
  var t3 = await p.evaluate(function () { return window._rtsG.msg; });
  S.ok('an empty team says how a phone assigns one', /hold the digit/.test(t3 || '') && !/Ctrl/.test(t3 || ''), JSON.stringify(t3));
  await p.locator('#rtsTTeams').tap();

  /* ---------------- the last alert ---------------- */
  function line() { _rtsSyncSidebar(0); var m = document.getElementById('rtsMsg'); return { text: m.textContent, cls: m.className }; }
  var al = await p.evaluate(function (lineSrc) {
    var line = eval('(' + lineSrc + ')'), G = window._rtsG, U = window._rtsUI, W = window._W, y = _rtsHas('player', 'yard'), o = {};
    _rtsLookAt(y.x, y.z); G.msgT = 0; G.alert = null;
    o.none = line();
    G.alert = { x: W.far[0].x, z: W.far[0].z, t: G.t - 10 };
    o.kept = line();
    U.mode = 'sell'; o.armed = line(); U.mode = null;
    _rtsSay('Building.'); o.said = line(); G.msgT = 0;
    G.alert.t = G.t - RTS_ALERT_KEEP - 1; o.old = line();
    G.alert.t = G.t - 10; o.again = line();
    o.farSeen = _rtsOnScreen(W.far[0]);
    return o;
  }, line.toString());
  S.ok('with no alert the quiet line is empty (population)', al.none.text === '' && !/alert/.test(al.none.cls), JSON.stringify(al.none));
  S.ok('THE LAST ALERT: ten seconds on, with nothing being said, the line still offers it, tappable',
       /Last alert/.test(al.kept.text) && /tap/.test(al.kept.text) && /\bon\b/.test(al.kept.cls) && /\bgo\b/.test(al.kept.cls) && /\balert\b/.test(al.kept.cls), JSON.stringify(al.kept));
  S.ok('...not while SELL is armed: its banner has the slot', al.armed.text === '', JSON.stringify(al.armed));
  S.ok('...a line being said takes its place', al.said.text === 'Building.' && !/\balert\b/.test(al.said.cls), JSON.stringify(al.said));
  S.ok('...and it is not offered for ever', al.old.text === '', JSON.stringify(al.old));
  S.ok('the alert is off the screen to go to (population)', /Last alert/.test(al.again.text) && !al.farSeen, JSON.stringify(al.again));
  if (/Last alert/.test(al.again.text)) await p.locator('#rtsMsg').tap();      /* a line that is not offered cannot be tapped */
  var went = await p.evaluate(function () { _rtsRFrame(1 / 60); return _rtsOnScreen(window._W.far[0]); });
  S.ok('...a tap on the line looks at where it was', went, String(went));

  /* ---------------- SELL ---------------- */
  var sellPts = await p.evaluate(function () {
    var G = window._rtsG, W = window._W, y = _rtsHas('player', 'yard'), c = document.getElementById('rtsCv').getBoundingClientRect();
    G.alert = null; G.msgT = 0; G.sel = [];
    _rtsLookAt(y.x, y.z + 2 * RTS_TILE); _rtsRFrame(1 / 60);
    function pt(e) { var s = _rtsScreenOf(e); return { x: c.left + s.x, y: c.top + s.y }; }
    return { p1: pt(W.p1), p2: pt(W.p2) };
  });
  await p.locator('#rcgRts .rts-ops button[data-mode="sell"]').tap();
  var armed = await p.evaluate(function () {
    var G = window._rtsG, said = [], real = window._rtsBanner;
    window._rtsBanner = function (g2, W2, text, y) { said.push(text); return real(g2, W2, text, y); };
    G.msgT = 0; _rtsRFrame(1 / 60); _rtsDrawHud(1 / 60);        /* the HUD's own pass: ui/camera.js draws it after the frame */
    window._rtsBanner = real;
    return { mode: window._rtsUI.mode, said: said };
  });
  S.ok('SELL armed on a phone: a banner on the field says so, and how to leave it', armed.mode === 'sell' && armed.said.length === 1 && /SELL/.test(armed.said[0]) && /tap SELL to cancel/.test(armed.said[0]), JSON.stringify(armed));
  await p.touchscreen.tap(sellPts.p1.x, sellPts.p1.y);
  var s1 = await p.evaluate(function () { var W = window._W; return { sold: !!W.p1.selling, mode: window._rtsUI.mode, lit: document.querySelector('#rcgRts .rts-ops button[data-mode="sell"]').className, msg: window._rtsG.msg }; });
  S.ok('a tap on a building sells it', s1.sold && /Sold/.test(s1.msg || ''), JSON.stringify(s1));
  S.ok('ONE SALE A PRESS: the mode is off again, its button unlit', s1.mode === null && s1.lit !== 'on', JSON.stringify(s1));
  await p.waitForTimeout(450);                    /* past the double-tap window */
  await p.touchscreen.tap(sellPts.p2.x, sellPts.p2.y);
  var s2 = await p.evaluate(function () { var W = window._W, G = window._rtsG; return { sold: !!W.p2.selling, selected: G.sel.length === 1 && G.sel[0] === W.p2 }; });
  S.ok('...so the next tap on a building selects it, and does not sell it', !s2.sold && s2.selected, JSON.stringify(s2));
  S.ok('no page errors on the phone', !g.errors.length, g.errors.join(' | ') || 'none');
  await g.close();

  /* ---------------- the control: a mouse keeps the mode ---------------- */
  var d = await openPage(browser, { width: 1200, height: 800, dpr: 1 });
  await d.start(7, 3, { freeze: true });
  var dk = await d.page.evaluate(function (stageSrc) {
    var st = eval('(' + stageSrc + ')')(), W = window._W, G = window._rtsG, o = { st: st, bar: !!document.getElementById('rtsTArmy') };
    rtsMode('sell');
    var s = _rtsScreenOf(W.p1);
    o.used = _rtsModeClick(s.x, s.y); o.sold = !!W.p1.selling; o.mode = window._rtsUI.mode;
    o.hint = _rtsModeHint('sell', false);
    G.alert = { x: W.far[0].x, z: W.far[0].z, t: G.t - 5 }; G.msgT = 0; window._rtsUI.mode = null;
    _rtsSyncSidebar(0); o.line = document.getElementById('rtsMsg').textContent;
    return o;
  }, stage.toString());
  S.ok('THE CONTROL: with a mouse a sale leaves SELL armed, as it was', dk.used && dk.sold && dk.mode === 'sell', JSON.stringify({ used: dk.used, sold: dk.sold, mode: dk.mode }));
  S.ok('...its banner says Esc, and the quiet line says Space', /Esc to cancel/.test(dk.hint) && /Space/.test(dk.line) && !/tap/.test(dk.line), JSON.stringify({ hint: dk.hint, line: dk.line }));
  S.ok('...and a desktop has no ARMY button', !dk.bar, String(dk.bar));
  S.ok('no page errors on the desktop', !d.errors.length, d.errors.join(' | ') || 'none');
  await d.close();

  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
