/* rules/balance.js - the numbers a match is balanced on: blast falloff, economy, the
   difficulty ladder and IQ. Part of rts.rules, the roster. */

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
            desc:'The enemy attacks late, builds little and hits softly.' },
  normal: { name:'Soldier',  iq:3, fire:1,    speed:1,    armor:1,   rof:1,    cost:1,   build:1,   wall:true,  scan:false,
            desc:'An even fight. The enemy expands and repairs.' },
  hard:   { name:'Commando', iq:5, fire:1.15, speed:1.1,  armor:1.2, rof:0.85, cost:0.8, build:0.7, wall:true,  scan:true,
            desc:'The enemy builds a real base, defends it and comes early.' }
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
  /* NO DIFFICULTY IS IQ 4. The rungs are 2 / 3 / 5, so a gate at 4 is Commando-only however it
     reads, and the next person to add a difficulty at 4 would get a surprise. Moved to 5, which
     is a no-op for every difficulty that exists and says what is actually true. Asserted in
     test/unit/scenario: every gate here has to be one some difficulty can land on. */
  guardArea:5,      /* leaves a garrison at home instead of sending everything */
  /* The rung at which the opponent walks a real build order at all. Everything on it is then
     gated per building by RTS_AI.buildIQ. */
  expandBase:3,
  refill:3,         /* restarts a production line the instant it frees */
  production:5,     /* full build order and base expansion */
  /* Firing a superweapon is its own ability, separate from being able to BUILD one, because
     the two fail differently: a low-IQ house that builds a missile silo and never fires it is
     wasting 1750 credits, which is a perfectly good way for a weak opponent to be weak.

     THIS USED TO BE 3, AND THE REASONING WAS ALREADY DEFEATED WHEN IT WAS WRITTEN. The note
     said a gate of 4 would have meant only Commando ever fired one, and that a feature two
     thirds of players never see from the receiving end is a dead branch rather than a
     difficulty distinction. Both true - but `mslo` sits twentieth in the build order, which
     needed IQ 5, so Soldier could FIRE a superweapon it was never able to BUILD. The branch
     was dead anyway, by the other gate, and nothing said so.

     Now the two agree: the superweapons are listed at IQ 5 in RTS_AI.buildIQ and firing one is
     gated at 5 to match. They are the Commando distinction, on purpose and in one place. */
  superweapon:5
};

