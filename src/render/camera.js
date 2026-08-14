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

function _rtsRInit(cv) {
  var W = cv.clientWidth || 960, H = cv.clientHeight || 620;
  var dpr = Math.min(2, window.devicePixelRatio || 1);
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
function _rtsViewSpan() {
  var R = _rtsR, z = _rtsZoom();
  return { w: R.W / z, h: R.H / z };
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
   has depth.

   So the pair is no longer the interface. Every drawing site takes both coordinates through
   _rtsWorldToScreen, which returns a screen point AND the scale to draw at, and is free to
   make screenX depend on z. The 2D renderer keeps the closed form below - it is genuinely
   orthographic and must not move a pixel - and the 3D one is free to stop being separable.

   `scale` is 1 under any orthographic camera and is what an overlay must multiply its size
   by under a perspective one: a health bar over a unit at the back of the view is smaller
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
/* The ground-level case, which is most of them: a point on the map with no height. */
function _rtsGroundToScreen(x, z) { return _rtsWorldToScreen(x, 0, z); }

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

