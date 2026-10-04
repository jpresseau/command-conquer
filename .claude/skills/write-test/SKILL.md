---
name: write-test
description: Write a new command-conquer test spec the way this repo does it - choose unit or e2e, start from the template, assert outcomes with real input, prove the precondition, wait on conditions, mark timing specs @solo, and register the spec in test/README.md. Use whenever a change or bug fix needs a test, which is every change.
---

# Write a test

Every change gets a test, and a fix ships with the test that would have caught the bug. Watch it go
red against the old code before you believe it (the `mutation-test` skill does that by number).

## Unit or e2e?

- **unit** (`test/unit/<name>.test.js`) is the default. It is plain node, takes milliseconds and
  needs no browser. `load([...])` from `test/lib/sandbox.js` evaluates source in a `vm`, either whole
  directories (`'src/core'`) or single files. Its `document` **throws**, so a unit test cannot pass
  by exercising a stub. The simulation runs here: `_rtsNewGame(seed, 'easy')`, then `_rtsTick(1/30)`.
- **e2e** (`test/e2e/<name>.test.js`) is only for layout, input, rendering or the page's audio. It
  reads the **built** `index.html`, so build first.

## Templates

```js
/* WHAT THIS HOLDS TO ACCOUNT (src/<file>), in the words a player would use:

     THE FIRST CLAIM   what is true, and how it is measured
     THE SECOND        ... */

var { Suite } = require('../lib/assert.js');
var { load } = require('../lib/sandbox.js');

var S = new Suite('<name>');
var g = load(['src/rules', 'src/core']);
g._rtsNewGame(4242, 'easy');
var G = g.window._rtsG;
G.over = null;
/* ...set up, then assert the population first: the case really exists... */
S.ok('<a sentence that is true when it passes>', cond, '<the numbers behind it>');
require('../lib/report.js')(S);
```

```js
var { chromium } = require('playwright');
var { Suite } = require('../lib/assert.js');
var { openPage } = require('../lib/game.js');

var S = new Suite('<name>');
(async function () {
  var browser = await chromium.launch();
  var g = await openPage(browser, { width: 1100, height: 760 });   // or { device: { viewport, deviceScaleFactor } }
  await g.start(7, 1);                 // seed, seconds simulated; { freeze: true } stops the loop
  var p = g.page;
  /* real input: p.mouse, p.keyboard, (await g.touch()).start/move/end */
  S.ok('no page errors', !g.errors.length, g.errors.join(' | ') || 'none');
  await g.close();
  await browser.close();
  require('../lib/report.js')(S);
})().catch(function (e) { console.error(e); process.exit(1); });
```

`Suite` has `ok(what, cond, detail)`, `eq(what, got, want)`, `near(what, got, want, tol)`,
`throws(what, fn, re)`, `bytes` and `note(line)`. A note is a number for the reader and is not
asserted. Good examples to copy: `unit/airspace` (the simulation, determinism, a queue),
`e2e/airpick` (mouse on the 3D camera) and `e2e/soundpanel` (keys, a reload, a phone touch, reachability
by `elementFromPoint`).

## The rules that keep a test honest

- **Assert outcomes**: where the camera ended up, which unit is selected, how many credits moved,
  what is in localStorage. Never assert that a handler was called.
- **Use real input**: `page.mouse`, `page.keyboard`, and `g.touch()` (CDP). Never dispatch a
  hand-built event.
- **Prove the precondition, and the population**: assert that the case exists before asserting about
  it. In airpick's box test, the box has to stop short of the ground point or it proves nothing, so
  it asserts `boxReach`.
- **Check reachability**: a control is reachable if `document.elementFromPoint` at its centre is the
  control or inside it. Being in the DOM or on screen is not enough.
- **Wait on a condition** (`waitForFunction`), never a fixed sleep, with a timeout that falls through
  to the assertion. A spec that measures milliseconds puts `@solo` in its opening comment.
- **Pin the seed**. All gameplay randomness comes from the scenario seed, so an A/B is a comparison.
- **"No errors" is not verification.** Measure the output: pixels (the `visual-check` skill),
  audio RMS (the `sound-lab` skill), or the state.
- **Never screenshot the 3D view.** Render and read its pixels in the same `evaluate`.
- In e2e, top-level `let`/`const` in the game are not on `window`, but `var` and functions are.
  Inside `evaluate`, `_rtsR`, `_rtsA` and `_rtsG` are reachable by name.

## Register it

1. Add a row to the right table in `test/README.md` (`| \`name\` | what it holds to account |`).
2. Keep the spec at 500 lines or fewer, because `unit/layout` caps test files too. Split by claim
   into two specs if needed.
3. Run it, alone and then beside its neighbours:

```bash
python3 build.py      # e2e only
NODE_PATH=/opt/node22/lib/node_modules /opt/node22/bin/node test/run.js --no-build <name>
NODE_PATH=/opt/node22/lib/node_modules /opt/node22/bin/node test/run.js --no-build --quiet --jobs=3 e2e <name> airforce basespace
```

4. Mutation-test it (the `mutation-test` skill). Each claim needs a mutant that turns it, and only
   it, red.
