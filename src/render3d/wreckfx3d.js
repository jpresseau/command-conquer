/* render3d/wreckfx3d.js - a vehicle goes up in a fireball. Part of rts.render3d.

   Every unit died in the same `pop` (core/capture.js), a soldier and a Heavy Tank alike: a small,
   quick fireball whose record lives 0.4 s, so its billows had to be gone in 0.19 - at a tenth of
   a second a tank's death was already a grey haze with a few sparks in it, and a building's
   death, a `boom`, was the only explosion in the game that read as one.

   The fireball cannot be a `boom` record: a boom is a rule (RTS_ANIMS) whose crater eats the ore
   it lands in and whose scorch is drawn from the fx count - it would move the economy and every
   recorded game. So it is the renderer's alone. A vehicle that burns where it died leaves the
   fire record that carries its husk (husk3d.js); met here in its first moments, that record is
   given a fireball a building's size of its own - flash, glare, shock ring, sparks and billows
   that climb and roll into smoke, scaled by the vehicle - aged from the moment it died, which is
   kept beside the record in a WeakMap, not on it, since the record is game state and saved.

   A record met already burning - a loaded game, a replay seek - is just a fire: only a death
   seen within R3D_WRECK_NEW of happening goes up. R3.wreckAmt = 0 is the before-picture. */

var R3D_WRECK_LIFE = 1.0;          /* the fireball's own life: a boom's (its billows run to ~2.1 of it) */
var R3D_WRECK_NEW = 0.3;           /* seconds into the fire within which a death is still news */
/* the fireball's size, [0] + [1] x the vehicle's radius (1.6 a Buggy to 2.2 a Heavy Tank): a
   Buggy 1.06, a Heavy Tank 1.42 - under a two-wide building's boom (2) and well over the pop's 0.7 */
var R3D_WRECK_BIG = [0.1, 0.6];
var _R3D_WRECKS = typeof WeakMap === 'function' ? new WeakMap() : null;

function _r3dFxWrecks(G, V) {
  var R3 = window._R3D;
  if (!_R3D_WRECKS || !G.fx || (R3 && R3.wreckAmt === 0)) return;
  var t = G.t || 0;
  for (var i = 0; i < G.fx.length; i++) {
    var f = G.fx[i];
    if (!f.husk || f.t < 0) continue;
    var born = _R3D_WRECKS.get(f);
    if (born === undefined) {
      var A = RTS_ANIMS[f.kind];
      born = A && f.t < R3D_WRECK_NEW && (f.loops || 1) >= (A.loops || 1) ? t - f.t : -1;
      _R3D_WRECKS.set(f, born);
    }
    var a = t - born;
    if (born < 0 || a < 0 || a > R3D_WRECK_LIFE * 2.2) continue;
    /* the vehicle's radius, back out of the fire's base (core/capture.js: 0.55 + r x 0.28) */
    var r = Math.max(0.6, ((f.base || 0.83) - 0.55) / 0.28);
    _r3dFxBall(V, f.x, V.ground(f.x, f.z), 1, f.z, a, R3D_WRECK_BIG[0] + R3D_WRECK_BIG[1] * r,
               _r3dFxSeed(f) * 0.37 + 0.11, R3D_WRECK_LIFE, V.water(f.x, f.z));
  }
}
