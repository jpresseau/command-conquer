/* WHAT THE SIDEBAR AND THE GROUND SAY ABOUT BUILDING - ui/repeat.js, ui/select.js; the rules are
   unit/placewhy's. This is the wiring, in the page:

     THE TABS    each tab carries its line's state (data-st, and --p for how far along): a
                 building under way shows on Build while Vehicles is the tab in view, and when
                 it is finished Build says ready - which was drawn only on the tile, on the tab
                 it was on
     THE GROUND  a placement refused says the reason it was refused: on water, on the ore, too
                 far - one line used to stand for all of them */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('buildsay');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 1100, height: 760, dpr: 1 });
  await g.start(7, 2, { freeze: true });

  var out = await g.page.evaluate(function () {
    var o = {}, G = window._rtsG, U = window._rtsUI, R = _rtsR, Sd = G.sides.player, i;
    for (i = 0; i < RTS_N * RTS_N; i++) { G.mapped[i] = 1; G.vis[i] = 1; }
    G.visDirty = 1; G.sides.enemy.ai.next = 1e9;
    function tab(cat) { var b = document.querySelector('#rcgRts .rts-tabs button[data-cat="' + cat + '"]'); return b ? { st: b.getAttribute('data-st') || '', p: b.style.getPropertyValue('--p'), on: b.className === 'on', anim: getComputedStyle(b).animationName } : null; }
    function tabs() { _rtsSyncSidebar(0); return { struct: tab('struct'), vehicle: tab('vehicle'), infantry: tab('infantry') }; }
    Sd.money = 99999; Sd.ready = null; Sd.q.struct = null;
    o.idle = tabs();
    _rtsQueue('player', 'power');
    for (i = 0; i < 60 * 3; i++) _rtsTickProduction('player', 1 / 60);
    rtsTab('vehicle');
    o.busy = tabs(); o.prog = Sd.q.struct ? Math.floor(Sd.q.struct.prog * 100) : -1;
    G.msg = null;
    for (i = 0; i < 60 * 120 && Sd.q.struct; i++) _rtsTickProduction('player', 1 / 60);
    o.done = tabs(); o.ready = Sd.ready; o.said = G.msg;

    /* ---- the ground ---- */
    var y = _rtsHas('player', 'yard');
    function refuse(tx, tz) {
      U.place = 'power'; R.zi = RTS_ZOOM_BASE_STEPS - 1; _rtsApplyCam(); _rtsLookAt(_rtsWX(tx) + RTS_TILE / 2, _rtsWX(tz) + RTS_TILE / 2); _rtsRFrame(0);
      var sp = _rtsGroundToScreen(_rtsWX(tx) + RTS_TILE / 2, _rtsWX(tz) + RTS_TILE / 2);
      G.msg = null; var n0 = G.ents.length;
      _rtsTryPlace(sp.x, sp.y);
      return { msg: G.msg, placed: G.ents.length !== n0, still: U.place };
    }
    function find(fn) { for (var k = 0; k < RTS_N * RTS_N; k++) { var tx = k % RTS_N, tz = (k / RTS_N) | 0; if (tx > 8 && tz > 8 && tx < RTS_N - 9 && tz < RTS_N - 9 && fn(tx, tz, k)) return [tx, tz]; } return null; }
    /* a spot whose every neighbour is refused for the same reason: the tap lands in a cell, and
       which one is the projection's business, not this spec's */
    function why(tx, tz) { return _rtsPlaceWhyNot('player', 'power', tx - 1, tz - 1); }
    function uniform(tx, tz, w) { for (var a = -2; a <= 2; a++) for (var b = -2; b <= 2; b++) if (why(tx + a, tz + b) !== w) return false; return true; }
    var sea = find(function (tx, tz) { return uniform(tx, tz, 'water'); });
    var ore = find(function (tx, tz) { return uniform(tx, tz, 'ore'); });
    var far = find(function (tx, tz) { return Math.hypot(tx - y.tx, tz - y.tz) > 30 && uniform(tx, tz, 'far'); });
    o.spots = { sea: !!sea, ore: !!ore, far: !!far };
    o.sea = sea ? refuse(sea[0], sea[1]) : null;
    o.ore = ore ? refuse(ore[0], ore[1]) : null;
    o.far = far ? refuse(far[0], far[1]) : null;
    o.words = { water: _rtsPlaceWhyText('water', 'power'), ore: _rtsPlaceWhyText('ore', 'power'), far: _rtsPlaceWhyText('far', 'power') };
    /* and clear ground beside the yard takes it (the control) */
    var ok = find(function (tx, tz) { return Math.hypot(tx - y.tx, tz - y.tz) < 8 && why(tx, tz) === null && why(tx + 1, tz) === null && why(tx, tz + 1) === null && why(tx - 1, tz) === null && why(tx, tz - 1) === null; });
    o.okSpot = !!ok;
    if (ok) { var r = refuse(ok[0], ok[1]); o.ok = r; o.after = tabs(); }
    return o;
  });

  /* ---- the tabs ---- */
  S.ok('an idle line shows nothing on its tab (population)', out.idle.struct && out.idle.struct.st === '' && out.idle.vehicle.st === '', JSON.stringify(out.idle));
  S.ok('THE TABS: a building under way shows on Build while Vehicles is the tab in view', out.busy.vehicle.on && !out.busy.struct.on && out.busy.struct.st === 'busy' && out.busy.vehicle.st === '', JSON.stringify(out.busy));
  S.ok('...with how far along it is', out.prog > 0 && out.prog < 100 && out.busy.struct.p === out.prog + '%', out.busy.struct.p + ' against ' + out.prog + '%');
  S.ok('finished, Build says a building is ready - still not the tab in view', out.ready === 'power' && out.done.struct.st === 'ready' && !out.done.struct.on, JSON.stringify(out.done.struct));
  S.ok('...and pulses', out.done.struct.anim === 'rtsTabReady' && out.busy.struct.anim !== 'rtsTabReady', out.done.struct.anim);
  S.ok('...and the line says so', /Power Plant ready/.test(out.said || ''), JSON.stringify(out.said));

  /* ---- the ground ---- */
  S.ok('water, ore and far-off clear ground to try (population)', out.spots.sea && out.spots.ore && out.spots.far && out.okSpot, JSON.stringify(out.spots));
  if (out.sea) S.ok('THE GROUND: on water it says water', out.sea.msg === out.words.water && !out.sea.placed && out.sea.still === 'power', JSON.stringify(out.sea));
  if (out.ore) S.ok('...on the ore, the ore', out.ore.msg === out.words.ore && !out.ore.placed, JSON.stringify(out.ore));
  if (out.far) S.ok('...and too far from the base, that', out.far.msg === out.words.far && !out.far.placed, JSON.stringify(out.far));
  S.ok('...three different lines', out.words.water !== out.words.ore && out.words.ore !== out.words.far && out.words.water !== out.words.far, '');
  if (out.ok) {
    S.ok('clear ground beside the yard takes the building (the control)', out.ok.placed && out.ok.still === null, JSON.stringify(out.ok));
    S.ok('...and Build\'s tab is quiet again', out.after.struct.st === '', JSON.stringify(out.after.struct));
  }
  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
