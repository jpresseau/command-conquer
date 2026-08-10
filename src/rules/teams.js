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

   LOAD AND UNLOAD ARE IN NOW, and what this list used to say is worth keeping: "UNLOAD/LOAD/
   DEPLOY (no transports, nothing deploys)". There are transports - the APC always was one, and
   the landing craft is one - so the stated reason had quietly stopped being true, and with it
   the only thing keeping the opponent on its own side of the water.

   Missions still deliberately NOT ported, because the subsystems they drive do not exist here:
   FORMATION (no formations), DEPLOY (a TEAM deploying an MCV - the unit deploys itself, no team
   drives it), SET_GLOBAL (no scenario globals - that is TRIGGER.CPP's world), SPY, HOUND_DOG
   (follow friendlies), DO (assign a raw unit mission), MOVECELL (a raw cell number, which is
   the thing waypoints exist to avoid). Stubs for those would be inventing behaviour, not
   porting it. ATTACKTARCOM is in, because Took_Damage already gives a team a "current
   target". */
var RTS_TMISSIONS = {
  move:     { need:'waypoint' },  /* TMISSION_MOVE       - go to the waypoint, then advance */
  patrol:   { need:'waypoint' },  /* TMISSION_PATROL     - as move, but engaging on the way */
  attwaypt: { need:'waypoint' },  /* TMISSION_ATT_WAYPT  - clear out whatever is at the waypoint */
  attack:   { need:'quarry'   },  /* TMISSION_ATTACK     - hunt this category of target */
  tarcom:   { need:'none'     },  /* TMISSION_ATTACKTARCOM - kill whatever the team is fixed on */
  guard:    { need:'number'   },  /* TMISSION_GUARD      - hold station, argument in 1/10th min */
  loop:     { need:'number'   },  /* TMISSION_LOOP       - jump to this line of the list */
  load:     { need:'none'     },  /* TMISSION_LOAD       - everyone who can, boards the transport */
  unload:   { need:'none'     },  /* TMISSION_UNLOAD     - the transport lands what it is carrying */
  capture:  { need:'none'     }   /* TMISSION_CAPTURE    - the engineer walks in and takes it */
};
/* How long a LOAD leg may take before the team gives up on it. Generous, because the walk to
   the water is a real march and the craft may still be coming; bounded, because a squad that
   cannot reach the beach must not hold a team slot for the rest of the match. */
var RTS_LOAD_TIMEOUT = 90;
var RTS_UNLOAD_TIMEOUT = 120;    /* and the crossing itself, which is longer */
/* A capture leg is a walk across the map by the slowest thing on it, so this is generous - but
   it is the ONLY thing that ends the leg unsuccessfully, because a capture cannot be detected
   by the .dead test every other leg completes on. See the TMISSION_CAPTURE branch. */
var RTS_CAPTURE_TIMEOUT = 150;
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
    missions:[ ['patrol','front'], ['attack','buildings'], ['loop',1] ] },
  /* --- and at sea. One per army, because a team only marches at FULL STRENGTH and a house
     can only build its own side's hulls: a single mixed type listing all four would leave a
     Soviet flotilla waiting forever for a Gunboat it cannot build. `sea` is the waypoint,
     which _rtsBuildWaypoints derives as open water off the target's coast - a land waypoint
     would have the fleet steering at a beach it cannot reach.

     Quarry is `buildings`: what a navy is FOR here is reaching the coastal half of a base
     that the land army has to cross the map to touch. Not reinforceable, because a hull that
     goes back for a friend is a hull not shooting. */
  { name:'Flotilla', priority:3, reinforce:false, quarry:'buildings',
    members:{ gunboat:2, destroyer:1 },
    max:1, autocreate:true, suicide:false,
    missions:[ ['patrol','sea'], ['attack','buildings'], ['tarcom',0] ] },
  { name:'Wolfpack', priority:3, reinforce:false, quarry:'buildings',
    members:{ sub:2, missilesub:1 },
    max:1, autocreate:true, suicide:false,
    missions:[ ['patrol','sea'], ['attack','buildings'], ['tarcom',0] ] },
  /* THE SIEGE PAIR, and the reason the Cruiser is not simply another entry in the Flotilla.
     _rtsAIUnits rolls the ship mix without asking any team whether it wants the hull, so a
     type nothing lists is a type the opponent buys at 2,000 credits and then never sails
     anywhere - it would sit at the yard until the base was attacked. Every hull in a mix
     needs a type that fields it.

     A separate type rather than `cruiser:1` added to the Flotilla, because a team only
     marches at FULL STRENGTH: folding it in would ground the Gunboats until a Tech Center
     existed, and the Allied navy would stop leaving harbour for the first half of the match.
     Kept out of the Flotilla, the two coexist - the escort fleet from the moment there is a
     yard, this once there is a lab. `_rtsCanProduce` gates candidacy on every member, so the
     type is simply not a candidate before then, and never is for the Soviets.

     The Destroyer is not decoration. The Cruiser carries no sonar and its reach is worth
     nothing at knife range, so a submarine that closes on an unescorted one kills it - e2e/navy
     measures exactly that. Sending it out alone would be spending the dearest hull in the game
     on a gift, and it is what the unit's own description tells the player not to do. */
  { name:'Bombard',  priority:3, reinforce:false, quarry:'buildings',
    members:{ cruiser:1, destroyer:1 },
    max:1, autocreate:true, suicide:false,
    missions:[ ['patrol','sea'], ['attack','buildings'], ['tarcom',0] ] },
  /* --- AND ACROSS IT. The one team that uses the water to deliver an ARMY rather than to
     fight on it, and the only one whose composition mixes the two domains.

     `crossing` is the gate, and it is what stops this being the engineer-in-the-mix mistake:
     a landing party is a decision about a specific piece of GROUND, and raising one on a map
     where the tanks could simply drive there is 700 credits and five units spent to arrive
     later than walking. _rtsAIWorthCrossing answers that question - see it for what "worth"
     means - and a type carrying this flag is not a candidate until it says yes.

     The script is four lines and every one of them is a verb the player has: board the craft,
     land on the far shore, attack what is there, then stay on whatever the team got fixed on.
     There is deliberately no MOVE leg between LOAD and UNLOAD - _rtsOrderUnloadAt already
     sails to the water nearest the place it is aimed at, so a separate waypoint would be a
     second, worse answer to a question the unload already asks.

     Both armies can crew it: the craft is faction-neutral and so are the Rifle Squad and the
     Battle Tank, which is why this is one type where the Flotilla and the Wolfpack are two. */
  { name:'Landing',  priority:3, reinforce:false, quarry:'buildings',
    members:{ lst:1, tank:2, rifle:2 },
    max:1, autocreate:true, suicide:false, crossing:true,
    missions:[ ['load',0], ['unload',0], ['attack','buildings'], ['tarcom',0] ] },
  /* --- AND THE ONE TEAM THAT GOES TO TAKE A BUILDING RATHER THAN TO BREAK IT. ---
     `capture:true` is the gate, the same shape as Landing's `crossing`: _rtsAIWorthCapturing
     must have found a player building actually worth taking and actually walkable-to, and it
     hands over the building it found, so the purchase and the walk can never disagree.

     `suicide:true` IS LOAD-BEARING and is not bravado. It buys two exemptions this team needs
     and would otherwise have to special-case by name:

       the lag rule, which holds a team while its stragglers catch up. An engineer walking the
       last stretch into the player's base while the escort fights at the perimeter is exactly
       the geometry that rule reads as "spread out and waiting", and being held is the one
       thing that stops a capture happening. The amphibious legs already needed the same
       exemption and got it as a hardcoded leg-name test; this one gets it from the roster,
       which is where the original put it.

       Took_Damage's retarget, which swaps a team's target for whoever just shot it. Every
       building worth capturing is unarmed, so the guard that protects a team already fighting
       something dangerous does not fire, and the first stray bullet would otherwise replace
       the Refinery with a rifle squad.

     `reinforce:false` because the engineer DIES ON SUCCESS - it is spent on arrival - and a
     reinforcing team reads that as dropping under strength, stops, and never runs the rest of
     its script. The team's job is over at that point; the escort should be attacking.

     ONE TANK AND ONE RIFLEMAN, not two of each, and that is a measured number rather than a
     taste. The escort cannot screen the engineer at all - at 500 credits it is the most
     valuable infantry target on the field, so every gun shoots it first whatever stands beside
     it - and all an escort can really do is kill a pillbox on the way in. What the escort
     definitely does is cost tempo: every member is a unit not in an Assault team, for the whole
     length of a walk that is most of the map.

     Traced on seed 7 at normal: the engineer set out at t162 and was still seven tiles short of
     the player's Command Yard at t218, when the match ended - because the opponent's own tanks
     had finished the yard off first. It walked the entire way without stalling; it simply lost
     the race. A five-unit team spent 56 seconds achieving nothing while the war was won without
     it, and an idle player survived 3-5% longer for exactly that reason. Three units is the
     smallest party that still has something to shoot with. */
  { name:'Snatch',   priority:3, reinforce:false, quarry:'buildings',
    members:{ engineer:1, tank:1, rifle:1 },
    max:1, autocreate:true, suicide:true, capture:true,
    missions:[ ['capture',0], ['attack','buildings'], ['tarcom',0] ] }
];
/* How much longer the land route has to be than the straight line before sailing is worth it.
   1.0 would mean "any water at all"; this is "the road goes a long way round". Measured
   against the alternative rather than chosen: see _rtsAIWorthCrossing. */
var RTS_AI_DETOUR = 1.7;
var RTS_AI_CROSS_RECHECK = 30;   /* seconds between re-answering the question - _rtsPath is not free */
/* How long a team may spend trying to reach full strength before it is written off. A team
   that never fills never marches - it holds a slot against the concurrent-team cap AND holds
   its recruits out of the war, since a unit with a squad is not `spare` to anything else. That
   was unreachable while every composition was built from units the opponent produces
   constantly; it stopped being unreachable with two compositions whose key member is bought
   only while a gate is open, because the gate can shut between raising the team and filling
   it. Generous enough that a slow build queue is not a write-off. */
var RTS_TEAM_FORM_TIMEOUT = 120;
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
/* Rule.SuspendPriority: when the base is hit, teams BELOW this are disbanded so their members
   can defend. It was 3, and the authored priorities are Raiders 1, Skirmish 2, Sappers 3,
   Assault 4 - so it could only ever free Raiders and Skirmish, and those two stop being raised
   the moment the war proper starts.

   Measured under a real raid, seed 9001, hard, six tanks sent into an undefended Refinery at
   240s: _rtsBaseIsAttacked fired 80 times, _rtsSuspendTeams was called 5 times, and it
   disbanded ZERO teams. The field held {priority 3: 4, priority 4: 4} throughout and 39 of the
   opponent's units stayed away from a base being taken apart, because _rtsBaseIsAttacked skips
   anything that is not `recruitable` and a team's members are not - which is the whole reason
   Suspend_Teams exists.

   4 frees the raiding teams - Sappers, Flotilla, Wolfpack - and deliberately not Assault: the
   main push is not cancelled because somebody poked a refinery, which is both the reference's
   intent and what stops a player farming the 40-second reform delay with one cheap unit. */
var RTS_SUSPEND_PRIORITY = 4;
var RTS_SUSPEND_DELAY = 40;      /* Rule.SuspendDelay, seconds before a suspended type reforms */
/* Rule.StrayDistance: how far a member may drift from the team centre before it is told to
   regroup, and the radius inside which a new recruit counts as having joined up. */
var RTS_STRAY = 9 * RTS_TILE;

function rtsStructDef(k) { for (var i=0;i<RTS_STRUCTS.length;i++) if (RTS_STRUCTS[i].key===k) return RTS_STRUCTS[i]; return null; }
function rtsUnitDef(k)   { for (var i=0;i<RTS_UNITS.length;i++)   if (RTS_UNITS[i].key===k)   return RTS_UNITS[i];   return null; }

