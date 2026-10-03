/* The sprite baker's output: the sprites the game actually ships, held to the contract
   e2e/r3d checks the rasteriser against - footprints, 1-bit alpha, a square no facing clips - and
   to the things a sprite can get wrong without breaking any of it: a rebake that differs, a
   structure baked as a flat slab, ground that reads as television snow, a unit left on the
   generic fallback model. One spec with e2e/r3d until it passed 500 lines. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('r3dsprites');

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 1200, height: 800 });

  /* ------------------------------------------------------- the shipped sprites ----
     The contract e2e/r3d checks is only worth anything if the sprites the game draws obey it.
     These are the real bake paths, with no artwork loaded, so they are the procedural models
     the game falls back to - which is what a player without a copy of RA sees. */
  var real = await g.page.evaluate(function () {
    var out = { struct: [], units: [] }, TS = RTS_TS;
    ['fact', 'power', 'refinery', 'barracks', 'warfactory', 'turret'].forEach(function (k) {
      var d = rtsStructDef(k); if (!d) return;
      var s = _sprBuilding(k, 'player');
      if (!s || !s.c) { out.struct.push({ k: k, error: 'no sprite' }); return; }
      var g2 = s.c.getContext('2d'), px = g2.getImageData(0, 0, s.c.width, s.c.height).data;
      var partial = 0, low = 1e9, high = -1e9;
      for (var y = 0; y < s.c.height; y++) {
        for (var x = 0; x < s.c.width; x++) {
          var a = px[(y * s.c.width + x) * 4 + 3];
          if (!a) continue;
          if (a !== 255) partial++;
          if (x < low) low = x; if (x > high) high = x;
        }
      }
      out.struct.push({ k: k, w: s.c.width, h: s.c.height, head: s.head, ps: s.c.ps || 1,
                        cells: d.w + 'x' + d.h, wantW: d.w * TS, wantH: d.h * TS,
                        partial: partial, inkW: high - low + 1 });
    });
    ['rifle', 'tank', 'harvester', 'heli'].forEach(function (k) {
      var fr = _sprUnit(k, 'player', false, null);
      var span = RTS_UNIT_SPAN[k], sizes = {}, empty = 0, maxInk = 0;
      fr.forEach(function (c) {
        sizes[c.width + 'x' + c.height] = 1;
        var d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data, n = 0, w = 0, x0 = 1e9, x1 = -1e9;
        for (var y = 0; y < c.height; y++) for (var x = 0; x < c.width; x++) {
          if (!d[(y * c.width + x) * 4 + 3]) continue;
          n++; if (x < x0) x0 = x; if (x > x1) x1 = x;
        }
        if (n < 20) empty++;
        w = x1 - x0 + 1;
        if (w > maxInk) maxInk = w;
      });
      out.units.push({ k: k, frames: fr.length, sizes: Object.keys(sizes), empty: empty,
                       widest: maxInk, span: span, canvas: fr[0] ? fr[0].width : 0,
                       ps: (fr[0] && fr[0].ps) || 1 });
    });
    return out;
  });

  real.struct.forEach(function (s) {
    if (s.error) { S.ok('the ' + s.k + ' bakes a sprite', false, s.error); return; }
    /* IN ART PIXELS, NOT CANVAS PIXELS. The procedural path bakes at RTS_PS times RA's
       resolution (sprites/bake.js), so a canvas is ps times wider than the footprint it
       covers - which is the whole point, and is corrected once in render/draw.js. The claim
       being made here is unchanged: the sprite covers exactly its own tiles. It just has to
       be asked in the units the tiles are measured in. */
    S.eq('the ' + s.k + ' (' + s.cells + ' cells) bakes exactly ' + s.wantW + ' art px wide',
         s.w / s.ps, s.wantW);
    S.eq('...its footprint plus its headroom is its height', s.h, s.wantH * s.ps + s.head);
    S.ok('...it fills the width it claims', s.inkW / s.ps >= s.wantW * 0.6,
         'drawn across ' + Math.round(s.inkW / s.ps) + ' of ' + s.wantW + ' art px');
  });
  real.units.forEach(function (u) {
    S.ok('the ' + u.k + ' bakes 8 or 32 facings', u.frames === 8 || u.frames === 32, u.frames + ' frames');
    S.eq('...every facing on one canvas size', u.sizes.length, 1);
    S.eq('...and none of them comes out blank', u.empty, 0);
    /* RTS_UNIT_SPAN is the size ladder every unit is brought onto, so the canvas a unit bakes
       into has to land on it - that number is what stops a Battle Tank measuring three cells
       and swallowing a 2x2 building. _sprShadow pads the canvas beyond the fitted square, so
       the check is that it is not SMALLER than the span and not wildly larger. */
    S.ok('...on the size ladder RTS_UNIT_SPAN sets',
         u.canvas / u.ps >= u.span && u.canvas / u.ps <= u.span + 12,
         'baked at ' + u.canvas + ' px / ps ' + u.ps + ' = ' + (u.canvas / u.ps) +
         ' art px for a span of ' + u.span +
         ', widest facing draws ' + Math.round(u.widest / u.ps) + ' art px of ink');
    S.ok('...and actually fills a fair part of that canvas', u.widest >= u.canvas * 0.35,
         u.widest + ' of ' + u.canvas + ' px');
  });

  /* ------------------------------------------------------------ determinism ----
     Sprites are baked at load and cached for the session, but a rebake has to give the same
     picture: anything random in the shading would make a saved game's units differ from the
     ones beside them, and would make every screenshot comparison useless. */
  var det = await g.page.evaluate(function () {
    function hashOf() {
      var m = [];
      _r3Slab(m, 0, 0, 0, 40, 22, 34, 5, '#7a6a55', '#9a8a70');
      _r3Cyl(m, 10, 22, 0, 6, 12, '#555555', '#888888', 20);
      var c = _r3BakeCentred(m, 96), d = c.getContext('2d').getImageData(0, 0, 96, 96).data, h = 0;
      for (var i = 0; i < d.length; i++) h = (h * 33 + d[i]) | 0;
      return h;
    }
    return [hashOf(), hashOf(), hashOf()];
  });
  S.ok('baking the same model three times gives the same pixels every time',
       det[0] === det[1] && det[1] === det[2], det.join(' / '));

  S.ok('the page logged no errors while baking', !g.errors.length, g.errors.slice(0, 3).join(' | ') || 'clean');

  /* ------------------------------------------- no structure is a flat slab ----
     A building made of plain boxes under a camera this close to overhead is mostly its own
     TOP faces, and a top face is one polygon in one tone however good the palette is. The two
     shipyards were the proof: an apron, a hall, a roof, a slipway, a gantry, a mast and a
     crate between them, and 62 distinct colours across 5,800 opaque pixels - a rectangle with
     a stripe, and both yards identical because they were the same box.

     Distinct tones per thousand opaque pixels is the cheapest number that catches it. It does
     not say a building looks good; it says the geometry is reaching the screen at all, which
     is the failure that keeps recurring. The floor is set below today's worst so it flags a
     regression rather than pinning the current numbers. */
  var flat = await g.page.evaluate(function () {
    var S = _rtsSprites(), out = [];
    RTS_STRUCTS.forEach(function (d) {
      var sp = S.bld.player[d.key];
      if (!sp || !sp.c) return;
      var cv = sp.c, c = cv.getContext('2d');
      var px = c.getImageData(0, 0, cv.width, cv.height).data;
      var tones = {}, n = 0;
      for (var i = 0; i < px.length; i += 4) {
        if (px[i + 3] < 128) continue;
        n++;
        tones[(px[i] >> 3) + ',' + (px[i + 1] >> 3) + ',' + (px[i + 2] >> 3)] = 1;
      }
      /* AREA IN ART PIXELS, not in canvas pixels. The procedural bake is RTS_PS times RA's
         resolution, so every count here is ps^2 too large - and the exemption below is a
         statement about how big a thing is in the WORLD ("a wall is a wall"), which does not
         change because we chose to bake it more finely. Without this the wall sprite crossed
         the 1500 threshold purely by being rendered at 2x and was suddenly asked to justify a
         silhouette it never needed. */
      var psq = ((cv.ps || 1) * (cv.ps || 1));
      n = Math.round(n / psq);
      if (n < 400) return;                       /* a 1x1 needs no silhouette argument */
      out.push({ key: d.key, px: n, tones: Object.keys(tones).length,
                 per1k: +(1000 * Object.keys(tones).length / n).toFixed(1) });
    });
    out.sort(function (a, b) { return a.per1k - b.per1k; });
    return out;
  });
  /* ABSOLUTE tone count, not tones per pixel. Per-pixel was the first thing tried here and it
     is the wrong shape: a big smooth surface spends many pixels per tone, so it punishes large
     buildings for being large. It ranked the Construction Yard worst in the game at 8.8 and the
     Pillbox best at 174, which is almost entirely a statement about their sizes. What the
     question actually is - does this thing show more than a couple of faces - is answered by
     how many distinct tones are on screen at all. Sprites under 1500 px are exempt: a wall is
     a wall and does not owe anyone a silhouette. */
  var FLOOR = 50;
  var big = flat.filter(function (r) { return r.px >= 1500; })
                .sort(function (a, b) { return a.tones - b.tones; });
  var slabs = big.filter(function (r) { return r.tones < FLOOR; });
  S.ok('no structure sprite reads as a flat slab', !slabs.length,
       slabs.map(function (r) { return r.key + ' ' + r.tones; }).join(', ') ||
       big.length + ' structures over 1500 px, worst ' + big[0].key + ' at ' + big[0].tones + ' tones');
  S.note('distinct tones, worst five: ' + big.slice(0, 5).map(function (r) {
    return r.key + ' ' + r.tones;
  }).join(', '));
  S.note('...best five: ' + big.slice(-5).map(function (r) { return r.key + ' ' + r.tones; }).join(', '));

  /* ------------------------------------------- the ground is not television snow ----
     The terrain bake is one 3072x3072 canvas painted from noise, and the tone for each 2px
     block used to come from a WHITE-NOISE hash - no spatial correlation at all, so every
     block was an independent random pick from a five-entry palette. The comment beside it
     said "clumpy, not TV static"; 2px blocks of white noise are static with bigger pixels.

     Mean absolute luminance step between horizontally adjacent pixels is what catches it.
     Drawn pixel-art ground is areas of a tone with a few marks in them, so the number is low;
     per-pixel noise drives it up. Measured at NATIVE resolution, which matters - sampling a
     downscaled copy aliases the paint blocks back into noise and measures the resampling. */
  var ground = await g.page.evaluate(function () {
    if (!document.getElementById('rcgRts')) rtsOpen(9001);
    var U = window._rtsUI;
    if (U) { U.dead = true; try { cancelAnimationFrame(U.raf); } catch (e) {} }
    var src = window._rtsR && window._rtsR.terrain;
    if (!src) return { error: 'no terrain bake' };
    var W = 512, cv = document.createElement('canvas');
    cv.width = W; cv.height = W;
    var c = cv.getContext('2d');
    c.imageSmoothingEnabled = false;
    c.drawImage(src, (src.width >> 1) - 260, (src.height >> 1) - 260, W, W, 0, 0, W, W);
    var d = c.getImageData(0, 0, W, W).data, e = 0, n = 0, tones = {};
    function L(o) { return 0.2126 * d[o] + 0.7152 * d[o + 1] + 0.0722 * d[o + 2]; }
    for (var y = 0; y < W; y++) for (var x = 1; x < W; x++) {
      var o = (y * W + x) * 4;
      e += Math.abs(L(o) - L(o - 4)); n++;
      tones[(d[o] >> 3) + ',' + (d[o + 1] >> 3) + ',' + (d[o + 2] >> 3)] = 1;
    }
    return { edge: +(e / n).toFixed(2), tones: Object.keys(tones).length, bake: src.width };
  });
  S.ok('the terrain bake exists', !ground.error, ground.error || (ground.bake + 'px square'));
  if (!ground.error) {
    S.ok('the ground is not per-pixel noise', ground.edge < 6.5,
         'mean neighbour step ' + ground.edge + ' (was 7.75 when the grain was a white-noise hash)');
    S.ok('...and did not get there by going flat', ground.tones >= 60,
         ground.tones + ' distinct tones in the sample');
  }

  /* ------------------------------------------- the sprite reports its own resolution ----
     The procedural path bakes at RTS_PS times RA's tile resolution (see sprites/bake.js), and
     the ONLY thing keeping a building on its tiles afterwards is that the canvas carries a `ps`
     and render/draw.js divides by it. Every part of that is silent when wrong: forget the tag
     and every structure draws RTS_PS times too big; forget the division and the same; tag it
     and bake at a different number and buildings drift off their footprints by a fraction that
     grows with the base.

     So the invariant is asserted as the renderer uses it - canvas width over `ps` is exactly
     the footprint in RA art pixels - across every structure rather than a sample, because it
     is per-key model code that could get it wrong one building at a time.

     Real RA artwork carries no `ps` at all and reads as 1. That is deliberate and is what keeps
     mixart untouched, so it is checked here too rather than assumed. */
  var scale = await g.page.evaluate(function () {
    var bad = [], seen = 0, tags = {};
    RTS_STRUCTS.forEach(function (d) {
      var spr;
      try { spr = _sprBuilding(d.key, 'player'); } catch (e) { bad.push(d.key + ' threw'); return; }
      if (!spr || !spr.c) { bad.push(d.key + ' produced nothing'); return; }
      seen++;
      var ps = spr.c.ps || 1;
      tags[ps] = (tags[ps] || 0) + 1;
      if (spr.c.width / ps !== d.w * RTS_TS) {
        bad.push(d.key + ' ' + spr.c.width + '/' + ps + ' != ' + (d.w * RTS_TS));
      }
      /* the damaged derivative must agree, or a building resizes when it is hit */
      if (spr.dmg && (spr.dmg.ps || 1) !== ps) bad.push(d.key + ' damaged frame ps ' + (spr.dmg.ps || 1));
    });
    return { bad: bad, seen: seen, tags: tags, ps: RTS_PS, ts: RTS_TS };
  });
  S.ok('every structure sprite covers exactly its footprint once divided by its own scale',
       !scale.bad.length && scale.seen > 0,
       scale.bad.join(', ') || scale.seen + ' structures at RTS_PS=' + scale.ps +
       ' (' + scale.ts * scale.ps + ' baked pixels per cell, drawn as ' + scale.ts + ')');

  var uscale = await g.page.evaluate(function () {
    var bad = [], n = 0;
    ['tank', 'harvester', 'rifle'].forEach(function (k) {
      var fr = _sprUnit(k, 'player', false, null);
      if (!fr || !fr.length) { bad.push(k + ' produced no frames'); return; }
      fr.forEach(function (c, i) {
        n++;
        if ((c.ps || 1) !== RTS_PS) bad.push(k + ' facing ' + i + ' ps ' + (c.ps || 1));
        if (c.width !== fr[0].width) bad.push(k + ' facing ' + i + ' is a different size');
      });
    });
    return { bad: bad, n: n };
  });
  S.ok('...and every unit facing is baked at that same scale and size', !uscale.bad.length,
       uscale.bad.slice(0, 4).join(', ') || uscale.n + ' facings checked');

  /* ------------------------------------------ every unit has a model of its own ----
     _sprUnitModel ends in a fallback: two dark track boxes, a body in the TEAM COLOUR and a
     stub gun. A unit key with no branch of its own gets that silently - it is a plausible
     little vehicle, so nothing looks broken, and the only symptom is that the unit is a
     coloured box which happens to be the shape of every other coloured box.

     The V2 Rocket Launcher shipped exactly that way. Measured by face count against its peers:
     every other vehicle in the roster carried 110 to 187 faces and the V2 carried 20.

     TWO CHECKS, because either alone can be satisfied by accident. The face floor catches the
     fallback by size. The palette check catches what the fallback gets WRONG - RTS_PAL.veh's
     own note says a vehicle body is khaki or olive and the team colour is "a remap over a small
     part of the sprite, not the paint job", and the fallback paints the whole body TM. A future
     model could be large and still break that rule, or small and not. */
  var unitModels = await g.page.evaluate(function () {
    /* A face stores its colour as the [r,g,b] triple _r3Hex produced, not as the hex string
       the model was written with, so the palette has to be put through the same conversion
       before anything can be compared to it. */
    var team = {}, veh = {}, key = function (c) { return _r3Hex(c).join(','); };
    ['player', 'enemy'].forEach(function (sd) {
      RTS_PAL.team[sd].forEach(function (c) { team[key(c)] = 1; });
      RTS_PAL.veh[sd].forEach(function (c) { veh[key(c)] = 1; });
    });
    var thin = [], painted = [];
    RTS_UNITS.forEach(function (u) {
      if (u.kind === 'infantry') return;      /* infantry ARE team-coloured - see RTS_INF_KIT */
      var m = _sprUnitModel(u.key, 'player', false, null) || [];
      if (m.length < 40) thin.push(u.key + ' ' + m.length);
      var t = 0, v = 0;
      m.forEach(function (f) {
        var c = f.c.join(',');
        if (team[c]) t++;
        if (veh[c]) v++;
      });
      /* THE THRESHOLD IS MEASURED, not picked. Every model in the roster scores between 1%
         and 12% team - a cap, a hoop, a stripe - while the fallback paints its entire body
         TM and lands near 25-30%. 20% has clear daylight on both sides.

         `v` is counted and reported but deliberately NOT required: submarines carry no khaki
         at all and should not, so demanding a veh-ramp face would fail the two hulls that are
         correctly dark rather than catching anything. The team fraction is the documented
         rule; the face floor above is what catches the fallback by size. */
      if (t / m.length > 0.2) {
        painted.push(u.key + ' ' + Math.round(100 * t / m.length) + '% team, ' + v + ' body faces');
      }
    });
    return { thin: thin, painted: painted };
  });
  S.ok('no vehicle is left on the generic fallback model', !unitModels.thin.length,
       unitModels.thin.join(', ') || 'every vehicle carries a model of its own');
  S.ok('...and none of them is painted in the team colour', !unitModels.painted.length,
       unitModels.painted.join(', ') ||
       'every vehicle body uses the veh ramp, team colour kept to trim');

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})();
