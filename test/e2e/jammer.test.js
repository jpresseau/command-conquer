/* THE JAMMER, ON THE RADAR (core/jammer.js, ui/hud.js):

     STATIC     the radar over a parked enemy Jammer's field is noise - many grey levels where the
                same ground drew a few flat colours - and with the field down it is the ground
                again; the player's own Jammer puts no static on the player's radar */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('jammer');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 1000, height: 700 });
  await g.start(7, 1, { freeze: true });
  var p = g.page;

  var o = await p.evaluate(function () {
    var G = window._rtsG, yd = _rtsHas('player', 'yard');
    for (var i = 0; i < RTS_N * RTS_N; i++) { G.mapped[i] = 1; G.vis[i] = 1; }
    /* a lit radar to read: a Radar Post and the power for it */
    ['radar', 'apower'].forEach(function (k, n) {
      for (var r = 4; r < 30; r++) { var sp = _rtsNearestOpen(yd.tx + r, yd.tz + n * 4, 4, null); if (sp && _rtsCanPlace('player', k, sp[0], sp[1], true)) { var e = _rtsPlaceStruct('player', k, sp[0], sp[1], true); e.building = 0; break; } }
    });
    _rtsRecalcPower('player');
    var c = _rtsNearestOpen(RTS_N >> 1, RTS_N >> 1, 20, null);
    /* `dark`: the field's ground unexplored - the shroud the radar shows nothing through */
    function levels(side, dark) {
      G.jam = { player: [], enemy: [] };
      if (side) G.jam[side].push({ x: _rtsWX(c[0]), z: _rtsWX(c[1]), r: RTS_JAM.r * RTS_TILE });
      var dz, dx;
      if (dark) for (dz = -6; dz <= 6; dz++) for (dx = -6; dx <= 6; dx++) G.mapped[_rtsIdx(c[0] + dx, c[1] + dz)] = 0;
      _rtsDrawMini();
      if (dark) for (dz = -6; dz <= 6; dz++) for (dx = -6; dx <= 6; dx++) G.mapped[_rtsIdx(c[0] + dx, c[1] + dz)] = 1;
      var mini = document.getElementById('rtsMini'), mg = mini.getContext('2d'), k = mini.width / RTS_N;
      var px = mg.getImageData(Math.floor((c[0] - 2) * k), Math.floor((c[1] - 2) * k), Math.max(4, Math.floor(4 * k)), Math.max(4, Math.floor(4 * k))).data, seen = {}, hi = 0;
      for (var q = 0; q < px.length; q += 4) { seen[px[q] + ',' + px[q + 1] + ',' + px[q + 2]] = 1; hi = Math.max(hi, px[q], px[q + 1], px[q + 2]); }
      return dark ? hi : Object.keys(seen).length;
    }
    return { none: levels(null), theirs: levels('enemy'), mine: levels('player'), dark: levels(null, true), darkTheirs: levels('enemy', true) };
  });
  S.ok('the radar over a parked enemy Jammer\'s field is noise, where the same ground drew a few colours', o.theirs >= o.none * 2 && o.theirs > 15,
       o.theirs + ' colours against ' + o.none);
  S.ok('...and the player\'s own Jammer puts none on the player\'s radar', o.mine === o.none, o.mine + ' colours against ' + o.none);
  /* BRIGHTNESS, NOT A COUNT OF COLOURS, under the shroud: the radar fills each cell at a fractional
     pixel offset, and the seams between two black cells let the green beneath show at a quarter
     strength - about ten near-black colours that are all shroud. Static is grey at 120 and up,
     explored ground reaches 70; a shroud with neither stays at the seams' 30 or so. */
  S.ok('...nor an enemy field over ground the player has not explored: the shroud stays black, and marks no army', o.dark <= 40 && o.darkTheirs <= 40,
       'brightest ' + o.darkTheirs + ' with the field, ' + o.dark + ' without, under the shroud');

  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');
  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
