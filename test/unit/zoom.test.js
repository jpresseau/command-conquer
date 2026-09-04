/* The zoom ladder — src/render/camera.js.

   Zoom is not a free number. The art is 24 pixels per cell, so a screen cell of anything but
   24, its double or its half resamples every sprite by a fraction and the whole picture goes
   soft. That is why there is a ladder at all, and why it is chosen per device pixel ratio.

   IN 3D THAT CONSTRAINT DOES NOT BIND, which is what RTS_ZOOM_3D_EXTRA is for. The things you
   would zoom in to look at are not sprites there - a unit is geometry, with rounded edges and
   wheels that turn on their axles - and none of that survives being drawn at 48 pixels a cell.
   The models were made denser and there was no way to see it.

   What the ground does is the honest cost, and it is not new: the terrain is a texture in both
   modes, so it magnifies. render/detail.js is the pass that restores what magnification loses,
   and these rungs are inside what it was built for. */

var { Suite } = require('../lib/assert.js');
var { load } = require('../lib/sandbox.js');

var S = new Suite('zoom');
var g = load(['src/rules', 'src/r3d', 'src/sprites', 'src/render']);

/* ------------------------------------------------------------- the 2D ladder ----*/
(function () {
  var dprs = Object.keys(g.RTS_ZOOM_LADDERS);
  S.ok('there is a ladder for every device pixel ratio the game will pick', dprs.length >= 4,
       'dpr ' + dprs.join(', '));

  /* RTS_ZOOM_2D_STEPS is a claim about these tables and several specs now pin themselves to
     it, so it is checked against them rather than trusted. */
  var wrong = dprs.filter(function (d) {
    return g.RTS_ZOOM_LADDERS[d].length !== g.RTS_ZOOM_2D_STEPS;
  });
  S.eq('every one of them has RTS_ZOOM_2D_STEPS rungs', wrong.join(',') || 'none', 'none');

  dprs.forEach(function (d) {
    var lad = g._rtsZoomLadder(+d, false);
    S.eq('dpr ' + d + ' in 2D is the shipped ladder, untouched',
         lad.join(','), g.RTS_ZOOM_LADDERS[d].join(','));
  });
})();

/* ------------------------------------------------------------- the 3D ladder ----*/
(function () {
  Object.keys(g.RTS_ZOOM_LADDERS).forEach(function (d) {
    var flat = g._rtsZoomLadder(+d, false), deep = g._rtsZoomLadder(+d, true);
    S.eq('dpr ' + d + ' in 3D keeps every 2D rung and adds to them',
         deep.slice(0, flat.length).join(','), flat.join(','));

    /* WHOLE MULTIPLES OF THE TOP 2D RUNG. The ladder exists so that a screen cell is a clean
       ratio of the art; the extra rungs are further in than the sprites can follow, but the
       TERRAIN is still a texture and still wants a clean factor to magnify by. */
    var top = flat[flat.length - 1], extra = deep.slice(flat.length);
    S.eq('...' + extra.length + ' of them, each a whole multiple of the closest 2D rung',
         extra.map(function (v) { return v / top; }).join(','),
         g.RTS_ZOOM_3D_EXTRA.join(','));
    var ints = extra.every(function (v) { return v % top === 0; });
    S.ok('...so the terrain magnifies by a whole number at every rung', ints,
         flat.join('/') + ' then ' + extra.join('/'));
  });

  var d2 = g._rtsZoomLadder(2, true);
  S.ok('the closest 3D rung is several times closer than 2D can reach',
       d2[d2.length - 1] >= g._rtsZoomLadder(2, false).pop() * 3,
       d2.join(', ') + ' css px per cell - a unit is about a cell and a half across');

  /* strictly increasing, or the pinch and the wheel would step sideways */
  var bad = 0;
  for (var i = 1; i < d2.length; i++) if (d2[i] <= d2[i - 1]) bad++;
  S.eq('the rungs only ever go one way', bad, 0);
})();

require('../lib/report.js')(S);
