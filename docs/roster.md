# The roster — what was added, and why each addition is a verb

Content rather than mechanism: the units and structures this game has beyond the opening
six-and-five, and the rule every addition was held to — a new entry has to add something a
player can DO, not another damage number. Entries live in `src/rules/`, models in
`src/sprites/`.

> Reference, split out of `CLAUDE.md`. The rules that must be followed before touching
> anything are still in `CLAUDE.md`; this is the working behind them.

## The roster: nine and nine, not five and six

Asked why the game was limited to so few buildings and units. There was no reason. Every file
pasted into this project has been a *systems* file — AI, teams, triggers, saves, selection — and
content is not a port: it is entries in `rts.rules.js` plus models in `rts.sprites.js`. Nobody
asked, so it never happened. The data layer already supported all of it: `needs` (a real tech
tree, and it works on **units** as well as structures), `produces`, `freeUnit`, and a per-structure
`weapon`. Adding content was data and models, not plumbing.

**Structures 6 → 9.** Radar Dome (needs refinery), Tech Center (needs radar), Rocket Turret
(needs factory). **Units 5 → 9.** Grenadier, Light Tank, Artillery and Heavy Tank — the last two
gated behind the Tech Center.

Each new weapon exists to beat something specific, so that a bigger roster is a set of answers
rather than "buy the dearest thing you can afford": grenades arc (murder on anything stationary,
useless against a moving tank); artillery reaches 34 against the Gun Turret's 22, which is the
whole reason to buy one; the Rocket Turret is deliberately poor against infantry so cheap
riflemen stay the correct answer to a wall of them.

**The Radar Dome does something.** No dome, or the base browned out, and the map panel goes dark —
and a dark panel neither draws, nor jumps the view, nor accepts orders. All three go through one
`_rtsRadarLit()` so they cannot disagree. That is what makes bombing the dome worth doing.

### The degenerate AI mix, and why weights are load-bearing

The opponent's unit choice was a hardcoded if-chain, which is a large part of *why* the roster
stayed at five: adding a unit meant editing the AI's brain. It is now `RTS_AI.mix`, a table of
`{key, at, w}` per production line, and `RTS_AI.buildOrder` for structures.

The first version walked that table best-first and took the first affordable hit. **Measured over
three seeds at eight minutes that produced 461 grenadiers and 14 rocket soldiers** — whatever sits
at the top is the only thing ever built, so the opponent had silently stopped fielding anti-armour
infantry altogether. (The old if-chain had the same bug; it just happened to sit on `rocket`.)
Weighted choice among everything affordable fixed it: rifle 170 / rocket 211 / grenadier 158 /
tank 74 / light 62 / buggy 45 / arty 18 / heavy 21 — all nine types, a combined-arms army.

### Balance held

easy 293→**297** s, normal 218→**217** s, hard 176→**170** s. The ordering and the tight per-seed
spread survive a roster that nearly doubled, with the opponent now fielding heavy tanks and
artillery. Enemy structures on hard went 20→18 and units 100→115, which is the defence ratios
being split between Gun and Rocket Turrets.

### The sidebar

Nine structures overflowed the build grid. It always scrolled, so nothing was unreachable — but
**a list that scrolls with no sign that it scrolls reads as a list that has been cut off**, which
is exactly how it looked. Tile aspect 1.16 → 1.02 (1.05 left it nine pixels short, the most
annoying possible margin) plus a fade at the panel's bottom edge. On a short window the build tab
went from four visible tiles to six; infantry and vehicles no longer scroll at all.

Verified: 15 assertions in `content.js` — every roster entry bakes to a non-empty sprite, the
three tanks are three different sprites, each `needs` gate actually locks its unit, the radar
lights on a dome and goes out on a brownout and refuses to command while dark — plus the AI
building and fielding every new type across three seeds, the full ladder, and `unitzoom.js`
clipping checks on all nine units at all eight facings.

## Four more verbs, and the reference documents

Handed the CNCNZ pages for Allied/Soviet units and structures plus the patch history. Costs and
prerequisites for anything this game also has are now the reference's, and four more units were
added that each add a VERB rather than another damage number.

**Field Medic** — a passive aura, not an order: heals friendly *infantry* in a radius, every tick,
whatever else it is doing. "Cannot heal himself" is from the reference and stops a pair of medics
being an immortal blob. Same shape as the Service Depot's repair field; one is for people, one for
vehicles.

**Thief** — walks into an enemy refinery and takes half that side's credits. Same walk-in as
capture, different payload, spent the same way.

**Commando** — C4. Instantly levels any building she can reach: no damage roll, no armour table.
She survives, unlike the engineer and the thief, which is why she costs 1200 and is capped at one
at a time by a new `only` field (which counts what is standing *and* what is in the queue, or you
could stack three before the first appears).

**Attack Dog** — "extremely effective against infantry, completely worthless against vehicles and
structures". A `0` in the weapon's `vs` table is the entire implementation.

Plus **Advanced Power Plant**, **Kennel** and **Flame Tower** — the last of which "damages nearby
units and structures if destroyed", friendly ones included, which is why you do not build a row of
them through the middle of your own base.

### Three bugs behind one symptom

The commando would not blow anything up. She walked toward the target and then orbited it at a
constant 12-14 units for the whole test. Three separate causes, found by tracing rather than
reading:

1. **Pathing to a building's centre is pathing into blocked ground.** A footprint is blocked, so
   the route resolves to "somewhere near it" and the unit circles. `_rtsApproach` returns a point
   just outside the nearest footprint edge, on the side the unit is already on.
2. **`_rtsDamage` scatters infantry on every hit.** A directed unit walking into a defended base
   had its path rewritten to a random cell several times a second. Fear was the obvious suspect
   and was *not* the cause — `_rtsFearAI` was innocent, `_rtsScatter` from the damage path was
   not. Specialists (`capture`/`steal`/`demo`/`heals`) no longer scatter or panic; the reference
   argues for it, since the Commando "can never be put in guard mode".
3. **A consumed path is not a null path.** `e.path` stays truthy with `e.pi` past its end, so
   `if (!e.path)` never re-paths and the unit parks wherever the route ran out — in this case
   5.3 units from a 5.2 threshold, stuck by a tenth of a unit. The walk-in branches now re-path
   on `!e.path || e.pi >= e.path.length`, and the approach point is 0.85 of a tile out rather
   than a whole one (`_rtsWX` returns cell *centres*, so a full tile overshoots).

Any one of the three alone would have hidden the other two.

### From the patch history

Patch 3.03 limited multi-factory production speedup to two factories. `RTS_AI_MAX_LINES` was
already 2, chosen independently — a confirmation rather than a change. Patch 1.08's "starting
points are more random" is the SCENARIO.CPP work already shipped. The rest of that document is
Westwood Online matchmaking and does not apply.

### Verified

24 assertions in `verbs.js` on top of the existing suites. Ladder easy 297 s / normal 217 s /
**hard 174 s** (from 170 — the opponent now spends on kennels, flame towers and advanced power,
and its defence ratios split further). mech 20/20, save/load 31/31, no baked frame clips its
canvas across all 15 units at 8 facings, all 15 structures exactly footprint+headroom.

**Four harness bugs, all mine.** Two arithmetic (a thief test that compared end balances while
the opponent went on earning and spending — measure the *transfer*; a `hp > 240` where the rate
gives exactly 232). Two timing (a commando asserted alive 8 s after demolishing a building while
standing in a defended enemy base — stop *at* the demolition; and an `only:1` test on a player
with no Barracks and no Tech Center, which passed for entirely the wrong reason).

## Capture, repair and walls — mechanics, not rows

Asked for more. Rows are cheap; the things that change how the game is *played* are the ones
that add a verb. This batch adds three, plus the cheap defences the early game was missing.

**Engineer → capture (MISSION_CAPTURE).** Right-click an enemy *building* with an engineer
selected and it walks in and takes it. The unit is spent doing it, which is what stops the whole
thing being free: 600 credits and a walk across the map buys one structure, and the structure
keeps whatever damage it already had (floored at 25%, so you cannot capture a 3-hp shell).

Everything derived from ownership has to move with it, and this is the checklist:
- **Power** is a per-side sum, so *both* sides recalculate.
- **The footprint's `owner` map is keyed by entity id, not side**, so it needs no change at all —
  which is exactly why it was built that way.
- **The blueprint node moves** (`_rtsBaseDropNode` then `_rtsBaseAdd`), or the previous owner
  spends the rest of the match trying to rebuild a building standing right there in your colours.
- Anything of the new owner's that was shooting at it stops.

The engineer branch sits **before** the engage block in `_rtsUpdateUnit`, deliberately: it has no
weapon, and letting it reach the acquire-a-target path leaves it standing in the open aiming at a
tank. It also never holds an order it cannot fulfil — no route means the order is dropped.

**Service Depot.** Park a damaged *vehicle* on it and it is repaired free, at `repairRate` hp/s.
Infantry are excluded, as in the reference: a depot repairs vehicles, it does not heal people. It
needs power like everything else, so browning out the base stops the repairs.

**Walls, Pillbox, Flame Squad.** Walls are 1×1, block their cell, have no weapon, and chain —
a wall is itself a valid anchor for the next one. The Pillbox is the answer to an early infantry
rush at a point where a Gun Turret is unaffordable. The Flame Squad has the shortest range in the
game and the highest damage per second in it.

**No engineer in the AI's mix, on purpose.** Capturing is a decision about a specific building at
a specific moment; an AI that buys engineers without a plan for them donates 600 credits to
whatever shoots them first. `wall` is out of `buildOrder` for the same reason — an AI that cannot
plan a line just scatters concrete.

### Numbers taken from the reference

Where the reference gives a figure for a structure this game also has, it is used verbatim:
Radar Dome $1000 / −40 / needs Refinery; Service Depot $1200 / −30 / needs War Factory; Pillbox
$400 / −15 / needs Barracks; Concrete Wall $50, no power, **no prerequisite** (the one thing
buildable from the first second of a match); Tech Center $1500 / **−200** / needs War Factory +
Radar Dome. −200 is two whole power plants, and that is the point — the tech tier should cost an
economy, not a line item.

The long-tuned figures are deliberately **not** retrofitted. The reference prices an Ore Refinery
at $2000 against this game's $1400, and the whole difficulty ladder is calibrated against the
existing economy. Matching a number for its own sake would move the ladder for no gain.

### Verified

20 assertions in `mech.js`: capture converts the building, spends the engineer, does not repair
it, moves power and the blueprint node, stops friendly fire at it, refuses a building already
yours, drops that pointless order rather than looping, never acquires a shooting target, and
drops an unroutable order. Depot repairs a parked vehicle at exactly its stated rate, ignores one
out of range, ignores infantry, stops at full health, and does nothing while browned out. Walls
block, chain, unblock on death and never shoot.

Ladder unchanged at easy 297 s / normal 217 s / hard 170 s, seed for seed, including after the
Tech Center's power draw went to −200. The opponent builds all of it (pillbox 10, depot 2 across
three seeds) and fields flame squads (83).

**Two harness bugs, both mine, both arithmetic.** The depot test wanted `hp > 240` when 22 hp/s
× 6 s = 232 exactly — assert the *rate*, not a number picked by eye. And the "unreachable capture"
test put its fake building at tile (2,2), which is merely a long walk; the engineer was correctly
still walking. Off-map is unreachable; a far corner is not.
