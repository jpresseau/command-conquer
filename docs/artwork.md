# Reading the player's own Red Alert files

No game data is committed to this repository and none ever will be. The player points the
game at their own copy, the files are read in their browser, and nothing is uploaded.
Implemented in `src/mixart/`, `src/map/` and `ra/`.

> Reference, split out of `CLAUDE.md`. The rules that must be followed before touching
> anything are still in `CLAUDE.md`; this is the working behind them.

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
