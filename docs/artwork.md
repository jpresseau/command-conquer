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
the way the original picks them) and water. Ore and the dirt patches' drawn edges stay
procedural. **Cliffs and the shoreline used to as well**; both are now taken from the real
templates, and each took throwing away a plan first — see the two sections at the bottom.

Open water is **five tiles, not one**. `w1` is a single 24×24 tile, and asking for it alone put
the same speckle in every water cell on the map; `w2` is a 2×2 template whose four tiles are open
water too, so the pool is w1 plus those four. Only the 48×48 single trees are used;
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

## Cliffs, from the templates — and the plan that had to be thrown away

The tileset was surveyed properly before deciding, and both the survey and the two dead ends are
worth writing down so nobody repeats them.

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

### Dead end 1: the terrain classes are not shapes

2×2 cliff pieces look like an autotile set, and the yaml gives a per-cell terrain type — so the
obvious plan is a 4-bit occupancy mask per template and a bitmask lookup. **That does not work,
and the data says so plainly.** Nearly every 2×2 cliff template masks to `1111`:

```
135  s01.tem  mask 1111    0=Rock 1=Rock 2=Rock 3=Rock
138  s04.tem  mask 1111    0=Rock 1=Rock 2=Rock 3=Rock
144  s10.tem  mask 1111    0=Rock 1=Rock 2=Rock 3=Rock
```

The terrain type encodes **passability, not shape**. Every one of those pieces is impassable rock
in all four cells; what differs is the *artwork*. Nothing in the tileset says which is which, so
the shape has to come from the pixels.

### Classifying the pixels: rock is an INDEX SET, not a colour

A per-pixel colour test does not work either. This tileset dithers its grass with near-black
neutrals that the rock shadows also use, and a green-versus-not-green test called **65% of a
mostly-grass cell rock**. What is unambiguous is the palette index set: `clear1.tem` is plain
ground and nothing else, so an index it never uses cannot be grass. Those seeds are then closed
over a 5×5 window, which turns "the bright beige pixels" into "the rock". Judged against the art
side by side, that reads correctly on all 157 cells of the 38 decoded templates.

(`temperat.pal` is in **local.mix**, not `temperat.mix`. Four of the 42 Cliffs templates —
`cliffsl1`–`cliffsl4` — are not in the base archive at all.)

### Dead end 2: they do not chain

With the shapes in hand the plan of record was an autotile chain: a piece that enters from the
west and leaves to the east, another that turns north. The edge signatures even look promising —
8 templates carry rock on both the east and west borders, 7 on both north and south, and there
are end caps for all four directions.

**Measured, chaining is worthless.** For every ordered pair of templates, take the 24 pixels down
their shared border and count where rock meets rock and grass meets grass:

| pairing | border agreement |
|---|---|
| each template's **best** available partner | **78.9%** |
| a partner picked **at random** | **78.8%** |

There is no join structure in these borders to exploit. Westwood drew 38 rock formations, not 38
interlocking segments, and a chainer would be inventing a relationship that is not in the data.

### What went in instead: fitting

What the templates actually are is 2×2 and 3×2 lumps of rock with grass baked around the edges,
so they are **fitted, not chained** — `src/mixart/cliffs.js`, on generated maps only (a real map
already names its own template per cell). A placement is legal when every rock cell of the
template lands on blocked rock, every grass cell lands on open ground, and nothing lands on ore,
a tree or the sea. Then a **seam term** scores each candidate against the pieces already placed
to its west and north, which is what turns a row of separate lumps into a ridge:

| | border agreement |
|---|---|
| greedy fit, no seam term | 88.7% |
| with the seam term (weight 8) | **91.8%** |
| + a full four-neighbour relaxation afterwards | 92.1% — **not worth the code** |

**Art versus blocking.** The two errors are not symmetrical, and this takes the kinder one. Rock
art spilling onto driveable ground makes a route look closed when it is open; a blocked cell
left looking like grass makes a route look open when it is closed, and a player who orders a unit
through it watches it refuse. The original takes the second error — RA blocks a cliff template's
whole footprint, grassy margin cells included. `RTS_CLIFF_MAXOPEN` takes the first:

| spill limit | rock cells covered whole | rock ink on open cells | seam |
|---|---|---|---|
| none | 100% | 29% | 91.8% |
| **0.4** | **99%** | **21%** | **93.0%** |
| 0.35 | 95% | 17% | 93.0% |

Whatever the whole templates miss is mopped up with a **single cell** lifted out of a nearly-solid
template — the piece the original itself uses for a lone boulder. With that, every blocked cell on
every seed measured ends up under cliff art, which is what lets `_sprDrawRock` be skipped
outright rather than mixed in beside it.

Cost, measured on a 128×128 map with 459 rock cells: library **29 ms** once, fit and paint
**19–23 ms**, against a terrain bake of **1217 ms**. Skipping the drawn cliffs more than pays it
back.

**The 1×1 set is still separate and still automatic**: `rf01`–`rf07` loose rock and `p01`–`p04`
set dressing — fallen logs, a wreck, a crashed aircraft — scattered on open ground.

**Water cliffs (`wc01`–`wc38`) are not done.** They are the same shape of problem against the
coastline mask rather than the rock mask, and the fitter would take them with a different pair of
predicates; nobody has measured whether the coastline the generator produces has room for them.


## The shoreline: single cells, not templates

The sand and the water were the last flat things on the map. With artwork loaded, grass and water
were painted from real templates and then **painted over** by `RTS_PAL` in 2px noise blocks
clipped to the cell grid — beside RA's own grass, a 24-pixel staircase of beige and blue.

Fitting whole Beach templates the way the cliffs are fitted **works and still looks wrong.** It
covers 98% of sand cells, legally, off the tileset's own classes — which unlike the Cliffs table
say what each cell is and mean it (`sh01` is `---k-ccbbwwiww--w---`). But our sand ring is one or
two cells wide, so a template with sand on top and water underneath passes every class check while
putting a south-facing beach on a **west-facing shore**. Stacked up the coast that reads as a
staircase of little wave lines.

The fix is to stop asking about classes and ask about the picture: does this piece's water lie
where the water actually is? Measured as the best any candidate can do, averaged over every sand
cell on seed 31:

| candidate | agreement with the map's waterline |
|---|---|
| best whole template | 0.82 (and 0.84 however hard the facing term is weighted) |
| best **single cell** | **0.96** |

The footprints were the constraint, not the library. So the shore loads one 1×1 entry per cell of
every Beach template — 516 of them — and hands them to the same packer, which still breaks ties on
the seam with the neighbour already placed.

### Both edges, and where the waterline runs

A shore cell carries a waterline, a grass line, or — where the ring is one cell wide — both. Each
edge gets its own field: 1 where the far material is, 0 where the near one is, and **0.5 on the
shore cells that carry that edge**, so the contour runs *through* those cells rather than along
their border. Splitting a single field down the middle instead puts each boundary exactly on a
cell edge, and the coast comes out as the same staircase — which is what the first two attempts
did, first at the waterline and then, once that was fixed, at the grass line instead.

Asking one question at a time is what makes this answerable:

| question | best available |
|---|---|
| where is the waterline | 0.962 |
| where is the grass line | 0.935 |
| grass here, sand there, water beyond (one three-way field) | **0.757** |
| the two edges scored separately and averaged | **0.898** |

The three-way version collapses because the field then asks for 78% sand per cell and RA has no
wide-sand tile — its beaches are narrow. Two questions, averaged, draws both edges.

Cost: 39 ms to build the library once, **177 ms** to choose and paint 429 sand cells. Written the
obvious way — sampling the two fields inside the candidate comparison — it was **2038 ms** of a
3141 ms bake, because the expectation was being recomputed for all 516 candidates instead of once
per cell.

One thing surfaced the moment the flat blue stopped being painted: the tuft and pebble scatter had
**always** been landing on the water, invisible under the paint that came after it.

## Roads: three ways of not working

RA's 45 Road templates cannot draw our roads, and it is worth writing down how thoroughly:

| approach | result |
|---|---|
| fit them like the cliffs | covers every road cell, and renders as camouflage — disconnected track fragments pointing every way at once |
| chain them | **35 of the 45** keep their track *inside* the footprint with clear margins all round; there are no ends to join |
| use them as fill | **no cell in the set is more than 55% packed earth**, against the 100% sand tiles the Beach set has. The best in the whole temperate tileset is `f06#5` at 0.71, a ford approach |

The reason is structural, not a gap in the library. Our roads are **2–4 cell wide carved swathes**
(most road cells have 3 or 4 road neighbours); RA's road art is a **narrow track with grass either
side**. They are different things wearing the same name, and the fix is narrower roads — a terrain
change with pathing consequences, not an art one.

What *can* be taken is the colour. The drawn road stays drawn, painted in three tones lifted by
luminance from the dirt pixels the Road templates actually use, weighted by how often each index
appears. And its tone now comes from a smooth field rather than a per-2px hash — the road had the
same white-noise bug the grass had, and more visibly, because a road is a solid block of one
material with nothing else going on in it.
