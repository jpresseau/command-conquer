# Combat — how a shot lands and what it does

Ported from the Red Alert GPL source. The blast model, armour, target selection, vehicle
facings and fire, and the way things burn. Implemented in `src/core/combat.js`,
`src/core/damage.js` and `src/rules/weapons.js`.

> Reference, split out of `CLAUDE.md`. The rules that must be followed before touching
> anything are still in `CLAUDE.md`; this is the working behind them.

## The blast model — from COMBAT.CPP

`Modify_Damage` is the whole of it, and the falloff is a **division**, not a taper:

```
steps = distance / (SpreadFactor * PIXEL_LEPTON_W/2), bounded 0..16
if (steps) damage /= steps
if (steps < 4) damage = max(damage, MinDamage)      <- floor near the blast ONLY
damage = min(damage, MaxDamage)
```

Damage falls as **1/d**: full at the impact point, a fraction one cell out. And the MinDamage
floor deliberately *stops applying* past four steps — "allow damage to drop to zero only if
the distance would have reduced damage to less than 1/4 full damage". A unit at the edge of a
blast takes **nothing**, not a courtesy point. (An earlier pass here read RULES.CPP's
`ExplosionSpread` as "damage halves per cell" and shipped an exponential curve; this file is
where the real formula lives, and it is neither exponential nor floored everywhere.)

Two rules in `Explosion_Damage` matter as much as the curve:

- **A hit anywhere on a building's footprint counts as a direct hit on its centre** (`if
  RTTI_BUILDING && impacto == object → distance = 0`). Without it a shell landing on the
  corner of a 3×3 refinery is silently downgraded to a graze — measured here as 200 damage
  versus 12.5.
- **The blast damages everyone except whoever fired it.** Friendly fire is real: park your
  own squad around a target and your own rockets will kill them.
- The routine only ever examines the impact cell and the eight around it (`range =
  ICON_LEPTON_W * 1.5`), so a blast **never spills further than a cell and a half**, whatever
  the warhead. SpreadFactor shapes the curve inside that radius; it does not widen it.
- `IsTiberiumDestroyer` → `Reduce_Tiberium(strength / 10)`: shelling an ore field strips it.

**`Combat_Anim` picks the explosion from the damage and the land type** — a rifle round and a
tank shell are not the same event, and neither is over water. Small hits piff (a grey-white
spark, not fire), mid hits throw fragments, big ones are a fireball, and anything over water
is a plume with a ring spreading on the surface and no mark left behind. Draw the water plume
as a *ring plus a collapsing column*: a filled pale disc at that size reads as a cloud. Effect
frames must stay **square** — the renderer draws every one at `width × width`.

## Armour classes — from WARHEAD.CPP + CONST.CPP

`CONST.CPP` gives `ArmorName[ARMOR_COUNT] = { "none", "wood", "light", "heavy", "concrete" }`, and
`WARHEAD.CPP` gives the model that uses them: a warhead carries **one multiplier per armour
class** (`Modifier[armor]`, read from RULES.INI as `Verses=100%,100%,100%,100%,100%`), defaulting
to 1 for anything unlisted.

This game had three buckets — infantry / vehicle / building — derived from what a thing *is*.
That is a worse model, and not by a little: **armour is a property of the object, independent of
its category.** A Mammoth and a concrete bunker can share `heavy`; a Scout Buggy and a Battle Tank
can differ even though both are vehicles. Under the old scheme every vehicle in the game
necessarily took the same multiplier from every weapon, and there was no way to express "thin
skin" at all.

All five call sites already funnelled through one `rtsArmour(e)`, so the refactor was contained:
that function now returns a declared class, every unit and structure carries `armour:`, and every
weapon carries `verses:{none, wood, light, heavy, concrete}`.

**`IsWallDestroyer`** is the other thing worth having. Only warheads that carry it can bring down
a Concrete Wall — which is the entire *point* of concrete, and it arrived one PR after walls did.
Small arms are now literally unable to scratch one: a rifle squad shooting a wall for ten seconds
leaves it at 400/400. It is folded into `rtsVerses()` rather than checked at each call site,
because there are five of them and one forgetting is a silent balance bug.

**`IsOrganic = (Modifier[ARMOR_STEEL] == 0)`** — the original derives "anti-personnel only" from a
zero against steel rather than storing a flag. The Attack Dog was written exactly that way before
this file arrived, which is a pleasant confirmation.

**The numbers are still mine.** `WARHEAD.CPP` is the class, not the data — the real multipliers
live in RULES.INI, which is a data file rather than source. The five classes and the defaulting
rule are the port; the values in each `verses` table were derived from the old three-bucket ones
to hold the measured balance, and would be replaced wholesale if that file turns up.

Verified: 16 assertions in `armour.js` — five classes, every entry declaring a real one, all
infantry ARMOR_NONE as in the original, two vehicles resolving to different classes, the
defaulting rule, the dog's organic zero, a machine gun preferring light armour and an anti-armour
gun preferring heavy, small arms unable to hurt a wall while shells and rockets can, and the wall
rule applying to walls rather than to all concrete. Ladder easy 298 s / normal 218 s / hard 175 s,
within a second of the previous run on every difficulty.

## Picking a target — from TECHNO.CPP

`Greatest_Threat` / `Evaluate_Object` **score** candidates rather than measuring how far away
they are. That is the difference between an army that shoots whatever it bumps into and one
that picks off the harvester.

```
value  = Points (Risk + Reward)  + Crew.Kills
       × 2                        if outside its OWN base's zone   (a straggler is soft)
       × NervousBias              if inside MY base's zone
score  = value × 32000 / (distance in cells + 1)          ← LINEAR, not squared
```

The squared falloff is sitting right there in the original, commented out; the shipped line is
the linear one. A weapon whose `Modifier` against that armour is zero never selects the target
at all.

- **Points stand in as `max(cost, hp)`, and the hp floor is load-bearing.** The Command Yard is
  free, so cost alone values the most important building in the game at zero — and a
  zero-valued candidate is discarded. Nothing could target a construction yard: measured, the
  Commando AI ran to 179 units and 27 buildings while an idle player calmly survived eight
  minutes, because neither side could shoot the other's yard.
- **`Crew.Kills` makes veterans hotter targets.** Kills are added raw to a Points-scale number
  in the original; costs here run 100–1600 rather than 10–80, so the term is scaled or it
  vanishes into the rounding.
- **`Area_Modify` is deliberately NOT implemented.** It halves a candidate's value per nearby
  friendly building, but it is gated on a per-weapon `IsSupressed` flag that only a few RA
  weapons carry and this game has no equivalent data for. Mapping it onto "any splash weapon"
  is the obvious guess and it is wrong: measured, it drove a target standing *inside* your own
  base down to 640k against 1.28M for the same unit in open ground — exactly inverting
  NervousBias and leaving the base undefended.

**`Is_Allowed_To_Retaliate`** — shooting back is not automatic. No source, an ally, or no weapon
that can hurt the attacker all mean no. An idle unit always turns and fights. A unit already
engaged only switches if the attacker is genuinely the better target, and even then the
original only bothers **half the time** — that coin flip is what stops a firefight becoming
every unit spinning toward whoever shot last. Measured: 0% switching away from a better target,
~50% switching to one.

**`Base_Is_Attacked`** — *"will pull units off of the field and send them back to defend the
base… will make taking an enemy base much more difficult."* Raid a defended base and its army
comes home. Only the AI runs this (humans deal with their own base-is-attacked problems), a
building that can shoot back doesn't overreact, and a `BaseAttackTimer` on the attacker stops
one long firefight from recalling the army over and over. Defenders alternate 50/50 between
charging the attacker and taking station on the building — a pure charge empties the base again
the moment the raider dies.

**Firing from the dark gives you away.** `Fire_At` does a `Sight_From` of radius 2 around a
shooter the player can't see. Here the reveal lives on the shooter as a short timer rather than
as a mark on the grid, because the visibility grid is rebuilt from scratch every sweep and a
one-shot mark would be erased before it was drawn.

**`What_Weapon_Should_I_Use`** scores every weapon the object carries against the candidate's
armour — `Modifier[armor] × 1000`, **doubled when the target is already in that weapon's
range**, zeroed when it could not fire at all, primary wins ties. The doubling is the
interesting half: it biases toward the weapon that can shoot *now* over the one that would be
better after driving closer. The Battle Tank carries `weapon2:'coax'` and switches to it for
infantry with no input from the player — measured 180 coax shots against a rifle squad, 40
cannon rounds against a tank, and the main gun chosen for infantry standing beyond coax range.

**`Rearm_Delay` + `Is_Two_Shooter`** — a burst weapon does not reload evenly. The delay
assigned after each shot alternates, so shots arrive as a fast pair and then a long wait:
measured gaps of `[1.56, 0.22, 1.57, 0.21]`. `IsSecondShot` starts *true*, so the first shot of
a fresh unit takes the full ROF and the pair forms after it. The same flag drives
`PrimaryLateral`, so a two-barrel weapon visibly alternates sides.

**Which weapons burst, and which units carry a secondary, is a choice here — not ported data.**
RA keeps it in RULES.INI and this game has no equivalent. Both were tuned against isolated
measurements so only the intended change survives:

| | before | after | |
|---|---|---|---|
| tank vs infantry | 18.18 | **21.12** | +16%, the point of a coaxial gun |
| tank vs tank | 50.67 | 50.67 | 0% |
| tank vs building | 22.16 | 23.12 | +4%, one extra shot in the window |
| rocket vs tank | 24.50 | 24.93 | +2% |
| rifle vs infantry | 6.24 | 6.24 | 0% |

**Measure DPS on an isolated map.** The first pass at these numbers ran on a live game and the
enemy AI polluted every one of them — two runs of the same scenario disagreed by 2× on
tank-vs-building, which read as a balance regression and was pure harness noise. Kill every
other entity first, and hold `G.over`/`lost` open each frame or the victory check stops the
tick and you measure a single shot. Also null the target's `cool`: a punching bag that shoots
back makes infantry panic, and then the number measures fear rather than firepower.

And note **prone halves incoming damage**, which is why a machine gun can be *worse* against
infantry than a cannon: the first coax numbers looked like a bug and were the prone rule
working correctly.

`Threat_Range`'s area-guard clamp (2× weapon range, capped at 10 cells) is implemented but never
binds — every sight radius in this game is already inside it. It is kept because the clamp is
the rule, not the current unit table.

### What the scan runs over — `src/core/spatial.js`

The scoring above is unchanged; what changed is the list it runs over. `_rtsFindTarget` walked
every entity in the game, for every armed unit, every tick — O(n²), and measured with two
armies in front of each other it *was* the simulation:

| units | `_rtsTick` | `_rtsFindTarget` | `_rtsOverrun` |
|------:|-----------:|-----------------:|--------------:|
|    43 |     0.82ms |    0.51ms  (63%) | 0.09ms  (10%) |
|   166 |     7.76ms |    5.84ms  (75%) | 0.93ms  (12%) |
|   320 |    27.16ms |   21.29ms  (78%) | 3.76ms  (14%) |

Doubling the army very nearly quadrupled the cost. At 320 units — a big battle, not an absurd
one — the simulation alone took **27ms of a 16.7ms frame** on a desktop-class CPU, before a
pixel was drawn.

So entities are filed into 8-unit buckets once per tick and a scan asks for the buckets covering
its own reach. **The per-candidate test is untouched**: a caller can only be shown fewer
candidates, never different ones, which is what makes the whole thing checkable by one question
— does the bucketed scan return the same object the full one would have? `test/e2e/spatial`
asks it every tick of a real battle (62,176 scans, 2,817 of which found something) and
`test/unit/spatial` takes the property apart into the ways it can break.

Packed a tile apart, which is the worst case a grid can be handed — every candidate a scan
collects really is inside its reach, so no bucketing can make the list shorter: **21.33ms →
13.37ms**, and a scan still reads 64% of the entity list. At the spacing a formation on the move
actually holds: **22.98ms → 4.42ms**, and a scan reads 12%.

Three things let a candidate matter from outside the radius a caller asked for, and getting any
of them wrong is a unit that quietly stops shooting back rather than an error:

- **Elevation.** `_rtsElevReach` hands a unit standing high up to `RTS_ELEV_MAX ×
  RTS_ELEV_RANGE` of extra reach. `RTS_SP_ELEV` covers it.
- **Movement.** The index is built at the top of the tick and entities move during it, so
  `RTS_SP_MOVE` covers the fastest thing in the roster for one clamped `dt` plus a separation
  shove. It was 5 in the first draft, and the MiG needs 5.8.
- **Building size.** `_rtsRangeTo` measures to a structure's *edge*. Not padded for at all:
  structures are filed into every bucket their footprint covers, which is exact and free
  because they never move.

Buckets hold **ordinals** — positions in `G.ents` — not references, so a query can hand its
candidates back in entity-list order with a plain numeric sort. That order is load-bearing:
`_rtsFindTarget` keeps the first candidate of the best score and `_rtsScatter` draws on the
shared random stream, so a scan that met the same objects in a different sequence would pull the
whole simulation onto a different path. Sorting references through a `Map` instead cost more
than the bucketing saved — 13.6ms against 5.4ms at 320 units.

The flip side of ordinals is that one `splice` invalidates every one past it. `_rtsTick` reaps
its dead at the very bottom, after every scan has run, so this never bites mid-tick; it bites
the moment anything asks *between* ticks, and `_rtsSpNear` returns `null` (every caller falls
back to the full list) as soon as `G.ents.length` no longer matches what was filed.

## Vehicles — from UNIT.CPP

**A vehicle carries two facings.** `PrimaryFacing` is the hull, `SecondaryFacing` is the
turret, and they are drawn as *separate shapes*. This is the single most recognisable thing
about a C&C tank — it drives one way while its gun tracks another — and baking the turret into
the hull sprite throws it away. `_sprUnit(key, side, prone, part)` builds `'hull'` and
`'turret'` halves; both bake into the same size canvas about the same origin, so drawing one
over the other at the same screen position lines them up with **no per-facing offset table**.
The turret model is centred on its own pivot so it rotates in place. `RTS_TURRETED` lists
which units get the treatment. The turret sprite must not carry a drop shadow — the hull
already casts one.

- `Rotation_AI`: with no target the turret drifts back to the hull's facing.
- `Can_Fire` refuses with **FIRE_FACING** until the turret is within `diff < 8` of 256 (~11°),
  and with **FIRE_ROTATING** if the turret is still swinging and the projectile does not home.
  Homing weapons get four times the angular tolerance (`diff >>= 2`). Measured: a tank whose
  gun starts 180° off does not fire until 1.03 s, against a 1.05 s swing time.
- `Recoil_Adjust` moves the turret back one pixel along its facing when it fires.
- `Fire_Coord` (TURRET.CPP): a shot leaves the **muzzle**, not the middle of the vehicle.
  Since the turret is drawn as a separate sprite, spawning shots at the object's centre makes
  a tank with its gun swung 90° appear to fire sideways out of its own flank. `_rtsFireCoord`
  is used by the tracer, the projectile **and** the renderer's muzzle flash, so all three
  agree.
- **One bearing carries the weapon**, and it is `e.turret` for *every* armed unit — turret
  drawn separately or not — because that is the bearing `Can_Fire` gated on. Structures aim by
  turning their whole selves (`e.rot`). Using the hull bearing for units without a drawn
  turret put a buggy's flash on its nose while `Can_Fire` was testing a bearing that could be
  ninety degrees away.
- `Fire_Direction`: **a dumb shell leaves along the barrel and holds that bearing.** It does
  not curve onto the target, so `Can_Fire`'s ±11° tolerance has consequences — a tank shooting
  at something fast can miss. Missiles home, which is exactly why `Can_Fire` is four times
  more forgiving about their facing (`diff >>= 2`). Measured per shot: 100% against a
  stationary target at any range, 92% against a mover at 6 tiles, 86% at 9.
- A shell in flight **belongs to nobody** — it hits the first hostile thing it runs into, which
  need not be what it was aimed at, so an infantry screen absorbs shells meant for the tanks
  behind it. Only hostiles are tested; stopping on friendlies too would block every massed
  formation's line of fire, which is a different game. Splash still catches friendlies, as
  `Explosion_Damage` always did.
- Flight is bounded by the distance to the mark (`reach / speed + RTS_SHELL_OVER`) rather than
  a flat four seconds, so a **miss detonates near where it was aimed** instead of sailing
  across the map and exploding in somebody else's base.

## Things burn — from ADATA.CPP

ADATA.CPP is the animation table, **not** the aircraft table (that is `AADATA.CPP`; this file
was requested under the wrong name). It is also the first data file in this series whose
numbers are actually *in the source* rather than in `RULES.INI` — animations are hardcoded,
so everything below is quoted rather than invented.

### The burn ladder

RA does not have "a fire". It has three, each with its own damage rate, chaining **down**
into the next and finally into smoke:

| rung | ADATA | damage | size | scorches |
|---|---|---|---|---|
| `firebig` | `OnFireBig` | `fixed(1,10)` → 1.5 hp/s | 23 px | yes |
| `firemed` | `OnFireMed` | `fixed(1,16)` → 0.9375 hp/s | 14 px | no |
| `firesmall` | `OnFireSmall` | `fixed(1,32)` → 0.46875 hp/s | 11 px | no |
| `smoke` | `SmokeM` | none | — | no |

`Damage` is a fixed amount per **tick** at 15 FPS, which is where the hp/s column comes from.
Only `OnFireBig` is `IsScorcher`. Four loops per rung.

A fire is therefore not an effect that plays and stops — it **burns itself down**. A building
you shot and then left alone smoulders out; one you keep hitting is topped back up to full
size on each hit. That re-ignition rule is what makes a sustained bombardment look and behave
differently from a single shell, and it is why `_rtsIgnite` is one entry point rather than a
`push` at each call site.

**Structures burn now, and did not before** — the old code lit units only. Which rung a thing
starts on comes from its footprint: a 3×3 refinery gets `OnFireBig`, a 1×1 pillbox gets
`OnFireSmall`. Buildings catch at ConditionRed, units at 0.3 (unchanged).

The old single `fire` did **9 hp/s** — six times the original's fiercest burn, a number picked
by eye. Fire is a smoulder plus a visual state, not a second damage system: a full-health
refinery burning the whole ladder down loses about 13 hp of 950.

### IsSticky

`VehHit1/2/3` and `Frag1` carry `IsSticky` — "sticks to unit in square". `FBall1` and
`ArtExp1` do not. The distinction is physical: a spark struck **off** something rides that
thing, while a shell's fireball belongs to the ground where it went off. Without it a tank
crossing the map at seven units a second left its own impact sparks hanging in mid-air, which
was happening to every moving target in the game.

### Three things this shook out

1. **A dangling `ChainTo` crashed the whole match.** Deleting the old `fire` key left `boom`
   chaining to a name that no longer existed, and `_rtsAnimAI` threw reading `.loops` of
   `undefined` mid-tick. Forty targeted assertions passed; the first real match died on tick
   one. A typo in a data table now drops the effect instead of stopping the game, and a test
   asserts every `chain` in `RTS_ANIMS` resolves. A fireball now chains to `firesmall` — a
   ground fire, with nothing attached, so it does no damage.
2. **The flame was nearly drawn twice.** `_sprFire()` already existed for a building coming
   apart. `_sprFx` calling it again would have baked a second identical set of canvases that
   drift apart the moment either is retuned; `S.fx.fire = S.fire` in `_rtsSprites` shares the
   one set. Doing that required the effect renderer to stop forcing every frame **square** —
   a flame is 16×20, and squashing it to 16×16 is why sharing looked impossible at first.
   Every pre-existing effect set is square, so honouring aspect changed none of them.
3. **Flame size must come off footprint WIDTH, not cell count.** Scaled on `cells/9`, a 3×3
   got only 20% more flame than a 1×1 and the fire on a refinery read as a spark. It now
   matches the formula the dying-building flame already used, so a burning building and a
   dying one are the same fire at the same size.

### Verified

40 assertions in `burn.js`: the ladder's chain order, ADATA's damage rates and relative
sizes, only-big-scorches, ignition rung by footprint, no flame stacking on repeated ignition,
the walk down big → med → small → smoke → out, the burning flag clearing so a thing can catch
again, re-ignition topping a burnt-down fire back up, per-rung damage measured against
ADATA's 1.5 hp/s, a big fire finishing a 3 hp building **and a small one correctly failing
to**, ignition happening on its own below ConditionRed but not at half health, sticky sparks
riding a mover while fireballs and hits on buildings do not, a sticky spark neither damaging
its host nor putting its fire out, and the shared non-square flame set.

Regression: storage 34/34, save/load 31/31, verbs 26/26, mech 20/20. Ladder **296 / 220 /
174 s** — identical to the run before this change, which matters because burning structures is
new damage that did not exist.
