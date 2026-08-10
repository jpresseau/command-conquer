# Transports, submarines and aircraft — moving in ways a tank cannot

The APC and the landing craft carrying cargo, the submarine's one cloak flag read in a dozen
places, and the flight layer with the reload cycle that makes it cost something. Split out of
`docs/core-units.md` when that document passed the size cap the source tree is held to;
everything about infantry, missions and the data tables stayed there.

> Reference, split out of `CLAUDE.md`. The rules that must be followed before touching
> anything are still in `CLAUDE.md`; this is the working behind them.

## The APC, and a transport subsystem

`UNIT.CPP`'s passenger rules. The one that matters is in `UnitClass::Death`, and it is why an
APC is worth buying rather than a coffin:

```cpp
} else {
    while (Is_Something_Attached()) {
        FootClass * object = Detach_Object();
        if (object->Is_Infantry() && object->Unlimbo(Coord, DIR_N)) {
            object->Scatter(0, true);
        } else {
            object->Record_The_Kill(source);
            delete object;
        }
    }
}
```

**Infantry passengers survive the transport's destruction** and scatter out of the wreck. Anything
else is recorded as a kill. Ours can only carry infantry, so in practice everybody walks — which
is the whole point of the unit.

### Passengers stay in `G.ents`

A boarded passenger is **not** spliced out of the entity list; it carries `inside`, a reference to
its transport. That is a save decision, not a style one: the save encoder walks `G.ents` and turns
entity references into ids, so a passenger lifted out of the list would round-trip as an inline
*copy* and come back as something that merely resembled a unit — with `byId` not knowing about it
and its identity broken against anything holding a reference.

The cost is that every place treating a unit as being ON THE MAP has to say so. This section used
to say that turned out to be "only six", and the confidence was the expensive half: it read as a
closed list nobody need re-check. **Three more were found later**, all of one shape — they walk
`G.ents` comparing positions, and a passenger sits at its transport's coordinates:

- `_rtsOverrun` — a tank driving past an APC crushed the squad sealed inside it;
- `_rtsSplash` — a shell landing on a transport hit the hull **and** every passenger, at zero
  range, through no armour of their own, which makes a 350 hp APC a worse place to be than the
  open ground beside it;
- `_rtsProjHit` — a shell in flight could stop on a passenger instead of on the hull.

All three predate the landing craft by a long way and were true of the APC from the start; they
were found by a landing craft that kept losing its cargo in open water with nothing near it. Two
assertions pin the save behaviour — that a loaded APC comes back with its cargo, and that the
passengers come back **by identity** rather than as copies.

### And the door was never fitted

The board order is issued from `_rtsRightClick`, and the branch that issued it sat inside
`if (tgt.side === 'enemy')`, guarded by `tgt.side === mu.side` — with `mine` filtered to your own
units two lines earlier. The two conditions are mutually exclusive: **the branch was unreachable
from the moment it was written.** Measured on seed 7, a rifle squad right-clicked onto its own
APC — the order came out `move`, the squad walked to 0.75 tiles away and stood there, and the APC
carried 0 of its 5 for the rest of the match. Calling `_rtsOrderBoard` by hand in the same match
loaded it on the first try: the subsystem worked, the only route a player has to it did not.

Fitting the door exposed the next thing immediately. The board order puts a **friendly** in
`e.target`, and the engage block shoots whatever `e.target` is — the squad put two rounds into its
own APC on the walk in, 350 → 347.9 hp. Trivial with a rifle; the same code with a cannon against
an unarmed 400 hp landing craft is not. Guarded twice now: the aim in `_rtsUpdateUnit`, and
`_rtsFire` itself, which is the one place every route to a shot passes through.

### The bug the suite caught and reading the code did not

`_rtsUnload` guarded on `if (t.dead) return 0` — perfectly sensible — and `_rtsKill` sets `dead`
**before** it spills the cargo. So the guard rejected the one call the whole rule exists for, and
every passenger stayed sealed in the wreck. Five of five died; the assertion said so immediately.
`_rtsUnload(t, force)` now takes the flag, and `_rtsSpillCargo` passes it.

That is the same lesson as the production deadlock and the dangling `ChainTo`: **assert on the
outcome you want, not on the mechanism you happened to build.** "Unloading returns everyone"
passed the whole time — it was testing a live transport.

### Measuring

Ladder unchanged at **329 / 246 / 214**, which is expected for the same reason as the MCV: the AI
does not buy APCs and an idle player builds nothing. The transport suite is 13 assertions;
`clip.js` is 1184 frames; the save suite is 31 and still green.

## The landing craft — a road, not a weapon

RA gives the LST to **both** armies, because a boat that carries your tanks is not a weapon, it
is a road. That is why it needs the capability `shipyard` rather than a building: the Naval Yard
and the Sub Pen both `provide` it and neither is called it, so one roster entry covers both sides
instead of two units differing only in whose flag they fly. It is the first prerequisite in the
game with no namesake structure — the case `_rtsProvides` and `_rtsNeedName` were written for and
that nothing had ever exercised.

Three rules make it a landing craft rather than an APC that floats:

- **The unload spot is chosen in the PASSENGER's domain, not the transport's.** An APC unloads
  onto the ground it is itself standing on, so the old ring — eight positions at 1.1 tiles, taken
  on trust — was always right. A landing craft sits in the water, where every cell of that ring
  is sea. A passenger with nowhere to stand now stays aboard, and the craft says so.
- **`RTS_UNLOAD_REACH` is 3 tiles, and the number is the rule.** At five, a craft in the middle of
  a five-tile channel found a bank three cells away and put a Battle Tank on it — the tank crossed
  twelve world units of open water on foot. The craft has to nose in.
- **Sunk at sea, the cargo goes down with it; wrecked against a beach, it lands.** Both fall out
  of one sentence — everyone who can be put ashore is, everyone who cannot drowns — so there is no
  "if it is a boat" anywhere in `_rtsSpillCargo`.

**No transport inside a transport**, which RA does allow and this deliberately does not: the tick
skips anything flagged `inside`, so an APC riding in a craft would never run the update that drags
*its* passengers along, and they would be left standing on the beach still flagged as its cargo.

### What the craft does not change

`_rtsMapCheck`'s reachability flood is four-way and **land only**, so a map whose halves join only
by sea is still refused before the battle starts. That stays, and the reason is the opponent:
there is no amphibious logic in it, so on a sea-split map the player could cross and the opponent
could not, and the battle would be one side shelling a base that can never answer. The craft is
for maps that have a land route *and* water — an island of ore, a flank the road does not reach,
a beach behind the guns. The limit is pinned as its own assertion so lifting it has to be a
decision rather than a side effect.

### A ship that could never finish a move order

Found while building the above, and older than any of it. `_rtsPath` walks a blocked goal out to
the nearest cell the unit can occupy — and then overwrote the route's last waypoint with the
original goal anyway. For a land unit that is harmless; for a **ship ordered at the shore** the
last waypoint is dry land it can never enter, so `_rtsSteer` never clears the path. Measured, seed
7: a Gunboat given an ordinary move order at a point on the far bank was still `order:'move'` with
a live path 120 simulated seconds later, parked at the water's edge. Worse than it looks, because
the acquire branch only runs on `amove` or no order at all — so the boat also stood there refusing
to shoot anything for the rest of the match. A tank ordered onto its own Command Yard is
unaffected and finishes at the same 8.485 tiles before and after the fix.

## Submarines — one flag, read everywhere

Both Soviet boats were ordinary hulls that happened to carry torpedoes. There was no cloak flag in
the roster and nothing read one, so a Submarine sat on the surface being shot at by anything whose
gun reached the water — while the Destroyer's own roster line promised to be "the Allied answer to
a submarine". `TECHNO.CPP`'s `Cloaking_AI` is two sentences:

- **a cloaked object that fires will decloak**, and stays up for a moment afterwards
  (`RTS_SUB_SURFACE`, 4 s, set in `_rtsFire` — the one place every route to a shot passes through,
  so there is no way to fire from under water);
- **anything close enough finds it** — `RTS_SUB_DETECT` is 2.5 tiles for every object, and a hull
  carrying `detects` sees further. Only the Destroyer does, at 9 tiles, and that is the whole
  reason to own one rather than two Gunboats.

`_rtsCloakAI` runs on the boat itself once a tick and writes one flag, `hidden`. Everything else
reads it: `_rtsFindTarget` for both sides symmetrically, and `_rtsEntSeen` for everything the
player is allowed to perceive — which is one funnel, so an undetected boat is also unclickable and
cannot be ordered attacked. The flag is about the OBJECT rather than about who is asking, so the
opponent cannot cheat by ignoring it and your own submarines are hidden from it by the same line.
Yours stay on your screen, drawn awash.

### The mutation that found a hollow assertion

Breaking `_rtsEntSeen`'s cloak check outright left `e2e/stealth` **fully green**. The reason is
worth recording: the first section was asking whether the player could see a submarine sitting
alone in the fog, and the answer is no whether cloaking works or not — there was nothing out there
to see with. The assertion that actually means something is a submarine in water a Gunboat is
lighting up: in plain view, in daylight, and still not there. That case was added and the mutation
now fails it.

## Aircraft — a flight layer, and the rule that makes it cost something

`AIRCRAFT.CPP`. Three rules turn a fast unit into an aircraft, and the third is the one that
matters:

```
Ammo = Class->MaxAmmo;          // a fixed number of shots
if (!Ammo) mission = MISSION_ENTER;   // then home to a pad to reload
```
> *"If this aircraft has nowhere else to go, meaning that there is no airfield available, then
> it has to crash."*

That last clause is implemented, not softened. A helicopter whose pads have all been destroyed
comes down — which is what stops air being a free permanent army and makes the Helipad a target
worth defending.

**`aa` is the whole air/ground contract.** A weapon without it cannot engage anything flying. Two
weapons have it — the rocket squad's launcher and the Rocket Turret — exactly the two answers the
original gives you. The helicopter's own missiles do *not*, so it carries no air-to-air, as the
Longbow does not.

### Three bugs, and none of them was visible by reading the code

Everything about the crash rule and the ammo loop passed on the first run. Getting the helicopter
to actually *land* took three fixes, each found by one assertion — "it flies home and reloads
rather than crashing" — failing for a different reason:

1. **The fly-home branch returned `false`.** The tick hook only steered when `_rtsAirTick` claimed
   the tick, so the ordinary unit logic ran straight afterwards and overwrote the course. The
   helicopter sat still with an empty rack and a pad it never flew to.
2. **Separation shoved it off the apron.** Aircraft were still in the crowd-separation pass, which
   pushed the machine back out every time it closed. It hovered at about six world units and
   oscillated.
3. **The pad's own footprint blocked it.** The mover's "is that cell blocked" test applies to
   buildings, and a helipad is a building — so the aircraft was refused entry to the very
   structure it was trying to land on, stopping dead at the pad's half-width plus its own radius.

`_rtsPathFor(e, gx, gz)` is the other half of flight: an aircraft's "route" is the single waypoint
it is heading for, because terrain, walls and units are all irrelevant to it. Routing every path
request through one helper means no call site has to remember what it is holding. **Writing that
with a regex over the call sites rewrote the helper's own body into infinite recursion** — worth
checking after any sweeping rename.

### Drawing something that is above the battlefield

An aircraft is drawn lifted off its ground position with a flattened shadow left on the cell it is
actually over. Without that gap a helicopter reads as a fast, oddly invulnerable jeep. The lift
collapses to almost nothing while it is sitting on a pad reloading.

**The rotor took two attempts and the second was worse than the first.** Drawn as a solid disc —
the obvious way to say "spinning" — it came out as an opaque dark lid 31 px across that hid the
entire aircraft; every facing was the same black circle. The next attempt used four blades at
45-degree steps, which fails for a reason worth writing down: **these primitives are axis-aligned
boxes, so a diagonal "bar" is a box that is long in both axes — a square.** Four of them merged
into a solid diamond. Two crossed bars along x and z are genuine thin bars, and the fuselage and
tail read through the gaps.

### What is not done

**The AI does not build helipads or helicopters.** Air is player-only for now. Teaching
`_rtsAIWants` a new branch of the tech tree is a separate change with its own ladder run, and
bolting it on untested would be exactly the kind of thing the rest of this file argues against.

### Measuring

Ladder unchanged at **329 / 246 / 214** — as expected, since the AI does not field aircraft. The
flight suite is 13 assertions; `clip.js` is 1248 frames; the save suite is 31 and still green.
