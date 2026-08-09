/* rules/vehicles.js - vehicle facings and turrets, and TECHNO.CPP's threat scan.
   Part of rts.rules, the roster. */

/* ------------------------------------------------------------- vehicles --
   UNIT.CPP. A vehicle carries two facings: PrimaryFacing is the hull and SecondaryFacing is
   the turret, and they are drawn as separate shapes. Can_Fire refuses with FIRE_FACING until
   the turret is within about 11 degrees of the target, and with FIRE_ROTATING if the turret
   is still swinging and the weapon does not home. */
var RTS_TURRET_ROT = 3.0;       /* radians/second, the turret's own rate */
var RTS_FIRE_ANGLE = 0.2;       /* ~11 degrees: Can_Fire's `diff < 8` out of 256 */
var RTS_RECOIL_TIME = 0.12;     /* how long the turret sits recoiled after firing */
/* Rearm_Delay: the SHORT half of a two-shooter's alternating reload. The original returns a
   flat 3 ticks here regardless of the weapon, which at 15 FPS is a fifth of a second. */
var RTS_BURST_DELAY = 0.2;
/* PrimaryLateral: how far off the barrel line the second shot of a pair appears. */
var RTS_MUZZLE_LATERAL = 0.5;
/* TURRET.CPP Fire_Coord: how far the muzzle sits ahead of the object's centre, as a multiple
   of the body radius. A turret overhangs its hull, so its barrel reaches past the body; a
   hull-mounted gun fires from inside the silhouette. A defence structure gets a flat reach,
   since the gun is most of the building. */
var RTS_MUZZLE_TURRET = 1.15;
var RTS_MUZZLE_HULL   = 0.75;
var RTS_MUZZLE_STRUCT = 2.2;
/* Fire_Direction: a non-homing shell leaves along the barrel and holds that bearing, so it
   can miss. How close it has to pass to something hostile to detonate on it, and how far
   past the aim point it keeps flying before going off on its own. */
var RTS_SHELL_HIT  = 1.8;
var RTS_SHELL_OVER = 0.35;

/* ------------------------------------------------ threat scan (TECHNO.CPP) --
   Evaluate_Object scores a candidate target rather than just measuring how far away it is.
   The base value is the object's Points (Risk + Reward); this game has no Points table, so
   cost stands in for it - a war factory outranks a rifle squad by the same logic either way.

   `value = rawval + object->Crew.Kills` makes a unit that has already killed things a hotter
   target: veterans get focused down. Kills are added raw to a Points-scale number in the
   original, but costs here run 100-1600 rather than 10-80, so the kill term is scaled up to
   stay meaningful instead of vanishing into the rounding. */
var RTS_KILL_VALUE = 60;
/* "If the object is outside of the protective umbrella of the enemy base, then give it a
   target boost" - stragglers and lone harvesters out in the open get hunted first. */
var RTS_EXPOSED_MULT = 2;
/* NervousBias: a target that has got INTO your own base is worth more than the same target
   sitting in a field. This is what makes a base defend itself properly. */
var RTS_NERVOUS_BIAS = 2;
/* The distance falloff is LINEAR in cells - note the original has the squared version right
   there, commented out, and ships the linear one. */
var RTS_THREAT_SCALE = 32000;
/* Threat_Range for area guard: twice the weapon range, clamped. 0x0A00 leptons = 10 cells. */
var RTS_THREAT_MAX_CELLS = 10;
/* Base_Is_Attacked: how many defenders may be recalled at once, and how long before the same
   attacker can trigger another recall (BaseDefenseDelay, in seconds). */
var RTS_DEFENDERS = 6;
var RTS_BASE_DEFENSE_DELAY = 30;
/* Firing from the darkness gives you away: Fire_At does a Sight_From of radius 2 around a
   shooter the player cannot currently see. Here it is a short reveal on the shooter itself,
   since the visibility grid is rebuilt every sweep and a one-shot mark would be erased. */
var RTS_MUZZLE_SPOT = 1.6;
/* ------------------------------------------------------------------ cloaking --
   TECHNO.CPP's Cloaking_AI, and the two rules that make a submarine a submarine rather than a
   boat that happens to be hard to see:

     IT SURFACES TO SHOOT. "A cloaked object that fires will decloak", and it stays up for a
     moment afterwards. That window is the entire counterplay - a submarine that could fire from
     under water would be a gun nothing in the game can answer.

     PROXIMITY REVEALS IT. Anything that gets close enough finds one, and a DESTROYER carries
     sonar that finds it from further out. That is what makes the Allied answer to a Soviet
     fleet a particular hull rather than "bring more boats", and it is why the Destroyer's own
     roster line already promised to be "the Allied answer to a submarine" - a promise nothing
     in the code kept until now.

   Seconds, and world units. RTS_SUB_DETECT is the FLOOR that every object has; a type carrying
   its own `detects` uses that instead, and only the Destroyer does. */
var RTS_SUB_SURFACE = 4.0;
var RTS_SUB_DETECT = 4 * 2.5;             /* two and a half cells - close enough to see a wake */
/* Overrun_Square: a tracked vehicle drives over infantry. Approaching one makes them scatter
   (`cellptr->Incoming(0, true)`); actually reaching them kills them. Should_Crush_It refuses
   for HUMAN-controlled vehicles - your own tanks never auto-crush, you have to drive them
   over deliberately - and only within CrushDistance. */
/* UnitTypeClass's "Can this unit squash infantry?" flag, read straight off UDATA.CPP's stat
   blocks. Every tracked hull crushes: LTank, MTank, MTank2, HTank (Mammoth), Harvester, APC,
   MineLayer and MCV all carry it. The JEEP and the ARTILLERY explicitly do NOT, which is the
   correction this file supplied - `light` and `heavy` were missing from this table, and the
   Scout Buggy was never meant to be here in the first place. */
var RTS_CRUSHERS = { tank:1, light:1, heavy:1, harvester:1 };
var RTS_CRUSH_DIST = 1.5 * 4;   /* Rule.CrushDistance 0x0180 = 1.5 cells */
var RTS_CRUSH_KILL = 0.9;       /* world units: close enough to actually run them down */
/* Take_Damage: a destroyed vehicle has a 50% chance of throwing out a crew member, who
   starts wounded and runs. Unarmed vehicles produce a technician instead of a soldier. */
var RTS_CREW_CHANCE = 0.5;

