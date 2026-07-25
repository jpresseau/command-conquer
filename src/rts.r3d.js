/* RC COMMAND - the sprite baker: a tiny 3D renderer that runs once, at load.

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

var R3_K = 0.8;                       /* how far a unit of height climbs the screen */
var R3_AMB = 0.34, R3_DIF = 0.66;     /* ambient / diffuse split */
var R3_STEPS = 6;                     /* quantise shading - period renderers banded, and
                                         banding also keeps the palette tight */
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

/* ------------------------------------------------------------------- render --
   Scanline fill with a per-pixel depth buffer, straight into ImageData. Canvas fill() would
   anti-alias every silhouette edge, which is the one thing this art style cannot have. */
function _r3Render(faces, W, H, ox, oy) {
  W = Math.max(1, Math.ceil(W)); H = Math.max(1, Math.ceil(H));
  var t = _sprMake(W, H), g = t.g;
  var img = g.createImageData(W, H), d = img.data;
  var zb = new Float32Array(W * H); zb.fill(-1e30);
  var i, j;

  for (i = 0; i < faces.length; i++) {
    var f = faces[i], v = f.v;
    /* normal from the first three vertices */
    var ax = v[1][0] - v[0][0], ay = v[1][1] - v[0][1], az = v[1][2] - v[0][2];
    var bx = v[2][0] - v[1][0], by = v[2][1] - v[1][1], bz = v[2][2] - v[1][2];
    var nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    var nl = Math.hypot(nx, ny, nz);
    if (nl < 1e-9) continue;
    nx /= nl; ny /= nl; nz /= nl;
    if (nx * R3_VIEW[0] + ny * R3_VIEW[1] + nz * R3_VIEW[2] <= 0.0001) continue;  /* backface */

    var lam = nx * R3_LIGHT[0] + ny * R3_LIGHT[1] + nz * R3_LIGHT[2];
    if (lam < 0) lam = 0;
    var sh = R3_AMB + R3_DIF * lam;
    sh = Math.round(sh * R3_STEPS) / R3_STEPS;                    /* band it */
    var cr = Math.min(255, f.c[0] * sh) | 0, cg = Math.min(255, f.c[1] * sh) | 0,
        cb = Math.min(255, f.c[2] * sh) | 0;

    /* project + depth */
    var n = v.length, px = new Float64Array(n), py = new Float64Array(n), pd = new Float64Array(n);
    var ymin = 1e9, ymax = -1e9;
    for (j = 0; j < n; j++) {
      px[j] = ox + v[j][0];
      py[j] = oy + (v[j][2] - R3_K * v[j][1]);
      pd[j] = v[j][1] + R3_K * v[j][2];
      if (py[j] < ymin) ymin = py[j];
      if (py[j] > ymax) ymax = py[j];
    }
    /* depth is affine in screen space, so solve it once per face from three vertices */
    var d0x = px[1] - px[0], d0y = py[1] - py[0], d1x = px[2] - px[0], d1y = py[2] - py[0];
    var det = d0x * d1y - d0y * d1x;
    if (Math.abs(det) < 1e-9) continue;                            /* edge-on */
    var e0 = pd[1] - pd[0], e1 = pd[2] - pd[0];
    var da = (e0 * d1y - e1 * d0y) / det, db = (e1 * d0x - e0 * d1x) / det;
    var dc = pd[0] - da * px[0] - db * py[0];

    var yA = Math.max(0, Math.floor(ymin)), yB = Math.min(H - 1, Math.ceil(ymax));
    for (var yy = yA; yy <= yB; yy++) {
      var yc = yy + 0.5, xlo = 1e9, xhi = -1e9;
      for (j = 0; j < n; j++) {
        var k = (j + 1) % n, y0 = py[j], y1 = py[k];
        if ((y0 <= yc) === (y1 <= yc)) continue;
        var tt = (yc - y0) / (y1 - y0);
        var xx = px[j] + (px[k] - px[j]) * tt;
        if (xx < xlo) xlo = xx;
        if (xx > xhi) xhi = xx;
      }
      if (xhi < xlo) continue;
      var xA = Math.max(0, Math.round(xlo)), xB = Math.min(W - 1, Math.round(xhi) - 1);
      if (xB < xA && xhi - xlo > 0.35) xB = xA;                    /* keep 1px-wide slivers */
      for (var xx2 = xA; xx2 <= xB; xx2++) {
        var dep = da * (xx2 + 0.5) + db * yc + dc;
        var o = yy * W + xx2;
        if (dep <= zb[o]) continue;
        zb[o] = dep;
        var q = o * 4;
        d[q] = cr; d[q + 1] = cg; d[q + 2] = cb; d[q + 3] = 255;
      }
    }
  }
  g.putImageData(img, 0, 0);
  return t.c;
}

/* Render a model whose footprint must line up with the tile grid: the canvas is exactly
   footW wide, the footprint sits at the bottom, and everything above it becomes headroom. */
function _r3BakeFootprint(faces, footW, footD) {
  var b = _r3Bounds(faces);
  var head = Math.max(0, Math.ceil(-(b.y0 + footD / 2)));
  var W = footW, H = footD + head;
  var c = _r3Render(faces, W, H, footW / 2, head + footD / 2);
  return { c: c, head: head };
}
/* Render a model centred in a square - used for units, which are not grid-aligned. */
function _r3BakeCentred(faces, size) {
  return _r3Render(faces, size, size, size / 2, size / 2);
}
