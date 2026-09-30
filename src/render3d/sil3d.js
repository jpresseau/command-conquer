/* render3d/sil3d.js - units seen through what hides them. Part of rts.render3d.

   The camera is tilted, so whatever stands south of a unit stands between it and the player: a
   tank parked behind the war factory, a squad in the lee of a refinery or under the canopy of a
   wood was simply gone, and the player's own army went missing inside their own base. So a unit
   that something hides shows through it as a glow in its house's colour - the way the later 3D
   RTS games do it - and stays exactly where it was in the picture.

   A SECOND DRAW OF THE UNITS, AFTER EVERYTHING WITH A SURFACE, WITH THE DEPTH TEST TURNED ROUND:
   only the fragments that are BEHIND something already drawn are coloured, flat, and blended over
   what hides them. The draw is pulled R3D_SIL_BIAS world units toward the eye first, which is
   what keeps a unit from showing through ITSELF - its own far side is behind its near side, but
   by less than its own size, so the pull brings it back in front. Something has to be more than
   that in front of a unit to hide it, which a wall, a canopy or a crest is and a unit's own
   hull is not.

   R3.silAmt takes the glow out and leaves the rest, as R3.aoAmt does the occlusion. */

var R3D_SIL_BIAS = 3.0;     /* world units toward the eye - more than a unit is deep */
/* how strongly a hidden unit shows through. Its hidden faces all draw, two to four deep, so
   this is one layer of it and the unit reads a good deal stronger. */
var R3D_SIL_A = 0.3;

/* COULD ANYTHING STAND BETWEEN THIS UNIT AND THE CAMERA? Only a building, a tree, rock or a
   wall in the three cells across it and a few in front of it - toward the camera, along its F
   (cam3d.js), which was +z while it faced north - or ground rising over it there. Two cells at
   the default lean; the more the camera leans over, the further off a roof can hide a unit.
   Everything else is left out of the pass, because drawing a 160-unit battle a third time for
   the handful standing behind something took the entities past their budget (e2e/instanced). */
function _r3dSilCover(G, e) {
  if (e.air) return false;
  var tx = _rtsTX(e.x), tz = _rtsTX(e.z), h0 = _rtsTileElev(tx, tz) + 1.5, R3 = window._R3D;
  var cy = R3 ? R3.cy : 1, sy = R3 ? R3.sy : 0, sp = R3 ? R3.sp : Math.sin(R3D_TILT), cp = R3 ? R3.cp : Math.cos(R3D_TILT);
  var reach = Math.max(2, Math.ceil(2 * (sp / cp) / Math.tan(R3D_TILT) - 1e-9));
  for (var dz = 0; dz <= reach; dz++) for (var dx = -1; dx <= 1; dx++) {
    var cx = tx + Math.round(dx * cy - dz * sy), cz = tz + Math.round(dx * sy + dz * cy);
    if (!_rtsInB(cx, cz)) continue;
    var i = _rtsIdx(cx, cz), k = G.terrain[i];
    if (G.blocked[i] === 1 || k === RTS_T_TREE || k === RTS_T_ROCK || k === RTS_T_WALL) return true;
    if (dz > 0 && _rtsTileElev(cx, cz) > h0) return true;
  }
  return false;
}

/* `paint(side, keep)` draws that house's units that `keep` passes through program P.
   R3.silAll draws every unit, covered or not - for the spec that checks a unit never shows
   through its own hull, which needs one in the pass with nothing in front of it. */
function _r3dSilPass(gl, R3, P, paint) {
  var amt = R3.silAmt === undefined ? 1 : R3.silAmt;
  var uS = gl.getUniformLocation(P, 'uSil'), uB = gl.getUniformLocation(P, 'uDBias');
  R3.silDrawn = 0; R3.silUnits = 0;
  if (!(amt > 0) || !uS || !uB) return 0;
  var G = window._rtsG;
  function keep(e) {
    var c = !!(R3.silAll || _r3dSilCover(G, e));
    if (c) R3.silUnits++;
    return c;
  }
  gl.depthFunc(gl.GREATER);
  gl.depthMask(false);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.uniform1f(uB, R3D_SIL_BIAS);
  for (var side in RTS_SIDES) {
    /* half way between the house's colour and its glow: pale enough to read over a dark roof,
       strong enough to say whose it is */
    var c = RTS_SIDES[side].color, w = RTS_SIDES[side].glow, rgb = [];
    for (var k = 16; k >= 0; k -= 8) rgb.push((((c >> k) & 255) + ((w >> k) & 255)) / 510);
    gl.uniform4f(uS, rgb[0], rgb[1], rgb[2], R3D_SIL_A * Math.min(1, amt));
    paint(side, keep);
  }
  gl.uniform4f(uS, 0, 0, 0, 0);
  gl.uniform1f(uB, 0);
  gl.depthFunc(gl.LESS);
  gl.depthMask(true);
  gl.disable(gl.BLEND);
  R3.silDrawn = 1;
  return 1;
}
