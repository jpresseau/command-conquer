/* A FINGERPRINT OF A BATTLE: a hash of the whole simulation's state at a moment, for asserting that
   a change to the code did not change what the game DOES.

   e2e/determinism hashes a summary - clock, treasuries, positions, health - because its question is
   whether a seed replays. This one is for a refactor, so it is deliberately wider: the orders and
   targets units hold, what each production line is making, the teams and what they are doing, and
   the computer opponent's own state. A refactor that changes a decision the summary cannot see, a
   different unit picked for a team or a different target held for one frame, changes this hash.
   Numbers go in at full precision: "byte-identical" is the claim, so nothing is rounded away.

   battle(g, cfg) steps a headless battle in a context made by test/lib/sandbox.js and returns the
   fingerprints sampled along the way. KEEP holds the player's buildings at full health every tick,
   so an idle player is not overrun at minute four and the opponent goes on raising teams, buying
   support units and attacking for as long as the battle runs. */

function _fnv(s) {
  var h = 0x811c9dc5;
  for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return ('00000000' + h.toString(16)).slice(-8);
}
function _id(v) { return v && typeof v === 'object' ? (v.id === undefined ? null : v.id) : (v === undefined ? null : v); }
/* team ids, renumbered per side in order of creation, so two runs that raised the same teams in the
   same order agree however the ids themselves were counted */
function _teamMap(G, teams) {
  var bySide = {}, map = {};
  Object.keys(teams || {}).map(Number).sort(function (a, b) { return a - b; }).forEach(function (tid) {
    var t = teams[tid], side = (t && t.side) || 'enemy';
    bySide[side] = (bySide[side] || 0) + 1;
    map[tid] = side + '#' + bySide[side];
  });
  return map;
}
function snapshot(g, extraTeams) {
  var G = g._rtsG, out = { t: G.t, over: G.over || null, sides: {}, ents: [], teams: [], ai: null };
  var teams = {}, k;
  for (k in (G.teams || {})) teams[k] = G.teams[k];
  for (k in (extraTeams || {})) teams[k] = extraTeams[k];
  var tm = _teamMap(G, teams);
  Object.keys(G.sides).sort().forEach(function (s) {
    var S = G.sides[s], q = {};
    for (var c in (S.q || {})) { var j = S.q[c]; q[c] = j ? [j.key, j.prog, j.paid, j.hold ? 1 : 0] : null; }
    out.sides[s] = [S.credits, S.ore, S.powerMade, S.powerUsed, S.ready || null, q, S.supers ? JSON.stringify(S.supers) : null];
  });
  G.ents.forEach(function (e) {
    if (e.dead) return;
    out.ents.push([e.id, e.type, e.def, e.side, e.x, e.z, e.hp, e.order || null, _id(e.target), e.path ? e.path.length : -1,
      e.sqd != null ? (tm[e.sqd] || 'gone') : null, e.escort != null ? (tm[e.escort] || 'gone') : null,   /* team 0 is a team */ e.inside ? _id(e.inside) : null,
      e.goal ? [e.goal.x, e.goal.z] : null, e.ammo === undefined ? null : e.ammo, e.rot === undefined ? null : e.rot,
      e.turret === undefined ? null : e.turret, e.carry === undefined ? null : e.carry, e.hstate || null, e.cool === undefined ? null : e.cool]);
  });
  /* by seat, then in order of creation: two runs that number their teams differently - one counter
     for every seat, or one per seat - still list them alike */
  Object.keys(teams).map(Number).sort(function (a, b) {
    var A = tm[a].split('#'), B = tm[b].split('#');
    return A[0] < B[0] ? -1 : A[0] > B[0] ? 1 : A[1] - B[1];
  }).forEach(function (tid) {
    var t = teams[tid];
    out.teams.push([tm[tid], t.type ? t.type.name : null, (t.members || []).map(_id), t.mi === undefined ? null : t.mi]);
  });
  if (G.ai) out.ai = [G.ai.wave, G.ai.next, G.ai.state, G.ai.want ? G.ai.want.key || null : null];
  out.proj = (G.proj || []).length;
  out.mines = (G.mines || []).map(function (m) { return [m.tx, m.tz, m.side]; });
  out.stats = [G.stats.killed, G.stats.lostU];
  return out;
}
function fingerprint(g, extraTeams) { return _fnv(JSON.stringify(snapshot(g, extraTeams))); }

/* A PLAYER WHO DOES THE OBVIOUS THINGS, every three seconds: keep the lights on, two refineries,
   a barracks and a factory, a line of four guns, radar and a lab; three harvesters, then the heavy
   gun and tanks; push at the opponent's base once eight are idle. The same script as e2e/pushback's
   (which runs it in the page), here so the fingerprint also covers everything the opponent does
   ABOUT a player: sizing its base to the player's, raiding harvesters, answering defences, picking
   targets in a base that grows. Against an idle player none of that ever runs. */
function pusher(g) {
  var G = g._rtsG, P = G.sides.player, next = 0;
  function have(key) { var n = 0; G.ents.forEach(function (e) { if (!e.dead && e.side === 'player' && e.def === key) n++; }); return n; }
  function spot() {
    var y = g._rtsHas('player', 'yard') || g._rtsHas('player', 'factory');
    var open = y && g._rtsNearestOpen(y.tx + 3, y.tz + 3, 14, null);
    return open ? { tx: open[0], tz: open[1] } : null;
  }
  function wantStruct() {
    if (P.powerMade - P.powerUsed < 40) return 'power';
    if (have('refinery') < 2) return 'refinery';
    if (!have('barracks')) return 'barracks';
    if (!have('factory')) return 'factory';
    var def = g.rtsHouseSide('player') === 'allied' ? 'pillbox' : 'flametower';
    if (have(def) < 4) return def;
    if (!have('radar')) return 'radar';
    if (!have('lab')) return 'lab';
    return null;
  }
  function wantUnit() {
    if (have('harvester') < 3) return 'harvester';
    var heavy = g.rtsHouseSide('player') === 'allied' ? 'arty' : 'v2rl';
    if (g._rtsCanQueue('player', heavy) && have(heavy) < 3) return heavy;
    if (g._rtsCanQueue('player', 'tank')) return 'tank';
    return 'rifle';
  }
  return function () {
    if (G.t < next) return;
    next = G.t + 3;
    if (P.ready) {
      var sp = spot();
      if (sp && !g._rtsBlocked(sp.tx, sp.tz, null)) { g._rtsPlaceStruct('player', P.ready, sp.tx, sp.tz, false, P.readyPaid); P.ready = null; P.readyPaid = null; }
    }
    if (!P.q.struct && !P.ready) { var ws = wantStruct(); if (ws && g._rtsCanQueue('player', ws)) g._rtsQueue('player', ws); }
    var wu = wantUnit();
    if (wu && g._rtsCanQueue('player', wu)) g._rtsQueue('player', wu);
    var army = G.ents.filter(function (u) { return !u.dead && u.side === 'player' && u.type === 'unit' && !g.rtsUnitDef(u.def).harvest; });
    if (army.length >= 8) {
      var tgt = g._rtsHas('enemy', 'yard') || g._rtsHas('enemy', 'refinery') || g._rtsHas('enemy', 'power');
      if (tgt) army.forEach(function (u, i) {
        if (u.order === 'amove' || u.order === 'attack') return;
        g._rtsOrderMove(u, tgt.x + (i % 5 - 2) * g.RTS_TILE, tgt.z + ((i / 5 | 0) - 1) * g.RTS_TILE, true);
      });
    }
  };
}

/* cfg: { seed, diff, army ('allied'|'soviet'), secs, every (s), keep, push, dt, self (the player's
   seat played by the computer at this difficulty) } */
function battle(g, cfg) {
  if (cfg.army) g.window._RTS_ARMY = cfg.army;
  g._rtsNewGame(cfg.seed, cfg.diff, cfg.self ? { player: { ctl: 'ai', diff: cfg.self } } : undefined);
  var G = g._rtsG, dt = cfg.dt || 1 / 60, every = cfg.every || 30, steps = Math.round(cfg.secs / dt), per = Math.round(every / dt);
  var marks = [], kinds = {}, play = cfg.push ? pusher(g) : null;
  for (var i = 1; i <= steps; i++) {
    if (cfg.keep) G.ents.forEach(function (e) { if (e.side === 'player' && e.type === 'struct' && !e.dead) e.hp = e.maxHp; });
    if (play) play();
    g._rtsTick(dt);
    if (i % per === 0 || G.over) {
      marks.push(fingerprint(g));
      G.ents.forEach(function (e) { if (!e.dead) kinds[e.side + ':' + e.def] = 1; });
    }
    if (G.over) break;
  }
  return { marks: marks, t: G.t, over: G.over || null, ents: G.ents.filter(function (e) { return !e.dead; }).length,
           kinds: Object.keys(kinds).sort() };
}

module.exports = { snapshot: snapshot, fingerprint: fingerprint, battle: battle, pusher: pusher };
