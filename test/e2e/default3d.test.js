/* A NEW PLAYER LANDS IN 3D.

   Everything the renderer does - the sun's shadow map, the contact occlusion, the sea as a
   surface with a swell on it, the 49-degree lean, the effects standing in the world instead of
   lying on the glass - lived behind a two-character button in the top bar, and 2D was what you
   got until you found it. A default is not a preference; it is what almost everybody gets.

   So rts3dRestore inverts: an ABSENT preference now means 3D, and only an explicit '0' keeps a
   match in 2D. Nothing writes that '0' except rts3dSet, which is to say except somebody
   pressing the button to leave, so the 2D game is now something you ask for.

   THE 2D PAINTER IS STILL THE FLOOR, and this grades that as carefully as it grades the
   default, because a default that cannot fail back is not a default, it is a requirement. A
   browser with no WebGL context to give must land in 2D and play - _r3dApply returns false,
   nothing changes, and the classic painter draws the match exactly as it always did.

   AND THE PREFERENCE HAS TO SURVIVE THE MATCH ENDING, because rts3dRestore runs per match: a
   player who leaves 3D and starts another game must not be put back into it.

   WHY THIS SPEC PINS NOTHING. Every other spec in this suite starts its match with the mode
   nailed down by the harness (see test/lib/game.js), because a spec must not inherit a default
   it never mentions - flipping this one silently turned e2e/forest's tree-density measurement
   into "0 stamps at every zoom" while it still read as a spec about tree density. This is the
   one file that must NOT be pinned, since the pin is the thing under test. It passes
   {mode3d: 'default'} and opens the match the way a first-time player does. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('default3d');

(async function () {
  var browser = await chromium.launch();

  /* ---------- 1. a first-time player, with nothing stored ---------- */
  var g = await openPage(browser, { width: 900, height: 700, dpr: 1 });
  await g.page.evaluate(function () {
    try { window.localStorage.removeItem(RTS_3D_LS); } catch (e) {}
  });
  await g.start(7, 1, { mode3d: 'default' });
  var fresh = await g.page.evaluate(function () {
    var R3 = window._R3D;
    return { on: !!(R3 && R3.on),
             stored: (function () {
               try { return window.localStorage.getItem(RTS_3D_LS); } catch (e) { return 'x'; }
             })(),
             /* the mode is only real if the GL frame is actually feeding the canvas */
             drew: !!(R3 && R3.cv && R3.cv.width > 0) };
  });

  /* ---------- 2. and it is drawing the world, not just flagged on ----------
     `R3.on` is a boolean somebody could set. The claim is that the frame the player sees came
     through the renderer, so this asks the picture: the 3D mode leans the camera, and a leaned
     camera puts a known world point somewhere a top-down one does not. */
  var proof = await g.page.evaluate(function () {
    var R3 = window._R3D, R = _rtsR;
    if (!R3 || !R3.on) return { skip: true };
    R.focus.x = 0; R.focus.z = 0; _rtsApplyCam(); _rtsRFrame(0);
    var flat = _rtsGroundToScreen(0, 40);
    return { skip: false, tilt: +R3D_TILT.toFixed(3), cp: +R3.cp.toFixed(4),
             /* a point 40 units north projects up-screen by 40*cos(tilt)*zoom, not 40*zoom */
             lifted: +Math.abs(flat.y - _rtsGroundToScreen(0, 0).y).toFixed(1),
             flatWould: +(40 * _rtsZoom()).toFixed(1) };
  });
  await g.close();

  /* ---------- 3. an explicit 2D choice is honoured, and survives a new match ---------- */
  var g2 = await openPage(browser, { width: 900, height: 700, dpr: 1 });
  await g2.page.evaluate(function () {
    try { window.localStorage.setItem(RTS_3D_LS, '0'); } catch (e) {}
  });
  await g2.start(7, 1, { mode3d: 'default' });
  var chose2d = await g2.page.evaluate(function () {
    var first = !!(window._R3D && window._R3D.on);
    /* end the match and start another - rts3dRestore runs again */
    rtsOpen(9);
    for (var i = 0; i < 60; i++) _rtsTick(1 / 60);
    return { first: first, second: !!(window._R3D && window._R3D.on) };
  });
  await g2.close();

  /* ---------- 4. no WebGL at all: the 2D painter still plays the match ----------
     getContext is stubbed to refuse every GL flavour BEFORE the page loads, so _r3dInit finds
     nothing and _r3dApply returns false. That is the real fallback path, not a simulated one. */
  var g3 = await openPage(browser, { width: 900, height: 700, dpr: 1, noWebGL: true });
  var noGl = await g3.page.evaluate(function () {
    return { stubbed: window.__glStubbed === true };
  });
  if (noGl.stubbed) {
    await g3.start(7, 1, { mode3d: 'default' });
    Object.assign(noGl, await g3.page.evaluate(function () {
      var R = _rtsR, before = R.cv.toDataURL('image/png').length;
      for (var i = 0; i < 5; i++) { _rtsTick(1 / 60); _rtsRFrame(1 / 60); }
      return { on: !!(window._R3D && window._R3D.on),
               /* and the match is actually being painted, not a blank canvas */
               painted: R.cv.toDataURL('image/png').length > 5000,
               bytes: before };
    }));
  }
  var errs3 = g3.errors.slice();
  await g3.close();
  await browser.close();

  S.ok('a player with no stored preference gets the 3D renderer',
       fresh.on,
       fresh.on ? 'match opened in 3D with nothing in localStorage (' +
         (fresh.stored === null ? 'key absent' : 'key=' + fresh.stored) + ')'
         : 'opened in 2D - which is what shipped, and meant the shadows, the occlusion, the ' +
           'sea and the lean were all behind a button most players never pressed');

  if (!proof.skip) {
    S.ok('...and the frame really came through it, not just the flag',
         proof.lifted > 0 && proof.lifted < proof.flatWould * 0.95,
         'a point 40 units north projects ' + proof.lifted + 'px up-screen, where a top-down ' +
         'camera would put it at ' + proof.flatWould + 'px - the ' + proof.tilt + ' rad lean ' +
         'compresses it by cos(tilt) = ' + proof.cp + ', so this is the 3D projection and not ' +
         'a boolean somebody set');
  }

  S.ok('...and an explicit choice of 2D is honoured',
       chose2d.first === false,
       chose2d.first === false ? 'stored "0" opened in 2D'
         : 'stored "0" opened in 3D anyway - the button would be a no-op');

  S.ok('...and survives the next match, because rts3dRestore runs per match',
       chose2d.second === false,
       chose2d.second === false ? 'still 2D after starting a second match'
         : 'the second match put the player back into 3D they had left');

  S.ok('a browser with no WebGL was simulated', noGl.stubbed,
       noGl.stubbed ? 'getContext refuses every GL flavour' : 'stub did not install');
  if (noGl.stubbed) {
    S.ok('...and it falls back to 2D and plays anyway',
         noGl.on === false && noGl.painted,
         noGl.on === false
           ? 'no GL context, mode stayed off, and the 2D painter drew the match - forcing 3D ' +
             'on rather than asking _r3dApply whether it took would leave these players ' +
             'looking at nothing'
           : 'the mode came on without a context');
    S.ok('...without throwing', !errs3.length, errs3.join(' | ') || 'none');
  }

  require('../lib/report.js')(S);
})();
