/* core/aihover.js - the opponent's Hovercraft: a raid that comes off the water.

   Every generated map has one body of water that reaches both coasts, about ten cells from each
   yard, while the land route between the bases runs straight down the middle - where the
   player's guns face. So the raid goes by sea: the Hovercraft takes a squad aboard at home,
   drives down to its own shore, sails the water to the beach nearest a player harvester and puts
   the squad ashore there, beside the ore field and behind the front. The squad goes for the
   harvester; the craft goes home to wait out RTS_AI_HOVER.rest and do it again.

     THE TARGET   a player harvester with a beach within RTS_AI_HOVER.near cells of it, the one
                  with the fewest guns around it (_rtsGuardsNear, as the land raiders choose);
                  nothing to raid is no Hovercraft bought (_rtsAISupport, core/aimines.js)
     THE CREW     up to RTS_AI_HOVER.crew armed infantry from home that no team has taken, rocket
                  squads first - a harvester is armour. Crew are flagged `raid`, so no team takes
                  them aboard or ashore (core/teams.js _rtsTeamCanAdd)
     THE ROUTE    in the SEA domain from the opponent's own launch water, so the craft keeps to
                  the water all the way rather than driving the land route a hovercraft could
     ASHORE       each raider attacks the nearest player harvester in reach of it, then the
                  nearest Refinery, and is handed back to the army (`raid` cleared) when there is
                  neither near

   All of it outside the weighted roll, for the reason the Mine Layer is: a mix entry moves every
   roll after it (core/aimines.js). The controller runs once a second and re-asserts its orders,
   since the base's own defence may take the craft or its crew for a while. */

var RTS_AI_HOVER = { crew: 4, near: 10, rest: 75, board: 45, sail: 150, reach: 18, every: 1 };

/* The opponent's own water: the nearest open sea cell to its yard. */
function _rtsAIHoverLaunch(G) {
  if (G.ai.hovLaunch !== undefined) return G.ai.hovLaunch;
  var ey = _rtsHasHome('enemy', 'yard') || _rtsHas('enemy', 'yard'), w = ey && _rtsNearestOpen(ey.tx, ey.tz, 30, 'sea');
  return (G.ai.hovLaunch = w ? { tx: w[0], tz: w[1], x: _rtsWX(w[0]), z: _rtsWX(w[1]) } : null);
}
/* Does a sea route run from the launch water to this water cell? */
function _rtsAIHoverSails(G, w) {
  var L = _rtsAIHoverLaunch(G);
  if (!L) return false;
  var p = _rtsPath(L.x, L.z, _rtsWX(w[0]), _rtsWX(w[1]), 'sea');
  if (!p || !p.length) return false;
  var end = p[p.length - 1];
  return Math.hypot(end.x - _rtsWX(w[0]), end.z - _rtsWX(w[1])) <= RTS_TILE * 1.5;
}
/* What to raid, and where to land for it: { h, beach, water } or null. Asked at most every few
   seconds - _rtsLandingSpot and a sea path are not free - and kept on G.ai for the spec to read. */
function _rtsAIHoverTarget() {
  var G = window._rtsG;
  if (G.ai.hovQ && G.t - G.ai.hovQ.t < 5 && (!G.ai.hovQ.v || !G.ai.hovQ.v.h.dead)) return G.ai.hovQ.v;
  var best = null, bv = -1e9;
  for (var i = 0; i < G.ents.length; i++) {
    var h = G.ents[i];
    if (h.dead || h.side !== 'player' || h.type !== 'unit' || h.inside || !(rtsUnitDef(h.def) || {}).harvest) continue;
    var beach = _rtsLandingSpot(h);
    if (!beach || Math.hypot(beach.x - h.x, beach.z - h.z) > RTS_AI_HOVER.near * RTS_TILE) continue;
    var w = _rtsNearestOpen(_rtsTX(beach.x), _rtsTX(beach.z), RTS_UNLOAD_REACH, 'sea');
    if (!w || !_rtsAIHoverSails(G, w)) continue;
    var v = -_rtsGuardsNear(h, RTS_RAID_GUARD_R) * 1000 - Math.hypot(beach.x - h.x, beach.z - h.z);
    if (v > bv) { bv = v; best = { h: h, beach: beach, water: { x: _rtsWX(w[0]), z: _rtsWX(w[1]) } }; }
  }
  G.ai.hovQ = { t: G.t, v: best };
  return best;
}
/* Armed infantry at home that nothing else has a claim on, rocket squads first. */
function _rtsAIHoverCrew(hc, n) {
  var G = window._rtsG, out = [];
  for (var i = 0; i < G.ents.length; i++) {
    var u = G.ents[i];
    if (u.dead || u.side !== 'enemy' || u.type !== 'unit' || u.inside || u.raid || u.sqd != null || u.mend != null) continue;
    var d = rtsUnitDef(u.def) || {};
    if (d.kind !== 'infantry' || !d.weapon || !_rtsMission(u).recruitable || !_rtsCanBoard(u, hc)) continue;
    var dist = Math.hypot(u.x - hc.x, u.z - hc.z);
    if (dist > RTS_AI_HOVER.reach * 2 * RTS_TILE) continue;
    out.push({ u: u, k: (u.def === 'rocket' ? 0 : 1e6) + dist });
  }
  out.sort(function (a, b) { return a.k - b.k; });
  return out.slice(0, n).map(function (o) { return o.u; });
}
function _rtsAIRaidPreyKind(o) { return o.def === 'refinery' || (o.type === 'unit' && !!(rtsUnitDef(o.def) || {}).harvest); }
/* Ashore: the nearest player harvester in reach, else the nearest Refinery in reach. */
function _rtsAIRaidPrey(u) {
  var G = window._rtsG, best = null, bd = RTS_AI_HOVER.reach * RTS_TILE;
  for (var pass = 0; pass < 2 && !best; pass++) {
    for (var i = 0; i < G.ents.length; i++) {
      var o = G.ents[i];
      if (o.dead || o.side !== 'player' || o.inside) continue;
      var hit = pass === 0 ? o.type === 'unit' && (rtsUnitDef(o.def) || {}).harvest : o.def === 'refinery';
      if (!hit) continue;
      var dd = Math.hypot(o.x - u.x, o.z - u.z);
      if (dd < bd) { bd = dd; best = o; }
    }
  }
  return best;
}

function _rtsAIHoverTick(dt) {
  var G = window._rtsG;
  G.ai.hovT = (G.ai.hovT || 0) + dt;
  if (G.ai.hovT < RTS_AI_HOVER.every) return;
  G.ai.hovT = 0;
  var st = G.ai.hov || (G.ai.hov = { s: 'rest', t: G.t - RTS_AI_HOVER.rest, crew: [] });
  /* the raiders ashore, whatever the craft is doing */
  st.crew = st.crew.filter(function (id) {
    var u = G.byId[id];
    if (!u || u.dead || !u.raid) return false;
    if (u.inside) return true;
    /* kept on its prey: a unit left to itself picks whatever is nearest, and a power plant by
       the beach is nearer than the harvester the raid came for */
    if (!u.target || u.target.dead || u.order !== 'attack' || !_rtsAIRaidPreyKind(u.target)) {
      var prey = _rtsAIRaidPrey(u);
      if (!prey) { u.raid = 0; u.order = null; u.target = null; return false; }   /* back to the army */
      _rtsOrderAttack(u, prey);
    }
    return true;
  });
  var hc = null;
  for (var i = 0; i < G.ents.length && !hc; i++) {
    var e = G.ents[i];
    if (!e.dead && e.side === 'enemy' && e.type === 'unit' && e.def === 'hovercraft') hc = e;
  }
  if (!hc) { st.s = 'rest'; return; }
  if (st.s === 'rest') {
    /* between raids it waits on its own water - not swept into a land attack wave, though the
       base's defence may still call on it (an attack order is left alone) */
    var home = _rtsAIHoverLaunch(G);
    if (home && hc.order !== 'attack' && Math.hypot(hc.x - home.x, hc.z - home.z) > RTS_TILE * 3 &&
        !(hc.order === 'move' && hc.goal && Math.hypot(hc.goal.x - home.x, hc.goal.z - home.z) < RTS_TILE)) _rtsOrderMove(hc, home.x, home.z, false);
    if (G.t - st.t < RTS_AI_HOVER.rest || !_rtsAIHoverTarget()) return;
    st.s = 'crew'; st.t = G.t;
  }
  if (st.s === 'crew') {
    if (hc.order !== 'hold') { hc.order = 'hold'; hc.path = null; hc.goal = null; }
    var want = RTS_AI_HOVER.crew - _rtsCargoCount(hc), boarding = 0;
    G.ents.forEach(function (u) { if (!u.dead && u.raid && !u.inside && u.order === 'board' && u.target === hc) boarding++; });
    _rtsAIHoverCrew(hc, Math.max(0, want - boarding)).forEach(function (u) {
      if (_rtsOrderBoard(u, hc)) { u.raid = 1; st.crew.push(u.id); }
    });
    var full = _rtsCargoCount(hc) >= RTS_AI_HOVER.crew, late = G.t - st.t > RTS_AI_HOVER.board;
    if (!full && !(late && _rtsCargoCount(hc) >= 2)) {
      if (late && G.t - st.t > RTS_AI_HOVER.board * 2) { st.s = 'rest'; st.t = G.t; }   /* nobody came */
      return;
    }
    /* the ones still walking up are left behind, and are the army's again */
    G.ents.forEach(function (u) { if (!u.dead && u.raid && !u.inside && u.order === 'board') { u.raid = 0; u.order = null; u.target = null; } });
    st.s = 'launch'; st.t = G.t;
  }
  var L = _rtsAIHoverLaunch(G), aim = _rtsAIHoverTarget();
  if (!L || !aim || G.t - st.t > RTS_AI_HOVER.sail) {               /* nothing left to raid, or lost */
    if (_rtsCargoCount(hc)) _rtsUnload(hc);
    st.s = 'rest'; st.t = G.t; return;
  }
  if (st.s === 'launch') {
    if (Math.hypot(hc.x - L.x, hc.z - L.z) > RTS_TILE * 1.5) {
      if (hc.order !== 'move' || !hc.path) _rtsOrderMove(hc, L.x, L.z, false);
      return;
    }
    st.s = 'sail';
  }
  if (st.s === 'sail') {
    if (!_rtsCargoCount(hc)) {                                        /* ashore: home to wait */
      _rtsOrderMove(hc, L.x, L.z, false);
      st.s = 'rest'; st.t = G.t; return;
    }
    if (hc.order !== 'unload' || !hc.goal || Math.hypot(hc.goal.x - aim.beach.x, hc.goal.z - aim.beach.z) > RTS_TILE * 2) {
      hc.order = 'unload'; hc.target = null; hc.hstate = null;
      hc.goal = { x: aim.beach.x, z: aim.beach.z };
      /* the sea path to the water off the beach, then the beach itself - the hull noses in */
      var p = _rtsPath(hc.x, hc.z, aim.water.x, aim.water.z, 'sea');
      hc.path = p ? p.concat([{ x: aim.beach.x, z: aim.beach.z }]) : null; hc.pi = 0;
      if (!hc.path) { _rtsUnload(hc); }
    }
  }
}
