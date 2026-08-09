# Economy — production, storage, ore and crates

Money, the two pools it lives in, how a production job is charged, where ore comes from and
what a building does while it stands. Implemented in `src/core/production.js`,
`src/core/ore.js`, `src/core/crates.js`, `src/core/harvest.js` and `src/core/units.js`.

> Reference, split out of `CLAUDE.md`. The rules that must be followed before touching
> anything are still in `CLAUDE.md`; this is the working behind them.

## Production, exactly — from FACTORY.CPP

`FactoryClass` runs one production job. Two things in it were worth having, and finding them
cost a bug that only a full match could expose.

### Cost_Per_Tick: a job is driven by its BALANCE

    cost = Cost_Per_Tick();          // Balance / steps_remaining
    cost = min(cost, Balance);
    ...
    if (Fetch_Stage() == STEP_COUNT) { House->Spend_Money(Balance); Balance = 0; }

The charge comes off the **outstanding balance**, is clamped to it, and any residue is settled
at completion. Deriving the charge from the price and a rate — which is what this repo did —
systematically **overcharges**, because the final tick's rate overshoots the job. Measured
before the change: up to **1.21 credits on an 800-credit tank**, always over, never under.
After: exact to four decimal places, including through a brownout.

`q.bal` on the queue entry is the port. `Abandon()`'s refund (`Cost_Of() - Balance`, i.e. what
was actually spent) already matched what this repo did.

### PurchasePrice

`FactoryClass::Set` records `Object->PurchasePrice = Cost_Of() * house.CostBias`. RA remembers
**what was actually paid**, and refunds against that.

This repo refunded `def.cost * RefundPercent` — the sticker price — while `CostBias` is real:
an opponent on `hard` buys at 0.8×. It was therefore getting a **62.5 % return** on every sale
where the player got 50 %, and only 41.7 % on `easy`. Structures now carry `paid`, threaded
from the queue through `readyPaid` to placement, and a sale refunds against it. All three of
player, `hard` opponent and `easy` opponent now return exactly 0.500.

### The bug this introduced, and why the unit suite missed it

Clamping the charge to the balance deadlocked every production line in the game. Rounding lets
`bal` reach zero one tick before `prog` reaches one; `want` becomes zero; and the broke-guard —
`if (q.cost > 0 && want <= 0) continue;` — skipped the completion check below it. Forever.

The opponent sat on a finished harvester at `prog=1.000, bal=0.0, paid=1400.0` and never built
anything again for the rest of the match. On `normal` it ended with **four units and seven
structures** and never launched a single attack wave.

**Twenty assertions passed on it.** They asserted that a job cost exactly its price — which it
did, the money was all spent — and never that the unit *arrived*. The `while (S.q[cat] && n++ <
60*180)` bound quietly expired and nothing noticed. The guard now tests for being **broke**,
which is what it was always for, and the suite asserts delivery, line-clearing, the
balance-empties-early case directly, and that a genuinely broke line still stalls and still
resumes.

Assert on the thing you wanted, not on the side effect you happened to measure.

### Named, not shipped: the IQ-derived build slowdown

    if (!House->IsHuman && Rule.Diff[...].IsBuildSlowdown) {
        time = time * Inverse(fixed(House->IQ + Rule.MaxIQ, Rule.MaxIQ*2));
    }

"The build time will range from double normal time at the slowest to just normal time at the
fastest." So in the original a computer house **never builds faster than a human** — the
slowdown is bounded to [1×, 2×] and derived from IQ rather than set per difficulty.

`RTS_DIFF.hard.build` here is **0.7** — faster than normal. That is a real divergence, but
correcting it is a difficulty redesign rather than a port: `hard` leans on that number, and
removing it would need compensation elsewhere. Recorded rather than smuggled in.

Same for `Start()`'s power floor: RA bounds `Power_Fraction` to a minimum of **1/16**, where
`RTS_LOW_POWER_MIN` is 0.28 — this game is 4.5× more forgiving of a browned-out base.

### Verified

29 assertions in `factory.js`: rifle, tank and heavy each costing exactly their price and
**arriving**, the same through a mid-build brownout, the balance starting at full price and
falling in step with progress, never going negative, a job whose balance empties early still
completing, a broke line still stalling *and* resuming, pre-placed structures knowing their
price, `CostBias` genuinely differing, a sale refunding half of what was paid, all three
difficulty/side combinations returning the same 0.500, `readyPaid` surviving from completion
to placement, abandon refunding exactly what was spent, queue-and-abandon being money-neutral
across eight rounds, and balance and purchase price both surviving save/load — plus a job
restored from a save written before `bal` existed still completing.

Regression: crate 36/36, burn 40/40, storage 34/34, save/load 31/31, verbs 26/26, mech 20/20,
armour 16/16, udata 13/13, idata 9/9.

Ladder **296 / 222 / 177 s** against 296 / 220 / 174. `easy` is identical seed for seed;
`hard` moves most, and that is the intended effect rather than noise — the opponent sells 21
times per five matches on `hard` against 5 on `easy`, and on `hard` it was the one collecting
the 62.5 % return.

### A trap in this repo's harnesses

Three separate measurements in this work were wrong before the code was, all for the same
reason: **the refinery you place to satisfy the tech tree ships a free harvester.** Its income
made a tank appear to cost −599 credits, made queue-and-abandon look like a 699-credit leak,
and funded a "broke" production line back up to 12 % progress. Zeroing the treasury does not
make a side broke; kill the harvester too, or measure `_rtsSpend`/`_rtsGrant` directly and
filter to the side you mean.

## Storage, and the silo — from BDATA.CPP

BDATA.CPP is the fifth data file in a row to confirm that the balance numbers live in
`RULES.INI` outside the repository — `Storage`, `Adjacent`, `Capturable`, `Power`, `Bib` and
the rest all arrive through `Read_INI`. What it does carry is a **mechanic** the economy was
missing entirely, and it turned out to be the largest gap any of these files has exposed.

### Two pools, not one

`HOUSE.CPP` does not keep a single balance. It keeps two, and BDATA's `Capacity` is the reason:

- **Credits** — money you were *given*: starting cash, a sale, a cancelled order, a thief's
  haul. Uncapped; nothing physical is holding it.
- **Tiberium** — harvested ore *sitting in your buildings*. Capped by the sum of every
  structure's `Storage`, and a harvester unloading above that cap loses the difference on the
  dock.

`Available_Money()` is the sum; `Spend_Money()` drains the stored ore **first**, so the cap keeps
biting until you have actually spent down. Collapsing them into one number makes the cap
meaningless — you would start the match already over capacity and never earn a credit again.

In `rts.core.js`: `rtsMoney(S)` to ask, `_rtsSpend` / `_rtsGrant` / `_rtsHarvested` to change.
The distinction is load-bearing in both directions — harvest is the *only* income the cap may
refuse, and a refund into a full store must still pay out in full.

**Scrap Silo**: 2×2, $150, +1500 storage, needs a Refinery. The Refinery itself stores 2000.
Nothing else in the game stores anything, so a player who never builds a silo is throwing away
every credit past 2000 — which is the whole point of the building existing.

### The two numbers here that were measured, not chosen

Both were found by measuring the opponent, and both are cases where the storage cap would
otherwise have been a straight nerf rather than a mechanic:

1. **Silo power draw: 0, not −10.** At −10 each, the dozen silos an overflowing opponent
   builds drew 130 power, browned its entire base out, and cost it enough production that the
   player lived **81 seconds longer** on seed 9004 (218 s → 299 s). A storage tank is passive.
   Giving it an appetite was the single most expensive invented number in this change.
2. **Silo limit: 14, not 6.** At 6 the opponent filled its 17,000 of storage on `normal` and
   then threw away 17,000 *more* credits over seven minutes — it has the income to overflow and
   not the production lines to spend it down. Raising the ceiling cut mean spillage on `normal`
   from 17,106 to 8,136. RA has no silo limit at all.

`RTS_AI.siloUrgent` (0.8) lets a silo jump the base plan when the store is over 80 % full,
mirroring `AI_Building` checking Tiberium against Capacity before anything else. Without that
rule the opponent loses the income and never buys the fix, because a silo sits behind the whole
defence tier in the build order.

### What was deliberately NOT ported

`Raw_Cost()` — `Cost_Of()` minus the free unit a building ships with. It exists to stop one
exploit: refunding half of a price that *includes* a free harvester pays you for a harvester you
are keeping. **It measured wrong against our numbers.** RA's refinery is 2000 with the 1400
harvester priced *into* it; ours is 1400 for the building with the harvester on top, so `cost`
is already the raw cost and subtracting the harvester again refunds **zero**. The first version
of the test "passed" on `0 ≈ 0`.

The exploit it guards is real here and is **left open on purpose** rather than fixed by stealth:
sell a refinery for 700, rebuild for 1400, and you have bought a 1400-credit harvester for 700.
Closing it means deciding what a refinery should cost, which is a balance change and not a
data-file port.

`IsCaptureable` **was** ported, as a defaulting flag the way the original has it — capturable
unless the type says otherwise. Walls and silos are not: there is nothing inside either for an
engineer to take over.

### Verified

34 assertions in `storage.js`: the two pools and their sum; starting cash not clipped by having
nowhere to put it; spending draining the store before credits and never going below zero;
harvest kept whole under the cap, clipped at it, and reported lost above it; a refund into a
full store paying out in full; capacity tracking live finished buildings (a silo under
construction stores nothing); a harvester spilling into a full store and *not* spilling with
room, measured on the opponent because it is the side that actually runs one; the warning firing
once and then holding its tongue; the thief taking a cut of stored ore rather than only loose
change; walls and silos refusing capture while a power plant still accepts it; and the sidebar
carrying both the storage bar and the silo cameo.

Regression: verbs 26/26, mech 20/20, armour 16/16, udata 13/13, idata 9/9, save/load 31/31.
Ladder **easy 296 s / normal 220 s / hard 174 s** against a baseline of 298 / 218 / 175 measured
on the same tree with the change stashed — the per-seed comparison is what caught the brownout,
since the mean alone read as noise.

### The sidebar

A storage bar under the credits ticker: green with room, amber past 85 %, red at the point where
a harvester's load starts being thrown away, with `stored / capacity` in the tooltip. Without a
readout the only sign that scrap is being lost is a line of text that has already scrolled off.

## Ore fields — from CELL.CPP

**`Tiberium_Adjust` sets a cell's density from how many of its EIGHT neighbours also carry
ore**, through a lookup table. That one rule is what makes a field read as a field — thick
core, thinning ragged edge — with no noise function anywhere:

```
static int _adj[9]    = {0,1,3,4,6,7,8,10,11};
static int _adjgem[9] = {0,0,0,1,1,1,2,2,2};   // and clamped to 2
```

Run the adjust **last**, after terrain generation and base placement. Both of those erase ore,
and a cell's level is a function of how many neighbours still have some, so adjusting earlier
bakes in counts that no longer describe the field.

**The gem table is the whole gem economy.** A gem cell tops out at 3 steps where gold reaches
12 — and `Tiberium_Adjust` prices a gem step at `Rule.GemValue * 4` against `Rule.GoldValue`
for gold. So per *step* gems are worth **12.6×**, and the familiar ~3× only appears per *tile*
because of the cap. Using the bare 110/35 ratio per unit mined, together with the cap, made a
gem tile worth **less** than a gold one (measured 344 against 419) — exactly backwards for the
deposit both bases are supposed to fight over.

- Gem patches must stay **small**. A harvester bay full of gems is worth an order of magnitude
  more than the same bay full of gold; fields sized for a flat 3× multiplier left the AI on
  90k credits it could not spend. Small patch, no regrowth, enormous payout.
- **Bound the harvester's gem preference separately from the price.** `Goto_Tiberium` just
  takes the closest patch; preferring gems at all is this game's idea. Dividing the trip by the
  full 12.6× sent every harvester on the map to the middle.

**`RTS_ORE_RICHNESS` scales the whole table.** `_adj` puts most of a blob at 7–8 neighbours and
therefore near the top of the table — nearly twice what a radial falloff averages. Scale the
density rather than shrinking the fields: the footprints are what refinery placement and
harvester routing navigate by, and pulling ore away from the bases stopped the Commando AI
expanding at all (19 buildings down to 8).

**Spread**: `Spread_Tiberium` picks a random starting facing and then walks **all eight**,
taking the first cell that can germinate. Picking one direction and giving up when it fails
biases growth to the cardinals and leaves permanent holes inside a field. `Can_Tiberium_Germinate`
also refuses ground that could not be *built* on, which is stricter than "passable" — ore
creeping over a road quietly makes unbuildable ground minable.

**Growth and spread are separate questions.** `Can_Tiberium_Grow` stops at level 11;
`Can_Tiberium_Spread` wants level > 6. A single `if (full) continue` above both lists meant
tiles at full density never spread — and a full tile is the likeliest seeder there is. Over
eight minutes that bug produced **10 new cells where the fix produces 417**, which had been
quietly starving the whole economy: the Recruit AI's income was 3,740 credits per eight
minutes, less than one harvester load a minute for two harvesters.

That last one is worth remembering when a difficulty number looks "right". Recruit's 15-unit
army was a number a bug produced. With ore spreading it fields ~48 — and the ladder is
unchanged where it counts, because its units are individually far weaker (fire 0.75 against
1.15, armor 0.7 against 1.2). Measure the ladder by **how long an idle player survives**
(easy ~300–380s, normal ~222–225s, hard ~164–205s), not by counting units.

## Crates — from CRATE.CPP

CRATE.CPP is the spawn/place/remove half. A crate is a map **overlay**, not an object:
`Put_Crate` stamps one into a cell, `Get_Crate` clears it. The load-bearing idea is that
crates **do not accumulate** — each carries a timer, and `Create_Crate` removes whatever the
slot was tracking before placing a new one, so the map holds the same number however long the
match runs:

    Timer = Random_Pick(CrateTime * TICKS_PER_MINUTE/2, CrateTime * TICKS_PER_MINUTE*2)

...so a crate lives between **half and twice** `CrateTime`. Placement re-rolls a random
location until the cell is clear to build.

### What the file does not contain

**The effects.** CRATE.CPP creates, places and removes crates and says nothing about what is
inside one. `RTS_CRATES` is ours, built from the crate **animations** in ADATA.CPP — `DOLLAR`,
`ARMOR`, `FPOWER`, `RAPID`, `SPEED`, `INVUN`, `MINE`, `GPSBOX` and the rest are the powerups
the original shipped, because each one needed art. What each is *worth* here is a balance
decision this repository is making, not a quotation, and the file header says so.

Nine kinds: money, repair kit, armour, firepower, rapid reload, engine tune, map data, an
abandoned vehicle, and a booby trap. The mine is the reason driving over an unknown crate is
a decision rather than free loot.

Bonuses ride the **unit** that collected them (`e.cr`), multiplying the house-wide difficulty
bias rather than replacing it — `rtsCrateMult` next to `_rtsBias`. They stack and are capped,
and `rof` is the odd one out: lower is faster, so its cap is a **floor**.

### Water crates are deliberately not ported

`Is_Clear_To_Build(SPEED_FLOAT)` means clear for something that **floats**, and a crate
bobbing in the sea is collectable in the original because RA has ships. This game has none
and its water cells are blocked outright, so a water crate would be loot nobody could reach —
and worse than useless, because it would hold one of three crate slots hostage for its whole
lifetime. Measured before it was cut: the placement search rejected every water cell and fell
through to land **120 times out of 120**, so the branch was already dead code pretending to
work. The test now asserts the absence.

### The measurement that mattered

Crates moved the `hard` ladder from 174 s to 183 s. That looked like a real balance change and
it was not: logging every pickup showed **zero crates collected** in the seed that moved most.
The cause was that placing three crates at map setup draws from the **main RNG stream**, which
shifts every subsequent roll and turns every seeded scenario into a different battle.

Crates now draw from their own generator seeded off the map seed, exactly as ore growth
already does. With that, all fifteen ladder seeds are **byte-identical** to the run before the
feature — which is the only honest way to claim a new subsystem changed nothing it shouldn't.

The corollary is worth stating plainly: **crates are nearly inert in the idle-player
benchmark**, 0–2 pickups per match, because the benchmark player never moves and neither side
seeks them out. No crate-seeking AI was added. In real play a human moves units constantly and
will meet them far more often.

### Verified

36 assertions in `crate.js`: the full complement at match start, every crate on clear
buildable ground and never inside an ore field, no two sharing a cell, lifetimes inside the
half-to-twice `CrateTime` window, expiry **replacing** rather than deleting and the count
staying pinned across a ten-minute match, pickup removing the crate and spawning a
replacement, money paying inside its declared range **and surviving a full store because it is
a grant rather than harvest**, bonuses landing on the collector and being read by
`rtsCrateMult`, stacking capped in both directions, and — the ones that matter — each of
firepower, reload, armour and speed measurably changing damage dealt, damage taken and
distance travelled rather than just sitting on the object. Plus heal, shroud lift (and *not*
lifting the player's shroud when the opponent collects it), free vehicle from the declared
list, the mine hurting its opener and being nobody's kill, both sides collecting, crates and
bonuses surviving save/load, and no crate ever placed where nothing can reach it.

Regression: burn 40/40, storage 34/34, save/load 31/31, verbs 26/26, mech 20/20, armour 16/16,
udata 13/13, idata 9/9. Ladder **296 / 220 / 174 s**, identical seed by seed.

## Structures animate

Taken from `BUILDING.H` in the GPL Red Alert source, which is a game-logic header but says
plainly what is meant to move — a structure is not one static bitmap:

- `MAX_DOOR_STAGE 18` / `DOOR_OPEN_STAGE 9` — the War Factory door is an animation, wide open
  at stage 9. Driven here off whether a vehicle is on the production line.
- `BState` / `QueueBState` — buildings have an idle look and a working look. Refinery and
  power plant blink while running.
- `Mission_Construction` — a placed structure assembles rather than sliding up out of the
  ground: rising reveal, a bright beam at the leading edge, and stippled rows above it so
  the boundary dissolves instead of being a hard horizontal cut.
- `Drop_Debris()` — a dying structure throws debris and fires secondary blasts across its
  footprint on a delay, instead of vanishing under one puff.

Animation state that is purely visual (door stage, blink phase) lives in `_rtsR.anim` keyed
by entity id, **not** on the entity — the simulation stays renderer-free, which is what lets
a whole battle be stepped headlessly.

Five more from this header, all of them things a building needs in order to feel like an
object rather than a token:

- **`CountDown`** — "if the building is destroyed, it won't actually be removed from the map
  until this value reaches zero. This delay is for cosmetic reasons." A structure deleted on
  the frame it dies leaves its own explosion hanging over bare grass. The wreck now stays for
  `RTS_WRECK_TIME`, darkening and sinking with fire on it, and is removed after. This is also
  what finally reaps the entity list: nothing ever set `reaped`, so dead entities accumulated
  in `G.ents` for the whole match.
- **`Grand_Opening` guarded by `HasOpened`** — the flag exists so that "multiple inadvertant
  calls to Grand_Opening won't cause problems", which is the exact bug that once gave every
  constructed refinery two harvesters (granted at placement *and* again on completion). The
  guard makes it impossible rather than merely fixed.
- **`Docking_Coord`** — a harvester drives to the refinery's dock face, not its centre.
  Measured as **income-neutral** (A/B over three seeds × four minutes: 33.6k vs 34.4k, seeds
  disagreeing on direction) — it is a positional fix, so harvesters queue on one side instead
  of piling up on whichever side they happened to arrive from. Don't claim it earns more.
- **`Flush_For_Placement`** — units do not block a structure going up, so anything standing on
  a new footprint is shoved clear. Once the AI started building enough structures it landed
  on its own army, leaving units embedded in walls.
- **`WhoLastHurtMe`** and **`IsSurvivorless`** — a thing that burns to death is still someone's
  kill (scoring off the victim's side alone credited the player for units the AI's own fires
  finished off), and a building that burned down has no crew left to run out of it.

## Structures have a life — from BUILDING.CPP

The implementation file, and it is mostly about a building being a *thing that runs* rather
than a lump of hit points:

- **`Power_Output()` is `Class->Power * fixed(LastStrength, MaxStrength)`** — a damaged power
  plant supplies proportionally less. That one line makes raiding the generators a real tactic
  instead of an all-or-nothing demolition job. **Drain is not scaled**: a wrecked refinery
  still eats its full draw. Output now moves with hit points, so `_rtsRecalcPower` runs every
  tick rather than only when something is built or dies.
- **`Exit_Object()` / `Find_Exit_Cell()`** — a new unit walks out of a clear perimeter cell,
  scanning outward ring by ring and preferring the building's exit side. Harvesters leaving a
  refinery exit to the south-west and are given `MISSION_HARVEST` immediately. Units used to
  appear at the building's centre and shove their way out through the walls.
- **`Repair_AI` is a toggle, not a button press.** It spends `Repair_Cost()` every
  `Rule.RepairRate` for `Repair_Step()` hit points, blinks `IsWrenchVisible`, and gives up on
  its own when the money runs out — and the AI *sells* a building it cannot afford to fix once
  it is below `ConditionRed`. Repairing costs a fraction of rebuilding, which is the entire
  reason to do it.
- **`Sell_Back` / `Mission_Deconstruction`** — the build-up animation runs backwards, then the
  crew walks out. Refund is `RefundPercent`, docked for damage. The Command Yard is not
  sellable here; losing it is a loss condition.
- **`How_Many_Survivors()`** = `Bound((Raw_Cost * SurvivorFraction) / cost of an E1, 1, 5)`.
  `Drop_Debris` rolls only some of them out of a wreck, and they come out at `PANIC` fear so
  they scatter — a building falling over should read as people dying, not a prop being
  removed. A sale releases all of them, calmly.
- **`shakes = Class->Cost_Of() / 400`**, then `Shake_The_Screen(shakes)`. The integer division
  is the point: a 300-credit power plant does not move the camera at all while the war factory
  rattles the whole screen, so the shake reports what you just lost.
- `Drop_Debris` also marks **every cell** the building stood on — a quarter scorched, the rest
  cratered.

Repair and sell are sidebar *modes* (`_rtsUI.mode`), armed by a button and spent on the next
click, competing with structure placement for that click — arming one cancels the others.
