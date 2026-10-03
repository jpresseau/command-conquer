---
name: balance
description: Measure command-conquer's game balance - the difficulty ladder (how long an idle player survives on easy, normal and hard, per side), A/B this tree against main or any git ref on the same seeds, and read the result without fooling yourself. Use before and after any change to the AI, economy, combat, units, rules or the map generator, or when the owner says the game is too easy or too hard.
---

# Balance

The ladder is the one number this project argues about: the mean seconds an idle player survives,
per difficulty, per side. It isolates the AI, because the player does nothing. What matters is its
**shape**: easy outlasts normal, normal outlasts hard, nobody survives forever, nobody dies
instantly. `e2e/ladder` holds that shape in bands; this skill is for measuring a change.

## A/B a change

```bash
cd /home/user/command-conquer
NODE_PATH=/opt/node22/lib/node_modules /opt/node22/bin/node .claude/skills/balance/ladder.js --ref=main
#   --seeds=5            seeds 9001.. (default 3)
#   --diffs=normal,hard  rungs (default easy,normal,hard)
#   --sides=soviet       which side the player is (default allied,soviet)
#   --cap=600            simulated seconds before a match counts as survived
```

- It builds this tree and a detached worktree of `--ref`, then runs both in browsers at the same
  time. `--ref=main` means `origin/main` when there is one. A clone's local `main` is stale, and
  measuring against it once showed a 25 s "change" this tree did not make. Run
  `git fetch origin main:refs/remotes/origin/main` first, and read the SHA it prints. A match takes about 5–10 s, so the default 18 matches finish in about 3 minutes.
- It prints each rung's mean and the per-seed times, the change, and `ORDER BROKEN` if a harder
  rung outlasts an easier one.
- It rebuilds `index.html` with a new stamp. Run `git checkout index.html` if you are not
  committing a build.
- Run it with `run_in_background` when it is long, and never beside the full test suite: both
  want the cores.

## Read it honestly

- **Same seed, same match.** All gameplay randomness runs through `_rtsRnd()` off the scenario
  seed, so a difference is your change, not noise. If a seed's time changes and you did not mean
  to touch the AI, something you changed reaches the simulation. Find out what.
- **Look at the seeds, not only the mean.** `normal` has been bimodal, with two clusters about
  70 s apart. The useful question is which cluster each seed lands in.
- **The idle player is blind to much of the game.** A change the idle player never provokes (a
  rebuild path, a crate, aircraft, the player's own units) leaves the ladder flat. That is not
  evidence that it is balanced; it needs its own harness, for example a unit test that stages
  the fight (`unit/airspace` and `unit/aitactics` are examples).
- A wide spread between seeds means something is under-committed, such as an attack that
  sometimes never launches. It is not inherent variance.
- Any figure measured before a map-generator change is history, not a baseline. Measure both sides
  of an A/B now.

## Where balance lives

- `src/rules/` holds units, structures and weapons: costs, hit points, speeds, ranges, `needs`.
- `RTS_AI.mix` (`{key, at, w}` per production line) and `RTS_AI.buildOrder` set what the opponent
  builds.
- The economy: ore growth and harvester rates (see `docs/core-economy.md`).
- `docs/measuring.md` has the history and the runs that were wrong. Read it before quoting a
  number. `docs/roster.md` says why each unit exists: every unit is a verb, not a bigger number.

## Report

Give the table for before and after, per side, with the per-seed times for any rung that moved,
and one sentence on why it moved. If `e2e/ladder`'s bands no longer hold, a deliberate retune
moves the bands in the same commit and says so. Never widen a band silently.
