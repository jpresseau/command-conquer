# Command & Conquer: Red Alert

A rebuild of Westwood's 1996 real-time strategy game for the browser. Mine ore with harvesters,
unload it at a refinery for credits, climb a power-and-prerequisite tech tree, and fight the
opposing army across a 112×112 tile battlefield. Play Allied or Soviet — the choice decides
what you can build.

Rules, unit costs, weapon damage and AI behaviour are ported from the Red Alert source release;
the game can also read your own installed copy for the original artwork, sound and maps.

> An unofficial fan project, not affiliated with or endorsed by Electronic Arts. *Command &
> Conquer* and *Red Alert* are EA's trademarks. **No game assets are distributed here** — the
> artwork, audio and maps are read at runtime from a copy of the game you already own, and
> nothing is uploaded anywhere.

**Play it: https://jpresseau.github.io/command-conquer/**

It runs in a browser with no install, no account and no network calls — the whole game is one
self-contained `index.html`.

## Controls

| Input | Action |
| --- | --- |
| Left-drag | Select your units |
| Left-click | Select one unit or building |
| Right-click | Context order — enemy: attack · ore: harvest · ground: move |
| `A` + right-click | Attack-move (engage anything on the way) |
| `WASD` / arrows | Pan the camera (screen edges work too) |
| Mouse wheel | Zoom |
| `Esc` | Leave the battle |

## How it plays

Build an **Ore Refinery** early — it ships with a free Harvester and it is the only thing that
turns ore into credits. Everything needs **power**, and a browned-out base builds slowly and its
turrets stop firing entirely. The tech tree is the classic shape:

```
Power Plant ──┬── Ore Refinery ─── War Factory ── vehicles + harvesters
              └── Barracks ──┬── infantry
                             └── Gun Turret
```

A second **War Factory** makes vehicles come out faster — still one queue, but it runs at 1.33×,
and a third and fourth take it to 1.67× and 2×. A second **Barracks** does the same for infantry.
That is Red Alert's own `BuildTimeSpeedReduction` curve (100, 75, 60, 50), and the enemy gets it
too.

The enemy is doing the same thing on the other side of the map, and its first attack wave is on a
timer. A player who does nothing is overrun in about four and a half minutes.

## Everything is generated in code

There are no art or audio assets in this repository, and none are downloaded at runtime:

- **Structures and units are pre-rendered 3D.** They are defined as 3D models and rasterised
  to sprites once at startup by a ~200-line renderer with its own scanline fill and depth
  buffer — the same approach the games of the era used, and the reason the results have real
  volume and flat shaded facets. Nothing renders in 3D at runtime; there is no WebGL context
  and no library. Unit facings come from rotating the model, not the canvas.
- **Everything else is drawn in code** at 24 pixels per map cell: terrain, four ore densities,
  explosions and muzzle flashes. Hard near-black outlines are traced from the alpha channel,
  so a building made of overlapping parts gets one clean line around the whole silhouette.
- **The battlefield is painted once** into a single 2688×2688 canvas from continuous noise, so
  dirt patches are organic blobs rather than per-cell tiles — and the ground costs one blit
  per frame.
- **Sidebar icons** are the sprites themselves on a dark plate.
- **All sound** is synthesized with WebAudio: weapons are shaped noise plus pitch-swept
  oscillators, and the music is a scheduled drum machine with a distorted bass riff and lead
  stabs. Not one sampled file.

## Building it

Python 3 and nothing else. There is no package manager, no bundler and no dependency install.

```sh
python3 build.py      # reassembles index.html from src/
```

Edit the files under `src/`, run the build, commit the regenerated `index.html`.

| File | What it owns |
| --- | --- |
| `src/rts.rules.js` | **Every balance number.** Retune the game here and nowhere else. |
| `src/rts.r3d.js` | The sprite baker: a small 3D rasteriser, run once at load |
| `src/rts.sprites.js` | Palette, terrain bake, ore, effects, and the 3D models |
| `src/rts.audio.js` | All sound and music |
| `src/rts.core.js` | Simulation: grid, A\* pathfinding, combat, economy, enemy AI. Renderer-free, so a battle can be stepped headlessly. |
| `src/rts.render.js` | Canvas 2D. Reads the sim, never writes it. |
| `src/rts.ui.js` | Sidebar, radar, HUD overlay, input, main loop |
| `src/index.skeleton.html` | Page shell and title screen |

`build.py` fails the build on three things worth keeping: a syntax error in any source, two files
defining the same top-level name (everything shares one global scope, so a duplicate silently
overwrites), and any external resource reference sneaking into the page.

## Testing

There is no test suite; verification is a headless browser. With Playwright installed:

```js
// serve the repo root, load /, then drive the real game:
await page.click('#rtsGo');
await page.evaluate(() => { for (let i = 0; i < 60 * 300; i++) _rtsTick(1 / 60); });
```

Because `rts.core.js` has no rendering in it, a full battle can be simulated far faster than real
time. Things worth re-checking after a balance change: a passive player should be overrun in a few
minutes, a player who masses forces should be able to destroy the enemy base, and forty units
ordered across the map should all arrive.

## Licence and attribution

Original work. This is **not** affiliated with, and contains no code, art or audio from, any
existing game. It's an original game in a genre, the way a platformer is not Mario.

There are no third-party libraries in this repository.
