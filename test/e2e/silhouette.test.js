/* UNITS SHOW THROUGH WHAT HIDES THEM - render3d/sil3d.js.

   A tank of each house is tucked against the war factory's back wall, where the tilted camera
   cannot see it, and a third tank stands in the open. Measured as an A/B on one frame, R3.silAmt 0
   against 1, so nothing but the silhouettes differs:

     HIDDEN     the tanks behind the factory really are out of sight without it
     SEEN       with it, each shows through the factory, in its own house's colour
     NOT ITSELF the tank in the open does not show through its own hull
     NOWHERE ELSE  nothing changes anywhere but over the hidden tanks */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('silhouette');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 900, height: 760, dpr: 1 });
  await g.start(7, 1);

  var out = await g.page.evaluate(function () {
    var o = {}, R = _rtsR, G, i;
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
    R3.cloudAmt = 0;
    var wf = null;
    for (i = 0; i < G.ents.length; i++) if (G.ents[i].def === 'factory') { wf = G.ents[i]; break; }
    o.found = !!wf;
    if (!wf) return o;
    var d = rtsStructDef('factory'), back = _rtsWX(wf.tz) - RTS_TILE * 0.5;
    var x0 = _rtsWX(wf.tx) - RTS_TILE * 0.5, x1 = x0 + d.w * RTS_TILE;
    /* tucked against the factory's back wall, under its roof, where the whole hull is out of
       sight - the camera leans 35 degrees, so a tank parked a unit or two behind a wall this
       low still shows over it - and one in the open */
    var mine = _rtsSpawnUnit('player', 'tank', x0 + (x1 - x0) * 0.3, back + 2.8);
    var theirs = _rtsSpawnUnit('enemy', 'tank', x0 + (x1 - x0) * 0.72, back + 2.8);
    var open = _rtsSpawnUnit('player', 'tank', x1 + 8, wf.z + d.h * RTS_TILE * 0.5 + 6);
    [mine, theirs, open].forEach(function (e) { e.rot = 0; e.turret = 0; });
    R.focus.x = wf.x + 2; R.focus.z = wf.z + 4; R.zi = RTS_ZOOMS.length - 2; _rtsApplyCam();
    var gl = R3.gl, CW = R3.cv.width, CH = R3.cv.height;
    function shot(amt) {
      R3.silAmt = amt;
      _rtsRFrame(0);
      var b = new Uint8Array(CW * CH * 4);
      gl.readPixels(0, 0, CW, CH, gl.RGBA, gl.UNSIGNED_BYTE, b);
      return b;
    }
    /* a unit's patch of screen: its footprint and height, projected, with a margin */
    function box(e) {
      var y = _rtsElev(e.x, e.z), r = rtsUnitDef(e.def).r + 0.8, b = { x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9 };
      [[-r, 0, -r], [r, 0, -r], [-r, 0, r], [r, 0, r], [-r, 3, -r], [r, 3, -r], [-r, 3, r], [r, 3, r]].forEach(function (c) {
        var p = _rtsWorldToScreen(e.x + c[0], y + c[1], e.z + c[2]);
        b.x0 = Math.min(b.x0, p.x * R.dpr); b.x1 = Math.max(b.x1, p.x * R.dpr);
        b.y0 = Math.min(b.y0, p.y * R.dpr); b.y1 = Math.max(b.y1, p.y * R.dpr);
      });
      return b;
    }
    function inside(b, x, y) { return x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1; }
    var B = { mine: box(mine), theirs: box(theirs), open: box(open) };
    function diff(P, Q) {
      var r = { mine: { n: 0, r: 0, b: 0 }, theirs: { n: 0, r: 0, b: 0 }, open: { n: 0, r: 0, b: 0 }, else: 0 };
      for (var y = 0; y < CH; y++) for (var x = 0; x < CW; x++) {
        var q = ((CH - 1 - y) * CW + x) * 4;
        if (Math.abs(P[q] - Q[q]) + Math.abs(P[q + 1] - Q[q + 1]) + Math.abs(P[q + 2] - Q[q + 2]) <= 6) continue;
        var k = inside(B.mine, x, y) ? 'mine' : inside(B.theirs, x, y) ? 'theirs' : inside(B.open, x, y) ? 'open' : null;
        if (!k) { r.else++; continue; }
        r[k].n++; r[k].r += Q[q] - P[q]; r[k].b += Q[q + 2] - P[q + 2];
      }
      return r;
    }
    /* HIDDEN: without the silhouettes, taking the two parked tanks away changes nothing */
    var A = shot(0);
    mine.dead = true; theirs.dead = true;
    var A0 = shot(0);
    mine.dead = false; theirs.dead = false;
    o.hidden = diff(A0, A);
    /* the one in the open is on screen and visible */
    open.dead = true; var A1 = shot(0); open.dead = false;
    o.openSeen = diff(A1, A).open.n;
    var Bn = shot(1);
    o.cover = [mine, theirs, open].map(function (e) { return _r3dSilCover(G, e); });
    o.sil = diff(A, Bn);
    /* every unit through the pass, the one in the open included: it must not show through
       its own hull, whatever stands in front of it or does not */
    R3.silAll = true;
    var Ball = shot(1);
    o.silAll = R3.silUnits;
    R3.silAll = undefined;
    o.self = diff(A, Ball).open.n;
    o.boxes = B;
    gl.getError();
    window.RTS_POST_ON = true;
    shot(1);
    o.glErr = gl.getError();
    R3.silAmt = undefined; R3.cloudAmt = undefined;
    return o;
  });

  S.ok('the 3D mode is available to check', out.on, out.on ? 'on' : 'no WebGL');
  if (!out.on || !out.found) {
    S.ok('a war factory is on the map to hide behind', out.found, String(out.found));
    await g.close(); await browser.close();
    return require('../lib/report.js')(S);
  }
  var h = out.hidden, s = out.sil;
  S.ok('the two tanks tucked behind the factory\'s wall are out of sight without the silhouettes',
       h.mine.n + h.theirs.n + h.else < 12,
       (h.mine.n + h.theirs.n + h.else) + ' pixels change when they are taken away (' + h.mine.n + ' over the blue, ' + h.theirs.n + ' over the red, ' + h.else + ' elsewhere)');
  S.ok('...and the one in the open is in plain view', out.openSeen > 60, out.openSeen + ' of its pixels are its own');
  S.ok('with the silhouettes, the player\'s tank shows through the factory', s.mine.n > 60,
       s.mine.n + ' pixels over it change');
  S.ok('...in the player\'s blue', s.mine.b > s.mine.r + s.mine.n * 10,
       'blue gains ' + (s.mine.b / Math.max(1, s.mine.n)).toFixed(1) + ' a pixel, red ' + (s.mine.r / Math.max(1, s.mine.n)).toFixed(1));
  S.ok('the opponent\'s shows through too', s.theirs.n > 60, s.theirs.n + ' pixels over it change');
  S.ok('...in the opponent\'s red', s.theirs.r > s.theirs.b + s.theirs.n * 10,
       'red gains ' + (s.theirs.r / Math.max(1, s.theirs.n)).toFixed(1) + ' a pixel, blue ' + (s.theirs.b / Math.max(1, s.theirs.n)).toFixed(1));
  S.ok('the two tucked tanks have something in front of them and go through the pass; the one in the open does not',
       out.cover[0] && out.cover[1] && !out.cover[2], 'covered: ' + out.cover.join(', '));
  S.ok('a tank in the open, drawn through the pass all the same, does not show through its own hull',
       out.silAll >= 3 && out.self < 6, out.self + ' of its pixels change');
  S.ok('and nothing changes anywhere else in the frame', s.else < 12, s.else + ' pixels outside the three tanks change');
  S.eq('no draw is refused with the silhouettes and the post buffer on', out.glErr, 0);
  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
