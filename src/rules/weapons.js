/* rules/weapons.js - weapons and the animation table. Part of rts.rules, the roster. */

/* --------------------------------------------------------------- weapons --
   dmg      : damage per shot
   range    : world units
   cool     : seconds between shots
   shot     : 'tracer' | 'shell' | 'missile'  (visual)
   speed    : projectile speed (0 = hitscan tracer)
   splash   : blast radius, 0 = single target
   vs       : damage multipliers by armour class */
var RTS_WEAPONS = {
  /* `verses` is WARHEAD.CPP's Modifier[armor], one multiplier per armour class in CONST.CPP's
     order: none / wood / light / heavy / concrete. Missing entries default to 1, as they do in
     the original ("Verses=100%,100%,100%,100%,100%").

     `wall` is IsWallDestroyer. Only warheads that carry it can bring down a Concrete Wall -
     which is the entire point of concrete, and the reason small arms are listed without it.
     `wood` is IsWoodDestroyer, for clearing trees.

     A weapon whose `heavy` entry is 0 is what the original calls ORGANIC - anti-personnel and
     literally nothing else. `IsOrganic = (Modifier[ARMOR_STEEL] == 0)` is derived exactly this
     way in WARHEAD.CPP; the Attack Dog was written that way before this file arrived. */
  rifle:      { dmg:7,  range:15, cool:0.55, shot:'tracer',  speed:0,  splash:0,
                verses:{ none:1.0,  wood:0.30, light:0.40, heavy:0.15, concrete:0.20 } },
  mg:         { dmg:9,  range:16, cool:0.35, shot:'tracer',  speed:0,  splash:0,
                verses:{ none:1.0,  wood:0.35, light:0.50, heavy:0.20, concrete:0.25 } },
  /* burst: Is_Two_Shooter. Rearm_Delay alternates the reload so the shots arrive as a fast
     pair and then a long wait. */
  /* `aa` is the whole air/ground contract: a weapon without it simply cannot engage a
     flying unit, and a base with neither of these two has no answer to a helicopter.
     In the original the rocket soldier and the SAM site are exactly that answer. */
  rocket:     { dmg:13, range:20, cool:1.80, burst:2, shot:'missile', speed:34, splash:2, wall:true, aa:true,
                verses:{ none:0.5,  wood:1.30, light:1.20, heavy:1.35, concrete:1.10 } },
  /* A tank's coaxial machine gun: short, weak, and murder on infantry. */
  coax:       { dmg:14, range:13, cool:0.32, shot:'tracer',  speed:0,  splash:0,
                verses:{ none:1.0,  wood:0.20, light:0.28, heavy:0.10, concrete:0.12 } },
  cannon:     { dmg:38, range:18, cool:1.5,  shot:'shell',   speed:60, splash:3, wall:true, wood:true,
                verses:{ none:0.7,  wood:1.10, light:1.15, heavy:0.90, concrete:0.90 } },
  turretgun:  { dmg:22, range:22, cool:0.9,  shot:'shell',   speed:70, splash:1, wall:true,
                verses:{ none:1.0,  wood:0.70, light:1.00, heavy:0.80, concrete:0.50 } },
  /* Grenades arc: murder on anything that stays still, near-useless against a moving vehicle. */
  grenade:    { dmg:26, range:14, cool:1.9,  shot:'shell',   speed:26, splash:3.4, wall:true, wood:true,
                verses:{ none:1.0,  wood:1.30, light:0.45, heavy:0.25, concrete:0.95 } },
  /* Artillery has the longest reach in the game on the thinnest chassis. */
  howitzer:   { dmg:52, range:34, cool:3.4,  shot:'shell',   speed:44, splash:5.0, wall:true, wood:true,
                verses:{ none:1.1,  wood:1.50, light:0.90, heavy:0.60, concrete:1.15 } },
  /* The Mammoth's gun: slower and dearer than the Battle Tank's, but it goes through armour. */
  heavycannon:{ dmg:62, range:20, cool:2.1,  shot:'shell',   speed:58, splash:3.4, wall:true, wood:true,
                verses:{ none:0.6,  wood:1.25, light:1.30, heavy:1.40, concrete:1.05 } },
  /* Rocket Turret: long and hard-hitting, deliberately poor against infantry so that cheap
     riflemen stay the correct answer to a wall of them. */
  turretrocket:{ dmg:30, range:26, cool:2.0, burst:2, shot:'missile', speed:36, splash:2.2, wall:true, aa:true,
                verses:{ none:0.45, wood:1.10, light:1.30, heavy:1.50, concrete:0.90 } },
  /* Pillbox: a machine gun in concrete. The answer to an infantry rush at a point in the match
     where a Gun Turret is still unaffordable. */
  pillboxgun: { dmg:12, range:15, cool:0.30, shot:'tracer',  speed:0,  splash:0,
                verses:{ none:1.15, wood:0.20, light:0.28, heavy:0.10, concrete:0.12 } },
  /* Attack Dog. ORGANIC: zero against everything that is not a person. */
  /* Range is in WORLD units and a tile is 4 of them. At 3 the dog had to close to 0.75 of a
     tile - but its own radius (0.9) plus an infantryman's (1.1) means the pair can never be
     nearer than 2.0, and any jostle broke contact. Measured: ONE bite in eight seconds, 31
     damage where a rifle squad did 56. The anti-infantry unit was worse at killing infantry
     than the cheapest thing in the game. 5.5 is still unmistakably melee and is reachable. */
  /* `maul` is INFANTRY.CPP's dog rule, and it replaces the damage number entirely:
         if (source is infantry && source->Class->IsDog) {
             if (source->TarCom == As_Target()) damage = Strength;
             else                               damage = 0;
         }
     A bite is set to the target's CURRENT strength, so it always kills in one bite whatever
     it bit; and anything that is not the dog's actual target takes nothing at all - a dog
     spills no collateral. `dmg` below is therefore never used against a legal target and is
     kept only as the fallback if `maul` is ever switched off. Combined with the infantry-only
     targeting rule in _rtsFindTarget, that is the whole unit: a 200-credit assassin that
     deletes exactly one man and cannot scratch a tank. We had given it a damage figure, which
     is precisely why it lost fights to the cheapest infantry in the game. */
  /* The helicopter's missiles: heavy against armour, nearly useless against people, which is
     what keeps it from being a flying answer to everything. */
  hellfire:   { dmg:55, range:20, cool:1.1, shot:'rocket', speed:34, splash:0.9, ammo:1,
                verses:{ none:0.35, wood:1.10, light:1.20, heavy:1.30, concrete:0.85 } },
  /* The MiG's Mavericks. Harder than the Attack Heli's missiles and even more lopsided - it is
     a tank-killer that cannot hurt the men standing next to the tank - but there are only four
     of them and the MiG cannot loiter, so the trade is a heavier punch you get to throw half as
     often. Two per pass at 66 x 1.35 = 89 against heavy armour: a Heavy Tank survives one sortie
     and not two, which is the shape this is tuned to. */
  maverick:   { dmg:66, range:18, cool:0.9, shot:'rocket', speed:40, splash:1.0, ammo:1,
                verses:{ none:0.25, wood:1.05, light:1.25, heavy:1.35, concrete:0.95 } },
  /* And the Yak's nose guns, which are the mirror image: it strafes people and barely marks
     armour. Cheap, fast, and the answer to massed infantry that the Soviets otherwise have to
     solve with a Flame Tower they cannot move. */
  strafe:     { dmg:16, range:14, cool:0.22, shot:'tracer', speed:0, splash:0.6, ammo:1,
                verses:{ none:1.15, wood:0.40, light:0.30, heavy:0.10, concrete:0.10 } },
  /* THE ALLIED ANSWER TO ALL OF THIS. Before the Soviets could fly, the only two weapons in the
     game that could hit an aircraft at all were the Rocket Squad's launcher (both armies) and
     the Rocket Turret - which is SOVIET. So the Allies had no anti-air building whatsoever, and
     it did not show because nothing they could face was in the air. Giving the Soviets an air
     force without this would have handed one side a weapon the other could only answer with
     infantry. Deliberately aa-only: it is a specialist, not a second Gun Turret. */
  flak:       { dmg:22, range:24, cool:0.5, burst:2, shot:'tracer', speed:0, splash:1.4, aa:true,
                aaOnly:true,
                verses:{ none:0.9, wood:0.15, light:0.9, heavy:0.35, concrete:0.10 } },
  bite:       { dmg:22, range:5.5,cool:0.55, shot:'tracer',  speed:0,  splash:0, maul:true,
                verses:{ none:1.4,  wood:0,    light:0,    heavy:0,    concrete:0 } },
  /* Two .45s: shreds infantry, barely marks anything else. The Commando's threat to buildings
     is her C4, not this. */
  pistols:    { dmg:26, range:12, cool:0.22, shot:'tracer',  speed:0,  splash:0,
                verses:{ none:1.6,  wood:0.15, light:0.20, heavy:0.05, concrete:0.08 } },
  /* Flame: very short reach, no travel time, and it does not care what it is burning. Wood
     burns; concrete does not, which is why a flame squad is not the answer to a wall. */
  flame:      { dmg:30, range:9,  cool:0.65, shot:'tracer',  speed:0,  splash:2.6, wood:true,
                verses:{ none:1.3,  wood:1.70, light:0.70, heavy:0.50, concrete:1.20 } },
  /* The Flame Squad's weapon on a fixed mount: a little more reach and a lot more of it. */
  /* The coil's bolt. Enormous damage, slow, and it ignores armour class the way RA's does -
     a Tesla hit is a Tesla hit whether it lands on a rifleman or a Mammoth. */
  teslazap:   { dmg:200, range:17, cool:2.6, shot:'tracer', speed:0, splash:0, wall:true,
                verses:{ none:1, wood:1, light:1, heavy:1, concrete:1 } },
  /* Naval guns. Long reach is the point of a ship - it is the only thing in the game that can
     hit a base without being able to be walked up to. */
  navalgun:   { dmg:30, range:24, cool:1.6, shot:'shell', speed:60, splash:2.0, wall:true, wood:true,
                verses:{ none:0.7, wood:1.1, light:1.0, heavy:0.9, concrete:0.8 } },
  navalheavy: { dmg:55, range:30, cool:2.2, shot:'shell', speed:60, splash:3.0, wall:true, wood:true,
                verses:{ none:0.6, wood:1.2, light:1.1, heavy:1.0, concrete:0.9 } },
  /* A torpedo cannot climb out of the water, so a submarine is helpless against the shore -
     which is what makes the Missile Sub worth its price rather than a strictly better one. */
  torpedo:    { dmg:70, range:22, cool:2.6, shot:'shell', speed:40, splash:1.2, seaOnly:true,
                verses:{ none:0.5, wood:1.0, light:1.2, heavy:1.3, concrete:0.7 } },
  subrocket:  { dmg:60, range:34, cool:3.6, burst:2, shot:'missile', speed:34, splash:3.2, wall:true, wood:true,
                verses:{ none:0.7, wood:1.3, light:1.0, heavy:0.8, concrete:1.0 } },
  /* THE V2's WARHEAD. The Soviets had no reach on land at all: their best ground weapon is the
     Mammoth's 20 and their best base defence the Rocket Turret's 26, against Allied Artillery at
     34 - whose own roster line reads "Outranges every base defence in the game", and which is
     Allied-only. The one Soviet weapon that matches it, the Missile Sub's `subrocket`, needs a
     coast, and a generated battle is landlocked by design.

     So the numbers are `subrocket`'s, which is the Soviets' own long-range profile and already
     balanced, on a land chassis: same 34 reach and 60 damage, a slower reload, and no burst -
     one big rocket rather than two. Against Allied artillery that is harder-hitting per shot and
     slower, and the `verses` table splits their roles rather than cloning them: the howitzer is
     1.1 against infantry and 0.6 against heavy armour, this is 0.55 against infantry and 1.25
     against concrete. Artillery clears a position; the V2 takes a building down. */
  v2rocket:   { dmg:60, range:34, cool:4.2, shot:'missile', speed:34, splash:3.0, wall:true, wood:true,
                verses:{ none:0.55, wood:1.35, light:0.95, heavy:0.85, concrete:1.25 } },
  towerflame: { dmg:34, range:13, cool:0.75, shot:'tracer',  speed:0,  splash:3.0, wood:true,
                verses:{ none:1.3,  wood:1.25, light:0.80, heavy:0.60, concrete:0.90 } }
};

/* WarheadTypeClass::Modifier[] with the original's defaulting rule: anything the table does not
   mention takes 1. IsWallDestroyer is folded in here rather than checked at each call site,
   because there are five of them and one of them forgetting is a silent balance bug. */
function rtsVerses(w, tgt) {
  if (!w) return 1;
  var arm = rtsArmour(tgt);
  if (arm === 'concrete' && tgt.type === 'struct') {
    var sd = rtsStructDef(tgt.def);
    if (sd && sd.wall && !w.wall) return 0;      /* small arms do not knock down concrete */
  }
  if (!w.verses) return 1;
  var m = w.verses[arm];
  return (m === undefined) ? 1 : m;
}


/* ------------------------------------------------------------------ anims --
   AnimTypeClass from ANIM.CPP, trimmed to what this game uses.

   biggest : the stage at which the animation covers the most ground. Ground-altering side
             effects fire THERE, not at the start - ANIM.CPP does this so a crater or scorch
             appears under the fireball rather than popping into view in plain sight.
   chain   : ChainTo. The animation metamorphoses into this one instead of ending.
   damage  : an attached animation applies this per second to whatever it is riding on
             (WARHEAD_FIRE in the original). This is what makes a burning unit burn down. */
var RTS_ANIMS = {
  /* A fireball leaves a small fire burning where it went off - and that fire is on the
     GROUND, with nothing attached to it, so it does no damage. Only a flame riding an object
     burns that object. */
  boom:   { dur:0.75, biggest:0.34, scorch:true,  crater:true,  chain:'firesmall', loops:1 },
  hit:    { dur:0.50, biggest:0.30, scorch:true,  crater:false, chain:null,   loops:1 },
  pop:    { dur:0.40, biggest:0.30, scorch:false, crater:false, chain:null,   loops:1 },
  /* Combat_Anim's PIFF: the little spark a bullet makes. No mark on the ground. */
  piff:   { dur:0.22, biggest:0.30, scorch:false, crater:false, chain:null,   loops:1 },
  /* A soldier falling over. Carries its own frames rather than using the shared sprite sets,
     because the artwork is per-unit and per-variant; the renderer reads f.seq. RA ticks these
     at 80ms and they run 8 to 18 frames, so 0.9s covers the longest without dragging. */
  die:    { dur:0.90, biggest:0.20, scorch:false, crater:false, chain:null,   loops:1 },
  /* The atomic strike. Its own animation because nothing else is the right SHAPE: atomsfx is
     78x121, a column taller than it is wide, where every other effect here is roughly square
     and scaling one up to stand in for a mushroom cloud is what the strike did before. Long,
     because a nuke that is over in three quarters of a second is a large firework. */
  nuke:   { dur:2.60, biggest:0.28, scorch:true,  crater:true,  chain:null,   loops:1 },
  /* ...and its water set. An explosion over water throws a plume, and leaves nothing. */
  splash: { dur:0.55, biggest:0.30, scorch:false, crater:false, chain:null,   loops:1 },
  /* ADATA.CPP's burn ladder. Three sizes of fire, each with its OWN damage rate, and each
     chaining DOWN into the next before finally trailing into smoke - `OnFireBig` ->
     `OnFireMed` -> `OnFireSmall` -> `SmokeM`. A fire is not a fixed effect that plays and
     stops; it burns itself down. That is why a building you shot and then left alone
     smoulders out, and one you keep hitting re-lights at full size.

     `damage` is ADATA's `Damage` field converted out of its units: the original is a fixed
     amount per TICK at 15 FPS, so fixed(1,10) = 1.5 hp/s, fixed(1,16) = 0.9375, and
     fixed(1,32) = 0.46875. The old single `fire` did NINE hp/s, which is six times the
     original's fiercest burn - it was a number picked by eye and it made a burning unit a
     dead unit.

     `size` is the relative draw scale, from ADATA's max-dimension field: 23 / 14 / 11 px.
     Only the big one is IsScorcher; a small fire leaves no mark. */
  firebig:   { dur:1.10, biggest:0, scorch:true,  crater:false, chain:'firemed',   loops:4, damage:1.5,     size:1.00 },
  firemed:   { dur:1.10, biggest:0, scorch:false, crater:false, chain:'firesmall', loops:4, damage:0.9375,  size:0.61 },
  firesmall: { dur:1.10, biggest:0, scorch:false, crater:false, chain:'smoke',     loops:4, damage:0.46875, size:0.48 },
  /* SmokeM: no damage, no mark, just what is left over. */
  smoke:     { dur:1.30, biggest:0, scorch:false, crater:false, chain:null,        loops:5, damage:0,       size:0.85 }
};
/* Which rung of the ladder a thing catches fire at, by how big it is. A pillbox does not
   burn like a refinery. */
var RTS_FIRE_BIG = 6;           /* footprint tiles at or above which a structure burns big */
var RTS_FIRE_MED = 4;
/* BuildingClass::Take_Damage lights a building up once it is badly hurt, not on the first
   scratch. Units already used 0.3; structures use ConditionRed so a burning building reads
   as one that is nearly gone. */
var RTS_BURN_UNIT = 0.3;
/* The literal, NOT RTS_COND_RED - that is declared further down this file, and a `var` read
   before its assignment is `undefined` silently. Kept in step with it by this comment. */
var RTS_BURN_STRUCT = 0.25;
/* Combat_Anim picks the explosion from the DAMAGE and the LAND TYPE - a rifle round and a
   tank shell are not the same event, and neither is over water. The thresholds mirror the
   original's: tiny hits piff, mid hits throw fragments, big ones are a fireball. */
var RTS_ANIM_PIFF = 15;      /* below this, a spark (ExplosionSet 2: PIFF / PIFFPIFF) */
var RTS_ANIM_BOOM = 40;      /* at or above this, the full fireball */
var RTS_CRATER_ORE = 6;   /* ANIM.CPP: a crater calls Reduce_Tiberium(6) */

