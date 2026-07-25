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
var R3_AMB = 0.30, R3_DIF = 0.72;     /* ambient / diffuse split */
var R3_STEPS = 9;                     /* quantise shading - period renderers banded, and
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
   Scanline fill with a per-pixel depth buffer, then a shading pass over the buffers.

   The first version wrote colour directly during rasterisation as `base * brightness`,
   quantised to six bands. That is the cheapest possible shading and it looks it: scaling
   RGB toward black desaturates as it darkens, so every shadow slid to muddy grey, and six
   hard bands with no dither gave big flat plates of colour. Everything downstream - more
   geometry, better silhouettes - was fighting that.

   What happens now, per pixel:
     1. rasterise, keeping depth, surface normal, base colour and a lit-ness value
     2. ambient occlusion from the depth buffer, so creases between parts darken
     3. ordered 4x4 dither between quantisation levels, which is how art of this era got
        smooth gradients out of a small palette
     4. a colour RAMP rather than a multiply: shadows shift cool and keep saturation,
        highlights shift warm toward daylight
     5. a rim light along the up-left silhouette so the shape separates from the ground

   All of it runs once, at load, on sprites a few dozen pixels across. */

/* 4x4 ordered dither. Values 0..15. */
var R3_BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/* Map a base colour and a lit-ness value onto a colour ramp.
   v < 1 darkens toward a cool shadow, v > 1 lifts toward warm daylight. Multiplying toward
   black instead - the obvious thing - drains the colour out of every shaded face. */
function _r3Ramp(c, v, out) {
  if (v <= 1) {
    var k = v < 0 ? 0 : v;
    out[0] = c[0] * (0.30 + 0.70 * k) + (1 - k) * 7;
    out[1] = c[1] * (0.32 + 0.68 * k) + (1 - k) * 10;
    out[2] = c[2] * (0.38 + 0.62 * k) + (1 - k) * 21;
  } else {
    var m = v - 1; if (m > 1) m = 1;
    out[0] = c[0] + (255 - c[0]) * m * 0.60;
    out[1] = c[1] + (250 - c[1]) * m * 0.60;
    out[2] = c[2] + (228 - c[2]) * m * 0.60;
  }
}

function _r3Render(faces, W, H, ox, oy) {
  W = Math.max(1, Math.ceil(W)); H = Math.max(1, Math.ceil(H));
  var t = _sprMake(W, H), g = t.g;
  var img = g.createImageData(W, H), d = img.data;
  var N = W * H;
  var zb = new Float32Array(N); zb.fill(-1e30);
  var vb = new Float32Array(N);                 /* lit-ness */
  var cb = new Uint8Array(N * 3);               /* base colour */
  var mk = new Uint8Array(N);                   /* coverage */
  var i, j;

  /* half-vector for a cheap specular term - gives cylinders a sheen along one side */
  var hx = R3_LIGHT[0] + R3_VIEW[0], hy = R3_LIGHT[1] + R3_VIEW[1], hz = R3_LIGHT[2] + R3_VIEW[2];
  var hl = Math.hypot(hx, hy, hz); hx /= hl; hy /= hl; hz /= hl;

  for (i = 0; i < faces.length; i++) {
    var f = faces[i], v = f.v;
    var ax = v[1][0] - v[0][0], ay = v[1][1] - v[0][1], az = v[1][2] - v[0][2];
    var bx = v[2][0] - v[1][0], by = v[2][1] - v[1][1], bz = v[2][2] - v[1][2];
    var nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    var nl = Math.hypot(nx, ny, nz);
    if (nl < 1e-9) continue;
    nx /= nl; ny /= nl; nz /= nl;
    if (nx * R3_VIEW[0] + ny * R3_VIEW[1] + nz * R3_VIEW[2] <= 0.0001) continue;  /* backface */

    var lam = nx * R3_LIGHT[0] + ny * R3_LIGHT[1] + nz * R3_LIGHT[2];
    if (lam < 0) lam = 0;
    var sp = nx * hx + ny * hy + nz * hz;
    if (sp < 0) sp = 0;
    sp = sp * sp; sp = sp * sp; sp = sp * sp; sp = sp * sp; /* ^16, a tight highlight */
    /* A touch of sky bounce from above keeps upward faces from going dead in shadow. */
    var sky = 0.10 * (ny > 0 ? ny : 0);
    var lit = R3_AMB + R3_DIF * lam + sky + 0.16 * sp;
    if (lit > 1.10) lit = 1.10;         /* a broad, strong specular blew lit roofs out to pink */

    var n2 = v.length, px = new Float64Array(n2), py = new Float64Array(n2), pd = new Float64Array(n2);
    var ymin = 1e9, ymax = -1e9;
    for (j = 0; j < n2; j++) {
      px[j] = ox + v[j][0];
      py[j] = oy + (v[j][2] - R3_K * v[j][1]);
      pd[j] = v[j][1] + R3_K * v[j][2];
      if (py[j] < ymin) ymin = py[j];
      if (py[j] > ymax) ymax = py[j];
    }
    var d0x = px[1] - px[0], d0y = py[1] - py[0], d1x = px[2] - px[0], d1y = py[2] - py[0];
    var det = d0x * d1y - d0y * d1x;
    if (Math.abs(det) < 1e-9) continue;
    var e0 = pd[1] - pd[0], e1 = pd[2] - pd[0];
    var da = (e0 * d1y - e1 * d0y) / det, db = (e1 * d0x - e0 * d1x) / det;
    var dc = pd[0] - da * px[0] - db * py[0];

    var yA = Math.max(0, Math.floor(ymin)), yB = Math.min(H - 1, Math.ceil(ymax));
    for (var yy = yA; yy <= yB; yy++) {
      var yc = yy + 0.5, xlo = 1e9, xhi = -1e9;
      for (j = 0; j < n2; j++) {
        var k2 = (j + 1) % n2, y0 = py[j], y1 = py[k2];
        if ((y0 <= yc) === (y1 <= yc)) continue;
        var tt = (yc - y0) / (y1 - y0);
        var xx = px[j] + (px[k2] - px[j]) * tt;
        if (xx < xlo) xlo = xx;
        if (xx > xhi) xhi = xx;
      }
      if (xhi < xlo) continue;
      var xA = Math.max(0, Math.round(xlo)), xB = Math.min(W - 1, Math.round(xhi) - 1);
      if (xB < xA && xhi - xlo > 0.35) xB = xA;
      for (var xx2 = xA; xx2 <= xB; xx2++) {
        var dep = da * (xx2 + 0.5) + db * yc + dc;
        var o = yy * W + xx2;
        if (dep <= zb[o]) continue;
        zb[o] = dep; vb[o] = lit; mk[o] = 1;
        cb[o * 3] = f.c[0]; cb[o * 3 + 1] = f.c[1]; cb[o * 3 + 2] = f.c[2];
      }
    }
  }

  /* ---- shading pass ---- */
  var rgb = [0, 0, 0];
  for (var y2 = 0; y2 < H; y2++) {
    for (var x2 = 0; x2 < W; x2++) {
      var p = y2 * W + x2;
      if (!mk[p]) continue;
      var lit2 = vb[p];

      /* Ambient occlusion: count neighbours that sit measurably in front of this pixel.
         Those are the creases where one part meets another, and darkening them is most of
         what stops a model looking like flat decals stacked on each other. */
      var occ = 0, tot = 0;
      for (var oy2 = -2; oy2 <= 2; oy2++) {
        for (var ox2 = -2; ox2 <= 2; ox2++) {
          if (!ox2 && !oy2) continue;
          var qx = x2 + ox2, qy = y2 + oy2;
          if (qx < 0 || qy < 0 || qx >= W || qy >= H) continue;
          var q = qy * W + qx;
          tot++;
          if (mk[q] && zb[q] > zb[p] + 1.1) occ++;
        }
      }
      var mod = tot ? -0.40 * (occ / tot) : 0;

      /* Rim light on the up-left silhouette, so the shape lifts off the ground behind it. */
      var up = y2 > 0 ? mk[p - W] : 0, lf = x2 > 0 ? mk[p - 1] : 0;
      if (!up || !lf) mod += 0.13;

      /* Quantise the face's own lighting WITHOUT dither, so a flat face stays one solid
         tone, and dither only the spatially-varying part - the occlusion and rim. Dithering
         the face value too puts a checkerboard across every large flat roof, which is what
         the first attempt did: dither belongs on gradients, not on flat surfaces. */
      var bay = (R3_BAYER[(y2 & 3) * 4 + (x2 & 3)] + 0.5) / 16 - 0.5;
      var q2 = Math.round(lit2 * R3_STEPS) / R3_STEPS
             + Math.round((mod + bay / R3_STEPS) * R3_STEPS) / R3_STEPS;

      rgb[0] = cb[p * 3]; rgb[1] = cb[p * 3 + 1]; rgb[2] = cb[p * 3 + 2];
      _r3Ramp(rgb, q2, rgb);
      var w = p * 4;
      d[w] = rgb[0] < 0 ? 0 : (rgb[0] > 255 ? 255 : rgb[0]);
      d[w + 1] = rgb[1] < 0 ? 0 : (rgb[1] > 255 ? 255 : rgb[1]);
      d[w + 2] = rgb[2] < 0 ? 0 : (rgb[2] > 255 ? 255 : rgb[2]);
      d[w + 3] = 255;
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
