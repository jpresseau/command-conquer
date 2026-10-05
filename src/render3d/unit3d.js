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
     AIRCRAFT           bank into their turns, a helicopter noses down to fly, a Yak's
                        propeller turns, and a jet lays contrails and burns (air3d.js)
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
  if (!r) r = M[e.id] = { x: e.x, z: e.z, d: 0, t: t, spin: (e.id * 2.39) % 6.283, rot: e.rot || 0, w: 0, v: 0 };
  /* NEVER MORE THAN A STEP ROUND A FRAME. A link is about a seventh of a world unit and a tank
     covers more than that in a frame, so the true roll would step the running gear half a
     turn a frame - and half a turn is the wagon wheel: the track stands still or runs
     backwards. Held under one step, it always visibly runs the right way; at speed it runs
     slower than the ground goes by, which the eye takes for a blur. */
  var step = Math.hypot(e.x - r.x, e.z - r.z), len = R3.rollLen && R3.rollLen[e.def];
  if (step < 4) r.d += len ? Math.min(step, len / R3D_ROLL_N * 0.95) : step;   /* a jump (unloaded, placed) is not rolled */
  r.x = e.x; r.z = e.z;
  var dt = t - r.t;
  if (dt > 0 && dt < 1) {
    r.spin += dt * (e.rearming > 0 ? R3D_ROTOR_IDLE : R3D_ROTOR_SPIN);
    /* how fast it is turning and going, eased - what an aircraft banks and pitches to (air3d.js) */
    var dr = (e.rot || 0) - r.rot, ease = Math.min(1, dt * 4);
    dr = Math.atan2(Math.sin(dr), Math.cos(dr));
    r.w += (dr / dt - r.w) * ease; r.v += ((step < 4 ? step : 0) / dt - r.v) * ease;
  }
  r.rot = e.rot || 0; r.t = t;
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

/* Far enough out that a unit is a few dozen pixels long: the plain models will do (mesh3d.js). */
var R3D_CHUTE_H = 5.0;           /* world units a paratrooper falls from, over RTS_PARA.fall */
/* A SLUNG LOAD HANGS UNDER THE LEGS, not between them: on the size ladder the crane's legs stand
   0.9 world units apart across the beam and a Battle Tank is 1.6 wide, so the load's top sits
   this far below the crane's leg pads (its origin), by the load's own height. Drawn 0.4 under
   the origin regardless of height, a tank swallowed the legs, the hook and the cross members and
   put its turret through the spine. */
var R3D_SLING_GAP = 0.15;
var R3D_SLING_FALLBACK = 1.5;    /* world units of load height while its mesh is still to be built */
var R3D_LOD_CELL = 20;           /* device px a map cell, below which */
function _r3dLodFar(R3) {
  return !R3.lodOff && typeof _rtsZoom === 'function' && _rtsZoom() * RTS_TILE * (R3.scale || 1) < R3D_LOD_CELL;
}
/* Nearer, but a unit still forty pixels long: the plain geometry, walking and rolling (R3D_LOD_MID).
   Counted in the 3D buffer's pixels, so a heavy fight that drops the scale (pace3d.js) drops the
   detail with it. Seen side by side at a phone's opening zoom, the two differ in a few hundred
   pixels of the unit's edges, and the frame draws a third of the triangles for its units. */
var R3D_LOD_MID_CELL = 80;       /* device px a map cell, below which */
function _r3dLodMid(R3) {
  return !R3.lodOff && typeof _rtsZoom === 'function' && _rtsZoom() * RTS_TILE * (R3.scale || 1) < R3D_LOD_MID_CELL;
}

function _r3dPaintUnit(C, e, G, R3, drawIn, ART2W, lod) {
  var R = _rtsR, t = G.t || 0;
  var turret = R.spr.turret && R.spr.turret[e.side] && R.spr.turret[e.side][e.def];
  var d2 = rtsUnitDef(e.def), pose = 0, mo = _r3dUnitMotion(R3, e, t);
  /* OUT OF SIGHT, OUT OF THE PICTURE - dissolving as it goes (shroud3d.js) */
  var fade = _r3dSeenFade(R3, e, mo, t);
  if (fade <= 0) return;
  /* THE GROUND UNDER IT, not zero. An aircraft's altitude is measured from the ground it
     is over as well - it flies at a height, not at a level - so both take the terrain and
     only the flier adds to it. */
  var y = (e.air || d2.sea ? _rtsElev(e.x, e.z) : _rtsStandY(e.x, e.z)) + (e.air ? _rtsAirLift(e) * RTS_AIR_ALT_K : 0);   /* render/camera.js */
  if (e.chute > 0) y += e.chute / RTS_PARA.fall * R3D_CHUTE_H;     /* coming down under a canopy: core/paradrop.js */
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
     happens to be over is nothing to do with it: it leans into its turn (air3d.js). A ship
     leans on the swell instead.

     The TURRET takes the same lean as the hull rather than staying level, because it is
     bolted to the hull - it rotates in the hull's plane, and a turret that stayed
     world-level would shear out of its own ring on any slope.

     A SHIP ON A FLAT THE TIDE HAS DRIED sits on the sand (the Monitor's verb, core/monitor.js):
     no swell, no lean - the water sheet is cut away there (world3d.js) and a hull heaving on an
     invisible sea sank two thirds of its height into the ground at every trough. */
  var wet = d2.sea && _r3dWetAt(G, e.x, e.z);                /* fxwake3d.js */
  var gn = d2.sea ? (wet ? null : _rtsElevNormal(e.x, e.z)) : e.air ? _r3dAirLean(R3, e, mo, d2) : _rtsElevNormal(e.x, e.z);
  if (wet && !R3.swellOff) { var sw = _r3dShipSwell(e, t); y += sw.y; gn = sw.n; }
  var rk = _r3dRecoil(e, gn) || { hx: 0, hz: 0, tx: 0, tz: 0, n: gn };   /* the kick: combat3d.js */
  var AP = RTS_AIR_PARTS[e.def], rotor = AP && (AP.rotor || AP.prop) && !R3.rotorOff;
  mo.y = y;                                   /* where it was drawn, for its smoke (hurt3d.js) */
  if (e.air) { mo.n = rk.n; _r3dAirTrail(mo, e, y, t); }
  var hd = _r3dFadeDim(_r3dHurtDim(e, R3), fade);   /* scorched as it is damaged (hurt3d.js), fading (shroud3d.js) */
  var roll = d2.kind === 'vehicle' && !d2.sea && !e.air ? _r3dRollPhase(R3, e.def, mo.d) : 0;
  drawIn(C, _r3dMesh('u', e.def, e.side, turret ? 'hull' : (rotor ? 'body' : null), e.prone, pose, roll, lod),
         e.x + rk.hx, y, e.z + rk.hz, -e.rot, ART2W, hd, 1, rk.n);
  if (turret) {
    /* the one turret part, on each of its mounts: a tank's one at the origin, a gun ship's fore
       and aft (RTS_TURRET_AT, sprites/unit-airsea.js), all turned to the aim */
    var tm = _r3dMesh('u', e.def, e.side, 'turret', false, 0, 0, lod), TP = _r3dTurretAt(e.def, e.x + rk.tx, e.z + rk.tz, e.rot);
    for (var ti = 0; ti < TP.length; ti++) drawIn(C, tm, TP[ti].x, y, TP[ti].z, -(e.turret || 0), ART2W, hd, 1, rk.n);
  }
  if (rotor && AP.rotor) {
    var rm = _r3dMesh('u', e.def, e.side, 'rotor', false, 0, 0, lod), hubs = _r3dRotorHubs(e, mo.spin);
    for (var ri = 0; ri < hubs.length; ri++) drawIn(C, rm, hubs[ri].x, y, hubs[ri].z, hubs[ri].a, ART2W, hd, 1, rk.n);
  }
  if (rotor && AP.prop) drawIn(C, _r3dMesh('u', e.def, e.side, 'prop' + _r3dPropPhase(mo.spin), false, 0, 0, lod), e.x, y, e.z, -e.rot, ART2W, hd, 1, rk.n);
  /* A SLUNG LOAD (a Sky Crane's): the vehicle it carries hangs under it by its own height
     (R3D_SLING_GAP), never through the ground, scorched as IT is hurt rather than as the crane
     is, and its drawn height goes in its motion record so its smoke rises from it (hurt3d.js) */
  if (d2.slings && e.cargo && e.cargo.length && R3.slingOff !== true) {     /* R3.slingOff: a spec's A/B */
    var cg = e.cargo[0], cgt = R.spr.turret && R.spr.turret[cg.side] && R.spr.turret[cg.side][cg.def];
    var ch = _r3dMesh('u', cg.def, cg.side, cgt ? 'hull' : null, false, 0, 0, lod), ct = cgt ? _r3dMesh('u', cg.def, cg.side, 'turret', false, 0, 0, lod) : null;
    var top = ch ? Math.max(ch.top || 0, ct ? ct.top || 0 : 0) * ART2W : R3D_SLING_FALLBACK;
    var cy = Math.max(_rtsStandY(e.x, e.z), y - R3D_SLING_GAP - top), cd = _r3dFadeDim(_r3dHurtDim(cg, R3), fade);
    _r3dUnitMotion(R3, cg, t).y = cy;
    drawIn(C, ch, e.x, cy, e.z, -e.rot, ART2W, cd, 1, rk.n);
    if (ct) drawIn(C, ct, e.x, cy, e.z, -e.rot, ART2W, cd, 1, rk.n);
  }
}

/* Where a unit's turret part turns, in the world: at its origin, unless RTS_TURRET_AT (sprites/
   unit-airsea.js) names the mounts - a gun ship's fore and aft - in model units along the hull,
   which the one part is drawn at in turn. The husk of one does the same (husk3d.js). */
function _r3dTurretAt(def, x, z, rot) {
  var TP = typeof RTS_TURRET_AT !== 'undefined' && RTS_TURRET_AT[def];
  if (!TP) return [{ x: x, z: z }];
  var sc = _sprUnitScale(def) * RTS_TILE / RTS_TS, c = Math.cos(rot), s = Math.sin(rot), out = [];
  for (var i = 0; i < TP.length; i++) out.push({ x: x + (TP[i][0] * c - TP[i][1] * s) * sc, z: z + (TP[i][0] * s + TP[i][1] * c) * sc });
  return out;
}

/* Where a helicopter's rotors turn, in the world, and at what angle: one over the hub, or - a
   Chinook - one over each of RTS_AIR_PARTS.rotors, along the body and turning opposite ways.
   The same mesh is drawn at each (sprites/unit-airsea.js); unit/motion holds these hubs to the
   sprite's own rotors. */
function _r3dRotorHubs(e, spin) {
  var AP = RTS_AIR_PARTS[e.def] || {}, RS = AP.rotors || [0], sc = _sprUnitScale(e.def) * RTS_TILE / RTS_TS, out = [];
  for (var i = 0; i < RS.length; i++)
    out.push({ x: e.x + Math.cos(e.rot) * RS[i] * sc, z: e.z + Math.sin(e.rot) * RS[i] * sc, a: -e.rot - (i % 2 ? -spin : spin) });
  return out;
}
