# Tests

```
NODE_PATH=/opt/node22/lib/node_modules /opt/node22/bin/node test/run.js
```

That rebuilds `index.html` and runs everything. Narrow it down with `unit`, `e2e`, or any
substring of a spec name:

```
node test/run.js unit            # fast, no browser
node test/run.js save touch      # anything matching either word
node test/run.js --list          # what is there
node test/run.js --no-build      # skip the rebuild (only if you just built)
```

Each spec is a plain node file that builds a `Suite`, makes assertions, and hands it to
`lib/report.js`. There is no framework to register with and nothing to install — the repo has no
package manager, and this does not add one. Playwright and node live in `/opt/node22`.

## The two kinds

**`unit/`** — plain node. No browser, no game assets, milliseconds. These cover the parts that
are genuinely modular:

| spec | what it holds to account |
|---|---|
| `decoders` | LCW, MIX, SHP, Blowfish, ZIP, the map and INI readers, AUD — all against streams and archives built in the test, so a failure is about the code and not about someone's disc |
| `iso` | the ISO 9660 directory walker, against hand-built images containing the awkward cases: records past a sector's zero padding, self-referential entries, a raw 2352-byte rip, an extent pointing off the end |
| `save` | the checksum, the version stamp, and the encoder that walks live game state into JSON |
| `rules` | invariants over the roster: no orphan unit kinds, every prerequisite and weapon resolves, every unit kind has a building that produces it, no faction needs something it cannot build |
| `r3d` | the sprite baker's geometry half: the oblique projection (`x` unchanged, `z − K·y`, ground deliberately **not** foreshortened), the shape builders, yaw and scale as pure transforms that must not edit the model handed to them, and the colour ramp — which exists to keep a shadow coloured instead of letting it slide to grey, so the test is "does it stay saturated", not "does it get darker" |

`lib/sandbox.js` is what makes those possible. The game is browser globals concatenated
by `build.py` — there is nothing to `import` — so those files are evaluated in a `vm` context
with a shim thin enough that anything reaching for a real DOM **throws** instead of quietly
returning `undefined` and letting a test pass for the wrong reason.

**`e2e/`** — Playwright against the **built** `index.html`. The build reassembles ~30 source
files into one page, so a spec that read `src/` would prove nothing about the artifact a player
loads. `run.js` rebuilds first, always: a spec measuring a stale page is worse than no spec,
because it reports confidently on code that is not there any more.

`e2e/r3d` is the other half of the sprite baker — the part that needs a canvas. It holds the
renderer to the claims its own source makes: a 3×3 structure covers exactly 72×72 art pixels,
alpha is 1-bit so the silhouette never feathers, visibility is a depth buffer and not a
painter's algorithm (so shuffling the faces must give a byte-identical picture), backfaces are
culled by winding, and `_r3FitSize` returns a square that no facing runs out of. It then puts
the real shipped sprites through the same checks, and confirms a rebake is deterministic.

## What these specs will not do

**Assert that a handler was called.** Every one of them asserts on an outcome — where the camera
ended up, what is on disk, which element takes a tap, how many credits changed hands. A test that
watches for a function call passes when the function does the wrong thing.

**Trust a synthetic event.** Touch goes through Playwright's real touchscreen (CDP
`Input.dispatchTouchEvent`) and keys through real `page.keyboard`. A hand-built `TouchEvent`
tests our listeners against our own idea of what a browser sends, which is exactly the
assumption worth checking.

**Pass vacuously.** Several bugs here were originally missed by a harness that could not have
observed them: a check that a build tile was "inside the grid" said nothing about the next row
being drawn on top of it, and a test that an MCV survives a keypress proves nothing if the MCV
was parked somewhere it could never have deployed anyway. Where a spec needs a precondition to
be genuinely reachable, it establishes it and asserts that it did.

## No game assets

None ship in this repo, by design — artwork, audio and maps are read at runtime from the
player's own copy. So `_rtsArtReady()` is false in every spec and the procedural fallback
renders. That is also exactly what a first-time player sees, so it is the primary path, not a
degraded one. Specs that need the artwork path stub `_mixShp` and `_rtsArtReady` themselves —
`e2e/atmosphere` does this with a synthetic sprite that records which frames get asked for,
which tests the frame table without claiming anything about how the frames look.

## Adding one

Put it in `unit/` if it can run without a browser; that is almost always where a new test
belongs, and `sandbox.js` makes more of the game reachable from there than it first appears. Use
`e2e/` for anything needing layout, input or rendering. Name it `<thing>.test.js`, end it with
`require('../lib/report.js')(S)`, and print the numbers you measured even when it passes — a
passing test that shows its measurement is how the next reader checks it is measuring the right
thing at all.
