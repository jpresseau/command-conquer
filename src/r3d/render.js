/* r3d/render.js - scanline fill with a depth buffer, then the shading pass.
   Part of rts.r3d, the little 3D renderer that bakes the sprites. */

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

/* SUPERSAMPLING. The rasteriser used to draw straight into the output canvas at 1:1, which
   put a hard jagged step on every facet edge and meant any detail smaller than a whole pixel
   simply vanished. At 24 art-pixels per map cell that is most of the detail on a model.

   Now the geometry and shading are computed at R3_SS times the output resolution and box-
   downsampled. The cost is R3_SS^2 in raster work and it is paid once, at load.

   Two decisions in the downsample that are the whole point:

   - ALPHA IS THRESHOLDED, not averaged. Real sprite art of this era is 1-bit transparent -
     an indexed image with one index reserved for "nothing here" - so a soft feathered
     silhouette would read as modern, not as the thing being imitated. A pixel is opaque if
     more than half its samples were covered, and the silhouette stays as hard as it was.
   - QUANTISATION HAPPENS AFTER the downsample, not before. Posterising at supersample
     resolution and then averaging turns the deliberate flat bands back into a smooth
     gradient, which throws away the limited-palette look. Averaging first and quantising
     second keeps flat faces flat while the EDGES between them resolve cleanly. */
var R3_SS = 3;

function _r3Render(faces, W, H, ox, oy) {
  W = Math.max(1, Math.ceil(W)); H = Math.max(1, Math.ceil(H));
  var SS = R3_SS | 0; if (SS < 1) SS = 1;
  var SW = W * SS, SH = H * SS;
  var t = _sprMake(W, H), g = t.g;
  var img = g.createImageData(W, H), d = img.data;
  var N = SW * SH;
  var zb = new Float32Array(N); zb.fill(-1e30);
  var vb = new Float32Array(N);                 /* lit-ness */
  var cb = new Uint8Array(N * 3);               /* base colour */
  var mk = new Uint8Array(N);                   /* coverage */
  var i, j;
  var sox = ox * SS, soy = oy * SS;

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

    /* Screen positions are scaled into the supersample grid; DEPTH deliberately is not, so
       the occlusion threshold below stays in model units and does not have to track SS. */
    var n2 = v.length, px = new Float64Array(n2), py = new Float64Array(n2), pd = new Float64Array(n2);
    var ymin = 1e9, ymax = -1e9;
    for (j = 0; j < n2; j++) {
      px[j] = sox + v[j][0] * SS;
      py[j] = soy + (v[j][2] - R3_K * v[j][1]) * SS;
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

    var yA = Math.max(0, Math.floor(ymin)), yB = Math.min(SH - 1, Math.ceil(ymax));
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
      var xA = Math.max(0, Math.round(xlo)), xB = Math.min(SW - 1, Math.round(xhi) - 1);
      if (xB < xA && xhi - xlo > 0.35) xB = xA;
      for (var xx2 = xA; xx2 <= xB; xx2++) {
        var dep = da * (xx2 + 0.5) + db * yc + dc;
        var o = yy * SW + xx2;
        if (dep <= zb[o]) continue;
        zb[o] = dep; vb[o] = lit; mk[o] = 1;
        cb[o * 3] = f.c[0]; cb[o * 3 + 1] = f.c[1]; cb[o * 3 + 2] = f.c[2];
      }
    }
  }

  /* ---- shading pass, at supersample resolution, WITHOUT quantising ---- */
  var val = new Float32Array(N);
  var AOR = 2 * SS;                    /* the occlusion neighbourhood is in model units, so
                                          its pixel radius has to grow with the supersample
                                          or creases get thinner as SS rises */
  var AOSTEP = SS;                     /* sample the ring rather than every pixel in it -
                                          at SS=3 a full 12x12 gather is 144 reads per pixel
                                          and utterly dominates the bake */
  for (var y2 = 0; y2 < SH; y2++) {
    for (var x2 = 0; x2 < SW; x2++) {
      var p = y2 * SW + x2;
      if (!mk[p]) continue;

      var occ = 0, tot = 0;
      for (var oy2 = -AOR; oy2 <= AOR; oy2 += AOSTEP) {
        for (var ox2 = -AOR; ox2 <= AOR; ox2 += AOSTEP) {
          if (!ox2 && !oy2) continue;
          var qx = x2 + ox2, qy = y2 + oy2;
          if (qx < 0 || qy < 0 || qx >= SW || qy >= SH) continue;
          var q = qy * SW + qx;
          tot++;
          if (mk[q] && zb[q] > zb[p] + 1.1) occ++;
        }
      }
      var mod = tot ? -0.40 * (occ / tot) : 0;

      /* Rim light on the up-left silhouette, so the shape lifts off the ground behind it.
         Stepped by SS so the rim stays one OUTPUT pixel wide rather than shrinking. */
      var up = y2 >= SS ? mk[p - SW * SS] : 0, lf = x2 >= SS ? mk[p - SS] : 0;
      if (!up || !lf) mod += 0.13;

      val[p] = vb[p] + mod;
    }
  }

  /* ---- downsample, then quantise ---- */
  var rgb = [0, 0, 0];
  var inv = 1 / (SS * SS);
  for (var oyy = 0; oyy < H; oyy++) {
    for (var oxx = 0; oxx < W; oxx++) {
      var cov = 0, sr = 0, sg = 0, sb = 0, sv = 0;
      for (var sy = 0; sy < SS; sy++) {
        var srow = (oyy * SS + sy) * SW + oxx * SS;
        for (var sx = 0; sx < SS; sx++) {
          var q3 = srow + sx;
          if (!mk[q3]) continue;
          cov++;
          sr += cb[q3 * 3]; sg += cb[q3 * 3 + 1]; sb += cb[q3 * 3 + 2];
          sv += val[q3];
        }
      }
      /* 1-bit alpha: opaque only if MORE than half the samples were covered. Averaging
         coverage into alpha instead would feather the silhouette, which reads as modern
         rather than as the 1-bit indexed sprites this is imitating. */
      if (cov * 2 <= SS * SS) continue;
      var w2 = (oyy * W + oxx) * 4;
      rgb[0] = sr / cov; rgb[1] = sg / cov; rgb[2] = sb / cov;
      var lit3 = sv / cov;

      /* Quantise here, at OUTPUT resolution, so a flat face is still one solid tone and the
         dither pattern is one output pixel per cell rather than a sub-pixel shimmer that
         averages to mud. */
      var bay = (R3_BAYER[(oyy & 3) * 4 + (oxx & 3)] + 0.5) / 16 - 0.5;
      var q2 = Math.round(lit3 * R3_STEPS + bay) / R3_STEPS;

      _r3Ramp(rgb, q2, rgb);
      d[w2] = rgb[0] < 0 ? 0 : (rgb[0] > 255 ? 255 : rgb[0]);
      d[w2 + 1] = rgb[1] < 0 ? 0 : (rgb[1] > 255 ? 255 : rgb[1]);
      d[w2 + 2] = rgb[2] < 0 ? 0 : (rgb[2] > 255 ? 255 : rgb[2]);
      d[w2 + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return t.c;
}

/* Render a model whose footprint must line up with the tile grid: the canvas is exactly
   footW wide, the footprint sits at the bottom, and everything above it becomes headroom. */
/* Structures are FLATTENED before baking, and the reason is a measurement rather than taste.
   In reference frames of the original nothing is a tower: a building rises to roughly half
   its own footprint depth and no more, so the silhouette you read is a wide low mass with one
   distinctive thing on top of it. The models here were coming out at 129 pixels tall on a 72
   pixel footprint - a skyscraper - and every one of them had the same jagged fringe of roof
   clutter along the top, which is exactly why they stopped being tellable apart.

   Scaling the model's HEIGHT rather than editing sixteen models keeps every piece of detail
   that was built and simply stops it stacking into a tower. It cannot affect footprint
   alignment: the ground plane is not foreshortened at all, so y scaling moves nothing in x
   or z. */
