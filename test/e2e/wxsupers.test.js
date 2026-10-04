/* WEATHER CALLED DOWN, IN THE PAGE (core/wxsupers.js, render3d/wxfx3d.js, ui/superbar.js):

     THE BUTTON   a charged Fog Bank shows on the superweapon row; a real click on it and a real
                  click on the map lays the bank where the click landed, and spends the charge
     THE FOG      the 3D picture there turns pale - fog lying on the ground - and the Thunderhead's
                  ground goes dark under its cloud; with the weather switched off (R3.wxOff) the
                  same pixels are the ground again
     THE BOLT     a lightning strike lights the ground where it lands */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('wxsupers');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 1100, height: 760 });
  var p = g.page;
  await p.evaluate(function () { rtsSetArmySide('allied'); });
  await g.start(7, 1, { freeze: true });

  /* a Mist Tower, charged, and the camera over open ground east of the yard */
  var aim = await p.evaluate(function () {
    var G = window._rtsG, R = _rtsR, yd = _rtsHas('player', 'yard');
    for (var r = 3; r < 30; r++) { var sp = _rtsNearestOpen(yd.tx - r, yd.tz, 3, null); if (sp && _rtsCanPlace('player', 'mist', sp[0], sp[1], true)) { _rtsPlaceStruct('player', 'mist', sp[0], sp[1], true); break; } }
    _rtsRecalcPower('player');
    var S2 = G.sides.player; S2.supers = S2.supers || {};
    S2.supers.fogbank = { t: 1e3, ready: true, said: true };
    for (var i = 0; i < RTS_N * RTS_N; i++) { G.mapped[i] = 1; G.vis[i] = 1; }
    var c = _rtsNearestOpen(yd.tx + 16, yd.tz, 6, null);
    R.focus.x = _rtsWX(c[0]); R.focus.z = _rtsWX(c[1]); R.zi = RTS_ZOOMS.length - 3; _rtsApplyCam();
    window._rtsUI.superSig = null; _rtsSuperRow();
    var b = document.querySelector('[data-super="fogbank"]'), br = b && b.getBoundingClientRect();
    var cv = document.getElementById('rtsCv').getBoundingClientRect(), s = _rtsGroundToScreen(_rtsWX(c[0]), _rtsWX(c[1]));
    return { tx: c[0], tz: c[1], btn: br ? { x: br.left + br.width / 2, y: br.top + br.height / 2, text: b.textContent } : null,
             map: { x: cv.left + s.x, y: cv.top + s.y } };
  });
  S.ok('a charged Fog Bank shows on the superweapon row', !!aim.btn && /Fog Bank/.test(aim.btn.text), aim.btn ? aim.btn.text : 'no button');
  if (aim.btn) await p.mouse.click(aim.btn.x, aim.btn.y);
  await p.mouse.click(aim.map.x, aim.map.y);
  var laid = await p.evaluate(function (a) {
    var G = window._rtsG, c = (G.wx || [])[0];
    return { n: (G.wx || []).length, d: c ? Math.hypot(_rtsTX(c.x) - a.tx, _rtsTX(c.z) - a.tz) : null, spent: !_rtsSuperReady('player', 'fogbank') };
  }, aim);
  S.ok('a real click on the button and on the map lays the bank where the click landed, and spends the charge', laid.n === 1 && laid.d <= 2 && laid.spent, JSON.stringify(laid));

  /* the picture: the mean of a patch of the 3D frame at the middle of each, weather on and off */
  var pic = await p.evaluate(function (a) {
    var G = window._rtsG, R = _rtsR, R3 = window._R3D, gl = R3.gl;
    function patch(wx, wz) {
      _rtsRFrame(0); _rtsRFrame(0);
      var s = _rtsGroundToScreen(wx, wz), k = R3.cv.width / R.W, H = R3.cv.height, px = new Uint8Array(4 * 15 * 15);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.readPixels(Math.round(s.x * k) - 7, H - Math.round(s.y * k) - 7, 15, 15, gl.RGBA, gl.UNSIGNED_BYTE, px);
      var r = 0, gg = 0, b = 0;
      for (var q = 0; q < px.length; q += 4) { r += px[q]; gg += px[q + 1]; b += px[q + 2]; }
      var n = px.length / 4;
      return { lum: (r + gg + b) / 3 / n, sat: (Math.max(r, gg, b) - Math.min(r, gg, b)) / n };
    }
    /* the bank the click laid - or, if it laid none, one laid here, so the picture is still asked */
    if (!(G.wx || []).length) _rtsFireFogBank('player', a.tx, a.tz);
    var c = G.wx[0], o = {};
    c.t -= 5;                                              /* five seconds in: faded fully in */
    R3.wxOff = false; o.fogOn = patch(c.x, c.z);
    R3.wxOff = true; o.fogOff = patch(c.x, c.z);
    /* a Thunderhead on its own ground, the fog out of the way */
    G.wx = [];
    var yd = _rtsHas('player', 'yard'), sc = _rtsNearestOpen(a.tx, a.tz + 2, 4, null);
    _rtsFireThunder('player', sc[0], sc[1]);
    var st = G.wx[0]; st.boltT = 1e9; st.t -= 5;            /* no strike in the patch; faded in */
    R3.wxOff = false; o.stormOn = patch(st.x, st.z);
    R3.wxOff = true; o.stormOff = patch(st.x, st.z);
    /* a bolt, out on the ground beside it */
    var bx = st.x + RTS_TILE * 3, bz = st.z;
    R3.wxOff = false; G.wx = [];
    o.boltOff = patch(bx, bz);
    G.bolts = [{ x: bx, z: bz, t: 0.02 }];
    o.boltOn = patch(bx, bz);
    return o;
  }, aim);
  S.ok('the picture under the fog bank turns pale: lighter and greyer than the same ground without it',
       pic.fogOn.lum > pic.fogOff.lum + 20 && pic.fogOn.sat < pic.fogOff.sat, 'lum ' + pic.fogOn.lum.toFixed(0) + ' vs ' + pic.fogOff.lum.toFixed(0) + ', colour ' + pic.fogOn.sat.toFixed(0) + ' vs ' + pic.fogOff.sat.toFixed(0));
  S.ok('...and under the Thunderhead it goes dark', pic.stormOn.lum < pic.stormOff.lum - 15, 'lum ' + pic.stormOn.lum.toFixed(0) + ' vs ' + pic.stormOff.lum.toFixed(0));
  S.ok('a lightning strike lights the ground where it lands', pic.boltOn.lum > pic.boltOff.lum + 25, 'lum ' + pic.boltOn.lum.toFixed(0) + ' vs ' + pic.boltOff.lum.toFixed(0));

  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');
  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
