/* core/supers.js - superweapons (atom bomb, iron curtain, chronosphere, GPS) and the shroud
   they lift. Part of rts.core, the simulation. */

/* =========================================================== superweapons ==
   Four buildings whose whole output is one button on a timer.

   The charge lives on the HOUSE, not on the building. That is SuperClass in the original and
   it matters for a reason you find out by selling things: if the timer belonged to the silo,
   you could sell it at 99% and rebuild for a fresh missile, or - worse - build two silos and
   get two nukes on one charge. Owning ONE working example of the building is what makes a
   super chargeable; owning three is no faster.

   `ready` is separate from `t` rather than derived, because the moment a super becomes ready
   is an EVENT - it announces itself, and an auto-firing one goes off - and a derived flag
   would re-fire it on every tick that followed. */

/* Every super the side can charge right now: it owns a finished, undestroyed example of the
   building, and the building is not browned out. */
function _rtsSuperSources(side) {
  var G = window._rtsG, out = {}, i;
  for (i = 0; i < G.ents.length; i++) {
    var e = G.ents[i];
    if (e.dead || e.type !== 'struct' || e.side !== side || e.building) continue;
    var d = rtsStructDef(e.def);
    if (d && d.super && !out[d.super.key]) out[d.super.key] = { def: d, ent: e };
  }
  return out;
}

/* Low power stalls a charge rather than resetting it - the same treatment a Tesla coil gets,
   and for the same reason: a brownout should cost you tempo, not the whole investment. */
function _rtsSupersTick(dt) {
  var G = window._rtsG, sides = ['player', 'enemy'], k;
  for (var s = 0; s < sides.length; s++) {
    var side = sides[s], S = G.sides[side];
    if (!S) continue;
    if (!S.supers) S.supers = {};
    var have = _rtsSuperSources(side);

    /* a super whose building is gone stops charging and loses what it had */
    for (k in S.supers) if (!have[k]) delete S.supers[k];

    for (k in have) {
      var sup = have[k].def.super;
      var st = S.supers[k] || (S.supers[k] = { t: 0, ready: false, said: false });
      if (st.ready) continue;
      st.t += dt * (_rtsPowerFactor ? _rtsPowerFactor(side) : 1);
      if (st.t < sup.charge) continue;
      st.t = sup.charge;
      st.ready = true;
      if (side === 'player') {
        if (typeof _rtsSay === 'function') _rtsSay(sup.hint);
        if (typeof rtsEva === 'function') rtsEva('ready');
      }
      /* GPS launches itself; see the note on its def. */
      if (sup.auto) _rtsSuperFire(side, k, 0, 0);
    }
  }
}

function _rtsSuperReady(side, key) {
  var S = window._rtsG.sides[side];
  return !!(S && S.supers && S.supers[key] && S.supers[key].ready);
}
/* 0..1, for the charge bar on the button. */
function _rtsSuperProgress(side, key) {
  var S = window._rtsG.sides[side];
  var st = S && S.supers && S.supers[key];
  if (!st) return 0;
  var d = _rtsSuperDefOf(key);
  return d ? Math.max(0, Math.min(1, st.t / d.super.charge)) : 0;
}
function _rtsSuperDefOf(key) {
  for (var i = 0; i < RTS_STRUCTS.length; i++)
    if (RTS_STRUCTS[i].super && RTS_STRUCTS[i].super.key === key) return RTS_STRUCTS[i];
  return null;
}

/* Fire. Returns true if it went off; false leaves the charge alone, so a refused shot is not
   a wasted one. */
function _rtsSuperFire(side, key, tx, tz, sel) {
  var G = window._rtsG;
  if (!_rtsSuperReady(side, key)) return false;
  var ok = false;
  if (key === 'nuke')             ok = _rtsFireNuke(side, tx, tz);
  else if (key === 'ironcurtain') ok = _rtsFireIron(side, tx, tz);
  else if (key === 'chrono')      ok = _rtsFireChrono(side, tx, tz, sel);
  else if (key === 'gps')         ok = _rtsFireGps(side);
  if (!ok) return false;
  var st = G.sides[side].supers[key];
  st.t = 0; st.ready = false; st.said = false;
  return true;
}

/* ---- the atom bomb. The delay is the point: a nuke you cannot see coming is just a large
   number appearing in your base, and the three seconds are what make it a moment. */
function _rtsFireNuke(side, tx, tz) {
  var G = window._rtsG;
  if (!_rtsInB(tx, tz)) return false;
  G.strikes = G.strikes || [];
  G.strikes.push({ t: RTS_NUKE_DELAY, x: _rtsWX(tx), z: _rtsWX(tz), side: side });
  if (side === 'player') _rtsSay('Missile away.');
  /* RA's "nuclear missile launched" line is not among the 152 sounds the identity table
     recovered, so this borrows the one that fits: something IS about to hit your base. */
  else if (typeof rtsEva === 'function') rtsEva('attack');
  if (typeof _rtsSfx === 'function') _rtsSfx('rocket');
  return true;
}
/* Run from the tick so the delay is real time rather than a setTimeout the pause would not
   stop. A strike whose owner has since lost still lands - it is already in the air. */
function _rtsStrikesTick(dt) {
  var G = window._rtsG;
  if (!G.strikes || !G.strikes.length) return;
  for (var i = G.strikes.length - 1; i >= 0; i--) {
    var k = G.strikes[i];
    k.t -= dt;
    if (k.t > 0) continue;
    G.strikes.splice(i, 1);
    _rtsSplash(k.x, k.z, RTS_NUKE_RADIUS * RTS_TILE, RTS_NUKE_DAMAGE, k.side, RTS_NUKE_SPREAD, null);
    G.shake = Math.max(G.shake || 0, 1.4);
    /* The original's own mushroom cloud where the player has it. The drawn stand-in is one huge
       boom plus a ring of smaller ones staggered behind it - the ring exists purely to give a
       scaled-up sprite an EDGE, since a single disc blown up to seven times its size reads as a
       puff. A real 27-frame cloud does not need propping up, so the ring goes with it. */
    if (typeof _mixFxSet === 'function' && _mixFxSet('nuke')) {
      G.fx.push({ kind:'nuke', x:k.x, y:1, z:k.z, t:0, big:3.2 });
    } else {
      G.fx.push({ kind:'boom', x:k.x, y:1, z:k.z, t:0, big:7 });
      for (var r = 0; r < 8; r++) {
        var ang = r / 8 * Math.PI * 2, rad = RTS_NUKE_RADIUS * RTS_TILE * 0.55;
        G.fx.push({ kind:'boom', t:-0.08 - r * 0.03, big:2.6,
                    x:k.x + Math.cos(ang) * rad, y:1, z:k.z + Math.sin(ang) * rad });
      }
    }
    if (typeof _rtsSfx === 'function') _rtsSfx('boom', k.x, k.z);
    if (k.side !== 'player') _rtsSay('Our base has been hit by an atomic strike.');
  }
}

/* ---- the iron curtain. Invulnerability is enforced in _rtsDamage, the one choke point every
   route to hurting something goes through - a flag checked at the call sites would be a flag
   some new call site forgets. */
function _rtsFireIron(side, tx, tz) {
  var G = window._rtsG;
  if (!_rtsInB(tx, tz)) return false;
  var wx = _rtsWX(tx), wz = _rtsWX(tz), n = 0;
  for (var i = 0; i < G.ents.length; i++) {
    var e = G.ents[i];
    if (e.dead || e.side !== side) continue;
    if (Math.hypot(e.x - wx, e.z - wz) > RTS_IRON_RADIUS * RTS_TILE) continue;
    e.ironT = RTS_IRON_TIME;
    n++;
  }
  if (!n) return false;                       /* nothing of yours there - do not spend it */
  if (side === 'player') _rtsSay('Iron Curtain active on ' + n + (n === 1 ? ' unit.' : ' units.'));
  else _rtsSay('Enemy units are protected by an Iron Curtain.');
  if (typeof _rtsSfx === 'function') _rtsSfx('build');
  return true;
}
function _rtsIronTick(dt) {
  var G = window._rtsG;
  for (var i = 0; i < G.ents.length; i++) {
    var e = G.ents[i];
    if (e.ironT > 0) { e.ironT -= dt; if (e.ironT < 0) e.ironT = 0; }
  }
}

/* ---- the chronosphere. Teleports what the player has SELECTED, which is why it takes the
   selection rather than finding its own targets: sending units somewhere is a decision about
   which units, and the game already has a way to say that. */
function _rtsFireChrono(side, tx, tz, sel) {
  var G = window._rtsG;
  if (!_rtsInB(tx, tz)) return false;
  /* NO SELECTION IS A REFUSAL, not a licence to pick. There used to be a fallback here that
     filled the list with the first RTS_CHRONO_MAX units in G.ents "for the AI, which has no
     selection" - and no caller ever reached it: _rtsAISupers skips chrono outright, and
     _rtsSuperClick refuses an empty selection before it gets this far. So it was dead code
     whose comment described a behaviour it did not have (entity order is not "the nearest idle
     group"), waiting for the first caller who passed an empty list to teleport eight arbitrary
     units - very likely the harvester and the MCV, since those are early in G.ents. Returning
     false leaves the charge alone, which is what the sidebar already tells the player. */
  var list = (sel && sel.length) ? sel : [];
  list = list.filter(function (e) {
    return e && !e.dead && e.type === 'unit' && e.side === side && !e.inside;
  }).slice(0, RTS_CHRONO_MAX);
  if (!list.length) return false;

  /* Each unit needs its OWN cell. _rtsNearestOpen has no idea another unit is about to be put
     where it just pointed - it answers the same question the same way every time - so asking it
     once per unit lands the whole group on one tile, stacked. The claimed set is what makes a
     chronoshift arrive as a formation rather than as a pile. */
  var taken = {}, moved = 0;
  for (var j = 0; j < list.length; j++) {
    var u = list[j];
    var dom = (typeof _rtsDomainOf === 'function') ? _rtsDomainOf(u) : null;
    var spot = _rtsChronoCell(tx, tz, dom, taken);
    if (!spot) continue;
    taken[spot[0] + ',' + spot[1]] = 1;
    u.x = _rtsWX(spot[0]); u.z = _rtsWX(spot[1]);
    u.path = null; u.target = null; u.mx = null; u.mz = null;
    moved++;
  }
  if (!moved) return false;
  if (side === 'player') _rtsSay('Chronoshift complete — ' + moved +
                                 (moved === 1 ? ' unit moved.' : ' units moved.'));
  /* the one superweapon whose real sound survived identification - see ra/sndtab.js */
  if (typeof rtsEva === 'function') rtsEva('chrono');
  return true;
}

/* The nearest cell to (tx,tz) that this unit can stand on and no earlier unit in the same jump
   has claimed. A plain outward ring walk rather than a reuse of _rtsNearestOpen, because the
   thing that has to vary between calls is exactly what that function has no parameter for. */
function _rtsChronoCell(tx, tz, dom, taken) {
  for (var r = 0; r <= 10; r++) {
    for (var dz = -r; dz <= r; dz++) {
      for (var dx = -r; dx <= r; dx++) {
        if (r && Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;   /* ring, not disc */
        var x = tx + dx, z = tz + dz;
        if (!_rtsInB(x, z)) continue;
        if (taken[x + ',' + z]) continue;
        if (_rtsBlocked(x, z, dom)) continue;
        return [x, z];
      }
    }
  }
  return null;
}

/* ---- GPS. Reveals what has not been explored; it does not make anything currently visible,
   which is the distinction the shroud already draws between `mapped` and `vis`. */
function _rtsFireGps(side) {
  var G = window._rtsG;
  if (side !== 'player') return true;          /* the AI is not fogged; nothing to reveal */
  G.mapped.fill(1);
  G.visDirty = 1;
  _rtsSay('GPS satellite online — the map is yours.');
  if (typeof _rtsSfx === 'function') _rtsSfx('ready');
  return true;
}

/* ----------------------------------------------------------------- shroud --
   MAP.CPP builds RadiusOffset[] once - a flat list of cell offsets ordered by ring, with
   RadiusCount[r] giving how many entries cover a radius of r. Sight_From then walks the
   first RadiusCount[range] entries, which is why revealing a ten-cell disc costs one pass
   over 309 precomputed offsets rather than a 21x21 box scan with a distance test in it.

   The ring ordering is what makes the original's incremental scan possible: a unit that has
   moved one cell only needs its outer rings refreshed. Built here rather than typed out. */
var _RTS_RAD = null;
function _rtsRadiusTable() {
  if (_RTS_RAD) return _RTS_RAD;
  var rings = [], r, dx, dz;
  for (r = 0; r <= RTS_SIGHT_MAX; r++) rings.push([]);
  for (dz = -RTS_SIGHT_MAX; dz <= RTS_SIGHT_MAX; dz++) {
    for (dx = -RTS_SIGHT_MAX; dx <= RTS_SIGHT_MAX; dx++) {
      var d = Math.sqrt(dx * dx + dz * dz);
      if (d > RTS_SIGHT_MAX + 0.5) continue;
      rings[Math.max(0, Math.min(RTS_SIGHT_MAX, Math.round(d)))].push(dx, dz);
    }
  }
  var off = [], count = [];
  for (r = 0; r <= RTS_SIGHT_MAX; r++) {
    for (var i = 0; i < rings[r].length; i++) off.push(rings[r][i]);
    count.push(off.length >> 1);
  }
  _RTS_RAD = { off:off, count:count };
  return _RTS_RAD;
}
/* Sight_From: mark everything within `range` cells as seen now and explored forever. */
function _rtsSightFrom(tx, tz, range) {
  var G = window._rtsG, T = _rtsRadiusTable();
  range = Math.max(0, Math.min(RTS_SIGHT_MAX, range | 0));
  var n = T.count[range] * 2, off = T.off, rr = range * range;
  for (var i = 0; i < n; i += 2) {
    var dx = off[i], dz = off[i + 1];
    /* Sight_From filters the ring list by TRUE distance as well - the offset table is a
       superset, and this is what makes the revealed area an exact circle. */
    if (dx * dx + dz * dz > rr) continue;
    var x = tx + dx, z = tz + dz;
    if (x < 0 || z < 0 || x >= RTS_N || z >= RTS_N) continue;
    var c = z * RTS_N + x;
    G.vis[c] = 1; G.mapped[c] = 1;
  }
}
/* Rebuilt on the 15 Hz clock rather than per frame: everything the player owns looks, and
   what nothing is looking at falls back to explored-but-dim. */
function _rtsVisTick(dt) {
  var G = window._rtsG;
  G.visT = (G.visT || 0) + dt;
  if (G.visT < 1 / RTS_VIS_HZ) return;
  G.visT = 0;
  G.vis.fill(0);
  for (var i = 0; i < G.ents.length; i++) {
    var e = G.ents[i];
    if (e.dead || e.side !== 'player') continue;
    var def = e.type === 'struct' ? rtsStructDef(e.def) : rtsUnitDef(e.def);
    if (!def) continue;
    _rtsSightFrom(_rtsTX(e.x), _rtsTX(e.z), rtsSightTiles(def));
  }
  G.visDirty = 1;                 /* the renderer only re-bakes the shroud when this is set */
}
function _rtsSeen(tx, tz) {
  var G = window._rtsG;
  if (!G.mapped || !_rtsInB(tx, tz)) return true;
  return !!G.mapped[_rtsIdx(tx, tz)];
}
function _rtsVisible(tx, tz) {
  var G = window._rtsG;
  if (!G.vis || !_rtsInB(tx, tz)) return true;
  return !!G.vis[_rtsIdx(tx, tz)];
}
/* Can the player see this entity at all? A unit vanishes the moment it leaves your sight;
   a building you have already scouted stays on the map, because it is part of what you know
   about the ground rather than something that moves. */
function _rtsEntSeen(e) {
  if (!e) return false;
  if (e.side === 'player') return true;
  /* Fire_At reveals a shooter that was hidden in the darkness. The visibility grid is
     rebuilt from scratch every sweep, so the reveal lives on the shooter as a short timer
     rather than as a mark on the grid that the next sweep would wipe. */
  if (e.spot > 0) return true;
  var tx = _rtsTX(e.x), tz = _rtsTX(e.z);
  return e.type === 'struct' ? _rtsSeen(tx, tz) : _rtsVisible(tx, tz);
}

