/* rules/ai.js - RULES.CPP's [AI] section: what the opponent wants to own. Part of rts.rules. */

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

/* MULTIPLE FACTORIES BUILD FASTER, and these are RA's own numbers rather than ours - from
   ClassicProductionQueue@Vehicle in mods/ra/rules/player.yaml:

       BuildTimeSpeedReduction: 100, 75, 60, 50

   Percentages of build TIME for 1, 2, 3 and 4 producing buildings of the type; anything beyond
   the fourth is the fourth. _rtsBuildRate turns them into rate multipliers (100/pct), so four
   war factories build at 2x and the ceiling is the same one the old invented linear rule had -
   it is the curve up to it that is now the game's rather than a guess.

   The one liberty: RA states the table only for the VEHICLE queue and leaves the others on the
   engine default. Applying it to barracks too is deliberate - the opponent's second barracks
   already relied on parallel infantry production, and taking it away re-opens a measured
   failure (28,576 credits it had no line fast enough to spend). Naval yards are not included
   because nothing here builds ships in parallel yet. */
var RTS_BUILD_SPEEDUP = [100, 75, 60, 50];

/* How far a building may sit from the densest point of a side's holdings and still be part of
   THAT base. Recalc_Center needed no such number - a house's buildings were all in one place,
   because nothing could move one. An engineer can, so a side can hold two clusters, and a mean
   taken over both lands between them and describes neither.

   88 world units is 22 tiles, comfortably wider than any base a generated map produces (the
   widest measured spread from the seed building is 14 tiles) and far narrower than the distance
   between the two starts, which is what has to be told apart. See _rtsBaseCentre. */
var RTS_BASE_REACH = 22 * RTS_TILE;
/* ...and how far past the radius still counts as being AT the base, for "is my base under
   attack". Deliberately smaller than the c.r*4 _rtsWhichZone uses to decide whether a point is
   worth reasoning about at all: being somewhere the opponent has an opinion about is not the
   same as being somewhere it should recall its army to. */
var RTS_BASE_SPAN = 2.5;

/* ------------------------------------------------- what a capture is worth (mine, not ported) --
   The original's AI does not use engineers, so there is no table to port here. These are the
   terms of the decision _rtsAIWorthCapturing makes; see core/capturead.js for what each means. */
var RTS_CAP_YARD_WORTH = 2500;   /* the Construction Yard's `cost` is 0 - see _rtsCaptureWorth */
var RTS_CAP_FACTORY_MULT = 1.5;  /* taking a producer takes the line, not just the shell */
/* Below this, the building is worth less than the engineer plus the walk. An engineer is 500,
   so a Power Plant at 300 is a straight loss and a Barracks at 400 is not worth a unit and two
   minutes; a Refinery at 2000 or a War Factory at 1600 plainly is. */
var RTS_CAP_MIN_WORTH = 800;
/* Guns covering the target, past which the engineer does not arrive. Two is already generous
   for a unit with 45 hp and no armour: a single Pillbox kills it in three shots over about a
   second, against the two-and-a-bit seconds it takes to walk the last fifteen units. */
var RTS_CAP_MAX_GUNS = 2;
var RTS_CAP_RECHECK = 20;        /* seconds between re-answering; the walk test is not free */
/* How much distance discounts the prize. At this many world units away a target is worth half
   what it is worth next door - 40 tiles, a little under a third of the map, which is about as
   far as an engineer can walk before the match is decided around it. Not a hard cutoff: a
   Refinery across the map still beats a Barracks next door, which is the right answer. */
var RTS_CAP_WALK_SCALE = 40 * RTS_TILE;

var RTS_AI = {
  baseSizeAdd:3,
  powerSurplus:50,          /* keep this much spare power in hand */
  powerEmergency:0.75,      /* below 3/4 of demand supplied, power is an emergency */
  creditReserve:1000,       /* RepairThreshhold: never spend the last of the treasury */
  infantryReserve:2000,     /* above this it can afford to spend on infantry freely */
  /* `attackInterval`, `attackDelay` and `infantryBaseMult` used to sit here and were read by
     nobody. Worse than dead: the wave timing that IS used lives in src/rules/factions.js as
     RTS_WAVE_EVERY (85 seconds) and RTS_WAVE_FIRST (150), so these two said "3 minutes" and
     "5 minutes" in a different file with different values, and anybody tuning how often the
     opponent attacks would have edited them and watched nothing happen. Deleted rather than
     wired up: adding a second source of truth with a third set of numbers is not a fix.
     test/unit/rules now fails on any key here that nothing reads. */
  /* The superweapon ratios are the lowest here on purpose. They are the last thing a base
     should want: 1500-1750 credits and up to -200 power buys nothing you can shoot with for
     five minutes, so an opponent that reaches for one early has spent its army on a promise.
     At these weights it builds one only once the rest of the plan is satisfied, which in
     practice means a long game - exactly when a superweapon is the interesting move. */
  /* Air, and the answer to air. Both armies' entries are listed together and _rtsCanQueue drops
     whichever belong to the other one, exactly as the defensive block already does - so the same
     plan gives an Allied opponent a Helipad and a Soviet one an Airfield. The pad ratio is low:
     one field is enough to keep a flight in the air, and a second buys production speed rather
     than reach. The AA ratio is deliberately HIGHER than the pad's, because an opponent that
     flies but cannot be flown against is a worse opponent to play. */
  ratio:{ refinery:0.16, barracks:0.16, factory:0.10, radar:0.06, lab:0.05, depot:0.05,
          apower:0.08, kennel:0.04, silo:0.14, pillbox:0.18, flametower:0.12, turret:0.24, rocketpit:0.12,
  /* THE SOVIET HEAVY DEFENCE, and it was in buildOrder with no entry in either of these tables -
     so `want` came out NaN, every comparison against it was false, and the opponent skipped it
     for ever. Measured before the fix, hard, three seeds, 420s: the Soviet house finished with
     6.7 defensive buildings and ZERO Tesla Coils, against 10.0 for the Allied house.

     Not turret's 0.24/6. A Coil is 1500 credits and -100 power against a Gun Turret's 500 and
     -20, so six of them is 9000 credits and 600 power - it is the premium piece, not the line
     defence, and the flame tower is what fills the wall. */
          tesla:0.10,
          helipad:0.06, afld:0.06, aagun:0.10,
  /* One shipyard. A second buys nothing but a second production line for a domain
     the opponent uses to raid a coast, and the ratio has to stay small or a map
     with a long shoreline turns the whole base plan maritime. */
          navalyard:0.05, subpen:0.05,
          mslo:0.02, iron:0.02, pdox:0.02, gps:0.02 },
  limit:{ refinery:4,    barracks:2,    factory:2,    radar:1,    lab:1,    depot:1,
  /* The silo limit is high on purpose and is the one number here that was MEASURED rather
     than guessed. At 6 the opponent filled its 17,000 of storage on `normal` and then threw
     away 17,000 more credits over seven minutes - it has the income to overflow and not the
     production lines to spend it down, so a low ceiling turns the storage cap into a straight
     nerf and hands the player about 16 extra seconds of life. RA has no silo limit at all. */
          apower:2,    kennel:1,    silo:14,   pillbox:4,     flametower:3,     turret:6,     rocketpit:4,
          tesla:3,
          helipad:2,   afld:2,      aagun:3,
          navalyard:1, subpen:1,
  /* One each. A second silo would not charge a second missile - the timer is per house - so
     building one is pure waste, and the limit says so rather than relying on the ratio. */
          mslo:1,      iron:1,      pdox:1,    gps:1 },
  /* HOUSE.CPP AI_Building checks Tiberium against Capacity before it checks anything else:
     an overflowing house builds a silo NEXT, whatever else the base plan wanted. Without this
     the storage cap is a pure nerf to the opponent - it loses the income and never buys the
     fix. Expressed as the fraction of capacity at which a silo jumps the queue. */
  siloUrgent:0.8,
  /* Hulls per shipyard. A yard is not consumed by a ship the way a pad is by an aircraft,
     so this is the ceiling that stops a rich opponent turning its whole surplus into a
     navy the player may not be contesting at all. */
  fleetPerYard:5,
  /* Landing craft, total. ONE, because one Landing team may exist at a time and it wants one
     craft: a second is an unarmed 700-credit hull with nothing to carry. Kept apart from
     fleetPerYard because that number is about how big a navy is worth having and this one is
     about how many boats a plan needs. */
  craftCap:1,
  /* Engineers, total, for the same reason and with a sharper edge: an engineer is spent on
     arrival, so unlike a hull it is never reusable and a second one is only ever a second
     500-credit unit standing in the open. One Snatch team wants one engineer; anything past
     that is the waste the gate exists to prevent. */
  engCap:1,
  /* The order _rtsAIWants walks. Economy, then production, then tech, then defence - tech
     before defence because a Tech Center that arrives after the match is decided is worth
     nothing, and the defensive ratios are big enough to soak every spare credit otherwise.
     The pillbox comes first among the defences because it is the one the AI can afford early;
     `wall` is deliberately absent, since an AI that cannot plan a line just scatters concrete. */
  /* Both armies' defences are listed. _rtsCanQueue drops whichever belong to the other one, so
     the same plan serves either side and the opponent builds a Tesla wall or a Pillbox line
     depending on which army it ended up with. */
  /* Superweapons last, after every defence. A base that answers an attack with a Chronosphere
     instead of a pillbox loses the base. */
  /* The pads sit after the ground production and before the defensive tail: an opponent that
     buys an airfield before a war factory has no army to protect it, and one that buys it after
     four turrets never gets there at all. The AA gun goes IN the defensive tail, beside the
     turrets it stands next to. */
  buildOrder:['refinery', 'barracks', 'silo', 'factory', 'radar', 'apower', 'depot', 'lab', 'kennel',
              'helipad', 'afld', 'navalyard', 'subpen',
              'pillbox', 'flametower', 'turret', 'rocketpit', 'tesla', 'aagun',
              'mslo', 'iron', 'pdox', 'gps'],

  /* WHICH RUNG EACH BUILDING BELONGS TO. The order above says what to build first; this says
     who gets to build it at all, and it exists because the gate it replaces was all-or-nothing.

     _rtsAIWants used to hand the whole list to IQ 5 and the two-item list ['refinery','barracks']
     to anything lower. The difficulties are IQ 2 / 3 / 5, so EVERYTHING from the war factory
     onward - the tech tree, both shipyards, the airfield, every defence and all four
     superweapons - was Commando-only. Measured at 600s with the player kept alive on seed 9001,
     the opponent's distinct structure types were: Recruit 7, Soldier 7, Commando 16. The first
     two are the six it starts with plus a silo. Recruit and Soldier built THE SAME SEVEN THINGS
     for ten minutes; Soldier just built more copies of them.

     So the rungs are per building now, and adding one means deciding its rung once:

       3  everything through the defensive tail. Soldier is meant to be "an even fight - the
          enemy expands and repairs", and an opponent with no radar, no factory and no defences
          is not that.
       5  the superweapons, which stay the Commando distinction.

     Recruit keeps an EMPTY order deliberately - refinery and barracks are listed at 3, not 2 -
     because that rung is unchanged by this and its ladder position was already measured. */
  buildIQ:{ mslo:5, iron:5, pdox:5, gps:5 },
  buildIQDefault:3,
  /* What to spend a production run on. A table rather than an if-chain: adding a unit to
     RTS_UNITS should not mean editing the opponent's brain, and the hardcoded ladder that used
     to live in _rtsAIUnits is a large part of why the roster sat at five units. Gating is left
     to _rtsCanQueue, which already checks `needs`.

     `at` is the bank balance that justifies the purchase; `w` is how often to pick it among
     everything affordable. The weights matter more than they look: a strict best-first walk is
     DEGENERATE - whichever entry sits at the top is the only one ever built. Measured, that
     produced 461 grenadiers against 14 rocket soldiers in eight minutes, which is to say the
     opponent quietly stopped fielding anti-armour infantry altogether. Weighted choice keeps a
     combined-arms army, which is the point of having a roster at all. */
  mix:{
    vehicle:[ { key:'heavy', at:2600, w:3 }, { key:'arty',  at:2000, w:2 }, { key:'v2rl', at:2000, w:2 },
              { key:'tank', at:1600, w:4 },
              { key:'light', at:1100, w:3 }, { key:'buggy', at:900,  w:2 } ],
    /* No thief in the mix, and no Commando - both are decisions about a specific building at
       a specific moment, and an AI that buys them without a plan just donates the credits to
       whatever shoots them first (the Commando also has her `only` cap). The dog IS in: it
       needs no plan, it just runs at infantry.

       THE ENGINEER IS IN NOW, AND CONDITIONALLY, exactly as the landing craft is. This block
       used to say there was none, in two separate paragraphs saying the same thing, and the
       reason given was the true one: there was nothing that made the decision. There is now.
       _rtsAIProduce refuses this key unless _rtsAIWorthCapturing() has found a player building
       actually worth taking and actually reachable on foot, and caps it at `engCap`.

       `at` IS 2200 AND THAT NUMBER IS LOAD-BEARING, unlike every other `at` on this line.
       _rtsAIUnits only runs at all when the bank is above _rtsAISpare, whose floor is
       infantryReserve = 2000 - so 1200/900/500/400/250 below are compared against a balance
       guaranteed to be larger and can never skip anything. They are dead thresholds that read
       as live ones. This one is above the floor deliberately: an engineer is 500 credits that
       buys no army, and an opponent that cannot also afford to keep fighting should not be
       making that trade. Weight 2 rather than 4: unlike the craft, whose team is waiting on it
       and can do nothing else, a capture is opportunistic and the tanks are never wasted. */
    /* SHIPS, once there is a yard to build them at - _rtsCanQueue gates on `needs`, so these
       are inert until one exists. Both armies are listed and _rtsCanQueue drops whichever
       belong to the other, exactly as the defensive block and the aircraft block already do.
       The thresholds are high because a hull is worth two tanks and the opponent should not
       be buying a destroyer while its land army is still five units.

       THE TRANSPORT IS IN NOW, AND CONDITIONALLY. This entry used to say there was none, for
       the same reason there is no engineer in the vehicle mix: a landing craft is a decision
       about a specific crossing, and there was nothing that made that decision - an opponent
       buying one would field an unarmed hull that loaded nothing and ferried no-one. There is
       something now. _rtsAIProduce refuses this key unless _rtsAIWorthCrossing() says the water
       is worth crossing, and caps it at `craftCap` - the one a Landing team needs. It is the
       only entry in any mix that is asked about rather than simply rolled, and that asymmetry
       is the point: every other hull is worth something the moment it floats.

       Weight 4 rather than 1 because the gate has already decided it is wanted; once a
       crossing is on, the craft is the thing the whole team is waiting for. */
    ship:[ { key:'destroyer', at:2600, w:3 }, { key:'missilesub', at:2800, w:2 },
           { key:'sub', at:1800, w:3 }, { key:'gunboat', at:1100, w:3 },
           { key:'lst', at:1400, w:4 },
           /* The Cruiser is the dearest hull in the game and gated behind the Tech Center on
              top of a yard, so _rtsCanQueue keeps it inert for most of a match without needing
              a rule here. Weight 2: it is a siege piece rather than a fleet, and an opponent
              that spent its whole navy budget on one 2,000-credit hull would own the coastline
              and lose the water. */
           { key:'cruiser', at:3200, w:2 } ],
    infantry:[ { key:'flame', at:1200, w:2 }, { key:'grenadier', at:900, w:2 },
               { key:'rocket', at:500, w:3 }, { key:'dog', at:400, w:2 },
               { key:'rifle', at:250, w:2 }, { key:'engineer', at:2200, w:2 } ],
    /* AIRCRAFT, once there is a pad to fly from - _rtsCanQueue gates on `needs`, so these are
       inert until one exists and there is no separate check to keep in step. Both armies again;
       the Attack Heli was buildable by the player from the day it shipped and the opponent never
       once bought one, because this table had no `air` line at all. The bank thresholds are high
       so a poor AI still buys tanks: an aircraft that dies with no pad to return to is the most
       expensive way to lose 1400 credits in this game. */
    air:[ { key:'heli', at:2400, w:3 }, { key:'mig', at:2600, w:3 }, { key:'yak', at:1800, w:2 } ]
  },
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
  /* AI_Raise_Money's list, each entry with the urgency at which it becomes sellable. The last
     two rungs were UNREACHABLE: `u.raiseMoney` starts at NONE, rises to LOW when the house is
     broke and increments once more when it is desperate AND cannot earn - so it tops out at
     MEDIUM, and a house could never sell a power plant or a refinery however hopeless it got.
     Two of five entries in a table that reads as a rule. The urgency ladder is what was wrong,
     not the rungs: see _rtsAIUrgency, where a house with nothing left to earn WITH now
     escalates. Selling the refinery is not self-defeating at that point - _rtsAICanEarn is
     already false, so it is cashing out a building that has stopped paying. */
  sellForMoney:[['turret', 1], ['factory', 2], ['barracks', 2], ['power', 3], ['refinery', 4]],
  sellForPower:[['turret', 1], ['barracks', 2], ['factory', 2], ['refinery', 3]]
};

