/* render3d/scene3d.js - what the 3D mode draws each frame: the mesh cache, the ground and
   fog textures, and the frame walk. Part of rts.render3d.

   ONE BUFFER PER MODEL, ONE DRAW PER ENTITY. A model is fetched once - buildings through
   _sprBuildingModel, units through _sprUnitModel, the same functions the sprite baker uses -
   fan-triangulated with per-face normals, and uploaded. Every entity of that type then draws
   the shared buffer with its own position, yaw and tint as uniforms. A battle is a few hundred
   entities of a few dozen types, so the geometry cost is paid once at first sight of a type
   and the per-frame cost is uniform uploads. */

function _r3dBuildMesh(gl, faces) {
  var pos = [], nrm = [], col = [], fi;
  for (fi = 0; fi < faces.length; fi++) {
    var f = faces[fi], v = f.v;
    var r = f.c[0] / 255, gc = f.c[1] / 255, b = f.c[2] / 255;
    /* face normal from the first three vertices - the primitives emit planar faces */
    var ax = v[1][0] - v[0][0], ay = v[1][1] - v[0][1], az = v[1][2] - v[0][2];
    var bx = v[2][0] - v[0][0], by = v[2][1] - v[0][1], bz = v[2][2] - v[0][2];
    var nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    /* UNLESS THE FACE CAME WITH ITS OWN. A cylinder, cone or vault emits one normal per corner
       (see _r3Cyl in r3d/primitives.js), which is what turns a ring of flat strips into a
       curve once the fragment stage interpolates them. Everything else - every box, slab,
       gable and cap - has no such field and is flat, which is what it should be. */
    var fnv = f.n;
    for (var k = 2; k < v.length; k++) {
      var idx = [0, k - 1, k];
      for (var t = 0; t < 3; t++) {
        var vi = idx[t], p = v[vi];
        pos.push(p[0], p[1], p[2]);
        if (fnv) nrm.push(fnv[vi][0], fnv[vi][1], fnv[vi][2]);
        else nrm.push(nx, ny, nz);
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

  /* The two programs the world can be drawn through: the one the player sees, and the sun's.
     Looked up here so the shadow pass below and the main pass below that share one walk. */
  function ctx(P) {
    return { P: P,
      uPos: gl.getUniformLocation(P, 'uPos'), uRot: gl.getUniformLocation(P, 'uRot'),
      uScale: gl.getUniformLocation(P, 'uScale'), uScaleY: gl.getUniformLocation(P, 'uScaleY'),
      uTint: gl.getUniformLocation(P, 'uTint'), uA: gl.getUniformLocation(P, 'uA'),
      uWave: gl.getUniformLocation(P, 'uWave'),
      aP: gl.getAttribLocation(P, 'aP'), aN: gl.getAttribLocation(P, 'aN'),
      aC: gl.getAttribLocation(P, 'aC') };
  }
  var MC = ctx(R3.meshP);
  /* ART pixels to world units. Declared HERE rather than beside the entity walk it feeds,
     because the sun's pass runs that walk before the main pass reaches it - and a `var`
     assigned later is `undefined` when the earlier caller reads it, which reaches the shader
     as a NaN scale and drops every entity out of the shadow map without an error anywhere. */
  var ART2W = RTS_TILE / RTS_TS;

  if (R3.terrainDirty && R.terrain) {
    R3.terrainTex = _r3dTexture(gl, R3.terrainTex, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, R.terrain);
    R3.terrainDirty = false;
  }
  _r3dFog(G);

  /* THE GROUND IS THE VISIBLE PATCH, REBUILT EACH FRAME, AND THE REASON IS DEPTH.

     It used to be one static quad over the whole map, on a measurement that was real but
     answered the wrong question. With the eye a couple of screen-heights in front of the
     focus, a good part of a 512-unit plane is BEHIND it: at the top zoom the eye plane cuts
     the map 242 units south of the focus, and against the north edge the quad reaches 478
     past that. The hardware's homogeneous clipping cuts such a quad at the eye plane, and the
     COLOUR that comes out is right - measured, the static quad and the rebuilt one differ on
     0.26% to 1.4% of pixels and all of it is sub-texel rounding. So the rebuild looked like an
     upload per frame bought for nothing, and it was removed.

     The colour is not the only thing a triangle carries. Once clipped at w = 0, the surviving
     vertices sit at enormous screen coordinates, and the perspective-correct interpolation of
     z/w and 1/w across them loses all its precision - so the DEPTH the ground writes is
     garbage. Measured on a bare map: the ground should span d = -14 to +11 across the screen
     and instead writes a near-constant -88, which is off the map's whole depth range. Nothing
     read the ground's depth before, so nothing noticed; the moment anything does - occlusion,
     depth fog, anything sampling the buffer - the entire floor of the world is missing from
     it, which is most of the frame.

     The visible patch cannot have this problem, because by construction it stops where the
     ground stops being visible: its near edge sits at d = 18 against an eye distance of 128,
     so no vertex comes near the eye plane. Clamped to the map, so the area beyond the map's
     edge shows the background exactly as it did before.

     AND IT IS TESSELLATED, for a second reason that only shows up in the depth buffer. This
     renderer writes LINEAR depth on purpose - gl_Position.z is -d/RANGE premultiplied by w, so
     the buffer holds -d/RANGE rather than the usual function of 1/d. The usual one is chosen
     precisely because it is linear in SCREEN space, which is the space the rasteriser
     interpolates in; -d/RANGE is not, so depth is exact at a vertex and drifts between them,
     by more the bigger the triangle. Measured at the screen centre, where the ground point is
     the focus and d must be exactly 0: the map-sized quad wrote -88, the untessellated visible
     patch -4.7, and an 8x8 patch 0.06. Small triangles have always hidden this - every mesh in
     the scene is centimetres across - which is why it survived until something read the floor.

     The cost is 384 vertices of a buffer that is rewritten anyway, against a frame that draws
     tens of thousands. */
  var EXT = RTS_N * RTS_TILE / 2;
  if (!R3.groundBuf) {
    R3.groundBuf = gl.createBuffer();
    R3.groundUV = gl.createBuffer();
    R3.groundXZ = new Float32Array(R3D_GROUND_SUB * R3D_GROUND_SUB * 12);
    R3.groundT = new Float32Array(R3D_GROUND_SUB * R3D_GROUND_SUB * 12);
  }
  {
    var GM = RTS_TILE * 2;                  /* a two-cell margin, well clear of the eye plane */
    var gx0 = Math.max(-EXT, vb.x0 - GM), gx1 = Math.min(EXT, vb.x1 + GM);
    var gz0 = Math.max(-EXT, vb.z0 - GM), gz1 = Math.min(EXT, vb.z1 + GM);
    var q = R3.groundXZ, t = R3.groundT, k = 0, gi, gj;
    var gdx = (gx1 - gx0) / R3D_GROUND_SUB, gdz = (gz1 - gz0) / R3D_GROUND_SUB;
    function gv(x, zz) {
      q[k] = x; q[k + 1] = zz;
      t[k] = (x + EXT) / (2 * EXT); t[k + 1] = (zz + EXT) / (2 * EXT);
      k += 2;
    }
    for (gj = 0; gj < R3D_GROUND_SUB; gj++) {
      for (gi = 0; gi < R3D_GROUND_SUB; gi++) {
        var ax = gx0 + gi * gdx, bx = ax + gdx;
        var az = gz0 + gj * gdz, bz = az + gdz;
        gv(ax, az); gv(bx, az); gv(bx, bz);
        gv(ax, az); gv(bx, bz); gv(ax, bz);
      }
    }
    R3.groundVerts = k / 2;
    gl.bindBuffer(gl.ARRAY_BUFFER, R3.groundBuf);
    gl.bufferData(gl.ARRAY_BUFFER, q, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, R3.groundUV);
    gl.bufferData(gl.ARRAY_BUFFER, t, gl.DYNAMIC_DRAW);
  }

  /* THE WORLD IS BUILT BEFORE THE SUN LOOKS AT IT. _r3dWorldTick used to run in the middle of
     the frame, which was fine while nothing read the geometry before the main pass; the shadow
     pass does, and a first frame with no buffers casts no shadows. */
  _r3dWorldTick(G);

  /* --- the sun's view --- */
  /* Everything that stands up casts: the world's forests and ridges, the ore crystals, and
     every building and unit. The ground and the sea do not - both are effectively flat, and a
     flat surface's shadow is itself, which only feeds the bias. */
  if (R3.shadowReady) {
    _r3dShadowPass(G, function (P) {
      var SC = ctx(P);
      gl.uniform2f(SC.uWave, 0, 0);
      if (R3.world) {
        gl.uniform3f(SC.uPos, 0, 0, 0);
        gl.uniform2f(SC.uRot, 1, 0);
        gl.uniform1f(SC.uScale, 1);
        gl.uniform1f(SC.uScaleY, 1);
        var sb = R3.world.concat([R3.oreMesh]);
        for (var si = 0; si < sb.length; si++) {
          var sm = sb[si];
          if (!sm || !sm.verts) continue;
          /* culled against the SUN's span, not the camera's: a tree off the left of the screen
             can still throw its shadow into it */
          if (sm.x1 !== undefined &&
              (sm.x1 < R3.sunC[0] - R3.sunSpan || sm.x0 > R3.sunC[0] + R3.sunSpan ||
               sm.z1 < R3.sunC[2] - R3.sunSpan || sm.z0 > R3.sunC[2] + R3.sunSpan)) continue;
          bindMesh(SC, sm);
          gl.drawArrays(gl.TRIANGLES, 0, sm.verts);
        }
      }
      /* the sun's span plus the tallest thing that could lean into it */
      paintEntities(SC, [R3.sunC[0], R3.sunC[2], R3.sunSpan + R3D_WORLD_YMAX]);
    });
  }

  /* THE FRAME GOES INTO A BUFFER, NOT ONTO THE CANVAS - see post3d.js. A canvas's depth
     buffer cannot be sampled, and the ambient occlusion is computed from depth, so the world
     and everything standing on it are drawn offscreen and composited at the end. A driver that
     will not give the attachments leaves postReady false and everything below draws straight
     to the canvas exactly as it did before. */
  var post = R3.postReady && _r3dPostBegin(R3);

  gl.clearColor(0.016, 0.024, 0.035, 1);
  gl.enable(gl.DEPTH_TEST);
  gl.disable(gl.BLEND);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  /* --- ground --- */
  gl.useProgram(R3.texP);
  gl.uniform4fv(gl.getUniformLocation(R3.texP, 'uCam'), cam);
  gl.uniform2f(gl.getUniformLocation(R3.texP, 'uTilt'), R3.cp, R3.sp);
  gl.uniform1f(gl.getUniformLocation(R3.texP, 'uInvD'), invD);
  gl.uniform1f(gl.getUniformLocation(R3.texP, 'uA'), 1);
  var uRecv = gl.getUniformLocation(R3.texP, 'uRecv');
  gl.uniform1f(uRecv, 1);                       /* the ground takes the world's shadows */
  _r3dShadowBind(R3.texP, 1);
  var aXZ = gl.getAttribLocation(R3.texP, 'aXZ'), aT = gl.getAttribLocation(R3.texP, 'aT');
  gl.bindBuffer(gl.ARRAY_BUFFER, R3.groundBuf);
  gl.enableVertexAttribArray(aXZ); gl.vertexAttribPointer(aXZ, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, R3.groundUV);
  gl.enableVertexAttribArray(aT); gl.vertexAttribPointer(aT, 2, gl.FLOAT, false, 0, 0);
  gl.bindTexture(gl.TEXTURE_2D, R3.terrainTex);
  gl.drawArrays(gl.TRIANGLES, 0, R3.groundVerts);

  /* --- the ore stain, straight onto the ground it lies on ---
     The depth TEST is off for this, which also turns depth writing off: at this point the
     only thing in the buffer is the ground, so there is nothing for it to sort against, and
     leaving the ground's own depth untouched is what lets the crystals, the units and the
     cast shadows sort against the GROUND rather than against a film floating over it. */
  _r3dOreTex(G);
  if (R3.oreAny) {
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindTexture(gl.TEXTURE_2D, R3.oreTex);
    gl.drawArrays(gl.TRIANGLES, 0, R3.groundVerts);
    gl.disable(gl.BLEND);
    gl.enable(gl.DEPTH_TEST);
  }

  /* --- entities --- */
  gl.useProgram(R3.meshP);
  gl.uniform4fv(gl.getUniformLocation(R3.meshP, 'uCam'), cam);
  gl.uniform2f(gl.getUniformLocation(R3.meshP, 'uTilt'), R3.cp, R3.sp);
  gl.uniform1f(gl.getUniformLocation(R3.meshP, 'uInvD'), invD);
  _r3dShadowBind(R3.meshP, 1);
  var uPos = MC.uPos, uRot = MC.uRot, uScale = MC.uScale, uScaleY = MC.uScaleY;
  var uTint = MC.uTint, uA = MC.uA, uWave = MC.uWave;
  gl.uniform1f(uA, 1);
  gl.uniform2f(uWave, 0, 0);
  var aP = MC.aP, aN = MC.aN, aC = MC.aC;

  /* --- the sea, before anything else that stands in it ---
     Drawn with the world's identity placement, and with the clock in uWave. G.t rather than a
     frame counter: the swell has to run at the same speed however fast the machine draws.

     AND IT OVERWRITES THE GROUND'S DEPTH RATHER THAN COMPETING WITH IT. This is the fix for
     a hole that riddled every coastal map: the surface heaves +-0.90 world units about a
     sheet sitting 0.10 above the ground, so every TROUGH dipped below the ground plane, lost
     the depth test to it, and let the painted seabed through. Measured over open water at the
     top zoom, 28% of the sea was ground - and the fraction tracked the trough exactly: half
     the amplitude gave 14.5%, a flat sheet 0.08%, and lifting the sheet clear of the trough
     at 1.0 gave 0.83%. It read as hard-edged blue-grey blotches lying in the dark bands
     between the crests, which is where the troughs are.

     Lifting the sheet is not the fix, because it only moves the coupling: the sea would then
     float a world unit over the beach it meets, and the amplitude could never be raised again
     without the holes coming back. There is nothing under the sea that anyone should ever
     see, so the surface simply takes the depth: drawn HERE, where the ground and the ore stain
     are the only things in the buffer, with the comparison turned off so a trough wins as
     surely as a crest, and writing its own depth so the ships, the shore geometry and the
     effects that follow all sort against the water rather than against the seabed.

     ONE THING THAT HAS TO STAY TRUE: the surface must not occlude ITSELF, because with the
     comparison off the triangles land in mesh order rather than back to front. It cannot at
     this camera - the steepest slope the three waves can sum to is 0.454, which is 24.4
     degrees, against a line of sight 41 degrees above the horizontal (90 - R3D_TILT). The
     margin is a factor of 1.9 in slope, and e2e/sea guards it. */
  if (R3.waterMesh) {
    gl.uniform3f(uPos, 0, 0, 0);
    gl.uniform2f(uRot, 1, 0);
    gl.uniform1f(uScale, 1);
    gl.uniform1f(uScaleY, 1);
    gl.uniform3f(uTint, 1, 1, 1);
    gl.uniform2f(uWave, R3D_WAVE_AMP, G.t);
    gl.depthFunc(gl.ALWAYS);
    gl.bindBuffer(gl.ARRAY_BUFFER, R3.waterMesh.p);
    gl.enableVertexAttribArray(aP); gl.vertexAttribPointer(aP, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, R3.waterMesh.n);
    gl.enableVertexAttribArray(aN); gl.vertexAttribPointer(aN, 3, gl.BYTE, true, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, R3.waterMesh.c);
    gl.enableVertexAttribArray(aC); gl.vertexAttribPointer(aC, 3, gl.UNSIGNED_BYTE, true, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, R3.waterMesh.verts);
    gl.depthFunc(gl.LESS);
    gl.uniform2f(uWave, 0, 0);
  }

  /* THE SAME WALK FEEDS TWO PROGRAMS. Everything drawn in the main pass has to be drawn again
     from the sun, or its shadow is missing; and it has to be drawn the SAME WAY, or its shadow
     is somewhere else. Rather than keep two copies of the entity walk in step by hand, the
     placement uniforms and the position attribute are looked up per program into a context and
     the walk takes one. The sun's program has no normals, no colours and no tint - it only
     records how far away a thing is - so those locations come back null or -1 and the binder
     skips them, which is the only difference between the two passes. */
  function bindMesh(C, mesh) {
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.p);
    gl.enableVertexAttribArray(C.aP); gl.vertexAttribPointer(C.aP, 3, gl.FLOAT, false, 0, 0);
    if (C.aN >= 0) {
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.n);
      gl.enableVertexAttribArray(C.aN); gl.vertexAttribPointer(C.aN, 3, gl.BYTE, true, 0, 0);
    }
    if (C.aC >= 0) {
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.c);
      gl.enableVertexAttribArray(C.aC); gl.vertexAttribPointer(C.aC, 3, gl.UNSIGNED_BYTE, true, 0, 0);
    }
  }
  function drawIn(C, mesh, x, y2, zz, rot, scale, dim, sy) {
    if (!mesh) return;
    gl.uniform3f(C.uPos, x, y2, zz);
    gl.uniform2f(C.uRot, Math.cos(rot), Math.sin(rot));
    gl.uniform1f(C.uScale, scale);
    gl.uniform1f(C.uScaleY, sy || 1);
    if (C.uTint) gl.uniform3f(C.uTint, dim ? 0.62 : 1, dim ? 0.55 : 1, dim ? 0.55 : 1);
    bindMesh(C, mesh);
    gl.drawArrays(gl.TRIANGLES, 0, mesh.verts);
  }
  function draw(mesh, x, y2, zz, rot, scale, dim, sy) {
    drawIn(MC, mesh, x, y2, zz, rot, scale, dim, sy);
  }

  /* --- the world's own geometry: forests, ridges, ore crystals, grass - see world3d.js ---
     The static world is ~1M triangles in per-chunk buffers; only the chunks whose AABB
     intersects the view are drawn, so the vertex stage pays for what is on screen, not for
     the map. The view rect comes from _r3dViewBounds - the same inverse of the shader's
     projection that sizes the ground quad, so a camera change moves both together - widened
     on the near side by the tallest geometry's screen lift, because a tree just past the
     bottom edge still shows its crown. */
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

  /* The sea used to be drawn HERE, after the world batch. It is drawn before both now - see
     the note where it went: it has to lay down its depth while the ground is the only thing
     in the buffer. Nothing about the picture depended on it being late; opaque geometry with
     an honest depth sorts the same in any order, and its depth was the one thing that was
     not honest. */

  /* The planar cast-shadow pass stood here: every entity's mesh squashed flat onto the ground
     along the light, stencilled so each pixel took the shade once. The shadow MAP subsumes it
     and does more - a planar shadow only ever lands on the plane, so it put nothing on a
     ridge, nothing on another building, and nothing under a tree. What survives of it is the
     LIGHT DIRECTION it worked out, which render3d/shadow3d.js builds the sun's basis from. */

  /* `bound` culls to the sun's square. The main pass takes everything - the camera's own cull
     happens further up, per chunk - but the shadow pass covers a square about ninety world
     units across and was being handed EVERY entity in the match, the enemy base included.
     Those draws cannot mark a texel of the map and cost a full submission each; at a hundred
     units a side it is most of the roster once a game is under way. */
  function paintEntities(C, bound) {
  for (var i = 0; i < G.ents.length; i++) {
    var e = G.ents[i];
    if (e.dead) continue;
    if (bound && (Math.abs(e.x - bound[0]) > bound[2] || Math.abs(e.z - bound[1]) > bound[2])) continue;
    if (e.type === 'struct') {
      /* A BUILDING UNDER CONSTRUCTION RISES OUT OF THE GROUND. The 2D reveal is a wipe, which
         has no 3D analogue; height is the 3D-native equivalent, and it reads instantly as
         "being built" from any distance. Slightly dim while rising so a half-built structure
         is not mistaken for a finished one at full height's last moment. */
      var dmg = !e.building && e.hp < e.maxHp * RTS_COND_YELLOW;
      var rise = e.building ? 0.12 + 0.88 * Math.max(0, Math.min(1, e.bprog || 0)) : 1;
      drawIn(C, _r3dMesh('b', e.def, e.side), e.x, 0, e.z, 0, ART2W, dmg || e.building, rise);
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
      drawIn(C, _r3dMesh('u', e.def, e.side, turret ? 'hull' : null, e.prone),
             e.x, y, e.z, -e.rot, ART2W, false);
      if (turret) {
        drawIn(C, _r3dMesh('u', e.def, e.side, 'turret', false), e.x, y, e.z, -(e.turret || 0), ART2W, false);
      }
    }
  }
  }
  paintEntities(MC);

  /* THE EFFECTS, as quads standing in the world - see render3d/fx3d.js. Here, after everything
     with a surface and before the occlusion resolves, because they are the last thing that has
     a place in the scene and the first that must not contribute depth to it: a fireball is not
     a surface for the occlusion to find corners against. */
  if (G.fx && G.fx.length) {
    try { _r3dFxDraw(G, cam, invD); } catch (e) { R3.fxDrawn = -1; }
  }

  /* THE OCCLUSION, AND BACK TO THE CANVAS. Everything with a surface has now been drawn, so
     this is the last moment the depth buffer describes the world and nothing else. The fog
     below deliberately lands AFTER it: the shroud is not a surface, so it must neither be
     occluded nor occlude anything. */
  if (post) _r3dPostEnd(R3, cam, invD);

  /* --- fog, over everything, depth ignored --- */
  gl.useProgram(R3.texP);
  gl.uniform4fv(gl.getUniformLocation(R3.texP, 'uCam'), cam);
  gl.uniform2f(gl.getUniformLocation(R3.texP, 'uTilt'), R3.cp, R3.sp);
  gl.uniform1f(gl.getUniformLocation(R3.texP, 'uInvD'), invD);
  gl.uniform1f(gl.getUniformLocation(R3.texP, 'uA'), 1);
  gl.uniform1f(gl.getUniformLocation(R3.texP, 'uRecv'), 0);   /* the shroud is not a surface */
  gl.disable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.bindBuffer(gl.ARRAY_BUFFER, R3.groundBuf);
  gl.enableVertexAttribArray(aXZ); gl.vertexAttribPointer(aXZ, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, R3.groundUV);
  gl.enableVertexAttribArray(aT); gl.vertexAttribPointer(aT, 2, gl.FLOAT, false, 0, 0);
  gl.bindTexture(gl.TEXTURE_2D, R3.fogTex);
  gl.drawArrays(gl.TRIANGLES, 0, R3.groundVerts);
  gl.disable(gl.BLEND);
}
