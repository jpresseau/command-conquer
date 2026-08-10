/* THE LADDER FOR A PLAYER WHO FIGHTS BACK.

   e2e/ladder measures how long a player who does NOTHING survives, and that is the right metric
   for isolating the opponent - no skill, no strategy, nothing but the AI doing its job. But it
   is the only one, and one number cannot tell two different changes apart. An opponent that got
   cleverer and an opponent that merely got slower both move it the same way, and this session
   has already had to argue about which of those a change was.

   So: the same seeds, the same difficulties, the same cap - and a player that does the obvious
   things. Not a good player. A player who keeps its harvesters working, replaces power when the
   lights go out, puts up defences, and sends what it builds at the opponent. The floor of
   competence, scripted, so it is identical in every run and every future run.

   WHAT THIS MEASURES THAT THE IDLE LADDER CANNOT: whether the opponent can beat a base that
   shoots back. A change that makes the AI attack a defenceless base faster moves the idle ladder
   and does nothing here. A change that makes it handle defences better moves this one. Read side
   by side, the pair says which happened.

   THE SCRIPT LIVES IN THE SPEC, ON PURPOSE. It is a definition of "obvious things" for the
   purpose of measurement, not a feature - the game has no scripted player and should not grow
   one just so a test has an opponent. Everything it calls is a function the real UI calls.

   ------------------------------------------------------------------------------------------
   WHY THIS MEASURES DAMAGE AND NOT SURVIVAL TIME.

   It used to report mean seconds survived against a 600-second cap, over three seeds, and that
   instrument could not do its job. Run twice on ONE unchanged tree, varying nothing but which
   seeds were used:

                          seeds 9001-9003        seeds 9004-9006
       allied  e/n/h      543 / 387 / 194        524 / 600 / 288
       soviet  e/n/h      539 / 505 / 199        506 / 600 / 275
       hard runs with no army    3 of 6                 0 of 6

   Ninety to two hundred and ten seconds of spread from the seed set alone. The simulation is
   deterministic, so that is not run-to-run noise: it is three particular maps differing from
   three others. A change was once rejected in this repo partly on movements of 11 to 114
   seconds in those numbers, which is comfortably inside the band.

   TWO FAULTS, AND THE SECOND IS THE WORSE ONE. Too few seeds, obviously. But look at the 600s
   on the right-hand column: the player rode the cap on normal for BOTH armies. A capped
   survival time cannot express "the opponent did better against a base that was going to hold
   anyway" - once the player survives to the end, every further improvement in the opponent
   reads as exactly the same number. The metric saturated precisely where the interesting
   changes are.

   SO THE MEASURE IS NOW HOW FAR THE OPPONENT GOT, ON A SCALE THAT SPANS BOTH OUTCOMES. Damage
   alone was tried first and is not enough, which is worth writing down because it looks right:
   scoring "share of the base razed at the horizon" saturates at BOTH ends instead of one. Hard
   read 100% on all ten runs, because the player is always dead by about 200 seconds and a dead
   base is a razed base; easy read 0-3%, because it is never in danger. Only normal moved, and it
   moved between 0% and 100%. That is a win/lose flag wearing a percentage sign.

   The two regimes want different questions. Where the base falls, WHEN it fell is what separates
   a stronger opponent from a weaker one - and those times are tight, 186 to 217 seconds across
   ten hard runs. Where the base holds, HOW MUCH was taken is the only thing that separates them.
   So:

       the base fell at T     progress = 1 + (HORIZON - T) / HORIZON     -> 100% to 200%
       the base held          progress = share of it razed               ->   0% to 100%

   One number, monotone in how well the opponent did, continuous where the two regimes meet (a
   base that falls exactly at the horizon and a base that holds with nothing left both score
   100%), and saturating at neither end: a better opponent kills sooner, a worse one razes less.
   Survival and damage are both still printed, because they are what a person recognises, but
   the assertions are on the composite.

   ------------------------------------------------------------------------------------------
   HOW TO USE THESE NUMBERS, WHICH MATTERS MORE THAN THE METRIC.

   The composite is better shaped than what it replaced, and it is STILL not precise in absolute
   terms. Measured the same way as before - one unchanged tree, two disjoint sets of five seeds:

                        seeds 9001-9005      seeds 9006-9010
       allied  e/n/h     1% / 54% / 154%      0% / 20% / 111%
       soviet  e/n/h     0% / 34% / 152%      2% / 30% / 134%

   Forty-three points apart on allied hard. On one set every hard run killed the player at about
   195 seconds; on the other, one hard run was still HELD at the horizon with 27% razed. Five
   seeds is not enough to pin an absolute number, and reading the tight within-set spread of the
   first column as precision is the same error one level down - it was made here, in this file's
   own history, twice.

   SO COMPARE LIKE FOR LIKE, AND PER SEED. Run the same seed list before and after a change and
   read the PER-SEED lines, not the means: the map is the dominant source of variation and it
   cancels completely when both sides of a comparison play the same maps. That is what makes
   this spec usable despite the above. What it cannot support is quoting an absolute figure from
   one run and comparing it to a figure from a different seed list.

   AND EVEN PAIRED, TREAT SMALL MOVEMENTS ON `normal` AS NOTHING. Normal sits on the boundary
   where the base sometimes holds and sometimes falls; a single seed crossing it moves a
   five-seed mean by twenty to thirty points on its own. Easy and hard are consistent within a
   seed and behave much better under pairing.

   THE ASSERTIONS ARE DELIBERATELY COARSE and hold on both seed sets above - they ask whether the
   opponent gets in at all and whether hard beats easy, not for any particular number. Nothing
   here asserts on a mean that the instrument cannot resolve.

   AND THE SPREAD IS PRINTED BESIDE EVERY MEAN, with every per-seed result above it. A
   measurement that does not report its own precision invites exactly the mistake that was made
   here: the min and max sit next to the mean so a reader can see the wobble before attributing
   a movement to anything. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('pushback');
/* Five rather than three, because three was demonstrably too few - see the header. Every match
   now costs a bounded HORIZON instead of running to a 600s cap, so the extra seeds cost less
   than they look: more samples, shorter samples. */
var SEEDS = [9001, 9002, 9003, 9004, 9005];
var DIFFS = ['easy', 'normal', 'hard'];
/* The horizon every match is measured at. Long enough for the opponent to have alerted (150s)
   and pushed several times; short enough that thirty matches stay affordable. */
var HORIZON = 420;

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 800, height: 600 });
  await g.start(7, 1);

  await g.page.evaluate(function () {
    /* One decision every RTS_PUSH_TICK seconds, which is roughly how often a person acts. The
       order is an opening: keep mining, keep the lights on, put up a line, then make an army. */
    window._rtsPushPlay = function (vs, diff, seed, HORIZON) {
      if (typeof rtsSetVoxSide === 'function') rtsSetVoxSide(vs);
      _rtsNewGame(seed, diff);
      var G = window._rtsG, P = G.sides.player;
      var fell = null, next = 0, sent = 0, built = {}, army = [];
      var peakHp = 0, peakN = 0;
      /* The player's base as it stands right now: total structure hit points and a count. Peak
         is tracked rather than "what it built", because the player keeps building throughout -
         the question is how much of whatever it managed to put up is still there. */
      function base() {
        var hp = 0, n = 0;
        for (var i = 0; i < G.ents.length; i++) {
          var e = G.ents[i];
          if (e.dead || e.side !== 'player' || e.type !== 'struct') continue;
          hp += e.hp; n++;
        }
        return { hp: hp, n: n };
      }

      function have(key) {
        var n = 0;
        for (var i = 0; i < G.ents.length; i++) {
          var e = G.ents[i];
          if (!e.dead && e.side === 'player' && e.def === key) n++;
        }
        return n;
      }
      /* Somewhere to put a building: the first open cell spiralling out from the yard. The real
         player picks by eye; anywhere legal is the same measurement. */
      function spot() {
        var y = _rtsHas('player', 'yard') || _rtsHas('player', 'factory');
        if (!y) return null;
        var open = _rtsNearestOpen(y.tx + 3, y.tz + 3, 14, null);
        return open ? { tx: open[0], tz: open[1] } : null;
      }
      function wantStruct() {
        /* Power first when it is short, because everything else stops without it. Then the
           economy, then a line of guns, then the tech that unlocks better units. */
        if (P.powerMade - P.powerUsed < 40) return 'power';
        if (have('refinery') < 2) return 'refinery';
        if (!have('barracks')) return 'barracks';
        if (!have('factory')) return 'factory';
        var def = rtsHouseSide('player') === 'allied' ? 'pillbox' : 'flametower';
        if (have(def) < 4) return def;
        if (!have('radar')) return 'radar';
        if (!have('lab')) return 'lab';
        return null;
      }
      function wantUnit() {
        if (have('harvester') < 3) return 'harvester';
        var heavy = rtsHouseSide('player') === 'allied' ? 'arty' : 'v2rl';
        if (_rtsCanQueue('player', heavy) && have(heavy) < 3) return heavy;
        if (_rtsCanQueue('player', 'tank')) return 'tank';
        return 'rifle';
      }

      for (var t = 0; t < 60 * HORIZON && fell === null; t++) {
        _rtsTick(1 / 60);
        if (G.over) { fell = +G.t.toFixed(0); break; }
        if (G.t < next) continue;
        next = G.t + 3;
        var b = base();
        if (b.hp > peakHp) peakHp = b.hp;
        if (b.n > peakN) peakN = b.n;

        /* Place whatever finished building. The UI does this on a click; here it goes wherever
           there is room, which is the same thing for a measurement. */
        if (P.ready) {
          var sp = spot();
          if (sp && !_rtsBlocked(sp.tx, sp.tz, null)) {
            _rtsPlaceStruct('player', P.ready, sp.tx, sp.tz, false, P.readyPaid);
            built[P.ready] = (built[P.ready] || 0) + 1;
            P.ready = null; P.readyPaid = null;
          }
        }
        if (!P.q.struct && !P.ready) {
          var ws = wantStruct();
          if (ws && _rtsCanQueue('player', ws)) _rtsQueue('player', ws);
        }
        var wu = wantUnit();
        if (wu && _rtsCanQueue('player', wu)) _rtsQueue('player', wu);

        /* Gather what is idle and, once there is enough of it, push. A player who trickles
           units at a base one at a time is not fighting back, they are feeding. */
        army = [];
        for (var i = 0; i < G.ents.length; i++) {
          var u = G.ents[i];
          if (u.dead || u.side !== 'player' || u.type !== 'unit') continue;
          if (rtsUnitDef(u.def).harvest) continue;
          army.push(u);
        }
        if (army.length >= 8) {
          var tgt = _rtsHas('enemy', 'yard') || _rtsHas('enemy', 'refinery') || _rtsHas('enemy', 'power');
          if (tgt) {
            for (i = 0; i < army.length; i++) {
              if (army[i].order === 'amove' || army[i].order === 'attack') continue;
              _rtsOrderMove(army[i], tgt.x + (i % 5 - 2) * RTS_TILE, tgt.z + ((i / 5 | 0) - 1) * RTS_TILE, true);
            }
            sent++;
          }
        }
      }
      /* HOW MUCH OF THE BASE THE OPPONENT TOOK APART. A base that fell counts as taken apart
         whatever is still standing when the match is called: `over` fires on the Command Yard,
         so a player can be beaten with outbuildings intact and it would understate the result
         to score that as a partial. */
      var end = base();
      var razed = peakHp > 0 ? (peakHp - end.hp) / peakHp : 0;
      if (G.over === 'lose') razed = 1;
      /* The composite - see the header for why damage alone was not enough. A base that fell
         scores by how early; a base that held scores by how much came off it. */
      var progress = (G.over === 'lose') ? 1 + (HORIZON - G.t) / HORIZON
                                         : Math.max(0, Math.min(1, razed));
      return { progress: progress,
               fell: fell, over: G.over || null, pushes: sent,
               built: Object.keys(built).sort().join(','),
               army: army.length,
               razed: Math.max(0, Math.min(1, razed)),
               peakN: peakN, standing: end.n,
               es: G.ents.filter(function (e) { return !e.dead && e.side === 'enemy' && e.type === 'struct'; }).length };
    };
  });

  var prog = {}, surv = {}, wins = 0, total = 0, runs = [];
  for (var si = 0; si < 2; si++) {
    var vs = ['allied', 'soviet'][si];
    for (var di = 0; di < DIFFS.length; di++) {
      var d = DIFFS[di], rz = [], fell = [];
      for (var i = 0; i < SEEDS.length; i++) {
        var r = await g.page.evaluate(function (a) {
          return window._rtsPushPlay(a[0], a[1], a[2], a[3]);
        }, [vs, d, SEEDS[i], HORIZON]);
        rz.push(r.progress);
        fell.push(r.fell === null ? HORIZON : r.fell);
        total++;
        if (r.over === 'win') wins++;
        runs.push({ vs: vs, d: d, seed: SEEDS[i], pushes: r.pushes, razed: r.razed,
                    built: r.built ? r.built.split(',').length : 0 });
        S.note(vs.padEnd(7) + d.padEnd(7) + 'seed ' + SEEDS[i] +
               '  progress ' + (r.progress * 100).toFixed(0).padStart(3) + '%' +
               '  ' + String(r.over || 'held').padEnd(6) +
               ' at ' + String(r.fell === null ? HORIZON : r.fell).padStart(3) + 's' +
               '  razed ' + (r.razed * 100).toFixed(0).padStart(3) + '%' +
               '  (' + r.standing + ' of ' + r.peakN + ' left)' +
               '  pushes ' + String(r.pushes).padStart(3) +
               '  built: ' + (r.built || 'nothing'));
      }
      function stat(a) {
        var m = a.reduce(function (x, c) { return x + c; }, 0) / a.length;
        return { mean: m, min: Math.min.apply(null, a), max: Math.max.apply(null, a) };
      }
      prog[vs + ':' + d] = stat(rz);
      surv[vs + ':' + d] = Math.round(fell.reduce(function (a, c) { return a + c; }, 0) / fell.length);
    }
  }
  /* THE HEADLINE, WITH ITS OWN ERROR BARS. The spread across the seeds is printed beside every
     mean on purpose - it is the number that says whether a movement means anything, and leaving
     it out is what let these figures be over-read before. */
  S.note('opponent progress by ' + HORIZON + 's — under 100% the base held and this is the share' +
         ' razed; over 100% it fell, and the excess is how early. Mean [min-max] over ' +
         SEEDS.length + ' seeds:');
  Object.keys(prog).forEach(function (k) {
    var q = prog[k];
    S.note('    ' + k.padEnd(16) + (q.mean * 100).toFixed(0).padStart(3) + '%   [' +
           (q.min * 100).toFixed(0) + '-' + (q.max * 100).toFixed(0) + '%]');
  });
  S.note('mean survival for comparison, NOT asserted on — ' +
         Object.keys(surv).map(function (k) { return k + ' ' + surv[k] + 's'; }).join('   '));

  /* 1. THE SCRIPT HAS TO ACTUALLY PLAY. A "player" that never built anything or never attacked
     would produce a number indistinguishable from the idle ladder, and the whole spec would be
     measuring nothing while looking like it measured something.

     So this asks the runs themselves, rather than asking whether the loop ran - counting matches
     would pass whatever the script did, including nothing. Placing a base is required of every
     run: it needs no luck, only the credits the map starts with, so a run that did not manage it
     means the script is broken rather than pressed. */
  var thin = runs.filter(function (r) { return r.built < 4; });
  var fewest = runs.reduce(function (m, r) { return Math.min(m, r.built); }, 99);
  S.ok('the scripted player builds a base in every run', !thin.length,
       thin.length ? thin.map(function (r) { return r.vs + ' ' + r.d + ' ' + r.seed +
                                                    ': ' + r.built + ' structures'; }).join(', ')
                   : total + ' matches, fewest structure types placed in any of them: ' + fewest);

  /* And it has to get an army out and use it - but only where that is actually possible. On easy
     and normal it always does, and a run that stopped doing so would mean the script broke. Hard
     is deliberately exempt: the opponent frequently kills it before eight units exist, and that
     is the difficulty working rather than the script failing. Asserting it there would pin the
     spec to the opponent's current strength and break the next time the ladder moved. */
  var quiet = runs.filter(function (r) { return r.d !== 'hard' && r.pushes === 0; });
  S.ok('...and attacks with what it builds, on easy and normal', !quiet.length,
       quiet.length ? quiet.map(function (r) { return r.vs + ' ' + r.d + ' ' + r.seed; }).join(', ')
                    : runs.filter(function (r) { return r.d !== 'hard'; }).length +
                      ' runs on easy and normal, every one of them attacked');

  var stillborn = runs.filter(function (r) { return r.d === 'hard' && r.pushes === 0; });
  S.note('hard runs where it never assembled an army at all: ' + stillborn.length + ' of ' +
         runs.filter(function (r) { return r.d === 'hard'; }).length +
         ' — reported, not asserted, and worth knowing that this figure is very seed-dependent:' +
         ' the same tree gave 3 of 6 on one set of three seeds and 0 of 6 on another.');

  /* 2. THE OPPONENT HAS TO DO SOMETHING ON HARD. A base that shoots back is not supposed to be
     untouchable: if the hardest setting cannot get through a floor-of-competence defence at all,
     the difficulty is decoration. Asked as a floor rather than a target, because the exact share
     will move whenever the roster does. */
  ['allied', 'soviet'].forEach(function (vs) {
    var h = prog[vs + ':hard'];
    S.ok(vs + ' hard: the opponent gets into a base that shoots back', h.mean > 0.2,
         'progress ' + (h.mean * 100).toFixed(0) + '% [' + (h.min * 100).toFixed(0) + '-' +
         (h.max * 100).toFixed(0) + '%]');
  });

  /* 3. AND THE DIFFICULTY ORDER MUST SURVIVE IT. The same property the idle ladder pins, asked of
     a harder problem: a setting that is easier against a passive player but not against an active
     one is not a difficulty setting, it is a pacing difference.

     Compared on damage rather than on survival time, which is the point of the rewrite - the old
     version asked whether easy OUTLASTED hard, and once the player rode the cap on both there was
     nothing left for that comparison to see. */
  ['allied', 'soviet'].forEach(function (vs) {
    var e = prog[vs + ':easy'], h = prog[vs + ':hard'];
    S.ok(vs + ': hard gets further than easy', h.mean > e.mean,
         'easy ' + (e.mean * 100).toFixed(0) + '% vs hard ' + (h.mean * 100).toFixed(0) + '%');
  });

  S.note('wins for the scripted player: ' + wins + ' of ' + total +
         ' — reported, not asserted. A floor-of-competence player beating the opponent sometimes' +
         ' is healthy; never winning on easy, or always winning on hard, would not be.');

  S.ok('the page logged no errors', g.errors.length === 0,
       g.errors.length ? g.errors.slice(0, 2).join(' | ') : 'clean');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})();
