/* The scenario machinery: TRIGGER.CPP's rules, and the team autocreate split.

   unit/scenario checks that the two tables are well formed. This checks that the engine which
   walks them behaves the way the port says it does - and those rules are subtle enough that
   the shipped four triggers exercise almost none of them. Both of the game's `and` triggers
   combine conditions that only ever become MORE true, so they would fire with or without the
   latch; nothing shipped uses forceTrigger, destroyTrigger, the mission timer, globals, or an
   event that reads its ARGUMENT's house rather than its owner's. Testing only what ships would
   leave the whole engine unverified while looking like coverage.

   So this spec writes its own scenarios. RTS_TRIGGERS is a plain array and _rtsTrigFindOrMake
   builds the live instance from it, so a trigger can be pushed, driven, and taken away again -
   which is the only way to reach the rules that the shipped list does not use. Each case
   states the sentence from TRIGGER.CPP or TEVENT.CPP that it is holding the code to.

   The match is FROZEN (see lib/game.js): every one of these counts simulated seconds against
   an outcome, and a match still ticking on wall-clock between evaluate calls would make the
   timings depend on how busy the machine is. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('scenario');

/* Installed once. `run` pushes a trigger type, drives the game, and removes it again, so no
   case can leave state behind for the next one. */
function installHarness() {
  window._SC = {
    /* Add a trigger type, make its instance, tick, and return what happened to it. */
    run: function (T, secs, mid) {
      RTS_TRIGGERS.push(T);
      var inst = _rtsTrigFindOrMake(T.name);
      var out = { made: !!inst, fired: 0, alive: true, midFired: 0 };
      var G = window._rtsG;
      var half = Math.floor(secs * 60 / 2);
      for (var i = 0; i < secs * 60; i++) {
        if (mid && i === half) mid(G);
        _rtsTick(1 / 60);
        if (i === half) out.midFired = (G.trig[T.name] || { fired: 0 }).fired;
      }
      var live = G.trig[T.name];
      out.fired = live ? live.fired : (inst ? inst.fired : 0);
      out.alive = !!live;
      out.td1 = live ? { tripped: live.td1.tripped, timer: live.td1.timer } : null;
      /* take it back out, instance and type both */
      if (G.trig[T.name]) delete G.trig[T.name];
      var ix = RTS_TRIGGERS.indexOf(T);
      if (ix >= 0) RTS_TRIGGERS.splice(ix, 1);
      return out;
    },
    /* Remove every shipped trigger instance, so a case measures only its own. */
    quiet: function () {
      var G = window._rtsG;
      for (var k in G.trig) delete G.trig[k];
    }
  };
  return true;
}

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 1100, height: 800 });
  await g.start(7, 10, { freeze: true });
  var ok = await g.page.evaluate(function (src) { return eval('(' + src + ')()'); },
                                 installHarness.toString());
  S.ok('the harness can add and remove trigger types', ok === true, String(ok));

  /* ------------------------------------------------------------------- the latch ----
     TEVENT.CPP, quoted in rts.core.js: "Once tripped, an event stays true until Reset - which
     is the only reason `and` can span time at all: event 1 may trip minutes before event 2."

     `build` is the event that proves it, because justBuilt is cleared at the end of EVERY
     trigger tick - it is true for one frame and then gone for ever. An `and` whose first event
     is a build and whose second becomes true later can only fire if the first was latched. */
  var latchRes = await g.page.evaluate(function () {
    window._SC.quiet();
    var G = window._rtsG;
    G.sides.player.credits = 0;                   /* the second condition never becomes true */
    G.globals = {};
    return window._SC.run({
      name: '_t_latch', house: 'player', persist: 'volatile', control: 'and',
      event1: ['build', 'power'], event2: ['credits', 4000],
      action1: ['setGlobal', 91]
    }, 6, function (G2) { G2.justBuilt.player.struct = 'power'; });
  });
  S.eq('an `and` whose second condition is never met does not fire', latchRes.fired, 0);

  var latchLate = await g.page.evaluate(function () {
    window._SC.quiet();
    var G = window._rtsG;
    G.sides.player.credits = 0;
    G.globals = {};
    RTS_TRIGGERS.push({
      name: '_t_latch2', house: 'player', persist: 'volatile', control: 'and',
      event1: ['build', 'power'], event2: ['credits', 4000],
      action1: ['setGlobal', 92]
    });
    var inst = _rtsTrigFindOrMake('_t_latch2');
    /* frame 1: the build, and nothing else */
    G.justBuilt.player.struct = 'power';
    _rtsTick(1 / 60);
    var trippedAfterBuild = inst.td1.tripped;
    var firedAfterBuild = inst.fired;
    var buildGone = G.justBuilt.player.struct;
    /* three seconds of nothing at all, with the build long forgotten */
    for (var i = 0; i < 180; i++) _rtsTick(1 / 60);
    var firedWhilePoor = inst.fired;
    /* now the money arrives - the second condition, minutes after the first in game terms */
    G.sides.player.credits = 9000;
    for (var j = 0; j < 30; j++) _rtsTick(1 / 60);
    var firedAfterMoney = inst.fired;
    var globalSet = !!G.globals[92];
    var stillThere = !!G.trig['_t_latch2'];
    if (G.trig['_t_latch2']) delete G.trig['_t_latch2'];
    var ix = RTS_TRIGGERS.findIndex(function (t) { return t.name === '_t_latch2'; });
    if (ix >= 0) RTS_TRIGGERS.splice(ix, 1);
    return { trippedAfterBuild: trippedAfterBuild, firedAfterBuild: firedAfterBuild,
             buildGone: buildGone, firedWhilePoor: firedWhilePoor,
             firedAfterMoney: firedAfterMoney, globalSet: globalSet, stillThere: stillThere };
  });
  S.eq('a build event is true for one frame and then forgotten', latchLate.buildGone, null);
  S.eq('...but the trigger latched it', latchLate.trippedAfterBuild, true);
  S.eq('...and did not fire on it alone', latchLate.firedAfterBuild, 0);
  S.eq('...nor over the three seconds that followed', latchLate.firedWhilePoor, 0);
  S.eq('...and fires once the SECOND condition arrives, long after the first is gone',
       latchLate.firedAfterMoney, 1);
  S.eq('...having run its action', latchLate.globalSet, true);

  /* ------------------------------------------------------------- persistence ----
     "volatile (fires once, deletes itself) | persistent (resets its events and repeats)". */
  var persist = await g.page.evaluate(function () {
    window._SC.quiet();
    var G = window._rtsG;
    G.globals = {};
    G.sides.player.credits = 9000;
    var vol = window._SC.run({
      name: '_t_vol', house: 'player', persist: 'volatile', control: 'only',
      event1: ['credits', 100], action1: ['setGlobal', 93]
    }, 3);
    G.globals = {};
    var per = window._SC.run({
      name: '_t_per', house: 'player', persist: 'persistent', control: 'only',
      event1: ['credits', 100], action1: ['setGlobal', 94]
    }, 3);
    return { vol: vol, per: per };
  });
  S.eq('a volatile trigger fires exactly once', persist.vol.fired, 1);
  S.eq('...and deletes itself', persist.vol.alive, false);
  S.ok('a persistent trigger fires repeatedly while its condition holds', persist.per.fired > 5,
       persist.per.fired + ' firings in 3s');
  S.eq('...and is still there afterwards', persist.per.alive, true);

  /* --------------------------------------------------- a failed action re-arms ----
     TRIGGER.CPP: "If at least one action was performed, then consider this trigger to have
     completed." An action that reports failure leaves the trigger armed to try again - which
     is what makes the message rate-limit a DELAY rather than a lost message. */
  var rearm = await g.page.evaluate(async function () {
    window._SC.quiet();
    var G = window._rtsG;
    G.msgSaid = {};
    G.sides.player.credits = 9000;
    RTS_TRIGGERS.push({
      name: '_t_msg', house: 'player', persist: 'persistent', control: 'only',
      event1: ['credits', 100], action1: ['text', 'SCENARIO SPEC MESSAGE']
    });
    var inst = _rtsTrigFindOrMake('_t_msg');
    _rtsTick(1 / 60);
    var first = inst.fired;
    /* well inside RTS_MESSAGE_DELAY: the action refuses, so the trigger must NOT count it */
    for (var i = 0; i < 60 * (RTS_MESSAGE_DELAY - 5); i++) _rtsTick(1 / 60);
    var during = inst.fired;
    var aliveDuring = !!G.trig['_t_msg'];
    /* past the delay it must land, not be lost */
    for (var j = 0; j < 60 * 8; j++) _rtsTick(1 / 60);
    var after = inst.fired;
    delete G.trig['_t_msg'];
    var ix = RTS_TRIGGERS.findIndex(function (t) { return t.name === '_t_msg'; });
    if (ix >= 0) RTS_TRIGGERS.splice(ix, 1);
    return { first: first, during: during, after: after, aliveDuring: aliveDuring,
             delay: RTS_MESSAGE_DELAY };
  });
  S.eq('a text action fires the first time', rearm.first, 1);
  S.eq('...and is refused while the same message is still fresh', rearm.during, 1);
  S.eq('...leaving the trigger armed rather than spent', rearm.aliveDuring, true);
  S.ok('...so the repeat lands once the delay is up rather than being lost',
       rearm.after > rearm.first, rearm.first + ' -> ' + rearm.after +
       ' firings across the ' + rearm.delay + 's guard');

  /* ------------------------------------------------- which house an event reads ----
     TEVENT.CPP does two separate lookups: the trigger's OWNER for credits and losses, the
     event's ARGUMENT house for low-power, discovery and the *_DESTROYED family. rts.core.js:
     "Conflating them points 'all units destroyed' at the wrong side." So the test puts the two
     houses in OPPOSITE states and checks which one the event answered about. */
  var who = await g.page.evaluate(function () {
    window._SC.quiet();
    var G = window._rtsG;
    G.globals = {};
    /* the player keeps units; the enemy loses all of them */
    var killed = 0;
    G.ents.forEach(function (e) {
      if (!e.dead && e.side === 'enemy' && e.type === 'unit') { e.dead = true; killed++; }
    });
    var playerUnits = G.ents.filter(function (e) { return !e.dead && e.side === 'player' && e.type === 'unit'; }).length;
    /* owned by the PLAYER, but asking about the ENEMY */
    var aboutEnemy = window._SC.run({
      name: '_t_who1', house: 'player', persist: 'volatile', control: 'only',
      event1: ['unitsDestroyed', 'enemy'], action1: ['setGlobal', 95]
    }, 1);
    /* owned by the player, asking about the PLAYER, who still has units - must NOT fire */
    var aboutPlayer = window._SC.run({
      name: '_t_who2', house: 'player', persist: 'volatile', control: 'only',
      event1: ['unitsDestroyed', 'player'], action1: ['setGlobal', 96]
    }, 1);
    return { killed: killed, playerUnits: playerUnits,
             aboutEnemy: aboutEnemy.fired, aboutPlayer: aboutPlayer.fired };
  });
  S.ok('the two houses are genuinely in opposite states', who.killed > 0 && who.playerUnits > 0,
       who.killed + ' enemy units killed, ' + who.playerUnits + ' player units still alive');
  S.eq('an event with an argument house reads THAT house', who.aboutEnemy, 1);
  S.eq('...and not the trigger\'s owner', who.aboutPlayer, 0);

  /* ------------------------------------------------ forcing and destroying ----
     "A forced trigger will force an existing trigger of that type ... and then force it to be
     sprung", bypassing EventControl entirely. The target's own condition is deliberately one
     that cannot be true, so a firing can only have come from the force. */
  var chain = await g.page.evaluate(function () {
    window._SC.quiet();
    var G = window._rtsG;
    G.globals = {};
    G.sides.player.credits = 9000;
    RTS_TRIGGERS.push({
      name: '_t_target', house: 'player', persist: 'volatile', control: 'only',
      event1: ['credits', 99999999], action1: ['setGlobal', 97]
    });
    var target = _rtsTrigFindOrMake('_t_target');
    /* on its own it can never fire */
    for (var i = 0; i < 60; i++) _rtsTick(1 / 60);
    var aloneFired = target.fired;

    var forced = window._SC.run({
      name: '_t_forcer', house: 'player', persist: 'volatile', control: 'only',
      event1: ['credits', 100], action1: ['forceTrigger', '_t_target']
    }, 1);
    var targetFired = G.trig['_t_target'] ? G.trig['_t_target'].fired : target.fired;
    var targetGone = !G.trig['_t_target'];
    var globalSet = !!G.globals[97];

    /* The stronger form: a trigger that needs BOTH of two conditions, neither of which is
       true, forced anyway. "Forced triggers ... bypass EventControl entirely - a chained
       trigger does not re-check its own conditions." */
    RTS_TRIGGERS.push({
      name: '_t_and', house: 'player', persist: 'volatile', control: 'and',
      event1: ['credits', 99999999], event2: ['nBuildingsLost', 99999],
      action1: ['setGlobal', 101]
    });
    var andTarget = _rtsTrigFindOrMake('_t_and');
    for (var k = 0; k < 60; k++) _rtsTick(1 / 60);
    var andAlone = andTarget.fired;
    window._SC.run({
      name: '_t_andforcer', house: 'player', persist: 'volatile', control: 'only',
      event1: ['credits', 100], action1: ['forceTrigger', '_t_and']
    }, 1);
    var andForced = !!G.globals[101];

    /* and destroying one removes it outright */
    RTS_TRIGGERS.push({
      name: '_t_victim', house: 'player', persist: 'persistent', control: 'only',
      event1: ['credits', 99999999], action1: ['setGlobal', 98]
    });
    _rtsTrigFindOrMake('_t_victim');
    var victimBefore = !!G.trig['_t_victim'];
    window._SC.run({
      name: '_t_killer', house: 'player', persist: 'volatile', control: 'only',
      event1: ['credits', 100], action1: ['destroyTrigger', '_t_victim']
    }, 1);
    var victimAfter = !!G.trig['_t_victim'];

    ['_t_target', '_t_victim', '_t_and'].forEach(function (n) {
      if (G.trig[n]) delete G.trig[n];
      var ix = RTS_TRIGGERS.findIndex(function (t) { return t.name === n; });
      if (ix >= 0) RTS_TRIGGERS.splice(ix, 1);
    });
    return { aloneFired: aloneFired, forcedFired: forced.fired, targetFired: targetFired,
             targetGone: targetGone, globalSet: globalSet,
             andAlone: andAlone, andForced: andForced,
             victimBefore: victimBefore, victimAfter: victimAfter };
  });
  S.eq('a trigger whose condition cannot be met does not fire on its own', chain.aloneFired, 0);
  S.eq('the forcing trigger fires', chain.forcedFired, 1);
  S.eq('...and springs the other one regardless of its own condition', chain.globalSet, true);
  S.eq('...which, being volatile, then deletes itself', chain.targetGone, true);
  S.eq('a trigger needing two impossible conditions does not fire by itself', chain.andAlone, 0);
  S.eq('...but forcing it runs its action anyway, without either condition being met',
       chain.andForced, true);
  /* What is NOT established here, so nobody reads more into it than it says: Spring's
     `if (forced) exec = true` shortcut is not independently observable. Deleting it leaves
     every assertion in this spec passing, because `forced` is also handed down into
     _rtsTEvent, which trips the latch and returns true for either slot regardless. The
     shortcut is faithfulness to TRIGGER.CPP rather than behaviour a test can pin down; what
     IS pinned down is the guarantee above, that a forced trigger acts without its conditions. */
  S.eq('a trigger exists before it is destroyed', chain.victimBefore, true);
  S.eq('...and destroyTrigger removes it', chain.victimAfter, false);

  /* ------------------------------------------------------- the mission timer ----
     TACTION.CPP: "if (MissionTimer <= value) MissionTimer = 0" - subtracting past zero clamps,
     it does not wrap into a negative that would never expire. */
  var timer = await g.page.evaluate(function () {
    window._SC.quiet();
    var G = window._rtsG;
    G.globals = {};
    G.mtimer = { active: false, t: 0 };
    G.sides.player.credits = 9000;
    var inst = _rtsTrigFindOrMake('_t_dummy') || null;
    /* set, add, subtract past zero */
    _rtsTAction({ type: { house: 'player' } }, ['setTimer', 10], null, null);
    var afterSet = G.mtimer.t, active = G.mtimer.active;
    _rtsTAction({ type: { house: 'player' } }, ['addTimer', 5], null, null);
    var afterAdd = G.mtimer.t;
    _rtsTAction({ type: { house: 'player' } }, ['subTimer', 9999], null, null);
    var afterSub = G.mtimer.t;
    /* an expired timer is what timerExpired reads */
    var expired = window._SC.run({
      name: '_t_exp', house: 'player', persist: 'volatile', control: 'only',
      event1: ['timerExpired', 0], action1: ['setGlobal', 99]
    }, 1);
    /* and a running one is not expired */
    G.mtimer = { active: true, t: 600 };
    var notYet = window._SC.run({
      name: '_t_exp2', house: 'player', persist: 'volatile', control: 'only',
      event1: ['timerExpired', 0], action1: ['setGlobal', 100]
    }, 1);
    return { afterSet: afterSet, active: active, afterAdd: afterAdd, afterSub: afterSub,
             tick: RTS_TIMER_TICK, expired: expired.fired, notYet: notYet.fired };
  });
  S.eq('setTimer takes its argument in tenths of a minute', timer.afterSet, 10 * timer.tick);
  S.eq('...and starts the timer', timer.active, true);
  S.eq('addTimer adds in the same unit', timer.afterAdd, 15 * timer.tick);
  S.eq('subTimer clamps at zero rather than going negative', timer.afterSub, 0);
  S.eq('an expired timer fires timerExpired', timer.expired, 1);
  S.eq('...and a running one does not', timer.notYet, 0);

  /* ------------------------------------------------------------------ globals ---- */
  var globals = await g.page.evaluate(function () {
    window._SC.quiet();
    var G = window._rtsG;
    G.globals = {};
    G.sides.player.credits = 9000;
    var clearFires = window._SC.run({
      name: '_t_gc', house: 'player', persist: 'volatile', control: 'only',
      event1: ['globalClear', 7], action1: ['setGlobal', 7]
    }, 1);
    var nowSet = !!G.globals[7];
    /* with it set, globalClear must stop firing and globalSet must start */
    var setFires = window._SC.run({
      name: '_t_gs', house: 'player', persist: 'volatile', control: 'only',
      event1: ['globalSet', 7], action1: ['setGlobal', 8]
    }, 1);
    var clearAgain = window._SC.run({
      name: '_t_gc2', house: 'player', persist: 'volatile', control: 'only',
      event1: ['globalClear', 7], action1: ['setGlobal', 9]
    }, 1);
    return { clearFires: clearFires.fired, nowSet: nowSet,
             setFires: setFires.fired, clearAgain: clearAgain.fired };
  });
  S.eq('globalClear is true for a global nobody has set', globals.clearFires, 1);
  S.eq('...and setGlobal sets it', globals.nowSet, true);
  S.eq('...after which globalSet reads true', globals.setFires, 1);
  S.eq('...and globalClear no longer fires', globals.clearAgain, 0);

  /* ================================================ the team autocreate split ====
     rts.rules.js: "the original's filter is a hard SPLIT, not a preference: an alerted house
     draws only from autocreate types, an unalerted house only from the rest."

     A preference and a split look identical for as long as both halves are eligible, so the
     only way to tell them apart is to ask an unalerted house many times and check that no
     alerted type EVER comes back. */
  var split = await g.page.evaluate(function () {
    var G = window._rtsG;
    function sample(alerted) {
      /* _rtsHouseAlerted reads the wave count, the last hit and the clock */
      G.ai.wave = alerted ? 1 : 0;
      G.ai.lastHit = alerted ? G.t : null;
      var savedT = G.t;
      if (!alerted) G.t = 0;                     /* below RTS_ALERT_TIME's backstop */
      var got = {}, n = 0;
      for (var i = 0; i < 200; i++) {
        for (var tid in G.teams) delete G.teams[tid];   /* nothing already raised */
        G.teamHold = {};
        var ty = _rtsSuggestTeam(999);
        if (ty) { got[ty.name] = (got[ty.name] || 0) + 1; n++; }
      }
      G.t = savedT;
      return { got: got, n: n, alertedNow: _rtsHouseAlerted() };
    }
    var quiet = sample(false);
    var loud = sample(true);
    var early = RTS_TEAM_TYPES.filter(function (t) { return !t.autocreate; }).map(function (t) { return t.name; });
    var late = RTS_TEAM_TYPES.filter(function (t) { return !!t.autocreate; }).map(function (t) { return t.name; });
    return { quiet: quiet, loud: loud, early: early, late: late };
  });
  S.eq('an unalerted house is reported as unalerted', split.quiet.alertedNow, false);
  S.eq('...and an alerted one as alerted', split.loud.alertedNow, true);
  S.ok('an unalerted house is offered teams at all', split.quiet.n > 0,
       split.quiet.n + ' of 200 suggestions produced a type');
  S.ok('...and every one of them is a pre-alert type, never a post-alert one',
       Object.keys(split.quiet.got).every(function (n) { return split.early.indexOf(n) >= 0; }),
       'suggested: ' + Object.keys(split.quiet.got).join(', ') + '   (pre-alert set: ' + split.early.join(', ') + ')');
  S.ok('an alerted house is offered teams', split.loud.n > 0,
       split.loud.n + ' of 200 suggestions produced a type');
  S.ok('...and every one of them is a post-alert type, never a pre-alert one',
       Object.keys(split.loud.got).every(function (n) { return split.late.indexOf(n) >= 0; }),
       'suggested: ' + Object.keys(split.loud.got).join(', ') + '   (post-alert set: ' + split.late.join(', ') + ')');
  S.ok('...and the two halves really are different sets',
       Object.keys(split.quiet.got).length > 0 && Object.keys(split.loud.got).length > 0 &&
       !Object.keys(split.quiet.got).some(function (n) { return split.loud.got[n]; }),
       'no type appears on both sides of the alert');

  /* ------------------------------------------------- a mission script that loops ----
     TMISSION_LOOP jumps to a line of the team's own list. A team that reaches the end of its
     script and loops is the difference between an opponent that keeps coming and one that
     raises an army and then stands still. */
  var loop = await g.page.evaluate(function () {
    var G = window._rtsG;
    var ty = RTS_TEAM_TYPES.filter(function (t) {
      return t.missions && t.missions.some(function (m) { return m[0] === 'loop'; });
    })[0];
    if (!ty) return { error: 'no team type has a loop' };
    var li = ty.missions.map(function (m) { return m[0]; }).indexOf('loop');
    var target = ty.missions[li][1] | 0;
    var t = _rtsTeamMake(ty);
    t.cur = li;
    /* the loop line itself must not be where the team stays */
    _rtsTeamDoMission(t, 1 / 60);
    var after = t.cur;
    _rtsTeamDisband(t);
    return { type: ty.name, loopAt: li, target: target, after: after, len: ty.missions.length };
  });
  S.ok('a team type with a loop exists to test', !loop.error, loop.error || loop.type);
  if (!loop.error) {
    S.eq('reaching the loop line jumps to the line it names', loop.after, loop.target);
    S.ok('...which is not the loop line itself, so the script keeps moving',
         loop.after !== loop.loopAt,
         loop.type + ': loop at line ' + loop.loopAt + ' of ' + loop.len + ' jumps to ' + loop.after);
  }

  S.ok('the page logged no errors throughout', !g.errors.length,
       g.errors.slice(0, 3).join(' | ') || 'clean');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})();
