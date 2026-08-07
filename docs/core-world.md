# The world — shroud, start positions, triggers and saves

The map as the players see it and the scenario layer on top of it. Implemented in
`src/core/supers.js` (shroud), `src/core/terrain.js`, `src/core/triggers.js` and
`src/rts.save.js`.

> Reference, split out of `CLAUDE.md`. The rules that must be followed before touching
> anything are still in `CLAUDE.md`; this is the working behind them.

## Shroud — from MAP.CPP

`Sight_From()` is the whole feature, and the part that matters is that a cell carries **two**
flags, not one:

- **`IsMapped`** — explored. Once lifted it stays lifted.
- **`IsVisible`** — inside something's sight range *right now*.

So the map has three states: black where you have never been, dimmed where you have been but
are not looking, and clear where you are. All three are verified by sampling actual pixels —
`clear` ≈ (64,80,48), `explored` ≈ (27,36,20), `shrouded` = (4,6,9).

- An enemy **unit** vanishes the moment it leaves your sight. An enemy **building** you have
  already scouted stays drawn, because it is part of what you know about the ground rather
  than something that moves. Same rule governs the radar, and clicking: you cannot select
  what you cannot see.
- `RadiusOffset[]` is a flat list of cell offsets **ordered by ring**, with `RadiusCount[r]`
  giving how many entries cover radius r. Sight_From walks the first `RadiusCount[range]`
  entries *and then filters by true distance*, which is what makes the revealed area an exact
  circle — the table is a superset. Reproducing that gives exactly the original's reveal: 5
  cells at range 1, 13 at range 2, 113 at range 6. The ring ordering is also what makes the
  original's incremental scan possible (a unit that moved one cell only refreshes its outer
  rings); here the whole `vis` layer is rebuilt on the 15 Hz clock instead, which is cheaper
  than it sounds and much simpler.
- The shroud is baked into a **112×112 canvas, one pixel per cell**, and blown up with
  smoothing off: the layer costs one `drawImage`, and the edges stay hard and cell-aligned
  the way the original's shroud tiles do.
- **The AI is not fogged**, exactly as the original's computer opponent is not.

`Map::Logic()` also amortises **ore growth**: each frame scans
`MAP_CELL_TOTAL / (GrowthRate * TICKS_PER_MINUTE)` cells from a rolling cursor and collects
candidates by reservoir sampling, so no frame ever pays for a full-map pass (worst-case tick
measured at 0.1 ms, flat). Watch the translation: `Random_Pick(lo, hi)` is **inclusive at both
ends**, so with Excess 0 and Count 0 the original's test is `0 <= 0` — true, and the first
candidate always enters the list. Writing it as `rnd() * (excess+1) <= count` makes that test
never true, the list stays empty forever, and ore silently never grows again. Nothing throws.

## Start positions — from SCENARIO.CPP

`Create_Units` picks the first house's start **at random** from the waypoint list, then gives
every later house the waypoint with the highest **sum of distances** to all already-taken
starts. For two houses that means: roll the axis, then take the far end of it. RA's candidates
are authored per scenario; this map is generated, so they are a ring of eight positions inset
from the edge, and the roll chooses which diagonal the match is fought along.

**Everything else is derived from the two starts**, which is what makes the whole map change
rather than just the base coordinates:

- Ore is expressed relative to the starts — a home field beside each base, matched pairs out
  along the line between them, the big contested field at the midpoint, and the gems
  straddling it. Mirroring about the midpoint keeps it fair whichever axis came up.
- Roads run start-to-start with a flank branch each, so the connectivity guarantee still
  holds. The ore flood fill seeds from the player's start rather than a fixed cell.
- Base layouts are written in a **local frame** — `along` toward the opponent, `across` to the
  side — so one table produces a sensible arrangement on any axis.
- `_rtsScanPlace` is `Scan_Place_Object`: walk outward through distances, try all eight
  facings at each, then repeat the ring with a random scatter "so our units aren't all aligned
  along spokes". It fills in whenever a slot is blocked.
- The camera opens on the player's own yard. It used to open on a fixed corner, which was
  fine only while the start was fixed too.

**Two bugs this shipped with, both caught by measuring 24 maps rather than looking at one:**

1. **All 24 seeds rolled the same start.** `_rtsRngMake` was a bare xorshift, and a bare
   xorshift seeded with a small integer returns a tiny *first* value — seed 1 gives about
   0.00006 — so `(rnd() * 8) | 0` was 0 for every low seed. The generator now scrambles the
   seed and warms up eight rounds before handing the stream out. Any `(rnd()*n)|0` taken off a
   fresh stream is suspect; check it.
2. **One seed in 24 produced a completely disconnected map** — a player base with no route to
   the enemy or to any ore at all. Terrain is generated *before* bases are placed, so a start
   could land in a lake, the base would be scan-placed up to 32 rings away, and the roads
   would still meet at the original point. Terrain generation now clears a build area at each
   start before carving roads.

Harness (`starts.js`) asserts over 24 seeds: every base complete, the enemy always reachable,
**all ore always reachable**, separation 79–83 tiles and 901–941 ore cells so no seed is a
lopsided draw. Seven distinct layouts appeared in 24 rolls, of eight possible.

Ladder after: easy=306s normal=220s hard=176s (from 304/264/187). The headline is not that
the opponent got stronger — it is that **normal is no longer bimodal**. It was 293/225/289/
222/293, two clusters 70s apart; it is now 221/229/215/214/223. That split was an artifact of
one fixed map layout, not a property of the difficulty.

## Triggers — from TRIGGER.CPP + TEVENT.CPP + TACTION.CPP

The three files only make sense together: TRIGGER.CPP is the machinery, TEVENT.CPP the
conditions, TACTION.CPP the effects. Implemented in full: three persistence modes (`volatile`
fires once and deletes itself, `semi` fires when the last attachment is gone, `persistent`
resets and repeats), four event-combination modes (`only` / `and` / `or` / `linked`),
`Find_Or_Make`'s one-live-instance-per-type, forcing, and trigger-to-trigger chaining.

**Three things that are easy to get wrong and only visible in the source:**

- **`TDEventClass::IsTripped` is a latch, and only some events set it.** A NOTIFY event
  (`attacked`, `destroyed`, `discovered`) trips on the single frame it is reported and stays
  true forever after. A TIME event does *not* — it returns on the early ambient path, and its
  latch is the timer sitting at zero. Either way `and` spans time, which is the whole point:
  event 1 can trip minutes before event 2. Without the latch, `and` would only ever fire if
  both events happened on the same frame.
- **There are two different houses.** TEVENT.CPP does two separate lookups: the trigger's
  OWNER for credits / just-built / loss counts / factories, and the event's ARGUMENT house for
  low-power, discovery and the whole `*_DESTROYED` family. Conflating them aims "all units
  destroyed" at the wrong side. Modelled here as `who: 'owner' | 'arg'` in `RTS_TEVENTS`.
- **The action's return value is load-bearing.** TRIGGER.CPP deletes or resets a trigger only
  `if (ok)` — the OR of its actions' return values. An action that reports failure leaves the
  trigger armed to retry. That is why `Do_Reinforcements` with nowhere to place a team isn't
  silently dropped, and `_rtsTeamReinforce` preserves it.

`forced` short-circuits everything: a forced event trips unconditionally and a forced spring
bypasses `EventControl` entirely, so a chained trigger does not re-check its own conditions.

**The scenario is MINE; the engine is the port.** RA's triggers come from hand-authored
campaign INIs and there is no author for a generated skirmish map. `RTS_TRIGGERS` therefore
ships four informational beats and is asserted by harness to use only `text`/`playSound`.
`TACTION_AUTOCREATE` is now available as the proper source of the alert flag that TEAMTYPE's
split reads, but the shipped alert was deliberately NOT rewired onto it — that would re-open a
balance question that was already measured and closed.

`RTS_MESSAGE_DELAY` is also mine, and forced by a difference between the games: RA posts to a
message *list* where each entry has its own lifetime, so repeats merely stack. This game has
one message slot, so a `persistent` trigger whose condition stays true starved the channel —
measured at 600 posts in 10 seconds, with an unrelated message not surviving a single frame.
The text action now refuses to repeat inside the window, and refuses by *returning false*, so
the `if (ok)` gate leaves the trigger armed rather than counting a firing that did nothing.

## Saving a battle — from SAVELOAD.CPP

`src/rts.save.js`. Three ideas from the original, and they are the whole design.

**`Code_All_Pointers` / `Decode_All_Pointers` is the one that matters.** A pointer means nothing
in a file, so RA turns every pointer into a TARGET (type + index) before writing and back into a
pointer after reading. The JavaScript problem is identical in kind: `e.target`, `u.ref`, a team's
`members`, `G.sel` and a shell's `from` are object references, and JSON cannot express "the same
object as over there" — encode them naively and you get either a cycle it refuses to serialise or
a dozen duplicate copies of one tank. Here an entity codes to `{__e:id}`; the shared type-tables
(`RTS_WEAPONS`, `RTS_TEAM_TYPES`, `RTS_TRIGGERS`) code to `{__s:tok}` by **identity**, never
equality; typed arrays code to base64. Anything still self-referential after those rules throws
with the path that caused it rather than overflowing the stack.

**The ordering constraint is RA's too.** It codes Houses last and decodes them first, because
every other object's House pointer goes through them. Here entities decode in two passes — every
shell exists and is registered in `byId` before any field is resolved — so a reference resolves
regardless of the order things were written in.

**`SAVEGAME_VERSION` is the sum of the `sizeof()` of every class in the save.** Change a
structure and old saves stop loading, with no discipline required from the programmer.
`_rtsSaveVersion()` is the same trick in this game's terms: map size, unit/structure/weapon
counts, team types, triggers. Add a unit and every existing save is rejected automatically.

**Verify before you touch anything.** Load_Game's comment says that if it returns false "the
entire game will be in an unknown state", which is why the digest check happens *first* and bails
"before any damage could be done". Version, presence, byte length and an FNV-1a checksum are all
checked before `rtsClose()` is called. A refused load leaves the running battle untouched — the
harness asserts exactly that.

**What is not saved** — `Post_Load_Game`'s "fixup any expediency data that can be inferred from
the physical data loaded": meshes, power totals, the base-centre cache. Deriving them again is
smaller and safer than trusting a stale copy. Scorch is the one that needs a nudge: the marks
live in `G.scorch` but they had been *stamped* into a terrain bake that died with the old battle,
so every scorched cell is pushed back onto `G.newScorch` for the renderer to re-stamp.

**The RNG had to grow accessors.** `_rtsRngMake`'s state was a closure variable, which cannot be
read. A save that does not carry the generator's *position* resumes on a different roll sequence
and the match diverges from the first shot. `f.get()` / `f.set()` rather than a property updated
per call — it is the hottest function in the simulation. Both generators are created **lazily**,
so the restore has to construct a missing one with exactly the same seed the lazy path uses; the
first version of this silently left `oreRnd` null and the ore field grew differently from the
moment of loading. That was caught by the determinism test, not by looking.

**The load path goes through the same door as starting a battle.** `rtsLoadGame` parks the body
on `window._RTS_PENDING_LOAD`, closes, and calls `rtsOpen`, which applies it *between*
`_rtsNewGame` (which supplies every invariant) and `_rtsRInit` (which bakes the terrain the save
actually carries, not the one the seed would have produced).

Interface: 💾 / 📂 in the top bar, **Ctrl+S** to save, and a **RESUME BATTLE** button on the title
screen carrying the save's description. Loading is deliberately *not* on a key — it throws the
current battle away and that deserves a click. The title button is `Get_Savefile_Info`: the header
is a separate small localStorage record, so listing a save never parses its 300 KB body.

### How this was verified

The test that matters is **simulation identity**, which the seeded RNG (PR #12) makes possible:
save at a moment chosen *by condition* — shells in the air, units with targets, wreckage on the
ground — then run 90 s from the original and 90 s from the restored copy and compare a fingerprint
covering every entity's identity, position, health, order and coded links, both economies, both
generator positions, all six mutable maps, and the team and trigger bookkeeping. They match. A
missed field shows up as a diverging fingerprint; that is how the `oreRnd` bug was found.

31 assertions in `save.js`: the round trip; references decoding to live objects rather than copies
(4 targets, 5 harvester links, 11 teams / 44 members, 1 shell in flight, the 3-unit selection);
type-tables decoding to the shared objects; power recomputed; scorch re-queued; the storage guards
(corrupted body, truncated body, wrong version — each refused with the running game untouched);
the full button path save → quit → resume; a seven-minute battle at 182 entities saving to 304 KB;
and the resumed frame rendering **0 % of pixels different** from the frame that was saved.

Two harness assertions were wrong before the code was: one expected the difficulty *key* where
`desc` carries the display name, and one capped screen darkness at 50 % when 71 % of an idle
game's map is legitimately under shroud. Compare the two frames' darkness to each other, not to a
number picked by eye.
