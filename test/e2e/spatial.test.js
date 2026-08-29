/* The spatial index, against a real battle — core/spatial.js.

   Target acquisition and the crush check used to walk the whole entity list, per unit, per
   tick. Measured with two armies in front of each other, that was the simulation:

     units    _rtsTick    _rtsFindTarget         _rtsOverrun
        43     0.82ms      0.51ms  (63%)         0.09ms (10%)
       166     7.76ms      5.84ms  (75%)         0.93ms (12%)
       320    27.16ms     21.29ms  (78%)         3.76ms (14%)

   Doubling the army very nearly quadrupled the cost — the signature of a full-list scan and of
   nothing else. At 320 units the SIMULATION ALONE took 27ms of a 16.7ms frame, before a pixel
   was drawn, on a desktop-class CPU with nothing else running.

   Two questions, and the first one is the only one that matters:

   1. IS IT THE SAME SCAN? The per-candidate test inside each caller is untouched, so the
      bucketed list can only make a caller see FEWER candidates. Fewer irrelevant ones is the
      whole point; one fewer relevant one is a unit that does not shoot back, and it would be
      invisible — no error, no crash, just an army that fights slightly worse. So this file
      keeps a copy of the pre-index scan and asks, every tick of a battle, whether the real one
      still returns the same object.

   2. WHAT DOES IT COST? Frame timings off this box are worthless (SwiftShader), but _rtsTick
      is plain JS on a real CPU, so its cost is one of the few numbers here that transfers.

   The unit-level half — the pad, the ordering, the staleness guard, the footprint filing — is
   test/unit/spatial.js and needs no browser. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('spatial');

/* Two lines IN CONTACT on open ground rather than marching towards each other. Set them 40
   apart and the whole run is spent walking: the first version of this spec got a non-null
   target back from 4 of 118,040 calls, which is a comparison of null against null and proves
   nothing at all. */
var ARMY = function (side, z0, dir, per, gap) {
  var C = RTS_N * RTS_TILE / 2;
  gap = gap || 3;
  for (var k = 0; k < per; k++) {
    var e = _rtsSpawnUnit(side, ['rifle', 'tank', 'rocket', 'buggy'][k % 4],
                          C - 8 * gap + (k % 16) * gap, z0 + dir * ((k / 16) | 0) * gap);
    if (e) _rtsOrderMove(e, C, z0 - dir * 24, true);
  }
}.toString();

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 1100, height: 800 });
  /* Frozen: every number below is per-tick, so the match must not also be advancing on its own
     between evaluate calls. See start()/freeze() in lib/game.js. */
  await g.start(7, 20, { freeze: true, mode3d: true });

  /* ---------- 1. the same scan ---------- */
  var same = await g.page.evaluate(function (armySrc) {
    var G = window._rtsG, C = RTS_N * RTS_TILE / 2;
    var army = eval('(' + armySrc + ')');
    army('player', C - 6, -1, 60);
    army('enemy', C + 6, +1, 60);

    /* The pre-index scan, verbatim: the whole entity list, no buckets. */
    function brute(e, range, w) {
      var foe = _rtsEnemyOf(e.side), best = null, bv = 0;
      for (var i = 0; i < G.ents.length; i++) {
        var o = G.ents[i];
        if (o.dead || o.side !== foe || o.inside) continue;
        if (o.hidden) continue;
        if (o.air && !(w && w.aa)) continue;
        if (!o.air && w && w.aaOnly) continue;
        if (w && w.maul && !(o.type === 'unit' && (rtsUnitDef(o.def) || {}).kind === 'infantry')) continue;
        if (!_rtsWeaponReaches(w, o)) continue;
        var dist = _rtsRangeTo(e, o);
        if (dist > _rtsElevReach(e, o, range)) continue;
        var v = _rtsEvalObject(e, o, dist, w);
        if (v > bv) { bv = v; best = o; }
      }
      return best;
    }
    /* ...and the same for the crush check, which is the other full-list scan that went. */
    function bruteCrush(e) {
      var out = [];
      for (var i = 0; i < G.ents.length; i++) {
        var o = G.ents[i];
        if (o.dead || o.type !== 'unit' || o.side === e.side || o.inside) continue;
        if (rtsUnitDef(o.def).kind !== 'infantry') continue;
        if (Math.hypot(o.x - e.x, o.z - e.z) > RTS_CRUSH_DIST) continue;
        out.push(o);
      }
      return out;
    }

    var checks = 0, bad = 0, hits = 0, narrowed = 0, sample = null;
    var crushChecks = 0, crushBad = 0, crushHits = 0;
    var realFind = window._rtsFindTarget, realOver = window._rtsOverrun;

    window._rtsFindTarget = function (e, range, w) {
      var got = realFind(e, range, w), want = brute(e, range, w);
      checks++;
      if (want) hits++;
      var lst = _rtsSpNear(e.x, e.z, range, RTS_SP_ELEV);
      if (lst && lst !== G.ents && lst.length < G.ents.length) narrowed++;
      if (got !== want && !bad++) {
        sample = { at: Math.round(G.t), by: e.side + ' ' + e.def,
                   got: got ? got.def + '#' + got.id : null,
                   want: want ? want.def + '#' + want.id : null };
      }
      return got;
    };
    /* _rtsOverrun returns nothing, so it is checked by its candidate list instead: every man
       the full scan would have found under the tracks has to be in the bucketed one, in the
       same order — _rtsScatter draws on the shared random stream, so a different order is a
       different simulation, not just a different casualty. */
    window._rtsOverrun = function (e) {
      var want = bruteCrush(e);
      var lst = _rtsSpNear(e.x, e.z, RTS_CRUSH_DIST) || G.ents;
      var got = [];
      for (var i = 0; i < lst.length; i++) {
        var o = lst[i];
        if (o.dead || o.type !== 'unit' || o.side === e.side || o.inside) continue;
        if (rtsUnitDef(o.def).kind !== 'infantry') continue;
        if (Math.hypot(o.x - e.x, o.z - e.z) > RTS_CRUSH_DIST) continue;
        got.push(o);
      }
      crushChecks++;
      if (want.length) crushHits++;
      if (got.length !== want.length) crushBad++;
      else for (i = 0; i < want.length; i++) if (got[i] !== want[i]) { crushBad++; break; }
      return realOver(e);
    };

    for (var t = 0; t < 900 && !G.over; t++) _rtsTick(1 / 60);
    window._rtsFindTarget = realFind;
    window._rtsOverrun = realOver;

    var alive = 0;
    for (var j = 0; j < G.ents.length; j++)
      if (!G.ents[j].dead && G.ents[j].type === 'unit') alive++;
    return { checks: checks, bad: bad, hits: hits, narrowed: narrowed, sample: sample,
             crushChecks: crushChecks, crushBad: crushBad, crushHits: crushHits,
             alive: alive, spawned: 120, over: G.over || null };
  }, ARMY);

  S.eq('the bucketed target scan never picked a different target from the full one', same.bad, 0);
  S.ok('...over a battle that really was fighting', same.hits > 500 && same.alive < same.spawned,
       same.checks + ' scans, ' + same.hits + ' of them found a target, and ' +
       (same.spawned - same.alive) + ' of ' + same.spawned + ' spawned units died');
  /* NOT an assertion, because on a battle this size the honest answer is "often not, and
     deliberately". 130 entities crowded together occupy few enough buckets that a gun-range
     query box covers more cells than the index has, and _rtsSpNear hands back the entity list
     rather than doing 80 Map lookups to rebuild it - which is both correct and faster. The
     first draft asserted 60% here and got 34%, and the only reason it ever passed was that it
     was being run with --no-build against a page compiled before RTS_SP_MOVE went from 5 to 8.
     A wider pad means wider query boxes means the shortcut fires more often. Where the index
     has to earn its keep is a big battle, and that is measured below. */
  S.note(same.narrowed + ' of ' + same.checks + ' scans got a shortened list; the rest hit the ' +
         'map-wide shortcut, which a battle of ' + (same.alive + 10) + '-odd entities should');
  if (same.sample) S.note('first disagreement: ' + JSON.stringify(same.sample));

  S.eq('the bucketed crush check found the same men, in the same order', same.crushBad, 0);
  S.ok('...with men actually under the tracks to find', same.crushHits > 0,
       same.crushChecks + ' crush scans, ' + same.crushHits + ' with someone in reach');

  /* THE ORDER, WITH SOMETHING TO ORDER. A battle throws up plenty of crush scans and almost no
     crowds - 21,400 of them above and 15 with anyone in reach at all, nearly always one man.
     One candidate cannot be in the wrong order, so the assertion above only really pins the
     membership. A crusher is therefore ringed deliberately, and the ring is built out of ORDER
     so the entity-list sequence and the geometric one disagree: file the ring clockwise and a
     bucketed scan that forgot to sort would still look right. */
  var ring = await g.page.evaluate(function () {
    var G = window._rtsG, C = RTS_N * RTS_TILE / 2, men = [], k;
    var crusher = null;
    for (k = 0; k < G.ents.length; k++) {
      var c = G.ents[k];
      if (!c.dead && c.type === 'unit' && RTS_CRUSHERS[c.def]) { crusher = c; break; }
    }
    if (!crusher) return { skipped: true };
    /* deliberately not in angular order */
    var at = [[2.2, 0], [-1.1, 1.9], [0.7, -2.1], [-2.3, -0.4], [1.4, 1.6], [-0.6, -1.8],
              [1.9, -1.2], [-1.7, 1.1]];
    for (k = 0; k < at.length; k++) {
      var m = _rtsSpawnUnit(_rtsEnemyOf(crusher.side), 'rifle',
                            crusher.x + at[k][0], crusher.z + at[k][1]);
      if (m) men.push(m);
    }
    _rtsSpBuild();
    function collect(list) {
      var out = [];
      for (var i = 0; i < list.length; i++) {
        var o = list[i];
        if (o.dead || o.type !== 'unit' || o.side === crusher.side || o.inside) continue;
        if (rtsUnitDef(o.def).kind !== 'infantry') continue;
        if (Math.hypot(o.x - crusher.x, o.z - crusher.z) > RTS_CRUSH_DIST) continue;
        out.push(o.id);
      }
      return out;
    }
    var lst = _rtsSpNear(crusher.x, crusher.z, RTS_CRUSH_DIST);
    return { skipped: false, placed: men.length, narrowed: !!lst && lst !== G.ents,
             got: collect(lst || G.ents), want: collect(G.ents) };
  });

  if (ring.skipped) S.note('no crusher alive to ring — the ordering check did not run');
  else {
    S.ok('a crusher ringed by eight men meets them in entity-list order',
         ring.got.join(',') === ring.want.join(',') && ring.got.length >= 6,
         'bucketed ' + JSON.stringify(ring.got) + ' vs full ' + JSON.stringify(ring.want));
    S.ok('...and the bucketed list really was shorter than the whole map', ring.narrowed,
         ring.narrowed ? 'yes' : 'it fell back to the entity list, so this proved nothing');
  }

  await g.close();

  /* ---------- 2. what it costs ---------- */
  var g2 = await openPage(browser, { width: 1100, height: 800 });
  await g2.start(7, 20, { freeze: true, mode3d: true });

  async function cost(gap) {
    return g2.page.evaluate(function (a) {
      var armySrc = a[0], gap = a[1];
      var G = window._rtsG, C = RTS_N * RTS_TILE / 2;
      var army = eval('(' + armySrc + ')');
      /* Wipe whatever the previous measurement left, so the two spacings are measured on the
         same board rather than one on top of the other. */
      for (var j = G.ents.length - 1; j >= 0; j--)
        if (G.ents[j].type === 'unit') { delete G.byId[G.ents[j].id]; G.ents.splice(j, 1); }
      G.fx.length = 0;
      if (G.proj) G.proj.length = 0;
      /* 320 units is a big battle, not an absurd one - and it is the size at which the
         full-list scans took 27ms a tick. */
      army('player', C - 6, -1, 160, gap);
      army('enemy', C + 6, +1, 160, gap);
      for (var t = 0; t < 120; t++) _rtsTick(1 / 60);

      var units = 0;
      for (j = 0; j < G.ents.length; j++)
        if (!G.ents[j].dead && G.ents[j].type === 'unit') units++;

      /* How much of the entity list a gun-range scan actually looks at, at this size. This is
         the number the whole file exists to move, and it only means anything on a battle big
         enough that _rtsSpNear does not fall back on its map-wide shortcut. */
      var seen = 0, scans = 0;
      for (j = 0; j < G.ents.length; j++) {
        var e = G.ents[j];
        if (e.dead || e.type !== 'unit') continue;
        var lst = _rtsSpNear(e.x, e.z, 22, RTS_SP_ELEV);
        if (lst) { seen += lst.length; scans++; }
      }

      /* MEASURED AGAINST ITSELF, not against a number written down here.

         An absolute millisecond bar would be a claim about whatever machine happens to be
         running the suite, and the first draft of this spec proved it: 8.3ms was picked from a
         probe of two armies STANDING there, and a battle that was actually shooting came in at
         13.25 and failed a change that had made everything faster.

         So both paths are timed here, seconds apart, on the same battle. Making _rtsSpNear
         return null sends every caller down its fallback - the full entity list, which is the
         code exactly as it was before core/spatial.js existed. It has to be stubbed at the
         QUERY and not by nulling the index itself: _rtsTick rebuilds the index at the top of
         every tick, so the first draft cleared it 60 times and measured the indexed path
         twice, 1.01x apart. The batches alternate because the battle is still advancing and
         the entity count is still falling; taken in two blocks, whichever went second would be
         timed on a smaller army.

         performance.now() is coarsened to 0.1ms, so each number is a timed BATCH divided by
         its length rather than a per-tick sample. */
      var idx = 0, full = 0, N = 30, k, r, t0;
      var realNear = window._rtsSpNear, noIndex = function () { return null; };
      for (r = 0; r < 4; r++) {
        window._rtsSpNear = noIndex;
        t0 = performance.now();
        for (k = 0; k < N; k++) _rtsTick(1 / 60);
        full += performance.now() - t0;

        window._rtsSpNear = realNear;
        t0 = performance.now();
        for (k = 0; k < N; k++) _rtsTick(1 / 60);
        idx += performance.now() - t0;
      }
      window._rtsSpNear = realNear;
      var after = 0;
      for (j = 0; j < G.ents.length; j++)
        if (!G.ents[j].dead && G.ents[j].type === 'unit') after++;
      return { idx: idx / (4 * N), full: full / (4 * N), units: units, after: after,
               saw: scans ? seen / scans : 0, of: G.ents.length };
    }, [ARMY, gap]);
  }

  function say(c) {
    return c.units + ' units: ' + c.idx.toFixed(2) + 'ms per tick with the index, ' +
           c.full.toFixed(2) + 'ms falling back to the full entity list — ' +
           (c.full / c.idx).toFixed(2) + 'x';
  }

  /* PACKED A TILE APART is the worst case a grid can be given: every candidate a scan collects
     really is inside its reach, so no bucketing can make the list shorter - it can only stop
     the scan walking past the other 300 units on the map to find them. */
  var packed = await cost(4);
  S.ok('an army packed a tile apart still simulates a third cheaper',
       packed.full / packed.idx >= 1.35, say(packed));

  /* AND AT THE SPACING A FORMATION ON THE MOVE ACTUALLY HOLDS, which is where the grid has
     something to separate. */
  var spread = await cost(12);
  S.ok('...and a formation at marching spacing, twice cheaper',
       spread.full / spread.idx >= 2, say(spread));

  S.ok('both were measured on battles that stayed big', packed.after >= 200 && spread.after >= 200,
       packed.after + ' and ' + spread.after + ' units alive at the end of each measurement');
  S.ok('at marching spacing a gun-range scan reads a small slice of the battle',
       spread.saw < spread.of * 0.15,
       'saw ' + spread.saw.toFixed(0) + ' of ' + spread.of + ' entities on average (' +
       (100 * spread.saw / spread.of).toFixed(0) + '%); packed a tile apart it is ' +
       packed.saw.toFixed(0) + ' of ' + packed.of + ' (' +
       (100 * packed.saw / packed.of).toFixed(0) + '%), which no grid can improve on — ' +
       'they really are all inside each other\'s reach');
  S.note('for scale, one frame at 60fps is 16.7ms — for the simulation AND the renderer');

  await g2.close();
  await browser.close();
  require('../lib/report.js')(S);
})();
