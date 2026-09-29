/* render3d/husk3d.js - what is left of a vehicle. Part of rts.render3d.

   A tank that died went out in a pop and was gone from the next frame: the fire that burns where
   it stood (core/capture.js, "the wreck burns") burned on empty ground. Now the hull stays where
   it died, charred black, for as long as that fire burns - through the flames and the smoke,
   fifteen seconds or so - and settles into the ground as the last of the smoke thins, so a field
   where a battle was fought is littered with what it cost.

   NOTHING OF IT IS STATE OF ITS OWN. The fire's record carries what burned (`husk`: the type,
   the house, which way the hull and the turret faced) and the record is the husk's whole life:
   while it is in G.fx the husk is drawn, and when the ladder burns out and the record goes, so
   does the hull. It takes no hits and blocks nothing - the unit is off the board as far as the
   rules are concerned, as a soldier's fall is.

   R3.huskAmt 0 takes them out and leaves the rest. */

var R3D_HUSK_SINK = 2.4;     /* how far a husk settles into the ground as its smoke thins out */

/* Every husk still burning, handed to `draw(mesh, x, y, z, rot, nrm)`. */
function _r3dHusks(G, R3, draw) {
  if (R3.huskAmt === 0 || !G.fx) return 0;
  var n = 0;
  for (var i = 0; i < G.fx.length; i++) {
    var f = G.fx[i], h = f.husk;
    if (!h || f.t < 0) continue;
    var A = RTS_ANIMS[f.kind], sink = 0;
    /* the last loop of the smoke: settle out of sight as it thins */
    if (A && !A.chain && (f.loops || 1) <= 1) sink = Math.min(1, f.t / A.dur) * R3D_HUSK_SINK;
    var y = _rtsElev(f.x, f.z) - sink, nrm = _rtsElevNormal(f.x, f.z);
    var hasT = _r3dHuskTurret(h);
    draw(_r3dMesh('u', h.def, h.side, hasT ? 'hull' : null, false), f.x, y, f.z, -(h.rot || 0), nrm);
    if (hasT) draw(_r3dMesh('u', h.def, h.side, 'turret', false), f.x, y, f.z, -(h.tur || 0), nrm);
    n++;
  }
  R3.husks = n;
  return n;
}
/* whether the model comes in a hull and a turret, as the live unit's does (scene3d.js) */
function _r3dHuskTurret(h) {
  var R = _rtsR;
  return !!(R && R.spr && R.spr.turret && R.spr.turret[h.side] && R.spr.turret[h.side][h.def]);
}
