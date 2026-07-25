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

## Vehicles — from UNIT.CPP

**A vehicle carries two facings.** `PrimaryFacing` is the hull, `SecondaryFacing` is the
turret, and they are drawn as *separate shapes*. This is the single most recognisable thing
about a C&C tank — it drives one way while its gun tracks another — and baking the turret into
the hull sprite throws it away. `_sprUnit(key, side, prone, part)` builds `'hull'` and
`'turret'` halves; both bake into the same size canvas about the same origin, so drawing one
over the other at the same screen position lines them up with **no per-facing offset table**.
The turret model is centred on its own pivot so it rotates in place. `RTS_TURRETED` lists
which units get the treatment. The turret sprite must not carry a drop shadow — the hull
already casts one.

- `Rotation_AI`: with no target the turret drifts back to the hull's facing.
- `Can_Fire` refuses with **FIRE_FACING** until the turret is within `diff < 8` of 256 (~11°),
  and with **FIRE_ROTATING** if the turret is still swinging and the projectile does not home.
  Homing weapons get four times the angular tolerance (`diff >>= 2`). Measured: a tank whose
  gun starts 180° off does not fire until 1.03 s, against a 1.05 s swing time.
- `Recoil_Adjust` moves the turret back one pixel along its facing when it fires.
- `Fire_Coord` (TURRET.CPP): a shot leaves the **muzzle**, not the middle of the vehicle.
  Since the turret is drawn as a separate sprite, spawning shots at the object's centre makes
  a tank with its gun swung 90° appear to fire sideways out of its own flank. `_rtsFireCoord`
  is used by the tracer, the projectile **and** the renderer's muzzle flash, so all three
  agree.
- **One bearing carries the weapon**, and it is `e.turret` for *every* armed unit — turret
  drawn separately or not — because that is the bearing `Can_Fire` gated on. Structures aim by
  turning their whole selves (`e.rot`). Using the hull bearing for units without a drawn
  turret put a buggy's flash on its nose while `Can_Fire` was testing a bearing that could be
  ninety degrees away.
- `Fire_Direction`: **a dumb shell leaves along the barrel and holds that bearing.** It does
  not curve onto the target, so `Can_Fire`'s ±11° tolerance has consequences — a tank shooting
  at something fast can miss. Missiles home, which is exactly why `Can_Fire` is four times
  more forgiving about their facing (`diff >>= 2`). Measured per shot: 100% against a
  stationary target at any range, 92% against a mover at 6 tiles, 86% at 9.
- A shell in flight **belongs to nobody** — it hits the first hostile thing it runs into, which
  need not be what it was aimed at, so an infantry screen absorbs shells meant for the tanks
  behind it. Only hostiles are tested; stopping on friendlies too would block every massed
  formation's line of fire, which is a different game. Splash still catches friendlies, as
  `Explosion_Damage` always did.
- Flight is bounded by the distance to the mark (`reach / speed + RTS_SHELL_OVER`) rather than
  a flat four seconds, so a **miss detonates near where it was aimed** instead of sailing
  across the map and exploding in somebody else's base.

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

## Start positions — from SCENARIO.CPP

`Create_Units` picks the first house's start **at random** from the waypoint list, then gives
every later house the waypoint with the highest **sum of distances** to all already-taken
starts. For two houses that means: roll the axis, then take the far end of it. RA's candidates
are authored per scenario; this map is generated, so they are a ring of eight positions inset
from the edge, and the roll chooses which diagonal the match is fought along.

**Everything else is derived from the two starts**, which is what makes the whole map change
rather than just the base coordinates:

- Ore is expressed relative to the starts — a home field beside each base, matched pairs out
  along the line between them, the big contested field at the midpoint, and the gems
  straddling it. Mirroring about the midpoint keeps it fair whichever axis came up.
- Roads run start-to-start with a flank branch each, so the connectivity guarantee still
  holds. The ore flood fill seeds from the player's start rather than a fixed cell.
- Base layouts are written in a **local frame** — `along` toward the opponent, `across` to the
  side — so one table produces a sensible arrangement on any axis.
- `_rtsScanPlace` is `Scan_Place_Object`: walk outward through distances, try all eight
  facings at each, then repeat the ring with a random scatter "so our units aren't all aligned
  along spokes". It fills in whenever a slot is blocked.
- The camera opens on the player's own yard. It used to open on a fixed corner, which was
  fine only while the start was fixed too.

**Two bugs this shipped with, both caught by measuring 24 maps rather than looking at one:**

1. **All 24 seeds rolled the same start.** `_rtsRngMake` was a bare xorshift, and a bare
   xorshift seeded with a small integer returns a tiny *first* value — seed 1 gives about
   0.00006 — so `(rnd() * 8) | 0` was 0 for every low seed. The generator now scrambles the
   seed and warms up eight rounds before handing the stream out. Any `(rnd()*n)|0` taken off a
   fresh stream is suspect; check it.
2. **One seed in 24 produced a completely disconnected map** — a player base with no route to
   the enemy or to any ore at all. Terrain is generated *before* bases are placed, so a start
   could land in a lake, the base would be scan-placed up to 32 rings away, and the roads
   would still meet at the original point. Terrain generation now clears a build area at each
   start before carving roads.

Harness (`starts.js`) asserts over 24 seeds: every base complete, the enemy always reachable,
**all ore always reachable**, separation 79–83 tiles and 901–941 ore cells so no seed is a
lopsided draw. Seven distinct layouts appeared in 24 rolls, of eight possible.

Ladder after: easy=306s normal=220s hard=176s (from 304/264/187). The headline is not that
the opponent got stronger — it is that **normal is no longer bimodal**. It was 293/225/289/
222/293, two clusters 70s apart; it is now 221/229/215/214/223. That split was an artifact of
one fixed map layout, not a property of the difficulty.

## Triggers — from TRIGGER.CPP + TEVENT.CPP + TACTION.CPP

The three files only make sense together: TRIGGER.CPP is the machinery, TEVENT.CPP the
conditions, TACTION.CPP the effects. Implemented in full: three persistence modes (`volatile`
fires once and deletes itself, `semi` fires when the last attachment is gone, `persistent`
resets and repeats), four event-combination modes (`only` / `and` / `or` / `linked`),
`Find_Or_Make`'s one-live-instance-per-type, forcing, and trigger-to-trigger chaining.

**Three things that are easy to get wrong and only visible in the source:**

- **`TDEventClass::IsTripped` is a latch, and only some events set it.** A NOTIFY event
  (`attacked`, `destroyed`, `discovered`) trips on the single frame it is reported and stays
  true forever after. A TIME event does *not* — it returns on the early ambient path, and its
  latch is the timer sitting at zero. Either way `and` spans time, which is the whole point:
  event 1 can trip minutes before event 2. Without the latch, `and` would only ever fire if
  both events happened on the same frame.
- **There are two different houses.** TEVENT.CPP does two separate lookups: the trigger's
  OWNER for credits / just-built / loss counts / factories, and the event's ARGUMENT house for
  low-power, discovery and the whole `*_DESTROYED` family. Conflating them aims "all units
  destroyed" at the wrong side. Modelled here as `who: 'owner' | 'arg'` in `RTS_TEVENTS`.
- **The action's return value is load-bearing.** TRIGGER.CPP deletes or resets a trigger only
  `if (ok)` — the OR of its actions' return values. An action that reports failure leaves the
  trigger armed to retry. That is why `Do_Reinforcements` with nowhere to place a team isn't
  silently dropped, and `_rtsTeamReinforce` preserves it.

`forced` short-circuits everything: a forced event trips unconditionally and a forced spring
bypasses `EventControl` entirely, so a chained trigger does not re-check its own conditions.

**The scenario is MINE; the engine is the port.** RA's triggers come from hand-authored
campaign INIs and there is no author for a generated skirmish map. `RTS_TRIGGERS` therefore
ships four informational beats and is asserted by harness to use only `text`/`playSound`.
`TACTION_AUTOCREATE` is now available as the proper source of the alert flag that TEAMTYPE's
split reads, but the shipped alert was deliberately NOT rewired onto it — that would re-open a
balance question that was already measured and closed.

`RTS_MESSAGE_DELAY` is also mine, and forced by a difference between the games: RA posts to a
message *list* where each entry has its own lifetime, so repeats merely stack. This game has
one message slot, so a `persistent` trigger whose condition stays true starved the channel —
measured at 600 posts in 10 seconds, with an unrelated message not surviving a single frame.
The text action now refuses to repeat inside the window, and refuses by *returning false*, so
the `if (ok)` gate leaves the trigger armed rather than counting a firing that did nothing.

## Commanding from the radar — from RADAR.CPP

`RTacticalClass::Action` does something the minimap here did not: **with units selected, a
click on the radar issues an ORDER rather than moving the view.** That is how an army gets
committed across the map without scrolling to it. The action is filtered to a restricted set -
MOVE, NOMOVE, ATTACK, ENTER, CAPTURE, SABOTAGE - and anything else falls through to nothing.

The shroud rule is ported exactly: `shadow = !IsMapped` means an unexplored cell cannot be
*targeted*, only moved to. Right-clicking fog sends the units there; it never acquires
whatever happens to be standing in it.

**Two deliberate differences from the original.** RA puts the order on the LEFT button because
its right button toggles radar zoom. This game has no radar zoom, and right-click is already
the one context-sensitive order button everywhere else — so the order is on the RIGHT and left
keeps moving the view. Matching a binding whose other half does not exist would have made the
input inconsistent with the rest of the game for no gain.

**The bug this shipped with, caught by measuring rather than clicking:** `mousedown` fires for
*every* button, so the right-click order ALSO recentred the view — the army got its order and
the camera jumped off whatever the player was watching. `onmousedown` now ignores anything but
button 0. If a handler is bound to mousedown and there is a right-click path anywhere near it,
check that guard.

Verified: four selected units right-clicked onto a revealed enemy yard all take an attack
order and path to it; the view does not move; left-click still moves the view; and a
right-click on shrouded ground produces a move order for all four and never an attack.

Note `rtsui2.js` in the scratchpad is a stale harness — it loads `/command/` and expects
`window.rtsOpen`, from before the RTS moved to its own repo. It fails on a clean `main` too.

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

## Measuring balance: the RNG is not seeded — pin it

**The difficulty ladder is far noisier than it looks, and this invalidates any A/B run on a
handful of seeds.** The simulation calls bare `Math.random()` for attack-wave intervals and
team-type selection, so no run is reproducible. Running the *identical build* twice:

    run 1   easy=315s  normal=227s  hard=190s
    run 2   easy=502s  normal=251s  hard=187s

Seed 9001 on easy fell at 318s in one run and never fell at all (>600s) in the next. `hard` is
comparatively stable (190 vs 187); `easy` is close to useless as a single-run signal, because
an easy opponent's outcome hinges on a couple of coin flips early.

**So do not compare two builds by running the ladder on each.** Pin the generator first:

```js
let s = 0xC0FFEE; Math.random = () => { s = (s*1664525 + 1013904223)>>>0; return s/4294967296; };
```

With that in place a seed replays exactly, and an A/B becomes a comparison rather than an
estimate — the trigger layer was shown inert this way, producing byte-identical fall times,
unit counts, credits and kill/loss tallies with the trigger table populated and emptied.

**This is now fixed in the game itself, and pinning is no longer required.** All gameplay
randomness runs through `_rtsRnd()`, seeded off the scenario seed, so a seed replays exactly:
same fall time to the centisecond, same unit counts, same credits, same kill and loss tallies.
Three independent streams off the one seed keep the subsystems from shifting each other — the
map generator (raw seed), ore growth (`^0x5eed`) and gameplay (`^0x9e3779b9`). Interleaving a
different seed between two runs of the same seed does not disturb it.

Reproducible five-seed baseline, mean seconds an idle player survives:

    easy=304s  normal=264s  hard=187s

`normal` is **bimodal** — 293/225/289/222/293 — two clusters roughly 70s apart rather than a
spread around a mean. Quoting its mean hides that; the useful question about a change on
normal is which cluster each seed lands in, not what the average did.

Earlier balance figures in this file that were taken from single unpinned runs — notably the
easy-difficulty numbers in the TEAM.CPP and TEAMTYPE.CPP sections — predate this and should
be read as indicative only.

**Seeding also exposes flaky assertions.** `_rtsCanRetaliate` on a non-idle unit applies
TECHNO.CPP's "the original only bothers half the time" coin flip, so a single call is a coin
flip and asserting on it means nothing. The mission harness had exactly that assertion and had
been passing on luck; it now samples 400 calls and checks the proportion. If a harness
assertion starts failing after a change to the random stream, ask whether it was ever really
testing anything.

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

## Picking a target — from TECHNO.CPP

`Greatest_Threat` / `Evaluate_Object` **score** candidates rather than measuring how far away
they are. That is the difference between an army that shoots whatever it bumps into and one
that picks off the harvester.

```
value  = Points (Risk + Reward)  + Crew.Kills
       × 2                        if outside its OWN base's zone   (a straggler is soft)
       × NervousBias              if inside MY base's zone
score  = value × 32000 / (distance in cells + 1)          ← LINEAR, not squared
```

The squared falloff is sitting right there in the original, commented out; the shipped line is
the linear one. A weapon whose `Modifier` against that armour is zero never selects the target
at all.

- **Points stand in as `max(cost, hp)`, and the hp floor is load-bearing.** The Command Yard is
  free, so cost alone values the most important building in the game at zero — and a
  zero-valued candidate is discarded. Nothing could target a construction yard: measured, the
  Commando AI ran to 179 units and 27 buildings while an idle player calmly survived eight
  minutes, because neither side could shoot the other's yard.
- **`Crew.Kills` makes veterans hotter targets.** Kills are added raw to a Points-scale number
  in the original; costs here run 100–1600 rather than 10–80, so the term is scaled or it
  vanishes into the rounding.
- **`Area_Modify` is deliberately NOT implemented.** It halves a candidate's value per nearby
  friendly building, but it is gated on a per-weapon `IsSupressed` flag that only a few RA
  weapons carry and this game has no equivalent data for. Mapping it onto "any splash weapon"
  is the obvious guess and it is wrong: measured, it drove a target standing *inside* your own
  base down to 640k against 1.28M for the same unit in open ground — exactly inverting
  NervousBias and leaving the base undefended.

**`Is_Allowed_To_Retaliate`** — shooting back is not automatic. No source, an ally, or no weapon
that can hurt the attacker all mean no. An idle unit always turns and fights. A unit already
engaged only switches if the attacker is genuinely the better target, and even then the
original only bothers **half the time** — that coin flip is what stops a firefight becoming
every unit spinning toward whoever shot last. Measured: 0% switching away from a better target,
~50% switching to one.

**`Base_Is_Attacked`** — *"will pull units off of the field and send them back to defend the
base… will make taking an enemy base much more difficult."* Raid a defended base and its army
comes home. Only the AI runs this (humans deal with their own base-is-attacked problems), a
building that can shoot back doesn't overreact, and a `BaseAttackTimer` on the attacker stops
one long firefight from recalling the army over and over. Defenders alternate 50/50 between
charging the attacker and taking station on the building — a pure charge empties the base again
the moment the raider dies.

**Firing from the dark gives you away.** `Fire_At` does a `Sight_From` of radius 2 around a
shooter the player can't see. Here the reveal lives on the shooter as a short timer rather than
as a mark on the grid, because the visibility grid is rebuilt from scratch every sweep and a
one-shot mark would be erased before it was drawn.

**`What_Weapon_Should_I_Use`** scores every weapon the object carries against the candidate's
armour — `Modifier[armor] × 1000`, **doubled when the target is already in that weapon's
range**, zeroed when it could not fire at all, primary wins ties. The doubling is the
interesting half: it biases toward the weapon that can shoot *now* over the one that would be
better after driving closer. The Battle Tank carries `weapon2:'coax'` and switches to it for
infantry with no input from the player — measured 180 coax shots against a rifle squad, 40
cannon rounds against a tank, and the main gun chosen for infantry standing beyond coax range.

**`Rearm_Delay` + `Is_Two_Shooter`** — a burst weapon does not reload evenly. The delay
assigned after each shot alternates, so shots arrive as a fast pair and then a long wait:
measured gaps of `[1.56, 0.22, 1.57, 0.21]`. `IsSecondShot` starts *true*, so the first shot of
a fresh unit takes the full ROF and the pair forms after it. The same flag drives
`PrimaryLateral`, so a two-barrel weapon visibly alternates sides.

**Which weapons burst, and which units carry a secondary, is a choice here — not ported data.**
RA keeps it in RULES.INI and this game has no equivalent. Both were tuned against isolated
measurements so only the intended change survives:

| | before | after | |
|---|---|---|---|
| tank vs infantry | 18.18 | **21.12** | +16%, the point of a coaxial gun |
| tank vs tank | 50.67 | 50.67 | 0% |
| tank vs building | 22.16 | 23.12 | +4%, one extra shot in the window |
| rocket vs tank | 24.50 | 24.93 | +2% |
| rifle vs infantry | 6.24 | 6.24 | 0% |

**Measure DPS on an isolated map.** The first pass at these numbers ran on a live game and the
enemy AI polluted every one of them — two runs of the same scenario disagreed by 2× on
tank-vs-building, which read as a balance regression and was pure harness noise. Kill every
other entity first, and hold `G.over`/`lost` open each frame or the victory check stops the
tick and you measure a single shot. Also null the target's `cool`: a punching bag that shoots
back makes infantry panic, and then the number measures fear rather than firepower.

And note **prone halves incoming damage**, which is why a machine gun can be *worse* against
infantry than a cannon: the first coax numbers looked like a bug and were the prone rule
working correctly.

`Threat_Range`'s area-guard clamp (2× weapon range, capped at 10 cells) is implemented but never
binds — every sight radius in this game is already inside it. It is kept because the clamp is
the rule, not the current unit table.

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

## Production and the sidebar — from SIDEBAR.CPP

**Two independent lines.** `Which_Column` puts buildings in column 0 and everything else in
column 1, and each column holds at most one factory. That is `S.q.struct` / `S.q.infantry` /
`S.q.vehicle` here.

**A click means different things by button** (`SelectClass::Action`):

- **Left** — start production, or resume a suspended job, or (for a finished building) enter
  placement mode. Left-clicking a job that is already running does **nothing**; it used to
  cancel outright, which meant one stray click threw away a nearly-finished war factory along
  with the credits.
- **Right** — *"If production is in progress, put it on hold. If production is already on
  hold, then abandon it."* Two distinct presses. Holding freezes the clock and stops all
  spending; abandoning refunds what was actually paid so far (`q.paid`, not the full cost —
  the money not yet spent was never taken).

**While a line is busy, every cameo in that column greys out** (`busyline`), because
`Fetch_Factory(otype)` returning non-null disables the whole type. This is the difference
between "you can't afford it" and "that line is taken", and without it the player just gets a
silent no.

**`Recalc` runs when a factory dies, and only then** — the source comment is explicit that the
sweep is expensive and should not run for every casualty. Anything no longer buildable by
anybody is dropped and its production abandoned with a refund; a finished building still
waiting to be placed needs a yard to come out of, so it goes too. Without this, blowing up a
barracks left the rifle squad inside it still ticking toward completion and then walking out
of a building that no longer exists.

**EVA lines**: `VOX_TRAINING` ("Training") for infantry vs `VOX_BUILDING` ("Building") for
everything else; `VOX_SUSPENDED` / `VOX_CANCELED`; and `VOX_NEW_CONSTRUCT` ("New construction
options") from `StripClass::Add` whenever something *joins* the buildable list — the cue that
finishing a barracks just unlocked infantry, which is easy to miss when the new options are on
a tab you are not looking at. Watch every category, not just the visible one, and stay quiet
on the first pass or a new game announces itself.

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
