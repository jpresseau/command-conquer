/* COLOURS FOR A COLOUR-BLIND EYE, WITH THE REAL PAGE (ui/cvd.js):

     THE BUTTON    the title's COLOUR-BLIND button turns the option on, says so and keeps it
     BOOT          a reload starts in the colour-blind palette, before anything is drawn
     THE BASE      the enemy's Command Yard, rendered in 3D, has an orange roof in a battle with
                   it on; back on the title, turned off, the next battle's yard is red - the
                   models rebuilt from the dropped cache
     THE RADAR     an enemy unit's dot is the palette's orange with it on, the standard red off.
                   (Its building icons are sampled from the 2D sheet each battle bakes as it
                   opens, and carry almost no team colour - a yard's is grey concrete.) */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('cvd');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 900, height: 760, dpr: 1 });
  var p = g.page;
  function row() { var b = document.querySelector('#rtsCvd button'); return { text: b && b.textContent, pressed: b && b.getAttribute('aria-pressed'), ls: localStorage.getItem('bw.cvd'), enemy: RTS_MINI_COL.enemy }; }
  var before = await p.evaluate(row);
  await p.evaluate(function () { document.querySelector('#rtsCvd button').click(); });
  var after = await p.evaluate(row);
  S.ok('THE BUTTON: the title reads COLOUR-BLIND: OFF, and a tap turns it ON, pressed and kept',
       /: OFF$/.test(before.text) && before.pressed === 'false' && !before.ls &&
       /: ON$/.test(after.text) && after.pressed === 'true' && after.ls === '1' && after.enemy !== before.enemy, JSON.stringify({ before: before, after: after }));
  await p.reload({ waitUntil: 'load' });
  await p.waitForFunction(function () { return typeof window.rtsOpen === 'function'; });
  var boot = await p.evaluate(function () { return { text: document.querySelector('#rtsCvd button').textContent, enemy: RTS_PAL.team.enemy[1], want: RTS_CVD.team.enemy[1], mini: RTS_MINI_COL.enemy }; });
  S.ok('BOOT: a reload starts in the colour-blind palette', /: ON$/.test(boot.text) && boot.enemy === boot.want && boot.mini === '#ff8a2a', JSON.stringify(boot));

  async function battle() {
  await g.start(7, 1, { freeze: true });
  return p.evaluate(function () {
    var o = {}, R = _rtsR, G = window._rtsG, R3 = window._R3D, i;
    for (i = 0; i < RTS_N * RTS_N; i++) { G.mapped[i] = 1; G.vis[i] = 1; }
    G.visDirty = 1;
    o.on = !!(R3 && R3.on);
    if (!o.on) return o;
    window.RTS_POST_ON = false;
    R3.cloudAmt = 0; R3.swayAmt = 0; R3.surfAmt = 0;
    var y = _rtsHas('enemy', 'yard');
    o.yard = !!y;
    if (!y) return o;
    R.focus.x = y.x; R.focus.z = y.z; R.zi = RTS_ZOOMS.length - 2; _rtsApplyCam();
    var gl = R3.gl, CW = R3.cv.width, CH = R3.cv.height;
    /* the strong colours round the yard on screen, sorted by hue: red under 15 degrees, orange 18-45 */
    function shot() {
      _rtsRFrame(0);
      var b = new Uint8Array(CW * CH * 4), s = _rtsWorldToScreen(y.x, _rtsElev(y.x, y.z), y.z), cx = s.x * R.dpr, cy = s.y * R.dpr, n = { red: 0, orange: 0 };
      gl.readPixels(0, 0, CW, CH, gl.RGBA, gl.UNSIGNED_BYTE, b);
      for (var py = Math.max(0, Math.round(cy - 90)); py < Math.min(CH, cy + 90); py++)
        for (var px = Math.max(0, Math.round(cx - 90)); px < Math.min(CW, cx + 90); px++) {
          var q = ((CH - 1 - py) * CW + px) * 4, r = b[q], gg = b[q + 1], bb = b[q + 2], mx = Math.max(r, gg, bb), mn = Math.min(r, gg, bb);
          if (mx < 70 || (mx - mn) / mx < 0.45 || mx !== r) continue;
          var h = 60 * (gg - bb) / (mx - mn);
          if (h >= 0 && h < 15 || h > 345) n.red++; else if (h >= 18 && h <= 45) n.orange++;
        }
      return n;
    }
    /* the radar lit - a Radar Post and the power for it beside the yard - and an enemy tank in
       sight: its dot's pixels of one exact colour, and the enemy yard's icon sorted by hue */
    var home = _rtsHas('player', 'yard'), put = {};
    ['radar', 'power', 'power'].forEach(function (k, n) {
      for (var rr = 3; rr < 18 && !put[n]; rr++) for (var ox = -rr; ox <= rr && !put[n]; ox++) for (var oz = -rr; oz <= rr && !put[n]; oz++) {
        if (Math.max(Math.abs(ox), Math.abs(oz)) !== rr) continue;
        if (_rtsCanPlace('player', k, home.tx + ox, home.tz + oz, true)) put[n] = _rtsPlaceStruct('player', k, home.tx + ox, home.tz + oz, true);
      }
    });
    G.ents.forEach(function (e) { if (e.type === 'struct') { e.building = 0; e.bprog = 1; } });
    _rtsRecalcPower('player');
    var tk = _rtsSpawnUnit('enemy', 'tank', home.x + 8 * RTS_TILE, home.z);
    o.lit = _rtsRadarLit() && !!tk;
    /* the tank's dot: pixels of the palette's enemy orange, and of the standard red */
    function mini() {
      _rtsDrawMini();
      var c = document.getElementById('rtsMini'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data, sc = c.width / RTS_N, n = { orange: 0, red: 0 };
      var mx = (tk.x / RTS_TILE + RTS_N / 2) * sc, mz = (tk.z / RTS_TILE + RTS_N / 2) * sc;
      function is(k, hex) { return Math.abs(d[k] - parseInt(hex.substr(1, 2), 16)) + Math.abs(d[k + 1] - parseInt(hex.substr(3, 2), 16)) + Math.abs(d[k + 2] - parseInt(hex.substr(5, 2), 16)) < 12; }
      for (var py = Math.max(0, Math.floor(mz - 3)); py < Math.min(c.height, mz + 3); py++) for (var px = Math.max(0, Math.floor(mx - 3)); px < Math.min(c.width, mx + 3); px++) {
        var k = (py * c.width + px) * 4;
        if (is(k, '#ff8a2a')) n.orange++;
        if (is(k, '#ff6a52')) n.red++;
      }
      return n;
    }
    o.shot = shot(); o.mini = mini();
    return o;
  });
  }
  var on = await battle();
  /* out to the title, and the option turned off there, as a player does it */
  var flip = await p.evaluate(function () { rtsClose(); document.querySelector('#rtsCvd button').click();
    return { cache: Object.keys(window._R3D.mesh).length, ls: localStorage.getItem('bw.cvd'), text: document.querySelector('#rtsCvd button').textContent }; });
  var off = await battle();
  var out = { on: on.on && off.on, yard: on.yard && off.yard, lit: on.lit && off.lit };
  S.ok('THE BASE: the population - in both battles a 3D view, the enemy\'s Command Yard on it and a lit radar', out.on && out.yard && out.lit, JSON.stringify(out));
  S.ok('...with the option on, the yard is orange more than red; back on the title it is turned off, the cache dropped, and the next battle\'s yard is red more than orange',
       on.shot.orange > 2 * on.shot.red && flip.cache === 0 && flip.ls === null && /: OFF$/.test(flip.text) && off.shot.red > 2 * off.shot.orange && off.shot.red > 200,
       JSON.stringify({ on: on.shot, off: off.shot, flip: flip }));
  S.ok('THE RADAR: lit, with an enemy tank in sight - its dot the palette\'s orange with the option on, and the standard red with it off',
       out.lit && on.mini.orange > 0 && on.mini.red === 0 && off.mini.red > 0 && off.mini.orange === 0, JSON.stringify({ on: on.mini, off: off.mini }));
  S.ok('...and no page errors', g.errors.length === 0, g.errors.join(' | '));
  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
