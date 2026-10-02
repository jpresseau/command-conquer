/* render3d/upload3d.js - what the 3D mode sends the GPU each frame, and how little. Part of
   rts.render3d.

   THE GROUND'S PICTURE IS SENT A STAMP AT A TIME. The baked terrain canvas the ground samples is
   3072 px square - 36 MB - and every crater, scorch and corpse stamped into it (render/frame.js)
   used to mark the whole of it dirty, so the next frame re-sent all 36 MB to the GPU. In a fight
   that is several times a second: measured, a battle of 120 units averaged 8.6 MB a frame of
   terrain upload, and each one was a stall of its own - the stutter that came exactly when the
   action did. A stamp is a few dozen pixels square; now only those pixels go
   (_r3dTerrainStamp, then _r3dTerrainUpload), and the whole canvas only when it was re-baked.
   And only for the baked ground, which is the one thing that samples the canvas: the materials
   (terrain3d.js) take their scars from the ground map, so while they draw nothing goes at all.

   And the scorch marks, which never marked the canvas dirty at all, now reach the baked 3D
   ground on the next frame rather than whenever a corpse happened to follow. */

var R3D_STAMP_MAX = 32;          /* more stamps than this in a frame go up as one rectangle */
var R3D_FX_IDX_MAX = 16383;      /* quads a 16-bit index can reach */

/* The effects' fixed index - quad q is corners 4q..4q+3, drawn 0 1 2, 0 2 3 - grown as the
   quads do and bound for the draw. Returns how many quads it can draw of the n asked. */
function _r3dFxIndex(gl, R3, n) {
  n = Math.min(n, R3D_FX_IDX_MAX);
  if (!R3.fxIdx || R3.fxIdxN < n) {
    var cap = Math.min(R3D_FX_IDX_MAX, Math.max(1024, n * 2)), ix = new Uint16Array(cap * 6);
    for (var q = 0; q < cap; q++) {
      var v = q * 4, o = q * 6;
      ix[o] = v; ix[o + 1] = v + 1; ix[o + 2] = v + 2; ix[o + 3] = v; ix[o + 4] = v + 2; ix[o + 5] = v + 3;
    }
    R3.fxIdx = R3.fxIdx || gl.createBuffer(); R3.fxIdxN = cap;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, R3.fxIdx);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, ix, gl.STATIC_DRAW);
  } else gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, R3.fxIdx);
  return n;
}

/* A rectangle of the terrain canvas has been drawn on: send it with the next frame. */
function _r3dTerrainStamp(x, y, w, h) {
  var R3 = window._R3D;
  if (!R3 || R3.terrainDirty) return;
  /* drawing the materials, nothing reads the canvas: it goes up whole if the baked ground is
     ever drawn again, and until then nothing is kept */
  if (R3.matOn) { R3.terrainDirty = true; return; }
  var L = R3.terrainRects || (R3.terrainRects = []);
  L.push([Math.floor(x) - 1, Math.floor(y) - 1, Math.ceil(w) + 2, Math.ceil(h) + 2]);
}

/* The terrain texture up to date: all of it after a re-bake, the stamped rectangles otherwise. */
function _r3dTerrainUpload(gl, R3, cv) {
  if (!cv) return;
  if (R3.terrainDirty || !R3.terrainTex) {
    R3.terrainTex = _r3dTexture(gl, R3.terrainTex, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
    R3.terrainDirty = false; R3.terrainRects = null;
    R3.terrainFull = (R3.terrainFull || 0) + 1;
    return;
  }
  var L = R3.terrainRects;
  if (!L || !L.length) return;
  R3.terrainRects = null;
  if (L.length > R3D_STAMP_MAX) {
    var b = L.reduce(function (a, r) { return [Math.min(a[0], r[0]), Math.min(a[1], r[1]), Math.max(a[2], r[0] + r[2]), Math.max(a[3], r[1] + r[3])]; }, [1e9, 1e9, -1e9, -1e9]);
    L = [[b[0], b[1], b[2] - b[0], b[3] - b[1]]];
  }
  var g = cv.getContext('2d');
  gl.bindTexture(gl.TEXTURE_2D, R3.terrainTex);
  for (var i = 0; i < L.length; i++) {
    var x = Math.max(0, L[i][0]), y = Math.max(0, L[i][1]);
    var w = Math.min(cv.width, L[i][0] + L[i][2]) - x, h = Math.min(cv.height, L[i][1] + L[i][3]) - y;
    if (w <= 0 || h <= 0) continue;
    var im = g.getImageData(x, y, w, h);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, w, h, gl.RGBA, gl.UNSIGNED_BYTE, im.data);
    R3.terrainSub = (R3.terrainSub || 0) + w * h;
  }
}
