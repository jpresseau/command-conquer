/* WHAT MOVES ON A UNIT, in the picture - render3d/unit3d.js and crawl3d.js, each taken with its
   kill switch and without, so a difference is the feature and nothing else:

     TRACKS    a tank that has rolled a quarter turn of its running gear shows it - the frame
               differs from the unrolled one over the tank and nowhere else - and a full turn
               on, it is the unrolled picture again; a parked tank's tracks stand still
     ROTOR     the blades turn over the airframe: two moments apart the helicopter differs, with
               R3.rotorOff it does not, and with the blades turned a quarter round it is the
               single model it always was, pixel for pixel
     SWELL     a ship on the swell is lifted and leaned with it, and the hull is not swallowed
               by the crests that wash over one sitting at a fixed level
     CRAWL     a prone squad lies as the 3D soldier rather than the sprite's model, crawls when
               it moves, and lies still when it does not */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('motion');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 900, height: 760, dpr: 1 });
  await g.start(7, 1);

  var out = await g.page.evaluate(function () {
    var o = {}, R = _rtsR, G = window._rtsG, i;
    for (i = 0; i < RTS_N * RTS_N; i++) { G.mapped[i] = 1; G.vis[i] = 1; }
    G.visDirty = 1;
    rts3dSet(true);
    var R3 = window._R3D;
    o.on = !!(R3 && R3.on);
    if (!o.on) return o;
    window.RTS_POST_ON = false;
    R3.cloudAmt = 0; R3.swayAmt = 0; R3.surfAmt = 0;
    G.fx.length = 0;
    G.ents.forEach(function (e) { if (e.type === 'unit') e.path = null; });
    var gl = R3.gl, CW = R3.cv.width, CH = R3.cv.height, t0 = G.t;
    function look(x, z) { R.focus.x = x; R.focus.z = z; R.zi = RTS_ZOOMS.length - 1; _rtsApplyCam(); }
    function shot(t) {
      G.t = t; G.fx.length = 0; _rtsRFrame(0);
      var b = new Uint8Array(CW * CH * 4);
      gl.readPixels(0, 0, CW, CH, gl.RGBA, gl.UNSIGNED_BYTE, b);
      return b;
    }
    function boxOf(e, r, h) {
      var y = _rtsElev(e.x, e.z), b = { x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9 };
      [[-r, 0, -r], [r, 0, -r], [-r, 0, r], [r, 0, r], [-r, h, -r], [r, h, -r], [-r, h, r], [r, h, r]].forEach(function (c) {
        var p = _rtsWorldToScreen(e.x + c[0], y + c[1], e.z + c[2]);
        b.x0 = Math.min(b.x0, p.x * R.dpr); b.x1 = Math.max(b.x1, p.x * R.dpr);
        b.y0 = Math.min(b.y0, p.y * R.dpr); b.y1 = Math.max(b.y1, p.y * R.dpr);
      });
      return b;
    }
    function diff(P, Q, B) {
      var r = { in: 0, out: 0 };
      for (var y = 0; y < CH; y++) for (var x = 0; x < CW; x++) {
        var q = ((CH - 1 - y) * CW + x) * 4;
        if (Math.abs(P[q] - Q[q]) + Math.abs(P[q + 1] - Q[q + 1]) + Math.abs(P[q + 2] - Q[q + 2]) <= 12) continue;
        if (x >= B.x0 && x <= B.x1 && y >= B.y0 && y <= B.y1) r.in++; else r.out++;
      }
      return r;
    }
    var yd = _rtsHas('player', 'yard');

    /* TRACKS */
    var tank = _rtsSpawnUnit('player', 'tank', yd.x + 16, yd.z + 16);
    tank.rot = 0.5;
    look(tank.x, tank.z);
    shot(t0 + 1);                                           /* builds it, and learns its roll */
    var len = R3.rollLen && R3.rollLen.tank, mo = R3.motion[tank.id], BT = boxOf(tank, 5, 4);
    o.len = len;
    mo.d = len * 0.3;
    R3.rollOff = true; var T0 = shot(t0 + 1);
    R3.rollOff = false; var T1 = shot(t0 + 1);
    o.quarter = diff(T0, T1, BT);
    mo.d = len * 1.05; var T2 = shot(t0 + 1);
    o.full = diff(T0, T2, BT);
    mo.d = len * 0.3; var T3 = shot(t0 + 3);
    o.parked = diff(T1, T3, BT);
    tank.dead = true;

    /* ROTOR */
    var heli = _rtsSpawnUnit('player', 'heli', yd.x + 16, yd.z + 16);
    heli.rot = 0.5; heli.alt = 12;
    look(heli.x, heli.z);
    var BH = boxOf(heli, 9, 8);
    var H0 = shot(t0 + 1), H1 = shot(t0 + 1.06);
    o.spin = diff(H0, H1, BH);
    R3.rotorOff = true; var HA = shot(t0 + 1), HB = shot(t0 + 1.06);
    o.spinOff = diff(HA, HB, BH);
    R3.rotorOff = false;
    var hm = R3.motion[heli.id];
    hm.spin = Math.PI / 2; hm.t = t0 + 1; var HQ = shot(t0 + 1);
    o.quarterBlade = diff(HA, HQ, BH);
    hm.spin = Math.PI / 4; hm.t = t0 + 1; var HE = shot(t0 + 1);
    o.eighthBlade = diff(HA, HE, BH);
    heli.dead = true;

    /* SWELL: open water, a few cells from any land */
    var sea = null;
    for (var r2 = 0; r2 < 60 && !sea; r2++) for (var a = 0; a < 24 && !sea; a++) {
      var cx = _rtsTX(yd.x) + Math.round(Math.cos(a / 24 * 6.283) * r2), cz = _rtsTX(yd.z) + Math.round(Math.sin(a / 24 * 6.283) * r2), ok = true;
      for (var dz = -3; dz <= 3 && ok; dz++) for (var dx = -3; dx <= 3 && ok; dx++)
        if (!_rtsInB(cx + dx, cz + dz) || G.terrain[_rtsIdx(cx + dx, cz + dz)] !== RTS_T_WATER) ok = false;
      if (ok) sea = [cx, cz];
    }
    o.sea = !!sea;
    if (sea) {
      var ship = _rtsSpawnUnit('player', 'destroyer', _rtsWX(sea[0]), _rtsWX(sea[1]));
      ship.rot = 0.3;
      look(ship.x, ship.z);
      var BS = boxOf(ship, 9, 6);
      /* how much of the ship is seen: the frame with it against the frame without it */
      function seen(t) { ship.dead = true; var W = shot(t); ship.dead = false; var V = shot(t); return diff(W, V, BS).in; }
      var on = [], off = [], ts = [];
      for (var k = 0; k < 8; k++) ts.push(t0 + 2 + k * 0.9);
      ts.forEach(function (t) { on.push(seen(t)); });
      R3.swellOff = true; ts.forEach(function (t) { off.push(seen(t)); }); R3.swellOff = false;
      o.seenOn = on; o.seenOff = off;
      R3.swellOff = true; var SA = shot(t0 + 4); R3.swellOff = false; var SB = shot(t0 + 4);
      o.ride = diff(SA, SB, BS);
      o.lean = ts.map(function (t) { var n = _r3dShipSwell(ship, t).n; return +(Math.acos(n[1]) * 57.3).toFixed(1); });
      ship.dead = true;
    }

    /* CRAWL */
    var lie = _rtsSpawnUnit('player', 'rifle', yd.x + 10, yd.z + 16), crawl = _rtsSpawnUnit('player', 'rifle', yd.x + 22, yd.z + 16);
    lie.prone = crawl.prone = 1; lie.rot = crawl.rot = 0.4;
    crawl.path = [{ x: crawl.x + 40, z: crawl.z }];
    look(yd.x + 16, yd.z + 16);
    var BL = boxOf(lie, 5, 3), BC = boxOf(crawl, 5, 3);
    R3.soldierOff = true; var CA = shot(t0 + 1); R3.soldierOff = false; var CB = shot(t0 + 1);
    o.ownLie = diff(CA, CB, BL); o.ownCrawl = diff(CA, CB, BC);
    var CC = shot(t0 + 1.4);
    o.crawlMoves = diff(CB, CC, BC); o.lieStill = diff(CB, CC, BL);
    o.crawlPoses = [_r3dCrawlPose(crawl, t0 + 1), _r3dCrawlPose(crawl, t0 + 1.4)];
    lie.dead = crawl.dead = true;

    gl.getError(); window.RTS_POST_ON = true; shot(t0 + 1); o.glErr = gl.getError();
    G.t = t0;
    R3.cloudAmt = undefined; R3.swayAmt = undefined; R3.surfAmt = undefined;
    return o;
  });

  S.ok('the 3D mode is available to check', out.on, out.on ? 'on' : 'no WebGL');
  if (!out.on) { await g.close(); await browser.close(); return require('../lib/report.js')(S); }
  S.ok('the tank learned how far it rolls for a turn of its running gear', out.len > 0.1 && out.len < 6, out.len && out.len.toFixed(2) + ' world units');
  S.ok('rolled a quarter turn, its running gear shows it', out.quarter.in > 25, out.quarter.in + ' pixels over the tank');
  S.ok('...and nothing else in the frame changes', out.quarter.out === 0, out.quarter.out + ' elsewhere');
  S.ok('...and a full turn on it is the unrolled picture again', out.full.in === 0 && out.full.out === 0, out.full.in + ' over the tank, ' + out.full.out + ' elsewhere');
  S.ok('a parked tank\'s tracks stand still', out.parked.in === 0, out.parked.in + ' pixels change over two seconds');
  S.ok('the helicopter\'s rotor turns', out.spin.in > 40, out.spin.in + ' pixels change in 0.06 s');
  S.ok('...where with R3.rotorOff nothing moves', out.spinOff.in === 0, out.spinOff.in + ' pixels');
  S.ok('...blades and body drawn apart are the single model it always was', out.quarterBlade.in <= 4 && out.eighthBlade.in > 40,
       out.quarterBlade.in + ' pixels apart with the blades a quarter round, ' + out.eighthBlade.in + ' an eighth');
  S.ok('there is open sea to float a ship on', out.sea);
  if (out.sea) {
    var mOn = Math.min.apply(null, out.seenOn), xOn = Math.max.apply(null, out.seenOn), mOff = Math.min.apply(null, out.seenOff), xOff = Math.max.apply(null, out.seenOff);
    S.ok('a ship on the swell is lifted and leaned with it', out.ride.in > 40 && Math.max.apply(null, out.lean) > 2,
         out.ride.in + ' pixels moved; leaning ' + out.lean.join(', ') + ' degrees');
    /* how much of the ship shows dips as the crests run over it - far less when it rides them */
    S.ok('...and the crests do not swallow its hull', mOn > mOff * 1.2 && (xOn - mOn) / xOn < (xOff - mOff) / xOff * 0.75,
         'seen ' + out.seenOn.join(', ') + ' pixels riding; ' + out.seenOff.join(', ') + ' at a fixed level');
  }
  S.ok('a prone squad lies as the 3D soldier, not the sprite\'s model', out.ownLie.in > 60 && out.ownCrawl.in > 60,
       out.ownLie.in + ' pixels over the one lying still, ' + out.ownCrawl.in + ' over the one crawling');
  S.ok('...crawls when it moves', out.crawlPoses[0] !== out.crawlPoses[1] && out.crawlMoves.in > 25,
       'pose ' + out.crawlPoses.join(' then ') + ', ' + out.crawlMoves.in + ' pixels');
  S.ok('...and lies still when it does not', out.lieStill.in === 0, out.lieStill.in + ' pixels');
  S.eq('no draw is refused', out.glErr, 0);
  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
