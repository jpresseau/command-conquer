/* render3d/combat3d.js - the moment a gun goes off, in 3D. Part of rts.render3d.

   The 2D picture had it (render/draw.js): a flash at the muzzle for e.fire, and the turret
   drawn back along its barrel for e.recoil. The 3D mode had neither - a tank's shell left a
   barrel that did not move, from a muzzle that did not flash. So:

     RECOIL    the turret slides back along the barrel and the hull rocks back on its springs,
               both for e.recoil (RTS_RECOIL_TIME), easing home - scene3d.js reads _r3dRecoil
     FLASH     a burst of fire at the muzzle (_rtsFireCoord, where the shot really leaves) for
               e.fire, a puff of smoke hanging there after a cannon, and the flash as a point
               light for its instant (fxlight3d.js) - which at night lights everything round it

   Read off the simulation's own timers and never written back. R3.recoilAmt / R3.muzzleAmt
   take each out for a spec's A/B. */

var R3D_RECOIL_TURRET = 0.55;    /* world units the turret slides back at the shot */
var R3D_RECOIL_HULL = 0.16;      /* ...the hull */
var R3D_RECOIL_LEAN = 0.12;      /* ...and how far it rocks back, as the lean normal's tilt */
var R3D_MUZZLE_C = [1.0, 0.86, 0.55];

/* How far into its kick a unit is: 1 at the shot, easing to 0. */
function _r3dKick(e) {
  var R3 = window._R3D, d;
  if (!(e.recoil > 0) || (R3 && R3.recoilAmt === 0) || e.air || e.type !== 'unit') return 0;
  /* a vehicle's gun: a soldier does not slide back on springs, nor does a hull afloat */
  if (!(d = rtsUnitDef(e.def)) || d.kind !== 'vehicle' || d.sea) return 0;
  var k = Math.min(1, e.recoil / RTS_RECOIL_TIME);
  return k * k * (3 - 2 * k);
}
/* The recoil's offsets for a unit, along the bearing its gun points: the turret's, the hull's,
   and the hull's lean normal rocked back from `n` (or straight up). */
function _r3dRecoil(e, n) {
  var k = _r3dKick(e);
  if (!k) return null;
  var a = _rtsMuzzleAngle(e), bx = -Math.cos(a), bz = -Math.sin(a);
  var up = n || [0, 1, 0], t = R3D_RECOIL_LEAN * k;
  var lx = up[0] + bx * t, ly = up[1], lz = up[2] + bz * t, l = Math.hypot(lx, ly, lz) || 1;
  return { tx: bx * R3D_RECOIL_TURRET * k, tz: bz * R3D_RECOIL_TURRET * k,
           hx: bx * R3D_RECOIL_HULL * k, hz: bz * R3D_RECOIL_HULL * k, n: [lx / l, ly / l, lz / l] };
}

/* How big a weapon's flash is: a cannon's is a fireball's worth, a rifle's a spark. */
function _r3dMuzzleSize(e) {
  var d = e.type === 'unit' ? rtsUnitDef(e.def) : rtsStructDef(e.def), w = d ? RTS_WEAPONS[d.weapon] : null;
  if (!w) return 0.6;
  return w.shot === 'tracer' ? (w.dmg > 7 ? 0.55 : 0.4) : w.shot === 'missile' ? 0.9 : 1.2;
}
/* WHERE THE FLASH IS, on the ground plan: the shot's own coordinate (core/combat.js _rtsFireCoord)
   drawn at the barrel's tip - and FROM THE TURRET RING THAT FIRED. The sim fires from the unit's
   centre, but a destroyer's and a cruiser's guns stand fore and aft (RTS_TURRET_AT, unit3d.js
   _r3dTurretAt), two units apart: from the centre, a ship's flash burst from the deck between its
   guns. A ship with two rings fires from the one nearer its target; the Flak Track's one ring
   sits a little behind its middle. The shell's own path is the sim's and is left alone. */
function _r3dMuzzleAt(e) {
  var m = _rtsFireCoord(e), bx = (m.x - e.x) * 0.78, bz = (m.z - e.z) * 0.78, ox = e.x, oz = e.z;
  var TP = e.type === 'unit' && typeof RTS_TURRET_AT !== 'undefined' && RTS_TURRET_AT[e.def];
  if (TP) {
    var at = _r3dTurretAt(e.def, e.x, e.z, e.rot || 0), t = e.target, best = at[0];
    if (t && at.length > 1) for (var i = 1; i < at.length; i++)
      if (Math.hypot(at[i].x - t.x, at[i].z - t.z) < Math.hypot(best.x - t.x, best.z - t.z)) best = at[i];
    ox = best.x; oz = best.z;
  }
  return { x: ox + bx, z: oz + bz };
}
/* Every muzzle firing this instant, in view: [x, y, z, size, strength]. */
function _r3dMuzzles(G) {
  var R3 = window._R3D, out = [];
  if (!G || (R3 && R3.muzzleAmt === 0)) return out;
  var vb = _r3dBoundsNear(_r3dViewBounds(), 8, 16), E = G.ents || [];
  for (var i = 0; i < E.length; i++) {
    var e = E[i];
    if (e.dead || !(e.fire > 0) || e.air) continue;
    if (e.x < vb.x0 || e.x > vb.x1 || e.z < vb.z0 || e.z > vb.z1) continue;
    if (e.side !== 'player' && typeof _rtsEntSeen === 'function' && !_rtsEntSeen(e)) continue;
    /* where the shot leaves, drawn at the barrel's own tip: the sim's coordinate is a little
       further out than the 3D barrel reaches, and a flash that far out floated off the gun */
    var m = _r3dMuzzleAt(e), s = _r3dMuzzleSize(e);
    var y = (e.type === 'unit' ? _rtsStandY(e.x, e.z) : _rtsElev(e.x, e.z)) + (e.type === 'struct' ? 1.8 : 1.15);
    out.push([m.x, y, m.z, s, Math.min(1, e.fire / 0.09), e]);
  }
  return out;
}
/* Into the effects pass: the flash, and a cannon's smoke after it. */
function _r3dFxMuzzle(G, V) {
  _r3dMuzzles(G).forEach(function (m) {
    var s = m[3], k = m[4], seed = _r3dFxH(m[5].id, 5.3);
    _r3dFxBill(V.M, V, m[0], m[1], m[2], s * (0.7 + 0.5 * k), s * (0.7 + 0.5 * k), 0.8, R3D_FXT_FLASH, 0, seed, 0.6 + 0.4 * k, 0, R3D_MUZZLE_C);
    if (s >= 1.2) _r3dFxBill(V.M, V, m[0], m[1] + 0.2, m[2], s * 0.9, s * 0.9, 0.6, R3D_FXT_BLOB, 0.35 + (1 - k) * 0.3, seed, 0.45, 0.25 * k, R3D_FX_SMOKE);
  });
}
/* ...and as lights, for fxlight3d.js: [x, y, z, reach, strength] like an effect's. */
function _r3dMuzzleLights(G) {
  return _r3dMuzzles(G).map(function (m) { return [m[0], m[1], m[2], 4 + m[3] * 4, 1.6 * m[4] * m[3], 0]; });
}
