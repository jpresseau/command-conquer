/* render3d/air3d.js - aircraft that fly like aircraft. Part of rts.render3d.

   An aircraft was drawn level and square to the map whatever it did: a MiG pulling round onto a
   target turned like a weathervane, a helicopter crossing the map at full speed hung as if
   parked on a hook. Now, all of it read off what the aircraft is doing (the motion record,
   render3d/unit3d.js), so the game knows nothing about it:

     BANKING     anything that flies leans into its turn, as far as it is turning hard - a jet
                 most, a helicopter less - and rolls level as it straightens out
     PITCH       a helicopter tips its nose down to fly, as far as it is going fast
     PROPELLER   a Yak's propeller turns: part 'prop<k>', built at R3D_PROP_N angles round
                 its hub and stepped through by the rotor's own spin
     CONTRAILS   a jet in flight draws two white lines off its wingtips that hang where it has
                 been and spread and fade - the one effect here that remembers, because a
                 trail has to follow the path rather than the heading
     AFTERBURNER a jet's exhaust burns: a hot glow that flickers

   On the pad (rearming) everything sits level. R3.airOff takes the banking and pitch out, and
   R3.trailOff the contrails, for a spec's A/B; R3.rotorOff stops the propeller as it stops the
   rotor. */

var R3D_BANK_K = 0.45;           /* radians of bank for each radian a second of turn */
var R3D_BANK_MAX = 0.6;          /* the most anything banks, radians */
var R3D_HELI_BANK = 0.5;         /* a helicopter banks this much of what a jet would */
var R3D_HELI_PITCH = 0.22;       /* how far a helicopter noses down at full speed, radians */
var R3D_PROP_N = 4;              /* angles the propeller is built at, across its quarter turn */
var R3D_TRAIL_EVERY = 0.07;      /* seconds between the points a contrail is laid through */
var R3D_TRAIL_LIFE = 2.4;        /* seconds a contrail hangs */
var R3D_TRAIL_C = [0.96, 0.97, 0.99];
var R3D_BURN_C = [1.0, 0.62, 0.3];

/* The normal an aircraft leans to: up, tipped toward the inside of its turn by the bank and
   forward by the pitch. null - upright - on the pad, or with R3.airOff. */
function _r3dAirLean(R3, e, mo, d) {
  if (R3.airOff || e.rearming > 0) return null;
  var heli = RTS_AIR_PARTS[e.def] && RTS_AIR_PARTS[e.def].rotor;
  var bank = Math.max(-R3D_BANK_MAX, Math.min(R3D_BANK_MAX, mo.w * R3D_BANK_K)) * (heli ? R3D_HELI_BANK : 1);
  var pitch = heli ? R3D_HELI_PITCH * Math.min(1, mo.v / ((d && d.speed) || 20)) : 0;
  if (Math.abs(bank) < 1e-3 && pitch < 1e-3) return null;
  var fx = Math.cos(e.rot), fz = Math.sin(e.rot), sb = Math.sin(bank), sp = Math.sin(pitch), cu = Math.cos(bank) * Math.cos(pitch);
  var nx = -fz * sb + fx * sp, nz = fx * sb + fz * sp, l = Math.hypot(nx, cu, nz);
  return [nx / l, cu / l, nz / l];
}

/* Which of the propeller's angles its spin is at. The blades cross, so a quarter turn brings
   them back onto themselves; the spin runs fast enough that this steps on most frames. */
function _r3dPropPhase(spin) {
  var q = Math.PI / 2, a = ((spin % q) + q) % q;
  return Math.floor(a / q * R3D_PROP_N) % R3D_PROP_N;
}

/* The propeller at angle k of R3D_PROP_N: a hub and two crossed blades, in the plane across
   the nose, built where the model's own propeller sits. Tubes, not boxes - _r3dLimb runs
   between any two points, which is what lets a blade stand at an angle a box cannot. */
function _r3dPropModel(def, side, k) {
  var P = RTS_AIR_PARTS[def] && RTS_AIR_PARTS[def].prop;
  if (!P) return null;
  var m = [], DK = RTS_PAL.dark, GN = RTS_PAL.gun, a0 = k / R3D_PROP_N * Math.PI / 2;
  for (var b = 0; b < 2; b++) {
    var a = a0 + b * Math.PI / 2, cy = Math.cos(a) * P[3], cz = Math.sin(a) * P[3];
    _r3dLimb(m, P[0], P[1] - cy, P[2] - cz, P[0], P[1] + cy, P[2] + cz, 0.32, 0.32, 8, DK[1]);
  }
  _r3dBall(m, P[0] + 0.3, P[1], P[2], 0.7, GN[2], 10, 6);                 /* spinner */
  var sc = _sprUnitScale(def);
  return sc === 1 ? m : _r3Scale(m, sc);
}

/* A JET'S CONTRAIL: where it has been, every R3D_TRAIL_EVERY seconds, for as long as a trail
   hangs. Called by every pass, so it lays a point only when one is due. */
function _r3dAirTrail(mo, e, y, t) {
  var AP = RTS_AIR_PARTS[e.def];
  if (!AP || !AP.trail) return;
  var T = mo.trail || (mo.trail = []);
  if (e.rearming > 0) { T.length = 0; return; }
  if (T.length && t - T[T.length - 1][3] < R3D_TRAIL_EVERY && t >= T[T.length - 1][3]) return;
  if (T.length && t < T[T.length - 1][3]) T.length = 0;          /* the clock went back: a spec */
  T.push([e.x, y, e.z, t, -Math.sin(e.rot), Math.cos(e.rot)]);
  while (T.length && t - T[0][3] > R3D_TRAIL_LIFE) T.shift();
}

/* Into the effects pass: the contrails and the afterburners of whatever is flying in sight. */
function _r3dFxAir(G, V) {
  var R3 = window._R3D, M = R3 && R3.motion, E = G.ents || [], vis = typeof _rtsVisible === 'function';
  if (!M) return;
  var w2 = RTS_TILE / RTS_TS;
  for (var i = 0; i < E.length; i++) {
    var e = E[i], AP = RTS_AIR_PARTS[e.def], mo = M[e.id];
    if (e.dead || !e.air || !AP || !mo || mo.y === undefined || e.rearming > 0) continue;
    if (vis && !_rtsVisible(_rtsTX(e.x), _rtsTX(e.z))) continue;
    var sc = _sprUnitScale(e.def) * w2, fx = Math.cos(e.rot), fz = Math.sin(e.rot);
    if (AP.trail && mo.trail && R3.trailOff !== true) {
      var T = mo.trail, tip = AP.tips * sc;
      for (var j = 1; j < T.length; j++) {
        var p0 = T[j - 1], p1 = T[j], age = V.t - p1[3];
        if (age < 0 || age > R3D_TRAIL_LIFE) continue;
        var u = age / R3D_TRAIL_LIFE, op = 0.8 * (1 - u) * Math.min(1, age * 6 + 0.3), wd = 0.25 + u * 1.1;
        /* each piece reaches back over the one before: a streak fades in along its first half,
           so laid end to end they would come out as dashes, and overlapped they are one line */
        for (var s = -1; s <= 1; s += 2) {
          var ax = p1[0] + p1[4] * tip * s, az = p1[2] + p1[5] * tip * s, bx0 = p0[0] + p0[4] * tip * s, bz0 = p0[2] + p0[5] * tip * s;
          _r3dFxStreak(V.M, V, 2 * bx0 - ax, 2 * p0[1] - p1[1], 2 * bz0 - az, ax, p1[1], az, wd, 0.6, R3D_FXT_RAIN, 0, i + s, op, 0, R3D_TRAIL_C);
        }
      }
    }
    if (AP.burner) {
      var B = AP.burner, bx = e.x + fx * B[0] * sc, bz = e.z + fz * B[0] * sc, by = mo.y + B[1] * sc;
      var fl = 0.8 + 0.2 * Math.sin(V.t * 37 + i) * Math.sin(V.t * 23 + i * 2);
      _r3dFxBill(V.M, V, bx, by, bz, 0.55 * fl, 0.55 * fl, 0.6, R3D_FXT_GLOW, 0, 0.5, 1.0, 0, R3D_BURN_C);
      _r3dFxStreak(V.M, V, bx, by, bz, bx - fx * 1.6 * fl, by, bz - fz * 1.6 * fl, 0.4, 0.6, R3D_FXT_STREAK, 0, i, 0.8, 0, R3D_BURN_C);
    }
  }
}
