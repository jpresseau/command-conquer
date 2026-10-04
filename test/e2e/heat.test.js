/* THE AIR SHIMMERS OVER WHAT BURNS - render3d/heat3d.js, in the composite (resolve3d.js).

   A fire burning on the war factory, the frame taken R3.heatAmt 0 against 1:

     THE COLUMN   the picture wavers in a column standing on the fire, and nowhere else
     IT MOVES     a quarter of a second on, the ripple is somewhere else in the column - with
                  the effects' own quads, the clouds, the wind and the firelight held still, and
                  over a fireball at one age rather than a flickering fire, so the ripple is the
                  only thing in its column that can move
     THE SWITCH   RTS_POST_ON takes it out with the rest of the light pass */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('heat');

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
    rts3dSet(true);
    var R3 = window._R3D;
    o.on = !!(R3 && R3.on);
    if (!o.on) return o;
    o.post = !!R3.postReady;
    var wf = null;
    for (i = 0; i < G.ents.length; i++) if (G.ents[i].def === 'factory') { wf = G.ents[i]; break; }
    o.found = !!wf;
    if (!wf || !o.post) return o;
    G.fx.length = 0;
    G.fx.push({ kind: 'firebig', x: wf.x, y: 1, z: wf.z, t: 0.3, big: 2.2, att: wf.id, loops: 400 });
    R.focus.x = wf.x; R.focus.z = wf.z - 6; R.zi = RTS_ZOOMS.length - 2; _rtsApplyCam();
    /* everything else that moves with the clock, held still */
    R3.cloudAmt = 0; R3.swayAmt = 0; R3.plightAmt = 0;
    var draw = window._r3dFxDraw;
    window._r3dFxDraw = function () { return 0; };
    var gl = R3.gl, CW = R3.cv.width, CH = R3.cv.height, t0 = G.t;
    function shot(amt, t) {
      R3.heatAmt = amt; G.t = t;
      _rtsRFrame(0);
      var b = new Uint8Array(CW * CH * 4);
      gl.readPixels(0, 0, CW, CH, gl.RGBA, gl.UNSIGNED_BYTE, b);
      return b;
    }
    function diff(P, Q, each) {
      var n = 0;
      for (var y = 0; y < CH; y++) for (var x = 0; x < CW; x++) {
        var q = ((CH - 1 - y) * CW + x) * 4;
        if (Math.abs(P[q] - Q[q]) + Math.abs(P[q + 1] - Q[q + 1]) + Math.abs(P[q + 2] - Q[q + 2]) <= 12) continue;
        n++;
        if (each) each(x, y);
      }
      return n;
    }
    var A0 = shot(0, t0 + 1), B0 = shot(1, t0 + 1), A1 = shot(0, t0 + 1.25), B1 = shot(1, t0 + 1.25);
    o.heats = R3.heats;
    /* the column, on screen: where the source is and how wide it said it was */
    var l = R3.plList && R3.plList[0], p = l ? _rtsWorldToScreen(l[0], l[1], l[2]) : null;
    var hw = l ? l[5] * _rtsZoom() * (p.scale || 1) * R.dpr : 0, sx = p ? p.x * R.dpr : 0, sy = p ? p.y * R.dpr : 0;
    o.hw = +hw.toFixed(1);
    var inCol = 0, outCol = 0;
    o.changed = diff(A0, B0, function (x, y) {
      if (Math.abs(x - sx) < hw * 1.6 && y < sy + hw * 1.0 && y > sy - hw * 4.2) inCol++; else outCol++;
    });
    o.inCol = inCol; o.outCol = outCol;
    /* over the column only: the sea at the top of the frame swells and rolls on its own clock */
    function col(P, Q) {
      var n = 0;
      diff(P, Q, function (x, y) { if (Math.abs(x - sx) < hw * 1.6 && y < sy + hw * 1.0 && y > sy - hw * 4.2) n++; });
      return n;
    }
    o.stillWithout = col(A0, A1);
    /* the ripple's own motion, from a fireball held at one age rather than the fire: a fire's
       heat flickers with the clock, and a flicker changes the picture even where the ripple
       stands still. A fresh blast is past full strength, so its column holds steady. */
    G.fx.length = 0;
    G.fx.push({ kind: 'boom', x: wf.x, y: 1, z: wf.z, t: 0.05, big: 1.6 });
    var E0 = shot(1, t0 + 1), E1 = shot(1, t0 + 1.25);
    l = R3.plList && R3.plList[0]; p = _rtsWorldToScreen(l[0], l[1], l[2]);
    hw = l[5] * _rtsZoom() * (p.scale || 1) * R.dpr; sx = p.x * R.dpr; sy = p.y * R.dpr;
    o.movesWith = col(E0, E1);
    /* the light pass's switch */
    window.RTS_POST_ON = false;
    var C0 = shot(0, t0 + 1), C1 = shot(1, t0 + 1);
    window.RTS_POST_ON = true;
    o.offChanged = diff(C0, C1);
    window._r3dFxDraw = draw;
    gl.getError(); shot(1, t0 + 1); o.glErr = gl.getError();
    G.t = t0;
    R3.heatAmt = undefined; R3.cloudAmt = undefined; R3.swayAmt = undefined; R3.plightAmt = undefined;
    return o;
  });

  S.ok('the 3D mode is available to check', out.on, out.on ? 'on' : 'no WebGL');
  if (!out.on || !out.found || !out.post) {
    S.ok('a war factory to set alight, and the composite the haze is drawn in', out.found && out.post,
         'factory ' + out.found + ', post buffer ' + out.post);
    await g.close(); await browser.close();
    return require('../lib/report.js')(S);
  }
  S.ok('the fire sends up a column of heat', out.heats >= 1 && out.hw > 10, out.heats + ' column, ' + out.hw + 'px either side');
  S.ok('the picture wavers in it', out.changed > 300, out.changed + ' pixels move by more than 12 levels');
  S.ok('...in the column standing on the fire, and nowhere else', out.outCol < out.changed * 0.02,
       out.inCol + ' in the column, ' + out.outCol + ' outside it');
  S.ok('with the haze off, nothing in the column moves in a quarter of a second', out.stillWithout === 0,
       out.stillWithout + ' pixels change');
  S.ok('...and with it on, over a fireball held at one age, the ripple has moved', out.movesWith > 300,
       out.movesWith + ' pixels in its column change');
  S.ok('RTS_POST_ON takes the haze out with the rest of the light pass', out.offChanged === 0,
       out.offChanged + ' pixels change with it off, heat asked for and not');
  S.eq('no draw is refused with the haze on', out.glErr, 0);
  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
