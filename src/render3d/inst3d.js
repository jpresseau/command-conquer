/* render3d/inst3d.js - drawing many copies of one mesh in one call. Part of rts.render3d.

   WHY. Every entity was its own draw: placement went in as uniforms, the mesh was bound, and
   drawArrays ran. Measured at a fixed camera, with the bloom pass off:

     units on screen      0     10     20     40     80    160
     drawArrays          26     56     81    136    246    466

   1.50 calls per unit in the main pass and 1.25 more in the sun's, dead linear, carrying about
   1,370 vertices each. A phone's GL driver pays per CALL - state validation, a command buffer
   entry - largely regardless of how much geometry rides on it, so a battle was spending its
   frame on submission overhead while the vertex stage idled. That matches the report this came
   from: the frame rate halves when the enemy attacks and recovers when they are beaten, which
   is exactly the shape of "more units on screen".

   HOW. The placement that used to be uniforms is now three vertex attributes stepped once per
   INSTANCE rather than once per vertex, so every entity sharing a mesh draws together. The
   shader body is untouched: R3D_INST_GLSL declares the attributes and then unpacks them into
   locals with the same names the uniforms had - uPos, uRot, uScale, uScaleY, uNrm - so the
   maths below it reads exactly as it did, and the two programs stay spliced from one source
   the way the shadow pass requires.

   THE PICTURE MUST NOT CHANGE. That is the whole safety argument, and it is what e2e/instanced
   grades: the same frame, pixel for pixel, with far fewer calls. Batching does reorder the
   draws - entities come out grouped by mesh instead of in entity order - which is invisible
   only because every one of them is opaque and depth-tested. Nothing alpha-blended may be
   added to that walk without sorting it again. */

/* x, y, z, scaleY | cos, sin, scale, dim | nx, ny, nz */
var R3D_INST_FLOATS = 11;

/* Declared once and spliced into both vertex programs, immediately before their main(). The
   unpacking is the point: the uniforms it replaces had these names, so no line below it moved. */
var R3D_INST_GLSL =
  'attribute vec4 aI0; attribute vec4 aI1; attribute vec3 aI2;';
var R3D_INST_UNPACK =
  '  vec3 uPos = aI0.xyz; float uScaleY = aI0.w;' +
  '  vec2 uRot = aI1.xy; float uScale = aI1.z; float uDim = aI1.w;' +
  '  vec3 uNrm = aI2;';

/* WebGL2 has this in core; WebGL1 has it as an extension that has been effectively universal
   for a decade. If neither is there, every field below stays null and the callers fall back to
   the one-draw-per-entity path they always had - so this file can be absent and the game still
   renders, just with the draw counts above. */
function _r3dInstInit(gl, gl2) {
  if (gl2 && gl.drawArraysInstanced) {
    return { on: true,
      draw: function (m, f, c, n) { gl.drawArraysInstanced(m, f, c, n); },
      divisor: function (l, d) { gl.vertexAttribDivisor(l, d); } };
  }
  var ext = gl.getExtension('ANGLE_instanced_arrays');
  if (!ext) return { on: false, draw: null, divisor: null };
  return { on: true,
    draw: function (m, f, c, n) { ext.drawArraysInstancedANGLE(m, f, c, n); },
    divisor: function (l, d) { ext.vertexAttribDivisorANGLE(l, d); } };
}

/* One GL buffer for every batch, rewritten per batch per pass. STREAM_DRAW because it is
   replaced whole each time and never read back. Each bucket keeps its rows in a Float32Array
   of its own, so the upload is a subarray of that with no copy and no allocation in the frame. */
function _r3dInstBuffer(gl, R3) {
  if (!R3.instBuf) R3.instBuf = gl.createBuffer();
  return R3.instBuf;
}

/* THE CONSTANT PATH. A disabled attribute array supplies a fixed value to every vertex, which
   is how everything that is NOT an entity - the world batches, the ground, the sea, the
   contact discs - goes through the same shader without an instance buffer. It must be called
   before any such draw: leave the arrays enabled and the next non-instanced draw reads
   whatever the last batch left in them, which puts the terrain at a tank's position. */
function _r3dInstConst(gl, I, C, x, y, z, sy, cs, sn, sc, dim, nx, ny, nz) {
  if (C.aI0 >= 0) {
    gl.disableVertexAttribArray(C.aI0);
    if (I.on) I.divisor(C.aI0, 0);
    gl.vertexAttrib4f(C.aI0, x, y, z, sy);
  }
  if (C.aI1 >= 0) {
    gl.disableVertexAttribArray(C.aI1);
    if (I.on) I.divisor(C.aI1, 0);
    gl.vertexAttrib4f(C.aI1, cs, sn, sc, dim);
  }
  if (C.aI2 >= 0) {
    gl.disableVertexAttribArray(C.aI2);
    if (I.on) I.divisor(C.aI2, 0);
    gl.vertexAttrib3f(C.aI2, nx, ny, nz);
  }
}

/* Point the three attributes at the packed rows and step them once per instance. */
function _r3dInstBind(gl, I, C, buf) {
  var S = R3D_INST_FLOATS * 4;
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  if (C.aI0 >= 0) {
    gl.enableVertexAttribArray(C.aI0);
    gl.vertexAttribPointer(C.aI0, 4, gl.FLOAT, false, S, 0);
    I.divisor(C.aI0, 1);
  }
  if (C.aI1 >= 0) {
    gl.enableVertexAttribArray(C.aI1);
    gl.vertexAttribPointer(C.aI1, 4, gl.FLOAT, false, S, 16);
    I.divisor(C.aI1, 1);
  }
  if (C.aI2 >= 0) {
    gl.enableVertexAttribArray(C.aI2);
    gl.vertexAttribPointer(C.aI2, 3, gl.FLOAT, false, S, 32);
    I.divisor(C.aI2, 1);
  }
}

/* A frame's worth of placements, bucketed by the mesh they belong to.

   Kept on _R3D and reused rather than rebuilt, because this runs twice a frame and a Map of
   arrays allocated per pass is exactly the per-frame garbage the 3D mode cannot afford. The
   buckets are emptied by setting `n` to 0; the arrays keep their capacity. */
function _r3dInstBatch(R3) {
  var B = R3.instB;
  if (!B) B = R3.instB = { by: new Map(), order: [] };
  for (var i = 0; i < B.order.length; i++) B.order[i].n = 0;
  B.order.length = 0;
  return B;
}
function _r3dInstPush(B, mesh, x, y, z, sy, cs, sn, sc, dim, nx, ny, nz) {
  var b = B.by.get(mesh);
  if (!b) { b = { mesh: mesh, n: 0, cap: 0, a: null }; B.by.set(mesh, b); }
  if (!b.n) B.order.push(b);
  if (b.n >= b.cap) {
    b.cap = Math.max(b.n + 1, b.cap * 2, 32);
    var grown = new Float32Array(b.cap * R3D_INST_FLOATS);
    if (b.a) grown.set(b.a);
    b.a = grown;
  }
  var a = b.a, o = b.n * R3D_INST_FLOATS;
  a[o] = x; a[o + 1] = y; a[o + 2] = z; a[o + 3] = sy;
  a[o + 4] = cs; a[o + 5] = sn; a[o + 6] = sc; a[o + 7] = dim;
  a[o + 8] = nx; a[o + 9] = ny; a[o + 10] = nz;
  b.n++;
}
