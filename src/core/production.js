/* core/production.js - build queues, placement, orders and the difficulty multipliers.
   Part of rts.core, the simulation. */

/* --------------------------------------------------------- production */
function _rtsQueueCat(key) {
  var s = rtsStructDef(key); if (s) return 'struct';
  var u = rtsUnitDef(key); return u ? u.kind : null;
}
/* What to CALL a prerequisite when telling the player they are missing it. `needs` names a
   capability rather than a building (see _rtsProvides), so the name cannot simply be looked up
   as a key: today every capability happens to share a name with a structure, but the moment one
   does not - `provides:['tech']` on two different labs, say - `rtsStructDef(cap).name` is
   undefined and the sidebar throws while trying to explain itself.

   So: the namesake building's name if there is one, otherwise everything that provides it,
   joined with "or", because "Needs Tech Center or Soviet Lab first" is the true sentence. */
function _rtsNeedName(cap) {
  var own = rtsStructDef(cap);
  if (own) return own.name;
  var from = RTS_STRUCTS.filter(function (d) {
    return (d.provides || []).indexOf(cap) >= 0;
  }).map(function (d) { return d.name; });
  return from.length ? from.join(' or ') : cap;
}

/* WHY this side cannot produce `key` right now, as a sentence for the player - or null when it
   can. Structural reasons only: not having the credits and having the line already busy are
   states the sidebar draws differently (`poor`, `busyline`) and a player reads at a glance.

   This exists because the same rules were written out three times - in _rtsCanQueue, in
   _rtsCanProduce, and again as `avail` in the sidebar's per-frame pass - and the three had
   drifted apart. Measured, with the full tech tree and one Commando already alive: _rtsCanQueue
   said no, _rtsCanProduce said YES, the sidebar drew the cameo enabled, and clicking it played
   the deny beep and printed NOTHING. The `only` cap and the shipyard-with-no-water rule existed
   in exactly one of the three. One function now answers for all of them, so a rule that is not
   in here is not enforced anywhere and a rule that is in here is explained everywhere. */
function _rtsWhyLocked(side, key) {
  var G = window._rtsG, S = G.sides[side];
  var def = rtsStructDef(key) || rtsUnitDef(key);
  var cat = _rtsQueueCat(key);
  if (!def || !cat) return 'No such thing.';
  /* The other army's kit. Enforced HERE rather than only in the sidebar, because the sidebar
     is one of several routes to a queue - the opponent's brain is another, and a save from
     before a faction switch is a third. */
  if (!rtsBuildableBy(def, rtsHouseSide(side))) return 'That is the other army\'s.';
  if (!_rtsAvailable(side, def))
    return 'Needs ' + def.needs.map(_rtsNeedName).join(' + ') + ' first.';
  /* SIDEBAR.CPP's Who_Can_Build_Me: something has to be standing that makes the thing. The
     yard case was checked by _rtsCanProduce and NOT by the queue, so losing your Construction
     Yard mid-match left you able to spend credits on buildings; RA takes the whole tab away. */
  if (cat === 'struct' && !_rtsHas(side, 'yard')) return 'Needs a Construction Yard first.';
  if (cat === 'infantry' && !_rtsHas(side, 'barracks')) return 'Build a Barracks first.';
  if (cat === 'vehicle' && !_rtsHas(side, 'factory')) return 'Build a War Factory first.';
  /* A shipyard with nowhere to launch is not a shipyard. Refusing here rather than failing at
     delivery means the sidebar greys the ship out instead of taking the credits and producing
     nothing. The missing yard itself is already covered: every ship `needs` one. */
  if (cat === 'ship') {
    var yd = _rtsHas(side, 'navalyard') || _rtsHas(side, 'subpen');
    if (yd && !_rtsSeaSpawn(yd)) return 'That shipyard has no open water to launch into.';
  }
  /* `only` is a hard cap on how many of a type may exist at once - the Commando is one at a
     time, as in the reference. Counts what is standing AND what is on the way, or the queue
     lets you stack three of them before the first one appears. */
  if (def.only) {
    var have = 0;
    for (var oi = 0; oi < G.ents.length; oi++) {
      var oe = G.ents[oi];
      if (!oe.dead && oe.side === side && oe.type === 'unit' && oe.def === key) have++;
    }
    for (var qc in S.q) if (S.q[qc] && S.q[qc].key === key) have++;
    if (have >= def.only)
      return def.only === 1 ? 'You may only have one at a time.'
                            : 'You may only have ' + def.only + ' at a time.';
  }
  return null;
}
function _rtsCanQueue(side, key) {
  var S = window._rtsG.sides[side];
  var cat = _rtsQueueCat(key); if (!cat) return false;
  if (S.q[cat]) return false;
  if (cat === 'struct' && S.ready) return false;
  if (_rtsWhyLocked(side, key)) return false;
  var def = rtsStructDef(key) || rtsUnitDef(key);
  if (rtsMoney(S) < _rtsCostOf(side, def)) return false;
  return true;
}
/* Can this side produce `key` at all - ignoring money and ignoring whether the line is
   already busy? This is SIDEBAR.CPP's `Who_Can_Build_Me`: the question Recalc asks of every
   cameo when a factory is lost. */
function _rtsCanProduce(side, key) {
  return !_rtsWhyLocked(side, key);
}
function _rtsQueue(side, key) {
  if (!_rtsCanQueue(side, key)) return false;
  var S = window._rtsG.sides[side], def = rtsStructDef(key) || rtsUnitDef(key);
  /* FactoryClass::Set: `Balance = Cost_Of() * CostBias`, and the job is driven by that
     outstanding balance rather than by re-deriving a charge from the price each tick. */
  var price = _rtsCostOf(side, def);
  S.q[_rtsQueueCat(key)] = { key:key, prog:0, total:_rtsBuildTimeOf(side, def),
    cost:price, bal:price, paid:0, hold:0 };
  return true;
}
/* SIDEBAR.CPP SelectClass::Action, RIGHTPRESS: "If production is in progress, put it on
   hold. If production is already on hold, then abandon it." Two distinct presses, and the
   distinction matters - a single click should never be able to destroy a nearly-finished
   war factory. Suspending keeps the money already spent tied up in the job; abandoning
   refunds it. */
function _rtsSuspend(side, cat) {
  var S = window._rtsG.sides[side], q = S.q[cat];
  if (!q || q.hold) return false;
  q.hold = 1;
  return true;
}
function _rtsResume(side, cat) {
  var S = window._rtsG.sides[side], q = S.q[cat];
  if (!q || !q.hold) return false;
  q.hold = 0;
  return true;
}
function _rtsCancel(side, cat) {
  var S = window._rtsG.sides[side], q = S.q[cat];
  if (!q) return;
  _rtsGrant(S, q.paid);        /* refund what was actually spent */
  S.q[cat] = null;
}
/* SIDEBAR.CPP Recalc: called when a factory is destroyed. Anything that can no longer be
   built by anybody is dropped, and its production abandoned. Without this, blowing up a
   barracks left the rifle squad inside it still ticking toward completion and then walking
   out of a building that no longer exists. Returns what it had to abandon. */
function _rtsProdRecalc(side) {
  var G = window._rtsG, S = G.sides[side], lost = [], cat;
  for (cat in S.q) {
    var q = S.q[cat];
    if (q && !_rtsCanProduce(side, q.key)) { lost.push(q.key); _rtsCancel(side, cat); }
  }
  /* A finished building still waiting to be placed needs a yard to come out of. */
  if (S.ready && !_rtsHas(side, 'yard')) {
    var rd = rtsStructDef(S.ready);
    if (rd) _rtsGrant(S, S.readyPaid == null ? _rtsCostOf(side, rd) : S.readyPaid);
    S.readyPaid = null;
    lost.push(S.ready);
    S.ready = null; S.readyTry = 0;
  }
  return lost;
}
/* How many buildings are actually producing this category. In RA a FactoryClass belongs to
   a BUILDING, so a house with two war factories genuinely builds two things at once; here
   there is one queue per category, which is right for the PLAYER - the classic sidebar works
   exactly that way - but for the opponent it meant a second war factory and a second barracks
   did nothing whatsoever.

   That is not a cosmetic waste. Measured on hard at five minutes, the opponent sits at every
   structure limit (refinery 4, barracks 2, factory 2, turret 12), so _rtsAIWants returns null
   and the structure line is permanently idle, while the unit lines run at 0% idle and cannot
   absorb the income. The result was 28,576 banked credits it had no way to spend.

   Scaling the build RATE by the number of producing buildings keeps the single queue - and
   therefore the whole sidebar model - while making the second factory mean something. Cost
   scales with rate automatically, so the money is genuinely spent rather than conjured.

   THE PLAYER USED TO BE EXCLUDED FROM THIS, and that was the bug. `if (side === 'player')
   return 1` confused two different things: RA's sidebar does show one line per category, but
   that line RUNS FASTER when you own more factories. Building a second war factory did nothing
   at all for the player while the opponent got the full benefit of its own - an asymmetry the
   player was on the wrong side of, in a mechanic the original game is well known for.

   The multiplier is RA's own, from ClassicProductionQueue@Vehicle in mods/ra/rules/player.yaml:
   BuildTimeSpeedReduction 100, 75, 60, 50 - percentages of build TIME for 1, 2, 3 and 4+
   producing buildings, so the rate multiplier is 100/that. It replaces a linear `n x rate` that
   was invented here for want of a table. The ceiling is unchanged at 2x; it is now reached at
   four factories rather than two, which is the curve the data actually describes. */
/* COUNTED FROM THE DATA, NOT FROM A HARDCODED PAIR. This mapped 'infantry' to the barracks and
   'vehicle' to the factory and returned 1 for every other category - so a second Helipad or a
   second shipyard bought no build speed at all while a second War Factory did. Measured before:
   1, 2, 3 and 4 helipads all delivered an Attack Heli in 15.017s. The roster already carried the
   answer - every production building has a `produces` naming its category - and rules.test.js
   now asserts that every unit kind has one. */
function _rtsBuildRate(side, cat) {
  var G = window._rtsG;
  if (!G || !cat) return 1;
  var n = 0;
  for (var i = 0; i < G.ents.length; i++) {
    var e = G.ents[i];
    if (e.dead || e.building || e.selling || e.side !== side) continue;
    var sd = rtsStructDef(e.def);
    if (sd && sd.produces === cat) n++;
  }
  if (n < 2) return 1;
  var tbl = RTS_BUILD_SPEEDUP;
  var pct = tbl[Math.min(n, tbl.length) - 1];
  return 100 / pct;
}
/* THE CAP IS ENFORCED WHERE IT IS CONSULTED, not only where ore arrives. _rtsHarvested clamps
   a delivery against capacity, but nothing re-checked when capacity SHRANK - so losing your last
   Refinery and Silo while holding 3000 ore left the storage bar reading "0%, no capacity, build
   a Refinery" while that 3000 stayed spendable. The money was real; the readout was not, and a
   readout that disagrees with the treasury is worse than no readout.

   The overflow goes through the same spill path a full store already uses, so the loss is
   announced rather than silently deducted. */
/* One body, onto both the queue the renderer drains and the log that survives a save. Same cap
   on each, so the oldest bodies fall off together and the two never disagree about which ones
   the battlefield is carrying. */
function _rtsAddCorpse(G, c) {
  G.corpses.push(c);
  if (G.corpses.length > 220) G.corpses.shift();
  if (!G.corpseLog) G.corpseLog = [];
  G.corpseLog.push(c);
  if (G.corpseLog.length > 220) G.corpseLog.shift();
}
function _rtsTickStorage(side) {
  var G = window._rtsG, S = G.sides[side];
  if (!S || S.ore <= 0) return;
  var cap = rtsCapacity(side);
  if (S.ore <= cap) return;
  S.spill += S.ore - cap;
  S.ore = cap;
  if (side === 'player') _rtsSiloWarn(S);
}
function _rtsTickProduction(side, dt) {
  _rtsTickStorage(side);
  var G = window._rtsG, S = G.sides[side], pf = _rtsPowerFactor(side), cat;
  for (cat in S.q) {
    var q = S.q[cat]; if (!q || q.hold) continue;  /* a suspended line spends nothing */
    var rate = dt / q.total * pf * _rtsBuildRate(side, cat);  /* fraction of the job done this step */
    /* Cost_Per_Tick(): `min(cost, Balance)`. Charging `cost * rate` without that clamp
       systematically OVERCHARGES, because the final tick's rate overshoots the job - measured
       at up to 1.21 credits on an 800-credit tank, always over and never under. Driving the
       charge off the outstanding balance is both the original's rule and the only way the
       total can come out exactly equal to the price. */
    if (q.bal === undefined) q.bal = Math.max(0, q.cost - q.paid);   /* a save from before this */
    var want = Math.min(q.bal, q.cost * rate);
    var purse = rtsMoney(S);
    /* The stall is for being BROKE, and only for being broke. Testing `want <= 0` instead
       deadlocks the line the moment the balance is paid off: rounding lets `bal` reach zero a
       tick before `prog` reaches one, `want` becomes zero, and the `continue` skips the
       completion check below - forever. Measured: the opponent sat on a finished harvester at
       `prog=1.000, bal=0.0, paid=1400.0` for the whole match and never built anything again.
       The unit suite missed it completely, because it asserted on money paid and never on the
       unit arriving. */
    if (want > purse) {
      want = purse;
      rate = q.cost > 0 ? want / q.cost : rate;
      if (want <= 0) continue;                      /* nothing at all in the treasury */
    }
    _rtsSpend(S, want); q.paid += want; q.bal = Math.max(0, q.bal - want); q.prog += rate;
    if (q.prog >= 1) {
      /* "If the production has completed... House->Spend_Money(Balance); Balance = 0" - the
         rounding residue is settled at the end so the job costs exactly what it was priced
         at, however the rate wandered on the way. */
      if (q.bal > 0) { var last = _rtsSpend(S, q.bal); q.paid += last; q.bal = 0; }
      S.q[cat] = null;
      /* PurchasePrice: what was ACTUALLY paid follows the building, so a refund later is not
         computed from a sticker price the buyer never paid. It matters because CostBias is
         real - an opponent on `hard` pays 0.8x - and refunding half of full price handed it a
         62% return on every sale while the player got 50%. */
      if (cat === 'struct') { S.ready = q.key; S.readyPaid = q.paid; }
      else _rtsDeliverUnit(side, q.key);
      if (side === 'player' && typeof _rtsSfx === 'function') _rtsSfx(cat === 'struct' ? 'ready' : 'unitready');
      /* EVA calls it. A finished building and a finished unit are different announcements in
         the original and were both silent here - "Construction complete" was in the table and
         had no caller at all. */
      if (side === 'player' && typeof rtsEva === 'function') rtsEva(cat === 'struct' ? 'built' : 'ready');
    }
  }
}
function _rtsDeliverUnit(side, key) {
  var G = window._rtsG, u = rtsUnitDef(key);
  if (G.justBuilt) G.justBuilt[side].unit = key;   /* HouseClass::JustBuiltUnit */
  /* A ship comes out of its shipyard and INTO THE WATER, which is the one delivery that
     cannot use the generic scan-place: every cell it would pick is land. */
  if (u.sea) {
    var yard = _rtsHas(side, 'navalyard') || _rtsHas(side, 'subpen');
    var at = _rtsSeaSpawn(yard);
    if (!at) return null;
    return _rtsSpawnUnit(side, key, _rtsWX(at.tx), _rtsWX(at.tz));
  }
  var src = _rtsHas(side, u.kind === 'infantry' ? 'barracks' : 'factory') || _rtsHas(side, 'yard');
  if (!src) return null;
  return _rtsSpawnAt(side, key, src);
}

/* ------------------------------------------------------------- orders */
function _rtsOrderMove(e, x, z, attackMove) {
  if (e.type !== 'unit') return;
  e.order = attackMove ? 'amove' : 'move';
  e.target = null; e.hstate = null;
  e.goal = { x:x, z:z };                       /* remembered so a blocked repath keeps aiming here */
  e.path = _rtsPathFor(e, x, z); e.pi = 0;
  if (!e.path) { e.order = null; }
}
/* Ordering infantry onto a friendly transport is a board order, not an attack - the original
   runs it over the radio (RADIO_TRYING_TO_LOAD / RADIO_ROGER). The passenger walks there and
   boards when it arrives, which is handled in the move completion below. */
function _rtsOrderBoard(inf, t) {
  if (!_rtsCanBoard(inf, t)) return false;
  inf.order = 'board'; inf.target = t; inf.hstate = null;
  inf.goal = { x:t.x, z:t.z };
  inf.path = _rtsPathFor(inf, t.x, t.z); inf.pi = 0;
  return true;
}
function _rtsOrderAttack(e, tgt) {
  if (e.type !== 'unit') return;
  var d = rtsUnitDef(e.def);
  if (!d.weapon) { _rtsOrderMove(e, tgt.x, tgt.z, false); return; }
  /* "Dogs can only attack infantrymen" - INFANTRY.CPP downgrades ACTION_ATTACK to ACTION_NONE
     rather than letting the order stand, so ordering a dog onto a tank is a move order. */
  var _ow = RTS_WEAPONS[d.weapon];
  if (_ow && _ow.maul && !(tgt.type === 'unit' && (rtsUnitDef(tgt.def) || {}).kind === 'infantry')) {
    _rtsOrderMove(e, tgt.x, tgt.z, false); return;
  }
  e.order = 'attack'; e.target = tgt; e.hstate = null;
  e.goal = { x:tgt.x, z:tgt.z };
  e.path = _rtsPathFor(e, tgt.x, tgt.z); e.pi = 0;
}
function _rtsOrderHarvest(e, tx, tz) {
  var d = rtsUnitDef(e.def);
  if (!d.harvest) return;
  e.order = 'harvest'; e.target = null;
  e.htile = (tx != null) ? { tx:tx, tz:tz } : null;
  e.hstate = e.carry >= d.capacity ? 'toRef' : 'toField';
  e.path = null;
}

/* ---------------------------------------------------------- difficulty --
   RULES.CPP's DifficultyClass is applied to a whole HOUSE, not to individual units, and it
   is a set of multipliers rather than special-case code. Everything the enemy does goes
   through _rtsBias; the player's side always gets the identity table, so a bias can never
   silently change how your own units behave. */
var _RTS_NOBIAS = { name:'Player', iq:5, fire:1, speed:1, armor:1, rof:1, cost:1, build:1, wall:true, scan:true };
/* A crate bonus lives on the UNIT that picked it up, multiplying the house-wide bias rather
   than replacing it. `_rtsBias` answers for a whole side and is difficulty; this answers for
   one object and is what it has found lying around. A unit with no bonuses costs one property
   lookup, which is why this is a plain function rather than a merged object built per call. */
function rtsCrateMult(e, what) {
  var c = e && e.cr;
  return (c && c[what]) ? c[what] : 1;
}
function _rtsBias(side) {
  if (side !== 'enemy') return _RTS_NOBIAS;
  var G = window._rtsG;
  return (G && RTS_DIFF[G.diff]) || RTS_DIFF[RTS_DIFF_DEFAULT];
}
/* Is an AI behaviour switched on at the current IQ? RULES.CPP gates each one separately, so
   a weak opponent is missing nameable abilities rather than just doing less damage. */
function _rtsIQAt(level) { return _rtsBias('enemy').iq >= level; }
/* CostBias / BuildSpeedBias, applied wherever a price or a build time is read. */
function _rtsCostOf(side, def) { return Math.round(def.cost * _rtsBias(side).cost); }
function _rtsBuildTimeOf(side, def) { return Math.max(0.1, def.build * _rtsBias(side).build); }

