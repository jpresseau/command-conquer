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

## Armour classes — from WARHEAD.CPP + CONST.CPP

`CONST.CPP` gives `ArmorName[ARMOR_COUNT] = { "none", "wood", "light", "heavy", "concrete" }`, and
`WARHEAD.CPP` gives the model that uses them: a warhead carries **one multiplier per armour
class** (`Modifier[armor]`, read from RULES.INI as `Verses=100%,100%,100%,100%,100%`), defaulting
to 1 for anything unlisted.

This game had three buckets — infantry / vehicle / building — derived from what a thing *is*.
That is a worse model, and not by a little: **armour is a property of the object, independent of
its category.** A Mammoth and a concrete bunker can share `heavy`; a Scout Buggy and a Battle Tank
can differ even though both are vehicles. Under the old scheme every vehicle in the game
necessarily took the same multiplier from every weapon, and there was no way to express "thin
skin" at all.

All five call sites already funnelled through one `rtsArmour(e)`, so the refactor was contained:
that function now returns a declared class, every unit and structure carries `armour:`, and every
weapon carries `verses:{none, wood, light, heavy, concrete}`.

**`IsWallDestroyer`** is the other thing worth having. Only warheads that carry it can bring down
a Concrete Wall — which is the entire *point* of concrete, and it arrived one PR after walls did.
Small arms are now literally unable to scratch one: a rifle squad shooting a wall for ten seconds
leaves it at 400/400. It is folded into `rtsVerses()` rather than checked at each call site,
because there are five of them and one forgetting is a silent balance bug.

**`IsOrganic = (Modifier[ARMOR_STEEL] == 0)`** — the original derives "anti-personnel only" from a
zero against steel rather than storing a flag. The Attack Dog was written exactly that way before
this file arrived, which is a pleasant confirmation.

**The numbers are still mine.** `WARHEAD.CPP` is the class, not the data — the real multipliers
live in RULES.INI, which is a data file rather than source. The five classes and the defaulting
rule are the port; the values in each `verses` table were derived from the old three-bucket ones
to hold the measured balance, and would be replaced wholesale if that file turns up.

Verified: 16 assertions in `armour.js` — five classes, every entry declaring a real one, all
infantry ARMOR_NONE as in the original, two vehicles resolving to different classes, the
defaulting rule, the dog's organic zero, a machine gun preferring light armour and an anti-armour
gun preferring heavy, small arms unable to hurt a wall while shells and rockets can, and the wall
rule applying to walls rather than to all concrete. Ladder easy 298 s / normal 218 s / hard 175 s,
within a second of the previous run on every difficulty.

## The game was rendering at night — and the fog was why

Two rounds of "it doesn't look like the original" and I had been treating the look as a matter
of taste. It is measurable, and measuring it found a cause I would not have guessed.

`lum.js` samples the play-area canvas and reports a luminance histogram. On a real match view:

    median 33/255    p95 76    93% of every pixel below 64

There were **no highlights anywhere in the frame**. Nothing above half brightness existed. That
is not a stylistic choice, it is a picture rendered at night.

### Two causes, and the smaller one was the palette

The ground palette was genuinely dark — grass at luminance 56, tree canopy at 34 — built around
a note in `RTS_PAL` reading "the reference material is dark, cool and low-contrast." Lifting it
to a daylight range (grass ~100, canopy ~74, real highlight tones at the top of each ramp)
moved the median from 33 to 57.

**Still p95 76.** Unchanged. New highlight tones at luminance 157 were not reaching the screen
at all, which meant something was compressing the range rather than the palette being wrong.

It was `RTS_FOG_DIM = 0.45` — explored-but-unseen ground composited with 45% of near-black.
Most of what is on screen at any moment is ground you have explored and are not currently
looking at, so **nearly half the light was being removed from the majority of every frame.** A
grass pixel at 100 arrived as 58, which is exactly the median that was measured.

Same view, lifted palette underneath, varying only the fog:

| `FOG_DIM` | median | p95 | below 64 |
|---|---|---|---|
| 0.45 | 57 | 76 | 62% |
| 0.30 | 71 | 95 | 33% |
| **0.22** | **79** | **106** | **13%** |
| 0.00 | 100 | 134 | 3% |

0.22 keeps "seen now" plainly distinct from "remembered" while letting the ground read as
daylight. The **shroud is untouched** — unexplored ground is still black and enemy units still
vanish when they leave your sight. Only the brightness of terrain memory changed.

### The harness bug worth knowing about

The first version of `lum.js` reported a mean luminance of **8/255** on a frame that visibly had
a green field in it. Drawing happens in the rAF loop, not in `_rtsTick`, so reading the canvas
inside the same `evaluate()` that moved the camera samples a frame that was never painted.
Setup and sampling must be separate evaluates with a real `waitForTimeout` between them.

Related: the visibility sweep runs every tick and overwrites anything written into `G.vis`, so
forcing the fog off for a measurement has to go through the constant, not the array.

### What is still not right

The ground is daylit now but it is still **generated, not drawn**. RA composes terrain from
24×24 icon-set templates (`WWFLAT32/TILE/ICONSET.CPP`, catalogued in `CODE/TDATA.CPP`) — hard
cell edges, drawn cliff faces, shore and road pieces. This repo paints continuous noise into
one big canvas, deliberately, to avoid a visible tile grid. That trade bought organic patches
and cost all structure. It is the next thing to fix and it is a real rebuild.

Also unresolved: everything uses free-form hex per model rather than one shared quantised
palette, and team colour is a tint rather than `DRAWSHP.ASM`'s index remap over a reserved
range. Both are why the frame reads as softer than the original.

**The hues are provisional.** They sit in the right family and the right value range; they are
not measured against the original. Reference frames would replace the numbers in `RTS_PAL`
wholesale without any structural change.

### Note on fetching source

`raw.githubusercontent.com/electronicarts/CnC_Red_Alert/main/CODE/<FILE>.CPP` is reachable
from this environment — files can be pulled directly rather than pasted in. The GitHub *API*
is blocked (the session is scoped to this account's own repos), so directories cannot be
listed, but any file fetches fine by exact path. `WWFLAT32/` and `WIN32LIB/` fetch too.

There is **no art in that repository** — no `.MIX`, `.SHP`, `.PAL` or `.TMP`. Only the code
that reads those formats. No source file will fix the way this game looks.

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

## Things burn — from ADATA.CPP

ADATA.CPP is the animation table, **not** the aircraft table (that is `AADATA.CPP`; this file
was requested under the wrong name). It is also the first data file in this series whose
numbers are actually *in the source* rather than in `RULES.INI` — animations are hardcoded,
so everything below is quoted rather than invented.

### The burn ladder

RA does not have "a fire". It has three, each with its own damage rate, chaining **down**
into the next and finally into smoke:

| rung | ADATA | damage | size | scorches |
|---|---|---|---|---|
| `firebig` | `OnFireBig` | `fixed(1,10)` → 1.5 hp/s | 23 px | yes |
| `firemed` | `OnFireMed` | `fixed(1,16)` → 0.9375 hp/s | 14 px | no |
| `firesmall` | `OnFireSmall` | `fixed(1,32)` → 0.46875 hp/s | 11 px | no |
| `smoke` | `SmokeM` | none | — | no |

`Damage` is a fixed amount per **tick** at 15 FPS, which is where the hp/s column comes from.
Only `OnFireBig` is `IsScorcher`. Four loops per rung.

A fire is therefore not an effect that plays and stops — it **burns itself down**. A building
you shot and then left alone smoulders out; one you keep hitting is topped back up to full
size on each hit. That re-ignition rule is what makes a sustained bombardment look and behave
differently from a single shell, and it is why `_rtsIgnite` is one entry point rather than a
`push` at each call site.

**Structures burn now, and did not before** — the old code lit units only. Which rung a thing
starts on comes from its footprint: a 3×3 refinery gets `OnFireBig`, a 1×1 pillbox gets
`OnFireSmall`. Buildings catch at ConditionRed, units at 0.3 (unchanged).

The old single `fire` did **9 hp/s** — six times the original's fiercest burn, a number picked
by eye. Fire is a smoulder plus a visual state, not a second damage system: a full-health
refinery burning the whole ladder down loses about 13 hp of 950.

### IsSticky

`VehHit1/2/3` and `Frag1` carry `IsSticky` — "sticks to unit in square". `FBall1` and
`ArtExp1` do not. The distinction is physical: a spark struck **off** something rides that
thing, while a shell's fireball belongs to the ground where it went off. Without it a tank
crossing the map at seven units a second left its own impact sparks hanging in mid-air, which
was happening to every moving target in the game.

### Three things this shook out

1. **A dangling `ChainTo` crashed the whole match.** Deleting the old `fire` key left `boom`
   chaining to a name that no longer existed, and `_rtsAnimAI` threw reading `.loops` of
   `undefined` mid-tick. Forty targeted assertions passed; the first real match died on tick
   one. A typo in a data table now drops the effect instead of stopping the game, and a test
   asserts every `chain` in `RTS_ANIMS` resolves. A fireball now chains to `firesmall` — a
   ground fire, with nothing attached, so it does no damage.
2. **The flame was nearly drawn twice.** `_sprFire()` already existed for a building coming
   apart. `_sprFx` calling it again would have baked a second identical set of canvases that
   drift apart the moment either is retuned; `S.fx.fire = S.fire` in `_rtsSprites` shares the
   one set. Doing that required the effect renderer to stop forcing every frame **square** —
   a flame is 16×20, and squashing it to 16×16 is why sharing looked impossible at first.
   Every pre-existing effect set is square, so honouring aspect changed none of them.
3. **Flame size must come off footprint WIDTH, not cell count.** Scaled on `cells/9`, a 3×3
   got only 20% more flame than a 1×1 and the fire on a refinery read as a spark. It now
   matches the formula the dying-building flame already used, so a burning building and a
   dying one are the same fire at the same size.

### Verified

40 assertions in `burn.js`: the ladder's chain order, ADATA's damage rates and relative
sizes, only-big-scorches, ignition rung by footprint, no flame stacking on repeated ignition,
the walk down big → med → small → smoke → out, the burning flag clearing so a thing can catch
again, re-ignition topping a burnt-down fire back up, per-rung damage measured against
ADATA's 1.5 hp/s, a big fire finishing a 3 hp building **and a small one correctly failing
to**, ignition happening on its own below ConditionRed but not at half health, sticky sparks
riding a mover while fireballs and hits on buildings do not, a sticky spark neither damaging
its host nor putting its fire out, and the shared non-square flame set.

Regression: storage 34/34, save/load 31/31, verbs 26/26, mech 20/20. Ladder **296 / 220 /
174 s** — identical to the run before this change, which matters because burning structures is
new damage that did not exist.

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

## Why the art read flat, and the two things that fixed it

Asked why the buildings and vehicles didn't look like the real thing. Beyond the obvious — there
are no original assets here and never will be — the answer was two concrete defects, both found
by rendering every asset onto clear ground and *looking*, which had not been done in a while.

**`R3_K` was 0.8.** That constant is how far one unit of model height climbs the screen, and at
0.8 a 50-unit-tall structure rose only 40 px above a 72 px footprint. The roof dominated every
sprite and the walls were a thin band beneath it — buildings read as plates lying on the grass.
The silhouettes were *already in the models* (the yard's gantry, the refinery's silos, the power
plant's stacks); they were being squashed. **1.3** lets them show a real front elevation.

Raising it cannot break footprint alignment, and that is worth knowing: the ground plane is not
foreshortened at all, so K multiplies height only. The extra rise lands in `head`, the headroom
above the footprint that `_r3BakeFootprint` measures and the renderer offsets by, so a 3×3
building still covers exactly its 72×72 pixels of ground.

**The unit models were four boxes each.** A tank was two track boxes, a hull, a turret and a
barrel; infantry were a torso box and a helmet box. No amount of projection fixes that. They now
carry track runs with road wheels and fender skirts, a sloped glacis, a tapered turret with a
mantlet and muzzle brake, a hatch and an aerial; the buggy has four round wheels with hubs and a
roll hoop; the harvester has a ribbed hopper, a cutter head with teeth and a stack; infantry have
legs, shoulders and a helmet brim so they read as figures rather than dominoes.

**`_r3Cyl` is a VERTICAL cylinder** — its `h` runs along y. Anything lying along the ground has to
be built from boxes. The first draft of the tank made the gun barrel a 9-unit vertical cylinder,
i.e. a flagpole.

### The bug that raising K caused, and the assertion that now prevents it

`_r3BakeCentred` centres a model on its **origin, not its bounds**, so a taller model runs off the
top of its square long before it runs off the sides. Raising K lifted every roofline by 60% and
silently sheared the top off the infantry and the gun off the tank. The hand-picked canvas sizes
that had been fine for years were suddenly wrong, and nothing said so.

Hand-picked sizes were the real defect, so they are gone. `_r3FitSize(models, margin)` measures
the worst case over **every variant at every one of the eight facings** and returns the square
that holds it; `_sprUnitFit` memoises it per unit type. All variants of one unit must share a
square — hull and turret are drawn at the same screen position and would separate otherwise, and
a prone squad that changed size would jump — so the measurement takes the union.

`unitzoom.js` asserts **no opaque pixel touches any edge of any baked unit frame**, all eight
facings. That is what caught this, and it is cheap enough to keep.

**Structures are deliberately exempt from that assertion**, and getting this wrong cost a round
trip: `_r3BakeFootprint` sizes their canvas to exactly `footW × (footD + head)`, so a 3×3 building
is *required* to fill all 72 px of its width and to reach the top of its headroom. Touching the
edge is correct there. The structure assertion is that the sprite is exactly footprint + headroom
instead.

### Cost

Sprite memory 0.8 MB → 2.2 MB (the extra is transparent margin; the renderer draws the canvas
centred, so margin is invisible and free at draw time). Frame time 1.38 ms → 1.32 ms across 30
frames on a populated field — unchanged. No simulation code is touched.

### Still open on the art

Not done yet, in the order they are worth doing: the shading ramp is narrow and the whole player
palette sits in one mid-tone navy band, where the reference separates a bright top, a mid front, a
near-black side and a hard dark outline; there is no yaw on structures, so an axis-aligned box
shows top and front only and never a third face (`rts.r3d.js` documents this and says form should
come from cylinders, chamfers and sloped roofs — the buildings mostly still don't); and the
per-building silhouette work (refinery dock ramp, factory chevron apron) is untouched.

## Saving a battle — from SAVELOAD.CPP

`src/rts.save.js`. Three ideas from the original, and they are the whole design.

**`Code_All_Pointers` / `Decode_All_Pointers` is the one that matters.** A pointer means nothing
in a file, so RA turns every pointer into a TARGET (type + index) before writing and back into a
pointer after reading. The JavaScript problem is identical in kind: `e.target`, `u.ref`, a team's
`members`, `G.sel` and a shell's `from` are object references, and JSON cannot express "the same
object as over there" — encode them naively and you get either a cycle it refuses to serialise or
a dozen duplicate copies of one tank. Here an entity codes to `{__e:id}`; the shared type-tables
(`RTS_WEAPONS`, `RTS_TEAM_TYPES`, `RTS_TRIGGERS`) code to `{__s:tok}` by **identity**, never
equality; typed arrays code to base64. Anything still self-referential after those rules throws
with the path that caused it rather than overflowing the stack.

**The ordering constraint is RA's too.** It codes Houses last and decodes them first, because
every other object's House pointer goes through them. Here entities decode in two passes — every
shell exists and is registered in `byId` before any field is resolved — so a reference resolves
regardless of the order things were written in.

**`SAVEGAME_VERSION` is the sum of the `sizeof()` of every class in the save.** Change a
structure and old saves stop loading, with no discipline required from the programmer.
`_rtsSaveVersion()` is the same trick in this game's terms: map size, unit/structure/weapon
counts, team types, triggers. Add a unit and every existing save is rejected automatically.

**Verify before you touch anything.** Load_Game's comment says that if it returns false "the
entire game will be in an unknown state", which is why the digest check happens *first* and bails
"before any damage could be done". Version, presence, byte length and an FNV-1a checksum are all
checked before `rtsClose()` is called. A refused load leaves the running battle untouched — the
harness asserts exactly that.

**What is not saved** — `Post_Load_Game`'s "fixup any expediency data that can be inferred from
the physical data loaded": meshes, power totals, the base-centre cache. Deriving them again is
smaller and safer than trusting a stale copy. Scorch is the one that needs a nudge: the marks
live in `G.scorch` but they had been *stamped* into a terrain bake that died with the old battle,
so every scorched cell is pushed back onto `G.newScorch` for the renderer to re-stamp.

**The RNG had to grow accessors.** `_rtsRngMake`'s state was a closure variable, which cannot be
read. A save that does not carry the generator's *position* resumes on a different roll sequence
and the match diverges from the first shot. `f.get()` / `f.set()` rather than a property updated
per call — it is the hottest function in the simulation. Both generators are created **lazily**,
so the restore has to construct a missing one with exactly the same seed the lazy path uses; the
first version of this silently left `oreRnd` null and the ore field grew differently from the
moment of loading. That was caught by the determinism test, not by looking.

**The load path goes through the same door as starting a battle.** `rtsLoadGame` parks the body
on `window._RTS_PENDING_LOAD`, closes, and calls `rtsOpen`, which applies it *between*
`_rtsNewGame` (which supplies every invariant) and `_rtsRInit` (which bakes the terrain the save
actually carries, not the one the seed would have produced).

Interface: 💾 / 📂 in the top bar, **Ctrl+S** to save, and a **RESUME BATTLE** button on the title
screen carrying the save's description. Loading is deliberately *not* on a key — it throws the
current battle away and that deserves a click. The title button is `Get_Savefile_Info`: the header
is a separate small localStorage record, so listing a save never parses its 300 KB body.

### How this was verified

The test that matters is **simulation identity**, which the seeded RNG (PR #12) makes possible:
save at a moment chosen *by condition* — shells in the air, units with targets, wreckage on the
ground — then run 90 s from the original and 90 s from the restored copy and compare a fingerprint
covering every entity's identity, position, health, order and coded links, both economies, both
generator positions, all six mutable maps, and the team and trigger bookkeeping. They match. A
missed field shows up as a diverging fingerprint; that is how the `oreRnd` bug was found.

31 assertions in `save.js`: the round trip; references decoding to live objects rather than copies
(4 targets, 5 harvester links, 11 teams / 44 members, 1 shell in flight, the 3-unit selection);
type-tables decoding to the shared objects; power recomputed; scorch re-queued; the storage guards
(corrupted body, truncated body, wrong version — each refused with the running game untouched);
the full button path save → quit → resume; a seven-minute battle at 182 entities saving to 304 KB;
and the resumed frame rendering **0 % of pixels different** from the frame that was saved.

Two harness assertions were wrong before the code was: one expected the difficulty *key* where
`desc` carries the display name, and one capped screen darkness at 50 % when 71 % of an idle
game's map is legitimately under shroud. Compare the two frames' darkness to each other, not to a
number picked by eye.

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

## Selecting things — from DISPLAY.CPP

Before this the whole selection vocabulary was: click, rubber band, control groups. That is
less than any RTS of the era shipped with, and the missing commands are the ones a player
reaches for every few seconds.

**`Is_Players_Army` is the one predicate, and everything routes through it.** Player-controlled,
selectable, *not a building*. That last clause is why dragging a band across your own base
grabs the tanks parked in it and leaves the barracks alone. It lives here as `_rtsIsArmy(e)`
and the band, the double-click, select-all, the object cycle and the team hotkeys all call it —
one definition, so they cannot drift apart. Several of those used to inline their own copy.

**`Next_Object` / `Prev_Object`** walk the ground layer for the next object passing that
predicate, wrapping to the first when you run off the end and starting at the front when
nothing is selected. `G.ents` is this game's ground layer and its order is stable for an
entity's lifetime, so N walks the army in a fixed order rather than jumping about. Bound to
**N** and **Shift+N**. The originals select *and centre*, and so does this — the point of the
key is to go and look at the unit, not to tick a box off screen.

**`Center_Map` with no argument** averages the selection's coordinates and puts the tactical
view there. Bound to **Home**; with nothing selected it falls back to your command yard, which
makes it the "where was I" key after chasing a raid across the map. `_rtsHandleTeam`'s alt case
was doing this arithmetic inline and now calls `_rtsCenterOnSel` too.

**Double-click a unit to select every one of its type in view.** Deliberately scoped to the
tactical view, not the whole map — "all the ones I can see" is the useful command; "all the
ones I own" is Ctrl+A. 350 ms window, re-armed on every click so a triple-click reads as two
double-clicks rather than one double plus one dead click.

**Ctrl+A is mine, not a port** — the originals have no select-all — but it runs through the
same `Is_Players_Army` filter, so it takes the army and never the base.

DISPLAY.CPP's small pixel threshold before `Mouse_Left_Held` engages rubber-band mode was
already matched (`> 4` in `onmousemove`); nothing to change there.

**Two things the harness caught that clicking would not have.** Ctrl+A shares its key with
attack-move, so without the modifier check it armed attack-move as a side effect of selecting
the army — a mode you would only notice on your next right-click. And the double-click test
initially "failed" at 7-of-5 because the game spawns its own starting units: the expected count
has to be measured from the world, not from what the harness placed. Assert against a value you
derived, not one you assumed.

The start screen's key list had also drifted — it never mentioned S, the team hotkeys or the
radar orders. It now lists everything that is bound.

Verified: 43 assertions across `sel.js` (predicate, double-click scoping, additive selection,
cycle order/wrap/centre/recovery-when-the-held-unit-dies, `Center_Map` averaging and dead-member
handling, team hotkeys and band select unregressed) and `selkeys.js` (the same commands driven
through real DOM key and mouse events, plus 30 s of simulation afterwards).

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

## The units, and the first piece of real reference art

Four sidebar-cameo pages from CNCNZ.com — Allied and Soviet, units and structures. These are the
first *actual game art* in this project rather than a description of it. The 64×48 cameos are
embedded in the PDFs as raw Flate streams, so no PDF tooling is needed: scan for image dicts, keep
the ones at 64×48, inflate, wrap in a PNG header. 106 of them across the four documents.

They settled a question that had been guessed at from the start, and the guess was wrong.

**Vehicles in Red Alert are not the team colour.** Every tank, truck and jeep in the cameos of
*both* factions is khaki, olive or grey-green; the team colour is a remap over a small part of the
sprite. Ours were team colour end to end, and that is most of why a Battle Tank, a Light Tank, an
artillery piece and a Harvester read as four blue lumps that differed only in outline.

So `RTS_PAL.veh` carries the body — Allied grey-green, Soviet warm khaki — and the team colour is
cut back to the turret cap. **That split was measured, not assumed.** The first attempt put the
team colour on the whole deck, which is the move that made structures readable, and it did nothing:
the tank still came out 36% blue pixels, because under a camera that looks down the deck *is* most
of the sprite. On a structure that is the point; on a vehicle it buries the khaki. Turret cap only:
tank 18%, light 9%, artillery 7%.

**`RTS_PAL.steel` is a blue grey**, and it was tinting every gun. An artillery piece measured 45%
blue pixels with a hull carrying no team colour at all. Gun tubes now use `RTS_PAL.gun`, a neutral
warm gunmetal.

### Infantry are told apart by colour, not by shape

Rendering all fifteen units as bare silhouettes, eight facings each, proved what no amount of
modelling would fix: **nine of them were the same blob.** Rifleman, rocket soldier, grenadier,
flamethrower, engineer, medic, thief, Tanya and the attack dog are all one figure-sized stack of
boxes at 24 px, and always will be.

The cameos show how the original solves it — the engineer's yellow hard hat, the medic's white
tunic and red cross, the thief in black. So `RTS_INF_KIT` gives each kit a uniform, and the
identity marker is the **top of the helmet**, because with `R3_K = 1.3` that is the single largest
patch of any soldier. Same reasoning as putting the team colour on a building's roof. The helmet's
*sides* stay team-coloured on every kit, so a squad of medics still shows whose it is without
letting ownership compete with identity for the surface the camera actually sees.

The attack dog is now **one** animal rather than two, running along +x at knee height, in tan with
a team collar — the only unit not in uniform. A pair of them read as a squad, which is exactly
why it shared its silhouette with the infantry.

### The size ladder, and why a barrel kept disappearing

A Battle Tank measured **69 px — just under three cells.** That put it level with a 2×2 building
and turned four of them into one unreadable slab. `RTS_UNIT_SPAN` sets each unit's span in art
pixels (a cell is 24), and `_sprUnitScale` measures the unscaled model once and brings it onto the
ladder via `_r3Scale`. Authoring stays at whatever scale is comfortable to write, so changing how
big a tank is cannot silently change its proportions. Tank 69 → 41, Mammoth 75 → 49, artillery
73 → 43.

The memo is seeded with `1` before it measures, so the `_sprUnitModel` call inside `_sprUnitScale`
reads that and returns raw geometry instead of recursing.

**Screen height is `z - 1.3y`, and that is why three of eight facings had no gun.** A barrel swung
toward the camera gains z and gives it straight back to its own height. The old gun sat high on
the turret and stopped short, so the two cancelled almost exactly and it folded into the hull.
Guns are now mounted **low and reach well past the track guards** — then z wins and the muzzle
clears the hull at every facing. Artillery, whose entire identity is one tube, also got a pale
gunmetal tube over a deliberately squat chassis: depth is `y + 1.3z`, so at the facings where it
does lie over the hull it draws on top of it as a bright bar instead of vanishing.

### Verifying

`unitzoom.js` still passes — no opaque pixel touches any canvas edge, all fifteen units, all eight
facings. The change is render-only: nothing in `rts.core.js` or `rts.rules.js` moved, and no
simulation or UI code reads a unit sprite's dimensions.

The diagnostic worth keeping is the **silhouette sheet** — every unit, eight facings, alpha
thresholded to black on white. Colour hides sameness; a silhouette sheet cannot.

## Thirty-two facings — from OpenRA's `mods/ra/sequences`

OpenRA's mod folder is not the original game's data, but its sequence definitions describe the
original sprite sheets exactly, and one line settles a question that had been assumed wrong from
the start:

```
harv:  idle:  Facings: 32   UseClassicFacings: True
e1:    stand: Facings: 8
```

**Red Alert bakes vehicles at thirty-two facings and infantry at eight.** Every entry in
`sequences/vehicles.yaml` is 32; every entry in `sequences/infantry.yaml` is 8. We were baking
eight for everything, which is why a tank turning in the original sweeps round while ours popped
through 45-degree steps — one of the more visible differences left, and a mechanical one rather
than a matter of taste.

`_sprFacingsFor(def)` returns 32 for vehicles and 8 for infantry; `_sprUnit` and `_rtsDrawUnit`
both read it, so there is one definition of the number.

**`_r3FitSize` now samples 32 yaws regardless of what the caller will bake.** A square measured
over only the eight cardinal-and-diagonal facings is not guaranteed to hold the ones between them,
and getting that wrong shears the gun off a tank silently. The measurement runs once at load.

**The combined bake for turreted units was dead weight.** A tank is only ever *drawn* as hull plus
turret, so `S.unit[side][key]` was 32 canvases per unit per side that nothing referenced. It now
aliases the hull. That is 192 canvases and ~270 ms of the cost paid back.

### Cost

|                | 8 facings | 32 for vehicles |
|----------------|-----------|-----------------|
| bake at load   | 572 ms    | 772 ms          |
| canvases       | 602       | 981             |
| sprite memory  | 2.8 MB    | 5.3 MB          |

Draw cost is unchanged — the same `drawImage` calls, indexing a longer array. `_rtsDrawUnit`
already has the unit def in hand, so it calls `_sprFacingsFor(d)` rather than `_sprFacings(key)`;
`rtsUnitDef` is a linear scan and this runs per unit per frame.

`clip.js` asserts no opaque pixel touches a canvas edge and that every set has the facing count it
should — **1056 frames, both sides, all four variants.**

## What OpenRA's rules are NOT good for

The `mods/ra/rules/*.yaml` files are OpenRA's own rebalance, not the original's numbers, and
adopting them would move this project *away* from the thing it is imitating. The vehicle costs
make it obvious:

| unit          | ours | original RA | OpenRA |
|---------------|------|-------------|--------|
| Light Tank    | 700  | 700         | 700    |
| Medium Tank   | 800  | 800         | 850    |
| Mammoth       | 1700 | 1700        | 2000   |
| Artillery     | 600  | 600         | 850    |
| Harvester     | 1400 | 1400        | 1100   |

Ours already match the original on five of six; OpenRA differs on four. Same story on infantry —
their Tanya is 1800 against RA's 1200, their Medic 200 against RA's 800. **So they were not
transcribed.** What the mod folder *is* good for is anything descriptive of the original data
rather than tuned on top of it: `sequences/` (facing counts, frame layouts, turret/hull splits)
and `tilesets/` (terrain type per tile).

## The base was 66% blue — structures against the cameo reference

Reported as "the buildings are all blue toned", which is measurable, so it was measured:
**66% of all opaque structure pixels were blue-dominant.** That is the same fault the vehicles
had, one level up, and the structure cameos say what it should be instead.

A Red Alert base is built from several materials. The power plants are **red brick with brick
chimneys**; the Allied barracks are **sand-coloured Nissen huts**; the radar dome, walls and
pillbox are **bare concrete**; the tech centre is a **pale office block**. `RTS_PAL.mat` carries
brick, sand and pale, and each structure is built from the right one.

**The team-coloured roof stays, but as a band rather than the whole surface.** The four worst
offenders — tech centre, silo, refinery, power — each had their entire top face in team colour,
and a top face is most of a sprite under this camera. They now take a material roof with a narrow
team stripe laid across it. **66% → 13%**, and ownership still reads at a glance.

The cameos cannot argue against a team-coloured roof at all, and it is worth being clear why:
they are *sidebar icons*, drawn separately from the in-game sprites, carrying no player remap —
the Construction Yard, Power Plant, Refinery, Radar Dome and Silo are literally the same image on
the Allied and the Soviet sheet. What they are good evidence for is **form and base material**,
which is what was taken from them.

### Forms that were simply wrong

| building     | was                          | reference                            |
|--------------|------------------------------|--------------------------------------|
| Yard         | flat slab + crane arm        | **vaulted hangar**, one big arch     |
| Barracks     | pitched hall + flag          | **three sand Nissen huts**           |
| Silo         | three cylinders              | **low ribbed bunker**                |
| Depot        | open gantry frame            | **flat round apron** + a small hut   |
| Tech Center  | tipped satellite dish        | **tall pale block**, ribbon windows  |
| War Factory  | flat deck + roll-up door     | **big dark gable** over the bay      |
| Adv. Power   | 4 stacks + cooling tower     | 4 brick chimneys, **no tower**       |
| Kennel       | pitched shed + wire run      | **red doghouse**, arched entry       |

The Tech Center is the one worth calling out: as a dish on a block it was a second Radar Dome in
the same base. It is now the only structure taller than it is wide.

### `_r3Vault`, and why the axis matters

A barrel vault could not be built at all — `_r3Cyl` is upright, and faking an arch out of stepped
boxes reads as a staircase at 48 px. `_r3Vault` is a half-cylinder, elliptical so height and span
are independent.

**The first version ran its axis along x and read as a flat plate**, which is a projection fact
rather than a bug: with the axis along x you see almost nothing but the near flank, which sweeps
from normal +z to normal +y and shades as a gently graded wall, while the two curved ends sit
exactly edge-on and never draw. The measured screen extents make it obvious — the near flank
covers ~51 px of the sprite and the far flank ~6.

`alongZ` puts the arch profile in x-y and extrudes along z, so the **curve is in the silhouette**
and the near cap faces the camera. That is the version that reads, and it is what the yard, the
barracks huts and the kennel all use.

## Rock, from a coverage field instead of rectangles

The last obviously-generated thing on the map. Rock was drawn per cell as an axis-aligned box,
inset a few ragged pixels wherever the neighbour was not rock, and it rendered as a **paved
plaza**: you could count the 24-pixel cells along every edge, the plateau was one flat grey, and
the "drop" was a thin kerb along the bottom with tick marks in it.

`cov(px, py)` samples the cell mask at cell **centres** and interpolates bilinearly. Its 0.5
contour therefore lands exactly on the cell boundaries — the painted rock still matches the rock
the pathfinder blocks, which is not negotiable — but it arrives there as a smooth curve rather
than a staircase, and a noise term breaks it up.

**The noise amplitude is a correctness parameter, not a taste one.** At 0.55 the boundary wandered
most of a cell and rock was painted over ground a harvester could drive through. 0.34 keeps the
wander to about a third of a cell.

Every other feature is read off the same field by asking "is there still rock this many pixels
away": the sunlit north lip, the shelf under it, the two side walls, and the south drop — whose
**height** is how far the rock continues below, so a deep massif gets a full cliff face and a thin
spur a short one. That is what makes a ridge read as a landform instead of a shape with a dark
line under it. The face is striated from a hash on **x only**, so the streaks run down the cliff
rather than speckling it.

`RTS_PAL.rock` gained a fifth tone — a near-black used only at the base of a face — and the whole
ramp was warmed towards brown; the neutral grey read as poured concrete against the olive ground.

### Verifying, and the metric that lied first

`rockfit.js` measures the paint against the blocking data:

| | |
|---|---|
| rock painted 2+ cells from any blocked cell | **0 px** |
| spill into an adjacent cell | 4.3% |
| blocked cell area actually painted | 89.6% |

The first run of that harness reported **8149 stray rock pixels**, which was the harness being
wrong rather than the art: the scattered pebble clutter on open ground is drawn in `rock[0]` and
`rock[2]`, so counting all five tones counts every pebble on the map. The stray and spill figures
use only tones 1, 3 and 4, which nothing but the ridge draws.

### Cost

Naively the field is wanted at five or six nearby points per block, and evaluating it there
directly cost **+353 ms** on the terrain bake. It is thresholded once per 2×2 block into a
`Uint8Array` mask instead, and the near-rock cell set is worked out once rather than rescanned per
pass. **702 ms before, 712 ms after** — effectively free.

Zero is the correct value everywhere the mask is not filled, which is what makes the sparse fill
safe: two cells out from any rock, `cov` is 0 and the noise can only reach 0.17.

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

The cost is that every place treating a unit as being ON THE MAP has to say so, and it turned out
to be only six: the tick, the draw list, target acquisition, and three selection paths
(`_rtsIsArmy`, the click scan, the overlay pass). Two assertions pin the save behaviour — that a
loaded APC comes back with its cargo, and that the passengers come back **by identity** rather
than as copies.

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

## Real Red Alert artwork, read from the player's own files

The MIX, LCW, SHP and Blowfish readers all work. `src/rts.mixart.js` is the seam between them
and the renderer.

**It loads from disk rather than shipping with the game, and that is deliberate.** Red Alert was
released as freeware by EA in 2008 and the archives are downloadable, but redistributing the
artwork — especially re-cut into someone else's spritesheets — is a different thing from linking
to the official package, and OpenRA, who have thought about this far longer, do not redistribute
it either. **No game data is committed here.** The player points the game at their own copy on the
home screen and the files are read in the browser; nothing is uploaded.

Without content the game is exactly what it was. `_rtsArtReady()` is the only thing deciding which
set the renderer gets, and `_sprBuilding` / `_sprUnit` fall through to the procedural bakers for
any key with no counterpart — so a missing mapping is a fallback, not a hole.

### Team colour is a palette remap, not a tint

RA recolours a player's units by rewriting palette indices **80–95** rather than tinting pixels.
That is why the vehicles come out of the archive gold and green: those are the unremapped slots.
Rebuilding the block from our team colour keeps the original's shading intact — the ramp inside
the block is preserved and only its hue moves — which is exactly what a per-pixel tint destroys.

Index 4 is the drop shadow and is drawn as translucent black; painting it literally puts a hard
green blob under every unit.

### The facing map was measured, not reasoned

RA's frame order starts somewhere else and runs the other way, and the first attempt had it wrong.
Decoding all 32 turret frames of `2tnk.shp` and taking **the pixel furthest from centre — the
barrel tip** — gives what each frame actually points at:

```
frame  0 -> -93 deg (north)     frame 16 -> +94 deg (south)
frame  8 -> -173 deg (west)     frame 24 ->  -7 deg (east)
```

So the index starts at north and runs **anticlockwise**, while ours starts east and runs
clockwise. Solving `-90 - i*(360/n) = f*(360/n)` gives **`i = -n/4 - f`**. The first version had
the quarter-turn's sign the other way and every vehicle drove sideways.

**A centroid check said "wrong" but could not say by how much** — a turret's centroid barely moves
as it rotates, and it reported a 190-degree spread that meant nothing. Switching the measurement
to the barrel tip turned it into a number: mean offset from the requested bearing **0.1°**.

### Verifying

The harness feeds the four archives into the running page exactly as the picker does, then
measures. Fallback suites all still pass with no content loaded: `clip.js` 1248 frames, save 31,
flight 13, the reader suite 53.

### Infantry are a sequence table, not a rotation set

From `mods/ra/sequences/infantry.yaml`:

```
stand:        frames 0..7                     (one per facing)
run:          Start 16, Length 6, Facings 8
prone-stand:  Start 144, Stride 4, Facings 8  (so facing f is 144 + f*4)
```

**Whether a type has crawl artwork at all is `IsCrawling` in `IDATA.CPP`** — the Dog, Engineer,
Spy and Thief are built with it false — and our rules already carried that as `crawl`, ported
long before there was any artwork to apply it to.

Gating on it matters more than it looks, and a bounds check is *not* enough: frame 144 exists in
all nine files, it just isn't prone artwork in the ones that have none. **What sits there instead
is the death sequence.** The first version drew a pool of blood for every pinned engineer, dog and
thief, and the sprite sheet showed it immediately.

The walk cycle is deliberately left alone: it needs the renderer to pick a frame from a sub-array
per unit per tick, which is a change to how every unit is drawn rather than to where sprites come
from.

### Terrain templates, and the trees

`.tem` files are two different things and the extension does not tell you which.

**Terrain templates** are a container of their own: a short header, then `count` tiles of
24×24 **raw** palette indices back to back, no compression. The header field order cost a
moment — the obvious reading puts `imgStart` at offset 12, which is the *file size*, and yields
tiles that run off the end of the buffer. It is at **16**.

**Trees are SHPs with a `.tem` extension**, which is why probing for `t01.shp` found nothing at
all. Frame 0 is the standing tree; the rest are the burning and felled sequence.

Only the base ground is repainted from templates — clear grass (one of sixteen variants per cell,
the way the original picks them) and water. **Rock, cliffs, ore and the dirt patches' drawn edges
stay procedural**, because those are multi-tile templates with real placement rules and
half-applying them looks worse than either end state. Only the 48×48 single trees are used;
`tc01`–`tc05` are 72×48 and 96×72 clumps that span several cells and would overlap their
neighbours without the placement rules that go with them.

Our own trees against the original's ground were the one thing in the first pass that looked
plainly wrong — bright cones on RA's dark temperate grass — which is what made the real ones
worth doing in the same change rather than the next one.

Every cached bake is dropped when content arrives (`_RTS_SPR`, `_RTS_UFIT`, `_RTS_USCALE`,
`_RTS_TREES`, and the two new caches), or the game keeps drawing the sprites it made before the
files were loaded.

### Ore, and the walk cycle

**Ore and gems are overlay SHPs** wearing the theatre extension, like the trees: `gold01`–`gold04`
with **twelve** density frames each, `gem01`–`gem04` with three. Four files × twelve frames is the
variant axis and the density axis in one place — the file picked per cell is the variant, the
frame within it is how full that cell is.

Twelve stages is three times what our own sprite had, so **the renderer now asks the sprite set
how many stages it has** rather than assuming four. Hard-coding `Math.min(3, ...)` worked right up
until real art arrived and would then have quietly shown a third of every field.

**The walk cycle** is `run: Start 16, Length 6, Facings 8`, kept as its own set rather than folded
into the standing frames — the renderer picks a stance first and a frame within it second, and a
flat array cannot express that. It only exists with real artwork; a missing entry just means the
standing frame keeps being drawn.

`gait` drives the phase, and it has been on every unit since the first week: *MasterDoControls
marks DO_WALK and DO_CRAWL 'randomstart'*, so a squad does not march in lockstep. It was ported
long before there were any frames for it to stagger.

### A flaky test, caught by adding a debug line

The walk assertion failed once and then passed on the next run **with only a `console.log` added**
— which is the signature of a flaky test, not a bug. `rtsGo` picks a random seed, so whether the
soldier could walk fourteen tiles east depended on the map. It now pins the seed and searches
outward for somewhere pathable, so it measures the walk cycle rather than the pathfinder's opinion
of one particular tile. Three consecutive runs, 5/5.

## Why cliffs are NOT taken from the templates

The tileset was surveyed properly before deciding, and the answer is worth writing down so nobody
repeats the investigation.

`mods/ra/tilesets/temperat.yaml` describes 308 templates in eight categories:

| category | count | shape |
|---|---|---|
| Beach | 54 | mostly 3×3 |
| Water Cliffs | 52 | mostly 2×2 |
| Bridge | 48 | mixed |
| Road | 45 | mostly 2×2 |
| Debris | 42 | **26 are 1×1** |
| Cliffs | 42 | **28 are 2×2** |
| River | 21 | mixed |
| Terrain | 4 | clear, water |

2×2 cliff pieces look like an autotile set, and the yaml even gives a per-cell terrain type — so
the obvious plan is to derive a 4-bit occupancy mask per template and build a bitmask lookup.

**That does not work, and the data says so plainly.** Nearly every 2×2 cliff template masks to
`1111`:

```
135  s01.tem  mask 1111    0=Rock 1=Rock 2=Rock 3=Rock
138  s04.tem  mask 1111    0=Rock 1=Rock 2=Rock 3=Rock
144  s10.tem  mask 1111    0=Rock 1=Rock 2=Rock 3=Rock
```

The terrain type encodes **passability, not shape**. Every one of those pieces is impassable rock
in all four cells; what differs between them is the *artwork* — which edge carries the cliff face,
which corner turns. Nothing in the tileset says which is which.

So placing them correctly is not a port of anything. RA's cliff templates are a **painter's
palette for the map editor**, and real RA maps are hand-authored: a person picks the north-east
corner piece because they can see it. Automating it means classifying 42 templates by analysing
their pixels to infer where each face lies, then writing a generator that chains them — an
invention, with a real chance of looking worse than the procedural cliffs already here, which were
measured (`rockfit.js`: 0 px painted more than one cell from a blocked cell, 4.3% organic spill).

**What IS automatable is the 1×1 set**, and that is what went in: `rf01`–`rf07` loose rock and
`p01`–`p04` set dressing — fallen logs, a wreck, a crashed aircraft. Self-contained, one cell, no
placement rules to get wrong.

If the pixel-classification route is ever wanted, the shape of it is: decode each Cliffs template,
find the shadowed face band per cell, label each piece N/S/E/W/corner, then run a marching-squares
pass over the rock regions. That is a project, not a change.
