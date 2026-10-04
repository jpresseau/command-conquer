/* TURNING AND LEANING THE 3D CAMERA - render3d/cam3d.js and ui/orbit.js.

   The camera faced north at one lean. Now it has a yaw and a tilt, and the part that can break
   is the SEAM: the shaders turn the world by the yaw on the GPU and the CPU turns it again for
   every click, bar and pick. If the two turn different ways, every order lands beside where it
   was aimed. So, at several yaws and leans:

     THE SHADERS AND THE CPU AGREE   a map cell's fog flipped, and a selection ring drawn, land
                                     where _rtsGroundToScreen says, read off the frame
     PICKING ROUND-TRIPS             screen -> ground -> screen returns the pixel
     THE CONTROLS                    middle-drag and Alt+right-drag turn and lean, holding the
                                     middle of the screen still; middle-click and the compass
                                     face north again; Q/E and Page Up/Down; the lean stays in
                                     its range; a still Alt+right-click is still the order
     THE SCREEN'S AXES               the up arrow moves the view up the SCREEN, not north
     THE RADAR                       its frame is the view's true corners
     THE COMPASS                     shown in 3D only, its needle turned to north */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('orbit');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 900, height: 640, dpr: 1 });
  await g.start(7, 20, { freeze: true });
  var P = g.page, M = P.mouse;
  var on = await P.evaluate(function () { return !!(window._R3D && window._R3D.on); });
  S.ok('the 3D mode is available to check', on, on ? 'on' : 'no WebGL');
  if (!on) { await g.close(); await browser.close(); return require('../lib/report.js')(S); }

  var seam = await P.evaluate(function () {
    var R = _rtsR, G = window._rtsG, R3 = window._R3D, o = { views: [] };
    o.start = { yaw: R3.yaw, tilt: R3.tilt, def: R3D_TILT };
    R3.gradeAmt = 0; R3.cloudAmt = 0; R3.swayAmt = 0; R3.surfAmt = 0;
    for (var i = 0; i < RTS_N * RTS_N; i++) { G.mapped[i] = 1; G.vis[i] = 1; }
    G.visDirty = 1;
    var gl = R3.gl, CW = R3.cv.width, CH = R3.cv.height;
    function shot() { _rtsRFrame(1 / 60); var b = new Uint8Array(CW * CH * 4); gl.readPixels(0, 0, CW, CH, gl.RGBA, gl.UNSIGNED_BYTE, b); return b; }
    function centroid(A, B) {
      var sx = 0, sy = 0, sw = 0;
      for (var y = 0; y < CH; y++) for (var x = 0; x < CW; x++) {
        var p = (y * CW + x) * 4;
        if (Math.abs(A[p] - B[p]) + Math.abs(A[p + 1] - B[p + 1]) + Math.abs(A[p + 2] - B[p + 2]) > 8) { sx += x; sy += y; sw++; }
      }
      return sw ? { x: sx / sw / R.dpr, y: (CH - 1 - sy / sw) / R.dpr, n: sw } : null;
    }
    /* a unit of ours, for the ring */
    var u = null;
    G.ents.forEach(function (e) { if (!u && e.side === 'player' && e.type === 'unit' && !e.dead && !e.inside && e.def !== 'mcv') u = e; });
    o.unit = !!u;
    var views = [[0, R3D_TILT], [0.9, R3D_TILT], [2.6, 0.6], [-1.7, R3D_TILT_MAX], [-2.9, R3D_TILT_MIN]];
    views.forEach(function (v) {
      _r3dCamSet(v[0], v[1]);
      R.zi = 2; R.focus.x = u ? u.x : 0; R.focus.z = u ? u.z : 0; _rtsApplyCam(); _rtsClampFocus();
      var r = { yaw: v[0], tilt: +R3.tilt.toFixed(3) };
      /* THE GROUND SHADER: a cell off to one side, its fog flipped */
      var c = _rtsGroundToScreen(R.focus.x, R.focus.z), probe = { x: R.W * 0.72, y: R.H * 0.34 };
      var w = _rtsGroundAt(probe.x, probe.y), tx = _rtsTX(w.x), tz = _rtsTX(w.z), k = _rtsIdx(tx, tz);
      /* the shroud's drift (shroud3d.js) moves its edge a cell either way on purpose - the
         marker is read without it, since this measures the projection and not the fog */
      R3.shroudOff = true;
      var A = shot(); G.mapped[k] = 0; G.visDirty = 1; var B = shot(); G.mapped[k] = 1; G.visDirty = 1;
      R3.shroudOff = false;
      var m = centroid(A, B), cpu = _rtsGroundToScreen(_rtsWX(tx), _rtsWX(tz));
      r.cell = m ? +Math.hypot(m.x - cpu.x, m.y - cpu.y).toFixed(2) : null;
      /* THE RING SHADER: the unit selected and not */
      if (u) {
        G.sel.length = 0; var A2 = shot(); G.sel.push(u); var B2 = shot(); G.sel.length = 0;
        var m2 = centroid(A2, B2), cu = _rtsGroundToScreen(u.x, u.z);
        r.ring = m2 ? +Math.hypot(m2.x - cu.x, m2.y - cu.y).toFixed(2) : null;
      }
      /* PICKING over what is on screen */
      var worst = 0;
      for (var sy = 40; sy < R.H - 40; sy += (R.H - 80) / 5) for (var sx = 40; sx < R.W - 40; sx += (R.W - 80) / 5) {
        var gw = _rtsGroundAt(sx, sy);
        if (!gw) continue;
        var s = _rtsGroundToScreen(gw.x, gw.z);
        if (!s.behind) worst = Math.max(worst, Math.hypot(s.x - sx, s.y - sy));
      }
      r.pick = +worst.toFixed(4);
      /* THE RADAR'S FRAME: the view's corners, which project to the screen's corners */
      var vs = _rtsViewSpan(), cw = 0;
      if (vs.poly) {
        var want = [[0, 0], [R.W, 0], [R.W, R.H], [0, R.H]];
        vs.poly.forEach(function (q, j) { var s2 = _rtsWorldToScreen(q.x, 0, q.z); cw = Math.max(cw, Math.hypot(s2.x - want[j][0], s2.y - want[j][1])); });
      }
      r.corners = vs.poly ? +cw.toFixed(3) : null;
      o.views.push(r);
    });
    _r3dCamSet(0, R3D_TILT);
    R3.gradeAmt = undefined; R3.cloudAmt = undefined; R3.swayAmt = undefined; R3.surfAmt = undefined;
    return o;
  });

  S.ok('the camera starts facing north at the usual lean', seam.start.yaw === 0 && seam.start.tilt === seam.start.def, JSON.stringify(seam.start));
  S.ok('a unit of ours to ring', seam.unit, String(seam.unit));
  seam.views.forEach(function (v) {
    var tag = 'yaw ' + v.yaw + ', tilt ' + v.tilt + ': ';
    S.ok(tag + 'the ground shader puts a cell where the CPU does', v.cell !== null && v.cell < 2.5, v.cell + ' px apart');
    S.ok(tag + 'the ring shader puts a ring where the CPU does', v.ring !== null && v.ring < 2.5, v.ring + ' px apart');
    S.ok(tag + 'picking round-trips', v.pick < 0.05, v.pick + ' px');
    S.ok(tag + 'the radar\'s frame is the view\'s corners', v.corners !== null && v.corners < 0.05, v.corners + ' px');
  });

  /* ---------------- THE CONTROLS ---------------- */
  function cam() { return P.evaluate(function () { var R3 = window._R3D, R = _rtsR, w = _rtsGroundAt(R.W / 2, R.H / 2); return { yaw: R3.yaw, tilt: R3.tilt, w: w && { x: w.x, z: w.z }, fx: R.focus.x, fz: R.focus.z }; }); }
  function slip(w, x, y) { return P.evaluate(function (a) { var s = _rtsGroundToScreen(a[0].x, a[0].z); return +Math.hypot(s.x - a[1], s.y - a[2]).toFixed(2); }, [w, x, y]); }
  function park() {
    return P.evaluate(function () {
      var R = _rtsR, G = window._rtsG, U = window._rtsUI;
      _r3dCamSet(0, R3D_TILT); U.orbitTo = null; U.keys = {}; U.grab = null;
      R.focus.x = _rtsWX(RTS_N / 2); R.focus.z = _rtsWX(RTS_N / 2); R.zi = 2; _rtsApplyCam(); _rtsClampFocus();
      var u = null;
      G.ents.forEach(function (e) { if (!u && e.side === 'player' && e.type === 'unit' && !e.dead && !e.inside) u = e; });
      G.sel.length = 0; if (u) { G.sel.push(u); u.order = null; u.path = null; u.goal = null; }
      return { W: R.W, H: R.H };
    });
  }
  function drag(button, x0, y0, x1, y1, mods) {
    return (async function () {
      for (var m of mods || []) await P.keyboard.down(m);
      await M.move(x0, y0); await M.down({ button: button });
      for (var i = 1; i <= 8; i++) await M.move(x0 + (x1 - x0) * i / 8, y0 + (y1 - y0) * i / 8);
      await M.up({ button: button });
      for (var m2 of mods || []) await P.keyboard.up(m2);
    })();
  }
  var box = await park(), cx = box.W / 2, cy = box.H / 2;
  var c0 = await cam();
  await drag('middle', 320, 300, 420, 300);
  var c1 = await cam(), s1 = await slip(c0.w, cx, cy);
  S.ok('a middle-drag across turns the camera', Math.abs(c1.yaw - (-100 * 0.0065)) < 1e-6, 'yaw ' + c1.yaw.toFixed(4));
  S.ok('...holding the ground in the middle of the screen still', s1 < 1.5, s1 + ' px');
  var c2a = await cam();
  await drag('middle', 320, 300, 320, 280);
  var c2 = await cam();
  S.ok('...and dragged up it leans the camera over', Math.abs(c2.tilt - c2a.tilt - 20 * 0.004) < 1e-6, 'tilt ' + c2a.tilt.toFixed(3) + ' -> ' + c2.tilt.toFixed(3));
  await M.move(300, 300); await M.down({ button: 'middle' }); await M.up({ button: 'middle' });
  var back = await P.evaluate(function () { for (var i = 0; i < 120; i++) _rtsOrbitTick(1 / 60); return { yaw: window._R3D.yaw, tilt: window._R3D.tilt, def: R3D_TILT }; });
  S.ok('a middle-click glides back to north at the usual lean', back.yaw === 0 && Math.abs(back.tilt - back.def) < 1e-9, JSON.stringify(back));

  await park();
  var c3 = await cam();
  await drag('right', 320, 300, 250, 330, ['Alt']);
  var c4 = await cam();
  S.ok('Alt + right-drag turns and leans it too', c4.yaw > 0.3 && c4.tilt < c3.tilt, 'yaw ' + c4.yaw.toFixed(3) + ', tilt ' + c4.tilt.toFixed(3));
  var ordered = await P.evaluate(function () { var u = window._rtsG.sel[0]; return !!(u && (u.order || u.path || u.goal)); });
  S.ok('...ordering nothing', !ordered, String(ordered));
  await P.keyboard.down('Alt'); await M.move(360, 330); await M.down({ button: 'right' }); await M.up({ button: 'right' }); await P.keyboard.up('Alt');
  ordered = await P.evaluate(function () { var u = window._rtsG.sel[0]; return !!(u && (u.order || u.path || u.goal)); });
  S.ok('...while a still Alt + right-click is the order', ordered, String(ordered));

  await park();
  var keys = await P.evaluate(function () {
    var U = window._rtsUI, R3 = window._R3D, o = {};
    U.keys = { q: true }; for (var i = 0; i < 30; i++) _rtsOrbitTick(1 / 60); o.q = R3.yaw;
    U.keys = { e: true }; for (i = 0; i < 60; i++) _rtsOrbitTick(1 / 60); o.e = R3.yaw;
    U.keys = { pageup: true }; for (i = 0; i < 300; i++) _rtsOrbitTick(1 / 60); o.top = R3.tilt;
    U.keys = { pagedown: true }; for (i = 0; i < 300; i++) _rtsOrbitTick(1 / 60); o.bottom = R3.tilt;
    U.keys = {}; o.min = R3D_TILT_MIN; o.max = R3D_TILT_MAX;
    return o;
  });
  S.ok('Q and E turn the camera each way', keys.q > 0.7 && keys.e < -0.7, 'Q ' + keys.q.toFixed(3) + ', then E ' + keys.e.toFixed(3));
  S.ok('Page Up and Page Down lean it, within its range', keys.top === keys.max && keys.bottom === keys.min, keys.top + ' / ' + keys.bottom);

  /* THE SCREEN'S AXES: turned, the up arrow still moves the view up the screen */
  await park();
  var ax = await P.evaluate(function () {
    var R = _rtsR, U = window._rtsUI;
    _r3dCamSet(1.2, R3D_TILT);
    var w = _rtsGroundAt(R.W / 2, R.H / 2);
    U.keys = { arrowup: true }; _rtsPanTick(0.2); U.keys = {};
    var s = _rtsGroundToScreen(w.x, w.z);
    return { dx: +(s.x - R.W / 2).toFixed(2), dy: +(s.y - R.H / 2).toFixed(2) };
  });
  S.ok('turned, the up arrow moves the view up the screen: what was in the middle slides straight down', ax.dy > 20 && Math.abs(ax.dx) < 1, JSON.stringify(ax));

  /* THE COMPASS */
  await park();
  var comp = await P.evaluate(function () {
    var c = document.getElementById('rtsCompass');
    _r3dCamSet(0.8, R3D_TILT); _rtsOrbitTick(0);
    var o = { shown: c && getComputedStyle(c).display !== 'none', turn: c && c.firstChild.style.transform };
    c.click(); for (var i = 0; i < 120; i++) _rtsOrbitTick(1 / 60);
    o.after = window._R3D.yaw;
    return o;
  });
  S.ok('the compass shows in 3D, its needle turned back by the yaw', comp.shown && /^rotate\(-0\.8(0*)rad\)$/.test(comp.turn), JSON.stringify(comp));
  S.ok('...a tap faces north again', comp.after === 0, String(comp.after));

  /* THE PLACEMENT GHOST, turned: the building's own mesh, translucent, where it would stand */
  await park();
  var gh = await P.evaluate(function () {
    var R = _rtsR, R3 = window._R3D, G = window._rtsG, gl = R3.gl, CW = R3.cv.width, CH = R3.cv.height;
    for (var i = 0; i < RTS_N * RTS_N; i++) { G.mapped[i] = 1; G.vis[i] = 1; } G.visDirty = 1;
    _r3dCamSet(1.1, 0.7);
    var tx = _rtsTX(R.focus.x), tz = _rtsTX(R.focus.z);
    function shot() { _rtsRFrame(0); var b = new Uint8Array(CW * CH * 4); gl.readPixels(0, 0, CW, CH, gl.RGBA, gl.UNSIGNED_BYTE, b); return b; }
    var A = shot();
    R.ghostKey = 'power'; R.ghost = { tx: tx - 1, tz: tz - 1, ok: true, side: 'player' };
    var B = shot(), at = _r3dGhostAt(), c = _rtsWorldToScreen(at.x, at.y + 6, at.z);
    R.ghost = null; R.ghostKey = null;
    var C = shot(), n = 0, near = 0, back = 0;
    for (var y = 0; y < CH; y++) for (var x = 0; x < CW; x++) {
      var p = (y * CW + x) * 4, d = Math.abs(A[p] - B[p]) + Math.abs(A[p + 1] - B[p + 1]) + Math.abs(A[p + 2] - B[p + 2]);
      if (Math.abs(A[p] - C[p]) + Math.abs(A[p + 1] - C[p + 1]) + Math.abs(A[p + 2] - C[p + 2]) > 3) back++;
      if (d > 20) { n++; if (Math.hypot(x / R.dpr - c.x, (CH - 1 - y) / R.dpr - c.y) < 60) near++; }
    }
    _r3dCamSet(0, R3D_TILT);
    return { n: n, near: near, back: back };
  });
  S.ok('turned, the building being placed is drawn where it would stand', gh.n > 300 && gh.near > gh.n * 0.6,
       gh.n + ' pixels change, ' + gh.near + ' of them round where it stands');
  S.ok('...and nothing of it is left when the placing is over', gh.back === 0, gh.back + ' pixels differ');

  var help = await P.evaluate(function () { var k = document.getElementById('rtsKeys'); return k ? k.textContent : ''; });
  S.ok('the controls say how', /Middle-drag/.test(help) && /Q \/ E/.test(help), help.slice(0, 80));
  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');
  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
