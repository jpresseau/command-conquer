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
  `units`, `ai`, `teams`, `missions`, `aisupers`, `ore`, `triggers`, `tick`, and `spatial` — the
  per-tick bucket index the target scan and the crush check run over instead of the whole entity
  list. It shortens a scan's candidate list and changes no candidate test, so the property that
  makes it safe is that the two agree; see `docs/core-combat.md` and `test/*/spatial`.
  The AI's base geometry is `basezone`: it may not place a building that walls off open ground
  (`_rtsSealsGround`), and its units walk out of the factory to a muster point it keeps clear
  (`_rtsAIMuster`) - and out of the harvest: a muster on the ore's edge cost the AI 8% of its
  income and most of its defences on some seeds. `test/*/basespace` holds all three.
  `escorts`: idle AI fighters march with whichever team is on the move. A difficulty's strength
  is the army's SIZE (`army` in `RTS_DIFF`), not the share that marches: shares and per-team caps
  either flooded the player or sent the army home again. Separate teams for the unlisted units
  made the AI weaker (see `unit/aiplan`); `e2e/armyuse` holds it.
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
- **In 3D a crystal is flat facets** (`r3d/crystal.js`, held by `unit/crystal`). Per-corner
  normals turned the field into smooth cones that read as stubble. The field is built in
  chunks (`render3d/ore3d.js`); to hide it in a spec, null `R3.ore`'s entries rather than the
  list, or its watch rebuilds them.
- **Nothing natural is a smooth cone.** Grass tufts are leaning blades (`r3d/tuft.js`) and a
  ridge's spires are `_r3Crystal`; a smooth cone read as a sapling on a lawn and as a traffic
  cone on a ridge. Slabs take a broken top (`peak` in `_r3dSlab`), not a flat quad.
- **The 3D ground is materials, not Red Alert's picture** (`render3d/terrain3d.js`): grass, dirt
  tracks, sand, rock, forest floor, concrete and cobbled PAVING round every building, computed
  per pixel in world space from a one-texel-per-cell ground map, height-blended at borders; ore
  is a soil in the ground, not a stain on it. The sea's coast is cut per pixel from a smooth mask
  with the same warp (`noise3d.js`). The baked ground, its grain and the EPX staircase redraw
  (`R3D_PIX_GLSL`) survive behind `RTS_GROUND_LEGACY`. `test/*/paving`, `e2e/terrainmat`.
  A bump is built on gradient noise (`_gnd`, slope worked out), never value noise, which lights
  as streaks. Every material is mixes of noise evaluated ONCE per pixel in `_groundAt`.
- **Explosions, fire, smoke, spray and rounds in flight are shaded, not sprites.**
  `render3d/fxemit3d.js` places the quads, `fxglsl3d.js` shades them, `fx3d.js` draws them.
  STATELESS: every quad is a function of its record's age and the game clock, and a fireball's
  billows roll on in the first loop of the small fire it chains into (same record, same seed).
  `_r3dFxOwns` is the one list of what 3D draws; `render/fx.js` asks it. `RTS_FX_SPRITES` is the
  before-picture; `R3.fxGroundAmt` takes the glare and rings out. `test/*/fxemit`, `e2e/fxshade`.
  Moving vehicles raise dust and ships lay wakes (`fxwake3d.js`), so the pass runs every frame.
- **The 3D frame is graded last** (`_grade`, `render3d/resolve3d.js`): warm highlights, cool
  shade, an S-curve, the far edge hazed. `RTS_POST_ON` takes it out with the bloom and
  `R3.gradeAmt = 0` alone; a spec about raw colour turns it off. `e2e/grade`.
- **What was built weathers** (`render3d/weather3d.js`): stains, rain streaks and grime at the
  foot, per pixel in the mesh program. `uWeather` is set per batch from `mesh.weather` (1 for a
  building, 0.5 for a unit) and reset to 0 after, so trees, rock and the sea never weather.
- **What burns lights what stands near it** (`render3d/fxlight3d.js`): the four strongest
  fireballs, pops, hits and fires are point lights in the mesh program (`uPL`/`uPC`), warm,
  falling off with distance and brightest on the faces toward them. `R3.plightAmt`. A spec that
  measures the light takes the effect's own quads out (stub `_r3dFxDraw`): a blast's smoke
  hides the wall it lights, and a light that never faded passed as cooled. `e2e/fxlight`.
- **Clouds pass over the map** (`render3d/cloud3d.js`): a term in `_shadowAt`, so the ground,
  the meshes and the sea darken under them alike. Laid out in the sun's frame and pinned to the
  world by the view's offset (`uCloud.xy`); they drift on the game clock. `R3.cloudAmt = 0`
  takes them out, and a spec comparing brightness across game time or a pan needs it. A mesh
  moves a few levels where the ground moves twenty: measure meshes against a take-away mask with
  the shadow map and AO off, not a difference map scaled for the ground. `test/*/clouds`.
- **Vehicles leave tread and tyre marks** (`render3d/tread3d.js`), the one effect with state:
  a ring of `R3D_TREAD_MAX` quads on the GPU, each stamped with the moment it was laid, faded by
  the shader, so a frame uploads only the new ones. Multiplied onto the ground straight after it
  is drawn. Marks are laid as frames are DRAWN, so a spec that drives units renders as the sim
  runs. `R3.treadAmt`. `test/*/treads`.
- **A hidden unit shows through what hides it** (`render3d/sil3d.js`): the units drawn again
  after everything with a surface, depth test GREATER, pulled `R3D_SIL_BIAS` toward the eye so a
  unit never shows through its own hull, flat in its house's colour. ONLY units with a building,
  tree, rock or rising ground just in front of them (`_r3dSilCover`): the whole army a third time
  took the entities past their budget (`e2e/instanced`). `R3.silAmt`, `R3.silAll`.
  `e2e/silhouette`.
- **The map moves a little on its own.** Surf rolls in to every shore (the sea's shader, `uSurf`,
  broken along its length at FIXED places, as over a bar), and the wind sways what is green in
  the world batch (`uSway`, set for the world loop and reset after it). `R3.surfAmt`,
  `R3.swayAmt`. To watch foam over time, hold the swell (`R3D_WAVE_AMP`) and the chop still and
  recover the foam's own mix: the water under it changes colour with the swell. `e2e/ambient`.
- **In 3D a selection is a ring on the ground** (`render3d/ring3d.js`), not Red Alert's corner
  brackets: a band round a unit, a rounded box round a building's footprint, drawn after the
  treads and before the entities so a unit stands in its ring. `ui/hud.js` skips the brackets
  while the 3D mode is on; 2D keeps them. `R3.selAmt`. `e2e/selring`. A check's expected
  number must be the test's own: reading `R3D_RING_UNIT` back let a ring drawn anywhere pass.
- **The harness's SwiftShader runs every branch of a shader.** A per-pixel `if` saves a GPU the
  untaken side and SwiftShader nothing, so eight per-kind material branches evaluated at four
  corners cost the harness their full sum: a frame went 1.1s -> 2.3s and real clicks and
  screenshots (`savebuttons`, `landscape`) timed out. Share the expensive work, don't branch it.
- **Unbind a render target's texture when a pass is done with it.** A program with a sampler on
  a unit still holding the depth or colour of the framebuffer it draws into is a feedback loop,
  and WebGL refuses the whole draw (INVALID_OPERATION): the material ground went black that way.
  `_r3dResolve` (`render3d/resolve3d.js`, the composite) takes its depth back off unit 3.
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
| `docs/core-units.md` | infantry behaviour and flags, missions and action cursors, what the data files really contain |
| `docs/core-transport.md` | the APC and the landing craft carrying cargo, submarine cloak, the flight layer and its reload |
| `docs/core-ai.md` | difficulty and IQ, the base blueprint, teams and their mission lists, committing an army |
| `docs/core-economy.md` | production charging, the two money pools and storage, ore fields, crates, what a building does while it stands |
| `docs/core-world.md` | shroud, start positions, triggers, saving a battle |
| `docs/roster.md` | the units and structures beyond the opening set, and the rule each was held to |
| `docs/ui.md` | selection, the sidebar, radar orders, and the 15 Hz animation cadence |
| `docs/art.md` | why the art read flat, read dark and read blue — and what the measurements said |
| `docs/artwork.md` | reading the player's own game files: MIX, SHP, palettes, terrain templates, and laying the cliffs and the shoreline |
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
