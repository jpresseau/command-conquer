---
name: visual-check
description: Look at the game headless - render a scene to a PNG and, for a change, an A/B pair with a pixel count. Use to verify anything visual (a model, an effect, a camera), to compare before and after, or to reproduce a screenshot a player sent.
---

# Look at it

A mesh count is not a picture. Anything visual is checked by rendering it and reading the image back
with the Read tool.

```bash
cd /home/user/command-conquer && python3 build.py
NODE_PATH=/opt/node22/lib/node_modules /opt/node22/bin/node .claude/skills/visual-check/shot.js \
  --out=$SCRATCH/heli --setup=$SCRATCH/setup.js [--ab=$SCRATCH/toggle.js] [--crop=x,y,w,h]
```

- `--setup` is JavaScript run in the page with `G` (the game), `R` (the camera) and `R3` (the 3D renderer)
  in scope. It is where a scene is staged, for example:
  ```js
  var yd = _rtsHas('player', 'yard'); R.focus.x = yd.x + 10; R.focus.z = yd.z + 10; _rtsApplyCam();
  for (var i = 0; i < 3; i++) _rtsSpawnUnit('player', 'heli', yd.x + 10 + i * 2, yd.z + 10);
  window.RTS_SKY_FORCE = 'night';            // day, dusk, night, rain, snow, fog, sand
  R.zi = RTS_ZOOMS.length - 2; _rtsApplyCam();   // zoom in
  _r3dCamSet(Math.PI / 2);                   // turn the 3D camera
  ```
- `--ab` is the change under test, run between two shots: a kill switch (`R3.lodOff = true`), a constant,
  a unit removed. It writes `_A.png` and `_B.png` and prints how many pixels differ.
- `--crop` zooms the comparison onto one thing. Then Read the PNGs: look, don't just count.
- The map is revealed unless `--fog`. The simulation is frozen, so A and B differ only by `--ab`.
- `--w --h --dpr` for a phone: `--w=390 --h=844 --dpr=3` (a big buffer on SwiftShader: crop it).

## What it is good for, from this repo's history

- **Level of detail:** full against plain models at a phone's zoom. A few hundred pixels differed and they
  were judged invisible; the buildings' curved roofs did show their facets, so buildings kept full detail.
- **A player's screenshot:** stage the same thing (a stack of helicopters, a sky, a zoom) and see it.
- **The UI over the map** (selection, effects sprites, the ghost) is on the overlay canvas `#rtsCv`,
  which this does not read: use `_rtsCompose()` in an e2e spec for the frame the player sees.

## Traps

- Never take a Playwright `page.screenshot` of the 3D view: it can hang on SwiftShader. This draws and
  reads back in the same task.
- SwiftShader is about two frames a second: a picture here is evidence, a frame time is not.
- Shadows, fog and weather follow the sky: force one (`RTS_SKY_FORCE`) or the seed picks it.
