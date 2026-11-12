/* ROCK IS STONE - render3d/stone3d.js.

   The ridges were grey prisms: each face one flat tone, blue-violet in the sky's fill, nothing on
   it that said stone. Now a rock face of the world batch is roughened before it is lit, banded
   with its beds, grained, warm and cold by turns, with lichen on what faces up. Read off the GL
   canvas over the ridge nearest the player's yard, at a phone's opening density (24 device pixels
   a world unit), with R3.stoneAmt = 0 as the before-picture and the rock marked - rebuilt once in
   magenta - so a sample is rock because it is, not because it looks it:

     THE RIDGE      there is rock in view, a good part of the frame
     STONE          most of the rock changes
     TEXTURE        ...and it is rougher: neighbouring pixels differ by more
     THE RELIEF     ...the more where the sun reaches it, as relief is: grain alone darkens and
                    lightens the shade by the same share as the sun
     GRAIN          ...and rougher in the shade too, where no relief shows: the grain and the beds
     WARMER         ...and on the whole a warmer grey, where it was cold
     LICHEN         ...with something green growing on its tops
     ONLY ROCK      nothing else in the frame changes - not the trees, the ore or the ground
     NOT THE BASE   nor a base: a Construction Yard and what lies round it, concrete and steel
     FAR            at the widest zoom there is none: fine relief would only shimmer
     LOW            nor on the low tier */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('stone');

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
    function pair() { R3.stoneAmt = undefined; var A = shot(); R3.stoneAmt = 0; var B = shot(); R3.stoneAmt = undefined; return [A, B]; }
    function lum(b, q) { return 0.3 * b[q] + 0.59 * b[q + 1] + 0.11 * b[q + 2]; }
    function diff(A, B, q) { return Math.abs(A[q] - B[q]) + Math.abs(A[q + 1] - B[q + 1]) + Math.abs(A[q + 2] - B[q + 2]); }
    function sat(b, q) { var mx = Math.max(b[q], b[q + 1], b[q + 2]), mn = Math.min(b[q], b[q + 1], b[q + 2]); return (mx - mn) / Math.max(mx, 1); }

    /* the ridge nearest the yard: a rock cell with ten more round it */
    var yd = _rtsHas('player', 'yard'), ax = _rtsTX(yd.x), az = _rtsTX(yd.z), best = null, bd = 1e9, tx, tz;
    for (tz = 0; tz < N; tz++) for (tx = 0; tx < N; tx++) {
      if (G.terrain[tz * N + tx] !== RTS_T_ROCK) continue;
      var n = 0;
      for (var dz = -2; dz <= 2; dz++) for (var dx = -2; dx <= 2; dx++) {
        var x = tx + dx, z = tz + dz;
        if (x >= 0 && z >= 0 && x < N && z < N && G.terrain[z * N + x] === RTS_T_ROCK) n++;
      }
      var d = (tx - ax) * (tx - ax) + (tz - az) * (tz - az);
      if (n >= 10 && d < bd) { bd = d; best = [tx, tz]; }
    }
    if (!best) return o;
    R.focus.x = _rtsWX(best[0]); R.focus.z = _rtsWX(best[1]);
    R.zi = 3; _rtsApplyCam();
    o.pxw = _rtsZoom() * (R3.scale || 1);
    R3.inkAmt = 0;               /* a rim inked on every block is the same either way and thins the ratio: e2e/grounded's */

    /* THE ROCK, MARKED: the world rebuilt once with every rock colour magenta */
    var keepR = R3D_ROCK.slice(), keepT = R3D_ROCK_TOP.slice();
    for (i = 0; i < R3D_ROCK.length; i++) R3D_ROCK[i] = '#ff00ff';
    for (i = 0; i < R3D_ROCK_TOP.length; i++) R3D_ROCK_TOP[i] = '#ff00ff';
    R3.worldG = null; R3.stoneAmt = 0;           /* rebuilt on the next frame (world3d.js) */
    var M = shot();
    for (i = 0; i < keepR.length; i++) R3D_ROCK[i] = keepR[i];
    for (i = 0; i < keepT.length; i++) R3D_ROCK_TOP[i] = keepT[i];
    R3.worldG = null; R3.stoneAmt = undefined;
    /* magenta by its hue, in the sun and in the shade alike: red and blue, and little green */
    function isRock(q) { return M[q] > 30 && M[q + 2] > 30 && M[q + 1] < Math.min(M[q], M[q + 2]) * 0.5; }

    var P = pair(), A = P[0], B = P[1];
    var rock = 0, changed = 0, warmA = 0, warmB = 0, edgeA = 0, edgeB = 0, edges = 0;
    var green = 0, other = 0, otherChanged = 0, lums = [];
    var y, x2, q, r;
    for (y = 1; y < CH - 1; y++) for (x2 = 1; x2 < CW - 1; x2++) {
      q = (y * CW + x2) * 4;
      if (isRock(q)) lums.push(lum(B, q));
    }
    lums.sort(function (a, b) { return a - b; });
    /* in the sun and in the shade: the brightest and the darkest third of the rock, before */
    var hi = lums[Math.floor(lums.length * 0.67)] || 0, lo = lums[Math.floor(lums.length * 0.33)] || 0;
    var sun = [0, 0, 0], shade = [0, 0, 0];
    for (y = 1; y < CH - 1; y++) for (x2 = 1; x2 < CW - 1; x2++) {
      q = (y * CW + x2) * 4;
      if (!isRock(q)) {
        /* not rock, nor beside it: an edge pixel is part rock, part what is behind it */
        var near = false;
        for (var ny = -1; ny <= 1 && !near; ny++) for (var nx = -1; nx <= 1 && !near; nx++) near = isRock(q + (ny * CW + nx) * 4);
        if (near) continue;
        other++;
        if (diff(A, B, q) > 6) otherChanged++;
        continue;
      }
      rock++;
      if (diff(A, B, q) > 12) changed++;
      warmA += A[q] - A[q + 2]; warmB += B[q] - B[q + 2];
      /* lichen: greener against red AND against blue than it was - the warm stain is redder and
         the cold grey bluer, and neither is greener against both */
      if ((A[q + 1] - A[q]) - (B[q + 1] - B[q]) > 4 && (A[q + 1] - A[q + 2]) - (B[q + 1] - B[q + 2]) > 4) green++;
      r = q + 4;
      if (isRock(r)) {
        edges++;
        var ea = Math.abs(lum(A, q) - lum(A, r)), eb = Math.abs(lum(B, q) - lum(B, r)), lb = lum(B, q);
        edgeA += ea; edgeB += eb;
        if (lb > hi) { sun[0]++; sun[1] += ea; sun[2] += eb; } else if (lb < lo) { shade[0]++; shade[1] += ea; shade[2] += eb; }
      }
    }
    o.rock = rock; o.frame = CW * CH; o.changed = changed;
    o.warm = rock ? [+(warmA / rock).toFixed(2), +(warmB / rock).toFixed(2)] : [0, 0];
    o.edge = edges ? [+(edgeA / edges).toFixed(3), +(edgeB / edges).toFixed(3)] : [0, 0];
    /* how much rougher each got: the relief is lit, so it shows in the sun far more than the
       grain does, which darkens and lightens the shade by the same share */
    o.sun = sun[0] ? [sun[0], +(sun[1] / Math.max(sun[2], 1)).toFixed(3)] : [0, 0];
    o.shade = shade[0] ? [shade[0], +(shade[1] / Math.max(shade[2], 1)).toFixed(3)] : [0, 0];
    o.green = green; o.other = other; o.otherChanged = otherChanged;

    /* NOT THE BASE: the yard and what lies round it */
    R.focus.x = yd.x; R.focus.z = yd.z; _rtsApplyCam();
    var YB = pair(), yn = 0;
    for (i = 0; i < YB[0].length; i += 4) if (diff(YB[0], YB[1], i) > 6) yn++;
    o.yard = yn;
    /* FAR: the ridge from the widest zoom */
    R.focus.x = _rtsWX(best[0]); R.focus.z = _rtsWX(best[1]); R.zi = 0; _rtsApplyCam();
    var FB = pair(), fn = 0;
    for (i = 0; i < FB[0].length; i += 4) if (diff(FB[0], FB[1], i) > 6) fn++;
    o.far = [fn, _rtsZoom() * (R3.scale || 1)];
    /* LOW: up close again, on the low tier */
    R.zi = 3; _rtsApplyCam();
    var lvl = R3.qLevel || 0;
    _r3dQualityApply(2);
    var LB = pair(), ln = 0;
    for (i = 0; i < LB[0].length; i += 4) if (diff(LB[0], LB[1], i) > 6) ln++;
    _r3dQualityApply(lvl);
    o.low = ln;
    o.err = gl.getError();
    window.RTS_SKY_FORCE = undefined;
    return o;
  });

  S.ok('the 3D view is on', out.on, '');
  if (out.on && out.rock !== undefined) {
    S.ok('THE RIDGE: rock in view, a good part of the frame', out.rock > out.frame * 0.15,
         out.rock + ' of ' + out.frame + ' pixels, at ' + out.pxw + ' device px a unit');
    S.ok('STONE: most of the rock changes', out.changed > out.rock * 0.5, out.changed + ' of ' + out.rock);
    /* 1.3: 1.42 measured since rock on a hill stopped being stretched up it (world3d.js
       _r3dLiftFrom) - the stretch's long plain faces were the smooth side of this; over 1.5 before */
    S.ok('TEXTURE: rougher - neighbouring pixels differ by more', out.edge[0] > out.edge[1] * 1.3,
         out.edge[0] + ' against ' + out.edge[1] + ' between neighbours, on average');
    S.ok('THE RELIEF: the sun finds it - rougher in the sun than in the shade',
         out.sun[0] > 5000 && out.shade[0] > 5000 && out.sun[1] > out.shade[1] * 1.3,
         'in the sun ' + out.sun[1] + ' times as rough, in the shade ' + out.shade[1] + ' (' + out.sun[0] + ' and ' +
         out.shade[0] + ' pixels)');
    S.ok('GRAIN: rougher in the shade too, where the light shows no relief - grain and beds',
         out.shade[1] > 1.1, 'in the shade ' + out.shade[1] + ' times as rough');
    S.ok('WARMER: on the whole a warmer grey than it was', out.warm[0] > out.warm[1] + 3,
         'red over blue ' + out.warm[0] + ' against ' + out.warm[1]);
    S.ok('LICHEN: something green on its tops', out.green > 300, out.green + ' pixels greener against red and blue');
    S.ok('ONLY ROCK: nothing else in the frame changes', out.otherChanged < out.other * 0.002,
         out.otherChanged + ' of ' + out.other + ' pixels that are not rock');
    S.ok('NOT THE BASE: the yard and what lies round it are untouched', out.yard === 0, out.yard + ' pixels');
    S.ok('FAR: none at the widest zoom', out.far[0] === 0, out.far[0] + ' pixels at ' + out.far[1] + ' device px a unit');
    S.ok('LOW: none on the low tier', out.low === 0, out.low + ' pixels');
    S.ok('no GL error', out.err === 0, 'error ' + out.err);
  }
  S.ok('the page logged no errors', !g.errors.length, g.errors.slice(0, 2).join(' | ') || 'clean');
  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
