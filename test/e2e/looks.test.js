/* WHAT THE PICTURE GOT WRONG AT A PHONE'S ZOOM - found by rendering the game and looking.

     SANDBAGS   the map's old emplacements (RTS_T_WALL) block, and the 3D mode drew nothing on
                them: a slab of pale concrete in a meadow that tanks drove round. Each cell
                carries a wall of bags now, on trodden earth (render3d/world3d.js)
     INFANTRY   a rifle squad at the default zoom was two figures a few pixels tall. Soldiers
                alone are drawn larger as the view pulls back, and at their own size close in;
                a tank is not touched (render3d/unit3d.js)
     THE BARS   every unit's health bar was 26 px by 4, wider than a tank. A unit's is as wide
                as the unit, and paler unhurt (ui/hud.js)
     NIGHT      was too dark to play: lighter, still the darkest sky and still blue (sky3d.js)
     ROADS      were a cell and a half across and near-black. Narrower, and a worn grey: what
                was carriageway three units out is the shoulder now (render3d/road3d.js)
     ON A HILL  a cell's rocks, trees and bags are raised to its ground - and each corner was
                raised once for every face that shares it, so on high ground a rock stood
                stretched and floating, a ridge on a plateau a wall of pillars (_r3dLiftFrom)

   Every picture claim is an A/B in one page, through the switch each change carries. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('looks');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 900, height: 700, dpr: 1 });
  await g.start(7, 1, { freeze: true });

  var out = await g.page.evaluate(function () {
    var o = {}, R = _rtsR, i;
    rtsSetArmySide('allied');
    _rtsNewGame(4242, 'easy');
    var G = window._rtsG, R3 = window._R3D;
    for (i = 0; i < RTS_N * RTS_N; i++) { G.mapped[i] = 1; G.vis[i] = 1; }
    G.visDirty = 1;
    o.on = !!(R3 && R3.on);
    if (!o.on) return o;
    window.RTS_SKY_FORCE = 'day';
    G.ents.forEach(function (e) { if (e.type === 'unit') e.dead = true; });
    G.sel.length = 0;
    function shot() { _rtsRFrame(0); var cc = _rtsCompose(); return { d: cc.getContext('2d').getImageData(0, 0, cc.width, cc.height).data, w: cc.width, h: cc.height, k: cc.width / R.W }; }
    /* the mean colour of a patch r pixels round a screen point */
    function mean(F, sp, r) {
      var s = [0, 0, 0], n = 0, cx = Math.round(sp.x * F.k), cy = Math.round(sp.y * F.k);
      for (var y = cy - r; y <= cy + r; y++) for (var x = cx - r; x <= cx + r; x++) {
        if (x < 0 || y < 0 || x >= F.w || y >= F.h) continue;
        var p = (y * F.w + x) * 4; s[0] += F.d[p]; s[1] += F.d[p + 1]; s[2] += F.d[p + 2]; n++;
      }
      return n ? s.map(function (v) { return Math.round(v / n); }) : null;
    }
    /* how many pixels of a box round a screen point differ between two frames */
    function differ(A, B, sp, r, tol) {
      var n = 0, cx = Math.round(sp.x * A.k), cy = Math.round(sp.y * A.k);
      for (var y = Math.max(0, cy - r); y <= Math.min(A.h - 1, cy + r); y++) for (var x = Math.max(0, cx - r); x <= Math.min(A.w - 1, cx + r); x++) {
        var p = (y * A.w + x) * 4;
        if (Math.abs(A.d[p] - B.d[p]) + Math.abs(A.d[p + 1] - B.d[p + 1]) + Math.abs(A.d[p + 2] - B.d[p + 2]) > (tol || 0)) n++;
      }
      return n;
    }
    function whole(A, B) { var n = 0; for (var p = 0; p < A.d.length; p += 4) if (A.d[p] !== B.d[p] || A.d[p + 1] !== B.d[p + 1] || A.d[p + 2] !== B.d[p + 2]) n++; return n; }
    function luma(F) { var s = 0, r = 0, b = 0, n = F.d.length / 4; for (var p = 0; p < F.d.length; p += 4) { s += 0.299 * F.d[p] + 0.587 * F.d[p + 1] + 0.114 * F.d[p + 2]; r += F.d[p]; b += F.d[p + 2]; } return { l: s / n, r: r / n, b: b / n }; }
    function farFromBase(tx, tz, cells) { return !G.ents.some(function (e) { return !e.dead && e.type === 'struct' && Math.abs(e.tx - tx) < cells && Math.abs(e.tz - tz) < cells; }); }
    var CLOSE = RTS_ZOOM_BASE_STEPS - 1;

    /* ---------------- sandbags ---------------- */
    var wall = null, walls = 0;
    for (i = 0; i < RTS_N * RTS_N; i++) {
      if (G.terrain[i] !== RTS_T_WALL) continue;
      walls++;
      var wx = i % RTS_N, wz = (i / RTS_N) | 0;
      if (!wall && farFromBase(wx, wz, 10) && (G.terrain[_rtsIdx(wx + 1, wz)] === RTS_T_WALL || G.terrain[_rtsIdx(wx, wz + 1)] === RTS_T_WALL)) wall = [wx, wz];
    }
    o.walls = walls; o.wall = wall;
    if (wall) {
      R.zi = CLOSE; _rtsApplyCam(); _rtsLookAt(_rtsWX(wall[0]), _rtsWX(wall[1]));
      o.blocked = _rtsBlocked(wall[0], wall[1]);
      var WA = shot(); o.trisBags = R3.worldTris;
      /* projected once a frame has been drawn at this camera: the view's own numbers are the frame's */
      var wy = _rtsElev(_rtsWX(wall[0]), _rtsWX(wall[1])), top = _rtsWorldToScreen(_rtsWX(wall[0]), wy + 1.0, _rtsWX(wall[1]));
      o.wallAt = [Math.round(top.x), Math.round(top.y)];
      R3.bagOff = true; _r3dWorldBuild(G);
      var WB = shot(); o.trisNone = R3.worldTris;
      R3.bagOff = false; _r3dWorldBuild(G);
      var WA2 = shot();
      o.bagControl = whole(WA, WA2);
      o.bagSeen = differ(WA, WB, top, 14, 24) / (29 * 29);
      o.bagRgb = mean(WA, top, 4); o.groundRgb = mean(WB, top, 4);
    }

    /* ---------------- on a hill ---------------- */
    var hi = null, hiN = 0;
    for (i = 0; i < RTS_N * RTS_N; i++) {
      if (G.terrain[i] !== RTS_T_ROCK) continue;
      var eh = _rtsTileElev(i % RTS_N, (i / RTS_N) | 0);
      if (eh > 2) hiN++;
      if (eh > 2 && (!hi || eh > hi.h)) hi = { tx: i % RTS_N, tz: (i / RTS_N) | 0, h: eh };
    }
    o.hill = hi; o.hillRocks = hiN;
    if (hi) {
      function span(shared) {
        var f = []; _r3dRockCell(f, hi.tx, hi.tz);
        var lo = 1e9, top = -1e9;
        f.forEach(function (q) { q.v.forEach(function (pt) { lo = Math.min(lo, pt[1]); top = Math.max(top, pt[1]); }); });
        R3.liftShared = shared; _r3dLiftFrom(f, 0, hi.h); R3.liftShared = false;
        var lo2 = 1e9, top2 = -1e9;
        f.forEach(function (q) { q.v.forEach(function (pt) { lo2 = Math.min(lo2, pt[1]); top2 = Math.max(top2, pt[1]); }); });
        return { faces: f.length, foot: +(lo2 - lo).toFixed(3), top: +(top2 - top).toFixed(3), tall: +(top2 - lo2).toFixed(2), was: +(top - lo).toFixed(2) };
      }
      o.lift = span(false); o.liftOld = span(true);
      R.zi = CLOSE; _rtsApplyCam(); _rtsLookAt(_rtsWX(hi.tx), _rtsWX(hi.tz));
      var HA = shot();
      R3.liftShared = true; _r3dWorldBuild(G); var HB = shot();
      R3.liftShared = false; _r3dWorldBuild(G);
      o.hillSeen = whole(HA, HB) / (HA.w * HA.h);
    }

    /* ---------------- infantry ---------------- */
    o.inf = { near: _r3dInfScale(48), nearer: _r3dInfScale(96), far: _r3dInfScale(16), farther: _r3dInfScale(8), def: _r3dInfScale(24), mid: _r3dInfScale(32) };
    var yd = _rtsHas('player', 'yard'), spot = null;
    for (var rr = 8; rr < 30 && !spot; rr++) for (var a = 0; a < 16 && !spot; a++) {
      var sx = Math.round(yd.tx + Math.cos(a / 16 * 6.283) * rr), sz = Math.round(yd.tz + Math.sin(a / 16 * 6.283) * rr), ok = _rtsInB(sx, sz) && farFromBase(sx, sz, 6);
      for (var dx = -2; dx <= 2 && ok; dx++) for (var dz = -2; dz <= 2 && ok; dz++) if (!_rtsInB(sx + dx, sz + dz) || G.terrain[_rtsIdx(sx + dx, sz + dz)] !== RTS_T_GRASS || _rtsBlocked(sx + dx, sz + dz)) ok = false;
      if (ok) spot = [sx, sz];
    }
    o.spot = spot;
    if (spot) {
      var px0 = _rtsWX(spot[0]), pz0 = _rtsWX(spot[1]);
      function at(zi) { R.zi = zi; _rtsApplyCam(); _rtsLookAt(px0, pz0); }
      function pair(def) {            /* at the default zoom and close in: the unit alone, scaled and not */
        var r = {};
        at(RTS_ZOOM_DEF); r.cell = R.cell;
        var E = shot(), sp = _rtsGroundToScreen(px0, pz0);
        var u = _rtsSpawnUnit('player', def, px0, pz0);
        R3.infScaleOff = false; var F1 = shot(); R3.infScaleOff = true; var F0 = shot(); R3.infScaleOff = false;
        r.on = differ(F1, E, sp, 40, 12); r.off = differ(F0, E, sp, 40, 12); r.diff = whole(F1, F0);
        at(CLOSE); r.closeCell = R.cell;
        var C1 = shot(); R3.infScaleOff = true; var C0 = shot(); R3.infScaleOff = false;
        r.closeDiff = whole(C1, C0);
        u.dead = true;
        return r;
      }
      o.rifle = pair('rifle'); o.tank = pair('tank');

      /* ---------------- the bars ---------------- */
      at(RTS_ZOOM_DEF);
      var sq = _rtsSpawnUnit('player', 'rifle', px0 - 6, pz0), tk = _rtsSpawnUnit('player', 'tank', px0 + 6, pz0);
      tk.hp = tk.maxHp * 0.5;
      G.sel = [sq, tk]; _rtsRFrame(0);
      var rects = [], P = CanvasRenderingContext2D.prototype, real = P.fillRect;
      P.fillRect = function (x, y, w, h) { rects.push([x, y, w, h, this.globalAlpha, String(this.fillStyle)]); return real.apply(this, arguments); };
      _rtsDrawHud(0);
      P.fillRect = real;
      /* a bar's backing is the bar and a pixel all round, in the backing's own black */
      var backs = rects.filter(function (q) { return /0,\s*0,\s*0,\s*0\.55/.test(q[5]) && q[3] < 8; }).map(function (q) { return { w: q[2] - 2, h: q[3] - 2, a: q[4], x: q[0] + q[2] / 2 }; });
      o.rects = rects.length;
      var ssq = _rtsWorldToScreen(sq.x, 2.6, sq.z), stk = _rtsWorldToScreen(tk.x, 3.4, tk.z);
      function near(sp) { return backs.filter(function (b) { return Math.abs(b.x - sp.x) < 3; })[0] || null; }
      o.bars = { n: backs.length, squad: near(ssq), tank: near(stk), ppuSquad: _rtsPxPerUnit(sq), ppuTank: _rtsPxPerUnit(tk), rSquad: sq.r, rTank: tk.r };
      o.barPure = { struct: _rtsBarSize({ type: 'struct', hp: 5, maxHp: 10 }, 1, 0), small: _rtsBarSize({ type: 'unit', r: 0.5, hp: 10, maxHp: 10 }, 1, 6),
                    big: _rtsBarSize({ type: 'unit', r: 4, hp: 3, maxHp: 10 }, 1, 12), scaled: _rtsBarSize({ type: 'unit', r: 1, hp: 3, maxHp: 10 }, 2, 8) };
      sq.dead = true; tk.dead = true; G.sel.length = 0;

      /* ---------------- night ---------------- */
      at(RTS_ZOOM_DEF);
      var day = luma(shot());
      window.RTS_SKY_FORCE = 'night';
      var night = luma(shot());
      var keepL = R3D_SKIES.night.L, keepS = R3D_SKIES.night.S;
      R3D_SKIES.night.L = [0.24, 0.29, 0.46]; R3D_SKIES.night.S = [0.15, 0.18, 0.31];
      var old = luma(shot());
      R3D_SKIES.night.L = keepL; R3D_SKIES.night.S = keepS;
      window.RTS_SKY_FORCE = 'day';
      o.night = { day: +day.l.toFixed(1), now: +night.l.toFixed(1), was: +old.l.toFixed(1), r: +night.r.toFixed(1), b: +night.b.toFixed(1), L: keepL, S: keepS };
    }

    /* ---------------- roads ---------------- */
    var seg = null, N = RTS_N, T = RTS_TILE;
    var dbg = { roads: (G.roads || []).length, tried: 0, straight: 0, country: 0, alone: 0 };
    function rpt(L, k) { return [(L[k] - N / 2 + 0.5) * T, (L[k + 1] - N / 2 + 0.5) * T]; }
    (G.roads || []).forEach(function (L) {
      /* THE LINE IS LAID IN STEPS OF A FRACTION OF A CELL, and it bends: a chord of twelve units
         along it whose points between lie on the chord is a straight stretch, and its middle a
         place where 'so far from the line' means so far from the centre of the road */
      for (var k = 0; k + 3 < L.length && !seg; k += 2) {
        var A0 = rpt(L, k), j = k + 2, B0 = null;
        while (j + 1 < L.length) { B0 = rpt(L, j); if (Math.hypot(B0[0] - A0[0], B0[1] - A0[1]) >= 12) break; j += 2; }
        if (!B0 || j + 1 >= L.length) return;
        var len = Math.hypot(B0[0] - A0[0], B0[1] - A0[1]), ux = (B0[0] - A0[0]) / len, uz = (B0[1] - A0[1]) / len, bend = 0;
        for (var m = k + 2; m < j; m += 2) { var q = rpt(L, m); bend = Math.max(bend, Math.abs((q[0] - A0[0]) * -uz + (q[1] - A0[1]) * ux)); }
        dbg.tried++;
        if (bend > 0.2) continue;
        dbg.straight++;
        var mx = (A0[0] + B0[0]) / 2, mz = (A0[1] + B0[1]) / 2, tx = _rtsTX(mx), tz = _rtsTX(mz);
        if (!_rtsInB(tx, tz) || !farFromBase(tx, tz, 12) || G.terrain[_rtsIdx(tx, tz)] !== RTS_T_ROAD) continue;
        dbg.country++;
        /* open ground either side: nothing standing over the shoulder to be sampled instead of it */
        var all = true;
        for (var da = -1; da <= 1; da++) for (var db = -1; db <= 1; db++) {
          var kk = _rtsInB(tx + da, tz + db) ? G.terrain[_rtsIdx(tx + da, tz + db)] : RTS_T_WATER;
          if (kk !== RTS_T_ROAD && kk !== RTS_T_GRASS && kk !== RTS_T_SAND) all = false;
        }
        /* ...and ONE road: the generator lays several down the same route, and two side by side
           are one wide carriageway whose middle is neither's line */
        (G.roads || []).forEach(function (L2) {
          if (L2 === L) return;
          for (var n2 = 0; n2 + 1 < L2.length; n2 += 2) { var q2 = rpt(L2, n2); if (Math.hypot(q2[0] - mx, q2[1] - mz) < 10) all = false; }
        });
        if (all) { dbg.alone++; seg = { x: mx, z: mz, ux: ux, uz: uz }; }
      }
    });
    o.seg = !!seg; o.roadDbg = dbg;
    if (seg) {
      R.zi = CLOSE; _rtsApplyCam(); _rtsLookAt(seg.x, seg.z);
      var RP = shot(); R3.roadAmt = 0; var RN = shot(); R3.roadAmt = undefined;
      function off(d) { return _rtsGroundToScreen(seg.x - seg.uz * d, seg.z + seg.ux * d); }
      function spread(c) { return Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]); }
      function side(d) { var c = mean(RP, off(d), 2), n = mean(RN, off(d), 2); return { rgb: c, spread: spread(c), bare: n, moved: Math.abs(c[0] - n[0]) + Math.abs(c[1] - n[1]) + Math.abs(c[2] - n[2]) }; }
      o.road = { half: R3D_ROAD_HALF, mid: [side(0.9), side(-0.9)], out: [side(3.0), side(-3.0)], far: [side(4.6), side(-4.6)] };
    }
    return o;
  });

  S.ok('the 3D mode is available to check', out.on, out.on ? 'on' : 'no WebGL');
  if (!out.on) { await g.close(); await browser.close(); return require('../lib/report.js')(S); }

  /* ---- sandbags ---- */
  S.ok('the map has sandbag walls, and one out in the country to look at (population)', out.walls > 10 && !!out.wall, out.walls + ' cells, looking at ' + out.wall);
  if (out.wall) {
    S.ok('a wall cell blocks, as it always did', out.blocked === true, String(out.blocked));
    S.eq('control: the world built twice is the same picture', out.bagControl, 0);
    S.ok('SANDBAGS: the wall is in the picture - the frame over its cell changes without it', out.bagSeen > 0.25, Math.round(out.bagSeen * 100) + '% of the pixels over the cell');
    S.ok('...and it is geometry: the world carries more triangles with it', out.trisBags > out.trisNone + out.walls * 40, out.trisBags + ' against ' + out.trisNone + ' without, for ' + out.walls + ' cells');
    S.ok('...the colour of sandbags: a pale tan', out.bagRgb[0] > out.bagRgb[2] + 25 && out.bagRgb[0] > 110, 'rgb ' + out.bagRgb);
    S.ok('...standing on trodden earth, not a slab of grey concrete', out.groundRgb[0] > out.groundRgb[2] + 25, 'rgb ' + out.groundRgb + ' under it');
  }

  /* ---- on a hill ---- */
  S.ok('there is rock on high ground to look at (population)', !!out.hill && out.hillRocks > 3, out.hillRocks + ' cells, the highest at ' + (out.hill && out.hill.h));
  if (out.hill) {
    var LF = out.lift, LO = out.liftOld;
    S.ok('ON A HILL: a rock is raised by its ground\'s height, foot and top alike', LF.faces > 4 && LF.foot === out.hill.h && LF.top === out.hill.h && LF.tall === LF.was, JSON.stringify(LF));
    S.ok('...where it was stretched: its top raised further than its foot', LO.top > LO.foot + 1 && LO.tall > LO.was + 1, JSON.stringify(LO));
    S.ok('...and the picture of the ridge changes with it', out.hillSeen > 0.01, (out.hillSeen * 100).toFixed(1) + '% of the frame');
  }

  /* ---- infantry ---- */
  var I = out.inf;
  S.ok('a soldier is drawn at his own size close in', I.near === 1 && I.nearer === 1, JSON.stringify(I));
  S.ok('...larger the further out, up to R3D_INF_FAR and no further', I.far > 1.8 && I.farther === I.far && I.def > I.mid && I.mid > 1 && I.def < I.far, JSON.stringify(I));
  S.ok('open grass near the base to stand a unit on (population)', !!out.spot, String(out.spot));
  if (out.spot) {
    var rf = out.rifle, tk = out.tank;
    S.ok('a rifle squad at the default zoom is in the picture (population)', rf.off > 8 && rf.cell < 48, rf.off + ' pixels at ' + rf.cell + ' px a cell');
    S.ok('INFANTRY: it covers well over half as much again as at its own size', rf.on > rf.off * 1.6, rf.on + ' pixels against ' + rf.off);
    S.eq('...and close in it is drawn exactly as it was', rf.closeDiff, 0);
    S.ok('a tank at the default zoom is in the picture (population)', tk.off > 30, tk.off + ' pixels');
    S.eq('...and is not touched at either zoom', tk.diff + tk.closeDiff, 0);

    /* ---- the bars ---- */
    var B = out.bars, BP = out.barPure;
    S.ok('a selected squad and a selected tank each carry a bar (population)', B.n === 2 && !!B.squad && !!B.tank, JSON.stringify(B));
    if (B.squad && B.tank) {
      /* the projection's own scale is on both (the tilt draws a far unit smaller): h / 3 */
      S.ok('THE BARS: a squad\'s is narrower than a tank\'s, and neither wider than the 26 it was', B.squad.w < B.tank.w - 4 && B.tank.w <= 26, B.squad.w.toFixed(1) + ' and ' + B.tank.w.toFixed(1) + ' px');
      S.near('...a tank\'s as wide as the tank is drawn', B.tank.w, Math.max(10, Math.min(26, B.rTank * 2 * B.ppuTank)) * B.tank.h / 3, 0.6);
      S.near('...and a squad\'s as the squad is', B.squad.w, Math.max(10, Math.min(26, B.rSquad * 2 * B.ppuSquad)) * B.squad.h / 3, 0.6);
      S.ok('...the unhurt squad\'s paler than the hurt tank\'s', B.squad.a < 0.8 && B.tank.a === 1, B.squad.a + ' and ' + B.tank.a);
    }
    S.ok('a building\'s bar is as it was, 46 by 4', BP.struct.w === 46 && BP.struct.h === 4 && BP.struct.a === 1, JSON.stringify(BP.struct));
    S.ok('a unit\'s is held between 10 and 26 px, 3 high, and scales with the projection', BP.small.w === 10 && BP.big.w === 26 && BP.small.h === 3 && BP.scaled.w === 32 && BP.scaled.h === 6, JSON.stringify(BP));

    /* ---- night ---- */
    var NI = out.night;
    S.ok('NIGHT: lighter than it was, by a third at least', NI.now > NI.was * 1.33, 'luminance ' + NI.now + ' against ' + NI.was + ' (day ' + NI.day + ')');
    S.ok('...still well under the day', NI.now < NI.day * 0.7, NI.now + ' against ' + NI.day);
    S.ok('...and still blue', NI.b > NI.r + 3, 'red ' + NI.r + ', blue ' + NI.b);
  }

  /* ---- roads ---- */
  S.ok('a straight stretch of country road is found to look at (population)', out.seg, JSON.stringify(out.roadDbg));
  if (out.seg) {
    var RD = out.road;
    S.ok('the carriageway is painted either side of its centre line: grey', RD.mid.every(function (s) { return s.moved > 40 && s.spread < 24; }), JSON.stringify(RD.mid));
    S.ok('ROADS: a worn grey, not near-black', RD.mid.every(function (s) { return s.rgb[0] > 64 && s.rgb[0] < 150; }), 'rgb ' + RD.mid.map(function (s) { return s.rgb.join(','); }).join(' and '));
    S.ok('...and narrower: three units out, where the carriageway was, is the shoulder\'s earth', RD.out.every(function (s) { return s.spread > 26; }) && RD.half < 3,
         'rgb ' + RD.out.map(function (s) { return s.rgb.join(','); }).join(' and ') + '; half-width ' + RD.half);
    S.ok('...with nothing painted well clear of it', RD.far.every(function (s) { return s.moved < 12; }), JSON.stringify(RD.far.map(function (s) { return s.moved; })));
  }
  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
