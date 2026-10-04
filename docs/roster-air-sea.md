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
