/* THE COUNTRYSIDE IS DRAWN - render3d/scenery3d.js, render3d/farm3d.js.

   Fields, farmsteads, telegraph poles, wrecks and boulders between the bases, in the 3D mode:

     BUILT       the batch exists from the new game's first frame, in chunks, at a modest share
                 of the world batch's triangles
     COSMETIC    entering the 3D mode and drawing a minute of frames leaves the game's cells
                 exactly as they were
     CLAIMS      the world batch leaves a farmstead's trees out - the same map built without the
                 farmsteads' claims draws more triangles of forest
     SEEN        R3.sceneryAmt 0 against 1 on one frame over a field: the field changes the
                 picture, and the change lies over the field
     FOLLOWS     a building put down on a wreck takes the wreck away, and it is back when the
                 ground is clear again; ore spreading under a field does the same to the field */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('scenery');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 900, height: 760, dpr: 1 });
  await g.start(7, 1);

  var out = await g.page.evaluate(function () {
    var o = {}, R = _rtsR, G, i;
    rtsSetArmySide('allied');
    _rtsNewGame(4242, 'easy');
    G = window._rtsG;
    for (i = 0; i < RTS_N * RTS_N; i++) { G.mapped[i] = 1; G.vis[i] = 1; }
    G.visDirty = 1;
    function sum(a) { var s = 0; for (var j = 0; j < a.length; j++) s = (Math.imul(s, 31) + a[j]) | 0; return s; }
    var cells0 = [sum(G.terrain), sum(G.blocked), sum(G.scrap)].join();
    rts3dSet(true);
    var R3 = window._R3D;
    o.on = !!(R3 && R3.on);
    if (!o.on) return o;
    window.RTS_POST_ON = false;
    R3.cloudAmt = 0;
    _rtsRFrame(0);
    var P = R3.scnPlan;
    o.firstFrame = R3.scnFor === G && !!R3.scenery && R3.scenery.length > 0;
    o.n = { fields: P.fields.length, farms: P.farms.length, poles: P.poles.length, wrecks: P.wrecks.length, rocks: P.rocks.length };
    o.tris = R3.sceneryTris; o.worldTris = R3.worldTris; o.chunks = R3.scenery.length;
    o.batched = _r3dSceneryBatches(R3).length === R3.scenery.length + (R3.bridges || []).length;   /* and the bridges: bridge3d.js */

    /* COSMETIC: a minute of frames with the batch drawn */
    for (i = 0; i < 20; i++) { G.t += 3; _rtsRFrame(0.05); }
    o.cellsSame = [sum(G.terrain), sum(G.blocked), sum(G.scrap)].join() === cells0;

    /* CLAIMS: the same map built with no claims */
    var withClaims = R3.worldTris, plan = window._r3dSceneryPlan;
    /* only the farmsteads' claims (1, and 3 round them) - a field's (2) takes tufts out too */
    window._r3dSceneryPlan = function (G2) {
      var Q = plan(G2);
      Object.keys(Q.claim).forEach(function (k) { if (Q.claim[k] !== 2) delete Q.claim[k]; });
      return Q;
    };
    R3.world = null; _rtsRFrame(0);
    o.noClaims = R3.worldTris;
    window._r3dSceneryPlan = plan; R3.world = null; _rtsRFrame(0);
    P = R3.scnPlan;
    o.withClaims = withClaims; o.rebuilt = R3.worldTris;

    /* SEEN: over the first field */
    var f = P.fields[0], gl = R3.gl, CW = R3.cv.width, CH = R3.cv.height;
    R.focus.x = _rtsWX(f.tx) + f.w * RTS_TILE / 2 - RTS_TILE / 2; R.focus.z = _rtsWX(f.tz) + f.d * RTS_TILE / 2 - RTS_TILE / 2;
    R.zi = RTS_ZOOMS.length - 2; _rtsApplyCam();
    function shot(amt) {
      R3.sceneryAmt = amt; _rtsRFrame(0);
      var b = new Uint8Array(CW * CH * 4);
      gl.readPixels(0, 0, CW, CH, gl.RGBA, gl.UNSIGNED_BYTE, b);
      return b;
    }
    var a = shot(0), b = shot(1);
    R3.sceneryAmt = 1;
    /* the field's own screen box, from its corners */
    var bx0 = 1e9, bx1 = -1e9, by0 = 1e9, by1 = -1e9;
    [[f.tx, f.tz], [f.tx + f.w, f.tz], [f.tx, f.tz + f.d], [f.tx + f.w, f.tz + f.d]].forEach(function (c) {
      var s = _r3dWorldToScreen(_rtsWX(c[0]) - RTS_TILE / 2, _rtsElev(_rtsWX(c[0]), _rtsWX(c[1])), _rtsWX(c[1]) - RTS_TILE / 2);
      bx0 = Math.min(bx0, s.x); bx1 = Math.max(bx1, s.x); by0 = Math.min(by0, s.y); by1 = Math.max(by1, s.y);
    });
    var sc = CW / R3.cv.clientWidth, inside = 0, outside = 0;
    for (var py = 0; py < CH; py++) for (var px = 0; px < CW; px++) {
      var k = (py * CW + px) * 4, d = Math.abs(a[k] - b[k]) + Math.abs(a[k + 1] - b[k + 1]) + Math.abs(a[k + 2] - b[k + 2]);
      if (d < 24) continue;
      var cx = px / sc, cy = (CH - 1 - py) / sc;          /* readPixels is bottom-up */
      if (cx >= bx0 - 14 && cx <= bx1 + 14 && cy >= by0 - 30 && cy <= by1 + 14) inside++; else outside++;
    }
    o.box = [bx0, bx1, by0, by1].map(Math.round); o.inside = inside; o.outside = outside;
    o.fieldPx = Math.max(1, (bx1 - bx0) * (by1 - by0) * sc * sc);

    /* FOLLOWS: a building on a wreck - with the game's clock standing still, as it does paused */
    var w = P.wrecks[0], wk = w.tz * RTS_N + w.tx, t0 = R3.sceneryTris;
    G.blocked[wk] = 1; _rtsRFrame(0);
    o.wreckGone = t0 - R3.sceneryTris;
    G.blocked[wk] = 0; _rtsRFrame(0);
    o.wreckBack = R3.sceneryTris === t0;
    /* ...and ore under a field */
    var fk = f.tz * RTS_N + f.tx, s0 = G.scrap[fk];
    G.scrap[fk] = 40; _rtsRFrame(0);
    o.fieldGone = t0 - R3.sceneryTris;
    G.scrap[fk] = s0; _rtsRFrame(0);
    o.fieldBack = R3.sceneryTris === t0;
    /* a spec that clears the world for bare ground clears this too */
    var keepW = R3.world; R3.world = []; o.bareEmpty = _r3dSceneryBatches(R3).length === 0; R3.world = keepW;
    return o;
  });

  S.ok('the 3D mode is available to check', out.on, String(out.on));
  if (out.on) {
    S.ok('the countryside is built from the new game\'s first frame', out.firstFrame, JSON.stringify(out.n));
    S.ok('...with every kind of piece on this map', Object.keys(out.n).every(function (k) { return out.n[k] > 0; }), JSON.stringify(out.n));
    S.ok('...in chunks, every one of them drawn', out.chunks > 1 && out.batched, out.chunks + ' chunks');
    S.ok('...at a modest share of the world batch\'s triangles', out.tris > 2000 && out.tris < out.worldTris * 0.08,
         Math.round(out.tris) + ' against the world\'s ' + Math.round(out.worldTris));
    S.ok('a minute of frames with it drawn leaves the game\'s cells exactly as they were', out.cellsSame, String(out.cellsSame));
    S.ok('the world batch leaves the farmsteads\' trees out', out.noClaims > out.withClaims && out.rebuilt === out.withClaims,
         Math.round(out.withClaims) + ' triangles with the claims, ' + Math.round(out.noClaims) + ' without');
    S.ok('a field changes the picture over the field', out.inside > out.fieldPx * 0.3, out.inside + ' px of a ' + Math.round(out.fieldPx) + ' px field, box ' + out.box.join(','));
    S.ok('...and only there', out.outside < out.inside * 0.15, out.outside + ' px changed elsewhere');
    S.ok('a building on a wreck takes the wreck away', out.wreckGone > 50, out.wreckGone + ' triangles');
    S.ok('...and it is back when the ground clears', out.wreckBack, String(out.wreckBack));
    S.ok('ore spreading under a field takes the field away', out.fieldGone > 500, out.fieldGone + ' triangles');
    S.ok('...and it is back with the ore gone', out.fieldBack, String(out.fieldBack));
    S.ok('with the world cleared for bare ground the countryside goes too', out.bareEmpty, String(out.bareEmpty));
  }
  S.ok('no page errors', g.errors.length === 0, g.errors.join(' | ') || 'none');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
