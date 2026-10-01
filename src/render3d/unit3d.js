/* render3d/unit3d.js - one unit, drawn: where it stands, how it leans, and the parts of it that
   move. Part of rts.render3d; called for every unit by scene3d.js's paintEntities, in the main
   pass, the sun's and the silhouettes' alike.

   WHAT MOVES ON IT, and none of it is the game's - all of it is read off what the unit is
   already doing, so the simulation and a saved game know nothing about it:

     TRACKS AND WHEELS  turn with the ground the unit has covered. The model is built at
                        R3D_ROLL_N points round its running gear (_SPR_ROLL, sprites/
                        unitmodels.js: links stepped back, sprocket and wheel nuts turned), and
                        the odometer below picks one, so a tank that stops stops its tracks
     ROTORS             spin: the blades are a part of their own, turned over the airframe -
                        flat out in the air, idling on the pad
     SHIPS              ride the swell they sit in (_r3dSwellAt, wave3d.js): up and down with
                        it, pitching and rolling with its slope along and across the hull
     CRAWLING           a prone squad on the move crawls (crawl3d.js)

   Each has a kill switch for a spec's A/B: R3.rollOff, R3.rotorOff, R3.swellOff, and the
   soldier's own R3.soldierOff. */

var R3D_ROLL_N = 4;              /* points round the running gear a vehicle is built at */
var R3D_ROTOR_SPIN = 13;         /* radians a second, in the air... */
var R3D_ROTOR_IDLE = 4;          /* ...and on the pad */
var R3D_SHIP_TILT = 0.14;        /* the most a ship leans on the swell, radians */
var R3D_SHIP_REACH = 2.6;        /* world units fore and aft the swell is read at; half abeam */

/* What the renderer remembers about a unit between frames: where it was, how far it has
   rolled, how far round its rotor is. Asked by every pass of a frame, so only the first one in
   a frame moves anything - a unit that has not moved has nothing to add. */
function _r3dUnitMotion(R3, e, t) {
  var M = R3.motion || (R3.motion = {}), r = M[e.id];
  if (!r) r = M[e.id] = { x: e.x, z: e.z, d: 0, t: t, spin: (e.id * 2.39) % 6.283 };
  /* NEVER MORE THAN A STEP ROUND A FRAME. A link is about a seventh of a world unit and a tank
     covers more than that in a frame, so the true roll would step the running gear half a
     turn a frame - and half a turn is the wagon wheel: the track stands still or runs
     backwards. Held under one step, it always visibly runs the right way; at speed it runs
     slower than the ground goes by, which the eye takes for a blur. */
  var step = Math.hypot(e.x - r.x, e.z - r.z), len = R3.rollLen && R3.rollLen[e.def];
  if (step < 4) r.d += len ? Math.min(step, len / R3D_ROLL_N * 0.95) : step;   /* a jump (unloaded, placed) is not rolled */
  r.x = e.x; r.z = e.z;
  var dt = t - r.t;
  if (dt > 0 && dt < 1) r.spin += dt * (e.rearming > 0 ? R3D_ROTOR_IDLE : R3D_ROTOR_SPIN);
  r.t = t;
  /* forget the dead now and then */
  if ((R3.motionN = (R3.motionN || 0) + 1) > 4000) {
    R3.motionN = 0;
    for (var k in M) if (M[k].t < t - 5) delete M[k];
  }
  return r;
}

/* Which point round its running gear a vehicle that has rolled `d` world units is at. */
function _r3dRollPhase(R3, def, d) {
  var len = R3.rollLen && R3.rollLen[def];
  if (!len || R3.rollOff) return 0;
  return Math.floor(((d / len) % 1) * R3D_ROLL_N) % R3D_ROLL_N;
}

/* A ship on the swell at clock t: how far it is lifted, and the normal it leans to - the
   sea's slope read over the length of the hull rather than at one point, so a long hull
   rides the short chop and pitches to the long swell. */
function _r3dShipSwell(e, t) {
  var fx = Math.cos(e.rot), fz = Math.sin(e.rot), L = R3D_SHIP_REACH, B = L / 2;
  var h = _r3dSwellAt(e.x, e.z, t).h;
  var pitch = (_r3dSwellAt(e.x + fx * L, e.z + fz * L, t).h - _r3dSwellAt(e.x - fx * L, e.z - fz * L, t).h) / (2 * L);
  var roll = (_r3dSwellAt(e.x - fz * B, e.z + fx * B, t).h - _r3dSwellAt(e.x + fz * B, e.z - fx * B, t).h) / (2 * B);
  /* the gradient in the world, held under the most a ship leans */
  var gx = fx * pitch - fz * roll, gz = fz * pitch + fx * roll, g = Math.hypot(gx, gz), cap = Math.tan(R3D_SHIP_TILT);
  if (g > cap) { gx *= cap / g; gz *= cap / g; }
  var n = Math.hypot(gx, 1, gz);
  return { y: h, n: [-gx / n, 1 / n, -gz / n] };
}

function _r3dPaintUnit(C, e, G, R3, drawIn, ART2W) {
  var R = _rtsR, t = G.t || 0;
  var turret = R.spr.turret && R.spr.turret[e.side] && R.spr.turret[e.side][e.def];
  var d2 = rtsUnitDef(e.def), pose = 0, mo = _r3dUnitMotion(R3, e, t);
  /* THE GROUND UNDER IT, not zero. An aircraft's altitude is measured from the ground it
     is over as well - it flies at a height, not at a level - so both take the terrain and
     only the flier adds to it. */
  var y = (e.air || d2.sea ? _rtsElev(e.x, e.z) : _rtsStandY(e.x, e.z)) + (e.air ? ((e.rearming > 0 ? 2 : (e.alt || 12)) * 0.35) : 0);
  /* A MARCHING SOLDIER BOBS. The bob is what is left of the old suggestion of a march, much
     smaller now that he walks (a stride pose by his own gait, soldier3d.js), in step with the
     stride. Prone, he crawls instead (crawl3d.js). Vehicles do not bob; tracks do not walk. */
  if (d2.kind === 'infantry' && e.path) {
    if (e.prone) pose = R3.soldierOff ? 0 : _r3dCrawlPose(e, t);
    else {
      pose = R3.soldierOff ? 0 : _r3dSoldierPose(e, t);
      y += Math.abs(Math.sin(t * 9 + (e.gait || 0) * 0.8)) * (pose ? 0.08 : 0.45);
    }
  }
  /* AND IT LEANS ON THE GROUND IT IS STANDING ON. Measured over a running match, the
     steepest slope under a unit is 0.228: a hull three units wide had one side 0.69 world
     units clear of the ground and the other buried, about a third of a tank's height, and
     19% of the map's open ground is steep enough to show it.

     NOT WHAT IS FLYING. An aircraft's attitude is its own business and the hill it
     happens to be over is nothing to do with it; passing no normal leaves it upright.
     A ship leans on the swell instead.

     The TURRET takes the same lean as the hull rather than staying level, because it is
     bolted to the hull - it rotates in the hull's plane, and a turret that stayed
     world-level would shear out of its own ring on any slope. */
  var gn = (e.air || d2.sea) ? null : _rtsElevNormal(e.x, e.z);
  if (d2.sea && !R3.swellOff) { var sw = _r3dShipSwell(e, t); y += sw.y; gn = sw.n; }
  var rk = _r3dRecoil(e, gn) || { hx: 0, hz: 0, tx: 0, tz: 0, n: gn };   /* the kick: combat3d.js */
  var rotor = RTS_ROTOR_UNITS[e.def] && !R3.rotorOff;
  var roll = d2.kind === 'vehicle' && !d2.sea && !e.air ? _r3dRollPhase(R3, e.def, mo.d) : 0;
  drawIn(C, _r3dMesh('u', e.def, e.side, turret ? 'hull' : (rotor ? 'body' : null), e.prone, pose, roll),
         e.x + rk.hx, y, e.z + rk.hz, -e.rot, ART2W, false, 1, rk.n);
  if (turret) {
    drawIn(C, _r3dMesh('u', e.def, e.side, 'turret', false), e.x + rk.tx, y, e.z + rk.tz, -(e.turret || 0),
           ART2W, false, 1, rk.n);
  }
  if (rotor) drawIn(C, _r3dMesh('u', e.def, e.side, 'rotor', false), e.x, y, e.z, -e.rot - mo.spin, ART2W, false, 1, null);
}
