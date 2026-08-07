/* core/combat.js - choosing a target and shooting at it: threat evaluation, weapon pick,
   firing, fear and retaliation. Part of rts.core, the simulation. */

/* ------------------------------------------------------------- combat */
function _rtsDist(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }
/* Structures are big: measure to the edge of the footprint, not the centre, or nothing
   can ever shoot a 5x5 refinery from its stated range. */
function _rtsRangeTo(a, b) {
  var d = _rtsDist(a, b);
  if (b.type === 'struct') { var sd = rtsStructDef(b.def); d -= Math.min(sd.w, sd.h) * RTS_TILE * 0.45; }
  return Math.max(0, d);
}
function _rtsEnemyOf(side) { return side === 'player' ? 'enemy' : 'player'; }
/* Base centres are needed once per candidate but cost a pass over every structure, so they
   are cached and refreshed on the visibility clock rather than recomputed per lookup. */
function _rtsZoneCache() {
  var G = window._rtsG;
  if (!G.zc || G.t - G.zcT > 0.5) {
    G.zc = { player:_rtsBaseCentre('player'), enemy:_rtsBaseCentre('enemy') };
    G.zcT = G.t;
  }
  return G.zc;
}
/* TECHNO.CPP Evaluate_Object. The target scan scores candidates rather than just measuring
   how far away they are, which is the difference between an army that shoots whatever it
   bumps into and one that picks off the harvester. */
function _rtsEvalObject(e, o, dist, w, force) {
  var d = rtsStructDef(o.def) || rtsUnitDef(o.def);
  if (!d) return 0;
  /* "If the object is in a harmless state, don't bother to consider it a threat." A
     harvester on the ore is not what an auto-acquiring gun should turn to face while
     something armed is in range - though a player who right-clicks one still gets it, and
     it is still worth a great deal once chosen. */
  if (!force && o !== e.target && _rtsMission(o).noThreat) return 0;
  /* A weapon that cannot hurt the thing at all should never choose it - and for a
     two-weapon object the question is asked of its BEST weapon against this armour, or a
     tank would refuse to look at infantry its coaxial gun handles perfectly well. */
  if (!w) w = _rtsPickWeapon(e, o);
  if (w && !rtsVerses(w, o)) return 0;

  /* Value() = Risk + Reward, plus Crew.Kills - a unit that has been killing things is worth
     shooting first.

     Points stand in as cost, with hit points as a floor. The floor is load-bearing, not
     decoration: the Command Yard is free, so cost alone values the most important building
     in the game at ZERO, and a zero-valued candidate is discarded outright. Nothing could
     target a construction yard at all - measured, the Commando AI ran to 179 units and 27
     buildings while an idle player calmly survived eight minutes, because neither side could
     shoot the other's yard. */
  var value = Math.max(d.cost, d.hp || 0) + (o.kills || 0) * RTS_KILL_VALUE;

  var zc = _rtsZoneCache();
  /* Outside the protective umbrella of its OWN base: a straggler is a soft target. */
  if (_rtsWhichZone(zc[o.side], o.x, o.z) < 0) value *= RTS_EXPOSED_MULT;
  /* NervousBias: ...and something that has got inside MY base matters more than the same
     thing sitting in a field somewhere. */
  if (_rtsWhichZone(zc[e.side], o.x, o.z) >= 0) value *= RTS_NERVOUS_BIAS;

  /* Area_Modify is deliberately NOT implemented. It halves a candidate's value for each
     friendly building near it, so a suppressed weapon stops lobbing high explosive into its
     own base - but it is gated on a per-weapon `IsSupressed` flag that only a few RA weapons
     carry, and this game has no equivalent data. Mapping it onto "any splash weapon" was the
     obvious guess and it is wrong: measured, it drove the value of a target standing INSIDE
     your own base down to 640k against 1.28M for the same unit in open ground, exactly
     inverting NervousBias and leaving the base undefended. Without the flag, the rule does
     more harm than the friendly fire it prevents. */
  if (value <= 0) return 0;
  /* Lessen threat as a factor of distance - LINEAR in cells. The squared version is sitting
     right there in the original, commented out; the shipped line is this one. */
  return Math.max(1, (value * RTS_THREAT_SCALE) / (dist / RTS_TILE + 1));
}
function _rtsFindTarget(e, range, w) {
  var G = window._rtsG, foe = _rtsEnemyOf(e.side), best = null, bv = 0;
  for (var i = 0; i < G.ents.length; i++) {
    var o = G.ents[i];
    if (o.dead || o.side !== foe || o.inside) continue;
    /* The air/ground contract. A weapon without `aa` cannot engage anything flying, and an
       aircraft's own weapons cannot reach another aircraft either - our helicopter carries no
       air-to-air, exactly as the Longbow does not. */
    if (o.air && !(w && w.aa)) continue;
    /* ...and the reverse, for a weapon that is ONLY anti-air. A flak gun that can also shell
       the infantry walking past it is just a Gun Turret with a longer reach, which is not what
       an AA emplacement is for and would make the Allied one strictly better than the Soviet
       SAM site it exists to mirror. */
    if (!o.air && w && w.aaOnly) continue;
    /* "Dogs can only attack infantrymen" - INFANTRY.CPP turns ACTION_ATTACK into ACTION_NONE
       against anything else. Without this a dog with a one-bite kill would delete tanks. */
    if (w && w.maul && !(o.type === 'unit' && (rtsUnitDef(o.def) || {}).kind === 'infantry')) continue;
    /* A submarine must not sit off a beach acquiring a tank it can never torpedo, refusing to
       look for a target it CAN hit. Same shape as the aa rule above and for the same reason. */
    if (!_rtsWeaponReaches(w, o)) continue;
    var dist = _rtsRangeTo(e, o);
    if (dist > range) continue;
    var v = _rtsEvalObject(e, o, dist, w);
    if (v > bv) { bv = v; best = o; }
  }
  return best;
}
/* TECHNO.CPP What_Weapon_Should_I_Use. Every weapon this object carries is scored against
   the candidate's armour - `Modifier[armor] * 1000`, DOUBLED when the target is already in
   that weapon's range, and zeroed outright when it could not fire at all. Highest wins, and
   the primary wins ties (the original returns 0 unless `w2 > w1` strictly).

   The doubling is the interesting half: it biases toward the weapon that can shoot NOW over
   the one that would be better after driving closer. */
function _rtsGuns(e) {
  var d = (e.type === 'struct') ? rtsStructDef(e.def) : rtsUnitDef(e.def);
  var out = [];
  if (d && d.weapon) out.push(RTS_WEAPONS[d.weapon]);
  if (d && d.weapon2) out.push(RTS_WEAPONS[d.weapon2]);
  return out;
}
function _rtsPickWeapon(e, tgt) {
  var ws = _rtsGuns(e);
  if (ws.length < 2) return ws[0];
  var dist = _rtsRangeTo(e, tgt), best = ws[0], bv = -1;
  for (var i = 0; i < ws.length; i++) {
    var w = ws[i], mod = rtsVerses(w, tgt);
    var v = mod * 1000;
    if (dist <= w.range) v *= 2;
    if (!mod) v = 0;                                  /* FIRE_CANT */
    if (v > bv) { bv = v; best = w; }
  }
  return best;
}
/* The longest reach this object has, for "should I even look over there" questions. */
function _rtsReach(e) {
  var ws = _rtsGuns(e), r = 0;
  for (var i = 0; i < ws.length; i++) if (ws[i].range > r) r = ws[i].range;
  return r;
}
/* Threat_Range: 0 means "use weapon range", 1 means area guard - twice the weapon range,
   clamped. Every sight radius in this game is already inside the clamp, so it never binds
   here; it is kept because the clamp is the rule, not the current unit table. */
function _rtsThreatRange(e, control, w) {
  var reach = w ? w.range : 0;
  if (control === 0) return reach;
  return Math.min(reach * 2, RTS_THREAT_MAX_CELLS * RTS_TILE);
}
/* TURRET.CPP Fire_Direction / Fire_Coord. A shot leaves the MUZZLE, and the muzzle is on
   whichever facing actually carries the weapon: the turret's for a turreted vehicle, the
   hull's for everything else. Spawning shots at the object's centre is what makes a tank
   with its gun swung 90 degrees appear to fire sideways out of its own flank while the
   barrel points somewhere else entirely - the turret is drawn separately, so the mismatch
   is plainly visible. Barrel reach is derived from the body radius rather than a new table:
   a turret overhangs its hull, a hull-mounted gun sits inside the body. */
/* The bearing the WEAPON is pointing - which is the bearing Can_Fire tested before allowing
   the shot, so it is the one the shell has to leave along. A structure aims by turning its
   whole self (`e.rot`); every armed unit aims with `e.turret`, whether or not it has a turret
   drawn separately. (An earlier pass used the hull bearing for units without a drawn turret,
   which put a buggy's muzzle flash on its nose while Can_Fire was gating on a bearing that
   could be ninety degrees away.) */
function _rtsMuzzleAngle(e) {
  return e.type === 'struct' ? e.rot : e.turret;
}
function _rtsFireCoord(e, w) {
  var reach;
  if (e.type === 'struct') reach = RTS_MUZZLE_STRUCT;
  else {
    var d = rtsUnitDef(e.def);
    reach = (d.r || 1) * (RTS_TURRETED[e.def] ? RTS_MUZZLE_TURRET : RTS_MUZZLE_HULL);
  }
  var a = _rtsMuzzleAngle(e);
  var x = e.x + Math.cos(a) * reach, z = e.z + Math.sin(a) * reach;
  /* PrimaryLateral: the coordinate steps sideways off the barrel line, to the LEFT or the
     RIGHT depending on IsSecondShot. That is how a two-barrel weapon visibly alternates. */
  if (w && w.burst > 1) {
    var s = (e.second === false ? 1 : -1) * RTS_MUZZLE_LATERAL;
    x += Math.cos(a + Math.PI / 2) * s;
    z += Math.sin(a + Math.PI / 2) * s;
  }
  return { x:x, z:z };
}
/* A torpedo runs in the water and cannot climb out, so a submarine is helpless against
   anything on land. That single restriction is what makes the Missile Sub worth twice the
   price instead of being a strictly better hull. */
function _rtsWeaponReaches(w, tgt) {
  if (!w || !w.seaOnly) return true;
  if (!tgt) return false;
  if (tgt.type === 'struct') return false;
  var d = rtsUnitDef(tgt.def);
  return !!(d && d.sea);
}

function _rtsFire(e, tgt, w) {
  var G = window._rtsG, bias = _rtsBias(e.side);
  /* A structure that needs power does not fire without it. This is the Tesla Coil's whole
     design and the reason a Soviet defensive line plays differently from an Allied one: it
     hits far harder than anything at its price and it is only as good as the plants behind
     it, so cutting the power is a strategy rather than an inconvenience. Checked at the one
     place every shot passes through, because there are several routes to a shot and one of
     them forgetting would be a silent balance bug. */
  if (e.type === 'struct') {
    var _sd = rtsStructDef(e.def);
    if (_sd && _sd.needsPower && _rtsPowerFactor(e.side) < 0.999) return;
  }
  if (!_rtsWeaponReaches(w, tgt)) return;
  /* AIRCRAFT.CPP spends a round per shot and the aircraft is out of the fight when the rack is
     empty. Decremented here rather than in the aircraft's own update so that every route to a
     shot - ordered, acquired, retaliating - pays for it. */
  if (e.air && e.ammo != null) {
    if (e.ammo <= 0) return;
    e.ammo--;
  }
  /* Rearm_Delay + Is_Two_Shooter. A burst weapon does NOT reload evenly: the delay assigned
     after each shot alternates, so shots arrive as a fast pair and then a long wait, rather
     than as a metronome. `IsSecondShot` starts true, so the first shot of a fresh unit takes
     the full ROF and the pair forms after it. Recoil_Adjust's lateral offset rides the same
     flag - a two-barrel weapon alternates sides, which is where the visible stagger in a
     salvo comes from. */
  if (w.burst > 1) {
    e.cool = (e.second === false ? RTS_BURST_DELAY : w.cool * bias.rof * rtsCrateMult(e, 'rof'));
    e.second = (e.second === false);
  } else {
    e.cool = w.cool * bias.rof * rtsCrateMult(e, 'rof'); e.second = true;  /* ROFBias: higher = slower reload */
  }
  e.fire = 0.09;
  e.recoil = RTS_RECOIL_TIME;                     /* Recoil_Adjust */
  var m = _rtsFireCoord(e, w);
  /* "If a projectile was fired from a unit that is hidden in the darkness, reveal that unit
     and a little area around it." The muzzle flash gives away the shooter. */
  if (e.side !== 'player' && !_rtsVisible(_rtsTX(e.x), _rtsTX(e.z))) e.spot = RTS_MUZZLE_SPOT;
  if (typeof _rtsSfx === 'function') _rtsSfx(w.shot === 'tracer' ? (w.dmg > 7 ? 'mg' : 'rifle')
    : (w.shot === 'missile' ? 'rocket' : (e.type === 'struct' ? 'turretgun' : 'cannon')), e.x, e.z);
  var dmg = w.dmg * rtsVerses(w, tgt) * bias.fire * rtsCrateMult(e, 'fire');
  if (w.speed <= 0) {
    _rtsDamage(tgt, dmg, e);
    G.fx.push({ kind:'tracer', x:m.x, y:1.3, z:m.z, x2:tgt.x, y2:1.3, z2:tgt.z, t:0 });
    _rtsCombatAnim(dmg, tgt.x, tgt.z, 0.5, tgt);
  } else {
    /* Fire_Direction: the shot leaves ALONG THE BARREL. Can_Fire only insists the barrel is
       within FIRE_FACING (~11 degrees) of the mark, so a dumb shell departs at whatever
       angle the turret happens to be sitting at and flies straight - it does not curve onto
       the target. That tolerance now has consequences: a tank shooting at something fast and
       close can genuinely miss. Missiles still home, which is exactly why Can_Fire is four
       times more forgiving about their facing (`diff >>= 2`).

       Flight is bounded by the distance to the mark rather than a flat four seconds, so a
       miss detonates near where it was aimed instead of sailing off across the map and
       exploding in somebody else's base. */
    var a = _rtsMuzzleAngle(e);
    var reach = Math.hypot(tgt.x - m.x, tgt.z - m.z);
    G.proj.push({ kind:w.shot, x:m.x, y:1.4, z:m.z,
      vx:Math.cos(a) * w.speed, vz:Math.sin(a) * w.speed,
      speed:w.speed, tgt:tgt, dmg:dmg, splash:w.splash, side:e.side,
      life:Math.min(4, reach / w.speed + RTS_SHELL_OVER), w:w, from:e });
  }
}
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
  if (side === 'enemy') { G.ai.lastHit = G.t; return; }
  var last = (G.playerHit == null) ? -999 : G.playerHit;
  if (G.t - last < RTS_ALERT_DELAY) return;      /* SpeakDelay - and do NOT restart the clock,
                                                    or a sustained attack never warns twice */
  G.playerHit = G.t;
  _rtsSay('Your base is under attack!');
  if (typeof _rtsSfx === 'function') _rtsSfx('alert');
  /* EVA says it out loud when the player has the speech archive. Not routed through _rtsSfx:
     an announcement must not be dropped for happening off screen, which is exactly when the
     player most needs to hear it. */
  if (typeof rtsEva === 'function') rtsEva('attack');
}
/* TECHNO.CPP Base_Is_Attacked. "This routine will pull units off of the field and send them
   back to defend the base. This routine will make taking an enemy base much more difficult."
   It is exactly that: raid a defended base and its army comes home.

   Humans deal with their own base-is-attacked problems, so this only ever runs for the AI.
   A building that can shoot back does not overreact, and a BaseAttackTimer on the attacker
   stops one long firefight from recalling the whole army over and over. */
function _rtsBaseIsAttacked(bldg, enemy) {
  var G = window._rtsG;
  if (bldg.side !== 'enemy' || !enemy || enemy.type !== 'unit') return 0;
  if (rtsStructDef(bldg.def).weapon) return 0;     /* it can defend itself */
  if (enemy.baseTimer && G.t < enemy.baseTimer) return 0;

  /* "We will need units to defend our base. We need to suspend teams until the situation has
     been dealt with." Below the survival priority a team is disbanded outright and its
     members freed - which is where most of the defenders actually come from. */
  _rtsSuspendTeams(RTS_SUSPEND_PRIORITY);

  /* "desired" is how much defence to throw at it: the attacker's risk scaled by tech level.
     Risk stands in as cost here, the same substitution Evaluate_Object uses for Value. */
  var desired = rtsUnitDef(enemy.def).cost, pool = [], i;
  for (i = 0; i < G.ents.length; i++) {
    var u = G.ents[i];
    if (u.dead || u.side !== 'enemy' || u.type !== 'unit') continue;
    var ud = rtsUnitDef(u.def);
    if (!ud.weapon || ud.harvest) continue;
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
  if (!d || !d.weapon) return false;
  var w = RTS_WEAPONS[d.weapon];
  /* "Don't allow retaliation if it isn't equipped with a weapon that can deal with the
     threat" - a Modifier of zero against that armour means shooting back is pointless. */
  if (!rtsVerses(w, from)) return false;
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
