/* WHAT WAS BUILT HAS STOOD OUT IN THE WEATHER - render3d/weather3d.js.

   Buildings and vehicles were flat paint, one tone to a face. The mesh program ages them per
   pixel now: stains over every face, rain streaks down the walls, grime rising from the foot.
   Measured as an A/B in one page - every mesh's `weather` set to 0 is the before-picture:

     ONLY THE BUILT   the wear lands on buildings and units and nowhere else: trees, rock,
                      crystals and the ground share the program and must not change
     THE WALLS        a building's faces are no longer flat: the spread of tone across them grows
     THE FOOT         a wall is dirtier at its foot than it was - darker, and browner
     THE DISTANCE     it fades out where it would only shimmer, as the ground's detail does */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('wear');

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
    R.focus.x = wf.x; R.focus.z = wf.z; R.zi = RTS_ZOOMS.length - 2; _rtsApplyCam();
    var gl = R3.gl, CW = R3.cv.width, CH = R3.cv.height;
    function shot() {
      _rtsRFrame(0); _rtsRFrame(0);
      var b = new Uint8Array(CW * CH * 4);
      gl.readPixels(0, 0, CW, CH, gl.RGBA, gl.UNSIGNED_BYTE, b);
      return b;
    }
    function wear(on) {
      for (var k in R3.mesh) {
        var m = R3.mesh[k];
        if (!m) continue;
        if (m.w0 === undefined) m.w0 = m.weather || 0;
        m.weather = on ? m.w0 : 0;
      }
    }
    shot();
    wear(true); var A = shot(); o.wearNear = R3.wear;
    wear(false); var B = shot();
    /* where the entities are: the frame with them against the frame without */
    var keep = G.ents; G.ents = [];
    var E = shot();
    G.ents = keep;
    wear(true);

    function isBuilt(q) { return Math.abs(B[q] - E[q]) + Math.abs(B[q + 1] - E[q + 1]) + Math.abs(B[q + 2] - E[q + 2]) > 6; }
    function lum(b, q) { return b[q] * 0.299 + b[q + 1] * 0.587 + b[q + 2] * 0.114; }
    var built = 0, dOn = 0, off = 0, dOff = 0, q;
    for (q = 0; q < A.length; q += 4) {
      var dd = Math.abs(A[q] - B[q]) + Math.abs(A[q + 1] - B[q + 1]) + Math.abs(A[q + 2] - B[q + 2]);
      if (isBuilt(q)) { built++; dOn += dd; } else { off++; dOff += dd; }
    }
    o.built = built; o.changeOn = +(dOn / built).toFixed(2); o.changeOff = +(dOff / off).toFixed(3);

    /* THE FOOT, on every building in view: the lowest band of the wall that faces the camera,
       sampled across the footprint - where the unweathered frame shows lit wall there, not a
       doorway or a shadow - against the band a storey up */
    var foot = [0, 0, 0], footW = [0, 0, 0], up = 0, upW = 0, nf = 0;
    G.ents.forEach(function (e) {
      if (e.dead || e.type !== 'struct') return;
      var dd2 = rtsStructDef(e.def), gy = _rtsElev(e.x, e.z);
      var zf = _rtsWX(e.tz + dd2.h - 1) + RTS_TILE * 0.5 - 0.35;
      for (var t = 0.1; t <= 0.9; t += 0.02) {
        var wx = _rtsWX(e.tx) - RTS_TILE * 0.5 + dd2.w * RTS_TILE * t;
        var p0 = _rtsWorldToScreen(wx, gy + 0.3, zf), p1 = _rtsWorldToScreen(wx, gy + 2.6, zf);
        var a0 = Math.round(p0.x * R.dpr), b0 = Math.round(p0.y * R.dpr), a1 = Math.round(p1.x * R.dpr), b1 = Math.round(p1.y * R.dpr);
        if (a0 < 0 || b0 < 0 || a0 >= CW || b0 >= CH || a1 < 0 || b1 < 0 || a1 >= CW || b1 >= CH) continue;
        var k0 = ((CH - 1 - b0) * CW + a0) * 4, k1 = ((CH - 1 - b1) * CW + a1) * 4;
        if (!isBuilt(k0) || !isBuilt(k1) || lum(B, k0) < 60 || lum(B, k1) < 60) continue;
        for (var c = 0; c < 3; c++) { foot[c] += B[k0 + c]; footW[c] += A[k0 + c]; }
        up += lum(B, k1); upW += lum(A, k1); nf++;
      }
    });
    o.footN = nf;
    o.footOff = foot.map(function (v) { return +(v / nf).toFixed(1); });
    o.footOn = footW.map(function (v) { return +(v / nf).toFixed(1); });
    o.upOff = +(up / nf).toFixed(1); o.upOn = +(upW / nf).toFixed(1);

    /* NOT FLAT: tone differences eight pixels apart across faces the unweathered frame paints
       flat - the wear is broad, stains a unit or more across, so a pixel's next-door neighbour
       hardly differs, but its neighbour a stain away does */
    function rough(buf) {
      var sum = 0, n = 0;
      for (var y = 0; y < CH; y += 2) for (var x = 0; x < CW - 8; x += 2) {
        var q3 = (y * CW + x) * 4, r = q3 + 32;
        if (!isBuilt(q3) || !isBuilt(r)) continue;
        if (Math.abs(B[q3] - B[r]) + Math.abs(B[q3 + 1] - B[r + 1]) + Math.abs(B[q3 + 2] - B[r + 2]) > 3) continue;
        sum += Math.abs(buf[q3] - buf[r]) + Math.abs(buf[q3 + 1] - buf[r + 1]) + Math.abs(buf[q3 + 2] - buf[r + 2]);
        n++;
      }
      return { mean: n ? +(sum / n).toFixed(2) : 0, n: n };
    }
    var rA = rough(A), rB = rough(B);
    o.roughOn = rA.mean; o.roughOff = rB.mean; o.flatN = rA.n;

    /* ...and at the farthest zoom it is faded */
    R.zi = 0; _rtsApplyCam(); shot();
    o.wearFar = R3.wear;
    window.RTS_POST_ON = true;
    return o;
  });

  S.ok('the 3D mode is available to check', out.on, out.on ? 'on' : 'no WebGL');
  if (!out.on || !out.found) {
    S.ok('a war factory is on the map to look at', out.found, String(out.found));
    await g.close(); await browser.close();
    return require('../lib/report.js')(S);
  }
  S.ok('the wear lands on what was built', out.built > 5000 && out.changeOn > 2,
       'a pixel of a building or unit moves ' + out.changeOn + ' levels on average, over ' + out.built);
  S.ok('...and nowhere else: trees, rock, crystals and the ground are untouched', out.changeOff < 0.02,
       'a pixel of anything else moves ' + out.changeOff);
  S.ok('a face is no longer one flat tone', out.flatN > 2000 && out.roughOn > out.roughOff + 3,
       'pixels 8 apart on faces that were flat differ by ' + out.roughOff + ' levels before and ' +
       out.roughOn + ' with the wear, over ' + out.flatN + ' pairs');
  var fa = out.footOn, fb = out.footOff;
  S.ok('lit wall at the foot of a building is found to look at', out.footN >= 20, out.footN + ' samples');
  function L(c) { return c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114; }
  var footDrop = L(fb) - L(fa), upDrop = out.upOff - out.upOn;
  S.ok('...and it is darker than it was, where the wall a storey up is not',
       footDrop > upDrop + 12,
       'the foot\'s luma drops ' + footDrop.toFixed(1) + ' (rgb ' + fb + ' -> ' + fa + '), a storey up ' + upDrop.toFixed(1));
  S.ok('...and browner: grime is mud, not shadow - red holds up against blue as it darkens',
       fa[0] / fa[2] > fb[0] / fb[2] + 0.05,
       'red to blue ' + (fb[0] / fb[2]).toFixed(3) + ' -> ' + (fa[0] / fa[2]).toFixed(3));
  S.ok('it fades out at the farthest zoom, where it would only shimmer', out.wearFar < 0.5 && out.wearNear === 1,
       'full at the near rung (' + out.wearNear + '), ' + out.wearFar + ' at the far one');
  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
