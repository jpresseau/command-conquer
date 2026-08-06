/* The sprite baker, rasterising for real.

   Everything in test/unit/r3d.test.js is geometry: transforms and colour arithmetic, which run
   in a bare vm. This half needs a canvas, because the half of the renderer that actually decides
   what the game looks like - the scanline fill, the depth buffer, the supersample downsample and
   the two bakers - only exists once there is one.

   The assertions here are the claims the source itself makes, in its own words:

     "A building's footprint has to land on exactly its tiles - a 3x3 structure must cover
      72x72 art pixels."
     "1-bit alpha: opaque only if MORE than half the samples were covered."
     "models can interpenetrate freely without any face sorting" (a depth buffer, not a
      painter's algorithm - so face ORDER must not change the picture)
     "The square a model needs so that NO facing clips."

   Each of those is the kind of thing that fails silently: a sprite one pixel wide of its
   footprint looks fine on its own and misaligns a whole base; a feathered silhouette looks
   better in isolation and wrong next to every other sprite; a facing that clips loses the gun
   off a tank at one angle out of thirty-two. None of them announce themselves. */

var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('r3d');

/* Read a baked canvas back out as plain arrays - Playwright can only return JSON. */
function readCanvas() {
  return function (c) {
    var g = c.getContext('2d'), d = g.getImageData(0, 0, c.width, c.height).data;
    return { w: c.width, h: c.height, d: Array.prototype.slice.call(d) };
  };
}

(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 1200, height: 800 });

  /* -------------------------------------------------- the footprint contract ----
     A structure's canvas is footW wide and its footprint occupies the BOTTOM footD rows;
     everything above that is headroom for the parts of the model that stand up. Get this
     wrong by a pixel and every building in a base is offset from the tiles it occupies. */
  var foot = await g.page.evaluate(function () {
    var TS = RTS_TS, out = {};
    /* a flat plate exactly three cells square and one unit tall - it should fill its
       footprint and ask for essentially no headroom */
    var flat = [];
    _r3Box(flat, 0, 0, 0, TS * 3, 1, TS * 3, '#808080', '#a0a0a0');
    var r = _r3BakeFootprint(flat, TS * 3, TS * 3);
    out.ts = TS;
    out.w = r.c.width; out.h = r.c.height; out.head = r.head;

    var ctx = r.c.getContext('2d'), d = ctx.getImageData(0, 0, r.c.width, r.c.height).data;
    /* the opaque bounding box of what was actually drawn */
    var x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, opaque = 0, partial = 0;
    for (var y = 0; y < r.c.height; y++) {
      for (var x = 0; x < r.c.width; x++) {
        var a = d[(y * r.c.width + x) * 4 + 3];
        if (a === 0) continue;
        if (a !== 255) partial++;
        opaque++;
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
    out.ink = { x0: x0, x1: x1, y0: y0, y1: y1, n: opaque, partial: partial };

    /* the same plate, but a tower on top of it: the footprint must not move, only the
       canvas must grow upward */
    var tall = [];
    _r3Box(tall, 0, 0, 0, TS * 3, 1, TS * 3, '#808080', '#a0a0a0');
    _r3Box(tall, 0, 1, 0, 10, 60, 10, '#606060', '#909090');
    var rt = _r3BakeFootprint(tall, TS * 3, TS * 3);
    out.tallW = rt.c.width; out.tallH = rt.c.height; out.tallHead = rt.head;

    /* and a 2x3 footprint, so a square canvas cannot pass by accident */
    var r23 = _r3BakeFootprint(flat, TS * 2, TS * 3);
    out.w23 = r23.c.width; out.h23 = r23.c.height;
    return out;
  });

  S.eq('a 3x3 structure bakes onto a canvas exactly 72 art pixels wide', foot.w, foot.ts * 3);
  S.ok('...and at least its 72 pixels of footprint tall', foot.h >= foot.ts * 3,
       foot.h + ' px tall, ' + foot.head + ' of it headroom');
  /* Headroom is exactly what the model's height projects to, and nothing more: a one-unit
     plate rises K*1 on screen, so it buys 2 rows. Anything else and either the sprite is
     cropped or every building carries dead transparent pixels above it. */
  S.eq('headroom is exactly what the model\'s height projects to', foot.head, Math.ceil(1.3));
  S.ok('...so the flat plate covers its whole footprint',
       foot.ink.x0 <= 1 && foot.ink.x1 >= foot.ts * 3 - 2 &&
       foot.ink.y1 >= foot.ts * 3 - 2,
       'ink x ' + foot.ink.x0 + '..' + foot.ink.x1 + ', y ' + foot.ink.y0 + '..' + foot.ink.y1 +
       ' on a ' + foot.w + 'x' + foot.h + ' canvas');
  S.ok('...with no gaps in it', foot.ink.n > foot.ts * 3 * foot.ts * 3 * 0.97,
       foot.ink.n + ' of ' + (foot.ts * 3 * foot.ts * 3) + ' pixels drawn');

  /* the headroom claim: a tall model grows the canvas UP, and never sideways */
  S.eq('a tower on the same plate keeps the 72 pixel width', foot.tallW, foot.ts * 3);
  S.ok('...and buys the height it needs as headroom', foot.tallHead > 40 &&
       foot.tallH === foot.ts * 3 + foot.tallHead,
       foot.tallH + ' = 72 + ' + foot.tallHead);
  S.eq('a 2x3 footprint bakes 48 wide', foot.w23, foot.ts * 2);
  S.ok('...and 72 tall', foot.h23 >= foot.ts * 3, foot.h23 + ' px');

  /* ------------------------------------------------------------- 1-bit alpha ----
     "opaque only if MORE than half the samples were covered ... the silhouette stays as hard
     as it was." A feathered edge is the single most modern-looking mistake this renderer can
     make, and it is invisible unless the alpha channel is actually inspected. */
  S.eq('the flat plate has no partially-transparent pixels', foot.ink.partial, 0);

  var alpha = await g.page.evaluate(function () {
    /* a cone and a cylinder: curved silhouettes, where any feathering would show */
    var m = [];
    _r3Cyl(m, 0, 0, 0, 14, 20, '#a05030', '#c07040', 20);
    _r3Cone(m, 0, 20, 0, 14, 2, 16, '#4060a0', 20);
    var c = _r3BakeCentred(m, 80);
    var d = c.getContext('2d').getImageData(0, 0, 80, 80).data;
    var seen = {}, drawn = 0;
    for (var i = 3; i < d.length; i += 4) { seen[d[i]] = (seen[d[i]] || 0) + 1; if (d[i]) drawn++; }
    return { levels: Object.keys(seen).map(Number).sort(function (a, b) { return a - b; }), drawn: drawn };
  });
  S.ok('a curved model bakes with a hard 1-bit silhouette too',
       alpha.levels.length === 2 && alpha.levels[0] === 0 && alpha.levels[1] === 255,
       'alpha levels present: ' + alpha.levels.join(', ') + ' (' + alpha.drawn + ' px drawn)');

  /* ----------------------------------------------------------- the depth buffer ----
     The source's claim is that models "can interpenetrate freely without any face sorting".
     That is only true if visibility is decided per pixel by depth. The test that actually
     distinguishes a depth buffer from a painter's algorithm is ORDER: shuffle the faces and
     the image must be byte-identical. Under a painter's algorithm it changes completely. */
  var depth = await g.page.evaluate(function () {
    function crossed(order) {
      var a = [], b = [];
      _r3Box(a, -6, 0, 0, 30, 14, 12, '#c02020', '#e04040');    /* red bar, running x */
      _r3Box(b, 6, 0, 2, 12, 26, 30, '#2020c0', '#4040e0');     /* blue bar, running z, taller */
      var m = order ? a.concat(b) : b.concat(a);
      /* interleave as well, so it is not merely "one block after another" */
      if (order === 2) { m = []; for (var i = 0; i < Math.max(a.length, b.length); i++) { if (a[i]) m.push(a[i]); if (b[i]) m.push(b[i]); } }
      var c = _r3BakeCentred(m, 90);
      var d = c.getContext('2d').getImageData(0, 0, 90, 90).data;
      var red = 0, blue = 0, hash = 0;
      for (var p = 0; p < d.length; p += 4) {
        if (!d[p + 3]) continue;
        if (d[p] > d[p + 2] + 20) red++; else if (d[p + 2] > d[p] + 20) blue++;
        hash = (hash * 31 + d[p] + d[p + 1] * 7 + d[p + 2] * 13) | 0;
      }
      return { red: red, blue: blue, hash: hash };
    }
    return { a: crossed(1), b: crossed(0), c: crossed(2) };
  });
  S.ok('two interpenetrating models both survive the bake',
       depth.a.red > 200 && depth.a.blue > 200,
       depth.a.red + ' red pixels, ' + depth.a.blue + ' blue');
  S.eq('reversing the face order gives a byte-identical picture', depth.b.hash, depth.a.hash);
  S.eq('...and so does interleaving them', depth.c.hash, depth.a.hash);

  /* ------------------------------------------------------- backface culling ----
     A face turned away from the camera must not be drawn. With a depth buffer in front of it
     the picture usually still comes out right, so the symptom is not a wrong image - it is a
     bake that costs twice what it should, or an interior surface poking through a seam.

     _r3Box emits its faces in a known order (top, front, back, right, left), so each can be
     baked ALONE and checked against which way it faces. That is the culling decision itself,
     rather than a whole-model proxy that a depth buffer would mask. */
  var cull = await g.page.evaluate(function () {
    var m = []; _r3Box(m, 0, 0, 0, 40, 40, 40, '#808080', '#c0c0c0');
    function drawn(faces) {
      var c = _r3BakeCentred(faces, 140), d = c.getContext('2d').getImageData(0, 0, 140, 140).data, n = 0;
      for (var q = 3; q < d.length; q += 4) if (d[q]) n++;
      return n;
    }
    var names = ['top', 'front', 'back', 'right', 'left'], each = {};
    names.forEach(function (nm, i) { each[nm] = drawn([m[i]]); });
    var tones = {};
    var c = _r3BakeCentred(m, 140), d = c.getContext('2d').getImageData(0, 0, 140, 140).data;
    for (var p = 0; p < d.length; p += 4) if (d[p + 3]) tones[d[p] >> 4] = 1;
    /* Winding is what the cull reads, so flipping it must flip the decision - the back wall,
       culled on its own, is the face an inside-out model would show. */
    function flip(f) { return { v: f.v.slice().reverse(), c: f.c }; }
    return { each: each, tones: Object.keys(tones).length,
             backFlipped: drawn([flip(m[2])]), frontFlipped: drawn([flip(m[1])]) };
  });
  S.ok('a cube shows more than one shaded plane', cull.tones >= 2, cull.tones + ' tone bands');
  S.ok('the face turned toward the camera is drawn', cull.each.front > 500, cull.each.front + ' px');
  S.ok('the roof is drawn', cull.each.top > 500, cull.each.top + ' px');
  S.eq('the face turned away from the camera is not drawn at all', cull.each.back, 0);
  S.eq('...nor is the left wall, which is exactly edge-on', cull.each.left, 0);
  S.eq('...nor the right', cull.each.right, 0);
  S.ok('and the cull follows the WINDING: flip the back wall and it becomes visible',
       cull.backFlipped > 500, cull.backFlipped + ' px once reversed');
  S.eq('...flip the front wall and it disappears', cull.frontFlipped, 0);

  /* --------------------------------------------------------------- _r3FitSize ----
     "The square a model needs so that NO facing clips." A unit is baked at up to thirty-two
     facings and one canvas size serves them all, so the only honest test is to bake every
     facing and check none of them touches the border. */
  var fit = await g.page.evaluate(function () {
    /* deliberately lopsided, and taller than it is wide - the case the comment says broke */
    var m = [];
    _r3Box(m, 0, 0, 0, 34, 8, 18, '#556655', '#778877');
    _r3Box(m, 0, 8, 4, 14, 9, 12, '#445544', '#667766');
    _r3Box(m, 0, 12, 22, 4, 4, 20, '#333333', '#555555');   /* a long gun, well off centre */
    var size = _r3FitSize([m], 2);
    function scan(sz) {
      var worst = 0, clipped = [], N = 32;
      for (var f = 0; f < N; f++) {
        var c = _r3BakeCentred(_r3Yaw(m, -f / N * Math.PI * 2), sz);
        var d = c.getContext('2d').getImageData(0, 0, sz, sz).data, touch = 0, n = 0;
        for (var y = 0; y < sz; y++) {
          for (var x = 0; x < sz; x++) {
            if (!d[(y * sz + x) * 4 + 3]) continue;
            n++;
            if (x === 0 || y === 0 || x === sz - 1 || y === sz - 1) touch++;
          }
        }
        if (touch) clipped.push('facing ' + f + ' (' + touch + ' px on the border)');
        if (n > worst) worst = n;
      }
      return { clipped: clipped, worst: worst };
    }
    var ok = scan(size), tight = scan(size - 6);
    return { size: size, clipped: ok.clipped, worst: ok.worst, tightClipped: tight.clipped.length };
  });
  S.ok('_r3FitSize returns a square no facing runs out of', !fit.clipped.length,
       fit.clipped.slice(0, 3).join('; ') || ('all 32 facings fit inside ' + fit.size + 'x' + fit.size));
  /* ...and the square it returns is a real measurement, not a generous guess: take six pixels
     off it and facings must start clipping, or "nothing clips" was never saying anything. */
  S.ok('...and it is not simply oversized - six pixels smaller and facings clip',
       fit.tightClipped > 0, fit.tightClipped + ' of 32 facings clip at ' + (fit.size - 6) + ' px');
  S.ok('...so the model fills a fair share of the square it asked for',
       fit.worst > fit.size * fit.size * 0.10,
       'the fullest facing covers ' + Math.round(fit.worst / (fit.size * fit.size) * 100) + '% of the canvas');

  /* ------------------------------------------------------- the shipped sprites ----
     The contract above is only worth anything if the sprites the game actually draws obey it.
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
      out.struct.push({ k: k, w: s.c.width, h: s.c.height, head: s.head,
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
                       widest: maxInk, span: span, canvas: fr[0] ? fr[0].width : 0 });
    });
    return out;
  });

  real.struct.forEach(function (s) {
    if (s.error) { S.ok('the ' + s.k + ' bakes a sprite', false, s.error); return; }
    S.eq('the ' + s.k + ' (' + s.cells + ' cells) bakes exactly ' + s.wantW + ' px wide', s.w, s.wantW);
    S.eq('...its footprint plus its headroom is its height', s.h, s.wantH + s.head);
    S.ok('...it fills the width it claims', s.inkW >= s.wantW * 0.6,
         'drawn across ' + s.inkW + ' of ' + s.wantW + ' px');
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
         u.canvas >= u.span && u.canvas <= u.span + 12,
         'baked at ' + u.canvas + ' px for a span of ' + u.span +
         ', widest facing draws ' + u.widest + ' px of ink');
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

  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})();
