/* EVERY SPRITE THE PLAYER LOOKS AT IS BAKED AT THE PROCEDURAL DENSITY.

   RTS_PS exists because RA's 24-pixel cell is a FILE FORMAT, not a resolution: the procedural
   art bakes at RTS_TS * RTS_PS, tags each canvas with the density it used, and every draw site
   divides by that tag - so a building covers exactly its own tiles however finely it was baked.
   Buildings, units, ore and gems went through that. The combat effects did not, and neither did
   the foundation pads, and nobody noticed because an explosion is over in half a second.

   Measured on a dpr-3 phone at the top zoom, where a cell covers 144 device pixels: buildings
   and units magnified 3x, while every fireball, muzzle flash, bullet strike, water splash,
   flame, smoke puff and concrete apron magnified SIX times. The blockiest thing on the screen
   was the thing a firefight makes you look at, and the largest unbroken area under a base was
   twice as coarse as the base standing on it.

   THE RISK IN FIXING IT IS SIZE, NOT SHARPNESS. Tagging a canvas without dividing at its draw
   site doubles the thing on screen; dividing where the number was never in raster units - the
   pad's 10-pixel overhang is a fact about the SHAPE, in art pixels - shifts it by half its own
   overhang. So this grades the geometry that the density must not disturb, as well as the
   density itself:

     - the drawn size of an effect still matches the size it is authored at, in art pixels
     - the apron still overhangs its building's footprint by exactly the 10 and 8 art pixels
       that put it there
     - and every live sprite set now magnifies no worse than a building does

   Three sets stay at RTS_TS on purpose and are named here so a future reader does not "fix"
   them: scorch, crater and corpse are STAMPED INTO the terrain canvas, which is baked at
   RTS_TS, and a stamp at a different density from the canvas it is stamped into is a bug. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('effects');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 393, height: 852, dpr: 3 });
  await g.start(7, 1);

  var out = await g.page.evaluate(function () {
    var o = {}, R = _rtsR, SP = _rtsSprites(), G = window._rtsG, i;
    rtsSetVoxSide('allied');
    _rtsNewGame(4242, 'easy');
    G = window._rtsG;
    for (i = 0; i < RTS_N * RTS_N; i++) { G.mapped[i] = 1; G.vis[i] = 1; }
    G.visDirty = 1;
    R.zi = RTS_ZOOMS.length - 1; _rtsApplyCam();
    o.PS = RTS_PS;
    o.devPerCell = R.cell * R.dpr;

    /* --- 1. the density of every live sprite set --- */
    var STAMPED = { scorch: 1, crater: 1, corpse: 1 };   /* stamped into the terrain canvas */
    var DEAD = { bag: 1 };                               /* built, never drawn */
    var sets = [];
    function walk(name, v, depth) {
      if (!v || depth > 3) return;
      if (v instanceof HTMLCanvasElement) {
        sets.push({ set: name, root: name.split('.')[0], ps: v.ps || 1 });
        return;
      }
      if (Array.isArray(v)) { if (v.length) walk(name, v[0], depth + 1); return; }
      if (typeof v === 'object') {
        if (v.c instanceof HTMLCanvasElement) {
          sets.push({ set: name, root: name.split('.')[0], ps: v.c.ps || 1 });
          return;
        }
        for (var k in v) { try { walk(name + '.' + k, v[k], depth + 1); } catch (e) {} }
      }
    }
    Object.keys(SP).forEach(function (k) { walk(k, SP[k], 0); });
    o.total = sets.length;
    o.under = sets.filter(function (r) {
      return r.ps < RTS_PS && !STAMPED[r.root] && !DEAD[r.root];
    }).map(function (r) { return r.set + ' ps' + r.ps; });
    o.stampedStillAtTS = sets.filter(function (r) {
      return STAMPED[r.root] && r.ps === 1;
    }).length;

    /* --- 2. an effect is drawn at the size it is authored at --- */
    /* Spawn a fireball and watch the real draw. The boom set is authored 20px for frame 0, so
       whatever the bake density, it has to land at 20 art px on screen (times the renderer's
       own 0.9). If the divide were missing it would be twice that. */
    var yard = _rtsHas('player', 'yard');
    R.focus.x = yard.x; R.focus.z = yard.z;
    G.fx.length = 0;
    G.fx.push({ kind: 'boom', x: yard.x, z: yard.z, t: 0.001, big: 1 });
    var boom = SP.fx.boom, drawn = null;
    var orig = R.g.drawImage;
    R.g.drawImage = function (img, a, b, w, h) {
      for (var q = 0; q < boom.length; q++) {
        if (boom[q] === img && drawn === null) drawn = { w: w, h: h, src: img.width, ps: img.ps || 1 };
      }
      return orig.apply(this, arguments);
    };
    _rtsRFrame(1 / 60);
    R.g.drawImage = orig;
    o.boom = drawn;
    if (drawn) {
      /* art pixels the frame occupies on screen, at the renderer's own art-pixel scale */
      o.boomArtPx = +(drawn.w / (R.cell / RTS_TS)).toFixed(2);
      o.boomAuthoredPx = +(drawn.src / drawn.ps).toFixed(2);
    }
    G.fx.length = 0;

    /* --- 3. the apron still sits on its footprint --- */
    var pad = SP.pad[yard.def], pdef = rtsStructDef(yard.def);
    var pdrawn = null;
    var orig2 = R.g.drawImage;
    R.g.drawImage = function (img, a, b, w, h) {
      if (img === pad && pdrawn === null) pdrawn = { x: a, y: b, w: w, h: h };
      return orig2.apply(this, arguments);
    };
    _rtsRFrame(1 / 60);
    R.g.drawImage = orig2;
    o.pad = pdrawn;
    if (pdrawn) {
      var TSscale = R.cell / RTS_TS;
      /* the apron is the footprint plus 10 art px each side, 8 top and bottom */
      o.padExpectW = +((pdef.w * RTS_TS + 20) * TSscale).toFixed(2);
      o.padExpectH = +((pdef.h * RTS_TS + 16) * TSscale).toFixed(2);
      var fp = _rtsGroundToScreen(_rtsWX(yard.tx) - RTS_TILE / 2, _rtsWX(yard.tz) - RTS_TILE / 2);
      o.padOverhangL = +(fp.x - pdrawn.x).toFixed(2);
      o.padExpectOverhangL = +(10 * TSscale).toFixed(2);
    }
    return o;
  });

  S.ok('every sprite the player looks at bakes at the procedural density',
       out.under.length === 0,
       out.total + ' sets, ' + out.under.length + ' still below RTS_PS=' + out.PS +
       (out.under.length ? ': ' + out.under.slice(0, 8).join(', ') : '') +
       ' (they were at 6x magnification against a building\'s 3x)');

  S.ok('...and the three that stamp into the terrain stay at its density',
       out.stampedStillAtTS >= 3,
       out.stampedStillAtTS + ' of scorch/crater/corpse still bake at RTS_TS, which is what the ' +
       'canvas they are stamped into is baked at');

  S.ok('an explosion is drawn', !!out.boom,
       out.boom ? (out.boom.src + 'px source at ps ' + out.boom.ps) : 'no boom frame drawn');
  if (out.boom) {
    /* The whole risk of tagging a canvas: forget the divide at one draw site and the thing
       doubles. Authored at 20 art px, drawn at 0.9 of that by the effect renderer. */
    S.ok('...at the size it is authored at, not at the size it is baked at',
         Math.abs(out.boomArtPx - out.boomAuthoredPx * 0.9) < 1.5,
         out.boomArtPx + ' art px on screen against ' + out.boomAuthoredPx +
         ' authored (x0.9) - a missing divide would draw it at ' +
         (out.boomAuthoredPx * 0.9 * out.boom.ps).toFixed(1));
  }

  S.ok('the apron is drawn', !!out.pad, out.pad ? (out.pad.w + 'x' + out.pad.h) : 'none');
  if (out.pad) {
    S.ok('the apron still covers its footprint plus its overhang',
         Math.abs(out.pad.w - out.padExpectW) < 2 && Math.abs(out.pad.h - out.padExpectH) < 2,
         out.pad.w + 'x' + out.pad.h + ' against ' + out.padExpectW + 'x' + out.padExpectH +
         ' (footprint plus 20 and 16 art px of verge)');
    /* The offsets are in ART pixels - a fact about the shape, not the raster - so they must not
       pick up the density divide. Getting that wrong slides every apron half its own overhang. */
    S.ok('...and still starts at the right corner of it',
         Math.abs(out.padOverhangL - out.padExpectOverhangL) < 2,
         'the apron begins ' + out.padOverhangL + 'px left of the footprint, expected ' +
         out.padExpectOverhangL + ' (10 art px; dividing this by the density would halve it)');
  }

  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})();
