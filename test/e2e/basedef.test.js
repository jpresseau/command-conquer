/* How the opponent defends its base - measured on BOTH armies, which is the whole point.

   Two bugs, found together because they have the same shape: a rule written for one army and
   silently not applied to the other.

   1. `tesla` sat in RTS_AI.buildOrder with no entry in RTS_AI.ratio or RTS_AI.limit.
      _rtsAIWants computes `ceil(base * ratio[key])`, which is NaN with no ratio, and every
      comparison against NaN is false - so the Soviet opponent skipped its signature defensive
      building for ever, at every difficulty, on every map, with nothing logged.

   2. _rtsAIPlace aimed a new defence at the base's weakest approach with
      `else if (key === 'turret')`. `turret` is Allied-only. _rtsAIWeakZone itself counts a
      zone's defence as "structures with a weapon" - six building types - so the routine's own
      definition and its one call site disagreed, and the entire Which_Zone port ran for one
      army and never for the other.

   Measured before the fix, hard, three seeds, 420 simulated seconds, with the player kept
   alive so the match runs the full window:

                       defences built   Tesla Coils   compass zones covered
     Soviet house           6.7             0.0            1, 3, 2   of 4
     Allied house          10.0              -             4, 4, 4   of 4

   On seed 9001 all seven of the Soviet house's defences sat on ONE side of the base: the same
   attack route worked for the whole match. After: 4, 4, 4 for both armies.

   test/unit/rules pins the table invariant that would have caught the first bug at edit time -
   every key in the build order has a ratio and a limit. This is the other half: that the
   opponent, in a running match, actually ends up defended on more than one side. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('basedef');

/* One seed per army rather than the three the numbers above came from: what has to be guarded
   from here on is the property, not the mean.

   420 seconds is not padding. At 300 the base plan has not reached its defensive tail yet -
   measured, the same run gives 3 defences over 2 zones and 2 over 1, and every assertion below
   fails on a perfectly healthy build. A spec has to run long enough to reach the thing it is
   about, and this is where that is. It costs about 80 seconds of wall clock. */
var SECS = 420;

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 800, height: 600 });
  await g.start(7, 1);

  var out = [];
  for (var si = 0; si < 2; si++) {
    var vs = ['allied', 'soviet'][si];
    var r = await g.page.evaluate(function (a) {
      var vs = a[0], SECS = a[1];
      if (typeof rtsSetVoxSide === 'function') rtsSetVoxSide(vs);
      _rtsNewGame(9001, 'hard');
      var G = window._rtsG, wanted = {};
      for (var t = 0; t < SECS * 60; t++) {
        _rtsTick(1 / 60);
        if (G.over) break;
        /* The player does nothing but refuse to die. An idle player who dies at 170s never
           sees the base plan reach its defensive tail, and this is about the tail. */
        for (var k = 0; k < G.ents.length; k++) {
          var e = G.ents[k];
          if (e.side === 'player' && !e.dead) e.hp = e.maxHp;
        }
        if (G.ai && G.ai.want) wanted[G.ai.want.key] = 1;
      }
      var counts = {}, zones = {}, defences = 0, c = _rtsBaseCentre('enemy');
      for (var j = 0; j < G.ents.length; j++) {
        var s = G.ents[j];
        if (s.dead || s.type !== 'struct' || s.side !== 'enemy') continue;
        counts[s.def] = (counts[s.def] || 0) + 1;
        var sd = rtsStructDef(s.def);
        if (sd && sd.weapon && c) {
          defences++;
          var z = _rtsWhichZone(c, s.x, s.z);
          if (z >= 1 && z <= 4) zones[z] = 1;
        }
      }
      return { house: rtsHouseSide('enemy'), counts: counts, defences: defences,
               zones: Object.keys(zones).length, wanted: Object.keys(wanted).sort(),
               t: Math.round(G.t) };
    }, [vs, SECS]);
    out.push(r);

    S.note(r.house + ' opponent at ' + r.t + 's: ' + r.defences + ' defences over ' +
           r.zones + ' of 4 zones — ' + Object.keys(r.counts).sort().map(function (k) {
             return k + '×' + r.counts[k]; }).join(' '));
    S.ok('the ' + r.house + ' opponent builds base defences at all', r.defences >= 3,
         r.defences + ' built');
    /* THE ONE THAT MATTERED. Not "some spread" - a base defended on one side is a base with
       three open approaches, and it is what the Soviet house did on every seed measured. */
    S.ok('...and covers more than one approach with them', r.zones >= 3,
         r.zones + ' of 4 compass zones');
  }

  /* The Soviet plan must REACH the Coil. Whether it can afford one inside a given window is a
     money question and varies by seed; whether the plan ever asks for it is the bug - with the
     ratio missing, `want` was NaN and the key was skipped without ever being considered. */
  var sov = out.filter(function (r) { return r.house === 'soviet'; })[0];
  S.ok('a Soviet opponent exists in this run', !!sov, sov ? sov.house : 'none');
  if (sov) {
    S.ok('the Soviet base plan reaches the Tesla Coil rather than skipping it on a NaN',
         sov.wanted.indexOf('tesla') >= 0 || (sov.counts.tesla || 0) > 0,
         'wanted over the match: ' + sov.wanted.join(', '));
    S.ok('...and it builds its own defences, not the other army\'s',
         !sov.counts.turret && !sov.counts.pillbox && !sov.counts.aagun,
         Object.keys(sov.counts).join(' '));
  }
  var all = out.filter(function (r) { return r.house === 'allied'; })[0];
  if (all) {
    S.ok('the Allied opponent likewise builds only Allied defences',
         !all.counts.tesla && !all.counts.flametower && !all.counts.rocketpit,
         Object.keys(all.counts).join(' '));
  }

  S.ok('the page logged no errors', !g.errors.length, g.errors.slice(0, 2).join(' | ') || 'clean');
  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})();
