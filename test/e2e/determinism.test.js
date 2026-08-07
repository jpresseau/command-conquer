/* Does the same battle play out the same way twice, and does resuming a save give you back the
   battle you saved?

   Every measurement in this repo rests on the first question. The difficulty ladder quotes mean
   survival to the second, e2e/pathing counts units that arrived, e2e/crates compares layouts -
   all of it assumes a seed determines a match. rts.core.js says so outright: gameplay randomness
   "runs off the SCENARIO SEED, never off bare Math.random ... it is what makes a balance claim
   checkable". Nothing was checking the claim itself.

   The second question is the player's. A save that restores a battle ALMOST exactly is not a
   save, it is a similar battle - and the difference compounds, because a unit a hundredth of a
   tile off takes a different step, which changes what it bumps into.

   Both are asserted on a hash of the whole live state - clock, treasuries, power, every entity's
   position and health, the crates, the score - rather than on a summary that could agree while
   the games differ. And a different seed is hashed too: if that ever matched, the comparison
   above has stopped comparing anything, which is the way a test like this dies quietly. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('determinism');

/* Installed in the page. Every run closes any battle already on screen first: rtsOpen returns
   immediately when one is up, so without the close a second run is a no-op that hands back the
   first run's state and every comparison passes for free. */
function harness() {
  window._DT = {
    hash: function (G) {
      var h = 0;
      function mix(v) { h = (h * 33 + (v | 0)) | 0; }
      mix(Math.round(G.t * 1000));
      ['player', 'enemy'].forEach(function (s) {
        var S2 = G.sides[s];
        mix(Math.round(rtsMoney(S2))); mix(Math.round(S2.powerMade)); mix(Math.round(S2.powerUsed));
      });
      var live = G.ents.filter(function (e) { return !e.dead; });
      mix(live.length);
      live.slice().sort(function (a, b) { return a.id - b.id; }).forEach(function (e) {
        mix(e.id); mix(Math.round(e.x * 100)); mix(Math.round(e.z * 100)); mix(Math.round(e.hp));
      });
      (G.crates || []).forEach(function (c) { mix(c.tx); mix(c.tz); mix(Math.round(c.t * 100)); });
      mix(G.stats.killed); mix(G.stats.lostU);
      return h;
    },
    freeze: function () {
      var U = window._rtsUI;
      if (U) { U.dead = true; try { if (U.raf) cancelAnimationFrame(U.raf); } catch (e) {} }
    },
    open: function (seed) {
      if (document.getElementById('rcgRts')) rtsClose();
      rtsOpen(seed);
      window._DT.freeze();
      return window._rtsG;
    },
    run: function (seed, secs) {
      var G = window._DT.open(seed);
      for (var i = 0; i < 60 * secs; i++) { _rtsTick(1 / 60); if (G.over) break; }
      return { hash: window._DT.hash(G), t: Math.round(G.t), seed: G.seed,
               alive: G.ents.filter(function (e) { return !e.dead; }).length,
               over: G.over || null };
    },
    positions: function (G) {
      var m = {};
      G.ents.forEach(function (e) { m[e.id] = { x: e.x, z: e.z, def: e.def }; });
      return m;
    }
  };
  return true;
}

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 1100, height: 800 });
  var up = await g.page.evaluate(function (src) { return eval('(' + src + ')()'); }, harness.toString());
  S.ok('the harness is installed', up === true, String(up));

  /* ------------------------------------------------------- the same seed twice ----
     Interleaved with another seed, so a run that merely inherited the previous one's state -
     or a generator that was never reseeded - cannot pass. */
  var same = await g.page.evaluate(function () {
    var a = window._DT.run(7, 90);
    var other = window._DT.run(9, 90);
    var b = window._DT.run(7, 90);
    return { a: a, b: b, other: other };
  });
  S.eq('opening a seed really starts that seed', same.a.seed, 7);
  S.ok('...and plays a real match', same.a.t >= 60 && same.a.alive > 5,
       same.a.t + 's, ' + same.a.alive + ' alive');
  S.eq('the same seed played twice gives the identical state', same.b.hash, same.a.hash);
  S.ok('...and a different seed does not, so that comparison means something',
       same.other.hash !== same.a.hash,
       'seed 7 ' + same.a.hash + ' vs seed 9 ' + same.other.hash);

  /* ------------------------------------------------- a save restores exactly ----
     Position by position, by entity id. This is the half that was broken: the bytes were
     right and _rtsApplyState was right, and then opening the battle ran one frame before the
     player saw anything. Almost every part of a tick is scaled by dt and a zero-length step
     does nothing to it - but the unit separation pass shoves overlapping units apart by a
     fixed distance whatever the clock says, so eleven of thirty-four units arrived displaced. */
  var restore = await g.page.evaluate(function () {
    var G = window._DT.open(7);
    for (var i = 0; i < 60 * 60; i++) _rtsTick(1 / 60);
    var before = window._DT.positions(G), tBefore = G.t;
    if (!rtsSaveGame()) return { error: 'the save was refused' };
    if (!rtsLoadGame()) return { error: 'the load was refused' };
    window._DT.freeze();
    var G2 = window._rtsG, after = window._DT.positions(G2);
    var moved = [], missing = [];
    Object.keys(before).forEach(function (id) {
      if (!after[id]) { missing.push(id + ' (' + before[id].def + ')'); return; }
      var d = Math.hypot(before[id].x - after[id].x, before[id].z - after[id].z);
      if (d > 1e-9) moved.push(before[id].def + ' #' + id + ' by ' + d.toFixed(4));
    });
    return { n: Object.keys(before).length, moved: moved, missing: missing,
             tBefore: +tBefore.toFixed(4), tAfter: +G2.t.toFixed(4) };
  });
  S.ok('a battle can be saved and loaded back', !restore.error, restore.error || '');
  if (!restore.error) {
    S.ok('every entity comes back', !restore.missing.length,
         restore.missing.slice(0, 5).join(', ') || restore.n + ' entities');
    S.ok('...at exactly the position it was saved at', !restore.moved.length,
         restore.moved.slice(0, 6).join('; ') || 'all ' + restore.n + ' unmoved');
    S.eq('...and the clock does not jump', restore.tAfter, restore.tBefore);
  }

  /* ------------------------------------------- and the future is the same future ----
     The assertion that actually matters to a player. Saving cannot be a fork in the road: the
     battle resumed from a save has to be the battle that would have happened. Position
     fidelity alone would not catch a generator whose position was lost, so this plays both
     out and compares the whole state ninety seconds later. */
  var resume = await g.page.evaluate(function () {
    var G = window._DT.open(7);
    for (var i = 0; i < 60 * 60; i++) _rtsTick(1 / 60);
    if (!rtsSaveGame()) return { error: 'the save was refused' };
    for (var j = 0; j < 60 * 90; j++) { _rtsTick(1 / 60); if (G.over) break; }
    var straight = window._DT.hash(G), tS = Math.round(G.t);

    if (!rtsLoadGame()) return { error: 'the load was refused' };
    window._DT.freeze();
    var G2 = window._rtsG;
    for (var k = 0; k < 60 * 90; k++) { _rtsTick(1 / 60); if (G2.over) break; }
    return { straight: straight, viaSave: window._DT.hash(G2),
             tStraight: tS, tVia: Math.round(G2.t) };
  });
  S.ok('the save/resume comparison could be run', !resume.error, resume.error || '');
  if (!resume.error) {
    S.eq('both paths reach the same point on the clock', resume.tVia, resume.tStraight);
    S.eq('a battle resumed from a save plays out identically to one played straight through',
         resume.viaSave, resume.straight);
  }

  S.ok('the page logged no errors', !g.errors.length, g.errors.slice(0, 3).join(' | ') || 'clean');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})();
