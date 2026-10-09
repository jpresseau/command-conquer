/* core/bomber.js - the Heavy Bomber: a line of bombs laid across a base.

   The verb is the CARPET. Every other aircraft picks one target and spends its rack on it; the
   bomber spends its whole load in one pass. Sent at a target, it lays a line of RTS_BOMB.n bombs
   RTS_BOMB.gap cells apart along its course, centred on the aim. Each bomb falls for
   RTS_BOMB.fall seconds and bursts where it lands, hurting whatever stands there, whoever owns it:
   carpet-bomb a fight and your own men are under it too. Then the rack is empty, and it flies
   home to any air pad to load again (core/move.js `_rtsAirTick`).

   THE RUN IS THE ORDER'S. It belongs to the target it was given (run.tgt), and the line follows
   that target until the first bomb is away - a tank driving off is bombed where it is, not where
   it was. A bay that has opened is spent: called off or re-aimed after the first bomb, the bomber
   keeps nothing and goes home to load; before the first bomb it simply turns away, or re-plans on
   the new target. A target that dies under the line does not stop the line. And the bomber bombs
   ONLY what it is sent at: it never picks a target up by itself (core/units.js skips `carpets`
   in acquisition, core/response.js in retaliation and the base's defence), so a loaded one on its
   pad does not carpet its own base at the first raider to walk past.

   Both armies build one, behind a Helipad or an Airfield (`provides:['airpad']`). Its weapon is
   `carpet`, which only says what it can be sent at: _rtsFire never fires it (combat.js).

   ...OR AT A PLACE. Attack-move on the ground (A + right-click; on a phone the AMOVE button, then
   a hold) sends it at that spot: order 'bomb', the aim in e.bombAt, and the line laid across it
   as it would be across a target that never moves - a road a column will come down, the ground
   in front of a wall. And AN ORDER GIVEN WHILE IT CANNOT FLY WAITS: an empty rack, a pad turn or
   a storm put the aircraft tick in charge (core/move.js _rtsAirTick), which set the order to
   'rearm' and cleared it when the bombs were aboard, so a target or a place given to a bomber
   on its pad was dropped without a word. It is kept in e.bombNext and flown the first tick the
   bomber is free (_rtsBomberSend). 

   The opponent buys one once the player has dug in and its own base is defended, and sends it,
   whenever it is loaded, at the most crowded corner of the player's base: the building with the
   most of the player's buildings round it. */

var RTS_BOMB = { n: 8, gap: 1, fall: 0.7, dmg: 90, rad: 1.3, lead: 5, crowd: 4, every: 2 };

/* the run: n bombs gap cells apart, centred on (x, z), along the line the bomber flies to it.
   `aim` names what the run belongs to - the target's id, or the ground order's key */
function _rtsBombRun(e, x, z, aim) {
  var dx = x - e.x, dz = z - e.z, L = Math.hypot(dx, dz), step = RTS_BOMB.gap * RTS_TILE;
  /* right over the aim there is no course to it: the line runs the way the bomber is heading */
  if (L < RTS_TILE) { dx = Math.cos(e.rot); dz = Math.sin(e.rot); } else { dx /= L; dz /= L; }
  var half = (RTS_BOMB.n - 1) / 2 * step, out = half + RTS_BOMB.lead * RTS_TILE;
  e.run = { sx: x - dx * half, sz: z - dz * half, dx: dx, dz: dz, k: 0, tgt: aim };
  /* already past the start of the line: it lays only what is still ahead of it */
  var s = ((e.x - e.run.sx) * dx + (e.z - e.run.sz) * dz) / step;
  if (s > 0) e.run.k = Math.ceil(s);
  /* the run's end, inside the air clamp (core/airspace.js): a goal past the map's edge is one
     the bomber can never reach, and it hung there with its load */
  var lo = _rtsWX(0), hi = _rtsWX(RTS_N - 1);
  e.goal = { x: Math.max(lo, Math.min(hi, x + dx * out)), z: Math.max(lo, Math.min(hi, z + dz * out)) };
  e.path = [{ x: e.goal.x, z: e.goal.z }]; e.pi = 0;
}
/* A bomber's tick, ahead of the ordinary engage logic: true while it is on a run (the caller
   steers it), false to leave it to everything else. */
function _rtsBomberTick(e, dt, d) {
  if (!d.carpets) return false;
  /* free to fly, with an order that waited for it: fly it now (_rtsBomberSend) */
  if (e.bombNext && !e.run && e.ammo > 0) { var nx = e.bombNext; e.bombNext = null; _rtsBomberGo(e, nx); }
  /* what the run is aimed at: a target (order 'attack'), or a place on the ground (order 'bomb') */
  var ground = e.order === 'bomb' && !!e.bombAt, aim = ground ? _rtsBombKey(e.bombAt) : (e.target ? e.target.id : null);
  var r = e.run, live = ground || (e.order === 'attack' && !!e.target && !e.target.dead);
  var ax = ground ? e.bombAt.x : e.target && e.target.x, az = ground ? e.bombAt.z : e.target && e.target.z;
  /* called off, or pointed at something else: a bay that has opened is spent */
  if (r && ((e.order !== 'attack' && !ground) || (aim != null && r.tgt !== aim))) {
    if (r.k > 0) e.ammo = 0;
    e.run = r = null;
  }
  if (!r) {
    if (!live || !(e.ammo > 0)) return false;
    _rtsBombRun(e, ax, az, aim); r = e.run;
  } else if (r.k === 0) {
    /* nothing away yet: the line follows the target - or, the target gone, the run is off. The
       first bomb stays the first: a re-plan on the tick the bomber crosses the start of the line
       would otherwise count it as already past bomb 0 and lay seven. */
    if (!live) { e.run = null; e.order = null; e.target = null; e.path = null; e.goal = null; return false; }
    _rtsBombRun(e, ax, az, aim); r = e.run; r.k = 0;
  }
  var step = RTS_BOMB.gap * RTS_TILE, s = ((e.x - r.sx) * r.dx + (e.z - r.sz) * r.dz) / step;
  while (r.k < RTS_BOMB.n && s >= r.k) {
    var bx = r.sx + r.dx * r.k * step, bz = r.sz + r.dz * r.k * step;
    if (!_rtsInB(_rtsTX(bx), _rtsTX(bz))) { r.k = RTS_BOMB.n; break; }     /* the line runs off the map */
    _rtsBombDrop(e, bx, bz); r.k++;
  }
  if (r.k >= RTS_BOMB.n || !e.path || e.pi >= e.path.length) {
    /* the load is gone: home to load again */
    e.run = null; e.ammo = 0; e.target = null; e.order = null; e.path = null; e.goal = null; e.bombAt = null;
  }
  return true;
}
/* a ground order's key: the run belongs to the place, as a target's run belongs to its id */
function _rtsBombKey(p) { return 'at:' + Math.round(p.x) + ',' + Math.round(p.z); }
/* SEND IT: at a target ({ id }) or a place ({ x, z }). Loaded and free to fly, it goes now and
   this says true; otherwise the order waits in e.bombNext - the aircraft tick (core/move.js) is
   taking it home to load, or keeping it on the pad through a storm - and false says so. A bay
   already open lays the rest of its line first: re-aimed there, the run is spent (above), and
   the new aim was lost with it. */
function _rtsBomberSend(e, aim) {
  e.bombNext = null;
  var d = rtsUnitDef(e.def) || {};
  if (e.ammo > 0 && !(e.rearming > 0) && !_rtsStormGrounds(e, d) && !(e.run && e.run.k > 0)) { _rtsBomberGo(e, aim); return true; }
  e.bombNext = aim;
  return false;
}
function _rtsBomberGo(e, aim) {
  if (aim.id != null) {
    var t = window._rtsG.byId[aim.id];
    if (t && !t.dead) { e.bombAt = null; _rtsOrderAttack(e, t); }
    return;
  }
  e.order = 'bomb'; e.target = null; e.hstate = null; e.bombAt = { x: aim.x, z: aim.z };
}
function _rtsBombDrop(e, x, z) {
  var G = window._rtsG;
  /* the bomber by id, not by reference: a save walks G.bombs, and a dead bomber is a cycle */
  (G.bombs || (G.bombs = [])).push({ x: x, z: z, y: e.alt || 16, t: RTS_BOMB.fall, side: e.side, from: e.id });
}
/* bombs in the air: falling, then bursting where they land */
function _rtsBombsTick(dt) {
  var G = window._rtsG, B = G.bombs;
  if (!B || !B.length) return;
  for (var i = B.length - 1; i >= 0; i--) {
    var b = B[i];
    b.t -= dt;
    b.y = Math.max(0, b.y * b.t / (b.t + dt));
    if (b.t > 0) continue;
    B.splice(i, 1);
    /* `from` is the bomber: a splash spares its source, and the bomber turning for home hangs
       over the tail of its own line as the last bombs burst. The difficulty's FirepowerBias
       applies, as it does to every shot (combat.js). */
    var bomber = G.byId[b.from], dmg = RTS_BOMB.dmg * _rtsBias(b.side).fire, rad = RTS_BOMB.rad * RTS_TILE;
    if (bomber && bomber.dead) bomber = null;
    _rtsSplash(b.x, b.z, rad, dmg, b.side, 1, bomber);
    /* A BURST IS AN ATTACK. A splash attributes itself to nobody (see _rtsSplash), so a carpet
       across a base raised no "base under attack", woke no defence and tripped no trigger. The
       buildings under it are told, as a shell would tell them. */
    for (var k = 0, said = {}; k < G.ents.length; k++) {
      var s = G.ents[k];
      if (s.dead || s.type !== 'struct' || s.side === b.side || Math.hypot(s.x - b.x, s.z - b.z) > rad) continue;
      if (!said[s.side]) { said[s.side] = 1; _rtsAttacked(s.side); }
      if (bomber) _rtsBaseIsAttacked(s, bomber);
      _rtsTrigNotify('attacked', s, null);
    }
    _rtsCombatAnim(dmg, b.x, b.z, 1.6, null);
    if (typeof _rtsSfx === 'function') _rtsSfx('boom', b.x, b.z);
  }
}

/* ------------------------------------------------ the opponent's runs -- */
/* the most crowded corner of the player's base: the building with most others round it - walls
   not counted, or a wall line (nine segments round any one of them) outranks every real cluster */
function _rtsAIBombTarget() {
  var G = window._rtsG, best = null, bv = -1, R = RTS_BOMB.crowd * RTS_TILE, bs = [];
  for (var i = 0; i < G.ents.length; i++) { var b = G.ents[i]; if (!b.dead && b.side === _rtsAIFoe() && b.type === 'struct' && !(rtsStructDef(b.def) || {}).wall) bs.push(b); }
  for (var a = 0; a < bs.length; a++) {
    var n = 0;
    for (var k = 0; k < bs.length; k++) if (Math.hypot(bs[k].x - bs[a].x, bs[k].z - bs[a].z) <= R) n++;
    if (n > bv) { bv = n; best = bs[a]; }
  }
  return best;
}
function _rtsAIBombTick(dt) {
  var G = window._rtsG;
  G.ai.bombT = (G.ai.bombT || 0) + dt;
  if (G.ai.bombT < RTS_BOMB.every) return;
  G.ai.bombT = 0;
  for (var i = 0; i < G.ents.length; i++) {
    var u = G.ents[i];
    if (u.dead || u.side !== _rtsAIOn || u.type !== 'unit' || !(rtsUnitDef(u.def) || {}).carpets) continue;
    if (u.rearming > 0 || !(u.ammo > 0) || u.run || (u.order === 'attack' && u.target && !u.target.dead)) continue;
    var t = _rtsAIBombTarget();
    if (t) _rtsOrderAttack(u, t);
  }
}
