/* render/camera.js - the renderer's view: zoom, projection, and world <-> screen.
   Part of rts.render, which owns every pixel. */

/* BREACHWATER - the camera: the zoom ladder, the overlay canvas, and the projection contract.

   The world is drawn in WebGL (render3d/) under a leaned, turnable camera (render3d/cam3d.js).
   This file owns what everything else asks of that camera - _rtsWorldToScreen, _rtsGroundAt,
   _rtsGroundToScreen, _rtsViewSpan - so input, the overlay and the HUD reach the screen through
   the same numbers the shaders use. Each keeps a flat top-down fallback for the moments before
   the GL context exists (and for node specs): screenX = (worldX - focus.x) * zoom + W/2. */

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

/* THE LADDER GOES FURTHER IN THAN THE BASE TABLES. Those stop where a SPRITE would have to
   land on a whole multiple of its bake, or the picture resamples and goes soft - which is
   what the comment above is about, and it still holds for the overlay's effects sprites.

   There are no sprites for the things you would zoom in to look at. A unit is geometry:
   its edges are rounded, its wheels turn on their axles and its running gear is modelled (see
   r3d/curves.js), and none of that survives being drawn at 48 pixels a cell. The models were
   made denser and there was no way to see it, which is the complaint this answers.

   WHAT DOES SOFTEN IS THE LEGACY GROUND, because that terrain really is a texture. That
   is not a new problem and it is already answered: render/detail.js restores the frequencies
   magnification loses, gated at RTS_DETAIL_MIN_MAG, and these steps are squarely inside what
   that pass was built for. Whole multiples of the top base step, so the terrain magnifies by a
   clean factor at every one of them. */
var RTS_ZOOM_3D_EXTRA = [2, 4];
/* HOW MANY RUNGS THE BASE LADDER HAS, so that "the closest zoom" can be said two
   different ways and mean the right one each time. RTS_ZOOMS.length - 1 is the closest rung
   THERE IS, which is what a player's pinch should reach; several specs used it to mean the
   magnification their numbers were calibrated at, which was the top of the base ladder and is
   not the same thing. A proxy that silently changes meaning is the failure this
   project keeps finding, so both readings get a name. */
var RTS_ZOOM_BASE_STEPS = 3;
function _rtsZoomLadder(dpr) {
  var base = RTS_ZOOM_LADDERS[dpr] || RTS_ZOOM_LADDERS[2];
  /* the constant above is a claim about these tables; unit/zoom holds them to it */
  var top = base[base.length - 1], out = base.slice(), i;
  for (i = 0; i < RTS_ZOOM_3D_EXTRA.length; i++) out.push(top * RTS_ZOOM_3D_EXTRA[i]);
  return out;
}
function _rtsIn3D() { return !!(window._R3D && window._R3D.on); }

function _rtsRInit(cv) {
  var W = cv.clientWidth || 960, H = cv.clientHeight || 620;
  var dpr = _rtsPickDpr();
  /* The ladder is global because everything from the sidebar to the specs reads RTS_ZOOMS, and
     it is settled here because this is the first point at which the device is known. */
  RTS_ZOOMS = _rtsZoomLadder(dpr);
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  /* WITH ALPHA, and it is load-bearing: in 3D this canvas is a transparent overlay above the
     presented GL layer, and a context created alpha:false can never be transparent - clearRect
     leaves opaque black, which put a black sheet over the whole world the moment the blit
     stopped. Context attributes are fixed at first getContext. */
  var g = cv.getContext('2d', { alpha: true });
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
  R.zf = R.zt = R.zi;            /* snapped: no smooth zoom in flight (ui/navigate.js) */
  R.dist = R.H / _rtsZoom();
}
/* BETWEEN THE RUNGS. The world is geometry, so the wheel glides through the ladder instead of
   jumping it in doublings. `f` is a fractional index into RTS_ZOOMS, interpolated geometrically, so each
   step of it is the same ratio of magnification wherever it is. */
function _rtsCellAt(f) {
  var n = RTS_ZOOMS.length, i0 = Math.max(0, Math.min(n - 1, Math.floor(f))), i1 = Math.min(n - 1, i0 + 1);
  var k = Math.max(0, Math.min(1, f - i0));
  return RTS_ZOOMS[i0] * Math.pow(RTS_ZOOMS[i1] / RTS_ZOOMS[i0], k);
}
function _rtsApplyCamF() {
  var R = _rtsR, n = RTS_ZOOMS.length;
  R.zf = Math.max(0, Math.min(n - 1, R.zf));
  R.zi = Math.round(R.zf);
  R.cell = _rtsCellAt(R.zf);
  R.dist = R.H / _rtsZoom();
}
/* Re-derive the camera after something changed under it - the focus clamp every frame, a
   resize - WITHOUT snapping a smooth 3D zoom to its rung: its place between the rungs and where
   it is headed survive. It is only its own while the rung it rounds to is still R.zi; anything
   that set the zoom some other way has changed R.zi, and is snapped to as it always was. */
function _rtsReapplyCam() {
  var R = _rtsR, own = _rtsIn3D() && R.zf !== undefined && Math.round(R.zf) === R.zi, zt = R.zt;
  if (own && R.zf !== R.zi) _rtsApplyCamF(); else _rtsApplyCam();
  if (own && zt !== undefined) R.zt = zt;
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
    /* w/h are the box the turned trapezoid fills in the WORLD, which is exactly what the clamp
       needs (a shape moved without turning is inside the map when its box is); `poly` is the
       trapezoid itself for the radar, and `cw` its width across the camera, for audibility */
    return { w: vb.x1 - vb.x0, h: vb.z1 - vb.z0,
             cx: (vb.x0 + vb.x1) / 2, cz: (vb.z0 + vb.z1) / 2,
             poly: vb.poly, cw: vb.cw, ch: vb.cv1 - vb.cv0 };
  }
  return { w: R.W / z, h: R.H / z, cx: R.focus.x, cz: R.focus.z };
}

/* THE PROJECTION CONTRACT. Every input path and every overlay - picking, drag select, health
   bars, effects, the placement outline - goes through these functions and nothing else, and
   they hand over to the 3D camera's own (render3d/gl3d.js). If the shader and these ever
   disagree, clicks land beside units - e2e/r3dlive asserts the round trip. `scale` is what an
   overlay multiplies its size by: a health bar over a unit at the back of the view is smaller
   than the same bar at the front. `behind` marks a point the camera cannot see.

   The flat formulas after each 3D call answer only before the 3D context exists - while the
   match is being set up, and in the node specs, which have no GL. Nothing is drawn with them. */
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

   "No height of its own" stopped meaning y = 0 when the terrain got relief. Every overlay laid
   over the world arrives through here - health bars, the placement ghost, the effects the 3D
   pass does not own - and each is positioned by a point ON
   THE GROUND. Left at zero they would sit at sea level while the thing they belong to stood on
   a hill, and the further the hill the wider the gap.

   Before the GL context exists (node specs) the flat fallback takes no elevation, because its
   own branch of _rtsWorldToScreen lifts by y. */
function _rtsGroundToScreen(x, z) {
  var R3 = window._R3D;
  return _rtsWorldToScreen(x, (R3 && R3.on) ? _rtsElev(x, z) : 0, z);
}

/* WHERE A UNIT IS DRAWN, which for an aircraft is not where it is. A helicopter is lifted off its
   ground position by its altitude - render/draw.js in pixels, render3d/unit3d.js in world units,
   both through _rtsAirLift (core/airspace.js) - so a click on the machine you can see lands on ground well behind
   it. Picking (render/post.js) and the drag box (ui/select.js) ask here, and an Attack Heli is
   selectable where it is drawn instead of only where its shadow falls. */
function _rtsScreenOf(e) {
  var R3 = window._R3D;
  if (!e.air) return _rtsWorldToScreen(e.x, 1, e.z);
  if (R3 && R3.on) return _rtsWorldToScreen(e.x, _rtsElev(e.x, e.z) + _rtsAirLift(e) * 0.35, e.z);
  var up = _rtsGroundToScreen(e.x, e.z);
  return { x: up.x, y: up.y - _rtsAirLift(e) * (_rtsR.cell / RTS_TS) * (up.scale || 1), scale: up.scale, behind: up.behind };
}
/* ...and how many pixels a world unit spans there, for a radius measured on the screen */
function _rtsPxPerUnit(e) {
  var s0 = _rtsScreenOf(e), s1 = _rtsScreenOf({ x: e.x + 1, z: e.z, air: e.air, alt: e.alt, rearming: e.rearming }),
      s2 = _rtsScreenOf({ x: e.x, z: e.z + 1, air: e.air, alt: e.alt, rearming: e.rearming });
  return Math.max(1e-3, Math.hypot(s1.x - s0.x, s1.y - s0.y), Math.hypot(s2.x - s0.x, s2.y - s0.y));
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

