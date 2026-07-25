# CLAUDE.md

Guidance for Claude Code (claude.ai/code) working in this repository.

**RC Command** is a browser real-time strategy game, deployed via GitHub Pages from `main`.
It ships as one generated, fully self-contained `index.html` (~0.13 MB) — no network calls, no
asset files, and **no libraries at all**. Every pixel and every sound is generated in code.

## Build — READ FIRST

`index.html` is a **generated artifact — never edit it by hand.**

1. Edit the relevant file under `src/`.
2. `python3 build.py` from the repo root.
3. Commit the `src/` change **and** the regenerated `index.html`.

`build.py` fails the build on: a syntax error in any source; two files defining the same
top-level name; or an external resource reference in the page. Do not remove those guards —
each one is there because the matching bug already shipped once.

## Layout

- `src/rts.rules.js` — **every balance number**, data only. Retune here.
- `src/rts.r3d.js` — the **sprite baker**: a small 3D rasteriser that runs once at load.
- `src/rts.sprites.js` — palette, terrain bake, ore, effects, and the 3D **models** for every
  structure and unit.
- `src/rts.audio.js` — all sound, synthesized at runtime with WebAudio. No sampled assets.
- `src/rts.core.js` — simulation: grid, A* pathfinding, combat, economy, enemy AI. Deliberately
  renderer-free, so a whole battle can be stepped headlessly. Swapping the 3D renderer for the
  2D one cost this file zero lines.
- `src/rts.render.js` — canvas 2D. Reads the sim, never writes it.
- `src/rts.ui.js` — sidebar, radar, HUD overlay canvas, input, main loop.
- `src/index.skeleton.html` — page shell + title screen; `src/style.css`.

## Presentation rules — these are load-bearing

Art is authored at **`RTS_TS` = 24 pixels per map cell**. The four rules below are the ones that
separate "looks like the game" from "looks like a web demo", and each is written down because
breaking it shipped once.

- **Never scale by a fraction.** Screen cells come from `RTS_ZOOMS` = 12/24/48 only — half, one
  and two art-pixels per screen pixel. A build that drew 24px art at 40px cells resampled every
  sprite by 1.667× and the whole picture went soft, with pixels of two different sizes side by
  side. `_rtsApplyCam` enforces this; do not reintroduce a free-running `cell`.
- **Structures and units are pre-rendered 3D, not drawn.** Westwood modelled them, rendered
  each to a bitmap at a fixed camera and light, and shipped the bitmaps — which is why the
  originals have volume and flat facets. `rts.r3d.js` does the same at load: models in 3D,
  baked to sprites, then the game is the 2D sprite engine it already was. No WebGL, no
  library, no per-frame cost. Unit facings come from yawing the *model*, so a tank at 45°
  shows its side and tracks properly.
- **The ground plane is not foreshortened.** Projection is oblique — `screenY = z - K*y` —
  because a 3×3 structure has to cover exactly 72×72 art pixels or it stops lining up with
  its tiles. Height projects straight up into headroom above the footprint.
- **Never leave a roof as one flat polygon.** With no yaw a plain box shows exactly two
  faces, so its roof is a single polygon of a single colour and the building reads as a
  shed. Structures use `_r3Slab` (chamfered top, which splits the roof edge into four
  planes at four angles and therefore four tones) or a `_r3Hip` roof. Two forms were tried
  and rejected: a plain gable, whose near slope covers five times the pixels of the far one
  under this camera, and a barrel vault, whose entire near half points at the light and
  lands on one shading band. The factory uses small repeated ridges instead.
- **The shading pipeline is the thing that decides whether this looks cheap.** Per pixel the
  baker keeps depth, base colour and a lit-ness value, then does: ambient occlusion off the
  depth buffer, ordered 4x4 dither, a colour RAMP, and a rim light on the up-left silhouette.
  Three rules inside it, each learned by getting it wrong:
  - **Ramp, never multiply.** Scaling RGB toward black desaturates as it darkens, so every
    shadow slides to muddy grey. The ramp keeps saturation in shadow and shifts it cool,
    and lifts highlights toward warm daylight.
  - **Dither the gradients, not the faces.** Dithering the face's own lighting puts a
    checkerboard across every large flat roof. Quantise the face value clean and dither
    only the spatially-varying part (occlusion, rim).
  - **Keep the specular tight.** A broad one (^8 at 0.34) pushed lit roofs past the top of
    the ramp and they blew out to pink.
- **A wall is never one flat colour.** Structures carry pale pilasters and rows of lit
  windows mounted 1.5 units proud of the wall face. Without them a building is a coloured
  box, however good its roof is.
- **Ore is discrete crystals with ground showing between them**, not a solid fill. A stain
  layer was tried and a rich field came out as a flat gold carpet with no texture at all.
- **Structures are faction-coloured, not concrete** (`RTS_PAL.bld`): coloured walls under
  maroon roofs, on a pale irregular concrete pad drawn by `_sprPad`. An all-grey pass read
  as an industrial estate, and buildings straight on grass read as furniture on a lawn.
- **Watch face winding and light direction.** Both failed silently and cost a round each: a
  cylinder wound the wrong way survives backface culling by showing you the *inside* of its
  far wall (stacks came out as dark discs), and a light with a negative z component lights
  the backs of buildings, leaving every front elevation at flat ambient.
- **The map is a landscape, not a field.** `_rtsGenTerrain` (in the *core*, since obstacles
  are simulation state) lays down conifer groves, thin rock ridges, a lake with a beach and
  dirt roads, into a second `G.terrain` layer of `RTS_T_*` codes that the renderer reads.
  Roads are carved last and connect the two start corners, which is what guarantees the map
  stays passable — always re-run a flood fill after changing obstacle density. Two traps
  found the hard way: canopy tones within a few points of the grass make the whole forest
  vanish into texture, and per-cell jitter smaller than about half a cell leaves the trees
  in visible rows. Rock is mottled per-2px with lighting **only on exposed faces** — a flat
  fill plus a per-cell lip turns a ridge into a paved plaza, and widening the ridge noise
  band even slightly collapses every ridge into one huge mesa.
- **Terrain is one baked canvas, not per-cell tiles.** `_rtsBakeTerrain` paints the whole
  112×112 map at art resolution using continuous fbm noise. Tiling six random 24px tiles per
  cell is what produced a checkerboard of axis-aligned brown squares: every patch was exactly
  one cell and the seams lined up into a visible grid. As a bonus the ground is now one
  `drawImage` per frame instead of ~2000.
- **Silhouette over surface.** Each structure must be nameable from across the map: the yard has
  a crane gantry, the power plant two stacks, the refinery silos and a dock, the barracks the
  only pitched roof, the factory a ribbed shed. A pass where all six were the same grey
  rectangle with a coloured stripe was unreadable at a glance.

Also load-bearing: units need **internal contrast** — hull, turret and tracks each a full tone
apart, or the unit reads as a solid brick. Ore is flat gold on the ground, stained at high
density and wrapped across cell edges so a field looks continuous rather than stamped.

Beware `_sprHash`: every multiply must be `Math.imul`. A plain `a * b` on two 32-bit ints
exceeds 2^53, the low bits come back as garbage, and the failure is silent — the first version
produced a terrain bake containing no dirt whatsoever because the "random" grade never crossed
its threshold.

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

## Animations — from ANIM.CPP

`RTS_ANIMS` in the rules is AnimTypeClass trimmed to what this game uses, and the field that
matters most is **`biggest`**:

- **Ground-altering effects fire at the animation's BIGGEST stage, not at its start.** ANIM.CPP
  does this so a crater or scorch mark appears *under* the fireball rather than popping into
  view in plain sight beside it. `_rtsAnimMiddle` is the equivalent of `Middle()`. If you move
  that call to t=0 the illusion breaks immediately.
- **`chain`** is ChainTo: an animation metamorphoses instead of ending. An explosion becomes a
  fire, which is why a battlefield keeps burning after the shooting stops.
- **`damage`** on an attached animation applies to whatever it rides (WARHEAD_FIRE). Units
  under 30% health catch fire, the flame tracks them, and it burns them down.
- Scorch marks and craters are stamped **permanently into the baked terrain canvas**, so they
  cost nothing after the frame they appear on. Craters also eat the ore in their cell
  (`Reduce_Tiberium(6)`).

**Ore must be reachable.** Roads connect the two bases, but forest can ring an ore field and
water can leave one on an island — about one map in three was affected. Map gen now flood
fills from the player start and carves out to any unreachable ore, and that carve is allowed
to lay a causeway across water. Always re-run the path harness over several fresh maps after
touching obstacle density; a single map proves nothing, because the seed is random.

## Colour cycling — from CONQUER.CPP

`Color_Cycle()` in the GPL source is the palette animation, and its constants are reproduced
exactly in `_rtsCycleTick` because the cadences are what the eye recognises:

- **Pulse**: steps by 20 every `TIMER_SECOND/6`, bouncing between `0x20` and 150. Drives
  `CC_PULSE_COLOR` (the radar viewport box) and `CC_EMBER_COLOR` — `RGBClass(255,80,80)`,
  the glow on burning things. Structures under a third health carry it, with smoke.
- **Water**: a band of palette entries rotates one step every `TIMER_SECOND/4`. There is no
  indexed palette here to rotate, so the equivalent is a four-frame highlight overlay on the
  same clock. A static lake is one of the deadest things on a map.
- **`Shake_The_Screen()`**: the original blits the page offset a couple of pixels, re-picking
  each tick. Here it is a transform offset driven by `G.shake`, which a dying structure sets
  — shake is simulation state in the original too (`TimeQuake`), so it lives in the core.

## More from CONQUER.CPP

- **`Sync_Delay()` pins the original to 15 FPS**, and that cadence is a lot of how its
  animation reads. Movement here stays continuous — it looks broken at 15 Hz on a modern
  display — but everything choosing an animation FRAME runs off `_rtsAnimFrame()`, a 15 Hz
  counter. Use `_rtsAnimQ(t)` to quantise an elapsed timer to the same grid.
- **`Get_Radar_Icon()`** builds a radar blip by downsampling the real shape: three samples
  per cell, each taking the first non-transparent pixel across a nine-tap offset kernel so
  thin features don't drop out between samples. `_rtsRadarIcon` does the same, which is why
  structures are recognisable on the radar rather than coloured blocks.
- **`Handle_Team()`** — number keys with the original's four modifier cases: plain selects,
  shift adds, ctrl assigns the selection, alt selects and centres. Unit `team` is
  Handle_Team's `Group`.

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

## The blast model — from COMBAT.CPP

`Modify_Damage` is the whole of it, and the falloff is a **division**, not a taper:

```
steps = distance / (SpreadFactor * PIXEL_LEPTON_W/2), bounded 0..16
if (steps) damage /= steps
if (steps < 4) damage = max(damage, MinDamage)      <- floor near the blast ONLY
damage = min(damage, MaxDamage)
```

Damage falls as **1/d**: full at the impact point, a fraction one cell out. And the MinDamage
floor deliberately *stops applying* past four steps — "allow damage to drop to zero only if
the distance would have reduced damage to less than 1/4 full damage". A unit at the edge of a
blast takes **nothing**, not a courtesy point. (An earlier pass here read RULES.CPP's
`ExplosionSpread` as "damage halves per cell" and shipped an exponential curve; this file is
where the real formula lives, and it is neither exponential nor floored everywhere.)

Two rules in `Explosion_Damage` matter as much as the curve:

- **A hit anywhere on a building's footprint counts as a direct hit on its centre** (`if
  RTTI_BUILDING && impacto == object → distance = 0`). Without it a shell landing on the
  corner of a 3×3 refinery is silently downgraded to a graze — measured here as 200 damage
  versus 12.5.
- **The blast damages everyone except whoever fired it.** Friendly fire is real: park your
  own squad around a target and your own rockets will kill them.
- The routine only ever examines the impact cell and the eight around it (`range =
  ICON_LEPTON_W * 1.5`), so a blast **never spills further than a cell and a half**, whatever
  the warhead. SpreadFactor shapes the curve inside that radius; it does not widen it.
- `IsTiberiumDestroyer` → `Reduce_Tiberium(strength / 10)`: shelling an ore field strips it.

**`Combat_Anim` picks the explosion from the damage and the land type** — a rifle round and a
tank shell are not the same event, and neither is over water. Small hits piff (a grey-white
spark, not fire), mid hits throw fragments, big ones are a fireball, and anything over water
is a plume with a ring spreading on the surface and no mark left behind. Draw the water plume
as a *ring plus a collapsing column*: a filled pale disc at that size reads as a cloud. Effect
frames must stay **square** — the renderer draws every one at `width × width`.

## Shroud — from MAP.CPP

`Sight_From()` is the whole feature, and the part that matters is that a cell carries **two**
flags, not one:

- **`IsMapped`** — explored. Once lifted it stays lifted.
- **`IsVisible`** — inside something's sight range *right now*.

So the map has three states: black where you have never been, dimmed where you have been but
are not looking, and clear where you are. All three are verified by sampling actual pixels —
`clear` ≈ (64,80,48), `explored` ≈ (27,36,20), `shrouded` = (4,6,9).

- An enemy **unit** vanishes the moment it leaves your sight. An enemy **building** you have
  already scouted stays drawn, because it is part of what you know about the ground rather
  than something that moves. Same rule governs the radar, and clicking: you cannot select
  what you cannot see.
- `RadiusOffset[]` is a flat list of cell offsets **ordered by ring**, with `RadiusCount[r]`
  giving how many entries cover radius r. Sight_From walks the first `RadiusCount[range]`
  entries *and then filters by true distance*, which is what makes the revealed area an exact
  circle — the table is a superset. Reproducing that gives exactly the original's reveal: 5
  cells at range 1, 13 at range 2, 113 at range 6. The ring ordering is also what makes the
  original's incremental scan possible (a unit that moved one cell only refreshes its outer
  rings); here the whole `vis` layer is rebuilt on the 15 Hz clock instead, which is cheaper
  than it sounds and much simpler.
- The shroud is baked into a **112×112 canvas, one pixel per cell**, and blown up with
  smoothing off: the layer costs one `drawImage`, and the edges stay hard and cell-aligned
  the way the original's shroud tiles do.
- **The AI is not fogged**, exactly as the original's computer opponent is not.

`Map::Logic()` also amortises **ore growth**: each frame scans
`MAP_CELL_TOTAL / (GrowthRate * TICKS_PER_MINUTE)` cells from a rolling cursor and collects
candidates by reservoir sampling, so no frame ever pays for a full-map pass (worst-case tick
measured at 0.1 ms, flat). Watch the translation: `Random_Pick(lo, hi)` is **inclusive at both
ends**, so with Excess 0 and Count 0 the original's test is `0 <= 0` — true, and the first
candidate always enters the list. Writing it as `rnd() * (excess+1) <= count` makes that test
never true, the list stays empty forever, and ore silently never grows again. Nothing throws.

## Verifying

No test suite — use headless Playwright against the **built** `index.html`. Node + Playwright
live at `/opt/node22` (do **not** run `playwright install`):

```
NODE_PATH=/opt/node22/lib/node_modules /opt/node22/bin/node <harness>.js
```

Serve the repo root, load `/`, click `#rtsGo`. Since `rts.core.js` is renderer-free you can step
`_rtsTick(1/60)` in a tight loop to simulate a whole battle in seconds. Worth re-checking after
balance changes: a passive player is overrun in a few minutes, a player who masses forces can
destroy the enemy base, and 40 units ordered across the map all arrive.

**"No errors" is not verification.** Three separate bugs here threw nothing at all: buildings
rendering pure black, music that was silent, and a START BATTLE button that did nothing. Measure
the output instead.

- Audio: tap an `AnalyserNode` on `_rtsA.master` and read RMS.
- Art: dump the sprites onto a sheet at 6–9× and look at them, and sample the baked terrain's
  pixel histogram — a palette entry at 0% means that material is not being generated.
