/* render3d/farm3d.js - the countryside's models, and the batch they are built into. Part of
   rts.render3d; where each piece goes is render3d/scenery3d.js.

   Model units are world units, a cell is RTS_TILE (4) across. Everything is built at its true
   ground height rather than lifted afterwards (_r3dLiftFrom lifts a vertex once per face that
   holds it, and several builders share corners between faces). Kept under R3D_WORLD_YMAX, the
   world batch's cull margin, like everything drawn with it. The crops' green is green-dominant
   on purpose, so the wind moves them (R3D_MESH_VS); the fences and the timber are not. */

/* A face that is meant to face up: flipped if its first three corners wind it downward. */
function _r3dUpF(out, v, col) {
  var a = v[0], b = v[1], c = v[2];
  var ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
  _r3F(out, ny >= 0 ? v : v.slice().reverse(), col);
}
/* A colour scaled by `k`, as the hex the face helpers take. */
function _r3dTint(hex, k) {
  var c = _r3Hex(hex), o = '#';
  for (var i = 0; i < 3; i++) o += ('0' + Math.max(0, Math.min(255, Math.round(c[i] * k))).toString(16)).slice(-2);
  return o;
}
/* Faces built about the origin, turned by `ang` and set down at (x, y, z). */
function _r3dPut(out, local, ang, x, y, z) {
  var L = ang ? _r3Yaw(local, ang) : local;
  for (var i = 0; i < L.length; i++) {
    var v = L[i].v;
    for (var j = 0; j < v.length; j++) v[j] = [v[j][0] + x, v[j][1] + y, v[j][2] + z];
    out.push(L[i]);
  }
}

/* A FIELD: soil over its cells, rows of the crop along its long side, a fence round it with a
   gate left open, and bales on the wheat. */
function _r3dField(out, f) {
  var T = RTS_TILE, C = R3D_SCN, x, z, r;
  function gx(t) { return _rtsWX(t) - T / 2; }
  function y(px, pz) { return _rtsElev(px, pz) + 0.04; }
  var along = f.w >= f.d, crop = [C.wheat, C.greens, C.furrow][f.crop], ht = [0.36, 0.28, 0.15][f.crop];
  for (z = f.tz; z < f.tz + f.d; z++) for (x = f.tx; x < f.tx + f.w; x++) {
    var x0 = gx(x), x1 = x0 + T, z0 = gx(z), z1 = z0 + T;
    _r3dUpF(out, [[x0, y(x0, z0), z0], [x0, y(x0, z1), z1], [x1, y(x1, z1), z1], [x1, y(x1, z0), z0]], C.soil);
    /* five rows a cell, each a low ridge: two slopes meeting along its crest, in two lengths a
       cell whose height and shade each come from a hash - a crop that grew evenly to the inch
       was a deck of boards. The ridges are narrower than the row so the soil shows between. */
    for (r = 0; r < 5; r++) for (var sg = 0; sg < 2; sg++) {
      var o = (r + 0.5) * T / 5, hw = 0.22, a0 = sg * T / 2, a1 = a0 + T / 2;
      var hq = _sprHash(x * 5 + r, z * 2 + sg, 917), hgt = ht * (0.65 + hq * 0.5), col = _r3dTint(crop, 0.84 + _sprHash(z * 5 + r, x * 2 + sg, 919) * 0.3);
      var A = along ? [x0 + a0, z0 + o] : [x0 + o, z0 + a0], B = along ? [x0 + a1, z0 + o] : [x0 + o, z0 + a1];
      var nx = along ? 0 : hw, nz = along ? hw : 0;
      var ya = y(A[0], A[1]), yb = y(B[0], B[1]);
      _r3dUpF(out, [[A[0] - nx, ya, A[1] - nz], [A[0], ya + hgt, A[1]], [B[0], yb + hgt, B[1]], [B[0] - nx, yb, B[1] - nz]], col);
      _r3dUpF(out, [[A[0], ya + hgt, A[1]], [A[0] + nx, ya, A[1] + nz], [B[0] + nx, yb, B[1] + nz], [B[0], yb + hgt, B[1]]], col);
    }
  }
  /* the fence: a post on every cell corner of the edge, two rails between, one gap for a gate */
  var X0 = gx(f.tx), X1 = gx(f.tx + f.w), Z0 = gx(f.tz), Z1 = gx(f.tz + f.d);
  var sides = [[X0, Z0, X1, Z0, f.w], [X1, Z0, X1, Z1, f.d], [X1, Z1, X0, Z1, f.w], [X0, Z1, X0, Z0, f.d]];
  sides.forEach(function (s, si) {
    for (var k = 0; k < s[4]; k++) {
      var ax = s[0] + (s[2] - s[0]) * k / s[4], az = s[1] + (s[3] - s[1]) * k / s[4];
      var bx = s[0] + (s[2] - s[0]) * (k + 1) / s[4], bz = s[1] + (s[3] - s[1]) * (k + 1) / s[4];
      _r3Box(out, ax, _rtsElev(ax, az), az, 0.16, 0.95, 0.16, C.post, C.post);
      if (si === f.gate && k === (s[4] >> 1)) continue;
      var mx = (ax + bx) / 2, mz = (az + bz) / 2, my = _rtsElev(mx, mz), lx = Math.abs(bx - ax) + 0.1, lz = Math.abs(bz - az) + 0.1;
      _r3Box(out, mx, my + 0.36, mz, Math.max(lx, 0.07), 0.07, Math.max(lz, 0.07), C.rail, C.rail);
      _r3Box(out, mx, my + 0.72, mz, Math.max(lx, 0.07), 0.07, Math.max(lz, 0.07), C.rail, C.rail);
    }
  });
  if (f.crop === 0) {
    for (var b = 0; b < 3; b++) {
      var bx2 = X0 + 1.4 + b * 1.25, bz2 = Z0 + 1.3 + (b & 1) * 0.9;
      _r3Cyl(out, bx2, _rtsElev(bx2, bz2), bz2, 0.5, 0.9, C.bale, C.baleTop, 12);
    }
  }
}

/* A FARMSTEAD on a two-by-two block: a house under a hipped roof, a barn, a silo. */
function _r3dFarm(out, fm) {
  var C = R3D_SCN, L = [], T = RTS_TILE;
  var cx = _rtsWX(fm.tx) + T / 2, cz = _rtsWX(fm.tz) + T / 2;
  var gy = Math.min(_rtsElev(cx, cz), _rtsElev(cx - 3, cz - 3), _rtsElev(cx + 3, cz - 3), _rtsElev(cx - 3, cz + 3), _rtsElev(cx + 3, cz + 3));
  _r3Box(L, -1.2, 0, 0.8, 3.4, 2.0, 2.6, C.wall, C.wall);
  _r3Hip(L, -1.2, 2.0, 0.8, 3.8, 1.3, 3.0, 0.7, C.roof);
  _r3Box(L, -0.3, 2.2, 1.3, 0.4, 1.3, 0.4, '#6b5b4b', '#6b5b4b');
  _r3Box(L, -1.2, 0, 2.12, 0.7, 1.3, 0.06, C.door, C.door);
  _r3Box(L, -2.3, 0.95, 2.12, 0.6, 0.5, 0.05, C.glass, C.glass);
  _r3Box(L, -0.1, 0.95, 2.12, 0.6, 0.5, 0.05, C.glass, C.glass);
  _r3Box(L, 1.6, 0, -1.4, 3.4, 2.6, 2.8, C.barn, C.barn);
  _r3Gable(L, 1.6, 2.6, -1.4, 3.8, 1.5, 3.2, C.barnRoof);
  _r3Box(L, 1.6, 0, 0.02, 1.4, 1.9, 0.06, C.door, C.door);
  _r3Cyl(L, -2.4, 0, -2.2, 0.7, 4.0, C.silo, C.siloTop, 16);
  _r3Cone(L, -2.4, 4.0, -2.2, 0.75, 0.05, 0.8, C.siloTop, 16);
  _r3dPut(out, L, fm.ang, cx, gy, cz);
}

/* A TELEGRAPH POLE, its crossarm square to the line it carries. Returns its two insulators. */
function _r3dPole(out, x, z, ang) {
  var C = R3D_SCN, L = [], gy = _rtsElev(x, z), c = Math.cos(ang), s = Math.sin(ang);
  _r3Cyl(L, 0, 0, 0, 0.13, 6.2, C.pole, C.pole, 8);
  _r3Box(L, 0, 5.6, 0, 1.8, 0.14, 0.14, C.pole, C.pole);
  _r3Cyl(L, -0.75, 5.74, 0, 0.06, 0.16, C.ins, C.ins, 8);
  _r3Cyl(L, 0.75, 5.74, 0, 0.06, 0.16, C.ins, C.ins, 8);
  _r3dPut(out, L, ang, x, gy, z);
  return [[x - 0.75 * c, gy + 5.9, z - 0.75 * s], [x + 0.75 * c, gy + 5.9, z + 0.75 * s]];
}
/* A wire hanging between two insulators: a thin ribbon on a sag. */
function _r3dWire(out, a, b) {
  var n = 6, len = Math.hypot(b[0] - a[0], b[2] - a[2]), sag = 0.3 + len * 0.02, P = [];
  for (var i = 0; i <= n; i++) {
    var t = i / n;
    P.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t]);
  }
  for (i = 0; i < n; i++) {
    _r3F(out, [P[i], P[i + 1], [P[i + 1][0], P[i + 1][1] + 0.05, P[i + 1][2]], [P[i][0], P[i][1] + 0.05, P[i][2]]], R3D_SCN.wire);
  }
}

/* A WRECK: a rusted car short of a wheel, or a burnt-out tank. */
function _r3dWreck(out, w) {
  var C = R3D_SCN, L = [], x = _rtsWX(w.tx), z = _rtsWX(w.tz);
  if (w.kind === 0) {
    _r3Box(L, 0, 0.25, 0, 2.6, 0.6, 1.3, C.rust[0], C.rust[1]);
    _r3Box(L, -0.2, 0.85, 0, 1.3, 0.55, 1.1, C.rust[2], C.rust[0]);
    _r3Box(L, 0.85, 0, 0.62, 0.55, 0.5, 0.22, C.tyre, C.tyre);
    _r3Box(L, -0.85, 0, 0.62, 0.55, 0.5, 0.22, C.tyre, C.tyre);
    _r3Box(L, 0.85, 0, -0.62, 0.55, 0.5, 0.22, C.tyre, C.tyre);
  } else {
    /* burnt out: rust through the paint, the turret knocked round on its ring, the gun low */
    _r3Box(L, 0, 0.2, 0, 3.2, 0.8, 2.0, C.hulk, C.hulkTop);
    _r3Box(L, -0.7, 0.62, 0.5, 1.1, 0.4, 0.9, C.rust[2], C.rust[2]);
    _r3Box(L, 0, 0, 1.05, 3.4, 0.55, 0.4, C.tyre, C.tyre);
    _r3Box(L, 0.3, 0, -1.05, 2.6, 0.45, 0.4, C.tyre, C.tyre);
    var Tu = [];
    _r3Box(Tu, 0, 0, 0, 1.4, 0.55, 1.2, C.hulk, C.rust[2]);
    _r3Box(Tu, 1.35, 0.12, 0.1, 1.5, 0.16, 0.16, C.hulk, C.hulk);
    _r3dPut(L, Tu, 0.7, 0.2, 1.0, -0.1);
  }
  /* at a tank's own size: built at 1.0 a hulk read as a brick in the grass */
  _r3dPut(out, _r3Scale(L, 1.4), w.ang, x, _rtsElev(x, z) - 0.05, z);
}

/* BOULDERS: two or three, of the ridges' own stone. */
function _r3dBoulders(out, r) {
  var x = _rtsWX(r.tx), z = _rtsWX(r.tz), n = 2 + (_sprHash(r.tx, r.tz, 961) > 0.6 ? 1 : 0);
  for (var i = 0; i < n; i++) {
    var hx = _sprHash(r.tx * 31 + i, r.tz, 963), hz = _sprHash(r.tz * 31 + i, r.tx, 967), hs = _sprHash(r.tx + i, r.tz * 17, 971);
    var bx = x + (hx - 0.5) * 2.6, bz = z + (hz - 0.5) * 2.6, s = 0.6 + hs * 0.8, c = (r.tx * 7 + r.tz + i) % R3D_ROCK.length;
    _r3dSlab(out, bx, _rtsElev(bx, bz) - 0.1, bz, s * 1.3, s * 1.1, s * 0.9, hx * 6.28, 0.62, (hz - 0.5) * 0.3, (hx - 0.5) * 0.3,
             R3D_ROCK[c], R3D_ROCK_TOP[c], s * 0.25, hz - 0.5, hx - 0.5);
  }
}

/* THE BATCH: every piece of the plan whose ground is still its own, into a mesh per chunk. */
function _r3dSceneryBuild(G, P) {
  var R3 = window._R3D, gl = R3.gl, N = RTS_N, CH = Math.ceil(N / R3D_CHUNK), buckets = {}, i;
  if (R3.scenery) R3.scenery.forEach(function (m) { gl.deleteBuffer(m.p); gl.deleteBuffer(m.n); gl.deleteBuffer(m.c); });
  R3.scenery = []; R3.sceneryTris = 0;
  function bucket(tx, tz) { var k = Math.floor(tz / R3D_CHUNK) * CH + Math.floor(tx / R3D_CHUNK); return buckets[k] || (buckets[k] = []); }
  function free(tx, tz) { return _r3dSceneryFree(G, tz * N + tx); }
  _r3SegBulk(function () {
    P.fields.forEach(function (f) {
      for (var z = f.tz; z < f.tz + f.d; z++) for (var x = f.tx; x < f.tx + f.w; x++) if (!free(x, z)) return;
      _r3dField(bucket(f.tx, f.tz), f);
    });
    P.farms.forEach(function (fm) { _r3dFarm(bucket(fm.tx, fm.tz), fm); });
    var ends = P.poles.map(function (p, k) {
      if (!free(p.tx, p.tz)) return null;
      /* square to the wire it carries: its first link's direction */
      var w = P.wires.filter(function (l) { return l[0] === k || l[1] === k; })[0], o = w ? P.poles[w[0] === k ? w[1] : w[0]] : p;
      var ang = Math.atan2(o.tx - p.tx, -(o.tz - p.tz)) || 0;
      return _r3dPole(bucket(p.tx, p.tz), _rtsWX(p.tx), _rtsWX(p.tz), ang);
    });
    P.wires.forEach(function (l) {
      var a = ends[l[0]], b = ends[l[1]];
      if (!a || !b) return;
      /* each wire to the nearer insulator, so the pair do not cross */
      var s = Math.hypot(a[0][0] - b[0][0], a[0][2] - b[0][2]) <= Math.hypot(a[0][0] - b[1][0], a[0][2] - b[1][2]);
      var out = bucket(P.poles[l[0]].tx, P.poles[l[0]].tz);
      _r3dWire(out, a[0], s ? b[0] : b[1]); _r3dWire(out, a[1], s ? b[1] : b[0]);
    });
    P.wrecks.forEach(function (w) { if (free(w.tx, w.tz)) _r3dWreck(bucket(w.tx, w.tz), w); });
    P.rocks.forEach(function (r) { if (free(r.tx, r.tz)) _r3dBoulders(bucket(r.tx, r.tz), r); });
  });
  for (var k in buckets) {
    if (!buckets[k].length) continue;
    var m = _r3dBuildMesh(gl, buckets[k]), cx = (k % CH) * R3D_CHUNK, cz = Math.floor(k / CH) * R3D_CHUNK;
    /* the chunk's box, grown by a cell: a farm or a wire can reach over its edge */
    m.x0 = _rtsWX(cx) - RTS_TILE * 2; m.x1 = _rtsWX(Math.min(N, cx + R3D_CHUNK) - 1) + RTS_TILE * 2;
    m.z0 = _rtsWX(cz) - RTS_TILE * 2; m.z1 = _rtsWX(Math.min(N, cz + R3D_CHUNK) - 1) + RTS_TILE * 2;
    R3.scenery.push(m);
    R3.sceneryTris += m.verts / 3;
  }
  R3.sceneryPlan = P;
}
