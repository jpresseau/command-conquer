# Units — what each kind of thing does

Infantry behaviour, the flag tables the data files really carry, missions, transports,
aircraft, and the roster. Implemented across `src/core/units.js`, `src/core/move.js`,
`src/core/transport.js`, `src/core/capture.js` and `src/rules/`.

> Reference, split out of `CLAUDE.md`. The rules that must be followed before touching
> anything are still in `CLAUDE.md`; this is the working behind them.

## Infantry — from INFANTRY.CPP

- **Fear.** A counter that decays steadily. Taking a hit slams it to `SCARED`; otherwise it
  climbs by `ANXIOUS` **halved once for each health threshold the soldier is still above**, so
  wounded infantry panic much faster than fresh ones. At `ANXIOUS` they lie down; below it
  they get up.
- **Prone** takes `ProneDamageBias` (half) damage and crawls at half speed, and has its own
  sprite set — a low, long silhouette, because that is the only way to see at a glance that
  a squad is pinned.
- **Ordering matters**: `Fear_AI` will not let infantry drop *while they still have somewhere
  to be*. A hit makes them `Scatter()` first — roughly away from the threat with a couple of
  facings of random spread — and they go prone only once they stop. Do not "fix" this.
- **`MasterDoControls` marks `DO_WALK` and `DO_CRAWL` `randomstart`.** Each unit gets a `gait`
  offset so a squad does not march in lockstep. It is a one-line detail that stops a group
  looking mechanical.
- **Corpses** persist, stamped into the baked terrain like scorch marks (they live in
  `LAYER_SURFACE`, under everything, in the original).

## Infantry flags — from IDATA.CPP

Same INI story for the numbers. The **forced defaults** in the constructor are the useful part,
and three of them confirm decisions already made: `IsCrushable = true` for every infantry type,
`IsRepairable = false` (which is exactly why the Service Depot ignores infantry), and
`if (IsBomber) IsCapture = true` — a C4 unit is automatically also a walk-into-buildings unit,
which is how the Commando was already built.

**`IsCrawling`, and it was a correction.** Not every infantry type has prone artwork: the Dog,
Engineer, Spy and Thief are all constructed with `is_crawling = false`. A type with no crawl
frames must never enter the state — it would be lying about what it is doing. Now declared per
type and enforced.

**`IsFraidyCat` as a declared flag.** Panic is a property of the type in the original, read from
RULES.INI. This game inferred it: `!d.capture && !d.steal && !d.demo && !d.heals`. That produced
the right answer for the wrong reason and would have silently mis-classified the next unit added.

### The bug that swap introduced, and the test that asserted it

Gating the *whole* of `_rtsFearAI` on the flag also stopped fear **decaying**, so a specialist's
fear ratcheted up on every hit and never came down. My own `idata.js` asserted this as correct
("a medic keeps its fear untouched"). **Decay runs for everyone; only the response is gated.**

### The Attack Dog was broken, and a comparative test found it

`bite` had `range:3`. Range is in **world units** and a tile is four of them, so the dog had to
close to 0.75 of a tile — but its own radius (0.9) plus an infantryman's (1.1) means the pair can
never be nearer than 2.0. It landed **one bite in eight seconds**: 31 damage where a rifle squad
did 56. The anti-infantry unit was worse at killing infantry than the cheapest thing in the game.
Range is now 5.5 — still unmistakably melee, and actually reachable.

**Three versions of that test were wrong before the code was.** A hardcoded hp threshold tuned to
a previous build; then "a dog out-damages a rifle squad", which measured the *approach* rather
than the bite; then "a dog kills a rifle squad", which is the same duel in disguise. A 40 hp dog
crossing open ground against a 60 hp squad that outranges it 15 to 5.5 **loses, and should** —
dogs are pack and ambush units. What is actually true and now asserted: 56 dps against people
versus a rifleman's 12.7, faster movement, zero against armour, and at contact it takes a rifle
squad to a quarter health inside eight seconds.

**Recorded rather than asserted away:** the dog still trades poorly one-on-one and usually dies
first. That is a live balance question about a unit added this session, not a settled design.

## What the data files do and do not contain — UDATA.CPP, WEAPON.CPP

Worth writing down so nobody chases these again. **The balance numbers are not in this
repository.** `Strength`, `Armor`, `Cost`, `Speed`, `Sight`, `ROT`, `TechLevel`, `Damage`, `ROF`,
`Range` all arrive through `TechnoTypeClass::Read_INI` / `WeaponTypeClass::Read_INI` from
RULES.INI, which is a data file shipped inside the game's MIX archives rather than source. The
`*DATA.CPP` stat blocks are **behaviour flags**, and `WEAPON.CPP`/`WARHEAD.CPP` are allocation
plumbing plus an INI parser. Every damage figure in `rts.rules.js` is therefore still mine.

The one exception is a comment: UDATA.CPP's `FIXIT_ANTS` block quotes a complete RULES.INI entry
verbatim (`[ANT]` and `[Mandible]`), which is the only place the schema and scale are visible.
Useful calibration from it — **`Sight` and `Range` are in CELLS**, and small ones: the ant sees 2
cells and bites at 1.5. This game's ranges (3–34 world units = 0.75–8.5 cells) are in the right
band.

### What was portable

**`IsCrusher`, and it was a correction.** UDATA.CPP's flags say every tracked hull crushes
infantry — LTank, MTank, MTank2, HTank, Harvester, APC, MineLayer, MCV — while the **Jeep and the
Artillery explicitly do not. `RTS_CRUSHERS` was missing `light` and `heavy` entirely**, so two of
the three tanks in the game drove through infantry without touching them.

**`NoMovingFire`.** Some hulls cannot fire on the move. Rather than withholding the shot — which
would leave artillery trundling past its target forever — a flagged unit in range **stops**, and
fires on the tick after it halts.

**This nearly got reverted as inert, and the measurement is why it wasn't.** The control test
("a Battle Tank may still fire while moving") failed, which looked like proof that every unit in
this game already halts to fire. Counting every shot across three hard matches instead: **24 of
417 are fired on the move**, by tanks and rocket soldiers on attack orders. The flag is a real
constraint; the control had simply picked a duel where the existing stop-when-in-range rule fires
first. A single ordered attack is not a sample.

Verified: 13 assertions in `udata.js` — the crusher table against UDATA's flags, a Light Tank
actually running a rifleman down, artillery flagged and nothing else, a gun that has to drive
before it can shoot and never fires while doing so, and over two hard matches units without the
flag firing on the move while artillery never does. Ladder unchanged at 298/218/175.

## Missions — from MISSION.CPP

`MissionControlClass` is a **flag table indexed by mission**, read from the INI. Four fields
decide how the rest of the game treats an object, and they had been hardcoded in three
separate places here, each inferred from whatever the caller happened to need:

| flag | default | meaning |
|---|---|---|
| `IsRetaliate` | true | shoots back when hit |
| `IsScatter` | true | gets out of the way of incoming |
| `IsRecruitable` | true | may be recruited into a team, or recalled to defend the base |
| `IsNoThreat` | false | is not considered a threat by a target scan |

`Get_Mission` returns the *queued* mission when there is no active one, so an object with no
order is on **GUARD** — not in some nameless idle state. `RTS_MISSIONS` mirrors that: unknown
and absent orders both fall through to the default row.

**The table earns its keep through STICKY.** The distinction between `MISSION_GUARD` and
`MISSION_STICKY` is the whole reason to have per-mission flags — a unit told to hold a
position should not be dragged off it. **S** puts the selection on hold: it acquires and fires
from where it stands, never takes a path, ignores scatter, and `Base_Is_Attacked` skips it
("never recruit sticky guard units to defend a base"). Measured: 0 units moved over ten
seconds with bait 12 tiles away, 175 damage dealt to something that walked into range, and 0
of 6 holding units recalled where guarding ones are.

`IsNoThreat` is about what an object *provokes*, not what it is *worth*. A harvester on the
ore is not what an auto-acquiring gun should turn to face while something armed is in range —
but it stays a legal, valuable target when a player right-clicks it. Measured: the gun picks
the armed rifle over the closer and far more expensive harvester, and an explicit order still
scores the harvester above zero.

**`Override_Mission` / `Restore_Mission`** — a temporary order remembers the one it interrupted
and puts it back. `Base_Is_Attacked` previously just overwrote orders, so an army pulled home
to swat one raider forgot it had been going anywhere and stood in the base for the rest of the
match. Restore fires when the override's target dies *or* when it has no target and no path
left, or only the attack half would ever resume.

**Not implemented: the mission queue and per-mission think rates.** `Assign_Mission` queues and
`Commence()` promotes at a safe moment, because RA's units sit on a discrete cell grid and
cannot change their minds mid-cell; orders here apply immediately and that reads as
responsive. `MissionControl.Rate` staggers how often each mission thinks — worth nothing at
25 ms per simulated second for 78 entities, and a unit reacting on a 30-second timer feels
broken on a modern display. The rates are recorded in the table as documentation.

## Action cursors

The cursor answers "what happens if I click here?" before you find out by trying: move,
attack-move, attack, harvest, deliver, select, repair, sell, no-entry. `_rtsActionAt` mirrors
the decisions `_rtsRightClick` actually makes, so the cursor can never promise an order the
click won't give — there is a test that hovers, reads the promise, clicks, and compares.
Shapes are **stroked twice**, a fat dark pass under a coloured one, so they stay legible over
pale ore as well as dark forest; and the OS pointer is hidden while one is showing or two
cursors fight over the same few pixels. `_rtsActionAt` runs inside the render loop, so it
tolerates a bad entry in `G.sel` rather than taking the whole frame down with it.

(Built from this game's own action set — `DISPLAY.CPP` was not among the files mined.)

**`Overrun_Square`**: a tracked vehicle threatens the ground in front of it — infantry within
`CrushDistance` scatter (`Incoming()`), and any actually under the tracks are killed. Hook this
*before* the engage logic: a tank holding position and firing returns early from the unit
update, so hanging the crush off the end meant a stationary tank never ran anything over.

`Take_Damage` on a vehicle: **half the time a crew member bails out**, wounded
(`Random_Pick(5, MaxStrength/2)`) and running — but never from one that was crushed, since
there is nobody left to climb out. Units with more than 400 hit points rock the screen when
they die. And a damaged harvester carrying a load heads for the refinery instead of finishing
its mining run in the open.

## The APC, and a transport subsystem

`UNIT.CPP`'s passenger rules. The one that matters is in `UnitClass::Death`, and it is why an
APC is worth buying rather than a coffin:

```cpp
} else {
    while (Is_Something_Attached()) {
        FootClass * object = Detach_Object();
        if (object->Is_Infantry() && object->Unlimbo(Coord, DIR_N)) {
            object->Scatter(0, true);
        } else {
            object->Record_The_Kill(source);
            delete object;
        }
    }
}
```

**Infantry passengers survive the transport's destruction** and scatter out of the wreck. Anything
else is recorded as a kill. Ours can only carry infantry, so in practice everybody walks — which
is the whole point of the unit.

### Passengers stay in `G.ents`

A boarded passenger is **not** spliced out of the entity list; it carries `inside`, a reference to
its transport. That is a save decision, not a style one: the save encoder walks `G.ents` and turns
entity references into ids, so a passenger lifted out of the list would round-trip as an inline
*copy* and come back as something that merely resembled a unit — with `byId` not knowing about it
and its identity broken against anything holding a reference.

The cost is that every place treating a unit as being ON THE MAP has to say so. This section used
to say that turned out to be "only six", and the confidence was the expensive half: it read as a
closed list nobody need re-check. **Three more were found later**, all of one shape — they walk
`G.ents` comparing positions, and a passenger sits at its transport's coordinates:

- `_rtsOverrun` — a tank driving past an APC crushed the squad sealed inside it;
- `_rtsSplash` — a shell landing on a transport hit the hull **and** every passenger, at zero
  range, through no armour of their own, which makes a 350 hp APC a worse place to be than the
  open ground beside it;
- `_rtsProjHit` — a shell in flight could stop on a passenger instead of on the hull.

All three predate the landing craft by a long way and were true of the APC from the start; they
were found by a landing craft that kept losing its cargo in open water with nothing near it. Two
assertions pin the save behaviour — that a loaded APC comes back with its cargo, and that the
passengers come back **by identity** rather than as copies.

### And the door was never fitted

The board order is issued from `_rtsRightClick`, and the branch that issued it sat inside
`if (tgt.side === 'enemy')`, guarded by `tgt.side === mu.side` — with `mine` filtered to your own
units two lines earlier. The two conditions are mutually exclusive: **the branch was unreachable
from the moment it was written.** Measured on seed 7, a rifle squad right-clicked onto its own
APC — the order came out `move`, the squad walked to 0.75 tiles away and stood there, and the APC
carried 0 of its 5 for the rest of the match. Calling `_rtsOrderBoard` by hand in the same match
loaded it on the first try: the subsystem worked, the only route a player has to it did not.

Fitting the door exposed the next thing immediately. The board order puts a **friendly** in
`e.target`, and the engage block shoots whatever `e.target` is — the squad put two rounds into its
own APC on the walk in, 350 → 347.9 hp. Trivial with a rifle; the same code with a cannon against
an unarmed 400 hp landing craft is not. Guarded twice now: the aim in `_rtsUpdateUnit`, and
`_rtsFire` itself, which is the one place every route to a shot passes through.

### The bug the suite caught and reading the code did not

`_rtsUnload` guarded on `if (t.dead) return 0` — perfectly sensible — and `_rtsKill` sets `dead`
**before** it spills the cargo. So the guard rejected the one call the whole rule exists for, and
every passenger stayed sealed in the wreck. Five of five died; the assertion said so immediately.
`_rtsUnload(t, force)` now takes the flag, and `_rtsSpillCargo` passes it.

That is the same lesson as the production deadlock and the dangling `ChainTo`: **assert on the
outcome you want, not on the mechanism you happened to build.** "Unloading returns everyone"
passed the whole time — it was testing a live transport.

### Measuring

Ladder unchanged at **329 / 246 / 214**, which is expected for the same reason as the MCV: the AI
does not buy APCs and an idle player builds nothing. The transport suite is 13 assertions;
`clip.js` is 1184 frames; the save suite is 31 and still green.

## The landing craft — a road, not a weapon

RA gives the LST to **both** armies, because a boat that carries your tanks is not a weapon, it
is a road. That is why it needs the capability `shipyard` rather than a building: the Naval Yard
and the Sub Pen both `provide` it and neither is called it, so one roster entry covers both sides
instead of two units differing only in whose flag they fly. It is the first prerequisite in the
game with no namesake structure — the case `_rtsProvides` and `_rtsNeedName` were written for and
that nothing had ever exercised.

Three rules make it a landing craft rather than an APC that floats:

- **The unload spot is chosen in the PASSENGER's domain, not the transport's.** An APC unloads
  onto the ground it is itself standing on, so the old ring — eight positions at 1.1 tiles, taken
  on trust — was always right. A landing craft sits in the water, where every cell of that ring
  is sea. A passenger with nowhere to stand now stays aboard, and the craft says so.
- **`RTS_UNLOAD_REACH` is 3 tiles, and the number is the rule.** At five, a craft in the middle of
  a five-tile channel found a bank three cells away and put a Battle Tank on it — the tank crossed
  twelve world units of open water on foot. The craft has to nose in.
- **Sunk at sea, the cargo goes down with it; wrecked against a beach, it lands.** Both fall out
  of one sentence — everyone who can be put ashore is, everyone who cannot drowns — so there is no
  "if it is a boat" anywhere in `_rtsSpillCargo`.

**No transport inside a transport**, which RA does allow and this deliberately does not: the tick
skips anything flagged `inside`, so an APC riding in a craft would never run the update that drags
*its* passengers along, and they would be left standing on the beach still flagged as its cargo.

### What the craft does not change

`_rtsMapCheck`'s reachability flood is four-way and **land only**, so a map whose halves join only
by sea is still refused before the battle starts. That stays, and the reason is the opponent:
there is no amphibious logic in it, so on a sea-split map the player could cross and the opponent
could not, and the battle would be one side shelling a base that can never answer. The craft is
for maps that have a land route *and* water — an island of ore, a flank the road does not reach,
a beach behind the guns. The limit is pinned as its own assertion so lifting it has to be a
decision rather than a side effect.

### A ship that could never finish a move order

Found while building the above, and older than any of it. `_rtsPath` walks a blocked goal out to
the nearest cell the unit can occupy — and then overwrote the route's last waypoint with the
original goal anyway. For a land unit that is harmless; for a **ship ordered at the shore** the
last waypoint is dry land it can never enter, so `_rtsSteer` never clears the path. Measured, seed
7: a Gunboat given an ordinary move order at a point on the far bank was still `order:'move'` with
a live path 120 simulated seconds later, parked at the water's edge. Worse than it looks, because
the acquire branch only runs on `amove` or no order at all — so the boat also stood there refusing
to shoot anything for the rest of the match. A tank ordered onto its own Command Yard is
unaffected and finishes at the same 8.485 tiles before and after the fix.

## Submarines — one flag, read everywhere

Both Soviet boats were ordinary hulls that happened to carry torpedoes. There was no cloak flag in
the roster and nothing read one, so a Submarine sat on the surface being shot at by anything whose
gun reached the water — while the Destroyer's own roster line promised to be "the Allied answer to
a submarine". `TECHNO.CPP`'s `Cloaking_AI` is two sentences:

- **a cloaked object that fires will decloak**, and stays up for a moment afterwards
  (`RTS_SUB_SURFACE`, 4 s, set in `_rtsFire` — the one place every route to a shot passes through,
  so there is no way to fire from under water);
- **anything close enough finds it** — `RTS_SUB_DETECT` is 2.5 tiles for every object, and a hull
  carrying `detects` sees further. Only the Destroyer does, at 9 tiles, and that is the whole
  reason to own one rather than two Gunboats.

`_rtsCloakAI` runs on the boat itself once a tick and writes one flag, `hidden`. Everything else
reads it: `_rtsFindTarget` for both sides symmetrically, and `_rtsEntSeen` for everything the
player is allowed to perceive — which is one funnel, so an undetected boat is also unclickable and
cannot be ordered attacked. The flag is about the OBJECT rather than about who is asking, so the
opponent cannot cheat by ignoring it and your own submarines are hidden from it by the same line.
Yours stay on your screen, drawn awash.

### The mutation that found a hollow assertion

Breaking `_rtsEntSeen`'s cloak check outright left `e2e/stealth` **fully green**. The reason is
worth recording: the first section was asking whether the player could see a submarine sitting
alone in the fog, and the answer is no whether cloaking works or not — there was nothing out there
to see with. The assertion that actually means something is a submarine in water a Gunboat is
lighting up: in plain view, in daylight, and still not there. That case was added and the mutation
now fails it.

## Aircraft — a flight layer, and the rule that makes it cost something

`AIRCRAFT.CPP`. Three rules turn a fast unit into an aircraft, and the third is the one that
matters:

```
Ammo = Class->MaxAmmo;          // a fixed number of shots
if (!Ammo) mission = MISSION_ENTER;   // then home to a pad to reload
```
> *"If this aircraft has nowhere else to go, meaning that there is no airfield available, then
> it has to crash."*

That last clause is implemented, not softened. A helicopter whose pads have all been destroyed
comes down — which is what stops air being a free permanent army and makes the Helipad a target
worth defending.

**`aa` is the whole air/ground contract.** A weapon without it cannot engage anything flying. Two
weapons have it — the rocket squad's launcher and the Rocket Turret — exactly the two answers the
original gives you. The helicopter's own missiles do *not*, so it carries no air-to-air, as the
Longbow does not.

### Three bugs, and none of them was visible by reading the code

Everything about the crash rule and the ammo loop passed on the first run. Getting the helicopter
to actually *land* took three fixes, each found by one assertion — "it flies home and reloads
rather than crashing" — failing for a different reason:

1. **The fly-home branch returned `false`.** The tick hook only steered when `_rtsAirTick` claimed
   the tick, so the ordinary unit logic ran straight afterwards and overwrote the course. The
   helicopter sat still with an empty rack and a pad it never flew to.
2. **Separation shoved it off the apron.** Aircraft were still in the crowd-separation pass, which
   pushed the machine back out every time it closed. It hovered at about six world units and
   oscillated.
3. **The pad's own footprint blocked it.** The mover's "is that cell blocked" test applies to
   buildings, and a helipad is a building — so the aircraft was refused entry to the very
   structure it was trying to land on, stopping dead at the pad's half-width plus its own radius.

`_rtsPathFor(e, gx, gz)` is the other half of flight: an aircraft's "route" is the single waypoint
it is heading for, because terrain, walls and units are all irrelevant to it. Routing every path
request through one helper means no call site has to remember what it is holding. **Writing that
with a regex over the call sites rewrote the helper's own body into infinite recursion** — worth
checking after any sweeping rename.

### Drawing something that is above the battlefield

An aircraft is drawn lifted off its ground position with a flattened shadow left on the cell it is
actually over. Without that gap a helicopter reads as a fast, oddly invulnerable jeep. The lift
collapses to almost nothing while it is sitting on a pad reloading.

**The rotor took two attempts and the second was worse than the first.** Drawn as a solid disc —
the obvious way to say "spinning" — it came out as an opaque dark lid 31 px across that hid the
entire aircraft; every facing was the same black circle. The next attempt used four blades at
45-degree steps, which fails for a reason worth writing down: **these primitives are axis-aligned
boxes, so a diagonal "bar" is a box that is long in both axes — a square.** Four of them merged
into a solid diamond. Two crossed bars along x and z are genuine thin bars, and the fuselage and
tail read through the gaps.

### What is not done

**The AI does not build helipads or helicopters.** Air is player-only for now. Teaching
`_rtsAIWants` a new branch of the tech tree is a separate change with its own ladder run, and
bolting it on untested would be exactly the kind of thing the rest of this file argues against.

### Measuring

Ladder unchanged at **329 / 246 / 214** — as expected, since the AI does not field aircraft. The
flight suite is 13 assertions; `clip.js` is 1248 frames; the save suite is 31 and still green.

## Closing the ledger — four items, and two that closed as "no defect"

### The refinery money printer, and the price that made it real

`BuildingTypeClass::Raw_Cost()` is a building's price minus the free unit it ships with:

```cpp
if (Type == STRUCT_REFINERY) cost -= UnitTypeClass::As_Reference(UNIT_HARVESTER).Cost;
```

It exists to stop exactly one exploit, and refusing to port it left that exploit open here:
refund half of a price that INCLUDES a free harvester and you are being paid for a harvester you
keep. Sell the refinery, rebuild it, repeat — a money printer with a spare harvester falling out
each cycle.

**Porting it needed the refinery priced the way the original prices it.** RA's PROC is 2000 with
the 1400 harvester costed *into* that; ours was 1400 for the building with the harvester on top,
so raw cost came out at zero and the guard measured as a no-op — which is precisely why an
earlier pass concluded it "measured wrong" and skipped it. The refinery is now 2000, so the
arithmetic is the original's: raw cost 600, refund 300. Raw_Cost is taken off what was actually
*paid*, so a discounted building cannot be sold at a profit either.

### The power band — the part we did not have

`TechnoTypeClass::Time_To_Build`, verbatim:

```cpp
fixed power = House->Power_Fraction();
if (power > 1) power = 1;
if (power < 1 && power > fixed::_3_4) power = fixed::_3_4;
if (power < fixed::_1_2) power = fixed::_1_2;
```

Two things in there. The **floor is a half**, not the 0.28 we had — a browned-out base in the
original is slow, not crippled. And there is a **dead zone**: anything between three quarters and
full counts as three quarters, so the moment you dip under 100% you pay a flat 25% whether you
are at 99% or 76%. That is what makes staying fully powered a decision rather than a gradient.

### The Attack Dog is not a damage number

```cpp
if (source is infantry && source->Class->IsDog) {
    if (source->TarCom == As_Target()) damage = Strength;
    else                               damage = 0;
}
```

A bite is set to the target's **current strength** — it always kills in one — and anything that
is not the dog's actual target takes **nothing at all**. Plus, from the action layer, *"dogs can
only attack infantrymen"*: `ACTION_ATTACK` becomes `ACTION_NONE` against anything else.

That is the whole unit: a 200-credit assassin that deletes exactly one man and cannot scratch a
tank. We had given it a damage figure, which is exactly why it lost fights to the cheapest
infantry in the game.

**The infantry-only rule is enforced in the damage as well as at acquisition**, and the test
suite is why. `_rtsFindTarget` skipping vehicles looked sufficient until an assertion forced a
target onto a tank and the dog deleted it — a forced order walks straight past acquisition. In
the original the order cannot be given; here both routes are closed.

### The MCV — `UNIT.CPP::Try_To_Deploy`

Three details worth having exactly: the yard lands on the cell **adjacent** to the vehicle, not
under it; placement is checked with `Legal_Placement`, which does **not** apply the build-radius
rule (hence `_rtsCanPlace(..., anywhere)`) — a vehicle whose purpose is to found a base where you
own nothing cannot be held to a rule about being near something you own; and

```cpp
building->Strength = Health_Ratio() * building->Class->MaxStrength;
```

so a half-dead MCV deploys a half-dead yard, and deploying is not a free repair.

`UDATA.CPP` marks it *"Can this be a goodie surprise from a crate? true"*, so it joins
`RTS_CRATE_UNITS` — a player who has lost their yard is not out of the game while a crate might
hand them one. The AI rule is deliberately narrow: it deploys an MCV **only when it has no
yard**, and never buys one, because a 2500-credit vehicle it has no use for is a straight waste.

### Two items closed as "the original does not do this either"

**Crate-seeking AI.** There is none in Red Alert. The only AI-vs-crate logic in the whole source
is a pair of guards in `UNIT.CPP` and `INFANTRY.CPP` that make a crate cell *impassable* to
computer-controlled units — and only in a campaign game (`Session.Type == GAME_NORMAL`). In
skirmish they drive over crates like any other ground and nothing seeks them out. Not a gap.

**AI build slowdown.** `DifficultyClass` carries `FirepowerBias`, `GroundspeedBias`, `ArmorBias`,
`ROFBias`, `CostBias`, `BuildSpeedBias`, `IsWallDestroyer`, `IsContentScan` — and `RTS_DIFF`
already mirrors all eight, field for field. The *values* live in RULES.INI, which is data and is
not in the GPL release, so ours stand. `IsBuildSlowdown` is read from the INI and then never used
anywhere in the source.

### Measuring

The ladder (mean seconds an idle player survives, 5 seeds × 3 difficulties):

| | easy | normal | hard |
|---|---|---|---|
| before | 339s | 251s | 214s |
| economy | 329s | 246s | 214s |
| + dog | 329s | 246s | 214s |

Inside seed noise. **The dog change is invisible to this ladder and that is expected** — an idle
player builds no infantry for a dog to kill — which is the whole reason it has its own suite
(7 assertions) rather than being signed off on the ladder. The MCV likewise: the AI never buys
one, so an idle-player ladder cannot see it. 8 assertions instead.
