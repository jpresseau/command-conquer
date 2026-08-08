# The opponent — difficulty, teams, and what it builds

The computer house: how difficulty is expressed, how it decides what to build and where,
how it raises and commits an army. Implemented in `src/core/ai.js`, `src/core/teams.js`,
`src/core/missions.js`, `src/core/base.js` and `src/rules/ai.js`.

> Reference, split out of `CLAUDE.md`. The rules that must be followed before touching
> anything are still in `CLAUDE.md`; this is the working behind them.

## Difficulty, IQ and the AI base — from RULES.CPP

The balance database, and three ideas in it are worth more than all its numbers:

- **Difficulty is a set of biases applied to a whole HOUSE**, not special-case code:
  FirepowerBias, GroundspeedBias, ArmorBias, ROFBias, CostBias, BuildSpeedBias. Everything
  the opponent does goes through `_rtsBias(side)`, and the player's side always gets the
  identity table — a bias can never silently change how your own units behave. The *fields*
  are the original's; the numbers in `RTS_DIFF` are ours (the shipped RULES.INI values are
  not in the source).
- **IQ gates behaviours, one at a time.** RULES.CPP gives each AI ability its own IQ
  threshold — `IQRepairSell 3`, `IQScatter 3`, `IQHarvester 3`, `IQGuardArea 4`,
  `IQProduction 5`. A weak opponent is therefore *missing nameable abilities* rather than
  doing less damage: Recruit cannot repair, its infantry do not dodge, and it never expands.
  This is far more legible from the player's chair than a damage multiplier, and it is why
  the difficulty setting changes how the enemy plays rather than how much it hurts.
  **But `IQProduction 5` was all-or-nothing here, and that broke the middle rung — see below.**
- **The AI holds a target base COMPOSITION, not a build order.** Each structure type wants
  `ratio` of the base size capped at `limit` (`RefineryRatio .16/limit 4`, `WarRatio .1`,
  `DefenseRatio .5` …), and it builds whatever it is furthest short of. `BaseSizeAdd 3` means
  base size tracks *the human's* building count plus three, so the opponent grows in response
  to how you are actually playing. `PowerSurplus 50` keeps spare capacity in hand instead of
  reacting once the lights are out.

Placement matters as much as the choice: a refinery aims at the richest ore nearest **any**
of the AI's buildings (measuring from the yard sends late refineries back to a mined-out
field), and a turret goes on the side facing you. `_rtsAIPlace` tries every anchor, best
first — searching only the nearest one works until that corner fills up, and then placement
fails forever, the finished building never leaves the `ready` slot, and the AI's entire
structure queue is jammed for the rest of the match while its credits pile up.

**Gems** are `GoldValue 35` / `GemValue 110`: not a second resource but a flag per tile, so
the same harvester, mining at the same rate into the same refinery, brings back a bit over
three times the credits. The hopper therefore has to hold *bails and their value* separately
(`carry` / `carryVal`) — paying out the bulk would have thrown the whole point away. Gem
fields sit in contested ground and, per `IsTGrowth`, do **not** regrow: a gem patch is finite
and worth fighting over, an ore field always comes back.

Harvester field choice scores the **whole round trip** — out to the tile *and* back to the
refinery — divided by what a load is worth. Scoring the one-way distance instead sends
harvesters chasing gems across the map: mining a load takes about four seconds and the drive
takes most of a minute, so the return leg dominates. That mistake cost roughly 90% of the
AI's banked credits at the three-minute mark, and it does not throw or log anything.

Also corrected from this file: **ConditionYellow = 1/2 and ConditionRed = 1/4** (they were
0.66/0.33 here, quietly mistuning damaged-building art, the fear ladder and the AI's
sell-back decision), `RepairPercent = 1/4`, and `MinDamage 1` / `MaxDamage 1000`.

## The opposing house — from HOUSE.CPP

`Expert_AI` is not a build script. Every five seconds it **scores each strategy for urgency**
(NONE → LOW → MEDIUM → HIGH → CRITICAL) with a `Check_*` function, then acts from CRITICAL
downward. Note the original computes an `acted` flag with the stated intent of stopping after
the highest level that did something, and then never breaks on it — follow the code, not the
comment: every level gets its turn. `_rtsAIUrgency` scores `power / raisePower / lowerPower /
raiseMoney / fireSale / attack / build`; `_rtsAIDo` carries each one out.

Underneath sits a **house state machine** — BUILDUP / BROKE / ATTACKED / ENDGAME — that several
unrelated checks read, which is how one fact ("we were hit in the last minute") shifts the
whole opponent at once: it builds power more urgently, sells more readily, and commits fewer
units to its next attack because it needs a garrison.

- **Selling is a lever, not a panic.** `AI_Raise_Money` / `AI_Raise_Power` work down a fixed
  list, each entry with the urgency at which it becomes sellable. Only the turret — static
  defence, no income, no production — is sellable at LOW, and letting it go is the most
  valuable thing a poor opponent does: it took the Recruit AI's eight-minute army from 12 to 50
  units on one seed. Production goes at MEDIUM, the economy only in a real emergency, and the
  yard is never on the list.
- **`Check_Fire_Sale`**: when nothing that can *produce* is left standing, the house sells
  everything and `Do_All_To_Hunt` throws every remaining unit at you. A losing AI goes out
  swinging instead of sitting in a corner waiting to be mopped up.
- **`AttackInterval` is randomised over a 4× spread** (`× (0.5 + rnd × 1.5)`), so waves never
  arrive on a metronome. Measured gaps around an 85 s base: `[91, 127, 108, 62, 42, 105]`.
- **`Recalc_Center` + `Which_Zone`**: the base centre is a *cost-weighted* average of building
  positions, the radius the mean distance from it, and the surroundings split into CORE plus
  four compass zones. `Find_Build_Location` rates each zone by how far its defence sits below
  the base average and aims the next turret at the weakest — putting every turret on the side
  facing the player is exactly the mistake this routine exists to prevent.
- **Brownout hurts.** Buildings that *draw* power take damage while the base is under-supplied,
  but only down to ConditionYellow. The construction yard draws nothing and is untouched.
- Beware measuring brownout on the AI's own base: it answers a power emergency by *selling* a
  power-drawing building, which looks exactly like damage if you only watch hit points. Measure
  it on the player's side.

`Assign_Handicap` is the difficulty layer above all of this (see RULES.CPP above). The IQ gates
are what actually separate the difficulties: Recruit never expands its base, never repairs and
never scatters. Measured over eight minutes against a passive player: Recruit fields 16 units
from 8 buildings, Commando 64 from 19, and the first attack wave lands at 212 s / 152 s / 106 s.

## Teams — from TEAM.CPP

A `TeamTypeClass` is a **composition plus a quarry**. The team recruits until it is at full
strength, only then moves out, and picks its target **by category** rather than by proximity.
That is the whole difference between an opponent that shoves a share of everything idle at
your closest building and one that sends three buggies after your harvesters while rocket
soldiers go for your power.

- **Full strength gates the march.** `IsFullStrength` sets `IsHasBeen`; a team that drops
  under strength while moving stops and regroups. `IsReinforcable` decides whether it will
  dally to pick up replacements — a non-reinforceable team is never under strength again once
  it has set out.
- **Initiation.** A new recruit is *not* initiated; `Coordinate_Conscript` sends it to the
  team centre and it counts as joined once inside `StrayDistance`. Only initiated members are
  averaged into `Calc_Center`, so a straggler racing to catch up doesn't drag the centre out
  to meet it.
- **`Lagging_Units`**: anyone who has fallen behind is told to close up and **everyone else
  holds** until they do. This is what makes an army arrive together instead of feeding itself
  in piecemeal.
- **`RecruitPriority`** does two jobs: a team may steal members from a lower-priority team,
  and `Suspend_Teams` disbands everything below a threshold when the base is attacked. That
  last one is where most of `Base_Is_Attacked`'s defenders actually come from — HOUSE.CPP has
  been calling it since it was ported, with nothing to call.
- **`Took_Damage`** retargets the team onto its attacker — *unless* it is already fighting
  something that shoots back and is in range. "No point in endlessly shuffling between targets
  that have firepower."

**Two traps, both of which failed silently.**

`e.team` was **already taken** by the player's control groups (the 1–9 keys) and is
initialised to `-1`. Reusing the name made every candidate look like it already belonged to a
team with id −1, so nothing could ever be recruited — no error, no thrown exception, just
teams that stayed permanently empty. The membership field is **`sqd`**.

`IsNoThreat` and `QUARRY_HARVESTERS` are in direct conflict. A harvester scores zero in a
normal threat scan, so a team raised specifically to hunt harvesters could never see one.
`Greatest_Threat(THREAT_TIBERIUM)` exists precisely to override that, so an explicit quarry
passes `force` and bypasses the flag.

**Teams cannot be the only offensive behaviour.** A team marches only at full strength and
only fields its own composition, so leaving team creation on the attack-wave timer left the
opponent committing ~15 units where the blob sent 60–70% of everything — an idle player
survived half again as long. Teams are raised continuously whenever there are loose units to
crew one. But that raise **must not pre-empt the opening**: raising teams the moment units
exist threw away the first-wave delay entirely and Commando was killing an idle player at
100s instead of 170. Surplus teams supply an existing war; they don't start one early.

Result: first waves still at 212/152/106s, and the ladder is *tighter* than the blob's —
hard now lands 168–174s where it used to range 164–205s.

## Team mission lists — from TEAMTYPE.CPP

A `TeamTypeClass` carries `MissionList[]` — an ordered script, each entry a mission plus one
argument — and the team walks an index (`Current`) down it. `RTS_TMISSIONS` is the ported
`TeamMission_Needs` table saying what argument each mission takes. Implemented: `move`,
`patrol`, `attwaypt` (waypoint), `attack` (quarry), `tarcom`, `guard` (1/10th min), `loop`
(line number). Deliberately absent: FORMATION, UNLOAD/LOAD/DEPLOY, SET_GLOBAL, SPY,
HOUND_DOG, DO, MOVECELL — every one drives a subsystem this game doesn't have, and a stub
would be invented behaviour rather than a port.

**Waypoints are derived, not authored.** In RA a designer drops them in the scenario editor;
this map is generated, so `_rtsBuildWaypoints` computes `home`/`front`/`flank`/`mid`/`ore`
from the finished map and snaps each to open ground. `front` stands 13 tiles *off* the target
base — a MOVE mission is an approach, and a team that "arrives" inside the enemy buildings has
already blundered into the fight. `flank` is derived perpendicular to the base-to-base line.

**Three things the ladder caught, all of them in content rather than mechanism.** The list
machinery is faithful and verified first try; what made the AI *worse* was the scripts written
on top of it. An idle player's survival went 243s → 329s on normal, and one seed ran the full
600s while the opponent sat on 157 units it never committed.

1. **The alert must fire while the match is still live.** Gating it on a 240s timer meant that
   on hard — decided around 190s — the two building-killing types were never raised at all,
   because an idle player never provokes the house either. The first attack wave is this
   game's declaration of war and is what alerts the house; the timer is only a backstop.
2. **A type filtered to `maxnum = 0` must not keep its team slot.** Four harassment teams
   raised before the alert squatted the roster forever and the assault phase got two slots out
   of six. An alerted house disbands its now-invalid teams and frees the members.
3. **A script must end on something decisive.** Raiders' list was conditional on a harvester
   existing at every step, so with none on the map three buggies looped round an empty ore
   field indefinitely. Every list now terminates in `attack buildings` or `tarcom`. Approach
   legs are `patrol` (attack-move), not `move` — a silent march past targets is a real cost.
   And `SWING` for the flank is 12 tiles, not 24: at 24 the waypoint landed on the map edge.

`MaxAllowed` is per type, which the random pick in `Suggested_New_Team` needs or it will raise
six of one kind. `IsAutocreate` is a hard split, not a preference — an alerted house draws
only from autocreate types, so the two lists are the opponent's early and late game.
`IsSuicide` opts a team out of both retargeting on damage and waiting for stragglers.

Measured against the pre-TEAMTYPE baseline (mean seconds an idle player survives, 3 seeds):
easy 350→323, normal 243→229, hard 187→190. Stronger on easy and normal, parity on hard, and
notably more consistent — normal lands 233/229/226 where it used to scatter 223/245/262.

## Committing the army (mine, not ported)

The companion to the production ceiling above, and the same shape of bug: **a fixed cap that
was sane at small scale binds forever at large scale.** Once production was uncapped, hard
looked like this:

    min 3   army 100   in teams 18   18% committed    82 idle at home   4 teams
    min 6   army 186   in teams 20   11% committed   165 idle at home   4 teams

Four teams, permanently — Sappers x2 and Assault x2, every type pinned at its authored
`max: 2`, so `_rtsSuggestTeam` returned **null on 45 of 51 calls**. The opponent's entire
offensive capacity was 20 units no matter how large its army grew. It built an army and sat
on it.

RA does not hit this because `MaxAllowed` is authored per scenario against a known army size,
and because a campaign house also attacks outside the team system entirely. There is no author
here, so **the cap derives from the army**: commit `RTS_TEAM_COMMIT` of the field army in
teams of about `RTS_TEAM_TYPICAL`, never fewer than the authored floor, never more than
`RTS_TEAM_MAX_HARD`. `_rtsTypeCap` shares the extra slots across the types that are currently
eligible, so the alert split still decides *which* types exist and only the count scales.

Measured, hard at six minutes: **11% -> 47% committed**, 4 -> 22 teams, 165 -> 103 idle.
Ladder easy 306->293s, normal 220->218s, hard 187->176s.

**The real prize was consistency, not strength.** Per-seed spread collapsed — easy went from
367/289/289/287/300 (80s spread) to 302/293/291/288/292 (14s), hard from 169/183/188/224/169
(55s) to 168/179/178/183/171 (15s). The seed-9004 outlier recorded in the production-ceiling
section as "genuine divergence, not noise" was really an artifact of a tiny committed force:
with only 20 units ever attacking, a handful of unit trades decided the match. Commit half the
army and the outcome stops hinging on them. **Treat a wide per-seed spread as a signal that
something is under-committed, not as inherent variance.**

Sim cost went *down*, 2.45 -> 2.28 ms/tick at ~200 entities: units that march and fight are
cheaper than units milling around the base being separated from each other every frame.

Commitment lands at 47% rather than the 62% asked for, and that is a real constraint rather
than a bug: a team only recruits units matching its composition, so a tank-heavy army cannot
fill the rocket slots in Sappers. Raising it further means changing the compositions.

## The opponent's production ceiling

**MINE, not a port, and a fix for a measured defect.** By five minutes on hard the opponent
had **28,576 credits it could not spend**. The cause is two things meeting:

- `_rtsAIWants` returns **null** once every structure type is at its hard `RTS_AI.limit`
  (refinery 4, barracks 2, factory 2, turret 12). The structure line then idles 47% of the
  time. Note the base-size target is NOT what binds — the limit table is. Confirm this by
  calling `_rtsAIWants` directly rather than reading the code; an earlier diagnosis here got
  it wrong and proposed flooring the base size, which would have changed nothing.
- Unit lines were already at **0% idle**. One queue per category caps spending at roughly one
  tank plus one rifle squad at a time, whatever the income.

So the opponent built a second war factory and a second barracks and got **nothing** for them.

`_rtsLines` scales the build RATE by the number of producing buildings, for the AI only — the
player keeps one line per category, because that is what the classic sidebar is. Cost scales
with rate, so the money is genuinely spent rather than conjured. In RA a `FactoryClass` belongs
to a BUILDING, so a house with two war factories really does build two things at once; this is
that idea without disturbing the single-queue model the sidebar depends on.

Measured: credits at five minutes **28,576 → 1,104**, units **116 → 175**, unit lines now idle
12–13%. Ladder easy=306s (byte-identical) normal=220s (unchanged) hard=187s (from 176s).

Three things worth knowing about this change:

- **It self-gates by difficulty.** `easy` is bit-for-bit unchanged because it sits below
  `RTS_IQ.production` and never builds the second factory the fix rewards.
- **It is a PARTIAL fix.** The credits become units, but those units garrison rather than
  attack — enemy units still alive when the player falls went from ~68 to ~112. The remaining
  bottleneck is team commitment, not production.
- **Hard's mean moved on one seed.** Four of five hard seeds land within a few seconds of
  before; seed 9004 swung 167→224. With a deterministic sim that is not noise, it is genuine
  divergence from altered timing — worth remembering that a single seed can carry a mean.

Perf at the higher unit count: 202 live entities, 2.45 ms per sim tick, 6.8x headroom at 60fps.

## The base blueprint — from BASE.CPP

A base in the originals is not "n refineries and m turrets somewhere near the yard". It is an
**ordered list of nodes**, each one a `(building type, cell)` pair. `Get_Building` looks at the
node's cell and returns the building only if a building **of that type** is standing **exactly
there**; `Is_Built` is that as a bool; `Next_Buildable` walks the list in order and hands back
the first *hole*, optionally filtered to a type. Order is priority, and the cell is part of the
plan rather than something to work out later.

The consequence that matters is **rebuilding**. Destroy an enemy refinery and its node becomes
a hole; the next refinery the AI builds goes back into that hole — the cell it was lost from.
The base repairs to its plan instead of being reshaped by whatever you happened to kill.

**The adaptation.** RA reads its nodes from the scenario INI, where a designer placed them.
There are no scenario files here, so the blueprint is **seeded** from the opening layout
`_rtsLayBase` produces and **grown** by recording every position the AI scan-places into. The
recording happens in `_rtsPlaceStruct`, not at the call sites, which keeps the invariant simple:
*a node exists for every structure that has ever stood, until it is sold.*

**Selling drops the node; destruction keeps it.** The AI sells buildings for cash and to shed
power load. If a sale left a hole the AI would rebuild it and the pair would oscillate forever.
Destruction is something done to you; a sale is a decision not to have the building.

**One addition to `Next_Buildable`: it skips a hole whose cell can no longer be built on.** RA
checks placement separately. Doing it inside the walk matters here because only the *first* hole
is returned — one permanently blocked node (the player built over it, ore crept in) would shadow
every later hole of the same type and the plan would stop repairing itself from that point on.

### What it changed, measured

Same raid on both trees: run to four minutes on hard, raze the half of the enemy base nearest
the player's start, run three minutes more. Five seeds.

|                                  | before | after |
| -------------------------------- | ------ | ----- |
| razed buildings back in their own cell | 0.8 / 10.8 | **8.6 / 10.8** |
| structures three minutes later   | 19.8   | 20.2  |
| turrets                          | 7.8    | 8.0   |
| mean turret distance from the yard | 9.5  | **8.4** |
| furthest structure from the yard | 14.5   | **12.8** |
| harvesters                       | 7.8    | 7.8   |
| idle credits                     | 15,440 | **11,545** |

So the base repairs to plan, stays tighter, and is no weaker for it — same harvesters, slightly
more structures and turrets, and a quarter less money sitting idle because placement fails less
often. Seed 9002 contributes 0/6 to that first row and is not a blueprint failure: that raid
broke the AI outright (5 structures left, 243 credits) and it never rebuilt anything at all.
Excluding it the rate is 43/45.

**This was invisible to the ladder, and that is correct.** easy 293s / normal 218s / hard 176s,
seed for seed, byte-identical before and after. The idle player the ladder simulates never
attacks the enemy base, so the rebuild path never runs. A change that only fires when the player
fights back needs a harness where the player fights back — `raid.js`, not `ladder3.js`.

**The sprawl this fixed has a named cause.** `_rtsAIWeakZone` aims each new turret at
`centre + radius × 2`. Placing a turret far out raises the base radius, which places the next one
further out again — a feedback loop that had the enemy base reaching 26 tiles from its yard by
minute seven on seed 9003. Filling holes instead of scanning outward breaks the loop.

Verified: 24 assertions in `basenode.js` — the opening layout being the blueprint, `Get_Building`
requiring type *and* cell *and* side, holes appearing on death at the exact cell, the type filter,
no duplicate node when a hole is refilled, exactly one node appended per new building, sell-drops
vs destroy-keeps, a blocked hole not shadowing a later one, and end to end: after four minutes of
real play every structure the AI built is a node with no duplicates, and three razed turrets all
come back in their own cells.


## The default opponent never had a tech tree

`_rtsAIWants` handed the whole 23-entry build order to IQ 5 and the two-item list
`['refinery', 'barracks']` to anything lower. The difficulties are **IQ 2 / 3 / 5**, so
everything from the war factory onward — the tech tree, both shipyards, the airfield, every
defence and all four superweapons — was Commando-only.

Measured with the stopping condition removed (the player's structures kept alive, 600 simulated
seconds, seed 9001) so the question is what the opponent *builds*, not how fast it wins:

| | structures at 600s | distinct types | what it added beyond the six it starts with |
|---|---|---|---|
| Recruit | 11 | 7 | a silo |
| Soldier | 17 | 7 | a silo |
| Commando | 35 | 16 | the whole tree; missile silo at 581s |

**Recruit and Soldier built the same seven things.** Soldier just built more copies. Two rules
run before the ordered walk and are not gated — power (`PowerSurplus`) and silo (store nearly
full) — and those two plus the starting base were the entire repertoire of both.

### The superweapon gate contradicted itself, and its own comment said so

`RTS_IQ.superweapon` was 3, carrying this note:

> *3 rather than 4 deliberately. The difficulties run 2 / 3 / 5, so a gate of 4 would have meant
> only Commando ever fired one — and a feature two thirds of players never see from the receiving
> end is not a difficulty distinction, it is a dead branch.*

Every word true, and already defeated: `mslo` is twentieth in the build order, which needed IQ 5.
**Soldier could fire a superweapon it could never build.** The branch was dead anyway, by the
other gate, and nothing said so. `guardArea` had the mirror-image problem — a gate at IQ 4 when
no difficulty is IQ 4, so it was Commando-only however it read.

### What replaced it

The rung is **per building** now (`RTS_AI.buildIQ`, default 3, superweapons 5), so adding a
building means deciding its rung once. Recruit's order stays empty deliberately — `refinery` and
`barracks` sit at 3, not 2 — because that rung's ladder position was already measured and this
change is about the middle one. Firing a superweapon moved to IQ 5 to agree with building one.

| | reachable buildings | structures at 600s | distinct types |
|---|---|---|---|
| Recruit | 0 | 11 | 7 |
| Soldier | **19** | **19** | **10** |
| Commando | 23 | 35 | 16 |

Soldier now builds a radar (167s), advanced power (179s) and a service depot (244s).

**The ladder did not move**: allied 296/218/172s and soviet 294/220/175s, against 296/218/172 and
294/219/175 before. That is the desired outcome rather than a lucky one — the extra buildings are
economy and tech, not offence, so the opponent has a real base without becoming harder to survive.

`test/unit/scenario` now checks the two tables against each other: every gate sits on a level some
difficulty has, none is above the hardest, firing a superweapon implies being able to build one,
and each difficulty reaches strictly more buildings than the one below.

### Why it was still a partial fix

Soldier did not reach the tech lab inside 600s, let alone the airfield or a shipyard. The remaining
limiter was **not** the gate. The guess written here was that the composition walk simply returns
to economy as the base grows — at 19 buildings `ceil(19 × 0.16) = 4` refineries are wanted against
3 built, so the walk goes back to the top of the order before it ever reaches `lab`. That was
inferred from the ratios, and the note said it should be instrumented before anything was retuned.
It was, and the inference was **half right in a way that mattered**: the walk really did sit on
`refinery`, but not because it was satisfied elsewhere and looping — because it was being refused.

Sampling `G.ai.want` every simulated second, seed 9001, player kept alive, ten minutes:

| | share of the match wanting a refinery |
|---|---|
| Soldier | **61.3%** (has 3, wants 4) |
| Commando | 3.3% |

Three things it was **not**. Placement: **405** legal refinery spots on that map at the moment of
refusal. Money: 4,343 credits at 300s. Ore: the fields were nowhere near exhausted.

Money did turn out to be a second, independent bug. From 4,343 at 300s it went 896, 257, 842, 497 —
the unit line was spending it. `RTS_AI.infantryReserve` was a flat 2,000, while a non-urgent build
needs the building's cost plus `creditReserve` on top: **3,000 for a 2,000-credit refinery**. Money
could not climb past the lower number without being turned into infantry, so a building not paid for
inside the early rich window was never paid for at all. `_rtsAISpare` now floors the unit line at
whichever is higher, and Commando alone went 35 → **41** structures with its missile silo landing at
420s instead of 581s. Soldier's run was **byte-identical** — so this was real, and it was not the
thing.

The thing was found by wrapping `_rtsAIDo` and `_rtsQueue` and printing every refusal:
`refinery -> REFUSED` thirty times, with `_rtsCanProduce('enemy','refinery') === false`, against a
composition of `power ×0, apower ×2`.

**`needs:['power']` named a key, not a capability.** The opponent builds Advanced Power Plants and
then sells the basic plants they make redundant — which is exactly what its own `lowerPower`
strategy is for — and from that moment the Refinery, the Barracks and the next Advanced Power Plant
are all unbuildable, permanently, with nothing anywhere saying why. **The player had the identical
trap**, which is why the fix is a `provides` list on the structure table (`_rtsProvides` walks it)
and the spec is `test/unit/prereq` rather than a note here.

| Soldier at 600s | before | after |
|---|---|---|
| distinct structure types | 10 | **15** |
| structures | 19 | 31 |

Tech lab 290s, kennel 298s, airfield 356s, sub pen 489s, rocket pit 538s — all of which the gate
work above had already made reachable and which it could never actually get to.

**The ladder still did not move**: allied 296/221/171s and soviet 294/221/172s. Three sessions of AI
work have now left it inside a couple of seconds of where it started, which is the point — the
opponent plays a fuller game without becoming harder to survive as an idle player.
