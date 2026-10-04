/* THE BRIDGE LAYER, ON THE SCREEN (core/bridgelayer.js, render3d/bridge3d.js), with real input:

     THE D KEY     a Bridge Layer at the water's edge, selected, and the D key pressed becomes a
                   bridge across the gap ahead
     DRAWN         the 3D view builds a mesh for the new bridge on the next frame - the map's
                   bridges are otherwise built once per map - and it stands over the water it
                   spans, where the camera can see it: pixels change there and nowhere far off */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('bridgelayer');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 1000, height: 700 });
  await g.start(7, 1, { freeze: true });
  var p = g.page;

  var set = await p.evaluate(function () {
    var G = window._rtsG, R = _rtsR, N = RTS_N, T = G.terrain, B = G.blocked, W = RTS_T_WATER, at = null;
    for (var i = 0; i < N * N; i++) { G.mapped[i] = 1; G.vis[i] = 1; }
    G.visDirty = 1;
    /* a gap the layer would really span, asked of its own gap finder, facing east */
    for (var tz = 4; tz < N - 4 && !at; tz++) for (var tx = 4; tx < N - 4 && !at; tx++) {
      var i0 = _rtsIdx(tx, tz);
      if (T[i0] === W || B[i0] !== 0) continue;
      var gp = _rtsBridgeGap({ x: _rtsWX(tx), z: _rtsWX(tz), rot: 0 });
      if (gp && gp.dx === 1 && gp.len >= 2) at = { tx: tx, tz: tz, len: gp.len };
    }
    if (!at) return null;
    var ly = _rtsSpawnUnit('player', 'bridgelayer', _rtsWX(at.tx), _rtsWX(at.tz));
    ly.rot = 0; window.__ly = ly;
    R.focus.x = _rtsWX(at.tx + at.len / 2 + 0.5); R.focus.z = _rtsWX(at.tz); R.zi = RTS_ZOOMS.length - 2; _rtsApplyCam();
    G.sel.length = 0; G.sel.push(ly);
    _rtsRFrame(0); _rtsRFrame(0);
    window.__mid = _rtsWorldToScreen(_rtsWX(at.tx + (at.len + 1) / 2), _rtsElev(_rtsWX(at.tx + (at.len + 1) / 2), _rtsWX(at.tz)), _rtsWX(at.tz));
    return { at: at, meshes: (window._R3D.bridges || []).length, bridges: G.bridges.length };
  });
  S.ok('the case: a gap a layer can span, in view', !!set, set ? JSON.stringify(set.at) : 'none on this map');

  function grab() {
    return p.evaluate(function () {
      var R3 = window._R3D, gl = R3.gl, R = _rtsR;
      _rtsRFrame(0); _rtsRFrame(0);
      var W = R3.cv.width, H = R3.cv.height, k = W / R.W, m = window.__mid;
      var x = Math.round(m.x * k), y = H - Math.round(m.y * k), px = new Uint8Array(4 * 41 * 41);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.readPixels(x - 20, y - 20, 41, 41, gl.RGBA, gl.UNSIGNED_BYTE, px);
      var far = new Uint8Array(4 * 41 * 41);
      gl.readPixels(10, 10, 41, 41, gl.RGBA, gl.UNSIGNED_BYTE, far);
      return { mid: Array.from(px), far: Array.from(far), meshes: (R3.bridges || []).length };
    });
  }
  if (set) {
    var before = await grab();
    await p.mouse.move(500, 350);
    await p.keyboard.press('d');
    var laid = await p.evaluate(function () { return { bridges: window._rtsG.bridges.length, gone: window.__ly.dead }; });
    S.ok('at the water\'s edge, the D key turns the layer into a bridge', laid.bridges === set.bridges + 1 && laid.gone,
         set.bridges + ' -> ' + laid.bridges + ' bridges, layer ' + (laid.gone ? 'spent' : 'still there'));
    var after = await grab();
    S.ok('the 3D view builds a mesh for it on the next frame', after.meshes === before.meshes + 1, before.meshes + ' -> ' + after.meshes);
    function diff(a, b) { var n = 0; for (var i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 30) n++; return n; }
    var dm = diff(before.mid, after.mid), df = diff(before.far, after.far);
    S.ok('...standing over the water it spans: the picture changes there, and not far off', dm > 200 && df < 40,
         dm + ' of 1681 pixels changed over the gap, ' + df + ' in a far corner');
  }

  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');
  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
