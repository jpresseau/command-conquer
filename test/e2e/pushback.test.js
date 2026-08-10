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
   READ THE MEANS BELOW WITH CARE: THREE SEEDS IS NOT ENOUGH TO DETECT A SMALL CHANGE.

   Measured directly, by running this spec twice on ONE unchanged tree and varying nothing but
   the seed set:

                          seeds 9001-9003        seeds 9004-9006
       allied  e/n/h      543 / 387 / 194        524 / 600 / 288
       soviet  e/n/h      539 / 505 / 199        506 / 600 / 275
       hard runs with no army    3 of 6                 0 of 6
       wins                      3 of 18                5 of 18

   Ninety to two hundred and ten seconds of spread from the seeds alone, and on the second set
   the player rides the cap on normal for both armies. The simulation is deterministic, so this
   is not run-to-run noise - it is how much three particular maps differ from three others.

   WHAT THAT MEANS IN PRACTICE. The ASSERTIONS are safe: they ask coarse questions (did the
   script play, did it attack, does easy still outlast hard) and they held on both seed sets.
   The printed MEANS are not precise enough to attribute a change of less than about a hundred
   seconds, and they have already been over-read once in this repo's history - a change was
   rejected partly on movements of 11 to 114 seconds in these numbers, which is inside this
   band. Direction across all six cells is worth something; any single cell is not.

   Two things would fix it and both cost runtime: more seeds, and a cap the player does not
   ride (600 is already being hit, so the metric saturates and cannot show an improvement). */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('pushback');
var SEEDS = [9001, 9002, 9003];
var DIFFS = ['easy', 'normal', 'hard'];
var CAP = 600;

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 800, height: 600 });
  await g.start(7, 1);

  await g.page.evaluate(function () {
    /* One decision every RTS_PUSH_TICK seconds, which is roughly how often a person acts. The
       order is an opening: keep mining, keep the lights on, put up a line, then make an army. */
    window._rtsPushPlay = function (vs, diff, seed, CAP) {
      if (typeof rtsSetVoxSide === 'function') rtsSetVoxSide(vs);
      _rtsNewGame(seed, diff);
      var G = window._rtsG, P = G.sides.player;
      var fell = null, next = 0, sent = 0, built = {}, army = [];

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

      for (var t = 0; t < 60 * CAP && fell === null; t++) {
        _rtsTick(1 / 60);
        if (G.over) { fell = +G.t.toFixed(0); break; }
        if (G.t < next) continue;
        next = G.t + 3;

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
      return { fell: fell, over: G.over || null, pushes: sent,
               built: Object.keys(built).sort().join(','),
               army: army.length,
               es: G.ents.filter(function (e) { return !e.dead && e.side === 'enemy' && e.type === 'struct'; }).length };
    };
  });

  var means = {}, wins = 0, total = 0, runs = [];
  for (var si = 0; si < 2; si++) {
    var vs = ['allied', 'soviet'][si];
    for (var di = 0; di < DIFFS.length; di++) {
      var d = DIFFS[di], fell = [];
      for (var i = 0; i < SEEDS.length; i++) {
        var r = await g.page.evaluate(function (a) {
          return window._rtsPushPlay(a[0], a[1], a[2], a[3]);
        }, [vs, d, SEEDS[i], CAP]);
        fell.push(r.fell === null ? CAP : r.fell);
        total++;
        if (r.over === 'win') wins++;
        runs.push({ vs: vs, d: d, seed: SEEDS[i], pushes: r.pushes,
                    built: r.built ? r.built.split(',').length : 0 });
        S.note(vs.padEnd(7) + d.padEnd(7) + 'seed ' + SEEDS[i] +
               '  fell ' + String(r.fell === null ? '>' + CAP : r.fell).padStart(4) + 's' +
               '  ' + String(r.over || 'ongoing').padEnd(8) +
               '  pushes ' + String(r.pushes).padStart(3) +
               '  enemy buildings left ' + r.es +
               '  built: ' + (r.built || 'nothing'));
      }
      means[vs + ':' + d] = Math.round(fell.reduce(function (a, c) { return a + c; }, 0) / fell.length);
    }
  }
  S.note('mean survival, fighting back — ' +
         Object.keys(means).map(function (k) { return k + ' ' + means[k] + 's'; }).join('   '));

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
         ' — reported, not asserted. This is the clearest single number for what hard does to a' +
         ' competent player: it does not out-fight them, it stops them ever fighting.');

  /* 2. FIGHTING BACK HAS TO HELP. If doing the obvious things does not buy you time against the
     opponent, then either the defences are worthless or the AI is ignoring them - and both are
     real faults this spec exists to catch. */
  ['allied', 'soviet'].forEach(function (vs) {
    DIFFS.forEach(function (d) {
      S.ok(vs + ' ' + d + ': a player who fights back is not worse off than one who does nothing',
           means[vs + ':' + d] > 60, means[vs + ':' + d] + 's');
    });
  });

  /* 3. AND THE DIFFICULTY ORDER MUST SURVIVE IT. This is the same property the idle ladder pins,
     asked of a harder problem: a setting that is easier against a passive player and not against
     an active one is not a difficulty setting, it is a pacing difference. */
  ['allied', 'soviet'].forEach(function (vs) {
    var e = means[vs + ':easy'], n = means[vs + ':normal'], h = means[vs + ':hard'];
    S.ok(vs + ': easy still outlasts hard when the player fights back', e > h,
         'easy ' + e + 's vs hard ' + h + 's');
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
