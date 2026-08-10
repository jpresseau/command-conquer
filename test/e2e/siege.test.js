/* WHAT A SIEGE PIECE IS WORTH, AND FROM HOW FAR.

   The land twin of e2e/navy, and it exists because the Artillery and the V2 were measurably not
   worth their price. On open ground at 3,000 credits a side, before any of this:

     5 Artillery    vs 3 Battle Tanks -> the artillery WIPED, 0 of 5, tanks keep 57%
     3 V2 Launchers vs 1 Heavy Tank   -> the launchers WIPED, 0 of 3, the tank keeps 50%

   Two thousand seven hundred credits of rocket artillery losing to one seventeen-hundred credit
   tank. Both units reach 34 and both carry sight 16, and a unit on attack-move only looks for
   targets inside its sight - so they had to walk to 16 to fire at all, which is inside a Battle
   Tank's 18 and a Pillbox's 15. They never used the only thing they were bought for.

   WHAT IS PINNED HERE IS THE SHAPE, NOT THE NUMBERS, exactly as in the naval ladder. Siege will
   be retuned; a spec demanding 3.0 survivors would be edited every time it moved, which teaches
   everyone to edit it without reading it. Three things must stay true or the unit is broken in
   one direction or the other:

     - it must be worth adding to an army (combined arms beats pure armour at equal credits),
     - it must NOT beat armour by itself (or it stops being a siege piece and becomes a better
       tank, and the escort it is designed around becomes pointless),
     - and it must engage from beyond its own sight, which is the mechanism the other two rest on. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('siege');
var SEEDS = [9001, 9002, 9003];
var SECS = 90;

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 800, height: 600 });
  await g.start(7, 1, { freeze: true });

  var setup = await g.page.evaluate(function () {
    /* A clear lane across the middle of the map: no water, no ore, nothing blocking, so the
       only thing under measurement is the fight. Cut fresh for each duel. */
    window._rtsLandArena = function () {
      var G = window._rtsG;
      var z0 = (RTS_N >> 1) - 8, z1 = (RTS_N >> 1) + 8;
      for (var z = z0; z <= z1; z++)
        for (var x = 2; x < RTS_N - 2; x++) {
          var ix = _rtsIdx(x, z);
          G.terrain[ix] = RTS_T_GRASS; G.blocked[ix] = 0; G.scrap[ix] = 0; G.gems[ix] = 0;
        }
      G.scrapDirty = true;
      return (z0 + z1) >> 1;
    };
    /* Both sides are a list of [key, count]; they are spawned at opposite ends of the lane and
       attack-moved at each other, so closing is part of the matchup. */
    window._rtsSiegeDuel = function (aMix, bMix, secs, seed) {
      _rtsNewGame(seed, 'normal');
      var G = window._rtsG, lane = window._rtsLandArena(), i;
      function force(side, mix, tx) {
        var out = [], k = 0;
        mix.forEach(function (m) {
          for (var j = 0; j < m[1]; j++, k++) {
            var u = _rtsSpawnUnit(side, m[0], _rtsWX(tx + (k / 3 | 0) * 2),
                                  _rtsWX(lane + ((k % 3) - 1) * 2));
            if (u) out.push(u);
          }
        });
        return out;
      }
      var A = force('player', aMix, 16), B = force('enemy', bMix, RTS_N - 18);
      if (!A.length || !B.length) return { error: 'did not spawn' };
      for (i = 0; i < A.length; i++) _rtsOrderMove(A[i], _rtsWX(RTS_N - 18), _rtsWX(lane), true);
      for (i = 0; i < B.length; i++) _rtsOrderMove(B[i], _rtsWX(16), _rtsWX(lane), true);

      function alive(l) { var n = 0; for (var j = 0; j < l.length; j++) if (!l[j].dead) n++; return n; }
      function hp(l) { var t = 0, m = 0; for (var j = 0; j < l.length; j++) { t += l[j].dead ? 0 : l[j].hp; m += l[j].maxHp; } return m ? t / m : 0; }
      /* HOW FAR THE SIEGE ACTUALLY FIGHTS FROM - the mechanism itself, not a proxy for it.

         SAMPLED ONLY WHILE ENGAGED, which is the whole difficulty in measuring this. Averaging
         over the entire run mixes in the approach march and the mopping up afterwards, when the
         two forces are most of a map apart: the first version of this metric read 96 and 164 and
         made "fights from beyond its sight" pass by a mile while proving nothing at all. Anything
         inside a fifth over the gun's own reach counts as the fight; further out is travelling. */
      /* WHICH HULLS COUNT AS SIEGE IS DECIDED BY THE STAT BLOCK, NOT BY THE `standoff` FLAG,
         and that is deliberate: keying this off the flag under test means deleting the flag
         makes the measurement disappear rather than fail, and an assertion that silently stops
         running is worse than one that was never written. A gun that outreaches its own eyes is
         the property being measured, so that is what selects the sample. */
      function isSiege(key) {
        var ud = rtsUnitDef(key), uw = ud && RTS_WEAPONS[ud.weapon];
        return !!(uw && uw.range > ud.sight);
      }
      var reach = 0;
      for (i = 0; i < aMix.length; i++)
        if (isSiege(aMix[i][0])) reach = Math.max(reach, RTS_WEAPONS[rtsUnitDef(aMix[i][0]).weapon].range);
      var distSum = 0, distN = 0, t = 0;
      for (t = 0; t < secs * 60; t++) {
        _rtsTick(1 / 60);
        if ((t % 30) === 0) {
          for (i = 0; i < A.length; i++) {
            var u = A[i];
            if (u.dead || !isSiege(u.def)) continue;
            var best = 1e9;
            for (var j = 0; j < B.length; j++) {
              if (B[j].dead) continue;
              var dd = Math.hypot(B[j].x - u.x, B[j].z - u.z);
              if (dd < best) best = dd;
            }
            if (best <= reach * 1.2) { distSum += best; distN++; }
          }
        }
        if (!alive(A) || !alive(B)) break;
      }
      /* Credits, so a matchup can never quietly stop being a fair comparison. */
      function cost(mix) { var c = 0; mix.forEach(function (m) { c += rtsUnitDef(m[0]).cost * m[1]; }); return c; }
      return { a: alive(A), b: alive(B), an: A.length, bn: B.length,
               ahp: Math.round(hp(A) * 100), bhp: Math.round(hp(B) * 100),
               aCost: cost(aMix), bCost: cost(bMix),
               dist: distN ? distSum / distN : 0, secs: Math.round(t / 60) };
    };
    return { ok: true, sight: rtsUnitDef('arty').sight, reach: RTS_WEAPONS[rtsUnitDef('arty').weapon].range,
             keep: RTS_STANDOFF_KEEP };
  });
  S.ok('the duel harness is installed', setup.ok, 'ok');
  S.note('the Artillery sees ' + setup.sight + ' and shoots ' + setup.reach +
         '; a standoff hull tries to hold ' + Math.round(setup.reach * setup.keep) + ' of that');

  function tag(m) { return m.map(function (x) { return x[1] + '×' + x[0]; }).join('+'); }
  async function duel(aMix, bMix) {
    var rows = [], i;
    for (i = 0; i < SEEDS.length; i++) {
      var r = await g.page.evaluate(function (p) {
        return window._rtsSiegeDuel(p[0], p[1], p[2], p[3]);
      }, [aMix, bMix, SECS, SEEDS[i]]);
      if (r.error) { S.ok(tag(aMix) + ' vs ' + tag(bMix) + ' could be set up', false, r.error); return null; }
      rows.push(r);
    }
    function mean(f) { return rows.reduce(function (s, r) { return s + f(r); }, 0) / rows.length; }
    var o = { a: tag(aMix), b: tag(bMix),
              aLeft: mean(function (r) { return r.a; }), bLeft: mean(function (r) { return r.b; }),
              an: rows[0].an, bn: rows[0].bn,
              aHp: Math.round(mean(function (r) { return r.ahp; })),
              bHp: Math.round(mean(function (r) { return r.bhp; })),
              aCost: rows[0].aCost, bCost: rows[0].bCost,
              dist: mean(function (r) { return r.dist; }), secs: Math.round(mean(function (r) { return r.secs; })) };
    o.aShare = o.aLeft / o.an; o.bShare = o.bLeft / o.bn;
    S.note('  ' + o.a.padEnd(16) + '(' + o.aCost + 'cr) vs ' + o.b.padEnd(12) + '(' + o.bCost + 'cr)' +
           '  left ' + o.aLeft.toFixed(1) + '/' + o.an + ' (' + o.aHp + '% hp)  vs ' +
           o.bLeft.toFixed(1) + '/' + o.bn + ' (' + o.bHp + '% hp)' +
           (o.dist ? '   siege fought at ' + o.dist.toFixed(1) : '') + '   in ' + o.secs + 's');
    return o;
  }

  S.note('duels — ' + SEEDS.length + ' seeds each, ' + SECS + 's cap:');
  /* 3,200 + 2,400 against 5,600: the same money, spent two ways. */
  var mixedA = await duel([['tank', 4], ['arty', 4]], [['tank', 7]]);
  var mixedS = await duel([['tank', 4], ['v2rl', 4]], [['tank', 8]]);
  var artyAlone = await duel([['arty', 5]], [['tank', 3]]);
  var v2Alone   = await duel([['v2rl', 3]], [['heavy', 1]]);
  var artyInf   = await duel([['arty', 5]], [['rifle', 30]]);

  /* 1. THE MONEY QUESTION. An army that spends part of its budget on siege must beat the same
     budget spent entirely on armour, or there is no reason for the unit to exist and no reason
     for the opponent's Gunline and Barrage to be raised. */
  [mixedA, mixedS].forEach(function (d) {
    if (!d) return;
    S.ok('combined arms beats pure armour for the same money: ' + d.a + ' vs ' + d.b,
         d.aLeft > d.bLeft,
         d.aLeft.toFixed(1) + ' left of ' + d.an + ' (' + d.aCost + 'cr) against ' +
         d.bLeft.toFixed(1) + ' of ' + d.bn + ' (' + d.bCost + 'cr)');
    S.ok('...and the comparison is actually priced fairly: ' + d.a,
         Math.abs(d.aCost - d.bCost) <= d.bCost * 0.1,
         d.aCost + 'cr against ' + d.bCost + 'cr');
  });

  /* 2. AND THE OVERCORRECTION GUARD, which matters as much as the fix. A siege piece that beats
     armour on its own is not a siege piece any more - it is simply a better tank, the escort it
     is designed around stops mattering, and the whole shape of the unit is gone. It is SUPPOSED
     to lose this fight. */
  if (artyAlone) {
    S.ok('artillery on its own still loses to armour, as it must',
         artyAlone.aShare < artyAlone.bShare,
         'artillery kept ' + Math.round(artyAlone.aShare * 100) + '%, tanks ' +
         Math.round(artyAlone.bShare * 100) + '%');
  }
  if (v2Alone) {
    S.ok('...and so does the V2',
         v2Alone.aShare < v2Alone.bShare,
         'V2s kept ' + Math.round(v2Alone.aShare * 100) + '%, the Heavy Tank ' +
         Math.round(v2Alone.bShare * 100) + '%');
  }

  /* 3. BUT IT MUST STILL BEAT WHAT IT IS FOR. A howitzer is 1.1 against unarmoured and splashes
     5.0; massed infantry is the thing it should shred, and if it stopped doing that the standoff
     would have turned it into a unit that runs away from everything. */
  if (artyInf) {
    S.ok('artillery still shreds massed infantry',
         artyInf.aShare > artyInf.bShare,
         'artillery kept ' + Math.round(artyInf.aShare * 100) + '%, infantry ' +
         Math.round(artyInf.bShare * 100) + '%');
  }

  /* 4. AND THE MECHANISM ITSELF: it has to fight from beyond its own eyes. This is the assertion
     that would have caught the original fault directly - sight 16 against a gun that reaches 34,
     so every engagement happened at 16 or closer, inside everything that could answer it. The
     distance is measured only while the two sides are within reach of each other; see the note
     on the sampling for why the naive version of this metric was worthless. */
  [mixedA, artyAlone].forEach(function (d) {
    if (!d) return;
    /* Asserted rather than skipped when there is no sample: no engagement data means the
       measurement did not happen, which must read as a failure and not as a quiet pass. */
    S.ok('the engagement range was actually sampled: ' + d.a, d.dist > 0,
         d.dist ? d.dist.toFixed(1) : 'no samples inside reach — nothing was measured');
  });
  /* ESCORTED, IT HOLDS ITS KEEP DISTANCE, and this is the one that discriminates. Asked against
     RTS_STANDOFF_KEEP rather than against sight, because sight is too low a bar to prove
     anything: with the behaviour removed the escorted battery still averages a shade over 21,
     which clears 16 and means nothing. Holding 26 of a 34 reach does not happen by accident. */
  if (mixedA) {
    S.ok('escorted siege holds its keep distance',
         mixedA.dist >= setup.reach * setup.keep,
         'mean engagement range ' + mixedA.dist.toFixed(1) + ' against a keep of ' +
         (setup.reach * setup.keep).toFixed(1) + ' (reach ' + setup.reach + ', sight ' + setup.sight + ')');
  }
  /* Unescorted it gets run down - a tank is half again as fast - and that is correct. What must
     still be true is that it fires from further out than it can see, which is the acquisition
     half of the fix and the thing that was flatly broken. */
  if (artyAlone) {
    S.ok('unescorted, it is run down but still fights beyond its own sight',
         artyAlone.dist > setup.sight,
         'mean engagement range ' + artyAlone.dist.toFixed(1) + ' against sight ' + setup.sight);
  }

  /* 5. And the fights actually happened - two forces that never met measure nothing. */
  [mixedA, mixedS, artyAlone, v2Alone, artyInf].forEach(function (d) {
    if (!d) return;
    S.ok(d.a + ' vs ' + d.b + ': the forces actually engaged', d.aHp < 100 || d.bHp < 100,
         'hp left ' + d.aHp + '% vs ' + d.bHp + '% after ' + d.secs + 's');
  });

  S.ok('the page logged no errors', g.errors.length === 0,
       g.errors.length ? g.errors.slice(0, 2).join(' | ') : 'clean');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})();
