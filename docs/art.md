# Art — why it looked wrong, and what fixed it

Every one of these was found by rendering the thing and measuring it, not by looking at
code. The rules distilled from them live in CLAUDE.md under **Presentation rules**; this is
the working that produced them.

> Reference, split out of `CLAUDE.md`. The rules that must be followed before touching
> anything are still in `CLAUDE.md`; this is the working behind them.

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
