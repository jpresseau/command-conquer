/* A SOLDIER WORTH ZOOMING IN ON - render3d/soldier3d.js.

   Two rifle squads at the closest zoom, one standing and one on the move, the frame taken with
   the 3D soldier and with the sprite's model it replaces (R3.soldierOff):

     HIS OWN     the 3D model changes the squads' pixels and nothing else in the frame
     HE WALKS    a fifth of a second on, the squad on the move has changed its stride and the
                 one standing has not moved at all
     THE SWITCH  with the sprite's model, the walker is the one pose it always was */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('soldier');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 900, height: 760, dpr: 1 });
  await g.start(7, 1);

  var out = await g.page.evaluate(function () {
    var o = {}, R = _rtsR, G = window._rtsG, i;
    for (i = 0; i < RTS_N * RTS_N; i++) { G.mapped[i] = 1; G.vis[i] = 1; }
    G.visDirty = 1;
    var R3 = window._R3D;
    o.on = !!(R3 && R3.on);
    if (!o.on) return o;
    window.RTS_POST_ON = false;
    R3.cloudAmt = 0; R3.swayAmt = 0; R3.surfAmt = 0;
    G.fx.length = 0;
    var yd = _rtsHas('player', 'yard');
    var still = _rtsSpawnUnit('player', 'rifle', yd.x + 12, yd.z + 14);
    var walk = _rtsSpawnUnit('player', 'rifle', yd.x + 24, yd.z + 14);
    still.rot = walk.rot = 0.4;
    walk.path = [{ x: walk.x + 40, z: walk.z }];
    R.focus.x = yd.x + 18; R.focus.z = yd.z + 14; R.zi = RTS_ZOOMS.length - 1; _rtsApplyCam();
    var gl = R3.gl, CW = R3.cv.width, CH = R3.cv.height;
    function shot(t) {
      G.t = t; _rtsRFrame(0);
      var b = new Uint8Array(CW * CH * 4);
      gl.readPixels(0, 0, CW, CH, gl.RGBA, gl.UNSIGNED_BYTE, b);
      return b;
    }
    function boxOf(e) {
      var y = _rtsElev(e.x, e.z), b = { x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9 };
      /* the squad and its shadow */
      [[-5, 0, -5], [5, 0, -5], [-5, 0, 5], [5, 0, 5], [-5, 3, -5], [5, 3, 5]].forEach(function (c) {
        var p = _rtsWorldToScreen(e.x + c[0], y + c[1], e.z + c[2]);
        b.x0 = Math.min(b.x0, p.x * R.dpr); b.x1 = Math.max(b.x1, p.x * R.dpr);
        b.y0 = Math.min(b.y0, p.y * R.dpr); b.y1 = Math.max(b.y1, p.y * R.dpr);
      });
      return b;
    }
    var BS = boxOf(still), BW = boxOf(walk);
    function diff(P, Q) {
      var r = { still: 0, walk: 0, else: 0 };
      for (var y = 0; y < CH; y++) for (var x = 0; x < CW; x++) {
        var q = ((CH - 1 - y) * CW + x) * 4;
        if (Math.abs(P[q] - Q[q]) + Math.abs(P[q + 1] - Q[q + 1]) + Math.abs(P[q + 2] - Q[q + 2]) <= 12) continue;
        if (x >= BS.x0 && x <= BS.x1 && y >= BS.y0 && y <= BS.y1) r.still++;
        else if (x >= BW.x0 && x <= BW.x1 && y >= BW.y0 && y <= BW.y1) r.walk++;
        else r.else++;
      }
      return r;
    }
    var t0 = G.t;
    R3.soldierOff = true; var A = shot(t0 + 1);
    R3.soldierOff = false; var B = shot(t0 + 1);
    o.own = diff(A, B);
    /* two moments a stride apart: 5 poses a second, so 0.2s is the next pose */
    var B2 = shot(t0 + 1.2);
    o.walking = diff(B, B2);
    o.poses = [_r3dSoldierPose(walk, t0 + 1), _r3dSoldierPose(walk, t0 + 1.2)];
    R3.soldierOff = true; var A2 = shot(t0 + 1.2); R3.soldierOff = false;
    o.spriteStill = diff(A, A2);
    gl.getError(); window.RTS_POST_ON = true; shot(t0 + 1); o.glErr = gl.getError();
    G.t = t0;
    R3.cloudAmt = undefined; R3.swayAmt = undefined; R3.surfAmt = undefined;
    return o;
  });

  S.ok('the 3D mode is available to check', out.on, out.on ? 'on' : 'no WebGL');
  if (!out.on) { await g.close(); await browser.close(); return require('../lib/report.js')(S); }
  var w = out.own, k = out.walking;
  S.ok('the 3D soldier is drawn in place of the sprite\'s model', w.still > 80 && w.walk > 80,
       w.still + ' pixels change over the squad standing, ' + w.walk + ' over the one walking');
  S.ok('...and nothing else in the frame changes', w.else === 0, w.else + ' pixels elsewhere');
  S.ok('a fifth of a second on, the squad on the move is in another stride', out.poses[0] !== out.poses[1] && k.walk > 40,
       'pose ' + out.poses.join(' then ') + ', ' + k.walk + ' of its pixels change');
  S.ok('...and the squad standing has not moved', k.still === 0 && k.else === 0,
       k.still + ' of its pixels change, ' + k.else + ' elsewhere');
  S.ok('with the sprite\'s model the walker only bobs, one pose throughout', out.spriteStill.still === 0,
       'the standing squad changes by ' + out.spriteStill.still + ' pixels with the old model');
  S.eq('no draw is refused', out.glErr, 0);
  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
