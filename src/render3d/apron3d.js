/* render3d/apron3d.js - THE LAND PAST THE MAP'S EDGE. Part of rts.render3d.

   The ground is the visible patch, clamped to the map (ground3d.js _r3dGroundMesh), and past
   the edge was the clear colour: a near-black band across the top of every frame, two-fifths
   of the screen at the widest zoom, with the map ending on a ruled line under it. A battle on
   a table, not in a country.

   THE MAP, MIRRORED. The apron is ground drawn past every edge, and what it draws is the map
   reflected across that edge: its height, its slope and its materials read at the mirrored
   point. A reflection is continuous at the line it reflects in, so there is no seam - the
   grass, the hills and the shore run straight on out of the map - and it needs no second
   terrain, only the one the match already has. Nothing stands on it: no trees, buildings or
   units are mirrored, only the ground - and only the land: no paving, road, track, scar or ore
   (uApr in terrain3d.js), so no ghost of the base or of a field nobody can reach - and it fades
   into the horizon (R3D_APRON_FADE) so the reflection is never close enough to read as one.

   NOT ON THE LOW TIER (quality3d.js `apron`): it is the ground's whole material shader over up to
   two-fifths of the screen. There the distance is the horizon's colour, which is still not black.

   THE SHROUD IS MIRRORED WITH IT. Unexplored ground past the edge is as dark as the
   unexplored ground it reflects, so the apron never shows what lies under the shroud.

   THE SEA. Water is a mesh of its own over the water cells (wave3d.js), so the mirrored sea
   is painted here instead: deep water read from the sea mask at the mirrored point, a flat
   blue fading with the rest. Far and hazed, that is all it has to be.

   BEYOND THE APRON is the clear colour, which is the horizon's (_r3dHorizon), so the land runs
   into haze and the haze into the distance, with no line between them. */
var R3D_APRON = 1.0;            /* how far out the apron runs, in map half-widths */
var R3D_APRON_FADE = [0.04, 0.85];   /* fade to the horizon from/to, in half-widths outside the map */
var R3D_HORIZON_DAY = [0.70, 0.78, 0.86];

/* The horizon's colour under the sky this frame: the day's, lit as the sky lights the land,
   and drawn toward the sky's own haze as far as that haze is thick. */
function _r3dHorizon(G) {
  var S = (typeof _rtsSkyNow === 'function' && _rtsSkyNow(G)) || { L: [1, 1, 1], haze: [0, 0, 0, 0] };
  var L = S.L || [1, 1, 1], hz = S.haze || [0, 0, 0, 0], k = Math.min(1, (hz[3] || 0) * 2.5), out = [];
  for (var i = 0; i < 3; i++) out.push(R3D_HORIZON_DAY[i] * Math.min(1, L[i]) * (1 - k) + hz[i] * k);
  return out;
}

/* The mirror across the map's edges, EXT the half-width - continuous at the line. */
function _r3dMir(v, EXT) { var a = Math.abs(v); return (v < 0 ? -1 : 1) * (EXT - Math.abs(EXT - a)); }

/* The apron's mesh over the visible patch: everything in view out to R3D_APRON past the map,
   less the map itself. Cut on the tile grid, as the ground is and for the same two reasons -
   a surface that does not crawl, and triangles small enough that linear depth holds (see the
   note in scene3d.js) - and coarser by whole cells as the view widens. */
function _r3dApronMesh(R3, gl, vb, EXT) {
  var A = EXT * (1 + R3D_APRON), T = RTS_TILE;
  var GM = T * 2 + RTS_ELEV_MAX * R3.sp / R3.cp;
  var x0 = Math.max(-A, vb.x0 - GM), x1 = Math.min(A, vb.x1 + GM), z0 = Math.max(-A, vb.z0 - GM), z1 = Math.min(A, vb.z1 + GM);
  var key = null, Gm = window._rtsG;
  if (x1 <= x0 || z1 <= z0 || (x0 >= -EXT && x1 <= EXT && z0 >= -EXT && z1 <= EXT)) { R3.apronVerts = 0; R3.apronKey = null; return; }
  var step = T;
  while ((x1 - x0) / step * ((z1 - z0) / step) > 3600 && step < T * 16) step *= 2;
  x0 = Math.floor(x0 / step) * step; z0 = Math.floor(z0 / step) * step;
  key = x0 + ',' + x1 + ',' + z0 + ',' + z1 + ',' + step;
  if (R3.apronKey === key && R3.apronFor === Gm && R3.apronH === (Gm && Gm.height)) return;
  R3.apronKey = key; R3.apronFor = Gm; R3.apronH = Gm && Gm.height;
  var nx = Math.ceil((x1 - x0) / step), nz = Math.ceil((z1 - z0) / step), need = nx * nz * 18;
  if (!R3.apronBuf) { R3.apronBuf = gl.createBuffer(); R3.apronNB = gl.createBuffer(); R3.apronUV = gl.createBuffer(); }
  if (!R3.apronP || R3.apronP.length < need) {
    R3.apronP = new Float32Array(need); R3.apronN = new Float32Array(need); R3.apronT = new Float32Array(need / 3 * 2);
  }
  var q = R3.apronP, nb = R3.apronN, t = R3.apronT, k = 0, kt = 0;
  function v(x, z) {
    var mx = _r3dMir(x, EXT), mz = _r3dMir(z, EXT), n = _rtsElevNormal(mx, mz);
    q[k] = x; q[k + 1] = _rtsElev(mx, mz); q[k + 2] = z;
    nb[k] = Math.abs(x) > EXT ? -n[0] : n[0]; nb[k + 1] = n[1]; nb[k + 2] = Math.abs(z) > EXT ? -n[2] : n[2];
    k += 3;
    t[kt] = (mx + EXT) / (2 * EXT); t[kt + 1] = (mz + EXT) / (2 * EXT); kt += 2;
  }
  for (var j = 0; j < nz; j++) {
    var az = z0 + j * step, bz = Math.min(z1, az + step);
    for (var i = 0; i < nx; i++) {
      var ax = x0 + i * step, bx = Math.min(x1, ax + step);
      /* a quad wholly inside the map is the ground's, not the apron's */
      if (ax >= -EXT && bx <= EXT && az >= -EXT && bz <= EXT) continue;
      v(ax, az); v(bx, az); v(bx, bz);
      v(ax, az); v(bx, bz); v(ax, bz);
    }
  }
  R3.apronVerts = k / 3;
  gl.bindBuffer(gl.ARRAY_BUFFER, R3.apronBuf); gl.bufferData(gl.ARRAY_BUFFER, q.subarray(0, k), gl.DYNAMIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, R3.apronNB); gl.bufferData(gl.ARRAY_BUFFER, nb.subarray(0, k), gl.DYNAMIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, R3.apronUV); gl.bufferData(gl.ARRAY_BUFFER, t.subarray(0, kt), gl.DYNAMIC_DRAW);
}

/* The apron onto program P's attributes, as _r3dGroundBind puts the ground there. */
function _r3dApronBind(gl, R3, P) {
  var at = [['aP', R3.apronBuf, 3], ['aN', R3.apronNB, 3], ['aT', R3.apronUV, 2]];
  for (var i = 0; i < at.length; i++) {
    var a = gl.getAttribLocation(P, at[i][0]);
    if (a < 0) continue;
    gl.bindBuffer(gl.ARRAY_BUFFER, at[i][1]);
    gl.enableVertexAttribArray(a);
    gl.vertexAttribPointer(a, at[i][2], gl.FLOAT, false, 0, 0);
  }
}

/* Drawn straight after the ground, through the ground's own program (still bound): the
   materials read at the mirrored point (uMir), the sea painted from its mask, and the whole of
   it fading to the horizon with its distance outside the map. Only on the materials ground -
   the legacy baked picture has nothing to mirror. */
function _r3dApronDraw(gl, R3, G) {
  if (!R3.apronVerts || !R3.matOn || window.RTS_APRON_OFF || !_r3dQ('apron')) return;
  var P = R3.matP, EXT = RTS_N * RTS_TILE / 2, hz = _r3dHorizon(G);
  gl.uniform2f(gl.getUniformLocation(P, 'uMir'), 1, EXT);
  gl.uniform1f(gl.getUniformLocation(P, 'uApr'), 1);
  gl.uniform4f(gl.getUniformLocation(P, 'uHz'), hz[0], hz[1], hz[2], 1);
  gl.uniform2f(gl.getUniformLocation(P, 'uHzF'), R3D_APRON_FADE[0] * EXT, R3D_APRON_FADE[1] * EXT);
  if (R3.seaMaskTex) {
    /* unit 6, the mesh program's own for the mask: 7 is the roads' (road3d.js), and the sea on
       it made the road paint the whole apron */
    gl.activeTexture(gl.TEXTURE0 + 6); gl.bindTexture(gl.TEXTURE_2D, R3.seaMaskTex); gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(gl.getUniformLocation(P, 'uSeaA'), 6);
    gl.uniform1f(gl.getUniformLocation(P, 'uSeaOn'), R3.shelfAmt === 0 ? 1 : 2);   /* 2: with the shallows, shelf3d.js */
  }
  _r3dApronBind(gl, R3, P);
  gl.drawArrays(gl.TRIANGLES, 0, R3.apronVerts);
  gl.uniform2f(gl.getUniformLocation(P, 'uMir'), 0, EXT);
  gl.uniform1f(gl.getUniformLocation(P, 'uApr'), 0);
  gl.uniform4f(gl.getUniformLocation(P, 'uHz'), 0, 0, 0, 0);
  gl.uniform1f(gl.getUniformLocation(P, 'uSeaOn'), 0);
}

/* ...and in the shroud's pass, with the shroud's program bound and its texture on: the apron's
   texture coordinates are the mirrored ones, so it is dark where what it reflects is. */
function _r3dApronFog(gl, R3) {
  if (!R3.apronVerts || !R3.matOn || window.RTS_APRON_OFF || !_r3dQ('apron')) return;
  _r3dApronBind(gl, R3, R3.texP);
  gl.drawArrays(gl.TRIANGLES, 0, R3.apronVerts);
}
