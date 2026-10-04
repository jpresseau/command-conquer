/* THE GROUND IS MATERIALS, NOT RED ALERT'S PICTURE - render3d/terrain3d.js.

   The 3D ground used to be the 2D renderer's baked terrain canvas magnified onto the heightfield,
   and up close it was a mosaic of eight-pixel squares. It is computed per pixel in world space
   now, from a map of what each cell is. Each claim below is something that picture could not do,
   checked on the built page with the old ground (RTS_GROUND_LEGACY) or the old coast
   (RTS_SEA_CUT_OFF) as the before-picture where there is one:

     THE COAST     the sea's edge is cut per pixel from a smooth water mask, so a coastline has no
                   straight cell-length edges - the old sheet was built from cells, a staircase
     THE PLAZA     a building stands on paving, not on grass - the base's own ground
     THE ROADS     a road out in the country is metalled - grey asphalt down its line (road3d.js) -
                   not paving and no longer a dirt track
     THE SCARS     a scorch mark rebuilds the ground map once and darkens its cell
     THE COST      the ground map is rebuilt only when what it encodes changes
     THE RELIEF    the bump is gradient noise, so up close the grass is lumps, not streaks
     THE DRAWS     no draw is refused: the error flag stays clear at every zoom, in both modes */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('terrainmat');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 900, height: 700, dpr: 1 });
  await g.start(7, 1);

  var out = await g.page.evaluate(function () {
    var o = {}, R = _rtsR, G = window._rtsG, i;
    for (i = 0; i < RTS_N * RTS_N; i++) { G.mapped[i] = 1; G.vis[i] = 1; }
    G.visDirty = 1;
    var R3 = window._R3D;
    o.on = !!(R3 && R3.on);
    if (!o.on) return o;
    window.RTS_POST_ON = false;
    _rtsRFrame(1 / 60);
    o.matOn = R3.matOn;
    window.RTS_GROUND_LEGACY = true; _rtsRFrame(1 / 60); o.legacyOff = R3.matOn === false;
    window.RTS_GROUND_LEGACY = false; _rtsRFrame(1 / 60);

    var gl = R3.gl, CW = R3.cv.width, CH = R3.cv.height;
    function shot() {
      _rtsRFrame(1 / 60); _rtsRFrame(1 / 60);
      var b = new Uint8Array(CW * CH * 4);
      gl.readPixels(0, 0, CW, CH, gl.RGBA, gl.UNSIGNED_BYTE, b);
      return b;
    }
    function px(b, x, y) { x = Math.round(x); y = Math.round(y); var q = ((CH - 1 - y) * CW + x) * 4; return [b[q], b[q + 1], b[q + 2]]; }
    function onScreen(p) { return p.x > 4 && p.y > 4 && p.x < CW - 4 && p.y < CH - 4; }

    /* ---------- 1. the coast ---------- */
    /* the shore cell with the most water round it that is nearest the map centre: a real coast */
    var best = null, bs = -1;
    for (var tz = 10; tz < RTS_N - 10; tz++) for (var tx = 10; tx < RTS_N - 10; tx++) {
      if (G.terrain[_rtsIdx(tx, tz)] === RTS_T_WATER) continue;
      var w = 0;
      for (var a = -4; a <= 4; a++) for (var b = -4; b <= 4; b++) if (G.terrain[_rtsIdx(tx + a, tz + b)] === RTS_T_WATER) w++;
      if (w > 20 && w < 60 && w > bs) { bs = w; best = [tx, tz]; }
    }
    o.coastAt = best;
    R.focus.x = _rtsWX(best[0]); R.focus.z = _rtsWX(best[1]);
    R.zi = RTS_ZOOMS.length - 2; _rtsApplyCam();
    G.ents = G.ents.filter(function (e) { return e.type === 'struct'; });
    function isSea(c) { return c[2] > c[0] + 30 && c[2] > c[1] + 4; }
    /* the longest run of rows over which the land/sea boundary stays in the same column, and of
       columns over which it stays in the same row - a staircase is made of exactly those */
    function straight(buf) {
      var longest = 0, found = 0, y, x;
      var x0 = CW * 0.2 | 0, x1 = CW * 0.8 | 0, y0 = CH * 0.2 | 0, y1 = CH * 0.8 | 0;
      var prev = -9, run = 0;
      for (y = y0; y < y1; y++) {
        var bx = -1;
        for (x = x0 + 1; x < x1; x++) if (isSea(px(buf, x, y)) !== isSea(px(buf, x - 1, y))) { bx = x; break; }
        if (bx < 0) { prev = -9; run = 0; continue; }
        found++;
        if (bx === prev) run++; else run = 1;
        prev = bx; longest = Math.max(longest, run);
      }
      prev = -9; run = 0;
      for (x = x0; x < x1; x++) {
        var by = -1;
        for (y = y0 + 1; y < y1; y++) if (isSea(px(buf, x, y)) !== isSea(px(buf, x, y - 1))) { by = y; break; }
        if (by < 0) { prev = -9; run = 0; continue; }
        found++;
        if (by === prev) run++; else run = 1;
        prev = by; longest = Math.max(longest, run);
      }
      return { longest: longest, found: found };
    }
    o.cellPx = Math.round(R.cell * R.dpr);
    /* THE SWELL IS STILLED for these two frames. It heaves the sheet up and down, and on this
       tilted camera that bends even a straight cell edge on screen - measured with it running,
       the old staircase's longest straight run came out at 23px on a 96px cell, which says
       nothing about the edge's shape. */
    var keepAmp = R3D_WAVE_AMP;
    R3D_WAVE_AMP = 0;
    o.coastNew = straight(shot());
    window.RTS_SEA_CUT_OFF = true; o.coastOld = straight(shot()); window.RTS_SEA_CUT_OFF = false;
    R3D_WAVE_AMP = keepAmp;

    /* ---------- 2. the plaza, and 3. the tracks ---------- */
    var yd = _rtsHas('player', 'yard'), yd3 = rtsStructDef('yard');
    R.focus.x = yd.x; R.focus.z = yd.z; R.zi = RTS_ZOOMS.length - 2; _rtsApplyCam();
    var B = shot();
    /* one cell in front of the yard (toward the camera), in the middle of its face */
    var fp = _rtsGroundToScreen(_rtsWX(yd.tx + 1), _rtsWX(yd.tz + yd3.h));
    o.plaza = onScreen(fp) ? px(B, fp.x, fp.y) : null;
    window.RTS_GROUND_LEGACY = true; var BL = shot(); window.RTS_GROUND_LEGACY = false;
    o.plazaLegacy = onScreen(fp) ? px(BL, fp.x, fp.y) : null;
    /* a road cell with no building for twelve cells: a country road */
    var road = null;
    for (i = 0; i < RTS_N * RTS_N && !road; i++) {
      if (G.terrain[i] !== RTS_T_ROAD) continue;
      var rx = i % RTS_N, rz = (i / RTS_N) | 0, near = false;
      G.ents.forEach(function (e) { if (!e.dead && e.type === 'struct' && Math.abs(e.tx - rx) < 12 && Math.abs(e.tz - rz) < 12) near = true; });
      var allRoad = true;
      for (var da = -1; da <= 1; da++) for (var db = -1; db <= 1; db++) if (G.terrain[_rtsIdx(rx + da, rz + db)] !== RTS_T_ROAD) allRoad = false;
      if (!near && allRoad) road = [rx, rz];
    }
    o.roadAt = road;
    if (road) {
      R.focus.x = _rtsWX(road[0]); R.focus.z = _rtsWX(road[1]); _rtsApplyCam();
      var BR = shot(), rp = _rtsGroundToScreen(_rtsWX(road[0]), _rtsWX(road[1]));
      /* the mean over a small patch, so one pebble cannot decide it */
      var sum = [0, 0, 0], n = 0;
      for (var yy = -6; yy <= 6; yy += 2) for (var xx = -6; xx <= 6; xx += 2) {
        var c = px(BR, rp.x + xx, rp.y + yy); sum[0] += c[0]; sum[1] += c[1]; sum[2] += c[2]; n++;
      }
      o.road = sum.map(function (v) { return Math.round(v / n); });
    }

    /* ---------- 4. the scars, and 5. the cost ---------- */
    var gi = null;
    for (i = 0; i < RTS_N * RTS_N && !gi; i++) {
      var sx = i % RTS_N, sz = (i / RTS_N) | 0;
      if (sx < 20 || sz < 20 || sx > RTS_N - 20 || sz > RTS_N - 20) continue;
      var ok = true;
      for (var ea = -1; ea <= 1; ea++) for (var eb = -1; eb <= 1; eb++) if (G.terrain[_rtsIdx(sx + ea, sz + eb)] !== RTS_T_GRASS || G.scrap[_rtsIdx(sx + ea, sz + eb)] > 0) ok = false;
      if (ok) gi = [sx, sz];
    }
    R.focus.x = _rtsWX(gi[0]); R.focus.z = _rtsWX(gi[1]); R.zi = RTS_ZOOMS.length - 1; _rtsApplyCam();
    shot();
    var b0 = R3.groundMapBuilds;
    var S0 = shot(); shot();
    o.idleBuilds = R3.groundMapBuilds - b0;
    var sp = _rtsGroundToScreen(_rtsWX(gi[0]), _rtsWX(gi[1]));
    function luma(buf) { var s2 = 0, m = 0; for (var y2 = -5; y2 <= 5; y2++) for (var x2 = -5; x2 <= 5; x2++) { var c2 = px(buf, sp.x + x2, sp.y + y2); s2 += c2[0] * 0.3 + c2[1] * 0.59 + c2[2] * 0.11; m++; } return s2 / m; }
    o.lumaBefore = +luma(S0).toFixed(1);
    var b1 = R3.groundMapBuilds;
    G.scorch[_rtsIdx(gi[0], gi[1])] = 6;
    var S1 = shot();
    o.scarBuilds = R3.groundMapBuilds - b1;
    o.lumaAfter = +luma(S1).toFixed(1);

    /* ---------- 6. the relief: lumps, not streaks ----------
       The bump was built on value noise, whose slope along z is a row difference interpolated
       along x - so lit, the whole ground up close ran in streaks across the screen. Measured as
       how alike the vertical brightness step stays eight pixels along a row, over open grass at
       the closest zoom: 0.42 on value noise, 0.29 on the gradient noise it is built on now. */
    var gr = null, gd = 1e9;
    for (var qz = 5; qz < RTS_N - 5; qz++) for (var qx = 5; qx < RTS_N - 5; qx++) {
      var all = true;
      for (var ga = -4; ga <= 4 && all; ga++) for (var gb = -4; gb <= 4 && all; gb++) {
        var gj = _rtsIdx(qx + ga, qz + gb);
        if (G.terrain[gj] !== RTS_T_GRASS || G.blocked[gj] || G.gems[gj] || G.scorch[gj]) all = false;
      }
      var dd = Math.abs(qx - yd.tx) + Math.abs(qz - yd.tz);
      if (all && dd < gd) { gd = dd; gr = [qx, qz]; }
    }
    o.grassAt = gr;
    if (gr) {
      R.focus.x = _rtsWX(gr[0]); R.focus.z = _rtsWX(gr[1]); R.zi = RTS_ZOOMS.length - 1; _rtsApplyCam();
      var SG = shot();
      var Lg = function (x, y) { var q = (y * CW + x) * 4; return SG[q] * 0.299 + SG[q + 1] * 0.587 + SG[q + 2] * 0.114; };
      var sab = 0, saa = 0, sbb = 0;
      for (var ry = (CH * 0.25) | 0; ry < CH * 0.75; ry++) for (var rx2 = (CW * 0.25) | 0; rx2 < CW * 0.75; rx2++) {
        var da2 = Lg(rx2, ry + 1) - Lg(rx2, ry), db2 = Lg(rx2 + 8, ry + 1) - Lg(rx2 + 8, ry);
        sab += da2 * db2; saa += da2 * da2; sbb += db2 * db2;
      }
      o.streak = +(sab / Math.sqrt(saa * sbb)).toFixed(3);
    }

    /* ---------- 7. no draw is refused ----------
       The edge filter's depth texture was left on its unit after the composite, and the next
       frame's ground drew into the buffer that texture belongs to while its grain sampler still
       pointed at the unit - a feedback loop, which WebGL answers by refusing the draw. It did so
       from the third zoom in, on the material ground only (the old ground rebinds the unit).
       Through the post buffer, both modes, every rung, two frames each: the flag stays clear. */
    window.RTS_POST_ON = true;
    gl.getError();
    o.glErrs = [];
    for (var zi = 0; zi < RTS_ZOOMS.length; zi++) {
      R.zi = zi; _rtsApplyCam();
      [false, true].forEach(function (lg) {
        window.RTS_GROUND_LEGACY = lg;
        _rtsRFrame(1 / 60); _rtsRFrame(1 / 60);
        var e = gl.getError();
        if (e) o.glErrs.push('zoom ' + zi + (lg ? ' legacy' : ' materials') + ': ' + e);
      });
    }
    window.RTS_GROUND_LEGACY = false;
    o.zooms = RTS_ZOOMS.length;
    return o;
  });

  S.ok('the 3D mode is available to check', out.on, out.on ? 'on' : 'no WebGL');
  if (!out.on) { await g.close(); await browser.close(); return require('../lib/report.js')(S); }
  S.ok('the ground is materials by default', out.matOn === true, String(out.matOn));
  S.ok('...and the legacy switch really puts the old picture back', out.legacyOff, String(out.legacyOff));

  S.ok('the map has a coast to look at, and the boundary is found along it',
       out.coastAt && out.coastNew.found > 120 && out.coastOld.found > 120,
       'at ' + out.coastAt + ': ' + out.coastNew.found + ' boundary crossings with the cut, ' + out.coastOld.found + ' without');
  S.ok('without the per-pixel cut the coast is built from cells: straight edges a cell long',
       out.coastOld.longest >= out.cellPx * 0.6,
       'longest straight run ' + out.coastOld.longest + 'px at ' + out.cellPx + 'px a cell');
  /* The cut's own shape is the claim; the run found along it also moves with the ground on the
     land side of the line, which the boundary test reads - 20px with the first materials, 27px
     once they were built on shared noise, the coast drawn identically both times. A staircase
     is a cell's worth: 58px. */
  S.ok('with it, no straight edge anywhere near a cell long - the coast is a curve',
       out.coastNew.longest < out.cellPx * 0.35 && out.coastNew.longest < out.coastOld.longest * 0.6,
       'longest straight run ' + out.coastNew.longest + 'px, against ' + out.coastOld.longest + ' without');

  var pz = out.plaza;
  S.ok('the plaza in front of a building is on screen', !!pz, String(pz));
  S.ok('...and it is stone - not green, and not saturated',
       pz && pz[1] <= Math.max(pz[0], pz[2]) + 4 && Math.max(pz[0], pz[1], pz[2]) - Math.min(pz[0], pz[1], pz[2]) < 70,
       'rgb ' + pz + ' (the baked ground there: ' + out.plazaLegacy + ')');
  S.ok('a country road is found to look at', !!out.roadAt, String(out.roadAt));
  S.ok('...and it is asphalt: a dark grey, its channels close together',
       out.road && Math.max.apply(null, out.road) - Math.min.apply(null, out.road) < 22 && out.road[0] < 140,
       'rgb ' + out.road);

  S.eq('an unchanged map does not rebuild its ground map, frame after frame', out.idleBuilds, 0);
  S.eq('a new scorch mark rebuilds it once', out.scarBuilds, 1);
  S.ok('...and darkens the ground where it fell', out.lumaAfter < out.lumaBefore - 20,
       'luma ' + out.lumaBefore + ' -> ' + out.lumaAfter);
  S.ok('open grass is found to look at up close', !!out.grassAt, String(out.grassAt));
  S.ok('...and its relief is lumps, not streaks running across the screen',
       out.streak !== undefined && out.streak < 0.35,
       'the vertical step stays ' + out.streak + ' alike 8px along a row - 0.42 when the bump was value noise');
  S.eq('no draw is refused at any of the ' + out.zooms + ' zooms, in either ground', out.glErrs.join('; '), '');
  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
