/* WHAT THE NEW UNITS PUT ON THE SCREEN, read off the picture (render3d/fxemit3d.js, air3d.js,
   scene3d.js) - each the same moment drawn twice, with the thing and without it, as e2e/skycrane
   reads the crane's slung load:

     BOMBS        a Heavy Bomber's carpet, the bombs in the air: the picture round them differs
                  with them drawn and not (R3.bombsOff)
     CANOPIES     a Paradrop Plane's men coming down: the picture round a man under his canopy
                  differs with the canopy and without (R3.canopyOff)
     THE FLATS    a River Monitor on a flat the tide has dried, at low water: the picture round it
                  differs with the Monitor drawn and not (R3.hideId) - it sits on the sand, not
                  under it
   Each on the real simulation: the bomber sent at a spot, the plane at a drop zone, the tide run
   out; and each staging is asserted first, so a check cannot pass over nothing. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('unitfx');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 1000, height: 700 });
  await g.start(7, 1, { freeze: true });
  var p = g.page;

  var o = await p.evaluate(function () {
    var G = window._rtsG, R = _rtsR, R3 = window._R3D, gl = R3.gl, yd = _rtsHas('player', 'yard'), out = {};
    for (var i = 0; i < RTS_N * RTS_N; i++) { G.mapped[i] = 1; G.vis[i] = 1; }
    R3.rotorOff = true;
    function look(x, z) { R.focus.x = x; R.focus.z = z; R.zi = RTS_ZOOMS.length - 2; _rtsApplyCam(); }
    /* the n-pixel square round a point of the world, as drawn (the frame drawn first: a unit's
       drawn height is recorded in R3.motion as it is painted) */
    function grab(x, y, z, n) {
      var s = _rtsWorldToScreen(x, y, z), k = R3.cv.width / R.W, H = R3.cv.height, px = new Uint8Array(4 * n * n), h = (n - 1) / 2;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.readPixels(Math.round(s.x * k) - h, H - Math.round(s.y * k) - h, n, n, gl.RGBA, gl.UNSIGNED_BYTE, px);
      return px;
    }
    function frame() { _rtsRFrame(0); _rtsRFrame(0); }
    function patch(x, y, z) { frame(); return grab(x, y, z, 61); }
    function differ(a, b, cut) { var d = 0; for (var q = 0; q < a.length; q += 4) if (Math.abs(a[q] - b[q]) + Math.abs(a[q + 1] - b[q + 1]) + Math.abs(a[q + 2] - b[q + 2]) > (cut || 30)) d++; return d; }
    function step(n, until) { for (var t = 0; t < n; t++) { if (until && until()) return true; _rtsTick(1 / 60); } return until ? until() : false; }
    var c = _rtsNearestOpen(yd.tx + 14, yd.tz + 6, 10, null), x = _rtsWX(c[0]), z = _rtsWX(c[1]);

    /* ---- the carpet: a bomber sent at an enemy building, stepped until two bombs are falling (a
       bomb falls 0.7 s and the next leaves about half a second later: two at once is the most) -
       each bomb a faint dark streak, so a small square round each, at a gentler cut ---- */
    var aim = _rtsPlaceStruct('enemy', 'power', c[0], c[1], true); if (aim) aim.building = 0;
    var bm = _rtsSpawnUnit('player', 'bomber', x - 20 * RTS_TILE, z);
    if (aim) _rtsOrderAttack(bm, aim);
    step(60 * 40, function () { return (G.bombs || []).length >= 2; });
    var B = (G.bombs || []).slice();
    out.bombs = B.length;
    if (B.length) {
      look(B[0].x, B[0].z);
      var at = function (b) { return [b.x, _rtsElev(b.x, b.z) + b.y * RTS_AIR_ALT_K, b.z]; };
      frame(); var withB = B.map(function (b) { var q = at(b); return grab(q[0], q[1], q[2], 41); });
      R3.bombsOff = true; frame(); var noB = B.map(function (b) { var q = at(b); return grab(q[0], q[1], q[2], 41); }); R3.bombsOff = false;
      out.bombDiff = withB.reduce(function (s, a, j) { return s + differ(a, noB[j], 12); }, 0);
    }
    G.bombs = []; bm.dead = true; if (aim) aim.dead = true;

    /* ---- the canopies: a Paradrop Plane with its men, sent at the drop zone ---- */
    var pl = _rtsSpawnUnit('player', 'paraplane', x - 18 * RTS_TILE, z + 4 * RTS_TILE);
    for (var m = 0; m < 4; m++) _rtsBoard(_rtsSpawnUnit('player', 'rifle', yd.x, yd.z), pl);
    _rtsOrderUnloadAt(pl, x, z + 4 * RTS_TILE);
    var man = null;
    step(60 * 40, function () { G.ents.forEach(function (e) { if (!man && !e.dead && e.chute > RTS_PARA.fall * 0.5) man = e; }); return !!man; });
    out.chute = man ? +man.chute.toFixed(2) : 0;
    if (man) {
      look(man.x, man.z);
      frame();                                   /* painted once, so his drawn height is known */
      var mo = R3.motion && R3.motion[man.id], my = mo && mo.y !== undefined ? mo.y + 1.3 : _rtsElev(man.x, man.z) + 3;
      out.manDrawn = !!(mo && mo.y !== undefined);
      var withC = patch(man.x, my, man.z);
      R3.canopyOff = true; var noC = patch(man.x, my, man.z); R3.canopyOff = false;
      out.canopyDiff = differ(withC, noC);
    }

    /* ---- the flats: low water, a Monitor on a flat it has dried ---- */
    G.t = RTS_TIDE.period / 2; _rtsTideTick(0);
    var flat = -1;
    for (i = 0; i < RTS_N * RTS_N && flat < 0; i++) if (G.tideD[i] >= 2 && G.tideDry[i]) flat = i;
    out.flat = flat >= 0;
    if (flat >= 0) {
      var fx = _rtsWX(flat % RTS_N), fz = _rtsWX((flat / RTS_N) | 0);
      var mon = _rtsSpawnUnit('player', 'monitor', fx, fz);
      mon.x = fx; mon.z = fz; mon.order = 'hold'; mon.path = null;
      step(2);
      look(fx, fz);
      var my2 = _rtsElev(fx, fz) + 1, withM = patch(fx, my2, fz);
      R3.hideId = mon.id; var noM = patch(fx, my2, fz); R3.hideId = null;
      out.monDiff = differ(withM, noM);
      out.monDry = !!G.tideDry[_rtsIdx(_rtsTX(mon.x), _rtsTX(mon.z))];
    }
    R3.rotorOff = false;
    return out;
  });

  S.ok('the staging: bombs falling, a man under his canopy, a Monitor on a dried flat', o.bombs >= 2 && o.chute > 0 && o.manDrawn && o.flat && o.monDry, JSON.stringify(o));
  /* LEGIBLY: the streak alone, thin as rain, came to about 130 pixels round two bombs - there, and
     not a thing a player could see falling; with its dark body (fxemit3d.js) a bomb is about 230 */
  S.ok('a Heavy Bomber\'s bombs are on the screen, legibly: the picture round them differs, drawn and not', o.bombDiff > 250, o.bombDiff + ' of ' + (o.bombs * 1681) + ' pixels round ' + o.bombs + ' bombs');
  S.ok('a paratrooper\'s canopy is on the screen: the picture round him differs, with the canopy and without', o.canopyDiff > 30, o.canopyDiff + ' of 3721 pixels');
  S.ok('a River Monitor on a dried flat is on the screen, on the sand and not under it: the picture differs with it drawn and not', o.monDiff > 200, o.monDiff + ' of 3721 pixels');

  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');
  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
