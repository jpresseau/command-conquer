/* THE BASES ARE LIVED IN - render3d/dress3d.js.

   Crates, oil drums, sandbags and lamps on the paved ring round every building:

     WHERE       every dressed cell is paving, open, and on a building's side or back - never
                 its front, where units come out
     SEEN        R3.dressAmt 0 against 1 on one frame of the war factory: the props change the
                 picture, and only near the buildings
     FOLLOWS     a new building is dressed as soon as it stands, and a razed one loses its
                 dressing with it */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('dress');

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
    var R3 = window._R3D;
    o.on = !!(R3 && R3.on);
    if (!o.on) return o;
    window.RTS_POST_ON = false;
    R3.cloudAmt = 0;
    var wf = null;
    for (i = 0; i < G.ents.length; i++) if (G.ents[i].def === 'factory') { wf = G.ents[i]; break; }
    R.focus.x = wf.x; R.focus.z = wf.z + 2; R.zi = RTS_ZOOMS.length - 2; _rtsApplyCam();
    /* from the new game's first frame: it once came a frame late, as the world was rebuilt */
    _rtsRFrame(0);
    o.firstFrame = R3.dressG === G && R3.dressCells > 0;
    _rtsRFrame(0);

    /* WHERE: every dressed cell against the buildings it could belong to */
    function where() {
      var paved = _r3dPaved(G), bad = { paving: 0, blocked: 0, front: 0, loose: 0 };
      (R3.dressAt || []).forEach(function (k) {
        var tx = k % RTS_N, tz = (k / RTS_N) | 0, side = false, front = false;
        if (!paved[k]) bad.paving++;
        if (G.blocked[k]) bad.blocked++;
        G.ents.forEach(function (e) {
          if (e.type !== 'struct' || e.dead) return;
          var d = rtsStructDef(e.def);
          var inX = tx >= e.tx && tx < e.tx + d.w, inZ = tz >= e.tz && tz < e.tz + d.h;
          if ((inZ && (tx === e.tx - 1 || tx === e.tx + d.w)) || (inX && tz === e.tz - 1)) side = true;
          if (inX && tz === e.tz + d.h) front = true;
        });
        if (!side) bad.loose++;
        if (front && !side) bad.front++;
      });
      return bad;
    }
    o.cells = R3.dressCells; o.bad = where();
    /* a dressed cell turned to rock - unpaved and blocked, as rock and trees in a ring are -
       goes bare on the next rebuild, so the checks above are about cells that could fail them */
    var k0 = R3.dressAt[0], t0k = G.terrain[k0], b0k = G.blocked[k0];
    G.terrain[k0] = RTS_T_ROCK; G.blocked[k0] = 2; R3.dressKey = null;
    _rtsRFrame(0);
    o.rockBare = R3.dressAt.indexOf(k0) < 0;
    G.terrain[k0] = t0k; G.blocked[k0] = b0k; R3.dressKey = null;
    _rtsRFrame(0);

    /* SEEN */
    var gl = R3.gl, CW = R3.cv.width, CH = R3.cv.height;
    function shot(amt) {
      R3.dressAmt = amt; _rtsRFrame(0);
      var b = new Uint8Array(CW * CH * 4);
      gl.readPixels(0, 0, CW, CH, gl.RGBA, gl.UNSIGNED_BYTE, b);
      return b;
    }
    var A = shot(0), B = shot(1), n = 0, far = 0;
    for (var y = 0; y < CH; y += 2) for (var x = 0; x < CW; x += 2) {
      var q = ((CH - 1 - y) * CW + x) * 4;
      if (Math.abs(A[q] - B[q]) + Math.abs(A[q + 1] - B[q + 1]) + Math.abs(A[q + 2] - B[q + 2]) <= 20) continue;
      n++;
      var w = _rtsGroundAt(x / R.dpr, y / R.dpr), near = false;
      if (w) G.ents.forEach(function (e) {
        if (e.type !== 'struct' || e.dead) return;
        var d = rtsStructDef(e.def), cx = _rtsWX(e.tx) - RTS_TILE / 2 + d.w * RTS_TILE / 2, cz = _rtsWX(e.tz) - RTS_TILE / 2 + d.h * RTS_TILE / 2;
        if (Math.abs(w.x - cx) < d.w * RTS_TILE / 2 + RTS_TILE * 2.5 && Math.abs(w.z - cz) < d.h * RTS_TILE / 2 + RTS_TILE * 2.5) near = true;
      });
      if (!near) far++;
    }
    o.px = n; o.far = far;
    R3.dressAmt = undefined;

    /* FOLLOWS: a power plant put down on open ground near the yard, then razed */
    var yd = _rtsHas('player', 'yard'), put = null;
    for (var r = 4; r < 16 && !put; r++) for (var ox = -r; ox <= r && !put; ox++) for (var oz = -r; oz <= r && !put; oz++) {
      if (Math.max(Math.abs(ox), Math.abs(oz)) !== r) continue;
      if (_rtsCanPlace('player', 'power', yd.tx + ox, yd.tz + oz)) put = _rtsPlaceStruct('player', 'power', yd.tx + ox, yd.tz + oz, true);
    }
    o.placed = !!put;
    var before = R3.dressCells;
    _rtsRFrame(0);
    o.afterBuild = R3.dressCells; o.badAfter = where();
    if (put) { _rtsKill(put); for (var k2 = 0; k2 < 400 && G.ents.indexOf(put) >= 0; k2++) _rtsTick(0.05); }
    _rtsRFrame(0);
    o.before = before; o.afterRaze = R3.dressCells;
    R3.cloudAmt = undefined;
    return o;
  });

  S.ok('the 3D mode is available to check', out.on, out.on ? 'on' : 'no WebGL');
  if (!out.on) { await g.close(); await browser.close(); return require('../lib/report.js')(S); }
  var b = out.bad;
  S.ok('the bases are dressed', out.cells > 15, out.cells + ' cells carry props');
  S.ok('...from a new game\'s very first frame', out.firstFrame, String(out.firstFrame));
  S.ok('...every one on paving, on open ground', b.paving === 0 && b.blocked === 0, JSON.stringify(b));
  S.ok('...on a building\'s side or back, never loose and never its front', b.loose === 0 && b.front === 0, JSON.stringify(b));
  S.ok('...and a dressed cell turned to rock goes bare', out.rockBare, String(out.rockBare));
  S.ok('the props change the picture', out.px > 150, out.px + ' sampled pixels change');
  S.ok('...only near the buildings', out.far < out.px * 0.03, out.far + ' of them further than two and a half cells out');
  S.ok('a new building is dressed as soon as it stands', out.placed && out.afterBuild > out.before && out.badAfter.loose === 0,
       out.before + ' cells before, ' + out.afterBuild + ' with it');
  S.ok('...and a razed one takes its dressing with it', out.afterRaze === out.before, out.afterRaze + ' after it is gone');
  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
