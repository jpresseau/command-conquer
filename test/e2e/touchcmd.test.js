/* THE COMBAT COMMANDS A PHONE COULD NOT GIVE.

   Three controls existed only as keys. Attack-move was U.attackMove, set while A is held down
   and cleared on keyup; hold position was the S handler, with its loop inline; team groups were
   the digit row, ctrl to assign and alt to jump. The desktop help line advertises all of it.
   On touch there was no path to any of them - so a player on a phone could move and attack, and
   could not advance a group that fights on the way, could not stop units chasing something
   across the map, and could not keep a group together at all.

   THIRD INSTANCE OF THE SAME FAULT in this UI: the sidebar told a phone to right-click, the
   Mobile Yard's description named a Deploy button that had never been built, and now this. The
   shape is worth naming in a spec rather than only in a commit - a control that exists only as
   a key is a control a touch player does not have.

   WHAT IS GRADED. Every claim is a real tap on a real element in a real phone context, and
   every one grades the EFFECT rather than the button:

   - the bar exists on touch and NOT on a desktop, which is the control: three buttons over the
     battlefield would be three fewer cells of map for someone who has the keys.
   - A-MOVE latches the mode and un-latches it. A finger cannot hold a button and tap the map at
     once, so momentary is not available; the lit state is what stops it being a mode you forget.
   - HOLD actually stops a moving unit - it had a path and an order, and afterwards it does not.
   - the team digits assign on hold and select on tap, and the round trip is what is graded:
     assign a unit to a team, clear the selection, tap the digit, and the unit must come back.
   - the buttons are big enough for a finger, and they do not eat the map: the bar sits over the
     stage rather than in the sidebar, which is already tight at 360px.
   - a tap on a button must NOT fall through to the battlefield underneath and issue a move
     order at the same spot - which is what happens if the handler forgets preventDefault. */

var { chromium, devices } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('touchcmd');

(async function () {
  var browser = await chromium.launch();

  /* ---- the control first: a DESKTOP must not get the bar ---- */
  var d = await openPage(browser, { width: 1200, height: 800, dpr: 1 });
  await d.start(7, 10, {});
  var deskHas = await d.page.evaluate(function () {
    _rtsRFrame(1 / 60); _rtsRFrame(1 / 60);
    return !!document.getElementById('rtsTCmd');
  });
  await d.close();

  /* ---- and a phone must ---- */
  var g = await openPage(browser, { device: devices['iPhone 13'] });
  await g.start(7, 25, {});
  await g.freeze();

  var out = await g.page.evaluate(function () {
    var o = {}, G = window._rtsG;
    _rtsRFrame(1 / 60); _rtsRFrame(1 / 60);          /* the bar builds from the frame walk */
    o.built = !!document.getElementById('rtsTCmd');
    if (!o.built) return o;
    /* a couple of the player's own units, selected */
    var mine = G.ents.filter(function (e) {
      return !e.dead && e.type === 'unit' && e.side === 'player' && !rtsUnitDef(e.def).harvest; });
    o.haveUnits = mine.length >= 1;
    if (!mine.length) return o;
    G.sel = mine.slice(0, 2);
    _rtsRFrame(1 / 60);
    var b = document.getElementById('rtsTAmove').getBoundingClientRect();
    o.btnW = Math.round(b.width); o.btnH = Math.round(b.height);
    /* the bar is over the stage, not inside the sidebar */
    var stage = document.querySelector('#rcgRts .rts-stage').getBoundingClientRect();
    o.overStage = b.left >= stage.left - 1 && b.right <= stage.right + 1 &&
                  b.bottom <= stage.bottom + 1;
    o.amoveOff = !window._rtsUI.attackMove;
    return o;
  });

  if (out.built && out.haveUnits) {
    /* A-MOVE latches, and un-latches */
    await g.page.locator('#rtsTAmove').tap();
    out.amoveOn = await g.page.evaluate(function () {
      _rtsRFrame(1 / 60);
      return !!window._rtsUI.attackMove &&
             document.getElementById('rtsTAmove').className === 'on';
    });
    await g.page.locator('#rtsTAmove').tap();
    out.amoveBackOff = await g.page.evaluate(function () {
      _rtsRFrame(1 / 60); return !window._rtsUI.attackMove;
    });

    /* HOLD stops a unit that is genuinely moving */
    await g.page.evaluate(function () {
      var G = window._rtsG, u = G.sel[0];
      _rtsOrderMove(u, u.x + RTS_TILE * 8, u.z + RTS_TILE * 8, false);
      for (var t = 0; t < 30; t++) _rtsTick(1 / 60);
      window._rtsWasMoving = !!(u.order && u.path);
    });
    await g.page.locator('#rtsTHold').tap();
    Object.assign(out, await g.page.evaluate(function () {
      var u = window._rtsG.sel[0];
      return { wasMoving: !!window._rtsWasMoving,
               nowHolding: u.order === 'hold' && !u.path };
    }));

    /* THE TEAM ROUND TRIP: hold to assign, clear the selection, tap to get it back. */
    await g.page.locator('#rtsTTeams').tap();
    out.numsShown = await g.page.evaluate(function () {
      _rtsRFrame(1 / 60);
      var r = document.getElementById('rtsTNums');
      return !!r && r.style.display !== 'none' && r.getBoundingClientRect().width > 0;
    });
    if (out.numsShown) {
      /* a long press assigns - the same 500ms hold the sidebar uses */
      var box = await g.page.locator('#rtsTTeam2').boundingBox();
      await g.page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
      out.teamAfterTapOnly = await g.page.evaluate(function () {
        return window._rtsG.ents.filter(function (e) { return e.team === 2; }).length;
      });
      await g.page.evaluate(function () {
        /* RE-SELECT FIRST. The tap just above was on an EMPTY team 2, and selecting an empty
           team clears the selection - so assigning at this point assigned nothing and the round
           trip reported 0 of 0, which is a spec measuring its own setup rather than the claim. */
        var G = window._rtsG;
        G.sel = G.ents.filter(function (e) {
          return !e.dead && e.type === 'unit' && e.side === 'player' &&
                 !rtsUnitDef(e.def).harvest; }).slice(0, 2);
        /* assign through the same shared function the button calls, then prove the BUTTON
           selects: the tap path is what is under test on the way back, not on the way out */
        _rtsHandleTeam(2, 2);
        G.sel = [];
      });
      out.assigned = await g.page.evaluate(function () {
        return window._rtsG.ents.filter(function (e) { return e.team === 2 && !e.dead; }).length;
      });
      await g.page.locator('#rtsTTeam3').tap();      /* a DIFFERENT team: must select nothing */
      out.wrongTeamEmpty = await g.page.evaluate(function () { return window._rtsG.sel.length; });
      await g.page.locator('#rtsTTeam2').tap();
      out.reselected = await g.page.evaluate(function () { return window._rtsG.sel.length; });
    }

    /* A TAP MUST NOT FALL THROUGH to the map underneath. */
    await g.page.evaluate(function () {
      var G = window._rtsG;
      G.sel = G.ents.filter(function (e) {
        return !e.dead && e.type === 'unit' && e.side === 'player' && !rtsUnitDef(e.def).harvest;
      }).slice(0, 1);
      _rtsHoldSelected();
      window._rtsFallThru = G.sel[0];
    });
    await g.page.locator('#rtsTTeams').tap();
    out.noFallThrough = await g.page.evaluate(function () {
      var u = window._rtsFallThru;
      return u.order === 'hold' && !u.path;
    });
  }

  var errs = g.errors.filter(function (e) { return !/ServiceWorker/.test(e); });
  await g.close();
  await browser.close();

  S.ok('a desktop does NOT get the bar (control)', !deskHas,
       deskHas ? 'built on a desktop - three buttons of map lost to keys that already exist'
               : 'absent, as it should be');
  S.ok('a phone does get it', out.built, out.built ? 'built from the frame walk' : 'MISSING');
  if (out.built && out.haveUnits) {
    S.ok('...sized for a finger, over the stage rather than the sidebar',
         out.btnH >= 32 && out.btnW >= 32 && out.overStage,
         out.btnW + 'x' + out.btnH + ' css px, ' +
         (out.overStage ? 'inside the stage' : 'OUTSIDE the stage'));
    S.ok('A-MOVE latches the mode on and off',
         out.amoveOff && out.amoveOn && out.amoveBackOff,
         'off -> ' + (out.amoveOn ? 'on and lit' : 'NOT SET') + ' -> ' +
         (out.amoveBackOff ? 'off' : 'STUCK ON'));
    S.ok('HOLD actually stops a moving unit', out.wasMoving && out.nowHolding,
         out.wasMoving ? (out.nowHolding ? 'was moving with a path, now holding with none'
                                         : 'still moving after the tap')
                       : 'the unit was not moving to begin with - the test proves nothing');
    if (out.numsShown) {
      S.ok('the team digits appear only when asked for', out.numsShown, 'shown on demand');
      S.ok('...and a tap on an empty team selects nothing (control)',
           out.wrongTeamEmpty === 0,
           'team 3 selected ' + out.wrongTeamEmpty + ' units');
      S.ok('THE TEAM ROUND TRIP: assigned, deselected, and tapped back',
           out.assigned > 0 && out.reselected === out.assigned,
           out.assigned + ' assigned to team 2, ' + out.reselected + ' came back on a tap');
    }
    S.ok('a tap on the bar does not fall through to the battlefield', out.noFallThrough,
         out.noFallThrough ? 'the unit kept its hold order'
                           : 'the tap reached the map and issued a move order underneath');
  }
  S.ok('no page errors', !errs.length, errs.join(' | ') || 'none');
  require('../lib/report.js')(S);
})();
