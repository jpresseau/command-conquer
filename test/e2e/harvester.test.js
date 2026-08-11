/* THE HARVESTER GETS HOME, OR THE ECONOMY IS OVER.

   A stranded harvester is the most expensive single failure in the game and the quietest. It
   does not die, it does not warn, and it does not look broken - it looks like a vehicle waiting
   for something. Meanwhile the one income stream in the game has stopped. This spec exists
   because of a screenshot: a base with four silos in a row under the refinery and an ore truck
   sitting still, reported as "the ore truck is stuck".

   WHAT WAS WRONG. _rtsDockCoord puts the dock in the tile row immediately SOUTH of the
   refinery's footprint, and the toRef branch drove at that one cell. Building on it - which the
   player is allowed to do, and which silos beside a refinery is an obvious thing to want - left
   a loaded harvester queueing for an unreachable cell for the rest of the match.

   AND THE FIRST FIX FOR IT DID NOT WORK, which is why the check below is the shape it is. The
   obvious repair is "if the path comes back null, try another way in". There is no null:
   _rtsPathFor answers an unreachable goal with a SINGLE WAYPOINT AT THE GOAL, _rtsSteer consumes
   that one waypoint and clears e.path, and the harvester has "completed" its route ten units
   short of the dock. Nothing in that sequence reports a failure. Measured before the fix:

       dock row clear      2,000 ore delivered, normal mine/deliver cycling
       dock row built on   ZERO delivered, 240 of 240 sampled ticks in toRef over two minutes

   The measure that works is the one the toField branch already uses and states in its own
   comment - distance closed, not whether a path came back. That is what this asserts against.

   NOTE ON THE METRIC: deliveries are counted as arrivals in the `unload` state, NOT as ore in
   the bank. Silos raise STORAGE, so the arm with silos on the dock can bank more than the arm
   without them for reasons that have nothing to do with the fault - the first version of this
   measurement read 6,500 against 2,000 and looked like a wild improvement when what it had
   actually measured was the storage cap. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('harvester');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 800, height: 600 });
  await g.start(7, 1);

  var out = await g.page.evaluate(function () {
    /* One loaded harvester, one refinery, 120 seconds. `block` is the only difference. */
    function trial(block) {
      rtsSetVoxSide('allied');
      _rtsNewGame(4242, 'easy');
      var G = window._rtsG;
      var yard = _rtsHas('player', 'yard');
      if (!yard) return { err: 'no command yard' };
      var spot = _rtsNearestOpen(yard.tx + 5, yard.tz + 5, 12, null);
      if (!spot) return { err: 'nowhere to put a refinery' };
      _rtsPlaceStruct('player', 'refinery', spot[0], spot[1], true);
      var ref = _rtsHas('player', 'refinery');
      if (!ref) return { err: 'refinery did not appear' };
      var rd = rtsStructDef('refinery');
      var dockTx = ref.tx + 1, dockTz = ref.tz + rd.h;

      var silos = 0;
      if (block) {
        /* Across the whole south face, as in the screenshot. Free and instant: the question is
           geometry, not money. */
        for (var ox = -2; ox <= 2; ox += 2) {
          if (_rtsPlaceStruct('player', 'silo', ref.tx + ox, dockTz, true)) silos++;
        }
      }

      /* Every other harvester out of the way, so nothing else can deliver and mask the result. */
      for (var i = 0; i < G.ents.length; i++) {
        var e = G.ents[i];
        if (e.side === 'player' && e.type === 'unit' && rtsUnitDef(e.def).harvest) e.dead = true;
      }
      var h = _rtsSpawnUnit('player', 'harvester', _rtsWX(ref.tx + 1), _rtsWX(ref.tz + 10));
      var hd = rtsUnitDef('harvester');
      h.carry = hd.capacity; h.carryVal = hd.capacity; h.hstate = 'toRef';

      /* Deliveries, not banked ore - see the header. An arrival is a transition INTO unload. */
      var was = h.hstate, deliveries = 0, usedAltFace = false, ticks = {};
      for (var t = 0; t < 60 * 120; t++) {
        _rtsTick(1 / 60);
        if (h.dead) break;
        if (h.hstate === 'unload' && was !== 'unload') deliveries++;
        was = h.hstate;
        if (h.dockGoal) usedAltFace = true;
        ticks[h.hstate || 'none'] = (ticks[h.hstate || 'none'] || 0) + 1;
      }
      return { silos: silos, dockBlocked: !!_rtsBlocked(dockTx, dockTz),
               deliveries: deliveries, usedAltFace: usedAltFace,
               toRefShare: Math.round((ticks.toRef || 0) / (60 * 120) * 100),
               state: h.hstate, dead: h.dead };
    }
    return { clear: trial(false), blocked: trial(true) };
  });

  var c = out.clear, b = out.blocked;
  if (c.err || b.err) {
    S.ok('the scenario could be set up', false, c.err || b.err);
  } else {
    /* 1. THE CONTROL, WHICH IS NOT DECORATION. If a loaded harvester cannot deliver with the
       dock clear, every number below it is measuring a broken harness rather than the fault. */
    S.ok('with the dock clear, a loaded harvester delivers', c.deliveries > 0,
         c.deliveries + ' deliveries in 120s, ended in ' + c.state);

    /* 2. THE SAMPLE IS BLOCKED, asserted rather than assumed. If the silos silently failed to
       place, the arm below would pass by doing nothing - which is exactly how a spec ends up
       keyed to the thing it is meant to be testing and stops being able to fail. */
    S.ok('...and the other arm really did build over the dock', b.silos > 0 && b.dockBlocked,
         b.silos + ' silos placed, dock cell blocked: ' + b.dockBlocked);

    /* 3. THE FAULT. Before the fix this was 0 deliveries and 100% of ticks in toRef. */
    S.ok('a harvester whose dock is built over still gets home', b.deliveries > 0,
         b.deliveries + ' deliveries in 120s, ' + b.toRefShare + '% of ticks spent heading for ' +
         'the refinery (it was 0 deliveries and 100% before the fix)');

    /* 4. ...BY THE ROUTE THE FIX INTENDED, not by luck. The harvester should have given up on
       the dock and gone round to another face; if it delivered without ever doing so, something
       else is carrying this test and the fix is not what is being measured. */
    S.ok('...having gone round to a face it can reach', b.usedAltFace,
         b.usedAltFace ? 'stalled at the dock, then approached from another side'
                       : 'never set dockGoal — it delivered for some other reason');

    /* 5. And the clear arm should NOT need the fallback: an unobstructed refinery must still be
       docked at normally, or the fix has quietly become the ordinary path. */
    S.ok('...while an unobstructed refinery is still docked at normally', !c.usedAltFace,
         c.usedAltFace ? 'the clear arm also went round, so the dock is not being used'
                       : 'clear arm used the dock');
  }

  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})();
