/* THE LAND PAST THE MAP'S EDGE - render3d/apron3d.js.

   The ground stopped at the map's edge and the frame past it was the clear colour, near black:
   a band across the top of every view, two-fifths of the screen zoomed all the way out. The
   apron is the map's own land reflected across its edge, fading into the horizon, with the
   clear colour set to that horizon. Read straight off the GL canvas, the post stack off, with
   the apron switched off (RTS_APRON_OFF) as the before-picture:

     THE LAND      a point just past the edge looks like its mirror just inside the map, not
                   like the flat horizon, and is grass where that is - and with the apron off, it
                   is the flat horizon
     NO GHOST      a building's paving against the edge is not reflected: the land is, not the base
     THE DISTANCE  up the view the land fades toward the horizon with no step the ground inside
                   does not make, and the fade is over before the apron ends - so the faded land
                   and the clear colour (the same horizon) meet without a line
     THE SHROUD    past an edge nobody has explored, the land is as dark as what it reflects
     LOW           the low tier does not draw it (quality3d.js `apron`): the horizon instead
     THE DRAWS     no GL error */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('apron');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 900, height: 700, dpr: 1 });
  await g.start(7, 1, { freeze: true });

  var out = await g.page.evaluate(function () {
    var o = {}, R = _rtsR, G = window._rtsG, R3 = window._R3D, i;
    o.on = !!(R3 && R3.on);
    if (!o.on) return o;
    function reveal(v) { for (i = 0; i < RTS_N * RTS_N; i++) { G.mapped[i] = v; G.vis[i] = v; } G.visDirty = 1; }
    reveal(1);
    window.RTS_POST_ON = false; window.RTS_SKY_FORCE = 'day';
    var EXT = RTS_N * RTS_TILE / 2, gl = R3.gl, CW = R3.cv.width, CH = R3.cv.height;
    /* the widest zoom, looking at the north edge, so the land past it fills the top of the view */
    R.zi = 0; R.focus.x = 0; R.focus.z = -EXT + 40; _rtsApplyCam();
    function shot() {
      _rtsRFrame(1 / 60); _rtsRFrame(1 / 60);
      var b = new Uint8Array(CW * CH * 4);
      gl.readPixels(0, 0, CW, CH, gl.RGBA, gl.UNSIGNED_BYTE, b);
      return b;
    }
    /* the apron stands at the height of the point it mirrors */
    function at(b, x, z) {
      var s = _rtsWorldToScreen(x, _rtsElev(_r3dMir(x, EXT), _r3dMir(z, EXT)), z);
      var px = Math.round(s.x * CW / R.W), py = Math.round(s.y * CH / R.H);
      if (!(px > 6 && py > 6 && px < CW - 6 && py < CH - 6)) return null;
      /* a 7x7 patch, not a pixel: the apron and the ground are cut at different steps, so the
         same point lands a few pixels apart on the two, and one pixel is one blade of grass */
      var r = 0, gg = 0, bb = 0;
      for (var dy = -3; dy <= 3; dy++) for (var dx = -3; dx <= 3; dx++) {
        var q = ((CH - 1 - (py + dy)) * CW + px + dx) * 4; r += b[q]; gg += b[q + 1]; bb += b[q + 2];
      }
      return [Math.round(r / 49), Math.round(gg / 49), Math.round(bb / 49)];
    }
    function dist(a, c) { return Math.abs(a[0] - c[0]) + Math.abs(a[1] - c[1]) + Math.abs(a[2] - c[2]); }
    var hz = _r3dHorizon(G).map(function (v) { return Math.round(v * 255); });
    o.hz = hz;
    /* sample columns across the view, 12 units out and their mirrors 12 units in */
    var xs = [], d = 12;
    for (var xx = -60; xx <= 60; xx += 20) xs.push(R.focus.x + xx);

    var on = shot();
    o.pairs = xs.map(function (x) { return { out: at(on, x, -EXT - d), inn: at(on, x, -EXT + d) }; })
      .filter(function (p) { return p.out && p.inn; });
    o.landLike = o.pairs.filter(function (p) { return dist(p.out, p.inn) < dist(p.out, hz); }).length;
    function green(c) { return c[1] > c[0] + 6 && c[1] > c[2] + 6; }
    o.greenIn = o.pairs.filter(function (p) { return green(p.inn); }).length;
    o.greenBoth = o.pairs.filter(function (p) { return green(p.inn) && green(p.out); }).length;
    /* up the middle column from the edge to the top of the view: each row against the next */
    var e0 = _rtsWorldToScreen(R.focus.x, _rtsElev(R.focus.x, -EXT), -EXT), ey = Math.round(e0.y * CH / R.H), cx = CW >> 1;
    function row(b, y) { var q = ((CH - 1 - y) * CW + cx) * 4; return [b[q], b[q + 1], b[q + 2]]; }
    o.edgeY = ey; o.stepOut = 0; o.stepIn = 0;
    for (var y = ey - 3; y > 1; y--) o.stepOut = Math.max(o.stepOut, dist(row(on, y), row(on, y - 1)));
    for (y = ey + 3; y < Math.min(CH - 2, ey + 3 + (ey - 4)); y++) o.stepIn = Math.max(o.stepIn, dist(row(on, y), row(on, y + 1)));
    o.top = row(on, 1); o.near = row(on, Math.max(2, ey - 6));
    o.fadeEnds = R3D_APRON_FADE[1] < R3D_APRON;
    o.apronVerts = R3.apronVerts;

    window.RTS_APRON_OFF = true;
    var off = shot();
    o.offOut = xs.map(function (x) { return at(off, x, -EXT - d); }).filter(Boolean);
    o.offFlat = o.offOut.filter(function (c) { return dist(c, hz) <= 6; }).length;
    window.RTS_APRON_OFF = false;

    /* no ghost of a base: a building against the edge stands on paving, which is not reflected.
       At the SOUTH edge, so the camera looks away from the apron and the building cannot stand
       in front of it */
    R.focus.z = EXT - 30; _rtsApplyCam();
    var btx = _rtsTX(R.focus.x), bld = null;
    for (var tries = 0; tries < 20 && !bld; tries++) {
      var tx2 = btx + (tries % 2 ? 1 : -1) * Math.ceil(tries / 2) * 3;
      if (_rtsCanPlace('player', 'power', tx2, RTS_N - 3, true)) { bld = _rtsPlaceStruct('player', 'power', tx2, RTS_N - 3, true); btx = tx2; }
    }
    if (bld) bld.building = 0;
    var gh = shot(), pv = [];
    for (var gx = 0; gx <= 1; gx++) {
      var wx = _rtsWX(btx + gx);
      pv.push({ inn: at(gh, wx, EXT - 1.2), out: at(gh, wx, EXT + 1.2) });
    }
    R.focus.z = -EXT + 40; _rtsApplyCam();
    o.ghost = pv.filter(function (p) { return p.inn && p.out; });
    o.paveIn = o.ghost.filter(function (p) { return !green(p.inn); }).length;
    o.ghostGreen = o.ghost.filter(function (p) { return green(p.out); }).length;
    if (bld) _rtsKill(bld);

    /* the shroud: the north strip unexplored, the rest seen */
    reveal(1);
    for (var tz = 0; tz < 12; tz++) for (var tx = 0; tx < RTS_N; tx++) { G.mapped[_rtsIdx(tx, tz)] = 0; G.vis[_rtsIdx(tx, tz)] = 0; }
    G.visDirty = 1;
    var sh = shot();
    o.shroudOut = xs.map(function (x) { return at(sh, x, -EXT - 6); }).filter(Boolean);
    o.shroudDark = o.shroudOut.filter(function (c) { return c[0] + c[1] + c[2] < 60; }).length;
    reveal(1);

    /* the low tier */
    var lvl = R3.qLevel || 0;
    _r3dQualityApply(2);
    CW = R3.cv.width; CH = R3.cv.height;
    var lo = shot();
    o.lowOut = xs.map(function (x) { return at(lo, x, -EXT - d); }).filter(Boolean);
    o.lowFlat = o.lowOut.filter(function (c) { return dist(c, hz) <= 6; }).length;
    _r3dQualityApply(lvl);
    o.err = gl.getError();
    return o;
  });

  S.ok('the 3D view is on', out.on, '');
  if (out.on) {
    S.ok('(the staging: the land past the north edge and its mirror are both in view, at five columns or more)',
         out.pairs.length >= 5 && out.apronVerts > 0, out.pairs.length + ' pairs, ' + out.apronVerts + ' apron vertices');
    S.ok('THE LAND: just past the edge looks like its mirror inside the map, not like the flat horizon',
         out.landLike >= out.pairs.length - 1, out.landLike + ' of ' + out.pairs.length + ': ' +
         out.pairs.map(function (p) { return p.out.join(',') + ' / ' + p.inn.join(','); }).join('  ') + '; horizon ' + out.hz.join(','));
    S.ok('...and keeps its colour: where the inside is grass, so is the outside', out.greenIn >= 3 && out.greenBoth >= out.greenIn - 1,
         out.greenBoth + ' of ' + out.greenIn + ' green inside');
    S.ok('NO GHOST: the paving under a building against the edge is not reflected - grass past it', out.ghost.length === 2 && out.paveIn === 2 && out.ghostGreen === out.ghost.length,
         out.paveIn + ' paved inside of ' + out.ghost.length + ', ' + out.ghostGreen + ' green outside: ' + out.ghost.map(function (p) { return p.inn.join(',') + ' / ' + p.out.join(','); }).join('  '));
    S.ok('...where with the apron off it is the flat horizon', out.offOut.length >= 5 && out.offFlat === out.offOut.length,
         out.offFlat + ' of ' + out.offOut.length + ' flat');
    var dh = function (c) { return Math.abs(c[0] - out.hz[0]) + Math.abs(c[1] - out.hz[1]) + Math.abs(c[2] - out.hz[2]); };
    S.ok('THE DISTANCE: up the view from the edge the land fades toward the horizon, with no step the ground inside does not make',
         out.edgeY > 40 && dh(out.top) < dh(out.near) * 0.6 && out.stepOut <= Math.max(out.stepIn, 30),
         'edge at row ' + out.edgeY + '; from the horizon ' + dh(out.near) + ' at the edge, ' + dh(out.top) + ' at the top; ' +
         'largest row-to-row step past the edge ' + out.stepOut + ', inside ' + out.stepIn);
    S.ok('...and the fade is over before the apron ends, so its outer edge is never seen', out.fadeEnds, '');
    S.ok('THE SHROUD: past an unexplored edge the land is dark, as what it reflects is', out.shroudOut.length >= 5 && out.shroudDark === out.shroudOut.length,
         out.shroudDark + ' of ' + out.shroudOut.length + ' dark: ' + out.shroudOut.map(function (c) { return c.join(','); }).join(' '));
    S.ok('LOW: the low tier draws the horizon there instead', out.lowOut.length >= 5 && out.lowFlat === out.lowOut.length,
         out.lowFlat + ' of ' + out.lowOut.length + ' flat');
    S.ok('THE DRAWS: no GL error', out.err === 0, 'error ' + out.err);
  }
  S.ok('the page logged no errors', !g.errors.length, g.errors.slice(0, 2).join(' | ') || 'clean');
  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
