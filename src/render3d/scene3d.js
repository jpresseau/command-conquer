/* render3d/scene3d.js - what the 3D mode draws each frame: the mesh cache, the ground and
   fog textures, and the frame walk. Part of rts.render3d.

   ONE BUFFER PER MODEL, ONE DRAW PER ENTITY. A model is fetched once - buildings through
   _sprBuildingModel, units through _sprUnitModel, the same functions the sprite baker uses -
   fan-triangulated with per-face normals, and uploaded. Every entity of that type then draws
   the shared buffer with its own position, yaw and tint as uniforms. A battle is a few hundred
   entities of a few dozen types, so the geometry cost is paid once at first sight of a type
   and the per-frame cost is uniform uploads. */

function _r3dBuildMesh(gl, faces) {
  var pos = [], nrm = [], col = [];
  for (var fi = 0; fi < faces.length; fi++) {
    var f = faces[fi], v = f.v;
    var r = f.c[0] / 255, gc = f.c[1] / 255, b = f.c[2] / 255;
    /* face normal from the first three vertices - the primitives emit planar faces */
    var ax = v[1][0] - v[0][0], ay = v[1][1] - v[0][1], az = v[1][2] - v[0][2];
    var bx = v[2][0] - v[0][0], by = v[2][1] - v[0][1], bz = v[2][2] - v[0][2];
    var nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    for (var k = 2; k < v.length; k++) {
      var tri = [v[0], v[k - 1], v[k]];
      for (var t = 0; t < 3; t++) {
        pos.push(tri[t][0], tri[t][1], tri[t][2]);
        nrm.push(nx, ny, nz);
        col.push(r, gc, b);
      }
    }
  }
  function buf(a) {
    var b2 = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b2);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(a), gl.STATIC_DRAW);
    return b2;
  }
  return { p: buf(pos), n: buf(nrm), c: buf(col), verts: pos.length / 3 };
}

/* The cache key carries everything that changes the geometry or its colours: type, side,
   turret half, prone. A miss builds the model through the same functions the baker uses, so
   the two pipelines cannot drift apart - there is no second copy of any shape. */
function _r3dMesh(kind, def, side, part, prone) {
  var R3 = window._R3D, key = kind + ':' + def + ':' + side + ':' + (part || '') + ':' + (prone ? 1 : 0);
  var m = R3.mesh[key];
  if (m !== undefined) return m;
  var faces = null;
  try {
    faces = (kind === 'b') ? _sprBuildingModel(def, side)
                           : _sprUnitModel(def, side, !!prone, part || null);
  } catch (e) { faces = null; }
  m = (faces && faces.length) ? _r3dBuildMesh(R3.gl, faces) : null;
  R3.mesh[key] = m;
  return m;
}

/* ------------------------------------------------------------------ textures --
   The ground texture IS the 2D renderer's baked terrain canvas, so scorch marks, craters and
   corpses stamped into it appear in 3D too - frame.js sets terrainDirty when it stamps.
   The fog is rebuilt every frame: RTS_N^2 pixels is a 160x160 image, far below the cost of
   worrying about dirty flags, and sampling it LINEAR is what turns the 2D mode's hard black
   cell-steps into a soft-edged boundary for free. */
function _r3dTexture(gl, old) {
  var t = old || gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}
function _r3dFog(G) {
  var R3 = window._R3D, gl = R3.gl, N = RTS_N;
  if (!R3.fogCv) {
    R3.fogCv = document.createElement('canvas');
    R3.fogCv.width = N; R3.fogCv.height = N;
    R3.fogG = R3.fogCv.getContext('2d');
    R3.fogIm = R3.fogG.createImageData(N, N);
  }
  var d = R3.fogIm.data;
  for (var i = 0; i < N * N; i++) {
    var a = G.mapped[i] ? (G.vis[i] ? 0 : Math.round(255 * RTS_FOG_DIM)) : 255;
    d[i * 4] = 4; d[i * 4 + 1] = 6; d[i * 4 + 2] = 9; d[i * 4 + 3] = a;
  }
  R3.fogG.putImageData(R3.fogIm, 0, 0);
  R3.fogTex = _r3dTexture(gl, R3.fogTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, R3.fogCv);
}

/* ------------------------------------------------------------------ the frame --
   Ground, then every entity, then the fog over the lot - the same order the 2D painter uses,
   with the depth buffer replacing the painter's sort for everything solid. */
function _r3dFrame(G) {
  var R3 = window._R3D, gl = R3.gl, R = _rtsR;
  _r3dResize();

  /* uniforms shared by both programs */
  /* _rtsZoom is screen px per world unit in CSS pixels; the canvas backing store is device
     pixels, so the clip-space scale carries R.dpr - drop it and the two renderers disagree by
     exactly the device pixel ratio, which reads as clicks landing beside units on any laptop
     with display scaling. */
  var z = _rtsZoom();
  var cam = [R.focus.x, R.focus.z, 2 * z * R.dpr / R3.cv.width, 2 * z * R.dpr / R3.cv.height];

  if (R3.terrainDirty && R.terrain) {
    R3.terrainTex = _r3dTexture(gl, R3.terrainTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, R.terrain);
    R3.terrainDirty = false;
  }
  _r3dFog(G);

  if (!R3.groundBuf) {
    var EXT = RTS_N * RTS_TILE / 2;
    var xz = [-EXT, -EXT, EXT, -EXT, EXT, EXT, -EXT, -EXT, EXT, EXT, -EXT, EXT];
    var uv = [0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1];
    function buf(a) {
      var b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(a), gl.STATIC_DRAW);
      return b;
    }
    R3.groundBuf = buf(xz); R3.groundUV = buf(uv);
  }

  gl.clearColor(0.016, 0.024, 0.035, 1);
  gl.enable(gl.DEPTH_TEST);
  gl.disable(gl.BLEND);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  /* --- ground --- */
  gl.useProgram(R3.texP);
  gl.uniform4fv(gl.getUniformLocation(R3.texP, 'uCam'), cam);
  gl.uniform2f(gl.getUniformLocation(R3.texP, 'uTilt'), R3.cp, R3.sp);
  gl.uniform1f(gl.getUniformLocation(R3.texP, 'uA'), 1);
  var aXZ = gl.getAttribLocation(R3.texP, 'aXZ'), aT = gl.getAttribLocation(R3.texP, 'aT');
  gl.bindBuffer(gl.ARRAY_BUFFER, R3.groundBuf);
  gl.enableVertexAttribArray(aXZ); gl.vertexAttribPointer(aXZ, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, R3.groundUV);
  gl.enableVertexAttribArray(aT); gl.vertexAttribPointer(aT, 2, gl.FLOAT, false, 0, 0);
  gl.bindTexture(gl.TEXTURE_2D, R3.terrainTex);
  gl.drawArrays(gl.TRIANGLES, 0, 6);

  /* --- entities --- */
  gl.useProgram(R3.meshP);
  gl.uniform4fv(gl.getUniformLocation(R3.meshP, 'uCam'), cam);
  gl.uniform2f(gl.getUniformLocation(R3.meshP, 'uTilt'), R3.cp, R3.sp);
  var uPos = gl.getUniformLocation(R3.meshP, 'uPos');
  var uRot = gl.getUniformLocation(R3.meshP, 'uRot');
  var uScale = gl.getUniformLocation(R3.meshP, 'uScale');
  var uTint = gl.getUniformLocation(R3.meshP, 'uTint');
  var aP = gl.getAttribLocation(R3.meshP, 'aP');
  var aN = gl.getAttribLocation(R3.meshP, 'aN');
  var aC = gl.getAttribLocation(R3.meshP, 'aC');
  var ART2W = RTS_TILE / RTS_TS;

  function draw(mesh, x, y2, zz, rot, scale, dim) {
    if (!mesh) return;
    gl.uniform3f(uPos, x, y2, zz);
    gl.uniform2f(uRot, Math.cos(rot), Math.sin(rot));
    gl.uniform1f(uScale, scale);
    gl.uniform3f(uTint, dim ? 0.62 : 1, dim ? 0.55 : 1, dim ? 0.55 : 1);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.p);
    gl.enableVertexAttribArray(aP); gl.vertexAttribPointer(aP, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.n);
    gl.enableVertexAttribArray(aN); gl.vertexAttribPointer(aN, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.c);
    gl.enableVertexAttribArray(aC); gl.vertexAttribPointer(aC, 3, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, mesh.verts);
  }

  for (var i = 0; i < G.ents.length; i++) {
    var e = G.ents[i];
    if (e.dead) continue;
    if (e.type === 'struct') {
      /* a building going up shows at reduced height via scale-y? No: the 2D reveal is a wipe,
         which has no 3D analogue - a rising build is honest and cheap, scaling y alone would
         need a second scale uniform. Slice one: draw it dim until it stands. */
      var dmg = !e.building && e.hp < e.maxHp * RTS_COND_YELLOW;
      draw(_r3dMesh('b', e.def, e.side), e.x, 0, e.z, 0, ART2W, dmg || e.building);
    } else if (e.type === 'unit') {
      var turret = R.spr.turret && R.spr.turret[e.side] && R.spr.turret[e.side][e.def];
      var y = e.air ? ((e.rearming > 0 ? 2 : (e.alt || 12)) * 0.35) : 0;
      draw(_r3dMesh('u', e.def, e.side, turret ? 'hull' : null, e.prone),
           e.x, y, e.z, -e.rot, ART2W, false);
      if (turret) {
        draw(_r3dMesh('u', e.def, e.side, 'turret', false), e.x, y, e.z, -(e.turret || 0), ART2W, false);
      }
    }
  }

  /* --- fog, over everything, depth ignored --- */
  gl.useProgram(R3.texP);
  gl.uniform4fv(gl.getUniformLocation(R3.texP, 'uCam'), cam);
  gl.uniform2f(gl.getUniformLocation(R3.texP, 'uTilt'), R3.cp, R3.sp);
  gl.uniform1f(gl.getUniformLocation(R3.texP, 'uA'), 1);
  gl.disable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.bindBuffer(gl.ARRAY_BUFFER, R3.groundBuf);
  gl.enableVertexAttribArray(aXZ); gl.vertexAttribPointer(aXZ, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, R3.groundUV);
  gl.enableVertexAttribArray(aT); gl.vertexAttribPointer(aT, 2, gl.FLOAT, false, 0, 0);
  gl.bindTexture(gl.TEXTURE_2D, R3.fogTex);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  gl.disable(gl.BLEND);
}
