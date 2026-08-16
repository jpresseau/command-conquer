/* render3d/mesh3d.js - turning a model into GL buffers, and keeping them. Part of rts.render3d.

   Split out of scene3d.js, which was over this project's per-file limit once the terrain grew
   relief. Nothing here has anything to do with the frame walk that used to sit under it: this
   is the cache between a face list and a buffer, and the frame is what draws them.

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
