/* A CANOPY IS LEAVES - render3d/leaf3d.js.

   The trees are facets, each one flat green: from the camera at a phone's zoom a wood read as
   painted card beside the grass. Now a green face of the world batch is given a leafy relief before
   it is lit, clumps of lighter and darker leaves, and warmer sunlit tips. Read off the GL canvas over
   the wood nearest the player's yard, at a phone's opening density (24 device pixels a world unit),
   with R3.leafAmt = 0 as the before-picture and the canopy marked - the world rebuilt once with its
   needles and leaves magenta - so a sample is canopy because it is:

     THE WOOD       there is canopy in view
     LEAVES         a good part of the canopy changes: a dark needle lit by the sky's fill alone moves
                    little, as relief does
     TEXTURE        ...and it is broken up: neighbouring pixels differ by more
     THE RELIEF     ...the more where the sun reaches it, as relief is: clumps alone darken and
                    lighten the shade by the same share as the sun
     ONLY GREEN     nothing in the frame that is not green changes - not the trunks, the road, the
                    ore or the ground
     NOT THE BASE   nor a base: nothing of it that is not green (its grass has tufts)
     FAR            at the widest zoom there is none: fine relief would only shimmer
     LOW            nor on the low tier */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('leaves');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 900, height: 700, dpr: 1 });
  await g.start(7, 1, { freeze: true });

  var out = await g.page.evaluate(function () {
    var o = {}, R = _rtsR, G = window._rtsG, R3 = window._R3D, N = RTS_N, i;
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
    function pair() { R3.leafAmt = undefined; var A = shot(); R3.leafAmt = 0; var B = shot(); R3.leafAmt = undefined; return [A, B]; }
    function lum(b, q) { return 0.3 * b[q] + 0.59 * b[q + 1] + 0.11 * b[q + 2]; }
    function diff(A, B, q) { return Math.abs(A[q] - B[q]) + Math.abs(A[q + 1] - B[q + 1]) + Math.abs(A[q + 2] - B[q + 2]); }
    function count(P) { var n = 0; for (var k = 0; k < P[0].length; k += 4) if (diff(P[0], P[1], k) > 6) n++; return n; }
    /* ...of what was not green before: the grass's tufts are leaves too, and a base has them round it */
    function countNG(P) { var n = 0, B = P[1]; for (var k = 0; k < B.length; k += 4) if (diff(P[0], B, k) > 6 && B[k + 1] - Math.max(B[k], B[k + 2]) <= 6) n++; return n; }

    /* the wood nearest the yard: a forest cell with ten more round it */
    var yd = _rtsHas('player', 'yard'), ax = _rtsTX(yd.x), az = _rtsTX(yd.z), best = null, bd = 1e9, tx, tz;
    for (tz = 0; tz < N; tz++) for (tx = 0; tx < N; tx++) {
      if (G.terrain[tz * N + tx] !== RTS_T_TREE) continue;
      var n = 0;
      for (var dz = -2; dz <= 2; dz++) for (var dx = -2; dx <= 2; dx++) {
        var x = tx + dx, z = tz + dz;
        if (x >= 0 && z >= 0 && x < N && z < N && G.terrain[z * N + x] === RTS_T_TREE) n++;
      }
      var d = (tx - ax) * (tx - ax) + (tz - az) * (tz - az);
      if (n >= 10 && d < bd) { bd = d; best = [tx, tz]; }
    }
    if (!best) return o;
    R.focus.x = _rtsWX(best[0]); R.focus.z = _rtsWX(best[1]);
    R.zi = 3; _rtsApplyCam();
    o.pxw = _rtsZoom() * (R3.scale || 1);

    /* THE CANOPY, MARKED: the world rebuilt once with every needle and leaf magenta */
    var keepN = R3D_NEEDLE.slice(), keepL = R3D_LEAF.slice();
    for (i = 0; i < R3D_NEEDLE.length; i++) R3D_NEEDLE[i] = '#ff00ff';
    for (i = 0; i < R3D_LEAF.length; i++) R3D_LEAF[i] = '#ff00ff';
    R3.worldG = null; R3.leafAmt = 0;
    var M = shot();
    for (i = 0; i < keepN.length; i++) R3D_NEEDLE[i] = keepN[i];
    for (i = 0; i < keepL.length; i++) R3D_LEAF[i] = keepL[i];
    R3.worldG = null; R3.leafAmt = undefined;
    function isLeaf(q) { return M[q] > 30 && M[q + 2] > 30 && M[q + 1] < Math.min(M[q], M[q + 2]) * 0.5; }

    var P = pair(), A = P[0], B = P[1];
    var canopy = 0, changed = 0, edgeA = 0, edgeB = 0, edges = 0, other = 0, otherChanged = 0, lums = [], y, x2, q, r;
    for (y = 1; y < CH - 1; y++) for (x2 = 1; x2 < CW - 1; x2++) {
      q = (y * CW + x2) * 4;
      if (isLeaf(q)) lums.push(lum(B, q));
    }
    lums.sort(function (a, b) { return a - b; });
    var hi = lums[Math.floor(lums.length * 0.67)] || 0, lo = lums[Math.floor(lums.length * 0.33)] || 0;
    var sun = [0, 0, 0], shade = [0, 0, 0];
    for (y = 1; y < CH - 1; y++) for (x2 = 1; x2 < CW - 1; x2++) {
      q = (y * CW + x2) * 4;
      if (!isLeaf(q)) {
        /* ONLY GREEN: what is not green before - a trunk, the road, the ore, the ground's brown -
           and not beside the canopy, whose edge pixels are part leaf */
        var near = false;
        for (var ny = -1; ny <= 1 && !near; ny++) for (var nx = -1; nx <= 1 && !near; nx++) near = isLeaf(q + (ny * CW + nx) * 4);
        if (near || B[q + 1] - Math.max(B[q], B[q + 2]) > 6) continue;
        other++;
        if (diff(A, B, q) > 6) otherChanged++;
        continue;
      }
      canopy++;
      if (diff(A, B, q) > 12) changed++;
      r = q + 4;
      if (isLeaf(r)) {
        edges++;
        var ea = Math.abs(lum(A, q) - lum(A, r)), eb = Math.abs(lum(B, q) - lum(B, r)), lb = lum(B, q);
        edgeA += ea; edgeB += eb;
        if (lb > hi) { sun[0]++; sun[1] += ea; sun[2] += eb; } else if (lb < lo) { shade[0]++; shade[1] += ea; shade[2] += eb; }
      }
    }
    o.canopy = canopy; o.frame = CW * CH; o.changed = changed;
    o.edge = edges ? [+(edgeA / edges).toFixed(3), +(edgeB / edges).toFixed(3)] : [0, 0];
    o.sun = sun[0] ? [sun[0], +(sun[1] / Math.max(sun[2], 1)).toFixed(3)] : [0, 0];
    o.shade = shade[0] ? [shade[0], +(shade[1] / Math.max(shade[2], 1)).toFixed(3)] : [0, 0];
    o.other = other; o.otherChanged = otherChanged;

    /* NOT THE BASE */
    R.focus.x = yd.x; R.focus.z = yd.z; _rtsApplyCam();
    o.yard = countNG(pair());
    /* FAR */
    R.focus.x = _rtsWX(best[0]); R.focus.z = _rtsWX(best[1]); R.zi = 0; _rtsApplyCam();
    o.far = [count(pair()), _rtsZoom() * (R3.scale || 1)];
    /* LOW */
    R.zi = 3; _rtsApplyCam();
    var lvl = R3.qLevel || 0;
    _r3dQualityApply(2);
    o.low = count(pair());
    _r3dQualityApply(lvl);
    o.err = gl.getError();
    window.RTS_SKY_FORCE = undefined;
    return o;
  });

  S.ok('the 3D view is on', out.on, '');
  if (out.on && out.canopy !== undefined) {
    S.ok('THE WOOD: canopy in view', out.canopy > out.frame * 0.1,
         out.canopy + ' of ' + out.frame + ' pixels, at ' + out.pxw + ' device px a unit');
    S.ok('LEAVES: a good part of the canopy changes - more of it where the sun is', out.changed > out.canopy * 0.3, out.changed + ' of ' + out.canopy);
    S.ok('TEXTURE: broken up - neighbouring pixels differ by more', out.edge[0] > out.edge[1] * 1.4,
         out.edge[0] + ' against ' + out.edge[1] + ' between neighbours, on average');
    S.ok('THE RELIEF: the sun finds it - more broken in the sun than in the shade',
         out.sun[0] > 3000 && out.shade[0] > 3000 && out.sun[1] > out.shade[1] * 1.2,
         'in the sun ' + out.sun[1] + ' times as rough, in the shade ' + out.shade[1] + ' (' + out.sun[0] + ' and ' + out.shade[0] + ' pixels)');
    S.ok('ONLY GREEN: nothing that is not green changes', out.other > 20000 && out.otherChanged < out.other * 0.002,
         out.otherChanged + ' of ' + out.other + ' pixels that are not green');
    S.ok('NOT THE BASE: nothing of a base that is not green changes', out.yard < 200, out.yard + ' pixels');
    S.ok('FAR: none at the widest zoom', out.far[0] === 0, out.far[0] + ' pixels at ' + out.far[1] + ' device px a unit');
    S.ok('LOW: none on the low tier', out.low === 0, out.low + ' pixels');
    S.ok('no GL error', out.err === 0, 'error ' + out.err);
  }
  S.ok('the page logged no errors', !g.errors.length, g.errors.slice(0, 2).join(' | ') || 'clean');
  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
