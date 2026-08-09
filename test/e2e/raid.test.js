/* Suspend_Teams: when the opponent's base is raided, do its raiding parties come home?

   HOUSE.CPP calls Suspend_Teams so that everything below the survival priority is disbanded and
   its members freed to defend, and _rtsBaseIsAttacked is the port. It had nothing to do. The
   authored priorities are Raiders 1, Skirmish 2, Sappers 3, Assault 4, and the threshold
   disbanded below 3 - so it could only ever free Raiders and Skirmish, and those two stop being
   raised the moment the war proper starts.

   Measured before the fix, seed 9001, hard, six tanks into an undefended Refinery at 240s:

     _rtsBaseIsAttacked fired 1,462 times
     _rtsSuspendTeams was called 26 times and disbanded ZERO teams
     the field went {priority 3: 4, 4: 4} -> {3: 9, 4: 5} - it GREW while the base was hit

   After: 6 teams disbanded, the field {4: 4}, Assault untouched. The main push is deliberately
   not cancelled because somebody poked a refinery - that is the reference's intent and it is
   also what stops a player farming the 40-second reform delay with one cheap unit.

   WHAT THIS SPEC DOES NOT CLAIM. That the recall wins the fight. The obvious measure - how many
   of the opponent's units are near its own base - rises in BOTH cases, because the AI goes on
   producing at home while the raid runs, and it confounds the thing being measured. What is
   asserted is what can be seen: the routine does its job, on the teams it is meant to, and not
   on the one it is meant to leave alone.

   THE LADDER CANNOT SEE THIS CHANGE AT ALL, which is why there is a spec rather than a number:
   the ladder's player is idle and never attacks, so _rtsBaseIsAttacked never fires in it. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('raid');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 800, height: 600 });
  await g.start(7, 1);

  var r = await g.page.evaluate(function () {
    _rtsNewGame(9001, 'hard');
    var G = window._rtsG;
    function alive() {
      for (var k = 0; k < G.ents.length; k++) {
        var e = G.ents[k];
        if (e.side === 'player' && !e.dead) e.hp = e.maxHp;
      }
    }
    function teams() {
      var o = {};
      for (var id in G.teams) { var p = G.teams[id].type.priority; o[p] = (o[p] || 0) + 1; }
      return o;
    }
    /* Long enough for the opponent to have a war going and teams in the field. */
    for (var t = 0; t < 240 * 60; t++) { _rtsTick(1 / 60); if (G.over) return { error: 'match ended early' }; alive(); }
    var before = teams();

    /* A building it cannot defend with its own weapon - _rtsBaseIsAttacked returns 0 for one
       that can, so raiding a turret would prove nothing. */
    var target = null;
    G.ents.forEach(function (e) {
      if (target || e.dead || e.type !== 'struct' || e.side !== 'enemy') return;
      var sd = rtsStructDef(e.def);
      if (sd && !sd.weapon && e.def !== 'yard') target = e;
    });
    if (!target) return { error: 'no undefended enemy building to raid' };

    var force = [];
    for (var i = 0; i < 6; i++) {
      var u = _rtsSpawnUnit('player', 'tank', target.x - RTS_TILE * (6 + i), target.z + RTS_TILE * (i - 3));
      if (u) { _rtsOrderAttack(u, target); force.push(u); }
    }
    if (force.length < 4) return { error: 'could not put a raiding force on the board' };

    var real = window._rtsSuspendTeams, calls = 0, disbanded = 0;
    window._rtsSuspendTeams = function (p) { calls++; var n = real(p); disbanded += n; return n; };
    /* Both sides kept standing: the match was ending five seconds into the raid, which is not
       long enough for a disbanded team's members to do anything at all. */
    for (var s = 0; s < 60 * 60; s++) { _rtsTick(1 / 60); if (G.over) break; alive(); }
    window._rtsSuspendTeams = real;

    return { before: before, after: teams(), calls: calls, disbanded: disbanded,
             target: target.def, threshold: window.RTS_SUSPEND_PRIORITY };
  });

  S.ok('the raid could be staged', !r.error, r.error || 'raided a ' + r.target);
  if (!r.error) {
    S.note('teams by priority: ' + JSON.stringify(r.before) + ' -> ' + JSON.stringify(r.after) +
           '; Suspend_Teams called ' + r.calls + ', disbanded ' + r.disbanded);
    S.ok('the opponent had raiding parties in the field before it was hit',
         (r.before[3] || 0) > 0, JSON.stringify(r.before));
    S.ok('being raided calls Suspend_Teams at all', r.calls > 0, r.calls + ' calls');
    /* THE BUG. Twenty-six calls and nothing freed, because the threshold sat below every
       priority the opponent actually fields. */
    S.ok('...and it actually disbands something', r.disbanded > 0,
         r.disbanded + ' teams disbanded across ' + r.calls + ' calls');
    S.eq('...specifically the raiding parties', r.after[3] || 0, 0);
    /* AND NOT THE MAIN PUSH. Cancelling the war because a refinery was poked is both wrong and
       farmable - one cheap unit every forty seconds would keep the opponent at home for ever. */
    S.ok('...leaving the assault teams alone', (r.after[4] || 0) > 0,
         JSON.stringify(r.after));
    S.ok('the threshold sits above the raiding priority and at or below the assault one',
         r.threshold > 3 && r.threshold <= 4, 'RTS_SUSPEND_PRIORITY = ' + r.threshold);
  }

  S.ok('the page logged no errors', !g.errors.length, g.errors.slice(0, 2).join(' | ') || 'clean');
  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})();
