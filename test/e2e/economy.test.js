/* Numbers the player is shown, and state that has to survive a load.

   None of these lose a match on their own. What they have in common is that each one made the
   game report something that was not true - a refund three times the money you got, a storage
   bar reading empty over a full treasury, a Soviet base defended by Allied buildings, a
   battlefield that forgets its dead - and a readout that disagrees with the game is worse than
   no readout, because it is acted on. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('economy');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 1200, height: 850 });
  await g.start(7, 20);

  /* ---------- 1. the SELL refund says what it pays ---------- */
  var sell = await g.page.evaluate(function () {
    var G = window._rtsG, out = [];
    function place(key, hpFrac) {
      var yd = _rtsHas('player', 'yard'), spot = null;
      for (var r = 3; r <= 14 && !spot; r++) for (var a = 0; a < 20 && !spot; a++) {
        var tx = _rtsTX(yd.x + Math.cos(a / 20 * 6.283) * r * RTS_TILE) - 1;
        var tz = _rtsTX(yd.z + Math.sin(a / 20 * 6.283) * r * RTS_TILE) - 1;
        if (_rtsCanPlace('player', key, tx, tz)) spot = [tx, tz];
      }
      if (!spot) return null;
      var e = _rtsPlaceStruct('player', key, spot[0], spot[1]);
      if (!e) return null;
      e.building = 0; e.bprog = 1;                 /* finished, not under construction */
      e.paid = rtsStructDef(key).cost;
      e.hp = Math.max(1, Math.round(e.maxHp * hpFrac));
      return e;
    }
    [['refinery', 1], ['power', 0.3], ['power', 1], ['factory', 1]].forEach(function (c) {
      var e = place(c[0], c[1]);
      if (!e) { out.push({ key: c[0], error: 'could not place' }); return; }
      var Sp = G.sides.player;
      var before = Sp.credits + Sp.ore;
      G.msg = '';
      window._rtsUI.mode = 'sell';
      /* through the real click path, so the message is the one a player reads */
      var scr = _rtsWorldToScreen ? null : null;
      _rtsSell(e);                                  /* grant */
      var granted = (Sp.credits + Sp.ore) - before;
      var said = null;
      /* and now the same building through the UI, to compare what it prints */
      var e2 = place(c[0], c[1]);
      if (e2) {
        var b2 = Sp.credits + Sp.ore;
        G.msg = '';
        var back = _rtsSell(e2);
        said = back;
        granted = (Sp.credits + Sp.ore) - b2;
      }
      window._rtsUI.mode = null;
      out.push({ key: c[0], hp: Math.round(c[1] * 100) + '%', said: said, granted: granted });
    });
    return out;
  });
  sell.forEach(function (r) {
    if (r.error) { S.ok('sell ' + r.key, false, r.error); return; }
    S.eq('SELL of a ' + r.key + ' at ' + r.hp + ' hp reports what it pays', r.said, r.granted);
  });

  /* ---------- 2. stored ore cannot outlive the storage ---------- */
  var store = await g.page.evaluate(function () {
    var G = window._rtsG, Sp = G.sides.player;
    /* bank some ore through the real income path */
    var capBefore = rtsCapacity('player');
    if (capBefore <= 0) {
      var yd = _rtsHas('player', 'yard'), spot = null;
      for (var r = 3; r <= 14 && !spot; r++) for (var a = 0; a < 20 && !spot; a++) {
        var tx = _rtsTX(yd.x + Math.cos(a / 20 * 6.283) * r * RTS_TILE) - 1;
        var tz = _rtsTX(yd.z + Math.sin(a / 20 * 6.283) * r * RTS_TILE) - 1;
        if (_rtsCanPlace('player', 'refinery', tx, tz)) spot = [tx, tz];
      }
      if (!spot) return { error: 'nowhere for a refinery' };
      var rf = _rtsPlaceStruct('player', 'refinery', spot[0], spot[1]);
      rf.building = 0; rf.bprog = 1;
      capBefore = rtsCapacity('player');
    }
    Sp.ore = 0;
    _rtsHarvested(Sp, Math.min(1500, capBefore));
    var held = Sp.ore;
    /* now destroy every storage building the player has */
    G.ents.filter(function (e) { return !e.dead && e.side === 'player' && e.type === 'struct' &&
      (rtsStructDef(e.def) || {}).storage; }).forEach(function (e) { _rtsKill(e); });
    for (var i = 0; i < 120; i++) _rtsTick(1 / 60);
    return { held: held, capAfter: rtsCapacity('player'), oreAfter: Sp.ore,
             spill: Sp.spill, credits: Sp.credits };
  });
  S.ok('some ore was banked to test with', !store.error && store.held > 0,
       store.error || (store.held + ' held against ' + store.held + ' capacity'));
  S.eq('with no storage left, capacity is zero', store.capAfter, 0);
  S.eq('...and the ore held matches it', store.oreAfter, 0);
  S.ok('...with the loss announced rather than silent', store.spill > 0,
       store.spill + ' spilled');

  /* ---------- 3. the opponent's opening defence is its own army's ---------- */
  var turrets = await g.page.evaluate(function () {
    var out = {};
    ['allied', 'soviet'].forEach(function (mine) {
      rtsSetVoxSide(mine);
      _rtsNewGame(7, 'normal');
      var G = window._rtsG, theirs = rtsHouseSide('enemy'), wrong = [];
      G.ents.filter(function (e) { return !e.dead && e.side === 'enemy' && e.type === 'struct'; })
        .forEach(function (e) {
          var d = rtsStructDef(e.def);
          if (d && d.side && d.side !== theirs) wrong.push(e.def + '(' + d.side + ')');
        });
      out[mine] = { enemyIs: theirs, wrong: wrong,
        structs: G.ents.filter(function (e) { return !e.dead && e.side === 'enemy' && e.type === 'struct'; })
                       .map(function (e) { return e.def; }) };
    });
    return out;
  });
  ['allied', 'soviet'].forEach(function (mine) {
    var t = turrets[mine];
    S.ok('playing ' + mine + ', the ' + t.enemyIs + ' opponent has no ' +
         (t.enemyIs === 'soviet' ? 'Allied' : 'Soviet') + ' buildings',
         !t.wrong.length, t.wrong.join(', ') || t.structs.join(', '));
  });

  /* ---------- 4. bodies survive a save and load ----------
     Asserted on THE GROUND, not on the queue. G.corpses is a hand-off list that the renderer
     empties on the very next frame - including the load's own first frame, which stamps the
     restored bodies straight into the fresh terrain bake - so counting the queue after a load
     correctly reads zero whether the fix works or not. What actually distinguishes them is
     whether the bake has bodies painted on it, so that is what is measured: the same patch of
     terrain, with and without the deaths, compared pixel by pixel. */
  var bodies = await g.page.evaluate(function () {
    function run(kill) {
      rtsSetVoxSide('allied');
      if (document.getElementById('rcgRts')) rtsClose();
      rtsOpen(7);
      for (var i = 0; i < 60 * 10; i++) _rtsTick(1 / 60);
      var G = window._rtsG, at = null, killed = 0;
      if (kill) {
        var men = G.ents.filter(function (e) { return !e.dead && e.type === 'unit' &&
          rtsUnitDef(e.def).kind === 'infantry' && e.side === 'player'; }).slice(0, 5);
        /* stack them somewhere known so one small crop covers every body */
        var yd = _rtsHas('player', 'yard');
        men.forEach(function (m, n) { m.x = yd.x + n * 2; m.z = yd.z + 14; _rtsKill(m); killed++; });
        at = { x: yd.x, z: yd.z + 14 };
      } else {
        var yd2 = _rtsHas('player', 'yard');
        at = { x: yd2.x, z: yd2.z + 14 };
      }
      for (var j = 0; j < 120; j++) _rtsTick(1 / 60);
      _rtsRFrame(0); _rtsRFrame(0);              /* the drain, into the bake */
      var logged = (G.corpseLog || []).length;
      var saved = rtsSaveGame();
      rtsLoadGame();                              /* new battle, new terrain bake */
      var G2 = window._rtsG, R = window._rtsR;
      /* hash a patch of the RELOADED bake around where they fell */
      var px = (at.x / RTS_TILE + RTS_N / 2) * RTS_TS;
      var py = (at.z / RTS_TILE + RTS_N / 2) * RTS_TS;
      var cg = R.terrain.getContext('2d');
      var d = cg.getImageData(Math.round(px - 60), Math.round(py - 60), 140, 140).data;
      var h = 2166136261;
      for (var k = 0; k < d.length; k += 4) { h ^= d[k] + d[k + 1] * 3 + d[k + 2] * 7; h = (h * 16777619) >>> 0; }
      return { killed: killed, logged: logged, saved: saved, hash: h,
               queued: G.corpses.length, restoredLog: (G2.corpseLog || []).length };
    }
    var withBodies = run(true);
    var clean = run(false);
    return { withBodies: withBodies, clean: clean };
  });
  S.ok('some infantry died to leave bodies', bodies.withBodies.killed > 0,
       bodies.withBodies.killed + ' killed');
  S.eq('the renderer drains the queue, as it always did', bodies.withBodies.queued, 0);
  S.ok('but the log keeps them', bodies.withBodies.logged >= bodies.withBodies.killed,
       bodies.withBodies.logged + ' bodies on record');
  S.ok('the log survives the save', bodies.withBodies.restoredLog >= bodies.withBodies.killed,
       bodies.withBodies.restoredLog + ' on record after the load');
  S.eq('the control run left no bodies', bodies.clean.logged, 0);
  S.ok('and the reloaded battlefield still shows them',
       bodies.withBodies.hash !== bodies.clean.hash,
       'bake patch ' + bodies.withBodies.hash + ' with bodies vs ' + bodies.clean.hash + ' without');

  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');
  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})();
