/* core/response.js - how a side answers being shot at: infantry going to ground and
   scattering, the "base under attack" warning, the AI pulling its army home, and when a unit
   shoots back (missions overridden and restored). Split from core/combat.js, which finds
   targets and fires. */
/* INFANTRY.CPP Fear_AI + Scatter. Only infantry have this.

   IsCrawling, from IDATA.CPP: not every infantry type HAS prone artwork. The Dog, Engineer,
   Spy and Thief are all constructed with `is_crawling = false`, and a type with no crawl frames
   must never enter the state - it would be lying about what it is doing. */
function _rtsFearAI(e, dt) {
  var d = rtsUnitDef(e.def);
  /* Fear DECAYS for everyone, including the types that never act on it. Gating this whole
     function on IsFraidyCat was a real bug: a specialist's fear ratcheted up on every hit and
     never came down, and anything downstream that reads a fear threshold then saw a
     permanently terrified unit. Measured, it made the Attack Dog markedly worse at the one
     job it has - 60 hp of damage in six seconds instead of a kill. Only the RESPONSE is
     type-gated. */
  if (e.fear > 0) e.fear = Math.max(0, e.fear - RTS_FEAR_DECAY * dt);
  if (!d || d.fraidy === false) { e.prone = 0; return; }
  if (e.prone) {
    if (e.fear < RTS_FEAR.ANXIOUS || d.crawl === false) e.prone = 0;
  } else if (e.fear >= RTS_FEAR.ANXIOUS && !e.path && d.crawl !== false) {
    e.prone = 1;                     /* do not drop while actually travelling somewhere */
  }
}
function _rtsScatter(e, fromX, fromZ) {
  var G = window._rtsG;
  /* MissionControl IsScatter. A unit holding a position stands its ground - being shoved off
     it by every near miss is exactly what a hold order exists to prevent. */
  if (!_rtsMission(e).scatter) return;
  /* Specialists never scatter. _rtsDamage calls this on EVERY hit, so a directed unit walking
     into a defended base has its path rewritten to a random nearby cell several times a second
     and never arrives - measured, a commando ordered onto an enemy barracks orbited it for ten
     seconds at a steady 12-14 units while her goal was rewritten each time she was shot. Fear
     was the obvious suspect and was not the cause; this was. */
  var _sd = rtsUnitDef(e.def);
  if (_sd && _sd.fraidy === false) return;
  var a = Math.atan2(e.z - fromZ, e.x - fromX);
  a += (_rtsRnd() - 0.5) * (Math.PI / 2);      /* Random_Pick(0,4)-2 facings of spread */
  var d = RTS_TILE * (1.5 + _rtsRnd());
  var gx = e.x + Math.cos(a) * d, gz = e.z + Math.sin(a) * d;
  var tx = _rtsTX(gx), tz = _rtsTX(gz);
  if (!_rtsInB(tx, tz) || _rtsBlocked(tx, tz)) return;
  e.path = [{ x:gx, z:gz }]; e.pi = 0; e.goal = { x:gx, z:gz };
}

function _rtsAttacked(side) {
  var G = window._rtsG;
  if (_rtsSeatAI(side)) { G.sides[side].ai.lastHit = G.t; return; }   /* a computer seat's brain notes it; core/seats.js */
  var last = (G.playerHit == null) ? -999 : G.playerHit;
  if (G.t - last < RTS_ALERT_DELAY) return;      /* SpeakDelay - and do NOT restart the clock,
                                                    or a sustained attack never warns twice */
  G.playerHit = G.t;
  _rtsSay('Your base is under attack!');
  if (typeof _rtsSfx === 'function') _rtsSfx('alert');
}
/* TECHNO.CPP Base_Is_Attacked. "This routine will pull units off of the field and send them
   back to defend the base. This routine will make taking an enemy base much more difficult."
   It is exactly that: raid a defended base and its army comes home.

   Humans deal with their own base-is-attacked problems, so this only ever runs for the AI.
   A building that can shoot back does not overreact, and a BaseAttackTimer on the attacker
   stops one long firefight from recalling the whole army over and over. */
function _rtsBaseIsAttacked(bldg, enemy) {
  if (!_rtsSeatAI(bldg.side)) return 0;
  return _rtsAIAs(bldg.side, function () { return _rtsBaseIsAttackedFor(bldg, enemy); });
}
function _rtsBaseIsAttackedFor(bldg, enemy) {
  var G = window._rtsG;
  if (bldg.side !== _rtsAIOn || !enemy || enemy.type !== 'unit') return 0;
  if (rtsStructDef(bldg.def).weapon) return 0;     /* it can defend itself */
  if (enemy.baseTimer && G.t < enemy.baseTimer) return 0;
  /* AND IT HAS TO BE THE BASE. There was no locality test here at all, because until an
     engineer could move a building between sides, "a building of mine" and "a building in my
     base" were the same sentence. They stopped being the same sentence: the opponent can now
     own a Power Plant standing in the middle of the PLAYER's base, and every shot at it ran
     this routine.

     That made a captured building a switch the player could flip at will. One rifle squad
     poking it (a) disbanded every team below the survival priority and put each type on a
     40-second hold, and (b) sent up to RTS_DEFENDERS armed units on an attack-move across the
     whole map to "guard" a shell sitting inside the player's guns. The routine whose stated
     purpose is to make taking a base HARDER became a trickle-feed of the opponent's garrison
     into those guns, on demand, for the price of one rifleman - and two units taking turns
     dodge the BaseAttackTimer, so it was not even rate-limited. */
  if (!_rtsInBase(_rtsAIOn, bldg.x, bldg.z)) return 0;

  /* "We will need units to defend our base. We need to suspend teams until the situation has
     been dealt with." Below the survival priority a team is disbanded outright and its
     members freed - which is where most of the defenders actually come from. */
  _rtsSuspendTeams(RTS_SUSPEND_PRIORITY);

  /* "desired" is how much defence to throw at it: the attacker's risk scaled by tech level.
     Risk stands in as cost here, the same substitution Evaluate_Object uses for Value. */
  var desired = rtsUnitDef(enemy.def).cost, pool = [], i;
  for (i = 0; i < G.ents.length; i++) {
    var u = G.ents[i];
    if (u.dead || u.side !== _rtsAIOn || u.type !== 'unit') continue;
    var ud = rtsUnitDef(u.def);
    /* ...nor a bomber, whose answer to a raider in its own base would be a carpet across it */
    if (!ud.weapon || ud.harvest || ud.carpets) continue;
    /* "Never recruit sticky guard units to defend a base." */
    if (!_rtsMission(u).recruitable) continue;
    var w = RTS_WEAPONS[ud.weapon];
    /* "Don't allow a response if it doesn't have a weapon that will affect the enemy." */
    if (!rtsVerses(w, enemy)) continue;
    /* Already fighting this attacker? Then it is part of the answer, not part of the ask. */
    if (u.target === enemy) { desired -= ud.cost; continue; }
    /* Threat it can apply, best when it is close - Rescue_Mission's ranking, in spirit. */
    pool.push({ u:u, v:ud.cost * 1000 / (_rtsRangeTo(u, bldg) / RTS_TILE + 1) });
  }
  if (desired <= 0 || !pool.length) return 0;

  pool.sort(function (a, b) { return b.v - a.v; });
  var sent = 0, risk = 0;
  for (i = 0; i < pool.length && i < RTS_DEFENDERS; i++) {
    var p = pool[i];
    /* "Alternates between guard area and attack" - half go straight for the attacker, half
       take up station on the building being hit. A pure charge leaves the base empty again
       the moment the raider dies. */
    if (_rtsRnd() < 0.5) _rtsOverrideMission(p.u, 'attack', enemy);
    else {
      _rtsOverrideMission(p.u, 'amove', null);
      _rtsOrderMove(p.u, bldg.x + (_rtsRnd() - 0.5) * RTS_TILE * 4,
                         bldg.z + (_rtsRnd() - 0.5) * RTS_TILE * 4, true);
    }
    sent++;
    risk += rtsUnitDef(p.u.def).cost;
    if (risk > desired) break;
  }
  /* BaseDefenseDelay: once enough has been committed, this attacker stops re-triggering. */
  if (risk > desired) enemy.baseTimer = G.t + RTS_BASE_DEFENSE_DELAY;
  return sent;
}
/* MISSION.CPP Override_Mission / Restore_Mission. A temporary order remembers the one it
   interrupted, and puts it back when it is done. Base_Is_Attacked recalls units to defend
   and previously just overwrote their orders, so an army pulled home to swat one raider
   simply forgot it had been going anywhere - it stood in the base for the rest of the match. */
function _rtsOverrideMission(e, order, tgt) {
  if (!e || e.dead) return false;
  if (e.susp === undefined || e.susp === null) {
    e.susp = { order:e.order || null, goal:e.goal ? { x:e.goal.x, z:e.goal.z } : null };
  }
  e.order = order; e.target = tgt || null; e.path = null;
  return true;
}
function _rtsRestoreMission(e) {
  if (!e || e.susp == null) return false;
  var s = e.susp; e.susp = null;
  if (!s.order) { e.order = null; e.goal = null; e.path = null; return true; }
  if (s.order === 'move' || s.order === 'amove') {
    if (s.goal) { _rtsOrderMove(e, s.goal.x, s.goal.z, s.order === 'amove'); return true; }
  }
  e.order = s.order; e.path = null;
  return true;
}
/* MISSION.CPP MissionControl: the flag table for whatever this object is currently doing.
   Get_Mission returns the queued mission when there is no active one, so an object with no
   order is on GUARD rather than in some nameless idle state. */
function _rtsMission(e) {
  if (!e) return RTS_MISSION_DEFAULT;
  var m = e.order || (e.hstate ? 'harvest' : 'guard');
  return RTS_MISSIONS[m] || RTS_MISSION_DEFAULT;
}
/* TECHNO.CPP Is_Allowed_To_Retaliate. Shooting back is not automatic. */
function _rtsCanRetaliate(tgt, from) {
  if (!from || !from.side) return false;                    /* no source, no retaliation */
  if (tgt.dead || tgt.type !== 'unit') return false;
  if (from.side === tgt.side) return false;                 /* never against an ally */
  if (!_rtsMission(tgt).retaliate) return false;            /* "If the mission precludes it" */
  var d = rtsUnitDef(tgt.def);
  if (!d || !d.weapon || d.carpets) return false;         /* a bomber flies on: core/bomber.js */
  var w = RTS_WEAPONS[d.weapon];
  /* "Don't allow retaliation if it isn't equipped with a weapon that can deal with the
     threat" - a Modifier of zero against that armour means shooting back is pointless. */
  if (!rtsVerses(w, from)) return false;
  /* ...and the air/ground contract, which the armour modifier knows nothing about. Without it
     a tank a gunship hit turned and shot the gunship down with its cannon - 125 off a 200 hp
     airframe in one round - so no aircraft outlived a sortie against anything armed. */
  if (!_rtsCanEngage(tgt, from)) return false;
  /* Idle: always turn and fight. */
  if (!tgt.order) return true;
  /* Already busy: "Compare potential threat of the current target and the potential new
     target. Don't retaliate if it is currently attacking the greater threat." The original
     only bothers half the time, which is what stops a firefight turning into every unit
     spinning between whoever shot last. */
  if (_rtsRnd() < 0.5) return false;
  if (!tgt.target || tgt.target.dead) return true;
  var dn = _rtsRangeTo(tgt, from), dc = _rtsRangeTo(tgt, tgt.target);
  return _rtsEvalObject(tgt, from, dn, w) > _rtsEvalObject(tgt, tgt.target, dc, w);
}
