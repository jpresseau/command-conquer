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
  (`e.chute`, core/units.js), drawn falling (unit3d.js) under a canopy (air3d.js). He lands with
  no order unless one is given on the way down, which he then follows (the jump clears what he
  had; the canopy keeps what he is given).
- Every way out of the plane is a jump: the aimed drop, the U key and the opponent's timed-out
  drop all go through `_rtsUnloadNow` → `_rtsParaJumped`. A loaded, unarmed transport
  right-clicked onto an enemy is sent to drop there (`_rtsOrderUnloadAt`), not to hover over it
  (ui/select.js) - the Sky Crane and the Landing Craft too - and the radar's right-click reads
  the same way (ui/input.js `_rtsRadarOrder`), at an enemy or at bare land.
- The opponent buys one once the player has two armed buildings and its own base has four
  (`_rtsAIDefended`), crews it with four squads (rocket first), drops them just past the
  player's least-guarded power plant on the side away from the player's yard, and they go for it.
- Propellers: `RTS_AIR_PARTS.<key>.props` lists one per engine (air3d.js `_r3dPropModel`); the
  bomber's are derived from its engine table (`RTS_BOMBER_ENGINES`), and unit/air holds every
  entry to the disc the sprite's own model has. On the size ladder (`RTS_UNIT_SPAN`) the plane
  out-spans both fighters, as its high straight wing is meant to; only the bomber is wider.

`unit/paradrop` (21 assertions, 17 mutants killed over three rounds).

## The Recon Drone — watching a place

The Compact's long-winged pusher (`drone`), behind a Helipad (`core/drone.js`). Cheap (500),
unarmed and thin-skinned:
- Where it stops, it does not park: `_rtsDroneTick` sets `e.orbit` there and keeps it circling
  `RTS_DRONE.r` (3) cells round it, with `order 'orbit'`. A new move order clears the orbit, and it
  circles wherever it stops next. The centre is pulled in from the map's edge by the radius
  (`_rtsDroneCentre`): the sky ends at the edge (`_rtsAirSpread`), and a circle that crossed it
  had a point the drone could never reach, so it sat pinned there.
- It `spots` (core/spotter.js): fog, fog banks and sandstorms never cut its sight, every gun of its
  side finds what it sees at full reach, and a Jammer hides nothing from it.
- **Sent onto a unit it shadows it** (`_rtsDroneOn`, `e.orbitOn`): the circle's centre follows the
  unit once it is `RTS_DRONE.follow` (2) cells off - one of yours, or an enemy's. It lets go when
  the unit dies or boards, when an enemy unit is no longer seen by the player (`_rtsEntSeen`: a
  diving submarine), and at any new order.
- The opponent buys one when it is half-blind (`_rtsAIHalfBlind`: fog, a sandstorm, or a Jammer
  of the player's on the field) and defended, and keeps it circling over the centre of its
  largest team on the march (`_rtsAIDroneTick`). The Spotter AI leaves it alone (`_rtsAISpotTick`
  skips `orbits`), or the two pulled it between a long gun and the team every two seconds.

`unit/drone` (16 assertions, 9 of 10 mutants killed; the one survivor dropped `side:'allied'`,
which changes nothing, because the Dominion has no Helipad).

## The Heavy Bomber — the carpet

Both armies' four-engined bomber (`bomber`), behind either air pad: the Helipad and the Airfield
both `provides:['airpad']` (`core/bomber.js`):
- Sent at anything on the ground, it lays `RTS_BOMB.n` (8) bombs `RTS_BOMB.gap` (1) cell apart in
  one pass, in a straight line along its course and centred on the aim (`_rtsBombRun`). Each bomb
  is in `G.bombs`, falls for `RTS_BOMB.fall` (0.7 s), and bursts through `_rtsSplash` with the
  bomber as its source, which hurts whoever is under it, either side, but not the bomber turning
  for home over its own tail. A bomber already past the start of the line lays only what is still
  ahead of it.
- **The run is the order's** (`run.tgt`): until the first bomb is away the line follows its
  target, so a tank driving off is bombed where it is; a target that dies under the line does not
  stop the line. A bay that has opened is spent: called off or re-aimed after the first bomb, the
  round is gone and the bomber goes home; before the first bomb it turns away with its round, or
  lays the line on the new target instead. A run or orbit goal is clamped inside the air clamp,
  and a line that runs off the map ends there.
- **Or at a place.** Attack-move on bare ground (`A` + right-click; the AMOVE button and a hold on
  a phone) is order `'bomb'` with the aim in `e.bombAt`, and the line is laid across that spot as
  across a target that never moves (`_rtsBomberTick`, `_rtsBombKey`). A plain right-click still
  only moves it, and the cursor shows the reticle only for bombers alone on attack-move.
- **An order it cannot fly yet waits** (`_rtsBomberSend`, `e.bombNext`). Loading on its pad, going
  home empty or grounded by a storm, `_rtsAirTick` owns the aircraft, set its order to `'rearm'`
  and cleared it when loaded, so a target given then was dropped without a word. Now the player is
  told it flies once loaded, and it does, at the first tick it is free. A player's re-aim after the
  first bomb lays the rest of the line and keeps the new aim for after the reload. Any later order
  from the player, or hold, drops the waiting one; the opponent never re-aims mid-run.
- **It bombs only what it is sent at.** `carpets` units never acquire a target of their own (idle,
  attack-moving or holding, core/units.js), never retaliate (`_rtsCanRetaliate`), and are never
  pooled as base defenders (`_rtsBaseIsAttacked`): a loaded bomber on its pad does not carpet its
  own base at the first raider past it.
- Its `carpet` weapon is never fired as a shot (`_rtsFire` returns on `w.carpet`). It only lets
  the bomber be sent at ground targets. The run spends its one round (`ammo:1`), and
  `_rtsAirTick` sends it home to load again (`rearm:12`).
- Falling bombs are drawn as dark streaks blended like rain (`_r3dFxBombs`, fxemit3d.js). A
  `STREAK` is additive, so a dark one would draw nothing. A bomb's `y` is the sim's altitude, and
  it is drawn at the height the aircraft is (`RTS_AIR_ALT_K`, core/airspace.js - the one factor
  camera.js, unit3d.js and the painters share); drawn raw, the bombs appeared out of empty sky
  three times higher than the bomber. The sprite fallback (render/fx.js, for a device that cannot
  shade) draws them as dark dashes the same way.
- The opponent buys one, after its Paradrop Plane, once the player has dug in and its own base
  is defended - and never onto a pad another aircraft holds: the support purchases keep the
  roll's caps, one aircraft per pad and `fleetPerYard` hulls per yard (`_rtsAIAirRoom`,
  `_rtsAIFleetRoom` in core/ai.js), and queue on their own line. Whenever the bomber is loaded,
  it is sent at the player's building with the most other buildings within `RTS_BOMB.crowd` (4)
  cells (`_rtsAIBombTarget`); walls are not counted, or a wall line outranks every real corner of
  the base.
- A burst is an attack: the buildings under it are told (`_rtsAttacked`, `_rtsBaseIsAttacked`,
  the `attacked` trigger), as a shell tells them, since a splash attributes itself to nobody; and
  the difficulty's FirepowerBias applies. A bomb carries its bomber by id, not by reference.

`unit/bomber` (29 assertions, 25 mutants killed over three rounds), and `unit/strike` for the orders
as a player gives them: the ground strike, the waiting order, a re-aim mid-run, the drone's shadow
and the cursor (15 assertions, every mutant killed).

## The Flak Cruiser — escort at sea

Both armies' anti-aircraft hull (`flakship`), from either yard plus a Radar Post
(`core/flakship.js`; model in `sprites/unit-hulls.js`, the start of the second wave of ships):
- `shipflak` is `aa` and `aaOnly`: a fleet finally has something that can touch a gunship, and
  the cruiser cannot hit a ship or the shore.
- `escorts`: left idle, it keeps station on the nearest ship of its own side within
  `RTS_ESCORT.reach` (14) cells, never on another escort. When it falls more than
  `RTS_ESCORT.close` (3) cells behind, it closes up on an attack-move, so it fires at anything
  flying over on the way. The station order is told from a player's by value (`e.esc` and
  `e.goal` at one point - a save writes them as two objects), so a move the player gives always
  comes first, and the station is taken up again only once it is idle.
- The opponent buys one through the ship mix with `vsAir:2`, as it does the Flak Track: none
  while the sky is empty, so the roll is unchanged in a game with no aircraft.

`unit/flakship` (12 assertions, 8 mutants killed). The maps' seas are channels at most five cells
wide, so the staging finds a fourteen-cell stretch of one.

## The Mine Boat — a channel denied

Both armies' mine layer at sea (`mineboat`, `sea` + `mines:6`), from either yard
(`core/seamines.js`). It lays the Mine Layer's own mines (core/mines.js):
- `_rtsLayMine` lays on water only for a `sea` layer and on ground only for a land one, never on
  a bridge's deck, and marks the mine `sea`. A sea mine goes off under what floats - a hull in
  the `sea` or `shallow` domain, or a hovercraft - and a land mine under what walks or drives (the
  hovercraft again). A tank crossing a flat the tide has dried is not afloat over the sea mine
  under it, and does not set it off. Aircraft pass over everything.
- It restocks alongside its own shipyard (`RTS_SEAMINE.dock`, 2.5 cells), one mine every
  `RTS_MINE.restock` seconds.
- Sonar finds sea mines: a hull with `detects` (the Destroyer) marks every enemy mine in the
  water within its reach `seen`. A Mine Sweeper on the shore sees the ones in its reach but
  never drives after one in the water. `G.mineHits` records land mines only, so the opponent's
  sweeper is never sent after a sea mine.
- The opponent buys one once the player has a shipyard. It mines the sea route between the two
  yards, `RTS_SEAMINE.from` to `.to` (4 to 12) cells out from its own, with a cell either side
  (`_rtsAISeaMineSpots`). The plan is made in the `shallow` domain, water at any tide, so a plan
  made at low water, when the channels are dry to a hull, is the same plan as one made at high;
  a plan that came back empty is asked again after `RTS_SEAMINE_RECHECK` (30 s) rather than kept
  for the match. The land tick skips sea layers (`_rtsSeaLayer`). Out of mines, the player is
  told to bring the boat alongside the yard.

`unit/seamines` (19 assertions, 9 mutants killed). One mutant survived and is equivalent: it
lets sonar mark its own side's mines, which that side already sees.

## The Repair Tender — mending at sea

Both armies' repair ship (`tender`), from either yard. It is the Repair Truck with
`healKind:'ship'`, and `core/repairtruck.js` holds both:
- The heal aura (core/units.js `heals`) mends every friendly ship within 3 cells. It does not
  mend vehicles, and the Repair Truck does not mend ships.
- Left idle, it sails to the nearest damaged ship within `RTS_FIX.seek` cells (`_rtsFixWants`
  matches on the unit's own `healKind`), and only one it can get its aura onto: a Monitor on a
  flat at low water, four cells from any water a Tender can sail, is passed over for a gunboat
  it can reach. The truck has the same rule in its own domain.
- The opponent buys one once it has `RTS_FIX.fleet` (3) armed hulls
  (`_rtsAIFieldVehicles('ship')`). It keeps the tender a few cells behind its largest team of
  ships on the march (`_rtsAIFixBehind(kind)`), as it keeps the truck behind its tanks.

`unit/tender` (10 assertions, 5 mutants killed). The sixth mutant survived because the line it
removed, which snapped the AI's goal to water, was redundant: ship pathing already handles a goal
on land. The line was taken out.

## The River Monitor — the low-water bombardment

The Dominion's flat-bottomed gun barge (`monitor`, `shallow:true`), from its Sub Pen
(`core/monitor.js`):
- It moves in its own domain, `'shallow'` (core/grid.js `_rtsDomainOf` / `_rtsBlocked`): any
  water cell is open to it at any tide, so it can sit on a dried flat that is ground to every
  other ship. It is a ship, so the tide never swamps it, and it cannot go ashore. Everything that
  treats `'sea'` as "afloat" treats `'shallow'` the same way: the path's seabed height
  (`_rtsPath`), stand height (`_rtsStandHeight`), and crowding with the other hulls (`move.js`).
- `monitorgun`: a 24-reach heavy gun, strong against buildings. The turret turns to the aim: it
  is in `RTS_TURRETED`, and its model builds the turret, ring and barrels as the 'turret' part on
  the mount `RTS_TURRET_AT.monitor` names (unit-hulls.js). Building that found the gun ships
  were drawn TWICE - their models ignored the part, so hull and "turret" were each the whole
  ship, the second swung to the aim. Each now builds one mount at the origin as its turret part,
  drawn on each ring (`_r3dTurretAt`, unit3d.js; the husk too), fore and aft on the big two.
- On a flat the tide has dried it sits on the sand: no swell, no lean, no wake (`_r3dWetAt`,
  fxwake3d.js) - the water sheet is cut away there, and a hull heaving on an invisible sea sank
  two thirds of its height into the ground at every trough.
- The opponent buys one once its own base is defended and the player has a building the Monitor
  can reach from water (`_rtsAIMonitorTarget`). Whenever it is idle, it sends the Monitor at the
  one nearest to it.

`unit/monitor` (17 assertions, 10 of 11 mutants killed; the survivor drops the circular trim on
the reach check, which the square search radius before it already nearly makes), `unit/turrets`
(the two parts, the mounts, the husk).

## The navy sails together — the Ebb team

How the opponent uses the new ships as a fleet rather than one at a time:
- **The Monitor keeps the tide's clock** (`_rtsAIMonitorTick`): at low water (`_rtsTideLow`, the
  first flats dry) it is sent at the nearest building it can shell from the water; at high water
  it breaks off and goes home to its yard. A Monitor in a team is left to the team.
- **The Ebb team** (`rules/teams.js`, Dominion): a Monitor and two subs, quarry `shore`,
  `suicide:true` so the lag rule never holds the subs for a Monitor that has gone where they
  cannot follow. `tide:true` gates it on `_rtsAIEbb`: the tide ebbing (`_rtsTideEbbing`: falling,
  with the outermost flats still wet, so there is a lane down the channel for the escort) and
  every member afloat and free right now, so a team raised forms at once. The Tender follows it
  as the largest team of ships on the march.
- **`shore`** (`_rtsQuarryMatch`): a building with a cell of the shallow domain within a cell of
  the Monitor's reach (`_rtsShoreReach`).
- **The Flak Cruiser** keeps station on the ship under way (sailing, or in a marching team) over
  one parked nearer, so the umbrella leaves harbour with the fleet.

Two pathing rules changed for hulls (`core/grid.js`), both found by the Ebb team's march:
- A hull's route is never string-pulled. It used to be pulled against the land domain, on the
  premise that a segment starting on water never clears; a hull standing on a flat that had
  dried started its segment on open ground, and the Monitor's route up the channel collapsed
  onto a headland.
- A hull's blocked goal is walked out `RTS_SEA_GOAL_RINGS` (12) rings to water, not six: at low
  water the water nearest a building ashore is past the flats as well.

And `_rtsOrderAttack`'s fallback for a target the unit cannot engage (drive to it) is issued once,
and retried after `RTS_REFUSED_RETRY` (2 s) when no route was found, not once a tick: a team
re-issues its attack to every member every tick, and for a sub sent at a battery ashore each
refusal was an A* over the whole sea.

`unit/ebb` (17 assertions), `unit/monitor` (+2), `unit/flakship` (+1); `unit/aiplan` now reads the
support purchases as a second shopping list, each bought one at a time.

## On the screen — read off the picture

`e2e/unitfx` reads what the new units put on the screen, each the same moment drawn twice, with
the thing and without it, as `e2e/skycrane` reads the crane's slung load. All three are staged on
the real simulation and the staging is asserted first:
- **The carpet.** A Heavy Bomber sent at an enemy building, stepped until two bombs fall at once
  (a bomb falls 0.7 s and the next leaves about half a second later, so two is the most); the spec
  sums a small square round each (`R3.bombsOff`). **The picture found the bombs illegible:** the
  streak alone, thin as rain, came to about 130 faint pixels round two bombs, a carpet no one could
  see falling. Each bomb now has a dark body at the foot of its streak (`R3D_BOMB_BODY`,
  fxemit3d.js), about 230 pixels a bomb, and the check holds it there (over 250 for two).
- **The canopies.** A Paradrop Plane's men coming down: the square round a man under his canopy,
  centred on his drawn height once he has been painted (`R3.canopyOff`).
- **The flats.** A River Monitor on a flat the tide has dried, at low water: drawn and not
  (`R3.hideId`, one unit left out of the picture, render3d/scene3d.js). It sits on the sand, not
  under it.

Four drawing mutants were killed, each on its own assertion: no bomb streak, no bomb body, no
canopy, and a Monitor drawn four units under the sand.
