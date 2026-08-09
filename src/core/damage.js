/* core/damage.js - what a hit does: damage, armour, fire and splash. Part of rts.core. */

function _rtsDamage(tgt, dmg, from, floor) {
  if (!tgt || tgt.dead) return;
  /* The Iron Curtain, enforced HERE rather than at the call sites. Every route to hurting
     something funnels through this function - shells, splash, fire, the dog rule below, a
     script - so one check covers all of them, and a route added later cannot forget it. */
  if (tgt.ironT > 0) return;
  /* The dog rule, ahead of every modifier because in the original it replaces the damage
     rather than scaling it. See `maul` on the bite weapon in src/rules. */
  if (from && from.type === 'unit' && !from.dead) {
    var _fw = RTS_WEAPONS[(rtsUnitDef(from.def) || {}).weapon];
    if (_fw && _fw.maul) {
      if (from.target !== tgt) return;              /* a dog spills nothing onto bystanders */
      /* Infantry only, enforced HERE and not just at acquisition. _rtsFindTarget already skips
         vehicles, but a forced order - a player right-click, a script - walks straight past
         that, and a one-bite kill that reaches a tank is a 200-credit answer to a 1700-credit
         one. In the original the order simply cannot be given (ACTION_ATTACK becomes
         ACTION_NONE); making the damage refuse as well means no route can get around it. */
      if (!(tgt.type === 'unit' && (rtsUnitDef(tgt.def) || {}).kind === 'infantry')) return;
      tgt.hp = 0; tgt.hitT = 0.18;
      if (from.side) tgt.hurtBy = from.side;
      if (from.side !== tgt.side) from.kills = (from.kills || 0) + 1;
      if (from.side !== tgt.side) _rtsTrigNotify('attacked', tgt, null);
      _rtsKill(tgt);
      return;
    }
  }
  if (tgt.prone) dmg *= RTS_PRONE_DAMAGE;
  dmg /= _rtsBias(tgt.side).armor;                 /* ArmorBias defends the whole house */
  dmg /= rtsCrateMult(tgt, 'armor');               /* ...and a crate defends one unit */
  /* Modify_Damage clamps last. The MinDamage floor is NOT unconditional - it applies to a
     direct hit and to the inner ring of a blast, so two units can never plink zeroes at each
     other, while the edge of an explosion is still allowed to do nothing at all. */
  if (floor !== false) dmg = Math.max(RTS_MIN_DAMAGE, dmg);
  dmg = Math.min(RTS_MAX_DAMAGE, dmg);
  tgt.hp -= dmg;
  tgt.hitT = 0.18;
  /* an idle unit that gets shot shoots back instead of standing there */
  if (from && from.side) tgt.hurtBy = from.side;     /* WhoLastHurtMe, for the kill credit */
  /* HouseClass::Attacked(). A structure taking malicious damage puts its owner into the
     ATTACKED state for a minute, which several unrelated AI decisions then read - and, for
     the player, raises the warning, rate-limited by SpeakDelay. */
  if (tgt.type === 'struct' && from && from.side && from.side !== tgt.side) {
    _rtsAttacked(tgt.side);
    _rtsBaseIsAttacked(tgt, from);
  }
  if (from && from.side && from.side !== tgt.side) _rtsTrigNotify('attacked', tgt, null);
  if (tgt.type === 'unit' && tgt.sqd != null) _rtsTeamTookDamage(tgt, from);
  if (_rtsCanRetaliate(tgt, from)) { tgt.order = 'attack'; tgt.target = from; }
  if (tgt.hp <= 0) {
    /* Crew.Made_A_Kill: something that has killed becomes a hotter target itself. */
    if (from && from.side && from.side !== tgt.side) from.kills = (from.kills || 0) + 1;
    _rtsKill(tgt);
  }
  else if (tgt.type === 'unit' && rtsUnitDef(tgt.def).harvest && tgt.carry > 0
           && tgt.hp <= tgt.maxHp * RTS_COND_YELLOW && tgt.hstate && tgt.hstate !== 'unload') {
    /* Take_Damage: a damaged harvester with a load aboard heads for the refinery rather than
       sitting in the open finishing its mining run. */
    tgt.hstate = 'toRef'; tgt.path = null;
  }
  else if (tgt.type === 'unit' && rtsUnitDef(tgt.def).kind === 'infantry') {
    /* Fear climbs faster the more hurt the soldier already is. */
    if (tgt.fear < RTS_FEAR.SCARED) tgt.fear = RTS_FEAR.SCARED;
    else {
      var more = RTS_FEAR.ANXIOUS, hr = tgt.hp / tgt.maxHp;
      if (hr > RTS_COND_RED) more /= 2;
      if (hr > RTS_COND_YELLOW) more /= 2;
      tgt.fear = Math.min(RTS_FEAR.MAXIMUM, tgt.fear + more);
    }
    /* IQScatter: dodging incoming fire is a learned behaviour in RULES.CPP, not a reflex
       every soldier has. Yours always scatter; a low-IQ opponent's stand and take it. */
    if (from && (tgt.side !== 'enemy' || _rtsIQAt(RTS_IQ.scatter))) _rtsScatter(tgt, from.x, from.z);
  }
  else if (tgt.type === 'unit' && tgt.hp < tgt.maxHp * RTS_BURN_UNIT) _rtsIgnite(tgt);
  if (tgt.type === 'struct' && tgt.hp < tgt.maxHp * RTS_BURN_STRUCT) _rtsIgnite(tgt);
}
/* ANIM.CPP Attach_To + BuildingClass::Take_Damage. A badly hurt thing catches fire, the
   flame rides it, and the flame eats it.

   Structures burn too, and did not before - which is most of what this is for. A refinery
   on fire is one of the most recognisable sights in the game, and the old code lit units
   only. Which rung of ADATA's ladder it starts on comes from how big the thing is: a 3x3
   refinery gets `OnFireBig`, a 1x1 pillbox gets `OnFireSmall`.

   Re-igniting matters as much as igniting. The ladder burns DOWN - big to medium to small
   to smoke - so a building left alone smoulders out and stops taking damage. Hit it again
   while it is only smouldering and it goes back up to full size, which is what makes a
   sustained bombardment look and behave differently from one shell. */
function _rtsIgnite(tgt) {
  var G = window._rtsG;
  if (!tgt || tgt.dead) return null;
  var kind = 'firesmall', base = 0.75;
  if (tgt.type === 'struct') {
    var d = rtsStructDef(tgt.def), cells = d ? d.w * d.h : 1;
    kind = cells >= RTS_FIRE_BIG ? 'firebig' : (cells >= RTS_FIRE_MED ? 'firemed' : 'firesmall');
    /* Scaled off the footprint WIDTH, matching the flame a building already draws while it
       comes apart (`0.9 + def.w * 0.35` in the renderer) so a burning building and a dying
       one are the same fire at the same size. Scaled off cell COUNT instead, a 3x3 got only
       20% more flame than a 1x1 and the fire on a refinery read as a spark. */
    base = 0.6 + (d ? d.w : 1) * 0.55;
  }
  var rank = { firebig:3, firemed:2, firesmall:1, smoke:0 };
  /* Already alight: top the existing flame back up rather than stacking a second one on the
     same object. Stacking was the first version and it doubled the damage rate every hit. */
  if (tgt.burning) {
    for (var i = 0; i < G.fx.length; i++) {
      var f = G.fx[i];
      if (f.att !== tgt.id || rank[f.kind] === undefined) continue;
      if (rank[kind] > rank[f.kind]) {
        f.kind = kind; f.loops = RTS_ANIMS[kind].loops || 1; f.big = base * RTS_ANIMS[kind].size;
      }
      f.t = 0; f.mid = 0;
      return f;
    }
    tgt.burning = 0;          /* flagged alight with no flame left - the fx was reaped */
  }
  tgt.burning = 1;
  var nf = { kind:kind, x:tgt.x, y:1, z:tgt.z, t:0, base:base,
    big:base * RTS_ANIMS[kind].size, att:tgt.id, loops:RTS_ANIMS[kind].loops || 1 };
  G.fx.push(nf);
  return nf;
}
/* COMBAT.CPP Modify_Damage: the falloff is a DIVISION by distance, not a taper. Damage is
   brutal at the impact point and collapses as 1/d, and the MinDamage floor only applies
   within RTS_SPREAD_FLOOR steps - past that a blast is allowed to do literally nothing,
   which is the difference between "everyone nearby takes a point" and a real blast radius.

   Two rules from Explosion_Damage that matter as much as the curve:
   - a hit anywhere on a BUILDING's footprint counts as a direct hit on its centre, so a
     shell landing on the corner of a refinery is not quietly downgraded to a graze;
   - the blast damages everyone except whoever fired it. Friendly fire is real: park your
     own squad around a target and your rockets will kill them. */
function _rtsSplashSteps(d, spread, target, tx, tz) {
  if (target && target.type === 'struct') {
    var sd = rtsStructDef(target.def);
    if (tx >= target.tx && tx < target.tx + sd.w && tz >= target.tz && tz < target.tz + sd.h) return 0;
  }
  var steps = Math.round(d / RTS_TILE * (RTS_SPREAD_STEPS / Math.max(0.5, spread)));
  return Math.max(0, Math.min(RTS_SPREAD_MAX, steps));
}
function _rtsSplash(x, z, rad, dmg, side, spread, from) {
  var G = window._rtsG, tx = _rtsTX(x), tz = _rtsTX(z);
  spread = spread || 1;
  for (var i = 0; i < G.ents.length; i++) {
    var o = G.ents[i];
    if (o.dead || o === from) continue;
    /* THE HULL IS THE POINT OF A TRANSPORT. Cargo is kept at its transport's coordinates, so
       without this a shell landing on an APC hit the hull AND every man inside it - the
       passengers standing at the dead centre of the blast, at zero range, taking full damage
       through no armour of their own. That makes a 350 hp APC a worse place to be than the open
       ground beside it, which is the opposite of what it is for. What is inside is inside. */
    if (o.inside) continue;
    var d = Math.hypot(o.x - x, o.z - z);
    if (d > rad) continue;
    var steps = _rtsSplashSteps(d, spread, o, tx, tz);
    var hit = steps ? dmg / steps : dmg;
    if (steps >= RTS_SPREAD_FLOOR && hit < RTS_MIN_DAMAGE) continue;   /* allowed to be nothing */
    /* WHO SET THIS OFF. `side` has been a parameter of this function all along and was never
       read, so no explosion in the game attributed itself to anybody: every splash death was
       recorded as having no attacker. That is invisible in combat - nothing reads hurtBy but
       the scoreboard - and it made the scoreboard wrong in both directions at once. Set
       BEFORE the damage, because a killing blow runs the death handler from inside
       _rtsDamage and that is what reads it.

       Deliberately not passed as the `from` entity: _rtsDamage would then award `kills`,
       which feeds the threat weighting in _rtsEvalObject and would move the difficulty
       ladder. Attribution for the scoreboard is the whole of what is wanted here; a blast
       staying nobody's KILL is the existing behaviour and stays. */
    if (side) o.hurtBy = side;
    _rtsDamage(o, hit, null, steps < RTS_SPREAD_FLOOR);
  }
  /* IsTiberiumDestroyer: Reduce_Tiberium(strength / 10). Shelling an ore field destroys it. */
  if (_rtsInB(tx, tz) && G.scrap[_rtsIdx(tx, tz)] > 0) {
    var oi = _rtsIdx(tx, tz);
    G.scrap[oi] = Math.max(0, G.scrap[oi] - (dmg / 10) * RTS_ORE_PER_LEVEL);
    if (G.scrap[oi] <= 0) { G.gems[oi] = 0; G.scrapDirty = true; }
  }
}

/* AIRCRAFT.CPP's return-to-base loop. Out of ammo, an aircraft breaks off and flies to a pad
   that will take it; sitting on the pad refills the rack over `rearm` seconds. The last clause
   is the original's and is not softened:

       "If this aircraft has nowhere else to go, meaning that there is no airfield available,
        then it has to crash."

   so a helicopter whose pads have all been destroyed comes down. That is what stops air being
   a free permanent army and makes the pad a target worth defending. */
