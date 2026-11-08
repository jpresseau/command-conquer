/* BATTLE SCARS - render3d/scar3d.js.

   A shell's scorch and a blast's crater are a flag a cell (core/transport.js, core/capture.js).
   The ground drew a scorch as the whole cell gone near-black and a crater as a darker disc, so a
   firefight left ink spilt over the grass. Now each is a mark of its own in its cell. Two
   scorches and two craters are laid on open grass at a phone's opening density (24 device pixels
   a world unit), and the frame is read off the GL canvas three times - clean ground, the marks,
   and the old look (R3.scarAmt = 0) - each mark in a window round its cell on screen:

     NOTHING ELSE   with no scar on the map the knob changes no pixel: the work is the scars'
     A MARK         a scorch is a mark, not the cell: its char covers less than half the old
                    blotch's dark, and there is char
     SINGED         round it the grass is browned: many more brown pixels than the old blotch had
     THE SIZE OF IT what a mark changes stays within a cell and a bit of its centre
     SOIL           a crater is raw soil, brown, where the old disc was darkened grass
     A BOWL         ...and lit as a bowl: one side of it brighter than the other, where the old
                    disc was even - by its slope and the shade of its rim on the sun's side,
                    neither of which is enough alone */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('scars');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 900, height: 700, dpr: 1 });
  await g.start(7, 1, { freeze: true });

  var out = await g.page.evaluate(function () {
    var o = {}, R = _rtsR, G = window._rtsG, R3 = window._R3D, N = RTS_N, T = RTS_TILE, i;
    o.on = !!(R3 && R3.on);
    if (!o.on) return o;
    for (i = 0; i < N * N; i++) { G.mapped[i] = 1; G.vis[i] = 1; } G.visDirty = 1;
    window.RTS_SKY_FORCE = 'day';
    var gl = R3.gl, CW, CH;
    function shot() {
      _rtsRFrame(0); _rtsRFrame(0);
      CW = R3.cv.width; CH = R3.cv.height;
      var b = new Uint8Array(CW * CH * 4);
      gl.readPixels(0, 0, CW, CH, gl.RGBA, gl.UNSIGNED_BYTE, b);
      return b;
    }
    function lum(b, q) { return 0.3 * b[q] + 0.59 * b[q + 1] + 0.11 * b[q + 2]; }
    function diff(A, B, q) { return Math.abs(A[q] - B[q]) + Math.abs(A[q + 1] - B[q + 1]) + Math.abs(A[q + 2] - B[q + 2]); }

    /* open grass near the yard: 9 x 9 cells of it, nothing on it, no ore */
    var yd = _rtsHas('player', 'yard'), ax = _rtsTX(yd.x), az = _rtsTX(yd.z), best = null, bd = 1e9, tx, tz;
    for (tz = 6; tz < N - 6; tz++) for (tx = 6; tx < N - 6; tx++) {
      var ok = true;
      for (var dz = -4; dz <= 4 && ok; dz++) for (var dx = -4; dx <= 4 && ok; dx++) {
        var k = (tz + dz) * N + tx + dx;
        if (G.terrain[k] !== RTS_T_GRASS || G.blocked[k] || G.scrap[k] > 0 || G.scorch[k]) ok = false;
      }
      var d = (tx - ax) * (tx - ax) + (tz - az) * (tz - az);
      if (ok && d > 60 && d < bd) { bd = d; best = [tx, tz]; }
    }
    if (!best) return o;
    o.cell = best;
    R.focus.x = _rtsWX(best[0]) + T / 2; R.focus.z = _rtsWX(best[1]); R.zi = 3; _rtsApplyCam();
    o.pxw = _rtsZoom() * (R3.scale || 1);
    var marks = [{ k: 'scorch', c: [best[0] - 1, best[1] - 2], v: 2 }, { k: 'scorch', c: [best[0] + 2, best[1] - 2], v: 5 },
                 { k: 'crater', c: [best[0] - 1, best[1] + 1], v: 8 }, { k: 'crater', c: [best[0] + 2, best[1] + 1], v: 8 }];

    /* NOTHING ELSE: the clean ground, either way */
    R3.scarAmt = undefined; var C = shot();
    R3.scarAmt = 0; var C0 = shot();
    o.clean = 0;
    for (i = 0; i < C.length; i += 4) if (diff(C, C0, i) > 0) o.clean++;

    marks.forEach(function (m) { G.scorch[m.c[1] * N + m.c[0]] = m.v; });
    R3.scarAmt = undefined; var A = shot();
    R3.scarAmt = 0; var B = shot();
    R3.scarAmt = undefined;
    marks.forEach(function (m) { G.scorch[m.c[1] * N + m.c[0]] = 0; });

    /* a window on screen round a cell: the box its square out to r cells projects to */
    function box(c, r) {
      var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, s = CW / R.W;
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (e) {
        var wx = _rtsWX(c[0]) + e[0] * r * T, wz = _rtsWX(c[1]) + e[1] * r * T;
        var p = _r3dWorldToScreen(wx, typeof _rtsElev === 'function' ? _rtsElev(wx, wz) : 0, wz);
        x0 = Math.min(x0, p.x * s); x1 = Math.max(x1, p.x * s); y0 = Math.min(y0, p.y * s); y1 = Math.max(y1, p.y * s);
      });
      return [Math.max(0, Math.floor(x0)), Math.max(0, Math.floor(CH - y1)), Math.min(CW - 1, Math.ceil(x1)), Math.min(CH - 1, Math.ceil(CH - y0))];
    }
    function each(bx, fn) { for (var y = bx[1]; y <= bx[3]; y++) for (var x = bx[0]; x <= bx[2]; x++) fn((y * CW + x) * 4, x, y); }
    function brown(b, q) { return b[q] > b[q + 1] && lum(b, q) > 45; }     /* singed grass */
    function soil(b, q) { return b[q] > b[q + 1]; }                          /* raw earth, light or dark */

    o.marks = marks.map(function (m) {
      var bx = box(m.c, 0.9), r = { k: m.k, box: bx, darkA: 0, darkB: 0, brownA: 0, brownB: 0, soilA: 0, soilB: 0, chA: 0, chB: 0, half: 0, halfB: 0 };
      var la = [], lb = [];
      each(bx, function (q, x, y) {
        if (lum(A, q) < 45) r.darkA++;
        if (lum(B, q) < 45) r.darkB++;
        var ca = diff(A, C, q) > 24, cb = diff(B, C, q) > 24;
        if (ca) { r.chA++; if (brown(A, q)) r.brownA++; if (soil(A, q)) { r.soilA++; la.push([x, y, lum(A, q)]); } }
        if (cb) { r.chB++; if (brown(B, q)) r.brownB++; if (soil(B, q)) r.soilB++; lb.push([x, y, lum(B, q)]); }
      });
      /* A BOWL: about the middle of the soil (the old disc: of what it darkened), the mean light of
         one half against the other, across and up the screen - whichever differs the more */
      function halves(L) {
        if (L.length < 50) return 0;
        var mx = 0, my = 0; L.forEach(function (p) { mx += p[0]; my += p[1]; }); mx /= L.length; my /= L.length;
        var s = [0, 0, 0, 0], c = [0, 0, 0, 0];
        L.forEach(function (p) { var h = p[0] < mx ? 0 : 1, v = p[1] < my ? 2 : 3; s[h] += p[2]; c[h]++; s[v] += p[2]; c[v]++; });
        return Math.max(Math.abs(s[0] / Math.max(c[0], 1) - s[1] / Math.max(c[1], 1)), Math.abs(s[2] / Math.max(c[2], 1) - s[3] / Math.max(c[3], 1)));
      }
      r.half = +halves(la).toFixed(1); r.halfB = +halves(lb).toFixed(1);
      return r;
    });
    /* THE SIZE OF IT: what the marks changed outside a cell and a bit round each */
    var wide = marks.map(function (m) { return box(m.c, 1.25); });
    o.outside = 0; o.frame = CW * CH;
    for (var y = 0; y < CH; y++) for (var x = 0; x < CW; x++) {
      var q = (y * CW + x) * 4, inside = false;
      for (var w = 0; w < wide.length && !inside; w++) inside = x >= wide[w][0] && x <= wide[w][2] && y >= wide[w][1] && y <= wide[w][3];
      if (!inside && diff(A, C, q) > 24) o.outside++;
    }
    o.err = gl.getError();
    window.RTS_SKY_FORCE = undefined;
    return o;
  });

  S.ok('the 3D view is on', out.on, '');
  if (out.on && out.marks) {
    var sc = out.marks.filter(function (m) { return m.k === 'scorch'; }), cr = out.marks.filter(function (m) { return m.k === 'crater'; });
    var sum = function (L, f) { return L.reduce(function (s, m) { return s + m[f]; }, 0); };
    S.note('open grass at ' + out.cell + ', ' + out.pxw + ' device px a unit; ' + JSON.stringify(out.marks));
    S.ok('NOTHING ELSE: with no scar on the map the knob changes no pixel', out.clean === 0, out.clean + ' pixels');
    S.ok('A MARK: a scorch\'s char covers less than half the old blotch\'s dark - and there is char',
         sum(sc, 'darkA') < sum(sc, 'darkB') * 0.5 && sc.every(function (m) { return m.darkA > 150; }),
         sum(sc, 'darkA') + ' dark pixels against ' + sum(sc, 'darkB') + '; each ' + sc.map(function (m) { return m.darkA; }).join(', '));
    S.ok('SINGED: the grass round it is browned', sum(sc, 'brownA') > sum(sc, 'brownB') * 3 + 300,
         sum(sc, 'brownA') + ' brown pixels against ' + sum(sc, 'brownB'));
    S.ok('THE SIZE OF IT: what the marks change stays within a cell and a quarter of each', out.outside < 40,
         out.outside + ' pixels changed beyond them, of ' + out.frame);
    S.ok('SOIL: a crater is raw soil, brown, where the old disc was darkened grass',
         cr.every(function (m) { return m.soilA > m.chA * 0.6 && m.soilB < m.chB * 0.2; }),
         cr.map(function (m) { return m.soilA + ' of ' + m.chA + ' earth, against ' + m.soilB + ' of ' + m.chB; }).join('; '));
    S.ok('A BOWL: lit as one - a side of it brighter than the other, where the old disc was even',
         cr.every(function (m) { return m.half > 17 && m.half > m.halfB * 2; }),     /* its slope and its rim's shade, both */
         cr.map(function (m) { return m.half + ' against ' + m.halfB; }).join('; '));
    S.ok('no GL error', out.err === 0, 'error ' + out.err);
  } else S.ok('a patch of open grass to lay them on', !!out.marks, JSON.stringify(out).slice(0, 200));
  S.ok('the page logged no errors', !g.errors.length, g.errors.slice(0, 2).join(' | ') || 'clean');
  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
