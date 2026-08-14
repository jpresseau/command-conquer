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
  /* Positions stay float; normals and colours pack to bytes. At this system's scale - the
     world batches alone are several hundred thousand triangles - attribute width is the real
     budget: floats everywhere is 36 bytes a vertex and packing the two attributes that never
     needed the precision brings it to 18, which is the difference between a phone keeping the
     3D mode and dropping the tab. Normals are normalised here because Int8 cannot carry the
     unnormalised cross products the emitter produces; the shader normalises anyway, so
     nothing downstream changes. */
  function fbuf(a) {
    var b2 = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b2);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(a), gl.STATIC_DRAW);
    return b2;
  }
  var nrm8 = new Int8Array(nrm.length), col8 = new Uint8Array(col.length);
  for (var ni = 0; ni < nrm.length; ni += 3) {
    var nl = Math.hypot(nrm[ni], nrm[ni + 1], nrm[ni + 2]) || 1;
    nrm8[ni] = Math.round(nrm[ni] / nl * 127);
    nrm8[ni + 1] = Math.round(nrm[ni + 1] / nl * 127);
    nrm8[ni + 2] = Math.round(nrm[ni + 2] / nl * 127);
  }
  for (var ci = 0; ci < col.length; ci++) col8[ci] = Math.round(col[ci] * 255);
  function bbuf(a) {
    var b3 = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b3);
    gl.bufferData(gl.ARRAY_BUFFER, a, gl.STATIC_DRAW);
    return b3;
  }
  return { p: fbuf(pos), n: bbuf(nrm8), c: bbuf(col8), verts: pos.length / 3 };
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
   The fog is rebuilt every frame: RTS_N^2 pixels is a 128x128 image, far below the cost of
   worrying about dirty flags.

   THE TWO TEXTURES WANT OPPOSITE MAGNIFICATION FILTERS, and sharing one setting made the
   ground the blurriest thing in the mode that is supposed to look better.

   The ground is PIXEL ART. The 2D renderer draws it with imageSmoothingEnabled = false, on
   purpose and at length: art at 24 px a cell magnified to 48 or 144 device pixels has to land
   on hard pixel blocks, because the alternative is not more detail, it is the same detail
   smeared. Sampling it LINEAR here did exactly that smearing - at max zoom the ground is
   magnified about six times, so every baked pixel became a six-pixel gradient and the 3D
   ground read as mud while the 2D ground beside it read as ground. MAG is NEAREST now, which
   is the same picture the 2D mode draws.

   MINIFICATION is the other way round: zoomed out, one screen pixel covers several baked
   pixels, and NEAREST there drops whichever texel it happens to land on and shimmers as the
   camera pans. So MIN stays LINEAR. (No mipmaps: the terrain canvas is 3072 square, which is
   not a power of two, and WebGL1 will not mip an NPOT texture.)

   The fog is NOT pixel art - it is one texel per CELL, a signal at 1/24th the ground's
   resolution, and its whole job is to be a soft boundary. LINEAR magnification is what turns
   the 2D mode's hard black cell-steps into a soft edge for free, so it keeps it. */
function _r3dTexture(gl, old, mag) {
  var t = old || gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, mag || gl.LINEAR);
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
  var invD = 1 / _r3dEyeDist();
  var vb = _r3dViewBounds();

  if (R3.terrainDirty && R.terrain) {
    R3.terrainTex = _r3dTexture(gl, R3.terrainTex, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, R.terrain);
    R3.terrainDirty = false;
  }
  _r3dFog(G);

  /* THE GROUND STAYS ONE STATIC QUAD OVER THE WHOLE MAP, and under a perspective camera that
     is a claim worth measuring rather than assuming: with the eye a couple of screen-heights
     in front of the focus, a good part of a 512-unit plane is BEHIND it. At the top zoom the
     eye plane cuts the map 242 world units south of the focus, and with the camera against the
     north edge the quad reaches 478 past that.

     A vertex behind the eye is the classic way to smear a triangle across the screen - but
     only if something clamps w, and nothing here does (see the note above R3D_MESH_VS). The
     hardware's own homogeneous clipping cuts the quad at the eye plane instead, which is
     exact. Rebuilding the quad per frame from the visible patch was written and measured
     against this: at the map centre, at the north edge, at the top zoom, the two versions
     differ on 0.26% to 1.4% of pixels and every bit of it is sub-texel rounding - the ground
     texture lands within one texel of where the projection says in 99.2% of samples against
     98.3% - and the clipped quad IS the visible patch, so it rasterises the same area either
     way. The rebuild bought a rounding difference and an upload per frame, so it went. */
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
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);

  /* --- ground --- */
  gl.useProgram(R3.texP);
  gl.uniform4fv(gl.getUniformLocation(R3.texP, 'uCam'), cam);
  gl.uniform2f(gl.getUniformLocation(R3.texP, 'uTilt'), R3.cp, R3.sp);
  gl.uniform1f(gl.getUniformLocation(R3.texP, 'uInvD'), invD);
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
  gl.uniform1f(gl.getUniformLocation(R3.meshP, 'uInvD'), invD);
  var uPos = gl.getUniformLocation(R3.meshP, 'uPos');
  var uRot = gl.getUniformLocation(R3.meshP, 'uRot');
  var uScale = gl.getUniformLocation(R3.meshP, 'uScale');
  var uScaleY = gl.getUniformLocation(R3.meshP, 'uScaleY');
  var uTint = gl.getUniformLocation(R3.meshP, 'uTint');
  var uA = gl.getUniformLocation(R3.meshP, 'uA');
  var uShadow = gl.getUniformLocation(R3.meshP, 'uShadow');
  gl.uniform1f(uA, 1);
  gl.uniform3f(uShadow, 0, 0, 0);
  var shadowMode = 0;
  var aP = gl.getAttribLocation(R3.meshP, 'aP');
  var aN = gl.getAttribLocation(R3.meshP, 'aN');
  var aC = gl.getAttribLocation(R3.meshP, 'aC');
  var ART2W = RTS_TILE / RTS_TS;

  function draw(mesh, x, y2, zz, rot, scale, dim, sy) {
    if (!mesh) return;
    gl.uniform3f(uPos, x, y2, zz);
    gl.uniform2f(uRot, Math.cos(rot), Math.sin(rot));
    gl.uniform1f(uScale, scale);
    gl.uniform1f(uScaleY, sy || 1);
    if (shadowMode) gl.uniform3f(uTint, 0, 0, 0);
    else gl.uniform3f(uTint, dim ? 0.62 : 1, dim ? 0.55 : 1, dim ? 0.55 : 1);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.p);
    gl.enableVertexAttribArray(aP); gl.vertexAttribPointer(aP, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.n);
    gl.enableVertexAttribArray(aN); gl.vertexAttribPointer(aN, 3, gl.BYTE, true, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.c);
    gl.enableVertexAttribArray(aC); gl.vertexAttribPointer(aC, 3, gl.UNSIGNED_BYTE, true, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, mesh.verts);
  }

  /* --- the world's own geometry: forests, ridges, ore crystals, grass - see world3d.js ---
     The static world is ~1M triangles in per-chunk buffers; only the chunks whose AABB
     intersects the view are drawn, so the vertex stage pays for what is on screen, not for
     the map. The view rect comes from _r3dViewBounds - the same inverse of the shader's
     projection that sizes the ground quad, so a camera change moves both together - widened
     on the near side by the tallest geometry's screen lift, because a tree just past the
     bottom edge still shows its crown. */
  _r3dWorldTick(G);
  if (R3.world) {
    /* identity placement: the batches are baked in world space, so they draw as-is */
    gl.uniform3f(uPos, 0, 0, 0);
    gl.uniform2f(uRot, 1, 0);
    gl.uniform1f(uScale, 1);
    gl.uniform1f(uScaleY, 1);
    gl.uniform3f(uTint, 1, 1, 1);
    var lift = R3D_WORLD_YMAX * R3.sp / R3.cp;
    var batches = R3.world.concat([R3.oreMesh]);
    for (var wb = 0; wb < batches.length; wb++) {
      var bm = batches[wb];
      if (!bm || !bm.verts) continue;
      if (bm.x1 !== undefined &&
          (bm.x1 < vb.x0 - 4 || bm.x0 > vb.x1 + 4 ||
           bm.z1 < vb.z0 || bm.z0 > vb.z1 + lift)) continue;
      gl.bindBuffer(gl.ARRAY_BUFFER, bm.p);
      gl.enableVertexAttribArray(aP); gl.vertexAttribPointer(aP, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, bm.n);
      gl.enableVertexAttribArray(aN); gl.vertexAttribPointer(aN, 3, gl.BYTE, true, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, bm.c);
      gl.enableVertexAttribArray(aC); gl.vertexAttribPointer(aC, 3, gl.UNSIGNED_BYTE, true, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, bm.verts);
    }
  }

  /* CAST SHADOWS, under everything the player put on the map. These were BLOB DISCS - one
     flat circle per unit, sized off its collision radius - which grounds a mesh and says
     nothing else: every unit had the same round shadow, buildings had none at all, and an
     aircraft's disc sat directly under it as though it were parked.

     They are the real mesh now, squashed onto the ground along the light (see R3D_SHADOW_SX
     in gl3d.js). A tank's shadow is tank-shaped and turns with its hull, a power plant's has
     its chimneys, a helicopter's lies away from it by its altitude - which is the cue that
     says "flying" rather than "drawn slightly larger". It is one extra draw per entity through
     the program that was already bound, with uShadow doing the flattening in the vertex stage,
     so no second mesh is built and no second program is compiled.

     THE STENCIL IS NOT OPTIONAL WHERE IT EXISTS. A planar shadow puts every face of a model on
     the same patch of ground, so a six-sided box blends six times over and comes out a solid
     black blot with the silhouette lost inside it. Stamping each pixel once is what leaves a
     shadow. Where the buffer is missing the pass still runs unmasked - darker where a model
     overlaps itself, but a shadow rather than nothing.

     Depth WRITES off, so the shadows never punch holes in the buffer that the meshes standing
     on them would then fail against; depth TEST on, so a shadow cast behind a ridge is hidden
     by it. The world's own trees and rock do not cast: they are ~1M triangles behind a chunk
     cull and drawing them twice is the one thing here that would not fit the frame budget. */
  gl.depthMask(false);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  if (R3.stencil) {
    gl.enable(gl.STENCIL_TEST);
    gl.stencilFunc(gl.EQUAL, 0, 0xFF);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.INCR);
  }
  gl.uniform1f(uA, R3D_SHADOW_A);
  gl.uniform3f(uShadow, R3D_SHADOW_SX, R3D_SHADOW_SZ, 1);
  shadowMode = 1;
  paintEntities();
  shadowMode = 0;
  gl.uniform3f(uShadow, 0, 0, 0);
  gl.uniform1f(uA, 1);
  if (R3.stencil) gl.disable(gl.STENCIL_TEST);
  gl.disable(gl.BLEND);
  gl.depthMask(true);

  function paintEntities() {
  for (var i = 0; i < G.ents.length; i++) {
    var e = G.ents[i];
    if (e.dead) continue;
    if (e.type === 'struct') {
      /* A BUILDING UNDER CONSTRUCTION RISES OUT OF THE GROUND. The 2D reveal is a wipe, which
         has no 3D analogue; height is the 3D-native equivalent, and it reads instantly as
         "being built" from any distance. Slightly dim while rising so a half-built structure
         is not mistaken for a finished one at full height's last moment. */
      var dmg = !e.building && e.hp < e.maxHp * RTS_COND_YELLOW;
      var rise = e.building ? 0.12 + 0.88 * Math.max(0, Math.min(1, e.bprog || 0)) : 1;
      draw(_r3dMesh('b', e.def, e.side), e.x, 0, e.z, 0, ART2W, dmg || e.building, rise);
    } else if (e.type === 'unit') {
      var turret = R.spr.turret && R.spr.turret[e.side] && R.spr.turret[e.side][e.def];
      var y = e.air ? ((e.rearming > 0 ? 2 : (e.alt || 12)) * 0.35) : 0;
      /* A MARCHING SOLDIER BOBS. There is no walk cycle in 3D - the mesh is one pose - so the
         walk reads through a small vertical bob instead, phased by the same `gait` offset that
         desynchronises the 2D walk frames, so a squad does not pogo in unison. Vehicles do not
         bob; tracks do not walk. */
      var d2 = rtsUnitDef(e.def);
      if (d2.kind === 'infantry' && e.path && !e.prone) {
        y += Math.abs(Math.sin(G.t * 9 + (e.gait || 0) * 0.8)) * 0.45;
      }
      draw(_r3dMesh('u', e.def, e.side, turret ? 'hull' : null, e.prone),
           e.x, y, e.z, -e.rot, ART2W, false);
      if (turret) {
        draw(_r3dMesh('u', e.def, e.side, 'turret', false), e.x, y, e.z, -(e.turret || 0), ART2W, false);
      }
    }
  }
  }
  paintEntities();

  /* --- fog, over everything, depth ignored --- */
  gl.useProgram(R3.texP);
  gl.uniform4fv(gl.getUniformLocation(R3.texP, 'uCam'), cam);
  gl.uniform2f(gl.getUniformLocation(R3.texP, 'uTilt'), R3.cp, R3.sp);
  gl.uniform1f(gl.getUniformLocation(R3.texP, 'uInvD'), invD);
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
