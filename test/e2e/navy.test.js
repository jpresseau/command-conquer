/* THE NAVAL LADDER: what a fleet is worth against another fleet.

   e2e/ladder is the balance metric of record and it CANNOT SEE THE SEA. It measures how long an
   idle player survives, and an idle player owns no ships, builds no shipyard and never contests
   the water - so every naval change this repo has shipped went out with the ladder reading
   exactly the same number before and after. Submarine stealth, the Destroyer's sonar and the
   landing craft all went in that way. That is not evidence they are balanced; it is evidence
   that nothing was looking.

   This is the instrument that looks. It is deliberately NOT another whole-match measurement -
   a second 600-second ladder would take the same minutes to tell us the same thing about the
   AI. A duel isolates the hulls the way the ladder isolates the opponent: two fleets, open
   water, nothing else on the map that can reach them, and the only question is which one is
   left. What it measures is the ROSTER, which is where the naval decisions actually live.

   FLEETS ARE MATCHED BY PRICE, not by hull count, because that is the choice a player makes.
   Six Gunboats and three Destroyers are both 3,000 credits, and "which of those should I buy"
   is exactly the question the numbers should answer. Comparing three of each would only tell
   us that the dearer hull is better, which we knew when we priced it.

   AS WITH THE LADDER, THE SHAPE IS ASSERTED AND THE NUMBERS ARE PRINTED. Naval balance will be
   retuned on purpose; a spec demanding 2.4 survivors would be edited every time, which teaches
   everyone to edit it without reading it. What is pinned is what must never stop being true:
   a submarine must beat a fleet that cannot see it, a Destroyer must be a real answer to a
   submarine, and no matchup priced evenly may be a walkover. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('navy');
var SEEDS = [9001, 9002, 9003];
var SECS = 90;            /* long enough to decide a duel; a stalemate at 90s IS the answer */
var PURSE = 3000;         /* credits per side - see the header */

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 800, height: 600 });
  await g.start(7, 1, { freeze: true });

  /* Every duel runs in the same arena: a broad band of open sea across the middle of the map,
     far from either base. Cut once per match rather than per duel, and the fleets are spawned
     at opposite ends of it so they have to close before anything can fire. */
  var setup = await g.page.evaluate(function () {
    window._rtsNavyArena = function () {
      var G = window._rtsG;
      var z0 = (RTS_N >> 1) - 9, z1 = (RTS_N >> 1) + 9;
      for (var z = z0; z <= z1; z++) {
        for (var x = 2; x < RTS_N - 2; x++) {
          var ix = _rtsIdx(x, z);
          G.terrain[ix] = RTS_T_WATER; G.blocked[ix] = 2; G.scrap[ix] = 0; G.gems[ix] = 0;
        }
      }
      G.scrapDirty = true;
      return { z0: z0, z1: z1, lane: (z0 + z1) >> 1 };
    };
    /* One duel. Both fleets are spawned in the lane, ordered at each other, and ticked until
       one side is gone or the clock runs out. Only the hulls spawned here are counted - the
       opponent may still be building its own navy elsewhere and none of it is the subject. */
    window._rtsNavyDuel = function (aKey, aN, bKey, bN, secs, seed) {
      var G = window._rtsG;
      _rtsNewGame(seed, 'normal');
      G = window._rtsG;
      var arena = window._rtsNavyArena();
      var lane = arena.lane, A = [], B = [], i;
      function fleet(side, key, n, tx) {
        var out = [];
        for (var k = 0; k < n; k++) {
          /* Spread along the lane so a fleet does not spawn in one stack and shell itself
             into a single splash. */
          var z = lane + ((k % 3) - 1) * 3;
          var u = _rtsSpawnUnit(side, key, _rtsWX(tx + (k / 3 | 0) * 2), _rtsWX(z));
          if (u) out.push(u);
        }
        return out;
      }
      A = fleet('player', aKey, aN, 14);
      B = fleet('enemy', bKey, bN, RTS_N - 16);
      if (!A.length || !B.length) return { error: 'fleet did not spawn' };
      /* Attack-move at each other: closing is part of the matchup, and a hull that outranges
         its opponent should get to use that. */
      for (i = 0; i < A.length; i++) _rtsOrderMove(A[i], _rtsWX(RTS_N - 16), _rtsWX(lane), true);
      for (i = 0; i < B.length; i++) _rtsOrderMove(B[i], _rtsWX(14), _rtsWX(lane), true);

      function alive(list) { var n = 0; for (var j = 0; j < list.length; j++) if (!list[j].dead) n++; return n; }
      function hp(list) {
        var t = 0, m = 0;
        for (var j = 0; j < list.length; j++) { t += list[j].dead ? 0 : list[j].hp; m += list[j].maxHp; }
        return m ? t / m : 0;
      }
      var t = 0;
      for (t = 0; t < secs * 60; t++) {
        _rtsTick(1 / 60);
        if (!alive(A) || !alive(B)) break;
      }
      return { a: alive(A), b: alive(B), an: A.length, bn: B.length,
               ahp: Math.round(hp(A) * 100), bhp: Math.round(hp(B) * 100),
               secs: Math.round(t / 60) };
    };
    return { ok: true, subDetect: RTS_SUB_DETECT, destroyerSonar: rtsUnitDef('destroyer').detects };
  });
  S.ok('the duel harness is installed', setup.ok, 'ok');
  S.note('sonar: every hull sees a submerged boat at ' + setup.subDetect +
         '; a Destroyer sees one at ' + setup.destroyerSonar);

  /* Priced evenly at PURSE credits a side. `n` is what that buys, rounded down. */
  var COSTS = await g.page.evaluate(function (keys) {
    var o = {};
    keys.forEach(function (k) { o[k] = rtsUnitDef(k).cost; });
    return o;
  }, ['gunboat', 'destroyer', 'sub', 'missilesub', 'cruiser']);
  function buys(key) { return Math.max(1, Math.floor(PURSE / COSTS[key])); }
  S.note('for ' + PURSE + ' credits: ' + Object.keys(COSTS).map(function (k) {
    return buys(k) + '×' + k + ' (' + COSTS[k] + ' each)';
  }).join(', '));

  /* Each matchup is the same fight from both sides of the map, three seeds, averaged. */
  async function duel(aKey, bKey) {
    var aN = buys(aKey), bN = buys(bKey), rows = [], i;
    for (i = 0; i < SEEDS.length; i++) {
      var r = await g.page.evaluate(function (p) {
        return window._rtsNavyDuel(p[0], p[1], p[2], p[3], p[4], p[5]);
      }, [aKey, aN, bKey, bN, SECS, SEEDS[i]]);
      if (r.error) { S.ok(aKey + ' vs ' + bKey + ' could be set up', false, r.error); return null; }
      rows.push(r);
    }
    function mean(f) { return rows.reduce(function (s, r) { return s + f(r); }, 0) / rows.length; }
    var out = { a: aKey, b: bKey, aN: aN, bN: bN,
                aLeft: mean(function (r) { return r.a; }), bLeft: mean(function (r) { return r.b; }),
                aHp: Math.round(mean(function (r) { return r.ahp; })),
                bHp: Math.round(mean(function (r) { return r.bhp; })),
                secs: Math.round(mean(function (r) { return r.secs; })) };
    /* Share of the fleet each side kept, which is the comparable number when the counts differ. */
    out.aShare = out.aLeft / aN;
    out.bShare = out.bLeft / bN;
    S.note(('  ' + aN + '×' + aKey).padEnd(18) + 'vs ' + (bN + '×' + bKey).padEnd(16) +
           ' left ' + out.aLeft.toFixed(1) + '/' + aN + ' (' + out.aHp + '% hp)' +
           '  vs ' + out.bLeft.toFixed(1) + '/' + bN + ' (' + out.bHp + '% hp)' +
           '   decided in ' + out.secs + 's');
    return out;
  }

  S.note('duels — ' + SEEDS.length + ' seeds each, ' + SECS + 's cap:');
  var subVsGun  = await duel('sub', 'gunboat');
  var subVsDest = await duel('sub', 'destroyer');
  var msubVsDest = await duel('missilesub', 'destroyer');
  var gunVsDest = await duel('gunboat', 'destroyer');
  /* The Cruiser's two matchups are its whole design: it must out-shoot the hull it was added to
     answer, and it must lose to the hull that is supposed to hunt it. */
  var cruVsMsub = await duel('cruiser', 'missilesub');
  var cruVsSub  = await duel('cruiser', 'sub');

  /* 1. STEALTH HAS TO BE WORTH SOMETHING. A fleet with no sonar cannot see a submarine coming
     and should lose badly to one - this is the whole reason `cloak` exists, and it is the
     assertion that would have caught the stealth work shipping broken. */
  if (subVsGun) {
    S.ok('submarines beat a fleet that cannot see them',
         subVsGun.aShare > subVsGun.bShare,
         'subs kept ' + Math.round(subVsGun.aShare * 100) + '% of the fleet, gunboats ' +
         Math.round(subVsGun.bShare * 100) + '%');
    S.ok('...and it is not close, because the gunboats never get to shoot first',
         subVsGun.aShare - subVsGun.bShare > 0.2,
         'gap ' + Math.round((subVsGun.aShare - subVsGun.bShare) * 100) + ' points');
  }

  /* 2. AND THE DESTROYER HAS TO BE THE ANSWER. Its sonar is the only reason to buy one over two
     Gunboats and its own description promises exactly that, so a submarine must do measurably
     worse against it than against the blind fleet. */
  if (subVsGun && subVsDest) {
    S.ok('a Destroyer is a real answer to a submarine',
         subVsDest.aShare < subVsGun.aShare,
         'subs keep ' + Math.round(subVsDest.aShare * 100) + '% against sonar, ' +
         Math.round(subVsGun.aShare * 100) + '% against none');
    /* AND IT MUST COST THE DESTROYER SOMETHING - but only something. The first version of this
       asked for a long fight, on the assumption that a counter which wipes its target must be
       a bug. It is not: the Destroyer is the designed submarine-killer, in the original and
       here, and a cloaked hull that also beat its own counter would leave the Allies no answer
       at all. What the fleet may not be is untouched, because a counter nobody can trade
       against is a hull nobody would buy. */
    S.ok('...and the submarines make it cost something',
         subVsDest.bShare < 1 || subVsDest.bHp < 90,
         'destroyers kept ' + Math.round(subVsDest.bShare * 100) + '% of the fleet at ' +
         subVsDest.bHp + '% hp, subs ' + Math.round(subVsDest.aShare * 100) + '%');
    S.note('  the Destroyer is the designed counter and this is what that costs: the submarines' +
           ' take it to ' + subVsDest.bHp + '% hp in ' + subVsDest.secs + 's before going down');
  }

  /* 3. NOTHING PRICED EVENLY IS A WALKOVER. A matchup where one side reliably loses its whole
     fleet for nothing is a hull nobody would ever buy - the naval equivalent of a flattened
     difficulty ladder. */
  /* sub-vs-destroyer is deliberately absent from this list: it is the one matchup in the game
     that IS meant to be one-sided, and asserting otherwise would be asserting against the
     design. Every other pair here is two hulls a player might reasonably choose between. */
  [subVsGun, msubVsDest, gunVsDest].forEach(function (d) {
    if (!d) return;
    S.ok(d.a + ' vs ' + d.b + ': the loser is not wiped for free',
         !(d.aShare === 0 && d.bShare === 1) && !(d.bShare === 0 && d.aShare === 1),
         Math.round(d.aShare * 100) + '% vs ' + Math.round(d.bShare * 100) + '%');
  });

  /* 3b. THE CRUISER IS BOTH THINGS OR IT IS NEITHER. It exists because the Missile Sub bombarded
     from 34 and nothing Allied reached it, so out-shooting that hull is the entire reason it was
     added - and it is priced at 2,000 with no sonar precisely so that submarines answer it. A
     Cruiser that beat both would be the end of the naval game rather than the opening of it. */
  if (cruVsMsub) {
    S.ok('the Cruiser out-shoots the hull it was added to answer',
         cruVsMsub.aShare > cruVsMsub.bShare,
         'cruisers kept ' + Math.round(cruVsMsub.aShare * 100) + '%, missile subs ' +
         Math.round(cruVsMsub.bShare * 100) + '%');
  }
  if (cruVsSub) {
    /* Strictly greater, not `>=`: a mutual wipe would satisfy "at least as good" while meaning
       the submarines are not an answer to anything. */
    S.ok('...and submarines are still the answer to it',
         cruVsSub.bShare > cruVsSub.aShare,
         'subs kept ' + Math.round(cruVsSub.bShare * 100) + '%, cruisers ' +
         Math.round(cruVsSub.aShare * 100) + '%');
  }

  /* 4. And the fights actually happen. Two fleets that never met measure nothing, and this is
     the failure a sea arena is most likely to have: hulls that cannot path to each other look
     exactly like hulls that are evenly matched. */
  [subVsGun, subVsDest, msubVsDest, gunVsDest, cruVsMsub, cruVsSub].forEach(function (d) {
    if (!d) return;
    S.ok(d.a + ' vs ' + d.b + ': the fleets actually engaged',
         d.aHp < 100 || d.bHp < 100,
         'hp left ' + d.aHp + '% vs ' + d.bHp + '% after ' + d.secs + 's');
  });

  S.ok('the page logged no errors', g.errors.length === 0,
       g.errors.length ? g.errors.slice(0, 2).join(' | ') : 'clean');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})();
