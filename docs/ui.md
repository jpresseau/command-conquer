# The interface — selection, the sidebar, the radar, and animation cadence

What the player touches, and the 15 Hz cadence everything visual runs on. Implemented in
`src/ui/` and `src/render/`.

> Reference, split out of `CLAUDE.md`. The rules that must be followed before touching
> anything are still in `CLAUDE.md`; this is the working behind them.

## Selecting things — from DISPLAY.CPP

Before this the whole selection vocabulary was: click, rubber band, control groups. That is
less than any RTS of the era shipped with, and the missing commands are the ones a player
reaches for every few seconds.

**`Is_Players_Army` is the one predicate, and everything routes through it.** Player-controlled,
selectable, *not a building*. That last clause is why dragging a band across your own base
grabs the tanks parked in it and leaves the barracks alone. It lives here as `_rtsIsArmy(e)`
and the band, the double-click, select-all, the object cycle and the team hotkeys all call it —
one definition, so they cannot drift apart. Several of those used to inline their own copy.

**`Next_Object` / `Prev_Object`** walk the ground layer for the next object passing that
predicate, wrapping to the first when you run off the end and starting at the front when
nothing is selected. `G.ents` is this game's ground layer and its order is stable for an
entity's lifetime, so N walks the army in a fixed order rather than jumping about. Bound to
**N** and **Shift+N**. The originals select *and centre*, and so does this — the point of the
key is to go and look at the unit, not to tick a box off screen.

**`Center_Map` with no argument** averages the selection's coordinates and puts the tactical
view there. Bound to **Home**; with nothing selected it falls back to your command yard, which
makes it the "where was I" key after chasing a raid across the map. `_rtsHandleTeam`'s alt case
was doing this arithmetic inline and now calls `_rtsCenterOnSel` too.

**Double-click a unit to select every one of its type in view.** Deliberately scoped to the
tactical view, not the whole map — "all the ones I can see" is the useful command; "all the
ones I own" is Ctrl+A. 350 ms window, re-armed on every click so a triple-click reads as two
double-clicks rather than one double plus one dead click.

**Ctrl+A is mine, not a port** — the originals have no select-all — but it runs through the
same `Is_Players_Army` filter, so it takes the army and never the base.

DISPLAY.CPP's small pixel threshold before `Mouse_Left_Held` engages rubber-band mode was
already matched (`> 4` in `onmousemove`); nothing to change there.

**Two things the harness caught that clicking would not have.** Ctrl+A shares its key with
attack-move, so without the modifier check it armed attack-move as a side effect of selecting
the army — a mode you would only notice on your next right-click. And the double-click test
initially "failed" at 7-of-5 because the game spawns its own starting units: the expected count
has to be measured from the world, not from what the harness placed. Assert against a value you
derived, not one you assumed.

The start screen's key list had also drifted — it never mentioned S, the team hotkeys or the
radar orders. It now lists everything that is bound.

Verified: 43 assertions across `sel.js` (predicate, double-click scoping, additive selection,
cycle order/wrap/centre/recovery-when-the-held-unit-dies, `Center_Map` averaging and dead-member
handling, team hotkeys and band select unregressed) and `selkeys.js` (the same commands driven
through real DOM key and mouse events, plus 30 s of simulation afterwards).

## Commanding from the radar — from RADAR.CPP

`RTacticalClass::Action` does something the minimap here did not: **with units selected, a
click on the radar issues an ORDER rather than moving the view.** That is how an army gets
committed across the map without scrolling to it. The action is filtered to a restricted set -
MOVE, NOMOVE, ATTACK, ENTER, CAPTURE, SABOTAGE - and anything else falls through to nothing.

The shroud rule is ported exactly: `shadow = !IsMapped` means an unexplored cell cannot be
*targeted*, only moved to. Right-clicking fog sends the units there; it never acquires
whatever happens to be standing in it.

**Two deliberate differences from the original.** RA puts the order on the LEFT button because
its right button toggles radar zoom. This game has no radar zoom, and right-click is already
the one context-sensitive order button everywhere else — so the order is on the RIGHT and left
keeps moving the view. Matching a binding whose other half does not exist would have made the
input inconsistent with the rest of the game for no gain.

**The bug this shipped with, caught by measuring rather than clicking:** `mousedown` fires for
*every* button, so the right-click order ALSO recentred the view — the army got its order and
the camera jumped off whatever the player was watching. `onmousedown` now ignores anything but
button 0. If a handler is bound to mousedown and there is a right-click path anywhere near it,
check that guard.

Verified: four selected units right-clicked onto a revealed enemy yard all take an attack
order and path to it; the view does not move; left-click still moves the view; and a
right-click on shrouded ground produces a move order for all four and never an attack.

Note `rtsui2.js` in the scratchpad is a stale harness — it loads `/command/` and expects
`window.rtsOpen`, from before the RTS moved to its own repo. It fails on a clean `main` too.

## Production and the sidebar — from SIDEBAR.CPP

**Two independent lines.** `Which_Column` puts buildings in column 0 and everything else in
column 1, and each column holds at most one factory. That is `S.q.struct` / `S.q.infantry` /
`S.q.vehicle` here.

**A click means different things by button** (`SelectClass::Action`):

- **Left** — start production, or resume a suspended job, or (for a finished building) enter
  placement mode. Left-clicking a job that is already running does **nothing**; it used to
  cancel outright, which meant one stray click threw away a nearly-finished war factory along
  with the credits.
- **Right** — *"If production is in progress, put it on hold. If production is already on
  hold, then abandon it."* Two distinct presses. Holding freezes the clock and stops all
  spending; abandoning refunds what was actually paid so far (`q.paid`, not the full cost —
  the money not yet spent was never taken).

**While a line is busy, every cameo in that column greys out** (`busyline`), because
`Fetch_Factory(otype)` returning non-null disables the whole type. This is the difference
between "you can't afford it" and "that line is taken", and without it the player just gets a
silent no.

**`Recalc` runs when a factory dies, and only then** — the source comment is explicit that the
sweep is expensive and should not run for every casualty. Anything no longer buildable by
anybody is dropped and its production abandoned with a refund; a finished building still
waiting to be placed needs a yard to come out of, so it goes too. Without this, blowing up a
barracks left the rifle squad inside it still ticking toward completion and then walking out
of a building that no longer exists.

**EVA lines**: `VOX_TRAINING` ("Training") for infantry vs `VOX_BUILDING` ("Building") for
everything else; `VOX_SUSPENDED` / `VOX_CANCELED`; and `VOX_NEW_CONSTRUCT` ("New construction
options") from `StripClass::Add` whenever something *joins* the buildable list — the cue that
finishing a barracks just unlocked infantry, which is easy to miss when the new options are on
a tab you are not looking at. Watch every category, not just the visible one, and stay quiet
on the first pass or a new game announces itself.

## Animations — from ANIM.CPP

`RTS_ANIMS` in the rules is AnimTypeClass trimmed to what this game uses, and the field that
matters most is **`biggest`**:

- **Ground-altering effects fire at the animation's BIGGEST stage, not at its start.** ANIM.CPP
  does this so a crater or scorch mark appears *under* the fireball rather than popping into
  view in plain sight beside it. `_rtsAnimMiddle` is the equivalent of `Middle()`. If you move
  that call to t=0 the illusion breaks immediately.
- **`chain`** is ChainTo: an animation metamorphoses instead of ending. An explosion becomes a
  fire, which is why a battlefield keeps burning after the shooting stops.
- **`damage`** on an attached animation applies to whatever it rides (WARHEAD_FIRE). Units
  under 30% health catch fire, the flame tracks them, and it burns them down.
- Scorch marks and craters are stamped **permanently into the baked terrain canvas**, so they
  cost nothing after the frame they appear on. Craters also eat the ore in their cell
  (`Reduce_Tiberium(6)`).

**Ore must be reachable.** Roads connect the two bases, but forest can ring an ore field and
water can leave one on an island — about one map in three was affected. Map gen now flood
fills from the player start and carves out to any unreachable ore, and that carve is allowed
to lay a causeway across water. Always re-run the path harness over several fresh maps after
touching obstacle density; a single map proves nothing, because the seed is random.

## Colour cycling — from CONQUER.CPP

`Color_Cycle()` in the GPL source is the palette animation, and its constants are reproduced
exactly in `_rtsCycleTick` because the cadences are what the eye recognises:

- **Pulse**: steps by 20 every `TIMER_SECOND/6`, bouncing between `0x20` and 150. Drives
  `CC_PULSE_COLOR` (the radar viewport box) and `CC_EMBER_COLOR` — `RGBClass(255,80,80)`,
  the glow on burning things. Structures under a third health carry it, with smoke.
- **Water**: a band of palette entries rotates one step every `TIMER_SECOND/4`. There is no
  indexed palette here to rotate, so the equivalent is a four-frame highlight overlay on the
  same clock. A static lake is one of the deadest things on a map.
- **`Shake_The_Screen()`**: the original blits the page offset a couple of pixels, re-picking
  each tick. Here it is a transform offset driven by `G.shake`, which a dying structure sets
  — shake is simulation state in the original too (`TimeQuake`), so it lives in the core.

## More from CONQUER.CPP

- **`Sync_Delay()` pins the original to 15 FPS**, and that cadence is a lot of how its
  animation reads. Movement here stays continuous — it looks broken at 15 Hz on a modern
  display — but everything choosing an animation FRAME runs off `_rtsAnimFrame()`, a 15 Hz
  counter. Use `_rtsAnimQ(t)` to quantise an elapsed timer to the same grid.
- **`Get_Radar_Icon()`** builds a radar blip by downsampling the real shape: three samples
  per cell, each taking the first non-transparent pixel across a nine-tap offset kernel so
  thin features don't drop out between samples. `_rtsRadarIcon` does the same, which is why
  structures are recognisable on the radar rather than coloured blocks.
- **`Handle_Team()`** — number keys with the original's four modifier cases: plain selects,
  shift adds, ctrl assigns the selection, alt selects and centres. Unit `team` is
  Handle_Team's `Group`.
