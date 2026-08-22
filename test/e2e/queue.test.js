/* A PRODUCTION LINE HOLDS A QUEUE, NOT ONE ITEM.

   Reported by a player as "why can't I queue more than 1 at a time if I have the available
   credits", and the answer was that credits had nothing to do with it: S.q[cat] was a single
   object and _rtsCanQueue opened with `if (S.q[cat]) return false`. A treasury of fifty
   thousand refused the second tank exactly as hard as a treasury of ten.

   The code justified that as "one queue per category, which is right for the PLAYER - the
   classic sidebar works exactly that way". Half true, and the wrong half: RA does show one
   LINE per category, but the line holds a stack of the same item - that is what the number on
   the cameo counts. Ours went idle after every unit, so an economy that could run a war
   factory flat out could only do it if you sat and watched the sidebar.

   WHAT IS GRADED:

   - stacking works, and the stack actually DELIVERS - three taps, three tanks, not one tank
     and two forgotten clicks.
   - money is taken for the head only. A deep queue must not charge for units that have not
     started, or queuing is a way to lose credits to a line you later cancel.
   - cancelling takes one off the BACK. The bug this prevents is a nearly-finished tank being
     destroyed because the player changed their mind about the fifth one.
   - a one-at-a-time unit cannot be stacked past its cap.
   - a structure line still does not stack: there is a single placement cursor.
   - it survives a save and a load, because the queue is state and the save encodes G
     generically - which is exactly the kind of thing that works by accident until it doesn't.
   - and the CONTROL: a different item on a busy line is still refused, so "stacking" has not
     quietly become "queue anything anywhere". */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('queue');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 1100, height: 800, dpr: 1 });
  await g.start(7, 20, {});
  await g.freeze();

  var out = await g.page.evaluate(function () {
    var o = {}, G = window._rtsG, P = G.sides.player;
    o.cap = RTS_QUEUE_MAX;

    /* THE PREREQUISITE, PLACED RATHER THAN HOPED FOR. Twenty seconds into a match the player
       has no War Factory, so every _rtsQueue below returned false and the first read of the
       line dereferenced null - a spec failing on the setup rather than on the claim. Published
       on window so the later evaluate blocks can put a base back after they reload a save. */
    window._rtsGiveProducers = function () {
      var yard = _rtsHas('player', 'yard'), want = ['factory', 'barracks', 'helipad'];
      for (var w = 0; w < want.length; w++) {
        if (_rtsHas('player', want[w])) continue;
        var d = rtsStructDef(want[w]), done = false;
        for (var rad = 3; rad <= 16 && !done; rad++)
          for (var dx = -rad; dx <= rad && !done; dx++)
            for (var dz = -rad; dz <= rad && !done; dz++) {
              var tx = _rtsTX(yard.x) + dx, tz = _rtsTX(yard.z) + dz;
              if (_rtsCanPlace('player', want[w], tx, tz, true)) {
                _rtsPlaceStruct('player', want[w], tx, tz, true, 0); done = true;
              }
            }
      }
    };
    /* A FRESH, FUNDED BASE, and every block below starts from one. The blocks share a page,
       and the first of them runs four hundred simulated seconds with the opponent attacking -
       so by the time the later ones ran, the War Factory they needed had been destroyed and
       every _rtsQueue refused on prerequisites. A spec whose setup depends on surviving the
       previous spec's battle is a spec that fails for reasons that are not the claim. */
    window._rtsFreshBase = function () {
      _rtsNewGame(7, 'easy');
      var U = window._rtsUI;
      if (U) { U.dead = true; try { if (U.raf) cancelAnimationFrame(U.raf); } catch (e) {} }
      window._rtsGiveProducers();
      var P2 = window._rtsG.sides.player;
      /* WITHIN STORAGE CAPACITY: anything above it spills on the next tick
         (_rtsTickStorage), which silently eats both the funding and any refund landing on a
         full bank - measured once as "20000 credits for 3 x 800". */
      P2.ore = Math.max(0, rtsCapacity('player') * 0.5);
      return P2;
    };
    P = window._rtsFreshBase(); G = window._rtsG;
    o.haveFactory = !!_rtsHas('player', 'factory');
    /* rtsMoney, not P.ore - that is the figure _rtsCanQueue actually consults, and reading
       the raw field reported "not enough credits" on a base that queued three tanks fine. */
    o.funded = rtsMoney(P) >= _rtsCostOf('player', rtsUnitDef('tank'));

    /* three taps on the same cameo */
    /* `true` is the opt-in: _rtsQueue(side, key) still refuses a busy line, because the
       opponent's buy loop calls it every pass and would otherwise stack its own dice rolls -
       see the note on _rtsCanQueue. The sidebar passes it for a deliberate second tap. */
    o.q1 = _rtsQueue('player', 'tank', true);
    o.q2 = _rtsQueue('player', 'tank', true);
    o.q3 = _rtsQueue('player', 'tank', true);
    o.aiCallRefused = !_rtsQueue('player', 'tank');   /* the default is unchanged */
    o.depth = P.q.vehicle ? 1 + (P.q.vehicle.n || 0) : 0;

    /* the money check: only the head has a balance, the stack has cost nothing */
    o.headPaid = Math.round(P.q.vehicle.paid);

    /* a DIFFERENT item on the same busy line is still refused (control) */
    o.otherRefused = !_rtsQueue('player', 'light', true);

    /* run it out and count what actually arrived.

       SPEND IS SUMMED FROM THE JOBS, not from the treasury. The first version of this took a
       before/after of P.ore and reported 20000 spent on three 800-credit tanks - because ore
       above storage capacity SPILLS on the next tick, so most of that delta was the bank
       overflowing rather than the factory being paid. Watching each job's own `paid` as it
       leaves the line is immune to income, to spill, and to anything else touching the purse. */
    var before = G.ents.filter(function (e) {
      return !e.dead && e.type === 'unit' && e.def === 'tank' && e.side === 'player'; }).length;
    var spent = 0, head = P.q.vehicle;
    for (var t = 0; t < 60 * 400 && (P.q.vehicle || head); t++) {
      _rtsTick(1 / 60);
      if (P.q.vehicle !== head) {                 /* the job finished and was replaced */
        if (head) spent += head.paid;
        head = P.q.vehicle;
      }
    }
    o.delivered = G.ents.filter(function (e) {
      return !e.dead && e.type === 'unit' && e.def === 'tank' && e.side === 'player'; }).length - before;
    o.lineEmpty = !P.q.vehicle;
    o.spent = Math.round(spent);
    o.unitPrice = Math.round(_rtsCostOf('player', rtsUnitDef('tank')));
    return o;
  });

  /* cancelling takes one off the back, and the head survives it */
  Object.assign(out, await g.page.evaluate(function () {
    var o = {}, P = window._rtsFreshBase(), G = window._rtsG;
    _rtsQueue('player', 'tank', true); _rtsQueue('player', 'tank', true); _rtsQueue('player', 'tank', true);
    for (var t = 0; t < 120; t++) _rtsTick(1 / 60);      /* let the head make progress */
    var progBefore = P.q.vehicle.prog, paidBefore = P.q.vehicle.paid;
    o.beforeDepth = 1 + (P.q.vehicle.n || 0);
    _rtsCancel('player', 'vehicle');
    o.afterDepth = P.q.vehicle ? 1 + (P.q.vehicle.n || 0) : 0;
    o.headSurvived = !!P.q.vehicle && P.q.vehicle.prog === progBefore &&
                     P.q.vehicle.paid === paidBefore;
    /* ...and cancelling down past the head does refund it */
    _rtsCancel('player', 'vehicle');
    /* EMPTIED FIRST, so the refund has somewhere to land, and read through rtsMoney rather
       than off a field. Two things bit here in turn: harvesting had refilled the bank to
       capacity so the grant spilled straight back out, and then - with the bank emptied - the
       assertion still read zero because money is `credits + ore` and _rtsGrant pays into
       CREDITS. The refund was correct both times; the measurement was looking at the wrong
       half of the purse. */
    P.ore = 0; P.credits = 0;
    o.headPaidAtCancel = Math.round(P.q.vehicle ? P.q.vehicle.paid : 0);
    _rtsCancel('player', 'vehicle');
    o.refund = Math.round(rtsMoney(P));
    o.headRefunded = o.refund >= o.headPaidAtCancel && o.refund > 0;
    o.lineGone = !P.q.vehicle;
    return o;
  }));

  /* the one-at-a-time cap, a structure line, and a save round trip */
  Object.assign(out, await g.page.evaluate(function () {
    var o = {}, P = window._rtsFreshBase(), G = window._rtsG;
    /* give the player everything, so `only` is the only thing that can refuse */
    var cmd = null, i;
    for (i = 0; i < RTS_UNITS.length; i++) if (RTS_UNITS[i].only) { cmd = RTS_UNITS[i]; break; }
    o.cmdKey = cmd ? cmd.key : null;
    if (cmd) {
      var need = _rtsWhyLocked('player', cmd.key);
      o.cmdBuildable = !need;
      if (!need) {
        _rtsQueue('player', cmd.key);
        o.cmdStackRefused = !_rtsQueue('player', cmd.key, true);
        _rtsCancelAll('player', _rtsQueueCat(cmd.key));
      }
    }
    /* a structure line does not stack - one placement cursor */
    _rtsQueue('player', 'power');
    o.structDepth = P.q.struct ? 1 + (P.q.struct.n || 0) : 0;
    o.structStackRefused = !_rtsQueue('player', 'power', true);
    _rtsCancelAll('player', 'struct');

    /* SAVE ROUND TRIP: the queue is state, and the save encodes G generically */
    P = window._rtsFreshBase(); G = window._rtsG;
    _rtsQueue('player', 'tank', true); _rtsQueue('player', 'tank', true); _rtsQueue('player', 'tank', true);
    o.savedDepth = 1 + (P.q.vehicle.n || 0);
    var blob = JSON.stringify(_rtsSaveState(G));
    _rtsNewGame(999, 'easy');
    _rtsApplyState(window._rtsG, JSON.parse(blob));
    var Q = window._rtsG.sides.player.q.vehicle;
    o.loadedDepth = Q ? 1 + (Q.n || 0) : 0;
    return o;
  }));

  var errs = g.errors.filter(function (e) { return !/ServiceWorker/.test(e); });
  await g.close();
  await browser.close();

  S.ok('a funded base with a War Factory was set up', out.haveFactory && out.funded,
       (out.haveFactory ? 'factory placed' : 'NO FACTORY') + ', ' +
       (out.funded ? 'and enough credits for a tank' : 'but not enough credits'));
  S.ok('three taps stack on one line', out.q1 && out.q2 && out.q3 && out.depth === 3,
       'queue depth ' + out.depth + ' of a ' + out.cap + ' cap');
  S.ok('the default call still refuses a busy line, so the opponent cannot stack its dice',
       out.aiCallRefused,
       out.aiCallRefused ? '_rtsQueue(side, key) unchanged for every existing caller'
                         : 'STACKS BY DEFAULT - core/ai.js queues every pass and would pile up');
  S.ok('...and a different item on a busy line is still refused (control)', out.otherRefused,
       out.otherRefused ? 'a Light Tank cannot jump onto the line a Battle Tank owns'
                        : 'accepted - stacking has become queue-anything');
  S.ok('nothing is charged for a copy that has not started', out.headPaid === 0,
       'the head had paid ' + out.headPaid + ' credits at the moment three were queued');
  S.ok('THE STACK DELIVERS: three queued, three built', out.delivered === 3 && out.lineEmpty,
       out.delivered + ' tanks arrived and the line ' + (out.lineEmpty ? 'emptied' : 'is STUCK'));
  S.ok('...and the money spent is three units, not one', out.spent >= out.unitPrice * 3 - 2 &&
       out.spent <= out.unitPrice * 3 + 2,
       out.spent + ' credits for 3 x ' + out.unitPrice);

  S.ok('cancelling takes one off the BACK, leaving the job in progress alone',
       out.beforeDepth === 3 && out.afterDepth === 2 && out.headSurvived,
       'depth ' + out.beforeDepth + ' -> ' + out.afterDepth +
       ', the running job ' + (out.headSurvived ? 'kept its progress and its money'
                                                : 'WAS DESTROYED by cancelling a queued copy'));
  S.ok('...and cancelling past the stack does refund the head', out.headRefunded && out.lineGone,
       'the running job had paid ' + out.headPaidAtCancel + ' and ' + out.refund +
       ' came back' + (out.lineGone ? ', line cleared' : ' but the line is STILL THERE'));

  if (out.cmdKey && out.cmdBuildable) {
    S.ok('a one-at-a-time unit cannot be stacked past its cap', out.cmdStackRefused,
         out.cmdKey + ' refused a second copy on the line');
  }
  S.ok('a structure line does not stack (one placement cursor)',
       out.structDepth === 1 && out.structStackRefused,
       'depth ' + out.structDepth + ', a second ' + (out.structStackRefused ? 'refused' : 'ACCEPTED'));
  S.ok('the queue survives a save and a load', out.loadedDepth === out.savedDepth,
       'saved at depth ' + out.savedDepth + ', loaded at ' + out.loadedDepth);
  S.ok('no page errors', !errs.length, errs.join(' | ') || 'none');
  require('../lib/report.js')(S);
})();
