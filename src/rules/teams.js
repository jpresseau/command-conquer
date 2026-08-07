/* rules/teams.js - TEAM.CPP team types and TEAMTYPE.CPP's mission list. Part of rts.rules. */

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
/* --------------------------------------------------- the mission list (TEAMTYPE.CPP) --
   A TeamTypeClass does not carry one standing order. It carries `MissionList[]` - an ordered
   script of team missions, each with one argument - and the team walks an index down it. That
   is the difference between "gather, then beeline at the nearest thing of the right kind" and
   an opponent that stages, takes a flanking route, hits the power plants, and loops.

   TeamMission_Needs is the table that says what argument each mission takes; it is quoted
   here because it is what makes the list parseable at all. The `need` values map straight
   onto the original's NeedType:

     waypoint  NEED_WAYPOINT    a named place on the map
     quarry    NEED_QUARRY      a target CATEGORY, the same QuarryType the team already uses
     number    NEED_NUMBER      a plain count (guard time in 1/10th minutes, or a line number)
     none      NEED_NONE

   Missions deliberately NOT ported, because the subsystems they drive do not exist here:
   FORMATION (no formations), UNLOAD/LOAD/DEPLOY (no transports, nothing deploys), SET_GLOBAL
   (no scenario globals - that is TRIGGER.CPP's world), SPY, HOUND_DOG (follow friendlies),
   DO (assign a raw unit mission), MOVECELL (a raw cell number, which is the thing waypoints
   exist to avoid). Stubs for those would be inventing behaviour, not porting it.
   ATTACKTARCOM is in, because Took_Damage already gives a team a "current target". */
var RTS_TMISSIONS = {
  move:     { need:'waypoint' },  /* TMISSION_MOVE       - go to the waypoint, then advance */
  patrol:   { need:'waypoint' },  /* TMISSION_PATROL     - as move, but engaging on the way */
  attwaypt: { need:'waypoint' },  /* TMISSION_ATT_WAYPT  - clear out whatever is at the waypoint */
  attack:   { need:'quarry'   },  /* TMISSION_ATTACK     - hunt this category of target */
  tarcom:   { need:'none'     },  /* TMISSION_ATTACKTARCOM - kill whatever the team is fixed on */
  guard:    { need:'number'   },  /* TMISSION_GUARD      - hold station, argument in 1/10th min */
  loop:     { need:'number'   }   /* TMISSION_LOOP       - jump to this line of the list */
};
/* "Guard area (1/10th min)..." - the editor's own label for that argument's unit. */
var RTS_GUARD_TICK = 6;          /* seconds per unit of a GUARD mission's argument */
var RTS_WAYPT_ARRIVE = 5 * RTS_TILE;   /* how close counts as having reached a waypoint */

/* `max` is MaxAllowed, and it is per TYPE. Without it the random pick in Suggested_New_Team
   is free to raise six Assault teams and nothing else - both a weaker army and a duller
   opponent than one fielding a mix.

   `autocreate` is IsAutocreate, and the original's filter is a hard SPLIT, not a preference:
   an alerted house draws only from autocreate types, an unalerted house only from the rest.
   So these two lists are the opponent's early game and its late game. A house here is alerted
   once its base has been hit or once RTS_ALERT_TIME has passed - the timer matters, because a
   pure "has been attacked" test would mean a player who never attacks never sees a tank.

   `suicide` is IsSuicide, "charge toward target ignoring distractions": the team will not be
   pulled onto whatever last shot it, and will not stop to let stragglers catch up. */
var RTS_TEAM_TYPES = [
  /* --- before the alert: harassment. Cheap, fast, aimed at the economy. --- */
  { name:'Raiders',  priority:1, reinforce:true,  quarry:'harvester', members:{ buggy:3 },
    max:2, autocreate:false, suicide:false,
    /* Round the outside and come in on the ore, not up the middle into the guns. The list
       ENDS on something decisive: a script whose every step is conditional on a harvester
       existing leaves three buggies looping round an empty ore field forever, which is
       exactly how the first version of this made the opponent weaker rather than smarter. */
    missions:[ ['patrol','flank'], ['attack','harvester'], ['attwaypt','ore'],
               ['attack','buildings'], ['loop',0] ] },
  { name:'Skirmish', priority:2, reinforce:true,  quarry:'anything',  members:{ rifle:4, rocket:1 },
    max:2, autocreate:false, suicide:false,
    missions:[ ['patrol','mid'], ['attack','anything'], ['loop',0] ] },
  /* --- after the alert: the real attack. --- */
  { name:'Sappers',  priority:3, reinforce:false, quarry:'power',     members:{ rocket:3, rifle:2 },
    max:2, autocreate:true,  suicide:false,
    /* Stage off the flank first so the sappers do not walk in through the turrets. */
    missions:[ ['patrol','flank'], ['attack','power'], ['attack','factories'],
               ['attack','buildings'], ['tarcom',0] ] },
  { name:'Assault',  priority:4, reinforce:false, quarry:'buildings', members:{ tank:3, rocket:2 },
    max:2, autocreate:true,  suicide:true,
    /* Straight down the throat and never mind what shoots back. No staging pause and no
       silent approach march: an opening GUARD plus a plain MOVE leg had the heaviest team
       in the game spending its first half-minute not fighting. */
    missions:[ ['patrol','front'], ['attack','buildings'], ['loop',1] ] }
];
var RTS_ALERT_TIME = 150;        /* backstop only: the first attack wave normally alerts the house */

/* ------------------------------------------------- committing the army (mine, not ported) --
   RTS_TEAM_MAX and the per-type `max` are a FLOOR, not a ceiling. A fixed cap on concurrent
   teams means the fraction of the army actually committed collapses as the opponent gets
   richer, and that is precisely what was measured on hard once production was uncapped:

       min 3   army 100   in teams 18   18% committed   82 idle at home
       min 6   army 186   in teams 20   11% committed  165 idle at home

   Four teams, permanently - Sappers x2 and Assault x2, every type pinned at max 2 - so
   Suggested_New_Team returned null on 45 of 51 calls. The opponent's entire offensive
   capacity was 20 units regardless of how large its army grew.

   RA does not hit this because MaxAllowed is authored per scenario against a known army size,
   and because a campaign house also attacks outside the team system. There is no author here,
   so the cap has to derive from the army instead: commit roughly RTS_TEAM_COMMIT of it, in
   teams of about RTS_TEAM_TYPICAL, and never fewer than the authored floor. The hard ceiling
   exists so a runaway economy cannot spawn unbounded teams. */
var RTS_TEAM_MAX = 6;            /* floor: concurrent teams when the army is small */
var RTS_TEAM_MAX_HARD = 22;      /* ceiling: never raise more than this many at once */
var RTS_TEAM_COMMIT = 0.62;      /* share of the field army that should be on the attack */
var RTS_TEAM_TYPICAL = 5;        /* typical team size, for turning that share into a count */
var RTS_SUSPEND_PRIORITY = 3;    /* Rule.SuspendPriority: disband below this when attacked */
var RTS_SUSPEND_DELAY = 40;      /* Rule.SuspendDelay, seconds before a suspended type reforms */
/* Rule.StrayDistance: how far a member may drift from the team centre before it is told to
   regroup, and the radius inside which a new recruit counts as having joined up. */
var RTS_STRAY = 9 * RTS_TILE;

function rtsStructDef(k) { for (var i=0;i<RTS_STRUCTS.length;i++) if (RTS_STRUCTS[i].key===k) return RTS_STRUCTS[i]; return null; }
function rtsUnitDef(k)   { for (var i=0;i<RTS_UNITS.length;i++)   if (RTS_UNITS[i].key===k)   return RTS_UNITS[i];   return null; }

