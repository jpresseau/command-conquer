/* render3d/scene3d.js - the frame walk: what the 3D mode draws, and in what order.
   Part of rts.render3d.

   What it no longer holds, because the relief work took it over the per-file limit twice: the
   ground's textures, mesh and shader are render3d/ground3d.js, and the cache from a face list
   to GL buffers is render3d/mesh3d.js. Both were separable without argument - one is what the
   ground is made of and the other is how a model becomes a buffer, and neither has anything to
   say about the order the frame is drawn in, which is what is left here. */


/* ------------------------------------------------------------------ the frame --
   Ground, then every entity, then the fog over the lot - the same order the 2D painter uses,
   with the depth buffer replacing the painter's sort for everything solid. */
function _r3dFrame(G) {
  var R3 = window._R3D, gl = R3.gl, R = _rtsR;
  /* Resolved HERE and not beside the entity walk that uses it: the sun's pass runs a hundred
     lines earlier and sets the constant placement attributes through this, and a `var`
     assigned later is `undefined` when the earlier caller reads it. Same trap ART2W carries a
     note about below, and it fails the same way - at the first frame, in the shadow pass. */
  var I = R3.inst || (R3.inst = _r3dInstInit(gl, R3.gl2));
  /* How many placements this frame handed to the GPU, over both passes. Not used by the
     renderer at all - it is here because the one way this can go wrong WITHOUT changing the
     picture is for the buckets to stop being emptied, and drawing the same instances again
     and again is invisible on opaque depth-tested geometry. e2e/instanced watches it hold
     steady; the leak that prompted this made a spec take 113 seconds instead of 17 and passed
     every assertion about the frame. */
  R3.instDrawn = 0;
  _r3dResize();

  /* uniforms shared by both programs */
  /* _rtsZoom is screen px per world unit in CSS pixels; the canvas backing store is device
     pixels, so the clip-space scale carries R.dpr - drop it and the two renderers disagree by
     exactly the device pixel ratio, which reads as clicks landing beside units on any laptop
     with display scaling. */
  var z = _rtsZoom();
  /* R3.scale, NOT R.dpr. The two were the same number until the 3D buffer got its own cap
     (R3D_MAX_SCALE in gl3d.js), and the identity is what this line was written against: the
     product below is 2*z*scale / (cssPx*scale) = 2*z/cssPx, so it is invariant to the buffer's
     resolution ONLY while the numerator names the buffer's own scale. Leave R.dpr here with a
     capped buffer and the world is drawn dpr/scale too large - on a Galaxy S9+ that is twice
     over - while camera.js goes on projecting clicks at the right size, which is the exact
     "clicks land beside units" failure the note above warns about. */
  var cam = [R.focus.x, R.focus.z, 2 * z * R3.scale / R3.cv.width, 2 * z * R3.scale / R3.cv.height];
  var invD = 1 / _r3dEyeDist();
  var vb = _r3dViewBounds();

  /* The two programs the world can be drawn through: the one the player sees, and the sun's.
     Looked up here so the shadow pass below and the main pass below that share one walk. */
  function ctx(P) {
    return { P: P,
      uA: gl.getUniformLocation(P, 'uA'),
      uWave: gl.getUniformLocation(P, 'uWave'),
      aP: gl.getAttribLocation(P, 'aP'), aN: gl.getAttribLocation(P, 'aN'),
      aC: gl.getAttribLocation(P, 'aC'),
      /* placement, per instance now rather than per draw - render3d/inst3d.js */
      aI0: gl.getAttribLocation(P, 'aI0'), aI1: gl.getAttribLocation(P, 'aI1'),
      aI2: gl.getAttribLocation(P, 'aI2') };
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
  /* The visible ground patch - cut on the tile grid, carrying the terrain's height and its
     slope - is built by _r3dGroundMesh in render3d/ground3d.js, beside the textures draped
     over it. It moved there when the relief work took this file over the line limit. */
  _r3dGroundMesh(R3, gl, vb, EXT);


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
        _r3dInstConst(gl, I, SC, 0, 0, 0, 1, 1, 0, 1, 0, 0, 1, 0);
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
  /* ...and the grain the magnification destroyed, put back at device resolution. The 2D frame
     has done this for a long time; this pass never did, because the line that calls
     _rtsGroundDetail sits inside `if (!r3on)` in render/frame.js. See R3D_TEX_FS. */
  R3.grainMag = _r3dGrainSet(gl, R3, R3.texP);
  _r3dShadowBind(R3.texP, 1);
  var aXZ = gl.getAttribLocation(R3.texP, 'aP'), aT = gl.getAttribLocation(R3.texP, 'aT');
  var aGN = gl.getAttribLocation(R3.texP, 'aN');
  gl.bindBuffer(gl.ARRAY_BUFFER, R3.groundBuf);
  gl.enableVertexAttribArray(aXZ); gl.vertexAttribPointer(aXZ, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, R3.groundNB);
  gl.enableVertexAttribArray(aGN); gl.vertexAttribPointer(aGN, 3, gl.FLOAT, false, 0, 0);
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
  var uA = MC.uA, uWave = MC.uWave;
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
    _r3dInstConst(gl, I, MC, 0, 0, 0, 1, 1, 0, 1, 0, 0, 1, 0);
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
  /* UPRIGHT UNLESS TOLD OTHERWISE. `nrm` is the ground's normal under the thing being drawn;
     absent, it is world up and _lean is the identity (see place3d.js), which is what the world
     batch, the sea and every building want. It is set on EVERY draw rather than only when it
     changes, because the alternative is a leaked uniform: one unit on a slope followed by a
     building would put the building on the unit's hill. */
  var BATCH = null;
  function drawIn(C, mesh, x, y2, zz, rot, scale, dim, sy, nrm) {
    if (!mesh) return;
    /* R3.leanAmt exists so a spec can take the lean out WITHOUT taking the relief out - the
       same reason R3.aoAmt exists. Flattening G.height instead moves the ground, the shadows
       and the picking at the same time, and a frame that differs for four reasons says
       nothing about any of them. Blended toward up rather than switched, so 0 is exactly the
       upright draw this replaced.

       APPLIED HERE, where the normal is consumed, rather than at the one call site that
       passes one. It sat in the unit branch first, which made e2e/elevation's building
       CONTROL unfalsifiable: a building wrongly given a normal would have leaned at every
       setting of the knob, so the toggle moved nothing and "structures stay square" passed on
       a frame where they did not. A knob that only reaches the code you remembered to put it
       in cannot grade the code you forgot. */
    var lx = nrm ? nrm[0] : 0, ly = nrm ? nrm[1] : 1, lz2 = nrm ? nrm[2] : 0;
    var la = R3.leanAmt;
    if (la !== undefined && la !== 1) {
      var bx2 = lx * la, by2 = ly * la + (1 - la), bz2 = lz2 * la;
      var bl = Math.sqrt(bx2 * bx2 + by2 * by2 + bz2 * bz2) || 1;
      lx = bx2 / bl; ly = by2 / bl; lz2 = bz2 / bl;
    }
    /* COLLECTED, NOT DRAWN. The placement goes into the batch for this mesh and the whole
       batch leaves in one instanced call at the end of the walk - see render3d/inst3d.js.
       Where instancing is unavailable the batch is flushed one instance at a time through the
       same constant-attribute path everything else uses, which is the draw this replaced. */
    _r3dInstPush(BATCH, mesh, x, y2, zz, sy || 1,
                 Math.cos(rot), Math.sin(rot), scale, dim ? 1 : 0, lx, ly, lz2);
  }
  /* Hand every collected batch to the GPU. Grouping reorders the draws - entities come out by
     mesh rather than in entity order - which is invisible only because all of this is opaque
     and depth-tested. See the note at the top of inst3d.js before adding anything blended. */
  function flushBatch(C) {
    var B = BATCH, i, j;
    for (i = 0; i < B.order.length; i++) {
      var b = B.order[i];
      if (!b.n) continue;
      bindMesh(C, b.mesh);
      if (I.on) {
        var buf = _r3dInstBuffer(gl, R3);
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, b.a.subarray(0, b.n * R3D_INST_FLOATS), gl.STREAM_DRAW);
        _r3dInstBind(gl, I, C, buf);
        I.draw(gl.TRIANGLES, 0, b.mesh.verts, b.n);
        R3.instDrawn += b.n;
      } else {
        for (j = 0; j < b.n; j++) {
          var o = j * R3D_INST_FLOATS, a = b.a;
          _r3dInstConst(gl, I, C, a[o], a[o + 1], a[o + 2], a[o + 3],
                        a[o + 4], a[o + 5], a[o + 6], a[o + 7], a[o + 8], a[o + 9], a[o + 10]);
          gl.drawArrays(gl.TRIANGLES, 0, b.mesh.verts);
          R3.instDrawn++;
        }
      }
    }
    /* Leave the arrays off and the divisors at zero, or the next thing drawn through this
       program - the world batches, the sea, the ground - reads a tank's placement out of a
       buffer that is no longer bound to it. */
    _r3dInstConst(gl, I, C, 0, 0, 0, 1, 1, 0, 1, 0, 0, 1, 0);
  }
  function draw(mesh, x, y2, zz, rot, scale, dim, sy, nrm) {
    drawIn(MC, mesh, x, y2, zz, rot, scale, dim, sy, nrm);
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
    _r3dInstConst(gl, I, MC, 0, 0, 0, 1, 1, 0, 1, 0, 0, 1, 0);
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
  /* A fresh set of buckets for this pass. Both passes walk the same entities, but each has to
     leave its own batches on its own program - the sun's has no colour attribute and no tint. */
  BATCH = _r3dInstBatch(R3);
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
      drawIn(C, _r3dMesh('b', e.def, e.side), e.x, _rtsElev(e.x, e.z), e.z, 0, ART2W,
             dmg || e.building, rise);
    } else if (e.type === 'unit') {
      var turret = R.spr.turret && R.spr.turret[e.side] && R.spr.turret[e.side][e.def];
      /* THE GROUND UNDER IT, not zero. An aircraft's altitude is measured from the ground it
         is over as well - it flies at a height, not at a level - so both take the terrain and
         only the flier adds to it. */
      var y = _rtsElev(e.x, e.z) + (e.air ? ((e.rearming > 0 ? 2 : (e.alt || 12)) * 0.35) : 0);
      /* A MARCHING SOLDIER BOBS. There is no walk cycle in 3D - the mesh is one pose - so the
         walk reads through a small vertical bob instead, phased by the same `gait` offset that
         desynchronises the 2D walk frames, so a squad does not pogo in unison. Vehicles do not
         bob; tracks do not walk. */
      var d2 = rtsUnitDef(e.def);
      if (d2.kind === 'infantry' && e.path && !e.prone) {
        y += Math.abs(Math.sin(G.t * 9 + (e.gait || 0) * 0.8)) * 0.45;
      }
      /* AND IT LEANS ON THE GROUND IT IS STANDING ON. Measured over a running match, the
         steepest slope under a unit is 0.228: a hull three units wide had one side 0.69 world
         units clear of the ground and the other buried, about a third of a tank's height, and
         19% of the map's open ground is steep enough to show it.

         NOT WHAT IS FLYING. An aircraft's attitude is its own business and the hill it
         happens to be over is nothing to do with it; passing no normal leaves it upright.
         Boats likewise sit on water, which is level by construction.

         The TURRET takes the same lean as the hull rather than staying level, because it is
         bolted to the hull - it rotates in the hull's plane, and a turret that stayed
         world-level would shear out of its own ring on any slope. */
      var gn = (e.air || (d2 && d2.sea)) ? null : _rtsElevNormal(e.x, e.z);
      drawIn(C, _r3dMesh('u', e.def, e.side, turret ? 'hull' : null, e.prone),
             e.x, y, e.z, -e.rot, ART2W, false, 1, gn);
      if (turret) {
        drawIn(C, _r3dMesh('u', e.def, e.side, 'turret', false), e.x, y, e.z, -(e.turret || 0),
               ART2W, false, 1, gn);
      }
    }
  }
  flushBatch(C);
  }
  paintEntities(MC);

  /* THE EFFECTS, as quads standing in the world - see render3d/fx3d.js. Here, after everything
     with a surface and before the occlusion resolves, because they are the last thing that has
     a place in the scene and the first that must not contribute depth to it: a fireball is not
     a surface for the occlusion to find corners against. */
  if (G.fx && G.fx.length) {
    try { _r3dFxDraw(G, cam, invD); } catch (e) { R3.fxDrawn = -1; }
  }

  /* THE GLOW, from the emitters only - see render3d/bloom3d.js for why it is drawn from what
     emits light rather than thresholded out of what is bright. Here, after the effects exist
     and before the resolve that composites it, and it leaves the scene buffer bound. */
  R3.bloomOn = post ? _r3dBloomPass(R3, G, cam, invD) : false;

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
  /* AND NO GRAIN ON THE SHROUD, for the same reason it takes no shading: it is a signal
     painted over the world rather than a surface in it, and texturing it would put grass
     detail on the unexplored map. */
  gl.uniform2f(gl.getUniformLocation(R3.texP, 'uGrain'), 0, 0);
  gl.disable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.bindBuffer(gl.ARRAY_BUFFER, R3.groundBuf);
  gl.enableVertexAttribArray(aXZ); gl.vertexAttribPointer(aXZ, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, R3.groundNB);
  gl.enableVertexAttribArray(aGN); gl.vertexAttribPointer(aGN, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, R3.groundUV);
  gl.enableVertexAttribArray(aT); gl.vertexAttribPointer(aT, 2, gl.FLOAT, false, 0, 0);
  gl.bindTexture(gl.TEXTURE_2D, R3.fogTex);
  gl.drawArrays(gl.TRIANGLES, 0, R3.groundVerts);
  gl.disable(gl.BLEND);
}
