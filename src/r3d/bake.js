/* r3d/bake.js - fitting a model into a sprite: footprint, centring and a size no facing
   overflows. Part of rts.r3d, the little 3D renderer that bakes the sprites. */

/* 1.0 now that the models themselves are built low. The squash was a global rescue for
   sixteen models that had each grown into a tower; once they are authored at the reference's
   proportions it is double-counting, and it was flattening the one feature on each building
   that is supposed to stand up and identify it. */
var R3_STRUCT_SQUASH = 1;

function _r3BakeFootprint(faces, footW, footD) {
  if (R3_STRUCT_SQUASH !== 1) {
    var sq = [];
    for (var q = 0; q < faces.length; q++) {
      var f = faces[q], nv = [];
      for (var w = 0; w < f.v.length; w++) {
        var vv = f.v[w];
        nv.push([vv[0], vv[1] * R3_STRUCT_SQUASH, vv[2]]);
      }
      sq.push({ v: nv, c: f.c });
    }
    faces = sq;
  }
  var b = _r3Bounds(faces);
  var head = Math.max(0, Math.ceil(-(b.y0 + footD / 2)));
  var W = footW, H = footD + head;
  var c = _r3Render(faces, W, H, footW / 2, head + footD / 2);
  return { c: c, head: head };
}
/* Render a model centred in a square - used for units, which are not grid-aligned. */
function _r3BakeCentred(faces, size) {
  return _r3Render(faces, size, size, size / 2, size / 2);
}
/* The square a model needs so that NO facing clips. _r3BakeCentred centres on the model's
   ORIGIN, not on its bounds, so a tall model runs off the top long before it runs off the
   sides - and a unit is yawed to eight facings, each with different extents, so the answer is
   the worst case over all eight rather than the bounds of the one you happen to measure.

   This exists because hand-picked canvas sizes are a trap: raising R3_K lifted every roofline
   by 60% and silently sheared the top off the infantry and the gun off the tank. Measuring
   costs a few milliseconds once at load and cannot go stale. */
function _r3FitSize(models, margin) {
  var r = 0;
  /* Sampled at 32 regardless of how many facings the caller will actually bake. Vehicles use 32
     and infantry 8, and a square measured over only the eight cardinal-and-diagonal yaws is not
     guaranteed to hold the ones in between. Measuring the finer set costs a few milliseconds
     once and cannot be wrong. */
  for (var i = 0; i < models.length; i++) {
    for (var f = 0; f < 32; f++) {
      var b = _r3Bounds(_r3Yaw(models[i], -f / 32 * Math.PI * 2));
      r = Math.max(r, Math.abs(b.x0), Math.abs(b.x1), Math.abs(b.y0), Math.abs(b.y1));
    }
  }
  return Math.ceil(r * 2) + margin * 2;
}
