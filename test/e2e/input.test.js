/* Controls that used to cost the player something, driven through real input.

   Every case here was reported as a defect and every one is asserted on the OUTCOME - what the
   player still owns, which army is fighting, whether the match is still running - rather than on
   a handler having been called. Real page.keyboard and real clicks throughout: a dispatched
   synthetic KeyboardEvent would test our listeners against our own idea of what a browser sends,
   which is the assumption most worth checking. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('input');

(async function () {
  var browser = await chromium.launch();

  /* ================= the title screen keyboard ================= */
  /* A document-level keydown fired rtsStart for EVERY Enter and Space, and its preventDefault
     killed the button the player was actually on: tab to SOVIET, press Enter, get an ALLIED
     battle. Tab to RESUME BATTLE, press Enter, get a new match instead of your save. */
  var t = await openPage(browser, { width: 1280, height: 900 });
  var side = await t.page.evaluate(function () { try { localStorage.removeItem('rcgVoxSide'); } catch (e) {} return 1; });

  /* find the faction buttons by their own text, not by tab count - tab order changes */
  var picked = await t.page.evaluate(async function () {
    var b = [].slice.call(document.querySelectorAll('#rtsVoxSide button'))
              .filter(function (x) { return /SOVIET/i.test(x.textContent); })[0];
    if (!b) return { error: 'no SOVIET button' };
    b.focus();
    return { focused: document.activeElement === b, before: rtsVoxSide() };
  });
  S.ok('the SOVIET button can be focused', picked.focused && !picked.error, picked.error || '');
  await t.page.keyboard.press('Enter');
  await t.page.waitForTimeout(250);
  var afterEnter = await t.page.evaluate(function () {
    return { vox: rtsVoxSide(), inBattle: !!document.getElementById('rcgRts') };
  });
  S.eq('Enter on SOVIET picks Soviet rather than starting a battle', afterEnter.vox, 'soviet');
  S.ok('...and does not start a battle', !afterEnter.inBattle);

  /* Space on a focused button is that button's activation too */
  await t.page.evaluate(function () {
    [].slice.call(document.querySelectorAll('#rtsVoxSide button'))
      .filter(function (x) { return /ALLIED/i.test(x.textContent); })[0].focus();
  });
  await t.page.keyboard.press(' ');
  await t.page.waitForTimeout(250);
  var afterSpace = await t.page.evaluate(function () {
    return { vox: rtsVoxSide(), inBattle: !!document.getElementById('rcgRts') };
  });
  S.eq('Space on ALLIED picks Allied', afterSpace.vox, 'allied');
  S.ok('...and does not start a battle either', !afterSpace.inBattle);

  /* With nothing focused, Enter is still the shortcut it was meant to be. */
  await t.page.evaluate(function () { if (document.activeElement) document.activeElement.blur(); });
  await t.page.keyboard.press('Enter');
  await t.page.waitForTimeout(900);
  S.ok('Enter with nothing focused still starts the battle',
       await t.page.evaluate(function () { return !!document.getElementById('rcgRts'); }));
  await t.close();

  /* ================= the camera keys do not also give orders ================= */
  var g = await openPage(browser, { width: 1280, height: 900 });
  await g.start(7, 20);
  /* THE DEPLOY HAS TO BE POSSIBLE OR THE TEST PROVES NOTHING. An MCV parked where a Command
     Yard would not fit cannot deploy however hard you press D, so a spec that spawned one
     anywhere would pass whether or not the keys were still crossed. Probe outwards for a cell
     _rtsCanPlace actually accepts and put it there. */
  var mcv = await g.page.evaluate(function () {
    var G = window._rtsG, yd = _rtsHas('player', 'yard');
    var found = null;
    for (var r = 4; r <= 14 && !found; r++) {
      for (var a = 0; a < 16 && !found; a++) {
        var x = yd.x + Math.cos(a / 16 * Math.PI * 2) * r * RTS_TILE;
        var z = yd.z + Math.sin(a / 16 * Math.PI * 2) * r * RTS_TILE;
        var tx = _rtsTX(x) - 1, tz = _rtsTX(z) - 1;
        if (_rtsCanPlace('player', 'yard', tx, tz)) found = { x: x, z: z, tx: tx, tz: tz };
      }
    }
    if (!found) return { error: 'no legal cell for a Command Yard anywhere near the base' };
    var u = _rtsSpawnUnit('player', 'mcv', found.x, found.z);
    if (!u) return { error: 'could not spawn an mcv' };
    G.sel.length = 0; G.sel.push(u);
    return { at: found,
             mcvs: G.ents.filter(function (e) { return !e.dead && e.def === 'mcv'; }).length,
             yards: G.ents.filter(function (e) { return !e.dead && e.def === 'yard' && e.side === 'player'; }).length,
             focus: { x: _rtsR.focus.x, z: _rtsR.focus.z } };
  });
  S.ok('an MCV is parked somewhere it CAN legally deploy', !mcv.error,
       mcv.error || ('tile ' + mcv.at.tx + ',' + mcv.at.tz));

  /* The defect was that these keys did two jobs at once. Each one still does its documented
     command - that half was never wrong - so what is asserted is that the CAMERA no longer
     moves with them, and that the commands still land. */
  for (var key of ['w', 'a', 's', 'd']) {
    await g.page.keyboard.down(key);
    await g.page.waitForTimeout(300);
    await g.page.keyboard.up(key);
  }
  await g.page.waitForTimeout(200);
  var afterWasd = await g.page.evaluate(function () {
    var G = window._rtsG;
    return {
      yards: G.ents.filter(function (e) { return !e.dead && e.def === 'yard' && e.side === 'player'; }).length,
      focus: { x: _rtsR.focus.x, z: _rtsR.focus.z }
    };
  });
  var drift = Math.hypot(afterWasd.focus.x - mcv.focus.x, afterWasd.focus.z - mcv.focus.z);
  S.near('W, A, S and D do not move the camera at all', drift, 0, 0.001);
  S.ok('...while D still deploys the MCV, which is the command it is documented as',
       afterWasd.yards > mcv.yards, mcv.yards + ' -> ' + afterWasd.yards + ' command yards');

  /* and the arrows still do the job WASD was doubling up on */
  var panBefore = await g.page.evaluate(function () { return { x: _rtsR.focus.x, z: _rtsR.focus.z }; });
  await g.page.keyboard.down('ArrowRight');
  await g.page.waitForTimeout(350);
  await g.page.keyboard.up('ArrowRight');
  await g.page.waitForTimeout(150);
  var panAfter = await g.page.evaluate(function () { return { x: _rtsR.focus.x, z: _rtsR.focus.z }; });
  S.ok('the right arrow pans the camera', panAfter.x > panBefore.x + 5,
       Math.round(panBefore.x) + ' -> ' + Math.round(panAfter.x));

  /* S is hold-position, and now that is ALL it is */
  var hold = await g.page.evaluate(function () {
    var G = window._rtsG;
    G.sel.length = 0;
    G.ents.filter(function (e) { return !e.dead && e.type === 'unit' && e.side === 'player' &&
                                        !rtsUnitDef(e.def).harvest; })
          .slice(0, 3).forEach(function (e) { e.order = 'move'; G.sel.push(e); });
    return G.sel.length;
  });
  await g.page.keyboard.press('s');
  await g.page.waitForTimeout(150);
  var held = await g.page.evaluate(function () {
    return window._rtsG.sel.filter(function (e) { return e.order === 'hold'; }).length;
  });
  S.eq('S still puts the selection on hold', held, hold);

  /* ================= the armed superweapon ================= */
  var sup = await g.page.evaluate(function () {
    var U = window._rtsUI, G = window._rtsG;
    /* arm it directly: charging one takes minutes and the arming logic is not what is on test */
    U.superArm = 'nuke';
    var S2 = G.sides.player;
    S2.ready = 'power';                       /* a finished building waiting to be placed */
    _rtsItemClick('power');
    return { superArm: U.superArm, place: U.place };
  });
  S.eq('arming a placement disarms the superweapon', sup.superArm, null);
  S.eq('...and the placement is armed instead', sup.place, 'power');

  await g.page.keyboard.press('Escape');
  await g.page.waitForTimeout(120);
  var esc1 = await g.page.evaluate(function () {
    return { place: window._rtsUI && window._rtsUI.place, alive: !!document.getElementById('rcgRts') };
  });
  S.eq('Escape cancels the placement', esc1.place, null);
  S.ok('...and does not close the battle', esc1.alive);

  await g.page.evaluate(function () { window._rtsUI.superArm = 'nuke'; });
  await g.page.keyboard.press('Escape');
  await g.page.waitForTimeout(120);
  var esc2 = await g.page.evaluate(function () {
    return { superArm: window._rtsUI && window._rtsUI.superArm,
             alive: !!document.getElementById('rcgRts') };
  });
  S.eq('Escape disarms an armed superweapon', esc2.superArm, null);
  S.ok('...instead of quitting the whole battle', esc2.alive);

  /* ================= an empty team says so ================= */
  var team = await g.page.evaluate(async function () {
    var G = window._rtsG;
    G.sel.length = 0;
    G.ents.filter(function (e) { return !e.dead && e.type === 'unit' && e.side === 'player'; })
          .slice(0, 3).forEach(function (e) { G.sel.push(e); });
    var before = G.sel.length;
    G.msg = '';
    _rtsHandleTeam(4, 0);                    /* team 5, never assigned */
    return { before: before, after: G.sel.length, msg: G.msg || '' };
  });
  S.ok('pressing an unassigned team number says so',
       /empty/i.test(team.msg), JSON.stringify(team.msg));
  S.note('selection ' + team.before + ' -> ' + team.after +
         ' (clearing it matches Handle_Team; the silence did not)');

  /* Escape with nothing armed still leaves the battle, which is documented behaviour */
  await g.page.keyboard.press('Escape');
  await g.page.waitForTimeout(200);
  S.ok('Escape with nothing armed still leaves the battle',
       await g.page.evaluate(function () { return !document.getElementById('rcgRts'); }));

  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');
  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})();
