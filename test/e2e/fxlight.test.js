/* WHAT IS BURNING LIGHTS WHAT STANDS NEAR IT - render3d/fxlight3d.js.

   An explosion's glare lit the ground and nothing standing on it. The strongest few fireballs,
   pops, hits and fires are lights in the mesh program now, falling off with distance and
   brightest on the faces that face them. Measured on the war factory's front wall, R3.plightAmt
   0 against 1 in one page:

     NEAR       a fresh blast in front of the wall lights it, warm
     FAR        the same blast across the map does not
     COOLING    the light fades as the fireball does */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('fxlight');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 900, height: 760, dpr: 1 });
  await g.start(7, 1);

  var out = await g.page.evaluate(function () {
    var o = {}, R = _rtsR, G = window._rtsG, i;
    rtsSetVoxSide('allied');
    _rtsNewGame(4242, 'easy');
    G = window._rtsG;
    for (i = 0; i < RTS_N * RTS_N; i++) { G.mapped[i] = 1; G.vis[i] = 1; }
    G.visDirty = 1;
    rts3dSet(true);
    var R3 = window._R3D;
    o.on = !!(R3 && R3.on);
    if (!o.on) return o;
    window.RTS_POST_ON = false;
    var wf = null;
    for (i = 0; i < G.ents.length; i++) if (G.ents[i].def === 'factory') { wf = G.ents[i]; break; }
    o.found = !!wf;
    if (!wf) return o;
    R.focus.x = wf.x; R.focus.z = wf.z + 6; R.zi = RTS_ZOOMS.length - 2; _rtsApplyCam();
    var gl = R3.gl, CW = R3.cv.width, CH = R3.cv.height, d = rtsStructDef('factory');
    var gy = _rtsElev(wf.x, wf.z), front = _rtsWX(wf.tz + d.h - 1) + RTS_TILE * 0.5 - 0.2;
    /* the front wall, on screen: a grid across its width and up its first storeys */
    var pts = [];
    for (var a = 0.15; a <= 0.85; a += 0.05) for (var h = 0.6; h <= 3.0; h += 0.4) {
      var p = _rtsWorldToScreen(_rtsWX(wf.tx) - RTS_TILE * 0.5 + d.w * RTS_TILE * a, gy + h, front);
      var px = Math.round(p.x * R.dpr), py = Math.round(p.y * R.dpr);
      if (px >= 0 && py >= 0 && px < CW && py < CH) pts.push(((CH - 1 - py) * CW + px) * 4);
    }
    o.pts = pts.length;
    function wall(fx, amt) {
      G.fx.length = 0;
      if (fx) G.fx.push(fx);
      R3.plightAmt = amt;
      _rtsRFrame(0);
      var b = new Uint8Array(CW * CH * 4);
      gl.readPixels(0, 0, CW, CH, gl.RGBA, gl.UNSIGNED_BYTE, b);
      var s = [0, 0, 0];
      pts.forEach(function (q) { s[0] += b[q]; s[1] += b[q + 1]; s[2] += b[q + 2]; });
      return s.map(function (v) { return v / pts.length; });
    }
    /* the effect's own quads are taken out of the picture for the A/B: a blast five units in
       front of the wall stands between it and the camera, and its smoke hides the wall - which
       measured the smoke, not the light, and let a light that never faded pass as cooled */
    function gain(fx) {
      var draw = window._r3dFxDraw;
      window._r3dFxDraw = function () {};
      try {
        var off = wall(fx, 0), on = wall(fx, 1);
      } finally { window._r3dFxDraw = draw; }
      return { r: +(on[0] - off[0]).toFixed(2), g: +(on[1] - off[1]).toFixed(2), b: +(on[2] - off[2]).toFixed(2) };
    }
    var near = { kind: 'boom', x: wf.x, y: 1, z: front + 5, t: 0.05, big: 1.6 };
    o.near = gain(near);
    o.far = gain({ kind: 'boom', x: wf.x + 70, y: 1, z: front + 5, t: 0.05, big: 1.6 });
    near.t = 0.7;
    o.cooled = gain(near);
    o.lights = R3.plights;

    gl.getError();
    window.RTS_POST_ON = true;
    wall({ kind: 'firebig', x: wf.x, y: 1, z: wf.z, t: 0.3, big: 2.2, att: wf.id, loops: 4 }, 1);
    o.glErr = gl.getError();
    R3.plightAmt = undefined; G.fx.length = 0;
    return o;
  });

  S.ok('the 3D mode is available to check', out.on, out.on ? 'on' : 'no WebGL');
  if (!out.on || !out.found) {
    S.ok('a war factory is on the map to look at', out.found, String(out.found));
    await g.close(); await browser.close();
    return require('../lib/report.js')(S);
  }
  S.ok('the factory\'s front wall is on screen to sample', out.pts > 60, out.pts + ' samples');
  var n = out.near, f = out.far, c = out.cooled;
  function sum(x) { return x.r + x.g + x.b; }
  S.ok('a fresh blast in front of the wall lights it', sum(n) > 12,
       'the wall gains ' + n.r + '/' + n.g + '/' + n.b + ' levels, red/green/blue');
  S.ok('...warm: red gains more than blue', n.r > n.b * 1.5, 'red ' + n.r + ' against blue ' + n.b);
  S.ok('the same blast across the map lights it not at all', Math.abs(sum(f)) < 0.5,
       'the wall gains ' + f.r + '/' + f.g + '/' + f.b);
  S.ok('...and as the fireball cools, so does its light', sum(c) < sum(n) * 0.25,
       'the wall gains ' + sum(c).toFixed(2) + ' levels in all at 0.7s against ' + sum(n).toFixed(2) + ' at once');
  S.eq('no draw is refused with a building burning and the post buffer on', out.glErr, 0);
  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
