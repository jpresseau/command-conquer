/* LIT WINDOWS AT NIGHT - render3d/meshfs3d.js, by the hour's night (sky3d.js uNightK).

   At night a base was a field of dark boxes with lamps over the doors: the glass of every
   building read as dull blue-grey, with nobody home. Now a building's glass shows a warm room
   behind it, as far as the hour has gone into the night. Read straight off the GL canvas, a
   Research Lab (the building with the most glass) up close, with R3.winAmt = 0 as the
   before-picture:

     NIGHT          the windows change, warm and much brighter - and only the windows: the
                    changed pixels are a small share of the building's own
     DUSK           half the night, less light than at night, and some
     DAY            nothing changes
     RISING         a building going up has nobody in it yet: no light
     BLOWN OUT      a building burnt past the point its glass goes (hurt3d.js) shows none; one
                    only scorched still does
     NOT A VEHICLE  a Repair Truck's windscreen is glass too, and stays dark */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('winlight');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 700, height: 600, dpr: 1 });
  await g.start(7, 1, { freeze: true });

  var out = await g.page.evaluate(function () {
    var o = {}, R = _rtsR, G = window._rtsG, R3 = window._R3D, i;
    o.on = !!(R3 && R3.on);
    if (!o.on) return o;
    for (i = 0; i < RTS_N * RTS_N; i++) { G.mapped[i] = 1; G.vis[i] = 1; } G.visDirty = 1;
    var gl = R3.gl, CW = R3.cv.width, CH = R3.cv.height;
    function shot() {
      _rtsRFrame(1 / 60); _rtsRFrame(1 / 60);
      var b = new Uint8Array(CW * CH * 4);
      gl.readPixels(0, 0, CW, CH, gl.RGBA, gl.UNSIGNED_BYTE, b);
      return b;
    }
    function lum(b, q) { return 0.3 * b[q] + 0.59 * b[q + 1] + 0.11 * b[q + 2]; }
    /* the windows' light, A against the before-picture: how many pixels it changes, by how much,
       and how warm they come out */
    function pair(sky) {
      window.RTS_SKY_FORCE = sky;
      R3.winAmt = undefined; var A = shot();
      R3.winAmt = 0; var B = shot();
      R3.winAmt = undefined;
      var n = 0, gain = 0, warm = 0;
      for (var q = 0; q < A.length; q += 4) {
        if (Math.abs(A[q] - B[q]) + Math.abs(A[q + 1] - B[q + 1]) + Math.abs(A[q + 2] - B[q + 2]) > 12) {
          n++; gain += lum(A, q) - lum(B, q); warm += A[q] - A[q + 2];
        }
      }
      return { n: n, gain: n ? gain / n : 0, warm: n ? warm / n : 0 };
    }
    function diff(A, B) {
      var n = 0;
      for (var q = 0; q < A.length; q += 4)
        if (Math.abs(A[q] - B[q]) + Math.abs(A[q + 1] - B[q + 1]) + Math.abs(A[q + 2] - B[q + 2]) > 12) n++;
      return n;
    }
    function place(key) {
      var yd = _rtsHas('player', 'yard'), ax = _rtsTX(yd.x), az = _rtsTX(yd.z), r, a;
      for (r = 3; r < 40; r++) for (a = 0; a < 32; a++) {
        var tx = Math.round(ax + Math.cos(a / 32 * 6.283) * r), tz = Math.round(az + Math.sin(a / 32 * 6.283) * r);
        if (_rtsCanPlace('player', key, tx, tz, true)) return _rtsPlaceStruct('player', key, tx, tz, true);
      }
      return null;
    }
    var lab = place('lab');
    if (!lab) return o;
    R.focus.x = lab.x; R.focus.z = lab.z + 2; R.zi = RTS_ZOOMS.length - 1; _rtsApplyCam();
    _r3dCamSet(0.3);
    /* what the Lab covers on screen, at night */
    window.RTS_SKY_FORCE = 'night';
    var withLab = shot(); lab.dead = true; var noLab = shot(); lab.dead = false;
    o.labPx = diff(withLab, noLab);

    o.night = pair('night');
    o.dusk = pair('dusk');
    o.day = pair('day');
    /* RISING */
    lab.building = 1; lab.bprog = 0.6;
    o.rising = pair('night');
    lab.building = 0; lab.bprog = 1;
    /* BLOWN OUT, and only scorched */
    lab.hp = lab.maxHp * 0.2; o.blown = pair('night');
    lab.hp = lab.maxHp * 0.6; o.scorched = pair('night');
    lab.hp = lab.maxHp;
    /* NOT A VEHICLE: a Repair Truck on open ground, away from the Lab (a dead building stands on
       as its husk, and a truck parked in it is out of sight). The frame without it is taken
       before it exists: a unit set dead dissolves, and a moved one glides (unit3d.js) */
    var spot = _rtsHas('player', 'yard');
    R.focus.x = spot.x + 6 * RTS_TILE; R.focus.z = spot.z + 6 * RTS_TILE; _rtsApplyCam();
    window.RTS_SKY_FORCE = 'night';
    var noTr = shot();
    var tr = _rtsSpawnUnit('player', 'repairtruck', R.focus.x, R.focus.z);
    tr.path = null; tr.order = 'hold'; tr.rot = tr.trot = 0.9;
    var withTr = shot();
    o.truckPx = diff(withTr, noTr);
    o.truck = pair('night');
    o.err = gl.getError();
    window.RTS_SKY_FORCE = undefined;
    return o;
  });

  S.ok('the 3D view is on', out.on, '');
  if (out.on && out.night) {
    S.ok('(the staging: the Lab up close, a building of some size on screen)', out.labPx > 20000, out.labPx + ' pixels');
    S.ok('NIGHT: the windows light - warm, and much brighter than the glass was', out.night.n > 1500 && out.night.gain > 50 && out.night.warm > 50,
         out.night.n + ' pixels, +' + out.night.gain.toFixed(1) + ' brighter, red over blue ' + out.night.warm.toFixed(1));
    S.ok('...and only the windows: a small share of the building\'s pixels', out.night.n < out.labPx * 0.35,
         out.night.n + ' of ' + out.labPx + ' (' + (out.night.n / out.labPx * 100).toFixed(1) + '%)');
    S.ok('DUSK: half the night, less light than night and some', out.dusk.n > 300 && out.dusk.gain < out.night.gain * 0.75,
         out.dusk.n + ' pixels, +' + out.dusk.gain.toFixed(1) + ' against +' + out.night.gain.toFixed(1) + ' at night');
    S.ok('DAY: nothing changes', out.day.n === 0, out.day.n + ' pixels');
    S.ok('RISING: a building going up shows no light', out.rising.n === 0, out.rising.n + ' pixels');
    S.ok('BLOWN OUT: burnt past the point its glass goes, none', out.blown.n === 0, out.blown.n + ' pixels');
    S.ok('...where one only scorched still shows its rooms', out.scorched.n > 1000, out.scorched.n + ' pixels');
    S.ok('(the staging: a Repair Truck, windscreen and all, in view)', out.truckPx > 1500, out.truckPx + ' pixels');
    S.ok('NOT A VEHICLE: its glass stays dark', out.truck.n === 0, out.truck.n + ' pixels');
    S.ok('no GL error', out.err === 0, 'error ' + out.err);
  }
  S.ok('the page logged no errors', !g.errors.length, g.errors.slice(0, 2).join(' | ') || 'clean');
  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
