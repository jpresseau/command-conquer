/* sprites/marks.js - a unit's house colour where the camera can see it.

   Every unit carries its owner's colour on one small part (the cap, the band, the roof: see the
   note on RTS_PAL.veh in sprites/bake.js for why it is small), and that part has to face the
   camera, which looks DOWN. The four jets (keys mig, yak, strikejet, falcon) carried theirs as a
   stripe under the fuselage, beneath the wing - the one place a camera above them never sees - so
   a Kestrel, a Shrike, a Strike Jet or a Falcon showed next to none of its owner's colour: 7 to 41
   pixels at the close zoom (e2e/housecol). They wear roundels now, on the top of each wing, the
   way aircraft have been marked since there were aircraft to mark: the house's colour on a light
   ring, a disc that reads at any zoom and from any heading. So do the Recon Drone and the Heavy
   Bomber, whose bands sat in the middle of the wing, under the fuselage.

   Each entry is a list of roundel pairs, mirrored across the centre line: [x, y, |z|, r] in the
   model's own units - x along it, y the top of the wing it sits on, |z| out from the centre, r
   its radius. Built into the model, so the cameo, the 2D sprite and the 3D mode all show it.
   window.RTS_MARKS_OFF is the before-picture (drop the 3D mode's model cache, R3.mesh, to see it). */
var RTS_MARKS = {
  mig:       [[0.6, 4.3, 6.4, 1.8]],
  yak:       [[0.0, 4.4, 7.2, 2.0]],
  strikejet: [[-1.2, 4.1, 5.4, 1.7]],
  falcon:    [[-1.6, 4.2, 6.0, 1.8]],
  drone:     [[0.8, 3.7, 5.6, 0.95]],
  bomber:    [[3.0, 4.9, 9.2, 1.6]]
};
var RTS_MARK_RING = '#e6e3d8';                    /* the light ring round the house's colour */

/* A disc painted on what is under it: ONE face, lying flat at height y and facing up. Not a
   cylinder - a cylinder's sides are two dozen faces with no area the camera sees, and a model
   that is a fifth team-coloured faces is what e2e/r3dsprites reads as the generic fallback. */
function _sprMarkDisc(m, x, y, z, r, col, seg) {
  var v = [];
  for (var i = 0; i < seg; i++) { var a = i / seg * Math.PI * 2; v.push([x + Math.cos(a) * r, y, z + Math.sin(a) * r]); }
  _r3F(m, v.reverse(), col);
}
/* The roundels for `key` into m, unless this part of the model is one that turns on its own. */
function _sprHouseMarks(m, key, TM, part) {
  var L = RTS_MARKS[key];
  if (!L || window.RTS_MARKS_OFF || (part && part !== 'body' && part !== 'hull')) return 0;
  var n = 0;
  for (var i = 0; i < L.length; i++) {
    var w = L[i];
    for (var s = -1; s <= 1; s += 2) {
      _sprMarkDisc(m, w[0], w[1] + 0.04, s * w[2], w[3], RTS_MARK_RING, 24);              /* the ring */
      _sprMarkDisc(m, w[0], w[1] + 0.08, s * w[2], w[3] * 0.64, TM[1], 24);               /* the house */
      n++;
    }
  }
  return n;
}
