/* rules/factions.js - Allied and Soviet: who may build what, and the superweapons.
   Part of rts.rules, the roster. */

/* ------------------------------------------------------------- factions --
   Red Alert is two asymmetric armies, and this roster was one merged list: the Allies' Pillbox
   and the Soviets' Flame Tower and Kennel were all buildable by everyone, so there was nothing
   to choose between and no reason for a faction picker to exist.

   A def now carries an optional `side`. Anything without one is shared - the yard, the economy,
   the basic infantry - which is also how RA does it. What is tagged is what makes the two play
   differently:

     Allied   Pillbox, Gun Turret, Medic, Light Tank, Artillery, Helipad + Attack Heli,
              Commando, Thief
     Soviet   Flame Tower, Tesla Coil, Rocket Turret, Kennel + Attack Dog, Flame Squad,
              Grenadier, Mammoth Tank

   The split is RA's own, not invented here. */
function rtsSideOf(def) { return (def && def.side) || null; }
function rtsBuildableBy(def, side) {
  var s = rtsSideOf(def);
  return !s || s === side;
}
/* Which army a house fields. The player's is their choice; the opponent takes the other one,
   because a mirror match is the one arrangement that makes the whole split pointless. */
function rtsHouseSide(house) {
  var mine = (typeof rtsVoxSide === 'function') ? rtsVoxSide() : 'allied';
  return house === 'player' ? mine : (mine === 'allied' ? 'soviet' : 'allied');
}

/* Armour class per thing, used with a weapon's `verses` table above. */
/* ARMOUR — from CONST.CPP's ArmorName[] and WARHEAD.CPP's Modifier[armor].

   `ArmorName[ARMOR_COUNT] = { "none", "wood", "light", "heavy", "concrete" }`, and a warhead
   carries one multiplier PER ARMOUR CLASS ("Verses=100%,100%,100%,100%,100%" in RULES.INI),
   defaulting to 1 for everything.

   This game had three buckets - infantry / vehicle / building - derived from what a thing IS.
   That is a worse model than RA's, and not by a little: armour is a PROPERTY of the object,
   independent of its category, so a Mammoth and a concrete bunker can share `heavy` while a
   Scout Buggy and a Battle Tank differ even though both are vehicles. Under the old scheme
   every vehicle in the game necessarily took the same multiplier from every weapon.

   The five classes are the port. The numbers in each weapon's `verses` table are still mine -
   they live in RULES.INI, which is a data file rather than source, so they were derived from
   the old three-bucket values to hold the measured balance and will be replaced wholesale if
   that file ever turns up. */
/* BDATA.CPP's IsCaptureable, defaulting the way the original does: a building is capturable
   unless its type says otherwise. Walls and silos are not - there is nothing inside either of
   them for an engineer to take over, and "capture the enemy's wall" is not a plan. */
function rtsCapturable(key) {
  var d = rtsStructDef(key);
  return !d || d.capturable !== false;
}

var RTS_ARMOUR = ['none', 'wood', 'light', 'heavy', 'concrete'];
function rtsArmour(e) {
  var d = (e.type === 'struct') ? rtsStructDef(e.def) : rtsUnitDef(e.def);
  if (d && d.armour) return d.armour;
  /* Anything that has not been given a class explicitly: infantry are ARMOR_NONE in the
     original, everything else falls back to the middle of the range. */
  if (e.type === 'struct') return 'concrete';
  return (d && d.kind === 'infantry') ? 'none' : 'light';
}

/* ------------------------------------------------------------- economy --
   A harvester holds `capacity` scrap; unloading converts it 1:1 to credits.
   Each scrap tile starts with RTS_SCRAP_TILE and is mined at RTS_HARVEST_RATE/s. */
var RTS_START_CREDITS = 3000;   /* RULES.CPP: MPDefaultMoney */
var RTS_SCRAP_TILE = 500;
/* COMBAT.CPP IsTiberiumDestroyer: Reduce_Tiberium(strength / 10), counted in ore LEVELS - a
   full cell holds about twelve. Fighting over an ore field strips it, which is why the patch
   you have been shelling all game is bare by the end. Declared here, after the tile capacity
   it is derived from: a var read before its assignment is NaN, and silently so. */
var RTS_ORE_PER_LEVEL = 500 / 12;
var RTS_HARVEST_RATE = 190;
var RTS_UNLOAD_RATE = 700;      /* scrap/second poured into the refinery */
/* TECHNO.CPP's Time_To_Build, verbatim:
       fixed power = House->Power_Fraction();
       if (power > 1) power = 1;
       if (power < 1 && power > fixed::_3_4) power = fixed::_3_4;
       if (power < fixed::_1_2) power = fixed::_1_2;
   Two things in there that we did not have. The FLOOR is a half, not the 0.28 that was here -
   a browned-out base in the original is slow, not crippled. And there is a DEAD ZONE: anything
   between three quarters and full counts as three quarters, so the moment you dip under 100%
   you pay a flat 25% whether you are at 99% or at 76%. That is what makes staying fully
   powered feel like a real decision rather than a gradient you can ignore. */
var RTS_POWER_BAND = 0.75, RTS_POWER_MIN = 0.5;
var RTS_BUILD_RADIUS = 9;       /* tiles: how far from an existing structure you may build */
/* CONQUER.CPP's Color_Cycle steps the water band once every TIMER_SECOND/4 - four a second. */
var RTS_WATER_HZ = 4;

/* The light pass. Restraint is the whole game here: bloom above about 0.5 turns pixel art into
   soup, and a vignette you can consciously see is one that is too strong. These are the numbers
   that survived looking at them. */
var RTS_POST_ON = true;
var RTS_BLOOM = 1.0;            /* how much of the blurred highlight is added back, per pass.
                                   Raised with the threshold, which squares once more (see
                                   render/post.js) and costs the fireball itself 0.81 -> 0.66.
                                   ONE is the ceiling and not a tuning choice: this is a canvas
                                   globalAlpha, and the spec says a value outside [0,1] is
                                   IGNORED rather than clamped - so 1.05 here does not mean 1.05,
                                   it means whatever alpha was already set. More gain than this
                                   has to come from RTS_BLOOM_PASSES. */
var RTS_BLOOM_PASSES = 1;       /* added this many times - gain, separate from the threshold */
var RTS_BLOOM_BLUR = 2;         /* px, at EIGHTH resolution - so ~16px across the frame */
var RTS_VIGNETTE = '#d2d7de';   /* the corner multiplier; nearer white is a weaker vignette */

/* ------------------------------------------------------------ superweapons --
   What each one does when it goes off. Kept here with the other tuning rather than buried in
   the code that applies it, because these five numbers ARE the balance of the feature. */
var RTS_NUKE_RADIUS  = 4.5;     /* tiles: the blast, against RTS_TILE-scaled world units */
var RTS_NUKE_DAMAGE  = 1000;    /* at the centre; falls off through the normal splash curve */
var RTS_NUKE_SPREAD  = 3.2;     /* a wide, shallow curve - a nuke is not a shell */
var RTS_NUKE_DELAY   = 3.0;     /* seconds between the launch and the hit, so it can be seen */
var RTS_IRON_TIME    = 30;      /* seconds of invulnerability */
var RTS_IRON_RADIUS  = 3.0;     /* tiles: everything of yours this close is covered too */
var RTS_CHRONO_MAX   = 8;       /* units one jump can carry, RA's own ChronoTechLevel feel */

/* Ore regrows and spreads, as it does in the original (RULES.CPP: IsTGrowth, IsTSpread,
   GrowthRate). A field you have worked out slowly comes back, so a long game does not
   grind to a halt on a dead map. */
/* RULES.CPP GrowthRate(2) - TWO MINUTES between growth sweeps, not six seconds. Ore was
   regrowing twenty times faster than the original, which is most of why a worked-out field
   here comes back while you watch instead of over the course of a long game. */
var RTS_ORE_GROW_EVERY = 120;
var RTS_ORE_GROW_AMT = 26;      /* added to an existing non-full tile each pass */
var RTS_ORE_SPREAD_CHANCE = 0.10; /* chance a rich tile seeds an empty neighbour */
/* CELL.CPP counts ore in DISCRETE LEVELS - OverlayData 0..11, twelve of them. The thresholds
   below are quoted straight from Can_Tiberium_Grow (`OverlayData >= 11` stops growth) and
   Can_Tiberium_Spread (`OverlayData <= 6` cannot seed), expressed as fractions of a full
   tile so the rest of the economy can keep working in credits. */
var RTS_ORE_LEVELS = 12;
var RTS_ORE_RICHNESS = 0.51;    /* scales _adj so total map wealth matches the old fields */
var RTS_ORE_SPREAD_MIN = 7 / 12;  /* must be ABOVE level 6 to seed a neighbour */
/* MAP.CPP keeps a fixed-size candidate list filled by reservoir sampling, so the cost of a
   growth pass does not scale with how much ore is on the map. */
var RTS_ORE_SAMPLE = 1200;

/* Enemy waves. RULES.CPP has AttackInterval 3 / AttackDelay 5 in MINUTES, which is the
   pacing of a 40-minute skirmish; a match here is a fraction of that, so these are the same
   idea on this game's clock. Difficulty scales both (see RTS_DIFF.build). */
var RTS_WAVE_EVERY = 85;
var RTS_WAVE_FIRST = 150;   /* a refinery costs 1400 and takes 18s - the first wave must not
                               land before a new player has had time to stand up an economy */

