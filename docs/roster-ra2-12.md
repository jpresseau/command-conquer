# Red Alert 2 in Breachwater — batch 12: the opponent uses the new roster

Batches 1 to 11 (`docs/roster-ra2.md`) put the Red Alert 2 roster in the game for the player. Batch 12
is the opponent using it, each part measured in self-play (`tools/selfplay.js`, `docs/measuring.md`)
and kept only if it does not make the opponent worse.

## Batch 12a: the opponent uses the safe additions (`rules/ai.js`)

The first part of batch 12: the opponent builds and buys what needs no plan of its own, measured in
self-play (`tools/selfplay.js`, eight seeds each way, twelve minutes).

- **Built:** the Long Gun, among the defences after the rocket pit (by eighteen minutes the Compact
  stands two), and the Assay Plant, the Foundry and the Clone Vats, one of each, after the premium
  towers. Straight after the Research Lab they brought the seats closest to even (below), but there
  they cost the Dominion its Arc Tower in `e2e/basedef`, as the Relay Hub and the Echo Sensor did
  before them; after the towers, the opponent keeps adding defences to its ratios and a match of
  eighteen minutes does not reach them yet. A rule letting a rich house (2,500 credits in the bank)
  buy them out of turn was tried and measured, and not kept: it built them by five minutes, but
  cost the Dominion its Arc Tower in `e2e/basedef` again, broke `unit/endgame`'s three-minute
  look, and left the seats where they were (the Compact's share 0.604). Money the opponent
  banks is money its defences and army need sooner.
- **Bought:** the Tank Hunter and the Multi-role Carrier (empty: it fires its own missiles), the
  Marksman, and the Flak Trooper only while the player flies (`vsAir`, as the Flak Track).

Measured against the same seeds before it, as shipped: the Tank Hunter dealt 0.93 of its price in
damage, the Carrier 0.81, the Flak Trooper 1.29 and the Marksman 0.53, against the Battle Tank's
1.02, and the Compact's share of everything standing at the horizon went from 0.60 to 0.59. With the
economy straight after the lab that share fell to 0.53 - the Dominion's Foundry and Clone Vats are
worth more the earlier they stand - which is the case for the rule above.

Left out, measured: the new ships (the Sea Hornet, the Dolphin and the Kraken were bought and dealt
nothing, as most hulls do on these maps) and, until batch 12d below, the Falcon (0.32 of its price,
with no team type to fly one: `unit/aiplan`).

`unit/endgame` said the opponent's army "grows" in ninety seconds with ore; that is its buying less
what the other seat kills, and with the Compact's new units it went 27 to 23 while the opponent
bought 26 (24 before). It now asserts the buying. The rest of batch 12 is the units that need a plan:
the explosives, the Blight Trooper, the aircraft, the deep, Engineers at tech buildings, and the
Marshal, the Leech Drone, loading the Carrier and the Gate.

## Batch 12b: the opponent takes the tech buildings (`core/capturead.js`, `core/missions.js`)

The opponent's capture search (`_rtsAICaptureTarget`) looks at a tech building no one holds as well
as at the player's buildings, through the same rule the player's Engineers use (`_rtsClaimable`).
A tech building costs nothing, so its worth is its own (`RTS_CAP_TECH_WORTH`: the Derrick and the
Airstrip 2,000, the hospital and the shop 1,200), discounted by the walk as any capture is. The
Snatch team's capture leg ends on the target being claimable no longer, rather than on its not
being hostile, which a tech building no one holds never is. Its escort is ordered onto the prize
as before, and only walks there: `_rtsFire` shoots nothing that is not hostile.

Measured on three seeds, both seats played by the computer, TOWNS + TECH, twelve minutes: the
Derrick was taken by 240 s on all three and the Airstrip by 290 to 465 s; on main nobody took
either. `unit/tech` (16) holds it.

Also measured in batch 12 and not kept: **the opponent crewing its Multi-role Carriers.** An idle
empty Carrier at home was sent the nearest idle soldier, against the 0.81 of its price it deals
empty (same eight seeds): crewed with riflemen it dealt 0.48, with Rocket Squads and Marksmen 0.71,
with Marksmen alone 0.80. A passenger changes the Carrier's role, not its strength: the Rocket
Squad's rocket (13, range 20) is weaker than the Carrier's own missile (20, range 22), and a
rifleman's machine gun weaker still. Crewing pays only if a passenger makes it stronger, and that
is a change to the rules for the player too.

## Batch 12c: the Marshal, and not the Leech Drone (`rules/ai.js`, `rules/roster11.js`, `tools/selfplay.js`)

Measured the same way (sixteen battles, eight seeds, both seats the computer), each paired seed by seed against the same
battles without it:

- **The Leech Drone's bite reached no vehicle.** Range is centre to centre, and a drone pressed
  against a hull stands at the two radii apart: 1 + 1.6 at the least, 1 + 2.3 at the most, all past
  its 2.5. Sent at a tank it stopped against its side and was shot; against one held still it
  squeezed in after 9 s. Its reach is now 4, past the largest hull, and five drones three tiles from
  three tanks are inside all three in a second. `unit/roster11b` holds it from both ends.
- **The Marshal was being measured as dealing nothing.** He lased and his jets bombed (one strike took
  a Construction Yard from 1400 to 524), but a bomb's blast damages with no source, so the self-play
  ledger credited it to nobody, as it did every splash. It now credits a splash to its shooter, a
  bomb to its bomber and a strike to the Marshal who called it (`docs/measuring.md`); the numbers here
  and in `docs/roster-ra2.md` from before batch 12c undercount every unit with splash.
- Bought from 2600 (`{ key:'marshal', at:2600, w:1 }`), the Marshal returned 0.55 of his price and
  moved the Dominion's share by +0.026 ± 0.021: kept. The Leech Drone with him, bought from 1300 in the
  vehicle mix, ran ahead of the army into the defences, 139 bought for 0.11 of their price back, and
  moved it by -0.045 ± 0.061: not kept. `unit/roster11b` holds both, the Marshal as an A/B on his mix
  entry.
- **The Marshal broke `e2e/basedef`, and so would any entry: the unit lines spent the plan's money.**
  With him in the mix the Dominion opponent built 2 defences on one side and never asked for its
  Tesla Coil, at a threshold of 2600, 3600 or 5000 alike. It was not his price. Wanting a refinery
  (spare 2600 on hard), the opponent reached 2601 and bought a submarine, a MiG and a V3 at once,
  again and again for two minutes: `_rtsAIUnits` was asked once whether the bank was over the spare
  and then bought on every line, and a job is paid as it builds, so the bank had not moved when the
  next line was asked. Each line now counts what the lines before it committed in the pass
  (`unit/aispend`). With it the same match asks for the Coil with 5 defences over all four sides,
  and 7 over four without the Marshal. Measured with the Marshal, paired against the 16 battles
  before both: the Dominion's share +0.017 ± 0.043, both armies spending 4-5% more, the Marshal 0.80
  of his price. The fingerprint and self-play fixtures were re-recorded for it.
- **The new trajectory showed up an ordering bug in the sync.** `unit/aitactics` saw the front and
  the flank go in a tick apart (278.67 s and 278.73 s). The team arriving last at its staging point
  went in at once, and a partner already waiting there noticed only on its own next update, a tick
  late whenever it had been updated earlier in the tick. Now a team going in takes every partner
  waiting at its sync with it (`core/missions.js`; `unit/aitactics` stages that order). The self-play
  numbers above were measured before this one-tick change.
- **Two specs were measuring the wrong thing.** `e2e/basedef` ran its Coil half on past 480 s for
  the house of the player's army, not the opponent's, so the Soviet opponent stopped at 480 s and
  this plan, which asks for its Coil at 508 s, read as never asking; it now keys on the opponent's
  house. `e2e/basespace`'s before-picture asked for ten men walled in on seed 9004 with the check
  off, and the Allied opponent now walls in nine (and the Soviet nineteen): it asks for five, which
  is still a pocket the measure sees, against none with the check on.

## Batch 12d: the Falcon and the Leviathan (`rules/ai.js`, `rules/teams.js`, `rules/weapons.js`)

Each is flown by a team of one aimed at buildings, `Raid` and `Zeppelin`, for the reasons the
other one-plane teams give in `rules/teams.js`: a team marches only at full strength, and planes
are capped at one a pad. Bought from 2400 (Falcon) and 3000 (Leviathan), weight 2.

- **The Leviathan hovered beside what it bombed.** A building's range is to its edge, and its bomb
  falls from where it is: at a reach of 3 every burst landed off the building at two-thirds strength,
  and a Refinery it bombed for a minute stood at 700 of 950, repaired as fast as it was hit, until the
  defences brought the airship down. Its reach is now 1: it floats over the building, and the same
  Refinery is gone in 40 s. `unit/aloft` holds the first bomb's weight (179 of 200; 133 at reach 3).
- Measured on the 16 battles, each change paired against them alone:

  | change | share for its army | its value | |
  |---|---|---|---|
  | Leviathan, reach 3 | +0.035 ± 0.018 | 1.59, 9 bought | |
  | Leviathan, reach 1 | +0.023 ± 0.018 | 1.07, 7 bought | |
  | Falcon from 2400, weight 2 | -0.020 ± 0.016 | 2.62, 17 bought | Helis 42 to 30 |
  | Falcon from 3200, weight 1 | -0.020 ± 0.017 | 5.23, 2 bought | the same shift with 2 Falcons |
  | both, as shipped | Dominion +0.020 ± 0.022 | Falcon 2.31 (17); Leviathan 0.00 (3) | |

  The Falcon takes pad slots from the Heli, which is cheaper and returns about as much (2.86), but
  the second row says the -0.02 is what any change to the rolls does to these battles: two Falcons
  in sixteen matches moved it just as far. So it is kept, as neutral to the Compact and the best
  value in its air force.
- **The Leviathan's value is lumpy.** Speed 5 and 1500 hp: in most battles it is shot down on its way
  in (1993 of 2000 taken) before it drops much, and one battle in sixteen (seed 9002) carries most of
  what it deals, 13,000 to 20,000. It did not make the Dominion worse in any run, so it flies; an
  escort for it would be the next thing to measure.
- `unit/aloft` holds the rest: each is in the mix with a team of one; a rich Dominion opponent with
  an Airfield and a Lab buys a Leviathan and its team sends it at the player's base, and without the
  Zeppelin team the same airship stays home. Not the Carrier or the Jetpack Trooper.

## Batch 12e: the Bombard, and not the Carrier (`rules/ai.js`, `rules/teams.js`)

Each sailed as a siege pair, as the Cruiser is: the Bombard with a submarine (`Battle Group`), the
Carrier with a Destroyer. Bought from 3200, weight 2. Measured on the 16 battles against a baseline
of batch 12d:

- **Both:** 3 bought in sixteen battles - the fleet cap keeps a house to a few hulls, and the ship
  line rolls among five. The Bombard dealt 15,000 (3.41 of its price); the one Carrier launched 29
  Hornets, all shot down, for 34 damage. The Compact's share fell 0.034 ± 0.011, almost all of it in
  battles where neither was bought: the rolls, not the ships.
- **The Bombard alone:** 2 bought, 1.66 of its price, the Dominion's share +0.018 ± 0.006. Kept.
- **Not the Carrier:** its Hornets fly into the air defence round a base and die there. A Carrier that
  held them back for ships, or a Hornet that turned for home when hit, would be the thing to try.
- The ledger now credits a Hornet's missiles to its Carrier, as it credits a Strike Jet's bombs to
  its Marshal (`tools/selfplay.js`).
- `unit/deep` holds it, in one sandbox: the buy loop rolls a Bombard with a pen and a Lab (74 of 300);
  Battle Group is a candidate while the opponent can build it and not once its Lab is gone; raised,
  it sails the Bombard at the player's buildings (a Construction Yard, 50 s on).

