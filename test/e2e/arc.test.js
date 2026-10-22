/* THE ARC ON THE SCREEN (core/arc.js, sprites/arc.js, render3d/fxemit3d.js _r3dFxArc), read off
   the picture as e2e/lens reads the beam - each the same moment drawn twice, with the thing and
   without it, and a square well away from each arc as the control, which must not change:

     THE MODELS   an Arc Trooper and an Arc Tank are drawn: the picture round each differs with it
                  drawn and hidden (R3.hideId)
     THE CHARGE   an Arc Tower with two troopers beside it, browned out, fires: it is charged, so
                  it does fire, and the arcs from the troopers to the coil and the coil's own bolt
                  are on the screen half-way along each
     THE BOLT     an Arc Tank fires into a group: the bolt and its two jumps are on the screen
     NO FLASH     an arc has no muzzle flash, neither the tower's nor the tank's
   On the real game as the Dominion, staged by the player's base with the loop frozen; the staging
   is asserted first, so a check cannot pass over nothing. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('arc');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 1000, height: 700 });
  await g.page.evaluate(function () { rtsSetArmySide('soviet'); });
  await g.start(7, 1, { freeze: true });
  var p = g.page;

  var o = await p.evaluate(function () {
    var G = window._rtsG, R = _rtsR, R3 = window._R3D, gl = R3.gl, yd = _rtsHas('player', 'yard'), out = {};
    for (var i = 0; i < RTS_N * RTS_N; i++) { G.mapped[i] = 1; G.vis[i] = 1; }
    function look(x, z) { R.focus.x = x; R.focus.z = z; R.zi = RTS_ZOOMS.length - 2; _rtsApplyCam(); }
    function grab(x, y, z, n) {
      var s = _rtsWorldToScreen(x, y, z), k = R3.cv.width / R.W, H = R3.cv.height, px = new Uint8Array(4 * n * n), h = (n - 1) / 2;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.readPixels(Math.round(s.x * k) - h, H - Math.round(s.y * k) - h, n, n, gl.RGBA, gl.UNSIGNED_BYTE, px);
      return px;
    }
    function frame() { _rtsRFrame(0); _rtsRFrame(0); }
    function differ(a, b, cut) { var d = 0; for (var q = 0; q < a.length; q += 4) if (Math.abs(a[q] - b[q]) + Math.abs(a[q + 1] - b[q + 1]) + Math.abs(a[q + 2] - b[q + 2]) > (cut || 30)) d++; return d; }
    function at(dx, dz) { return _rtsNearestOpen(yd.tx + dx, yd.tz + dz, 8, null); }
    /* an arc's jag is thrown either side of the straight line, so the square round its middle is
       wide enough to hold it wherever it falls */
    function mid(f) { var x = (f.x + f.x2) / 2, z = (f.z + f.z2) / 2; return [x, _rtsElev(x, z) + (f.y + f.y2) / 2, z]; }
    function beamDiff(beams) {
      var keep = G.fx.slice();
      var d = beams.map(function (f) {
        var q = mid(f);
        look(q[0], q[2]);
        var cx = q[0] + RTS_TILE * 9, cz = q[2] + RTS_TILE * 5, cy = _rtsElev(cx, cz);
        G.fx = keep; frame(); var a = grab(q[0], q[1], q[2], 41), ca = grab(cx, cy, cz, 41);
        G.fx = keep.filter(function (x) { return x.kind !== 'beam'; }); frame(); var b = grab(q[0], q[1], q[2], 41), cb = grab(cx, cy, cz, 41);
        out.ctl = (out.ctl || []).concat([differ(ca, cb, 20)]);
        return differ(a, b, 20);
      });
      G.fx = keep;
      return d;
    }
    function drawn(e, y) {
      look(e.x, e.z); frame();
      var a = grab(e.x, y, e.z, 25);
      R3.hideId = e.id; frame(); var b = grab(e.x, y, e.z, 25); R3.hideId = null;
      return differ(a, b);
    }

    /* ---- an Arc Tower, browned out, two troopers beside it ---- */
    var q = at(10, 2), T = _rtsPlaceStruct('player', 'tesla', q[0], q[1], true); T.building = 0; T.cool = 0;
    var tr = [_rtsSpawnUnit('player', 'arctroop', T.x - RTS_TILE * 1.5, T.z + RTS_TILE), _rtsSpawnUnit('player', 'arctroop', T.x + RTS_TILE, T.z + RTS_TILE * 2)];
    var foe = _rtsSpawnUnit('enemy', 'heavy', T.x + RTS_TILE * 3, T.z - RTS_TILE);
    out.trooperDrawn = drawn(tr[0], _rtsStandY(tr[0].x, tr[0].z) + 1);
    out.reach = +(Math.hypot(T.x - foe.x, T.z - foe.z) / RTS_TILE).toFixed(1);
    G.sides.player.powerMade = 0; G.sides.player.powerUsed = 100;
    out.dark = _rtsPowerFactor('player') < 0.999;
    _rtsSpBuild();
    var hp0 = foe.hp, fx0 = G.fx.length;
    _rtsFire(T, foe, RTS_WEAPONS.teslazap);
    out.fired = hp0 - foe.hp;
    var arcs = G.fx.slice(fx0).filter(function (f) { return f.kind === 'beam' && f.arc; });
    out.arcs = arcs.length;
    out.arcDiff = beamDiff(arcs);
    out.towerFlash = _r3dMuzzles(G).filter(function (m) { return m[5] === T; }).length;
    G.fx = []; T.fire = 0;

    /* ---- an Arc Tank firing into a group ---- */
    var kq = at(4, 10), tank = _rtsSpawnUnit('player', 'arctank', _rtsWX(kq[0]), _rtsWX(kq[1]));
    var hit = _rtsSpawnUnit('enemy', 'light', tank.x + RTS_TILE * 3, tank.z);
    _rtsSpawnUnit('enemy', 'rifle', hit.x + RTS_TILE * 1.2, hit.z + RTS_TILE);
    _rtsSpawnUnit('enemy', 'rifle', hit.x + RTS_TILE * 0.5, hit.z - RTS_TILE * 1.6);
    out.tankDrawn = drawn(tank, _rtsStandY(tank.x, tank.z) + 1);
    _rtsSpBuild(); fx0 = G.fx.length;
    _rtsFire(tank, hit, RTS_WEAPONS.arcbolt);
    var kb = G.fx.slice(fx0).filter(function (f) { return f.kind === 'beam' && f.arc; });
    out.legs = kb.length;
    out.boltDiff = beamDiff(kb);
    out.tankFlash = _r3dMuzzles(G).filter(function (m) { return m[5] === tank; }).length;
    return out;
  });

  S.ok('the staging: the tower browned out, its target in range', o.dark && o.reach * 4 <= 17, 'dark ' + o.dark + ', ' + o.reach + ' cells');
  S.ok('an Arc Trooper is drawn', o.trooperDrawn > 15, o.trooperDrawn + ' px differ with it hidden');
  S.ok('an Arc Tank is drawn', o.tankDrawn > 20, o.tankDrawn + ' px differ with it hidden');
  S.ok('CHARGED, the browned-out tower fires', o.fired > 0, o.fired.toFixed(1) + ' damage');
  S.eq('...with an arc from each trooper and its own bolt', o.arcs, 3);
  S.ok('THE ARCS ARE ON THE SCREEN, half-way along each', o.arcDiff.length === 3 && o.arcDiff.every(function (d) { return d > 6; }),
       'px per arc: ' + o.arcDiff.join(', '));
  S.ok('...and nowhere else: a square nine cells off each arc is the same with the arcs and without (control)',
       o.ctl.length === 6 && o.ctl.every(function (d) { return d === 0; }), 'px: ' + o.ctl.join(', '));
  S.eq('the Arc Tank\'s bolt and its two jumps', o.legs, 3);
  S.ok('...are on the screen', o.boltDiff.length === 3 && o.boltDiff.every(function (d) { return d > 6; }), 'px per leg: ' + o.boltDiff.join(', '));
  S.ok('NO MUZZLE FLASH on an arc: neither the tower nor the tank', o.towerFlash === 0 && o.tankFlash === 0,
       'tower ' + o.towerFlash + ', tank ' + o.tankFlash);
  var errs = g.errors.filter(function (e) { return !/ServiceWorker/.test(e); });
  S.ok('no page errors', !errs.length, errs.join(' | ') || 'none');
  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})();
