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

var RTS_AI = {
  baseSizeAdd:3,
  powerSurplus:50,          /* keep this much spare power in hand */
  powerEmergency:0.75,      /* below 3/4 of demand supplied, power is an emergency */
  creditReserve:1000,       /* RepairThreshhold: never spend the last of the treasury */
  infantryReserve:2000,     /* above this it can afford to spend on infantry freely */
  infantryBaseMult:2,
  attackInterval:3,         /* minutes between attack waves, before difficulty bias */
  attackDelay:5,            /* minutes before the first one */
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
          helipad:0.06, afld:0.06, aagun:0.10,
          mslo:0.02, iron:0.02, pdox:0.02, gps:0.02 },
  limit:{ refinery:4,    barracks:2,    factory:2,    radar:1,    lab:1,    depot:1,
  /* The silo limit is high on purpose and is the one number here that was MEASURED rather
     than guessed. At 6 the opponent filled its 17,000 of storage on `normal` and then threw
     away 17,000 more credits over seven minutes - it has the income to overflow and not the
     production lines to spend it down, so a low ceiling turns the storage cap into a straight
     nerf and hands the player about 16 extra seconds of life. RA has no silo limit at all. */
          apower:2,    kennel:1,    silo:14,   pillbox:4,     flametower:3,     turret:6,     rocketpit:4,
          helipad:2,   afld:2,      aagun:3,
  /* One each. A second silo would not charge a second missile - the timer is per house - so
     building one is pure waste, and the limit says so rather than relying on the ratio. */
          mslo:1,      iron:1,      pdox:1,    gps:1 },
  /* HOUSE.CPP AI_Building checks Tiberium against Capacity before it checks anything else:
     an overflowing house builds a silo NEXT, whatever else the base plan wanted. Without this
     the storage cap is a pure nerf to the opponent - it loses the income and never buys the
     fix. Expressed as the fraction of capacity at which a silo jumps the queue. */
  siloUrgent:0.8,
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
              'helipad', 'afld',
              'pillbox', 'flametower', 'turret', 'rocketpit', 'tesla', 'aagun',
              'mslo', 'iron', 'pdox', 'gps'],
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
    vehicle:[ { key:'heavy', at:2600, w:3 }, { key:'arty',  at:2000, w:2 }, { key:'tank', at:1600, w:4 },
              { key:'light', at:1100, w:3 }, { key:'buggy', at:900,  w:2 } ],
    /* No engineer in the mix. Capturing is a decision about a specific building at a specific
       moment, and an AI that buys engineers without a plan for them just donates 600 credits
       to whatever shoots them first. Buildable by the player; not spammed by the opponent. */
    /* No engineer and no thief in the mix. Both are decisions about a specific building at a
       specific moment, and an AI that buys them without a plan just donates the credits to
       whatever shoots them first. The Commando is out for the same reason plus her `only` cap.
       The dog IS in: it needs no plan, it just runs at infantry. */
    infantry:[ { key:'flame', at:1200, w:2 }, { key:'grenadier', at:900, w:2 },
               { key:'rocket', at:500, w:3 }, { key:'dog', at:400, w:2 },
               { key:'rifle', at:250, w:2 } ],
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
  sellForMoney:[['turret', 1], ['factory', 2], ['barracks', 2], ['power', 3], ['refinery', 4]],
  sellForPower:[['turret', 1], ['barracks', 2], ['factory', 2], ['refinery', 3]]
};

