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
node test/run.js --failed        # only what failed last time
node test/run.js --quiet         # failures and totals, not every passing spec's numbers
node test/run.js --jobs=1        # one at a time
```

Specs run **three at a time** (one fewer than the cores, up to three), longest first by how long
each took last time - `test/.last-run.json`, written by every run and not committed. The full
suite was 93 minutes when it ran one spec after another; a `--jobs=3` flag was passed to it for
weeks and read by nothing. Each spec is its own process with its own browser and its own server
on port 0, so they cannot see each other. Failures are printed again under the totals. A spec
that asserts on milliseconds marks itself `@solo` in its opening comment and runs alone at the
end (`e2e/resolution`); anything else that fails only under load wants a wait on a condition, not a
longer delay. `--list` shows the order a run will use.

Each spec is a plain node file that builds a `Suite`, makes assertions, and hands it to
`lib/report.js`. There is no framework to register with and nothing to install — the repo has no
package manager, and this does not add one. Playwright and node live in `/opt/node22`.

## The two kinds

**`unit/`** — plain node. No browser, no game assets, milliseconds. These cover the parts that
are genuinely modular:

| spec | what it holds to account |
|---|---|
| `save` | the checksum, the version stamp, and the encoder that walks live game state into JSON |
| `rules` | invariants over the roster: no orphan unit kinds, every prerequisite and weapon resolves, every unit kind has a building that produces it, no faction needs something it cannot build |
| `brand` | the game is Breachwater and says nothing else: every string literal in `src/` (comments stripped), the page's title, heading and text, the manifest, `sw.js` and `favicon.svg`, and every unit, structure and superweapon name, are clean of the old game's name, armies and unit names; the armies are the Meridian Compact and the Basalt Dominion |
| `flaktrack` | the Flak Track's verb, escort, on the real simulation: a gunship kills a lone tank and is shot down when a Flak Track is beside it; the flak never aims at the ground; nothing shoots an aircraft without an anti-air gun however the target arrived (retaliation, an order, any other road) and a Rocket Squad acquires one unprompted; the opponent buys Flak Tracks against the sky only, in its real buy loop |
| `minelayer` | the Mine Layer's verb, denial: DEPLOY lays a mine where it stands, five to a load, not twice on a cell; a mine spares its own side and waits out its arming under an enemy; an enemy tank or squad crossing one is wrecked and an aircraft passes over; a side sees only its own mines; a Repair Bay restocks it. `e2e/minelayer` does it with the D key and a real click on DEPLOY, and reads the overlay |
| `bridgelayer` | the Bridge Layer's verb, the crossing: at the generated map's worst gap, DEPLOY turns it into a bridge like the generator's and the bank-to-bank walk becomes the width of the water; a tank drives over it and a ship sails under; it refuses dry land, a second deck and a pier along a shore, and spans the gap it faces. `e2e/bridgelayer`: the D key, and the 3D mesh built on the next frame over the water |
| `hovercraft` | the Hovercraft's verb, the beach: the `hover` domain cell by cell (open water and land, not a building, rock or a shipyard's water); at the map's worst gap its path goes straight over the water a tank drives 407 units round, and a slanting run is one leg; five men board on one bank and are put down on the other; killed afloat it sinks, ashore it burns; a torpedo cannot reach it |
| `tide` | the tide on a real map: high water at the start and low at half the period; the flats are open sea within reach of a shore, never a deck or a berth; the rings dry nearest-first and flood the other way, each all at once; a dry flat is ground to a tank and no water to a ship, and a hovercraft takes either; a strait no tank could cross at high water is a short drive at low; a tank caught by the flood makes it ashore hurt, a squad left in it is lost; the turn is announced; a deck laid over a flat is ground at every tide. `e2e/tide`: the 3D view and the radar show the sand at low water and the sea at high |
| `daily` | the daily battle's rules: the same date gives the same seed, army and difficulty, the next day another, from the UTC day; over a year both armies and spread maps; a victory beats a defeat, a faster victory a slower, a longer defeat a shorter, and only a better result replaces the day's record; the line it posts. `e2e/daily`: a real click opens today's battle whatever the player picked, the end card's line is what COPY RESULT copies, "Play again" replays the day, and quitting puts the player's own choices back |
| `aimines` | the opponent's Mine Layer: its field is on the land route between the yards, 9 to 18 cells out, all open ground; a full load goes down on the field and nowhere else; it reloads at the Repair Bay and goes back; no team composition has a layer in it; bought outside the roll, even with the army at its cap, out of surplus only, and never a second |
| `r3d` | the sprite baker's geometry half: the oblique projection (`x` unchanged, `z − K·y`, ground deliberately **not** foreshortened), the shape builders, yaw and scale as pure transforms that must not edit the model handed to them, and the colour ramp — which exists to keep a shadow coloured instead of letting it slide to grey, so the test is "does it stay saturated", not "does it get darker" |
| `audio` | sound's only failure mode is silence: every effect the game dispatches has a synthesized recipe, no retrigger gap points at an effect that is gone, the shell's music calls reach the score, and with no AudioContext every entry point declines quietly |
| `scenario` | the two tables read as scripts — team mission lists and triggers. Every mission, event, action, waypoint, quarry, team and unit name resolves; every argument is the kind its own table's `need` declares; every `loop` jumps inside its own script; and the two invariants the source states in prose hold — the autocreate split has both halves populated, and the shipped trigger list stays balance-neutral, which is what the ladder measurements assume |
| `crates` | the crate table: weights, and the caps — whose *direction* is the subtle part, since `rof` is clamped with `Math.max` because lower is faster, so a cap written above 1 turns a bonus into a penalty without failing. Plus the check this file exists for: every modifier a crate grants is read back somewhere, because one that is stored and never consulted still announces itself, plays its sound and does nothing |
| `sfx` | every rendered effect, measured without a sound card (`lib/sound.js`): every take finite, at its peak, at rest at its end; takes that differ but match in level; each effect as loud as its recipe says once A-weighted; a rifle a crack and a cannon heavier; the interface tone and the battle noise. `e2e/sfxmix` hears the same effects in the page - left and right by the pixel, the voice cap, the compressor and clip |
| `music` | the score, every bar of both songs at every intensity, asked what it would play: in key, the tune on its chords, notes inside their bars, the layers each intensity adds, the level's climb and slow fall, the sampler told of every sample; and the band rendered and in tune to 10 cents. `e2e/music` hears it follow cannon fire on the screen, change songs and fade out |
| `worldsound` | the bed's loops rendered and measured - seamless, wide, each the sound it says - and what turns them: tracks or wheels by the hull, a rotor only in the air, the hum of a power plant in earshot, birds only in clear daylight. `e2e/soundpanel` works the 🔊 panel with real clicks, keys and a touch, across a reload |
| `airspace` | aircraft keep their own distance and take turns on a pad, on the real simulation: a stack parts the same way every time, a swarm arrives apart, three on one pad land one at a time, two with two pads take one each; and an aircraft is built over its pad - a free one first - flies to the pad's rally point, and still arrives at the factory if every pad is bombed mid-build. `e2e/airpick` clicks and boxes helicopters where they are drawn |
| `chinook` | the transport helicopter's verb: five riflemen walk aboard, are flown to ground no squad can walk to and are all put down there; it is boarded from the sand while hovering off a beach; unarmed, it never flies home to reload nor crashes without a pad; it sets down when idle over open ground (not over water, and a gunship never does) and lifts when sent; a rotor, not a jet, in the sound bed. `e2e/chinook` does the same with a box-select and two right-clicks in 3D |
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
culled by winding, and `_r3FitSize` returns a square that no facing runs out of. `e2e/r3dsprites`
then puts the real shipped sprites through the same checks, and confirms a rebake is deterministic.

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

`e2e/navsea` and `e2e/navair` cover the two domains, because sea and air are the same feature twice:
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

`e2e/supers` covers the four superweapons, which had no spec at all — the worst possible shape
for a bug, since a button that does one thing every five minutes fails at the exact moment you
were counting on it and cannot be retried. Charging is measured as a **rate** over ten seconds
rather than by waiting out a 300-second charge, and the nuke is measured on **hit points**: the
first version of this counted survivors in the blast radius, saw the number not move, and learned
nothing, because everything in the game has more hit points than the edge of a nuke does damage.
Writing it found two defects — an engineer accepted onto a building the enemy had already started
selling (captured a structure that deconstructed anyway, and was spent doing it), and a
chronoshift with an empty selection that teleported eight units the player never chose.

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

None ship and none are read: every model, texture, sound and map is generated by the game's own
code, so what a spec sees is exactly what a player sees.

## Size

Source files are capped at 500 lines and `unit/layout` enforces it - and test files are too, now.
They used to be exempt, on the argument that a spec is one narrative and cutting it splits an
argument; `e2e/navair` was kept whole at 696 lines because every section "builds on the same live
battle". Very little of it did: split at the seam between the sea and the weapons, the one thing
the second half took from the first was the survey of the coastline, which is now
`lib/sea.js` and both halves run it; each opens its own match from the same seed and passes
alone. And a long spec costs more than reading: the runner can only run specs side by side, so
one long spec is a stretch of the run nothing can share.
Split at a seam, each half able to run alone; the question is still whether a file is one thing
or several, but past 500 lines it is almost always several.

## Adding one

Put it in `unit/` if it can run without a browser; that is almost always where a new test
belongs, and `sandbox.js` makes more of the game reachable from there than it first appears. Use
`e2e/` for anything needing layout, input or rendering. Name it `<thing>.test.js`, end it with
`require('../lib/report.js')(S)`, and print the numbers you measured even when it passes — a
passing test that shows its measurement is how the next reader checks it is measuring the right
thing at all.
