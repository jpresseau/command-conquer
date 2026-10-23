/* core/marshal.js - THE MARSHAL'S AIR STRIKE (`lase` on rules/roster11.js).

   His second weapon is not a shot. Turned on a building or a vehicle, it is a red beam that marks
   it, and `strike.jets` Strike Jets come in from behind him - from the map's edge, on the line
   from the target through the Marshal - each laying `strike.bombs` bombs across the mark and
   flying on off the far side of the map. The bombs are the Heavy Bomber's (core/bomber.js
   G.bombs) with the strike's own weight and reach, so they fall on whoever is under them. Its
   `cool` is how long until he can call another (e.laseT, which core/combat.js _rtsPickWeapon
   reads); his rifle is not held up by it.

   A jet follows its mark until its first bomb is away, so a tank driving off is bombed where it
   is. It is a real aircraft on the way in: anything that shoots aircraft can bring it down. It is
   never built (`spawned`), and nothing else steers it: core/tick.js hands it to _rtsJetTick. */
var RTS_MARSHAL = { gap: 1, spread: 2.2, alt: 16, margin: 1 };

/* the lase itself, from core/combat.js _rtsFire */
function _rtsLase(e, tgt, w) {
  var G = window._rtsG, S = w.strike;
  if (!tgt || tgt.dead || tgt.air) return false;
  var dx = e.x - tgt.x, dz = e.z - tgt.z, L = Math.hypot(dx, dz) || 1;
  dx /= L; dz /= L;
  /* back along the line through him to the map's edge: where the jets come in */
  var lo = _rtsWX(RTS_MARSHAL.margin), hi = _rtsWX(RTS_N - 1 - RTS_MARSHAL.margin), t = 0;
  while (t < RTS_N * RTS_TILE) {
    var px = tgt.x + dx * (t + RTS_TILE), pz = tgt.z + dz * (t + RTS_TILE);
    if (px < lo || px > hi || pz < lo || pz > hi) break;
    t += RTS_TILE;
  }
  for (var k = 0; k < S.jets; k++) {
    var off = (k - (S.jets - 1) / 2) * RTS_MARSHAL.spread * RTS_TILE;
    var sx = tgt.x + dx * t - dz * off, sz = tgt.z + dz * t + dx * off;
    var j = _rtsSpawnUnit(e.side, 'strikejet', sx, sz);
    if (!j) continue;
    j.alt = RTS_MARSHAL.alt; j.rot = Math.atan2(-dz, -dx);
    j.strike = { tgt: tgt.id, ox: -dz * off * 0.25, oz: dx * off * 0.25, tx: tgt.x, tz: tgt.z, dx: -dx, dz: -dz, k: 0,
                 n: S.bombs, dmg: S.dmg * _rtsBias(e.side).fire, rad: S.rad, by: e.id };
  }
  var b = _rtsLensBeamFx(e, tgt, w); b.lase = 1;
  G.fx.push(b);
  e.lased = tgt.id;
  /* the lase's reload is its own: the next strike in `cool`, the rifle free again at once */
  e.laseT = G.t + w.cool * _rtsBias(e.side).rof;
  e.cool = Math.min(e.cool, RTS_WEAPONS[(rtsUnitDef(e.def) || {}).weapon].cool);
  return true;
}

/* A Strike Jet's tick: straight on, the bombs away over the mark, gone past the edge. */
function _rtsJetTick(e, dt) {
  var G = window._rtsG, s = e.strike, d = rtsUnitDef(e.def);
  if (s.k === 0) {
    var t = G.byId[s.tgt];
    if (t && !t.dead) { s.tx = t.x + s.ox; s.tz = t.z + s.oz; }
  }
  e.x += s.dx * d.speed * dt; e.z += s.dz * d.speed * dt;
  e.rot = Math.atan2(s.dz, s.dx); e.alt = RTS_MARSHAL.alt;
  /* how far past the mark it is, along its course; the stick is centred on the mark */
  var step = RTS_MARSHAL.gap * RTS_TILE, half = (s.n - 1) / 2 * step;
  var along = (e.x - s.tx) * s.dx + (e.z - s.tz) * s.dz;
  while (s.k < s.n && along >= -half + s.k * step) {
    var bo = -half + s.k * step;
    (G.bombs || (G.bombs = [])).push({ x: s.tx + s.dx * bo, z: s.tz + s.dz * bo, y: e.alt, t: RTS_BOMB.fall,
                                       side: e.side, from: e.id, dmg: s.dmg, rad: s.rad });
    s.k++;
  }
  /* at the map's edge it is gone, nothing left behind (the air clamp, core/airspace.js, keeps an
     aircraft from ever leaving the map, so the edge is as far as it goes) */
  var tx = _rtsTX(e.x), tz = _rtsTX(e.z);
  if (tx <= 0 || tz <= 0 || tx >= RTS_N - 1 || tz >= RTS_N - 1) _rtsKillQuiet(e);
}
