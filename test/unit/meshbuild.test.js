/* THE MESH BUILDER UPLOADS THE SAME BYTES (render3d/mesh3d.js _r3dBuildMesh).

   It was rewritten to count first and fill typed arrays in place - a third of the time, on the
   path of every stall the renderer has (an ore chunk rebuilt as a harvester bites, a model first
   seen). What it must not do is change one byte of what it sends. The builder it replaced is kept
   HERE, as it was, and both are run over real geometry:

     THE MODELS   every unit and building of both armies, at the 3D view's detail
     THE ORE      a field's crystals, cell by cell, ore and gems
     THE EDGES    an empty list, a face of two points (no triangle), a face with its own normals,
                  a degenerate face with no area
   For each: the positions, the normals and the colours byte for byte, the vertex count, the top. */

var vm = require('vm');
var { Suite } = require('../lib/assert.js');
var { sameBytes } = require('../lib/assert.js');
var { loadFast } = require('../lib/sandbox.js');

var S = new Suite('meshbuild');
var g = loadFast(['src/rules', 'src/r3d', 'src/sprites', 'src/render3d/mesh3d.js']);

/* a GL that keeps what it is sent */
function fakeGL() {
  var sent = [];
  return { sent: sent, ARRAY_BUFFER: 1, STATIC_DRAW: 2, createBuffer: function () { return { id: sent.length }; }, bindBuffer: function () {},
    bufferData: function (_t, a) { sent.push(new Uint8Array(a.buffer.slice(a.byteOffset, a.byteOffset + a.byteLength))); } };
}
/* the builder as it was, word for word but for its name */
function oldBuild(gl, faces) {
  var pos = [], nrm = [], col = [], fi;
  for (fi = 0; fi < faces.length; fi++) {
    var f = faces[fi], v = f.v;
    var r = f.c[0] / 255, gc = f.c[1] / 255, b = f.c[2] / 255;
    var fn = g._r3dFaceNormal(v), nx = fn[0], ny = fn[1], nz = fn[2];
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
  function fbuf(a) { var b2 = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b2); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(a), gl.STATIC_DRAW); return b2; }
  var nrm8 = new Int8Array(nrm.length), col8 = new Uint8Array(col.length);
  for (var ni = 0; ni < nrm.length; ni += 3) {
    var nl = Math.hypot(nrm[ni], nrm[ni + 1], nrm[ni + 2]) || 1;
    nrm8[ni] = Math.round(nrm[ni] / nl * 127);
    nrm8[ni + 1] = Math.round(nrm[ni + 1] / nl * 127);
    nrm8[ni + 2] = Math.round(nrm[ni + 2] / nl * 127);
  }
  for (var ci = 0; ci < col.length; ci++) col8[ci] = Math.round(col[ci] * 255);
  function bbuf(a) { var b3 = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b3); gl.bufferData(gl.ARRAY_BUFFER, a, gl.STATIC_DRAW); return b3; }
  var top = 0;
  for (fi = 1; fi < pos.length; fi += 3) if (pos[fi] > top) top = pos[fi];
  return { p: fbuf(pos), n: bbuf(nrm8), c: bbuf(col8), verts: pos.length / 3, top: top };
}
function same(a, b) { if (a.length !== b.length) return false; for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; }
/* null when the two builders agree on `faces`, or what differs */
function differs(faces) {
  var A = fakeGL(), B = fakeGL(), ma = oldBuild(A, faces), mb = g._r3dBuildMesh(B, faces);
  if (ma.verts !== mb.verts) return 'verts ' + ma.verts + ' / ' + mb.verts;
  if (ma.top !== mb.top) return 'top ' + ma.top + ' / ' + mb.top;
  if (A.sent.length !== 3 || B.sent.length !== 3) return 'uploads ' + A.sent.length + ' / ' + B.sent.length;
  if (!same(A.sent[0], B.sent[0])) return 'positions';
  if (!same(A.sent[1], B.sent[1])) return 'normals';
  if (!same(A.sent[2], B.sent[2])) return 'colours';
  return null;
}

/* ---- the models ---- */
vm.runInContext('_r3dDetailLevel = function () { return R3_DETAIL_3D; };', g);
var models = [];
['player', 'enemy'].forEach(function (side) {
  g.RTS_UNITS.forEach(function (u) {
    [null, 'hull', 'turret'].forEach(function (part) {
      try { var f = g._r3DetailHigh(function () { return g._sprUnitModel(u.key, side, false, part); }); if (f && f.length) models.push({ name: u.key + (part ? ':' + part : '') + '/' + side, f: f }); } catch (e) {}
    });
  });
  g.RTS_STRUCTS.forEach(function (b) {
    try { var f2 = g._r3DetailHigh(function () { return g._sprBuildingModel(b.key, side); }); if (f2 && f2.length) models.push({ name: b.key + '/' + side, f: f2 }); } catch (e) {}
  });
});
var tris = 0, own = 0, bad = [];
models.forEach(function (m) {
  m.f.forEach(function (f) { tris += Math.max(0, f.v.length - 2); if (f.n) own++; });
  var d = differs(m.f);
  if (d) bad.push(m.name + ': ' + d);
});
S.ok('the rosters build: hundreds of models, a million triangles\' worth of faces, some with normals of their own (population)',
     models.length > 200 && tris > 200000 && own > 1000, models.length + ' models, ' + tris + ' triangles, ' + own + ' faces with their own normals');
S.ok('THE MODELS: every one uploads the same positions, normals and colours, byte for byte', !bad.length, bad.slice(0, 4).join('; ') || models.length + ' identical');

/* ---- the ore ---- */
var oreBad = [], oreTris = 0;
[[0.2, false], [0.6, false], [1, false], [1, true], [0.45, true]].forEach(function (c, i) {
  var faces = [];
  for (var k = 0; k < 40; k++) g._r3OreCell(faces, k * 4, (k % 7) * 4, 10 + k, 20 + (k % 7), c[0], c[1], c[1] ? g.RTS_PAL.gem : g.RTS_PAL.ore);
  faces.forEach(function (f) { oreTris += Math.max(0, f.v.length - 2); });
  var d = differs(faces);
  if (d) oreBad.push('field ' + i + ': ' + d);
});
S.ok('THE ORE: five fields of crystals, ore and gems, the same bytes', !oreBad.length && oreTris > 3000, oreBad.join('; ') || oreTris + ' triangles identical');

/* ---- the edges ---- */
S.eq('an empty list', differs([]), null);
var tri = [[0, 0, 0], [1, 0, 0], [0, 2, 0]], quad = [[0, 0, 0], [1, 0, 0], [1, 3, 1], [0, 1, 1]];
S.eq('a face of two points makes no triangle, and breaks nothing', differs([{ v: [[0, 0, 0], [1, 1, 1]], c: [9, 9, 9] }, { v: tri, c: [200, 100, 50] }]), null);
S.eq('a face with normals of its own, not unit length', differs([{ v: quad, c: [1, 2, 3], n: [[0, 2, 0], [0.3, 0.4, 0], [0, 0, 5], [1, 1, 1]] }]), null);
S.eq('a face with no area: its normal is nothing, not NaN', differs([{ v: [[0, 0, 0], [1, 1, 1], [2, 2, 2]], c: [255, 0, 128] }]), null);
S.eq('a fan of seven corners', differs([{ v: [[0, 0, 0], [1, 0, 0], [2, 1, 0], [2, 2, 0.5], [1, 3, 1], [0, 3, 1], [-1, 1.5, 0.5]], c: [17, 34, 51] }]), null);
/* and it is a count-then-fill: what it sends are the typed arrays themselves */
var G2 = fakeGL(), m2 = g._r3dBuildMesh(G2, [{ v: quad, c: [1, 2, 3] }]);
S.ok('a quad is six vertices: 72 bytes of position, 18 of normal, 18 of colour', m2.verts === 6 && G2.sent[0].length === 72 && G2.sent[1].length === 18 && G2.sent[2].length === 18,
     G2.sent.map(function (a) { return a.length; }).join(' '));
S.eq('...its top the highest corner', m2.top, 3);

require('../lib/report.js')(S);
