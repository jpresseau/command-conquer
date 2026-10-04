/* THE BATTLEFIELD IS 3D, AND NEEDS WEBGL (render3d/present3d.js _r3dStart, ui/shell.js rtsOpen).

     IT OPENS IN 3D   a match opens with the 3D renderer on and drawing - asked of the picture:
                      the camera leans, so a point north of the focus projects up the screen by
                      cos(tilt) of its distance, not by all of it
     NO WEBGL         with every GL context refused before the page loads, a real press on START
                      BATTLE says why on the title screen and leaves no half-built battle behind,
                      rather than a black screen or a 2D game there is no longer */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('webgl');

(async function () {
  var browser = await chromium.launch();

  /* ---------- it opens in 3D ---------- */
  var g = await openPage(browser, { width: 900, height: 700, dpr: 1 });
  await g.start(7, 1, {});
  var o = await g.page.evaluate(function () {
    var R3 = window._R3D, R = _rtsR;
    R.focus.x = 0; R.focus.z = 0; _rtsApplyCam(); _rtsRFrame(0);
    return { on: !!(R3 && R3.on), shown: !!(R3 && R3.cv.style.display === 'block' && R3.cv.width > 0),
             lifted: Math.abs(_rtsGroundToScreen(0, 40).y - _rtsGroundToScreen(0, 0).y),
             flat: 40 * _rtsZoom(), cp: R3 ? R3.cp : 1,
             button: !!document.getElementById('rts3dBtn') };
  });
  S.ok('a match opens with the 3D renderer on, its canvas presented', o.on && o.shown, '');
  S.ok('...and drawing through the leaned camera: 40 units north projects by cos(tilt), not by all of it',
       Math.abs(o.lifted - o.flat * o.cp) < o.flat * 0.25 && o.lifted < o.flat * 0.95,
       o.lifted.toFixed(1) + ' px against ' + o.flat.toFixed(1) + ' flat');
  S.ok('...and there is no 2D/3D button to press', !o.button, '');
  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');
  await g.close();

  /* ---------- no WebGL ---------- */
  var g3 = await openPage(browser, { width: 900, height: 700, dpr: 1, noWebGL: true });
  var stub = await g3.page.evaluate(function () { return window.__glStubbed === true; });
  S.ok('the browser really is refusing WebGL here, or this proves nothing', stub, '');
  var go = await g3.page.evaluate(function () { var r = document.getElementById('rtsGo').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await g3.page.mouse.click(go.x, go.y);
  await g3.page.waitForFunction(function () {
    var e = document.getElementById('rtsErr');
    return e && e.style.display === 'block';
  }, null, { timeout: 30000 }).catch(function () {});
  var refused = await g3.page.evaluate(function () {
    var e = document.getElementById('rtsErr'), h = document.getElementById('rtsHome');
    return { msg: e ? e.textContent : '', shown: !!(e && e.style.display === 'block'),
             battle: !!document.getElementById('rcgRts'), home: !!(h && !h.classList.contains('gone')),
             go: document.getElementById('rtsGo').textContent };
  });
  S.ok('with no WebGL, START BATTLE says why on the title screen', refused.shown && /WebGL/.test(refused.msg), JSON.stringify(refused.msg));
  S.ok('...leaves no half-built battle behind, and the title screen usable', !refused.battle && refused.home && /START/.test(refused.go),
       'battle ' + refused.battle + ', home ' + refused.home + ', button "' + refused.go + '"');
  S.ok('...and throws nothing uncaught', !g3.errors.length, g3.errors.join(' | ') || 'none');
  await g3.close();

  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
