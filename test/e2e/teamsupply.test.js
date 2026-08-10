/* CAN THE OPPONENT ACTUALLY CREW WHAT IT RAISES?

   A team is raised, recruits until it is at full strength, and only then marches. A team that
   can NEVER reach full strength is worse than one that is never raised: it holds a slot against
   the concurrent-team cap AND holds its recruits out of the war, because a unit with a squad is
   not spare to anything else. It then disbands at RTS_TEAM_FORM_TIMEOUT having done nothing.

   THAT WAS HAPPENING IN EVERY MATCH. Instrumented over twelve - three seeds, both armies, normal
   and hard - sixty-six of seventy-eight teams raised ever marched, and all twelve failures were
   the same one: a SECOND Snatch. Snatch is built around an engineer and the opponent allows one
   engineer alive (RTS_AI.engCap), so the second team could not be crewed however long it waited.
   Two units sat in it for the full timeout, every match.

   The cause was that `max` was a floor rather than a ceiling. _rtsTypeCap scales the authored
   per-type maximum with the size of the army, which is right for the ordinary types - a fixed cap
   collapses the share of the army committed as the opponent gets richer - and wrong for a type
   whose limit comes from somewhere other than army size. `only` marks those two: Snatch, capped
   by engCap, and Landing, capped by craftCap.

   WHAT THIS PINS is the invariant rather than the number: no `only` type may ever have more teams
   in the field at once than it is allowed. That is the thing that was false, it is cheap to
   check, and it cannot be satisfied by accident. The wasted-unit count is reported beside it
   because it is what the fault actually cost. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('teamsupply');
var SEEDS = [9001, 9002, 9003];
var CASES = [['allied', 'normal'], ['soviet', 'hard']];
var SECS = 420;

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 800, height: 600 });
  await g.start(7, 1);

  var out = await g.page.evaluate(function (a) {
    var CASES = a[0], SEEDS = a[1], SECS = a[2];
    /* WHICH TYPES ARE CAPPED IS DERIVED FROM THE ROSTER, NOT FROM THE `only` FLAG, and that is
       the whole difference between a test and a tautology. Keying this off `only` means deleting
       the flag deletes the type from the checked set, and the spec passes cheerfully while the
       bug is back - which is exactly what the first version of this file did when it was
       mutation-tested. So the composition is what selects: a type built around a unit the
       opponent hard-caps is a type whose team count is limited by that cap.
       The list mirrors the per-key gates in _rtsAIUnits; a third capped unit needs adding here
       as well as there. */
    var CAPPED_UNITS = { engineer: RTS_AI.engCap, lst: RTS_AI.craftCap };
    var capped = {};
    RTS_TEAM_TYPES.forEach(function (t) {
      for (var k in t.members) if (CAPPED_UNITS[k] != null) {
        /* what the roster allows: at most one team per capped unit available */
        capped[t.name] = Math.min(t.max == null ? 1 : t.max, CAPPED_UNITS[k]);
      }
    });

    var runs = [];
    CASES.forEach(function (c) {
      SEEDS.forEach(function (seed) {
        if (typeof rtsSetVoxSide === 'function') rtsSetVoxSide(c[0]);
        _rtsNewGame(seed, c[1]);
        var G = window._rtsG, seen = {}, peak = {};
        for (var t = 0; t < 60 * SECS; t++) {
          _rtsTick(1 / 60);
          if (G.over) break;
          /* live teams of each type, and the high-water mark per type */
          var live = {};
          for (var id in G.teams) {
            var tm = G.teams[id];
            live[tm.type.name] = (live[tm.type.name] || 0) + 1;
            if (!seen[id]) seen[id] = { name: tm.type.name, marched: false };
            if (tm.hasBeen) seen[id].marched = true;
          }
          for (var k in live) if (!(peak[k] >= live[k])) peak[k] = live[k];
        }
        var raised = 0, marched = 0, held = 0;
        for (var q in seen) { raised++; if (seen[q].marched) marched++; }
        for (var i = 0; i < G.ents.length; i++) {
          var e = G.ents[i];
          if (e.dead || e.side !== 'enemy' || e.type !== 'unit') continue;
          if (e.sqd != null && G.teams[e.sqd] && !G.teams[e.sqd].hasBeen) held++;
        }
        runs.push({ tag: c[0] + '/' + c[1] + '/' + seed, peak: peak,
                    raised: raised, marched: marched, held: held });
      });
    });
    return { capped: capped, runs: runs };
  }, [CASES, SEEDS, SECS]);

  S.note('types built around a hard-capped unit, and the teams the roster allows of each: ' +
         (Object.keys(out.capped).map(function (k) { return k + ' (max ' + out.capped[k] + ')'; })
           .join(', ') || 'NONE'));

  var raised = 0, marched = 0, held = 0;
  out.runs.forEach(function (r) {
    raised += r.raised; marched += r.marched; held += r.held;
    S.note('  ' + r.tag.padEnd(20) + r.marched + ' of ' + r.raised + ' teams marched, ' +
           r.held + ' units held   peak live: ' +
           Object.keys(r.peak).map(function (k) { return k + '×' + r.peak[k]; }).join(' '));
  });

  /* 1. THE TYPES EXIST AT ALL. If nothing carries `only`, every assertion below is vacuously
     true and this spec would pass while checking nothing. */
  S.ok('there are types capped by something other than the army', Object.keys(out.capped).length > 0,
       Object.keys(out.capped).join(', ') || 'none — the rest of this spec would be vacuous');

  /* 2. AND THEIR CAP IS A CEILING. This is the invariant that was false: a second Snatch was
     raised in every match measured, and could never be crewed. */
  var over = [];
  out.runs.forEach(function (r) {
    Object.keys(out.capped).forEach(function (k) {
      if ((r.peak[k] || 0) > out.capped[k])
        over.push(r.tag + ': ' + k + ' reached ' + r.peak[k] + ', allowed ' + out.capped[k]);
    });
  });
  S.ok('a capped team type is never raised beyond its limit', !over.length,
       over.join('; ') || 'held in all ' + out.runs.length + ' matches');

  /* 3. AND THE COST IT USED TO CARRY. Not pinned to a number - how many teams a match raises
     depends on how rich the opponent gets - but a run where most raised teams never march means
     the opponent is spending its slots on nothing, which is the fault this spec is about. */
  S.ok('most teams the opponent raises actually march', marched > raised * 0.9,
       marched + ' of ' + raised + ' marched across ' + out.runs.length + ' matches');
  S.note('units still sitting in teams that never marched: ' + held +
         ' — reported, not asserted. It was 24 across twelve matches before the cap was made a' +
         ' ceiling and 2 after; a small residue is a team whose engineer died on the way.');

  S.ok('the page logged no errors', g.errors.length === 0,
       g.errors.length ? g.errors.slice(0, 2).join(' | ') : 'clean');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})();
