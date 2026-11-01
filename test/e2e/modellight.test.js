/* THE LIGHT ON EVERY MODEL - render3d/light3d.js _shade, render3d/meshfs3d.js.

   The ramp lit a model with one sun and one floor: a face in shade was the ramp's one grey
   whichever way it faced, steel was near black, and a model stood on the ground rather than in
   it. Three terms on top of that ramp, each with its own knob as the before-picture
   (R3.fillAmt, R3.metalAmt, R3.gaoAmt), read off a staged power plant with the post stack off:

     THE FILL      the sky's cool light from above and the earth's warm bounce from below:
                   the building is brighter with it, and at night it adds less than by day
     STEEL         the dark, unsaturated parts (tracks, barrels, trims) reflect the sky and take a
                   broad highlight: the building's darkest pixels brighten, its paint barely moves
     SEATED        the lowest hand-span of what is placed is in its own and the earth's shade:
                   what that darkens is at the building's foot, next to none in its top two-fifths

   On a power plant rather than a tank: a building is drawn whole through the batched path, where
   a tank's turret is drawn apart from its hull.

   A RIM LIGHT WAS TRIED AND TAKEN OUT. Fresnel on these faceted models is not an outline: a wall
   turned side-on to the view takes it across its whole face, so it flattened the form it was
   meant to lift (the building brightened 24.7 inside against 7.1 at its outline). */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('modellight');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 700, height: 560, dpr: 1 });
  await g.start(7, 1, { freeze: true });

  var out = await g.page.evaluate(function () {
    var o = {}, R = _rtsR, G = window._rtsG, R3 = window._R3D, i;
    o.on = !!(R3 && R3.on);
    if (!o.on) return o;
    for (i = 0; i < RTS_N * RTS_N; i++) { G.mapped[i] = 1; G.vis[i] = 1; }
    G.visDirty = 1;
    window.RTS_POST_ON = false; window.RTS_SKY_FORCE = 'day';
    G.ents.forEach(function (e) { if (e.type === 'unit') e.dead = true; });
    var yd = _rtsHas('player', 'yard');
    var x = yd.x + 18, z = yd.z + 16;
    R.zi = RTS_ZOOMS.length - 2; R.focus.x = x; R.focus.z = z; _rtsApplyCam();
    var gl = R3.gl, CW = R3.cv.width, CH = R3.cv.height;
    function shot() {
      _rtsRFrame(1 / 60); _rtsRFrame(1 / 60);
      var b = new Uint8Array(CW * CH * 4);
      gl.readPixels(0, 0, CW, CH, gl.RGBA, gl.UNSIGNED_BYTE, b);
      return b;
    }
    function lum(b, p) { return b[p * 4] + b[p * 4 + 1] + b[p * 4 + 2]; }
    var bare = shot();
    /* a building, drawn whole through the batched path */
    var who = window.__ML_WHO || 'power', t = null, ttx = _rtsTX(x), ttz = _rtsTX(z);
    for (var k = 0; k < 40 && !t; k++) {
      var cx = ttx + (k % 7) - 3, cz = ttz + ((k / 7) | 0) - 3;
      if (_rtsCanPlace('player', who, cx, cz, true)) { t = _rtsPlaceStruct('player', who, cx, cz, true); t.building = 0; }
    }
    if (!t) return o;
    o.who = who;
    R.focus.x = t.x; R.focus.z = t.z; _rtsApplyCam();
    t.dead = true; bare = shot(); t.dead = false;          /* the bare frame again, from here */
    function knobs(f, a, m) { R3.fillAmt = f; R3.gaoAmt = a; R3.metalAmt = m; }
    knobs(1, 1, 1); var all = shot();
    /* ...and its shape from frames without the sun's shadows, or its shadow on the ground behind
       it counts as building */
    var q0 = R3.q; R3.q = Object.assign({}, q0, { shadow: 0 });
    var bareNS = (function () { t.dead = true; var b = shot(); t.dead = false; return b; })(), allNS = shot();
    /* (dead skips the draw; the rubble a kill leaves is not wanted, so the flag, not _rtsKill) */
    R3.q = q0;
    /* the building's pixels: where the frame with it differs from the bare one, inside a box round
       where it stands - smoke and water move between frames elsewhere on the screen */
    var sc = _rtsWorldToScreen(t.x, _rtsElev(t.x, t.z) + 2, t.z), bx = sc.x * CW / R.W, by = CH - 1 - sc.y * CH / R.H, BOX = 0.45 * CW;
    var mask = new Uint8Array(CW * CH), n = 0, y0 = CH, y1 = 0;
    for (var p = 0; p < CW * CH; p++) {
      if (Math.abs((p % CW) - bx) > BOX || Math.abs(((p / CW) | 0) - by) > BOX) continue;
      if (Math.abs(lum(allNS, p) - lum(bareNS, p)) > 24) { mask[p] = 1; n++; }
    }
    for (p = 0; p < CW * CH; p++) if (mask[p]) { var yy = (p / CW) | 0; y0 = Math.min(y0, yy); y1 = Math.max(y1, yy); }
    o.n = n;
    /* readPixels rows run bottom-up: the screen's BOTTOM of the building is the buffer's low rows */
    function over(b, test) { var s = 0, c = 0; for (var q = 0; q < CW * CH; q++) if (mask[q] && test(q)) { s += lum(b, q); c++; } return c ? s / c : 0; }
    knobs(0, 1, 1); var noFill = shot();
    knobs(1, 0, 1); var noGao = shot();
    knobs(1, 1, 0); var noMetal = shot();
    /* steel: the building's own pixels, ranked by how bright they are without it - the dark third
       is its steel, the bright third its paint */
    var px = []; for (var mq = 0; mq < CW * CH; mq++) if (mask[mq]) px.push(mq);
    px.sort(function (a2, b2) { return lum(noMetal, a2) - lum(noMetal, b2); });
    var third = Math.floor(px.length / 3), dk = px.slice(0, third), br = px.slice(px.length - third);
    function gain(list) { var s2 = 0; list.forEach(function (q) { s2 += lum(all, q) - lum(noMetal, q); }); return list.length ? s2 / list.length : 0; }
    o.metDark = gain(dk); o.metBright = gain(br);
    var any = function () { return true; };
    o.fill = [over(all, any), over(noFill, any)];
    /* what the contact shade darkens, against how tall the building stands on the screen: its
       mask's top row is the roof (the plaza that comes and goes with it is ground, and low) */
    o.gaoN = 0; o.gaoTop = 0;
    var span = y1 - y0, cut = y1 - span * 0.4;
    for (var gq = 0; gq < CW * CH; gq++) {
      if (!mask[gq]) continue;                     /* this building's, not its neighbours' feet */
      if (lum(noGao, gq) - lum(all, gq) > 3) { o.gaoN++; if (((gq / CW) | 0) > cut) o.gaoTop++; }
    }
    o.span = span;

    window.RTS_SKY_FORCE = 'night';
    knobs(1, 1, 1); var nAll = shot();
    knobs(0, 1, 1); var nNoFill = shot();
    o.nightFill = over(nAll, any) - over(nNoFill, any);
    knobs(undefined, undefined, undefined);
    window.RTS_SKY_FORCE = 'day';
    o.err = gl.getError();
    return o;
  });

  S.ok('the 3D view is on', out.on, '');
  if (out.on) {
    S.ok('(the staging: the building covers a few hundred pixels or more)', out.n > 300, out.n + ' pixels');
    S.ok('THE FILL: the building is brighter with the sky and the earth lighting it',
         out.fill[0] > out.fill[1] * 1.03, out.fill.map(function (v) { return v.toFixed(1); }).join(' with, ') + ' without');
    S.ok('...and at night it adds less than by day', out.nightFill < (out.fill[0] - out.fill[1]) * 0.5,
         'night ' + out.nightFill.toFixed(1) + ', day ' + (out.fill[0] - out.fill[1]).toFixed(1));
    S.ok('SEATED: the foot of the building darkens, and next to nothing in the top two-fifths of it does', out.gaoN > 50 && out.gaoTop <= out.gaoN * 0.01 && out.span > 30,
         out.gaoN + ' pixels darkened, ' + out.gaoTop + ' of them in the top two-fifths of a building ' + out.span + ' rows tall');
    S.ok('STEEL: the dark parts brighten - they are steel catching the sky - and the paint barely moves',
         out.metDark > 4 && out.metBright < out.metDark * 0.35, 'darkest third +' + out.metDark.toFixed(1) + ', brightest third +' + out.metBright.toFixed(1));
    S.ok('no GL error', out.err === 0, 'error ' + out.err);
  }
  S.ok('the page logged no errors', !g.errors.length, g.errors.slice(0, 2).join(' | ') || 'clean');
  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
