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

function _r3dFaceNormal(v) {
  var nx = 0, ny = 0, nz = 0;
  for (var e = 0; e < v.length; e++) {
    var p0 = v[e], p1 = v[(e + 1) % v.length];
    nx += (p0[1] - p1[1]) * (p0[2] + p1[2]);
    ny += (p0[2] - p1[2]) * (p0[0] + p1[0]);
    nz += (p0[0] - p1[0]) * (p0[1] + p1[1]);
  }
  return [nx, ny, nz];
}
/* TWO PASSES, STRAIGHT INTO TYPED ARRAYS. This built three plain arrays three values at a push,
   with a temporary array a triangle and another a face, and then copied them into typed ones -
   and it is on the path of every stall the renderer has: an ore chunk rebuilt as a harvester
   bites, a model first seen, the base's dressing when a building falls. Counted first and
   filled in place it is about a third of the time (an ore chunk 8.6 ms to 2.4, a model 4.4 to
   1.4), and uploads the same bytes: unit/meshbuild holds it to the old builder, byte for byte. */
function _r3dBuildMesh(gl, faces) {
  var fi, nv = 0;
  for (fi = 0; fi < faces.length; fi++) { var vn = faces[fi].v.length; if (vn > 2) nv += (vn - 2) * 3; }
  var pos = new Float32Array(nv * 3), nrm8 = new Int8Array(nv * 3), col8 = new Uint8Array(nv * 3), o = 0, top = 0;
  for (fi = 0; fi < faces.length; fi++) {
    var f = faces[fi], v = f.v, n = v.length;           /* under three corners the fan below is empty */
    var cr = Math.round(f.c[0] / 255 * 255), cg = Math.round(f.c[1] / 255 * 255), cb = Math.round(f.c[2] / 255 * 255);
    /* THE FACE'S NORMAL FROM ALL ITS CORNERS (Newell's method), not from the first three. It was
       the first three, and a rounded box's cap (r3d/curves.js _r3RoundBox) starts with three
       points in a line - two ends of a corner arc and the straight run between - so the cap of
       every rounded box got a zero normal, which the shader normalised into NaN: every barrel,
       fender and hull plate drawn at the high and medium tiers had a black lid. The sum over all
       the edges is exact for a planar polygon and cannot vanish while the polygon has area. */
    var fnv = f.n, nx = 0, ny = 0, nz = 0, nl, e;
    if (!fnv) {
      for (e = 0; e < n; e++) {
        var p0 = v[e], p1 = v[e + 1 === n ? 0 : e + 1];
        nx += (p0[1] - p1[1]) * (p0[2] + p1[2]);
        ny += (p0[2] - p1[2]) * (p0[0] + p1[0]);
        nz += (p0[0] - p1[0]) * (p0[1] + p1[1]);
      }
      /* Normals pack to bytes, and Int8 cannot carry the unnormalised sums the emitter produces:
         normalised here; the shader normalises anyway, so nothing downstream changes. */
      nl = Math.hypot(nx, ny, nz) || 1;
      nx = Math.round(nx / nl * 127); ny = Math.round(ny / nl * 127); nz = Math.round(nz / nl * 127);
    }
    /* UNLESS THE FACE CAME WITH ITS OWN. A cylinder, cone or vault emits one normal per corner
       (see _r3Cyl in r3d/primitives.js), which is what turns a ring of flat strips into a
       curve once the fragment stage interpolates them. Everything else - every box, slab,
       gable and cap - has no such field and is flat, which is what it should be. */
    for (var k = 2; k < n; k++) {
      for (var t = 0; t < 3; t++) {
        var vi = t === 0 ? 0 : (t === 1 ? k - 1 : k), p = v[vi];
        pos[o] = p[0]; pos[o + 1] = p[1]; pos[o + 2] = p[2];
        if (p[1] > top) top = p[1];
        if (fnv) {
          var q = fnv[vi]; nl = Math.hypot(q[0], q[1], q[2]) || 1;
          nrm8[o] = Math.round(q[0] / nl * 127); nrm8[o + 1] = Math.round(q[1] / nl * 127); nrm8[o + 2] = Math.round(q[2] / nl * 127);
        } else { nrm8[o] = nx; nrm8[o + 1] = ny; nrm8[o + 2] = nz; }
        col8[o] = cr; col8[o + 1] = cg; col8[o + 2] = cb;
        o += 3;
      }
    }
  }
  /* Positions stay float; normals and colours are bytes. At this system's scale - the world
     batches alone are several hundred thousand triangles - attribute width is the real budget:
     floats everywhere is 36 bytes a vertex and packing the two attributes that never needed the
     precision brings it to 18, which is the difference between a phone keeping the 3D mode and
     dropping the tab. */
  function buf(a) {
    var b2 = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b2);
    gl.bufferData(gl.ARRAY_BUFFER, a, gl.STATIC_DRAW);
    return b2;
  }
  /* `top`: its top, in model units - where a fire on its roof stands (render3d/fxemit3d.js) */
  return { p: buf(pos), n: buf(nrm8), c: buf(col8), verts: nv, top: top };
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
