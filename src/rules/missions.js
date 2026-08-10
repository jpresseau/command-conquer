/* rules/missions.js - infantry behaviour, MISSION.CPP's mission table, and building rules.
   Part of rts.rules, the roster. */

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
  hold:    { retaliate:true,  scatter:false, recruitable:false, noThreat:false, hold:true,  rate:0.13 },
  /* AN AIRCRAFT ON ITS WAY HOME WITH AN EMPTY RACK IS BUSY, in exactly the sense a harvester
     carrying ore is busy. _rtsAirTick sets this order and then OWNS the tick - it returns true,
     so nothing else may steer the hull until it has landed and reloaded.

     It had no entry here at all, so _rtsMission fell through to RTS_MISSION_DEFAULT and reported
     it recruitable. A team could therefore recruit a plane that is physically unable to obey it
     and then wait out its form timeout, and the base-defence recall could count on a unit that
     will not come. Unarmed until it lands, so it cannot retaliate; not a threat for the same
     reason a loaded harvester is not one. */
  rearm:   { retaliate:false, scatter:true,  recruitable:false, noThreat:true,  hold:false, rate:0.13 }
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
/* BDATA.CPP's Raw_Cost(): a building's price MINUS the free unit it ships with.
     if (Type == STRUCT_REFINERY) cost -= UnitTypeClass::As_Reference(UNIT_HARVESTER).Cost;
   It exists to stop exactly one exploit, and refusing to port it left that exploit open here:
   refund half of a price that INCLUDES a free harvester and you are being paid for a harvester
   you keep. Sell a refinery, rebuild it, repeat - a money printer with an extra harvester
   falling out of it each cycle.

   Porting it needed the refinery priced the way the original prices it. RA's PROC is 2000 with
   the 1400 harvester costed INTO that; ours was 1400 for the building with the harvester on
   top, so raw cost came out at zero and the guard measured as a no-op. At 2000 the arithmetic
   is the original's: raw cost 600, refund 300. */
function rtsRawCost(key) {
  var d = rtsStructDef(key);
  if (!d) return 0;
  var free = d.freeUnit ? rtsUnitDef(d.freeUnit) : null;
  return Math.max(0, d.cost - (free ? free.cost : 0));
}
var RTS_SURVIVOR_FRACTION = 0.5;/* Rule.SurvivorFraction, used by How_Many_Survivors */
var RTS_SURVIVOR_ODDS = 0.5;    /* Drop_Debris only rolls some of them out of a wreck */
var RTS_DECON_TIME = 0.35;      /* Mission_Deconstruction: build-up run backwards, this x build */
/* BUILDING.H CountDown: "if the building is destroyed, it won't actually be removed from the
   map until this value reaches zero. This delay is for cosmetic reasons." A structure that
   vanishes on the frame it dies leaves its own explosion hanging in mid-air over bare grass.
   The wreck stays, burning, and only then is taken off the map. */
var RTS_WRECK_TIME = 3.0;

