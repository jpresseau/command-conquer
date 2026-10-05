/* core/paradrop.js - the Paradrop Plane: men put down behind the wall, from the air.

   The verb is the DROP. The Skylift has to set down to put a squad off, and a transport on the
   ground inside an enemy base is a transport lost. This plane never sets down (core/airspace.js
   asks `paradrops`): its squad is boarded where it waits over its Airfield, it flies to where it
   is sent, and the men jump - each comes down under a canopy for RTS_PARA.fall seconds, unable
   to act, and lands within a few cells of the drop. The plane goes straight home.

   The opponent uses it to go over a base the player has dug in: four squads, rocket squads
   first, dropped beside the player's least-guarded power plant, which they go for. */

var RTS_PARA = { fall: 1.2, crew: 4, rest: 90, board: 40, fly: 120, every: 1 };

/* the drop is done: home to the nearest friendly air pad */
function _rtsParaHome(e) {
  var G = window._rtsG, best = null, bd = 1e9;
  for (var i = 0; i < G.ents.length; i++) {
    var b = G.ents[i];
    if (b.dead || b.type !== 'struct' || b.side !== e.side || (rtsStructDef(b.def) || {}).produces !== 'air') continue;
    var d = Math.hypot(b.x - e.x, b.z - e.z);
    if (d < bd) { bd = d; best = b; }
  }
  if (best) _rtsOrderMove(e, best.x, best.z, false);
}
/* the men who got out jump: a canopy and a fall before each can act; the plane goes home.
   Each lands with no order unless one is given on the way down (core/units.js). */
function _rtsParaJumped(e, men) {
  for (var i = 0; i < men.length; i++) {
    var u = men[i];
    if (u.inside || u.dead) continue;
    u.chute = RTS_PARA.fall; u.order = null; u.path = null; u.goal = null; u.target = null;
  }
  _rtsParaHome(e);
  if (e.side === 'player' && typeof _rtsSay === 'function') _rtsSay('Paratroopers away.');
}
/* "Unload here and now" (the U key, the opponent's timed-out drop): the plane's men jump rather
   than appear on the ground from sixteen units up. Anything else unloads as it always did. */
function _rtsUnloadNow(t) {
  var men = (t && t.cargo || []).slice(), n = _rtsUnload(t);
  if (n && (rtsUnitDef(t.def) || {}).paradrops) _rtsParaJumped(t, men);
  return n;
}

/* ------------------------------------------------ the opponent's drops -- */
/* what to drop on: the player's power plant with the fewest guns round it */
function _rtsAIParaTarget() {
  var G = window._rtsG, best = null, bv = 1e9;
  for (var i = 0; i < G.ents.length; i++) {
    var b = G.ents[i];
    if (b.dead || b.side !== 'player' || b.type !== 'struct' || !((rtsStructDef(b.def) || {}).power > 0)) continue;
    var v = _rtsGuardsNear(b, RTS_RAID_GUARD_R);
    if (v < bv) { bv = v; best = b; }
  }
  return best;
}
function _rtsAIParaTick(dt) {
  var G = window._rtsG;
  G.ai.paraT = (G.ai.paraT || 0) + dt;
  if (G.ai.paraT < RTS_PARA.every) return;
  G.ai.paraT = 0;
  var st = G.ai.para || (G.ai.para = { s: 'rest', t: G.t - RTS_PARA.rest, crew: [] });
  /* the men on the ground: at the target, then any of the player's buildings near, then home */
  st.crew = st.crew.filter(function (id) {
    var u = G.byId[id];
    if (!u || u.dead || !u.raid) return false;
    if (u.inside || u.chute > 0) return true;
    if (!u.target || u.target.dead || u.order !== 'attack') {
      var aim = st.aim && !st.aim.dead ? st.aim : null, near = 1e9;
      if (!aim) G.ents.forEach(function (b) {
        if (b.dead || b.side !== 'player' || b.type !== 'struct') return;
        var d = Math.hypot(b.x - u.x, b.z - u.z);
        if (d < near && d < RTS_AI_HOVER.reach * RTS_TILE) { near = d; aim = b; }
      });
      if (!aim) { u.raid = 0; u.order = null; u.target = null; return false; }
      _rtsOrderAttack(u, aim);
    }
    return true;
  });
  var pl = null;
  for (var i = 0; i < G.ents.length && !pl; i++) {
    var e = G.ents[i];
    if (!e.dead && e.side === 'enemy' && e.type === 'unit' && (rtsUnitDef(e.def) || {}).paradrops) pl = e;
  }
  if (!pl) { st.s = 'rest'; return; }
  if (st.s === 'rest') {
    if (G.t - st.t < RTS_PARA.rest || !_rtsAIParaTarget()) return;
    st.s = 'crew'; st.t = G.t;
  }
  if (st.s === 'crew') {
    var want = RTS_PARA.crew - _rtsCargoCount(pl), boarding = 0;
    G.ents.forEach(function (u) { if (!u.dead && u.raid && !u.inside && u.order === 'board' && u.target === pl) boarding++; });
    _rtsAIHoverCrew(pl, Math.max(0, want - boarding)).forEach(function (u) {
      if (_rtsOrderBoard(u, pl)) { u.raid = 1; st.crew.push(u.id); }
    });
    var full = _rtsCargoCount(pl) >= RTS_PARA.crew, late = G.t - st.t > RTS_PARA.board;
    if (!full && !(late && _rtsCargoCount(pl) >= 2)) {
      if (late && G.t - st.t > RTS_PARA.board * 2) { st.s = 'rest'; st.t = G.t; }
      return;
    }
    G.ents.forEach(function (u) { if (!u.dead && u.raid && !u.inside && u.order === 'board') { u.raid = 0; u.order = null; u.target = null; } });
    st.aim = _rtsAIParaTarget();
    if (!st.aim) { st.s = 'rest'; st.t = G.t; return; }
    /* the drop zone: open ground just past the plant's footprint, on the side away from the
       player's yard - the side its guns face least */
    var py = _rtsHas('player', 'yard') || st.aim, dx = st.aim.x - py.x, dz = st.aim.z - py.z, L = Math.hypot(dx, dz) || 1;
    var off = (Math.max((rtsStructDef(st.aim.def) || {}).w || 2, 2) / 2 + 1.5) * RTS_TILE;
    var c = _rtsNearestOpen(_rtsTX(st.aim.x + dx / L * off), _rtsTX(st.aim.z + dz / L * off), 3, null);
    if (!c || !_rtsOrderUnloadAt(pl, _rtsWX(c[0]), _rtsWX(c[1]))) { st.s = 'rest'; st.t = G.t; return; }
    st.s = 'fly'; st.t = G.t;
    return;
  }
  if (st.s === 'fly' && (!_rtsCargoCount(pl) || G.t - st.t > RTS_PARA.fly)) {
    if (_rtsCargoCount(pl)) { if (!_rtsUnloadNow(pl)) _rtsParaHome(pl); }   /* out of time: jump here */
    st.s = 'rest'; st.t = G.t;
  }
}
