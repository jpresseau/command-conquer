# CLAUDE.md

Guidance for Claude Code (claude.ai/code) working in this repository.

**Command & Conquer: Red Alert** (short name *Red Alert*) is a browser rebuild of Westwood's
1996 RTS, deployed via GitHub Pages from `main`.
It ships as one generated, fully self-contained `index.html` (~1.0 MB) — no network calls, no
asset files, and **no libraries at all**. Every pixel and every sound is generated in code.
Real Red Alert artwork can be read at runtime from the player's own copy of the game, in their
browser; none of it is committed here and nothing is uploaded anywhere.

## Build — READ FIRST

`index.html` is a **generated artifact — never edit it by hand.**

1. Edit the relevant file under `src/`.
2. `python3 build.py` from the repo root.
3. Commit the `src/` change **and** the regenerated `index.html`.

`build.py` fails the build on: a syntax error in any source; two files defining the same
top-level name; or an external resource reference in the page. Do not remove those guards —
each one is there because the matching bug already shipped once.

## Tests — WRITE ONE

```
NODE_PATH=/opt/node22/lib/node_modules /opt/node22/bin/node test/run.js
```

Rebuilds and runs everything; `test/README.md` has the details. **Every change gets a test**, and
a test that could only have been written after the fix is not good enough — write the one that
would have caught it, and watch it fail against the old code before you believe it.

Two kinds, and the choice matters:

- `test/unit/` — plain node, no browser, milliseconds. This is where a new test belongs unless it
  genuinely needs layout, input or rendering. `test/lib/sandbox.js` evaluates game source in a
  `vm` context, so the rules tables, the save encoder and anything else DOM-free is reachable
  from here. Its `document` **throws** rather than returning a stub, so a unit test cannot
  quietly pass by exercising a fake.
- `test/e2e/` — Playwright against the **built** `index.html`, never `src/`.

Three rules that are load-bearing, every one of them learned from a test that passed while the
bug was still there:

- **Assert on outcomes, never on a handler having been called.** Where the camera ended up, what
  is on disk, which element takes a tap, how many credits moved.
- **Real input only.** Touch through CDP `Input.dispatchTouchEvent`, keys through
  `page.keyboard`. A hand-built event tests our listeners against our own guess at what a browser
  sends, which is the assumption most worth checking.
- **Check the precondition is reachable.** A check that a build tile is "inside the grid" says
  nothing about the next row being drawn over it; a check that an MCV survives a keypress proves
  nothing if it was parked where it could never have deployed anyway. If a spec needs a state to
  exist before it can observe anything, it must establish that state and assert that it did.

**"No errors" is not verification.** Three separate bugs here threw nothing at all: buildings
rendering pure black, music that was silent, and a START BATTLE button that did nothing. Measure
the output instead — tap an `AnalyserNode` on `_rtsA.master` and read RMS for audio; dump the
sprites onto a sheet at 6-9x and *look* at them, and sample the baked terrain's pixel histogram,
for art. A palette entry at 0% means that material is not being generated.

**Balance is measured, not judged.** The one number this project argues about is the ladder —
mean seconds an idle player survives, five seeds per difficulty — and `e2e/ladder` is the spec
that produces it. All gameplay randomness runs off the scenario seed, so a seed replays exactly
and an A/B is a comparison rather than an estimate. Two things to know before quoting it: a
change the idle player never provokes (a rebuild path, a crate, an aircraft) is *invisible* to
the ladder and needs its own harness, and a wide per-seed spread is a signal that something is
under-committed rather than inherent variance. `docs/measuring.md` has the history, including
the runs that were wrong.

## Layout

Each subsystem is a **directory of small files**, one per concern, concatenated by `build.py` in
the order `index.skeleton.html` lists them. Nothing runs at load — every file is declarations
only — so the order is for readability, not correctness, and a new file is one `//@@INC:` line.
Keep them small: if a file passes ~500 lines it wants splitting along its own banner comments.

- `src/rules/` — **every balance number**, data only. Retune here. `structures`, `units`,
  `weapons`, `missions`, `balance`, `ai`, `crates`, `vehicles`, `factions`, `teams`, `triggers`.
- `src/r3d/` — the **sprite baker**: a small 3D rasteriser that runs once at load.
  `primitives` (the solids), `render` (scanline fill + depth buffer), `bake` (fitting a sprite).
- `src/sprites/` — `bake` (palette + plumbing), `terrain`, `ore`, `models` (structures),
  `unitmodels`, `props`, `assemble`.
- `src/mixart/` — real Red Alert artwork read from the player's own files: `theatres`, `remap`,
  `frames`, `load`, `tiles`.
- `src/map/` — real Red Alert maps: `mainmix` (template tables), `load`, `build`, `starts`.
- `src/core/` — the simulation, and by far the largest subsystem. Deliberately renderer-free, so
  a whole battle can be stepped headlessly; swapping the 3D renderer for the 2D one cost it zero
  lines. `grid` (tiles, passability, A*, state), `terrain`, `base`, `crates`, `supers`,
  `entities`, `capture`, `transport`, `production`, `combat` (target + fire), `damage`, `move`,
  `units`, `ai`, `teams`, `missions`, `aisupers`, `ore`, `triggers`, `tick`.
- `src/render/` — canvas 2D. Reads the sim, never writes it. `camera`, `post` (light pass, water,
  shroud), `frame`, `draw`, `icons`.
- `src/ui/` — `shell` (open/close/resize), `sidebar`, `input`, `select`, `hud`, `camera`
  (panning + the main loop).
- `src/rts.audio.js` — all sound, synthesized at runtime with WebAudio. No sampled assets.
  `src/rts.sound.js` maps events to it; `src/rts.store.js`, `src/rts.save.js`, `src/rts.editor.js`.
- `src/title.js` — the standalone shell: title screen, difficulty picker, file pickers, RESUME
  BATTLE, install prompt, START. Loads last, after everything it calls.
- `src/index.skeleton.html` — the page shell and the include manifest, no JavaScript of its own;
  `src/style.css`.
- `ra/` — the file-format readers (MIX, SHP, LCW, Blowfish, PCX, AUD, ISO, zip, the INI/map
  parsers). Standalone and browser-free enough to be unit-tested directly.

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

## Reference

The rules above are what must be followed. Everything below is the **working behind them** —
what was ported from the Red Alert GPL source, what was measured, and what was deliberately not
done. Read the one that covers what you are changing; you do not need to read them all.

| document | what it covers |
| --- | --- |
| `docs/core-combat.md` | the blast model, armour classes, target selection, vehicle facings and fire, burning |
| `docs/core-units.md` | infantry behaviour and flags, missions, transports, aircraft, what the data files really contain |
| `docs/core-ai.md` | difficulty and IQ, the base blueprint, teams and their mission lists, committing an army |
| `docs/core-economy.md` | production charging, the two money pools and storage, ore fields, crates, what a building does while it stands |
| `docs/core-world.md` | shroud, start positions, triggers, saving a battle |
| `docs/roster.md` | the units and structures beyond the opening set, and the rule each was held to |
| `docs/ui.md` | selection, the sidebar, radar orders, and the 15 Hz animation cadence |
| `docs/art.md` | why the art read flat, read dark and read blue — and what the measurements said |
| `docs/artwork.md` | reading the player's own game files: MIX, SHP, palettes, terrain templates, fitting the cliffs |
| `docs/measuring.md` | the ladder, and how it has been misread |

Two habits run through all of them and are worth stating once here:

- **Assert on the outcome you wanted, not on the mechanism you happened to build.** A production
  deadlock, a dangling animation chain and an APC that sealed its passengers into the wreck all
  survived suites that were green — each asserted the money was spent, the table was consistent,
  the unloader returned everyone, and never that the thing *arrived*.
- **When a measurement surprises you, suspect the harness first.** A free harvester made a tank
  look like it cost -599 credits; a luminance probe read a frame that was never painted; a
  centroid check said "wrong" without being able to say by how much. Several of these were wrong
  before the code was.
