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
| `lcw` | format 80 both ways: one hand-built stream per op-code, so a broken branch is named instead of showing up as "the image looks odd" — including the overlapping back-reference, which is the single most common way a hand-written LCW decoder is subtly wrong. The compressor is checked by round trip, because how well it compressed is not the decoder's business |
| `mix` | the archive format everything else is read out of: the hash that serves as its only index (there are no names in the file), both header forms, that a read is a *view* and not a copy, and truncation — the trap where a file cut short still parses perfectly and then throws on the first read past the cut |
| `shp` | shapes and the 6-bit palettes that colour them. Two of the three frame formats are deltas, so the load-bearing assertion is asking for frame 1 *first*: a chain walked lazily and a chain assumed already-walked agree until you skip |
| `blowfish` | Eric Young's published ECB vectors, in **both** directions — an encryptor with its Feistel halves mirrored wrongly reproduces every published ciphertext and then cannot invert its own output, which is exactly how the first draft here was wrong |
| `oramap` | the `.oramap` path: a stored-entry zip, `map.bin` (whose column-major-to-row-major transpose is the whole point), `map.yaml` in both tab and space indentation, and the tile table they index into |
| `inimap` | RA's own `.MPR` scenarios, read and written. No real one is to hand, so a full 128×128 scenario is *built* — which needs an LCW encoder the game does not have — with the chunk header's format marker set non-zero on purpose, because a reader that masks with `0xFFFFFFFF` passes every test where it happens to be zero. The editor's save path is a round trip through the same reader that opens MAIN.MIX, because there is no second path for maps we made ourselves |
| `aud` | every sound and every music track. The property both codecs share and both can get wrong: the running sample carries *across* chunk boundaries — a decoder that resets per chunk produces audio of exactly the right length that clicks every 512 samples |
| `iso` | the ISO 9660 directory walker, against hand-built images containing the awkward cases: records past a sector's zero padding, self-referential entries, a raw 2352-byte rip, an extent pointing off the end |
| `save` | the checksum, the version stamp, and the encoder that walks live game state into JSON |
| `rules` | invariants over the roster: no orphan unit kinds, every prerequisite and weapon resolves, every unit kind has a building that produces it, no faction needs something it cannot build |
| `r3d` | the sprite baker's geometry half: the oblique projection (`x` unchanged, `z − K·y`, ground deliberately **not** foreshortened), the shape builders, yaw and scale as pure transforms that must not edit the model handed to them, and the colour ramp — which exists to keep a shadow coloured instead of letting it slide to grey, so the test is "does it stay saturated", not "does it get darker" |
| `audio` | the sound tables, whose only failure mode is silence: every EVA line, unit voice and death cry resolves in the identity table, every voice pool expands to takes that exist, every effect the game dispatches has something to play, and no retrigger gap or sampled mapping is left pointing at an effect that is gone |
| `scenario` | the two tables read as scripts — team mission lists and triggers. Every mission, event, action, waypoint, quarry, team and unit name resolves; every argument is the kind its own table's `need` declares; every `loop` jumps inside its own script; and the two invariants the source states in prose hold — the autocreate split has both halves populated, and the shipped trigger list stays balance-neutral, which is what the ladder measurements assume |
| `crates` | the crate table: weights, and the caps — whose *direction* is the subtle part, since `rof` is clamped with `Math.max` because lower is faster, so a cap written above 1 turns a bonus into a penalty without failing. Plus the check this file exists for: every modifier a crate grants is read back somewhere, because one that is stored and never consulted still announces itself, plays its sound and does nothing |
| `layout` | the source tree itself, whose two failure modes are both silent: a file in `src/` the skeleton does not include reads like live code and ships nothing, and an inline `<script>` in the skeleton is JavaScript that neither the syntax gate nor the duplicate-name check ever sees - 344 lines of the standalone shell sat in exactly that blind spot until it was lifted into `src/title.js`. Plus the 500-line cap that keeps each subsystem a directory of small files instead of drifting back into one large one |
| `sw` | the service worker's contract as stated in its own source — never calls `respondWith`, never touches the Cache API, keeps the fetch handler that makes the app installable — plus a manifest whose every URL is relative, because the app is deployed under a path. A universal claim no finite set of requests can establish, which is the one case where reading the source beats driving it |

`lib/sandbox.js` is what makes those possible. The game is browser globals concatenated
by `build.py` — there is nothing to `import` — so those files are evaluated in a `vm` context
with a shim thin enough that anything reaching for a real DOM **throws** instead of quietly
returning `undefined` and letting a test pass for the wrong reason.

`load()` takes **directories** as well as files: `load(['src/rules', 'src/core'])` pulls in every
part of those subsystems, in the order the skeleton includes them, read out of the skeleton
rather than listed in the spec. A hand-written list of twenty paths falls behind the first time
a file is added or split, and it does it quietly - the spec keeps passing on less than it used
to cover. `read()` does the same for the handful of assertions that are about what the source
*says* rather than what it does.

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

`e2e/swupdate` is the one spec that does not use the shared server. It runs its own, which counts
requests and whose **bytes can be changed while the browser is running** — the only honest way to
ask whether a new deploy reaches the player. It alters the deployed build stamp, reloads, and
checks which build the player gets; it also serves the app from `/command-conquer/` rather than the
origin root, because that is where it really lives, and at a root an absolute `/sw.js` and a
relative `sw.js` behave identically right up until production.

`e2e/scenario` writes its own scenarios rather than testing only what ships. Both of the game's
`and` triggers combine conditions that only become *more* true, so they would fire with or without
the latch, and nothing shipped uses `forceTrigger`, `destroyTrigger`, the mission timer, globals, or
an event that reads its argument's house rather than its owner's. `RTS_TRIGGERS` is a plain array, so
the spec pushes a trigger, drives it, and takes it away again — which is the only way to reach the
rules the shipped list never exercises.

`e2e/navair` covers the two domains together, because sea and air are the same feature twice:
units that move where nothing else can, held up entirely by restrictions. A ship that could drive
onto land, a torpedo that could climb a beach, a tank that could shoot down a plane — each of them
stops being a domain and becomes a strictly better land game. Every restriction is one `continue`
in a loop or one branch in a passability test, which is to say a line that can be deleted without
anything failing to run. Naval had no spec at all, and writing one found a ship that sailed onto
dry land and parked there.

`e2e/crates` opens each of the nine kinds and measures the **effect**, not the message. Every
crate announces itself the same way — a line of text, a sound, the crate gone — so a bonus that
was stored and never read, a reveal that lifted nobody's shroud and a free vehicle that failed to
spawn all look identical from outside. It checks the credits, the hit points, the shroud, the
entity list and the damage, and then that armour really divides incoming damage and an engine tune
really covers more ground.

`e2e/scoreboard` holds the two numbers the end screen prints to being true. "Enemy units
destroyed · Units lost" is the one readout with no way for a player to check it — nobody can count
what died off-screen — so a wrong number here is not a visible bug but a quiet lie that lasts the
whole match. It checks that a kill goes to whoever caused it, that nobody is credited for a death
nobody caused (a booby trap, the opponent's own artillery), and that a readout labelled *units*
counts units.

`e2e/determinism` asks the two questions everything else here assumes an answer to: does the same
seed play out the same way twice, and does resuming a save give back the battle that was saved?
Every measurement in the repo rests on the first — the ladder quotes mean survival to the second —
and nothing was checking it. Both are compared on a hash of the whole live state rather than a
summary that could agree while the games differ, and a **different** seed is hashed alongside, so
that if the comparison ever stops comparing anything the spec says so instead of passing.

Note the shape of `_DT.open`: it closes any battle already on screen first. `rtsOpen` returns
immediately when one is up, so without that close a second run is a no-op handing back the first
run's state — which is exactly how an assertion in `e2e/crates` came to compare a list to itself.

`e2e/audio` measures **sound**, not function calls. Headless Chromium runs WebAudio for real, so
a `ScriptProcessor` is tapped onto the master bus and the samples are read back: every effect the
game dispatches must produce signal, an off-screen shot must produce none, muting must silence
both the guns and the score, and the music sequencer must still be producing sound after a full
bar. Measurements wait for silence before starting — an explosion rings for most of a second, and
without that wait a shot that was correctly culled reads as loud because the tap heard the
previous one.

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

## Size

Source files are capped at 500 lines and `unit/layout` enforces it. Specs are not: a spec file is
a unit of *reporting* — one line in the run, one narrative — and cutting one in half to hit a
number splits an argument that was making sense. `decoders` was split because it was seven
unrelated formats sharing nothing but a file; `e2e/navair` stays at 568 because sea and air are
one argument made twice, and every section of it builds on the same live battle in the same
browser. The question to ask is whether the file is one thing or several, not how long it is.

## Adding one

Put it in `unit/` if it can run without a browser; that is almost always where a new test
belongs, and `sandbox.js` makes more of the game reachable from there than it first appears. Use
`e2e/` for anything needing layout, input or rendering. Name it `<thing>.test.js`, end it with
`require('../lib/report.js')(S)`, and print the numbers you measured even when it passes — a
passing test that shows its measurement is how the next reader checks it is measuring the right
thing at all.
