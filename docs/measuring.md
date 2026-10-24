# Measuring balance

The ladder is the only number this project argues about, and it has been wrong more than
once for reasons that had nothing to do with the game. Read this before quoting it.

> Reference, split out of `CLAUDE.md`. The rules that must be followed before touching
> anything are still in `CLAUDE.md`; this is the working behind them.

## The ladder's history, and the runs that were wrong

*(This section was written when the generator was still unseeded. It is kept whole because
the reasoning is what matters; the fix is described part-way down. The live rule is in
CLAUDE.md under **Tests**.)*

**The difficulty ladder is far noisier than it looks, and this invalidates any A/B run on a
handful of seeds.** The simulation calls bare `Math.random()` for attack-wave intervals and
team-type selection, so no run is reproducible. Running the *identical build* twice:

    run 1   easy=315s  normal=227s  hard=190s
    run 2   easy=502s  normal=251s  hard=187s

Seed 9001 on easy fell at 318s in one run and never fell at all (>600s) in the next. `hard` is
comparatively stable (190 vs 187); `easy` is close to useless as a single-run signal, because
an easy opponent's outcome hinges on a couple of coin flips early.

**So do not compare two builds by running the ladder on each.** Pin the generator first:

```js
let s = 0xC0FFEE; Math.random = () => { s = (s*1664525 + 1013904223)>>>0; return s/4294967296; };
```

With that in place a seed replays exactly, and an A/B becomes a comparison rather than an
estimate — the trigger layer was shown inert this way, producing byte-identical fall times,
unit counts, credits and kill/loss tallies with the trigger table populated and emptied.

**This is now fixed in the game itself, and pinning is no longer required.** All gameplay
randomness runs through `_rtsRnd()`, seeded off the scenario seed, so a seed replays exactly:
same fall time to the centisecond, same unit counts, same credits, same kill and loss tallies.
Three independent streams off the one seed keep the subsystems from shifting each other — the
map generator (raw seed), ore growth (`^0x5eed`) and gameplay (`^0x9e3779b9`). Interleaving a
different seed between two runs of the same seed does not disturb it.

Reproducible five-seed baseline, mean seconds an idle player survives:

    easy=304s  normal=264s  hard=187s

`normal` is **bimodal** — 293/225/289/222/293 — two clusters roughly 70s apart rather than a
spread around a mean. Quoting its mean hides that; the useful question about a change on
normal is which cluster each seed lands in, not what the average did.

Earlier balance figures in this file that were taken from single unpinned runs — notably the
easy-difficulty numbers in the TEAM.CPP and TEAMTYPE.CPP sections — predate this and should
be read as indicative only.

**Seeding also exposes flaky assertions.** `_rtsCanRetaliate` on a non-idle unit applies
TECHNO.CPP's "the original only bothers half the time" coin flip, so a single call is a coin
flip and asserting on it means nothing. The mission harness had exactly that assertion and had
been passing on luck; it now samples 400 calls and checks the proportion. If a harness
assertion starts failing after a change to the random stream, ask whether it was ever really
testing anything.

## The coastline re-measurement

Every number quoted above and in the other reference documents was measured on a map whose only
water was a single lake at a hardcoded `(88,88)`. That lake is gone: water is now a channel
placed relative to the two starts, so both bases have a shore. Terrain feeds everything —
pathing, ore, where the AI can build — so the whole ladder moved, and the old figures are
history rather than a baseline to compare against.

| | easy | normal | hard |
|---|---|---|---|
| allied, before | 320s | 230s | 197s |
| allied, after | **294s** | **215s** | **169s** |
| soviet, before | 309s | 228s | 187s |
| soviet, after | **292s** | **216s** | **172s** |

Uniformly shorter — an idle player now survives 5-14% less long. The ordering and the spacing
between the rungs both hold, which is what the ladder is for. Two causes, and neither is the
opponent getting cleverer: the map carries about 8% less ore (the channel's spine clears what it
runs over, and anything the water strands is swept rather than bridged), and a base with water
on one flank has one fewer approach to defend.

## Self-play (`tools/selfplay.js`)

The computer against itself (`core/seats.js`), headless through `loadFast`: every seed twice with the
armies swapped between seats, both at the same difficulty, crates off, clear day, 1/60 s ticks, 12
minutes. Three workers run 80 battles in about an hour. A ledger kept beside the game (it draws no
random number and writes no saved field) values damage at the victim's price per hit point, so every
shot that landed counts. A splash and a bomb's blast count for whoever set them off, and a Marshal's
air strike for him; before batch 12c they counted for nobody, which understated every unit with
splash and showed the Marshal dealing almost nothing. `--set=file.js` applies rule changes in the game's context before each battle,
so a change is measured paired against the same seeds.

Almost no battle ends inside 12 minutes (77 of 80), so the outcome is each army's SHARE of everything
standing at the horizon - units and buildings at price, plus money. Per-seed standard deviation is
about 0.19, so 80 battles resolve about 0.02 on the mean and a paired change about 0.01-0.02.

First findings, normal against normal (40 seeds, 80 battles):

- **The Compact led, 0.565 of the field** (0.539 from the player's seat, 0.591 from the opponent's).
  Both armies spent the same 5.2 million credits; the Compact dealt 32% more damage and took 18% less.
- **Price is invisible to the computer.** Its purchases are weighted rolls (`RTS_AI.mix`), so a Wasp at
  1500 instead of 1200 changed nothing (+0.007 ± 0.008), and neither did weaker Wasp and Artillery
  weapons (+0.003 ± 0.011). Taking the Wasp away entirely moved it (-0.028 ± 0.012). Self-play prices
  the AI's choices; a price aimed at human players needs its own trial.
- **What the Dominion bought was the gap.** It rolled buggies (0.24 damage per credit) where its
  Bulwark waited for 2,600 in the bank, and the Bulwark itself returned 0.52. Buggies at half weight,
  the Bulwark from 1,900 and its cannon 62 -> 75 measured **0.528** (-0.037 ± 0.021) - and were NOT
  shipped: halving buggies broke `e2e/armyuse` (buggies are what the escorts send to the fight, and an
  easy Dominion then left 35% of its army idle), and the stronger cannon put `e2e/pace`'s heavy-battle
  frame over its upload budget. A fix has to keep both, so the Dominion's mix wants a unit to take the
  buggy's place in the escort, not fewer buggies.
- Submarines took 190k credits for almost no damage: the one lagoon rarely has a ship to hunt.

Second round, paired against a fresh baseline (20 seeds, 40 battles each; the Compact held 0.572):

- **Re-weighting what the Dominion buys does not close the gap.** None of these moved the Compact's
  share by more than about one standard error:
  - Bulwark at weight 5 from 2,000 instead of 3 from 2,600: -0.015 ± 0.014. It bought 191 Bulwarks
    instead of 64, and their return fell from 0.65 to 0.55 damage per credit.
  - That, plus submarines bought only against hostile hulls (a `vsSea` gate shaped like `vsAir`):
    -0.010 ± 0.014.
  - That, plus Longshot weight 4 and dogs at half weight: 0.000 ± 0.027.
- **The `vsSea` gate barely bites.** Subs fell from 95 to 76, because the Compact usually has a
  gunboat afloat, and they return 0.02-0.04 damage per credit even with a target. It would also stop
  the Wolfpack (two subs and a missile sub) forming on empty water. It was not shipped.
- **So the Compact's edge is in how its units fight, not in what the Dominion buys.** Its Artillery
  returns 1.47 damage per credit and its Wasp 1.32; the Dominion's best are the MiG at 1.14 and the
  rifle at 0.97, and the same Battle Tank returns 0.95 for the Compact and 0.73 for the Dominion.
- **Unit strength does not move it either, and that says more about the instrument than the units.**
  Compact Artillery at 44 damage and 3.5 splash (from 52 and 5) with the Wasp at 45 (from 55):
  -0.002 ± 0.017, though the Artillery's return fell from 1.47 to 0.91. Longshot reload 3.2 s and
  splash 4 (from 4.2 and 3) with the Bulwark at 1000 hp: -0.002 ± 0.015, though the Longshot rose
  from 0.76 to 0.92.
- **The 12-minute share is decided by the map and the seat, not the army.** In seed 9003 whichever
  army holds the opponent's seat ends with about 80% of the field; the swap cancels that, which is
  why the per-seed spread is so wide. What is left of the Compact's mean comes mostly from the
  battles that turn into a rout: its two outright wins ended at 0.99 and 0.97, and the median share
  is 0.545. Eight battles split into parts ended level (52k of assets against 50k), with the same
  income and spending on both sides.
- **So self-play at this horizon cannot resolve a unit change.** To measure one, use the win rate
  over battles played to the end, or a seat-fair map, and many more battles; the ledger's damage
  per credit is the fast signal, but it does not carry through to who is ahead at 12 minutes.

### The seat-fair map (`--fair`, core/mirror.js)

`--fair` plays every battle on the MIRRORED map: the player's half reflected across the line between
the bases, and the opponent's base laid as the reflection of the player's. Same 20 seeds:

| | random map | mirrored map |
|---|---|---|
| Compact's mean share | 0.572 ± 0.016 | **0.522 ± 0.030** |
| gap between a seed's two seat-swapped battles | 0.314 | 0.186 |
| spread of one battle (sd) | 0.201 | 0.186 |

- **On fair ground the Compact's lead is within noise of even.** Most of the 0.57 was how each army
  suited an uneven map, which the seat swap does not cancel.
- **The seat matters 40% less.** What is left is the seat order (the player's seat ticks first)
  amplified by a battle that snowballs.
- **It does not make a measurement cheaper.** One battle is still that chaotic, and with the seat lean
  gone there is nothing for the swap to cancel, so the error of the mean is set by the battle count:
  about ±0.03 at 40 battles, ±0.01 at several hundred. Use `--fair` for a balance trial, and plan the
  battle count for the effect being looked for.


## A failed path was asked again every tick

Profiled headless with the computer on every seat: in an ordinary 1v1, 61% of a tick was the
pathfinder, and 5 ms of every tick was two units chasing a yard walled in by its own base; in a
four-seat battle on the large map one harvester that could not reach its refinery cost 16 ms of
every tick. The cause was one pattern in three places (`!e.path` re-planning at once, so a FAILED
plan was re-asked on the next tick, and a failed A* searches the whole map). A failed plan now
waits out its timer, and a harvester that cannot reach the ore writes off every tile it cannot
reach after one flood. A tick of the default 1v1 went from 8.0 ms to 2.9 ms, a 2 V 2 on the large
map is 5.7 ms; `unit/pathfail` holds it and `unit/fingerprint` is unchanged.
