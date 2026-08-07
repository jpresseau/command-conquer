/* r3d/primitives.js - the projection, the lighting constants, and the solids every model
   is built from: boxes, slabs, cylinders, cones, roofs, plus yaw/scale/bounds.
   Part of rts.r3d, the little 3D renderer that bakes the sprites. */

/* RED ALERT - the sprite baker: a tiny 3D renderer that runs once, at load.

   This is how the games this is modelled on actually made their art. Westwood did not draw
   those units and buildings pixel by pixel - they built them as 3D models, rendered each one
   to a bitmap at a fixed camera angle and light, and shipped the bitmaps. That is why the
   originals have real volume, flat facets and hard cast shadows while still being a 2D
   sprite game. Hand-drawn pixel art does not look like that, and an earlier pass here spent
   a long time proving it.

   So: models are defined in 3D below, rendered here into canvases at startup, and from that
   point on the game is exactly the 2D sprite engine it already was. Nothing renders in 3D at
   runtime - there is no WebGL context, no library and no per-frame cost.

   PROJECTION. Oblique, not perspective and not isometric:

       screenX = x
       screenY = z - K*y

   The ground plane is deliberately NOT foreshortened. A building's footprint has to land on
   exactly its tiles - a 3x3 structure must cover 72x72 art pixels - and any tilt that
   squashes the ground breaks that alignment. Height instead projects straight upward, which
   is the same trick the originals used: square map cells, with the structure's bulk drawn
   above its footprint.

   A consequence worth knowing: with no yaw, the +x and -x faces of an axis-aligned box are
   exactly edge-on and never visible. Boxes therefore read as top + front only. That is fine
   and is what the reference looks like - the form comes from cylinders, sloped roofs and
   chamfers, not from seeing three faces of every cube. Units DO get yawed (that is what the
   eight facings are), so their sides show.

   DEPTH. Points along (0, 1, K) all project to the same pixel, so that is the view ray, and
   `y + K*z` increases toward the camera. Every pixel is depth-tested against it, so models
   can interpenetrate freely without any face sorting. */

/* How far a unit of model height climbs the screen. This one constant decides whether a
   building reads as a volume or as a plate lying on the grass, and 0.8 was much too low: a
   50-unit-tall structure rose only 40px above a 72px footprint, so the roof dominated the
   sprite and the walls were a thin band beneath it. At 1.3 the same models show a real front
   elevation and the silhouettes that were already built into them become visible.

   Raising it cannot break footprint alignment, because the ground plane is not foreshortened
   at all - K multiplies HEIGHT only. The extra rise lands in `head`, the headroom above the
   footprint that _r3BakeFootprint measures and the renderer offsets by, so a 3x3 building
   still covers exactly its 72x72 pixels of ground. */
var R3_K = 1.3;
var R3_AMB = 0.34, R3_DIF = 0.70;     /* ambient / diffuse split. Ambient lifted a little:
                                         the Remaster's shadowed faces are readable, not
                                         black, because it is not working inside a 256-colour
                                         palette and does not have to spend its range on
                                         darks. */
/* Quantisation steps. This was 9, chosen when the target was the 1996 sprites - "period
   renderers banded, and banding also keeps the palette tight" - and at 9 steps every curved
   surface shows visible contour rings.

   The target is now the Remastered art, and posterisation is the single clearest difference
   between the two. The Remaster is redrawn at high resolution with smooth shading; the 1996
   sprites are hard bands out of a fixed palette. Raising this to 28 is most of what moves
   the look from one to the other, and it costs nothing - it is a divisor in the shading
   pass, not more geometry or more pixels.

   It only became worth raising once the renderer supersampled. At 1:1 a fine ramp just
   dithers into noise; averaging 3x3 samples first is what lets the extra steps resolve. */
var R3_STEPS = 28;
/* Upper-left and IN FRONT. The z component has to be positive: a front-facing wall has
   normal +z, and it is the face the camera sees most of. A first attempt lit from behind
   (-z) and every building came out with its whole front elevation sitting at flat ambient,
   reading as a black slab under a blown-out white roof. */
var R3_LIGHT = (function () {
  var l = [-0.38, 0.76, 0.53], m = Math.hypot(l[0], l[1], l[2]);
  return [l[0] / m, l[1] / m, l[2] / m];
})();
var R3_VIEW = (function () {
  var m = Math.hypot(0, 1, R3_K);
  return [0, 1 / m, R3_K / m];
})();

function _r3Hex(h) {
  var n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
/* A face is a convex polygon of 3D points plus a base colour. */
function _r3F(out, verts, col) { out.push({ v: verts, c: _r3Hex(col) }); }

/* --------------------------------------------------------------- primitives --
   All take the centre of the footprint and the BASE height, because everything in these
   models sits on something else - working from centres in y makes every offset a sum. */
function _r3Box(out, x, y, z, w, h, d, col, topCol) {
  var x0 = x - w / 2, x1 = x + w / 2, y0 = y, y1 = y + h, z0 = z - d / 2, z1 = z + d / 2;
  _r3F(out, [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]], topCol || col);   /* top */
  _r3F(out, [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], col);             /* front */
  _r3F(out, [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], col);             /* back */
  _r3F(out, [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], col);             /* right */
  _r3F(out, [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], col);             /* left */
}
/* A block with a CHAMFERED top - vertical walls, then four slopes running inward to an
   inset roof. This is the workhorse for structures and it exists for one reason: with no
   yaw, a plain box presents exactly two faces, top and front, so its roof is a single flat
   polygon of a single colour and the whole building reads as a shed. The chamfer splits the
   roof edge into four planes at four angles, which the light then separates into four
   distinct tones - front bright, back dim, and the two sides in between. That rim of
   graded facets is most of what makes a pre-rendered structure look solid. */
function _r3Slab(out, x, y, z, w, h, d, bev, col, topCol) {
  bev = Math.max(1, Math.min(bev, Math.min(w, d) / 2 - 1, h - 1));
  var yw = y + h - bev, yt = y + h;
  var x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2;
  var ix0 = x0 + bev, ix1 = x1 - bev, iz0 = z0 + bev, iz1 = z1 - bev;
  _r3F(out, [[x0, y, z1], [x1, y, z1], [x1, yw, z1], [x0, yw, z1]], col);          /* walls */
  _r3F(out, [[x1, y, z0], [x0, y, z0], [x0, yw, z0], [x1, yw, z0]], col);
  _r3F(out, [[x1, y, z1], [x1, y, z0], [x1, yw, z0], [x1, yw, z1]], col);
  _r3F(out, [[x0, y, z0], [x0, y, z1], [x0, yw, z1], [x0, yw, z0]], col);
  _r3F(out, [[x0, yw, z1], [x1, yw, z1], [ix1, yt, iz1], [ix0, yt, iz1]], col);    /* chamfers */
  _r3F(out, [[x1, yw, z0], [x0, yw, z0], [ix0, yt, iz0], [ix1, yt, iz0]], col);
  _r3F(out, [[x1, yw, z1], [x1, yw, z0], [ix1, yt, iz0], [ix1, yt, iz1]], col);
  _r3F(out, [[x0, yw, z0], [x0, yw, z1], [ix0, yt, iz1], [ix0, yt, iz0]], col);
  _r3F(out, [[ix0, yt, iz0], [ix0, yt, iz1], [ix1, yt, iz1], [ix1, yt, iz0]], topCol || col);
}

/* Upright cylinder. Enough segments that it reads round rather than faceted, but the flat
   shading still bands it, which is exactly the period look. */
function _r3Cyl(out, x, y, z, r, h, col, topCol, seg) {
  seg = seg || 14;
  var top = [], i, a, b;
  for (i = 0; i < seg; i++) {
    a = (i / seg) * Math.PI * 2; b = ((i + 1) / seg) * Math.PI * 2;
    var ax = x + Math.cos(a) * r, az = z + Math.sin(a) * r;
    var bx = x + Math.cos(b) * r, bz = z + Math.sin(b) * r;
    /* b before a: the other winding makes every side normal point INWARD, which survives
       backface culling by showing the far wall of the cylinder's interior. Stacks came out
       as dark discs because of exactly that. */
    _r3F(out, [[bx, y, bz], [ax, y, az], [ax, y + h, az], [bx, y + h, bz]], col);
    top.push([ax, y + h, az]);
  }
  top.reverse();
  _r3F(out, top, topCol || col);
}
/* A cone / tapered drum - used for tree canopies and turret housings. */
function _r3Cone(out, x, y, z, r0, r1, h, col, seg) {
  seg = seg || 12;
  var top = [], i;
  for (i = 0; i < seg; i++) {
    var a = (i / seg) * Math.PI * 2, b = ((i + 1) / seg) * Math.PI * 2;
    var ax = x + Math.cos(a) * r0, az = z + Math.sin(a) * r0;
    var bx = x + Math.cos(b) * r0, bz = z + Math.sin(b) * r0;
    var cx2 = x + Math.cos(b) * r1, cz2 = z + Math.sin(b) * r1;
    var dx2 = x + Math.cos(a) * r1, dz2 = z + Math.sin(a) * r1;
    _r3F(out, [[bx, y, bz], [ax, y, az], [dx2, y + h, dz2], [cx2, y + h, cz2]], col);
    top.push([dx2, y + h, dz2]);
  }
  if (r1 > 0.4) { top.reverse(); _r3F(out, top, col); }
}
/* Gable roof: a prism with the ridge running along x. */
function _r3Gable(out, x, y, z, w, h, d, col) {
  var x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2, y1 = y + h;
  _r3F(out, [[x0, y, z1], [x1, y, z1], [x1, y1, z], [x0, y1, z]], col);   /* front slope */
  _r3F(out, [[x1, y, z0], [x0, y, z0], [x0, y1, z], [x1, y1, z]], col);   /* back slope */
  _r3F(out, [[x0, y, z0], [x0, y, z1], [x0, y1, z]], col);                /* gable ends */
  _r3F(out, [[x1, y, z1], [x1, y, z0], [x1, y1, z]], col);
}

/* Hipped roof: a ridge along x with all FOUR sides sloping. A plain gable does not work
   under this camera - the near slope covers five times the pixels of the far one, so the
   roof reads as a single flat plane. Sloping the ends too puts two more tones on screen. */
function _r3Hip(out, x, y, z, w, h, d, inset, col) {
  var x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2, y1 = y + h;
  var rx0 = x0 + inset, rx1 = x1 - inset;
  _r3F(out, [[x0, y, z1], [x1, y, z1], [rx1, y1, z], [rx0, y1, z]], col);   /* near slope */
  _r3F(out, [[x1, y, z0], [x0, y, z0], [rx0, y1, z], [rx1, y1, z]], col);   /* far slope */
  _r3F(out, [[x0, y, z0], [x0, y, z1], [rx0, y1, z]], col);                 /* hip ends */
  _r3F(out, [[x1, y, z1], [x1, y, z0], [rx1, y1, z]], col);
}

/* A barrel VAULT - a half-cylinder lying with its axis along x, elliptical so that its height
   and its span are independent. There was no way to build this shape: _r3Cyl is upright, and
   faking an arch out of stepped boxes reads as a staircase at 48 px. The Construction Yard's
   roof, the barracks' Nissen huts and the kennel are all this one form in the reference art.

   `alongZ` picks which way the axis runs, and it is not a detail - see the comment inside. */
function _r3Vault(out, x, y, z, w, h, d, col, seg, alongZ) {
  seg = Math.max(seg || 12, 8);
  var i, pts = [], q, r, cA = [], cB = [];
  if (alongZ) {
    /* Arch profile in x-y, extruded along z - so the CURVE is in the silhouette. Under this
       camera that is the only version that reads: with the axis along x you see almost nothing
       but the near flank, which sweeps from normal +z to normal +y and shades as a slightly
       graded wall, while the two curved ends sit exactly edge-on and never draw at all. */
    var rx = w / 2, z0 = z - d / 2, z1 = z + d / 2;
    for (i = 0; i <= seg; i++) {
      var a = Math.PI * i / seg;                     /* 0 = the +x springing, PI = the -x one */
      pts.push([x + Math.cos(a) * rx, y + Math.sin(a) * h]);
    }
    for (i = 0; i < seg; i++) {
      q = pts[i]; r = pts[i + 1];
      _r3F(out, [[q[0], q[1], z1], [q[0], q[1], z0], [r[0], r[1], z0], [r[0], r[1], z1]], col);
    }
    for (i = 0; i <= seg; i++) {
      cA.push([pts[i][0], pts[i][1], z1]);
      cB.push([pts[seg - i][0], pts[seg - i][1], z0]);
    }
  } else {
    var rz = d / 2, x0 = x - w / 2, x1 = x + w / 2;
    for (i = 0; i <= seg; i++) {
      var b = Math.PI * i / seg;
      pts.push([z + Math.cos(b) * rz, y + Math.sin(b) * h]);
    }
    for (i = 0; i < seg; i++) {
      q = pts[i]; r = pts[i + 1];
      _r3F(out, [[x0, q[1], q[0]], [x1, q[1], q[0]], [x1, r[1], r[0]], [x0, r[1], r[0]]], col);
    }
    for (i = 0; i <= seg; i++) {
      cA.push([x1, pts[i][1], pts[i][0]]);
      cB.push([x0, pts[seg - i][1], pts[seg - i][0]]);
    }
  }
  _r3F(out, cA, col);
  _r3F(out, cB, col);
}

/* Rotate a model about the vertical axis. Used for unit facings. */
function _r3Yaw(faces, ang) {
  var c = Math.cos(ang), s = Math.sin(ang), out = [], i, j;
  for (i = 0; i < faces.length; i++) {
    var f = faces[i], nv = [];
    for (j = 0; j < f.v.length; j++) {
      var p = f.v[j];
      nv.push([p[0] * c - p[2] * s, p[1], p[0] * s + p[2] * c]);
    }
    out.push({ v: nv, c: f.c });
  }
  return out;
}

/* Uniform scale about the origin. Units are authored at whatever size is comfortable to write
   and brought onto a common size ladder afterwards, so that changing how big a tank is on
   screen cannot accidentally change its proportions. */
function _r3Scale(faces, s) {
  var out = [], i, j;
  for (i = 0; i < faces.length; i++) {
    var f = faces[i], nv = [];
    for (j = 0; j < f.v.length; j++) nv.push([f.v[j][0] * s, f.v[j][1] * s, f.v[j][2] * s]);
    out.push({ v: nv, c: f.c });
  }
  return out;
}

/* Bounds of a model once projected, so a sprite can be sized to fit it exactly. */
function _r3Bounds(faces) {
  var b = { x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9 }, i, j;
  for (i = 0; i < faces.length; i++) {
    for (j = 0; j < faces[i].v.length; j++) {
      var p = faces[i].v[j], sx = p[0], sy = p[2] - R3_K * p[1];
      if (sx < b.x0) b.x0 = sx; if (sx > b.x1) b.x1 = sx;
      if (sy < b.y0) b.y0 = sy; if (sy > b.y1) b.y1 = sy;
    }
  }
  return b;
}

