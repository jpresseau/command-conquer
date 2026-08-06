/* The sprite baker's geometry and projection.

   Nothing renders in 3D at runtime - this rasteriser runs once at load and the game is a 2D
   sprite engine from then on. Which means every one of these numbers is baked into art the
   player looks at for the whole match, and a mistake here is not a glitch that flickers past:
   it is a building permanently half a tile off its own footprint.

   All of this is pure. Faces are arrays of points, the projection is two lines of arithmetic,
   and the colour ramp is a function of one number - so it runs in plain node in milliseconds,
   with no canvas. The rasteriser itself needs a canvas and lives in test/e2e/r3d. */

var { Suite } = require('../lib/assert.js');
var { load } = require('../lib/sandbox.js');

var S = new Suite('r3d');
var g = load(['src/rts.r3d.js']);
var K = g.R3_K;

/* The projection, restated here rather than imported, so the test disagrees with the source
   if either drifts: screenX = x, screenY = z - K*y. */
function projX(p) { return p[0]; }
function projY(p) { return p[2] - K * p[1]; }

S.note('K = ' + K + ' (screen rise per unit of model height), supersample ' + g.R3_SS + 'x');

/* ------------------------------------------------------------------ colours ---- */
(function () {
  S.eq('a hex colour parses to r,g,b', JSON.stringify(g._r3Hex('#ff8000')), '[255,128,0]');
  S.eq('...including black', JSON.stringify(g._r3Hex('#000000')), '[0,0,0]');
  S.eq('...and white', JSON.stringify(g._r3Hex('#ffffff')), '[255,255,255]');
})();

/* ------------------------------------------------------------------- a box ----
   With no yaw the +x and -x faces are exactly edge-on and never visible, which the header
   states outright - so a box is top and front only, not six faces. If that ever became six,
   every model would pay for geometry that cannot be seen. */
(function () {
  var f = [];
  g._r3Box(f, 0, 0, 0, 10, 20, 30, '#804020', '#a06030');
  S.ok('a box makes a handful of faces, not six', f.length <= 5, f.length + ' faces');
  f.forEach(function (face, i) {
    S.ok('face ' + i + ' is a polygon with at least 3 points', face.v.length >= 3, face.v.length + ' points');
  });
  var b = g._r3Bounds(f);
  /* the box is centred on x, so its screen width is exactly its w */
  S.near('a 10-wide box is 10 screen pixels wide', b.x1 - b.x0, 10, 0.001);
  /* and its screen height is its depth plus its height times K */
  S.near('...and (depth + K*height) tall', b.y1 - b.y0, 30 + K * 20, 0.001);
})();

/* --------------------------------------------------------------- projection ----
   THE GROUND PLANE IS NOT FORESHORTENED. This is the invariant the whole footprint system
   rests on: a 3x3 structure has to cover exactly 72x72 art pixels, so any tilt that squashed
   the ground would misalign every building on the map against its own tiles. */
(function () {
  var flat = [];
  /* a zero-height slab covering a 3x3 footprint at 24 art pixels per cell */
  g._r3Box(flat, 0, 0, 0, 72, 0.0001, 72, '#404040', '#404040');
  var b = g._r3Bounds(flat);
  S.near('a 72-wide footprint is 72 pixels wide on screen', b.x1 - b.x0, 72, 0.01);
  S.near('...and 72 deep is 72 pixels tall, with no foreshortening', b.y1 - b.y0, 72, 0.01);

  /* height goes straight up, and ONLY up */
  var tall = [];
  g._r3Box(tall, 0, 25, 0, 72, 50, 72, '#404040', '#404040');
  var t = g._r3Bounds(tall);
  S.near('height does not change the screen WIDTH at all', t.x1 - t.x0, 72, 0.01);
  S.near('...it adds exactly K x height to the screen height', t.y1 - t.y0, 72 + K * 50, 0.01);

  /* the two lines of the projection, on a point */
  S.near('screenX is x', projX([7, 11, 13]), 7, 1e-9);
  S.near('screenY is z - K*y', projY([7, 11, 13]), 13 - K * 11, 1e-9);
  /* points along (0,1,K) land on the same pixel - that is the view ray, and the reason depth
     is measured as y + K*z */
  S.near('points along the view ray project to the same screen y',
         projY([0, 5, 5 * K]) - projY([0, 0, 0]), 0, 1e-9);
})();

/* ------------------------------------------------------------------- shapes ----
   Each builder has to produce geometry at the size it was asked for. A cylinder that comes
   out at half its radius is a model that looks subtly wrong everywhere and is very hard to
   trace back from the sprite. */
(function () {
  function widthOf(fn) {
    var f = [];
    fn(f);
    var b = g._r3Bounds(f);
    return { w: b.x1 - b.x0, h: b.y1 - b.y0, n: f.length };
  }
  var cyl = widthOf(function (f) { g._r3Cyl(f, 0, 0, 0, 8, 20, '#555', '#777', 16); });
  S.near('a radius-8 cylinder is 16 wide', cyl.w, 16, 0.5);
  S.ok('...and is built from many faces, so it reads round', cyl.n >= 16, cyl.n + ' faces');

  var cone = widthOf(function (f) { g._r3Cone(f, 0, 0, 0, 10, 2, 15, '#555', 16); });
  S.near('a cone takes its width from the wider end', cone.w, 20, 0.6);

  var slab = widthOf(function (f) { g._r3Slab(f, 0, 0, 0, 30, 10, 20, 2, '#555', '#777'); });
  S.near('a bevelled slab is still the width it was asked for', slab.w, 30, 0.01);

  var gable = widthOf(function (f) { g._r3Gable(f, 0, 0, 0, 24, 12, 36, '#555'); });
  S.near('a gable roof is the width it was asked for', gable.w, 24, 0.01);

  var hip = widthOf(function (f) { g._r3Hip(f, 0, 0, 0, 24, 12, 36, 4, '#555'); });
  S.near('a hip roof too', hip.w, 24, 0.01);

  var vault = widthOf(function (f) { g._r3Vault(f, 0, 0, 0, 24, 12, 36, '#555', 12, true); });
  S.near('a barrel vault too', vault.w, 24, 0.5);
  S.ok('...and is segmented rather than faceted into a wedge', vault.n >= 10, vault.n + ' faces');
})();

/* --------------------------------------------------------------------- yaw ----
   Units are yawed - that is what the eight facings ARE - so this is the one transform whose
   correctness the player sees eight times per unit. */
(function () {
  /* _r3Box takes the BASE height in y, not the centre, so this box spans y 0..10 */
  function box() { var f = []; g._r3Box(f, 0, 0, 0, 30, 10, 10, '#555', '#777'); return f; }

  var zero = g._r3Bounds(box());
  var b90 = g._r3Bounds(g._r3Yaw(box(), Math.PI / 2));
  S.near('a quarter turn swaps a 30x10 box\'s width and depth', b90.x1 - b90.x0, 10, 0.01);
  S.near('...and its screen height picks up the 30', b90.y1 - b90.y0, 30 + (zero.y1 - zero.y0) - 10, 0.5);

  var bf = g._r3Bounds(g._r3Yaw(box(), Math.PI * 2));
  S.near('a full turn comes back to where it started (width)', bf.x1 - bf.x0, zero.x1 - zero.x0, 0.01);
  S.near('...and height', bf.y1 - bf.y0, zero.y1 - zero.y0, 0.01);

  /* yaw must not lift or drop anything - it is rotation about the vertical axis only */
  var side = g._r3Yaw(box(), 0.7);
  var maxY = -1e9, minY = 1e9;
  side.forEach(function (fc) { fc.v.forEach(function (p) { if (p[1] > maxY) maxY = p[1]; if (p[1] < minY) minY = p[1]; }); });
  S.near('yaw leaves every point at its original height (max)', maxY, 10, 1e-9);
  S.near('...and (min)', minY, 0, 1e-9);

  /* a transform that edited the model in place would corrupt the source model, and every
     facing after the first would be built from an already-rotated one */
  var src = box(), srcX = src[0].v[0][0];
  g._r3Yaw(src, 0.9);
  S.near('yaw leaves the model it was given untouched', src[0].v[0][0], srcX, 1e-9);

  /* Eight facings must be eight DIFFERENT pictures, or the unit does not appear to turn.
     What that can be measured against matters: a bare box is symmetric front-to-back, so
     facings 180 degrees apart have an IDENTICAL projection and a bounding box only ever
     takes three values across the eight. Measuring a box would therefore let a broken yaw
     look correct. A real unit is not symmetric - it has a turret sitting forward of centre -
     so the model here has one too, and the signature is the projected outline itself. */
  function tank() {
    var f = [];
    g._r3Box(f, 0, 0, 0, 30, 10, 16, '#555', '#777');      /* hull */
    g._r3Box(f, 0, 10, 5, 12, 7, 10, '#666', '#888');      /* turret, forward of centre */
    return f;
  }
  function outline(faces) {
    var pts = [];
    faces.forEach(function (fc) {
      fc.v.forEach(function (p) {
        pts.push(Math.round(p[0] * 16) + ',' + Math.round((p[2] - g.R3_K * p[1]) * 16));
      });
    });
    return pts.sort().join(' ');
  }
  var sigs = {}, boxes = {};
  for (var i = 0; i < 8; i++) {
    var yawed = g._r3Yaw(tank(), i / 8 * Math.PI * 2);
    sigs[outline(yawed)] = 1;
    var b = g._r3Bounds(yawed);
    boxes[[Math.round((b.x1 - b.x0) * 100), Math.round((b.y1 - b.y0) * 100)].join(':')] = 1;
  }
  S.eq('the eight facings give eight different projected outlines', Object.keys(sigs).length, 8);
  S.ok('...with at least four distinct silhouette sizes among them', Object.keys(boxes).length >= 4,
       Object.keys(boxes).length + ' distinct bounding boxes across 8 facings');
})();

/* ------------------------------------------------------------------- scale ---- */
(function () {
  var f = []; g._r3Box(f, 0, 0, 0, 20, 20, 20, '#555', '#777');
  var before = g._r3Bounds(f);
  var after = g._r3Bounds(g._r3Scale(f, 2));
  S.near('scaling by 2 doubles the screen width', after.x1 - after.x0, (before.x1 - before.x0) * 2, 0.01);
  S.near('...and the screen height', after.y1 - after.y0, (before.y1 - before.y0) * 2, 0.01);
  /* the point of the header comment: proportions must not change with size */
  S.near('...leaving the aspect ratio exactly as authored',
         (after.x1 - after.x0) / (after.y1 - after.y0),
         (before.x1 - before.x0) / (before.y1 - before.y0), 1e-9);
  var mid = g._r3Bounds(f);
  S.near('scale does not edit the model it was given', mid.x1 - mid.x0, before.x1 - before.x0, 1e-9);
})();

/* -------------------------------------------------------------- the ramp ----
   The header is explicit that multiplying toward black - the obvious way to shade - drains
   the colour out of every shaded face, and that the ramp exists to stop that. So the test is
   not "does it get darker", it is "does it STAY COLOURED while getting darker". */
(function () {
  var out = [], base = [200, 60, 40];          /* a saturated red */
  function sat(c) { return Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]); }

  g._r3Ramp(base, 1, out);
  var lit = out.slice();
  g._r3Ramp(base, 0.35, out);
  var shade = out.slice();
  g._r3Ramp(base, 1.8, out);
  var hot = out.slice();

  S.ok('a lit-ness of 1 is close to the base colour',
       Math.abs(lit[0] - base[0]) < 12 && Math.abs(lit[1] - base[1]) < 12,
       lit.map(Math.round).join(','));
  S.ok('shadow is darker than lit', shade[0] < lit[0], shade.map(Math.round).join(',') + ' vs ' + lit.map(Math.round).join(','));
  S.ok('highlight is brighter than lit', hot[0] > lit[0], hot.map(Math.round).join(','));

  /* the point of the ramp: a shadow that is not grey */
  S.ok('the shadow keeps its colour rather than sliding to grey', sat(shade) > sat(base) * 0.35,
       'saturation ' + Math.round(sat(shade)) + ' against the base\'s ' + Math.round(sat(base)));
  /* multiplying toward black is what it must NOT look like */
  var mul = [base[0] * 0.35, base[1] * 0.35, base[2] * 0.35];
  S.ok('...and is not simply the base multiplied down', Math.abs(shade[2] - mul[2]) > 4,
       'ramp blue ' + Math.round(shade[2]) + ' vs multiply ' + Math.round(mul[2]));
  /* shadows shift cool, highlights warm - stated in the source, so held to it */
  S.ok('the shadow shifts cool', (shade[2] / (shade[0] || 1)) > (base[2] / base[0]),
       'blue:red ' + (shade[2] / shade[0]).toFixed(2) + ' against ' + (base[2] / base[0]).toFixed(2));
  /* "warm" is a property of what the highlight lifts TOWARD, so it has to be measured from a
     neutral colour - lifting an already-red base necessarily lowers its red:blue ratio as it
     converges on the target, which says nothing about whether the target is warm. */
  var grey = [128, 128, 128];
  g._r3Ramp(grey, 1.8, out);
  var hotGrey = out.slice();
  S.ok('the highlight shifts warm - a neutral face lifts to a warm one, not to white',
       hotGrey[0] > hotGrey[2] + 4,
       hotGrey.map(Math.round).join(',') + ' from a neutral 128,128,128');
  g._r3Ramp(grey, 0.35, out);
  var coldGrey = out.slice();
  S.ok('...and the matching shadow on that same neutral face goes cool',
       coldGrey[2] > coldGrey[0] + 4, coldGrey.map(Math.round).join(','));

  /* and nothing may leave the byte range, at any input */
  var bad = [];
  [-1, 0, 0.001, 0.5, 1, 1.5, 2, 10].forEach(function (v) {
    [[0, 0, 0], [255, 255, 255], [200, 60, 40]].forEach(function (c) {
      g._r3Ramp(c, v, out);
      for (var i = 0; i < 3; i++) if (!(out[i] >= -0.5 && out[i] <= 255.5)) bad.push('v=' + v + ' -> ' + out[i]);
    });
  });
  S.ok('the ramp never leaves the 0..255 range, for any lit-ness', !bad.length,
       bad.slice(0, 4).join('; ') || 'checked 8 lit-ness values x 3 colours');
})();

/* ------------------------------------------------------------ the dither ---- */
(function () {
  var b = g.R3_BAYER;
  S.eq('the ordered dither is a 4x4 matrix', b.length, 16);
  var sorted = b.slice().sort(function (x, y) { return x - y; });
  S.eq('...using each of 0..15 exactly once', sorted.join(','), '0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15');
})();

require('../lib/report.js')(S);
