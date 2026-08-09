/* rules/structures.js - RTS_STRUCTS: every building, its cost, power and prerequisites.
   Part of rts.rules, the roster. */

/* RED ALERT - a rebuild of Command & Conquer: Red Alert for the browser.
   Build a base, mine ore with harvesters, produce units, and fight the opposing army.
   Standalone: the only outside dependency in the whole app is three.js.

   This file is the RULES layer - every balance number lives here, nothing else. The
   structure/unit tables are deliberately data-only so the whole game can be re-tuned by
   editing this one file (the way RULES.INI worked in the classic RTS games).

   Grid: the battlefield is RTS_N x RTS_N tiles of RTS_TILE world units each, centred on
   the origin, so tile (tx,tz) has its centre at ((tx-RTS_N/2+0.5)*RTS_TILE, ...). */

var RTS_TILE = 4;      /* world units per tile */
var RTS_N = 128;       /* DEFINES.H MAP_CELL_W. This was 112, chosen by eye with a comment
                          saying "Red Alert maps run to 128" - so the right number was known and
                          not used. A big map with small
                          buildings on it is a large part of why the original reads the way
                          it does, and why an early pass here looked like a diorama. */

/* The two houses. Colour is fixed - you are always blue and the opponent always red, which is
   what makes a glance at the battlefield readable - but the NAME is not, because which army you
   are is a choice made on the title screen. rtsArmyName answers it; see rtsHouseSide. */
var RTS_SIDES = {
  player: { key:'player', color:0x4a8ff0, glow:0xa8d4ff },
  enemy:  { key:'enemy',  color:0xe0503c, glow:0xffb49f }
};
/* "Allied" / "Soviet" for either house, following the army the player picked. Singular and
   adjectival - "Allied command", "the Soviet base" - which is how Red Alert itself words it. */
function rtsArmyName(house) { return rtsHouseSide(house) === 'soviet' ? 'Soviet' : 'Allied'; }
function rtsArmyTag(house)  { return rtsHouseSide(house) === 'soviet' ? 'SOV' : 'ALD'; }

/* ---------------------------------------------------------------- structures --
   The 3D model for each key is built by _rtsBuild() in rts.buildings.js.
   w,h  : footprint in tiles
   cost : credits
   build: seconds to construct at full power
   power: + supplies, - draws
   needs: structure keys that must already be built and alive
   storage: BDATA.CPP's `Capacity` (RULES.INI `Storage`) - how much HARVESTED scrap this
            building can hold. See rtsCapacity/_rtsHarvested in src/core: ore unloaded
            above the sum of these is spilled on the ground and lost.
   Numbers are ours, but the shape of the tech tree is the classic one:
   power -> refinery/barracks -> factory -> defences. */
var RTS_STRUCTS = [
  { key:'yard',     name:'Command Yard',  w:3, h:3, cost:0,    build:0,  hp:1400, power:0,    sight:16,
    armour:'concrete',
    desc:'The heart of your base. Everything you build must sit near it.' },
  /* `provides` is the prerequisite CLASS this building satisfies, which is not always its own
     key: the Advanced Power Plant is also power, and everything that needs power should take
     either. See _rtsProvides for what went wrong without it. */
  { key:'power',    name:'Power Plant',   w:2, h:2, cost:300,  build:7,  hp:500,  power:100,  sight:10,
    provides:['power'],
    armour:'concrete',
    desc:'Supplies 100 power. Low power slows every production line.' },
  { key:'refinery', name:'Ore Refinery',w:3, h:3, cost:2000, build:18, hp:950,  power:-30,  sight:12,
    needs:['power'], freeUnit:'harvester', storage:2000,
    armour:'concrete',
    desc:'Harvesters unload here, and it stores 2000 of ore. Ships with one free Harvester.' },
  { key:'barracks', name:'Barracks',      w:2, h:2, cost:400,  build:9,  hp:650,  power:-20,  sight:12,
    needs:['power'], produces:'infantry',
    armour:'wood',
    desc:'Trains infantry.' },
  { key:'factory',  name:'War Factory',   w:3, h:2, cost:1600, build:20, hp:900,  power:-30,  sight:12,
    needs:['refinery'], produces:'vehicle',
    armour:'concrete',
    desc:'Builds RC combat vehicles and Harvesters.' },
  { key:'turret',   name:'Gun Turret',    w:1, h:1, cost:500,  build:10, hp:520,  power:-20,  sight:18,
    needs:['barracks'], weapon:'turretgun',
    side:'allied', armour:'concrete',
    desc:'Automated base defence. Needs power to fire.' },
  /* --- the tier the roster was missing. `needs` already gated everything, so these are data. --- */
  { key:'radar',    name:'Radar Dome',    w:2, h:2, cost:1000, build:14, hp:600,  power:-40,  sight:26,
    needs:['refinery'], radar:true,
    armour:'wood',
    desc:'Switches the radar on. Without one the map panel stays dark.' },
  /* Cost, power and prerequisites here are the reference's own: Tech Center $1500 / -200 /
     War Factory + Radar Dome. -200 is two whole power plants, which is the point - the tech
     tier is supposed to cost you an economy, not a line item. */
  { key:'lab',      name:'Tech Center',   w:2, h:2, cost:1500, build:22, hp:600,  power:-200, sight:14,
    needs:['radar', 'factory'],
    armour:'wood',
    desc:'Unlocks Artillery and the Heavy Tank. Draws as much power as two plants.' },
  { key:'rocketpit',name:'Rocket Turret', w:1, h:1, cost:800,  build:14, hp:480,  power:-30,  sight:22,
    needs:['factory'], weapon:'turretrocket',
    side:'soviet', armour:'concrete',
    desc:'Long-range base defence. Tears up armour, poor against infantry.' },
  /* THE ALLIED AA GUN, and the reason it had to arrive with the Soviet air force rather than
     after it. Only two weapons in this game could touch an aircraft - the Rocket Squad's
     launcher, which both armies field, and the Rocket Turret above, which is Soviet - so the
     Allies had no anti-air STRUCTURE at all. That was invisible while the Allies were the only
     side that flew. Priced under the Rocket Turret because it is a specialist that cannot
     shoot back at anything on the ground; 1x2 cells, matching agun.shp's 24x48. */
  { key:'aagun',   name:'AA Gun',       w:1, h:2, cost:600,  build:11, hp:420,  power:-30,  sight:22,
    needs:['radar'], weapon:'flak',
    side:'allied', armour:'concrete',
    desc:'Anti-aircraft only. Cannot fire on ground targets — pair it with a Pillbox.' },
  /* --- defence you can afford early, and the two structures that do something other than
     shoot. `wall` and `pillbox` are pure data; `depot` carries the repair field below. --- */
  /* Concrete Wall $50, no power, no prerequisite - the reference's numbers exactly. It is the
     one thing in the game you can build from the first second of a match. */
  { key:'wall',     name:'Concrete Wall', w:1, h:1, cost:50,   build:2,  hp:400,  power:0,    sight:0,
    wall:true, capturable:false,
    armour:'concrete',
    desc:'A metre of concrete. Blocks movement, absorbs a lot, shoots at nothing.' },
  /* Pillbox $400 / -15 / needs Barracks, again straight from the reference. */
  { key:'pillbox',  name:'Pillbox',      w:1, h:1, cost:400,  build:6,  hp:420,  power:-15,  sight:15,
    needs:['barracks'], weapon:'pillboxgun',
    side:'allied', armour:'concrete',
    desc:'Cheap early defence. Shreds infantry, barely scratches armour.' },
  { key:'depot',    name:'Service Depot',w:2, h:2, cost:1200, build:16, hp:700,  power:-30,  sight:12,
    needs:['factory'], repairs:RTS_TILE * 3.2, repairRate:22,
    armour:'wood',
    desc:'Park damaged vehicles on it and they are patched up, free of charge.' },
  /* Advanced Power Plant $500 / +200 / needs Power Plant. Twice the output for well under
     twice the price and one footprint instead of two - the correct answer once a base is big. */
  { key:'apower',   name:'Adv. Power Plant', w:3, h:2, cost:500, build:11, hp:600, power:200, sight:10,
    needs:['power'], provides:['power'],
    armour:'concrete',
    desc:'Supplies 200 power. Cheaper per unit than two plants, and half the footprint.' },
  /* Kennel $200 / -10 / needs Barracks. It exists to gate the Attack Dog. */
  { key:'kennel',   name:'Kennel',       w:1, h:1, cost:200,  build:5,  hp:400,  power:-10,  sight:10,
    needs:['barracks'],
    side:'soviet', armour:'wood',
    desc:'Trains Attack Dogs.' },
  /* Flame Tower $500 / -20 / needs Barracks, and "damages nearby units and structures if
     destroyed" - which this game already has a mechanism for, so it actually does. */
  /* TESLA COIL. The Soviet answer to a Pillbox, and the reason their base defence reads
     differently from the Allies': it hits far harder than anything else at its price and it
     STOPS WORKING when the power browns out. That second half is the whole design - a Tesla
     wall is only as good as the plants behind it, so killing the power is a real strategy
     rather than an inconvenience. Priced and armed from RULES.INI: 1500, 200 damage, and a
     draw of 100 which is more than any other defence asks for. */
  { key:'tesla',    name:'Tesla Coil',   w:1, h:2, cost:1500, build:20, hp:400,  power:-100, sight:20,
    needs:['radar'], weapon:'teslazap', side:'soviet', needsPower:true,
    armour:'concrete',
    desc:'Devastating, and dead the moment your power browns out. Soviet.' },
  /* ------------------------------------------------------------------ naval --
     Both armies get a shipyard and they are the same building with different names and
     different hulls coming out of it, which is what RA does too: the Naval Yard and the Sub
     Pen have identical stats and differ entirely in what they produce.

     `shore:true` is the placement rule - it must touch water. That is the only structure
     constraint in the game that looks at the terrain rather than at free space, and it is
     what stops a shipyard being planted in the middle of a field with a fleet appearing
     inland. See _rtsShoreOk. */
  /* `produces` is not decoration - _rtsBuildRate counts the buildings carrying it to work out
     the multi-shipyard speedup, so a yard without it was one you could build twice for no
     gain. The same omission left the Helipad out; test/unit/rules.test.js now asserts that
     every unit kind has a building claiming to produce it. */
  /* Both yards `provide` the same capability, which is how one Transport entry can be built by
     both armies off `needs:['shipyard']` without there being a structure called a shipyard.
     This is the case _rtsNeedName was written for: nothing is keyed `shipyard`, so a player
     without one is told "Needs Naval Yard or Sub Pen first". */
  { key:'navalyard',name:'Naval Yard',  w:3, h:3, cost:1000, build:14, hp:600,  power:-30, sight:12,
    needs:['refinery'], side:'allied', shore:true, produces:'ship', provides:['shipyard'],
    armour:'wood',
    desc:'Builds ships. Must be placed against water. Allied.' },
  { key:'subpen',   name:'Sub Pen',     w:3, h:3, cost:1000, build:14, hp:600,  power:-30, sight:12,
    needs:['refinery'], side:'soviet', shore:true, produces:'ship', provides:['shipyard'],
    armour:'wood',
    desc:'Builds submarines. Must be placed against water. Soviet.' },
  { key:'flametower',name:'Flame Tower', w:1, h:1, cost:500,  build:11, hp:450,  power:-20,  sight:16,
    needs:['barracks'], weapon:'towerflame', deathBlast:{ dmg:70, radius:RTS_TILE * 2.6 },
    side:'soviet', armour:'concrete',
    desc:'Burns anything that comes close. Goes up in a fireball when it dies.' },
  /* BDATA.CPP's STRUCT_STORAGE. The silo does nothing but hold scrap - no power to speak of,
     no weapon, no prerequisite past the refinery that fills it - and it is the cheapest
     structure in the game that pays for itself, because without one every credit your
     harvesters bring back above your capacity is thrown away at the dock. */
  /* Zero power draw, and that number is MEASURED rather than chosen. At -10 each, the dozen
     silos an overflowing opponent builds drew 130 power, browned its whole base out and cost
     it enough production that the player lived 81 seconds longer on one seed. A storage tank
     is passive; giving it an appetite turned the storage cap into an accidental nerf. */
  /* Helipad. Produces helicopters and rearms them - AIRCRAFT.CPP sends an aircraft with no
     ammo back to one, and if there is no airfield available "it has to crash", which is
     implemented rather than softened. */
  { key:'helipad',  name:'Helipad',      w:2, h:2, cost:1500, build:14, hp:500,  power:-10,  sight:10,
    needs:['radar'], produces:'air', rearm:true,
    side:'allied', armour:'concrete',
    desc:'Builds and rearms helicopters. Without one, an aircraft out of ammo goes down.' },
  /* The Soviet Airfield. Same job as the Helipad on the other side of the war - AIRCRAFT.CPP
     does not care which kind of pad an aircraft rearms at, and neither does _rtsRearmPad - so
     this is the Helipad's counterpart rather than a new mechanism. It is bigger (3x2, matching
     afld.shp's 72x48) and cheaper, because a runway takes more room than a helipad and because
     the aircraft it flies are cheaper and shorter-legged than the Attack Heli. */
  { key:'afld',     name:'Airfield',     w:3, h:2, cost:1200, build:13, hp:600,  power:-20,  sight:10,
    needs:['radar'], produces:'air', rearm:true,
    side:'soviet', armour:'concrete',
    desc:'Builds and rearms MiGs and Yaks. An aircraft with no airfield left has nowhere to land.' },
  { key:'silo',     name:'Ore Silo',   w:2, h:2, cost:150,  build:5,  hp:400,  power:0,    sight:8,
    needs:['refinery'], storage:1500, capturable:false,
    armour:'wood',
    desc:'Holds 1500 more ore. Without enough storage, harvested ore over the cap is lost.' },

  /* ------------------------------------------------------------ superweapons --
     Four buildings whose entire output is one button on a timer. They share a shape: a `super`
     block naming the charge, what it wants clicked, and what it does when it goes off.

     The charges are RA's proportions, not RA's numbers. The original runs 8-13 minutes, on
     matches that run an hour; this game's matches are measured in minutes, so a charge nobody
     ever sees is the same as no feature. They are scaled to arrive in the back half of a long
     game and never in a short one - which is also what keeps them out of the ladder, where an
     idle player is dead well before the first one is ready.

     Each is gated on the Tech Center, so getting one costs the -200 power the tier already
     charges, and each is faction-locked to the side that had it. */
  { key:'mslo',     name:'Missile Silo',  w:2, h:2, cost:1750, build:24, hp:400,  power:-150, sight:12,
    needs:['lab'], side:'soviet', armour:'concrete', capturable:false,
    super:{ key:'nuke', name:'Atom Bomb', charge:300, target:'cell', icon:'☢',
            hint:'Atom Bomb ready — click anywhere on the map.' },
    /* This said "levels everything within four tiles", which the blast does not do and cannot:
       damage falls as 1/steps through the shared splash curve, so a thing four tiles out takes
       100 of RTS_NUKE_DAMAGE's 1000 and the cheapest structure in the game has 400 hit points.
       Measured on a real base: a direct hit took an enemy Construction Yard 1400 -> 400, and a
       Power Plant 4.3 tiles away lost 91 of 500. What it actually is, is an infantry-clearer
       with a heavy centre - so that is what it now says. Whether it SHOULD hit harder for a
       2000-credit building behind the tech tier and a five-minute charge is a balance question,
       and one the ladder cannot answer: measured over three hard seeds, the opponent never
       builds a superweapon building at all before the match ends. */
    desc:'Charges an atomic missile. A direct hit guts a building; out to four tiles the blast kills infantry and damages everything else.' },
  { key:'iron',     name:'Iron Curtain',  w:2, h:2, cost:1500, build:22, hp:400,  power:-200, sight:12,
    needs:['lab'], side:'soviet', armour:'concrete', capturable:false,
    super:{ key:'ironcurtain', name:'Iron Curtain', charge:270, target:'own', icon:'🛡',
            hint:'Iron Curtain ready — click one of your own units or buildings.' },
    desc:'Makes what you point it at invulnerable for half a minute. Everything near it too.' },
  { key:'pdox',     name:'Chronosphere',  w:2, h:2, cost:1750, build:24, hp:400,  power:-200, sight:12,
    needs:['lab'], side:'allied', armour:'concrete', capturable:false,
    super:{ key:'chrono', name:'Chronosphere', charge:270, target:'cell', icon:'⌛',
            hint:'Chronosphere ready — select units, then click where to send them.' },
    desc:'Teleports your selected units anywhere on the map. Select first, then aim.' },
  /* GPS fires itself. In the original the satellite launches the moment it is paid for and the
     map simply stays revealed - there is nothing to aim and no reason to hold it back, so
     making the player click a button to accept a gift would be ceremony rather than a decision. */
  { key:'gps',      name:'GPS Uplink',    w:2, h:2, cost:1000, build:18, hp:400,  power:-100, sight:12,
    needs:['lab'], side:'allied', armour:'concrete', capturable:false,
    super:{ key:'gps', name:'GPS Satellite', charge:200, target:'none', auto:true, icon:'🛰',
            hint:'GPS satellite up — the whole map is on the radar.' },
    desc:'Launches a satellite. Once it is up the entire map is revealed, permanently.' }
];

