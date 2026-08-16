/* render/camera.js - the renderer's view: zoom, projection, and world <-> screen.
   Part of rts.render, which owns every pixel. */

/* RED ALERT - render layer. Canvas 2D, sprite-based, pure top-down.

   This replaced a three.js renderer. The 3D version was the wrong medium: the games this
   is modelled on are 2D sprite games, and no amount of flattening the camera or shrinking
   footprints makes lit 3D geometry read as 1996 pixel art. The simulation was written with
   no renderer dependencies precisely so this swap was possible - src/core did not
   change by a single line.

   Everything is drawn at sprite resolution (24px per map cell) and blitted with image
   smoothing off, scaled by a whole number of pixels per cell. That integer scaling is what
   keeps pixels square and hard instead of blurry.

   Screen space is a straight top-down projection of the sim's x/z plane:
       screenX = (worldX - focus.x) * zoom + W/2
       screenY = (worldZ - focus.z) * zoom + H/2
   No tilt, no perspective. */

var _rtsR = null;

/* THE DEVICE PIXEL RATIO WAS CAPPED AT 2, AND THE REASON WAS NEVER WRITTEN DOWN.

   It is not performance - measured on an emulated iPhone 15 Pro, a frame at the top zoom costs
   3.92 ms against a 16.7 ms budget. It is the integer-scaling rule this file already states:
   art at a fixed density magnified by anything but a whole number of pixels resamples and the
   picture goes soft. The zoom ladder [12, 24, 48] multiplied by a dpr of 2 gives 24/48/96
   device pixels per cell, and against the 48-pixel sprite bake that is exactly 0.5x, 1x and
   2x - every zoom clean. At a dpr of 3 the same ladder gives 36/72/144, which is 0.75x, 1.5x
   and 3x: two of the three fractional. Capping at 2 kept the rule; it just did it by throwing
   away the display.

   And it throws away a lot of it. A 393x852 iPhone has a 1179x2556 panel; capping at 2 draws
   786x1104 and lets the browser stretch it 1.5x to fit, so every pixel on that phone is
   already blurred before any art is involved - 44% of the panel actually rendered.

   SO THE LADDER MOVES WITH THE DEVICE INSTEAD OF THE DEVICE BEING TRUNCATED TO THE LADDER.
   What has to hold is that `cell * dpr` divided by the sprite bake density (RTS_TS * RTS_PS)
   and by the terrain density (RTS_TS) is a whole number, or a clean half. A ladder is chosen
   per dpr so that it does, and e2e/resolution asserts it for every combination the game can
   produce rather than trusting this comment.

   At a dpr of 3 that is [16, 32, 48]: 48/96/144 device pixels per cell, so sprites land on
   1x/2x/3x and terrain on 2x/4x/6x. The top zoom keeps its apparent size exactly and carries
   1.5x more real pixels inside it; the widest zoom gives up a little map to stay sharp.

   The ladders for dpr 1 and 2 are the shipped [12, 24, 48] UNCHANGED, and deliberately so:
   both were already clean (12/24/48 device pixels at dpr 1 is 0.25x/0.5x/1x of the sprite bake,
   24/48/96 at dpr 2 is 0.5x/1x/2x - every one an exact power of two), so there is nothing to
   fix there and no reason to move a picture that is already right. Only dpr 3 and above, which
   could not be reached at all before, get a ladder of their own. */
var RTS_ZOOM_LADDERS = {
  1: [12, 24, 48],      /* 12/24/48 device px per cell - sprites 0.25x/0.5x/1x */
  2: [12, 24, 48],      /* 24/48/96 - sprites 0.5x/1x/2x. The shipped ladder. */
  3: [16, 32, 48],      /* 48/96/144 - sprites 1x/2x/3x, terrain 2x/4x/6x */
  4: [12, 24, 36]       /* 48/96/144 - the same densities, for a dpr-4 panel */
};
/* Whole ratios only, so `dpr` is rounded rather than trusted: a browser reporting 2.625 gets
   the dpr-3 ladder and renders at 3, which is sharper than 2 and still lands on whole pixels.
   Capped at 4 because beyond that the buffers stop being worth the pixels. */
function _rtsPickDpr() {
  var raw = window.devicePixelRatio || 1;
  return Math.max(1, Math.min(4, Math.round(raw)));
}
function _rtsZoomLadder(dpr) {
  return RTS_ZOOM_LADDERS[dpr] || RTS_ZOOM_LADDERS[2];
}

function _rtsRInit(cv) {
  var W = cv.clientWidth || 960, H = cv.clientHeight || 620;
  var dpr = _rtsPickDpr();
  /* The ladder is global because everything from the sidebar to the specs reads RTS_ZOOMS, and
     it is settled here because this is the first point at which the device is known. */
  RTS_ZOOMS = _rtsZoomLadder(dpr);
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  var g = cv.getContext('2d', { alpha: false });
  g.imageSmoothingEnabled = false;

  _rtsR = {
    cv: cv, g: g, W: W, H: H, dpr: dpr,
    focus: { x: _rtsWX(21), z: _rtsWX(87) },
    zi: RTS_ZOOM_DEF,            /* index into RTS_ZOOMS */
    cell: RTS_ZOOMS[RTS_ZOOM_DEF],
    dist: 0,                     /* derived: world height visible, kept for the UI + minimap */
    spr: _rtsSprites(),
    ghost: null, ghostKey: null,
    terrain: null
  };
  _rtsR.terrain = _rtsBakeTerrain(window._rtsG);
  _rtsApplyCam();
  return _rtsR;
}

function _rtsZoom() { return _rtsR.cell / RTS_TILE; }          /* screen px per world unit */
/* Zoom is not a free number. The art is 24 px per cell, so a screen cell of anything but
   24, its double or its half resamples every sprite by a fraction and the whole picture
   goes soft - which is exactly how the first pass looked. */
function _rtsApplyCam() {
  var R = _rtsR;
  R.zi = Math.max(0, Math.min(RTS_ZOOMS.length - 1, R.zi | 0));
  R.cell = RTS_ZOOMS[R.zi];
  R.dist = R.H / _rtsZoom();
}
function _rtsZoomStep(dir) {
  var R = _rtsR;
  if (!R) return;
  R.zi = Math.max(0, Math.min(RTS_ZOOMS.length - 1, R.zi + (dir > 0 ? 1 : -1)));
  _rtsApplyCam();
}
/* HOW MUCH WORLD IS ON SCREEN, which is not W/zoom by H/zoom in every camera. The focus
   clamp, the radar's view box and the audibility test all ask this, and all three were given
   the flat top-down answer even in 3D - where the tilt alone already made the visible strip
   1/cos(tilt) taller than they were told, and perspective widens the far end on top of that.
   The radar box was drawn a fifth short, the clamp let the map slide further off the top edge
   than it meant to, and distant fighting fell silent slightly too early. */
/* `cx`/`cz` are the CENTRE of what is visible, which is the focus under both orthographic
   cameras and is not under a perspective one: the trapezoid reaches 1.47 half-heights up the
   screen and 1.06 down it, so its middle sits a fifth of a half-height beyond the focus. A
   caller that wants a rectangle - the radar box is the one - must hang it there rather than on
   the focus, or it reports the view as looking further south than it is. */
function _rtsViewSpan() {
  var R = _rtsR, R3 = window._R3D, z = _rtsZoom();
  if (R3 && R3.on) {
    var vb = _r3dViewBounds();
    return { w: vb.x1 - vb.x0, h: vb.z1 - vb.z0,
             cx: (vb.x0 + vb.x1) / 2, cz: (vb.z0 + vb.z1) / 2 };
  }
  return { w: R.W / z, h: R.H / z, cx: R.focus.x, cz: R.focus.z };
}

/* WHICH CELLS THE CAMERA CAN SEE, as an index window with padding for sprites hanging over
   the edge. The 2D overlays that still run in 3D - the sea, the ore field - used to derive
   this from the zoom alone, which is the right answer for a top-down camera and for no other:
   under the tilt the strip is 1/cos(tilt) taller than that, and under perspective the far end
   is wider again. The visible sea was measured a row short at the top at the middle zoom and
   four rows short at the widest, and the missing rows were exactly the ones furthest from the
   camera - where a hole in the sea is least likely to be read as a bug and most likely to be
   read as the map just ending.

   Taken through the projection's own inverse at the four screen corners, so it is correct for
   whatever camera is mounted. In 2D that reduces to exactly the arithmetic it replaces, to the
   last bit - _rtsGroundAt at a corner IS focus +/- half the span - so nothing about the 2D
   frame moves. A corner past the horizon (which the shipped camera cannot produce, but a
   future one could) falls back to the whole map rather than to a wrong window. */
function _rtsCellWindow(padX, padZ) {
  var R = _rtsR, i, x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  var corners = [[0, 0], [R.W, 0], [0, R.H], [R.W, R.H]];
  for (i = 0; i < 4; i++) {
    var p = _rtsGroundAt(corners[i][0], corners[i][1]);
    if (!p) { x0 = z0 = -1e9; x1 = z1 = 1e9; break; }
    if (p.x < x0) x0 = p.x;
    if (p.x > x1) x1 = p.x;
    if (p.z < z0) z0 = p.z;
    if (p.z > z1) z1 = p.z;
  }
  return {
    tx0: Math.max(0, _rtsTX(x0) - padX), tx1: Math.min(RTS_N - 1, _rtsTX(x1) + padX),
    tz0: Math.max(0, _rtsTX(z0) - padZ), tz1: Math.min(RTS_N - 1, _rtsTX(z1) + padZ)
  };
}
/* THE PROJECTION CONTRACT, in both modes. Every input path and every overlay - picking,
   drag select, health bars, effects, the ghost - goes through these functions and nothing
   else, which is what makes the 3D mode a branch rather than a rewrite. If the GL shader and
   these ever disagree, clicks land beside units - e2e/r3dlive asserts the round trip.

   _rtsWorldToScreen IS THE CONTRACT. _rtsSX and _rtsSY are the SEPARABLE special case, and
   they are only sound while screenX depends on nothing but wx - true of a north-up
   orthographic camera and of nothing else. That held for as long as the 3D camera was welded
   north-up and flat-projected, which is exactly why the mode looked two-dimensional: no
   perspective divide, no yaw, a 35 degree lean and nothing else to tell a player the world
   has depth. The 3D camera has perspective now (render3d/gl3d.js), so screenX genuinely
   depends on z there and _rtsSX is the 2D form only.

   So the pair is no longer the interface. Every drawing site takes both coordinates through
   _rtsWorldToScreen, which returns a screen point AND the scale to draw at. The 2D renderer
   keeps the closed form below - it is genuinely orthographic and must not move a pixel.

   `scale` is 1 under the orthographic 2D camera and is what an overlay must multiply its size
   by under the perspective one: a health bar over a unit at the back of the view is smaller
   than the same bar at the front, and a caller that ignores it will draw bars that all match
   while the units under them do not. `behind` marks a point the camera cannot see, which an
   orthographic camera never produces and a perspective one does. */
function _rtsSX(wx) { return (wx - _rtsR.focus.x) * _rtsZoom() + _rtsR.W / 2; }
function _rtsSY(wz) {
  var R3 = window._R3D;
  if (R3 && R3.on) return _r3dSY(wz);
  return (wz - _rtsR.focus.z) * _rtsZoom() + _rtsR.H / 2;
}

function _rtsGroundAt(mx, my) {
  var R3 = window._R3D;
  if (R3 && R3.on) return _r3dGroundAt(mx, my);
  var R = _rtsR, z = _rtsZoom();
  return { x: (mx - R.W / 2) / z + R.focus.x, z: (my - R.H / 2) / z + R.focus.z };
}
function _rtsWorldToScreen(x, y, z) {
  var R3 = window._R3D;
  if (R3 && R3.on) return _r3dWorldToScreen(x, y, z);
  return { x: (x - _rtsR.focus.x) * _rtsZoom() + _rtsR.W / 2,
           y: (z - _rtsR.focus.z) * _rtsZoom() + _rtsR.H / 2 - (y || 0) * _rtsZoom() * 0.5,
           scale: 1, behind: false };
}
/* The ground-level case, which is most of them: a point on the map with no height of its own.

   "No height of its own" stopped meaning y = 0 when the terrain got relief. Every overlay the
   2D painter lays over the world arrives through here - selection brackets, health bars, the
   placement ghost, the effects the 3D pass does not own - and each is positioned by a point ON
   THE GROUND. Left at zero they would sit at sea level while the thing they belong to stood on
   a hill, and the further the hill the wider the gap.

   ONLY IN 3D. The 2D painter draws the terrain bake, which is flat and always was, and its own
   branch of _rtsWorldToScreen does lift by y - so handing it an elevation would slide every
   bracket up the screen away from the unit it belongs to. Relief is something the 3D mode has. */
function _rtsGroundToScreen(x, z) {
  var R3 = window._R3D;
  return _rtsWorldToScreen(x, (R3 && R3.on) ? _rtsElev(x, z) : 0, z);
}

/* Stamp RA's shroud tiles over the visible cells.

   Three states per cell, and they are NOT the same thing:
     unexplored  - never seen; fully black, and its neighbours get a shaped edge against it
     explored    - seen once, not currently watched; dimmed, no shape
     visible     - watched right now; nothing drawn

   The shaping is only ever computed against UNEXPLORED, because that is the boundary the eye
   reads as the edge of the map. Shaping the explored/visible boundary too would put hard
   diagonal wedges around every unit as it walks, which is noise rather than information. */

/* Stamp the moving sea over the baked terrain.

   The terrain canvas already holds a still frame of water; this repaints the cells that are
   water with whichever palette rotation is current. Only the ones on SCREEN - Archipelago has
   11407 water cells and perhaps 300 of them are in view.

   The tile variant per cell has to match what _mixPaintCell chose when the terrain was baked,
   or the sea visibly re-shuffles the moment the overlay starts: same hash, same seed, same
   `+137`. That coupling is the price of not re-baking a 3072x3072 canvas four times a second. */

