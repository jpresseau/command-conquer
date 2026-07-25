/* RC COMMAND - a Command & Conquer-style real-time strategy game.
   Build a base, mine Scrap with harvesters, produce units, and fight the Redline faction.
   Standalone: the only outside dependency in the whole app is three.js.

   This file is the RULES layer - every balance number lives here, nothing else. The
   structure/unit tables are deliberately data-only so the whole game can be re-tuned by
   editing this one file (the way RULES.INI worked in the classic RTS games).

   Grid: the battlefield is RTS_N x RTS_N tiles of RTS_TILE world units each, centred on
   the origin, so tile (tx,tz) has its centre at ((tx-RTS_N/2+0.5)*RTS_TILE, ...). */

var RTS_TILE = 4;      /* world units per tile */
var RTS_N = 112;       /* tiles per side. Red Alert maps run to 128 - a big map with small
                          buildings on it is a large part of why the original reads the way
                          it does, and why an early pass here looked like a diorama. */

var RTS_SIDES = {
  player: { key:'player', name:'Vanguard', color:0x4a8ff0, glow:0xa8d4ff, tag:'VGD' },
  enemy:  { key:'enemy',  name:'Redline',  color:0xe0503c, glow:0xffb49f, tag:'RDL' }
};

/* ---------------------------------------------------------------- structures --
   The 3D model for each key is built by _rtsBuild() in rts.buildings.js.
   w,h  : footprint in tiles
   cost : credits
   build: seconds to construct at full power
   power: + supplies, - draws
   needs: structure keys that must already be built and alive
   Numbers are ours, but the shape of the tech tree is the classic one:
   power -> refinery/barracks -> factory -> defences. */
var RTS_STRUCTS = [
  { key:'yard',     name:'Command Yard',  w:3, h:3, cost:0,    build:0,  hp:1400, power:0,    sight:16,
    desc:'The heart of your base. Everything you build must sit near it.' },
  { key:'power',    name:'Power Plant',   w:2, h:2, cost:300,  build:7,  hp:500,  power:100,  sight:10,
    desc:'Supplies 100 power. Low power slows every production line.' },
  { key:'refinery', name:'Scrap Refinery',w:3, h:3, cost:1400, build:18, hp:950,  power:-30,  sight:12,
    needs:['power'], freeUnit:'harvester',
    desc:'Harvesters unload here. Ships with one free Harvester.' },
  { key:'barracks', name:'Barracks',      w:2, h:2, cost:400,  build:9,  hp:650,  power:-20,  sight:12,
    needs:['power'], produces:'infantry',
    desc:'Trains infantry.' },
  { key:'factory',  name:'War Factory',   w:3, h:2, cost:1600, build:20, hp:900,  power:-30,  sight:12,
    needs:['refinery'], produces:'vehicle',
    desc:'Builds RC combat vehicles and Harvesters.' },
  { key:'turret',   name:'Gun Turret',    w:1, h:1, cost:500,  build:10, hp:520,  power:-20,  sight:18,
    needs:['barracks'], weapon:'turretgun',
    desc:'Automated base defence. Needs power to fire.' }
];

/* ------------------------------------------------------------------- units --
   kind   : 'infantry' | 'vehicle'  (also picks the producing structure)
   speed  : world units / second
   turn   : radians / second
   r      : collision radius (world units)
   weapon : key into RTS_WEAPONS (null = unarmed) */
var RTS_UNITS = [
  { key:'rifle',    name:'Rifle Squad',   kind:'infantry', cost:100,  build:3,  hp:60,   speed:7,   turn:6,  r:1.1, sight:16, weapon:'rifle',
    desc:'Cheap infantry. Good against other infantry.' },
  { key:'rocket',   name:'Rocket Squad',  kind:'infantry', cost:300,  build:6,  hp:50,   speed:6,   turn:6,  r:1.1, sight:18, weapon:'rocket',
    desc:'Slow-firing missiles. Tears up vehicles and buildings.' },
  { key:'buggy',    name:'Scout Buggy',   kind:'vehicle',  cost:500,  build:7,  hp:170,  speed:16,  turn:3.2,r:1.6, sight:22, weapon:'mg',
    desc:'Fast RC scout. Shreds infantry, folds against tanks.' },
  /* weapon2: TECHNO.CPP's SecondaryWeapon. What_Weapon_Should_I_Use scores both against the
     target's armour and takes the better, so the tank answers infantry with its coaxial gun
     and armour with the main gun, with no input from the player. */
  { key:'tank',     name:'Battle Tank',   kind:'vehicle',  cost:800,  build:11, hp:460,  speed:9,   turn:1.8,r:2.0, sight:18, weapon:'cannon', weapon2:'coax',
    desc:'The backbone of any serious attack. Coaxial gun for infantry.' },
  { key:'harvester',name:'Harvester',     kind:'vehicle',  cost:1200, build:14, hp:700,  speed:7.5, turn:1.6,r:2.2, sight:14, weapon:null,
    harvest:true, capacity:700,
    desc:'Mines Scrap fields and unloads at a refinery.' }
];

/* --------------------------------------------------------------- weapons --
   dmg      : damage per shot
   range    : world units
   cool     : seconds between shots
   shot     : 'tracer' | 'shell' | 'missile'  (visual)
   speed    : projectile speed (0 = hitscan tracer)
   splash   : blast radius, 0 = single target
   vs       : damage multipliers by armour class */
var RTS_WEAPONS = {
  rifle:     { dmg:7,  range:15, cool:0.55, shot:'tracer',  speed:0,   splash:0, vs:{ infantry:1.0, vehicle:0.35, building:0.25 } },
  mg:        { dmg:9,  range:16, cool:0.35, shot:'tracer',  speed:0,   splash:0, vs:{ infantry:1.0, vehicle:0.4,  building:0.3  } },
  /* burst: Is_Two_Shooter. Rearm_Delay alternates the reload so the shots arrive as a fast
     pair and then a long wait. Which weapons burst is a choice here, not ported data - RA
     carries it in RULES.INI and this game has no equivalent - so it goes on the launcher,
     where a visible two-missile salvo is the whole character of the unit. Per-missile damage
     is halved against the old single shot and the reload retuned so the sustained output
     lands where it was; see the measured figures in CLAUDE.md. */
  rocket:    { dmg:13, range:20, cool:1.80, burst:2, shot:'missile', speed:34,  splash:2, vs:{ infantry:0.5, vehicle:1.3,  building:1.2  } },
  /* A tank's coaxial machine gun: short, weak, and murder on infantry. */
  coax:      { dmg:14, range:13, cool:0.32,  shot:'tracer',  speed:0,   splash:0, vs:{ infantry:1.0, vehicle:0.2,  building:0.15 } },
  cannon:    { dmg:38, range:18, cool:1.5,  shot:'shell',   speed:60,  splash:3, vs:{ infantry:0.7, vehicle:1.0,  building:1.0  } },
  turretgun: { dmg:22, range:22, cool:0.9,  shot:'shell',   speed:70,  splash:1, vs:{ infantry:1.0, vehicle:0.9,  building:0.6  } }
};

/* ------------------------------------------------------------------ anims --
   AnimTypeClass from ANIM.CPP, trimmed to what this game uses.

   biggest : the stage at which the animation covers the most ground. Ground-altering side
             effects fire THERE, not at the start - ANIM.CPP does this so a crater or scorch
             appears under the fireball rather than popping into view in plain sight.
   chain   : ChainTo. The animation metamorphoses into this one instead of ending.
   damage  : an attached animation applies this per second to whatever it is riding on
             (WARHEAD_FIRE in the original). This is what makes a burning unit burn down. */
var RTS_ANIMS = {
  boom:   { dur:0.75, biggest:0.34, scorch:true,  crater:true,  chain:'fire', loops:1 },
  hit:    { dur:0.50, biggest:0.30, scorch:true,  crater:false, chain:null,   loops:1 },
  pop:    { dur:0.40, biggest:0.30, scorch:false, crater:false, chain:null,   loops:1 },
  /* Combat_Anim's PIFF: the little spark a bullet makes. No mark on the ground. */
  piff:   { dur:0.22, biggest:0.30, scorch:false, crater:false, chain:null,   loops:1 },
  /* ...and its water set. An explosion over water throws a plume, and leaves nothing. */
  splash: { dur:0.55, biggest:0.30, scorch:false, crater:false, chain:null,   loops:1 },
  fire:   { dur:1.10, biggest:0,    scorch:true,  crater:false, chain:null,   loops:2, damage:9 }
};
/* Combat_Anim picks the explosion from the DAMAGE and the LAND TYPE - a rifle round and a
   tank shell are not the same event, and neither is over water. The thresholds mirror the
   original's: tiny hits piff, mid hits throw fragments, big ones are a fireball. */
var RTS_ANIM_PIFF = 15;      /* below this, a spark (ExplosionSet 2: PIFF / PIFFPIFF) */
var RTS_ANIM_BOOM = 40;      /* at or above this, the full fireball */
var RTS_CRATER_ORE = 6;   /* ANIM.CPP: a crater calls Reduce_Tiberium(6) */

/* ------------------------------------------------------------- infantry --
   INFANTRY.CPP. Fear is a counter that decays one step per frame; taking a hit slams it to
   SCARED, and otherwise it climbs by ANXIOUS halved once for each health threshold the
   soldier is still above - so wounded infantry panic much faster than fresh ones. At
   ANXIOUS they lie down; below it they get up. */
var RTS_FEAR = { NONE:0, ANXIOUS:10, SCARED:50, PANIC:100, MAXIMUM:255 };
var RTS_FEAR_DECAY = 15;        /* per second; the original decays 1 per frame at 15 FPS */

/* ------------------------------------------------- missions (MISSION.CPP) --
   MissionControlClass is a FLAG TABLE indexed by mission, read from the INI. Four of its
   fields decide how the rest of the game treats an object, and until now this game had them
   hardcoded in three separate places, each inferred from whatever the caller happened to
   need at the time:

     IsRetaliate   - shoots back when hit                            (default true)
     IsScatter     - gets out of the way of incoming                 (default true)
     IsRecruitable - may be recruited into a team, or recalled to defend the base (true)
     IsNoThreat    - is not considered a threat by a target scan     (default false)

   `rate` is MissionControl's Rate: how often the mission's own logic wants to think. It is
   recorded because it is part of the contract, but this engine runs every unit every frame -
   at 25 ms per simulated second for 78 entities there is nothing to buy by staggering them,
   and a unit reacting on a 30-second timer feels broken on a modern display.

   `hold` is MISSION_STICKY - it stays where it is put. That distinction between GUARD and
   STICKY is the reason the table earns its keep: a unit told to hold a position should not
   be dragged off it by the base-defence recall. */
var RTS_MISSIONS = {
  guard:   { retaliate:true,  scatter:true,  recruitable:true,  noThreat:false, hold:false, rate:0.13 },
  move:    { retaliate:true,  scatter:true,  recruitable:true,  noThreat:false, hold:false, rate:0.06 },
  amove:   { retaliate:true,  scatter:true,  recruitable:true,  noThreat:false, hold:false, rate:0.06 },
  attack:  { retaliate:true,  scatter:true,  recruitable:true,  noThreat:false, hold:false, rate:0.06 },
  /* A harvester is unarmed, so it cannot retaliate, and pulling it off the ore to defend the
     base costs more than the raid does. Not a threat either - nothing should pick a fight
     with it in preference to something that shoots back. It is still a target, and a rich
     one; IsNoThreat governs what it provokes, not what it is worth. */
  harvest: { retaliate:false, scatter:true,  recruitable:false, noThreat:true,  hold:false, rate:0.13 },
  /* STICKY: holds ground. Fires from where it stands, never chases, and the base-defence
     recall leaves it alone. */
  hold:    { retaliate:true,  scatter:false, recruitable:false, noThreat:false, hold:true,  rate:0.13 }
};
var RTS_MISSION_DEFAULT = { retaliate:true, scatter:true, recruitable:true, noThreat:false, hold:false, rate:0.13 };
/* RULES.CPP: ConditionYellow = 1/2, ConditionRed = 1/4. These are not cosmetic - they are the
   thresholds for damaged building art, the fear escalation ladder and the AI's sell-back
   decision, so having them at 0.66/0.33 quietly mistuned all three. */
var RTS_COND_YELLOW = 0.5, RTS_COND_RED = 0.25;
var RTS_PRONE_DAMAGE = 0.5;     /* Rule.ProneDamageBias */
var RTS_PRONE_SPEED = 0.5;      /* prone infantry crawl at half pace */

/* ------------------------------------------------------------ buildings --
   BUILDING.CPP. A structure is not a static lump of hit points: it produces less power as
   it burns, it can be patched up a step at a time for money, it can be sold back for half,
   and when it goes down its crew runs out of the wreck.

   Repair_AI runs on a timer and each tick calls Repair_Step (hit points) for Repair_Cost
   (credits). The cost is the same fraction of the building's price as the hit points are of
   its total, scaled by RepairPercent - so patching a building all the way up from nothing
   costs a fraction of building a new one, which is the whole reason to do it. */
var RTS_REPAIR_RATE = 0.75;     /* seconds between repair steps (Rule.RepairRate) */
var RTS_REPAIR_STEP = 0.05;     /* fraction of max hp restored per step (Rule.RepairStep) */
var RTS_REPAIR_PCT = 0.25;      /* Rule.RepairPercent = 1/4 */
var RTS_REFUND_PCT = 0.5;       /* Rule.RefundPercent: sell gives back half */
var RTS_SURVIVOR_FRACTION = 0.5;/* Rule.SurvivorFraction, used by How_Many_Survivors */
var RTS_SURVIVOR_ODDS = 0.5;    /* Drop_Debris only rolls some of them out of a wreck */
var RTS_DECON_TIME = 0.35;      /* Mission_Deconstruction: build-up run backwards, this x build */
/* BUILDING.H CountDown: "if the building is destroyed, it won't actually be removed from the
   map until this value reaches zero. This delay is for cosmetic reasons." A structure that
   vanishes on the frame it dies leaves its own explosion hanging in mid-air over bare grass.
   The wreck stays, burning, and only then is taken off the map. */
var RTS_WRECK_TIME = 3.0;

/* --------------------------------------------------------------- combat --
   COMBAT.CPP's Modify_Damage is the whole of the blast model, and its falloff is a DIVISION,
   not a taper:

       steps = distance / (SpreadFactor * PIXEL_LEPTON_W/2), bounded 0..16
       if (steps) damage /= steps
       if (steps < 4) damage = max(damage, MinDamage)     <- floor near the blast ONLY
       damage = min(damage, MaxDamage)

   So damage falls as 1/d: brutal at the impact point, nearly nothing a cell out, and the
   MinDamage floor deliberately stops applying past a quarter of full damage - "allow damage
   to drop to zero only if the distance would have reduced damage to less than 1/4 full
   damage". A unit at the edge of a blast should take NOTHING, not a courtesy point.

   RTS_SPREAD_STEPS is the steps-per-tile at SpreadFactor 1, scaled here so that a weapon's
   existing `splash` radius plays the SpreadFactor role. */
var RTS_MIN_DAMAGE = 1;
var RTS_MAX_DAMAGE = 1000;
var RTS_SPREAD_STEPS = 8;
/* Explosion_Damage only ever examines the impact cell and the eight around it, with
   range = ICON_LEPTON_W * 1.5 - so a blast NEVER spills further than a cell and a half,
   whatever the warhead. SpreadFactor shapes the curve inside that; it does not widen it.
   A weapon's `splash` is therefore its SpreadFactor here, not its radius. */
var RTS_BLAST_CELLS = 1.5;

var RTS_SPREAD_MAX = 16;      /* Bound(distance, 0, 16) */
var RTS_SPREAD_FLOOR = 4;     /* MinDamage applies only inside this many steps */

/* -------------------------------------------------------------- economy --
   GoldValue 35 / GemValue 110 - gems are worth a bit over three times ore per unit mined,
   which is what makes a gem patch worth crossing the map for. */
var RTS_GOLD_VALUE = 35;
var RTS_GEM_VALUE = 110;
/* CELL.CPP Tiberium_Adjust prices a gem STEP at `Rule.GemValue * 4`, against `Rule.GoldValue`
   for a gold step - so per step gems are worth 12.6x, not 3.1x. The familiar ~3x only shows
   up per TILE, because _adjgem caps a gem cell at 3 steps while gold reaches 12. Using the
   bare 110/35 ratio per unit mined, together with that cap, made a gem tile worth LESS than
   a gold one (measured 344 against 419) - precisely backwards for the deposit you are meant
   to fight over. */
var RTS_GEM_MULT = (RTS_GEM_VALUE * 4) / RTS_GOLD_VALUE;
/* How much further a harvester will drive for gems. Bounded on purpose - see the note in
   _rtsNearestScrap. This is a routing preference, not a price. */
var RTS_GEM_DETOUR = 3;

/* ------------------------------------------------------------ difficulty --
   RULES.CPP's DifficultyClass: the game does not make the AI "better", it multiplies a
   handful of biases on a whole house. The fields are the original's; the numbers are ours,
   because the shipped RULES.INI values are not in this source file.

   iq    : how many of the AI's behaviours are switched on at all (see RTS_IQ below)
   fire  : FirepowerBias        speed : GroundspeedBias
   armor : ArmorBias            rof   : ROFBias (higher = slower reload)
   cost  : CostBias             build : BuildSpeedBias (higher = slower)
   wall  : IsWallDestroyer      scan  : IsContentScan (looks inside transports/buildings) */
var RTS_DIFF = {
  easy:   { name:'Recruit',  iq:2, fire:0.75, speed:0.85, armor:0.7, rof:1.3,  cost:1.2, build:1.4, wall:false, scan:false,
            desc:'Redline attacks late, builds little and hits softly.' },
  normal: { name:'Soldier',  iq:3, fire:1,    speed:1,    armor:1,   rof:1,    cost:1,   build:1,   wall:true,  scan:false,
            desc:'An even fight. Redline expands and repairs.' },
  hard:   { name:'Commando', iq:5, fire:1.15, speed:1.1,  armor:1.2, rof:0.85, cost:0.8, build:0.7, wall:true,  scan:true,
            desc:'Redline builds a real base, defends it and comes early.' }
};
var RTS_DIFF_DEFAULT = 'normal';

/* -------------------------------------------------------------------- IQ --
   RULES.CPP's IQ section is the part worth stealing: each AI behaviour has an IQ level at
   which it switches ON. A low-IQ opponent is not a high-IQ one with worse numbers - it is
   missing specific, nameable abilities, which is far more legible than a damage multiplier. */
var RTS_IQ = {
  max:5,
  sellBack:2,       /* sells a building it cannot afford to repair */
  repairSell:3,     /* repairs damaged buildings at all */
  scatter:3,        /* its infantry scatter from incoming fire */
  harvester:3,      /* replaces lost harvesters */
  guardArea:4,      /* leaves a garrison at home instead of sending everything */
  refill:3,         /* restarts a production line the instant it frees */
  production:5      /* full build order and base expansion */
};

/* ------------------------------------------------------------- AI base --
   RULES.CPP's [AI] section. The AI does not follow a fixed build order - it holds a target
   *composition*: each structure type wants `ratio` of the base size, capped at `limit`, and
   it builds whatever it is furthest short of. BaseSizeAdd is the key one: the AI aims for
   the human's building count plus this, so it keeps pace with how you are actually playing
   instead of building to a script. */
/* HOUSE.CPP's Expert_AI. The architecture is the valuable part: every strategy is scored for
   URGENCY, and the AI then acts on the most urgent ones first, "because higher urgency actions
   tend to greatly affect the lower urgency actions". A flat if/else build order cannot express
   "I am broke AND under attack AND browned out" - this can.

   The house also runs a small state machine that the urgency checks read. */
var RTS_URGENCY = { NONE:0, LOW:1, MEDIUM:2, HIGH:3, CRITICAL:4 };
var RTS_STATE = { BUILDUP:0, BROKE:1, ATTACKED:2, ENDGAME:3 };
var RTS_ALERT_DELAY = 25;       /* Rule.SpeakDelay: cooldown on "base under attack" */
/* A house that cannot meet its power demand takes structural damage over time - only on the
   buildings that actually draw power, so a minefield does not blow itself up in a brownout. */
var RTS_DAMAGE_DELAY = 20;      /* seconds between brownout damage ticks */
var RTS_POWER_DAMAGE = 6;       /* hit points per tick, on buildings above ConditionYellow */

var RTS_AI = {
  baseSizeAdd:3,
  powerSurplus:50,          /* keep this much spare power in hand */
  powerEmergency:0.75,      /* below 3/4 of demand supplied, power is an emergency */
  creditReserve:1000,       /* RepairThreshhold: never spend the last of the treasury */
  infantryReserve:2000,     /* above this it can afford to spend on infantry freely */
  infantryBaseMult:2,
  attackInterval:3,         /* minutes between attack waves, before difficulty bias */
  attackDelay:5,            /* minutes before the first one */
  ratio:{ refinery:0.16, barracks:0.16, factory:0.10, turret:0.50 },
  limit:{ refinery:4,    barracks:2,    factory:2,    turret:12   },
  /* Check_Raise_Money / Check_Raise_Power / Check_Lower_Power thresholds. */
  brokeMoney:100,           /* below this, raising cash is urgent */
  desperateMoney:2000,      /* ...and worse if there is no income either */
  powerEmergencyGap:40,     /* deficit below which power is an emergency, not a preference */
  powerWaste:150,           /* surplus above which a power plant is dead money */
  /* AI_Raise_Money and AI_Raise_Power sell in a fixed order, least valuable first, each with
     the urgency at which it becomes sellable.

     The ordering is what stops this being self-destruction. Only the turret - static defence,
     no income, no production - goes at LOW, and that turns out to be the most valuable thing
     a poor opponent does: across 3 difficulties x 3 seeds, allowing it took the Recruit AI's
     eight-minute army from 12 to 50 units on one seed and 36 to 48 on another, and changed
     nothing on the rest. A broke AI sitting on two turrets it cannot afford to support is
     better off spending them. Production goes at MEDIUM, the economy only in a real
     emergency, and the yard is on neither list: selling it is not a recovery, it is a
     surrender. */
  sellForMoney:[['turret', 1], ['factory', 2], ['barracks', 2], ['power', 3], ['refinery', 4]],
  sellForPower:[['turret', 1], ['barracks', 2], ['factory', 2], ['refinery', 3]]
};

/* ---------------------------------------------------------------- shroud --
   MAP.CPP Sight_From(). Two flags per cell, and the distinction is the whole feature:

     IsMapped  - this cell has been explored. Once lifted it stays lifted.
     IsVisible - this cell is inside something's sight range RIGHT NOW.

   So the map has three states, not two: black where you have never been, dimmed where you
   have been but are not looking, and clear where you are. Enemy units vanish when they leave
   your sight; enemy buildings you have already seen stay drawn, because they are part of what
   you remember about the map.

   Sight_From caps sight range at ten cells and tests true circular distance, so the revealed
   area is a disc rather than a square. */
var RTS_SIGHT_MAX = 10;
var RTS_SIGHT_BONUS = 2;     /* the rules' `sight` is in world units; this widens the disc */
var RTS_VIS_HZ = 15;         /* the visibility sweep runs on the original's 15 FPS clock */
var RTS_FOG_DIM = 0.45;      /* how far explored-but-unseen ground is darkened */

/* Sight range in TILES for a structure or unit definition. */
function rtsSightTiles(def) {
  return Math.max(3, Math.min(RTS_SIGHT_MAX, Math.round((def.sight || 12) / RTS_TILE) + RTS_SIGHT_BONUS));
}

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
/* Overrun_Square: a tracked vehicle drives over infantry. Approaching one makes them scatter
   (`cellptr->Incoming(0, true)`); actually reaching them kills them. Should_Crush_It refuses
   for HUMAN-controlled vehicles - your own tanks never auto-crush, you have to drive them
   over deliberately - and only within CrushDistance. */
var RTS_CRUSHERS = { tank:1, harvester:1 };
var RTS_CRUSH_DIST = 1.5 * 4;   /* Rule.CrushDistance 0x0180 = 1.5 cells */
var RTS_CRUSH_KILL = 0.9;       /* world units: close enough to actually run them down */
/* Take_Damage: a destroyed vehicle has a 50% chance of throwing out a crew member, who
   starts wounded and runs. Unarmed vehicles produce a technician instead of a soldier. */
var RTS_CREW_CHANCE = 0.5;

/* Armour class per thing, used with weapon.vs above. */
function rtsArmour(e) {
  if (e.type === 'struct') return 'building';
  var d = rtsUnitDef(e.def);
  return (d && d.kind === 'infantry') ? 'infantry' : 'vehicle';
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
var RTS_LOW_POWER_MIN = 0.28;   /* worst-case build-speed multiplier when browned out */
var RTS_BUILD_RADIUS = 9;       /* tiles: how far from an existing structure you may build */

/* Ore regrows and spreads, as it does in the original (RULES.CPP: IsTGrowth, IsTSpread,
   GrowthRate). A field you have worked out slowly comes back, so a long game does not
   grind to a halt on a dead map. */
var RTS_ORE_GROW_EVERY = 6;     /* seconds between growth passes */
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

/* ---------------------------------------------------------- teams (TEAM.CPP) --
   A TeamTypeClass is a COMPOSITION plus a QUARRY. The team recruits until it is at full
   strength, only then moves out, and picks its target by category rather than by "whatever
   is nearest". That is the whole difference between an opponent that sends a blob at your
   closest building and one that sends three buggies after your harvesters while a separate
   group of rocket soldiers goes for your power.

   `priority` is RecruitPriority, and it does two jobs: a team may steal members from a team
   of LOWER priority, and Suspend_Teams disbands everything below a threshold when the base
   is attacked, freeing those units to defend.

   `reinforce` is IsReinforcable. A team that is not reinforceable is never considered under
   strength once it has set out - "this ensures that once the team has started, it won't
   dally to pick up new members". */
var RTS_TEAM_TYPES = [
  { name:'Raiders',  priority:1, reinforce:true,  quarry:'harvester', members:{ buggy:3 } },
  { name:'Skirmish', priority:2, reinforce:true,  quarry:'anything',  members:{ rifle:4, rocket:1 } },
  { name:'Sappers',  priority:3, reinforce:false, quarry:'power',     members:{ rocket:3, rifle:2 } },
  { name:'Assault',  priority:4, reinforce:false, quarry:'buildings', members:{ tank:3, rocket:2 } }
];
var RTS_TEAM_MAX = 6;            /* concurrent teams */
var RTS_SUSPEND_PRIORITY = 3;    /* Rule.SuspendPriority: disband below this when attacked */
var RTS_SUSPEND_DELAY = 40;      /* Rule.SuspendDelay, seconds before a suspended type reforms */
/* Rule.StrayDistance: how far a member may drift from the team centre before it is told to
   regroup, and the radius inside which a new recruit counts as having joined up. */
var RTS_STRAY = 9 * RTS_TILE;

function rtsStructDef(k) { for (var i=0;i<RTS_STRUCTS.length;i++) if (RTS_STRUCTS[i].key===k) return RTS_STRUCTS[i]; return null; }
function rtsUnitDef(k)   { for (var i=0;i<RTS_UNITS.length;i++)   if (RTS_UNITS[i].key===k)   return RTS_UNITS[i];   return null; }
