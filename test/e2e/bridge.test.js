/* BRIDGES AND ROADS, on the built page - core/bridge.js, render3d/bridge3d.js, render3d/road3d.js,
   sprites/bridge.js.

     CROSSING    a tank sent to the far end of a bridge drives across the deck to get there, and
                 stands on it - over the water - on the way
     3D          every bridge has its model, and the model is in the picture: the frame over a
                 deck changes with the bridges taken out
     ROADS       the road paint is in the picture over a country road, and what it paints there
                 is asphalt - a dark grey - where the cells under it are a dirt shoulder
     2D          the bake paints the deck over the water, grey, not blue, and the 2D frame's
                 animated sea leaves it alone; the radar shows it as road */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('bridge');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 900, height: 760, dpr: 1 });
  await g.start(7, 1);

  var out = await g.page.evaluate(function () {
    var o = {}, R = _rtsR, G, i;
    rtsSetVoxSide('allied');
    _rtsNewGame(4242, 'easy');
    G = window._rtsG;
    for (i = 0; i < RTS_N * RTS_N; i++) { G.mapped[i] = 1; G.vis[i] = 1; }
    G.visDirty = 1;
    o.bridges = G.bridges.length;
    if (!o.bridges) return o;
    var br = G.bridges.slice().sort(function (a, b) { return b.len - a.len; })[0];
    o.br = br;
    var mx = br.tx + br.dx * Math.floor(br.len / 2), mz = br.tz + br.dz * Math.floor(br.len / 2);
    var mid = _rtsBridgeEnd(br, 0.5);

    /* ---------- CROSSING ---------- */
    var nx = br.tx - br.dx * 2, nz = br.tz - br.dz * 2, fx = br.tx + br.dx * br.len, fz = br.tz + br.dz * br.len;
    var u = _rtsSpawnUnit('player', 'tank', _rtsWX(nx), _rtsWX(nz));
    _rtsOrderMove(u, _rtsWX(fx), _rtsWX(fz));
    var deckTicks = 0, high = 0, arrived = false;
    for (var s = 0; s < 30 * 60; s++) {
      _rtsTick(1 / 30);
      var at = _rtsBridgeAt(u.x, u.z);
      if (at) { deckTicks++; high = Math.max(high, _rtsStandY(u.x, u.z) - Math.max(0, _rtsElev(u.x, u.z))); }
      if (Math.hypot(u.x - _rtsWX(fx), u.z - _rtsWX(fz)) < RTS_TILE * 1.6) { arrived = true; break; }
    }
    o.cross = { arrived: arrived, secs: +(s / 30).toFixed(1), deckTicks: deckTicks, high: +high.toFixed(2),
                dist: +(Math.hypot(u.x - _rtsWX(fx), u.z - _rtsWX(fz)) / RTS_TILE).toFixed(2), alive: !u.dead };

    /* ---------- 3D ---------- */
    rts3dSet(true);
    var R3 = window._R3D;
    o.on = !!(R3 && R3.on);
    if (o.on) {
      window.RTS_POST_ON = false; R3.cloudAmt = 0;
      R.focus.x = mid[0]; R.focus.z = mid[1]; R.zi = RTS_ZOOMS.length - 2; _rtsApplyCam();
      _rtsRFrame(0);
      o.models = (R3.bridges || []).length; o.tris = Math.round(R3.bridgeTris || 0);
      /* the tank as the renderer places it: parked mid-span, its draws caught on the way out */
      u.x = mid[0]; u.z = mid[1]; u.path = null; u.order = null;
      var push = window._r3dInstPush, ys = [];
      window._r3dInstPush = function (B, mesh, x, y) { if (Math.abs(x - u.x) < 1e-6 && Math.abs(arguments[4] - u.z) < 1e-6) ys.push(y); return push.apply(this, arguments); };
      _rtsRFrame(0);
      window._r3dInstPush = push;
      o.drawnY = ys.length ? +ys[0].toFixed(2) : null; o.deckY = +_rtsStandY(u.x, u.z).toFixed(2); o.groundY = +_rtsElev(u.x, u.z).toFixed(2);
      u.dead = true; G.ents.splice(G.ents.indexOf(u), 1);
      var gl = R3.gl, CW = R3.cv.width, CH = R3.cv.height;
      var shot = function () { _rtsRFrame(0); var b = new Uint8Array(CW * CH * 4); gl.readPixels(0, 0, CW, CH, gl.RGBA, gl.UNSIGNED_BYTE, b); return b; };
      var diffNear = function (a, b, sx, sy, r) {
        var n = 0, m = 0, sc = CW / R3.cv.clientWidth;
        for (var y = -r; y <= r; y++) for (var x = -r; x <= r; x++) {
          var px = Math.round((sx + x) * sc), py = CH - 1 - Math.round((sy + y) * sc);
          if (px < 0 || py < 0 || px >= CW || py >= CH) continue;
          var k = (py * CW + px) * 4; m++;
          if (Math.abs(a[k] - b[k]) + Math.abs(a[k + 1] - b[k + 1]) + Math.abs(a[k + 2] - b[k + 2]) > 30) n++;
        }
        return n / Math.max(1, m);
      };
      var keep = R3.bridges || [], A = shot();
      R3.bridges = []; var B = shot(); R3.bridges = keep;
      var sp = _r3dWorldToScreen(mid[0], _rtsBridgeDeckY(br, 0.5), mid[1]);
      o.bridgeSeen = +diffNear(A, B, sp.x, sp.y, 12).toFixed(2);

      /* a country road: three by three of road, no building within twelve cells */
      var road = null;
      for (i = 0; i < RTS_N * RTS_N && !road; i++) {
        var rx = i % RTS_N, rz = (i / RTS_N) | 0, ok = rx > 4 && rz > 4 && rx < RTS_N - 5 && rz < RTS_N - 5;
        for (var a1 = -1; a1 <= 1 && ok; a1++) for (var b1 = -1; b1 <= 1; b1++) if (G.terrain[_rtsIdx(rx + a1, rz + b1)] !== RTS_T_ROAD) ok = false;
        if (ok) G.ents.forEach(function (e) { if (e.type === 'struct' && Math.hypot(e.tx - rx, e.tz - rz) < 12) ok = false; });
        if (ok) road = [rx, rz];
      }
      o.road = road;
      if (road) {
        /* the centreline nearest that cell, so the sample sits on the carriageway */
        var best = null, bd = 1e9;
        G.roads.forEach(function (L) { for (var q = 0; q < L.length; q += 2) { var dd = Math.hypot(L[q] - road[0], L[q + 1] - road[1]); if (dd < bd) { bd = dd; best = [L[q], L[q + 1]]; } } });
        var wx = (best[0] - RTS_N / 2 + 0.5) * RTS_TILE, wz = (best[1] - RTS_N / 2 + 0.5) * RTS_TILE;
        R.focus.x = wx; R.focus.z = wz; _rtsApplyCam();
        var rp = _r3dWorldToScreen(wx + 1.6, _rtsElev(wx + 1.6, wz), wz);
        R3.roadAmt = 0; var P0 = shot(); R3.roadAmt = 1; var P1 = shot();
        o.roadSeen = +diffNear(P0, P1, rp.x, rp.y, 6).toFixed(2);
        var sc2 = CW / R3.cv.clientWidth, k2 = ((CH - 1 - Math.round(rp.y * sc2)) * CW + Math.round(rp.x * sc2)) * 4;
        o.roadRgb = [P1[k2], P1[k2 + 1], P1[k2 + 2]]; o.dirtRgb = [P0[k2], P0[k2 + 1], P0[k2 + 2]];
      }
      R3.roadAmt = 1;
    }

    /* ---------- 2D ---------- */
    rts3dSet(false);
    var T = R.terrain, tg = T.getContext('2d'), TS = RTS_TS;
    function bakeAt(cx, cz) { var d = tg.getImageData(Math.round((cx + 0.5) * TS), Math.round((cz + 0.5) * TS), 1, 1).data; return [d[0], d[1], d[2]]; }
    o.bakeDeck = bakeAt(mx + br.px * 0, mz + br.pz * 0);
    /* open water beside the deck, two cells off it */
    o.bakeSea = bakeAt(mx - br.px * 3, mz - br.pz * 3);
    R.focus.x = _rtsWX(mx); R.focus.z = _rtsWX(mz); R.zi = RTS_ZOOMS.length - 2; _rtsApplyCam();
    var blueish = 0, cells = 0;
    for (var fr = 0; fr < 4; fr++) {
      G.t += 0.3; _rtsRFrame(0.3);
      var cv = R.cv, cg = cv.getContext('2d'), sp2 = _rtsGroundToScreen(_rtsWX(mx), _rtsWX(mz)), dpr = cv.width / cv.clientWidth;
      var dd2 = cg.getImageData(Math.round(sp2.x * dpr) - 3, Math.round(sp2.y * dpr) - 3, 7, 7).data;
      for (var j = 0; j < dd2.length; j += 4) { cells++; if (dd2[j + 2] > dd2[j] + 25) blueish++; }
    }
    o.frameBlue = +(blueish / cells).toFixed(2);
    /* the radar, lit for the measurement */
    var lit = window._rtsRadarLit; window._rtsRadarLit = function () { return true; };
    _rtsDrawMini(); window._rtsRadarLit = lit;
    var mini = document.getElementById('rtsMini'), msc = mini.width / RTS_N;
    var md = mini.getContext('2d').getImageData(Math.floor((mx + 0.5) * msc), Math.floor((mz + 0.5) * msc), 1, 1).data;
    o.radar = [md[0], md[1], md[2]];
    return o;
  });

  S.ok('this map has bridges to check', out.bridges > 0, out.bridges + ' bridges, the longest ' + (out.br && out.br.len) + ' cells');
  if (out.bridges) {
    S.ok('a tank sent to the far end crosses the deck to get there', out.cross.arrived && out.cross.deckTicks > 20 && out.cross.alive,
         JSON.stringify(out.cross));
    S.ok('...standing on it, over the water', out.cross.high > 1.0, out.cross.high + ' world units above the ground under it');
    S.ok('the 3D mode is available to check', out.on, String(out.on));
    if (out.on) {
      S.ok('a tank parked mid-span is drawn on the deck, not on the water', out.drawnY !== null && Math.abs(out.drawnY - out.deckY) < 0.01 && out.drawnY > out.groundY + 1,
           'drawn at ' + out.drawnY + ', the deck ' + out.deckY + ', the ground under it ' + out.groundY);
      S.ok('every bridge has its model', out.models === out.bridges && out.tris > 500, out.models + ' models, ' + out.tris + ' triangles');
      S.ok('...and it is in the picture: the frame over a deck changes without it', out.bridgeSeen > 0.4, (out.bridgeSeen * 100) + '% of the pixels round mid-span');
      S.ok('a country road is found to look at', !!out.road, String(out.road));
      if (out.road) {
        S.ok('the road paint is in the picture there', out.roadSeen > 0.5, (out.roadSeen * 100) + '% of the pixels changed');
        S.ok('...and it is asphalt where the cells are a dirt shoulder: grey, and darker', Math.max.apply(null, out.roadRgb) - Math.min.apply(null, out.roadRgb) < 22 &&
             out.roadRgb[0] < out.dirtRgb[0] - 20, 'rgb ' + out.roadRgb + ' against ' + out.dirtRgb + ' unpainted');
      }
    }
    S.ok('in 2D the bake paints the deck over the water: grey, not blue', Math.abs(out.bakeDeck[2] - out.bakeDeck[0]) < 25 && out.bakeSea[2] > out.bakeSea[0] + 30,
         'deck rgb ' + out.bakeDeck + ', the sea beside it ' + out.bakeSea);
    S.ok('...and the 2D frame\'s moving sea leaves it alone', out.frameBlue < 0.1, (out.frameBlue * 100) + '% of the deck\'s pixels blue over four frames');
    S.ok('the radar shows a bridge as road, not sea', out.radar[0] > out.radar[2] + 15, 'rgb ' + out.radar);
  }
  S.ok('no page errors', g.errors.length === 0, g.errors.join(' | ') || 'none');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
