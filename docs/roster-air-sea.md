# The second wave: aircraft and boats

> Reference, continued from `docs/roster.md` (which reached the 500-line cap). The same rule
> holds here: every entry adds a verb, something a player can do, not a bigger number.

## The Paradrop Plane — the drop

The Dominion's high-winged twin (`paraplane`), behind an Airfield (`core/paradrop.js`). The
Skylift has to set down to put a squad off; this plane never does (`_rtsAirSettle` asks
`paradrops`):
- Squads board it as it waits in the air. Sent anywhere, it puts them down within a few cells
  of the drop zone without landing, and flies home to the nearest air pad.
- Each man comes down under a canopy for `RTS_PARA.fall` (1.2 s), unable to move or fire
  (`e.chute`, core/units.js), drawn falling (unit3d.js) under a canopy (air3d.js).
- The opponent buys one once the player has two armed buildings and its own base has four
  (`_rtsAIDefended`), crews it with four squads (rocket first), drops them just past the
  player's least-guarded power plant on the side away from the player's yard, and they go for it.
- Propellers: `RTS_AIR_PARTS.<key>.props` lists one per engine (air3d.js `_r3dPropModel`).

`unit/paradrop` (14 assertions, 10 mutants killed).

## The Recon Drone — watching a place

The Compact's long-winged pusher (`drone`), behind a Helipad (`core/drone.js`). Cheap (500),
unarmed and thin-skinned:
- Where it stops, it does not park: `_rtsDroneTick` sets `e.orbit` there and keeps it circling
  `RTS_DRONE.r` (3) cells round it, with `order 'orbit'`. A new move order clears the orbit, and it
  circles wherever it stops next.
- It `spots` (core/spotter.js): fog, fog banks and sandstorms never cut its sight, every gun of its
  side finds what it sees at full reach, and a Jammer hides nothing from it.
- The opponent buys one when it is half-blind (`_rtsAIHalfBlind`: fog, a sandstorm, or a Jammer
  of the player's on the field) and defended, and keeps it circling over the centre of its
  largest team on the march (`_rtsAIDroneTick`).

`unit/drone` (14 assertions, 7 of 8 mutants killed; the survivor drops `side:'allied'`, which
changes nothing, because the Dominion has no Helipad).

## The Heavy Bomber — the carpet

Both armies' four-engined bomber (`bomber`), behind either air pad: the Helipad and the Airfield
both `provides:['airpad']` (`core/bomber.js`):
- Sent at anything on the ground, it lays `RTS_BOMB.n` (8) bombs `RTS_BOMB.gap` (1) cell apart in
  one pass, in a straight line along its course and centred on the aim (`_rtsBombRun`). Each bomb
  is in `G.bombs`, falls for `RTS_BOMB.fall` (0.7 s), and bursts through `_rtsSplash`, which
  hurts whoever is under it, either side. A bomber already past the start of the line lays only
  what is still ahead of it. A new order mid-run calls the run off.
- Its `carpet` weapon is never fired as a shot (`_rtsFire` returns on `w.carpet`). It only lets
  the bomber be sent at ground targets. The run spends its one round (`ammo:1`), and
  `_rtsAirTick` sends it home to load again (`rearm:12`).
- Falling bombs are drawn as dark streaks blended like rain (`_r3dFxBombs`, fxemit3d.js). A
  `STREAK` is additive, so a dark one would draw nothing.
- The opponent buys one, after its Paradrop Plane, once the player has dug in and its own base
  is defended. Whenever the bomber is loaded, it is sent at the player's building with the most
  other buildings within `RTS_BOMB.crowd` (4) cells (`_rtsAIBombTarget`).

`unit/bomber` (18 assertions, 11 mutants killed).

## The Flak Cruiser — escort at sea

Both armies' anti-aircraft hull (`flakship`), from either yard plus a Radar Post
(`core/flakship.js`; model in `sprites/unit-hulls.js`, the start of the second wave of ships):
- `shipflak` is `aa` and `aaOnly`: a fleet finally has something that can touch a gunship, and
  the cruiser cannot hit a ship or the shore.
- `escorts`: left idle, it keeps station on the nearest ship of its own side within
  `RTS_ESCORT.reach` (14) cells, never on another escort. When it falls more than
  `RTS_ESCORT.close` (3) cells behind, it closes up on an attack-move, so it fires at anything
  flying over on the way. The station order is marked `e.esc === e.goal`, so a move the player
  gives always comes first, and the station is taken up again only once it is idle.
- The opponent buys one through the ship mix with `vsAir:2`, as it does the Flak Track: none
  while the sky is empty, so the roll is unchanged in a game with no aircraft.

`unit/flakship` (12 assertions, 8 mutants killed). The maps' seas are channels at most five cells
wide, so the staging finds a fourteen-cell stretch of one.

## The Mine Boat — a channel denied

Both armies' mine layer at sea (`mineboat`, `sea` + `mines:6`), from either yard
(`core/seamines.js`). It lays the Mine Layer's own mines (core/mines.js):
- `_rtsLayMine` lays on water only for a `sea` layer and on ground only for a land one. A sea
  mine goes off under anything afloat on its cell, ships and hovercraft alike. Aircraft pass
  over it.
- It restocks alongside its own shipyard (`RTS_SEAMINE.dock`, 2.5 cells), one mine every
  `RTS_MINE.restock` seconds.
- Sonar finds sea mines: a hull with `detects` (the Destroyer) marks every enemy mine in the
  water within its reach `seen`. A Mine Sweeper on the shore sees the ones in its reach but
  never drives after one in the water. `G.mineHits` records land mines only, so the opponent's
  sweeper is never sent after a sea mine.
- The opponent buys one once the player has a shipyard. It mines the sea route between the two
  yards, `RTS_SEAMINE.from` to `.to` (4 to 12) cells out from its own, with a cell either side
  (`_rtsAISeaMineSpots`). The land tick skips sea layers (`_rtsSeaLayer`).

`unit/seamines` (19 assertions, 9 mutants killed). One mutant survived and is equivalent: it
lets sonar mark its own side's mines, which that side already sees.

## The Repair Tender — mending at sea

Both armies' repair ship (`tender`), from either yard. It is the Repair Truck with
`healKind:'ship'`, and `core/repairtruck.js` holds both:
- The heal aura (core/units.js `heals`) mends every friendly ship within 3 cells. It does not
  mend vehicles, and the Repair Truck does not mend ships.
- Left idle, it sails to the nearest damaged ship within `RTS_FIX.seek` cells (`_rtsFixWants`
  matches on the unit's own `healKind`).
- The opponent buys one once it has `RTS_FIX.fleet` (3) armed hulls
  (`_rtsAIFieldVehicles('ship')`). It keeps the tender a few cells behind its largest team of
  ships on the march (`_rtsAIFixBehind(kind)`), as it keeps the truck behind its tanks.

`unit/tender` (10 assertions, 5 mutants killed). The sixth mutant survived because the line it
removed, which snapped the AI's goal to water, was redundant: ship pathing already handles a goal
on land. The line was taken out.
