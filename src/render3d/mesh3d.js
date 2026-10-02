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
  /* its top, in model units: where a fire on its roof stands (render3d/fxemit3d.js) */
  var top = 0;
  for (fi = 1; fi < pos.length; fi += 3) if (pos[fi] > top) top = pos[fi];
  return { p: fbuf(pos), n: bbuf(nrm8), c: bbuf(col8), verts: pos.length / 3, top: top };
}

/* The cache key carries everything that changes the geometry or its colours: type, side,
   turret half, prone. A miss builds the model through the same functions the baker uses, so
   the two pipelines cannot drift apart - there is no second copy of any shape. */
/* THE LEVEL OF DETAIL. A shadow does not show a bevel, and nor does a tank twenty pixels long:
   with `lod`, the model is built plain - flat chamfers, round things capped at R3D_LOD_SEG sides,
   a soldier as the sprite's own figure - in about half the triangles, and one model serves every
   pose and every roll of the tracks. Drawn into the sun's map always, and on screen when zoomed
   far out (_r3dLod, render3d/unit3d.js).

   BETWEEN THE TWO, R3D_LOD_MID: the plain geometry, but still walking and still rolling - keyed by
   pose and roll like the full model, so a soldier strides and the tracks turn. A unit at the
   zoom a phone opens on is forty pixels long and its rounded bevels cost two triangles a pixel
   that nobody can see (render3d/unit3d.js, _r3dLodMid). Units only: a building is five times
   the size on screen, and its curved roofs show their facets at 8 sides. */
var R3D_LOD_SEG = 8;
var R3D_LOD_MID = 2;
function _r3dMesh(kind, def, side, part, prone, pose, roll, lod) {
  var R3 = window._R3D;
  if (lod && lod !== R3D_LOD_MID) return _r3dMeshLod(R3, kind, def, side, part, prone);
  var key = (lod ? 'M:' : '') + kind + ':' + def + ':' + side + ':' + (part || '') + ':' + (prone ? 1 : 0) + ':' + (pose || 0) + (R3.soldierOff ? ':s' : '') + (roll ? ':r' + roll : '');
  var m = R3.mesh[key];
  if (m !== undefined) return m;
  /* AN OPTIONAL VARIANT WAITS ITS TURN in a live frame with no budget left - a pose, a roll of
     the tracks, a turn of the propeller: the base model stands in (render3d/pace3d.js); and so
     does the full model for a plain one not built yet, so zooming out never stalls a frame */
  var turn = !!part && part.slice(0, 4) === 'prop' && part !== 'prop0';
  if ((roll || pose || turn) && !_r3dMeshMay(R3)) return _r3dMesh(kind, def, side, turn ? 'prop0' : part, prone, 0, 0, lod);
  if (lod && !_r3dMeshMay(R3)) return _r3dMesh(kind, def, side, part, prone, pose, roll);
  var faces = null, tb = _r3dNow();
  /* the point round its running gear it is built at, and how far it rolls for a full turn of
     it (render3d/unit3d.js) */
  _SPR_ROLL = (roll || 0) / R3D_ROLL_N; _SPR_ROLL_LEN = 0;
  try {
    /* BUILT RICHER THAN THE SPRITE. The model functions are the baker's own - one copy of every
       shape, which is the point of calling them from here at all - but the two consumers want
       different tessellations of it. A sprite is 22 to 44 art pixels across and cannot show a
       rounded edge; this draws the same model at 100 to 200 and, since inst3d.js, draws every
       copy of it in one call, so the vertex stage has room the baker does not. _r3DetailHigh
       raises the segment counts and turns every box's flat chamfer into a rounded edge with a
       normal per corner, for the duration of this build and no longer. See _R3_DETAIL. */
    faces = (lod ? _r3dPlain : _r3DetailHigh)(function () {
      if (kind === 'b') return _sprBuildingModel(def, side);
      if (part && part.slice(0, 4) === 'prop') return _r3dPropModel(def, side, +part.slice(4));   /* air3d.js */
      /* a soldier has a model of his own in 3D, walking (render3d/soldier3d.js) or crawling
         (crawl3d.js); the sprite's is the fallback, and still what a dog is drawn as */
      var ud = rtsUnitDef(def), sm = (ud && ud.kind === 'infantry' && !part && !R3.soldierOff)
        ? _r3dSoldierModel(def, side, !!prone, pose || 0) : null;
      return sm || _sprUnitModel(def, side, !!prone, part || null);
    });
  } catch (e) { faces = null; }
  _SPR_ROLL = null;
  if (kind === 'u' && _SPR_ROLL_LEN) (R3.rollLen || (R3.rollLen = {}))[def] = _SPR_ROLL_LEN * _sprUnitScale(def) * RTS_TILE / RTS_TS;
  m = (faces && faces.length) ? _r3dBuildMesh(R3.gl, faces) : null;
  /* how much it weathers (weather3d.js): a building fully, a vehicle or a soldier less */
  if (m) m.weather = kind === 'b' ? 1 : 0.5;
  R3.mesh[key] = m;
  _r3dMeshSpent(R3, _r3dNow() - tb);
  return m;
}
function _r3dMeshLod(R3, kind, def, side, part, prone) {
  /* a propeller's turn is drawn at its first; a stride or a roll at the base - one model for all */
  var pt = part && part.slice(0, 4) === 'prop' ? 'prop0' : part;
  var key = 'L:' + kind + ':' + def + ':' + side + ':' + (pt || '') + ':' + (prone ? 1 : 0);
  var m = R3.mesh[key];
  if (m !== undefined) return m;
  var faces = null;
  try {
    faces = _r3dPlain(function () {
      return kind === 'b' ? _sprBuildingModel(def, side)
        : pt === 'prop0' ? _r3dPropModel(def, side, 0) : _sprUnitModel(def, side, !!prone, pt || null);
    });
  } catch (e) { faces = null; }
  m = (faces && faces.length) ? _r3dBuildMesh(R3.gl, faces) : null;
  if (m) m.weather = kind === 'b' ? 1 : 0.5;
  R3.mesh[key] = m;
  return m;
}
/* the baker's own tessellation, round things capped at R3D_LOD_SEG sides, for this build only */
function _r3dPlain(fn) {
  var cap = _R3_SEG_CAP;
  _R3_SEG_CAP = R3D_LOD_SEG;
  try { return fn(); } finally { _R3_SEG_CAP = cap; }
}
