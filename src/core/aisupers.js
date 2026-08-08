/* core/aisupers.js - the opponent firing its own superweapons, and its turn. Part of rts.core. */

/* --------------------------------------------------- the opponent's supers --
   An opponent that builds a missile silo and never fires it is set dressing, so this aims
   them - but only from IQ 4, because "can build one" and "knows what to do with one" are
   different abilities and a weak opponent wasting 1750 credits is a fine way to be weak.

   The targeting is deliberately simple and deliberately not optimal. A nuke aimed by a real
   search would land on the single most expensive cluster the player owns every time, which is
   not a fight, it is a tax. It aims at the player's centre of mass instead: usually the base,
   sometimes an army in the field, and always somewhere the player can see coming and rebuild
   from. */
function _rtsAISupers(dt) {
  var G = window._rtsG, S = G.sides.enemy;
  if (!S.supers) return;
  if (!_rtsIQAt(RTS_IQ.superweapon)) return;
  G.ai.superT = (G.ai.superT || 0) - dt;
  if (G.ai.superT > 0) return;
  G.ai.superT = 3;                          /* it does not need to re-decide every frame */

  for (var key in S.supers) {
    if (!_rtsSuperReady('enemy', key)) continue;
    var aim = null;
    if (key === 'nuke')            aim = _rtsAIMassOf('player');
    else if (key === 'ironcurtain') aim = _rtsAIMassOf('enemy');
    else if (key === 'chrono')      continue;   /* see below */
    if (!aim) continue;
    if (_rtsSuperFire('enemy', key, aim.tx, aim.tz)) return;   /* one per decision */
  }
}
/* Where a side's stuff is, in tiles. Buildings weigh more than units so a nuke goes to the
   base rather than chasing whichever harvester happened to wander furthest out. */
function _rtsAIMassOf(side) {
  var G = window._rtsG, sx = 0, sz = 0, w = 0;
  for (var i = 0; i < G.ents.length; i++) {
    var e = G.ents[i];
    if (e.dead || e.side !== side) continue;
    var k = (e.type === 'struct') ? 3 : 1;
    sx += e.x * k; sz += e.z * k; w += k;
  }
  if (!w) return null;
  var tx = _rtsTX(sx / w), tz = _rtsTX(sz / w);
  return _rtsInB(tx, tz) ? { tx: tx, tz: tz } : null;
}

/* WHAT THE UNIT LINE IS ALLOWED TO SPEND DOWN TO. It used to be a flat `infantryReserve`, and
   that number sat BELOW the threshold the base plan needs, which is a ratchet: units start being
   bought at 2,000 credits and a 2,000-credit refinery needs 3,000 in hand (its cost plus
   `creditReserve`, because a non-urgent build will not spend the last of the treasury). Money
   therefore could not climb past 2,000 without being turned into infantry first, and whatever the
   opponent had not built by the time its early rich window closed, it never built.

   Measured on Soldier, seed 9001, with the player kept alive so the match cannot end: it wanted a
   fourth refinery for 61.3% of ten minutes - 368 seconds - with 405 legal places to put one, and
   its bank went 4,343 at 300s, then 896, 257, 842, 497. Never once back above 3,000.

   So the floor is whichever is higher: the infantry reserve, or what the base plan is currently
   saving for. The unit line spends the SURPLUS, not the building's money. */
function _rtsAISpare(S) {
  var G = window._rtsG, w = G.ai && G.ai.want;
  if (!w) return RTS_AI.infantryReserve;
  var sd = rtsStructDef(w.key);
  if (!sd) return RTS_AI.infantryReserve;
  return Math.max(RTS_AI.infantryReserve, _rtsCostOf('enemy', sd) + RTS_AI.creditReserve);
}

function _rtsUpdateAI(dt) {
  var G = window._rtsG, S = G.sides.enemy;
  if (S.lost) return;
  _rtsTeamsTick(dt);
  _rtsAISupers(dt);
  /* Rich: refill a line as soon as it empties, rather than waiting up to five seconds for
     the next decision. Without this the opponent banks tens of thousands of credits it
     structurally cannot spend, while the human restarts a queue the moment it frees. */
  /* Rich: refill a line the moment it empties rather than waiting up to five seconds for
     the next decision. This is a SMART behaviour and is gated like every other one. A house
     that cannot expand its base spends its whole income on units, so handing perfect queue
     efficiency to the low difficulties turned Recruit into a unit pump - 53 units against
     Commando's 61, which is not a difficulty ladder, it is one rung. */
  if (_rtsIQAt(RTS_IQ.refill) && rtsMoney(S) > _rtsAISpare(S)) _rtsAIUnits(S);
  G.ai.next -= dt;
  G.ai.build -= dt;
  if (G.ai.build <= 0) {
    G.ai.build = 5;
    _rtsAIStateTick(S);
    _rtsAIDeploy('enemy');

    /* Repair_AI, gated on IQRepairSell: the low difficulties simply cannot do this, which is
       why raiding a Commando base and leaving means finding it whole again. */
    if (_rtsIQAt(RTS_IQ.repairSell) && rtsMoney(S) > RTS_AI.creditReserve * 0.5) {
      for (var r = 0; r < G.ents.length; r++) {
        var b = G.ents[r];
        if (b.dead || b.side !== 'enemy' || b.type !== 'struct' || b.building || b.selling) continue;
        if (!b.repair && b.hp < b.maxHp * 0.85) { b.repair = 1; b.rtimer = 0; }
      }
    }
    if (rtsMoney(S) > _rtsAISpare(S)) _rtsAIUnits(S);
    _rtsTeamMaybeRaise();

    /* Expert_AI: score every strategy, then act from CRITICAL downward. Note the original
       computes an `acted` flag with the stated intent of stopping after the highest urgency
       level that did something - but never actually breaks on it. Following the code rather
       than the comment: every level gets its turn. */
    var urg = _rtsAIUrgency(S);
    for (var u = RTS_URGENCY.CRITICAL; u >= RTS_URGENCY.LOW; u--) {
      for (var strat in urg) if (urg[strat] === u) _rtsAIDo(strat, u, S);
    }
  }
  /* The AI places its own finished buildings. Throttled: the search is over every anchor's
     build radius, which is not something to run on every frame. */
  if (S.ready) {
    G.ai.place -= dt;
    if (G.ai.place <= 0) {
      G.ai.place = 0.6;
      if (_rtsAIPlace(S.ready)) { S.ready = null; S.readyPaid = null; S.readyTry = 0; }
      else if (++S.readyTry > 8 || !_rtsHas('enemy', 'yard')) { S.ready = null; S.readyPaid = null; S.readyTry = 0; }
    }
  }
}
