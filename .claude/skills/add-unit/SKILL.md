---
name: add-unit
description: Add a new unit or structure to command-conquer's roster - the rules entry, its weapon, a 3D model, the AI's purchase mix and teams, engine sound, crates - and every hand-kept list and test that has to agree. Use when the owner asks for a new unit, building, weapon or faction option, or when changing what an existing one is.
---

# Add a unit or a structure

Most of the game is driven by the tables. The sidebar, cameos, sprite sheet, 3D meshes and every
level of detail, the save format and the AI's gating all pick a new entry up with no edits.
What follows is everything that does **not**. Line numbers drift, so grep the names.

**First, the rule from `docs/roster.md`:** every entry adds a *verb*, something a player can do,
not another damage number. Each weapon exists to beat something specific. Say what it beats
before writing it.

## A unit

1. **The rules entry** goes in `RTS_UNITS` (`src/rules/units.js`; the field docs are at its top).
   - Copy a neighbour. Every unit sets `key name kind cost build hp speed turn r sight weapon armour desc`.
   - `kind` is `infantry`, `vehicle`, `air` or `ship`. There is no `naval` field.
     - An aircraft also sets `air:true, ammo, rearm, alt`.
     - A ship also sets `sea:true`.
   - Optional fields:
     - `needs:[cap]`, `side:'allied'|'soviet'` (filtered everywhere by `rtsBuildableBy`), `only`.
     - `weapon2`, `noMovingFire`, `standoff`.
     - `carries`, `takes`, `harvest`, `capture`, `heals`, `crush`, `cloak`, `detects`.
   - Sidebar order is table order.
2. **The weapon**: reuse one from `RTS_WEAPONS` (`src/rules/weapons.js`), or add one with
   `dmg range cool shot speed splash verses`.
   - `verses` must rate all five classes in `RTS_ARMOUR`. `unit/rules` checks it.
   - `aa:true` is the only way to hit aircraft.
   - `shot` (`tracer`, `shell`, `missile` or `rocket`) also picks the firing sound
     (`core/combat.js`): `tracer` plays `mg` above 7 dmg and `rifle` otherwise, `missile` plays
     `rocket`, and anything else plays `cannon` (`turretgun` from a structure). Only `missile`
     homes.
3. **The model** is a branch keyed on `key`:
   - Ground units go in `_sprUnitGround` (`src/sprites/unit-ground.js`).
   - Aircraft and ships go in `_sprUnitAirSea` (`src/sprites/unit-airsea.js`).
   - Without a branch you get a 4-box placeholder, which `e2e/r3dsprites` fails (it wants at
     least 40 faces and at most 20% team colour). `unit/geometry` wants at least 250 triangles.
   - Tracked hulls use `X.tracks(...)`. Smooth geometry, as everywhere.
   - Optional tables: `RTS_UNIT_SPAN` (its size on screen), `RTS_TURRETED` (`src/sprites/props.js`,
     a separate turret and the muzzle reach) and `RTS_AIR_PARTS` (`rotor`, `prop` or `burner`).
     A helicopter with two rotors lists their hubs in `rotors`. Its part `'rotor'` is ONE rotor
     at the origin, and `unit/motion` holds body + a rotor at each hub to the whole sprite.
   - An unarmed aircraft never rearms. A transport (`carries`) sets down while idle (see the
     `chinook` spec).
   - **Infantry** also needs `RTS_INF_KIT` colours, a branch in `_r3dSoldierModel`
     (`render3d/soldier3d.js`) and props in `crawl3d.js`. `unit/soldier` holds 3D against sprite
     height to within 20%.
   - Look at it with the `visual-check` skill, at phone zoom.
4. **The AI** never builds a unit that is not in `RTS_AI.mix.<kind>` (`src/rules/ai.js`):
   `{key, at, w}`.
   - The weights are load-bearing. Best-first buying once produced 461 grenadiers.
   - Its `needs` must be reachable through `buildOrder` (`unit/aiplan`).
   - **Aircraft and ships** must also be fielded by a team in `RTS_TEAM_TYPES`
     (`src/rules/teams.js`), or `unit/aiplan` fails.
   - Keep plan-dependent units (an engineer, a thief) out unless something gates them.
5. **Sound**:
   - The engine loop is picked in `src/rts.ambience.js`: tracked (`RTS_CRUSHERS`, `apc`, `mcv`)
     plays `tracks`, other ground units play `wheels`, ships play `boat`.
   - An aircraft plays `rotor` if its `RTS_AIR_PARTS` entry has `rotor`, otherwise `jet`
     (`_rtsAmbRotor`).
   - Use the `sound-lab` skill for any new effect.
6. **Optional extras**:
   - `RTS_CRATE_UNITS` (`src/rules/crates.js`): an armed, harvesting or deployable unit only.
   - The opening forces (`src/core/base.js`).
   - `RTS_SP_MOVE` (`src/core/spatial.js`): `unit/spatial` needs `max speed*0.1 + max r <= 8`, so
     a very fast or very large unit breaks the spatial grid's assumption.

## A structure

1. **The rules entry** goes in `RTS_STRUCTS` (`src/rules/structures.js`).
   - Required: `key name w h cost build hp power sight armour desc`. `cost` must be above 0;
     only the yard is free.
   - Optional fields:
     - `needs`, `provides:[cap]`, `side`.
     - `produces`, `freeUnit`, `rearm`.
     - `weapon`, `needsPower`, `deathBlast`.
     - `storage`, `shore`, `wall`, `radar`, `repairs`, `super:{...}`.
2. **The model** is a branch in one of `_sprBldBase`, `_sprBldTech`, `_sprBldWar` or `_sprBldSuper`
   (`src/sprites/bld-*.js`).
   - **There is no fallback**: a missing branch makes the building invisible, and the geometry
     floor skips empty models.
   - `e2e/r3dsprites` holds the sprite to its `w x h` footprint.
   - Optional liveliness: `alive3d.js` (turning radar, smoke, beacons).
3. **The AI**: if the structure goes in `buildOrder`, it **must** also have a `ratio` and a `limit`
   in `src/rules/ai.js`. `unit/rules` checks this both ways.
   - Never write `key === '<defence>'` in `core/ai.js` or `basezone.js`. A source scan fails it.
   - Each side needs at least two buildable defences in the order.
4. **Production** has hand-kept producers in `src/core/production.js`:
   - The queue gate is `barracks` / `factory` / `navalyard` / `subpen`.
   - Units spawn at `barracks` or `factory`. Aircraft spawn over a `produces:'air'` pad
     (`_rtsAirPadFor`): one their `needs` names first, then a free one.
   - A new `produces:` building for any other category is counted for the build rate, but it is
     not a queue gate or a spawn point until these lines learn about it.

## Prove it

```bash
python3 build.py
NODE_PATH=/opt/node22/lib/node_modules /opt/node22/bin/node test/run.js --no-build --quiet unit
NODE_PATH=/opt/node22/lib/node_modules /opt/node22/bin/node test/run.js --no-build e2e r3dsprites cameo
```

- `unit/rules` holds the roster to account:
  - unique keys;
  - a tab and a producer for every kind;
  - every `needs` reachable per faction;
  - every weapon resolving and rating every armour class;
  - sane costs;
  - the AI tables agreeing;
  - **equal longest land reach on both sides** (a one-sided long-range land weapon breaks it);
  - cloak and detector pairs.
- `unit/save` expects the save version to change, because new entries reject old saves on purpose.
- Write a spec for the unit's **verb** (the `write-test` skill). Stage the fight it exists to win
  and assert that it wins it. `unit/aitactics` and `unit/airspace` show the shape.
- Run the ladder before and after with the `balance` skill: `ladder.js --ref=main`. A unit the
  idle player never meets needs its own harness.
- Ship with the `ship` skill. Tell the owner what the new verb is and how to get it (what it
  needs, and which side builds it).

`docs/roster.md` still names the old single files (`rts.rules.js`, `rts.sprites.js`). The tables
now live in `src/rules/` and the models in `src/sprites/`.
