# The roster — what was added, and why each addition is a verb

Content rather than mechanism: the units and structures this game has beyond the opening
six-and-five, and the rule every addition was held to — a new entry has to add something a
player can DO, not another damage number. Entries live in `src/rules/`, models in
`src/sprites/`.

## Names: the code keys are old, the names are Breachwater's

The records below use the names the units had when they were written. The keys never changed,
because saves and specs hold them. A player sees only the names in the tables:

| Army key | Name (short / full) |
|---|---|
| `allied` | Compact / Meridian Compact |
| `soviet` | Dominion / Basalt Dominion |

| Key | Was | Is |
|---|---|---|
| `v2rl` | V2 Rocket | Longshot Rocket |
| `heavy` | Mammoth Tank | Bulwark Tank |
| `thief` | Thief | Infiltrator |
| `tanya` | Commando | Breacher |
| `heli` | Attack Heli | Wasp Gunship |
| `tran` | Chinook | Skylift |
| `mig` | MiG | Kestrel |
| `yak` | Yak | Shrike |
| `lst` | Transport | Landing Craft |
| `factory` | War Factory | Vehicle Works |
| `radar` | Radar Dome | Radar Post |
| `lab` | Tech Center | Research Lab |
| `depot` | Service Depot | Repair Bay |
| `apower` | Adv. Power Plant | Fusion Plant |
| `tesla` | Tesla Coil | Arc Tower |
| `mslo` / `nuke` | Missile Silo / Atom Bomb | Sunfall Silo / Sunfall |
| `iron` / `ironcurtain` | Iron Curtain | Bastion Generator / Bastion Field |
| `pdox` / `chrono` | Chronosphere | Rift Gate / Rift Jump |
| `gps` | GPS Uplink / Satellite | Skyeye Uplink / Satellite |
| `mist` / `fogbank` | (new) | Mist Tower / Fog Bank |
| `spire` / `thunder` | (new) | Storm Spire / Thunderhead |

`unit/brand` keeps the old names out of every string in `src/`.

> Reference, split out of `CLAUDE.md`. The rules that must be followed before touching
> anything are still in `CLAUDE.md`; this is the working behind them.
>
> The sections below are dated records. They name files as they were then: `rts.rules.js` is
> now `src/rules/`, `rts.sprites.js` is `src/sprites/`, and the old harnesses (`content.js`,
> `verbs.js`, `mech.js`, `unitzoom.js`) became specs under `test/`. The `add-unit` skill
> (`.claude/skills/add-unit/`) is the current checklist for a new entry.

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

## The Chinook — an air lift

The Allies' transport helicopter (RA's TRAN), built at the Helipad. The verb is the one no ground
transport has: five infantry put down beyond a channel, a cliff or a wall, where no road reaches.
It is unarmed, slower and thinner-skinned than the Attack Heli, so a lift caught over the
enemy's guns loses all five. Load it by right-clicking it with a squad selected; right-click open
ground with it loaded and it flies there and puts them down.

Three mechanisms came with it:
- an unarmed aircraft never flies home to reload (`_rtsAirTick`);
- a transport sets down onto open ground while it waits (`_rtsAirSettle`, `land` 0 to 1);
- `RTS_AIR_PARTS.rotors` draws one rotor mesh over each of several hubs, so its two rotors turn
  over their own hubs, in opposite directions.

The opponent does not build it, because it is a plan-dependent unit (see above).

### Verified

`unit/chinook`, `e2e/chinook`, and the rotor hubs in `unit/motion`. Ten mutants, each red on its
own assertion.

## The Flak Track — anti-aircraft that keeps up

Both armies' half-track with twin flak guns, built at the Vehicle Works once there is a Radar
Post (`flaktrack`, weapon `trackflak`). The verb is ESCORT: before it, everything that could shoot
down an aircraft either stood still (the AA Gun, the Rocket Turret) or walked (the Rocket Squad),
so a gunship could take a tank column apart anywhere outside a base. Its guns are aa-only, like
the AA Gun's; its sight of 26 is what lets it see a gunship standing off at 20 to fire at the tank
beside it, and close.

The opponent buys it against the sky only (`vsAir` on its mix entry, `_rtsAIWantsVsAir`): one for
every two aircraft the player has up, none while the sky is empty.

Staging the fight found **the air/ground contract had never held for units.**
- No unit ever acquired an aircraft by itself. Its own acquisition called `_rtsFindTarget`
  without a weapon, and with no weapon in hand every aircraft was refused and every ground
  target allowed. A Rocket Squad watched a gunship work over the tank beside it, and an aa-only
  gun was free to shell the ground. A target now counts if any gun aboard can engage it
  (`_rtsGunEngages`, `_rtsCanEngage`).
- Any armed unit a gunship hit shot it down. Retaliation checked only the armour modifier, so a
  tank's cannon took 125 off a 200 hp gunship in one round. Retaliation, attack orders and the
  engage step now all ask whether a gun can engage. As a result, a lone gunship now kills a lone
  Battle Tank with its eight missiles, as its rules always said it would. With a Flak Track
  beside it, the tank comes through at 67%.

The ladder did not move on any rung, seed for seed: an idle player is overrun before aircraft
matter. That is not evidence that the air war is balanced. `unit/flaktrack` stages it instead.

### Verified

`unit/flaktrack` checks the fight with and without cover, never aiming at the ground, every road
by which a target arrives, a Rocket Squad acquiring a gunship unprompted, and the opponent's real
buy loop. `unit/motion` now measures the front of the TRACK rather than of the model, because a
half-track's steered wheels lie ahead of its sprocket. Ten mutants were killed. The one that
survived, the flak's reach cut from 22 to 19, showed that its sight carries the escort, not its
reach, and the comment says so.

## The Mine Layer — denial

Both armies' tracked layer, built at the Vehicle Works once there is a Repair Bay (`minelayer`).
The verb is DENIAL: a road, a ford or a gap in a wall that the enemy pays to cross. It is unarmed
and carries five mines. It lays one where it stands on D or DEPLOY (the MCV's order, so a phone
has it too; on a deck or a dried flat it says why not), and a powered Repair Bay loads them back.

How a mine behaves (`core/mines.js`):
- Mines live in `G.mines` beside the crates, not as entities. Nothing targets them and no base
  counts them, and they are saved with the rest of G.
- A mine arms 1.5 s after it goes down. This is what stops it being dropped under an enemy's
  feet as an instant weapon.
- It is set off by the first ENEMY ground unit, vehicle or infantry, that stands on its cell.
  Aircraft pass over.
- The unit that sets it off takes the whole charge (380). A splash alone falls off so steeply
  that a tank on the edge of the cell took a fifth of it. The blast around it is a splash of 120
  that spares that unit and spares no one else, the layer's own side included.
- A side sees only its own mines: a dark disc ringed in its house colour on the overlay,
  blinking until armed.

The opponent does not build one yet: where to mine is a plan, like the engineer's capture.

### Verified

`unit/minelayer` covers laying, the load, arming, its own side, a tank, a squad, an aircraft,
the hidden rule, the restock and the save. `e2e/minelayer` covers the D key, the DEPLOY button by
a real click, and the overlay drawing ours and not theirs. Twelve mutants were killed. The
arming mutant survived the first set, because the side check already spares the layer. That
showed what the delay is really for, and the test for it is the one above.

## The Bridge Layer — a crossing where the map has none

Both armies' tracked layer, built at the Vehicle Works once there is a Radar Post
(`bridgelayer`). The verb is the CROSSING: a river or a channel the map gave no bridge over,
spanned where the player chooses, so an army can come at a base from the side it isn't
watching. At the water's edge, D or DEPLOY turns the vehicle into a one-lane bridge of up to
eight cells across the gap ahead. It tries the way it faces first, then the other three - at low
water from a dried flat too, across what is still wet (`_rtsBridgeGap` reads `G.tideDry`). The
vehicle is the span, as the MCV is the yard.

The bridge is exactly the generator's kind (`core/bridge.js`): a record in `G.bridges` and its
water cells opened to land units. The pathfinder, the deck a unit stands on, the radar and a
save all treat it like any other bridge. Two things were added to make that work in play:
- The 3D mesh was built once per map, so a laid bridge bumps `G.bridgeRev` and the renderer
  rebuilds.
- The generator's ACROSS, NOT ALONG rule (`_rtsBridgeAcross`) is now shared. Without it, the
  first render showed a layer on a beach laying a pier down the shoreline over an inlet.

On seed 4242, the best gap it finds leads to ground no tank could reach before; laid, it is a
straight 36-unit drive.

The opponent does not build one: a crossing is a plan.

### Verified

`unit/bridgelayer` covers the generated map's worst gap, laid; the path before and after; a tank
driving over the deck; a ship under it; and four refusals: dry land, a second deck, a pier, and
facing (on a dug fork). `e2e/bridgelayer` covers the D key and the 3D mesh appearing over the
water. Ten mutants were killed. Two guards survived and say so:
- the zero-length run was redundant with the across rule, and is gone;
- "never from the water" is kept as a guard that no generated map reaches.

## The Hovercraft — the beach

Both armies' hovercraft, built at the Vehicle Works once there is a Radar Post (`hovercraft`).
The verb is the BEACH. It drives on land and on open water alike, so five men can be carried
down a river, across a bay and up the far beach without a landing craft or a bridge. It is fast
and thin-skinned, with a machine gun for the men waiting on the sand. Torpedoes run under it.

It is the third movement domain, `'hover'` (`core/grid.js`):
- Its ground is open water as a ship has it, plus everything a land unit may cross. A structure,
  a shipyard's water, rock and trees still stop it.
- Its paths are pulled straight against its own domain (a hull's never are). It crowds with what
  shares the ground under it (core/move.js). Afloat, a squad boards it from three cells off, as a
  craft; U or the sidebar's UNLOAD puts the men down (`_rtsUnloadSelected`, the DEPLOY shape); over
  water it rides the swell, and the pointer offers it a move there (ui/hud.js, its own domain).
- Killed over water it goes down like a ship: no debris thrown up, no fire on the waves.
- It wakes over water and leaves no treads anywhere.

On seed 4242 the gap a tank drives 407 units round is a straight 32 for the hovercraft, and a
squad of five boards on one bank and is put down on the other. The opponent does not build it:
a landing is a plan.

### Verified

`unit/hovercraft` covers the domain cell by cell, the short way, the slanting leg, five men
across, a wreck afloat and ashore, and the torpedo. Six mutants were killed. The pulling mutant
survived the first set, because a straight crossing needs no pulling; a slanting run across open
water (11 waypoints without it, 1 with) is the case that kills it.

## The Mine Sweeper — clearing

Both armies' unarmed tracked flail (`sweeper`), at the Vehicle Works. A minefield had no answer
but a lost tank; this is the answer (`core/sweeper.js`):
- Every enemy mine within 4 cells is SEEN by its side from then on (`m.seen[side]`, read by
  `_rtsMineShown`) and drawn ringed in the enemy's colour.
- A seen mine within 1.5 cells is beaten out in 1.5 s. Left idle, it drives to the nearest one;
  refused a route (walled in, across water) it asks again in 2 s, not every tick (`u.noRouteT`).
- It never sets a mine off (`_rtsMineTick` asks `sweeps`).
- The opponent buys one once a player mine has cost it a unit somewhere not yet swept
  (`G.mineHits`), and sends it round those places, nearest first; a place swept is struck off.

`unit/sweeper` (14 assertions, its mutants killed) and `e2e/sweeper` (the found mine drawn, a real
click on the list).

## The Spotter — seeing for others

Both armies' fast four-wheeler with an optics mast (`spotter`), behind a Radar Post. Fog and the
Fog Bank blind the long guns most; this is their eyes (`core/spotter.js`):
- Its own sight (nine cells) is never capped by fog, a sandstorm or a fog bank, and ground in a
  bank is not hidden from it.
- Anything inside its sight is SPOTTED for its side (`G.spot`, rebuilt each tick): every gun of
  that side finds a spotted target at full reach, fog or no fog. On a clear day it changes nothing.
- The opponent buys one in fog when it has a long gun, and keeps it four cells ahead of the
  nearest one, toward the player's base.

`unit/spotter` (13 assertions, 10 mutants killed; the duel is also run through `_rtsTick`).

## The Repair Truck — mending in the field

Both armies' six-wheeled workshop truck with a crane (`repairtruck`), behind a Repair Bay. The
Field Medic's aura (`heals`) pointed at vehicles by `healKind`: every friendly vehicle within 2.5
cells comes back at 12 hp/s, for free, whatever the truck is doing; not itself (`core/repairtruck.js`).
- Left idle it drives to the nearest damaged vehicle within 10 cells it can get its aura onto;
  one it is refused a route to is passed over for 10 s (`u.noFix`), and the next one mended.
- The opponent buys one once its field army has six armed vehicles; with nothing to mend, its
  truck follows the largest team on the march, four cells behind.

`unit/repairtruck` (13 assertions, its mutants killed; the medic still mends only infantry).

## The Jammer — concealment

Both armies' tracked antenna carrier (`jammer`), behind a Radar Post (`core/jammer.js`). Parked
2 s, its field (4 cells) jams its side's UNITS, never buildings: unseen by the other side unless
something of it is within 2 cells or its Spotter sees them; found by no gun and picked by no team
from further off; a unit that fired in the last 3 s is not jammed. The enemy radar shows static over
the field where its ground is explored (`_rtsRadarStaticShown`); a jammed unit leaves no dust, smoke
or tracks (`_rtsEffectsSeen`). The opponent buys one once the player has two armed buildings and it has
four armed vehicles, parks it amid its largest LAND team on the march, and mends it when battered.

`unit/jammer` (15 assertions, 12 mutants killed) and `e2e/jammer` (the radar's static, 2 mutants).

## The Sky Crane — armour by air

The Dominion's flying crane (`skycrane`), behind an Airfield: the Skylift's verb for one vehicle.
It is the transport rules (`carries:1, takes:['vehicle']`); a vehicle ordered onto it boards - a
Harvester too, which walks onto it before its own economy loop runs - and an unload order sets it
down anywhere. The load hangs under its legs by its own height (unit3d.js `R3D_SLING_GAP`), scorched
and smoking as it is hurt; a loaded crane never settles. Shot down over land the load is set down;
over water it sinks with it, no husk, no wreckage. The opponent does not build it (see the Bridge Layer).

`unit/skycrane` (14 assertions, 7 mutants) and `e2e/skycrane` (passengers not drawn, the load drawn).

## The opponent uses the new vehicles

- **The Mine Layer mines its approach** (`core/aimines.js`):
  - The field is planned once a match, from the land route between the two yards: route cells
    9 to 18 out from the opponent's yard, with a cell either side.
  - The layer works through them, lays on a cell beside it when a move order stops it a cell
    short, sets a cell it is refused a route to aside for `RTS_AI_MINES.retry` s, and reloads at
    the Repair Bay.
  - Bought OUTSIDE the weighted roll (`_rtsAISupport`): no layer alive, a field to lay, the
    vehicle line free, and the price out of genuine surplus above the base plan. As a mix entry
    it moved every roll after it (the Soviet opponent stopped reaching its Arc Tower in
    `e2e/basedef`, the raiders thinned in `e2e/raid`) and a full army skipped the line.
  - No team composition includes a layer, so no attack takes it along.
  - In a 900 s match on seed 9001, with the player's base held standing, it bought its layer at
    340 s and had 16 mines down by the end. A map whose yards share no land route gets no layer.
- **The Flak Track** is bought against the sky (above).
- **The Hovercraft raids by sea** (`core/aihover.js`):
  - Every generated map has one body of water that reaches both coasts, about ten cells from
    each yard; the land route between the bases runs down the middle, where the guns face.
  - The raid takes up to four armed infantry from home that no team has, rocket squads first. It
    drives to its own launch water, sails the SEA domain to the beach nearest a player harvester
    (within `RTS_AI_HOVER.near` cells of it, the one with the fewest guards), and lands them
    there. They go for harvesters, then a Refinery, and rejoin the army when neither is in reach.
    The craft waits on its own water `RTS_AI_HOVER.rest` seconds and goes again.
  - Raiders carry `raid`, and `_rtsTeamCanAdd` refuses them (and anything `inside`).
  - It is bought by `_rtsAISupport`, after the Mine Layer, when there is a harvester to raid.
  - Seed 9001, normal, with the player's base held standing and a Refinery placed: the craft was
    bought at 274 s, boarded four squads in 12 s, crossed the map by water in 28 s, and the
    harvester beside the beach died 14 s after the landing. The idle-player ladder does not move
    (an idle player builds no Refinery, so it has no harvester to raid).
- **The Bridge Layer is not built by the opponent, and that is measured.** On 30 generated maps
  the land route between the yards is within about 5% of the straight line, and no bridge site
  shortens the walk to the player's yard, flank or ore field (best estimate 92% of the route, by
  the straight-line bound). A plan gated on "a bridge helps" would never fire; it needs rivers.

### Verified

`unit/aimines` checks the field's band and ground, a full load laid on it and only on it, the
reload, a walled-in cell set aside, the layer never in a team (asked of every type), one layer
bought even with a full army and never two, and nothing bought a credit short of surplus. Its
mutants were killed; two early survivors were claims the code did not make.

`unit/aihover` (seed 776, where a hovercraft's land route cuts the land and the sea route does
not) checks the target and its reach, the guard preference, the purchase, the crew, a sail at least
85% on water, the landing, the kill (not the power plant by the beach), raiders kept from teams
ashore and put back on their prey, the craft's return and the release. Its mutants were killed.
