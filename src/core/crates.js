/* core/crates.js - crates: where they appear and what opening one does. Part of rts.core. */

/* ----------------------------------------------------------------- crates --
   CRATE.CPP. Each crate is a slot with a cell and a timer, and the set of slots is fixed:
   `Create_Crate` removes whatever the slot was tracking before it places a new one, so
   crates relocate rather than accumulate. Everything below follows that file except what is
   inside a crate, which that file does not say - see RTS_CRATES.

   Held as a small array rather than a per-cell overlay byte. The original needs an overlay
   because its cell already carries one; here nothing else wants that storage, and a list of
   three is cheaper to scan than 12,544 cells are to search. */
/* Crates draw from their OWN generator, the way ore growth already does, and that is not a
   tidiness point - it is the difference between a comparable measurement and a meaningless
   one. Placing three crates off the main stream at map setup shifts every subsequent roll in
   the match, so every seeded scenario in the repository becomes a different battle and the
   ladder can no longer be compared against the run before. Measured: crates moved `hard` from
   174 s to 183 s while the logs showed ZERO crates being picked up in the seed that moved
   most. That was not balance, it was a reseed. */
function _rtsCrateRnd(G) {
  if (!G.crateRnd) G.crateRnd = _rtsRngMake((G.seed ^ 0xc4a7e) >>> 0);
  return G.crateRnd;
}
function _rtsCrateInit(G) {
  G.crates = [];
  _rtsCrateRnd(G);
  for (var i = 0; i < RTS_CRATE_MAX; i++) _rtsCrateNew(G);
}
/* Put_Crate: re-roll a random location until the cell is clear. The original loops forever
   until it finds one; this gives up after RTS_CRATE_TRIES, because a map that somehow had no
   clear ground left would hang the tick rather than skip a crate. */
function _rtsCrateSpot(G) {
  var rnd = _rtsCrateRnd(G);
  for (var t = 0; t < RTS_CRATE_TRIES; t++) {
    var tx = (rnd() * RTS_N) | 0, tz = (rnd() * RTS_N) | 0;
    if (!_rtsInB(tx, tz)) continue;
    var i = _rtsIdx(tx, tz);
    if (G.blocked[i] !== 0) continue;                  /* Is_Clear_To_Build */
    if (G.scrap[i] > 0) continue;                      /* not buried in an ore field */
    /* one crate per cell */
    var clash = false;
    for (var c = 0; c < G.crates.length; c++) if (G.crates[c].tx === tx && G.crates[c].tz === tz) clash = true;
    if (clash) continue;
    return { tx:tx, tz:tz };
  }
  return null;
}
/* Weighted pick over RTS_CRATES. */
function _rtsCratePick(G) {
  var total = 0, i;
  for (i = 0; i < RTS_CRATES.length; i++) total += RTS_CRATES[i].w;
  var r = _rtsCrateRnd(G)() * total;
  for (i = 0; i < RTS_CRATES.length; i++) { r -= RTS_CRATES[i].w; if (r <= 0) return RTS_CRATES[i]; }
  return RTS_CRATES[0];
}
function _rtsCrateNew(G) {
  var spot = _rtsCrateSpot(G);
  if (!spot) return null;
  /* Random_Pick(CrateTime * TICKS_PER_MINUTE/2, CrateTime * TICKS_PER_MINUTE*2): a crate
     lives between HALF and TWICE CrateTime, expressed here in seconds. */
  var lo = RTS_CRATE_TIME * 30, hi = RTS_CRATE_TIME * 120;
  var cr = { tx:spot.tx, tz:spot.tz, kind:_rtsCratePick(G).key,
    t:lo + _rtsCrateRnd(G)() * (hi - lo) };
  G.crates.push(cr);
  return cr;
}
/* A crate that times out is not simply deleted - Create_Crate removes the old one and places
   a new one, so the count on the map is constant for the whole match. */
function _rtsCrateAI(dt) {
  var G = window._rtsG;
  if (!G.crates) return;
  for (var i = G.crates.length - 1; i >= 0; i--) {
    G.crates[i].t -= dt;
    if (G.crates[i].t <= 0) { G.crates.splice(i, 1); _rtsCrateNew(G); G.crateDirty = 1; }
  }
  /* Anything standing on one picks it up. Both sides: a crate does not know whose army it
     is under, and an opponent that drives over free money should get it. */
  for (var e = 0; e < G.ents.length; e++) {
    var u = G.ents[e];
    if (u.dead || u.type !== 'unit') continue;
    var tx = _rtsTX(u.x), tz = _rtsTX(u.z);
    for (var c = G.crates.length - 1; c >= 0; c--) {
      var cr = G.crates[c];
      if (cr.tx !== tx || cr.tz !== tz) continue;
      G.crates.splice(c, 1);                            /* Get_Crate */
      _rtsCrateOpen(cr, u);
      _rtsCrateNew(G); G.crateDirty = 1;
      break;
    }
  }
}
/* What is in the box. The effect list is ours; see the note on RTS_CRATES. */
function _rtsCrateOpen(cr, u) {
  var G = window._rtsG, S = G.sides[u.side], mine = u.side === 'player';
  var def = null, i;
  for (i = 0; i < RTS_CRATES.length; i++) if (RTS_CRATES[i].key === cr.kind) def = RTS_CRATES[i];
  if (!def) return null;
  var say = function (m) { if (mine) _rtsSay(m); };
  var ping = function (n) { if (typeof _rtsSfx === 'function') _rtsSfx(n, u.x, u.z); };

  if (def.mult) {
    /* A bonus multiplies whatever the unit already had, capped so a unit that has hoovered
       up six firepower crates is still a unit rather than a boss. `rof` is the odd one out:
       lower is faster, so its cap is a FLOOR. */
    u.cr = u.cr || {};
    for (var k in def.mult) {
      var v = (u.cr[k] || 1) * def.mult[k], cap = RTS_CRATE_CAP[k];
      u.cr[k] = (k === 'rof') ? Math.max(cap, v) : Math.min(cap, v);
    }
    say(def.name + '!');
    ping('place');
    return def.key;
  }
  if (cr.kind === 'money') {
    var amt = Math.round(RTS_CRATE_MONEY[0]
      + _rtsCrateRnd(G)() * (RTS_CRATE_MONEY[1] - RTS_CRATE_MONEY[0]));
    /* A GRANT, not harvest: crate money is found money and the storage cap must not eat it. */
    _rtsGrant(S, amt);
    say('Found ' + amt + ' credits.');
    ping('place');
  } else if (cr.kind === 'heal') {
    u.hp = u.maxHp;
    say('Repair kit.');
    ping('place');
  } else if (cr.kind === 'reveal') {
    if (mine) { for (i = 0; i < G.mapped.length; i++) G.mapped[i] = 1; G.visDirty = 1; }
    say('Map data recovered.');
    ping('place');
  } else if (cr.kind === 'unit') {
    /* FILTERED BY THE ARMY THAT OPENED IT. RTS_CRATE_UNITS is a shared list and the Light Tank
       on it is Allied-only, so a Soviet player could be handed a hull that is not in their
       sidebar, that they cannot replace, and that their own army does not field. The same
       shape as a team type calling for a unit its house cannot raise, and the same fix the
       AI's base plan already uses: list both armies' entries and drop the other one's at the
       point of use (see _rtsCanQueue and the note on RTS_AI.buildOrder).

       The draw still consumes exactly one number from the crate stream whatever the pool ends
       up being, so this cannot shift any other roll in the match. */
    var army = (typeof rtsHouseSide === 'function') ? rtsHouseSide(u.side) : null;
    var pool = RTS_CRATE_UNITS.filter(function (k) {
      var ud = rtsUnitDef(k);
      return ud && (!army || rtsBuildableBy(ud, army));
    });
    if (!pool.length) pool = RTS_CRATE_UNITS;      /* never hand back nothing */
    var key = pool[(_rtsCrateRnd(G)() * pool.length) | 0];
    var got = _rtsSpawnUnit(u.side, key, _rtsWX(cr.tx), _rtsWX(cr.tz));
    say('Abandoned ' + rtsUnitDef(key).name + ' recovered.');
    ping('unitready');
    return got ? 'unit' : null;
  } else if (cr.kind === 'mine') {
    /* The reason a crate is a decision. Damage comes from the crate itself rather than from
       a side, so it is nobody's kill and cannot be farmed for credit. */
    _rtsSplash(_rtsWX(cr.tx), _rtsWX(cr.tz), RTS_CRATE_MINE_RADIUS, RTS_CRATE_MINE_DMG, null, 2, null);
    G.fx.push({ kind:'boom', x:_rtsWX(cr.tx), y:1, z:_rtsWX(cr.tz), t:0, big:1.5 });
    say('It was a trap!');
    ping('deny');
  }
  return cr.kind;
}

