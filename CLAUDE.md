# CLAUDE.md

Guidance for Claude Code (claude.ai/code) working in this repository.

**RC Command** is a browser real-time strategy game, deployed via GitHub Pages from `main`.
It ships as one generated, fully self-contained `index.html` (~0.7 MB) — no network calls, no
assets on disk, no dependencies beyond a vendored three.js.

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
- `src/rts.buildings.js` — structure models, material palette, per-material geometry merger.
- `src/rts.audio.js` — all sound, synthesized at runtime with WebAudio. No sampled assets.
- `src/rts.core.js` — simulation: grid, A* pathfinding, combat, economy, enemy AI. Deliberately
  contains **no THREE.js**, so a whole battle can be stepped headlessly.
- `src/rts.render.js` — the scene. Reads the sim, never writes it.
- `src/rts.ui.js` — sidebar, radar, HUD overlay canvas, input, main loop.
- `src/index.skeleton.html` — page shell + title screen; `src/style.css`.
- `src/three.min.js` — vendored three.js **r128**. Note the age: no `CapsuleGeometry`, no
  `BufferGeometryUtils` in core, `outputEncoding`/`sRGBEncoding` rather than `outputColorSpace`.

## Presentation rules — these are load-bearing

- **Orthographic, near-top-down camera** (`RTS_CAM_TILT`, `_rtsApplyCam`). No perspective
  divergence; the battlefield reads as a map. `R.dist` is the world height visible on screen and
  the frustum derives from it; `_rtsClampFocus` keeps the view on the map via `_rtsViewSpan()`.
- **Pick colours dark.** Sun + hemi light multiply roughly 1.5× before ACES tone-mapping, so a
  mid grey renders near-white and a saturated team colour washes out to pastel. The palette in
  `_rtsPal()` is chosen to land correctly *after* the tone-map — an early pass rendered as a row
  of white blocks for exactly this reason. Faceted roofs need `flat: true`, or a 3-sided prism
  shades like a barrel.
- **Roofs carry the detail.** The camera looks down at ~45°, so vents, catwalks, skylights,
  markings and team panels on top are most of what the player actually sees.
- **Ore is flat gold patches on the ground**, not standing crystals, overlapping at full density
  so a rich field reads as continuous terrain.
- **Sidebar is icon tiles with a clock-wipe**, not a text list. Icons are 3/4 renders generated
  once by `_rtsMakeIcons` on a throwaway renderer that is disposed straight after.

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

For audio, do not trust "no errors" — tap an `AnalyserNode` on `_rtsA.master` and measure RMS.
A silent-but-not-throwing music bug shipped once precisely because nothing was logged.
