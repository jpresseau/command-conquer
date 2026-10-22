/* THE LENS BEAM ON THE SCREEN (core/lens.js, sprites/lens.js, render3d/fxemit3d.js _r3dFxBeam),
   read off the picture the way e2e/unitfx reads the new units - each the same moment drawn
   twice, with the thing and without it:

     THE MODELS   a Lens Tower and a Lens Tank are drawn: the picture round each differs with it
                  drawn and hidden (R3.hideId)
     THE RELAY    three towers in reach of each other, the first fires: two relay beams are
                  pushed, and the picture half-way along each differs with the beams and without
     THE SHOT     the tower's own beam, half-way to its target, the same
     THE FORK     a Lens Tank fires into a group: a beam per fork, each drawn
     NO FLASH     a lens has no muzzle flash - a gun's orange fireball on a beam weapon was the
                  first thing the picture showed wrong - so neither is in the muzzle list after
                  firing, while a tank that fires a shell is
   On the real game, staged on open ground by the player's base, the loop frozen; the staging is
   asserted first, so a check cannot pass over nothing. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('lens');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 1000, height: 700 });
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
    function at(dx, dz) { var q = _rtsNearestOpen(yd.tx + dx, yd.tz + dz, 8, null); return q; }
    /* the middle of a beam, in the world: where to look for it */
    function mid(f) { var x = (f.x + f.x2) / 2, z = (f.z + f.z2) / 2; return [x, _rtsElev(x, z) + (f.y + f.y2) / 2, z]; }
    /* each beam's middle, looked at and drawn with the beams in G.fx and without them */
    function beamDiff(beams) {
      var keep = G.fx.slice();
      var d = beams.map(function (f) {
        var q = mid(f);
        look(q[0], q[2]);
        var cx = q[0] + RTS_TILE * 9, cz = q[2] + RTS_TILE * 5, cy = _rtsElev(cx, cz);
        G.fx = keep; frame(); var a = grab(q[0], q[1], q[2], 21), ca = grab(cx, cy, cz, 21);
        G.fx = keep.filter(function (x) { return x.kind !== 'beam'; }); frame(); var b = grab(q[0], q[1], q[2], 21), cb = grab(cx, cy, cz, 21);
        out.ctl = (out.ctl || []).concat([differ(ca, cb, 20)]);   /* the control: well away from the beam */
        return differ(a, b, 20);
      });
      G.fx = keep;
      return d;
    }
    function power() { G.sides.player.powerMade = 1e6; G.sides.player.powerUsed = 100; }

    /* ---- three towers by the base, a target in reach of the first ---- */
    var T = [[10, 0], [13, 2], [16, 0]].map(function (o) {
      var q = at(o[0], o[1]), t = _rtsPlaceStruct('player', 'prism', q[0], q[1], true); t.building = 0; t.cool = 0; return t;
    });
    var fq = at(10, -4), foe = _rtsSpawnUnit('enemy', 'tank', _rtsWX(fq[0]), _rtsWX(fq[1]));
    look(T[1].x, T[1].z);
    frame();
    var withT = grab(T[1].x, _rtsElev(T[1].x, T[1].z) + 3, T[1].z, 31);
    R3.hideId = T[1].id; frame(); var noT = grab(T[1].x, _rtsElev(T[1].x, T[1].z) + 3, T[1].z, 31); R3.hideId = null;
    out.towerDrawn = differ(withT, noT);
    out.reach = [Math.hypot(T[0].x - T[1].x, T[0].z - T[1].z), Math.hypot(T[1].x - T[2].x, T[1].z - T[2].z), Math.hypot(T[0].x - foe.x, T[0].z - foe.z)]
      .map(function (d) { return +(d / RTS_TILE).toFixed(1); });

    power(); _rtsSpBuild();
    var fx0 = G.fx.length;
    _rtsFire(T[0], foe, RTS_WEAPONS.lensbeam);
    var beams = G.fx.slice(fx0).filter(function (f) { return f.kind === 'beam'; });
    out.beams = beams.length;
    out.relayDiff = beamDiff(beams.filter(function (f) { return f.lens === 1; }));
    out.shotDiff = beamDiff(beams.filter(function (f) { return f.lens !== 1; }));
    out.towerFlash = _r3dMuzzles(G).filter(function (m) { return T.indexOf(m[5]) >= 0; }).length;
    G.fx = []; T.forEach(function (t) { t.fire = 0; });

    /* ---- a Lens Tank firing into a group ---- */
    var kq = at(4, 10), tank = _rtsSpawnUnit('player', 'prismtank', _rtsWX(kq[0]), _rtsWX(kq[1]));
    var gq = at(4, 14), hit = _rtsSpawnUnit('enemy', 'light', _rtsWX(gq[0]), _rtsWX(gq[1]));
    var near = [_rtsSpawnUnit('enemy', 'rifle', hit.x + RTS_TILE * 1.5, hit.z), _rtsSpawnUnit('enemy', 'rifle', hit.x - RTS_TILE * 1.5, hit.z + RTS_TILE)];
    look(tank.x, tank.z);
    frame();
    var withK = grab(tank.x, _rtsStandY(tank.x, tank.z) + 1, tank.z, 25);
    R3.hideId = tank.id; frame(); var noK = grab(tank.x, _rtsStandY(tank.x, tank.z) + 1, tank.z, 25); R3.hideId = null;
    out.tankDrawn = differ(withK, noK);
    _rtsSpBuild(); fx0 = G.fx.length;
    _rtsFire(tank, hit, RTS_WEAPONS.lenssplit);
    var kb = G.fx.slice(fx0).filter(function (f) { return f.kind === 'beam'; });
    out.forks = kb.length - 1;
    out.forkDiff = beamDiff(kb);
    out.tankFlash = _r3dMuzzles(G).filter(function (m) { return m[5] === tank; }).length;
    /* the control: a shell-firing tank does flash */
    var gun = _rtsSpawnUnit('player', 'light', tank.x + RTS_TILE * 2, tank.z);
    _rtsFire(gun, hit, RTS_WEAPONS[rtsUnitDef('light').weapon]);
    out.gunFlash = _r3dMuzzles(G).filter(function (m) { return m[5] === gun; }).length;
    return out;
  });

  S.ok('the staging: three towers in relay reach of each other, the target in the first\'s range',
       o.reach[0] <= 8 && o.reach[1] <= 8 && o.reach[2] * 4 <= 19 && o.reach[2] >= 2, 'cells apart: ' + o.reach.join(', '));
  S.ok('a Lens Tower is drawn', o.towerDrawn > 40, o.towerDrawn + ' px differ with it hidden');
  S.ok('a Lens Tank is drawn', o.tankDrawn > 20, o.tankDrawn + ' px differ with it hidden');
  S.eq('the tower\'s shot and its two relays push three beams', o.beams, 3);
  S.ok('THE RELAY BEAMS ARE ON THE SCREEN, half-way between the towers', o.relayDiff.length === 2 && o.relayDiff.every(function (d) { return d > 8; }),
       'px per beam: ' + o.relayDiff.join(', '));
  S.ok('the tower\'s own beam is on the screen', o.shotDiff.length === 1 && o.shotDiff[0] > 8, 'px: ' + o.shotDiff.join(', '));
  S.ok('...and nowhere else: a square nine cells off each beam is the same with the beams and without (control)',
       o.ctl.length === 6 && o.ctl.every(function (d) { return d === 0; }), 'px: ' + o.ctl.join(', '));
  S.eq('the Lens Tank\'s beam forks onto the two beside its target', o.forks, 2);
  S.ok('the tank\'s beam and its forks are on the screen', o.forkDiff.length === 3 && o.forkDiff.every(function (d) { return d > 6; }),
       'px per beam: ' + o.forkDiff.join(', '));
  S.ok('NO MUZZLE FLASH on a lens: neither the towers nor the tank', o.towerFlash === 0 && o.tankFlash === 0,
       'towers ' + o.towerFlash + ', tank ' + o.tankFlash);
  S.eq('...while a shell-firing tank flashes (control)', o.gunFlash, 1);
  var errs = g.errors.filter(function (e) { return !/ServiceWorker/.test(e); });
  S.ok('no page errors', !errs.length, errs.join(' | ') || 'none');
  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})();
