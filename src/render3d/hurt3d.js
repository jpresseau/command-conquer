/* render3d/hurt3d.js - damage you can see. Part of rts.render3d.

   A tank at a tenth of its health looked exactly like a new one in 3D, and a building at the
   point of collapse had only a dull red cast over it. The 2D art has damaged frames - scorched,
   holed, smoking - so the 3D mode shows the same, all of it read off hp against maxHp:

     SCORCH   soot blotches spreading over the paint as the damage mounts, from R3D_SCORCH_FROM
              of full health down, and a building's windows blown out past R3D_GLASS_OUT of the
              way down. Drawn by the mesh program (_tint, weather3d.js): the damage rides in the
              instance's dim value as 3 + how far gone it is
     SMOKE    below RTS_COND_YELLOW a vehicle trails a thin smoke from its engine deck and a
              building smokes from its roof, thicker the worse it is
     FIRE     below RTS_COND_RED the smoke turns black and the thing is on fire

   A building with its own fire (a flame weapon lit it - e.burning) is left to that fire. The
   roof spots are hashed from the building's id, so a building smokes from the same places
   every frame. R3.scorchOff takes the scorch out and leaves the old dull cast; R3.hurtOff takes
   the smoke and fire out. */

var R3D_SCORCH_FROM = 0.75;      /* the fraction of full health the scorch starts below */
var R3D_GLASS_OUT = 0.35;        /* how far gone before the windows go (the scorch's own 0-1) */

/* How far gone a thing is, 0 untouched to 1 at death, as the scorch measures it. A building
   still going up is not damaged; it is rising. */
function _r3dHurtAmt(e) {
  if (!e || !e.maxHp || e.building) return 0;
  return Math.max(0, Math.min(1, (R3D_SCORCH_FROM - e.hp / e.maxHp) / R3D_SCORCH_FROM));
}
/* The dim value an entity is drawn with: 3 + how far gone, or 0 - and 0 with R3.scorchOff, so
   the caller's own old dull cast stands. */
function _r3dHurtDim(e, R3) {
  var s = R3 && R3.scorchOff ? 0 : _r3dHurtAmt(e);
  return s > 0 ? 3 + s : 0;
}

/* Where on a building's roof it smokes and burns from: one spot, two on a big one. */
function _r3dHurtSpots(e, d) {
  var n = d.w * d.h >= 4 ? 2 : 1, out = [];
  for (var j = 0; j < n; j++) {
    out.push([e.x + (_r3dFxH(e.id * 3 + j, 1.7) - 0.5) * d.w * RTS_TILE * 0.55,
              e.z + (_r3dFxH(e.id * 5 + j, 2.9) - 0.5) * d.h * RTS_TILE * 0.55]);
  }
  return out;
}

/* Into the effects pass: the smoke and fire of everything hurt and in sight. */
function _r3dFxHurt(G, V) {
  var R3 = window._R3D, E = G.ents || [], vis = typeof _rtsVisible === 'function';
  if (!R3 || R3.hurtOff) return;
  for (var i = 0; i < E.length; i++) {
    var e = E[i];
    if (e.dead || e.building || e.burning || !e.maxHp || e.hp >= e.maxHp * RTS_COND_YELLOW) continue;
    if (e.type === 'unit' && rtsUnitDef(e.def).kind === 'infantry') continue;
    /* ABOARD, nothing of it shows - except a Sky Crane's load, which hangs in plain sight and
       smokes from where it is drawn (unit3d.js leaves that height in its motion record) */
    if (e.inside && !(rtsUnitDef(e.inside.def) || {}).slings) continue;
    if (vis && !_rtsVisible(_rtsTX(e.x), _rtsTX(e.z))) continue;
    if (e.type === 'unit' && !_rtsEffectsSeen(e)) continue;   /* a jammed unit's smoke gave it away: core/supers.js */
    var f = e.hp / e.maxHp, k = (RTS_COND_YELLOW - f) / RTS_COND_YELLOW, red = f < RTS_COND_RED;
    var seed = _r3dFxH(e.id, 9.1), tint = red ? R3D_FX_SOOT : R3D_FX_SMOKE;
    if (e.type === 'struct') {
      var d = rtsStructDef(e.def), m = _r3dMesh('b', e.def, e.side);
      var top = V.ground(e.x, e.z) + (m && m.top ? m.top * RTS_TILE / RTS_TS : 2) * 0.85;
      _r3dHurtSpots(e, d).forEach(function (p, j) {
        var sj = _r3dFxH(seed * 7 + j, 4.4);
        _r3dFxColumn(V, p[0], top, p[1], 1.6 + 1.8 * k, sj, V.t + sj * 10, 0.3 + 0.45 * k, tint);
        if (red) _r3dFxFire(V, p[0], top, p[1], 0.45 + 0.3 * d.w * 0.5, 0, sj, 3, 1);
      });
    } else {
      var mo = R3.motion && R3.motion[e.id], y = mo && mo.y !== undefined ? mo.y : V.ground(e.x, e.z);
      var fx = Math.cos(e.rot || 0), fz = Math.sin(e.rot || 0), r = (e.r || 1.6) * 0.45;
      var ex = e.x - fx * r, ez = e.z - fz * r, ey = y + 1.5;
      _r3dFxColumn(V, ex, ey, ez, 0.8 + 0.9 * k, seed, V.t + seed * 10, 0.25 + 0.4 * k, tint);
      if (red) _r3dFxFire(V, ex, ey - 0.3, ez, 0.3, 0, seed, 3, 1);
    }
  }
}
